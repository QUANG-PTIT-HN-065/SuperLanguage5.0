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
