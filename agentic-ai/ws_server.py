from __future__ import annotations

import asyncio
import json
import os
import sys
from http import HTTPStatus
from pathlib import Path

import websockets
from websockets.datastructures import Headers
from websockets.http11 import Response

ROOT = Path(__file__).resolve().parent
PYTHON_DIR = ROOT / "python"
if str(PYTHON_DIR) not in sys.path:
    sys.path.insert(0, str(PYTHON_DIR))

from agents.graph import run_streaming, startup_warmup  # noqa: E402


def _http_response(status: HTTPStatus, payload: dict):
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    headers = Headers(
        {
            "Content-Type": "application/json; charset=utf-8",
            "Content-Length": str(len(body)),
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, X-Session-Id",
        }
    )
    return Response(status.value, status.phrase, headers, body)


async def process_request(_connection, request):
    path = getattr(request, "path", "")
    upgrade_header = str(getattr(request, "headers", {}).get("Upgrade", "") or "").lower()
    is_websocket_upgrade = "websocket" in upgrade_header

    if is_websocket_upgrade:
        return None

    if path == "/health":
        return _http_response(
            HTTPStatus.OK,
            {
                "ok": True,
                "service": "agentic-ai",
                "provider": os.getenv("EMPATHY_MODE", "featherless"),
            },
        )

    if path == "/providers":
        return _http_response(
            HTTPStatus.OK,
            {
                "providers": {
                    "featherless": os.getenv(
                        "FEATHERLESS_BASE_URL",
                        "https://api.featherless.ai/v1",
                    ),
                    "agentic": "built-in",
                }
            },
        )

    if path in ("/", "/chat", "/ws"):
        return _http_response(
            HTTPStatus.OK,
            {
                "ok": True,
                "service": "agentic-ai",
                "mode": "websocket",
            },
        )

    # Non-upgrade requests to anything else get a JSON 404 instead of a
    # low-level handshake error.
    if path not in ("/health", "/providers"):
        return _http_response(HTTPStatus.NOT_FOUND, {"error": "Not found"})

    return None


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
            "provider": "groq",
            "model": "empathai-langgraph",
            "trace_id": final_state.get("trace_id", "") or final_state.get("agent_trace", {}).get("trace_id", ""),
            "sentiment": final_state.get("sentiment", ""),
            "sentiment_score": final_state.get("sentiment_score", 0),
            "intent": final_state.get("intent", ""),
            "router_confidence": final_state.get("router_confidence", 0),
            "router_method": final_state.get("router_method", ""),
            "action_confidence": final_state.get("action_intent", {}).get("confidence", {}).get("confidence", 0),
            "action_method": final_state.get("action_intent", {}).get("confidence", {}).get("method", ""),
            "clarification_needed": final_state.get("clarification_needed", False),
            "order_id": final_state.get("order_id", ""),
            "email_address": final_state.get("email_address", ""),
            "order_info": final_state.get("order_info", {}),
            "catalog_info": final_state.get("catalog_info", {}),
            "checkout_result": final_state.get("checkout_result", {}),
            "ticket_info": final_state.get("ticket_info", {}),
            "suggested_actions": final_state.get("suggested_actions", []),
            "action_intent": final_state.get("action_intent", {}),
            "pending_action_intent": final_state.get("pending_action_intent", {}),
            "action_result": final_state.get("action_result", {}),
            "ticket_id": final_state.get("action_result", {}).get("ticket_id", ""),
            "ticket_number": final_state.get("action_result", {}).get("updated_fields", {}).get("ticket_number", ""),
            "agent_trace": final_state.get("agent_trace", {}),
            "processing_time_ms": final_state.get("processing_time_ms", 0),
        }, ensure_ascii=False))


async def main():
    port = int(os.getenv("PORT", os.getenv("AGENTIC_WS_PORT", "8788")))
    if os.getenv("AGENTIC_WARMUP", "true").lower() != "false":
        print("Warming up EmpathAI models before accepting WebSocket traffic...")
        startup_warmup()

    async with websockets.serve(
        handle_ws,
        "0.0.0.0",
        port,
        process_request=process_request,
        ping_interval=None,
        max_size=10 * 1024 * 1024,
    ):
        print(f"Agentic AI WebSocket listening on ws://0.0.0.0:{port}")
        await asyncio.Future()


if __name__ == "__main__":
    asyncio.run(main())
