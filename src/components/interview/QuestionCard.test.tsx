import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { QuestionCard } from './QuestionCard';

const updateQuestion = vi.fn();
const deleteQuestion = vi.fn();
const recordFeedbackEvent = vi.fn();

vi.mock('@/store/positionStore', () => ({
  usePositionStore: () => ({
    updateQuestion,
    deleteQuestion,
    recordFeedbackEvent,
  }),
}));

describe('QuestionCard', () => {
  it('requires explicit confirmation before deleting a question', () => {
    render(
      <QuestionCard
        positionId="position-1"
        candidateId="candidate-1"
        question={{
          id: 'question-1',
          text: '请介绍一次系统设计决策',
          status: 'not_reached',
          source: 'ai',
          isAIGenerated: true,
          evaluationDimension: '专业能力',
        }}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '删除问题' }));

    expect(screen.getByRole('button', { name: '确认删除问题' })).toBeInTheDocument();
    expect(deleteQuestion).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '确认删除问题' }));

    expect(recordFeedbackEvent).toHaveBeenCalledWith('position-1', {
      type: 'question_deleted',
      candidateId: 'candidate-1',
      questionId: 'question-1',
      details: {
        source: 'ai',
        evaluationDimension: '专业能力',
      },
    });
    expect(deleteQuestion).toHaveBeenCalledWith('position-1', 'candidate-1', 'question-1');
  });
});
