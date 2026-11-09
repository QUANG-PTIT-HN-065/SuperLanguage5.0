import { isLearnerAuthenticated, slanguageApi } from "../shared/api-client";

interface LearnerProfileData {
  display_name?: string;
  username?: string;
  target_language?: string;
  current_level?: string;
  target_level?: string;
}

interface LearnerStatsData {
  xp_total?: number;
  current_streak?: number;
  lessons_completed?: number;
}

const languageNames: Record<string, string> = {
  en: "Tiếng Anh",
  ja: "Tiếng Nhật",
  vi: "Tiếng Việt",
};

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function toText(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function toCount(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0;
}

function setAuthState(isAuthenticated: boolean): void {
  document.body.classList.toggle("user-authenticated", isAuthenticated);
  document.body.classList.toggle("user-guest", !isAuthenticated);
  document.getElementById("learningGuest")?.toggleAttribute("hidden", isAuthenticated);
  document.getElementById("learningOverview")?.toggleAttribute("hidden", !isAuthenticated);
}

async function loadLearningProfile(): Promise<void> {
  if (!isLearnerAuthenticated()) {
    setAuthState(false);
    return;
  }

  setAuthState(true);
  const notice = document.getElementById("learningNotice");
  if (notice) {
    notice.hidden = false;
    notice.textContent = "Đang tải hồ sơ học tập...";
    notice.dataset.state = "";
  }

  try {
    const payload = asRecord(await slanguageApi("/api/v1/me", { method: "GET" }));
    const profile = asRecord(payload.profile) as LearnerProfileData;
    const stats = asRecord(payload.stats) as LearnerStatsData;
    const name = toText(profile.display_name, toText(profile.username, "học viên"));
    const languageCode = toText(
      profile.target_language,
      localStorage.getItem("slanguage_active_language") || "",
    );
    const languageName = languageNames[languageCode] || languageCode.toUpperCase() || "Chưa chọn";
    const xp = toCount(stats.xp_total);
    const streak = toCount(stats.current_streak);
    const lessons = toCount(stats.lessons_completed);

    const learnerName = document.getElementById("learnerName");
    const targetLanguage = document.getElementById("targetLanguage");
    const currentLevel = document.getElementById("currentLevel");
    const targetLevel = document.getElementById("targetLevel");
    const streakValue = document.getElementById("learningStreak");
    const completedLessons = document.getElementById("completedLessons");
    const xpValue = document.getElementById("studyXp");
    if (learnerName) learnerName.textContent = name;
    if (targetLanguage) targetLanguage.textContent = languageName;
    if (currentLevel) currentLevel.textContent = toText(profile.current_level, "Chưa thiết lập");
    if (targetLevel) targetLevel.textContent = toText(profile.target_level, "Chưa thiết lập");
    if (streakValue) streakValue.textContent = `${streak} ngày`;
    if (completedLessons) completedLessons.textContent = lessons.toLocaleString("vi-VN");
    if (xpValue) xpValue.textContent = `${xp.toLocaleString("vi-VN")} XP`;

    localStorage.setItem("slanguage_active_language", languageCode);
    localStorage.setItem("slanguage_user_xp", String(xp));
    localStorage.setItem("slanguage_user_streak", String(streak));
    localStorage.setItem("slanguage_user_name", name);
    if (notice) notice.hidden = true;
  } catch (error) {
    if (notice) {
      notice.hidden = false;
      notice.dataset.state = "error";
      notice.textContent = error instanceof Error
        ? error.message
        : "Không thể tải hồ sơ học tập.";
    }
  }
}

document.getElementById("studyLogout")?.addEventListener("click", (event) => {
  event.preventDefault();
  for (const key of [
    "slanguage_access_token",
    "slanguage_refresh_token",
    "slanguage_is_logged_in",
    "slanguage_user_id",
    "slanguage_user_email",
    "slanguage_user_name",
    "slanguage_active_language",
    "slanguage_user_xp",
    "slanguage_user_streak",
  ]) {
    localStorage.removeItem(key);
  }
  window.location.assign("../home/index.html");
});

void loadLearningProfile();
