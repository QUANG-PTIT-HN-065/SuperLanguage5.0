import { slanguageApi } from "../shared/api-client.js";

const CHAT_API_PREFIX = "/api/v1/chat-ai";

export { transcribeChatAudio } from "../shared/speech-api.js";

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

export interface ReadingPromptResponse {
  sentence: string;
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

export async function generateChatReadingPrompt(
  conversationId: string,
): Promise<ReadingPromptResponse> {
  const response = await slanguageApi<ReadingPromptResponse>(
    `${CHAT_API_PREFIX}/reading-prompt`,
    {
      method: "POST",
      body: { conversation_id: conversationId },
    },
  );
  return response.data;
}
