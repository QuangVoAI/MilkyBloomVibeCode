"""Confidence Gating — Smart Re-asking (Level 4).

Only ask clarification when missing exactly one required piece, not generic "I don't understand".
"""
import sys
from pathlib import Path
sys.path.append(str(Path(__file__).parent.parent))

from utils.console import console


class ConfidenceGate:
    """Determine if we should proceed, ask clarifying question, or request more info."""

    CONFIDENCE_LEVELS = {
        "high": 0.70,      # Execute immediately
        "medium": 0.45,    # Ask 1 clarifying question
        "low": 0.20,       # Ask for specific missing data
    }

    @staticmethod
    async def decide(
        state: dict,
        action: str,
        confidence_score: float,
        missing_fields: dict
    ) -> dict:
        """
        Decide: proceed | ask_clarification | request_data

        Returns:
        {
            "decision": "proceed" | "clarify" | "request_data",
            "confidence": float,
            "message": str,  # Optional clarification/request message
            "required_field": str,  # For request_data
        }
        """

        if confidence_score >= ConfidenceGate.CONFIDENCE_LEVELS["high"]:
            return {
                "decision": "proceed",
                "confidence": confidence_score,
            }

        elif confidence_score >= ConfidenceGate.CONFIDENCE_LEVELS["medium"]:
            # Ask ONE clarifying question
            clarify_msg = await ConfidenceGate._generate_clarification(action, state)
            return {
                "decision": "clarify",
                "confidence": confidence_score,
                "message": clarify_msg
            }

        else:
            # Low confidence + missing required field
            if action == "check_order_status":
                return {
                    "decision": "request_data",
                    "confidence": confidence_score,
                    "message": "Để tra cứu đơn, em cần mã đơn hoặc số điện thoại đặt hàng của bạn",
                    "required_field": "order_id_or_phone"
                }

            elif action == "update_address":
                order_id = state.get("order_id")
                if not order_id:
                    return {
                        "decision": "request_data",
                        "confidence": confidence_score,
                        "message": "Để thay đổi địa chỉ, em cần biết bạn muốn thay đổi đơn nào",
                        "required_field": "order_id"
                    }
                elif not missing_fields.get("new_address"):
                    return {
                        "decision": "request_data",
                        "confidence": confidence_score,
                        "message": "Địa chỉ mới là gì nhỉ?",
                        "required_field": "new_address"
                    }

            elif action == "process_return":
                return {
                    "decision": "request_data",
                    "confidence": confidence_score,
                    "message": "Sản phẩm nào bạn muốn đổi trả nhỉ?",
                    "required_field": "product_id"
                }

            # Generic fallback
            return {
                "decision": "clarify",
                "confidence": confidence_score,
                "message": "Em không hiểu rõ bạn cần gì. Bạn có thể nói rõ hơn được không?"
            }

    @staticmethod
    async def _generate_clarification(action: str, state: dict) -> str:
        """Generate ONE focused clarifying question."""

        if action == "update_address":
            order_info = state.get("order_info", {})
            if order_info.get("found"):
                order_id = order_info.get("order_id", "đơn")
                return f"Bạn muốn thay đổi địa chỉ giao cho đơn {order_id} đúng không?"
            else:
                return "Bạn muốn thay đổi địa chỉ cho đơn nào vậy?"

        elif action == "process_return":
            return "Sản phẩm nào bạn muốn đổi trả nhỉ?"

        elif action == "cancel_order":
            order_info = state.get("order_info", {})
            if order_info.get("found"):
                order_id = order_info.get("order_id", "đơn")
                return f"Bạn muốn hủy đơn {order_id} đúng không?"
            else:
                return "Bạn muốn hủy đơn nào vậy?"

        elif action == "check_order_status":
            return "Bạn muốn kiểm tra trạng thái của đơn nào?"

        # Generic
        return "Bạn đang hỏi gì vậy? Có thể nói rõ hơn được không?"
