const mongoose = require('mongoose');

// Định nghĩa các trạng thái đơn hàng phổ biến
const ORDER_STATUS_ENUM = [
    'pending',
    'confirmed',
    'shipping',
    'delivered',
    'cancelled', // Thêm trạng thái này cho đầy đủ
    'returned', // Thêm trạng thái này cho đầy đủ
];

const OrderSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User', // Tham chiếu đến Model 'User'
            required: true,
            index: true,
        },

        // Khóa ngoại: Địa chỉ giao hàng cố định (FK → Address)
        // Địa chỉ này nên là bản sao của Address lúc đặt hàng để tránh thay đổi sau này
        addressId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Address', // Tham chiếu đến Model 'Address'
            required: true,
        },

        // Khóa ngoại: Mã giảm giá đã sử dụng (nullable)
        discountCodeId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'DiscountCode', // Tham chiếu đến Model 'DiscountCode'
            default: null,
        },

        // Tổng tiền cuối cùng (sau giảm giá và trừ điểm)
        // Sử dụng Decimal128 cho độ chính xác tiền tệ
        totalAmount: {
            type: mongoose.Schema.Types.Decimal128,
            required: true,
            min: 0,
        },

        // Điểm thưởng đã sử dụng để thanh toán
        pointsUsed: {
            type: Number,
            required: true,
            default: 0,
            min: 0,
        },

        // Điểm thưởng tích được từ đơn hàng này
        pointsEarned: {
            type: Number,
            required: true,
            default: 0,
            min: 0,
        },

        deliveryType: {
            type: String,
            enum: ["standard", "economy", "express", "expedited"],
            default: "standard",
        },

        shippingFee: {
            type: Number,
            default: 0,
        },

        // Phương thức thanh toán: momo/zalopay/vietqr/cashondelivery
        paymentMethod: {
            type: String,
            enum: ["momo", "zalopay", "vietqr", "cashondelivery", null],
            default: null,
            lowercase: true,
        },

        // Trạng thái thanh toán riêng (khác với trạng thái đơn)
        paymentStatus: {
            type: String,
            enum: ["unpaid", "paid", "failed", "refunded", "pending"],
            default: "unpaid",
            lowercase: true,
        },

        // Mã giao dịch từ ZaloPay (apptransid) để map callback/return
        zaloAppTransId: {
            type: String,
            default: null,
            index: true,
        },

        // Guest ownership verification token hash.
        // Only the raw token sent via email/SMS should be accepted by the API.
        guestAccessTokenHash: {
            type: String,
            select: false,
            default: null,
            index: true,
        },
        guestAccessTokenIssuedAt: {
            type: Date,
            select: false,
            default: null,
        },
        guestAccessTokenExpiresAt: {
            type: Date,
            select: false,
            default: null,
        },

        orderLookupOtpHash: {
            type: String,
            select: false,
            default: null,
        },
        orderLookupOtpExpiresAt: {
            type: Date,
            select: false,
            default: null,
        },
        orderLookupOtpSentTo: {
            type: String,
            select: false,
            default: null,
        },
        orderLookupOtpAttempts: {
            type: Number,
            default: 0,
        },
        orderLookupOtpVerifiedAt: {
            type: Date,
            select: false,
            default: null,
        },

        // Voucher áp dụng (nếu có)
        voucherId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Voucher",
            default: null,
        },

        // Giảm giá từ mã/voucher
        discountAmount: {
            type: Number,
            default: 0,
        },

        voucherDiscount: {
            type: Number,
            default: 0,
        },

        // Track if discount code usage has been counted (to prevent double counting)
        _discountCodeMarkedUsed: {
            type: Boolean,
            default: false,
        },

        // Track if stock has been deducted (to prevent double deduction/restoration)
        _stockDeducted: {
            type: Boolean,
            default: false,
        },

        // Trạng thái hiện tại của đơn hàng
        status: {
            type: String,
            enum: ORDER_STATUS_ENUM, // Giới hạn giá trị
            default: 'pending',
            required: true,
            lowercase: true,
            index: true,
        },

        // createdAt / updatedAt (Tự động)
    },
    {
        timestamps: true, // Tự động thêm createdAt và updatedAt
    },
);

// Compound indexes for common queries
OrderSchema.index({ userId: 1, createdAt: -1 }); // User's orders sorted by date
OrderSchema.index({ status: 1, createdAt: -1 }); // Orders by status sorted by date
OrderSchema.index({ paymentStatus: 1, status: 1 }); // Payment and order status queries
OrderSchema.index({ guestAccessTokenHash: 1 }, { sparse: true });
OrderSchema.index({ orderLookupOtpHash: 1 }, { sparse: true });

// Tạo Model từ Schema
module.exports = mongoose.model('Order', OrderSchema);
