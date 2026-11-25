import json
import logging
from typing import Any

from google import genai
from google.genai import types
from pydantic import ValidationError

from app.core.config import settings
from app.schemas.writing import WritingEvaluation, WritingTopic

logger = logging.getLogger(__name__)
_DEFAULT_MODEL = "gemini-3.5-flash-lite"

# Model nhẹ hay bị Google trả 503 "high demand" theo cơn; thử tiếp model kế
# trong danh sách thay vì báo lỗi ngay.
_FALLBACK_MODELS = ("gemini-3.5-flash", "gemini-3.1-flash-lite")

_LANGUAGE_NAMES = {"en": "English", "ja": "Japanese", "vi": "Vietnamese"}

# Chủ đề dự phòng để trang luyện viết vẫn dùng được khi nhà cung cấp AI lỗi.
_FALLBACK_TOPICS: dict[str, list[tuple[str, str, int]]] = {
    "A1": [
        ("My typical day", "Write about what you do from morning to evening.", 50),
        ("My family", "Describe your family members and what they like.", 50),
        ("My favourite food", "Describe a meal you love and when you eat it.", 40),
    ],
    "A2": [
        ("A place I love", "Describe a place you often visit and why you like it.", 70),
        ("My last weekend", "Tell what you did last weekend and how it went.", 70),
        ("Learning a new skill", "Describe something you are learning now.", 80),
    ],
    "B1": [
        ("Technology in daily life", "Explain how technology changed your routine.", 100),
        ("A journey that taught me something", "Narrate a trip and the lesson you took from it.", 110),
        ("Working from home", "Discuss one advantage and one drawback of remote work.", 100),
    ],
    "B2": [
        ("Should universities charge tuition?", "State a position and defend it with examples.", 140),
        ("The future of cities", "Analyse one urban problem and propose a solution.", 150),
        ("Social media and mental health", "Weigh the benefits against the risks.", 140),
    ],
    "C1": [
        ("Is artificial intelligence a creative partner or a threat?", "Argue a nuanced position with evidence.", 200),
        ("Globalisation and local identity", "Analyse the tension between the two forces.", 200),
    ],
    "C2": [
        ("The ethics of persuasion", "Critically examine how argument, rhetoric and manipulation overlap.", 240),
        ("Progress and its discontents", "Evaluate whether technological progress improves wellbeing.", 240),
    ],
    "N5": [
        ("私の一日", "朝から夜まで、いつもすることを簡単な日本語で書いてください。", 40),
        ("私の家族", "家族のことや好きなことを簡単な日本語で書いてください。", 40),
        ("好きな食べ物", "好きな食べ物と、いつ食べるかを書いてください。", 35),
    ],
    "N4": [
        ("行きたい場所", "よく行く場所と、なぜ好きかを日本語で書いてください。", 60),
        ("先週末のこと", "先週末にしたことと、どうだったかを書いてください。", 65),
        ("新しい趣味", "今習っていることを日本語で説明してください。", 70),
    ],
    "N3": [
        ("生活とテクノロジー", "テクノロジーが毎日の生活をどう変えたかを書いてください。", 90),
        ("忘れられない旅行", "旅行の経験から学んだことを日本語で書いてください。", 100),
        ("在宅ワーク", "在宅ワークの良い点と悪い点を一つずつ書いてください。", 95),
    ],
    "N2": [
        ("大学は学費を取るべきか", "自分の意見を例を挙げて日本語で論じてください。", 130),
        ("都市の未来", "都市の問題を一つ分析し、解決策を提案してください。", 140),
        ("SNSと心の健康", "利点とリスクを比べて日本語で書いてください。", 135),
    ],
    "N1": [
        ("AIは創造のpartnerか脅威か", "証拠を挙げ、細やかな立場を日本語で論じてください。", 190),
        ("グローバル化と地域のアイデンティティ", "二つの力の緊張関係を分析してください。", 200),
    ],
}


class WritingAIError(RuntimeError):
    """Raised when the writing judge cannot return a valid evaluation."""


def _language_name(language: str) -> str:
    return _LANGUAGE_NAMES.get(str(language).lower(), str(language))


def _model() -> str:
    return (getattr(settings, "WRITING_AI_MODEL", "") or "").strip() or _DEFAULT_MODEL


def _models() -> list[str]:
    ordered = [_model(), *_FALLBACK_MODELS, _DEFAULT_MODEL]
    return list(dict.fromkeys(name for name in ordered if name))


def _level_rule(level: str) -> str:
    """Văn phong đời thường theo từng trình độ — dùng chung cho ra đề và chấm bài."""
    return (
        f"Văn phong bắt buộc cho trình độ {(level or 'A2').upper()}: "
        "chỉ dùng từ ngữ đời thường mà người bản xứ dùng khi nói chuyện hằng ngày. "
        "Cấm từ ngữ học thuật, văn bản hành chính, báo cáo nghiên cứu, thuật ngữ chuyên ngành "
        "và từ trừu tượng hiếm gặp (ví dụ tiếng Anh: utilize, commence, demonstrate, consequently, "
        "furthermore, phenomenon, paradigm, facilitate, thereof; tiếng Nhật: 使用～する, 実施する, "
        "すなわち, 当該, ～ aforementioned). Ưu tiên động từ đơn giản, cụ thể và câu ngắn. "
        "Không viết như bài luận thi đại học hay bài báo khoa học."
    )


def _generate_json(prompt: str) -> Any:
    keys = [key.strip() for key in settings.GEMINI_API_KEYS.split(",") if key.strip()]
    if not keys:
        raise WritingAIError("Chưa cấu hình khóa AI cho chấm bài viết.")
    last_error: Exception | None = None
    for model in _models():
        for key in keys:
            try:
                client = genai.Client(api_key=key)
                response = client.models.generate_content(
                    model=model,
                    contents=prompt,
                    config=types.GenerateContentConfig(
                        temperature=0.2,
                        response_mime_type="application/json",
                    ),
                )
                return json.loads((response.text or "").strip())
            except (json.JSONDecodeError, ValueError) as exc:
                last_error = exc
                logger.warning("Writing AI returned invalid JSON (%s).", model)
            except Exception as exc:  # provider lỗi, hết quota, timeout
                last_error = exc
                logger.warning(
                    "Writing AI provider failed on %s (%s).", model, type(exc).__name__
                )
    raise WritingAIError("AI chấm bài viết không trả về kết quả hợp lệ.") from last_error


def _fallback_topics(level: str, count: int) -> list[WritingTopic]:
    bank = _FALLBACK_TOPICS.get(level) or _FALLBACK_TOPICS["A2"]
    return [
        WritingTopic(title=title, prompt=prompt, min_words=words, checklist=[
            "Viết đủ số từ yêu cầu",
            "Có câu mở đoạn và câu kết đoạn",
            "Dùng thì động từ phù hợp với chủ đề",
        ])
        for title, prompt, words in bank[:count]
    ]


def generate_topics(language: str, level: str, count: int) -> list[WritingTopic]:
    """Sinh đề bài viết theo ngôn ngữ + trình độ; tự fallback khi AI lỗi."""
    normalized = (level or "A2").upper()
    try:
        payload = _generate_json(f"""Bạn là giáo viên soạn đề bài viết.
Sinh {count} đề viết đoạn văn bằng {_language_name(language)} cho học viên trình độ {normalized}.
Mỗi đề phải rõ ràng, đời thường, không cần kiến thức chuyên môn.
{_level_rule(normalized)}
title và prompt cũng phải viết bằng từ ngữ đời thường; mỗi đề gắn với một việc thực tế
(ăn uống, đi lại, bạn bè, công việc hằng ngày, sở thích, mua sắm, thời tiết).
Không ra đề nghị luận học thuật, không đòi hỏi số liệu, nghiên cứu hay lý thuyết.
min_words là số từ tối thiểu phù hợp với {normalized} (CEFR: A1 40-60, A2 60-90, B1 90-130, B2 130-170, C1+ 180-260; JLPT tiếng Nhật: N5 30-50, N4 50-80, N3 80-120, N2 120-180, N1 180-260).
checklist: 3 gợi ý ngắn bằng tiếng Việt giúp học viên tự kiểm tra bài.
Chỉ trả về một JSON array hợp lệ, không markdown:
[{{"title":"...","prompt":"...","min_words":80,"checklist":["...","...","..."]}}]
""")
        topics = [WritingTopic.model_validate(item) for item in payload[:count]]
        if topics:
            return topics
    except (WritingAIError, ValidationError, TypeError, KeyError):
        logger.warning("Falling back to curated writing topics for %s.", normalized)
    return _fallback_topics(normalized, count)


def evaluate_writing(
    language: str,
    level: str,
    topic_title: str,
    topic_prompt: str,
    text: str,
) -> WritingEvaluation:
    """Chấm đoạn văn theo 4 tiêu chí, trả về nhận xét + câu sửa."""
    target_level = (level or "A2").upper()
    payload = _generate_json(f"""Bạn là giám khảo chấm writing nghiêm khắc nhưng khích lệ.
Ngôn ngữ bài viết: {_language_name(language)}. Trình độ mục tiêu: {target_level}.
Đề bài: {topic_title!r} — {topic_prompt!r}
Bài của học viên:
\"\"\"{text}\"\"\"

Chấm 4 tiêu chí bắt buộc, tên đúng như sau: Content, Grammar, Vocabulary, Coherence.
Mỗi tiêu chí cho điểm 0-10 và một comment ngắn bằng tiếng Việt nêu đúng lỗi.
overall là điểm tổng làm tròn 0-10 (không phải trung bình cộng máy móc).
corrections: lấy tối đa 8 câu có lỗi, nguyên văn câu sai (original), câu đã sửa (corrected),
và issue ngắn bằng tiếng Việt giải thích lỗi. Bỏ qua câu đã đúng.
{_level_rule(target_level)}
natural_version: viết lại cả đoạn văn giữ đúng ý của học viên, chỉ sửa chỗ thật sự cần,
và giữ nguyên độ đơn giản của câu. Không nâng cấp từ vựng lên mức học thuật, không thêm
liên từ trang trọng, không biến đoạn văn của người học A1/A2 thành bài luận.
Học viên viết câu ngắn thì bản viết lại vẫn là câu ngắn.
corrections[].corrected cũng vậy: sửa lỗi ngữ pháp, giữ cách dùng từ đời thường của học viên.
next_step: 1 việc cụ thể học viên nên luyện tiếp.
summary: 2-3 câu tiếng Việt giản dị, không thuật ngữ ngôn ngữ học, chỉ ra điểm mạnh trước, điểm yếu sau.
Chỉ trả về một JSON object hợp lệ, không markdown:
{{"overall":7,"criteria":[{{"name":"Content","score":7,"comment":"..."}}],
"summary":"...","corrections":[{{"original":"...","corrected":"...","issue":"..."}}],
"natural_version":"...","next_step":"..."}}
""")
    try:
        return WritingEvaluation.model_validate(payload)
    except ValidationError as exc:
        raise WritingAIError("Kết quả chấm bài không đúng cấu trúc.") from exc
