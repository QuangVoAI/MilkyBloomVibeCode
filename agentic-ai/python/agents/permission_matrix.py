"""
Permission matrix for EmpathAI.

Keep routing intent separate from access control:
- capability decides what the user is asking for
- permission decides what the current scope may do with it
"""
from __future__ import annotations

from typing import Any


CAPABILITY_MATRIX = {
    "guest": {
        "catalog": {
            "allowed": True,
            "mode": "public",
            "reason": "Guest can browse products and stock information.",
        },
        "inquiry": {
            "allowed": True,
            "mode": "public",
            "reason": "Guest can ask store and policy questions.",
        },
        "checkout": {
            "allowed": True,
            "mode": "public",
            "reason": "Guest can create a new order from cart or product flow.",
        },
        "order_management": {
            "allowed": True,
            "mode": "verification_required",
            "reason": "Guest can inquire about an existing order, but changes need verification.",
        },
        "loyalty": {
            "allowed": True,
            "mode": "public_summary_only",
            "reason": "Guest can see loyalty policy, but personal points require login.",
        },
        "support_ticket": {
            "allowed": True,
            "mode": "public",
            "reason": "Guest can create a support ticket.",
        },
        "clarify": {
            "allowed": True,
            "mode": "public",
            "reason": "Clarification is always allowed.",
        },
    },
    "logged_in": {
        "catalog": {"allowed": True, "mode": "public", "reason": "Logged-in users can browse products."},
        "inquiry": {"allowed": True, "mode": "public", "reason": "Logged-in users can ask policy questions."},
        "checkout": {"allowed": True, "mode": "public", "reason": "Logged-in users can checkout."},
        "order_management": {
            "allowed": True,
            "mode": "verified_account",
            "reason": "Logged-in users can manage their own orders after ownership checks.",
        },
        "loyalty": {
            "allowed": True,
            "mode": "personal_data",
            "reason": "Logged-in users can see and redeem their loyalty points.",
        },
        "support_ticket": {
            "allowed": True,
            "mode": "public",
            "reason": "Logged-in users can create support tickets.",
        },
        "clarify": {"allowed": True, "mode": "public", "reason": "Clarification is always allowed."},
    },
    "admin": {
        "*": {
            "allowed": True,
            "mode": "full_access",
            "reason": "Admin can access all capabilities.",
        }
    },
}


ACTION_MATRIX = {
    "guest": {
        "update_address": {
            "allowed": False,
            "reason": "Guest cannot change an existing order without authentication.",
        },
        "cancel_order": {
            "allowed": False,
            "reason": "Guest cannot cancel an existing order without authentication.",
        },
        "request_refund": {
            "allowed": False,
            "reason": "Guest cannot request a refund without verifying ownership.",
        },
        "process_return": {
            "allowed": False,
            "reason": "Guest cannot start a return without verifying ownership.",
        },
        "check_order_status": {
            "allowed": True,
            "requires_order_reference": True,
            "reason": "Guest can only check an order after providing an order reference or verification detail.",
        },
        "create_ticket": {
            "allowed": True,
            "reason": "Guest can always open a support ticket.",
        },
    },
    "logged_in": {
        "update_address": {
            "allowed": True,
            "requires_order_ownership": True,
            "reason": "Logged-in users can update their own order after ownership verification.",
        },
        "cancel_order": {
            "allowed": True,
            "requires_order_ownership": True,
            "reason": "Logged-in users can cancel their own order after ownership verification.",
        },
        "request_refund": {
            "allowed": True,
            "requires_order_ownership": True,
            "reason": "Logged-in users can request a refund after ownership verification.",
        },
        "process_return": {
            "allowed": True,
            "requires_order_ownership": True,
            "reason": "Logged-in users can request a return after ownership verification.",
        },
        "check_order_status": {
            "allowed": True,
            "requires_order_ownership": True,
            "reason": "Logged-in users can check their own order.",
        },
        "create_ticket": {
            "allowed": True,
            "reason": "Logged-in users can open a support ticket.",
        },
    },
    "admin": {
        "*": {
            "allowed": True,
            "reason": "Admin can execute every action.",
        }
    },
}


def build_auth_profile(shop_context: dict | None) -> dict[str, Any]:
    ctx = shop_context or {}
    user_id = str(ctx.get("user_id") or "").strip()
    role = str(ctx.get("role") or "").strip().lower()
    ownership_verified = bool(ctx.get("ownership_verified"))
    is_authenticated = bool(ctx.get("auth_token") or user_id or ownership_verified)
    if role == "admin":
        user_scope = "admin"
    elif is_authenticated:
        user_scope = "logged_in"
    else:
        user_scope = "guest"
    return {
        "user_id": user_id,
        "role": role,
        "user_scope": user_scope,
        "is_authenticated": is_authenticated,
        "ownership_verified": ownership_verified,
        "has_auth_token": bool(ctx.get("auth_token")),
    }


def get_capability_rule(scope: str, capability: str) -> dict[str, Any]:
    scope = (scope or "guest").strip().lower()
    if scope == "admin":
        return CAPABILITY_MATRIX["admin"]["*"]
    rules = CAPABILITY_MATRIX.get(scope) or CAPABILITY_MATRIX["guest"]
    return rules.get(capability) or {
        "allowed": False,
        "mode": "blocked",
        "reason": f"Capability '{capability}' is not configured for scope '{scope}'.",
    }


def authorize_capability(capability: str, auth_profile: dict | None) -> dict[str, Any]:
    scope = (auth_profile or {}).get("user_scope", "guest")
    rule = get_capability_rule(scope, capability)
    return {
        "allowed": bool(rule.get("allowed")),
        "scope": scope,
        "mode": rule.get("mode", "blocked"),
        "reason": rule.get("reason", ""),
        "capability": capability,
    }


def authorize_action(action: str, auth_profile: dict | None, order_info: dict | None = None) -> dict[str, Any]:
    scope = (auth_profile or {}).get("user_scope", "guest")
    role = (auth_profile or {}).get("role", "")
    ownership_verified = bool((auth_profile or {}).get("ownership_verified"))
    order_info = order_info or {}
    rule = ACTION_MATRIX.get(scope) or ACTION_MATRIX["guest"]
    action_rule = rule.get(action) or {
        "allowed": False,
        "reason": f"Action '{action}' is not configured for scope '{scope}'.",
    }

    if scope == "admin":
        return {
            "allowed": True,
            "reason": action_rule.get("reason", ""),
            "mode": "full_access",
            "scope": scope,
            "action": action,
        }

    allowed = bool(action_rule.get("allowed"))
    reason = action_rule.get("reason", "")
    requires_order_ownership = bool(action_rule.get("requires_order_ownership"))
    requires_order_reference = bool(action_rule.get("requires_order_reference"))

    if not allowed:
        return {
            "allowed": False,
            "reason": reason,
            "mode": "blocked",
            "scope": scope,
            "action": action,
        }

    if requires_order_reference and not order_info.get("found"):
        return {
            "allowed": False,
            "reason": "Mình cần mã đơn hoặc thông tin xác minh trước khi kiểm tra đơn này.",
            "mode": "needs_verification",
            "scope": scope,
            "action": action,
        }

    if requires_order_ownership and not (ownership_verified or role == "admin"):
        return {
            "allowed": False,
            "reason": "Mình cần xác minh đúng chủ đơn trước khi thực hiện thao tác này.",
            "mode": "needs_verification",
            "scope": scope,
            "action": action,
        }

    return {
        "allowed": True,
        "reason": reason,
        "mode": action_rule.get("mode", "allowed"),
        "scope": scope,
        "action": action,
    }


def summarize_permission_matrix() -> dict[str, Any]:
    return {
        "capabilities": CAPABILITY_MATRIX,
        "actions": ACTION_MATRIX,
    }
