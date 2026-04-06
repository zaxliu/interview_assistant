import { useEffect, useMemo, useState } from 'react';
import {
  getMetricsAdminMe,
  getMetricsAi,
  getMetricsAiFailures,
  getMetricsErrorDetail,
  getMetricsErrors,
  getMetricsFeedback,
  getMetricsFunnel,
  getMetricsOverview,
  getMetricsTimeseries,
  loginToUsageAdmin,
  logoutUsageAdmin,
  type MetricsAdminUser,
  type MetricsAiModelSummary,
  type MetricsErrorEvent,
  type MetricsErrorSummary,
  type MetricsFeedbackSummary,
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
const formatDateTime = (value: string | undefined) => (value ? new Date(value).toLocaleString() : '-');

const DetailSection = ({
  title,
  children,
  defaultOpen = false,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) => (
  <details className="rounded-lg border border-gray-200 bg-white" open={defaultOpen}>
    <summary className="cursor-pointer list-none px-4 py-3 text-xs font-medium text-gray-700">
      {title}
    </summary>
    <div className="border-t border-gray-100 px-4 py-3">{children}</div>
  </details>
);

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
    { label: '1天', days: 1 },
    { label: '3天', days: 3 },
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
  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
    {[
      { label: '访客数', value: formatNumber(overview.uniqueVisitors) },
      { label: '总事件', value: formatNumber(overview.totalEvents) },
      { label: 'AI 调用', value: formatNumber(overview.totalAiCalls) },
      { label: '失败率', value: formatPercent(overview.failureRate) },
    ].map((item) => (
      <Card key={item.label}>
        <CardBody>
          <div className="text-xs text-gray-500">{item.label}</div>
          <div className="mt-3 text-3xl font-semibold tracking-tight text-gray-900">{item.value}</div>
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
        <div className="grid grid-cols-1 gap-3">
          {timeseries.length === 0 && (
            <div className="text-sm text-gray-500">当前时间范围内暂无数据。</div>
          )}
          {timeseries.map((point) => (
            <div key={point.bucket} className="grid gap-2 text-xs md:grid-cols-[130px,1fr,140px] md:items-center md:gap-3">
              <span className="text-gray-500">{point.bucket}</span>
              <div className="h-2 rounded-full bg-gray-100">
                <div
                  className="h-2 rounded-full bg-emerald-500"
                  style={{ width: `${Math.max(6, (point.totalEvents / maxValue) * 100)}%` }}
                />
              </div>
              <span className="text-gray-700 md:text-right">
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

const FeedbackPanel = ({ feedback }: { feedback: MetricsFeedbackSummary | null }) => (
  <Card>
    <CardHeader>
      <h2 className="text-sm font-medium text-gray-900">反馈闭环看板</h2>
    </CardHeader>
    <CardBody className="space-y-4">
      {!feedback ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          反馈闭环数据加载失败，请稍后重试。
        </div>
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-4 text-sm">
            <div>
              <div className="text-gray-500">问题采纳率</div>
              <div className="mt-1 font-semibold text-gray-900">{formatPercent(feedback.totals.questionAdoptionRate)}</div>
            </div>
            <div>
              <div className="text-gray-500">问题改写率</div>
              <div className="mt-1 font-semibold text-gray-900">{formatPercent(feedback.totals.questionRewriteRate)}</div>
            </div>
            <div>
              <div className="text-gray-500">面评改写事件</div>
              <div className="mt-1 font-semibold text-gray-900">{formatNumber(feedback.totals.summaryRewritten)}</div>
            </div>
            <div>
              <div className="text-gray-500">指引命中率</div>
              <div className="mt-1 font-semibold text-gray-900">{formatPercent(feedback.totals.guidanceHitRate)}</div>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-left text-gray-500">
                <tr>
                  <th className="pb-2 pr-4">岗位</th>
                  <th className="pb-2 pr-4 text-right">采纳率</th>
                  <th className="pb-2 pr-4 text-right">改写率</th>
                  <th className="pb-2 pr-4 text-right">面评改写</th>
                  <th className="pb-2 pr-0 text-right">指引生成</th>
                </tr>
              </thead>
              <tbody>
                {feedback.byPosition.length === 0 && (
                  <tr>
                    <td className="py-2 text-gray-500" colSpan={5}>暂无反馈闭环数据。</td>
                  </tr>
                )}
                {feedback.byPosition.map((item) => (
                  <tr key={item.positionId} className="border-t border-gray-100 text-gray-700">
                    <td className="py-2 pr-4 font-medium">{item.positionId}</td>
                    <td className="py-2 pr-4 text-right">{formatPercent(item.questionAdoptionRate)}</td>
                    <td className="py-2 pr-4 text-right">{formatPercent(item.questionRewriteRate)}</td>
                    <td className="py-2 pr-4 text-right">{formatNumber(item.summaryRewritten)}</td>
                    <td className="py-2 pr-0 text-right">{formatNumber(item.guidanceGenerated)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </CardBody>
  </Card>
);

const ErrorPanel = ({
  aiFailures,
  errors,
  selectedError,
  errorDetail,
  featureFilter,
  categoryFilter,
  searchTerm,
  featureOptions,
  categoryOptions,
  onFeatureFilterChange,
  onCategoryFilterChange,
  onSearchTermChange,
  onSelect,
}: {
  aiFailures: MetricsErrorEvent[];
  errors: MetricsErrorSummary[];
  selectedError: string | null;
  errorDetail: { error: MetricsErrorEvent; related: MetricsErrorEvent[] } | null;
  featureFilter: string;
  categoryFilter: string;
  searchTerm: string;
  featureOptions: string[];
  categoryOptions: string[];
  onFeatureFilterChange: (value: string) => void;
  onCategoryFilterChange: (value: string) => void;
  onSearchTermChange: (value: string) => void;
  onSelect: (id: string) => void;
}) => (
  <div className="space-y-4">
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-medium text-gray-900">错误筛选</h2>
          <span className="text-xs text-gray-500">顶部筛选会即时刷新错误列表</span>
        </div>
      </CardHeader>
      <CardBody>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[1fr,180px,180px,auto]">
          <input
            value={searchTerm}
            onChange={(event) => onSearchTermChange(event.target.value)}
            placeholder="搜索错误消息、页面、版本"
            className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
          />
          <select
            value={featureFilter}
            onChange={(event) => onFeatureFilterChange(event.target.value)}
            className="rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
          >
            <option value="">全部功能</option>
            {featureOptions.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
          <select
            value={categoryFilter}
            onChange={(event) => onCategoryFilterChange(event.target.value)}
            className="rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
          >
            <option value="">全部分类</option>
            {categoryOptions.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
          <div className="flex items-center justify-end text-xs text-gray-500">
            共 {formatNumber(errors.length)} 条聚合错误
          </div>
        </div>
      </CardBody>
    </Card>

    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-medium text-gray-900">AI 失败事件</h2>
          <span className="text-xs text-gray-500">原始失败事件，可与上方 AI 失败次数直接对应</span>
        </div>
      </CardHeader>
      <CardBody className="px-0">
        <div className="max-h-[32vh] overflow-auto">
          <table className="min-w-[860px] w-full text-sm">
            <thead className="text-left text-gray-500">
              <tr>
                <th className="px-4 pb-3">时间</th>
                <th className="pb-3 pr-4">模型</th>
                <th className="pb-3 pr-4">功能</th>
                <th className="pb-3 pr-4">事件</th>
                <th className="pb-3 pr-4">错误</th>
              </tr>
            </thead>
            <tbody>
              {aiFailures.length === 0 && (
                <tr>
                  <td className="px-4 py-6 text-gray-500" colSpan={5}>当前筛选条件下暂无 AI 失败事件。</td>
                </tr>
              )}
              {aiFailures.map((item) => (
                <tr
                  key={item.id}
                  className={`border-t border-gray-100 text-gray-700 cursor-pointer transition-colors ${
                    selectedError === item.id ? 'bg-amber-50/80' : 'hover:bg-gray-50'
                  }`}
                  onClick={() => onSelect(item.id)}
                >
                  <td className="px-4 py-3 align-top text-xs text-gray-500">{formatDateTime(item.occurredAt || item.receivedAt)}</td>
                  <td className="py-3 pr-4 align-top text-xs text-gray-700">{item.model || '-'}</td>
                  <td className="py-3 pr-4 align-top text-xs text-gray-600">{item.feature || '-'}</td>
                  <td className="py-3 pr-4 align-top text-xs text-gray-600">{item.eventName || '-'}</td>
                  <td className="py-3 pr-4 align-top">
                    <div className="max-w-[420px] space-y-1">
                      <div className="line-clamp-2 font-medium text-gray-900" title={item.errorMessage || item.errorCode || item.fingerprint}>
                        {item.errorMessage || item.errorCode || item.fingerprint || '-'}
                      </div>
                      <div className="text-[11px] text-gray-500">
                        {item.page || '-'} · {item.errorCategory || '-'}
                      </div>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardBody>
    </Card>

    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr),minmax(360px,0.88fr)]">
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-medium text-gray-900">错误列表</h2>
          <span className="text-xs text-gray-500">按错误指纹聚合，点击查看最近样本</span>
        </div>
      </CardHeader>
      <CardBody className="px-0">
        <div className="max-h-[70vh] overflow-auto">
          <table className="min-w-[760px] w-full text-sm">
            <thead className="text-left text-gray-500">
              <tr>
                <th className="px-4 pb-3">最近时间</th>
                <th className="pb-3 pr-4">分类</th>
                <th className="pb-3 pr-4">功能</th>
                <th className="pb-3 pr-4">错误</th>
                <th className="pb-3 pr-4 text-right">次数</th>
                <th className="pb-3 pr-4 text-right">用户数</th>
              </tr>
            </thead>
            <tbody>
              {errors.length === 0 && (
                <tr>
                  <td className="px-4 py-6 text-gray-500" colSpan={6}>当前时间范围内暂无错误数据。</td>
                </tr>
              )}
              {errors.map((item) => (
                <tr
                  key={item.latestEventId}
                  className={`border-t border-gray-100 text-gray-700 cursor-pointer transition-colors ${
                    selectedError === item.latestEventId ? 'bg-rose-50/80' : 'hover:bg-gray-50'
                  }`}
                  onClick={() => onSelect(item.latestEventId)}
                >
                  <td className="px-4 py-3 align-top text-xs text-gray-500">{formatDateTime(item.latestOccurredAt)}</td>
                  <td className="py-3 pr-4 align-top">
                    <span className="inline-flex rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700">
                      {item.errorCategory || '-'}
                    </span>
                  </td>
                  <td className="py-3 pr-4 align-top text-xs text-gray-600">{item.feature || '-'}</td>
                  <td className="py-3 pr-4 align-top">
                    <div className="max-w-[360px] space-y-1">
                      <div className="line-clamp-2 font-medium text-gray-900" title={item.errorMessage || item.errorCode}>
                        {item.errorMessage || item.errorCode || item.fingerprint}
                      </div>
                      <div className="text-[11px] text-gray-500">
                        {item.latestPage || '-'} · {item.latestAppVersion || '-'}
                      </div>
                    </div>
                  </td>
                  <td className="py-3 pr-4 align-top text-right font-medium">{formatNumber(item.count)}</td>
                  <td className="py-3 pr-4 align-top text-right">{formatNumber(item.uniqueClients)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardBody>
    </Card>

    <Card className="xl:sticky xl:top-24 xl:self-start">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-medium text-gray-900">错误详情</h2>
          {errorDetail?.error.fingerprint && (
            <span className="max-w-full truncate text-[11px] text-gray-500">
              指纹：{errorDetail.error.fingerprint}
            </span>
          )}
        </div>
      </CardHeader>
      <CardBody className="max-h-[70vh] space-y-4 overflow-auto text-sm">
        {!errorDetail && <div className="py-8 text-gray-500">选择一条错误查看详情。</div>}
        {errorDetail && (
          <>
            <div className="rounded-lg border border-rose-100 bg-rose-50/70 p-4">
              <div className="text-xs text-rose-700">错误消息</div>
              <div className="mt-2 font-medium leading-6 text-rose-950 break-all">
                {errorDetail.error.errorMessage || errorDetail.error.errorCode || '-'}
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <div className="text-xs text-gray-500">分类</div>
                <div className="mt-1 text-gray-800">{errorDetail.error.errorCategory || '-'}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500">功能</div>
                <div className="mt-1 text-gray-800">{errorDetail.error.feature || '-'}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500">页面</div>
                <div className="mt-1 text-gray-800 break-all">{errorDetail.error.page || '-'}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500">最近发生</div>
                <div className="mt-1 text-gray-800">{formatDateTime(errorDetail.error.occurredAt)}</div>
              </div>
            </div>
            {errorDetail.error.requestContext && (
              <DetailSection title="请求上下文" defaultOpen>
                <pre className="overflow-auto rounded-lg bg-gray-50 p-3 text-xs leading-5 text-gray-700 whitespace-pre-wrap">
                  {JSON.stringify(errorDetail.error.requestContext, null, 2)}
                </pre>
              </DetailSection>
            )}
            {errorDetail.error.reproContext && (
              <DetailSection title="复现上下文">
                <pre className="overflow-auto rounded-lg bg-gray-50 p-3 text-xs leading-5 text-gray-700 whitespace-pre-wrap">
                  {JSON.stringify(errorDetail.error.reproContext, null, 2)}
                </pre>
              </DetailSection>
            )}
            {errorDetail.error.inputSnapshot && (
              <DetailSection title="输入快照（已脱敏）">
                <pre className="overflow-auto rounded-lg bg-gray-50 p-3 text-xs leading-5 text-gray-700 whitespace-pre-wrap">
                  {JSON.stringify(errorDetail.error.inputSnapshot, null, 2)}
                </pre>
              </DetailSection>
            )}
            {errorDetail.error.breadcrumbs && errorDetail.error.breadcrumbs.length > 0 && (
              <DetailSection title="最近操作步骤">
                <div className="mt-2 space-y-2">
                  {errorDetail.error.breadcrumbs.map((breadcrumb) => (
                    <div key={`${breadcrumb.at}-${breadcrumb.eventName}`} className="rounded-lg border border-gray-100 bg-gray-50 p-3 text-xs text-gray-700">
                      <div className="font-medium text-gray-800">{breadcrumb.eventName}</div>
                      <div className="mt-1">{formatDateTime(breadcrumb.at)} · {breadcrumb.page || '-'}</div>
                    </div>
                  ))}
                </div>
              </DetailSection>
            )}
            {errorDetail.error.errorStack && (
              <DetailSection title="错误栈">
                <pre className="max-h-72 overflow-auto rounded-lg bg-rose-50 p-3 text-xs leading-5 text-rose-900 whitespace-pre-wrap">
                  {errorDetail.error.errorStack}
                </pre>
              </DetailSection>
            )}
            {errorDetail.related.length > 0 && (
              <DetailSection title="同类错误最近样本">
                <div className="mt-2 space-y-2">
                  {errorDetail.related.map((item) => (
                    <div key={item.id} className="rounded-lg border border-gray-100 bg-gray-50 p-3 text-xs text-gray-700">
                      <div className="text-gray-500">{formatDateTime(item.occurredAt)}</div>
                      <div className="mt-1 break-all">{item.errorMessage || item.errorCode || '-'}</div>
                    </div>
                  ))}
                </div>
              </DetailSection>
            )}
          </>
        )}
      </CardBody>
    </Card>
    </div>
  </div>
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
  const [feedbackSummary, setFeedbackSummary] = useState<MetricsFeedbackSummary | null>(null);
  const [errors, setErrors] = useState<MetricsErrorSummary[]>([]);
  const [aiFailures, setAiFailures] = useState<MetricsErrorEvent[]>([]);
  const [selectedErrorId, setSelectedErrorId] = useState<string | null>(null);
  const [errorDetail, setErrorDetail] = useState<{ error: MetricsErrorEvent; related: MetricsErrorEvent[] } | null>(null);
  const [featureFilter, setFeatureFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [authState, setAuthState] = useState<'loading' | 'unauthorized' | 'forbidden' | 'ready' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const authHint = useMemo(() => new URLSearchParams(window.location.search).get('adminAuth'), []);

  const filteredErrors = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();
    return errors.filter((item) => {
      if (!keyword) return true;
      const scope = [
        item.errorMessage,
        item.errorCode,
        item.latestPage,
        item.latestAppVersion,
        item.fingerprint,
      ].join(' ').toLowerCase();
      return scope.includes(keyword);
    });
  }, [errors, searchTerm]);

  const filteredAiFailures = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();
    return aiFailures.filter((item) => {
      if (!keyword) return true;
      const scope = [
        item.errorMessage,
        item.errorCode,
        item.page,
        item.model,
        item.eventName,
        item.errorCategory,
        item.fingerprint,
      ].join(' ').toLowerCase();
      return scope.includes(keyword);
    });
  }, [aiFailures, searchTerm]);

  const featureOptions = useMemo(
    () => Array.from(new Set(errors.map((item) => item.feature).filter(Boolean))) as string[],
    [errors]
  );
  const categoryOptions = useMemo(
    () => Array.from(new Set(errors.map((item) => item.errorCategory).filter(Boolean))) as string[],
    [errors]
  );

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

        const results = await Promise.allSettled([
          getMetricsOverview(range.from, range.to),
          getMetricsFunnel(range.from, range.to),
          getMetricsTimeseries(range.from, range.to),
          getMetricsAi(range.from, range.to),
          getMetricsFeedback(range.from, range.to),
          getMetricsErrors(range.from, range.to, {
            feature: featureFilter || undefined,
            errorCategory: categoryFilter || undefined,
          }),
          getMetricsAiFailures(range.from, range.to, {
            feature: featureFilter || undefined,
            errorCategory: categoryFilter || undefined,
          }),
        ]);

        if (cancelled) {
          return;
        }

        // Extract successful results, set null for failed ones
        const [overviewResult, funnelResult, timeseriesResult, aiResult, feedbackResult, errorsResult, aiFailuresResult] = results;

        if (overviewResult.status === 'fulfilled') {
          setOverview(overviewResult.value.overview);
        }
        if (funnelResult.status === 'fulfilled') {
          setFunnel(funnelResult.value.funnel);
        }
        if (timeseriesResult.status === 'fulfilled') {
          setTimeseries(timeseriesResult.value.timeseries);
        }
        if (aiResult.status === 'fulfilled') {
          setAiSummary(aiResult.value.ai);
        }
        if (feedbackResult.status === 'fulfilled') {
          setFeedbackSummary(feedbackResult.value.feedback);
        } else {
          // Feedback fetch failed — set null so panel can show error state
          setFeedbackSummary(null);
        }
        if (errorsResult.status === 'fulfilled') {
          setErrors(errorsResult.value.errors);
        }
        if (aiFailuresResult.status === 'fulfilled') {
          setAiFailures(aiFailuresResult.value.events);
        }

        setSelectedErrorId((current) => {
          const errorsData = errorsResult.status === 'fulfilled' ? errorsResult.value.errors : [];
          const aiFailuresData = aiFailuresResult.status === 'fulfilled' ? aiFailuresResult.value.events : [];
          const currentStillExists = errorsData.some((item) => item.latestEventId === current)
            || aiFailuresData.some((item) => item.id === current);
          if (currentStillExists) return current;
          return aiFailuresData[0]?.id || errorsData[0]?.latestEventId || null;
        });
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
  }, [authHint, categoryFilter, featureFilter, range.from, range.to]);

  useEffect(() => {
    let cancelled = false;

    if (!selectedErrorId || authState !== 'ready') {
      setErrorDetail(null);
      return;
    }

    void getMetricsErrorDetail(selectedErrorId)
      .then((detail) => {
        if (!cancelled) {
          setErrorDetail(detail);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setErrorDetail(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [authState, selectedErrorId]);

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
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <h1 className="text-sm font-medium text-gray-900">使用数据后台</h1>
        </CardHeader>
        <CardBody className="space-y-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="text-base font-semibold text-gray-900">{adminUser?.name}</div>
              <div className="mt-1 text-xs text-gray-500">{adminUser?.id}</div>
            </div>
            <div className="flex flex-col items-start gap-3 lg:items-end">
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

      <div className="grid gap-4 xl:grid-cols-[0.9fr,1.1fr]">
        <FunnelPanel funnel={funnel} />
        <TimeseriesPanel timeseries={timeseries} />
      </div>

      <AiPanel totals={aiSummary.totals} byModel={aiSummary.byModel} />
      <FeedbackPanel feedback={feedbackSummary} />

      <ErrorPanel
        aiFailures={filteredAiFailures}
        errors={filteredErrors}
        selectedError={selectedErrorId}
        errorDetail={errorDetail}
        featureFilter={featureFilter}
        categoryFilter={categoryFilter}
        searchTerm={searchTerm}
        featureOptions={featureOptions}
        categoryOptions={categoryOptions}
        onFeatureFilterChange={setFeatureFilter}
        onCategoryFilterChange={setCategoryFilter}
        onSearchTermChange={setSearchTerm}
        onSelect={setSelectedErrorId}
      />
    </div>
  );
}
