import unittest
from unittest.mock import patch

from fastapi import HTTPException
from pydantic import ValidationError

from app.schemas.profile import OnboardingRequest, ProfileUpdate
from app.services.profile_service import update_profile


class DailyLearningGoalSchemaTests(unittest.TestCase):
    def test_onboarding_defaults_to_minutes_and_lesson_goals(self):
        request = OnboardingRequest(
            native_language="vi",
            target_language="en",
            current_level="A1",
            target_level="A2",
            learning_goal="study",
        )

        self.assertEqual(request.daily_goal_minutes, 15)
        self.assertEqual(request.daily_goal_lessons, 1)

    def test_profile_update_accepts_daily_goal_changes(self):
        update = ProfileUpdate(daily_goal_minutes=30, daily_goal_lessons=2)

        self.assertEqual(update.daily_goal_minutes, 30)
        self.assertEqual(update.daily_goal_lessons, 2)

    def test_profile_update_rejects_out_of_range_daily_goals(self):
        with self.assertRaises(ValidationError):
            ProfileUpdate(daily_goal_minutes=0)
        with self.assertRaises(ValidationError):
            ProfileUpdate(daily_goal_lessons=21)

    def test_profile_update_rejects_lower_target_level(self):
        with self.assertRaises(ValidationError):
            ProfileUpdate(current_level="B2", target_level="A2")


class ProfileUpdateBusinessRuleTests(unittest.TestCase):
    @patch("app.services.profile_service.validate_languages")
    @patch("app.services.profile_service.get_profile")
    @patch("app.services.profile_service._update_profile")
    def test_update_rejects_target_language_matching_existing_native_language(
        self, update, get_profile, _validate_languages
    ):
        get_profile.return_value = {
            "native_language": "vi",
            "target_language": "ja",
            "current_level": "A1",
            "target_level": "A2",
        }

        with self.assertRaises(HTTPException) as error:
            update_profile("learner", {"target_language": "vi"})

        self.assertEqual(error.exception.status_code, 422)
        update.assert_not_called()

    @patch("app.services.profile_service.validate_languages")
    @patch("app.services.profile_service.get_profile")
    @patch("app.services.profile_service._update_profile")
    def test_update_rejects_target_level_below_existing_current_level(
        self, update, get_profile, _validate_languages
    ):
        get_profile.return_value = {
            "native_language": "vi",
            "target_language": "ja",
            "current_level": "B2",
            "target_level": "C1",
        }

        with self.assertRaises(HTTPException) as error:
            update_profile("learner", {"target_level": "A2"})

        self.assertEqual(error.exception.status_code, 422)
        update.assert_not_called()


if __name__ == "__main__":
    unittest.main()
