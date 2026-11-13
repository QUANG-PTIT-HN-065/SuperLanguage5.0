import hashlib
import logging
import re
from collections.abc import Mapping
from typing import Any

from google import genai
from google.genai import types

from app.core.config import settings
from app.db.supabase import supabase_admin

logger = logging.getLogger(__name__)
_EMBEDDING_DIMENSIONS = 768
_EMBEDDING_BATCH_SIZE = 32
_CHUNK_SIZE = 1200
_CHUNK_OVERLAP = 180
_MAX_MATCH_COUNT = 10
_DATABASE_PAGE_SIZE = 500
_DOCUMENT_DELETE_BATCH_SIZE = 100
_MANAGED_DOCUMENT_PREFIXES = ("learning-topic:", "learning-word:")


class RAGError(RuntimeError):
    """Raised when embedding or vector search cannot be completed."""


def split_text_into_chunks(
    text: str,
    chunk_size: int = _CHUNK_SIZE,
    overlap: int = _CHUNK_OVERLAP,
) -> list[str]:
    normalized = re.sub(r"\s+", " ", text).strip()
    if not normalized:
        return []
    if chunk_size <= 0 or overlap < 0 or overlap >= chunk_size:
        raise ValueError("Chunk size and overlap are invalid.")

    chunks: list[str] = []
    start = 0
    while start < len(normalized):
        end = min(start + chunk_size, len(normalized))
        if end < len(normalized):
            boundary = normalized.rfind(" ", start, end)
            if boundary > start:
                end = boundary
        chunk = normalized[start:end].strip()
        if chunk:
            chunks.append(chunk)
        if end >= len(normalized):
            break
        start = max(start + 1, end - overlap)
    return chunks


def _embedding_keys() -> list[str]:
    configured_keys = settings.RAG_EMBEDDING_API_KEYS or settings.GEMINI_API_KEYS
    return [key.strip() for key in configured_keys.split(",") if key.strip()]


def _embed_texts(texts: list[str]) -> list[list[float]]:
    if not texts:
        return []
    keys = _embedding_keys()
    if not keys:
        raise RAGError(
            "RAG requires RAG_EMBEDDING_API_KEYS or GEMINI_API_KEYS in the backend environment."
        )

    vectors: list[list[float]] = []
    for batch_start in range(0, len(texts), _EMBEDDING_BATCH_SIZE):
        batch = texts[batch_start : batch_start + _EMBEDDING_BATCH_SIZE]
        batch_vectors: list[list[float]] | None = None
        for key in keys:
            try:
                client = genai.Client(api_key=key)
                response = client.models.embed_content(
                    model=settings.RAG_EMBEDDING_MODEL,
                    contents=batch,
                    config=types.EmbedContentConfig(
                        output_dimensionality=_EMBEDDING_DIMENSIONS,
                    ),
                )
                embeddings = response.embeddings or []
                candidate_vectors = [
                    [float(value) for value in embedding.values or []]
                    for embedding in embeddings
                ]
                if len(candidate_vectors) != len(batch) or any(
                    len(vector) != _EMBEDDING_DIMENSIONS
                    for vector in candidate_vectors
                ):
                    raise ValueError("Embedding provider returned unexpected vectors.")
                batch_vectors = candidate_vectors
                break
            except Exception as exc:
                logger.warning("Embedding provider failed with %s.", type(exc).__name__)
        if batch_vectors is None:
            raise RAGError("All configured embedding API keys failed.")
        vectors.extend(batch_vectors)

    return vectors


def _embed_text(text: str) -> list[float]:
    return _embed_texts([text])[0]


def _language_for_retrieval(language_code: str) -> str:
    normalized = language_code.strip().lower()
    if normalized in {"en", "english"}:
        return "English"
    if normalized in {"ja", "japanese"}:
        return "Japanese"
    return language_code


def _language_for_indexing(language_code: str) -> str:
    normalized = language_code.strip().lower()
    if normalized in {"en", "english"}:
        return "English"
    if normalized in {"ja", "japanese"}:
        return "Japanese"
    if normalized == "all":
        return "all"
    raise ValueError("RAG documents must use English, Japanese, or all.")


def _fetch_rows(
    table: str,
    columns: str,
    order_by: tuple[str, ...],
    document_key_prefix: str | None = None,
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    offset = 0
    try:
        while True:
            query = supabase_admin.table(table).select(columns)
            if document_key_prefix is not None:
                query = query.like("document_key", f"{document_key_prefix}%")
            for column in order_by:
                query = query.order(column)
            page = query.range(
                offset, offset + _DATABASE_PAGE_SIZE - 1
            ).execute().data
            if not isinstance(page, list):
                raise TypeError(f"Supabase returned invalid rows for {table}.")
            if any(not isinstance(row, Mapping) for row in page):
                raise TypeError(f"Supabase returned invalid rows for {table}.")
            rows.extend(dict(row) for row in page) # type: ignore
            if len(page) < _DATABASE_PAGE_SIZE:
                return rows
            offset += _DATABASE_PAGE_SIZE
    except Exception as exc:
        logger.exception("Could not read RAG source table %s.", table)
        raise RAGError("Could not load learning material for the vector store.") from exc


def _word_description(word: Mapping[str, Any]) -> str:
    parts = [
        f"Word: {word.get('word') or ''}",
        f"Meaning: {word.get('meaning') or ''}",
    ]
    for label, key in (
        ("Part of speech", "part_of_speech"),
        ("Level", "level"),
        ("Pronunciation", "phonetic"),
        ("Example", "example_sentence"),
        ("Example meaning", "example_meaning"),
    ):
        value = word.get(key)
        if value:
            parts.append(f"{label}: {value}")
    return "\n".join(parts)


def _build_learning_documents(
    topics: list[dict[str, Any]],
    topic_word_links: list[dict[str, Any]],
    words: list[dict[str, Any]],
) -> tuple[list[tuple[str, str, str, str]], set[int], set[int], int, int]:
    words_by_id = {word["id"]: word for word in words if word.get("id") is not None}
    topic_words: dict[int, list[dict[str, Any]]] = {}
    for link in topic_word_links:
        topic_id = link.get("topic_id")
        word = words_by_id.get(link.get("word_id"))
        if isinstance(topic_id, int) and word is not None:
            topic_words.setdefault(topic_id, []).append(word)

    documents: list[tuple[str, str, str, str]] = []
    indexed_word_ids: set[int] = set()
    indexed_topic_ids: set[int] = set()
    for topic in topics:
        topic_id = topic.get("id")
        name = topic.get("name")
        if not isinstance(topic_id, int) or not isinstance(name, str) or not name.strip():
            continue
        try:
            language = _language_for_indexing(str(topic.get("language_code", "")))
        except ValueError:
            continue
        if language == "all":
            continue

        content_parts = [f"Learning topic: {name.strip()}"]
        description = topic.get("description")
        if isinstance(description, str) and description.strip():
            content_parts.append(f"Description: {description.strip()}")
        for word in sorted(topic_words.get(topic_id, []), key=lambda item: item["id"]):
            if _language_for_retrieval(str(word.get("language_code", ""))) != language:
                continue
            content_parts.append(_word_description(word))
            if isinstance(word.get("id"), int):
                indexed_word_ids.add(word["id"])
        documents.append(
            (
                name.strip(),
                language,
                "\n\n".join(content_parts),
                f"learning-topic:{topic_id}",
            )
        )
        indexed_topic_ids.add(topic_id)

    for word in words:
        word_id = word.get("id")
        if not isinstance(word_id, int) or word_id in indexed_word_ids:
            continue
        try:
            language = _language_for_indexing(str(word.get("language_code", "")))
        except ValueError:
            continue
        if language == "all":
            continue
        title = str(word.get("word") or "").strip()
        if not title:
            continue
        documents.append(
            (
                title,
                language,
                _word_description(word),
                f"learning-word:{word_id}",
            )
        )
        indexed_word_ids.add(word_id)
    return (
        documents,
        indexed_word_ids,
        indexed_topic_ids,
        max(0, len(topics) - len(indexed_topic_ids)),
        max(0, len(words) - len(indexed_word_ids)),
    )


def _remove_stale_documents(prefix: str, active_keys: set[str]) -> None:
    existing = _fetch_rows(
        "rag_chunks",
        "document_key",
        ("document_key",),
        document_key_prefix=prefix,
    )
    stale_keys = sorted(
        {
            row["document_key"]
            for row in existing
            if isinstance(row.get("document_key"), str)
            and row["document_key"] not in active_keys
        }
    )
    try:
        for offset in range(0, len(stale_keys), _DOCUMENT_DELETE_BATCH_SIZE):
            supabase_admin.table("rag_chunks").delete().in_(
                "document_key",
                stale_keys[offset : offset + _DOCUMENT_DELETE_BATCH_SIZE],
            ).execute()
    except Exception as exc:
        logger.exception("Could not remove stale RAG documents.")
        raise RAGError("Could not synchronize learning material in the vector store.") from exc


def reindex_learning_material() -> dict[str, int]:
    topics = _fetch_rows(
        "topics",
        "id,language_code,name,description",
        ("id",),
    )
    topic_word_links = _fetch_rows(
        "word_topics",
        "topic_id,word_id",
        ("topic_id", "word_id"),
    )
    words = _fetch_rows(
        "words",
        "id,language_code,word,phonetic,meaning,part_of_speech,example_sentence,example_meaning,level",
        ("id",),
    )
    (
        documents,
        indexed_word_ids,
        indexed_topic_ids,
        unsupported_topics,
        unsupported_words,
    ) = _build_learning_documents(topics, topic_word_links, words)

    chunks_indexed = 0
    active_keys = {prefix: set() for prefix in _MANAGED_DOCUMENT_PREFIXES}
    for title, language, content, document_key in documents:
        chunks_indexed += upsert_document(
            title,
            language,
            content,
            document_key=document_key,
        )
        prefix = next(
            prefix for prefix in _MANAGED_DOCUMENT_PREFIXES if document_key.startswith(prefix)
        )
        active_keys[prefix].add(document_key)

    for prefix in _MANAGED_DOCUMENT_PREFIXES:
        _remove_stale_documents(prefix, active_keys[prefix])

    return {
        "documents_indexed": len(documents),
        "topics_indexed": len(indexed_topic_ids),
        "words_indexed": len(indexed_word_ids),
        "chunks_indexed": chunks_indexed,
        "topics_skipped": unsupported_topics,
        "words_skipped": unsupported_words,
    }


def retrieve_context(query: str, language_code: str) -> list[str]:
    query_vector = _embed_text(query)
    match_count = min(max(settings.RAG_TOP_K, 1), _MAX_MATCH_COUNT)
    try:
        response = supabase_admin.rpc(
            "match_rag_chunks",
            {
                "p_embedding": query_vector,
                "p_language_code": _language_for_retrieval(language_code),
                "p_match_count": match_count,
                "p_similarity_threshold": settings.RAG_SIMILARITY_THRESHOLD,
            },
        ).execute()
        rows = getattr(response, "data", None)
        if not isinstance(rows, list):
            raise TypeError("Vector search returned an invalid response.")
    except Exception as exc:
        logger.exception("RAG vector search failed.")
        raise RAGError("Could not retrieve learning material from the vector store.") from exc

    results: list[str] = []
    for row in rows:
        if not isinstance(row, Mapping):
            continue
        title_value = row.get("title")
        content_value = row.get("content")
        title = title_value if isinstance(title_value, str) else ""
        content = content_value if isinstance(content_value, str) else ""
        if content:
            results.append(f"Source: {title}\n{content}" if title else content)
    return results


def upsert_document(
    title: str,
    language_code: str,
    content: str,
    document_key: str | None = None,
) -> int:
    chunks = split_text_into_chunks(content)
    if not chunks:
        raise ValueError("Document content must contain non-whitespace text.")

    normalized_language = _language_for_indexing(language_code)
    if document_key is None:
        document_digest = hashlib.sha256(title.casefold().encode("utf-8")).hexdigest()
        document_key = f"{normalized_language}:{document_digest}"
    embeddings = _embed_texts(chunks)
    indexed_chunks: list[dict[str, Any]] = []
    for index, (chunk, embedding) in enumerate(zip(chunks, embeddings, strict=True)):
        indexed_chunks.append(
            {
                "chunk_index": index,
                "content": chunk,
                "embedding": embedding,
            }
        )

    try:
        supabase_admin.rpc(
            "replace_rag_document",
            {
                "p_document_key": document_key,
                "p_title": title,
                "p_language_code": normalized_language,
                "p_chunks": indexed_chunks,
            },
        ).execute()
    except Exception as exc:
        logger.exception("RAG document indexing failed.")
        raise RAGError("Could not store learning material in the vector store.") from exc
    return len(indexed_chunks)


def list_documents() -> list[dict[str, Any]]:
    """Return one summary row for each indexed RAG document."""
    rows = _fetch_rows(
        "rag_chunks",
        "document_key,title,language_code,content,chunk_index,created_at",
        ("document_key", "chunk_index"),
    )
    documents: dict[str, dict[str, Any]] = {}
    for row in rows:
        key = row.get("document_key")
        if not isinstance(key, str) or not key:
            continue
        document = documents.setdefault(
            key,
            {
                "document_key": key,
                "title": str(row.get("title") or ""),
                "language_code": str(row.get("language_code") or ""),
                "content": "",
                "chunks_count": 0,
                "created_at": row.get("created_at"),
            },
        )
        document["content"] += (
            f"{' ' if document['content'] else ''}{str(row.get('content') or '')}"
        )
        document["chunks_count"] += 1
    return list(documents.values())


def delete_document(document_key: str) -> None:
    """Delete an indexed RAG document by its stable document key."""
    if not document_key.strip():
        raise ValueError("Document key must not be empty.")
    try:
        result = (
            supabase_admin.table("rag_chunks")
            .delete()
            .eq("document_key", document_key)
            .select("document_key")
            .execute()
        )
    except Exception as exc:
        logger.exception("Could not delete RAG document.")
        raise RAGError("Could not delete the document from the vector store.") from exc
    if not result.data:
        raise KeyError(document_key)
