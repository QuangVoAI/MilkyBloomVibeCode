const Product = require('../models/product.model.js');
const { normalizePublicMediaUrlsDeep } = require('../utils/image-storage.js');

/**
 * MongoDB Atlas Search Service
 * Uses $search aggregation pipeline for fast, relevant search results
 * Requires "products_search" index to be created in MongoDB Atlas console
 */

/**
 * Search products using MongoDB Atlas Search
 * @param {Object} query - Query parameters (keyword, categoryId, minPrice, maxPrice, etc.)
 * @param {Object} user - Current user (for admin-only filters)
 * @returns {Promise<Object>} - Search results with products and pagination
 */
const searchProducts = async (query = {}, user = null) => {
    const startTime = Date.now();
    
    // Parse query parameters
    const {
        keyword = '',
        categoryId,
        minPrice,
        maxPrice,
        minRating,
        isFeatured,
        status = 'Published', // Default to Published for non-admin users
        daysAgo,
        sort = 'relevance',
        page = 1,
        limit = 20
    } = query;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const limitNum = parseInt(limit);

    // Build Atlas Search pipeline
    const pipeline = [];

    // 1. $search stage - Full-text search with fuzzy matching
    if (keyword && keyword.trim()) {
        pipeline.push({
            $search: {
                index: 'products_search', // Must match index name in Atlas
                compound: {
                    should: [
                        {
                            text: {
                                query: keyword,
                                path: 'name',
                                score: { boost: { value: 3 } }, // Name matches score higher
                                fuzzy: {
                                    maxEdits: 2,
                                    prefixLength: 0
                                }
                            }
                        },
                        {
                            text: {
                                query: keyword,
                                path: 'description',
                                score: { boost: { value: 1 } },
                                fuzzy: {
                                    maxEdits: 2
                                }
                            }
                        },
                        {
                            text: {
                                query: keyword,
                                path: 'brand',
                                score: { boost: { value: 2 } },
                                fuzzy: {
                                    maxEdits: 1
                                }
                            }
                        }
                    ],
                    minimumShouldMatch: 1
                }
            }
        });

        // Add search score to results
        pipeline.push({
            $addFields: {
                searchScore: { $meta: 'searchScore' }
            }
        });
    }

    // 2. $match stage - Standard filters
    const matchConditions = {};

    // Status filter (admin can see all, users only see Published)
    if (user?.role === 'admin' && status && status !== 'all') {
        matchConditions.status = status;
    } else if (user?.role !== 'admin') {
        matchConditions.status = 'Published';
    }

    // Category filter
    if (categoryId && categoryId !== 'all') {
        matchConditions.categoryId = categoryId;
    }

    // Featured filter
    if (isFeatured !== undefined && isFeatured !== 'all') {
        matchConditions.isFeatured = isFeatured === 'true' || isFeatured === true;
    }

    // Price range filter
    if (minPrice || maxPrice) {
        matchConditions.$or = [
            { 'variants.price': { $exists: true } },
            { 'variants.salePrice': { $exists: true } }
        ];
    }

    // Date filter (products created in last N days)
    if (daysAgo && daysAgo !== 'all') {
        const days = parseInt(daysAgo);
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - days);
        matchConditions.createdAt = { $gte: cutoffDate };
    }

    if (Object.keys(matchConditions).length > 0) {
        pipeline.push({ $match: matchConditions });
    }

    // 3. Lookup variants
    pipeline.push({
        $lookup: {
            from: 'variants',
            localField: '_id',
            foreignField: 'productId',
            as: 'variants'
        }
    });

    // 4. Add computed fields
    pipeline.push({
        $addFields: {
            minPrice: {
                $min: {
                    $map: {
                        input: '$variants',
                        as: 'v',
                        in: { $ifNull: ['$$v.salePrice', '$$v.price'] }
                    }
                }
            },
            maxPrice: {
                $max: {
                    $map: {
                        input: '$variants',
                        as: 'v',
                        in: { $ifNull: ['$$v.salePrice', '$$v.price'] }
                    }
                }
            },
            totalStock: { $sum: '$variants.stockQuantity' },
            hasStock: {
                $gt: [{ $sum: '$variants.stockQuantity' }, 0]
            }
        }
    });

    // 5. Price range filter (after calculating minPrice/maxPrice)
    // Overlap logic: product.maxPrice >= userMin AND product.minPrice <= userMax
    if (minPrice || maxPrice) {
        const priceConditions = [];
        if (minPrice) {
            priceConditions.push({ maxPrice: { $gte: parseFloat(minPrice) } });
        }
        if (maxPrice) {
            priceConditions.push({ minPrice: { $lte: parseFloat(maxPrice) } });
        }
        if (priceConditions.length > 0) {
            pipeline.push({ $match: { $and: priceConditions } });
        }
    }

    // 6. Rating filter
    if (minRating && minRating !== 'all') {
        pipeline.push({
            $match: {
                averageRating: { $gte: parseFloat(minRating) }
            }
        });
    }

    // 7. Lookup categories
    pipeline.push({
        $lookup: {
            from: 'categories',
            localField: 'categoryId',
            foreignField: '_id',
            as: 'category'
        }
    });

    pipeline.push({
        $unwind: {
            path: '$category',
            preserveNullAndEmptyArrays: true
        }
    });

    // 8. Sorting
    const sortStage = {};

    if (keyword && keyword.trim() && (!sort || sort === 'relevance')) {
        // Sort by search score if keyword present and sort=relevance|empty
        sortStage.searchScore = -1;
    } else if (typeof sort === 'string' && sort.includes(':')) {
        // Accept "field:order" to match non-search path
        const [field, order] = sort.split(':');
        sortStage[field] = order === 'desc' ? -1 : 1;
    } else {
        switch (sort) {
            case 'price-asc':
                sortStage.minPrice = 1;
                break;
            case 'price-desc':
                sortStage.minPrice = -1;
                break;
            case 'rating':
                sortStage.averageRating = -1;
                sortStage.totalReviews = -1;
                break;
            case 'newest':
                sortStage.createdAt = -1;
                break;
            case 'best-selling':
                sortStage.soldCount = -1;
                break;
            case 'name-asc':
                sortStage.name = 1;
                break;
            case 'name-desc':
                sortStage.name = -1;
                break;
            default:
                sortStage.createdAt = -1; // Default to newest
        }
    }
    
    pipeline.push({ $sort: sortStage });

    // 9. Count total documents (before pagination)
    const countPipeline = [...pipeline, { $count: 'total' }];
    const countResult = await Product.aggregate(countPipeline);
    const total = countResult[0]?.total || 0;

    // 10. Pagination
    pipeline.push({ $skip: skip });
    pipeline.push({ $limit: limitNum });

    // 11. Project final shape
    pipeline.push({
        $project: {
            name: 1,
            slug: 1,
            description: 1,
            brand: 1,
            imageUrls: 1,
            status: 1,
            isFeatured: 1,
            minPrice: 1,
            maxPrice: 1,
            totalStock: 1,
            hasStock: 1,
            averageRating: 1,
            totalReviews: 1,
            soldCount: 1,
            variants: 1,
            categoryId: 1,
            category: {
                _id: 1,
                name: 1,
                slug: 1
            },
            createdAt: 1,
            updatedAt: 1,
            searchScore: 1
        }
    });

    // Execute search
    const products = await Product.aggregate(pipeline);

    const took = Date.now() - startTime;

    return normalizePublicMediaUrlsDeep({
        success: true,
        products,
        pagination: {
            total,
            totalPages: Math.ceil(total / limitNum),
            currentPage: parseInt(page),
            limit: limitNum,
            hasMore: skip + products.length < total
        },
        meta: {
            took,
            usingAtlasSearch: true,
            keyword: keyword || null
        }
    });
};

/**
 * Autocomplete suggestions using Atlas Search
 * @param {string} query - Partial search term
 * @param {number} limit - Max suggestions
 * @returns {Promise<Array>} - Suggestion strings
 */
const autocomplete = async (query, limit = 10) => {
    if (!query || query.length < 2) {
        return [];
    }

    const pipeline = [
        {
            $search: {
                index: 'products_search',
                autocomplete: {
                    query: query,
                    path: 'name',
                    fuzzy: {
                        maxEdits: 1
                    }
                }
            }
        },
        {
            $limit: limit
        },
        {
            $project: {
                name: 1,
                _id: 0
            }
        }
    ];

    const results = await Product.aggregate(pipeline);
    return results.map(r => r.name);
};

/**
 * Get trending/popular products
 * @param {number} limit - Max products
 * @returns {Promise<Array>} - Popular products
 */
const getTrendingProducts = async (limit = 10) => {
    const products = await Product.find({ status: 'Published' })
        .sort({ soldCount: -1, averageRating: -1 })
        .limit(limit)
        .populate('categoryId', 'name slug')
        .lean();

    return products;
};

module.exports = {
    searchProducts,
    autocomplete,
    getTrendingProducts
};
