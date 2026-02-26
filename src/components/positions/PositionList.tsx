import React from 'react';
import { usePositionStore } from '@/store/positionStore';
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

  if (positions.length === 0) {
    return (
      <Card>
        <CardBody className="text-center py-8">
          <p className="text-gray-500 mb-4">No positions yet</p>
          <div className="flex gap-2 justify-center">
            <Button onClick={onAddPosition}>Add Position</Button>
            <Button variant="secondary">Sync from Calendar</Button>
          </div>
        </CardBody>
      </Card>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-gray-700">All Positions</h3>
        <Button size="sm" onClick={onAddPosition}>
          + New Position
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
