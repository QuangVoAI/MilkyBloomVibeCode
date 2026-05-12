const orderService = require("../services/order.service");
const loyaltyService = require("../services/loyalty.service");
const badgeService = require("../services/badge.service");
const orderRepository = require("../repositories/order.repository");
const { sha256 } = require("../utils/token.js");
const jwt = require("jsonwebtoken");

const ORDER_LOOKUP_JWT_SECRET = process.env.ORDER_LOOKUP_JWT_SECRET || process.env.JWT_SECRET;
const ORDER_LOOKUP_JWT_TTL = process.env.ORDER_LOOKUP_JWT_TTL || "15m";

module.exports = {
    async create(req, res) {
        try {
            const result = await orderService.createOrder(req.body);
            return res.json({ success: true, order: result });
        } catch (err) {
            console.error(err);
            return res
                .status(500)
                .json({ success: false, message: err.message });
        }
    },

    async getDetail(req, res) {
        try {
            const order = await orderService.getOrderDetail(req.params.id);
            if (!order)
                return res
                    .status(404)
                    .json({ success: false, message: "Order not found" });

            // Security check: user can only view their own orders
            // req.user is set by auth middleware for authenticated routes
            if (req.user) {
                const userId = req.user.id || req.user._id;
                const orderUserId = order.userId?._id?.toString() || order.userId?.toString();
                
                // Allow if user owns the order OR user is admin
                if (orderUserId && orderUserId !== userId.toString() && req.user.role !== 'admin') {
                    return res.status(403).json({ 
                        success: false, 
                        code: 'ORDER_LOOKUP_OTP_REQUIRED',
                        lookup_otp_required: true,
                        message: "You don't have permission to view this order" 
                    });
                }
            }

            return res.json({
                success: true,
                data: order,
                ownership_verified: true,
                ownership_verified_by: req.user?.role === 'admin' ? 'admin' : 'auth',
            });
        } catch (err) {
            console.error('getDetail error:', err);
            return res.status(500).json({ success: false, message: err.message });
        }
    },

    // Guest order detail - requires login ownership or order access token
    async getGuestOrderDetail(req, res) {
        try {
            const orderOwnership = await orderRepository.findByIdWithLookupAccess(req.params.id);
            if (!orderOwnership)
                return res
                    .status(404)
                    .json({ success: false, message: "Order not found" });

            const accessToken = String(
                req.query.accessToken ||
                req.query.access_token ||
                req.headers['x-order-access-token'] ||
                ''
            ).trim();
            const lookupToken = String(
                req.query.lookupToken ||
                req.query.lookup_token ||
                req.headers['x-order-lookup-token'] ||
                ''
            ).trim();

            if (accessToken) {
                const expiredAt = orderOwnership.guestAccessTokenExpiresAt
                    ? new Date(orderOwnership.guestAccessTokenExpiresAt)
                    : null;
                if (!orderOwnership.guestAccessTokenHash || !expiredAt || expiredAt.getTime() < Date.now()) {
                    return res.status(403).json({
                        success: false,
                        message: "Order access token is missing or expired.",
                        ownership_verified: false,
                    });
                }

                if (sha256(accessToken) !== orderOwnership.guestAccessTokenHash) {
                    return res.status(403).json({
                        success: false,
                        message: "Invalid order access token.",
                        ownership_verified: false,
                    });
                }

                const fullOrder = await orderService.getOrderDetail(req.params.id);
                return res.json({
                    success: true,
                    data: fullOrder,
                    ownership_verified: true,
                    ownership_verified_by: 'access_token',
                });
            }

            if (lookupToken) {
                if (!ORDER_LOOKUP_JWT_SECRET) {
                    return res.status(500).json({
                        success: false,
                        message: "Order lookup secret is not configured.",
                        ownership_verified: false,
                    });
                }

                try {
                    const decoded = jwt.verify(lookupToken, ORDER_LOOKUP_JWT_SECRET);
                    const tokenOrderId = String(decoded?.orderId || decoded?.order_id || '');
                    const tokenScope = String(decoded?.scope || '');
                    if (tokenScope !== 'order_lookup' || tokenOrderId !== String(req.params.id)) {
                        return res.status(403).json({
                            success: false,
                            code: 'ORDER_LOOKUP_OTP_REQUIRED',
                            lookup_otp_required: true,
                            message: "Order lookup token is invalid for this order.",
                            ownership_verified: false,
                        });
                    }

                    const fullOrder = await orderService.getOrderDetail(req.params.id);
                    return res.json({
                        success: true,
                        data: fullOrder,
                        ownership_verified: true,
                        ownership_verified_by: 'lookup_otp',
                    });
                } catch (err) {
                    return res.status(403).json({
                        success: false,
                        code: 'ORDER_LOOKUP_OTP_REQUIRED',
                        lookup_otp_required: true,
                        message: "Order lookup OTP is required or has expired.",
                        ownership_verified: false,
                    });
                }
            }

            if (req.user) {
                const userId = req.user.id || req.user._id;
                const orderUserId = orderOwnership.userId?._id?.toString() || orderOwnership.userId?.toString();
                if (orderUserId && orderUserId !== userId.toString() && req.user.role !== 'admin') {
                    return res.status(403).json({
                        success: false,
                        code: 'ORDER_LOOKUP_OTP_REQUIRED',
                        lookup_otp_required: true,
                        message: "You don't have permission to view this order",
                    });
                }

                const fullOrder = await orderService.getOrderDetail(req.params.id);
                return res.json({
                    success: true,
                    data: fullOrder,
                    ownership_verified: true,
                    ownership_verified_by: req.user.role === 'admin' ? 'admin' : 'auth',
                });
            }

            return res.status(403).json({
                success: false,
                code: 'ORDER_LOOKUP_OTP_REQUIRED',
                lookup_otp_required: true,
                message: "Order access token, lookup OTP, or login is required to view this order.",
                ownership_verified: false,
            });
        } catch (err) {
            console.error('getGuestOrderDetail error:', err);
            return res.status(500).json({ success: false, message: err.message });
        }
    },

    async requestOrderLookupOtp(req, res) {
        try {
            const result = await orderService.requestOrderLookupOtp(req.params.id);
            if (!result) {
                return res.status(404).json({ success: false, message: "Order not found" });
            }

            return res.json({
                success: true,
                message: "OTP sent to the email on file.",
                lookup_otp_required: true,
                expiresAt: result.expiresAt,
            });
        } catch (err) {
            const status = err.status || 500;
            console.error('requestOrderLookupOtp error:', err);
            return res.status(status).json({
                success: false,
                code: 'ORDER_LOOKUP_OTP_SEND_FAILED',
                message: err.message,
            });
        }
    },

    async verifyOrderLookupOtp(req, res) {
        try {
            const { otp } = req.body;
            const order = await orderService.verifyOrderLookupOtp(req.params.id, otp);
            if (!order) {
                return res.status(404).json({ success: false, message: "Order not found" });
            }

            if (!ORDER_LOOKUP_JWT_SECRET) {
                return res.status(500).json({
                    success: false,
                    message: "Order lookup secret is not configured.",
                });
            }

            const lookupToken = jwt.sign(
                {
                    orderId: order._id.toString(),
                    scope: 'order_lookup',
                },
                ORDER_LOOKUP_JWT_SECRET,
                { expiresIn: ORDER_LOOKUP_JWT_TTL },
            );

            const fullOrder = await orderService.getOrderDetail(req.params.id);
            return res.json({
                success: true,
                message: "OTP verification success.",
                lookupToken,
                lookup_otp_required: false,
                ownership_verified: true,
                ownership_verified_by: 'lookup_otp',
                data: fullOrder,
            });
        } catch (err) {
            const status = err.status || 500;
            console.error('verifyOrderLookupOtp error:', err);
            return res.status(status).json({
                success: false,
                code: 'ORDER_LOOKUP_OTP_INVALID',
                lookup_otp_required: true,
                message: err.message,
            });
        }
    },

    async searchGuestOrdersByPhone(req, res) {
        try {
            if (!req.internalService && req.user?.role !== 'admin') {
                return res.status(403).json({
                    success: false,
                    message: 'Internal lookup only',
                });
            }
            const { phone } = req.query;
            if (!phone) {
                return res.status(400).json({
                    success: false,
                    message: 'phone is required',
                });
            }

            const orders = await orderService.getOrdersByPhone(phone);
            return res.json({
                success: true,
                count: orders.length,
                data: orders,
            });
        } catch (err) {
            console.error('searchGuestOrdersByPhone error:', err);
            return res.status(500).json({ success: false, message: err.message });
        }
    },

    async getMyOrders(req, res) {
        const { page = 1, limit = 10, status, search, sortBy } = req.query;
        const result = await orderService.getOrdersByUser(req.user.id, {
            page,
            limit,
            status,
            search,
            sortBy
        });
        return res.json({ 
            success: true, 
            orders: result.orders,
            total: result.total,
            page: result.page,
            limit: result.limit,
            totalPages: result.totalPages
        });
    },

    // Checkout từ cart cho user login
    async checkoutFromCartForUser(req, res, next) {
        try {
            const userId = req.user.id;
            const { addressId, discountCodeId, pointsToUse, voucherId, paymentMethod, deliveryType } =
                req.body;

            const detail = await orderService.createOrderFromCart({
                userId,
                addressId,
                discountCodeId: discountCodeId || null,
                voucherId: voucherId || null,
                pointsToUse: Number(pointsToUse) || 0,
                paymentMethod: paymentMethod || 'cashondelivery',
                deliveryType: deliveryType || 'standard',
            });

            res.status(201).json({ success: true, data: detail });
        } catch (err) {
            next(err);
        }
    },

    // Checkout từ cart cho guest (session)
    async checkoutFromCartForGuest(req, res, next) {
        try {
            const { sessionId, guestInfo, discountCodeId, pointsToUse, paymentMethod } =
                req.body;

            const detail = await orderService.createOrderFromCart({
                sessionId,
                guestInfo,
                discountCodeId: discountCodeId || null,
                pointsToUse: Number(pointsToUse) || 0,
                paymentMethod: paymentMethod || 'cashondelivery',
            });

            res.status(201).json({ success: true, data: detail });
        } catch (err) {
            next(err);
        }
    },

    async adminGetAll(req, res) {
        // Pass empty filter, all filtering is done via options
        const result = await orderService.getAll({}, req.query);
        return res.json({ 
            success: true, 
            orders: result.orders,
            total: result.total,
            page: result.page,
            limit: result.limit,
            totalPages: result.totalPages
        });
    },

    async updateStatus(req, res) {
        try {
            const updated = await orderService.updateStatus(
                req.params.id,
                req.body.status,
            );
            if (!updated)
                return res
                    .status(404)
                    .json({ success: false, message: "Order not found" });

            return res.json({
                success: true,
                order: updated,
                newBadges: updated.newBadges || [],
            });
        } catch (err) {
            console.error("Update Order Status Error:", err);
            return res
                .status(500)
                .json({ success: false, message: err.message });
        }
    },

    async getOrdersByDiscountCode(req, res) {
        try {
            const { discountCodeId } = req.params;
            const orders = await orderService.getOrdersByDiscountCode(discountCodeId);
            return res.json({ success: true, orders });
        } catch (err) {
            console.error("Get Orders By Discount Code Error:", err);
            return res
                .status(500)
                .json({ success: false, message: err.message });
        }
    },

    async cancelOrder(req, res) {
        try {
            const orderId = req.params.id;
            const userId = req.user?.id;
            
            // Get order to check ownership and status
            const order = await orderService.getOrderDetail(orderId);
            
            if (!order) {
                return res.status(404).json({ 
                    success: false, 
                    message: "Order not found" 
                });
            }
            
            // Check if user owns this order (unless admin)
            if (req.user?.role !== 'admin' && order.userId.toString() !== userId) {
                return res.status(403).json({ 
                    success: false, 
                    message: "You can only cancel your own orders" 
                });
            }
            
            // Check if order can be cancelled
            if (!['pending', 'confirmed'].includes(order.status)) {
                return res.status(400).json({ 
                    success: false, 
                    message: `Cannot cancel order with status: ${order.status}` 
                });
            }
            
            // Cancel the order
            const cancelled = await orderService.updateStatus(orderId, 'cancelled');
            
            return res.json({
                success: true,
                order: cancelled,
            });
        } catch (err) {
            console.error("Cancel Order Error:", err);
            return res
                .status(500)
                .json({ success: false, message: err.message });
        }
    },
};
