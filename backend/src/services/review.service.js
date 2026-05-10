const reviewRepo = require('../repositories/review.repository.js');
const OrderItem = require('../models/order-item.model.js');
const Variant = require('../models/variant.model.js');
const Review = require('../models/review.model.js');
const Order = require('../models/order.model.js');
const Product = require('../models/product.model.js');
const AIService = require('./ai-moderation.service.js');
const { Types } = require('mongoose');
const { getIO } = require('../socket');

// Import image storage helper
const { storeImages, removeImages } = require('../utils/image-storage.js');

// --- Internal Utility Function ---
const _generateVariantName = (attributes) => {
    if (!attributes || attributes.length === 0) return 'Original';
    return attributes.map((attr) => `${attr.name}: ${attr.value}`).join(', ');
};

// --- Main Service Functions ---

/**
 * Check if user can review a product
 * Any authenticated user can review a product once (no purchase required)
 */
const checkReviewEligibility = async (userId, productId) => {
    if (!userId || !productId) {
        throw new Error("Missing required fields");
    }
    if (!Types.ObjectId.isValid(userId) || !Types.ObjectId.isValid(productId)) {
        throw new Error("Invalid ID format");
    }

    // Check if user has already reviewed this product
    const existingReview = await Review.findOne({
        userId: new Types.ObjectId(userId),
        productId: new Types.ObjectId(productId),
    });

    if (existingReview) {
        return { 
            canReview: false, 
            hasReviewed: true,
            message: "You have already reviewed this product" 
        };
    }

    return {
        canReview: true,
        hasReviewed: false,
        message: "You can write a review for this product"
    };
};

const createReview = async ({
    userId,
    productId,
    rating,
}) => {
    // validate input basic
    if (!userId || !productId) {
        throw new Error("Missing required fields");
    }
    if (!rating || rating < 1 || rating > 5) {
        throw new Error("Rating must be between 1 and 5");
    }
    if (
        !Types.ObjectId.isValid(userId) ||
        !Types.ObjectId.isValid(productId)
    ) {
        throw new Error("Invalid ID format");
    }

    // 1. Check if product exists
    const product = await Product.findById(productId);
    if (!product) {
        throw new Error("Product not found");
    }

    // 2. Check if user has already reviewed this product
    const existingReview = await Review.findOne({ 
        userId: new Types.ObjectId(userId),
        productId: new Types.ObjectId(productId)
    });
    if (existingReview) {
        throw new Error("You have already reviewed this product");
    }

    // 3. Reviews are now just star ratings - auto approve
    let initialStatus = "approved";

    // 4. Create Review (simple star rating only)
    const newReview = await reviewRepo.createReview({
        userId,
        productId,
        rating,
        status: initialStatus,
    });

    // 5. Recalculate Average Rating
    await Review.calcAverageRatings(productId);

    // 6. Emit WebSocket event for real-time updates
    try {
        const io = getIO();
        io.to(`product_${productId}`).emit('new_review', {
            review: newReview,
            productId,
        });
    } catch (err) {
        console.error('WebSocket emit failed:', err.message);
    }

    return newReview;
};

const getReviewsByProductId = async ({
    productId,
    page,
    limit,
    sort,
    filterRating,
    currentUserId = null,
}) => {
    return await reviewRepo.getReviewsByProductId({
        productId,
        page,
        limit,
        sort,
        filterRating,
        currentUserId,
    });
};

const updateReview = async ({
    userId,
    reviewId,
    rating,
    comment,
    imgFiles,
    deletedImages,
}) => {
    const review = await reviewRepo.findReviewById(reviewId);
    if (!review) throw new Error('Review not found');

    // Check ownership
    if (review.userId.toString() !== userId)
        throw new Error('Permission denied to modify this review');

    // --- [MỚI] BỔ SUNG AI CHECK KHI UPDATE ---
    // Dù chỉ sửa rating hay sửa comment, ta cũng nên quét lại comment (vì comment được gửi lên lại)
    const aiResult = await AIService.analyzeReviewContent(comment);

    let newStatus = "pending";
    if (aiResult.autoApprove) {
        newStatus = "approved"; // Nếu AI thấy ổn thì cho hiện
    } else {
        newStatus = 'flagged'; // Nếu sửa thành nội dung xấu -> Chặn lại chờ Admin
    }
    // -----------------------------------------

    // --- LOGIC XỬ LÝ ẢNH UPDATE ---

    // 1. Chuẩn hóa danh sách ảnh muốn xóa
    let imagesToDelete = [];
    if (deletedImages) {
        imagesToDelete = Array.isArray(deletedImages)
            ? deletedImages
            : [deletedImages];
    }

    // 2. Tính toán số lượng ảnh sẽ còn lại
    const currentImagesKept = review.imageUrls.filter(
        (url) => !imagesToDelete.includes(url),
    );
    const newImageCount = imgFiles ? imgFiles.length : 0;
    const totalImages = currentImagesKept.length + newImageCount;

    // 3. Validate giới hạn 5 ảnh
    if (totalImages > 5) {
        throw new Error(
            `You can only have a maximum of 5 images. Current kept: ${currentImagesKept.length}, New: ${newImageCount}`,
        );
    }

    // 4. Xóa ảnh cũ nếu có
    if (imagesToDelete.length > 0) {
        await removeImages(imagesToDelete);
    }

    // 5. Upload ảnh mới
    let newUploadedUrls = [];
    if (imgFiles && imgFiles.length > 0) {
        newUploadedUrls = await storeImages(imgFiles, 'reviewImages');
    }

    // 6. Gộp ảnh
    const finalImageUrls = [...currentImagesKept, ...newUploadedUrls];

    // --- CẬP NHẬT DB ---
    const updated = await reviewRepo.updateReviewById(reviewId, {
        rating,
        comment,
        imageUrls: finalImageUrls,

        // [MỚI] Cập nhật trạng thái và kết quả AI
        status: newStatus,
        aiAnalysis: {
            isSafe: aiResult.isSafe,
            toxicScore: aiResult.toxicScore,
            flaggedCategories: aiResult.flaggedCategories,
            processedAt: new Date(),
        },
    });

    await Review.calcAverageRatings(review.productId);

    return updated;
};

const deleteReview = async ({ userId, reviewId, isAdmin }) => {
    const review = await reviewRepo.findReviewById(reviewId);
    if (!review) throw new Error('Review not found');

    // Check perms - admin can delete any review, users can only delete their own
    if (!isAdmin && review.userId.toString() !== userId.toString())
        throw new Error('Permission denied to delete this review');

    const productId = review.productId;

    // 1. Xóa ảnh trước (nếu có)
    if (review.imageUrls && review.imageUrls.length > 0) {
        await removeImages(review.imageUrls);
    }

    // 2. Xóa trong DB
    await reviewRepo.deleteReviewById(reviewId);

    // 3. Tính lại rating
    await Review.calcAverageRatings(productId);

    // 4. Emit WebSocket event
    try {
        const io = getIO();
        io.to(`product_${productId}`).emit('review_deleted', {
            reviewId,
            productId,
        });
    } catch (err) {
        console.error('WebSocket emit failed:', err.message);
    }

    return true;
};

const moderateReview = async ({ reviewId, adminId, status, reason }) => {
    const validStatus = ['approved', 'rejected'];
    if (!validStatus.includes(status))
        throw new Error("Invalid status. Use 'approved' or 'rejected'");

    const review = await reviewRepo.findReviewById(reviewId);
    if (!review) throw new Error('Review not found');

    // Update review
    const updatedReview = await reviewRepo.updateReviewById(reviewId, {
        status: status,
        moderatedBy: adminId,
        moderatedAt: new Date(),
        rejectionReason: reason || '',
    });

    // Luôn tính toán lại rating sau khi admin can thiệp
    // (Nếu reject thì trừ điểm ra, approve thì cộng điểm vào)
    await Review.calcAverageRatings(review.productId);

    return updatedReview;
};

/**
 * Lấy danh sách sản phẩm cần đánh giá của User
 */
const getProductsToReview = async (userId) => {
    // 1. Lấy danh sách ProductId mà user ĐÃ đánh giá
    const reviewedProductIds = await reviewRepo.getReviewedProductIdsByUser(userId);

    // 2. Tìm tất cả các đơn hàng đã giao thành công của user
    const deliveredOrders = await Order.find({
        userId: userId,
        status: 'delivered'
    }).select('_id createdAt'); // Lấy thêm ngày mua để hiển thị nếu cần

    if (!deliveredOrders.length) return [];

    const deliveredOrderIds = deliveredOrders.map(o => o._id);

    // 3. Lấy chi tiết sản phẩm trong các đơn hàng đó
    // Populate để lấy tên, ảnh sản phẩm hiển thị ra Frontend
    const purchasedItems = await OrderItem.find({
        orderId: { $in: deliveredOrderIds }
    })
        .populate({
            path: "productId",
            select: "name imageUrls slug" // Chỉ lấy thông tin cần thiết hiển thị
        })
        .populate({
            path: "variantId",
            select: "attributes" // Lấy màu sắc/size
        })
        .sort({ createdAt: -1 }) // Mới mua xếp lên đầu
        .lean();

    // 4. Lọc: Chỉ giữ lại món nào CHƯA có trong danh sách đã review
    // Logic: Nếu productId của item KHÔNG nằm trong mảng reviewedProductIds -> Giữ lại

    const pendingReviews = [];
    const seenProducts = new Set(); // Dùng để tránh duplicate (VD: mua 1 món 2 lần thì chỉ hiện 1 lần nhắc review)

    for (const item of purchasedItems) {
        if (!item.productId) continue; // Phòng trường hợp sản phẩm bị xóa

        const prodIdStr = item.productId._id.toString();

        // Nếu chưa review VÀ chưa được thêm vào list pending lần này
        if (!reviewedProductIds.includes(prodIdStr) && !seenProducts.has(prodIdStr)) {

            seenProducts.add(prodIdStr); // Đánh dấu đã xử lý sản phẩm này

            // Format dữ liệu trả về cho Frontend đẹp đẽ
            pendingReviews.push({
                orderId: item.orderId,
                productId: item.productId._id,
                productName: item.productId.name,
                productImage: item.productId.imageUrls?.[0] || "", // Lấy ảnh đầu tiên
                productSlug: item.productId.slug,
                variantId: item.variantId?._id,
                variantName: _generateVariantName(item.variantId?.attributes), // Hàm cũ của bạn
                purchasedAt: deliveredOrders.find(o => o._id.equals(item.orderId))?.createdAt
            });
        }
    }

    return pendingReviews;
};

/**
 * Get review statistics for a product
 * Uses aggregation pipeline for efficient calculation
 */
const getReviewStats = async (productId) => {
    if (!productId) {
        throw new Error('Product ID is required');
    }
    return await reviewRepo.getReviewStats(productId);
};

module.exports = {
    createReview,
    getReviewsByProductId,
    updateReview,
    deleteReview,
    moderateReview,
    getProductsToReview,
    checkReviewEligibility,
    getReviewStats,
};
