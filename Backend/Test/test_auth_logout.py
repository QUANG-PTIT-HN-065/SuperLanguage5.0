import unittest
from types import SimpleNamespace
from unittest.mock import Mock, patch

from fastapi import HTTPException

from app.api.endpoints.auth import logout
from app.schemas.auth import LogoutRequest


class SupabaseAuthError(Exception):
    def __init__(self, status_code: int):
        super().__init__("Supabase Auth request failed.")
        self.status = status_code


class AuthLogoutTests(unittest.TestCase):
    @patch("app.api.endpoints.auth.supabase_admin")
    @patch("app.api.endpoints.auth.new_auth_client")
    def test_refreshes_then_revokes_the_supabase_session(self, new_auth_client, admin):
        auth_client = new_auth_client.return_value
        auth_client.auth.refresh_session.return_value = SimpleNamespace(
            session=SimpleNamespace(access_token="new-access-token"),
        )

        response = logout(LogoutRequest(refresh_token="valid-refresh-token"), "expired-access-token")

        auth_client.auth.refresh_session.assert_called_once_with("valid-refresh-token")
        admin.auth.admin.sign_out.assert_called_once_with("new-access-token", "local")
        self.assertEqual(response["status"], "success")

    @patch("app.api.endpoints.auth.supabase_admin")
    @patch("app.api.endpoints.auth.new_auth_client")
    def test_expired_refresh_token_is_an_idempotent_logout(self, new_auth_client, admin):
        new_auth_client.return_value.auth.refresh_session.side_effect = SupabaseAuthError(401)

        response = logout(LogoutRequest(refresh_token="expired-refresh-token"), "expired-access-token")

        admin.auth.admin.sign_out.assert_not_called()
        self.assertEqual(response["status"], "success")

    @patch("app.api.endpoints.auth.supabase_admin")
    @patch("app.api.endpoints.auth.new_auth_client")
    def test_temporary_refresh_failure_is_reported(self, new_auth_client, admin):
        new_auth_client.return_value.auth.refresh_session.side_effect = SupabaseAuthError(503)

        with self.assertRaises(HTTPException) as raised:
            logout(LogoutRequest(refresh_token="valid-refresh-token"), "expired-access-token")

        self.assertEqual(raised.exception.status_code, 503)
        admin.auth.admin.sign_out.assert_not_called()

    @patch("app.api.endpoints.auth.supabase_admin")
    def test_legacy_logout_still_revokes_the_bearer_session(self, admin):
        response = logout(LogoutRequest(), "access-token")

        admin.auth.admin.sign_out.assert_called_once_with("access-token", "local")
        self.assertEqual(response["status"], "success")


if __name__ == "__main__":
    unittest.main()
