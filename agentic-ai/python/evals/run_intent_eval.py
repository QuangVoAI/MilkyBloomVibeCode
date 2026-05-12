"""
Run a deterministic regression eval for intent + action extraction.

Usage:
    cd agentic-ai/python
    python -m evals.run_intent_eval

Outputs:
    - console summary
    - JSON report under agentic-ai/evals/reports/intent_eval_latest.json
    - Markdown report under agentic-ai/evals/reports/intent_eval_latest.md
"""
from __future__ import annotations

import argparse
import json
import hashlib
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from rich.console import Console
from rich.table import Table

from agents.router import classify_with_metadata
from tools.action_tool import detect_action_intent

from evals.intent_eval_cases import EVAL_CASES


console = Console(force_terminal=True)
ROOT_DIR = Path(__file__).resolve().parents[2]
REPORT_DIR = ROOT_DIR / "evals" / "reports"
TRANSCRIPT_CASES_FILE = ROOT_DIR / "evals" / "transcript_eval_cases.json"
RUNTIME_TRACE_FILE = ROOT_DIR / "runtime" / "chatbot_metrics.jsonl"


def _safe_ratio(correct: int, total: int) -> float:
    return round((correct / total) if total else 0.0, 4)


def _trace_to_case(trace: dict) -> dict | None:
    question = str(trace.get("question") or "").strip()
    if not question:
        return None
    intent = str(trace.get("intent") or "").strip() or "COMPLAINT"
    action = str(trace.get("action") or "").strip() or None
    route = "clarify" if trace.get("clarification_needed") or trace.get("router_method") == "clarify" else None
    if route is None:
        route = "casual" if intent == "CASUAL" else ("inquiry" if intent == "INQUIRY" else "complaint")
    return {
        "case_id": trace.get("trace_id") or f"trace_{hashlib.sha1(question.encode('utf-8')).hexdigest()[:10]}",
        "question": question,
        "expected_intent": intent,
        "expected_action": action,
        "expected_route": route,
        "order_info": {},
        "source": "chatbot_trace",
        "source_category": "runtime_metrics",
        "created_at": trace.get("timestamp"),
    }


def _load_runtime_trace_cases() -> list[dict]:
    if not RUNTIME_TRACE_FILE.exists():
        return []
    try:
        lines = RUNTIME_TRACE_FILE.read_text(encoding="utf-8").splitlines()
    except Exception:
        return []

    cases: list[dict] = []
    seen_questions: set[str] = set()
    for line in lines:
        try:
            trace = json.loads(line)
        except Exception:
            continue
        case = _trace_to_case(trace)
        if not case:
            continue
        key = f"{case['question']}|{case['expected_intent']}|{case['expected_action'] or ''}"
        if key in seen_questions:
            continue
        seen_questions.add(key)
        cases.append(case)
    return cases


def evaluate_case(case: dict) -> dict:
    question = case["question"]
    order_info = case.get("order_info", {}) or {}

    router_meta = classify_with_metadata(question)
    action_meta = detect_action_intent(question, order_info)

    expected_intent = case.get("expected_intent", "")
    expected_action = case.get("expected_action")
    expected_route = case.get("expected_route")

    clarify_case = expected_route == "clarify"
    intent_ok = router_meta["intent"] == expected_intent
    if clarify_case:
        intent_ok = True
    route_ok = True
    if expected_route == "clarify":
        route_ok = router_meta.get("method") == "clarify"

    action_ok = True
    if expected_action is not None:
        action_ok = action_meta.get("action") == expected_action

    return {
        "case_id": case.get("case_id", ""),
        "question": question,
        "expected_intent": expected_intent,
        "predicted_intent": router_meta["intent"],
        "intent_ok": intent_ok,
        "expected_route": expected_route,
        "predicted_route": router_meta.get("method"),
        "route_ok": route_ok,
        "expected_action": expected_action,
        "predicted_action": action_meta.get("action"),
        "action_ok": action_ok,
        "clarify_case": clarify_case,
        "router_confidence": router_meta.get("confidence", 0.0),
        "router_method": router_meta.get("method", ""),
        "action_confidence": (action_meta.get("confidence") or {}).get("confidence", 0.0),
        "action_method": (action_meta.get("confidence") or {}).get("method", ""),
        "keyword_fallback": router_meta.get("method") == "keyword" or (action_meta.get("confidence") or {}).get("method") == "keyword",
        "clarify": router_meta.get("method") == "clarify",
        "order_info": order_info,
    }


def build_report(results: list[dict]) -> dict:
    total = len(results)
    intent_cases = [r for r in results if not r.get("clarify_case")]
    clarify_cases = [r for r in results if r.get("clarify_case")]
    intent_correct = sum(1 for r in intent_cases if r["intent_ok"])
    route_correct = sum(1 for r in results if r["route_ok"])
    action_cases = [r for r in results if r["expected_action"] is not None]
    action_correct = sum(1 for r in action_cases if r["action_ok"])
    keyword_fallback = sum(1 for r in results if r["keyword_fallback"])
    clarify_count = sum(1 for r in results if r["clarify"])

    intent_counts = Counter(r["predicted_intent"] for r in results)
    action_counts = Counter(r["predicted_action"] for r in results)
    failures = [r for r in results if not (r["intent_ok"] and r["route_ok"] and r["action_ok"])]

    return {
        "total_cases": total,
        "intent_accuracy": _safe_ratio(intent_correct, len(intent_cases)),
        "route_accuracy": _safe_ratio(route_correct, total),
        "action_accuracy": _safe_ratio(action_correct, len(action_cases)),
        "keyword_fallback_rate": _safe_ratio(keyword_fallback, total),
        "clarify_rate": _safe_ratio(clarify_count, total),
        "clarify_cases": len(clarify_cases),
        "intent_evaluable_cases": len(intent_cases),
        "predicted_intents": dict(intent_counts),
        "predicted_actions": dict(action_counts),
        "failures": failures[:25],
    }


def write_reports(report: dict) -> None:
    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    (REPORT_DIR / "intent_eval_latest.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    lines = [
        "# Intent Eval Report",
        "",
        f"- Total cases: {report['total_cases']}",
        f"- Intent accuracy: {report['intent_accuracy']:.2%}",
        f"- Route accuracy: {report['route_accuracy']:.2%}",
        f"- Action accuracy: {report['action_accuracy']:.2%}",
        f"- Clarify cases excluded from intent accuracy: {report.get('clarify_cases', 0)}",
        f"- Keyword fallback rate: {report['keyword_fallback_rate']:.2%}",
        f"- Clarify rate: {report['clarify_rate']:.2%}",
        "",
        "## Failures",
    ]
    failures = report.get("failures", [])
    if not failures:
        lines.append("- None")
    else:
        for item in failures:
            lines.append(
                f"- `{item['case_id']}` | intent `{item['expected_intent']}` -> `{item['predicted_intent']}` "
                f"| action `{item['expected_action']}` -> `{item['predicted_action']}` "
                f"| route `{item['expected_route']}` -> `{item['predicted_route']}`"
            )

    (REPORT_DIR / "intent_eval_latest.md").write_text("\n".join(lines), encoding="utf-8")


def print_report(report: dict) -> None:
    console.print(
        f"[bold cyan]Intent accuracy:[/] {report['intent_accuracy']:.2%}  "
        f"[bold cyan]Route accuracy:[/] {report['route_accuracy']:.2%}  "
        f"[bold cyan]Action accuracy:[/] {report['action_accuracy']:.2%}"
    )
    console.print(
        f"[dim]Cases={report['total_cases']} | keyword fallback={report['keyword_fallback_rate']:.2%} | clarify={report['clarify_rate']:.2%}[/]"
    )

    table = Table(title="Top Failures", show_header=True, header_style="bold")
    table.add_column("Case")
    table.add_column("Question", overflow="fold")
    table.add_column("Expected")
    table.add_column("Predicted")

    for item in report.get("failures", [])[:10]:
        table.add_row(
            item["case_id"],
            item["question"],
            f"I:{item['expected_intent']} A:{item['expected_action']} R:{item['expected_route']}",
            f"I:{item['predicted_intent']} A:{item['predicted_action']} R:{item['predicted_route']}",
        )

    if report.get("failures"):
        console.print(table)
    else:
        console.print("[green]No failures found in the corpus.[/]")


def main() -> int:
    parser = argparse.ArgumentParser(description="Run fixed intent regression eval")
    parser.add_argument("--limit", type=int, default=0, help="Limit the number of cases")
    args = parser.parse_args()

    cases = []
    source = "synthetic-fallback"

    if TRANSCRIPT_CASES_FILE.exists():
        try:
            transcript_cases = json.loads(TRANSCRIPT_CASES_FILE.read_text(encoding="utf-8"))
            if isinstance(transcript_cases, list) and len(transcript_cases) > 0:
                cases = transcript_cases[: args.limit] if args.limit > 0 else transcript_cases
                source = "transcript"
            else:
                runtime_cases = _load_runtime_trace_cases()
                if runtime_cases:
                    cases = runtime_cases[: args.limit] if args.limit > 0 else runtime_cases
                    source = "runtime-traces"
                else:
                    cases = EVAL_CASES[: args.limit] if args.limit > 0 else EVAL_CASES
        except Exception:
            runtime_cases = _load_runtime_trace_cases()
            if runtime_cases:
                cases = runtime_cases[: args.limit] if args.limit > 0 else runtime_cases
                source = "runtime-traces"
            else:
                cases = EVAL_CASES[: args.limit] if args.limit > 0 else EVAL_CASES
    else:
        runtime_cases = _load_runtime_trace_cases()
        if runtime_cases:
            cases = runtime_cases[: args.limit] if args.limit > 0 else runtime_cases
            source = "runtime-traces"
        else:
            cases = EVAL_CASES[: args.limit] if args.limit > 0 else EVAL_CASES

    console.print(f"[bold]Running intent eval on {len(cases)} cases ({source})...[/]")

    results = [evaluate_case(case) for case in cases]
    report = build_report(results)
    write_reports(report)
    print_report(report)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
