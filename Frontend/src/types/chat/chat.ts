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

interface SpeechRecognitionAlternativeLike {
  transcript: string;
}

interface SpeechRecognitionResultLike {
  readonly isFinal: boolean;
  readonly length: number;
  readonly [index: number]: SpeechRecognitionAlternativeLike;
}

interface SpeechRecognitionEventLike {
  readonly resultIndex: number;
  readonly results: ArrayLike<SpeechRecognitionResultLike>;
}

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}

interface SpeechRecognitionWindow extends Window {
  SpeechRecognition?: new () => SpeechRecognitionLike;
  webkitSpeechRecognition?: new () => SpeechRecognitionLike;
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

let activeConversation: Conversation | null = null;
let toastTimer = 0;
let speechRecognition: SpeechRecognitionLike | null = null;
let microphoneStream: MediaStream | null = null;
let mediaRecorder: MediaRecorder | null = null;
let recordedAudioChunks: BlobPart[] = [];
let pendingAudio: Blob | null = null;
let pendingAudioUrl: string | null = null;
let finalTranscript = "";
let isVoiceRecording = false;
let recordingTimer = 0;
let recordingSeconds = 0;

class ChatApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "ChatApiError";
  }
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
  if (!refreshToken) throw new ChatApiError("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.", 401);

  const response = await fetch(`${API_BASE_URL}/api/v1/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
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
  if (!accessToken) throw new ChatApiError("Vui lòng đăng nhập để sử dụng AI Conversation.", 401);

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
  });

  if (response.status === 401 && allowRefresh) {
    const refreshedToken = await refreshAccessToken();
    const retry = await fetch(`${API_BASE_URL}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${refreshedToken}`,
      },
      body: JSON.stringify(body),
    });
    return parseResponse<T>(retry);
  }
  return parseResponse<T>(response);
}

function addMessage(role: "user" | "assistant", content: string, feedback?: string | null): HTMLElement {
  if (!(messagesElement instanceof HTMLElement)) throw new Error("Không tìm thấy vùng hiển thị tin nhắn.");
  document.getElementById("welcomeCard")?.remove();

  const row = document.createElement("div");
  row.className = `message-row ${role}`;

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
    const speakButton = document.createElement("button");
    speakButton.className = "speak-message-button";
    speakButton.type = "button";
    speakButton.textContent = "Nghe phản hồi";
    speakButton.setAttribute("aria-label", "Nghe phản hồi của AI");
    speakButton.addEventListener("click", () => speakText(content));
    time.append(" · ", speakButton);
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

function speakText(text: string): void {
  if (!("speechSynthesis" in window)) {
    showToast("Trình duyệt này chưa hỗ trợ phát giọng nói.");
    return;
  }
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = languageSelect instanceof HTMLSelectElement && languageSelect.value === "Japanese"
    ? "ja-JP"
    : "en-US";
  utterance.rate = 0.92;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
}

function setComposerEnabled(enabled: boolean): void {
  if (messageInput instanceof HTMLTextAreaElement) messageInput.disabled = !enabled;
  if (sendButton instanceof HTMLButtonElement) sendButton.disabled = !enabled;
  const recordButton = document.getElementById("recordButton");
  if (recordButton instanceof HTMLButtonElement) recordButton.disabled = !enabled;
}

function updateVoiceStatus(message: string): void {
  const status = document.getElementById("recordingStatus");
  const hint = document.getElementById("visualizerHint");
  if (status) status.textContent = message;
  if (hint) hint.textContent = message;
}

function finishVoicePractice(): void {
  const transcript = finalTranscript.trim();
  finalTranscript = "";
  if (!transcript || !(messageInput instanceof HTMLTextAreaElement)) {
    updateVoiceStatus("Chưa nhận được giọng nói. Hãy thử nói rõ hơn hoặc nhập tin nhắn.");
    return;
  }

  messageInput.value = transcript;
  void sendMessage(undefined, true);
}

async function startVoicePractice(): Promise<void> {
  if (!activeConversation) {
    showToast("Hãy bắt đầu buổi luyện tập trước khi nói với AI.");
    return;
  }
  const speechWindow = window as SpeechRecognitionWindow;
  const SpeechRecognitionConstructor =
    speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;
  if (!SpeechRecognitionConstructor) {
    updateVoiceStatus("Trình duyệt chưa hỗ trợ nhận diện giọng nói. Bạn vẫn có thể nhập tin nhắn.");
    showToast("Hãy dùng Chrome hoặc Edge để luyện nói bằng giọng nói.");
    return;
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    updateVoiceStatus("Không thể truy cập micro. Hãy mở trang bằng HTTPS hoặc localhost.");
    showToast("Trình duyệt không cấp quyền truy cập micro.");
    return;
  }

  const recordButton = document.getElementById("recordButton");
  const stopButton = document.getElementById("stopRecordingButton");
  const uploadButton = document.getElementById("uploadAudioButton");
  const audioPreview = document.getElementById("audioPreview");
  try {
    microphoneStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    finalTranscript = "";
    pendingAudio = null;
    recordedAudioChunks = [];
    if (pendingAudioUrl) URL.revokeObjectURL(pendingAudioUrl);
    pendingAudioUrl = null;
    if (audioPreview instanceof HTMLAudioElement) {
      audioPreview.pause();
      audioPreview.removeAttribute("src");
      audioPreview.hidden = true;
    }
    if (uploadButton instanceof HTMLButtonElement) uploadButton.disabled = true;

    if (typeof MediaRecorder !== "undefined") {
      const supportedType = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"]
        .find((type) => MediaRecorder.isTypeSupported(type));
      mediaRecorder = supportedType
        ? new MediaRecorder(microphoneStream, { mimeType: supportedType })
        : new MediaRecorder(microphoneStream);
      mediaRecorder.addEventListener("dataavailable", (event: BlobEvent) => {
        if (event.data.size > 0) recordedAudioChunks.push(event.data);
      });
      mediaRecorder.addEventListener("stop", () => {
        const recording = new Blob(recordedAudioChunks, {
          type: mediaRecorder?.mimeType || "audio/webm",
        });
        if (recording.size > 0) {
          pendingAudio = recording;
          pendingAudioUrl = URL.createObjectURL(recording);
          if (audioPreview instanceof HTMLAudioElement) {
            audioPreview.src = pendingAudioUrl;
            audioPreview.hidden = false;
          }
          if (uploadButton instanceof HTMLButtonElement) uploadButton.disabled = false;
        }
        microphoneStream?.getTracks().forEach((track) => track.stop());
        microphoneStream = null;
      });
      mediaRecorder.start();
    }

    speechRecognition = new SpeechRecognitionConstructor();
    speechRecognition.lang = languageSelect instanceof HTMLSelectElement && languageSelect.value === "Japanese"
      ? "ja-JP"
      : "en-US";
    speechRecognition.continuous = true;
    speechRecognition.interimResults = true;
    speechRecognition.onresult = (event) => {
      let interim = "";
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const phrase = result[0]?.transcript || "";
        if (result.isFinal) finalTranscript += `${phrase} `;
        else interim += phrase;
      }
      updateVoiceStatus(interim || "Đang nghe… hãy nói tự nhiên bằng ngôn ngữ đã chọn.");
    };
    speechRecognition.onerror = (event) => {
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        stopVoicePractice();
        showToast("Bạn chưa cấp quyền micro cho trang web.");
      } else if (event.error !== "no-speech" && event.error !== "aborted") {
        showToast(`Không nhận diện được giọng nói (${event.error}).`);
      }
    };
    speechRecognition.onend = () => {
      if (isVoiceRecording) {
        window.setTimeout(() => {
          if (isVoiceRecording) {
            try {
              speechRecognition?.start();
            } catch {
              updateVoiceStatus("Đang khởi động lại nhận diện giọng nói…");
            }
          }
        }, 200);
        return;
      }
      finishVoicePractice();
    };

    isVoiceRecording = true;
    recordingSeconds = 0;
    const timer = document.getElementById("recordingTimer");
    if (timer) timer.textContent = "00:00";
    recordingTimer = window.setInterval(() => {
      recordingSeconds += 1;
      if (timer) {
        const minutes = Math.floor(recordingSeconds / 60).toString().padStart(2, "0");
        const seconds = (recordingSeconds % 60).toString().padStart(2, "0");
        timer.textContent = `${minutes}:${seconds}`;
      }
      if (recordingSeconds >= 60) stopVoicePractice();
    }, 1000);
    if (recordButton instanceof HTMLButtonElement) {
      recordButton.disabled = true;
      recordButton.classList.add("recording");
      recordButton.setAttribute("aria-pressed", "true");
    }
    if (stopButton instanceof HTMLButtonElement) stopButton.disabled = false;
    document.querySelector(".room-frame")?.classList.add("is-recording");
    const roomStatus = document.getElementById("roomStatus");
    if (roomStatus) roomStatus.textContent = "Đang nghe";
    updateVoiceStatus("Đang nghe… hãy nói tự nhiên bằng ngôn ngữ đã chọn.");
    speechRecognition.start();
  } catch (error) {
    isVoiceRecording = false;
    window.clearInterval(recordingTimer);
    recordingTimer = 0;
    if (mediaRecorder?.state === "recording") mediaRecorder.stop();
    microphoneStream?.getTracks().forEach((track) => track.stop());
    microphoneStream = null;
    if (recordButton instanceof HTMLButtonElement) {
      recordButton.disabled = false;
      recordButton.classList.remove("recording");
      recordButton.setAttribute("aria-pressed", "false");
    }
    if (stopButton instanceof HTMLButtonElement) stopButton.disabled = true;
    document.querySelector(".room-frame")?.classList.remove("is-recording");
    const message = error instanceof Error && error.name === "NotAllowedError"
      ? "Bạn chưa cấp quyền micro cho trang web."
      : "Không thể bắt đầu ghi âm. Hãy kiểm tra micro rồi thử lại.";
    updateVoiceStatus(message);
    showToast(message);
  }
}

function stopVoicePractice(): void {
  if (!isVoiceRecording) return;
  isVoiceRecording = false;
  window.clearInterval(recordingTimer);
  recordingTimer = 0;
  try {
    speechRecognition?.stop();
  } catch {
    finishVoicePractice();
  }
  if (mediaRecorder?.state === "recording") mediaRecorder.stop();
  else {
    microphoneStream?.getTracks().forEach((track) => track.stop());
    microphoneStream = null;
  }
  const recordButton = document.getElementById("recordButton");
  const stopButton = document.getElementById("stopRecordingButton");
  if (recordButton instanceof HTMLButtonElement) {
    recordButton.disabled = !activeConversation;
    recordButton.classList.remove("recording");
    recordButton.setAttribute("aria-pressed", "false");
  }
  if (stopButton instanceof HTMLButtonElement) stopButton.disabled = true;
  document.querySelector(".room-frame")?.classList.remove("is-recording");
  const roomStatus = document.getElementById("roomStatus");
  if (roomStatus) roomStatus.textContent = "Chờ bắt đầu";
  updateVoiceStatus("Đã dừng micro. Tin nhắn nhận diện sẽ được gửi cho AI.");
}

async function uploadAudioRecording(): Promise<void> {
  if (!activeConversation || !pendingAudio) return;
  const button = document.getElementById("uploadAudioButton");
  if (button instanceof HTMLButtonElement) button.disabled = true;

  try {
    const formData = new FormData();
    formData.append("conversation_id", activeConversation.id);
    formData.append("audio", pendingAudio, "voice-recording");
    const send = (token: string) => fetch(`${API_BASE_URL}/api/v1/chat-ai/upload-audio`, {
      method: "POST",
      headers: {       Authorization: `Bearer ${accessToken}`, },
      body: formData,
    });

    let accessToken = localStorage.getItem(ACCESS_TOKEN_KEY);
    if (!accessToken) throw new ChatApiError("Vui lòng đăng nhập để tải bản ghi lên.", 401);
    let response = await send(accessToken);
    if (response.status === 401) {
      accessToken = await refreshAccessToken();
      response = await send(accessToken);
    }
    await parseResponse<{ storage_path: string }>(response);
    pendingAudio = null;
    showToast("Đã tải bản ghi âm lên hội thoại.");
    updateVoiceStatus("Bản ghi đã được lưu vào hội thoại.");
  } catch (error) {
    if (button instanceof HTMLButtonElement) button.disabled = false;
    showToast(error instanceof Error ? error.message : "Không thể tải bản ghi lên.");
  }
}

async function startConversation(event?: SubmitEvent): Promise<void> {
  event?.preventDefault();
  if (!(languageSelect instanceof HTMLSelectElement) || !(topicInput instanceof HTMLInputElement)) return;

  const button = conversationForm?.querySelector<HTMLButtonElement>("button[type=submit]");
  if (button) button.disabled = true;
  try {
    const result = await apiRequest<Conversation>("/api/v1/chat-ai/conversations", {
      title: topicInput.value.trim(),
      language_code: languageSelect.value,
    });
    activeConversation = result.data;
    const title = document.getElementById("conversationTitle");
    const language = document.getElementById("conversationLanguage");
    if (title) title.textContent = activeConversation.title;
    if (language) {
      language.textContent = activeConversation.language_code === "English"
        ? "Luyện tập bằng tiếng Anh"
        : "Luyện tập bằng tiếng Nhật";
    }
    const practiceTitle = document.getElementById("practiceTitle");
    const practiceSubtitle = document.getElementById("practiceSubtitle");
    const roomStatus = document.getElementById("roomStatus");
    const roomStatusBadge = document.getElementById("roomStatusBadge");
    if (practiceTitle) practiceTitle.textContent = activeConversation.title;
    if (practiceSubtitle) practiceSubtitle.textContent = "Gửi tin nhắn hoặc bật micro để luyện hội thoại.";
    if (roomStatus) roomStatus.textContent = "Đã sẵn sàng";
    if (roomStatusBadge) roomStatusBadge.textContent = "Đã sẵn sàng";

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
    setComposerEnabled(true);
    if (roomStatusBadge) roomStatusBadge.textContent = "Conversation ready";
    if (messageInput instanceof HTMLTextAreaElement) messageInput.focus();
  } catch (error) {
    showToast(error instanceof Error ? error.message : "Không thể tạo phòng trò chuyện.");
  } finally {
    if (button) button.disabled = false;
  }
}

async function sendMessage(event?: SubmitEvent, speakResponse = false): Promise<void> {
  event?.preventDefault();
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
    pendingReply.remove();
    addMessage("assistant", result.data.ai_response, result.data.ai_feedback);
    if (speakResponse) speakText(result.data.ai_response);
  } catch (error) {
    pendingReply.remove();
    messageInput.value = userMessage;
    showToast(error instanceof Error ? error.message : "Không thể gửi tin nhắn.");
  } finally {
    sendButton.disabled = !activeConversation;
    messageInput.focus();
  }
}

function initialize(): void {
  const accessToken = localStorage.getItem(ACCESS_TOKEN_KEY);
  if (!accessToken) {
    authOverlay?.removeAttribute("hidden");
    return;
  }

  const name = localStorage.getItem("slanguage_user_name") || "Học viên";
  const email = localStorage.getItem("slanguage_user_email") || "Tài khoản của bạn";
  const profileName = document.getElementById("profileName");
  const profileEmail = document.getElementById("profileEmail");
  const profileAvatar = document.getElementById("profileAvatar");
  const loginLink = document.getElementById("chatLoginLink");
  if (loginLink instanceof HTMLAnchorElement) loginLink.hidden = true;
  if (profileName) profileName.textContent = name;
  if (profileEmail) profileEmail.textContent = email;
  if (profileAvatar) profileAvatar.textContent = name.slice(0, 1).toUpperCase();

  conversationForm?.addEventListener("submit", (event) => void startConversation(event));
  messageForm?.addEventListener("submit", (event) => void sendMessage(event));
  document.getElementById("recordButton")?.addEventListener("click", () => void startVoicePractice());
  document.getElementById("stopRecordingButton")?.addEventListener("click", stopVoicePractice);
  document.getElementById("uploadAudioButton")?.addEventListener("click", () => void uploadAudioRecording());
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
    window.speechSynthesis?.cancel();
    microphoneStream?.getTracks().forEach((track) => track.stop());
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    localStorage.removeItem("slanguage_is_logged_in");
    window.location.assign("../login/index.html");
  });

  window.addEventListener("pagehide", () => {
    window.clearInterval(recordingTimer);
    window.speechSynthesis?.cancel();
    microphoneStream?.getTracks().forEach((track) => track.stop());
  });
}

document.addEventListener("DOMContentLoaded", initialize);
