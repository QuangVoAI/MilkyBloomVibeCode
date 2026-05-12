"""
Chatbot metrics sink.

Ghi trace của mỗi lượt chat thành JSONL để:
  - quan sát router/action confidence
  - thống kê fallback / clarify
  - phục vụ dashboard admin
  - làm nguồn dữ liệu regression/eval

Module này phải cực kỳ an toàn: lỗi ghi log không được làm gãy luồng chat.
"""
from __future__ import annotations

import json
import os
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable


ROOT_DIR = Path(__file__).resolve().parents[2]
RUNTIME_DIR = ROOT_DIR / "runtime"
METRICS_FILE = RUNTIME_DIR / "chatbot_metrics.jsonl"


def _english_ratio(text: str) -> float:
    if not text:
        return 0.0
    letters = [c for c in text if c.isalpha()]
    if not letters:
        return 0.0
    english_like = sum(1 for c in letters if "a" <= c.lower() <= "z")
    return english_like / max(len(letters), 1)


def _safe_float(value, default: float = 0.0) -> float:
    try:
        return float(value)
    except Exception:
        return default


def _safe_int(value, default: int = 0) -> int:
    try:
        return int(value)
    except Exception:
        return default


def record_chatbot_trace(state: dict) -> None:
    """Append a single final pipeline state to JSONL metrics."""
    try:
        trace = state.get("agent_trace") or {}
        answer = state.get("answer", "") or ""
        router_conf = _safe_float(state.get("router_confidence", trace.get("router_confidence", 0.0)))
        action_conf = _safe_float(state.get("action_confidence", trace.get("action_confidence", 0.0)))
        record = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "trace_id": state.get("trace_id") or trace.get("trace_id") or "",
            "session_id": state.get("session_id") or "",
            "question": state.get("question") or "",
            "intent": state.get("intent") or trace.get("router_decision") or "",
            "router_confidence": router_conf,
            "router_method": state.get("router_method") or trace.get("router_method") or "",
            "router_fallback_used": bool(state.get("router_fallback_used", trace.get("router_fallback_used", False))),
            "router_clarify_reason": state.get("router_clarify_reason") or trace.get("router_clarify_reason") or "",
            "router_semantic_margin": _safe_float(state.get("router_semantic_margin", trace.get("router_semantic_margin", 0.0))),
            "action": (state.get("action_intent") or {}).get("action") or trace.get("action_detected") or "",
            "action_confidence": action_conf,
            "action_method": state.get("action_method") or trace.get("action_method") or "",
            "action_fallback_used": bool(trace.get("action_fallback_used", False)),
            "clarification_needed": bool(state.get("clarification_needed", trace.get("clarification_needed", False))),
            "clarify_reason": state.get("clarify_reason") or trace.get("clarify_reason") or "",
            "reviewer_triggered": bool(state.get("reviewer_triggered", trace.get("reviewer_triggered", False))),
            "processing_time_ms": _safe_int(state.get("processing_time_ms", trace.get("processing_time_ms", 0))),
            "answer_length": len(answer),
            "english_ratio": round(_english_ratio(answer), 4),
            "vietnamese_ok": _english_ratio(answer) < 0.18,
            "policy_version": trace.get("policy_version") or "",
            "router_prompt_version": trace.get("router_prompt_version") or trace.get("prompt_version") or "",
            "action_prompt_version": trace.get("action_prompt_version") or "",
            "empathy_prompt_version": trace.get("empathy_prompt_version") or "",
            "inquiry_prompt_version": trace.get("inquiry_prompt_version") or "",
            "reviewer_prompt_version": trace.get("reviewer_prompt_version") or "",
        }

        RUNTIME_DIR.mkdir(parents=True, exist_ok=True)
        with METRICS_FILE.open("a", encoding="utf-8") as fh:
            fh.write(json.dumps(record, ensure_ascii=False) + "\n")
    except Exception:
        # Intentionally swallow all exceptions to keep chat path resilient.
        return


def load_chatbot_traces(limit: int = 1000) -> list[dict]:
    if not METRICS_FILE.exists():
        return []
    try:
        lines = METRICS_FILE.read_text(encoding="utf-8").splitlines()
    except Exception:
        return []
    if limit > 0:
        lines = lines[-limit:]
    records = []
    for line in lines:
        try:
            records.append(json.loads(line))
        except Exception:
            continue
    return records


def summarize_chatbot_traces(traces: Iterable[dict]) -> dict:
    traces = list(traces)
    total = len(traces)
    if total == 0:
        return {
            "total": 0,
            "lowConfidenceRate": 0.0,
            "clarifyRate": 0.0,
            "keywordFallbackRate": 0.0,
            "vietnameseOkRate": 0.0,
            "avgRouterConfidence": 0.0,
            "avgActionConfidence": 0.0,
            "topIntents": [],
            "topActions": [],
            "latestTraceAt": None,
        }

    router_conf_sum = 0.0
    action_conf_sum = 0.0
    low_confidence = 0
    clarify = 0
    keyword_fallback = 0
    vietnamese_ok = 0
    intents = Counter()
    actions = Counter()
    latest_trace_at = None

    for trace in traces:
        router_conf = _safe_float(trace.get("router_confidence", 0.0))
        action_conf = _safe_float(trace.get("action_confidence", 0.0))
        router_conf_sum += router_conf
        action_conf_sum += action_conf
        if router_conf < 0.45 or action_conf < 0.45:
            low_confidence += 1
        if trace.get("clarification_needed"):
            clarify += 1
        if trace.get("router_method") == "keyword" or trace.get("action_method") == "keyword":
            keyword_fallback += 1
        if trace.get("vietnamese_ok"):
            vietnamese_ok += 1
        intents[trace.get("intent") or "unknown"] += 1
        actions[trace.get("action") or "no_action"] += 1
        latest_trace_at = trace.get("timestamp") or latest_trace_at

    return {
        "total": total,
        "lowConfidenceRate": round(low_confidence / total, 4),
        "clarifyRate": round(clarify / total, 4),
        "keywordFallbackRate": round(keyword_fallback / total, 4),
        "vietnameseOkRate": round(vietnamese_ok / total, 4),
        "avgRouterConfidence": round(router_conf_sum / total, 4),
        "avgActionConfidence": round(action_conf_sum / total, 4),
        "topIntents": [
            {"label": intent, "count": count}
            for intent, count in intents.most_common(5)
        ],
        "topActions": [
            {"label": action, "count": count}
            for action, count in actions.most_common(5)
        ],
        "latestTraceAt": latest_trace_at,
    }


def summarize_chatbot_metrics(limit: int = 1000) -> dict:
    return summarize_chatbot_traces(load_chatbot_traces(limit=limit))
