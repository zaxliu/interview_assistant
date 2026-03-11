import { describe, expect, it } from 'vitest';
import { extractLinksFromDescription, isInterviewEvent, parseEventTitle } from './titleParser';

describe('titleParser', () => {
  it('parses interview titles with team info', () => {
    expect(parseEventTitle('面试安排：孟庆春(【平台】大模型推理专家)')).toEqual({
      candidateName: '孟庆春',
      team: '平台',
      position: '大模型推理专家',
    });
  });

  it('parses interview titles without team info', () => {
    expect(parseEventTitle('面试安排：薛天奕(大模型推理加速实习生)')).toEqual({
      candidateName: '薛天奕',
      team: '',
      position: '大模型推理加速实习生',
    });
  });

  it('rejects non interview events', () => {
    expect(parseEventTitle('周会：平台组')).toBeNull();
    expect(isInterviewEvent('周会：平台组')).toBe(false);
  });

  it('extracts links by type', () => {
    expect(
      extractLinksFromDescription(
        '简历 https://example.com/resume.pdf JD https://example.com/job-desc 其他 https://example.com/meeting'
      )
    ).toEqual({
      resumeLinks: ['https://example.com/resume.pdf'],
      jdLinks: ['https://example.com/job-desc'],
      interviewLink: undefined,
      candidateLink: undefined,
      otherLinks: ['https://example.com/meeting'],
    });
  });

  it('extracts interview and candidate links from compact event descriptions', () => {
    expect(
      extractLinksFromDescription(
        '应聘职位:【平台】AI Agent应用工程师面试方式:视频面试视频面试链接/会议号:https://vc.feishu.cn/j/681359281候选人链接:https://www.wintalent.cn/wt/Horizon/kurl?k=JBV7Rra6N7N3qaRz'
      )
    ).toEqual({
      resumeLinks: [],
      jdLinks: [],
      interviewLink: 'https://vc.feishu.cn/j/681359281',
      candidateLink: 'https://www.wintalent.cn/wt/Horizon/kurl?k=JBV7Rra6N7N3qaRz',
      otherLinks: [],
    });
  });

  it('falls back to Feishu meeting and candidate page urls without labels', () => {
    expect(
      extractLinksFromDescription(
        '资料: https://vc.feishu.cn/j/681359281 页面: https://www.wintalent.cn/wt/Horizon/kurl?k=JBV7Rra6N7N3qaRz'
      )
    ).toEqual({
      resumeLinks: [],
      jdLinks: [],
      interviewLink: 'https://vc.feishu.cn/j/681359281',
      candidateLink: 'https://www.wintalent.cn/wt/Horizon/kurl?k=JBV7Rra6N7N3qaRz',
      otherLinks: [],
    });
  });
});
