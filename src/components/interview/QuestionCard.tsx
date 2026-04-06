import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { Question, EvaluationDimensionName } from '@/types';
import { usePositionStore } from '@/store/positionStore';
import { Card, CardBody, Textarea, Button } from '@/components/ui';
import { zhCN as t } from '@/i18n/zhCN';

interface QuestionCardProps {
  positionId: string;
  candidateId: string;
  question: Question;
  onClick?: () => void;
  isActive?: boolean;
  autoEdit?: boolean;
}

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
  autoEdit,
}) => {
  const { updateQuestion, deleteQuestion, recordFeedbackEvent } = usePositionStore();
  const [isEditing, setIsEditing] = useState(false);
  const [isDeleteConfirming, setIsDeleteConfirming] = useState(false);
  const [editText, setEditText] = useState(question.text);
  const [notesDraft, setNotesDraft] = useState(question.notes || '');
  const editInputRef = useRef<HTMLTextAreaElement>(null);
  const notesSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setEditText(question.text);
  }, [question.text]);

  useEffect(() => {
    setNotesDraft(question.notes || '');
  }, [question.id, question.notes]);

  useEffect(() => {
    setIsDeleteConfirming(false);
  }, [question.id]);

  useEffect(() => {
    if (isEditing && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [isEditing]);

  // Auto-enter edit mode when autoEdit prop is true
  useEffect(() => {
    if (autoEdit && !isEditing) {
      setEditText(question.text);
      setIsEditing(true);
    }
  }, [autoEdit, isEditing, question.text]);

  const handleStartEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditText(question.text);
    setIsEditing(true);
  };

  const handleSaveEdit = () => {
    if (editText.trim() && editText.trim() !== question.text) {
      updateQuestion(positionId, candidateId, question.id, { text: editText.trim() });
      if (question.isAIGenerated) {
        recordFeedbackEvent(positionId, {
          type: 'question_edited',
          candidateId,
          questionId: question.id,
          details: {
            editPattern: editText.trim().length < question.text.length ? '缩短题干' : '扩展题干',
          },
        });
      }
    }
    setIsEditing(false);
  };

  const handleCancelEdit = () => {
    setEditText(question.text);
    setIsEditing(false);
  };

  const handleEditKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSaveEdit();
    } else if (e.key === 'Escape') {
      handleCancelEdit();
    }
  };

  const persistNotes = useCallback((notes: string) => {
    updateQuestion(positionId, candidateId, question.id, { notes });
  }, [candidateId, positionId, question.id, updateQuestion]);

  useEffect(() => {
    if (notesSaveTimerRef.current) {
      clearTimeout(notesSaveTimerRef.current);
    }

    if (notesDraft === (question.notes || '')) {
      return;
    }

    notesSaveTimerRef.current = setTimeout(() => {
      persistNotes(notesDraft);
    }, 250);

    return () => {
      if (notesSaveTimerRef.current) {
        clearTimeout(notesSaveTimerRef.current);
      }
    };
  }, [notesDraft, persistNotes, question.notes]);

  const handleNotesChange = (notes: string) => {
    if (notes.trim() && question.status === 'not_reached') {
      updateQuestion(positionId, candidateId, question.id, { status: 'asked' });
      if (question.isAIGenerated) {
        recordFeedbackEvent(positionId, {
          type: 'question_asked',
          candidateId,
          questionId: question.id,
          details: {
            source: question.source,
            evaluationDimension: question.evaluationDimension || '',
          },
        });
      }
    }
    setNotesDraft(notes);
  };

  const handleStatusToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    // Cycle: not_reached → asked → skipped → not_reached
    const nextStatus = question.status === 'asked' ? 'skipped' :
                       question.status === 'skipped' ? 'not_reached' : 'asked';
    updateQuestion(positionId, candidateId, question.id, {
      status: nextStatus as 'asked' | 'skipped' | 'not_reached'
    });
    if (question.isAIGenerated && nextStatus === 'asked') {
      recordFeedbackEvent(positionId, {
        type: 'question_asked',
        candidateId,
        questionId: question.id,
        details: {
          source: question.source,
          evaluationDimension: question.evaluationDimension || '',
        },
      });
    }
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isDeleteConfirming) {
      setIsDeleteConfirming(true);
      return;
    }

    if (question.isAIGenerated) {
      recordFeedbackEvent(positionId, {
        type: 'question_deleted',
        candidateId,
        questionId: question.id,
        details: {
          source: question.source,
          evaluationDimension: question.evaluationDimension || '',
        },
      });
    }
    deleteQuestion(positionId, candidateId, question.id);
    setIsDeleteConfirming(false);
  };

  const statusConfig = {
    asked: { bg: 'bg-green-100 text-green-700 hover:bg-green-200', icon: '✓', label: t.questionStatus.asked },
    skipped: { bg: 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200', icon: '○', label: t.questionStatus.skipped },
    not_reached: { bg: 'bg-gray-100 text-gray-500 hover:bg-gray-200', icon: '—', label: t.questionStatus.not_reached },
  };

  const currentStatus = statusConfig[question.status || 'not_reached'];
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

            {/* Status badge - clickable to toggle */}
            <button
              onMouseDown={(e) => e.preventDefault()}
              onClick={handleStatusToggle}
              className={`text-xs px-1.5 py-0.5 rounded transition-colors ${currentStatus.bg}`}
              title={`${currentStatus.label}（点击切换）`}
            >
              {currentStatus.icon}
            </button>
          </div>

          <div className="flex items-center gap-1">
            {/* Edit button */}
            {!isEditing && (
              <Button
                variant="ghost"
                size="sm"
                className="text-gray-400 hover:text-blue-500"
                onClick={handleStartEdit}
                title="编辑问题"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              className={isDeleteConfirming ? 'text-red-600 hover:text-red-700' : 'text-gray-400 hover:text-red-500'}
              onClick={handleDelete}
              title={isDeleteConfirming ? '确认删除问题' : '删除问题'}
              aria-label={isDeleteConfirming ? '确认删除问题' : '删除问题'}
            >
              {isDeleteConfirming ? (
                '确认'
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              )}
            </Button>
          </div>
        </div>

        {/* Question text - editable */}
        {isEditing ? (
          <div className="mb-2" onClick={(e) => e.stopPropagation()}>
            <textarea
              ref={editInputRef}
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              onKeyDown={handleEditKeyDown}
              onBlur={handleSaveEdit}
              className="w-full text-sm font-medium text-gray-900 border border-blue-300 rounded p-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              rows={2}
              onClick={(e) => e.stopPropagation()}
            />
            <div className="flex gap-1 mt-1">
              <Button
                size="sm"
                onMouseDown={(e) => e.preventDefault()}
                onClick={(e) => {
                  e.stopPropagation();
                  handleSaveEdit();
                }}
              >
                {t.common.save}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onMouseDown={(e) => e.preventDefault()}
                onClick={(e) => {
                  e.stopPropagation();
                  handleCancelEdit();
                }}
              >
                {t.common.cancel}
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-sm font-medium text-gray-900 mb-2">{question.text}</p>
        )}

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

        {question.historicalReviewSummary && (
          <div className="mb-2 rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
            <span className="font-medium">历史面评：</span>
            <span className="ml-1">{question.historicalReviewSummary}</span>
          </div>
        )}

        <Textarea
          placeholder={question.status === 'skipped' ? '已跳过' : '在这里记录面试过程中的回答与观察...'}
          value={notesDraft}
          onChange={(e) => handleNotesChange(e.target.value)}
          autoResize
          className="text-sm"
          disabled={question.status === 'skipped'}
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onBlur={() => {
            if (notesDraft !== (question.notes || '')) {
              persistNotes(notesDraft);
            }
          }}
        />
      </CardBody>
    </Card>
  );
};
