import type {
  Question,
  InterviewResult,
  CodingChallenge,
  QuestionSource,
  EvaluationDimensionName,
  ResumeHighlights,
  AIUsage,
  HistoricalInterviewReview,
} from '@/types';
import { emptyResumeHighlights, normalizeMarkdownText, sanitizeResumeHighlights } from '@/utils/resume';

interface AIServiceConfig {
  apiKey: string;
  model: string;
  // baseUrl removed - now uses server proxy
}

interface ResumeProcessingResult {
  markdown: string;
  highlights: ResumeHighlights;
}

class ResumeProcessingError extends Error {
  shouldFallbackToRawText: boolean;

  constructor(message: string, shouldFallbackToRawText: boolean = false) {
    super(message);
    this.name = 'ResumeProcessingError';
    this.shouldFallbackToRawText = shouldFallbackToRawText;
  }
}

export interface AIResultWithUsage<T> {
  data: T;
  usage?: AIUsage;
}

export interface ExtractedMatchedAnswer {
  questionId: string;
  answer: string;
  evidence?: string;
}

export interface ExtractedNewQA {
  question: string;
  answer: string;
  source: QuestionSource;
  evaluationDimension: EvaluationDimensionName;
}

export interface MeetingNotesExtractionResult {
  matchedAnswers: ExtractedMatchedAnswer[];
  newQAs: ExtractedNewQA[];
}

export interface SummaryRewriteInsight {
  rewriteIntensity: 'low' | 'medium' | 'high';
  preferences: string[];
}

const normalizeQuestionSource = (source?: string): QuestionSource => {
  if (source === 'resume' || source === 'jd' || source === 'coding') {
    return source;
  }
  return 'common';
};

const normalizeEvaluationDimension = (dimension?: string): EvaluationDimensionName => {
  if (dimension === '专业能力' || dimension === '通用素质' || dimension === '适配度' || dimension === '管理能力') {
    return dimension;
  }
  return '专业能力';
};

const extractTextFromMessageContent = (content: unknown): string => {
  if (typeof content === 'string') {
    return content;
  }

  if (!Array.isArray(content)) {
    return '';
  }

  return content
    .map((item) => {
      if (typeof item === 'string') {
        return item;
      }
      if (!item || typeof item !== 'object') {
        return '';
      }

      const part = item as {
        text?: unknown;
        type?: unknown;
      };

      return typeof part.text === 'string' ? part.text : '';
    })
    .filter(Boolean)
    .join('\n');
};

const extractBalancedJsonSnippet = (content: string): string | null => {
  const startIndex = [...content].findIndex((char) => char === '{' || char === '[');
  if (startIndex === -1) {
    return null;
  }

  const openingChar = content[startIndex];
  const closingChar = openingChar === '{' ? '}' : ']';
  let depth = 0;
  let inString = false;
  let isEscaped = false;

  for (let index = startIndex; index < content.length; index += 1) {
    const char = content[index];

    if (isEscaped) {
      isEscaped = false;
      continue;
    }

    if (char === '\\') {
      isEscaped = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (char === openingChar) {
      depth += 1;
    } else if (char === closingChar) {
      depth -= 1;
      if (depth === 0) {
        return content.slice(startIndex, index + 1);
      }
    }
  }

  return null;
};

const extractJsonFromModelContent = (content: string): string => {
  const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    return jsonMatch[1];
  }

  return extractBalancedJsonSnippet(content) || content;
};

const repairJsonStringLiterals = (input: string): string => {
  let output = '';
  let inString = false;
  let hasPendingBackslash = false;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];

    if (inString) {
      if (hasPendingBackslash) {
        if (char === 'u' || '"\\/bfnrt'.includes(char)) {
          output += `\\${char}`;
          hasPendingBackslash = false;
          continue;
        }

        // Keep the backslash as a literal character when the model emits an invalid escape like \#.
        output += `\\\\${char}`;
        hasPendingBackslash = false;
        continue;
      }

      if (char === '\\') {
        hasPendingBackslash = true;
        continue;
      }

      if (char === '"') {
        output += char;
        inString = false;
        continue;
      }

      if (char === '\n') {
        output += '\\n';
        continue;
      }

      if (char === '\r') {
        output += '\\r';
        continue;
      }

      if (char === '\t') {
        output += '\\t';
        continue;
      }

      const codePoint = char.charCodeAt(0);
      if (codePoint < 0x20) {
        output += `\\u${codePoint.toString(16).padStart(4, '0')}`;
        continue;
      }

      output += char;
      continue;
    }

    if (char === '"') {
      inString = true;
    }

    output += char;
  }

  if (hasPendingBackslash) {
    output += '\\\\';
  }

  return output;
};

const parseModelJson = <T>(content: string): T => {
  const extracted = extractJsonFromModelContent(content).trim();

  try {
    return JSON.parse(extracted) as T;
  } catch (initialError) {
    const repaired = repairJsonStringLiterals(extracted);
    try {
      return JSON.parse(repaired) as T;
    } catch {
      throw initialError;
    }
  }
};

const extractCompletionContent = (payload: unknown, fallback: string): string => {
  if (!payload || typeof payload !== 'object') {
    return fallback;
  }

  const choices = (payload as {
    choices?: Array<{
      message?: {
        content?: unknown;
      };
    }>;
  }).choices;
  const firstChoice = Array.isArray(choices) ? choices[0] : undefined;
  const content = extractTextFromMessageContent(firstChoice?.message?.content);

  return content || fallback;
};

const previewDebugText = (content: string, limit: number = 500): string => (
  content.length > limit ? `${content.slice(0, limit)}...` : content
);

const getResumeProcessingErrorMessage = (response: Response, responseText?: string): string => {
  if (response.status === 504) {
    return 'AI 简历整理超时，请重试或更换更快的模型。';
  }

  if (response.status === 408) {
    return 'AI 简历整理请求超时，请重试。';
  }

  const trimmedBody = responseText?.trim();
  if (trimmedBody) {
    try {
      const parsed = JSON.parse(trimmedBody) as { error?: { message?: string } };
      if (parsed.error?.message) {
        return `AI 简历整理失败：${parsed.error.message}`;
      }
    } catch {
      return `AI 简历整理失败：${trimmedBody}`;
    }
  }

  return `AI 简历整理失败：HTTP ${response.status} ${response.statusText}`.trim();
};

interface GeneratedQuestionPayloadItem {
  text?: string;
  source?: string;
  evaluationDimension?: string;
  evaluation_dimension?: string;
  context?: string;
  historicalReviewSummary?: string;
  historical_review_summary?: string;
}

interface GeneratedQuestionDraft {
  text: string;
  source: QuestionSource;
  evaluationDimension: EvaluationDimensionName;
  context: string;
  historicalReviewSummary: string;
}

const MIN_GENERATED_QUESTION_COUNT = 8;
const MAX_GENERATED_QUESTION_COUNT = 12;

const normalizeQuestionTextKey = (text: string): string =>
  text.trim().toLowerCase().replace(/\s+/g, ' ');

const parseGeneratedQuestionDrafts = (content: string): GeneratedQuestionDraft[] => {
  try {
    const parsed = parseModelJson<unknown>(content);
    const items: unknown[] = Array.isArray(parsed)
      ? parsed
      : (
        typeof parsed === 'object' &&
        parsed !== null &&
        Array.isArray((parsed as { questions?: unknown[] }).questions)
      )
        ? (parsed as { questions: unknown[] }).questions
        : [];

    return items
      .map((item) => {
        if (!item || typeof item !== 'object') {
          return null;
        }
        const payload = item as GeneratedQuestionPayloadItem;
        const text = payload.text?.trim() || '';
        if (!text) {
          return null;
        }

        const rawDimension = payload.evaluationDimension || payload.evaluation_dimension;
        return {
          text,
          source: normalizeQuestionSource(payload.source?.trim()),
          evaluationDimension: normalizeEvaluationDimension(rawDimension?.trim()),
          context: payload.context?.trim() || '',
          historicalReviewSummary:
            payload.historicalReviewSummary?.trim() ||
            payload.historical_review_summary?.trim() ||
            '',
        } satisfies GeneratedQuestionDraft;
      })
      .filter((item): item is GeneratedQuestionDraft => Boolean(item));
  } catch (error) {
    console.error('Failed to parse AI response:', content, error);
    return [];
  }
};

const dedupeGeneratedQuestionDrafts = (drafts: GeneratedQuestionDraft[]): GeneratedQuestionDraft[] => {
  const seen = new Set<string>();
  const deduped: GeneratedQuestionDraft[] = [];

  for (const draft of drafts) {
    const key = normalizeQuestionTextKey(draft.text);
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(draft);
    if (deduped.length >= MAX_GENERATED_QUESTION_COUNT) {
      break;
    }
  }

  return deduped;
};

const normalizeUsageValue = (value: unknown): number => (
  typeof value === 'number' && Number.isFinite(value) ? value : 0
);

const extractAIUsage = (payload: unknown): AIUsage | undefined => {
  if (!payload || typeof payload !== 'object') {
    return undefined;
  }

  const usage = (payload as { usage?: unknown }).usage;
  if (!usage || typeof usage !== 'object') {
    return undefined;
  }

  const normalizedUsage = usage as {
    prompt_tokens?: unknown;
    completion_tokens?: unknown;
    input_tokens?: unknown;
    output_tokens?: unknown;
    cached_tokens?: unknown;
    prompt_tokens_details?: { cached_tokens?: unknown };
    input_tokens_details?: { cached_tokens?: unknown };
  };

  const input = normalizeUsageValue(normalizedUsage.input_tokens ?? normalizedUsage.prompt_tokens);
  const cached = normalizeUsageValue(
    normalizedUsage.cached_tokens ??
      normalizedUsage.input_tokens_details?.cached_tokens ??
      normalizedUsage.prompt_tokens_details?.cached_tokens
  );
  const output = normalizeUsageValue(normalizedUsage.output_tokens ?? normalizedUsage.completion_tokens);

  if (!input && !cached && !output) {
    return undefined;
  }

  return { input, cached, output };
};

const mergeAIUsage = (base?: AIUsage, extra?: AIUsage): AIUsage | undefined => {
  if (!base && !extra) {
    return undefined;
  }

  return {
    input: (base?.input || 0) + (extra?.input || 0),
    cached: (base?.cached || 0) + (extra?.cached || 0),
    output: (base?.output || 0) + (extra?.output || 0),
  };
};

const requestAICompletionContent = async (
  config: AIServiceConfig,
  systemPrompt: string,
  userPrompt: string
): Promise<AIResultWithUsage<string>> => {
  const response = await fetch('/api/ai/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.7,
      max_tokens: 2400,
    }),
  });

  if (!response.ok) {
    throw new Error(`AI API 错误：${response.statusText}`);
  }

  const data = await response.json();
  return {
    data: extractCompletionContent(data, '[]'),
    usage: extractAIUsage(data),
  };
};

/**
 * Test AI API key by making a simple request
 */
export const testAIApiKey = async (
  apiKey: string,
  model: string
): Promise<{ success: boolean; message: string }> => {
  try {
    const response = await fetch('/api/ai/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model,
        messages: [
          { role: 'user', content: '如果你能读取这条消息，请回复“OK”。' },
        ],
        max_tokens: 5,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMessage = errorData.error?.message || response.statusText;
      return { success: false, message: `API 错误：${errorMessage}` };
    }

    const data = await response.json();
    const firstChoice = data.choices?.[0];
    const hasAssistantMessage = firstChoice?.message?.role === 'assistant';
    const hasCompletion = typeof firstChoice?.finish_reason === 'string' || hasAssistantMessage;

    if (hasCompletion) {
      return { success: true, message: `连接成功（${model}）` };
    }
    return { success: false, message: 'API 返回结果异常' };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : '连接失败',
    };
  }
};

/**
 * Generate interview questions based on job description and resume
 */
export const generateQuestions = async (
  config: AIServiceConfig,
  jobDescription: string,
  resumeText: string,
  criteria: string[],
  historicalInterviewReviews: HistoricalInterviewReview[] = [],
  guidance?: string
): Promise<AIResultWithUsage<Question[]>> => {
  const criteriaSection = criteria.length > 0
    ? criteria.map((criterion) => `- ${criterion}`).join('\n')
    : '- 未提供额外考核要点';
  const historicalReviewSection = historicalInterviewReviews.length > 0
    ? historicalInterviewReviews
      .map((review, index) => {
        const meta = [
          review.stageName,
          review.interviewer ? `面试官：${review.interviewer}` : null,
          review.interviewTime,
          review.result ? `结果：${review.result}` : null,
        ].filter(Boolean).join(' | ');
        return `${index + 1}. ${meta}\n${review.summary}`;
      })
      .join('\n\n')
    : '无历史面评';

  const guidanceSection = guidance?.trim()
    ? `\n## 岗位历史反馈指引（请优先遵守）\n${guidance.trim()}\n`
    : '';

  const prompt = `你是一位经验丰富的面试官。请根据以下信息生成面试问题。${guidanceSection}

## 职位描述
${jobDescription}

## 候选人简历
${resumeText}

## 增量职位要求
${criteriaSection}

## 历史面评
${historicalReviewSection}

## 评估维度与考核要点

### 1. 专业能力（必填评分）
评分标准：1-5分制，3分为通过线，3分对应M，4分对应M+，5分对应O
考核要点：专业知识、专业技能的掌握和应用能力

### 2. 通用素质（必填评分）
评分标准：1-5分制，3分为通过线
考核要点：学习能力、攻坚精神、沟通协作能力、客户意识

### 3. 适配度（必填评分）
评分标准：1-5分制，3分为通过线
考核要点：企业文化适应性、稳定性、意愿度

### 4. 管理能力（可选，根据岗位需要）
评分标准：1-5分制，3分为通过线
考核要点：团队管理能力、战略眼光、推动执行力、大局观

---

## 问题生成要求

1. 生成8-12个面试问题
2. 每个问题需要标注：
   - **source**: 问题来源
     - "resume" - 基于简历内容（引用简历中的具体经历、项目、技能）
     - "jd" - 基于职位描述（验证候选人是否符合JD要求）
     - "common" - 通用问题（行为面试、软技能评估）
     - "coding" - 编程/技术能力考察
   - **evaluationDimension**: 该问题主要评估哪个维度
     - "专业能力" / "通用素质" / "适配度" / "管理能力"
   - **context**: 如果source是"resume"或"jd"，必须提供简历/JD中与该问题相关的原文片段（用于在PDF中高亮显示），如果是common或coding则留空
   - **historicalReviewSummary**: 如果历史面评已经考察过该主题，简述“是否考察过 + 结果/结论 + 仍需追问点”；如果没有明确历史记录则留空

3. 问题排序：优先按source排序（resume → jd → common → coding），同source内按evaluationDimension排序

4. 确保覆盖"专业能力"、"通用素质"和"适配度"三个必填维度，"管理能力"根据简历判断是否需要

## 返回格式
请以JSON数组格式返回，格式如下：
\`\`\`json
[
  {
    "text": "问题内容",
    "source": "resume/jd/common/coding",
    "evaluationDimension": "专业能力/通用素质/适配度/管理能力",
    "context": "简历或JD中与该问题相关的原文片段（仅resume和jd需要，common和coding留空）",
    "historicalReviewSummary": "历史面评是否考察过，结果如何；没有则留空"
  }
]
\`\`\`

只返回JSON数组，不要包含其他文字。`;
  const questionGenerationSystemPrompt = '你是一位专业的面试官，擅长根据职位需求和候选人背景设计面试问题。请确保返回有效的JSON格式。';
  const firstPassResult = await requestAICompletionContent(config, questionGenerationSystemPrompt, prompt);
  let drafts = parseGeneratedQuestionDrafts(firstPassResult.data);
  let usage = firstPassResult.usage;

  if (drafts.length < MIN_GENERATED_QUESTION_COUNT) {
    const existingQuestionList = drafts.length > 0
      ? drafts.map((item, index) => `${index + 1}. ${item.text}`).join('\n')
      : '（无可用问题）';

    const topUpPrompt = `你刚才生成的问题数量不足（当前 ${drafts.length} 个）。请补齐并返回最终完整列表，要求如下：
- 总数必须为 8-12 个
- 问题不能重复
- 必须覆盖 专业能力 / 通用素质 / 适配度（管理能力按岗位需要）
- 输出格式仍为 JSON 数组，字段与之前完全一致

已有问题：
${existingQuestionList}

请给出补齐后的最终 JSON 数组（可重排）。`;

    const topUpResult = await requestAICompletionContent(config, questionGenerationSystemPrompt, topUpPrompt);
    const topUpDrafts = parseGeneratedQuestionDrafts(topUpResult.data);
    drafts = dedupeGeneratedQuestionDrafts([...drafts, ...topUpDrafts]);
    usage = mergeAIUsage(usage, topUpResult.usage);
  } else {
    drafts = dedupeGeneratedQuestionDrafts(drafts);
  }

  return {
    data: drafts.map((draft, index) => ({
      id: `ai-q-${Date.now()}-${index}`,
      text: draft.text,
      source: draft.source,
      evaluationDimension: draft.evaluationDimension,
      context: draft.context,
      historicalReviewSummary: draft.historicalReviewSummary,
      category: draft.source,
      isAIGenerated: true,
      notes: '',
      status: 'not_reached' as const,
    })),
    usage,
  };
};

export const processResumeText = async (
  config: AIServiceConfig,
  rawText: string
): Promise<AIResultWithUsage<ResumeProcessingResult>> => {
  console.log('[ResumeProcessing] Start', {
    model: config.model,
    rawTextLength: rawText.length,
    rawTextPreview: previewDebugText(rawText, 300),
  });

  const prompts = [
    {
      label: 'full',
      systemPrompt:
        '你擅长把 OCR 提取的简历文本整理成高保真 Markdown。保留原文有效信息，只删除指定干扰语并做格式规范化。务必返回有效 JSON。',
      userPrompt: `你是一位专业招聘助手。请基于下面的简历原始提取文本，完成两件事：

1. 输出规范化后的 Markdown 简历
2. 提取结构化简历要点

约束：
- 只能基于原文整理，不允许补充、猜测或改写事实
- 不要总结、压缩、改写或省略原文中的有效信息，尽量完整保留内容
- 仅允许删除这一句干扰文字（如果出现）：当前简历已流转到其他环节或已被删除，不能查看，已经帮您自动过滤!
- 允许做格式规范化：整理标题层级、列表、空行、错误断行，输出清晰的 Markdown
- 除上述干扰文字和纯格式问题外，不要删除其他文本
- Markdown 要保留清晰层级，适合后续面试问题生成
- highlights 中没有依据的信息必须留空，不要臆造

返回 JSON，格式如下：
\`\`\`json
{
  "markdown": "规范化后的 Markdown",
  "highlights": {
    "summary": "1-2 句候选人概览",
    "strengths": ["候选人优势"],
    "risks": ["潜在风险或待验证点"],
    "experience": ["关键经历/项目/职责"],
    "keywords": ["关键技术/领域关键词"]
  }
}
\`\`\`

只返回 JSON，不要附加解释。

原始简历文本：
${rawText}`,
    },
    {
      label: 'retry-light',
      systemPrompt:
        '你是简历整理助手。请只做必要的 Markdown 结构化和要点提取，必须返回有效 JSON，不要输出解释。',
      userPrompt: `请根据下面的 OCR 简历文本输出 JSON，包含 markdown 和 highlights 两个字段。

要求：
- markdown 只做轻量结构化：标题、列表、空行
- 不要补充原文没有的事实
- highlights 尽量简短：summary 1 句，strengths/risks/experience/keywords 各最多 4 条
- 如果某项没有把握就返回空数组或空字符串
- 只返回 JSON

JSON 格式：
{
  "markdown": "整理后的 Markdown",
  "highlights": {
    "summary": "",
    "strengths": [],
    "risks": [],
    "experience": [],
    "keywords": []
  }
}

OCR 简历文本：
${rawText}`,
    },
  ] as const;

  let lastError: Error | null = null;

  for (let index = 0; index < prompts.length; index += 1) {
    const attempt = prompts[index];

    try {
      console.log('[ResumeProcessing] Request attempt', {
        model: config.model,
        attempt: attempt.label,
      });

      const response = await fetch('/api/ai/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model: config.model,
          messages: [
            {
              role: 'system',
              content: attempt.systemPrompt,
            },
            { role: 'user', content: attempt.userPrompt },
          ],
          temperature: 0.2,
        }),
      });

      if (!response.ok) {
        const responseText = await response.text().catch(() => '');
        const message = getResumeProcessingErrorMessage(response, responseText);
        const error = new ResumeProcessingError(message, index === prompts.length - 1);
        console.warn('[ResumeProcessing] Request failed', {
          model: config.model,
          attempt: attempt.label,
          status: response.status,
          message,
        });
        throw error;
      }

      const data = await response.json();
      const content = extractCompletionContent(data, '{}');
      const usage = extractAIUsage(data);

      console.log('[ResumeProcessing] Model response', {
        model: config.model,
        attempt: attempt.label,
        usage,
        contentLength: content.length,
        contentPreview: previewDebugText(content),
      });

      const parsed = parseModelJson<Partial<ResumeProcessingResult>>(content);
      const normalizedMarkdown = normalizeMarkdownText(parsed.markdown || rawText);
      const sanitizedHighlights = sanitizeResumeHighlights(parsed.highlights) || emptyResumeHighlights();

      console.log('[ResumeProcessing] Parsed result', {
        attempt: attempt.label,
        markdownLength: normalizedMarkdown.length,
        markdownPreview: previewDebugText(normalizedMarkdown, 300),
        highlights: {
          summary: sanitizedHighlights.summary,
          strengthsCount: sanitizedHighlights.strengths.length,
          risksCount: sanitizedHighlights.risks.length,
          experienceCount: sanitizedHighlights.experience.length,
          keywordsCount: sanitizedHighlights.keywords.length,
        },
      });

      return {
        data: {
          markdown: normalizedMarkdown,
          highlights: sanitizedHighlights,
        },
        usage,
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('简历处理失败');
      const isLastAttempt = index === prompts.length - 1;

      if (!isLastAttempt) {
        console.warn('[ResumeProcessing] Retrying with lighter prompt', {
          model: config.model,
          failedAttempt: attempt.label,
          nextAttempt: prompts[index + 1].label,
          message: lastError.message,
        });
        continue;
      }
    }
  }

  if (lastError instanceof ResumeProcessingError) {
    throw lastError;
  }

  throw new ResumeProcessingError(lastError?.message || '简历处理失败');
};

/**
 * Extract answers for existing questions and discover new Q&A from meeting notes.
 */
export const extractMeetingNotesInsights = async (
  config: AIServiceConfig,
  existingQuestions: Question[],
  meetingNotesContent: string
): Promise<AIResultWithUsage<MeetingNotesExtractionResult>> => {
  const normalizedQuestions = existingQuestions.map((question) => ({
    id: question.id,
    text: question.text.trim(),
  }));
  const noteContentForPrompt = meetingNotesContent.length > 20000
    ? `${meetingNotesContent.slice(0, 20000)}\n\n[内容过长，以上为截断后的纪要片段]`
    : meetingNotesContent;

  const prompt = `你是面试助手。你会收到：
1) 已有面试问题列表（包含 question_id）
2) 一份面试纪要正文

请完成两件事：
1. 从纪要中提取对“已有问题”的回答，输出到 matched_answers
2. 如果纪要里出现了值得保留的新增提问，输出到 new_qa。这些新增提问既可以是“现有问题没有覆盖到的新考察角度”，也可以是“对已有问题的补充追问、同义改写或换一种问法”，只要适合作为后续独立提问保留下来

规则：
- matched_answers 里必须引用已有的 question_id
- answer 必须基于纪要原文，不要编造
- evidence 用 1 句短句引用依据（可概述，不要求逐字拷贝）
- 先对比已有问题覆盖的主题、考察点和提问角度；如果纪要里出现了适合沉淀为独立问题的补充追问、同义改写、换一种问法，或明确属于未覆盖的新角度，都可以输出到 new_qa
- 如果某段内容更适合作为已有问题的回答补充，同时又明显形成了一个值得保留的独立提问，可以同时出现在 matched_answers 和 new_qa
- new_qa 里的 question 要写成适合后续继续面试追问的完整问题，而不是纪要原句摘抄
- new_qa 的 source 只能是 resume/jd/common/coding
- new_qa 的 evaluation_dimension 只能是 专业能力/通用素质/适配度/管理能力
- 如果没有内容，对应数组返回空数组

已有问题：
${JSON.stringify(normalizedQuestions, null, 2)}

面试纪要正文：
${noteContentForPrompt}

只返回 JSON，格式如下：
\`\`\`json
{
  "matched_answers": [
    {
      "question_id": "已有问题ID",
      "answer": "提炼后的候选人回答",
      "evidence": "纪要中的依据"
    }
  ],
  "new_qa": [
    {
      "question": "新增问题",
      "answer": "对应回答",
      "source": "common",
      "evaluation_dimension": "专业能力"
    }
  ]
}
\`\`\``;

  const response = await fetch('/api/ai/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages: [
        {
          role: 'system',
          content: '你擅长从面试纪要中提取结构化问答。必须返回严格 JSON。',
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.2,
    }),
  });

  if (!response.ok) {
    throw new Error(`AI API 错误：${response.statusText}`);
  }

  const data = await response.json();
  const content = extractCompletionContent(data, '{}');
  const usage = extractAIUsage(data);

  try {
    const parsedContent = parseModelJson<{
      matched_answers?: Array<{
        question_id?: string;
        answer?: string;
        evidence?: string;
      }>;
      new_qa?: Array<{
        question?: string;
        answer?: string;
        source?: string;
        evaluation_dimension?: string;
      }>;
    }>(content);

    const validQuestionIds = new Set(normalizedQuestions.map((question) => question.id));
    const matchedAnswers: ExtractedMatchedAnswer[] = (parsedContent.matched_answers || [])
      .map((item) => ({
        questionId: item.question_id?.trim() || '',
        answer: item.answer?.trim() || '',
        evidence: item.evidence?.trim(),
      }))
      .filter((item) => item.questionId && item.answer && validQuestionIds.has(item.questionId));

    const newQAs: ExtractedNewQA[] = (parsedContent.new_qa || [])
      .map((item) => ({
        question: item.question?.trim() || '',
        answer: item.answer?.trim() || '',
        source: normalizeQuestionSource(item.source?.trim()),
        evaluationDimension: normalizeEvaluationDimension(item.evaluation_dimension?.trim()),
      }))
      .filter((item) => item.question && item.answer);

    return {
      data: {
        matchedAnswers,
        newQAs,
      },
      usage,
    };
  } catch (error) {
    console.error('Failed to parse meeting notes extraction response:', content, error);
    return {
      data: {
        matchedAnswers: [],
        newQAs: [],
      },
      usage,
    };
  }
};

/**
 * Generate interview summary based on questions and notes
 */
export const generateSummary = async (
  config: AIServiceConfig,
  questions: Question[],
  jobDescription: string,
  resumeText: string,
  candidateName: string,
  positionTitle: string,
  quickNotes?: string,
  meetingNotesContext?: string,
  codingChallenges?: CodingChallenge[],
  guidance?: string
): Promise<AIResultWithUsage<InterviewResult>> => {
  // Only include questions that were actually asked
  const askedQuestions = questions.filter(q => q.status === 'asked');
  const skippedTopics = questions
    .filter(q => q.status !== 'asked')
    .map(q => q.text);

  const questionsWithNotes = askedQuestions
    .map((q) => {
      const sourceTag = q.source ? `[${q.source}]` : '';
      const dimTag = q.evaluationDimension ? `[${q.evaluationDimension}]` : '';
      return `${sourceTag}${dimTag} ${q.text}\n候选人回答/面试官记录：${q.notes || '无记录'}`;
    })
    .join('\n\n');

  const quickNotesSection = quickNotes?.trim()
    ? `\n面试官快速笔记：\n${quickNotes}\n`
    : '';

  const normalizedMeetingNotesContext = meetingNotesContext?.trim();
  const meetingNotesSection = normalizedMeetingNotesContext
    ? `\n会议纪要与原始 Transcript：\n${
        normalizedMeetingNotesContext.length > 20000
          ? `${normalizedMeetingNotesContext.slice(0, 20000)}\n\n[内容过长，以上为截断后的纪要/Transcript片段]`
          : normalizedMeetingNotesContext
      }\n`
    : '';

  // Format coding challenges
  const completedChallenges = codingChallenges?.filter(c => c.result !== 'not_completed') || [];
  const codingChallengesSection = completedChallenges.length > 0
    ? `\n编程挑战：\n${completedChallenges.map((c, i) => {
        const evalParts = [];
        if (c.evaluation?.timeComplexity) evalParts.push(`时间复杂度: ${c.evaluation.timeComplexity}`);
        if (c.evaluation?.codeQuality) evalParts.push(`代码质量: ${c.evaluation.codeQuality}`);
        if (c.evaluation?.communication) evalParts.push(`沟通: ${c.evaluation.communication}`);
        return `${i + 1}. 问题: ${c.problem}\n   结果: ${c.result}\n   ${evalParts.length > 0 ? evalParts.join(', ') : ''}\n   笔记: ${c.solution || '无'}`;
      }).join('\n')}\n`
    : '';

  const guidanceSection = guidance?.trim()
    ? `\n岗位历史反馈指引（请优先遵守）：\n${guidance.trim()}\n`
    : '';

  const prompt = `请根据以下面试记录生成结构化的面试评估结果。${guidanceSection}

## 候选人信息
- 姓名：${candidateName}
- 应聘职位：${positionTitle}

## 职位描述
${jobDescription}

## 候选人简历摘要
${resumeText}

## 面试问答记录
${questionsWithNotes || '（暂无面试记录）'}
${quickNotesSection}${meetingNotesSection}${codingChallengesSection}${skippedTopics.length > 0 ? `\n未覆盖的问题/话题：\n${skippedTopics.map(t => `- ${t}`).join('\n')}` : ''}

---

## 评估维度与评分标准

### 1. 专业能力（必填评分）
- 评分标准：1-5分制
  - 3分：通过线
  - 3分对应 M
  - 4分对应 M+
  - 5分对应 O
- 考核要点：
  - 专业知识
  - 专业技能的掌握和应用能力

### 2. 通用素质（必填评分）
- 评分标准：1-5分制（同上）
- 考核要点：
  - 学习能力
  - 攻坚精神
  - 沟通协作能力
  - 客户意识

### 3. 适配度（必填评分）
- 评分标准：1-5分制（同上）
- 考核要点：
  - 企业文化适应性
  - 稳定性
  - 意愿度

### 4. 管理能力（必填评分）
- 评分标准：1-5分制（同上）
- 考核要点：
  - 团队管理能力
  - 战略眼光
  - 推动执行力
  - 大局观
- 注意： 如果是IC岗位或候选人无管理经验，评分给3分，assessment_points注明"候选人无管理经验/此岗位为IC岗位，未考察管理能力"

---

## 输出要求

1. 对所有4个维度进行评分（1-5分）并撰写详细的评估说明
2. 给出建议职级和综合评分
3. 撰写总评（包括核心优势、明显短板、是否推荐录用)
4. 如果有未覆盖的重要方面，在follow_up_questions中列出
5. **重要**： evaluation_dimensions数组必须包含全部4个维度，即使某些维度未考察也要给出默认评分3分并注明原因

请生成JSON格式的面试结果，严格遵循以下格式：
{
  "interview_info": {
    "interviewer": "面试官姓名",
    "overall_result": "通过/不通过/待定",
    "interview_time": "面试时间（YYYY-MM-DD HH:mm格式）"
  },
  "evaluation_dimensions": [
    {
      "dimension": "专业能力",
      "score": 1-5的评分,
      "assessment_points": "详细的评估说明"
    },
    {
      "dimension": "通用素质",
      "score": 1-5的评分,
      "assessment_points": "详细的评估说明"
    },
    {
      "dimension": "适配度",
      "score": 1-5的评分,
      "assessment_points": "详细的评估说明"
    },
    {
      "dimension": "管理能力",
      "score": 1-5的评分,
      "assessment_points": "详细的评估说明（如未考察请注明原因）"
    }
  ],
  "summary": {
    "suggested_level": "建议定级（如P7、H6、M/M+/O等）",
    "comprehensive_score": 1-5的综合评分,
    "overall_comment": "综合评价（包括核心优势、明显短板、是否推荐录用及原因）",
    "interview_conclusion": "通过/不通过/待定",
    "is_strongly_recommended": true/false
  },
  "additional_info": {
    "strengths": ["优势1", "优势2"],
    "concerns": ["担忧1"],
    "follow_up_questions": ["后续需要跟进的问题或方面"]
  }
}

注意：
- 只返回JSON对象，不要包含其他文字
- 如果候选人有管理经验或应聘管理岗位，请在evaluation_dimensions中添加"管理能力"维度
- evaluation_dimensions中至少包含"专业能力"和"适配度"两个维度`;

  // Use proxy endpoint instead of configurable base URL
  const response = await fetch('/api/ai/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages: [
        { role: 'system', content: '你是一位资深的HR专家，擅长评估面试结果并给出专业的面试评价。请确保返回有效的JSON格式。' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.5,
    }),
  });

  if (!response.ok) {
    throw new Error(`AI API 错误：${response.statusText}`);
  }

  const data = await response.json();
  const content = extractCompletionContent(data, '{}');

  try {
    const result = parseModelJson<InterviewResult>(content);
    return {
      data: result,
      usage: extractAIUsage(data),
    };
  } catch (e) {
    console.error('Failed to parse AI response:', content, e);
    // Return default structure
    return {
      data: {
        interview_info: {
          interviewer: '',
          overall_result: '待定',
          interview_time: new Date().toISOString().slice(0, 16).replace('T', ' '),
        },
        evaluation_dimensions: [
          { dimension: '专业能力', score: 3, assessment_points: '' },
          { dimension: '通用素质', score: 3, assessment_points: '' },
          { dimension: '适配度', score: 3, assessment_points: '' },
          { dimension: '管理能力', score: 3, assessment_points: '' },
        ],
        summary: {
          suggested_level: '',
          comprehensive_score: 3,
          overall_comment: '',
          interview_conclusion: '待定',
          is_strongly_recommended: false,
        },
      },
      usage: extractAIUsage(data),
    };
  }
};

export const analyzeSummaryRewrite = async (
  config: AIServiceConfig,
  generatedSummaryDraft: InterviewResult,
  finalSummary: InterviewResult
): Promise<AIResultWithUsage<SummaryRewriteInsight>> => {
  const prompt = `你是面试评语质量分析助手。请比较 AI 初稿和用户终稿，输出改写偏好。

AI 初稿：
${JSON.stringify(generatedSummaryDraft)}

用户终稿：
${JSON.stringify(finalSummary)}

请输出 JSON：
{
  "rewrite_intensity": "low|medium|high",
  "preferences": ["偏好1","偏好2"]
}

规则：
- rewrite_intensity 表示改写程度
- preferences 提炼用户稳定偏好，最多 6 条
- 只返回 JSON`;

  const response = await requestAICompletionContent(
    config,
    '你擅长比较两版面评并提炼可操作偏好。必须返回严格 JSON。',
    prompt
  );

  try {
    const parsed = parseModelJson<{
      rewrite_intensity?: string;
      preferences?: string[];
    }>(response.data);
    const rewriteIntensity = parsed.rewrite_intensity === 'high' || parsed.rewrite_intensity === 'medium'
      ? parsed.rewrite_intensity
      : 'low';
    const preferences = Array.isArray(parsed.preferences)
      ? parsed.preferences.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 6)
      : [];

    return {
      data: {
        rewriteIntensity,
        preferences,
      },
      usage: response.usage,
    };
  } catch (error) {
    console.error('Failed to parse summary rewrite insight:', response.data, error);
    return {
      data: {
        rewriteIntensity: 'low',
        preferences: [],
      },
      usage: response.usage,
    };
  }
};
