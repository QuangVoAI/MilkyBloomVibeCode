const ReviewService = require('../services/review.service');
const Review = require('../models/review.model');

const createReview = async (req, res, next) => {
    try {
        const userId = req.user._id || req.user.id;
        // Reviews are now just star ratings - no purchase required
        const { productId, rating } = req.body;

        if (!rating || rating < 1 || rating > 5) {
            return res
                .status(400)
                .json({ message: 'Rating must be between 1 and 5 stars' });
        }

        if (!productId) {
            return res
                .status(400)
                .json({ message: 'Product ID is required' });
        }

        const newReview = await ReviewService.createReview({
            userId,
            productId,
            rating,
        });

        return res.status(201).json({
            message: 'Product review created successfully!',
            metadata: newReview,
        });
    } catch (error) {
        next(error);
    }
};

const checkEligibility = async (req, res, next) => {
    try {
        const userId = req.user._id || req.user.id;
        const { productId } = req.params;

        const result = await ReviewService.checkReviewEligibility(userId, productId);

        return res.status(200).json({
            success: true,
            message: result.message,
            metadata: {
                canReview: result.canReview,
                hasReviewed: result.hasReviewed,
            },
        });
    } catch (error) {
        next(error);
    }
};

const updateReview = async (req, res, next) => {
    try {
        const userId = req.user._id;
        const { reviewId } = req.params;

        // Lấy data update
        const { rating, comment, deletedImages } = req.body;
        // Lấy ảnh mới muốn thêm vào
        const imgFiles = req.files;

        // Validate sơ bộ rating nếu có gửi lên
        if (rating && (rating < 1 || rating > 5)) {
            return res
                .status(400)
                .json({ message: 'Rating must be between 1 and 5 stars' });
        }

        const updatedReview = await ReviewService.updateReview({
            userId,
            reviewId,
            rating,
            comment,
            imgFiles, // Ảnh mới
            deletedImages, // Ảnh cũ muốn xóa (URL string hoặc mảng URL)
        });

        return res.status(200).json({
            message: 'Review updated successfully',
            metadata: updatedReview,
        });
    } catch (error) {
        next(error);
    }
};

const getReviewsByProductId = async (req, res, next) => {
    try {
        const { productId } = req.params;
        const { page, limit, sort, rating } = req.query;
        // Get user ID if authenticated (optional)
        const currentUserId = req.user?._id || req.user?.id || null;
        
        const result = await ReviewService.getReviewsByProductId({
            productId,
            page: parseInt(page) || 1,
            limit: parseInt(limit) || 5,
            sort,
            filterRating: rating ? parseInt(rating) : null,
            currentUserId,
        });
        return res.status(200).json({ message: 'Success', metadata: result });
    } catch (error) {
        next(error);
    }
};

const deleteReview = async (req, res, next) => {
    try {
        const userId = req.user._id || req.user.id;
        const { reviewId } = req.params;
        // Check for admin - user model uses 'role' (singular) not 'roles'
        const isAdmin = req.user.role === 'admin' || 
            (req.user.roles && req.user.roles.includes('admin'));

        await ReviewService.deleteReview({ userId, reviewId, isAdmin });

        return res
            .status(200)
            .json({ message: 'Deleted successfully', metadata: null });
    } catch (error) {
        next(error);
    }
};

const moderateReview = async (req, res, next) => {
    try {
        // Check quyền Admin (nếu middleware auth chưa check kỹ)
        // Giả sử req.user.roles chứa mảng roles
        if (!req.user.roles || !req.user.roles.includes('admin')) {
            return res
                .status(403)
                .json({ message: 'Access denied. Admin only.' });
        }

        const { reviewId } = req.params;
        const { status, reason } = req.body; // status: 'approved' | 'rejected'

        const result = await ReviewService.moderateReview({
            reviewId,
            adminId: req.user._id,
            status,
            reason,
            reason,
        });

        return res.status(200).json({
            message: `Review has been ${status}`,
            metadata: result,
        });
    } catch (error) {
        next(error);
    }
};

const getPendingReviews = async (req, res, next) => {
    try {
        const userId = req.user._id;
        const result = await ReviewService.getProductsToReview(userId);
        
        return res.status(200).json({
            success: true,
            message: "Lấy danh sách chờ đánh giá thành công",
            data: result
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @route   GET /api/reviews/admin/all
 * @desc    Get all reviews for admin management
 * @access  Admin only
 */
const getAllReviewsAdmin = async (req, res, next) => {
    try {
        const { status, rating, search, sort = 'createdAt:desc', page = 1, limit = 50 } = req.query;
        
        // Parse sort
        const [sortField, sortOrder] = sort.split(':');
        const sortObj = { [sortField]: sortOrder === 'asc' ? 1 : -1 };
        
        const skip = (parseInt(page) - 1) * parseInt(limit);
        
        let reviews;
        let total;
        
        // If search is provided, we need to search across populated fields
        if (search && search.trim()) {
            const escapedSearch = search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const searchRegex = new RegExp(escapedSearch, 'i');
            
            // Build base query
            const query = {};
            if (status && status !== 'all') {
                query.status = status;
            }
            if (rating && rating !== 'all') {
                query.rating = parseInt(rating);
            }
            
            // Get all reviews with populated fields
            const allReviews = await Review.find(query)
                .populate('userId', 'fullName username email avatar')
                .populate('productId', 'name images slug')
                .lean();
            
            // Filter in-memory to search populated fields
            const filtered = allReviews.filter(review => {
                return searchRegex.test(review.review || '') ||
                       searchRegex.test(review.userId?.fullName || '') ||
                       searchRegex.test(review.userId?.username || '') ||
                       searchRegex.test(review.userId?.email || '') ||
                       searchRegex.test(review.productId?.name || '');
            });
            
            // Apply sorting and pagination
            const sorted = filtered.sort((a, b) => {
                const aVal = a[sortField];
                const bVal = b[sortField];
                if (sortOrder === 'asc') {
                    return aVal > bVal ? 1 : -1;
                }
                return aVal < bVal ? 1 : -1;
            });
            
            reviews = sorted.slice(skip, skip + parseInt(limit));
            total = filtered.length;
        } else {
            // No search - use efficient database query
            const query = {};
            
            if (status && status !== 'all') {
                query.status = status;
            }
            
            if (rating && rating !== 'all') {
                query.rating = parseInt(rating);
            }
            
            reviews = await Review.find(query)
                .populate('userId', 'fullName username email avatar')
                .populate('productId', 'name images slug')
                .sort(sortObj)
                .skip(skip)
                .limit(parseInt(limit))
                .lean();
            
            total = await Review.countDocuments(query);
        }
        
        return res.status(200).json({
            message: 'Reviews fetched successfully',
            metadata: {
                reviews,
                pagination: {
                    total,
                    page: parseInt(page),
                    limit: parseInt(limit),
                    pages: Math.ceil(total / parseInt(limit))
                }
            }
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @route   POST /api/reviews/:reviewId/helpful
 * @desc    Toggle helpful status for a review
 * @access  Private
 */
const toggleHelpful = async (req, res, next) => {
    try {
        const { reviewId } = req.params;
        const userId = (req.user?._id || req.user?.id)?.toString();
        
        if (!userId) {
            return res.status(401).json({ message: 'User not authenticated' });
        }

        const review = await Review.findById(reviewId);
        if (!review) {
            return res.status(404).json({ message: 'Review not found' });
        }

        // Initialize helpfulUsers if it doesn't exist
        if (!review.helpfulUsers) {
            review.helpfulUsers = [];
        }

        // Check if user already marked as helpful (compare as strings, handle nulls)
        const hasLiked = review.helpfulUsers.some(
            id => id && id.toString() === userId
        );

        if (hasLiked) {
            // Unlike: remove user from helpfulUsers array
            review.helpfulUsers = review.helpfulUsers.filter(
                id => id && id.toString() !== userId
            );
            review.helpfulCount = Math.max(0, (review.helpfulCount || 0) - 1);
        } else {
            // Like: add user to helpfulUsers array
            review.helpfulUsers.push(userId);
            review.helpfulCount = (review.helpfulCount || 0) + 1;
        }

        await review.save();

        res.status(200).json({
            message: hasLiked ? 'Removed helpful mark' : 'Marked as helpful',
            helpfulCount: review.helpfulCount,
            isHelpful: !hasLiked,
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Get review statistics for a product
 * @route GET /api/reviews/stats/:productId
 */
const getReviewStats = async (req, res, next) => {
    try {
        const { productId } = req.params;
        const stats = await ReviewService.getReviewStats(productId);
        
        res.status(200).json({
            success: true,
            data: stats,
        });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    createReview,
    getReviewsByProductId,
    updateReview,
    deleteReview,
    moderateReview,
    getPendingReviews,
    checkEligibility,
    toggleHelpful,
    getAllReviewsAdmin,
    getReviewStats,
};
