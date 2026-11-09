import unittest
from unittest.mock import patch

from app.services.ai_service import AIService


class AIServiceTests(unittest.IsolatedAsyncioTestCase):
    @patch("app.services.ai_service.AIService._generate_with_provider")
    @patch("app.services.ai_service.settings")
    async def test_auto_provider_falls_back_without_exposing_provider_errors(
        self,
        settings,
        generate,
    ):
        settings.AI_PROVIDER = "auto"
        settings.GEMINI_API_KEYS = "gemini-key"
        settings.DEEPSEEK_API_KEYS = "deepseek-key"
        generate.side_effect = [
            RuntimeError("provider failure"),
            "[AI Response]\nTry this example.\n---\n[Feedback in Vietnamese]\nCâu rõ ràng.",
        ]

        result = await AIService.generate_chat_response(
            "Give me an example.",
            "English",
            ["Source: Grammar\nUse a short example."],
        )

        self.assertEqual(result, ("Try this example.", "Câu rõ ràng."))
        self.assertEqual(generate.call_count, 2)
        self.assertEqual(generate.call_args_list[0].args[0], "gemini")
        self.assertEqual(generate.call_args_list[1].args[0], "deepseek")

    @patch("app.services.ai_service.AIService._generate_with_provider")
    @patch("app.services.ai_service.settings")
    async def test_explicit_provider_does_not_switch_provider(
        self,
        settings,
        generate,
    ):
        settings.AI_PROVIDER = "deepseek"
        settings.GEMINI_API_KEYS = "gemini-key"
        settings.DEEPSEEK_API_KEYS = "deepseek-key"
        generate.return_value = "[AI Response]\nHello.\n---\n[Feedback in Vietnamese]\nTốt."

        await AIService.generate_chat_response("Hi", "English")

        self.assertEqual(generate.call_count, 1)
        self.assertEqual(generate.call_args.args[0], "deepseek")
        self.assertEqual(generate.call_args.args[1], "deepseek-key")


if __name__ == "__main__":
    unittest.main()
