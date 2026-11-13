const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000"
).replace(/\/+$/, "");

const ACCESS_TOKEN_KEY = "slanguage_access_token";
const REFRESH_TOKEN_KEY = "slanguage_refresh_token";

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
}

export function clearAuthTokens(): void {
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

async function refreshAccessToken(): Promise<string> {
  const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
  if (!refreshToken) {
    throw new Error("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.");
  }

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
  saveAuthTokens(result.data);
  return result.data.access_token;
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
  allowRefresh = true,
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

  if (response.status === 401 && allowRefresh && token && !anonymous) {
    const refreshedToken = await refreshAccessToken();
    return slanguageApi<T>(
      path,
      {
        ...requestOptions,
        headers: { ...requestOptions.headers, Authorization: `Bearer ${refreshedToken}` },
      },
      false,
    );
  }
  return parseResponse<T>(response);
}
