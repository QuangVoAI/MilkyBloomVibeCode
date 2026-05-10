"""
Action Tool — Phát hiện intent hành động + Thực thi mock actions trên đơn hàng.

Các action hỗ trợ:
  update_address    : Cập nhật địa chỉ giao hàng
  cancel_order      : Hủy đơn (chỉ khi đang processing)
  request_refund    : Yêu cầu hoàn tiền
  process_return    : Đổi trả sản phẩm (trong 72h)
  create_ticket     : Tạo ticket hỗ trợ
  no_action         : Không cần thực thi gì (hỏi thăm, inquiry)

Luồng:
  detect_action_intent(question, order_info) → action_intent
  execute_action(action_intent, order_info)  → action_result
"""
import json
import re
import sys
import uuid
from datetime import datetime
from pathlib import Path
from typing import Optional

import numpy as np

sys.path.append(str(Path(__file__).parent.parent))

from agents.model_registry import get_embed_model, get_embed_cached
from utils.console import console

# Import cached order loader/saver from order_tool to avoid duplicate I/O
from tools.order_tool import _load_orders, _save_orders
try:
    from tools.shop_client import cancel_order as remote_cancel_order
    from tools.shop_client import update_address as remote_update_address
except Exception:
    remote_cancel_order = None
    remote_update_address = None


# ════════════════════════════════════════════════════════
# Semantic Action Intent Detection (embedding-based)
# ════════════════════════════════════════════════════════

ACTION_SEEDS = {
    "update_address": [
        # Đổi/sửa/cập nhật địa chỉ
        "đổi địa chỉ giao hàng", "thay đổi địa chỉ", "cập nhật địa chỉ",
        "sửa địa chỉ", "nhầm địa chỉ", "sai địa chỉ", "đặt nhầm địa chỉ",
        "chỉnh sửa nơi nhận hàng", "đổi chỗ nhận hàng", "đổi địa chỉ nhận",
        "giao đến địa chỉ khác", "chuyển hướng giao hàng", "nơi giao hàng cần thay",
        "nhà mình chuyển chỗ rồi", "wrong address", "change delivery address",
        "update shipping address", "địa chỉ mới", "địa chỉ đúng là",
        # Thêm: các cách nói khác
        "địa chỉ bị nhập sai", "tôi nhập nhầm", "giao về nhà mới", "ship đến chỗ khác",
        "đổi địa chỉ ship", "sửa lại địa chỉ", "địa chỉ nhận sai rồi", "chuyển sang địa chỉ",
        "nhà tôi dời rồi", "nhà mình dời rồi", "địa chỉ không đúng", "giao sai địa chỉ",
    ],
    "cancel_order": [
        "hủy đơn hàng", "hủy order", "cancel đơn", "không mua nữa",
        "muốn hủy đơn", "cho tôi hủy", "hủy giúp", "hủy luôn",
        "hủy đơn hàng này", "bỏ đơn hàng", "không đặt nữa", "stop order",
        # Thêm
        "không muốn mua nữa", "đừng giao nữa", "thôi không cần nữa", "bỏ đơn",
        "hủy giúp tôi", "cho hủy đơn này", "không nhận nữa", "đừng ship nữa",
        "thôi hủy đơn đi", "không đặt nữa rồi", "bỏ qua đơn này", "cancel order",
        "muốn cancel", "hủy mua", "thôi khỏi giao", "không cần hàng nữa",
    ],
    "request_refund": [
        "hoàn tiền", "yêu cầu refund", "trả lại tiền", "đòi tiền",
        "lấy tiền lại", "tiền đâu", "refund tiền", "xin hoàn tiền",
        "muốn lấy lại tiền", "trả tiền lại cho tôi", "đòi lại tiền đã thanh toán",
        "chưa nhận được tiền hoàn", "hoàn trả chi phí", "money back",
        # Thêm
        "muốn được hoàn tiền", "trả lại tiền mua hàng", "hoàn tiền cho đơn",
        "bao giờ hoàn tiền", "tiền về chưa", "chưa thấy tiền hoàn", "muốn lấy tiền về",
        "đã trả tiền rồi muốn hoàn", "refund cho tôi", "lấy lại tiền",
    ],
    "process_return": [
        "đổi trả hàng", "trả lại hàng", "return hàng", "đổi sản phẩm",
        "hàng lỗi đổi", "hàng hỏng đổi", "muốn đổi hàng", "muốn trả hàng",
        "đổi hàng mới", "trả lại đồ chơi", "sản phẩm bị lỗi cần đổi",
        "không ưng ý muốn trả", "exchange product", "return item",
        # Thêm
        "hàng bị lỗi", "hàng bị hư", "hàng bị vỡ", "hàng hỏng", "hàng không đúng",
        "nhận được hàng lỗi", "muốn đổi lại", "đồ chơi bị hỏng", "sản phẩm không như mô tả",
        "đổi hàng giúp", "trả lại đồ", "không dùng được cần đổi", "hàng giao sai",
        "giao thiếu hàng", "thiếu sản phẩm", "hàng không đủ", "mở hộp ra không có",
    ],
    "check_order_status": [
        "kiểm tra đơn hàng", "tình trạng đơn hàng", "đơn hàng đến đâu rồi",
        "theo dõi đơn hàng", "chưa thấy giao hàng", "chưa nhận được hàng",
        "hàng chưa đến", "bao giờ giao hàng", "track đơn", "đơn hàng đi đâu rồi",
        "đơn hàng của mình đến đâu", "kiểm tra trạng thái đơn", "check order",
        "mãi chưa thấy giao", "đơn hàng chưa giao",
        # Thêm
        "ship chưa", "giao chưa", "bao giờ giao", "còn bao lâu", "đơn lâu quá",
        "chưa thấy shipper", "tracking đơn hàng", "theo dõi vận chuyển", "hàng đang ở đâu",
        "mãi chưa giao", "vẫn chưa thấy hàng", "shipper đến chưa", "xem đơn hàng",
        "đơn đang xử lý không", "đơn bị lạc chưa", "có vấn đề gì với đơn không",
    ],
}

# Regex fallback patterns (used when semantic score is ambiguous 0.30–0.55)
UPDATE_ADDRESS_PATTERNS = [
    r"đặt nhầm địa chỉ", r"nhầm địa chỉ", r"sai địa chỉ",
    r"đổi địa chỉ", r"thay địa chỉ", r"sửa địa chỉ", r"cập nhật địa chỉ",
    r"địa chỉ mới", r"địa chỉ đúng là", r"giao đến địa chỉ khác",
    r"thay đổi địa chỉ", r"địa chỉ thành", r"đổi.*địa chỉ",
    r"wrong address", r"change address", r"update address",
    r"địa chỉ bị.*sai", r"nhập nhầm", r"giao về nhà mới", r"ship đến chỗ khác",
    r"địa chỉ không đúng", r"nhà.*dời rồi", r"chuyển.*địa chỉ",
]

CANCEL_PATTERNS = [
    r"hủy đơn", r"cancel đơn", r"hủy order", r"không mua nữa",
    r"hủy giúp", r"muốn hủy", r"cho tôi hủy", r"hủy luôn",
    r"không muốn mua nữa", r"đừng giao nữa", r"thôi không cần nữa", r"bỏ đơn",
    r"không nhận nữa", r"đừng ship nữa", r"thôi hủy", r"cancel order",
    r"muốn cancel", r"hủy mua", r"không cần hàng nữa", r"thôi khỏi giao",
]

REFUND_PATTERNS = [
    r"hoàn tiền", r"trả tiền", r"refund", r"hoàn lại tiền",
    r"đòi tiền", r"lấy tiền lại", r"tiền đâu",
    r"muốn lấy tiền về", r"bao giờ hoàn tiền", r"tiền về chưa",
    r"chưa thấy tiền hoàn", r"lấy lại tiền", r"money back",
]

RETURN_PATTERNS = [
    r"đổi trả", r"đổi hàng", r"trả hàng", r"đổi sản phẩm",
    r"hàng lỗi", r"hàng hỏng", r"return hàng", r"hàng bị vỡ",
    r"hàng bị hư", r"nhận hàng lỗi", r"hàng không đúng", r"giao sai hàng",
    r"giao thiếu", r"thiếu sản phẩm", r"mở hộp ra không có", r"hàng không đủ",
    r"sản phẩm không như mô tả", r"exchange", r"return item",
]

CHECK_ORDER_PATTERNS = [
    r"kiểm tra đơn", r"tình trạng đơn", r"đơn.*đến đâu", r"theo dõi.*đơn",
    r"chưa thấy giao", r"chưa nhận.*hàng", r"hàng chưa đến", r"bao giờ giao",
    r"track.*đơn", r"đơn.*đi đâu", r"ship chưa", r"giao chưa",
    r"còn bao lâu", r"đơn lâu quá", r"chưa thấy shipper", r"hàng đang ở đâu",
    r"mãi chưa giao", r"vẫn chưa.*hàng", r"xem.*đơn hàng", r"check.*order",
]

ADDRESS_EXTRACT_PATTERNS = [
    r"địa chỉ(?:\s+(?:đúng|mới))?\s+là\s+(.{10,100}?)(?:\.|$|\n)",
    r"địa chỉ(?:\s+(?:đúng|mới))?:\s*(.{10,100}?)(?:\.|$|\n)",
    r"giao\s+(?:đến|tới)\s+(?:địa chỉ\s+)?(.{10,100}?)(?:\.|,\s*bạn|$|\n)",
    r"(?:thành|sang)\s+(?:địa chỉ\s+)?(?:số\s+)?[\"']?(.{5,80}?)[\"']?\s*(?:nhé|nha|ạ|\.\s*$)",
    r"[\"\u2018\u201c]([\d][^\"\u2019\u201d\n]{4,80})[\"\u2019\u201d]",
    r"(?:số\s+nhà|đường\s+\w+|quận\s+\w+|phường\s+\w+)\s*.{5,80}",
]

_semantic_centroids: dict | None = None
_semantic_threshold_high = 0.55
_semantic_threshold_low = 0.30


def _ensure_action_centroids():
    """Precompute semantic centroids for all action types."""
    global _semantic_centroids
    if _semantic_centroids is not None:
        return

    model = get_embed_model()
    console.print("[dim]  ActionIntent: computing semantic centroids...[/]")

    _semantic_centroids = {}
    for action, seeds in ACTION_SEEDS.items():
        embs = model.encode(seeds, normalize_embeddings=True, batch_size=64)
        centroid = np.mean(embs, axis=0)
        centroid /= np.linalg.norm(centroid)
        _semantic_centroids[action] = centroid

    console.print("[dim]  ActionIntent: semantic centroids ready[/]")


def _classify_action_semantic(text: str) -> tuple[str, float]:
    """Classify action intent using embedding cosine similarity."""
    _ensure_action_centroids()

    q_emb = get_embed_cached(text)
    scores = {}
    for action, centroid in _semantic_centroids.items():
        scores[action] = float(np.dot(q_emb, centroid))

    best_action = max(scores, key=scores.get)
    best_score = scores[best_action]

    # Normalize to 0-1 range
    min_score = min(scores.values())
    max_score = max(scores.values())
    if max_score > min_score:
        confidence = (best_score - min_score) / (max_score - min_score)
    else:
        confidence = 0.5

    return best_action, round(confidence, 3)


def _match_any(text: str, patterns: list[str]) -> bool:
    t = text.lower()
    return any(re.search(p, t) for p in patterns)


def _extract_new_address(text: str) -> Optional[str]:
    """Trích xuất địa chỉ mới từ tin nhắn khách."""
    for pat in ADDRESS_EXTRACT_PATTERNS:
        m = re.search(pat, text, re.IGNORECASE)
        if m:
            addr = m.group(1).strip().strip("\"'\u2018\u2019\u201c\u201d").rstrip(".,")
            if len(addr) > 5:
                return addr
    return None


def _fallback_regex_detect(question: str) -> str:
    """Regex fallback when semantic score is ambiguous."""
    if _match_any(question, UPDATE_ADDRESS_PATTERNS):
        return "update_address"
    if _match_any(question, CANCEL_PATTERNS):
        return "cancel_order"
    if _match_any(question, REFUND_PATTERNS):
        return "request_refund"
    if _match_any(question, RETURN_PATTERNS):
        return "process_return"
    if _match_any(question, CHECK_ORDER_PATTERNS):
        return "check_order_status"
    return "no_action"


def detect_action_intent(question: str, order_info: dict) -> dict:
    """
    Phát hiện khách muốn thực hiện hành động gì.
    Ưu tiên semantic classification, fallback regex.
    """
    status = order_info.get("status", "") if order_info.get("found") else ""
    found = order_info.get("found", False)

    # ── Semantic classification ──
    semantic_action, score = _classify_action_semantic(question)

    if score >= _semantic_threshold_high:
        action = semantic_action
        console.print(f"[dim]  ActionIntent: semantic -> {action} (score={score})[/]")
    elif score >= _semantic_threshold_low:
        # Ambiguous: regex fallback
        regex_action = _fallback_regex_detect(question)
        if regex_action != "no_action":
            action = regex_action
            console.print(f"[dim]  ActionIntent: semantic ambiguous ({score}) -> regex fallback -> {action}[/]")
        else:
            action = semantic_action  # trust semantic even if weak
            console.print(f"[dim]  ActionIntent: semantic -> {action} (score={score}, no regex match)[/]")
    else:
        action = "no_action"
        console.print(f"[dim]  ActionIntent: no action detected (score={score})[/]")

    # ── Build result per action type ──
    if action == "update_address":
        new_addr = _extract_new_address(question)
        executable = found and status in ("processing", "shipping")
        block_reason = ""
        if not found:
            return {
                "action": "update_address",
                "new_address": new_addr,
                "executable": False,
                "needs_order_id": True,
                "needs_more_info": False,
                "block_reason": "",
            }
        elif status == "delivered":
            block_reason = "Đơn đã giao thành công, không thể thay đổi địa chỉ"
        elif status == "cancelled":
            block_reason = "Đơn đã hủy, không thể thay đổi địa chỉ"
        return {
            "action": "update_address",
            "new_address": new_addr,
            "executable": executable and new_addr is not None,
            "needs_order_id": False,
            "needs_more_info": new_addr is None,
            "block_reason": block_reason,
        }

    if action == "cancel_order":
        executable = found and status in ("processing",)
        block_reason = ""
        if not found:
            return {"action": "cancel_order", "executable": False, "needs_order_id": True, "block_reason": ""}
        elif status == "shipping":
            block_reason = "Đơn đang trên đường giao, không thể hủy — cần liên hệ vận chuyển"
        elif status == "delivered":
            block_reason = "Đơn đã giao rồi, không thể hủy — có thể yêu cầu đổi trả"
        elif status == "cancelled":
            block_reason = "Đơn đã hủy trước đó rồi"
        return {
            "action": "cancel_order",
            "executable": executable,
            "needs_order_id": False,
            "block_reason": block_reason,
        }

    if action == "request_refund":
        return_eligible = order_info.get("return_eligible", False) if found else False
        raw_data = order_info.get("raw", {})
        refund_status = raw_data.get("refund_status", "")
        refund_completed_at = raw_data.get("refund_completed_at", "")
        block_reason = ""
        if not found:
            return {"action": "request_refund", "executable": False, "needs_order_id": True, "block_reason": ""}
        elif refund_status == "completed":
            completed_note = f" vào {refund_completed_at}" if refund_completed_at else ""
            block_reason = f"Hoàn tiền đã hoàn tất{completed_note} — không cần tạo yêu cầu mới"
            executable = False
        elif refund_status == "processing":
            block_reason = "Yêu cầu hoàn tiền đã được tạo trước đó và đang xử lý — không cần tạo thêm"
            executable = False
        elif status == "shipping":
            block_reason = "Đơn đang giao, chờ nhận hàng rồi mới yêu cầu hoàn tiền được"
            executable = False
        elif status == "processing":
            block_reason = "Đơn đang xử lý, chờ giao hàng rồi mới yêu cầu hoàn tiền được"
            executable = False
        elif status == "delivered" and not return_eligible:
            block_reason = "Đã quá thời hạn đổi trả 72 giờ — không thể thực hiện hoàn tiền theo yêu cầu chủ quan"
            executable = False
        else:
            executable = found and (status == "delivered" or status == "cancelled")
        return {
            "action": "request_refund",
            "return_eligible": return_eligible,
            "executable": executable,
            "needs_order_id": False,
            "block_reason": block_reason,
        }

    if action == "process_return":
        return_eligible = order_info.get("return_eligible", False) if found else False
        executable = found and return_eligible
        block_reason = ""
        if not found:
            return {"action": "process_return", "executable": False, "needs_order_id": True, "block_reason": ""}
        elif not return_eligible and status == "delivered":
            hours = order_info.get("delivered_hours_ago", order_info.get("raw", {}).get("delivered_hours_ago", 0))
            block_reason = f"Đã quá {max(hours - 72, 0):.0f} giờ kể từ khi nhận hàng (giới hạn đổi trả 72 giờ)"
        elif status != "delivered":
            block_reason = f"Đơn chưa được giao (trạng thái: {status})"
        return {
            "action": "process_return",
            "return_eligible": return_eligible,
            "executable": executable,
            "needs_order_id": False,
            "block_reason": block_reason,
        }

    if action == "check_order_status":
        if not found:
            return {"action": "check_order_status", "executable": False, "needs_order_id": True, "block_reason": ""}
        return {"action": "check_order_status", "executable": True, "needs_order_id": False, "block_reason": ""}

    return {"action": "no_action", "executable": False, "block_reason": ""}


def resume_action_intent(question: str, order_info: dict, pending: dict) -> dict:
    """
    Resume a pending action intent when the customer provides missing info
    (order_id or address) in a subsequent turn.
    """
    action = pending.get("action", "no_action")
    status = order_info.get("status", "")
    found = order_info.get("found", False)

    if action == "update_address":
        new_addr = _extract_new_address(question)
        executable = found and status in ("processing", "shipping") and new_addr is not None
        block_reason = ""
        if found and status == "delivered":
            block_reason = "Đơn đã giao thành công, không thể thay đổi địa chỉ"
        elif found and status == "cancelled":
            block_reason = "Đơn đã hủy, không thể thay đổi địa chỉ"
        return {
            "action": "update_address",
            "new_address": new_addr,
            "executable": executable and not block_reason,
            "needs_order_id": False,
            "needs_more_info": new_addr is None,
            "block_reason": block_reason,
        }

    if action == "cancel_order":
        executable = found and status == "processing"
        block_reason = ""
        if found and status == "shipping":
            block_reason = "Đơn đang trên đường giao, không thể hủy — cần liên hệ vận chuyển"
        elif found and status == "delivered":
            block_reason = "Đơn đã giao rồi, không thể hủy — có thể yêu cầu đổi trả"
        elif found and status == "cancelled":
            block_reason = "Đơn đã hủy trước đó rồi"
        return {
            "action": "cancel_order",
            "executable": executable,
            "needs_order_id": False,
            "block_reason": block_reason,
        }

    if action == "request_refund":
        executable = found and status in ("delivered", "cancelled")
        block_reason = ""
        if found and status == "shipping":
            block_reason = "Đơn đang giao, chờ nhận hàng rồi mới yêu cầu hoàn tiền được"
        return {
            "action": "request_refund",
            "return_eligible": order_info.get("return_eligible", False),
            "executable": executable,
            "needs_order_id": False,
            "block_reason": block_reason,
        }

    if action == "process_return":
        return_eligible = order_info.get("return_eligible", False) if found else False
        executable = found and return_eligible
        block_reason = ""
        if found and not return_eligible and status == "delivered":
            hours = order_info.get("delivered_hours_ago", order_info.get("raw", {}).get("delivered_hours_ago", 0))
            block_reason = f"Đã quá {max(hours - 72, 0):.0f} giờ kể từ khi nhận hàng (giới hạn đổi trả 72 giờ)"
        elif found and status != "delivered":
            block_reason = f"Đơn chưa được giao (trạng thái: {status})"
        return {
            "action": "process_return",
            "return_eligible": return_eligible,
            "executable": executable,
            "needs_order_id": False,
            "block_reason": block_reason,
        }

    return detect_action_intent(question, order_info)


# ════════════════════════════════════════════════════════
# Mock Action Execution (ghi vào mock_orders.json)
# ════════════════════════════════════════════════════════

def execute_action(action_intent: dict, order_info: dict, context: dict | None = None) -> dict:
    """
    Thực thi hành động trên mock DB và trả về kết quả.

    Returns:
        {
          "success": bool,
          "action": str,
          "message": str,           # thông báo cho LLM biết để confirm với khách
          "ticket_id": str|None,    # nếu có tạo ticket
          "updated_fields": dict,   # trường nào đã thay đổi
        }
    """
    action = action_intent.get("action", "no_action")
    order_id = order_info.get("order_id", "")
    executable = action_intent.get("executable", False)
    block_reason = action_intent.get("block_reason", "")
    ctx = context or {}
    use_remote = bool(ctx.get("auth_token") or ctx.get("token") or ctx.get("email") or ctx.get("user_email"))

    if action == "no_action":
        return {"success": False, "action": action, "message": "", "ticket_id": None, "updated_fields": {}}

    if not executable:
        if action_intent.get("needs_order_id"):
            return {
                "success": False,
                "action": action,
                "message": "",
                "ticket_id": None,
                "updated_fields": {},
                "needs_order_id": True,
            }
        if action_intent.get("needs_more_info"):
            return {
                "success": False,
                "action": action,
                "message": "",
                "ticket_id": None,
                "updated_fields": {},
                "needs_more_info": True,
            }
        return {
            "success": False,
            "action": action,
            "message": block_reason,
            "ticket_id": None,
            "updated_fields": {},
            "blocked": True,
        }

    orders = _load_orders()
    if order_id not in orders:
        return {"success": False, "action": action, "message": f"Không tìm thấy {order_id} trong DB", "ticket_id": None, "updated_fields": {}}

    ticket_id = f"TK{uuid.uuid4().hex[:6].upper()}"
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M")

    # ── Update Address ──
    if action == "update_address":
        new_addr = action_intent.get("new_address", "")
        old_addr = orders[order_id].get("address", "")
        address_obj = order_info.get("raw", {}).get("addressId") or order_info.get("raw", {}).get("shippingAddress") or {}
        address_id = address_obj.get("_id") or address_obj.get("id") or order_info.get("raw", {}).get("addressId")
        if use_remote and remote_update_address and address_id:
            result = remote_update_address(str(address_id), {"addressLine": new_addr}, ctx)
            if result.get("success"):
                return {
                    "success": True,
                    "action": action,
                    "message": f"Đã cập nhật địa chỉ giao hàng thật cho đơn **{order_id}**.",
                    "ticket_id": result.get("data", {}).get("_id") or result.get("ticket_id"),
                    "updated_fields": {"address": new_addr, "old_address": old_addr},
                }
        orders[order_id]["address"] = new_addr
        orders[order_id]["address_updated_at"] = timestamp
        orders[order_id]["address_history"] = old_addr
        _save_orders(orders)
        return {
            "success": True,
            "action": action,
            "message": (
                f"Đã cập nhật địa chỉ giao hàng cho đơn **{order_id}**:\n"
                f"• Địa chỉ cũ: {old_addr}\n"
                f"• Địa chỉ mới: **{new_addr}**\n"
                f"• Thời gian cập nhật: {timestamp}\n"
                f"• Mã yêu cầu: {ticket_id}"
            ),
            "ticket_id": ticket_id,
            "updated_fields": {"address": new_addr, "old_address": old_addr},
        }

    # ── Cancel Order ──
    if action == "cancel_order":
        if use_remote and remote_cancel_order:
            result = remote_cancel_order(order_id, ctx)
            if result.get("success"):
                return {
                    "success": True,
                    "action": action,
                    "message": result.get("message") or f"Đã hủy đơn thật **{order_id}**.",
                    "ticket_id": result.get("ticket_id"),
                    "updated_fields": {"status": "cancelled"},
                }
        orders[order_id]["status"] = "cancelled"
        orders[order_id]["cancelled_reason"] = "Khách yêu cầu hủy qua AI CSKH"
        orders[order_id]["cancelled_at"] = timestamp
        orders[order_id]["refund_status"] = "processing"
        orders[order_id]["refund_days_remaining"] = 3
        _save_orders(orders)
        total = orders[order_id].get("total", 0)
        return {
            "success": True,
            "action": action,
            "message": (
                f"Đã hủy đơn **{order_id}** thành công.\n"
                f"• Hoàn tiền: **{total:,}đ** — dự kiến 3-5 ngày làm việc\n"
                f"• Mã yêu cầu: {ticket_id}"
            ),
            "ticket_id": ticket_id,
            "updated_fields": {"status": "cancelled"},
        }

    # ── Request Refund ──
    if action == "request_refund":
        # Guard: không overwrite nếu hoàn tiền đã hoàn tất
        if orders[order_id].get("refund_status") == "completed":
            return {
                "success": False,
                "action": action,
                "message": "Hoàn tiền cho đơn này đã hoàn tất trước đó",
                "ticket_id": None,
                "updated_fields": {},
                "blocked": True,
            }
        orders[order_id]["refund_requested"] = True
        orders[order_id]["refund_requested_at"] = timestamp
        orders[order_id]["refund_status"] = "processing"
        _save_orders(orders)
        total = orders[order_id].get("total", 0)
        return {
            "success": True,
            "action": action,
            "message": (
                f"Đã tạo yêu cầu hoàn tiền cho đơn **{order_id}**.\n"
                f"• Số tiền hoàn: **{total:,}đ**\n"
                f"• Thời gian xử lý: 3-5 ngày làm việc\n"
                f"• Mã ticket: {ticket_id}"
            ),
            "ticket_id": ticket_id,
            "updated_fields": {"refund_status": "processing"},
        }

    # ── Process Return ──
    if action == "process_return":
        orders[order_id]["return_requested"] = True
        orders[order_id]["return_requested_at"] = timestamp
        _save_orders(orders)
        return {
            "success": True,
            "action": action,
            "message": (
                f"Đã tạo yêu cầu đổi trả cho đơn **{order_id}**.\n"
                f"• Phương thức: Nhân viên sẽ liên hệ trong vòng 24h để thu hồi hàng\n"
                f"• Mã ticket: {ticket_id}"
            ),
            "ticket_id": ticket_id,
            "updated_fields": {"return_requested": True},
        }

    return {"success": False, "action": action, "message": "Action không được hỗ trợ", "ticket_id": None, "updated_fields": {}}
