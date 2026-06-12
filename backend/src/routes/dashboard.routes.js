const router = require('express').Router();
const dashboardController = require('../controllers/dashboard.controller');
const auth = require('../middlewares/auth.middleware');
const adminOnly = require('../middlewares/admin.middleware');

// Layout Section 2: Sales Overview + Revenue Updates + Yearly Sales
router.get(
    "/sales-overview",
    auth,
    adminOnly,
    dashboardController.getSalesOverview,
);
router.get(
    "/revenue-updates",
    auth,
    adminOnly,
    dashboardController.getRevenueUpdates,
);
router.get(
    "/yearly-sales",
    auth,
    adminOnly,
    dashboardController.getYearlySales,
);

// Layout Section 4: Payment Gateways
router.get(
    "/payment-summary",
    auth,
    adminOnly,
    dashboardController.getPaymentSummary,
);

// --- PRODUCT ANALYTICS (GỘP CHUNG DASHBOARD) ---
router.get(
    "/products/top-selling",
    auth,
    adminOnly,
    dashboardController.getTopSelling,
);
router.get(
    "/products/high-stock",
    auth,
    adminOnly,
    dashboardController.getHighStock,
);
router.get(
    "/products/low-stock",
    auth,
    adminOnly,
    dashboardController.getLowStock,
);
router.get(
    "/products/revenue",
    auth,
    adminOnly,
    dashboardController.getProductRevenue,
);
router.get(
    "/products/category-stats",
    auth,
    adminOnly,
    dashboardController.getCategoryStats,
);

//Hiển thị chi nhánh cửa hàng trên bản đồ
router.get(
    "/branches-map",
    auth,
    adminOnly,
    dashboardController.getBranchesMap,
);
router.get(
    "/chatbot-insights",
    auth,
    adminOnly,
    dashboardController.getChatbotInsights,
);
router.get(
    "/chatbot-cases",
    auth,
    adminOnly,
    dashboardController.getChatbotCases,
);

module.exports = router;
