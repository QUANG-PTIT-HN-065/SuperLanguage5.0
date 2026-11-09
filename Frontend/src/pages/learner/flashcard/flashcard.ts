/**
 * slanguage-flashcard.ts
 * Kho thẻ từ vựng dựa trên dữ liệu thật.
 *
 * - Từ: GET /api/v1/vocabulary/words (lọc topic_id nếu có trên URL)
 * - Giữ hành vi học hiện có: lật thẻ, nghe phát âm, chấm Khó/Tốt/Dễ,
 *   phím tắt Space/1/2/3.
 * - Không cộng XP giả và không tuyên bố đã lưu lịch SRS: backend chưa có
 *   endpoint tương ứng. Bộ đếm chỉ phản ánh phiên hiện tại.
 */

import { renderHeader } from "../../../types/shared/header";
import { initPageReveal } from "../../../types/shared/gsap-animations";
import {
  getLearnerProfile,
  isLearnerAuthenticated,
  slanguageApi,
} from "../../../types/shared/api-client";

renderHeader({ containerId: "sl-header", activePage: "flashcard" });

interface WordItem {
  id?: number | string;
  word?: string;
  phonetic?: string | null;
  meaning?: string | null;
  part_of_speech?: string | null;
  audio_url?: string | null;
  example_sentence?: string | null;
  example_meaning?: string | null;
  level?: string | null;
  language_code?: string | null;
}

interface WordsPayload {
  items?: WordItem[];
  total?: number;
  available?: number;
  plan?: string;
  topic?: { id?: number; name?: string } | null;
}

interface FlashcardWord {
  id: string;
  word: string;
  phonetic: string;
  meaning: string;
  partOfSpeech: string;
  example: string;
  exampleMeaning: string;
  level: string;
  languageCode: string;
}

const authGuard = document.getElementById("sl-auth-guard");
const content = document.getElementById("sl-flashcard-content");
const loadingEl = document.getElementById("sl-fc-loading");
const errorEl = document.getElementById("sl-fc-error");
const errorMessageEl = document.getElementById("sl-fc-error-message");
const emptyEl = document.getElementById("sl-fc-empty");
const cardEl = document.getElementById("sl-fc-card");
const summaryEl = document.getElementById("sl-fc-summary");
const statusEl = document.getElementById("sl-fc-status");
const introEl = document.getElementById("sl-fc-intro");
const retryBtn = document.getElementById("sl-fc-retry") as HTMLButtonElement | null;
const restartBtn = document.getElementById("sl-fc-restart") as HTMLButtonElement | null;

let words: FlashcardWord[] = [];
let currentIndex = 0;
let flipped = false;
let translationVisible = false;
const reviewed = new Set<string>();

const topicId = new URLSearchParams(window.location.search).get("topic_id");

function setText(id: string, value: string): void {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function setHidden(el: Element | null, hidden: boolean): void {
  if (el instanceof HTMLElement) el.hidden = hidden;
}

function showOnly(target: HTMLElement | null): void {
  [loadingEl, errorEl, emptyEl, cardEl, summaryEl].forEach((el) => {
    setHidden(el, el !== target);
  });
}

function normalizeWord(item: WordItem): FlashcardWord | null {
  const word = typeof item.word === "string" ? item.word.trim() : "";
  if (!word) return null;
  return {
    id: String(item.id ?? word),
    word,
    phonetic: item.phonetic?.trim() ?? "",
    meaning: item.meaning?.trim() ?? "",
    partOfSpeech: item.part_of_speech?.trim() ?? "",
    example: item.example_sentence?.trim() ?? "",
    exampleMeaning: item.example_meaning?.trim() ?? "",
    level: item.level?.trim() ?? "",
    languageCode: item.language_code?.trim() ?? "",
  };
}

function currentWord(): FlashcardWord | null {
  return words[currentIndex] ?? null;
}

function updateStats(): void {
  const total = words.length;
  const seen = reviewed.size;
  const remaining = Math.max(0, total - seen);
  const percent = total > 0 ? Math.round((seen / total) * 100) : 0;

  setText("sl-fc-total", String(total));
  setText("sl-fc-reviewed", String(seen));
  setText("sl-fc-remaining", String(remaining));

  const bar = document.getElementById("sl-fc-progress");
  if (bar) bar.style.width = `${percent}%`;
  const progressbar = document.getElementById("sl-fc-progressbar");
  if (progressbar) progressbar.setAttribute("aria-valuenow", String(percent));
}

function resetCardState(): void {
  flipped = false;
  translationVisible = false;
  setHidden(document.getElementById("sl-fc-back"), true);
  setHidden(document.getElementById("sl-fc-example-trans"), true);
  const flipBtn = document.getElementById("sl-fc-flip");
  if (flipBtn) {
    flipBtn.textContent = "Lật mặt sau để xem nghĩa";
    flipBtn.setAttribute("aria-expanded", "false");
  }
  const toggle = document.getElementById("sl-fc-toggle-translation");
  if (toggle) {
    toggle.textContent = "Hiện nghĩa câu";
    toggle.setAttribute("aria-pressed", "false");
  }
}

function renderCard(): void {
  const word = currentWord();
  if (!word) {
    showSummary();
    return;
  }

  showOnly(cardEl);
  updateStats();
  resetCardState();

  setText("sl-fc-index", `Thẻ ${currentIndex + 1}/${words.length}`);
  setText("sl-fc-level", word.level || "Chưa xếp cấp");
  setText("sl-fc-pos", word.partOfSpeech || "Từ vựng");
  setText("sl-fc-word", word.word);
  setText("sl-fc-phonetic", word.phonetic);
  setText("sl-fc-meaning", word.meaning || "Kho từ chưa có nghĩa cho từ này.");
  setText("sl-fc-example", word.example || "Kho từ chưa có câu ví dụ cho từ này.");
  setText(
    "sl-fc-example-meaning",
    word.exampleMeaning || "Kho từ chưa có nghĩa của câu ví dụ."
  );
  setText("sl-fc-example-trans", word.exampleMeaning);
  setHidden(
    document.getElementById("sl-fc-example-box"),
    !word.example && !word.exampleMeaning
  );
}

function showSummary(): void {
  showOnly(summaryEl);
  const text = document.getElementById("sl-fc-summary-text");
  if (text) {
    text.textContent =
      words.length > 0
        ? `Bạn đã xem ${reviewed.size}/${words.length} thẻ trong phiên này. Không có dữ liệu ôn tập nào được gửi lên máy chủ.`
        : "Không có thẻ nào để ôn.";
  }
}

function toggleFlip(): void {
  const word = currentWord();
  if (!word || cardEl?.hidden) return;
  flipped = !flipped;
  setHidden(document.getElementById("sl-fc-back"), !flipped);
  const flipBtn = document.getElementById("sl-fc-flip");
  if (flipBtn) {
    flipBtn.textContent = flipped
      ? "Thu lại mặt sau"
      : "Lật mặt sau để xem nghĩa";
    flipBtn.setAttribute("aria-expanded", String(flipped));
  }
}

function toggleTranslation(): void {
  if (!currentWord() || cardEl?.hidden) return;
  translationVisible = !translationVisible;
  setHidden(document.getElementById("sl-fc-example-trans"), !translationVisible);
  const toggle = document.getElementById("sl-fc-toggle-translation");
  if (toggle) {
    toggle.textContent = translationVisible ? "Ẩn nghĩa câu" : "Hiện nghĩa câu";
    toggle.setAttribute("aria-pressed", String(translationVisible));
  }
}

function speakWord(): void {
  const word = currentWord();
  if (!word || !("speechSynthesis" in window)) return;

  const profileLanguage = getLearnerProfile().activeLanguage;
  const language = word.languageCode || profileLanguage;
  const locale =
    language === "ja" ? "ja-JP" : language === "vi" ? "vi-VN" : "en-US";

  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(word.word);
  utterance.lang = locale;
  utterance.rate = 0.9;
  window.speechSynthesis.speak(utterance);
}

function rateWord(): void {
  const word = currentWord();
  if (!word || cardEl?.hidden) return;
  reviewed.add(word.id);
  currentIndex += 1;
  renderCard();
}

async function loadWords(): Promise<void> {
  showOnly(loadingEl);
  setText("sl-fc-status", "Đang tải từ vựng…");
  const query = `/api/v1/vocabulary/words?limit=30${
    topicId ? `&topic_id=${encodeURIComponent(topicId)}` : ""
  }`;

  try {
    const payload = (await slanguageApi(query, { method: "GET" })) as WordsPayload;
    const items = Array.isArray(payload.items) ? payload.items : [];
    words = items
      .map(normalizeWord)
      .filter((word): word is FlashcardWord => word !== null);
    currentIndex = 0;
    reviewed.clear();

    setText(
      "sl-fc-topic-note",
      topicId
        ? `Đang lọc theo chủ đề #${topicId} từ URL.`
        : "Từ vựng được tải theo ngôn ngữ đích trong hồ sơ."
    );

    if (words.length === 0) {
      showOnly(emptyEl);
      setText("sl-fc-status", "Kho thẻ chưa có từ vựng.");
      updateStats();
      return;
    }

    setText("sl-fc-status", `${words.length} thẻ đang mở trong phiên này.`);
    renderCard();

    if (!document.documentElement.dataset.slFlashRevealed) {
      initPageReveal({ container: ".slg-reveal" });
      document.documentElement.dataset.slFlashRevealed = "true";
    }
  } catch (error) {
    showOnly(errorEl);
    const message =
      error instanceof Error
        ? error.message
        : "Không tải được từ vựng. Vui lòng thử lại.";
    if (errorMessageEl) errorMessageEl.textContent = message;
    setText("sl-fc-status", "Không tải được kho thẻ.");
    updateStats();
  }
}

if (!isLearnerAuthenticated()) {
  if (authGuard) authGuard.hidden = false;
  if (content) content.hidden = true;
} else {
  if (authGuard) authGuard.hidden = true;
  if (content) content.hidden = false;

  const profile = getLearnerProfile();
  if (introEl) {
    introEl.textContent = profile.activeLanguage
      ? "Từ vựng thật trong kho của ngôn ngữ đích. Lật thẻ, nghe phát âm và tự chấm mức độ nhớ."
      : "Chưa có ngôn ngữ đích trong hồ sơ; kho thẻ có thể đang trống.";
  }

  document.getElementById("sl-fc-flip")?.addEventListener("click", toggleFlip);
  document
    .getElementById("sl-fc-toggle-translation")
    ?.addEventListener("click", toggleTranslation);
  document.getElementById("sl-fc-audio")?.addEventListener("click", speakWord);
  document.getElementById("sl-fc-rate-hard")?.addEventListener("click", rateWord);
  document.getElementById("sl-fc-rate-good")?.addEventListener("click", rateWord);
  document.getElementById("sl-fc-rate-easy")?.addEventListener("click", rateWord);
  retryBtn?.addEventListener("click", () => void loadWords());
  restartBtn?.addEventListener("click", () => {
    currentIndex = 0;
    reviewed.clear();
    renderCard();
  });

  document.addEventListener("keydown", (event: KeyboardEvent) => {
    if (
      event.target instanceof HTMLInputElement ||
      event.target instanceof HTMLTextAreaElement ||
      cardEl?.hidden
    ) {
      return;
    }
    if (event.code === "Space") {
      event.preventDefault();
      toggleFlip();
    } else if (event.key === "1") {
      event.preventDefault();
      rateWord();
    } else if (event.key === "2") {
      event.preventDefault();
      rateWord();
    } else if (event.key === "3") {
      event.preventDefault();
      rateWord();
    }
  });

  window.addEventListener("pagehide", () => {
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  });

  void loadWords();
}
