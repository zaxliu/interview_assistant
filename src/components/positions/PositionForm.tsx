import React, { useState } from 'react';
import type { Position } from '@/types';
import { usePositionStore } from '@/store/positionStore';
import { Card, CardHeader, CardBody, CardFooter, Button, Input, Textarea } from '@/components/ui';
import { zhCN as t } from '@/i18n/zhCN';

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
          {position ? '编辑岗位' : '新建岗位'}
        </h3>
      </CardHeader>
      <CardBody className="space-y-3">
        <Input
          label="岗位名称"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="例如：高级后端工程师"
        />
        <Input
          label="团队（可选）"
          value={team}
          onChange={(e) => setTeam(e.target.value)}
          placeholder="例如：平台研发团队"
        />
        <Textarea
          label="岗位描述"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="请输入岗位职责与要求..."
          autoResize
          rows={4}
        />
        <Textarea
          label="增量职位要求（每行一条）"
          value={criteriaText}
          onChange={(e) => setCriteriaText(e.target.value)}
          placeholder="某个特定领域经验&#10;对业务场景的理解&#10;额外加分项"
          autoResize
          rows={3}
        />
      </CardBody>
      <CardFooter className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel}>
          {t.common.cancel}
        </Button>
        <Button onClick={handleSubmit} disabled={!title.trim()}>
          {position ? t.common.saveChanges : '创建岗位'}
        </Button>
      </CardFooter>
    </Card>
  );
};
