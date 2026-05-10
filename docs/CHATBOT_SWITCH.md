# Chatbot Switch

This project is now **streaming only** for public chat.

## Public Chat Path

- Frontend opens a WebSocket connection to the backend chat socket.
- Backend forwards the message to the EmpathAI streaming runtime.
- EmpathAI streams tokens back to the UI in real time.

Public chat no longer uses these HTTP routes:

- `POST /api/chat/message`
- `POST /api/chat/agentic`
- `POST /api/chat/gemini`

Those routes stay only as disabled compatibility stubs and return `410 Gone`.

## Internal Snapshot

The backend still exposes an internal diagnostics snapshot at:

- `GET /api/chat/providers`

This is for debugging and health inspection only. It is not part of the public chat contract.

## Environment Variables

Set these in `backend/.env`:

```env
CHAT_PROVIDER=agentic
CHAT_SYSTEM_PROMPT=You are MilkyBloom customer support. Be warm, concise, and practical.
CHAT_MAX_OUTPUT_TOKENS=300
CHAT_TEMPERATURE=0.3

AGENTIC_AI_WS_URL=ws://127.0.0.1:8788
# AGENTIC_AI_BASE_URL is internal-only and not used by the public streaming path
AGENTIC_AI_TIMEOUT_MS=120000
```

## Recommended Workflow

1. Start the backend.
2. Start the EmpathAI streaming runtime.
3. Open the frontend chat widget.
4. Send a message and watch the reply stream token by token.

## Frontend

The chat widget is mounted in:

- `frontend/src/components/Layout.jsx`
- `frontend/src/pages/AdminPanel/layouts/AdminLayout/index.jsx`

It uses:

- WebSocket streaming chat
- `GET /api/chat/providers` only for internal diagnostics
