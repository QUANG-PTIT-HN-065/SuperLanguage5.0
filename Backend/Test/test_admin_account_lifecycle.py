import unittest
from unittest.mock import Mock, patch

from app.services.admin import (
    delete_admin_user,
    process_inactive_account_deletions,
    schedule_inactive_account_deletions,
    set_admin_user_status,
)


class AdminAccountLifecycleTests(unittest.TestCase):
    @patch("app.services.admin.supabase_admin")
    def test_lock_and_unlock_user_updates_profile_and_auth_ban(self, supabase):
        supabase.table.return_value.update.return_value.eq.return_value.execute.return_value.data = [
            {"id": "user-1", "status": "suspended"}
        ]

        locked = set_admin_user_status("user-1", "lock")
        supabase.auth.admin.update_user_by_id.assert_called_with(
            "user-1", {"ban_duration": "876000h"}
        )
        self.assertEqual(locked["status"], "suspended")

        supabase.table.return_value.update.return_value.eq.return_value.execute.return_value.data = [
            {"id": "user-1", "status": "active"}
        ]
        unlocked = set_admin_user_status("user-1", "unlock")
        supabase.auth.admin.update_user_by_id.assert_called_with(
            "user-1", {"ban_duration": "none"}
        )
        self.assertEqual(unlocked["status"], "active")

    @patch("app.services.admin.supabase_admin")
    def test_delete_user_removes_supabase_auth_account(self, supabase):
        delete_admin_user("user-1")
        supabase.auth.admin.delete_user.assert_called_once_with("user-1")

    @patch("app.services.admin._send_inactivity_warning", return_value=True)
    @patch("app.services.admin._inactive_profiles")
    @patch("app.services.admin.supabase_admin")
    def test_schedule_sends_warning_and_sets_7_day_deadline(
        self, supabase, inactive_profiles, send_warning
    ):
        inactive_profiles.return_value = [
            {
                "id": "user-1",
                "email": "old@example.com",
                "display_name": "Old User",
                "username": "old_user",
            }
        ]

        result = schedule_inactive_account_deletions()

        send_warning.assert_called_once_with("old@example.com", "Old User")
        supabase.table.return_value.update.return_value.eq.return_value.execute.assert_called_once()
        self.assertEqual(result["eligible_accounts"], 1)
        self.assertEqual(result["warning_emails_sent"], 1)

    @patch("app.services.admin.delete_admin_user")
    @patch("app.services.admin.supabase_admin")
    def test_process_deletes_only_due_accounts_still_inactive(
        self, supabase, delete_user
    ):
        supabase.table.return_value.select.return_value.is_.return_value.lte.return_value.execute.return_value.data = [
            {"id": "user-1"}
        ]
        supabase.table.return_value.select.return_value.eq.return_value.limit.return_value.execute.return_value.data = [
            {
                "id": "user-1",
                "last_sign_in_at": "2023-01-01T00:00:00+00:00",
                "updated_at": "2023-01-01T00:00:00+00:00",
                "created_at": "2022-01-01T00:00:00+00:00",
            }
        ]
        supabase.table.return_value.select.return_value.eq.return_value.limit.return_value.execute.side_effect = [
            Mock(data=[
                {
                    "id": "user-1",
                    "last_sign_in_at": "2023-01-01T00:00:00+00:00",
                    "updated_at": "2023-01-01T00:00:00+00:00",
                    "created_at": "2022-01-01T00:00:00+00:00",
                }
            ]),
            Mock(data=[{"last_activity_date": "2023-01-01"}]),
        ]

        result = process_inactive_account_deletions()

        delete_user.assert_called_once_with("user-1")
        self.assertEqual(result["deleted_accounts"], 1)


if __name__ == "__main__":
    unittest.main()
