# MilkyBloom Agentic AI

This folder contains the Python core moved from `Agentic_customer_service_AI`.

## What is kept

- `python/` LangGraph orchestrator
- `data/` policy documents for RAG
- `server.py` as an internal HTTP bridge for diagnostics

## What is not mounted into the main web app

- `frontend/` from the source repo
- `rust_backend/` unless you later decide to bring back WebSocket + Kafka

## Run

This project expects a local Conda environment with the Python dependencies installed.
If you are on the same machine as this workspace, use:

```bash
conda activate deeplearning
```

On another machine, create the environment from `environment.yml` first:

```bash
conda env create -f environment.yml
conda activate deeplearning
```

If you prefer a single command, use the helper script:

```bash
./run_agentic.sh
```

That script starts both the HTTP bridge and the WebSocket bridge in one shot.
The UI-facing chat path is streaming only.

Before starting the chat services, seed the policy index into Qdrant:

```bash
cd python
python seed_qdrant_policies.py --recreate
```

If you want to run the services separately:

```bash
cd agentic-ai
python server.py
```

In another terminal for websocket streaming:

```bash
cd agentic-ai
python ws_server.py
```

If the `torch` import fails, reinstall PyTorch inside the active Conda environment before starting the servers.

## Streaming API

- `GET /health`
- `POST /chat`
- WebSocket stream: `ws://127.0.0.1:8788`

`GET /providers` is kept for internal snapshot/debug use only and is not part of the public chat docs.

The main MilkyBloom backend can call:

- `POST /api/chat/agentic`
- `POST /api/chat/message` with `CHAT_PROVIDER=agentic`
