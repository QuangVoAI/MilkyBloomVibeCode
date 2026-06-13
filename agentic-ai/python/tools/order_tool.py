"""
Order Tool — Công cụ tra cứu đơn hàng cho EmpathAI Agentic Pipeline.

Chức năng:
  - extract_order_id(text)       : Regex extract mã đơn từ tin nhắn khách
  - get_order_info(order_id)     : Lookup backend thật, trả về trạng thái đơn
  - determine_suggested_actions  : Đề xuất action hệ thống (manual_review, escalate...)
"""
import re
import sys
from pathlib import Path
from typing import Optional

sys.path.append(str(Path(__file__).parent.parent))

try:
    from tools.shop_client import get_order_detail
except Exception:
    get_order_detail = None

try:
    from tools.shop_client import search_orders_by_phone
except Exception:
    search_orders_by_phone = None

try:
    from tools.shop_client import search_orders_by_email
except Exception:
    search_orders_by_email = None


GUEST_ORDER_ACCESS_TOKEN_HINT = "mã truy cập đơn hàng"

ORDER_LOOKUP_HELP = {
    "login": "đăng nhập tài khoản",
    "otp": "xác minh OTP",
    "access_token": "cung cấp mã truy cập đơn hàng",
    "order_email": "cung cấp email đặt hàng",
    "phone": "cung cấp số điện thoại đặt hàng",
}


def _build_lookup_guidance(*, verified: bool = False, internal_lookup: bool = False) -> list[str]:
    """Return the safest lookup paths we can honestly suggest to the user."""
    hints = []
    if not verified:
        hints.append(ORDER_LOOKUP_HELP["login"])
        hints.append(ORDER_LOOKUP_HELP["otp"])
        hints.append(ORDER_LOOKUP_HELP["access_token"])
    hints.append(ORDER_LOOKUP_HELP["order_email"])
    if internal_lookup:
        hints.append(ORDER_LOOKUP_HELP["phone"])
    return list(dict.fromkeys(hints))


def _format_lookup_guidance(hints: list[str]) -> str:
    if not hints:
        return ""
    if len(hints) == 1:
        return hints[0]
    if len(hints) == 2:
        return f"{hints[0]} hoặc {hints[1]}"
    return ", ".join(hints[:-1]) + f", hoặc {hints[-1]}"


def extract_order_id(text: str) -> Optional[str]:
    """
    Regex extract mã đơn hàng từ tin nhắn của khách.

    Hỗ trợ các định dạng:
      - MK001, MK-001                  (MyKingdom format)
      - ORD001, ORD-001, ORD_001       (Generic format)
      - DH001, DH-001                  (Đơn hàng short)
      - mã đơn 12345, đơn hàng MK005  (Natural language)
      - #MK001, #12345
    """
    patterns = [
        r'\bMK[-_]?\d{3,8}\b',
        r'\bORD[-_]?\d{3,8}\b',
        r'\bDH[-_]?\d{3,8}\b',
        r'(?:mã\s+đơn|đơn\s+hàng|đơn\s+số|order\s+id|mã\s+order)\s*[:#]?\s*([a-f0-9]{24})\b',
        r'#([a-f0-9]{24})\b',
        r'(?:mã\s+đơn|đơn\s+hàng|đơn\s+số|order\s+id|mã\s+order)\s*[:#]?\s*([A-Z]{2,3}[-_]?\d{3,8})',
        r'#([A-Z]{2,3}[-_]?\d{3,8})',
        r'\b[a-f0-9]{24}\b',
        r'(?:mã\s+đơn|đơn\s+hàng|mã\s+order)\s*[:#]?\s*(\d{5,10})',
    ]

    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            raw = (match.group(1) if match.lastindex and match.lastindex >= 1 else match.group(0))
            compact = raw.replace("-", "").replace("_", "").strip()
            if re.fullmatch(r"[a-fA-F0-9]{24}", compact):
                order_id = compact.lower()
            else:
                order_id = compact.upper()
            return order_id

    return None


def extract_phone_number(text: str) -> Optional[str]:
    """
    Extract a Vietnamese phone number from free-form text.

    Supports:
      - 0906364541
      - +84 906 364 541
      - 84 906 364 541
    """
    normalized = re.sub(r"[^\d+]", "", text)

    patterns = [
        r'(?<!\d)(0\d{9})(?!\d)',
        r'(?<!\d)(84\d{9})(?!\d)',
        r'(?<!\d)(\+84\d{9})(?!\d)',
    ]

    for pattern in patterns:
        match = re.search(pattern, normalized)
        if match:
            raw = match.group(1)
            digits = re.sub(r"\D", "", raw)
            if digits.startswith("84") and len(digits) == 11:
                digits = "0" + digits[2:]
            if len(digits) == 10 and digits.startswith("0"):
                return digits

    return None


def extract_email_address(text: str) -> Optional[str]:
    """
    Extract a plain email address from free-form text.
    """
    match = re.search(r'[\w.+-]+@[\w-]+(?:\.[\w-]+)+', text or "", re.IGNORECASE)
    return match.group(0).strip().lower() if match else None


def _normalize_order_id_for_lookup(order_id: str) -> str:
    compact = str(order_id or "").strip()
    if re.fullmatch(r"[a-fA-F0-9]{24}", compact):
        return compact.lower()
    return compact.upper()


def _normalize_real_order(order: dict, order_id: str) -> dict:
    order_data = order.get("data") or order.get("order") or order
    if not order_data:
        return {"found": False, "order_id": order_id, "summary": "Không có dữ liệu đơn hàng thật."}

    address_obj = order_data.get("addressId") or order_data.get("shippingAddress") or {}
    address_line = (
        address_obj.get("addressLine")
        or address_obj.get("fullAddress")
        or address_obj.get("formattedAddress")
        or ""
    )
    items = order_data.get("items", [])
    items_str = ", ".join(
        f"{i.get('name') or i.get('productName') or 'Item'} (x{i.get('quantity', i.get('qty', 1))})"
        for i in items
    ) or "Không có item chi tiết"
    total_raw = order_data.get("totalAmount") or order_data.get("total") or 0
    try:
        if isinstance(total_raw, dict) and "$numberDecimal" in total_raw:
            total = int(float(str(total_raw["$numberDecimal"]).replace(",", "")))
        else:
            total = int(float(str(total_raw).replace(",", "")))
    except Exception:
        total = 0
    status = (order_data.get("status") or "unknown").lower()
    shipping_fee = order_data.get("shippingFee", 0)
    delivery_type = order_data.get("deliveryType", "standard")
    return_eligible = status == "delivered"
    
    display_id = f"#{order_id[-8:].upper()}" if len(order_id) == 24 else order_id

    summary = (
        f"Đơn **{display_id}** — {items_str} — {total:,}đ\n"
        f"Trạng thái: {status}\n"
        f"Phí ship: {shipping_fee}\n"
        f"Loại giao hàng: {delivery_type}\n"
        f"Địa chỉ: {address_line}"
    )
    return {
        "found": True,
        "ownership_verified": True,
        "order_id": order_id,
        "customer_name": order_data.get("customerName") or "",
        "status": status,
        "items": items,
        "total": total,
        "address": address_line,
        "note": order_data.get("note", ""),
        "raw": order_data,
        "summary": summary,
        "return_eligible": return_eligible,
        "delivered_hours_ago": order_data.get("delivered_hours_ago", 0),
        "suggested_actions": ["track_shipment"] if status == "shipping" else ["check_order_status"],
    }


def get_order_info(order_id: str, context: dict | None = None) -> dict:
    """
    Lookup đơn hàng theo mã, trả về thông tin đầy đủ + tính toán trạng thái.

    Return dict gồm:
      found: bool
      order_id: str
      status: str  (shipping / delivered / processing / cancelled)
      return_eligible: bool  (chỉ có nếu status=delivered)
      return_deadline_note: str
      summary: str  (tóm tắt ngắn gọn cho LLM)
      raw: dict  (toàn bộ dữ liệu gốc)
    """
    order_id = _normalize_order_id_for_lookup(order_id)

    ctx = context or {}
    verified = bool(
        ctx.get("auth_token")
        or ctx.get("access_token")
        or ctx.get("order_access_token")
        or ctx.get("orderAccessToken")
        or ctx.get("order_lookup_token")
        or ctx.get("orderLookupToken")
        or ctx.get("lookup_token")
        or ctx.get("lookupToken")
    )
    lookup_hints = _build_lookup_guidance(verified=verified, internal_lookup=bool(ctx.get("internal_lookup") or ctx.get("allow_internal_lookup")))
    if not verified:
        return {
            "found": False,
            "ownership_verified": False,
            "verification_required": True,
            "order_id": order_id,
            "summary": (
                f"Mình chưa thể tra cứu đơn **{order_id}** vì chưa xác minh chủ đơn.\n"
                f"Bạn giúp mình { _format_lookup_guidance(lookup_hints) } nhé."
            ),
            "lookup_hints": lookup_hints,
            "suggested_actions": ["request_access_token"],
        }

    if get_order_detail and (
        ctx.get("auth_token")
        or ctx.get("access_token")
        or ctx.get("order_access_token")
        or ctx.get("orderAccessToken")
        or ctx.get("order_lookup_token")
        or ctx.get("orderLookupToken")
        or ctx.get("lookup_token")
        or ctx.get("lookupToken")
    ):
        remote = get_order_detail(order_id, ctx)
        if remote and remote.get("success"):
            try:
                normalized = _normalize_real_order(remote, order_id)
                normalized["ownership_verified"] = True
                return normalized
            except Exception:
                pass
        if remote:
            remote_status = int(remote.get("status") or 0)
            if remote_status in (401, 403):
                return {
                    "found": False,
                    "ownership_verified": False,
                    "verification_required": True,
                    "order_id": order_id,
                    "summary": (
                        f"Mình tìm thấy yêu cầu tra cứu đơn **{order_id}** nhưng tài khoản hiện tại chưa được xác minh là chủ đơn.\n"
                        f"Bạn giúp mình { _format_lookup_guidance(_build_lookup_guidance(verified=False, internal_lookup=False)) } nhé."
                    ),
                    "lookup_hints": _build_lookup_guidance(verified=False, internal_lookup=False),
                    "suggested_actions": ["request_access_token"],
                }
            if remote_status == 404:
                return {
                    "found": False,
                    "ownership_verified": False,
                    "order_id": order_id,
                    "summary": (
                        f"Không tìm thấy đơn hàng với mã **{order_id}** trong hệ thống của tài khoản này.\n"
                        f"Nếu bạn là chủ đơn, hãy đăng nhập đúng tài khoản hoặc xác minh OTP rồi thử lại."
                    ),
                    "lookup_hints": _build_lookup_guidance(verified=False, internal_lookup=False),
                    "suggested_actions": ["ask_reconfirm_order_id"],
                }
            return {
                "found": False,
                "ownership_verified": False,
                "verification_required": True,
                "order_id": order_id,
                "summary": (
                    f"Mình chưa thể tra cứu đơn **{order_id}** lúc này vì backend chưa xác nhận quyền sở hữu.\n"
                    f"Bạn giúp mình { _format_lookup_guidance(_build_lookup_guidance(verified=False, internal_lookup=False)) } nhé."
                ),
                "lookup_hints": _build_lookup_guidance(verified=False, internal_lookup=False),
                "suggested_actions": ["request_access_token"],
            }

    return {
        "found": False,
        "ownership_verified": False,
        "verification_required": True,
        "order_id": order_id,
        "summary": (
            f"Mình chưa thể tra cứu đơn **{order_id}** vì chưa kết nối được backend đơn hàng thật.\n"
            f"Bạn giúp mình { _format_lookup_guidance(lookup_hints) } rồi thử lại nhé."
        ),
        "lookup_hints": lookup_hints,
        "suggested_actions": ["request_access_token"],
    }


def _normalize_order_detail(order: dict) -> dict:
    order_id = _normalize_order_id_for_lookup(order.get("order_id") or order.get("_id") or "")
    if not order_id:
        return {"found": False, "summary": "Không có mã đơn hàng hợp lệ."}

    address_obj = order.get("addressId") or {}
    address_line = (
        address_obj.get("addressLine")
        or address_obj.get("fullAddress")
        or address_obj.get("formattedAddress")
        or order.get("address", "")
        or ""
    )
    items = order.get("items", [])
    items_str = ", ".join(
        f"{i.get('productId', {}).get('name') or i.get('name') or 'Item'} (x{i.get('quantity', i.get('qty', 1))})"
        for i in items
    ) or "Không có item chi tiết"
    status = (order.get("status") or "unknown").lower()
    total_raw = order.get("totalAmount") or order.get("total") or 0
    try:
        if isinstance(total_raw, dict) and "$numberDecimal" in total_raw:
            total = int(float(str(total_raw["$numberDecimal"]).replace(",", "")))
        else:
            total = int(float(str(total_raw).replace(",", "")))
    except Exception:
        total = 0

    display_id = f"#{order_id[-8:].upper()}" if len(order_id) == 24 else order_id

    summary = (
        f"Đơn **{display_id}** — {items_str} — {total:,}đ\n"
        f"Trạng thái: {status}\n"
        f"Địa chỉ: {address_line}"
    )

    return {
        "found": True,
        "order_id": order_id,
        "customer_name": order.get("customerName") or order.get("userId", {}).get("fullName") or "",
        "status": status,
        "items": items,
        "total": total,
        "address": address_line,
        "note": order.get("note", ""),
        "raw": order,
        "summary": summary,
        "return_eligible": bool(order.get("return_eligible", False)),
        "delivered_hours_ago": order.get("delivered_hours_ago", 0),
        "suggested_actions": order.get("suggested_actions", []),
    }


def get_order_info_by_phone(phone: str, context: dict | None = None) -> dict:
    """
    Lookup orders by phone number. If one order is found, normalize it as a
    regular order_info payload. If multiple orders exist, return an ambiguous
    response so the assistant can ask for an order id.
    """
    ctx = context or {}
    normalized_phone = re.sub(r"\D", "", str(phone or ""))
    if not normalized_phone:
        return {
            "found": False,
            "ownership_verified": False,
            "summary": "Số điện thoại không hợp lệ.",
            "lookup_hints": _build_lookup_guidance(
                verified=False,
                internal_lookup=bool(ctx.get("internal_lookup") or ctx.get("allow_internal_lookup")),
            ),
            "suggested_actions": ["ask_reconfirm_order_id"],
        }

    if not (ctx.get("internal_lookup") or ctx.get("allow_internal_lookup")):
        lookup_hints = _build_lookup_guidance(verified=False, internal_lookup=False)
        return {
            "found": False,
            "ownership_verified": False,
            "verification_required": True,
            "matched_phone": normalized_phone,
            "summary": (
                f"Mình chưa thể tra cứu đơn theo số điện thoại **{normalized_phone}** vì đây là thao tác nội bộ.\n"
                f"Bạn giúp mình { _format_lookup_guidance(lookup_hints) } nhé."
            ),
            "lookup_hints": lookup_hints,
            "suggested_actions": ["request_access_token"],
        }

    if search_orders_by_phone:
        remote = search_orders_by_phone(normalized_phone, ctx)
        if remote and remote.get("success"):
            orders = remote.get("data") or []
            if len(orders) == 1:
                normalized = _normalize_order_detail(orders[0])
                normalized["ownership_verified"] = True
                return normalized
            if len(orders) > 1:
                latest = orders[0]
                order_lines = [
                    f"- {o.get('order_id', '')}: {o.get('status', 'unknown')}"
                    for o in orders[:5]
                ]
                return {
                    "found": False,
                    "ownership_verified": False,
                    "ambiguous": True,
                    "matched_phone": normalized_phone,
                    "summary": (
                        f"Mình tìm thấy {len(orders)} đơn gắn với số điện thoại **{normalized_phone}**.\n"
                        f"Bạn đăng nhập hoặc gửi {GUEST_ORDER_ACCESS_TOKEN_HINT} để mình đối chiếu tiếp nhé:\n" + "\n".join(order_lines)
                    ),
                    "lookup_hints": _build_lookup_guidance(verified=False, internal_lookup=True),
                    "suggested_actions": ["ask_reconfirm_order_id"],
                    "latest_order_id": latest.get("order_id", ""),
                }

        return {
            "found": False,
            "ownership_verified": False,
            "matched_phone": normalized_phone,
            "summary": (
                f"Mình chưa tìm thấy đơn hàng nào khớp với số điện thoại **{normalized_phone}**.\n"
                f"Bạn đăng nhập hoặc gửi {GUEST_ORDER_ACCESS_TOKEN_HINT} trong email xác nhận nhé."
            ),
            "lookup_hints": _build_lookup_guidance(verified=False, internal_lookup=True),
            "suggested_actions": ["ask_reconfirm_order_id"],
        }

    return {
        "found": False,
        "ownership_verified": False,
        "matched_phone": normalized_phone,
        "summary": "Mình chưa thể tra cứu theo số điện thoại vì client backend đơn hàng chưa sẵn sàng.",
        "lookup_hints": _build_lookup_guidance(verified=False, internal_lookup=True),
        "suggested_actions": ["ask_reconfirm_order_id"],
    }


def get_order_info_by_email(email: str, context: dict | None = None) -> dict:
    """
    Lookup orders by email address.

    This is primarily used for guest follow-up flows where the customer
    sends the order email in the next message and we need to resume the
    pending action.
    """
    ctx = context or {}
    normalized_email = str(email or "").strip().lower()
    if not normalized_email or "@" not in normalized_email:
        return {
            "found": False,
            "ownership_verified": False,
            "summary": "Email không hợp lệ.",
            "lookup_hints": _build_lookup_guidance(
                verified=False,
                internal_lookup=bool(ctx.get("internal_lookup") or ctx.get("allow_internal_lookup")),
            ),
            "suggested_actions": ["ask_reconfirm_order_id"],
        }

    if search_orders_by_email:
        remote = search_orders_by_email(normalized_email, ctx)
        if remote and remote.get("success"):
            orders = remote.get("data") or []
            if len(orders) == 1:
                normalized = _normalize_order_detail(orders[0])
                normalized["ownership_verified"] = True
                normalized["matched_email"] = normalized_email
                return normalized
            if len(orders) > 1:
                latest = orders[0]
                order_lines = [
                    f"- {o.get('order_id', '')}: {o.get('status', 'unknown')}"
                    for o in orders[:5]
                ]
                return {
                    "found": False,
                    "ownership_verified": False,
                    "ambiguous": True,
                    "matched_email": normalized_email,
                    "summary": (
                        f"Mình tìm thấy {len(orders)} đơn gắn với email **{normalized_email}**.\n"
                        f"Bạn gửi thêm mã đơn để mình đối chiếu tiếp nhé:\n" + "\n".join(order_lines)
                    ),
                    "lookup_hints": _build_lookup_guidance(verified=False, internal_lookup=True),
                    "suggested_actions": ["ask_reconfirm_order_id"],
                    "latest_order_id": latest.get("order_id", ""),
                }

    return {
        "found": False,
        "ownership_verified": False,
        "matched_email": normalized_email,
        "summary": "Mình chưa tìm thấy đơn hàng nào khớp với email này trên backend thật.",
        "lookup_hints": _build_lookup_guidance(verified=False, internal_lookup=True),
        "suggested_actions": ["ask_reconfirm_order_id"],
    }


def determine_suggested_actions(order_info: dict, sentiment: str) -> list[str]:
    """
    Tổng hợp suggested actions dựa trên trạng thái đơn + cảm xúc khách.

    Actions hệ thống có thể xuất ra:
      - manual_review          : Chuyển xử lý thủ công/nội bộ
      - escalate_to_supervisor : Leo thang lên supervisor
      - process_return         : Xử lý đổi trả
      - create_exchange_request: Tạo yêu cầu đổi hàng
      - cancel_order           : Hủy đơn
      - notify_carrier         : Thông báo cho vận chuyển
      - check_refund_status    : Kiểm tra trạng thái hoàn tiền
      - track_shipment         : Theo dõi vận đơn
      - ask_reconfirm_order_id : Hỏi lại mã đơn
    """
    actions = list(order_info.get("suggested_actions", []))

    if sentiment in ("toxic", "frustrated"):
        if "escalate_to_supervisor" not in actions:
            actions.append("escalate_to_supervisor")
        if "manual_review" not in actions:
            actions.append("manual_review")

    return list(dict.fromkeys(actions))
