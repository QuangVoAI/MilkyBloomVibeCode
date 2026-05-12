"""
Shared Model Registry — Singleton cho tất cả AI models.

Tránh load model nhiều lần (BGE-M3 ~2.3GB fp32 / ~1.15GB fp16, Reranker ~1GB fp32 / ~0.5GB fp16).
Trên Q/P1000 4GB VRAM: fp16 tổng ~1.65GB → an toàn, fp32 ~3.3GB → OOM.
Device selection: GPU fp16 nếu đủ VRAM, fallback CPU fp32.
"""
import hashlib
import re
from collections import OrderedDict
from typing import Iterable

import numpy as np

try:
    import torch
except Exception:
    torch = None

from utils.console import console

_embed_model = None
_reranker_model = None

# LRU embedding cache — tránh encode cùng question nhiều lần (router/sentiment/action)
_EMBED_CACHE: OrderedDict = OrderedDict()
_EMBED_CACHE_MAX = 64


class _FallbackEmbeddingModel:
    """Lightweight lexical embedding fallback when torch/sentence-transformers is unavailable."""

    def __init__(self, dim: int = 384):
        self._dim = dim

    def get_sentence_embedding_dimension(self):
        return self._dim

    def _encode_one(self, text: str) -> np.ndarray:
        vec = np.zeros(self._dim, dtype=np.float32)
        normalized = (text or "").lower().replace("đ", "d").replace("Đ", "d")
        tokens = re.findall(r"[\wÀ-ỹ]+", normalized)
        for token in tokens:
            idx = int(hashlib.md5(token.encode("utf-8")).hexdigest(), 16) % self._dim
            vec[idx] += 1.0
        norm = np.linalg.norm(vec)
        if norm > 0:
            vec /= norm
        return vec

    def encode(self, texts, normalize_embeddings=True, batch_size=None):
        if isinstance(texts, str):
            return self._encode_one(texts)
        items = list(texts)
        vectors = [self._encode_one(text) for text in items]
        return np.stack(vectors) if vectors else np.zeros((0, self._dim), dtype=np.float32)


class _FallbackRerankerModel:
    """Simple overlap-based reranker fallback."""

    def _score_pair(self, query: str, doc: str) -> float:
        q_tokens = set(re.findall(r"[\wÀ-ỹ]+", (query or "").lower()))
        d_tokens = set(re.findall(r"[\wÀ-ỹ]+", (doc or "").lower()))
        if not q_tokens or not d_tokens:
            return 0.0
        overlap = len(q_tokens & d_tokens)
        union = len(q_tokens | d_tokens)
        return overlap / max(union, 1)

    def predict(self, pairs: Iterable[tuple[str, str]], batch_size=None):
        return np.array([self._score_pair(query, doc) for query, doc in pairs], dtype=np.float32)


def _select_device(min_free_gb: float = 1.3) -> str:
    """
    Chọn device: CUDA nếu còn đủ VRAM, ngược lại CPU.
    min_free_gb: VRAM tối thiểu cần có trước khi load model tiếp theo.
    """
    if torch is None:
        return "cpu"
    if torch.cuda.is_available():
        free_bytes, total_bytes = torch.cuda.mem_get_info()
        free_gb = free_bytes / 1024 ** 3
        total_gb = total_bytes / 1024 ** 3
        if free_gb >= min_free_gb:
            console.print(
                f"[dim]  VRAM: {free_gb:.1f}/{total_gb:.1f}GB free → CUDA[/]"
            )
            return "cuda"
        console.print(
            f"[yellow]  VRAM thấp: {free_gb:.1f}/{total_gb:.1f}GB free "
            f"(cần {min_free_gb}GB) → CPU[/]"
        )
    return "cpu"


def get_embed_model():
    """Singleton embedding model — shared giữa router, query_engine, indexer."""
    global _embed_model
    if _embed_model is None:
        try:
            import sys
            from pathlib import Path
            sys.path.append(str(Path(__file__).parent.parent))

            from sentence_transformers import SentenceTransformer
            from config import EMBEDDING_MODEL

            device = _select_device(min_free_gb=1.3)
            dtype = torch.float16 if torch is not None and device == "cuda" else torch.float32
            precision = "fp16" if torch is not None and dtype == torch.float16 else "fp32"

            console.print(
                f"[cyan]🔄 Loading embedding model: {EMBEDDING_MODEL} "
                f"({device}, {precision})...[/]"
            )
            _embed_model = SentenceTransformer(
                EMBEDDING_MODEL,
                device=device,
                model_kwargs={"torch_dtype": dtype},
            )
            console.print(
                f"[green]✅ Embedding model ready "
                f"({_embed_model.get_sentence_embedding_dimension()}D)[/]"
            )
        except Exception as e:
            console.print(f"[yellow]⚠️  Embedding fallback enabled: {e}[/]")
            _embed_model = _FallbackEmbeddingModel()
    return _embed_model


def get_reranker_model():
    """Singleton reranker model (CrossEncoder)."""
    global _reranker_model
    if _reranker_model is None:
        try:
            import sys
            from pathlib import Path
            sys.path.append(str(Path(__file__).parent.parent))

            from sentence_transformers import CrossEncoder
            from config import RERANKER_MODEL

            device = _select_device(min_free_gb=0.6)
            dtype = torch.float16 if torch is not None and device == "cuda" else torch.float32
            precision = "fp16" if torch is not None and dtype == torch.float16 else "fp32"

            console.print(
                f"[cyan]🔄 Loading reranker model: {RERANKER_MODEL} "
                f"({device}, {precision})...[/]"
            )
            _reranker_model = CrossEncoder(
                RERANKER_MODEL,
                max_length=512,
                device=device,
                automodel_args={"torch_dtype": dtype},
            )
            console.print("[green]✅ Reranker model ready[/]")
        except Exception as e:
            console.print(f"[yellow]⚠️  Reranker fallback enabled: {e}[/]")
            _reranker_model = _FallbackRerankerModel()
    return _reranker_model


def get_embed_cached(text: str):
    """Cached single-text embedding (normalize=True). LRU, max 64 entries.
    
    Giảm encode từ 3x xuống 1x cho cùng question trong một turn:
    router (slow path), sentiment, action_intent đều dùng cache.
    """
    import numpy as np
    if text in _EMBED_CACHE:
        _EMBED_CACHE.move_to_end(text)
        return _EMBED_CACHE[text]
    model = get_embed_model()
    emb = model.encode(text, normalize_embeddings=True)
    _EMBED_CACHE[text] = emb
    if len(_EMBED_CACHE) > _EMBED_CACHE_MAX:
        _EMBED_CACHE.popitem(last=False)
    return emb


def warmup():
    """Pre-load tất cả models + pre-compute centroids lúc startup.
    
    Loại bỏ cold-start 5-10s ở request đầu tiên:
    - Load BGE-M3 fp16 (~0.7GB VRAM)
    - Load BGE-Reranker fp16 (~0.5GB VRAM)  
    - Pre-compute centroids cho router / sentiment / action_intent
    """
    console.print("[bold cyan]🔥 Warming up models...[/]")
    get_embed_model()
    get_reranker_model()
    if torch is not None and torch.cuda.is_available():
        used_bytes = torch.cuda.memory_allocated()
        total_bytes = torch.cuda.get_device_properties(0).total_memory
        console.print(
            f"[dim]  VRAM sau warmup: "
            f"{used_bytes/1024**3:.2f}/{total_bytes/1024**3:.1f}GB used[/]"
        )
    # Pre-compute centroids — tránh cold-start ở request đầu tiên
    try:
        from agents.router import _ensure_centroids as _router_centroids
        _router_centroids()
    except Exception:
        pass
    try:
        from agents.sentiment_analyzer import _ensure_centroids as _sentiment_centroids
        _sentiment_centroids()
    except Exception:
        pass
    try:
        from tools.action_tool import _ensure_action_centroids
        _ensure_action_centroids()
    except Exception:
        pass
    console.print("[bold green]✅ All models + centroids ready![/]")
