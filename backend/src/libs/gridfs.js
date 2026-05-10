const mongoose = require('mongoose');
const { Readable } = require('stream');

const BUCKET_NAME = 'media';

const getBucket = () => {
    if (!mongoose.connection?.db) {
        throw new Error('MongoDB connection is not ready');
    }

    return new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
        bucketName: BUCKET_NAME,
    });
};

const uploadBuffer = ({ buffer, filename, contentType, metadata = {} }) =>
    new Promise((resolve, reject) => {
        const bucket = getBucket();
        const uploadStream = bucket.openUploadStream(filename, {
            contentType,
            metadata,
        });

        Readable.from(buffer)
            .pipe(uploadStream)
            .on('error', reject)
            .on('finish', async () => {
                try {
                    const file = await bucket
                        .find({ _id: uploadStream.id })
                        .next();
                    resolve(
                        file || {
                            _id: uploadStream.id,
                            filename,
                            contentType,
                            metadata,
                        },
                    );
                } catch (err) {
                    reject(err);
                }
            });
    });

const deleteFile = async (fileId) => {
    const bucket = getBucket();
    await bucket.delete(new mongoose.Types.ObjectId(fileId));
};

const findFile = async (fileId) => {
    const bucket = getBucket();
    return bucket.find({ _id: new mongoose.Types.ObjectId(fileId) }).next();
};

module.exports = {
    BUCKET_NAME,
    deleteFile,
    findFile,
    getBucket,
    uploadBuffer,
};
