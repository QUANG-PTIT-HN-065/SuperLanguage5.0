interface AuthResponse {
  access_token: string;
  refresh_token: string;
  user: {
    id: string;
    email: string;
    display_name: string | null;
    role: string;
  };
}

interface RefreshResponse {
  access_token: string;
  refresh_token: string;
}

export interface AdminProfile {
  email: string;
  displayName: string | null;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000").replace(/\/+$/, "");
const ACCESS_TOKEN_KEY = "superlanguage.admin.accessToken";
const REFRESH_TOKEN_KEY = "superlanguage.admin.refreshToken";

async function postJson<T>(path: string, body: unknown, accessToken?: string): Promise<T> {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const payload: unknown = await response.json();

  if (!response.ok) {
    const detail =
      typeof payload === "object" &&
      payload !== null &&
      "detail" in payload &&
      typeof payload.detail === "string"
        ? payload.detail
        : undefined;
    throw new ApiError(
      detail || `Backend trả về lỗi HTTP ${response.status}.`,
      response.status,
    );
  }

  return payload as T;
}

function saveTokens(tokens: RefreshResponse): void {
  sessionStorage.setItem(ACCESS_TOKEN_KEY, tokens.access_token);
  sessionStorage.setItem(REFRESH_TOKEN_KEY, tokens.refresh_token);
}

function clearTokens(): void {
  sessionStorage.removeItem(ACCESS_TOKEN_KEY);
  sessionStorage.removeItem(REFRESH_TOKEN_KEY);
}

function goToLogin(): void {
  window.location.assign(new URL("../LoginAdmin/", window.location.href).toString());
}

export async function loginAdmin(email: string, password: string): Promise<void> {
  const result = await postJson<AuthResponse>("/api/v1/auth/admin/login", { email, password });

  if (!result.access_token || !result.refresh_token || result.user?.role !== "admin") {
    throw new Error("Backend không xác nhận được quyền quản trị viên.");
  }

  saveTokens(result);
}

async function fetchCurrentProfile(accessToken: string): Promise<Response> {
  return fetch(`${API_BASE_URL}/api/v1/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

export async function requireAdminSession(): Promise<AdminProfile | null> {
  let accessToken = sessionStorage.getItem(ACCESS_TOKEN_KEY);
  const refreshToken = sessionStorage.getItem(REFRESH_TOKEN_KEY);

  if (!accessToken || !refreshToken) {
    clearTokens();
    goToLogin();
    return null;
  }

  let response = await fetchCurrentProfile(accessToken);

  if (response.status === 401) {
    let refreshed: RefreshResponse;
    try {
      refreshed = await postJson<RefreshResponse>("/api/v1/auth/refresh", {
        refresh_token: refreshToken,
      });
    } catch (error) {
      if (!(error instanceof ApiError) || (error.status !== 401 && error.status !== 403)) {
        throw error;
      }
      clearTokens();
      goToLogin();
      return null;
    }

    if (!refreshed.access_token || !refreshed.refresh_token) {
      throw new Error("Backend không trả về token mới.");
    }
    saveTokens(refreshed);
    accessToken = refreshed.access_token;
    response = await fetchCurrentProfile(accessToken);
  }

  if (response.status === 401 || response.status === 403) {
    clearTokens();
    goToLogin();
    return null;
  }
  if (!response.ok) {
    throw new ApiError(`Không thể xác thực với backend (HTTP ${response.status}).`, response.status);
  }

  const result: unknown = await response.json();
  if (
    typeof result !== "object" ||
    result === null ||
    !("profile" in result) ||
    typeof result.profile !== "object" ||
    result.profile === null ||
    !("role" in result.profile) ||
    typeof result.profile.role !== "string" ||
    result.profile.role !== "admin" ||
    !("email" in result.profile) ||
    typeof result.profile.email !== "string" ||
    !("display_name" in result.profile) ||
    (typeof result.profile.display_name !== "string" && result.profile.display_name !== null)
  ) {
    clearTokens();
    goToLogin();
    return null;
  }

  return {
    email: result.profile.email,
    displayName: result.profile.display_name,
  };
}

export async function logoutAdmin(): Promise<void> {
  const accessToken = sessionStorage.getItem(ACCESS_TOKEN_KEY);
  try {
    if (accessToken) {
      await postJson<{ status: string }>("/api/v1/auth/logout", {}, accessToken);
    }
  } finally {
    clearTokens();
    goToLogin();
  }
}
