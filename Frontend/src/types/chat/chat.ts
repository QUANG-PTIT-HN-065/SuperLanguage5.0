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

function setComposerEnabled(enabled: boolean): void {
  if (messageInput instanceof HTMLTextAreaElement) messageInput.disabled = !enabled;
  if (sendButton instanceof HTMLButtonElement) sendButton.disabled = !enabled;
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

    if (messagesElement) {
      messagesElement.replaceChildren();
      const welcome = document.createElement("div");
      welcome.className = "welcome-card";
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
    if (messageInput instanceof HTMLTextAreaElement) messageInput.focus();
  } catch (error) {
    showToast(error instanceof Error ? error.message : "Không thể tạo phòng trò chuyện.");
  } finally {
    if (button) button.disabled = false;
  }
}

async function sendMessage(event: SubmitEvent): Promise<void> {
  event.preventDefault();
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
  if (profileName) profileName.textContent = name;
  if (profileEmail) profileEmail.textContent = email;
  if (profileAvatar) profileAvatar.textContent = name.slice(0, 1).toUpperCase();

  conversationForm?.addEventListener("submit", (event) => void startConversation(event));
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
  document.getElementById("logoutButton")?.addEventListener("click", () => {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    localStorage.removeItem("slanguage_is_logged_in");
    window.location.assign("../login/index.html");
  });
}

document.addEventListener("DOMContentLoaded", initialize);
