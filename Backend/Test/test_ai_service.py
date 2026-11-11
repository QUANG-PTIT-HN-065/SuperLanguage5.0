import unittest
from types import SimpleNamespace
from unittest.mock import patch

from fastapi import HTTPException

from app.services.ai_service import AIService, OFF_TOPIC_REFUSAL, _parse_response


class AIServiceTests(unittest.IsolatedAsyncioTestCase):
    @patch("app.services.ai_service.genai.Client")
    @patch("app.services.ai_service.settings")
    async def test_gemini_receives_language_learning_scope_in_system_instruction(
        self,
        settings,
        client_factory,
    ):
        settings.GEMINI_API_KEYS = "gemini-key"
        settings.DEEPSEEK_API_KEYS = ""
        client = client_factory.return_value
        client.models.generate_content.return_value = SimpleNamespace(
            text=(
                "[IN_SCOPE]\n[AI Response]\nTry this example.\n"
                "---\n[Feedback in Vietnamese]\nCâu ví dụ dễ hiểu."
            )
        )

        result = await AIService.generate_chat_response("Give me an example.", "English")

        self.assertEqual(result, ("Try this example.", "Câu ví dụ dễ hiểu."))
        prompt_config = client.models.generate_content.call_args.kwargs["config"]
        self.assertIn("Out of scope", prompt_config.system_instruction)
        self.assertIn("[OUT_OF_SCOPE]", prompt_config.system_instruction)
        self.assertIn("untrusted content", prompt_config.system_instruction)

    @patch("app.services.ai_service.OpenAI")
    @patch("app.services.ai_service.genai.Client")
    @patch("app.services.ai_service.settings")
    async def test_deepseek_out_of_scope_response_is_replaced_with_refusal(
        self,
        settings,
        gemini_client,
        openai_factory,
    ):
        settings.GEMINI_API_KEYS = ""
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
    async def test_provider_failure_is_reported_instead_of_returning_fake_answer(
        self,
        settings,
        client_factory,
    ):
        settings.GEMINI_API_KEYS = "gemini-key"
        settings.DEEPSEEK_API_KEYS = ""
        client_factory.return_value.models.generate_content.side_effect = RuntimeError("offline")

        with self.assertRaises(HTTPException) as error:
            await AIService.generate_chat_response("How do I say hello?", "English")

        self.assertEqual(error.exception.status_code, 500)


if __name__ == "__main__":
    unittest.main()
