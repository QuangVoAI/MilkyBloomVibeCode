import React, { useEffect, useMemo, useState } from 'react';
import Topbar from './Topbar';
import {
  getSalesOverview,
  getRevenueUpdates,
  getYearlySales,
  getPaymentSummary,
  getTopSelling,
  getLowStock,
  getCategoryStats,
  getBranchesMap,
  getChatbotInsights,
} from '@/services';
import { formatPrice, formatPriceNumber } from '@/utils/formatPrice';
import BranchMap from './BranchMap';

const toNumber = (v) => {
  if (v == null) return 0;
  if (typeof v === 'object' && '$numberDecimal' in v) return Number(v.$numberDecimal);
  return Number(v) || 0;
};

// ----- Simple SVG charts -----
const PieChart = ({ data, colors, size = 160 }) => {
  const total = data.reduce((s, d) => s + d.value, 0);
  let acc = 0;
  const radius = size / 2;

  if (total === 0) {
    return (
      <div className="flex items-center justify-center text-xs text-stone-500 h-full">
        No data
      </div>
    );
  }

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {data.map((d, i) => {
        const start = (acc / total) * 2 * Math.PI;
        const end = ((acc + d.value) / total) * 2 * Math.PI;
        acc += d.value;
        const largeArc = end - start > Math.PI ? 1 : 0;
        const x1 = radius + radius * Math.cos(start);
        const y1 = radius + radius * Math.sin(start);
        const x2 = radius + radius * Math.cos(end);
        const y2 = radius + radius * Math.sin(end);
        const mid = (start + end) / 2;
        const labelX = radius + (radius * 0.55) * Math.cos(mid);
        const labelY = radius + (radius * 0.55) * Math.sin(mid);
        const pct = total ? Math.round((d.value / total) * 100) : 0;

        return (
          <g key={d.label}>
            <path
              d={`M${radius},${radius} L${x1},${y1} A${radius},${radius} 0 ${largeArc} 1 ${x2},${y2} Z`}
              fill={colors[i] || '#cbd5e1'}
              stroke="#fff"
              strokeWidth="1"
            />
            {pct > 0 && (
              <text
                x={labelX}
                y={labelY}
                textAnchor="middle"
                dominantBaseline="middle"
                fill="#0f172a"
                fontSize="10"
              >
                {pct}%
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
};

const TinyLegend = ({ items }) => (
  <div className="flex flex-wrap gap-3 text-xs text-stone-600">
    {items.map((i) => (
      <div key={i.label} className="flex items-center gap-1">
        <span className="inline-block w-3 h-3 rounded-sm" style={{ background: i.color }} />
        <span>{i.label}</span>
      </div>
    ))}
  </div>
);

const BarChart = ({ data, colors }) => {
  const max = Math.max(0, ...data.map((d) => d.value));
  return (
    <div className="space-y-2">
      {data.map((d, idx) => {
        const width = max ? Math.round((d.value / max) * 100) : 0;
        return (
          <div key={d.label} className="text-sm">
            <div className="flex justify-between text-stone-600 mb-1">
              <span>{d.label}</span>
              <span className="font-semibold">{formatPrice(d.value)}</span>
            </div>
            <div className="h-3 bg-stone-100 rounded-full overflow-hidden relative">
              <div
                className="h-full"
                style={{
                  width: `${width}%`,
                  background: colors[idx] || '#6366f1',
                  transition: 'width 0.3s ease',
                }}
              />
              <span className="absolute inset-0 flex items-center justify-center text-[10px] text-white/90">
                {width}%
              </span>
            </div>
          </div>
        );
      })}
      {data.length === 0 && <div className="text-xs text-stone-500">No data</div>}
    </div>
  );
};

const LineChart = ({ data, stroke = '#6366f1' }) => {
  if (!data.length) return <div className="text-xs text-stone-500">No data</div>;
  const values = data.map((d) => Number(d.value || 0));
  const max = Math.max(...values, 1);
  const points = data.map((d, idx) => {
    const x = (idx / Math.max(1, data.length - 1)) * 100;
    const y = 100 - (Number(d.value || 0) / max) * 100;
    return `${x},${y}`;
  });
  return (
    <svg viewBox="0 0 100 100" className="w-full h-32">
      <polyline
        fill="none"
        stroke={stroke}
        strokeWidth="2"
        points={points.join(' ')}
      />
      {points.map((p, idx) => (
        <circle key={idx} cx={p.split(',')[0]} cy={p.split(',')[1]} r="1.3" fill={stroke} />
      ))}
    </svg>
  );
};

const StatCard = ({ title, value, pill, accent }) => (
  <div className="p-4 rounded-xl bg-white shadow-sm border border-stone-200">
    <div className="flex items-center justify-between mb-1">
      <span className="text-sm text-stone-500">{title}</span>
      {pill && (
        <span className="text-xs px-2 py-1 rounded-full bg-stone-100 text-stone-700">
          {pill}
        </span>
      )}
    </div>
    <div className="text-2xl font-bold text-stone-800">{value}</div>
    {accent && <div className="text-xs text-stone-500 mt-1">{accent}</div>}
  </div>
);

const ListCard = ({ title, items, renderItem }) => (
  <div className="p-4 rounded-xl bg-white shadow-sm border border-stone-200">
    <h3 className="text-sm font-semibold text-stone-700 mb-3">{title}</h3>
    <div className="space-y-3">
      {items.length === 0 && (
        <div className="text-sm text-stone-500">No data</div>
      )}
      {items.map(renderItem)}
    </div>
  </div>
);

const Main = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [overview, setOverview] = useState(null);
  const [revenueUpdates, setRevenueUpdates] = useState([]);
  const [yearlySales, setYearlySales] = useState({ thisYear: [], lastYear: [] });
  const [paymentSummary, setPaymentSummary] = useState(null);
  const [topSelling, setTopSelling] = useState([]);
  const [lowStock, setLowStock] = useState([]);
  const [categoryStats, setCategoryStats] = useState([]);
  const [branches, setBranches] = useState([]);
  const [chatbotInsights, setChatbotInsights] = useState(null);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setError(null);

        const [
          overviewRes,
          revenueRes,
          yearlyRes,
          paymentRes,
          topSellingRes,
          lowStockRes,
          branchesRes,
          categoryRes,
          chatbotRes,
        ] = await Promise.all([
          getSalesOverview(),
          getRevenueUpdates(),
          getYearlySales(),
          getPaymentSummary(),
          getTopSelling(),
          getLowStock(),
          getBranchesMap(),
          getCategoryStats(),
          getChatbotInsights(),
        ]);

        setOverview(overviewRes.data);
        setRevenueUpdates(Array.isArray(revenueRes.data) ? revenueRes.data : []);
        setYearlySales(yearlyRes.data || { thisYear: [], lastYear: [] });
        setPaymentSummary(paymentRes.data);
        setTopSelling(topSellingRes.data || []);
        setLowStock(lowStockRes.data || []);
        setBranches(branchesRes.data || []);
        setCategoryStats(categoryRes.data || []);
        setChatbotInsights(chatbotRes.data || null);
      } catch (err) {
        console.error('Load dashboard error:', err);
        setError(err.message || 'Failed to load dashboard');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  const revenueMonthData = useMemo(() => {
    const months = Array.from({ length: 12 }, (_, i) => ({
      label: `Th${i + 1}`,
      value: 0,
    }));

    (yearlySales?.thisYear || []).forEach((m) => {
      const idx = Number(m._id) - 1;
      if (idx >= 0 && idx < 12) {
        months[idx].value = toNumber(m.revenue);
      }
    });

    return months;
  }, [yearlySales]);

  const totalRevenueThisYear = useMemo(
    () => revenueMonthData.reduce((sum, m) => sum + toNumber(m.value), 0),
    [revenueMonthData],
  );

  const revenueMonthMax = useMemo(
    () => Math.max(1, ...revenueMonthData.map((m) => toNumber(m.value))),
    [revenueMonthData],
  );

  const monthColor = (value) => {
    const v = toNumber(value) / revenueMonthMax;
    if (v === 0) return '#e5e7eb';
    if (v < 0.25) return '#d1fae5';
    if (v < 0.5) return '#86efac';
    if (v < 0.75) return '#22c55e';
    return '#15803d';
  };

  const totalRevenue7Days = useMemo(
    () => revenueUpdates.reduce((s, d) => s + toNumber(d.total), 0),
    [revenueUpdates],
  );

  const paymentData = useMemo(() => {
    if (!paymentSummary) return [];
    const vietqrValue = paymentSummary.vietqr ?? paymentSummary.vnpay ?? 0;
    return [
      { label: 'COD', value: toNumber(paymentSummary.cod), color: '#facc15' },
      { label: 'MoMo', value: toNumber(paymentSummary.momo), color: '#f472b6' },
      { label: 'VietQR', value: toNumber(vietqrValue), color: '#38bdf8' },
      { label: 'ZaloPay', value: toNumber(paymentSummary.zalopay), color: '#22c55e' },
    ];
  }, [paymentSummary]);

  const segmentationData = useMemo(() => {
    if (!overview) return [];
    return [
      { label: 'High', value: toNumber(overview.high), color: '#4f46e5' },
      { label: 'Medium', value: toNumber(overview.medium), color: '#fb923c' },
      { label: 'Low', value: toNumber(overview.low), color: '#94a3b8' },
    ];
  }, [overview]);

  const revenue7Data = useMemo(
    () =>
      revenueUpdates.map((d) => ({
        label: d._id,
        value: toNumber(d.total),
      })),
    [revenueUpdates],
  );

  return (
    <div className="bg-white rounded-lg pb-6 shadow h-full">
      <Topbar />

      <div className="px-4">
        {loading && (
          <div className="text-sm text-stone-500">Loading dashboard...</div>
        )}
        {error && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
            {error}
          </div>
        )}

        {!loading && !error && (
          <div className="space-y-6">
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
                accent={`Orders: ${revenueUpdates.reduce(
                  (s, d) => s + toNumber(d.orders),
                  0
                )}`}
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

            <div className="p-4 rounded-xl bg-white shadow-sm border border-stone-200">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-stone-700">Chatbot Insights</h3>
                  <p className="text-xs text-stone-500">
                    Router confidence, fallback rate, and Vietnamese output quality
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
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
              <div className="p-4 rounded-xl bg-white shadow-sm border border-stone-200">
                <h3 className="text-sm font-semibold text-stone-700 mb-3">
                  User Segmentation Pie Chart
                </h3>
                <div className="flex items-center gap-4">
                  <PieChart data={segmentationData} colors={segmentationData.map((s) => s.color)} />
                  <TinyLegend items={segmentationData} />
                </div>
              </div>

              <div className="lg:col-span-2 p-4 rounded-xl bg-white shadow-sm border border-stone-200">
                <h3 className="text-sm font-semibold text-stone-700 mb-3">
                  Revenue by Payment Gateway
                </h3>
                <BarChart data={paymentData} colors={paymentData.map((p) => p.color)} />
                <div className="mt-2 text-[11px] text-stone-500">
                  COD Yellow • MoMo Pink • VietQR Blue • ZaloPay Green
                </div>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="p-4 rounded-xl bg-white shadow-sm border border-stone-200">
                <h3 className="text-sm font-semibold text-stone-700 mb-3">
                  7-Day Revenue (Bar Chart)
                </h3>
                <BarChart data={revenue7Data} colors={revenue7Data.map(() => '#6366f1')} />
              </div>

              <div className="p-4 rounded-xl bg-white shadow-sm border border-stone-200">
                <h3 className="text-sm font-semibold text-stone-700 mb-3">
                  Monthly Revenue (Heatmap)
                </h3>
                <div className="grid grid-cols-6 md:grid-cols-12 gap-2">
                  {revenueMonthData.map((m) => (
                    <div key={m.label} className="flex flex-col items-center gap-1">
                      <div
                        className="w-7 h-7 rounded border border-stone-200"
                        style={{ background: monthColor(m.value) }}
                        title={`${m.label}: ${formatPrice(m.value)}`}
                      />
                      <span className="text-[11px] text-stone-600">{m.label}</span>
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-2 text-[11px] text-stone-500 mt-2">
                  <span>Less</span>
                  {['#e5e7eb', '#d1fae5', '#86efac', '#22c55e', '#15803d'].map((c) => (
                    <span key={c} className="w-4 h-3 rounded-[3px] border border-stone-200" style={{ background: c }} />
                  ))}
                  <span>More</span>
                </div>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <ListCard
                title="Best Selling Products"
                items={topSelling.slice(0, 5)}
                renderItem={(item) => (
                  <div
                    key={item._id}
                    className="flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3">
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
                        <div className="text-sm font-semibold text-stone-800">
                          {item.name}
                        </div>
                        <div className="text-xs text-stone-500">
                          Sold {item.quantitySold} • Revenue{' '}
                          {formatPrice(item.revenue)}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              />

              <ListCard
                title="Low Stock"
                items={lowStock.slice(0, 5)}
                renderItem={(item) => (
                  <div
                    key={item._id}
                    className="flex items-center justify-between"
                  >
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
                        <div className="text-sm font-medium text-stone-800 truncate">
                          {item.name}
                        </div>
                        <div className="text-xs text-stone-500">
                          Sold {item.soldCount || 0} • Revenue {formatPrice(item.revenue || 0)}
                        </div>
                      </div>
                    </div>
                    <span className="text-xs px-2 py-1 rounded-full bg-red-50 text-red-600 border border-red-100 whitespace-nowrap ml-2">
                      {item.totalStock} left
                    </span>
                  </div>
                )}
              />
            </div>

            <div className="p-4 rounded-xl bg-white shadow-sm border border-stone-200">
              <h3 className="text-sm font-semibold text-stone-700 mb-3">
                Revenue by Category
              </h3>
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                {categoryStats.map((c) => (
                  <div
                    key={c._id}
                    className="p-3 rounded-lg border border-stone-200 bg-stone-50"
                  >
                    <div className="text-sm font-semibold text-stone-800">
                      {c.name}
                    </div>
                    <div className="text-xs text-stone-500">
                      Bán: {c.totalSold}
                    </div>
                  <div className="text-sm font-medium">
                    {formatPrice(c.revenue)}
                  </div>
                </div>
                ))}
                {categoryStats.length === 0 && (
                <div className="text-sm text-stone-500">No data available</div>
              )}
              </div>
            </div>

            <div className="p-4 rounded-xl bg-white shadow-sm border border-stone-200">
              <h3 className="text-sm font-semibold text-stone-700 mb-3">
                Branch Map (Vietmap)
              </h3>
              <BranchMap branches={branches} />
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

export default Main;
