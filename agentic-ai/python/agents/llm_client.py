"""
LLM client for EmpathAI.

- Groq is the real production provider for the legacy `groq_*` entrypoints.
- Featherless stays available as a first-class OpenAI-compatible backend.
- Vertex helpers remain for compatibility with older branches.
"""
import asyncio
import aiohttp
import json
import time
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
    VERTEX_PROJECT_ID, VERTEX_REGION,
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

    async with aiohttp.ClientSession() as session:
        async with session.post(
            base_url.rstrip("/") + "/chat/completions",
            json=payload,
            headers=_build_openai_headers(api_key, referer=referer, title=title),
            timeout=aiohttp.ClientTimeout(total=120),
        ) as resp:
            if resp.status != 200:
                error_text = await resp.text()
                raise RuntimeError(
                    f"{provider_name.title()} API error ({resp.status}): {error_text[:500]}"
                )

            result = await resp.json()
            choices = result.get("choices", [])
            if choices:
                return choices[0].get("message", {}).get("content", "")
            return ""


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

    async with aiohttp.ClientSession() as session:
        async with session.post(
            base_url.rstrip("/") + "/chat/completions",
            json=payload,
            headers=_build_openai_headers(api_key, referer=referer, title=title),
            timeout=aiohttp.ClientTimeout(total=90),
        ) as resp:
            if resp.status != 200:
                error_text = await resp.text()
                raise RuntimeError(
                    f"{provider_name.title()} stream error ({resp.status}): {error_text[:500]}"
                )

            async for raw_line in resp.content:
                line = raw_line.decode("utf-8", errors="ignore").strip()
                if not line or not line.startswith("data:"):
                    continue

                data_str = line[5:].strip()
                if data_str == "[DONE]":
                    return

                try:
                    chunk = json.loads(data_str)
                    delta = (
                        chunk.get("choices", [{}])[0]
                        .get("delta", {})
                        .get("content", "")
                    )
                    if delta:
                        yield delta
                except (json.JSONDecodeError, IndexError, AttributeError):
                    continue


# ─── Vertex AI Gemini Completion ─────────────────────────────

@observe(name="vertex_gemini_complete", as_type="generation")
async def vertex_gemini_complete(
    messages: list[dict],
    model: str = "gemini-1.5-flash",
    max_tokens: int = 4096,
    temperature: float = 0.1,
) -> str:
    """Vertex AI Gemini chat completion using Google Cloud SDK."""
    import vertexai
    from vertexai.generative_models import GenerativeModel, Content, Part
    
    vertexai.init(project=VERTEX_PROJECT_ID, location=VERTEX_REGION)
    
    # Extract system instruction and format contents
    system_instruction = None
    contents = []
    
    for msg in messages:
        role = msg.get("role", "user")
        content = msg.get("content", "")
        
        if role == "system":
            system_instruction = content
        else:
            # Vertex roles: 'user', 'model'
            v_role = "user" if role != "assistant" else "model"
            contents.append(Content(role=v_role, parts=[Part.from_text(content)]))
            
    v_model = GenerativeModel(model, system_instruction=system_instruction)
    
    response = await v_model.generate_content_async(
        contents,
        generation_config={
            "temperature": temperature,
            "max_output_tokens": max_tokens,
        }
    )
    return response.text


# ─── Vertex AI Custom Endpoint (Fine-tuned Model) ─────────────────────────────

# Cache endpoint URL and access token
_vertex_endpoint_url: str | None = None
_vertex_access_token: str = ""
_vertex_token_expiry: float = 0.0
_VERTEX_TOKEN_TTL = 3000  # Refresh token every 50 minutes (GCP tokens last ~60min)


def _get_vertex_endpoint_url() -> str:
    """Build Vertex AI Custom Endpoint URL from project config."""
    global _vertex_endpoint_url
    if _vertex_endpoint_url is not None:
        return _vertex_endpoint_url
    
    # Format: https://REGION-aiplatform.googleapis.com/v1/projects/PROJECT_ID/locations/REGION/endpoints/ENDPOINT_ID
    # Endpoint ID can be set via env or inferred
    import os
    endpoint_id = os.getenv("VERTEX_ENDPOINT_ID", "")
    
    if endpoint_id:
        _vertex_endpoint_url = (
            f"https://{VERTEX_REGION}-aiplatform.googleapis.com/v1/"
            f"projects/{VERTEX_PROJECT_ID}/locations/{VERTEX_REGION}/"
            f"endpoints/{endpoint_id}"
        )
    else:
        # Try to get from gcloud or raise error
        _vertex_endpoint_url = os.getenv("VERTEX_ENDPOINT_URL", "")
    
    return _vertex_endpoint_url


@observe(name="vertex_custom_complete", as_type="generation")
async def vertex_custom_complete(
    messages: list[dict],
    max_tokens: int = 512,
    temperature: float = 0.7,
) -> str:
    """
    Legacy compatibility wrapper.
    Kept for older call sites, but now routes to Featherless.
    """
    return await featherless_complete(
        messages=messages,
        model=FEATHERLESS_MODEL_SMART,
        max_tokens=max_tokens,
        temperature=temperature,
    )


# Alias for backward compatibility - vertex mode uses custom endpoint for fine-tuned model
async def vertex_chat_complete(
    messages: list[dict],
    model: str = "gemini-1.5-flash",
    max_tokens: int = 4096,
    temperature: float = 0.1,
) -> str:
    """
    Vertex AI chat completion - auto-selects Gemini or Custom Endpoint.
    If model starts with 'projects/' it's a custom endpoint, else Gemini.
    """
    if model.startswith("projects/") or model.startswith("custom:"):
        return await vertex_custom_complete(
            messages=messages,
            max_tokens=max_tokens,
            temperature=temperature,
        )
    return await vertex_gemini_complete(
        messages=messages,
        model=model,
        max_tokens=max_tokens,
        temperature=temperature,
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


@observe(name="groq_chat_complete", as_type="generation")
async def groq_chat_complete(
    messages: list[dict],
    model: str = GROQ_MODEL_SMART,
    max_tokens: int = 4096,
    temperature: float = 0.1,
) -> str:
    """Featherless completion with the legacy chat-complete name."""
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


async def featherless_complete(
    messages: list[dict],
    model: str = FEATHERLESS_MODEL_SMART,
    max_tokens: int = 4096,
    temperature: float = 0.1,
) -> str:
    """Featherless completion (non-streaming)."""
    return await _openai_chat_complete(
        messages=messages,
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


@observe(name="groq_stream_chat_complete", as_type="generation")
async def groq_stream_chat_complete(
    messages: list[dict],
    model: str = GROQ_MODEL_SMART,
    max_tokens: int = 4096,
    temperature: float = 0.1,
) -> AsyncGenerator[str, None]:
    """Groq streaming chat completion via OpenAI-compatible SSE."""
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
        yield token


async def featherless_stream_complete(
    messages: list[dict],
    model: str = FEATHERLESS_MODEL_SMART,
    max_tokens: int = 4096,
    temperature: float = 0.1,
) -> AsyncGenerator[str, None]:
    """Streaming chat completion via Featherless SSE."""
    async for token in _openai_stream_complete(
        messages=messages,
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
