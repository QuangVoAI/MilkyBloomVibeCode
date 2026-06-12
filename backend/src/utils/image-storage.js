/**
 * Store images in MongoDB GridFS and return public stream URLs.
 * This keeps image binaries fully inside Mongo while exposing a stable
 * backend URL that the frontend can render directly.
 */
const { uploadBuffer, deleteFile } = require('../libs/gridfs');
const { getBackendUrl } = require('../config/runtime');
const MEDIA_PATH_PREFIX = '/api/media/';

const optimizeImage = async (buffer, mimetype, folder) => {
    if (!mimetype || !mimetype.startsWith('image/')) {
        return { buffer, mimetype: mimetype || 'application/octet-stream' };
    }

    if (mimetype === 'image/svg+xml' || mimetype === 'image/gif') {
        return { buffer, mimetype };
    }

    try {
        const sharp = require('sharp');
        const maxWidth =
            folder.includes('banner') || folder.includes('hero') ? 1920 : 1200;

        const optimizedBuffer = await sharp(buffer)
            .resize(maxWidth, null, {
                withoutEnlargement: true,
                fit: 'inside',
            })
            .webp({
                quality: 80,
                effort: 4,
            })
            .toBuffer();

        return {
            buffer: optimizedBuffer,
            mimetype: 'image/webp',
        };
    } catch (error) {
        console.error('Image optimization failed:', error.message);
        return { buffer, mimetype };
    }
};

const buildImageStreamUrl = (fileId) => {
    const backendUrl = getBackendUrl();
    const path = `/api/media/images/${fileId.toString()}/stream`;
    return backendUrl ? `${backendUrl}${path}` : path;
};

const buildPublicMediaUrl = (path) => {
    const normalizedPath = String(path || '').trim();
    if (!normalizedPath.startsWith(MEDIA_PATH_PREFIX)) {
        return normalizedPath;
    }

    const backendUrl = getBackendUrl();
    return backendUrl ? `${backendUrl}${normalizedPath}` : normalizedPath;
};

const normalizePublicMediaUrl = (value) => {
    if (typeof value !== 'string') return value;

    const trimmed = value.trim();
    if (!trimmed) return value;

    if (trimmed.startsWith(MEDIA_PATH_PREFIX)) {
        return buildPublicMediaUrl(trimmed);
    }

    try {
        const parsed = new URL(trimmed);
        const isLocalHost = /^(localhost|127\.0\.0\.1|0\.0\.0\.0)$/i.test(
            parsed.hostname,
        );

        if (isLocalHost && parsed.pathname.startsWith(MEDIA_PATH_PREFIX)) {
            return buildPublicMediaUrl(`${parsed.pathname}${parsed.search}`);
        }
    } catch (_error) {
        return value;
    }

    return value;
};

const normalizePublicMediaUrlsDeep = (value) => {
    if (typeof value === 'string') {
        return normalizePublicMediaUrl(value);
    }

    if (Array.isArray(value)) {
        return value.map((item) => normalizePublicMediaUrlsDeep(item));
    }

    if (value && typeof value.toObject === 'function') {
        return normalizePublicMediaUrlsDeep(value.toObject());
    }

    if (
        value &&
        typeof value === 'object' &&
        !(value instanceof Date) &&
        !Buffer.isBuffer(value)
    ) {
        return Object.fromEntries(
            Object.entries(value).map(([key, entry]) => [
                key,
                normalizePublicMediaUrlsDeep(entry),
            ]),
        );
    }

    return value;
};

const storeImages = async (files, folder = 'Uncategorized') => {
    const uploadPromises = files.map(async (file, index) => {
        const { buffer, mimetype } = await optimizeImage(
            file.buffer,
            file.mimetype,
            folder,
        );
        const uploaded = await uploadBuffer({
            buffer,
            filename: file.originalname || `${folder}-${index + 1}`,
            contentType: mimetype,
            metadata: {
                folder,
                originalname: file.originalname || '',
            },
        });

        return buildImageStreamUrl(uploaded._id);
    });

    return Promise.all(uploadPromises);
};

const removeImages = async (urls = []) => {
    const list = Array.isArray(urls) ? urls : [urls];
    const tasks = list.map(async (url) => {
        const match = String(url || '').match(
            /\/api\/media\/images\/([a-fA-F0-9]{24})\/stream/,
        );
        if (!match?.[1]) return null;
        try {
            await deleteFile(match[1]);
            return match[1];
        } catch (error) {
            console.warn('[image-storage] Failed to delete image:', error.message);
            return null;
        }
    });

    return Promise.all(tasks);
};

module.exports = {
    storeImages,
    removeImages,
    optimizeImage,
    buildImageStreamUrl,
    normalizePublicMediaUrl,
    normalizePublicMediaUrlsDeep,
};
