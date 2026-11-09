import unittest
from types import SimpleNamespace
from unittest.mock import Mock, patch

from app.services.rag_service import (
    _language_for_retrieval,
    retrieve_context,
    split_text_into_chunks,
)


class RAGServiceTests(unittest.TestCase):
    def test_chunks_cover_text_and_include_overlap(self):
        source = "alpha beta gamma delta epsilon zeta"

        chunks = split_text_into_chunks(source, chunk_size=20, overlap=5)

        self.assertGreater(len(chunks), 1)
        self.assertEqual(" ".join(chunks).replace("  ", " ")[:5], "alpha")
        self.assertTrue(all(len(chunk) <= 20 for chunk in chunks))
        self.assertTrue(
            any(
                left.split()[-1] in right.split()[:2]
                for left, right in zip(chunks, chunks[1:])
            )
        )

    def test_rejects_invalid_chunk_configuration(self):
        with self.assertRaises(ValueError):
            split_text_into_chunks("content", chunk_size=10, overlap=10)

    def test_empty_document_produces_no_chunks(self):
        self.assertEqual(split_text_into_chunks(" \n\t "), [])

    def test_normalizes_chat_language_codes(self):
        self.assertEqual(_language_for_retrieval("en"), "English")
        self.assertEqual(_language_for_retrieval("ja"), "Japanese")
        self.assertEqual(_language_for_retrieval("English"), "English")

    @patch("app.services.rag_service._embed_text", return_value=[0.1] * 768)
    @patch("app.services.rag_service.supabase_admin")
    def test_retrieves_scoped_context_with_configured_similarity(
        self,
        client,
        _embed_text,
    ):
        query = Mock()
        query.execute.return_value = SimpleNamespace(
            data=[
                {"title": "Grammar", "content": "Use the present perfect."},
                {"title": "", "content": "Use short questions."},
            ]
        )
        client.rpc.return_value = query

        result = retrieve_context("How does this tense work?", "en")

        self.assertEqual(
            result,
            [
                "Source: Grammar\nUse the present perfect.",
                "Use short questions.",
            ],
        )
        self.assertEqual(client.rpc.call_args.args[0], "match_rag_chunks")
        self.assertEqual(
            client.rpc.call_args.args[1]["p_language_code"],
            "English",
        )
        self.assertEqual(client.rpc.call_args.args[1]["p_match_count"], 4)


if __name__ == "__main__":
    unittest.main()
