const socketIo = require('socket.io');
const jwt = require('jsonwebtoken');
const { streamAgenticChat } = require('../services/agentic-stream.service');

let io;

const CHAT_ERROR_FALLBACK = 'Mình đang gặp lỗi kết nối AI tạm thời. Bạn thử lại sau nhé.';
const CHAT_RATE_LIMIT_FALLBACK =
    'AI đang quá tải hoặc bị giới hạn lượt gọi tạm thời. Mình đã chuyển sang chế độ hỗ trợ nhanh, bạn thử lại sau ít phút nhé.';

const CHAT_LOGIN_REQUIRED_FOR_CHECKOUT =
    'Để tránh sai thông tin đơn hàng, bạn đăng nhập trước khi mình tạo đơn nhé. Sau khi đăng nhập, bạn có thể quay lại giỏ hàng hoặc nhắn mình tiếp để checkout.';

const CHAT_RATE_LIMIT_WINDOW_MS = Number(process.env.CHAT_RATE_LIMIT_WINDOW_MS || 60000);
const CHAT_RATE_LIMIT_MAX = Number(process.env.CHAT_RATE_LIMIT_MAX || 20);
const chatRateBuckets = new Map();

const parseOriginList = (value) =>
    String(value || '')
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean);

const getAllowedSocketOrigins = () => {
    const configured = [
        ...parseOriginList(process.env.SOCKET_CORS_ORIGIN),
        ...parseOriginList(process.env.FRONTEND_URL),
        ...parseOriginList(process.env.CLIENT_URL),
        ...parseOriginList(process.env.CORS_ORIGIN),
    ];
    if (configured.length) return [...new Set(configured)];
    if (process.env.NODE_ENV === 'production') return [];
    return ['http://localhost:5173', 'http://127.0.0.1:5173'];
};

const socketCorsOrigin = (origin, callback) => {
    const allowedOrigins = getAllowedSocketOrigins();
    if (!origin && process.env.NODE_ENV !== 'production') {
        callback(null, true);
        return;
    }
    if (origin && allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
    }
    callback(new Error('Socket origin is not allowed by CORS'), false);
};

const checkChatRateLimit = (socketId, userId) => {
    const now = Date.now();
    const key = userId ? `user:${userId}` : `socket:${socketId}`;
    const current = chatRateBuckets.get(key);
    const bucket =
        current && current.resetAt > now
            ? current
            : { count: 0, resetAt: now + CHAT_RATE_LIMIT_WINDOW_MS };

    bucket.count += 1;
    chatRateBuckets.set(key, bucket);

    if (bucket.count <= CHAT_RATE_LIMIT_MAX) {
        return { limited: false, key };
    }

    return {
        limited: true,
        key,
        retryAfter: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
    };
};

const normalizeChatText = (value) =>
    String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd')
        .replace(/Đ/g, 'D')
        .replace(/đ/g, 'd')
        .replace(/Đ/g, 'D')
        .toLowerCase();

const hasCheckoutNegation = (text) =>
    /\b(chua dat hang|chua thanh toan|chua checkout|khong dat hang|khong checkout|khong thanh toan|chi tu van|tu van thoi|tham khao|advice only|recommend only|suggest only|dont checkout|do not checkout|no checkout|not checkout|dont order|do not order|not order|not buy yet)\b/.test(text);

const isCheckoutCreationRequest = (message) => {
    const text = normalizeChatText(message);
    if (!text) return false;

    if (hasCheckoutNegation(text)) {
        return false;
    }

    if (/\b(huy don|huy order|cancel order|doi dia chi|hoan tien|doi tra|tra hang|kiem tra don|tra cuu don|theo doi don|tracking|refund|return order)\b/.test(text)) {
        return false;
    }

    if (
        /\b(thanh toan|payment|pay)\b/.test(text) &&
        /\b(duoc khong|co duoc|phuong thuc|hinh thuc|nao|momo|cod|chuyen khoan|visa|the|card|payment method|pay by)\b/.test(text) &&
        !/\b(checkout|dat hang|tao don|len don|chot don|xac nhan|tien hanh|luon)\b/.test(text)
    ) {
        return false;
    }

    if (/\b(goi y|tu van|suggest|recommend|advice|advise|duoi|tam|khoang|ngan sach|budget|chua biet|phan van|nen mua|chon gi|chon mon nao|mua gi)\b/.test(text)) {
        return false;
    }

    if (/\b(dat hang|tao don|len don|chot don|checkout|thanh toan luon|tien hanh thanh toan|di den thanh toan|buy now|place order|create order)\b/.test(text)) {
        return true;
    }

    const hasQuantity = /\b(\d+|mot|hai|ba|bon|nam)\b/.test(text);
    const hasItemCue = /\b(stardust|picnic|box|classic|capsule|toy|do choi|san pham|loai|mau|size)\b/.test(text);
    const hasDirectBuyCue = /\b(cho minh|giup minh|lay|chon|them vao gio|chot)\b/.test(text);

    if (/\b(dat|order)\b/.test(text) && (hasQuantity || hasItemCue || hasDirectBuyCue)) {
        return true;
    }

    if (/\bmua\b/.test(text) && (hasQuantity || hasItemCue || hasDirectBuyCue)) {
        return true;
    }

    return hasQuantity && hasItemCue && hasDirectBuyCue;
};

const hasRecentCheckoutLoginPrompt = (history = []) =>
    history.slice(-6).some((item) => {
        if (!item || item.role !== 'assistant') return false;
        const content = normalizeChatText(item.content);
        return content.includes('dang nhap truoc khi minh tao don');
    });

const hasRecentCatalogPrompt = (history = []) =>
    history.slice(-6).some((item) => {
        if (!item || item.role !== 'assistant') return false;
        const content = normalizeChatText(item.content);
        return /\b(goi y|chon mon|chon san pham|stardust|picnic|capsule|box|danh sach)\b/.test(content);
    });

const isCatalogPurchaseFollowup = (message) => {
    const text = normalizeChatText(message);
    if (!text) return false;
    if (/\b(xem|chi tiet|thong tin|gia|con hang|so sanh)\b/.test(text)) {
        return false;
    }
    return /\b(cho minh|lay|mua|chon|chot|dat|ok)\b/.test(text) && /\b(dau tien|so 1|muc 1|mon nay|cai nay)\b/.test(text);
};

const isCheckoutContactFollowup = (message) => {
    const text = normalizeChatText(message);
    if (!text) return false;

    const hasContactInfo =
        /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/.test(text) ||
        /(?:\+?84|0|1)(?:[\s.-]?\d){8,10}\b/.test(text);

    return hasContactInfo && /\b(ten|email|sdt|so dien thoai|dien thoai|dia chi|address)\b/.test(text);
};

const sanitizeChatErrorMessage = (value) => {
    const text = String(value || '').trim();
    if (!text) return CHAT_ERROR_FALLBACK;

    // Never expose API keys or raw provider URLs in the chat surface.
    if (
        /\/chat\/completions/i.test(text) ||
        /\b(?:sk|gsk|pk)-[A-Za-z0-9][A-Za-z0-9._-]{8,}\b/i.test(text) ||
        /Bearer\s+[A-Za-z0-9._~+/=-]+/i.test(text)
    ) {
        return CHAT_ERROR_FALLBACK;
    }

    const redacted = text
        .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer ***')
        .replace(/\b(?:sk|gsk|pk)-[A-Za-z0-9][A-Za-z0-9._-]{8,}\b/gi, '***')
        .replace(/https?:\/\/[^\s]+/gi, '***');

    return redacted || CHAT_ERROR_FALLBACK;
};

const buildFallbackReply = (message) => {
    const text = String(message || '').toLowerCase();
    const budgetMatch = text.match(/(?:dưới|khoảng|tầm|ngân sách|budget|mua|đơn hàng)?\s*(\d+(?:[.,]\d+)?)\s*(k|nghìn|ngàn|000|tr|triệu)?/i);
    if (budgetMatch && /(mua|sản phẩm|món|đồ|budget|ngân sách|giá|k|nghìn|ngàn|tr|triệu|đơn hàng)/i.test(text)) {
        const amount = budgetMatch[2] === 'tr' || budgetMatch[2] === 'triệu'
            ? `${budgetMatch[1]} triệu`
            : `${budgetMatch[1]}k`;
        return `AI đang quá tải tạm thời, nhưng với ngân sách khoảng ${amount}, bạn có thể vào trang Sản phẩm và lọc theo giá để chọn món phù hợp. Nếu muốn mình gợi ý sát hơn, bạn nhắn thêm chủ đề hoặc độ tuổi người nhận nhé.`;
    }

    if (/(sản phẩm|món|đồ|budget|ngân sách|giá|300k|500k|dưới\s*\d)/i.test(text)) {
        return 'Mình đang bị lỗi AI tạm thời, nhưng mình vẫn có thể gợi ý sản phẩm nếu bạn cho mình biết ngân sách, độ tuổi hoặc chủ đề bạn thích nhé.';
    }

    if (/(đơn|order|tracking|mã đơn|email|phone|số điện thoại|tra cứu)/i.test(text)) {
        return 'Mình đang bị lỗi AI tạm thời, nhưng mình vẫn có thể hỗ trợ tra đơn nếu bạn gửi mã đơn, email hoặc số điện thoại đã đặt hàng nhé.';
    }

    return 'Mình đang bị lỗi AI tạm thời, nhưng mình vẫn có thể giúp bạn hỏi về sản phẩm, đơn hàng, vận chuyển, đổi trả hoặc chính sách.';
};

const buildFallbackActions = (message) => {
    const text = normalizeChatText(message);
    const actions = [
        {
            type: 'retry',
            label: 'Thử lại',
            value: String(message || ''),
        },
    ];

    if (/\b(san pham|mon|do choi|goi y|budget|ngan sach|gia|mua|chon)\b/.test(text)) {
        actions.push({
            type: 'navigate',
            label: 'Xem sản phẩm',
            path: '/products',
        });
    }

    if (/\b(don|order|tracking|ma don|tra cuu|email|so dien thoai|phone)\b/.test(text)) {
        actions.push({
            type: 'navigate',
            label: 'Xem đơn hàng',
            path: '/order-history',
        });
    }

    return actions;
};

/**
 * ============================================
 * SOCKET.IO CONFIGURATION
 * ============================================
 * 
 * HORIZONTAL SCALING NOTE:
 * Current setup works for single instance or AWS ALB with sticky sessions.
 * 
 * For full multi-instance support without sticky sessions, add Redis adapter:
 * 1. npm install @socket.io/redis-adapter redis
 * 2. const { createAdapter } = require('@socket.io/redis-adapter');
 * 3. io.adapter(createAdapter(pubClient, subClient));
 * 
 * AWS Elastic Beanstalk with ALB sticky sessions enabled will work fine
 * as each user stays connected to the same instance.
 */

module.exports = {
    // Hàm khởi tạo (Gọi bên app.js)
    init: (httpServer) => {
        io = socketIo(httpServer, {
            cors: {
                origin: socketCorsOrigin,
                methods: ['GET', 'POST'],
            },
            // Enable sticky session support for horizontal scaling
            transports: ['websocket', 'polling'],
        });

        io.on('connection', (socket) => {
            const connectionAuthToken = socket.handshake.auth?.token || socket.handshake.query?.token || '';

            const decodeUserToken = (token) => {
                if (!token || !process.env.JWT_SECRET) {
                    return null;
                }
                try {
                    return jwt.verify(token, process.env.JWT_SECRET);
                } catch (_err) {
                    return null;
                }
            };

            const connectionDecodedUser = decodeUserToken(connectionAuthToken);

            // --- QUAN TRỌNG: SỰ KIỆN JOIN ROOM ---
            // Khi Frontend login xong, nó sẽ gửi event này kèm userId
            socket.on('join_user_room', (userId) => {
                if (userId) {
                    const roomName = `user_${userId}`;
                    socket.join(roomName);
                }
            });

            // Join product room for real-time reviews/comments
            socket.on('join_product_room', (productId) => {
                if (productId) {
                    const roomName = `product_${productId}`;
                    socket.join(roomName);
                }
            });

            // Leave product room
            socket.on('leave_product_room', (productId) => {
                if (productId) {
                    const roomName = `product_${productId}`;
                    socket.leave(roomName);
                }
            });

            socket.on('chat_message', async (payload = {}) => {
                const message = payload.message || '';
                const history = Array.isArray(payload.history) ? payload.history : [];
                const sessionId = payload.sessionId || payload.session_id || socket.id;
                const provider = String(payload.provider || 'agentic').toLowerCase();
                const effectiveProvider = provider === 'auto' ? 'agentic' : provider;
                const providerLabel = effectiveProvider === 'agentic' ? 'Groq' : effectiveProvider;
                const payloadAuthToken = payload.authToken || payload.auth_token || '';
                const messageAuthToken = payloadAuthToken || connectionAuthToken;
                const decodedUser = decodeUserToken(messageAuthToken) || (
                    messageAuthToken === connectionAuthToken ? connectionDecodedUser : null
                );
                const verifiedAuthToken = !process.env.JWT_SECRET || decodedUser
                    ? messageAuthToken
                    : '';

                console.log(
                    `[chat_message] session=${sessionId} provider=${provider} effective=${effectiveProvider} label=${providerLabel} message="${message.slice(0, 80)}"`
                );

                if (!message) {
                    socket.emit('chat_error', {
                        sessionId,
                        message: 'message is required',
                    });
                    return;
                }

                if (!['agentic'].includes(effectiveProvider)) {
                    socket.emit('chat_error', {
                        sessionId,
                        message: 'Only Groq streaming is supported over websocket right now.',
                    });
                    return;
                }

                const chatRateLimit = checkChatRateLimit(
                    socket.id,
                    decodedUser?.id || decodedUser?._id || '',
                );
                if (chatRateLimit.limited) {
                    socket.emit('chat_error', {
                        sessionId,
                        code: 'CHAT_RATE_LIMITED',
                        retryAfter: chatRateLimit.retryAfter,
                        message: 'Bạn nhắn hơi nhanh, thử lại sau ít giây nhé.',
                    });
                    return;
                }

                const shouldRequireLoginForCheckout =
                    !verifiedAuthToken &&
                    (
                        isCheckoutCreationRequest(message) ||
                        (hasRecentCheckoutLoginPrompt(history) && isCheckoutContactFollowup(message)) ||
                        (hasRecentCatalogPrompt(history) && isCatalogPurchaseFollowup(message))
                    );

                if (shouldRequireLoginForCheckout) {
                    socket.emit('chat_status', {
                        sessionId,
                        status: 'started',
                    });
                    socket.emit('chat_final', {
                        sessionId,
                        session_id: sessionId,
                        reply: CHAT_LOGIN_REQUIRED_FOR_CHECKOUT,
                        provider: 'socket-guard',
                        model: 'checkout-login-guard',
                        fallback: false,
                        checkout_result: {
                            needs_login: true,
                        },
                        agent_trace: {
                            capability: 'checkout',
                            checkout_guard: 'login_required',
                        },
                    });
                    return;
                }

                socket.emit('chat_status', {
                    sessionId,
                    status: 'started',
                });

                let fallbackSent = false;
                const emitFallback = (reason, raw = null) => {
                    if (fallbackSent) return;
                    fallbackSent = true;
                    socket.emit('chat_final', {
                        sessionId,
                        reply: buildFallbackReply(message),
                        action_buttons: buildFallbackActions(message),
                        actionButtons: buildFallbackActions(message),
                        provider: 'fallback',
                        model: 'fallback-message',
                        fallback: true,
                        fallback_reason: reason,
                        raw,
                    });
                };

                try {
                    const basePayload = {
                        message,
                        history,
                        sessionId,
                        onStatus: (data) => {
                            socket.emit('chat_status', data);
                        },
                        onToken: (data) => {
                            socket.emit('chat_token', data);
                        },
                        onFinal: (data) => {
                            socket.emit('chat_final', data);
                        },
                        onError: (error, data) => {
                            const safeMessage = sanitizeChatErrorMessage(
                                error?.message || `${providerLabel} AI error`,
                            );
                            const status = Number(error?.status || data?.status || 0);
                            const shouldFallback =
                                providerLabel === 'Groq' ||
                                status === 429 ||
                                /429|rate limit|too many requests|quota/i.test(String(error?.message || '')) ||
                                /groq|featherless|api error|stream error|\/chat\/completions/i.test(
                                    String(error?.message || ''),
                                ) ||
                                safeMessage === CHAT_ERROR_FALLBACK;

                            if (shouldFallback) {
                                emitFallback(
                                    status === 429 ? CHAT_RATE_LIMIT_FALLBACK : safeMessage,
                                    data || null,
                                );
                                return;
                            }

                            socket.emit('chat_error', {
                                sessionId,
                                message: safeMessage,
                                raw: data || null,
                            });
                        },
                    };

                    await streamAgenticChat({
                        ...basePayload,
                        shopContext: {
                            auth_token: verifiedAuthToken,
                            require_login_for_checkout: true,
                            order_lookup_token: payload.orderLookupToken || payload.order_lookup_token || '',
                            guest_session_id: payload.guestSessionId || payload.guest_session_id || '',
                            guest_info: payload.guestInfo || payload.guest_info || {},
                            user_id: decodedUser?.id || decodedUser?._id || '',
                            email: decodedUser?.email || payload.guestEmail || payload.guest_email || '',
                            user_name: decodedUser?.fullName || decodedUser?.name || '',
                            phone: decodedUser?.phone || '',
                            role: decodedUser?.role || '',
                            ownership_verified: Boolean(decodedUser?.id || decodedUser?._id),
                        },
                    });
                } catch (error) {
                    const status = Number(error?.status || 0);
                    const safeMessage = status === 429
                        ? CHAT_RATE_LIMIT_FALLBACK
                        : sanitizeChatErrorMessage(error?.message || `${providerLabel} AI streaming failed`);
                    console.warn(
                        `[chat_message] session=${sessionId} fallback: ${safeMessage}`,
                        {
                            status: error?.status || undefined,
                            retryAfter: error?.retryAfter || undefined,
                        },
                    );
                    emitFallback(safeMessage, error?.payload || null);
                }
            });

            socket.on('disconnect', () => {
                chatRateBuckets.delete(`socket:${socket.id}`);
            });
        });

        return io;
    },

    // Hàm lấy instance IO (Gọi bên Controller)
    getIO: () => {
        if (!io) {
            throw new Error('Socket.io not initialized!');
        }
        return io;
    },
};
