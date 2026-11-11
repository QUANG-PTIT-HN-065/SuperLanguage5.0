import { isLearnerAuthenticated, slanguageApi } from "../shared/api-client";
import { initializeLearnerHeader, renderLearnerHeader } from "../shared/learner-header";

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord {
  return value !== null && typeof value === "object"
    ? (value as JsonRecord)
    : {};
}

function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function setField(name: string, value: unknown): void {
  const form = document.getElementById("profileForm");
  if (!(form instanceof HTMLFormElement)) return;
  const field = form.elements.namedItem(name);
  if (field instanceof HTMLInputElement || field instanceof HTMLSelectElement) {
    field.value = value === null || value === undefined ? "" : String(value);
  }
}

function setNotice(message: string, kind: "error" | "success" | "info"): void {
  const notice = document.getElementById("profileNotice");
  if (!notice) return;
  notice.textContent = message;
  notice.classList.toggle("is-error", kind === "error");
  notice.classList.toggle("is-success", kind === "success");
  notice.hidden = false;
}

function setSaveStatus(message: string, isError = false): void {
  const status = document.getElementById("profileSaveStatus");
  if (!status) return;
  status.textContent = message;
  status.classList.toggle("is-error", isError);
}

function fillProfile(payload: unknown): void {
  const data = asRecord(payload);
  const profile = asRecord(data.profile);
  const stats = asRecord(data.stats);
  const form = document.getElementById("profileForm");
  if (!(form instanceof HTMLFormElement)) return;
  const birthYear = form.elements.namedItem("birth_year");
  if (birthYear instanceof HTMLInputElement) {
    birthYear.max = String(new Date().getFullYear());
  }

  for (const field of [
    "display_name",
    "username",
    "avatar_url",
    "birth_year",
    "country_code",
    "timezone",
    "native_language",
    "target_language",
    "current_level",
    "target_level",
    "learning_goal",
    "reminder_time",
    "daily_goal_minutes",
    "daily_goal_lessons",
    "daily_goal_xp",
  ]) {
    setField(field, profile[field]);
  }
  if (!profile.timezone) setField("timezone", "Asia/Ho_Chi_Minh");
  if (profile.daily_goal_minutes === undefined) setField("daily_goal_minutes", 15);
  if (profile.daily_goal_lessons === undefined) setField("daily_goal_lessons", 1);
  if (profile.daily_goal_xp === undefined) setField("daily_goal_xp", 20);

  const name = stringValue(profile.display_name, stringValue(profile.username, "Học viên"));
  const email = stringValue(profile.email, "Không có email");
  const displayName = document.getElementById("profileDisplayName");
  const emailElement = document.getElementById("profileEmail");
  const xpElement = document.getElementById("profileXp");
  const streakElement = document.getElementById("profileStreak");
  if (displayName) displayName.textContent = name;
  if (emailElement) emailElement.textContent = email;
  if (xpElement) xpElement.textContent = `${Number(stats.xp_total || 0).toLocaleString("vi-VN")} XP`;
  if (streakElement) streakElement.textContent = `${Number(stats.current_streak || 0)} ngày liên tục`;

  renderLearnerHeader(payload);
  form.hidden = false;
  const notice = document.getElementById("profileNotice");
  if (notice) notice.hidden = true;
}

function optionalNumber(formData: FormData, key: string): number | null {
  const value = String(formData.get(key) || "").trim();
  return value ? Number(value) : null;
}

function optionalText(formData: FormData, key: string): string | null {
  const value = String(formData.get(key) || "").trim();
  return value || null;
}

function buildUpdate(formData: FormData): JsonRecord {
  return {
    display_name: String(formData.get("display_name") || "").trim(),
    username: String(formData.get("username") || "").trim(),
    avatar_url: optionalText(formData, "avatar_url"),
    birth_year: optionalNumber(formData, "birth_year"),
    country_code: optionalText(formData, "country_code")?.toUpperCase() ?? null,
    timezone: String(formData.get("timezone") || "").trim(),
    native_language: String(formData.get("native_language") || ""),
    target_language: String(formData.get("target_language") || ""),
    current_level: optionalText(formData, "current_level"),
    target_level: optionalText(formData, "target_level"),
    learning_goal: optionalText(formData, "learning_goal"),
    reminder_time: optionalText(formData, "reminder_time"),
    daily_goal_minutes: optionalNumber(formData, "daily_goal_minutes"),
    daily_goal_lessons: optionalNumber(formData, "daily_goal_lessons"),
    daily_goal_xp: optionalNumber(formData, "daily_goal_xp"),
  };
}

async function loadProfile(): Promise<void> {
  if (!isLearnerAuthenticated()) {
    setNotice("Bạn cần đăng nhập để xem và chỉnh sửa hồ sơ.", "info");
    window.setTimeout(() => {
      window.location.assign("../login/index.html?redirect=../profile/index.html");
    }, 900);
    return;
  }
  try {
    const response = await slanguageApi("/api/v1/me", { method: "GET" });
    fillProfile(response.data);
  } catch (error) {
    setNotice(error instanceof Error ? error.message : "Không thể tải hồ sơ.", "error");
  }
}

function bindForm(): void {
  const form = document.getElementById("profileForm");
  const button = document.getElementById("saveProfileButton");
  const label = document.getElementById("saveProfileLabel");
  if (!(form instanceof HTMLFormElement) || !(button instanceof HTMLButtonElement)) return;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;

    const formData = new FormData(form);
    const update = buildUpdate(formData);
    if (update.native_language === update.target_language) {
      setSaveStatus("Ngôn ngữ mẹ đẻ và ngôn ngữ đang học phải khác nhau.", true);
      return;
    }

    const levels = ["A1", "A2", "B1", "B2", "C1", "C2"];
    const currentLevel = update.current_level;
    const targetLevel = update.target_level;
    if (
      typeof currentLevel === "string"
      && typeof targetLevel === "string"
      && levels.indexOf(targetLevel) < levels.indexOf(currentLevel)
    ) {
      setSaveStatus("Trình độ mục tiêu không được thấp hơn trình độ hiện tại.", true);
      return;
    }

    button.disabled = true;
    if (label) label.textContent = "Đang lưu...";
    setSaveStatus("");
    try {
      const response = await slanguageApi("/api/v1/me", {
        method: "PATCH",
        body: update,
      });
      fillProfile(response.data);
      setSaveStatus("Đã lưu hồ sơ và mục tiêu học tập.");
    } catch (error) {
      setSaveStatus(error instanceof Error ? error.message : "Không thể lưu hồ sơ.", true);
    } finally {
      button.disabled = false;
      if (label) label.textContent = "Lưu thay đổi";
    }
  });
}

void initializeLearnerHeader({ loadProfile: false });
bindForm();
void loadProfile();
