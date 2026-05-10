/**
 * Optimize image before storing it in Mongo as a data URL.
 * - Resize large images when sharp is available
 * - Convert raster images to WebP to keep Mongo payload smaller
 * - Keep SVG / GIF / unsupported inputs untouched
 */
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

const bufferToDataUrl = (buffer, mimetype) =>
    `data:${mimetype};base64,${buffer.toString('base64')}`;

const storeImages = async (files, folder = 'Uncategorized') => {
    const uploadPromises = files.map(async (file) => {
        const { buffer, mimetype } = await optimizeImage(
            file.buffer,
            file.mimetype,
            folder,
        );
        return bufferToDataUrl(buffer, mimetype);
    });

    return Promise.all(uploadPromises);
};

const removeImages = async (_urls) => undefined;

module.exports = {
    storeImages,
    removeImages,
    optimizeImage,
    bufferToDataUrl,
};
