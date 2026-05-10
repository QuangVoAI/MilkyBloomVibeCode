"""
Reviewer Agent — Response Quality Checker.
Kiểm tra phản hồi bằng fast checks (không LLM):
1. Banned phrases (văn mẫu cấm / thái độ tệ với khách)
2. Câu trả lời bị lặp lại
Chỉ rewrite khi phát hiện vấn đề thực sự; phần rewrite đi qua Groq hoặc Featherless tùy cấu hình.
"""
import re
import sys
from pathlib import Path
sys.path.append(str(Path(__file__).parent.parent))

from agents.llm_client import groq_complete, featherless_complete, GROQ_MODEL_FAST, FEATHERLESS_MODEL_FAST
from config import EMPATHY_MODE
from utils.console import console

# Banned phrases: tuple (pattern, is_regex)
# is_regex=True: dùng re.search; is_regex=False: plain substring
BANNED_PHRASES_CONFIG = [
    # Hành vi SAI: agent tự nhận không có quyền / đẩy sang hotline thay vì tự xử lý
    ("không có quyền truy cập", False),
    ("trợ lý ảo và không có quyền", False),
    ("không có khả năng truy cập", False),
    # Đổ lỗi / từ chối thẳng thừng
    ("đây không phải lỗi của chúng tôi", False),
    ("không thể hỗ trợ thêm được", False),
    ("lỗi không phải từ phía", False),
    # Văn mẫu xin lỗi robot — LLM hay dùng dù prompt đã cấm
    (r"chúng tôi rất tiếc", False),
    (r"xin lỗi vì sự bất tiện", False),
]

# Giữ backward-compat list cho các nơi khác có thể import
BANNED_PHRASES = [p for p, _ in BANNED_PHRASES_CONFIG]

MAX_REVIEW_RETRIES = 1


def needs_review(question, action_result=None):
    """Deprecated — trigger logic đã chuyển sang reviewer_node (fast checks)."""
    return False


def _check_banned_phrases(answer):
    """Quick check banned phrases (no LLM needed).
    Hỗ trợ cả plain substring và regex pattern.
    """
    answer_lower = answer.lower()
    found = []
    for pattern, is_regex in BANNED_PHRASES_CONFIG:
        if is_regex:
            if re.search(pattern, answer_lower):
                found.append(pattern)
        else:
            if pattern in answer_lower:
                found.append(pattern)
    return found


def _is_repetitive(answer: str) -> bool:
    """Check nếu response có câu/đoạn bị lặp lại."""
    lines = [l.strip() for l in re.split(r"[\n.!?]+", answer) if l.strip() and len(l.strip()) > 20]
    if len(lines) < 2:
        return False
    for i, s1 in enumerate(lines):
        for s2 in lines[i + 1:]:
            if s1 == s2 or (len(s1) > 20 and s1 in s2) or (len(s2) > 20 and s2 in s1):
                return True
    return False


async def review_with_retry(question, answer, evidence, sentiment="", action_context=""):
    """Detect banned phrase / repetition → rewrite nếu cần. Không dùng LLM để judge."""
    current_answer = answer
    retry_count = 0

    for attempt in range(MAX_REVIEW_RETRIES + 1):
        banned = _check_banned_phrases(current_answer)
        repetitive = _is_repetitive(current_answer)

        issues = [f"Văn mẫu bị cấm: '{p}'" for p in banned]
        if repetitive:
            issues.append("Câu trả lời bị lặp lại")

        if not issues or attempt >= MAX_REVIEW_RETRIES:
            return current_answer, {
                "is_approved": not issues,
                "issues": issues,
                "retry_count": retry_count,
            }

        console.print(f"[yellow]  Reviewer rewrite #{attempt + 1}: {issues}[/]")

        action_block = (
            f"\nQUYẾT ĐỊNH HỆ THỐNG (BUỘC TUÂN THỦ): {action_context}\n"
            if action_context else ""
        )
        retry_prompt = (
            f"Phản hồi trước bị lỗi: {'; '.join(issues)}\n\n"
            f"KHÁCH HÀNG: {question}\n\n"
            f"{action_block}"
            f"CHÍNH SÁCH THAM KHẢO: {evidence[:2000]}\n\n"
            f"Viết lại phản hồi tự nhiên, không dùng văn mẫu. Tối đa 4-5 câu.\n"
            f"Nếu có QUYẾT ĐỊNH HỆ THỐNG bên trên, ưu tiên QUYẾT ĐỊNH HỆ THỐNG hơn CHÍNH SÁCH THAM KHẢO.\n"
            f"CẤM: 'chúng tôi rất tiếc', 'mình rất tiếc', 'xin lỗi vì sự bất tiện', 'theo chính sách của chúng tôi', 'không có quyền truy cập'.\n"
            f"ĐƯỢC PHÉP: 'Theo chính sách đổi trả của MyKingdom, ...' (có brand + nội dung cụ thể)."
        )

        try:
            if EMPATHY_MODE == "featherless":
                current_answer = await featherless_complete(
                    messages=[
                        {
                            "role": "system",
                            "content": (
                                "Bạn là EmpathAI - trợ lý CSKH MyKingdom. "
                                "Viết phản hồi thấu cảm, tự nhiên, ngắn gọn. Dùng 'bạn/mình'."
                            ),
                        },
                        {"role": "user", "content": retry_prompt},
                    ],
                    model=FEATHERLESS_MODEL_FAST,
                    max_tokens=400,
                    temperature=0.7,
                )
            else:
                current_answer = await groq_complete(
                    prompt=retry_prompt,
                    system_prompt=(
                        "Bạn là EmpathAI - trợ lý CSKH MyKingdom. "
                        "Viết phản hồi thấu cảm, tự nhiên, ngắn gọn. Dùng 'bạn/mình'."
                    ),
                    model=GROQ_MODEL_FAST,
                    max_tokens=400,
                    temperature=0.7,
                )
        except Exception as e:
            console.print(f"[red]  Reviewer rewrite error via LLM backend: {e}[/]")
            break
        retry_count += 1

    return current_answer, {"is_approved": True, "issues": [], "retry_count": retry_count}
