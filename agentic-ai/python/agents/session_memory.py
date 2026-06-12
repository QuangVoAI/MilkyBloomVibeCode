"""Session Memory Layer — Conversation Context for EmpathAI.

Tracks per-session state: user intent, viewed products, budget, pending issues.
Compresses to <100 tokens for LLM injection.
"""
import time
import re
import unicodedata
from typing import Any, Optional
from typing_extensions import TypedDict


class SessionSummary(TypedDict, total=False):
    """Per-session conversation summary."""
    user_intent: str                      # Primary user goal
    viewed_products: list[dict]           # Product history: [{id, name, price, stock}, ...]
    budget: dict                          # {"min": int, "max": int, "currency": "VND"}
    pending_issues: list[str]             # ["waiting_for_order_id", "needs_verification", ...]
    last_capability: str                  # Last detected capability
    last_policy_topic: str                # Last policy asked (return/cancel/warranty)
    last_order: dict                      # Last order context: {order_id, status, address}
    interaction_count: int                # Turns in this session
    last_updated: float                   # Unix timestamp
    summary_text: str                     # Compressed <100 tokens for LLM
    session_tone: str                     # casual | professional | friendly


class SessionMemoryManager:
    """Manage per-session conversation state."""

    @staticmethod
    async def build_summary(state: dict) -> SessionSummary:
        """Build session summary from current turn + history."""
        session_id = state.get("session_id", "")
        question = state.get("question", "")
        history = state.get("history", [])

        # Extract from existing session profiles (if available)
        order_profile = state.get("order_info", {})
        catalog_profile = state.get("catalog_info", {})

        # Extract budget from question
        budget = _extract_budget(question)

        # Determine user intent from capability
        capability = state.get("capability", "")
        intent_map = {
            "order_management": "check/modify order",
            "catalog": "browse products",
            "checkout": "make purchase",
            "loyalty": "manage loyalty",
            "inquiry": "ask question",
            "support_ticket": "request support",
            "casual": "conversation",
        }
        user_intent = intent_map.get(capability, capability)

        # Extract pending issues
        pending_issues = []
        action_intent = state.get("action_intent", {})
        if action_intent.get("gate_decision") == "request_data":
            if action_intent.get("required_field") == "order_id":
                pending_issues.append("waiting_for_order_id")
            if "verification" in action_intent.get("block_reason", "").lower():
                pending_issues.append("needs_verification")

        if state.get("ownership_verified") is False:
            pending_issues.append("needs_verification")

        # Build summary dict
        summary: SessionSummary = {
            "user_intent": user_intent,
            "viewed_products": catalog_profile.get("products", []) if catalog_profile else [],
            "budget": budget,
            "pending_issues": pending_issues,
            "last_capability": capability,
            "interaction_count": len(history) // 2 + 1,
            "last_updated": time.time(),
        }

        # Add order context if available
        if order_profile.get("found"):
            summary["last_order"] = {
                "order_id": order_profile.get("order_id"),
                "status": order_profile.get("status"),
                "address": order_profile.get("address"),
            }

        # Track policy topics
        if capability == "inquiry":
            if _is_return_policy_question(question):
                summary["last_policy_topic"] = "return_policy"
            elif _is_cancel_policy_question(question):
                summary["last_policy_topic"] = "cancel_policy"
            elif _is_warranty_policy_question(question):
                summary["last_policy_topic"] = "warranty_policy"

        # Compress to text
        summary["summary_text"] = await SessionMemoryManager.compress_for_context(summary)

        return summary

    @staticmethod
    async def compress_for_context(summary: SessionSummary) -> str:
        """Compress summary to <100 tokens for LLM injection."""
        parts = []

        # User intent
        intent = summary.get("user_intent", "")
        if intent:
            parts.append(f"Intent: {intent}")

        # Order context
        order = summary.get("last_order")
        if order:
            parts.append(f"Order: {order.get('order_id')} ({order.get('status')})")

        # Budget
        budget = summary.get("budget", {})
        if budget.get("max"):
            parts.append(f"Budget: <{budget.get('max'):,} VND")

        # Pending issues
        issues = summary.get("pending_issues", [])
        if issues:
            parts.append(f"Pending: {', '.join(issues)}")

        # Interaction count
        count = summary.get("interaction_count", 0)
        if count > 1:
            parts.append(f"Turn {count}")

        return " | ".join(parts)

    @staticmethod
    async def update_summary(session_id: str, state: dict, summaries_dict: dict) -> None:
        """Update global summary dict with new turn info."""
        existing = summaries_dict.get(session_id, {})
        new_summary = await SessionMemoryManager.build_summary(state)

        # Merge: keep older info, update with new
        merged = {**existing, **new_summary}
        merged["last_updated"] = time.time()

        summaries_dict[session_id] = merged

    @staticmethod
    async def get_summary(session_id: str, summaries_dict: dict) -> SessionSummary:
        """Retrieve current session summary."""
        return summaries_dict.get(session_id, {})

    @staticmethod
    async def cleanup_expired(summaries_dict: dict, ttl_seconds: int = 86400) -> None:
        """Remove summaries older than TTL (default 24h)."""
        now = time.time()
        expired = [
            sid for sid, summary in summaries_dict.items()
            if now - summary.get("last_updated", 0) > ttl_seconds
        ]
        for sid in expired:
            del summaries_dict[sid]


# Helper functions

def _normalize_text(text: str) -> str:
    """Normalize Vietnamese text."""
    text = unicodedata.normalize("NFD", text or "")
    text = "".join(ch for ch in text if unicodedata.category(ch) != "Mn")
    text = text.replace("Đ", "d").replace("đ", "d")
    text = text.replace("Đ", "d").replace("đ", "d")
    return re.sub(r"\s+", " ", text).strip().lower()


def _extract_budget(question: str) -> dict:
    """Extract budget from question."""
    q = _normalize_text(question)

    # Pattern: "dưới 500k", "dưới 5 triệu", "tầm 1 triệu", "tầm 100k"
    patterns = [
        (r"duoi\s+(\d+)\s*k(?:$|\s)", lambda x: int(x) * 1000),
        (r"duoi\s+(\d+)\s*trieu", lambda x: int(x) * 1000000),
        (r"tam\s+(\d+)\s*k(?:$|\s)", lambda x: int(x) * 1000),
        (r"tam\s+(\d+)\s*trieu", lambda x: int(x) * 1000000),
        (r"(\d+)\s*k", lambda x: int(x) * 1000),
        (r"(\d+)\s*trieu", lambda x: int(x) * 1000000),
    ]

    for pattern, converter in patterns:
        match = re.search(pattern, q)
        if match:
            try:
                budget_max = converter(match.group(1))
                return {"max": budget_max, "currency": "VND"}
            except (ValueError, IndexError):
                continue

    return {}


def _is_return_policy_question(text: str) -> bool:
    """Check if question is about return policy."""
    q = _normalize_text(text)
    keywords = ["doi tra", "tra hang", "return", "doi do", "hoan tien", "boi thuong"]
    return any(kw in q for kw in keywords)


def _is_cancel_policy_question(text: str) -> bool:
    """Check if question is about cancel policy."""
    q = _normalize_text(text)
    keywords = ["huy don", "huy order", "cancel", "khong mua nua"]
    return any(kw in q for kw in keywords)


def _is_warranty_policy_question(text: str) -> bool:
    """Check if question is about warranty policy."""
    q = _normalize_text(text)
    keywords = ["bao hanh", "warranty", "loi", "hong", "hu"]
    return any(kw in q for kw in keywords)
