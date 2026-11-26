#!/usr/bin/env python3
"""
Script xóa toàn bộ từ vựng (words) và chủ đề (topics) của ngôn ngữ tiếng Anh ('en').

Tự động kết nối trực tiếp đến cơ sở dữ liệu Supabase bằng cấu hình trong `Backend/.env`,
KHÔNG CẦN phải khởi động server backend (localhost:8000) và KHÔNG CẦN token đăng nhập admin.

Cách dùng:
    python Backend/scripts/delete_en_vocab_topics.py
    (hoặc thêm cờ --force để tự động xác nhận)
"""

import os
import sys
from pathlib import Path

# Tìm file .env của Backend
SCRIPT_DIR = Path(__file__).resolve().parent
BACKEND_DIR = SCRIPT_DIR.parent
ENV_FILE = BACKEND_DIR / ".env"

LANGUAGE_CODE = "en"


def parse_env_file(path: Path) -> dict:
    env_vars = {}
    if not path.exists():
        return env_vars
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            if "=" in line:
                k, v = line.split("=", 1)
                env_vars[k.strip()] = v.strip().strip('"').strip("'")
    return env_vars


def delete_via_supabase(force: bool = False):
    env = parse_env_file(ENV_FILE)
    supabase_url = env.get("SUPABASE_URL")
    supabase_key = env.get("SUPABASE_SECRET_KEY")

    if not supabase_url or not supabase_key:
        print(f"❌ Thiếu SUPABASE_URL hoặc SUPABASE_SECRET_KEY trong: {ENV_FILE}")
        sys.exit(1)

    try:
        from supabase import create_client
    except ImportError:
        print("❌ Chưa cài đặt thư viện 'supabase'. Chạy lệnh: pip install supabase")
        sys.exit(1)

    print("=" * 80)
    print(f"🗑️  XÓA TỪ VỰNG VÀ CHỦ ĐỀ TIẾNG ANH (language_code = '{LANGUAGE_CODE}')")
    print(f"🔗 Kết nối Supabase: {supabase_url}")
    print("=" * 80)

    sp = create_client(supabase_url, supabase_key)

    # 1. Kiểm tra số lượng topics tiếng Anh
    topics_res = (
        sp.table("topics")
        .select("id, name", count="exact")
        .eq("language_code", LANGUAGE_CODE)
        .execute()
    )
    topics_count = topics_res.count or len(topics_res.data or [])

    # 2. Kiểm tra số lượng words tiếng Anh
    words_res = (
        sp.table("words")
        .select("id, word", count="exact")
        .eq("language_code", LANGUAGE_CODE)
        .execute()
    )
    words_count = words_res.count or len(words_res.data or [])

    print(f"\n📊 Dữ liệu tìm thấy trên database:")
    print(f"  • Số chủ đề (topics) tiếng Anh     : {topics_count}")
    print(f"  • Số từ vựng (words) tiếng Anh     : {words_count}")

    if topics_count == 0 and words_count == 0:
        print("\n✅ Không có chủ đề hoặc từ vựng tiếng Anh nào trong database để xóa.")
        return

    # Xác nhận trước khi xóa
    if not force:
        print("\n⚠️  CẢNH BÁO: Hành động này sẽ XÓA VĨNH VIỄN toàn bộ từ vựng và chủ đề tiếng Anh!")
        print("   Các liên kết (word_topics, user_words, lessons liên quan) sẽ tự động cascade.")
        confirm = input("\n👉 Bạn có chắc chắn muốn xóa không? (Nhập 'y' hoặc 'yes' để xác nhận): ").strip().lower()
        if confirm not in ("y", "yes"):
            print("❌ Đã hủy thao tác.")
            return

    # Thực hiện xóa từ vựng
    deleted_words = 0
    if words_count > 0:
        print(f"\n⏳ Đang xóa {words_count} từ vựng tiếng Anh...")
        # Xóa theo lô nếu số lượng lớn
        del_words_res = sp.table("words").delete().eq("language_code", LANGUAGE_CODE).execute()
        deleted_words = len(del_words_res.data or [])
        print(f"  ✓ Đã xóa {deleted_words} từ vựng.")

    # Thực hiện xóa chủ đề
    deleted_topics = 0
    if topics_count > 0:
        print(f"\n⏳ Đang xóa {topics_count} chủ đề tiếng Anh...")
        del_topics_res = sp.table("topics").delete().eq("language_code", LANGUAGE_CODE).execute()
        deleted_topics = len(del_topics_res.data or [])
        print(f"  ✓ Đã xóa {deleted_topics} chủ đề.")

    print("\n" + "=" * 80)
    print(f"🎉 HOÀN TẤT: Đã xóa thành công {deleted_words} từ vựng và {deleted_topics} chủ đề tiếng Anh!")
    print("=" * 80)


def main():
    import argparse

    parser = argparse.ArgumentParser(description="Xóa toàn bộ từ vựng và chủ đề tiếng Anh.")
    parser.add_argument("--force", "-f", action="store_true", help="Bỏ qua bước xác nhận (xóa ngay)")
    args = parser.parse_args()

    delete_via_supabase(force=args.force)


if __name__ == "__main__":
    main()
