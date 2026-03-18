import React from 'react';
import type { Position } from '@/types';
import { Card, CardBody } from '@/components/ui';
import { zhCN as t } from '@/i18n/zhCN';

interface PositionCardProps {
  position: Position;
  onClick: () => void;
  onEdit: () => void;
}

export const PositionCard: React.FC<PositionCardProps> = ({ position, onClick, onEdit }) => {
  const candidates = position.candidates;
  const completedCount = candidates.filter((c) => c.status === 'completed').length;
  const cancelledCount = candidates.filter((c) => c.status === 'cancelled').length;
  const activeCount = candidates.length - completedCount - cancelledCount;
  const totalCount = candidates.length;
  const progressSegments = [
    { key: 'completed', count: completedCount, className: 'bg-emerald-500' },
    { key: 'active', count: activeCount, className: 'bg-sky-400' },
    { key: 'cancelled', count: cancelledCount, className: 'bg-slate-300' },
  ].filter((segment) => segment.count > 0);

  return (
    <Card onClick={onClick}>
      <CardBody className="py-3">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-medium text-gray-900">{position.title}</h4>
              {position.team && (
                <span className="text-xs text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded shrink-0">
                  {position.team}
                </span>
              )}
            </div>
            {position.description && (
              <p className="text-xs text-gray-500 mt-1 line-clamp-1">
                {position.description}
              </p>
            )}
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <div className="min-w-[188px]">
              {totalCount > 0 ? (
                <div className="space-y-1.5">
                  <div
                    aria-label="岗位面试进度"
                    className="flex h-2.5 overflow-hidden rounded-full bg-gray-100 shadow-inner"
                  >
                    {progressSegments.map((segment) => (
                      <div
                        key={segment.key}
                        className={segment.className}
                        style={{ width: `${(segment.count / totalCount) * 100}%` }}
                      />
                    ))}
                  </div>
                  <div className="flex items-center justify-between gap-3 text-[11px] text-gray-500">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="font-medium text-gray-700">
                        {completedCount}/{Math.max(totalCount - cancelledCount, 0)} 完成
                      </span>
                      {activeCount > 0 && <span>{activeCount} 进行中</span>}
                      {cancelledCount > 0 && <span>{cancelledCount} 已取消</span>}
                    </div>
                    <span>{totalCount} 位候选人</span>
                  </div>
                </div>
              ) : (
                <span className="text-xs text-gray-400">暂无候选人</span>
              )}
            </div>

            <button
              onClick={(e) => {
                e.stopPropagation();
                onEdit();
              }}
              className="text-xs text-blue-600 hover:text-blue-800 px-1.5 py-0.5 rounded hover:bg-blue-50"
              title="编辑岗位 / 补充岗位描述"
            >
              {t.common.edit}
            </button>
          </div>
        </div>
      </CardBody>
    </Card>
  );
};
