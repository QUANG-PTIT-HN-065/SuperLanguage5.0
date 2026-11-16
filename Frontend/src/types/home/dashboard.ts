import { isLearnerAuthenticated, slanguageApi } from "../shared/api-client";

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

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`Backend trả về ${label} không hợp lệ.`);
  }
  return value as Record<string, unknown>;
}

function asArray<T>(value: unknown, label: string): T[] {
  if (!Array.isArray(value)) {
    throw new Error(`Backend trả về ${label} không hợp lệ.`);
  }
  return value as T[];
}

function asCount(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`Backend trả về ${label} không hợp lệ.`);
  }
  return value;
}

function asText(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Backend trả về ${label} không hợp lệ.`);
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

function showStatus(message: string, isError = false): void {
  const status = document.getElementById("dashboardApiStatus");
  if (!status) return;
  status.hidden = !message;
  status.textContent = message;
  status.dataset.state = isError ? "error" : "loading";
}

function clearServerData(message: string): void {
  setText("headerXPVal", "—");
  setText("headerStreakVal", "—");
  setText("headerHeartsVal", "—");
  setText("sidebarStreakValue", "— Ngày");
  document.getElementById("homeDailyQuests")?.replaceChildren(
    document.createTextNode(message),
  );
  document.getElementById("homeRankingList")?.replaceChildren(
    document.createTextNode(message),
  );
  document.querySelector(".streak-days")?.replaceChildren();
}

function renderDailyQuests(quests: DailyQuest[]): void {
  const container = document.getElementById("homeDailyQuests");
  if (!container) return;
  container.replaceChildren();

  if (!quests.length) {
    container.textContent = "Hôm nay chưa có nhiệm vụ.";
    return;
  }

  for (const quest of quests) {
    const row = asRecord(quest, "nhiệm vụ");
    const title = asText(row.title, "tên nhiệm vụ");
    const progress = asCount(row.progress, "tiến độ nhiệm vụ");
    const target = asCount(row.target, "mục tiêu nhiệm vụ");
    const unit = asText(row.unit, "đơn vị nhiệm vụ");
    if (typeof row.completed !== "boolean") {
      throw new Error("Backend trả về trạng thái nhiệm vụ không hợp lệ.");
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
      ? "Hoàn thành"
      : `${progress}/${target} ${unit}`;
    details.append(titleElement, progressElement);
    item.append(check, details);
    container.append(item);
  }
}

function renderStreakWeek(days: StreakDay[]): void {
  const container = document.querySelector(".streak-days");
  if (!container) return;
  container.replaceChildren();
  const labels = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
  const today = getTodayKey();

  for (const value of days) {
    const row = asRecord(value, "ngày học");
    const date = asText(row.date, "ngày học");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || typeof row.studied !== "boolean") {
      throw new Error("Backend trả về ngày học không hợp lệ.");
    }

    const day = document.createElement("div");
    day.className = "day-circle";
    const label = document.createElement("span");
    label.className = "day-name";
    label.textContent = labels[new Date(`${date}T00:00:00`).getDay()];
    const bubble = document.createElement("div");
    bubble.className = `day-bubble${row.studied ? " checked" : ""}`;
    bubble.setAttribute("aria-label", row.studied ? "Đã học" : "Chưa học");
    if (row.studied) {
      const icon = document.createElement("i");
      icon.className = "fa-solid fa-check";
      bubble.append(icon);
    } else if (date === today) {
      bubble.classList.add("active-today");
      bubble.textContent = "Hôm nay";
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
  container.replaceChildren();

  if (!entries.length) {
    container.textContent = "Chưa có dữ liệu xếp hạng tuần này.";
    return;
  }

  for (const value of entries) {
    const row = asRecord(value, "thành viên xếp hạng");
    const rank = asCount(row.rank, "thứ hạng");
    const username = asText(row.username, "tên tài khoản");
    const name =
      typeof row.display_name === "string" && row.display_name.trim()
        ? row.display_name.trim()
        : username;
    const xp = asCount(row.xp_week, "XP tuần");
    if (typeof row.is_current_user !== "boolean") {
      throw new Error("Backend trả về trạng thái người dùng xếp hạng không hợp lệ.");
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
  clearServerData("Đang tải dữ liệu...");
  if (!isLearnerAuthenticated()) {
    if (localStorage.getItem("slanguage_is_logged_in") === "true") {
      clearServerData("Phiên đăng nhập không hợp lệ. Vui lòng đăng nhập lại.");
      showStatus("Không tìm thấy access token. Vui lòng đăng nhập lại.", true);
    }
    return;
  }

  showStatus("Đang tải dữ liệu học tập từ máy chủ.");
  try {
    const [overviewResponse, dashboardResponse] = await Promise.all([
      slanguageApi<unknown>("/api/v1/me"),
      slanguageApi<unknown>("/api/v1/me/dashboard"),
    ]);

    const overview = asRecord(overviewResponse.data, "hồ sơ học viên");
    const profile = asRecord(overview.profile, "hồ sơ học viên");
    const stats = asRecord(overview.stats, "thống kê học tập");
    const dashboard = asRecord(dashboardResponse.data, "bảng điều khiển");
    const xp = asCount(stats.xp_total, "tổng XP");
    const streak = asCount(stats.current_streak, "chuỗi ngày học");
    const displayName =
      typeof profile.display_name === "string" && profile.display_name.trim()
        ? profile.display_name.trim()
        : asText(profile.username, "tên học viên");

    setText("headerXPVal", `${xp.toLocaleString("vi-VN")} XP`);
    setText("headerStreakVal", `${streak} Ngày`);
    setText("sidebarStreakValue", `${streak} Ngày`);
    document.querySelectorAll(".user-info-text .name").forEach((element) => {
      element.textContent = displayName;
    });

    renderDailyQuests(asArray<DailyQuest>(dashboard.daily_quests, "nhiệm vụ"));
    renderStreakWeek(asArray<StreakDay>(dashboard.streak_week, "chuỗi ngày"));
    renderLeaderboard(
      asArray<WeeklyLeaderboardEntry>(
        dashboard.weekly_leaderboard,
        "bảng xếp hạng tuần",
      ),
    );
    setText(
      "homeLeaderboardPeriod",
      `Tuần từ ${asText(dashboard.week_start, "ngày bắt đầu tuần")}`,
    );
    showStatus("");
  } catch (error) {
    clearServerData("Không thể tải dữ liệu.");
    const message =
      error instanceof Error ? error.message : "Lỗi không xác định khi tải dữ liệu.";
    showStatus(`Không thể tải dữ liệu học tập từ backend: ${message}`, true);
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => void loadLearnerDashboard(), {
    once: true,
  });
} else {
  void loadLearnerDashboard();
}
