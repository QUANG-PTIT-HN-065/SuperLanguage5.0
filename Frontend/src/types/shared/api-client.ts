const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000"
).replace(/\/+$/, "");

const ACCESS_TOKEN_KEY = "slanguage_access_token";
const REFRESH_TOKEN_KEY = "slanguage_refresh_token";

export interface ApiResponse<T = unknown> {
  status: string;
  message: string;
  data: T;
}

interface ApiRequestOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
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
  localStorage.setItem(ACCESS_TOKEN_KEY, result.data.access_token);
  localStorage.setItem(REFRESH_TOKEN_KEY, result.data.refresh_token);
  return result.data.access_token;
}

export async function slanguageApi<T = unknown>(
  path: string,
  options: ApiRequestOptions = {},
  allowRefresh = true,
): Promise<ApiResponse<T>> {
  const token = localStorage.getItem(ACCESS_TOKEN_KEY);
  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  if (response.status === 401 && allowRefresh && token) {
    const refreshedToken = await refreshAccessToken();
    return slanguageApi<T>(
      path,
      {
        ...options,
        headers: { ...options.headers, Authorization: `Bearer ${refreshedToken}` },
      },
      false,
    );
  }
  return parseResponse<T>(response);
}
