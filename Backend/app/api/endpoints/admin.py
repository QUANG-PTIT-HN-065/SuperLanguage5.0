from typing import Any, Dict

from fastapi import APIRouter, Depends, Query, status

from app.core.deps import get_current_admin_profile
from app.schemas.vocabulary import WordCreate
from app.services.vocabulary_service import (
    create_word,
    delete_word as delete_word_record,
    get_admin_word,
    list_admin_languages,
    list_admin_topics,
    list_admin_words,
    update_word as update_word_record,
)

router = APIRouter()


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


@router.get("/topics")
def get_topics(
    language_code: str = Query(pattern=r"^[a-z]{2,3}$"),
    _: Dict[str, Any] = Depends(get_current_admin_profile),
):
    return {"items": list_admin_topics(language_code)}


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