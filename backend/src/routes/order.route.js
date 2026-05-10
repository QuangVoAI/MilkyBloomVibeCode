const express = require('express');
const router = express.Router();
const orderController = require("../controllers/order.controller");
const auth = require("../middlewares/auth.middleware");
const adminOnly = require("../middlewares/admin.middleware");
const { strictApiLimiter } = require('../middlewares/rateLimit.middleware');

// User tạo đơn
router.post('/', strictApiLimiter, orderController.create);

// Admin thay đổi trạng thái đơn
router.put('/:id/status', strictApiLimiter, auth, adminOnly, orderController.updateStatus);

// Admin lấy orders theo discount code
router.get("/discount/:discountCodeId", auth, adminOnly, orderController.getOrdersByDiscountCode);

// Admin xem tất cả đơn hàng
router.get("/admin/all", auth, adminOnly, orderController.adminGetAll);

// Tìm đơn theo số điện thoại (guest/internal CSKH lookup)
router.get("/guest/search", orderController.searchGuestOrdersByPhone);

// Lấy chi tiết đơn guest (requires sessionId or email verification)
router.get("/:id/guest", orderController.getGuestOrderDetail);

// Lấy chi tiết đơn (authenticated - user can only see their own)
router.get("/:id", auth, orderController.getDetail);

// User xem đơn của mình
router.get("/", auth, orderController.getMyOrders);

// User hủy đơn của mình
router.put("/:id/cancel", strictApiLimiter, auth, orderController.cancelOrder);

// Checkout cart: User
router.post("/checkout/cart", strictApiLimiter, auth, orderController.checkoutFromCartForUser); //tạo đơn

// Checkout cart: Guest
router.post("/checkout/cart/guest", strictApiLimiter, orderController.checkoutFromCartForGuest); //tạo đơn

module.exports = router;
