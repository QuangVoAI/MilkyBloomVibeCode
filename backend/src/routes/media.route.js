const express = require('express');
const authMiddleware = require('../middlewares/auth.middleware');
const adminOnly = require('../middlewares/admin.middleware');
const { strictApiLimiter } = require('../middlewares/rateLimit.middleware');
const { uploadBannerVideoFile } = require('../middlewares/upload.middleware');
const {
    getActiveBannerVideo,
    streamImage,
    streamVideo,
    uploadBannerVideo,
} = require('../controllers/media.controller');

const router = express.Router();

router.get('/banner-video', getActiveBannerVideo);
router.get('/images/:id/stream', streamImage);
router.get('/videos/:id/stream', streamVideo);

router.use(authMiddleware);
router.use(adminOnly);
router.post('/banner-video', strictApiLimiter, uploadBannerVideoFile, uploadBannerVideo);

module.exports = router;
