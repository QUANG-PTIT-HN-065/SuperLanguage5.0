import unittest
from unittest.mock import patch

from app.services.writing_ai_service import (
    WritingAIError,
    _level_rule,
    evaluate_writing,
    generate_topics,
)

VALID_EVALUATION = {
    "overall": 7,
    "criteria": [
        {"name": "Content", "score": 7, "comment": "Đủ ý."},
        {"name": "Grammar", "score": 7, "comment": "Đúng thì hiện tại."},
        {"name": "Vocabulary", "score": 6, "comment": "Từ còn đơn giản."},
        {"name": "Coherence", "score": 7, "comment": "Mạch lạc."},
    ],
    "summary": "Bài viết rõ ràng.",
    "corrections": [],
    "natural_version": "I wake up at six. I eat bread and drink milk.",
    "next_step": "Thêm một câu về bạn bè.",
}

VALID_TOPICS = [
    {
        "title": "My morning",
        "prompt": "Write about what you do when you wake up.",
        "min_words": 45,
        "checklist": ["Viết đủ 45 từ"],
    },
    {
        "title": "Street food",
        "prompt": "Describe the food you like to buy on the street.",
        "min_words": 50,
        "checklist": ["Viết đủ 50 từ"],
    },
]


def capture_prompt(func, payload, *args):
    captured = {}

    def fake_generate_json(prompt: str):
        captured["prompt"] = prompt
        return payload

    with patch("app.services.writing_ai_service._generate_json", side_effect=fake_generate_json):
        func(*args)
    return captured["prompt"]


class EverydayWritingRegisterTests(unittest.TestCase):
    """Mọi độ khó phải ra văn đời thường, không văn phong học thuật."""

    def test_level_rule_names_the_target_level_and_bans_academic_words(self):
        rule = _level_rule("A1")
        self.assertIn("A1", rule)
        self.assertIn("Cấm từ ngữ học thuật", rule)
        self.assertIn("utilize", rule)

    def test_generated_topics_carry_the_register_rule(self):
        prompt = capture_prompt(generate_topics, VALID_TOPICS, "en", "A1", 2)
        self.assertIn("chỉ dùng từ ngữ đời thường", prompt)
        self.assertIn("Không viết như bài luận thi đại học", prompt)
        self.assertIn("trình độ A1", prompt)

    def test_natural_version_must_stay_as_simple_as_the_learner(self):
        prompt = capture_prompt(
            evaluate_writing,
            VALID_EVALUATION,
            "en",
            "A2",
            "My morning",
            "Write about what you do when you wake up.",
            "I wake up at six. I eat bread and drink milk. I go to school by bus.",
        )
        self.assertIn("Học viên viết câu ngắn thì bản viết lại vẫn là câu ngắn", prompt)
        self.assertIn("Không nâng cấp từ vựng lên mức học thuật", prompt)
        self.assertIn("Trình độ mục tiêu: A2", prompt)

    def test_ai_outage_falls_back_to_everyday_curated_topics(self):
        with patch(
            "app.services.writing_ai_service._generate_json",
            side_effect=WritingAIError("AI lỗi"),
        ):
            topics = generate_topics("en", "A1", 3)

        self.assertEqual(len(topics), 3)
        joined = " ".join(f"{topic.title} {topic.prompt}" for topic in topics).lower()
        for academic_word in ("tuition", "globalisation", "rhetoric", "analyse"):
            self.assertNotIn(academic_word, joined)


if __name__ == "__main__":
    unittest.main()
