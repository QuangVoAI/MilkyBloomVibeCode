const { normalizeUrl } = require('../config/runtime.js');

const normalizeOpenAIBaseUrl = (value) => {
    const url = normalizeUrl(value);
    if (!url) return '';
    return /\/v1$/.test(url) ? url : `${url}/v1`;
};

const toNumber = (value, fallback) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
};

const getLocalChatConfig = () => ({
    baseUrl: normalizeOpenAIBaseUrl(
        process.env.CHAT_LOCAL_BASE_URL ||
            process.env.LOCAL_QWEN_BASE_URL ||
            'http://127.0.0.1:11434/v1',
    ),
    model:
        process.env.CHAT_LOCAL_MODEL ||
        process.env.LOCAL_QWEN_MODEL ||
        'qwen2.5:14b',
    apiKey:
        process.env.CHAT_LOCAL_API_KEY ||
        process.env.LOCAL_QWEN_API_KEY ||
        '',
    temperature: toNumber(process.env.CHAT_TEMPERATURE, 0.3),
    maxOutputTokens: toNumber(process.env.CHAT_MAX_OUTPUT_TOKENS, 300),
});

const buildMessages = (message, history = [], systemPrompt = '') => {
    const messages = [];
    if (systemPrompt) {
        messages.push({ role: 'system', content: systemPrompt });
    }

    const normalizedHistory = Array.isArray(history)
        ? history
              .map((entry) => {
                  if (!entry) return null;
                  const role = String(entry.role || 'user').toLowerCase();
                  const content = entry.content ?? entry.message ?? entry.text;
                  if (!content) return null;
                  if (!['system', 'user', 'assistant', 'model'].includes(role)) {
                      return { role: 'user', content: String(content) };
                  }
                  return {
                      role: role === 'model' ? 'assistant' : role,
                      content: String(content),
                  };
              })
              .filter(Boolean)
        : [];

    messages.push(...normalizedHistory.filter((entry) => entry.role !== 'system'));
    messages.push({ role: 'user', content: String(message) });
    return messages;
};

const parseSseChunk = (buffer) => {
    const events = [];
    let remaining = buffer;

    while (true) {
        const separatorIndex = remaining.indexOf('\n\n');
        if (separatorIndex === -1) break;

        const rawEvent = remaining.slice(0, separatorIndex).trim();
        remaining = remaining.slice(separatorIndex + 2);
        if (!rawEvent) continue;

        const lines = rawEvent.split('\n');
        const dataLines = lines
            .filter((line) => line.startsWith('data:'))
            .map((line) => line.replace(/^data:\s?/, ''));

        if (dataLines.length === 0) continue;
        events.push(dataLines.join('\n'));
    }

    return { events, remaining };
};

const extractOpenAIChunk = (payload) => {
    if (!payload || payload === '[DONE]') return '';

    try {
        const parsed = JSON.parse(payload);
        return (
            parsed?.choices?.[0]?.delta?.content ||
            parsed?.choices?.[0]?.message?.content ||
            parsed?.text ||
            parsed?.content ||
            ''
        );
    } catch (_error) {
        return '';
    }
};

const splitForTyping = (chunk, maxSize = 4) => {
    const text = String(chunk || '');
    if (!text) return [];

    const pieces = [];
    let index = 0;
    while (index < text.length) {
        const remaining = text.length - index;
        const size = Math.max(1, Math.min(maxSize, remaining));
        const nextIndex = index + size;
        pieces.push(text.slice(index, nextIndex));
        index = nextIndex;
    }

    return pieces;
};

const streamLocalChat = async ({
    message,
    history = [],
    sessionId = '',
    systemPrompt = '',
    onStatus,
    onToken,
    onFinal,
    onError,
} = {}) => {
    const config = getLocalChatConfig();
    if (!config.baseUrl || !config.model) {
        throw new Error('Local Qwen provider is not configured');
    }

    const messages = buildMessages(message, history, systemPrompt);
    const controller = new AbortController();
    let replyBuffer = '';

    if (typeof onStatus === 'function') {
        onStatus({
            sessionId,
            status: 'started',
            provider: 'local',
        });
    }

    const response = await fetch(`${config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
        },
        body: JSON.stringify({
            model: config.model,
            messages,
            temperature: config.temperature,
            max_tokens: config.maxOutputTokens,
            stream: true,
        }),
        signal: controller.signal,
    });

    if (!response.ok || !response.body) {
        const text = await response.text().catch(() => '');
        throw new Error(text || `Local Qwen request failed with status ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    try {
        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });

            const parsed = parseSseChunk(buffer);
            buffer = parsed.remaining;

            for (const eventPayload of parsed.events) {
                if (eventPayload === '[DONE]') {
                    continue;
                }

                const chunk = extractOpenAIChunk(eventPayload);
                if (!chunk) continue;
                const pieces = splitForTyping(chunk, 4);
                for (const piece of pieces) {
                    replyBuffer += piece;
                    if (typeof onToken === 'function') {
                        onToken({
                            sessionId,
                            content: piece,
                            provider: 'local',
                        });
                    }
                }
            }
        }
    } catch (error) {
        if (typeof onError === 'function') {
            onError(error, { sessionId, provider: 'local' });
        }
        throw error;
    }

    if (typeof onFinal === 'function') {
        onFinal({
            sessionId,
            provider: 'local',
            model: config.model,
            reply: replyBuffer.trim(),
        });
    }

    return {
        reply: replyBuffer.trim(),
        provider: 'local',
        model: config.model,
    };
};

module.exports = {
    getLocalChatConfig,
    streamLocalChat,
};
