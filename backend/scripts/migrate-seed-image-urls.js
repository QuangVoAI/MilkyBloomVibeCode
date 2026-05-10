const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const Category = require('../src/models/category.model');
const Product = require('../src/models/product.model');
const Variant = require('../src/models/variant.model');
const Review = require('../src/models/review.model');
const Comment = require('../src/models/comment.model');

const LEGACY_SEED_PREFIX = '/seed-images/';
const FALLBACK_PALETTE = ['#F78FB3', '#FDE2E4', '#C44569'];

function isLegacySeedUrl(value) {
    return typeof value === 'string' && value.startsWith(LEGACY_SEED_PREFIX);
}

function toAbsoluteLegacyPath(seedUrl) {
    return path.resolve(
        __dirname,
        '../../frontend/public',
        seedUrl.replace(LEGACY_SEED_PREFIX, ''),
    );
}

function toDataUrl(buffer, mimeType) {
    return `data:${mimeType};base64,${buffer.toString('base64')}`;
}

function getMimeType(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    switch (ext) {
        case '.svg':
            return 'image/svg+xml';
        case '.png':
            return 'image/png';
        case '.jpg':
        case '.jpeg':
            return 'image/jpeg';
        case '.webp':
            return 'image/webp';
        case '.gif':
            return 'image/gif';
        default:
            return 'application/octet-stream';
    }
}

function slugToTitle(value) {
    return String(value || '')
        .split(/[-_/]+/)
        .filter(Boolean)
        .map(
            (segment) =>
                segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase(),
        )
        .join(' ');
}

function buildFallbackSvg(seedUrl) {
    const relativePath = seedUrl.replace(LEGACY_SEED_PREFIX, '');
    const title = slugToTitle(path.basename(relativePath, path.extname(relativePath)));
    const subtitle = slugToTitle(path.dirname(relativePath)) || 'Legacy seed asset';
    const [primary, soft, dark] = FALLBACK_PALETTE;

    return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="1200" height="1200" viewBox="0 0 1200 1200" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="120" y1="80" x2="1080" y2="1120" gradientUnits="userSpaceOnUse">
      <stop stop-color="${primary}" />
      <stop offset="1" stop-color="${soft}" />
    </linearGradient>
  </defs>
  <rect width="1200" height="1200" rx="72" fill="url(#bg)"/>
  <rect x="104" y="104" width="992" height="992" rx="56" fill="white" fill-opacity="0.18" stroke="white" stroke-opacity="0.35" stroke-width="2"/>
  <circle cx="970" cy="214" r="130" fill="${dark}" fill-opacity="0.14"/>
  <circle cx="232" cy="980" r="172" fill="${dark}" fill-opacity="0.1"/>
  <text x="120" y="1000" font-family="Poppins, Arial, sans-serif" font-size="84" font-weight="700" fill="${dark}">${title}</text>
  <text x="120" y="1070" font-family="Poppins, Arial, sans-serif" font-size="34" font-weight="500" fill="${dark}" fill-opacity="0.8">${subtitle}</text>
  <rect x="120" y="160" width="260" height="64" rx="32" fill="${dark}" fill-opacity="0.84"/>
  <text x="250" y="202" text-anchor="middle" font-family="Poppins, Arial, sans-serif" font-size="26" font-weight="700" fill="white">Legacy Asset</text>
</svg>`;
}

async function resolveMigratedUrl(seedUrl) {
    if (!isLegacySeedUrl(seedUrl)) {
        return seedUrl;
    }

    const absolutePath = toAbsoluteLegacyPath(seedUrl);
    const hasLocalFile = fs.existsSync(absolutePath);
    const buffer = hasLocalFile
        ? fs.readFileSync(absolutePath)
        : Buffer.from(buildFallbackSvg(seedUrl), 'utf8');
    const mimeType = hasLocalFile ? getMimeType(absolutePath) : 'image/svg+xml';

    return toDataUrl(buffer, mimeType);
}

async function migrateArrayUrls(urls) {
    if (!Array.isArray(urls) || urls.length === 0) {
        return urls;
    }

    const migrated = [];
    let changed = false;

    for (const url of urls) {
        if (isLegacySeedUrl(url)) {
            changed = true;
            migrated.push(await resolveMigratedUrl(url));
        } else {
            migrated.push(url);
        }
    }

    return changed ? migrated : urls;
}

async function migrateCategories() {
    const categories = await Category.find({
        imageUrl: { $regex: '^/seed-images/' },
    });

    let updated = 0;
    for (const category of categories) {
        category.imageUrl = await resolveMigratedUrl(category.imageUrl);
        await category.save();
        updated += 1;
    }

    return updated;
}

async function migrateProducts() {
    const products = await Product.find({
        imageUrls: { $elemMatch: { $regex: '^/seed-images/' } },
    });

    let updated = 0;
    for (const product of products) {
        const nextUrls = await migrateArrayUrls(
            product.imageUrls,
        );

        if (nextUrls !== product.imageUrls) {
            product.imageUrls = nextUrls;
            await product.save();
            updated += 1;
        }
    }

    return updated;
}

async function migrateVariants() {
    const variants = await Variant.find({
        imageUrls: { $elemMatch: { $regex: '^/seed-images/' } },
    });

    let updated = 0;
    for (const variant of variants) {
        const nextUrls = await migrateArrayUrls(
            variant.imageUrls,
        );

        if (nextUrls !== variant.imageUrls) {
            variant.imageUrls = nextUrls;
            await variant.save();
            updated += 1;
        }
    }

    return updated;
}

async function migrateReviews() {
    const reviews = await Review.find({
        imageUrls: { $elemMatch: { $regex: '^/seed-images/' } },
    });

    let updated = 0;
    for (const review of reviews) {
        const nextUrls = await migrateArrayUrls(
            review.imageUrls,
        );

        if (nextUrls !== review.imageUrls) {
            review.imageUrls = nextUrls;
            await review.save();
            updated += 1;
        }
    }

    return updated;
}

async function migrateComments() {
    const comments = await Comment.find({
        imageUrls: { $elemMatch: { $regex: '^/seed-images/' } },
    });

    let updated = 0;
    for (const comment of comments) {
        const nextUrls = await migrateArrayUrls(
            comment.imageUrls,
        );

        if (nextUrls !== comment.imageUrls) {
            comment.imageUrls = nextUrls;
            await comment.save();
            updated += 1;
        }
    }

    return updated;
}

async function main() {
    if (!process.env.MONGO_URI) {
        throw new Error('MONGO_URI is required to migrate legacy seed image URLs');
    }

    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB. Migrating legacy seed image URLs...');

    const summary = {
        categories: await migrateCategories(),
        products: await migrateProducts(),
        variants: await migrateVariants(),
        reviews: await migrateReviews(),
        comments: await migrateComments(),
    };

    console.log('Migration complete:', summary);
    await mongoose.disconnect();
}

main().catch(async (error) => {
    console.error('Failed to migrate legacy seed image URLs:', error);
    try {
        await mongoose.disconnect();
    } catch (_disconnectError) {
        // Ignore disconnect errors on failure paths.
    }
    process.exit(1);
});
