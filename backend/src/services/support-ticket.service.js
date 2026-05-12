const crypto = require('crypto');
const supportTicketRepository = require('../repositories/support-ticket.repository');
const userRepository = require('../repositories/user.repository');

const SUPPORT_TICKET_DEFAULT_CATEGORY = 'other';

const normalizeText = (value) => String(value || '').trim();

const generateTicketNumber = () => {
    return `ST${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
};

const buildActivity = (activity = {}) => ({
    type: activity.type || 'comment',
    visibility: activity.visibility || 'internal',
    message: normalizeText(activity.message),
    authorId: activity.authorId || null,
    authorName: normalizeText(activity.authorName),
    previousStatus: normalizeText(activity.previousStatus),
    nextStatus: normalizeText(activity.nextStatus),
    createdAt: activity.createdAt || new Date(),
});

const inferCategory = (payload = {}) => {
    const text = `${payload.subject || ''} ${payload.description || ''} ${payload.sourceMessage || ''}`.toLowerCase();
    if (/(checkout|thanh toán|đặt hàng|mua hàng|giỏ hàng)/.test(text)) return 'checkout';
    if (/(tồn kho|stock|còn hàng|hết hàng|size|màu)/.test(text)) return 'catalog';
    if (/(ship|giao hàng|vận chuyển|tracking|theo dõi đơn)/.test(text)) return 'shipping';
    if (/(hoàn tiền|refund|tiền về)/.test(text)) return 'refund';
    if (/(đổi trả|return|trả hàng|đổi hàng)/.test(text)) return 'return';
    if (/(tài khoản|đăng nhập|otp|mật khẩu)/.test(text)) return 'account';
    if (/(sản phẩm|item|mặt hàng|hàng lỗi)/.test(text)) return 'product';
    if (/(khiếu nại|phàn nàn|complaint|bức xúc|tức giận)/.test(text)) return 'complaint';
    return SUPPORT_TICKET_DEFAULT_CATEGORY;
};

const createSupportTicket = async (payload = {}) => {
    const subject = normalizeText(payload.subject) || 'Yêu cầu hỗ trợ từ chatbot';
    const description = normalizeText(payload.description) || normalizeText(payload.sourceMessage);
    if (!description) {
        const err = new Error('Ticket description is required');
        err.status = 400;
        throw err;
    }

    let user = null;
    if (payload.userId) {
        user = await userRepository.findById(payload.userId);
    }

    const contactName = normalizeText(payload.contactName || user?.fullName || '');
    const contactEmail = normalizeText(payload.contactEmail || user?.email || '').toLowerCase();
    const contactPhone = normalizeText(payload.contactPhone || user?.phone || '');
    const category = payload.category || inferCategory(payload);
    const ticketNumber = payload.ticketNumber || generateTicketNumber();

    const ticket = await supportTicketRepository.create({
        ticketNumber,
        userId: payload.userId || user?._id || null,
        orderId: payload.orderId || null,
        category,
        subject,
        description,
        channel: payload.channel || 'chat',
        priority: payload.priority || 'normal',
        contactName,
        contactEmail,
        contactPhone,
        sourceMessage: payload.sourceMessage || description,
        metadata: payload.metadata || {},
        lastMessageAt: new Date(),
        activities: [
            buildActivity({
                type: 'created',
                visibility: 'internal',
                message: payload.sourceMessage || description,
                authorId: payload.userId || user?._id || null,
                authorName: contactName || user?.fullName || 'System',
            }),
        ],
    });

    return ticket;
};

const getMyTickets = async (userId) => {
    return await supportTicketRepository.findByUserId(userId);
};

const getTicketById = async (ticketId) => {
    return await supportTicketRepository.findById(ticketId);
};

const listTickets = async (filters = {}, options = {}) => {
    const page = Number(options.page || 1);
    const limit = Number(options.limit || 20);
    const sortBy = String(options.sortBy || 'newest');
    const skip = (page - 1) * limit;

    let sort = { createdAt: -1 };
    if (sortBy === 'oldest') sort = { createdAt: 1 };
    else if (sortBy === 'priority-high') sort = { priority: -1, createdAt: -1 };
    else if (sortBy === 'priority-low') sort = { priority: 1, createdAt: -1 };

    const { tickets, total } = await supportTicketRepository.findAll(filters, {
        skip,
        limit,
        sort,
    });

    return {
        tickets,
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
    };
};

const updateTicket = async (ticketId, payload = {}) => {
    const currentTicket = await supportTicketRepository.findById(ticketId);
    if (!currentTicket) {
        return null;
    }

    const update = {};
    const activities = [];
    const allowed = [
        'status',
        'priority',
        'assignedTo',
        'internalNote',
        'resolutionNote',
        'category',
        'subject',
        'description',
    ];

    allowed.forEach((key) => {
        if (Object.prototype.hasOwnProperty.call(payload, key)) {
            update[key] = payload[key];
        }
    });

    if (Object.prototype.hasOwnProperty.call(payload, 'status')) {
        activities.push(buildActivity({
            type: 'status_changed',
            visibility: 'internal',
            message: `Status changed to ${payload.status}`,
            previousStatus: currentTicket.status || '',
            nextStatus: payload.status,
        }));
    }

    if (Object.prototype.hasOwnProperty.call(payload, 'assignedTo')) {
        activities.push(buildActivity({
            type: 'assigned',
            visibility: 'internal',
            message: payload.assignedTo ? 'Ticket assigned to an agent' : 'Ticket unassigned',
        }));
    }

    if (Object.prototype.hasOwnProperty.call(payload, 'internalNote') && normalizeText(payload.internalNote)) {
        activities.push(buildActivity({
            type: 'internal_note',
            visibility: 'internal',
            message: payload.internalNote,
        }));
    }

    if (Object.prototype.hasOwnProperty.call(payload, 'resolutionNote') && normalizeText(payload.resolutionNote)) {
        activities.push(buildActivity({
            type: 'resolution_note',
            visibility: 'internal',
            message: payload.resolutionNote,
        }));
    }

    if (Object.prototype.hasOwnProperty.call(update, 'status')) {
        if (update.status === 'closed') {
            update.resolvedAt = new Date();
        } else {
            update.resolvedAt = null;
        }
    }

    if (activities.length > 0) {
        update.$push = { activities: { $each: activities } };
        update.lastMessageAt = new Date();
    }

    return await supportTicketRepository.updateById(ticketId, update);
};

const addTicketComment = async (ticketId, payload = {}) => {
    const ticket = await supportTicketRepository.findById(ticketId);
    if (!ticket) {
        return null;
    }

    const message = normalizeText(payload.message);
    if (!message) {
        const err = new Error('Comment message is required');
        err.status = 400;
        throw err;
    }

    const visibility = payload.visibility === 'public' ? 'public' : 'internal';
    const authorId = payload.authorId || null;
    const authorName = normalizeText(payload.authorName || payload.author || '');
    const activity = buildActivity({
        type: 'comment',
        visibility,
        message,
        authorId,
        authorName,
    });

    return await supportTicketRepository.updateById(ticketId, {
        $push: { activities: activity },
        lastMessageAt: new Date(),
    });
};

const getTicketThread = async (ticketId) => {
    const ticket = await supportTicketRepository.findById(ticketId);
    if (!ticket) return null;
    const activities = Array.isArray(ticket.activities) ? ticket.activities : [];
    return activities
        .slice()
        .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
};

const getTicketStats = async (filters = {}) => {
    const baseFilter = { ...filters };
    delete baseFilter.$or;

    const [total, open, pending, closed] = await Promise.all([
        supportTicketRepository.countDocuments(baseFilter),
        supportTicketRepository.countDocuments({ ...baseFilter, status: 'open' }),
        supportTicketRepository.countDocuments({ ...baseFilter, status: 'pending' }),
        supportTicketRepository.countDocuments({ ...baseFilter, status: 'closed' }),
    ]);

    return {
        total,
        open,
        pending,
        closed,
    };
};

const getAssigneeStats = async (filters = {}) => {
    const pipeline = [{ $match: { ...filters } }];
    pipeline.push({
        $group: {
            _id: { $ifNull: ['$assignedTo', 'unassigned'] },
            count: { $sum: 1 },
        },
    });
    pipeline.push({
        $lookup: {
            from: 'users',
            localField: '_id',
            foreignField: '_id',
            as: 'assignee',
        },
    });
    pipeline.push({
        $unwind: {
            path: '$assignee',
            preserveNullAndEmptyArrays: true,
        },
    });
    pipeline.push({
        $project: {
            _id: 0,
            assigneeId: '$_id',
            count: 1,
            fullName: { $ifNull: ['$assignee.fullName', 'Unassigned'] },
            email: { $ifNull: ['$assignee.email', ''] },
        },
    });
    pipeline.push({ $sort: { count: -1, fullName: 1 } });

    const rows = await supportTicketRepository.aggregate(pipeline);
    return rows.map((row) => ({
        assigneeId: row.assigneeId === 'unassigned' ? null : String(row.assigneeId),
        count: row.count,
        fullName: row.fullName,
        email: row.email,
    }));
};

module.exports = {
    createSupportTicket,
    getMyTickets,
    getTicketById,
    inferCategory,
    listTickets,
    updateTicket,
    addTicketComment,
    getTicketThread,
    getTicketStats,
    getAssigneeStats,
};
