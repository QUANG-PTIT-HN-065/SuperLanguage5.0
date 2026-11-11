import { initializeLearnerHeader } from "../shared/learner-header";

interface ApiResponse<T> {
  status: string;
  message: string;
  data: T;
  error: unknown;
}

interface Conversation {
  id: string;
  title: string;
  language_code: "English" | "Japanese" | "en" | "ja";
  created_at: string | null;
  updated_at?: string | null;
}

interface ConversationMessage {
  id: string;
  conversation_id: string;
  sender_type: "user" | "ai";
  content: string;
  ai_feedback: string | null;
  created_at: string | null;
}

interface ChatMessage {
  conversation_id: string;
  user_message: string;
  ai_response: string;
  ai_feedback: string | null;
}

interface SpeechRecognitionAlternative {
  readonly transcript: string;
}

interface SpeechRecognitionResult extends ArrayLike<SpeechRecognitionAlternative> {
  readonly isFinal: boolean;
}

interface SpeechRecognitionResultList extends ArrayLike<SpeechRecognitionResult> {}

interface SpeechRecognitionEvent extends Event {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent extends Event {
  readonly error: string;
}

interface SpeechRecognition extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}

interface SpeechRecognitionConstructor {
  new (): SpeechRecognition;
}

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
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
const topicPreset = document.getElementById("topicPreset");
const topicInput = document.getElementById("topicInput");
const toastElement = document.getElementById("toast");
const authOverlay = document.getElementById("authOverlay");
const historyList = document.getElementById("conversationHistory");
const historyStatus = document.getElementById("historyStatus");
const assistantStatus = document.getElementById("assistantStatus");
const voiceButton = document.getElementById("voiceButton");
const voiceButtonLabel = voiceButton?.querySelector("span");
const voiceStatus = document.getElementById("voiceStatus");

let activeConversation: Conversation | null = null;
let conversationHistory: Conversation[] = [];
let isSendingMessage = false;
let isLoadingConversation = false;
let isVoiceRecording = false;
let speechRecognition: SpeechRecognition | null = null;
let toastTimer = 0;

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

  const headers = new Headers({ "Content-Type": "application/json" });
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
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
    return parseResponse<T>(retry);
  }
  return parseResponse<T>(response);
}

async function apiGet<T>(path: string, allowRefresh = true): Promise<ApiResponse<T>> {
  const accessToken = localStorage.getItem(ACCESS_TOKEN_KEY);
  if (!accessToken) throw new ChatApiError("Vui lòng đăng nhập để sử dụng AI Conversation.", 401);

  const send = (token: string) => fetch(`${API_BASE_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  let response = await send(accessToken);
  if (response.status === 401 && allowRefresh) {
    response = await send(await refreshAccessToken());
  }
  return parseResponse<T>(response);
}

function addMessage(
  role: "user" | "assistant",
  content: string,
  feedback?: string | null,
  createdAt?: string | null,
): HTMLElement {
  if (!(messagesElement instanceof HTMLElement)) throw new Error("Không tìm thấy vùng hiển thị tin nhắn.");
  document.getElementById("welcomeCard")?.remove();

  const row = document.createElement("div");
  row.className = `message-row ${role}`;

  const avatar = document.createElement("div");
  avatar.className = `message-avatar ${role === "user" ? "user-avatar" : "assistant-avatar"}`;
  avatar.textContent =
    role === "assistant"
      ? "✦"
      : (localStorage.getItem("slanguage_user_name") || "B").trim().slice(0, 1).toUpperCase();
  avatar.setAttribute("aria-hidden", "true");
  row.append(avatar);

  const contentWrap = document.createElement("div");
  contentWrap.className = "message-content";
  const sender = document.createElement("span");
  sender.className = "message-sender";
  sender.textContent =
    role === "user"
      ? localStorage.getItem(ACCESS_TOKEN_KEY)
        ? localStorage.getItem("slanguage_user_name") || "Bạn"
        : "Bạn"
      : "Gia sư AI";
  contentWrap.append(sender);
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
    }).format(createdAt ? new Date(createdAt) : new Date());
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
    showToast("Trình duyệt không hỗ trợ phát giọng nói.");
    return;
  }

  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  const languageCode = activeConversation?.language_code;
  utterance.lang =
    languageCode === "Japanese" || languageCode === "ja" ? "ja-JP" : "en-US";
  window.speechSynthesis.speak(utterance);
}

function updateVoiceControls(recording: boolean, message: string): void {
  isVoiceRecording = recording;
  if (voiceButton instanceof HTMLButtonElement) {
    voiceButton.setAttribute("aria-pressed", String(recording));
    voiceButton.classList.toggle("is-recording", recording);
    voiceButton.disabled = recording
      ? false
      : !activeConversation || isSendingMessage || isLoadingConversation;
    if (voiceButtonLabel) {
      voiceButtonLabel.textContent = recording ? "Dừng nói" : "Nói với AI";
    }
    voiceButton.setAttribute(
      "aria-label",
      recording ? "Dừng nhận giọng nói" : "Bắt đầu nói với AI",
    );
  }
  if (voiceStatus instanceof HTMLElement) voiceStatus.textContent = message;
  if (messageInput instanceof HTMLTextAreaElement) {
    messageInput.disabled = recording || !activeConversation;
  }
  if (sendButton instanceof HTMLButtonElement) {
    sendButton.disabled = recording || !activeConversation || isSendingMessage;
  }
}

function startVoiceConversation(): void {
  if (isVoiceRecording) {
    speechRecognition?.stop();
    return;
  }
  if (!activeConversation) {
    showToast("Hãy bắt đầu hoặc mở một hội thoại trước khi nói với AI.");
    return;
  }

  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition) {
    showToast("Trình duyệt chưa hỗ trợ nhận diện giọng nói. Hãy dùng Chrome hoặc Edge mới nhất.");
    return;
  }

  const recognition = new Recognition();
  speechRecognition = recognition;
  recognition.lang =
    activeConversation.language_code === "Japanese" ||
    activeConversation.language_code === "ja"
      ? "ja-JP"
      : "en-US";
  recognition.continuous = false;
  recognition.interimResults = true;

  const originalDraft =
    messageInput instanceof HTMLTextAreaElement ? messageInput.value.trim() : "";
  let transcript = "";
  let recognitionMessage = "Nhấn “Nói với AI” rồi nói bằng ngôn ngữ đang luyện tập.";
  recognition.onresult = (event) => {
    const finalText: string[] = [];
    const interimText: string[] = [];
    for (let index = 0; index < event.results.length; index += 1) {
      const result = event.results[index];
      if (!result) continue;
      const text = result[0]?.transcript.trim();
      if (!text) continue;
      (result.isFinal ? finalText : interimText).push(text);
    }
    transcript = finalText.join(" ");

    if (messageInput instanceof HTMLTextAreaElement) {
      const currentTranscript = [...finalText, ...interimText].join(" ").trim();
      messageInput.value = [originalDraft, currentTranscript].filter(Boolean).join(" ");
    }
    if (voiceStatus instanceof HTMLElement) {
      const currentTranscript = [...finalText, ...interimText].join(" ");
      voiceStatus.textContent = currentTranscript
        ? `Đang nghe: ${currentTranscript}`
        : "Đang nghe bạn nói...";
    }
  };
  recognition.onerror = (event) => {
    if (event.error === "aborted") return;
    if (event.error === "no-speech") {
      recognitionMessage = "Chưa nhận được giọng nói. Hãy thử nói lại.";
      return;
    }
    const message =
      event.error === "not-allowed" || event.error === "service-not-allowed"
        ? "Bạn cần cấp quyền micro cho trình duyệt để nói với AI."
        : `Không thể nhận diện giọng nói (${event.error}). Vui lòng thử lại.`;
    recognitionMessage = message;
    showToast(message);
  };
  recognition.onend = () => {
    speechRecognition = null;
    updateVoiceControls(
      false,
      transcript ? "Đã nhận dạng lời nói; đang gửi tới AI..." : recognitionMessage,
    );
    const finalMessage = [originalDraft, transcript].filter(Boolean).join(" ").trim();
    if (transcript && messageInput instanceof HTMLTextAreaElement) {
      messageInput.value = finalMessage;
      void sendMessage(undefined, true);
    } else if (messageInput instanceof HTMLTextAreaElement) {
      messageInput.focus();
    }
  };

  updateVoiceControls(true, "Đang nghe bạn nói...");
  try {
    recognition.start();
  } catch (error) {
    speechRecognition = null;
    updateVoiceControls(false, "Không thể bật micro. Hãy kiểm tra quyền truy cập rồi thử lại.");
    showToast(error instanceof Error ? error.message : "Không thể bật micro.");
  }
}

function renderConversationHistory(): void {
  if (!(historyList instanceof HTMLElement) || !(historyStatus instanceof HTMLElement)) return;
  historyList.replaceChildren();

  if (conversationHistory.length === 0) {
    historyStatus.textContent = "Chưa có hội thoại nào được lưu.";
    return;
  }

  historyStatus.textContent = `${conversationHistory.length} hội thoại gần đây`;
  for (const conversation of conversationHistory) {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "history-item";
    if (conversation.id === activeConversation?.id) {
      item.setAttribute("aria-current", "true");
    }

    const title = document.createElement("strong");
    title.textContent = conversation.title;
    const details = document.createElement("span");
    const updatedAt = conversation.updated_at || conversation.created_at;
    const date = updatedAt ? new Date(updatedAt) : null;
    const formattedDate =
      date && !Number.isNaN(date.getTime())
        ? new Intl.DateTimeFormat("vi-VN", { dateStyle: "medium", timeStyle: "short" }).format(date)
        : "Chưa có thời gian";
    details.textContent = `${conversation.language_code === "Japanese" || conversation.language_code === "ja" ? "Tiếng Nhật" : "Tiếng Anh"} · ${formattedDate}`;
    item.append(title, details);
    item.addEventListener("click", () => void openConversation(conversation));
    historyList.append(item);
  }
}

async function loadConversationHistory(showError = false): Promise<void> {
  if (!(historyStatus instanceof HTMLElement)) return;
  if (!localStorage.getItem(ACCESS_TOKEN_KEY)) {
    conversationHistory = [];
    renderConversationHistory();
    historyStatus.textContent = "Đăng nhập để xem và lưu lịch sử hội thoại.";
    return;
  }

  historyStatus.textContent = "Đang tải lịch sử...";
  try {
    const result = await apiGet<Conversation[]>("/api/v1/chat-ai/conversations");
    if (!Array.isArray(result.data)) {
      throw new Error("Backend trả về danh sách hội thoại không hợp lệ.");
    }
    conversationHistory = result.data;
    renderConversationHistory();
  } catch (error) {
    historyStatus.textContent =
      error instanceof ChatApiError && error.status === 401
        ? "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại."
        : "Không thể tải lịch sử hội thoại.";
    if (error instanceof ChatApiError && error.status === 401) {
      const connectionStatus = document.getElementById("connectionStatus");
      const connectionLabel = document.getElementById("connectionLabel");
      if (connectionStatus) {
        connectionStatus.classList.remove("is-authenticated");
        connectionStatus.classList.add("is-guest");
        if (connectionLabel) connectionLabel.textContent = "Phiên đăng nhập hết hạn";
      }
    }
    if (showError) {
      showToast(error instanceof Error ? error.message : "Không thể tải lịch sử hội thoại.");
    }
  }
}

async function openConversation(conversation: Conversation): Promise<void> {
  if (isSendingMessage || isLoadingConversation || isVoiceRecording) {
    showToast("Hãy đợi thao tác hiện tại hoàn tất trước khi mở hội thoại khác.");
    return;
  }

  isLoadingConversation = true;
  setComposerEnabled(false);
  if (historyStatus instanceof HTMLElement) historyStatus.textContent = "Đang mở hội thoại...";
  try {
    const result = await apiGet<ConversationMessage[]>(
      `/api/v1/chat-ai/conversations/${encodeURIComponent(conversation.id)}/messages?limit=1000&offset=0`,
    );
    if (!Array.isArray(result.data)) {
      throw new Error("Backend trả về danh sách tin nhắn không hợp lệ.");
    }

    activeConversation = conversation;
    const title = document.getElementById("conversationTitle");
    const language = document.getElementById("conversationLanguage");
    if (title) title.textContent = conversation.title;
    if (language) {
      language.textContent =
        conversation.language_code === "Japanese" || conversation.language_code === "ja"
          ? "Luyện tập bằng tiếng Nhật"
          : "Luyện tập bằng tiếng Anh";
    }
    const roomStatus = document.getElementById("roomStatusBadge");
    if (roomStatus) roomStatus.textContent = "ĐANG LUYỆN TẬP";
    if (messagesElement instanceof HTMLElement) {
      messagesElement.replaceChildren();
      if (result.data.length === 0) {
        const welcome = document.createElement("div");
        welcome.className = "welcome-card";
        welcome.id = "welcomeCard";
        const heading = document.createElement("h2");
        heading.textContent = "Hội thoại chưa có tin nhắn";
        const description = document.createElement("p");
        description.textContent = "Gửi tin nhắn đầu tiên để bắt đầu luyện tập.";
        welcome.append(heading, description);
        messagesElement.append(welcome);
      } else {
        for (const message of result.data) {
          addMessage(
            message.sender_type === "ai" ? "assistant" : "user",
            message.content,
            message.ai_feedback,
            message.created_at,
          );
        }
      }
    }
    setComposerEnabled(true);
    renderConversationHistory();
    if (messageInput instanceof HTMLTextAreaElement) messageInput.focus();
  } catch (error) {
    setComposerEnabled(Boolean(activeConversation));
    if (historyStatus instanceof HTMLElement) {
      historyStatus.textContent = "Không thể mở hội thoại.";
    }
    showToast(error instanceof Error ? error.message : "Không thể mở hội thoại.");
  } finally {
    isLoadingConversation = false;
    setComposerEnabled(Boolean(activeConversation));
  }
}

function setComposerEnabled(enabled: boolean): void {
  updateVoiceControls(false, "Nhấn “Nói với AI” rồi nói bằng ngôn ngữ đang luyện tập.");
  if (messageInput instanceof HTMLTextAreaElement) messageInput.disabled = !enabled;
  if (sendButton instanceof HTMLButtonElement) sendButton.disabled = !enabled;
}

async function startConversation(event?: SubmitEvent): Promise<void> {
  event?.preventDefault();
  if (isSendingMessage || isLoadingConversation || isVoiceRecording) {
    showToast("Hãy đợi đến khi lượt luyện tập hiện tại kết thúc.");
    return;
  }
  if (!(languageSelect instanceof HTMLSelectElement) || !(topicInput instanceof HTMLInputElement)) return;
  const topic = topicInput.value.trim() ||
    (topicPreset instanceof HTMLSelectElement ? topicPreset.value : "");
  if (!topic) {
    showToast("Hãy chọn hoặc nhập chủ đề trước khi bắt đầu.");
    topicPreset instanceof HTMLSelectElement && topicPreset.focus();
    return;
  }

  const button = conversationForm?.querySelector<HTMLButtonElement>("button[type=submit]");
  if (button) button.disabled = true;
  try {
    const result = await apiRequest<Conversation>("/api/v1/chat-ai/conversations", {
      title: topic,
      language_code: languageSelect.value,
    });
    activeConversation = result.data;
    toastElement?.classList.remove("visible");
    const title = document.getElementById("conversationTitle");
    const language = document.getElementById("conversationLanguage");
    if (title) title.textContent = activeConversation.title;
    if (language) {
      language.textContent = activeConversation.language_code === "English"
        ? "Luyện tập bằng tiếng Anh"
        : "Luyện tập bằng tiếng Nhật";
    }
    const roomStatus = document.getElementById("roomStatusBadge");
    if (roomStatus) roomStatus.textContent = "ĐANG LUYỆN TẬP";

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
    await loadConversationHistory();
    if (messageInput instanceof HTMLTextAreaElement) messageInput.focus();
  } catch (error) {
    showToast(error instanceof Error ? error.message : "Không thể tạo phòng trò chuyện.");
  } finally {
    if (button) button.disabled = false;
  }
}

async function sendMessage(event?: SubmitEvent, speakResponse = false): Promise<void> {
  event?.preventDefault();
  if (
    isSendingMessage ||
    isLoadingConversation ||
    !(messageInput instanceof HTMLTextAreaElement) ||
    !(sendButton instanceof HTMLButtonElement)
  ) return;
  const userMessage = messageInput.value.trim();
  if (!userMessage || !activeConversation) return;

  isSendingMessage = true;
  if (voiceButton instanceof HTMLButtonElement) voiceButton.disabled = true;
  addMessage("user", userMessage);
  messageInput.value = "";
  messageInput.style.height = "auto";
  sendButton.disabled = true;
  const pendingReply = addMessage("assistant", "Đang soạn phản hồi...");
  pendingReply.classList.add("is-typing");
  if (assistantStatus) assistantStatus.hidden = false;

  try {
    const result = await apiRequest<ChatMessage>("/api/v1/chat-ai/send-message", {
      conversation_id: activeConversation.id,
      user_message: userMessage,
    });
    pendingReply.remove();
    addMessage("assistant", result.data.ai_response, result.data.ai_feedback);
    if (speakResponse) speakText(result.data.ai_response);
    void loadConversationHistory();
  } catch (error) {
    pendingReply.remove();
    messageInput.value = userMessage;
    showToast(error instanceof Error ? error.message : "Không thể gửi tin nhắn.");
  } finally {
    isSendingMessage = false;
    if (assistantStatus) assistantStatus.hidden = true;
    sendButton.disabled = !activeConversation;
    if (voiceButton instanceof HTMLButtonElement) voiceButton.disabled = !activeConversation;
    messageInput.focus();
  }
}

function initialize(): void {
  const isAuthenticated = Boolean(localStorage.getItem(ACCESS_TOKEN_KEY));
  const accountNote = document.getElementById("accountNote");
  const connectionStatus = document.getElementById("connectionStatus");
  const connectionLabel = document.getElementById("connectionLabel");
  if (!isAuthenticated) {
    if (connectionStatus) {
      connectionStatus.classList.add("is-guest");
      if (connectionLabel) connectionLabel.textContent = "Đăng nhập để lưu lịch sử";
    }
  } else {
    if (accountNote) accountNote.hidden = true;
    if (connectionStatus) {
      connectionStatus.classList.add("is-authenticated");
      if (connectionLabel) connectionLabel.textContent = "Đã kết nối";
    }
  }

  void initializeLearnerHeader();
  conversationForm?.addEventListener("submit", (event) => void startConversation(event));
  topicPreset?.addEventListener("change", () => {
    if (topicPreset instanceof HTMLSelectElement && topicInput instanceof HTMLInputElement) {
      topicInput.value = topicPreset.value;
    }
  });
  document.getElementById("refreshHistory")?.addEventListener("click", () => void loadConversationHistory(true));
  voiceButton?.addEventListener("click", startVoiceConversation);
  messageForm?.addEventListener("submit", (event) => void sendMessage(event));
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
  void loadConversationHistory();
}

document.addEventListener("DOMContentLoaded", initialize);
