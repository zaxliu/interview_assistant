import React, { useState } from 'react';
import type { Position } from '@/types';
import { usePositionStore } from '@/store/positionStore';
import {
  buildPositionDescriptionFromWintalentJD,
  fetchFirstAvailableWintalentPositionJD,
  isWintalentInterviewLink,
} from '@/api/wintalent';
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
  const [jdLoading, setJdLoading] = useState(false);
  const [jdStatus, setJdStatus] = useState<string | null>(null);

  const getWintalentLinksFromPosition = (): string[] =>
    !position
      ? []
      : position.candidates
          .map((candidate) => candidate.candidateLink?.trim() || '')
          .filter((value) => isWintalentInterviewLink(value));

  const handleRefreshJD = async () => {
    if (!position) {
      setJdStatus('请先创建岗位，再从候选人链接拉取 JD。');
      return;
    }

    const candidateLinks = getWintalentLinksFromPosition();
    if (candidateLinks.length === 0) {
      setJdStatus('当前岗位下未找到 Wintalent 候选人链接。');
      return;
    }

    setJdLoading(true);
    setJdStatus(null);
    try {
      const { jd } = await fetchFirstAvailableWintalentPositionJD(candidateLinks);
      const nextDescription = buildPositionDescriptionFromWintalentJD(jd);
      if (!nextDescription) {
        throw new Error('已获取 JD，但内容为空。');
      }
      setDescription(nextDescription);
      setJdStatus('已获取最新 JD，请点击“保存修改”生效。');
    } catch (error) {
      setJdStatus(error instanceof Error ? error.message : '获取 JD 失败');
    } finally {
      setJdLoading(false);
    }
  };

  const handleSubmit = () => {
    if (position) {
      updatePosition(position.id, {
        title,
        team,
        description,
      });
      onSave(position.id);
    } else {
      const newPosition = addPosition({
        title,
        team,
        description,
        criteria: [],
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
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="block text-sm font-medium text-gray-700">岗位描述</span>
            {position && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={handleRefreshJD}
                isLoading={jdLoading}
              >
                重新获取JD
              </Button>
            )}
          </div>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="请输入岗位职责与要求..."
            autoResize
            rows={4}
          />
          {jdStatus && (
            <p className={`text-xs ${jdStatus.includes('失败') || jdStatus.includes('未找到') || jdStatus.includes('请先') ? 'text-red-600' : 'text-green-600'}`}>
              {jdStatus}
            </p>
          )}
        </div>
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
