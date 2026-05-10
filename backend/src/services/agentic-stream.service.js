const normalizeUrl = (value) => String(value || '').trim().replace(/\/+$/, '');

const getAgenticWsUrl = () =>
    normalizeUrl(process.env.AGENTIC_AI_WS_URL || process.env.CHAT_AGENTIC_WS_URL || 'ws://127.0.0.1:8788');

const streamAgenticChat = async ({
    message,
    history = [],
    sessionId = '',
    shopContext = {},
    onStatus,
    onToken,
    onFinal,
    onError,
} = {}) => {
    const wsUrl = getAgenticWsUrl();
    if (!wsUrl) {
        throw new Error('AGENTIC_AI_WS_URL is not configured');
    }

    return new Promise((resolve, reject) => {
        let finished = false;
        let buffer = '';
        let socket = null;

        const finalize = (payload) => {
            if (finished) return;
            finished = true;
            try {
                socket?.close();
            } catch (_err) {
                // ignore
            }
            resolve(payload);
        };

        const fail = (error) => {
            if (finished) return;
            finished = true;
            try {
                socket?.close();
            } catch (_err) {
                // ignore
            }
            const err = error instanceof Error ? error : new Error(String(error || 'Agentic stream failed'));
            if (typeof onError === 'function') {
                onError(err);
            }
            reject(err);
        };

        try {
            socket = new WebSocket(wsUrl);
        } catch (err) {
            fail(err);
            return;
        }

        socket.addEventListener('open', () => {
            try {
                socket.send(JSON.stringify({
                    type: 'chat',
                    message,
                    history,
                    session_id: sessionId,
                    shop_context: shopContext,
                }));
            } catch (err) {
                fail(err);
            }
        });

        socket.addEventListener('message', (event) => {
            let data = null;
            try {
                data = JSON.parse(event.data);
            } catch (_err) {
                return;
            }

            if (data.type === 'status' && typeof onStatus === 'function') {
                onStatus(data);
                return;
            }

            if (data.type === 'token') {
                const chunk = data.content || '';
                buffer += chunk;
                if (typeof onToken === 'function') {
                    onToken({ ...data, content: chunk });
                }
                return;
            }

            if (data.type === 'final') {
                if (typeof onFinal === 'function') {
                    onFinal(data);
                }
                finalize({
                    reply: data.reply || buffer,
                    provider: data.provider || 'agentic',
                    model: data.model || 'empathai-langgraph',
                    raw: data,
                });
                return;
            }

            if (data.type === 'error') {
                const error = new Error(data.message || 'Agentic service error');
                if (typeof onError === 'function') {
                    onError(error, data);
                }
                fail(error);
            }
        });

        socket.addEventListener('error', (event) => {
            fail(event?.error || new Error('WebSocket error'));
        });

        socket.addEventListener('close', () => {
            if (!finished) {
                finalize({
                    reply: buffer,
                    provider: 'agentic',
                    model: 'empathai-langgraph',
                    raw: null,
                });
            }
        });
    });
};

module.exports = {
    getAgenticWsUrl,
    streamAgenticChat,
};
