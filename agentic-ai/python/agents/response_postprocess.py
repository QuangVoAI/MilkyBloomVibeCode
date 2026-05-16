"""
Response Postprocess — normalization and Vietnamese guard rails.
"""

import re

ENGLISH_HEAVY_RE = re.compile(r"\b(the|and|or|sorry|please|thanks|okay|ok|refund|shipping|order)\b", re.I)

COMMON_REPL = [
    (r"\bplease\b", "bạn"),
    (r"\bsorry\b", "mình xin lỗi"),
    (r"\bthanks?\b", "cảm ơn"),
    (r"\bokay\b", "được"),
    (r"\border\b", "đơn hàng"),
    (r"\bshipping\b", "giao hàng"),
    (r"\brefund\b", "hoàn tiền"),
]


def english_ratio(text: str) -> float:
    words = re.findall(r"[A-Za-z']+", text or "")
    if not words:
        return 0.0
    english = sum(1 for word in words if ENGLISH_HEAVY_RE.search(word))
    return english / max(len(words), 1)


def normalize_vietnamese_output(text: str) -> str:
    """Light-weight cleanup when the model mixes English in Vietnamese replies."""
    cleaned = text or ""
    cleaned = cleaned.strip().strip('"').strip("'").strip()
    cleaned = re.sub(r"^(?:xin chào|chào)\s+bạn[!,.]?\s*", "", cleaned, flags=re.I)
    cleaned = re.sub(r"\bTôi\b", "Mình", cleaned)
    cleaned = re.sub(r"\btôi\b", "mình", cleaned)
    cleaned = re.sub(r"\bMyKingdom\b", "MilkyBloom", cleaned)
    cleaned = re.sub(r"\bchúng tôi\b", "MilkyBloom", cleaned, flags=re.I)
    cleaned = re.sub(r"ngày sinh của mình", "ngày sinh của bạn", cleaned, flags=re.I)
    cleaned = re.sub(r"sinh nhật của mình", "sinh nhật của bạn", cleaned, flags=re.I)
    cleaned = re.sub(
        r"\s*Bạn có muốn biết thêm(?:\s+thông tin)?[^.!?]*không\?\s*$",
        "",
        cleaned,
        flags=re.I,
    )
    for pattern, replacement in COMMON_REPL:
        cleaned = re.sub(pattern, replacement, cleaned, flags=re.I)
    cleaned = re.sub(r"\s{2,}", " ", cleaned)
    cleaned = re.sub(r"\s+\n", "\n", cleaned)
    return cleaned.strip()


def should_rewrite_to_vietnamese(text: str, min_ratio: float = 0.18) -> bool:
    return english_ratio(text) >= min_ratio

