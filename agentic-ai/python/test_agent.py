"""
EmpathAI — Test Script cho Agentic Pipeline.

Chạy từ thư mục python/:
    python test_agent.py

3 cấp độ test:
  [L1] Order Tool     — không cần deps, chạy ngay
  [L2] LangGraph Full — cần FEATHERLESS_API_KEY + Qdrant (hoặc chạy không có RAG)
  [L3] Hướng dẫn full stack (Docker + Rust)
"""
import sys
import os
import asyncio
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
os.environ["PYTHONIOENCODING"] = "utf-8"

from rich.console import Console
from rich.panel import Panel
from rich.table import Table
from rich import box

console = Console(force_terminal=True)

# ══════════════════════════════════════════════════════
# LEVEL 1 — Order Tool (không cần bất kỳ service nào)
# ══════════════════════════════════════════════════════

def test_order_tool():
    console.print(Panel.fit(
        "[bold cyan]LEVEL 1 — Order Tool Unit Test[/]\n"
        "[dim]Không cần API key hay Docker[/]",
        border_style="cyan"
    ))

    from tools.order_tool import extract_order_id, get_order_info, determine_suggested_actions

    # --- Test 1: Regex extraction ---
    console.print("\n[bold]1. Kiểm tra Regex nhận dạng mã đơn[/]")
    test_phrases = [
        ("đơn hàng MK002 của tôi bị lỗi", "MK002"),
        ("mã đơn MK003, sao chưa giao?", "MK003"),
        ("đơn số MK007 giao trễ quá", "MK007"),
        ("tôi muốn hủy đơn #MK004", "MK004"),
        ("giao hàng lâu quá không thấy đơn đâu", None),   # Không có mã
        ("order id MK001 where is my package", "MK001"),
    ]

    table = Table(box=box.SIMPLE_HEAVY, show_header=True)
    table.add_column("Tin nhắn", style="white", max_width=45)
    table.add_column("Expected", style="dim")
    table.add_column("Got", style="bold")
    table.add_column("✓", justify="center")

    all_pass = True
    for phrase, expected in test_phrases:
        got = extract_order_id(phrase)
        ok = got == expected
        all_pass = all_pass and ok
        table.add_row(
            phrase,
            str(expected),
            str(got),
            "[green]✓[/]" if ok else "[red]✗[/]"
        )

    console.print(table)
    console.print(f"  Kết quả: {'[bold green]TẤT CẢ PASS[/]' if all_pass else '[bold red]CÓ LỖI[/]'}")

    # --- Test 2: Order lookup guard ---
    console.print("\n[bold]2. Kiểm tra guard tra cứu đơn hàng thật[/]")

    test_cases = ["MK001", "6a05f2a94079aa69c576225b", "INVALID99"]

    table2 = Table(box=box.SIMPLE_HEAVY, show_header=True)
    table2.add_column("Mã đơn", style="cyan")
    table2.add_column("Verification")
    table2.add_column("Normalized")
    table2.add_column("Actions gợi ý", max_width=40)
    table2.add_column("Found", justify="center")

    for order_id in test_cases:
        info = get_order_info(order_id)
        found = info.get("found", False)
        verification = "required" if info.get("verification_required") else "—"
        actions = ", ".join(info.get("suggested_actions", []))

        ok = not found and info.get("verification_required")
        table2.add_row(
            order_id,
            verification,
            info.get("order_id", ""),
            actions[:38],
            "[green]✓[/]" if ok else "[red]✗[/]"
        )

    console.print(table2)

    # --- Test 3: suggested_actions với sentiment ---
    console.print("\n[bold]3. Kiểm tra suggested_actions theo sentiment[/]")
    info_mk003 = {"suggested_actions": ["manual_review"]}

    for sentiment in ["neutral", "frustrated", "toxic"]:
        actions = determine_suggested_actions(info_mk003, sentiment)
        console.print(f"  [dim]MK003 + sentiment=[/][cyan]{sentiment}[/] → {actions}")

    console.print("\n[bold green]✓ Level 1 hoàn thành[/]\n")


# ══════════════════════════════════════════════════════
# LEVEL 1b — Multi-turn Action Unit Test (không cần API)
# ══════════════════════════════════════════════════════

def test_multi_turn_action():
    console.print(Panel.fit(
        "[bold cyan]LEVEL 1b — Multi-turn Action Unit Test[/]\n"
        "[dim]Không cần API key[/]",
        border_style="cyan"
    ))

    from tools.action_tool import detect_action_intent, resume_action_intent

    # --- Turn 1: customer asks to change address, no order_id ---
    question_t1 = "Đổi địa chỉ giúp mình"
    order_info_empty = {}
    intent_t1 = detect_action_intent(question_t1, order_info_empty)

    console.print(f"\n[bold]Turn 1:[/] {question_t1}")
    console.print(f"  Action: {intent_t1.get('action')}, needs_order_id: {intent_t1.get('needs_order_id')}")
    assert intent_t1["action"] == "update_address", "Expected update_address intent"
    assert intent_t1["needs_order_id"] is True, "Expected needs_order_id=True when no order"

    # --- Turn 2: customer provides order_id ---
    order_info_mk001 = {
        "found": True,
        "order_id": "MK001",
        "status": "processing",
        "return_eligible": False,
        "delivered_hours_ago": 0,
    }
    pending = {"action": "update_address"}
    question_t2 = "MK001"
    intent_t2 = resume_action_intent(question_t2, order_info_mk001, pending)

    console.print(f"\n[bold]Turn 2:[/] {question_t2} (resume pending)")
    console.print(f"  Action: {intent_t2.get('action')}, needs_more_info: {intent_t2.get('needs_more_info')}")
    assert intent_t2["action"] == "update_address", "Expected resumed update_address"
    assert intent_t2["needs_more_info"] is True, "Expected needs_more_info=True (no new address in 'MK001')"

    # --- Turn 3: customer provides new address ---
    question_t3 = "Địa chỉ mới là 123 Nguyễn Văn A, Quận 1"
    intent_t3 = resume_action_intent(question_t3, order_info_mk001, pending)

    console.print(f"\n[bold]Turn 3:[/] {question_t3} (resume pending)")
    console.print(f"  Action: {intent_t3.get('action')}, executable: {intent_t3.get('executable')}")
    assert intent_t3["action"] == "update_address", "Expected resumed update_address"
    assert intent_t3["executable"] is True, "Expected executable=True when address provided and order found"
    assert "123 Nguyễn Văn A" in (intent_t3.get("new_address") or ""), "Expected extracted address"

    console.print("\n[bold green]✓ Level 1b (Multi-turn) hoàn thành[/]\n")


def test_order_cache():
    console.print(Panel.fit(
        "[bold cyan]LEVEL 1c — No Mock Order Store Unit Test[/]\n"
        "[dim]Hệ thống thật không còn đọc dữ liệu đơn hàng mẫu[/]",
        border_style="cyan"
    ))

    import tools.order_tool as order_tool

    removed_attrs = ["_load" + "_orders", "_save" + "_orders"]
    for attr in removed_attrs:
        assert not hasattr(order_tool, attr), f"Sample order helper {attr} must not exist"

    console.print("  Mock order loader/saver removed.")
    console.print("\n[bold green]✓ Level 1c (No Mock Store) hoàn thành[/]\n")


# ══════════════════════════════════════════════════════
# LEVEL 1d — Permission Matrix / Routing Scenario Test
# ══════════════════════════════════════════════════════

def test_permission_matrix():
    console.print(Panel.fit(
        "[bold cyan]LEVEL 1d — Permission Matrix Scenario Test[/]\n"
        "[dim]Không cần API key[/]",
        border_style="cyan"
    ))

    from agents.graph import _build_auth_profile, _infer_capability
    from agents.permission_matrix import authorize_capability, authorize_action, summarize_permission_matrix

    matrix = summarize_permission_matrix()
    console.print(f"[dim]Capabilities configured:[/] {list(matrix['capabilities'].keys())}")

    scenarios = [
        {
            "label": "Guest hỏi chính sách đổi trả",
            "shop_context": {},
            "question": "chính sách đổi trả của shop là gì?",
            "intent": "INQUIRY",
            "expected_capability": "inquiry",
            "expected_scope": "guest",
            "expected_allowed": True,
        },
        {
            "label": "Guest hỏi điểm thưởng cá nhân",
            "shop_context": {},
            "question": "mình còn bao nhiêu điểm?",
            "intent": "INQUIRY",
            "expected_capability": "loyalty",
            "expected_scope": "guest",
            "expected_allowed": True,
        },
        {
            "label": "Guest hỏi kênh hỗ trợ",
            "shop_context": {},
            "question": "tạo ticket hỗ trợ giúp mình",
            "intent": "COMPLAINT",
            "expected_capability": "inquiry",
            "expected_scope": "guest",
            "expected_allowed": True,
        },
        {
            "label": "Guest mua hàng mới",
            "shop_context": {},
            "question": "mình muốn đặt hàng mới 2 món",
            "intent": "INQUIRY",
            "expected_capability": "checkout",
            "expected_scope": "guest",
            "expected_allowed": True,
        },
        {
            "label": "Guest quản lý đơn cũ",
            "shop_context": {},
            "question": "đổi địa chỉ cho đơn MK012 giúp mình",
            "intent": "COMPLAINT",
            "expected_capability": "order_management",
            "expected_scope": "guest",
            "expected_allowed": True,
            "expected_action": "update_address",
            "expected_action_allowed": False,
        },
        {
            "label": "Logged-in xem điểm của mình",
            "shop_context": {"user_id": "u_1", "auth_token": "token_123"},
            "question": "mình còn bao nhiêu điểm?",
            "intent": "INQUIRY",
            "expected_capability": "loyalty",
            "expected_scope": "logged_in",
            "expected_allowed": True,
        },
        {
            "label": "Logged-in đổi địa chỉ",
            "shop_context": {"user_id": "u_1", "auth_token": "token_123", "ownership_verified": True},
            "question": "đổi địa chỉ cho đơn MK012 giúp mình",
            "intent": "COMPLAINT",
            "expected_capability": "order_management",
            "expected_scope": "logged_in",
            "expected_allowed": True,
            "expected_action": "update_address",
            "expected_action_allowed": True,
        },
        {
            "label": "Admin xử lý đơn",
            "shop_context": {"user_id": "admin_1", "role": "admin", "auth_token": "token_admin"},
            "question": "hủy đơn MK012 giúp mình",
            "intent": "COMPLAINT",
            "expected_capability": "order_management",
            "expected_scope": "admin",
            "expected_allowed": True,
            "expected_action": "cancel_order",
            "expected_action_allowed": True,
        },
    ]

    table = Table(box=box.SIMPLE_HEAVY, show_header=True)
    table.add_column("Scenario", style="cyan", max_width=32)
    table.add_column("Scope", style="white")
    table.add_column("Capability", style="white")
    table.add_column("Allowed", style="bold")
    table.add_column("Action", style="white")
    table.add_column("Action Allowed", style="bold")

    for scenario in scenarios:
        auth = _build_auth_profile(scenario["shop_context"])
        capability, reason = _infer_capability(
            scenario["question"], [], scenario["intent"], auth
        )
        capability_rule = authorize_capability(capability, auth)
        assert capability == scenario["expected_capability"], (
            f"{scenario['label']}: expected capability {scenario['expected_capability']}, got {capability} ({reason})"
        )
        assert auth["user_scope"] == scenario["expected_scope"], (
            f"{scenario['label']}: expected scope {scenario['expected_scope']}, got {auth['user_scope']}"
        )
        assert capability_rule["allowed"] == scenario["expected_allowed"], (
            f"{scenario['label']}: expected allowed {scenario['expected_allowed']}, got {capability_rule['allowed']}"
        )

        action_name = scenario.get("expected_action", "")
        action_allowed = "—"
        if action_name:
            action_rule = authorize_action(action_name, auth, {"found": True, "status": "processing"})
            action_allowed = "✓" if action_rule.get("allowed") else "✗"
            assert action_rule["allowed"] == scenario["expected_action_allowed"], (
                f"{scenario['label']}: expected action_allowed {scenario['expected_action_allowed']}, got {action_rule['allowed']}"
            )

        table.add_row(
            scenario["label"],
            auth["user_scope"],
            capability,
            "✓" if capability_rule["allowed"] else "✗",
            action_name or "—",
            action_allowed,
        )

    console.print(table)
    console.print("\n[bold green]✓ Level 1d (Permission Matrix) hoàn thành[/]\n")


def test_guest_checkout_extraction():
    console.print(Panel.fit(
        "[bold cyan]LEVEL 1e — Guest Checkout Extraction Test[/]\n"
        "[dim]Kiểm tra bot tự rút guestInfo từ một tin nhắn[/]",
        border_style="cyan"
    ))

    from tools import checkout_tool

    question = (
        "Mình là Hoàng Minh, email hoangminh.test@gmail.com, "
        "sđt 0901234567, địa chỉ 12 Lê Lợi, phường Bến Thành, quận 1, TP.HCM."
    )
    history = [
        {"role": "assistant", "content": "Bạn gửi giúp mình thông tin đặt hàng nhé."},
    ]
    shop_context = {"guest_session_id": "guest_session_demo"}

    extracted = checkout_tool._build_guest_info(question, history, shop_context)
    assert extracted["fullName"] == "Hoàng Minh"
    assert extracted["email"] == "hoangminh.test@gmail.com"
    assert extracted["phone"] == "0901234567"
    assert "12 Lê Lợi" in extracted["addressLine"]

    original_guest_checkout = checkout_tool.guest_checkout_from_cart
    captured = {}

    def fake_guest_checkout(payload, context=None):
        captured["payload"] = payload
        captured["context"] = context or {}
        return {
            "success": True,
            "message": "guest checkout ok",
            "data": {"_id": "ORDER_DEMO_001"},
        }

    try:
        checkout_tool.guest_checkout_from_cart = fake_guest_checkout
        result = checkout_tool.start_checkout(question, history, shop_context)
    finally:
        checkout_tool.guest_checkout_from_cart = original_guest_checkout

    assert result["ok"] is True
    assert captured["payload"]["sessionId"] == "guest_session_demo"
    assert captured["payload"]["guestInfo"]["fullName"] == "Hoàng Minh"
    assert captured["payload"]["guestInfo"]["email"] == "hoangminh.test@gmail.com"
    assert captured["payload"]["guestInfo"]["phone"] == "0901234567"
    assert "12 Lê Lợi" in captured["payload"]["guestInfo"]["addressLine"]

    console.print("[green]✓[/] Extracted guest info and assembled guest checkout payload correctly.")
    console.print("\n[bold green]✓ Level 1e (Guest Checkout Extraction) hoàn thành[/]\n")


def test_checkout_redirects_catalog_recommendations():
    console.print(Panel.fit(
        "[bold cyan]LEVEL 1e2 — Checkout Redirect Guard Test[/]\n"
        "[dim]Kiểm tra các câu hỏi gợi ý sản phẩm theo ngân sách không rơi vào guest checkout[/]",
        border_style="cyan"
    ))

    from tools import checkout_tool

    original_checkout = checkout_tool.checkout_from_cart
    original_guest_checkout = checkout_tool.guest_checkout_from_cart
    called = {"checkout": False, "guest_checkout": False}

    def fake_checkout(payload, context=None):
        called["checkout"] = True
        raise AssertionError("checkout_from_cart should not be called for catalog recommendation requests")

    def fake_guest_checkout(payload, context=None):
        called["guest_checkout"] = True
        raise AssertionError("guest_checkout_from_cart should not be called for catalog recommendation requests")

    phrases = [
        "Gợi ý cho tôi món đồ dưới 300k",
        "Gợi ý quà tặng dưới 300k",
        "Tư vấn món đồ chơi dưới 300k",
        "Món đồ dưới 300k nào hợp làm quà?",
    ]

    try:
        checkout_tool.checkout_from_cart = fake_checkout
        checkout_tool.guest_checkout_from_cart = fake_guest_checkout

        for phrase in phrases:
            called["checkout"] = False
            called["guest_checkout"] = False
            result = checkout_tool.start_checkout(
                phrase,
                history=[
                    {"role": "assistant", "content": "Bạn gửi mình thông tin đặt hàng nhé."},
                ],
                shop_context={"guest_session_id": "guest_session_demo"},
            )

            assert result["ok"] is False, phrase
            assert result.get("redirect_intent") == "catalog", phrase
            assert not result.get("needs_guest_info"), phrase
            assert not result.get("needs_guest_session"), phrase
            assert not called["checkout"], phrase
            assert not called["guest_checkout"], phrase
            assert "đặt đơn" not in result.get("message", "").lower(), phrase
            assert "email" not in result.get("message", "").lower(), phrase
            assert "địa chỉ" not in result.get("message", "").lower(), phrase
    finally:
        checkout_tool.checkout_from_cart = original_checkout
        checkout_tool.guest_checkout_from_cart = original_guest_checkout

    console.print("[green]✓[/] Catalog recommendation phrases were redirected away from checkout.")
    console.print("\n[bold green]✓ Level 1e2 (Checkout Redirect Guard) hoàn thành[/]\n")


def test_guest_checkout_memory_latch():
    console.print(Panel.fit(
        "[bold cyan]LEVEL 1f — Guest Checkout Memory Latch Test[/]\n"
        "[dim]Kiểm tra bot ghép info từ nhiều tin nhắn liên tiếp[/]",
        border_style="cyan"
    ))

    from agents.graph import (
        route_by_intent,
        checkout_node,
        _clear_guest_checkout_profile,
        _get_guest_checkout_profile,
    )
    from tools import checkout_tool

    session_id = "guest_latch_demo"
    turns = [
        "mình tên Hoàng Minh",
        "email hoangminh.test@gmail.com",
        "sđt 0901234567",
        "địa chỉ 12 Lê Lợi, phường Bến Thành, quận 1, TP.HCM",
    ]

    _clear_guest_checkout_profile(session_id)

    original_guest_checkout = checkout_tool.guest_checkout_from_cart
    captured = {}

    def fake_guest_checkout(payload, context=None):
        captured["payload"] = payload
        captured["context"] = context or {}
        return {
            "success": True,
            "message": "guest checkout ok",
            "data": {"_id": "ORDER_DEMO_002"},
        }

    try:
        checkout_tool.guest_checkout_from_cart = fake_guest_checkout

        for turn in turns:
            route_by_intent({
                "session_id": session_id,
                "question": turn,
                "history": [],
                "shop_context": {},
                "intent": "INQUIRY",
                "capability": "",
                "agent_trace": {},
            })

        cached = _get_guest_checkout_profile(session_id)
        assert cached["fullName"] == "Hoàng Minh"
        assert cached["email"] == "hoangminh.test@gmail.com"
        assert cached["phone"] == "0901234567"
        assert "12 Lê Lợi" in cached["addressLine"]

        state = {
            "session_id": session_id,
            "question": "mình muốn đặt hàng mới giúp mình",
            "history": [],
            "shop_context": {"guest_session_id": "guest_session_demo"},
            "agent_trace": {},
        }
        result = checkout_node(state)

        assert result["checkout_result"]["ok"] is True
        assert captured["payload"]["guestInfo"]["fullName"] == "Hoàng Minh"
        assert captured["payload"]["guestInfo"]["email"] == "hoangminh.test@gmail.com"
        assert captured["payload"]["guestInfo"]["phone"] == "0901234567"
        assert "12 Lê Lợi" in captured["payload"]["guestInfo"]["addressLine"]
        assert captured["payload"]["sessionId"] == "guest_session_demo"
    finally:
        checkout_tool.guest_checkout_from_cart = original_guest_checkout
        _clear_guest_checkout_profile(session_id)

    console.print("[green]✓[/] Guest info was latched across multiple turns and reused for checkout.")
    console.print("\n[bold green]✓ Level 1f (Guest Checkout Memory Latch) hoàn thành[/]\n")


def test_order_followup_memory():
    console.print(Panel.fit(
        "[bold cyan]LEVEL 1g — Order Follow-up Memory Test[/]\n"
        "[dim]Kiểm tra bot nhớ mã đơn / trạng thái / địa chỉ qua nhiều lượt[/]",
        border_style="cyan"
    ))

    import agents.graph as graph_mod

    session_id = "order_followup_demo"
    graph_mod._clear_order_profile(session_id)
    graph_mod._remember_order_profile(
        session_id,
        {
            "found": True,
            "ownership_verified": True,
            "order_id": "MK099",
            "status": "shipping",
            "address": "123 Nguyen Trai, Quan 1",
            "summary": "Đơn **MK099** — 1 món — 159,000đ\nTrạng thái: shipping\nĐịa chỉ: 123 Nguyen Trai, Quan 1",
            "lookup_hints": ["đăng nhập tài khoản đã đặt đơn"],
        },
        "mình đã xem đơn rồi",
    )

    captured = {}
    original_get_order_info = graph_mod.get_order_info

    def fake_get_order_info(order_id, context=None):
        captured["order_id"] = order_id
        return {
            "found": True,
            "ownership_verified": True,
            "order_id": order_id,
            "status": "shipping",
            "address": "123 Nguyen Trai, Quan 1",
            "summary": "Đơn **MK099** — 1 món — 159,000đ\nTrạng thái: shipping\nĐịa chỉ: 123 Nguyen Trai, Quan 1",
            "suggested_actions": ["check_order_status"],
            "raw": {},
        }

    try:
        graph_mod.get_order_info = fake_get_order_info

        route = graph_mod.route_by_intent({
            "session_id": session_id,
            "question": "đổi địa chỉ cho đơn đó giúp mình",
            "history": [],
            "capability": "",
            "intent": "COMPLAINT",
            "agent_trace": {},
        })
        assert route == "complaint"

        result = graph_mod.order_lookup_node({
            "session_id": session_id,
            "question": "đổi địa chỉ cho đơn đó giúp mình",
            "history": [],
            "shop_context": {},
            "sentiment": "neutral",
            "agent_trace": {},
        })

        assert captured["order_id"] == "MK099"
        assert result["order_info"]["order_id"] == "MK099"
        assert result["order_info"]["status"] == "shipping"
    finally:
        graph_mod.get_order_info = original_get_order_info
        graph_mod._clear_order_profile(session_id)

    console.print("[green]✓[/] Order memory carried the last order across turns correctly.")
    console.print("\n[bold green]✓ Level 1g (Order Follow-up Memory) hoàn thành[/]\n")


def test_budget_catalog_routing():
    console.print(Panel.fit(
        "[bold cyan]LEVEL 1g2 — Budget Catalog Routing Test[/]\n"
        "[dim]Kiểm tra câu hỏi gợi ý sản phẩm theo ngân sách không bị lôi sang đơn hàng cũ[/]",
        border_style="cyan"
    ))

    import agents.graph as graph_mod

    session_id = "budget_catalog_demo"
    graph_mod._clear_order_profile(session_id)
    graph_mod._remember_order_profile(
        session_id,
        {
            "found": True,
            "ownership_verified": True,
            "order_id": "MK099",
            "status": "shipping",
            "address": "123 Nguyen Trai, Quan 1",
            "summary": "Đơn **MK099** — 1 món — 159,000đ\nTrạng thái: shipping\nĐịa chỉ: 123 Nguyen Trai, Quan 1",
            "lookup_hints": ["đăng nhập tài khoản đã đặt đơn"],
        },
        "mình đã xem đơn rồi",
    )

    try:
        route = graph_mod.route_by_intent({
            "session_id": session_id,
            "question": "Gợi ý cho tôi món đồ dưới 300k",
            "history": [
                {"role": "user", "content": "đổi địa chỉ cho đơn đó giúp mình"},
            ],
            "capability": "",
            "intent": "INQUIRY",
            "agent_trace": {},
        })
        capability, reason = graph_mod._infer_capability(
            "Gợi ý cho tôi món đồ dưới 300k",
            [{"role": "user", "content": "đổi địa chỉ cho đơn đó giúp mình"}],
            "INQUIRY",
            graph_mod._build_auth_profile({}),
        )

        assert route == "catalog", f"Expected catalog route, got {route} ({reason})"
        assert capability == "catalog", f"Expected catalog capability, got {capability} ({reason})"
    finally:
        graph_mod._clear_order_profile(session_id)

    console.print("[green]✓[/] Budget-based product recommendation stays on the catalog path.")
    console.print("\n[bold green]✓ Level 1g2 (Budget Catalog Routing) hoàn thành[/]\n")


def test_budget_catalog_lookup_price_filter():
    console.print(Panel.fit(
        "[bold cyan]LEVEL 1g3 — Budget Catalog Lookup Filter Test[/]\n"
        "[dim]Kiểm tra catalog tool lọc theo giá thay vì search nguyên văn câu hỏi[/]",
        border_style="cyan"
    ))

    from tools import catalog_tool

    original_search = catalog_tool.search_products
    original_search_by_filters = catalog_tool.search_products_by_filters
    calls = {"keyword": [], "filters": []}

    def fake_search_products(query, context=None):
        calls["keyword"].append((query, context or {}))
        return {"success": True, "data": {"products": []}}

    def fake_search_products_by_filters(context=None, **kwargs):
        calls["filters"].append(kwargs)
        return {
            "success": True,
            "data": {
                "products": [
                    {"name": "Bộ xếp hình mini", "minPrice": 120000, "maxPrice": 180000, "totalStock": 4},
                    {"name": "Sách tô màu", "minPrice": 250000, "maxPrice": 250000, "totalStock": 2},
                ]
            },
        }

    try:
        catalog_tool.search_products = fake_search_products
        catalog_tool.search_products_by_filters = fake_search_products_by_filters

        result = catalog_tool.lookup_live_catalog("Gợi ý cho tôi món đồ dưới 300k", {})

        assert calls["filters"], "Expected price-filter search to be used"
        first_call = calls["filters"][0]
        assert first_call.get("max_price") == 300000
        assert first_call.get("keyword") in (None, "")
        assert not calls["keyword"], "Keyword-only search should not be needed when price filter already returns products"
        assert result["found"] is True
        assert ("300.000đ" in result["summary"]) or ("300,000đ" in result["summary"])
        assert "Bộ xếp hình mini" in result["summary"]
    finally:
        catalog_tool.search_products = original_search
        catalog_tool.search_products_by_filters = original_search_by_filters

    console.print("[green]✓[/] Catalog lookup now uses budget-aware filtering.")
    console.print("\n[bold green]✓ Level 1g3 (Budget Catalog Lookup Filter) hoàn thành[/]\n")


def test_catalog_keyword_fallback_search():
    console.print(Panel.fit(
        "[bold cyan]LEVEL 1g4 — Catalog Keyword Fallback Test[/]\n"
        "[dim]Kiểm tra catalog vẫn tìm được sản phẩm khi backend keyword search trả rỗng[/]",
        border_style="cyan"
    ))

    from tools import catalog_tool

    original_search = catalog_tool.search_products
    original_search_by_filters = catalog_tool.search_products_by_filters
    calls = {"keyword": [], "filters": []}

    def fake_search_products(query, context=None):
        calls["keyword"].append(query)
        return {"success": True, "data": {"products": []}}

    def fake_search_products_by_filters(context=None, **kwargs):
        calls["filters"].append(kwargs)
        return {
            "success": True,
            "data": {
                "products": [
                    {"name": "Stardust Picnic Box", "slug": "stardust-picnic-box", "description": "Giftable blind box", "minPrice": 159000, "maxPrice": 249000, "totalStock": 40},
                    {"name": "Moon Parade Capsule", "slug": "moon-parade-capsule", "description": "Collectible capsule", "minPrice": 177000, "maxPrice": 267000, "totalStock": 26},
                ]
            },
        }

    try:
        catalog_tool.search_products = fake_search_products
        catalog_tool.search_products_by_filters = fake_search_products_by_filters

        result = catalog_tool.lookup_live_catalog("Stardust Picnic Box", {})

        assert calls["keyword"] == ["stardust picnic box"]
        assert calls["filters"], "Expected fallback product list fetch"
        assert result["found"] is True
        assert len(result["products"]) == 1
        assert result["products"][0]["name"] == "Stardust Picnic Box"
        assert "Stardust Picnic Box" in result["summary"]
    finally:
        catalog_tool.search_products = original_search
        catalog_tool.search_products_by_filters = original_search_by_filters

    console.print("[green]✓[/] Catalog fallback matched product names locally.")
    console.print("\n[bold green]✓ Level 1g4 (Catalog Keyword Fallback) hoàn thành[/]\n")


def test_purchase_request_adds_product_to_guest_cart():
    console.print(Panel.fit(
        "[bold cyan]LEVEL 1g5 — Purchase Add-to-Cart Test[/]\n"
        "[dim]Kiểm tra câu mua sản phẩm được thêm vào cart trước khi checkout[/]",
        border_style="cyan"
    ))

    import agents.graph as graph_mod
    from tools import checkout_tool

    route = graph_mod.route_by_intent({
        "session_id": "purchase_demo",
        "question": "Mua Stardust Picnic Box giúp tôi",
        "history": [],
        "capability": "",
        "intent": "INQUIRY",
        "agent_trace": {},
    })
    capability, reason = graph_mod._infer_capability(
        "Mua Stardust Picnic Box giúp tôi",
        [],
        "INQUIRY",
        graph_mod._build_auth_profile({}),
    )
    assert capability == "checkout", f"Expected checkout capability, got {capability} ({reason})"
    assert route == "checkout", f"Expected checkout route, got {route}"

    originals = {
        "lookup": checkout_tool.lookup_live_catalog,
        "get_cart": checkout_tool.get_cart_by_session,
        "create_cart": checkout_tool.create_cart,
        "add_item": checkout_tool.add_item_to_cart,
        "guest_checkout": checkout_tool.guest_checkout_from_cart,
    }
    captured = {}

    def fake_lookup(question, context=None):
        captured["lookup_question"] = question
        return {
            "found": True,
            "products": [
                {
                    "name": "Stardust Picnic Box",
                    "variants": [{"_id": "VARIANT_1", "stockQuantity": 5, "price": 159000}],
                }
            ],
            "summary": "found",
        }

    def fake_get_cart(session_id, context=None):
        captured["session_id"] = session_id
        return {"_id": "CART_1", "items": []}

    def fake_create_cart(payload, context=None):
        captured["create_cart"] = payload
        return {"_id": "CART_CREATED", "items": []}

    def fake_add_item(cart_id, variant_id, quantity=1, context=None):
        captured["add_item"] = (cart_id, variant_id, quantity)
        return {"_id": cart_id, "items": [{"variantId": variant_id, "quantity": quantity}]}

    def fake_guest_checkout(payload, context=None):
        captured["guest_checkout"] = payload
        return {"success": True, "message": "checkout ok", "data": {"_id": "ORDER_1"}}

    try:
        checkout_tool.lookup_live_catalog = fake_lookup
        checkout_tool.get_cart_by_session = fake_get_cart
        checkout_tool.create_cart = fake_create_cart
        checkout_tool.add_item_to_cart = fake_add_item
        checkout_tool.guest_checkout_from_cart = fake_guest_checkout

        result = checkout_tool.start_checkout(
            "Mua Stardust Picnic Box giúp tôi",
            history=[],
            shop_context={"guest_session_id": "guest_session_demo"},
        )
    finally:
        checkout_tool.lookup_live_catalog = originals["lookup"]
        checkout_tool.get_cart_by_session = originals["get_cart"]
        checkout_tool.create_cart = originals["create_cart"]
        checkout_tool.add_item_to_cart = originals["add_item"]
        checkout_tool.guest_checkout_from_cart = originals["guest_checkout"]

    assert captured["lookup_question"] == "Stardust Picnic Box"
    assert captured["add_item"] == ("CART_1", "VARIANT_1", 1)
    assert result["needs_guest_info"] is True
    assert "đã thêm 1 x Stardust Picnic Box vào giỏ" in result["message"]
    assert "email" in result["message"]

    console.print("[green]✓[/] Purchase request added the product to guest cart and continued checkout.")
    console.print("\n[bold green]✓ Level 1g5 (Purchase Add-to-Cart) hoàn thành[/]\n")


def test_brand_voice_prompts():
    console.print(Panel.fit(
        "[bold cyan]LEVEL 1h — Brand Voice Prompt Test[/]\n"
        "[dim]Kiểm tra lớp giọng thương hiệu đã được gắn vào prompt[/]",
        border_style="cyan"
    ))

    from agents.prompt_registry import brand_voice_header, brand_voice_block
    from agents.empathy_writer import EMPATHY_SYSTEM_PROMPT, CASUAL_SYSTEM_PROMPT, INQUIRY_SYSTEM_PROMPT

    assert brand_voice_header() in EMPATHY_SYSTEM_PROMPT
    assert brand_voice_header() in CASUAL_SYSTEM_PROMPT
    assert brand_voice_header() in INQUIRY_SYSTEM_PROMPT
    assert "hỗ trợ" in brand_voice_block("support").lower()
    assert "đơn" in brand_voice_block("order").lower()
    assert "bán hàng" in brand_voice_block("sales").lower()
    assert "loyalty" in brand_voice_block("loyalty").lower()
    assert "catalog" in brand_voice_block("catalog").lower()
    assert "nhắn tin" in brand_voice_block("casual").lower()

    console.print("[green]✓[/] Brand voice layer is present in all major prompts.")
    console.print("\n[bold green]✓ Level 1h (Brand Voice Prompt) hoàn thành[/]\n")


def test_catalog_followup_memory():
    console.print(Panel.fit(
        "[bold cyan]LEVEL 1i — Catalog Follow-up Memory Test[/]\n"
        "[dim]Kiểm tra bot nhớ món khách đang xem qua nhiều lượt[/]",
        border_style="cyan"
    ))

    import agents.graph as graph_mod

    session_id = "catalog_followup_demo"
    graph_mod._clear_catalog_profile(session_id)
    graph_mod._remember_catalog_profile(
        session_id,
        {
            "found": True,
            "query": "Stardust Picnic Box",
            "summary": "Mình vừa tìm thấy Stardust Picnic Box.",
            "products": [{"name": "Stardust Picnic Box", "slug": "stardust-picnic-box"}],
        },
        "món này",
    )

    captured = {}
    original_lookup = graph_mod.lookup_live_catalog

    def fake_lookup(question, context=None):
        captured["question"] = question
        return {
            "found": True,
            "query": question,
            "summary": "Mình tìm thấy Stardust Picnic Box.",
            "products": [{"name": "Stardust Picnic Box", "slug": "stardust-picnic-box"}],
            "suggested_actions": ["show_product_detail"],
        }

    try:
        graph_mod.lookup_live_catalog = fake_lookup
        result = graph_mod.catalog_lookup_node({
            "session_id": session_id,
            "question": "còn size nào?",
            "history": [],
            "shop_context": {},
            "agent_trace": {},
        })

        assert "Stardust Picnic Box" in captured["question"]
        assert result["catalog_info"]["found"] is True
        assert "Stardust Picnic Box" in result["answer"]
    finally:
        graph_mod.lookup_live_catalog = original_lookup
        graph_mod._clear_catalog_profile(session_id)

    console.print("[green]✓[/] Catalog memory carried the last viewed product into the follow-up turn.")
    console.print("\n[bold green]✓ Level 1i (Catalog Follow-up Memory) hoàn thành[/]\n")


def test_catalog_selection_line_followup():
    console.print(Panel.fit(
        "[bold cyan]LEVEL 1j — Catalog Selection Line Follow-up Test[/]\n"
        "[dim]Kiểm tra khách chọn một dòng sản phẩm trong danh sách gợi ý thì bot tra đúng món đó[/]",
        border_style="cyan"
    ))

    import agents.graph as graph_mod

    session_id = "catalog_selection_demo"
    graph_mod._clear_catalog_profile(session_id)
    graph_mod._remember_catalog_profile(
        session_id,
        {
            "found": True,
            "query": "Gợi ý dưới 300k",
            "summary": "Mình gợi ý vài món dưới 300k.",
            "products": [
                {"name": "Stardust Picnic Box", "slug": "stardust-picnic-box"},
                {"name": "Moon Parade Capsule", "slug": "moon-parade-capsule"},
                {"name": "Nova Sprout Figure", "slug": "nova-sprout-figure"},
            ],
        },
        "Gợi ý cho tôi món đồ dưới 300k",
    )

    captured = {}
    original_lookup = graph_mod.lookup_live_catalog

    def fake_lookup(question, context=None):
        captured["question"] = question
        return {
            "found": True,
            "query": question,
            "summary": "Mình tìm thấy Stardust Picnic Box.\n- Giá: 159.000đ đến 249.000đ\n- Tồn kho tổng: 40",
            "products": [{"name": "Stardust Picnic Box", "slug": "stardust-picnic-box"}],
            "suggested_actions": ["show_product_detail"],
        }

    try:
        graph_mod.lookup_live_catalog = fake_lookup
        selected_line = "• Stardust Picnic Box - 159.000đ - 249.000đ"
        route = graph_mod.route_by_intent({
            "session_id": session_id,
            "question": selected_line,
            "history": [],
            "capability": "",
            "intent": "INQUIRY",
            "agent_trace": {},
        })
        result = graph_mod.catalog_lookup_node({
            "session_id": session_id,
            "question": selected_line,
            "history": [],
            "shop_context": {},
            "agent_trace": {},
        })

        assert route == "catalog"
        assert captured["question"] == "Stardust Picnic Box"
        assert result["catalog_info"]["found"] is True
        assert "Sleepover Joy Box" not in result["answer"]
        assert "Dream Shelf Secrets" not in result["answer"]
        assert "Stardust Picnic Box" in result["answer"]
    finally:
        graph_mod.lookup_live_catalog = original_lookup
        graph_mod._clear_catalog_profile(session_id)

    console.print("[green]✓[/] Catalog selection lines now drill into the chosen product.")
    console.print("\n[bold green]✓ Level 1j (Catalog Selection Line Follow-up) hoàn thành[/]\n")


def test_budget_purchase_requires_product_selection():
    console.print(Panel.fit(
        "[bold cyan]LEVEL 1k — Budget Purchase Selection Test[/]\n"
        "[dim]Kiểm tra câu muốn mua theo ngân sách không hỏi thông tin giao hàng quá sớm[/]",
        border_style="cyan"
    ))

    import agents.graph as graph_mod
    from tools import checkout_tool

    original_checkout_lookup = checkout_tool.lookup_live_catalog
    original_graph_start_checkout = graph_mod.start_checkout

    def fake_lookup(question, context=None):
        return {
            "found": True,
            "query": question,
            "summary": (
                "Mình gợi ý vài món trong tầm 200.000đ:\n"
                "• Stardust Picnic Box - 159.000đ - 249.000đ\n"
                "• Mini Bloom Keychain - 99.000đ"
            ),
            "products": [
                {"name": "Stardust Picnic Box", "slug": "stardust-picnic-box"},
                {"name": "Mini Bloom Keychain", "slug": "mini-bloom-keychain"},
            ],
        }

    try:
        checkout_tool.lookup_live_catalog = fake_lookup
        result = checkout_tool.start_checkout(
            "tôi muốn mua hàng dưới 500k",
            history=[],
            shop_context={"guest_session_id": "guest_budget_demo"},
        )

        assert result["needs_product_selection"] is True
        assert result.get("redirect_intent") == "catalog"
        assert result.get("needs_guest_info") is False
        assert "họ tên" not in result["message"].lower()
        assert "Stardust Picnic Box" in result["message"]
        assert "chọn" in result["message"].lower()

        def fake_start_checkout(question, history=None, shop_context=None):
            return result

        graph_mod.start_checkout = fake_start_checkout
        session_id = "budget_purchase_demo"
        graph_mod._clear_catalog_profile(session_id)
        node_result = graph_mod.checkout_node({
            "session_id": session_id,
            "question": "tôi muốn mua hàng dưới 500k",
            "history": [],
            "shop_context": {"guest_session_id": "guest_budget_demo"},
            "agent_trace": {},
        })

        assert "họ tên" not in node_result["answer"].lower()
        assert "Stardust Picnic Box" in node_result["answer"]
        assert graph_mod._get_catalog_profile(session_id).get("products")

        route = graph_mod.route_by_intent({
            "session_id": session_id,
            "question": "tôi muốn mua hàng dưới 500k",
            "history": [],
            "capability": "",
            "intent": "INQUIRY",
            "agent_trace": {},
        })
        capability, reason = graph_mod._infer_capability(
            "tôi muốn mua hàng dưới 500k",
            [],
            "INQUIRY",
            graph_mod._build_auth_profile({}),
        )
        assert route == "catalog", f"Expected catalog route for budget purchase, got {route} ({reason})"
        assert capability == "catalog", f"Expected catalog capability for budget purchase, got {capability} ({reason})"
    finally:
        checkout_tool.lookup_live_catalog = original_checkout_lookup
        graph_mod.start_checkout = original_graph_start_checkout
        graph_mod._clear_catalog_profile("budget_purchase_demo")

    console.print("[green]✓[/] Budget purchase requests now ask the customer to pick a product first.")
    console.print("\n[bold green]✓ Level 1k (Budget Purchase Selection) hoàn thành[/]\n")


def test_customer_service_postprocess_appends_next_step():
    console.print(Panel.fit(
        "[bold cyan]LEVEL 1k1 — Customer Service Postprocess Test[/]\n"
        "[dim]Kiểm tra bot tự gợi ý bước tiếp theo sau khi đã trả lời xong[/]",
        border_style="cyan"
    ))

    import agents.graph as graph_mod

    catalog_state = {
        "capability": "catalog",
        "question": "gợi ý cho tôi món đồ dưới 500k",
        "catalog_info": {"found": True, "products": [{"name": "Stardust Picnic Box"}]},
        "checkout_result": {},
        "order_info": {},
        "session_summary": {"viewed_products": [{"name": "Stardust Picnic Box"}]},
    }
    catalog_answer = graph_mod._apply_customer_service_postprocess(
        catalog_state,
        "Mình gợi ý nhanh cho bạn nè. Mình gợi ý vài món trong tầm 500.000đ."
    )
    assert "Nếu muốn, mình lọc tiếp theo độ tuổi" in catalog_answer

    inquiry_state = {
        "capability": "inquiry",
        "question": "cho tôi chính sách bảo hành",
        "catalog_info": {},
        "checkout_result": {},
        "order_info": {},
        "session_summary": {},
    }
    inquiry_answer = graph_mod._apply_customer_service_postprocess(
        inquiry_state,
        "Mình đang bị lỗi AI tạm thời, nhưng mình vẫn có thể giúp bạn hỏi về sản phẩm, đơn hàng, vận chuyển, đổi trả hoặc chính sách."
    )
    assert "lỗi AI tạm thời" not in inquiry_answer
    assert "bảo hành" in inquiry_answer.lower() or "đổi trả" in inquiry_answer.lower()

    console.print("[green]✓[/] Customer service postprocess adds next steps and repairs generic fallbacks.")
    console.print("\n[bold green]✓ Level 1k1 (Customer Service Postprocess) hoàn thành[/]\n")


def test_smart_clarification_for_budget_catalog():
    console.print(Panel.fit(
        "[bold cyan]LEVEL 1k2 — Smart Clarification Test[/]\n"
        "[dim]Kiểm tra câu hỏi ngân sách được hỏi lại thật ngắn và đúng ngữ cảnh[/]",
        border_style="cyan"
    ))

    import agents.graph as graph_mod

    result = graph_mod.clarify_node({
        "question": "tôi muốn mua hàng dưới 500k",
        "history": [],
        "session_summary": {"budget": {"max": 500000}},
        "agent_trace": {},
        "capability": "catalog",
    })

    answer = result["answer"].lower()
    assert "độ tuổi" in answer
    assert "chủ đề" in answer or "mục đích" in answer
    assert "500.000đ" in answer or "500000" in answer

    console.print("[green]✓[/] Smart clarification asks one short follow-up for budget catalog questions.")
    console.print("\n[bold green]✓ Level 1k2 (Smart Clarification) hoàn thành[/]\n")


def test_checkout_progression_wins_over_catalog_history():
    console.print(Panel.fit(
        "[bold cyan]LEVEL 1l — Checkout Progression Routing Test[/]\n"
        "[dim]Kiểm tra câu \"tiến hành đặt hàng\" thắng lịch sử gợi ý sản phẩm[/]",
        border_style="cyan"
    ))

    import agents.graph as graph_mod
    from tools import checkout_tool

    history = [
        {"role": "assistant", "content": "Mình gợi ý vài món trong tầm 400.000đ:"},
        {"role": "assistant", "content": "Mình đã thêm Stardust Picnic Box vào giỏ rồi nè."},
        {"role": "assistant", "content": "Mình đã thêm Candy Orbit Surprise vào giỏ rồi nè."},
    ]

    route = graph_mod.route_by_intent({
        "session_id": "checkout_progression_demo",
        "question": "Bây giờ tiến hành đặt hàng",
        "history": history,
        "shop_context": {"guest_session_id": "guest_progression_demo"},
        "intent": "INQUIRY",
        "capability": "",
        "agent_trace": {},
    })
    assert route == "checkout", f"Expected checkout route, got {route}"

    original_lookup = checkout_tool.lookup_live_catalog

    def fake_lookup(*args, **kwargs):
        raise AssertionError("lookup_live_catalog should not be called for checkout progression requests")

    try:
        checkout_tool.lookup_live_catalog = fake_lookup
        result = checkout_tool.start_checkout(
            "Bây giờ tiến hành đặt hàng",
            history=history,
            shop_context={"guest_session_id": "guest_progression_demo"},
        )
    finally:
        checkout_tool.lookup_live_catalog = original_lookup

    assert result.get("needs_product_selection") is not True
    assert result.get("needs_guest_info") is True or result.get("needs_guest_session") is False
    assert "Mình có thể tạo đơn cho khách" in result["message"]

    console.print("[green]✓[/] Checkout progression beats stale catalog history.")
    console.print("\n[bold green]✓ Level 1l (Checkout Progression Routing) hoàn thành[/]\n")


# ══════════════════════════════════════════════════════
# LEVEL 2 — LangGraph Full Pipeline (cần Groq API key)
# ══════════════════════════════════════════════════════

async def test_pipeline_async(question: str, label: str):
    """Chạy một câu hỏi qua toàn bộ LangGraph pipeline."""
    from agents.graph import run_streaming

    console.print(f"\n[bold cyan]▶ {label}[/]")
    console.print(f"  [dim]Input:[/] {question}")

    tokens_received = []

    async def stream_cb(chunk: str):
        tokens_received.append(chunk)
        console.print(chunk, end="", markup=False)

    t0 = time.time()
    state = await run_streaming(
        question=question,
        history=[],
        session_id="test-session",
        stream_callback=stream_cb,
    )
    elapsed = int((time.time() - t0) * 1000)

    console.print()  # newline after streaming

    # Print trace summary
    trace = state.get("agent_trace", {})
    order_id = state.get("order_id", "")
    order_info = state.get("order_info", {})
    actions = state.get("suggested_actions", [])

    table = Table(box=box.MINIMAL, show_header=False, padding=(0, 1))
    table.add_column("Key", style="dim", width=22)
    table.add_column("Value", style="white")

    table.add_row("Intent",         trace.get("router_decision", "—"))
    table.add_row("Order ID",       order_id or "—  (không có trong tin nhắn)")
    table.add_row("Order Found",    "✅ Có" if order_info.get("found") else ("⚠️  Không tìm thấy" if order_id else "—"))
    table.add_row("Order Status",   order_info.get("status", "—"))
    table.add_row("Sentiment",      trace.get("sentiment_detected", "—"))
    table.add_row("RAG docs",       str(trace.get("retrieved_count", 0)))
    table.add_row("Actions",        str(actions) if actions else "—")
    table.add_row("Processing",     f"{elapsed}ms")

    console.print(table)


def test_pipeline():
    console.print(Panel.fit(
        "[bold yellow]LEVEL 2 — LangGraph Full Pipeline Test[/]\n"
        "[dim]Cần: FEATHERLESS_API_KEY trong .env | Qdrant optional (RAG có thể trả về rỗng)[/]",
        border_style="yellow"
    ))

    from config import FEATHERLESS_API_KEY, FEATHERLESS_API_KEYS
    if not FEATHERLESS_API_KEY and not FEATHERLESS_API_KEYS:
        console.print("[red]✗ FEATHERLESS_API_KEY / FEATHERLESS_API_KEYS chưa được set trong .env — bỏ qua Level 2[/]")
        return

    test_cases = [
        (
            "đơn MK002 của tôi bị giao sai sản phẩm, tôi muốn đổi trả",
            "COMPLAINT có mã đơn (delivered 24h — trong hạn đổi trả)"
        ),
        (
            "đơn hàng MK003 giao rồi nhưng bị hỏng, tôi muốn hoàn tiền!",
            "COMPLAINT có mã đơn (delivered 120h — QUÁ hạn đổi trả)"
        ),
        (
            "tôi đặt đơn MK007 nhưng chưa thấy giao hàng, giao trễ thế?",
            "COMPLAINT đơn đang shipping (bị delay)"
        ),
        (
            "đơn hàng không thấy đơn đâu, bực quá, tôi muốn hủy",
            "COMPLAINT KHÔNG có mã đơn (chỉ có sentiment)"
        ),
        (
            "chính sách đổi trả của MyKingdom là bao nhiêu ngày?",
            "INQUIRY không có mã đơn"
        ),
    ]

    loop = asyncio.new_event_loop()
    for question, label in test_cases:
        try:
            loop.run_until_complete(test_pipeline_async(question, label))
        except Exception as e:
            console.print(f"  [red]✗ Lỗi: {e}[/]")
        console.print("[dim]" + "─" * 60 + "[/]")

    loop.close()
    console.print("\n[bold green]✓ Level 2 hoàn thành[/]\n")


# ══════════════════════════════════════════════════════
# LEVEL 3 — Full Stack Integration Test (Rust + Kafka + Python)
# ══════════════════════════════════════════════════════

L3_WS_URL = "ws://127.0.0.1:8085/ws/chat"
L3_HTTP_URL = "http://127.0.0.1:8085"
L3_TIMEOUT = 180  # Groq có thể chậm đến 30s+

L3_TEST_CASES = [
    # --- Còn lỗi từ lần trước ---
    {
        "label": "[FIX] MK012 refund completed — KHÔNG tạo ticket mới, chỉ thông báo đã hoàn tất",
        "question": "đơn MK012 của tôi hoàn tiền tới đâu rồi?",
        "expect_order_id": "MK012",
    },
    {
        "label": "[FIX] MK015 giao thất bại 2 lần — Router phải COMPLAINT, KHÔNG INQUIRY",
        "question": "đơn MK015 của tôi bị giao thất bại 2 lần rồi, giờ tôi phải làm sao?",
        "expect_order_id": "MK015",
    },
    # --- New edge cases MK007, MK001, MK013 ---
    {
        "label": "[NEW] MK007 shipping delayed — đổi địa chỉ giao hàng mới",
        "question": "đơn MK007 của tôi giao đến địa chỉ mới là 123 Nguyễn Trãi Q.1 nhé",
        "expect_order_id": "MK007",
    },
    {
        "label": "[NEW] MK001 shipping — khách yêu cầu hủy khi đang giao (phải bị từ chối)",
        "question": "đơn MK001 của tôi sao lâu vậy, hủy giúp tôi đi",
        "expect_order_id": "MK001",
    },
    {
        "label": "[NEW] MK013 processing — đổi địa chỉ trước khi bàn giao vận chuyển",
        "question": "đơn MK013 giao nhầm địa chỉ rồi, đổi cho tôi sang 200 Lê Lợi Q.1 nhé",
        "expect_order_id": "MK013",
    },
]


async def _ws_send_receive(question: str, timeout: int = L3_TIMEOUT) -> dict:
    """Gửi 1 message qua WebSocket, đợi streaming tokens + final response."""
    try:
        import websockets
    except ImportError:
        return {"error": "websockets chưa cài. Chạy: pip install websockets"}

    import json
    import uuid

    session_id = f"l3-test-{uuid.uuid4().hex[:8]}"
    payload = json.dumps({"question": question, "session_id": session_id, "history": []})

    token_count = 0
    final = None
    t0 = time.time()
    try:
        async with websockets.connect(L3_WS_URL, open_timeout=10, ping_interval=None, ping_timeout=None) as ws:
            await ws.send(payload)
            async for raw in ws:
                try:
                    msg = json.loads(raw)
                except Exception:
                    continue
                msg_type = msg.get("msg_type") or msg.get("type", "")
                if msg_type == "stream":
                    token_count += 1
                elif msg_type == "answer":
                    final = msg
                    break
                elif msg_type == "status":
                    continue
                if time.time() - t0 > timeout:
                    return {"error": f"Timeout sau {timeout}s"}
    except Exception as e:
        return {"error": str(e)}

    elapsed = int((time.time() - t0) * 1000)
    trace = (final.get("agent_trace") or {}) if final else {}
    return {
        "answer": final.get("answer", "") if final else "",
        "order_id": final.get("order_id", "") if final else "",
        "sentiment": final.get("sentiment", "") if final else "",
        "rag_docs": len(final.get("sources", [])) if final else 0,
        "from_cache": trace.get("from_cache", False),
        "token_chunks": token_count,
        "elapsed_ms": elapsed,
        "ok": final is not None,
    }


def test_full_stack():
    """L3: Kiểm tra toàn bộ stack qua WebSocket."""
    console.print(Panel.fit(
        "[bold magenta]LEVEL 3 — Full Stack Integration Test[/]\n"
        "[dim]Rust WebSocket → Kafka → Python LangGraph → Kafka → WebSocket streaming[/]\n"
        "[dim]Cần: cargo run (rust_backend) + python -m kafka_workers.query_worker[/]",
        border_style="magenta"
    ))

    # Pre-check: Rust backend health
    console.print("\n[bold]Pre-check[/] — Rust backend health...")
    try:
        import urllib.request
        with urllib.request.urlopen(f"{L3_HTTP_URL}/health", timeout=5) as r:
            console.print(f"  [green]OK[/] {L3_HTTP_URL}/health -> HTTP {r.status}")
    except Exception as e:
        console.print(f"  [red]x Rust backend chưa chạy: {e}[/]")
        console.print(f"  [dim]Mở terminal mới: cd rust_backend && cargo run[/]")
        console.print("[yellow]L3 bỏ qua.[/]\n")
        return

    # Pre-check: websockets package
    try:
        import websockets  # noqa
    except ImportError:
        console.print("  [red]x websockets chưa cài — pip install websockets[/]")
        return

    console.print(f"[dim]  WS: {L3_WS_URL} | timeout: {L3_TIMEOUT}s/câu[/]\n")

    passed = 0
    failed = 0
    loop = asyncio.get_event_loop()

    for tc in L3_TEST_CASES:
        console.print(f"[bold cyan]> {tc['label']}[/]")
        console.print(f"  [dim]Input:[/] {tc['question']}")

        result = loop.run_until_complete(_ws_send_receive(tc["question"]))

        if "error" in result:
            console.print(f"  [red]x Lỗi: {result['error']}[/]")
            failed += 1
            console.print("-" * 60 + "\n")
            continue

        issues = []
        if not result["answer"]:
            issues.append("answer rỗng")
        if tc["expect_order_id"] and result["order_id"] != tc["expect_order_id"]:
            issues.append(f"order_id expect {tc['expect_order_id']}, got '{result['order_id']}'")
        if not result["ok"]:
            issues.append("không có is_final=True")

        t = Table(box=box.SIMPLE, show_header=False, padding=(0, 2))
        t.add_column(style="dim", width=18)
        t.add_column()
        t.add_row("Order ID", result["order_id"] or "—")
        t.add_row("Sentiment", result["sentiment"] or "—")
        t.add_row("RAG docs", str(result["rag_docs"]))
        t.add_row("Stream tokens", str(result["token_chunks"]))
        t.add_row("From cache", "Yes" if result["from_cache"] else "No")
        t.add_row("Processing", f"{result['elapsed_ms']}ms")
        ans = result["answer"]
        t.add_row("Answer (100)", ans[:100] + "..." if len(ans) > 100 else ans)
        console.print(t)

        if not issues:
            console.print("  [bold green]PASS[/]")
            passed += 1
        else:
            console.print(f"  [bold red]FAIL: {', '.join(issues)}[/]")
            failed += 1
        console.print("-" * 60 + "\n")

    total = passed + failed
    if failed == 0:
        console.print(f"[bold green]Level 3 hoan thanh — {passed}/{total} PASS[/]\n")
    else:
        console.print(f"[bold yellow]Level 3 — {passed}/{total} PASS, {failed} FAIL[/]\n")


def print_full_stack_guide():
    console.print(Panel.fit(
        "[bold magenta]LEVEL 3 — Full Stack (Docker + Rust + Frontend)[/]",
        border_style="magenta"
    ))

    guide = """
[bold]Bước 1[/] — Khởi động hạ tầng:
  [cyan]docker-compose up -d qdrant redpanda[/]

[bold]Bước 2[/] — Index dữ liệu chính sách vào Qdrant (1 lần):
  [cyan]cd python && python -c "from retrieval.qdrant_client import QdrantWrapper; QdrantWrapper()"[/]

[bold]Bước 3[/] — Chạy Python Kafka worker:
  [cyan]cd python && python -m kafka_workers.query_worker[/]

[bold]Bước 4[/] — Chạy Rust WebSocket gateway:
  [cyan]cd rust_backend && cargo run[/]

[bold]Bước 5[/] — Mở browser:
  [cyan]http://localhost:8080[/]

[bold]Câu test nhanh trên UI:[/]
  • "đơn MK002 của tôi bị giao sai sản phẩm, muốn đổi trả ngay"
  • "đơn MK003 bị hỏng, tôi muốn hoàn tiền gấp!"
  • "đơn MK007 giao trễ quá, bực lắm rồi"
  • "chính sách bảo hành của MyKingdom như thế nào?"

[bold]Kiểm tra Agent Trace:[/]
  → Sau khi nhận phản hồi, bấm nút [Account Tree] để xem trace
  → Trace sẽ hiển thị bước [bold]Order Lookup[/] với mã đơn + trạng thái đã tra cứu
"""
    console.print(guide)


# ══════════════════════════════════════════════════════
# MAIN
# ══════════════════════════════════════════════════════

if __name__ == "__main__":
    console.print(Panel(
        "[bold white]EmpathAI — Agentic Pipeline Test[/]\n"
        "[dim]Fine-tuned LLM + RAG + Order Lookup Tool[/]",
        border_style="white", padding=(0, 4)
    ))

    args = sys.argv[1:]
    run_l1 = "l2" not in args and "l3" not in args or "l1" in args
    run_l2 = "l2" in args or (not args)
    run_l3 = "l3" in args or (not args)

    if run_l1:
        test_order_tool()
        test_multi_turn_action()
        test_order_cache()
        test_permission_matrix()
        test_guest_checkout_extraction()
        test_checkout_redirects_catalog_recommendations()
        test_guest_checkout_memory_latch()
        test_order_followup_memory()
        test_budget_catalog_routing()
        test_budget_catalog_lookup_price_filter()
        test_catalog_keyword_fallback_search()
        test_purchase_request_adds_product_to_guest_cart()
        test_brand_voice_prompts()
        test_catalog_followup_memory()
        test_catalog_selection_line_followup()
        test_budget_purchase_requires_product_selection()
        test_checkout_progression_wins_over_catalog_history()

    if run_l2:
        test_pipeline()

    if run_l3:
        test_full_stack()
        print_full_stack_guide()
