"""Kiểm tra server và kết nối DB còn sống không: GET /api/health"""
from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db.session import get_db

router = APIRouter(tags=["Health"])


@router.get("/health")
def health_check(db: Session = Depends(get_db)):
    try:
        db.execute(text("SELECT 1"))
        return {"status": "ok", "database": "connected"}
    except Exception as error:  # noqa: BLE001 - muốn bắt mọi lỗi kết nối để báo ra
        return JSONResponse(
            status_code=503,
            content={"status": "error", "database": "disconnected", "detail": str(error)},
        )
