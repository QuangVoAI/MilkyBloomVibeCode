const { normalizeUrl } = require('../config/runtime.js');

const DEFAULT_SYSTEM_PROMPT =
    'You are MilkyBloom customer support. Be concise, warm, and helpful. Answer only with store-related guidance when possible. If the user asks about orders, shipping, refunds, returns, or account issues, ask for the minimum needed details.';

const normalizeMode = (value) => {
    const mode = String(value || 'agentic').trim().toLowerCase();
    if (['agentic', 'auto'].includes(mode)) return mode;
    return 'agentic';
};

const toNumber = (value, fallback) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
};

const getChatConfig = () => ({
    provider: normalizeMode(process.env.CHAT_PROVIDER || process.env.AI_CHAT_PROVIDER),
    systemPrompt: process.env.CHAT_SYSTEM_PROMPT || DEFAULT_SYSTEM_PROMPT,
    temperature: toNumber(process.env.CHAT_TEMPERATURE, 0.3),
    maxOutputTokens: toNumber(process.env.CHAT_MAX_OUTPUT_TOKENS, 300),
    agentic: {
        baseUrl: normalizeUrl(
            process.env.AGENTIC_AI_BASE_URL || process.env.CHAT_AGENTIC_BASE_URL || '',
        ),
        timeoutMs: toNumber(
            process.env.AGENTIC_AI_TIMEOUT_MS || process.env.CHAT_AGENTIC_TIMEOUT_MS,
            120000,
        ),
    },
});

const isAgenticConfigured = (config) => Boolean(config?.baseUrl);

const resolveCandidateOrder = (provider) => {
    switch (provider) {
        case 'agentic':
            return ['agentic'];
        case 'auto':
        default:
            return ['agentic'];
    }
};

const getProviderSnapshot = () => {
    const config = getChatConfig();
    return {
        provider: config.provider,
        candidates: resolveCandidateOrder(config.provider),
        streamingOnly: true,
        agentic: {
            configured: isAgenticConfigured(config.agentic),
            baseUrl: config.agentic.baseUrl,
            timeoutMs: config.agentic.timeoutMs,
        },
        temperature: config.temperature,
        maxOutputTokens: config.maxOutputTokens,
    };
};

module.exports = {
    getProviderSnapshot,
    resolveCandidateOrder,
};
