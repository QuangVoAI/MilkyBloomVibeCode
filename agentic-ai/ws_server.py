from __future__ import annotations

import asyncio
import json
import os
import sys
from pathlib import Path

from aiohttp import web

ROOT = Path(__file__).resolve().parent
PYTHON_DIR = ROOT / "python"
if str(PYTHON_DIR) not in sys.path:
    sys.path.insert(0, str(PYTHON_DIR))

from agents.graph import run_streaming, startup_warmup  # noqa: E402
from config import get_empathy_mode  # noqa: E402


def _json_response(payload: dict, status: int = 200) -> web.Response:
    return web.json_response(
        payload,
        status=status,
        headers={
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, X-Session-Id",
        },
    )


def _merge_top_level_shop_context(payload: dict) -> dict:
    context = payload.get("shop_context") or payload.get("context") or {}
    if not isinstance(context, dict):
        context = {}
    else:
        context = dict(context)

    aliases = {
        "auth_token": ("auth_token", "authToken", "token"),
        "order_lookup_token": ("order_lookup_token", "orderLookupToken"),
        "guest_session_id": ("guest_session_id", "guestSessionId"),
        "guest_email": ("guest_email", "guestEmail"),
        "user_id": ("user_id", "userId"),
        "email": ("email",),
        "role": ("role",),
    }

    for target_key, source_keys in aliases.items():
        if context.get(target_key):
            continue
        for source_key in source_keys:
            value = context.get(source_key)
            if value:
                context[target_key] = value
                break
        if context.get(target_key):
            continue
        for source_key in source_keys:
            value = payload.get(source_key)
            if value:
                context[target_key] = value
                break

    guest_info = payload.get("guest_info") or payload.get("guestInfo")
    if guest_info and not context.get("guest_info"):
        context["guest_info"] = guest_info

    return context


async def health(request: web.Request) -> web.Response:
    groq_configured = bool(os.getenv("GROQ_API_KEY", "").strip() or os.getenv("GROQ_API_KEYS", "").strip())
    featherless_configured = bool(os.getenv("FEATHERLESS_API_KEY", "").strip())
    return _json_response(
        {
            "ok": True,
            "service": "agentic-ai",
            "provider": get_empathy_mode(),
            "groq_configured": groq_configured,
            "featherless_configured": featherless_configured,
        }
    )


async def providers(request: web.Request) -> web.Response:
    groq_configured = bool(os.getenv("GROQ_API_KEY", "").strip() or os.getenv("GROQ_API_KEYS", "").strip())
    featherless_configured = bool(os.getenv("FEATHERLESS_API_KEY", "").strip())
    return _json_response(
        {
            "providers": {
                "groq": {
                    "configured": groq_configured,
                    "base_url": os.getenv("GROQ_BASE_URL", "https://api.groq.com/openai/v1"),
                    "model": os.getenv("GROQ_MODEL", "llama-3.1-8b-instant"),
                },
                "featherless": {
                    "configured": featherless_configured,
                    "base_url": os.getenv(
                        "FEATHERLESS_BASE_URL",
                        "https://api.featherless.ai/v1",
                    ),
                    "model": os.getenv("FEATHERLESS_MODEL", "Qwen/Qwen2.5-7B-Instruct"),
                },
                "agentic": "built-in",
            }
        }
    )


async def chat_http(request: web.Request) -> web.Response:
    try:
        payload = await request.json()
    except Exception:
        return _json_response({"error": "Invalid JSON"}, status=400)

    message = payload.get("message")
    if not message:
        return _json_response({"error": "message is required"}, status=400)

    history = payload.get("history") or []
    session_id = payload.get("session_id") or payload.get("sessionId") or ""
    shop_context = _merge_top_level_shop_context(payload)

    try:
        final_state = await run_streaming(
            question=message,
            history=history,
            session_id=session_id,
            shop_context=shop_context,
            stream_callback=None,
        )
    except Exception as exc:
        return _json_response(
            {
                "error": str(exc),
                "provider": "agentic",
            },
            status=503,
        )

    return _json_response(
        {
            "reply": final_state.get("answer", ""),
            "answer": final_state.get("answer", ""),
            "provider": "agentic",
            "model": "empathai-langgraph",
            "session_id": session_id,
            "sentiment": final_state.get("sentiment", ""),
            "sentiment_score": final_state.get("sentiment_score", 0),
            "order_id": final_state.get("order_id", ""),
            "order_info": final_state.get("order_info", {}),
            "suggested_actions": final_state.get("suggested_actions", []),
            "agent_trace": final_state.get("agent_trace", {}),
            "processing_time_ms": final_state.get("processing_time_ms", 0),
        }
    )


async def ws_entrypoint(request: web.Request) -> web.StreamResponse:
    if request.headers.get("Upgrade", "").lower() != "websocket":
        if request.method == "HEAD":
            return web.Response(status=200, headers={"Content-Length": "0"})
        return _json_response(
            {
                "ok": True,
                "service": "agentic-ai",
                "mode": "websocket",
            }
        )

    ws = web.WebSocketResponse(heartbeat=None, max_msg_size=10 * 1024 * 1024)
    await ws.prepare(request)

    async def send_json(payload: dict) -> None:
        await ws.send_str(json.dumps(payload, ensure_ascii=False))

    async for msg in ws:
        if msg.type != web.WSMsgType.TEXT:
            continue

        try:
            payload = json.loads(msg.data)
        except json.JSONDecodeError:
            await send_json({
                "type": "error",
                "message": "Invalid JSON payload",
            })
            continue

        message = payload.get("message")
        if not message:
            await send_json({
                "type": "error",
                "message": "message is required",
            })
            continue

        history = payload.get("history") or []
        session_id = payload.get("session_id") or payload.get("sessionId") or ""
        shop_context = _merge_top_level_shop_context(payload)

        await send_json({
            "type": "status",
            "session_id": session_id,
            "message": "started",
        })

        async def stream_callback(chunk: str):
            if chunk:
                await send_json({
                    "type": "token",
                    "session_id": session_id,
                    "content": chunk,
                })

        try:
            final_state = await run_streaming(
                question=message,
                history=history,
                session_id=session_id,
                shop_context=shop_context,
                stream_callback=stream_callback,
            )
        except Exception as exc:
            await send_json({
                "type": "error",
                "session_id": session_id,
                "message": str(exc),
            })
            continue

        await send_json({
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
            "comparison": final_state.get("comparison_info", {}),
            "confetti": "FLASH_VOUCHER_MILKY" in (final_state.get("answer") or ""),
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
        })

    return ws


async def init_app() -> web.Application:
    app = web.Application()
    app.router.add_route("GET", "/health", health)
    app.router.add_route("HEAD", "/health", health)
    app.router.add_route("GET", "/providers", providers)
    app.router.add_route("HEAD", "/providers", providers)
    app.router.add_route("POST", "/chat", chat_http)
    app.router.add_route("*", "/", ws_entrypoint)
    app.router.add_route("*", "/ws", ws_entrypoint)
    app.router.add_route("GET", "/chat", ws_entrypoint)
    app.router.add_route("*", "/chat/ws", ws_entrypoint)
    app.router.add_route("*", "/ws/chat", ws_entrypoint)
    return app


async def main():
    port = int(os.getenv("PORT", os.getenv("AGENTIC_WS_PORT", "8788")))
    groq_configured = bool(os.getenv("GROQ_API_KEY", "").strip() or os.getenv("GROQ_API_KEYS", "").strip())
    featherless_configured = bool(os.getenv("FEATHERLESS_API_KEY", "").strip())
    if not groq_configured:
        print("[agentic] GROQ_API_KEY/GROQ_API_KEYS is missing. Groq requests will fail unless Featherless fallback is available.")
    if not featherless_configured:
        print("[agentic] FEATHERLESS_API_KEY is missing. If Groq fails, responses will fall back to canned messages only.")
    if os.getenv("AGENTIC_WARMUP", "true").lower() != "false":
        print("Warming up EmpathAI models before accepting WebSocket traffic...")
        startup_warmup()

    app = await init_app()
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, "0.0.0.0", port)
    await site.start()
    print(f"Agentic AI HTTP/WebSocket listening on http://0.0.0.0:{port}")
    await asyncio.Future()


if __name__ == "__main__":
    asyncio.run(main())
