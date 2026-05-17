const normalizeUrl = (value) => String(value || '').trim().replace(/\/+$/, '');

const hasScheme = (value) => /^[a-z][a-z0-9+.-]*:\/\//i.test(value);

const resolveWebSocketUrl = (value) => {
    const trimmed = normalizeUrl(value);
    if (!trimmed) return '';
    if (trimmed.startsWith('ws://') || trimmed.startsWith('wss://')) {
        return trimmed;
    }
    if (trimmed.startsWith('http://')) {
        return `ws://${trimmed.slice('http://'.length)}`;
    }
    if (trimmed.startsWith('https://')) {
        return `wss://${trimmed.slice('https://'.length)}`;
    }
    if (!hasScheme(trimmed)) {
        const protocol = /^(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?(\/|$)/i.test(trimmed)
            ? 'ws'
            : 'wss';
        return `${protocol}://${trimmed}`;
    }
    return trimmed;
};

const getAgenticWsUrl = () =>
    resolveWebSocketUrl(
        process.env.AGENTIC_AI_WS_URL ||
        process.env.CHAT_AGENTIC_WS_URL ||
        'ws://127.0.0.1:8788',
    );

const getAgenticWsUrlCandidates = () => {
    const baseUrl = getAgenticWsUrl();
    if (!baseUrl) return [];

    const candidates = [baseUrl];
    const normalized = normalizeUrl(baseUrl);

    if (!/\/(?:ws|chat|chat\/ws|ws\/chat)(?:\/|$)/i.test(normalized)) {
        candidates.push(
            `${normalized}/ws`,
            `${normalized}/chat`,
            `${normalized}/chat/ws`,
            `${normalized}/ws/chat`,
        );
    }

    return [...new Set(candidates)];
};

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
    const wsUrls = getAgenticWsUrlCandidates();
    if (!wsUrls.length) {
        throw new Error('AGENTIC_AI_WS_URL is not configured');
    }

    return new Promise((resolve, reject) => {
        let finished = false;

        const fail = (error) => {
            if (finished) return;
            finished = true;
            const err = error instanceof Error ? error : new Error(String(error || 'Agentic stream failed'));
            if (typeof onError === 'function') {
                onError(err);
            }
            reject(err);
        };

        const tryNext = async (attemptIndex = 0, lastError = null) => {
            if (finished) return;
            const wsUrl = wsUrls[attemptIndex];
            if (!wsUrl) {
                fail(lastError || new Error('Agentic WebSocket endpoint unreachable'));
                return;
            }

            let buffer = '';
            let socket = null;
            let opened = false;
            let receivedFinal = false;
            let yieldedToken = false;

            const cleanup = () => {
                try {
                    socket?.close();
                } catch (_err) {
                    // ignore
                }
            };

            const finalize = (payload) => {
                if (finished) return;
                finished = true;
                cleanup();
                resolve(payload);
            };

            const retryOrFail = (error) => {
                if (finished) return;
                cleanup();
                const err = error instanceof Error ? error : new Error(String(error || 'Agentic stream failed'));
                if (opened && yieldedToken) {
                    fail(err);
                    return;
                }
                tryNext(attemptIndex + 1, err).catch(fail);
            };

            try {
                socket = new WebSocket(wsUrl);
            } catch (err) {
                retryOrFail(err);
                return;
            }

            socket.addEventListener('open', () => {
                opened = true;
                try {
                    socket.send(JSON.stringify({
                        type: 'chat',
                        message,
                        history,
                        session_id: sessionId,
                        shop_context: shopContext,
                    }));
                } catch (err) {
                    retryOrFail(err);
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
                    yieldedToken = yieldedToken || Boolean(chunk);
                    if (typeof onToken === 'function') {
                        onToken({ ...data, content: chunk });
                    }
                    return;
                }

                if (data.type === 'final') {
                    receivedFinal = true;
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
                    retryOrFail(error);
                }
            });

            socket.addEventListener('error', (event) => {
                retryOrFail(event?.error || new Error('WebSocket error'));
            });

            socket.addEventListener('close', () => {
                if (finished || receivedFinal) {
                    return;
                }
                retryOrFail(new Error('WebSocket closed before final response'));
            });
        };

        tryNext().catch(fail);
    });
};

module.exports = {
    getAgenticWsUrl,
    streamAgenticChat,
};
