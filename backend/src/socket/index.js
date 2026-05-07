const socketIo = require('socket.io');
const jwt = require('jsonwebtoken');
const { streamAgenticChat } = require('../services/agentic-stream.service');
const { streamLocalChat } = require('../services/local-stream.service');

let io;

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
            const authToken = socket.handshake.auth?.token || socket.handshake.query?.token || '';
            let decodedUser = null;
            if (authToken && process.env.JWT_SECRET) {
                try {
                    decodedUser = jwt.verify(authToken, process.env.JWT_SECRET);
                } catch (_err) {
                    decodedUser = null;
                }
            }

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

                if (!message) {
                    socket.emit('chat_error', {
                        sessionId,
                        message: 'message is required',
                    });
                    return;
                }

                if (!['agentic', 'local'].includes(provider)) {
                    socket.emit('chat_error', {
                        sessionId,
                        message: 'Only local and agentic streaming are supported over websocket right now.',
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
                            socket.emit('chat_error', {
                                sessionId,
                                message: error.message || `${provider} AI error`,
                                raw: data || null,
                            });
                        },
                    };

                    if (provider === 'local') {
                        await streamLocalChat({
                            ...basePayload,
                            systemPrompt: process.env.CHAT_SYSTEM_PROMPT || '',
                        });
                        return;
                    }

                    await streamAgenticChat({
                        ...basePayload,
                        shopContext: {
                            auth_token: authToken,
                            user_id: decodedUser?.id || decodedUser?._id || '',
                            email: decodedUser?.email || '',
                            role: decodedUser?.role || '',
                        },
                    });
                } catch (error) {
                    socket.emit('chat_error', {
                        sessionId,
                        message: error.message || `${provider} AI streaming failed`,
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
