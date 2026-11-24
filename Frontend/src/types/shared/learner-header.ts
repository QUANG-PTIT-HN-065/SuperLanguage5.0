import { clearAuthTokens, clearLearnerCache, getAuthCookie, isLearnerAuthenticated, removeAuthCookie, setAuthCookie, slanguageApi } from "./api-client";
import { DEFAULT_MAX_HEARTS, formatHeartLock, formatHearts, heartLockRemainingMs, isHeartsLocked, readHearts, setHeartCap } from "./hearts";
import { showToast } from "../ui/toast";
import { applyI18n, getLocale, initI18n, localeLabel, setLocale, t, translateShell, LOCALE_EVENT, type UiLocale } from "./i18n";

interface LearnerHeaderOptions {
  loadProfile?: boolean;
  bindControls?: boolean;
}

const FLAGS: Record<string, string> = {
  en: new URL("../../../assets/flags/flag-en.png", import.meta.url).href,
  ja: new URL("../../../assets/flags/flag-jp.png", import.meta.url).href,
  vi: new URL("../../../assets/flags/flag-vn.png", import.meta.url).href,
};

// Navbar hiển thị ngôn ngữ GIAO DIỆN (i18n), tách khỏi ngôn ngữ học (target_language).
let lastHeaderPayload: unknown = null;

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

function updateLanguageDisplay(): void {
  const locale = getLocale();
  const label = localeLabel(locale);
  const currentLabel = document.getElementById("currentLangLabel");
  const currentFlag = document.getElementById("currentLangFlag");
  if (currentLabel) currentLabel.textContent = label;
  if (currentFlag instanceof HTMLImageElement) {
    currentFlag.src = FLAGS[locale] ?? FLAGS.vi;
    currentFlag.alt = label;
  }
  document.querySelectorAll<HTMLButtonElement>(".lang-dropdown-item, .menu-item[data-lang]").forEach((item) => {
    const selected = item.dataset.lang === locale;
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
  lastHeaderPayload = payload;
  const data = asRecord(payload);
  const profile = asRecord(data.profile);
  const stats = asRecord(data.stats);
  const plan = asRecord(data.plan);
  const name = text(profile.display_name, text(profile.username, "Học viên"));
  const email = text(profile.email, "Tài khoản học viên");
  const languageCode = text(profile.target_language);
  const xp = count(stats.xp_total);
  const streak = count(stats.current_streak);
  setHeartCap('max_hearts' in plan ? (plan.max_hearts === null ? null : count(plan.max_hearts)) : DEFAULT_MAX_HEARTS);
  const hearts = readHearts();

  document.querySelectorAll<HTMLElement>(".user-info-text .name, [data-learner-name]").forEach((element) => {
    element.textContent = name;
  });
  document.querySelectorAll<HTMLElement>(".user-info-text .role").forEach((element) => {
    element.textContent = text(profile.role) === "admin" ? t("role.admin") : t("role.learner");
  });
  const emailElement = document.querySelector<HTMLElement>("[data-learner-email], #profileEmail");
  if (emailElement) emailElement.textContent = email;

  const localeTag = getLocale() === "en" ? "en-US" : getLocale() === "ja" ? "ja-JP" : "vi-VN";
  const xpElement = document.getElementById("headerXPVal")
    || document.getElementById("studyXp")
    || document.getElementById("vocabularyXp");
  if (xpElement) {
    xpElement.textContent = xpElement.closest(".hud-chip--xp")
      ? xp.toLocaleString(localeTag)
      : `${xp.toLocaleString(localeTag)} ${t("unit.xp")}`;
  }
  document.querySelectorAll<HTMLElement>("[data-learner-streak], .stat-chip.streak span").forEach((element) => {
    element.textContent = element.closest(".hud-chip--streak")
      ? String(streak)
      : `${streak} ${t("unit.day")}`;
  });
  document.querySelectorAll<HTMLElement>("#headerHeartsVal, #userHeartsDisplay, .stat-chip.hearts span").forEach((element) => {
    element.textContent = `${formatHearts(hearts)}`;
    const chip = element.closest<HTMLElement>(".hud-chip, .stat-chip") || element;
    chip.title = isHeartsLocked()
      ? `Hết máu — sinh lực khóa hồi 24 giờ, còn ${formatHeartLock(heartLockRemainingMs())}`
      : `Sinh lực: ${formatHearts(hearts)}`;
  });

  const avatarUrl = text(profile.avatar_url);
  const avatarSrc = avatarUrl.startsWith("https://") ? avatarUrl : initialsAvatar(name);
  document.querySelectorAll<HTMLImageElement>(".user-avatar-mini, #headerAvatar, #profileAvatarImg, #dropdownUserAvatar, #drawerUserAvatar").forEach((img) => {
    img.src = avatarSrc;
  });

  // Đồng bộ header hồ sơ & chỉ số trong user dropdown (mobile) và side drawer
  document.querySelectorAll<HTMLElement>("#dropdownUserName, #drawerUserName").forEach((element) => {
    element.textContent = name;
  });
  document.querySelectorAll<HTMLElement>("#dropdownStreakVal, #drawerStreakVal").forEach((element) => {
    element.textContent = `${streak} ${t("unit.day")}`;
  });
  document.querySelectorAll<HTMLElement>("#dropdownXPVal, #drawerXPVal").forEach((element) => {
    element.textContent = `${xp.toLocaleString(localeTag)} ${t("unit.xp")}`;
  });
  document.querySelectorAll<HTMLElement>("#dropdownHeartsVal, #drawerHeartsVal").forEach((element) => {
    element.textContent = `${formatHearts(hearts)}`;
  });

  updateLanguageDisplay();

  setAuthCookie("slanguage_user_name", name);
  setAuthCookie("slanguage_user_email", email);
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

export async function logoutLearner(): Promise<void> {
  // Thu hồi phiên phía Supabase trước khi xóa token; keepalive để request kịp
  // hoàn thành dù trang điều hướng ngay tới trang đăng nhập.
  const refreshToken = getAuthCookie("slanguage_refresh_token");
  if (refreshToken) {
    void slanguageApi("/api/v1/auth/logout", {
      method: "POST",
      body: { refresh_token: refreshToken },
      keepalive: true,
    }).catch(() => {});
  }
  clearAuthTokens();
  clearLearnerCache();
  for (const key of ["slanguage_is_logged_in", "slanguage_user_id", "slanguage_user_name", "slanguage_user_email"]) {
    localStorage.removeItem(key);
    removeAuthCookie(key);
  }
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
      const code = button.dataset.lang as UiLocale | undefined;
      if (code && code !== getLocale()) {
        setLocale(code);
        updateLanguageDisplay();
      }
      closeDropdowns();
    });
  });

  document.querySelectorAll("#navLogoutItem, #logoutButton, #drawerLogoutBtn").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      void logoutLearner();
    });
  });
}

export function bindMobileSideDrawer(): void {
  const hamburgerBtn = document.getElementById("navHamburgerBtn");
  const sideDrawer = document.getElementById("sideDrawer");
  const drawerBackdrop = document.getElementById("drawerBackdrop");
  const drawerCloseBtn = document.getElementById("drawerCloseBtn");
  if (!hamburgerBtn || !sideDrawer || !drawerBackdrop) return;
  // Trang tự gọi bindMobileSideDrawer() lẫn với lời gọi từ initializeLearnerHeader();
  // nếu bind trùng thì một cú click sẽ mở rồi đóng ngay lập tức.
  if (hamburgerBtn.dataset.drawerBound === "true") return;
  hamburgerBtn.dataset.drawerBound = "true";

  const openDrawer = (): void => {
    sideDrawer.classList.add("open");
    drawerBackdrop.classList.add("open");
    document.body.classList.add("drawer-open");
    hamburgerBtn.setAttribute("aria-expanded", "true");
  };

  const closeDrawer = (): void => {
    sideDrawer.classList.remove("open");
    drawerBackdrop.classList.remove("open");
    document.body.classList.remove("drawer-open");
    hamburgerBtn.setAttribute("aria-expanded", "false");
  };

  hamburgerBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    openDrawer();
  });
  drawerCloseBtn?.addEventListener("click", closeDrawer);
  drawerBackdrop.addEventListener("click", closeDrawer);
  sideDrawer.querySelectorAll("a").forEach((link) => link.addEventListener("click", closeDrawer));
  document.querySelectorAll<HTMLElement>("#drawerLogoutBtn").forEach((button) => {
    if (button.dataset.logoutBound === "true") return;
    button.dataset.logoutBound = "true";
    button.addEventListener("click", (event) => {
      event.preventDefault();
      void logoutLearner();
    });
  });
}

function bindLearnNavDropdown(): void {
  const item = document.querySelector<HTMLElement>(".nav-dropdown-item");
  const button = document.getElementById("learnNavDropdownBtn");
  if (!item || !button || button.dataset.bound === "true") return;
  button.dataset.bound = "true";

  const setOpen = (open: boolean): void => {
    item.classList.toggle("open", open);
    button.setAttribute("aria-expanded", String(open));
  };

  button.addEventListener("click", (event) => {
    event.stopPropagation();
    setOpen(!item.classList.contains("open"));
  });
  document.addEventListener("click", (event) => {
    if (event.target instanceof Node && !item.contains(event.target)) setOpen(false);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") setOpen(false);
  });
}

export async function initializeLearnerHeader(options: LearnerHeaderOptions = {}): Promise<void> {
  const authenticated = isLearnerAuthenticated();
  document.body.classList.toggle("user-authenticated", authenticated);
  document.body.classList.toggle("user-guest", !authenticated);
  initI18n();
  updateLanguageDisplay();

  window.addEventListener(LOCALE_EVENT, () => {
    translateShell();
    applyI18n();
    updateLanguageDisplay();
    if (lastHeaderPayload) renderLearnerHeader(lastHeaderPayload);
  });

  if (options.bindControls !== false) bindHeaderControls();
  bindMobileSideDrawer();
  bindLearnNavDropdown();
  if (!authenticated || options.loadProfile === false) return;

  try {
    const response = await slanguageApi("/api/v1/me", { method: "GET" });
    renderLearnerHeader(response.data);
  } catch (error) {
    showHeaderMessage(error instanceof Error ? error.message : "Không thể tải thông tin người dùng.");
  }
}
