const Order = require("../models/order.model");
const User = require("../models/user.model");
const Address = require("../models/address.model");

const normalizePhone = (value) =>
    String(value || "").replace(/\D/g, "").trim();

const getOrderItemsForOrders = async (orders) => {
    if (!orders || orders.length === 0) return orders;

    const OrderItem = require('../models/order-item.model');
    const orderIds = orders.map(o => o._id);

    const allItems = await OrderItem.find({ orderId: { $in: orderIds } })
        .populate({
            path: 'productId',
            select: 'name imageUrls'
        })
        .populate({
            path: 'variantId',
            select: 'name imageUrls'
        })
        .lean();

    const itemsByOrder = {};
    allItems.forEach(item => {
        const orderId = item.orderId.toString();
        if (!itemsByOrder[orderId]) {
            itemsByOrder[orderId] = [];
        }
        itemsByOrder[orderId].push(item);
    });

    orders.forEach(order => {
        order.items = itemsByOrder[order._id.toString()] || [];
    });

    return orders;
};

module.exports = {
    create(data) {
        return Order.create(data);
    },

    findById(id) {
        return Order.findById(id).lean();
    },

    findByIdWithGuestAccess(id) {
        return Order.findById(id)
            .select('+guestAccessTokenHash +guestAccessTokenExpiresAt')
            .lean();
    },

    findByIdWithLookupAccess(id) {
        return Order.findById(id)
            .select(
                '+guestAccessTokenHash +guestAccessTokenExpiresAt +orderLookupOtpHash +orderLookupOtpExpiresAt +orderLookupOtpSentTo +orderLookupOtpAttempts +orderLookupOtpVerifiedAt',
            )
            .lean();
    },

    updateLookupOtp(id, update = {}) {
        const $set = {};
        if (Object.prototype.hasOwnProperty.call(update, 'orderLookupOtpHash')) {
            $set.orderLookupOtpHash = update.orderLookupOtpHash;
        }
        if (Object.prototype.hasOwnProperty.call(update, 'orderLookupOtpExpiresAt')) {
            $set.orderLookupOtpExpiresAt = update.orderLookupOtpExpiresAt;
        }
        if (Object.prototype.hasOwnProperty.call(update, 'orderLookupOtpSentTo')) {
            $set.orderLookupOtpSentTo = update.orderLookupOtpSentTo;
        }
        if (Object.prototype.hasOwnProperty.call(update, 'orderLookupOtpVerifiedAt')) {
            $set.orderLookupOtpVerifiedAt = update.orderLookupOtpVerifiedAt;
        }
        if (typeof update.orderLookupOtpAttempts === 'number') {
            $set.orderLookupOtpAttempts = update.orderLookupOtpAttempts;
        }

        return Order.findByIdAndUpdate(
            id,
            {
                $set,
            },
            { new: true },
        );
    },

    clearLookupOtp(id) {
        return Order.findByIdAndUpdate(
            id,
            {
                $set: {
                    orderLookupOtpHash: null,
                    orderLookupOtpExpiresAt: null,
                    orderLookupOtpSentTo: null,
                    orderLookupOtpVerifiedAt: null,
                    orderLookupOtpAttempts: 0,
                },
            },
            { new: true },
        );
    },

    async findByPhone(phone) {
        const normalizedPhone = normalizePhone(phone);
        if (!normalizedPhone) return [];

        const [users, addresses] = await Promise.all([
            User.find({ phone: { $regex: normalizedPhone } }).select('_id').lean(),
            Address.find({ phone: { $regex: normalizedPhone } }).select('_id').lean(),
        ]);

        const orConditions = [];
        if (users.length > 0) {
            orConditions.push({ userId: { $in: users.map(u => u._id) } });
        }
        if (addresses.length > 0) {
            orConditions.push({ addressId: { $in: addresses.map(a => a._id) } });
        }

        if (orConditions.length === 0) return [];

        const orders = await Order.find({ $or: orConditions })
            .populate('userId', 'fullName email username phone')
            .populate('addressId', 'fullNameOfReceiver phone addressLine city postalCode lat lng')
            .populate('discountCodeId', 'code value')
            .populate('voucherId', 'code value type')
            .sort({ createdAt: -1 })
            .lean();

        return getOrderItemsForOrders(orders);
    },

    async findByEmail(email) {
        const normalizedEmail = String(email || "").trim().toLowerCase();
        if (!normalizedEmail || !normalizedEmail.includes("@")) return [];

        const users = await User.find({ email: normalizedEmail }).select('_id').lean();
        if (users.length === 0) return [];

        const orders = await Order.find({ userId: { $in: users.map(u => u._id) } })
            .populate('userId', 'fullName email username phone')
            .populate('addressId', 'fullNameOfReceiver phone addressLine city postalCode lat lng')
            .populate('discountCodeId', 'code value')
            .populate('voucherId', 'code value type')
            .sort({ createdAt: -1 })
            .lean();

        return getOrderItemsForOrders(orders);
    },

  findByZaloAppTransId(apptransid) {
    return Order.findOne({ zaloAppTransId: apptransid }).lean();
  },

  // Tìm đơn ZaloPay chưa paid theo số tiền (lấy đơn mới nhất trong vòng 24h)
  async findRecentUnpaidZaloByAmount(amount, hours = 24) {
    const since = new Date(Date.now() - hours * 3600 * 1000);
    return Order.findOne({
      paymentMethod: "zalopay",
      paymentStatus: { $ne: "paid" },
      totalAmount: amount,
      createdAt: { $gte: since },
    })
      .sort({ createdAt: -1 })
      .lean();
  },

  async findByUser(userId) {
    const orders = await Order.find({ userId })
      .populate('addressId', 'fullNameOfReceiver phone addressLine city postalCode')
      .populate('discountCodeId', 'code value')
      .populate('voucherId', 'code value type')
      .sort({ createdAt: -1 })
      .lean();
    
    // Batch populate items for all orders at once (avoid N+1 query)
    if (orders.length > 0) {
      const OrderItem = require('../models/order-item.model');
      const orderIds = orders.map(o => o._id);
      
      const allItems = await OrderItem.find({ orderId: { $in: orderIds } })
        .populate({
          path: 'productId',
          select: 'name imageUrls'
        })
        .populate({
          path: 'variantId',
          select: 'name imageUrls'
        })
        .lean();
      
      // Group items by orderId
      const itemsByOrder = {};
      allItems.forEach(item => {
        const orderId = item.orderId.toString();
        if (!itemsByOrder[orderId]) {
          itemsByOrder[orderId] = [];
        }
        itemsByOrder[orderId].push(item);
      });
      
      // Assign items to each order
      orders.forEach(order => {
        order.items = itemsByOrder[order._id.toString()] || [];
      });
    }
    
    return orders;
  },

    async findAll(filter = {}, options = {}) {
        const { page = 1, limit = 20, search, status, deliveryType, paymentMethod, sortBy } = options;
        
        // Build MongoDB query
        const query = { ...filter };
        
        // Add search filter if provided
        if (search && search.trim()) {
            let searchTerm = search.trim();
            
            // Remove # prefix if present (users often search #A1B2C3D4)
            if (searchTerm.startsWith('#')) {
                searchTerm = searchTerm.substring(1);
            }
            
            // Escape special regex characters to prevent errors
            const escapedSearchTerm = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            
            // Build OR conditions for searchable fields
            const orConditions = [];
            
            // Search for matching users by email, fullName, or username
            try {
                const searchRegex = new RegExp(escapedSearchTerm, 'i');
                const matchingUsers = await User.find({
                    $or: [
                        { email: { $regex: searchRegex } },
                        { fullName: { $regex: searchRegex } },
                        { username: { $regex: searchRegex } }
                    ]
                }).select('_id').lean();
                
                // Add user IDs to search conditions
                if (matchingUsers.length > 0) {
                    const userIds = matchingUsers.map(u => u._id);
                    orConditions.push({ userId: { $in: userIds } });
                }
            } catch (err) {
                console.error('Error searching users:', err);
            }
            
            // Search by order ID - support full ID or partial match anywhere
            if (/^[0-9a-fA-F]{24}$/.test(searchTerm)) {
                // Full ObjectId - exact match
                orConditions.push({ _id: searchTerm });
            } else if (/^[0-9a-fA-F]+$/.test(searchTerm)) {
                // Partial hex string - search orders whose ID contains this anywhere
                try {
                    const allOrderIds = await Order.find({}).select('_id').lean();
                    const matchingOrderIds = allOrderIds
                        .filter(o => o._id.toString().toLowerCase().includes(searchTerm.toLowerCase()))
                        .map(o => o._id);
                    
                    if (matchingOrderIds.length > 0) {
                        orConditions.push({ _id: { $in: matchingOrderIds } });
                    }
                } catch (err) {
                    console.error('Error searching by partial order ID:', err);
                }
            }
            
            // Only add $or if we have conditions, otherwise return empty result
            if (orConditions.length > 0) {
                query.$or = orConditions;
            } else {
                // No matching users or valid order ID pattern found
                // Return empty result by adding impossible condition
                query._id = null;
            }
        }
        
        // Add status filter
        if (status && status !== 'all') {
            query.status = status;
        }
        
        // Add delivery type filter
        if (deliveryType && deliveryType !== 'all') {
            query.deliveryType = deliveryType;
        }
        
        // Add payment method filter
        if (paymentMethod && paymentMethod !== 'all') {
            query.paymentMethod = paymentMethod;
        }
        
        // Build sort object based on sortBy parameter
        let sortOptions = { createdAt: -1 }; // Default: newest first
        if (sortBy) {
            switch (sortBy) {
                case 'newest':
                    sortOptions = { createdAt: -1 };
                    break;
                case 'oldest':
                    sortOptions = { createdAt: 1 };
                    break;
                case 'total-high':
                    sortOptions = { totalAmount: -1 };
                    break;
                case 'total-low':
                    sortOptions = { totalAmount: 1 };
                    break;
                default:
                    sortOptions = { createdAt: -1 };
            }
        }
        
        const orders = await Order.find(query)
            .populate('userId', 'fullName email username phone')
            .populate('addressId', 'fullNameOfReceiver phone addressLine city postalCode lat lng')
            .populate('discountCodeId', 'code value')
            .populate('voucherId', 'code value type')
            .sort(sortOptions)
            .skip((page - 1) * limit)
            .limit(limit)
            .lean();
        
        // Batch populate items for all orders at once (avoid N+1 query)
        if (orders.length > 0) {
            const OrderItem = require('../models/order-item.model');
            const orderIds = orders.map(o => o._id);
            
            const allItems = await OrderItem.find({ orderId: { $in: orderIds } })
                .populate({
                    path: 'productId',
                    select: 'name imageUrls'
                })
                .populate({
                    path: 'variantId',
                    select: 'name imageUrls'
                })
                .lean();
            
            // Group items by orderId
            const itemsByOrder = {};
            allItems.forEach(item => {
                const orderId = item.orderId.toString();
                if (!itemsByOrder[orderId]) {
                    itemsByOrder[orderId] = [];
                }
                itemsByOrder[orderId].push(item);
            });
            
            // Assign items to each order
            orders.forEach(order => {
                order.items = itemsByOrder[order._id.toString()] || [];
            });
        }
        
        // Get total count for pagination
        const total = await Order.countDocuments(query);
        
        return {
            orders,
            total,
            page: parseInt(page),
            limit: parseInt(limit),
            totalPages: Math.ceil(total / limit)
        };
    },

    updateStatus(orderId, status) {
        return Order.findByIdAndUpdate(orderId, { status }, { new: true });
    },

    // 🔹 update generic theo id
    updateById(orderId, update) {
        return Order.findByIdAndUpdate(orderId, update, { new: true });
    },

  // 🔹 update riêng paymentStatus (hoặc kèm status)
  updatePaymentStatus(orderId, paymentStatus) {
    const update =
      typeof paymentStatus === "string"
        ? { paymentStatus }
        : paymentStatus;

    return Order.findByIdAndUpdate(
      orderId,
      update,
      { new: true }
    );
  },

  // 🔹 Tìm orders theo discount code ID
  findByDiscountCode(discountCodeId) {
    return Order.find({ discountCodeId })
      .populate('userId', 'fullName email')
      .sort({ createdAt: -1 })
      .lean();
  },
};
