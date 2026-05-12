const mongoose = require('mongoose');

const SUPPORT_TICKET_STATUS = ['open', 'pending', 'closed'];
const SUPPORT_TICKET_CATEGORY = [
    'checkout',
    'catalog',
    'shipping',
    'payment',
    'refund',
    'return',
    'account',
    'product',
    'complaint',
    'other',
];

const SupportTicketActivitySchema = new mongoose.Schema(
    {
        type: {
            type: String,
            enum: ['created', 'comment', 'status_changed', 'assigned', 'internal_note', 'resolution_note'],
            required: true,
        },
        visibility: {
            type: String,
            enum: ['public', 'internal'],
            default: 'internal',
        },
        message: {
            type: String,
            default: '',
            trim: true,
        },
        authorId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            default: null,
        },
        authorName: {
            type: String,
            default: '',
            trim: true,
        },
        previousStatus: {
            type: String,
            default: '',
            trim: true,
        },
        nextStatus: {
            type: String,
            default: '',
            trim: true,
        },
        createdAt: {
            type: Date,
            default: Date.now,
        },
    },
    { _id: false },
);

const SupportTicketSchema = new mongoose.Schema(
    {
        ticketNumber: {
            type: String,
            required: true,
            unique: true,
            index: true,
            trim: true,
        },
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            default: null,
            index: true,
        },
        orderId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Order',
            default: null,
            index: true,
        },
        category: {
            type: String,
            enum: SUPPORT_TICKET_CATEGORY,
            default: 'other',
            index: true,
        },
        subject: {
            type: String,
            required: true,
            trim: true,
        },
        description: {
            type: String,
            required: true,
            trim: true,
        },
        channel: {
            type: String,
            enum: ['chat', 'web', 'email', 'phone'],
            default: 'chat',
        },
        status: {
            type: String,
            enum: SUPPORT_TICKET_STATUS,
            default: 'open',
            index: true,
        },
        priority: {
            type: String,
            enum: ['low', 'normal', 'high', 'urgent'],
            default: 'normal',
            index: true,
        },
        contactName: {
            type: String,
            default: '',
            trim: true,
        },
        contactEmail: {
            type: String,
            default: '',
            trim: true,
            lowercase: true,
        },
        contactPhone: {
            type: String,
            default: '',
            trim: true,
        },
        sourceMessage: {
            type: String,
            default: '',
        },
        metadata: {
            type: mongoose.Schema.Types.Mixed,
            default: {},
        },
        assignedTo: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            default: null,
        },
        resolvedAt: {
            type: Date,
            default: null,
        },
        lastMessageAt: {
            type: Date,
            default: null,
        },
        internalNote: {
            type: String,
            default: '',
            trim: true,
        },
        resolutionNote: {
            type: String,
            default: '',
            trim: true,
        },
        activities: {
            type: [SupportTicketActivitySchema],
            default: [],
        },
    },
    {
        timestamps: true,
        collection: 'supporttickets',
    },
);

module.exports = mongoose.model('SupportTicket', SupportTicketSchema);
