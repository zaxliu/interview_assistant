import type { Question, InterviewResult, CodingChallenge, QuestionSource, EvaluationDimensionName } from '@/types';

interface AIServiceConfig {
  apiKey: string;
  model: string;
  // baseUrl removed - now uses server proxy
}

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
          { role: 'user', content: 'Say "OK" if you can read this.' },
        ],
        max_tokens: 5,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMessage = errorData.error?.message || response.statusText;
      return { success: false, message: `API error: ${errorMessage}` };
    }

    const data = await response.json();
    if (data.choices?.[0]?.message?.content) {
      return { success: true, message: `Connected successfully (${model})` };
    }
    return { success: false, message: 'Unexpected response from API' };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Connection failed',
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
  _criteria: string[]
): Promise<Question[]> => {
  const prompt = `你是一位经验丰富的面试官。请根据以下信息生成面试问题。

## 职位描述
${jobDescription}

## 候选人简历
${resumeText}

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
    "context": "简历或JD中与该问题相关的原文片段（仅resume和jd需要，common和coding留空）"
  }
]
\`\`\`

只返回JSON数组，不要包含其他文字。`;

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
        { role: 'system', content: '你是一位专业的面试官，擅长根据职位需求和候选人背景设计面试问题。请确保返回有效的JSON格式。' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    throw new Error(`AI API error: ${response.statusText}`);
  }

  const data = await response.json();
  const content = data.choices[0]?.message?.content || '[]';

  try {
    // Extract JSON from code block if present
    let jsonContent = content;
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonContent = jsonMatch[1];
    }

    const questions = JSON.parse(jsonContent);
    return questions.map((q: { text: string; source: string; evaluationDimension: string; context?: string }, index: number) => ({
      id: `ai-q-${Date.now()}-${index}`,
      text: q.text,
      source: (q.source || 'common') as QuestionSource,
      evaluationDimension: (q.evaluationDimension || '专业能力') as EvaluationDimensionName,
      context: q.context || '',  // Text from resume/JD that this question is based on
      category: q.source || 'common', // Keep for backward compatibility
      isAIGenerated: true,
      notes: '',
      status: 'not_reached' as const,
    }));
  } catch (e) {
    console.error('Failed to parse AI response:', content, e);
    return [];
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
  codingChallenges?: CodingChallenge[]
): Promise<InterviewResult> => {
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

  const prompt = `请根据以下面试记录生成结构化的面试评估结果。

## 候选人信息
- 姓名：${candidateName}
- 应聘职位：${positionTitle}

## 职位描述
${jobDescription}

## 候选人简历摘要
${resumeText}

## 面试问答记录
${questionsWithNotes || '（暂无面试记录）'}
${quickNotesSection}${codingChallengesSection}${skippedTopics.length > 0 ? `\n未覆盖的问题/话题：\n${skippedTopics.map(t => `- ${t}`).join('\n')}` : ''}

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
    throw new Error(`AI API error: ${response.statusText}`);
  }

  const data = await response.json();
  const content = data.choices[0]?.message?.content || '{}';

  try {
    // Extract JSON from code block if present
    let jsonContent = content;
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonContent = jsonMatch[1];
    }

    const result = JSON.parse(jsonContent);
    return result as InterviewResult;
  } catch (e) {
    console.error('Failed to parse AI response:', content, e);
    // Return default structure
    return {
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
    };
  }
};
