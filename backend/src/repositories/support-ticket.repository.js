const SupportTicket = require('../models/support-ticket.model');

const create = async (data) => {
    return await SupportTicket.create(data);
};

const findById = async (id) => {
    return await SupportTicket.findById(id)
        .populate('userId', 'fullName email phone username')
        .populate('orderId', '_id status paymentStatus totalAmount')
        .populate('assignedTo', 'fullName email phone username')
        .lean();
};

const findByTicketNumber = async (ticketNumber) => {
    return await SupportTicket.findOne({ ticketNumber })
        .populate('userId', 'fullName email phone username')
        .populate('orderId', '_id status paymentStatus totalAmount')
        .populate('assignedTo', 'fullName email phone username')
        .lean();
};

const findByUserId = async (userId) => {
    return await SupportTicket.find({ userId })
        .sort({ createdAt: -1 })
        .populate('orderId', '_id status paymentStatus totalAmount')
        .populate('assignedTo', 'fullName email phone username')
        .lean();
};

const findAll = async (filter = {}, options = {}) => {
    const { skip = 0, limit = 20, sort = { createdAt: -1 } } = options;
    const [tickets, total] = await Promise.all([
        SupportTicket.find(filter)
            .sort(sort)
            .skip(skip)
            .limit(limit)
            .populate('userId', 'fullName email phone username')
            .populate('orderId', '_id status paymentStatus totalAmount')
            .populate('assignedTo', 'fullName email phone username')
            .lean(),
        SupportTicket.countDocuments(filter),
    ]);
    return { tickets, total };
};

const updateById = async (id, update = {}) => {
    return await SupportTicket.findByIdAndUpdate(id, update, { new: true });
};

const countDocuments = async (filter = {}) => {
    return await SupportTicket.countDocuments(filter);
};

const aggregate = async (pipeline = []) => {
    return await SupportTicket.aggregate(pipeline);
};

module.exports = {
    create,
    findById,
    findByTicketNumber,
    findByUserId,
    findAll,
    updateById,
    countDocuments,
    aggregate,
};
