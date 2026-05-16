"""
Langfuse observability helpers.

The module stays import-safe: config loads .env before Langfuse is imported, and
all SDK calls degrade gracefully when tracing is not configured.
"""
import re
import sys
from pathlib import Path
from typing import Any

sys.path.append(str(Path(__file__).parent.parent))

from config import (  # noqa: E402
    LANGFUSE_BASE_URL,
    LANGFUSE_HOST,
    LANGFUSE_PUBLIC_KEY,
    LANGFUSE_SECRET_KEY,
)
from utils.console import console  # noqa: E402

_langfuse_client = None
_langfuse_available = False

_MAX_TEXT_CHARS = 4000
_SENSITIVE_KEY_PARTS = (
    "authorization",
    "token",
    "secret",
    "password",
    "api_key",
    "apikey",
    "cookie",
)


def _mask_email(match: re.Match) -> str:
    value = match.group(0)
    name, domain = value.split("@", 1)
    if len(name) <= 2:
        return f"{name[:1]}***@{domain}"
    return f"{name[:2]}***@{domain}"


def _mask_phone(match: re.Match) -> str:
    value = match.group(0)
    digits = re.sub(r"\D", "", value)
    if len(digits) < 7:
        return value
    return f"***{digits[-4:]}"


def redact_for_langfuse(value: Any, max_chars: int = _MAX_TEXT_CHARS) -> Any:
    """Return a Langfuse-safe copy with common secrets and PII masked."""
    if value is None or isinstance(value, (bool, int, float)):
        return value

    if isinstance(value, str):
        text = value
        text = re.sub(r"Bearer\s+[A-Za-z0-9._~+/=-]+", "Bearer ***", text, flags=re.I)
        text = re.sub(r"\b(?:sk|pk)-[A-Za-z0-9][A-Za-z0-9._-]{8,}\b", "***", text)
        text = re.sub(
            r"\b[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b",
            _mask_email,
            text,
        )
        text = re.sub(
            r"(?<!\w)(?:\+?\d[\d\s().-]{7,}\d)(?!\w)",
            _mask_phone,
            text,
        )
        if len(text) > max_chars:
            return text[:max_chars] + "\n[...truncated...]"
        return text

    if isinstance(value, list):
        return [redact_for_langfuse(item, max_chars=max_chars) for item in value]

    if isinstance(value, tuple):
        return tuple(redact_for_langfuse(item, max_chars=max_chars) for item in value)

    if isinstance(value, dict):
        redacted = {}
        for key, item in value.items():
            key_text = str(key)
            lowered = key_text.lower()
            if any(part in lowered for part in _SENSITIVE_KEY_PARTS):
                redacted[key] = "***"
            else:
                redacted[key] = redact_for_langfuse(item, max_chars=max_chars)
        return redacted

    return redact_for_langfuse(str(value), max_chars=max_chars)


def langfuse_safe_messages(messages: list[dict] | None) -> list[dict]:
    safe_messages = []
    for message in messages or []:
        role = str(message.get("role") or "")
        content = message.get("content") or ""
        if role == "system":
            content = "[system prompt omitted]"
        safe_messages.append(
            {
                "role": role,
                "content": redact_for_langfuse(content, max_chars=2000),
            }
        )
    return safe_messages


def openai_usage_details(usage: dict | None) -> dict[str, int] | None:
    if not isinstance(usage, dict):
        return None

    details = {
        "input_tokens": usage.get("prompt_tokens"),
        "output_tokens": usage.get("completion_tokens"),
        "total_tokens": usage.get("total_tokens"),
    }
    details = {key: int(value) for key, value in details.items() if value is not None}
    return details or None


def _ensure_langfuse_env() -> None:
    if LANGFUSE_SECRET_KEY:
        import os

        os.environ.setdefault("LANGFUSE_SECRET_KEY", LANGFUSE_SECRET_KEY)
    if LANGFUSE_PUBLIC_KEY:
        import os

        os.environ.setdefault("LANGFUSE_PUBLIC_KEY", LANGFUSE_PUBLIC_KEY)
    if LANGFUSE_BASE_URL:
        import os

        os.environ.setdefault("LANGFUSE_BASE_URL", LANGFUSE_BASE_URL)
    if LANGFUSE_HOST:
        import os

        os.environ.setdefault("LANGFUSE_HOST", LANGFUSE_HOST)


def get_langfuse():
    """Lazy-init and return the Langfuse v4 client, or None if disabled."""
    global _langfuse_client, _langfuse_available

    if _langfuse_client is not None:
        return _langfuse_client if _langfuse_available else None

    if not LANGFUSE_SECRET_KEY or not LANGFUSE_PUBLIC_KEY:
        console.print("[dim]  Langfuse: Not configured, tracing disabled[/]")
        _langfuse_available = False
        return None

    try:
        _ensure_langfuse_env()
        from langfuse import get_client

        _langfuse_client = get_client()
        _langfuse_available = True
        console.print("[green]  Langfuse: Connected[/]")
        return _langfuse_client
    except Exception as e:
        console.print(f"[yellow]  Langfuse: Init failed: {e}[/]")
        _langfuse_available = False
        return None


def update_current_span_safe(**kwargs) -> None:
    try:
        client = get_langfuse()
        if client:
            client.update_current_span(**kwargs)
    except Exception:
        pass


def update_current_generation_safe(**kwargs) -> None:
    try:
        client = get_langfuse()
        if client:
            client.update_current_generation(**kwargs)
    except Exception:
        pass


def flush_langfuse():
    """Flush pending Langfuse events for workers, scripts, and request tails."""
    try:
        client = get_langfuse()
        if client:
            client.flush()
    except Exception:
        pass
