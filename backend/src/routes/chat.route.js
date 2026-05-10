const express = require('express');
const { getProviderSnapshot } = require('../services/chat.service.js');

const router = express.Router();

router.get('/providers', (_req, res) => {
    // Internal snapshot only: used by diagnostics and backend health checks,
    // not part of the public chat surface.
    return res.json({
        success: true,
        data: getProviderSnapshot(),
    });
});

const deprecatedChatMessage = (res, routeName) =>
    res.status(410).json({
        success: false,
        message:
            `${routeName} is disabled. Use the WebSocket streaming chat path instead.`,
        streaming_only: true,
    });

router.post('/message', (_req, res) => {
    console.warn('[chat] POST /message is deprecated; use websocket streaming instead.');
    return deprecatedChatMessage(res, 'POST /chat/message');
});

router.post('/agentic', (_req, res) => {
    console.warn('[chat] POST /agentic is deprecated; use websocket streaming instead.');
    return deprecatedChatMessage(res, 'POST /chat/agentic');
});

router.post('/gemini', (_req, res) => {
    console.warn('[chat] POST /gemini is deprecated; use websocket streaming instead.');
    return deprecatedChatMessage(res, 'POST /chat/gemini');
});

module.exports = router;
