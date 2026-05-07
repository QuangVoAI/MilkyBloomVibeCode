const express = require('express');
const jwt = require('jsonwebtoken');
const {
    generateChatReply,
    getProviderSnapshot,
} = require('../services/chat.service.js');

const router = express.Router();

const getBearerToken = (req) => {
    const header = req.get('Authorization') || req.get('authorization') || '';
    const match = header.match(/^Bearer\s+(.+)$/i);
    return match ? match[1].trim() : '';
};

const buildShopContext = (req, forwardedSessionId = '') => {
    const authToken = getBearerToken(req);
    let decodedUser = null;

    if (authToken && process.env.JWT_SECRET) {
        try {
            decodedUser = jwt.verify(authToken, process.env.JWT_SECRET);
        } catch (_error) {
            decodedUser = null;
        }
    }

    const body = req.body || {};
    const guestEmail = body.guestEmail || body.email || '';

    return {
        auth_token: authToken,
        user_id: decodedUser?.id || decodedUser?._id || '',
        email: decodedUser?.email || guestEmail || '',
        role: decodedUser?.role || '',
        session_id: forwardedSessionId,
        sessionId: forwardedSessionId,
        guest_email: guestEmail,
    };
};

router.get('/providers', (_req, res) => {
    return res.json({
        success: true,
        data: getProviderSnapshot(),
    });
});

router.post('/message', async (req, res) => {
    try {
        const { message, history = [], provider, sessionId = '' } = req.body || {};
        const forwardedSessionId =
            sessionId || req.get('X-Session-Id') || req.get('x-session-id') || '';
        const shopContext = buildShopContext(req, forwardedSessionId);

        const result = await generateChatReply({
            message,
            history,
            providerOverride: provider,
            sessionId: forwardedSessionId,
            shopContext,
        });

        return res.json({
            success: true,
            reply: result.reply,
            provider: result.provider,
            model: result.model,
        });
    } catch (error) {
        const message =
            error?.response?.data?.error?.message ||
            error?.response?.data?.message ||
            error?.message ||
            'Chat service error';

        console.error('[chat] message error:', message);

        return res.status(503).json({
            success: false,
            message,
        });
    }
});

router.post('/agentic', async (req, res) => {
    try {
        const { message, history = [], sessionId = '' } = req.body || {};
        const forwardedSessionId =
            sessionId || req.get('X-Session-Id') || req.get('x-session-id') || '';
        const shopContext = buildShopContext(req, forwardedSessionId);
        const result = await generateChatReply({
            message,
            history,
            providerOverride: 'agentic',
            sessionId: forwardedSessionId,
            shopContext,
        });

        return res.json({
            success: true,
            reply: result.reply,
            provider: result.provider,
            model: result.model,
        });
    } catch (error) {
        const message =
            error?.response?.data?.error?.message ||
            error?.response?.data?.message ||
            error?.message ||
            'Agentic chat service error';

        console.error('[chat] agentic error:', message);

        return res.status(503).json({
            success: false,
            message,
        });
    }
});

router.post('/gemini', async (req, res) => {
    try {
        const { message, history = [], sessionId = '' } = req.body || {};
        const forwardedSessionId =
            sessionId || req.get('X-Session-Id') || req.get('x-session-id') || '';
        const shopContext = buildShopContext(req, forwardedSessionId);
        const result = await generateChatReply({
            message,
            history,
            providerOverride: 'gemini',
            sessionId: forwardedSessionId,
            shopContext,
        });

        return res.json({
            success: true,
            reply: result.reply,
            provider: result.provider,
            model: result.model,
        });
    } catch (error) {
        const message =
            error?.response?.data?.error?.message ||
            error?.response?.data?.message ||
            error?.message ||
            'Gemini chat service error';

        console.error('[chat] gemini error:', message);

        return res.status(503).json({
            success: false,
            message,
        });
    }
});

module.exports = router;
