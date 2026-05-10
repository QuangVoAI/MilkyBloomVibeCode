const mongoose = require('mongoose');
const MediaAsset = require('../models/media-asset.model');
const { deleteFile, findFile, getBucket, uploadBuffer } = require('../libs/gridfs');
const { getBackendUrl } = require('../config/runtime');

const PRODUCTS_BANNER_PLACEMENT = 'products-banner';

const buildStreamUrl = (asset) =>
    `${getBackendUrl()}/api/media/videos/${asset.fileId.toString()}/stream`;

const buildImageStreamUrl = (fileId) => {
    const backendUrl = getBackendUrl();
    const path = `/api/media/images/${fileId.toString()}/stream`;
    return backendUrl ? `${backendUrl}${path}` : path;
};

const getActiveBannerVideo = async (_req, res, next) => {
    try {
        const asset = await MediaAsset.findOne({
            kind: 'video',
            placement: PRODUCTS_BANNER_PLACEMENT,
            isActive: true,
        })
            .sort({ updatedAt: -1, createdAt: -1 })
            .lean();

        if (!asset) {
            return res.json({ success: true, data: null });
        }

        return res.json({
            success: true,
            data: {
                _id: asset._id,
                name: asset.name,
                mimeType: asset.mimeType,
                size: asset.size,
                placement: asset.placement,
                isActive: asset.isActive,
                updatedAt: asset.updatedAt,
                streamUrl: buildStreamUrl(asset),
            },
        });
    } catch (error) {
        next(error);
    }
};

const uploadBannerVideo = async (req, res, next) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'No video file uploaded',
            });
        }

        const uploaded = await uploadBuffer({
            buffer: req.file.buffer,
            filename: req.file.originalname,
            contentType: req.file.mimetype,
            metadata: {
                placement: PRODUCTS_BANNER_PLACEMENT,
                uploadedBy: req.user?.id || null,
            },
        });

        const currentActiveAssets = await MediaAsset.find({
            kind: 'video',
            placement: PRODUCTS_BANNER_PLACEMENT,
            isActive: true,
        });

        await MediaAsset.updateMany(
            {
                kind: 'video',
                placement: PRODUCTS_BANNER_PLACEMENT,
                isActive: true,
            },
            { $set: { isActive: false } },
        );

        const asset = await MediaAsset.create({
            name: req.body?.name?.trim() || 'Products Banner Video',
            kind: 'video',
            placement: PRODUCTS_BANNER_PLACEMENT,
            fileId: uploaded._id,
            filename: uploaded.filename,
            mimeType: req.file.mimetype,
            size: req.file.size,
            isActive: true,
            uploadedBy: req.user?.id || null,
        });

        for (const oldAsset of currentActiveAssets) {
            try {
                await deleteFile(oldAsset.fileId);
                await MediaAsset.deleteOne({ _id: oldAsset._id });
            } catch (cleanupError) {
                console.warn(
                    '[media] Failed to remove previous banner video:',
                    cleanupError.message,
                );
            }
        }

        return res.status(201).json({
            success: true,
            data: {
                _id: asset._id,
                name: asset.name,
                mimeType: asset.mimeType,
                size: asset.size,
                placement: asset.placement,
                streamUrl: buildStreamUrl(asset),
            },
        });
    } catch (error) {
        next(error);
    }
};

const streamVideo = async (req, res, next) => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid video id',
            });
        }

        const file = await findFile(id);
        if (!file) {
            return res.status(404).json({
                success: false,
                message: 'Video not found',
            });
        }

        const bucket = getBucket();
        const range = req.headers.range;
        const contentType = file.contentType || 'video/mp4';

        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Cache-Control', 'public, max-age=3600');

        if (range) {
            const matches = /bytes=(\d*)-(\d*)/.exec(range);
            const start = matches?.[1] ? Number(matches[1]) : 0;
            const end = matches?.[2]
                ? Number(matches[2])
                : file.length - 1;

            if (
                Number.isNaN(start) ||
                Number.isNaN(end) ||
                start > end ||
                end >= file.length
            ) {
                return res.status(416).set({
                    'Content-Range': `bytes */${file.length}`,
                }).end();
            }

            res.status(206);
            res.set({
                'Content-Range': `bytes ${start}-${end}/${file.length}`,
                'Content-Length': end - start + 1,
                'Content-Type': contentType,
            });

            return bucket
                .openDownloadStream(file._id, { start, end: end + 1 })
                .on('error', next)
                .pipe(res);
        }

        res.set({
            'Content-Length': file.length,
            'Content-Type': contentType,
        });

        return bucket.openDownloadStream(file._id).on('error', next).pipe(res);
    } catch (error) {
        next(error);
    }
};

const streamImage = async (req, res, next) => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid image id',
            });
        }

        const file = await findFile(id);
        if (!file) {
            return res.status(404).json({
                success: false,
                message: 'Image not found',
            });
        }

        const bucket = getBucket();
        const contentType = file.contentType || 'image/jpeg';

        res.set({
            'Content-Type': contentType,
            'Content-Length': file.length,
            'Cache-Control': 'public, max-age=31536000, immutable',
            'Accept-Ranges': 'bytes',
        });

        return bucket.openDownloadStream(file._id).on('error', next).pipe(res);
    } catch (error) {
        next(error);
    }
};

module.exports = {
    getActiveBannerVideo,
    buildImageStreamUrl,
    streamVideo,
    streamImage,
    uploadBannerVideo,
};
