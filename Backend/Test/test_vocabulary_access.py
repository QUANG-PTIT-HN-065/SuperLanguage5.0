import unittest
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import Mock, patch

from fastapi import HTTPException
from pydantic import ValidationError

from app.core.deps import get_current_admin_profile
from app.schemas.vocabulary import WordCreate
from app.services.vocabulary_service import (
    _access_count,
    is_premium_profile,
    list_topics,
    list_words,
)
from scripts.seed_english_words import TOPICS


class VocabularyAccessTests(unittest.TestCase):
    def test_free_plan_exposes_ceil_of_half_the_catalog(self):
        self.assertEqual(_access_count(0, False), 0)
        self.assertEqual(_access_count(1, False), 1)
        self.assertEqual(_access_count(5, False), 3)
        self.assertEqual(_access_count(160, False), 80)

    def test_premium_plan_exposes_full_catalog(self):
        self.assertEqual(_access_count(5, True), 5)

    @patch("app.services.vocabulary_service.get_plan", return_value={"is_active": True})
    def test_expired_premium_profile_uses_free_access(self, _get_plan):
        profile = {
            "plan_id": "premium",
            "plan_expires_at": (datetime.now(timezone.utc) - timedelta(days=1)).isoformat(),
        }
        self.assertFalse(is_premium_profile(profile))

    @patch("app.services.vocabulary_service.get_plan", return_value={"is_active": True})
    def test_active_premium_without_expiry_is_premium(self, _get_plan):
        self.assertTrue(is_premium_profile({"plan_id": "premium", "plan_expires_at": None}))

    @patch("app.services.vocabulary_service.get_plan", return_value={"is_active": False})
    def test_disabled_premium_plan_uses_free_access(self, _get_plan):
        profile = {"plan_id": "premium", "plan_expires_at": None}
        self.assertFalse(is_premium_profile(profile))

    def test_non_admin_cannot_use_admin_dependency(self):
        with self.assertRaises(HTTPException) as raised:
            get_current_admin_profile({"role": "learner"})
        self.assertEqual(raised.exception.status_code, 403)

    def test_admin_passes_admin_dependency(self):
        profile = {"id": "admin-id", "role": "admin"}
        self.assertIs(get_current_admin_profile(profile), profile)

    def test_word_schema_rejects_protected_or_extra_fields(self):
        with self.assertRaises(ValidationError):
            WordCreate.model_validate(
                {
                    "language_code": "en",
                    "word": "hello",
                    "meaning": "xin chào",
                    "topic_ids": [1],
                    "created_at": "2025-01-01",
                }
            )

    def test_seed_contains_160_distinct_words_and_five_topics(self):
        entries = [
            word.casefold()
            for _, _, _, words in TOPICS
            for word, _, _, _ in words
        ]
        self.assertEqual(len(TOPICS), 5)
        self.assertEqual(len(entries), 160)
        self.assertEqual(len(set(entries)), 160)

    @patch("app.services.vocabulary_service.get_plan", return_value={"is_active": False})
    @patch("app.services.vocabulary_service.supabase_admin")
    def test_free_topic_pagination_cannot_read_premium_topics(self, client, _get_plan):
        query = Mock()
        query.select.return_value = query
        query.eq.return_value = query
        query.limit.return_value = query
        query.order.return_value = query
        query.range.return_value = query
        query.execute.side_effect = [
            SimpleNamespace(count=5, data=[]),
            SimpleNamespace(
                count=None,
                data=[{"id": 1}, {"id": 2}, {"id": 3}],
            ),
        ]
        client.table.return_value = query

        result = list_topics(
            {"target_language": "en", "plan_id": "free"},
            limit=100,
            offset=0,
        )

        self.assertEqual(result["available"], 3)
        self.assertEqual(len(result["items"]), 3)
        query.range.assert_called_once_with(0, 2)

    @patch("app.services.vocabulary_service.supabase_admin")
    def test_free_word_listing_enforces_half_and_offset_cap(self, client):
        query = Mock()
        query.select.return_value = query
        query.eq.return_value = query
        query.limit.return_value = query
        query.order.return_value = query
        query.range.return_value = query
        query.lte.return_value = query
        query.execute.side_effect = [
            SimpleNamespace(count=8, data=[]),
            SimpleNamespace(count=None, data=[{"id": 4}]),
            SimpleNamespace(count=4, data=[]),
            SimpleNamespace(
                count=None,
                data=[{"id": index} for index in range(1, 5)],
            ),
            SimpleNamespace(count=8, data=[]),
            SimpleNamespace(count=None, data=[{"id": 4}]),
            SimpleNamespace(count=4, data=[]),
        ]
        client.table.return_value = query
        profile = {"target_language": "en", "plan_id": "free"}

        first_page = list_words(profile, limit=100, offset=0)
        past_free_limit = list_words(profile, limit=100, offset=4)

        self.assertEqual(first_page["total"], 8)
        self.assertEqual(first_page["available"], 4)
        self.assertEqual(len(first_page["items"]), 4)
        self.assertEqual(past_free_limit["items"], [])


if __name__ == "__main__":
    unittest.main()
