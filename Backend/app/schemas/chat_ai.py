from pydantic import BaseModel
from typing import Optional
from uuid import UUID

class ConversationCreate(BaseModel):
    title: str
    language_code: str # 'English' hoặc 'Japanese'

class MessageSend(BaseModel):
    conversation_id: UUID
    user_message: str

class MessageResponse(BaseModel):
    user_message: str
    ai_response: str
    ai_feedback: Optional[str] = None