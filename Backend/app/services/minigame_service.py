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
            if _level_rank(row.get("level")) <= _level_rank(level) # type: ignore
        ]
        if ranked:
            words = ranked
    if not words:
        raise ValueError(f"Chưa có từ vựng phù hợp cho ngôn ngữ '{language_code}' trong cơ sở dữ liệu.")

    word_ids = [row["id"] for row in words if row.get("id") is not None] # type: ignore
    progress_rows = (
        supabase_admin.table("user_words")
        .select("word_id,mastery_level,next_review_at")
        .eq("user_id", str(profile["id"]))
        .in_("word_id", word_ids) # type: ignore
        .execute()
        .data
        or []
    )
    progress = {row["word_id"]: row for row in progress_rows} # type: ignore

    links = (
        supabase_admin.table("word_topics")
        .select("word_id,topic_id")
        .in_("word_id", word_ids) # type: ignore
        .execute()
        .data
        or []
    )
    topic_ids = list({row["topic_id"] for row in links if row.get("topic_id") is not None}) # type: ignore
    topics = (
        supabase_admin.table("topics")
        .select("id,name")
        .in_("id", topic_ids) # type: ignore
        .execute()
        .data
        or []
    ) if topic_ids else []
    topic_names = {row["id"]: row.get("name") or "General" for row in topics} # type: ignore
    word_topics: Dict[Any, list[str]] = {}
    for row in links:
        word_topics.setdefault(row["word_id"], []).append( # type: ignore
            topic_names.get(row["topic_id"], "General") # type: ignore
        )

    now = datetime.now(timezone.utc)
    cards = []
    for row in words:
        state = progress.get(row["id"], {}) # type: ignore
        next_review = state.get("next_review_at") # type: ignore
        due = True
        if isinstance(next_review, str):
            try:
                due = datetime.fromisoformat(next_review.replace("Z", "+00:00")) <= now
            except ValueError:
                due = True
        cards.append(
            {
                "id": str(row["id"]), # type: ignore
                "word": row.get("word") or "", # type: ignore
                "forms": [row.get("word") or ""],# type: ignore
                "meaning": row.get("meaning") or "",# type: ignore
                "pos": row.get("part_of_speech") or "noun",# type: ignore
                "topic": ", ".join(word_topics.get(row["id"], [])) or "General",# type: ignore
                "level": row.get("level") or level or "A1",# type: ignore
                "srs": int(state.get("mastery_level") or 0),# type: ignore
                "due": due,
                "phonetic": row.get("phonetic"),# type: ignore
                "example": row.get("example_sentence"),# type: ignore
                "exampleMeaning": row.get("example_meaning"),# type: ignore
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

    plan_id = profile.get("plan_id") or "free"
    is_premium = plan_id == "premium"
    return {
        "language": language_code,
        "level": level,
        "cards": selected_cards,
        # Raw RAG chunks are intentionally not sent to the game client. The
        # dedicated evaluator receives only the selected cards and active rule.
        "rules": [],
        "plan_id": plan_id,
        "max_hearts": 99 if is_premium else 5,
        "is_unlimited_hearts": is_premium,
    }
