import unittest
from types import SimpleNamespace
from unittest.mock import Mock, patch

from app.services.rag_service import (
    RAGError,
    _build_learning_documents,
    _language_for_retrieval,
    _language_for_indexing,
    reindex_learning_material,
    retrieve_context,
    split_text_into_chunks,
    upsert_document,
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
        self.assertEqual(_language_for_indexing("en"), "English")
        self.assertEqual(_language_for_indexing("ja"), "Japanese")
        self.assertEqual(_language_for_indexing("all"), "all")

    def test_rejects_unsupported_index_language(self):
        with self.assertRaises(ValueError):
            _language_for_indexing("ko")

    def test_builds_topic_documents_with_related_vocabulary(self):
        (
            documents,
            indexed_word_ids,
            indexed_topic_ids,
            skipped_topics,
            skipped_words,
        ) = _build_learning_documents(
            [
                {
                    "id": 12,
                    "language_code": "en",
                    "name": "Daily conversation",
                    "description": "Useful everyday phrases.",
                },
                {
                    "id": 13,
                    "language_code": "ko",
                    "name": "Korean basics",
                    "description": "Not supported by this chat.",
                },
            ],
            [{"topic_id": 12, "word_id": 24}],
            [
                {
                    "id": 24,
                    "language_code": "en",
                    "word": "greeting",
                    "meaning": "a polite expression when meeting someone",
                    "part_of_speech": "noun",
                    "level": "A1",
                    "phonetic": "/ˈɡriːtɪŋ/",
                    "example_sentence": "Good morning.",
                    "example_meaning": "Chào buổi sáng.",
                },
                {
                    "id": 25,
                    "language_code": "ja",
                    "word": "こんにちは",
                    "meaning": "hello",
                    "part_of_speech": "phrase",
                },
                {
                    "id": 26,
                    "language_code": "ko",
                    "word": "안녕하세요",
                    "meaning": "hello",
                },
            ],
        )

        self.assertEqual(indexed_word_ids, {24, 25})
        self.assertEqual(indexed_topic_ids, {12})
        self.assertEqual(skipped_topics, 1)
        self.assertEqual(skipped_words, 1)
        self.assertEqual(
            [document[3] for document in documents],
            ["learning-topic:12", "learning-word:25"],
        )
        self.assertIn("Useful everyday phrases.", documents[0][2])
        self.assertIn("Good morning.", documents[0][2])
        self.assertEqual(documents[1][1], "Japanese")

    @patch("app.services.rag_service._remove_stale_documents")
    @patch("app.services.rag_service.upsert_document", return_value=2)
    @patch("app.services.rag_service._fetch_rows")
    def test_reindexes_topics_and_cleans_managed_documents(
        self,
        fetch_rows,
        index_document,
        remove_stale,
    ):
        fetch_rows.side_effect = [
            [{"id": 1, "language_code": "en", "name": "Greetings", "description": "Hello."}],
            [{"topic_id": 1, "word_id": 2}],
            [{"id": 2, "language_code": "en", "word": "hello", "meaning": "a greeting"}],
        ]

        result = reindex_learning_material()

        self.assertEqual(
            result,
            {
                "documents_indexed": 1,
                "topics_indexed": 1,
                "words_indexed": 1,
                "chunks_indexed": 2,
                "topics_skipped": 0,
                "words_skipped": 0,
            },
        )
        index_document.assert_called_once()
        self.assertEqual(index_document.call_args.kwargs["document_key"], "learning-topic:1")
        self.assertEqual(
            remove_stale.call_args_list[0].args[1],
            {"learning-topic:1"},
        )
        self.assertEqual(remove_stale.call_args_list[1].args[1], set())

    @patch("app.services.rag_service._embed_texts", return_value=[[0.2] * 768])
    @patch("app.services.rag_service.supabase_admin")
    def test_upserts_document_chunks_with_canonical_language(self, client, _embed_texts):
        query = Mock()
        query.execute.return_value = SimpleNamespace(data=1)
        client.rpc.return_value = query

        count = upsert_document(
            "Topic",
            "en",
            "A short lesson.",
            document_key="manual:en:topic",
        )

        self.assertEqual(count, 1)
        self.assertEqual(client.rpc.call_args.args[1]["p_language_code"], "English")
        self.assertEqual(client.rpc.call_args.args[1]["p_document_key"], "manual:en:topic")

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

    @patch("app.services.rag_service._embed_text", return_value=[0.1] * 768)
    @patch("app.services.rag_service.supabase_admin")
    def test_invalid_vector_search_response_raises_rag_error(self, client, _embed_text):
        query = Mock()
        query.execute.return_value = SimpleNamespace(data=None)
        client.rpc.return_value = query

        with self.assertRaises(RAGError):
            retrieve_context("How does this tense work?", "en")


if __name__ == "__main__":
    unittest.main()
