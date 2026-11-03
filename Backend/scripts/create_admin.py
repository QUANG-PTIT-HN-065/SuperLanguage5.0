"""
Tạo (hoặc nâng quyền) tài khoản admin trên Supabase.

Chạy từ THƯ MỤC GỐC dự án (nơi có file .env):

    python scripts/create_admin.py --email admin@example.com --name "Admin"

Mật khẩu được hỏi trực tiếp (mặc định ẩn ký tự). Các lựa chọn khác:
    --visible          hiện ký tự khi gõ (dùng nếu thấy "không nhập được")
    --password MATKHAU truyền thẳng mật khẩu (cẩn thận: lưu trong lịch sử lệnh)
    biến môi trường ADMIN_PASSWORD cũng được dùng nếu có
Nếu email đã tồn tại, script chỉ nâng tài khoản đó lên admin và KHÔNG đổi mật khẩu.

Yêu cầu: đã chạy sql/01_schema.sql (có bảng profiles và trigger tạo profile tự động).
Script dùng SUPABASE_SECRET_KEY nên chỉ chạy trên máy của bạn/máy chủ tin cậy.
"""

import argparse
import getpass
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

# Cho phép chạy `python scripts/create_admin.py` mà vẫn import được package `app`
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.db.supabase import supabase_admin  # noqa: E402

MIN_PASSWORD_LENGTH = 8


def ask_password(prompt: str, visible: bool = False) -> str:
    """
    Hỏi mật khẩu. getpass cần một terminal thật; nếu đang chạy trong khung Output
    của VS Code (không có terminal) thì chuyển sang input() và cảnh báo.
    """
    if visible:
        return input(prompt)
    if not sys.stdin.isatty():
        print("(Không phải terminal thật nên mật khẩu sẽ HIỆN khi gõ.)")
        return input(prompt)
    return getpass.getpass(prompt)


def find_profile_by_email(email: str):
    rows = (
        supabase_admin.table("profiles")
        .select("id,email,role")
        .eq("email", email)
        .limit(1)
        .execute()
        .data
    )
    return rows[0] if rows else None


def create_auth_user(email: str, password: str, display_name: str) -> str:
    """Tạo user ở Supabase Auth (đã xác thực email sẵn). Trả về user id."""
    response = supabase_admin.auth.admin.create_user(
        {
            "email": email,
            "password": password,
            "email_confirm": True,
            "user_metadata": {"display_name": display_name},
        }
    )
    if response.user is None:
        raise RuntimeError("Supabase không trả về thông tin user.")
    return response.user.id


def promote_to_admin(user_id: str, display_name: str) -> None:
    now = datetime.now(timezone.utc).isoformat()
    result = (
        supabase_admin.table("profiles")
        .update(
            {
                "role": "admin",
                "status": "active",
                "plan_id": "premium",
                "display_name": display_name,
                "terms_accepted_at": now,
                "onboarding_completed_at": now,
            }
        )
        .eq("id", user_id)
        .execute()
    )
    if not result.data:
        raise RuntimeError(
            "Không tìm thấy dòng trong bảng profiles. "
            "Hãy chắc chắn đã chạy sql/01_schema.sql (trigger on_auth_user_created)."
        )


def main() -> int:
    parser = argparse.ArgumentParser(description="Tạo hoặc nâng quyền tài khoản admin.")
    parser.add_argument("--email", help="Email của admin")
    parser.add_argument("--name", default="Admin", help="Tên hiển thị (mặc định: Admin)")
    parser.add_argument("--password", help="Mật khẩu (nếu bỏ trống sẽ được hỏi)")
    parser.add_argument("--visible", action="store_true", help="Hiện ký tự khi gõ mật khẩu")
    args = parser.parse_args()

    if not args.email:
        args.email = input("Nhập email admin: ")

    email = args.email.strip().lower()
    display_name = args.name.strip()[:50] or "Admin"

    # Trường hợp email đã có tài khoản -> chỉ nâng quyền
    existing = find_profile_by_email(email)
    if existing:
        if existing["role"] == "admin": # type: ignore
            print(f"'{email}' đã là admin, không cần làm gì thêm.")
            return 0
        promote_to_admin(existing["id"], display_name) # type: ignore
        print(f"Đã nâng '{email}' lên admin (giữ nguyên mật khẩu cũ).")
        return 0

    # Tài khoản mới: hỏi mật khẩu
    password = args.password or os.environ.get("ADMIN_PASSWORD")
    if not password:
        password = ask_password("Nhập mật khẩu admin: ", args.visible)
        if password != ask_password("Nhập lại mật khẩu: ", args.visible):
            print("Hai lần nhập mật khẩu không khớp.", file=sys.stderr)
            return 1

    if len(password) < MIN_PASSWORD_LENGTH:
        print(f"Mật khẩu phải có ít nhất {MIN_PASSWORD_LENGTH} ký tự.", file=sys.stderr)
        return 1

    try:
        user_id = create_auth_user(email, password, display_name)
    except Exception as exc:
        print(f"Không tạo được user: {exc}", file=sys.stderr)
        return 1

    try:
        promote_to_admin(user_id, display_name)
    except Exception as exc:
        print(
            f"User đã được tạo (id={user_id}) nhưng chưa nâng quyền admin: {exc}",
            file=sys.stderr,
        )
        return 1

    print(f"Đã tạo admin thành công: {email} (id={user_id})")
    return 0


if __name__ == "__main__":
    sys.exit(main())