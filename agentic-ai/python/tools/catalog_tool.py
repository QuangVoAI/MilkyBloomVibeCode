"""
Catalog Tool — Live product lookup for stock / price questions.
"""
from __future__ import annotations

import re
import sys
import unicodedata
from pathlib import Path

sys.path.append(str(Path(__file__).parent.parent))

try:
    from tools.shop_client import search_products, search_products_by_filters, get_product_detail, get_variant_detail
except Exception:
    search_products = None
    search_products_by_filters = None
    get_product_detail = None
    get_variant_detail = None


CATALOG_HINTS = [
    "tên sản phẩm",
    "mã sản phẩm",
    "ảnh hoặc link sản phẩm",
    "độ tuổi, chủ đề, hoặc món đồ chơi bạn đang tìm",
]

CATALOG_RECOMMENDATION_HINTS = [
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
]

CATALOG_FILLER_WORDS = [
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
    "món đồ",
    "món",
    "sản phẩm",
    "mặt hàng",
    "hàng",
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
]

STOCK_PATTERNS = [
    r"còn hàng",
    r"hết hàng",
    r"còn bao nhiêu",
    r"còn size",
    r"còn màu",
    r"stock",
    r"tồn kho",
    r"available",
]


def _normalize_text(value: str) -> str:
    text = unicodedata.normalize("NFD", value or "")
    text = "".join(ch for ch in text if unicodedata.category(ch) != "Mn")
    text = text.replace("Đ", "D").replace("đ", "d")
    return re.sub(r"\s+", " ", text).strip().lower()


def _clean_query(question: str) -> str:
    text = re.sub(r"\s+", " ", question or "").strip()
    text = re.sub(
        r"(còn hàng|hết hàng|còn bao nhiêu|còn size|còn màu|stock|tồn kho|available|đang có|có sẵn|không)",
        "",
        text,
        flags=re.IGNORECASE,
    )
    return text.strip(" ?!.,:-")


def _normalize_price_text(value: str) -> int | None:
    text = (value or "").lower().strip()
    if not text:
        return None

    multiplier = 1
    if any(token in text for token in ("triệu", "trieu", "m")) and not any(token in text for token in ("k", "nghìn", "ngan", "ngàn")):
        multiplier = 1_000_000
    elif any(token in text for token in ("nghìn", "ngan", "ngàn", "k")):
        multiplier = 1_000

    digits = re.sub(r"[^\d]", "", text)
    if not digits:
        return None
    try:
        return int(digits) * multiplier
    except ValueError:
        return None


def _extract_budget_limit(question: str) -> int | None:
    text = (question or "").lower()
    patterns = [
        r"(?:dưới|tối đa|không quá|<=?|less than|under)\s*([\d.,\s]+(?:k|nghìn|ngàn|ngàn|triệu|trieu|m|đ|d|vnđ|vnd)?)",
        r"(?:tầm|khoảng|about|around|within|budget)\s*([\d.,\s]+(?:k|nghìn|ngàn|triệu|trieu|m|đ|d|vnđ|vnd)?)",
    ]
    for pattern in patterns:
        match = re.search(pattern, text, flags=re.IGNORECASE)
        if match:
            limit = _normalize_price_text(match.group(1))
            if limit:
                return limit
    return None


def _strip_budget_and_filler_words(question: str) -> str:
    text = _clean_query(question).lower()
    text = re.sub(
        r"(?:dưới|tối đa|không quá|tầm|khoảng|about|around|within|budget)\s*[\d.,\s]+(?:k|nghìn|ngàn|triệu|trieu|m|đ|d|vnđ|vnd)?",
        " ",
        text,
        flags=re.IGNORECASE,
    )
    text = re.sub(r"[\d.,]+\s*(?:k|nghìn|ngàn|triệu|trieu|m|đ|d|vnđ|vnd)\b", " ", text, flags=re.IGNORECASE)
    for filler in sorted(CATALOG_FILLER_WORDS, key=len, reverse=True):
        text = re.sub(rf"(?i)\b{re.escape(filler)}\b", " ", text)
    text = re.sub(r"\s+", " ", text).strip(" ?!.,:-")
    return text


def _build_budget_catalog_message(products: list[dict], budget_limit: int | None, keyword: str = "") -> str:
    if not products:
        if budget_limit:
            if keyword:
                return f"Mình chưa thấy món nào trong tầm {_format_price(budget_limit)} khớp với '{keyword}'. Bạn cho mình thêm độ tuổi, chủ đề hoặc mục đích dùng nhé."
            return f"Mình chưa thấy món nào trong tầm {_format_price(budget_limit)}. Bạn cho mình thêm độ tuổi, chủ đề hoặc mục đích dùng nhé."
        return "Mình chưa tìm được món phù hợp. Bạn cho mình thêm độ tuổi, chủ đề hoặc mục đích dùng nhé."

    lines = []
    for product in products[:3]:
        name = product.get("name") or "Sản phẩm"
        price = product.get("minPrice") or product.get("price")
        max_price = product.get("maxPrice")
        if max_price and max_price != product.get("minPrice"):
            price_text = f"{_format_price(price)} - {_format_price(max_price)}"
        else:
            price_text = _format_price(price)
        lines.append(f"• {name} - {price_text}")

    prefix = "Mình gợi ý vài món"
    if budget_limit:
        prefix = f"Mình gợi ý vài món trong tầm {_format_price(budget_limit)}"
    if keyword:
        prefix += f" cho '{keyword}'"
    return prefix + ":\n" + "\n".join(lines)


def _build_nearby_budget_message(products: list[dict], budget_limit: int | None, keyword: str = "") -> str:
    if not products:
        return _build_budget_catalog_message([], budget_limit, keyword=keyword)

    label = "Mình chưa thấy món nào đúng tầm"
    if budget_limit:
        label += f" {_format_price(budget_limit)}"
    else:
        label += " ngân sách này"
    if keyword:
        label += f" cho '{keyword}'"

    lines = []
    for product in products[:3]:
        name = product.get("name") or "Sản phẩm"
        min_price, max_price = _product_price_bounds(product)
        if min_price is not None and max_price is not None and max_price != min_price:
            price_text = f"{_format_price(min_price)} - {_format_price(max_price)}"
        elif min_price is not None:
            price_text = _format_price(min_price)
        else:
            price_text = _format_price(product.get("price"))
        lines.append(f"• {name} - {price_text}")

    return label + ", nhưng đây là vài món gần nhất:\n" + "\n".join(lines)


def _format_variant(variant: dict) -> str:
    attrs = variant.get("attributes") or []
    attr_text = ""
    if isinstance(attrs, list):
        parts = []
        for attr in attrs:
            if isinstance(attr, dict):
                name = attr.get("name")
                value = attr.get("value")
                if name and value:
                    parts.append(f"{name}: {value}")
        attr_text = ", ".join(parts)

    stock = variant.get("stockQuantity")
    price = variant.get("price")
    pieces = []
    if attr_text:
        pieces.append(attr_text)
    if price is not None:
        pieces.append(f"giá {_format_price(price)}")
    if stock is not None:
        pieces.append(f"tồn {stock}")
    return " | ".join(pieces) or str(variant.get("sku") or variant.get("_id") or "variant")


def _normalize_products(payload: dict) -> list[dict]:
    if not payload:
        return []
    if isinstance(payload.get("data"), dict) and isinstance(payload["data"].get("products"), list):
        return payload["data"]["products"]
    if isinstance(payload.get("data"), list):
        return payload["data"]
    if isinstance(payload.get("products"), list):
        return payload["products"]
    return []


def _number_value(value) -> float | int | None:
    if value is None:
        return None
    if isinstance(value, dict) and "$numberDecimal" in value:
        value = value.get("$numberDecimal")
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return int(number) if number.is_integer() else number


def _product_price_bounds(product: dict) -> tuple[float | int | None, float | int | None]:
    min_candidates = [
        product.get("minPrice"),
        product.get("price"),
    ]
    max_candidates = [
        product.get("maxPrice"),
        product.get("price"),
        product.get("minPrice"),
    ]

    variants = product.get("variants") or []
    if isinstance(variants, list):
        for variant in variants:
            if not isinstance(variant, dict):
                continue
            min_candidates.extend([variant.get("salePrice"), variant.get("price")])
            max_candidates.extend([variant.get("salePrice"), variant.get("price")])

    min_price = None
    max_price = None
    for candidate in min_candidates:
        value = _number_value(candidate)
        if value is not None:
            min_price = value if min_price is None else min(min_price, value)
    for candidate in max_candidates:
        value = _number_value(candidate)
        if value is not None:
            max_price = value if max_price is None else max(max_price, value)

    if min_price is None and max_price is not None:
        min_price = max_price
    if max_price is None and min_price is not None:
        max_price = min_price
    return min_price, max_price


def _product_within_budget(product: dict, budget_limit: int | None) -> bool:
    if not budget_limit:
        return True

    min_price, _ = _product_price_bounds(product)
    if min_price is None:
        return False
    return min_price <= budget_limit


def _format_price(value) -> str:
    number = _number_value(value)
    if number is None:
        return "chưa rõ"
    return f"{int(number):,}đ".replace(",", ".")


def _local_match_products(products: list[dict], query: str, limit: int = 5) -> list[dict]:
    normalized_query = _normalize_text(query)
    tokens = [token for token in re.split(r"\W+", normalized_query) if len(token) >= 2]
    if not tokens:
        return products[:limit]

    exact_matches = []
    scored = []
    for product in products:
        if not isinstance(product, dict):
            continue
        normalized_name = _normalize_text(str(product.get("name") or ""))
        normalized_slug = _normalize_text(str(product.get("slug") or "")).replace("-", " ")
        if normalized_query and (
            normalized_query == normalized_name
            or normalized_query == normalized_slug
            or normalized_query in normalized_name
            or normalized_query in normalized_slug
        ):
            exact_matches.append(product)
            continue
        haystack = " ".join(
            str(part or "")
            for part in [
                product.get("name"),
                product.get("slug"),
                product.get("description"),
                " ".join(
                    cat.get("name", "")
                    for cat in product.get("categoryId", [])
                    if isinstance(cat, dict)
                ) if isinstance(product.get("categoryId"), list) else "",
            ]
        )
        normalized_haystack = _normalize_text(haystack)
        score = 0
        if normalized_query and normalized_query in normalized_haystack:
            score += 10
        score += sum(1 for token in tokens if token in normalized_haystack)
        if score:
            scored.append((score, product))

    if exact_matches:
        return exact_matches[:limit]

    scored.sort(key=lambda item: item[0], reverse=True)
    return [product for _, product in scored[:limit]]


def _fallback_catalog_search(query: str, ctx: dict, *, budget_limit: int | None = None, limit: int = 5) -> list[dict]:
    if not search_products_by_filters:
        return []
    remote = search_products_by_filters(
        ctx,
        max_price=budget_limit,
        limit=50,
        sort="price-asc" if budget_limit else None,
    )
    products = _normalize_products(remote)
    if not query:
        return products[:limit]
    return _local_match_products(products, query, limit=limit)


def _budget_fallback_catalog_search(
    query: str,
    ctx: dict,
    *,
    budget_limit: int | None = None,
    keyword: str = "",
    limit: int = 5,
) -> list[dict]:
    if not search_products_by_filters:
        return []

    remote = search_products_by_filters(
        ctx,
        limit=100,
        sort="price-asc" if budget_limit else None,
    )
    products = _normalize_products(remote)
    if budget_limit:
        products = [product for product in products if _product_within_budget(product, budget_limit)]

    if not products:
        return []

    candidate = (keyword or query or "").strip()
    if candidate:
        candidate_normalized = _normalize_text(candidate)
        if candidate_normalized and candidate_normalized not in {"món", "đồ", "quà", "sản phẩm"}:
            matched = _local_match_products(products, candidate, limit=limit)
            if matched:
                return matched

    return products[:limit]


def lookup_live_catalog(question: str, context: dict | None = None) -> dict:
    query = _clean_query(question)
    ctx = context or {}
    budget_limit = _extract_budget_limit(question)
    keyword = _strip_budget_and_filler_words(question)
    keyword = keyword if keyword and keyword.lower() != query.lower() else keyword
    keyword = keyword.strip()
    if keyword and len(keyword.split()) == 1 and keyword.lower() in {"món", "đồ", "quà", "sản phẩm"}:
        keyword = ""

    if not query:
        return {
            "found": False,
            "query": "",
            "summary": "Mình cần thêm tên hoặc mã sản phẩm để tra tồn kho nhé.",
            "lookup_hints": CATALOG_HINTS,
            "products": [],
            "suggested_actions": ["ask_clarify_product"],
        }

    if not search_products and not search_products_by_filters:
        return {
            "found": False,
            "query": query,
            "summary": "Backend catalog chưa sẵn sàng.",
            "lookup_hints": CATALOG_HINTS,
            "products": [],
            "suggested_actions": ["ask_clarify_product"],
        }

    remote = None
    if budget_limit and search_products_by_filters:
        remote = search_products_by_filters(
            ctx,
            keyword=keyword or None,
            max_price=budget_limit,
            limit=5,
            sort="price-asc",
        )
        products = _normalize_products(remote)
        if not products and keyword and keyword.lower() != query.lower():
            remote = search_products_by_filters(
                ctx,
                max_price=budget_limit,
                limit=5,
                sort="price-asc",
            )
            products = _normalize_products(remote)
    if (remote is None or not _normalize_products(remote)) and search_products:
        remote = search_products(keyword or query, ctx)
    products = _normalize_products(remote or {})
    if not products:
        products = _fallback_catalog_search(keyword or query, ctx, budget_limit=budget_limit)
    if not products and budget_limit:
        products = _budget_fallback_catalog_search(keyword or query, ctx, budget_limit=budget_limit, keyword=keyword)
    if not products and budget_limit and search_products_by_filters:
        remote = search_products_by_filters(
            ctx,
            limit=5,
            sort="price-asc",
        )
        products = _normalize_products(remote)
        if products:
            return {
                "found": True,
                "query": keyword or query,
                "summary": _build_nearby_budget_message(products, budget_limit, keyword=keyword),
                "lookup_hints": CATALOG_HINTS,
                "products": products,
                "suggested_actions": ["ask_clarify_product"],
            }
    if not products:
        return {
            "found": False,
            "query": keyword or query,
            "summary": _build_budget_catalog_message([], budget_limit, keyword=keyword),
            "lookup_hints": CATALOG_HINTS,
            "products": [],
            "suggested_actions": ["ask_clarify_product"],
        }

    if len(products) > 1:
        lines = []
        for product in products[:3]:
            stock_total = product.get("totalStock")
            if stock_total is None and isinstance(product.get("variants"), list):
                stock_total = sum(int(v.get("stockQuantity") or 0) for v in product["variants"] if isinstance(v, dict))
            price = product.get("minPrice") or product.get("price")
            max_price = product.get("maxPrice")
            if max_price and max_price != product.get("minPrice"):
                price_text = f"{_format_price(price)} - {_format_price(max_price)}"
            else:
                price_text = _format_price(price)
            line = f"• {product.get('name') or 'Sản phẩm'} - {price_text}"
            if stock_total is not None:
                line += f" - tồn kho {stock_total}"
            lines.append(line)
        return {
            "found": True,
            "query": keyword or query,
            "summary": _build_budget_catalog_message(products, budget_limit, keyword=keyword),
            "lookup_hints": CATALOG_HINTS,
            "products": products,
            "suggested_actions": ["ask_clarify_product"],
        }

    first = products[0]
    variants = first.get("variants") or []
    stock_total = first.get("totalStock")
    if stock_total is None and isinstance(variants, list):
        stock_total = sum(int(v.get("stockQuantity") or 0) for v in variants if isinstance(v, dict))

    variant_lines = []
    for variant in variants[:5]:
        if isinstance(variant, dict):
            variant_lines.append(_format_variant(variant))

    summary = (
        f"Mình tìm thấy **{first.get('name') or query}**.\n"
        f"- Giá: {_format_price(first.get('minPrice') or first.get('price'))}"
    )
    if first.get("maxPrice") and first.get("maxPrice") != first.get("minPrice"):
        summary += f" đến {_format_price(first.get('maxPrice'))}"
    if stock_total is not None:
        summary += f"\n- Tồn kho tổng: {stock_total}"
    if variant_lines:
        summary += "\n- Biến thể:\n  " + "\n  ".join(f"• {line}" for line in variant_lines)

    return {
        "found": True,
        "query": keyword or query,
        "summary": summary,
        "lookup_hints": CATALOG_HINTS,
        "products": products,
        "suggested_actions": ["show_product_detail"],
    }
