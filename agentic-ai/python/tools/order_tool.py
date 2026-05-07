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
except Exception:
    get_order_detail = None


_orders_cache: dict | None = None
_orders_mtime: float = 0.0


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
    if get_order_detail and (ctx.get("auth_token") or ctx.get("email") or ctx.get("user_email") or ctx.get("session_id") or ctx.get("sessionId")):
        remote = get_order_detail(order_id, ctx)
        if remote and remote.get("success"):
            try:
                return _normalize_real_order(remote, order_id)
            except Exception:
                pass

    orders = _load_orders()

    if order_id not in orders:
        return {
            "found": False,
            "order_id": order_id,
            "summary": f"Không tìm thấy đơn hàng với mã **{order_id}** trong hệ thống.",
            "suggested_actions": ["ask_reconfirm_order_id"],
        }

    raw = orders[order_id]
    result: dict = {
        "found": True,
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
