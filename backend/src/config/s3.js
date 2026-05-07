const { hasEnvValues, isProviderEnabled } = require('./runtime.js');

let cachedS3 = null;

const getS3 = () => {
    if (cachedS3) return cachedS3;

    const s3Configured = hasEnvValues(
        'AWS_BUCKET_REGION',
        'AWS_ACCESS_KEY_ID',
        'AWS_SECRET_ACCESS_KEY',
        'AWS_BUCKET_NAME',
    );

    if (!isProviderEnabled('S3_ENABLED', true) || !s3Configured) {
        return null;
    }

    const { S3 } = require('aws-sdk');
    cachedS3 = new S3({
        region: process.env.AWS_BUCKET_REGION,
        credentials: {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        },
    });

    return cachedS3;
};

module.exports = { getS3 };
