export const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL ||
  import.meta.env.VITE_API_URL ||
  "http://127.0.0.1:8000"
).replace(/\/+$/, "");

const ACCESS_TOKEN_KEY = "slanguage_access_token";
const REFRESH_TOKEN_KEY = "slanguage_refresh_token";
const IDENTITY_KEYS = [
  "slanguage_is_logged_in",
  "slanguage_user_id",
  "slanguage_user_name",
  "slanguage_user_email",
] as const;
const AUTH_COOKIE_KEYS = [ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY, ...IDENTITY_KEYS];
const AUTH_COOKIE_MAX_AGE_S = 7 * 24 * 60 * 60;

const LOGIN_PAGE_URL = "../login/index.html";
const SESSION_EXPIRED_MESSAGE = "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.";
// Trang công khai (không ép đăng nhập) + trang quản trị tự quản phiên riêng
const PUBLIC_PAGE_DIRS = [
  "/login/",
  "/register/",
  "/forgot-password/",
  "/verify-otp/",
  "/select-language/",
  "/terms/",
  "/minigame/",
  "/LoginAdmin/",
  "/dasboardAdmin/",
  "/vocabularyAdmin/",
];

function readAuthCookie(name: string): string | null {
  const prefix = `${name}=`;
  for (const part of document.cookie.split(";")) {
    const cookie = part.trim();
    if (cookie.startsWith(prefix)) {
      const raw = cookie.slice(prefix.length);
      try {
        return decodeURIComponent(raw);
      } catch {
        return raw;
      }
    }
  }
  return null;
}

function writeAuthCookie(name: string, value: string): void {
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${AUTH_COOKIE_MAX_AGE_S}; SameSite=Lax`;
}

export function setAuthCookie(name: string, value: string): void {
  writeAuthCookie(name, value);
}

export function removeAuthCookie(name: string): void {
  document.cookie = `${name}=; path=/; max-age=0; SameSite=Lax`;
}

export function getAuthCookie(name: string): string | null {
  return readAuthCookie(name);
}

// Phiên cũ (trước khi chuyển sang cookie) vẫn nằm trong localStorage →
// nâng cấp một lần rồi xoá để không còn hai nguồn sự thật.
function migrateLegacyAuthStorage(): void {
  for (const key of AUTH_COOKIE_KEYS) {
    const legacy = localStorage.getItem(key);
    if (legacy === null) continue;
    if (!readAuthCookie(key)) writeAuthCookie(key, legacy);
    localStorage.removeItem(key);
  }
}
migrateLegacyAuthStorage();

let sessionExpiryPopupShown = false;

export interface AuthTokens {
  access_token: string;
  refresh_token: string;
}

export interface ApiResponse<T = unknown> {
  status: string;
  message: string;
  data: T;
}

export interface ApiRequestOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
  anonymous?: boolean;
}

export function getErrorMessage(payload: unknown, status: number): string {
  if (typeof payload === "object" && payload !== null && "detail" in payload) {
    const detail = payload.detail;
    if (typeof detail === "string" && detail.trim()) return detail.trim();
    if (Array.isArray(detail)) {
      const messages = detail
        .map((item) =>
          typeof item === "object" && item !== null && "msg" in item
            ? String(item.msg)
            : String(item),
        )
        .filter(Boolean);
      if (messages.length) return messages.join("; ");
    }
  }
  return `Backend trả về lỗi HTTP ${status}.`;
}

export async function parseResponse<T>(response: Response): Promise<ApiResponse<T>> {
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error(`Backend trả về phản hồi không hợp lệ (HTTP ${response.status}).`);
  }

  if (!response.ok) {
    throw new Error(getErrorMessage(payload, response.status));
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

export function isLearnerAuthenticated(): boolean {
  return Boolean(localStorage.getItem(ACCESS_TOKEN_KEY));
}

export function saveAuthTokens(tokens: AuthTokens): void {
  if (!tokens.access_token || !tokens.refresh_token) {
    throw new Error("Backend không trả về phiên đăng nhập hợp lệ.");
  }
  localStorage.setItem(ACCESS_TOKEN_KEY, tokens.access_token);
  localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refresh_token);
}

export function clearAuthTokens(): void {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
}

// Key giữ lại khi đăng xuất: email cho tính năng "Ghi nhớ đăng nhập".
const KEEP_ON_LOGOUT_KEYS = new Set(["slanguage_remembered_email"]);

// Quét sạch dữ liệu học tập/cache trên thiết bị (kể cả key có hậu tố động
// như lesson_last_score_38) — thu thập trước rồi mới xoá để không lệch index.
export function clearLearnerCache(): void {
  const stale: string[] = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (key?.startsWith("slanguage_") && !KEEP_ON_LOGOUT_KEYS.has(key)) stale.push(key);
  }
  for (const key of stale) localStorage.removeItem(key);
}

export function saveLearnerIdentity(user: {
  id?: string;
  email: string;
  display_name?: string | null;
}): void {
  localStorage.setItem("slanguage_is_logged_in", "true");
  if (user.id) localStorage.setItem("slanguage_user_id", user.id);
  localStorage.setItem("slanguage_user_name", user.display_name || user.email);
  localStorage.setItem("slanguage_user_email", user.email);
}

function isPublicAuthPage(): boolean {
  const path = window.location.pathname;
  return PUBLIC_PAGE_DIRS.some((dir) => path.includes(dir));
}

function redirectToLoginPage(): void {
  window.location.replace(LOGIN_PAGE_URL);
}

export function handleSessionExpired(): void {
  clearAuthTokens();
  clearLearnerCache();
  localStorage.removeItem("slanguage_is_logged_in");
  localStorage.removeItem("slanguage_user_id");
  localStorage.removeItem("slanguage_user_name");
  localStorage.removeItem("slanguage_user_email");
  if (sessionExpiryPopupShown) return;
  sessionExpiryPopupShown = true;
  showSessionExpiredModal();
}

function showSessionExpiredModal(): void {
  if (document.getElementById("slanguage-session-expired-overlay")) return;
  const overlay = document.createElement("div");
  overlay.id = "slanguage-session-expired-overlay";
  overlay.setAttribute("role", "alertdialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.style.cssText =
    "position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;background:rgba(2,6,23,0.72);backdrop-filter:blur(6px);font-family:'Be Vietnam Pro','Segoe UI',system-ui,sans-serif;";
  overlay.innerHTML = `
    <div style="background:#ffffff;border-radius:18px;max-width:420px;width:calc(100% - 40px);padding:30px 26px 26px;text-align:center;box-shadow:0 24px 64px rgba(2,6,23,0.45);">
      <div style="width:64px;height:64px;margin:0 auto;border-radius:50%;background:#fee2e2;display:flex;align-items:center;justify-content:center;">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#dc2626" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><polyline points="12 7 12 12 15.5 14"></polyline></svg>
      </div>
      <h3 style="margin:14px 0 8px;font-size:1.15rem;color:#0f172a;">Phiên đăng nhập đã hết hạn</h3>
      <p style="margin:0 0 20px;color:#475569;font-size:0.92rem;line-height:1.55;">Hệ thống đã tự động đăng xuất để bảo mật tài khoản của bạn. Vui lòng đăng nhập lại để tiếp tục học tập.</p>
      <button type="button" id="slanguage-session-relogin-btn" style="width:100%;padding:12px 16px;border:none;border-radius:10px;background:linear-gradient(135deg,#0077B6 0%,#00B4D8 100%);color:#ffffff;font-size:0.98rem;font-weight:600;cursor:pointer;">Đăng nhập lại</button>
    </div>`;
  document.body.appendChild(overlay);
  document.body.style.overflow = "hidden";
  overlay
    .querySelector("#slanguage-session-relogin-btn")
    ?.addEventListener("click", redirectToLoginPage);
}

export async function refreshAccessToken(previousAccessToken?: string): Promise<string> {
  const baselineToken = previousAccessToken ?? localStorage.getItem(ACCESS_TOKEN_KEY);
  // Nhiều request song song có thể cùng gặp 401; request nào refresh xong trước
  // sẽ lưu token mới — request sau dùng lại thay vì POST trùng hoặc kết luận
  // nhầm phiên đã chết (Supabase xoay refresh token, lần gọi sau có thể bị chặn).
  const newerSavedToken = (): string | null => {
    const current = localStorage.getItem(ACCESS_TOKEN_KEY);
    return current && current !== baselineToken ? current : null;
  };

  const savedByParallelCall = newerSavedToken();
  if (savedByParallelCall) return savedByParallelCall;

  const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
  if (!refreshToken) {
    handleSessionExpired();
    throw new Error(SESSION_EXPIRED_MESSAGE);
  }

  const response = await fetch(`${API_BASE_URL}/api/v1/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  if (response.status === 401 || response.status === 403) {
    // Refresh token cũng đã chết/thu hồi: phiên không thể cứu, đăng xuất bắt buộc
    const savedByParallelCallAfterFailure = newerSavedToken();
    if (savedByParallelCallAfterFailure) return savedByParallelCallAfterFailure;
    handleSessionExpired();
    throw new Error(SESSION_EXPIRED_MESSAGE);
  }
  const result = await parseResponse<{
    access_token: string;
    refresh_token: string;
  }>(response);

  if (!result.data.access_token || !result.data.refresh_token) {
    throw new Error("Backend không trả về phiên đăng nhập mới.");
  }
  saveAuthTokens(result.data);
  return result.data.access_token;
}

function isFormData(value: unknown): value is FormData {
  return typeof FormData !== "undefined" && value instanceof FormData;
}

function isJwtExpiringSoon(token: string, bufferMs = 30_000): boolean {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return false;
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
    const payload = JSON.parse(atob(padded)) as { exp?: unknown };
    if (typeof payload.exp !== "number") return false;
    return Date.now() >= payload.exp * 1000 - bufferMs;
  } catch {
    return false;
  }
}

export async function getValidAccessToken(): Promise<string | null> {
  const token = localStorage.getItem(ACCESS_TOKEN_KEY);
  if (!token) return null;
  if (!isJwtExpiringSoon(token)) return token;
  return refreshAccessToken(token);
}

export async function slanguageApi<T = unknown>(
  path: string,
  options: ApiRequestOptions = {},
  allowRefresh = true,
): Promise<ApiResponse<T>> {
  const { anonymous = false, ...requestOptions } = options;
  const token = anonymous ? null : await getValidAccessToken();
  const headers = new Headers(requestOptions.headers);
  if (isFormData(requestOptions.body)) headers.delete("Content-Type");
  else headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...requestOptions,
    headers,
    body:
      requestOptions.body === undefined
        ? undefined
        : isFormData(requestOptions.body)
          ? requestOptions.body
          : JSON.stringify(requestOptions.body),
  });

  if (response.status === 401 && !anonymous) {
    if (!token) {
      handleSessionExpired();
      throw new Error(SESSION_EXPIRED_MESSAGE);
    }
    if (allowRefresh) {
      const refreshedToken = await refreshAccessToken(token);
      return slanguageApi<T>(
        path,
        {
          ...requestOptions,
          headers: { ...requestOptions.headers, Authorization: `Bearer ${refreshedToken}` },
        },
        false,
      );
    }
  }
  return parseResponse<T>(response);
}

export async function slanguageApiAudio(
  path: string,
  body?: unknown,
  method: "POST" | "GET" = "POST",
): Promise<Blob> {
  const token = await getValidAccessToken();
  const send = (accessToken: string | null) => {
    const headers = new Headers({ Accept: "audio/*" });
    if (method === "POST") headers.set("Content-Type", "application/json");
    if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
    return fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      body: method === "POST" ? JSON.stringify(body) : undefined,
    });
  };

  let response = await send(token);
  if (response.status === 401 && token) {
    response = await send(await refreshAccessToken(token));
  }
  if (!response.ok) {
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new Error(`Backend trả về lỗi HTTP ${response.status}.`);
    }
    throw new Error(getErrorMessage(payload, response.status));
  }

  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.startsWith("audio/")) {
    throw new Error("Backend trả về dữ liệu giọng đọc không hợp lệ.");
  }

  const audio = await response.blob();
  if (!audio.size) throw new Error("Backend trả về file giọng đọc trống.");
  return audio;
}

export interface StreamChatEvent {
  type: "chunk" | "done" | "error";
  delta?: string;
  ai_response?: string;
  ai_feedback?: string | null;
  message?: string;
}

export async function slanguageApiStream(
  path: string,
  body: unknown,
  onEvent: (event: StreamChatEvent) => void,
  allowRefresh = true,
): Promise<void> {
  const token = await getValidAccessToken();
  const headers = new Headers({
    "Content-Type": "application/json",
    Accept: "text/event-stream",
  });
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (response.status === 401) {
    if (!token) {
      handleSessionExpired();
      throw new Error(SESSION_EXPIRED_MESSAGE);
    }
    if (allowRefresh) {
      await refreshAccessToken(token);
      return slanguageApiStream(path, body, onEvent, false);
    }
  }

  if (!response.ok) {
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new Error(`Backend trả về lỗi HTTP ${response.status}.`);
    }
    throw new Error(getErrorMessage(payload, response.status));
  }

  if (!response.body) {
    throw new Error("Trình duyệt không hỗ trợ đọc luồng phản hồi.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let sepIndex = buffer.indexOf("\n\n");
    while (sepIndex !== -1) {
      const block = buffer.slice(0, sepIndex);
      buffer = buffer.slice(sepIndex + 2);
      for (const line of block.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const jsonText = trimmed.slice(5).trim();
        if (!jsonText) continue;
        const parsed = JSON.parse(jsonText) as StreamChatEvent;
        onEvent(parsed);
      }
      sepIndex = buffer.indexOf("\n\n");
    }
  }
}

// Trang learner luôn import api-client trước khi chạy logic riêng, nên dùng
// thời điểm import để chặn truy cập trang protected khi đã mất phiên.
if (
  window.location.pathname.includes("/src/pages/") &&
  !isPublicAuthPage() &&
  !isLearnerAuthenticated()
) {
  redirectToLoginPage();
}

// Back/bfcache khôi phục trang protected từ bộ nhớ đệm mà không chạy lại JS
// (token đã bị xóa khi hết phiên) → đưa về login, không cho quay lại trang cũ.
window.addEventListener("pageshow", (event) => {
  if (!(event as PageTransitionEvent).persisted) return;
  if (isLearnerAuthenticated() || isPublicAuthPage()) return;
  redirectToLoginPage();
});
