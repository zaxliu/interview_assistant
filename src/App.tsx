import { Suspense, lazy, useEffect } from 'react';
import {
  Navigate,
  Outlet,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router-dom';
import { usePositionStore } from '@/store/positionStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useInterviewUIStore } from '@/store/interviewUIStore';
import { useTokenValidation } from '@/hooks/useTokenValidation';
import { useFeishuOAuth } from '@/hooks/useFeishuOAuth';
import { migrateLegacyData } from '@/utils/migration';
import { UserLoginBanner } from '@/components/auth/UserLoginBanner';
import { CalendarSync } from '@/components/calendar/CalendarSync';
import { Button, Logo } from '@/components/ui';
import { zhCN as t } from '@/i18n/zhCN';

const DashboardPage = lazy(() => import('@/pages/DashboardPage'));
const PositionFormPage = lazy(() => import('@/pages/PositionFormPage'));
const PositionDetailPage = lazy(() => import('@/pages/PositionDetailPage'));
const CandidateFormPage = lazy(() => import('@/pages/CandidateFormPage'));
const InterviewPage = lazy(() => import('@/pages/InterviewPage'));
const SummaryPage = lazy(() => import('@/pages/SummaryPage'));
const SettingsPage = lazy(() => import('@/pages/SettingsPage'));

const getBackTarget = (pathname: string, positionId?: string, candidateId?: string): string | null => {
  if (pathname === '/') return null;
  if (pathname === '/settings') return '/';
  if (pathname === '/positions/new') return '/';
  if (pathname.endsWith('/summary') && positionId && candidateId) {
    return `/positions/${positionId}/candidates/${candidateId}/interview`;
  }
  if (
    pathname.endsWith('/interview') ||
    pathname.endsWith('/edit') ||
    pathname.endsWith('/candidates/new')
  ) {
    return positionId ? `/positions/${positionId}` : '/';
  }
  if (pathname.includes('/positions/')) return '/';
  return '/';
};

const LoadingScreen = () => (
  <div className="bg-white border border-gray-200 rounded-lg p-8 text-center text-sm text-gray-500">
    {t.app.loading}
  </div>
);

const NotFoundPage = () => (
  <div className="bg-white border border-gray-200 rounded-lg p-8 text-center space-y-3">
    <h2 className="text-lg font-semibold text-gray-900">{t.app.notFoundTitle}</h2>
    <p className="text-sm text-gray-500">{t.app.notFoundDescription}</p>
  </div>
);

const AppHeader = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const params = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const getPosition = usePositionStore((state) => state.getPosition);
  const isAuthenticated = useFeishuOAuth().isAuthenticated;
  const hasPdf = useInterviewUIStore((state) => state.hasPdf);

  const selectedPosition = params.positionId ? getPosition(params.positionId) : null;
  const selectedCandidate = selectedPosition?.candidates.find(
    (candidate) => candidate.id === params.candidateId
  );

  const isInterviewRoute = location.pathname.endsWith('/interview');
  const isWideLayout = isInterviewRoute;
  const containerClass = isWideLayout ? 'w-full' : 'max-w-4xl mx-auto';
  const backTarget = getBackTarget(location.pathname, params.positionId, params.candidateId);
  const showPdf = searchParams.get('resume') !== 'hidden';

  const toggleResume = () => {
    const nextParams = new URLSearchParams(searchParams);
    if (showPdf) {
      nextParams.set('resume', 'hidden');
    } else {
      nextParams.delete('resume');
    }
    setSearchParams(nextParams, { replace: true });
  };

  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
      <div className={`${containerClass} px-4 py-3 flex items-center justify-between gap-4`}>
        <div className="flex items-center gap-4">
          {backTarget && (
            <Button variant="ghost" size="sm" onClick={() => navigate(backTarget)}>
              <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              {t.app.back}
            </Button>
          )}
          <div className="flex items-center gap-2">
            <Logo size={28} />
            <h1 className="text-lg font-semibold text-gray-900">{t.app.name}</h1>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <UserLoginBanner />
          {isInterviewRoute && selectedCandidate && (
            <>
              {hasPdf && (
                <Button variant="secondary" size="sm" onClick={toggleResume}>
                  {showPdf ? t.app.hideResume : t.app.viewResume}
                </Button>
              )}
              <Button
                variant="secondary"
                size="sm"
                onClick={() =>
                  navigate(
                    `/positions/${selectedPosition?.id}/candidates/${selectedCandidate.id}/edit`
                  )
                }
              >
                {t.app.editCandidate}
              </Button>
              {selectedCandidate.questions.length > 0 && (
                <Button
                  size="sm"
                  onClick={() =>
                    navigate(
                      `/positions/${selectedPosition?.id}/candidates/${selectedCandidate.id}/summary`
                    )
                  }
                >
                  {selectedCandidate.interviewResult ? t.app.viewSummary : t.app.generateSummary}
                </Button>
              )}
            </>
          )}
          {location.pathname === '/' && isAuthenticated && <CalendarSync />}
          <Button variant="ghost" size="sm" onClick={() => navigate('/settings')}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </Button>
        </div>
      </div>
    </header>
  );
};

const AppShell = () => {
  const location = useLocation();
  const loadForUser = usePositionStore((state) => state.loadForUser);
  const clearCurrentUser = usePositionStore((state) => state.clearCurrentUser);
  const loadSettings = useSettingsStore((state) => state.loadFromStorage);
  const feishuUser = useSettingsStore((state) => state.feishuUser);
  const resetInterviewUI = useInterviewUIStore((state) => state.reset);

  useTokenValidation();

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    const currentUserId = feishuUser?.id ?? null;

    if (currentUserId) {
      const migrated = migrateLegacyData(currentUserId);
      if (migrated) {
        loadSettings();
      }
      loadForUser(currentUserId);
      return;
    }

    clearCurrentUser();
  }, [clearCurrentUser, feishuUser?.id, loadForUser]);

  useEffect(() => {
    if (!location.pathname.endsWith('/interview')) {
      resetInterviewUI();
    }
  }, [location.pathname, resetInterviewUI]);

  const isWideLayout = location.pathname.endsWith('/interview');
  const containerClass = isWideLayout ? 'w-full' : 'max-w-4xl mx-auto';

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader />
      <main className={`${containerClass} px-4 py-4`}>
        <Suspense fallback={<LoadingScreen />}>
          <Outlet />
        </Suspense>
      </main>
    </div>
  );
};

function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<DashboardPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="positions/new" element={<PositionFormPage />} />
        <Route path="positions/:positionId" element={<PositionDetailPage />} />
        <Route path="positions/:positionId/edit" element={<PositionFormPage />} />
        <Route path="positions/:positionId/candidates/new" element={<CandidateFormPage />} />
        <Route path="positions/:positionId/candidates/:candidateId/edit" element={<CandidateFormPage />} />
        <Route path="positions/:positionId/candidates/:candidateId/interview" element={<InterviewPage />} />
        <Route path="positions/:positionId/candidates/:candidateId/summary" element={<SummaryPage />} />
        <Route path="404" element={<NotFoundPage />} />
        <Route path="*" element={<Navigate to="/404" replace />} />
      </Route>
    </Routes>
  );
}

export default App;
