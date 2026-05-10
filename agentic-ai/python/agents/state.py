"""
Agent State — Shared state definition cho LangGraph EmpathAI pipeline.
"""
from typing import Any, Optional
from typing_extensions import TypedDict


class AgentState(TypedDict, total=False):
    """State chung cho EmpathAI LangGraph pipeline."""

    # --- Input ---
    session_id: str
    question: str               # Tin nhắn của khách hàng
    history: list[dict]         # Chat history [{role, content}, ...]
    shop_context: dict          # Real shop access context (auth, email, user_id, etc.)

    # --- Router Output ---
    intent: str                 # "COMPLAINT" | "INQUIRY" | "CASUAL"

    # --- Sentiment Analysis Output ---
    sentiment: str              # "toxic" | "frustrated" | "disappointed" | "neutral"
    sentiment_score: float      # 0.0 - 1.0

    # --- Retrieval Output ---
    evidence: list[dict]        # Retrieved & reranked policy chunks
    evidence_text: str          # Formatted policy context cho LLM
    policy_context: str         # Chính sách áp dụng cụ thể
    compensation: str           # Gợi ý bồi thường từ RAG

    # --- Rewrite Loop ---
    rewrite_count: int
    is_evidence_sufficient: bool
    translated_query: str       # Query đã được rewrite (không dịch, chỉ rewrite)

    # --- Order Tool Output ---
    order_id: str               # Mã đơn hàng extracted từ tin nhắn
    phone_number: str          # Số điện thoại extracted từ tin nhắn
    order_info: dict            # {found, status, summary, return_eligible, ...}
    suggested_actions: list     # ["create_ticket", "escalate_to_supervisor", ...]

    # --- Action Executor Output ---
    action_intent: dict         # {action, executable, new_address, block_reason, ...}
    action_result: dict         # {success, action, message, ticket_id, updated_fields}
    pending_action_intent: dict # Multi-turn: action from previous turn waiting for order_id

    # --- Generation Output ---
    answer: str                 # Phản hồi thấu cảm cuối cùng

    # --- Reviewer Output ---
    reviewer_triggered: bool
    reviewer_result: dict       # {is_approved, issues, retry_count}

    # --- Metadata ---
    agent_trace: dict
    processing_time_ms: int

    # --- Streaming ---
    stream_callback: Any
