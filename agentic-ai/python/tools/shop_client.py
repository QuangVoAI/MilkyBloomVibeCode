"""
Shop API client for agentic-ai.

Uses the real MilkyBloom backend as the source of truth when available.
Falls back to the legacy mock data path when SHOP_API_BASE_URL is not set.
"""
from __future__ import annotations

import json
import os
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError


def _normalize_base_url(value: str) -> str:
    base = (value or "").strip().rstrip("/")
    if not base:
        return ""
    return base


def _get_base_url() -> str:
    return _normalize_base_url(
        os.getenv("SHOP_API_BASE_URL")
        or os.getenv("BACKEND_URL")
        or os.getenv("BACKEND_BASE_URL")
        or "http://127.0.0.1:6969/api"
    )


def _json_loads(raw: bytes) -> dict:
    if not raw:
        return {}
    return json.loads(raw.decode("utf-8"))


def _request_json(method: str, path: str, context: dict | None = None, data: dict | None = None, params: dict | None = None):
    base_url = _get_base_url()
    if not base_url:
        raise RuntimeError("SHOP_API_BASE_URL is not configured")

    query = urlencode({k: v for k, v in (params or {}).items() if v not in (None, "", [])})
    url = f"{base_url}{path}"
    if query:
        url = f"{url}?{query}"

    headers = {"Content-Type": "application/json"}
    auth_token = (context or {}).get("auth_token") or (context or {}).get("token")
    service_key = os.getenv("AI_INTERNAL_SERVICE_KEY", "")
    if auth_token:
        headers["Authorization"] = f"Bearer {auth_token}"
    elif service_key:
        headers["X-Internal-Service-Key"] = service_key

    payload = None if data is None else json.dumps(data).encode("utf-8")
    req = Request(url, data=payload, method=method.upper(), headers=headers)

    try:
        with urlopen(req, timeout=20) as resp:
            return _json_loads(resp.read())
    except HTTPError as err:
        body = err.read() if hasattr(err, "read") else b""
        try:
            parsed = _json_loads(body)
        except Exception:
            parsed = {"message": body.decode("utf-8", errors="ignore")}
        parsed.setdefault("status", err.code)
        return parsed
    except URLError as err:
        return {"success": False, "message": str(err)}


def search_products(query: str, context: dict | None = None) -> dict:
    ctx = context or {}
    return _request_json("GET", "/products", ctx, params={"keyword": query})


def search_products_by_filters(
    context: dict | None = None,
    *,
    keyword: str | None = None,
    min_price: float | int | None = None,
    max_price: float | int | None = None,
    page: int = 1,
    limit: int = 20,
    sort: str | None = None,
    category_id: str | None = None,
    min_rating: float | int | None = None,
    is_featured: bool | None = None,
) -> dict:
    ctx = context or {}
    params = {
        "page": page,
        "limit": limit,
        "sort": sort,
        "categoryId": category_id,
        "minPrice": min_price,
        "maxPrice": max_price,
        "minRating": min_rating,
        "isFeatured": "true" if is_featured else None if is_featured is None else "false",
    }
    if keyword:
        params["keyword"] = keyword
    return _request_json("GET", "/products", ctx, params=params)


def get_cart_by_user(user_id: str, context: dict | None = None) -> dict:
    return _request_json("GET", f"/carts/user/{user_id}", context or {})


def get_cart_by_session(session_id: str, context: dict | None = None) -> dict:
    return _request_json("GET", f"/carts/session/{session_id}", context or {})


def create_cart(payload: dict, context: dict | None = None) -> dict:
    return _request_json("POST", "/carts", context or {}, data=payload)


def add_item_to_cart(cart_id: str, variant_id: str, quantity: int = 1, context: dict | None = None) -> dict:
    return _request_json(
        "POST",
        f"/carts/{cart_id}/items",
        context or {},
        data={"variantId": variant_id, "quantity": max(1, int(quantity or 1))},
    )


def get_product_detail(product_id: str, context: dict | None = None) -> dict:
    ctx = context or {}
    return _request_json("GET", f"/products/{product_id}", ctx)


def get_product_by_slug(slug: str, context: dict | None = None) -> dict:
    ctx = context or {}
    return _request_json("GET", f"/products/slug/{slug}", ctx)


def get_variant_detail(variant_id: str, context: dict | None = None) -> dict:
    ctx = context or {}
    return _request_json("GET", f"/variants/{variant_id}", ctx)


def get_addresses_for_user(user_id: str, context: dict | None = None) -> dict:
    ctx = context or {}
    return _request_json("GET", f"/addresses/user/{user_id}", ctx)


def get_default_address(user_id: str, context: dict | None = None) -> dict:
    ctx = context or {}
    return _request_json("GET", f"/addresses/default/{user_id}", ctx)


def checkout_from_cart(payload: dict, context: dict | None = None) -> dict:
    ctx = context or {}
    return _request_json("POST", "/orders/checkout/cart", ctx, data=payload)


def guest_checkout_from_cart(payload: dict, context: dict | None = None) -> dict:
    ctx = context or {}
    return _request_json("POST", "/orders/checkout/cart/guest", ctx, data=payload)


def get_loyalty_config(context: dict | None = None) -> dict:
    ctx = context or {}
    return _request_json("GET", "/loyalty/config", ctx)


def get_my_loyalty(context: dict | None = None) -> dict:
    ctx = context or {}
    return _request_json("GET", "/loyalty/me", ctx)


def get_my_loyalty_points(limit: int = 50, context: dict | None = None) -> dict:
    ctx = context or {}
    return _request_json("GET", "/loyalty/points", ctx, params={"limit": limit})


def redeem_loyalty_coins(amount: int, context: dict | None = None) -> dict:
    ctx = context or {}
    return _request_json("POST", "/loyalty/redeem", ctx, data={"amount": amount})


def create_support_ticket(payload: dict, context: dict | None = None) -> dict:
    ctx = context or {}
    return _request_json("POST", "/support-tickets", ctx, data=payload)


def get_order_detail(order_id: str, context: dict | None = None) -> dict:
    """
    Try authenticated / guest order lookup against the real shop backend.
    """
    ctx = context or {}
    if ctx.get("auth_token"):
        return _request_json("GET", f"/orders/{order_id}", ctx)

    access_token = (
        ctx.get("access_token")
        or ctx.get("order_access_token")
        or ctx.get("orderAccessToken")
    )
    if access_token:
        return _request_json(
            "GET",
            f"/orders/{order_id}/guest",
            ctx,
            params={"accessToken": access_token},
        )

    return {
        "success": False,
        "message": "Order ownership is not verified. Please login or provide an order access token.",
        "ownership_verified": False,
    }


def search_orders_by_phone(phone: str, context: dict | None = None) -> dict:
    """
    Search guest/user orders by phone number against the real shop backend.
    """
    ctx = context or {}
    if not (ctx.get("internal_lookup") or ctx.get("allow_internal_lookup")):
        return {
            "success": False,
            "message": "Phone lookup is internal-only and requires explicit ownership verification.",
            "ownership_verified": False,
        }
    return _request_json("GET", "/orders/guest/search", ctx, params={"phone": phone})


def get_user(user_id: str, context: dict | None = None) -> dict:
    return _request_json("GET", f"/users/{user_id}", context or {})


def get_shipping_fee_by_user(user_id: str, context: dict | None = None, params: dict | None = None) -> dict:
    return _request_json("GET", f"/shipping/fee/{user_id}", context or {}, params=params)


def update_address(address_id: str, payload: dict, context: dict | None = None) -> dict:
    return _request_json("PUT", f"/addresses/{address_id}", context or {}, data=payload)


def cancel_order(order_id: str, context: dict | None = None) -> dict:
    return _request_json("PUT", f"/orders/{order_id}/cancel", context or {})
