const multer = require('multer');

// Lưu file vào RAM để upload lên S3
const storage = multer.memoryStorage();

// Các định dạng ảnh được cho phép
const allowedMimeTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const allowedVideoMimeTypes = new Set([
    'video/mp4',
    'video/webm',
    'video/quicktime',
]);

// Cấu hình Multer
const upload = multer({
    storage,
    limits: {
        fileSize: 100 * 1024 * 1024, // 100MB, dư cho avatar/product
    },
    fileFilter: (_req, file, cb) => {
        const ok = allowedMimeTypes.has(file.mimetype);
        if (!ok) {
            return cb(new Error('Only JPG, PNG, WebP images are allowed'));
        }
        cb(null, true);
    },
});

const videoUpload = multer({
    storage,
    limits: {
        fileSize: 250 * 1024 * 1024,
    },
    fileFilter: (_req, file, cb) => {
        const ok = allowedVideoMimeTypes.has(file.mimetype);
        if (!ok) {
            return cb(
                new Error('Only MP4, WebM, and MOV video files are allowed'),
            );
        }
        cb(null, true);
    },
});

// ============ Upload Types ============

// Upload avatar: field "avatar"
const uploadAvatar = upload.single('avatar');

// Upload images cho product (field name: 'productImages')
const uploadProductImages = upload.array('productImages', 10);

// Upload images cho variant
const uploadVariantImages = upload.array('variantImages', 10);

// Upload images cho review
const uploadReviewImages = upload.array('reviewImages', 5);
const uploadCategoryImages = upload.array('categoryImages', 1);

// Upload images cho comments
const uploadCommentImages = upload.array('commentImages', 3);
const uploadBannerVideoFile = videoUpload.single('video');

module.exports = {
    uploadAvatar,
    uploadBannerVideoFile,
    uploadProductImages,
    uploadVariantImages,
    uploadReviewImages,
    uploadCategoryImages,
    uploadCommentImages,
};
