"""
Sentiment Analyzer — Phân tích cảm xúc khách hàng.
Embedding-based, KHÔNG dùng LLM (0 token, ~10ms).
Thay thế translator.py (không cần dịch VN->EN nữa).
"""
import numpy as np
import time
import sys
from pathlib import Path
sys.path.append(str(Path(__file__).parent.parent))

from agents.model_registry import get_embed_model, get_embed_cached
from agents.state import AgentState
from utils.console import console

# Singleton centroids
_centroids = None
_vibe_centroids = None

SENTIMENT_CLUSTERS = {
    "toxic": [
        "lừa đảo", "ăn cướp", "lấy tiền", "tệ hại", "rác", "ngu",
        "report", "kiện", "bóc phốt", "không bao giờ quay lại",
        "láo", "mất dạy", "vô trách nhiệm", "phẫn nộ", "tức giận",
        "chửi", "căm tức", "bất bình", "phàn nàn gay gắt",
        "tôi sẽ kiện", "báo cáo", "phê bình", "dọa", "cảnh cáo",
    ],
    "frustrated": [
        "mệt mỏi", "bực bội", "khó chịu", "bao giờ", "chờ quá lâu",
        "lần thứ ba", "vẫn chưa", "không thể chấp nhận", "chán nản",
        "tại sao", "sao lại", "ai chịu trách nhiệm", "đã nhiều lần",
        "không được giải quyết", "mất kiên nhẫn", "phiền phức",
        "rốt cuộc", "đến bao giờ", "quá nhiều", "hết chịu nổi",
    ],
    "disappointed": [
        "thất vọng", "buồn", "tiếc", "kỳ vọng", "không như mong đợi",
        "hơi buồn", "khách quen", "tin tưởng", "ủng hộ lâu năm",
        "đáng tiếc", "hy vọng", "không tốt như trước",
        "cảm thấy buồn", "lo lắng", "không hài lòng", "chưa vươn",
    ],
    "neutral": [
        "hỏi", "thắc mắc", "muốn biết", "cho tôi hỏi",
        "làm ơn", "giúp tôi", "có thể giúp", "thông tin",
        "hướng dẫn", "cách làm", "báo giá", "tư vấn",
        "xin chào", "cảm ơn", "thế nào", "tại sao",
    ],
}

VIBE_CLUSTERS = {
    "genz": [
        "hihi", "haha", "k", "đc k", "ạ", "nha", "nhé",
        "quá trời", "đỉnh", "chóp", "xịn", "sao á", "nè",
        "okela", "ok nha", "dạ", "chốt đơn", "u là trời"
    ],
    "formal": [
        "xin chào", "kính gửi", "vui lòng", "tôi muốn",
        "thông tin", "chi tiết", "cảm ơn bạn", "tư vấn giúp tôi",
        "địa chỉ", "trân trọng", "báo giá"
    ],
    "short": [
        "ok", "done", "xong", "rồi", "giá", "nhiêu",
        "ib", "mua", "còn k", "hết r", "đúng", "không"
    ]
}


def _ensure_centroids():
    """Precompute centroids cho 4 sentiment clusters và vibes."""
    global _centroids, _vibe_centroids
    if _centroids is not None and _vibe_centroids is not None:
        return

    model = get_embed_model()
    console.print("[dim]  Sentiment: computing centroids...[/]")

    _centroids = {}
    for label, keywords in SENTIMENT_CLUSTERS.items():
        embeddings = model.encode(keywords, normalize_embeddings=True, batch_size=64)
        centroid = np.mean(embeddings, axis=0)
        centroid /= np.linalg.norm(centroid)
        _centroids[label] = centroid

    _vibe_centroids = {}
    for label, keywords in VIBE_CLUSTERS.items():
        embeddings = model.encode(keywords, normalize_embeddings=True, batch_size=64)
        centroid = np.mean(embeddings, axis=0)
        centroid /= np.linalg.norm(centroid)
        _vibe_centroids[label] = centroid

    console.print("[dim]  Sentiment & Vibe: centroids ready[/]")


def analyze_sentiment_and_vibe(text: str) -> tuple[str, float, str]:
    """
    Phân tích cảm xúc và vibe từ text.
    Returns: (sentiment_label, confidence_score, vibe_label)
    """
    _ensure_centroids()

    q_emb = get_embed_cached(text)

    scores = {}
    for label, centroid in _centroids.items():
        scores[label] = float(np.dot(q_emb, centroid))

    best_label = max(scores, key=scores.get)
    best_score = scores[best_label]

    # Normalize to 0-1 range
    min_score = min(scores.values())
    max_score = max(scores.values())
    if max_score > min_score:
        confidence = (best_score - min_score) / (max_score - min_score)
    else:
        confidence = 0.5

    vibe_scores = {}
    for label, centroid in _vibe_centroids.items():
        vibe_scores[label] = float(np.dot(q_emb, centroid))
    
    best_vibe = max(vibe_scores, key=vibe_scores.get)

    return best_label, round(confidence, 3), best_vibe


def sentiment_analyzer_node(state: AgentState) -> dict:
    """LangGraph Node: Phân tích cảm xúc khách hàng."""
    t0 = time.time()
    question = state["question"]

    sentiment, score, vibe = analyze_sentiment_and_vibe(question)

    elapsed = int((time.time() - t0) * 1000)
    console.print(
        f"[dim]  Sentiment: {sentiment} (score={score:.3f}), Vibe: {vibe} ({elapsed}ms)[/]"
    )

    return {
        "sentiment": sentiment,
        "sentiment_score": score,
        "user_vibe": vibe,
        "agent_trace": {
            **(state.get("agent_trace") or {}),
            "sentiment": sentiment,
            "sentiment_score": score,
            "sentiment_ms": elapsed,
        },
    }
