import { clearAuthTokens, clearLearnerCache, isLearnerAuthenticated, slanguageApi } from "./api-client";
import { formatHeartLock, heartLockRemainingMs, isHeartsLocked, readHearts } from "./hearts";
import { showToast } from "../ui/toast";

interface LearnerHeaderOptions {
  loadProfile?: boolean;
  bindControls?: boolean;
}

interface LanguageOption {
  label: string;
  flag: string;
}

const languages: Record<string, LanguageOption> = {
  en: {
    label: "Tiếng Anh",
    flag: new URL("../../../assets/flags/flag-en.png", import.meta.url).href,
  },
  ja: {
    label: "Tiếng Nhật",
    flag: new URL("../../../assets/flags/flag-jp.png", import.meta.url).href,
  },
  vi: {
    label: "Tiếng Việt",
    flag: new URL("../../../assets/flags/flag-vn.png", import.meta.url).href,
  },
};

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function count(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0;
}

function updateLanguageDisplay(languageCode: string): void {
  const language = languages[languageCode];
  const label = language?.label || languageCode.toUpperCase() || "Chưa chọn";
  const currentLabel = document.getElementById("currentLangLabel");
  const currentFlag = document.getElementById("currentLangFlag");
  if (currentLabel) currentLabel.textContent = label;
  if (currentFlag instanceof HTMLImageElement && language) {
    currentFlag.src = language.flag;
    currentFlag.alt = label;
  }
  document.querySelectorAll<HTMLButtonElement>(".lang-dropdown-item, .menu-item[data-lang]").forEach((item) => {
    const selected = item.dataset.lang === languageCode;
    item.classList.toggle("active", selected);
    item.classList.toggle("is-selected", selected);
    if (selected) item.setAttribute("aria-current", "true");
    else item.removeAttribute("aria-current");
  });
}

function initialsAvatar(name: string): string {
  const initials = (
    name.trim().split(/\s+/).slice(-2).map((part) => part.charAt(0).toUpperCase()).join("") || "SL"
  ).replace(/[&<>"]/g, "");
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='96' height='96'>` +
    `<defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>` +
    `<stop offset='0' stop-color='#0077B6'/><stop offset='1' stop-color='#7AE2CF'/>` +
    `</linearGradient></defs>` +
    `<rect width='96' height='96' fill='url(#g)'/>` +
    `<text x='48' y='62' font-family='sans-serif' font-size='36' font-weight='700' fill='#ffffff' text-anchor='middle'>${initials}</text>` +
    `</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function renderLearnerHeader(payload: unknown): void {
  const data = asRecord(payload);
  const profile = asRecord(data.profile);
  const stats = asRecord(data.stats);
  const plan = asRecord(data.plan);
  const name = text(profile.display_name, text(profile.username, "Học viên"));
  const email = text(profile.email, "Tài khoản học viên");
  const languageCode = text(profile.target_language);
  const xp = count(stats.xp_total);
  const streak = count(stats.current_streak);
  const maxHearts = count(plan.max_hearts) || 5;
  const hearts = Math.min(readHearts(), maxHearts);

  document.querySelectorAll<HTMLElement>(".user-info-text .name, [data-learner-name]").forEach((element) => {
    element.textContent = name;
  });
  document.querySelectorAll<HTMLElement>(".user-info-text .role").forEach((element) => {
    element.textContent = text(profile.role) === "admin" ? "Quản trị viên" : "Học viên";
  });
  const emailElement = document.querySelector<HTMLElement>("[data-learner-email], #profileEmail");
  if (emailElement) emailElement.textContent = email;

  const xpElement = document.getElementById("headerXPVal")
    || document.getElementById("studyXp")
    || document.getElementById("vocabularyXp");
  if (xpElement) {
    xpElement.textContent = xpElement.closest(".hud-chip--xp")
      ? xp.toLocaleString("vi-VN")
      : `${xp.toLocaleString("vi-VN")} XP`;
  }
  document.querySelectorAll<HTMLElement>("[data-learner-streak], .stat-chip.streak span").forEach((element) => {
    element.textContent = element.closest(".hud-chip--streak")
      ? String(streak)
      : `${streak} Ngày`;
  });
  document.querySelectorAll<HTMLElement>("#headerHeartsVal, .stat-chip.hearts span").forEach((element) => {
    element.textContent = `${hearts}/${maxHearts}`;
    const chip = element.closest<HTMLElement>(".hud-chip, .stat-chip") || element;
    chip.title = isHeartsLocked()
      ? `Hết máu — sinh lực khóa hồi 24 giờ, còn ${formatHeartLock(heartLockRemainingMs())}`
      : `Sinh lực: ${hearts}/${maxHearts}`;
  });

  const avatarUrl = text(profile.avatar_url);
  const avatarSrc = avatarUrl.startsWith("https://") ? avatarUrl : initialsAvatar(name);
  document.querySelectorAll<HTMLImageElement>(".user-avatar-mini, #headerAvatar, #profileAvatarImg").forEach((img) => {
    img.src = avatarSrc;
  });
  updateLanguageDisplay(languageCode);

  localStorage.setItem("slanguage_user_name", name);
  localStorage.setItem("slanguage_user_email", email);
  localStorage.setItem("slanguage_user_xp", String(xp));
  if (languageCode) localStorage.setItem("slanguage_active_language", languageCode);

  maybeWarnStreakExpiring(payload);
}

function showHeaderMessage(message: string): void {
  const element = document.getElementById("headerProfileMessage");
  if (!element) {
    window.alert(message);
    return;
  }
  element.textContent = message;
  element.hidden = false;
}

const STREAK_WARN_HOUR = 20;

function maybeWarnStreakExpiring(payload: unknown): void {
  const stats = asRecord(asRecord(payload).stats);
  if (count(stats.current_streak) <= 0 || stats.studied_today === true) return;
  const now = new Date();
  if (now.getHours() < STREAK_WARN_HOUR) return;
  const todayKey = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
  if (localStorage.getItem("slanguage_streak_warn_date") === todayKey) return;
  localStorage.setItem("slanguage_streak_warn_date", todayKey);
  showToast({
    type: "info",
    duration: 9000,
    message: "Chuỗi học tập của bạn sắp hết hãy chủ động học tập hôm nay hoặc có thể sử dụng vật phẩm đóng băng để giữ chuỗi học tập",
  });
}

async function changeLearningLanguage(languageCode: string, button: HTMLButtonElement): Promise<void> {
  if (!isLearnerAuthenticated()) return;
  button.disabled = true;
  try {
    const response = await slanguageApi("/api/v1/me", {
      method: "PATCH",
      body: { target_language: languageCode },
    });
    renderLearnerHeader(response.data);
    window.location.reload();
  } catch (error) {
    showHeaderMessage(error instanceof Error ? error.message : "Không thể cập nhật ngôn ngữ.");
  } finally {
    button.disabled = false;
  }
}

export async function logoutLearner(): Promise<void> {
  // Thu hồi phiên phía Supabase trước khi xóa token; keepalive để request kịp
  // hoàn thành dù trang điều hướng ngay tới trang đăng nhập.
  const refreshToken = localStorage.getItem("slanguage_refresh_token");
  if (refreshToken) {
    void slanguageApi("/api/v1/auth/logout", {
      method: "POST",
      body: { refresh_token: refreshToken },
      keepalive: true,
    }).catch(() => {});
  }
  clearAuthTokens();
  clearLearnerCache();
  window.location.replace("../login/index.html");
}

function bindHeaderControls(): void {
  const languageDropdown = document.getElementById("langDropdown");
  const languageButton = document.getElementById("langDropdownBtn");
  const userDropdown = document.getElementById("userDropdown");
  const userButton = document.getElementById("userDropdownBtn");

  const setOpen = (dropdown: HTMLElement | null, open: boolean): void => {
    dropdown?.classList.toggle("open", open);
    dropdown?.classList.toggle("is-open", open);
  };

  const closeDropdowns = (): void => {
    setOpen(languageDropdown, false);
    setOpen(userDropdown, false);
    languageButton?.setAttribute("aria-expanded", "false");
    userButton?.setAttribute("aria-expanded", "false");
  };

  languageButton?.addEventListener("click", (event) => {
    event.stopPropagation();
    const open = !languageDropdown?.classList.contains("is-open");
    closeDropdowns();
    setOpen(languageDropdown, open);
    languageButton.setAttribute("aria-expanded", String(open));
  });

  userButton?.addEventListener("click", (event) => {
    event.stopPropagation();
    const open = !userDropdown?.classList.contains("is-open");
    closeDropdowns();
    setOpen(userDropdown, open);
    userButton.setAttribute("aria-expanded", String(open));
  });

  document.addEventListener("click", (event) => {
    const target = event.target;
    if (target instanceof Node && !languageDropdown?.contains(target) && !userDropdown?.contains(target)) {
      closeDropdowns();
    }
  });

  document.querySelectorAll<HTMLButtonElement>(".lang-dropdown-item, .menu-item[data-lang]").forEach((button) => {
    button.addEventListener("click", () => {
      const code = button.dataset.lang;
      if (code && !button.classList.contains("active")) {
        void changeLearningLanguage(code, button);
      }
      closeDropdowns();
    });
  });

  document.querySelector("#navLogoutItem, #logoutButton")?.addEventListener("click", (event) => {
    event.preventDefault();
    void logoutLearner();
  });
}

export async function initializeLearnerHeader(options: LearnerHeaderOptions = {}): Promise<void> {
  const authenticated = isLearnerAuthenticated();
  document.body.classList.toggle("user-authenticated", authenticated);
  document.body.classList.toggle("user-guest", !authenticated);
  updateLanguageDisplay(localStorage.getItem("slanguage_active_language") || "ja");

  if (options.bindControls !== false) bindHeaderControls();
  if (!authenticated || options.loadProfile === false) return;

  try {
    const response = await slanguageApi("/api/v1/me", { method: "GET" });
    renderLearnerHeader(response.data);
  } catch (error) {
    showHeaderMessage(error instanceof Error ? error.message : "Không thể tải thông tin người dùng.");
  }
}
