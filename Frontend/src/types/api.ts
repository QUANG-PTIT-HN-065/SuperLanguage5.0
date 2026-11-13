/* ============================================================
   Slanguage · api.ts
   Lớp dữ liệu duy nhất cho UI. Có backend thì gọi /api/v1/*,
   chưa có thì đọc JSON mock đúng cấu trúc ERD (mock/<table>.json).
   ============================================================ */

export type LanguageCode = "ja" | "en" | "vi";
export type CefrLevel = "A1" | "A2" | "B1" | "B2" | "C1" | "C2";

/* ---------- Bảng ERD ---------- */
export interface ProfileRow {
  id: string;
  email: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  native_language: LanguageCode;
  target_language: LanguageCode;
  current_level: CefrLevel | null;
  target_level: CefrLevel | null;
  learning_goal: "travel" | "work" | "study" | "exam" | "hobby" | "other";
  daily_goal_xp: number;
  role: "learner" | "admin";
}

export interface UserStatsRow {
  user_id: string;
  xp_total: number;
  words_learned: number;
  lessons_completed: number;
  current_streak: number;
  streak_start_date: string | null;
  longest_streak: number;
  last_activity_date: string | null;
  streak_freezes: number;
}

export interface TopicRow {
  id: number;
  language_code: LanguageCode;
  name: string;
  description: string | null;
  icon_url: string | null;
  sort_order: number;
}

export interface WordRow {
  id: number;
  language_code: LanguageCode;
  word: string;
  phonetic: string | null;
  meaning: string;
  part_of_speech: "noun" | "verb" | "adjective" | "adverb" | "phrase" | "other";
  level: CefrLevel;
  example_sentence: string | null;
  example_meaning: string | null;
}

export interface UserWordRow {
  user_id: string;
  word_id: number;
  mastery_level: number;
  review_count: number;
  last_reviewed_at: string | null;
  next_review_at: string;
}

export interface ConversationRow {
  id: string;
  user_id: string;
  title: string;
  language_code: LanguageCode;
  created_at: string;
  updated_at: string;
}

export interface MessageRow {
  id: string;
  conversation_id: string;
  sender_type: "user" | "ai";
  content: string;
  audio_url: string | null;
  ai_feedback: string | null;
  created_at: string;
}

/* ---------- Snapshot cho header ---------- */
export interface HeaderSnapshot {
  profile: ProfileRow;
  stats: UserStatsRow;
}

const API_BASE = "/api/v1";
const MOCK_BASE = "/mock";

/** Đổi true khi backend đã chạy thật. */
export const USE_MOCK = true;

function normalizePath(url: string): string {
  return url.startsWith("/") ? url : `/${url}`;
}

/** Endpoint API -> bảng mock tương ứng (tên file trùng tên bảng ERD). */
const MOCK_TABLES: Record<string, string> = {
  me: "profiles",
  topics: "topics",
  words: "words",
  user_words: "user_words",
  conversations: "conversations",
  messages: "messages",
};

/** URL mock tương ứng với một endpoint API (bỏ query string). */
function toMockUrl(url: string): string {
  const path = normalizePath(url).split("?")[0].replace(API_BASE, "");
  const key = path.split("/").filter(Boolean)[0] ?? "me";
  return `${MOCK_BASE}/${MOCK_TABLES[key] ?? key}.json`;
}

export interface RequestOptions {
  method?: "GET" | "POST" | "PATCH";
  body?: string;
  headers?: Record<string, string>;
}

/** Đọc JSON có kiểu; ném Error nếu HTTP fail hoặc payload sai shape. */
export async function fetchJson<T>(url: string, options: RequestOptions = {}): Promise<T> {
  const target = USE_MOCK && normalizePath(url).startsWith(API_BASE) ? toMockUrl(url) : normalizePath(url);
  const response = await fetch(target, {
    method: options.method ?? "GET",
    body: options.body,
    headers: { Accept: "application/json", ...(options.headers ?? {}) },
  });
  if (!response.ok) {
    throw new Error(`Không tải được dữ liệu (${response.status}).`);
  }
  return (await response.json()) as T;
}

/** Mock backend không có PATCH: lưu lựa chọn ngôn ngữ vào localStorage. */
const LANGUAGE_KEY = "slanguage_active_language";

export function readStoredLanguage(): LanguageCode | null {
  const value = localStorage.getItem(LANGUAGE_KEY);
  return value === "ja" || value === "en" || value === "vi" ? value : null;
}

export function writeStoredLanguage(code: LanguageCode): void {
  localStorage.setItem(LANGUAGE_KEY, code);
}

function head<T>(rows: T[]): T {
  if (rows.length === 0) {
    throw new Error("Dữ liệu mẫu đang trống.");
  }
  return rows[0];
}

export async function getHeaderSnapshot(): Promise<HeaderSnapshot> {
  const [profiles, stats] = await Promise.all([
    fetchJson<ProfileRow[]>(`${API_BASE}/me`),
    fetchJson<UserStatsRow[]>(`${API_BASE}/user_stats`),
  ]);
  const profile = head(profiles);
  const statRow = head(stats);
  const override = readStoredLanguage();
  return {
    profile: override ? { ...profile, target_language: override } : profile,
    stats: statRow,
  };
}

export async function updateTargetLanguage(code: LanguageCode): Promise<void> {
  writeStoredLanguage(code);
  if (USE_MOCK) return;
  await fetchJson(`${API_BASE}/me`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ target_language: code }),
  });
}
