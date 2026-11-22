import Chart from "chart.js/auto";
import { adminApi, ApiError, ForbiddenError, logoutAdmin, requireAdminSession } from "./auth";
import { clearSkeleton, showSkeleton } from "../shared/skeleton";

export interface TopicItem {
  id: number;
  language_code: string;
  name: string;
  description: string | null;
  icon_url: string | null;
  sort_order: number;
  word_count?: number;
}

interface TopicReadingEntry {
  title: string;
  passage: string;
  translation: string;
}

interface TopicReadingsPayload {
  topic_id: number;
  topic_name: string;
  language_code: string;
  source: "column" | "legacy" | "empty";
  readings: TopicReadingEntry[];
}

async function loadDocuments(): Promise<void> {
  try {
    documentsList = await adminApi<RagDocument[]>("/api/v1/admin/rag/documents");
    renderDocumentsTable();
  } catch (error) {
    clearSkeleton("documentsTableBody");
    showApiError(error);
  }
}

function renderDocumentsTable(): void {
  const tbody = getElement("documentsTableBody");
  const badge = getElement("totalDocumentsBadge");
  const languageFilter = getFieldValue("filterDocumentLanguage") || "all";
  const filteredDocuments = documentsList.filter((item) => (
    languageFilter === "all"
      || (languageFilter === "all-language" && item.language_code === "all")
      || item.language_code === languageFilter
  ));
  const totalPages = Math.max(1, Math.ceil(filteredDocuments.length / DOCUMENT_PAGE_SIZE));
  documentPage = Math.min(documentPage, totalPages);
  const start = (documentPage - 1) * DOCUMENT_PAGE_SIZE;
  const visibleDocuments = filteredDocuments.slice(start, start + DOCUMENT_PAGE_SIZE);
  if (badge) badge.textContent = `${filteredDocuments.length}/${documentsList.length} tài liệu`;
  if (!tbody) return;
  clearSkeleton(tbody);
  if (!filteredDocuments.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="py-10 text-center text-slate-400">Chưa có tài liệu nào được lập chỉ mục.</td></tr>';
  } else {
    tbody.replaceChildren(...visibleDocuments.map((item) => {
      const row = window.document.createElement("tr");
      row.className = "hover:bg-slate-50 border-b border-slate-100";

      const title = window.document.createElement("td");
      title.className = "py-3 px-4 max-w-xs";
      const titleText = window.document.createElement("p");
      titleText.className = "font-bold text-slate-900 truncate";
      titleText.textContent = item.title;
      const keyText = window.document.createElement("p");
      keyText.className = "text-[11px] text-slate-400 font-mono truncate";
      keyText.textContent = item.document_key;
      title.append(titleText, keyText);

      const language = window.document.createElement("td");
      language.className = "py-3 px-4 whitespace-nowrap";
      language.textContent = item.language_code;

      const chunks = window.document.createElement("td");
      chunks.className = "py-3 px-4 text-center font-semibold";
      chunks.textContent = String(item.chunks_count);

      const content = window.document.createElement("td");
      content.className = "py-3 px-4 max-w-sm";
      content.textContent = item.content;
      content.title = item.content;
      content.classList.add("truncate", "text-slate-600");

      const actions = window.document.createElement("td");
      actions.className = "py-3 px-4 text-right";
      const remove = window.document.createElement("button");
      remove.type = "button";
      remove.className = "text-rose-600 hover:text-rose-800 text-xs font-semibold";
      remove.textContent = "Xóa";
      remove.addEventListener("click", () => void removeDocument(item));
      actions.append(remove);

      row.append(title, language, chunks, content, actions);
      return row;
    }));
  }

  const info = getElement("documentPaginationInfo");
  if (info) {
    info.textContent = filteredDocuments.length
      ? `Hiển thị ${start + 1}-${Math.min(start + DOCUMENT_PAGE_SIZE, filteredDocuments.length)} / ${filteredDocuments.length} tài liệu`
      : "Không có tài liệu phù hợp";
  }
  const pageNumber = getElement("documentPageNumber");
  if (pageNumber) pageNumber.textContent = `${documentPage}/${totalPages}`;
  const previous = getElement<HTMLButtonElement>("prevDocumentPage");
  const next = getElement<HTMLButtonElement>("nextDocumentPage");
  if (previous) previous.disabled = documentPage <= 1;
  if (next) next.disabled = documentPage >= totalPages;
}

async function removeDocument(document: RagDocument): Promise<void> {
  if (!window.confirm(`Xóa tài liệu "${document.title}" khỏi Vector DB?`)) return;
  try {
    await adminApi(`/api/v1/admin/rag/documents/${encodeURIComponent(document.document_key)}`, { method: "DELETE" });
    showToast("Đã xóa tài liệu khỏi Vector DB.", "success");
    await loadDocuments();
  } catch (error) {
    showApiError(error);
  }
}

export interface LanguageOption {
  code: string;
  name: string;
}

export interface UserItem {
  id: string;
  email: string;
  username: string;
  display_name: string | null;
  role: string;
  status: string;
  plan_id: string;
  target_language: string;
  current_level: string;
  created_at: string;
  xp_total?: number;
  current_streak?: number;
  words_learned?: number;
  last_sign_in_at?: string | null;
  last_activity_at?: string | null;
  inactive_days?: number | null;
  inactive_over_24_months?: boolean;
}

interface OverviewStats {
  total_students: number;
  total_words: number;
  total_topics: number;
  total_xp: number;
  max_streak: number;
  language_distribution: Record<string, number>;
}

interface RagDocument {
  document_key: string;
  title: string;
  language_code: string;
  content: string;
  chunks_count: number;
  created_at: string | null;
}

const languagesMap = new Map<string, string>();
let topicsList: TopicItem[] = [];
let usersList: UserItem[] = [];
let documentsList: RagDocument[] = [];
let documentPage = 1;
const DOCUMENT_PAGE_SIZE = 5;
let userPage = 1;
const USER_PAGE_SIZE = 10;
let userTotal = 0;
let activeTab = "dashboard";
let currentTopicFilterLang = "all";
let readingsTopicId: number | null = null;
let chartInstance: Chart | null = null;

function getElement<T extends HTMLElement = HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
}

function getFieldValue(id: string): string {
  const el = getElement<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(id);
  return el ? el.value.trim() : "";
}

export async function initDashboard(): Promise<void> {
  const statusEl = getElement("authStatus");
  try {
    const profile = await requireAdminSession();
    if (!profile) return;

    getElement("dashboardApp")?.removeAttribute("hidden");
    statusEl?.setAttribute("hidden", "");

    const nameEl = getElement("adminDisplayName");
    if (nameEl) nameEl.textContent = profile.displayName || profile.email;
    const emailEl = getElement("adminEmail");
    if (emailEl) emailEl.textContent = profile.email;

    setupNavigation();
    initEngagementChart();
    setupEventListeners();

    showSkeleton("topicsTableBody", "table-rows", { tone: "cool", cols: 5, count: 5 });
    showSkeleton("usersTableBody", "table-rows", { tone: "cool", cols: 5, count: 5, avatar: true });
    showSkeleton("documentsTableBody", "table-rows", { tone: "cool", cols: 5, count: 5 });
    for (const id of ["statStudentsCount", "statTopicsCount", "statVocabCount", "statMaxStreak", "statTotalXp"]) {
      showSkeleton(id, "value", { tone: "cool" });
    }

    // Nạp dữ liệu thật từ Backend Supabase
    await loadLanguages();
    await Promise.all([
      loadDashboardStats(),
      loadTopics(),
      loadUsers(),
      loadDocuments(),
    ]);
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return;
    }
    if (statusEl) {
      statusEl.textContent = error instanceof ApiError || error instanceof Error
        ? error.message
        : "Không thể kết nối máy chủ quản trị. Vui lòng thử lại.";
    }
  }
}

/**
 * 1. NẠP DỮ LIỆU THỐNG KÊ THẬT TỪ CSDL
 */
async function loadDashboardStats(): Promise<void> {
  for (const id of ["statStudentsCount", "statTopicsCount", "statVocabCount", "statMaxStreak", "statTotalXp"]) {
    clearSkeleton(id);
  }
  try {
    const res = await adminApi<{ status: string; data: OverviewStats }>("/api/v1/admin/stats");
    const stats = res.data;

    // Cập nhật thẻ chỉ số KPI
    const statStudents = getElement("statStudentsCount");
    if (statStudents) statStudents.textContent = Number(stats.total_students || 0).toLocaleString();

    const statTopics = getElement("statTopicsCount");
    if (statTopics) statTopics.textContent = String(stats.total_topics || 0);

    const statVocab = getElement("statVocabCount");
    if (statVocab) statVocab.textContent = Number(stats.total_words || 0).toLocaleString();

    const statStreak = getElement("statMaxStreak");
    if (statStreak) statStreak.textContent = `${stats.max_streak || 0} ngày 🔥`;

    const statXp = getElement("statTotalXp");
    if (statXp) statXp.textContent = `${Number(stats.total_xp || 0).toLocaleString()} XP`;

    // Cập nhật thanh phân bố ngôn ngữ
    renderLanguageDistribution(stats.language_distribution, stats.total_students);
  } catch (err) {
    console.warn("Không thể tải thống kê thời gian thực:", err);
  }
}

function renderLanguageDistribution(dist: Record<string, number>, total: number): void {
  const container = getElement("langDistributionContainer");
  if (!container) return;

  const entries = Object.entries(dist || {});
  if (entries.length === 0) {
    container.innerHTML = `<p class="text-xs text-slate-500 py-3">Chưa có dữ liệu phân bổ học viên.</p>`;
    return;
  }

  container.innerHTML = entries.map(([code, count]) => {
    const langName = languagesMap.get(code) || String(code ?? "").toUpperCase();
    const percent = total > 0 ? Math.round((count / total) * 100) : 0;
    return `
      <div>
        <div class="flex justify-between text-xs font-semibold mb-1">
          <span class="text-slate-800">${langName}</span>
          <span class="text-blue-600 font-bold">${count.toLocaleString()} học viên (${percent}%)</span>
        </div>
        <div class="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
          <div class="bg-blue-600 h-2 rounded-full transition-all duration-500" style="width: ${percent}%"></div>
        </div>
      </div>
    `;
  }).join("");
}

/**
 * 2. NẠP VÀ THAO TÁC CHỦ ĐỀ THẬT (CRUD)
 */
async function fetchTopicsByLanguage(code: string): Promise<TopicItem[]> {
  const res = await adminApi<{ items: TopicItem[] }>(
    `/api/v1/admin/topics?language_code=${encodeURIComponent(code)}`,
  );
  // API đã lọc theo language_code nên item có thể không trả lại trường này -> gán từ tham số
  return (res.items || []).map((t) => ({ ...t, language_code: t.language_code ?? code }));
}

async function loadTopics(langCode: string = "all"): Promise<void> {
  try {
    // Backend bắt buộc có query.language_code, nên với "Tất cả ngôn ngữ"
    // ta gọi từng ngôn ngữ song song rồi gộp kết quả lại.
    if (langCode && langCode !== "all") {
      topicsList = await fetchTopicsByLanguage(langCode);
    } else {
      const codes = Array.from(languagesMap.keys());
      const results = await Promise.allSettled(codes.map(fetchTopicsByLanguage));
      topicsList = results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));

      const failed = results.find((r): r is PromiseRejectedResult => r.status === "rejected");
      if (failed && topicsList.length === 0) throw failed.reason;
    }
    renderTopicsTable();
  } catch (err) {
    clearSkeleton("topicsTableBody");
    showApiError(err);
  }
}

function renderTopicsTable(): void {
  const tableBody = getElement("topicsTableBody");
  if (!tableBody) return;
  clearSkeleton(tableBody);

  const search = getFieldValue("searchTopicInput").toLocaleLowerCase();
  const filtered = topicsList.filter((item) => {
    const matchesSearch = item.name.toLocaleLowerCase().includes(search) ||
      (item.description || "").toLocaleLowerCase().includes(search);
    const matchesLang = currentTopicFilterLang === "all" || item.language_code === currentTopicFilterLang;
    return matchesSearch && matchesLang;
  });

  if (filtered.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="5" class="py-12 text-center text-slate-400">
          <span class="material-symbols-outlined text-4xl mb-1 text-slate-300 block">category</span>
          Chưa có chủ đề nào phù hợp. Bạn có thể thêm chủ đề mới bên cạnh.
        </td>
      </tr>
    `;
    return;
  }

  tableBody.replaceChildren(...filtered.map((topic) => {
    const tr = document.createElement("tr");
    tr.className = "hover:bg-slate-50 transition-colors border-b border-slate-200 text-sm";

    // Name + Icon
    const tdName = document.createElement("td");
    tdName.className = "py-3.5 px-4";
    const nameWrap = document.createElement("div");
    nameWrap.className = "flex items-center gap-3";
    const iconBox = document.createElement("div");
    iconBox.className = "w-9 h-9 rounded-lg bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center shrink-0";
    iconBox.innerHTML = `<span class="material-symbols-outlined text-lg">${topic.icon_url || "category"}</span>`;
    const textWrap = document.createElement("div");
    textWrap.innerHTML = `
      <p class="font-bold text-slate-900">${topic.name}</p>
      <p class="text-xs text-slate-500 line-clamp-1">${topic.description || "Chưa có mô tả"}</p>
    `;
    nameWrap.append(iconBox, textWrap);
    tdName.appendChild(nameWrap);

    // Language
    const tdLang = document.createElement("td");
    tdLang.className = "py-3.5 px-4 whitespace-nowrap";
    const langName = languagesMap.get(topic.language_code) || String(topic.language_code ?? "").toUpperCase();
    tdLang.innerHTML = `<span class="px-2.5 py-1 rounded-md bg-slate-100 border border-slate-200 text-slate-700 text-xs font-semibold">${langName}</span>`;

    // Word Count
    const tdCount = document.createElement("td");
    tdCount.className = "py-3.5 px-4 whitespace-nowrap font-semibold text-slate-800 text-xs";
    tdCount.textContent = `${topic.word_count || 0} từ`;

    // Sort order
    const tdOrder = document.createElement("td");
    tdOrder.className = "py-3.5 px-4 whitespace-nowrap text-xs text-slate-500 font-mono";
    tdOrder.textContent = String(topic.sort_order);

    // Actions
    const tdActions = document.createElement("td");
    tdActions.className = "py-3.5 px-4 text-right whitespace-nowrap";
    const actionWrap = document.createElement("div");
    actionWrap.className = "flex items-center justify-end gap-1.5";

    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "p-1.5 text-slate-600 hover:text-blue-600 hover:bg-blue-50 border border-transparent hover:border-blue-200 rounded-lg transition-colors";
    editBtn.title = "Sửa chủ đề";
    editBtn.innerHTML = '<span class="material-symbols-outlined text-lg">edit</span>';
    editBtn.addEventListener("click", () => editTopic(topic));

    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "p-1.5 text-slate-600 hover:text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-200 rounded-lg transition-colors";
    delBtn.title = "Xóa chủ đề";
    delBtn.innerHTML = '<span class="material-symbols-outlined text-lg">delete</span>';
    delBtn.addEventListener("click", () => void deleteTopic(topic.id));

    actionWrap.append(editBtn, delBtn);
    tdActions.appendChild(actionWrap);

    tr.append(tdName, tdLang, tdCount, tdOrder, tdActions);
    return tr;
  }));

  const badge = getElement("totalTopicsBadge");
  if (badge) badge.textContent = `${filtered.length} chủ đề`;
}

function editTopic(topic: TopicItem): void {
  const setVal = (id: string, val: string) => {
    const el = getElement<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(id);
    if (el) el.value = val;
  };

  setVal("inputTopicName", topic.name);
  setVal("inputTopicLanguage", topic.language_code);
  setVal("inputTopicDescription", topic.description || "");
  setVal("inputTopicIcon", topic.icon_url || "category");
  setVal("inputTopicOrder", String(topic.sort_order));

  const editIdEl = getElement<HTMLInputElement>("editTopicId");
  if (editIdEl) editIdEl.value = String(topic.id);

  const titleEl = getElement("topicFormTitle");
  if (titleEl) titleEl.textContent = "Chỉnh Sửa Chủ Đề";
  const btnText = getElement("btnSubmitTopicText");
  if (btnText) btnText.textContent = "Cập Nhật Chủ Đề";
  getElement("btnCancelTopicEdit")?.classList.remove("hidden");

  getElement("topicFormContainer")?.scrollIntoView({ behavior: "smooth", block: "start" });
  document.getElementById("inputTopicName")?.focus();
}

async function deleteTopic(topicId: number): Promise<void> {
  if (!confirm("Bạn có chắc chắn muốn xóa chủ đề này khỏi CSDL? Các từ vựng thuộc chủ đề này sẽ được gỡ liên kết.")) return;

  try {
    await adminApi(`/api/v1/admin/topics/${topicId}`, { method: "DELETE" });
    showToast("Đã xóa chủ đề thành công khỏi CSDL!", "success");
    await Promise.all([loadTopics(currentTopicFilterLang), loadDashboardStats()]);
  } catch (err) {
    showApiError(err);
  }
}

function resetTopicForm(): void {
  const form = getElement<HTMLFormElement>("topicForm");
  form?.reset();

  const editIdEl = getElement<HTMLInputElement>("editTopicId");
  if (editIdEl) editIdEl.value = "-1";

  const titleEl = getElement("topicFormTitle");
  if (titleEl) titleEl.textContent = "Thêm Chủ Đề Mới";
  const btnText = getElement("btnSubmitTopicText");
  if (btnText) btnText.textContent = "Lưu Chủ Đề";
  getElement("btnCancelTopicEdit")?.classList.add("hidden");
}

/**
 * TAB QUẢN LÝ BÀI ĐỌC THEO 5 TẦNG HẦM NGỤC
 */
async function initReadingsTab(): Promise<void> {
  const select = getElement<HTMLSelectElement>("readingsTopicSelect");
  if (!select) return;
  const badge = getElement("readingsSourceBadge");
  if (badge) badge.textContent = "Đang tải chủ đề...";

  if (!languagesMap.size) await loadLanguages();
  let topics: TopicItem[] = [];
  try {
    const codes = Array.from(languagesMap.keys());
    const results = await Promise.allSettled(codes.map(fetchTopicsByLanguage));
    topics = results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
  } catch (err) {
    showApiError(err);
  }

  select.replaceChildren();
  if (!topics.length) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "Chưa có chủ đề nào trong CSDL";
    select.append(opt);
    readingsTopicId = null;
    if (badge) badge.textContent = "Không có chủ đề";
    const note = getElement("readingsSourceNote");
    if (note) note.textContent = "Hãy tạo chủ đề ở tab Quản Lý Chủ Đề trước khi soạn bài đọc.";
    renderReadingStages(null);
    return;
  }

  topics.forEach((topic) => {
    const opt = document.createElement("option");
    opt.value = String(topic.id);
    opt.textContent = `${topic.name} (${topic.language_code})`;
    select.append(opt);
  });
  const keep = readingsTopicId !== null && topics.some((t) => t.id === readingsTopicId);
  const target = keep ? (readingsTopicId as number) : topics[0].id;
  select.value = String(target);
  await loadTopicReadings(target);
}

function renderReadingStages(payload: TopicReadingsPayload | null): void {
  const wrap = getElement("readingStagesWrap");
  if (!wrap) return;
  wrap.replaceChildren();
  const fieldClass =
    "w-full px-3 bg-white border border-slate-300 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900";
  for (let s = 1; s <= 5; s++) {
    const entry = payload?.readings[s - 1] ?? { title: "", passage: "", translation: "" };
    const card = document.createElement("div");
    card.className = "bg-white rounded-2xl border border-slate-200 shadow-xs p-5 space-y-3";
    card.dataset.stage = String(s);
    card.innerHTML = `
      <div class="flex items-center justify-between gap-2 pb-3 border-b border-slate-100">
        <div class="flex items-center gap-2.5">
          <span class="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-100 flex items-center justify-center font-bold text-sm shrink-0">${s}</span>
          <div>
            <h4 class="text-sm font-bold text-slate-900">Tầng ${s}${s === 5 ? " · BOSS" : ""}</h4>
            <p class="text-[11px] text-slate-500">Bài đọc hiển thị ở hub tầng ${s} trong lộ trình</p>
          </div>
        </div>
        <span id="readingStageBadge-${s}" class="text-[11px] font-semibold px-2 py-0.5 rounded-full border"></span>
      </div>
      <div>
        <label class="block text-xs font-semibold text-slate-700 mb-1" for="readingTitle-${s}">Tiêu đề bài đọc</label>
        <input id="readingTitle-${s}" type="text" maxlength="150" class="${fieldClass} h-10" placeholder="VD: Bài đọc tầng ${s} của chủ đề" />
      </div>
      <div>
        <div class="flex items-center justify-between mb-1">
          <label class="text-xs font-semibold text-slate-700" for="readingPassage-${s}">Bài đọc (ngôn ngữ đích)</label>
          <span class="text-[11px] text-slate-400"><span id="readingPassageCount-${s}">0</span>/700</span>
        </div>
        <textarea id="readingPassage-${s}" rows="5" maxlength="700" class="${fieldClass} py-2 resize-y" placeholder="Đoạn văn học viên sẽ đọc ở tầng ${s}..."></textarea>
      </div>
      <div>
        <div class="flex items-center justify-between mb-1">
          <label class="text-xs font-semibold text-slate-700" for="readingTranslation-${s}">Bản dịch</label>
          <span class="text-[11px] text-slate-400"><span id="readingTranslationCount-${s}">0</span>/1000</span>
        </div>
        <textarea id="readingTranslation-${s}" rows="4" maxlength="1000" class="${fieldClass} py-2 resize-y" placeholder="Bản dịch của bài đọc tầng ${s}..."></textarea>
      </div>
    `;
    wrap.append(card);
    const titleEl = getElement<HTMLInputElement>(`readingTitle-${s}`);
    const passageEl = getElement<HTMLTextAreaElement>(`readingPassage-${s}`);
    const translationEl = getElement<HTMLTextAreaElement>(`readingTranslation-${s}`);
    if (titleEl) titleEl.value = entry.title;
    if (passageEl) passageEl.value = entry.passage;
    if (translationEl) translationEl.value = entry.translation;
    updateReadingStageUI(s);
  }
}

function updateReadingStageUI(stage: number): void {
  const title = getElement<HTMLInputElement>(`readingTitle-${stage}`)?.value.trim() || "";
  const passage = getElement<HTMLTextAreaElement>(`readingPassage-${stage}`)?.value || "";
  const translation = getElement<HTMLTextAreaElement>(`readingTranslation-${stage}`)?.value || "";
  const passageCount = getElement(`readingPassageCount-${stage}`);
  const translationCount = getElement(`readingTranslationCount-${stage}`);
  if (passageCount) passageCount.textContent = String(passage.length);
  if (translationCount) translationCount.textContent = String(translation.length);
  const badge = getElement(`readingStageBadge-${stage}`);
  if (!badge) return;
  const complete = Boolean(title && passage.trim() && translation.trim());
  badge.textContent = complete ? "Đủ nội dung" : "Chưa đủ";
  badge.className = complete
    ? "text-[11px] font-semibold px-2 py-0.5 rounded-full border bg-emerald-50 text-emerald-700 border-emerald-200"
    : "text-[11px] font-semibold px-2 py-0.5 rounded-full border bg-amber-50 text-amber-700 border-amber-200";
}

async function loadTopicReadings(topicId: number): Promise<void> {
  readingsTopicId = topicId;
  const badge = getElement("readingsSourceBadge");
  if (badge) badge.textContent = "Đang tải...";
  try {
    const res = await adminApi<{ status: string; data: TopicReadingsPayload }>(
      `/api/v1/admin/topics/${topicId}/readings`,
    );
    if (readingsTopicId !== topicId) return;
    const payload = res.data;
    renderReadingStages(payload);
    if (badge) {
      if (payload.source === "column") {
        badge.textContent = "Đã lưu trong CSDL";
        badge.className = "text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200";
      } else if (payload.source === "legacy") {
        badge.textContent = "Kế thừa bài đọc cũ";
        badge.className = "text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200";
      } else {
        badge.textContent = "Chưa có bài đọc";
        badge.className = "text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 border border-slate-200";
      }
    }
    const note = getElement("readingsSourceNote");
    if (note) {
      note.textContent =
        payload.source === "column"
          ? `Chủ đề "${payload.topic_name}" đã có đủ 5 bài đọc trong CSDL. Học viên đọc bài tương ứng khi mở hub từng tầng.`
          : payload.source === "legacy"
            ? `Chủ đề "${payload.topic_name}" mới có bài đọc cũ (từ mô tả bài quiz đầu tiên), đang hiển thị ở Tầng 1. Các tầng 2–5 còn trống — hãy soạn đủ 5 bài rồi lưu.`
            : `Chủ đề "${payload.topic_name}" chưa có bài đọc nào. Hãy soạn đủ 5 bài (mỗi tầng một bài) rồi bấm "Lưu 5 Bài Đọc".`;
    }
  } catch (error) {
    if (badge) badge.textContent = "Lỗi tải bài đọc";
    showApiError(error);
  }
}

function collectReadings(): TopicReadingEntry[] | null {
  const entries: TopicReadingEntry[] = [];
  for (let s = 1; s <= 5; s++) {
    const title = (getElement<HTMLInputElement>(`readingTitle-${s}`)?.value || "").trim();
    const passage = (getElement<HTMLTextAreaElement>(`readingPassage-${s}`)?.value || "").trim();
    const translation = (getElement<HTMLTextAreaElement>(`readingTranslation-${s}`)?.value || "").trim();
    if (!title || !passage || !translation) {
      showToast(`Tầng ${s} còn thiếu nội dung: cần đủ tiêu đề, bài đọc và bản dịch.`, "error");
      return null;
    }
    if (title.length > 150 || passage.length > 700 || translation.length > 1000) {
      showToast(`Tầng ${s} vượt giới hạn: tiêu đề 150, bài đọc 700, bản dịch 1000 ký tự.`, "error");
      return null;
    }
    entries.push({ title, passage, translation });
  }
  return entries;
}

async function saveReadings(): Promise<void> {
  if (readingsTopicId === null) return;
  const entries = collectReadings();
  if (!entries) return;
  const button = getElement<HTMLButtonElement>("btnSubmitReadings");
  const state = getElement("readingsSaveState");
  if (button) button.disabled = true;
  if (state) state.textContent = "Đang lưu...";
  try {
    await adminApi(`/api/v1/admin/topics/${readingsTopicId}/readings`, {
      method: "PUT",
      body: { readings: entries },
    });
    showToast("Đã lưu 5 bài đọc! Học viên sẽ thấy bài tương ứng ở từng tầng.", "success");
    if (state) state.textContent = "";
    await loadTopicReadings(readingsTopicId);
  } catch (error) {
    if (state) state.textContent = "";
    showApiError(error);
  } finally {
    if (button) button.disabled = false;
  }
}

/**
 * 3. NẠP DANH SÁCH NGƯỜI DÙNG THẬT TỪ CSDL
 */
function formatDate(value?: string | null): string {
  if (!value) return "Chưa có dữ liệu";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Chưa có dữ liệu";
  return date.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function openActionConfirm(title: string, description: string, confirmLabel: string, action: () => Promise<void>): void {
  const modal = getElement("actionConfirmModal");
  const titleEl = getElement("actionConfirmTitle");
  const descEl = getElement("actionConfirmDescription");
  const accept = getElement<HTMLButtonElement>("actionConfirmAccept");
  const cancel = getElement<HTMLButtonElement>("actionConfirmCancel");
  if (!modal || !titleEl || !descEl || !accept || !cancel) return;

  titleEl.textContent = title;
  descEl.textContent = description;
  accept.textContent = confirmLabel;
  modal.classList.remove("hidden");
  modal.classList.add("flex");

  const close = () => {
    modal.classList.add("hidden");
    modal.classList.remove("flex");
  };
  cancel.onclick = close;
  accept.onclick = async () => {
    accept.disabled = true;
    cancel.disabled = true;
    try {
      await action();
      close();
    } finally {
      accept.disabled = false;
      cancel.disabled = false;
    }
  };
}

async function confirmUserStatusChange(user: UserItem): Promise<void> {
  const locking = user.status !== "suspended";
  openActionConfirm(
    locking ? "Xác nhận khóa tài khoản" : "Xác nhận mở khóa tài khoản",
    locking
      ? `Bạn sắp khóa tài khoản "${user.display_name || user.username}" (${user.email}). Tài khoản sẽ không thể đăng nhập hoặc sử dụng dịch vụ cho đến khi được mở khóa.`
      : `Bạn sắp mở khóa tài khoản "${user.display_name || user.username}" (${user.email}). Tài khoản sẽ được phép đăng nhập và sử dụng dịch vụ trở lại.`,
    locking ? "Khóa tài khoản" : "Mở khóa tài khoản",
    async () => {
      await adminApi(`/api/v1/admin/users/${encodeURIComponent(user.id)}/status?action=${locking ? "lock" : "unlock"}`, { method: "PATCH" });
      showToast(locking ? "Đã khóa tài khoản." : "Đã mở khóa tài khoản.", "success");
      await loadUsers();
    },
  );
}

async function confirmDeleteUser(user: UserItem): Promise<void> {
  openActionConfirm(
    "Xác nhận xóa tài khoản",
    `Bạn sắp xóa vĩnh viễn tài khoản "${user.display_name || user.username}" (${user.email}). Hành động này sẽ xóa tài khoản khỏi Supabase Auth và toàn bộ dữ liệu liên quan trong cơ sở dữ liệu, không thể hoàn tác.`,
    "Xóa vĩnh viễn",
    async () => {
      await adminApi(`/api/v1/admin/users/${encodeURIComponent(user.id)}`, { method: "DELETE" });
      showToast("Đã xóa tài khoản và dữ liệu liên quan.", "success");
      await Promise.all([loadUsers(), loadDashboardStats()]);
    },
  );
}

async function loadUsers(): Promise<void> {
  try {
    const params = new URLSearchParams({
      limit: String(USER_PAGE_SIZE),
      offset: String((userPage - 1) * USER_PAGE_SIZE),
    });
    const search = getFieldValue("searchUserInput");
    const status = getFieldValue("filterUserStatus") || "all";
    if (search) params.set("q", search);
    if (status !== "all") params.set("status", status);
    const res = await adminApi<{ items: UserItem[]; total: number }>(`/api/v1/admin/users?${params}`);
    usersList = res.items || [];
    userTotal = res.total || 0;
    renderUsersTable();
  } catch (err) {
    clearSkeleton("usersTableBody");
    console.warn("Không thể tải danh sách người dùng:", err);
  }
}

function renderUsersTable(): void {
  const tbody = getElement("usersTableBody");
  if (!tbody) return;
  clearSkeleton(tbody);

  if (usersList.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" class="py-10 text-center text-slate-400">
          Không tìm thấy tài khoản phù hợp.
        </td>
      </tr>
    `;
  } else {
  tbody.replaceChildren(...usersList.map((user) => {
    const tr = document.createElement("tr");
    tr.className = "hover:bg-slate-50 transition-colors border-b border-slate-200 text-sm";

    // User Profile
    const tdUser = document.createElement("td");
    tdUser.className = "py-3 px-4";
    tdUser.innerHTML = `
      <div class="flex items-center gap-2.5">
        <div class="w-8 h-8 rounded-full bg-slate-100 border border-slate-200 text-slate-700 font-bold text-xs flex items-center justify-center">
          ${(user.display_name || user.username || "U").charAt(0).toUpperCase()}
        </div>
        <div>
          <p class="font-bold text-slate-900">${user.display_name || user.username}</p>
          <p class="text-xs text-slate-500">${user.email}</p>
        </div>
      </div>
    `;

    // Target Language & Level
    const tdLang = document.createElement("td");
    tdLang.className = "py-3 px-4 whitespace-nowrap";
    const langLabel = languagesMap.get(user.target_language) || user.target_language;
    tdLang.innerHTML = `
      <span class="text-xs font-semibold px-2 py-1 rounded bg-slate-100 border border-slate-200 text-slate-700">
        ${langLabel} (${user.current_level || "A1"})
      </span>
    `;

    // Plan
    const tdPlan = document.createElement("td");
    tdPlan.className = "py-3 px-4 whitespace-nowrap";
    tdPlan.innerHTML = user.plan_id === "premium"
      ? '<span class="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">Premium</span>'
      : '<span class="px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200">Free</span>';

    // XP & Streak
    const tdStats = document.createElement("td");
    tdStats.className = "py-3 px-4 whitespace-nowrap";
    tdStats.innerHTML = `
      <span class="font-bold text-blue-600">${Number(user.xp_total || 0).toLocaleString()} XP</span>
      <span class="text-xs text-slate-500 ml-1.5">• 🔥 ${user.current_streak || 0} ngày</span>
    `;

    // Status
    const tdStatus = document.createElement("td");
    tdStatus.className = "py-3 px-4 whitespace-nowrap";
    const statusLabel = user.status === "active"
      ? (user.inactive_over_24_months
        ? '<span class="inline-flex items-center text-xs text-amber-700 font-semibold">Không hoạt động ≥24 tháng</span>'
        : '<span class="inline-flex items-center gap-1 text-xs text-emerald-700 font-semibold"><span class="w-2 h-2 rounded-full bg-emerald-500"></span>Hoạt động</span>')
      : '<span class="inline-flex items-center gap-1 text-xs text-rose-700 font-semibold"><span class="w-2 h-2 rounded-full bg-rose-500"></span>Đang bị khóa</span>';
    tdStatus.innerHTML = statusLabel;

    const tdLastActivity = document.createElement("td");
    tdLastActivity.className = "py-3 px-4 whitespace-nowrap";
    if (user.inactive_days == null) {
      tdLastActivity.innerHTML = '<p class="text-xs text-slate-400">Chưa ghi nhận</p>';
    } else {
      tdLastActivity.innerHTML = `<p class="font-semibold text-slate-800">${user.inactive_days} ngày trước</p>
        <p class="text-[11px] text-slate-500">${formatDate(user.last_activity_at)}</p>`;
    }

    const tdActions = document.createElement("td");
    tdActions.className = "py-3 px-4 whitespace-nowrap";
    const lock = document.createElement("button");
    lock.type = "button";
    lock.className = user.status === "suspended"
      ? "mr-2 text-xs font-bold text-emerald-700 hover:text-emerald-900"
      : "mr-2 text-xs font-bold text-amber-700 hover:text-amber-900";
    lock.textContent = user.status === "suspended" ? "Mở khóa" : "Khóa";
    lock.addEventListener("click", () => void confirmUserStatusChange(user));
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "text-xs font-bold text-rose-700 hover:text-rose-900";
    remove.textContent = "Xóa";
    remove.addEventListener("click", () => void confirmDeleteUser(user));
    tdActions.append(lock, remove);

    tr.append(tdUser, tdLang, tdPlan, tdStats, tdStatus, tdLastActivity, tdActions);
    return tr;
  }));
  }

  const userBadge = getElement("totalUsersBadge");
  if (userBadge) userBadge.textContent = `${userTotal} tài khoản`;
  const totalPages = Math.max(1, Math.ceil(userTotal / USER_PAGE_SIZE));
  userPage = Math.min(userPage, totalPages);
  const info = getElement("userPaginationInfo");
  if (info) {
    const start = userTotal ? (userPage - 1) * USER_PAGE_SIZE + 1 : 0;
    const end = Math.min(userPage * USER_PAGE_SIZE, userTotal);
    info.textContent = userTotal ? `Hiển thị ${start}-${end} / ${userTotal} tài khoản` : "Không có tài khoản phù hợp";
  }
  const pageNumber = getElement("userPageNumber");
  if (pageNumber) pageNumber.textContent = `${userPage}/${totalPages}`;
  const previous = getElement<HTMLButtonElement>("prevUserPage");
  const next = getElement<HTMLButtonElement>("nextUserPage");
  if (previous) previous.disabled = userPage <= 1;
  if (next) next.disabled = userPage >= totalPages;
}

/**
 * 4. NẠP DANH SÁCH NGÔN NGỮ
 */
async function loadLanguages(): Promise<void> {
  try {
    const res = await adminApi<{ items: LanguageOption[] }>("/api/v1/admin/languages");
    languagesMap.clear();
    res.items.forEach((l) => languagesMap.set(l.code, l.name));

    const topicLangSelect = getElement<HTMLSelectElement>("inputTopicLanguage");
    const filterTopicLang = getElement<HTMLSelectElement>("filterTopicLanguage");

    const languageOptions = res.items.map((l) => {
        const opt = document.createElement("option");
        opt.value = l.code;
        opt.textContent = `${l.name} (${String(l.code ?? "").toUpperCase()})`;
        return opt;
      });
    if (topicLangSelect) {
      topicLangSelect.replaceChildren(...languageOptions.map((option) => option.cloneNode(true) as HTMLOptionElement));
    }

    if (filterTopicLang) {
      const allOpt = document.createElement("option");
      allOpt.value = "all";
      allOpt.textContent = "Tất cả ngôn ngữ";
      filterTopicLang.replaceChildren(allOpt, ...res.items.map((l) => {
        const opt = document.createElement("option");
        opt.value = l.code;
        opt.textContent = l.name;
        return opt;
      }));
    }
  } catch {
    languagesMap.set("en", "English");
    languagesMap.set("ja", "Japanese");
    languagesMap.set("ko", "Korean");
    languagesMap.set("zh", "Chinese");
    languagesMap.set("vi", "Vietnamese");
  }
}

/**
 * 5. NAVIGATION VÀ TƯƠNG TÁC GIAO DIỆN
 */
function setupNavigation(): void {
  const navLinks = document.querySelectorAll<HTMLAnchorElement>(".sidebar-nav-item");
  const sections = document.querySelectorAll<HTMLElement>(".admin-section");

  const switchTab = (tabName: string) => {
    activeTab = tabName;
    navLinks.forEach((link) => {
      const isTarget = link.dataset.tab === tabName;
      if (isTarget) {
        link.classList.add("bg-blue-600", "text-white", "shadow-sm");
        link.classList.remove("text-slate-300", "hover:text-white", "hover:bg-slate-800");
      } else {
        link.classList.remove("bg-blue-600", "text-white", "shadow-sm");
        link.classList.add("text-slate-300", "hover:text-white", "hover:bg-slate-800");
      }
    });

    sections.forEach((sec) => {
      if (sec.id === `section-${tabName}`) {
        sec.classList.remove("hidden");
      } else {
        sec.classList.add("hidden");
      }
    });

    const pageTitle = getElement("pageHeaderTitle");
    if (pageTitle) {
      const titles: Record<string, string> = {
        dashboard: "Tổng Quan Điều Hành Hệ Thống",
        topics: "Quản Lý Chủ Đề Học Tập (Topics)",
        readings: "Quản Lý Bài Đọc Theo Tầng Hầm Ngục",
        documents: "Quản Lý Tài Liệu AI",
        users: "Quản Trị Học Viên & Người Dùng",
        analytics: "Thống Kê Báo Cáo Chuyên Sâu",
        settings: "Cài Đặt Hệ Thống & Phân Quyền",
      };
      pageTitle.textContent = titles[tabName] || "Dashboard";
    }

    if (tabName === "dashboard" && chartInstance) {
      chartInstance.resize();
    }
    if (tabName === "readings") {
      void initReadingsTab();
    }
  };

  navLinks.forEach((link) => {
    link.addEventListener("click", (e) => {
      const targetTab = link.dataset.tab;
      if (targetTab) {
        e.preventDefault();
        switchTab(targetTab);
        if (window.innerWidth < 768) {
          closeMobileMenu();
        }
      }
    });
  });

  const hash = window.location.hash.replace("#", "");
  if (hash && ["dashboard", "topics", "readings", "documents", "users", "analytics", "settings"].includes(hash)) {
    switchTab(hash);
  }
}

function initEngagementChart(): void {
  const canvas = getElement<HTMLCanvasElement>("engagementChartCanvas");
  if (!canvas) return;

  if (chartInstance) {
    chartInstance.destroy();
  }

  chartInstance = new Chart(canvas, {
    type: "line",
    data: {
      labels: ["Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7", "Chủ Nhật"],
      datasets: [
        {
          label: "Học viên hoạt động",
          data: [120, 150, 140, 185, 170, 210, 195],
          borderColor: "#2563eb",
          backgroundColor: "rgba(37, 99, 235, 0.08)",
          fill: true,
          tension: 0.35,
          borderWidth: 2.5,
          pointRadius: 4,
          pointBackgroundColor: "#2563eb",
          yAxisID: "y",
        },
        {
          label: "Lượt ôn tập từ vựng",
          data: [65, 80, 75, 95, 90, 120, 110],
          borderColor: "#059669",
          backgroundColor: "rgba(5, 150, 105, 0.05)",
          fill: true,
          tension: 0.35,
          borderWidth: 2,
          pointRadius: 3,
          pointBackgroundColor: "#059669",
          yAxisID: "y1",
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: {
          position: "top",
          labels: { boxWidth: 10, usePointStyle: true, font: { family: "Hanken Grotesk", size: 12 } },
        },
      },
      scales: {
        y: {
          beginAtZero: true,
          grid: { color: "#f1f5f9" },
          ticks: { color: "#64748b", font: { family: "Hanken Grotesk" } },
        },
        y1: {
          beginAtZero: true,
          position: "right",
          grid: { drawOnChartArea: false },
          ticks: { color: "#64748b", font: { family: "Hanken Grotesk" } },
        },
        x: {
          grid: { display: false },
          ticks: { color: "#64748b", font: { family: "Hanken Grotesk" } },
        },
      },
    },
  });
}

function setupEventListeners(): void {
  let userSearchTimer: number | undefined;
  getElement("searchUserInput")?.addEventListener("input", () => {
    if (userSearchTimer) window.clearTimeout(userSearchTimer);
    userSearchTimer = window.setTimeout(() => {
      userPage = 1;
      void loadUsers();
    }, 300);
  });
  getElement("filterUserStatus")?.addEventListener("change", () => {
    userPage = 1;
    void loadUsers();
  });
  getElement("prevUserPage")?.addEventListener("click", () => {
    if (userPage > 1) {
      userPage -= 1;
      void loadUsers();
    }
  });
  getElement("nextUserPage")?.addEventListener("click", () => {
    if (userPage * USER_PAGE_SIZE < userTotal) {
      userPage += 1;
      void loadUsers();
    }
  });
  getElement("btnDeleteInactiveUsers")?.addEventListener("click", () => {
    openActionConfirm(
      "Xác nhận cảnh báo và lập lịch xóa",
      "Hệ thống sẽ gửi email cảnh báo đến tất cả tài khoản không hoạt động ít nhất 24 tháng. Sau 7 ngày, tài khoản vẫn không quay lại đăng nhập sẽ bị xóa vĩnh viễn cùng toàn bộ dữ liệu liên quan.",
      "Gửi cảnh báo & lập lịch",
      async () => {
        const result = await adminApi<{ status: string; data: { eligible_accounts: number; warning_emails_sent: number; scheduled_for: string } }>(
          "/api/v1/admin/users/delete-inactive",
          { method: "POST" },
        );
        showToast(
          `Đã lập lịch cho ${result.data.eligible_accounts} tài khoản; gửi thành công ${result.data.warning_emails_sent} email cảnh báo.`,
          "success",
        );
        await loadUsers();
      },
    );
  });

  getElement("documentForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const title = getFieldValue("inputDocumentTitle");
    const languageCode = getFieldValue("inputDocumentLanguage");
    const content = getFieldValue("inputDocumentContent");
    const fileInput = getElement<HTMLInputElement>("inputDocumentFile");
    const file = fileInput?.files?.[0];
    if (!languageCode || (!content && !file)) {
      showToast("Vui lòng nhập nội dung hoặc chọn một file để tải lên.", "error");
      return;
    }

    const submit = getElement<HTMLButtonElement>("btnSubmitDocument");
    if (submit) submit.disabled = true;
    try {
      let result: { chunks_indexed: number };
      if (file) {
        const formData = new FormData();
        formData.append("language_code", languageCode);
        formData.append("file", file);
        result = await adminApi<{ chunks_indexed: number }>("/api/v1/admin/rag/documents/upload", {
          method: "POST",
          body: formData,
        });
      } else {
        if (!title) {
          showToast("Vui lòng nhập tiêu đề khi nhập nội dung thủ công.", "error");
          return;
        }
        result = await adminApi<{ chunks_indexed: number }>("/api/v1/admin/rag/documents", {
          method: "POST",
          body: { title, language_code: languageCode, content },
        });
      }
      getElement<HTMLFormElement>("documentForm")?.reset();
      showToast(`Đã lập chỉ mục tài liệu (${result.chunks_indexed} đoạn).`, "success");
      await loadDocuments();
    } catch (error) {
      showApiError(error);
    } finally {
      if (submit) submit.disabled = false;
    }
  });

  getElement("btnRefreshDocuments")?.addEventListener("click", () => void loadDocuments());
  getElement("filterDocumentLanguage")?.addEventListener("change", () => {
    documentPage = 1;
    renderDocumentsTable();
  });
  getElement("prevDocumentPage")?.addEventListener("click", () => {
    if (documentPage > 1) {
      documentPage -= 1;
      renderDocumentsTable();
    }
  });
  getElement("nextDocumentPage")?.addEventListener("click", () => {
    const filter = getFieldValue("filterDocumentLanguage") || "all";
    const totalPages = Math.max(1, Math.ceil(
      documentsList.filter((item) => filter === "all" || item.language_code === filter || (filter === "all-language" && item.language_code === "all")).length
      / DOCUMENT_PAGE_SIZE,
    ));
    if (documentPage < totalPages) {
      documentPage += 1;
      renderDocumentsTable();
    }
  });
  getElement("btnReindexDocuments")?.addEventListener("click", async () => {
    const button = getElement<HTMLButtonElement>("btnReindexDocuments");
    if (button) button.disabled = true;
    try {
      const result = await adminApi<{ message: string; data: { documents_indexed: number } }>("/api/v1/admin/rag/reindex", { method: "POST" });
      showToast(`${result.message} (${result.data.documents_indexed} tài liệu).`, "success");
      await loadDocuments();
    } catch (error) {
      showApiError(error);
    } finally {
      if (button) button.disabled = false;
    }
  });

  // Submit Topic Form (POST hoặc PUT thật vào CSDL)
  getElement("topicForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = getFieldValue("inputTopicName");
    const lang = getFieldValue("inputTopicLanguage");
    if (!name || !lang) {
      showToast("Vui lòng nhập tên chủ đề và chọn ngôn ngữ.", "error");
      return;
    }

    const editId = Number(getFieldValue("editTopicId"));
    const isEdit = Number.isInteger(editId) && editId > 0;
    const submitBtn = getElement<HTMLButtonElement>("btnSubmitTopic");
    if (submitBtn) submitBtn.disabled = true;

    try {
      const payload = {
        name,
        language_code: lang,
        description: getFieldValue("inputTopicDescription") || null,
        icon_url: getFieldValue("inputTopicIcon") || "category",
        sort_order: Number(getFieldValue("inputTopicOrder")) || 100,
      };

      if (isEdit) {
        await adminApi(`/api/v1/admin/topics/${editId}`, { method: "PUT", body: payload });
        showToast("Đã cập nhật chủ đề thành công trong CSDL!", "success");
      } else {
        await adminApi("/api/v1/admin/topics", { method: "POST", body: payload });
        showToast("Đã tạo chủ đề mới thành công trong CSDL!", "success");
      }

      resetTopicForm();
      await Promise.all([loadTopics(currentTopicFilterLang), loadDashboardStats()]);
    } catch (err) {
      showApiError(err);
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  });

  getElement("btnCancelTopicEdit")?.addEventListener("click", resetTopicForm);

  getElement("readingsTopicSelect")?.addEventListener("change", (event) => {
    const value = Number((event.target as HTMLSelectElement).value);
    if (Number.isFinite(value) && value > 0) void loadTopicReadings(value);
  });
  getElement("btnSubmitReadings")?.addEventListener("click", () => void saveReadings());
  getElement("readingStagesWrap")?.addEventListener("input", (event) => {
    const card = (event.target as HTMLElement).closest<HTMLElement>("[data-stage]");
    if (card) updateReadingStageUI(Number(card.dataset.stage));
  });

  // Search & Filter topics
  getElement("searchTopicInput")?.addEventListener("input", renderTopicsTable);
  getElement("filterTopicLanguage")?.addEventListener("change", (e) => {
    currentTopicFilterLang = (e.target as HTMLSelectElement).value;
    void loadTopics(currentTopicFilterLang);
  });

  // Mobile Menu
  getElement("mobileMenuBtn")?.addEventListener("click", () => {
    const sidebar = getElement("adminSidebar");
    const overlay = getElement("sidebarOverlay");
    sidebar?.classList.toggle("-translate-x-full");
    overlay?.classList.toggle("hidden");
  });

  getElement("sidebarOverlay")?.addEventListener("click", closeMobileMenu);

  // Logout
  getElement("adminLogoutAction")?.addEventListener("click", () => {
    void logoutAdmin();
  });
}

function closeMobileMenu(): void {
  getElement("adminSidebar")?.classList.add("-translate-x-full");
  getElement("sidebarOverlay")?.classList.add("hidden");
}

function showApiError(err: unknown): void {
  const msg = err instanceof ApiError || err instanceof Error ? err.message : "Đã xảy ra lỗi kết nối cơ sở dữ liệu.";
  showToast(msg, "error");
}

function showToast(message: string, type: "success" | "error" | "info" = "info"): void {
  const container = getElement("toastContainer");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = `pointer-events-auto rounded-xl px-4 py-3 text-xs text-white shadow-xl flex items-center gap-2 transition-all ${
    type === "success" ? "bg-emerald-600" : type === "error" ? "bg-rose-600" : "bg-slate-800"
  }`;
  const icon = document.createElement("span");
  icon.className = "material-symbols-outlined text-base";
  icon.textContent = type === "success" ? "check_circle" : type === "error" ? "error" : "info";
  toast.append(icon, document.createTextNode(message));
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = "0";
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => void initDashboard(), { once: true });
} else {
  void initDashboard();
}