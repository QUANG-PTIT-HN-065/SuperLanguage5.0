import { isLearnerAuthenticated, slanguageApi } from "../shared/api-client";

interface Topic {
  id: number;
  name: string;
  description: string | null;
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

const topicFilter = document.getElementById("topicFilter") as HTMLSelectElement | null;
const searchInput = document.getElementById("wordSearch") as HTMLInputElement | null;
const notice = document.getElementById("vocabularyNotice");
const workspace = document.getElementById("vocabularyWorkspace");
const guestCard = document.getElementById("vocabularyGuest");
const wordGrid = document.getElementById("wordGrid");
const wordEmpty = document.getElementById("wordEmpty");
const sessionPanel = document.getElementById("reviewSession");
const wordListSection = document.getElementById("wordListSection");
const xpValue = document.getElementById("vocabularyXp");

let pageOffset = 0;
let totalAvailable = 0;
let topics: Topic[] = [];
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

async function loadTopics(): Promise<void> {
  const collected: Topic[] = [];
  let offset = 0;
  let available = 0;

  do {
    const page = parsePage(
      await slanguageApi(`/api/v1/vocabulary/topics?limit=${MAX_TOPICS_PER_PAGE}&offset=${offset}`),
      parseTopic,
    );
    collected.push(...page.items);
    available = page.available;
    offset += page.items.length;
    if (page.items.length === 0) break;
  } while (offset < available);

  topics = collected;
  if (!topicFilter) return;
  topicFilter.replaceChildren(new Option("Tất cả chủ đề", ""));
  for (const topic of topics) {
    topicFilter.add(new Option(topic.name, String(topic.id)));
  }
}

async function loadWords(): Promise<void> {
  setNotice("Đang tải từ vựng và chủ đề...");
  if (wordGrid) wordGrid.replaceChildren();

  const query = new URLSearchParams({
    limit: String(PAGE_SIZE),
    offset: String(pageOffset),
  });
  if (topicFilter?.value) query.set("topic_id", topicFilter.value);

  const page = parsePage(
    await slanguageApi(`/api/v1/vocabulary/words?${query.toString()}`),
    parseWord,
  );
  currentWords = page.items;
  totalAvailable = page.available;
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

  if (wordEmpty) wordEmpty.hidden = filtered.length > 0;
  const wordCount = document.getElementById("wordCount");
  if (wordCount) {
    wordCount.textContent = `${filtered.length} từ trên trang · ${totalAvailable} từ có thể học`;
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
  const term = searchInput?.value.trim().toLocaleLowerCase("vi-VN") || "";
  return currentWords.filter((word) =>
    `${word.word} ${word.meaning} ${word.phonetic || ""}`
      .toLocaleLowerCase("vi-VN")
      .includes(term),
  );
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

async function initVocabularyPage(): Promise<void> {
  const authenticated = isLearnerAuthenticated();
  setAuthState(authenticated);
  if (!authenticated) return;

  try {
    await loadTopics();
    await loadWords();
  } catch (error) {
    setNotice(error instanceof Error ? error.message : "Không thể tải kho từ vựng.", true);
  }
}

topicFilter?.addEventListener("change", () => {
  pageOffset = 0;
  void loadWords().catch((error: unknown) =>
    setNotice(error instanceof Error ? error.message : "Không thể tải chủ đề.", true),
  );
});
searchInput?.addEventListener("input", renderWords);
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
  void initVocabularyPage().catch((error: unknown) =>
    setNotice(error instanceof Error ? error.message : "Không thể làm mới kho từ vựng.", true),
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
document.getElementById("vocabularyLogout")?.addEventListener("click", (event) => {
  event.preventDefault();
  for (const key of [
    "slanguage_access_token",
    "slanguage_refresh_token",
    "slanguage_is_logged_in",
    "slanguage_user_id",
    "slanguage_user_email",
    "slanguage_user_name",
    "slanguage_active_language",
    "slanguage_user_xp",
    "slanguage_user_streak",
  ]) {
    localStorage.removeItem(key);
  }
  window.location.assign("../home/index.html");
});

void initVocabularyPage();
