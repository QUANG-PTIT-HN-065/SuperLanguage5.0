interface ApiResponse<T> {
  status: string;
  message: string;
  data: T;
  error: unknown;
}

interface Conversation {
  id: string;
  title: string;
  language_code: "English" | "Japanese";
  created_at: string | null;
}

interface ChatMessage {
  conversation_id: string;
  user_message: string;
  ai_response: string;
  ai_feedback: string | null;
}

interface AudioUpload {
  conversation_id: string;
  file_name: string;
  content_type: string;
  size_bytes: number;
  storage_path: string;
}

const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000"
).replace(/\/+$/, "");
const ACCESS_TOKEN_KEY = "slanguage_access_token";
const REFRESH_TOKEN_KEY = "slanguage_refresh_token";

const messagesElement = document.getElementById("messages");
const messageForm = document.getElementById("messageForm");
const messageInput = document.getElementById("messageInput");
const sendButton = document.getElementById("sendButton");
const conversationForm = document.getElementById("conversationForm");
const languageSelect = document.getElementById("languageSelect");
const topicInput = document.getElementById("topicInput");
const toastElement = document.getElementById("toast");
const authOverlay = document.getElementById("authOverlay");
const chatLayout = document.querySelector<HTMLElement>(".room-grid");
const roomFrame = document.querySelector<HTMLElement>(".room-frame");
const roomStatus = document.getElementById("roomStatus");
const roomStatusBadge = document.getElementById("roomStatusBadge");
const practiceSubtitle = document.getElementById("practiceSubtitle");
const visualizerTitle = document.getElementById("visualizerTitle");
const visualizerHint = document.getElementById("visualizerHint");
const transcriptMessages = document.getElementById("transcriptMessages");
const recordButton = document.getElementById("recordButton");
const stopRecordingButton = document.getElementById("stopRecordingButton");
const uploadAudioButton = document.getElementById("uploadAudioButton");
const audioPreview = document.getElementById("audioPreview");
const recordingTimer = document.getElementById("recordingTimer");
const recordingStatus = document.getElementById("recordingStatus");

let activeConversation: Conversation | null = null;
let toastTimer = 0;
const MAX_RECORDING_SECONDS = 60;
const MAX_AUDIO_BYTES = 10 * 1024 * 1024;
let recorder: MediaRecorder | null = null;
let microphoneStream: MediaStream | null = null;
let recordingChunks: BlobPart[] = [];
let recordingBlob: Blob | null = null;
let recordingUrl: string | null = null;
const messageAudioUrls: string[] = [];
let recordingStartedAt = 0;
let recordingDurationSeconds = 0;
let recordingInterval = 0;
let recordingLimitTimer = 0;
let isUploadingAudio = false;
let isStartingRecording = false;
let recordingFailed = false;

class ChatApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "ChatApiError";
  }
}

function updateAuthenticationState(isAuthenticated: boolean): void {
  if (authOverlay instanceof HTMLElement) authOverlay.hidden = isAuthenticated;
  if (chatLayout instanceof HTMLElement) chatLayout.inert = !isAuthenticated;
  if (!isAuthenticated) setComposerEnabled(false);
}

function expireAuthentication(): void {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  updateAuthenticationState(false);
}

function showToast(message: string): void {
  if (!(toastElement instanceof HTMLElement)) return;
  toastElement.textContent = message;
  toastElement.classList.add("visible");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toastElement.classList.remove("visible"), 3500);
}

async function parseResponse<T>(response: Response): Promise<ApiResponse<T>> {
  const payload: unknown = await response.json();
  if (!response.ok) {
    const detail =
      typeof payload === "object" &&
      payload !== null &&
      "detail" in payload &&
      typeof payload.detail === "string"
        ? payload.detail
        : `Backend trả về lỗi HTTP ${response.status}.`;
    throw new ChatApiError(detail, response.status);
  }

  if (
    typeof payload !== "object" ||
    payload === null ||
    !("data" in payload) ||
    !("status" in payload) ||
    typeof payload.status !== "string"
  ) {
    throw new Error("Backend trả về dữ liệu không đúng định dạng.");
  }
  return payload as ApiResponse<T>;
}

async function refreshAccessToken(): Promise<string> {
  const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
  if (!refreshToken) {
    expireAuthentication();
    throw new ChatApiError("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.", 401);
  }

  const response = await fetch(`${API_BASE_URL}/api/v1/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  if (response.status === 401) expireAuthentication();
  const result = await parseResponse<{
    access_token: string;
    refresh_token: string;
  }>(response);

  if (!result.data.access_token || !result.data.refresh_token) {
    throw new Error("Backend không trả về phiên đăng nhập mới.");
  }
  localStorage.setItem(ACCESS_TOKEN_KEY, result.data.access_token);
  localStorage.setItem(REFRESH_TOKEN_KEY, result.data.refresh_token);
  return result.data.access_token;
}

async function apiRequest<T>(
  path: string,
  body: unknown,
  allowRefresh = true,
): Promise<ApiResponse<T>> {
  const accessToken = localStorage.getItem(ACCESS_TOKEN_KEY);
  if (!accessToken) {
    updateAuthenticationState(false);
    throw new ChatApiError("Vui lòng đăng nhập để sử dụng trò chuyện AI.", 401);
  }

  const headers = new Headers({ "Content-Type": "application/json" });
  headers.set("Authorization", `Bearer ${accessToken}`);
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (response.status === 401 && allowRefresh && accessToken) {
    const refreshedToken = await refreshAccessToken();
    const retryHeaders = new Headers({ "Content-Type": "application/json" });
    retryHeaders.set("Authorization", `Bearer ${refreshedToken}`);
    const retry = await fetch(`${API_BASE_URL}${path}`, {
      method: "POST",
      headers: retryHeaders,
      body: JSON.stringify(body),
    });
    if (retry.status === 401) expireAuthentication();
    return parseResponse<T>(retry);
  }
  if (response.status === 401) expireAuthentication();
  return parseResponse<T>(response);
}

function addMessage(role: "user" | "assistant", content: string, feedback?: string | null): HTMLElement {
  if (!(messagesElement instanceof HTMLElement)) throw new Error("Không tìm thấy vùng hiển thị tin nhắn.");
  document.getElementById("welcomeCard")?.remove();

  const row = document.createElement("div");
  row.className = `message-row ${role}`;
  row.dataset.transcriptId = addTranscriptEntry(role, content);

  if (role === "assistant") {
    const avatar = document.createElement("div");
    avatar.className = "message-avatar";
    avatar.textContent = "✦";
    avatar.setAttribute("aria-hidden", "true");
    row.append(avatar);
  }

  const contentWrap = document.createElement("div");
  contentWrap.className = "message-content";
  const bubble = document.createElement("div");
  bubble.className = "message-bubble";
  bubble.textContent = content;
  contentWrap.append(bubble);

  if (role === "assistant") {
    const time = document.createElement("div");
    time.className = "message-time";
    time.textContent = new Intl.DateTimeFormat("vi-VN", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date());
    contentWrap.append(time);
  }

  if (role === "assistant" && feedback) {
    const feedbackElement = document.createElement("div");
    feedbackElement.className = "feedback";
    const title = document.createElement("strong");
    title.textContent = "Góp ý từ AI";
    const body = document.createElement("span");
    body.textContent = feedback;
    feedbackElement.append(title, body);
    contentWrap.append(feedbackElement);
  }

  row.append(contentWrap);
  messagesElement.append(row);
  messagesElement.scrollTop = messagesElement.scrollHeight;
  return row;
}

function addTranscriptEntry(role: "user" | "assistant", content: string): string {
  if (!(transcriptMessages instanceof HTMLElement)) return "";
  transcriptMessages.querySelector(".transcript-empty")?.remove();

  const entry = document.createElement("div");
  entry.className = `transcript-entry ${role}`;
  entry.id = `transcript-entry-${Date.now()}-${transcriptMessages.childElementCount}`;
  const label = document.createElement("strong");
  label.textContent = role === "user" ? "BẠN" : "AI COACH";
  const text = document.createElement("span");
  text.textContent = content;
  entry.append(label, text);
  transcriptMessages.append(entry);
  transcriptMessages.scrollTop = transcriptMessages.scrollHeight;
  return entry.id;
}

function removeMessage(row: HTMLElement): void {
  const transcriptEntry = row.dataset.transcriptId
    ? document.getElementById(row.dataset.transcriptId)
    : null;
  transcriptEntry?.remove();
  row.remove();
}

function updatePhraseList(languageCode: Conversation["language_code"]): void {
  const phraseList = document.getElementById("phraseList");
  if (!(phraseList instanceof HTMLElement)) return;
  const phrases = languageCode === "Japanese"
    ? [
      ["こんにちは", "Xin chào"],
      ["はじめまして", "Rất vui được gặp bạn"],
      ["お元気ですか？", "Bạn khỏe không?"],
      ["ありがとうございます", "Cảm ơn"],
    ]
    : [
      ["Hello", "Xin chào"],
      ["Nice to meet you", "Rất vui được gặp bạn"],
      ["How are you?", "Bạn khỏe không?"],
      ["Thank you", "Cảm ơn"],
    ];
  phraseList.replaceChildren(...phrases.map(([phrase, translation]) => {
    const item = document.createElement("li");
    const phraseText = document.createElement("strong");
    phraseText.textContent = phrase;
    const translationText = document.createElement("span");
    translationText.textContent = translation;
    item.append(phraseText, translationText);
    return item;
  }));
}

function setComposerEnabled(enabled: boolean): void {
  if (messageInput instanceof HTMLTextAreaElement) messageInput.disabled = !enabled;
  if (sendButton instanceof HTMLButtonElement) sendButton.disabled = !enabled;
  if (recordButton instanceof HTMLButtonElement) {
    recordButton.disabled = !enabled || !supportsAudioRecording();
  }
}

function getRecorderMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined" || typeof MediaRecorder.isTypeSupported !== "function") {
    return undefined;
  }
  return [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/mp4",
  ].find((mimeType) => MediaRecorder.isTypeSupported(mimeType));
}

function supportsAudioRecording(): boolean {
  return (
    typeof MediaRecorder !== "undefined" &&
    typeof navigator.mediaDevices?.getUserMedia === "function"
  );
}

function setRecordingStatus(message: string): void {
  if (recordingStatus instanceof HTMLElement) recordingStatus.textContent = message;
}

function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, "0");
  const remainingSeconds = (seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${remainingSeconds}`;
}

function stopRecording(): void {
  if (recorder?.state === "recording") recorder.stop();
}

async function startRecording(): Promise<void> {
  if (!localStorage.getItem(ACCESS_TOKEN_KEY)) {
    updateAuthenticationState(false);
    return;
  }
  if (isStartingRecording || recorder?.state === "recording") return;
  if (!activeConversation) {
    showToast("Hãy bắt đầu cuộc trò chuyện trước khi ghi âm.");
    return;
  }
  if (!supportsAudioRecording()) {
    setRecordingStatus("Trình duyệt này không hỗ trợ ghi âm. Hãy dùng trình duyệt mới hơn và bật quyền micro.");
    showToast("Trình duyệt không hỗ trợ MediaRecorder hoặc quyền truy cập micro.");
    return;
  }
  if (!window.isSecureContext) {
    showToast("Ghi âm cần trang web chạy qua HTTPS hoặc localhost.");
    return;
  }

  isStartingRecording = true;
  if (recordButton instanceof HTMLButtonElement) {
    recordButton.disabled = true;
    recordButton.textContent = "Đang xin quyền micro...";
  }
  setRecordingStatus("Đang yêu cầu quyền truy cập micro...");
  if (recordingUrl) {
    URL.revokeObjectURL(recordingUrl);
    recordingUrl = null;
  }
  recordingBlob = null;
  recordingChunks = [];
  recordingDurationSeconds = 0;
  recordingFailed = false;
  if (audioPreview instanceof HTMLAudioElement) {
    audioPreview.pause();
    audioPreview.removeAttribute("src");
    audioPreview.hidden = true;
  }
  if (uploadAudioButton instanceof HTMLButtonElement) uploadAudioButton.disabled = true;

  try {
    microphoneStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
    });
    const mimeType = getRecorderMimeType();
    recorder = mimeType
      ? new MediaRecorder(microphoneStream, { mimeType })
      : new MediaRecorder(microphoneStream);

    recorder.addEventListener("dataavailable", (event: BlobEvent) => {
      if (event.data.size > 0) recordingChunks.push(event.data);
    });
    recorder.addEventListener("error", () => {
      recordingFailed = true;
      releaseMicrophone();
      clearRecordingTimers();
      setRecordingStatus("Không thể ghi âm do lỗi thiết bị hoặc trình duyệt.");
      showToast("Không thể ghi âm. Hãy kiểm tra micro rồi thử lại.");
      updateRecordingControls(false);
    });
    recorder.addEventListener("stop", finishRecording, { once: true });
    recorder.start(250);

    recordingStartedAt = Date.now();
    isStartingRecording = false;
    updateRecordingControls(true);
    setRecordingStatus("Đang ghi âm. Bản ghi sẽ tự dừng sau 60 giây.");
    updateRecordingTimer();
    recordingInterval = window.setInterval(updateRecordingTimer, 250);
    recordingLimitTimer = window.setTimeout(stopRecording, MAX_RECORDING_SECONDS * 1000);
  } catch (error) {
    isStartingRecording = false;
    releaseMicrophone();
    clearRecordingTimers();
    updateRecordingControls(false);
    if (error instanceof DOMException && error.name === "NotAllowedError") {
      setRecordingStatus("Bạn chưa cấp quyền micro. Hãy cho phép truy cập micro trong cài đặt trình duyệt.");
      showToast("Bạn cần cấp quyền micro để ghi âm.");
    } else if (error instanceof DOMException && error.name === "NotFoundError") {
      setRecordingStatus("Không tìm thấy micro trên thiết bị.");
      showToast("Không tìm thấy micro. Hãy kết nối micro rồi thử lại.");
    } else {
      setRecordingStatus("Không thể bắt đầu ghi âm. Hãy kiểm tra micro và quyền truy cập.");
      showToast(error instanceof Error ? error.message : "Không thể truy cập micro.");
    }
  }
}

function updateRecordingControls(isRecording: boolean): void {
  roomFrame?.classList.toggle("is-recording", isRecording);
  if (roomStatus instanceof HTMLElement) {
    roomStatus.textContent = isRecording ? "Đang nghe bạn nói" : activeConversation ? "Đang luyện tập" : "Chờ bắt đầu";
  }
  if (roomStatusBadge instanceof HTMLElement) {
    roomStatusBadge.textContent = isRecording ? "Listening to you..." : activeConversation ? "Conversation active" : "Conversation ready";
  }
  if (visualizerTitle instanceof HTMLElement) {
    visualizerTitle.textContent = isRecording ? "ĐANG NGHE GIỌNG NÓI CỦA BẠN" : "AI VOICE PRACTICE";
  }
  if (visualizerHint instanceof HTMLElement) {
    visualizerHint.textContent = isRecording ? "Hãy nói tự nhiên — micro sẽ tự dừng sau 60 giây" : "Nhấn micro để bắt đầu nói";
  }
  if (recordButton instanceof HTMLButtonElement) {
    recordButton.disabled = isRecording || !activeConversation || !supportsAudioRecording();
    recordButton.classList.toggle("recording", isRecording);
    recordButton.innerHTML = isRecording
      ? '<span aria-hidden="true">●</span> Đang ghi'
      : '<span aria-hidden="true">●</span> Nói với AI';
  }
  if (stopRecordingButton instanceof HTMLButtonElement) {
    stopRecordingButton.disabled = !isRecording;
  }
}

function updateRecordingTimer(): void {
  if (!(recordingTimer instanceof HTMLElement) || !recordingStartedAt) return;
  const elapsed = Math.min(
    MAX_RECORDING_SECONDS,
    Math.floor((Date.now() - recordingStartedAt) / 1000),
  );
  recordingTimer.textContent = formatDuration(elapsed);
  recordingTimer.classList.toggle("active", recorder?.state === "recording");
}

function clearRecordingTimers(): void {
  window.clearInterval(recordingInterval);
  window.clearTimeout(recordingLimitTimer);
  recordingInterval = 0;
  recordingLimitTimer = 0;
}

function releaseMicrophone(): void {
  microphoneStream?.getTracks().forEach((track) => track.stop());
  microphoneStream = null;
}

function releaseAudioUrls(): void {
  if (recordingUrl) URL.revokeObjectURL(recordingUrl);
  recordingUrl = null;
  messageAudioUrls.forEach((url) => URL.revokeObjectURL(url));
  messageAudioUrls.length = 0;
}

function finishRecording(): void {
  clearRecordingTimers();
  releaseMicrophone();
  updateRecordingControls(false);
  recordingTimer?.classList.remove("active");
  if (recordingTimer instanceof HTMLElement) {
    recordingTimer.textContent = formatDuration(Math.min(
      MAX_RECORDING_SECONDS,
      Math.ceil((Date.now() - recordingStartedAt) / 1000),
    ));
  }

  if (recordingFailed) {
    recordingChunks = [];
    recordingBlob = null;
    return;
  }

  const firstChunk = recordingChunks[0];
  const mimeType = recorder?.mimeType || (
    firstChunk instanceof Blob ? firstChunk.type : "audio/webm"
  );
  recordingDurationSeconds = Math.min(
    MAX_RECORDING_SECONDS,
    Math.ceil((Date.now() - recordingStartedAt) / 1000),
  );
  recordingBlob = new Blob(recordingChunks, { type: mimeType });
  recordingChunks = [];
  if (recordingBlob.size === 0) {
    setRecordingStatus("Bản ghi trống. Hãy kiểm tra micro và thử lại.");
    showToast("Không thu được âm thanh từ micro.");
    return;
  }
  if (recordingBlob.size > MAX_AUDIO_BYTES) {
    recordingBlob = null;
    setRecordingStatus("File vượt quá giới hạn 10 MB. Hãy ghi âm ngắn hơn.");
    showToast("Bản ghi vượt quá giới hạn 10 MB.");
    return;
  }

  recordingUrl = URL.createObjectURL(recordingBlob);
  if (audioPreview instanceof HTMLAudioElement) {
    audioPreview.src = recordingUrl;
    audioPreview.hidden = false;
  }
  if (uploadAudioButton instanceof HTMLButtonElement) {
    uploadAudioButton.disabled = !activeConversation || isUploadingAudio;
  }
  setRecordingStatus("Đã ghi xong. Nghe lại bản ghi hoặc gửi lên máy chủ.");
}

function addAudioMessage(audioUrl: string, durationSeconds: number): void {
  if (!(messagesElement instanceof HTMLElement)) return;
  document.getElementById("welcomeCard")?.remove();

  const row = document.createElement("div");
  row.className = "message-row user";
  row.dataset.transcriptId = addTranscriptEntry("user", `Bản ghi âm · ${formatDuration(durationSeconds)}`);
  const content = document.createElement("div");
  content.className = "message-content";
  const bubble = document.createElement("div");
  bubble.className = "message-bubble";
  bubble.textContent = `🎙 Bản ghi âm · ${formatDuration(durationSeconds)}`;
  const player = document.createElement("audio");
  player.className = "user-audio-player";
  player.controls = true;
  player.preload = "metadata";
  player.src = audioUrl;
  content.append(bubble, player);
  row.append(content);
  messagesElement.append(row);
  messagesElement.scrollTop = messagesElement.scrollHeight;
}

async function uploadRecording(): Promise<void> {
  if (!localStorage.getItem(ACCESS_TOKEN_KEY)) {
    updateAuthenticationState(false);
    return;
  }
  if (!activeConversation || !recordingBlob || isUploadingAudio) {
    if (!activeConversation) showToast("Hãy bắt đầu cuộc trò chuyện trước khi gửi bản ghi.");
    return;
  }
  if (recordingBlob.size > MAX_AUDIO_BYTES) {
    showToast("Bản ghi vượt quá giới hạn 10 MB.");
    return;
  }

  const mimeType = recordingBlob.type.split(";", 1)[0].trim();
  const extensionByMimeType: Record<string, string> = {
    "audio/aac": "aac",
    "audio/mp4": "m4a",
    "audio/mpeg": "mp3",
    "audio/ogg": "ogg",
    "audio/wav": "wav",
    "audio/webm": "webm",
    "audio/x-wav": "wav",
  };
  const extension = extensionByMimeType[mimeType] || "webm";
  const formData = new FormData();
  formData.append("conversation_id", activeConversation.id);
  formData.append("audio", recordingBlob, `voice-recording.${extension}`);
  isUploadingAudio = true;
  if (uploadAudioButton instanceof HTMLButtonElement) {
    uploadAudioButton.disabled = true;
    uploadAudioButton.textContent = "Đang gửi...";
  }
  setRecordingStatus("Đang tải bản ghi âm lên máy chủ...");

  try {
    const uploaded = await postAudioForm(formData);
    if (recordingUrl && recordingBlob) {
      const messageAudioUrl = URL.createObjectURL(recordingBlob);
      messageAudioUrls.push(messageAudioUrl);
      addAudioMessage(messageAudioUrl, recordingDurationSeconds);
    }
    setRecordingStatus(`Đã tải bản ghi lên máy chủ (${formatFileSize(uploaded.size_bytes)}).`);
    showToast("Đã gửi bản ghi âm lên máy chủ.");
    recordingBlob = null;
    if (uploadAudioButton instanceof HTMLButtonElement) uploadAudioButton.disabled = true;
  } catch (error) {
    setRecordingStatus("Tải bản ghi thất bại. Bạn có thể thử gửi lại.");
    showToast(error instanceof Error ? error.message : "Không thể tải bản ghi lên máy chủ.");
  } finally {
    isUploadingAudio = false;
    if (uploadAudioButton instanceof HTMLButtonElement) {
      uploadAudioButton.textContent = "Gửi bản ghi";
      uploadAudioButton.disabled = !recordingBlob || !activeConversation;
    }
  }
}

function formatFileSize(size: number): string {
  return size < 1024 * 1024
    ? `${Math.max(1, Math.round(size / 1024))} KB`
    : `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

async function postAudioForm(formData: FormData): Promise<AudioUpload> {
  const accessToken = localStorage.getItem(ACCESS_TOKEN_KEY);
  if (!accessToken) {
    updateAuthenticationState(false);
    throw new ChatApiError("Vui lòng đăng nhập để tải bản ghi âm lên.", 401);
  }
  const headers = new Headers();
  headers.set("Authorization", `Bearer ${accessToken}`);
  let response = await fetch(`${API_BASE_URL}/api/v1/chat-ai/upload-audio`, {
    method: "POST",
    headers,
    body: formData,
  });
  if (response.status === 401 && accessToken) {
    const refreshedToken = await refreshAccessToken();
    const retryHeaders = new Headers({ Authorization: `Bearer ${refreshedToken}` });
    response = await fetch(`${API_BASE_URL}/api/v1/chat-ai/upload-audio`, {
      method: "POST",
      headers: retryHeaders,
      body: formData,
    });
  }
  if (response.status === 401) expireAuthentication();
  const result = await parseResponse<AudioUpload>(response);
  return result.data;
}

async function startConversation(event?: SubmitEvent): Promise<void> {
  event?.preventDefault();
  if (!localStorage.getItem(ACCESS_TOKEN_KEY)) {
    updateAuthenticationState(false);
    return;
  }
  if (!(languageSelect instanceof HTMLSelectElement) || !(topicInput instanceof HTMLInputElement)) return;
  if (isStartingRecording || recorder?.state === "recording" || isUploadingAudio) {
    showToast("Hãy dừng hoặc hoàn tất gửi bản ghi trước khi đổi phòng trò chuyện.");
    return;
  }

  const button = conversationForm?.querySelector<HTMLButtonElement>("button[type=submit]");
  if (button) button.disabled = true;
  try {
    const result = await apiRequest<Conversation>("/api/v1/chat-ai/conversations", {
      title: topicInput.value.trim(),
      language_code: languageSelect.value,
    });
    activeConversation = result.data;
    toastElement?.classList.remove("visible");
    recordingBlob = null;
    recordingStartedAt = 0;
    recordingDurationSeconds = 0;
    releaseAudioUrls();
    if (audioPreview instanceof HTMLAudioElement) {
      audioPreview.pause();
      audioPreview.removeAttribute("src");
      audioPreview.hidden = true;
    }
    if (uploadAudioButton instanceof HTMLButtonElement) uploadAudioButton.disabled = true;
    if (recordingTimer instanceof HTMLElement) recordingTimer.textContent = "00:00";
    setRecordingStatus("Xin quyền micro để ghi âm tối đa 60 giây.");
    const title = document.getElementById("conversationTitle");
    const language = document.getElementById("conversationLanguage");
    if (title) title.textContent = activeConversation.title;
    if (language) {
      language.textContent = activeConversation.language_code === "English"
        ? "Luyện tập bằng tiếng Anh"
        : "Luyện tập bằng tiếng Nhật";
    }

    if (messagesElement) {
      messagesElement.replaceChildren();
      const welcome = document.createElement("div");
      welcome.className = "welcome-card";
      welcome.id = "welcomeCard";
      const sparkle = document.createElement("div");
      sparkle.className = "welcome-sparkle";
      sparkle.textContent = "✦";
      const heading = document.createElement("h2");
      heading.textContent = "Phòng luyện tập đã sẵn sàng!";
      const text = document.createElement("p");
      text.textContent = "Hãy gửi lời chào hoặc bắt đầu với một câu hỏi về chủ đề của bạn.";
      welcome.append(sparkle, heading, text);
      messagesElement.append(welcome);
    }
    if (transcriptMessages) {
      transcriptMessages.replaceChildren();
      const empty = document.createElement("p");
      empty.className = "transcript-empty";
      empty.textContent = "Buổi luyện tập mới đã sẵn sàng. Hãy bắt đầu trò chuyện.";
      transcriptMessages.append(empty);
    }
    if (roomStatus instanceof HTMLElement) roomStatus.textContent = "Đang luyện tập";
    if (roomStatusBadge instanceof HTMLElement) roomStatusBadge.textContent = "Conversation active";
    if (practiceSubtitle instanceof HTMLElement) {
      practiceSubtitle.textContent = `Chủ đề hôm nay: ${activeConversation.title}`;
    }
    updatePhraseList(activeConversation.language_code);
    updateRecordingControls(false);
    setComposerEnabled(true);
    if (messageInput instanceof HTMLTextAreaElement) messageInput.focus();
  } catch (error) {
    showToast(error instanceof Error ? error.message : "Không thể tạo phòng trò chuyện.");
  } finally {
    if (button) button.disabled = false;
  }
}

async function sendMessage(event: SubmitEvent): Promise<void> {
  event.preventDefault();
  if (!localStorage.getItem(ACCESS_TOKEN_KEY)) {
    updateAuthenticationState(false);
    return;
  }
  if (!(messageInput instanceof HTMLTextAreaElement) || !(sendButton instanceof HTMLButtonElement)) return;
  const userMessage = messageInput.value.trim();
  if (!userMessage || !activeConversation) return;

  addMessage("user", userMessage);
  messageInput.value = "";
  messageInput.style.height = "auto";
  sendButton.disabled = true;
  const pendingReply = addMessage("assistant", "Đang soạn phản hồi...");

  try {
    const result = await apiRequest<ChatMessage>("/api/v1/chat-ai/send-message", {
      conversation_id: activeConversation.id,
      user_message: userMessage,
    });
    removeMessage(pendingReply);
    addMessage("assistant", result.data.ai_response, result.data.ai_feedback);
  } catch (error) {
    removeMessage(pendingReply);
    messageInput.value = userMessage;
    showToast(error instanceof Error ? error.message : "Không thể gửi tin nhắn.");
  } finally {
    sendButton.disabled = !activeConversation;
    messageInput.focus();
  }
}

function initialize(): void {
  const name = localStorage.getItem("slanguage_user_name") || "Học viên";
  const email = localStorage.getItem("slanguage_user_email") || "Tài khoản của bạn";
  const isAuthenticated = Boolean(localStorage.getItem(ACCESS_TOKEN_KEY));
  const profileName = document.getElementById("profileName");
  const profileEmail = document.getElementById("profileEmail");
  const profileAvatar = document.getElementById("profileAvatar");
  const loginLink = document.querySelector<HTMLAnchorElement>(".login-link");
  const logoutButton = document.getElementById("logoutButton");
  if (profileName) profileName.textContent = name;
  if (profileEmail) profileEmail.textContent = email;
  if (profileAvatar) profileAvatar.textContent = name.slice(0, 1).toUpperCase();
  if (!isAuthenticated) {
    if (profileName) profileName.textContent = "Chưa đăng nhập";
    if (profileEmail) profileEmail.textContent = "Cần đăng nhập để trò chuyện";
    if (profileAvatar) profileAvatar.textContent = "!";
    if (logoutButton instanceof HTMLElement) logoutButton.hidden = true;
  } else if (loginLink instanceof HTMLElement) {
    loginLink.hidden = true;
  }
  updateAuthenticationState(isAuthenticated);

  conversationForm?.addEventListener("submit", (event) => void startConversation(event));
  messageForm?.addEventListener("submit", (event) => void sendMessage(event));
  if (!supportsAudioRecording()) {
    if (recordButton instanceof HTMLButtonElement) recordButton.disabled = true;
    setRecordingStatus("Trình duyệt không hỗ trợ MediaRecorder hoặc quyền truy cập micro.");
  }
  recordButton?.addEventListener("click", () => void startRecording());
  stopRecordingButton?.addEventListener("click", stopRecording);
  uploadAudioButton?.addEventListener("click", () => void uploadRecording());
  messageInput?.addEventListener("input", () => {
    if (messageInput instanceof HTMLTextAreaElement) {
      messageInput.style.height = "auto";
      messageInput.style.height = `${Math.min(messageInput.scrollHeight, 120)}px`;
    }
  });
  messageInput?.addEventListener("keydown", (event) => {
    if (
      event instanceof KeyboardEvent &&
      event.key === "Enter" &&
      !event.shiftKey &&
      messageForm instanceof HTMLFormElement
    ) {
      event.preventDefault();
      messageForm.requestSubmit();
    }
  });
  document.getElementById("logoutButton")?.addEventListener("click", () => {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    localStorage.removeItem("slanguage_is_logged_in");
    window.location.assign("../login/index.html");
  });
  window.addEventListener("pagehide", () => {
    if (recorder?.state === "recording") recorder.stop();
    releaseMicrophone();
    clearRecordingTimers();
    releaseAudioUrls();
  }, { once: true });
}

document.addEventListener("DOMContentLoaded", initialize);
