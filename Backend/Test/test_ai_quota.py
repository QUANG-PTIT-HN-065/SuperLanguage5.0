import unittest
from types import SimpleNamespace
from unittest.mock import Mock, patch

from fastapi import HTTPException

from app.core.ai_quota import DAILY_AI_CALL_LIMIT, consume_daily_ai_call


def rpc_result(decision):
    query = Mock()
    query.execute.return_value = SimpleNamespace(data=[decision])
    return query


class DailyAIQuotaTests(unittest.TestCase):
    @patch("app.core.ai_quota.supabase_admin")
    def test_consumes_one_daily_call_for_the_authenticated_user(self, client):
        client.rpc.return_value = rpc_result({
            "allowed": True,
            "used": 1,
            "daily_limit": DAILY_AI_CALL_LIMIT,
            "remaining": DAILY_AI_CALL_LIMIT - 1,
        })

        consume_daily_ai_call({
            "id": "authenticated-user",
            "timezone": "Asia/Ho_Chi_Minh",
        })

        function_name, parameters = client.rpc.call_args.args
        self.assertEqual(function_name, "consume_daily_ai_calls")
        self.assertEqual(parameters["p_user_id"], "authenticated-user")
        self.assertEqual(parameters["p_daily_limit"], 15)
        self.assertRegex(parameters["p_usage_date"], r"^\d{4}-\d{2}-\d{2}$")

    @patch("app.core.ai_quota.supabase_admin")
    def test_allows_the_last_daily_call(self, client):
        client.rpc.return_value = rpc_result({
            "allowed": True,
            "used": DAILY_AI_CALL_LIMIT,
            "daily_limit": DAILY_AI_CALL_LIMIT,
            "remaining": 0,
        })

        consume_daily_ai_call({"id": "authenticated-user"})

    @patch("app.core.ai_quota.supabase_admin")
    def test_rejects_exhausted_quota_with_retry_after(self, client):
        client.rpc.return_value = rpc_result({
            "allowed": False,
            "used": DAILY_AI_CALL_LIMIT,
            "daily_limit": DAILY_AI_CALL_LIMIT,
            "remaining": 0,
        })

        with self.assertRaises(HTTPException) as raised:
            consume_daily_ai_call({"id": "authenticated-user"})

        self.assertEqual(raised.exception.status_code, 429)
        self.assertGreater(int(raised.exception.headers["Retry-After"]), 0)

    @patch("app.core.ai_quota.supabase_admin")
    def test_fails_closed_when_the_quota_store_is_unavailable(self, client):
        client.rpc.side_effect = RuntimeError("database unavailable")

        with self.assertRaises(HTTPException) as raised:
            consume_daily_ai_call({"id": "authenticated-user"})

        self.assertEqual(raised.exception.status_code, 503)

    @patch("app.core.ai_quota.supabase_admin")
    def test_fails_closed_for_an_invalid_database_response(self, client):
        client.rpc.return_value = rpc_result({"allowed": True})

        with self.assertRaises(HTTPException) as raised:
            consume_daily_ai_call({"id": "authenticated-user"})

        self.assertEqual(raised.exception.status_code, 503)


if __name__ == "__main__":
    unittest.main()
