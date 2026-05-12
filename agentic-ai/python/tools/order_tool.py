"""
Order Tool — Công cụ tra cứu đơn hàng cho EmpathAI Agentic Pipeline.

Chức năng:
  - extract_order_id(text)       : Regex extract mã đơn từ tin nhắn khách
  - get_order_info(order_id)     : Lookup mock DB, tính toán trạng thái đổi trả
  - determine_suggested_actions  : Đề xuất action hệ thống (create_ticket, escalate...)
"""
import json
import re
import sys
from pathlib import Path
from typing import Optional

sys.path.append(str(Path(__file__).parent.parent))

ORDERS_DB_PATH = Path(__file__).parent.parent.parent / "data" / "mock_orders.json"
RETURN_WINDOW_HOURS = 72

try:
    from tools.shop_client import get_order_detail
    from tools.shop_client import search_orders_by_phone
except Exception:
    get_order_detail = None
    search_orders_by_phone = None


_orders_cache: dict | None = None
_orders_mtime: float = 0.0
GUEST_ORDER_ACCESS_TOKEN_HINT = "mã truy cập đơn hàng"

ORDER_LOOKUP_HELP = {
    "login": "đăng nhập tài khoản đã đặt đơn",
    "otp": "xác minh OTP của tài khoản chủ đơn",
    "access_token": "mã truy cập đơn hàng trong email xác nhận",
    "order_email": "email bạn dùng khi đặt hàng để mình giúp bạn tìm email xác nhận",
    "phone": "số điện thoại đặt hàng để bộ phận hỗ trợ nội bộ đối chiếu",
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


def _load_orders() -> dict:
    """Load mock order database from JSON file (cached in memory, reload on file change)."""
    global _orders_cache, _orders_mtime
    try:
        mtime = ORDERS_DB_PATH.stat().st_mtime
        if _orders_cache is not None and mtime == _orders_mtime:
            return _orders_cache
        with open(ORDERS_DB_PATH, "r", encoding="utf-8") as f:
            _orders_cache = json.load(f)
            _orders_mtime = mtime
            return _orders_cache
    except FileNotFoundError:
        return {}
    except json.JSONDecodeError:
        return {}


def _save_orders(orders: dict) -> None:
    """Save mock order database to JSON file and update in-memory cache."""
    global _orders_cache, _orders_mtime
    with open(ORDERS_DB_PATH, "w", encoding="utf-8") as f:
        json.dump(orders, f, ensure_ascii=False, indent=2)
    _orders_cache = orders
    try:
        _orders_mtime = ORDERS_DB_PATH.stat().st_mtime
    except FileNotFoundError:
        _orders_mtime = 0.0


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
        r'(?:mã\s+đơn|đơn\s+hàng|đơn\s+số|order\s+id|mã\s+order)\s*[:#]?\s*([A-Z]{2,3}[-_]?\d{3,8})',
        r'#([A-Z]{2,3}[-_]?\d{3,8})',
        r'(?:mã\s+đơn|đơn\s+hàng|mã\s+order)\s*[:#]?\s*(\d{5,10})',
    ]

    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            raw = (match.group(1) if match.lastindex and match.lastindex >= 1 else match.group(0))
            order_id = raw.upper().replace("-", "").replace("_", "").strip()
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
        total = int(float(str(total_raw).replace(",", "")))
    except Exception:
        total = 0
    status = (order_data.get("status") or "unknown").lower()
    shipping_fee = order_data.get("shippingFee", 0)
    delivery_type = order_data.get("deliveryType", "standard")
    return_eligible = status == "delivered"

    summary = (
        f"Đơn **{order_id}** — {items_str} — {total:,}đ\n"
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
    order_id = order_id.upper().strip()

    ctx = context or {}
    verified = bool(
        ctx.get("auth_token")
        or ctx.get("access_token")
        or ctx.get("order_access_token")
        or ctx.get("orderAccessToken")
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

    if get_order_detail and (ctx.get("auth_token") or ctx.get("access_token") or ctx.get("order_access_token") or ctx.get("orderAccessToken")):
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

    orders = _load_orders()

    if order_id not in orders:
        return {
            "found": False,
            "ownership_verified": False,
            "order_id": order_id,
            "summary": (
                f"Không tìm thấy đơn hàng với mã **{order_id}** trong hệ thống.\n"
                f"Bạn có thể thử { _format_lookup_guidance(lookup_hints) }."
            ),
            "lookup_hints": lookup_hints,
            "suggested_actions": ["ask_reconfirm_order_id"],
        }

    raw = orders[order_id]
    result: dict = {
        "found": True,
        "ownership_verified": True,
        "order_id": raw["order_id"],
        "customer_name": raw.get("customer_name", ""),
        "status": raw.get("status", "unknown"),
        "items": raw.get("items", []),
        "total": raw.get("total", 0),
        "address": raw.get("address", ""),
        "note": raw.get("note", ""),
        "raw": raw,
        "suggested_actions": [],
    }

    items_str = ", ".join(f"{i['name']} (x{i['qty']})" for i in result["items"])
    total_str = f"{result['total']:,}đ"

    status = result["status"]

    if status == "shipping":
        carrier = raw.get("carrier", "đơn vị vận chuyển")
        tracking = raw.get("tracking_code", "")
        delay_note = raw.get("delay_note", "")
        delay_text = f" ⚠️ {delay_note}" if delay_note else ""
        result["summary"] = (
            f"Đơn **{order_id}** — {items_str} — {total_str}\n"
            f"🚚 Đang vận chuyển qua {carrier} (mã vận đơn: {tracking}){delay_text}\n"
            f"📍 Giao đến: {result['address']}"
        )
        result["return_eligible"] = False
        if delay_note:
            result["suggested_actions"] = ["create_ticket", "notify_carrier"]
        else:
            result["suggested_actions"] = ["track_shipment"]

    elif status == "delivered":
        hours_ago = raw.get("delivered_hours_ago", 0)
        within_window = hours_ago <= RETURN_WINDOW_HOURS
        result["return_eligible"] = within_window
        result["delivered_hours_ago"] = hours_ago

        if within_window:
            hours_left = RETURN_WINDOW_HOURS - hours_ago
            deadline_note = f"✅ Còn **{hours_left} giờ** trong thời hạn đổi trả 72 giờ"
            result["suggested_actions"] = ["process_return", "create_exchange_ticket"]
        else:
            overage = hours_ago - RETURN_WINDOW_HOURS
            deadline_note = f"⛔ Đã quá thời hạn **{overage} giờ** so với cửa sổ đổi trả 72 giờ"
            result["suggested_actions"] = ["create_ticket", "escalate_to_supervisor"]

        result["return_deadline_note"] = deadline_note
        result["summary"] = (
            f"Đơn **{order_id}** — {items_str} — {total_str}\n"
            f"✅ Đã giao {hours_ago} giờ trước\n"
            f"{deadline_note}\n"
            f"📍 Địa chỉ: {result['address']}"
        )

    elif status == "processing":
        result["summary"] = (
            f"Đơn **{order_id}** — {items_str} — {total_str}\n"
            f"⏳ Đang xử lý / đóng gói, chưa bàn giao vận chuyển\n"
            f"📍 Giao đến: {result['address']}"
        )
        result["return_eligible"] = False
        result["suggested_actions"] = ["cancel_order"]

    elif status == "cancelled":
        refund_status = raw.get("refund_status", "processing")
        if refund_status == "completed":
            refund_completed_at = raw.get("refund_completed_at", "")
            refund_amount = raw.get("refund_amount", raw.get("total", 0))
            refund_line = (
                f"💳 Hoàn tiền: ✅ ĐÃ HOÀN TẤT — {refund_amount:,}đ"
                + (f" (ngày {refund_completed_at})" if refund_completed_at else "")
            )
        else:
            refund_days = raw.get("refund_days_remaining", 5)
            refund_line = f"💳 Hoàn tiền: đang xử lý — dự kiến {refund_days} ngày làm việc"
        result["summary"] = (
            f"Đơn **{order_id}** — {items_str} — {total_str}\n"
            f"❌ Đã hủy ({raw.get('cancelled_reason', '')})\n"
            f"{refund_line}"
        )
        result["return_eligible"] = False
        result["suggested_actions"] = ["check_refund_status"]

    else:
        result["summary"] = (
            f"Đơn **{order_id}** — {items_str} — {total_str}\n"
            f"Trạng thái: {status}"
        )

    return result


def _normalize_order_detail(order: dict) -> dict:
    order_id = str(order.get("order_id") or order.get("_id") or "").upper().strip()
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
        total = int(float(str(total_raw).replace(",", "")))
    except Exception:
        total = 0

    summary = (
        f"Đơn **{order_id}** — {items_str} — {total:,}đ\n"
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


def determine_suggested_actions(order_info: dict, sentiment: str) -> list[str]:
    """
    Tổng hợp suggested actions dựa trên trạng thái đơn + cảm xúc khách.

    Actions hệ thống có thể xuất ra:
      - create_ticket          : Tạo ticket hỗ trợ
      - escalate_to_supervisor : Leo thang lên supervisor
      - process_return         : Xử lý đổi trả
      - create_exchange_ticket : Tạo ticket đổi hàng
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
        if "create_ticket" not in actions:
            actions.append("create_ticket")

    return list(dict.fromkeys(actions))
