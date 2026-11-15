import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock, patch
from uuid import uuid4

from app.api.endpoints.chat_ai import send_voice_message


class VoiceChatQuotaTests(unittest.IsolatedAsyncioTestCase):
    async def test_voice_chat_round_consumes_one_daily_ai_call(self):
        profile = {"id": "learner-id", "current_level": "A2"}
        conversation_id = uuid4()
        conversation_table = Mock()
        message_table = Mock()
        conversation_query = Mock()
        history_query = Mock()
        conversation_table.select.return_value.eq.return_value.eq.return_value.limit.return_value = (
            conversation_query
        )
        conversation_query.execute.return_value = SimpleNamespace(
            data=[{"language_code": "en"}],
        )
        message_table.select.return_value.eq.return_value.order.return_value.limit.return_value = (
            history_query
        )
        history_query.execute.return_value = SimpleNamespace(data=[])
        message_table.insert.return_value.execute.return_value = SimpleNamespace(data=[])

        with (
            patch("app.api.endpoints.chat_ai.supabase") as client,
            patch(
                "app.api.endpoints.chat_ai.consume_daily_ai_call",
            ) as consume_quota,
            patch(
                "app.api.endpoints.chat_ai.transcribe_audio",
                return_value="I enjoy learning languages.",
            ),
            patch(
                "app.api.endpoints.chat_ai._verify_audio_conversation",
                return_value="en",
            ),
            patch(
                "app.api.endpoints.chat_ai._read_audio_upload",
                new_callable=AsyncMock,
                return_value=b"audio",
            ),
            patch(
                "app.api.endpoints.chat_ai.AIService.generate_chat_response",
                new_callable=AsyncMock,
                return_value=("That is wonderful!", ""),
            ),
        ):
            client.table.side_effect = [
                conversation_table,
                message_table,
                message_table,
            ]

            response = await send_voice_message(
                conversation_id,
                Mock(content_type="audio/webm"),
                profile,
            )

        self.assertEqual(response.data.user_message, "I enjoy learning languages.")
        self.assertEqual(response.data.ai_response, "That is wonderful!")
        consume_quota.assert_called_once_with(profile)


if __name__ == "__main__":
    unittest.main()
