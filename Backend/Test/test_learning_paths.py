import unittest
from types import SimpleNamespace
from unittest.mock import Mock, patch

from fastapi import HTTPException
from pydantic import ValidationError

from app.schemas.vocabulary import LearningPathCreate, LearningPathUpdate
from app.services.learning_path_service import _validate_topic_ids, update_learning_path
from app.services.vocabulary_service import list_words


class LearningPathSchemaTests(unittest.TestCase):
    def test_create_requires_a_name_and_at_least_one_topic(self):
        with self.assertRaises(ValidationError):
            LearningPathCreate(
                language_code="en",
                name=" ",
                topic_ids=[],
            )

    def test_create_trims_name_and_description(self):
        path = LearningPathCreate(
            language_code="en",
            name=" English A1 ",
            description=" Basics ",
            topic_ids=[1, 2],
        )

        self.assertEqual(path.name, "English A1")
        self.assertEqual(path.description, "Basics")

    def test_update_rejects_empty_topic_list(self):
        with self.assertRaises(ValidationError):
            LearningPathUpdate(topic_ids=[])


class LearningPathServiceTests(unittest.TestCase):
    @patch("app.services.learning_path_service.supabase_admin")
    def test_path_topics_must_all_match_the_path_language(self, client):
        query = Mock()
        query.select.return_value = query
        query.eq.return_value = query
        query.in_.return_value = query
        query.execute.return_value = SimpleNamespace(data=[{"id": 1}])
        client.table.return_value = query

        with self.assertRaises(HTTPException) as raised:
            _validate_topic_ids("en", [1, 2])

        self.assertEqual(raised.exception.status_code, 422)

    @patch("app.services.learning_path_service.supabase_admin")
    def test_update_preserves_omitted_path_fields_and_topics(self, client):
        path_query = Mock()
        path_query.select.return_value = path_query
        path_query.eq.return_value = path_query
        path_query.limit.return_value = path_query
        path_query.execute.return_value = SimpleNamespace(
            data=[{
                "id": 9,
                "language_code": "en",
                "name": "English basics",
                "description": "Description",
                "sort_order": 20,
            }]
        )
        link_query = Mock()
        link_query.select.return_value = link_query
        link_query.eq.return_value = link_query
        link_query.order.return_value = link_query
        link_query.execute.return_value = SimpleNamespace(data=[{"topic_id": 4}])
        topic_query = Mock()
        topic_query.select.return_value = topic_query
        topic_query.eq.return_value = topic_query
        topic_query.in_.return_value = topic_query
        topic_query.execute.return_value = SimpleNamespace(data=[{"id": 4}])
        client.table.side_effect = {
            "learning_paths": path_query,
            "learning_path_topics": link_query,
            "topics": topic_query,
        }.__getitem__
        rpc = Mock()
        rpc.execute.return_value = SimpleNamespace(
            data={
                "id": 9,
                "language_code": "en",
                "name": "English basics",
                "description": "Description",
                "sort_order": 20,
            }
        )
        client.rpc.return_value = rpc

        updated = update_learning_path(9, {})

        self.assertEqual(updated["topic_ids"], [4])
        self.assertEqual(
            client.rpc.call_args.args,
            ("admin_save_learning_path", {
                "p_path_id": 9,
                "p_language_code": "en",
                "p_name": "English basics",
                "p_description": "Description",
                "p_sort_order": 20,
                "p_topic_ids": [4],
            }),
        )


class VocabularySearchTests(unittest.TestCase):
    @patch("app.services.vocabulary_service._free_word_floor", return_value=(2, 0))
    @patch("app.services.vocabulary_service.is_premium_profile", return_value=True)
    @patch("app.services.vocabulary_service.supabase_admin")
    def test_search_matches_word_or_meaning_and_returns_paginated_results(
        self, client, _is_premium, _free_word_floor
    ):
        query = Mock()
        for method in ("select", "eq", "ilike", "in_", "order", "range", "limit"):
            getattr(query, method).return_value = query
        query.execute.side_effect = [
            SimpleNamespace(data=[{"id": 1}]),
            SimpleNamespace(data=[{"id": 2}]),
            SimpleNamespace(count=2, data=[]),
            SimpleNamespace(
                data=[
                    {"id": 1, "word": "hello", "meaning": "xin chào"},
                    {"id": 2, "word": "greeting", "meaning": "hello"},
                ]
            ),
        ]
        client.table.return_value = query

        result = list_words(
            {"target_language": "en", "plan_id": "premium"},
            limit=20,
            offset=0,
            search_term="hello",
        )

        self.assertEqual(result["available"], 2)
        self.assertEqual(len(result["items"]), 2)
        query.ilike.assert_any_call("word", "%hello%")
        query.ilike.assert_any_call("meaning", "%hello%")


if __name__ == "__main__":
    unittest.main()
