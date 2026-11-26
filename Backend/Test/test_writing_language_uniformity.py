import unittest
from unittest.mock import patch

from app.schemas.writing import WritingTopic
from app.services.writing_ai_service import (
    _FALLBACK_TOPICS,
    _VIETNAMESE_DIACRITICS,
    _is_valid_topic_language,
    generate_topics,
    WritingAIError,
)


class WritingLanguageUniformityTests(unittest.TestCase):
    """Đảm bảo đề bài writing 100% đồng nhất ngôn ngữ, không trộn lẫn Anh-Việt."""

    def test_english_fallback_topics_have_no_vietnamese(self):
        for level in ["A1", "A2", "B1", "B2", "C1", "C2"]:
            topics = _FALLBACK_TOPICS.get(level, [])
            self.assertTrue(len(topics) >= 2, f"Level {level} must have at least 2 topics")
            for title, prompt, min_words, checklist in topics:
                self.assertFalse(
                    _VIETNAMESE_DIACRITICS.search(title),
                    f"English level {level} title '{title}' must not contain Vietnamese characters",
                )
                self.assertFalse(
                    _VIETNAMESE_DIACRITICS.search(prompt),
                    f"English level {level} prompt '{prompt}' must not contain Vietnamese characters",
                )
                self.assertEqual(len(checklist), 3, f"Checklist in {title} must have 3 items")
                for check in checklist:
                    self.assertFalse(
                        _VIETNAMESE_DIACRITICS.search(check),
                        f"Checklist item '{check}' must not contain Vietnamese characters",
                    )

    def test_japanese_fallback_topics_have_no_vietnamese_and_have_japanese(self):
        for level in ["N5", "N4", "N3", "N2", "N1"]:
            topics = _FALLBACK_TOPICS.get(level, [])
            self.assertTrue(len(topics) >= 2, f"Level {level} must have at least 2 topics")
            for title, prompt, min_words, checklist in topics:
                self.assertFalse(
                    _VIETNAMESE_DIACRITICS.search(title),
                    f"Japanese level {level} title '{title}' must not contain Vietnamese characters",
                )
                self.assertEqual(len(checklist), 3, f"Checklist in {title} must have 3 items")
                for check in checklist:
                    self.assertFalse(
                        _VIETNAMESE_DIACRITICS.search(check),
                        f"Checklist item '{check}' must not contain Vietnamese characters",
                    )

    def test_validator_rejects_mixed_english_vietnamese(self):
        mixed_topic = WritingTopic(
            title="Ăn uống ngoài hàng",  # Vietnamese title
            prompt="Write a short paragraph about your favorite restaurant.",
            min_words=90,
            checklist=["Bạn đã kể tên quán ăn chưa?"],  # Vietnamese checklist
        )
        self.assertFalse(_is_valid_topic_language(mixed_topic, "en"))

        pure_english_topic = WritingTopic(
            title="Eating out at a restaurant",
            prompt="Write a short paragraph about your favorite restaurant.",
            min_words=90,
            checklist=["Did you name and describe your favorite restaurant?"],
        )
        self.assertTrue(_is_valid_topic_language(pure_english_topic, "en"))

    def test_generate_topics_fallback_pure_language(self):
        with patch(
            "app.services.writing_ai_service._generate_json",
            side_effect=WritingAIError("AI simulated error"),
        ):
            en_topics = generate_topics("en", "B1", 3)
            self.assertEqual(len(en_topics), 3)
            for t in en_topics:
                self.assertTrue(_is_valid_topic_language(t, "en"))

            ja_topics = generate_topics("ja", "N3", 3)
            self.assertEqual(len(ja_topics), 3)
            for t in ja_topics:
                self.assertTrue(_is_valid_topic_language(t, "ja"))


if __name__ == "__main__":
    unittest.main()
