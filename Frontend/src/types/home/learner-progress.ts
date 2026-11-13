/**
 * slanguage-learner-progress.ts
 * Nguồn dữ liệu tiến độ duy nhất cho khu vực học tập.
 *
 * Chỉ đọc từ hai endpoint thật đang tồn tại:
 *   - GET /api/v1/me  -> profile, stats, plan
 *   - GET /api/v1/vocabulary/topics, /words (nơi gọi trực tiếp)
 *
 * Backend trả về snake_case cho stats (x_total, current_streak, ...).
 * Không tạo số liệu, cấp độ hay mục tiêu nếu API không trả về.
 */

import { slanguageApi, slanguageApiOrMock } from "../shared/api-client";

export const XP_PER_LEVEL = 100;

export interface LearnerStats {
  xpTotal: number;
  wordsLearned: number;
  lessonsCompleted: number;
  currentStreak: number;
  longestStreak: number;
  studiedToday: boolean;
  lastActivityDate: string | null;
  streakFreezes: number;
}

export interface LearnerProfileSummary {
  displayName: string;
  email: string;
  userId: string;
  targetLanguage: string;
  currentLevel: string;
  targetLevel: string;
  dailyGoalXp: number;
  dailyGoalMinutes: number;
  dailyGoalLessons: number;
  planId: string;
}

export interface LearnerOverview {
  profile: LearnerProfileSummary;
  stats: LearnerStats;
  level: number;
  xpIntoLevel: number;
  needsOnboarding: boolean;
  dailyActivity: DailyActivityRow[];
}

export interface CachedProgress {
  name: string;
  xp: number;
  streak: number;
  syncedAt: string;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function toInt(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

function toText(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim() !== ""
    ? value.trim()
    : fallback;
}

function toBool(value: unknown): boolean {
  return value === true || value === "true";
}

export function levelFromXp(xpTotal: number): number {
  return Math.floor(Math.max(0, xpTotal) / XP_PER_LEVEL) + 1;
}

export function formatNumber(value: number): string {
  return Math.max(0, Math.trunc(value)).toLocaleString("vi-VN");
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function languageLabel(code: string): string {
  const labels: Record<string, string> = {
    en: "Tiếng Anh",
    ja: "Tiếng Nhật",
    vi: "Tiếng Việt",
  };
  return labels[code] ?? (code ? code.toUpperCase() : "Chưa chọn");
}

/**
 * Chuẩn hoá payload thật của GET /api/v1/me.
 * Không dùng giá trị mặc định mang tính "thành tích" (2450 XP, 14 ngày...).
 */
export function parseLearnerOverview(value: unknown): LearnerOverview {
  const payload = asRecord(value);
  const profile = asRecord(payload.profile);
  const stats = asRecord(payload.stats);

  const xpTotal = toInt(stats.xp_total ?? stats.xp);
  const displayName =
    toText(profile.display_name) ||
    toText(profile.username) ||
    localStorage.getItem("slanguage_user_name") ||
    "Học viên";

  return {
    profile: {
      displayName,
      email: toText(profile.email) || localStorage.getItem("slanguage_user_email") || "",
      userId: toText(profile.id) || localStorage.getItem("slanguage_user_id") || "",
      targetLanguage: toText(profile.target_language),
      currentLevel: toText(profile.current_level),
      targetLevel: toText(profile.target_level),
      dailyGoalXp: toInt(profile.daily_goal_xp),
      dailyGoalMinutes: toInt(profile.daily_goal_minutes),
      dailyGoalLessons: toInt(profile.daily_goal_lessons),
      planId: toText(profile.plan_id),
    },
    stats: {
      xpTotal,
      wordsLearned: toInt(stats.words_learned),
      lessonsCompleted: toInt(stats.lessons_completed),
      currentStreak: toInt(stats.current_streak),
      longestStreak: toInt(stats.longest_streak),
      studiedToday: toBool(stats.studied_today),
      lastActivityDate: toText(stats.last_activity_date) || null,
      streakFreezes: toInt(stats.streak_freezes),
    },
    level: levelFromXp(xpTotal),
    xpIntoLevel: xpTotal % XP_PER_LEVEL,
    needsOnboarding: payload.needs_onboarding === true,
    dailyActivity: parseDailyActivity(payload.daily_activity),
  };
}

/**
 * GET /api/v1/me. `allowMock` chỉ bật ở chế độ xem thử (backend chưa chạy);
 * lỗi HTTP/xác thực vẫn được ném ra để trang hiện trạng thái lỗi + Thử lại.
 */
export async function fetchLearnerOverview(allowMock = false): Promise<LearnerOverview> {
  const payload = allowMock
    ? await slanguageApiOrMock<unknown>("/api/v1/me", "me.json")
    : (await slanguageApi("/api/v1/me", { method: "GET" })).data;
  return parseLearnerOverview(payload);
}

/**
 * Ghi lại các giá trị thật đã tải để header hiển thị nhất quán.
 * Chỉ ghi khi đã có dữ liệu thành công, không tạo giá trị giả.
 */
export function cacheOverview(overview: LearnerOverview): void {
  localStorage.setItem("slanguage_user_name", overview.profile.displayName);
  if (overview.profile.email) {
    localStorage.setItem("slanguage_user_email", overview.profile.email);
  }
  if (overview.profile.targetLanguage) {
    localStorage.setItem("slanguage_active_language", overview.profile.targetLanguage);
  }
  if (overview.profile.dailyGoalXp > 0) {
    localStorage.setItem("slanguage_daily_goal", String(overview.profile.dailyGoalXp));
  }
  localStorage.setItem("slanguage_user_xp", String(overview.stats.xpTotal));
  localStorage.setItem("slanguage_streak", String(overview.stats.currentStreak));
  localStorage.setItem("slanguage_stats_synced", "true");
  localStorage.setItem("slanguage_stats_synced_at", new Date().toISOString());
}

export function readCachedProgress(): CachedProgress | null {
  if (localStorage.getItem("slanguage_stats_synced") !== "true") return null;

  const xp = Number.parseInt(localStorage.getItem("slanguage_user_xp") ?? "", 10);
  const streak = Number.parseInt(localStorage.getItem("slanguage_streak") ?? "", 10);
  if (!Number.isFinite(xp)) return null;

  return {
    name: localStorage.getItem("slanguage_user_name") || "Học viên",
    xp,
    streak: Number.isFinite(streak) ? streak : 0,
    syncedAt: localStorage.getItem("slanguage_stats_synced_at") || "",
  };
}

export function clearProgressCache(): void {
  localStorage.removeItem("slanguage_user_xp");
  localStorage.removeItem("slanguage_user_streak");
  localStorage.removeItem("slanguage_stats_synced");
  localStorage.removeItem("slanguage_stats_synced_at");
}

/** Một dòng của bảng daily_activity (ERD). Backend chưa có endpoint riêng. */
export interface DailyActivityRow {
  activityDate: string;
  xpEarned: number;
  lessonsCompleted: number;
  goalMet: boolean;
}

export interface LevelProgress {
  level: number;
  nextLevel: number;
  xpIntoLevel: number;
  xpPerLevel: number;
  xpToNext: number;
  percent: number;
}

export interface DailyGoalProgress {
  xpToday: number;
  goalXp: number;
  percent: number;
  remaining: number;
  met: boolean;
}

export interface StreakDay {
  date: string;
  label: string;
  dayNumber: number;
  studied: boolean;
  isToday: boolean;
  isFuture: boolean;
}

const WEEKDAY_LABELS = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
const DAY_IN_MS = 86_400_000;
const DAILY_XP_KEY = "slanguage_daily_xp";

export function toDateKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function levelProgress(xpTotal: number): LevelProgress {
  const xp = Math.max(0, Math.trunc(xpTotal));
  const level = levelFromXp(xp);
  const xpIntoLevel = xp % XP_PER_LEVEL;
  return {
    level,
    nextLevel: level + 1,
    xpIntoLevel,
    xpPerLevel: XP_PER_LEVEL,
    xpToNext: XP_PER_LEVEL - xpIntoLevel,
    percent: Math.round((xpIntoLevel / XP_PER_LEVEL) * 100),
  };
}

export function dailyGoalProgress(xpToday: number, goalXp: number): DailyGoalProgress {
  const goal = Math.max(1, Math.trunc(goalXp));
  const earned = Math.max(0, Math.trunc(xpToday));
  return {
    xpToday: earned,
    goalXp: goal,
    percent: Math.min(100, Math.round((earned / goal) * 100)),
    remaining: Math.max(0, goal - earned),
    met: earned >= goal,
  };
}

/** stroke-dashoffset cho vòng tròn tiến độ, quay theo chiều kim đồng hồ từ đỉnh 12h. */
export function ringOffset(percent: number, radius: number): number {
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.min(100, Math.max(0, percent));
  return circumference * (1 - clamped / 100);
}

export function parseDailyActivity(value: unknown): DailyActivityRow[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => asRecord(entry))
    .filter((row) => typeof row.activity_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(row.activity_date))
    .map((row) => ({
      activityDate: String(row.activity_date),
      xpEarned: Math.max(0, toInt(row.xp_earned)),
      lessonsCompleted: Math.max(0, toInt(row.lessons_completed)),
      goalMet: toBool(row.goal_met),
    }))
    .sort((a, b) => a.activityDate.localeCompare(b.activityDate));
}

/** Dời cửa sổ dữ liệu mẫu để ngày mới nhất trùng hôm nay (chỉ dùng cho mock). */
export function shiftActivityToToday(rows: DailyActivityRow[], today: Date): DailyActivityRow[] {
  if (!rows.length) return rows;
  const newest = new Date(`${rows[rows.length - 1].activityDate}T00:00:00`);
  const delta = Math.round((today.getTime() - newest.getTime()) / DAY_IN_MS);
  if (!delta) return rows;
  return rows.map((row) => {
    const shifted = new Date(`${row.activityDate}T00:00:00`);
    shifted.setDate(shifted.getDate() + delta);
    return { ...row, activityDate: toDateKey(shifted) };
  });
}

/**
 * Bảy ngày của tuần hiện tại (Thứ Hai → Chủ Nhật).
 * Có daily_activity thì đọc trực tiếp; không thì suy ra từ cửa sổ streak.
 */
export function buildStreakWeek(
  rows: DailyActivityRow[],
  stats: LearnerStats,
  today: Date,
): StreakDay[] {
  const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const todayKey = toDateKey(today);
  const byDate = new Map(rows.map((row) => [row.activityDate, row]));

  let streakStartKey = "";
  let streakEndKey = "";
  if (stats.currentStreak > 0 && stats.lastActivityDate) {
    const end = new Date(`${stats.lastActivityDate}T00:00:00`);
    const start = new Date(end.getTime());
    start.setDate(start.getDate() - (stats.currentStreak - 1));
    streakStartKey = toDateKey(start);
    streakEndKey = toDateKey(end);
  }

  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(monday.getTime());
    date.setDate(monday.getDate() + index);
    const key = toDateKey(date);
    const row = byDate.get(key);
    const studied = row
      ? row.xpEarned > 0 || row.lessonsCompleted > 0
      : Boolean(streakStartKey) && key >= streakStartKey && key <= streakEndKey;
    return {
      date: key,
      label: WEEKDAY_LABELS[date.getDay()],
      dayNumber: date.getDate(),
      studied,
      isToday: key === todayKey,
      isFuture: key > todayKey,
    };
  });
}

/** XP hôm nay: ưu tiên daily_activity, sau đó bộ đếm cục bộ của thiết bị. */
export function resolveTodayXp(
  rows: DailyActivityRow[],
  today: Date,
  localXp: number,
): number {
  const key = toDateKey(today);
  const row = rows.find((entry) => entry.activityDate === key);
  return row ? row.xpEarned : Math.max(0, localXp);
}

export function readLocalDailyXp(today: Date): number {
  try {
    const raw = localStorage.getItem(DAILY_XP_KEY);
    if (!raw) return 0;
    const parsed = asRecord(JSON.parse(raw));
    return parsed.date === toDateKey(today) ? Math.max(0, toInt(parsed.xp)) : 0;
  } catch {
    return 0;
  }
}

export function addLocalDailyXp(amount: number, today: Date): number {
  const next = readLocalDailyXp(today) + Math.max(0, Math.trunc(amount));
  localStorage.setItem(DAILY_XP_KEY, JSON.stringify({ date: toDateKey(today), xp: next }));
  return next;
}

/** Trung bình tiến độ các chủ đề — dùng cho thanh tiến độ trên card lộ trình. */
export function pathProgressPercent(topics: Array<{ progress_percent: number }>): number {
  if (!topics.length) return 0;
  const total = topics.reduce((sum, topic) => sum + Math.min(100, Math.max(0, topic.progress_percent)), 0);
  return Math.round(total / topics.length);
}

/** Represent a vocabulary topic returned by GET /api/v1/vocabulary/topics */
export interface VocabularyTopic {
  id: number;
  language_code: string;
  name: string;
  description: string | null;
  icon_url: string | null;
  sort_order: number;
}

/** Represent a single word returned by GET /api/v1/vocabulary/words */
export interface VocabularyWord {
  id: number;
  language_code: string;
  word: string;
  phonetic: string | null;
  meaning: string;
  part_of_speech: string | null;
  audio_url: string | null;
  example_sentence: string | null;
  example_meaning: string | null;
  level: string;
  created_at: string;
  updated_at: string | null;
}

/** Paginated payload shared by topics and words endpoints */
export interface PaginatedVocabulary<T> {
  items: T[];
  total: number;
  available: number;
  limit: number;
  offset: number;
  plan: "free" | "premium";
  topic?: VocabularyTopic | null;
}

/** Convert snake_case topic row from backend into VocabularyTopic */
function toTopic(row: Record<string, unknown>): VocabularyTopic {
  return {
    id: toInt(row.id),
    language_code: toText(row.language_code),
    name: toText(row.name),
    description: typeof row.description === "string" ? row.description : null,
    icon_url: typeof row.icon_url === "string" ? row.icon_url : null,
    sort_order: toInt(row.sort_order),
  };
}

/** Convert snake_case word row from backend into VocabularyWord */
function toWord(row: Record<string, unknown>): VocabularyWord {
  return {
    id: toInt(row.id),
    language_code: toText(row.language_code),
    word: toText(row.word),
    phonetic: typeof row.phonetic === "string" ? row.phonetic : null,
    meaning: toText(row.meaning),
    part_of_speech: typeof row.part_of_speech === "string" ? row.part_of_speech : null,
    audio_url: typeof row.audio_url === "string" ? row.audio_url : null,
    example_sentence: typeof row.example_sentence === "string" ? row.example_sentence : null,
    example_meaning: typeof row.example_meaning === "string" ? row.example_meaning : null,
    level: toText(row.level),
    created_at: typeof row.created_at === "string" ? row.created_at : "",
    updated_at: typeof row.updated_at === "string" ? row.updated_at : null,
  };
}

/**
 * Gọi GET /api/v1/vocabulary/topics — danh sách chủ đề theo ngôn ngữ đang học
 * và gói hiện tại (free/premium đã được backend lọc sẵn).
 */
export async function fetchVocabularyTopics(
  limit = 50,
  offset = 0,
): Promise<PaginatedVocabulary<VocabularyTopic>> {
  const response = await slanguageApi(
    `/api/v1/vocabulary/topics?limit=${limit}&offset=${offset}`,
    { method: "GET" },
  );
  const payload = asRecord(response.data);

  const items = Array.isArray(payload.items) ? payload.items : [];
  return {
    items: items.map((row: Record<string, unknown>) => toTopic(asRecord(row))),
    total: toInt(payload.total),
    available: toInt(payload.available),
    limit: toInt(payload.limit),
    offset: toInt(payload.offset),
    plan: (payload.plan === "premium" ? "premium" : "free") as "free" | "premium",
  };
}

/**
 * Gọi GET /api/v1/vocabulary/words — danh sách từ vựng, có thể lọc theo topic_id.
 */
export async function fetchVocabularyWords(
  limit = 50,
  offset = 0,
  topicId?: number,
): Promise<PaginatedVocabulary<VocabularyWord>> {
  const qs = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  if (topicId !== undefined) qs.set("topic_id", String(topicId));

  const response = await slanguageApi(
    `/api/v1/vocabulary/words?${qs.toString()}`,
    { method: "GET" },
  );
  const payload = asRecord(response.data);

  const items = Array.isArray(payload.items) ? payload.items : [];
  return {
    items: items.map((row: Record<string, unknown>) => toWord(asRecord(row))),
    total: toInt(payload.total),
    available: toInt(payload.available),
    limit: toInt(payload.limit),
    offset: toInt(payload.offset),
    plan: (payload.plan === "premium" ? "premium" : "free") as "free" | "premium",
    topic: payload.topic ? toTopic(asRecord(payload.topic)) : null,
  };
}
