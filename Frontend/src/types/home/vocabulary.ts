import { isLearnerAuthenticated, slanguageApi } from "../shared/api-client";
import { initializeLearnerHeader } from "../shared/learner-header";
import { mountHeader } from "../ui/header.js";
import { FlashcardController, FlashcardWord, ReviewRating } from "../../ts/ui/flashcard";

interface Topic {
  id: number;
  name: string;
  description: string | null;
  languageCode: string;
}

interface VocabularyWord extends FlashcardWord {}

interface VocabularyPage<T> {
  items: T[];
  total: number;
  available: number;
  offset: number;
}

interface ReviewCompletion {
  xp_total: number;
  current_streak: number;
  xp_awarded: number;
  already_completed: boolean;
}

const PAGE_SIZE = 20;
const MAX_TOPICS_PER_PAGE = 100;
const SAVED_TOPICS_KEY = "slanguage_saved_learning_topics";

// DOM Elements
const searchInput = document.getElementById("wordSearch") as HTMLInputElement | null;
const addTopicSelect = document.getElementById("addTopicSelect") as HTMLSelectElement | null;
const notice = document.getElementById("vocabularyNotice");
const workspace = document.getElementById("vocabularyWorkspace");
const guestCard = document.getElementById("vocabularyGuest");
const wordGrid = document.getElementById("wordGrid");
const topicGrid = document.getElementById("topicGrid");
const wordEmpty = document.getElementById("wordEmpty");
const wordListSection = document.getElementById("wordListSection");
const xpValue = document.getElementById("headerXPVal");

// Modal Elements
const clearSearchModal = document.getElementById("clearSearchModal");
const undoToastContainer = document.getElementById("undoToastContainer");

// State
let pageOffset = 0;
let totalAvailable = 0;
let selectedTopicId: number | null = null;
let wordViewMode: "lookup" | "topic" = "lookup";
let searchTimer: number | null = null;
let topics: Topic[] = [];
let selectedTopicIds: number[] = [];
let currentWords: VocabularyWord[] = [];

// Flashcard Controller Instance
let flashcardCtrl: FlashcardController | null = null;
let reviewSessionId: string | null = null;
let reviewSaveCompleted = false;
let pendingReviewId: string | null = null;

// Topic accordion cache
const topicWordsCache = new Map<number, VocabularyWord[]>();

// Pending topic undo map
interface UndoTopicEntry {
  topic: Topic;
  index: number;
  timeoutId: number;
}
const pendingDeletions = new Map<number, UndoTopicEntry>();

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function positiveInt(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
}

function parsePage<T>(
  value: unknown,
  parseItem: (item: Record<string, unknown>) => T,
): VocabularyPage<T> {
  const data = asRecord(value);
  if (!Array.isArray(data.items)) {
    throw new Error("Máy chủ trả về danh sách từ vựng không hợp lệ.");
  }
  return {
    items: data.items.map((item) => parseItem(asRecord(item))),
    total: positiveInt(data.total),
    available: positiveInt(data.available),
    offset: positiveInt(data.offset),
  };
}

function parseTopic(item: Record<string, unknown>): Topic {
  const id = positiveInt(item.id);
  const name = text(item.name);
  if (!id || !name) throw new Error("Dữ liệu chủ đề từ máy chủ không hợp lệ.");
  return {
    id,
    name,
    description: text(item.description),
    languageCode: text(item.language_code) || "",
  };
}

function parseWord(item: Record<string, unknown>): VocabularyWord {
  const id = positiveInt(item.id);
  const word = text(item.word);
  const meaning = text(item.meaning);
  if (!id || !word || !meaning) {
    throw new Error("Dữ liệu từ vựng từ máy chủ không hợp lệ.");
  }
  return {
    id,
    word,
    meaning,
    phonetic: text(item.phonetic),
    partOfSpeech: text(item.part_of_speech),
    example: text(item.example_sentence),
    exampleMeaning: text(item.example_meaning),
    level: text(item.level) || "A1",
    mastery_level: typeof item.mastery_level === "number" ? item.mastery_level : undefined,
    next_review_at: text(item.next_review_at) || undefined,
  };
}

function setNotice(message: string, isError = false): void {
  if (!notice) return;
  notice.hidden = !message;
  notice.textContent = message;
  notice.dataset.state = isError ? "error" : "";
}

function setAuthState(authenticated: boolean): void {
  document.body.classList.toggle("user-authenticated", authenticated);
  document.body.classList.toggle("user-guest", !authenticated);
  if (workspace) workspace.hidden = !authenticated;
  if (guestCard) guestCard.hidden = authenticated;
  if (notice) notice.hidden = !authenticated;
}

function readSavedTopicIds(): number[] {
  const saved = localStorage.getItem(SAVED_TOPICS_KEY);
  if (!saved) return [];
  try {
    const parsed: unknown = JSON.parse(saved);
    if (!Array.isArray(parsed)) throw new Error("invalid saved topic list");
    return Array.from(new Set(parsed.map(positiveInt).filter(Boolean)));
  } catch {
    setNotice("Danh sách chủ đề đã lưu không hợp lệ; bạn có thể chọn lại chủ đề.", true);
    return [];
  }
}

function saveTopicIds(): void {
  localStorage.setItem(SAVED_TOPICS_KEY, JSON.stringify(selectedTopicIds));
}

// Pronunciation helper via Web Speech API (Task 55)
function playPronunciation(word: string, lang = "en-US"): void {
  if (!("speechSynthesis" in window)) {
    setNotice("Trình duyệt không hỗ trợ phát âm âm thanh tự động.", true);
    return;
  }
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(word);
  utterance.lang = lang;
  utterance.rate = 0.9;
  window.speechSynthesis.speak(utterance);
}

// Flag icon helper by language code
function getFlagIcon(code: string): string {
  const c = code.toLowerCase();
  if (c === "en") return "🇬🇧";
  if (c === "ja") return "🇯🇵";
  if (c === "vi") return "🇻🇳";
  return "🌐";
}

// Render Topic Cards with flag & count, plus smooth grid insertion animation
function renderTopicCards(): void {
  if (!topicGrid) return;
  const savedTopics = topics.filter((topic) => selectedTopicIds.includes(topic.id));
  topicGrid.replaceChildren();

  for (const topic of savedTopics) {
    const cardWrapper = document.createElement("div");
    cardWrapper.className = "topic-card-wrapper";
    cardWrapper.id = `topic-wrapper-${topic.id}`;

    const card = document.createElement("article");
    card.className = "topic-card";
    card.dataset.topicCardId = String(topic.id);

    const top = document.createElement("div");
    top.className = "topic-card-top";

    const icon = document.createElement("span");
    icon.className = "topic-card-icon";
    icon.innerHTML = '<i class="fa-solid fa-book-open" aria-hidden="true"></i>';
    top.append(icon);

    const flagBadge = document.createElement("span");
    flagBadge.className = "topic-language";
    const flag = getFlagIcon(topic.languageCode);
    flagBadge.innerHTML = `<span class="topic-flag">${flag}</span> ${topic.languageCode.toUpperCase() || "EN"}`;
    top.append(flagBadge);
    card.append(top);

    const title = document.createElement("h3");
    title.className = "topic-card-title";
    title.textContent = topic.name;
    card.append(title);

    const description = document.createElement("p");
    description.className = "topic-description";
    description.textContent = topic.description || "Chủ đề học tập được bạn lưu lại.";
    card.append(description);

    const footer = document.createElement("div");
    footer.className = "topic-card-footer";

    const meta = document.createElement("span");
    meta.className = "topic-card-meta";
    meta.innerHTML = '<i class="fa-solid fa-circle-check" aria-hidden="true"></i> Đã lưu';

    const actions = document.createElement("div");
    actions.className = "topic-card-actions";

    // Accordion toggle button ("Xem từ")
    const browseButton = document.createElement("button");
    browseButton.type = "button";
    browseButton.className = "study-secondary-button topic-btn-browse";
    browseButton.dataset.topicId = String(topic.id);
    browseButton.dataset.topicAction = "browse";
    browseButton.setAttribute("aria-expanded", "false");
    browseButton.innerHTML = 'Xem từ <i class="fa-solid fa-chevron-down" aria-hidden="true"></i>';
    actions.append(browseButton);

    // Focus Study button ("Học chủ đề")
    const studyButton = document.createElement("button");
    studyButton.type = "button";
    studyButton.className = "study-primary-button topic-btn-study";
    studyButton.dataset.topicId = String(topic.id);
    studyButton.dataset.topicAction = "study";
    studyButton.innerHTML = '<i class="fa-solid fa-bolt" aria-hidden="true"></i> Học chủ đề';
    actions.append(studyButton);

    // Remove topic button (×)
    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "topic-remove-button";
    removeButton.dataset.topicId = String(topic.id);
    removeButton.dataset.topicAction = "remove";
    removeButton.setAttribute("aria-label", `Xóa chủ đề ${topic.name}`);
    removeButton.innerHTML = '<i class="fa-solid fa-xmark" aria-hidden="true"></i>';
    actions.append(removeButton);

    footer.append(meta, actions);
    card.append(footer);
    cardWrapper.append(card);

    // Inline Accordion drawer container
    const accordion = document.createElement("div");
    accordion.className = "topic-inline-accordion";
    accordion.id = `topic-accordion-${topic.id}`;
    accordion.hidden = true;
    accordion.innerHTML = `
      <div class="topic-accordion-inner">
        <div class="topic-accordion-header">
          <span class="accordion-title"><i class="fa-solid fa-list-check" aria-hidden="true"></i> Danh sách từ trong chủ đề:</span>
          <span class="accordion-count" id="accordion-count-${topic.id}">Đang tải...</span>
        </div>
        <div class="topic-accordion-words" id="accordion-words-${topic.id}">
          <div class="accordion-loading-shimmer">Đang tải từ vựng...</div>
        </div>
      </div>
    `;
    cardWrapper.append(accordion);

    topicGrid.append(cardWrapper);
  }

  const empty = document.getElementById("topicEmpty");
  if (empty) empty.hidden = savedTopics.length > 0;
  const count = document.getElementById("topicCount");
  if (count) count.textContent = `${savedTopics.length} chủ đề`;
}

// Render word items inside inline accordion
async function toggleTopicAccordion(topicId: number): Promise<void> {
  const accordion = document.getElementById(`topic-accordion-${topicId}`);
  const wrapper = document.getElementById(`topic-wrapper-${topicId}`);
  const browseBtn = wrapper?.querySelector<HTMLButtonElement>('[data-topic-action="browse"]');
  if (!accordion) return;

  const isExpanding = accordion.hidden;
  if (!isExpanding) {
    accordion.classList.remove("is-open");
    if (browseBtn) {
      browseBtn.setAttribute("aria-expanded", "false");
      browseBtn.innerHTML = 'Xem từ <i class="fa-solid fa-chevron-down" aria-hidden="true"></i>';
    }
    setTimeout(() => { accordion.hidden = true; }, 260);
    return;
  }

  // Open accordion
  accordion.hidden = false;
  requestAnimationFrame(() => accordion.classList.add("is-open"));
  if (browseBtn) {
    browseBtn.setAttribute("aria-expanded", "true");
    browseBtn.innerHTML = 'Thu gọn <i class="fa-solid fa-chevron-up" aria-hidden="true"></i>';
  }

  const wordsContainer = document.getElementById(`accordion-words-${topicId}`);
  const countLabel = document.getElementById(`accordion-count-${topicId}`);
  if (!wordsContainer) return;

  // Check cache or fetch
  let words = topicWordsCache.get(topicId);
  if (!words) {
    try {
      const response = await slanguageApi(`/api/v1/vocabulary/words?limit=50&offset=0&topic_id=${topicId}`);
      const page = parsePage(response.data, parseWord);
      words = page.items;
      topicWordsCache.set(topicId, words);
    } catch {
      wordsContainer.innerHTML = '<p class="accordion-error">Không thể tải danh sách từ của chủ đề này.</p>';
      return;
    }
  }

  if (countLabel) countLabel.textContent = `${words.length} từ`;
  if (words.length === 0) {
    wordsContainer.innerHTML = '<p class="accordion-empty">Chủ đề này chưa có từ vựng nào.</p>';
    return;
  }

  wordsContainer.replaceChildren();
  for (const word of words) {
    const item = document.createElement("div");
    item.className = "accordion-word-row";

    // Mastery dots (0 - 5)
    const mastery = Math.min(5, Math.max(0, word.mastery_level || 0));
    let dotsHtml = '<div class="mastery-dots" title="Mức độ thành thạo: ' + mastery + '/5">';
    for (let i = 1; i <= 5; i++) {
      dotsHtml += `<span class="mastery-dot ${i <= mastery ? 'is-active' : ''}"></span>`;
    }
    dotsHtml += '</div>';

    // Check if review is due
    let dueBadge = '';
    if (word.next_review_at) {
      const dueDate = new Date(word.next_review_at);
      if (dueDate <= new Date()) {
        dueBadge = '<span class="due-badge"><i class="fa-solid fa-clock" aria-hidden="true"></i> Đến hạn ôn</span>';
      }
    }

    item.innerHTML = `
      <div class="row-left">
        <div class="row-main-line">
          <strong class="row-word">${word.word}</strong>
          ${word.partOfSpeech ? `<span class="row-pos">${word.partOfSpeech}</span>` : ''}
          ${word.phonetic ? `<span class="row-phonetic">${word.phonetic}</span>` : ''}
        </div>
        <span class="row-meaning">${word.meaning}</span>
      </div>
      <div class="row-right">
        ${dueBadge}
        ${dotsHtml}
        <button type="button" class="row-audio-btn" data-speak-word="${word.word}" aria-label="Phát âm ${word.word}">
          <i class="fa-solid fa-volume-high" aria-hidden="true"></i>
        </button>
      </div>
    `;
    wordsContainer.append(item);
  }
}

// 5-Second Undo Toast Management
function showUndoToast(topic: Topic, originalIndex: number): void {
  if (!undoToastContainer) return;

  const toast = document.createElement("div");
  toast.className = "undo-toast";
  toast.id = `undo-toast-${topic.id}`;
  toast.setAttribute("role", "status");
  toast.innerHTML = `
    <span class="undo-toast-message">Đã xóa chủ đề <strong>"${topic.name}"</strong></span>
    <button type="button" class="undo-toast-btn" id="btn-undo-${topic.id}">
      <i class="fa-solid fa-rotate-left" aria-hidden="true"></i> Hoàn tác
    </button>
  `;

  undoToastContainer.append(toast);
  requestAnimationFrame(() => toast.classList.add("is-visible"));

  const timeoutId = window.setTimeout(() => {
    toast.classList.remove("is-visible");
    setTimeout(() => toast.remove(), 250);
    pendingDeletions.delete(topic.id);
  }, 5000);

  pendingDeletions.set(topic.id, { topic, index: originalIndex, timeoutId });

  toast.querySelector(`#btn-undo-${topic.id}`)?.addEventListener("click", () => {
    window.clearTimeout(timeoutId);
    toast.classList.remove("is-visible");
    setTimeout(() => toast.remove(), 250);
    restoreTopic(topic.id);
  });
}

function restoreTopic(topicId: number): void {
  const pending = pendingDeletions.get(topicId);
  if (!pending) return;
  pendingDeletions.delete(topicId);

  // Restore into selected list
  if (!selectedTopicIds.includes(topicId)) {
    selectedTopicIds.splice(pending.index, 0, topicId);
    saveTopicIds();
    renderTopicCards();

    if (addTopicSelect) {
      const option = Array.from(addTopicSelect.options).find(
        (item) => item.value === String(topicId),
      );
      option?.remove();
    }
  }
}

function removeSavedTopic(topicId: number): void {
  const originalIndex = selectedTopicIds.indexOf(topicId);
  const topic = topics.find((item) => item.id === topicId);

  // Animate collapse out
  const cardWrapper = document.getElementById(`topic-wrapper-${topicId}`);
  if (cardWrapper) {
    cardWrapper.style.transition = "all 0.28s var(--ease-out, ease-out)";
    cardWrapper.style.transform = "scale(0.92)";
    cardWrapper.style.opacity = "0";
  }

  setTimeout(() => {
    selectedTopicIds = selectedTopicIds.filter((id) => id !== topicId);
    saveTopicIds();
    renderTopicCards();

    if (topic && addTopicSelect) {
      addTopicSelect.add(new Option(topic.name, String(topic.id)));
    }

    if (topic) {
      showUndoToast(topic, originalIndex);
    }

    if (selectedTopicId === topicId) {
      selectedTopicId = null;
      wordViewMode = "lookup";
      if (wordListSection) wordListSection.hidden = true;
      const startReviewButton = document.getElementById("startPageReview");
      if (startReviewButton) startReviewButton.hidden = true;
      const wordCount = document.getElementById("wordCount");
      if (wordCount) wordCount.textContent = "";
    }
  }, 260);
}

async function loadTopics(): Promise<void> {
  const collected: Topic[] = [];
  let offset = 0;
  let available = 0;

  do {
    const response = await slanguageApi(
      `/api/v1/vocabulary/topics?limit=${MAX_TOPICS_PER_PAGE}&offset=${offset}`,
    );
    const page = parsePage(response.data, parseTopic);
    collected.push(...page.items);
    available = page.available;
    offset += page.items.length;
    if (page.items.length === 0) break;
  } while (offset < available);

  topics = collected;
  selectedTopicIds = readSavedTopicIds();
  renderTopicCards();

  if (addTopicSelect) {
    addTopicSelect.replaceChildren(new Option("Chọn chủ đề học tập...", ""));
    for (const topic of topics) {
      if (!selectedTopicIds.includes(topic.id)) {
        addTopicSelect.add(new Option(topic.name, String(topic.id)));
      }
    }
  }
}

async function loadWords(): Promise<void> {
  const searchTerm = searchInput?.value.trim() || "";
  if (!searchTerm && selectedTopicId === null) {
    currentWords = [];
    totalAvailable = 0;
    if (wordListSection) wordListSection.hidden = true;
    if (wordGrid) wordGrid.replaceChildren();
    const wordCount = document.getElementById("wordCount");
    if (wordCount) wordCount.textContent = "";
    return;
  }

  setNotice("Đang tải dữ liệu từ vựng...");
  if (wordGrid) wordGrid.replaceChildren();
  if (wordListSection) wordListSection.hidden = false;

  const query = new URLSearchParams({
    limit: String(PAGE_SIZE),
    offset: String(pageOffset),
  });
  if (selectedTopicId !== null) query.set("topic_id", String(selectedTopicId));
  if (searchTerm) query.set("q", searchTerm);

  const response = await slanguageApi(`/api/v1/vocabulary/words?${query.toString()}`);
  const page = parsePage(response.data, parseWord);
  currentWords = page.items;
  totalAvailable = page.available;

  const selectedTopic = topics.find((topic) => topic.id === selectedTopicId);
  const selectedTitle = document.getElementById("selectedTopicTitle");
  const kicker = document.getElementById("wordListKicker");

  if (selectedTitle) {
    selectedTitle.textContent = selectedTopic
      ? `Từ vựng · ${selectedTopic.name}`
      : `Kết quả tra cứu${searchTerm ? `: “${searchTerm}”` : ""}`;
  }
  if (kicker) kicker.textContent = selectedTopic ? "CHỦ ĐỀ ĐANG CHỌN" : "KẾT QUẢ TÌM KIẾM";

  const startReviewButton = document.getElementById("startPageReview");
  if (startReviewButton) startReviewButton.hidden = wordViewMode !== "topic";
  renderWords();
  setNotice("");
}

function appendText(parent: HTMLElement, tag: string, className: string, value: string): HTMLElement {
  const child = document.createElement(tag);
  child.className = className;
  child.textContent = value;
  parent.append(child);
  return child;
}

function renderWords(): void {
  if (!wordGrid) return;
  const filtered = currentWords;

  wordGrid.replaceChildren();
  for (const word of filtered) {
    const card = document.createElement("article");
    card.className = "word-card";
    card.dataset.wordId = String(word.id);

    const top = document.createElement("div");
    top.className = "word-card-top";
    appendText(top, "span", "vocab-level", word.level);
    if (word.partOfSpeech) appendText(top, "span", "word-pos", word.partOfSpeech);

    const audioBtn = document.createElement("button");
    audioBtn.type = "button";
    audioBtn.className = "audio-speaker-btn";
    audioBtn.setAttribute("aria-label", `Phát âm từ ${word.word}`);
    audioBtn.innerHTML = '<i class="fa-solid fa-volume-high" aria-hidden="true"></i>';
    audioBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      playPronunciation(word.word);
    });
    top.append(audioBtn);
    card.append(top);

    appendText(card, "h3", "word-card-term", word.word);
    if (word.phonetic) appendText(card, "p", "vocab-phonetic", word.phonetic);
    appendText(card, "p", "word-meaning", word.meaning);
    if (word.example) {
      const exWrapper = document.createElement("div");
      exWrapper.className = "word-example-wrapper";
      appendText(exWrapper, "p", "word-example", word.example);
      if (word.exampleMeaning) {
        appendText(exWrapper, "p", "word-example-meaning", word.exampleMeaning);
      }
      card.append(exWrapper);
    }

    wordGrid.append(card);
  }

  if (wordEmpty) {
    wordEmpty.hidden = filtered.length > 0 || (!searchInput?.value.trim() && selectedTopicId === null);
    if (filtered.length === 0) {
      wordEmpty.textContent = selectedTopicId !== null
        ? "Chủ đề này hiện chưa có từ vựng."
        : "Không tìm thấy từ phù hợp. Hãy thử từ khóa khác.";
    }
  }

  const wordCount = document.getElementById("wordCount");
  if (wordCount) {
    wordCount.textContent = totalAvailable
      ? `${totalAvailable} kết quả phù hợp`
      : "";
  }

  const pageLabel = document.getElementById("pageLabel");
  if (pageLabel) {
    const pageNumber = Math.floor(pageOffset / PAGE_SIZE) + 1;
    const pageCount = Math.max(1, Math.ceil(totalAvailable / PAGE_SIZE));
    pageLabel.textContent = `Trang ${pageNumber} / ${pageCount}`;
  }

  const previous = document.getElementById("previousPage") as HTMLButtonElement | null;
  const next = document.getElementById("nextPage") as HTMLButtonElement | null;
  const startReviewButton = document.getElementById("startPageReview") as HTMLButtonElement | null;
  if (previous) previous.disabled = pageOffset <= 0;
  if (next) next.disabled = pageOffset + PAGE_SIZE >= totalAvailable;
  if (startReviewButton) startReviewButton.disabled = filtered.length === 0;
}

// Start Flashcard Focus Mode with 4 Ratings mapping to Backend RPC
function startReviewSession(words: VocabularyWord[]): void {
  if (!words.length) return;
  reviewSessionId = window.crypto.randomUUID();
  reviewSaveCompleted = false;

  flashcardCtrl = new FlashcardController({
    words,
    onRating: async (word, rating: ReviewRating) => {
      // Ánh xạ: "Lại" -> "Khó" (lặp lại sớm nhất theo RPC SQL), "Khó" -> "Khó", "Tốt" -> "Tốt", "Dễ" -> "Dễ"
      const backendRating = (rating === "Lại" ? "Khó" : rating) as "Khó" | "Tốt" | "Dễ";
      pendingReviewId = window.crypto.randomUUID();

      try {
        const response = asRecord(await slanguageApi(`/api/v1/vocabulary/words/${word.id}/review`, {
          method: "POST",
          body: { review_id: pendingReviewId, rating: backendRating },
        }));
        const result = asRecord(response.data);
        if (
          result.word_id !== word.id ||
          typeof result.mastery_level !== "number" ||
          typeof result.next_review_at !== "string"
        ) {
          throw new Error("Máy chủ chưa trả về lịch ôn tập hợp lệ.");
        }
        return true;
      } catch (error) {
        setNotice(error instanceof Error ? `Lỗi lưu ôn: ${error.message}` : "Lỗi lưu ôn tập.", true);
        return false;
      }
    },
    onComplete: async (reviewedCount, knownCount) => {
      if (!reviewSessionId || reviewSaveCompleted) return;
      try {
        const result = asRecord(await slanguageApi("/api/v1/vocabulary/review-sessions/complete", {
          method: "POST",
          body: {
            session_id: reviewSessionId,
            reviewed_count: reviewedCount,
            known_count: knownCount,
          },
        }));
        const data = asRecord(result.data) as Partial<ReviewCompletion>;
        if (
          typeof data.xp_total !== "number" ||
          typeof data.current_streak !== "number" ||
          typeof data.xp_awarded !== "number"
        ) {
          throw new Error("Số liệu XP/Streak không hợp lệ.");
        }

        localStorage.setItem("slanguage_user_xp", String(data.xp_total));
        localStorage.setItem("slanguage_user_streak", String(data.current_streak));
        if (xpValue) xpValue.textContent = `${data.xp_total.toLocaleString("vi-VN")} XP`;
        reviewSaveCompleted = true;

        const summaryText = document.getElementById("reviewCompletionText");
        if (summaryText) {
          summaryText.textContent = data.already_completed
            ? "Phiên này đã đồng bộ trước đó."
            : `Tuyệt vời! Bạn nhận được +${data.xp_awarded} XP và duy trì chuỗi học ${data.current_streak} ngày liên tiếp!`;
        }
      } catch (error) {
        const summaryText = document.getElementById("reviewCompletionText");
        if (summaryText) {
          summaryText.textContent = "Chưa đồng bộ được XP vào máy chủ. Vui lòng bấm thử lại.";
        }
      }
    },
    onClose: () => {
      reviewSessionId = null;
    },
  });

  flashcardCtrl.start();
}

// Confirmation Modal for Clear Search
function openClearSearchModal(): void {
  if (!clearSearchModal) return;
  clearSearchModal.hidden = false;
  clearSearchModal.setAttribute("aria-hidden", "false");
}

function closeClearSearchModal(): void {
  if (!clearSearchModal) return;
  clearSearchModal.hidden = true;
  clearSearchModal.setAttribute("aria-hidden", "true");
}

function executeClearSearch(): void {
  closeClearSearchModal();
  if (searchInput) searchInput.value = "";
  selectedTopicId = null;
  wordViewMode = "lookup";
  pageOffset = 0;
  const startReviewButton = document.getElementById("startPageReview");
  if (startReviewButton) startReviewButton.hidden = true;
  void loadWords().catch((error: unknown) =>
    setNotice(error instanceof Error ? error.message : "Không thể xóa tra cứu.", true),
  );
}

// Setup Event Listeners
function setupEventListeners(): void {
  // Thêm chủ đề mới kèm animation
  document.getElementById("addTopicButton")?.addEventListener("click", () => {
    const topicId = positiveInt(addTopicSelect?.value);
    if (!topicId || selectedTopicIds.includes(topicId)) return;
    selectedTopicIds = [...selectedTopicIds, topicId];
    saveTopicIds();
    renderTopicCards();

    // Remove from select options
    const option = Array.from(addTopicSelect?.options || []).find(
      (item) => item.value === String(topicId),
    );
    option?.remove();
    if (addTopicSelect) addTopicSelect.value = "";

    // Animate new item
    const newCard = document.getElementById(`topic-wrapper-${topicId}`);
    if (newCard) {
      newCard.style.animation = "topicCardInsert 0.35s var(--ease-spring, ease-out)";
    }
  });

  // Search input debounce 250ms
  document.getElementById("searchWords")?.addEventListener("click", () => {
    selectedTopicId = null;
    wordViewMode = "lookup";
    pageOffset = 0;
    const startReviewButton = document.getElementById("startPageReview");
    if (startReviewButton) startReviewButton.hidden = true;
    void loadWords().catch((error: unknown) =>
      setNotice(error instanceof Error ? error.message : "Không thể tra cứu từ.", true),
    );
  });

  searchInput?.addEventListener("input", () => {
    selectedTopicId = null;
    wordViewMode = "lookup";
    pageOffset = 0;
    const startReviewButton = document.getElementById("startPageReview");
    if (startReviewButton) startReviewButton.hidden = true;
    if (searchTimer !== null) window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => {
      void loadWords().catch((error: unknown) =>
        setNotice(error instanceof Error ? error.message : "Không thể tra cứu từ.", true),
      );
    }, 250);
  });

  searchInput?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      if (searchTimer !== null) window.clearTimeout(searchTimer);
      void loadWords().catch((error: unknown) =>
        setNotice(error instanceof Error ? error.message : "Không thể tra cứu từ.", true),
      );
    }
  });

  // Quick tag chips
  document.querySelectorAll<HTMLButtonElement>("[data-search-tag]").forEach((chip) => {
    chip.addEventListener("click", () => {
      const tag = chip.dataset.searchTag || "";
      if (searchInput) searchInput.value = tag;
      selectedTopicId = null;
      wordViewMode = "lookup";
      pageOffset = 0;
      void loadWords().catch((error: unknown) =>
        setNotice(error instanceof Error ? error.message : "Không thể tra cứu từ.", true),
      );
    });
  });

  // Topic grid delegation (browse accordion / study / remove)
  topicGrid?.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    // Handle pronunciation inside accordion
    const audioBtn = target.closest<HTMLButtonElement>("[data-speak-word]");
    if (audioBtn) {
      const word = audioBtn.dataset.speakWord;
      if (word) playPronunciation(word);
      return;
    }

    const button = target.closest<HTMLButtonElement>("button[data-topic-id]");
    if (!button) return;
    const topicId = positiveInt(button.dataset.topicId);
    if (!topicId) return;

    if (button.dataset.topicAction === "remove") {
      removeSavedTopic(topicId);
      return;
    }

    if (button.dataset.topicAction === "browse") {
      void toggleTopicAccordion(topicId);
      return;
    }

    const action = button.dataset.topicAction === "study" ? "study" : "browse";
    void openTopic(topicId, action).catch((error: unknown) =>
      setNotice(error instanceof Error ? error.message : "Không thể mở chủ đề.", true),
    );
  });

  // Pagination
  document.getElementById("previousPage")?.addEventListener("click", () => {
    pageOffset = Math.max(0, pageOffset - PAGE_SIZE);
    void loadWords().catch((error: unknown) =>
      setNotice(error instanceof Error ? error.message : "Không thể tải trang trước.", true),
    );
  });

  document.getElementById("nextPage")?.addEventListener("click", () => {
    if (pageOffset + PAGE_SIZE >= totalAvailable) return;
    pageOffset += PAGE_SIZE;
    void loadWords().catch((error: unknown) =>
      setNotice(error instanceof Error ? error.message : "Không thể tải trang sau.", true),
    );
  });

  // Start study from toolbar button
  document.getElementById("startPageReview")?.addEventListener("click", () => {
    startReviewSession(currentWords);
  });

  // Clear search modal
  document.getElementById("refreshWords")?.addEventListener("click", openClearSearchModal);
  document.getElementById("cancelClearSearch")?.addEventListener("click", closeClearSearchModal);
  document.getElementById("confirmClearSearch")?.addEventListener("click", executeClearSearch);

  // Modal Escape key
  window.addEventListener("keydown", (event) => {
    if (!clearSearchModal?.hidden && event.key === "Escape") {
      closeClearSearchModal();
    }
  });
}

async function openTopic(topicId: number, action: "browse" | "study"): Promise<void> {
  if (searchTimer !== null) window.clearTimeout(searchTimer);
  selectedTopicId = topicId;
  wordViewMode = "topic";
  pageOffset = 0;
  if (searchInput) searchInput.value = "";
  const startReviewButton = document.getElementById("startPageReview");
  if (startReviewButton) startReviewButton.hidden = false;
  await loadWords();
  if (wordListSection) wordListSection.hidden = false;

  if (action === "study") {
    startReviewSession(currentWords);
  } else {
    await toggleTopicAccordion(topicId);
  }
}

async function initVocabularyPage(): Promise<void> {
  const authenticated = isLearnerAuthenticated();
  setAuthState(authenticated);
  if (!authenticated) return;
  setNotice("");

  setupEventListeners();

  try {
    await loadTopics();
    const params = new URLSearchParams(window.location.search);
    const requestedTopicId = positiveInt(params.get("topic_id"));

    if (requestedTopicId && topics.some((t) => t.id === requestedTopicId)) {
      if (!selectedTopicIds.includes(requestedTopicId)) {
        selectedTopicIds = [...selectedTopicIds, requestedTopicId];
        saveTopicIds();
        renderTopicCards();
        if (addTopicSelect) {
          const option = Array.from(addTopicSelect.options).find(
            (item) => item.value === String(requestedTopicId),
          );
          option?.remove();
        }
      }
      const action = params.get("action") === "study" ? "study" : "browse";
      await openTopic(requestedTopicId, action);
    } else if (params.get("q")) {
      if (searchInput) searchInput.value = params.get("q") || "";
      wordViewMode = "lookup";
      await loadWords();
    }
  } catch (error) {
    setNotice(error instanceof Error ? error.message : "Không thể tải kho từ vựng.", true);
  }
}

async function initializeVocabularyPageShell(): Promise<void> {
  try {
    await mountHeader({ active: "vocabulary", externalState: true });
    void initializeLearnerHeader();
    await initVocabularyPage();
  } catch (error) {
    setNotice(error instanceof Error ? error.message : "Không thể tải trang từ vựng.", true);
  } finally {
    document.body.dataset.pageState = "ready";
  }
}

void initializeVocabularyPageShell();
