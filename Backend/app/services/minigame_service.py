import random
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from app.db.supabase import supabase_admin


def _language_name(language_code: str) -> str:
    return {"en": "English", "ja": "Japanese"}.get(language_code, language_code)


def _level_rank(level: Any) -> int:
    return {
        "A1": 1,
        "A2": 2,
        "B1": 3,
        "B2": 4,
        "C1": 5,
        "C2": 6,
        "N5": 1,
        "N4": 2,
        "N3": 3,
        "N2": 4,
        "N1": 5,
    }.get(str(level), 99)


def get_minigame_state(
    profile: Dict[str, Any],
    card_count: int = 60,
    language: Optional[str] = None,
) -> Dict[str, Any]:
    """Load procedural game material from the current user's learning data."""
    language_code = str(language or profile.get("target_language") or "en").lower()
    level = str(profile.get("current_level") or "")
    words_query = (
        supabase_admin.table("words")
        .select(
            "id,word,phonetic,meaning,part_of_speech,example_sentence,"
            "example_meaning,level"
        )
        .eq("language_code", language_code)
    )
    raw_words = words_query.limit(500).execute().data or []
    words = raw_words
    if level and raw_words:
        ranked = [
            row for row in raw_words
            if _level_rank(row.get("level")) <= _level_rank(level)
        ]
        if ranked:
            words = ranked
    if not words:
        raise ValueError(f"Chưa có từ vựng phù hợp cho ngôn ngữ '{language_code}' trong cơ sở dữ liệu.")

    word_ids = [row["id"] for row in words if row.get("id") is not None]
    progress_rows = (
        supabase_admin.table("user_words")
        .select("word_id,mastery_level,next_review_at")
        .eq("user_id", str(profile["id"]))
        .in_("word_id", word_ids)
        .execute()
        .data
        or []
    )
    progress = {row["word_id"]: row for row in progress_rows}

    links = (
        supabase_admin.table("word_topics")
        .select("word_id,topic_id")
        .in_("word_id", word_ids)
        .execute()
        .data
        or []
    )
    topic_ids = list({row["topic_id"] for row in links if row.get("topic_id") is not None})
    topics = (
        supabase_admin.table("topics")
        .select("id,name")
        .in_("id", topic_ids)
        .execute()
        .data
        or []
    ) if topic_ids else []
    topic_names = {row["id"]: row.get("name") or "General" for row in topics}
    word_topics: Dict[Any, list[str]] = {}
    for row in links:
        word_topics.setdefault(row["word_id"], []).append(
            topic_names.get(row["topic_id"], "General")
        )

    now = datetime.now(timezone.utc)
    cards = []
    for row in words:
        state = progress.get(row["id"], {})
        next_review = state.get("next_review_at")
        due = True
        if isinstance(next_review, str):
            try:
                due = datetime.fromisoformat(next_review.replace("Z", "+00:00")) <= now
            except ValueError:
                due = True
        cards.append(
            {
                "id": str(row["id"]),
                "word": row.get("word") or "",
                "forms": [row.get("word") or ""],
                "meaning": row.get("meaning") or "",
                "pos": row.get("part_of_speech") or "noun",
                "topic": ", ".join(word_topics.get(row["id"], [])) or "General",
                "level": row.get("level") or level or "A1",
                "srs": int(state.get("mastery_level") or 0),
                "due": due,
                "phonetic": row.get("phonetic"),
                "example": row.get("example_sentence"),
                "exampleMeaning": row.get("example_meaning"),
            }
        )

    due_cards = [card for card in cards if card["due"]]
    random.shuffle(due_cards)
    random.shuffle(cards)
    selected_cards = []
    seen_ids = set()
    for card in due_cards + cards:
        if card["id"] in seen_ids:
            continue
        selected_cards.append(card)
        seen_ids.add(card["id"])
        if len(selected_cards) >= card_count:
            break

    rag_rows = (
        supabase_admin.table("rag_chunks")
        .select("document_key,title,content,language_code")
        .in_("language_code", ["all", _language_name(language_code)])
        .limit(100)
        .execute()
        .data
        or []
    )
    rules = [
        {
            "id": row.get("document_key") or f"rag-{index}",
            "category": "RAG • Tri thức học tập",
            "title": row.get("title") or "Quy tắc ngữ pháp",
            "desc": row.get("content") or "",
            "tip": "",
        }
        for index, row in enumerate(rag_rows)
        if row.get("content")
    ]

    plan_id = profile.get("plan_id") or "free"
    is_premium = plan_id == "premium"
    return {
        "language": language_code,
        "level": level,
        "cards": selected_cards,
        "rules": rules,
        "plan_id": plan_id,
        "max_hearts": 99 if is_premium else 5,
        "is_unlimited_hearts": is_premium,
    }
