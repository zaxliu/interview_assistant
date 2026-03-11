import type { ParsedTitle } from '@/types';

/**
 * Parse interview event title
 * Format: 面试安排：{candidate_name}({position}) or 面试安排：{candidate_name}(【{team}】{position})
 * Examples:
 * - 面试安排：薛天奕(大模型推理加速实习生) - without team
 * - 面试安排：孟庆春(【平台】大模型推理专家) - with team
 */
export const parseEventTitle = (title: string): ParsedTitle | null => {
  if (!title) return null;

  console.log('Parsing title:', title);

  // Must start with 面试安排
  if (!title.startsWith('面试安排')) {
    return null;
  }

  // Support both Chinese （） and regular () parentheses
  // Try format with team in brackets: 面试安排：孟庆春(【平台】大模型推理专家)
  const withTeamRegex = /^面试安排[：:]\s*(.+?)[(（]【(.+?)】(.+?)[)）]$/;
  const withTeamMatch = title.match(withTeamRegex);

  if (withTeamMatch) {
    console.log('Matched with team:', withTeamMatch);
    return {
      candidateName: withTeamMatch[1].trim(),
      team: withTeamMatch[2].trim(),
      position: withTeamMatch[3].trim(),
    };
  }

  // Try format without team: 面试安排：薛天奕(大模型推理加速实习生)
  const withoutTeamRegex = /^面试安排[：:]\s*(.+?)[(（](.+?)[)）]$/;
  const withoutTeamMatch = title.match(withoutTeamRegex);

  if (withoutTeamMatch) {
    console.log('Matched without team:', withoutTeamMatch);
    return {
      candidateName: withoutTeamMatch[1].trim(),
      team: '',
      position: withoutTeamMatch[2].trim(),
    };
  }

  console.log('No match for title:', title);
  return null;
};

/**
 * Check if a title matches the interview pattern
 */
export const isInterviewEvent = (title: string): boolean => {
  return title.startsWith('面试安排') || title.startsWith('面试安排:');
};

/**
 * Extract links from event description
 */
export const extractLinksFromDescription = (description: string | undefined): {
  resumeLinks: string[];
  jdLinks: string[];
  interviewLink?: string;
  candidateLink?: string;
  otherLinks: string[];
} => {
  if (!description) {
    return { resumeLinks: [], jdLinks: [], otherLinks: [] };
  }

  const urlRegex = /(https?:\/\/[^\s<>"{}|\\^`[\]]+)/g;
  const allUrls = description.match(urlRegex) || [];

  const isFeishuMeetingUrl = (url: string): boolean => {
    try {
      const { hostname, pathname } = new URL(url);
      return (
        hostname === 'vc.feishu.cn' ||
        hostname === 'meet.feishu.cn' ||
        pathname.includes('/vc/') ||
        pathname.includes('/j/')
      );
    } catch {
      return false;
    }
  };

  const extractLabeledUrl = (labels: string[]): string | undefined => {
    for (const label of labels) {
      const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = new RegExp(
        `${escapedLabel}[：:]\\s*(https?:\\/\\/.*?)(?=(?:候选人链接|视频面试链接\\/会议号|视频面试链接|面试链接|会议号|简历链接|JD链接|JD:|$))`
      );
      const match = description.match(pattern);
      if (match?.[1]) {
        return match[1];
      }
    }
    return undefined;
  };

  const interviewLink =
    extractLabeledUrl(['视频面试链接/会议号', '视频面试链接', '面试链接', '会议号']) ||
    allUrls.find((url) => isFeishuMeetingUrl(url));
  const candidateLink =
    extractLabeledUrl(['候选人链接']) ||
    allUrls.find((url) => {
      const lowerUrl = url.toLowerCase();
      return lowerUrl.includes('wintalent.cn') || lowerUrl.includes('candidate');
    });
  const matches = allUrls.filter((url) => {
    if (interviewLink && url.includes(interviewLink)) {
      return false;
    }
    if (candidateLink && url.includes(candidateLink)) {
      return false;
    }
    return true;
  });

  const resumeLinks: string[] = [];
  const jdLinks: string[] = [];
  const otherLinks: string[] = [];

  matches.forEach((url) => {
    const lowerUrl = url.toLowerCase();

    const matchIndex = description.indexOf(url);
    const contextStart = Math.max(0, matchIndex - 24);
    const context = description.slice(contextStart, matchIndex).toLowerCase();

    if (lowerUrl.includes('resume') || context.includes('简历') || lowerUrl.includes('.pdf')) {
      resumeLinks.push(url);
    } else if (lowerUrl.includes('jd') || lowerUrl.includes('job') || lowerUrl.includes('职位')) {
      jdLinks.push(url);
    } else {
      otherLinks.push(url);
    }
  });

  return { resumeLinks, jdLinks, interviewLink, candidateLink, otherLinks };
};
