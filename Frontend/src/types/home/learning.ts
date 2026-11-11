import { isLearnerAuthenticated, slanguageApi } from "../shared/api-client";
import { initializeLearnerHeader, renderLearnerHeader } from "../shared/learner-header";

interface LearnerProfileData {
  display_name?: string;
  username?: string;
  target_language?: string;
  current_level?: string;
  target_level?: string;
}

interface LearnerStatsData {
  xp_total?: number;
  current_streak?: number;
  lessons_completed?: number;
}

interface LearningTopic {
  id: number;
  name: string;
  description: string | null;
  word_count: number;
}

interface LearningPath {
  id: number;
  language_code: string;
  name: string;
  description: string | null;
  topic_count?: number;
  topics?: LearningTopic[];
}

const languageNames: Record<string, string> = {
  en: "Tiếng Anh",
  ja: "Tiếng Nhật",
  vi: "Tiếng Việt",
};

let targetLanguageCode = "";
let learningPaths: LearningPath[] = [];

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
    topics: Array.isArray(row.topics)
      ? row.topics.map((topicValue) => {
          const topic = asRecord(topicValue);
          return {
            id: toCount(topic.id),
            name: toText(topic.name, "Chủ đề"),
            description: typeof topic.description === "string" ? topic.description : null,
            word_count: toCount(topic.word_count),
          };
        })
      : undefined,
  };
}

function setAuthState(isAuthenticated: boolean): void {
  document.body.classList.toggle("user-authenticated", isAuthenticated);
  document.body.classList.toggle("user-guest", !isAuthenticated);
  document.getElementById("learningGuest")?.toggleAttribute("hidden", isAuthenticated);
  document.getElementById("learningOverview")?.toggleAttribute("hidden", !isAuthenticated);
}

function showNotice(message: string, isError = false): void {
  const notice = document.getElementById("learningNotice");
  if (!notice) return;
  notice.hidden = !message;
  notice.textContent = message;
  notice.dataset.state = isError ? "error" : "";
}

function renderLearningPaths(): void {
  const grid = document.getElementById("learningPathGrid");
  const search = document.getElementById("pathSearch") as HTMLInputElement | null;
  const empty = document.getElementById("pathEmpty");
  if (!grid) return;
  const term = search?.value.trim().toLocaleLowerCase("vi-VN") || "";
  const filtered = learningPaths.filter((path) =>
    `${path.name} ${path.description || ""}`.toLocaleLowerCase("vi-VN").includes(term),
  );
  grid.replaceChildren();

  for (const path of filtered) {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "path-card";
    card.dataset.pathId = String(path.id);

    const title = document.createElement("h3");
    title.textContent = path.name;
    const description = document.createElement("p");
    description.textContent = path.description || "Lộ trình học được sắp xếp theo từng chủ đề.";
    const footer = document.createElement("span");
    footer.className = "path-card-footer";
    footer.innerHTML = '<i class="fa-solid fa-book-open" aria-hidden="true"></i>';
    footer.append(` ${path.topic_count || 0} chủ đề`);
    const author = document.createElement("span");
    author.className = "path-author";
    author.innerHTML = '<i class="fa-regular fa-circle-user" aria-hidden="true"></i> Slanguage';
    const bottom = document.createElement("div");
    bottom.className = "path-card-bottom";
    bottom.append(footer, author);
    card.append(title, description, bottom);
    grid.append(card);
  }

  if (empty) empty.hidden = filtered.length > 0;
  const count = document.getElementById("pathCount");
  if (count) count.textContent = `${filtered.length} lộ trình`;
}

function renderPathDetail(path: LearningPath): void {
  const catalog = document.getElementById("pathCatalogSection");
  const detail = document.getElementById("pathDetailSection");
  const list = document.getElementById("pathTopicList");
  if (!catalog || !detail || !list) return;
  catalog.hidden = true;
  detail.hidden = false;

  const title = document.getElementById("pathDetailTitle");
  const description = document.getElementById("pathDetailDescription");
  const language = document.getElementById("pathDetailLanguage");
  const topicCount = document.getElementById("pathDetailTopicCount");
  if (title) title.textContent = path.name;
  if (description) description.textContent = path.description || "Học theo từng chủ đề trong lộ trình này.";
  if (language) language.textContent = languageNames[path.language_code] || path.language_code.toUpperCase();
  if (topicCount) topicCount.textContent = `${path.topics?.length || 0} chủ đề`;

  list.replaceChildren();
  for (const [index, topic] of (path.topics || []).entries()) {
    const card = document.createElement("article");
    card.className = "path-topic-card";

    const number = document.createElement("span");
    number.className = "path-topic-number";
    number.textContent = String(index + 1);
    const content = document.createElement("div");
    content.className = "path-topic-content";
    const heading = document.createElement("div");
    heading.className = "path-topic-heading";
    const name = document.createElement("h3");
    name.textContent = topic.name;
    const count = document.createElement("span");
    count.className = "path-topic-word-count";
    count.textContent = `${topic.word_count} từ`;
    heading.append(name, count);
    const topicDescription = document.createElement("p");
    topicDescription.textContent = topic.description || "Học và ghi nhớ từ vựng trong chủ đề.";
    content.append(heading, topicDescription);

    const action = document.createElement("a");
    action.className = "study-primary-button";
    action.href = `../vocabulary/index.html?topic_id=${topic.id}&action=study`;
    action.textContent = "Học chủ đề";
    card.append(number, content, action);
    list.append(card);
  }
}

async function showPath(pathId: number, pushHistory: boolean): Promise<void> {
  showNotice("Đang mở lộ trình...");
  const response = await slanguageApi(`/api/v1/vocabulary/learning-paths/${pathId}`);
  const path = parsePath(response.data);
  renderPathDetail(path);
  showNotice("");
  if (pushHistory) {
    const url = new URL(window.location.href);
    url.searchParams.set("path_id", String(pathId));
    window.history.pushState({ pathId }, "", url);
  }
  document.getElementById("pathDetailSection")?.scrollIntoView({ block: "start" });
}

async function loadLearningProfile(): Promise<void> {
  if (!isLearnerAuthenticated()) {
    setAuthState(false);
    return;
  }

  setAuthState(true);
  showNotice("Đang tải hồ sơ học tập...");
  try {
    const response = await slanguageApi("/api/v1/me", { method: "GET" });
    const payload = asRecord(response.data);
    renderLearnerHeader(response.data);
    const profile = asRecord(payload.profile) as LearnerProfileData;
    const stats = asRecord(payload.stats) as LearnerStatsData;
    const name = toText(profile.display_name, toText(profile.username, "học viên"));
    targetLanguageCode = toText(
      profile.target_language,
      localStorage.getItem("slanguage_active_language") || "",
    );
    const languageName = languageNames[targetLanguageCode] || targetLanguageCode.toUpperCase() || "Chưa chọn";
    const xp = toCount(stats.xp_total);
    const streak = toCount(stats.current_streak);
    const lessons = toCount(stats.lessons_completed);

    const learnerName = document.getElementById("learnerName");
    const targetLanguage = document.getElementById("targetLanguage");
    const currentLevel = document.getElementById("currentLevel");
    const targetLevel = document.getElementById("targetLevel");
    const streakValue = document.getElementById("learningStreak");
    const completedLessons = document.getElementById("completedLessons");
    const xpValue = document.getElementById("studyXp");
    if (learnerName) learnerName.textContent = name;
    if (targetLanguage) targetLanguage.textContent = languageName;
    if (currentLevel) currentLevel.textContent = toText(profile.current_level, "Chưa thiết lập");
    if (targetLevel) targetLevel.textContent = toText(profile.target_level, "Chưa thiết lập");
    if (streakValue) streakValue.textContent = `${streak} ngày`;
    if (completedLessons) completedLessons.textContent = lessons.toLocaleString("vi-VN");
    if (xpValue) xpValue.textContent = `${xp.toLocaleString("vi-VN")} XP`;

    localStorage.setItem("slanguage_active_language", targetLanguageCode);
    localStorage.setItem("slanguage_user_xp", String(xp));
    localStorage.setItem("slanguage_user_streak", String(streak));
    localStorage.setItem("slanguage_user_name", name);
    const pathLanguageChip = document.getElementById("pathLanguageChip");
    if (pathLanguageChip) pathLanguageChip.textContent = languageName;
    const pathLevelChip = document.getElementById("pathLevelChip");
    if (pathLevelChip) {
      const currentLevel = toText(profile.current_level, "");
      const targetLevel = toText(profile.target_level, "");
      pathLevelChip.textContent = currentLevel && targetLevel
        ? `${currentLevel} → ${targetLevel}`
        : targetLevel || currentLevel;
      pathLevelChip.hidden = !pathLevelChip.textContent;
    }

    const pathResponse = await slanguageApi("/api/v1/vocabulary/learning-paths");
    learningPaths = Array.isArray(pathResponse.data)
      ? pathResponse.data.map(parsePath)
      : [];
    renderLearningPaths();
    showNotice("");

    const requestedPathId = Number(new URLSearchParams(window.location.search).get("path_id"));
    if (Number.isInteger(requestedPathId) && requestedPathId > 0) {
      await showPath(requestedPathId, false);
    }
  } catch (error) {
    showNotice(error instanceof Error ? error.message : "Không thể tải lộ trình học.", true);
  }
}

document.getElementById("pathSearch")?.addEventListener("input", renderLearningPaths);
document.getElementById("searchLearningPaths")?.addEventListener("click", () => {
  renderLearningPaths();
  document.getElementById("pathSearch")?.focus();
});
document.getElementById("pathSearch")?.addEventListener("keydown", (event) => {
  if (event.key === "Enter") renderLearningPaths();
});
document.getElementById("learningPathGrid")?.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const card = target.closest<HTMLButtonElement>("[data-path-id]");
  const pathId = Number(card?.dataset.pathId);
  if (Number.isInteger(pathId) && pathId > 0) {
    void showPath(pathId, true).catch((error: unknown) =>
      showNotice(error instanceof Error ? error.message : "Không thể mở lộ trình.", true),
    );
  }
});
document.getElementById("backToPaths")?.addEventListener("click", () => {
  document.getElementById("pathDetailSection")!.hidden = true;
  document.getElementById("pathCatalogSection")!.hidden = false;
  const url = new URL(window.location.href);
  url.searchParams.delete("path_id");
  window.history.pushState({}, "", url);
});
window.addEventListener("popstate", () => {
  const pathId = Number(new URLSearchParams(window.location.search).get("path_id"));
  if (pathId > 0) {
    void showPath(pathId, false).catch((error: unknown) =>
      showNotice(error instanceof Error ? error.message : "Không thể mở lộ trình.", true),
    );
  } else {
    document.getElementById("pathDetailSection")!.hidden = true;
    document.getElementById("pathCatalogSection")!.hidden = false;
  }
});

void initializeLearnerHeader({ loadProfile: false });
void loadLearningProfile();
