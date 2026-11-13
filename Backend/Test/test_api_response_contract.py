import unittest
from unittest.mock import patch

from app.api.endpoints.users import _me_payload
from app.api.endpoints.vocabulary import get_topics, get_words


class LearnerApiResponseContractTests(unittest.TestCase):
    @patch("app.api.endpoints.vocabulary.list_topics")
    def test_topics_are_returned_in_standard_envelope(self, list_topics):
        page = {"items": [{"id": 1}], "total": 1, "available": 1}
        list_topics.return_value = page

        response = get_topics(profile={"id": "learner"}, limit=10, offset=0)

        self.assertEqual(response.status, "success")
        self.assertEqual(response.data, page)

    @patch("app.api.endpoints.vocabulary.list_words")
    def test_words_are_returned_in_standard_envelope(self, list_words):
        page = {"items": [{"id": 2}], "total": 1, "available": 1}
        list_words.return_value = page

        response = get_words(
            topic_id=None,
            limit=10,
            offset=0,
            profile={"id": "learner"},
        )

        self.assertEqual(response.status, "success")
        self.assertEqual(response.data, page)

    @patch("app.api.endpoints.users.get_plan", return_value={"id": "free"})
    @patch("app.api.endpoints.users.get_stats", return_value={"xp_total": 25})
    @patch("app.api.endpoints.users.with_effective_streak", side_effect=lambda stats, _tz: stats)
    def test_me_payload_is_returned_in_standard_envelope(
        self, _with_effective_streak, _get_stats, _get_plan
    ):
        profile = {
            "id": "learner",
            "timezone": "Asia/Ho_Chi_Minh",
            "plan_id": "free",
            "onboarding_completed_at": None,
        }

        response = _me_payload(profile)

        self.assertEqual(response.status, "success")
        self.assertEqual(response.data["profile"], profile)
        self.assertEqual(response.data["stats"]["xp_total"], 25)
        self.assertTrue(response.data["needs_onboarding"])


if __name__ == "__main__":
    unittest.main()
