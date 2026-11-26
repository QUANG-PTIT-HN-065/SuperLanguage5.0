import { smartAiRequest } from "./aiRouter.js";

export interface AudioTranscriptionResponse {
  transcript: string;
  conversation_id?: string;
}

export async function transcribeChatAudio(
  conversationId: string,
  audio: Blob,
): Promise<AudioTranscriptionResponse> {
  const formData = new FormData();
  formData.append("conversation_id", conversationId);
  formData.append("audio", audio, audioFilename(audio.type));
  const response = await requestTranscription("/transcribe-audio", formData);
  return { ...response, conversation_id: conversationId };
}

/** Đàm thoại: chép nguyên văn điều vừa nói, backend tự nhận diện ngôn ngữ. */
export async function transcribeVoiceMessage(
  conversationId: string,
  audio: Blob,
): Promise<string> {
  const formData = new FormData();
  formData.append("conversation_id", conversationId);
  formData.append("audio", audio, audioFilename(audio.type));
  const response = await requestTranscription("/transcribe-voice", formData);
  return response.transcript;
}

export async function transcribePracticeAudio(
  conversationId: string,
  audio: Blob,
): Promise<AudioTranscriptionResponse> {
  const formData = new FormData();
  formData.append("conversation_id", conversationId);
  formData.append("audio", audio, audioFilename(audio.type));
  return requestTranscription("/transcribe-practice", formData);
}

async function requestTranscription(
  path: string,
  formData: FormData,
): Promise<AudioTranscriptionResponse> {
  const response = await smartAiRequest<AudioTranscriptionResponse>(
    `/api/v1/chat-ai${path}`,
    { method: "POST", body: formData },
  );
  const transcript = response.data.transcript;
  if (typeof transcript !== "string" || !transcript.trim()) {
    throw new Error("Máy chủ chưa trả về nội dung nhận diện hợp lệ.");
  }
  return { transcript: transcript.trim() };
}

export interface PronunciationTurnFeedback {
  pronunciation_score: number | null;
  pronunciation_feedback: string;
  grammar_error: string;
  corrected_sentence: string;
  natural_suggestion: string;
  next_topic: string;
  next_prompt: string;
  comment: string;
}

export interface PronunciationTurnResponse {
  conversation_id: string;
  transcript: string;
  ai_response: string;
  ai_feedback: PronunciationTurnFeedback;
}

/** Một lượt nói trong chế độ Phát Âm & Chính tả: gửi audio, nhận điểm + nội dung kế tiếp. */
export async function submitPronunciationTurn(
  conversationId: string,
  audio: Blob,
): Promise<PronunciationTurnResponse> {
  const formData = new FormData();
  formData.append("conversation_id", conversationId);
  formData.append("audio", audio, audioFilename(audio.type));
  const response = await slanguageApi<PronunciationTurnResponse>(
    "/api/v1/chat-ai/pronunciation-turn",
    { method: "POST", body: formData },
  );
  const data = response.data;
  if (!data || typeof data.transcript !== "string" || !data.ai_response) {
    throw new Error("Máy chủ chưa trả về kết quả chấm phát âm hợp lệ.");
  }
  return { ...data, conversation_id: conversationId };
}

function audioFilename(contentType: string): string {
  const normalizedType = contentType.split(";", 1)[0].trim().toLowerCase();
  const extensions: Record<string, string> = {
    "audio/aac": "aac",
    "audio/mp4": "m4a",
    "audio/mpeg": "mp3",
    "audio/ogg": "ogg",
    "audio/wav": "wav",
    "audio/x-wav": "wav",
    "audio/webm": "webm",
  };
  return `voice.${extensions[normalizedType] || "webm"}`;
}
