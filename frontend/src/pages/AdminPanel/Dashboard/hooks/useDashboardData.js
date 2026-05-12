import { useState, useEffect, useCallback, useMemo } from 'react';
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
  getSupportTicketStats,
  getSupportTicketAssigneeStats,
} from '@/services';

const toNumber = (v) => {
  if (v == null) return 0;
  if (typeof v === 'object' && '$numberDecimal' in v) return Number(v.$numberDecimal);
  return Number(v) || 0;
};

export const useDashboardData = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  const [data, setData] = useState({
    overview: null,
    revenueUpdates: [],
    yearlySales: { thisYear: [], lastYear: [] },
    paymentSummary: null,
    topSelling: [],
    lowStock: [],
    categoryStats: [],
    branches: [],
    supportTicketStats: null,
    supportTicketAssigneeStats: [],
    chatbotInsights: null,
  });

  const loadDashboard = useCallback(async () => {
    try {
      setIsRefreshing(true);
      setLoading(true);
      setError(null);

      const results = await Promise.allSettled([
        getSalesOverview(),
        getRevenueUpdates(),
        getYearlySales(),
        getPaymentSummary(),
        getTopSelling(),
        getLowStock(),
        getBranchesMap(),
        getCategoryStats(),
        getChatbotInsights(),
        getSupportTicketStats(),
        getSupportTicketAssigneeStats(),
      ]);

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
        ticketStatsRes,
        assigneeStatsRes,
      ] = results;

      setData({
        overview: overviewRes.status === 'fulfilled' ? overviewRes.value.data : null,
        revenueUpdates: revenueRes.status === 'fulfilled' 
          ? (Array.isArray(revenueRes.value.data) ? revenueRes.value.data : [])
          : [],
        yearlySales: yearlyRes.status === 'fulfilled' 
          ? (yearlyRes.value.data || { thisYear: [], lastYear: [] })
          : { thisYear: [], lastYear: [] },
        paymentSummary: paymentRes.status === 'fulfilled' ? paymentRes.value.data : null,
        topSelling: topSellingRes.status === 'fulfilled' ? (topSellingRes.value.data || []) : [],
        lowStock: lowStockRes.status === 'fulfilled' ? (lowStockRes.value.data || []) : [],
        branches: branchesRes.status === 'fulfilled' ? (branchesRes.value.data || []) : [],
        categoryStats: categoryRes.status === 'fulfilled' ? (categoryRes.value.data || []) : [],
        chatbotInsights: chatbotRes.status === 'fulfilled' ? (chatbotRes.value.data || null) : null,
        supportTicketStats: ticketStatsRes.status === 'fulfilled' ? (ticketStatsRes.value.data || null) : null,
        supportTicketAssigneeStats: assigneeStatsRes.status === 'fulfilled' ? (assigneeStatsRes.value.data || []) : [],
      });
    } catch (err) {
      console.error('Load dashboard error:', err);
      setError(err.message || 'Failed to load dashboard');
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  // Auto refresh every 60s
  useEffect(() => {
    const interval = setInterval(loadDashboard, 60000);
    return () => clearInterval(interval);
  }, [loadDashboard]);

  // Computed data
  const revenueMonthData = useMemo(() => {
    const months = Array.from({ length: 12 }, (_, i) => ({
      label: `Th${i + 1}`,
      value: 0,
    }));

    (data.yearlySales?.thisYear || []).forEach((m) => {
      const idx = Number(m._id) - 1;
      if (idx >= 0 && idx < 12) {
        months[idx].value = toNumber(m.revenue);
      }
    });

    return months;
  }, [data.yearlySales]);

  const totalRevenueThisYear = useMemo(
    () => revenueMonthData.reduce((sum, m) => sum + toNumber(m.value), 0),
    [revenueMonthData]
  );

  const revenueMonthMax = useMemo(
    () => Math.max(1, ...revenueMonthData.map((m) => toNumber(m.value))),
    [revenueMonthData]
  );

  const hasMonthlyRevenue = useMemo(
    () => revenueMonthData.some((m) => toNumber(m.value) > 0),
    [revenueMonthData]
  );

  const totalRevenue7Days = useMemo(
    () => data.revenueUpdates.reduce((s, d) => s + toNumber(d.total), 0),
    [data.revenueUpdates]
  );

  const paymentData = useMemo(() => {
    if (!data.paymentSummary) return [];
    const vietqrValue = data.paymentSummary.vietqr ?? data.paymentSummary.vnpay ?? 0;
    return [
      { label: 'COD', value: toNumber(data.paymentSummary.cod), color: '#facc15' },
      { label: 'MoMo', value: toNumber(data.paymentSummary.momo), color: '#f472b6' },
      { label: 'VietQR', value: toNumber(vietqrValue), color: '#38bdf8' },
      { label: 'ZaloPay', value: toNumber(data.paymentSummary.zalopay), color: '#22c55e' },
    ];
  }, [data.paymentSummary]);

  const segmentationData = useMemo(() => {
    if (!data.overview) return [];
    return [
      { label: 'High', value: toNumber(data.overview.high), color: '#4f46e5' },
      { label: 'Medium', value: toNumber(data.overview.medium), color: '#fb923c' },
      { label: 'Low', value: toNumber(data.overview.low), color: '#94a3b8' },
    ];
  }, [data.overview]);

  const revenue7Data = useMemo(
    () => data.revenueUpdates.map((d) => ({
      label: d._id,
      value: toNumber(d.total),
    })),
    [data.revenueUpdates]
  );

  const monthColor = useCallback((value) => {
    const v = toNumber(value) / revenueMonthMax;
    if (v === 0) return '#e5e7eb';
    if (v < 0.25) return '#d1fae5';
    if (v < 0.5) return '#86efac';
    if (v < 0.75) return '#22c55e';
    return '#15803d';
  }, [revenueMonthMax]);

  return {
    loading,
    error,
    isRefreshing,
    refresh: loadDashboard,
    // Raw data
    ...data,
    // Computed data
    revenueMonthData,
    totalRevenueThisYear,
    revenueMonthMax,
    hasMonthlyRevenue,
    totalRevenue7Days,
    paymentData,
    segmentationData,
    revenue7Data,
    monthColor,
    toNumber,
    supportTicketAssigneeStats: data.supportTicketAssigneeStats,
    chatbotInsights: data.chatbotInsights,
  };
};

export default useDashboardData;
