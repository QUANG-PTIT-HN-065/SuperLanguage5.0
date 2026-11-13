import { isLearnerAuthenticated, slanguageApi } from "../shared/api-client";
import { initializeLearnerHeader, renderLearnerHeader } from "../shared/learner-header";
import { mountHeader } from "../ui/header.js";
import { AvatarUploader } from "../../ts/ui/avatar-upload";
import {
  validateUsername,
  validateDisplayName,
  validateBirthYear,
  validateCountryCode,
  validateCefrProgression,
  validateLanguages,
  evaluatePasswordStrength,
} from "../../ts/ui/validators";

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord {
  return value !== null && typeof value === "object"
    ? (value as JsonRecord)
    : {};
}

function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

// Global elements
const form = document.getElementById("profileForm") as HTMLFormElement | null;
const stickySaveBar = document.getElementById("stickySaveBar");
const saveSpinner = document.getElementById("saveSpinner");
const saveCheckIcon = document.getElementById("saveCheckIcon");
const saveLabel = document.getElementById("saveProfileLabel");
const saveButton = document.getElementById("saveProfileButton") as HTMLButtonElement | null;
const notice = document.getElementById("profileNotice");

// State
let originalData: JsonRecord = {};
let isDirty = false;
let avatarUploader: AvatarUploader | null = null;
let currentPendingAvatar: string | null = null;

function setNotice(message: string, kind: "error" | "success" | "info"): void {
  if (!notice) return;
  notice.textContent = message;
  notice.classList.toggle("is-error", kind === "error");
  notice.classList.toggle("is-success", kind === "success");
  notice.hidden = !message;
}

function updateStickyBarVisibility(): void {
  if (!stickySaveBar) return;
  stickySaveBar.classList.toggle("is-visible", isDirty);
  stickySaveBar.hidden = !isDirty;
}

function markDirty(): void {
  isDirty = true;
  updateStickyBarVisibility();
}

function clearDirty(): void {
  isDirty = false;
  updateStickyBarVisibility();
}

// Tab Switching logic (Hướng 2: Chia Tab)
function setupTabs(): void {
  const tabs = Array.from(document.querySelectorAll<HTMLButtonElement>(".profile-tab-btn"));
  const panels = Array.from(document.querySelectorAll<HTMLElement>(".profile-tab-panel"));

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const targetId = tab.dataset.tabTarget;
      if (!targetId) return;

      tabs.forEach((t) => {
        t.classList.remove("is-active");
        t.setAttribute("aria-selected", "false");
      });
      panels.forEach((p) => {
        p.classList.remove("is-active");
        p.hidden = true;
      });

      tab.classList.add("is-active");
      tab.setAttribute("aria-selected", "true");
      const targetPanel = document.getElementById(targetId);
      if (targetPanel) {
        targetPanel.classList.add("is-active");
        targetPanel.hidden = false;
      }
    });
  });
}

// Segmented Chips (CEFR A1 - C2)
function setupCefrChips(): void {
  const setupGroup = (containerId: string, hiddenInputId: string) => {
    const container = document.getElementById(containerId);
    const hiddenInput = document.getElementById(hiddenInputId) as HTMLInputElement | null;
    if (!container || !hiddenInput) return;

    const chips = Array.from(container.querySelectorAll<HTMLButtonElement>(".cefr-chip"));
    chips.forEach((chip) => {
      chip.addEventListener("click", () => {
        const level = chip.dataset.level || "";
        chips.forEach((c) => c.classList.remove("is-selected"));
        chip.classList.add("is-selected");
        hiddenInput.value = level;
        markDirty();
        validateFieldsRealtime();
      });
    });
  };

  setupGroup("currentLevelChips", "hiddenCurrentLevel");
  setupGroup("targetLevelChips", "hiddenTargetLevel");
}

function setSelectedCefrChip(containerId: string, hiddenInputId: string, levelValue: string): void {
  const container = document.getElementById(containerId);
  const hiddenInput = document.getElementById(hiddenInputId) as HTMLInputElement | null;
  if (!container || !hiddenInput) return;

  hiddenInput.value = levelValue || "";
  const chips = Array.from(container.querySelectorAll<HTMLButtonElement>(".cefr-chip"));
  chips.forEach((chip) => {
    chip.classList.toggle("is-selected", chip.dataset.level === levelValue);
  });
}

// Goals Interactive Ring & Sliders
function setupGoalsInteractive(): void {
  const rangeMinutes = document.getElementById("range_minutes") as HTMLInputElement | null;
  const rangeLessons = document.getElementById("range_lessons") as HTMLInputElement | null;
  const rangeXp = document.getElementById("range_xp") as HTMLInputElement | null;

  const valMinutes = document.getElementById("val_minutes");
  const valLessons = document.getElementById("val_lessons");
  const valXp = document.getElementById("val_xp");
  const ringXpDisplay = document.getElementById("ringXpDisplay");
  const goalRingFill = document.getElementById("goalRingFill") as SVGCircleElement | null;
  const goalTipText = document.getElementById("goalTipText");

  const updateGoalPreview = () => {
    const minutes = Number(rangeMinutes?.value || 15);
    const lessons = Number(rangeLessons?.value || 1);
    const xp = Number(rangeXp?.value || 20);

    if (valMinutes) valMinutes.textContent = String(minutes);
    if (valLessons) valLessons.textContent = String(lessons);
    if (valXp) valXp.textContent = String(xp);
    if (ringXpDisplay) ringXpDisplay.textContent = String(xp);

    // SVG Ring calculate dashoffset (perimeter = 2 * PI * 50 = 314.16)
    if (goalRingFill) {
      const maxTarget = 200;
      const progressRatio = Math.min(1, xp / maxTarget);
      const circumference = 314.16;
      goalRingFill.style.strokeDashoffset = String(circumference - progressRatio * circumference);
    }

    if (goalTipText) {
      if (xp >= 50) {
        goalTipText.innerHTML = `<i class="fa-solid fa-trophy" aria-hidden="true"></i> Mục tiêu <strong>${xp} XP</strong> rất thử thách! Đảm bảo tăng hạng nhanh trên Leaderboard.`;
      } else {
        goalTipText.innerHTML = `<i class="fa-solid fa-lightbulb" aria-hidden="true"></i> Đạt tối thiểu <strong>20 XP</strong> mỗi ngày để duy trì chuỗi Streak học liên tục!`;
      }
    }
  };

  [rangeMinutes, rangeLessons, rangeXp].forEach((range) => {
    range?.addEventListener("input", () => {
      updateGoalPreview();
      markDirty();
    });
  });

  // Stepper buttons (+/-)
  document.querySelectorAll<HTMLButtonElement>("[data-step-target]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const targetName = btn.dataset.stepTarget;
      const step = Number(btn.dataset.step || 0);
      const input = form?.elements.namedItem(targetName || "") as HTMLInputElement | null;
      if (!input) return;

      const current = Number(input.value || 0);
      const min = Number(input.min || 0);
      const max = Number(input.max || 500);
      const nextVal = Math.max(min, Math.min(max, current + step));
      input.value = String(nextVal);

      updateGoalPreview();
      markDirty();
    });
  });

  updateGoalPreview();
}

// Password tab logic (Nút Cập nhật mật khẩu riêng)
function setupSecuritySection(): void {
  const newPassInput = document.getElementById("input_new_password") as HTMLInputElement | null;
  const confirmPassInput = document.getElementById("input_confirm_password") as HTMLInputElement | null;
  const strengthBar = document.getElementById("passwordStrengthBar");
  const strengthLabel = document.getElementById("passwordStrengthLabel");
  const errorMatch = document.getElementById("error_password_match");
  const updatePassBtn = document.getElementById("btnUpdatePassword");
  const feedbackMsg = document.getElementById("securityFeedbackMsg");

  // Show/Hide password toggle
  document.querySelectorAll<HTMLButtonElement>(".toggle-password-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const targetId = btn.dataset.toggle;
      const input = document.getElementById(targetId || "") as HTMLInputElement | null;
      if (!input) return;
      const isPassword = input.type === "password";
      input.type = isPassword ? "text" : "password";
      const icon = btn.querySelector("i");
      if (icon) {
        icon.className = isPassword ? "fa-regular fa-eye-slash" : "fa-regular fa-eye";
      }
    });
  });

  newPassInput?.addEventListener("input", () => {
    const pwd = newPassInput.value;
    const strength = evaluatePasswordStrength(pwd);
    if (strengthBar) {
      strengthBar.style.width = `${(strength.score / 4) * 100}%`;
      strengthBar.style.backgroundColor = strength.color;
    }
    if (strengthLabel) {
      strengthLabel.textContent = `Độ mạnh: ${strength.label}`;
      strengthLabel.style.color = strength.color;
    }
    if (confirmPassInput && confirmPassInput.value && errorMatch) {
      errorMatch.textContent = pwd === confirmPassInput.value ? "" : "Mật khẩu xác nhận không khớp.";
    }
  });

  confirmPassInput?.addEventListener("input", () => {
    if (!errorMatch || !newPassInput) return;
    errorMatch.textContent = newPassInput.value === confirmPassInput.value ? "" : "Mật khẩu xác nhận không khớp.";
  });

  updatePassBtn?.addEventListener("click", () => {
    const pwd = newPassInput?.value || "";
    const confirm = confirmPassInput?.value || "";

    if (!pwd || pwd.length < 8) {
      if (feedbackMsg) {
        feedbackMsg.textContent = "Mật khẩu mới phải có ít nhất 8 ký tự.";
        feedbackMsg.className = "security-feedback-msg is-error";
      }
      return;
    }
    if (pwd !== confirm) {
      if (feedbackMsg) {
        feedbackMsg.textContent = "Mật khẩu xác nhận không khớp.";
        feedbackMsg.className = "security-feedback-msg is-error";
      }
      return;
    }

    if (feedbackMsg) {
      feedbackMsg.textContent = "Mật khẩu đã được xác thực an toàn.";
      feedbackMsg.className = "security-feedback-msg is-success";
      setTimeout(() => {
        if (newPassInput) newPassInput.value = "";
        if (confirmPassInput) confirmPassInput.value = "";
        if (strengthBar) strengthBar.style.width = "0%";
        if (strengthLabel) strengthLabel.textContent = "Độ mạnh: Chưa nhập";
        feedbackMsg.textContent = "Đã cập nhật mật khẩu thành công!";
      }, 600);
    }
  });
}

// Inline validations real-time
function validateFieldsRealtime(): boolean {
  if (!form) return true;
  let allValid = true;

  const displayNameInput = form.elements.namedItem("display_name") as HTMLInputElement | null;
  const usernameInput = form.elements.namedItem("username") as HTMLInputElement | null;
  const birthYearInput = form.elements.namedItem("birth_year") as HTMLInputElement | null;
  const countryCodeInput = form.elements.namedItem("country_code") as HTMLInputElement | null;
  const nativeLangSelect = form.elements.namedItem("native_language") as HTMLSelectElement | null;
  const targetLangSelect = form.elements.namedItem("target_language") as HTMLSelectElement | null;
  const currentLevelInput = document.getElementById("hiddenCurrentLevel") as HTMLInputElement | null;
  const targetLevelInput = document.getElementById("hiddenTargetLevel") as HTMLInputElement | null;

  const setErr = (id: string, msg: string) => {
    const el = document.getElementById(id);
    if (el) el.textContent = msg;
    if (msg) allValid = false;
  };

  if (displayNameInput) {
    const res = validateDisplayName(displayNameInput.value);
    setErr("error_display_name", res.message);
  }
  if (usernameInput) {
    const res = validateUsername(usernameInput.value);
    setErr("error_username", res.message);
  }
  if (birthYearInput) {
    const res = validateBirthYear(birthYearInput.value);
    setErr("error_birth_year", res.message);
  }
  if (countryCodeInput) {
    const res = validateCountryCode(countryCodeInput.value);
    setErr("error_country_code", res.message);
  }
  if (nativeLangSelect && targetLangSelect) {
    const res = validateLanguages(nativeLangSelect.value, targetLangSelect.value);
    setErr("error_languages", res.message);
  }
  if (currentLevelInput && targetLevelInput) {
    const res = validateCefrProgression(currentLevelInput.value, targetLevelInput.value);
    setErr("error_cefr_progression", res.message);
  }

  return allValid;
}

function fillProfile(payload: unknown): void {
  const data = asRecord(payload);
  const profile = asRecord(data.profile);
  const stats = asRecord(data.stats);
  originalData = { ...profile };

  if (!form) return;

  const setFieldValue = (name: string, val: unknown) => {
    const field = form.elements.namedItem(name);
    if (field instanceof HTMLInputElement || field instanceof HTMLSelectElement) {
      field.value = val === null || val === undefined ? "" : String(val);
    }
  };

  for (const key of [
    "display_name",
    "username",
    "avatar_url",
    "birth_year",
    "country_code",
    "timezone",
    "native_language",
    "target_language",
    "learning_goal",
    "reminder_time",
    "daily_goal_minutes",
    "daily_goal_lessons",
    "daily_goal_xp",
  ]) {
    setFieldValue(key, profile[key]);
  }

  if (!profile.timezone) setFieldValue("timezone", "Asia/Ho_Chi_Minh");
  if (profile.daily_goal_minutes === undefined) setFieldValue("daily_goal_minutes", 15);
  if (profile.daily_goal_lessons === undefined) setFieldValue("daily_goal_lessons", 1);
  if (profile.daily_goal_xp === undefined) setFieldValue("daily_goal_xp", 20);

  // Set CEFR chips
  setSelectedCefrChip("currentLevelChips", "hiddenCurrentLevel", stringValue(profile.current_level));
  setSelectedCefrChip("targetLevelChips", "hiddenTargetLevel", stringValue(profile.target_level));

  // Avatar Component
  const avatarUrl = stringValue(profile.avatar_url);
  if (avatarUploader) {
    avatarUploader.setAvatarUrl(avatarUrl);
  }

  // Header and Hero UI
  const name = stringValue(profile.display_name, stringValue(profile.username, "Học viên"));
  const email = stringValue(profile.email, "learner@slanguage.edu.vn");
  const displayName = document.getElementById("profileDisplayName");
  const emailElement = document.getElementById("profileEmail");
  const xpElement = document.getElementById("profileXp");
  const streakElement = document.getElementById("profileStreak");
  const levelBadge = document.getElementById("profileLevelBadge");

  if (displayName) displayName.textContent = name;
  if (emailElement) emailElement.textContent = email;
  const xpTotal = Number(stats.xp_total || 0);
  if (xpElement) xpElement.textContent = `${xpTotal.toLocaleString("vi-VN")} XP`;
  if (streakElement) streakElement.textContent = `${Number(stats.current_streak || 0)} Ngày`;
  if (levelBadge) levelBadge.textContent = `Cấp độ ${Math.floor(xpTotal / 100) + 1}`;

  renderLearnerHeader(payload);
  form.hidden = false;
  if (notice) notice.hidden = true;
  clearDirty();

  // Trigger slider range UI updates
  const rangeMinutes = document.getElementById("range_minutes") as HTMLInputElement | null;
  const rangeLessons = document.getElementById("range_lessons") as HTMLInputElement | null;
  const rangeXp = document.getElementById("range_xp") as HTMLInputElement | null;
  if (rangeMinutes) rangeMinutes.value = String(profile.daily_goal_minutes || 15);
  if (rangeLessons) rangeLessons.value = String(profile.daily_goal_lessons || 1);
  if (rangeXp) rangeXp.value = String(profile.daily_goal_xp || 20);
  rangeXp?.dispatchEvent(new Event("input"));
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
  const update: JsonRecord = {
    display_name: String(formData.get("display_name") || "").trim(),
    username: String(formData.get("username") || "").trim(),
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

  // Avatar: chỉ gửi nếu có thay đổi và là URL hợp lệ (hoặc giữ nguyên)
  const avatarVal = optionalText(formData, "avatar_url");
  if (avatarVal && avatarVal.startsWith("https://")) {
    update.avatar_url = avatarVal;
  }

  return update;
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

function bindFormEvents(): void {
  if (!form) return;

  // Track dirty on all input changes
  form.addEventListener("input", () => {
    markDirty();
    validateFieldsRealtime();
  });
  form.addEventListener("change", () => {
    markDirty();
    validateFieldsRealtime();
  });

  // Discard changes
  document.getElementById("btnDiscardChanges")?.addEventListener("click", () => {
    fillProfile({ profile: originalData });
    setNotice("Đã hoàn tác các thay đổi chưa lưu.", "info");
    setTimeout(() => { if (notice) notice.hidden = true; }, 3000);
  });

  // Submit form via sticky bar
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!validateFieldsRealtime()) {
      setNotice("Vui lòng kiểm tra lại các trường thông tin bị lỗi.", "error");
      return;
    }

    const formData = new FormData(form);
    const update = buildUpdate(formData);

    if (saveButton) saveButton.disabled = true;
    if (saveSpinner) saveSpinner.hidden = false;
    if (saveCheckIcon) saveCheckIcon.hidden = true;
    if (saveLabel) saveLabel.textContent = "Đang lưu...";

    try {
      const response = await slanguageApi("/api/v1/me", {
        method: "PATCH",
        body: update,
      });

      // Show animated tick
      if (saveSpinner) saveSpinner.hidden = true;
      if (saveCheckIcon) saveCheckIcon.hidden = false;
      if (saveLabel) saveLabel.textContent = "Đã lưu!";

      fillProfile(response.data);
      setNotice("Cập nhật hồ sơ và mục tiêu học tập thành công!", "success");

      setTimeout(() => {
        clearDirty();
        if (saveCheckIcon) saveCheckIcon.hidden = true;
        if (saveLabel) saveLabel.textContent = "Lưu thay đổi";
        if (saveButton) saveButton.disabled = false;
      }, 1200);

    } catch (error) {
      if (saveSpinner) saveSpinner.hidden = true;
      if (saveLabel) saveLabel.textContent = "Lưu thay đổi";
      if (saveButton) saveButton.disabled = false;
      setNotice(error instanceof Error ? error.message : "Không thể lưu hồ sơ.", "error");
    }
  });

  // Warning when leaving with unsaved changes
  window.addEventListener("beforeunload", (event) => {
    if (isDirty) {
      event.preventDefault();
      event.returnValue = "Bạn có các thay đổi chưa được lưu. Bạn có chắc chắn muốn rời đi?";
    }
  });
}

function initializeAvatarUploader(): void {
  const container = document.getElementById("avatarUploadContainer");
  if (!container) return;

  avatarUploader = new AvatarUploader({
    container,
    initialAvatarUrl: "../../../assets/logo.png",
    onAvatarSelected: (dataUrl) => {
      currentPendingAvatar = dataUrl;
      const hiddenInput = document.getElementById("hiddenAvatarUrl") as HTMLInputElement | null;
      if (hiddenInput) hiddenInput.value = dataUrl;
      markDirty();
      setNotice("Ảnh đại diện mới đã sẵn sàng. Bấm 'Lưu thay đổi' để hoàn tất.", "info");
    },
    onError: (err) => {
      setNotice(err, "error");
    },
  });
}

async function initializeProfilePage(): Promise<void> {
  try {
    await mountHeader({ active: "profile", externalState: true });
    void initializeLearnerHeader({ loadProfile: false });

    initializeAvatarUploader();
    setupTabs();
    setupCefrChips();
    setupGoalsInteractive();
    setupSecuritySection();
    bindFormEvents();

    await loadProfile();
  } catch (error) {
    setNotice(error instanceof Error ? error.message : "Không thể khởi tạo trang hồ sơ.", "error");
  }
}

void initializeProfilePage();
