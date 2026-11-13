import { clearAuthTokens, isLearnerAuthenticated, slanguageApi } from "./api-client";

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

export function renderLearnerHeader(payload: unknown): void {
  const data = asRecord(payload);
  const profile = asRecord(data.profile);
  const stats = asRecord(data.stats);
  const name = text(profile.display_name, text(profile.username, "Học viên"));
  const email = text(profile.email, "Tài khoản học viên");
  const languageCode = text(profile.target_language);
  const xp = count(stats.xp_total);
  const streak = count(stats.current_streak);

  document.querySelectorAll<HTMLElement>(".user-info-text .name, [data-learner-name]").forEach((element) => {
    element.textContent = name;
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

  const avatar = document.getElementById("headerAvatar");
  if (avatar instanceof HTMLImageElement) {
    const avatarUrl = text(profile.avatar_url);
    if (avatarUrl.startsWith("https://")) avatar.src = avatarUrl;
  }
  updateLanguageDisplay(languageCode);

  localStorage.setItem("slanguage_user_name", name);
  localStorage.setItem("slanguage_user_email", email);
  if (languageCode) localStorage.setItem("slanguage_active_language", languageCode);
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

export function logoutLearner(): void {
  clearAuthTokens();
  for (const key of [
    "slanguage_is_logged_in",
    "slanguage_user_id",
    "slanguage_user_email",
    "slanguage_user_name",
    "slanguage_active_language",
    "slanguage_user_xp",
    "slanguage_user_streak",
    "slanguage_daily_goal",
  ]) {
    localStorage.removeItem(key);
  }
  window.location.assign("../login/index.html");
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
    logoutLearner();
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
