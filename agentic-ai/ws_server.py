from __future__ import annotations

import asyncio
import json
import os
import sys
from pathlib import Path

import websockets

ROOT = Path(__file__).resolve().parent
PYTHON_DIR = ROOT / "python"
if str(PYTHON_DIR) not in sys.path:
    sys.path.insert(0, str(PYTHON_DIR))

from agents.graph import run_streaming, startup_warmup  # noqa: E402


async def handle_ws(websocket):
    async for raw in websocket:
        try:
            payload = json.loads(raw)
        except json.JSONDecodeError:
            await websocket.send(json.dumps({
                "type": "error",
                "message": "Invalid JSON payload",
            }))
            continue

        message = payload.get("message")
        if not message:
            await websocket.send(json.dumps({
                "type": "error",
                "message": "message is required",
            }))
            continue

        history = payload.get("history") or []
        session_id = payload.get("session_id") or payload.get("sessionId") or ""
        shop_context = payload.get("shop_context") or payload.get("context") or {}

        await websocket.send(json.dumps({
            "type": "status",
            "session_id": session_id,
            "message": "started",
        }))

        async def stream_callback(chunk: str):
            if chunk:
                await websocket.send(json.dumps({
                    "type": "token",
                    "session_id": session_id,
                    "content": chunk,
                }, ensure_ascii=False))

        try:
            final_state = await run_streaming(
                question=message,
                history=history,
                session_id=session_id,
                shop_context=shop_context,
                stream_callback=stream_callback,
            )
        except Exception as exc:
            await websocket.send(json.dumps({
                "type": "error",
                "session_id": session_id,
                "message": str(exc),
            }, ensure_ascii=False))
            continue

        await websocket.send(json.dumps({
            "type": "final",
            "session_id": session_id,
            "reply": final_state.get("answer", ""),
            "answer": final_state.get("answer", ""),
            "provider": "agentic",
            "model": "empathai-langgraph",
            "sentiment": final_state.get("sentiment", ""),
            "sentiment_score": final_state.get("sentiment_score", 0),
            "order_id": final_state.get("order_id", ""),
            "order_info": final_state.get("order_info", {}),
            "suggested_actions": final_state.get("suggested_actions", []),
            "agent_trace": final_state.get("agent_trace", {}),
            "processing_time_ms": final_state.get("processing_time_ms", 0),
        }, ensure_ascii=False))


async def main():
    port = int(os.getenv("AGENTIC_WS_PORT", "8788"))
    if os.getenv("AGENTIC_WARMUP", "false").lower() == "true":
        startup_warmup()

    async with websockets.serve(
        handle_ws,
        "0.0.0.0",
        port,
        ping_interval=None,
        max_size=10 * 1024 * 1024,
    ):
        print(f"Agentic AI WebSocket listening on ws://0.0.0.0:{port}")
        await asyncio.Future()


if __name__ == "__main__":
    asyncio.run(main())
