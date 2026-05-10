const mongoose = require('mongoose');

const mediaAssetSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true,
        },
        kind: {
            type: String,
            enum: ['video'],
            required: true,
            index: true,
        },
        placement: {
            type: String,
            required: true,
            index: true,
        },
        fileId: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
            index: true,
        },
        filename: {
            type: String,
            required: true,
            trim: true,
        },
        mimeType: {
            type: String,
            required: true,
            trim: true,
        },
        size: {
            type: Number,
            default: 0,
        },
        isActive: {
            type: Boolean,
            default: true,
            index: true,
        },
        uploadedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            default: null,
        },
    },
    {
        timestamps: true,
        collection: 'media_assets',
    },
);

mediaAssetSchema.index(
    { placement: 1, isActive: 1, createdAt: -1 },
    { name: 'media_asset_active_lookup' },
);

module.exports = mongoose.model('MediaAsset', mediaAssetSchema);
