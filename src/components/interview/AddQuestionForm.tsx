import React, { useState } from 'react';
import type { QuestionSource, EvaluationDimensionName } from '@/types';
import { usePositionStore } from '@/store/positionStore';
import { Button, Select, Textarea } from '@/components/ui';

interface AddQuestionFormProps {
  positionId: string;
  candidateId: string;
}

const sourceOptions = [
  { value: 'resume', label: '📄 From Resume' },
  { value: 'jd', label: '📋 From Job Description' },
  { value: 'common', label: '💡 Common / Behavioral' },
  { value: 'coding', label: '💻 Coding / Technical' },
];

const evaluationDimensionOptions = [
  { value: '专业能力', label: '专业能力 (专业知识、专业技能的掌握和应用能力)' },
  { value: '通用素质', label: '通用素质 (学习能力、攻坚精神、沟通协作能力、客户意识)' },
  { value: '适配度', label: '适配度 (企业文化适应性、稳定性、意愿度)' },
  { value: '管理能力', label: '管理能力 (团队管理能力、战略眼光、推动执行力、大局观)' },
];

export const AddQuestionForm: React.FC<AddQuestionFormProps> = ({
  positionId,
  candidateId,
}) => {
  const { addQuestion } = usePositionStore();
  const [isOpen, setIsOpen] = useState(false);
  const [text, setText] = useState('');
  const [source, setSource] = useState<QuestionSource>('common');
  const [evaluationDimension, setEvaluationDimension] = useState<EvaluationDimensionName>('专业能力');

  const handleSubmit = () => {
    if (text.trim()) {
      addQuestion(positionId, candidateId, {
        text: text.trim(),
        source,
        evaluationDimension,
        category: source, // Keep for backward compatibility
        isAIGenerated: false,
        notes: '',
        status: 'not_reached',
      });
      setText('');
      setSource('common');
      setEvaluationDimension('专业能力');
      setIsOpen(false);
    }
  };

  if (!isOpen) {
    return (
      <Button variant="secondary" onClick={() => setIsOpen(true)}>
        <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
        Add Custom Question
      </Button>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl p-4 w-full max-w-md mx-4">
        <h3 className="text-sm font-medium text-gray-900 mb-3">Add Custom Question</h3>

        <div className="space-y-3">
          <Select
            label="Source"
            value={source}
            onChange={(e) => setSource(e.target.value as QuestionSource)}
            options={sourceOptions}
          />

          <Select
            label="Evaluation Dimension"
            value={evaluationDimension}
            onChange={(e) => setEvaluationDimension(e.target.value as EvaluationDimensionName)}
            options={evaluationDimensionOptions}
          />

          <Textarea
            label="Question"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Enter your question..."
            rows={3}
            autoFocus
          />
        </div>

        <div className="flex justify-end gap-2 mt-4">
          <Button variant="secondary" onClick={() => setIsOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!text.trim()}>
            Add Question
          </Button>
        </div>
      </div>
    </div>
  );
};
