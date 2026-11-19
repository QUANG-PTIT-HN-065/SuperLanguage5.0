from typing import Any, Dict, List

from app.db.supabase import supabase_admin
from app.services.profile_service import raise_db_error


def _auto_path_from_topics(language_code: str) -> List[Dict[str, Any]]:
    # Chưa có lộ trình riêng: dựng lộ trình mặc định từ chủ đề theo sort_order.
    topics = (
        supabase_admin.table("topics")
        .select("id")
        .eq("language_code", language_code)
        .order("sort_order")
        .order("id")
        .execute()
        .data
        or []
    )
    if not topics:
        return []
    path = (
        supabase_admin.table("learning_paths")
        .insert({
            "language_code": language_code,
            "name": f"Lộ trình tự động · {language_code.upper()}",
            "description": "Tự dựng từ các chủ đề theo thứ tự hiển thị.",
            "sort_order": 100,
        })
        .execute()
        .data[0]
    )
    supabase_admin.table("learning_path_topics").insert([
        {"learning_path_id": path["id"], "topic_id": topic["id"], "sort_order": index + 1}
        for index, topic in enumerate(topics)
    ]).execute()
    return [path]


def list_learning_paths(language_code: str) -> List[Dict[str, Any]]:
    try:
        paths = (
            supabase_admin.table("learning_paths")
            .select("id,language_code,name,description,sort_order")
            .eq("language_code", language_code)
            .order("sort_order")
            .order("id")
            .execute()
            .data
            or []
        )
        if not paths:
            paths = _auto_path_from_topics(language_code)
        path_ids = [path["id"] for path in paths]
        topic_links = []
        if path_ids:
            topic_links = (
                supabase_admin.table("learning_path_topics")
                .select("learning_path_id,topic_id,sort_order")
                .in_("learning_path_id", path_ids)
                .order("sort_order")
                .order("topic_id")
                .execute()
                .data
                or []
            )
        topics = []
        topic_ids = list({link["topic_id"] for link in topic_links})
        if topic_ids:
            topics = (
                supabase_admin.table("topics")
                .select("id,language_code,name,description,icon_url,sort_order")
                .in_("id", topic_ids)
                .execute()
                .data
                or []
            )
        topic_by_id = {topic["id"]: topic for topic in topics}
        links_by_path: Dict[int, List[Dict[str, Any]]] = {}
        for link in topic_links:
            topic = topic_by_id.get(link["topic_id"])
            if topic:
                links_by_path.setdefault(link["learning_path_id"], []).append(topic)
        for path in paths:
            path["topics"] = links_by_path.get(path["id"], [])
        return paths
    except Exception as exc:
        raise_db_error(exc)
        raise
