/**
 * slanguage-dashboard.ts
 * Tổng quan hành trình học viên.
 *
 * - Dữ liệu duy nhất: GET /api/v1/me (profile + stats).
 * - Không hiển thị bảng xếp hạng, nhiệm vụ, sinh lực hay số liệu mẫu.
 * - Khi chưa có hoạt động, hiển thị lời mời bắt đầu thay vì hành trình giả.
 */

import { renderHeader } from "../../../types/shared/header";
import { initPageReveal } from "../../../types/shared/gsap-animations";
import { isLearnerAuthenticated } from "../../../types/shared/api-client";
import {
  XP_PER_LEVEL,
  cacheOverview,
  fetchLearnerOverview,
  formatNumber,
  languageLabel,
  readCachedProgress,
  type LearnerOverview,
} from "../../../types/shared/learner-progress";

renderHeader({ containerId: "sl-header", activePage: "dashboard" });

const authGuard = document.getElementById("sl-auth-guard");
const content = document.getElementById("sl-dashboard-content");
const statusEl = document.getElementById("sl-dash-status");
const retryBtn = document.getElementById("sl-dash-retry") as HTMLButtonElement | null;
let hasRevealed = false;

function setText(id: string, value: string): void {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function setStatus(message: string, isError = false): void {
  if (!statusEl) return;
  statusEl.textContent = message;
  statusEl.hidden = message === "";
  statusEl.classList.toggle("is-error", isError);
}

function renderOverview(overview: LearnerOverview): void {
  const { profile, stats } = overview;
  const hasActivity =
    stats.xpTotal > 0 || stats.lessonsCompleted > 0 || stats.wordsLearned > 0;

  setText("sl-dash-name", profile.displayName);
  setText(
    "sl-dash-intro",
    profile.targetLanguage
      ? `Bạn đang học ${languageLabel(profile.targetLanguage)}. Mọi con số dưới đây được đọc từ hồ sơ học tập hiện tại.`
      : "Hồ sơ chưa có ngôn ngữ đích. Hãy cập nhật hồ sơ trước khi bắt đầu hành trình."
  );

  setText("sl-dash-xp", `${formatNumber(stats.xpTotal)} XP`);
  setText("sl-dash-level", `Cấp ${overview.level}`);
  setText("sl-dash-level-chip", `Cấp ${overview.level}`);
  setText("sl-dash-streak", `${stats.currentStreak} ngày`);
  setText("sl-dash-words", formatNumber(stats.wordsLearned));
  setText("sl-dash-lessons", formatNumber(stats.lessonsCompleted));
  setText("sl-dash-longest", `${stats.longestStreak} ngày`);
  setText(
    "sl-dash-goal",
    profile.dailyGoalXp > 0 ? `${formatNumber(profile.dailyGoalXp)} XP` : "Chưa thiết lập"
  );

  const percent = Math.max(
    0,
    Math.min(100, Math.round((overview.xpIntoLevel / XP_PER_LEVEL) * 100))
  );
  const fill = document.getElementById("sl-dash-level-fill");
  if (fill) fill.style.transform = `scaleX(${percent / 100})`;
  const meter = document.getElementById("sl-dash-level-meter");
  if (meter) meter.setAttribute("aria-valuenow", String(percent));

  setText(
    "sl-dash-level-copy",
    hasActivity
      ? `${formatNumber(overview.xpIntoLevel)} / ${XP_PER_LEVEL} XP trong cấp hiện tại. Còn ${XP_PER_LEVEL - overview.xpIntoLevel} XP để lên cấp tiếp theo.`
      : "Chưa có XP trong cấp hiện tại. Hoàn thành một hoạt động học để bắt đầu."
  );

  setText(
    "sl-dash-today-chip",
    stats.studiedToday ? "Đã có hoạt động" : "Chưa có hoạt động"
  );
  setText(
    "sl-dash-today",
    stats.studiedToday
      ? "Hệ thống ghi nhận bạn đã có hoạt động học tập trong hôm nay."
      : "Hệ thống chưa ghi nhận hoạt động học tập nào trong hôm nay."
  );

  const onboarding = document.getElementById("sl-dash-onboarding");
  if (onboarding) onboarding.hidden = hasActivity || stats.studiedToday;

  setStatus("");
  if (retryBtn) retryBtn.hidden = true;

  if (!hasRevealed) {
    initPageReveal({ container: ".slg-reveal" });
    hasRevealed = true;
  }
}

function renderCachedFallback(): boolean {
  const cached = readCachedProgress();
  if (!cached) return false;

  setText("sl-dash-xp", `${formatNumber(cached.xp)} XP`);
  setText("sl-dash-level", `Cấp ${Math.floor(cached.xp / XP_PER_LEVEL) + 1}`);
  setText("sl-dash-level-chip", `Cấp ${Math.floor(cached.xp / XP_PER_LEVEL) + 1}`);
  setText("sl-dash-streak", `${cached.streak} ngày`);
  setText("sl-dash-name", cached.name);
  setStatus(
    "Không kết nối được máy chủ. Đang hiển thị số liệu của lần đồng bộ gần nhất; các chỉ số khác để trống.",
    true
  );
  if (retryBtn) retryBtn.hidden = false;
  return true;
}

async function loadDashboard(): Promise<void> {
  setStatus("Đang tải hồ sơ…");
  if (retryBtn) retryBtn.hidden = true;
  if (content) content.hidden = false;

  try {
    const overview = await fetchLearnerOverview();
    cacheOverview(overview);
    renderOverview(overview);
  } catch (error) {
    if (!renderCachedFallback()) {
      setStatus(
        error instanceof Error
          ? error.message
          : "Không tải được hồ sơ học tập. Vui lòng thử lại.",
        true
      );
      if (retryBtn) retryBtn.hidden = false;
    }
    if (!hasRevealed) {
      initPageReveal({ container: ".slg-reveal" });
      hasRevealed = true;
    }
  }
}

if (!isLearnerAuthenticated()) {
  if (authGuard) authGuard.hidden = false;
  if (content) content.hidden = true;
} else {
  if (authGuard) authGuard.hidden = true;
  void loadDashboard();
}

retryBtn?.addEventListener("click", () => {
  void loadDashboard();
});
