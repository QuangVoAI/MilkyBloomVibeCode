#!/usr/bin/env python3
"""
Benchmark Groq vs Featherless for EmpathAI.

Measures:
- non-stream latency
- time to first streamed chunk
- total streamed chunks
- success / error rate

Usage:
  cd agentic-ai
  python python/benchmark_llm_providers.py
"""
import asyncio
import statistics
import sys
import time
from pathlib import Path

sys.path.append(str(Path(__file__).parent))

from config import (
    GROQ_API_KEY,
    GROQ_MODEL_FAST,
    FEATHERLESS_API_KEY,
    FEATHERLESS_MODEL_FAST,
)
from agents.llm_client import (
    groq_complete,
    groq_stream_complete,
    featherless_complete,
    featherless_stream_complete,
)


PROMPT = "Viết một câu chào hỗ trợ khách hàng ngắn gọn bằng tiếng Việt."
SYSTEM_PROMPT = "Bạn là trợ lý CSKH thân thiện, trả lời ngắn gọn, tự nhiên."
RUNS = 3


async def bench_non_stream(name, fn, prompt_args, model):
    results = []
    errors = []
    for _ in range(RUNS):
        start = time.perf_counter()
        try:
            text = await fn(**prompt_args, model=model, max_tokens=80, temperature=0.2)
            results.append(
                {
                    "seconds": time.perf_counter() - start,
                    "chars": len(text or ""),
                    "text": (text or "")[:140].replace("\n", " "),
                }
            )
        except Exception as exc:
            errors.append(str(exc))
    return {"name": name, "results": results, "errors": errors}


async def bench_stream(name, fn, prompt_args, model):
    results = []
    errors = []
    for _ in range(RUNS):
        start = time.perf_counter()
        first_chunk_at = None
        chunk_count = 0
        try:
            async for chunk in fn(**prompt_args, model=model, max_tokens=80, temperature=0.2):
                chunk_count += 1
                if first_chunk_at is None:
                    first_chunk_at = time.perf_counter() - start
            results.append(
                {
                    "first_chunk_seconds": first_chunk_at,
                    "total_seconds": time.perf_counter() - start,
                    "chunks": chunk_count,
                }
            )
        except Exception as exc:
            errors.append(str(exc))
    return {"name": name, "results": results, "errors": errors}


def summarize_block(title, block):
    print(f"\n=== {title} ===")
    if block["results"]:
        if "first_chunk_seconds" in block["results"][0]:
            firsts = [r["first_chunk_seconds"] for r in block["results"] if r["first_chunk_seconds"] is not None]
            totals = [r["total_seconds"] for r in block["results"]]
            chunks = [r["chunks"] for r in block["results"]]
            print(f"runs: {len(block['results'])}/{RUNS}")
            print(f"first_chunk_avg: {statistics.mean(firsts):.3f}s" if firsts else "first_chunk_avg: n/a")
            print(f"total_avg: {statistics.mean(totals):.3f}s")
            print(f"chunks_avg: {statistics.mean(chunks):.1f}")
            print(f"details: {block['results']}")
        else:
            secs = [r["seconds"] for r in block["results"]]
            chars = [r["chars"] for r in block["results"]]
            print(f"runs: {len(block['results'])}/{RUNS}")
            print(f"latency_avg: {statistics.mean(secs):.3f}s")
            print(f"chars_avg: {statistics.mean(chars):.1f}")
            print(f"details: {block['results']}")
    if block["errors"]:
        print(f"errors({len(block['errors'])}):")
        for err in block["errors"]:
            print(f"  - {err[:300]}")


async def main():
    print("EmpathAI LLM provider benchmark")
    print(f"Prompt: {PROMPT}")
    print(f"Runs/provider: {RUNS}")

    providers = []
    if GROQ_API_KEY:
        providers.append(
            (
                "Groq",
                groq_complete,
                groq_stream_complete,
                {"prompt": PROMPT, "system_prompt": SYSTEM_PROMPT},
                GROQ_MODEL_FAST,
            )
        )
    if FEATHERLESS_API_KEY:
        providers.append(
            (
                "Featherless",
                featherless_complete,
                featherless_stream_complete,
                {"messages": [{"role": "system", "content": SYSTEM_PROMPT}, {"role": "user", "content": PROMPT}]},
                FEATHERLESS_MODEL_FAST,
            )
        )

    if not providers:
        print("No provider keys found in agentic-ai/.env. Add GROQ_API_KEY or FEATHERLESS_API_KEY.")
        return 1

    for name, complete_fn, stream_fn, prompt_args, model in providers:
        non_stream = await bench_non_stream(name, complete_fn, prompt_args, model)
        summarize_block(f"{name} non-stream", non_stream)

        stream = await bench_stream(name, stream_fn, prompt_args, model)
        summarize_block(f"{name} stream", stream)

    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
