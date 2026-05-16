"""
Fixed intent evaluation corpus for EmpathAI.

The corpus is intentionally mixed:
  - clear complaint / inquiry / casual cases
  - action-extraction cases with order context
  - ambiguous cases that should trigger clarify
  - noisy / red-team variants with spelling or code-switching

This file is source-controlled so regression can be reproduced.
We keep the seed set around 100+ cases by expanding 36 base prompts
into 3 deterministic variants each.
"""
from __future__ import annotations

from copy import deepcopy
import unicodedata


BASE_CASES = [
    {
        "question": "Hủy đơn MK001 giúp mình",
        "expected_intent": "COMPLAINT",
        "expected_action": "cancel_order",
        "order_info": {"found": True, "status": "processing", "order_id": "MK001"},
    },
    {
        "question": "Mình muốn hủy đơn MK007 đang giao",
        "expected_intent": "COMPLAINT",
        "expected_action": "cancel_order",
        "order_info": {"found": True, "status": "shipping", "order_id": "MK007"},
    },
    {
        "question": "Đổi địa chỉ giao hàng sang 12 Nguyễn Trãi, Q1",
        "expected_intent": "COMPLAINT",
        "expected_action": "update_address",
        "order_info": {"found": True, "status": "processing", "order_id": "MK010"},
    },
    {
        "question": "MK010 đổi địa chỉ sang 12 Nguyễn Trãi, Q1",
        "expected_intent": "COMPLAINT",
        "expected_action": "update_address",
        "order_info": {"found": True, "status": "shipping", "order_id": "MK010"},
    },
    {
        "question": "Hoàn tiền cho đơn MK003 giúp mình",
        "expected_intent": "COMPLAINT",
        "expected_action": "request_refund",
        "order_info": {"found": True, "status": "delivered", "order_id": "MK003", "return_eligible": True},
    },
    {
        "question": "Mình muốn trả hàng đơn MK004",
        "expected_intent": "COMPLAINT",
        "expected_action": "process_return",
        "order_info": {"found": True, "status": "delivered", "order_id": "MK004", "return_eligible": True},
    },
    {
        "question": "Kiểm tra tình trạng đơn MK005 giúp mình",
        "expected_intent": "COMPLAINT",
        "expected_action": "check_order_status",
        "order_info": {"found": True, "status": "processing", "order_id": "MK005"},
    },
    {
        "question": "Mình cần tạo ticket hỗ trợ vì sản phẩm bị lỗi",
        "expected_intent": "COMPLAINT",
        "expected_action": "no_action",
        "order_info": {"found": False},
    },
    {
        "question": "Đơn giao sai màu rồi, xử lý giúp mình",
        "expected_intent": "COMPLAINT",
        "expected_action": "process_return",
        "order_info": {"found": True, "status": "delivered", "order_id": "MK006"},
    },
    {
        "question": "Đơn này giao trễ quá, kiểm tra dùm mình",
        "expected_intent": "COMPLAINT",
        "expected_action": "check_order_status",
        "order_info": {"found": True, "status": "shipping", "order_id": "MK008"},
    },
    {
        "question": "Tôi chưa nhận được tiền hoàn của đơn MK009",
        "expected_intent": "COMPLAINT",
        "expected_action": "request_refund",
        "order_info": {"found": True, "status": "cancelled", "order_id": "MK009", "return_eligible": False},
    },
    {
        "question": "Hàng bị vỡ rồi, mình cần hỗ trợ đổi trả",
        "expected_intent": "COMPLAINT",
        "expected_action": "process_return",
        "order_info": {"found": True, "status": "delivered", "order_id": "MK011", "return_eligible": True},
    },
    {
        "question": "Sản phẩm lỗi quá, xử lý cho mình với",
        "expected_intent": "COMPLAINT",
        "expected_action": "no_action",
        "order_info": {"found": False},
    },
    {
        "question": "Cho mình hỏi phí ship bao nhiêu vậy",
        "expected_intent": "INQUIRY",
        "expected_action": None,
        "order_info": {},
    },
    {
        "question": "Shop có hỗ trợ thanh toán COD không",
        "expected_intent": "INQUIRY",
        "expected_action": None,
        "order_info": {},
    },
    {
        "question": "Giày này còn size 39 không",
        "expected_intent": "INQUIRY",
        "expected_action": None,
        "order_info": {},
    },
    {
        "question": "Có khuyến mãi gì cho đơn này không",
        "expected_intent": "INQUIRY",
        "expected_action": None,
        "order_info": {},
    },
    {
        "question": "Bảo hành bao lâu vậy",
        "expected_intent": "INQUIRY",
        "expected_action": None,
        "order_info": {},
    },
    {
        "question": "Mình muốn biết chính sách đổi trả",
        "expected_intent": "INQUIRY",
        "expected_action": None,
        "order_info": {},
    },
    {
        "question": "Bao lâu thì giao hàng tới nơi",
        "expected_intent": "INQUIRY",
        "expected_action": None,
        "order_info": {},
    },
    {
        "question": "Mặt hàng này có sẵn hàng không",
        "expected_intent": "INQUIRY",
        "expected_action": None,
        "order_info": {},
    },
    {
        "question": "Cách đổi điểm tích lũy như nào",
        "expected_intent": "INQUIRY",
        "expected_action": None,
        "order_info": {},
    },
    {
        "question": "Mình muốn xem bảng size áo",
        "expected_intent": "INQUIRY",
        "expected_action": None,
        "order_info": {},
    },
    {
        "question": "Shop có giao nhanh trong ngày không",
        "expected_intent": "INQUIRY",
        "expected_action": None,
        "order_info": {},
    },
    {
        "question": "Chào shop",
        "expected_intent": "CASUAL",
        "expected_action": None,
        "order_info": {},
    },
    {
        "question": "Cảm ơn bạn nhiều nha",
        "expected_intent": "CASUAL",
        "expected_action": None,
        "order_info": {},
    },
    {
        "question": "Hello, bạn là ai vậy",
        "expected_intent": "CASUAL",
        "expected_action": None,
        "order_info": {},
    },
    {
        "question": "Ok cảm ơn, bye",
        "expected_intent": "CASUAL",
        "expected_action": None,
        "order_info": {},
    },
    {
        "question": "Bạn làm được gì",
        "expected_intent": "CASUAL",
        "expected_action": None,
        "order_info": {},
    },
    {
        "question": "Hi, hôm nay thế nào",
        "expected_intent": "CASUAL",
        "expected_action": None,
        "order_info": {},
    },
    {
        "question": "Dạ chào bạn",
        "expected_intent": "CASUAL",
        "expected_action": None,
        "order_info": {},
    },
    {
        "question": "Mình hỏi chút",
        "expected_intent": "COMPLAINT",
        "expected_action": None,
        "expected_route": "clarify",
        "order_info": {},
    },
    {
        "question": "Cái đó sao rồi",
        "expected_intent": "COMPLAINT",
        "expected_action": None,
        "expected_route": "clarify",
        "order_info": {},
    },
    {
        "question": "Xem giúp mình với",
        "expected_intent": "COMPLAINT",
        "expected_action": None,
        "expected_route": "clarify",
        "order_info": {},
    },
    {
        "question": "Cho mình hỏi cái này",
        "expected_intent": "INQUIRY",
        "expected_action": None,
        "expected_route": "clarify",
        "order_info": {},
    },
]


def _strip_diacritics(text: str) -> str:
    normalized = unicodedata.normalize("NFD", text)
    return "".join(ch for ch in normalized if unicodedata.category(ch) != "Mn")


def _slangify(text: str) -> str:
    replacements = [
        ("không", "ko"),
        ("được", "dc"),
        ("đơn", "don"),
        ("hàng", "hang"),
        ("hủy", "huy"),
        ("đổi", "doi"),
        ("trả", "tra"),
        ("giao hàng", "giao hang"),
        ("chính sách", "chinh sach"),
        ("khuyến mãi", "khuyen mai"),
        ("phí ship", "phi ship"),
    ]
    noisy = text.lower()
    for src, dst in replacements:
        noisy = noisy.replace(src, dst)
    return noisy


def _variantize(question: str) -> list[str]:
    cleaned = question.strip()
    if not cleaned:
        return [cleaned]

    variants = [
        cleaned,
        f"Bạn ơi, {cleaned[0].lower() + cleaned[1:]}" if len(cleaned) > 1 else cleaned,
        _slangify(cleaned),
    ]
    return list(dict.fromkeys(variants))


def _expand_cases() -> list[dict]:
    expanded = []
    for case in BASE_CASES:
        for variant in _variantize(case["question"]):
            item = deepcopy(case)
            item["question"] = variant
            item["case_id"] = f'{case["expected_intent"].lower()}_{len(expanded) + 1:03d}'
            item["noise_level"] = 0 if variant == case["question"] else (1 if variant.startswith("Bạn ơi,") else 2)
            expanded.append(item)
    return expanded


EVAL_CASES = _expand_cases()

