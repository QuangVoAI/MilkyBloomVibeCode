const express = require('express');
const router = express.Router();
const {
    getVariantById,
    createVariant,
    updateVariant,
    deleteVariant,
    addVariantImages,
    removeVariantImages,
    uploadVariantImagesToMongo,
} = require('../controllers/variant.controller');
const { uploadVariantImages } = require('../middlewares/upload.middleware');

// Upload variant images vào Mongo mà không cần truyền variant ID
router.post('/images/upload', uploadVariantImages, uploadVariantImagesToMongo);

// CRUD cơ bản
router.get('/:id', getVariantById);
router.post('/:productId', uploadVariantImages, createVariant);
router.patch('/:id', updateVariant);
router.delete('/:id', deleteVariant);

// Quản lý ảnh variant
router.post('/:id/images', uploadVariantImages, addVariantImages);
router.delete('/:id/images', removeVariantImages);

module.exports = router;
