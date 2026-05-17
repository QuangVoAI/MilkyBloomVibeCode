const dotenv = require('dotenv');
if (process.env.NODE_ENV !== 'production') {
    require('dotenv').config();
}

const crypto = require('crypto');
const os = require('os');
const cors = require('cors');
const express = require('express');
const compression = require('compression');
const http = require('http');
const session = require('express-session');
const { MongoStore } = require('connect-mongo');
const passport = require('passport');
const {
  getAllowedCorsOrigins,
  getSessionSecret,
  isRenderOrigin,
} = require('./config/runtime.js');
const {
  apiCacheMiddleware, 
  staticCacheMiddleware,
  imageCacheMiddleware 
} = require('./middlewares/cache.middleware.js');

const app = express(); // Tạo app

// Render sits behind a proxy, so rate limiting and IP-based middleware
// need the forwarded client IP to be trusted.
app.set('trust proxy', 1);

// ============================================
// HORIZONTAL SCALING SUPPORT
// ============================================
// Generate unique instance ID for load balancing verification
const INSTANCE_ID = `${os.hostname()}-${crypto.randomBytes(4).toString('hex')}`;

// Add instance ID to response headers (proves load balancing is working)
app.use((req, res, next) => {
    res.setHeader('X-Instance-ID', INSTANCE_ID);
    next();
});

// Enable ETag for conditional requests
app.set('etag', 'strong');

// Gzip/Brotli compression for all responses
app.use(compression({
    level: 6,
    threshold: 1024, // Only compress > 1KB
}));


const allowedOrigins = getAllowedCorsOrigins();
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin) || isRenderOrigin(origin)) {
      return callback(null, true);
    }
    return callback(new Error(`CORS origin not allowed: ${origin}`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'X-Session-Id', 'X-Guest-Session-Id'],
  exposedHeaders: ['X-Instance-ID'], // Allow frontend to read custom headers
}));

// Cache headers for better PageSpeed scores
app.use(staticCacheMiddleware); // Static files (.jpg, .png, .woff, etc.)
app.use(imageCacheMiddleware); // Image responses cached by extension
app.use('/api', apiCacheMiddleware); // API responses (no cache)

// ============================================
// SESSION CONFIGURATION (For OAuth flow only)
// ============================================
// NOTE: This app is STATELESS by design for horizontal scaling:
// - Authentication uses JWT tokens (stateless)
// - User data stored in MongoDB Atlas (shared)
// - Images stored in MongoDB GridFS with public stream URLs
// - Sessions only used temporarily during OAuth redirect flow
// For production with multiple instances, consider:
// - Using connect-mongo or connect-redis for session store
// - Or keep session: false in passport (already done)
app.use(
    session({
        secret: getSessionSecret(),
        resave: false,
        saveUninitialized: false,
        store: new MongoStore({
            mongoUrl: process.env.MONGO_URI,
            collectionName: 'sessions',
            ttl: 5 * 60,
        }),
        cookie: {
            secure: process.env.NODE_ENV === 'production',
            maxAge: 5 * 60 * 1000, // 5 minutes - only for OAuth flow
        },
    }),
);

//thêm passportFacebook
app.use(passport.initialize());
app.use(passport.session());

// Body parsers - skip for multipart/form-data (let multer handle it)
app.use((req, res, next) => {
    if (req.is('multipart')) {
        return next();
    }
    express.json({ limit: '50mb' })(req, res, next);
});

app.use((req, res, next) => {
    if (req.is('multipart')) {
        return next();
    }
    express.urlencoded({ extended: true, limit: '50mb' })(req, res, next);
});

app.use((req, res, next) => {
    //trình duyệt luôn dùng https
    res.setHeader(
        'Strict-Transport-Security',
        'max-age=31536000; includeSubDomains; preload',
    );
    next();
});

app.get('/verify-email', (req, res) => {
    const qs = new URLSearchParams(req.query).toString();
    res.redirect(302, `/api/auth/verify-email?${qs}`);
});

const server = http.createServer(app);

// Health check endpoint for load balancer
app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'healthy',
        instance: INSTANCE_ID,
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
    });
});

app.get('/', (req, res) => {
    res.status(200).json({
        message: 'MilkyBloom backend is running 🚀',
        instance: INSTANCE_ID,
        scalingReady: true,
    });
});

app.use((err, req, res, _next) => {
    const status = err.status || 500;
    res.status(status).json({
        success: false,
        message: err.message || 'Internal Server Error',
    });
});

app.get('/privacy', (req, res) => {
    res.send(
        '<h2>MilkyBloom Privacy Policy</h2><p>We respect your privacy...</p>',
    );
});

app.get('/delete-data', (req, res) => {
    res.send(
        '<h2>Data Deletion</h2><p>Contact vxq123@icloud.com to request deletion.</p>',
    );
});

const registerRoutes = () => {
    // Import routes only after the server is already listening.
    const productRoutes = require('./routes/product.route.js');
    const variantRoutes = require('./routes/variant.route.js');
    const userRoutes = require('./routes/user.route.js');
    const authRoutes = require('./routes/auth.route.js');
    const addressRoutes = require('./routes/address.route.js');
    const shippingRoutes = require('./routes/shipping.route.js');
    const paymentRoutes = require('./routes/payment.route.js');
    const cartRoutes = require('./routes/cart.route.js');
    const categoryRoutes = require('./routes/category.route.js');
    const orderRoutes = require('./routes/order.route.js');
    const reviewRoutes = require('./routes/review.route.js');
    const commentRoutes = require('./routes/comment.route.js');
    const loyaltyRoutes = require('./routes/loyalty.route.js');
    const discountRoutes = require('./routes/discount-code.routes.js');
    const voucherRoutes = require('./routes/voucher.route.js');
    const badgeRoutes = require("./routes/badge.route.js");
    const dashboardRoutes = require('./routes/dashboard.routes.js');
    const chatRoutes = require("./routes/chat.route.js");
    const supportTicketRoutes = require("./routes/support-ticket.route.js");
    const mediaRoutes = require('./routes/media.route.js');
    const errorHandler = require('./middlewares/error.middleware');

    app.use('/api/products', productRoutes);
    app.use('/api/variants', variantRoutes);
    app.use('/api/users', userRoutes);
    app.use('/api/auth', authRoutes);
    app.use('/api/addresses', addressRoutes);
    app.use('/api/shipping', shippingRoutes);
    app.use('/api/payments', paymentRoutes);
    app.use('/api/carts', cartRoutes);
    app.use('/api/categories', categoryRoutes);
    app.use('/api/orders', orderRoutes);
    app.use('/api/reviews', reviewRoutes);
    app.use('/api/comments', commentRoutes);
    app.use('/api/loyalty', loyaltyRoutes);
    app.use('/api/discount', discountRoutes);
    app.use('/api/vouchers', voucherRoutes);
    app.use("/api/badges", badgeRoutes);
    app.use('/api/dashboard', dashboardRoutes);
    app.use("/api/chat", chatRoutes);
    app.use("/api/support-tickets", supportTicketRoutes);
    app.use('/api/media', mediaRoutes);
    app.use(errorHandler);
};

const bootstrapBackgroundJobs = () => {
    try {
        require('./utils/event.cron.js');
        const monthlyJob = require('./utils/montly-loyalty.js');
        monthlyJob().catch((err) => {
            console.error('Monthly loyalty bootstrap failed:', err.message);
        });
    } catch (err) {
        console.error('Background job bootstrap failed:', err.message);
    }
};

// Kết nối db
const startServer = async () => {
    const PORT = process.env.PORT || 6969;
    server.listen(PORT, '0.0.0.0', async () => {
        console.log(`Backend listening on http://0.0.0.0:${PORT}`);

        setTimeout(() => {
            try {
                const socket = require('./socket/index');
                socket.init(server);
            } catch (err) {
                console.error('Socket bootstrap failed:', err.message);
            }
        }, 0);

        try {
            console.log('Connecting to MongoDB...');
            const connectDB = require('./config/db.js');
            await connectDB();
            console.log('MongoDB connected');

            registerRoutes();
            bootstrapBackgroundJobs();
        } catch (err) {
            console.error('MongoDB bootstrap failed:', err.message);
            process.exit(1);
        }
    });
};

startServer();
