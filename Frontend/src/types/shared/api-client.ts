/**
 * slanguage-api-client.ts
 * Learner API client — tái sử dụng pattern từ login.ts và chat.ts.
 * - Dùng localStorage token (slanguage_access_token / slanguage_refresh_token)
 * - Gửi Authorization: Bearer cho các API cần đăng nhập
 * - Tự động refresh token khi nhận 401
 * - Không tạo endpoint mới; chỉ gọi endpoint đã có trong backend
 */

const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000"
).replace(/\/+$/, "");

const ACCESS_TOKEN_KEY = "slanguage_access_token";
const REFRESH_TOKEN_KEY = "slanguage_refresh_token";

export interface SlanguageApiErrorOptions {
  message: string;
  status: number;
}

export class SlanguageApiError extends Error {
  public readonly status: number;

  constructor({ message, status }: SlanguageApiErrorOptions) {
    super(message);
    this.name = "SlanguageApiError";
    this.status = status;
  }
}

export interface ApiRequestOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  requiresAuth?: boolean;
  allowRefresh?: boolean;
}

export interface LearnerProfile {
  id: string | null;
  email: string | null;
  name: string | null;
  isLoggedIn: boolean;
  activeLanguage: string;
  dailyGoal: number;
  xp: number;
}

async function parseJson(response: Response): Promise<unknown> {
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response.ok) {
    const detail =
      payload && typeof payload === "object" && "detail" in payload
        ? (payload as { detail: unknown }).detail
        : `Backend trả về lỗi HTTP ${response.status}.`;
    throw new SlanguageApiError({
      message:
        typeof detail === "string"
          ? detail
          : `Backend trả về lỗi HTTP ${response.status}.`,
      status: response.status,
    });
  }
  return payload;
}

async function refreshAccessToken(): Promise<string> {
  const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
  if (!refreshToken) {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    localStorage.removeItem("slanguage_is_logged_in");
    throw new SlanguageApiError({
      message: "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.",
      status: 401,
    });
  }

  const response = await fetch(`${API_BASE_URL}/api/v1/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });

  if (response.status === 401) {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    localStorage.removeItem("slanguage_is_logged_in");
    throw new SlanguageApiError({
      message: "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.",
      status: 401,
    });
  }

  const result = (await parseJson(response)) as {
    data?: { access_token?: string; refresh_token?: string };
  };
  if (!result.data || !result.data.access_token) {
    throw new SlanguageApiError({
      message: "Backend không trả về phiên đăng nhập mới.",
      status: 401,
    });
  }

  localStorage.setItem(ACCESS_TOKEN_KEY, result.data.access_token);
  if (result.data.refresh_token) {
    localStorage.setItem(REFRESH_TOKEN_KEY, result.data.refresh_token);
  }
  return result.data.access_token;
}

/**
 * Gọi API cho người học (learner).
 * options.method: GET | POST | PUT | DELETE
 * options.body: dữ liệu JSON (được serialize tự động)
 * options.requiresAuth: mặc định true
 */
export async function slanguageApi(
  path: string,
  options: ApiRequestOptions = {}
): Promise<unknown> {
  const { method = "GET", body, requiresAuth = true, allowRefresh = true } =
    options;

  const headers = new Headers();
  if (body !== undefined) headers.set("Content-Type", "application/json");

  let accessToken: string | null = null;
  if (requiresAuth) {
    accessToken = localStorage.getItem(ACCESS_TOKEN_KEY);
    if (!accessToken) {
      throw new SlanguageApiError({
        message: "Vui lòng đăng nhập để sử dụng chức năng này.",
        status: 401,
      });
    }
    headers.set("Authorization", `Bearer ${accessToken}`);
  }

  const send = (token: string | null) => {
    const h = new Headers(headers);
    if (token) h.set("Authorization", `Bearer ${token}`);
    return fetch(`${API_BASE_URL}${path}`, {
      method,
      headers: h,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  };

  let response = await send(accessToken);

  if (response.status === 401 && allowRefresh && accessToken) {
    try {
      const refreshed = await refreshAccessToken();
      response = await send(refreshed);
    } catch (err) {
      throw err;
    }
  }

  if (response.status === 401 || response.status === 403) {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    localStorage.removeItem("slanguage_is_logged_in");
    throw new SlanguageApiError({
      message: "Bạn không có quyền truy cập chức năng này.",
      status: response.status,
    });
  }

  return parseJson(response);
}

/**
 * Kiểm tra người học đã đăng nhập hay chưa (dựa trên localStorage)
 */
export function isLearnerAuthenticated(): boolean {
  return Boolean(localStorage.getItem(ACCESS_TOKEN_KEY));
}

/**
 * Lấy thông tin người học từ localStorage (đã lưu khi đăng ký/đăng nhập)
 */
export function getLearnerProfile(): LearnerProfile {
  return {
    id: localStorage.getItem("slanguage_user_id") || null,
    email: localStorage.getItem("slanguage_user_email") || null,
    name: localStorage.getItem("slanguage_user_name") || null,
    isLoggedIn: localStorage.getItem("slanguage_is_logged_in") === "true",
    activeLanguage: localStorage.getItem("slanguage_active_language") || "en",
    dailyGoal: parseInt(
      localStorage.getItem("slanguage_daily_goal") || "30",
      10
    ),
    xp: parseInt(localStorage.getItem("slanguage_user_xp") || "0", 10),
  };
}

/**
 * Đăng xuất người học
 */
export async function logoutLearner(): Promise<void> {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem("slanguage_is_logged_in");
  localStorage.removeItem("slanguage_user_id");
  localStorage.removeItem("slanguage_user_email");
  localStorage.removeItem("slanguage_user_name");
  localStorage.removeItem("slanguage_active_language");
  localStorage.removeItem("slanguage_daily_goal");
  localStorage.removeItem("slanguage_user_xp");
  window.location.assign("../../login/index.html");
}
