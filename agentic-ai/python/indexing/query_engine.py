"""
Query Engine — Hybrid Retrieval + Reranking.

Tái sử dụng retrieval/hybrid_search.py + retrieval/reranker.py.
Cung cấp interface đơn giản cho LangGraph retrieve node.
"""
import asyncio
import json
import re
import sys
import unicodedata
from pathlib import Path

sys.path.append(str(Path(__file__).parent.parent))

import numpy as np
from rich.console import Console

from config import TOP_K_RETRIEVAL, TOP_K_RERANK
from retrieval.qdrant_client import QdrantWrapper
from retrieval.hybrid_search import hybrid_search
from retrieval.reranker import rerank
from agents.model_registry import get_embed_model

from utils.console import console

# Singleton
_qdrant: QdrantWrapper | None = None
_local_policy_cache: list[dict] | None = None
_local_policy_source: dict | None = None
_POLICY_FILE = Path(__file__).resolve().parents[2] / "data" / "mykingdom_policies.json"



def _get_qdrant() -> QdrantWrapper:
    """Lazy load Qdrant connection."""
    global _qdrant
    if _qdrant is None:
        _qdrant = QdrantWrapper()
    return _qdrant


def _normalize_text(text: str) -> str:
    normalized = unicodedata.normalize("NFD", text or "")
    normalized = "".join(ch for ch in normalized if unicodedata.category(ch) != "Mn")
    normalized = normalized.replace("Đ", "d").replace("đ", "d")
    return re.sub(r"\s+", " ", normalized).strip().lower()


def _load_local_policy_documents() -> list[dict]:
    global _local_policy_cache, _local_policy_source
    if _local_policy_cache is not None:
        return _local_policy_cache

    if not _POLICY_FILE.exists():
        _local_policy_cache = []
        _local_policy_source = {}
        return _local_policy_cache

    payload = json.loads(_POLICY_FILE.read_text(encoding="utf-8"))
    _local_policy_source = payload.get("metadata", {}) or {}
    policies = payload.get("policies", []) or []

    docs: list[dict] = []
    for policy in policies:
        title = policy.get("title", "Unknown Policy")
        summary = policy.get("summary", "")
        keywords = ", ".join(policy.get("keywords", []) or [])
        url = policy.get("url", "")
        sections = policy.get("sections", []) or []
        for section_index, section in enumerate(sections, 1):
            heading = section.get("heading", "")
            content = section.get("content", "")
            text = "\n".join(
                part for part in [
                    f"Tên chính sách: {title}",
                    f"Tóm tắt: {summary}",
                    f"Từ khóa: {keywords}",
                    f"URL: {url}",
                    f"Phần: {heading}",
                    content,
                ]
                if part
            )
            docs.append(
                {
                    "id": f"local:{policy.get('id', title)}:{section_index}",
                    "score": 0.0,
                    "text": text,
                    "level": 0,
                    "doc_title": title,
                    "node_id": section_index,
                    "policy_id": policy.get("id", ""),
                    "category": title,
                    "url": url,
                    "compensation_limit": 0,
                    "_policy_keywords": policy.get("keywords", []) or [],
                    "_policy_summary": summary,
                    "_policy_section_heading": heading,
                    "_policy_section_index": section_index,
                }
            )

    _local_policy_cache = docs
    return _local_policy_cache


def _local_policy_score(query_norm: str, doc: dict) -> float:
    if not query_norm:
        return 0.0

    text = _normalize_text(doc.get("text", ""))
    title = _normalize_text(doc.get("doc_title", ""))
    summary = _normalize_text(doc.get("_policy_summary", ""))
    keywords = " ".join(_normalize_text(k) for k in doc.get("_policy_keywords", []) if k)

    score = 0.0
    for token in query_norm.split():
        if len(token) <= 1:
            continue
        if token in title:
            score += 6.0
        if token in summary:
            score += 4.0
        if token in keywords:
            score += 5.0
        if token in text:
            score += 2.0

    for phrase in (
        "bao hanh",
        "doi tra",
        "hoan tien",
        "huy don",
        "van chuyen",
        "giao hang",
        "thanh toan",
        "bao mat",
        "thanh vien",
        "store",
        "cua hang",
    ):
        if phrase in query_norm and phrase in text:
            score += 8.0

    return score


def _local_policy_fallback(query: str, top_k: int) -> list[dict]:
    docs = _load_local_policy_documents()
    if not docs:
        return []

    query_norm = _normalize_text(query)
    grouped: dict[str, dict] = {}
    for doc in docs:
        policy_id = doc.get("policy_id", "") or doc.get("doc_title", "")
        score = _local_policy_score(query_norm, doc)
        current = grouped.get(policy_id)
        if current is None or score > current["score"] or (
            score == current["score"]
            and doc.get("_policy_section_index", 0) < current["doc"].get("_policy_section_index", 0)
        ):
            grouped[policy_id] = {"score": score, "doc": doc}

    ranked = sorted(
        grouped.values(),
        key=lambda item: (item["score"], item["doc"].get("_policy_section_index", 0)),
        reverse=True,
    )

    selected_entries = [item for item in ranked if item["score"] > 0]
    if not selected_entries:
        selected_entries = ranked[:top_k]
    else:
        selected_entries = selected_entries[:top_k]

    results: list[dict] = []
    for item in selected_entries:
        doc = item["doc"]
        score = item["score"]
        results.append(
            {
                "id": doc.get("id", ""),
                "score": score,
                "text": doc.get("text", ""),
                "level": doc.get("level", 0),
                "doc_title": doc.get("doc_title", ""),
                "node_id": doc.get("node_id", 0),
                "policy_id": doc.get("policy_id", ""),
                "category": doc.get("category", ""),
                "url": doc.get("url", ""),
                "compensation_limit": doc.get("compensation_limit", 0),
                "rerank_score": score,
                "rrf_score": score,
                "source": "local_policy_fallback",
            }
        )
    return results


def retrieve(
    query: str,
    top_k: int = TOP_K_RETRIEVAL,
) -> list[dict]:
    """
    Hybrid search (Dense + Sparse + RRF) trên Qdrant.

    Args:
        query: Query tiếng Việt hoặc rewritten query
        top_k: Số kết quả trả về

    Returns:
        List[dict] — mỗi dict chứa text, doc_title, policy_id, category, rrf_score, compensation_limit
    """
    try:
        model = get_embed_model()
        qdrant = _get_qdrant()

        # Embed query
        query_vector = model.encode(query, normalize_embeddings=True)

        # Hybrid search
        results = hybrid_search(
            query_vector=np.array(query_vector),
            query_text=query,
            qdrant=qdrant,
            top_k=top_k,
        )

        if not results:
            fallback_results = _local_policy_fallback(query, top_k)
            if fallback_results:
                console.print(
                    f"[yellow]⚠️ Retrieve fallback: using {len(fallback_results)} local policy docs[/]"
                )
                return fallback_results

        return results
    except Exception as exc:
        console.print(f"[yellow]⚠️ Retrieve fallback: {exc}[/]")
        fallback_results = _local_policy_fallback(query, top_k)
        if fallback_results:
            console.print(
                f"[yellow]⚠️ Local policy fallback returned {len(fallback_results)} docs[/]"
            )
            return fallback_results
        return []


def retrieve_and_rerank(
    query: str,
    top_k_search: int = TOP_K_RETRIEVAL,
    top_k_rerank: int = TOP_K_RERANK,
) -> list[dict]:
    """
    Hybrid Search → Cross-encoder Reranking (synchronous).

    Pipeline:
    1. Hybrid search (Dense + Sparse + RRF) → top_k_search candidates
    2. Cross-encoder reranking (BGE-Reranker-v2-M3) → top_k_rerank final
    """
    candidates = retrieve(query, top_k=top_k_search)

    if not candidates:
        console.print("[yellow]⚠️ No results from hybrid search[/]")
        return []

    return rerank(
        query=query,
        documents=candidates,
        top_k=top_k_rerank,
    )


async def retrieve_and_rerank_async(
    query: str,
    top_k_search: int = TOP_K_RETRIEVAL,
    top_k_rerank: int = TOP_K_RERANK,
) -> list[dict]:
    """
    Async wrapper của retrieve_and_rerank.
    Chạy trong thread pool → không block asyncio event loop trong khi
    BGE-M3 encode + Qdrant network call + CrossEncoder predict đang xử lý.
    """
    return await asyncio.to_thread(
        retrieve_and_rerank, query, top_k_search, top_k_rerank
    )


def format_evidence(documents: list[dict]) -> str:
    """
    Format retrieved policy documents thành context cho LLM.
    """
    if not documents:
        return ""

    parts = []
    for i, doc in enumerate(documents, 1):
        title = doc.get("doc_title", "Unknown Policy")
        text = doc.get("text", "")
        score = doc.get("rerank_score", doc.get("rrf_score", 0))

        parts.append(
            f"[Chính sách {i}] {title}\n"
            f"Độ phù hợp: {score:.4f}\n"
            f"{text}\n"
        )

    return "\n---\n".join(parts)
