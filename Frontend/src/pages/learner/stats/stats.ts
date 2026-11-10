/**
 * slanguage-stats.ts
 * Trang tiến độ học tập.
 *
 * Chỉ đọc stats thật từ GET /api/v1/me. Backend chưa expose daily_activity,
 * nên trang không dựng biểu đồ tuần từ localStorage hay số liệu mẫu.
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

renderHeader({ containerId: "sl-header", activePage: "stats" });

const authGuard = document.getElementById("sl-auth-guard");
const content = document.getElementById("sl-stats-content");
const statusEl = document.getElementById("sl-stats-status");
const retryBtn = document.getElementById("sl-stats-retry") as HTMLButtonElement | null;
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
  const percent = Math.max(
    0,
    Math.min(100, Math.round((overview.xpIntoLevel / XP_PER_LEVEL) * 100))
  );

  setText("sl-stats-xp", `${formatNumber(stats.xpTotal)} XP`);
  setText("sl-stats-level", `Cấp ${overview.level}`);
  setText("sl-stats-level-chip", `Cấp ${overview.level}`);
  setText("sl-stats-streak", `${stats.currentStreak} ngày`);
  setText("sl-stats-longest", `${stats.longestStreak} ngày`);
  setText("sl-stats-words", formatNumber(stats.wordsLearned));
  setText("sl-stats-lessons", formatNumber(stats.lessonsCompleted));
  setText(
    "sl-stats-goal",
    profile.dailyGoalXp > 0 ? `${formatNumber(profile.dailyGoalXp)} XP` : "Chưa thiết lập"
  );
  setText(
    "sl-stats-today",
    stats.studiedToday ? "Đã có hoạt động" : "Chưa có hoạt động"
  );
  setText(
    "sl-stats-language",
    profile.targetLanguage ? languageLabel(profile.targetLanguage) : "Chưa chọn"
  );
  setText(
    "sl-stats-language-kv",
    profile.targetLanguage ? languageLabel(profile.targetLanguage) : "Chưa chọn"
  );
  setText(
    "sl-stats-level-copy",
    stats.xpTotal > 0
      ? `${formatNumber(overview.xpIntoLevel)} / ${XP_PER_LEVEL} XP trong cấp hiện tại. Còn ${XP_PER_LEVEL - overview.xpIntoLevel} XP để lên cấp.`
      : "Chưa có XP. Hoàn thành một hoạt động học để bắt đầu ghi nhận."
  );
  setText(
    "sl-stats-intro",
    profile.targetLanguage
      ? `Đang học ${languageLabel(profile.targetLanguage)}. Số liệu lấy từ hồ sơ học tập của bạn.`
      : "Hồ sơ chưa có ngôn ngữ đích."
  );

  const fill = document.getElementById("sl-stats-level-fill");
  if (fill) fill.style.transform = `scaleX(${percent / 100})`;
  const meter = document.getElementById("sl-stats-level-meter");
  if (meter) meter.setAttribute("aria-valuenow", String(percent));

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

  const level = Math.floor(cached.xp / XP_PER_LEVEL) + 1;
  setText("sl-stats-xp", `${formatNumber(cached.xp)} XP`);
  setText("sl-stats-level", `Cấp ${level}`);
  setText("sl-stats-level-chip", `Cấp ${level}`);
  setText("sl-stats-streak", `${cached.streak} ngày`);
  setStatus(
    "Không kết nối được máy chủ. Đang hiển thị XP và chuỗi ngày của lần đồng bộ gần nhất; các chỉ số khác để trống.",
    true
  );
  if (retryBtn) retryBtn.hidden = false;
  return true;
}

async function loadStats(): Promise<void> {
  setStatus("Đang tải số liệu…");
  if (retryBtn) retryBtn.hidden = true;

  try {
    const overview = await fetchLearnerOverview();
    cacheOverview(overview);
    renderOverview(overview);
  } catch (error) {
    if (!renderCachedFallback()) {
      setStatus(
        error instanceof Error
          ? error.message
          : "Không tải được số liệu học tập. Vui lòng thử lại.",
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
  void loadStats();
}

retryBtn?.addEventListener("click", () => {
  void loadStats();
});
