const { mongo } = require('mongoose');
const productService = require('../services/product.service.js');
const Product = require('../models/product.model.js');
const atlasSearchService = require('../services/atlas.search.service.js');


/** Lấy danh sách sản phẩm */
const getAllProducts = async (req, res, next) => {
    try {
        if (req.query.keyword) {
            const result = await atlasSearchService.searchProducts(req.query, req.user);
            return res.json({ success: true, data: result });
        }
        const result = await productService.getAllProducts(req.query, req.user);
        return res.json({ success: true, data: result });
    } catch (err) {
        next(err);
    }
};

/** Lấy chi tiết sản phẩm theo ID */
const getProductById = async (req, res, next) => {
    try {
        const { id } = req.params;
        if (!mongo.ObjectId.isValid(id))
            return res
                .status(400)
                .json({ success: false, message: 'Invalid ID' });

        const product = await productService.getProductById(id);
        if (!product) {
            return res
                .status(404)
                .json({ success: false, message: 'Product not found' });
        }
        res.json({ success: true, data: product });
    } catch (err) {
        next(err);
    }
};

const getProductBySlug = async (req, res) => {
    try {
        const { slug } = req.params;
        const product = await productService.getProductBySlug(slug);
        if (!product) {
            return res
                .status(404)
                .json({ success: false, message: 'Product not found' });
        }
        return res.json({ success: true, data: product });
    } catch (error) {
        return next(error);
    }
};

const getProductByPrice = async (req, res, next) => {
    try {
        const { min, max } = req.query;
        const products = await productService.getProductByPrice(
            parseFloat(min),
            parseFloat(max),
        );
        return res.json({ success: true, data: products });
    } catch (error) {
        return next(error);
    }
};

const getProductByRating = async (req, res, next) => {
    try {
        const { minRating } = req.query;
        const products = await productService.getProductByRating(
            parseFloat(minRating),
        );
        return res.json({ success: true, data: products });
    } catch (error) {
        return next(error);
    }
};

/** Tạo sản phẩm mới */
const createProduct = async (req, res) => {
    try {
        const product = await productService.createProduct(req.body, req.files);
        res.status(201).json({ success: true, data: product });
    } catch (error) {
        console.error('Error creating product:', error.message);
        res.status(400).json({ success: false, message: error.message });
    }
};

/** Cập nhật thông tin sản phẩm */
const updateProduct = async (req, res, next) => {
    try {
        const { id } = req.params;

        if (!mongo.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid product ID',
            });
        }

        const updatedProduct = await productService.updateProduct(id, req.body);

        return res.status(200).json({
            success: true,
            data: updatedProduct,
        });
    } catch (error) {
        console.error('Error updating product:', error.message);
        next(error);
    }
};

/** Xóa sản phẩm (và ảnh liên quan) */
const deleteProduct = async (req, res, next) => {
    try {
        const { id } = req.params;
        const result = await productService.deleteProduct(id);
        res.json({ success: true, message: result.message });
    } catch (err) {
        next(err);
    }
};

/** Thêm ảnh vào product (lưu data URL trong Mongo) */
const addProductImages = async (req, res, next) => {
    try {
        const { id } = req.params;
        const files = req.files;
        if (!files?.length)
            return res.status(400).json({ message: 'No files uploaded' });

        const updated = await productService.addImagesToProduct(id, files);
        res.json({ success: true, data: updated });
    } catch (err) {
        next(err);
    }
};

/** Xóa ảnh sản phẩm */
const removeProductImages = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { removeImages } = req.body;
        if (!Array.isArray(removeImages) || !removeImages.length)
            return res.status(400).json({ message: 'No image URLs provided' });

        const updated = await productService.removeImagesFromProduct(
            id,
            removeImages,
        );
        res.json({ success: true, data: updated });
    } catch (err) {
        next(err);
    }
};

/** Upload ảnh trực tiếp vào Mongo dưới dạng data URL (không cần productId) */
const uploadProductImagesToMongo = async (req, res, next) => {
    try {
        if (!req.files) {
            return res.status(400).json({ 
                success: false,
                message: 'No files uploaded - req.files is undefined' 
            });
        }
        
        const files = req.files;
        if (!files.length) {
            return res.status(400).json({ 
                success: false,
                message: 'No files uploaded - files array is empty' 
            });
        }

        const { storeImages } = require('../utils/image-storage.js');
        const uploadedUrls = await storeImages(files, 'productImages');
        
        res.json({ 
            success: true, 
            imageUrls: uploadedUrls,
            message: `Uploaded ${uploadedUrls.length} images successfully`
        });
    } catch (err) {
        if (!res.headersSent) {
            res.status(500).json({
                success: false,
                message: err.message || 'Failed to upload images'
            });
        }
    }
};

/** Autocomplete product name using Atlas Search */
const autocompleteProducts = async (req, res, next) => {
    try {
        const q = req.query.q || '';
        if (!q.trim()) return res.json({ success: true, data: [] });

        const names = await atlasSearchService.autocomplete(q);
        return res.json({ success: true, data: names });

    } catch (error) {
        next(error);
    }
};

module.exports = {
    getAllProducts,
    getProductById,
    getProductBySlug,
    getProductByPrice,
    getProductByRating,
    createProduct,
    updateProduct,
    deleteProduct,
    addProductImages,
    removeProductImages,
    uploadProductImagesToMongo,
    autocompleteProducts,
};
