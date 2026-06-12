const dashboardService = require('../services/dashboard.service');
const productAnalyticsService = require('../services/product-analytics.service');

module.exports = {
    // --- EXISTING DASHBOARD CONTROLLERS ---
    async getSalesOverview(req, res) {
        res.json({
            success: true,
            data: await dashboardService.getSalesOverview(),
        });
    },

    async getRevenueUpdates(req, res) {
        res.json({
            success: true,
            data: await dashboardService.getRevenueUpdates(),
        });
    },

    async getYearlySales(req, res) {
        res.json({
            success: true,
            data: await dashboardService.getYearlySales(),
        });
    },

    async getPaymentSummary(req, res) {
        res.json({
            success: true,
            data: await dashboardService.getPaymentSummary(),
        });
    },

    // --- PRODUCT ANALYTICS (GOP CHUNG DASHBOARD) ---
    async getTopSelling(req, res) {
        res.json({
            success: true,
            data: await productAnalyticsService.getTopSelling(),
        });
    },

    async getHighStock(req, res) {
        res.json({
            success: true,
            data: await productAnalyticsService.getHighStock(),
        });
    },

    async getLowStock(req, res) {
        res.json({
            success: true,
            data: await productAnalyticsService.getLowStock(),
        });
    },

    async getProductRevenue(req, res) {
        res.json({
            success: true,
            data: await productAnalyticsService.getProductRevenue(),
        });
    },

    async getCategoryStats(req, res) {
        res.json({
            success: true,
            data: await productAnalyticsService.getCategoryStats(),
        });
    },

    async getBranchesMap(req, res) {
        res.json({
            success: true,
            data: await dashboardService.getBranchesMap(),
        });
    },

    async getChatbotInsights(req, res) {
        res.json({
            success: true,
            data: await dashboardService.getChatbotInsights(),
        });
    },

    async getChatbotCases(req, res, next) {
        try {
            const limit = Number(req.query.limit || 8);
            const mode = req.query.mode || 'all';
            const reason = req.query.reason || '';
            const threshold = req.query.threshold;
            const data = await dashboardService.getChatbotCases({ limit, mode, reason, threshold });
            res.json({ success: true, data });
        } catch (err) {
            return next(err);
        }
    },
};
