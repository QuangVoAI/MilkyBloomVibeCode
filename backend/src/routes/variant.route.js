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
const auth = require('../middlewares/auth.middleware');
const adminOnly = require('../middlewares/admin.middleware');

// CRUD cơ bản
router.get('/:id', getVariantById);

router.use(auth, adminOnly);

router.post('/images/upload', uploadVariantImages, uploadVariantImagesToMongo);
router.post('/:productId', uploadVariantImages, createVariant);
router.patch('/:id', updateVariant);
router.delete('/:id', deleteVariant);

// Quản lý ảnh variant
router.post('/:id/images', uploadVariantImages, addVariantImages);
router.delete('/:id/images', removeVariantImages);

module.exports = router;
