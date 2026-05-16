"""
LLM client for EmpathAI.

- Groq is the primary production provider for the `groq_*` entrypoints.
- Featherless stays available as a first-class OpenAI-compatible fallback.
"""
import asyncio
import aiohttp
import json
from typing import AsyncGenerator

import sys
from pathlib import Path
sys.path.append(str(Path(__file__).parent.parent))
from config import (
    GROQ_API_KEY,
    GROQ_BASE_URL,
    GROQ_MODEL,
    GROQ_MODEL_FAST,
    GROQ_MODEL_SMART,
    GROQ_HTTP_REFERER,
    GROQ_X_TITLE,
    FEATHERLESS_API_KEY,
    FEATHERLESS_BASE_URL,
    FEATHERLESS_MODEL,
    FEATHERLESS_MODEL_FAST,
    FEATHERLESS_MODEL_SMART,
    FEATHERLESS_HTTP_REFERER,
    FEATHERLESS_X_TITLE,
)
from utils.observability import (
    langfuse_safe_messages,
    openai_usage_details,
    redact_for_langfuse,
    update_current_generation_safe,
)

# Langfuse decorator (graceful fallback if not configured)
try:
    from langfuse import observe as _observe
    def observe(**kwargs):
        """Wrapper that silently degrades if Langfuse is not configured."""
        return _observe(**kwargs)
except ImportError:
    def observe(**kwargs):
        """No-op decorator when langfuse not installed."""
        def decorator(func):
            return func
        return decorator


# ─── Constants ───────────────────────────────────────────
GROQ_CHAT_API_URL = GROQ_BASE_URL.rstrip("/") + "/chat/completions"
FEATHERLESS_CHAT_API_URL = FEATHERLESS_BASE_URL.rstrip("/") + "/chat/completions"

# Token limits
FEATHERLESS_MAX_INPUT_TOKENS = 12000
GROQ_MAX_INPUT_TOKENS = 12000

# Tokenizer
try:
    import tiktoken
    _ENCODER = tiktoken.get_encoding("cl100k_base")
except ImportError:
    _ENCODER = None

# ─── Token Utilities ─────────────────────────────────────

def _count_tokens(text: str) -> int:
    if _ENCODER is not None:
        return len(_ENCODER.encode(text, disallowed_special=()))
    # Fallback gần đúng khi môi trường dev chưa cài tiktoken.
    return max(1, len(text.split()))


def _truncate_text(text: str, max_tokens: int) -> str:
    if _ENCODER is not None:
        tokens = _ENCODER.encode(text, disallowed_special=())
        if len(tokens) <= max_tokens:
            return text
        return _ENCODER.decode(tokens[:max_tokens]) + "\n[...truncated...]"

    words = text.split()
    if len(words) <= max_tokens:
        return text
    return " ".join(words[:max_tokens]) + "\n[...truncated...]"


def _truncate_messages(
    messages: list[dict],
    max_total_tokens: int = FEATHERLESS_MAX_INPUT_TOKENS,
) -> list[dict]:
    """Cắt ngắn messages nếu prompt quá dài cho request non-stream."""
    total = sum(_count_tokens(m.get("content", "")) for m in messages)
    if total <= max_total_tokens:
        return messages

    longest_idx = max(
        range(len(messages)),
        key=lambda i: _count_tokens(messages[i].get("content", "")),
    )

    overflow = total - max_total_tokens
    longest_content = messages[longest_idx]["content"]
    longest_tokens = _count_tokens(longest_content)
    new_max = max(500, longest_tokens - overflow)

    truncated = list(messages)
    truncated[longest_idx] = {
        **messages[longest_idx],
        "content": _truncate_text(longest_content, new_max),
    }
    return truncated

def _build_openai_headers(api_key: str, referer: str = "", title: str = "") -> dict:
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    if referer:
        headers["HTTP-Referer"] = referer
    if title:
        headers["X-Title"] = title
    return headers


def _build_openai_payload(
    messages: list[dict],
    model: str,
    max_tokens: int,
    temperature: float,
    stream: bool = False,
) -> dict:
    payload = {
        "model": model or FEATHERLESS_MODEL_SMART or FEATHERLESS_MODEL,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
    }
    if stream:
        payload["stream"] = True
    return payload


_FEATHERLESS_VIETNAMESE_GUARD = (
    "Bạn bắt buộc phải trả lời hoàn toàn bằng tiếng Việt. "
    "Nếu thiếu dữ liệu hoặc thấy câu hỏi mơ hồ, hãy hỏi lại ngắn gọn thay vì đoán. "
    "Không thêm giải thích thừa, không dùng tiếng Anh nếu không cần."
)


def _with_featherless_guard(messages: list[dict]) -> list[dict]:
    """Add a Vietnamese/precision guard for fallback outputs."""
    if any(
        message.get("role") == "system"
        and _FEATHERLESS_VIETNAMESE_GUARD in (message.get("content") or "")
        for message in messages or []
    ):
        return list(messages)
    return [{"role": "system", "content": _FEATHERLESS_VIETNAMESE_GUARD}, *(messages or [])]


async def _openai_chat_complete(
    *,
    messages: list[dict],
    model: str,
    api_key: str,
    base_url: str,
    referer: str = "",
    title: str = "",
    max_tokens: int = 4096,
    temperature: float = 0.1,
    provider_name: str = "provider",
    max_input_tokens: int = 12000,
) -> str:
    if not api_key:
        raise RuntimeError(
            f"{provider_name.upper()}_API_KEY is not configured. "
            f"Set it in agentic-ai/.env or export it before running."
        )

    if model == GROQ_MODEL_FAST or model == FEATHERLESS_MODEL_FAST:
        messages = _truncate_messages(messages, max_input_tokens)
        max_tokens = min(max_tokens, 1500)

    payload = _build_openai_payload(
        messages=messages,
        model=model,
        max_tokens=max_tokens,
        temperature=temperature,
        stream=False,
    )
    update_current_generation_safe(
        input={"messages": langfuse_safe_messages(messages)},
        model=model,
        model_parameters={
            "temperature": temperature,
            "max_tokens": max_tokens,
            "stream": False,
        },
        metadata={"provider": provider_name},
    )

    async with aiohttp.ClientSession() as session:
        async with session.post(
            base_url.rstrip("/") + "/chat/completions",
            json=payload,
            headers=_build_openai_headers(api_key, referer=referer, title=title),
            timeout=aiohttp.ClientTimeout(total=120),
        ) as resp:
            if resp.status != 200:
                error_text = await resp.text()
                update_current_generation_safe(
                    level="ERROR",
                    status_message=f"{provider_name.title()} API error ({resp.status})",
                    output=redact_for_langfuse(error_text[:500]),
                )
                raise RuntimeError(
                    f"{provider_name.title()} API error ({resp.status}): {error_text[:500]}"
                )

            result = await resp.json()
            choices = result.get("choices", [])
            if choices:
                content = choices[0].get("message", {}).get("content", "")
            else:
                content = ""
            update_current_generation_safe(
                output=redact_for_langfuse(content),
                usage_details=openai_usage_details(result.get("usage")),
            )
            return content


async def _openai_stream_complete(
    *,
    messages: list[dict],
    model: str,
    api_key: str,
    base_url: str,
    referer: str = "",
    title: str = "",
    max_tokens: int = 4096,
    temperature: float = 0.1,
    provider_name: str = "provider",
    max_input_tokens: int = 12000,
) -> AsyncGenerator[str, None]:
    if not api_key:
        raise RuntimeError(
            f"{provider_name.upper()}_API_KEY is not configured. "
            f"Set it in agentic-ai/.env or export it before running."
        )

    if model == GROQ_MODEL_FAST or model == FEATHERLESS_MODEL_FAST:
        messages = _truncate_messages(messages, max_input_tokens)
        max_tokens = min(max_tokens, 1500)

    payload = _build_openai_payload(
        messages=messages,
        model=model,
        max_tokens=max_tokens,
        temperature=temperature,
        stream=True,
    )
    update_current_generation_safe(
        input={"messages": langfuse_safe_messages(messages)},
        model=model,
        model_parameters={
            "temperature": temperature,
            "max_tokens": max_tokens,
            "stream": True,
        },
        metadata={"provider": provider_name},
    )
    output_parts: list[str] = []

    async with aiohttp.ClientSession() as session:
        async with session.post(
            base_url.rstrip("/") + "/chat/completions",
            json=payload,
            headers=_build_openai_headers(api_key, referer=referer, title=title),
            timeout=aiohttp.ClientTimeout(total=90),
        ) as resp:
            if resp.status != 200:
                error_text = await resp.text()
                update_current_generation_safe(
                    level="ERROR",
                    status_message=f"{provider_name.title()} stream error ({resp.status})",
                    output=redact_for_langfuse(error_text[:500]),
                )
                raise RuntimeError(
                    f"{provider_name.title()} stream error ({resp.status}): {error_text[:500]}"
                )

            async for raw_line in resp.content:
                line = raw_line.decode("utf-8", errors="ignore").strip()
                if not line or not line.startswith("data:"):
                    continue

                data_str = line[5:].strip()
                if data_str == "[DONE]":
                    update_current_generation_safe(
                        output=redact_for_langfuse("".join(output_parts)),
                    )
                    return

                try:
                    chunk = json.loads(data_str)
                    delta = (
                        chunk.get("choices", [{}])[0]
                        .get("delta", {})
                        .get("content", "")
                    )
                    if delta:
                        output_parts.append(delta)
                        yield delta
                except (json.JSONDecodeError, IndexError, AttributeError):
                    continue
            update_current_generation_safe(
                output=redact_for_langfuse("".join(output_parts)),
            )


# ─── Non-Streaming Completion ────────────────────────────

async def groq_complete(
    prompt: str,
    system_prompt: str = "",
    model: str = GROQ_MODEL_SMART,
    max_tokens: int = 4096,
    temperature: float = 0.1,
) -> str:
    """Groq completion (non-streaming), giữ tên legacy cho compat."""
    messages = []
    if system_prompt:
        messages.append({"role": "system", "content": system_prompt})
    messages.append({"role": "user", "content": prompt})

    return await groq_chat_complete(
        messages=messages,
        model=model,
        max_tokens=max_tokens,
        temperature=temperature,
    )


@observe(name="groq_chat_complete", as_type="generation", capture_input=False, capture_output=False)
async def groq_chat_complete(
    messages: list[dict],
    model: str = GROQ_MODEL_SMART,
    max_tokens: int = 4096,
    temperature: float = 0.1,
) -> str:
    """Groq completion with automatic Featherless fallback."""
    try:
        return await _openai_chat_complete(
            messages=messages,
            model=model,
            api_key=GROQ_API_KEY,
            base_url=GROQ_BASE_URL,
            referer=GROQ_HTTP_REFERER,
            title=GROQ_X_TITLE,
            max_tokens=max_tokens,
            temperature=temperature,
            provider_name="groq",
            max_input_tokens=GROQ_MAX_INPUT_TOKENS,
        )
    except Exception as groq_error:
        if not FEATHERLESS_API_KEY:
            raise
        fallback_model = (
            FEATHERLESS_MODEL_SMART
            if model in {GROQ_MODEL_SMART, GROQ_MODEL}
            else FEATHERLESS_MODEL_FAST
        )
        print(f"[llm] Groq failed ({groq_error}); falling back to Featherless.")
        return await featherless_complete(
            messages=messages,
            model=fallback_model,
            max_tokens=max_tokens,
            temperature=temperature,
        )


async def featherless_complete(
    messages: list[dict],
    model: str = FEATHERLESS_MODEL_SMART,
    max_tokens: int = 4096,
    temperature: float = 0.1,
) -> str:
    """Featherless completion (non-streaming)."""
    return await _openai_chat_complete(
        messages=_with_featherless_guard(messages),
        model=model,
        api_key=FEATHERLESS_API_KEY,
        base_url=FEATHERLESS_BASE_URL,
        referer=FEATHERLESS_HTTP_REFERER,
        title=FEATHERLESS_X_TITLE,
        max_tokens=max_tokens,
        temperature=temperature,
        provider_name="featherless",
        max_input_tokens=FEATHERLESS_MAX_INPUT_TOKENS,
    )


# ─── Streaming Completion ────────────────────────────────

async def groq_stream_complete(
    prompt: str,
    system_prompt: str = "",
    model: str = GROQ_MODEL_SMART,
    max_tokens: int = 4096,
    temperature: float = 0.1,
) -> AsyncGenerator[str, None]:
    """Groq streaming completion — yield từng token chunk."""
    messages = []
    if system_prompt:
        messages.append({"role": "system", "content": system_prompt})
    messages.append({"role": "user", "content": prompt})

    async for token in groq_stream_chat_complete(
        messages=messages,
        model=model,
        max_tokens=max_tokens,
        temperature=temperature,
    ):
        yield token


@observe(name="groq_stream_chat_complete", as_type="generation", capture_input=False, capture_output=False)
async def groq_stream_chat_complete(
    messages: list[dict],
    model: str = GROQ_MODEL_SMART,
    max_tokens: int = 4096,
    temperature: float = 0.1,
) -> AsyncGenerator[str, None]:
    """Groq streaming chat completion via OpenAI-compatible SSE.

    If Groq fails before any token is emitted, fall back to Featherless.
    """
    yielded_any = False
    try:
        async for token in _openai_stream_complete(
            messages=messages,
            model=model,
            api_key=GROQ_API_KEY,
            base_url=GROQ_BASE_URL,
            referer=GROQ_HTTP_REFERER,
            title=GROQ_X_TITLE,
            max_tokens=max_tokens,
            temperature=temperature,
            provider_name="groq",
            max_input_tokens=GROQ_MAX_INPUT_TOKENS,
        ):
            yielded_any = True
            yield token
    except Exception as groq_error:
        if yielded_any or not FEATHERLESS_API_KEY:
            raise
        print(f"[llm] Groq stream failed ({groq_error}); falling back to Featherless.")
        fallback_model = (
            FEATHERLESS_MODEL_SMART
            if model in {GROQ_MODEL_SMART, GROQ_MODEL}
            else FEATHERLESS_MODEL_FAST
        )
        async for token in featherless_stream_complete(
            messages=messages,
            model=fallback_model,
            max_tokens=max_tokens,
            temperature=temperature,
        ):
            yield token


async def featherless_stream_complete(
    messages: list[dict],
    model: str = FEATHERLESS_MODEL_SMART,
    max_tokens: int = 4096,
    temperature: float = 0.1,
) -> AsyncGenerator[str, None]:
    """Streaming chat completion via Featherless SSE."""
    async for token in _openai_stream_complete(
        messages=_with_featherless_guard(messages),
        model=model,
        api_key=FEATHERLESS_API_KEY,
        base_url=FEATHERLESS_BASE_URL,
        referer=FEATHERLESS_HTTP_REFERER,
        title=FEATHERLESS_X_TITLE,
        max_tokens=max_tokens,
        temperature=temperature,
        provider_name="featherless",
        max_input_tokens=FEATHERLESS_MAX_INPUT_TOKENS,
    ):
        yield token
