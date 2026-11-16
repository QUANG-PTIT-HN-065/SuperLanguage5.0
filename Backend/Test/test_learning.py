import unittest
from collections import defaultdict, deque
from types import SimpleNamespace
from unittest.mock import Mock, patch
from uuid import uuid4

from fastapi import HTTPException
from pydantic import ValidationError

from app.api.endpoints.lessons import check_answer, finish_lesson, get_questions
from app.api.endpoints.vocabulary import review_word
from app.schemas.learning import LessonAnswerSubmit, VocabularyWordReview
from app.services.learning_service import (
    _build_topic_quiz,
    get_lesson_questions,
    get_path_topic_states,
    list_topic_lessons,
)


class MockQuery:
    def __init__(self, rows):
        self.rows = rows

    def __getattr__(self, _name):
        return lambda *_args, **_kwargs: self

    def execute(self):
        return SimpleNamespace(data=self.rows)


class LearningSchemaTests(unittest.TestCase):
    def test_answer_requires_a_non_empty_option(self):
        with self.assertRaises(ValidationError):
            LessonAnswerSubmit(selected_option_id=" ")

    def test_answer_rejects_unexpected_client_supplied_correctness(self):
        with self.assertRaises(ValidationError):
            LessonAnswerSubmit(
                selected_option_id="a",
                is_correct=True,
            )

    def test_vocabulary_review_only_accepts_supported_ratings(self):
        for rating in ("Khó", "Tốt", "Dễ"):
            self.assertEqual(
                VocabularyWordReview(review_id=uuid4(), rating=rating).rating,
                rating,
            )
        with self.assertRaises(ValidationError):
            VocabularyWordReview(review_id=uuid4(), rating="Rất dễ")


class LearningEndpointTests(unittest.TestCase):
    @patch("app.api.endpoints.lessons.get_lesson_questions")
    def test_questions_endpoint_returns_only_public_question_fields(self, load_questions):
        load_questions.return_value = {
            "lesson": {"id": 8, "title": "Greetings", "description": None},
            "questions": [{
                "id": 3,
                "prompt": "Hello means…",
                "options": [{"id": "a", "text": "xin chào"}],
            }],
        }

        response = get_questions(8, {"id": "learner", "target_language": "en"})

        question = response.data["questions"][0]
        self.assertNotIn("correct_option_id", question)
        self.assertNotIn("explanation", question)

    @patch("app.api.endpoints.lessons.submit_lesson_answer")
    def test_answer_endpoint_uses_authenticated_profile(self, submit_answer):
        submit_answer.return_value = {
            "question_id": 3,
            "selected_option_id": "a",
            "is_correct": True,
            "correct_option_id": "a",
            "explanation": None,
            "already_checked": False,
        }

        response = check_answer(
            LessonAnswerSubmit(selected_option_id="a"),
            question_id=3,
            profile={"id": "signed-in-user"},
        )

        submit_answer.assert_called_once_with({"id": "signed-in-user"}, 3, "a")
        self.assertTrue(response.data["is_correct"])

    @patch("app.api.endpoints.lessons.complete_lesson")
    def test_completion_returns_server_calculated_level_and_xp(self, complete):
        complete.return_value = {
            "lesson_id": 8,
            "score": 3,
            "question_count": 4,
            "passed": True,
            "xp_awarded": 15,
            "xp_total": 215,
            "level": 3,
            "xp_into_level": 15,
            "current_streak": 2,
            "already_completed": False,
        }

        response = finish_lesson(8, {"id": "signed-in-user"})

        complete.assert_called_once_with({"id": "signed-in-user"}, 8)
        self.assertEqual(response.data["level"], 3)
        self.assertEqual(response.data["xp_total"], 215)

    @patch("app.api.endpoints.vocabulary.review_vocabulary_word")
    def test_word_review_sends_rating_to_authenticated_user(self, review):
        review.return_value = {
            "word_id": 17,
            "review_id": str(uuid4()),
            "rating": "Dễ",
            "mastery_level": 2,
            "review_count": 1,
            "last_reviewed_at": "2026-11-12T10:00:00Z",
            "next_review_at": "2026-11-19T10:00:00Z",
            "already_applied": False,
        }
        review_id = uuid4()

        response = review_word(
            VocabularyWordReview(review_id=review_id, rating="Dễ"),
            word_id=17,
            profile={"id": "signed-in-user"},
        )

        review.assert_called_once_with({"id": "signed-in-user"}, 17, review_id, "Dễ")
        self.assertEqual(response.data["mastery_level"], 2)

class LearningServiceTests(unittest.TestCase):
    def test_topic_quiz_has_four_mixed_vocabulary_questions(self):
        words = [
            {
                "id": index,
                "word": word,
                "meaning": meaning,
                "example_sentence": sentence,
                "example_meaning": None,
            }
            for index, (word, meaning, sentence) in enumerate([
                ("hello", "xin chào", "Hello, Linh!"),
                ("goodbye", "tạm biệt", "Say goodbye to Mai."),
                ("please", "làm ơn", "Please open the door."),
                ("thanks", "cảm ơn", "Thanks for your help."),
            ], start=1)
        ]

        questions = _build_topic_quiz(words)

        self.assertEqual(len(questions), 4)
        self.assertEqual(
            [question["question_type"] for question in questions],
            ["fill_in", "fill_in", "multiple_choice", "multiple_choice"],
        )
        self.assertEqual(questions[0]["prompt"], "Điền từ còn thiếu: ________, Linh!")
        self.assertEqual(questions[0]["options"], [])
        self.assertEqual(len(questions[2]["options"]), 4)

    @patch("app.services.learning_service.supabase_admin")
    def test_path_topics_unlock_in_order_only_after_a_perfect_quiz(self, client):
        responses = {
            "lessons": [
                {"id": 101, "topic_id": 1},
                {"id": 102, "topic_id": 2},
            ],
            "lesson_progress": [
                {"lesson_id": 101, "score": 4, "question_count": 4},
                {"lesson_id": 102, "score": 3, "question_count": 4},
            ],
        }
        client.table.side_effect = lambda name: MockQuery(responses[name])

        states = get_path_topic_states(
            9,
            "learner",
            [{"id": 1}, {"id": 2}, {"id": 3}],
        )

        self.assertEqual(
            [states[index]["is_locked"] for index in (1, 2, 3)],
            [False, False, True],
        )
        self.assertTrue(states[1]["is_completed"])
        self.assertFalse(states[2]["is_completed"])

    @patch("app.services.learning_service._ensure_topic_access")
    @patch("app.services.learning_service.supabase_admin")
    def test_question_read_never_selects_correct_answer(self, client, _ensure_access):
        responses = defaultdict(deque)
        responses["lessons"].extend([
            [{"id": 8, "topic_id": 5, "title": "Greetings", "description": None, "sort_order": 1}],
            [{"id": 8, "sort_order": 1}],
        ])
        responses["topics"].append([{"id": 5}])
        responses["lesson_progress"].append([])
        responses["lesson_questions"].append([{
            "id": 3,
            "prompt": "Hello means…",
            "options": [{"id": "a", "text": "xin chào"}, {"id": "b", "text": "tạm biệt"}],
            "sort_order": 1,
        }])
        selects = []

        def table(name):
            query = MockQuery(responses[name].popleft())
            original_select = query.select

            def select(fields):
                selects.append((name, fields))
                return original_select(fields)

            query.select = select
            return query

        client.table.side_effect = table

        payload = get_lesson_questions(
            8,
            {"id": "learner", "target_language": "en"},
        )

        self.assertNotIn("correct_option_id", payload["questions"][0])
        question_select = next(fields for name, fields in selects if name == "lesson_questions")
        self.assertNotIn("correct_option_id", question_select)

    @patch("app.services.learning_service._ensure_topic_access")
    @patch("app.services.learning_service.supabase_admin")
    def test_topic_lessons_unlock_one_at_a_time(self, client, _ensure_access):
        responses = {
            "topics": [{"id": 5}],
            "lessons": [
                {"id": 1, "topic_id": 5, "title": "First", "sort_order": 1, "xp_reward": 10},
                {"id": 2, "topic_id": 5, "title": "Second", "sort_order": 2, "xp_reward": 10},
                {"id": 3, "topic_id": 5, "title": "Third", "sort_order": 3, "xp_reward": 10},
            ],
            "lesson_progress": [
                {"lesson_id": 1, "score": 2, "question_count": 2, "completed_at": "today"},
            ],
        }
        client.table.side_effect = lambda name: MockQuery(responses[name])

        lessons = list_topic_lessons(
            5,
            {"id": "learner", "target_language": "en"},
        )

        self.assertEqual([lesson["is_locked"] for lesson in lessons], [False, False, True])
        self.assertEqual([lesson["is_completed"] for lesson in lessons], [True, False, False])


if __name__ == "__main__":
    unittest.main()
