/* ============================================================
   Slanguage · state/store.ts
   Store nhỏ, không dependency: giữ snapshot của header
   (profile + stats + ngôn ngữ) và báo cho các subscriber.
   ============================================================ */

import { getHeaderSnapshot, updateTargetLanguage } from "../api.js";
import type { LanguageCode, ProfileRow, UserStatsRow } from "../api.js";

export type StoreStatus = "idle" | "loading" | "ready" | "error";

export interface HeaderState {
  status: StoreStatus;
  profile: ProfileRow | null;
  stats: UserStatsRow | null;
  language: LanguageCode;
  error: string | null;
}

export type Listener = (state: HeaderState) => void;

export interface Store {
  get(): HeaderState;
  set(patch: Partial<HeaderState>): void;
  subscribe(listener: Listener): () => void;
}

const initialState: HeaderState = {
  status: "idle",
  profile: null,
  stats: null,
  language: "ja",
  error: null,
};

/** Factory thuần: state trong, không side effect ngoài closure. */
export function createStore(start: HeaderState = initialState): Store {
  let state = start;
  const listeners = new Set<Listener>();

  return {
    get: () => state,
    set(patch) {
      state = { ...state, ...patch };
      for (const listener of listeners) listener(state);
    },
    subscribe(listener) {
      listeners.add(listener);
      listener(state);
      return () => listeners.delete(listener);
    },
  };
}

export const headerStore = createStore();

export async function loadHeader(): Promise<HeaderState> {
  headerStore.set({ status: "loading", error: null });
  try {
    const snapshot = await getHeaderSnapshot();
    headerStore.set({
      status: "ready",
      profile: snapshot.profile,
      stats: snapshot.stats,
      language: snapshot.profile.target_language,
    });
  } catch (error) {
    headerStore.set({
      status: "error",
      error: error instanceof Error ? error.message : "Không tải được hồ sơ học tập.",
    });
  }
  return headerStore.get();
}

export async function setLearningLanguage(code: LanguageCode): Promise<void> {
  const previous = headerStore.get();
  const profile = previous.profile;
  headerStore.set({
    language: code,
    profile: profile ? { ...profile, target_language: code } : profile,
  });
  try {
    await updateTargetLanguage(code);
  } catch (error) {
    headerStore.set({
      language: previous.language,
      profile,
      error: error instanceof Error ? error.message : "Không đổi được ngôn ngữ.",
    });
  }
}
