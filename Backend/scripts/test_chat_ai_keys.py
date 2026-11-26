#!/usr/bin/env python3
"""
Script kiểm tra toàn bộ API Key Chat AI (Gemini, OpenAI, DeepSeek).
Giúp xác định chính xác API key nào bị lỗi 404 (Not Found), 429 (Hết Quota/Rate Limit),
402 (Hết số dư tài khoản), 401/403 (Sai key/Không có quyền), hay 200 (Hoạt động tốt).

Cách chạy:
    python Backend/scripts/test_chat_ai_keys.py
"""

import os
import sys
from pathlib import Path
from typing import Any, Dict, List

# Xác định đường dẫn file .env
SCRIPT_DIR = Path(__file__).resolve().parent
BACKEND_DIR = SCRIPT_DIR.parent
ENV_FILE = BACKEND_DIR / ".env"

if not ENV_FILE.exists():
    print(f"❌ Không tìm thấy file .env tại: {ENV_FILE}")
    sys.exit(1)


def parse_env_file(path: Path) -> Dict[str, str]:
    env_vars: Dict[str, str] = {}
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            if "=" in line:
                k, v = line.split("=", 1)
                env_vars[k.strip()] = v.strip().strip('"').strip("'")
    return env_vars


ENV = parse_env_file(ENV_FILE)


def mask_key(key: str) -> str:
    if not key:
        return "<EMPTY>"
    key = key.strip()
    if len(key) <= 16:
        return key[:4] + "..." + key[-3:]
    return f"{key[:10]}...{key[-6:]}"


def extract_keys(raw: str) -> List[str]:
    return [k.strip() for k in (raw or "").split(",") if k.strip()]


def extract_status_code(exc: Exception) -> int | None:
    code = getattr(exc, "status_code", None)
    if isinstance(code, int):
        return code
    code = getattr(exc, "code", None)
    if isinstance(code, int):
        return code
    err_str = str(exc)
    for s in (404, 401, 402, 403, 429, 500, 502, 503):
        if str(s) in err_str:
            return s
    return None


def test_gemini_key(key: str, model: str) -> tuple[bool, int | None, str]:
    try:
        from google import genai
        client = genai.Client(api_key=key)
        resp = client.models.generate_content(
            model=model,
            contents="Say 'OK'",
        )
        text = resp.text.strip() if resp and resp.text else "OK"
        return True, 200, f"Thành công: '{text[:25]}'"
    except Exception as exc:
        code = extract_status_code(exc)
        msg = str(exc).replace("\n", " ").strip()
        return False, code, msg


def test_openai_compatible_key(key: str, base_url: str | None, model: str) -> tuple[bool, int | None, str]:
    try:
        from openai import OpenAI
        client = OpenAI(api_key=key, base_url=base_url, timeout=12.0)
        resp = client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": "Say 'OK'"}],
            max_tokens=5,
        )
        content = resp.choices[0].message.content or "OK"
        return True, 200, f"Thành công: '{content.strip()[:25]}'"
    except Exception as exc:
        code = extract_status_code(exc)
        msg = str(exc).replace("\n", " ").strip()
        return False, code, msg


def main():
    print("=" * 90)
    print("🔍 KIỂM TRA TÌNH TRẠNG CÁC API KEY TRONG CHAT AI (SuperLanguage 5.0)")
    print(f"📁 Đọc cấu hình từ: {ENV_FILE}")
    print("=" * 90)

    gemini_keys = extract_keys(ENV.get("GEMINI_API_KEYS", ""))
    if not gemini_keys and ENV.get("GEMINI_API_KEY"):
        gemini_keys = [ENV.get("GEMINI_API_KEY", "").strip()]

    openai_keys = extract_keys(ENV.get("OPENAI_API_KEYS", ""))
    deepseek_keys = extract_keys(ENV.get("DEEPSEEK_API_KEYS", ""))

    print(f"📊 Danh sách API Keys phát hiện:")
    print(f"  • Gemini API Keys   : {len(gemini_keys)} keys")
    print(f"  • OpenAI API Keys   : {len(openai_keys)} keys")
    print(f"  • DeepSeek API Keys : {len(deepseek_keys)} keys")
    print("-" * 90)

    results = []

    # 1. TEST GEMINI
    gemini_test_models = ["gemini-2.5-flash", "gemini-3.8-flash"]
    print(f"\n[1/3] Đang kiểm tra {len(gemini_keys)} GEMINI API KEYS...")

    for idx, key in enumerate(gemini_keys, start=1):
        m_key = mask_key(key)
        print(f"\n  🔹 Gemini Slot #{idx} [{m_key}] (Độ dài: {len(key)} ký tự):")
        
        slot_results = []
        for model in gemini_test_models:
            ok, status, detail = test_gemini_key(key, model)
            slot_results.append((model, ok, status, detail))
            
            if ok:
                tag = "✅ [200 OK] Hoạt động tốt"
            elif status == 404:
                tag = "❌ [404 NOT FOUND] Model không khả dụng với key này"
            elif status == 429:
                tag = "⏳ [429 QUOTA EXCEEDED] Hết hạn mức lượt gọi"
            elif status in (401, 403):
                tag = "🚫 [401/403 AUTH] Key không hợp lệ hoặc bị khóa"
            elif status == 503:
                tag = "⚠️ [503 OVERLOAD] Google server đang quá tải tạm thời"
            else:
                tag = f"⚠️ [Status {status}] Lỗi khác"

            print(f"     • Model '{model}': {tag}")
            if not ok:
                short_detail = detail[:140] + "..." if len(detail) > 140 else detail
                print(f"       Chi tiết lỗi: {short_detail}")

        best = next((r for r in slot_results if r[1]), slot_results[0])
        results.append({
            "provider": "Gemini",
            "slot": idx,
            "key": key,
            "masked": m_key,
            "model_tested": best[0],
            "ok": best[1],
            "status": best[2],
            "detail": best[3],
            "all_models": slot_results,
        })

    # 2. TEST OPENAI
    openai_model = ENV.get("OPENAI_CHAT_MODEL", "").strip() or "gpt-4o-mini"
    print(f"\n[2/3] Đang kiểm tra {len(openai_keys)} OPENAI API KEYS (Model: {openai_model})...")

    for idx, key in enumerate(openai_keys, start=1):
        m_key = mask_key(key)
        ok, status, detail = test_openai_compatible_key(key, None, openai_model)
        
        if ok:
            tag = "✅ [200 OK] Hoạt động tốt"
        elif status == 404:
            tag = "❌ [404 NOT FOUND] Không tìm thấy model hoặc endpoint"
        elif status == 429:
            tag = "⏳ [429 QUOTA EXCEEDED] Hết credits/Hạn mức"
        elif status in (401, 403):
            tag = "🚫 [401/403 AUTH] Sai key hoặc chưa cấp quyền"
        else:
            tag = f"⚠️ [Status {status}] Lỗi khác"

        print(f"  Slot #{idx} [{m_key}]: {tag}")
        if not ok:
            short_detail = detail[:140] + "..." if len(detail) > 140 else detail
            print(f"    Chi tiết: {short_detail}")

        results.append({
            "provider": "OpenAI",
            "slot": idx,
            "key": key,
            "masked": m_key,
            "model_tested": openai_model,
            "ok": ok,
            "status": status,
            "detail": detail,
            "all_models": [(openai_model, ok, status, detail)],
        })

    # 3. TEST DEEPSEEK
    deepseek_model = "deepseek-chat"
    print(f"\n[3/3] Đang kiểm tra {len(deepseek_keys)} DEEPSEEK API KEYS (Model: {deepseek_model})...")

    for idx, key in enumerate(deepseek_keys, start=1):
        m_key = mask_key(key)
        ok, status, detail = test_openai_compatible_key(key, "https://api.deepseek.com", deepseek_model)
        
        if ok:
            tag = "✅ [200 OK] Hoạt động tốt"
        elif status == 404:
            tag = "❌ [404 NOT FOUND] Không tìm thấy"
        elif status == 402:
            tag = "💳 [402 PAYMENT REQUIRED] Hết tiền / Insufficient Balance"
        elif status == 429:
            tag = "⏳ [429 QUOTA EXCEEDED] Rate limit"
        elif status in (401, 403):
            tag = "🚫 [401/403 AUTH] Sai key"
        else:
            tag = f"⚠️ [Status {status}] Lỗi khác"

        print(f"  Slot #{idx} [{m_key}]: {tag}")
        if not ok:
            short_detail = detail[:140] + "..." if len(detail) > 140 else detail
            print(f"    Chi tiết: {short_detail}")

        results.append({
            "provider": "DeepSeek",
            "slot": idx,
            "key": key,
            "masked": m_key,
            "model_tested": deepseek_model,
            "ok": ok,
            "status": status,
            "detail": detail,
            "all_models": [(deepseek_model, ok, status, detail)],
        })

    # --- BÁO CÁO TỔNG KẾT ---
    print("\n" + "=" * 90)
    print("📋 BẢNG TỔNG KẾT CHI TIẾT THEO TỪNG NHÓM TRẠNG THÁI")
    print("=" * 90)

    # Lọc các key 404
    keys_404 = [r for r in results if r["status"] == 404 or any(m[2] == 404 for m in r.get("all_models", []))]
    
    print(f"\n🔴 DANH SÁCH API KEY BỊ LỖI 404 NOT FOUND ({len(keys_404)} key):")
    if keys_404:
        for r in keys_404:
            print(f"\n  👉 [{r['provider']}] Slot #{r['slot']} : {r['masked']}")
            for m_name, m_ok, m_code, m_desc in r.get("all_models", []):
                if m_code == 404:
                    print(f"     • Model '{m_name}': 404 NOT FOUND")
                    print(f"       Nguyên nhân: {m_desc}")
    else:
        print("  ✅ Không có key nào bị lỗi 404!")

    # Lọc các key 429 / 402
    keys_quota = [r for r in results if r["status"] in (429, 402) or any(m[2] in (429, 402) for m in r.get("all_models", []))]
    print(f"\n⏳ DANH SÁCH API KEY HẾT QUOTA / HẾT TIỀN (429 / 402) ({len(keys_quota)} key):")
    if keys_quota:
        for r in keys_quota:
            reason = "Hết số dư (402 Insufficient Balance)" if r["status"] == 402 else "Hết quota (429 Resource Exhausted)"
            print(f"  • [{r['provider']}] Slot #{r['slot']} : {r['masked']} -> {reason}")

    # Lọc các key hoạt động
    keys_ok = [r for r in results if r["ok"]]
    print(f"\n✅ DANH SÁCH API KEY ĐANG HOẠT ĐỘNG TỐT ({len(keys_ok)} key):")
    if keys_ok:
        for r in keys_ok:
            print(f"  • [{r['provider']}] Slot #{r['slot']} : {r['masked']} (Model: {r['model_tested']})")
    else:
        print("  ⚠️ Không có key nào hoàn toàn hoạt động bình thường.")

    print("\n" + "=" * 90)


if __name__ == "__main__":
    main()
