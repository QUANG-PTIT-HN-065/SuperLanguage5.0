from typing import Any, Dict, List

from fastapi import HTTPException, status

from app.db.supabase import supabase_admin
from app.services.profile_service import raise_db_error


def _validate_topic_ids(language_code: str, topic_ids: List[int]) -> None:
    if not topic_ids:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            "Vui lòng chọn ít nhất một chủ đề cho lộ trình.",
        )
    rows = (
        supabase_admin.table("topics")
        .select("id")
        .eq("language_code", language_code)
        .in_("id", topic_ids)
        .execute()
        .data
    )
    if len(rows or []) != len(set(topic_ids)):
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            "Mọi chủ đề trong lộ trình phải thuộc cùng một ngôn ngữ.",
        )


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
        path_ids = [path["id"] for path in paths]
        topic_links = []
        if path_ids:
            topic_links = (
                supabase_admin.table("learning_path_topics")
                .select("learning_path_id,topic_id,sort_order")
                .in_("learning_path_id", path_ids)
                .order("sort_order")
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


def create_learning_path(data: Dict[str, Any]) -> Dict[str, Any]:
    topic_ids = list(dict.fromkeys(data["topic_ids"]))
    try:
        _validate_topic_ids(data["language_code"], topic_ids)
        result = supabase_admin.rpc(
            "admin_save_learning_path",
            {
                "p_path_id": None,
                "p_language_code": data["language_code"],
                "p_name": data["name"],
                "p_description": data.get("description"),
                "p_sort_order": data.get("sort_order", 100),
                "p_topic_ids": topic_ids,
            },
        ).execute()
        if not isinstance(result.data, dict) or not result.data:
            raise HTTPException(
                status.HTTP_502_BAD_GATEWAY,
                "Cơ sở dữ liệu không trả về thông tin lộ trình.",
            )
        return {**result.data, "topic_ids": topic_ids}
    except HTTPException:
        raise
    except Exception as exc:
        raise_db_error(exc)
        raise


def update_learning_path(path_id: int, data: Dict[str, Any]) -> Dict[str, Any]:
    try:
        current = (
            supabase_admin.table("learning_paths")
            .select("id,language_code,name,description,sort_order")
            .eq("id", path_id)
            .limit(1)
            .execute()
            .data
        )
        if not current:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy lộ trình.")

        current_path = current[0]
        language_code = data.get("language_code", current_path["language_code"])
        topic_ids = data.get("topic_ids")
        if topic_ids is None:
            existing_links = (
                supabase_admin.table("learning_path_topics")
                .select("topic_id")
                .eq("learning_path_id", path_id)
                .order("sort_order")
                .execute()
                .data
                or []
            )
            topic_ids = [link["topic_id"] for link in existing_links]
        topic_ids = list(dict.fromkeys(topic_ids))
        _validate_topic_ids(language_code, topic_ids)

        result = supabase_admin.rpc(
            "admin_save_learning_path",
            {
                "p_path_id": path_id,
                "p_language_code": language_code,
                "p_name": data.get("name", current_path["name"]),
                "p_description": data.get("description", current_path["description"]),
                "p_sort_order": data.get("sort_order", current_path["sort_order"]),
                "p_topic_ids": topic_ids,
            },
        ).execute()
        if not isinstance(result.data, dict) or not result.data:
            raise HTTPException(
                status.HTTP_502_BAD_GATEWAY,
                "Cơ sở dữ liệu không trả về thông tin lộ trình.",
            )
        return {**result.data, "topic_ids": topic_ids}
    except HTTPException:
        raise
    except Exception as exc:
        raise_db_error(exc)
        raise


def delete_learning_path(path_id: int) -> None:
    try:
        result = (
            supabase_admin.table("learning_paths")
            .delete()
            .eq("id", path_id)
            .execute()
        )
        if not result.data:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy lộ trình.")
    except HTTPException:
        raise
    except Exception as exc:
        raise_db_error(exc)
