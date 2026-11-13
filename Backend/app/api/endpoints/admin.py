import logging
from pathlib import PurePath
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status

from app.core.deps import get_current_admin_profile
from app.schemas.rag import RAGDocumentCreate, RAGDocumentResponse, RAGDocumentSummary
from app.schemas.vocabulary import (
    LearningPathCreate,
    LearningPathUpdate,
    TopicCreate,
    TopicUpdate,
    WordCreate,
)
from app.services.admin import (
    create_admin_topic,
    delete_admin_topic,
    get_admin_overview_stats,
    list_admin_topics_full,
    list_admin_users,
    update_admin_topic,
)
from app.services.learning_path_service import (
    create_learning_path,
    delete_learning_path,
    list_learning_paths,
    update_learning_path,
)
from app.services.vocabulary_service import (
    create_word,
    delete_word as delete_word_record,
    get_admin_word,
    list_admin_languages,
    list_admin_words,
    update_word as update_word_record,
)
from app.services.rag_service import (
    RAGError,
    delete_document,
    list_documents,
    reindex_learning_material,
    upsert_document,
)

router = APIRouter()
logger = logging.getLogger(__name__)
_MAX_UPLOAD_BYTES = 10 * 1024 * 1024


@router.post("/rag/reindex")
def reindex_rag_documents(
    _: Dict[str, Any] = Depends(get_current_admin_profile),
):
    """Đồng bộ chủ đề và từ vựng hiện có vào Supabase Vector DB."""
    try:
        stats = reindex_learning_material()
    except RAGError as exc:
        logger.exception("Could not reindex learning material for RAG.")
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "Không thể đồng bộ tri thức học tập vào Vector DB. Vui lòng thử lại.",
        ) from exc
    message = (
        "Đã đồng bộ chủ đề và từ vựng vào Vector DB."
        if stats["documents_indexed"]
        else "Chưa có chủ đề hoặc từ vựng tiếng Anh/Nhật để lập chỉ mục. Hãy thêm tài liệu học tập hoặc kiểm tra ngôn ngữ dữ liệu."
    )
    return {"status": "success", "message": message, "data": stats}


@router.post(
    "/rag/documents",
    status_code=status.HTTP_201_CREATED,
    response_model=RAGDocumentResponse,
)
def add_rag_document(
    body: RAGDocumentCreate,
    _: Dict[str, Any] = Depends(get_current_admin_profile),
):
    """Thêm tài liệu học tập có nội dung chi tiết vào Vector DB."""
    try:
        chunks_indexed = upsert_document(
            body.title,
            body.language_code,
            body.content,
        )
    except RAGError as exc:
        logger.exception("Could not index an administrator-provided RAG document.")
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "Không thể thêm tài liệu vào Vector DB. Vui lòng thử lại.",
        ) from exc
    return RAGDocumentResponse(
        title=body.title,
        language_code=body.language_code,
        chunks_indexed=chunks_indexed,
    )


@router.post(
    "/rag/documents/upload",
    status_code=status.HTTP_201_CREATED,
    response_model=RAGDocumentResponse,
)
async def upload_rag_document(
    language_code: str = Form(...),
    file: UploadFile = File(...),
    _: Dict[str, Any] = Depends(get_current_admin_profile),
):
    """Đọc file văn bản và lập chỉ mục trực tiếp vào rag_chunks."""
    allowed_extensions = {".txt", ".md", ".csv", ".json", ".jsonl"}
    filename = (file.filename or "").strip()
    extension = PurePath(filename).suffix.lower()
    if extension not in allowed_extensions:
        await file.close()
        raise HTTPException(
            status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            "Chỉ hỗ trợ file .txt, .md, .csv, .json hoặc .jsonl.",
        )

    try:
        file_bytes = await file.read(_MAX_UPLOAD_BYTES + 1)
    finally:
        await file.close()

    if not file_bytes:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "File đang trống.")
    if len(file_bytes) > _MAX_UPLOAD_BYTES:
        raise HTTPException(
            status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            "Nội dung file không được vượt quá 10 MB.",
        )

    try:
        content = file_bytes.decode("utf-8-sig").strip()
    except UnicodeDecodeError as exc:
        raise HTTPException(
            status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            "File phải được mã hóa UTF-8.",
        ) from exc
    if not content:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "File không có nội dung văn bản.")

    title = PurePath(filename).stem[:150] or "Tài liệu tải lên"
    try:
        chunks_indexed = upsert_document(title, language_code, content)
    except ValueError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(exc)) from exc
    except RAGError as exc:
        logger.exception("Could not index an uploaded administrator document.")
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "Không thể lập chỉ mục file vào Vector DB. Vui lòng thử lại.",
        ) from exc

    return RAGDocumentResponse(
        title=title,
        language_code=language_code,
        chunks_indexed=chunks_indexed,
    )


@router.get("/rag/documents", response_model=list[RAGDocumentSummary])
def get_rag_documents(
    _: Dict[str, Any] = Depends(get_current_admin_profile),
):
    """Liệt kê các tài liệu đang được lập chỉ mục trong Vector DB."""
    try:
        return list_documents()
    except RAGError as exc:
        logger.exception("Could not list administrator-provided RAG documents.")
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "Không thể tải danh sách tài liệu. Vui lòng thử lại.",
        ) from exc


@router.delete("/rag/documents/{document_key:path}", status_code=status.HTTP_200_OK)
def remove_rag_document(
    document_key: str,
    _: Dict[str, Any] = Depends(get_current_admin_profile),
):
    """Xóa toàn bộ các đoạn của một tài liệu khỏi Vector DB."""
    try:
        delete_document(document_key)
    except KeyError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy tài liệu.") from exc
    except (RAGError, ValueError) as exc:
        logger.exception("Could not delete administrator-provided RAG document.")
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "Không thể xóa tài liệu. Vui lòng thử lại.",
        ) from exc
    return {"status": "success", "deleted_document_key": document_key}


@router.get("/stats")
def get_stats(_: Dict[str, Any] = Depends(get_current_admin_profile)):
    """Lấy dữ liệu thống kê tổng quan thực tế từ CSDL."""
    return {"status": "success", "data": get_admin_overview_stats()}


@router.get("/users")
def get_users(
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    _: Dict[str, Any] = Depends(get_current_admin_profile),
):
    """Danh sách học viên và người dùng kèm số liệu học tập thực tế."""
    return list_admin_users(limit, offset)


# ==================== TOPICS MANAGEMENT ====================

@router.get("/topics")
def get_topics(
    language_code: Optional[str] = Query(default=None),
    _: Dict[str, Any] = Depends(get_current_admin_profile),
):
    """Lấy danh sách các chủ đề (kèm đếm số từ vựng thật trong từng chủ đề)."""
    return {"items": list_admin_topics_full(language_code)}


@router.post("/topics", status_code=status.HTTP_201_CREATED)
def add_topic(
    body: TopicCreate,
    _: Dict[str, Any] = Depends(get_current_admin_profile),
):
    """Admin tạo một chủ đề mới trong CSDL."""
    topic = create_admin_topic(body.model_dump(mode="json"))
    return {"status": "success", "topic": topic}


@router.put("/topics/{topic_id}", status_code=status.HTTP_200_OK)
def update_topic(
    topic_id: int,
    body: TopicUpdate,
    _: Dict[str, Any] = Depends(get_current_admin_profile),
):
    """Admin cập nhật thông tin chủ đề theo ID."""
    topic = update_admin_topic(topic_id, body.model_dump(mode="json", exclude_unset=True))
    return {"status": "success", "topic": topic}


@router.delete("/topics/{topic_id}", status_code=status.HTTP_200_OK)
def delete_topic(
    topic_id: int,
    _: Dict[str, Any] = Depends(get_current_admin_profile),
):
    """Admin xóa một chủ đề theo ID."""
    delete_admin_topic(topic_id)
    return {"status": "success", "deleted_topic_id": topic_id}


@router.get("/learning-paths")
def get_learning_paths(
    language_code: Optional[str] = Query(default=None),
    _: Dict[str, Any] = Depends(get_current_admin_profile),
):
    if language_code and language_code != "all":
        return {"items": list_learning_paths(language_code)}
    languages = list_admin_languages()
    paths = [
        path
        for language in languages
        for path in list_learning_paths(language["code"])
    ]
    return {"items": paths}


@router.post("/learning-paths", status_code=status.HTTP_201_CREATED)
def add_learning_path(
    body: LearningPathCreate,
    _: Dict[str, Any] = Depends(get_current_admin_profile),
):
    return {"status": "success", "path": create_learning_path(body.model_dump(mode="json"))}


@router.put("/learning-paths/{path_id}")
def edit_learning_path(
    path_id: int,
    body: LearningPathUpdate,
    _: Dict[str, Any] = Depends(get_current_admin_profile),
):
    data = body.model_dump(mode="json", exclude_unset=True)
    return {"status": "success", "path": update_learning_path(path_id, data)}


@router.delete("/learning-paths/{path_id}")
def remove_learning_path(
    path_id: int,
    _: Dict[str, Any] = Depends(get_current_admin_profile),
):
    delete_learning_path(path_id)
    return {"status": "success", "deleted_path_id": path_id}


# ==================== WORDS & LANGUAGES ====================

@router.get("/words")
def get_words(
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    _: Dict[str, Any] = Depends(get_current_admin_profile),
):
    """Danh sách từ vựng dành cho quản trị viên."""
    return list_admin_words(limit, offset)


@router.get("/words/{word_id}")
def get_word(
    word_id: int,
    _: Dict[str, Any] = Depends(get_current_admin_profile),
):
    """Chi tiết từ vựng, bao gồm các chủ đề đang liên kết."""
    return {"status": "success", "word": get_admin_word(word_id)}


@router.get("/languages")
def get_languages(_: Dict[str, Any] = Depends(get_current_admin_profile)):
    return {"items": list_admin_languages()}


@router.post("/words", status_code=status.HTTP_201_CREATED)
def add_word(
    body: WordCreate,
    _: Dict[str, Any] = Depends(get_current_admin_profile),
):
    """Admin tạo một từ vựng mới và gắn từ đó với các chủ đề cùng ngôn ngữ."""
    return {"status": "success", "word": create_word(body.model_dump(mode="json"))}


@router.delete("/words/{word_id}", status_code=status.HTTP_200_OK)
def delete_word(
    word_id: int,
    _: Dict[str, Any] = Depends(get_current_admin_profile),
):
    """Admin xóa một từ vựng theo ID."""
    delete_word_record(word_id)
    return {"status": "success", "deleted_word_id": word_id}


@router.put("/words/{word_id}", status_code=status.HTTP_200_OK)
def update_word(
    word_id: int,
    body: WordCreate,
    _: Dict[str, Any] = Depends(get_current_admin_profile),
):
    """Admin cập nhật thông tin một từ vựng theo ID."""
    word = update_word_record(word_id, body.model_dump(mode="json"))
    return {"status": "success", "word": word}
