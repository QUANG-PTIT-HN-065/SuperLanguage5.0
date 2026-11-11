import { isLearnerAuthenticated, slanguageApi } from "../shared/api-client";
import { initializeLearnerHeader } from "../shared/learner-header";

interface Topic {
  id: number;
  name: string;
  description: string | null;
  languageCode: string;
}

interface VocabularyWord {
  id: number;
  word: string;
  phonetic: string | null;
  meaning: string;
  partOfSpeech: string | null;
  example: string | null;
  exampleMeaning: string | null;
  level: string;
}

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

const searchInput = document.getElementById("wordSearch") as HTMLInputElement | null;
const addTopicSelect = document.getElementById("addTopicSelect") as HTMLSelectElement | null;
const notice = document.getElementById("vocabularyNotice");
const workspace = document.getElementById("vocabularyWorkspace");
const guestCard = document.getElementById("vocabularyGuest");
const wordGrid = document.getElementById("wordGrid");
const topicGrid = document.getElementById("topicGrid");
const wordEmpty = document.getElementById("wordEmpty");
const sessionPanel = document.getElementById("reviewSession");
const wordListSection = document.getElementById("wordListSection");
const xpValue = document.getElementById("headerXPVal");

let pageOffset = 0;
let totalAvailable = 0;
let selectedTopicId: number | null = null;
let wordViewMode: "lookup" | "topic" = "lookup";
let searchTimer: number | null = null;
let topics: Topic[] = [];
let selectedTopicIds: number[] = [];
let currentWords: VocabularyWord[] = [];
let reviewWords: VocabularyWord[] = [];
let reviewIndex = 0;
let knownCount = 0;
let reviewSessionId: string | null = null;
let reviewSaveCompleted = false;

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
    level: text(item.level) || "—",
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

const SAVED_TOPICS_KEY = "slanguage_saved_learning_topics";

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

function renderTopicCards(): void {
  if (!topicGrid) return;
  const savedTopics = topics.filter((topic) => selectedTopicIds.includes(topic.id));
  topicGrid.replaceChildren();
  for (const topic of savedTopics) {
    const card = document.createElement("article");
    card.className = "topic-card";

    const top = document.createElement("div");
    top.className = "topic-card-top";
    const icon = document.createElement("span");
    icon.className = "topic-card-icon";
    icon.innerHTML = '<i class="fa-solid fa-book-open" aria-hidden="true"></i>';
    top.append(icon);
    const language = document.createElement("span");
    language.className = "topic-language";
    language.textContent = topic.languageCode.toUpperCase() || "HỌC TẬP";
    top.append(language);
    card.append(top);

    const title = document.createElement("h3");
    title.textContent = topic.name;
    card.append(title);
    const description = document.createElement("p");
    description.className = "topic-description";
    description.textContent = topic.description || "Chủ đề bạn đã lưu để học sau.";
    card.append(description);

    const footer = document.createElement("div");
    footer.className = "topic-card-footer";
    const meta = document.createElement("span");
    meta.className = "topic-card-meta";
    meta.innerHTML = '<i class="fa-solid fa-book-open" aria-hidden="true"></i> Chủ đề đã lưu';
    const actions = document.createElement("div");
    actions.className = "topic-card-actions";
    for (const [action, label, style] of [
      ["browse", "Xem từ", "study-secondary-button"],
      ["study", "Học chủ đề", "study-primary-button"],
    ]) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = style;
      button.dataset.topicId = String(topic.id);
      button.dataset.topicAction = action;
      button.textContent = label;
      actions.append(button);
    }
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
    topicGrid.append(card);
  }

  const empty = document.getElementById("topicEmpty");
  if (empty) empty.hidden = savedTopics.length > 0;
  const count = document.getElementById("topicCount");
  if (count) count.textContent = `${savedTopics.length} chủ đề`;
}

async function loadTopics(): Promise<void> {
  const collected: Topic[] = [];
  let offset = 0;
  let available = 0;

  do {
    const response = await slanguageApi(
      `/api/v1/vocabulary/topics?limit=${MAX_TOPICS_PER_PAGE}&offset=${offset}`,
    );
    const page = parsePage(
      response.data,
      parseTopic,
    );
    collected.push(...page.items);
    available = page.available;
    offset += page.items.length;
    if (page.items.length === 0) break;
  } while (offset < available);

  topics = collected;
  selectedTopicIds = readSavedTopicIds();
  renderTopicCards();
  if (addTopicSelect) {
    addTopicSelect.replaceChildren(new Option("Chọn chủ đề...", ""));
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

  setNotice("Đang tải từ vựng...");
  if (wordGrid) wordGrid.replaceChildren();
  if (wordListSection) wordListSection.hidden = false;

  const query = new URLSearchParams({
    limit: String(PAGE_SIZE),
    offset: String(pageOffset),
  });
  if (selectedTopicId !== null) query.set("topic_id", String(selectedTopicId));
  if (searchTerm) query.set("q", searchTerm);

  const response = await slanguageApi(`/api/v1/vocabulary/words?${query.toString()}`);
  const page = parsePage(
    response.data,
    parseWord,
  );
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
  if (kicker) kicker.textContent = selectedTopic ? "CHỦ ĐỀ ĐÃ LƯU" : "TRA CỨU";
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
  const filtered = getVisibleWords();

  wordGrid.replaceChildren();
  for (const word of filtered) {
    const card = document.createElement("article");
    card.className = "word-card";
    card.dataset.wordId = String(word.id);

    const top = document.createElement("div");
    top.className = "word-card-top";
    appendText(top, "span", "vocab-level", word.level);
    if (word.partOfSpeech) appendText(top, "span", "word-pos", word.partOfSpeech);
    card.append(top);

    appendText(card, "h2", "", word.word);
    if (word.phonetic) appendText(card, "p", "vocab-phonetic", word.phonetic);
    appendText(card, "p", "word-meaning", word.meaning);
    if (word.example) appendText(card, "p", "word-example", word.example);

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
    pageLabel.textContent = `Trang ${pageNumber}/${pageCount}`;
  }
  const previous = document.getElementById("previousPage") as HTMLButtonElement | null;
  const next = document.getElementById("nextPage") as HTMLButtonElement | null;
  const startReviewButton = document.getElementById("startPageReview") as HTMLButtonElement | null;
  if (previous) previous.disabled = pageOffset <= 0;
  if (next) next.disabled = pageOffset + PAGE_SIZE >= totalAvailable;
  if (startReviewButton) startReviewButton.disabled = filtered.length === 0;
}

function getVisibleWords(): VocabularyWord[] {
  return currentWords;
}

function startReview(words: VocabularyWord[]): void {
  if (!words.length || !sessionPanel || !wordListSection) return;
  reviewWords = words;
  reviewIndex = 0;
  knownCount = 0;
  reviewSessionId = window.crypto.randomUUID();
  reviewSaveCompleted = false;
  sessionPanel.hidden = false;
  wordListSection.hidden = true;
  renderReviewCard();
  sessionPanel.scrollIntoView({ block: "start" });
}

function renderReviewCard(): void {
  const word = reviewWords[reviewIndex];
  if (!word) return;

  const level = document.getElementById("reviewLevel");
  const wordName = document.getElementById("reviewWord");
  const phonetic = document.getElementById("reviewPhonetic");
  const meaning = document.getElementById("reviewMeaning");
  const meaningText = document.getElementById("reviewMeaningText");
  const example = document.getElementById("reviewExample");
  const exampleMeaning = document.getElementById("reviewExampleMeaning");
  const reveal = document.getElementById("revealMeaning") as HTMLButtonElement | null;
  const choices = document.getElementById("reviewChoices");
  const completion = document.getElementById("reviewCompletion");
  const progressText = document.getElementById("reviewProgressText");
  const progressFill = document.getElementById("reviewProgressFill") as HTMLElement | null;

  if (level) level.textContent = word.level;
  if (wordName) wordName.textContent = word.word;
  if (phonetic) phonetic.textContent = word.phonetic || "";
  if (meaningText) meaningText.textContent = word.meaning;
  if (example) example.textContent = word.example || "Chưa có câu ví dụ.";
  if (exampleMeaning) exampleMeaning.textContent = word.exampleMeaning || "";
  if (meaning) meaning.hidden = true;
  if (reveal) {
    reveal.hidden = false;
    reveal.textContent = "Hiện nghĩa";
    reveal.setAttribute("aria-expanded", "false");
  }
  if (choices) choices.hidden = false;
  if (completion) completion.hidden = true;
  if (progressText) progressText.textContent = `Từ ${reviewIndex + 1}/${reviewWords.length}`;
  if (progressFill) progressFill.style.width = `${(reviewIndex / reviewWords.length) * 100}%`;
}

function recordAnswer(known: boolean): void {
  if (known) knownCount += 1;
  reviewIndex += 1;
  if (reviewIndex < reviewWords.length) {
    renderReviewCard();
    return;
  }

  const choices = document.getElementById("reviewChoices");
  const reveal = document.getElementById("revealMeaning");
  const completion = document.getElementById("reviewCompletion");
  const completionText = document.getElementById("reviewCompletionText");
  const saveButton = document.getElementById("saveReview");
  const progressText = document.getElementById("reviewProgressText");
  const progressFill = document.getElementById("reviewProgressFill") as HTMLElement | null;
  if (choices) choices.hidden = true;
  if (reveal) reveal.hidden = true;
  if (completion) completion.hidden = false;
  if (completionText) {
    completionText.textContent = `Bạn đã ôn ${reviewWords.length} từ và nhớ ${knownCount} từ.`;
  }
  if (saveButton) saveButton.hidden = false;
  if (progressText) progressText.textContent = `Hoàn thành ${reviewWords.length}/${reviewWords.length} từ`;
  if (progressFill) progressFill.style.width = "100%";
}

async function saveReview(): Promise<void> {
  if (!reviewSessionId || reviewSaveCompleted) return;
  const saveButton = document.getElementById("saveReview") as HTMLButtonElement | null;
  const retryButton = document.getElementById("retrySaveReview") as HTMLButtonElement | null;
  const completionText = document.getElementById("reviewCompletionText");
  if (saveButton) saveButton.disabled = true;
  if (retryButton) retryButton.hidden = true;

  try {
    const result = asRecord(await slanguageApi("/api/v1/vocabulary/review-sessions/complete", {
      method: "POST",
      body: {
        session_id: reviewSessionId,
        reviewed_count: reviewWords.length,
        known_count: knownCount,
      },
    }));
    const data = asRecord(result.data) as Partial<ReviewCompletion>;
    if (
      typeof data.xp_total !== "number" ||
      typeof data.current_streak !== "number" ||
      typeof data.xp_awarded !== "number" ||
      typeof data.already_completed !== "boolean"
    ) {
      throw new Error("Máy chủ chưa trả về số liệu XP và streak hợp lệ.");
    }

    localStorage.setItem("slanguage_user_xp", String(data.xp_total));
    localStorage.setItem("slanguage_user_streak", String(data.current_streak));
    if (xpValue) xpValue.textContent = `${data.xp_total.toLocaleString("vi-VN")} XP`;
    reviewSaveCompleted = true;
    if (completionText) {
      completionText.textContent = data.already_completed
        ? "Phiên này đã được đồng bộ trước đó; XP không bị cộng lặp."
        : `Đã lưu phiên ôn. Bạn nhận ${data.xp_awarded} XP và đang có chuỗi ${data.current_streak} ngày.`;
    }
    if (saveButton) {
      saveButton.hidden = true;
      saveButton.disabled = false;
    }
    const retryNotice = document.getElementById("retrySaveReview");
    if (retryNotice) retryNotice.hidden = true;
  } catch (error) {
    if (completionText) {
      completionText.textContent = error instanceof Error
        ? `Chưa lưu được phiên ôn: ${error.message}`
        : "Chưa lưu được phiên ôn. Vui lòng thử lại.";
    }
    if (retryButton) retryButton.hidden = false;
    if (saveButton) saveButton.disabled = false;
  }
}

function leaveReview(): void {
  if (sessionPanel) sessionPanel.hidden = true;
  if (wordListSection) wordListSection.hidden = false;
  reviewWords = [];
  reviewSessionId = null;
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
  if (action === "study") startReview(getVisibleWords());
  else wordListSection?.scrollIntoView({ block: "start", behavior: "smooth" });
}

async function initVocabularyPage(): Promise<void> {
  const authenticated = isLearnerAuthenticated();
  setAuthState(authenticated);
  if (!authenticated) return;

  try {
    await loadTopics();
    const params = new URLSearchParams(window.location.search);
    const requestedTopicId = positiveInt(params.get("topic_id"));
    if (requestedTopicId && topics.some((topic) => topic.id === requestedTopicId)) {
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

function removeSavedTopic(topicId: number): void {
  selectedTopicIds = selectedTopicIds.filter((id) => id !== topicId);
  saveTopicIds();
  renderTopicCards();
  const topic = topics.find((item) => item.id === topicId);
  if (topic && addTopicSelect) {
    addTopicSelect.add(new Option(topic.name, String(topic.id)));
  }
  if (selectedTopicId === topicId) {
    selectedTopicId = null;
    wordViewMode = "lookup";
    if (sessionPanel) sessionPanel.hidden = true;
    if (wordListSection) wordListSection.hidden = true;
    const startReviewButton = document.getElementById("startPageReview");
    if (startReviewButton) startReviewButton.hidden = true;
    const wordCount = document.getElementById("wordCount");
    if (wordCount) wordCount.textContent = "";
  }
}

document.getElementById("addTopicButton")?.addEventListener("click", () => {
  const topicId = positiveInt(addTopicSelect?.value);
  if (!topicId || selectedTopicIds.includes(topicId)) return;
  selectedTopicIds = [...selectedTopicIds, topicId];
  saveTopicIds();
  renderTopicCards();
  const option = Array.from(addTopicSelect?.options || []).find(
    (item) => item.value === String(topicId),
  );
  option?.remove();
  if (addTopicSelect) addTopicSelect.value = "";
});

document.getElementById("searchWords")?.addEventListener("click", () => {
  selectedTopicId = null;
  wordViewMode = "lookup";
  pageOffset = 0;
  if (sessionPanel) sessionPanel.hidden = true;
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
  if (sessionPanel) sessionPanel.hidden = true;
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
topicGrid?.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const button = target.closest<HTMLButtonElement>("button[data-topic-id]");
  if (!button) return;
  const topicId = positiveInt(button.dataset.topicId);
  if (!topicId) return;
  if (button.dataset.topicAction === "remove") {
    removeSavedTopic(topicId);
    return;
  }
  const action = button.dataset.topicAction === "study" ? "study" : "browse";
  void openTopic(topicId, action).catch((error: unknown) =>
    setNotice(error instanceof Error ? error.message : "Không thể mở chủ đề.", true),
  );
});
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
document.getElementById("startPageReview")?.addEventListener("click", () => {
  startReview(getVisibleWords());
});
document.getElementById("refreshWords")?.addEventListener("click", () => {
  if (searchInput) searchInput.value = "";
  selectedTopicId = null;
  wordViewMode = "lookup";
  pageOffset = 0;
  if (sessionPanel) sessionPanel.hidden = true;
  const startReviewButton = document.getElementById("startPageReview");
  if (startReviewButton) startReviewButton.hidden = true;
  void loadWords().catch((error: unknown) =>
    setNotice(error instanceof Error ? error.message : "Không thể xóa tra cứu.", true),
  );
});
document.getElementById("revealMeaning")?.addEventListener("click", (event) => {
  const button = event.currentTarget as HTMLButtonElement;
  const meaning = document.getElementById("reviewMeaning");
  if (!meaning) return;
  meaning.hidden = !meaning.hidden;
  button.textContent = meaning.hidden ? "Hiện nghĩa" : "Ẩn nghĩa";
  button.setAttribute("aria-expanded", String(!meaning.hidden));
});
document.getElementById("markAgain")?.addEventListener("click", () => recordAnswer(false));
document.getElementById("markKnown")?.addEventListener("click", () => recordAnswer(true));
document.getElementById("saveReview")?.addEventListener("click", () => void saveReview());
document.getElementById("retrySaveReview")?.addEventListener("click", () => void saveReview());
document.getElementById("cancelReview")?.addEventListener("click", leaveReview);
void initializeLearnerHeader();

void initVocabularyPage();
