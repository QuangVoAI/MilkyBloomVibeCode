const axios = require('axios');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { normalizeUrl } = require('../config/runtime.js');

const DEFAULT_SYSTEM_PROMPT =
    'You are MilkyBloom customer support. Be concise, warm, and helpful. Answer only with store-related guidance when possible. If the user asks about orders, shipping, refunds, returns, or account issues, ask for the minimum needed details.';

const normalizeMode = (value) => {
    const mode = String(value || 'local').trim().toLowerCase();
    if (['local', 'remote', 'gemini', 'agentic', 'auto'].includes(mode)) return mode;
    return 'local';
};

const normalizeOpenAIBaseUrl = (value) => {
    const url = normalizeUrl(value);
    if (!url) return '';
    return /\/v1$/.test(url) ? url : `${url}/v1`;
};

const toNumber = (value, fallback) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
};

const getChatConfig = () => {
    const provider = normalizeMode(
        process.env.CHAT_PROVIDER || process.env.AI_CHAT_PROVIDER,
    );

    return {
        provider,
        systemPrompt: process.env.CHAT_SYSTEM_PROMPT || DEFAULT_SYSTEM_PROMPT,
        temperature: toNumber(process.env.CHAT_TEMPERATURE, 0.3),
        maxOutputTokens: toNumber(process.env.CHAT_MAX_OUTPUT_TOKENS, 300),
        local: {
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
        },
        remote: {
            mode: String(
                process.env.CHAT_REMOTE_MODE ||
                    process.env.AI_CHAT_REMOTE_MODE ||
                    'openai',
            )
                .trim()
                .toLowerCase(),
            baseUrl: normalizeOpenAIBaseUrl(
                process.env.CHAT_REMOTE_BASE_URL ||
                    process.env.AI_CHAT_REMOTE_BASE_URL ||
                    '',
            ),
            model:
                process.env.CHAT_REMOTE_MODEL ||
                process.env.AI_CHAT_REMOTE_MODEL ||
                '',
            apiKey:
                process.env.CHAT_REMOTE_API_KEY ||
                process.env.AI_CHAT_REMOTE_API_KEY ||
                '',
        },
        gemini: {
            apiKey: process.env.GEMINI_API_KEY || '',
            model:
                process.env.CHAT_GEMINI_MODEL ||
                process.env.AI_CHAT_GEMINI_MODEL ||
                'gemini-1.5-flash-latest',
        },
        agentic: {
            baseUrl: normalizeUrl(
                process.env.AGENTIC_AI_BASE_URL ||
                    process.env.CHAT_AGENTIC_BASE_URL ||
                    '',
            ),
            timeoutMs: toNumber(
                process.env.AGENTIC_AI_TIMEOUT_MS ||
                    process.env.CHAT_AGENTIC_TIMEOUT_MS,
                120000,
            ),
        },
    };
};

const isOpenAICompatibleConfigured = ({ baseUrl, model }) =>
    Boolean(baseUrl && model);

const isGeminiConfigured = (config) => Boolean(config?.apiKey);
const isAgenticConfigured = (config) => Boolean(config?.baseUrl);

const normalizeHistory = (history = []) =>
    (Array.isArray(history) ? history : [])
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
        .filter(Boolean);

const buildMessages = ({ message, history, systemPrompt }) => {
    const messages = [{ role: 'system', content: systemPrompt }];
    const normalizedHistory = normalizeHistory(history).filter(
        (entry) => entry.role !== 'system',
    );
    messages.push(...normalizedHistory);
    messages.push({ role: 'user', content: String(message) });
    return messages;
};

const callOpenAICompatibleChat = async ({
    baseUrl,
    model,
    apiKey,
    messages,
    temperature,
    maxOutputTokens,
}) => {
    if (!isOpenAICompatibleConfigured({ baseUrl, model })) {
        throw new Error('OpenAI-compatible provider is not configured');
    }

    const response = await axios.post(
        `${baseUrl}/chat/completions`,
        {
            model,
            messages,
            temperature,
            max_tokens: maxOutputTokens,
            stream: false,
        },
        {
            timeout: 30000,
            headers: {
                'Content-Type': 'application/json',
                ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
            },
        },
    );

    const reply = response?.data?.choices?.[0]?.message?.content?.trim();
    if (!reply) {
        throw new Error('Empty response from OpenAI-compatible provider');
    }

    return {
        reply,
        model,
        provider: 'openai-compatible',
    };
};

const callGeminiChat = async ({
    apiKey,
    model,
    messages,
    temperature,
    maxOutputTokens,
}) => {
    if (!isGeminiConfigured({ apiKey })) {
        throw new Error('Gemini provider is not configured');
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const geminiModel = genAI.getGenerativeModel({
        model,
        systemInstruction: messages[0]?.content || DEFAULT_SYSTEM_PROMPT,
    });

    const history = messages.slice(1, -1).map((entry) => ({
        role: entry.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: entry.content }],
    }));
    const lastUserMessage = messages[messages.length - 1]?.content || '';

    const chat = geminiModel.startChat({
        history,
        generationConfig: {
            temperature,
            maxOutputTokens,
        },
    });

    const result = await chat.sendMessage(lastUserMessage);
    const reply = result?.response?.text?.().trim();

    if (!reply) {
        throw new Error('Empty response from Gemini provider');
    }

    return {
        reply,
        model,
        provider: 'gemini',
    };
};

const callAgenticChat = async ({
    baseUrl,
    timeoutMs,
    message,
    history,
    sessionId,
    shopContext,
}) => {
    if (!isAgenticConfigured({ baseUrl })) {
        throw new Error('Agentic AI service is not configured');
    }

    const response = await axios.post(
        `${baseUrl}/chat`,
        {
            message,
            history,
            session_id: sessionId,
            shop_context: shopContext || {},
            stream: false,
        },
        {
            timeout: timeoutMs,
            headers: {
                'Content-Type': 'application/json',
            },
        },
    );

    const data = response?.data || {};
    const reply =
        data.reply ||
        data.answer ||
        data.content ||
        data.message ||
        data.output;

    if (!reply) {
        throw new Error('Empty response from agentic AI service');
    }

    return {
        reply,
        model: data.model || 'agentic-ai',
        provider: 'agentic',
    };
};

const resolveCandidateOrder = (provider) => {
    switch (provider) {
        case 'local':
            return ['local'];
        case 'agentic':
            return ['agentic'];
        case 'remote':
            return ['remote'];
        case 'gemini':
            return ['gemini'];
        case 'auto':
        default:
            return ['local', 'agentic', 'remote', 'gemini'];
    }
};

const getProviderSnapshot = () => {
    const config = getChatConfig();
    return {
        provider: config.provider,
        candidates: resolveCandidateOrder(config.provider),
        local: {
            configured: isOpenAICompatibleConfigured(config.local),
            baseUrl: config.local.baseUrl,
            model: config.local.model,
        },
        remote: {
            configured: isOpenAICompatibleConfigured(config.remote),
            mode: config.remote.mode,
            baseUrl: config.remote.baseUrl,
            model: config.remote.model,
        },
        gemini: {
            configured: isGeminiConfigured(config.gemini),
            model: config.gemini.model,
        },
        agentic: {
            configured: isAgenticConfigured(config.agentic),
            baseUrl: config.agentic.baseUrl,
            timeoutMs: config.agentic.timeoutMs,
        },
        temperature: config.temperature,
        maxOutputTokens: config.maxOutputTokens,
    };
};

const generateChatReply = async ({
    message,
    history = [],
    providerOverride,
    sessionId = '',
    shopContext = {},
} = {}) => {
    if (!message || typeof message !== 'string') {
        throw new Error('message is required');
    }

    const config = getChatConfig();
    const provider = normalizeMode(providerOverride || config.provider);
    const messages = buildMessages({
        message,
        history,
        systemPrompt: config.systemPrompt,
    });

    const candidateOrder = resolveCandidateOrder(provider);
    const errors = [];

    for (const candidate of candidateOrder) {
        try {
            if (candidate === 'local') {
                return await callOpenAICompatibleChat({
                    ...config.local,
                    messages,
                    temperature: config.temperature,
                    maxOutputTokens: config.maxOutputTokens,
                });
            }

            if (candidate === 'remote') {
                if (config.remote.mode === 'gemini') {
                    return await callGeminiChat({
                        ...config.gemini,
                        messages,
                        temperature: config.temperature,
                        maxOutputTokens: config.maxOutputTokens,
                    });
                }

                return await callOpenAICompatibleChat({
                    ...config.remote,
                    messages,
                    temperature: config.temperature,
                    maxOutputTokens: config.maxOutputTokens,
                });
            }

            if (candidate === 'gemini') {
                return await callGeminiChat({
                    ...config.gemini,
                    messages,
                    temperature: config.temperature,
                    maxOutputTokens: config.maxOutputTokens,
                });
            }

            if (candidate === 'agentic') {
                return await callAgenticChat({
                    ...config.agentic,
                    message,
                    history,
                    sessionId,
                    shopContext,
                });
            }
        } catch (error) {
            errors.push({
                provider: candidate,
                message: error.message || 'Unknown provider error',
            });
            if (provider !== 'auto') {
                throw error;
            }
        }
    }

    const fallbackError = errors[errors.length - 1];
    throw new Error(
        fallbackError
            ? `No chat provider available: ${fallbackError.message}`
            : 'No chat provider available',
    );
};

module.exports = {
    generateChatReply,
    getProviderSnapshot,
    resolveCandidateOrder,
};
