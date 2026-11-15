import { slanguageApi, slanguageApiAudio } from "../shared/api-client.js";

const CHAT_API_PREFIX = "/api/v1/chat-ai";

export { transcribeChatAudio } from "../shared/speech-api.js";

export interface Conversation {
  id: string;
  title: string;
  language_code: string;
  practice_mode: "free-chat" | "read-aloud";
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
  practice_mode: "free-chat" | "read-aloud";
}

export interface ChatMessageResponse {
  conversation_id: string;
  user_message: string;
  ai_response: string;
  ai_feedback: string | null;
}

export interface ReadingPromptResponse {
  id: string;
  conversation_id: string;
  question: string;
  sample_answer: string;
  created_at: string | null;
}

export interface ReadingFeedback {
  grammar_error: string;
  corrected_sentence: string;
  natural_suggestion: string;
  pronunciation_score: number | null;
  pronunciation_feedback: string;
}

export interface ReadingPracticeTurn extends ReadingPromptResponse {
  transcript: string | null;
  ai_feedback: ReadingFeedback | null;
}

export async function synthesizeChatSpeech(text: string, language: string): Promise<Blob> {
  return slanguageApiAudio(`${CHAT_API_PREFIX}/tts`, { text, language });
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

export async function sendVoiceChatMessage(
  conversationId: string,
  audio: Blob,
): Promise<ChatMessageResponse> {
  const formData = new FormData();
  formData.append("conversation_id", conversationId);
  formData.append("audio", audio, "voice.webm");
  const response = await slanguageApi<ChatMessageResponse>(
    `${CHAT_API_PREFIX}/send-voice-message`,
    { method: "POST", body: formData },
  );
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

export async function listReadingPracticeTurns(
  conversationId: string,
): Promise<ReadingPracticeTurn[]> {
  const response = await slanguageApi<ReadingPracticeTurn[]>(
    `${CHAT_API_PREFIX}/conversations/${encodeURIComponent(conversationId)}/reading-turns?limit=1000&offset=0`,
  );
  return response.data;
}

export async function submitReadingPracticeAnswer(
  conversationId: string,
  turnId: string,
  audio: Blob,
): Promise<ReadingPracticeTurn> {
  const formData = new FormData();
  formData.append("conversation_id", conversationId);
  formData.append("turn_id", turnId);
  formData.append("audio", audio, "reading-answer.webm");
  const response = await slanguageApi<ReadingPracticeTurn>(
    `${CHAT_API_PREFIX}/reading-answer`,
    { method: "POST", body: formData },
  );
  return response.data;
}
