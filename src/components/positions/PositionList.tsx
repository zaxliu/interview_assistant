import React from 'react';
import { usePositionStore } from '@/store/positionStore';
import { useFeishuOAuth } from '@/hooks/useFeishuOAuth';
import { PositionCard } from './PositionCard';
import { Card, CardBody, Button } from '@/components/ui';

interface PositionListProps {
  onSelectPosition: (positionId: string) => void;
  onEditPosition: (positionId: string) => void;
  onAddPosition: () => void;
}

export const PositionList: React.FC<PositionListProps> = ({
  onSelectPosition,
  onEditPosition,
  onAddPosition,
}) => {
  const { positions } = usePositionStore();
  const { isAuthenticated } = useFeishuOAuth();

  if (positions.length === 0) {
    return (
      <Card>
        <CardBody className="text-center py-8">
          <p className="text-gray-500 mb-4">暂无岗位</p>
          <div className="flex gap-2 justify-center">
            <Button onClick={onAddPosition}>新增岗位</Button>
            {isAuthenticated && <Button variant="secondary">从日历同步</Button>}
          </div>
        </CardBody>
      </Card>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-gray-700">全部岗位</h3>
        <Button size="sm" onClick={onAddPosition}>
          + 新建岗位
        </Button>
      </div>
      <div className="space-y-2">
        {positions.map((position) => (
          <PositionCard
            key={position.id}
            position={position}
            onClick={() => onSelectPosition(position.id)}
            onEdit={() => onEditPosition(position.id)}
          />
        ))}
      </div>
    </div>
  );
};
