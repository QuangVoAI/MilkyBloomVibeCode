const orderRepository = require("../repositories/order.repository");
const itemRepo = require("../repositories/order-item.repository");
const historyRepo = require("../repositories/order-status-history.repository");
const bcrypt = require("bcrypt");
const userRepository = require("../repositories/user.repository.js");
const addressRepo = require("../repositories/address.repository");
const paymentRepo = require("../repositories/payment.repository");
const variantRepo = require("../repositories/variant.repository");
const { sendMail } = require("../libs/mailer.js");
const { generateToken, genOtp6, sha256 } = require("../utils/token.js");
const { calculateShippingFee } = require("../services/shipping.service");
const { getWeatherCondition } = require("../services/weather.service");
const cartRepository = require("../repositories/cart.repository");
const cartItemRepository = require("../repositories/cart-item.repository");
const loyaltyService = require("../services/loyalty.service");
const badgeService = require("../services/badge.service");
const CoinTransactionRepository = require("../repositories/coin-transaction.repository");
const discountCodeService = require("../services/discount-code.service");
const { checkAndAssignBadges } = require("../services/badge.service");
const voucherRepository = require("../repositories/voucher.repository");
const userVoucherRepository = require("../repositories/user-voucher.repository");
const Product = require("../models/product.model");
const { sendOrderConfirmationEmail, sendGuestOrderConfirmationEmail, sendOrderLookupOtpEmail, sendOrderStatusUpdateEmail } = require("./email.service");
const { getBackendUrl } = require('../config/runtime.js');

const VERIFY_TTL_MINUTES = Number(process.env.VERIFY_TTL_MINUTES || 15);
const GUEST_ORDER_ACCESS_TOKEN_TTL_DAYS = Number(process.env.GUEST_ORDER_ACCESS_TOKEN_TTL_DAYS || 30);
const ORDER_LOOKUP_OTP_TTL_MINUTES = Number(process.env.ORDER_LOOKUP_OTP_TTL_MINUTES || 10);
const BACKEND_URL = getBackendUrl();

async function sendVerifyEmail(user) {
    const token = generateToken();
    const tokenHash = sha256("verify:" + token);
    const expiresAt = new Date(Date.now() + VERIFY_TTL_MINUTES * 60 * 1000);

    await userRepository.setResetToken(user._id, { tokenHash, expiresAt });

    const verifyLink = `${BACKEND_URL}/api/auth/verify-email?uid=${user._id}&token=${token}`;
    try {
        await sendMail({
            to: user.email,
            subject: "Xác thực email đặt hàng MilkyBloom",
            html: `
                <p>Xin chào ${user.fullName || "bạn"},</p>
                <p>Vui lòng xác thực email trước khi hoàn tất đặt hàng:</p>
                <p><a href="${verifyLink}">${verifyLink}</a></p>
                <p>Liên kết có hiệu lực ${VERIFY_TTL_MINUTES} phút.</p>
            `,
        });
    } catch (err) {
        console.error("[MAIL ERROR][VERIFY EMAIL GUEST]", err?.message || err);
    }
}

module.exports = {
    async createOrGetUserForGuest({ fullName, email, phone }) {
        const normalizedEmail = email.toLowerCase();
        const baseUsername = normalizedEmail.split('@')[0];
        const randomSuffix = Math.floor(1000 + Math.random() * 9000);
        const autoUsername = `${baseUsername}_${randomSuffix}`;
        const existing = await userRepository.findByEmailOrPhone(
            normalizedEmail,
            phone,
        );
        if (existing) {
            return { user: existing, isNewAccount: false };
        }

        const randomPass = Math.random().toString(36).slice(-8);
        const hash = await bcrypt.hash(randomPass, 10);

        const newUser = await userRepository.create({
            fullName,
            email: normalizedEmail,
            phone,
            username: autoUsername,
            password: hash,
            isVerified: true, // Auto-verify guest accounts so they can login immediately
            role: 'customer',
        });

        // Return user with password for email
        return { user: newUser, isNewAccount: true, generatedPassword: randomPass };
    },

    async createOrderFromCart(payload) {
        const {
            userId,
            sessionId,
            addressId,
            discountCodeId,
            guestInfo,
            paymentMethod,
            deliveryType,
        } = payload;

        // Validate delivery type
        const validDeliveryTypes = ['economy', 'standard', 'express', 'expedited'];
        let finalDeliveryType = deliveryType;
        if (!validDeliveryTypes.includes(finalDeliveryType)) {
            finalDeliveryType = 'standard';
        }

        // Lấy cart theo user hoặc session
        let cart = null;
        if (userId) {
            cart = await cartRepository.findCartByUserId(userId);
        } else if (sessionId) {
            cart = await cartRepository.findCartBySessionId(sessionId);
        }

        if (!cart) throw new Error("Cart not found");

        const cartItems = await cartItemRepository.getAllByCartId(cart._id);
        
        if (!cartItems || cartItems.length === 0) {
            throw new Error('Cart is empty');
        }

        // Convert CartItem -> OrderItems
        let totalAmount = 0;
        const items = cartItems.map((ci) => {
            totalAmount += Number(ci.variantId.price) * ci.quantity;
            return {
                productId: ci.productId._id,
                variantId: ci.variantId._id,
                quantity: ci.quantity,
                unitPrice: Number(ci.variantId.price),
                subtotal: Number(ci.variantId.price) * ci.quantity,
            };
        });

        // Tạo đơn
        const orderDetail = await this.createOrder({
            userId: userId || null,
            guestInfo: guestInfo || null,
            addressId: addressId || null,
            paymentMethod: paymentMethod || null,
            deliveryType: deliveryType || 'standard',
            items,
            discountCodeId: discountCodeId || cart.discountCodeId || null,
            totalAmount,
        });

        // Clear cart - use bulk delete for better performance
        const CartItem = require('../models/cart-item.model');
        await CartItem.deleteMany({ cartId: cart._id });
        await cartRepository.update(cart._id, {
            items: [],
            totalPrice: 0,
            discountCodeId: null,
        });

        return orderDetail;
    },

    // Send order confirmation email based on user type
    async sendOrderEmail(orderDetail, guestInfo) {
        try {
            const user = orderDetail.userId ? await userRepository.findById(orderDetail.userId) : null;
            const address = orderDetail.addressId;
            const items = orderDetail.items || [];

            if (user && !guestInfo) {
                // Registered user
                await sendOrderConfirmationEmail(orderDetail, user, items, address);
            } else {
                // Guest user
                await sendGuestOrderConfirmationEmail(
                    orderDetail,
                    guestInfo,
                    items,
                    address,
                    guestInfo?.orderAccessToken || "",
                );
            }
        } catch (err) {
            // Non-critical: log for debugging but don't break order flow
            console.error('[ORDER EMAIL ERROR]', err?.message || err);
        }
    },

    // Tạo đơn hàng
    async createOrder(data) {
        let {
            userId,
            guestInfo,
            addressId,
            items,
            discountCodeId,
            voucherId,
            paymentMethod,
            deliveryType,
        } = data;

        // Chuẩn hóa COD naming để khớp với luồng thanh toán
        if (
            paymentMethod === "cod" ||
            paymentMethod === "cash" ||
            paymentMethod === "cashondelivery"
        ) {
            paymentMethod = "cashondelivery";
        }
        let shippingAddress = null;

        if (!['standard', 'express'].includes(deliveryType))
            deliveryType = 'standard';

        // CASE USER LOGIN
        if (userId && !guestInfo) {
            if (!addressId) {
                const defaultAddr =
                    await addressRepo.findDefaultByUserId(userId);
                if (!defaultAddr) throw new Error('NO_DEFAULT_ADDRESS');
                addressId = defaultAddr._id;
                shippingAddress = defaultAddr;
            }
        }

        if (addressId && !shippingAddress) {
            shippingAddress = await addressRepo.findById(addressId);
        }

        // CASE GUEST
        if (!userId) {
            if (!guestInfo.fullName || !guestInfo.email || !guestInfo.phone)
                throw new Error('Guest must provide fullName, email, phone.');

            const result = await this.createOrGetUserForGuest(guestInfo);
            const user = result.user;
            userId = user._id;
            
            // Store generated password to pass to email
            if (result.isNewAccount && result.generatedPassword) {
                guestInfo.generatedPassword = result.generatedPassword;
            }

            if (!user.loyaltyPoints) user.loyaltyPoints = 0;

            const existingDefault =
                await addressRepo.findDefaultByUserId(userId);
            const isFirstAddress = !existingDefault;

            const addr = await addressRepo.create({
                userId,
                fullNameOfReceiver: guestInfo.fullName,
                phone: guestInfo.phone,
                addressLine: guestInfo.addressLine,
                lat: guestInfo.lat,
                lng: guestInfo.lng,
                isDefault: isFirstAddress,
                isDefault: isFirstAddress,
            });

            if (isFirstAddress) {
                await userRepository.update(userId, {
                    defaultAddressId: addr._id,
                });
            }

            addressId = addr._id;
            shippingAddress = addr;

            // Guest checkout không yêu cầu xác thực email
            // Email xác thực sẽ được gửi sau khi đặt hàng thành công
        }

        if (!shippingAddress) throw new Error('SHIPPING_ADDRESS_NOT_FOUND');

        // TIỀN HÀNG GỐC
        const goodsTotal = Number(data.totalAmount);
        const isGuestOrder = Boolean(guestInfo);
        const guestAccessToken = isGuestOrder ? generateToken() : "";
        const guestAccessTokenHash = isGuestOrder ? sha256(guestAccessToken) : null;
        const guestAccessTokenIssuedAt = isGuestOrder ? new Date() : null;
        const guestAccessTokenExpiresAt = isGuestOrder
            ? new Date(Date.now() + GUEST_ORDER_ACCESS_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000)
            : null;

        //  XỬ LÝ DÙNG COIN
        // -------------------------------------------
        let pointsUsed = Number(data.pointsToUse || 0);
        let coinDiscount = 0;

        if (pointsUsed > 0) {
            // Lấy thông tin user
            const user = await userRepository.findById(userId);
            if (!user) throw new Error('User not found');

            // Kiểm tra đủ coin hay không
            if (pointsUsed > user.loyaltyPoints) {
                pointsUsed = user.loyaltyPoints; // ép về tối đa coin đang có
            }

            // Coin không được vượt quá tổng tiền hàng
            if (pointsUsed > goodsTotal) {
                pointsUsed = goodsTotal;
            }

            coinDiscount = pointsUsed;

            // Trừ coin ngay lập tức (vì người dùng đã dùng coin)
            user.loyaltyPoints -= pointsUsed;
            await user.save();

            // Ghi log coin transaction
            await CoinTransactionRepository.create({
                userId,
                type: 'use',
                amount: pointsUsed,
                balanceAfter: user.loyaltyPoints,
                description: 'Used coins for discount',
            });
        }

        // TÍNH GIẢM GIÁ TỪ DISCOUNT CODE
        let discountAmount = 0;

        if (discountCodeId) {
            const discount = await discountCodeService.validateAndApply({
                userId,
                discountCodeId,
                orderAmount: goodsTotal,
            });
            discountAmount = discount.discountValue || 0;
        }

        // ⭐ XỬ LÝ COLLECTED VOUCHER
        let voucherDiscount = 0;

        if (voucherId) {
            if (!userId) {
                throw new Error('Voucher chỉ áp dụng cho user đã đăng nhập.');
            }

            const uv = await userVoucherRepository.findByUserAndVoucher(
                userId,
                voucherId,
            );

            if (!uv) {
                throw new Error('Bạn chưa thu thập voucher này.');
            }

            if (uv.used) {
                throw new Error('Voucher đã được sử dụng.');
            }

            const voucher = await voucherRepository.findById(voucherId);
            if (!voucher) throw new Error("Voucher không tồn tại.");

            const now = new Date();
            const startAt = voucher.startDate || voucher.createdAt || now;
            const endAt = voucher.endDate || voucher.expiredAt;
            if (startAt && startAt > now) throw new Error("Voucher chưa bắt đầu.");
            if (endAt && endAt < now) throw new Error("Voucher đã hết hạn.");

            // Tính giảm giá
            if (voucher.type === 'fixed') {
                voucherDiscount = voucher.value;
            }

            if (voucher.type === "percent") {
                voucherDiscount = Math.floor(
                    goodsTotal * (voucher.value / 100),
                );
                if (voucher.maxDiscount) {
                    voucherDiscount = Math.min(
                        voucherDiscount,
                        voucher.maxDiscount,
                    );
                }
            }

            // Đảm bảo không vượt quá tiền hàng
            if (voucherDiscount > goodsTotal) voucherDiscount = goodsTotal;

            // Mark voucher as used
            await userVoucherRepository.markUsed(userId, voucherId);
        }

        const goodsAfterDiscount = Math.max(
            goodsTotal - discountAmount - coinDiscount - voucherDiscount,
            0
        );

        // TÍNH PHÍ SHIP
        const ship = await calculateShippingFee(
            {
                lat: shippingAddress.lat,
                lng: shippingAddress.lng,
                addressLine: shippingAddress.addressLine,
                userId: userId,
            },
            500,
            goodsAfterDiscount,
            false,
            deliveryType,
        );

        const shippingFee = Number(ship.fee);

        const finalAmount = goodsAfterDiscount + shippingFee;

        // CREATE ORDER
        const order = await orderRepository.create({
            userId,
            addressId,
            discountCodeId: discountCodeId || null,
            voucherId: voucherId || null,
            paymentMethod: paymentMethod || null,
            deliveryType,
            totalAmount: finalAmount,
            shippingFee,
            discountAmount,
            voucherDiscount,
            pointsUsed,
            pointsEarned: 0,
            guestAccessTokenHash,
            guestAccessTokenIssuedAt,
            guestAccessTokenExpiresAt,
        });

        // CREATE ORDER ITEMS
        await itemRepo.createMany(
            items.map((i) => ({
                orderId: order._id,
                productId: i.productId,
                variantId: i.variantId,
                quantity: i.quantity,
                unitPrice: i.unitPrice,
                subtotal: i.subtotal,
            })),
        );

        await historyRepo.add(order._id, 'pending');

        const orderDetail = await this.getOrderDetail(order._id);

        if (guestInfo && guestAccessToken) {
            try {
                await this.sendOrderEmail(orderDetail, {
                    ...guestInfo,
                    orderAccessToken: guestAccessToken,
                });
            } catch (err) {
                // Non-critical: log for debugging but don't break order flow
                console.error('[ORDER EMAIL ERROR]', err?.message || err);
            }
        }

        return orderDetail;
    },

    // ⭐⭐⭐ Lấy chi tiết đơn hàng — FULL SHIP + PAYMENT + WEATHER
    async getOrderDetail(orderId) {
        const order = await orderRepository.findById(orderId);
        if (!order) return null;

        // Parallelize independent queries for better performance
        const [items, history, address] = await Promise.all([
            itemRepo.findByOrder(orderId),
            historyRepo.getHistory(orderId),
            addressRepo.findById(order.addressId),
        ]);
        if (!address) {
            return null;
        }

        // Weather
        const weather = await getWeatherCondition(address.lat, address.lng);

        // Shipping fee
        const goodsAmount = Math.max(
            Number(order.totalAmount) - Number(order.shippingFee || 0),
            0,
        );

        const shipping = await calculateShippingFee(
            {
                lat: address.lat,
                lng: address.lng,
                addressLine: address.addressLine,
                userId: order.userId,
            },
            500, // tạm thời: trọng lượng mặc định
            goodsAmount, // tổng tiền hàng (không gồm ship)
            false, // freeship hay không
            order.deliveryType, // loại giao hàng
        );

        // Ghi đè phí ship thực tế + thêm weather thông tin
        shipping.fee = Number(order.shippingFee || shipping.fee || 0);
        shipping.weather = weather;

        // Payment
        const payment = await paymentRepo.findByOrderId(orderId);

        // Trả về order detail đầy đủ với address object thay vì addressId
        return {
            ...order,
            addressId: address, // Replace addressId with full address object for frontend compatibility
            items,
            history,
            shipping,
            payment,
        };
    },

    async getOrdersByPhone(phone) {
        const orders = await orderRepository.findByPhone(phone);
        return orders;
    },

    async getOrdersByEmail(email) {
        const orders = await orderRepository.findByEmail(email);
        return orders;
    },

    async requestOrderLookupOtp(orderId) {
        const order = await orderRepository.findByIdWithLookupAccess(orderId);
        if (!order) {
            return null;
        }

        const user = await userRepository.findById(order.userId);
        if (!user?.email) {
            throw new Error('ORDER_LOOKUP_OTP_RECIPIENT_NOT_FOUND');
        }

        const otp = genOtp6();
        const otpHash = sha256(otp);
        const expiresAt = new Date(Date.now() + ORDER_LOOKUP_OTP_TTL_MINUTES * 60 * 1000);

        await orderRepository.updateLookupOtp(orderId, {
            orderLookupOtpHash: otpHash,
            orderLookupOtpExpiresAt: expiresAt,
            orderLookupOtpSentTo: user.email,
            orderLookupOtpAttempts: 0,
            orderLookupOtpVerifiedAt: null,
        });

        await sendOrderLookupOtpEmail(order, user, otp);

        return {
            orderId: order._id.toString(),
            sentTo: user.email,
            expiresAt,
        };
    },

    async verifyOrderLookupOtp(orderId, otp) {
        const order = await orderRepository.findByIdWithLookupAccess(orderId);
        if (!order) {
            return null;
        }

        const normalizedOtp = String(otp || '').trim();
        if (!normalizedOtp || normalizedOtp.length !== 6) {
            throw Object.assign(new Error('Invalid OTP'), { status: 400 });
        }

        const expiredAt = order.orderLookupOtpExpiresAt ? new Date(order.orderLookupOtpExpiresAt) : null;
        if (!order.orderLookupOtpHash || !expiredAt) {
            throw Object.assign(new Error('OTP not requested'), { status: 400 });
        }
        if (expiredAt.getTime() < Date.now()) {
            await orderRepository.clearLookupOtp(orderId);
            throw Object.assign(new Error('OTP expired'), { status: 400 });
        }

        const attempts = Number(order.orderLookupOtpAttempts || 0);
        if (attempts >= 5) {
            throw Object.assign(new Error('Too many OTP attempts'), { status: 429 });
        }

        if (sha256(normalizedOtp) !== order.orderLookupOtpHash) {
            await orderRepository.updateLookupOtp(orderId, {
                orderLookupOtpAttempts: attempts + 1,
            });
            throw Object.assign(new Error('OTP incorrect'), { status: 400 });
        }

        await orderRepository.updateLookupOtp(orderId, {
            orderLookupOtpHash: null,
            orderLookupOtpExpiresAt: null,
            orderLookupOtpSentTo: order.orderLookupOtpSentTo || null,
            orderLookupOtpVerifiedAt: new Date(),
            orderLookupOtpAttempts: attempts + 1,
        });

        return order;
    },

    // Lấy đơn của user với pagination và filters
    async getOrdersByUser(userId, options = {}) {
        const Order = require('../models/order.model');
        const mongoose = require('mongoose');
        
        const {
            page = 1,
            limit = 10,
            status,
            search,
            sortBy = 'date-desc'
        } = options;
        
        const skip = (page - 1) * limit;

        // Build match stage - hard scope to the authenticated owner only
        const matchStage = { userId: new mongoose.Types.ObjectId(userId) };
        if (status && status !== 'all') {
            matchStage.status = status;
        }

        const searchTerm = String(search || '').trim().replace(/^#/, '');
        const escapedSearchTerm = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const hasSearch = Boolean(searchTerm);
        const searchRegex = hasSearch ? new RegExp(escapedSearchTerm, 'i') : null;

        // Build sort stage
        let sortStage = { createdAt: -1 }; // default: newest first
        if (sortBy === 'date-asc') sortStage = { createdAt: 1 };
        else if (sortBy === 'total-desc') sortStage = { totalAmount: -1 };
        else if (sortBy === 'total-asc') sortStage = { totalAmount: 1 };

        const searchStages = hasSearch ? [
            {
                $addFields: {
                    orderIdString: { $toString: '$_id' },
                },
            },
            {
                $match: {
                    $or: [
                        { orderIdString: { $regex: searchRegex } },
                        { 'user.email': { $regex: searchRegex } },
                        { 'user.phone': { $regex: searchRegex } },
                        { 'user.fullName': { $regex: searchRegex } },
                        { 'address.phone': { $regex: searchRegex } },
                        { 'address.fullNameOfReceiver': { $regex: searchRegex } },
                    ],
                },
            },
        ] : [];

        const basePipeline = [
            { $match: matchStage },
            {
                $lookup: {
                    from: 'addresses',
                    localField: 'addressId',
                    foreignField: '_id',
                    as: 'address',
                },
            },
            { $unwind: { path: '$address', preserveNullAndEmptyArrays: true } },
            {
                $lookup: {
                    from: 'users',
                    localField: 'userId',
                    foreignField: '_id',
                    as: 'user',
                },
            },
            { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
            ...searchStages,
        ];

        const totalOrdersResult = await Order.aggregate([
            ...basePipeline,
            { $count: 'total' },
        ]);
        const totalOrders = totalOrdersResult[0]?.total || 0;

        const ordersWithItems = await Order.aggregate([
            ...basePipeline,
            { $sort: sortStage },
            { $skip: skip },
            { $limit: parseInt(limit) },
            {
                $lookup: {
                    from: 'orderitems',
                    localField: '_id',
                    foreignField: 'orderId',
                    as: 'items'
                }
            },
            {
                $lookup: {
                    from: 'products',
                    localField: 'items.productId',
                    foreignField: '_id',
                    as: 'products'
                }
            },
            {
                $lookup: {
                    from: 'variants',
                    localField: 'items.variantId',
                    foreignField: '_id',
                    as: 'variants'
                }
            },
            {
                $addFields: {
                    items: {
                        $map: {
                            input: '$items',
                            as: 'item',
                            in: {
                                $mergeObjects: [
                                    '$$item',
                                    {
                                        productId: {
                                            $arrayElemAt: [
                                                {
                                                    $filter: {
                                                        input: '$products',
                                                        cond: { $eq: ['$$this._id', '$$item.productId'] }
                                                    }
                                                },
                                                0
                                            ]
                                        },
                                        variantId: {
                                            $arrayElemAt: [
                                                {
                                                    $filter: {
                                                        input: '$variants',
                                                        cond: { $eq: ['$$this._id', '$$item.variantId'] }
                                                    }
                                                },
                                                0
                                            ]
                                        }
                                    }
                                ]
                            }
                        }
                    }
                }
            },
            {
                $lookup: {
                    from: 'discount_codes',
                    localField: 'discountCodeId',
                    foreignField: '_id',
                    as: 'discountCode'
                }
            },
            { $unwind: { path: '$discountCode', preserveNullAndEmptyArrays: true } },
            {
                $lookup: {
                    from: 'vouchers',
                    localField: 'voucherId',
                    foreignField: '_id',
                    as: 'voucher'
                }
            },
            { $unwind: { path: '$voucher', preserveNullAndEmptyArrays: true } },
            {
                $project: {
                    _id: 1,
                    userId: 1,
                    addressId: '$address',
                    discountCodeId: { _id: '$discountCode._id', code: '$discountCode.code', value: '$discountCode.value' },
                    voucherId: { _id: '$voucher._id', code: '$voucher.code', value: '$voucher.value', type: '$voucher.type' },
                    totalAmount: 1,
                    pointsUsed: 1,
                    pointsEarned: 1,
                    deliveryType: 1,
                    shippingFee: 1,
                    paymentMethod: 1,
                    paymentStatus: 1,
                    zaloAppTransId: 1,
                    status: 1,
                    createdAt: 1,
                    updatedAt: 1,
                    items: {
                        $map: {
                            input: '$items',
                            as: 'item',
                            in: {
                                _id: '$$item._id',
                                orderId: '$$item.orderId',
                                quantity: '$$item.quantity',
                                unitPrice: '$$item.unitPrice',
                                subtotal: '$$item.subtotal',
                                productId: {
                                    _id: '$$item.productId._id',
                                    name: '$$item.productId.name',
                                    imageUrls: '$$item.productId.imageUrls'
                                },
                                variantId: {
                                    _id: '$$item.variantId._id',
                                    name: '$$item.variantId.name',
                                    imageUrls: '$$item.variantId.imageUrls'
                                }
                            }
                        }
                    }
                }
            }
        ]);

        return {
            orders: ordersWithItems,
            total: totalOrders,
            page: parseInt(page),
            limit: parseInt(limit),
            totalPages: Math.ceil(totalOrders / limit)
        };
    },

    // Admin: lấy tất cả
    async getAll(filter, options) {
        return await orderRepository.findAll(filter, options);
    },

    async updateStatus(orderId, newStatus) {
        const updated = await orderRepository.updateStatus(orderId, newStatus);
        if (!updated) return null;

        // COD/cashondelivery: chỉ ghi nhận đã thanh toán khi giao/hoàn tất
        if (
            (updated.paymentMethod === "cashondelivery" ||
                updated.paymentMethod === "cod" ||
                updated.paymentMethod === "cash") &&
            updated.paymentStatus !== "paid" &&
            (newStatus === "delivered" || newStatus === "completed")
        ) {
            const now = new Date();

            await orderRepository.updatePaymentStatus(orderId, {
                status: newStatus,
                paymentStatus: "paid",
                paymentMethod: "cashondelivery",
            });

            const existingPayment = await paymentRepo.findByOrderId(orderId);
            const txId = existingPayment?.transactionId || `CASH-${orderId}`;

            const paymentPayload = {
                method: "cashondelivery",
                status: "success",
                transactionId: txId,
                paidAt: now,
            };

            if (existingPayment) {
                await paymentRepo.updateByOrderId(orderId, paymentPayload);
            } else {
                await paymentRepo.create({
                    orderId,
                    ...paymentPayload,
                });
            }

            updated.paymentStatus = "paid";
            updated.paymentMethod = "cashondelivery";
        }

        await historyRepo.add(orderId, newStatus);

        // Send status update email (async, don't block response)
        this.sendStatusUpdateEmail(updated, newStatus).catch(err => {
            console.error('[EMAIL] Failed to send status update:', err);
        });

        // ⭐ Decrement stock when order is confirmed
        if (
            newStatus === 'confirmed' &&
            !updated._stockDeducted
        ) {
            try {
                const orderItems = await itemRepo.findByOrder(orderId);
                const stockItems = orderItems.map(item => ({
                    variantId: typeof item.variantId === 'object' ? item.variantId._id : item.variantId,
                    quantity: item.quantity
                }));
                
                const stockResult = await variantRepo.bulkDecrementStock(stockItems);
                
                if (stockResult.success) {
                    await orderRepository.updateById(orderId, { _stockDeducted: true });
                    console.log(`[STOCK] Decremented stock for order ${orderId}`);
                } else {
                    // Some items don't have enough stock - log warning
                    console.warn(`[STOCK WARNING] Insufficient stock for some items in order ${orderId}:`, stockResult.failedItems);
                    // Still mark as deducted for items that succeeded
                    await orderRepository.updateById(orderId, { _stockDeducted: true });
                }
            } catch (err) {
                console.error('[STOCK DECREMENT ERROR]', err?.message || err);
            }
        }

        // ⭐ Mark discount code as used when order is confirmed
        if (
            newStatus === 'confirmed' &&
            updated.discountCodeId &&
            !updated._discountCodeMarkedUsed
        ) {
            try {
                // Re-validate usage limit before marking as used (prevents race condition)
                const canUse = await discountCodeService.checkUsageLimit(updated.discountCodeId);
                if (canUse) {
                    await discountCodeService.markUsed(updated.discountCodeId);
                    // Mark order so we don't double-increment on subsequent status changes
                    await orderRepository.updateById(orderId, { _discountCodeMarkedUsed: true });
                }
            } catch (err) {
                // Non-critical: log for debugging but order still proceeds
                console.error('[DISCOUNT CODE USAGE ERROR]', err?.message || err);
            }
        }

        // ⭐ Handle order cancellation - restore discount code usage
        if (
            newStatus === 'cancelled' &&
            updated.discountCodeId &&
            updated._discountCodeMarkedUsed
        ) {
            try {
                await discountCodeService.decrementUsedCount(updated.discountCodeId);
                await orderRepository.updateById(orderId, { _discountCodeMarkedUsed: false });
            } catch (err) {
                // Non-critical: log for debugging
                console.error('[DISCOUNT CODE RESTORE ERROR]', err?.message || err);
            }
        }

        // ⭐ Restore stock when order is cancelled
        if (
            newStatus === 'cancelled' &&
            updated._stockDeducted
        ) {
            try {
                const orderItems = await itemRepo.findByOrder(orderId);
                const stockItems = orderItems.map(item => ({
                    variantId: typeof item.variantId === 'object' ? item.variantId._id : item.variantId,
                    quantity: item.quantity
                }));
                
                await variantRepo.bulkIncrementStock(stockItems);
                await orderRepository.updateById(orderId, { _stockDeducted: false });
                console.log(`[STOCK] Restored stock for cancelled order ${orderId}`);
            } catch (err) {
                console.error('[STOCK RESTORE ERROR]', err?.message || err);
            }
        }

        // Nếu đơn hoàn tất
        if (newStatus === 'completed' || newStatus === 'delivered') {
            // ⭐ Update totalUnitsSold for each product in the order
            try {
                const orderItems = await itemRepo.findByOrder(orderId);
                for (const item of orderItems) {
                    if (item.productId) {
                        const productId = typeof item.productId === 'object' ? item.productId._id : item.productId;
                        await Product.findByIdAndUpdate(productId, {
                            $inc: { totalUnitsSold: item.quantity }
                        });
                    }
                }
            } catch (err) {
                // Non-critical: log for debugging
                console.error('[UPDATE UNITS SOLD ERROR]', err?.message || err);
            }

            if (updated.userId && updated.totalAmount) {
                const goodsAmount =
                    updated.totalAmount -
                    updated.shippingFee +
                    (updated.discountAmount || 0) +
                    (updated.pointsUsed || 0);

                try {
                    // ⭐ Loyalty: cộng coin
                    const result = await loyaltyService.handleOrderCompleted(
                        updated.userId,
                        goodsAmount,
                        updated._id,
                    );

                    // lưu coin
                    await orderRepository.updateById(updated._id, {
                        pointsEarned: result.earnedCoins,
                    });

                    // ⭐ Badge: lấy user
                    const user = await userRepository.findById(updated.userId);

                    if (user) {
                        // ⭐ Trả về list huy hiệu mới unlock
                        const newBadges =
                            await badgeService.checkAndAssignBadges(user);

                        if (newBadges && newBadges.length > 0) {
                            updated.newBadges = newBadges;
                        }
                    }
                } catch (err) {
                    console.error('Loyalty/Badge update error:', err);
                }
            }
        }

        return updated;
    },

    // Send order status update email
    async sendStatusUpdateEmail(order, newStatus) {
        try {
            if (!order.userId) return; // Skip for guest orders without user

            const user = await userRepository.findById(order.userId);
            if (!user?.email) return;

            await sendOrderStatusUpdateEmail(order, user, newStatus);
        } catch (err) {
            console.error('[EMAIL] Error in sendStatusUpdateEmail:', err);
        }
    },

    async getOrdersByDiscountCode(discountCodeId) {
        const orders = await orderRepository.findByDiscountCode(discountCodeId);
        return orders;
    }

};
