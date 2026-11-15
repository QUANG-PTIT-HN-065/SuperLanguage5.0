import unittest
from types import SimpleNamespace
from unittest.mock import patch

from fastapi import HTTPException

from app.services.ai_service import (
    AIService,
    OFF_TOPIC_REFUSAL,
    _failure_category,
    _parse_response,
)
from app.services.rag_service import RAGError


class AIServiceTests(unittest.IsolatedAsyncioTestCase):
    @patch("app.services.ai_service.genai.Client")
    @patch("app.services.ai_service.settings")
    @patch("app.services.ai_service.retrieve_context", return_value=["Grammar: present perfect"])
    async def test_gemini_receives_language_learning_scope_in_system_instruction(
        self,
        _retrieve_context,
        settings,
        client_factory,
    ):
        settings.GEMINI_API_KEYS = "gemini-key"
        settings.GEMINI_CHAT_MODEL = ""
        settings.OPENAI_API_KEYS = ""
        settings.DEEPSEEK_API_KEYS = ""
        client = client_factory.return_value
        client.models.generate_content.return_value = SimpleNamespace(
            text=(
                "[IN_SCOPE]\n[AI Response]\nTry this example.\n"
                "---\n[Feedback in Vietnamese]\nCâu ví dụ dễ hiểu."
            )
        )

        result = await AIService.generate_chat_response(
            "Give me an example.", "English", current_level="B1"
        )

        self.assertEqual(result, ("Try this example.", "Câu ví dụ dễ hiểu."))
        self.assertEqual(
            client.models.generate_content.call_args.kwargs["model"],
            "gemini-3.5-flash-lite",
        )
        prompt_config = client.models.generate_content.call_args.kwargs["config"]
        self.assertIn("CHỈ trả lời", prompt_config.system_instruction)
        self.assertIn("[OUT_OF_SCOPE]", prompt_config.system_instruction)
        self.assertIn("Grammar: present perfect", prompt_config.system_instruction)
        self.assertIn("B1", prompt_config.system_instruction)
        self.assertIn("không phải", prompt_config.system_instruction)

    @patch("app.services.ai_service.OpenAI")
    @patch("app.services.ai_service.genai.Client")
    @patch("app.services.ai_service.settings")
    @patch("app.services.ai_service.retrieve_context", return_value=["Grammar: present perfect"])
    async def test_deepseek_out_of_scope_response_is_replaced_with_refusal(
        self,
        _retrieve_context,
        settings,
        gemini_client,
        openai_factory,
    ):
        settings.GEMINI_API_KEYS = ""
        settings.OPENAI_API_KEYS = ""
        settings.DEEPSEEK_API_KEYS = "deepseek-key"
        completion = openai_factory.return_value.chat.completions.create
        completion.return_value = SimpleNamespace(
            choices=[
                SimpleNamespace(
                    message=SimpleNamespace(
                        content="[OUT_OF_SCOPE]\nHere is the unrelated answer."
                    )
                )
            ]
        )

        result = await AIService.generate_chat_response("Tell me unrelated trivia.", "Japanese")

        self.assertEqual(result, (OFF_TOPIC_REFUSAL, ""))
        messages = completion.call_args.kwargs["messages"]
        self.assertEqual(messages[0]["role"], "system")
        self.assertIn("[OUT_OF_SCOPE]", messages[0]["content"])
        self.assertEqual(messages[1]["content"], "Tell me unrelated trivia.")
        gemini_client.assert_not_called()

    @patch("app.services.ai_service.OpenAI")
    @patch("app.services.ai_service.settings")
    @patch("app.services.ai_service.retrieve_context", return_value=["Grammar: present perfect"])
    async def test_openai_gpt_receives_retrieved_context(
        self,
        _retrieve_context,
        settings,
        openai_factory,
    ):
        settings.GEMINI_API_KEYS = ""
        settings.OPENAI_API_KEYS = "openai-key"
        settings.OPENAI_CHAT_MODEL = "gpt-test-model"
        settings.DEEPSEEK_API_KEYS = ""
        openai_factory.return_value.chat.completions.create.return_value = SimpleNamespace(
            choices=[
                SimpleNamespace(
                    message=SimpleNamespace(
                        content=(
                            "[IN_SCOPE]\n[AI Response]\nUse this form.\n"
                            "---\n[Feedback in Vietnamese]\nTốt."
                        )
                    )
                )
            ]
        )

        result = await AIService.generate_chat_response("How do I use this tense?", "English")

        self.assertEqual(result, ("Use this form.", "Tốt."))
        request = openai_factory.return_value.chat.completions.create.call_args.kwargs
        self.assertEqual(request["model"], "gpt-test-model")
        self.assertIn("Grammar: present perfect", request["messages"][0]["content"])

    def test_unmarked_model_output_fails_closed(self):
        result = _parse_response("Here is a response without a scope decision.")

        self.assertEqual(result, (OFF_TOPIC_REFUSAL, ""))

    def test_in_scope_marker_is_required_before_answer_is_returned(self):
        result = _parse_response(
            "[IN_SCOPE]\n[AI Response]\nHello!\n---\n[Feedback in Vietnamese]\nTốt."
        )

        self.assertEqual(result, ("Hello!", "Tốt."))

    @patch("app.services.ai_service.genai.Client")
    @patch("app.services.ai_service.settings")
    async def test_translation_request_works_without_a_vector_match(
        self,
        settings,
        client_factory,
    ):
        settings.GEMINI_API_KEYS = "gemini-key"
        settings.GEMINI_CHAT_MODEL = "gemini-3.5-flash-lite"
        settings.OPENAI_API_KEYS = ""
        settings.DEEPSEEK_API_KEYS = ""
        client = client_factory.return_value
        client.models.generate_content.return_value = SimpleNamespace(
            text=(
                "[IN_SCOPE]\n[AI Response]\nRất vui được gặp bạn.\n"
                "---\n[Feedback in Vietnamese]\nCụm từ này dùng khi gặp người mới."
            )
        )

        result = await AIService.generate_chat_response(
            "Nice to meet you có nghĩa là gì?",
            "English",
        )

        self.assertEqual(
            result,
            ("Rất vui được gặp bạn.", "Cụm từ này dùng khi gặp người mới."),
        )
        prompt = client.models.generate_content.call_args.kwargs["config"].system_instruction
        self.assertIn("dịch/giải nghĩa", prompt)
        self.assertIn("bằng tiếng Việt", prompt)

    @patch("app.services.ai_service.genai.Client")
    @patch("app.services.ai_service.settings")
    @patch("app.services.ai_service.retrieve_context", return_value=[])
    async def test_empty_vector_search_refuses_without_calling_llm(
        self,
        _retrieve_context,
        settings,
        client_factory,
    ):
        settings.GEMINI_API_KEYS = "gemini-key"
        settings.OPENAI_API_KEYS = ""
        settings.DEEPSEEK_API_KEYS = ""

        result = await AIService.generate_chat_response("Tell me a joke.", "English")

        self.assertEqual(result, (OFF_TOPIC_REFUSAL, ""))
        client_factory.assert_not_called()

    @patch(
        "app.services.ai_service.retrieve_context",
        side_effect=RAGError("vector store unavailable"),
    )
    async def test_vector_search_failure_is_reported_as_unavailable(self, _retrieve_context):
        with self.assertRaises(HTTPException) as error:
            await AIService.generate_chat_response("How do I use this tense?", "English")

        self.assertEqual(error.exception.status_code, 503)

    @patch("app.services.ai_service.retrieve_context", return_value=["lesson context"])
    @patch("app.services.ai_service.genai.Client")
    @patch("app.services.ai_service.settings")
    async def test_provider_failure_is_reported_as_unavailable_instead_of_fake_answer(
        self,
        settings,
        client_factory,
        _retrieve_context,
    ):
        settings.GEMINI_API_KEYS = "gemini-key"
        settings.DEEPSEEK_API_KEYS = ""
        client_factory.return_value.models.generate_content.side_effect = RuntimeError("offline")

        with self.assertRaises(HTTPException) as error:
            await AIService.generate_chat_response("How do I say hello?", "English")

        self.assertEqual(error.exception.status_code, 503)
        self.assertIn("API key, model và hạn mức", error.exception.detail)

    def test_provider_http_failures_are_classified_for_actionable_logs(self):
        cases = [
            (SimpleNamespace(status_code=401), "authentication_or_permission"),
            (SimpleNamespace(code=429), "rate_limit_or_quota"),
            (SimpleNamespace(status_code=402), "billing_or_balance"),
            (SimpleNamespace(status_code=400), "invalid_request_or_model"),
            (ValueError("model is required"), "invalid_request_or_model"),
            (TimeoutError(), "timeout"),
        ]

        for error, expected_category in cases:
            with self.subTest(expected_category=expected_category):
                category, _ = _failure_category(error)
                self.assertEqual(category, expected_category)

    @patch("app.services.ai_service.OpenAI")
    @patch("app.services.ai_service.genai.Client")
    @patch("app.services.ai_service.settings")
    @patch("app.services.ai_service.retrieve_context", return_value=["lesson context"])
    async def test_all_provider_failures_are_logged_without_api_keys(
        self,
        _retrieve_context,
        settings,
        gemini_client,
        openai_factory,
    ):
        class ProviderError(Exception):
            def __init__(self, status_code: int):
                super().__init__("provider rejected request")
                self.status_code = status_code

        settings.GEMINI_API_KEYS = "private-gemini-key"
        settings.OPENAI_API_KEYS = ""
        settings.DEEPSEEK_API_KEYS = "private-deepseek-key"
        gemini_client.side_effect = ProviderError(403)
        openai_factory.side_effect = ProviderError(402)

        with self.assertLogs("app.services.ai_service", level="WARNING") as captured:
            with self.assertRaises(HTTPException) as error:
                await AIService.generate_chat_response(
                    "Explain this lesson.", "English"
                )

        self.assertEqual(error.exception.status_code, 503)
        logs = "\n".join(captured.output)
        self.assertIn("authentication_or_permission", logs)
        self.assertIn("billing_or_balance", logs)
        self.assertIn("Gemini:authentication_or_permission=1", logs)
        self.assertIn("DeepSeek:billing_or_balance=1", logs)
        self.assertNotIn("private-gemini-key", logs)
        self.assertNotIn("private-deepseek-key", logs)


if __name__ == "__main__":
    unittest.main()
