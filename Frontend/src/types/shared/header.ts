/**
 * slanguage-header.ts
 * Header dùng chung cho khu vực học tập.
 *
 * Nguyên tắc dữ liệu:
 * - Chỉ hiển thị XP / chuỗi ngày khi đã đồng bộ thật từ /api/v1/me
 *   (cờ slanguage_stats_synced do learner-progress ghi lại).
 * - Không hiển thị "sinh lực", bảng xếp hạng hay số người online khi
 *   backend không cung cấp.
 */

import {
  XP_PER_LEVEL,
  cacheOverview,
  escapeHtml,
  fetchLearnerOverview,
  formatNumber,
  languageLabel,
} from "./learner-progress";

interface NavItem {
  key: string;
  label: string;
  href: string;
  badge?: string;
}

interface RenderHeaderOptions {
  containerId?: string;
  activePage?: string;
}

const NAV_ITEMS: NavItem[] = [
  { key: "dashboard", label: "Tổng quan", href: "../dashboard/index.html" },
  { key: "progress", label: "Hành trình", href: "../progress/index.html" },
  { key: "topics", label: "Chủ đề", href: "../topics/index.html" },
  { key: "flashcard", label: "Từ vựng", href: "../flashcard/index.html" },
  { key: "stats", label: "Tiến độ", href: "../stats/index.html" },
  { key: "chat", label: "Chat AI", href: "../../chat/index.html", badge: "AI" },
];

const SESSION_KEYS = [
  "slanguage_access_token",
  "slanguage_refresh_token",
  "slanguage_is_logged_in",
  "slanguage_user_id",
  "slanguage_user_email",
  "slanguage_user_name",
  "slanguage_active_language",
  "slanguage_daily_goal",
  "slanguage_user_xp",
  "slanguage_streak",
  "slanguage_stats_synced",
  "slanguage_stats_synced_at",
  "slanguage_selected_topic",
  "slanguage_studied_today",
];

function signOut(): void {
  SESSION_KEYS.forEach((key) => localStorage.removeItem(key));
  window.location.assign("../../login/index.html");
}

function navMarkup(activePage: string): string {
  return NAV_ITEMS.map((item) => {
    const isActive = item.key === activePage;
    return `
      <a href="${item.href}" class="slg-nav-link${isActive ? " is-active" : ""}"${
        isActive ? ' aria-current="page"' : ""
      }>
        <span>${item.label}</span>
        ${item.badge ? `<span class="slg-nav-badge">${item.badge}</span>` : ""}
      </a>
    `;
  }).join("");
}

export function renderHeader({
  containerId = "sl-header",
  activePage = "",
}: RenderHeaderOptions = {}): void {
  const container = document.getElementById(containerId);
  if (!container) return;

  const isLoggedIn = localStorage.getItem("slanguage_is_logged_in") === "true";
  const isSynced = localStorage.getItem("slanguage_stats_synced") === "true";
  const userName = localStorage.getItem("slanguage_user_name") || "Học viên";
  const userEmail = localStorage.getItem("slanguage_user_email") || "";
  const userInitial = (userName.charAt(0) || "H").toUpperCase();
  const activeLang = localStorage.getItem("slanguage_active_language") || "";
  const cachedXp = Number.parseInt(localStorage.getItem("slanguage_user_xp") ?? "", 10);
  const cachedStreak = Number.parseInt(localStorage.getItem("slanguage_streak") ?? "", 10);
  const hasStats = isSynced && Number.isFinite(cachedXp);

  const statsMarkup = isLoggedIn
    ? `
      <a href="../stats/index.html" class="slg-header-stat" id="sl-header-xp-pill"${
        hasStats ? "" : " hidden"
      } title="XP tích lũy từ hồ sơ học tập">
        <span>XP</span>
        <strong id="sl-header-xp">${hasStats ? formatNumber(cachedXp) : ""}</strong>
      </a>
      <a href="../stats/index.html" class="slg-header-stat slg-header-stat--streak" id="sl-header-streak-pill"${
        hasStats ? "" : " hidden"
      } title="Chuỗi ngày học hiện tại">
        <span>Chuỗi</span>
        <strong id="sl-header-streak">${
          hasStats && Number.isFinite(cachedStreak) ? `${cachedStreak} ngày` : ""
        }</strong>
      </a>
      <span class="slg-header-lang" id="sl-header-lang" title="Ngôn ngữ đích trong hồ sơ">
        ${activeLang ? escapeHtml(languageLabel(activeLang)) : "Chưa chọn ngôn ngữ"}
      </span>
    `
    : "";

  const toolsMarkup = isLoggedIn
    ? `
      ${statsMarkup}
      <span class="slg-avatar" id="sl-header-avatar" title="${escapeHtml(userName)}">
        ${escapeHtml(userInitial)}
      </span>
      <button type="button" class="slg-icon-btn slg-logout-btn" id="sl-header-logout">
        <span class="slg-logout-label">Đăng xuất</span>
        <svg class="slg-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
      </button>
    `
    : `
      <a href="../../login/index.html" class="slg-btn slg-btn--ghost slg-btn--sm">Đăng nhập</a>
      <a href="../../register/index.html" class="slg-btn slg-btn--primary slg-btn--sm">Bắt đầu</a>
    `;

  const drawerAccount = isLoggedIn
    ? `
      <div class="slg-drawer-user">
        <span class="slg-avatar" id="sl-header-drawer-avatar">${escapeHtml(userInitial)}</span>
        <div>
          <strong id="sl-header-drawer-name">${escapeHtml(userName)}</strong>
          <small id="sl-header-drawer-email">${escapeHtml(userEmail || "Học viên")}</small>
        </div>
      </div>
      <a href="../dashboard/index.html" class="slg-btn slg-btn--primary slg-btn--block">Vào tổng quan</a>
      <button type="button" class="slg-btn slg-btn--ghost slg-btn--block" id="sl-header-drawer-logout">
        Đăng xuất
      </button>
    `
    : `
      <a href="../../login/index.html" class="slg-btn slg-btn--ghost slg-btn--block">Đăng nhập</a>
      <a href="../../register/index.html" class="slg-btn slg-btn--primary slg-btn--block">Bắt đầu miễn phí</a>
    `;

  container.innerHTML = `
    <div class="slg-header">
      <div class="slg-header-inner">
        <a href="../../../../index.html" class="slg-brand" aria-label="SuperLanguage - trang chủ">
          <span class="slg-brand-mark" aria-hidden="true">SL</span>
          <span class="slg-brand-text">
            <strong>SuperLanguage</strong>
            <small>Hành trình ngôn ngữ</small>
          </span>
        </a>

        <nav class="slg-nav" aria-label="Điều hướng học tập">
          ${navMarkup(activePage)}
        </nav>

        <div class="slg-header-tools">
          ${toolsMarkup}
          <button
            type="button"
            class="slg-icon-btn slg-mobile-toggle"
            id="sl-header-mobile-toggle"
            aria-label="Mở menu điều hướng"
            aria-expanded="false"
            aria-controls="sl-header-drawer"
          >
            <svg class="slg-icon" viewBox="0 0 24 24" aria-hidden="true"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
          </button>
        </div>
      </div>
    </div>

    <div class="slg-overlay" id="sl-header-overlay" hidden></div>
    <aside
      class="slg-drawer"
      id="sl-header-drawer"
      aria-label="Menu điều hướng"
      aria-hidden="true"
    >
      <div class="slg-drawer-head">
        <span class="slg-brand-text">
          <strong>SuperLanguage</strong>
          <small>Hành trình ngôn ngữ</small>
        </span>
        <button type="button" class="slg-icon-btn" id="sl-header-drawer-close" aria-label="Đóng menu">
          <svg class="slg-icon" viewBox="0 0 24 24" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <nav class="slg-drawer-nav" aria-label="Điều hướng di động">
        ${navMarkup(activePage)}
      </nav>
      <div class="slg-drawer-account">${drawerAccount}</div>
    </aside>
  `;

  const drawer = document.getElementById("sl-header-drawer");
  const overlay = document.getElementById("sl-header-overlay");
  const toggle = document.getElementById("sl-header-mobile-toggle");
  const closeBtn = document.getElementById("sl-header-drawer-close");

  const openDrawer = (): void => {
    drawer?.classList.add("is-open");
    drawer?.setAttribute("aria-hidden", "false");
    if (overlay) overlay.hidden = false;
    toggle?.setAttribute("aria-expanded", "true");
    document.body.style.overflow = "hidden";
    closeBtn?.focus();
  };

  const closeDrawer = (): void => {
    drawer?.classList.remove("is-open");
    drawer?.setAttribute("aria-hidden", "true");
    if (overlay) overlay.hidden = true;
    toggle?.setAttribute("aria-expanded", "false");
    document.body.style.overflow = "";
  };

  toggle?.addEventListener("click", openDrawer);
  closeBtn?.addEventListener("click", closeDrawer);
  overlay?.addEventListener("click", closeDrawer);
  document.addEventListener("keydown", (event: KeyboardEvent) => {
    if (event.key === "Escape") closeDrawer();
  });
  drawer?.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", closeDrawer);
  });

  document.getElementById("sl-header-logout")?.addEventListener("click", signOut);
  document.getElementById("sl-header-drawer-logout")?.addEventListener("click", signOut);

  if (!isLoggedIn) return;

  // Đồng bộ số liệu thật và cập nhật header tại chỗ (không render lại toàn bộ).
  void fetchLearnerOverview()
    .then((overview) => {
      cacheOverview(overview);

      const xpPill = document.getElementById("sl-header-xp-pill");
      const xpEl = document.getElementById("sl-header-xp");
      if (xpPill) xpPill.hidden = false;
      if (xpEl) xpEl.textContent = formatNumber(overview.stats.xpTotal);

      const streakPill = document.getElementById("sl-header-streak-pill");
      const streakEl = document.getElementById("sl-header-streak");
      if (streakPill) streakPill.hidden = false;
      if (streakEl) streakEl.textContent = `${overview.stats.currentStreak} ngày`;

      const langEl = document.getElementById("sl-header-lang");
      if (langEl) {
        langEl.textContent = languageLabel(overview.profile.targetLanguage);
      }

      const initial = (overview.profile.displayName.charAt(0) || "H").toUpperCase();
      const drawerAvatar = document.getElementById("sl-header-drawer-avatar");
      const drawerName = document.getElementById("sl-header-drawer-name");
      const drawerEmail = document.getElementById("sl-header-drawer-email");
      const avatar = document.getElementById("sl-header-avatar");
      if (drawerAvatar) drawerAvatar.textContent = initial;
      if (drawerName) drawerName.textContent = overview.profile.displayName;
      if (drawerEmail) drawerEmail.textContent = overview.profile.email || "Học viên";
      if (avatar) {
        avatar.textContent = initial;
        avatar.title = overview.profile.displayName;
      }

      document.documentElement.dataset.slLevel = String(overview.level);
      document.documentElement.dataset.slXpToNext = String(
        XP_PER_LEVEL - overview.xpIntoLevel
      );
    })
    .catch(() => {
      // Header giữ nguyên dữ liệu đã lưu; không dựng số liệu thay thế.
    });
}
