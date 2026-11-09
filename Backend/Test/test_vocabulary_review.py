import unittest
from types import SimpleNamespace
from unittest.mock import Mock, patch
from uuid import uuid4

from fastapi import HTTPException
from pydantic import ValidationError

from app.api.endpoints.vocabulary import complete_review_session
from app.schemas.vocabulary import VocabularyReviewComplete


class VocabularyReviewSchemaTests(unittest.TestCase):
    def test_review_counts_must_be_consistent(self):
        with self.assertRaises(ValidationError):
            VocabularyReviewComplete(
                session_id=uuid4(),
                reviewed_count=1,
                known_count=2,
            )

    def test_review_session_rejects_unexpected_client_supplied_xp(self):
        with self.assertRaises(ValidationError):
            VocabularyReviewComplete(
                session_id=uuid4(),
                reviewed_count=1,
                known_count=1,
                xp_awarded=999,
            )


class VocabularyReviewEndpointTests(unittest.TestCase):
    @patch("app.api.endpoints.vocabulary.supabase_admin")
    def test_endpoint_uses_authenticated_profile_and_returns_database_stats(self, client):
        session_id = uuid4()
        rpc = Mock()
        rpc.execute.return_value = SimpleNamespace(
            data={
                "session_id": str(session_id),
                "reviewed_count": 1,
                "known_count": 1,
                "xp_awarded": 15,
                "xp_total": 215,
                "current_streak": 4,
                "longest_streak": 8,
                "already_completed": False,
                "xp_today": 30,
                "goal_met_today": True,
            }
        )
        client.rpc.return_value = rpc

        response = complete_review_session(
            VocabularyReviewComplete(
                session_id=session_id,
                reviewed_count=1,
                known_count=1,
            ),
            {"id": "authenticated-user-id"},
        )

        client.rpc.assert_called_once_with(
            "complete_vocabulary_review_session",
            {
                "p_user_id": "authenticated-user-id",
                "p_session_id": str(session_id),
                "p_reviewed_count": 1,
                "p_known_count": 1,
            },
        )
        self.assertEqual(response.data.xp_total, 215)
        self.assertEqual(response.data.current_streak, 4)

    @patch("app.api.endpoints.vocabulary.supabase_admin")
    def test_endpoint_surfaces_rpc_failure_as_service_unavailable(self, client):
        client.rpc.side_effect = RuntimeError("database unavailable")

        with self.assertRaises(HTTPException) as raised:
            complete_review_session(
                VocabularyReviewComplete(
                    session_id=uuid4(),
                    reviewed_count=1,
                    known_count=0,
                ),
                {"id": "authenticated-user-id"},
            )

        self.assertEqual(raised.exception.status_code, 503)


if __name__ == "__main__":
    unittest.main()
