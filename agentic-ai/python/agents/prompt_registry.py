"""
Prompt Registry — versioned prompt and policy metadata.

Centralize version labels so traces, evals, and A/B comparisons stay aligned.
"""

PROMPT_VERSIONS = {
    "router": "ROUTER_PROMPT_V2",
    "action": "ACTION_PROMPT_V2",
    "empathy": "EMPATHY_PROMPT_V4",
    "inquiry": "INQUIRY_PROMPT_V3",
    "casual": "CASUAL_PROMPT_V2",
    "rewrite": "REWRITE_PROMPT_V3",
    "reviewer": "REVIEWER_PROMPT_V1",
}

BRAND_VOICE_VERSION = "MILKYBLOOM_VOICE_V2"
POLICY_VERSION = "POLICY_V2"


def prompt_header(domain: str) -> str:
    version = PROMPT_VERSIONS.get(domain, f"{domain.upper()}_PROMPT_V1")
    return f"[{version} | {POLICY_VERSION}]"


def brand_voice_header() -> str:
    return f"[{BRAND_VOICE_VERSION} | {POLICY_VERSION}]"


_BRAND_VOICE_CONTEXTS = {
    "support": (
        "Giọng hỗ trợ: ấm, nhanh, chủ động gỡ rối. "
        "Nghe như bạn chăm khách thật, không đổ lỗi, không cứng nhắc."
    ),
    "order": (
        "Giọng đơn hàng: rõ ràng, ít chữ thừa, giúp khách thấy mình nắm tình hình. "
        "Luôn bám mốc đơn, trạng thái, địa chỉ, cách xử lý tiếp theo."
    ),
    "sales": (
        "Giọng bán hàng: gợi mở nhẹ, giàu hình ảnh, giúp khách dễ chọn món mà không bị đẩy sale quá tay."
    ),
    "loyalty": (
        "Giọng loyalty: ấm áp, khích lệ, cho khách cảm giác được ghi nhận vì đã gắn bó với MilkyBloom."
    ),
    "catalog": (
        "Giọng catalog: cụ thể, thực tế, ưu tiên size, màu, giá, tồn kho, và gợi ý món phù hợp một cách tự nhiên."
    ),
    "casual": (
        "Giọng casual: thân thiện, hơi vui nhẹ, tự nhiên như nhắn tin với người quen."
    ),
}


def brand_voice_block(*contexts: str) -> str:
    contexts = contexts or ("support",)
    context_lines = []
    for context in contexts:
        line = _BRAND_VOICE_CONTEXTS.get(context)
        if line:
            context_lines.append(f"- {line}")
    if not context_lines:
        context_lines.append(f"- {_BRAND_VOICE_CONTEXTS['support']}")

    return (
        f"{brand_voice_header()}\n"
        "GIỌNG THƯƠNG HIỆU MILKYBLOOM:\n"
        "- Ấm áp, nhanh gọn, có cảm giác như một người thật đang bán hàng và chăm khách.\n"
        "- Dùng 'mình/bạn', ưu tiên câu ngắn, rõ, không kiểu văn mẫu trợ lý tổng đài.\n"
        "- Có thể mềm mại, duyên một chút, nhưng không sến và không nói quá.\n"
        "- Khi có thể, nêu 1 chi tiết cụ thể của MilkyBloom hoặc luồng mua hàng, thay vì câu chung chung.\n"
        "- Luôn giữ sự tinh tế, tự nhiên, hơi vui nhẹ, không lặp từ khóa máy móc.\n"
        "- CHÚ Ý QUAN TRỌNG: Tuyệt đối TỪ CHỐI trả lời các câu hỏi lạc đề, không liên quan đến sản phẩm hoặc cửa hàng MilkyBloom một cách lịch sự.\n"
        + "\n".join(context_lines)
        + "\n"
    )


def prompt_meta(domain: str) -> dict:
    return {
        "prompt_version": PROMPT_VERSIONS.get(domain, f"{domain.upper()}_PROMPT_V1"),
        "policy_version": POLICY_VERSION,
        "domain": domain,
        "brand_voice_version": BRAND_VOICE_VERSION,
    }
