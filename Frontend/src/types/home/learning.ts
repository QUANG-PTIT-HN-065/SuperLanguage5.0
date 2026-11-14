import {
  isLearnerAuthenticated,
  readMockData,
  slanguageApi,
  slanguageApiOrMock,
} from "../shared/api-client";
import { initializeLearnerHeader, renderLearnerHeader } from "../shared/learner-header";
import { mountHeader } from "../ui/header.js";
import {
  addLocalDailyXp,
  buildStreakWeek,
  cacheOverview,
  dailyGoalProgress,
  formatNumber,
  languageLabel,
  levelProgress,
  parseLearnerOverview,
  pathProgressPercent,
  readLocalDailyXp,
  resolveTodayXp,
  ringOffset,
  shiftActivityToToday,
  toDateKey,
  type DailyActivityRow,
  type LearnerOverview,
  type StreakDay,
} from "./learner-progress";
import { MOCK_PRACTICE_TOPIC_IDS } from "./lesson-practice-generator";
import { type LearningPathTopic } from "./learning-path-route";
import { renderRoadmap, setTopicLessonState } from "../../ts/pages/roadmap";

type LearningTopic = LearningPathTopic;

interface TopicLesson {
  id: number;
  title: string;
  description: string | null;
  is_completed: boolean;
  is_locked: boolean;
  score: number | null;
  question_count: number | null;
  can_retake: boolean;
}

interface LearningPath {
  id: number;
  language_code: string;
  name: string;
  description: string | null;
  topic_count: number;
  progress_percent: number | null;
  topics?: LearningTopic[];
}

const SEARCH_DEBOUNCE_MS = 250;
const RING_RADIUS = 52;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;
const PROGRESS_CACHE_KEY = "slanguage_path_progress";
const LAST_PATH_KEY = "slanguage_last_path";
const DEMO_TOPICS_KEY = "slanguage_demo_topics";
const PATH_AUTHOR = "Slanguage";
const NETWORK_ERROR_MESSAGE =
  "Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại; bạn vẫn xem được dữ liệu mẫu.";
const SVG_NS = "http://www.w3.org/2000/svg";

const ARROW_PATHS = ["M5 12h13", "m12 5 7 7-7 7"];
const CHECK_PATHS = ["m5 12.6 4.6 4.6L19 7.4"];
const BOOK_PATHS = [
  "M12 6.6C10.4 5.1 8.3 4.5 4 4.7v12.8c4.3-.2 6.4.4 8 1.9 1.6-1.5 3.7-2.1 8-1.9V4.7c-4.3-.2-6.4.4-8 1.9Z",
  "M12 6.6v12.8",
];
const AUTHOR_PATHS = [
  "M12 3.4a8.6 8.6 0 1 0 0 17.2 8.6 8.6 0 0 0 0-17.2Z",
  "M12 11.4a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z",
  "M6.8 18.1a5.6 5.6 0 0 1 10.4 0",
];

const FLAG_FILES: Record<string, string> = {
  en: new URL("../../../assets/flags/flag-en.png", import.meta.url).href,
  ja: new URL("../../../assets/flags/flag-jp.png", import.meta.url).href,
  vi: new URL("../../../assets/flags/flag-vn.png", import.meta.url).href,
};

let overview: LearnerOverview | null = null;
let learningPaths: LearningPath[] = [];
let progressCache: Record<string, number> = {};
let demoMode = false;
let demoTopics = new Set<number>();
let searchTimer = 0;
let today = new Date();

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function toText(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function toCount(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0;
}

function clampPercent(value: unknown): number {
  return Math.min(100, toCount(value));
}

function setText(id: string, value: string): void {
  const element = document.getElementById(id);
  if (element) element.textContent = value;
}

/** Hai khung hình để trình duyệt chốt trạng thái đầu, transition mới chạy. */
function afterPaint(apply: () => void): void {
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(apply);
  });
}

function svgIcon(paths: string[], size: number): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2.1");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  for (const data of paths) {
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", data);
    svg.append(path);
  }
  return svg;
}

function parseTopic(value: unknown): LearningTopic {
  const topic = asRecord(value);
  return {
    id: toCount(topic.id),
    name: toText(topic.name, "Chủ đề"),
    description: typeof topic.description === "string" ? topic.description : null,
    icon_url: typeof topic.icon_url === "string" ? topic.icon_url : null,
    word_count: toCount(topic.word_count),
    mastered_word_count: toCount(topic.mastered_word_count),
    progress_percent: clampPercent(topic.progress_percent),
    is_locked: topic.is_locked === true,
    is_completed: topic.is_completed === true,
    quiz_score: topic.quiz_score === null ? null : toCount(topic.quiz_score),
    quiz_question_count: topic.quiz_question_count === null ? null : toCount(topic.quiz_question_count),
  };
}

function parsePath(value: unknown): LearningPath {
  const row = asRecord(value);
  const id = toCount(row.id);
  const name = toText(row.name, "");
  if (!id || !name) throw new Error("Máy chủ trả về lộ trình không hợp lệ.");
  return {
    id,
    name,
    language_code: toText(row.language_code, ""),
    description: typeof row.description === "string" ? row.description : null,
    topic_count: toCount(row.topic_count),
    progress_percent:
      row.progress_percent === undefined || row.progress_percent === null
        ? null
        : clampPercent(row.progress_percent),
    topics: Array.isArray(row.topics) ? row.topics.map(parseTopic) : undefined,
  };
}

function readProgressCache(): Record<string, number> {
  try {
    const raw = localStorage.getItem(PROGRESS_CACHE_KEY);
    if (!raw) return {};
    const cache: Record<string, number> = {};
    for (const [key, value] of Object.entries(asRecord(JSON.parse(raw)))) {
      cache[key] = clampPercent(value);
    }
    return cache;
  } catch {
    return {};
  }
}

function writeProgressCache(pathId: number, percent: number): void {
  progressCache[String(pathId)] = clampPercent(percent);
  localStorage.setItem(PROGRESS_CACHE_KEY, JSON.stringify(progressCache));
}

function pathPercent(path: LearningPath): number {
  if (path.progress_percent !== null) return path.progress_percent;
  if (path.topics?.length) return pathProgressPercent(path.topics);
  return progressCache[String(path.id)] ?? 0;
}

function markDemo(): void {
  demoMode = true;
  document.body.dataset.demo = "true";
}

function readDemoTopics(): Set<number> {
  try {
    const raw = localStorage.getItem(DEMO_TOPICS_KEY);
    if (!raw) return new Set();
    const list: unknown = JSON.parse(raw);
    if (!Array.isArray(list)) return new Set();
    return new Set(list.map(toCount).filter((id) => id > 0));
  } catch {
    return new Set();
  }
}

function rememberDemoTopic(topicId: number): void {
  if (!demoMode || topicId <= 0 || demoTopics.has(topicId)) return;
  demoTopics.add(topicId);
  localStorage.setItem(DEMO_TOPICS_KEY, JSON.stringify([...demoTopics]));
}

/** Chế độ xem thử không có máy chủ ghi tiến độ, nên giữ lại chủ đề đã qua ngay tại máy. */
function applyDemoTopicProgress(path: LearningPath): LearningPath {
  const topics = path.topics;
  if (!demoMode || !demoTopics.size || !topics?.length) return path;
  let previousCompleted = true;
  const next = topics.map((topic) => {
    const completed = topic.is_completed || demoTopics.has(topic.id);
    const locked = completed ? false : topic.is_locked && !previousCompleted;
    previousCompleted = completed;
    return completed
      ? {
          ...topic,
          is_completed: true,
          is_locked: false,
          progress_percent: 100,
          mastered_word_count: topic.word_count,
          quiz_score: topic.quiz_score ?? 4,
          quiz_question_count: topic.quiz_question_count ?? 4,
        }
      : { ...topic, is_locked: locked };
  });
  return { ...path, topics: next, progress_percent: pathProgressPercent(next) };
}

/** Đặt mốc XP/chuỗi ngày cho bài học xem thử cộng dồn, không ghi cờ "đã đồng bộ". */
function seedDemoProgress(data: LearnerOverview): void {
  localStorage.setItem("slanguage_user_xp", String(data.stats.xpTotal));
  localStorage.setItem("slanguage_streak", String(data.stats.currentStreak));
  if (data.profile.dailyGoalXp > 0) {
    localStorage.setItem("slanguage_daily_goal", String(data.profile.dailyGoalXp));
  }
}

function friendlyError(error: unknown, fallback: string): string {
  if (error instanceof TypeError) return NETWORK_ERROR_MESSAGE;
  return error instanceof Error && error.message ? error.message : fallback;
}

async function demoPayload(file: string, select?: (data: unknown) => unknown): Promise<unknown> {
  markDemo();
  return readMockData<unknown>(file, select);
}

function setAuthState(authenticated: boolean): void {
  document.body.classList.toggle("user-authenticated", authenticated);
  document.body.classList.toggle("user-guest", !authenticated);
  document.getElementById("learningGuest")?.toggleAttribute("hidden", authenticated);
  document.getElementById("learningOverview")?.toggleAttribute("hidden", false);
}

function showNotice(message: string, isError = false): void {
  const notice = document.getElementById("learningNotice");
  if (!notice) return;
  notice.hidden = !message;
  notice.textContent = message;
  notice.dataset.state = isError ? "error" : "";
}

function setGridBusy(busy: boolean): void {
  document.getElementById("learningPathGrid")?.setAttribute("aria-busy", String(busy));
}

function showPathError(message: string): void {
  setText("pathErrorText", message);
  document.getElementById("pathError")?.toggleAttribute("hidden", false);
  document.getElementById("pathEmpty")?.toggleAttribute("hidden", true);
  document.getElementById("learningPathGrid")?.replaceChildren();
  setText("pathCount", "0 lộ trình");
}

function hidePathError(): void {
  document.getElementById("pathError")?.toggleAttribute("hidden", true);
}

/** Chèn <mark> quanh mỗi khớp của từ khoá, không dùng innerHTML. */
function appendHighlighted(target: HTMLElement, text: string, term: string): void {
  const needle = term.toLocaleLowerCase("vi-VN");
  if (!needle) {
    target.append(text);
    return;
  }
  const haystack = text.toLocaleLowerCase("vi-VN");
  let cursor = 0;
  let found = haystack.indexOf(needle);
  while (found !== -1) {
    if (found > cursor) target.append(text.slice(cursor, found));
    const mark = document.createElement("mark");
    mark.textContent = text.slice(found, found + needle.length);
    target.append(mark);
    cursor = found + needle.length;
    found = haystack.indexOf(needle, cursor);
  }
  if (cursor < text.length) target.append(text.slice(cursor));
}

function buildPathCard(path: LearningPath, term: string): HTMLButtonElement {
  const percent = pathPercent(path);
  const card = document.createElement("button");
  card.type = "button";
  card.className = "path-card";
  card.dataset.pathId = String(path.id);
  card.dataset.progress = String(percent);
  card.classList.toggle("is-complete", percent >= 100);
  card.setAttribute(
    "aria-label",
    `${path.name}. ${path.topic_count} chủ đề, đã học ${percent}%. Mở bản đồ lộ trình.`,
  );

  const top = document.createElement("span");
  top.className = "path-card__top";
  const title = document.createElement("span");
  title.className = "path-card__title";
  appendHighlighted(title, path.name, term);
  const arrow = document.createElement("span");
  arrow.className = "path-card__arrow";
  arrow.append(svgIcon(ARROW_PATHS, 15));
  top.append(title, arrow);

  const description = document.createElement("span");
  description.className = "path-card__desc";
  appendHighlighted(
    description,
    path.description || "Lộ trình học được sắp xếp theo từng chủ đề.",
    term,
  );

  const progress = document.createElement("span");
  progress.className = "path-card__progress";
  const head = document.createElement("span");
  head.className = "path-card__progress-head";
  const label = document.createElement("span");
  label.className = "path-card__progress-label";
  label.textContent = percent >= 100 ? "Đã hoàn thành" : "Tiến độ";
  const value = document.createElement("span");
  value.className = "path-card__progress-value";
  value.textContent = `${percent}%`;
  head.append(label, value);
  const track = document.createElement("span");
  track.className = "path-card__track";
  track.setAttribute("role", "progressbar");
  track.setAttribute("aria-label", `Tiến độ lộ trình ${path.name}`);
  track.setAttribute("aria-valuemin", "0");
  track.setAttribute("aria-valuemax", "100");
  track.setAttribute("aria-valuenow", String(percent));
  const fill = document.createElement("span");
  fill.className = "path-card__fill";
  track.append(fill);
  progress.append(head, track);

  const bottom = document.createElement("span");
  bottom.className = "path-card-bottom";
  const footer = document.createElement("span");
  footer.className = "path-card-footer";
  footer.append(svgIcon(BOOK_PATHS, 14), `${path.topic_count} chủ đề`);
  const author = document.createElement("span");
  author.className = "path-author";
  author.append(svgIcon(AUTHOR_PATHS, 14), PATH_AUTHOR);
  bottom.append(footer, author);

  card.append(top, description, progress, bottom);
  return card;
}

function renderEmptyState(visible: number, term: string): void {
  const empty = document.getElementById("pathEmpty");
  const action = document.getElementById("pathEmptyAction") as HTMLButtonElement | null;
  if (!empty) return;
  const show = visible === 0 && document.getElementById("pathError")?.hidden !== false;
  empty.hidden = !show;
  if (!show || !action) return;

  if (term) {
    setText("pathEmptyTitle", `Không tìm thấy lộ trình cho “${term}”`);
    setText(
      "pathEmptyText",
      "Thử một từ khoá ngắn hơn, hoặc xoá từ khoá để xem toàn bộ lộ trình của ngôn ngữ đang học.",
    );
    action.textContent = "Xoá từ khoá";
    action.dataset.action = "clear";
  } else {
    setText("pathEmptyTitle", "Chưa có lộ trình cho ngôn ngữ này");
    setText(
      "pathEmptyText",
      "Admin chưa đăng lộ trình nào. Trong lúc chờ, bạn vẫn có thể tra từ vựng hoặc luyện hội thoại với AI.",
    );
    action.textContent = "Tra cứu từ vựng";
    action.dataset.action = "vocabulary";
  }
}

function renderLearningPaths(): void {
  const grid = document.getElementById("learningPathGrid");
  if (!grid) return;
  const search = document.getElementById("pathSearch") as HTMLInputElement | null;
  const term = search?.value.trim() ?? "";
  const needle = term.toLocaleLowerCase("vi-VN");
  const filtered = needle
    ? learningPaths.filter((path) =>
        `${path.name} ${path.description ?? ""}`.toLocaleLowerCase("vi-VN").includes(needle),
      )
    : learningPaths;

  const fragment = document.createDocumentFragment();
  for (const path of filtered) fragment.append(buildPathCard(path, term));
  grid.replaceChildren(fragment);
  setGridBusy(false);

  afterPaint(() => {
    for (const card of grid.querySelectorAll<HTMLElement>(".path-card")) {
      const fill = card.querySelector<HTMLElement>(".path-card__fill");
      const percent = Number(card.dataset.progress) || 0;
      if (fill) fill.style.transform = `scaleX(${percent / 100})`;
    }
  });

  renderEmptyState(filtered.length, term);
  setText("pathCount", `${filtered.length}/${learningPaths.length} lộ trình`);
  document.getElementById("clearPathSearch")?.toggleAttribute("hidden", !term);
}

function renderHero(data: LearnerOverview): void {
  const languageCode =
    data.profile.targetLanguage || localStorage.getItem("slanguage_active_language") || "ja";
  setText("learnerName", data.profile.displayName);
  setText("targetLanguage", languageLabel(languageCode));
  const flag = document.getElementById("heroLanguageFlag") as HTMLImageElement | null;
  if (flag) flag.src = FLAG_FILES[languageCode] ?? FLAG_FILES.ja;

  const levelLabel = [data.profile.currentLevel, data.profile.targetLevel]
    .filter(Boolean)
    .join(" → ");
  const levelChip = document.getElementById("heroLevelChip");
  if (levelChip) {
    levelChip.textContent = levelLabel;
    levelChip.hidden = !levelLabel;
  }
  setText(
    "heroHint",
    `Cấp ${data.level} · ${formatNumber(data.stats.xpTotal)} XP · chuỗi ${data.stats.currentStreak} ngày`,
  );
  setText("pathLanguageChip", languageLabel(languageCode));
  const pathLevelChip = document.getElementById("pathLevelChip");
  if (pathLevelChip) {
    pathLevelChip.textContent = levelLabel;
    pathLevelChip.hidden = !levelLabel;
  }

  const cta = document.getElementById("heroContinue") as HTMLAnchorElement | null;
  if (!cta) return;
  const lastPath = toCount(localStorage.getItem(LAST_PATH_KEY));
  const resumable = learningPaths.find((path) => path.id === lastPath);
  const ctaLabel = cta.querySelector("span");
  if (resumable) {
    cta.href = `?path_id=${resumable.id}`;
    cta.dataset.pathId = String(resumable.id);
    if (ctaLabel) ctaLabel.textContent = "Tiếp tục học";
  } else {
    cta.href = "#pathCatalogSection";
    delete cta.dataset.pathId;
    if (ctaLabel) ctaLabel.textContent = "Chọn lộ trình";
  }
}

function renderLevelWidget(data: LearnerOverview): void {
  const progress = levelProgress(data.stats.xpTotal);
  setText("statLevel", String(progress.level));
  setText("xpIntoLevel", String(progress.xpIntoLevel));
  setText("xpToNext", String(progress.xpToNext));
  setText("nextLevel", String(progress.nextLevel));
  const track = document.getElementById("xpTrack");
  track?.setAttribute("aria-valuenow", String(progress.percent));
  track?.setAttribute(
    "aria-valuetext",
    `${progress.xpIntoLevel} trên ${progress.xpPerLevel} XP của cấp ${progress.level}`,
  );
  const fill = document.getElementById("xpFill");
  if (!fill) return;
  fill.style.transform = "scaleX(0)";
  afterPaint(() => {
    fill.style.transform = `scaleX(${progress.percent / 100})`;
  });
}

function buildStreakDay(day: StreakDay): HTMLLIElement {
  const item = document.createElement("li");
  item.className = "streak-day";
  item.classList.toggle("is-studied", day.studied);
  item.classList.toggle("is-missed", !day.studied && !day.isFuture);
  item.classList.toggle("is-future", day.isFuture);
  item.classList.toggle("is-today", day.isToday);

  const label = document.createElement("span");
  label.className = "streak-day__label";
  label.textContent = day.label;
  label.setAttribute("aria-hidden", "true");

  const dot = document.createElement("span");
  dot.className = "streak-day__dot";
  dot.setAttribute("aria-hidden", "true");
  if (day.studied) dot.append(svgIcon(CHECK_PATHS, 14));

  const status = day.isFuture ? "chưa tới" : day.studied ? "đã học" : "chưa học";
  const spoken = document.createElement("span");
  spoken.className = "sr-only";
  spoken.textContent = `${day.label} ngày ${day.dayNumber}${day.isToday ? " (hôm nay)" : ""}: ${status}.`;

  item.append(label, dot, spoken);
  return item;
}

function renderStreakWidget(data: LearnerOverview): void {
  setText("statStreak", String(data.stats.currentStreak));
  const week = buildStreakWeek(data.dailyActivity, data.stats, today);
  const list = document.getElementById("streakWeek");
  if (list) {
    const fragment = document.createDocumentFragment();
    for (const day of week) fragment.append(buildStreakDay(day));
    list.replaceChildren(fragment);
  }
  const studied = week.filter((day) => day.studied).length;
  setText(
    "streakHint",
    data.stats.studiedToday
      ? `Đã học hôm nay · ${studied}/7 ngày trong tuần.`
      : `Học hôm nay để giữ chuỗi ${data.stats.currentStreak} ngày.`,
  );
}

function renderGoalWidget(data: LearnerOverview): void {
  const xpToday = resolveTodayXp(data.dailyActivity, today, readLocalDailyXp(today));
  const goalXp =
    data.profile.dailyGoalXp || toCount(localStorage.getItem("slanguage_daily_goal")) || 20;
  const goal = dailyGoalProgress(xpToday, goalXp);

  const ring = document.getElementById("goalRingValue");
  if (ring instanceof SVGCircleElement) {
    ring.style.strokeDashoffset = RING_CIRCUMFERENCE.toFixed(3);
    afterPaint(() => {
      ring.style.strokeDashoffset = ringOffset(goal.percent, RING_RADIUS).toFixed(3);
    });
  }
  document.querySelector(".goal-ring")?.classList.toggle("is-met", goal.met);
  setText("goalPercent", `${goal.percent}%`);
  setText("goalXpToday", String(goal.xpToday));
  setText("goalXpTarget", String(goal.goalXp));
  setText("goalHint", goal.met ? "đã đạt mục tiêu" : `còn ${goal.remaining} XP`);
  setText(
    "goalRingTitle",
    `Mục tiêu hôm nay: ${goal.xpToday} trên ${goal.goalXp} XP, đạt ${goal.percent}%.`,
  );
}

function renderOverview(data: LearnerOverview): void {
  renderHero(data);
  renderLevelWidget(data);
  renderStreakWidget(data);
  renderGoalWidget(data);
}

function replayFade(element: HTMLElement | null): void {
  if (!element) return;
  for (const animation of element.getAnimations()) {
    animation.cancel();
    animation.play();
  }
}

function renderPathDetail(path: LearningPath): void {
  const catalog = document.getElementById("pathCatalogSection");
  const detail = document.getElementById("pathDetailSection");
  const list = document.getElementById("pathTopicList");
  if (!catalog || !detail || !list) return;
  catalog.hidden = true;
  detail.hidden = false;
  document.getElementById("lessonWorkspace")?.toggleAttribute("hidden", true);
  document.querySelector(".learning-actions-grid")?.toggleAttribute("hidden", false);

  setText("pathDetailTitle", path.name);
  setText(
    "pathDetailDescription",
    path.description || "Học lần lượt từng chủ đề trong lộ trình này.",
  );
  setText("pathDetailLanguage", languageLabel(path.language_code));
  setText("pathDetailTopicCount", `${path.topics?.length ?? 0} chủ đề`);
  renderRoadmap(list, path.name, path.topics ?? []);
  replayFade(detail);
}

function parseTopicLesson(value: unknown): TopicLesson {
  const lesson = asRecord(value);
  const id = toCount(lesson.id);
  const title = toText(lesson.title, "");
  if (!id || !title) throw new Error("Máy chủ trả về bài học không hợp lệ.");
  return {
    id,
    title,
    description: typeof lesson.description === "string" ? lesson.description : null,
    is_completed: lesson.is_completed === true,
    is_locked: lesson.is_locked === true,
    score: lesson.score === null ? null : toCount(lesson.score),
    question_count: lesson.question_count === null ? null : toCount(lesson.question_count),
    can_retake: lesson.can_retake === true,
  };
}

async function loadTopicLessons(topic: LearningTopic, pathId: number): Promise<void> {
  if (topic.is_locked) {
    setTopicLessonState(topic.id, { status: "loading" });
    return;
  }
  const select = (data: unknown): unknown => {
    const map = asRecord(data);
    return map[String(topic.id)] ?? map.default;
  };
  try {
    const payload = demoMode
      ? await demoPayload("topic-lessons.json", select)
      : await slanguageApiOrMock<unknown>(
          `/api/v1/lessons/topics/${topic.id}/lessons?path_id=${pathId}`,
          "topic-lessons.json",
          { onFallback: markDemo },
          select,
        );
    if (!Array.isArray(payload)) throw new Error("Máy chủ trả về danh sách bài học không hợp lệ.");
    const lessons = payload.map(parseTopicLesson).map((lesson) =>
      demoMode && demoTopics.has(topic.id)
        ? { ...lesson, is_completed: true, is_locked: false, can_retake: true }
        : lesson,
    );
    if (!lessons.length) {
      setTopicLessonState(topic.id, {
        status: "empty",
        message: "Chưa có bài trắc nghiệm cho chủ đề này.",
      });
      return;
    }

    const nextLesson =
      lessons.find((lesson) => !lesson.is_completed && !lesson.is_locked) ??
      [...lessons].reverse().find((lesson) => lesson.can_retake && !lesson.is_locked);
    if (!nextLesson) {
      setTopicLessonState(topic.id, { status: "ready", slot: null });
      return;
    }

    const mixedPracticeDemo = demoMode && MOCK_PRACTICE_TOPIC_IDS.has(topic.id);
    const label = mixedPracticeDemo
      ? "Làm đề thử"
      : nextLesson.is_completed
        ? "Học lại"
        : "Bắt đầu";
    setTopicLessonState(topic.id, {
      status: "ready",
      slot: {
        lessonId: nextLesson.id,
        label,
        ariaLabel: mixedPracticeDemo
          ? `Làm đề thử ngẫu nhiên từ 10 đến 15 câu cho chủ đề ${topic.name}`
          : `${label} bài ${nextLesson.title} của chủ đề ${topic.name}`,
      },
    });
  } catch (error) {
    setTopicLessonState(topic.id, {
      status: "error",
      message: error instanceof Error ? error.message : "Không thể tải bài học.",
    });
  }
}

async function showPath(pathId: number, pushHistory: boolean): Promise<void> {
  showNotice("Đang mở lộ trình...");
  setGridBusy(true);
  const select = (data: unknown): unknown => asRecord(data)[String(pathId)];
  try {
    const payload = demoMode
      ? await demoPayload("learning-path-details.json", select)
      : await slanguageApiOrMock<unknown>(
          `/api/v1/vocabulary/learning-paths/${pathId}`,
          "learning-path-details.json",
          { onFallback: markDemo },
          select,
        );
    const path = applyDemoTopicProgress(parsePath(payload));
    const percent = path.topics?.length ? pathProgressPercent(path.topics) : pathPercent(path);
    writeProgressCache(path.id, percent);
    localStorage.setItem(LAST_PATH_KEY, String(path.id));

    renderPathDetail(path);
    await Promise.all((path.topics ?? []).map((topic) => loadTopicLessons(topic, path.id)));
    showNotice("");
    if (pushHistory) {
      const url = new URL(window.location.href);
      url.searchParams.set("path_id", String(pathId));
      window.history.pushState({ pathId }, "", url);
    }
    document.getElementById("pathDetailSection")?.scrollIntoView({ block: "start" });
  } finally {
    setGridBusy(false);
  }
}

function focusFirstCard(): void {
  const card = document.querySelector<HTMLButtonElement>(".path-card");
  if (card) card.focus();
  else document.getElementById("pathSearch")?.focus();
}

function showCatalog(pushHistory: boolean): void {
  const catalog = document.getElementById("pathCatalogSection");
  document.getElementById("pathDetailSection")?.toggleAttribute("hidden", true);
  document.getElementById("lessonWorkspace")?.toggleAttribute("hidden", true);
  document.querySelector(".learning-actions-grid")?.toggleAttribute("hidden", false);
  if (catalog) {
    catalog.hidden = false;
    replayFade(catalog);
  }
  if (pushHistory) {
    const url = new URL(window.location.href);
    url.searchParams.delete("path_id");
    url.searchParams.delete("lesson_id");
    window.history.pushState({}, "", url);
  }
  focusFirstCard();
}

async function loadPathList(): Promise<unknown> {
  return demoMode
    ? demoPayload("learning-paths.json")
    : slanguageApiOrMock<unknown>("/api/v1/vocabulary/learning-paths", "learning-paths.json", {
        onFallback: markDemo,
      });
}

async function loadLearningProfile(): Promise<void> {
  today = new Date();
  progressCache = readProgressCache();
  demoTopics = readDemoTopics();
  const authenticated = isLearnerAuthenticated();
  setAuthState(authenticated);
  hidePathError();
  setGridBusy(true);
  showNotice("");

  try {
    const payload = authenticated
      ? await slanguageApiOrMock<unknown>("/api/v1/me", "me.json", { onFallback: markDemo })
      : await demoPayload("me.json");
    renderLearnerHeader(payload);
    const parsed = parseLearnerOverview(payload);
    overview = demoMode
      ? { ...parsed, dailyActivity: shiftActivityToToday(parsed.dailyActivity, today) }
      : parsed;
    if (demoMode) seedDemoProgress(overview);
    else cacheOverview(overview);
    document.getElementById("learningDemoNote")?.toggleAttribute("hidden", !demoMode);
    renderOverview(overview);

    const listPayload = await loadPathList();
    learningPaths = Array.isArray(listPayload) ? listPayload.map(parsePath) : [];
    renderLearningPaths();

    const requestedPathId = toCount(new URLSearchParams(window.location.search).get("path_id"));
    if (requestedPathId > 0) await showPath(requestedPathId, false);
  } catch (error) {
    const message = friendlyError(error, "Không thể tải lộ trình học.");
    showPathError(message);
    showNotice(message, true);
  } finally {
    setGridBusy(false);
  }
}

/** Cộng XP vừa nhận vào dòng daily_activity của hôm nay (chế độ xem thử). */
function withTodayXp(
  rows: DailyActivityRow[],
  dateKey: string,
  awarded: number,
  goalXp: number,
): DailyActivityRow[] {
  const existing = rows.find((row) => row.activityDate === dateKey);
  const xpEarned = (existing?.xpEarned ?? 0) + awarded;
  const next: DailyActivityRow = {
    activityDate: dateKey,
    xpEarned,
    lessonsCompleted: (existing?.lessonsCompleted ?? 0) + 1,
    goalMet: xpEarned >= Math.max(1, goalXp),
  };
  return [...rows.filter((row) => row.activityDate !== dateKey), next].sort((a, b) =>
    a.activityDate.localeCompare(b.activityDate),
  );
}

async function refreshOverview(): Promise<void> {
  if (demoMode) return;
  try {
    const payload = (await slanguageApi("/api/v1/me", { method: "GET" })).data;
    renderLearnerHeader(payload);
    overview = parseLearnerOverview(payload);
    cacheOverview(overview);
    renderOverview(overview);
  } catch {
    showNotice("Đã lưu bài học, nhưng chưa đồng bộ lại được số liệu mới.", true);
  }
}

async function handleLessonCompleted(detail: Record<string, unknown>): Promise<void> {
  const awarded = toCount(detail.xp_awarded);
  if (awarded > 0) addLocalDailyXp(awarded, today);
  rememberDemoTopic(toCount(detail.topic_id));

  if (demoMode && overview && awarded > 0) {
    const xpTotal = toCount(detail.xp_total) || overview.stats.xpTotal + awarded;
    overview = {
      ...overview,
      stats: {
        ...overview.stats,
        xpTotal,
        lessonsCompleted: overview.stats.lessonsCompleted + 1,
        studiedToday: true,
        lastActivityDate: toDateKey(today),
        currentStreak: overview.stats.studiedToday
          ? overview.stats.currentStreak
          : overview.stats.currentStreak + 1,
      },
      dailyActivity: withTodayXp(
        overview.dailyActivity,
        toDateKey(today),
        awarded,
        overview.profile.dailyGoalXp,
      ),
    };
    renderOverview(overview);
  } else {
    await refreshOverview();
  }

  const pathId = toCount(new URLSearchParams(window.location.search).get("path_id"));
  if (pathId > 0) {
    await showPath(pathId, false).catch((error: unknown) => {
      showNotice(friendlyError(error, "Không thể cập nhật tiến độ."), true);
    });
  }
}

function clearSearch(): void {
  const search = document.getElementById("pathSearch") as HTMLInputElement | null;
  if (!search) return;
  search.value = "";
  window.clearTimeout(searchTimer);
  renderLearningPaths();
  search.focus();
}

function reportPathError(error: unknown): void {
  showNotice(friendlyError(error, "Không thể mở lộ trình."), true);
}

const searchInput = document.getElementById("pathSearch") as HTMLInputElement | null;
searchInput?.addEventListener("input", () => {
  document.getElementById("clearPathSearch")?.toggleAttribute("hidden", !searchInput.value);
  window.clearTimeout(searchTimer);
  searchTimer = window.setTimeout(renderLearningPaths, SEARCH_DEBOUNCE_MS);
});
searchInput?.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    window.clearTimeout(searchTimer);
    renderLearningPaths();
  } else if (event.key === "Escape" && searchInput.value) {
    clearSearch();
  }
});
document.getElementById("searchLearningPaths")?.addEventListener("click", () => {
  window.clearTimeout(searchTimer);
  renderLearningPaths();
  searchInput?.focus();
});
document.getElementById("clearPathSearch")?.addEventListener("click", clearSearch);
document.getElementById("pathEmptyAction")?.addEventListener("click", (event) => {
  const button = event.currentTarget;
  if (!(button instanceof HTMLButtonElement)) return;
  if (button.dataset.action === "vocabulary") window.location.assign("../vocabulary/index.html");
  else clearSearch();
});
document.getElementById("retryLearningPaths")?.addEventListener("click", () => {
  void loadLearningProfile();
});
document.getElementById("learningPathGrid")?.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const card = target.closest<HTMLButtonElement>("[data-path-id]");
  const pathId = toCount(card?.dataset.pathId);
  if (pathId > 0) void showPath(pathId, true).catch(reportPathError);
});
document.getElementById("heroContinue")?.addEventListener("click", (event) => {
  const cta = event.currentTarget;
  if (!(cta instanceof HTMLAnchorElement)) return;
  const pathId = toCount(cta.dataset.pathId);
  if (pathId > 0) {
    event.preventDefault();
    void showPath(pathId, true).catch(reportPathError);
  }
});
document.getElementById("backToPaths")?.addEventListener("click", () => {
  showCatalog(true);
});
window.addEventListener("popstate", () => {
  const pathId = toCount(new URLSearchParams(window.location.search).get("path_id"));
  if (pathId > 0) {
    void showPath(pathId, false).catch(reportPathError);
    return;
  }
  showCatalog(false);
});
window.addEventListener("lesson:completed", (event) => {
  const detail = event instanceof CustomEvent ? asRecord(event.detail) : {};
  void handleLessonCompleted(detail);
});

async function initializeLearningPage(): Promise<void> {
  try {
    await mountHeader({ active: "learning", externalState: true });
    await initializeLearnerHeader({ loadProfile: false });
    await loadLearningProfile();
  } catch (error) {
    showNotice(friendlyError(error, "Không thể tải trang học tập."), true);
  } finally {
    document.body.dataset.pageState = "ready";
    window.dispatchEvent(new Event("learning:ready"));
  }
}

void initializeLearningPage();
