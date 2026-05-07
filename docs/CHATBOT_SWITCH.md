# Chatbot Switch

This project now exposes one chat endpoint:

- `POST /api/chat/message`

It can route to one of four providers:

- `local` - local Qwen / any OpenAI-compatible server
- `agentic` - the EmpathAI Python service moved into `agentic-ai/`
- `remote` - deployed LLM endpoint
- `gemini` - Gemini fallback / legacy mode

## Environment variables

Set these in `backend/.env`:

```env
CHAT_PROVIDER=local
CHAT_SYSTEM_PROMPT=You are MilkyBloom customer support. Be warm, concise, and practical.
CHAT_MAX_OUTPUT_TOKENS=300
CHAT_TEMPERATURE=0.3

CHAT_LOCAL_BASE_URL=http://127.0.0.1:11434/v1
CHAT_LOCAL_MODEL=qwen2.5:14b
CHAT_LOCAL_API_KEY=

CHAT_REMOTE_MODE=openai
CHAT_REMOTE_BASE_URL=
CHAT_REMOTE_MODEL=
CHAT_REMOTE_API_KEY=

AGENTIC_AI_BASE_URL=http://127.0.0.1:8787
AGENTIC_AI_TIMEOUT_MS=120000
AGENTIC_AI_WS_URL=ws://127.0.0.1:8788
```

## Recommended workflow

1. While deployment is off, set `CHAT_PROVIDER=local`.
2. Point `CHAT_LOCAL_BASE_URL` to your local Qwen server.
3. When the deployed LLM is ready, change `CHAT_PROVIDER=remote` and fill the remote values.
4. If you want the full EmpathAI agentic pipeline, set `CHAT_PROVIDER=agentic`.
5. If you want Gemini directly, set `CHAT_PROVIDER=gemini`.

Agentic runtime:

- HTTP bridge: `python server.py`
- WebSocket stream: `python ws_server.py`

## Frontend

The chat widget is mounted in:

- `frontend/src/components/Layout.jsx`
- `frontend/src/pages/AdminPanel/layouts/AdminLayout/index.jsx`

It uses:

- `GET /api/chat/providers`
- `POST /api/chat/message`
