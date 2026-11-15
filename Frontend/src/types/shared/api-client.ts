import {
  ACCESS_TOKEN_KEY,
  REFRESH_TOKEN_KEY,
  clearSession,
  redirectToLogin,
} from "../state/auth.js";

const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000"
).replace(/\/+$/, "");

export interface AuthTokens {
  access_token: string;
  refresh_token: string;
}

export interface ApiResponse<T = unknown> {
  status: string;
  message: string;
  data: T;
}

interface ApiRequestOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
  anonymous?: boolean;
}

let expirationTimer: number | null = null;
let isExpiringSession = false;

function getErrorMessage(payload: unknown, status: number): string {
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

async function parseResponse<T>(response: Response): Promise<ApiResponse<T>> {
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
  isExpiringSession = false;
  scheduleSessionExpiry(tokens.access_token);
}

export function clearAuthTokens(): void {
  if (expirationTimer !== null && typeof window !== "undefined") {
    window.clearTimeout(expirationTimer);
  }
  expirationTimer = null;
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
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

function tokenExpiry(token: string): number | null {
  try {
    const encodedPayload = token.split(".")[1];
    if (!encodedPayload) return null;
    const base64 = encodedPayload.replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "=")));
    return typeof payload.exp === "number" ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

function scheduleSessionExpiry(token: string): void {
  if (typeof window === "undefined") return;
  if (expirationTimer !== null) window.clearTimeout(expirationTimer);

  const expiresAt = tokenExpiry(token);
  if (expiresAt === null) return;

  const delay = Math.max(0, expiresAt - Date.now());
  expirationTimer = window.setTimeout(() => {
    if (localStorage.getItem(ACCESS_TOKEN_KEY) !== token) return;
    if (Date.now() < expiresAt) {
      scheduleSessionExpiry(token);
      return;
    }
    expireLearnerSession();
  }, Math.min(delay, 2_147_000_000));
}

function expireLearnerSession(): void {
  if (isExpiringSession) return;
  isExpiringSession = true;

  const accessToken = localStorage.getItem(ACCESS_TOKEN_KEY);
  const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
  if (accessToken) {
    const headers = new Headers({ "Content-Type": "application/json" });
    headers.set("Authorization", `Bearer ${accessToken}`);
    void fetch(`${API_BASE_URL}/api/v1/auth/logout`, {
      method: "POST",
      headers,
      body: JSON.stringify(refreshToken ? { refresh_token: refreshToken } : {}),
      keepalive: true,
    }).then((response) => {
      if (!response.ok) {
        console.error(`Session revocation failed with HTTP ${response.status}.`);
      }
    }).catch(() => {
      console.error("Could not reach the auth service to revoke the session.");
    });
  }

  clearSession();
  expirationTimer = null;
  redirectToLogin();
}

if (typeof window !== "undefined") {
  const currentToken = localStorage.getItem(ACCESS_TOKEN_KEY);
  if (currentToken) scheduleSessionExpiry(currentToken);
}

const MOCK_BASE_URL = "/mock";

/** Đọc một file mock có cùng dạng BaseResponse của backend. */
export async function readMockData<T = unknown>(
  file: string,
  select?: (data: unknown) => unknown,
): Promise<T> {
  const response = await fetch(`${MOCK_BASE_URL}/${file}`, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error("Không tải được dữ liệu mẫu của trang học tập.");
  }
  const payload = (await response.json()) as ApiResponse<unknown>;
  if (typeof payload?.status !== "string" || !("data" in payload)) {
    throw new Error("Dữ liệu mẫu không đúng định dạng BaseResponse.");
  }
  return (select ? select(payload.data) : payload.data) as T;
}

/** Gọi API thật; chỉ rơi về mock khi backend không reachable (lỗi mạng). */
export async function slanguageApiOrMock<T = unknown>(
  path: string,
  file: string,
  options: ApiRequestOptions & { onFallback?: () => void } = {},
  select?: (data: unknown) => unknown,
): Promise<T> {
  const { onFallback, ...requestOptions } = options;
  try {
    const response = await slanguageApi<T>(path, requestOptions);
    return response.data;
  } catch (error) {
    if (!(error instanceof TypeError)) throw error;
    onFallback?.();
    return readMockData<T>(file, select);
  }
}

function isFormData(value: unknown): value is FormData {
  return typeof FormData !== "undefined" && value instanceof FormData;
}

export async function slanguageApi<T = unknown>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<ApiResponse<T>> {
  const { anonymous = false, ...requestOptions } = options;
  const token = anonymous ? null : localStorage.getItem(ACCESS_TOKEN_KEY);
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

  if (response.status === 401 && token && !anonymous) {
    expireLearnerSession();
    throw new Error("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.");
  }
  return parseResponse<T>(response);
}
