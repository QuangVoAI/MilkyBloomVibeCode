const socketIo = require('socket.io');
const jwt = require('jsonwebtoken');
const { streamAgenticChat } = require('../services/agentic-stream.service');

let io;

const CHAT_ERROR_FALLBACK = 'Mình đang gặp lỗi kết nối AI tạm thời. Bạn thử lại sau nhé.';

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
    if (/(sản phẩm|món|đồ|budget|ngân sách|giá|300k|500k|dưới\s*\d)/i.test(text)) {
        return 'Mình đang bị lỗi AI tạm thời, nhưng mình vẫn có thể gợi ý sản phẩm nếu bạn cho mình biết ngân sách, độ tuổi hoặc chủ đề bạn thích nhé.';
    }

    if (/(đơn|order|tracking|mã đơn|email|phone|số điện thoại|tra cứu)/i.test(text)) {
        return 'Mình đang bị lỗi AI tạm thời, nhưng mình vẫn có thể hỗ trợ tra đơn nếu bạn gửi mã đơn, email hoặc số điện thoại đã đặt hàng nhé.';
    }

    return 'Mình đang bị lỗi AI tạm thời, nhưng mình vẫn có thể giúp bạn hỏi về sản phẩm, đơn hàng, vận chuyển, đổi trả hoặc chính sách.';
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
                origin: '*', // Cho phép mọi nguồn (Frontend) kết nối. Khi deploy nhớ đổi lại domain cụ thể.
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

                socket.emit('chat_status', {
                    sessionId,
                    status: 'started',
                });

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
                            const shouldFallback =
                                providerLabel === 'Groq' ||
                                /groq|featherless|api error|stream error|\/chat\/completions/i.test(
                                    String(error?.message || ''),
                                ) ||
                                safeMessage === CHAT_ERROR_FALLBACK;

                            if (shouldFallback) {
                                socket.emit('chat_final', {
                                    sessionId,
                                    reply: buildFallbackReply(message),
                                    provider: 'fallback',
                                    model: 'fallback-message',
                                    fallback: true,
                                    fallback_reason: safeMessage,
                                    raw: data || null,
                                });
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
                    console.error(`[chat_message] session=${sessionId} failed:`, error);
                    socket.emit('chat_final', {
                        sessionId,
                        reply: buildFallbackReply(message),
                        provider: 'fallback',
                        model: 'fallback-message',
                        fallback: true,
                        fallback_reason: sanitizeChatErrorMessage(
                            error?.message || `${providerLabel} AI streaming failed`,
                        ),
                    });
                }
            });

            socket.on('disconnect', () => {
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
