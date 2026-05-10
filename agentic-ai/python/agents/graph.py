"""
LangGraph Agent Orchestration — EmpathAI Pipeline.

Flow:
  START -> router
        |-- CASUAL -> casual_response -> END
        |-- INQUIRY -> retrieve -> grade -> inquiry_writer -> END
        |-- COMPLAINT -> sentiment_analyzer -> retrieve -> grade_documents
                                                |-- GOOD -> empathy_writer -> reviewer -> END
                                                |-- BAD (retries < 2) -> rewrite -> retrieve (loop)
                                                |-- BAD (retries >= 2) -> empathy_writer -> reviewer -> END

Entry point: run_streaming(question, history, stream_callback)
"""
import asyncio
import time
import sys
import re
from pathlib import Path
sys.path.append(str(Path(__file__).parent.parent))

from typing import Callable, Awaitable, Optional
from langgraph.graph import StateGraph, END

from agents.state import AgentState
from agents.router import classify
from agents.sentiment_analyzer import sentiment_analyzer_node
from agents.empathy_writer import (
    generate_empathy_streaming, generate_casual, generate_inquiry,
)
from agents.reviewer import review_with_retry, _check_banned_phrases, _is_repetitive
from agents.grader import grade_documents_node
from agents.rewriter import rewrite_query_node
from agents.llm_client import observe
from indexing.query_engine import retrieve_and_rerank_async, format_evidence
from tools.order_tool import (
    extract_order_id,
    extract_phone_number,
    get_order_info,
    get_order_info_by_phone,
    determine_suggested_actions,
)
from tools.action_tool import detect_action_intent, execute_action, resume_action_intent

from config import MAX_REWRITE_RETRIES
from utils.console import console

# Session-level pending actions for multi-turn action execution
# Format: {session_id: {"action": str, ...}}
_session_pending_actions: dict[str, dict] = {}


# ================================================================
# Graph Nodes
# ================================================================

def order_lookup_node(state: AgentState) -> dict:
    """Node: Trích xuất mã đơn hàng từ tin nhắn + tra cứu trong mock DB."""
    t0 = time.time()
    question = state["question"]
    history = state.get("history", [])
    shop_context = state.get("shop_context", {}) or {}

    all_text = question + " " + " ".join(
        m.get("content", "") for m in history[-5:]
    )

    order_id = extract_order_id(all_text)
    phone_number = extract_phone_number(all_text) if not order_id else None
    order_info: dict = {}
    suggested_actions: list = []

    pending_action_intent: dict = {}
    session_id = state.get("session_id", "")

    if order_id:
        order_info = get_order_info(order_id, shop_context)
    elif phone_number:
        order_info = get_order_info_by_phone(phone_number, shop_context)
    else:
        console.print("[dim]  OrderLookup: no order ID in message[/]")

    if order_info:
        sentiment = state.get("sentiment", "")
        suggested_actions = determine_suggested_actions(order_info, sentiment)
        lookup_label = f"order '{order_id}'" if order_id else f"phone '{phone_number}'"
        found_str = "found" if order_info.get("found") else "not found"
        console.print(
            f"[dim]  OrderLookup: {lookup_label} -> {found_str} "
            f"(status: {order_info.get('status', '-')})[/]"
        )

        # Multi-turn: if order found and session has pending action, resume it
        if order_info.get("found") and session_id and session_id in _session_pending_actions:
            pending_action_intent = _session_pending_actions.pop(session_id)
            console.print(
                f"[dim]  OrderLookup: resumed pending action '{pending_action_intent.get('action')}' "
                f"for session {session_id}[/]"
            )

    elapsed = int((time.time() - t0) * 1000)

    return {
        "order_id": order_id or "",
        "phone_number": phone_number or "",
        "order_info": order_info,
        "suggested_actions": suggested_actions,
        "pending_action_intent": pending_action_intent,
        "agent_trace": {
            **(state.get("agent_trace") or {}),
            "order_id_extracted": order_id,
            "phone_extracted": phone_number,
            "order_found": bool(order_info.get("found")),
            "order_status": order_info.get("status", ""),
            "order_lookup_ms": elapsed,
        },
    }


def action_executor_node(state: AgentState) -> dict:
    """Node: Phát hiện intent hành động + thực thi mock action trên DB.
    Supports multi-turn: saves pending action when needs_order_id / needs_more_info,
    resumes pending action when order is provided in a later turn.
    """
    t0 = time.time()
    question = state["question"]
    order_info = state.get("order_info", {})
    session_id = state.get("session_id", "")
    pending = state.get("pending_action_intent", {})
    shop_context = state.get("shop_context", {}) or {}
    order_id = state.get("order_id", "")
    phone_number = state.get("phone_number", "")
    identifier_only = bool(re.fullmatch(r"[\d\+\-\s\(\)]{8,}", question.strip()))

    # Multi-turn resume: if order_lookup found a pending action for this session
    if pending and order_info.get("found"):
        action_intent = resume_action_intent(question, order_info, pending)
        console.print(
            f"[dim]  ActionExecutor: resumed pending action '{pending.get('action')}' "
            f"with order {order_info.get('order_id', '')}[/]"
        )
    elif order_info.get("found") and identifier_only and (order_id or phone_number):
        action_intent = {
            "action": "check_order_status",
            "executable": True,
            "needs_order_id": False,
            "block_reason": "",
        }
        console.print(
            f"[dim]  ActionExecutor: identifier-only input -> defaulting to check_order_status "
            f"(order={order_info.get('order_id', '')})[/]"
        )
    else:
        action_intent = detect_action_intent(question, order_info)

    action = action_intent.get("action", "no_action")

    # Save pending action for next turn if we need order_id or more info
    if action != "no_action" and session_id:
        if action_intent.get("needs_order_id") or action_intent.get("needs_more_info"):
            _session_pending_actions[session_id] = {"action": action}
            console.print(
                f"[dim]  ActionExecutor: saved pending action '{action}' "
                f"for session {session_id}[/]"
            )

    action_result: dict = {}
    if action == "check_order_status" and order_info.get("found"):
        action_result = {
            "success": True,
            "action": action,
            "message": order_info.get("summary", ""),
            "ticket_id": None,
            "updated_fields": {},
        }
        console.print(
            f"[dim]  ActionExecutor: {action} -> OK "
            f"(order: {order_info.get('order_id', '-')})[/]"
        )
    elif action != "no_action" and not action_intent.get("needs_order_id") and not action_intent.get("needs_more_info"):
        action_result = execute_action(action_intent, order_info, shop_context)
        status = "OK" if action_result.get("success") else ("BLOCKED" if action_result.get("blocked") else "FAIL")
        console.print(
            f"[dim]  ActionExecutor: {action} -> {status} "
            f"(ticket: {action_result.get('ticket_id', '-')})[/]"
        )
    else:
        console.print(f"[dim]  ActionExecutor: {action} -> {'PENDING' if action != 'no_action' else 'no action'}[/]")

    elapsed = int((time.time() - t0) * 1000)

    return {
        "action_intent": action_intent,
        "action_result": action_result,
        "agent_trace": {
            **(state.get("agent_trace") or {}),
            "action_detected": action,
            "action_success": action_result.get("success", False),
            "action_ticket": action_result.get("ticket_id"),
            "action_blocked": action_result.get("blocked", False),
            "action_needs_order_id": action_intent.get("needs_order_id", False),
            "action_needs_more_info": action_intent.get("needs_more_info", False),
            "action_pending_saved": session_id in _session_pending_actions,
            "action_executor_ms": elapsed,
        },
    }


def router_node(state: AgentState) -> dict:
    """Node 1: Classify intent (COMPLAINT / INQUIRY / CASUAL)."""
    t0 = time.time()
    question = state["question"]

    history = state.get("history", [])
    contextualized_q = _build_contextualized_question(question, history)

    intent = classify(contextualized_q)

    elapsed = int((time.time() - t0) * 1000)
    console.print(f"[dim]  Router: {intent} ({elapsed}ms)[/]")

    return {
        "intent": intent,
        "agent_trace": {
            **(state.get("agent_trace") or {}),
            "router_decision": intent,
            "router_ms": elapsed,
        },
    }


async def casual_node(state: AgentState) -> dict:
    """Node: Casual response (không cần RAG)."""
    answer = await generate_casual(state["question"])
    return {
        "answer": answer,
        "reviewer_triggered": False,
        "reviewer_result": {"is_approved": True, "issues": [], "retry_count": 0},
    }


async def retrieve_node(state: AgentState) -> dict:
    """Node: Hybrid Search + Rerank tren policy DB (async, non-blocking)."""
    t0 = time.time()
    # Use rewritten query if available, otherwise use original question
    query = state.get("translated_query", state["question"])

    documents = await retrieve_and_rerank_async(query)
    evidence_text = format_evidence(documents)

    elapsed = int((time.time() - t0) * 1000)
    console.print(
        f"[dim]  Retrieved: {len(documents)} docs, "
        f"{len(evidence_text)} chars ({elapsed}ms)[/]"
    )

    return {
        "evidence": documents,
        "evidence_text": evidence_text,
        "agent_trace": {
            **(state.get("agent_trace") or {}),
            "retrieved_count": len(documents),
            "retrieve_ms": elapsed,
        },
    }


async def empathy_writer_node(state: AgentState) -> dict:
    """Node: Generate empathetic response with streaming."""
    t0 = time.time()
    question = state["question"]
    evidence_text = state.get("evidence_text", "")
    sentiment = state.get("sentiment", "")
    sentiment_score = state.get("sentiment_score", 0)
    compensation = state.get("compensation", "")
    order_info = state.get("order_info", {})
    action_result = state.get("action_result", {})
    action_intent = state.get("action_intent", {})
    stream_callback = state.get("stream_callback")

    answer = await generate_empathy_streaming(
        question=question,
        evidence_text=evidence_text,
        sentiment=sentiment,
        score=sentiment_score,
        compensation=compensation,
        order_info=order_info,
        action_result=action_result,
        action_intent=action_intent,
        stream_callback=stream_callback,
    )

    elapsed = int((time.time() - t0) * 1000)
    console.print(f"[dim]  EmpathyWriter: {len(answer)} chars ({elapsed}ms)[/]")

    return {
        "answer": answer,
        "agent_trace": {
            **(state.get("agent_trace") or {}),
            "writer_answer": answer[:500],
            "writer_ms": elapsed,
        },
    }


async def inquiry_writer_node(state: AgentState) -> dict:
    """Node: Answer inquiry based on policy (no sentiment needed)."""
    t0 = time.time()
    question = state["question"]
    evidence_text = state.get("evidence_text", "")
    order_info = state.get("order_info", {})

    answer = await generate_inquiry(question, evidence_text, order_info=order_info)

    elapsed = int((time.time() - t0) * 1000)
    console.print(f"[dim]  InquiryWriter: {len(answer)} chars ({elapsed}ms)[/]")

    return {
        "answer": answer,
        "reviewer_triggered": False,
        "reviewer_result": {"is_approved": True, "issues": [], "retry_count": 0},
        "agent_trace": {
            **(state.get("agent_trace") or {}),
            "inquiry_answer": answer[:500],
            "inquiry_ms": elapsed,
        },
    }


async def order_status_writer_node(state: AgentState) -> dict:
    """Node: Trả lời trạng thái đơn hàng ngắn gọn, không qua RAG."""
    t0 = time.time()
    order_info = state.get("order_info", {}) or {}
    order_id = order_info.get("order_id", state.get("order_id", ""))
    status = (order_info.get("status") or "").lower()
    customer_name = order_info.get("customer_name", "")
    items = order_info.get("items", []) or []
    item_names = ", ".join(
        i.get("name") or i.get("productId", {}).get("name") or "sản phẩm"
        for i in items[:3]
    )
    item_suffix = f" ({item_names})" if item_names else ""

    if not order_info.get("found"):
        matched_phone = order_info.get("matched_phone", "")
        answer = (
            "Mình chưa tìm thấy đơn hàng nào khớp với thông tin bạn gửi."
            f"{f' Số điện thoại mình tra là {matched_phone}.' if matched_phone else ''} "
            "Bạn gửi giúp mình mã đơn hàng hoặc email đặt hàng nhé."
        )
    elif status == "delivered":
        answer = (
            f"Mình đã tra được đơn {order_id}{item_suffix} rồi nhé.\n"
            "Đơn này đã được giao thành công rồi nè.\n"
            "Nếu bạn muốn, mình có thể xem tiếp phần hỗ trợ đổi trả hoặc bảo hành cho đơn này."
        )
    elif status == "shipping":
        answer = (
            f"Mình đã tra được đơn {order_id}{item_suffix} rồi nhé.\n"
            "Đơn hiện đang trong trạng thái vận chuyển.\n"
            "Mình có thể giúp bạn theo dõi thêm nếu bạn muốn."
        )
    elif status == "processing":
        answer = (
            f"Mình đã tra được đơn {order_id}{item_suffix} rồi nhé.\n"
            "Đơn hiện đang được xử lý / đóng gói.\n"
            "Khi đơn chuyển sang vận chuyển, mình sẽ báo bạn tiếp nha."
        )
    elif status == "cancelled":
        answer = (
            f"Mình đã tra được đơn {order_id}{item_suffix} rồi nhé.\n"
            "Đơn này đã được hủy rồi.\n"
            "Nếu bạn cần mình xem thêm trạng thái hoàn tiền, mình kiểm tra tiếp cho bạn."
        )
    else:
        answer = (
            f"Mình đã tra được đơn {order_id}{item_suffix} rồi nhé.\n"
            f"Trạng thái hiện tại của đơn là: {status or 'không rõ'}."
        )

    if customer_name and customer_name not in answer:
        answer = f"Chào {customer_name}! " + answer

    stream_callback = state.get("stream_callback")
    if stream_callback:
        for chunk in [line for line in answer.split("\n") if line]:
            await stream_callback(chunk + "\n")

    elapsed = int((time.time() - t0) * 1000)
    console.print(f"[dim]  OrderStatusWriter: {len(answer)} chars ({elapsed}ms)[/]")

    return {
        "answer": answer,
        "reviewer_triggered": False,
        "reviewer_result": {"is_approved": True, "issues": [], "retry_count": 0},
        "agent_trace": {
            **(state.get("agent_trace") or {}),
            "order_status_answer": answer[:500],
            "order_status_ms": elapsed,
        },
    }


async def reviewer_node(state: AgentState) -> dict:
    """Node: Empathy quality check."""
    t0 = time.time()
    question = state["question"]
    answer = state.get("answer", "")
    evidence_text = state.get("evidence_text", "")
    sentiment = state.get("sentiment", "")

    # Fast quality checks — không LLM, không dựa vào sentiment hay keyword
    banned = _check_banned_phrases(answer)
    repetitive = _is_repetitive(answer)
    reviewer_triggered = bool(banned or repetitive)

    if reviewer_triggered:
        issues = [f"Văn mẫu bị cấm: '{p}'" for p in banned]
        if repetitive:
            issues.append("Câu trả lời bị lặp lại")
        console.print(f"[yellow]  Reviewer triggered: {issues}[/]")
        action_result = state.get("action_result") or {}
        if action_result.get("blocked"):
            action_context = action_result.get("message", "")
        elif action_result.get("success"):
            action_context = action_result.get("message", "")
        else:
            action_context = ""
        final_answer, reviewer_result = await review_with_retry(
            question, answer, evidence_text, sentiment, action_context
        )
    else:
        console.print("[dim]  Reviewer skipped[/]")
        final_answer = answer
        reviewer_result = {"is_approved": True, "issues": [], "retry_count": 0}

    elapsed = int((time.time() - t0) * 1000)

    return {
        "answer": final_answer,
        "reviewer_triggered": reviewer_triggered,
        "reviewer_result": reviewer_result,
        "agent_trace": {
            **(state.get("agent_trace") or {}),
            "reviewer_triggered": reviewer_triggered,
            "reviewer_result": reviewer_result,
            "reviewer_ms": elapsed,
        },
    }


# ================================================================
# Conditional Edges
# ================================================================

def route_by_intent(state: AgentState) -> str:
    intent = state.get("intent", "")
    session_id = state.get("session_id", "")
    question = state.get("question", "")
    history = state.get("history", [])
    all_text = question + " " + " ".join(m.get("content", "") for m in history[-5:])
    has_order_clue = bool(extract_order_id(all_text) or extract_phone_number(all_text))

    # Multi-turn override: if session has a pending action waiting for order_id,
    # force complaint path so action_executor can resume it
    if session_id and session_id in _session_pending_actions:
        console.print(
            f"[dim]  Router: session {session_id} has pending action "
            f"'{_session_pending_actions[session_id].get('action')}' — forcing COMPLAINT path[/]"
        )
        return "complaint"

    if has_order_clue:
        console.print("[dim]  Router: detected order clue (order id / phone) — forcing COMPLAINT path[/]")
        return "complaint"

    if intent == "CASUAL":
        return "casual"
    elif intent == "INQUIRY":
        return "inquiry"
    else:
        return "complaint"


def route_by_grade(state: AgentState) -> str:
    if state.get("is_evidence_sufficient", True):
        return "good"
    if state.get("rewrite_count", 0) >= MAX_REWRITE_RETRIES:
        return "give_up"
    return "rewrite"


# ================================================================
# Graph Builder
# ================================================================

def build_graph() -> StateGraph:
    """Build LangGraph StateGraph cho EmpathAI pipeline."""
    graph = StateGraph(AgentState)

    # Add nodes
    graph.add_node("router", router_node)
    graph.add_node("casual", casual_node)
    graph.add_node("order_lookup", order_lookup_node)
    graph.add_node("order_lookup_inquiry", order_lookup_node)
    graph.add_node("action_executor", action_executor_node)
    graph.add_node("sentiment", sentiment_analyzer_node)
    graph.add_node("retrieve", retrieve_node)
    graph.add_node("grade", grade_documents_node)
    graph.add_node("rewrite", rewrite_query_node)
    graph.add_node("empathy_writer", empathy_writer_node)
    graph.add_node("inquiry_writer", inquiry_writer_node)
    graph.add_node("order_status_writer", order_status_writer_node)
    graph.add_node("reviewer", reviewer_node)

    # Entry point
    graph.set_entry_point("router")

    # Router -> 3 branches
    graph.add_conditional_edges(
        "router",
        route_by_intent,
        {
            "casual": "casual",
            "inquiry": "order_lookup_inquiry",
            "complaint": "order_lookup",
        },
    )

    # Casual -> END
    graph.add_edge("casual", END)

    # Complaint: order_lookup -> action_executor -> sentiment -> retrieve
    graph.add_edge("order_lookup", "action_executor")
    graph.add_edge("action_executor", "sentiment")

    # If we still need an order id or extra info, answer directly with empathy
    # instead of forcing retrieval / rerank. This keeps order-status turns fast.
    def route_after_sentiment(state):
        action_intent = state.get("action_intent") or {}
        order_info = state.get("order_info", {}) or {}
        if action_intent.get("action") == "check_order_status" and order_info.get("found"):
            return "status"
        if action_intent.get("needs_order_id") or action_intent.get("needs_more_info"):
            return "direct"
        return "retrieve"

    graph.add_conditional_edges(
        "sentiment",
        route_after_sentiment,
        {
            "status": "order_status_writer",
            "direct": "empathy_writer",
            "retrieve": "retrieve",
        },
    )

    # Inquiry: order_lookup_inquiry -> retrieve (no sentiment needed)
    graph.add_edge("order_lookup_inquiry", "retrieve")

    # Both INQUIRY and COMPLAINT share: retrieve -> grade
    graph.add_edge("retrieve", "grade")

    # Combined routing after grade:
    # - INQUIRY intent -> inquiry_writer
    # - COMPLAINT + good evidence -> empathy_writer
    # - COMPLAINT + bad evidence + retries left -> rewrite
    # - COMPLAINT + bad evidence + no retries -> empathy_writer (give up)
    def route_after_grade(state):
        intent = state.get("intent", "")
        if intent == "INQUIRY":
            return "inquiry_writer"
        # Nếu Qdrant trả về 0 docs (timeout/corpus rỗng), give up ngay
        # tránh lãng phí 2× rewrite LLM call (~3s mỗi lần)
        if len(state.get("evidence", [])) == 0 and state.get("rewrite_count", 0) >= 1:
            return "give_up"
        # For COMPLAINT, check evidence quality
        if state.get("is_evidence_sufficient", True):
            return "good"
        if state.get("rewrite_count", 0) >= MAX_REWRITE_RETRIES:
            return "give_up"
        return "rewrite"

    graph.add_conditional_edges(
        "grade",
        route_after_grade,
        {
            "inquiry_writer": "inquiry_writer",
            "good": "empathy_writer",
            "rewrite": "rewrite",
            "give_up": "empathy_writer",
        },
    )

    # Rewrite -> loop back to retrieve
    graph.add_edge("rewrite", "retrieve")

    # Writers -> reviewers / END
    graph.add_edge("order_status_writer", END)
    graph.add_edge("empathy_writer", "reviewer")
    graph.add_edge("reviewer", END)
    graph.add_edge("inquiry_writer", END)

    return graph.compile()


# ================================================================
# Entry Point
# ================================================================

_compiled_graph = None


def _get_graph():
    global _compiled_graph
    if _compiled_graph is None:
        _compiled_graph = build_graph()
    return _compiled_graph


def startup_warmup():
    """Pre-load toàn bộ models, centroids và compile graph.
    
    Gọi hàm này ở startup của server/test để loại bỏ hoàn toàn
    cold-start 5-10s ở request đầu tiên.
    
    Usage (FastAPI):
        @app.on_event("startup")
        async def on_startup():
            startup_warmup()
    
    Usage (CLI/test):
        from agents.graph import startup_warmup
        startup_warmup()
    """
    from agents.model_registry import warmup
    warmup()          # Models + centroids
    _get_graph()      # Compile LangGraph
    console.print("[bold green]🚀 EmpathAI pipeline ready![/]")


@observe(name="empathAI_pipeline", as_type="generation")
async def run_streaming(
    question: str,
    history: list[dict] = None,
    session_id: str = "",
    shop_context: dict | None = None,
    stream_callback: Optional[Callable[[str], Awaitable[None]]] = None,
) -> dict:
    """Run full EmpathAI pipeline with streaming."""
    start_time = time.time()
    console.print(f"[cyan]Incoming: '{question[:60]}...'[/]")

    graph = _get_graph()

    initial_state: AgentState = {
        "session_id": session_id,
        "question": question,
        "history": history or [],
        "shop_context": shop_context or {},
        "intent": "",
        "sentiment": "",
        "sentiment_score": 0.0,
        "translated_query": "",
        "evidence": [],
        "evidence_text": "",
        "policy_context": "",
        "compensation": "",
        "rewrite_count": 0,
        "order_id": "",
        "order_info": {},
        "suggested_actions": [],
        "action_intent": {},
        "action_result": {},
        "pending_action_intent": {},
        "is_evidence_sufficient": True,
        "answer": "",
        "reviewer_triggered": False,
        "reviewer_result": {},
        "agent_trace": {},
        "processing_time_ms": 0,
        "stream_callback": stream_callback,
    }

    final_state = await graph.ainvoke(initial_state)

    processing_time = int((time.time() - start_time) * 1000)
    final_state["processing_time_ms"] = processing_time

    console.print(f"[green]Done in {processing_time}ms[/]")
    return final_state


# ================================================================
# Utility
# ================================================================

def _build_contextualized_question(question, history):
    if not history:
        return question

    recent = history[-6:]
    context = "Lịch sử hội thoại:\n"
    for msg in recent:
        role = "Khách" if msg.get("role") == "user" else "Bot"
        content = msg.get("content", "")[:200]
        context += f"- {role}: {content}\n"

    context += f"\nTin nhắn hiện tại: {question}"
    return context
