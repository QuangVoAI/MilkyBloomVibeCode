# MilkyBloom Agentic AI

This folder contains the Python core moved from `Agentic_customer_service_AI`.

## What is kept

- `python/` LangGraph orchestrator
- `data/` policies and mock order data
- `server.py` as a lightweight HTTP bridge

## What is not mounted into the main web app

- `frontend/` from the source repo
- `rust_backend/` unless you later decide to bring back WebSocket + Kafka

## Run

```bash
cd agentic-ai
python server.py
```

In another terminal for websocket streaming:

```bash
cd agentic-ai
python ws_server.py
```

## Bridge API

- `GET /health`
- `GET /providers`
- `POST /chat`
- WebSocket stream: `ws://127.0.0.1:8788`

The main MilkyBloom backend can call:

- `POST /api/chat/agentic`
- `POST /api/chat/message` with `CHAT_PROVIDER=agentic`
