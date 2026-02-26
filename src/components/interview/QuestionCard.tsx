import React from 'react';
import type { Question, EvaluationDimensionName } from '@/types';
import { usePositionStore } from '@/store/positionStore';
import { Card, CardBody, Textarea, Button, Select } from '@/components/ui';

interface QuestionCardProps {
  positionId: string;
  candidateId: string;
  question: Question;
  onClick?: () => void;
  isActive?: boolean;
}

const statusOptions = [
  { value: 'asked', label: 'Asked' },
  { value: 'skipped', label: 'Skipped' },
  { value: 'not_reached', label: 'Not Reached' },
];

// Evaluation dimension colors
const dimensionColors: Record<EvaluationDimensionName, string> = {
  '专业能力': 'bg-blue-50 text-blue-700 border-blue-200',
  '通用素质': 'bg-cyan-50 text-cyan-700 border-cyan-200',
  '适配度': 'bg-green-50 text-green-700 border-green-200',
  '管理能力': 'bg-purple-50 text-purple-700 border-purple-200',
};

export const QuestionCard: React.FC<QuestionCardProps> = ({
  positionId,
  candidateId,
  question,
  onClick,
  isActive,
}) => {
  const { updateQuestion, deleteQuestion } = usePositionStore();

  const handleNotesChange = (notes: string) => {
    updateQuestion(positionId, candidateId, question.id, { notes });
  };

  const handleStatusChange = (status: string) => {
    updateQuestion(positionId, candidateId, question.id, {
      status: status as 'asked' | 'skipped' | 'not_reached'
    });
  };

  const handleDelete = () => {
    if (confirm('Delete this question?')) {
      deleteQuestion(positionId, candidateId, question.id);
    }
  };

  const statusColors = {
    asked: 'bg-green-100 text-green-700',
    skipped: 'bg-yellow-100 text-yellow-700',
    not_reached: 'bg-gray-100 text-gray-500',
  };

  // Get evaluation dimension from question
  const evaluationDimension = question.evaluationDimension;

  return (
    <Card className={`cursor-pointer ${isActive ? 'ring-2 ring-blue-300' : ''}`} onClick={onClick}>
      <CardBody className="py-3">
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center gap-2 flex-wrap">
            {/* AI/You badge */}
            <span
              className={`text-xs px-1.5 py-0.5 rounded ${
                question.isAIGenerated
                  ? 'bg-purple-100 text-purple-700'
                  : 'bg-blue-100 text-blue-700'
              }`}
            >
              {question.isAIGenerated ? 'AI' : 'YOU'}
            </span>

            {/* Evaluation dimension tag */}
            {evaluationDimension && (
              <span className={`text-xs px-1.5 py-0.5 rounded border ${dimensionColors[evaluationDimension] || 'bg-gray-50 text-gray-600 border-gray-200'}`}>
                {evaluationDimension}
              </span>
            )}

            {/* Status badge */}
            <span className={`text-xs px-1.5 py-0.5 rounded ${statusColors[question.status || 'not_reached']}`}>
              {question.status === 'asked' ? '✓' : question.status === 'skipped' ? '○' : '—'}
            </span>
          </div>

          <Button
            variant="ghost"
            size="sm"
            className="text-gray-400 hover:text-red-500"
            onClick={handleDelete}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </Button>
        </div>

        <p className="text-sm font-medium text-gray-900 mb-2">{question.text}</p>

        {/* Context from resume/JD */}
        {question.context && (
          <div
            className={`text-xs p-2 mb-2 rounded border ${
              question.source === 'resume'
                ? 'bg-blue-50 border-blue-200 text-blue-700'
                : 'bg-purple-50 border-purple-200 text-purple-700'
            }`}
          >
            <div className="flex items-start gap-1">
              <span className="shrink-0">📄</span>
              <div>
                <span className="font-medium">
                  {question.source === 'resume' ? '简历原文:' : 'JD原文:'}
                </span>
                <span className="ml-1 italic">"{question.context}"</span>
              </div>
            </div>
          </div>
        )}

        {/* Status selector */}
        <div className="mb-2">
          <Select
            value={question.status || 'not_reached'}
            onChange={(e) => handleStatusChange(e.target.value)}
            options={statusOptions}
            className="text-xs"
          />
        </div>

        <Textarea
          placeholder="Take notes here during the interview..."
          value={question.notes || ''}
          onChange={(e) => handleNotesChange(e.target.value)}
          rows={3}
          className="text-sm"
          disabled={question.status !== 'asked'}
        />
      </CardBody>
    </Card>
  );
};
