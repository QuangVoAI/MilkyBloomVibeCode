const path = require('path');
const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const Category = require('../src/models/category.model');
const Product = require('../src/models/product.model');
const Variant = require('../src/models/variant.model');
const { storeImages } = require('../src/utils/image-storage');

const EDITIONS = [
    { label: 'Classic', priceOffset: 0, stock: 18, sold: 12 },
    { label: 'Shimmer', priceOffset: 40000, stock: 14, sold: 9 },
    { label: 'Collector', priceOffset: 90000, stock: 8, sold: 5 },
];

const CHARACTER_POOL = [
    { name: 'Nib', ear: 'bunny', face: 'soft', accent: 'star' },
    { name: 'Mochi', ear: 'bear', face: 'sleepy', accent: 'moon' },
    { name: 'Pip', ear: 'cat', face: 'wink', accent: 'heart' },
    { name: 'Bobo', ear: 'horn', face: 'smile', accent: 'spark' },
    { name: 'Lulu', ear: 'bunny', face: 'wink', accent: 'flower' },
    { name: 'Toto', ear: 'bear', face: 'soft', accent: 'crown' },
    { name: 'Mimi', ear: 'cat', face: 'sleepy', accent: 'star' },
    { name: 'Rolo', ear: 'horn', face: 'smile', accent: 'moon' },
];

const CATEGORY_TEMPLATES = [
    {
        name: 'Blind Boxes',
        slug: 'blind-boxes',
        icon: 'BB',
        palette: ['#FF8A5B', '#FFD3B6', '#6C5CE7'],
        description:
            'Mystery collectibles with surprise editions, pastel palettes, and shelf-ready packaging.',
        products: [
            'Stardust Picnic Box',
            'Moon Parade Capsule',
            'Candy Orbit Surprise',
            'Dream Shelf Secrets',
        ],
    },
    {
        name: 'Designer Figures',
        slug: 'designer-figures',
        icon: 'DF',
        palette: ['#00B894', '#B8F2E6', '#0F766E'],
        description:
            'Display-friendly art toys with character stories, premium finishes, and collector energy.',
        products: [
            'Nova Sprout Figure',
            'Pixel Ranger Figure',
            'Cloud Hopper Figure',
            'Jelly Comet Figure',
        ],
    },
    {
        name: 'Plush Friends',
        slug: 'plush-friends',
        icon: 'PF',
        palette: ['#F78FB3', '#FDE2E4', '#C44569'],
        description:
            'Soft companions for bedrooms and gifting, designed with gentle colors and cozy textures.',
        products: [
            'Pudding Cub Plush',
            'Berry Bunny Plush',
            'Matcha Whale Plush',
            'Peach Otter Plush',
        ],
    },
    {
        name: 'Building Kits',
        slug: 'building-kits',
        icon: 'BK',
        palette: ['#F6BD60', '#FAEDCD', '#9C6644'],
        description:
            'Buildable mini worlds with playful architecture, pastel blocks, and tactile assembly fun.',
        products: [
            'Mini Street Cart Kit',
            'Sky Arcade Kit',
            'Cozy Bakery Kit',
            'Pocket Planetarium Kit',
        ],
    },
    {
        name: 'Creative Play',
        slug: 'creative-play',
        icon: 'CP',
        palette: ['#3DC1D3', '#DFF9FB', '#227093'],
        description:
            'Hands-on play sets for decorating, making, and storytelling with bright studio vibes.',
        products: [
            'Sticker Story Studio',
            'Charm Bead Lab',
            'Color Splash Clay Set',
            'Tiny Costume Trunk',
        ],
    },
    {
        name: 'Desk Decor',
        slug: 'desk-decor',
        icon: 'DD',
        palette: ['#778BEB', '#E4E7FF', '#4B4E6D'],
        description:
            'Cute functional objects for desks, shelves, and study corners with collectible styling.',
        products: [
            'Mood Lamp Buddy',
            'Memo Monster Stand',
            'Cable Keeper Crew',
            'Planter Pal Totem',
        ],
    },
    {
        name: 'Mini Accessories',
        slug: 'mini-accessories',
        icon: 'MA',
        palette: ['#A29BFE', '#F3E8FF', '#6C5CE7'],
        description:
            'Portable toy-inspired extras for bags, keys, and phones with layered character detail.',
        products: [
            'Keychain Capsule Crew',
            'Bag Charm Parade',
            'Pin Pack Carnival',
            'Phone Grip Buddies',
        ],
    },
    {
        name: 'Gift Sets',
        slug: 'gift-sets',
        icon: 'GS',
        palette: ['#55EFC4', '#E8FFF8', '#00B894'],
        description:
            'Ready-to-gift bundles that mix bestsellers, surprise inserts, and occasion-based curation.',
        products: [
            'Birthday Surprise Crate',
            'Sleepover Joy Box',
            'Study Break Bundle',
            'Celebration Treasure Set',
        ],
    },
];

const slugify = (value) =>
    String(value)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');

const escapeXml = (value) =>
    String(value)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

const rotatePalette = (palette) => [palette[1], palette[2], palette[0]];

const getCharacterSpec = (categoryIndex, productIndex, editionIndex = 0) =>
    CHARACTER_POOL[
        (categoryIndex * 5 + productIndex * 3 + editionIndex) %
            CHARACTER_POOL.length
    ];

const storeSvgAsset = async (svgContent, folder, originalname) => {
    try {
        const urls = await storeImages(
            [
                {
                    buffer: Buffer.from(svgContent, 'utf8'),
                    mimetype: 'image/svg+xml',
                    originalname,
                },
            ],
            folder,
        );
        if (Array.isArray(urls) && urls[0]) {
            return urls[0];
        }
    } catch (error) {
        console.warn(
            `Image storage failed for ${originalname}, retrying is required:`,
            error.message,
        );
    }

    throw new Error(`Failed to store demo SVG asset: ${originalname}`);
};

const renderAccent = (accent, color) => {
    switch (accent) {
        case 'moon':
            return `<path d="M862 198c-22 20-31 55-18 84 15 34 51 51 84 47-12 25-37 44-73 44-48 0-87-39-87-87 0-40 27-74 64-84 9-2 21-4 30-4Z" fill="${color}" fill-opacity="0.7"/>`;
        case 'heart':
            return `<path d="M866 213c18-27 59-25 73 4 11 22 3 47-18 66l-43 39-45-39c-21-18-29-43-18-66 14-29 55-31 72-4l-10 0-11 0Z" fill="${color}" fill-opacity="0.76"/>`;
        case 'flower':
            return `<circle cx="884" cy="245" r="18" fill="${color}" fill-opacity="0.75"/><circle cx="852" cy="245" r="18" fill="${color}" fill-opacity="0.75"/><circle cx="868" cy="220" r="18" fill="${color}" fill-opacity="0.75"/><circle cx="868" cy="270" r="18" fill="${color}" fill-opacity="0.75"/><circle cx="868" cy="245" r="12" fill="white" fill-opacity="0.85"/>`;
        case 'crown':
            return `<path d="M820 300l22-66 34 30 31-43 30 43 34-30 22 66H820Z" fill="${color}" fill-opacity="0.72"/><rect x="820" y="294" width="173" height="18" rx="9" fill="${color}" fill-opacity="0.72"/>`;
        case 'spark':
            return `<path d="M882 170l12 36 35 12-35 12-12 36-12-36-35-12 35-12 12-36Z" fill="${color}" fill-opacity="0.74"/>`;
        case 'star':
        default:
            return `<path d="M878 174l17 34 38 6-27 27 6 38-34-18-34 18 6-38-27-27 38-6 17-34Z" fill="${color}" fill-opacity="0.72"/>`;
    }
};

const renderEars = (type, fill, stroke) => {
    switch (type) {
        case 'bear':
            return `
                <circle cx="468" cy="366" r="48" fill="${fill}" stroke="${stroke}" stroke-width="10"/>
                <circle cx="734" cy="366" r="48" fill="${fill}" stroke="${stroke}" stroke-width="10"/>
                <circle cx="468" cy="366" r="20" fill="white" fill-opacity="0.45"/>
                <circle cx="734" cy="366" r="20" fill="white" fill-opacity="0.45"/>`;
        case 'cat':
            return `
                <path d="M454 402l32-96 66 62-98 34Z" fill="${fill}" stroke="${stroke}" stroke-width="10" stroke-linejoin="round"/>
                <path d="M748 402l-32-96-66 62 98 34Z" fill="${fill}" stroke="${stroke}" stroke-width="10" stroke-linejoin="round"/>`;
        case 'horn':
            return `
                <path d="M497 396c-2-46 18-84 56-108-6 42 2 78 22 106" fill="${fill}" stroke="${stroke}" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M705 396c2-46-18-84-56-108 6 42-2 78-22 106" fill="${fill}" stroke="${stroke}" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>`;
        case 'bunny':
        default:
            return `
                <rect x="448" y="278" width="54" height="154" rx="27" fill="${fill}" stroke="${stroke}" stroke-width="10"/>
                <rect x="700" y="278" width="54" height="154" rx="27" fill="${fill}" stroke="${stroke}" stroke-width="10"/>
                <rect x="465" y="312" width="18" height="84" rx="9" fill="white" fill-opacity="0.4"/>
                <rect x="717" y="312" width="18" height="84" rx="9" fill="white" fill-opacity="0.4"/>`;
    }
};

const renderFace = (face) => {
    switch (face) {
        case 'sleepy':
            return `
                <path d="M538 539c18-16 40-16 58 0" stroke="#2D2547" stroke-width="10" stroke-linecap="round"/>
                <path d="M666 539c18-16 40-16 58 0" stroke="#2D2547" stroke-width="10" stroke-linecap="round"/>
                <ellipse cx="629" cy="607" rx="16" ry="10" fill="#FF8CA1"/>`;
        case 'wink':
            return `
                <circle cx="561" cy="534" r="16" fill="#2D2547"/>
                <path d="M661 538c20-16 42-16 61 0" stroke="#2D2547" stroke-width="10" stroke-linecap="round"/>
                <path d="M597 615c23 22 57 22 80 0" stroke="#2D2547" stroke-width="10" stroke-linecap="round"/>
                <ellipse cx="629" cy="592" rx="14" ry="9" fill="#FF8CA1"/>`;
        case 'smile':
            return `
                <circle cx="561" cy="534" r="16" fill="#2D2547"/>
                <circle cx="697" cy="534" r="16" fill="#2D2547"/>
                <path d="M587 602c28 34 56 34 84 0" stroke="#2D2547" stroke-width="10" stroke-linecap="round"/>
                <ellipse cx="629" cy="580" rx="14" ry="10" fill="#FF8CA1"/>`;
        case 'soft':
        default:
            return `
                <circle cx="561" cy="534" r="16" fill="#2D2547"/>
                <circle cx="697" cy="534" r="16" fill="#2D2547"/>
                <path d="M603 592c17 14 29 14 46 0" stroke="#2D2547" stroke-width="10" stroke-linecap="round"/>
                <ellipse cx="629" cy="574" rx="12" ry="8" fill="#FF8CA1"/>`;
    }
};

const renderBlindBoxScene = ({
    title,
    subtitle,
    palette,
    badge,
    character,
    icon,
    edition,
}) => {
    const [primary, soft, dark] = palette;
    const sticker = edition === 'Collector' ? '#FFD166' : edition === 'Shimmer' ? '#9B8AFB' : '#FFFFFF';
    const boxTone = edition === 'Collector' ? dark : primary;
    const sideTone = edition === 'Collector' ? primary : dark;
    const topTone = edition === 'Shimmer' ? '#FFF8FF' : '#FFF7F1';
    const mascotFill = edition === 'Collector' ? '#FFF4D0' : '#FFF8F4';
    const accentFill = edition === 'Shimmer' ? '#FFFFFF' : soft;

    return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="1200" height="1200" viewBox="0 0 1200 1200" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="70" y1="40" x2="1110" y2="1160" gradientUnits="userSpaceOnUse">
      <stop stop-color="${primary}" />
      <stop offset="1" stop-color="${soft}" />
    </linearGradient>
    <linearGradient id="panel" x1="132" y1="126" x2="1080" y2="1080" gradientUnits="userSpaceOnUse">
      <stop stop-color="white" stop-opacity="0.3"/>
      <stop offset="1" stop-color="white" stop-opacity="0.14"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="1200" rx="72" fill="url(#bg)"/>
  <circle cx="980" cy="186" r="176" fill="${dark}" fill-opacity="0.13"/>
  <circle cx="202" cy="1028" r="212" fill="${dark}" fill-opacity="0.1"/>
  <circle cx="1034" cy="906" r="94" fill="white" fill-opacity="0.16"/>
  <rect x="92" y="92" width="1016" height="1016" rx="56" fill="url(#panel)" stroke="white" stroke-opacity="0.42" stroke-width="2"/>
  <rect x="120" y="110" width="204" height="74" rx="37" fill="${dark}" fill-opacity="0.84"/>
  <text x="214" y="157" text-anchor="middle" font-family="Poppins, Arial, sans-serif" font-size="32" font-weight="700" fill="white">${escapeXml(
      badge,
  )}</text>
  <rect x="878" y="118" width="170" height="58" rx="29" fill="${sticker}" fill-opacity="0.88"/>
  <text x="963" y="155" text-anchor="middle" font-family="Poppins, Arial, sans-serif" font-size="26" font-weight="700" fill="${dark}">${escapeXml(
      edition || 'Series 01',
  )}</text>
  ${renderAccent(character.accent, accentFill)}
  <ellipse cx="628" cy="916" rx="328" ry="64" fill="${dark}" fill-opacity="0.18"/>
  <ellipse cx="628" cy="900" rx="276" ry="44" fill="white" fill-opacity="0.15"/>
  <path d="M388 806h386v-268H388v268Z" fill="${boxTone}"/>
  <path d="M774 538l138 78v262L774 806V538Z" fill="${sideTone}" fill-opacity="0.94"/>
  <path d="M388 538l118-72h407l-139 72H388Z" fill="${topTone}"/>
  <path d="M774 538l139-72v150l-139-78Z" fill="${soft}" fill-opacity="0.78"/>
  <path d="M388 538l118-72 34 20-101 61-51-9Z" fill="${primary}" fill-opacity="0.62"/>
  <path d="M364 442l160 24-79 68-171-26 90-66Z" fill="${topTone}" stroke="${dark}" stroke-opacity="0.18" stroke-width="8" stroke-linejoin="round"/>
  <path d="M524 466l247-8-70 78-256-2 79-68Z" fill="white" fill-opacity="0.92" stroke="${dark}" stroke-opacity="0.1" stroke-width="6" stroke-linejoin="round"/>
  <path d="M771 458l142 8-116 76-96-6 70-78Z" fill="${soft}" fill-opacity="0.96" stroke="${dark}" stroke-opacity="0.08" stroke-width="6" stroke-linejoin="round"/>
  <rect x="424" y="574" width="314" height="188" rx="26" fill="white" fill-opacity="0.22"/>
  <rect x="454" y="605" width="254" height="36" rx="18" fill="${dark}" fill-opacity="0.82"/>
  <text x="581" y="629" text-anchor="middle" font-family="Poppins, Arial, sans-serif" font-size="21" font-weight="700" fill="white">${escapeXml(
      icon,
  )} TOYVERSE</text>
  <rect x="454" y="660" width="144" height="34" rx="17" fill="${sticker}" fill-opacity="0.9"/>
  <text x="526" y="683" text-anchor="middle" font-family="Poppins, Arial, sans-serif" font-size="18" font-weight="700" fill="${dark}">${escapeXml(
      edition || 'Series 01',
  )}</text>
  <text x="454" y="733" font-family="Poppins, Arial, sans-serif" font-size="24" font-weight="700" fill="${dark}" fill-opacity="0.88">${escapeXml(
      character.name,
  )}</text>
  <text x="454" y="759" font-family="Poppins, Arial, sans-serif" font-size="16" font-weight="600" fill="${dark}" fill-opacity="0.62">mystery blind box</text>
  <g transform="translate(548 446) scale(0.48)">
    ${renderEars(character.ear, mascotFill, dark)}
    <circle cx="600" cy="494" r="168" fill="${mascotFill}" stroke="${dark}" stroke-opacity="0.08" stroke-width="10"/>
    <ellipse cx="600" cy="620" rx="122" ry="98" fill="white" fill-opacity="0.26"/>
    ${renderFace(character.face)}
    <circle cx="515" cy="566" r="18" fill="#FFB4C5" fill-opacity="0.72"/>
    <circle cx="744" cy="566" r="18" fill="#FFB4C5" fill-opacity="0.72"/>
    <circle cx="445" cy="434" r="14" fill="white" fill-opacity="0.7"/>
    <circle cx="772" cy="452" r="12" fill="white" fill-opacity="0.7"/>
  </g>
  <rect x="801" y="634" width="78" height="172" rx="22" fill="white" fill-opacity="0.14"/>
  <text x="840" y="666" text-anchor="middle" font-family="Poppins, Arial, sans-serif" font-size="18" font-weight="700" fill="white" transform="rotate(90 840 666)">${escapeXml(
      character.name.toUpperCase(),
  )}</text>
  <circle cx="842" cy="762" r="28" fill="${sticker}" fill-opacity="0.9"/>
  <text x="842" y="770" text-anchor="middle" font-family="Poppins, Arial, sans-serif" font-size="16" font-weight="800" fill="${dark}">${escapeXml(
      icon,
  )}</text>
  <path d="M388 806l118 76h406l-138-76H388Z" fill="${soft}" fill-opacity="0.42"/>
  <path d="M774 806l138 76v-4l-138-72v0Z" fill="${dark}" fill-opacity="0.24"/>
  <path d="M388 538l386 0" stroke="${dark}" stroke-opacity="0.12" stroke-width="4"/>
  <path d="M388 806l386 0" stroke="${dark}" stroke-opacity="0.12" stroke-width="4"/>
  <path d="M774 538v268" stroke="white" stroke-opacity="0.18" stroke-width="4"/>
  <text x="120" y="980" font-family="Poppins, Arial, sans-serif" font-size="92" font-weight="700" fill="${dark}">${escapeXml(
      title,
  )}</text>
  <text x="120" y="1064" font-family="Poppins, Arial, sans-serif" font-size="38" font-weight="500" fill="${dark}" fill-opacity="0.88">${escapeXml(
      subtitle,
  )}</text>
  <rect x="120" y="196" width="270" height="270" rx="46" fill="white" fill-opacity="0.16"/>
  <text x="255" y="314" text-anchor="middle" font-family="Poppins, Arial, sans-serif" font-size="104" font-weight="700" fill="${dark}" fill-opacity="0.92">${escapeXml(
      icon,
  )}</text>
  <text x="255" y="380" text-anchor="middle" font-family="Poppins, Arial, sans-serif" font-size="28" font-weight="600" fill="${dark}" fill-opacity="0.72">MilkyBloom Toyverse</text>
</svg>`;
};

const createCatalog = () =>
    CATEGORY_TEMPLATES.map((category, categoryIndex) => ({
        ...category,
        order: categoryIndex + 1,
        items: category.products.map((name, productIndex) => {
            const basePrice = 159000 + categoryIndex * 30000 + productIndex * 18000;
            const productSlug = slugify(name);
            return {
                name,
                slug: productSlug,
                productIndex,
                mascot: getCharacterSpec(categoryIndex, productIndex),
                description: `${name} is part of our demo collectible catalog, created for a personal portfolio showcase. It combines playful design, giftable packaging, and a polished retail feel without copying any existing brand catalog.`,
                averageRating: Number((4.1 + ((categoryIndex + productIndex) % 6) * 0.12).toFixed(1)),
                totalUnitsSold: 18 + categoryIndex * 11 + productIndex * 7,
                isFeatured: productIndex % 2 === 0,
                status: 'Published',
                basePrice,
                editions: EDITIONS.map((edition, editionIndex) => ({
                    label: edition.label,
                    sku: `${category.slug.slice(0, 3).toUpperCase()}-${productSlug
                        .slice(0, 6)
                        .toUpperCase()}-${edition.label.slice(0, 3).toUpperCase()}`,
                    price: basePrice + edition.priceOffset,
                    stockQuantity: edition.stock + categoryIndex + productIndex,
                    unitsSold: edition.sold + productIndex + editionIndex,
                })),
            };
        }),
    }));

async function main() {
    if (!process.env.MONGO_URI) {
        throw new Error('MONGO_URI is required to seed the catalog');
    }

    const catalog = createCatalog();

    await mongoose.connect(process.env.MONGO_URI);

    console.log('Connected to MongoDB. Resetting catalog collections...');
    await Variant.deleteMany({});
    await Product.deleteMany({});
    await Category.deleteMany({});

    const summary = {
        categories: 0,
        products: 0,
        variants: 0,
        images: 0,
    };

    for (const categoryData of catalog) {
        const categoryImageUrl = await storeSvgAsset(
            renderBlindBoxScene({
                title: categoryData.name,
                subtitle: categoryData.description,
                icon: categoryData.icon,
                palette: categoryData.palette,
                badge: 'Category',
                character: getCharacterSpec(categoryData.order - 1, 0),
                edition: 'Series 01',
            }),
            `seed/demo/categories/${categoryData.slug}`,
            `${categoryData.slug}.svg`,
        );
        summary.images += 1;

        const categoryDoc = await Category.create({
            name: categoryData.name,
            slug: categoryData.slug,
            description: categoryData.description,
            imageUrl: categoryImageUrl,
            order: categoryData.order,
        });
        summary.categories += 1;

        for (const productData of categoryData.items) {
            const productImageUrl = await storeSvgAsset(
                renderBlindBoxScene({
                    title: productData.name,
                    subtitle: categoryData.name,
                    icon: categoryData.icon,
                    palette: categoryData.palette,
                    badge: 'Product',
                    character: productData.mascot,
                    edition: 'Classic',
                }),
                `seed/demo/products/${productData.slug}`,
                `${productData.slug}.svg`,
            );
            const productDetailUrl = await storeSvgAsset(
                renderBlindBoxScene({
                    title: `${productData.name} Display`,
                    subtitle: `${productData.mascot.name} in a dreamy shelf scene`,
                    icon: categoryData.icon,
                    palette: rotatePalette(categoryData.palette),
                    badge: 'Detail',
                    character: productData.mascot,
                    edition: 'Collector',
                }),
                `seed/demo/products/${productData.slug}`,
                `${productData.slug}-detail.svg`,
            );
            summary.images += 2;

            const productDoc = await Product.create({
                name: productData.name,
                slug: productData.slug,
                categoryId: [categoryDoc._id],
                description: productData.description,
                attributes: [
                    {
                        name: 'Edition',
                        values: productData.editions.map((edition) => edition.label),
                    },
                ],
                imageUrls: [productImageUrl, productDetailUrl],
                averageRating: productData.averageRating,
                status: productData.status,
                isFeatured: productData.isFeatured,
                totalUnitsSold: productData.totalUnitsSold,
                variants: [],
            });
            summary.products += 1;

            const variantIds = [];

            for (const edition of productData.editions) {
                const editionSlug = slugify(edition.label);
                const variantImageUrl = await storeSvgAsset(
                    renderBlindBoxScene({
                        title: `${productData.name} ${edition.label}`,
                        subtitle: `${categoryData.name} edition`,
                        icon: edition.label.slice(0, 2).toUpperCase(),
                        palette: categoryData.palette,
                        badge: 'Variant',
                        character: getCharacterSpec(
                            categoryData.order - 1,
                            productData.productIndex,
                            EDITIONS.findIndex((item) => item.label === edition.label),
                        ),
                        edition: edition.label,
                    }),
                    `seed/demo/products/${productData.slug}`,
                    `${productData.slug}-${editionSlug}.svg`,
                );
                summary.images += 1;

                const variantDoc = await Variant.create({
                    productId: productDoc._id,
                    sku: edition.sku,
                    attributes: [{ name: 'Edition', value: edition.label }],
                    weight: 320 + categoryData.order * 25,
                    price: edition.price,
                    stockQuantity: edition.stockQuantity,
                    imageUrls: [variantImageUrl, productImageUrl],
                    unitsSold: edition.unitsSold,
                    isActive: true,
                });

                variantIds.push(variantDoc._id);
                summary.variants += 1;
            }

            await Product.findByIdAndUpdate(productDoc._id, {
                $set: {
                    variants: variantIds,
                    totalUnitsSold: productData.editions.reduce(
                        (sum, edition) => sum + edition.unitsSold,
                        0,
                    ),
                },
            });

            await Variant.recalculateProductData(productDoc._id);
        }
    }

    console.log('Seed complete:', summary);
    await mongoose.disconnect();
}

main().catch(async (error) => {
    console.error('Failed to seed demo catalog:', error);
    try {
        await mongoose.disconnect();
    } catch (_disconnectError) {
        // Ignore disconnect errors on failure paths.
    }
    process.exit(1);
});
