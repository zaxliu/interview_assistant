import { useState, useEffect } from 'react';
import { usePositionStore } from '@/store/positionStore';
import { useSettingsStore } from '@/store/settingsStore';
import { CalendarSync } from '@/components/calendar/CalendarSync';
import { UpcomingInterviews } from '@/components/calendar/UpcomingInterviews';
import { PositionList } from '@/components/positions/PositionList';
import { PositionForm } from '@/components/positions/PositionForm';
import { CandidateList } from '@/components/candidates/CandidateList';
import { CandidateForm } from '@/components/candidates/CandidateForm';
import { InterviewPanel } from '@/components/interview/InterviewPanel';
import { SummaryEditor } from '@/components/summary/SummaryEditor';
import { SettingsPanel } from '@/components/settings/SettingsPanel';
import { SettingsWarning } from '@/components/settings/SettingsWarning';
import { Button } from '@/components/ui';

type View =
  | 'dashboard'
  | 'position-form'
  | 'position-detail'
  | 'candidate-form'
  | 'interview'
  | 'summary'
  | 'settings';

// Helper to get initial view from URL hash or OAuth state
const getInitialView = (): View => {
  // Check hash first
  const hash = window.location.hash.slice(1); // Remove #
  if (hash === 'settings') return 'settings';

  // Check OAuth state param (format: feishu_oauth:settings)
  const urlParams = new URLSearchParams(window.location.search);
  const state = urlParams.get('state');
  if (state?.startsWith('feishu_oauth:')) {
    const returnView = state.split(':')[1];
    if (returnView === 'settings') return 'settings';
  }

  return 'dashboard';
};

function App() {
  const { loadFromStorage, getPosition } = usePositionStore();
  const { loadFromStorage: loadSettings } = useSettingsStore();

  const [view, setView] = useState<View>(getInitialView);
  const [selectedPositionId, setSelectedPositionId] = useState<string | null>(null);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);

  // Load data from storage on mount
  useEffect(() => {
    loadFromStorage();
    loadSettings();
  }, [loadFromStorage, loadSettings]);

  const selectedPosition = selectedPositionId ? getPosition(selectedPositionId) : null;
  const selectedCandidate = selectedPosition?.candidates.find(
    (c) => c.id === selectedCandidateId
  );

  const handleSelectPosition = (positionId: string) => {
    setSelectedPositionId(positionId);
    setView('position-detail');
  };

  const handleAddPosition = () => {
    setSelectedPositionId(null);
    setView('position-form');
  };

  const handleEditPosition = (positionId: string) => {
    setSelectedPositionId(positionId);
    setView('position-form');
  };

  const handlePositionSaved = (positionId: string) => {
    setSelectedPositionId(positionId);
    setView('position-detail');
  };

  const handleSelectCandidate = (candidateId: string) => {
    setSelectedCandidateId(candidateId);
    setView('interview');
  };

  const handleAddCandidate = () => {
    setSelectedCandidateId(null);
    setView('candidate-form');
  };

  const handleEditCandidate = (candidateId: string) => {
    setSelectedCandidateId(candidateId);
    setView('candidate-form');
  };

  const handleCandidateSaved = (candidateId: string) => {
    setSelectedCandidateId(candidateId);
    setView('interview');
  };

  const handleStartInterview = (positionId: string, candidateId: string) => {
    setSelectedPositionId(positionId);
    setSelectedCandidateId(candidateId);
    setView('interview');
  };

  const handleGenerateSummary = () => {
    setView('summary');
  };

  const handleBack = () => {
    if (view === 'summary') {
      setView('interview');
    } else if (view === 'interview' || view === 'candidate-form') {
      setView('position-detail');
    } else if (view === 'position-detail' || view === 'position-form') {
      setView('dashboard');
    } else {
      setView('dashboard');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            {view !== 'dashboard' && view !== 'interview' && view !== 'summary' && view !== 'candidate-form' && (
              <Button variant="ghost" size="sm" onClick={handleBack}>
                <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Back
              </Button>
            )}
            <h1 className="text-lg font-semibold text-gray-900">Interview Assistant</h1>
          </div>
          <div className="flex items-center gap-3">
            {view === 'dashboard' && <CalendarSync />}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setView('settings')}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 py-4">
        {view === 'settings' && (
          <SettingsPanel onClose={() => setView('dashboard')} />
        )}

        {view === 'dashboard' && (
          <div className="space-y-6">
            <SettingsWarning onOpenSettings={() => setView('settings')} />
            <UpcomingInterviews onStartInterview={handleStartInterview} />
            <PositionList
              onSelectPosition={handleSelectPosition}
              onEditPosition={handleEditPosition}
              onAddPosition={handleAddPosition}
            />
          </div>
        )}

        {view === 'position-form' && (
          <PositionForm
            position={selectedPositionId ? getPosition(selectedPositionId) : undefined}
            onSave={handlePositionSaved}
            onCancel={handleBack}
          />
        )}

        {view === 'position-detail' && selectedPosition && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">{selectedPosition.title}</h2>
                {selectedPosition.team && (
                  <p className="text-sm text-gray-500">{selectedPosition.team}</p>
                )}
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => handleEditPosition(selectedPosition.id)}
              >
                Edit Position
              </Button>
            </div>

            {selectedPosition.description && (
              <div className="bg-white p-3 rounded-lg border border-gray-200">
                <h3 className="text-sm font-medium text-gray-700 mb-1">Job Description</h3>
                <p className="text-sm text-gray-600 whitespace-pre-wrap">{selectedPosition.description}</p>
              </div>
            )}

            {selectedPosition.criteria.length > 0 && (
              <div className="bg-white p-3 rounded-lg border border-gray-200">
                <h3 className="text-sm font-medium text-gray-700 mb-1">Evaluation Criteria</h3>
                <ul className="text-sm text-gray-600 list-disc list-inside">
                  {selectedPosition.criteria.map((c, i) => (
                    <li key={i}>{c}</li>
                  ))}
                </ul>
              </div>
            )}

            <CandidateList
              position={selectedPosition}
              onSelectCandidate={handleSelectCandidate}
              onEditCandidate={handleEditCandidate}
              onAddCandidate={handleAddCandidate}
            />
          </div>
        )}

        {view === 'candidate-form' && selectedPosition && (
          <CandidateForm
            positionId={selectedPosition.id}
            candidate={selectedCandidate}
            onSave={handleCandidateSaved}
            onCancel={handleBack}
          />
        )}

        {view === 'interview' && selectedPosition && selectedCandidate && (
          <InterviewPanel
            position={selectedPosition}
            candidate={selectedCandidate}
            onGenerateSummary={handleGenerateSummary}
            onEditCandidate={() => handleEditCandidate(selectedCandidate.id)}
            onBack={handleBack}
          />
        )}

        {view === 'summary' && selectedPosition && selectedCandidate && (
          <SummaryEditor
            position={selectedPosition}
            candidate={selectedCandidate}
            autoGenerate={true}
            onBack={handleBack}
          />
        )}
      </main>
    </div>
  );
}

export default App;
