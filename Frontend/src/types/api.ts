import { slanguageApi } from "./shared/api-client";

export type LanguageCode = "ja" | "en" | "vi";
export type CefrLevel = "A1" | "A2" | "B1" | "B2" | "C1" | "C2";
const CEFR_LEVELS: readonly CefrLevel[] = ["A1", "A2", "B1", "B2", "C1", "C2"];

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

const LANGUAGE_KEY = "slanguage_active_language";

export function readStoredLanguage(): LanguageCode | null {
  const value = localStorage.getItem(LANGUAGE_KEY);
  return value === "ja" || value === "en" || value === "vi" ? value : null;
}

export function writeStoredLanguage(code: LanguageCode): void {
  localStorage.setItem(LANGUAGE_KEY, code);
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`Backend trả về ${label} không hợp lệ.`);
  }
  return value as Record<string, unknown>;
}

function text(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Backend trả về ${label} không hợp lệ.`);
  }
  return value.trim();
}

function count(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`Backend trả về ${label} không hợp lệ.`);
  }
  return value;
}

function languageCode(value: unknown, label: string): LanguageCode {
  if (value === "en" || value === "ja" || value === "vi") return value;
  throw new Error(`Backend trả về ${label} không hợp lệ.`);
}

function cefrLevel(value: unknown, label: string): CefrLevel | null {
  if (value === null) return null;
  const level = CEFR_LEVELS.find((candidate) => candidate === value);
  if (level) return level;
  throw new Error(`Backend trả về ${label} không hợp lệ.`);
}

export async function getHeaderSnapshot(): Promise<HeaderSnapshot> {
  const response = await slanguageApi<unknown>("/api/v1/me");
  const data = asRecord(response.data, "hồ sơ học viên");
  const profileData = asRecord(data.profile, "hồ sơ học viên");
  const statsData = asRecord(data.stats, "thống kê học tập");
  const displayName = text(
    profileData.display_name || profileData.username,
    "tên học viên",
  );
  const email = text(profileData.email, "email học viên");
  const learningGoal = profileData.learning_goal;
  if (
    learningGoal !== "travel" &&
    learningGoal !== "work" &&
    learningGoal !== "study" &&
    learningGoal !== "exam" &&
    learningGoal !== "hobby" &&
    learningGoal !== "other"
  ) {
    throw new Error("Backend trả về mục tiêu học tập không hợp lệ.");
  }
  if (profileData.role !== "admin" && profileData.role !== "learner") {
    throw new Error("Backend trả về vai trò học viên không hợp lệ.");
  }
  const profile: ProfileRow = {
    id: text(profileData.id, "mã học viên"),
    email,
    username: text(profileData.username, "tên tài khoản"),
    display_name: displayName,
    avatar_url: typeof profileData.avatar_url === "string" ? profileData.avatar_url : null,
    native_language: languageCode(profileData.native_language, "ngôn ngữ mẹ đẻ"),
    target_language: languageCode(profileData.target_language, "ngôn ngữ đang học"),
    current_level: cefrLevel(profileData.current_level, "trình độ hiện tại"),
    target_level: cefrLevel(profileData.target_level, "trình độ mục tiêu"),
    learning_goal: learningGoal,
    daily_goal_xp: count(profileData.daily_goal_xp, "mục tiêu XP"),
    role: profileData.role,
  };
  const stats: UserStatsRow = {
    user_id: profile.id,
    xp_total: count(statsData.xp_total, "tổng XP"),
    words_learned: count(statsData.words_learned, "số từ đã học"),
    lessons_completed: count(statsData.lessons_completed, "số bài đã hoàn thành"),
    current_streak: count(statsData.current_streak, "chuỗi ngày học"),
    streak_start_date: typeof statsData.streak_start_date === "string" ? statsData.streak_start_date : null,
    longest_streak: count(statsData.longest_streak, "chuỗi học dài nhất"),
    last_activity_date: typeof statsData.last_activity_date === "string" ? statsData.last_activity_date : null,
    streak_freezes: count(statsData.streak_freezes, "số lần đóng băng chuỗi"),
  };
  return {
    profile,
    stats,
  };
}

export async function updateTargetLanguage(code: LanguageCode): Promise<void> {
  await slanguageApi("/api/v1/me", {
    method: "PATCH",
    body: { target_language: code },
  });
  writeStoredLanguage(code);
}
