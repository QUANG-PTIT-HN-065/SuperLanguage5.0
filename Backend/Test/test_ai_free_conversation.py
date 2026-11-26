import json
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock, patch
from uuid import uuid4

from fastapi import FastAPI, HTTPException
from httpx import ASGITransport, AsyncClient
from pydantic import ValidationError

from app.api.endpoints.chat_ai import create_conversation, router, send_message
from app.core.deps import get_current_profile
from app.schemas.chat_ai import ConversationCreate, MessageSend
from app.services.ai_service import _plan_chat_turn
from app.services.rag_service import RAGError


class ChatRAGEndpointTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.plan = self.enterContext(patch(
            "app.services.ai_service._plan_chat_turn",
            side_effect=lambda message, language, history, prefer_local=False: (
                "knowledge",
                message,
                "Vietnamese",
            ),
        ))
        self.profile = {"id": "learner-id", "current_level": "A2"}
        self.conversation_id = uuid4()
        self.conversation_table = Mock()
        self.message_table = Mock()
        self.conversation_query = (
            self.conversation_table.select.return_value.eq.return_value
            .eq.return_value.limit.return_value
        )
        self.conversation_query.execute.return_value = SimpleNamespace(
            data=[{"language_code": "vi"}],
        )
        self.history_query = (
            self.message_table.select.return_value.eq.return_value
            .order.return_value.limit.return_value
        )
        self.history_query.execute.return_value = SimpleNamespace(data=[
            {"sender_type": "ai", "content": "Bạn muốn học cách xưng hô nào?"},
            {"sender_type": "user", "content": "Tôi muốn học cách xưng hô."},
        ])
        self.client = self.enterContext(patch("app.api.endpoints.chat_ai.supabase"))
        self.client.table.side_effect = lambda name: {
            "conversations": self.conversation_table,
            "messages": self.message_table,
        }[name]
        self.consume_quota = self.enterContext(
            patch("app.api.endpoints.chat_ai.consume_daily_ai_call")
        )
        self.message = MessageSend(
            conversation_id=self.conversation_id,
            user_message="Cách xưng hô khi gặp người lớn tuổi?",
        )

    def test_creates_vietnamese_conversation_with_database_language_code(self):
        self.conversation_table.insert.return_value.select.return_value.single.return_value.execute.return_value = (
            SimpleNamespace(data={
                "id": str(self.conversation_id),
                "title": "Học tiếng Việt",
                "language_code": "vi",
                "practice_mode": "free-chat",
            })
        )

        response = create_conversation(
            ConversationCreate(title="Học tiếng Việt", language_code="Vietnamese"),
            self.profile,
        )

        self.assertEqual(response.data.language_code, "vi")
        self.conversation_table.insert.assert_called_once_with({
            "user_id": "learner-id",
            "title": "Học tiếng Việt",
            "language_code": "vi",
            "practice_mode": "free-chat",
        })

    @patch("app.services.ai_service._complete_with_providers")
    @patch("app.services.ai_service.retrieve_context", return_value=["Cách chào: Cháu chào bác ạ."])
    async def test_http_contract_creates_vietnamese_chat_and_returns_rag_reply(self, retrieve, complete):
        self.conversation_table.insert.return_value.select.return_value.single.return_value.execute.return_value = (
            SimpleNamespace(data={
                "id": str(self.conversation_id), "title": "Học tiếng Việt",
                "language_code": "vi", "practice_mode": "free-chat",
            })
        )
        self.plan.side_effect = _plan_chat_turn
        complete.side_effect = [
            json.dumps({
                "intent": "knowledge", "query": self.message.user_message,
                "response_language": "Vietnamese",
            }),
            "[IN_SCOPE]\n[AI Response]\nCháu chào bác ạ.\n---\n[Feedback in Vietnamese]\n",
        ]
        app = FastAPI()
        app.include_router(router, prefix="/api/v1/chat-ai")
        app.dependency_overrides[get_current_profile] = lambda: self.profile
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test", trust_env=False) as http:
            created = await http.post("/api/v1/chat-ai/conversations", json={
                "title": "Học tiếng Việt", "language_code": "Vietnamese", "practice_mode": "free-chat",
            })
            self.assertEqual(created.status_code, 200)
            data = created.json()["data"]
            self.assertEqual(data["language_code"], "vi")
            response = await http.post("/api/v1/chat-ai/send-message", json={
                "conversation_id": data["id"], "user_message": f"  {self.message.user_message}  ",
            })

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["data"]["ai_response"], "Cháu chào bác ạ.")
        retrieve.assert_called_once_with(self.message.user_message, "Vietnamese")
        self.assertEqual(complete.call_count, 2)
        for call in complete.call_args_list:
            self.assertEqual(call.args[1], self.message.user_message)
            self.assertEqual(len(call.args[2]), 2)

    def test_rejects_unsupported_conversation_language(self):
        with self.assertRaises(ValidationError):
            ConversationCreate(title="Unsupported", language_code="Korean")

    @patch("app.api.endpoints.chat_ai.AIService.generate_chat_response", new_callable=AsyncMock)
    async def test_send_message_uses_rag_mode_for_each_supported_language(self, generate_response):
        generate_response.return_value = ("Câu trả lời từ AI.", "")
        for code, language in (
            ("en", "English"), ("ja", "Japanese"), ("vi", "Vietnamese"),
            ("English", "English"), ("Japanese", "Japanese"), ("Vietnamese", "Vietnamese"),
        ):
            with self.subTest(language=code):
                self.conversation_query.execute.return_value = SimpleNamespace(
                    data=[{"language_code": code}],
                )
                response = await send_message(self.message, self.profile)
                self.assertEqual(response.data.ai_response, "Câu trả lời từ AI.")
                generate_response.assert_awaited_with(
                    self.message.user_message,
                    language,
                    "A2",
                    conversation_history=[
                        {"role": "user", "content": "Tôi muốn học cách xưng hô."},
                        {"role": "assistant", "content": "Bạn muốn học cách xưng hô nào?"},
                    ],
                    grammar_mode=False,
                    prefer_local=True,
                )
        self.assertEqual(self.consume_quota.call_count, 6)
        self.conversation_table.select.return_value.eq.return_value.eq.assert_called_with(
            "user_id", self.profile["id"],
        )

    @patch("app.services.ai_service._complete_with_providers")
    @patch("app.services.rag_service.supabase_admin")
    @patch("app.services.rag_service._embed_text", return_value=[0.1] * 768)
    async def test_vietnamese_message_retrieves_context_and_persists_reply(
        self, embed, vector_client, complete,
    ):
        vector_client.rpc.return_value.execute.return_value = SimpleNamespace(data=[
            {"title": "Xưng hô", "content": "Dùng cháu với cô, chú hoặc bác."},
        ])
        reply = "Bạn có thể nói: Cháu chào bác ạ."
        feedback = '{"grammar_error":"","corrected_sentence":"","natural_suggestion":""}'
        complete.return_value = (
            f"[IN_SCOPE]\n[AI Response]\n{reply}\n---\n[Feedback in Vietnamese]\n{feedback}"
        )

        response = await send_message(self.message, self.profile)

        self.assertEqual(response.data.ai_response, reply)
        self.assertEqual(response.data.ai_feedback, feedback)
        embed.assert_called_once_with(self.message.user_message)
        self.assertEqual(vector_client.rpc.call_args.args[0], "match_rag_chunks")
        self.assertEqual(vector_client.rpc.call_args.args[1]["p_language_code"], "Vietnamese")
        self.assertIn("Dùng cháu với cô, chú hoặc bác.", complete.call_args.args[0])
        self.assertIn("Ngôn ngữ mục tiêu: Vietnamese", complete.call_args.args[0])
        self.assertEqual(len(complete.call_args.args[2]), 2)
        self.consume_quota.assert_called_once_with(self.profile)
        self.message_table.insert.assert_called_once_with([
            {"conversation_id": str(self.conversation_id), "sender_type": "user", "content": self.message.user_message},
            {"conversation_id": str(self.conversation_id), "sender_type": "ai", "content": reply, "ai_feedback": feedback},
        ])

    @patch("app.services.ai_service._complete_with_providers")
    @patch("app.services.ai_service.retrieve_context", return_value=[])
    async def test_empty_context_returns_helpful_missing_document_response(self, retrieve, complete):
        reply = "Mình chưa tìm thấy tài liệu phù hợp. Bạn gửi nội dung để mình hỗ trợ nhé."
        complete.return_value = f"[IN_SCOPE]\n[AI Response]\n{reply}\n---\n[Feedback in Vietnamese]\n"
        response = await send_message(self.message, self.profile)

        self.assertEqual(response.data.ai_response, reply)
        retrieve.assert_called_once_with(self.message.user_message, "Vietnamese")
        complete.assert_called_once()
        self.assertIn("Không tìm thấy ngữ cảnh học tập", complete.call_args.args[0])

    @patch("app.services.ai_service._complete_with_providers")
    @patch("app.services.ai_service.retrieve_context", side_effect=RAGError("unavailable"))
    async def test_rag_failure_does_not_save_messages(self, retrieve, complete):
        with self.assertRaises(HTTPException) as raised:
            await send_message(self.message, self.profile)

        self.assertEqual(raised.exception.status_code, 503)
        self.assertIn("Kho tri thức", raised.exception.detail)
        self.message_table.insert.assert_not_called()
        complete.assert_not_called()

    @patch("app.services.ai_service._complete_with_providers", side_effect=HTTPException(503, "AI unavailable"))
    @patch("app.services.ai_service.retrieve_context", return_value=["Xưng hô với người lớn."])
    async def test_provider_failure_does_not_save_messages(self, retrieve, complete):
        with self.assertRaises(HTTPException) as raised:
            await send_message(self.message, self.profile)

        self.assertEqual(raised.exception.status_code, 503)
        self.message_table.insert.assert_not_called()

    @patch("app.services.ai_service._complete_with_providers", return_value="[AI Response]\nHello!")
    async def test_invalid_answer_format_does_not_save_a_fake_scope_refusal(self, complete):
        self.plan.side_effect = None
        self.plan.return_value = ("conversation", "", "English")

        with self.assertRaises(HTTPException) as raised:
            await send_message(self.message, self.profile)

        self.assertEqual(raised.exception.status_code, 502)
        complete.assert_called_once()
        self.message_table.insert.assert_not_called()

    @patch("app.services.ai_service.retrieve_context")
    async def test_invalid_chat_plan_does_not_retrieve_or_save_messages(self, retrieve):
        self.plan.side_effect = HTTPException(502, "Invalid chat plan")

        with self.assertRaises(HTTPException) as raised:
            await send_message(self.message, self.profile)

        self.assertEqual(raised.exception.status_code, 502)
        retrieve.assert_not_called()
        self.message_table.insert.assert_not_called()

    @patch("app.api.endpoints.chat_ai.AIService.generate_chat_response", new_callable=AsyncMock)
    async def test_unowned_conversation_is_rejected_before_rag_or_quota(self, generate):
        self.conversation_query.execute.return_value = SimpleNamespace(data=[])

        with self.assertRaises(HTTPException) as raised:
            await send_message(self.message, self.profile)

        self.assertEqual(raised.exception.status_code, 404)
        self.consume_quota.assert_not_called()
        generate.assert_not_awaited()
        self.message_table.insert.assert_not_called()

    @patch("app.api.endpoints.chat_ai.AIService.generate_chat_response", new_callable=AsyncMock)
    async def test_quota_failure_does_not_call_ai_or_save_messages(self, generate):
        self.consume_quota.side_effect = HTTPException(429, "Daily limit")

        with self.assertRaises(HTTPException) as raised:
            await send_message(self.message, self.profile)

        self.assertEqual(raised.exception.status_code, 429)
        generate.assert_not_awaited()
        self.message_table.insert.assert_not_called()


if __name__ == "__main__":
    unittest.main()
