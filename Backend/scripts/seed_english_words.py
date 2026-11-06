"""Seed 160 beginner English words across five topics.

Run from the Backend directory with the project's environment configured:
    python scripts/seed_english_words.py

The script uses SUPABASE_SECRET_KEY and is safe to rerun: existing words,
topics, and word-topic links are reused.
"""

import sys
from pathlib import Path
from typing import Dict, Iterable, List, Tuple

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.db.supabase import supabase_admin  # noqa: E402

LANGUAGE_CODE = "en"
WORDS_PER_BATCH = 100

TOPICS: Tuple[Tuple[str, str, int, Tuple[Tuple[str, str, str, str], ...]], ...] = (
    (
        "Everyday Basics",
        "Từ vựng cơ bản dùng trong giao tiếp hằng ngày.",
        10,
        (
            ("hello", "xin chào", "other", "A1"),
            ("goodbye", "tạm biệt", "other", "A1"),
            ("please", "làm ơn", "other", "A1"),
            ("thank", "cảm ơn", "verb", "A1"),
            ("sorry", "xin lỗi", "adjective", "A1"),
            ("yes", "vâng, có", "other", "A1"),
            ("no", "không", "other", "A1"),
            ("name", "tên", "noun", "A1"),
            ("friend", "bạn bè", "noun", "A1"),
            ("family", "gia đình", "noun", "A1"),
            ("person", "người", "noun", "A1"),
            ("man", "đàn ông", "noun", "A1"),
            ("woman", "phụ nữ", "noun", "A1"),
            ("child", "trẻ em", "noun", "A1"),
            ("day", "ngày", "noun", "A1"),
            ("week", "tuần", "noun", "A1"),
            ("today", "hôm nay", "noun", "A1"),
            ("tomorrow", "ngày mai", "noun", "A1"),
            ("yesterday", "hôm qua", "noun", "A1"),
            ("morning", "buổi sáng", "noun", "A1"),
            ("evening", "buổi tối", "noun", "A1"),
            ("time", "thời gian", "noun", "A1"),
            ("help", "giúp đỡ", "verb", "A1"),
            ("need", "cần", "verb", "A1"),
            ("want", "muốn", "verb", "A1"),
            ("like", "thích", "verb", "A1"),
            ("know", "biết", "verb", "A1"),
            ("understand", "hiểu", "verb", "A1"),
            ("speak", "nói", "verb", "A1"),
            ("listen", "nghe", "verb", "A1"),
            ("good", "tốt", "adjective", "A1"),
            ("happy", "vui vẻ", "adjective", "A1"),
        ),
    ),
    (
        "Food and Drink",
        "Tên món ăn, đồ uống và hoạt động ăn uống.",
        20,
        (
            ("food", "thức ăn", "noun", "A1"),
            ("water", "nước", "noun", "A1"),
            ("coffee", "cà phê", "noun", "A1"),
            ("tea", "trà", "noun", "A1"),
            ("milk", "sữa", "noun", "A1"),
            ("bread", "bánh mì", "noun", "A1"),
            ("rice", "cơm, gạo", "noun", "A1"),
            ("egg", "trứng", "noun", "A1"),
            ("cheese", "phô mai", "noun", "A1"),
            ("meat", "thịt", "noun", "A1"),
            ("chicken", "thịt gà, con gà", "noun", "A1"),
            ("fish", "cá", "noun", "A1"),
            ("fruit", "trái cây", "noun", "A1"),
            ("apple", "quả táo", "noun", "A1"),
            ("banana", "quả chuối", "noun", "A1"),
            ("orange", "quả cam", "noun", "A1"),
            ("vegetable", "rau củ", "noun", "A1"),
            ("potato", "khoai tây", "noun", "A1"),
            ("tomato", "quả cà chua", "noun", "A1"),
            ("sugar", "đường", "noun", "A1"),
            ("salt", "muối", "noun", "A1"),
            ("breakfast", "bữa sáng", "noun", "A1"),
            ("lunch", "bữa trưa", "noun", "A1"),
            ("dinner", "bữa tối", "noun", "A1"),
            ("meal", "bữa ăn", "noun", "A1"),
            ("restaurant", "nhà hàng", "noun", "A1"),
            ("menu", "thực đơn", "noun", "A1"),
            ("order", "gọi món, đơn hàng", "verb", "A1"),
            ("cook", "nấu ăn", "verb", "A1"),
            ("eat", "ăn", "verb", "A1"),
            ("drink", "uống", "verb", "A1"),
            ("hungry", "đói", "adjective", "A1"),
        ),
    ),
    (
        "Travel",
        "Từ vựng hữu ích khi đi lại và du lịch.",
        30,
        (
            ("travel", "du lịch, đi lại", "verb", "A1"),
            ("trip", "chuyến đi", "noun", "A1"),
            ("airport", "sân bay", "noun", "A1"),
            ("station", "nhà ga", "noun", "A1"),
            ("ticket", "vé", "noun", "A1"),
            ("passport", "hộ chiếu", "noun", "A1"),
            ("hotel", "khách sạn", "noun", "A1"),
            ("room", "phòng", "noun", "A1"),
            ("map", "bản đồ", "noun", "A1"),
            ("street", "đường phố", "noun", "A1"),
            ("city", "thành phố", "noun", "A1"),
            ("country", "đất nước", "noun", "A1"),
            ("bus", "xe buýt", "noun", "A1"),
            ("train", "tàu hỏa", "noun", "A1"),
            ("plane", "máy bay", "noun", "A1"),
            ("taxi", "xe taxi", "noun", "A1"),
            ("car", "ô tô", "noun", "A1"),
            ("bicycle", "xe đạp", "noun", "A1"),
            ("left", "bên trái", "adverb", "A1"),
            ("right", "bên phải", "adverb", "A1"),
            ("straight", "thẳng", "adverb", "A1"),
            ("near", "gần", "adjective", "A1"),
            ("far", "xa", "adjective", "A1"),
            ("here", "ở đây", "adverb", "A1"),
            ("there", "ở đó", "adverb", "A1"),
            ("arrive", "đến nơi", "verb", "A1"),
            ("leave", "rời đi", "verb", "A1"),
            ("stay", "lưu trú, ở lại", "verb", "A1"),
            ("visit", "thăm, tham quan", "verb", "A1"),
            ("carry", "mang, xách", "verb", "A1"),
            ("luggage", "hành lý", "noun", "A1"),
            ("guide", "hướng dẫn viên, hướng dẫn", "noun", "A1"),
        ),
    ),
    (
        "Home",
        "Đồ vật, phòng và hoạt động trong nhà.",
        40,
        (
            ("home", "nhà, tổ ấm", "noun", "A1"),
            ("house", "ngôi nhà", "noun", "A1"),
            ("apartment", "căn hộ", "noun", "A1"),
            ("door", "cửa ra vào", "noun", "A1"),
            ("window", "cửa sổ", "noun", "A1"),
            ("wall", "bức tường", "noun", "A1"),
            ("floor", "sàn nhà, tầng", "noun", "A1"),
            ("roof", "mái nhà", "noun", "A1"),
            ("kitchen", "nhà bếp", "noun", "A1"),
            ("bathroom", "phòng tắm", "noun", "A1"),
            ("bedroom", "phòng ngủ", "noun", "A1"),
            ("living room", "phòng khách", "phrase", "A1"),
            ("table", "cái bàn", "noun", "A1"),
            ("chair", "cái ghế", "noun", "A1"),
            ("bed", "cái giường", "noun", "A1"),
            ("desk", "bàn làm việc", "noun", "A1"),
            ("lamp", "đèn bàn", "noun", "A1"),
            ("light", "ánh sáng, đèn", "noun", "A1"),
            ("key", "chìa khóa", "noun", "A1"),
            ("phone", "điện thoại", "noun", "A1"),
            ("computer", "máy tính", "noun", "A1"),
            ("television", "tivi", "noun", "A1"),
            ("book", "quyển sách", "noun", "A1"),
            ("bag", "cái túi", "noun", "A1"),
            ("clothes", "quần áo", "noun", "A1"),
            ("clean", "dọn dẹp, sạch", "verb", "A1"),
            ("wash", "rửa, giặt", "verb", "A1"),
            ("open", "mở", "verb", "A1"),
            ("close", "đóng", "verb", "A1"),
            ("live", "sống", "verb", "A1"),
            ("small", "nhỏ", "adjective", "A1"),
            ("comfortable", "thoải mái", "adjective", "A1"),
        ),
    ),
    (
        "Study and Work",
        "Từ vựng cơ bản về học tập và công việc.",
        50,
        (
            ("school", "trường học", "noun", "A1"),
            ("student", "học sinh, sinh viên", "noun", "A1"),
            ("teacher", "giáo viên", "noun", "A1"),
            ("class", "lớp học", "noun", "A1"),
            ("lesson", "bài học", "noun", "A1"),
            ("question", "câu hỏi", "noun", "A1"),
            ("answer", "câu trả lời", "noun", "A1"),
            ("language", "ngôn ngữ", "noun", "A1"),
            ("English", "tiếng Anh", "noun", "A1"),
            ("word", "từ", "noun", "A1"),
            ("sentence", "câu", "noun", "A1"),
            ("paper", "giấy", "noun", "A1"),
            ("pen", "bút mực", "noun", "A1"),
            ("pencil", "bút chì", "noun", "A1"),
            ("practice", "luyện tập", "verb", "A1"),
            ("learn", "học", "verb", "A1"),
            ("read", "đọc", "verb", "A1"),
            ("write", "viết", "verb", "A1"),
            ("work", "làm việc, công việc", "verb", "A1"),
            ("office", "văn phòng", "noun", "A1"),
            ("job", "công việc", "noun", "A1"),
            ("company", "công ty", "noun", "A1"),
            ("meeting", "cuộc họp", "noun", "A1"),
            ("email", "thư điện tử", "noun", "A1"),
            ("project", "dự án", "noun", "A1"),
            ("manager", "quản lý", "noun", "A2"),
            ("colleague", "đồng nghiệp", "noun", "A2"),
            ("busy", "bận rộn", "adjective", "A1"),
            ("easy", "dễ", "adjective", "A1"),
            ("difficult", "khó", "adjective", "A1"),
            ("important", "quan trọng", "adjective", "A1"),
            ("finish", "hoàn thành", "verb", "A1"),
        ),
    ),
)


def _chunks(items: List[dict], size: int) -> Iterable[List[dict]]:
    for start in range(0, len(items), size):
        yield items[start : start + size]


def _topic_id(name: str, description: str, sort_order: int) -> int:
    result = (
        supabase_admin.table("topics")
        .select("id")
        .eq("language_code", LANGUAGE_CODE)
        .eq("name", name)
        .order("id")
        .limit(1)
        .execute()
    )
    if result.data:
        return int(result.data[0]["id"]) # type: ignore

    inserted = (
        supabase_admin.table("topics")
        .insert(
            {
                "language_code": LANGUAGE_CODE,
                "name": name,
                "description": description,
                "sort_order": sort_order,
            }
        )
        .execute()
    )
    if not inserted.data:
        raise RuntimeError(f"Không tạo được chủ đề {name!r}.")
    return int(inserted.data[0]["id"]) # type: ignore


def main() -> None:
    entries = [
        (topic_name, word, meaning, part_of_speech, level)
        for topic_name, _, _, words in TOPICS
        for word, meaning, part_of_speech, level in words
    ]
    if len(entries) != 160:
        raise RuntimeError(f"Seed phải có đúng 160 từ, hiện có {len(entries)}.")

    topic_ids = {
        name: _topic_id(name, description, sort_order)
        for name, description, sort_order, _ in TOPICS
    }

    existing_words: Dict[str, int] = {}
    existing_response = (
        supabase_admin.table("words")
        .select("id,word", count="exact") # type: ignore
        .eq("language_code", LANGUAGE_CODE)
        .order("id")
        .range(0, 499)
        .execute()
    )
    existing_words.update(
        {row["word"].strip().casefold(): int(row["id"]) for row in existing_response.data} # type: ignore
    )
    total_existing = int(existing_response.count or 0)
    for start in range(500, total_existing, 500):
        page = (
            supabase_admin.table("words")
            .select("id,word")
            .eq("language_code", LANGUAGE_CODE)
            .order("id")
            .range(start, min(start + 499, total_existing - 1))
            .execute()
        )
        existing_words.update(
            {row["word"].strip().casefold(): int(row["id"]) for row in page.data} # type: ignore
        )

    pending_words: Dict[str, dict] = {}
    for _, word, meaning, part_of_speech, level in entries:
        normalized = word.casefold()
        if normalized in existing_words:
            continue
        pending_words[normalized] = {
            "language_code": LANGUAGE_CODE,
            "word": word,
            "meaning": meaning,
            "part_of_speech": part_of_speech,
            "level": level,
        }

    inserted_count = 0
    for batch in _chunks(list(pending_words.values()), WORDS_PER_BATCH):
        created = supabase_admin.table("words").insert(batch).execute()
        if len(created.data or []) != len(batch):
            raise RuntimeError("Không ghi được đầy đủ từ vựng trong lô hiện tại.")
        for row in created.data:
            existing_words[row["word"].strip().casefold()] = int(row["id"]) # type: ignore
        inserted_count += len(created.data)

    links = []
    for topic_name, word, _, _, _ in entries:
        links.append(
            {
                "word_id": existing_words[word.casefold()],
                "topic_id": topic_ids[topic_name],
            }
        )

    for batch in _chunks(links, WORDS_PER_BATCH):
        (
            supabase_admin.table("word_topics")
            .upsert(
                batch,
                on_conflict="word_id,topic_id",
                ignore_duplicates=True,
            )
            .execute()
        )

    print(
        f"Seed hoàn tất: {len(entries)} từ trong {len(topic_ids)} chủ đề; "
        f"đã thêm {inserted_count} từ mới và xử lý {len(links)} liên kết chủ đề."
    )


if __name__ == "__main__":
    main()
