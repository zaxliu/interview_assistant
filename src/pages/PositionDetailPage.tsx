import { useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { CandidateList } from '@/components/candidates/CandidateList';
import { Button } from '@/components/ui';
import { usePositionStore } from '@/store/positionStore';

export default function PositionDetailPage() {
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);
  const [isGuidanceExpanded, setIsGuidanceExpanded] = useState(true);
  const navigate = useNavigate();
  const { positionId } = useParams();
  const updateCandidate = usePositionStore((state) => state.updateCandidate);
  const position = usePositionStore((state) =>
    positionId ? state.positions.find((item) => item.id === positionId) : undefined
  );
  const shouldClampDescription = (position?.description?.length || 0) > 280;

  if (!positionId || !position) {
    return <Navigate to="/404" replace />;
  }

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
            <h3 className="text-sm font-medium text-gray-700">AI 指引（闭环更新）</h3>
            <p className="text-xs text-gray-500 mt-1">
              基于用户对 AI 问题与面评的采纳/删改反馈自动迭代。
            </p>
          </div>
          <button
            type="button"
            onClick={() => setIsGuidanceExpanded((value) => !value)}
            className="text-xs text-blue-600 hover:text-blue-800 shrink-0"
          >
            {isGuidanceExpanded ? '收起' : '展开'}
          </button>
        </div>

        {isGuidanceExpanded && (
          <div className="space-y-3">
            <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-xs font-semibold text-slate-700">问题 Guidance</h4>
                {position.generationGuidance && (
                  <span className="text-[11px] text-slate-500">
                    样本 {position.generationGuidance.sampleSize} · 更新于 {new Date(position.generationGuidance.updatedAt).toLocaleString()}
                  </span>
                )}
              </div>
              <pre className="mt-2 whitespace-pre-wrap break-words text-xs leading-5 text-slate-700">
                {position.generationGuidance?.questionGuidance || '暂无问题 guidance。产生反馈后将自动生成。'}
              </pre>
            </div>

            <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3">
              <h4 className="text-xs font-semibold text-emerald-700">面评 Guidance</h4>
              <pre className="mt-2 whitespace-pre-wrap break-words text-xs leading-5 text-emerald-700">
                {position.generationGuidance?.summaryGuidance || '暂无面评 guidance。产生反馈后将自动生成。'}
              </pre>
            </div>

            <div className="rounded-md border border-gray-200 bg-gray-50 p-3 space-y-3">
              <div>
                <h4 className="text-xs font-semibold text-gray-700">当前生成逻辑</h4>
                <ol className="mt-2 list-decimal list-inside space-y-1 text-xs text-gray-600">
                  <li>采集问题反馈：AI 问题被标记 asked / 被编辑 / 被删除。</li>
                  <li>采集面评反馈：对比 AI 面评初稿与用户最终稿，提炼偏好。</li>
                  <li>按岗位聚合最近反馈，自动生成问题与面评两类 guidance。</li>
                  <li>下次生成问题和面评时自动把 guidance 注入 Prompt。</li>
                </ol>
              </div>
              <div>
                <h4 className="text-xs font-semibold text-gray-700">当前生成格式</h4>
                <div className="mt-2 space-y-2 text-xs text-gray-600">
                  <p>问题 guidance 注入格式：</p>
                  <pre className="rounded border border-gray-200 bg-white p-2 whitespace-pre-wrap break-words text-[11px] text-gray-700">
{`【岗位历史反馈指引-问题】
优先覆盖维度
- 专业能力（N）
高采纳来源
- resume（N）
常见问题改写偏好
- 缩短题干（N）`}
                  </pre>
                  <p>面评 guidance 注入格式：</p>
                  <pre className="rounded border border-gray-200 bg-white p-2 whitespace-pre-wrap break-words text-[11px] text-gray-700">
{`【岗位历史反馈指引-面评】
面评常见改写偏好
- 强调证据链（N）
面评改写幅度分布
- medium（N）`}
                  </pre>
                </div>
              </div>
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
