"""
Router Agent — Phân loại intent cho EmpathAI.
3 intent: COMPLAINT / INQUIRY / CASUAL
Embedding-based, KHÔNG dùng LLM.
"""
import numpy as np
import re
import sys
import unicodedata
from pathlib import Path
sys.path.append(str(Path(__file__).parent.parent))

from agents.model_registry import get_embed_model, get_embed_cached
from agents.prompt_registry import prompt_meta
from tools.order_tool import extract_email_address, extract_order_id, extract_phone_number
from utils.console import console

_complaint_centroid = None
_inquiry_centroid = None
_casual_centroid = None

COMPLAINT_KEYWORDS = [
    "lỗi", "hỏng", "hư", "bể", "nát", "sai", "nhầm", "tệ",
    "lừa đảo", "ăn cướp", "bực mình", "tức giận", "thất vọng",
    "khiếu nại", "phàn nàn", "bức xúc", "mệt mỏi",
    "hoàn tiền", "đổi trả", "bồi thường",
    "hủy đơn", "hủy đơn hàng", "muốn hủy", "cancel order",
    "đổi địa chỉ", "thay đổi địa chỉ", "sửa địa chỉ", "cập nhật địa chỉ",
    "check order", "kiểm tra đơn", "tra cứu đơn", "theo dõi đơn",
    "không được", "không hoạt động", "không phản hồi",
    "chờ quá lâu", "quá chậm", "trễ hạn", "mất hàng",
    "tính sai tiền", "trừ tiền", "không nhận được",
    "giao sai", "giao trễ", "vỡ", "rác", "ngu",
    "report", "kiện", "phốt", "đổ lỗi", "không chấp nhận",
    "quá tệ", "kinh khủng", "nguy hiểm", "dị ứng", "hư hỏng",
    "gian lận", "sale ảo", "voucher lỗi", "không áp dụng",
]

INQUIRY_KEYWORDS = [
    "hỏi", "thắc mắc", "muốn biết", "cho tôi hỏi",
    "hướng dẫn", "cách làm", "làm sao", "thế nào",
    "báo giá", "giá bao nhiêu", "có sẵn không",
    "tư vấn", "gợi ý", "khuyên", "đề xuất",
    "thời gian", "bao lâu", "khi nào",
    "chính sách", "điều kiện", "quy định",
    "ship", "giao hàng", "phí ship", "vận chuyển",
    "thanh toán", "chuyển khoản", "trả góp", "cod",
    "hỗ trợ thanh toán", "có hỗ trợ", "thanh toán cod",
    "ưu đãi", "khuyến mãi", "giảm giá",
    "bảo hành",
    "loyalty", "điểm", "coin", "coins", "hạng", "tier", "thành viên", "membership", "tích điểm", "điểm thưởng", "đổi điểm", "redeem",
    "size", "còn size", "bảng size", "size 39", "size 40",
]

CASUAL_KEYWORDS = [
    "xin chào", "chào bạn", "hello", "hi", "hey",
    "cảm ơn", "cảm ơn bạn", "thanks", "thank you",
    "tạm biệt", "bye", "bai bai",
    "bạn là ai", "tên gì", "bạn làm được gì",
    "bạn khỏe không", "oke", "ok", "vâng", "ừ",
]

CASUAL_SHORT_ONLY = ["chào", "hi", "hey", "ok", "ừ", "vâng", "dạ"]
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
    "mã order",
]


def _looks_like_identifier_only(question: str) -> bool:
    """Detect pure identifiers like phone numbers or order codes."""
    compact = re.sub(r"\s+", "", question or "")
    return bool(re.fullmatch(r"[\d\+\-\(\)]{8,}", compact))


def _looks_like_noise(question: str) -> bool:
    """Detect short gibberish / random keyboard mash that should be clarified."""
    normalized = _normalize_text(question)
    compact = re.sub(r"\s+", "", normalized)
    if not compact or len(compact) < 3:
        return True
    if any(keyword in normalized for keyword in COMPLAINT_KEYWORDS + INQUIRY_KEYWORDS + CASUAL_KEYWORDS):
        return False
    if _looks_like_identifier_only(question) or extract_order_id(question) or extract_phone_number(question):
        return False
    # A single token with no vowels is usually keyboard mash, not an intent.
    tokens = normalized.split()
    if len(tokens) == 1 and not re.search(r"[aeiouy]", compact):
        return True
    # Very low character diversity often indicates random text.
    if len(set(compact)) <= 3 and len(compact) >= 5:
        return True
    return False


def _normalize_text(text: str) -> str:
    text = unicodedata.normalize("NFD", text or "")
    text = "".join(ch for ch in text if unicodedata.category(ch) != "Mn")
    text = text.replace("Đ", "d").replace("đ", "d")
    return re.sub(r"\s+", " ", text).strip().lower()


def _pattern_matches(text: str, pattern: str) -> bool:
    normalized_text = _normalize_text(text)
    normalized_pattern = _normalize_text(pattern)
    if any(ch in normalized_pattern for ch in ".*+?[](){}|\\^$"):
        return re.search(normalized_pattern, normalized_text) is not None
    return re.search(rf"\b{re.escape(normalized_pattern)}\b", normalized_text) is not None


def _has_recent_order_context(history: list[dict]) -> bool:
    """Check whether recent turns suggest we're in an order-lookup flow."""
    recent_text = " ".join((m.get("content", "") or "") for m in history[-4:]).lower()
    return any(keyword in recent_text for keyword in ORDER_CONTEXT_KEYWORDS)


def _ensure_centroids():
    global _complaint_centroid, _inquiry_centroid, _casual_centroid
    if _complaint_centroid is not None:
        return

    model = get_embed_model()
    console.print("[dim]  Router: computing centroids...[/]")

    comp_emb = model.encode(COMPLAINT_KEYWORDS, normalize_embeddings=True, batch_size=64)
    _complaint_centroid = np.mean(comp_emb, axis=0)
    _complaint_centroid /= np.linalg.norm(_complaint_centroid)

    inq_emb = model.encode(INQUIRY_KEYWORDS, normalize_embeddings=True, batch_size=64)
    _inquiry_centroid = np.mean(inq_emb, axis=0)
    _inquiry_centroid /= np.linalg.norm(_inquiry_centroid)

    cas_emb = model.encode(CASUAL_KEYWORDS, normalize_embeddings=True, batch_size=64)
    _casual_centroid = np.mean(cas_emb, axis=0)
    _casual_centroid /= np.linalg.norm(_casual_centroid)

    console.print("[dim]  Router: centroids ready[/]")


COMPLAINT_FAST = [
    "khiếu nại", "phàn nàn", "bức xúc", "hoàn tiền",
    "bồi thường", "lừa đảo", "ăn cướp",
    "hỏng", "hư", "lỗi", "bể", "nát", "sai",
    "giao trễ", "giao sai", "mất hàng", "không nhận",
    "tính sai", "trừ tiền", "report", "kiện",
    "tệ hại", "rác", "thất vọng", "bực mình", "tức giận",
    # Action intent keywords — must route to COMPLAINT for action_executor
    "đổi địa chỉ", "thay đổi địa chỉ", "sửa địa chỉ", "địa chỉ giao hàng",
    "đặt nhầm địa chỉ", "nhầm địa chỉ", "sai địa chỉ",
    "địa chỉ mới", "giao đến địa chỉ", "giao tới địa chỉ", "cập nhật địa chỉ",
    "ship đến địa chỉ", "chuyển địa chỉ",
    "hủy đơn", "muốn hủy", "hủy hộ",
    "đổi trả hàng", "trả hàng",
    # Check order status — must route COMPLAINT for action_executor
    "kiểm tra đơn", "tra cứu đơn", "tình trạng đơn", "đơn đâu",
    "trạng thái đơn hàng", "kiểm tra trạng thái đơn hàng",
    "xem trạng thái đơn hàng", "theo dõi trạng thái đơn hàng",
    "track đơn", "theo dõi đơn", "đơn đến đâu", "bao giờ giao",
    "chưa thấy giao", "chưa nhận được hàng", "hàng chưa đến",
    # Delivery failure keywords
    "giao thất bại", "giao không thành công", "không giao được", "giao hụt",
    "bưu cục", "lấy hàng tại bưu cục", "shipper không giao", "thất bại lần",
]

INQUIRY_FAST = [
    "cho tôi hỏi", "muốn hỏi", "muốn biết", "làm sao", "thế nào",
    "báo giá", "giá bao nhiêu", "có sẵn không",
    "hướng dẫn", "tư vấn", "chính sách", "quy định",
    "phí ship", "thanh toán", "trả góp",
    "ưu đãi", "giảm giá", "khuyến mãi", "phiếu giảm", "voucher",
    "tích điểm", "thành viên", "mypoints", "loyalty", "điểm", "coin", "coins", "hạng", "tier", "đổi điểm", "redeem",
    "thanh toán cod", "hỗ trợ thanh toán", "còn size", "size 39",
    "size 40", "bảng size", "bảo hành", "cod",
    "chính sách đổi trả", "có sẵn hàng", "còn hàng", "giao nhanh trong ngày",
    "giao trong ngày", "ship nhanh",
]

CASUAL_FAST = [
    "xin chào", "chào bạn", "hello", "cảm ơn",
    "bạn là ai", "bạn làm được gì", "tạm biệt", "bye",
    "bạn khỏe", "how are you", "hôm nay thế nào", "hôm nay sao",
]

INQUIRY_OVERRIDE_FAST = [
    "chính sách đổi trả", "có sẵn hàng", "còn hàng", "bảo hành",
    "khuyến mãi", "giao nhanh trong ngày", "giao trong ngày", "thanh toán cod",
    "đổi trả hàng", "đổi trả", "trả hàng", "return policy", "quy trình đổi trả",
    "đổi lại hàng", "điều kiện đổi trả", "được đổi trả",
]

CASUAL_OVERRIDE_FAST = [
    "hôm nay thế nào", "hôm nay sao",
]

CLARIFY_FAST = [
    "mình hỏi chút", "cái đó sao rồi", "xem giúp mình với",
    "xem giúp với", "mình muốn hỏi chút", "hỏi chút", "cho mình hỏi cái này",
]

SEMANTIC_FALLBACK_THRESHOLD = 0.25
INTENT_CONFIDENCE_THRESHOLDS = {
    "COMPLAINT": 0.46,
    "INQUIRY": 0.43,
    "CASUAL": 0.40,
}
INTENT_MARGIN_THRESHOLDS = {
    "COMPLAINT": 0.035,
    "INQUIRY": 0.030,
    "CASUAL": 0.025,
}


def _fast_classify(question):
    q = _normalize_text(question)

    # Pure identifiers or explicit phone/order/email inputs should never be casual.
    if extract_order_id(question) or extract_phone_number(question) or extract_email_address(question) or _looks_like_identifier_only(question):
        return "COMPLAINT"

    if _looks_like_noise(question):
        return "CLARIFY"

    for p in CASUAL_OVERRIDE_FAST:
        if _pattern_matches(q, p):
            return "CASUAL"

    for p in CLARIFY_FAST:
        if _pattern_matches(q, p):
            return "CLARIFY"

    for p in INQUIRY_OVERRIDE_FAST:
        if _pattern_matches(q, p):
            return "INQUIRY"

    # COMPLAINT first (bias an toàn cho CSKH)
    for p in COMPLAINT_FAST:
        if _pattern_matches(q, p):
            return "COMPLAINT"

    # Casual short (chỉ áp dụng khi câu rất ngắn — lời chào đơn thuần)
    if len(q) < 15:
        for p in CASUAL_SHORT_ONLY:
            if q.startswith(_normalize_text(p)) or q == _normalize_text(p):
                return "CASUAL"

    # Inquiry patterns — check TRƯỚC casual để tránh nuốt câu dài
    # VD: "xin chào, mình muốn hỏi về ưu đãi" phải là INQUIRY
    for p in INQUIRY_FAST:
        if _pattern_matches(q, p):
            return "INQUIRY"

    # Casual patterns (chỉ khi không khớp inquiry)
    for p in CASUAL_FAST:
        if _pattern_matches(q, p):
            return "CASUAL"

    return None


def _keyword_classify(question: str) -> str | None:
    q = _normalize_text(question)
    scores = {
        "COMPLAINT": sum(1 for keyword in COMPLAINT_KEYWORDS if _pattern_matches(q, keyword)),
        "INQUIRY": sum(1 for keyword in INQUIRY_KEYWORDS if _pattern_matches(q, keyword)),
        "CASUAL": sum(1 for keyword in CASUAL_KEYWORDS if _pattern_matches(q, keyword)),
    }
    best = max(scores, key=scores.get)
    return best if scores[best] > 0 else None


def _keyword_score(question: str, intent: str) -> int:
    q = _normalize_text(question)
    lookup = {
        "COMPLAINT": COMPLAINT_KEYWORDS,
        "INQUIRY": INQUIRY_KEYWORDS,
        "CASUAL": CASUAL_KEYWORDS,
    }
    return sum(1 for keyword in lookup.get(intent, []) if _pattern_matches(q, keyword))


def _intent_confidence(intent: str, scores: dict[str, float], method: str, keyword_hits: int = 0) -> float:
    ordered = sorted(scores.values(), reverse=True)
    best = scores.get(intent, 0.0)
    second = ordered[1] if len(ordered) > 1 else 0.0
    spread = max(0.0, best - second)
    base = best * 0.68 + spread * 0.22 + min(keyword_hits, 3) * 0.04
    if method == "fast":
        base += 0.08
    if method == "keyword":
        base += 0.06
    return round(min(0.99, max(0.0, base)), 3)


def classify_with_metadata(question: str) -> dict:
    fast = _fast_classify(question)
    if fast == "CLARIFY":
        return {
            "intent": "COMPLAINT",
            "confidence": 0.24,
            "method": "clarify",
            "semantic_scores": {},
            "keyword_hits": 0,
            "fallback_used": True,
            "clarify_reason": "fast_clarify",
            "prompt_meta": prompt_meta("router"),
        }
    if fast:
        return {
            "intent": fast,
            "confidence": 0.96,
            "method": "fast",
            "semantic_scores": {},
            "keyword_hits": _keyword_score(question, fast),
            "fallback_used": False,
            "clarify_reason": "",
            "prompt_meta": prompt_meta("router"),
        }

    _ensure_centroids()
    q_emb = get_embed_cached(question)
    comp_sim = float(np.dot(q_emb, _complaint_centroid))
    inq_sim = float(np.dot(q_emb, _inquiry_centroid))
    cas_sim = float(np.dot(q_emb, _casual_centroid))
    COMPLAINT_BIAS = 0.01
    scores = {
        "COMPLAINT": comp_sim + COMPLAINT_BIAS,
        "INQUIRY": inq_sim,
        "CASUAL": cas_sim,
    }
    intent = max(scores, key=scores.get)
    top_score = scores[intent]
    ordered_scores = sorted(scores.values(), reverse=True)
    second_score = ordered_scores[1] if len(ordered_scores) > 1 else 0.0
    semantic_margin = round(max(0.0, top_score - second_score), 3)
    keyword_intent = None
    fallback_used = False
    method = "semantic"
    keyword_hits = _keyword_score(question, intent)

    if top_score < SEMANTIC_FALLBACK_THRESHOLD:
        keyword_intent = _keyword_classify(question)
        if keyword_intent:
            intent = keyword_intent
            method = "keyword"
            fallback_used = True
            keyword_hits = _keyword_score(question, intent)
            console.print(
                f"[dim]  Router: semantic low ({top_score:.3f}) -> keyword fallback -> {intent}[/]"
            )
        else:
            method = "clarify"
            fallback_used = True

    confidence = _intent_confidence(intent, scores, method, keyword_hits)
    clarify_reason = ""
    if method != "fast":
        low_confidence = confidence < INTENT_CONFIDENCE_THRESHOLDS[intent]
        low_margin = semantic_margin < INTENT_MARGIN_THRESHOLDS[intent]
        if (low_confidence or low_margin) and keyword_intent is None and method != "keyword":
            method = "clarify"
            fallback_used = True
            clarify_reason = "low_confidence" if low_confidence else "low_margin"
            confidence = min(confidence, 0.24)
    return {
        "intent": intent,
        "confidence": confidence,
        "method": method,
        "semantic_scores": {
            "COMPLAINT": round(comp_sim, 3),
            "INQUIRY": round(inq_sim, 3),
            "CASUAL": round(cas_sim, 3),
        },
        "keyword_hits": keyword_hits,
        "fallback_used": fallback_used,
        "clarify_reason": clarify_reason,
        "prompt_meta": prompt_meta("router"),
        "semantic_top_score": round(top_score, 3),
        "semantic_margin": semantic_margin,
        "keyword_intent": keyword_intent,
    }


def classify(question):
    """Phân loại intent: COMPLAINT / INQUIRY / CASUAL."""
    meta = classify_with_metadata(question)
    intent = meta["intent"]
    if meta["method"] == "fast":
        console.print(f"[dim]  Router: FAST -> {intent}[/]")
    else:
        semantic_scores = meta.get("semantic_scores") or {}
        console.print(
            f"[dim]  Router: comp={semantic_scores.get('COMPLAINT', 0):.3f} "
            f"inq={semantic_scores.get('INQUIRY', 0):.3f} "
            f"cas={semantic_scores.get('CASUAL', 0):.3f} -> {intent}[/]"
        )
    return intent
