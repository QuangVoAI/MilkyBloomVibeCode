import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AdminContent } from '../components';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { RefreshCw, MessagesSquare, AlertCircle, GitBranch, Sparkles, Filter } from 'lucide-react';
import { getChatbotCases, getChatbotInsights } from '@/services';
import { readQueryString, updateQueryParams } from '@/utils/queryState';

const MetricCard = ({ title, value, subtitle, icon: Icon }) => (
  <Card className="border-stone-200 shadow-sm">
    <CardContent className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-wide text-stone-500">{title}</div>
          <div className="mt-1 text-2xl font-extrabold text-stone-900">{value}</div>
          {subtitle && <div className="mt-1 text-xs text-stone-500">{subtitle}</div>}
        </div>
        {Icon && (
          <div className="rounded-xl bg-stone-100 p-2 text-stone-700">
            <Icon className="h-4 w-4" />
          </div>
        )}
      </div>
    </CardContent>
  </Card>
);

const CaseTable = ({ title, description, items, badgeLabel, viewMode = 'default' }) => (
  <div className="admin-card">
    <div className="flex items-start justify-between gap-3">
      <div>
        <h3 className="text-sm font-semibold text-stone-700">{title}</h3>
        <p className="text-xs text-stone-500">{description}</p>
      </div>
      <span className="rounded-full bg-stone-900 px-3 py-1 text-xs font-semibold text-white">
        {items.length}
      </span>
    </div>
    <div className="mt-4 overflow-hidden rounded-xl border border-stone-200">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-stone-200 text-sm">
          <thead className="bg-stone-50">
            <tr className="text-left text-xs font-semibold uppercase tracking-wide text-stone-500">
              <th className="px-3 py-2">Question</th>
              <th className="px-3 py-2">Intent</th>
              <th className="px-3 py-2">{badgeLabel}</th>
              <th className="px-3 py-2">Confidence</th>
              <th className="px-3 py-2">Time</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100 bg-white">
            {items.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-stone-500">
                  No cases yet
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <tr key={item.traceId || `${item.timestamp}-${item.question}`} className="align-top">
                  <td className="px-3 py-3">
                    <div className="max-w-[26rem] whitespace-pre-wrap text-stone-800">{item.question}</div>
                    <div className="mt-1 text-[11px] text-stone-500">{item.answerPreview || 'No preview'}</div>
                  </td>
                  <td className="px-3 py-3">
                    <div className="font-medium text-stone-800">{item.intent}</div>
                    <div className="text-[11px] text-stone-500">{item.action}</div>
                  </td>
                  <td className="px-3 py-3">
                    <span className="inline-flex rounded-full bg-stone-100 px-2.5 py-1 text-xs font-semibold text-stone-700">
                      {viewMode === 'low-confidence'
                        ? (item.lowConfidence ? 'Yes' : 'No')
                        : viewMode === 'clarify-reason'
                          ? (item.clarifyReason || (item.clarificationNeeded ? 'clarify' : 'n/a'))
                          : (badgeLabel === 'Clarify' ? (item.clarificationNeeded ? 'Yes' : 'No') : (item.fallbackUsed ? 'Yes' : 'No'))}
                    </span>
                    <div className="mt-1 text-[11px] text-stone-500">
                      {viewMode === 'low-confidence'
                        ? `router ${Math.round((item.routerConfidence || 0) * 100)}% / action ${Math.round((item.actionConfidence || 0) * 100)}%`
                        : viewMode === 'clarify-reason'
                          ? `${item.routerMethod}/${item.actionMethod || 'n/a'}`
                          : (badgeLabel === 'Clarify' ? item.routerMethod : `${item.routerMethod}/${item.actionMethod || 'n/a'}`)}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-stone-700">
                    {(Math.round((item.routerConfidence || 0) * 100))}%
                  </td>
                  <td className="px-3 py-3 text-[11px] text-stone-500">
                    {item.timestamp ? new Date(item.timestamp).toLocaleString() : 'n/a'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  </div>
);

const ChatbotQuality = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [summary, setSummary] = useState(null);
  const [clarifyCases, setClarifyCases] = useState([]);
  const [fallbackCases, setFallbackCases] = useState([]);
  const [focusMode, setFocusMode] = useState(readQueryString(searchParams, 'focus', 'all'));
  const [clarifyReason, setClarifyReason] = useState(readQueryString(searchParams, 'reason', 'all'));
  const [focusCases, setFocusCases] = useState([]);
  const [clarifyReasons, setClarifyReasons] = useState([]);

  useEffect(() => {
    setSearchParams(
      (current) =>
        updateQueryParams(current, [
          { key: 'focus', value: focusMode, defaultValue: 'all' },
          {
            key: 'reason',
            value: focusMode === 'clarify-reason' ? clarifyReason : 'all',
            defaultValue: 'all',
          },
        ]),
      { replace: true },
    );
  }, [clarifyReason, focusMode, setSearchParams]);

  const loadData = useCallback(async () => {
    try {
      setError('');
      setRefreshing(true);
      const [insightsRes, casesRes] = await Promise.all([
        getChatbotInsights(),
        getChatbotCases({
          limit: 8,
          mode: focusMode,
          reason: focusMode === 'clarify-reason' && clarifyReason !== 'all' ? clarifyReason : undefined,
          threshold: 0.45,
        }),
      ]);
      setSummary(insightsRes?.data || null);
      setClarifyCases(casesRes?.data?.clarifyCases || []);
      setFallbackCases(casesRes?.data?.fallbackCases || []);
      setFocusCases(casesRes?.data?.cases || casesRes?.data?.lowConfidenceCases || []);
      setClarifyReasons(casesRes?.data?.clarifyReasons || []);
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Failed to load chatbot quality');
      setSummary(null);
      setClarifyCases([]);
      setFallbackCases([]);
      setFocusCases([]);
      setClarifyReasons([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [clarifyReason, focusMode]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const metrics = useMemo(() => [
    {
      title: 'Clarify Rate',
      value: `${Math.round((summary?.clarifyRate || 0) * 100)}%`,
      subtitle: `Total traces: ${summary?.total ?? 0}`,
      icon: AlertCircle,
    },
    {
      title: 'Keyword Fallback',
      value: `${Math.round((summary?.keywordFallbackRate || 0) * 100)}%`,
      subtitle: 'semantic -> keyword',
      icon: GitBranch,
    },
    {
      title: 'Avg Router Confidence',
      value: `${Math.round((summary?.avgRouterConfidence || 0) * 100)}%`,
      subtitle: 'router level',
      icon: MessagesSquare,
    },
  ], [summary]);

  const focusTitle = useMemo(() => {
    if (focusMode === 'low-confidence') return 'Low Confidence Cases';
    if (focusMode === 'clarify-reason') return 'Clarify Reason Cases';
    return 'Focused Cases';
  }, [focusMode]);

  const focusDescription = useMemo(() => {
    if (focusMode === 'low-confidence') return 'Traces with router/action confidence below the threshold.';
    if (focusMode === 'clarify-reason') return 'Clarify traces grouped by clarify_reason.';
    return 'A focused drilldown for the most interesting traces.';
  }, [focusMode]);

  const header = (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h2 className="text-xl sm:text-2xl font-semibold text-stone-900">Chatbot Quality</h2>
        <p className="text-sm text-stone-500">
          Top clarify cases and keyword fallback cases from live chatbot traces.
        </p>
      </div>
      <Button
        onClick={loadData}
        variant="outline"
        className="inline-flex items-center gap-2 border-stone-200 bg-white text-stone-700 hover:bg-stone-50"
      >
        <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
        Refresh
      </Button>
    </div>
  );

  return (
    <AdminContent loading={loading} error={error} onRetry={loadData} header={header}>
      <div className="space-y-6">
        {summary?.total === 0 && (
          <Card className="border-dashed border-stone-300 bg-stone-50">
            <CardContent className="flex items-start gap-3 p-4">
              <div className="rounded-xl bg-stone-900 p-2 text-white">
                <Sparkles className="h-4 w-4" />
              </div>
              <div>
                <div className="text-sm font-semibold text-stone-900">No live chatbot traces yet</div>
                <div className="text-sm text-stone-600">
                  Run the chatbot in production or populate runtime metrics / transcript export để màn này hiện dữ liệu thật.
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="grid gap-4 md:grid-cols-3">
          {metrics.map((metric) => (
            <MetricCard key={metric.title} {...metric} />
          ))}
        </div>

        <div className="admin-card">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold text-stone-700">
                <Filter className="h-4 w-4" />
                Drilldown Filter
              </div>
              <p className="text-xs text-stone-500">
                Chuyển qua lại giữa low confidence và clarify_reason để soi case thật nhanh.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {[
                { id: 'all', label: 'All cases' },
                { id: 'low-confidence', label: 'Low confidence' },
                { id: 'clarify-reason', label: 'Clarify reason' },
              ].map((item) => (
                <Button
                  key={item.id}
                  type="button"
                  variant={focusMode === item.id ? 'default' : 'outline'}
                  className={focusMode === item.id ? 'bg-stone-900 text-white' : 'border-stone-200 bg-white text-stone-700'}
                  onClick={() => setFocusMode(item.id)}
                >
                  {item.label}
                </Button>
              ))}
            </div>
          </div>

          {focusMode === 'clarify-reason' && (
            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
              <label className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                Reason
              </label>
              <select
                value={clarifyReason}
                onChange={(e) => setClarifyReason(e.target.value)}
                className="min-w-[220px] rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm text-stone-700 outline-none focus:border-stone-400"
              >
                <option value="all">All reasons</option>
                {(clarifyReasons || []).map((item) => (
                  <option key={item.label} value={item.label}>
                    {item.label} ({item.count})
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <CaseTable
          title={focusTitle}
          description={focusDescription}
          items={focusCases}
          badgeLabel={focusMode === 'clarify-reason' ? 'Reason' : 'Confidence'}
          viewMode={focusMode === 'all' ? 'low-confidence' : focusMode}
        />

        <CaseTable
          title="Top Clarify Cases"
          description="Questions that should be asked back instead of guessed."
          items={clarifyCases}
          badgeLabel="Clarify"
        />

        <CaseTable
          title="Top Fallback Cases"
          description="Questions that fell through semantic matching and used keyword fallback."
          items={fallbackCases}
          badgeLabel="Fallback"
        />
      </div>
    </AdminContent>
  );
};

export default ChatbotQuality;
