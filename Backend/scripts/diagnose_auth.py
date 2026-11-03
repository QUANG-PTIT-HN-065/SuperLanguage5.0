"""
Chẩn đoán kết nối tới Supabase Auth (không qua FastAPI).

Chạy từ thư mục Backend:

    python scripts\\diagnose_auth.py
    python scripts\\diagnose_auth.py --signup test123@gmail.com     (thử đăng ký thật)

Lưu ý: --signup sẽ TẠO user thật; xóa nó trong Supabase -> Authentication -> Users sau khi thử.
"""

import argparse
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import httpx  # noqa: E402

from app.core.config import settings  # noqa: E402

HEADERS = {"apikey": settings.SUPABASE_PUBLISHABLE_KEY}
BASE = settings.SUPABASE_URL.rstrip("/") + "/auth/v1"


def step(title: str) -> None:
    print(f"\n=== {title}")


def timed_get(path: str, **client_kwargs):
    t = time.time()
    try:
        with httpx.Client(timeout=30, **client_kwargs) as client:
            r = client.get(BASE + path, headers=HEADERS)
        print(f"  -> HTTP {r.status_code} sau {time.time() - t:.2f}s")
        return r
    except Exception as exc:
        print(f"  -> LỖI sau {time.time() - t:.2f}s: {type(exc).__name__}: {exc!r}")
        return None


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--signup", metavar="EMAIL", help="Thử đăng ký thật bằng email này")
    args = parser.parse_args()

    print("SUPABASE_URL:", settings.SUPABASE_URL)

    step("1. Health check (HTTP/1.1)")
    timed_get("/health")

    step("2. Health check (HTTP/2, giống mặc định của thư viện supabase)")
    try:
        timed_get("/health", http2=True)
    except ImportError:
        print("  (bỏ qua: chưa cài gói h2)")

    step("3. Cấu hình Auth của project")
    r = timed_get("/settings")
    if r is not None and r.status_code == 200:
        data = r.json()
        print("  email đăng nhập bật      :", data.get("external", {}).get("email"))
        print("  tự xác nhận email (autoconfirm):", data.get("mailer_autoconfirm"),
              "  (False = đang BẬT Confirm email, sign_up phải gửi mail)")
        print("  tắt đăng ký mới          :", data.get("disable_signup"))

    if args.signup:
        step(f"4. sign_up thật bằng client của app ({args.signup})")
        from app.db.supabase import new_auth_client

        t = time.time()
        try:
            res = new_auth_client().auth.sign_up(
                {"email": args.signup, "password": "TestMatKhau@12345"}
            )
            print(f"  -> THÀNH CÔNG sau {time.time() - t:.2f}s")
            print("     user id        :", res.user.id if res.user else None)
            print("     identities     :", len(res.user.identities or []) if res.user else None)
            print("     có session     :", res.session is not None)
        except Exception as exc:
            print(f"  -> LỖI sau {time.time() - t:.2f}s")
            print("     loại lỗi :", type(exc).__name__)
            print("     chi tiết :", repr(exc))
            print("     status   :", getattr(exc, "status", None), getattr(exc, "code", None))

    print("\nXong. Gửi toàn bộ nội dung trên cho người đang hỗ trợ bạn.")


if __name__ == "__main__":
    main()