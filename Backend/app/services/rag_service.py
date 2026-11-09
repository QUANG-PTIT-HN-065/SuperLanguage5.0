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
_CHUNK_SIZE = 1200
_CHUNK_OVERLAP = 180
_MAX_MATCH_COUNT = 10


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

    for key in keys:
        try:
            client = genai.Client(api_key=key)
            response = client.models.embed_content(
                model=settings.RAG_EMBEDDING_MODEL,
                contents=texts,
                config=types.EmbedContentConfig(
                    output_dimensionality=_EMBEDDING_DIMENSIONS,
                ),
            )
            embeddings = response.embeddings or []
            vectors = [
                [float(value) for value in embedding.values or []]
                for embedding in embeddings
            ]
            if len(vectors) != len(texts) or any(
                len(vector) != _EMBEDDING_DIMENSIONS for vector in vectors
            ):
                raise ValueError("Embedding provider returned unexpected vectors.")
            return vectors
        except Exception as exc:
            logger.warning("Embedding provider failed with %s.", type(exc).__name__)

    raise RAGError("All configured embedding API keys failed.")


def _embed_text(text: str) -> list[float]:
    return _embed_texts([text])[0]


def _language_for_retrieval(language_code: str) -> str:
    normalized = language_code.strip().lower()
    if normalized in {"en", "english"}:
        return "English"
    if normalized in {"ja", "japanese"}:
        return "Japanese"
    return language_code


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
    except Exception as exc:
        logger.exception("RAG vector search failed.")
        raise RAGError("Could not retrieve learning material from the vector store.") from exc

    results: list[str] = []
    rows = response.data if isinstance(response.data, list) else []
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


def upsert_document(title: str, language_code: str, content: str) -> int:
    chunks = split_text_into_chunks(content)
    if not chunks:
        raise ValueError("Document content must contain non-whitespace text.")

    document_digest = hashlib.sha256(title.casefold().encode("utf-8")).hexdigest()
    document_key = f"{language_code}:{document_digest}"
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
                "p_language_code": language_code,
                "p_chunks": indexed_chunks,
            },
        ).execute()
    except Exception as exc:
        logger.exception("RAG document indexing failed.")
        raise RAGError("Could not store learning material in the vector store.") from exc
    return len(indexed_chunks)
