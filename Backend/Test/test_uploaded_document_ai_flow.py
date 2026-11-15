import io
import unittest
from types import SimpleNamespace
from unittest.mock import patch

from fastapi import HTTPException, UploadFile

from app.api.endpoints.admin import upload_rag_document
from app.services.ai_service import AIService


class UploadedDocumentAIFlowTests(unittest.IsolatedAsyncioTestCase):
    async def test_uploaded_text_is_sent_to_rag_chunk_indexing(self):
        uploaded_content = "Present perfect marker: DOC_MARKER_7F3A."
        upload = UploadFile(
            filename="grammar-note.txt",
            file=io.BytesIO(uploaded_content.encode("utf-8")),
        )

        with patch(
            "app.api.endpoints.admin.upsert_document",
            return_value=1,
        ) as index_document:
            response = await upload_rag_document(
                language_code="English",
                file=upload,
                _={"id": "admin-id", "role": "admin"},
            )

        index_document.assert_called_once_with(
            "grammar-note",
            "English",
            uploaded_content,
        )
        self.assertEqual(response.title, "grammar-note")
        self.assertEqual(response.language_code, "English")
        self.assertEqual(response.chunks_indexed, 1)

    async def test_uploaded_binary_file_is_rejected_before_indexing(self):
        upload = UploadFile(
            filename="grammar.pdf",
            file=io.BytesIO(b"%PDF-unsupported-for-text-upload"),
        )

        with patch("app.api.endpoints.admin.upsert_document") as index_document:
            with self.assertRaises(HTTPException) as error:
                await upload_rag_document(
                    language_code="English",
                    file=upload,
                    _={"id": "admin-id", "role": "admin"},
                )

        self.assertEqual(error.exception.status_code, 415)
        index_document.assert_not_called()

    @patch("app.services.ai_service.genai.Client")
    @patch("app.services.ai_service.settings")
    @patch(
        "app.services.ai_service.retrieve_context",
        return_value=[
            "Source: grammar-note\nPresent perfect marker: DOC_MARKER_7F3A."
        ],
    )
    async def test_ai_prompt_contains_uploaded_document_context(
        self,
        _retrieve_context,
        settings,
        client_factory,
    ):
        settings.GEMINI_API_KEYS = "test-gemini-key"
        settings.GEMINI_CHAT_MODEL = "test-model"
        settings.OPENAI_API_KEYS = ""
        settings.DEEPSEEK_API_KEYS = ""
        client_factory.return_value.models.generate_content.return_value = SimpleNamespace(
            text=(
                "[IN_SCOPE]\n[AI Response]\nThe marker is in the uploaded note.\n"
                "---\n[Feedback in Vietnamese]\nTốt."
            ),
        )

        response, feedback = await AIService.generate_chat_response(
            "What marker is in the grammar note?",
            "English",
        )

        prompt = client_factory.return_value.models.generate_content.call_args.kwargs[
            "config"
        ].system_instruction
        self.assertIn("DOC_MARKER_7F3A", prompt)
        self.assertEqual(response, "The marker is in the uploaded note.")
        self.assertEqual(feedback, "Tốt.")


if __name__ == "__main__":
    unittest.main()
