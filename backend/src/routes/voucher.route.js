const express = require('express');
const router = express.Router();
const voucherController = require('../controllers/voucher.controller');
const adminOnly = require('../middlewares/admin.middleware');
const auth = require('../middlewares/auth.middleware');

// Admin tạo voucher
router.post('/', auth, adminOnly, voucherController.createVoucher);

// Admin update voucher
router.put('/:id', auth, adminOnly, voucherController.updateVoucher);

// Admin xoá voucher
router.delete('/:id', auth, adminOnly, voucherController.deleteVoucher);

// Admin lấy danh sách voucher
router.get("/", auth, adminOnly, voucherController.getAllVouchers);

// User xem danh sách voucher đang mở để thu thập
router.get("/collectable", auth, voucherController.getCollectable);

// User dùng được voucher nào
router.get('/usable', auth, voucherController.getUsableVouchers);

// User thu thập voucher
router.post("/collect", auth, voucherController.collectVoucher);
// User xem voucher đã thu thập
router.get('/mine', auth, voucherController.getMyVouchers);

module.exports = router;
