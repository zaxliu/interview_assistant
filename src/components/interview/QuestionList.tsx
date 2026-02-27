import React, { useState } from 'react';
import type { Question, QuestionSource } from '@/types';
import { QuestionCard } from './QuestionCard';
import { usePositionStore } from '@/store/positionStore';

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
  const { insertQuestion } = usePositionStore();
  const [newQuestionId, setNewQuestionId] = useState<string | null>(null);

  const handleInsertQuestion = (index: number) => {
    // Use the source of the previous question to keep the new question in the same group
    const previousQuestion = questions[index - 1];
    const source = previousQuestion?.source || previousQuestion?.category || 'common';

    const id = insertQuestion(positionId, candidateId, index, {
      text: '',
      source: source as QuestionSource,
      isAIGenerated: false,
      status: 'not_reached',
    });
    setNewQuestionId(id);
  };

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

  // Render insert button between questions
  const renderInsertButton = (index: number) => (
    <button
      className="w-full flex items-center justify-center py-1 opacity-0 hover:opacity-100 focus:opacity-100 transition-opacity group"
      onClick={() => handleInsertQuestion(index)}
      title="Add question here"
    >
      <span className="flex items-center gap-1 text-xs text-gray-400 group-hover:text-blue-500 group-focus:text-blue-500">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
      </span>
    </button>
  );

  // Track global index across all groups
  let globalIdx = 0;

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
            <div className="space-y-0">
              {sourceQuestions.map((question) => {
                const currentGlobalIdx = globalIdx++;

                return (
                  <React.Fragment key={question.id}>
                    {currentGlobalIdx > 0 && renderInsertButton(currentGlobalIdx)}
                    <div className="py-1">
                      <QuestionCard
                        positionId={positionId}
                        candidateId={candidateId}
                        question={question}
                        onClick={() => onQuestionClick?.(question.id)}
                        isActive={question.id === activeQuestionId}
                        autoEdit={question.id === newQuestionId}
                      />
                    </div>
                  </React.Fragment>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
};
