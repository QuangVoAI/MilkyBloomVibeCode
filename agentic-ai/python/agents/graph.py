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
import uuid
import unicodedata
from contextlib import nullcontext
from pathlib import Path
sys.path.append(str(Path(__file__).parent.parent))

from typing import Callable, Awaitable, Optional
from langgraph.graph import StateGraph, END

from agents.state import AgentState
from agents.router import classify, classify_with_metadata, classify_with_followup_metadata
from agents.router import _is_simple_greeting
from agents.sentiment_analyzer import sentiment_analyzer_node
from agents.empathy_writer import (
    generate_empathy_streaming, generate_casual, generate_inquiry_streaming,
)
from agents.reviewer import review_with_retry, _check_banned_phrases, _is_repetitive
from agents.permission_matrix import (
    build_auth_profile as build_permission_auth_profile,
    authorize_capability,
    authorize_action,
    get_capability_rule,
    summarize_permission_matrix,
)
from agents.grader import grade_documents_node
from agents.rewriter import rewrite_query_node
from agents.llm_client import observe
from agents.session_memory import SessionMemoryManager
from agents.tool_executor import ToolExecutor
from agents.confidence_gate import ConfidenceGate
from agents.voice_consistency import VoiceConsistency
from indexing.query_engine import retrieve_and_rerank_async, format_evidence
from tools.order_tool import (
    extract_order_id,
    extract_phone_number,
    extract_email_address,
    get_order_info,
    get_order_info_by_phone,
    get_order_info_by_email,
    determine_suggested_actions,
)
from tools.catalog_tool import lookup_live_catalog
from tools.checkout_tool import start_checkout
from tools.checkout_tool import _extract_guest_info_from_text, _merge_guest_info
from tools.shop_client import (
    create_support_ticket,
    get_loyalty_config,
    get_my_loyalty,
    redeem_loyalty_coins,
)
from tools.action_tool import detect_action_intent, execute_action, resume_action_intent

from config import MAX_REWRITE_RETRIES
from utils.console import console
from utils.observability import (
    flush_langfuse,
    get_langfuse,
    redact_for_langfuse,
    update_current_span_safe,
)
from agents.prompt_registry import prompt_meta, POLICY_VERSION

# Session-level pending actions for multi-turn action execution
# Format: {session_id: {"action": str, ...}}
_session_pending_actions: dict[str, dict] = {}

# Session-level guest checkout memory so a guest can split contact info across turns.
# Format: {session_id: {"fullName": ..., "email": ..., "phone": ..., "addressLine": ...}}
_session_guest_checkout_profiles: dict[str, dict] = {}

# Session-level order memory so follow-up turns can refer back to the last order.
# Format: {session_id: {"order_id": ..., "status": ..., "address": ..., ...}}
_session_order_profiles: dict[str, dict] = {}

# Session-level catalog memory so follow-up turns can reuse the last viewed product.
# Format: {session_id: {"query": ..., "name": ..., "summary": ..., "products": [...], ...}}
_session_catalog_profiles: dict[str, dict] = {}

# Session-level conversation summary (Level 1: Session Memory)
# Format: {session_id: SessionSummary}
_session_summaries: dict[str, dict] = {}

ORDER_CONTEXT_KEYWORDS = [
    "mã đơn",
    "mã truy cập",
    "access token",
    "email đặt hàng",
    "email xác nhận",
    "số điện thoại",
    "đơn hàng",
    "trạng thái đơn",
    "kiểm tra đơn",
    "theo dõi đơn",
    "tra cứu đơn",
    "order",
    "tracking",
]

CHECKOUT_KEYWORDS = [
    "checkout",
    "đặt hàng",
    "mua hàng",
    "giỏ hàng",
    "cart",
    "mua ngay",
    "chốt đơn",
    "tạo đơn",
    "xác nhận đơn",
    "đi đến thanh toán",
    "tiến hành đặt hàng",
    "tiến hành thanh toán",
    "đặt hàng luôn",
    "xác nhận đặt hàng",
    "tiếp tục đặt hàng",
]

PURCHASE_ACTION_KEYWORDS = [
    "mua",
    "lấy",
    "đặt",
    "chốt",
    "thêm vào giỏ",
    "add to cart",
    "buy",
]

CATALOG_KEYWORDS = [
    "còn hàng",
    "hết hàng",
    "còn bao nhiêu",
    "còn size",
    "còn màu",
    "tồn kho",
    "stock",
    "inventory",
    "màu nào",
    "size nào",
    "mẫu nào",
]

CATALOG_RECOMMENDATION_HINTS = [
    "gợi ý",
    "đề xuất",
    "tư vấn",
    "chọn",
    "món đồ", "món hàng", "sản phẩm", "hàng", "mua",
    "đồ chơi",
    "quà",
    "gift",
    "budget",
    "ngân sách",
]

LOYALTY_KEYWORDS = [
    "loyalty",
    "coin",
    "coins",
    "hạng thành viên",
    "hạng loyalty",
    "cấp thành viên",
    "tier",
    "thành viên",
    "membership",
    "tích điểm",
    "điểm tích lũy",
    "điểm thưởng",
    "điểm loyalty",
    "điểm coin",
    "xem điểm",
    "số điểm",
    "bao nhiêu điểm",
    "còn bao nhiêu điểm",
    "đổi điểm",
    "redeem",
    "voucher thành viên",
]

LOYALTY_REDEEM_KEYWORDS = [
    "đổi điểm",
    "đổi coin",
    "redeem",
    "sử dụng điểm",
    "trừ điểm",
    "quy đổi điểm",
]

SUPPORT_TICKET_KEYWORDS = [
    "tạo ticket",
    "mở ticket",
    "support ticket",
    "nhờ hỗ trợ",
    "cần hỗ trợ",
    "cần được hỗ trợ",
    "cần giúp đỡ",
    "giúp đỡ",
    "liên hệ hỗ trợ",
    "gặp nhân viên",
    "nhân viên hỗ trợ",
    "chat với người thật",
    "khiếu nại",
    "phàn nàn",
    "complain",
    "complaint",
    "live agent",
    "human support",
    "report issue",
]


def _normalize_vi_text(text: str) -> str:
    normalized = unicodedata.normalize("NFD", text or "")
    normalized = "".join(ch for ch in normalized if unicodedata.category(ch) != "Mn")
    normalized = normalized.replace("Đ", "d").replace("đ", "d")
    return re.sub(r"\s+", " ", normalized).strip().lower()


def _contains_vi(text: str, markers: tuple[str, ...] | list[str]) -> bool:
    normalized = _normalize_vi_text(text)
    return any(_normalize_vi_text(marker) in normalized for marker in markers)


def _is_cancel_policy_question(text: str) -> bool:
    q = _normalize_vi_text(text)
    if not q:
        return False
    if any(marker in q for marker in ("huy don", "huy order", "cancel order", "cancel don")):
        policy_markers_ascii = (
            "cach",
            "huong dan",
            "lam sao",
            "the nao",
            "ra sao",
            "quy trinh",
            "chinh sach",
            "dieu kien",
            "duoc khong",
            "co duoc",
            "muon hoi",
            "hoi ve",
            "cho minh hoi",
            "cho toi hoi",
            "thong tin",
        )
        action_markers_ascii = (
            "giup minh",
            "giup toi",
            "ho minh",
            "ho toi",
            "don nay",
            "don do",
            "vua dat",
            "khong mua nua",
            "khong con nhu cau",
            "thoi huy",
            "huy di",
            "huy luon",
        )
        action_requested = any(
            re.search(rf"\b{re.escape(marker)}\b", q)
            for marker in action_markers_ascii
        )
        if any(marker in q for marker in policy_markers_ascii) and not action_requested:
            return True
    has_cancel_topic = any(
        _normalize_vi_text(phrase) in q
        for phrase in (
            "hủy đơn",
            "hủy đơn hàng",
            "cancel order",
            "cancel don",
            "hủy order",
        )
    )
    if not has_cancel_topic:
        return False
    policy_markers = (
        "cách",
        "hướng dẫn",
        "làm sao",
        "thế nào",
        "như thế nào",
        "ra sao",
        "quy trình",
        "chính sách",
        "điều kiện",
        "được không",
        "có được",
        "muốn hỏi",
        "hỏi về",
        "cho mình hỏi",
        "cho tôi hỏi",
        "thông tin",
    )
    action_markers = (
        "giúp mình",
        "giúp tôi",
        "hộ mình",
        "hộ tôi",
        "đừng mình",
        "đừng tôi",
        "đơn này",
        "đơn đó",
        "vừa đặt",
        "không mua nữa",
        "thôi hủy",
        "hủy đi",
        "hủy luôn",
    )
    return any(_normalize_vi_text(marker) in q for marker in policy_markers) and not any(
        _normalize_vi_text(marker) in q for marker in action_markers
    )


def _is_order_policy_question(text: str) -> bool:
    return (
        _is_return_policy_question(text)
        or _is_cancel_policy_question(text)
        or _is_warranty_policy_question(text)
    )


def _join_lookup_hints(hints: list[str]) -> str:
    if not hints:
        return ""
    if len(hints) == 1:
        return hints[0]
    if len(hints) == 2:
        return f"{hints[0]} hoặc {hints[1]}"
    return ", ".join(hints[:-1]) + f", hoặc {hints[-1]}"


def _is_checkout_request(text: str) -> bool:
    q = (text or "").lower()
    return any(keyword in q for keyword in CHECKOUT_KEYWORDS)


def _is_checkout_progression_request(text: str) -> bool:
    q = (text or "").lower()
    progression_markers = [
        "bây giờ tiến hành đặt hàng",
        "tiến hành đặt hàng",
        "tiến hành thanh toán",
        "đặt hàng luôn",
        "tiếp tục đặt hàng",
        "xác nhận đặt hàng",
        "xác nhận đơn",
        "checkout",
    ]
    return any(marker in q for marker in progression_markers)


def _is_purchase_request(text: str) -> bool:
    q = (text or "").lower().strip()
    if any(keyword in q for keyword in CHECKOUT_KEYWORDS):
        return True
    return bool(re.search(r"(?i)\b(?:mua|lấy|đặt|chốt|buy)\b\s+.{2,}", q))


def _has_budget_signal(text: str) -> bool:
    q = (text or "").lower()
    return bool(
        re.search(
            r"(?i)(?:dưới|tối đa|không quá|tầm|khoảng|under|within|budget|ngân sách)\s*[\d.,\s]{1,12}\s*(?:k|nghìn|ngàn|ngan|đ|d|vnđ|vnd)?",
            q,
        )
        or re.search(r"(?i)\b\d{1,6}\s*(?:k|nghìn|ngàn|ngan|đ|d|vnđ|vnd)\b", q)
    )


def _is_budget_catalog_request(text: str) -> bool:
    q = (text or "").lower()
    if not _has_budget_signal(q):
        return False
    if _is_catalog_recommendation_request(q):
        return True
    if any(keyword in q for keyword in PURCHASE_ACTION_KEYWORDS) and any(
        term in q for term in ("hàng", "món", "sản phẩm", "mặt hàng", "quà", "item")
    ):
        return True
    stripped = re.sub(
        r"(?i)(?:dưới|tối đa|không quá|tầm|khoảng|under|within|budget|ngân sách)\s*[\d.,\s]{1,12}\s*(?:k|nghìn|ngàn|ngan|đ|d|vnđ|vnd)?",
        " ",
        q,
    )
    stripped = re.sub(r"\s+", " ", stripped).strip(" ?!.,:-")
    if not stripped:
        return True
    return len(stripped.split()) <= 2


def _is_catalog_advice_request(text: str) -> bool:
    q = (text or "").lower()
    if not q:
        return False

    normalized_q = _normalize_vi_text(text)
    ascii_negated_checkout = any(
        marker in normalized_q
        for marker in (
            "chua dat hang",
            "chua thanh toan",
            "chua checkout",
            "khong dat hang",
            "khong checkout",
            "khong thanh toan",
            "chi tu van",
            "tu van thoi",
            "tham khao",
            "advice only",
            "recommend only",
            "suggest only",
            "dont checkout",
            "do not checkout",
            "no checkout",
            "not checkout",
            "dont order",
            "do not order",
            "not order",
            "not buy yet",
        )
    )
    ascii_explicit_checkout = any(
        marker in normalized_q
        for marker in (
            "dat hang",
            "checkout",
            "thanh toan",
            "chot don",
            "tao don",
            "mua ngay",
            "xac nhan don",
            "them vao gio",
            "add to cart",
            "buy now",
        )
    )
    ascii_has_hint = any(
        marker in normalized_q
        for marker in (
            "goi y",
            "de xuat",
            "tu van",
            "chon",
            "mon do",
            "do choi",
            "qua",
            "gift",
            "budget",
            "ngan sach",
            "recommend",
            "suggest",
            "advice",
            "advise",
            "tham khao",
        )
    )
    ascii_has_generic_item = any(
        marker in normalized_q
        for marker in (
            "qua",
            "qua tang",
            "do choi",
            "san pham",
            "mon",
            "mon do",
            "hang",
            "gift",
            "toy",
            "item",
        )
    )
    ascii_has_product_clue = any(
        marker in normalized_q
        for marker in (
            "stardust",
            "picnic",
            "box",
            "capsule",
            "moon parade",
            "bead",
            "lab",
            "sleepover",
        )
    )
    ascii_has_uncertain_buy = any(
        marker in normalized_q
        for marker in (
            "chua biet chon",
            "chua biet mua",
            "phan van",
            "nen mua",
            "mua gi",
            "chon gi",
            "chon mon nao",
        )
    )

    if ascii_has_uncertain_buy:
        return True
    if ascii_has_hint and (ascii_has_generic_item or ascii_has_product_clue):
        return True
    if ascii_negated_checkout and (
        ascii_has_hint or ascii_has_generic_item or ascii_has_product_clue
    ):
        return True
    if not ascii_negated_checkout and ascii_explicit_checkout:
        return False

    negated_checkout = any(
        marker in q
        for marker in (
            "chưa đặt hàng",
            "chưa thanh toán",
            "chưa checkout",
            "không đặt hàng",
            "không checkout",
            "không thanh toán",
            "chỉ tư vấn",
            "tư vấn thôi",
            "tham khảo",
            "advice only",
            "recommend only",
            "suggest only",
            "don't checkout",
            "dont checkout",
            "do not checkout",
            "no checkout",
            "not checkout",
            "don't order",
            "dont order",
            "do not order",
            "not order",
            "not buy yet",
        )
    )
    explicit_checkout_markers = (
        "đặt hàng",
        "checkout",
        "thanh toán",
        "chốt đơn",
        "tạo đơn",
        "mua ngay",
        "xác nhận đơn",
        "thêm vào giỏ",
        "add to cart",
        "buy now",
    )
    if not negated_checkout and any(marker in q for marker in explicit_checkout_markers):
        return False

    has_hint = any(keyword in q for keyword in CATALOG_RECOMMENDATION_HINTS) or any(
        keyword in q for keyword in ("recommend", "suggest", "advice", "advise", "tham khảo", "tham khao")
    )
    has_generic_item = any(
        term in q
        for term in ("quà", "quà tặng", "đồ chơi", "sản phẩm", "món", "món đồ", "món hàng", "sản phẩm", "hàng", "mua", "hàng", "gift", "toy", "item")
    )
    has_product_clue = any(
        term in q
        for term in (
            "stardust",
            "picnic",
            "box",
            "capsule",
            "moon parade",
            "bead",
            "lab",
            "sleepover",
        )
    )
    has_uncertain_buy = any(
        marker in q
        for marker in (
            "chưa biết chọn",
            "chưa biết mua",
            "phân vân",
            "nên mua",
            "mua gì",
            "chọn gì",
            "chọn món nào",
        )
    )
    return (has_hint and (has_generic_item or has_product_clue)) or has_uncertain_buy or (
        negated_checkout and (has_hint or has_generic_item or has_product_clue)
    )


def _is_product_info_question(text: str) -> bool:
    q = (text or "").lower()
    if not q or _is_purchase_request(q):
        return False

    has_product_clue = any(
        term in q
        for term in (
            "stardust",
            "picnic",
            "box",
            "capsule",
            "bead",
            "lab",
            "sleepover",
            "moon parade",
            "dream shelf",
            "sản phẩm này",
        )
    )
    has_info_clue = any(
        term in q
        for term in (
            "phù hợp",
            "hợp bé",
            "mấy tuổi",
            "bao nhiêu tuổi",
            "độ tuổi",
            "giá",
            "bao nhiêu tiền",
            "còn hàng",
            "tồn kho",
            "màu",
            "size",
            "loại",
            "classic",
            "chi tiết",
            "thông tin",
            "so sánh",
            "điểm mạnh",
            "diem manh",
            "ưu điểm",
            "uu diem",
            "co gi hay",
            "có gì hay",
            "compare",
            "how much",
            "price",
            "cost",
            "suitable",
            "good for",
            "age",
            "year old",
            "years old",
            "in stock",
            "stock",
        )
    )
    return has_product_clue and has_info_clue


def _is_catalog_request(text: str) -> bool:
    q = (text or "").lower()
    return (
        any(keyword in q for keyword in CATALOG_KEYWORDS)
        or _is_catalog_advice_request(q)
        or _is_product_info_question(q)
    )


def _is_catalog_recommendation_request(text: str) -> bool:
    q = (text or "").lower()
    has_hint = any(keyword in q for keyword in CATALOG_RECOMMENDATION_HINTS)
    has_budget = bool(re.search(r"\b(?:dưới|tầm|khoảng|budget)\s*\d[\d.,]*\s*(?:k|nghìn|ngàn|vnđ|đ)?", q))
    has_price = bool(re.search(r"\b\d[\d.,]*\s*(?:k|nghìn|ngàn|vnđ|đ)\b", q))
    has_followup = any(marker in q for marker in (
        "còn món nào khác",
        "còn món nào nữa",
        "còn hàng nào nữa",
        "còn hàng nào khác",
        "còn món khác",
        "thêm món khác",
        "thêm sản phẩm khác",
        "món khác",
        "sản phẩm khác",
        "mẫu khác",
    ))
    return (
        (has_hint and (has_budget or has_price))
        or (has_hint and "dưới" in q)
        or has_followup
        or _is_catalog_advice_request(q)
    )


def _is_loyalty_request(text: str) -> bool:
    q = (text or "").lower()
    return any(keyword in q for keyword in LOYALTY_KEYWORDS)


def _is_loyalty_redeem_request(text: str) -> bool:
    q = (text or "").lower()
    return any(keyword in q for keyword in LOYALTY_REDEEM_KEYWORDS)


def _is_support_ticket_request(text: str) -> bool:
    q = (text or "").lower()
    return any(keyword in q for keyword in SUPPORT_TICKET_KEYWORDS)


def _is_payment_policy_question(text: str) -> bool:
    q = _normalize_vi_text(text)
    if not q or not any(marker in q for marker in ("thanh toan", "payment", "pay")):
        return False
    if any(
        marker in q
        for marker in (
            "checkout",
            "dat hang",
            "tao don",
            "len don",
            "chot don",
            "xac nhan",
            "tien hanh thanh toan",
            "thanh toan luon",
        )
    ):
        return False
    return any(
        marker in q
        for marker in (
            "duoc khong",
            "co duoc",
            "phuong thuc",
            "hinh thuc",
            "nao",
            "momo",
            "cod",
            "chuyen khoan",
            "visa",
            "the",
            "card",
            "payment method",
            "pay by",
        )
    )


def _is_existing_order_issue(text: str) -> bool:
    q = _normalize_vi_text(text)
    if any(
        marker in q
        for marker in (
            "huy don",
            "huy order",
            "cancel order",
            "doi dia chi",
            "hoan tien",
            "doi tra",
            "tra hang",
            "kiem tra don",
            "tra cuu don",
            "theo doi don",
            "trang thai don",
        )
    ):
        return True
    markers = (
        "đặt nhầm địa chỉ",
        "nhầm địa chỉ",
        "sai địa chỉ",
        "đổi địa chỉ",
        "thay đổi địa chỉ",
        "sửa địa chỉ",
        "cập nhật địa chỉ",
        "hủy đơn",
        "hủy đơn hàng",
        "kiểm tra đơn",
        "tra cứu đơn",
        "theo dõi đơn",
        "trạng thái đơn",
        "đơn đâu",
        "bao giờ giao",
        "chưa nhận được hàng",
        "chưa thấy giao",
        "mã đơn",
        "order id",
        "tracking",
        "muốn đổi trả",
        "cần đổi trả",
        "yêu cầu đổi trả",
        "xin đổi trả",
        "đổi trả đơn",
        "muốn hoàn tiền",
        "cần hoàn tiền",
        "yêu cầu hoàn tiền",
        "xin hoàn tiền",
        "trả hàng đơn",
        "muốn trả hàng",
        "cần trả hàng",
    )
    if "khong con nhu cau" in q or "khong muon mua nua" in q or "khong can hang nua" in q:
        return True
    return any(_normalize_vi_text(marker) in q for marker in markers)


def _is_return_policy_question(text: str) -> bool:
    q = _normalize_vi_text(text)
    policy_markers = (
        "chinh sach doi tra",
        "doi tra nhu the nao",
        "doi tra ra sao",
        "duoc doi tra khong",
        "dieu kien doi tra",
        "quy trinh doi tra",
        "doi tra bao lau",
        "tra hang nhu the nao",
        "hoan tien mat bao lau",
        "bao lau hoan tien",
        "thoi gian hoan tien",
        "quy trinh hoan tien",
        "refund mat bao lau",
        "refund bao lau",
        "return policy",
    )
    if any(phrase in q for phrase in policy_markers):
        return True
    if "doi tra hang" in q and any(
        phrase in q
        for phrase in (
            "cho toi biet",
            "cho minh biet",
            "muon biet",
            "thong tin",
            "chi tiet",
            "chinh xac",
            "cu the",
            "dieu kien",
            "quy trinh",
            "bao lau",
        )
    ):
        return True
    return False


def _is_warranty_policy_question(text: str) -> bool:
    q = _normalize_vi_text(text)
    if not q:
        return False

    policy_markers = (
        "chinh sach bao hanh",
        "bao hanh nhu the nao",
        "bao hanh ra sao",
        "dieu kien bao hanh",
        "quy trinh bao hanh",
        "bao hanh bao lau",
        "warranty policy",
    )
    if any(phrase in q for phrase in policy_markers):
        return True

    if "bao hanh" in q and any(
        phrase in q
        for phrase in (
            "cho toi biet",
            "cho minh biet",
            "muon biet",
            "thong tin",
            "chi tiet",
            "chinh xac",
            "cu the",
            "dieu kien",
            "quy trinh",
            "bao lau",
            "co duoc",
        )
    ):
        return True

    return False


def _is_return_request(text: str) -> bool:
    q = (text or "").lower()
    if _is_return_policy_question(q):
        return False
    return any(
        phrase in q
        for phrase in (
            "mình muốn đổi trả",
            "muốn đổi trả",
            "cần đổi trả",
            "yêu cầu đổi trả",
            "xin đổi trả",
            "đổi trả đơn",
            "mình muốn hoàn tiền",
            "muốn hoàn tiền",
            "cần hoàn tiền",
            "yêu cầu hoàn tiền",
            "xin hoàn tiền",
            "mình muốn trả hàng",
            "muốn trả hàng",
            "cần trả hàng",
            "return item",
            "return order",
            "refund",
            "hoàn tiền",
        )
    )


def _build_auth_profile(shop_context: dict | None) -> dict:
    return build_permission_auth_profile(shop_context)


def _extract_first_amount(text: str) -> int:
    match = re.search(r"(\d[\d.,]*)", text or "")
    if not match:
        return 0
    raw = match.group(1).replace(".", "").replace(",", "")
    try:
        return max(0, int(raw))
    except Exception:
        return 0


def _remember_guest_checkout_profile(state: dict) -> dict:
    session_id = str(state.get("session_id") or "").strip()
    if not session_id:
        return {}

    shop_context = state.get("shop_context", {}) or {}
    auth_profile = state.get("auth_state") or _build_auth_profile(shop_context)
    if auth_profile.get("is_authenticated") or auth_profile.get("user_scope") in {"logged_in", "admin"}:
        return _session_guest_checkout_profiles.get(session_id, {})

    texts = [state.get("question", "") or ""]
    history = state.get("history", []) or []
    for msg in history[-6:]:
        if isinstance(msg, dict):
            if str(msg.get("role") or "user").lower() == "user":
                texts.append(str(msg.get("content") or ""))

    extracted: dict[str, str] = {}
    for text in texts:
        extracted = _merge_guest_info(extracted, _extract_guest_info_from_text(text))

    if extracted:
        existing = _session_guest_checkout_profiles.get(session_id, {})
        _session_guest_checkout_profiles[session_id] = _merge_guest_info(existing, extracted)

    return _session_guest_checkout_profiles.get(session_id, {})


def _clear_guest_checkout_profile(session_id: str) -> None:
    session_id = str(session_id or "").strip()
    if session_id and session_id in _session_guest_checkout_profiles:
        _session_guest_checkout_profiles.pop(session_id, None)


def _get_guest_checkout_profile(session_id: str) -> dict:
    session_id = str(session_id or "").strip()
    if not session_id:
        return {}
    return dict(_session_guest_checkout_profiles.get(session_id, {}))


def _remember_order_profile(session_id: str, order_info: dict | None, question: str = "") -> None:
    session_id = str(session_id or "").strip()
    if not session_id or not order_info or not order_info.get("order_id"):
        return

    existing = _session_order_profiles.get(session_id, {})
    merged = {
        **existing,
        "order_id": order_info.get("order_id", existing.get("order_id", "")),
        "status": order_info.get("status", existing.get("status", "")),
        "address": order_info.get("address", existing.get("address", "")),
        "summary": order_info.get("summary", existing.get("summary", "")),
        "lookup_hints": order_info.get("lookup_hints", existing.get("lookup_hints", [])),
        "found": bool(order_info.get("found", existing.get("found", False))),
        "verified": bool(order_info.get("ownership_verified", existing.get("verified", False))),
        "last_question": question or existing.get("last_question", ""),
        "updated_at": time.time(),
    }
    _session_order_profiles[session_id] = merged


def _get_order_profile(session_id: str) -> dict:
    session_id = str(session_id or "").strip()
    if not session_id:
        return {}
    return dict(_session_order_profiles.get(session_id, {}))


def _clear_order_profile(session_id: str) -> None:
    session_id = str(session_id or "").strip()
    if session_id and session_id in _session_order_profiles:
        _session_order_profiles.pop(session_id, None)


def _has_order_followup_signal(text: str) -> bool:
    text = (text or "").lower()
    signals = [
        "đơn đó",
        "đơn này",
        "đơn kia",
        "đơn vừa rồi",
        "đơn trước",
        "đơn cũ",
        "đơn trên",
        "của mình",
        "của tôi",
        "đổi địa chỉ",
        "cập nhật địa chỉ",
        "sửa địa chỉ",
        "hủy đơn",
        "hủy giúp",
        "hoàn tiền",
        "đổi trả",
        "trạng thái",
        "theo dõi",
        "kiểm tra",
        "xem đơn",
        "mã đơn",
        "order",
    ]
    return any(sig in text for sig in signals)


def _remember_catalog_profile(session_id: str, catalog_info: dict | None, question: str = "") -> None:
    session_id = str(session_id or "").strip()
    if not session_id or not catalog_info or not catalog_info.get("found"):
        return

    existing = _session_catalog_profiles.get(session_id, {})
    products = catalog_info.get("products") or existing.get("products") or []
    primary_name = ""
    if isinstance(products, list) and products:
        first = products[0] if isinstance(products[0], dict) else {}
        primary_name = first.get("name") or first.get("slug") or ""
    merged = {
        **existing,
        "query": catalog_info.get("query") or existing.get("query", ""),
        "name": primary_name or existing.get("name", ""),
        "summary": catalog_info.get("summary") or existing.get("summary", ""),
        "products": products,
        "last_question": question or existing.get("last_question", ""),
        "updated_at": time.time(),
    }
    _session_catalog_profiles[session_id] = merged


def _get_catalog_profile(session_id: str) -> dict:
    session_id = str(session_id or "").strip()
    if not session_id:
        return {}
    return dict(_session_catalog_profiles.get(session_id, {}))


def _clear_catalog_profile(session_id: str) -> None:
    session_id = str(session_id or "").strip()
    if session_id and session_id in _session_catalog_profiles:
        _session_catalog_profiles.pop(session_id, None)


def _clean_catalog_selection_line(text: str) -> str:
    line = str(text or "").strip()
    if not line:
        return ""
    line = re.split(r"[\n\r]", line, maxsplit=1)[0].strip()
    line = re.sub(r"^[\s>*•\-–—]+", "", line).strip()
    line = re.sub(r"^\d+[\).]\s*", "", line).strip()
    line = line.replace("**", "").replace("__", "").strip()
    line = re.split(
        r"\s+[-–—]\s+(?=\d{1,3}(?:[.,]\d{3})*(?:\s*(?:đ|d|vnd|vnđ))?|\d+\s*k\b)",
        line,
        maxsplit=1,
        flags=re.IGNORECASE,
    )[0].strip()
    line = re.sub(
        r"\s+\d{1,3}(?:[.,]\d{3})*(?:\s*(?:đ|d|vnd|vnđ))?.*$",
        "",
        line,
        flags=re.IGNORECASE,
    ).strip()
    return line.strip(" '\"`.,:;!?")


def _extract_catalog_selection_name(text: str, catalog_profile: dict | None = None) -> str:
    raw = str(text or "").strip()
    if not raw:
        return ""

    products = []
    if isinstance(catalog_profile, dict):
        products = catalog_profile.get("products") or []

    lower_raw = raw.lower()
    for product in products if isinstance(products, list) else []:
        if not isinstance(product, dict):
            continue
        name = str(product.get("name") or product.get("slug") or "").strip()
        if name and name.lower() in lower_raw:
            return name

    has_product_line_shape = bool(
        re.search(r"(^|\n)\s*(?:[>*•\-–—]|\d+[\).])\s*\S+", raw)
        and re.search(r"\d{1,3}(?:[.,]\d{3})*(?:\s*(?:đ|d|vnd|vnđ))?|\d+\s*k\b", raw, re.IGNORECASE)
    )
    if not has_product_line_shape:
        return ""

    candidate = _clean_catalog_selection_line(raw)
    if len(candidate) < 2:
        return ""
    if candidate.lower() in {"món", "sản phẩm", "item", "đồ"}:
        return ""
    return candidate


def _has_catalog_followup_signal(text: str) -> bool:
    text = (text or "").lower()
    if _extract_catalog_selection_name(text):
        return True
    signals = [
        "còn món nào khác",
        "còn món nào nữa",
        "còn hàng nào nữa",
        "còn hàng nào khác",
        "còn món khác không",
        "còn món nào không",
        "còn gì nữa",
        "thêm món khác",
        "thêm sản phẩm khác",
        "món khác",
        "sản phẩm khác",
        "mẫu khác",
        "món này",
        "mẫu này",
        "sản phẩm này",
        "con này",
        "món vừa rồi",
        "mẫu vừa rồi",
        "hàng này",
        "cái này",
        "nó còn",
        "còn size nào",
        "còn màu nào",
        "còn không",
        "còn món nào",
        "size nào",
        "màu nào",
        "tồn kho",
        "đầu tiên",
        "món đầu tiên",
        "cái đầu tiên",
        "số 1",
        "mục 1",
        "xem chi tiết",
        "chi tiết món",
        "xem sản phẩm",
        "chốt món này",
        "đặt món này",
        "thêm vào giỏ",
    ]
    return any(sig in text for sig in signals)


def _history_has_catalog_prompt(history: list[dict] | None) -> bool:
    recent = " ".join(
        str(msg.get("content") or "")
        for msg in (history or [])[-6:]
        if isinstance(msg, dict)
    ).lower()
    if not recent:
        return False
    return any(
        marker in recent
        for marker in (
            "gợi ý",
            "chọn món",
            "chọn sản phẩm",
            "danh sách",
            "stardust",
            "picnic",
            "capsule",
            "box",
        )
    )


def _brand_voice_opening(context: str, *, order_id: str = "", product_name: str = "") -> str:
    context = (context or "").strip().lower()
    if context == "support":
        return "Mình ghi nhận yêu cầu hỗ trợ cho bạn rồi nè."
    if context == "order":
        if order_id:
            return f"Mình tra được đơn {order_id} cho bạn rồi nè."
        return "Mình tra được đơn của bạn rồi nè."
    if context == "catalog":
        if product_name:
            return f"Mình vừa xem {product_name} cho bạn rồi nè."
        return "Mình vừa xem món này cho bạn rồi nè."
    if context == "loyalty":
        return "Mình xem điểm của bạn rồi nè."
    if context == "sales":
        return "Mình gợi ý nhanh cho bạn nè."
    return "Mình xử lý cho bạn rồi nè."


def _is_general_inquiry_request(text: str) -> bool:
    q = _normalize_vi_text(text)
    markers = (
        "khuyen mai",
        "uu dai",
        "giam gia",
        "ma giam gia",
        "voucher",
        "sale",
        "chinh sach",
        "huong dan",
        "cho minh hoi",
        "cho toi hoi",
        "muon biet",
        "lam sao",
        "the nao",
        "bao gia",
        "gia bao nhieu",
        "con hang",
        "bao hanh",
        "phi ship",
        "thanh toan",
    )
    return any(marker in q for marker in markers)


def _infer_capability(question: str, history: list[dict], intent: str, auth_profile: dict) -> tuple[str, str]:
    q = (question or "").lower()
    recent = " ".join((m.get("content", "") or "") for m in history[-4:]).lower()
    current = q
    combined = f"{q} {recent}"

    # Capability should be led by the current message. History is useful for
    # ambiguous follow-ups, but using it for every detector makes old topics
    # leak into fresh questions.
    if _is_catalog_recommendation_request(current):
        return "catalog", "catalog_recommendation"

    if _extract_catalog_selection_name(current):
        return "catalog", "catalog_selection"

    if _has_catalog_followup_signal(current) and _history_has_catalog_prompt(history):
        return "catalog", "catalog_followup_history"

    if _is_loyalty_request(current):
        if _is_loyalty_redeem_request(current):
            return "loyalty", "loyalty_redeem"
        return "loyalty", "loyalty_view"

    if _is_support_ticket_request(current):
        return "inquiry", "support_contact_request"

    if _is_payment_policy_question(current):
        return "inquiry", "payment_policy_question"

    if _is_budget_catalog_request(current):
        return "catalog", "budget_catalog_request"

    if intent != "INQUIRY" and _is_general_inquiry_request(current) and not _is_existing_order_issue(current):
        return "inquiry", "fresh_inquiry"

    if _is_return_policy_question(current) and not (extract_order_id(current) or extract_phone_number(current)):
        return "inquiry", "return_policy_question"

    if _is_warranty_policy_question(current) and not (extract_order_id(current) or extract_phone_number(current)):
        return "inquiry", "warranty_policy_question"

    if _is_cancel_policy_question(current) and not (extract_order_id(current) or extract_phone_number(current)):
        return "inquiry", "cancel_policy_question"

    if _is_return_request(current):
        return "order_management", "return_request"

    if has_order_context := (extract_order_id(current) or extract_phone_number(current) or _is_existing_order_issue(current)):
        return "order_management", f"existing_order:{has_order_context}"

    if _is_purchase_request(current) and not _is_catalog_recommendation_request(current):
        return "checkout", "purchase_request"

    if _is_checkout_request(current):
        return "checkout", "checkout_keywords"

    if _is_catalog_request(current):
        return "catalog", "catalog_keywords"

    if not current.strip() and _is_catalog_recommendation_request(combined):
        return "catalog", "catalog_recommendation_followup"

    if intent == "INQUIRY":
        return "inquiry", "inquiry_intent"
    if intent == "CASUAL":
        return "casual", "casual_intent"
    return "inquiry", "general_fallback"


def _format_loyalty_config_summary(config: dict) -> str:
    tiers = config.get("tiers") or []
    if not tiers:
        return "Hệ thống loyalty hiện có nhưng mình chưa lấy được bảng quyền lợi chi tiết."

    parts = []
    for tier in tiers:
        name = tier.get("name") or tier.get("tier") or "member"
        min_spent = tier.get("minSpent")
        coin_multiplier = tier.get("coinMultiplier")
        shipping_discount = tier.get("shippingDiscount")
        segment = f"{name}"
        if min_spent is not None:
            segment += f" từ {int(min_spent):,}đ"
        if coin_multiplier is not None:
            segment += f", hệ số điểm {coin_multiplier}x"
        if shipping_discount is not None:
            segment += f", giảm ship {shipping_discount}%"
        parts.append(segment)

    coin_rate = config.get("coinRate")
    coin_value = config.get("coinValue")
    header = []
    if coin_rate is not None:
        header.append(f"Quy đổi cơ bản: {int(coin_rate):,}đ = 1 coin")
    if coin_value is not None:
        header.append(f"1 coin = {coin_value}đ")
    intro = " | ".join(header)
    return intro + ("\n" if intro else "") + " • ".join(parts)


def _format_loyalty_status(data: dict) -> str:
    rank = str(data.get("loyaltyRank") or "none").lower()
    points = int(data.get("loyaltyPoints") or 0)
    lifetime_spent = int(data.get("lifetimeSpent") or 0)
    spent_12m = int(data.get("spentLast12Months") or 0)
    return (
        f"Bạn đang ở hạng {rank}, có {points:,} coin.\n"
        f"Tổng chi tiêu: {lifetime_spent:,}đ | 12 tháng gần nhất: {spent_12m:,}đ."
    )


def _format_return_policy_summary() -> str:
    return (
        "Chính sách đổi trả của MilkyBloom nè:\n"
        "• Khách hàng được đổi hoặc trả hàng trong vòng 7 ngày kể từ ngày nhận hàng.\n"
        "• Điều kiện: sản phẩm chưa qua sử dụng, còn nguyên bao bì / tem nhãn / seal, barcode không bị trầy xước, và có hóa đơn hợp lệ.\n"
        "• Hàng đã bóc seal, cắt mác hoặc có dấu hiệu đã dùng sẽ không được hỗ trợ đổi trả.\n"
        "• Nếu là sản phẩm lỗi hoặc giao sai, mình sẽ ưu tiên hỗ trợ nhanh hơn."
    )


def _format_warranty_policy_summary() -> str:
    return (
        "Chính sách bảo hành của MilkyBloom nè:\n"
        "• Sản phẩm còn trong thời gian bảo hành được ghi nhận trên phiếu bảo hành hoặc hóa đơn mua hàng của website.\n"
        "• Trường hợp được hỗ trợ là lỗi do nhà sản xuất.\n"
        "• Việc xác định lỗi được thực hiện bởi cửa hàng MilkyBloom.\n"
        "• Bạn có thể mang sản phẩm đến các cửa hàng MilkyBloom trên toàn quốc để được kiểm tra và bảo hành."
    )


def _format_cancel_policy_summary() -> str:
    return (
        "C\u00e1ch h\u1ee7y \u0111\u01a1n h\u00e0ng c\u1ee7a MilkyBloom n\u00e8:\n"
        "- N\u1ebfu \u0111\u01a1n c\u00f2n \u0111ang x\u1eed l\u00fd / ch\u01b0a b\u00e0n giao v\u1eadn chuy\u1ec3n, m\u00ecnh c\u00f3 th\u1ec3 h\u1ed7 tr\u1ee3 ki\u1ec3m tra v\u00e0 h\u1ee7y theo t\u1eebng \u0111\u01a1n.\n"
        "- B\u1ea1n g\u1eedi m\u00e3 \u0111\u01a1n, email \u0111\u1eb7t h\u00e0ng, ho\u1eb7c \u0111\u0103ng nh\u1eadp t\u00e0i kho\u1ea3n \u0111\u00e3 \u0111\u1eb7t \u0111\u01a1n \u0111\u1ec3 m\u00ecnh x\u00e1c minh.\n"
        "- N\u1ebfu \u0111\u01a1n \u0111\u00e3 chuy\u1ec3n sang v\u1eadn chuy\u1ec3n, m\u00ecnh s\u1ebd ki\u1ec3m tra ph\u01b0\u01a1ng \u00e1n ph\u00f9 h\u1ee3p nh\u01b0 theo d\u00f5i giao h\u00e0ng, t\u1eeb ch\u1ed1i nh\u1eadn h\u00e0ng, ho\u1eb7c x\u1eed l\u00fd ho\u00e0n ti\u1ec1n khi \u0111\u01a1n \u0111\u01b0\u1ee3c tr\u1ea3 v\u1ec1 kho."
    )


def _format_support_contact_summary() -> str:
    return (
        "M\u00ecnh c\u00f3 th\u1ec3 ghi nh\u1eadn y\u00eau c\u1ea7u h\u1ed7 tr\u1ee3, nh\u01b0ng c\u1ea7n x\u00e1c minh \u0111\u00fang \u0111\u01a1n tr\u01b0\u1edbc \u0111\u00e3. "
        "B\u1ea1n g\u1eedi m\u00ecnh m\u00e3 \u0111\u01a1n ho\u1eb7c email \u0111\u1eb7t h\u00e0ng nh\u00e9. N\u1ebfu b\u1ea1n \u0111\u00e3 \u0111\u0103ng nh\u1eadp t\u00e0i kho\u1ea3n \u0111\u1eb7t \u0111\u01a1n, "
        "m\u00ecnh s\u1ebd ki\u1ec3m tra ti\u1ebfp theo th\u00f4ng tin t\u00e0i kho\u1ea3n \u0111\u00f3."
    )


# ================================================================
# Graph Nodes
# ================================================================

def order_lookup_node(state: AgentState) -> dict:
    """Node: Trích xuất mã đơn hàng từ tin nhắn + tra cứu backend thật."""
    t0 = time.time()
    question = state["question"]
    history = state.get("history", [])
    shop_context = state.get("shop_context", {}) or {}

    current_order_policy_question = _is_order_policy_question(question)

    order_id = extract_order_id(question)
    phone_number = extract_phone_number(question) if not order_id else None
    email_address = extract_email_address(question) if not order_id and not phone_number else None
    order_info: dict = {}
    suggested_actions: list = []
    has_order_context = (
        not current_order_policy_question
        and (
            any(keyword in question.lower() for keyword in ORDER_CONTEXT_KEYWORDS)
            or _is_existing_order_issue(question)
        )
    )

    pending_action_intent: dict = {}
    session_id = state.get("session_id", "")
    cached_order = _get_order_profile(session_id)

    if order_id:
        order_info = get_order_info(order_id, shop_context)
    elif phone_number:
        order_info = get_order_info_by_phone(phone_number, {**shop_context, "allow_internal_lookup": True})
    elif email_address:
        order_info = get_order_info_by_email(email_address, {**shop_context, "allow_internal_lookup": True})
    elif cached_order and not current_order_policy_question and _has_order_followup_signal(question):
        cached_order_id = cached_order.get("order_id", "")
        if cached_order_id:
            console.print(
                f"[dim]  OrderLookup: using cached order '{cached_order_id}' for follow-up turn[/]"
            )
            order_id = cached_order_id
            order_info = get_order_info(cached_order_id, shop_context)
            if not order_info.get("found") and cached_order.get("found"):
                order_info = {
                    "found": True,
                    "ownership_verified": bool(cached_order.get("verified")),
                    "order_id": cached_order_id,
                    "status": cached_order.get("status", ""),
                    "address": cached_order.get("address", ""),
                    "summary": cached_order.get("summary", ""),
                    "lookup_hints": cached_order.get("lookup_hints", []),
                    "suggested_actions": ["check_order_status"],
                    "raw": {},
                }
                if cached_order.get("summary"):
                    order_info["summary"] = cached_order["summary"]
    else:
        if has_order_context:
            lookup_hints = [
                "đăng nhập tài khoản đã đặt đơn",
                "xác minh OTP của tài khoản chủ đơn",
                "mã truy cập đơn hàng trong email xác nhận",
                "email bạn dùng khi đặt hàng để mình giúp bạn tìm email xác nhận",
            ]
            order_info = {
                "found": False,
                "ownership_verified": False,
                "verification_required": True,
                "order_id": "",
                "summary": (
                    "Mình chưa thấy mã đơn trong tin nhắn này.\n"
                    f"Bạn giúp mình { _join_lookup_hints(lookup_hints) } nhé."
                ),
                "lookup_hints": lookup_hints,
                "suggested_actions": ["request_access_token"],
            }
            console.print("[dim]  OrderLookup: order context detected but no identifier[/]")
        else:
            console.print("[dim]  OrderLookup: no order ID in message[/]")

    if order_info:
        sentiment = state.get("sentiment", "")
        suggested_actions = determine_suggested_actions(order_info, sentiment)
        if order_id:
            lookup_label = f"order '{order_id}'"
        elif phone_number:
            lookup_label = f"phone '{phone_number}'"
        else:
            lookup_label = "order context"
        found_str = "found" if order_info.get("found") else "not found"
        console.print(
            f"[dim]  OrderLookup: {lookup_label} -> {found_str} "
            f"(status: {order_info.get('status', '-')})[/]"
        )

        # Multi-turn: keep the previous action when the next turn only supplies
        # an identifier. Pop it only once the order is fully found and verified
        # enough for action_executor to resume.
        if session_id and session_id in _session_pending_actions:
            if order_info.get("found"):
                pending_action_intent = _session_pending_actions.pop(session_id)
                console.print(
                    f"[dim]  OrderLookup: resumed pending action '{pending_action_intent.get('action')}' "
                    f"for session {session_id}[/]"
                )
            elif order_id or phone_number or email_address or order_info.get("verification_required"):
                pending_action_intent = dict(_session_pending_actions.get(session_id) or {})
                console.print(
                    f"[dim]  OrderLookup: kept pending action '{pending_action_intent.get('action')}' "
                    f"for session {session_id}[/]"
                )

        if order_info.get("found") and session_id:
            _remember_order_profile(session_id, order_info, question)

    elapsed = int((time.time() - t0) * 1000)

    return {
        "order_id": order_id or "",
        "phone_number": phone_number or "",
        "email_address": email_address or "",
        "order_info": order_info,
        "suggested_actions": suggested_actions,
        "pending_action_intent": pending_action_intent,
        "agent_trace": {
            **(state.get("agent_trace") or {}),
            "order_id_extracted": order_id,
            "phone_extracted": phone_number,
            "email_extracted": email_address,
            "order_found": bool(order_info.get("found")),
            "order_status": order_info.get("status", ""),
            "order_lookup_ms": elapsed,
        },
    }


def catalog_lookup_node(state: AgentState) -> dict:
    """Node: Tra cứu catalog live để trả lời tồn kho / sản phẩm."""
    t0 = time.time()
    question = state["question"]
    session_id = state.get("session_id", "")
    cached_catalog = _get_catalog_profile(session_id)
    shop_context = state.get("shop_context", {}) or {}
    lookup_question = question
    selected_product_name = _extract_catalog_selection_name(question, cached_catalog)
    if selected_product_name:
        lookup_question = selected_product_name
    elif cached_catalog and _has_catalog_followup_signal(question):
        base_name = cached_catalog.get("name") or cached_catalog.get("query") or ""
        lookup_question = f"{base_name} {question}".strip()
    catalog_info = lookup_live_catalog(lookup_question, shop_context)

    elapsed = int((time.time() - t0) * 1000)
    console.print(
        f"[dim]  CatalogLookup: {catalog_info.get('found', False)} "
        f"({elapsed}ms)[/]"
    )

    answer = catalog_info.get("summary") or "Mình chưa tìm được sản phẩm phù hợp."
    if catalog_info.get("found"):
        products = catalog_info.get("products") or []
        product_name = ""
        if isinstance(products, list) and len(products) == 1:
            first = products[0] if isinstance(products[0], dict) else {}
            product_name = first.get("name") or first.get("slug") or ""
        opening_context = "catalog" if product_name else "sales"
        answer = f"{_brand_voice_opening(opening_context, product_name=product_name)}\n{answer}"
    if catalog_info.get("found") and session_id:
        _remember_catalog_profile(session_id, catalog_info, question)

    answer = _apply_customer_service_postprocess(state, answer)

    return {
        "catalog_info": catalog_info,
        "answer": answer,
        "reviewer_triggered": False,
        "reviewer_result": {"is_approved": True, "issues": [], "retry_count": 0},
        "agent_trace": {
            **(state.get("agent_trace") or {}),
            "catalog_found": catalog_info.get("found", False),
            "catalog_query": catalog_info.get("query", ""),
            "catalog_lookup_ms": elapsed,
            "catalog_followup_memory_used": bool(selected_product_name or (cached_catalog and _has_catalog_followup_signal(question))),
            "catalog_selected_product": selected_product_name,
        },
    }


def loyalty_node(state: AgentState) -> dict:
    """Node: Trả lời loyalty cho guest / logged-in theo quyền truy cập."""
    t0 = time.time()
    question = state.get("question", "")
    shop_context = state.get("shop_context", {}) or {}
    auth_profile = state.get("auth_state") or _build_auth_profile(shop_context)
    text = question.lower()
    wants_redeem = _is_loyalty_redeem_request(text)
    amount = _extract_first_amount(text) if wants_redeem else 0

    answer = ""
    loyalty_info: dict = {}

    if not auth_profile.get("is_authenticated"):
        if wants_redeem or any(keyword in text for keyword in ("mình có bao nhiêu điểm", "điểm của mình", "hạng của mình")):
            answer = (
                "Phần điểm thưởng cá nhân cần bạn đăng nhập để mình kiểm tra đúng tài khoản nhé.\n"
                "Nếu bạn muốn, mình có thể nói nhanh cách tích điểm và các hạng loyalty trước."
            )
        else:
            config_res = get_loyalty_config(shop_context)
            config = config_res.get("data") if isinstance(config_res, dict) else {}
            answer = (
                "Đây là cách loyalty của MilkyBloom hoạt động nè:\n"
                f"{_format_loyalty_config_summary(config if isinstance(config, dict) else {})}"
            )
        elapsed = int((time.time() - t0) * 1000)
        return {
            "answer": answer,
            "loyalty_info": loyalty_info,
            "reviewer_triggered": False,
            "reviewer_result": {"is_approved": True, "issues": [], "retry_count": 0},
            "agent_trace": {
                **(state.get("agent_trace") or {}),
                "loyalty_scope": auth_profile.get("user_scope", "guest"),
                "loyalty_ms": elapsed,
                "loyalty_mode": "guest_info",
            },
        }

    if wants_redeem:
        if amount <= 0:
            answer = (
                "Bạn muốn đổi bao nhiêu coin vậy? "
                "Bạn gửi mình con số cụ thể, mình kiểm tra và trừ điểm giúp bạn."
            )
            elapsed = int((time.time() - t0) * 1000)
            answer = _apply_customer_service_postprocess(state, answer)
            return {
                "answer": answer,
                "loyalty_info": loyalty_info,
                "reviewer_triggered": False,
                "reviewer_result": {"is_approved": True, "issues": [], "retry_count": 0},
                "agent_trace": {
                    **(state.get("agent_trace") or {}),
                    "loyalty_scope": auth_profile.get("user_scope", "logged_in"),
                    "loyalty_ms": elapsed,
                    "loyalty_mode": "needs_amount",
                },
            }

        redeem_res = redeem_loyalty_coins(amount, shop_context)
        if redeem_res.get("success"):
            balance = redeem_res.get("data", {}).get("balance", 0)
            answer = f"Mình đã đổi {amount:,} coin cho bạn rồi nhé. Số dư hiện tại là {balance:,} coin."
        else:
            answer = redeem_res.get("message") or "Mình chưa đổi điểm được lúc này."

        elapsed = int((time.time() - t0) * 1000)
        answer = _apply_customer_service_postprocess(state, answer)
        return {
            "answer": answer,
            "loyalty_info": loyalty_info,
            "reviewer_triggered": False,
            "reviewer_result": {"is_approved": True, "issues": [], "retry_count": 0},
            "agent_trace": {
                **(state.get("agent_trace") or {}),
                "loyalty_scope": auth_profile.get("user_scope", "logged_in"),
                "loyalty_ms": elapsed,
                "loyalty_mode": "redeem",
            },
        }

    loyalty_res = get_my_loyalty(shop_context)
    if loyalty_res.get("success"):
        loyalty_info = loyalty_res.get("data") or {}
        answer = _format_loyalty_status(loyalty_info)
    else:
        answer = loyalty_res.get("message") or "Mình chưa lấy được thông tin loyalty của bạn."

    answer = f"{_brand_voice_opening('loyalty')}\n{answer}" if answer else answer
    answer = _apply_customer_service_postprocess(state, answer)

    elapsed = int((time.time() - t0) * 1000)
    return {
        "answer": answer,
        "loyalty_info": loyalty_info,
        "reviewer_triggered": False,
        "reviewer_result": {"is_approved": True, "issues": [], "retry_count": 0},
        "agent_trace": {
            **(state.get("agent_trace") or {}),
            "loyalty_scope": auth_profile.get("user_scope", "logged_in"),
            "loyalty_ms": elapsed,
            "loyalty_mode": "profile",
        },
    }


def support_ticket_node(state: AgentState) -> dict:
    """Node: Tạo support ticket riêng cho yêu cầu cần người thật xử lý."""
    t0 = time.time()
    question = state.get("question", "")
    shop_context = state.get("shop_context", {}) or {}
    auth_profile = state.get("auth_state") or _build_auth_profile(shop_context)

    subject = "Yêu cầu hỗ trợ từ chatbot"
    description = question.strip() or "Khách hàng cần hỗ trợ trực tiếp"
    payload = {
        "subject": subject,
        "description": description,
        "sourceMessage": question,
        "channel": "chat",
        "userId": auth_profile.get("user_id") or None,
        "contactName": shop_context.get("user_name") or shop_context.get("full_name") or "",
        "contactEmail": shop_context.get("email") or "",
        "contactPhone": shop_context.get("phone") or "",
        "metadata": {
            "user_scope": auth_profile.get("user_scope", "guest"),
            "capability": "support_ticket",
        },
    }

    ticket_res = create_support_ticket(payload, shop_context)
    if ticket_res.get("success"):
        ticket = ticket_res.get("data") or {}
        ticket_number = ticket_res.get("ticketNumber") or ticket.get("ticketNumber") or ticket.get("ticket_number") or ""
        ticket_id = ticket_res.get("ticketId") or ticket.get("_id") or ticket.get("id") or ""
        answer = _brand_voice_opening("support")
        if ticket_number:
            answer += f" Mã yêu cầu: {ticket_number}."
        answer += " Nếu cần, mình có thể theo dõi tiếp giúp bạn."
    else:
        ticket_number = ""
        ticket_id = ""
        answer = ticket_res.get("message") or "Mình chưa tạo ticket hỗ trợ được lúc này."

    answer = _apply_customer_service_postprocess(state, answer)
    elapsed = int((time.time() - t0) * 1000)
    return {
        "answer": answer,
        "ticket_info": ticket_res if isinstance(ticket_res, dict) else {},
        "reviewer_triggered": False,
        "reviewer_result": {"is_approved": True, "issues": [], "retry_count": 0},
        "agent_trace": {
            **(state.get("agent_trace") or {}),
            "ticket_scope": auth_profile.get("user_scope", "guest"),
            "ticket_ms": elapsed,
            "ticket_number": ticket_number,
            "ticket_id": ticket_id,
            "ticket_success": bool(ticket_res.get("success")),
            "capability": "support_ticket",
        },
    }


def _format_checkout_message(result: dict) -> str:
    if result.get("needs_login"):
        return result.get("message") or "Mình cần bạn đăng nhập trước khi checkout nhé."
    if result.get("needs_guest_session"):
        return result.get("message") or "Mình cần mã phiên giỏ hàng của khách để tạo đơn."
    if result.get("needs_product_selection"):
        return result.get("message") or "Mình cần bạn chọn sản phẩm muốn mua trước khi tạo đơn."
    if result.get("needs_guest_info"):
        return result.get("message") or "Mình cần thêm họ tên, email, số điện thoại và địa chỉ nhận hàng của khách."
    if result.get("needs_address"):
        return result.get("message") or "Mình cần địa chỉ giao hàng đã lưu để tạo đơn."
    if result.get("ok"):
        payload = result.get("result") or {}
        order = payload.get("data") or payload.get("order") or {}
        order_id = order.get("_id") or order.get("id") or payload.get("orderId") or ""
        message = payload.get("message") or "Mình đã tạo đơn từ giỏ hàng rồi."
        if order_id:
            message += f"\nMã đơn: {order_id}"
        return message

    message = str(result.get("message") or "").strip()
    if message:
        lowered = message.lower()
        if "cart is empty" in lowered or "empty cart" in lowered or "giỏ hàng trống" in lowered:
            return (
                "Mình chưa thấy sản phẩm nào trong giỏ hàng để tạo đơn. "
                "Nếu bạn đang muốn đổi địa chỉ cho đơn vừa đặt, bạn gửi mã đơn hoặc email đặt hàng giúp mình nhé."
            )
        return message

    return "Mình chưa thể tạo đơn lúc này."


def checkout_node(state: AgentState) -> dict:
    """Node: Checkout assistant dùng cart thật của user đang đăng nhập."""
    t0 = time.time()
    question = state["question"]
    session_id = state.get("session_id", "")
    history = state.get("history", [])
    shop_context = state.get("shop_context", {}) or {}
    cached_guest_profile = _get_guest_checkout_profile(session_id)
    if cached_guest_profile:
        merged_guest_profile = _merge_guest_info(
            cached_guest_profile,
            shop_context.get("guest_info") or shop_context.get("guestInfo") or {},
        )
        shop_context = {
            **shop_context,
            "guest_info": merged_guest_profile,
        }
    checkout_result = start_checkout(question, history, shop_context)
    catalog_info = checkout_result.get("catalog_info") or {}
    if catalog_info:
        _remember_catalog_profile(session_id, catalog_info, question)
    answer = _format_checkout_message(checkout_result)
    if checkout_result.get("ok"):
        answer = f"{_brand_voice_opening('sales')}\n{answer}" if answer else answer
    answer = _apply_customer_service_postprocess(state, answer)
    elapsed = int((time.time() - t0) * 1000)
    console.print(f"[dim]  CheckoutNode: {checkout_result.get('ok', False)} ({elapsed}ms)[/]")

    if checkout_result.get("ok"):
        _clear_guest_checkout_profile(session_id)

    return {
        "checkout_result": checkout_result,
        "catalog_info": catalog_info,
        "answer": answer,
        "reviewer_triggered": False,
        "reviewer_result": {"is_approved": True, "issues": [], "retry_count": 0},
        "agent_trace": {
            **(state.get("agent_trace") or {}),
            "checkout_ok": checkout_result.get("ok", False),
            "checkout_ms": elapsed,
            "guest_checkout_memory_used": bool(cached_guest_profile),
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
    auth_profile = state.get("auth_state") or _build_auth_profile(shop_context)
    order_id = state.get("order_id", "")
    phone_number = state.get("phone_number", "")
    email_address = state.get("email_address", "")
    identifier_only = bool(re.fullmatch(r"[\d\+\-\s\(\)]{8,}", question.strip()))

    # Multi-turn resume: if order_lookup found a pending action for this session
    if pending and order_info.get("found"):
        action_intent = resume_action_intent(question, order_info, pending)
        console.print(
            f"[dim]  ActionExecutor: resumed pending action '{pending.get('action')}' "
            f"with order {order_info.get('order_id', '')}[/]"
        )
    elif pending and pending.get("action"):
        action_intent = {
            **pending,
            "executable": False,
            "needs_order_id": not bool(order_id or phone_number or email_address),
            "needs_more_info": bool(order_info.get("verification_required")),
            "block_reason": "verification_required" if order_info.get("verification_required") else "",
        }
        console.print(
            f"[dim]  ActionExecutor: kept pending action '{pending.get('action')}' "
            "while waiting for verification[/]"
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

    def _followup_prompt(action_name: str, needs_more_info: bool = False) -> str:
        if action_name == "update_address" and needs_more_info:
            return (
                "Mình đã xác định được đơn rồi. "
                "Bạn gửi mình địa chỉ giao hàng mới để mình cập nhật nhé."
            )
        if action_name in {"request_refund", "process_return", "cancel_order", "check_order_status", "update_address"}:
            if needs_more_info:
                return (
                    "Mình có thể xử lý tiếp, nhưng mình cần thêm thông tin của đơn trước nhé. "
                    "Bạn gửi mình mã đơn hoặc email đặt hàng là mình kiểm tra ngay."
                )
            return (
                "Mình cần xác minh đúng đơn trước khi làm tiếp. "
                "Bạn gửi mình mã đơn hoặc email đặt hàng nhé."
            )
        return "Mình cần thêm thông tin trước khi xử lý tiếp nhé."

    action = action_intent.get("action", "no_action")
    action_conf = action_intent.get("confidence", {}) if isinstance(action_intent, dict) else {}
    authorization = authorize_action(action, auth_profile, order_info)
    has_pending_action = bool(pending and pending.get("action"))
    verified_followup = bool(has_pending_action and order_info.get("found") and order_info.get("ownership_verified"))

    # Save pending action whenever we still need the user to provide order
    # identity or missing details. This keeps the follow-up flow alive even
    # when the action itself is not yet permitted.
    can_store_pending = (
        bool(action_intent.get("needs_order_id") or action_intent.get("needs_more_info"))
        or authorization.get("allowed", False)
        or authorization.get("mode") == "needs_verification"
    )
    if action != "no_action" and session_id and can_store_pending:
        if action_intent.get("needs_order_id") or action_intent.get("needs_more_info"):
            _session_pending_actions[session_id] = {"action": action}
            console.print(
                f"[dim]  ActionExecutor: saved pending action '{action}' "
                f"for session {session_id}[/]"
            )

    action_result: dict = {}
    followup_needed = bool(action_intent.get("needs_order_id") or action_intent.get("needs_more_info"))
    if not authorization.get("allowed") and action != "no_action" and not (followup_needed or verified_followup):
        action_result = {
            "success": False,
            "blocked": True,
            "action": action,
            "message": authorization.get("reason") or "Mình chưa thể thực hiện thao tác này.",
            "ticket_id": None,
            "updated_fields": {},
            "permission_mode": authorization.get("mode", "blocked"),
        }
        console.print(
            f"[dim]  ActionExecutor: {action} -> BLOCKED by permission matrix "
            f"({authorization.get('mode', 'blocked')})[/]"
        )
    elif action == "check_order_status" and order_info.get("found"):
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
    elif action != "no_action" and verified_followup:
        action_result = execute_action(action_intent, order_info, shop_context)
        status = "OK" if action_result.get("success") else ("BLOCKED" if action_result.get("blocked") else "FAIL")
        console.print(
            f"[dim]  ActionExecutor: {action} -> {status} "
            f"(ticket: {action_result.get('ticket_id', '-')})[/]"
        )
    elif action != "no_action" and not followup_needed:
        action_result = execute_action(action_intent, order_info, shop_context)
        status = "OK" if action_result.get("success") else ("BLOCKED" if action_result.get("blocked") else "FAIL")
        console.print(
            f"[dim]  ActionExecutor: {action} -> {status} "
            f"(ticket: {action_result.get('ticket_id', '-')})[/]"
        )
    else:
        if order_info.get("verification_required") and (order_id or phone_number or email_address):
            followup_message = (
                "Mình đã nhận được thông tin đơn rồi, nhưng vẫn cần xác minh đúng chủ đơn trước khi xử lý tiếp. "
                "Bạn giúp mình đăng nhập tài khoản đã đặt đơn, xác minh OTP, gửi mã truy cập trong email xác nhận, "
                "hoặc gửi email đặt hàng để mình kiểm tra tiếp nhé."
            )
        else:
            followup_message = _followup_prompt(action, bool(action_intent.get("needs_more_info")))
        action_result = {
            "success": False,
            "blocked": False,
            "action": action,
            "message": followup_message,
            "ticket_id": None,
            "updated_fields": {},
            "needs_order_id": bool(action_intent.get("needs_order_id")),
            "needs_more_info": bool(action_intent.get("needs_more_info")),
            "pending": True,
        }
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
            "action_confidence": action_conf.get("confidence", 0.0),
            "action_method": action_conf.get("method", ""),
            "action_keyword_hits": action_conf.get("keyword_hits", 0),
            "action_semantic_score": action_conf.get("semantic_score", 0.0),
            "action_fallback_used": action_conf.get("method") in {"keyword", "clarify"},
            "action_prompt_version": action_conf.get("prompt_version", ""),
            "action_policy_version": action_conf.get("policy_version", ""),
            "permission_mode": authorization.get("mode", ""),
            "permission_allowed": authorization.get("allowed", False),
            "action_pending_saved": session_id in _session_pending_actions,
            "action_executor_ms": elapsed,
        },
    }


async def router_node(state: AgentState) -> dict:
    """Node 1: Classify intent (COMPLAINT / INQUIRY / CASUAL)."""
    t0 = time.time()
    question = state["question"]
    shop_context = state.get("shop_context", {}) or {}

    history = state.get("history", [])
    if _is_simple_greeting(question):
        meta = classify_with_metadata(question)
        intent = "CASUAL"
        auth_profile = _build_auth_profile(shop_context)
        capability = "casual"
        capability_reason = "simple_greeting"
        permission_rule = authorize_capability(capability, auth_profile)
        elapsed = int((time.time() - t0) * 1000)
        console.print(
            f"[dim]  Router: {intent} -> {capability} ({elapsed}ms, confidence={meta.get('confidence', 0):.3f})[/]"
        )
        return {
            "intent": intent,
            "capability": capability,
            "capability_reason": capability_reason,
            "user_scope": auth_profile.get("user_scope", "guest"),
            "is_authenticated": auth_profile.get("is_authenticated", False),
            "ownership_verified": auth_profile.get("ownership_verified", False),
            "permission_reason": (
                permission_rule.get("reason")
                or ("admin" if auth_profile.get("user_scope") == "admin"
                    else "authenticated" if auth_profile.get("is_authenticated")
                    else "guest")
            ),
            "auth_state": auth_profile,
            "router_confidence": meta.get("confidence", 0.0),
            "router_method": meta.get("method", ""),
            "router_semantic_scores": meta.get("semantic_scores", {}),
            "router_keyword_hits": meta.get("keyword_hits", 0),
            "router_fallback_used": meta.get("fallback_used", False),
            "router_clarify_reason": meta.get("clarify_reason", ""),
            "router_semantic_margin": meta.get("semantic_margin", 0.0),
            "clarification_needed": False,
            "agent_trace": {
                **(state.get("agent_trace") or {}),
                "router_decision": intent,
                "router_ms": elapsed,
                "router_confidence": meta.get("confidence", 0.0),
                "router_method": meta.get("method", ""),
                "router_semantic_scores": meta.get("semantic_scores", {}),
                "router_keyword_hits": meta.get("keyword_hits", 0),
                "router_fallback_used": meta.get("fallback_used", False),
                "router_clarify_reason": meta.get("clarify_reason", ""),
                "router_semantic_margin": meta.get("semantic_margin", 0.0),
                "trace_id": state.get("trace_id", ""),
                "policy_version": POLICY_VERSION,
                "user_scope": auth_profile.get("user_scope", "guest"),
                "capability": capability,
                "capability_reason": capability_reason,
                "permission_mode": permission_rule.get("mode", ""),
                **meta.get("prompt_meta", {}),
            },
        }
    contextualized_q = _build_contextualized_question(question, history)

    # LEVEL 2: Use follow-up detection for context (session_summary already built in run_streaming)
    session_summary = state.get("session_summary", {})
    meta = classify_with_followup_metadata(contextualized_q, session_summary)
    intent = meta["intent"]
    auth_profile = _build_auth_profile(shop_context)
    capability, capability_reason = _infer_capability(question, history, intent, auth_profile)
    if capability == "inquiry":
        intent = "INQUIRY"
    permission_rule = authorize_capability(capability, auth_profile)

    # LEVEL 4: Confidence gating - check if router confidence is low
    router_gate = {}
    if meta.get("clarify_reason"):  # Router detected low confidence/ambiguity
        router_gate = await ConfidenceGate.decide(
            state,
            action="route",
            confidence_score=meta.get("confidence", 0.0),
            missing_fields={}
        )
        console.print(f"[dim]  Router: GATE -> {router_gate.get('decision')} (confidence={meta.get('confidence', 0):.3f})[/]")

    elapsed = int((time.time() - t0) * 1000)
    console.print(
        f"[dim]  Router: {intent} -> {capability} ({elapsed}ms, confidence={meta.get('confidence', 0):.3f})[/]"
    )

    return {
        "intent": intent,
        "capability": capability,
        "capability_reason": capability_reason,
        "user_scope": auth_profile.get("user_scope", "guest"),
        "is_authenticated": auth_profile.get("is_authenticated", False),
        "ownership_verified": auth_profile.get("ownership_verified", False),
        "permission_reason": (
            permission_rule.get("reason")
            or ("admin" if auth_profile.get("user_scope") == "admin"
                else "authenticated" if auth_profile.get("is_authenticated")
                else "guest")
        ),
        "auth_state": auth_profile,
        "router_confidence": meta.get("confidence", 0.0),
        "router_method": meta.get("method", ""),
        "router_semantic_scores": meta.get("semantic_scores", {}),
        "router_keyword_hits": meta.get("keyword_hits", 0),
        "router_fallback_used": meta.get("fallback_used", False),
        "router_clarify_reason": meta.get("clarify_reason", ""),
        "router_semantic_margin": meta.get("semantic_margin", 0.0),
        "clarification_needed": meta.get("method") == "clarify",
        # LEVEL 2: Add follow-up fields
        "follow_up_type": meta.get("follow_up_type"),
        "contextualized_question_with_followup": meta.get("contextualized_question", contextualized_q),
        # LEVEL 4: Add router gate
        "router_gate": router_gate,
        "agent_trace": {
            **(state.get("agent_trace") or {}),
            "router_decision": intent,
            "router_ms": elapsed,
            "router_confidence": meta.get("confidence", 0.0),
            "router_method": meta.get("method", ""),
            "router_semantic_scores": meta.get("semantic_scores", {}),
            "router_keyword_hits": meta.get("keyword_hits", 0),
            "router_fallback_used": meta.get("fallback_used", False),
            "router_clarify_reason": meta.get("clarify_reason", ""),
            "router_semantic_margin": meta.get("semantic_margin", 0.0),
            "router_gate_decision": router_gate.get("decision", "proceed"),
            "follow_up_type": meta.get("follow_up_type"),
            "trace_id": state.get("trace_id", ""),
            "policy_version": POLICY_VERSION,
            "user_scope": auth_profile.get("user_scope", "guest"),
            "capability": capability,
            "capability_reason": capability_reason,
            "permission_mode": permission_rule.get("mode", ""),
            **meta.get("prompt_meta", {}),
        },
    }


async def casual_node(state: AgentState) -> dict:
    """Node: Casual response (không cần RAG)."""
    answer = await generate_casual(state["question"], question_image=state.get("question_image"))
    return {
        "answer": answer,
        "reviewer_triggered": False,
        "reviewer_result": {"is_approved": True, "issues": [], "retry_count": 0},
        "agent_trace": {
            **(state.get("agent_trace") or {}),
            "casual_answer": answer[:500],
            "casual_prompt_version": prompt_meta("casual")["prompt_version"],
        },
    }


def clarify_node(state: AgentState) -> dict:
    """Node: Ask a clarification question when confidence is too low."""
    question = state.get("question", "")
    history = state.get("history", [])
    trace = state.get("agent_trace", {}) or {}
    session_summary = state.get("session_summary", {}) or {}
    recent = " ".join(m.get("content", "") for m in history[-3:]).lower()
    clarify_reason = (
        state.get("router_clarify_reason", "")
        or trace.get("router_clarify_reason", "")
        or state.get("clarify_reason", "")
        or trace.get("clarify_reason", "")
        or ""
    )
    if clarify_reason == "noise_clarify":
        answer = "Mình chưa đọc rõ ý bạn lắm. Bạn nhắn lại ngắn giúp mình nhé?"
    elif any(k in recent for k in ORDER_CONTEXT_KEYWORDS):
        answer = (
            "Mình chưa chắc ý bạn ở phần nào lắm. "
            "Bạn muốn mình kiểm tra đơn hàng, đổi địa chỉ, hoàn tiền hay đổi trả vậy?"
        )
    elif _is_loyalty_request(question) or "điểm" in recent or "hạng" in recent:
        answer = (
            "Mình chưa chắc bạn đang muốn xem điểm, hạng thành viên hay đổi điểm. "
            "Bạn chọn một ý cụ thể giúp mình nhé."
        )
    elif _is_budget_catalog_request(question) or _has_budget_signal(question) or session_summary.get("budget", {}).get("max"):
        max_budget = session_summary.get("budget", {}).get("max")
        budget_text = f" dưới {f'{int(max_budget):,}đ'.replace(',', '.')}" if max_budget else ""
        answer = (
            f"Mình chưa rõ bạn muốn lọc món{budget_text} theo tiêu chí nào. "
            "Bạn muốn theo độ tuổi, chủ đề hay mục đích dùng vậy?"
        )
    elif state.get("capability") == "catalog" or state.get("follow_up_type") == "follow_up_catalog":
        answer = (
            "Mình chưa rõ bạn muốn xem thêm kiểu nào. "
            "Bạn thích mình lọc theo món rẻ hơn, cùng chủ đề hay cùng độ tuổi nhé?"
        )
    else:
        answer = (
            "Mình chưa chắc ý bạn lắm. "
            "Bạn muốn hỏi về sản phẩm, đơn hàng, giao hàng hay hỗ trợ gì vậy?"
        )
    return {
        "answer": answer,
        "reviewer_triggered": False,
        "reviewer_result": {"is_approved": True, "issues": [], "retry_count": 0},
        "agent_trace": {
            **(state.get("agent_trace") or {}),
            "clarification_needed": True,
            "clarification_question": answer,
            "clarify_reason": clarify_reason or "clarify",
            "clarify_prompt_version": prompt_meta("inquiry")["prompt_version"],
            "clarify_policy_version": prompt_meta("inquiry")["policy_version"],
        },
    }


def _is_generic_context_fallback(answer: str) -> bool:
    text = (answer or "").lower()
    return any(
        phrase in text
        for phrase in (
            "mình đang bị lỗi ai tạm thời",
            "mình vẫn có thể giúp bạn hỏi về sản phẩm, đơn hàng, vận chuyển, đổi trả hoặc chính sách",
            "mình có thể giúp bạn hỏi về sản phẩm, đơn hàng, vận chuyển, đổi trả hoặc chính sách",
            "mình chưa tìm thấy món nào trong tầm",
        )
    )


def _should_offer_next_step(state: AgentState, answer: str) -> bool:
    text = (answer or "").strip()
    if not text:
        return False
    if text.endswith("?"):
        return False
    if _is_generic_context_fallback(text):
        return False
    return state.get("capability") in {"catalog", "checkout", "inquiry", "order_management", "loyalty"}


def _build_next_step_suggestion(state: AgentState) -> str:
    capability = state.get("capability", "")
    question = (state.get("question") or "").lower()
    order_info = state.get("order_info") or {}
    catalog_info = state.get("catalog_info") or {}
    checkout_result = state.get("checkout_result") or {}
    session_summary = state.get("session_summary") or {}
    viewed_products = session_summary.get("viewed_products") or []

    if capability == "catalog":
        if catalog_info.get("found"):
            return "Nếu muốn, mình lọc tiếp theo độ tuổi, chủ đề hoặc ngân sách thấp hơn nhé."
        if viewed_products:
            return "Nếu thích, mình lọc thêm theo món tương tự hoặc rẻ hơn cho bạn."
        return "Bạn cho mình độ tuổi, chủ đề hoặc ngân sách, mình lọc lại sát hơn nhé."

    if capability == "checkout":
        if checkout_result.get("needs_product_selection"):
            return "Nếu muốn, bạn gửi tên sản phẩm cụ thể để mình hỗ trợ tiếp nhé."
        if checkout_result.get("needs_guest_info") or checkout_result.get("needs_address"):
            return "Bạn gửi mình họ tên, email, số điện thoại và địa chỉ nhận hàng là mình đi tiếp nhé."
        return "Nếu cần, mình có thể hỗ trợ thêm về thanh toán hoặc giao hàng."

    if capability == "order_management" or order_info.get("found") or "đơn" in question:
        if order_info.get("found"):
            return "Nếu muốn, mình tra tiếp theo mã đơn hoặc số điện thoại nhé."
        return "Bạn gửi mình mã đơn hoặc số điện thoại, mình kiểm tra tiếp ngay."

    if capability == "inquiry":
        if any(token in question for token in ("bảo hành", "đổi trả", "hoàn tiền", "hủy đơn", "giao hàng", "vận chuyển", "ship")):
            return "Nếu muốn, mình có thể nói rõ thêm phần đổi trả, bảo hành hoặc giao hàng."
        return "Nếu cần, mình có thể giải thích thêm một ý nữa cho rõ hơn."

    if capability == "loyalty":
        if "đổi" in question or "điểm" in question:
            return "Nếu muốn, mình có thể nói tiếp cách tích điểm hoặc đổi điểm nhé."
        return "Nếu cần, mình có thể nói nhanh quyền lợi từng hạng thành viên."

    return ""


def _apply_customer_service_postprocess(state: AgentState, answer: str) -> str:
    """Guard and enrich customer-facing answers before returning them."""
    text = (answer or "").strip()
    if not text:
        return text

    lowered = text.lower()
    if _is_generic_context_fallback(text):
        capability = state.get("capability", "")
        question = (state.get("question") or "").lower()
        if capability == "catalog" or _has_budget_signal(question):
            return "Mình gợi ý nhanh cho bạn nè. Bạn cho mình độ tuổi, chủ đề hoặc ngân sách cụ thể, mình lọc ngay cho bạn."
        if capability == "checkout":
            return "Mình đang hỗ trợ bước mua hàng cho bạn nè. Bạn gửi mình tên sản phẩm cụ thể để mình đi tiếp nhé."
        if capability == "order_management":
            return "Mình có thể tra đơn cho bạn nè. Bạn gửi mình mã đơn hoặc số điện thoại đặt hàng nhé."
        if capability == "inquiry":
            return "Mình có thể hỗ trợ đổi trả, bảo hành, giao hàng hoặc thanh toán. Bạn muốn hỏi phần nào vậy?"

    suggestion = _build_next_step_suggestion(state)
    if suggestion and suggestion.lower() not in lowered and _should_offer_next_step(state, text):
        text = f"{text}\n\n{suggestion}"

    return text


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
    """Node: Generate empathetic response with streaming (LEVEL 3: Tool-First)."""
    t0 = time.time()
    question = state["question"]
    evidence_text = state.get("evidence_text", "")
    sentiment = state.get("sentiment", "")
    sentiment_score = state.get("sentiment_score", 0)
    compensation = state.get("compensation", "")
    order_info = state.get("order_info", {})
    catalog_info = state.get("catalog_info", {})
    action_result = state.get("action_result", {})
    action_intent = state.get("action_intent", {})
    stream_callback = state.get("stream_callback")
    session_summary_text = state.get("session_summary_text", "")

    # LEVEL 3: Try tool-first execution before LLM
    action = action_intent.get("action") if action_intent else "no_action"
    used_llm = True
    tool_result = {}

    if action and action != "no_action":
        should_use_llm, tool_result, direct_answer = await ToolExecutor.execute_and_format(
            action,
            state,
            state.get("follow_up_type")
        )

        if not should_use_llm and direct_answer:
            # Tool produced conclusive answer → skip LLM entirely
            elapsed = int((time.time() - t0) * 1000)
            console.print(f"[dim]  EmpathyWriter: TOOL-DIRECT {action} ({elapsed}ms)[/]")
            return {
                "answer": direct_answer,
                "used_llm": False,
                "agent_trace": {
                    **(state.get("agent_trace") or {}),
                    "writer_answer": direct_answer[:500],
                    "writer_ms": elapsed,
                    "writer_type": "tool_direct",
                    "tool_action": action,
                },
            }
        used_llm = should_use_llm

    if action_result.get("pending") and action_result.get("message"):
        answer = action_result["message"]
    else:
        answer = await generate_empathy_streaming(
            question=question,
            evidence_text=evidence_text,
            sentiment=sentiment,
            score=sentiment_score,
            user_vibe=state.get("user_vibe", "neutral"),
            compensation=compensation,
            order_info=order_info,
            action_result=action_result,
            action_intent=action_intent,
            catalog_info=catalog_info,
            session_summary_text=session_summary_text,
            stream_callback=stream_callback,
            question_image=state.get("question_image"),
        )

    elapsed = int((time.time() - t0) * 1000)
    console.print(f"[dim]  EmpathyWriter: {len(answer)} chars ({elapsed}ms)[/]")

    return {
        "answer": answer,
        "used_llm": used_llm,
        "agent_trace": {
            **(state.get("agent_trace") or {}),
            "writer_answer": answer[:500],
            "writer_ms": elapsed,
            "writer_type": "llm" if used_llm else "tool",
            "empathy_prompt_version": prompt_meta("empathy")["prompt_version"],
            "empathy_policy_version": prompt_meta("empathy")["policy_version"],
        },
    }


async def inquiry_writer_node(state: AgentState) -> dict:
    """Node: Answer inquiry (LEVEL 3: Tool-first for catalog/policy)."""
    t0 = time.time()
    question = state["question"]
    evidence_text = state.get("evidence_text", "")
    order_info = state.get("order_info", {})
    catalog_info = state.get("catalog_info", {})
    capability_reason = str(state.get("capability_reason") or "").lower()
    session_summary_text = state.get("session_summary_text", "")
    stream_callback = state.get("stream_callback")
    used_llm = False

    if "cancel_policy_question" in capability_reason or _is_cancel_policy_question(question):
        answer = _format_cancel_policy_summary()
    elif "return_policy_question" in capability_reason or _is_return_policy_question(question):
        answer = _format_return_policy_summary()
    elif "warranty_policy_question" in capability_reason or _is_warranty_policy_question(question):
        answer = _format_warranty_policy_summary()
    elif "support_contact_request" in capability_reason or _is_support_ticket_request(question):
        answer = _format_support_contact_summary()
    elif state.get("capability") == "catalog" and catalog_info.get("found"):
        # LEVEL 3: Tool-direct format for catalog (no LLM)
        answer = await ToolExecutor.execute_and_format(
            "lookup_catalog",
            state,
            state.get("follow_up_type")
        )
        if isinstance(answer, tuple):
            _, _, answer = answer
    else:
        # Default: use LLM for general inquiry
        answer = await generate_inquiry_streaming(
            question, evidence_text, order_info=order_info, catalog_info=catalog_info,
            session_summary_text=session_summary_text, stream_callback=stream_callback,
            question_image=state.get("question_image")
        )
        used_llm = True

    answer = _apply_customer_service_postprocess(state, answer)
    if stream_callback and answer and not used_llm:
        await stream_callback(answer)
    elapsed = int((time.time() - t0) * 1000)
    console.print(f"[dim]  InquiryWriter: {len(answer)} chars ({elapsed}ms)[/]")

    return {
        "answer": answer,
        "used_llm": used_llm,
        "reviewer_triggered": False,
        "reviewer_result": {"is_approved": True, "issues": [], "retry_count": 0},
        "agent_trace": {
            **(state.get("agent_trace") or {}),
            "inquiry_answer": answer[:500],
            "inquiry_ms": elapsed,
            "inquiry_type": "policy" if not used_llm and not catalog_info.get("found") else "catalog_direct" if not used_llm else "llm",
            "inquiry_prompt_version": prompt_meta("inquiry")["prompt_version"],
            "inquiry_policy_version": prompt_meta("inquiry")["policy_version"],
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
    lookup_hints = order_info.get("lookup_hints") or [
        "đăng nhập tài khoản đã đặt đơn",
        "xác minh OTP của tài khoản chủ đơn",
        "mã truy cập đơn hàng trong email xác nhận",
        "email bạn dùng khi đặt hàng để mình giúp bạn tìm email xác nhận",
    ]
    lookup_hint_text = _join_lookup_hints(lookup_hints)

    if order_info.get("verification_required"):
        answer = (
            "Mình cần xác minh đúng chủ đơn trước khi tra cứu nhé.\n"
            f"Bạn giúp mình {lookup_hint_text} là mình kiểm tra tiếp ngay."
        )
    elif not order_info.get("found"):
        matched_phone = order_info.get("matched_phone", "")
        answer = (
            "Mình chưa tìm thấy đơn hàng nào khớp với thông tin bạn gửi."
            f"{f' Số điện thoại mình tra là {matched_phone}.' if matched_phone else ''} "
            f"Bạn có thể thử {lookup_hint_text} nhé."
        )
    elif status == "delivered":
        answer = (
            f"{_brand_voice_opening('order', order_id=order_id)}\n"
            "Đơn này đã được giao thành công rồi nè.\n"
            "Nếu bạn muốn, mình có thể xem tiếp phần hỗ trợ đổi trả hoặc bảo hành cho đơn này."
        )
    elif status == "shipping":
        answer = (
            f"{_brand_voice_opening('order', order_id=order_id)}\n"
            "Đơn hiện đang trong trạng thái vận chuyển.\n"
            "Mình có thể giúp bạn theo dõi thêm nếu bạn muốn."
        )
    elif status == "processing":
        answer = (
            f"{_brand_voice_opening('order', order_id=order_id)}\n"
            "Đơn hiện đang được xử lý / đóng gói.\n"
            "Khi đơn chuyển sang vận chuyển, mình sẽ báo bạn tiếp nha."
        )
    elif status == "cancelled":
        answer = (
            f"{_brand_voice_opening('order', order_id=order_id)}\n"
            "Đơn này đã được hủy rồi.\n"
            "Nếu bạn cần mình xem thêm trạng thái hoàn tiền, mình kiểm tra tiếp cho bạn."
        )
    else:
        answer = (
            f"{_brand_voice_opening('order', order_id=order_id)}\n"
            f"Trạng thái hiện tại của đơn là: {status or 'không rõ'}."
        )

    if customer_name and customer_name not in answer:
        answer = f"Chào {customer_name}! " + answer

    answer = _apply_customer_service_postprocess(state, answer)
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
            "order_status_prompt_version": prompt_meta("inquiry")["prompt_version"],
        },
    }


async def reviewer_node(state: AgentState) -> dict:
    """Node: Empathy quality check (LEVEL 5: Voice consistency polish)."""
    t0 = time.time()
    question = state["question"]
    answer = state.get("answer", "")
    evidence_text = state.get("evidence_text", "")
    sentiment = state.get("sentiment", "")
    session_id = state.get("session_id", "")

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

    # LEVEL 5: Polish response for voice consistency
    session_tone = state.get("session_tone", "casual")
    if not session_tone:
        # Pick tone based on session summary
        session_summary = state.get("session_summary", {})
        session_tone = await VoiceConsistency.pick_tone_for_session(session_summary)

    response_history = state.get("response_history", [])
    final_answer = await VoiceConsistency.polish_response(
        final_answer,
        session_id,
        session_tone,
        response_history
    )
    guarded_answer = _apply_customer_service_postprocess(state, final_answer)
    context_guarded = guarded_answer != final_answer
    final_answer = guarded_answer

    elapsed = int((time.time() - t0) * 1000)

    return {
        "answer": final_answer,
        "reviewer_triggered": reviewer_triggered,
        "reviewer_result": reviewer_result,
        "session_tone": session_tone,
        "agent_trace": {
            **(state.get("agent_trace") or {}),
            "reviewer_triggered": reviewer_triggered,
            "reviewer_result": reviewer_result,
            "reviewer_ms": elapsed,
            "session_tone": session_tone,
            "context_guarded": context_guarded,
            "reviewer_prompt_version": prompt_meta("reviewer")["prompt_version"],
            "reviewer_policy_version": prompt_meta("reviewer")["policy_version"],
        },
    }


# ================================================================
# Conditional Edges
# ================================================================

def route_by_intent(state: AgentState) -> str:
    _remember_guest_checkout_profile(state)
    intent = state.get("intent", "")
    trace = state.get("agent_trace", {}) or {}
    session_id = state.get("session_id", "")
    question = state.get("question", "")
    history = state.get("history", [])
    capability = state.get("capability", "")
    current_order_policy_question = _is_order_policy_question(question)
    has_order_clue = bool(extract_order_id(question) or extract_phone_number(question))
    has_email_clue = bool(extract_email_address(question))
    recent_order_context = any(
        keyword in " ".join(m.get("content", "") for m in history[-4:]).lower()
        for keyword in ORDER_CONTEXT_KEYWORDS
    )
    cached_order = _get_order_profile(session_id)
    has_order_followup = bool(
        cached_order
        and not current_order_policy_question
        and _has_order_followup_signal(question)
    )
    cached_catalog = _get_catalog_profile(session_id)
    has_catalog_followup = bool(cached_catalog and _has_catalog_followup_signal(question))
    current_catalog_request = (
        _is_catalog_request(question)
        or _is_catalog_recommendation_request(question)
        or bool(_extract_catalog_selection_name(question, cached_catalog))
    )

    if capability == "loyalty":
        console.print("[dim]  Router: capability loyalty — forcing loyalty path[/]")
        return "loyalty"
    if capability == "support_ticket":
        console.print("[dim]  Router: support_ticket is not customer-facing — using inquiry path[/]")
        return "inquiry"
    if capability == "checkout":
        console.print("[dim]  Router: capability checkout — forcing checkout path[/]")
        return "checkout"
    if capability == "catalog":
        console.print("[dim]  Router: capability catalog — forcing catalog path[/]")
        return "catalog"
    if capability == "order_management":
        console.print("[dim]  Router: capability order_management — forcing COMPLAINT path[/]")
        return "complaint"

    if _is_budget_catalog_request(question):
        console.print("[dim]  Router: budget-based purchase request — forcing catalog path[/]")
        return "catalog"

    if _is_payment_policy_question(question):
        console.print("[dim]  Router: payment policy question — forcing inquiry path[/]")
        return "inquiry"

    explicit_checkout_request = _is_checkout_request(question) or _is_checkout_progression_request(question)
    if explicit_checkout_request:
        console.print("[dim]  Router: explicit checkout progression — forcing checkout path[/]")
        return "checkout"

    if has_order_followup and not current_catalog_request:
        console.print(
            f"[dim]  Router: cached order '{cached_order.get('order_id', '')}' + follow-up signal — forcing COMPLAINT path[/]"
        )
        return "complaint"

    if has_email_clue and not (_is_catalog_request(question) or _is_purchase_request(question)):
        console.print("[dim]  Router: detected email identifier — forcing COMPLAINT path[/]")
        return "complaint"

    if has_catalog_followup:
        console.print(
            f"[dim]  Router: cached catalog '{cached_catalog.get('name') or cached_catalog.get('query', '')}' + follow-up signal — forcing catalog path[/]"
        )
        return "catalog"

    if current_catalog_request:
        console.print("[dim]  Router: detected catalog / budget recommendation — forcing catalog path[/]")
        return "catalog"

    if capability == "inquiry":
        console.print("[dim]  Router: capability inquiry — forcing inquiry path[/]")
        return "inquiry"

    if (
        state.get("clarification_needed")
        or state.get("router_method") == "clarify"
        or state.get("router_clarify_reason")
        or trace.get("router_method") == "clarify"
        or trace.get("router_clarify_reason")
    ):
        return "clarify"

    # Order / address / status flows should win over checkout so we do not
    # accidentally try to create a new cart order when the user is talking
    # about an existing order.
    if (
        has_order_clue
        or (recent_order_context and _has_order_followup_signal(question))
        or (not current_order_policy_question and _is_existing_order_issue(question))
    ) and not current_catalog_request:
        console.print("[dim]  Router: detected order clue (order id / phone) — forcing COMPLAINT path[/]")
        return "complaint"

    if _is_purchase_request(question) and not current_catalog_request:
        console.print("[dim]  Router: detected checkout request — forcing checkout path[/]")
        return "checkout"

    if _is_catalog_request(question):
        console.print("[dim]  Router: detected catalog request — forcing catalog path[/]")
        return "catalog"

    # Multi-turn override: if session has a pending action waiting for order_id,
    # force complaint path so action_executor can resume it
    if session_id and session_id in _session_pending_actions:
        console.print(
            f"[dim]  Router: session {session_id} has pending action "
            f"'{_session_pending_actions[session_id].get('action')}' — forcing COMPLAINT path[/]"
        )
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
    graph.add_node("catalog", catalog_lookup_node)
    graph.add_node("loyalty", loyalty_node)
    graph.add_node("support_ticket", support_ticket_node)
    graph.add_node("checkout", checkout_node)
    graph.add_node("clarify", clarify_node)
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
            "catalog": "catalog",
            "loyalty": "loyalty",
            "support_ticket": "support_ticket",
            "checkout": "checkout",
            "clarify": "clarify",
            "inquiry": "order_lookup_inquiry",
            "complaint": "order_lookup",
        },
    )

    # Casual -> END
    graph.add_edge("casual", END)
    graph.add_edge("catalog", END)
    graph.add_edge("loyalty", END)
    graph.add_edge("support_ticket", END)
    graph.add_edge("checkout", END)
    graph.add_edge("clarify", END)

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
        if action_intent.get("action") == "check_order_status" and (
            order_info.get("verification_required")
            or order_info.get("order_id")
            or state.get("order_id")
        ):
            return "status"
        if (
            action_intent.get("needs_order_id")
            or action_intent.get("needs_more_info")
            or order_info.get("verification_required")
        ):
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

    # Inquiry: policy questions can go straight to the policy summary writer,
    # avoiding dependency on Qdrant / retrieval availability.
    def route_after_inquiry_entry(state):
        question = state.get("question", "")
        capability_reason = str(state.get("capability_reason") or "").lower()
        if (
            "return_policy_question" in capability_reason
            or "cancel_policy_question" in capability_reason
            or "warranty_policy_question" in capability_reason
            or _is_order_policy_question(question)
            or _is_support_ticket_request(question)
        ):
            return "direct"
        return "retrieve"

    graph.add_conditional_edges(
        "order_lookup_inquiry",
        route_after_inquiry_entry,
        {
            "direct": "inquiry_writer",
            "retrieve": "retrieve",
        },
    )

    # Both INQUIRY and COMPLAINT share: retrieve -> grade
    graph.add_edge("retrieve", "grade")

    # Combined routing after grade:
    # - INQUIRY intent -> inquiry_writer
    # - COMPLAINT + good evidence -> empathy_writer
    # - COMPLAINT + bad evidence + retries left -> rewrite
    # - COMPLAINT + bad evidence + no retries -> empathy_writer (give up)
    def route_after_grade(state):
        intent = state.get("intent", "")
        if intent == "INQUIRY" or state.get("capability") == "inquiry":
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


def _langfuse_user_id(shop_context: dict | None) -> str | None:
    context = shop_context or {}
    for key in ("user_id", "userId", "customer_id", "customerId", "id"):
        value = context.get(key)
        if value and "@" not in str(value):
            return str(value)
    return None


def _langfuse_auth_scope(shop_context: dict | None) -> str:
    try:
        return str(_build_auth_profile(shop_context).get("user_scope") or "guest")
    except Exception:
        return "guest"


def _langfuse_pipeline_input(
    question: str,
    history: list[dict] | None,
    shop_context: dict | None,
) -> dict:
    recent_history = []
    for message in (history or [])[-6:]:
        if not isinstance(message, dict):
            continue
        recent_history.append(
            {
                "role": str(message.get("role") or ""),
                "content": redact_for_langfuse(message.get("content") or ""),
            }
        )

    context = shop_context or {}
    auth_profile = _build_auth_profile(context)
    return {
        "question": redact_for_langfuse(question),
        "history": recent_history,
        "shop_context": {
            "user_scope": auth_profile.get("user_scope", "guest"),
            "is_authenticated": bool(auth_profile.get("is_authenticated")),
            "has_auth_token": bool(
                context.get("auth_token")
                or context.get("authToken")
                or context.get("access_token")
                or context.get("accessToken")
            ),
        },
    }


def _langfuse_pipeline_output(final_state: dict) -> dict:
    return {
        "answer": redact_for_langfuse(final_state.get("answer", "")),
        "intent": final_state.get("intent", ""),
        "capability": final_state.get("capability", ""),
        "processing_time_ms": final_state.get("processing_time_ms", 0),
    }


def _langfuse_pipeline_metadata(final_state: dict) -> dict:
    order_info = final_state.get("order_info") or {}
    action_result = final_state.get("action_result") or {}
    has_order_identifier = bool(
        final_state.get("order_id")
        or final_state.get("phone_number")
        or final_state.get("email_address")
    )
    verification_required = bool(order_info.get("verification_required"))
    return {
        "intent": final_state.get("intent", ""),
        "sentiment": final_state.get("sentiment", ""),
        "capability": final_state.get("capability", ""),
        "is_evidence_sufficient": bool(final_state.get("is_evidence_sufficient", True)),
        "reviewer_triggered": bool(final_state.get("reviewer_triggered", False)),
        "rewrite_count": int(final_state.get("rewrite_count") or 0),
        "order_found": bool(order_info.get("found")),
        "order_identifier_received": has_order_identifier,
        "verification_required": verification_required,
        "lookup_blocked_by_auth": has_order_identifier and verification_required and not order_info.get("found"),
        "ownership_verified": bool(final_state.get("ownership_verified", False)),
        "action": action_result.get("action", ""),
        "action_success": bool(action_result.get("success", False)),
        "ticket_created": bool((final_state.get("ticket_info") or {}).get("success")),
    }


def _langfuse_attribute_context(
    session_id: str,
    trace_id: str,
    shop_context: dict | None,
):
    if not get_langfuse():
        return nullcontext()

    try:
        from langfuse import propagate_attributes

        auth_scope = _langfuse_auth_scope(shop_context)
        return propagate_attributes(
            trace_name="empathAI_pipeline",
            session_id=session_id or trace_id,
            user_id=_langfuse_user_id(shop_context),
            version=POLICY_VERSION,
            tags=["milkybloom", "agentic-ai", "chat", auth_scope],
            metadata={
                "feature": "chat_assistant",
                "auth_scope": auth_scope,
            },
        )
    except Exception:
        return nullcontext()


@observe(name="empathAI_pipeline", as_type="span", capture_input=False, capture_output=False)
async def run_streaming(
    question: str,
    history: list[dict] = None,
    session_id: str = "",
    shop_context: dict | None = None,
    image_data: str | None = None,
    stream_callback: Optional[Callable[[str], Awaitable[None]]] = None,
) -> dict:
    """Run full EmpathAI pipeline with streaming."""
    start_time = time.time()
    console.print(f"[cyan]Incoming: '{question[:60]}...'[/]")

    graph = _get_graph()
    trace_id = session_id or f"trace_{uuid.uuid4().hex[:10]}"

    # LEVEL 1: Pre-build session summary for use in follow-up detection
    session_summary = await SessionMemoryManager.get_summary(session_id, _session_summaries)
    if not session_summary:
        # First turn: build summary from question + minimal state
        temp_state = {
            "session_id": session_id,
            "question": question,
            "history": history or [],
            "capability": "",
            "catalog_info": {},
            "order_info": {},
            "action_intent": {},
            "ownership_verified": False,
        }
        session_summary = await SessionMemoryManager.build_summary(temp_state)

    initial_state: AgentState = {
        "trace_id": trace_id,
        "session_id": session_id,
        "question": question,
        "history": history or [],
        "shop_context": shop_context or {},
        "question_image": image_data or "",
        "user_scope": "guest",
        "is_authenticated": False,
        "ownership_verified": False,
        "capability": "",
        "capability_reason": "",
        "permission_reason": "",
        "auth_state": {},
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
        "catalog_info": {},
        "checkout_result": {},
        "ticket_info": {},
        "suggested_actions": [],
        "action_intent": {},
        "action_result": {},
        "pending_action_intent": {},
        "clarification_needed": False,
        "is_evidence_sufficient": True,
        "answer": "",
        "reviewer_triggered": False,
        "reviewer_result": {},
        "agent_trace": {},
        "processing_time_ms": 0,
        "stream_callback": stream_callback,
        # LEVEL 1 & 2: Add session memory and follow-up fields
        "session_summary": session_summary,
        "session_summary_text": session_summary.get("summary_text", ""),
        "budget": session_summary.get("budget", {}),  # Flatten for easy access
        "viewed_products": session_summary.get("viewed_products", []),  # Flatten for easy access
        "follow_up_type": None,
        "contextualized_question_with_followup": "",
    }

    with _langfuse_attribute_context(session_id, trace_id, shop_context):
        update_current_span_safe(
            input=_langfuse_pipeline_input(question, history, shop_context),
            version=POLICY_VERSION,
            metadata={"phase": "start", "feature": "chat_assistant"},
        )
        try:
            final_state = await graph.ainvoke(initial_state)
        except Exception as e:
            update_current_span_safe(
                level="ERROR",
                status_message=str(e)[:500],
                output={"error": redact_for_langfuse(str(e))},
            )
            flush_langfuse()
            raise

        processing_time = int((time.time() - start_time) * 1000)
        final_state["processing_time_ms"] = processing_time

        # Sync flattened fields with session_summary
        if final_state.get("session_summary"):
            final_state["budget"] = final_state["session_summary"].get("budget", {})
            final_state["viewed_products"] = final_state["session_summary"].get("viewed_products", [])

        update_current_span_safe(
            output=_langfuse_pipeline_output(final_state),
            metadata=_langfuse_pipeline_metadata(final_state),
        )
        try:
            if session_id:
                await SessionMemoryManager.update_summary(session_id, final_state, _session_summaries)
                updated_summary = _session_summaries.get(session_id, {})
                final_state["session_summary"] = updated_summary
                final_state["session_summary_text"] = updated_summary.get("summary_text", final_state.get("session_summary_text", ""))
                final_state["budget"] = updated_summary.get("budget", final_state.get("budget", {}))
                final_state["viewed_products"] = updated_summary.get("viewed_products", final_state.get("viewed_products", []))
        except Exception as summary_error:
            console.print(f"[yellow]  SessionMemory: failed to update summary: {summary_error}[/]")
        try:
            from utils.chatbot_metrics import record_chatbot_trace
            record_chatbot_trace(final_state)
        except Exception as e:
            console.print(f"[yellow]  Chatbot metrics: failed to record trace: {e}[/]")

        flush_langfuse()
        console.print(f"[green]Done in {processing_time}ms[/]")
        return final_state


# ================================================================
# Utility
# ================================================================

def _build_contextualized_question(question, history):
    if _is_simple_greeting(question):
        return question
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
