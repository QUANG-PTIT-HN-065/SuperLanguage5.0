import { isLearnerAuthenticated, readMockData, slanguageApi } from "../shared/api-client";
import { XP_PER_LEVEL, levelFromXp } from "./learner-progress";

interface LessonOption {
  id: string;
  text: string;
}

interface LessonQuestion {
  id: number;
  prompt: string;
  question_type: "multiple_choice" | "fill_in";
  options: LessonOption[];
}

interface LessonContent {
  lesson: {
    id: number;
    title: string;
    description: string | null;
  };
  questions: LessonQuestion[];
}

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
}

/** Khoá đáp án chỉ có trong mock/lesson-questions.json, dùng khi backend chưa chạy. */
interface DemoAnswerKey {
  correct_option_id: string;
  explanation: string | null;
}

const DEMO_XP_PER_LESSON = 20;

const workspace = document.getElementById("lessonWorkspace");
const questionPanel = document.getElementById("lessonQuestion");
const resultPanel = document.getElementById("lessonResult");
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
let activeRequest = false;
let completed = false;
let demoScore = 0;
let lastXpAwarded = 0;
let lastXpTotal = 0;
let lastLessonId = 0;
let lastTopicId = 0;
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

async function loadLessonContent(lessonId: number): Promise<LessonContent> {
  if (isDemoMode()) {
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
    const xpAwarded = passed ? DEMO_XP_PER_LESSON : 0;
    const previousXp = nonNegativeInt(localStorage.getItem("slanguage_user_xp"));
    const xpTotal = (previousXp < 0 ? 0 : previousXp) + xpAwarded;
    return {
      score,
      question_count: questionCount,
      passed,
      xp_awarded: xpAwarded,
      xp_total: xpTotal,
      level: levelFromXp(xpTotal),
      xp_into_level: xpTotal % XP_PER_LEVEL,
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
  if (
    parsedScore < 0 ||
    !count ||
    typeof result.passed !== "boolean" ||
    xpAwarded < 0 ||
    xpTotal < 0 ||
    !level ||
    xpIntoLevel < 0
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
    const questionType: LessonQuestion["question_type"] | null = question.question_type === "fill_in"
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
  if (questionType) {
    questionType.textContent = question.question_type === "fill_in"
      ? "Điền từ còn thiếu"
      : "Chọn một trong bốn từ";
  }

  optionsContainer.replaceChildren();
  if (question.question_type === "fill_in") {
    const input = document.createElement("input");
    input.type = "text";
    input.className = "lesson-answer-input";
    input.dataset.answerInput = "true";
    input.maxLength = 200;
    input.autocomplete = "off";
    input.spellcheck = false;
    input.setAttribute("aria-label", "Nhập từ còn thiếu");
    input.placeholder = "Nhập từ còn thiếu";
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
  if (feedback) feedback.textContent = "";
  if (checkButton) {
    checkButton.hidden = false;
    checkButton.disabled = true;
  }
  if (nextButton) nextButton.hidden = true;
  setNotice("");
  title?.focus();
}

async function openLesson(lessonId: number, pushHistory: boolean): Promise<void> {
  if ((!isLearnerAuthenticated() && !isDemoMode()) || !workspace) return;
  if (activeRequest) return;
  activeRequest = true;
  completed = false;
  lesson = null;
  demoScore = 0;
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

    for (const button of optionsContainer?.querySelectorAll<HTMLButtonElement>("[data-option-id]") || []) {
      button.disabled = true;
      if (button.dataset.optionId === correct) button.classList.add("is-correct");
      if (button.dataset.optionId === selected && !answer.is_correct) {
        button.classList.add("is-incorrect");
      }
    }
    const answerInput = optionsContainer?.querySelector<HTMLInputElement>("[data-answer-input]");
    if (answerInput) answerInput.disabled = true;
    const feedback = document.getElementById("lessonFeedback");
    if (feedback) {
      const questionFeedback = question.question_type === "fill_in" && !answer.is_correct
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
    setNotice(error instanceof Error ? error.message : "Không thể kiểm tra đáp án.", true);
  } finally {
    activeRequest = false;
    if (exitButton) exitButton.disabled = false;
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
    const { score, question_count: count, passed, xp_awarded: xpAwarded, xp_total: xpTotal, level, xp_into_level: xpIntoLevel } = result;
    completed = passed;
    lastXpAwarded = xpAwarded;
    lastXpTotal = xpTotal;
    if (questionPanel) questionPanel.hidden = true;
    if (resultPanel) resultPanel.hidden = false;
    const resultTitle = document.getElementById("lessonResultTitle");
    if (resultTitle) resultTitle.textContent = passed ? "Đã hoàn thành" : "Chưa đạt 4/4";
    const resultText = document.getElementById("lessonResultText");
    if (resultText) {
      resultText.textContent = passed
        ? `${score}/${count} câu đúng · +${xpAwarded} XP · Cấp ${level} (${xpIntoLevel}/100 XP)`
        : `${score}/${count} câu đúng. Cần đạt 4/4 để mở khóa chủ đề tiếp theo. Hãy thử lại.`;
    }
    const retryButton = document.getElementById("retryLesson");
    if (retryButton) retryButton.hidden = passed;
    const returnButton = document.getElementById("returnToTopics");
    if (returnButton) returnButton.textContent = passed ? "Quay lại chủ đề" : "Để sau";
    localStorage.setItem("slanguage_user_xp", String(xpTotal));
    const headerXp = document.getElementById("headerXPVal");
    if (headerXp) headerXp.textContent = `${xpTotal.toLocaleString("vi-VN")} XP`;
  } catch (error) {
    setNotice(error instanceof Error ? error.message : "Không thể lưu kết quả bài học.", true);
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
  if (workspace) workspace.hidden = true;
  const pathId = positiveInt(new URLSearchParams(window.location.search).get("path_id"));
  document.getElementById("pathCatalogSection")?.toggleAttribute("hidden", pathId > 0);
  document.getElementById("pathDetailSection")?.toggleAttribute("hidden", pathId === 0);
  document.querySelector(".learning-actions-grid")?.toggleAttribute("hidden", false);
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
