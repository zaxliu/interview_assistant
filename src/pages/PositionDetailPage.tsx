import { useEffect, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { CandidateList } from '@/components/candidates/CandidateList';
import { Button, Textarea } from '@/components/ui';
import { useAI } from '@/hooks/useAI';
import { usePositionStore } from '@/store/positionStore';
import { getGenerationGuidancePrompt } from '@/lib/generationMemory';
import type { AIUsage } from '@/types';

export default function PositionDetailPage() {
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);
  const [isGuidanceExpanded, setIsGuidanceExpanded] = useState(true);
  const [isQuestionGuidanceExpanded, setIsQuestionGuidanceExpanded] = useState(false);
  const [isSummaryGuidanceExpanded, setIsSummaryGuidanceExpanded] = useState(false);
  const [isRefreshingMemory, setIsRefreshingMemory] = useState(false);
  const [refreshStatus, setRefreshStatus] = useState<string | null>(null);
  const [manualRefreshUsage, setManualRefreshUsage] = useState<{
    question?: AIUsage;
    summary?: AIUsage;
  }>({});
  const navigate = useNavigate();
  const { positionId } = useParams();
  const { refreshGenerationMemory } = useAI();
  const updatePosition = usePositionStore((state) => state.updatePosition);
  const updateCandidate = usePositionStore((state) => state.updateCandidate);
  const position = usePositionStore((state) =>
    positionId ? state.positions.find((item) => item.id === positionId) : undefined
  );
  const shouldClampDescription = (position?.description?.length || 0) > 280;

  const renderUsage = (usage: AIUsage | undefined, label: string) => {
    if (!usage) {
      return null;
    }

    return (
      <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700">
        <span className="font-medium text-slate-800">{label}</span>
        <span className="ml-2">input {usage.input}</span>
        <span className="ml-2">cached {usage.cached}</span>
        <span className="ml-2">output {usage.output}</span>
      </div>
    );
  };

  if (!positionId || !position) {
    return <Navigate to="/404" replace />;
  }

  const questionGuidance = getGenerationGuidancePrompt(position, 'question_generation');
  const summaryGuidance = getGenerationGuidancePrompt(position, 'summary_generation');
  const [questionGuidanceDraft, setQuestionGuidanceDraft] = useState(questionGuidance);
  const [summaryGuidanceDraft, setSummaryGuidanceDraft] = useState(summaryGuidance);
  const isQuestionDirty = position.generationMemoryState?.dirtyScopes.includes('question_generation');
  const isSummaryDirty = position.generationMemoryState?.dirtyScopes.includes('summary_generation');
  const lastQuestionRefreshAt = position.generationMemoryState?.lastQuestionRefreshAt;
  const lastSummaryRefreshAt = position.generationMemoryState?.lastSummaryRefreshAt;
  const pendingQuestionEventCount = position.generationMemoryState?.pendingQuestionEventCount || 0;
  const pendingQuestionCandidateCount = position.generationMemoryState?.pendingQuestionCandidateCount || 0;
  const pendingSummaryEventCount = position.generationMemoryState?.pendingSummaryEventCount || 0;
  const pendingSummaryCandidateCount = position.generationMemoryState?.pendingSummaryCandidateCount || 0;

  useEffect(() => {
    setQuestionGuidanceDraft(questionGuidance);
  }, [questionGuidance, position.id]);

  useEffect(() => {
    setSummaryGuidanceDraft(summaryGuidance);
  }, [summaryGuidance, position.id]);

  const handleRefreshMemory = async () => {
    setIsRefreshingMemory(true);
    setRefreshStatus('正在刷新岗位记忆...');
    try {
      const result = await refreshGenerationMemory(position.id);
      if (result.error) {
        setRefreshStatus(`岗位记忆刷新失败：${result.error}`);
        return;
      }
      if (result.scopeErrors && Object.keys(result.scopeErrors).length > 0) {
        const labels = Object.entries(result.scopeErrors)
          .map(([scopeKey, message]) => `${scopeKey === 'question_generation' ? '问题' : '面评'}记忆失败：${message}`)
          .join('；');
        setRefreshStatus(
          result.refreshedScopes.length
            ? `岗位记忆部分刷新成功。${labels}`
            : `岗位记忆刷新失败：${labels}`
        );
      } else {
        setRefreshStatus(result.refreshedScopes.length ? '岗位记忆已刷新。' : '岗位记忆刷新完成，但没有可更新的 scope。');
      }
      setManualRefreshUsage({
        question: result.usageByScope.question_generation,
        summary: result.usageByScope.summary_generation,
      });
    } finally {
      setIsRefreshingMemory(false);
    }
  };

  const handleSaveGuidance = (scope: 'question_generation' | 'summary_generation') => {
    const nextQuestionGuidance = scope === 'question_generation' ? questionGuidanceDraft : questionGuidance;
    const nextSummaryGuidance = scope === 'summary_generation' ? summaryGuidanceDraft : summaryGuidance;

    updatePosition(position.id, {
      generationMemory: {
        questionMemoryItems: position.generationMemory?.questionMemoryItems || [],
        summaryMemoryItems: position.generationMemory?.summaryMemoryItems || [],
        questionGuidancePrompt: nextQuestionGuidance,
        summaryGuidancePrompt: nextSummaryGuidance,
        updatedAt: position.generationMemory?.updatedAt || new Date().toISOString(),
        sampleSize: position.generationMemory?.sampleSize || 0,
        version: position.generationMemory?.version || 1,
      },
      generationGuidance: {
        questionGuidance: nextQuestionGuidance,
        summaryGuidance: nextSummaryGuidance,
        updatedAt: new Date().toISOString(),
        sampleSize: position.generationMemory?.sampleSize || position.generationGuidance?.sampleSize || 0,
      },
    });
    setRefreshStatus(scope === 'question_generation' ? '问题指引已保存。' : '面评指引已保存。');
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">{position.title}</h2>
          {position.team && <p className="text-sm text-gray-500">{position.team}</p>}
        </div>
        <Button variant="secondary" size="sm" onClick={() => navigate(`/positions/${position.id}/edit`)}>
          编辑岗位
        </Button>
      </div>

      {position.description && (
        <div className="bg-white p-3 rounded-lg border border-gray-200">
          <div className="flex items-start justify-between gap-3 mb-1">
            <h3 className="text-sm font-medium text-gray-700">岗位描述</h3>
            {shouldClampDescription && (
              <button
                type="button"
                onClick={() => setIsDescriptionExpanded((value) => !value)}
                className="text-xs text-blue-600 hover:text-blue-800 shrink-0"
              >
                {isDescriptionExpanded ? '收起' : '展开'}
              </button>
            )}
          </div>
          <p
            className={`text-sm text-gray-600 whitespace-pre-wrap ${
              shouldClampDescription && !isDescriptionExpanded ? 'line-clamp-4' : ''
            }`}
          >
            {position.description}
          </p>
        </div>
      )}

      {position.criteria.length > 0 && (
        <div className="bg-white p-3 rounded-lg border border-gray-200">
          <h3 className="text-sm font-medium text-gray-700 mb-1">增量职位要求</h3>
          <ul className="text-sm text-gray-600 list-disc list-inside">
            {position.criteria.map((criterion) => (
              <li key={criterion}>{criterion}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="bg-white p-3 rounded-lg border border-gray-200 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-medium text-gray-700">AI 指引（岗位记忆）</h3>
            <p className="text-xs text-gray-500 mt-1">
              基于岗位反馈事件沉淀为结构化记忆，再渲染成问题与面评指引。
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => void handleRefreshMemory()} isLoading={isRefreshingMemory}>
              刷新岗位记忆
            </Button>
            <button
              type="button"
              onClick={() => setIsGuidanceExpanded((value) => !value)}
              className="text-xs text-blue-600 hover:text-blue-800 shrink-0"
            >
              {isGuidanceExpanded ? '收起' : '展开'}
            </button>
          </div>
        </div>

        {isGuidanceExpanded && (
          <div className="space-y-3">
            {refreshStatus && (
              <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700">
                {refreshStatus}
              </div>
            )}
            <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h4 className="text-xs font-semibold text-slate-700">问题记忆指引</h4>
                  {lastQuestionRefreshAt && (
                    <span className="text-[11px] text-slate-500">
                      样本 {position.generationMemory?.sampleSize || 0} · 更新于 {new Date(lastQuestionRefreshAt).toLocaleString()}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setIsQuestionGuidanceExpanded((value) => !value)}
                  className="text-xs text-blue-600 hover:text-blue-800 shrink-0"
                  aria-label={isQuestionGuidanceExpanded ? '收起问题记忆指引' : '展开问题记忆指引'}
                >
                  {isQuestionGuidanceExpanded ? '收起' : '展开'}
                </button>
              </div>
              {isQuestionDirty && (
                <p className="mt-2 text-[11px] text-amber-700">
                  等待下次刷新：问题记忆有新的反馈事件待合并。
                  待合并事件 {pendingQuestionEventCount}，候选人 {pendingQuestionCandidateCount}。
                </p>
              )}
              {isQuestionGuidanceExpanded && (
                <>
                  <label className="mt-2 block text-[11px] font-medium text-slate-600" htmlFor="question-guidance-editor">
                    问题记忆指引
                  </label>
                  <Textarea
                    id="question-guidance-editor"
                    aria-label="问题记忆指引"
                    value={questionGuidanceDraft}
                    onChange={(event) => setQuestionGuidanceDraft(event.target.value)}
                    autoResize
                    rows={2}
                    className="mt-2 min-h-[64px] border-slate-200 bg-white text-xs leading-5 text-slate-700"
                  />
                  <div className="mt-2 flex justify-end">
                    <Button variant="secondary" size="sm" onClick={() => handleSaveGuidance('question_generation')}>
                      保存问题指引
                    </Button>
                  </div>
                </>
              )}
              {renderUsage(manualRefreshUsage.question, '问题记忆更新 Token')}
            </div>

            <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h4 className="text-xs font-semibold text-slate-700">面评记忆指引</h4>
                  {lastSummaryRefreshAt && (
                    <span className="text-[11px] text-slate-500">
                      更新于 {new Date(lastSummaryRefreshAt).toLocaleString()}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setIsSummaryGuidanceExpanded((value) => !value)}
                  className="text-xs text-blue-600 hover:text-blue-800 shrink-0"
                  aria-label={isSummaryGuidanceExpanded ? '收起面评记忆指引' : '展开面评记忆指引'}
                >
                  {isSummaryGuidanceExpanded ? '收起' : '展开'}
                </button>
              </div>
              {isSummaryDirty && (
                <p className="mt-2 text-[11px] text-amber-700">
                  等待下次刷新：面评记忆有新的反馈事件待合并。
                  待合并事件 {pendingSummaryEventCount}，候选人 {pendingSummaryCandidateCount}。
                </p>
              )}
              {isSummaryGuidanceExpanded && (
                <>
                  <label className="mt-2 block text-[11px] font-medium text-slate-600" htmlFor="summary-guidance-editor">
                    面评记忆指引
                  </label>
                  <Textarea
                    id="summary-guidance-editor"
                    aria-label="面评记忆指引"
                    value={summaryGuidanceDraft}
                    onChange={(event) => setSummaryGuidanceDraft(event.target.value)}
                    autoResize
                    rows={2}
                    className="mt-2 min-h-[64px] border-slate-200 bg-white text-xs leading-5 text-slate-700"
                  />
                  <div className="mt-2 flex justify-end">
                    <Button variant="secondary" size="sm" onClick={() => handleSaveGuidance('summary_generation')}>
                      保存面评指引
                    </Button>
                  </div>
                </>
              )}
              {renderUsage(manualRefreshUsage.summary, '面评记忆更新 Token')}
            </div>
          </div>
        )}
      </div>

      <CandidateList
        position={position}
        onSelectCandidate={(candidateId) =>
          navigate(`/positions/${position.id}/candidates/${candidateId}/interview`)
        }
        onEditCandidate={(candidateId) =>
          navigate(`/positions/${position.id}/candidates/${candidateId}/edit`)
        }
        onCompleteCandidate={(candidateId) =>
          updateCandidate(position.id, candidateId, { status: 'completed' })
        }
        onAddCandidate={() => navigate(`/positions/${position.id}/candidates/new`)}
      />
    </div>
  );
}
