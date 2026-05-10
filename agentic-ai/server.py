from __future__ import annotations

import asyncio
import json
import os
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent
PYTHON_DIR = ROOT / "python"
if str(PYTHON_DIR) not in sys.path:
    sys.path.insert(0, str(PYTHON_DIR))

from agents.graph import run_streaming, startup_warmup  # noqa: E402


def _json_response(handler: BaseHTTPRequestHandler, status: int, payload: dict):
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(body)))
    handler.send_header("Access-Control-Allow-Origin", "*")
    handler.send_header("Access-Control-Allow-Headers", "Content-Type, X-Session-Id")
    handler.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
    handler.end_headers()
    handler.wfile.write(body)


class AgenticHandler(BaseHTTPRequestHandler):
    server_version = "MilkyBloomAgentic/1.0"

    def do_OPTIONS(self):
        _json_response(self, 204, {})

    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/health":
            _json_response(
                self,
                200,
                {
                    "ok": True,
                    "service": "agentic-ai",
                    "provider": os.getenv("EMPATHY_MODE", "featherless"),
                },
            )
            return

        if path == "/providers":
            _json_response(
                self,
                200,
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
            return

        _json_response(self, 404, {"error": "Not found"})

    def do_POST(self):
        path = urlparse(self.path).path
        if path != "/chat":
            _json_response(self, 404, {"error": "Not found"})
            return

        length = int(self.headers.get("Content-Length", "0") or 0)
        raw = self.rfile.read(length) if length > 0 else b"{}"

        try:
            payload = json.loads(raw.decode("utf-8") or "{}")
        except json.JSONDecodeError:
            _json_response(self, 400, {"error": "Invalid JSON"})
            return

        message = payload.get("message")
        if not message:
            _json_response(self, 400, {"error": "message is required"})
            return

        history = payload.get("history") or []
        session_id = payload.get("session_id") or payload.get("sessionId") or ""
        shop_context = payload.get("shop_context") or payload.get("context") or {}

        try:
            final_state = asyncio.run(
                run_streaming(
                    question=message,
                    history=history,
                    session_id=session_id,
                    shop_context=shop_context,
                    stream_callback=None,
                )
            )
        except Exception as exc:
            _json_response(
                self,
                503,
                {
                    "error": str(exc),
                    "provider": "agentic",
                },
            )
            return

        _json_response(
            self,
            200,
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
            },
        )

    def log_message(self, format, *args):
        return


def main():
    port = int(os.getenv("PORT", "8787"))
    if os.getenv("AGENTIC_WARMUP", "false").lower() == "true":
        startup_warmup()

    server = ThreadingHTTPServer(("0.0.0.0", port), AgenticHandler)
    print(f"Agentic AI listening on http://0.0.0.0:{port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
