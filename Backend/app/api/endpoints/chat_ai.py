from fastapi import APIRouter, HTTPException, status
from supabase import create_client, Client
from app.schemas.chat_ai import ConversationCreate, MessageSend, MessageResponse
from app.core.config import settings
from app.services.ai_service import AIService  

router = APIRouter(prefix="/api/ai-chat", tags=["AI Chat Speaking"])


# Khởi tạo Supabase client từ cấu hình chung trong config.py
supabase: Client = create_client(settings.SUPABASE_URL, settings.SUPABASE_SECRET_KEY)

@router.post("/conversations")
def create_conversation(data: ConversationCreate, user_id: str):
    """Tạo phòng luyện nói mới trên Supabase"""
    res = supabase.table("conversations").insert({
        "user_id": user_id,
        "title": data.title,
        "language_code": data.language_code 
    }).execute()
    return res.data

@router.post("/send-message", response_model=MessageResponse)
async def send_message(data: MessageSend):
    """Gửi tin nhắn, gọi AIService và lưu trữ lịch sử qua Supabase"""
    # 1. Lưu tin nhắn của User vào Supabase
    supabase.table("messages").insert({
        "conversation_id": str(data.conversation_id),
        "sender_type": "user",
        "content": data.user_message
    }).execute()

    # 2. Lấy ngôn ngữ của cuộc hội thoại từ Supabase
    conv = supabase.table("conversations").select("language_code").eq("id", str(data.conversation_id)).single().execute()
    lang = conv.data.get("language_code", "English")

    # 3. Gọi service AI xử lý logic bên trong
    try:
        ai_reply, ai_feedback = await AIService.generate_chat_response(data.user_message, lang)
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))

    # 4. Lưu phản hồi của AI vào Supabase
    supabase.table("messages").insert({
        "conversation_id": str(data.conversation_id),
        "sender_type": "ai",
        "content": ai_reply,
        "ai_feedback": ai_feedback
    }).execute()

    return MessageResponse(
        user_message=data.user_message,
        ai_response=ai_reply,
        ai_feedback=ai_feedback
    )