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
_DEFAULT_MODEL = "gemini-2.5-flash"

# Model Gemini thực sự có sẵn; thử nhẹ trước rồi đến bản đầy đủ khi cần.
_FALLBACK_MODELS = ("gemini-2.5-flash-lite", "gemini-1.5-flash", "gemini-2.0-flash")


class MiniGameAIError(RuntimeError):
    """Raised when the dedicated mini-game judge cannot return a valid result."""


def _build_prompt(request: MiniGameEvaluationRequest) -> str:
    cards = "\n".join(
        f"- word={card.word!r}; meaning={card.meaning!r}; "
        f"part_of_speech={card.part_of_speech!r}; example={card.example!r}"
        for card in request.cards
    )
    level = request.level or "A1"
    return f"""Bạn là trọng tài của mini game đặt câu học ngôn ngữ. Bạn chấm ý và cấu trúc, không chấm cách trình bày.

Ngôn ngữ: {request.language}
Trình độ người chơi: {level}
Luật của tầng: {request.rule_title}
Mô tả luật: {request.rule_description}
Thẻ người chơi đã chọn:
{cards}
Câu người chơi: {request.sentence!r}

Câu đạt khi hội đủ cả 3 điều:
1. Có mặt đủ các từ đã chọn và dùng chúng đúng nghĩa, đúng từ loại.
2. Tuân thủ luật của tầng.
3. Một người học ở trình độ {level} đọc lên hiểu được nghĩa.

Về dạng của từ đã chọn — đây là phần hay bị chấm nhầm nhất, đọc kỹ:
- ĐƯỢC PHÉP chia từ theo ngữ pháp: số nhiều, so sánh hơn/kém nhất, ngôi thứ ba,
  quá khứ, hiện tại phân từ, thể lịch sự hay thể ngắn. Ví dụ thẻ "practice" chấp nhận
  practicing / practises / practised; thẻ "work" chấp nhận works / worked / working;
  thẻ bất quy tắc "eat" chấp nhận ate / eaten, "go" chấp nhận went / gone;
  thẻ 勉強する chấp nhận 勉強します / 勉強した / 勉強できる, thẻ 食べる chấp nhận 食べます / 食べた.
- Dạng chia đúng ngữ pháp KHÔNG phải lỗi. Đừng nêu nó trong reason, correction hay
  short_hint, đừng trừ điểm vì nó.
- KHÔNG được thay từ trên thẻ bằng từ đồng nghĩa hay từ khác gần nghĩa
  (thẻ "phone" mà viết "cellphone", thẻ "big" mà viết "large", thẻ "bốn" mà viết "tứ").
  Người chơi phải dùng chính từ trên thẻ, chỉ biến đổi hình thái của nó.
  Nếu một thẻ bị thay bằng từ khác thì thẻ đó coi như thiếu và accepted=false,
  reason ghi rõ phải dùng lại từ nào.

Khoan dung bắt buộc — những điều sau KHÔNG được làm sai, KHÔNG được trừ điểm,
KHÔNG được nêu làm lý do từ chối:
- Viết hoa hay viết thường chữ đầu câu, tên riêng, đại từ I; thiếu dấu chấm,
  dấu hỏi, dấu phẩy; khoảng trắng thừa; dấu câu dùng theo kiểu khác; gạch nối.
- Lỗi đánh máy nhỏ mà nghĩa vẫn rõ.
- Câu ngắn, câu đơn giản, lặp từ, dùng từ cơ bản thay vì từ hay hơn.
- Câu dài dòng, nhiều mệnh đề, cấu trúc phức tạp hơn mức cần thiết.
- Văn phong chưa tự nhiên, chưa "sang", thiếu lịch sự, thiếu ý tưởng phức tạp.
Nếu câu chỉ vướng mấy lỗi trên thì accepted=true và góp ý nhẹ trong short_hint.

accepted=false chỉ khi: thiếu luật của tầng, thiếu một từ đã chọn (kể cả ở dạng chia
nào) hoặc từ đã chọn bị thay bằng từ đồng nghĩa, dùng sai từ loại/nghĩa làm câu vô nghĩa,
câu chỉ ghép từ khóa liệt kê rời rạc, hoặc câu không liên quan gì thẻ đã chọn.
Chấm theo chuẩn người học đang luyện {level}, không theo chuẩn văn viết học thuật.

score: 0-100, phản ánh cấu trúc + nghĩa; câu đơn giản mà đúng luật thì >= 70.
reason: một câu tiếng Việt giản dị nêu lý do đạt/không đạt, bắt buộc viết bằng tiếng Việt.
correction: chỉ viết khi thật sự có lỗi ngữ pháp làm hỏng nghĩa, giữ nguyên ý người chơi,
dùng từ đời thường đúng trình độ {level}; ngược lại để chuỗi rỗng.
short_hint: một gợi ý ngắn bằng tiếng Việt giản dị, không thuật ngữ ngôn ngữ học.
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
    models = list(dict.fromkeys([model, *_FALLBACK_MODELS, _DEFAULT_MODEL]))
    last_error: Exception | None = None
    for name in models:
        for key in keys:
            try:
                client = genai.Client(api_key=key)
                response = client.models.generate_content(
                    model=name,
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
                logger.warning("Mini-game AI returned an invalid evaluation (%s).", name)
            except Exception as exc:
                last_error = exc
                logger.warning(
                    "Mini-game AI provider failed on %s (%s).", name, type(exc).__name__
                )

    raise MiniGameAIError("Mini-game AI did not return a valid evaluation.") from last_error
