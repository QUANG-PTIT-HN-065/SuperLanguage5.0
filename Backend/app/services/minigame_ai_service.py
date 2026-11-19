import json
import logging

from google import genai
from google.genai import types
from pydantic import ValidationError

from app.core.config import settings
from app.schemas.minigame import (
    MiniGameEvaluationRequest,
    MiniGameEvaluationResponse,
)

logger = logging.getLogger(__name__)
_DEFAULT_MODEL = "gemini-3.5-flash-lite"


class MiniGameAIError(RuntimeError):
    """Raised when the dedicated mini-game judge cannot return a valid result."""


def _build_prompt(request: MiniGameEvaluationRequest) -> str:
    cards = "\n".join(
        f"- word={card.word!r}; meaning={card.meaning!r}; "
        f"part_of_speech={card.part_of_speech!r}; example={card.example!r}"
        for card in request.cards
    )
    return f"""Bạn là bộ chấm câu độc lập cho mini game học ngôn ngữ.
Chỉ chấm câu được gửi, không trò chuyện và không sử dụng kiến thức ngoài dữ liệu đầu vào.

Ngôn ngữ: {request.language}
Trình độ: {request.level}
Luật bắt buộc của tầng: {request.rule_title}
Mô tả luật: {request.rule_description}
Các thẻ người chơi đã chọn:
{cards}
Câu người chơi: {request.sentence!r}

Kiểm tra thật kỹ cả 4 điều:
1. Câu có đúng ngữ pháp và đúng cấu trúc của luật không.
2. Tất cả từ đã chọn có được dùng đúng từ loại/nghĩa không.
3. Ý nghĩa câu có tự nhiên, phù hợp ngữ cảnh không.
4. Không chấp nhận câu chỉ chứa từ khóa nhưng vô nghĩa hoặc ghép từ tùy tiện.

accepted chỉ là true khi cả cấu trúc, ngữ pháp, nghĩa và ngữ cảnh đều đạt.
Nếu có lỗi, accepted=false và nêu đúng lỗi. score từ 0 đến 100.
Chỉ trả về một JSON object hợp lệ, không markdown, không giải thích ngoài JSON:
{{"accepted":true,"score":0,"grammar_correct":true,"meaning_correct":true,
"context_appropriate":true,"reason":"...","correction":"...","short_hint":"..."}}
"""


def evaluate_minigame_answer(
    request: MiniGameEvaluationRequest,
) -> MiniGameEvaluationResponse:
    keys = [key.strip() for key in settings.GEMINI_API_KEYS.split(",") if key.strip()]
    if not keys:
        raise MiniGameAIError("No mini-game AI provider key is configured.")

    model = (getattr(settings, "MINIGAME_AI_MODEL", "") or "").strip() or _DEFAULT_MODEL
    last_error: Exception | None = None
    for key in keys:
        try:
            client = genai.Client(api_key=key)
            response = client.models.generate_content(
                model=model,
                contents=_build_prompt(request),
                config=types.GenerateContentConfig(
                    temperature=0,
                    response_mime_type="application/json",
                ),
            )
            raw_text = (response.text or "").strip()
            payload = json.loads(raw_text)
            return MiniGameEvaluationResponse.model_validate(payload)
        except (json.JSONDecodeError, ValidationError, ValueError) as exc:
            last_error = exc
            logger.warning("Mini-game AI returned an invalid evaluation.")
        except Exception as exc:
            last_error = exc
            logger.warning("Mini-game AI provider failed (%s).", type(exc).__name__)

    raise MiniGameAIError("Mini-game AI did not return a valid evaluation.") from last_error
