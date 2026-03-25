import { useEffect, useMemo, useState } from 'react';
import {
  getMetricsAdminMe,
  getMetricsAi,
  getMetricsFunnel,
  getMetricsOverview,
  getMetricsTimeseries,
  loginToUsageAdmin,
  logoutUsageAdmin,
  type MetricsAdminUser,
  type MetricsAiModelSummary,
  type MetricsFunnelStep,
  type MetricsOverview,
  type MetricsTimeseriesPoint,
} from '@/api/metrics';
import { Button, Card, CardBody, CardHeader } from '@/components/ui';

const getDefaultRange = () => {
  const to = new Date();
  const from = new Date(to.getTime() - (30 * 24 * 60 * 60 * 1000));
  return {
    from: from.toISOString(),
    to: to.toISOString(),
  };
};

const formatNumber = (value: number) => new Intl.NumberFormat('zh-CN').format(value);
const formatPercent = (value: number) => `${(value * 100).toFixed(1)}%`;

const EVENT_LABELS: Record<string, string> = {
  app_opened: '打开应用',
  feishu_login_succeeded: '飞书登录',
  calendar_sync_succeeded: '日历同步',
  candidate_created: '创建候选人',
  resume_import_succeeded: '导入简历',
  question_generation_succeeded: '生成问题',
  summary_generation_succeeded: '生成总结',
  feishu_export_succeeded: '导出飞书',
};

const RangeSelector = ({
  from,
  to,
  onChange,
}: {
  from: string;
  to: string;
  onChange: (next: { from: string; to: string }) => void;
}) => {
  const presets = [
    { label: '7天', days: 7 },
    { label: '30天', days: 30 },
    { label: '90天', days: 90 },
  ];

  return (
    <div className="flex flex-wrap items-center gap-2">
      {presets.map((preset) => (
        <Button
          key={preset.days}
          variant="secondary"
          size="sm"
          onClick={() => {
            const nextTo = new Date();
            const nextFrom = new Date(nextTo.getTime() - (preset.days * 24 * 60 * 60 * 1000));
            onChange({
              from: nextFrom.toISOString(),
              to: nextTo.toISOString(),
            });
          }}
        >
          最近{preset.label}
        </Button>
      ))}
      <span className="text-xs text-gray-500">
        {new Date(from).toLocaleString()} - {new Date(to).toLocaleString()}
      </span>
    </div>
  );
};

const OverviewCards = ({ overview }: { overview: MetricsOverview }) => (
  <div className="grid gap-3 md:grid-cols-4">
    {[
      { label: '访客数', value: formatNumber(overview.uniqueVisitors) },
      { label: '总事件', value: formatNumber(overview.totalEvents) },
      { label: 'AI 调用', value: formatNumber(overview.totalAiCalls) },
      { label: '失败率', value: formatPercent(overview.failureRate) },
    ].map((item) => (
      <Card key={item.label}>
        <CardBody>
          <div className="text-xs text-gray-500">{item.label}</div>
          <div className="mt-2 text-2xl font-semibold text-gray-900">{item.value}</div>
        </CardBody>
      </Card>
    ))}
  </div>
);

const FunnelPanel = ({ funnel }: { funnel: MetricsFunnelStep[] }) => {
  const maxValue = Math.max(...funnel.map((item) => item.uniqueClients), 1);

  return (
    <Card>
      <CardHeader>
        <h2 className="text-sm font-medium text-gray-900">使用漏斗</h2>
      </CardHeader>
      <CardBody>
        <div className="space-y-3">
          {funnel.map((step) => (
            <div key={step.eventName}>
              <div className="mb-1 flex items-center justify-between text-sm text-gray-700">
                <span>{EVENT_LABELS[step.eventName] || step.eventName}</span>
                <span>{formatNumber(step.uniqueClients)}</span>
              </div>
              <div className="h-2 rounded-full bg-gray-100">
                <div
                  className="h-2 rounded-full bg-sky-500"
                  style={{ width: `${Math.max(8, (step.uniqueClients / maxValue) * 100)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </CardBody>
    </Card>
  );
};

const TimeseriesPanel = ({ timeseries }: { timeseries: MetricsTimeseriesPoint[] }) => {
  const maxValue = Math.max(...timeseries.map((item) => item.totalEvents), 1);

  return (
    <Card>
      <CardHeader>
        <h2 className="text-sm font-medium text-gray-900">趋势</h2>
      </CardHeader>
      <CardBody>
        <div className="grid grid-cols-1 gap-2">
          {timeseries.length === 0 && (
            <div className="text-sm text-gray-500">当前时间范围内暂无数据。</div>
          )}
          {timeseries.map((point) => (
            <div key={point.bucket} className="grid grid-cols-[120px,1fr,120px] items-center gap-3 text-xs">
              <span className="text-gray-500">{point.bucket}</span>
              <div className="h-2 rounded-full bg-gray-100">
                <div
                  className="h-2 rounded-full bg-emerald-500"
                  style={{ width: `${Math.max(6, (point.totalEvents / maxValue) * 100)}%` }}
                />
              </div>
              <span className="text-right text-gray-700">
                {formatNumber(point.totalEvents)} 事件 / {formatNumber(point.totalAiCalls)} AI
              </span>
            </div>
          ))}
        </div>
      </CardBody>
    </Card>
  );
};

const AiPanel = ({
  totals,
  byModel,
}: {
  totals: {
    calls: number;
    failures: number;
    inputTokens: number;
    cachedTokens: number;
    outputTokens: number;
  };
  byModel: MetricsAiModelSummary[];
}) => (
  <Card>
    <CardHeader>
      <h2 className="text-sm font-medium text-gray-900">AI 成本与稳定性</h2>
    </CardHeader>
    <CardBody>
      <div className="mb-4 grid gap-3 md:grid-cols-4 text-sm">
        <div>
          <div className="text-gray-500">调用次数</div>
          <div className="mt-1 font-semibold text-gray-900">{formatNumber(totals.calls)}</div>
        </div>
        <div>
          <div className="text-gray-500">输入 Token</div>
          <div className="mt-1 font-semibold text-gray-900">{formatNumber(totals.inputTokens)}</div>
        </div>
        <div>
          <div className="text-gray-500">缓存 Token</div>
          <div className="mt-1 font-semibold text-gray-900">{formatNumber(totals.cachedTokens)}</div>
        </div>
        <div>
          <div className="text-gray-500">输出 Token</div>
          <div className="mt-1 font-semibold text-gray-900">{formatNumber(totals.outputTokens)}</div>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="text-left text-gray-500">
            <tr>
              <th className="pb-2 pr-4">模型</th>
              <th className="pb-2 pr-4">调用</th>
              <th className="pb-2 pr-4">失败</th>
              <th className="pb-2 pr-4">输入</th>
              <th className="pb-2 pr-4">缓存</th>
              <th className="pb-2 pr-4">输出</th>
              <th className="pb-2 pr-0">平均耗时</th>
            </tr>
          </thead>
          <tbody>
            {byModel.length === 0 && (
              <tr>
                <td className="py-2 text-gray-500" colSpan={7}>暂无 AI 数据。</td>
              </tr>
            )}
            {byModel.map((item) => (
              <tr key={item.model} className="border-t border-gray-100 text-gray-700">
                <td className="py-2 pr-4 font-medium">{item.model}</td>
                <td className="py-2 pr-4">{formatNumber(item.calls)}</td>
                <td className="py-2 pr-4">{formatNumber(item.failures)}</td>
                <td className="py-2 pr-4">{formatNumber(item.inputTokens)}</td>
                <td className="py-2 pr-4">{formatNumber(item.cachedTokens)}</td>
                <td className="py-2 pr-4">{formatNumber(item.outputTokens)}</td>
                <td className="py-2 pr-0">{item.avgDurationMs === null ? '-' : `${item.avgDurationMs} ms`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </CardBody>
  </Card>
);

export default function UsageAdminPage() {
  const [range, setRange] = useState(getDefaultRange);
  const [adminUser, setAdminUser] = useState<MetricsAdminUser | null>(null);
  const [overview, setOverview] = useState<MetricsOverview | null>(null);
  const [funnel, setFunnel] = useState<MetricsFunnelStep[]>([]);
  const [timeseries, setTimeseries] = useState<MetricsTimeseriesPoint[]>([]);
  const [aiSummary, setAiSummary] = useState<{
    totals: {
      calls: number;
      failures: number;
      inputTokens: number;
      cachedTokens: number;
      outputTokens: number;
    };
    byModel: MetricsAiModelSummary[];
  } | null>(null);
  const [authState, setAuthState] = useState<'loading' | 'unauthorized' | 'forbidden' | 'ready' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const authHint = useMemo(() => new URLSearchParams(window.location.search).get('adminAuth'), []);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setAuthState('loading');
      setErrorMessage(null);

      try {
        const me = await getMetricsAdminMe();
        if (cancelled) {
          return;
        }

        setAdminUser(me.user);

        const [overviewResponse, funnelResponse, timeseriesResponse, aiResponse] = await Promise.all([
          getMetricsOverview(range.from, range.to),
          getMetricsFunnel(range.from, range.to),
          getMetricsTimeseries(range.from, range.to),
          getMetricsAi(range.from, range.to),
        ]);

        if (cancelled) {
          return;
        }

        setOverview(overviewResponse.overview);
        setFunnel(funnelResponse.funnel);
        setTimeseries(timeseriesResponse.timeseries);
        setAiSummary(aiResponse.ai);
        setAuthState('ready');
      } catch (error) {
        const status = (error as Error & { status?: number }).status;
        if (status === 401) {
          setAuthState('unauthorized');
          return;
        }
        if (status === 403 || authHint === 'forbidden') {
          setAuthState('forbidden');
          return;
        }
        setAuthState('error');
        setErrorMessage(error instanceof Error ? error.message : '加载使用数据失败');
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [authHint, range.from, range.to]);

  if (authState === 'loading') {
    return (
      <Card>
        <CardBody>正在加载使用数据后台...</CardBody>
      </Card>
    );
  }

  if (authState === 'unauthorized') {
    return (
      <Card>
        <CardHeader>
          <h1 className="text-sm font-medium text-gray-900">使用数据后台</h1>
        </CardHeader>
        <CardBody className="space-y-3">
          <p className="text-sm text-gray-600">需要使用飞书管理员身份登录后才能查看聚合统计。</p>
          <Button onClick={() => loginToUsageAdmin('/usage-admin')}>使用飞书登录</Button>
        </CardBody>
      </Card>
    );
  }

  if (authState === 'forbidden') {
    return (
      <Card>
        <CardHeader>
          <h1 className="text-sm font-medium text-gray-900">使用数据后台</h1>
        </CardHeader>
        <CardBody className="space-y-3">
          <p className="text-sm text-red-600">当前飞书账号不在管理员白名单中。</p>
          <Button variant="secondary" onClick={() => loginToUsageAdmin('/usage-admin')}>
            切换账号重新登录
          </Button>
        </CardBody>
      </Card>
    );
  }

  if (authState === 'error' || !overview || !aiSummary) {
    return (
      <Card>
        <CardHeader>
          <h1 className="text-sm font-medium text-gray-900">使用数据后台</h1>
        </CardHeader>
        <CardBody className="space-y-3">
          <p className="text-sm text-red-600">{errorMessage || '加载失败'}</p>
          <Button variant="secondary" onClick={() => window.location.reload()}>
            重新加载
          </Button>
        </CardBody>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <h1 className="text-sm font-medium text-gray-900">使用数据后台</h1>
        </CardHeader>
        <CardBody className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm font-medium text-gray-900">{adminUser?.name}</div>
              <div className="text-xs text-gray-500">{adminUser?.id}</div>
            </div>
            <div className="flex items-center gap-2">
              <RangeSelector from={range.from} to={range.to} onChange={setRange} />
              <Button
                variant="secondary"
                size="sm"
                onClick={async () => {
                  await logoutUsageAdmin();
                  window.location.reload();
                }}
              >
                退出后台
              </Button>
            </div>
          </div>
        </CardBody>
      </Card>

      <OverviewCards overview={overview} />

      <div className="grid gap-4 lg:grid-cols-[1fr,1.2fr]">
        <FunnelPanel funnel={funnel} />
        <TimeseriesPanel timeseries={timeseries} />
      </div>

      <AiPanel totals={aiSummary.totals} byModel={aiSummary.byModel} />
    </div>
  );
}
