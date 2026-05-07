const express = require("express");

const {
    getAllProducts,
    getProductById,
    getProductBySlug,
    getProductByPrice,
    createProduct,
    updateProduct,
    deleteProduct,
    addProductImages,
    removeProductImages,
    uploadImagesToS3,
    autocompleteProducts,
} = require('../controllers/product.controller.js');

const {
    getVariantsByProduct,
} = require('../controllers/variant.controller.js');

const { uploadProductImages } = require('../middlewares/upload.middleware.js');
const authMiddleware = require('../middlewares/auth.middleware.js');
const adminOnly = require('../middlewares/admin.middleware.js');
const optionalAuth = require('../middlewares/optionalAuth.middleware.js');
const { strictApiLimiter } = require('../middlewares/rateLimit.middleware.js');
const router = express.Router();

router.get("/", optionalAuth, getAllProducts);
router.get("/autocomplete", autocompleteProducts); //trả mảng tên sản phẩm cho ô search suggestion
router.get("/slug/:slug", getProductBySlug);
router.get("/price/range", getProductByPrice);
router.get("/:productId/variants", getVariantsByProduct);
router.get("/:id", getProductById);

router.use(authMiddleware);
router.use(adminOnly);
router.post("/images/upload", strictApiLimiter, uploadProductImages, uploadImagesToS3);
router.post("/", strictApiLimiter, uploadProductImages, createProduct);
router.delete("/:id", strictApiLimiter, deleteProduct);
router.patch("/:id", strictApiLimiter, updateProduct);
// router.post("/:id/images", uploadProductImages, addProductImages);
// router.delete("/:id/images", removeProductImages);


module.exports = router;
