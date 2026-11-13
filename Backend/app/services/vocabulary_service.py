from datetime import datetime, timezone
from typing import Any, Dict, Optional

from fastapi import HTTPException, status

from app.db.supabase import supabase_admin
from app.services.profile_service import get_plan, raise_db_error

FREE_ACCESS_PERCENT = 50


def is_premium_profile(profile: Dict[str, Any]) -> bool:
    if profile.get("plan_id") != "premium":
        return False
    plan = get_plan("premium")
    if not plan or not plan.get("is_active"):
        return False

    expiry = profile.get("plan_expires_at")
    if expiry is None:
        return True

    if isinstance(expiry, datetime):
        expires_at = expiry
    else:
        expires_at = datetime.fromisoformat(str(expiry).replace("Z", "+00:00"))
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    return expires_at > datetime.now(timezone.utc)


def _count_rows(query: Any) -> int:
    response = query.limit(1).execute()
    return int(response.count or 0)


def _access_count(total: int, is_premium: bool) -> int:
    if is_premium:
        return total
    return (total * FREE_ACCESS_PERCENT + 99) // 100


def list_topics(
    profile: Dict[str, Any], limit: int, offset: int
) -> Dict[str, Any]:
    language_code = profile["target_language"]
    is_premium = is_premium_profile(profile)
    count_query = (
        supabase_admin.table("topics")
        .select("id", count="exact") # type: ignore
        .eq("language_code", language_code)
    )
    total = _count_rows(count_query)
    available = _access_count(total, is_premium)
    topic_floor = None if is_premium else _free_topic_floor(language_code)
    if not is_premium and topic_floor is None:
        available = 0
    end = min(offset + limit, available)

    topics: list[Dict[str, Any]] = []
    if offset < end:
        query = (
            supabase_admin.table("topics")
            .select("id,language_code,name,description,icon_url,sort_order")
            .eq("language_code", language_code)
        )
        if topic_floor is not None:
            query = query.gte("id", topic_floor)
        topics = query.order("id").range(offset, end - 1).execute().data

    if topics and profile.get("id"):
        topic_ids = [topic["id"] for topic in topics]
        word_links = (
            supabase_admin.table("word_topics")
            .select("topic_id,word_id")
            .in_("topic_id", topic_ids)
            .execute()
            .data
            or []
        )
        words_by_topic: Dict[int, set[int]] = {}
        all_word_ids: set[int] = set()
        for link in word_links:
            words_by_topic.setdefault(link["topic_id"], set()).add(link["word_id"])
            all_word_ids.add(link["word_id"])

        mastered_word_ids: set[int] = set()
        if all_word_ids:
            mastered_rows = (
                supabase_admin.table("user_words")
                .select("word_id")
                .eq("user_id", profile["id"])
                .eq("mastery_level", 5)
                .in_("word_id", list(all_word_ids))
                .execute()
                .data
                or []
            )
            mastered_word_ids = {row["word_id"] for row in mastered_rows}

        for topic in topics:
            topic_word_ids = words_by_topic.get(topic["id"], set())
            mastered_count = len(topic_word_ids & mastered_word_ids)
            word_count = len(topic_word_ids)
            topic["word_count"] = word_count
            topic["mastered_word_count"] = mastered_count
            topic["progress_percent"] = (
                round(mastered_count * 100 / word_count) if word_count else 0
            )

    return {
        "items": topics,
        "total": total,
        "available": available,
        "limit": limit,
        "offset": offset,
        "plan": "premium" if is_premium else "free",
    }


def _get_topic(topic_id: int, language_code: str) -> Dict[str, Any]:
    rows = (
        supabase_admin.table("topics")
        .select("id,language_code,name,description,icon_url,sort_order")
        .eq("id", topic_id)
        .eq("language_code", language_code)
        .limit(1)
        .execute()
        .data
    )
    if not rows:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy chủ đề.")
    return rows[0] # type: ignore


def _free_topic_floor(language_code: str) -> Optional[int]:
    query = (
        supabase_admin.table("topics")
        .select("id", count="exact") # type: ignore
        .eq("language_code", language_code)
    )
    total = _count_rows(query)
    visible_count = _access_count(total, False)
    if not visible_count:
        return None
    rows = (
        supabase_admin.table("topics")
        .select("id")
        .eq("language_code", language_code)
        .order("id", desc=True)
        .range(visible_count - 1, visible_count - 1)
        .execute()
        .data
    )
    return int(rows[0]["id"]) if rows else None # type: ignore


def _free_word_floor(language_code: str) -> tuple[int, int]:
    query = (
        supabase_admin.table("words")
        .select("id", count="exact") # type: ignore
        .eq("language_code", language_code)
    )
    total = _count_rows(query)
    visible_count = _access_count(total, False)
    if not visible_count:
        return total, 0
    rows = (
        supabase_admin.table("words")
        .select("id")
        .eq("language_code", language_code)
        .order("id", desc=True)
        .range(visible_count - 1, visible_count - 1)
        .execute()
        .data
    )
    return total, int(rows[0]["id"]) if rows else 0 # type: ignore


def list_words(
    profile: Dict[str, Any],
    limit: int,
    offset: int,
    topic_id: Optional[int] = None,
    search_term: Optional[str] = None,
) -> Dict[str, Any]:
    language_code = profile["target_language"]
    is_premium = is_premium_profile(profile)
    topic = None

    if topic_id is not None:
        topic = _get_topic(topic_id, language_code)
        if not is_premium:
            topic_floor = _free_topic_floor(language_code)
            if topic_floor is None or topic_id < topic_floor:
                raise HTTPException(
                    status.HTTP_403_FORBIDDEN,
                    "Chủ đề này chỉ dành cho tài khoản Premium.",
                )

    total_words, free_word_floor = _free_word_floor(language_code)
    matching_word_ids = None
    if search_term:
        pattern = f"%{search_term.strip()}%"
        word_matches = (
            supabase_admin.table("words")
            .select("id")
            .eq("language_code", language_code)
            .ilike("word", pattern)
            .execute()
            .data
            or []
        )
        meaning_matches = (
            supabase_admin.table("words")
            .select("id")
            .eq("language_code", language_code)
            .ilike("meaning", pattern)
            .execute()
            .data
            or []
        )
        matching_word_ids = list({
            row["id"] for row in [*word_matches, *meaning_matches]
        })
        if not matching_word_ids:
            return {
                "items": [],
                "total": 0,
                "available": 0,
                "limit": limit,
                "offset": offset,
                "plan": "premium" if is_premium else "free",
                "topic": topic,
            }
    fields = (
        "id,language_code,word,phonetic,meaning,part_of_speech,audio_url,"
        "example_sentence,example_meaning,level,created_at"
    )
    if topic_id is None:
        count_query: Any = (
            supabase_admin.table("words")
            .select("id", count="exact") # type: ignore
            .eq("language_code", language_code)
        )
        if matching_word_ids is not None:
            count_query = count_query.in_("id", matching_word_ids)
        if not is_premium:
            if free_word_floor:
                count_query = count_query.gte("id", free_word_floor)
            else:
                count_query = None

        available = _count_rows(count_query) if count_query is not None else 0
        page_end = min(offset + limit, available)
        items = []
        if offset < page_end:
            page_query = (
                supabase_admin.table("words")
                .select(fields)
                .eq("language_code", language_code)
            )
            if matching_word_ids is not None:
                page_query = page_query.in_("id", matching_word_ids)
            if not is_premium:
                page_query = page_query.gte("id", free_word_floor)
            items = (
                page_query.order("id")
                .range(offset, page_end - 1)
                .execute()
                .data
            )
        total = total_words
    else:
        link_count_query = (
            supabase_admin.table("word_topics")
            .select("word_id", count="exact") # type: ignore
            .eq("topic_id", topic_id)
        )
        if matching_word_ids is not None:
            link_count_query = link_count_query.in_("word_id", matching_word_ids)
        total = _count_rows(link_count_query)
        links_query = supabase_admin.table("word_topics").select(
            "word_id", count="exact" # type: ignore
        ).eq("topic_id", topic_id)
        if matching_word_ids is not None:
            links_query = links_query.in_("word_id", matching_word_ids)
        if not is_premium:
            if not free_word_floor:
                links_query = None
            else:
                links_query = links_query.gte("word_id", free_word_floor)
        if links_query is None:
            available = 0
            items = []
        else:
            available = _count_rows(links_query)
            page_end = min(offset + limit, available)
            items = []
            if offset < page_end:
                word_ids = (
                    supabase_admin.table("word_topics")
                    .select("word_id")
                    .eq("topic_id", topic_id)
                )
                if matching_word_ids is not None:
                    word_ids = word_ids.in_("word_id", matching_word_ids)
                if not is_premium:
                    word_ids = word_ids.gte("word_id", free_word_floor)
                ids = (
                    word_ids.order("word_id")
                    .range(offset, page_end - 1)
                    .execute()
                    .data
                )
                selected_ids = [row["word_id"] for row in ids] # type: ignore
                if selected_ids:
                    rows = (
                        supabase_admin.table("words")
                        .select(fields)
                        .eq("language_code", language_code)
                        .in_("id", selected_ids) # type: ignore
                        .execute()
                        .data
                    )
                    by_id = {row["id"]: row for row in rows} # type: ignore
                    items = [by_id[word_id] for word_id in selected_ids if word_id in by_id]

    return {
        "items": items,
        "total": total,
        "available": available,
        "limit": limit,
        "offset": offset,
        "plan": "premium" if is_premium else "free",
        "topic": topic,
    }


def create_word(data: Dict[str, Any]) -> Dict[str, Any]:
    _validate_admin_word(data)
    topic_ids = data["topic_ids"]
    payload = {key: value for key, value in data.items() if key != "topic_ids"}
    try:
        result = (
            supabase_admin.rpc(
                "admin_create_word",
                {"p_word": payload, "p_topic_ids": topic_ids},
            )
            .execute()
        )
    except Exception as exc:
        _raise_word_db_error(exc)

    if not result.data:
        raise HTTPException(
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            "Không thể tạo từ vựng.",
        )
    return result.data # type: ignore


ADMIN_WORD_FIELDS = (
    "id,language_code,word,phonetic,meaning,part_of_speech,audio_url,"
    "example_sentence,example_meaning,level,created_at,updated_at"
)


def list_admin_words(limit: int, offset: int) -> Dict[str, Any]:
    result = (
        supabase_admin.table("words")
        .select(ADMIN_WORD_FIELDS, count="exact")  # type: ignore
        .order("id", desc=True)
        .range(offset, offset + limit - 1)
        .execute()
    )
    return {
        "items": result.data,
        "total": int(result.count or 0),
        "limit": limit,
        "offset": offset,
    }


def get_admin_word(word_id: int) -> Dict[str, Any]:
    rows = (
        supabase_admin.table("words")
        .select(ADMIN_WORD_FIELDS)
        .eq("id", word_id)
        .limit(1)
        .execute()
        .data
    )
    if not rows:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy từ vựng.")

    word = rows[0]
    topic_rows = (
        supabase_admin.table("word_topics")
        .select("topic_id")
        .eq("word_id", word_id)
        .execute()
        .data
    )
    word["topic_ids"] = [row["topic_id"] for row in topic_rows] # type: ignore
    return word # type: ignore


def update_word(word_id: int, data: Dict[str, Any]) -> Dict[str, Any]:
    _validate_admin_word(data)
    try:
        result = supabase_admin.rpc(
            "admin_update_word",
            {
                "p_word_id": word_id,
                "p_word": {key: value for key, value in data.items() if key != "topic_ids"},
                "p_topic_ids": data["topic_ids"],
            },
        ).execute()
    except Exception as exc:
        _raise_word_db_error(exc)

    if not result.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy từ vựng.")
    return result.data # type: ignore


def delete_word(word_id: int) -> None:
    try:
        result = supabase_admin.rpc("admin_delete_word", {"p_word_id": word_id}).execute()
    except Exception as exc:
        _raise_word_db_error(exc)
    if not result.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy từ vựng.")


def _validate_admin_word(data: Dict[str, Any]) -> None:
    language_code = data["language_code"]
    topic_ids = data["topic_ids"]
    language_rows = (
        supabase_admin.table("languages")
        .select("code")
        .eq("code", language_code)
        .limit(1)
        .execute()
        .data
    )
    if not language_rows:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Ngôn ngữ không tồn tại.")

    topic_rows = (
        supabase_admin.table("topics")
        .select("id")
        .eq("language_code", language_code)
        .in_("id", topic_ids)
        .execute()
        .data
    )
    if len(topic_rows) != len(topic_ids):
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "Một hoặc nhiều chủ đề không tồn tại hoặc không thuộc ngôn ngữ đã chọn.",
        )


def _raise_word_db_error(exc: Exception) -> None:
    code = str(getattr(exc, "code", "") or "")
    message = str(exc).lower()
    if code == "23505" or "duplicate key" in message or "word already exists" in message:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Từ vựng này đã tồn tại trong ngôn ngữ đã chọn.",
        ) from exc
    raise_db_error(exc)


def list_admin_languages() -> list[Dict[str, Any]]:
    return (
        supabase_admin.table("languages")
        .select("code,name")
        .order("sort_order")
        .execute()
        .data
    ) # type: ignore


def list_admin_topics(language_code: str) -> list[Dict[str, Any]]:
    return (
        supabase_admin.table("topics")
        .select("id,name")
        .eq("language_code", language_code)
        .order("sort_order")
        .execute()
        .data
    ) # type: ignore
