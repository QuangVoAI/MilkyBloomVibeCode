const { v4: uuidv4 } = require('uuid');
const { hasEnvValues, isProviderEnabled } = require('../config/runtime.js');

/**
 * Optimize image before upload
 * - Resize large images (max 1200px width for products, 1920px for banners)
 * - Convert to WebP format (60-80% smaller than JPEG/PNG)
 * - Apply quality compression
 */
const optimizeImage = async (buffer, mimetype, folder) => {
    // Skip non-image files
    if (!mimetype.startsWith('image/')) {
        return { buffer, mimetype, extension: '' };
    }

    // Skip SVG and GIF (animation)
    if (mimetype === 'image/svg+xml' || mimetype === 'image/gif') {
        return { buffer, mimetype, extension: '' };
    }

    try {
        const sharp = require('sharp');
        // Determine max width based on folder type
        const maxWidth = folder.includes('banner') || folder.includes('hero') ? 1920 : 1200;
        
        // Process image with sharp
        const optimizedBuffer = await sharp(buffer)
            .resize(maxWidth, null, { 
                withoutEnlargement: true, // Don't upscale small images
                fit: 'inside' 
            })
            .webp({ 
                quality: 80, // Good balance of quality vs size
                effort: 4   // Compression effort (0-6)
            })
            .toBuffer();

        return {
            buffer: optimizedBuffer,
            mimetype: 'image/webp',
            extension: '.webp'
        };
    } catch (error) {
        // If optimization fails, return original
        console.error('Image optimization failed:', error.message);
        return { buffer, mimetype, extension: '' };
    }
};

const uploadToS3 = async (files, folder = 'Uncategorized') => {
    const { getS3 } = require('../config/s3');
    const s3 = getS3();

    if (
        !isProviderEnabled('S3_ENABLED', true) ||
        !s3 ||
        !hasEnvValues('AWS_BUCKET_NAME')
    ) {
        throw new Error('S3 storage is not configured');
    }

    // Upload all files in parallel for better performance
    const uploadPromises = files.map(async (file) => {
        // Optimize image before upload
        const { buffer, mimetype, extension } = await optimizeImage(
            file.buffer, 
            file.mimetype, 
            folder
        );

        // Generate filename (replace original extension with .webp if converted)
        let filename = file.originalname;
        if (extension) {
            filename = filename.replace(/\.[^.]+$/, extension);
        }

        const params = {
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: `${folder}/${uuidv4()}-${filename}`,
            Body: buffer,
            ContentType: mimetype,
            // Cache headers for better PageSpeed scores
            // Images with UUID are immutable - cache for 1 year
            CacheControl: 'public, max-age=31536000, immutable',
            // Security header
            Metadata: {
                'cache-policy': 'immutable'
            }
        };

        const result = await s3.upload(params).promise();
        return result.Location;
    });

    const uploadedUrls = await Promise.all(uploadPromises);
    return uploadedUrls;
};

const deleteFromS3 = async (urls) => {
    const { getS3 } = require('../config/s3');
    const s3 = getS3();

    if (!isProviderEnabled('S3_ENABLED', true) || !s3) {
        return;
    }

    for (const url of urls) {
        try {
            const key = url.split('.amazonaws.com/')[1];
            if (!key) {
                console.warn('Could not extract key from URL:', url);
                continue;
            }

            const decodedKey = decodeURIComponent(key.replace(/\+/g, ' '));

            const params = {
                Bucket: process.env.AWS_BUCKET_NAME,
                Key: decodedKey,
            };

            await s3.deleteObject(params).promise();
        } catch (error) {
            console.error('❌ Error deleting image from S3:', error.message);
        }
    }
};

module.exports = { uploadToS3, deleteFromS3 };
