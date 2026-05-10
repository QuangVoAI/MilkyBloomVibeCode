const orderService = require("../services/order.service");
const loyaltyService = require("../services/loyalty.service");
const badgeService = require("../services/badge.service");

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
                        message: "You don't have permission to view this order" 
                    });
                }
            }

            return res.json({ success: true, data: order });
        } catch (err) {
            console.error('getDetail error:', err);
            return res.status(500).json({ success: false, message: err.message });
        }
    },

    // Guest order detail - requires matching session or email
    async getGuestOrderDetail(req, res) {
        try {
            const order = await orderService.getOrderDetail(req.params.id);
            if (!order)
                return res
                    .status(404)
                    .json({ success: false, message: "Order not found" });

            // For guest orders, verify by sessionId or email from query
            const { sessionId, email } = req.query;
            
            // order.userId is just an ObjectId - we need to look up the user to get their email
            let orderUserEmail = null;
            if (order.userId) {
                const User = require('../models/user.model');
                const user = await User.findById(order.userId).lean();
                orderUserEmail = user?.email;
            }
            
            // Get email from order - check user's email or shipping address
            const orderEmail = orderUserEmail || order.shippingAddress?.email;

            // Verify by email match (case-insensitive)
            const emailMatch = email && orderEmail && 
                               orderEmail.toLowerCase() === email.toLowerCase();

            // If email matches, allow access
            if (emailMatch) {
                return res.json({ success: true, data: order });
            }

            // If neither email nor sessionId provided, reject
            if (!sessionId && !email) {
                return res.status(403).json({ 
                    success: false, 
                    message: "Please provide email or session to verify order ownership." 
                });
            }

            // If order has a userId but no matching email, 
            // it's likely a registered user order - guest endpoint shouldn't work
            return res.status(403).json({ 
                success: false, 
                message: "Cannot verify order ownership. Please login if you have an account." 
            });
        } catch (err) {
            console.error('getGuestOrderDetail error:', err);
            return res.status(500).json({ success: false, message: err.message });
        }
    },

    async searchGuestOrdersByPhone(req, res) {
        try {
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
