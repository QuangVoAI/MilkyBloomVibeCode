const INTERNAL_SERVICE_KEY = process.env.AI_INTERNAL_SERVICE_KEY || '';

const internalService = (req, res, next) => {
    const headerKey = req.headers['x-internal-service-key'];
    if (INTERNAL_SERVICE_KEY && headerKey && headerKey === INTERNAL_SERVICE_KEY) {
        req.internalService = true;
        return next();
    }

    return res.status(403).json({
        success: false,
        message: 'Forbidden: internal service only',
    });
};

module.exports = internalService;
