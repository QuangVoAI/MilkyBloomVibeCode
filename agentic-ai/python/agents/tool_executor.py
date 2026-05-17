"""Tool-First Executor — Execute tools before LLM generation (Level 3).

Prioritize tool execution over text generation. Only generate LLM responses when
tools return inconclusive results or need empathy wrapping.
"""
import sys
from pathlib import Path
sys.path.append(str(Path(__file__).parent.parent))

from utils.console import console


class ToolExecutor:
    """Execute tools with confidence gating & result formatting."""

    @staticmethod
    async def execute_and_format(
        action: str,
        state: dict,
        followup_type: str | None = None
    ) -> tuple[bool, dict, str]:
        """
        Execute tool and return (should_continue_to_llm, tool_result, formatted_message).

        Returns:
        - should_continue_to_llm: bool - whether to proceed to LLM generation
        - tool_result: dict - raw tool output
        - formatted_message: str - user-facing message from tool (may skip LLM if conclusive)
        """

        if action == "check_order_status":
            # Simple status check can skip LLM entirely
            order_info = state.get("order_info", {})
            if order_info.get("found"):
                formatted = _format_order_status_direct(order_info)
                return (False, order_info, formatted)  # Skip LLM
            else:
                # No order found → forward to LLM for empathy
                return (True, order_info, None)

        elif action == "update_address":
            action_result = state.get("action_result", {})
            if action_result.get("success"):
                # Action executed → brief confirmation
                formatted = f"✓ Đã cập nhật địa chỉ giao hàng. {action_result.get('message', '')}"
                return (False, action_result, formatted)
            elif action_result.get("needs_verification"):
                # Needs verification → LLM generates empathetic ask
                return (True, action_result, None)
            else:
                # Blocked or failed → forward to LLM for empathy
                return (True, action_result, None)

        elif action == "lookup_catalog":
            catalog_info = state.get("catalog_info", {})
            if not catalog_info.get("found"):
                # No products found → LLM can suggest alternatives
                return (True, catalog_info, None)
            else:
                # Products found → format catalog response WITHOUT LLM for speed
                formatted = _format_catalog_response(catalog_info, followup_type)
                return (False, catalog_info, formatted)

        elif action == "cancel_order":
            action_result = state.get("action_result", {})
            if action_result.get("success"):
                formatted = f"✓ Đơn đã được hủy. {action_result.get('message', '')}"
                return (False, action_result, formatted)
            else:
                return (True, action_result, None)

        elif action == "process_return":
            action_result = state.get("action_result", {})
            if action_result.get("success"):
                formatted = f"✓ Yêu cầu đổi trả đã được ghi nhận. {action_result.get('message', '')}"
                return (False, action_result, formatted)
            else:
                return (True, action_result, None)

        elif action == "request_refund":
            action_result = state.get("action_result", {})
            if action_result.get("success"):
                formatted = f"✓ Yêu cầu hoàn tiền đã được ghi nhận. {action_result.get('message', '')}"
                return (False, action_result, formatted)
            else:
                return (True, action_result, None)

        # Default: forward to LLM
        return (True, {}, None)


def _format_order_status_direct(order_info: dict) -> str:
    """Format order status without LLM."""
    if not order_info.get("found"):
        return "Không tìm thấy đơn hàng của bạn."

    summary = order_info.get("summary", "")
    if summary:
        return f"✓ {summary}"

    status = order_info.get("status", "unknown")
    status_map = {
        "delivered": "Đơn của bạn đã giao thành công",
        "shipping": "Đơn đang vận chuyển",
        "processing": "Đơn đang được xử lý",
        "pending": "Đơn chờ xác nhận",
        "cancelled": "Đơn đã bị hủy",
    }

    return f"✓ {status_map.get(status, f'Trạng thái: {status}')}"


def _format_catalog_response(catalog_info: dict, followup_type: str | None) -> str:
    """Format catalog response without LLM for speed."""
    products = catalog_info.get("products", [])

    if not products:
        return "Không tìm thấy sản phẩm nào."

    if followup_type == "follow_up_catalog":
        # User asked about size/color of specific product
        product_names = ", ".join(p.get("name", "sản phẩm") for p in products[:3])
        return f"✓ Còn {len(products)} tùy chọn khác: {product_names}"

    # Normal catalog search
    return _build_catalog_listing(products)


def _build_catalog_listing(products: list) -> str:
    """Build catalog listing without LLM."""
    if not products:
        return "Không tìm thấy sản phẩm nào."

    lines = ["✓ Tìm thấy những sản phẩm này:"]
    for i, p in enumerate(products[:5], 1):
        name = p.get("name", "Sản phẩm")
        price = p.get("price", 0)
        stock = p.get("stock", 0)
        stock_text = "Còn hàng" if stock > 0 else "Hết hàng"

        price_str = f"{price:,.0f} VND" if price > 1000 else f"{price} VND"
        lines.append(f"{i}. {name} - {price_str} ({stock_text})")

    if len(products) > 5:
        lines.append(f"... và {len(products) - 5} sản phẩm khác")

    return "\n".join(lines)
