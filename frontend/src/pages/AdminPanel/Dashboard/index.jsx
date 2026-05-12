import React, { lazy, Suspense } from 'react';
import { formatPrice, formatPriceNumber } from '@/utils/formatPrice';
import { useDashboardData } from './hooks';
import DashboardHeader from './components/DashboardHeader';
import StatCard from './components/StatCard';
import PieChart from './components/PieChart';
import BarChart from './components/BarChart';
import TinyLegend from './components/TinyLegend';

// Lazy load heavy map component (~700KB)
const BranchMap = lazy(() => import('./components/BranchMap'));

const Dashboard = () => {
  const {
    loading,
    error,
    isRefreshing,
    overview,
    revenueUpdates,
    topSelling,
    lowStock,
    categoryStats,
    branches,
    paymentSummary,
    revenueMonthData,
    totalRevenueThisYear,
    hasMonthlyRevenue,
    totalRevenue7Days,
    paymentData,
    segmentationData,
    revenue7Data,
    monthColor,
    toNumber,
    supportTicketStats,
    supportTicketAssigneeStats,
    chatbotInsights,
  } = useDashboardData();

  if (loading && !isRefreshing) {
    return (
      <div className="admin-dashboard-shell page-fade">
        <DashboardHeader />
        <div className="px-4 py-8 text-center text-stone-500">Loading dashboard...</div>
      </div>
    );
  }

  return (
    <div className="admin-dashboard-shell page-fade">
      <DashboardHeader />

      <div className="px-4">
        {error ? (
          <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
            {error}
          </div>
        ) : (
          <div className="space-y-6">
            {isRefreshing && (
              <div className="text-xs text-stone-500 bg-white/70 border border-purple-100 rounded-full inline-flex px-3 py-1 shadow-sm">
                Refreshing data...
              </div>
            )}

            {/* Stats Grid */}
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <StatCard
                title="Total Users"
                value={overview?.totalUsers || 0}
                pill="User segmentation"
                accent={`High: ${overview?.high || 0} • Medium: ${overview?.medium || 0} • Low: ${overview?.low || 0}`}
              />
              <StatCard
                title="Revenue This Year"
                value={formatPriceNumber(totalRevenueThisYear)}
                pill="Paid orders"
                accent="Cumulative 12 months"
              />
              <StatCard
                title="Last 7 Days"
                value={formatPrice(totalRevenue7Days)}
                accent={`Orders: ${revenueUpdates.reduce((s, d) => s + toNumber(d.orders), 0)}`}
              />
              <StatCard
                title="Total Revenue"
                value={formatPrice(
                  toNumber(paymentSummary?.cod) +
                    toNumber(paymentSummary?.momo) +
                    toNumber(paymentSummary?.vietqr ?? paymentSummary?.vnpay) +
                    toNumber(paymentSummary?.zalopay)
                )}
                accent="Includes COD, MoMo, VietQR, ZaloPay"
              />
            </div>

            <div className="admin-card">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-stone-700">Support Tickets</h3>
                  <p className="text-xs text-stone-500">Snapshot of tickets created by chatbot and web</p>
                </div>
                <div className="text-2xl font-extrabold text-stone-900">
                  {supportTicketStats?.total ?? 0}
                  <span className="ml-2 text-sm font-semibold text-stone-500">total</span>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-700">
                  Open
                  <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-xs font-semibold text-white">
                    {supportTicketStats?.open ?? 0}
                  </span>
                </span>
                <span className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-sm font-medium text-amber-700">
                  Pending
                  <span className="rounded-full bg-amber-600 px-2 py-0.5 text-xs font-semibold text-white">
                    {supportTicketStats?.pending ?? 0}
                  </span>
                </span>
                <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-sm font-medium text-slate-700">
                  Closed
                  <span className="rounded-full bg-slate-700 px-2 py-0.5 text-xs font-semibold text-white">
                    {supportTicketStats?.closed ?? 0}
                  </span>
                </span>
              </div>
            </div>

            <div className="admin-card">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-stone-700">Chatbot Insights</h3>
                  <p className="text-xs text-stone-500">
                    Live traces from router, action, fallback, and Vietnamese normalization
                  </p>
                </div>
                <div className="text-2xl font-extrabold text-stone-900">
                  {chatbotInsights?.total ?? 0}
                  <span className="ml-2 text-sm font-semibold text-stone-500">traces</span>
                </div>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <StatCard
                  title="Avg Router Confidence"
                  value={`${Math.round((chatbotInsights?.avgRouterConfidence || 0) * 100)}%`}
                  pill="router"
                  accent={`Low confidence: ${Math.round((chatbotInsights?.lowConfidenceRate || 0) * 100)}%`}
                />
                <StatCard
                  title="Avg Action Confidence"
                  value={`${Math.round((chatbotInsights?.avgActionConfidence || 0) * 100)}%`}
                  pill="action"
                  accent={`Clarify rate: ${Math.round((chatbotInsights?.clarifyRate || 0) * 100)}%`}
                />
                <StatCard
                  title="Keyword Fallback"
                  value={`${Math.round((chatbotInsights?.keywordFallbackRate || 0) * 100)}%`}
                  pill="fallback"
                  accent="Used when semantic similarity is too low"
                />
                <StatCard
                  title="Vietnamese OK"
                  value={`${Math.round((chatbotInsights?.vietnameseOkRate || 0) * 100)}%`}
                  pill="lang"
                  accent={chatbotInsights?.latestTraceAt ? `Latest: ${chatbotInsights.latestTraceAt}` : 'No traces yet'}
                />
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <div className="rounded-xl border border-stone-200 bg-stone-50 p-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-stone-500">Top Intents</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {(chatbotInsights?.topIntents || []).length === 0 ? (
                      <span className="text-sm text-stone-500">No data yet</span>
                    ) : (
                      chatbotInsights.topIntents.map((item) => (
                        <span key={item.label} className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-sm text-stone-700 border border-stone-200">
                          <span>{item.label}</span>
                          <span className="rounded-full bg-stone-900 px-2 py-0.5 text-xs font-semibold text-white">
                            {item.count}
                          </span>
                        </span>
                      ))
                    )}
                  </div>
                </div>
                <div className="rounded-xl border border-stone-200 bg-stone-50 p-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-stone-500">Top Actions</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {(chatbotInsights?.topActions || []).length === 0 ? (
                      <span className="text-sm text-stone-500">No data yet</span>
                    ) : (
                      chatbotInsights.topActions.map((item) => (
                        <span key={item.label} className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-sm text-stone-700 border border-stone-200">
                          <span>{item.label}</span>
                          <span className="rounded-full bg-stone-900 px-2 py-0.5 text-xs font-semibold text-white">
                            {item.count}
                          </span>
                        </span>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="admin-card">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-stone-700">Tickets by Assignee</h3>
                  <p className="text-xs text-stone-500">See workload distribution across the support team</p>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {supportTicketAssigneeStats.length === 0 ? (
                  <span className="text-sm text-stone-500">No assignee data yet</span>
                ) : (
                  supportTicketAssigneeStats.map((item) => (
                    <span
                      key={item.assigneeId || 'unassigned'}
                      className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm"
                    >
                      <span>{item.fullName || 'Unassigned'}</span>
                      <span className="rounded-full bg-slate-900 px-2 py-0.5 text-xs font-semibold text-white">
                        {item.count}
                      </span>
                    </span>
                  ))
                )}
              </div>
            </div>

            {/* Charts Row */}
            <div className="grid gap-4 lg:grid-cols-3">
              <div className="admin-card">
                <h3 className="text-sm font-semibold text-stone-700 mb-3">
                  User Segmentation Pie Chart
                </h3>
                <div className="flex items-center gap-4">
                  <PieChart data={segmentationData} colors={segmentationData.map((s) => s.color)} />
                  <TinyLegend items={segmentationData} />
                </div>
              </div>

              <div className="lg:col-span-2 admin-card">
                <h3 className="text-sm font-semibold text-stone-700 mb-3">
                  Revenue by Payment Gateway
                </h3>
                <BarChart data={paymentData} colors={paymentData.map((p) => p.color)} />
                <div className="mt-2 text-[11px] text-stone-500">
                  COD Yellow • MoMo Pink • VietQR Blue • ZaloPay Green
                </div>
              </div>
            </div>

            {/* Revenue Charts */}
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="admin-card">
                <h3 className="text-sm font-semibold text-stone-700 mb-3">
                  7-Day Revenue (Bar Chart)
                </h3>
                <BarChart data={revenue7Data} colors={revenue7Data.map(() => '#6366f1')} />
              </div>

              <div className="admin-card">
                <h3 className="text-sm font-semibold text-stone-700 mb-3">
                  Monthly Revenue (Heatmap)
                </h3>
                {hasMonthlyRevenue ? (
                  <>
                    <div className="grid grid-cols-6 md:grid-cols-12 gap-2">
                      {revenueMonthData.map((m) => {
                        const bg = monthColor(m.value);
                        return (
                          <div key={m.label} className="flex flex-col items-center gap-1">
                            <div
                              className="w-9 h-9 rounded border border-slate-200"
                              style={{ background: bg }}
                              title={`${m.label}: ${formatPrice(m.value)}`}
                            />
                            <span className="text-[11px] text-stone-600 font-medium">{m.label}</span>
                          </div>
                        );
                      })}
                    </div>
                    <div className="flex items-center gap-2 text-[11px] text-stone-500 mt-2">
                      <span>Less</span>
                      {['#e5e7eb', '#d1fae5', '#86efac', '#22c55e', '#15803d'].map((c) => (
                        <span
                          key={c}
                          className="w-4 h-3 rounded-[3px] border border-stone-200"
                          style={{ background: c }}
                        />
                      ))}
                      <span>More</span>
                    </div>
                    <div className="mt-2 text-[11px] text-stone-600">
                      Annual Total: {formatPrice(totalRevenueThisYear)} • Currency: VND
                    </div>
                  </>
                ) : (
                  <div className="text-sm text-stone-500">No monthly revenue data available</div>
                )}
              </div>
            </div>

            {/* Products Tables */}
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="admin-card">
                <h3 className="text-sm font-semibold text-stone-700 mb-3">Best Selling Products</h3>
                <div className="space-y-3">
                  {topSelling.length === 0 && <div className="text-sm text-stone-500">No data</div>}
                  {topSelling.slice(0, 5).map((item, index) => (
                    <div key={item._id} className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="text-lg font-bold text-stone-600 min-w-[2rem] text-center">
                          #{index + 1}
                        </div>
                        {item.image ? (
                          <img
                            src={item.image}
                            alt={item.name}
                            className="w-10 h-10 rounded object-cover"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded bg-stone-100" />
                        )}
                        <div>
                          <div className="text-sm font-semibold text-stone-800">{item.name}</div>
                          <div className="text-xs text-stone-500">
                            Sold {item.quantitySold} • Revenue {formatPrice(item.revenue)}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="admin-card">
                <h3 className="text-sm font-semibold text-stone-700 mb-3">Low Stock</h3>
                <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
                  {lowStock.length === 0 && <div className="text-sm text-stone-500">No data</div>}
                  {lowStock.map((item) => (
                    <div key={item._id} className="flex items-center justify-between">
                      <div className="flex items-center gap-3 flex-1">
                        {item.image ? (
                          <img
                            src={item.image}
                            alt={item.name}
                            className="w-10 h-10 rounded object-cover"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded bg-stone-100" />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-stone-800 truncate">{item.name}</div>
                          <div className="text-xs text-stone-500">
                            Sold {item.soldCount || 0} • Revenue {formatPrice(item.revenue || 0)}
                          </div>
                        </div>
                      </div>
                      <span className="text-xs px-2 py-1 rounded-full bg-red-50 text-red-600 border border-red-100 whitespace-nowrap ml-2">
                        {item.totalStock} left
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Category Stats */}
            <div className="admin-card">
              <h3 className="text-sm font-semibold text-stone-700 mb-3">
                Revenue by Category
              </h3>
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                {categoryStats.map((c) => (
                  <div
                    key={c._id}
                    className="p-3 rounded-lg border border-stone-200 bg-stone-50"
                  >
                    <div className="text-sm font-semibold text-stone-800">{c.name}</div>
                    <div className="text-xs text-stone-500">Sold: {c.totalSold}</div>
                    <div className="text-sm font-medium">{formatPrice(c.revenue)}</div>
                  </div>
                ))}
                {categoryStats.length === 0 && (
                  <div className="text-sm text-stone-500">No data available</div>
                )}
              </div>
            </div>

            {/* Branch Map */}
            <div className="admin-card">
              <h3 className="text-sm font-semibold text-stone-700 mb-3">
                Branch Map (Vietmap)
              </h3>
              <Suspense fallback={<div className="h-64 bg-stone-100 rounded animate-pulse flex items-center justify-center text-stone-400">Loading map...</div>}>
                <BranchMap branches={branches} />
              </Suspense>
              <div className="text-[11px] text-stone-500 mt-2">
                Source: /dashboard/branches-map. VietMap API key can be configured via VITE_VIETMAP_API_KEY.
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;
