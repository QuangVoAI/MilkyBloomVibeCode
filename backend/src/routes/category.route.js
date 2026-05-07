const express = require('express');
const router = express.Router();
const {
    createCategory,
    getAllCategories,
    getCategoryById,
    getCategoryBySlug,
    updateCategory,
    deleteCategory,
} = require('../controllers/category.controller.js');

const { uploadCategoryImages } = require('../middlewares/upload.middleware.js');
const { strictApiLimiter } = require('../middlewares/rateLimit.middleware.js');

// Middleware to handle both JSON and multipart/form-data
const optionalUpload = (req, res, next) => {
    const contentType = req.headers['content-type'] || '';
    if (contentType.includes('multipart/form-data')) {
        return uploadCategoryImages(req, res, next);
    }
    next();
};

router.post('/', strictApiLimiter, uploadCategoryImages, createCategory);

router.get('/', getAllCategories);
router.get('/slug/:slug', getCategoryBySlug);
router.get('/:id', getCategoryById);

router.patch('/:id', strictApiLimiter, optionalUpload, updateCategory);

router.delete('/:id', strictApiLimiter, deleteCategory);

module.exports = router;
