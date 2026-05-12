"""
Rewriter Agent — Viết lại query khi policy search không đủ.
Phần sinh text đi qua Groq là chính, Featherless là fallback.
"""
import time
import sys
from pathlib import Path
sys.path.append(str(Path(__file__).parent.parent))

from agents.state import AgentState
from agents.llm_client import (
    groq_complete,
    featherless_complete,
    GROQ_MODEL_FAST,
    FEATHERLESS_MODEL_FAST,
)
from config import EMPATHY_MODE
from utils.console import console

REWRITE_SYSTEM_PROMPT = """\
Bạn là chuyên gia viết lại truy vấn để tìm chính sách CSKH phù hợp nhất.
Khi nhận một câu hỏi hoặc khiếu nại trả về kết quả tìm kiếm chưa tốt, hãy viết lại truy vấn sao cho sát ý hơn.

CHIẾN LƯỢC:
1. Rút ra VẤN ĐỀ CHÍNH: giao trễ, hàng hỏng, giao sai, đổi trả, hoàn tiền, bảo hành...
2. Thêm các từ khóa chính sách phù hợp: hoàn tiền, đổi trả, bồi thường, voucher, bảo hành, vận chuyển, thanh toán
3. Giữ lại mã đơn, tên sản phẩm, thời gian, số điện thoại nếu chúng xuất hiện và có ích
4. Viết ngắn gọn, ưu tiên từ khóa thực dụng để tìm đúng chính sách

QUY TẮC BẮT BUỘC:
- Chỉ xuất ra truy vấn đã viết lại, KHÔNG giải thích gì thêm
- BẮT BUỘC viết bằng tiếng Việt
- Không bịa thêm chi tiết không có trong đầu vào
- Tối đa 1-2 câu
"""


async def rewrite_query_node(state: AgentState) -> dict:
    """Node: Rewrite query để tìm chính sách phù hợp hơn."""
    t0 = time.time()
    original_query = state.get("translated_query", state["question"])
    rewrite_count = state.get("rewrite_count", 0)
    evidence = state.get("evidence", [])
    sentiment = state.get("sentiment", "")

    evidence_context = ""
    if evidence:
        titles = [doc.get("doc_title", "")[:80] for doc in evidence[:3]]
        evidence_context = (
            f"\nPrevious search returned these partially relevant policies:\n"
            + "\n".join(f"- {t}" for t in titles if t)
            + "\nRewrite to find MORE relevant policies."
        )

    prompt = (
        f"Customer complaint: {state['question']}\n"
        f"Sentiment: {sentiment}\n"
        f"Original query (attempt #{rewrite_count + 1}): {original_query}\n"
        f"{evidence_context}\n\n"
        f"Rewrite this query to find the best matching CSKH policy:"
    )

    messages = [
        {"role": "system", "content": REWRITE_SYSTEM_PROMPT},
        {"role": "user", "content": prompt},
    ]
    
    if EMPATHY_MODE == "featherless":
        rewritten = await featherless_complete(
            messages=messages,
            model=FEATHERLESS_MODEL_FAST,
            max_tokens=128,
            temperature=0.2,
        )
    else:
        rewritten = await groq_complete(
            prompt=prompt,
            system_prompt=REWRITE_SYSTEM_PROMPT,
            model=GROQ_MODEL_FAST,
            max_tokens=128,
            temperature=0.2,
        )

    rewritten = rewritten.strip().strip('"').strip("'")

    elapsed = int((time.time() - t0) * 1000)
    console.print(
        f"[yellow]  Rewrite #{rewrite_count + 1}: "
        f"'{original_query[:40]}...' -> '{rewritten[:40]}...' ({elapsed}ms)[/]"
    )

    return {
        "translated_query": rewritten,
        "rewrite_count": rewrite_count + 1,
        "agent_trace": {
            **(state.get("agent_trace") or {}),
            f"rewrite_{rewrite_count + 1}_from": original_query,
            f"rewrite_{rewrite_count + 1}_to": rewritten,
            f"rewrite_{rewrite_count + 1}_ms": elapsed,
        },
    }
