import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock, patch
from uuid import uuid4

from app.api.endpoints.chat_ai import send_message
from app.schemas.chat_ai import MessageSend


class FreeConversationEndpointTests(unittest.IsolatedAsyncioTestCase):
    @patch("app.api.endpoints.chat_ai.AIService.generate_chat_response", new_callable=AsyncMock)
    @patch("app.api.endpoints.chat_ai.consume_daily_ai_call")
    @patch("app.api.endpoints.chat_ai.supabase")
    async def test_send_message_uses_free_conversation_mode(
        self,
        client,
        consume_quota,
        generate_response,
    ):
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
        client.table.side_effect = [conversation_table, message_table, message_table]
        generate_response.return_value = ("That sounds lovely. What do you enjoy most?", "")

        response = await send_message(
            MessageSend(
                conversation_id=conversation_id,
                user_message="I like quiet mornings.",
            ),
            profile,
        )

        self.assertEqual(response.data.ai_response, "That sounds lovely. What do you enjoy most?")
        consume_quota.assert_called_once_with(profile)
        generate_response.assert_awaited_once_with(
            "I like quiet mornings.",
            "English",
            "A2",
            conversation_history=[],
            free_conversation=True,
        )


if __name__ == "__main__":
    unittest.main()
