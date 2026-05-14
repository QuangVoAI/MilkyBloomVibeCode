const express = require('express');
const router = express.Router();
const { apiLimiter } = require('../middlewares/rateLimit.middleware.js');

// Import Controllers
const {
    getAllCarts,
    getCartByUser,
    getCartBySession,
    createCart,
    addItem,
    removeItem,
    clearCart,
    deleteCart,
    mergeGuestCart,
} = require('../controllers/cart.controller');

// Import Middlewares
const authMiddleware = require('../middlewares/auth.middleware');
const adminMiddleware = require('../middlewares/admin.middleware');
const optionalAuth = require('../middlewares/optionalAuth.middleware');

// ==========================================
// 1. ADMIN ROUTES (Quản lý toàn bộ)
// ==========================================
// Chỉ Admin mới được xem tất cả giỏ hàng hoặc xóa giỏ hàng bất kỳ
router.get('/all', authMiddleware, adminMiddleware, getAllCarts);
router.delete('/:cartId', authMiddleware, adminMiddleware, deleteCart);

// ==========================================
// 2. USER ROUTES (Dành cho người đã đăng nhập)
// ==========================================
// Lấy giỏ hàng của chính User đó -> Cần đăng nhập
router.get('/user/:userId', authMiddleware, getCartByUser);

// ==========================================
// 3. PUBLIC / HYBRID ROUTES (Guest & User)
// ==========================================
// Các route này hỗ trợ cả khách vãng lai (Session) và User
// KHÔNG gắn authMiddleware cứng ở đây để Guest vẫn mua được hàng.
// Logic lấy User ID đã được xử lý trong Controller (req.user || req.body.userId)
router.get('/', apiLimiter, optionalAuth, (req, res, next) => {
    const sessionId =
        req.headers['x-guest-session-id'] ||
        req.headers['x-session-id'] ||
        req.query.sessionId ||
        req.query.guestSessionId ||
        req.body?.sessionId;

    if (sessionId) {
        req.params.sessionId = String(sessionId);
        return getCartBySession(req, res, next);
    }

    if (req.user?._id) {
        req.params.userId = String(req.user._id);
        return getCartByUser(req, res, next);
    }

    return res.status(400).json({
        message: 'No sessionId or authenticated user provided',
    });
});

// Lấy giỏ hàng theo Session ID (Dành cho Guest)
router.get('/session/:sessionId', getCartBySession);

// Tạo giỏ hàng mới (Thường được gọi tự động)
router.post('/', createCart);

// --- Thao tác với Item (Gộp từ cart-item sang) ---

// Thêm sản phẩm (Add Item)
// POST /api/carts/:cartId/items
// Uses optionalAuth to populate req.user for socket events if logged in
router.post('/:cartId/items', optionalAuth, addItem);

// Xóa sản phẩm/Giảm số lượng (Remove Item)
// DELETE /api/carts/:cartId/items (Hoặc dùng POST/PUT tùy frontend bạn)
// Lưu ý: Nếu frontend bạn đang dùng POST cho xóa thì giữ nguyên POST
router.post('/:cartId/remove-item', optionalAuth, removeItem);

// Xóa sạch giỏ hàng
router.delete('/:cartId/clear', optionalAuth, clearCart);

// Merge guest cart into user cart (called after OAuth login)
router.post('/merge', authMiddleware, mergeGuestCart);

module.exports = router;
