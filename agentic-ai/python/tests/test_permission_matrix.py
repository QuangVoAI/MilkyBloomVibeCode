from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from agents.graph import _build_auth_profile, _infer_capability
from agents.permission_matrix import authorize_action, authorize_capability, summarize_permission_matrix


def test_permission_matrix_shapes():
    matrix = summarize_permission_matrix()
    assert "guest" in matrix["capabilities"]
    assert "logged_in" in matrix["capabilities"]
    assert "admin" in matrix["capabilities"]
    assert "support_ticket" in matrix["capabilities"]["guest"]
    assert "guest" in matrix["actions"]
    assert "logged_in" in matrix["actions"]
    assert "admin" in matrix["actions"]


def test_guest_scenarios():
    auth = _build_auth_profile({})

    capability, _ = _infer_capability("chính sách đổi trả của shop là gì?", [], "INQUIRY", auth)
    rule = authorize_capability(capability, auth)
    assert capability == "inquiry"
    assert rule["allowed"] is True

    capability, _ = _infer_capability("mình còn bao nhiêu điểm?", [], "INQUIRY", auth)
    rule = authorize_capability(capability, auth)
    assert capability == "loyalty"
    assert rule["allowed"] is True
    assert rule["mode"] == "public_summary_only"

    capability, _ = _infer_capability("đổi địa chỉ cho đơn MK012 giúp mình", [], "COMPLAINT", auth)
    rule = authorize_capability(capability, auth)
    assert capability == "order_management"
    assert rule["allowed"] is True
    assert rule["mode"] == "verification_required"

    action_rule = authorize_action("update_address", auth, {"found": True, "status": "processing"})
    assert action_rule["allowed"] is False

    capability, _ = _infer_capability("tạo ticket hỗ trợ giúp mình", [], "COMPLAINT", auth)
    rule = authorize_capability(capability, auth)
    assert capability == "inquiry"
    assert rule["allowed"] is True


def test_logged_in_scenarios():
    auth = _build_auth_profile({"user_id": "u_1", "auth_token": "token_123", "ownership_verified": True})

    capability, _ = _infer_capability("mình còn bao nhiêu điểm?", [], "INQUIRY", auth)
    rule = authorize_capability(capability, auth)
    assert capability == "loyalty"
    assert rule["allowed"] is True
    assert rule["mode"] == "personal_data"

    capability, _ = _infer_capability("đổi địa chỉ cho đơn MK012 giúp mình", [], "COMPLAINT", auth)
    rule = authorize_capability(capability, auth)
    assert capability == "order_management"
    assert rule["allowed"] is True

    action_rule = authorize_action("update_address", auth, {"found": True, "status": "processing"})
    assert action_rule["allowed"] is True

    action_rule = authorize_action("check_order_status", auth, {"found": True, "status": "shipping"})
    assert action_rule["allowed"] is True


def test_admin_scenarios():
    auth = _build_auth_profile({"user_id": "admin_1", "role": "admin", "auth_token": "token_admin"})

    capability, _ = _infer_capability("hủy đơn MK012 giúp mình", [], "COMPLAINT", auth)
    rule = authorize_capability(capability, auth)
    assert capability == "order_management"
    assert rule["allowed"] is True
    assert rule["mode"] == "full_access"

    for action in ("update_address", "cancel_order", "request_refund", "process_return", "check_order_status"):
        action_rule = authorize_action(action, auth, {"found": False, "status": "processing"})
        assert action_rule["allowed"] is True, action


def test_new_order_vs_existing_order_routing():
    guest = _build_auth_profile({})
    logged_in = _build_auth_profile({"user_id": "u_1", "auth_token": "token_123", "ownership_verified": True})

    capability, _ = _infer_capability("mình muốn đặt hàng mới 2 món", [], "INQUIRY", guest)
    assert capability == "checkout"

    capability, _ = _infer_capability("đổi địa chỉ cho đơn MK012 giúp mình", [], "COMPLAINT", guest)
    assert capability == "order_management"

    capability, _ = _infer_capability("mình muốn đặt hàng mới 2 món", [], "INQUIRY", logged_in)
    assert capability == "checkout"

    capability, _ = _infer_capability("hủy đơn MK012 giúp mình", [], "COMPLAINT", logged_in)
    assert capability == "order_management"
