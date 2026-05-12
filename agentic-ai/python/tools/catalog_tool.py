"""
Catalog Tool — Live product lookup for stock / price questions.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

sys.path.append(str(Path(__file__).parent.parent))

try:
    from tools.shop_client import search_products, get_product_detail, get_variant_detail
except Exception:
    search_products = None
    get_product_detail = None
    get_variant_detail = None


CATALOG_HINTS = [
    "tên sản phẩm",
    "mã sản phẩm",
    "ảnh hoặc link sản phẩm",
    "độ tuổi, chủ đề, hoặc món đồ chơi bạn đang tìm",
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


def _clean_query(question: str) -> str:
    text = re.sub(r"\s+", " ", question or "").strip()
    text = re.sub(
        r"(còn hàng|hết hàng|còn bao nhiêu|còn size|còn màu|stock|tồn kho|available|đang có|có sẵn|không)",
        "",
        text,
        flags=re.IGNORECASE,
    )
    return text.strip(" ?!.,:-")


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
        pieces.append(f"giá {price}")
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


def lookup_live_catalog(question: str, context: dict | None = None) -> dict:
    query = _clean_query(question)
    ctx = context or {}

    if not query:
        return {
            "found": False,
            "query": "",
            "summary": "Mình cần thêm tên hoặc mã sản phẩm để tra tồn kho nhé.",
            "lookup_hints": CATALOG_HINTS,
            "products": [],
            "suggested_actions": ["ask_clarify_product"],
        }

    if not search_products:
        return {
            "found": False,
            "query": query,
            "summary": "Backend catalog chưa sẵn sàng.",
            "lookup_hints": CATALOG_HINTS,
            "products": [],
            "suggested_actions": ["ask_clarify_product"],
        }

    remote = search_products(query, ctx)
    products = _normalize_products(remote)
    if not products:
        return {
            "found": False,
            "query": query,
            "summary": f"Mình chưa tìm thấy sản phẩm khớp với '{query}'.",
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
            lines.append(
                f"• {product.get('name') or 'Sản phẩm'}"
                + (f" - tồn kho {stock_total}" if stock_total is not None else "")
            )
        return {
            "found": True,
            "query": query,
            "summary": (
                f"Mình tìm thấy nhiều sản phẩm khớp với '{query}':\n"
                + "\n".join(lines)
                + "\nBạn cho mình thêm tên/chủ đề cụ thể hơn để mình tra đúng món nhé."
            ),
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
        f"- Giá: {first.get('minPrice') or first.get('price') or 'chưa rõ'}"
    )
    if first.get("maxPrice") and first.get("maxPrice") != first.get("minPrice"):
        summary += f" đến {first.get('maxPrice')}"
    if stock_total is not None:
        summary += f"\n- Tồn kho tổng: {stock_total}"
    if variant_lines:
        summary += "\n- Biến thể:\n  " + "\n  ".join(f"• {line}" for line in variant_lines)

    return {
        "found": True,
        "query": query,
        "summary": summary,
        "lookup_hints": CATALOG_HINTS,
        "products": products,
        "suggested_actions": ["show_product_detail"],
    }
