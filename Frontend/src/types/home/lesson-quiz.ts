import { isLearnerAuthenticated, readMockData, slanguageApi } from "../shared/api-client";
import { XP_PER_LEVEL, levelFromXp } from "./learner-progress";
import {
  generateMockPractice,
  MOCK_PRACTICE_TOPIC_IDS,
  parseTopicVocabulary,
  type LessonContent,
  type LessonMatchingPair,
  type LessonOption,
  type LessonQuestion,
} from "./lesson-practice-generator";
import { launchConfetti } from "../../ts/ui/confetti";
import { showToast } from "../../ts/ui/toast";

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
}

interface AnswerReview {
  prompt: string;
  selected: string;
  correct: string;
  explanation: string | null;
}

/** Khoá đáp án chỉ có trong mock/lesson-questions.json, dùng khi backend chưa chạy. */
interface DemoAnswerKey {
  correct_option_id: string;
  explanation: string | null;
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

const DEMO_XP_PER_LESSON = 20;

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

let lesson: LessonContent | null = null;
let questionIndex = 0;
let selectedOptionId: string | null = null;
let checkedAnswer: CheckedAnswer | null = null;
let matchingState: MatchingState | null = null;
let activeRequest = false;
let completed = false;
let demoScore = 0;
let lastXpAwarded = 0;
let lastXpTotal = 0;
let lastLessonId = 0;
let lastTopicId = 0;
let intentionalDialogClose = false;
const answerReviews: AnswerReview[] = [];
const demoAnswerKeys = new Map<number, DemoAnswerKey>();

function isDemoMode(): boolean {
  return document.body.dataset.demo === "true";
}

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

function setNotice(message: string, isError = false): void {
  if (!lessonNotice) return;
  lessonNotice.hidden = !message;
  lessonNotice.textContent = message;
  lessonNotice.dataset.state = isError ? "error" : "";
}

/** Mock có sẵn đáp án để chấm tại chỗ; API thật không bao giờ trả về trường này. */
function collectDemoAnswerKeys(value: unknown): void {
  demoAnswerKeys.clear();
  const questions = asRecord(value).questions;
  if (!Array.isArray(questions)) return;
  for (const item of questions) {
    const question = asRecord(item);
    const id = positiveInt(question.id);
    const correct = typeof question.correct_option_id === "string"
      ? question.correct_option_id.trim()
      : "";
    if (!id || !correct) continue;
    demoAnswerKeys.set(id, {
      correct_option_id: correct,
      explanation: typeof question.explanation === "string" ? question.explanation : null,
    });
  }
}

async function findDemoTopicId(lessonId: number): Promise<number> {
  const payload = await readMockData<unknown>("topic-lessons.json");
  for (const [topicId, value] of Object.entries(asRecord(payload))) {
    if (!Array.isArray(value)) continue;
    if (value.some((item) => positiveInt(asRecord(item).id) === lessonId)) {
      return positiveInt(topicId);
    }
  }
  return 0;
}

async function loadLessonContent(lessonId: number): Promise<LessonContent> {
  if (isDemoMode()) {
    const topicId = topicIdOfLesson(lessonId) || await findDemoTopicId(lessonId);
    if (MOCK_PRACTICE_TOPIC_IDS.has(topicId)) {
      const [lessonPayload, vocabularyPayload] = await Promise.all([
        readMockData<unknown>("lesson-questions.json", (data) => {
          const map = asRecord(data);
          return map[String(lessonId)] ?? map.default;
        }),
        readMockData<unknown>("topic-vocabulary.json"),
      ]);
      const lessonData = parseLessonContent(lessonPayload);
      const vocabularyTopics = asRecord(asRecord(vocabularyPayload).topics);
      if (!Object.prototype.hasOwnProperty.call(vocabularyTopics, String(topicId))) {
        throw new Error(`Chủ đề ${topicId} chưa có bộ từ vựng thử nghiệm.`);
      }
      const topic = parseTopicVocabulary(vocabularyPayload, topicId);
      const storageKey = `slanguage_mock_practice_recent_${topicId}`;
      const recentValue = localStorage.getItem(storageKey);
      const recentKeys: string[] = recentValue === null
        ? []
        : JSON.parse(recentValue) as string[];
      if (!Array.isArray(recentKeys) || recentKeys.some((key) => typeof key !== "string")) {
        throw new Error("Lịch sử đề thử không hợp lệ. Hãy xóa dữ liệu trang rồi thử lại.");
      }
      const generated = generateMockPractice(
        lessonId,
        lessonData.lesson.title,
        topic,
        recentKeys,
      );
      localStorage.setItem(
        storageKey,
        JSON.stringify([...recentKeys, ...generated.questionKeys].slice(-60)),
      );
      collectDemoAnswerKeys(generated.content);
      return generated.content;
    }

    const payload = await readMockData<unknown>("lesson-questions.json", (data) => {
      const map = asRecord(data);
      return map[String(lessonId)] ?? map.default;
    });
    collectDemoAnswerKeys(payload);
    const content = parseLessonContent(payload);
    content.lesson.id = lessonId;
    return content;
  }
  const response = await slanguageApi(`/api/v1/lessons/${lessonId}/questions`);
  return parseLessonContent(response.data);
}

async function requestAnswer(questionId: number, selected: string): Promise<CheckedAnswer> {
  if (isDemoMode()) {
    const key = demoAnswerKeys.get(questionId);
    if (!key) throw new Error("Dữ liệu mẫu chưa có đáp án cho câu hỏi này.");
    const normalize = (text: string): string => text.trim().toLocaleLowerCase("vi-VN");
    return {
      selected_option_id: selected,
      correct_option_id: key.correct_option_id,
      is_correct: normalize(selected) === normalize(key.correct_option_id),
      explanation: key.explanation,
    };
  }
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

async function requestCompletion(content: LessonContent, score: number): Promise<LessonCompletion> {
  const questionCount = content.questions.length;
  if (isDemoMode()) {
    const passed = score === questionCount;
    const previousXp = nonNegativeInt(localStorage.getItem("slanguage_user_xp"));
    const previousStreak = nonNegativeInt(localStorage.getItem("slanguage_user_streak"));
    const xpTotal = previousXp < 0 ? 0 : previousXp;
    const currentStreak = previousStreak < 0 ? 0 : previousStreak;
    const xpAwarded = content.generation?.source === "mock"
      ? 0
      : passed
        ? DEMO_XP_PER_LESSON
        : 0;
    return {
      score,
      question_count: questionCount,
      passed,
      xp_awarded: xpAwarded,
      xp_total: xpTotal + xpAwarded,
      level: levelFromXp(xpTotal),
      xp_into_level: xpTotal % XP_PER_LEVEL,
      current_streak: currentStreak,
      already_completed: false,
    };
  }
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

function renderQuestion(): void {
  if (!lesson || !optionsContainer) return;
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
  const isEnglishFillIn = question.question_type === "fill_in"
    && lesson.generation?.language_code === "en";
  const fillInLabel = isEnglishFillIn ? "Nhập nghĩa tiếng Việt" : "Nhập cách đọc";
  if (questionType) {
    questionType.textContent = question.question_type === "fill_in"
      ? isEnglishFillIn
        ? "Điền nghĩa"
        : "Điền cách đọc"
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

  const generationNotice = document.getElementById("lessonGenerationNotice");
  if (generationNotice) {
    generationNotice.hidden = lesson.generation?.source !== "mock";
    generationNotice.textContent = lesson.generation?.source === "mock"
      ? `Đề mock theo mẫu ngẫu nhiên từ từ vựng chủ đề ${lesson.generation.topic_name}; chưa gọi AI, không lưu XP hay tiến độ.`
      : "";
  }

  const progressText = document.getElementById("lessonProgressText");
  if (progressText) progressText.textContent = `Câu ${questionIndex + 1}/${lesson.questions.length}`;
  const progressFill = document.getElementById("lessonProgressFill");
  const progressTrack = document.getElementById("lessonProgressTrack");
  const progress = Math.round((questionIndex / lesson.questions.length) * 100);
  if (progressFill) progressFill.style.width = `${progress}%`;
  progressTrack?.setAttribute("aria-valuenow", String(progress));
  const feedback = document.getElementById("lessonFeedback");
  if (feedback) feedback.textContent = "";
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

async function openLesson(lessonId: number, pushHistory: boolean): Promise<void> {
  if ((!isLearnerAuthenticated() && !isDemoMode()) || !workspace) return;
  if (activeRequest) return;
  closeResultDialog();
  if (resultPanel) resultPanel.hidden = true;
  activeRequest = true;
  completed = false;
  lesson = null;
  clearMatchingState();
  demoScore = 0;
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
  if (questionPanel) questionPanel.hidden = true;
  if (resultPanel) resultPanel.hidden = true;
  setNotice("Đang tải câu hỏi...");
  if (checkButton) checkButton.disabled = true;
  if (nextButton) nextButton.hidden = true;
  if (exitButton) exitButton.disabled = true;

  try {
    lesson = await loadLessonContent(lessonId);
    if (lesson.generation) lastTopicId = lesson.generation.topic_id;
    questionIndex = 0;
    renderQuestion();
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
    if (answer.is_correct) demoScore += 1;
    else if (question.question_type === "matching" && matchingState) {
      for (const mistake of matchingState.mistakes) {
        answerReviews.push({
          prompt: `Ghép từ “${mistake.word}” với nghĩa tương ứng.`,
          selected: mistake.selectedMeaning,
          correct: mistake.correctMeaning,
          explanation: null,
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
    const feedback = document.getElementById("lessonFeedback");
    if (feedback) {
      const questionFeedback = question.question_type === "matching"
        ? answer.is_correct
          ? "Ghép chính xác tất cả các cặp."
          : "Có cặp ghép chưa chính xác. Xem lại đáp án ở phần tổng kết."
        : question.question_type === "fill_in" && !answer.is_correct
          ? `Chưa đúng. Đáp án là “${correct}”.`
          : answer.is_correct
            ? "Chính xác."
            : "Chưa đúng. Đáp án đúng đã được đánh dấu.";
      feedback.textContent = `${questionFeedback}${checkedAnswer.explanation ? ` ${checkedAnswer.explanation}` : ""}`;
      feedback.dataset.state = answer.is_correct ? "correct" : "incorrect";
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
  const trigger = document.getElementById("toggleIncorrectAnswers") as HTMLButtonElement | null;
  const label = document.getElementById("incorrectAnswersLabel");
  const accordion = document.getElementById("incorrectAnswers");
  const list = document.getElementById("incorrectAnswerList");
  if (!trigger || !label || !accordion || !list) return;

  const incorrect = answerReviews;
  trigger.hidden = incorrect.length === 0;
  trigger.setAttribute("aria-expanded", "false");
  label.textContent = `Câu làm sai · ${incorrect.length}`;
  accordion.classList.remove("is-open");
  accordion.setAttribute("aria-hidden", "true");
  accordion.setAttribute("inert", "");
  list.replaceChildren();

  for (const [index, answer] of incorrect.entries()) {
    const item = document.createElement("article");
    item.className = "lesson-result__incorrect-item";
    const question = document.createElement("h3");
    question.textContent = `${index + 1}. ${answer.prompt}`;
    const selected = document.createElement("p");
    selected.className = "lesson-result__answer lesson-result__answer--wrong";
    const selectedLabel = document.createElement("strong");
    selectedLabel.textContent = "Bạn chọn";
    selected.append(selectedLabel, document.createTextNode(answer.selected));
    const correct = document.createElement("p");
    correct.className = "lesson-result__answer lesson-result__answer--correct";
    const correctLabel = document.createElement("strong");
    correctLabel.textContent = "Đáp án đúng";
    correct.append(correctLabel, document.createTextNode(answer.correct));
    item.append(question, selected, correct);
    if (answer.explanation) {
      const explanation = document.createElement("p");
      explanation.className = "lesson-result__explanation";
      explanation.textContent = answer.explanation;
      item.append(explanation);
    }
    list.append(item);
  }
}

function animateScore(score: number, count: number): void {
  const scoreValue = document.getElementById("lessonScoreValue");
  const announcement = document.getElementById("lessonScoreAnnouncement");
  const ring = document.getElementById("lessonScoreRing") as SVGCircleElement | null;
  const ringLabel = document.querySelector<HTMLElement>(".lesson-result__score-ring");
  if (!scoreValue || !ring) return;

  const radius = Number(ring.getAttribute("r")) || 56;
  const circumference = 2 * Math.PI * radius;
  ring.style.strokeDasharray = `${circumference}`;
  ring.style.strokeDashoffset = `${circumference}`;
  ringLabel?.setAttribute("aria-label", `Kết quả: ${formatScore(score, count)} câu đúng`);

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const duration = reducedMotion ? 0 : 1000;
  const startedAt = performance.now();
  const draw = (now: number): void => {
    const progress = duration === 0 ? 1 : Math.min(1, (now - startedAt) / duration);
    const eased = 1 - (1 - progress) ** 3;
    const currentScore = Math.round(score * eased);
    scoreValue.textContent = formatScore(currentScore, count);
    ring.style.strokeDashoffset = `${circumference * (1 - (score / count) * eased)}`;
    if (progress < 1) window.requestAnimationFrame(draw);
    else if (announcement) announcement.textContent = `Bạn đạt ${formatScore(score, count)} câu đúng.`;
  };
  window.requestAnimationFrame(draw);
}

function animateXp(amount: number): void {
  const element = document.getElementById("lessonResultXp");
  if (!element) return;
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
  if (lesson?.generation?.source === "mock") {
    element.hidden = true;
    return;
  }
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
  const topicIds = [...document.querySelectorAll<SVGGElement>(".roadmap-node[data-topic-id]")]
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

function renderResult(result: LessonCompletion, lessonId: number): void {
  if (!resultPanel || !lesson) return;
  const { score, question_count: count, passed, xp_awarded: xpAwarded, current_streak: streak } = result;
  const mockGenerated = lesson.generation?.source === "mock";
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

  completed = passed && !mockGenerated;
  lastXpTotal = result.xp_total;
  headline?.setAttribute("data-state", passed ? "passed" : "failed");
  if (eyebrow) eyebrow.textContent = mockGenerated
    ? "Kết quả dữ liệu thử"
    : passed
      ? "Một bước tiến mới"
      : "Thêm một lượt luyện nữa";
  if (titleElement) {
    titleElement.textContent = mockGenerated
      ? "Lượt luyện đã xong"
      : passed
        ? "Quá đã! Bạn làm được rồi"
        : `Chưa đủ ${count}/${count} lần này`;
  }
  if (textElement) {
    textElement.textContent = mockGenerated
      ? `${formatScore(score, count)} câu đúng · Bộ câu hỏi này dùng dữ liệu mock, không cập nhật XP hay tiến độ.`
      : passed
        ? result.already_completed
          ? `${formatScore(score, count)} câu đúng · Kết quả này đã được ghi nhận trước đó.`
          : `${formatScore(score, count)} câu đúng · Bạn vừa tiến thêm một bước trên lộ trình.`
        : `${formatScore(score, count)} câu đúng — vài từ đang chơi trốn tìm thôi. Mình xem lại rồi thử thêm lượt nữa nhé!`;
  }
  if (unlock) {
    unlock.hidden = mockGenerated || !passed;
    const message = unlock.querySelector("span");
    if (message) {
      message.textContent = hasNextTopic()
        ? "Đã mở khóa chủ đề tiếp theo"
        : "Bạn đã hoàn thành bài học 4/4";
    }
  }
  if (rule) {
    rule.hidden = passed || mockGenerated;
    rule.textContent = `Cần đạt ${count}/${count} để mở khóa chủ đề tiếp theo.`;
  }
  if (retryButton) {
    retryButton.hidden = mockGenerated ? false : passed;
    retryButton.textContent = mockGenerated ? "Tạo đề khác" : `Thử lại ${count} câu`;
  }
  if (continueButton) continueButton.hidden = mockGenerated || !passed;
  if (returnButton) returnButton.textContent = "Để sau";
  if (returnButton) returnButton.hidden = passed && !mockGenerated;
  if (streakElement) streakElement.textContent = `${streak} ngày`;

  renderAnswerReviews();
  renderScoreDelta(score, lessonId);
  animateScore(score, count);
  animateXp(xpReceived);

  if (!mockGenerated) {
    localStorage.setItem("slanguage_user_xp", String(result.xp_total));
    localStorage.setItem("slanguage_user_streak", String(streak));
    const headerXp = document.getElementById("headerXPVal");
    if (headerXp) headerXp.textContent = `${result.xp_total.toLocaleString("vi-VN")} XP`;
    const headerStreak = document.getElementById("headerStreakVal");
    if (headerStreak) headerStreak.textContent = String(streak);
  }
  lastXpAwarded = xpReceived;

  resultPanel.hidden = false;
  resultPanel.showModal();
  window.requestAnimationFrame(() => {
    (passed ? continueButton : retryButton)?.focus();
  });

  if (passed && !result.already_completed && !mockGenerated) {
    launchConfetti(resultPanel);
  }
}

async function finishLesson(): Promise<void> {
  if (!lesson || activeRequest) return;
  activeRequest = true;
  if (nextButton) nextButton.disabled = true;
  if (exitButton) exitButton.disabled = true;
  setNotice("");
  try {
    const result = await requestCompletion(lesson, demoScore);
    if (questionPanel) questionPanel.hidden = true;
    renderResult(result, lesson.lesson.id);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Không thể lưu kết quả bài học.";
    setNotice(message, true);
    showToast({ type: "error", message });
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
  if (workspace) workspace.hidden = true;
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
  return positiveInt(list?.dataset.topicId);
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
  if (lesson) void openLesson(lesson.lesson.id, false);
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
document.getElementById("toggleIncorrectAnswers")?.addEventListener("click", (event) => {
  const trigger = event.currentTarget as HTMLButtonElement;
  const expanded = trigger.getAttribute("aria-expanded") !== "true";
  const accordion = document.getElementById("incorrectAnswers");
  trigger.setAttribute("aria-expanded", String(expanded));
  accordion?.classList.toggle("is-open", expanded);
  accordion?.setAttribute("aria-hidden", String(!expanded));
  if (accordion) accordion.inert = !expanded;
});

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
