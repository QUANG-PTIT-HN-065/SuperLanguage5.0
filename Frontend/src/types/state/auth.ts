/* ============================================================
   Slanguage · state/auth.ts
   Route guard: chưa có token -> về /login.
   Trong lúc kiểm tra, body ở state "loading" nên chỉ skeleton
   hiện ra, nội dung thật chưa render -> không nháy chữ.
   ============================================================ */

export const ACCESS_TOKEN_KEY = "slanguage_access_token";
export const REFRESH_TOKEN_KEY = "slanguage_refresh_token";

export type PageState = "loading" | "ready" | "blocked";

const LOGIN_PATH = "/src/pages/login/index.html";
const SESSION_KEYS = [
  ACCESS_TOKEN_KEY,
  REFRESH_TOKEN_KEY,
  "slanguage_active_language",
  "slanguage_user_id",
  "slanguage_user_name",
  "slanguage_user_email",
  "slanguage_is_logged_in",
];

export function getToken(): string | null {
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function isSignedIn(): boolean {
  return Boolean(getToken());
}

export function clearSession(): void {
  for (const key of SESSION_KEYS) localStorage.removeItem(key);
}

export function setPageState(state: PageState): void {
  document.body.dataset.pageState = state;
}

export function currentRoute(): string {
  return `${location.pathname}${location.search}`;
}

export function redirectToLogin(): void {
  location.replace(`${LOGIN_PATH}?redirect=${encodeURIComponent(currentRoute())}`);
}

export function logout(): void {
  clearSession();
  location.assign(LOGIN_PATH);
}

/**
 * Guard đồng bộ, chạy sớm nhất có thể.
 * true  -> tiếp tục tải dữ liệu rồi mở nội dung (setPageState("ready")).
 * false -> đã chuyển hướng, caller phải dừng render.
 */
export function requireAuth(): boolean {
  if (isSignedIn()) return true;
  setPageState("blocked");
  redirectToLogin();
  return false;
}
