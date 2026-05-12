const mongoose = require('mongoose');
const supportTicketService = require('../services/support-ticket.service');
const supportTicketRepository = require('../repositories/support-ticket.repository');

const createTicket = async (req, res, next) => {
    try {
        const payload = {
            ...req.body,
            userId: req.user?.id || req.user?._id || req.body.userId || null,
        };

        const ticket = await supportTicketService.createSupportTicket(payload);
        return res.status(201).json({
            success: true,
            data: ticket,
            ticketId: ticket._id,
            ticketNumber: ticket.ticketNumber,
        });
    } catch (err) {
        return next(err);
    }
};

const getMyTickets = async (req, res, next) => {
    try {
        const userId = req.user?.id || req.user?._id;
        if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
            return res.status(400).json({ success: false, message: 'Invalid user ID' });
        }
        const tickets = await supportTicketService.getMyTickets(userId);
        return res.json({ success: true, data: tickets });
    } catch (err) {
        return next(err);
    }
};

const getTicketById = async (req, res, next) => {
    try {
        const ticket = await supportTicketService.getTicketById(req.params.id);
        if (!ticket) {
            return res.status(404).json({ success: false, message: 'Ticket not found' });
        }

        const currentUserId = req.user?.id || req.user?._id;
        const ownerId = ticket.userId?._id?.toString() || ticket.userId?.toString();
        if (
            currentUserId &&
            ownerId &&
            ownerId !== currentUserId.toString() &&
            req.user?.role !== 'admin'
        ) {
            return res.status(403).json({
                success: false,
                message: 'You do not have permission to view this ticket',
            });
        }

        const isAdmin = req.user?.role === 'admin';
        const safeTicket = isAdmin
            ? ticket
            : {
                ...ticket,
                activities: Array.isArray(ticket.activities)
                    ? ticket.activities.filter((activity) => activity.visibility !== 'internal')
                    : [],
                internalNote: '',
                resolutionNote: '',
            };

        return res.json({ success: true, data: safeTicket });
    } catch (err) {
        return next(err);
    }
};

const adminListTickets = async (req, res, next) => {
    try {
        const {
            page = 1,
            limit = 20,
            status,
            category,
            priority,
            assignedTo,
            search,
            sortBy = 'newest',
        } = req.query;

        const filters = {};
        if (status && status !== 'all') filters.status = status;
        if (category && category !== 'all') filters.category = category;
        if (priority && priority !== 'all') filters.priority = priority;
        if (assignedTo && assignedTo !== 'all') {
            if (assignedTo === 'me') {
                filters.assignedTo = req.user?.id || req.user?._id || null;
            } else {
                filters.assignedTo = assignedTo;
            }
        }

        if (search && String(search).trim()) {
            const term = String(search).trim();
            const regex = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
            filters.$or = [
                { ticketNumber: regex },
                { subject: regex },
                { description: regex },
                { contactName: regex },
                { contactEmail: regex },
                { contactPhone: regex },
            ];
        }

        const result = await supportTicketService.listTickets(filters, {
            page,
            limit,
            sortBy,
        });

        return res.json({
            success: true,
            tickets: result.tickets,
            total: result.total,
            page: result.page,
            limit: result.limit,
            totalPages: result.totalPages,
        });
    } catch (err) {
        return next(err);
    }
};

const adminTicketStats = async (req, res, next) => {
    try {
        const { status, category, priority, assignedTo } = req.query;
        const filters = {};
        if (status && status !== 'all') filters.status = status;
        if (category && category !== 'all') filters.category = category;
        if (priority && priority !== 'all') filters.priority = priority;
        if (assignedTo && assignedTo !== 'all') filters.assignedTo = assignedTo;

        const stats = await supportTicketService.getTicketStats(filters);
        return res.json({
            success: true,
            data: stats,
        });
    } catch (err) {
        return next(err);
    }
};

const adminAssigneeStats = async (req, res, next) => {
    try {
        const { status, category, priority } = req.query;
        const filters = {};
        if (status && status !== 'all') filters.status = status;
        if (category && category !== 'all') filters.category = category;
        if (priority && priority !== 'all') filters.priority = priority;

        const stats = await supportTicketService.getAssigneeStats(filters);
        return res.json({
            success: true,
            data: stats,
        });
    } catch (err) {
        return next(err);
    }
};

const adminAddComment = async (req, res, next) => {
    try {
        const ticket = await supportTicketService.addTicketComment(req.params.id, {
            message: req.body.message,
            visibility: req.body.visibility,
            authorId: req.user?.id || req.user?._id || null,
            authorName: req.user?.fullName || req.user?.fullname || req.user?.name || '',
        });
        if (!ticket) {
            return res.status(404).json({ success: false, message: 'Ticket not found' });
        }
        return res.status(201).json({ success: true, data: ticket });
    } catch (err) {
        return next(err);
    }
};

const adminUpdateTicket = async (req, res, next) => {
    try {
        const ticket = await supportTicketService.updateTicket(req.params.id, req.body);
        if (!ticket) {
            return res.status(404).json({ success: false, message: 'Ticket not found' });
        }
        return res.json({ success: true, data: ticket });
    } catch (err) {
        return next(err);
    }
};

module.exports = {
    createTicket,
    getMyTickets,
    getTicketById,
    adminListTickets,
    adminTicketStats,
    adminAssigneeStats,
    adminAddComment,
    adminUpdateTicket,
};
