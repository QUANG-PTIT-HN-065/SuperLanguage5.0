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

interface ApiResponse<T> {
  status: string;
  message: string;
  data: T;
  error: unknown;
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

export class ForbiddenError extends Error {
  constructor(
    message: string = "Bạn không có quyền quản trị viên (Admin) để truy cập trang này.",
    readonly userEmail?: string,
    readonly currentRole?: string,
  ) {
    super(message);
    this.name = "ForbiddenError";
  }
}

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000").replace(/\/+$/, "");
const ACCESS_TOKEN_KEY = "superlanguage.admin.accessToken";
const REFRESH_TOKEN_KEY = "superlanguage.admin.refreshToken";

function extractApiErrorMessage(payload: unknown, status: number): string {
  if (typeof payload === "object" && payload !== null && "detail" in payload) {
    const detail = (payload as { detail: unknown }).detail;
    if (typeof detail === "string" && detail.trim()) {
      return detail.trim();
    }
    if (Array.isArray(detail)) {
      const messages = detail.map((item) => {
        if (typeof item === "object" && item !== null) {
          const locArr = Array.isArray((item as Record<string, unknown>).loc)
            ? ((item as Record<string, unknown>).loc as unknown[])
            : [];
          const field = locArr.filter((x) => x !== "body").join(".");
          const msg = String((item as Record<string, unknown>).msg || "");
          return field ? `${field}: ${msg}` : msg;
        }
        return String(item);
      }).filter(Boolean);
      if (messages.length > 0) {
        return messages.join("; ");
      }
    }
  }
  return `Backend trả về lỗi HTTP ${status}.`;
}

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
    throw new ApiError(extractApiErrorMessage(payload, response.status), response.status);
  }

  return payload as T;
}

export async function adminApi<T>(
  path: string,
  options: { method?: "GET" | "POST" | "PUT" | "DELETE"; body?: unknown } = {},
): Promise<T> {
  let accessToken = sessionStorage.getItem(ACCESS_TOKEN_KEY);
  if (!accessToken) {
    clearTokens();
    goToLogin();
    throw new ApiError("Phiên quản trị đã hết hạn.", 401);
  }

  const send = (token: string): Promise<Response> => {
    const headers = new Headers({ Authorization: `Bearer ${token}` });
    if (options.body !== undefined && !(options.body instanceof FormData)) {
      headers.set("Content-Type", "application/json");
    }
    return fetch(`${API_BASE_URL}${path}`, {
      method: options.method ?? "GET",
      headers,
      body: options.body instanceof FormData
        ? options.body
        : options.body === undefined
          ? undefined
          : JSON.stringify(options.body),
    });
  };

  let response = await send(accessToken);
  if (response.status === 401) {
    const refreshToken = sessionStorage.getItem(REFRESH_TOKEN_KEY);
    if (!refreshToken) {
      clearTokens();
      goToLogin();
      throw new ApiError("Phiên quản trị đã hết hạn.", 401);
    }

    try {
      const refreshed = await postJson<RefreshResponse>("/api/v1/auth/refresh", {
        refresh_token: refreshToken,
      });
      if (!refreshed.access_token || !refreshed.refresh_token) {
        throw new Error("Backend không trả về token mới.");
      }
      saveTokens(refreshed);
      accessToken = refreshed.access_token;
      response = await send(accessToken);
    } catch (error) {
      if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
        clearTokens();
        goToLogin();
      }
      if (error instanceof Error) throw error;
      throw new ApiError("Không thể làm mới phiên quản trị.", 401);
    }
  }

  if (response.status === 401 || response.status === 403) {
    clearTokens();
    goToLogin();
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    payload = undefined;
  }
  if (!response.ok) {
    throw new ApiError(extractApiErrorMessage(payload, response.status), response.status);
  }
  return payload as T;
}

function saveTokens(tokens: RefreshResponse): void {
  sessionStorage.setItem(ACCESS_TOKEN_KEY, tokens.access_token);
  sessionStorage.setItem(REFRESH_TOKEN_KEY, tokens.refresh_token);
}

export function clearTokens(): void {
  sessionStorage.removeItem(ACCESS_TOKEN_KEY);
  sessionStorage.removeItem(REFRESH_TOKEN_KEY);
}

export function goToLogin(): void {
  window.location.assign(new URL("../LoginAdmin/code.html", window.location.href).toString());
}

export async function loginAdmin(email: string, password: string): Promise<void> {
  const response = await postJson<ApiResponse<AuthResponse>>(
    "/api/v1/auth/admin/login",
    { email, password },
  );
  const result = response.data;

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

/**
 * Hiển thị màn hình 403 Forbidden nếu người dùng không phải admin
 */
export function showAccessDeniedScreen(options?: { email?: string; role?: string }): void {
  const appContainer = document.getElementById("dashboardApp") || document.getElementById("vocabApp");
  if (appContainer) {
    appContainer.setAttribute("hidden", "");
    appContainer.style.display = "none";
  }

  const statusEl = document.getElementById("authStatus");
  if (statusEl) {
    statusEl.setAttribute("hidden", "");
    statusEl.style.display = "none";
  }

  let deniedEl = document.getElementById("accessDeniedScreen");
  if (!deniedEl) {
    deniedEl = document.createElement("div");
    deniedEl.id = "accessDeniedScreen";
    document.body.prepend(deniedEl);
  }

  deniedEl.removeAttribute("hidden");
  deniedEl.style.display = "flex";
  deniedEl.className = "fixed inset-0 z-[100] bg-slate-950 text-white flex items-center justify-center p-4 antialiased";

  const emailInfo = options?.email
    ? `<div class="mt-2.5 inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-900 border border-slate-800 text-xs font-mono text-slate-300">
         <span class="w-2 h-2 rounded-full bg-rose-500 animate-pulse"></span>
         <span>${options.email}</span>
         <span class="text-slate-500">|</span>
         <span class="text-rose-400 font-bold uppercase">${options.role || "learner"}</span>
       </div>`
    : "";

  deniedEl.innerHTML = `
    <div class="max-w-md w-full bg-slate-900/95 border border-slate-800 rounded-3xl p-8 text-center shadow-2xl backdrop-blur-2xl relative overflow-hidden">
      <!-- Glow ambient -->
      <div class="absolute -top-20 -left-20 w-44 h-44 bg-rose-600/20 rounded-full blur-3xl pointer-events-none"></div>
      <div class="absolute -bottom-20 -right-20 w-44 h-44 bg-indigo-600/20 rounded-full blur-3xl pointer-events-none"></div>

      <div class="w-16 h-16 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-400 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-rose-500/10">
        <span class="material-symbols-outlined text-4xl">gpp_maybe</span>
      </div>

      <div class="inline-block px-3 py-0.5 rounded-full bg-rose-500/20 text-rose-300 text-[11px] font-bold tracking-wider uppercase mb-2">
        403 - Cấm Truy Cập (Forbidden)
      </div>

      <h1 class="text-2xl font-bold tracking-tight text-white mb-2 font-title">Từ Chối Quyền Truy Cập</h1>
      
      <p class="text-xs sm:text-sm text-slate-300 leading-relaxed">
        Khu vực Quản trị Hệ thống (Admin Portal) chỉ dành riêng cho tài khoản có vai trò <strong class="text-indigo-400 font-bold">admin</strong>.
      </p>

      ${emailInfo}

      <div class="mt-6 p-3.5 bg-slate-950/60 rounded-2xl border border-slate-800/80 text-xs text-slate-400 text-left space-y-2">
        <div class="flex items-start gap-2">
          <span class="material-symbols-outlined text-rose-400 text-base shrink-0">block</span>
          <span>Tài khoản của bạn chỉ là <strong>Người học (Learner)</strong>, không có thẩm quyền truy cập hay chỉnh sửa dữ liệu quản trị.</span>
        </div>
        <div class="flex items-start gap-2">
          <span class="material-symbols-outlined text-emerald-400 text-base shrink-0">security</span>
          <span>Hệ thống đã khóa truy cập để bảo vệ an toàn cơ sở dữ liệu.</span>
        </div>
      </div>

      <div class="mt-6 space-y-2.5">
        <a href="../LoginAdmin/code.html" class="w-full py-3 px-4 rounded-xl bg-linear-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-600 text-white font-semibold text-xs flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/30 transition-all cursor-pointer">
          <span class="material-symbols-outlined text-base">login</span>
          <span>Đăng nhập tài khoản Quản trị viên</span>
        </a>

        <a href="../login/index.html" class="w-full py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-medium text-xs flex items-center justify-center gap-2 transition-all">
          <span class="material-symbols-outlined text-base">school</span>
          <span>Quay lại Cổng học viên</span>
        </a>

        <a href="../../../index.html" class="block text-center text-xs text-slate-400 hover:text-slate-200 pt-1 transition-colors">
          Về Trang chủ SuperLanguage
        </a>
      </div>
    </div>
  `;
}

/**
 * Kiểm tra phiên làm việc Quản trị viên:
 * 1. Bắt buộc có Token hợp lệ
 * 2. Bắt buộc profile.role === "admin"
 * Nếu không phải admin -> CHẶN NGAY và hiển thị 403 Access Denied
 */
export async function requireAdminSession(): Promise<AdminProfile | null> {
  const accessToken = sessionStorage.getItem(ACCESS_TOKEN_KEY);
  const refreshToken = sessionStorage.getItem(REFRESH_TOKEN_KEY);

  if (!accessToken || !refreshToken) {
    clearTokens();
    goToLogin();
    return null;
  }

  let response: Response;
  try {
    response = await fetchCurrentProfile(accessToken);
  } catch {
    clearTokens();
    goToLogin();
    return null;
  }

  if (response.status === 401) {
    try {
      const refreshResponse = await postJson<ApiResponse<RefreshResponse>>("/api/v1/auth/refresh", {
        refresh_token: refreshToken,
      });
      const refreshed = refreshResponse.data;
      if (!refreshed || !refreshed.access_token || !refreshed.refresh_token) {
        throw new Error("Không thể cấp mới token.");
      }
      saveTokens(refreshed);
      response = await fetchCurrentProfile(refreshed.access_token);
    } catch {
      clearTokens();
      goToLogin();
      return null;
    }
  }

  if (response.status === 401 || response.status === 403) {
    clearTokens();
    goToLogin();
    return null;
  }

  if (!response.ok) {
    throw new ApiError(`Không thể xác thực với backend (HTTP ${response.status}).`, response.status);
  }

  let result: unknown;
  try {
    result = await response.json();
  } catch {
    clearTokens();
    goToLogin();
    return null;
  }

  const meData =
    typeof result === "object" && result !== null && "data" in result
      ? result.data
      : result;

  if (
    typeof meData !== "object" ||
    meData === null ||
    !("profile" in meData) ||
    typeof meData.profile !== "object" ||
    meData.profile === null
  ) {
    clearTokens();
    goToLogin();
    return null;
  }

  const profile = meData.profile as Record<string, unknown>;
  const userRole = typeof profile.role === "string" ? profile.role : "";
  const userEmail = typeof profile.email === "string" ? profile.email : "";
  const displayName = typeof profile.display_name === "string" ? profile.display_name : null;

  // CHẶN QUYỀN TRUY CẬP VỚI NGƯỜI DÙNG KHÔNG PHẢI ADMIN
  if (userRole !== "admin") {
    clearTokens();
    showAccessDeniedScreen({ email: userEmail, role: userRole });
    throw new ForbiddenError(
      `Tài khoản "${userEmail}" chỉ có vai trò "${userRole}". Yêu cầu quyền admin để truy cập.`,
      userEmail,
      userRole
    );
  }

  return {
    email: userEmail,
    displayName,
  };
}

export async function logoutAdmin(): Promise<void> {
  const accessToken = sessionStorage.getItem(ACCESS_TOKEN_KEY);
  try {
    if (accessToken) {
      await postJson<ApiResponse<null>>("/api/v1/auth/logout", {}, accessToken);
    }
  } finally {
    clearTokens();
    goToLogin();
  }
}
