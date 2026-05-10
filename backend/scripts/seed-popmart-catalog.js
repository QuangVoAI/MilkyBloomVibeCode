const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const Category = require('../src/models/category.model');
const Product = require('../src/models/product.model');
const Variant = require('../src/models/variant.model');

const SCRAPED_PRODUCTS_PATH = path.resolve(
    __dirname,
    '../data/popmart-products.json',
);
const CATALOG_SOURCE_NOTE = 'backend/data/popmart-products.json';

const CATEGORY_RULES = [
    { name: 'Plush', patterns: [/plush/i, /doll/i, /stuffed/i] },
    {
        name: 'Accessories',
        patterns: [/phone case/i, /bag/i, /keychain/i, /pendant/i, /pin/i],
    },
    {
        name: 'Figures',
        patterns: [/figure/i, /figurine/i, /blind box/i, /vinyl/i, /action figure/i],
    },
    {
        name: 'Decor',
        patterns: [/lamp/i, /stand/i, /holder/i, /decor/i, /scene/i],
    },
    {
        name: 'Play Sets',
        patterns: [/block/i, /building/i, /set/i, /kit/i, /puzzle/i],
    },
];

function slugify(value) {
    return String(value || '')
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

function normalizeText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
}

function parsePrice(value) {
    if (value === null || value === undefined) return 0;
    const digits = String(value).replace(/[^\d]/g, '');
    return digits ? Number(digits) : 0;
}

function extractProductKey(url, fallbackIndex) {
    const match = String(url || '').match(/\/products\/(\d+)/i);
    return match?.[1] || `item-${fallbackIndex + 1}`;
}

function extractNameFromUrl(url) {
    try {
        const parsed = new URL(url);
        const parts = parsed.pathname.split('/').filter(Boolean);
        const productIndex = parts.findIndex((segment) => segment === 'products');
        if (productIndex !== -1 && productIndex + 2 < parts.length) {
            const nameParts = parts.slice(productIndex + 2);
            const candidate = normalizeText(
                decodeURIComponent(nameParts.join(' ')),
            );
            if (candidate && !/^\d+$/.test(candidate)) {
                return candidate;
            }
        }
    } catch (_error) {
        // Fall through to the raw URL fallback.
    }

    return '';
}

function createInlineSvgFallback(productSlug, index) {
    const colors = ['#f97316', '#ec4899', '#8b5cf6', '#0ea5e9', '#10b981'];
    const color = colors[index % colors.length];
    const label = normalizeText(productSlug || `Pop Mart ${index + 1}`);
    const svg = `
        <svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200" viewBox="0 0 1200 1200">
            <rect width="1200" height="1200" fill="${color}" />
            <circle cx="300" cy="280" r="180" fill="rgba(255,255,255,0.18)" />
            <circle cx="900" cy="920" r="240" fill="rgba(255,255,255,0.14)" />
            <rect x="120" y="760" width="960" height="180" rx="32" fill="rgba(255,255,255,0.18)" />
            <text x="80" y="620" fill="#fff" font-family="Arial, Helvetica, sans-serif" font-size="72" font-weight="700">${label}</text>
            <text x="80" y="700" fill="rgba(255,255,255,0.9)" font-family="Arial, Helvetica, sans-serif" font-size="34">Pop Mart catalog fixture</text>
        </svg>
    `;
    return `data:image/svg+xml;base64,${Buffer.from(svg.trim()).toString('base64')}`;
}

function inferCategoryName(product) {
    const text = normalizeText(`${product.title || ''} ${product.url || ''}`);
    for (const rule of CATEGORY_RULES) {
        if (rule.patterns.some((pattern) => pattern.test(text))) {
            return rule.name;
        }
    }
    return 'Collectibles';
}

function buildDescription(product, title) {
    const cleanTitle = normalizeText(title) || 'Pop Mart collectible';
    const base = `Imported from the scraped Pop Mart catalog. ${cleanTitle}.`;

    if (product.brand) {
        return `${base} Brand: ${normalizeText(product.brand)}.`;
    }

    return base;
}

async function getProductImages(product, productSlug) {
    const sourceUrls = (Array.isArray(product.images) ? product.images : [])
        .filter((imageUrl) => imageUrl && !imageUrl.includes('arrow-rect2.png'))
        .slice(0, 8);

    if (sourceUrls.length > 0) {
        return sourceUrls;
    }

    return [createInlineSvgFallback(productSlug, 0)];
}

function buildProductTitle(product, fallbackTitle) {
    const title = normalizeText(product.title);
    if (title) {
        return title;
    }

    const fromUrl = extractNameFromUrl(product.url);
    if (fromUrl && !/^\d+$/.test(fromUrl)) {
        return fromUrl;
    }

    return fallbackTitle;
}

async function buildProductPayload(product, categoryId, index) {
    const productKey = extractProductKey(product.url, index);
    const fallbackTitle = `Pop Mart Item ${index + 1}`;
    const title = buildProductTitle(product, fallbackTitle);
    const slugBase = `${title}-${productKey}`;
    const slug = slugify(slugBase) || `popmart-item-${productKey}`;
    const price = parsePrice(product.price);
    const originalPrice = parsePrice(product.originalPrice);
    const imageUrls = await getProductImages(product, slug);
    const stockQuantity = product.inStock ? Math.max(1, Math.min(30, Math.round(1200000 / Math.max(price || 1, 1)))) : 0;

    return {
        categoryName: inferCategoryName(product),
        product: {
            name: title,
            slug,
            categoryId: [categoryId],
            description: buildDescription(product, title),
            attributes: [
                {
                    name: 'Brand',
                    values: [normalizeText(product.brand) || 'Pop Mart'],
                },
                {
                    name: 'Site',
                    values: [normalizeText(product.site) || 'vn'],
                },
                {
                    name: 'Availability',
                    values: [product.inStock ? 'In stock' : 'Out of stock'],
                },
            ],
            imageUrls,
            averageRating: 0,
            status: 'Published',
            isFeatured: index % 5 === 0,
            totalUnitsSold: product.inStock
                ? Math.max(1, Math.round(1500000 / Math.max(price || 1, 1)))
                : 0,
            minPrice: price,
            maxPrice: price,
            _price: price,
            _originalPrice: originalPrice,
            _stockQuantity: stockQuantity,
            _productKey: productKey,
        },
    };
}

async function main() {
    if (!process.env.MONGO_URI) {
        throw new Error('MONGO_URI is required to seed the catalog');
    }

    if (!fs.existsSync(SCRAPED_PRODUCTS_PATH)) {
        throw new Error(
            `Scraped products file not found: ${SCRAPED_PRODUCTS_PATH}`,
        );
    }

    const rawProducts = JSON.parse(
        fs.readFileSync(SCRAPED_PRODUCTS_PATH, 'utf8'),
    );

    if (!Array.isArray(rawProducts) || rawProducts.length === 0) {
        throw new Error('No scraped products found in products.json');
    }

    const seenKeys = new Set();
    const normalizedProducts = [];
    for (let i = 0; i < rawProducts.length; i += 1) {
        const product = rawProducts[i];
        const key = extractProductKey(product.url, i);
        if (seenKeys.has(key)) {
            continue;
        }
        seenKeys.add(key);
        normalizedProducts.push(product);
    }

    console.log(
        `Loaded ${normalizedProducts.length} unique products from ${CATALOG_SOURCE_NOTE}`,
    );

    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB. Resetting product collections...');

    await Variant.deleteMany({});
    await Product.deleteMany({});
    await Category.deleteMany({});

    const categoryEntries = [];
    const categoryMap = new Map();

    for (let i = 0; i < normalizedProducts.length; i += 1) {
        const source = normalizedProducts[i];
        const categoryName = inferCategoryName(source);
        if (!categoryMap.has(categoryName)) {
            categoryMap.set(categoryName, categoryEntries.length + 1);
            categoryEntries.push({
                name: categoryName,
                slug: slugify(categoryName),
                description: `Imported Pop Mart products grouped under ${categoryName.toLowerCase()}.`,
                imageUrl: null,
                order: categoryEntries.length + 1,
            });
        }
    }

    const createdCategories = new Map();
    for (const categoryData of categoryEntries) {
        const categoryDoc = await Category.create(categoryData);
        createdCategories.set(categoryData.name, categoryDoc);
    }

    const summary = {
        categories: createdCategories.size,
        products: 0,
        variants: 0,
        images: 0,
    };

    for (let i = 0; i < normalizedProducts.length; i += 1) {
        const rawProduct = normalizedProducts[i];
        const categoryName = inferCategoryName(rawProduct);
        const categoryDoc = createdCategories.get(categoryName);
        const payload = await buildProductPayload(rawProduct, categoryDoc._id, i);
        const imageUrls = payload.product.imageUrls;

        const variant = {
            productId: null,
            sku: `POP-${payload.product._productKey}`,
            attributes: [{ name: 'Source', value: 'Scraped catalog' }],
            weight: 300,
            price: payload.product._price,
            stockQuantity: payload.product._stockQuantity,
            imageUrls: imageUrls.slice(0, 4),
            unitsSold: payload.product.totalUnitsSold,
            isActive: true,
        };

        const productDoc = await Product.create({
            name: payload.product.name,
            slug: payload.product.slug,
            categoryId: [categoryDoc._id],
            description: payload.product.description,
            attributes: payload.product.attributes,
            imageUrls,
            averageRating: payload.product.averageRating,
            status: payload.product.status,
            isFeatured: payload.product.isFeatured,
            totalUnitsSold: payload.product.totalUnitsSold,
            variants: [],
            minPrice: 0,
            maxPrice: 0,
        });

        const variantDoc = await Variant.create({
            ...variant,
            productId: productDoc._id,
        });

        await Product.findByIdAndUpdate(productDoc._id, {
            $set: {
                variants: [variantDoc._id],
                minPrice: payload.product._price,
                maxPrice: payload.product._price,
                totalStock: payload.product._stockQuantity,
            },
        });

        summary.products += 1;
        summary.variants += 1;
        summary.images += imageUrls.length;
    }

    console.log('Seed complete:', summary);
    await mongoose.disconnect();
}

main().catch(async (error) => {
    console.error('Failed to seed Pop Mart catalog:', error);
    try {
        await mongoose.disconnect();
    } catch (_disconnectError) {
        // Ignore disconnect errors on failure paths.
    }
    process.exit(1);
});
