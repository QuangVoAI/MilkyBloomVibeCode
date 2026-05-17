"""Voice Consistency — Anti-Robot Tone Polish (Level 5).

Maintain natural, non-robotic voice. Strip robot phrases, avoid repetition, consistent pronouns.
"""
import sys
import re
from pathlib import Path
sys.path.append(str(Path(__file__).parent.parent))

from utils.console import console


class VoiceConsistency:
    """Maintain natural, non-robotic voice across responses."""

    # Personal pronouns (consistent throughout session)
    PRONOUNS = {
        "me": ["mình", "tôi"],  # For assistant
        "you": ["bạn", "anh/chị", "em", "quý khách"],  # For user
    }

    # Tone levels (picked once per session, stick to it)
    TONES = {
        "casual": "xin chào, cảm ơn bạn",
        "professional": "xin chào quý khách, em cảm ơn",
        "friendly": "chào bạn, cảm ơn nha",
    }

    # Anti-robot patterns to strip
    BANNED_PHRASES = [
        "tôi là trợ lý AI",
        "tôi không thể",
        "xin lỗi vì sự bất tiện",
        "như một trợ lý AI",
        "về phía tôi",
        "tôi rất xin lỗi",
        "tôi thực sự xin lỗi",
        "là trợ lý",
        "trợ lý ảo",
        "công nghệ nhân tạo",
    ]

    # Repetition detector
    REPETITION_WINDOW = 3  # Don't repeat same phrase in last 3 responses

    @staticmethod
    async def pick_tone_for_session(session_summary: dict) -> str:
        """Pick a tone based on session history."""
        interaction_count = session_summary.get("interaction_count", 0)
        user_sentiment = session_summary.get("sentiment", "neutral")

        if interaction_count <= 1:
            # First message: casual/friendly
            return "casual"
        elif user_sentiment == "frustrated":
            # Upset user: more professional/empathetic
            return "professional"
        else:
            # Default: friendly
            return "friendly"

    @staticmethod
    async def polish_response(
        answer: str,
        session_id: str,
        tone: str,
        response_history: list = None
    ) -> str:
        """Polish response: remove robot phrases, check repetition."""

        if not answer:
            return answer

        polished = answer
        response_history = response_history or []

        # 1. Remove banned phrases
        for banned in VoiceConsistency.BANNED_PHRASES:
            polished = polished.replace(banned, "")
            # Case-insensitive cleanup
            polished = re.sub(rf"{re.escape(banned)}", "", polished, flags=re.IGNORECASE)

        # 2. Fix spacing
        polished = re.sub(r'\s+', ' ', polished).strip()

        # 3. Check for repetition
        if response_history and _is_repetitive_content(polished, response_history):
            # Try to rephrase (simplified without LLM for now)
            polished = _simple_rephrase(polished)

        # 4. Ensure consistent pronouns
        if tone == "casual":
            polished = polished.replace("tôi", "mình")
            polished = polished.replace("quý khách", "bạn")
        elif tone == "professional":
            polished = polished.replace("mình", "em")

        # 5. Remove apologetic softening if not needed
        # Only keep apologies for genuine errors
        if not _context_needs_apology(session_id):
            polished = polished.replace("xin lỗi, ", "")
            polished = polished.replace("xin lỗi. ", "")
            polished = re.sub(r'xin lỗi,?\s+', '', polished, count=1)

        # Final cleanup
        polished = re.sub(r'\s+', ' ', polished).strip()

        console.print(f"[dim]  VoiceConsistency: tone={tone}, polished response[/]")
        return polished


def _is_repetitive_content(new_response: str, response_history: list) -> bool:
    """Check if new response repeats phrases from recent history."""
    if not response_history or len(response_history) == 0:
        return False

    # Extract key phrases from new response (sentences, key words)
    new_phrases = set(new_response.lower().split())

    # Check against recent responses
    for prev_response in response_history[:VoiceConsistency.REPETITION_WINDOW]:
        if not prev_response:
            continue
        prev_phrases = set(prev_response.lower().split())

        # If more than 60% overlap, consider it repetitive
        if prev_phrases and len(new_phrases & prev_phrases) / len(prev_phrases) > 0.6:
            return True

    return False


def _simple_rephrase(answer: str) -> str:
    """Simple rule-based rephrase to avoid repetition."""
    # Replace common patterns
    replacements = {
        r"không có cách nào": "tiếp tục chờ không thể",
        r"rất tiếc": "thật buồn",
        r"cảm ơn bạn": "cảm ơn quý khách",
        r"chúc bạn": "chúc quý khách",
    }

    result = answer
    for pattern, replacement in replacements.items():
        result = re.sub(pattern, replacement, result, flags=re.IGNORECASE)

    return result


def _context_needs_apology(session_id: str) -> bool:
    """Determine if apology is contextually appropriate."""
    # In a real implementation, check session_id against problem types
    # For now, always allow it (better to over-apologize than under-apologize)
    return True
