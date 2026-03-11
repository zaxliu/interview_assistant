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
  otherLinks: string[];
} => {
  if (!description) {
    return { resumeLinks: [], jdLinks: [], otherLinks: [] };
  }

  const urlRegex = /(https?:\/\/[^\s<>"{}|\\^`[\]]+)/g;
  const matches = description.match(urlRegex) || [];

  const resumeLinks: string[] = [];
  const jdLinks: string[] = [];
  const otherLinks: string[] = [];

  matches.forEach((url) => {
    const lowerUrl = url.toLowerCase();
    if (lowerUrl.includes('resume') || lowerUrl.includes('简历') || lowerUrl.includes('.pdf')) {
      resumeLinks.push(url);
    } else if (lowerUrl.includes('jd') || lowerUrl.includes('job') || lowerUrl.includes('职位')) {
      jdLinks.push(url);
    } else {
      otherLinks.push(url);
    }
  });

  return { resumeLinks, jdLinks, otherLinks };
};
