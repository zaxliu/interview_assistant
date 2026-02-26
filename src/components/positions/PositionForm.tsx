import React, { useState } from 'react';
import type { Position } from '@/types';
import { usePositionStore } from '@/store/positionStore';
import { Card, CardHeader, CardBody, CardFooter, Button, Input, Textarea } from '@/components/ui';

interface PositionFormProps {
  position?: Position;
  onSave: (positionId: string) => void;
  onCancel: () => void;
}

export const PositionForm: React.FC<PositionFormProps> = ({
  position,
  onSave,
  onCancel,
}) => {
  const { addPosition, updatePosition } = usePositionStore();

  const [title, setTitle] = useState(position?.title || '');
  const [team, setTeam] = useState(position?.team || '');
  const [description, setDescription] = useState(position?.description || '');
  const [criteriaText, setCriteriaText] = useState(
    position?.criteria.join('\n') || ''
  );

  const handleSubmit = () => {
    const criteria = criteriaText
      .split('\n')
      .map((c) => c.trim())
      .filter((c) => c.length > 0);

    if (position) {
      updatePosition(position.id, {
        title,
        team,
        description,
        criteria,
      });
      onSave(position.id);
    } else {
      const newPosition = addPosition({
        title,
        team,
        description,
        criteria,
        source: 'manual',
      });
      onSave(newPosition.id);
    }
  };

  return (
    <Card>
      <CardHeader>
        <h3 className="text-sm font-medium text-gray-700">
          {position ? 'Edit Position' : 'New Position'}
        </h3>
      </CardHeader>
      <CardBody className="space-y-3">
        <Input
          label="Position Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g., Senior Software Engineer"
        />
        <Input
          label="Team (Optional)"
          value={team}
          onChange={(e) => setTeam(e.target.value)}
          placeholder="e.g., Platform Team"
        />
        <Textarea
          label="Job Description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Describe the role and responsibilities..."
          rows={4}
        />
        <Textarea
          label="Evaluation Criteria (one per line)"
          value={criteriaText}
          onChange={(e) => setCriteriaText(e.target.value)}
          placeholder="Technical skills&#10;Problem solving&#10;Communication"
          rows={3}
        />
      </CardBody>
      <CardFooter className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={handleSubmit} disabled={!title.trim()}>
          {position ? 'Save Changes' : 'Create Position'}
        </Button>
      </CardFooter>
    </Card>
  );
};
