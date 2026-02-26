import React from 'react';
import type { Question, QuestionSource } from '@/types';
import { QuestionCard } from './QuestionCard';

interface QuestionListProps {
  positionId: string;
  candidateId: string;
  questions: Question[];
  onQuestionClick?: (questionId: string) => void;
  activeQuestionId?: string | null;
}

// Source display configuration
const sourceConfig: Record<QuestionSource, { label: string; icon: string; color: string }> = {
  resume: { label: 'From Resume', icon: '📄', color: 'text-blue-600' },
  jd: { label: 'From Job Description', icon: '📋', color: 'text-purple-600' },
  common: { label: 'Common / Behavioral', icon: '💡', color: 'text-amber-600' },
  coding: { label: 'Coding / Technical', icon: '💻', color: 'text-green-600' },
};

// Order for displaying sources
const sourceOrder: QuestionSource[] = ['resume', 'jd', 'common', 'coding'];

export const QuestionList: React.FC<QuestionListProps> = ({
  positionId,
  candidateId,
  questions,
  onQuestionClick,
  activeQuestionId,
}) => {
  if (questions.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500 text-sm">
        No questions yet. Generate from AI or add custom questions.
      </div>
    );
  }

  // Group questions by source
  const groupedQuestions = questions.reduce((acc, question) => {
    const source = question.source || question.category || 'common';
    if (!acc[source]) {
      acc[source] = [];
    }
    acc[source].push(question);
    return acc;
  }, {} as Record<string, Question[]>);

  // Sort sources: known sources first, then others
  const sortedSources = Object.keys(groupedQuestions).sort((a, b) => {
    const aIndex = sourceOrder.indexOf(a as QuestionSource);
    const bIndex = sourceOrder.indexOf(b as QuestionSource);
    if (aIndex === -1 && bIndex === -1) return a.localeCompare(b);
    if (aIndex === -1) return 1;
    if (bIndex === -1) return -1;
    return aIndex - bIndex;
  });

  return (
    <div className="space-y-4">
      {sortedSources.map((source) => {
        const config = sourceConfig[source as QuestionSource] || {
          label: source,
          icon: '📌',
          color: 'text-gray-600',
        };
        const sourceQuestions = groupedQuestions[source];

        return (
          <div key={source}>
            <h4 className={`text-xs font-medium tracking-wide mb-2 flex items-center gap-1 ${config.color}`}>
              <span>{config.icon}</span>
              <span className="uppercase">{config.label}</span>
              <span className="text-gray-400">({sourceQuestions.length})</span>
            </h4>
            <div className="space-y-2">
              {sourceQuestions.map((question) => (
                <QuestionCard
                  key={question.id}
                  positionId={positionId}
                  candidateId={candidateId}
                  question={question}
                  onClick={() => onQuestionClick?.(question.id)}
                  isActive={question.id === activeQuestionId}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
};
