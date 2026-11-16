import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock, patch
from uuid import uuid4

from fastapi import HTTPException

from app.api.endpoints.chat_ai import (
    create_conversation,
    generate_reading_prompt,
    list_conversations,
    submit_reading_practice_answer,
    transcribe_practice_audio,
)
from app.schemas.chat_ai import ConversationCreate, ReadingPromptRequest


class MissingPracticeModeColumnError(Exception):
    code = "42703"

    def __init__(self):
        super().__init__("column conversations.practice_mode does not exist")


class ReadingPromptEndpointTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.profile = {
            "id": "learner-id",
            "current_level": "A2",
        }
        self.conversation_id = uuid4()

    @patch("app.api.endpoints.chat_ai.supabase")
    def test_loads_legacy_conversation_history_without_practice_mode(
        self,
        client,
    ):
        query = (
            client.table.return_value.select.return_value.eq.return_value
            .order.return_value.limit.return_value.execute
        )
        query.side_effect = [
            MissingPracticeModeColumnError(),
            SimpleNamespace(data=[{
                "id": str(self.conversation_id),
                "title": "Old conversation",
                "language_code": "en",
                "created_at": "2025-01-01T00:00:00Z",
                "updated_at": "2025-01-02T00:00:00Z",
            }]),
        ]

        response = list_conversations(profile=self.profile)

        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0].practice_mode, "free-chat")
        self.assertIn("migration 11", response.message)
        self.assertEqual(query.call_count, 2)

    @patch("app.api.endpoints.chat_ai.supabase")
    def test_creates_legacy_free_chat_when_migration_is_not_applied(
        self,
        client,
    ):
        execute = (
            client.table.return_value.insert.return_value.select.return_value
            .single.return_value.execute
        )
        execute.side_effect = [
            MissingPracticeModeColumnError(),
            SimpleNamespace(data={
                "id": str(self.conversation_id),
                "title": "Old conversation",
                "language_code": "en",
                "created_at": "2025-01-01T00:00:00Z",
                "updated_at": "2025-01-02T00:00:00Z",
            }),
        ]

        response = create_conversation(
            ConversationCreate(
                title="Old conversation",
                language_code="English",
                practice_mode="free-chat",
            ),
            self.profile,
        )

        self.assertEqual(response.data.practice_mode, "free-chat")
        self.assertIn("migration 11", response.message)
        self.assertEqual(execute.call_count, 2)

    @patch("app.api.endpoints.chat_ai.supabase")
    def test_requires_migration_to_create_read_aloud_sessions(self, client):
        execute = (
            client.table.return_value.insert.return_value.select.return_value
            .single.return_value.execute
        )
        execute.side_effect = MissingPracticeModeColumnError()

        with self.assertRaises(HTTPException) as raised:
            create_conversation(
                ConversationCreate(
                    title="Speaking practice",
                    language_code="English",
                    practice_mode="read-aloud",
                ),
                self.profile,
            )

        self.assertEqual(raised.exception.status_code, 503)
        self.assertIn("migration 11", raised.exception.detail)
        self.assertEqual(execute.call_count, 1)

    @patch("app.api.endpoints.chat_ai.AIService.generate_chat_response", new_callable=AsyncMock)
    @patch("app.api.endpoints.chat_ai.consume_daily_ai_call")
    @patch("app.api.endpoints.chat_ai.supabase")
    async def test_generates_a_prompt_for_the_owned_conversation_topic(
        self,
        client,
        consume_quota,
        generate_response,
    ):
        conversation_table = Mock()
        reading_turns_table = Mock()
        client.table.side_effect = lambda table_name: {
            "conversations": conversation_table,
            "reading_practice_turns": reading_turns_table,
        }[table_name]
        conversation_query = (
            conversation_table.select.return_value.eq.return_value.eq.return_value.limit.return_value
        )
        conversation_query.execute.return_value = SimpleNamespace(
            data=[{
                "id": str(self.conversation_id),
                "title": "At a restaurant",
                "language_code": "en",
                "practice_mode": "read-aloud",
            }],
        )
        reading_turns_table.select.return_value.eq.return_value.order.return_value.limit.return_value.execute.return_value = (
            SimpleNamespace(data=[{
                "id": str(uuid4()),
                "question": "What would you like to eat?",
                "sample_answer": "I would like a bowl of soup.",
                "transcript": "I would like noodles, please.",
                "ai_feedback": {"grammar_error": ""},
                "created_at": "2025-01-01T00:00:00Z",
            }])
        )
        reading_turns_table.insert.return_value.select.return_value.single.return_value.execute.return_value = (
            SimpleNamespace(data={
                "id": str(uuid4()),
                "conversation_id": str(self.conversation_id),
                "question": "What would you like to order?",
                "sample_answer": "I would like a bowl of soup, please.",
                "created_at": "2025-01-01T00:00:00Z",
            })
        )
        generate_response.return_value = (
            '{"question":"What would you like to order?",'
            '"sample_answer":"I would like a bowl of soup, please."}',
            "",
        )

        response = await generate_reading_prompt(
            ReadingPromptRequest(conversation_id=self.conversation_id),
            self.profile,
        )

        self.assertEqual(response.data.question, "What would you like to order?")
        self.assertEqual(
            response.data.sample_answer,
            "I would like a bowl of soup, please.",
        )
        consume_quota.assert_called_once_with(self.profile)
        generate_response.assert_awaited_once_with(
            "Create one short question and one sample answer for the learner.",
            "English",
            "A2",
            reading_topic="At a restaurant",
            reading_history=[{
                "question": "What would you like to eat?",
                "sample_answer": "I would like a bowl of soup.",
                "learner_answer": "I would like noodles, please.",
            }],
        )

    @patch("app.api.endpoints.chat_ai.supabase")
    @patch(
        "app.api.endpoints.chat_ai._load_reading_conversation",
        return_value={
            "title": "At a restaurant",
            "language_code": "en",
            "practice_mode": "read-aloud",
        },
    )
    @patch("app.api.endpoints.chat_ai.consume_daily_ai_call")
    @patch("app.api.endpoints.chat_ai.AIService.generate_chat_response", new_callable=AsyncMock)
    async def test_reuses_an_unanswered_prompt_instead_of_generating_another(
        self,
        generate_response,
        consume_quota,
        _load_conversation,
        client,
    ):
        pending_turn = {
            "id": str(uuid4()),
            "question": "What would you like to drink?",
            "sample_answer": "I would like water, please.",
            "transcript": None,
            "ai_feedback": None,
            "created_at": "2025-01-01T00:00:00Z",
        }
        query = (
            client.table.return_value.select.return_value.eq.return_value
            .order.return_value.limit.return_value.execute
        )
        query.return_value = SimpleNamespace(data=[pending_turn])

        response = await generate_reading_prompt(
            ReadingPromptRequest(conversation_id=self.conversation_id),
            self.profile,
        )

        self.assertEqual(str(response.data.id), pending_turn["id"])
        self.assertEqual(response.data.question, pending_turn["question"])
        consume_quota.assert_not_called()
        generate_response.assert_not_awaited()

    @patch("app.api.endpoints.chat_ai.supabase")
    @patch(
        "app.api.endpoints.chat_ai._load_reading_conversation",
        return_value={
            "title": "At a restaurant",
            "language_code": "en",
            "practice_mode": "read-aloud",
        },
    )
    @patch("app.api.endpoints.chat_ai.consume_daily_ai_call")
    @patch("app.api.endpoints.chat_ai.AIService.generate_chat_response", new_callable=AsyncMock)
    async def test_replaces_a_pending_question_that_repeats_the_history(
        self,
        generate_response,
        consume_quota,
        _load_conversation,
        client,
    ):
        pending_turn = {
            "id": str(uuid4()),
            "question": "What would you like to drink?",
            "sample_answer": "I would like water, please.",
            "transcript": None,
            "ai_feedback": None,
            "created_at": "2025-01-02T00:00:00Z",
        }
        previous_turn = {
            "id": str(uuid4()),
            "question": "What would you like to drink?",
            "sample_answer": "I would like tea, please.",
            "transcript": "I would like a glass of water.",
            "ai_feedback": {},
            "created_at": "2025-01-01T00:00:00Z",
        }
        table = client.table.return_value
        table.select.return_value.eq.return_value.order.return_value.limit.return_value.execute.return_value = (
            SimpleNamespace(data=[pending_turn, previous_turn])
        )
        table.update.return_value.eq.return_value.eq.return_value.select.return_value.single.return_value.execute.return_value = (
            SimpleNamespace(data={
                **pending_turn,
                "conversation_id": str(self.conversation_id),
                "question": "Would you like to order something to eat?",
                "sample_answer": "I would like a bowl of soup, please.",
            })
        )
        generate_response.return_value = (
            '{"question":"Would you like to order something to eat?",'
            '"sample_answer":"I would like a bowl of soup, please."}',
            "",
        )

        response = await generate_reading_prompt(
            ReadingPromptRequest(conversation_id=self.conversation_id),
            self.profile,
        )

        self.assertEqual(str(response.data.id), pending_turn["id"])
        self.assertEqual(response.data.question, "Would you like to order something to eat?")
        consume_quota.assert_not_called()
        generate_response.assert_awaited_once_with(
            "Create one short question and one sample answer for the learner.",
            "English",
            "A2",
            reading_topic="At a restaurant",
            reading_history=[{
                "question": "What would you like to drink?",
                "sample_answer": "I would like tea, please.",
                "learner_answer": "I would like a glass of water.",
            }],
        )
        table.update.assert_called_once()

    @patch("app.api.endpoints.chat_ai.consume_daily_ai_call")
    @patch("app.api.endpoints.chat_ai.supabase")
    async def test_rejects_conversations_not_owned_by_the_learner(
        self,
        client,
        consume_quota,
    ):
        query = Mock()
        query_builder = client.table.return_value.select.return_value.eq.return_value.eq.return_value
        query_builder.limit.return_value = query
        query.execute.return_value = SimpleNamespace(data=[])

        with self.assertRaises(HTTPException) as raised:
            await generate_reading_prompt(
                ReadingPromptRequest(conversation_id=self.conversation_id),
                self.profile,
            )

        self.assertEqual(raised.exception.status_code, 404)
        consume_quota.assert_not_called()

    @patch("app.api.endpoints.chat_ai.supabase")
    @patch("app.api.endpoints.chat_ai._load_reading_conversation")
    @patch("app.api.endpoints.chat_ai.AIService.evaluate_reading_practice_audio", new_callable=AsyncMock)
    @patch("app.api.endpoints.chat_ai._prepare_pronunciation_audio", new_callable=AsyncMock)
    @patch("app.api.endpoints.chat_ai._transcribe_for_profile", new_callable=AsyncMock)
    @patch("app.api.endpoints.chat_ai._read_audio_upload", new_callable=AsyncMock)
    async def test_saves_one_transcription_and_structured_ai_feedback(
        self,
        read_audio_upload,
        transcribe_for_profile,
        prepare_pronunciation_audio,
        evaluate_audio,
        load_conversation,
        client,
    ):
        turn_id = uuid4()
        load_conversation.return_value = {
            "language_code": "en",
            "practice_mode": "read-aloud",
        }
        client.table.return_value.select.return_value.eq.return_value.eq.return_value.limit.return_value.execute.return_value = (
            SimpleNamespace(data=[{
                "id": str(turn_id),
                "conversation_id": str(self.conversation_id),
                "question": "What would you like?",
                "sample_answer": "I would like an apple.",
                "transcript": None,
                "ai_feedback": None,
            }])
        )
        client.table.return_value.update.return_value.eq.return_value.eq.return_value.select.return_value.single.return_value.execute.return_value = (
            SimpleNamespace(data={
                "id": str(turn_id),
                "conversation_id": str(self.conversation_id),
                "question": "What would you like?",
                "sample_answer": "I would like an apple.",
                "transcript": "I want apple.",
                "ai_feedback": {
                    "grammar_error": "Thiếu mạo từ.",
                    "corrected_sentence": "I want an apple.",
                    "natural_suggestion": "Could I have an apple, please?",
                    "pronunciation_score": 88,
                    "pronunciation_feedback": "Phát âm rõ; chú ý âm cuối.",
                },
                "created_at": "2025-01-01T00:00:00Z",
            })
        )
        read_audio_upload.return_value = b"audio"
        prepare_pronunciation_audio.return_value = b"wav-audio"
        transcribe_for_profile.return_value = "I want apple."
        evaluate_audio.return_value = (
            '{"grammar_error":"Thiếu mạo từ.","corrected_sentence":"I want an apple.",'
            '"natural_suggestion":"Could I have an apple, please?",'
            '"pronunciation_score":88,"pronunciation_feedback":"Phát âm rõ; chú ý âm cuối."}'
        )

        response = await submit_reading_practice_answer(
            self.conversation_id,
            turn_id,
            Mock(),
            self.profile,
        )

        self.assertEqual(response.data.transcript, "I want apple.")
        self.assertEqual(response.data.ai_feedback.grammar_error, "Thiếu mạo từ.")
        self.assertEqual(response.data.ai_feedback.pronunciation_score, 88)
        self.assertEqual(
            response.data.ai_feedback.pronunciation_feedback,
            "Phát âm rõ; chú ý âm cuối.",
        )
        read_audio_upload.assert_awaited_once()
        prepare_pronunciation_audio.assert_awaited_once_with(b"audio")
        transcribe_for_profile.assert_awaited_once_with(
            b"wav-audio",
            self.profile,
            "en",
            charge_quota=False,
        )
        evaluate_audio.assert_awaited_once_with(
            b"wav-audio",
            "I want apple.",
            "What would you like?",
            "I would like an apple.",
            "English",
            "A2",
        )

    @patch("app.api.endpoints.chat_ai.supabase")
    @patch("app.api.endpoints.chat_ai._read_audio_upload", new_callable=AsyncMock)
    @patch("app.api.endpoints.chat_ai._transcribe_for_profile", new_callable=AsyncMock)
    async def test_practice_transcription_uses_the_conversation_language(
        self,
        transcribe_for_profile,
        read_audio_upload,
        client,
    ):
        query = Mock()
        client.table.return_value.select.return_value.eq.return_value.eq.return_value.limit.return_value = query
        query.execute.return_value = SimpleNamespace(data=[{"language_code": "ja"}])
        read_audio_upload.return_value = b"audio"
        transcribe_for_profile.return_value = "今日はいい天気です。"

        response = await transcribe_practice_audio(
            self.conversation_id,
            Mock(),
            self.profile,
        )

        self.assertEqual(response.data.transcript, "今日はいい天気です。")
        transcribe_for_profile.assert_awaited_once_with(
            b"audio",
            self.profile,
            "ja",
        )


if __name__ == "__main__":
    unittest.main()
