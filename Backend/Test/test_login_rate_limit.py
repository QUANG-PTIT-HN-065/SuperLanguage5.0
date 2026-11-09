import unittest
from types import SimpleNamespace
from unittest.mock import Mock, patch

from fastapi import HTTPException, Request

from app.core.login_rate_limit import check_login_rate_limit


def make_request(client_ip: str = "192.0.2.10") -> Request:
    return Request(
        {
            "type": "http",
            "method": "POST",
            "path": "/api/v1/auth/login",
            "headers": [],
            "client": (client_ip, 12345),
            "server": ("testserver", 80),
            "scheme": "http",
            "query_string": b"",
        }
    )


class LoginRateLimitTests(unittest.TestCase):
    @patch("app.core.login_rate_limit.supabase_admin")
    def test_consumes_a_bucket_for_email_and_ip(self, client):
        query = Mock()
        query.execute.return_value = SimpleNamespace(
            data=[{"allowed": True, "retry_after": 0}]
        )
        client.rpc.return_value = query

        check_login_rate_limit(make_request(), "User@example.com")

        function_name, parameters = client.rpc.call_args.args
        self.assertEqual(function_name, "consume_login_attempts")
        self.assertEqual(len(parameters["p_email_ip_key"]), 64)
        self.assertEqual(len(parameters["p_ip_key"]), 64)
        self.assertNotIn("User@example.com", str(parameters))

    @patch("app.core.login_rate_limit.supabase_admin")
    def test_rejects_limited_attempt_with_retry_after(self, client):
        query = Mock()
        query.execute.return_value = SimpleNamespace(
            data=[{"allowed": False, "retry_after": 321}]
        )
        client.rpc.return_value = query

        with self.assertRaises(HTTPException) as raised:
            check_login_rate_limit(make_request(), "user@example.com")

        self.assertEqual(raised.exception.status_code, 429)
        self.assertEqual(raised.exception.headers["Retry-After"], "321")

    @patch("app.core.login_rate_limit.supabase_admin")
    def test_returns_service_unavailable_when_rate_limit_store_fails(self, client):
        client.rpc.side_effect = RuntimeError("database unavailable")

        with self.assertRaises(HTTPException) as raised:
            check_login_rate_limit(make_request(), "user@example.com")

        self.assertEqual(raised.exception.status_code, 503)


if __name__ == "__main__":
    unittest.main()
