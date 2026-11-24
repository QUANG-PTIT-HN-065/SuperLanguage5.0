"""Upload ảnh đại diện lên Cloudinary bằng REST API có chữ ký (httpx).

Không dùng SDK cloudinary để tránh thêm phụ thuộc; chữ ký SHA1 theo đúng
quy tắc signed upload của Cloudinary: ghép các tham số (trừ file/api_key/
signature) theo thứ tự alphabet, nối api_secret rồi băm SHA1.
"""

import hashlib
import logging
import time

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

AVATAR_MAX_BYTES = 10 * 1024 * 1024  # 10MB
ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png"}
# Crop giữa thành ảnh vuông 256x256 cho nhẹ; bo tròn đã có CSS phía frontend.
_AVATAR_TRANSFORMATION = "c_fill,w_256,h_256"


class CloudinaryNotConfiguredError(Exception):
    """Thiếu thông tin cấu hình Cloudinary trong .env."""


def _signed_params(public_id: str) -> tuple[dict[str, str], str]:
    timestamp = str(int(time.time()))
    params = {
        "folder": settings.CLOUDINARY_AVATAR_FOLDER,
        "overwrite": "true",
        "public_id": public_id,
        "timestamp": timestamp,
    }
    to_sign = "&".join(f"{key}={params[key]}" for key in sorted(params))
    signature = hashlib.sha1(
        (to_sign + settings.CLOUDINARY_API_SECRET).encode("utf-8")
    ).hexdigest()
    return params, signature


def upload_avatar(image_bytes: bytes, user_id: str, content_type: str) -> str:
    """Đẩy ảnh lên Cloudinary, trả về secure_url đã gắn transformation 256x256."""
    if not (
        settings.CLOUDINARY_CLOUD_NAME
        and settings.CLOUDINARY_API_KEY
        and settings.CLOUDINARY_API_SECRET
    ):
        raise CloudinaryNotConfiguredError("Cloudinary chưa được cấu hình trong .env.")

    params, signature = _signed_params(f"avatar_{user_id}")
    extension = "jpg" if content_type == "image/jpeg" else "png"
    url = (
        f"https://api.cloudinary.com/v1_1/{settings.CLOUDINARY_CLOUD_NAME}/image/upload"
    )
    data = {**params, "api_key": settings.CLOUDINARY_API_KEY, "signature": signature}
    files = {"file": (f"avatar_{user_id}.{extension}", image_bytes, content_type)}

    response = httpx.post(url, data=data, files=files, timeout=30.0)
    response.raise_for_status()
    secure_url = response.json()["secure_url"]
    return secure_url.replace("/upload/", f"/upload/{_AVATAR_TRANSFORMATION}/", 1)