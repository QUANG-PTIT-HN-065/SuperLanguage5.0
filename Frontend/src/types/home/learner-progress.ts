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

import { slanguageApi } from "./api-client";

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
  planId: string;
}

export interface LearnerOverview {
  profile: LearnerProfileSummary;
  stats: LearnerStats;
  level: number;
  xpIntoLevel: number;
  needsOnboarding: boolean;
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
 * Gọi /api/v1/me và chuẩn hoá payload thật của backend.
 * Không dùng giá trị mặc định mang tính "thành tích" (2450 XP, 14 ngày...).
 */
export async function fetchLearnerOverview(): Promise<LearnerOverview> {
  const payload = asRecord(
    await slanguageApi("/api/v1/me", { method: "GET" })
  );
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
  };
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
  const payload = (await slanguageApi(
    `/api/v1/vocabulary/topics?limit=${limit}&offset=${offset}`,
    { method: "GET" },
  )) as Record<string, unknown>;

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

  const payload = (await slanguageApi(
    `/api/v1/vocabulary/words?${qs.toString()}`,
    { method: "GET" },
  )) as Record<string, unknown>;

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
