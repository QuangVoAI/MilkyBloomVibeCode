import apiClient from './config';

export const getSalesOverview = () => apiClient.get('/dashboard/sales-overview');
export const getRevenueUpdates = () => apiClient.get('/dashboard/revenue-updates');
export const getYearlySales = () => apiClient.get('/dashboard/yearly-sales');
export const getPaymentSummary = () => apiClient.get('/dashboard/payment-summary');
export const getTopSelling = () => apiClient.get('/dashboard/products/top-selling');
export const getLowStock = () => apiClient.get('/dashboard/products/low-stock');
export const getCategoryStats = () => apiClient.get('/dashboard/products/category-stats');
export const getBranchesMap = () => apiClient.get('/dashboard/branches-map');
export const getChatbotInsights = () => apiClient.get('/dashboard/chatbot-insights');
export const getChatbotCases = (params = {}) => apiClient.get('/dashboard/chatbot-cases', { params });

export default {
  getSalesOverview,
  getRevenueUpdates,
  getYearlySales,
  getPaymentSummary,
  getTopSelling,
  getLowStock,
  getCategoryStats,
  getBranchesMap,
  getChatbotInsights,
  getChatbotCases,
};
