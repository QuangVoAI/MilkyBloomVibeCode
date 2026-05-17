const WebSocket = require('ws');

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

    const TIMEOUT_MS = 120000; // 2 minute timeout
    const REQUEST_TIMEOUT_MS = 180000; // 3 minute total timeout

    return new Promise((resolve, reject) => {
        let finished = false;
        let timeoutHandle = null;
        let requestTimeoutHandle = null;

        const clearAllTimeouts = () => {
            if (timeoutHandle) clearTimeout(timeoutHandle);
            if (requestTimeoutHandle) clearTimeout(requestTimeoutHandle);
        };

        const fail = (error) => {
            if (finished) return;
            finished = true;
            clearAllTimeouts();
            const err = error instanceof Error ? error : new Error(String(error || 'Agentic stream failed'));
            if (typeof onError === 'function') {
                try {
                    onError(err);
                } catch (callbackErr) {
                    console.error('[streamAgenticChat] Error in onError callback:', callbackErr);
                }
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
                    if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
                        socket.close();
                    }
                } catch (_err) {
                    // ignore
                }
            };

            const finalize = (payload) => {
                if (finished) return;
                finished = true;
                clearAllTimeouts();
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

            // Set request timeout (total request time)
            requestTimeoutHandle = setTimeout(() => {
                if (!finished) {
                    retryOrFail(new Error('Request timeout: No response from Agentic service'));
                }
            }, REQUEST_TIMEOUT_MS);

            try {
                socket = new WebSocket(wsUrl, {
                    handshakeTimeout: TIMEOUT_MS,
                });
            } catch (err) {
                clearAllTimeouts();
                retryOrFail(err);
                return;
            }

            socket.on('open', () => {
                if (finished) {
                    socket.close();
                    return;
                }
                opened = true;

                // Reset timeout on open
                if (timeoutHandle) clearTimeout(timeoutHandle);
                timeoutHandle = setTimeout(() => {
                    if (!finished && !receivedFinal) {
                        retryOrFail(new Error('No data received timeout'));
                    }
                }, TIMEOUT_MS);

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

            socket.on('message', (data) => {
                if (finished) return;

                // Reset timeout on each message
                if (timeoutHandle) clearTimeout(timeoutHandle);
                timeoutHandle = setTimeout(() => {
                    if (!finished && !receivedFinal) {
                        retryOrFail(new Error('No data received timeout'));
                    }
                }, TIMEOUT_MS);

                let parsed = null;
                try {
                    parsed = JSON.parse(data);
                } catch (_err) {
                    return;
                }

                if (parsed.type === 'status' && typeof onStatus === 'function') {
                    try {
                        onStatus(parsed);
                    } catch (callbackErr) {
                        console.error('[streamAgenticChat] Error in onStatus callback:', callbackErr);
                    }
                    return;
                }

                if (parsed.type === 'token') {
                    const chunk = parsed.content || '';
                    buffer += chunk;
                    yieldedToken = yieldedToken || Boolean(chunk);
                    if (typeof onToken === 'function') {
                        try {
                            onToken({ ...parsed, content: chunk });
                        } catch (callbackErr) {
                            console.error('[streamAgenticChat] Error in onToken callback:', callbackErr);
                        }
                    }
                    return;
                }

                if (parsed.type === 'final') {
                    receivedFinal = true;
                    if (typeof onFinal === 'function') {
                        try {
                            onFinal(parsed);
                        } catch (callbackErr) {
                            console.error('[streamAgenticChat] Error in onFinal callback:', callbackErr);
                        }
                    }
                    finalize({
                        reply: parsed.reply || buffer,
                        provider: parsed.provider || 'agentic',
                        model: parsed.model || 'empathai-langgraph',
                        raw: parsed,
                    });
                    return;
                }

                if (parsed.type === 'error') {
                    const error = new Error(parsed.message || 'Agentic service error');
                    if (typeof onError === 'function') {
                        try {
                            onError(error, parsed);
                        } catch (callbackErr) {
                            console.error('[streamAgenticChat] Error in onError callback:', callbackErr);
                        }
                    }
                    retryOrFail(error);
                }
            });

            socket.on('error', (event) => {
                retryOrFail(event || new Error('WebSocket error'));
            });

            socket.on('close', () => {
                if (finished || receivedFinal) {
                    clearAllTimeouts();
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
