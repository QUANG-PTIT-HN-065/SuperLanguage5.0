import { slanguageApi } from "../shared/api-client.js";

const CHAT_API_PREFIX = "/api/v1/chat-ai";

export interface Conversation {
  id: string;
  title: string;
  language_code: string;
  created_at: string | null;
  updated_at?: string | null;
}

export interface ConversationMessage {
  id: string;
  conversation_id: string;
  sender_type: "user" | "ai";
  content: string;
  ai_feedback?: string | null;
  created_at: string | null;
}

export interface ConversationCreate {
  title: string;
  language_code: "English" | "Japanese";
}

export interface ChatMessageResponse {
  conversation_id: string;
  user_message: string;
  ai_response: string;
  ai_feedback: string | null;
}

export interface AudioTranscriptionResponse {
  conversation_id: string;
  transcript: string;
}

export async function listChatConversations(): Promise<Conversation[]> {
  const response = await slanguageApi<Conversation[]>(`${CHAT_API_PREFIX}/conversations`);
  return response.data;
}

export async function createChatConversation(
  conversation: ConversationCreate,
): Promise<Conversation> {
  const response = await slanguageApi<Conversation>(`${CHAT_API_PREFIX}/conversations`, {
    method: "POST",
    body: conversation,
  });
  return response.data;
}

export async function listConversationMessages(
  conversationId: string,
): Promise<ConversationMessage[]> {
  const response = await slanguageApi<ConversationMessage[]>(
    `${CHAT_API_PREFIX}/conversations/${encodeURIComponent(conversationId)}/messages?limit=1000&offset=0`,
  );
  return response.data;
}

export async function sendChatMessage(
  conversationId: string,
  userMessage: string,
): Promise<ChatMessageResponse> {
  const response = await slanguageApi<ChatMessageResponse>(`${CHAT_API_PREFIX}/send-message`, {
    method: "POST",
    body: { conversation_id: conversationId, user_message: userMessage },
  });
  return response.data;
}

export async function transcribeChatAudio(
  conversationId: string,
  audio: Blob,
): Promise<AudioTranscriptionResponse> {
  const formData = new FormData();
  formData.append("conversation_id", conversationId);
  formData.append("audio", audio, audioFilename(audio.type));

  const response = await slanguageApi<AudioTranscriptionResponse>(
    `${CHAT_API_PREFIX}/transcribe-audio`,
    { method: "POST", body: formData },
  );
  return response.data;
}

function audioFilename(contentType: string): string {
  const normalizedType = contentType.split(";", 1)[0].trim().toLowerCase();
  const extensions: Record<string, string> = {
    "audio/aac": "aac",
    "audio/mp4": "m4a",
    "audio/mpeg": "mp3",
    "audio/ogg": "ogg",
    "audio/wav": "wav",
    "audio/webm": "webm",
    "audio/x-wav": "wav",
  };
  return `voice.${extensions[normalizedType] || "webm"}`;
}
