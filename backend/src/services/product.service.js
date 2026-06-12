const mongoose = require('mongoose');
const productRepository = require('../repositories/product.repository.js');
const variantRepository = require('../repositories/variant.repository.js');
const {
    storeImages,
    removeImages,
    normalizePublicMediaUrlsDeep,
} = require('../utils/image-storage.js');
const { default: slugify } = require('slugify');
const { searchProducts } = require('./atlas.search.service.js');

const isValidCategoryFilter = (value) =>
    typeof value === 'string' &&
    value !== '[object Object]' &&
    mongoose.Types.ObjectId.isValid(value);

/**
 * Lấy danh sách sản phẩm (có lọc + phân trang)
 * Uses Atlas Search for keyword search, MongoDB for filtering
 */
const getAllProducts = async (query, user = null) => {
    // Use Atlas Search ONLY for keyword searches
    const keyword = query?.keyword;
    if (keyword && keyword.trim()) {
        return await searchProducts(query, user);
    }
    
    const startTime = Date.now();
    // Use regular MongoDB queries for filtering (category, price, etc.)
    
    // 1. Phân tích các tham số (params) từ query
    const params = new URLSearchParams(Object.entries(query || {}));

    // Phân trang
    const page = Math.max(1, parseInt(params.get('page') || '1', 10));
    const limit = Math.max(1, parseInt(params.get('limit') || '20', 10));

    // Sắp xếp (hỗ trợ cả "field:order" và các preset giống nhánh Atlas Search)
    const sortParam = params.get('sort') || '';

    // 2. Xây dựng đối tượng 'filter' (bộ lọc)
    const filter = {};

    // --- Lọc theo Category ---
    const categoryId = params.get('categoryId') || null;
    if (isValidCategoryFilter(categoryId)) {
        filter.categoryId = categoryId;
    }

    // --- Lọc theo Khoảng giá (Price Range) ---
    // Filter by OVERLAP: Show products that have ANY variant in the user's price range
    // A product with minPrice=100k and maxPrice=500k should show for range 200k-400k
    const minPrice = parseFloat(params.get('minPrice') || '0');
    const maxPrice = parseFloat(params.get('maxPrice') || '0');

    // Overlap logic:
    // - User's minPrice: product's maxPrice must be >= user's minPrice (at least one variant is expensive enough)
    // - User's maxPrice: product's minPrice must be <= user's maxPrice (at least one variant is cheap enough)
    if (minPrice > 0) {
        filter.maxPrice = { $gte: minPrice };  // Product has at least one variant >= user's min
    }
    if (maxPrice > 0) {
        filter.minPrice = { $lte: maxPrice };  // Product has at least one variant <= user's max
    }

    // --- Lọc theo Đánh giá (Rating) ---
    const minRating = parseFloat(params.get('minRating') || '0');
    if (minRating > 0) {
        filter.averageRating = { $gte: minRating };
    }

    // --- Lọc theo Nổi bật (Featured) ---
    if (params.get('isFeatured') === 'true') {
        filter.isFeatured = true;
    }

    // --- Lọc theo Status (chỉ Published cho non-admin) ---
    // Admin có thể xem tất cả status, user thường chỉ xem Published
    const isAdmin = user && user.role === 'admin';
    if (!isAdmin) {
        filter.status = 'Published';
    }

    // ================================================================
    // --- [MỚI] Lọc theo Ngày tạo (Date Range) ---
    // ================================================================

    // (Lưu ý: filter.createdAt có thể được xây dựng từng phần)
    filter.createdAt = {};

    // Lọc theo 'daysAgo' (ví dụ: ?daysAgo=7)
    // Ưu tiên hơn startDate nếu cả hai đều được cung cấp
    const daysAgo = parseInt(params.get('daysAgo') || '0', 10);
    if (daysAgo > 0) {
        const pastDate = new Date();
        pastDate.setDate(new Date().getDate() - daysAgo);
        pastDate.setHours(0, 0, 0, 0); // Đặt về đầu ngày

        filter.createdAt.$gte = pastDate;
    } else {
        // Nếu không có daysAgo, kiểm tra startDate
        const startDate = params.get('startDate') || null; // Dạng "YYYY-MM-DD"
        if (startDate) {
            // $gte: Lớn hơn hoặc bằng (từ 00:00:00 của ngày bắt đầu)
            filter.createdAt.$gte = new Date(startDate);
        }
    }

    // Lọc theo endDate (ví dụ: ?endDate=2025-11-15)
    const endDate = params.get('endDate') || null; // Dạng "YYYY-MM-DD"
    if (endDate) {
        // $lte: Nhỏ hơn hoặc bằng (đến 23:59:59 của ngày kết thúc)
        const endOfDay = new Date(endDate);
        endOfDay.setHours(23, 59, 59, 999);

        filter.createdAt.$lte = endOfDay;
    }

    // Nếu không có điều kiện ngày nào được thêm, xóa object rỗng
    if (Object.keys(filter.createdAt).length === 0) {
        delete filter.createdAt;
    }

    // ================================================================
    // --- Kết thúc phần lọc ngày ---
    // ================================================================

    // 3. Xây dựng đối tượng 'options' (phân trang & sắp xếp)
    const options = {
        skip: (page - 1) * limit,
        limit,
        sort: {},
    };

    const defaultSort = { createdAt: -1 };
    if (!sortParam || sortParam === 'relevance') {
        options.sort = defaultSort;
    } else if (sortParam.includes(':')) {
        const [key, order] = sortParam.split(':');
        options.sort[key] = order === 'desc' ? -1 : 1;
    } else {
        switch (sortParam) {
            case 'price-asc':
                options.sort.minPrice = 1;
                break;
            case 'price-desc':
                options.sort.minPrice = -1;
                break;
            case 'rating':
                options.sort.averageRating = -1;
                break;
            case 'newest':
                options.sort.createdAt = -1;
                break;
            case 'best-selling':
                options.sort.soldCount = -1;
                break;
            case 'name-asc':
                options.sort.name = 1;
                break;
            case 'name-desc':
                options.sort.name = -1;
                break;
            default:
                options.sort = defaultSort;
        }
    }

    // 4. Gọi Repository
    const { products, total } = await productRepository.findAll(
        filter,
        options,
    );
    
    // 5. Get aggregated stats (always for all matching products, not just current page)
    const stats = await productRepository.getStats(filter);

    // 6. Trả về kết quả
    return normalizePublicMediaUrlsDeep({
        success: true,
        products,
        pagination: {
            total,
            totalPages: Math.ceil(total / limit),
            currentPage: page,
            limit,
            hasMore: (page - 1) * limit + products.length < total,
        },
        stats, // Aggregated stats for all matching products
        meta: {
            took: Date.now() - startTime,
            usingAtlasSearch: false,
            keyword: null,
        },
    });
};

/**
 * Lấy chi tiết sản phẩm theo ID
 */
const getProductById = async (id) => {
    const product = await productRepository.findById(id);
    if (!product) throw new Error('Product not found');
    return normalizePublicMediaUrlsDeep(product);
};

const getProductBySlug = async (slug) => {
    const product = await productRepository.findBySlug(slug);
    if (!product) {
        throw new Error("Product not found");
    }
    return normalizePublicMediaUrlsDeep(product);
};

const getProductByPrice = (min, max) => {
    return productRepository.findByPrice(min, max);
};

const createProduct = async (productData, imgFiles) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        // 1. Validate cơ bản
        if (!productData.name) {
            throw new Error('Product name is required.');
        }

        // 2. Tạo Slug
        const slugToCreate = productData.slug
            ? slugify(productData.slug, { lower: true, strict: true })
            : slugify(productData.name, { lower: true, strict: true });

        const existingProduct =
            await productRepository.findBySlug(slugToCreate);
        if (existingProduct) {
            throw new Error(`Slug '${slugToCreate}' already exists.`);
        }

        // 3. Upload ảnh chính của Product (nếu có)
        // hoặc sử dụng imageUrls đã upload sẵn từ client
        let imageUrls = [];
        if (productData.imageUrls && Array.isArray(productData.imageUrls)) {
            // Client đã upload trước, gửi URLs
            imageUrls = productData.imageUrls;
        } else if (imgFiles && imgFiles.length > 0) {
            // Upload từ server (legacy support)
            imageUrls = await storeImages(imgFiles, 'productImages');
        }

        // 4. Parse dữ liệu Variants
        // Khi gửi multipart/form-data, mảng object thường bị chuyển thành chuỗi JSON
        let variantsInput = [];
        if (productData.variants) {
            try {
                variantsInput =
                    typeof productData.variants === 'string'
                        ? JSON.parse(productData.variants)
                        : productData.variants;
            } catch (e) {
                throw new Error(
                    'Invalid variants data format. Must be a valid JSON array.',
                );
            }
        }

        // 5. Tạo Product Document (Tạm thời rỗng variants/attributes)
        // Lưu ý: Cần truyền session vào repository
        const newProduct = await productRepository.create(
            {
                ...productData,
                slug: slugToCreate,
                imageUrls: imageUrls,
                variants: [],
                attributes: [],
                minPrice: 0,
                maxPrice: 0,
            },
            { session },
        ); // Quan trọng: Truyền session

        // 6. Xử lý Variants & Attributes
        let createdVariantIds = [];
        let allAttributes = [];
        let minPrice = 0;
        let maxPrice = 0;

        if (variantsInput.length > 0) {
            const variantDocs = [];
            const prices = [];

            for (const v of variantsInput) {
                // a. Xử lý Attributes cho từng variant
                const attrs = v.attributes || [];

                // b. Gộp vào danh sách Attributes tổng của Product
                attrs.forEach((attr) => {
                    const existing = allAttributes.find(
                        (a) => a.name === attr.name,
                    );
                    if (existing) {
                        if (!existing.values.includes(attr.value)) {
                            existing.values.push(attr.value);
                        }
                    } else {
                        allAttributes.push({
                            name: attr.name,
                            values: [attr.value],
                        });
                    }
                });

                // c. Chuẩn bị object Variant
                // Auto-generate SKU nếu không có (vì createMany không trigger pre-save middleware)
                let variantSku = v.sku;
                if (!variantSku || variantSku.trim() === '') {
                    const timestamp = Date.now().toString(36).toUpperCase();
                    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
                    variantSku = `VAR-${timestamp}-${random}`;
                }

                variantDocs.push({
                    productId: newProduct._id,
                    name:
                        v.name ||
                        `${productData.name} - ${attrs.map((a) => a.value).join(' ')}`,
                    sku: variantSku,
                    weight: parseInt(v.weight || 100),
                    price: parseFloat(v.price || 0),
                    stockQuantity: parseInt(v.stock || v.stockQuantity || 0),
                    attributes: attrs,
                    imageUrls: v.imageUrls || [], // Sử dụng imageUrls từ client hoặc rỗng
                    isActive: v.isActive !== false,
                });

                prices.push(parseFloat(v.price || 0));
            }

            // d. Lưu Variants vào DB (Batch Insert)
            // Lưu ý: Repository cần hỗ trợ insertMany hoặc tạo vòng lặp create với session
            // Giả sử variantRepository.createMany hỗ trợ session
            const createdVariants = await variantRepository.createMany(
                variantDocs,
                {
                    session,
                },
            );

            createdVariantIds = createdVariants.map((v) => v._id);

            // e. Tính giá (totalStock sẽ được tự động cập nhật bởi variant middleware)
            if (prices.length > 0) {
                minPrice = Math.min(...prices);
                maxPrice = Math.max(...prices);
            }
        }

        // 7. Cập nhật lại Product với thông tin variants vừa tạo
        // Dùng findByIdAndUpdate hoặc update của repo, nhớ truyền session
        await productRepository.update(
            newProduct._id,
            {
                variants: createdVariantIds,
                attributes: allAttributes,
                minPrice,
                maxPrice,
            },
            { session },
        );

        // 8. Commit Transaction (Lưu tất cả)
        await session.commitTransaction();

        // 9. Recalculate prices and stock AFTER transaction commit
        // (insertMany doesn't trigger save middleware, so we need manual recalculation)
        const Variant = require("../models/variant.model");
        await Variant.recalculateProductData(newProduct._id);

        // Trả về sản phẩm hoàn chỉnh
        // Có thể cần gọi lại getById để lấy data đầy đủ populate
        const finalProduct = await productRepository.findById(newProduct._id);
        
        // Atlas Search automatically indexes via MongoDB change streams
        // No manual indexing needed
        
        return normalizePublicMediaUrlsDeep(finalProduct);
    } catch (error) {
        // 9. Rollback (Hủy tất cả thao tác DB)
        await session.abortTransaction();

        // Nếu có ảnh cũ thì xóa đi (dọn rác)
        // (Bạn cần implement logic lấy array url vừa upload để xóa tại đây)

        throw error;
    } finally {
        session.endSession();
    }
};

const deleteProduct = async (id) => {
    const product = await productRepository.findById(id);
    if (!product) throw new Error('Product not found');

    if (product.imageUrls?.length) {
        await removeImages(product.imageUrls);
    }

    // Delete all variants (deleteMany doesn't trigger middleware per document)
    await variantRepository.deleteByProductId(id);

    // Delete the product itself
    await productRepository.remove(id);

    // Atlas Search automatically removes via MongoDB change streams
    // No manual deletion needed

    return { message: 'Product deleted successfully' };
};

/**
 * Cập nhật thông tin sản phẩm (chỉ các trường được phép trong whitelist)
 * NOTE: Images are handled separately via addImagesToProduct/removeImagesFromProduct
 */
const updateProduct = async (id, updateData, retryCount = 0) => {
    const MAX_RETRIES = 3;
    const session = await mongoose.startSession();
    
    try {
        // 1. Delete images if specified
        if (updateData.deletedImageUrls && Array.isArray(updateData.deletedImageUrls) && updateData.deletedImageUrls.length > 0) {
            try {
                await removeImages(updateData.deletedImageUrls);
            } catch (err) {
                console.error('❌ Image deletion failed:', err.message);
            }
        }
        
        const result = await session.withTransaction(async () => {
            const product = await productRepository.findById(id);
            if (!product) throw new Error("Product not found");

            const allowedUpdates = [
                'name',
                'slug',
                'description',
                'status',
                'isFeatured',
                'categoryId',
                'imageUrls',
            ];

            const updatePayload = {};

            Object.keys(updateData).forEach(key => {
                if (allowedUpdates.includes(key)) {
                    updatePayload[key] = updateData[key];
                }
            });

        // Xử lý Variants (Đồng bộ hóa)
        if (updateData.variants) {
            const variantsInput = updateData.variants;

            if (Array.isArray(variantsInput)) {
                const existingVariantIds = (product.variants || []).map(v => v.toString());
                const incomingVariantIds = [];
                const prices = [];
                const newAttributes = [];

                for (const v of variantsInput) {
                    const variantData = {
                        price: v.price?.$numberDecimal || v.price,
                        stockQuantity: v.stockQuantity !== undefined && v.stockQuantity !== null 
                            ? parseInt(v.stockQuantity) 
                            : (v.stock !== undefined && v.stock !== null ? parseInt(v.stock) : 0),
                        weight: v.weight ? parseInt(v.weight) : 100,
                        attributes: v.attributes,
                        isActive: v.isActive !== false,
                        imageUrls: v.imageUrls || []
                    };
                    
                    if (v.sku) {
                        variantData.sku = v.sku;
                    }
                    
                    prices.push(parseFloat(variantData.price));

                    // Collect attributes from variant
                    if (v.attributes && Array.isArray(v.attributes)) {
                        v.attributes.forEach(attr => {
                            const existing = newAttributes.find(a => a.name === attr.name);
                            if (existing) {
                                if (!existing.values.includes(attr.value)) {
                                    existing.values.push(attr.value);
                                }
                            } else {
                                newAttributes.push({
                                    name: attr.name,
                                    values: [attr.value]
                                });
                            }
                        });
                    }

                    if (v._id && !v._id.startsWith('var_')) {
                        // UPDATE variant cũ
                        await variantRepository.update(v._id, variantData, { session });
                        incomingVariantIds.push(v._id);
                    } else {
                        // CREATE variant mới
                        // Lưu ý: Nếu variant có ảnh riêng, logic upload ảnh variant cần xử lý riêng hoặc upload trước
                        const newVariant = await variantRepository.create({
                            ...variantData,
                            productId: id
                        }, { session });
                        incomingVariantIds.push(newVariant._id.toString());
                    }
                }

                // DELETE các variant không còn tồn tại trong danh sách gửi lên
                // (Logic này tùy chọn: Nếu bạn muốn xóa variant khi user xóa dòng trên UI)
                if (updateData.deletedVariantIds) {
                     let deletedIds = updateData.deletedVariantIds;
                     if (typeof deletedIds === 'string') try { deletedIds = JSON.parse(deletedIds); } catch(e){}
                     
                     if (Array.isArray(deletedIds)) {
                         for (const delId of deletedIds) {
                             await variantRepository.deleteById(delId, { session });
                         }
                         // Filter out deleted IDs from incoming list just in case
                         // ...
                     }
                }

                // Update product with collected attributes
                updatePayload.attributes = newAttributes;
                updatePayload.variants = incomingVariantIds;

                if (prices.length > 0) {
                    updatePayload.minPrice = Math.min(...prices);
                    updatePayload.maxPrice = Math.max(...prices);
                }
            }
        }

        // 4. Lưu Product
        await productRepository.update(id, updatePayload, { session });
        
        // Return updated product from within transaction
        const Product = mongoose.model('Product');
        const updatedProduct = await Product.findById(id)
            .populate([
                { path: 'categoryId', select: 'name slug description' },
                { path: 'variants' }
            ])
            .session(session);
        
        return updatedProduct;
        
        }, {
            readPreference: 'primary',
            readConcern: { level: 'local' },
            writeConcern: { w: 'majority' }
        });

        // Manually recalculate totalStock after transaction (since middleware is skipped during session)
        if (updateData.variants) {
            const Variant = mongoose.model('Variant');
            await Variant.recalculateProductData(id);
        }

        // Atlas Search automatically updates via MongoDB change streams
        // No manual indexing needed

        return normalizePublicMediaUrlsDeep(result);

    } catch (error) {
        console.error('\n❌ UPDATE ERROR:', error.message);
        console.error('Stack:', error.stack);
        
        // Handle write conflicts with retry
        if (error.hasErrorLabel && error.hasErrorLabel('TransientTransactionError') && retryCount < MAX_RETRIES) {
            await new Promise(resolve => setTimeout(resolve, 100 * Math.pow(2, retryCount))); // Exponential backoff
            return updateProduct(id, updateData, retryCount + 1);
        }
        throw error;
    } finally {
        session.endSession();
    }
};

/**
 * Thêm ảnh mới vào product
 */
const addImagesToProduct = async (id, files) => {
    const uploadedUrls = await storeImages(files, 'productImages');

    const updated = await productRepository.update(id, {
        $push: { imageUrls: { $each: uploadedUrls } },
    });

    if (!updated) throw new Error('Product not found');
    return normalizePublicMediaUrlsDeep(updated);
};

/**
 * Xóa ảnh khỏi product
 */
const removeImagesFromProduct = async (id, urlsToRemove) => {
    await removeImages(urlsToRemove);

    const updated = await productRepository.update(id, {
        $pull: { imageUrls: { $in: urlsToRemove } },
    });

    if (!updated) throw new Error('Product not found');
    return normalizePublicMediaUrlsDeep(updated);
};

// Hàm tự động cập nhật giá
const updateProductPriceRange = async (productId) => {
    const variants = await variantRepository.find({ productId });
    if (variants.length === 0) {
        await productRepository.findByIdAndUpdate(productId, {
            minPrice: 0,
            maxPrice: 0,
        });
        return;
    }

    const prices = variants.map((v) => v.price);
    const min = Math.min(...prices);
    const max = Math.max(...prices);

    await productRepository.findByIdAndUpdate(productId, {
        minPrice: min,
        maxPrice: max,
    });
};

module.exports = {
    getAllProducts,
    getProductById,
    getProductBySlug,
    getProductByPrice,
    createProduct,
    updateProduct,
    deleteProduct,
    addImagesToProduct,
    removeImagesFromProduct,
    updateProductPriceRange,
};
