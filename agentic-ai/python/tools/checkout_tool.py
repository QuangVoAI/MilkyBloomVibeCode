"""
Checkout Tool — Trợ lý tạo đơn từ giỏ hàng cho người dùng đã đăng nhập.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

sys.path.append(str(Path(__file__).parent.parent))

try:
    from tools.shop_client import get_default_address, get_addresses_for_user, checkout_from_cart
except Exception:
    get_default_address = None
    get_addresses_for_user = None
    checkout_from_cart = None


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


def start_checkout(question: str, shop_context: dict | None = None) -> dict:
    ctx = shop_context or {}
    user_id = ctx.get("user_id") or ""
    auth_token = ctx.get("auth_token") or ctx.get("token") or ""
    if not auth_token:
        return {
            "ok": False,
            "needs_login": True,
            "message": "Mình cần bạn đăng nhập trước để tạo đơn từ giỏ hàng nhé.",
        }

    if not user_id:
        return {
            "ok": False,
            "needs_login": True,
            "message": "Mình chưa nhận diện được tài khoản đang đăng nhập.",
        }

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
            "message": "Mình cần bạn chọn một địa chỉ giao hàng đã lưu trước khi đặt đơn.",
        }

    payment_method = _detect_payment_method(question)
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
        "needs_address": False,
        "needs_login": False,
    }
