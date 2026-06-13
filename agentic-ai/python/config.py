"""
Cấu hình chung cho hệ thống EmpathAI — CSKH thấu cảm.
Đọc biến môi trường từ file .env
"""
import os
from pathlib import Path
from dotenv import load_dotenv

# --- Paths ---
PROJECT_ROOT = Path(__file__).parent.parent
ENV_FILE = PROJECT_ROOT / ".env"
DATA_DIR = PROJECT_ROOT / "data"
RAW_DATA_DIR = DATA_DIR / "raw"
POLICY_DIR = DATA_DIR

RAW_DATA_DIR.mkdir(parents=True, exist_ok=True)

# --- Load .env ---
load_dotenv(ENV_FILE)

# --- HuggingFace Login ---
HF_TOKEN = os.getenv("HF_TOKEN")
if HF_TOKEN:
    try:
        from huggingface_hub import login
        login(token=HF_TOKEN)
    except ImportError:
        pass

# --- API Keys ---
def _split_env_list(value: str | None) -> list[str]:
    return [item.strip() for item in str(value or "").split(",") if item.strip()]


def _unique_ordered(values: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for value in values:
        if value in seen:
            continue
        seen.add(value)
        result.append(value)
    return result


GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
GROQ_API_KEYS = _unique_ordered([
    *_split_env_list(GROQ_API_KEY),
    *_split_env_list(os.getenv("GROQ_API_KEYS", "")),
])
GROQ_BASE_URL = os.getenv("GROQ_BASE_URL", "https://api.groq.com/openai/v1")
GROQ_MODEL = os.getenv("GROQ_MODEL", "llama-3.1-8b-instant")
GROQ_MODEL_FAST = os.getenv("GROQ_MODEL_FAST", GROQ_MODEL)
GROQ_MODEL_SMART = os.getenv("GROQ_MODEL_SMART", GROQ_MODEL)
GROQ_HTTP_REFERER = os.getenv("GROQ_HTTP_REFERER", "")
GROQ_X_TITLE = os.getenv("GROQ_X_TITLE", "")

FEATHERLESS_API_KEY = os.getenv("FEATHERLESS_API_KEY", "")
FEATHERLESS_BASE_URL = os.getenv(
    "FEATHERLESS_BASE_URL",
    "https://api.featherless.ai/v1",
)
FEATHERLESS_MODEL = os.getenv("FEATHERLESS_MODEL", "Qwen/Qwen2.5-7B-Instruct")
FEATHERLESS_MODEL_FAST = os.getenv("FEATHERLESS_MODEL_FAST", FEATHERLESS_MODEL)
FEATHERLESS_MODEL_SMART = os.getenv("FEATHERLESS_MODEL_SMART", FEATHERLESS_MODEL)
FEATHERLESS_HTTP_REFERER = os.getenv("FEATHERLESS_HTTP_REFERER", "")
FEATHERLESS_X_TITLE = os.getenv("FEATHERLESS_X_TITLE", "")

QDRANT_URL = os.getenv("QDRANT_URL", "http://localhost:6333")
QDRANT_HOSTPORT = os.getenv("QDRANT_HOSTPORT", "")
QDRANT_HOST = os.getenv("QDRANT_HOST", "")
QDRANT_PORT = os.getenv("QDRANT_PORT", "")
if not os.getenv("QDRANT_URL"):
    if QDRANT_HOSTPORT:
        QDRANT_URL = QDRANT_HOSTPORT if QDRANT_HOSTPORT.startswith(("http://", "https://")) else f"http://{QDRANT_HOSTPORT}"
    elif QDRANT_HOST and QDRANT_PORT:
        QDRANT_URL = f"http://{QDRANT_HOST}:{QDRANT_PORT}"
QDRANT_API_KEY = os.getenv("QDRANT_API_KEY", "")

# --- Model Configuration ---
EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "BAAI/bge-m3")
RERANKER_MODEL = os.getenv("RERANKER_MODEL", "BAAI/bge-reranker-v2-m3")

def get_empathy_mode():
    return os.getenv("EMPATHY_MODE", "featherless")

# Sentiment labels
SENTIMENT_LABELS = ["toxic", "frustrated", "disappointed", "neutral"]

# --- Kafka Configuration ---
KAFKA_BROKERS = os.getenv("KAFKA_BROKERS", "localhost:9092")

# --- Qdrant Configuration ---
QDRANT_COLLECTION = os.getenv("QDRANT_COLLECTION", "empathAI_policies")
EMBEDDING_DIM = 1024  # bge-m3 output dimension

# --- Retrieval Configuration ---
TOP_K_RETRIEVAL = 8
TOP_K_RERANK = 3

# --- RRF Configuration ---
RRF_DENSE_WEIGHT = float(os.getenv("RRF_DENSE_WEIGHT", "0.6"))
RRF_SPARSE_WEIGHT = float(os.getenv("RRF_SPARSE_WEIGHT", "0.4"))
RRF_K = int(os.getenv("RRF_K", "60"))

# --- Upstash Redis ---
UPSTASH_REDIS_REST_URL = os.getenv("UPSTASH_REDIS_REST_URL", "")
UPSTASH_REDIS_REST_TOKEN = os.getenv("UPSTASH_REDIS_REST_TOKEN", "")
REDIS_CACHE_TTL = int(os.getenv("REDIS_CACHE_TTL", str(7 * 24 * 3600)))

# --- Langfuse ---
LANGFUSE_SECRET_KEY = os.getenv("LANGFUSE_SECRET_KEY", "")
LANGFUSE_PUBLIC_KEY = os.getenv("LANGFUSE_PUBLIC_KEY", "")
LANGFUSE_BASE_URL = (
    os.getenv("LANGFUSE_BASE_URL")
    or os.getenv("LANGFUSE_HOST")
    or "https://cloud.langfuse.com"
)
LANGFUSE_HOST = os.getenv("LANGFUSE_HOST") or LANGFUSE_BASE_URL

# Langfuse SDK v4 reads LANGFUSE_BASE_URL while older examples used LANGFUSE_HOST.
# Keep both populated after .env is loaded so imports later in the process see
# consistent credentials and do not initialize a disabled client.
if LANGFUSE_SECRET_KEY:
    os.environ.setdefault("LANGFUSE_SECRET_KEY", LANGFUSE_SECRET_KEY)
if LANGFUSE_PUBLIC_KEY:
    os.environ.setdefault("LANGFUSE_PUBLIC_KEY", LANGFUSE_PUBLIC_KEY)
os.environ.setdefault("LANGFUSE_BASE_URL", LANGFUSE_BASE_URL)
os.environ.setdefault("LANGFUSE_HOST", LANGFUSE_HOST)

# --- Rewrite / Self-Reflective RAG ---
MAX_REWRITE_RETRIES = 2
MIN_GOOD_DOCS = 1  # Data nho, 1 doc chat luong cao la du
GRADE_SCORE_THRESHOLD = 0.25  # Ngưỡng an toàn cho BGE-Reranker (probability 0-1)
