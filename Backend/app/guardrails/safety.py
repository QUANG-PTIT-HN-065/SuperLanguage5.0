"""Guardrails (các lớp lọc an toàn) cho AI Chat, chấm phát âm và TTS.

Thứ tự áp dụng trong luồng chat:

L0. ``normalize_text``       - chuẩn hoá Unicode, bỏ ký tự vô hình/điều khiển.
L1. ``screen_user_message``  - chặn rỗng/quá dài/prompt injection/chủ đề không an toàn/spam.
L2. ``filter_ai_reply``      - làm sạch câu trả lời AI: bỏ markdown, HTML, link, emoji,
                               che dữ liệu cá nhân, cắt câu làm lộ prompt hệ thống.
    ``filter_ai_feedback``   - làm sạch phần nhận xét tiếng Việt.
    ``sanitize_ai_payload``  - làm sạch từng trường chuỗi trong JSON AI trả về.
L3. ``speakable_text``       - chuẩn hoá văn bản trước khi gửi sang dịch vụ đọc (TTS).

Mọi hàm ở đây đều thuần (không I/O, không phụ thuộc FastAPI) để dễ test và
tái sử dụng ở endpoint khác.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass
from typing import Any

MAX_INPUT_CHARS = 4000
MAX_REPLY_CHARS = 2000
MAX_FEEDBACK_CHARS = 2000
MAX_SPEECH_CHARS = 4000

SAFE_FALLBACK_REPLY = (
    "Mình chưa tạo được câu trả lời phù hợp. Bạn nói lại giúp mình một câu ngắn nhé!"
)

GUARDRAIL_MESSAGES = {
    "empty": "Bạn hãy nhập một câu ngắn để mình cùng luyện tập nhé!",
    "too_long": (
        "Tin nhắn dài quá giới hạn 4000 ký tự. Bạn chia thành câu ngắn hơn giúp mình nhé!"
    ),
    "spam": (
        "Tin nhắn có vẻ bị lặp lại quá nhiều ký tự. Bạn thử diễn đạt lại thành một câu nhé!"
    ),
    "prompt_injection": (
        "Mình chỉ hỗ trợ luyện nói và sửa lỗi ngôn ngữ, không thể chia sẻ hướng dẫn hệ thống. "
        "Mình tiếp tục luyện tập nhé!"
    ),
    "unsafe_topic": (
        "Chủ đề này nằm ngoài phạm vi luyện tập an toàn của SuperLanguage. "
        "Mình đổi sang chủ đề khác nhé!"
    ),
}

_ZERO_WIDTH_TABLE = dict.fromkeys(
    map(ord, "\u200b\u200c\u200d\u2060\u2061\u2062\u2063\ufeff\u00ad"), None
)
_CONTROL_CHARS_RE = re.compile(r"[\x00-\x08\x0b-\x1f\x7f]")
_INLINE_SPACE_RE = re.compile(r"[ \t\u00a0]+")
_MANY_BLANK_LINES_RE = re.compile(r"\n{3,}")
_SENTENCE_SPLIT_RE = re.compile(r"(?<=[.!?…\n])\s+")
_HAS_CONTENT_RE = re.compile(r"[0-9A-Za-zÀ-ỹ]")
_SPEAKABLE_RE = re.compile(r"[0-9A-Za-zÀ-ỹ]")

# Ký hiệu markdown/trang trí mà dịch vụ TTS hay đọc sai hoặc từ chối.
_SPEECH_SYMBOL_RE = re.compile(r"[*_~`#<>|\\^={}\[\]]")
_BRACKET_RE = re.compile(r"\[[^\]]{0,80}\]")
_REPEATED_DOTS_RE = re.compile(r"\.(?:\s*\.)+")

# Ký tự emoji / pictograph (không nằm trong bảng chữ cái tiếng Việt).
_EMOJI_RE = re.compile(
    "["
    "\U0001f000-\U0001faff"
    "\U00002600-\U000027bf"
    "\U0001f1e6-\U0001f1ff"
    "\U00002b00-\U00002bff"
    "\u2190-\u21ff"
    "\u2300-\u23ff"
    "\ufe0f\u20e3\u200d"
    "]"
)

_CODE_FENCE_RE = re.compile(r"```.*?```", re.DOTALL)
_INLINE_CODE_RE = re.compile(r"`([^`]*)`")
_MD_IMAGE_RE = re.compile(r"!\[[^\]]*\]\([^)]*\)")
_MD_LINK_RE = re.compile(r"\[([^\]]*)\]\((?:https?://|www\.)[^)]*\)")
_HTML_TAG_RE = re.compile(r"</?[a-zA-Z][^>]{0,80}>")
_URL_RE = re.compile(r"(?:https?://|www\.)[^\s]+", re.IGNORECASE)
_EMAIL_RE = re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+")
_PHONE_RE = re.compile(r"(?<!\d)\+?\d[\d .-]{8,}\d(?!\d)")
_MD_MARKER_RE = re.compile(r"\*{1,3}|~{2}|(?<!\w)_{1,3}(?!\w)")
_ROLE_MARKER_RE = re.compile(
    r"\[\s*(?:AI Response|Feedback in Vietnamese|IN[\s_-]?SCOPE|OUT[\s_-]?OF[\s_-]?SCOPE)\s*\]",
    re.IGNORECASE,
)

_PROMPT_LEAK_RE = re.compile(
    r"(?:system\s*prompt|prompt\s*hệ\s*thống|chỉ\s*dẫn\s*hệ\s*thống|"
    r"hướng\s*dẫn\s*hệ\s*thống|nhắc\s*nhở\s*hệ\s*thống|"
    r"developer\s*(?:message|prompt)|system\s*message|"
    r"as\s+an\s+ai\s+language\s+model|tôi\s+là\s+một\s+mô\s*hình\s+ngôn\s*ngữ)",
    re.IGNORECASE,
)

# L1 - ý đồ điều khiển/bóc tách chỉ dẫn của mô hình.
_INJECTION_RES = (
    re.compile(
        r"ignore\s+(?:all\s+|any\s+)?(?:previous|above|prior|earlier)\s+"
        r"(?:instruction|prompt|rule|message)s?"
    ),
    re.compile(
        r"bỏ\s+qua\s+(?:mọi\s+|tất\s+cả\s+|các\s+)?(?:hướng\s*dẫn|chỉ\s*dẫn|luật|quy\s*tắc)"
    ),
    re.compile(
        r"(?:show|reveal|print|repeat|dump|translate)\s+(?:me\s+)?(?:your\s+)?"
        r"(?:system\s+|hidden\s+)?(?:prompt|instruction)s?"
    ),
    re.compile(
        r"(?:tiết\s*lộ|in\s*ra|hiển\s*thị|cho\s+(?:tôi\s+)?xem)\s+"
        r"(?:system\s*)?(?:prompt|hướng\s*dẫn\s*hệ\s*thống|chỉ\s*dẫn\s*hệ\s*thống)"
    ),
    re.compile(r"you\s+are\s+now\s+(?:a|an|my)\s+\w+"),
    re.compile(r"act\s+as\s+(?:a|an)\s+(?:unrestricted|jailbroken|developer)"),
    re.compile(r"\bjailbreak\b|\bdan\s+mode\b|do\s+anything\s+now"),
    re.compile(r"developer\s+mode|chế\s*độ\s+developer"),
    re.compile(r"<\|?(?:system|assistant|im_start|im_end)\|?>"),
)

# L1 - chủ đề không phù hợp với app học ngôn ngữ (bạo lực, tự hại, nội dung người lớn...).
_UNSAFE_RES = (
    re.compile(
        r"how\s+to\s+(?:make|build|create)\s+(?:a\s+)?"
        r"(?:bomb|explosive|gun|weapon|poison)"
    ),
    re.compile(r"chế\s*(?:tạo|ra)\s*(?:bom|thuốc\s*nổ|súng|chất\s*độc)"),
    re.compile(r"\b(?:kill|murder|poison)\s+(?:my|your|him|her|them|someone|people)\b"),
    re.compile(r"giết\s+(?:người|nó|hắn|bạn|mẹ|bố|thầy|cô)"),
    re.compile(r"\b(?:suicide|self[-\s]?harm|tự\s*tử|tự\s*làm\s*đau)\b"),
    re.compile(r"\b(?:child|underage|minor)\s+(?:porn|sexual|nude)\b"),
    re.compile(r"\b(?:mua|bán)\s+(?:ma\s*túy|chất\s*cấm|súng)\b"),
    re.compile(r"\b(?:làm|hack|crack)\s+(?:giả|tài\s*khoản|mật\s*khẩu)\b"),
)


@dataclass(frozen=True)
class GuardrailVerdict:
    """Kết quả một lớp lọc: có cho đi tiếp hay không và nội dung đã chuẩn hoá."""

    allowed: bool
    text: str
    code: str = ""
    message: str = ""


# ---------------------------------------------------------------------------
# L0 - chuẩn hoá
# ---------------------------------------------------------------------------


def normalize_text(text: str) -> str:
    """Chuẩn hoá Unicode và bỏ ký tự điều khiển/vô hình nhưng giữ dấu tiếng Việt."""
    if not isinstance(text, str):
        return ""
    cleaned = unicodedata.normalize("NFKC", text).translate(_ZERO_WIDTH_TABLE)
    cleaned = cleaned.replace("\r\n", "\n").replace("\r", "\n")
    cleaned = _CONTROL_CHARS_RE.sub(" ", cleaned)
    cleaned = _INLINE_SPACE_RE.sub(" ", cleaned)
    cleaned = "\n".join(line.strip() for line in cleaned.split("\n"))
    cleaned = _MANY_BLANK_LINES_RE.sub("\n\n", cleaned)
    return cleaned.strip()


# ---------------------------------------------------------------------------
# L1 - lọc đầu vào của học viên
# ---------------------------------------------------------------------------


def _is_spam(text: str) -> bool:
    compact = re.sub(r"\s+", "", text)
    if len(compact) >= 12 and len(set(compact)) == 1:
        return True
    if re.search(r"(\w)\1{14,}", compact):
        return True
    tokens = text.split()
    if len(tokens) >= 8 and len(set(tokens)) / len(tokens) < 0.25:
        return True
    return False


def screen_user_message(text: str) -> GuardrailVerdict:
    """L1: kiểm tra tin nhắn trước khi gọi AI, trả về câu từ chối thay cho AI."""
    cleaned = normalize_text(text)
    if not cleaned:
        return GuardrailVerdict(False, "", "empty", GUARDRAIL_MESSAGES["empty"])

    if len(cleaned) > MAX_INPUT_CHARS:
        return GuardrailVerdict(
            False,
            cleaned[:MAX_INPUT_CHARS],
            "too_long",
            GUARDRAIL_MESSAGES["too_long"],
        )

    probe = cleaned.casefold()
    if any(pattern.search(probe) for pattern in _INJECTION_RES):
        return GuardrailVerdict(
            False, cleaned, "prompt_injection", GUARDRAIL_MESSAGES["prompt_injection"]
        )
    if any(pattern.search(probe) for pattern in _UNSAFE_RES):
        return GuardrailVerdict(
            False, cleaned, "unsafe_topic", GUARDRAIL_MESSAGES["unsafe_topic"]
        )
    if _is_spam(cleaned):
        return GuardrailVerdict(False, cleaned, "spam", GUARDRAIL_MESSAGES["spam"])

    return GuardrailVerdict(True, cleaned)


# ---------------------------------------------------------------------------
# L2 - lọc đầu ra của AI
# ---------------------------------------------------------------------------


def _drop_prompt_leaks(text: str) -> str:
    if not _PROMPT_LEAK_RE.search(text):
        return text
    kept = [
        sentence.strip()
        for sentence in _SENTENCE_SPLIT_RE.split(text)
        if sentence.strip() and not _PROMPT_LEAK_RE.search(sentence)
    ]
    return " ".join(kept)


def _truncate(text: str, max_chars: int) -> str:
    if len(text) <= max_chars:
        return text
    window = text[:max_chars]
    cut = max(window.rfind(". "), window.rfind("! "), window.rfind("? "))
    if cut >= max_chars // 3:
        return window[: cut + 1].rstrip()
    return window.rstrip() + "…"


def sanitize_text(text: str, *, max_chars: int = MAX_REPLY_CHARS) -> str:
    """L2: bỏ markdown/HTML/link/emoji, che dữ liệu cá nhân, giới hạn độ dài."""
    cleaned = normalize_text(text)
    if not cleaned:
        return ""

    cleaned = _CODE_FENCE_RE.sub(" ", cleaned)
    cleaned = _MD_IMAGE_RE.sub(" ", cleaned)
    cleaned = _MD_LINK_RE.sub(r"\1", cleaned)
    cleaned = _HTML_TAG_RE.sub(" ", cleaned)
    cleaned = _INLINE_CODE_RE.sub(r"\1", cleaned)
    cleaned = _ROLE_MARKER_RE.sub(" ", cleaned)
    cleaned = _URL_RE.sub(" ", cleaned)
    cleaned = _EMAIL_RE.sub("[liên kết đã ẩn]", cleaned)
    cleaned = _PHONE_RE.sub(" ", cleaned)
    cleaned = _EMOJI_RE.sub("", cleaned)
    cleaned = _MD_MARKER_RE.sub("", cleaned)
    cleaned = _drop_prompt_leaks(cleaned)
    cleaned = _INLINE_SPACE_RE.sub(" ", cleaned)
    cleaned = re.sub(r"\s+([,.;:!?…])", r"\1", cleaned)
    cleaned = normalize_text(cleaned)
    return _truncate(cleaned, max_chars).strip()


def filter_ai_reply(raw: str, *, fallback: str = SAFE_FALLBACK_REPLY) -> str:
    """L2: làm sạch câu trả lời AI; trả câu dự phòng nếu sau lọc không còn nội dung."""
    cleaned = sanitize_text(raw, max_chars=MAX_REPLY_CHARS)
    if not cleaned or not _HAS_CONTENT_RE.search(cleaned):
        return fallback
    return cleaned


def filter_ai_feedback(raw: str) -> str:
    """L2: làm sạch phần nhận xét tiếng Việt (được phép rỗng).

    Feedback của AI là chuỗi JSON mà giao diện tự parse, nên JSON được giữ nguyên
    cấu trúc (chỉ cắt độ dài); văn bản thường mới đi qua lớp làm sạch đầy đủ.
    """
    if not isinstance(raw, str):
        return ""
    stripped = raw.strip()
    if stripped.startswith(("{", "[")):
        return _truncate(stripped, MAX_FEEDBACK_CHARS)
    cleaned = sanitize_text(stripped, max_chars=MAX_FEEDBACK_CHARS)
    return cleaned if _HAS_CONTENT_RE.search(cleaned) else ""


def sanitize_ai_payload(
    payload: dict[str, Any], *, max_chars: int = MAX_FEEDBACK_CHARS
) -> dict[str, Any]:
    """L2: làm sạch mọi trường chuỗi trong JSON AI trả về, giữ nguyên số/None."""
    if not isinstance(payload, dict):
        return {}
    return {
        key: sanitize_text(value, max_chars=max_chars) if isinstance(value, str) else value
        for key, value in payload.items()
    }


def sanitize_stream_chunk(delta: str) -> str:
    """L2: lọc nhẹ từng gói khi stream (không bỏ markdown để không làm vỡ giao diện)."""
    if not isinstance(delta, str) or not delta:
        return ""
    cleaned = unicodedata.normalize("NFKC", delta).translate(_ZERO_WIDTH_TABLE)
    cleaned = _CONTROL_CHARS_RE.sub("", cleaned)
    cleaned = _ROLE_MARKER_RE.sub("", cleaned)
    cleaned = _EMOJI_RE.sub("", cleaned)
    return cleaned


# ---------------------------------------------------------------------------
# L3 - chuẩn bị văn bản cho TTS
# ---------------------------------------------------------------------------


def speakable_text(text: str) -> str:
    """L3: biến câu trả lời AI thành văn bản sạch để dịch vụ đọc phát âm.

    Raises:
        ValueError: khi sau khi lọc không còn ký tự nào đọc được.
    """
    cleaned = sanitize_text(text, max_chars=MAX_SPEECH_CHARS)
    cleaned = _BRACKET_RE.sub(" ", cleaned)
    cleaned = _SPEECH_SYMBOL_RE.sub(" ", cleaned)
    cleaned = cleaned.replace("\n", ". ")
    cleaned = _REPEATED_DOTS_RE.sub(".", cleaned)
    cleaned = _INLINE_SPACE_RE.sub(" ", cleaned).strip(" .,;:-–—")
    if not _SPEAKABLE_RE.search(cleaned):
        raise ValueError("Văn bản cần đọc không có nội dung phù hợp để phát âm.")
    if not cleaned.endswith((".", "!", "?", "…")):
        cleaned = f"{cleaned}."
    return cleaned
