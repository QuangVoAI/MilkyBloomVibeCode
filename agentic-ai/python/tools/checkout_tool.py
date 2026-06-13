"""
Checkout Tool — Trợ lý tạo đơn từ giỏ hàng cho cả user đã đăng nhập và guest.
"""
from __future__ import annotations

import re
import sys
import unicodedata
from pathlib import Path

sys.path.append(str(Path(__file__).parent.parent))

try:
    from tools.shop_client import (
        get_default_address,
        get_addresses_for_user,
        checkout_from_cart,
        guest_checkout_from_cart,
        get_cart_by_user,
        get_cart_by_session,
        create_cart,
        add_item_to_cart,
    )
    from tools.catalog_tool import lookup_live_catalog
except Exception:
    get_default_address = None
    get_addresses_for_user = None
    checkout_from_cart = None
    guest_checkout_from_cart = None
    get_cart_by_user = None
    get_cart_by_session = None
    create_cart = None
    add_item_to_cart = None
    lookup_live_catalog = None


CATALOG_RECOMMENDATION_HINTS = (
    "gợi ý",
    "đề xuất",
    "tư vấn",
    "chọn",
    "món đồ",
    "đồ chơi",
    "quà",
    "gift",
    "budget",
    "ngân sách",
)

CHECKOUT_INTENT_HINTS = (
    "mua",
    "lấy",
    "đặt hàng",
    "mua ngay",
    "checkout",
    "thanh toán",
    "chốt đơn",
    "tạo đơn",
    "xác nhận đơn",
    "tiến hành đặt hàng",
    "tiến hành thanh toán",
    "đặt hàng luôn",
    "tiếp tục đặt hàng",
    "xác nhận đặt hàng",
)

GENERIC_PURCHASE_TERMS = (
    "hàng",
    "món hàng",
    "món đồ",
    "sản phẩm",
    "mặt hàng",
    "đồ chơi",
    "quà",
    "item",
)

PURCHASE_PREFIXES = (
    "mua",
    "lấy",
    "đặt",
    "chốt",
    "thêm vào giỏ",
    "add to cart",
    "buy",
)


def _normalize_vi_text(text: str) -> str:
    normalized = unicodedata.normalize("NFD", text or "")
    normalized = "".join(ch for ch in normalized if unicodedata.category(ch) != "Mn")
    normalized = normalized.replace("Đ", "d").replace("đ", "d")
    normalized = normalized.replace("Ä", "d").replace("Ä‘", "d")
    return re.sub(r"\s+", " ", normalized).strip().lower()


def _detect_payment_method(question: str) -> str:
    text = (question or "").lower()
    if "momo" in text:
        return "momo"
    if "zalopay" in text or "zalo" in text:
        return "zalopay"
    if "vietqr" in text or "qr" in text:
        return "vietqr"
    if "cod" in text or "thanh toán khi nhận" in text:
        return "cashondelivery"
    return "cashondelivery"


def _pick_first_text(*values: object) -> str:
    for value in values:
        if value is None:
            continue
        text = str(value).strip()
        if text:
            return text
    return ""


def _extract_email(text: str) -> str:
    match = re.search(r'[\w.+-]+@[\w-]+(?:\.[\w-]+)+', text or "", re.IGNORECASE)
    return match.group(0).strip() if match else ""


def _extract_phone(text: str) -> str:
    patterns = [
        r'(?i)(?:sđt|sdt|phone|điện thoại|so dien thoai|số điện thoại)\s*[:：-]?\s*((?:\+?84|0)[\d\s().-]{8,20}\d)',
        r'(?<!\d)((?:\+?84|0)[\d\s().-]{8,20}\d)(?!\d)',
    ]

    for pattern in patterns:
        match = re.search(pattern, text or "")
        if match:
            raw = match.group(1)
            digits = re.sub(r"\D", "", raw)
            if digits.startswith("84") and len(digits) >= 11:
                digits = "0" + digits[2:]
            if len(digits) == 10 and digits.startswith("0"):
                return digits
    return ""


def _clean_phrase(value: str, cutoff_words: tuple[str, ...]) -> str:
    text = str(value or "").strip(" \t\r\n,.;:-")
    if not text:
        return ""
    parts = re.split(
        r"(?i)\b(?:"
        + "|".join(re.escape(word) for word in cutoff_words)
        + r")\b",
        text,
        maxsplit=1,
    )
    candidate = parts[0].strip(" \t\r\n,.;:-")
    return candidate


def _trim_followup_text(value: str) -> str:
    text = str(value or "").strip(" \t\r\n,.;:-")
    if not text:
        return ""
    parts = re.split(
        r"(?i)(?:[.!?]\s+|\s+(?:mình muốn|mình cần|cho mình|giúp mình|đặt hàng|xác nhận|thanh toán|checkout|tạo đơn)\b)",
        text,
        maxsplit=1,
    )
    return parts[0].strip(" \t\r\n,.;:-")


def _extract_guest_name(text: str) -> str:
    patterns = [
        r"(?i)(?:tên tôi là|mình tên là|mình tên|tôi tên|em tên|mình là|tôi là|em là|cho mình là|full name is|name is)\s*[:：-]?\s*([^\n\r,;|]+)",
        r"(?i)tên\s*[:：-]\s*([^\n\r,;|]+)",
        r"(?i)họ và tên\s*[:：-]\s*([^\n\r,;|]+)",
    ]

    for pattern in patterns:
        match = re.search(pattern, text or "")
        if match:
            candidate = _clean_phrase(
                match.group(1),
                ("email", "mail", "sđt", "sdt", "số điện thoại", "phone", "địa chỉ", "address", "giao", "ship"),
            )
            if candidate:
                return candidate
    return ""


def _extract_guest_address(text: str) -> str:
    cues = [
        r"(?i)(?:địa chỉ(?: nhận hàng)?|đ/c|address|ship(?:\s+về|\s+đến)?|giao(?:\s+hàng|\s+tới|\s+đến)?|nhận hàng(?:\s+tại)?|gửi tới|deliver to|ship to)\s*[:：-]?\s*([^\n\r]+)",
    ]
    for pattern in cues:
        match = re.search(pattern, text or "")
        if match:
            candidate = _clean_phrase(
                match.group(1),
                ("email", "mail", "sđt", "sdt", "số điện thoại", "phone", "tên", "name", "mã đơn", "order"),
            )
            candidate = _trim_followup_text(candidate)
            if candidate:
                return candidate

    lower = (text or "").lower()
    address_markers = ("đường", "phường", "quận", "tp", "tphcm", "hcm", "hà nội", "hn", "street", "ward", "district", "hẻm", "ngõ")
    if any(marker in lower for marker in address_markers) and re.search(r"\d", text or ""):
        sentence = re.split(r"[.!?\n\r]", text or "")[0]
        candidate = _clean_phrase(
            sentence,
            ("email", "mail", "sđt", "sdt", "số điện thoại", "phone", "tên", "name", "mã đơn", "order"),
        )
        candidate = _trim_followup_text(candidate)
        if candidate:
            return candidate
    return ""


def _extract_guest_info_from_text(text: str) -> dict:
    if not text:
        return {}
    info = {
        "fullName": _extract_guest_name(text),
        "email": _extract_email(text),
        "phone": _extract_phone(text),
        "addressLine": _extract_guest_address(text),
    }
    return {key: value for key, value in info.items() if value}


def _merge_guest_info(base: dict, update: dict) -> dict:
    merged = dict(base or {})
    for key, value in (update or {}).items():
        if value and not str(merged.get(key) or "").strip():
            merged[key] = value
    return merged


def _extract_purchase_query(question: str) -> str:
    text = re.sub(r"\s+", " ", question or "").strip(" ?!.,:-")
    if not text:
        return ""
    lowered = text.lower()
    for prefix in sorted(PURCHASE_PREFIXES, key=len, reverse=True):
        if lowered.startswith(prefix):
            candidate = text[len(prefix):].strip(" ?!.,:-")
            candidate = re.sub(
                r"(?i)\b(?:giúp mình|giúp tôi|cho mình|cho tôi|nhé|nha|với|đi|số lượng|quantity)\b.*$",
                "",
                candidate,
            ).strip(" ?!.,:-")
            return candidate
    match = re.search(
        r"(?i)\b(?:mua|lấy|đặt|chốt|buy)\b\s+(.+)$",
        text,
    )
    if match:
        candidate = re.sub(
            r"(?i)\b(?:giúp mình|giúp tôi|cho mình|cho tôi|nhé|nha|với|đi|số lượng|quantity)\b.*$",
            "",
            match.group(1),
        ).strip(" ?!.,:-")
        return candidate
    return ""


def _extract_quantity(question: str) -> int:
    match = re.search(
        r"(?i)(?:\b(?:x|sl|số lượng|quantity)\s*[:：-]?\s*(\d{1,2})\b|\b(\d{1,2})\s*(?:cái|món|sản phẩm|sp|item)\b)",
        question or "",
    )
    if not match:
        return 1
    try:
        return max(1, min(20, int(match.group(1) or match.group(2))))
    except ValueError:
        return 1


def _find_available_variant(product: dict) -> dict:
    variants = product.get("variants") or []
    for variant in variants:
        if not isinstance(variant, dict):
            continue
        stock = int(variant.get("stockQuantity") or 0)
        variant_id = variant.get("_id") or variant.get("id")
        if stock > 0 and variant_id:
            return variant
    return {}


def _ensure_cart(ctx: dict, guest_session_id: str, user_id: str) -> dict:
    if user_id and get_cart_by_user:
        cart = get_cart_by_user(user_id, ctx)
        if cart and not cart.get("status"):
            return cart
    if guest_session_id and get_cart_by_session:
        cart = get_cart_by_session(guest_session_id, ctx)
        if cart and not cart.get("status"):
            return cart

    if not create_cart:
        return {}
    payload = {"userId": user_id} if user_id else {"sessionId": guest_session_id}
    created = create_cart(payload, ctx)
    return created if isinstance(created, dict) else {}


def _add_requested_product_to_cart(question: str, ctx: dict, guest_session_id: str, user_id: str) -> dict:
    purchase_query = _extract_purchase_query(question)
    if not purchase_query or _is_generic_purchase_query(purchase_query):
        return {}
    if not lookup_live_catalog or not add_item_to_cart:
        return {
            "ok": False,
            "message": "Mình nhận ra bạn muốn mua sản phẩm, nhưng công cụ giỏ hàng chưa sẵn sàng.",
        }
    if not (user_id or guest_session_id):
        return {
            "ok": False,
            "needs_guest_session": True,
            "message": "Mình cần phiên giỏ hàng từ trình duyệt để thêm sản phẩm cho bạn.",
        }

    catalog = lookup_live_catalog(purchase_query, ctx)
    products = catalog.get("products") or []
    if not products:
        return {
            "ok": False,
            "message": catalog.get("summary") or "Mình chưa tìm thấy sản phẩm bạn muốn mua.",
        }

    product = products[0] if isinstance(products[0], dict) else {}
    variant = _find_available_variant(product)
    if not variant:
        return {
            "ok": False,
            "message": f"Mình tìm thấy {product.get('name') or 'sản phẩm này'} nhưng hiện chưa thấy biến thể còn hàng để thêm vào giỏ.",
        }

    cart = _ensure_cart(ctx, guest_session_id, user_id)
    cart_id = cart.get("_id") or cart.get("id")
    if not cart_id:
        return {
            "ok": False,
            "message": "Mình chưa tạo hoặc lấy được giỏ hàng để thêm sản phẩm.",
        }

    quantity = _extract_quantity(question)
    added = add_item_to_cart(cart_id, variant.get("_id") or variant.get("id"), quantity, ctx)
    if isinstance(added, dict) and added.get("success") is False:
        return {
            "ok": False,
            "message": added.get("message") or "Mình chưa thêm được sản phẩm vào giỏ.",
        }
    return {
        "ok": True,
        "cart_id": cart_id,
        "product_name": product.get("name") or purchase_query,
        "variant_id": variant.get("_id") or variant.get("id"),
        "quantity": quantity,
        "message": f"Mình đã thêm {quantity} x {product.get('name') or purchase_query} vào giỏ.",
    }


def _is_catalog_recommendation_request(text: str) -> bool:
    q = (text or "").lower()
    if not q:
        return False

    has_hint = any(keyword in q for keyword in CATALOG_RECOMMENDATION_HINTS)
    has_budget = bool(
        re.search(
            r"(?i)(?:dưới|tầm|khoảng|under|within|budget|ngân sách)\s*\d{1,6}\s*(?:k|nghìn|ngàn|ngan|đ|d|vnđ|vnd)?",
            q,
        )
        or re.search(r"(?i)\b\d{1,6}\s*(?:k|nghìn|ngàn|ngan|đ|d|vnđ|vnd)\b", q)
    )
    has_checkout_hint = any(keyword in q for keyword in CHECKOUT_INTENT_HINTS)

    return has_hint and has_budget and not has_checkout_hint


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
    has_generic_item = any(term in q for term in GENERIC_PURCHASE_TERMS)
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


def _has_budget_signal(text: str) -> bool:
    q = (text or "").lower()
    return bool(
        re.search(
            r"(?i)(?:dưới|tối đa|không quá|tầm|khoảng|under|within|budget|ngân sách)\s*[\d.,\s]{1,12}\s*(?:k|nghìn|ngàn|ngan|đ|d|vnđ|vnd)?",
            q,
        )
        or re.search(r"(?i)\b\d{1,6}\s*(?:k|nghìn|ngàn|ngan|đ|d|vnđ|vnd)\b", q)
    )


def _strip_budget_and_filler_words(question: str) -> str:
    text = re.sub(r"\s+", " ", (question or "").strip()).lower()
    text = re.sub(
        r"(?i)(?:dưới|tối đa|không quá|tầm|khoảng|about|around|within|budget|ngân sách)\s*[\d.,\s]+(?:k|nghìn|ngàn|triệu|trieu|m|đ|d|vnđ|vnd)?",
        " ",
        text,
    )
    text = re.sub(r"[\d.,]+\s*(?:k|nghìn|ngàn|triệu|trieu|m|đ|d|vnđ|vnd)\b", " ", text, flags=re.IGNORECASE)
    for filler in (
        "cho tôi",
        "cho mình",
        "mình",
        "tôi",
        "em",
        "anh",
        "chị",
        "bạn",
        "muốn mua",
        "cần mua",
        "mua",
        "lấy",
        "đặt",
        "gợi ý",
        "đề xuất",
        "tư vấn",
        "giúp",
        "giúp mình",
        "xin",
        "hãy",
        "hàng",
        "món",
        "sản phẩm",
        "mặt hàng",
        "item",
        "quà tặng",
        "nào",
        "phù hợp",
        "hợp",
        "thích hợp",
        "trong",
        "tầm",
        "khoảng",
        "dưới",
        "trên",
        "chừng",
        "từ",
        "với",
        "mức",
        "giá",
        "ngân sách",
        "budget",
        "tặng",
    ):
        text = re.sub(rf"(?i)\b{re.escape(filler)}\b", " ", text)
    return re.sub(r"\s+", " ", text).strip(" ?!.,:-")


def _is_generic_budget_purchase(question: str, purchase_query: str = "") -> bool:
    q = (question or "").lower()
    query = (purchase_query or "").lower()
    has_checkout_hint = any(keyword in q for keyword in CHECKOUT_INTENT_HINTS)
    has_generic_term = any(term in q or term in query for term in GENERIC_PURCHASE_TERMS)
    return has_checkout_hint and has_generic_term and _has_budget_signal(q)


def _looks_like_budget_catalog_request(question: str, purchase_query: str = "") -> bool:
    q = (question or "").lower()
    query = (purchase_query or "").lower()
    if not _has_budget_signal(q):
        return False
    if _is_catalog_recommendation_request(q):
        return True
    if _is_generic_purchase_query(query):
        return True

    stripped_question = _strip_budget_and_filler_words(q)
    if not stripped_question:
        return True
    if any(term in q or term in query for term in ("hàng", "món", "sản phẩm", "mặt hàng", "quà", "item")):
        return True
    if len(stripped_question.split()) <= 2:
        return True
    return False


def _is_generic_purchase_query(purchase_query: str) -> bool:
    query = (purchase_query or "").lower().strip(" ?!.,:-")
    if not query:
        return False
    normalized = re.sub(r"\s+", " ", query)
    generic_values = {
        "hàng",
        "hàng mới",
        "món",
        "món hàng",
        "món đồ",
        "sản phẩm",
        "sản phẩm mới",
        "mặt hàng",
        "đồ chơi",
        "quà",
        "item",
    }
    return normalized in generic_values


def _build_budget_purchase_selection(question: str, ctx: dict) -> dict:
    if not lookup_live_catalog:
        return {
            "ok": False,
            "needs_product_selection": True,
            "message": "Mình hiểu bạn muốn mua theo ngân sách, nhưng công cụ catalog chưa sẵn sàng để chọn món.",
        }

    catalog = lookup_live_catalog(question, ctx)
    summary = str(catalog.get("summary") or "").strip()
    if not summary:
        summary = "Mình chưa tìm được món phù hợp với ngân sách này."

    if catalog.get("products"):
        message = (
            f"{summary}\n"
            "Bạn chọn một món trong danh sách hoặc nhắn tên sản phẩm, mình sẽ thêm vào giỏ rồi mới xin thông tin giao hàng nhé."
        )
    else:
        message = (
            f"{summary}\n"
            "Bạn cho mình thêm độ tuổi, chủ đề hoặc kiểu quà muốn mua, mình lọc lại sát hơn nhé."
        )

    return {
        "ok": False,
        "needs_product_selection": True,
        "needs_guest_info": False,
        "needs_guest_session": False,
        "redirect_intent": "catalog",
        "catalog_info": catalog,
        "message": message,
    }


def _build_guest_info(question: str, history: list[dict] | None, shop_context: dict) -> dict:
    ctx = shop_context or {}
    nested = ctx.get("guest_info") or ctx.get("guestInfo") or {}
    if not isinstance(nested, dict):
        nested = {}

    info = {
        "fullName": _pick_first_text(
            nested.get("fullName"),
            nested.get("full_name"),
            ctx.get("guest_full_name"),
            ctx.get("full_name"),
            ctx.get("user_name"),
        ),
        "email": _pick_first_text(
            nested.get("email"),
            ctx.get("guest_email"),
            ctx.get("email"),
        ),
        "phone": _pick_first_text(
            nested.get("phone"),
            ctx.get("guest_phone"),
            ctx.get("phone"),
        ),
        "addressLine": _pick_first_text(
            nested.get("addressLine"),
            nested.get("address_line"),
            ctx.get("guest_address_line"),
            ctx.get("addressLine"),
        ),
        "lat": nested.get("lat", ctx.get("guest_lat")),
        "lng": nested.get("lng", ctx.get("guest_lng")),
    }

    texts = [question or ""]
    for msg in (history or [])[-6:]:
        if isinstance(msg, dict):
            texts.append(str(msg.get("content") or ""))

    for text in texts:
        info = _merge_guest_info(info, _extract_guest_info_from_text(text))

    # Strip empty optional geo fields so the backend payload stays clean.
    if info["lat"] in ("", None):
        info.pop("lat", None)
    if info["lng"] in ("", None):
        info.pop("lng", None)

    return info


def _missing_guest_fields(guest_info: dict) -> list[str]:
    required = ["fullName", "email", "phone", "addressLine"]
    missing = [field for field in required if not str(guest_info.get(field) or "").strip()]
    return missing


def _is_view_cart_request(question: str) -> bool:
    q = (question or "").lower()
    if "xem" in q and ("giỏ" in q or "cart" in q):
        return True
    if "giỏ hàng của tôi có gì" in q or "trong giỏ có gì" in q:
        return True
    return False


def start_checkout(question: str, history: list[dict] | None = None, shop_context: dict | None = None) -> dict:
    # Backward compatibility: start_checkout(question, shop_context)
    if shop_context is None and isinstance(history, dict):
        shop_context = history
        history = None

    ctx = shop_context or {}
    
    if _is_view_cart_request(question):
        return {
            "ok": False,
            "message": "Giỏ hàng của bạn đây nhé.",
            "cartView": True,
        }
    if _is_catalog_recommendation_request(question):
        return {
            "ok": False,
            "redirect_intent": "catalog",
            "needs_guest_info": False,
            "needs_guest_session": False,
            "needs_login": False,
            "message": (
                "Mình thấy bạn đang muốn gợi ý sản phẩm theo ngân sách, không phải tạo đơn. "
                "Bạn cho mình thêm mục đích dùng, độ tuổi hoặc sở thích, mình sẽ gợi ý món phù hợp dưới 300k nhé."
            ),
        }

    user_id = ctx.get("user_id") or ""
    auth_token = ctx.get("auth_token") or ctx.get("token") or ""
    guest_session_id = (
        ctx.get("guest_session_id")
        or ctx.get("guestSessionId")
        or ctx.get("session_id")
        or ctx.get("sessionId")
        or ""
    )
    payment_method = _detect_payment_method(question)
    purchase_query = _extract_purchase_query(question)
    require_login_for_checkout = str(
        ctx.get("require_login_for_checkout") or ""
    ).strip().lower() in ("1", "true", "yes", "on")
    if _is_catalog_advice_request(question):
        return _build_budget_purchase_selection(question, ctx)
    if _looks_like_budget_catalog_request(question, purchase_query):
        return _build_budget_purchase_selection(question, ctx)
    if _is_generic_budget_purchase(question, purchase_query):
        return _build_budget_purchase_selection(question, ctx)

    add_to_cart_result = _add_requested_product_to_cart(question, ctx, guest_session_id, user_id)
    if add_to_cart_result and not add_to_cart_result.get("ok"):
        return {
            **add_to_cart_result,
            "needs_login": False,
        }

    if require_login_for_checkout and not (auth_token and user_id):
        added_message = (
            add_to_cart_result.get("message", "").strip()
            if add_to_cart_result and add_to_cart_result.get("ok")
            else ""
        )
        return {
            "ok": False,
            "needs_login": True,
            "message": (
                (added_message + " " if added_message else "")
                + "Để tránh sai thông tin đơn hàng, bạn đăng nhập trước khi mình tạo đơn nhé. "
                "Sau khi đăng nhập, bạn có thể quay lại giỏ hàng hoặc nhắn mình tiếp để checkout."
            ),
            "add_to_cart_result": add_to_cart_result,
        }

    if auth_token and user_id:
        address = None
        if get_default_address:
            default_res = get_default_address(user_id, ctx)
            if default_res.get("success") and default_res.get("data"):
                address = default_res["data"]

        if not address and get_addresses_for_user:
            addresses_res = get_addresses_for_user(user_id, ctx)
            addresses = addresses_res.get("data") if addresses_res.get("success") else []
            if isinstance(addresses, list) and len(addresses) == 1:
                address = addresses[0]

        if not address:
            return {
                "ok": False,
                "needs_address": True,
                "message": (
                    (add_to_cart_result.get("message") + " " if add_to_cart_result.get("ok") else "")
                    +
                    "Mình cần bạn chọn một địa chỉ giao hàng đã lưu trước khi đặt đơn."
                ),
            }

        payload = {
            "addressId": address.get("_id") or address.get("id"),
            "paymentMethod": payment_method,
            "deliveryType": "standard",
        }

        if not checkout_from_cart:
            return {
                "ok": False,
                "message": "Backend checkout chưa sẵn sàng.",
                "needs_login": False,
            }

        result = checkout_from_cart(payload, ctx)
        return {
            "ok": bool(result.get("success")),
            "result": result,
            "address": address,
            "payment_method": payment_method,
            "message": result.get("message") or "Mình đã thử tạo đơn từ giỏ hàng.",
            "add_to_cart_result": add_to_cart_result,
            "needs_address": False,
            "needs_login": False,
        }

    guest_info = _build_guest_info(question, history, ctx)
    missing_fields = _missing_guest_fields(guest_info)

    if not guest_session_id:
        return {
            "ok": False,
            "needs_guest_session": True,
            "missing_fields": missing_fields,
            "message": "Mình có thể tạo đơn cho khách mà không cần đăng nhập, nhưng mình cần mã phiên giỏ hàng của khách từ cùng trình duyệt trước đã.",
        }

    if missing_fields:
        return {
            "ok": False,
            "needs_guest_info": True,
            "missing_fields": missing_fields,
            "guest_session_id": guest_session_id,
            "message": (
                (add_to_cart_result.get("message") + " " if add_to_cart_result.get("ok") else "")
                +
                "Mình có thể tạo đơn cho khách mà không cần đăng nhập. "
                "Bạn gửi giúp mình đủ họ tên, email, số điện thoại và địa chỉ nhận hàng nhé."
            ),
        }

    payload = {
        "sessionId": guest_session_id,
        "guestInfo": guest_info,
        "paymentMethod": payment_method,
        "deliveryType": "standard",
    }

    if not guest_checkout_from_cart:
        return {
            "ok": False,
            "message": "Backend guest checkout chưa sẵn sàng.",
            "needs_login": False,
        }

    result = guest_checkout_from_cart(payload, ctx)
    return {
        "ok": bool(result.get("success")),
        "result": result,
        "guest_info": guest_info,
        "payment_method": payment_method,
        "guest_session_id": guest_session_id,
        "message": result.get("message") or "Mình đã thử tạo đơn cho khách từ giỏ hàng.",
        "add_to_cart_result": add_to_cart_result,
        "needs_address": False,
        "needs_login": False,
        "needs_guest_info": False,
        "needs_guest_session": False,
    }
