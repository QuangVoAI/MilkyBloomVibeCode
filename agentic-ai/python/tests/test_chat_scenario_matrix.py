"""
Chat scenario matrix for the MilkyBloom agentic flow.

Run with pytest:
    pytest -q agentic-ai/python/tests/test_chat_scenario_matrix.py -s

Run directly to print a readable matrix:
    python agentic-ai/python/tests/test_chat_scenario_matrix.py
"""
from __future__ import annotations

import json
import asyncio
import sys
from dataclasses import dataclass
from pathlib import Path
from unittest.mock import patch

from rich.console import Console
from rich.table import Table

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from agents import graph  # noqa: E402
from agents import router  # noqa: E402
from tools import action_tool  # noqa: E402
from tools import checkout_tool  # noqa: E402

console = Console(force_terminal=True)


@dataclass
class ScenarioRow:
    case: str
    input: str
    expected: str
    got: str
    output: str
    passed: bool


def _short(value: object, width: int = 96) -> str:
    text = str(value or "").replace("\n", " ").strip()
    return text if len(text) <= width else text[: width - 3] + "..."


def _json(value: object, width: int = 160) -> str:
    text = json.dumps(value, ensure_ascii=False, sort_keys=True)
    return _short(text, width)


def _reset_state() -> None:
    graph._session_guest_checkout_profiles.clear()
    graph._session_order_profiles.clear()
    graph._session_catalog_profiles.clear()
    graph._session_pending_actions.clear()


def _make_state(
    *,
    question: str,
    session_id: str = "",
    history: list[dict] | None = None,
    shop_context: dict | None = None,
    intent: str = "INQUIRY",
    capability: str = "",
    capability_reason: str = "",
    order_info: dict | None = None,
    order_id: str = "",
    phone_number: str = "",
    email_address: str = "",
    action_result: dict | None = None,
    action_intent: dict | None = None,
    pending_action_intent: dict | None = None,
) -> dict:
    return {
        "session_id": session_id,
        "question": question,
        "history": history or [],
        "shop_context": shop_context or {},
        "intent": intent,
        "capability": capability,
        "capability_reason": capability_reason,
        "order_info": order_info or {},
        "order_id": order_id,
        "phone_number": phone_number,
        "email_address": email_address,
        "action_result": action_result or {},
        "action_intent": action_intent or {},
        "pending_action_intent": pending_action_intent or {},
        "agent_trace": {},
    }


FAKE_BUDGET_CATALOG = {
    "found": True,
    "query": "tôi muốn mua món hàng dưới 400 ngàn",
    "summary": (
        "Mình gợi ý nhanh cho bạn nè.\n"
        "Mình gợi ý vài món trong tầm 400.000đ:\n"
        "• Stardust Picnic Box - 159.000đ - 249.000đ\n"
        "• Moon Parade Capsule - 177.000đ - 267.000đ\n"
        "• Nova Sprout Figure - 189.000đ - 279.000đ"
    ),
    "products": [
        {
            "name": "Stardust Picnic Box",
            "slug": "stardust-picnic-box",
            "minPrice": 159000,
            "maxPrice": 249000,
            "totalStock": 40,
            "variants": [
                {"_id": "SPB-CLASSIC", "stockQuantity": 18, "price": 159000, "label": "Classic"},
                {"_id": "SPB-SHIMMER", "stockQuantity": 14, "price": 199000, "label": "Shimmer"},
                {"_id": "SPB-COLLECTOR", "stockQuantity": 8, "price": 249000, "label": "Collector"},
            ],
            "imageUrls": ["/placeholder-product.png"],
        },
        {
            "name": "Moon Parade Capsule",
            "slug": "moon-parade-capsule",
            "minPrice": 177000,
            "maxPrice": 267000,
            "totalStock": 43,
            "variants": [
                {"_id": "MPC-CLASSIC", "stockQuantity": 19, "price": 177000, "label": "Classic"},
                {"_id": "MPC-SHIMMER", "stockQuantity": 15, "price": 217000, "label": "Shimmer"},
                {"_id": "MPC-COLLECTOR", "stockQuantity": 9, "price": 267000, "label": "Collector"},
            ],
            "imageUrls": ["/placeholder-product.png"],
        },
        {
            "name": "Nova Sprout Figure",
            "slug": "nova-sprout-figure",
            "minPrice": 189000,
            "maxPrice": 279000,
            "totalStock": 22,
            "variants": [
                {"_id": "NSF-CLASSIC", "stockQuantity": 12, "price": 189000, "label": "Classic"},
                {"_id": "NSF-COLLECTOR", "stockQuantity": 10, "price": 279000, "label": "Collector"},
            ],
            "imageUrls": ["/placeholder-product.png"],
        },
    ],
}


def _fake_catalog_by_question(question: str, context: dict | None = None) -> dict:
    q = (question or "").strip().lower()
    if "stardust picnic box" in q:
        return {
            "found": True,
            "query": "Stardust Picnic Box",
            "summary": (
                "Mình vừa xem Stardust Picnic Box cho bạn rồi nè.\n"
                "Mình tìm thấy Stardust Picnic Box.\n"
                "- Giá: 159.000đ đến 249.000đ\n"
                "- Tồn kho tổng: 40"
            ),
            "products": [FAKE_BUDGET_CATALOG["products"][0]],
        }
    if "moon parade capsule" in q:
        return {
            "found": True,
            "query": "Moon Parade Capsule",
            "summary": (
                "Mình vừa xem Moon Parade Capsule cho bạn rồi nè.\n"
                "Mình tìm thấy Moon Parade Capsule.\n"
                "- Giá: 177.000đ đến 267.000đ\n"
                "- Tồn kho tổng: 43"
            ),
            "products": [FAKE_BUDGET_CATALOG["products"][1]],
        }
    return FAKE_BUDGET_CATALOG


def _fake_order_info(order_id: str, context: dict | None = None) -> dict:
    return {
        "found": True,
        "ownership_verified": True,
        "order_id": order_id,
        "status": "shipping" if order_id == "MK099" else "processing",
        "address": "12 Lê Lợi, Quận 1",
        "summary": f"Đơn {order_id} đang được xử lý",
        "lookup_hints": ["email đặt hàng", "mã truy cập"],
        "suggested_actions": ["check_order_status"],
        "raw": {},
    }


def _fake_order_info_by_phone(phone: str, context: dict | None = None) -> dict:
    return {
        "found": True,
        "ownership_verified": True,
        "order_id": "MK101",
        "status": "processing",
        "address": "99 Hai Bà Trưng, Quận 3",
        "summary": f"Tìm thấy đơn MK101 từ số {phone}",
        "lookup_hints": ["phone"],
        "suggested_actions": ["check_order_status"],
        "raw": {},
    }


def _fake_loyalty_config(context: dict | None = None) -> dict:
    return {
        "success": True,
        "data": {
            "coinRate": 10000,
            "tiers": [
                {"name": "Silver", "minSpent": 1000000, "coinMultiplier": 1.0, "shippingDiscount": 5},
                {"name": "Gold", "minSpent": 3000000, "coinMultiplier": 1.5, "shippingDiscount": 10},
            ],
        },
    }


def _fake_my_loyalty(context: dict | None = None) -> dict:
    return {
        "success": True,
        "data": {
            "loyaltyRank": "gold",
            "loyaltyPoints": 1234,
            "lifetimeSpent": 9999000,
            "spentLast12Months": 1200000,
        },
    }


def _fake_support_ticket(payload: dict, context: dict | None = None) -> dict:
    return {
        "success": True,
        "ticketNumber": "TKT-001",
        "ticketId": "ticket_001",
        "data": {"ticketNumber": "TKT-001", "_id": "ticket_001"},
    }


def _fake_guest_checkout(payload: dict, context: dict | None = None) -> dict:
    return {
        "success": True,
        "message": "guest checkout ok",
        "data": {"_id": "ORDER-GUEST-001", "orderId": "ORDER-GUEST-001"},
    }


def _fake_checkout_from_cart(payload: dict, context: dict | None = None) -> dict:
    return {
        "success": True,
        "message": "checkout ok",
        "orderId": "ORDER-LI-001",
        "data": {"_id": "ORDER-LI-001", "id": "ORDER-LI-001"},
    }


def _zero_semantic_scores(question: str) -> dict[str, float]:
    return {
        "update_address": 0.0,
        "cancel_order": 0.0,
        "request_refund": 0.0,
        "process_return": 0.0,
        "create_ticket": 0.0,
        "check_order_status": 0.0,
    }


def _format_result_excerpt(result: object) -> str:
    if isinstance(result, dict):
        for key in ("answer", "summary", "message"):
            if result.get(key):
                return _short(result[key])
        return _json(result, 180)
    return _short(result)


def _scenario_guest_policy() -> ScenarioRow:
    auth = graph._build_auth_profile({})
    capability, reason = graph._infer_capability("chính sách đổi trả của shop là gì?", [], "INQUIRY", auth)
    passed = capability == "inquiry" and auth.get("user_scope") == "guest"
    return ScenarioRow(
        case="Guest policy",
        input="chính sách đổi trả của shop là gì?",
        expected="capability=inquiry, scope=guest",
        got=f"capability={capability}, scope={auth.get('user_scope')}",
        output=f"reason={reason}",
        passed=passed,
    )


def _scenario_budget_catalog() -> ScenarioRow:
    session_id = "matrix_budget_catalog"
    _reset_state()
    with patch.object(graph, "lookup_live_catalog", side_effect=_fake_catalog_by_question):
        result = graph.catalog_lookup_node(
            _make_state(
                question="Gợi ý cho tôi món đồ dưới 400k",
                session_id=session_id,
            )
        )
    passed = result["catalog_info"]["found"] is True and "Mình gợi ý nhanh cho bạn nè." in result["answer"]
    first = result["catalog_info"]["products"][0]["name"]
    return ScenarioRow(
        case="Budget catalog",
        input="Gợi ý cho tôi món đồ dưới 400k",
        expected="catalog list with 3 products",
        got=f"found={result['catalog_info']['found']}, products={len(result['catalog_info']['products'])}",
        output=f"first={first} | {_short(result['answer'])}",
        passed=passed,
    )


def _scenario_catalog_selection() -> ScenarioRow:
    session_id = "matrix_catalog_selection"
    _reset_state()
    graph._remember_catalog_profile(
        session_id,
        {
            "found": True,
            "query": "Gợi ý cho tôi món đồ dưới 300k",
            "summary": "Mình gợi ý vài món dưới 300k.",
            "products": FAKE_BUDGET_CATALOG["products"],
        },
        "Gợi ý cho tôi món đồ dưới 300k",
    )
    captured: dict[str, str] = {}

    def fake_lookup(question: str, context: dict | None = None) -> dict:
        captured["question"] = question
        return _fake_catalog_by_question(question, context)

    with patch.object(graph, "lookup_live_catalog", side_effect=fake_lookup):
        result = graph.catalog_lookup_node(
            _make_state(
                question="• Stardust Picnic Box - 159.000đ - 249.000đ",
                session_id=session_id,
            )
        )
    graph._clear_catalog_profile(session_id)
    passed = captured.get("question") == "Stardust Picnic Box" and "Stardust Picnic Box" in result["answer"]
    return ScenarioRow(
        case="Catalog selection",
        input="• Stardust Picnic Box - 159.000đ - 249.000đ",
        expected="lookup question=Stardust Picnic Box",
        got=f"lookup question={captured.get('question')}",
        output=_short(result["answer"]),
        passed=passed,
    )


def _scenario_budget_purchase_requires_selection() -> ScenarioRow:
    _reset_state()
    with patch.object(checkout_tool, "lookup_live_catalog", side_effect=_fake_catalog_by_question):
        result = checkout_tool.start_checkout(
            "tôi muốn mua món hàng dưới 200k",
            history=[],
            shop_context={"guest_session_id": "guest_matrix_budget"},
        )
    passed = result.get("needs_product_selection") is True and result.get("redirect_intent") == "catalog"
    return ScenarioRow(
        case="Budget buy",
        input="tôi muốn mua món hàng dưới 200k",
        expected="needs_product_selection=True",
        got=f"needs_product_selection={result.get('needs_product_selection')}",
        output=_short(result["message"]),
        passed=passed,
    )


def _scenario_concrete_purchase_to_cart() -> ScenarioRow:
    _reset_state()
    captured: dict[str, object] = {}

    def fake_lookup(question: str, context: dict | None = None) -> dict:
        captured["lookup_question"] = question
        return {
            "found": True,
            "products": [
                {
                    "name": "Stardust Picnic Box",
                    "slug": "stardust-picnic-box",
                    "variants": [{"_id": "VARIANT_1", "stockQuantity": 5, "price": 159000}],
                }
            ],
            "summary": "found",
        }

    def fake_get_cart(session_id: str, context: dict | None = None) -> dict:
        return {"_id": "CART_1", "items": []}

    def fake_add_item(cart_id: str, variant_id: str, quantity: int = 1, context: dict | None = None) -> dict:
        captured["add_item"] = (cart_id, variant_id, quantity)
        return {"_id": cart_id, "items": [{"variantId": variant_id, "quantity": quantity}]}

    with patch.object(checkout_tool, "lookup_live_catalog", side_effect=fake_lookup), \
        patch.object(checkout_tool, "get_cart_by_session", side_effect=fake_get_cart), \
        patch.object(checkout_tool, "create_cart", return_value={"_id": "CART_CREATED", "items": []}), \
        patch.object(checkout_tool, "add_item_to_cart", side_effect=fake_add_item):
        result = checkout_tool.start_checkout(
            "Mua Stardust Picnic Box giúp tôi",
            history=[],
            shop_context={"guest_session_id": "guest_matrix_purchase"},
        )

    passed = (
        captured.get("lookup_question") == "Stardust Picnic Box"
        and captured.get("add_item") == ("CART_1", "VARIANT_1", 1)
        and result.get("needs_guest_info") is True
    )
    return ScenarioRow(
        case="Concrete purchase",
        input="Mua Stardust Picnic Box giúp tôi",
        expected="added to cart, then ask guest info",
        got=f"add_item={captured.get('add_item')}, needs_guest_info={result.get('needs_guest_info')}",
        output=_short(result["message"]),
        passed=passed,
    )


def _scenario_guest_checkout_latch() -> ScenarioRow:
    session_id = "matrix_guest_latch"
    _reset_state()
    with patch.object(checkout_tool, "guest_checkout_from_cart", side_effect=_fake_guest_checkout):
        for turn in (
            "mình tên Hoàng Minh",
            "email hoangminh.test@gmail.com",
            "sđt 0901234567",
            "địa chỉ 12 Lê Lợi, phường Bến Thành, quận 1, TP.HCM",
        ):
            graph.route_by_intent(
                _make_state(
                    question=turn,
                    session_id=session_id,
                )
            )

        result = graph.checkout_node(
            _make_state(
                question="Bây giờ tiến hành đặt hàng",
                session_id=session_id,
                shop_context={"guest_session_id": session_id},
            )
        )

    guest_info = result["checkout_result"].get("guest_info") or {}
    passed = result["checkout_result"]["ok"] is True and guest_info.get("fullName") == "Hoàng Minh"
    return ScenarioRow(
        case="Guest latch",
        input="4 tin nhắn tách info",
        expected="ok=True, guestInfo assembled",
        got=f"ok={result['checkout_result']['ok']}, fullName={guest_info.get('fullName')}",
        output=_short(result["answer"]),
        passed=passed,
    )


def _scenario_checkout_progression() -> ScenarioRow:
    _reset_state()
    route = graph.route_by_intent(
        _make_state(
            question="Bây giờ tiến hành đặt hàng",
            history=[
                {"role": "assistant", "content": "Mình gợi ý vài món trong tầm 400.000đ:"},
                {"role": "assistant", "content": "Mình đã thêm Stardust Picnic Box vào giỏ rồi nè."},
                {"role": "assistant", "content": "Mình đã thêm Candy Orbit Surprise vào giỏ rồi nè."},
            ],
            session_id="matrix_checkout_progression",
            shop_context={"guest_session_id": "guest_progression_demo"},
        )
    )
    passed = route == "checkout"
    return ScenarioRow(
        case="Checkout progression",
        input="Bây giờ tiến hành đặt hàng",
        expected="route=checkout",
        got=f"route={route}",
        output="explicit checkout wins over catalog history",
        passed=passed,
    )


def _scenario_logged_in_checkout() -> ScenarioRow:
    _reset_state()
    captured: dict[str, object] = {}

    def fake_lookup(question: str, context: dict | None = None) -> dict:
        captured["lookup_question"] = question
        return {
            "found": True,
            "products": [
                {
                    "name": "Moon Parade Capsule",
                    "slug": "moon-parade-capsule",
                    "variants": [{"_id": "MPC-CLASSIC", "stockQuantity": 12, "price": 177000}],
                }
            ],
            "summary": "found",
        }

    def fake_get_cart(user_id: str, context: dict | None = None) -> dict:
        return {"_id": "CART_USER_1", "items": []}

    def fake_default_address(user_id: str, context: dict | None = None) -> dict:
        return {"success": True, "data": {"_id": "ADDR_1", "addressLine": "12 Lê Lợi"}}

    with patch.object(checkout_tool, "lookup_live_catalog", side_effect=fake_lookup), \
        patch.object(checkout_tool, "get_cart_by_user", side_effect=fake_get_cart), \
        patch.object(checkout_tool, "create_cart", return_value={"_id": "CART_CREATED", "items": []}), \
        patch.object(checkout_tool, "add_item_to_cart", return_value={"success": True}), \
        patch.object(checkout_tool, "get_default_address", side_effect=fake_default_address), \
        patch.object(checkout_tool, "checkout_from_cart", side_effect=_fake_checkout_from_cart):
        result = checkout_tool.start_checkout(
            "Mua Moon Parade Capsule giúp mình",
            history=[],
            shop_context={"user_id": "u_1", "auth_token": "token_123"},
        )

    passed = result.get("ok") is True and result.get("result", {}).get("orderId") == "ORDER-LI-001"
    return ScenarioRow(
        case="Logged-in checkout",
        input="Mua Moon Parade Capsule giúp mình",
        expected="ok=True, orderId=ORDER-LI-001",
        got=f"ok={result.get('ok')}, orderId={result.get('result', {}).get('orderId')}",
        output=_short(result["message"]),
        passed=passed,
    )


def _scenario_order_lookup_by_id() -> ScenarioRow:
    _reset_state()
    with patch.object(graph, "get_order_info", side_effect=_fake_order_info):
        result = graph.order_lookup_node(
            _make_state(
                question="tra đơn MK099 giúp mình",
                session_id="matrix_order_lookup",
            )
        )
    passed = result["order_info"].get("status") == "shipping" and result["order_id"] == "MK099"
    return ScenarioRow(
        case="Order lookup",
        input="tra đơn MK099 giúp mình",
        expected="order_id=MK099, status=shipping",
        got=f"order_id={result['order_id']}, status={result['order_info'].get('status')}",
        output=_short(result["order_info"].get("summary")),
        passed=passed,
    )


def _scenario_order_lookup_by_object_id() -> ScenarioRow:
    _reset_state()
    order_id = "6a05f2a94079aa69c576225b"
    with patch.object(graph, "get_order_info", side_effect=_fake_order_info):
        result = graph.order_lookup_node(
            _make_state(
                question=f"Ki\u1ec3m tra gi\u00fap m\u00ecnh \u0111\u01a1n h\u00e0ng {order_id}",
                session_id="matrix_object_id_lookup",
                shop_context={"auth_token": "token_123", "user_id": "u_1"},
            )
        )
    passed = result["order_id"] == order_id and result["order_info"].get("found") is True
    return ScenarioRow(
        case="Order ObjectId lookup",
        input=f"\u0111\u01a1n h\u00e0ng {order_id}",
        expected="extract 24-hex order id",
        got=f"order_id={result['order_id']}",
        output=_short(result["order_info"].get("summary")),
        passed=passed,
    )


def _scenario_order_lookup_by_phone() -> ScenarioRow:
    _reset_state()
    with patch.object(graph, "get_order_info_by_phone", side_effect=_fake_order_info_by_phone):
        result = graph.order_lookup_node(
            _make_state(
                question="số điện thoại 0901234567",
                session_id="matrix_order_lookup_phone",
            )
        )
    passed = result["order_info"].get("order_id") == "MK101" and result["phone_number"] == "0901234567"
    return ScenarioRow(
        case="Order by phone",
        input="số điện thoại 0901234567",
        expected="order_id=MK101",
        got=f"order_id={result['order_info'].get('order_id')}, phone={result['phone_number']}",
        output=_short(result["order_info"].get("summary")),
        passed=passed,
    )


def _scenario_order_followup_route() -> ScenarioRow:
    _reset_state()
    graph._remember_order_profile(
        "matrix_order_followup",
        {
            "found": True,
            "ownership_verified": True,
            "order_id": "MK099",
            "status": "shipping",
            "address": "12 Lê Lợi, Quận 1",
            "summary": "Đơn MK099 đang được xử lý",
            "lookup_hints": ["email đặt hàng"],
        },
        "đã tra đơn MK099 rồi",
    )
    route = graph.route_by_intent(
        _make_state(
            question="đổi địa chỉ cho mình",
            session_id="matrix_order_followup",
        )
    )
    passed = route == "complaint"
    return ScenarioRow(
        case="Order follow-up",
        input="đổi địa chỉ cho mình",
        expected="route=complaint",
        got=f"route={route}",
        output="cached order memory forces complaint path",
        passed=passed,
    )


def _scenario_email_identifier_override_catalog() -> ScenarioRow:
    _reset_state()
    session_id = "matrix_email_identifier_override_catalog"
    graph._remember_catalog_profile(
        session_id,
        {
            "found": True,
            "query": "Gợi ý cho tôi món đồ dưới 400k",
            "summary": "Mình gợi ý vài món trong tầm 400.000đ.",
            "products": FAKE_BUDGET_CATALOG["products"],
        },
        "Gợi ý cho tôi món đồ dưới 400k",
    )
    route = graph.route_by_intent(
        _make_state(
            question="vxq123@icloud.com",
            session_id=session_id,
            intent="INQUIRY",
        )
    )
    passed = route == "complaint"
    return ScenarioRow(
        case="Email identifier override",
        input="vxq123@icloud.com",
        expected="route=complaint, not catalog",
        got=f"route={route}",
        output="email identifier should win over catalog memory",
        passed=passed,
    )


def _scenario_return_policy_question() -> ScenarioRow:
    _reset_state()
    auth = graph._build_auth_profile({})
    intent = router.classify("cho tôi biết chính xác đổi trả hàng")
    capability, reason = graph._infer_capability(
        "cho tôi biết chính xác đổi trả hàng",
        [],
        "INQUIRY",
        auth,
    )
    route = graph.route_by_intent(
        _make_state(
            question="cho tôi biết chính xác đổi trả hàng",
            session_id="matrix_return_policy",
            intent=intent,
            capability=capability,
        )
    )
    passed = intent == "INQUIRY" and capability == "inquiry" and route == "inquiry"
    return ScenarioRow(
        case="Return policy inquiry",
        input="cho tôi biết chính xác đổi trả hàng",
        expected="capability=inquiry, route=inquiry",
        got=f"intent={intent}, capability={capability}, route={route}",
        output=reason,
        passed=passed,
    )


def _scenario_cancel_policy_question() -> ScenarioRow:
    _reset_state()
    auth = graph._build_auth_profile({})
    question = "M\u00ecnh mu\u1ed1n h\u1ecfi v\u1ec1 c\u00e1ch h\u1ee7y \u0111\u01a1n h\u00e0ng?"
    history = [
        {"role": "user", "content": "G\u1ee3i \u00fd cho t\u00f4i m\u00f3n \u0111\u1ed3 d\u01b0\u1edbi 400k"},
        {"role": "assistant", "content": "M\u00ecnh g\u1ee3i \u00fd v\u00e0i m\u00f3n trong t\u1ea7m 400.000\u0111."},
    ]
    capability, reason = graph._infer_capability(
        question,
        history,
        "COMPLAINT",
        auth,
    )
    route = graph.route_by_intent(
        _make_state(
            question=question,
            history=history,
            session_id="matrix_cancel_policy",
            intent="COMPLAINT",
            capability=capability,
        )
    )
    passed = capability == "inquiry" and reason == "cancel_policy_question" and route == "inquiry"
    return ScenarioRow(
        case="Cancel policy inquiry",
        input=question,
        expected="capability=inquiry, route=inquiry",
        got=f"capability={capability}, route={route}",
        output=reason,
        passed=passed,
    )


def _scenario_new_question_ignores_policy_history() -> ScenarioRow:
    _reset_state()
    auth = graph._build_auth_profile({})
    question = "Shop c\u00f3 khuy\u1ebfn m\u00e3i g\u00ec kh\u00f4ng?"
    history = [
        {"role": "user", "content": "M\u00ecnh mu\u1ed1n h\u1ecfi v\u1ec1 ch\u00ednh s\u00e1ch \u0111\u1ed5i tr\u1ea3"},
        {"role": "assistant", "content": "Ch\u00ednh s\u00e1ch \u0111\u1ed5i tr\u1ea3 c\u1ee7a MilkyBloom n\u00e8..."},
    ]
    capability, reason = graph._infer_capability(question, history, "INQUIRY", auth)
    passed = capability == "inquiry" and reason == "inquiry_intent"
    return ScenarioRow(
        case="Fresh inquiry wins",
        input=question,
        expected="reason=inquiry_intent",
        got=f"capability={capability}, reason={reason}",
        output="old return-policy history should not hardcode the next answer",
        passed=passed,
    )


def _scenario_order_lookup_ignores_stale_history() -> ScenarioRow:
    _reset_state()
    result = graph.order_lookup_node(
        _make_state(
            question="Shop c\u00f3 khuy\u1ebfn m\u00e3i g\u00ec kh\u00f4ng?",
            history=[
                {"role": "user", "content": "Ki\u1ec3m tra gi\u00fap m\u00ecnh \u0111\u01a1n MK099"},
                {"role": "assistant", "content": "\u0110\u01a1n MK099 \u0111ang v\u1eadn chuy\u1ec3n."},
            ],
            session_id="matrix_stale_order_history",
        )
    )
    passed = result["order_id"] == "" and result["order_info"] == {}
    return ScenarioRow(
        case="Stale order ignored",
        input="Shop c\u00f3 khuy\u1ebfn m\u00e3i g\u00ec kh\u00f4ng?",
        expected="no order lookup from history",
        got=f"order_id={result['order_id']}, order_info={bool(result['order_info'])}",
        output="current message has no order identifier",
        passed=passed,
    )


def _scenario_return_request_generic() -> ScenarioRow:
    _reset_state()
    auth = graph._build_auth_profile({})
    intent = router.classify("mình muốn đổi trả hàng")
    capability, reason = graph._infer_capability(
        "mình muốn đổi trả hàng",
        [],
        intent,
        auth,
    )
    route = graph.route_by_intent(
        _make_state(
            question="mình muốn đổi trả hàng",
            session_id="matrix_return_request",
            intent=intent,
            capability=capability,
        )
    )
    passed = intent == "INQUIRY" and capability == "order_management" and route == "complaint"
    return ScenarioRow(
        case="Return request",
        input="mình muốn đổi trả hàng",
        expected="capability=order_management, route=complaint",
        got=f"intent={intent}, capability={capability}, route={route}",
        output=reason,
        passed=passed,
    )


def _scenario_return_policy_answer() -> ScenarioRow:
    _reset_state()

    async def run_case():
        return await graph.inquiry_writer_node(
            _make_state(
                question="cho tôi biết chính xác đổi trả hàng",
                session_id="matrix_return_policy_answer",
                intent="INQUIRY",
                capability="inquiry",
                capability_reason="return_policy_question",
                shop_context={},
            )
        )

    result = asyncio.run(run_case())
    passed = "Chính sách đổi trả của MilkyBloom" in result["answer"]
    return ScenarioRow(
        case="Return policy answer",
        input="cho tôi biết chính xác đổi trả hàng",
        expected="short policy summary",
        got=_short(result["answer"]),
        output=_short(result["answer"]),
        passed=passed,
    )


def _scenario_return_request_followup_answer() -> ScenarioRow:
    _reset_state()

    action_result = graph.action_executor_node(
        _make_state(
            question="mình muốn đổi trả hàng",
            session_id="matrix_return_request_answer",
            intent="COMPLAINT",
            capability="order_management",
            shop_context={},
        )
    )
    passed = (
        action_result["action_result"].get("needs_order_id") is True
        and "mã đơn hoặc email đặt hàng" in action_result["action_result"].get("message", "").lower()
    )
    return ScenarioRow(
        case="Return request answer",
        input="mình muốn đổi trả hàng",
        expected="ask for order_id or email",
        got=_short(action_result["action_result"].get("message", "")),
        output=_short(action_result["action_result"].get("message", "")),
        passed=passed,
    )


def _scenario_return_request_email_followup() -> ScenarioRow:
    _reset_state()
    session_id = "matrix_return_email_followup"

    async def run_case():
        first = graph.action_executor_node(
            _make_state(
                question="mình muốn đổi trả hàng",
                session_id=session_id,
                intent="COMPLAINT",
                capability="order_management",
                shop_context={},
            )
        )

        def fake_get_order_info_by_email(email: str, context=None):
            return {
                "found": True,
                "ownership_verified": True,
                "order_id": "MK100",
                "status": "delivered",
                "return_eligible": True,
                "delivered_hours_ago": 24,
                "summary": "Đơn MK100 đã giao 24 giờ trước",
                "lookup_hints": [],
                "suggested_actions": ["process_return"],
                "raw": {},
            }

        with patch.object(graph, "get_order_info_by_email", side_effect=fake_get_order_info_by_email), \
            patch.object(graph, "execute_action", return_value={
                "success": True,
                "action": "process_return",
                "message": "Đã tạo yêu cầu đổi trả cho đơn **MK100**.",
                "ticket_id": "TKEMAIL1",
                "updated_fields": {"return_requested": True},
            }):
            lookup = graph.order_lookup_node(
                _make_state(
                    question="hoang.minh@example.com",
                    session_id=session_id,
                    shop_context={"allow_internal_lookup": True},
                )
            )
            second = graph.action_executor_node(
                _make_state(
                    question="hoang.minh@example.com",
                    session_id=session_id,
                    shop_context={},
                    order_info=lookup["order_info"],
                    pending_action_intent=lookup["pending_action_intent"],
                )
            )

        return first, lookup, second

    first, lookup, second = asyncio.run(run_case())
    passed = (
        first["action_result"].get("pending") is True
        and lookup["order_info"].get("found") is True
        and lookup["pending_action_intent"].get("action") == "process_return"
        and second["action_result"].get("success") is True
        and second["action_result"].get("action") == "process_return"
    )
    return ScenarioRow(
        case="Return email follow-up",
        input="mình muốn đổi trả hàng -> hoang.minh@example.com",
        expected="resume pending return and execute",
        got=f"lookup_order={lookup['order_info'].get('order_id')}, action={second['action_result'].get('action')}, success={second['action_result'].get('success')}",
        output=_short(second["action_result"].get("message", "")),
        passed=passed,
    )


def _run_email_resume_case(
    *,
    session_id: str,
    initial_question: str,
    email_question: str,
    lookup_order_info: dict,
    execute_result: dict,
) -> tuple[dict, dict, dict]:
    first = graph.action_executor_node(
        _make_state(
            question=initial_question,
            session_id=session_id,
            intent="COMPLAINT",
            capability="order_management",
            shop_context={},
        )
    )

    def fake_get_order_info_by_email(email: str, context=None):
        return lookup_order_info

    with patch.object(graph, "get_order_info_by_email", side_effect=fake_get_order_info_by_email), \
        patch.object(graph, "execute_action", return_value=execute_result):
        lookup = graph.order_lookup_node(
            _make_state(
                question=email_question,
                session_id=session_id,
                shop_context={"allow_internal_lookup": True},
            )
        )
        second = graph.action_executor_node(
            _make_state(
                question=email_question,
                session_id=session_id,
                shop_context={},
                order_info=lookup["order_info"],
                pending_action_intent=lookup["pending_action_intent"],
            )
        )

    return first, lookup, second


def _scenario_cancel_order_email_followup() -> ScenarioRow:
    _reset_state()
    first, lookup, second = _run_email_resume_case(
        session_id="matrix_cancel_email_followup",
        initial_question="hủy đơn giúp mình",
        email_question="hoang.minh@example.com",
        lookup_order_info={
            "found": True,
            "ownership_verified": True,
            "order_id": "MK200",
            "status": "processing",
            "return_eligible": False,
            "delivered_hours_ago": 0,
            "summary": "Đơn MK200 đang xử lý",
            "lookup_hints": [],
            "suggested_actions": ["cancel_order"],
            "raw": {},
        },
        execute_result={
            "success": True,
            "action": "cancel_order",
            "message": "Đã hủy đơn **MK200** thành công.",
            "ticket_id": "TKCANCEL1",
            "updated_fields": {"status": "cancelled"},
        },
    )

    passed = (
        first["action_result"].get("pending") is True
        and lookup["pending_action_intent"].get("action") == "cancel_order"
        and second["action_result"].get("success") is True
        and second["action_result"].get("action") == "cancel_order"
    )
    return ScenarioRow(
        case="Cancel email follow-up",
        input="hủy đơn giúp mình -> hoang.minh@example.com",
        expected="resume pending cancel and execute",
        got=f"lookup_order={lookup['order_info'].get('order_id')}, action={second['action_result'].get('action')}, success={second['action_result'].get('success')}",
        output=_short(second["action_result"].get("message", "")),
        passed=passed,
    )


def _scenario_refund_email_followup() -> ScenarioRow:
    _reset_state()
    first, lookup, second = _run_email_resume_case(
        session_id="matrix_refund_email_followup",
        initial_question="hoàn tiền giúp mình",
        email_question="hoang.minh@example.com",
        lookup_order_info={
            "found": True,
            "ownership_verified": True,
            "order_id": "MK201",
            "status": "delivered",
            "return_eligible": False,
            "delivered_hours_ago": 96,
            "summary": "Đơn MK201 đã giao",
            "lookup_hints": [],
            "suggested_actions": ["request_refund"],
            "raw": {},
        },
        execute_result={
            "success": True,
            "action": "request_refund",
            "message": "Đã tạo yêu cầu hoàn tiền cho đơn **MK201**.",
            "ticket_id": "TKREFUND1",
            "updated_fields": {"refund_status": "processing"},
        },
    )

    passed = (
        first["action_result"].get("pending") is True
        and lookup["pending_action_intent"].get("action") == "request_refund"
        and second["action_result"].get("success") is True
        and second["action_result"].get("action") == "request_refund"
    )
    return ScenarioRow(
        case="Refund email follow-up",
        input="hoàn tiền giúp mình -> hoang.minh@example.com",
        expected="resume pending refund and execute",
        got=f"lookup_order={lookup['order_info'].get('order_id')}, action={second['action_result'].get('action')}, success={second['action_result'].get('success')}",
        output=_short(second["action_result"].get("message", "")),
        passed=passed,
    )


def _scenario_update_address_email_followup() -> ScenarioRow:
    _reset_state()
    first, lookup, second = _run_email_resume_case(
        session_id="matrix_update_address_email_followup",
        initial_question="đổi địa chỉ giúp mình",
        email_question="hoang.minh@example.com địa chỉ mới là 123 Lê Lợi, Quận 1, TP.HCM",
        lookup_order_info={
            "found": True,
            "ownership_verified": True,
            "order_id": "MK202",
            "status": "processing",
            "return_eligible": False,
            "delivered_hours_ago": 0,
            "summary": "Đơn MK202 đang xử lý",
            "lookup_hints": [],
            "suggested_actions": ["update_address"],
            "raw": {},
        },
        execute_result={
            "success": True,
            "action": "update_address",
            "message": "Đã cập nhật địa chỉ giao hàng cho đơn **MK202**.",
            "ticket_id": "TKADDR1",
            "updated_fields": {"address": "123 Lê Lợi, Quận 1, TP.HCM", "old_address": "Địa chỉ cũ"},
        },
    )

    passed = (
        first["action_result"].get("pending") is True
        and lookup["pending_action_intent"].get("action") == "update_address"
        and second["action_intent"].get("new_address") == "123 Lê Lợi, Quận 1, TP.HCM"
        and second["action_result"].get("success") is True
        and second["action_result"].get("action") == "update_address"
    )
    return ScenarioRow(
        case="Address email follow-up",
        input="đổi địa chỉ giúp mình -> hoang.minh@example.com địa chỉ mới là 123 Lê Lợi, Quận 1, TP.HCM",
        expected="resume pending address update and extract new address",
        got=f"lookup_order={lookup['order_info'].get('order_id')}, action={second['action_result'].get('action')}, new_address={second['action_intent'].get('new_address')}",
        output=_short(second["action_result"].get("message", "")),
        passed=passed,
    )


def _scenario_update_address_pending_order() -> ScenarioRow:
    _reset_state()
    order_info = {
        "found": True,
        "ownership_verified": True,
        "order_id": "6a088f69cf41ac9ebe2dd68f",
        "status": "pending",
        "return_eligible": False,
        "delivered_hours_ago": 0,
        "summary": "Đơn 6a088f69cf41ac9ebe2dd68f đang chờ xử lý",
        "raw": {"addressId": {"_id": "ADDR_1"}},
    }
    execute_result = {
        "success": True,
        "action": "update_address",
        "message": "Đã cập nhật địa chỉ giao hàng thật cho đơn **6a088f69cf41ac9ebe2dd68f**.",
        "ticket_id": "ADDR_1",
        "updated_fields": {"address": "Đại học Tôn Đức Thắng"},
    }
    question = (
        'Đổi giúp mình địa chỉ đơn 6a088f69cf41ac9ebe2dd68f nha. '
        'Mình đặt nhầm á. Đổi qua "Đại học Tôn Đức Thắng" nha'
    )
    with patch.object(action_tool, "_semantic_score_map", side_effect=_zero_semantic_scores), \
        patch.object(graph, "execute_action", return_value=execute_result):
        result = graph.action_executor_node(
            _make_state(
                question=question,
                session_id="matrix_update_address_pending_order",
                intent="COMPLAINT",
                capability="order_management",
                shop_context={"user_scope": "logged_in", "ownership_verified": True},
                order_info=order_info,
                order_id="6a088f69cf41ac9ebe2dd68f",
            )
        )

    passed = (
        result["action_intent"].get("action") == "update_address"
        and result["action_intent"].get("new_address") == "Đại học Tôn Đức Thắng"
        and result["action_intent"].get("executable") is True
        and result["action_result"].get("success") is True
    )
    return ScenarioRow(
        case="Address update pending order",
        input='đổi địa chỉ đơn pending qua "Đại học Tôn Đức Thắng"',
        expected="extract address and execute for pending order",
        got=f"action={result['action_intent'].get('action')}, new_address={result['action_intent'].get('new_address')}, success={result['action_result'].get('success')}",
        output=_short(result["action_result"].get("message", "")),
        passed=passed,
    )


def _scenario_cancel_order() -> ScenarioRow:
    _reset_state()
    order_info = {
        "found": True,
        "order_id": "MK099",
        "status": "processing",
        "return_eligible": False,
        "delivered_hours_ago": 0,
        "raw": {},
    }
    with patch.object(action_tool, "_semantic_score_map", side_effect=_zero_semantic_scores):
        route = graph.route_by_intent(
            _make_state(
                question="hủy đơn MK099 giúp mình",
                session_id="matrix_cancel_order",
                intent="COMPLAINT",
                capability="order_management",
            )
        )
        action = action_tool.detect_action_intent("hủy đơn MK099 giúp mình", order_info)

    passed = route == "complaint" and action["action"] == "cancel_order" and action["executable"] is True
    return ScenarioRow(
        case="Cancel order",
        input="hủy đơn MK099 giúp mình",
        expected="route=complaint, action=cancel_order, executable=True",
        got=f"route={route}, action={action['action']}, executable={action['executable']}",
        output=_short(action.get("confidence", {}).get("decision_reason", "cancel order approved")),
        passed=passed,
    )


def _scenario_request_refund() -> ScenarioRow:
    _reset_state()
    order_info = {
        "found": True,
        "order_id": "MK100",
        "status": "delivered",
        "return_eligible": False,
        "delivered_hours_ago": 96,
        "raw": {"delivered_hours_ago": 96},
    }
    with patch.object(action_tool, "_semantic_score_map", side_effect=_zero_semantic_scores):
        route = graph.route_by_intent(
            _make_state(
                question="hoàn tiền đơn MK100 giúp mình",
                session_id="matrix_request_refund",
                intent="COMPLAINT",
                capability="order_management",
            )
        )
        action = action_tool.detect_action_intent("hoàn tiền đơn MK100 giúp mình", order_info)

    passed = route == "complaint" and action["action"] == "request_refund" and action["executable"] is False
    return ScenarioRow(
        case="Refund request",
        input="hoàn tiền đơn MK100 giúp mình",
        expected="route=complaint, action=request_refund, blocked by 72h",
        got=f"route={route}, action={action['action']}, executable={action['executable']}",
        output=_short(action.get("block_reason", "")),
        passed=passed,
    )


def _scenario_process_return() -> ScenarioRow:
    _reset_state()
    order_info = {
        "found": True,
        "order_id": "MK100",
        "status": "delivered",
        "return_eligible": True,
        "delivered_hours_ago": 24,
        "raw": {"delivered_hours_ago": 24},
    }
    with patch.object(action_tool, "_semantic_score_map", side_effect=_zero_semantic_scores):
        route = graph.route_by_intent(
            _make_state(
                question="đổi trả đơn MK100 giúp mình",
                session_id="matrix_process_return",
                intent="COMPLAINT",
                capability="order_management",
            )
        )
        action = action_tool.detect_action_intent("đổi trả đơn MK100 giúp mình", order_info)

    passed = route == "complaint" and action["action"] == "process_return" and action["executable"] is True
    return ScenarioRow(
        case="Return order",
        input="đổi trả đơn MK100 giúp mình",
        expected="route=complaint, action=process_return, executable=True",
        got=f"route={route}, action={action['action']}, executable={action['executable']}",
        output=_short(action.get("confidence", {}).get("decision_reason", "return approved")),
        passed=passed,
    )


def _scenario_loyalty_guest() -> ScenarioRow:
    _reset_state()
    with patch.object(graph, "get_loyalty_config", side_effect=_fake_loyalty_config):
        result = graph.loyalty_node(
            _make_state(
                question="loyalty của shop hoạt động thế nào?",
                session_id="matrix_loyalty_guest",
            )
        )
    passed = "Silver" in result["answer"] and "Quy đổi cơ bản" in result["answer"]
    return ScenarioRow(
        case="Loyalty guest",
        input="loyalty của shop hoạt động thế nào?",
        expected="public loyalty summary",
        got="public loyalty summary",
        output=_short(result["answer"]),
        passed=passed,
    )


def _scenario_loyalty_logged_in() -> ScenarioRow:
    _reset_state()
    with patch.object(graph, "get_my_loyalty", side_effect=_fake_my_loyalty):
        result = graph.loyalty_node(
            _make_state(
                question="mình còn bao nhiêu điểm?",
                session_id="matrix_loyalty_logged_in",
                shop_context={"user_id": "u_1", "auth_token": "token_123"},
            )
        )
    normalized_answer = result["answer"].lower().replace(",", "")
    passed = "1234" in normalized_answer and "gold" in normalized_answer
    return ScenarioRow(
        case="Loyalty logged-in",
        input="mình còn bao nhiêu điểm?",
        expected="points summary with rank",
        got="points summary with rank",
        output=_short(result["answer"]),
        passed=passed,
    )


def _scenario_support_ticket() -> ScenarioRow:
    _reset_state()
    captured: dict[str, object] = {}

    def fake_ticket(payload: dict, context: dict | None = None) -> dict:
        captured["payload"] = payload
        return _fake_support_ticket(payload, context)

    with patch.object(graph, "create_support_ticket", side_effect=fake_ticket):
        result = graph.support_ticket_node(
            _make_state(
                question="tạo ticket hỗ trợ giúp mình",
                session_id="matrix_support_ticket",
                shop_context={"user_name": "Hoang", "email": "hoang@example.com"},
            )
        )
    passed = "Mã yêu cầu: TKT-001" in result["answer"] and captured["payload"]["channel"] == "chat"
    return ScenarioRow(
        case="Support ticket",
        input="tạo ticket hỗ trợ giúp mình",
        expected="ticket created",
        got=f"ticket={result['ticket_info'].get('ticketNumber')}",
        output=_short(result["answer"]),
        passed=passed,
    )


def _scenario_support_contact_answer() -> ScenarioRow:
    _reset_state()
    result = asyncio.run(
        graph.inquiry_writer_node(
            _make_state(
                question="T\u1ea1o ticket h\u1ed7 tr\u1ee3 gi\u00fap m\u00ecnh v\u00ec \u0111\u01a1n giao tr\u1ec5 qu\u00e1",
                session_id="matrix_support_contact_answer",
                capability="inquiry",
                capability_reason="support_contact_request",
            )
        )
    )
    passed = (
        "m\u00e3 \u0111\u01a1n ho\u1eb7c email \u0111\u1eb7t h\u00e0ng" in result["answer"]
        and not result.get("ticket_info")
    )
    return ScenarioRow(
        case="Support contact answer",
        input="T\u1ea1o ticket h\u1ed7 tr\u1ee3 gi\u00fap m\u00ecnh v\u00ec \u0111\u01a1n giao tr\u1ec5 qu\u00e1",
        expected="ask for order/email, no ticket",
        got=_short(result["answer"]),
        output=_short(result["answer"]),
        passed=passed,
    )


def run_chat_scenario_matrix() -> list[ScenarioRow]:
    return [
        _scenario_guest_policy(),
        _scenario_budget_catalog(),
        _scenario_catalog_selection(),
        _scenario_budget_purchase_requires_selection(),
        _scenario_concrete_purchase_to_cart(),
        _scenario_guest_checkout_latch(),
        _scenario_checkout_progression(),
        _scenario_logged_in_checkout(),
        _scenario_order_lookup_by_id(),
        _scenario_order_lookup_by_object_id(),
        _scenario_order_lookup_by_phone(),
        _scenario_order_followup_route(),
        _scenario_email_identifier_override_catalog(),
        _scenario_return_policy_question(),
        _scenario_cancel_policy_question(),
        _scenario_new_question_ignores_policy_history(),
        _scenario_order_lookup_ignores_stale_history(),
        _scenario_return_request_generic(),
        _scenario_return_policy_answer(),
        _scenario_return_request_followup_answer(),
        _scenario_return_request_email_followup(),
        _scenario_cancel_order_email_followup(),
        _scenario_refund_email_followup(),
        _scenario_update_address_email_followup(),
        _scenario_update_address_pending_order(),
        _scenario_cancel_order(),
        _scenario_request_refund(),
        _scenario_process_return(),
        _scenario_loyalty_guest(),
        _scenario_loyalty_logged_in(),
        _scenario_support_ticket(),
        _scenario_support_contact_answer(),
    ]


def _print_rows(rows: list[ScenarioRow]) -> None:
    table = Table(title="MilkyBloom Chat Scenario Matrix", show_lines=True)
    table.add_column("Case", style="cyan", no_wrap=True)
    table.add_column("Input", style="white", max_width=38)
    table.add_column("Expected", style="dim", max_width=30)
    table.add_column("Got", style="bold", max_width=30)
    table.add_column("Output", style="green", max_width=56)
    table.add_column("Pass", justify="center")

    for row in rows:
        table.add_row(
            row.case,
            _short(row.input, 38),
            _short(row.expected, 30),
            _short(row.got, 30),
            _short(row.output, 56),
            "[green]✓[/]" if row.passed else "[red]✗[/]",
        )
    console.print(table)


def test_chat_scenario_matrix():
    _reset_state()
    rows = run_chat_scenario_matrix()
    _print_rows(rows)
    assert all(row.passed for row in rows), "One or more scenario matrix cases failed"


if __name__ == "__main__":
    _reset_state()
    rows = run_chat_scenario_matrix()
    _print_rows(rows)
    failures = [row for row in rows if not row.passed]
    if failures:
        raise SystemExit(1)
