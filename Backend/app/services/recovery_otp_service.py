"""OTP khôi phục mật khẩu 8 số, tự sinh và tự gửi email qua Resend.

Supabase chỉ gửi mã 6 số (không đổi được độ dài), nên flow "Quên mật khẩu"
dùng mã riêng của app: sinh 8 số, lưu in-memory (đơn worker), hết hạn 10 phút,
tối đa 5 lần đoán, chỉ dùng một lần.
"""

import hashlib
import hmac
import logging
import secrets
import time
from typing import Dict, Tuple

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

OTP_TTL_SECONDS = 600
MAX_ATTEMPTS = 5

# email đã lowercase -> (hash mã OTP, hết hạn, số lần đoán sai)
_codes: Dict[str, Tuple[str, float, int]] = {}


def _hash(email: str, code: str) -> str:
    return hmac.new(email.encode(), code.encode(), hashlib.sha256).hexdigest()


def create(email: str) -> str:
    _cleanup()
    code = str(secrets.randbelow(90_000_000) + 10_000_000)
    _codes[email.strip().lower()] = (
        _hash(email.strip().lower(), code),
        time.monotonic() + OTP_TTL_SECONDS,
        0,
    )
    return code


def verify(email: str, code: str) -> bool:
    key = email.strip().lower()
    entry = _codes.get(key)
    if entry is None:
        return False
    stored_hash, expires_at, attempts = entry
    if time.monotonic() > expires_at:
        _codes.pop(key, None)
        return False
    if attempts >= MAX_ATTEMPTS:
        _codes.pop(key, None)
        return False
    if not hmac.compare_digest(stored_hash, _hash(key, code)):
        _codes[key] = (stored_hash, expires_at, attempts + 1)
        return False
    _codes.pop(key, None)
    return True


def _cleanup() -> None:
    now = time.monotonic()
    for key in [k for k, (_, exp, _) in _codes.items() if now > exp]:
        _codes.pop(key, None)


def send_otp_email(to_email: str, code: str) -> None:
    """Gửi email chứa mã 8 số qua Resend. Ném exception nếu Resend báo lỗi."""
    if not settings.RESEND_API_KEY or not settings.RESEND_FROM_EMAIL:
        raise RuntimeError("Thiếu RESEND_API_KEY hoặc RESEND_FROM_EMAIL trong .env")
    httpx.post(
        "https://api.resend.com/emails",
        headers={"Authorization": f"Bearer {settings.RESEND_API_KEY}"},
        json={
            "from": settings.RESEND_FROM_EMAIL,
            "to": [to_email],
            "subject": "Mã OTP khôi phục mật khẩu Slanguage",
            "html": (
                "<h2>Slanguage - Khôi phục mật khẩu</h2>"
                f"<p>Mã OTP của bạn (nhập đủ 8 chữ số):</p>"
                f"<p style=\"font-size:32px;letter-spacing:8px;font-weight:bold;\">{code}</p>"
                "<p>Mã hết hạn sau 10 phút và chỉ dùng một lần. "
                "Nếu bạn không yêu cầu, hãy bỏ qua email này.</p>"
            ),
        },
        timeout=30,
    ).raise_for_status()
