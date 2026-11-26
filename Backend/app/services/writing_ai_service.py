import json
import logging
import re
from typing import Any

from google import genai
from google.genai import types
from pydantic import ValidationError

from app.core.config import settings
from app.schemas.writing import WritingEvaluation, WritingTopic

logger = logging.getLogger(__name__)
_DEFAULT_MODEL = "gemini-2.5-flash-lite"

# Model nhẹ hay bị Google trả 503 "high demand" theo cơn; thử tiếp model kế
# trong danh sách thay vì báo lỗi ngay.
_FALLBACK_MODELS = ("gemini-2.5-flash", "gemini-2.0-flash")

_LANGUAGE_NAMES = {"en": "English", "ja": "Japanese", "vi": "Vietnamese"}

_VIETNAMESE_DIACRITICS = re.compile(
    r"[àáảãạăắằẳẵặâấầẩẫậèéẻẽẹêếềểễệìíỉĩịòóỏõọôốồổỗộơớờởỡợùúủũụưứừửữựỳýỷỹỵđ"
    r"ÀÁẢÃẠĂẮẰẲẴẶÂẤẦẨẪẬÈÉẺẼẸÊẾỀỂỄỆÌÍỈĨỊÒÓỎÕỌÔỐỒỔỖỘƠỚỜỞỠỢÙÚỦŨỤƯỨỪỬỮỰỲÝỶỸỴĐ]"
)
_JAPANESE_CHARS = re.compile(r"[\u3040-\u30ff\u4e00-\u9fff]")

# Chủ đề dự phòng đồng nhất 100% ngôn ngữ theo từng trình độ:
# tuple[title, prompt, min_words, checklist]
_FALLBACK_TOPICS: dict[str, list[tuple[str, str, int, list[str]]]] = {
    "A1": [
        (
            "My typical day",
            "Write about what you do from morning to evening.",
            50,
            [
                "Describe what time you wake up and go to sleep",
                "Mention at least two daily activities",
                "Use simple present tense accurately",
            ],
        ),
        (
            "My family",
            "Describe your family members and what they like.",
            50,
            [
                "Introduce the members of your family",
                "Describe what each person enjoys doing",
                "Use simple descriptive adjectives",
            ],
        ),
        (
            "My favourite food",
            "Describe a meal you love and when you eat it.",
            40,
            [
                "Name your favourite food or dish",
                "Explain what it tastes like and why you like it",
                "Mention how often or when you eat it",
            ],
        ),
    ],
    "A2": [
        (
            "A place I love",
            "Describe a place you often visit and why you like it.",
            70,
            [
                "Name the place and where it is located",
                "Explain what you usually do there",
                "Give at least two reasons why you enjoy visiting",
            ],
        ),
        (
            "My last weekend",
            "Tell what you did last weekend and how it went.",
            70,
            [
                "Describe where you went or what you did",
                "Use past tense verbs correctly",
                "Share your feelings about the weekend",
            ],
        ),
        (
            "Learning a new skill",
            "Describe something you are learning now.",
            80,
            [
                "Explain what skill you are currently learning",
                "Describe how you practice it",
                "Share why this skill is important to you",
            ],
        ),
    ],
    "B1": [
        (
            "Eating out at a restaurant",
            "Write a short paragraph about your favorite restaurant. What do you usually order there? Why do you like going there?",
            90,
            [
                "Name and describe your favorite restaurant",
                "Mention what dishes you usually order",
                "Explain why you enjoy going there with simple reasons",
            ],
        ),
        (
            "Daily commute",
            "Write a short paragraph about how you go to work or school every day. How long does it take and what do you see on the way?",
            90,
            [
                "Describe your daily route to work or school",
                "Mention how long your travel takes",
                "Describe interesting things you see along the way",
            ],
        ),
        (
            "Weekend shopping",
            "Write a short paragraph about your last shopping trip. Where did you go and what did you buy?",
            90,
            [
                "Describe where you went shopping",
                "List what items you bought",
                "Explain how you felt about your shopping experience",
            ],
        ),
        (
            "Weekend hobbies",
            "Write a short paragraph about what you usually do on Saturday and Sunday. Who do you spend time with?",
            90,
            [
                "Describe your favorite weekend activities",
                "Mention who you usually spend time with",
                "Explain how these activities help you relax",
            ],
        ),
    ],
    "B2": [
        (
            "Cooking dinner with friends",
            "Write a short paragraph about a time you cooked dinner for your friends at home. What did you make? Did everything go well?",
            130,
            [
                "Describe the meal and dishes you prepared",
                "Narrate how the cooking and dinner went",
                "Use natural, conversational storytelling",
            ],
        ),
        (
            "Traffic jam on the way to work",
            "Write a short paragraph about a bad traffic jam you got stuck in recently. How did it happen and what did you do?",
            130,
            [
                "Describe when and where the traffic jam happened",
                "Explain how you spent the waiting time",
                "Reflect on how it affected your schedule and mood",
            ],
        ),
        (
            "A rainy day at home",
            "Write a short paragraph about a rainy day when you stayed indoors all day. What did you do to pass the time?",
            130,
            [
                "Describe the stormy weather outside",
                "List the relaxing activities you enjoyed at home",
                "Describe your overall mood during the day",
            ],
        ),
        (
            "Exploring a local market",
            "Write a short paragraph about visiting an outdoor market in your neighborhood. What sights and sounds caught your attention?",
            130,
            [
                "Describe the vibrant atmosphere and stalls",
                "Mention items or fresh foods you browsed",
                "Explain what made the visit enjoyable",
            ],
        ),
    ],
    "C1": [
        (
            "A tricky shopping experience",
            "Write about a time you had a problem while shopping, such as being overcharged or receiving damaged goods. How did you talk to the staff to resolve it?",
            180,
            [
                "Clearly narrate what problem occurred at the shop",
                "Describe how you communicated with the staff to fix it",
                "Reflect on your emotions and how satisfied you were with the outcome",
            ],
        ),
        (
            "Missing a morning commute",
            "Write about a morning when you missed your regular bus or train because you overslept. How did you handle the situation to arrive on time?",
            180,
            [
                "Describe the morning rush and why the delay happened",
                "Explain what alternative steps you took to reach your destination",
                "Reflect on what the experience taught you about planning",
            ],
        ),
        (
            "Unexpected stormy weather",
            "Write about a time when sudden bad weather disrupted your outdoor plans. How did you adapt your schedule?",
            180,
            [
                "Describe how quickly the weather changed",
                "Explain how you and your companions adapted your plans",
                "Reflect on how you made the best of the situation",
            ],
        ),
    ],
    "C2": [
        (
            "A memorable weekend outing",
            "Write a vivid paragraph about a memorable weekend spent exploring a bustling corner of town with close friends.",
            190,
            [
                "Capture the atmosphere, sights, and interactions vividly",
                "Use natural, fluent idiomatic everyday expressions",
                "Convey personal reflections smoothly without sounding overly academic",
            ],
        ),
        (
            "Morning rush hour reflections",
            "Write a thoughtful paragraph about a hectic morning rush hour and how you observed people coping with modern city life.",
            190,
            [
                "Describe specific observations from the morning commute",
                "Reflect on urban pace and personal patience",
                "Maintain an engaging, relatable conversational tone",
            ],
        ),
        (
            "A lazy Sunday afternoon",
            "Write about the simple joys and restorative power of spending an unplanned Sunday completely resting at home.",
            190,
            [
                "Describe how you spent the quiet hours at home",
                "Convey the sensory details of rest and relaxation",
                "Reflect on the importance of downtime in a busy life",
            ],
        ),
    ],
    "N5": [
        (
            "私の一日",
            "朝から夜まで、いつもすることを簡単な日本語で書いてください。",
            40,
            [
                "朝起きてから夜寝るまでの流れを書きましたか？",
                "簡単な現在形・ます形を正しく使いましたか？",
                "指定された文字数を満たしていますか？",
            ],
        ),
        (
            "私の家族",
            "家族のことや好きなことを簡単な日本語で書いてください。",
            40,
            [
                "家族の紹介を簡単に書きましたか？",
                "家族が好きなことや性格を書きましたか？",
                "丁寧な日本語（です・ます）で書きましたか？",
            ],
        ),
        (
            "好きな食べ物",
            "好きな食べ物と、いつ食べるかを書いてください。",
            35,
            [
                "好きな食べ物の名前を書きましたか？",
                "どんな味か、なぜ好きかを説明しましたか？",
                "いつ食べるかを書きましたか？",
            ],
        ),
    ],
    "N4": [
        (
            "行きたい場所",
            "よく行く場所と、なぜ好きかを日本語で書いてください。",
            60,
            [
                "場所の名前とどこにあるかを書きましたか？",
                "そこでいつも何をするかを説明しましたか？",
                "好きな理由を2つ以上書きましたか？",
            ],
        ),
        (
            "先週末のこと",
            "先週末にしたことと、どうだったかを書いてください。",
            65,
            [
                "どこへ行ったか、何をしたかを書きましたか？",
                "過去形（〜ました、〜だった）を正しく使いましたか？",
                "その時の感想を書きましたか？",
            ],
        ),
        (
            "新しい趣味",
            "今習っていることや最近始めた趣味を日本語で説明してください。",
            70,
            [
                "どんな趣味やスキルかを書きましたか？",
                "どのくらい練習しているかを説明しましたか？",
                "なぜそれが楽しいかを書きましたか？",
            ],
        ),
    ],
    "N3": [
        (
            "外食の思い出",
            "最近行ったレストランやカフェについて、何を食べたか、どう感じたかを書いてください。",
            90,
            [
                "お店の雰囲気や頼んだメニューを具体的に書きましたか？",
                "料理の味やおすすめのポイントを説明しましたか？",
                "誰と行ったか、また行きたい理由を書きましたか？",
            ],
        ),
        (
            "毎日の通勤・通学",
            "学校や職場へ行くときの様子や、途中で見る景色について書いてください。",
            90,
            [
                "どんな交通手段を使っているか書きましたか？",
                "片道にかかる時間や途中の様子を説明しましたか？",
                "移動時間の過ごし方について触れましたか？",
            ],
        ),
        (
            "休日の過ごし方",
            "土曜日や日曜日にいつもしているリフレッシュ方法について書いてください。",
            90,
            [
                "休日によくする活動を具体的に書きましたか？",
                "誰と一緒に過ごすことが多いか書きましたか？",
                "それが自分にとってなぜ大切かを説明しましたか？",
            ],
        ),
    ],
    "N2": [
        (
            "友達との料理パーティー",
            "家で友達と一緒に料理を作って食べたときの体験を書いてください。",
            130,
            [
                "どんな料理を作ったか、準備の様子を生き生きと書きましたか？",
                "ハプニングや友達との会話について触れましたか？",
                "自然な日常会話の言葉づかいで文章をまとめましたか？",
            ],
        ),
        (
            "朝の交通渋滞",
            "最近巻き込まれた交通渋滞や電車の遅延について、どのように対応したかを書いてください。",
            130,
            [
                "遅延の状況と理由を分かりやすく説明しましたか？",
                "待っている間に何をしていたかを具体的に書きましたか？",
                "その出来事から学んだ時間の使い方について述べましたか？",
            ],
        ),
        (
            "雨の日の過ごし方",
            "一日中雨が降っていた日に、家の中でどのように過ごしたかを書いてください。",
            130,
            [
                "外の天気の様子と家の中の雰囲気を描写しましたか？",
                "時間を過ごすために行った工夫や趣味について書きましたか？",
                "その日一日の気分や感想を自然に表現しましたか？",
            ],
        ),
    ],
    "N1": [
        (
            "買い物でのトラブルと解決",
            "買い物をした際に店員とやり取りをして問題を解決した経験を書いてください。",
            190,
            [
                "起きた問題の状況を具体的かつ論理的に説明しましたか？",
                "店員とどのように対話し、どのように解決に至ったかを書きましたか？",
                "その経験を通じて感じたことや考えたことを深く表現しましたか？",
            ],
        ),
        (
            "予期せぬスケジュールの変更",
            "仕事や学業で突然の予定変更が起きたとき、どのように臨機応変に対応したかを書いてください。",
            190,
            [
                "突然の変更に対して最初の判断と対応を明確に書きましたか？",
                "周囲との協力や調整の工夫について触れましたか？",
                "柔軟な対応の重要性についての自身の考えをまとめましたか？",
            ],
        ),
    ],
}


class WritingAIError(RuntimeError):
    """Raised when the writing judge cannot return a valid evaluation."""


def _language_name(language: str) -> str:
    return _LANGUAGE_NAMES.get(str(language).lower(), str(language))


def _language_instruction(language: str) -> tuple[str, str, str, str]:
    """Trả về (target_lang_desc, lang_target_name, example_title, example_checklist) để prompt AI sinh đúng 100% một ngôn ngữ."""
    lang = str(language).lower()
    if lang == "ja":
        return (
            "tiếng Nhật (Japanese - 日本語)",
            "Japanese",
            "お気に入りのレストラン",
            "好きな料理について具体的に書きましたか？",
        )
    if lang == "vi":
        return (
            "tiếng Việt (Vietnamese)",
            "Vietnamese",
            "Bữa ăn yêu thích",
            "Bạn đã kể tên món ăn yêu thích và lý do thích chưa?",
        )
    return (
        "tiếng Anh (English)",
        "English",
        "Eating Out at a Restaurant",
        "Did you clearly describe your favorite dish and why you like it?",
    )


def _is_valid_topic_language(topic: WritingTopic, language: str) -> bool:
    """Kiểm tra chủ đề có đồng nhất 100% đúng ngôn ngữ mục tiêu không, chống trộn lẫn Anh-Việt."""
    lang = str(language).lower()
    if lang == "en":
        if _VIETNAMESE_DIACRITICS.search(topic.title):
            return False
        if _VIETNAMESE_DIACRITICS.search(topic.prompt):
            return False
        for item in (topic.checklist or []):
            if _VIETNAMESE_DIACRITICS.search(item):
                return False
        return True
    if lang == "ja":
        if not _JAPANESE_CHARS.search(topic.title):
            return False
        if not _JAPANESE_CHARS.search(topic.prompt):
            return False
        if _VIETNAMESE_DIACRITICS.search(topic.title) or _VIETNAMESE_DIACRITICS.search(topic.prompt):
            return False
        return True
    return True


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


def _fallback_topics(language: str, level: str, count: int) -> list[WritingTopic]:
    lang = str(language).lower()
    normalized = (level or "").upper()
    if lang == "ja":
        default_lvl = "N4" if normalized not in _FALLBACK_TOPICS else normalized
    else:
        default_lvl = "A2" if normalized not in _FALLBACK_TOPICS else normalized
    bank = _FALLBACK_TOPICS.get(normalized) or _FALLBACK_TOPICS.get(default_lvl) or _FALLBACK_TOPICS["A2"]
    return [
        WritingTopic(
            title=item[0],
            prompt=item[1],
            min_words=item[2],
            checklist=list(item[3]),
        )
        for item in bank[:count]
    ]


def generate_topics(language: str, level: str, count: int) -> list[WritingTopic]:
    """Sinh đề bài viết theo ngôn ngữ + trình độ; tự fallback khi AI lỗi."""
    normalized = (level or "A2").upper()
    lang_desc, lang_target, ex_title, ex_check = _language_instruction(language)
    try:
        payload = _generate_json(f"""Bạn là giáo viên chuyên nghiệp ra đề bài viết đoạn văn.
Sinh {count} đề viết đoạn văn bằng {lang_desc} cho học viên trình độ {normalized}.
Mỗi đề phải rõ ràng, đời thường, không cần kiến thức chuyên môn.
{_level_rule(normalized)}
Không viết như bài luận thi đại học hay bài báo khoa học.

QUY TẮC BẮT BUỘC VỀ ĐỒNG NHẤT 100% NGÔN NGỮ (KHÔNG LẪN LỘN ANH - VIỆT):
1. TẤT CẢ các trường "title", "prompt", và toàn bộ 3 mục trong "checklist" BẮT BUỘC PHẢI VIẾT BẰNG {lang_target.upper()}.
2. TUYỆT ĐỐI KHÔNG DÙNG TIẾNG VIỆT cho "title", "prompt", hoặc "checklist" khi ngôn ngữ luyện viết là {lang_target}.
   - Đúng: "title" là "{ex_title}", "checklist" chứa các câu hỏi như "{ex_check}".
   - Sai nghiêm trọng: Dùng tiêu đề tiếng Việt như "Ăn uống ngoài hàng" hoặc checklist tiếng Việt trong khi bài viết là tiếng Anh.
3. min_words là số từ tối thiểu phù hợp với {normalized} (CEFR: A1 40-60, A2 60-90, B1 90-130, B2 130-170, C1 170-220, C2 200-260; JLPT tiếng Nhật: N5 30-50, N4 50-80, N3 80-120, N2 120-180, N1 180-260).
4. checklist: Đúng 3 câu hỏi hoặc gợi ý ngắn gọn bằng {lang_target.upper()} giúp học viên tự kiểm tra bài trước khi nộp.

Chỉ trả về một JSON array hợp lệ, không markdown:
[
  {{
    "title": "Tiêu đề bằng {lang_target}",
    "prompt": "Đề bài bằng {lang_target}",
    "min_words": 90,
    "checklist": [
      "Tiêu chí 1 bằng {lang_target}",
      "Tiêu chí 2 bằng {lang_target}",
      "Tiêu chí 3 bằng {lang_target}"
    ]
  }}
]
""")
        raw_topics = [WritingTopic.model_validate(item) for item in payload[:count]]
        valid_topics = [t for t in raw_topics if _is_valid_topic_language(t, language)]
        if len(valid_topics) >= count:
            return valid_topics[:count]
        if valid_topics:
            fb = _fallback_topics(language, normalized, count)
            return (valid_topics + fb)[:count]
    except (WritingAIError, ValidationError, TypeError, KeyError):
        logger.warning("Falling back to curated writing topics for %s.", normalized)
    return _fallback_topics(language, normalized, count)


def evaluate_writing(
    language: str,
    level: str,
    topic_title: str,
    topic_prompt: str,
    text: str,
) -> WritingEvaluation:
    """Chấm đoạn văn theo 4 tiêu chí, trả về nhận xét + câu sửa."""
    target_level = (level or "A2").upper()
    target_lang = _language_name(language)
    payload = _generate_json(f"""Bạn là giám khảo chấm writing nghiêm khắc nhưng khích lệ.
Ngôn ngữ bài viết: {target_lang}. Trình độ mục tiêu: {target_level}.
Đề bài: {topic_title!r} — {topic_prompt!r}
Bài của học viên:
\"\"\"{text}\"\"\"

QUY TẮC BẮT BUỘC VỀ NGÔN NGỮ KHI CHẤM:
1. 'natural_version' BẮT BUỘC viết 100% bằng {target_lang}. Giữ đúng ý của học viên, chỉ sửa chỗ thật sự cần, và giữ nguyên độ đơn giản của câu. TUYỆT ĐỐI KHÔNG dịch sang tiếng Việt.
2. 'corrections':
   - 'original': câu gốc có lỗi của học viên (bằng {target_lang}).
   - 'corrected': câu đã sửa lỗi ngữ pháp/từ vựng BẰNG {target_lang}. TUYỆT ĐỐI KHÔNG dịch sang tiếng Việt.
   - 'issue': giải thích lỗi ngắn gọn bằng tiếng Việt.
3. 'criteria': Chấm 4 tiêu chí Content, Grammar, Vocabulary, Coherence. Mỗi tiêu chí cho điểm 0-10 và một comment ngắn bằng tiếng Việt nêu đúng lỗi.
4. overall là điểm tổng làm tròn 0-10 (không phải trung bình cộng máy móc).
5. {_level_rule(target_level)}
Không nâng cấp từ vựng lên mức học thuật, không thêm liên từ trang trọng, không biến đoạn văn của người học A1/A2 thành bài luận.
Học viên viết câu ngắn thì bản viết lại vẫn là câu ngắn.
corrections[].corrected cũng vậy: sửa lỗi ngữ pháp, giữ cách dùng từ đời thường của học viên.
next_step: 1 việc cụ thể học viên nên luyện tiếp bằng tiếng Việt.
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
