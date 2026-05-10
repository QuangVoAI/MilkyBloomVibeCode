const commentRepo = require('../repositories/comment.repository');
const Comment = require('../models/comment.model');
const AIService = require('./ai-moderation.service');
const { getIO } = require('../socket');
const { storeImages } = require('../utils/image-storage');

/**
 * Create a new comment
 * Can be from logged-in user or guest
 * Supports image uploads (up to 3 images)
 */
const createComment = async ({
    productId,
    userId = null,
    guestName = 'Anonymous',
    guestEmail = null,
    content,
    parentId = null,
    imgFiles = [],
}) => {
    if (!productId || !content) {
        throw new Error('Product ID and content are required');
    }

    // Upload images if any
    let imageUrls = [];
    if (imgFiles && imgFiles.length > 0) {
        const maxImages = 3;
        const filesToUpload = imgFiles.slice(0, maxImages);
        imageUrls = await storeImages(filesToUpload, 'comments');
    }

    // AI moderation
    const aiResult = await AIService.analyzeReviewContent(content);

    let initialStatus = 'approved';
    if (!aiResult.isSafe || aiResult.toxicScore > 0.5) {
        initialStatus = 'flagged';
    }

    const commentData = {
        productId,
        userId,
        guestName: userId ? null : guestName,
        guestEmail: userId ? null : guestEmail,
        content,
        imageUrls,
        parentId,
        status: initialStatus,
        aiAnalysis: {
            isSafe: aiResult.isSafe,
            toxicScore: aiResult.toxicScore,
            flaggedCategories: aiResult.flaggedCategories,
            processedAt: new Date(),
        },
    };

    const newComment = await commentRepo.createComment(commentData);

    // Update parent's reply count if this is a reply
    if (parentId) {
        await Comment.findByIdAndUpdate(parentId, { $inc: { replyCount: 1 } });
    }

    // Emit WebSocket event for real-time updates
    try {
        const io = getIO();
        io.to(`product_${productId}`).emit('new_comment', {
            comment: newComment,
            productId,
        });
    } catch (err) {
        console.error('WebSocket emit failed:', err.message);
    }

    return newComment;
};

/**
 * Get comments for a product
 * Shows flagged comments only to their author
 */
const getCommentsByProductId = async ({
    productId,
    page = 1,
    limit = 20,
    parentId = null,
    currentUserId = null,
}) => {
    return await commentRepo.getCommentsByProductId({
        productId,
        page,
        limit,
        parentId,
        currentUserId,
    });
};

/**
 * Get replies for a comment
 */
const getReplies = async (parentId, page = 1, limit = 10) => {
    return await commentRepo.getReplies(parentId, page, limit);
};

/**
 * Delete a comment (user's own or admin)
 */
const deleteComment = async ({ commentId, userId, isAdmin }) => {
    const comment = await commentRepo.getCommentById(commentId);
    if (!comment) {
        throw new Error('Comment not found');
    }

    // Check permission
    if (!isAdmin && comment.userId?.toString() !== userId?.toString()) {
        throw new Error('Permission denied');
    }

    const productId = comment.productId;

    // Update parent's reply count if this is a reply
    if (comment.parentId) {
        await Comment.findByIdAndUpdate(comment.parentId, { $inc: { replyCount: -1 } });
    }

    await commentRepo.deleteCommentById(commentId);

    // Emit WebSocket event
    try {
        const io = getIO();
        io.to(`product_${productId}`).emit('comment_deleted', {
            commentId,
            productId,
        });
    } catch (err) {
        console.error('WebSocket emit failed:', err.message);
    }

    return true;
};

/**
 * Toggle like on a comment (requires login)
 */
const toggleCommentLike = async ({ commentId, userId }) => {
    if (!userId) {
        throw new Error('Login required to like comments');
    }

    const comment = await commentRepo.getCommentById(commentId);
    if (!comment) {
        throw new Error('Comment not found');
    }

    const hasLiked = comment.likedBy.some(
        id => id && id.toString() === userId.toString()
    );

    if (hasLiked) {
        comment.likedBy = comment.likedBy.filter(
            id => id && id.toString() !== userId.toString()
        );
        comment.likesCount = Math.max(0, (comment.likesCount || 0) - 1);
    } else {
        comment.likedBy.push(userId);
        comment.likesCount = (comment.likesCount || 0) + 1;
    }

    await comment.save();

    return {
        likesCount: comment.likesCount,
        isLiked: !hasLiked,
    };
};

/**
 * Get all comments for admin management
 */
const getAllCommentsAdmin = async ({ status, search, page = 1, limit = 50, sort = 'createdAt:desc' }) => {
    const query = { parentId: null }; // Only top-level comments
    
    if (status) {
        query.status = status;
    }
    
    const [sortField, sortOrder] = sort.split(':');
    const sortObj = { [sortField]: sortOrder === 'asc' ? 1 : -1 };
    
    const skip = (page - 1) * limit;
    
    let comments;
    
    // If search is provided, we need to do a more complex query with populated fields
    if (search && search.trim()) {
        const escapedSearch = search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const searchRegex = new RegExp(escapedSearch, 'i');
        
        // First get all top-level comments with populated fields
        const allComments = await Comment.find(query)
            .populate('userId', 'fullName username email avatar')
            .populate('productId', 'name images slug')
            .lean();
        
        // Filter in-memory to search populated fields
        const filtered = allComments.filter(comment => {
            return searchRegex.test(comment.content) ||
                   searchRegex.test(comment.guestName || '') ||
                   searchRegex.test(comment.guestEmail || '') ||
                   searchRegex.test(comment.userId?.fullName || '') ||
                   searchRegex.test(comment.userId?.username || '') ||
                   searchRegex.test(comment.userId?.email || '') ||
                   searchRegex.test(comment.productId?.name || '');
        });
        
        // Apply sorting and pagination to filtered results
        const sorted = filtered.sort((a, b) => {
            const aVal = a[sortField];
            const bVal = b[sortField];
            if (sortOrder === 'asc') {
                return aVal > bVal ? 1 : -1;
            }
            return aVal < bVal ? 1 : -1;
        });
        
        comments = sorted.slice(skip, skip + limit);
        const total = filtered.length;
        
        return {
            comments,
            pagination: {
                total,
                page,
                limit,
                pages: Math.ceil(total / limit),
            },
        };
    }
    
    // No search - use efficient database query
    comments = await Comment.find(query)
        .populate('userId', 'fullName username email avatar')
        .populate('productId', 'name images slug')
        .sort(sortObj)
        .skip(skip)
        .limit(limit)
        .lean();
    
    const total = await Comment.countDocuments(query);
    
    return {
        comments,
        pagination: {
            total,
            page,
            limit,
            pages: Math.ceil(total / limit),
        },
    };
};

/**
 * Moderate a comment (change status)
 */
const moderateComment = async ({ commentId, status, reason }) => {
    const comment = await Comment.findById(commentId);
    if (!comment) {
        throw new Error('Comment not found');
    }
    
    comment.status = status;
    if (reason) {
        comment.moderationReason = reason;
    }
    comment.moderatedAt = new Date();
    
    await comment.save();
    
    return comment;
};

module.exports = {
    createComment,
    getCommentsByProductId,
    getReplies,
    deleteComment,
    toggleCommentLike,
    getAllCommentsAdmin,
    moderateComment,
};
