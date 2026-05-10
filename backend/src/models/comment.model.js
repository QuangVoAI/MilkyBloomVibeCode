const mongoose = require('mongoose');

/**
 * Comment Model
 * - Comments can be left by anyone (guests or logged-in users)
 * - No rating, no purchase required
 * - Linked to products
 */
const CommentSchema = new mongoose.Schema(
    {
        productId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Product',
            required: true,
            index: true,
        },

        // Optional - null for guest comments
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            default: null,
            index: true,
        },

        // For guest comments
        guestName: {
            type: String,
            trim: true,
            maxlength: 50,
            default: 'Anonymous',
        },

        guestEmail: {
            type: String,
            trim: true,
            lowercase: true,
            maxlength: 100,
        },

        content: {
            type: String,
            required: true,
            trim: true,
            maxlength: 1000,
        },

        // Image URLs stored in Mongo as GridFS stream URLs or normal URLs
        imageUrls: {
            type: [String],
            default: [],
            validate: {
                validator: function (v) {
                    return v.length <= 3;
                },
                message: 'Maximum 3 images allowed per comment',
            },
        },

        // Parent comment for replies
        parentId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Comment',
            default: null,
        },

        status: {
            type: String,
            enum: ['pending', 'approved', 'rejected', 'flagged'],
            default: 'approved', // Auto-approve by default for comments
            index: true,
        },

        aiAnalysis: {
            isSafe: { type: Boolean, default: null },
            toxicScore: { type: Number, default: 0 },
            flaggedCategories: [String],
            processedAt: Date,
        },

        // Likes tracking
        likedBy: {
            type: [mongoose.Schema.Types.ObjectId],
            ref: 'User',
            default: [],
        },

        likesCount: {
            type: Number,
            default: 0,
            min: 0,
        },

        // Reply count (denormalized for performance)
        replyCount: {
            type: Number,
            default: 0,
            min: 0,
        },
    },
    {
        timestamps: true,
        collection: 'comments',
    }
);

// Index for efficient queries
CommentSchema.index({ productId: 1, createdAt: -1 });
CommentSchema.index({ parentId: 1 });

const Comment = mongoose.model('Comment', CommentSchema);

module.exports = Comment;
