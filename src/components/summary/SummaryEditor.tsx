import { useState, useEffect, useRef, useCallback } from 'react';
import type { Position, Candidate, InterviewResult, EvaluationDimension } from '@/types';
import { EvaluationDimensionCard } from './EvaluationDimensionCard';
import { ExportButtons } from './ExportButtons';
import { Card, CardHeader, CardBody, Input, Textarea, Select, Button } from '@/components/ui';
import { useAI } from '@/hooks/useAI';
import { usePositionStore } from '@/store/positionStore';

const AUTO_SAVE_DELAY = 2000; // 2 seconds debounce

interface SummaryEditorProps {
  position: Position;
  candidate: Candidate;
  autoGenerate?: boolean;
}

const defaultResult: InterviewResult = {
  interview_info: {
    interviewer: '',
    overall_result: '待定',
    interview_time: new Date().toISOString().slice(0, 16).replace('T', ' '),
  },
  evaluation_dimensions: [
    { dimension: '专业能力', score: 3, assessment_points: '' },
    { dimension: '通用素质', score: 3, assessment_points: '' },
    { dimension: '适配度', score: 3, assessment_points: '' },
    { dimension: '管理能力', score: 3, assessment_points: '' },
  ],
  summary: {
    suggested_level: '',
    comprehensive_score: 3,
    overall_comment: '',
    interview_conclusion: '待定',
    is_strongly_recommended: false,
  },
};

export const SummaryEditor: React.FC<SummaryEditorProps> = ({
  position,
  candidate,
  autoGenerate = false,
}) => {
  const { isLoading: aiLoading, generateInterviewSummary } = useAI();
  const { setInterviewResult } = usePositionStore();

  const [result, setResult] = useState<InterviewResult>(
    candidate.interviewResult || {
      ...defaultResult,
      interview_info: {
        ...defaultResult.interview_info,
        interview_time: candidate.interviewTime
          ? new Date(candidate.interviewTime).toISOString().slice(0, 16).replace('T', ' ')
          : defaultResult.interview_info.interview_time,
      },
    }
  );

  const [strengths, setStrengths] = useState<string[]>(
    candidate.interviewResult?.additional_info?.strengths || []
  );
  const [concerns, setConcerns] = useState<string[]>(
    candidate.interviewResult?.additional_info?.concerns || []
  );
  const [followUps, setFollowUps] = useState<string[]>(
    candidate.interviewResult?.additional_info?.follow_up_questions || []
  );

  // Auto-save state
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved');
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isInitialMountRef = useRef(true);

  // Build the final result object
  const buildFinalResult = useCallback((): InterviewResult => ({
    ...result,
    additional_info: {
      strengths,
      concerns,
      follow_up_questions: followUps,
    },
  }), [result, strengths, concerns, followUps]);

  // Save draft function
  const handleSaveDraft = useCallback(() => {
    setSaveStatus('saving');
    const finalResult = buildFinalResult();
    setInterviewResult(position.id, candidate.id, finalResult);
    setSaveStatus('saved');
  }, [buildFinalResult, position.id, candidate.id, setInterviewResult]);

  // Auto-save with debounce on user edits
  useEffect(() => {
    // Skip on initial mount
    if (isInitialMountRef.current) {
      isInitialMountRef.current = false;
      return;
    }

    // Clear existing timer
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }

    // Mark as unsaved
    setSaveStatus('unsaved');

    // Set new timer
    autoSaveTimerRef.current = setTimeout(() => {
      handleSaveDraft();
    }, AUTO_SAVE_DELAY);

    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, [result, strengths, concerns, followUps]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-generate summary on mount if requested and no existing result
  useEffect(() => {
    if (autoGenerate && !candidate.interviewResult && position.description && candidate.resumeText) {
      handleGenerateSummary();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleGenerateSummary = async () => {
    const generatedResult = await generateInterviewSummary(
      candidate.questions,
      position.description || '',
      candidate.resumeText || '',
      candidate.name,
      position.title,
      candidate.quickNotes,
      candidate.codingChallenges
    );

    if (generatedResult) {
      setResult(generatedResult);

      if (generatedResult.additional_info) {
        setStrengths(generatedResult.additional_info.strengths || []);
        setConcerns(generatedResult.additional_info.concerns || []);
        setFollowUps(generatedResult.additional_info.follow_up_questions || []);
      }

      // Auto-save after generation
      const finalResult: InterviewResult = {
        ...generatedResult,
        additional_info: {
          strengths: generatedResult.additional_info?.strengths || [],
          concerns: generatedResult.additional_info?.concerns || [],
          follow_up_questions: generatedResult.additional_info?.follow_up_questions || [],
        },
      };
      setSaveStatus('saving');
      setInterviewResult(position.id, candidate.id, finalResult);
      setSaveStatus('saved');
    }
  };

  const updateDimension = (index: number, updates: Partial<EvaluationDimension>) => {
    const newDimensions = [...result.evaluation_dimensions];
    newDimensions[index] = { ...newDimensions[index], ...updates };
    setResult({ ...result, evaluation_dimensions: newDimensions });
  };

  const addDimension = () => {
    setResult({
      ...result,
      evaluation_dimensions: [
        ...result.evaluation_dimensions,
        { dimension: '新维度', score: 3, assessment_points: '' },
      ],
    });
  };

  const removeDimension = (index: number) => {
    const newDimensions = result.evaluation_dimensions.filter((_, i) => i !== index);
    setResult({ ...result, evaluation_dimensions: newDimensions });
  };

  const resultOptions = [
    { value: '通过', label: '通过' },
    { value: '不通过', label: '不通过' },
    { value: '待定', label: '待定' },
  ];

  const scoreOptions = [
    { value: '1', label: '1' },
    { value: '2', label: '2' },
    { value: '3', label: '3' },
    { value: '4', label: '4' },
    { value: '5', label: '5' },
  ];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-medium text-gray-900">
            Interview Result: {candidate.name} - {position.title}
          </h2>
          {/* Save status indicator */}
          <span className={`text-xs ${
            saveStatus === 'saved' ? 'text-green-600' :
            saveStatus === 'saving' ? 'text-yellow-600' :
            'text-gray-400'
          }`}>
            {saveStatus === 'saved' && '✓ Saved'}
            {saveStatus === 'saving' && '...'}
            {saveStatus === 'unsaved' && '(unsaved)'}
          </span>
        </div>

        <div className="flex gap-2">
          <Button
            variant="secondary"
            onClick={handleGenerateSummary}
            isLoading={aiLoading}
            disabled={!position.description || !candidate.resumeText}
          >
            Generate from AI
          </Button>
          <Button
            onClick={handleSaveDraft}
            variant={saveStatus === 'unsaved' ? 'primary' : 'secondary'}
          >
            Save Draft
          </Button>
        </div>
      </div>

      {/* Interview Info */}
      <Card>
        <CardHeader>
          <h3 className="text-sm font-medium text-gray-700">Interview Info</h3>
        </CardHeader>
        <CardBody>
          <div className="grid grid-cols-3 gap-3">
            <Input
              label="Interviewer"
              value={result.interview_info.interviewer}
              onChange={(e) =>
                setResult({
                  ...result,
                  interview_info: { ...result.interview_info, interviewer: e.target.value },
                })
              }
            />
            <Input
              label="Time"
              value={result.interview_info.interview_time}
              onChange={(e) =>
                setResult({
                  ...result,
                  interview_info: { ...result.interview_info, interview_time: e.target.value },
                })
              }
            />
            <Select
              label="Overall Result"
              value={result.interview_info.overall_result}
              onChange={(e) =>
                setResult({
                  ...result,
                  interview_info: {
                    ...result.interview_info,
                    overall_result: e.target.value as '通过' | '不通过' | '待定',
                  },
                })
              }
              options={resultOptions}
            />
          </div>
        </CardBody>
      </Card>

      {/* Evaluation Dimensions */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-gray-700">Evaluation Dimensions</h3>
            <Button variant="ghost" size="sm" onClick={addDimension}>
              + Add Dimension
            </Button>
          </div>
        </CardHeader>
        <CardBody className="space-y-3">
          {result.evaluation_dimensions.map((dim, index) => (
            <EvaluationDimensionCard
              key={index}
              dimension={dim}
              onUpdate={(updates) => updateDimension(index, updates)}
              onRemove={() => removeDimension(index)}
              canRemove={result.evaluation_dimensions.length > 1}
            />
          ))}
        </CardBody>
      </Card>

      {/* Summary */}
      <Card>
        <CardHeader>
          <h3 className="text-sm font-medium text-gray-700">Summary</h3>
        </CardHeader>
        <CardBody className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Suggested Level"
              value={result.summary.suggested_level}
              onChange={(e) =>
                setResult({
                  ...result,
                  summary: { ...result.summary, suggested_level: e.target.value },
                })
              }
              placeholder="e.g., H7, P6"
            />
            <Select
              label="Comprehensive Score"
              value={result.summary.comprehensive_score.toString()}
              onChange={(e) =>
                setResult({
                  ...result,
                  summary: { ...result.summary, comprehensive_score: parseInt(e.target.value) },
                })
              }
              options={scoreOptions}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Select
              label="Interview Conclusion"
              value={result.summary.interview_conclusion}
              onChange={(e) =>
                setResult({
                  ...result,
                  summary: {
                    ...result.summary,
                    interview_conclusion: e.target.value as '通过' | '不通过' | '待定',
                  },
                })
              }
              options={resultOptions}
            />
            <div className="flex items-center pt-6">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={result.summary.is_strongly_recommended}
                  onChange={(e) =>
                    setResult({
                      ...result,
                      summary: {
                        ...result.summary,
                        is_strongly_recommended: e.target.checked,
                      },
                    })
                  }
                  className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">Strongly Recommended</span>
              </label>
            </div>
          </div>

          <Textarea
            label="Overall Comment"
            value={result.summary.overall_comment}
            onChange={(e) =>
              setResult({
                ...result,
                summary: { ...result.summary, overall_comment: e.target.value },
              })
            }
            autoResize
            placeholder="Comprehensive evaluation of the candidate..."
          />
        </CardBody>
      </Card>

      {/* Additional Info */}
      <Card>
        <CardHeader>
          <h3 className="text-sm font-medium text-gray-700">Additional Info (Optional)</h3>
        </CardHeader>
        <CardBody className="space-y-3">
          <StringListInput
            label="Strengths"
            items={strengths}
            onChange={setStrengths}
          />
          <StringListInput
            label="Concerns"
            items={concerns}
            onChange={setConcerns}
          />
          <StringListInput
            label="Follow-up Questions"
            items={followUps}
            onChange={setFollowUps}
          />
        </CardBody>
      </Card>

      {/* Export Buttons */}
      <Card>
        <CardBody className="flex justify-end gap-2">
          <Button
            onClick={handleSaveDraft}
            variant={saveStatus === 'unsaved' ? 'primary' : 'secondary'}
          >
            Save Draft
          </Button>
          <ExportButtons
            result={{
              ...result,
              additional_info: {
                strengths,
                concerns,
                follow_up_questions: followUps,
              },
            }}
            candidateName={candidate.name}
            positionTitle={position.title}
          />
        </CardBody>
      </Card>
    </div>
  );
};

// Helper component for string list input
const StringListInput: React.FC<{
  label: string;
  items: string[];
  onChange: (items: string[]) => void;
}> = ({ label, items, onChange }) => {
  const [newItem, setNewItem] = useState('');

  const handleAdd = () => {
    if (newItem.trim()) {
      onChange([...items, newItem.trim()]);
      setNewItem('');
    }
  };

  const handleRemove = (index: number) => {
    onChange(items.filter((_, i) => i !== index));
  };

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <div className="space-y-1">
        {items.map((item, index) => (
          <div key={index} className="flex items-center gap-2">
            <span className="text-sm text-gray-600">• {item}</span>
            <button
              onClick={() => handleRemove(index)}
              className="text-gray-400 hover:text-red-500"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        ))}
        <div className="flex gap-2">
          <Input
            value={newItem}
            onChange={(e) => setNewItem(e.target.value)}
            placeholder={`Add ${label.toLowerCase()}...`}
            onKeyPress={(e) => e.key === 'Enter' && handleAdd()}
          />
          <Button variant="ghost" size="sm" onClick={handleAdd} disabled={!newItem.trim()}>
            Add
          </Button>
        </div>
      </div>
    </div>
  );
};
