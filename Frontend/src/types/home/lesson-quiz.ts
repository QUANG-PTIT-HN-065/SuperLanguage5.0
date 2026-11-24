import { isLearnerAuthenticated, slanguageApi } from "../shared/api-client";
import { formatHearts, readHearts, spendHearts } from "../shared/hearts";
import { t } from "../shared/i18n";
import { activateBestBoost, tryHealHearts } from "../shared/shop-items";
import type {
  LessonContent,
  LessonMatchingPair,
  LessonQuestion,
} from "./lesson-practice-generator";
import { launchConfetti } from "../ui/confetti";
import { showToast } from "../ui/toast";

const HEAL_POTION_IMG = new URL("../../../assets/potion_red.png", import.meta.url).href;

interface CheckedAnswer {
  selected_option_id: string;
  correct_option_id: string;
  is_correct: boolean;
  explanation: string | null;
}

interface LessonCompletion {
  score: number;
  question_count: number;
  passed: boolean;
  xp_awarded: number;
  xp_total: number;
  level: number;
  xp_into_level: number;
  current_streak: number;
  already_completed: boolean;
  boost: { item_id: string; title: string; multiplier: number } | null;
}

interface AnswerReview {
  prompt: string;
  selected: string;
  correct: string;
  explanation: string | null;
  isCorrect: boolean;
}

interface MatchingMistake {
  key: string;
  word: string;
  selectedMeaning: string;
  correctMeaning: string;
}

interface MatchingState {
  selectedCard: HTMLButtonElement | null;
  matchedIds: Set<string>;
  mistakes: MatchingMistake[];
  resolving: boolean;
  timer: number;
  status: HTMLElement;
}

const workspace = document.getElementById("lessonWorkspace");
const questionPanel = document.getElementById("lessonQuestion");
const resultPanel = document.getElementById("lessonResult") as HTMLDialogElement | null;
const lessonNotice = document.getElementById("lessonNotice");
const title = document.getElementById("lessonTitle");
const prompt = document.getElementById("lessonPrompt");
const optionsContainer = document.getElementById("lessonOptions");
const checkButton = document.getElementById("checkLessonAnswer") as HTMLButtonElement | null;
const nextButton = document.getElementById("nextLessonQuestion") as HTMLButtonElement | null;
const exitButton = document.getElementById("exitLesson") as HTMLButtonElement | null;
const readingPanel = document.getElementById("lessonReading");
const readingTitle = document.getElementById("lessonReadingTitle");
const readingText = document.getElementById("lessonReadingText");
const startQuizButton = document.getElementById("startLessonQuiz") as HTMLButtonElement | null;

let lesson: LessonContent | null = null;
let questionIndex = 0;
let selectedOptionId: string | null = null;
let checkedAnswer: CheckedAnswer | null = null;
let matchingState: MatchingState | null = null;
let activeRequest = false;
let completed = false;
let lessonHearts = readHearts();
let lastXpAwarded = 0;
let lastXpTotal = 0;
let lastLessonId = 0;
let lastTopicId = 0;
let intentionalDialogClose = false;
const answerReviews: AnswerReview[] = [];
function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function positiveInt(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
}

function nonNegativeInt(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : -1;
}

function setNotice(message: string, isError = false, imageSrc?: string): void {
  if (!lessonNotice) return;
  lessonNotice.hidden = !message;
  lessonNotice.replaceChildren();
  if (imageSrc) {
    const image = document.createElement("img");
    image.className = "lesson-notice__img";
    image.src = imageSrc;
    image.alt = "";
    image.width = 26;
    image.height = 26;
    lessonNotice.append(image);
  }
  lessonNotice.append(document.createTextNode(message));
  lessonNotice.dataset.state = isError ? "error" : "";
}

function updateHeartsDisplay(): void {
  const heartsElement = document.getElementById("headerHeartsVal");
  if (heartsElement) heartsElement.textContent = formatHearts(lessonHearts);
}

async function loadLessonContent(lessonId: number): Promise<LessonContent> {
  const response = await slanguageApi(`/api/v1/lessons/${lessonId}/questions`);
  return parseLessonContent(response.data);
}

async function requestAnswer(questionId: number, selected: string): Promise<CheckedAnswer> {
  const response = await slanguageApi(`/api/v1/lessons/questions/${questionId}/answer`, {
    method: "POST",
    body: { selected_option_id: selected },
  });
  const answer = asRecord(response.data);
  const selectedId = typeof answer.selected_option_id === "string" ? answer.selected_option_id : "";
  const correctId = typeof answer.correct_option_id === "string" ? answer.correct_option_id : "";
  if (typeof answer.is_correct !== "boolean" || !selectedId || !correctId) {
    throw new Error("Máy chủ chưa trả về kết quả đáp án hợp lệ.");
  }
  return {
    selected_option_id: selectedId,
    correct_option_id: correctId,
    is_correct: answer.is_correct,
    explanation: typeof answer.explanation === "string" ? answer.explanation : null,
  };
}

async function requestCompletion(content: LessonContent): Promise<LessonCompletion> {
  const response = await slanguageApi(`/api/v1/lessons/${content.lesson.id}/complete`, {
    method: "POST",
  });
  const result = asRecord(response.data) as Partial<LessonCompletion>;
  const parsedScore = nonNegativeInt(result.score);
  const count = positiveInt(result.question_count);
  const passed = result.passed === true;
  const xpAwarded = nonNegativeInt(result.xp_awarded);
  const xpTotal = nonNegativeInt(result.xp_total);
  const level = positiveInt(result.level);
  const xpIntoLevel = nonNegativeInt(result.xp_into_level);
  const currentStreak = nonNegativeInt(result.current_streak);
  const boostRecord = asRecord(result.boost);
  const boost = typeof boostRecord.title === "string" && Number(boostRecord.multiplier) > 1
    ? {
        item_id: typeof boostRecord.item_id === "string" ? boostRecord.item_id : "",
        title: boostRecord.title,
        multiplier: Number(boostRecord.multiplier),
      }
    : null;
  if (
    parsedScore < 0 ||
    !count ||
    typeof result.passed !== "boolean" ||
    xpAwarded < 0 ||
    xpTotal < 0 ||
    !level ||
    xpIntoLevel < 0 ||
    currentStreak < 0 ||
    typeof result.already_completed !== "boolean"
  ) {
    throw new Error("Máy chủ chưa trả về kết quả hoàn thành hợp lệ.");
  }
  return {
    score: parsedScore,
    question_count: count,
    passed,
    xp_awarded: xpAwarded,
    xp_total: xpTotal,
    level,
    xp_into_level: xpIntoLevel,
    current_streak: currentStreak,
    already_completed: result.already_completed,
    boost,
  };
}

function parseLessonContent(value: unknown): LessonContent {
  const payload = asRecord(value);
  const lessonData = asRecord(payload.lesson);
  const lessonId = positiveInt(lessonData.id);
  const lessonTitle = typeof lessonData.title === "string" ? lessonData.title.trim() : "";
  if (!lessonId || !lessonTitle || !Array.isArray(payload.questions) || !payload.questions.length) {
    throw new Error("Bài học chưa có câu hỏi hợp lệ.");
  }

  const questions = payload.questions.map((value) => {
    const question = asRecord(value);
    const id = positiveInt(question.id);
    const questionText = typeof question.prompt === "string" ? question.prompt.trim() : "";
    const questionType: "multiple_choice" | "fill_in" | null = question.question_type === "fill_in"
      ? "fill_in"
      : question.question_type === "multiple_choice" || question.question_type === undefined
        ? "multiple_choice"
        : null;
    if (
      !id ||
      !questionText ||
      !questionType ||
      !Array.isArray(question.options) ||
      (questionType === "multiple_choice" && question.options.length < 2)
    ) {
      throw new Error("Máy chủ trả về câu hỏi không hợp lệ.");
    }
    const parsedOptions = question.options.map((value) => {
      const option = asRecord(value);
      const optionId = typeof option.id === "string" ? option.id.trim() : "";
      const optionText = typeof option.text === "string" ? option.text.trim() : "";
      if (!optionId || !optionText) throw new Error("Máy chủ trả về đáp án không hợp lệ.");
      return { id: optionId, text: optionText };
    });
    if (new Set(parsedOptions.map((option) => option.id)).size !== parsedOptions.length) {
      throw new Error("Câu hỏi có lựa chọn trùng lặp.");
    }
    return { id, prompt: questionText, question_type: questionType, options: parsedOptions };
  });

  return {
    lesson: {
      id: lessonId,
      title: lessonTitle,
      description: typeof lessonData.description === "string" ? lessonData.description : null,
    },
    questions,
  };
}

function shuffleItems<T>(items: readonly T[]): T[] {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const other = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[other]] = [shuffled[other], shuffled[index]];
  }
  return shuffled;
}

function clearMatchingState(): void {
  if (matchingState) window.clearTimeout(matchingState.timer);
  matchingState = null;
}

function matchingCard(pair: LessonMatchingPair, side: "word" | "meaning"): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "lesson-matching__card";
  button.dataset.matchingPairId = pair.id;
  button.dataset.matchingSide = side;
  button.setAttribute("aria-pressed", "false");
  button.setAttribute("aria-label", `${side === "word" ? "Từ" : "Nghĩa"}: ${pair[side]}`);
  button.textContent = pair[side];
  return button;
}

function renderMatchingOptions(question: Extract<LessonQuestion, { question_type: "matching" }>): void {
  if (!optionsContainer) return;
  const wrapper = document.createElement("div");
  wrapper.className = "lesson-matching";
  wrapper.setAttribute("aria-label", "Bảng ghép từ với nghĩa");

  const status = document.createElement("p");
  status.className = "lesson-matching__status";
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  status.textContent = `Đã ghép 0/${question.pairs.length} cặp. Chọn một từ rồi chọn nghĩa tương ứng.`;

  const columns = document.createElement("div");
  columns.className = "lesson-matching__columns";
  for (const [side, headingText] of [["word", "Từ"], ["meaning", "Nghĩa"]] as const) {
    const column = document.createElement("section");
    const heading = document.createElement("h3");
    const group = document.createElement("div");
    const headingId = `lessonMatching${side}Heading`;
    column.className = "lesson-matching__column";
    heading.id = headingId;
    heading.textContent = headingText;
    group.className = "lesson-matching__cards";
    group.setAttribute("role", "group");
    group.setAttribute("aria-labelledby", headingId);
    const pairs = shuffleItems(question.pairs);
    group.append(...pairs.map((pair) => matchingCard(pair, side)));
    column.append(heading, group);
    columns.append(column);
  }
  wrapper.append(status, columns);
  optionsContainer.append(wrapper);
  matchingState = {
    selectedCard: null,
    matchedIds: new Set(),
    mistakes: [],
    resolving: false,
    timer: 0,
    status,
  };
}

function showReading(): void {
  if (!lesson || !readingPanel) {
    renderQuestion();
    return;
  }
  if (questionPanel) questionPanel.hidden = true;
  readingPanel.hidden = false;
  if (readingTitle) readingTitle.textContent = lesson.lesson.title;
  if (readingText) readingText.textContent = lesson.lesson.description ?? "";
  setNotice("");
  startQuizButton?.focus();
}

function renderQuestion(): void {
  if (!lesson || !optionsContainer) return;
  if (readingPanel) readingPanel.hidden = true;
  if (questionPanel) questionPanel.hidden = false;
  const question = lesson.questions[questionIndex];
  if (!question) return;

  selectedOptionId = null;
  checkedAnswer = null;
  if (title) title.textContent = lesson.lesson.title;
  const questionCount = document.getElementById("lessonQuestionCount");
  if (questionCount) questionCount.textContent = `Câu ${questionIndex + 1} trên ${lesson.questions.length}`;
  if (prompt) prompt.textContent = question.prompt;
  const questionType = document.getElementById("lessonQuestionType");
  const fillInLabel = "Nhập đáp án";
  if (questionType) {
    questionType.textContent = question.question_type === "fill_in"
      ? "Điền đáp án"
      : question.question_type === "matching"
        ? "Ghép từ với nghĩa"
        : "Chọn một đáp án";
  }

  clearMatchingState();
  optionsContainer.replaceChildren();
  optionsContainer.setAttribute(
    "aria-label",
    question.question_type === "matching"
      ? "Ghép từ với nghĩa"
      : question.question_type === "fill_in"
        ? fillInLabel
        : "Chọn một đáp án",
  );
  if (question.question_type === "matching") {
    renderMatchingOptions(question);
  } else if (question.question_type === "fill_in") {
    const input = document.createElement("input");
    input.type = "text";
    input.className = "lesson-answer-input";
    input.dataset.answerInput = "true";
    input.maxLength = 200;
    input.autocomplete = "off";
    input.spellcheck = false;
    input.setAttribute("aria-label", fillInLabel);
    input.placeholder = fillInLabel;
    optionsContainer.append(input);
  } else {
    for (const [index, option] of question.options.entries()) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "lesson-option";
      button.dataset.optionId = option.id;
      button.setAttribute("aria-pressed", "false");
      const letter = document.createElement("span");
      letter.className = "lesson-option-letter";
      letter.textContent = String.fromCharCode(65 + index);
      const text = document.createElement("span");
      text.className = "lesson-option-text";
      text.textContent = option.text;
      button.append(letter, text);
      optionsContainer.append(button);
    }
  }

  const progressText = document.getElementById("lessonProgressText");
  if (progressText) progressText.textContent = `Câu ${questionIndex + 1}/${lesson.questions.length}`;
  const progressFill = document.getElementById("lessonProgressFill");
  const progressTrack = document.getElementById("lessonProgressTrack");
  const progress = Math.round((questionIndex / lesson.questions.length) * 100);
  if (progressFill) progressFill.style.width = `${progress}%`;
  progressTrack?.setAttribute("aria-valuenow", String(progress));
  const feedback = document.getElementById("lessonFeedback");
  if (feedback) {
    feedback.hidden = true;
    feedback.classList.remove("is-in");
  }
  if (checkButton) {
    checkButton.hidden = false;
    checkButton.disabled = true;
  }
  if (nextButton) nextButton.hidden = true;
  setNotice("");
  title?.focus();
}

function updateMatchingStatus(message?: string): void {
  const question = lesson?.questions[questionIndex];
  if (!matchingState || question?.question_type !== "matching") return;
  const completedPairs = matchingState.matchedIds.size;
  const totalPairs = question.pairs.length;
  matchingState.status.textContent = message
    ?? `Đã ghép ${completedPairs}/${totalPairs} cặp. Chọn một từ rồi chọn nghĩa tương ứng.`;

  if (completedPairs === totalPairs) {
    selectedOptionId = matchingState.mistakes.length === 0 ? "all-matched" : "matched-with-mistakes";
    matchingState.status.textContent = matchingState.mistakes.length === 0
      ? `Đã ghép đủ ${totalPairs}/${totalPairs} cặp. Nhấn “Kiểm tra đáp án” để tiếp tục.`
      : `Đã ghép đủ ${totalPairs}/${totalPairs} cặp, nhưng có cặp chưa chính xác. Nhấn “Kiểm tra đáp án” để xem kết quả.`;
    if (checkButton) checkButton.disabled = false;
  }
}

function selectMatchingCard(card: HTMLButtonElement): void {
  const question = lesson?.questions[questionIndex];
  const state = matchingState;
  const pairId = card.dataset.matchingPairId;
  const side = card.dataset.matchingSide;
  if (
    question?.question_type !== "matching" ||
    !state ||
    !pairId ||
    (side !== "word" && side !== "meaning") ||
    state.resolving ||
    card.disabled
  ) {
    return;
  }

  const first = state.selectedCard;
  if (!first) {
    state.selectedCard = card;
    card.classList.add("is-selected");
    card.setAttribute("aria-pressed", "true");
    updateMatchingStatus(side === "word" ? "Đã chọn một từ. Giờ chọn nghĩa tương ứng." : "Đã chọn một nghĩa. Giờ chọn từ tương ứng.");
    return;
  }

  if (first === card) {
    first.classList.remove("is-selected");
    first.setAttribute("aria-pressed", "false");
    state.selectedCard = null;
    updateMatchingStatus();
    return;
  }

  const firstSide = first.dataset.matchingSide;
  if (firstSide === side) {
    first.classList.remove("is-selected");
    first.setAttribute("aria-pressed", "false");
    state.selectedCard = card;
    card.classList.add("is-selected");
    card.setAttribute("aria-pressed", "true");
    updateMatchingStatus(side === "word" ? "Đã đổi từ đã chọn. Chọn nghĩa tương ứng." : "Đã đổi nghĩa đã chọn. Chọn từ tương ứng.");
    return;
  }

  const wordCard = side === "word" ? card : first;
  const meaningCard = side === "meaning" ? card : first;
  const wordId = wordCard.dataset.matchingPairId;
  const meaningId = meaningCard.dataset.matchingPairId;
  const correctPair = question.pairs.find((pair) => pair.id === wordId);
  if (!wordId || !meaningId || !correctPair) return;

  state.selectedCard = null;
  if (wordId === meaningId) {
    state.matchedIds.add(wordId);
    for (const matchedCard of [wordCard, meaningCard]) {
      matchedCard.disabled = true;
      matchedCard.classList.remove("is-selected");
      matchedCard.classList.add("is-matched");
      matchedCard.setAttribute("aria-pressed", "false");
    }
    updateMatchingStatus();
    return;
  }

  const mistakeKey = `${wordId}:${meaningId}`;
  if (!state.mistakes.some((mistake) => mistake.key === mistakeKey)) {
    state.mistakes.push({
      key: mistakeKey,
      word: correctPair.word,
      selectedMeaning: meaningCard.textContent ?? "",
      correctMeaning: correctPair.meaning,
    });
  }
  state.resolving = true;
  wordCard.classList.add("is-wrong");
  meaningCard.classList.add("is-wrong");
  wordCard.setAttribute("aria-pressed", "true");
  meaningCard.setAttribute("aria-pressed", "true");
  state.status.textContent = `Cặp chưa khớp. Đã ghép ${state.matchedIds.size}/${question.pairs.length} cặp.`;
  state.timer = window.setTimeout(() => {
    for (const wrongCard of [wordCard, meaningCard]) {
      wrongCard.classList.remove("is-wrong");
      wrongCard.setAttribute("aria-pressed", "false");
    }
    state.resolving = false;
    updateMatchingStatus();
  }, window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 380);
}

export async function openLesson(lessonId: number, pushHistory: boolean, skipReading = false): Promise<void> {
  if (!isLearnerAuthenticated() || !workspace) return;
  if (activeRequest) return;
  closeResultDialog();
  if (resultPanel) resultPanel.hidden = true;
  activeRequest = true;
  completed = false;
  lesson = null;
  clearMatchingState();
  answerReviews.length = 0;
  lastLessonId = lessonId;
  lastTopicId = topicIdOfLesson(lessonId);
  if (pushHistory) {
    const url = new URL(window.location.href);
    url.searchParams.set("lesson_id", String(lessonId));
    window.history.pushState({ lessonId }, "", url);
  }
  document.getElementById("pathCatalogSection")?.toggleAttribute("hidden", true);
  document.getElementById("pathDetailSection")?.toggleAttribute("hidden", true);
  document.querySelector(".learning-actions-grid")?.toggleAttribute("hidden", true);
  workspace.hidden = false;
  document.body.classList.add("lesson-open");
  if (readingPanel) readingPanel.hidden = true;
  if (questionPanel) questionPanel.hidden = true;
  if (resultPanel) resultPanel.hidden = true;
  setNotice("Đang tải câu hỏi...");
  if (checkButton) checkButton.disabled = true;
  if (nextButton) nextButton.hidden = true;
  if (exitButton) exitButton.disabled = true;

  try {
    lesson = await loadLessonContent(lessonId);
    void activateBestBoost();
    lessonHearts = readHearts();
    if (lessonHearts === 0) {
      const healed = await tryHealHearts();
      if (!healed) {
        setNotice(
          "Hết máu — sinh lực đang khóa hồi 24 giờ. Mua Hồi Phục Máu Siêu Tốc trong Cửa hàng để học tiếp ngay.",
          true,
          HEAL_POTION_IMG,
        );
        return;
      }
      lessonHearts = readHearts();
    }
    updateHeartsDisplay();
    questionIndex = 0;
    if (!skipReading && lesson.lesson.description?.trim()) showReading();
    else renderQuestion();
  } catch (error) {
    setNotice(error instanceof Error ? error.message : "Không thể tải bài học.", true);
  } finally {
    activeRequest = false;
    if (exitButton) exitButton.disabled = false;
  }
}

function selectOption(event: Event): void {
  if (checkedAnswer || activeRequest) return;
  const target = event.target;
  if (!(target instanceof Element)) return;
  const question = lesson?.questions[questionIndex];
  if (question?.question_type === "matching") {
    const card = target.closest<HTMLButtonElement>("[data-matching-pair-id]");
    if (card && optionsContainer?.contains(card)) selectMatchingCard(card);
    return;
  }
  const option = target.closest<HTMLButtonElement>("[data-option-id]");
  if (!option || !optionsContainer?.contains(option)) return;
  selectedOptionId = option.dataset.optionId || null;
  for (const button of optionsContainer.querySelectorAll<HTMLButtonElement>("[data-option-id]")) {
    const selected = button === option;
    button.classList.toggle("is-selected", selected);
    button.setAttribute("aria-pressed", String(selected));
  }
  if (checkButton) checkButton.disabled = !selectedOptionId;
}

function updateFillInAnswer(event: Event): void {
  if (checkedAnswer || activeRequest || !(event.target instanceof HTMLInputElement)) return;
  if (!event.target.matches("[data-answer-input]")) return;
  selectedOptionId = event.target.value.trim() || null;
  if (checkButton) checkButton.disabled = !selectedOptionId;
}

type LessonCue = "correct" | "wrong" | "pass" | "fail";

const LESSON_CUE_NOTES: Record<LessonCue, number[]> = {
  correct: [880, 1318.5],
  wrong: [392, 261.6],
  pass: [659.3, 830.6, 1046.5, 1318.5],
  fail: [440, 349.2, 261.6],
};

const VERDICT_ANIMATIONS = ["is-in", "is-shake", "is-glow"];

let audioContext: AudioContext | null = null;
let verdictToastTimer = 0;

/** Trình duyệt chỉ cho mở AudioContext sau một thao tác chạm của người dùng. */
function unlockLessonAudio(): void {
  const Constructor = window.AudioContext
    ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Constructor) return;
  try {
    audioContext ??= new Constructor();
    if (audioContext.state === "suspended") void audioContext.resume();
  } catch {
    audioContext = null;
  }
}

/** Âm báo tổng hợp bằng WebAudio để khỏi nạp thêm file audio cho ba lượt đúng/sai/tổng kết. */
function playLessonCue(cue: LessonCue): void {
  const context = audioContext;
  if (!context || context.state === "closed") return;
  const rising = cue === "correct" || cue === "pass";
  try {
    let at = context.currentTime;
    for (const frequency of LESSON_CUE_NOTES[cue]) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = rising ? "sine" : "triangle";
      oscillator.frequency.setValueAtTime(frequency, at);
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(rising ? 0.16 : 0.12, at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.22);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(at);
      oscillator.stop(at + 0.24);
      at += rising ? 0.09 : 0.14;
    }
  } catch {
    // Bỏ qua khi trình duyệt chặn phát âm thanh.
  }
}

function replayAnimation(element: HTMLElement, className: string): void {
  element.classList.remove(...VERDICT_ANIMATIONS);
  void element.offsetWidth;
  element.classList.add(className);
}

function showVerdictToast(isCorrect: boolean, heartsLost: boolean): void {
  const toast = document.getElementById("lessonVerdictToast");
  if (!toast) return;
  toast.dataset.state = isCorrect ? "correct" : "incorrect";
  const icon = toast.querySelector<HTMLElement>(".lesson-toast__icon");
  if (icon) icon.className = `lesson-toast__icon fa-solid ${isCorrect ? "fa-circle-check" : "fa-heart-crack"}`;
  const text = toast.querySelector<HTMLElement>(".lesson-toast__text");
  if (text) {
    text.textContent = isCorrect
      ? t("sl.verdictCorrect")
      : heartsLost
        ? t("sl.verdictHearts", { hearts: formatHearts(lessonHearts) })
        : t("sl.verdictWrong");
  }
  replayAnimation(toast, "is-in");
  window.clearTimeout(verdictToastTimer);
  verdictToastTimer = window.setTimeout(() => toast.classList.remove("is-in"), 1800);
}

function showVerdict(isCorrect: boolean, detail: string, heartsLost: boolean): void {
  const banner = document.getElementById("lessonFeedback");
  if (!banner) return;
  banner.dataset.state = isCorrect ? "correct" : "incorrect";
  const icon = banner.querySelector<HTMLElement>(".lesson-verdict__icon i");
  if (icon) icon.className = `fa-solid ${isCorrect ? "fa-circle-check" : "fa-circle-xmark"}`;
  const heading = banner.querySelector<HTMLElement>(".lesson-verdict__title");
  if (heading) heading.textContent = t(isCorrect ? "sl.verdictCorrect" : "sl.verdictWrong");
  const text = banner.querySelector<HTMLElement>(".lesson-verdict__text");
  if (text) text.textContent = detail;
  const chip = banner.querySelector<HTMLElement>(".lesson-verdict__chip");
  if (chip) {
    chip.hidden = !heartsLost;
    if (heartsLost) {
      const chipText = chip.querySelector<HTMLElement>(".lesson-verdict__chip-text");
      if (chipText) chipText.textContent = t("sl.verdictHearts", { hearts: formatHearts(lessonHearts) });
    }
  }
  banner.hidden = false;
  replayAnimation(banner, "is-in");
  if (questionPanel) replayAnimation(questionPanel, isCorrect ? "is-glow" : "is-shake");
  showVerdictToast(isCorrect, heartsLost);
  playLessonCue(isCorrect ? "correct" : "wrong");
}

async function checkAnswer(): Promise<void> {
  if (!lesson || !selectedOptionId || checkedAnswer || activeRequest || !checkButton) return;
  const question = lesson.questions[questionIndex];
  if (!question) return;
  activeRequest = true;
  checkButton.disabled = true;
  if (exitButton) exitButton.disabled = true;
  setNotice("");
  try {
    const answer = await requestAnswer(question.id, selectedOptionId);
    const selected = answer.selected_option_id;
    const correct = answer.correct_option_id;
    checkedAnswer = answer;
    if (question.question_type === "matching") {
      for (const mistake of matchingState?.mistakes ?? []) {
        answerReviews.push({
          prompt: `Ghép từ “${mistake.word}” với nghĩa tương ứng.`,
          selected: mistake.selectedMeaning,
          correct: mistake.correctMeaning,
          explanation: null,
          isCorrect: false,
        });
      }
      if (answer.is_correct) {
        answerReviews.push({
          prompt: question.prompt || t("sl.reviewMatchingAll"),
          selected: t("sl.reviewMatchingAll"),
          correct: t("sl.reviewMatchingAll"),
          explanation: answer.explanation,
          isCorrect: true,
        });
      }
    } else {
      const selectedText = question.question_type === "fill_in"
        ? answer.selected_option_id
        : question.options.find((option) => option.id === selected)?.text ?? selected;
      const correctText = question.options.find((option) => option.id === correct)?.text ?? correct;
      answerReviews.push({
        prompt: question.prompt,
        selected: selectedText,
        correct: correctText,
        explanation: answer.explanation,
        isCorrect: answer.is_correct,
      });
    }

    for (const button of optionsContainer?.querySelectorAll<HTMLButtonElement>("[data-option-id]") || []) {
      button.disabled = true;
      if (button.dataset.optionId === correct) button.classList.add("is-correct");
      if (button.dataset.optionId === selected && !answer.is_correct) {
        button.classList.add("is-incorrect");
      }
    }
    for (const button of optionsContainer?.querySelectorAll<HTMLButtonElement>(".lesson-matching__card") || []) {
      button.disabled = true;
    }
    const answerInput = optionsContainer?.querySelector<HTMLInputElement>("[data-answer-input]");
    if (answerInput) answerInput.disabled = true;
    const hint = question.question_type === "matching"
      ? answer.is_correct
        ? "Ghép chính xác tất cả các cặp."
        : "Có cặp ghép chưa chính xác. Xem lại đáp án ở phần tổng kết."
      : !answer.is_correct && question.question_type === "fill_in"
        ? `Đáp án đúng là “${correct}”.`
        : !answer.is_correct
          ? "Đáp án đúng đã được đánh dấu màu xanh."
          : "";
    let heartsLost = false;
    if (!answer.is_correct) {
      lessonHearts = spendHearts(1);
      updateHeartsDisplay();
      heartsLost = true;
    }
    showVerdict(
      answer.is_correct,
      [hint, answer.explanation ?? ""].filter(Boolean).join(" "),
      heartsLost,
    );
    if (heartsLost && lessonHearts === 0) {
      const healed = await tryHealHearts();
      if (healed) {
        lessonHearts = readHearts();
        updateHeartsDisplay();
      } else {
        checkButton.hidden = true;
        if (nextButton) nextButton.hidden = true;
        setNotice(
          "Hết máu — bài học kết thúc tại đây. Mua Hồi Phục Máu Siêu Tốc trong Cửa hàng hoặc chờ sinh lực hồi để học tiếp.",
          true,
          HEAL_POTION_IMG,
        );
        showToast({ type: "error", message: "Hết máu! Sinh lực khóa hồi 24 giờ — bài học dừng lại." });
        return;
      }
    }
    const progress = Math.round(((questionIndex + 1) / lesson.questions.length) * 100);
    const progressFill = document.getElementById("lessonProgressFill");
    const progressTrack = document.getElementById("lessonProgressTrack");
    if (progressFill) progressFill.style.width = `${progress}%`;
    progressTrack?.setAttribute("aria-valuenow", String(progress));
    checkButton.hidden = true;
    if (nextButton) {
      nextButton.hidden = false;
      nextButton.focus();
    }
  } catch (error) {
    checkButton.disabled = false;
    const message = error instanceof Error ? error.message : "Không thể kiểm tra đáp án.";
    setNotice(message, true);
    showToast({ type: "error", message });
  } finally {
    activeRequest = false;
    if (exitButton) exitButton.disabled = false;
  }
}

function formatScore(score: number, count: number): string {
  return `${score}/${count}`;
}

function renderAnswerReviews(): void {
  const section = document.getElementById("lessonReview");
  const list = document.getElementById("lessonReviewList");
  if (!section || !list) return;

  const correctCount = answerReviews.filter((entry) => entry.isCorrect).length;
  const wrongCount = answerReviews.length - correctCount;
  const total = lesson?.questions.length ?? answerReviews.length;
  const setCount = (id: string, value: number): void => {
    const element = document.getElementById(id);
    if (element) element.textContent = String(value);
  };
  setCount("reviewCountAll", answerReviews.length);
  setCount("reviewCountCorrect", correctCount);
  setCount("reviewCountWrong", wrongCount);

  section.hidden = answerReviews.length === 0;
  list.replaceChildren();
  for (const [index, entry] of answerReviews.entries()) {
    list.append(answerReviewCard(entry, index, total));
  }
  applyReviewFilter(wrongCount > 0 ? "wrong" : "all");
}

function answerReviewCard(entry: AnswerReview, index: number, total: number): HTMLElement {
  const card = document.createElement("article");
  card.className = `lesson-review__card ${entry.isCorrect ? "is-correct" : "is-wrong"}`;
  card.dataset.result = entry.isCorrect ? "correct" : "wrong";

  const header = document.createElement("div");
  header.className = "lesson-review__card-head";
  const number = document.createElement("span");
  number.textContent = t("sl.reviewQuestion", { n: index + 1, total });
  const status = document.createElement("span");
  status.className = "lesson-review__status";
  status.textContent = t(entry.isCorrect ? "sl.reviewStatusCorrect" : "sl.reviewStatusWrong");
  header.append(number, status);

  const question = document.createElement("p");
  question.className = "lesson-review__prompt";
  question.textContent = entry.prompt;

  const answers = document.createElement("div");
  answers.className = `lesson-review__answers${entry.isCorrect ? " lesson-review__answers--single" : ""}`;
  answers.append(reviewAnswerBox(
    entry.isCorrect ? "correct" : "wrong",
    t("sl.reviewYourAnswer"),
    entry.selected,
  ));
  if (!entry.isCorrect) {
    answers.append(reviewAnswerBox("correct", t("sl.reviewCorrectAnswer"), entry.correct));
  }

  card.append(header, question, answers);
  if (entry.explanation) {
    const explanation = document.createElement("p");
    explanation.className = "lesson-review__explanation";
    const label = document.createElement("strong");
    label.textContent = t("sl.reviewExplanation");
    explanation.append(label, document.createTextNode(` ${entry.explanation}`));
    card.append(explanation);
  }
  return card;
}

function reviewAnswerBox(
  state: "correct" | "wrong",
  label: string,
  value: string,
): HTMLElement {
  const box = document.createElement("div");
  box.className = `lesson-review__box lesson-review__box--${state}`;
  const boxLabel = document.createElement("span");
  boxLabel.className = "lesson-review__box-label";
  boxLabel.textContent = label;
  const boxValue = document.createElement("span");
  boxValue.textContent = value;
  box.append(boxLabel, boxValue);
  return box;
}

function applyReviewFilter(filter: "all" | "correct" | "wrong"): void {
  const list = document.getElementById("lessonReviewList");
  const empty = document.getElementById("lessonReviewEmpty");
  for (const button of document.querySelectorAll<HTMLButtonElement>(".lesson-review__filter")) {
    const active = button.dataset.reviewFilter === filter;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  }
  let visible = 0;
  for (const card of list?.querySelectorAll<HTMLElement>(".lesson-review__card") || []) {
    const show = filter === "all" || card.dataset.result === filter;
    card.hidden = !show;
    if (show) visible += 1;
  }
  if (empty) {
    empty.textContent = t(filter === "wrong" ? "sl.reviewEmptyWrong" : "sl.reviewEmptyOther");
    empty.hidden = visible > 0;
  }
}

function animateScore(score: number, count: number): void {
  const scoreValue = document.getElementById("lessonScoreValue");
  const scoreStat = document.getElementById("lessonStatScore");
  const announcement = document.getElementById("lessonScoreAnnouncement");
  const ring = document.getElementById("lessonScoreRing") as SVGCircleElement | null;
  const ringLabel = document.querySelector<HTMLElement>(".lesson-result__score-ring");
  if (!scoreValue || !ring) return;

  const radius = Number(ring.getAttribute("r")) || 56;
  const circumference = 2 * Math.PI * radius;
  ring.style.strokeDasharray = `${circumference}`;
  ring.style.strokeDashoffset = `${circumference}`;
  ringLabel?.setAttribute("aria-label", `Kết quả: ${formatScore(score, count)} câu đúng`);
  scoreValue.textContent = formatScore(score, count);
  if (scoreStat) scoreStat.textContent = String(Math.round((score / count) * 100));

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const duration = reducedMotion ? 0 : 1000;
  const startedAt = performance.now();
  const draw = (now: number): void => {
    const progress = duration === 0 ? 1 : Math.min(1, (now - startedAt) / duration);
    const eased = 1 - (1 - progress) ** 3;
    const currentScore = Math.round(score * eased);
    scoreValue.textContent = formatScore(currentScore, count);
    if (scoreStat) scoreStat.textContent = String(Math.round((currentScore / count) * 100));
    ring.style.strokeDashoffset = `${circumference * (1 - (score / count) * eased)}`;
    if (progress < 1) window.requestAnimationFrame(draw);
    else if (announcement) announcement.textContent = `Bạn đạt ${formatScore(score, count)} câu đúng.`;
  };
  window.requestAnimationFrame(draw);
}

function animateXp(amount: number): void {
  const element = document.getElementById("lessonResultXp");
  if (!element) return;
  element.textContent = `+${amount} XP`;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const duration = reducedMotion ? 0 : 800;
  const startedAt = performance.now();
  const draw = (now: number): void => {
    const progress = duration === 0 ? 1 : Math.min(1, (now - startedAt) / duration);
    const current = Math.round(amount * (1 - (1 - progress) ** 3));
    element.textContent = `+${current} XP`;
    if (progress < 1) window.requestAnimationFrame(draw);
  };
  window.requestAnimationFrame(draw);
}

function renderScoreDelta(score: number, lessonId: number): void {
  const element = document.getElementById("lessonScoreDelta");
  if (!element) return;
  const key = `slanguage_lesson_last_score_${lessonId}`;
  const storedScore = localStorage.getItem(key);
  const previous = storedScore === null ? -1 : nonNegativeInt(storedScore);
  element.hidden = false;
  element.classList.remove("is-better", "is-lower", "is-same");
  if (previous < 0) {
    element.textContent = "Lần đầu bạn hoàn thành bài này.";
    element.classList.add("is-same");
  } else {
    const difference = score - previous;
    element.classList.add(difference > 0 ? "is-better" : difference < 0 ? "is-lower" : "is-same");
    element.textContent = difference > 0
      ? `+${difference} câu đúng so với lần trước`
      : difference < 0
        ? `${difference} câu đúng so với lần trước`
        : "Điểm số không đổi so với lần trước";
  }
  localStorage.setItem(key, String(score));
}

function hasNextTopic(): boolean {
  if (!lastTopicId) return false;
  const topicIds = [...document.querySelectorAll<SVGGElement>(".roadmap-node[data-topic-id], .session-card[data-topic-id]")]
    .map((node) => positiveInt(node.dataset.topicId))
    .filter(Boolean);
  const currentIndex = topicIds.indexOf(lastTopicId);
  return currentIndex >= 0 && currentIndex < topicIds.length - 1;
}

function closeResultDialog(): void {
  if (resultPanel?.open) {
    intentionalDialogClose = true;
    resultPanel.close();
  }
}

function renderResult(result: LessonCompletion, lessonId: number, fallbackNote = ""): void {
  if (!resultPanel || !lesson) return;
  const { score, question_count: count, passed, xp_awarded: xpAwarded, current_streak: streak } = result;
  const xpReceived = result.already_completed ? 0 : xpAwarded;
  const headline = document.getElementById("lessonResultHeadline");
  const titleElement = document.getElementById("lessonResultTitle");
  const textElement = document.getElementById("lessonResultText");
  const eyebrow = document.getElementById("lessonResultEyebrow");
  const rule = document.getElementById("lessonPassRule");
  const unlock = document.getElementById("lessonUnlockNotice");
  const retryButton = document.getElementById("retryLesson") as HTMLButtonElement | null;
  const continueButton = document.getElementById("continueToPath") as HTMLButtonElement | null;
  const returnButton = document.getElementById("returnToTopics") as HTMLButtonElement | null;
  const streakElement = document.getElementById("lessonResultStreak");

  completed = passed;
  lastXpTotal = result.xp_total;
  headline?.setAttribute("data-state", passed ? "passed" : "failed");
  if (eyebrow) eyebrow.textContent = passed
    ? "Một bước tiến mới"
    : "Thêm một lượt luyện nữa";
  if (titleElement) {
    titleElement.textContent = passed
      ? "Quá đã! Bạn làm được rồi"
      : `Chưa đủ ${count}/${count} lần này`;
  }
  if (textElement) {
    const boostNote = result.boost && !result.already_completed
      ? ` · ${result.boost.title} đã áp dụng`
      : "";
    textElement.textContent = passed
      ? result.already_completed
        ? `${formatScore(score, count)} câu đúng · Kết quả này đã được ghi nhận trước đó.`
        : `${formatScore(score, count)} câu đúng · Bạn vừa tiến thêm một bước trên lộ trình.${boostNote}`
      : `${formatScore(score, count)} câu đúng — vài từ đang chơi trốn tìm thôi. Mình xem lại rồi thử thêm lượt nữa nhé!${boostNote}`;
  }
  if (unlock) {
    unlock.hidden = !passed;
    const message = unlock.querySelector("span");
    if (message) {
      message.textContent = hasNextTopic()
        ? "Đã mở khóa chủ đề tiếp theo"
        : "Bạn đã hoàn thành bài học 4/4";
    }
  }
  if (rule) {
    rule.hidden = passed;
    rule.textContent = `Cần đạt ${count}/${count} để mở khóa chủ đề tiếp theo.`;
  }
  if (retryButton) {
    retryButton.hidden = passed;
    retryButton.textContent = `Thử lại ${count} câu`;
  }
  if (continueButton) continueButton.hidden = !passed;
  if (returnButton) returnButton.textContent = "Để sau";
  if (returnButton) returnButton.hidden = passed;
  if (streakElement) streakElement.textContent = `${streak} ngày`;
  const correctStat = document.getElementById("lessonStatCorrect");
  if (correctStat) correctStat.textContent = formatScore(score, count);
  const heartsStat = document.getElementById("lessonStatHearts");
  if (heartsStat) heartsStat.textContent = formatHearts(lessonHearts);
  const badge = document.getElementById("lessonResultBadge");
  if (badge) {
    badge.dataset.state = passed ? "passed" : "failed";
    const icon = badge.querySelector<HTMLElement>("i");
    if (icon) icon.className = `fa-solid ${passed ? "fa-trophy" : "fa-heart-crack"}`;
  }

  try {
    renderAnswerReviews();
  } catch {
    const section = document.getElementById("lessonReview");
    if (section) section.hidden = true;
  }
  renderScoreDelta(score, lessonId);
  animateScore(score, count);
  animateXp(xpReceived);

  const resultNotice = document.getElementById("lessonResultNotice");
  if (resultNotice) {
    resultNotice.textContent = fallbackNote;
    resultNotice.hidden = !fallbackNote;
  }

  localStorage.setItem("slanguage_user_xp", String(result.xp_total));
  localStorage.setItem("slanguage_user_streak", String(streak));
  const headerXp = document.getElementById("headerXPVal");
  if (headerXp) headerXp.textContent = `${result.xp_total.toLocaleString("vi-VN")} XP`;
  const headerStreak = document.getElementById("headerStreakVal");
  if (headerStreak) headerStreak.textContent = String(streak);
  lastXpAwarded = xpReceived;

  resultPanel.hidden = false;
  resultPanel.showModal();
  window.requestAnimationFrame(() => {
    (passed ? continueButton : retryButton)?.focus();
  });

  playLessonCue(passed ? "pass" : "fail");
  if (passed && !result.already_completed) {
    launchConfetti(resultPanel);
  }
}

/** Kết quả tính tạm ở trình duyệt khi máy chủ không chịu ghi nhận — vẫn đủ cho màn tổng kết. */
function localCompletion(lessonId: number): LessonCompletion {
  const count = lesson?.questions.length ?? answerReviews.length;
  const score = answerReviews.filter((entry) => entry.isCorrect).length;
  const xpTotal = Math.max(0, nonNegativeInt(localStorage.getItem("slanguage_user_xp")));
  return {
    score,
    question_count: count,
    passed: count > 0 && score === count,
    xp_awarded: 0,
    xp_total: xpTotal,
    level: Math.floor(xpTotal / 100) + 1,
    xp_into_level: xpTotal % 100,
    current_streak: Math.max(0, nonNegativeInt(localStorage.getItem("slanguage_user_streak"))),
    already_completed: false,
    boost: null,
  };
}

async function finishLesson(): Promise<void> {
  if (!lesson || activeRequest) return;
  const lessonId = lesson.lesson.id;
  activeRequest = true;
  if (nextButton) nextButton.disabled = true;
  if (exitButton) exitButton.disabled = true;
  setNotice("");
  try {
    const result = await requestCompletion(lesson);
    if (questionPanel) questionPanel.hidden = true;
    renderResult(result, lessonId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Không thể lưu kết quả bài học.";
    if (questionPanel) questionPanel.hidden = true;
    renderResult(
      localCompletion(lessonId),
      lessonId,
      `Máy chủ chưa ghi nhận được kết quả (${message}) — điểm dưới đây là tính toán tạm trên trình duyệt, XP chưa được cộng.`,
    );
  } finally {
    activeRequest = false;
    if (nextButton) nextButton.disabled = false;
    if (exitButton) exitButton.disabled = false;
  }
}

function goToNextQuestion(): void {
  if (!lesson || !checkedAnswer || activeRequest) return;
  if (questionIndex + 1 < lesson.questions.length) {
    questionIndex += 1;
    renderQuestion();
  } else {
    void finishLesson();
  }
}

function leaveLesson(confirmExit = true): void {
  if (activeRequest) return;
  if (confirmExit && !completed && lesson && !window.confirm(
    "Thoát bài học giữa chừng? Những câu đã kiểm tra sẽ được lưu, nhưng bài tiếp theo vẫn khóa cho đến khi bạn hoàn thành.",
  )) {
    return;
  }
  closeResultDialog();
  if (resultPanel) resultPanel.hidden = true;
  if (readingPanel) readingPanel.hidden = true;
  if (workspace) workspace.hidden = true;
  document.body.classList.remove("lesson-open");
  const pathId = positiveInt(new URLSearchParams(window.location.search).get("path_id"));
  document.getElementById("pathCatalogSection")?.toggleAttribute("hidden", pathId > 0);
  document.getElementById("pathDetailSection")?.toggleAttribute("hidden", pathId === 0);
  document.querySelector(".learning-actions-grid")?.toggleAttribute("hidden", false);
  window.requestAnimationFrame(() => {
    document.getElementById(pathId > 0 ? "pathDetailTitle" : "pathCatalogTitle")?.focus();
  });
  const url = new URL(window.location.href);
  url.searchParams.delete("lesson_id");
  window.history.replaceState({}, "", url);
  lesson = null;
  setNotice("");
  if (completed) {
    window.dispatchEvent(new CustomEvent("lesson:completed", {
      detail: {
        xp_awarded: lastXpAwarded,
        xp_total: lastXpTotal,
        lesson_id: lastLessonId,
        topic_id: lastTopicId,
      },
    }));
    if (lastXpAwarded > 0) {
      const streak = document.getElementById("headerStreakVal")?.textContent ?? "0";
      showToast({ type: "success", message: `Bạn nhận được +${lastXpAwarded} XP. Chuỗi học hiện tại: ${streak} ngày.` });
    }
    completed = false;
  }
}

/** Chủ đề sở hữu bài học, đọc từ danh sách bài học đang mở trên bản đồ lộ trình. */
function topicIdOfLesson(lessonId: number): number {
  const buttons = [
    ...document.querySelectorAll<HTMLButtonElement>(`.topic-start-button[data-lesson-id="${lessonId}"]`),
  ];
  const button = buttons.find((item) => item.offsetParent !== null) ?? buttons[0];
  const list = button?.closest<HTMLElement>(".topic-lesson-list");
  const fromList = positiveInt(list?.dataset.topicId);
  if (fromList) return fromList;
  const openCard = document.querySelector<HTMLElement>(`[data-open-lesson="${lessonId}"]`);
  return positiveInt(openCard?.closest<HTMLElement>("[data-topic-id]")?.dataset.topicId);
}

document.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const lessonButton = target.closest<HTMLButtonElement>("[data-lesson-id]");
  const lessonId = positiveInt(lessonButton?.dataset.lessonId);
  if (lessonId) void openLesson(lessonId, true);
});
optionsContainer?.addEventListener("click", selectOption);
optionsContainer?.addEventListener("input", updateFillInAnswer);
checkButton?.addEventListener("click", () => void checkAnswer());
nextButton?.addEventListener("click", goToNextQuestion);
document.getElementById("exitLesson")?.addEventListener("click", () => leaveLesson());
document.getElementById("returnToTopics")?.addEventListener("click", () => leaveLesson(false));
document.getElementById("retryLesson")?.addEventListener("click", () => {
  if (lesson) void openLesson(lesson.lesson.id, false, true);
});
startQuizButton?.addEventListener("click", () => {
  if (!lesson) return;
  if (readingPanel) readingPanel.hidden = true;
  renderQuestion();
});
document.getElementById("continueToPath")?.addEventListener("click", () => leaveLesson(false));
document.getElementById("closeLessonResult")?.addEventListener("click", () => leaveLesson(false));
resultPanel?.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  event.preventDefault();
  leaveLesson(false);
});
resultPanel?.addEventListener("close", () => {
  resultPanel.hidden = true;
  if (intentionalDialogClose) {
    intentionalDialogClose = false;
    return;
  }
  leaveLesson(false);
});
workspace?.addEventListener("pointerdown", unlockLessonAudio);
window.addEventListener("keydown", unlockLessonAudio, { once: true });
for (const button of document.querySelectorAll<HTMLButtonElement>(".lesson-review__filter")) {
  button.addEventListener("click", () => {
    const filter = button.dataset.reviewFilter;
    if (filter === "all" || filter === "correct" || filter === "wrong") applyReviewFilter(filter);
  });
}

window.addEventListener("popstate", () => {
  const lessonId = positiveInt(new URLSearchParams(window.location.search).get("lesson_id"));
  if (lessonId) {
    void openLesson(lessonId, false);
  } else if (workspace && !workspace.hidden) {
    leaveLesson(false);
  }
});

const initialLessonId = positiveInt(new URLSearchParams(window.location.search).get("lesson_id"));
if (initialLessonId) {
  const openWhenReady = (): void => {
    void openLesson(initialLessonId, false);
  };
  if (document.body.dataset.pageState === "ready") openWhenReady();
  else window.addEventListener("learning:ready", openWhenReady, { once: true });
}
