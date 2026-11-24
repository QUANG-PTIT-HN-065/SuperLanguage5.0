import { getAuthCookie, isLearnerAuthenticated, slanguageApi } from "../shared/api-client";
import { renderLearnerHeader } from "../shared/learner-header";
import { clearSkeleton, showSkeleton } from "../shared/skeleton";
import { LOCALE_EVENT, t } from "../shared/i18n";

interface DailyQuest {
  id: string;
  title: string;
  progress: number;
  target: number;
  unit: string;
  completed: boolean;
}

interface WeeklyLeaderboardEntry {
  rank: number;
  username: string;
  display_name: string;
  avatar_url: string | null;
  xp_week: number;
  is_current_user: boolean;
}

interface StreakDay {
  date: string;
  studied: boolean;
}

// Dữ liệu đã tải gần nhất — dùng render lại khi đổi locale GIAO DIỆN.
interface DashboardCache {
  overview: unknown;
  streak: number;
  quests: DailyQuest[];
  days: StreakDay[];
  entries: WeeklyLeaderboardEntry[];
  weekStart: string;
}

let dashboardCache: DashboardCache | null = null;
let lastFallbackKey = "hm.loadingData";
let lastStatus: { key: string; isError: boolean; vars?: Record<string, string> } | null = null;

function invalidData(labelKey: string): Error {
  return new Error(t("hm.errInvalid", { label: t(labelKey) }));
}

function asRecord(value: unknown, labelKey: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw invalidData(labelKey);
  }
  return value as Record<string, unknown>;
}

function asArray<T>(value: unknown, labelKey: string): T[] {
  if (!Array.isArray(value)) {
    throw invalidData(labelKey);
  }
  return value as T[];
}

function asCount(value: unknown, labelKey: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw invalidData(labelKey);
  }
  return value;
}

function asText(value: unknown, labelKey: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw invalidData(labelKey);
  }
  return value.trim();
}

function setText(id: string, value: string): void {
  const element = document.getElementById(id);
  if (element) element.textContent = value;
}

function getTodayKey(): string {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function showStatus(messageKey: string, isError = false, vars?: Record<string, string>): void {
  const status = document.getElementById("dashboardApiStatus");
  if (!status) return;
  if (!messageKey) {
    lastStatus = null;
    status.hidden = true;
    status.textContent = "";
    status.dataset.state = "loading";
    return;
  }
  lastStatus = { key: messageKey, isError, vars };
  status.hidden = false;
  status.textContent = t(messageKey, vars);
  status.dataset.state = isError ? "error" : "loading";
}

function clearServerData(messageKey: string): void {
  lastFallbackKey = messageKey;
  const message = t(messageKey);
  setText("headerXPVal", "—");
  setText("headerStreakVal", "—");
  setText("headerHeartsVal", "—");
  setText("sidebarStreakValue", t("hm.streakUnknown"));
  clearSkeleton("homeDailyQuests");
  document.getElementById("homeDailyQuests")?.replaceChildren(
    document.createTextNode(message),
  );
  clearSkeleton("homeRankingList");
  document.getElementById("homeRankingList")?.replaceChildren(
    document.createTextNode(message),
  );
  clearSkeleton(document.querySelector(".streak-days"));
  document.querySelector(".streak-days")?.replaceChildren();
}

function renderDailyQuests(quests: DailyQuest[]): void {
  const container = document.getElementById("homeDailyQuests");
  if (!container) return;
  clearSkeleton(container);
  container.replaceChildren();

  if (!quests.length) {
    container.textContent = t("hm.questsEmpty");
    return;
  }

  for (const quest of quests) {
    const row = asRecord(quest, "hm.lbl.quest");
    const title = asText(row.title, "hm.lbl.questTitle");
    const progress = asCount(row.progress, "hm.lbl.questProgress");
    const target = asCount(row.target, "hm.lbl.questTarget");
    const unit = asText(row.unit, "hm.lbl.questUnit");
    if (typeof row.completed !== "boolean") {
      throw invalidData("hm.lbl.questCompleted");
    }

    const item = document.createElement("div");
    item.className = `quest-item ${row.completed ? "done" : "pending"}`;

    const check = document.createElement("div");
    check.className = "quest-check";
    if (row.completed) {
      const icon = document.createElement("i");
      icon.className = "fa-solid fa-check";
      check.append(icon);
    }

    const details = document.createElement("div");
    details.className = "quest-details";
    const titleElement = document.createElement("div");
    titleElement.className = "quest-title";
    titleElement.textContent = title;
    const progressElement = document.createElement("div");
    progressElement.className = "quest-reward";
    progressElement.textContent = row.completed
      ? t("hm.questDone")
      : `${progress}/${target} ${unit}`;
    details.append(titleElement, progressElement);
    item.append(check, details);
    container.append(item);
  }
}

function renderStreakWeek(days: StreakDay[]): void {
  const container = document.querySelector(".streak-days");
  if (!container) return;
  clearSkeleton(container);
  container.replaceChildren();
  const labels = [
    t("hm.daySun"),
    t("hm.dayMon"),
    t("hm.dayTue"),
    t("hm.dayWed"),
    t("hm.dayThu"),
    t("hm.dayFri"),
    t("hm.daySat"),
  ];
  const today = getTodayKey();

  for (const value of days) {
    const row = asRecord(value, "hm.lbl.day");
    const date = asText(row.date, "hm.lbl.day");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || typeof row.studied !== "boolean") {
      throw invalidData("hm.lbl.day");
    }

    const day = document.createElement("div");
    day.className = "day-circle";
    const label = document.createElement("span");
    label.className = "day-name";
    label.textContent = labels[new Date(`${date}T00:00:00`).getDay()];
    const bubble = document.createElement("div");
    bubble.className = `day-bubble${row.studied ? " checked" : ""}`;
    bubble.setAttribute("aria-label", row.studied ? t("hm.studied") : t("hm.notStudied"));
    if (row.studied) {
      const icon = document.createElement("i");
      icon.className = "fa-solid fa-check";
      bubble.append(icon);
    } else if (date === today) {
      bubble.classList.add("active-today");
      const flame = document.createElement("img");
      flame.src = "../../../assets/streak-flame.gif?v=4";
      flame.alt = "";
      flame.className = "streak-flame-img streak-flame-day";
      bubble.append(flame);
      bubble.setAttribute("aria-label", t("hm.todayBubble"));
    } else {
      bubble.textContent = "·";
    }
    day.append(label, bubble);
    container.append(day);
  }
}

function renderLeaderboard(entries: WeeklyLeaderboardEntry[]): void {
  const container = document.getElementById("homeRankingList");
  if (!container) return;
  clearSkeleton(container);
  container.replaceChildren();

  if (!entries.length) {
    container.textContent = t("hm.boardEmpty");
    return;
  }

  for (const value of entries) {
    const row = asRecord(value, "hm.lbl.rankEntry");
    const rank = asCount(row.rank, "hm.lbl.rank");
    const username = asText(row.username, "hm.lbl.username");
    const name =
      typeof row.display_name === "string" && row.display_name.trim()
        ? row.display_name.trim()
        : username;
    const xp = asCount(row.xp_week, "hm.lbl.xpWeek");
    if (typeof row.is_current_user !== "boolean") {
      throw invalidData("hm.lbl.rankUserState");
    }

    const item = document.createElement("div");
    item.className = `rank-item${row.is_current_user ? " is-user" : ""}`;
    const rankElement = document.createElement("span");
    const medalClass = rank === 1 ? "gold" : rank === 2 ? "silver" : rank === 3 ? "bronze" : "";
    rankElement.className = `rank-num ${medalClass}`.trim();
    rankElement.textContent = String(rank);

    const avatarUrl =
      typeof row.avatar_url === "string" && row.avatar_url.startsWith("https://")
        ? row.avatar_url
        : null;
    const avatar = document.createElement(avatarUrl ? "img" : "span");
    avatar.className = "rank-avatar";
    avatar.setAttribute("aria-hidden", "true");
    if (avatar instanceof HTMLImageElement && avatarUrl) {
      avatar.src = avatarUrl;
      avatar.alt = "";
      avatar.loading = "lazy";
    } else {
      avatar.textContent = name.slice(0, 1).toLocaleUpperCase("vi-VN");
    }

    const nameElement = document.createElement("span");
    nameElement.className = "rank-name";
    nameElement.textContent = name;
    const xpElement = document.createElement("span");
    xpElement.className = "rank-xp";
    xpElement.textContent = `${xp.toLocaleString("vi-VN")} XP`;
    item.append(rankElement, avatar, nameElement, xpElement);
    container.append(item);
  }
}

async function loadLearnerDashboard(): Promise<void> {
  clearServerData("hm.loadingData");
  if (!isLearnerAuthenticated()) {
    if (getAuthCookie("slanguage_is_logged_in") === "true") {
      clearServerData("hm.invalidSession");
      showStatus("hm.noToken", true);
    }
    return;
  }

  showStatus("hm.loadingServer");
  showSkeleton("homeDailyQuests", "quest-rows", { tone: "amethyst" });
  showSkeleton(document.querySelector(".streak-days"), "streak-week", { tone: "amethyst" });
  showSkeleton("homeRankingList", "rank-rows", { tone: "amethyst" });
  try {
    const [overviewResponse, dashboardResponse] = await Promise.all([
      slanguageApi<unknown>("/api/v1/me"),
      slanguageApi<unknown>("/api/v1/me/dashboard"),
    ]);

    const overview = asRecord(overviewResponse.data, "hm.lbl.profile");
    const stats = asRecord(overview.stats, "hm.lbl.stats");
    const dashboard = asRecord(dashboardResponse.data, "hm.lbl.dashboard");
    const streak = asCount(stats.current_streak, "hm.lbl.streak");
    const quests = asArray<DailyQuest>(dashboard.daily_quests, "hm.lbl.quest");
    const days = asArray<StreakDay>(dashboard.streak_week, "hm.lbl.streakWeek");
    const entries = asArray<WeeklyLeaderboardEntry>(
      dashboard.weekly_leaderboard,
      "hm.lbl.leaderboard",
    );
    const weekStart = asText(dashboard.week_start, "hm.lbl.weekStart");

    renderLearnerHeader(overviewResponse.data);
    setText("sidebarStreakValue", t("hm.streakDays", { n: streak }));

    renderDailyQuests(quests);
    renderStreakWeek(days);
    renderLeaderboard(entries);
    setText("homeLeaderboardPeriod", t("hm.weekFrom", { date: weekStart }));
    dashboardCache = {
      overview: overviewResponse.data,
      streak,
      quests,
      days,
      entries,
      weekStart,
    };
    showStatus("");
  } catch (error) {
    clearServerData("hm.loadFail");
    const message =
      error instanceof Error ? error.message : t("hm.unknownError");
    showStatus("hm.loadFailDetail", true, { message });
  }
}

// Đổi locale GIAO DIỆN: render lại các vùng động bằng dữ liệu đã cache.
window.addEventListener(LOCALE_EVENT, () => {
  if (dashboardCache) {
    renderLearnerHeader(dashboardCache.overview);
    setText("sidebarStreakValue", t("hm.streakDays", { n: dashboardCache.streak }));
    renderDailyQuests(dashboardCache.quests);
    renderStreakWeek(dashboardCache.days);
    renderLeaderboard(dashboardCache.entries);
    setText("homeLeaderboardPeriod", t("hm.weekFrom", { date: dashboardCache.weekStart }));
  } else {
    clearServerData(lastFallbackKey);
    setText("homeLeaderboardPeriod", t("hm.weekThis"));
  }
  if (lastStatus) {
    showStatus(lastStatus.key, lastStatus.isError, lastStatus.vars);
  }
});

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => void loadLearnerDashboard(), {
    once: true,
  });
} else {
  void loadLearnerDashboard();
}
