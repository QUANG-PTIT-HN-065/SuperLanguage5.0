import Chart from "chart.js/auto";
import { adminApi, ApiError, logoutAdmin, requireAdminSession } from "./auth";

interface VocabularyItem {
  id: number;
  word: string;
  phonetic: string | null;
  meaning: string;
  example_sentence: string | null;
  example_meaning: string | null;
  language_code: string;
  level: string;
  part_of_speech: string | null;
  audio_url: string | null;
  topic_ids?: number[];
}

interface WordListResponse {
  items: VocabularyItem[];
  total: number;
  limit: number;
  offset: number;
}

interface LanguageOption {
  code: string;
  name: string;
}

interface TopicOption {
  id: number;
  name: string;
}

interface WordPayload {
  language_code: string;
  word: string;
  meaning: string;
  phonetic: string | null;
  part_of_speech: string | null;
  audio_url: string | null;
  example_sentence: string | null;
  example_meaning: string | null;
  level: string;
  topic_ids: number[];
}

const PAGE_SIZE = 50;
const vocabList: VocabularyItem[] = [];
const languages = new Map<string, string>();
let currentPage = 0;
let totalWords = 0;
let pendingDeleteId: number | null = null;

function getElement(id: string): HTMLElement | null {
  return document.getElementById(id);
}

function getFieldValue(id: string): string {
  const element = getElement(id);
  if (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLSelectElement
  ) {
    return element.value.trim();
  }
  return "";
}

async function initializeDashboard(): Promise<void> {
  const status = getElement("authStatus");
  try {
    const profile = await requireAdminSession();
    if (!profile) return;

    const dashboard = getElement("dashboardApp");
    dashboard?.removeAttribute("hidden");
    if (status) status.setAttribute("hidden", "");

    const displayName = getElement("adminDisplayName");
    if (displayName) displayName.textContent = profile.displayName || profile.email;
    const email = getElement("adminEmail");
    if (email) email.textContent = profile.email;

    initSidebar();
    initChart();
    setupEventListeners();
    await loadLanguages();
    await loadWords();
    updateStats();
  } catch (error) {
    if (status) {
      status.textContent = error instanceof ApiError || error instanceof Error
        ? error.message
        : "Không thể kết nối backend. Vui lòng thử tải lại trang.";
    }
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializeDashboard, { once: true });
} else {
  initializeDashboard();
}

function initSidebar(): void {
  const toggleButton = getElement("mobileMenuToggle");
  const sidebar = getElement("sidebar");
  const overlay = getElement("sidebarOverlay");

  if (!toggleButton || !sidebar || !overlay) return;

  const closeMobileMenu = (): void => {
    sidebar.classList.add("-translate-x-full");
    overlay.classList.add("hidden");
    document.body.classList.remove("menu-open");
  };

  toggleButton.addEventListener("click", () => {
    const isClosed = sidebar.classList.contains("-translate-x-full");
    sidebar.classList.toggle("-translate-x-full", !isClosed);
    overlay.classList.toggle("hidden", !isClosed);
    document.body.classList.toggle("menu-open", isClosed);
  });

  overlay.addEventListener("click", closeMobileMenu);

  sidebar.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => {
      if (window.innerWidth < 768) closeMobileMenu();
    });
  });

  window.addEventListener("resize", () => {
    if (window.innerWidth >= 768) closeMobileMenu();
  });
}

function initChart(): void {
  const canvas = document.querySelector<HTMLCanvasElement>("#engagementChart");
  if (!canvas) return;

  new Chart(canvas, {
    type: "line",
    data: {
      labels: ["Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7", "CN"],
      datasets: [
        {
          label: "Học viên hoạt động",
          data: [820, 1050, 920, 1280, 1150, 1420, 1260],
          borderColor: "#4f46e5",
          backgroundColor: "rgba(79, 70, 229, 0.12)",
          fill: true,
          tension: 0.4,
          yAxisID: "y",
        },
        {
          label: "Giờ học",
          data: [340, 420, 390, 510, 470, 590, 530],
          borderColor: "#10b981",
          backgroundColor: "rgba(16, 185, 129, 0.1)",
          fill: true,
          tension: 0.4,
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
          position: "bottom",
          labels: { usePointStyle: true, boxWidth: 8 },
        },
      },
      scales: {
        y: {
          beginAtZero: true,
          grid: { color: "#f1f5f9" },
          ticks: { color: "#64748b" },
        },
        y1: {
          beginAtZero: true,
          position: "right",
          grid: { drawOnChartArea: false },
          ticks: { color: "#64748b" },
        },
        x: {
          grid: { display: false },
          ticks: { color: "#64748b" },
        },
      },
    },
  });
}

async function loadLanguages(): Promise<void> {
  const response = await adminApi<{ items: LanguageOption[] }>("/api/v1/admin/languages");
  const select = getElement("inputLanguage");
  if (!(select instanceof HTMLSelectElement)) return;

  select.replaceChildren(...response.items.map((language) => {
    languages.set(language.code, language.name);
    const option = document.createElement("option");
    option.value = language.code;
    option.textContent = language.name;
    return option;
  }));
  await loadTopics(select.value);
}

async function loadTopics(languageCode: string, selectedIds: number[] = []): Promise<void> {
  const select = getElement("inputTopics");
  if (!(select instanceof HTMLSelectElement)) return;
  select.disabled = true;
  try {
    const response = await adminApi<{ items: TopicOption[] }>(
      `/api/v1/admin/topics?language_code=${encodeURIComponent(languageCode)}`,
    );
    select.replaceChildren(...response.items.map((topic) => {
      const option = document.createElement("option");
      option.value = String(topic.id);
      option.textContent = topic.name;
      option.selected = selectedIds.includes(topic.id);
      return option;
    }));
    select.disabled = response.items.length === 0;
  } catch (error) {
    select.replaceChildren();
    select.disabled = true;
    throw error;
  }
}

async function loadWords(): Promise<void> {
  const response = await adminApi<WordListResponse>(
    `/api/v1/admin/words?limit=${PAGE_SIZE}&offset=${currentPage * PAGE_SIZE}`,
  );
  vocabList.splice(0, vocabList.length, ...response.items);
  totalWords = response.total;
  renderVocabTable(getFieldValue("searchInput"));
  updateStats();
}

function renderVocabTable(searchTerm = ""): void {
  const tableBody = getElement("vocabTableBody");
  if (!tableBody) return;

  const normalizedSearch = searchTerm.trim().toLocaleLowerCase();
  const visibleItems = vocabList
    .filter((item) =>
      [item.word, item.phonetic, item.meaning, item.example_sentence, languages.get(item.language_code), item.level]
        .join(" ").toLocaleLowerCase().includes(normalizedSearch),
    );

  tableBody.replaceChildren(...visibleItems.map(createVocabularyRow));

  const tableInfo = getElement("tableInfo");
  if (tableInfo) {
    tableInfo.textContent = `Đang hiển thị ${visibleItems.length} từ của trang ${currentPage + 1} / ${totalWords} từ`;
  }
  const pageNumber = getElement("pageNumber");
  if (pageNumber) pageNumber.textContent = String(currentPage + 1);
  const prev = getElement("prevPage");
  if (prev instanceof HTMLButtonElement) prev.disabled = currentPage === 0;
  const next = getElement("nextPage");
  if (next instanceof HTMLButtonElement) next.disabled = (currentPage + 1) * PAGE_SIZE >= totalWords;
}

function createVocabularyRow(item: VocabularyItem): HTMLTableRowElement {
  const row = document.createElement("tr");
  row.className = "hover:bg-slate-50/80 transition-colors";

  const wordCell = createCell();
  const word = document.createElement("div");
  word.className = "font-semibold text-slate-800";
  word.textContent = item.word;
  if (item.phonetic) {
    const ipa = document.createElement("div");
    ipa.className = "text-xs text-slate-500 mt-1";
    ipa.textContent = item.phonetic;
    wordCell.append(word, ipa);
  } else {
    wordCell.appendChild(word);
  }

  const meaningCell = createCell();
  const meaning = document.createElement("div");
  meaning.className = "text-slate-700";
  meaning.textContent = item.meaning;
  meaningCell.appendChild(meaning);
  if (item.example_sentence) {
    const example = document.createElement("div");
    example.className = "text-xs text-slate-500 italic mt-1";
    example.textContent = item.example_sentence;
    meaningCell.appendChild(example);
  }

  const languageCell = createCell();
  languageCell.textContent = languages.get(item.language_code) ?? item.language_code;

  const difficultyCell = createCell();
  const difficulty = document.createElement("span");
  difficulty.className = "inline-flex rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700";
  difficulty.textContent = item.level;
  difficultyCell.appendChild(difficulty);

  const actionsCell = createCell();
  actionsCell.classList.add("text-right", "whitespace-nowrap");
  actionsCell.append(
    createActionButton("view", item.id, "Xem chi tiết từ vựng", "fa-eye"),
    createActionButton("edit", item.id, "Sửa từ vựng", "fa-pen"),
    createActionButton("delete", item.id, "Xóa từ vựng", "fa-trash"),
  );
  row.append(wordCell, meaningCell, languageCell, difficultyCell, actionsCell);
  return row;
}

function createCell(): HTMLTableCellElement {
  const cell = document.createElement("td");
  cell.className = "py-3 px-4 align-top";
  return cell;
}

function createActionButton(action: "view" | "edit" | "delete", id: number, label: string, iconName: string): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.dataset.action = action;
  button.dataset.id = String(id);
  button.setAttribute("aria-label", label);
  button.className =
    action === "edit"
      ? "p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
      : action === "view"
        ? "p-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
        : "p-2 text-rose-600 hover:bg-rose-50 rounded-lg transition-colors";

  const icon = document.createElement("i");
  icon.className = `fas ${iconName}`;
  button.appendChild(icon);
  return button;
}

function updateStats(): void {
  const vocabStat = getElement("statVocab");
  if (vocabStat) {
    vocabStat.textContent = new Intl.NumberFormat("vi-VN").format(totalWords);
  }
}

function setupEventListeners(): void {
  getElement("vocabForm")?.addEventListener("submit", handleVocabSubmit);
  getElement("searchInput")?.addEventListener("input", () => {
    renderVocabTable(getFieldValue("searchInput"));
  });
  getElement("vocabTableBody")?.addEventListener("click", handleVocabTableClick);
  getElement("inputLanguage")?.addEventListener("change", () => {
    void loadTopics(getFieldValue("inputLanguage")).catch(showApiError);
  });
  getElement("prevPage")?.addEventListener("click", () => {
    if (currentPage > 0) {
      currentPage -= 1;
      void loadWords().catch(showApiError);
    }
  });
  getElement("nextPage")?.addEventListener("click", () => {
    if ((currentPage + 1) * PAGE_SIZE < totalWords) {
      currentPage += 1;
      void loadWords().catch(showApiError);
    }
  });

  getElement("btnCancelEdit")?.addEventListener("click", resetForm);
  document.querySelectorAll<HTMLElement>("[data-scroll-vocab]").forEach((button) => {
    button.addEventListener("click", scrollToVocabForm);
  });

  getElement("modalCancelBtn")?.addEventListener("click", closeDeleteModal);
  getElement("modalConfirmBtn")?.addEventListener("click", () => void confirmDelete());
  getElement("wordDetailClose")?.addEventListener("click", closeWordDetail);
  getElement("wordDetailModal")?.addEventListener("click", (event) => {
    if (event.target === event.currentTarget) closeWordDetail();
  });
  getElement("adminLogout")?.addEventListener("click", () => {
    void logoutAdmin().catch((error: unknown) => {
      showToast(error instanceof Error ? error.message : "Đăng xuất thất bại.", "error");
    });
  });
  getElement("confirmModal")?.addEventListener("click", (event) => {
    if (event.target === event.currentTarget) closeDeleteModal();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeDeleteModal();
      closeWordDetail();
    }
  });
}

async function handleVocabSubmit(event: Event): Promise<void> {
  event.preventDefault();

  const word = getFieldValue("inputWord");
  const meaning = getFieldValue("inputMeaning");
  if (!word || !meaning) {
    showToast("Vui lòng nhập từ vựng và nghĩa của từ.", "error");
    return;
  }

  const topicSelect = getElement("inputTopics");
  const topicIds = topicSelect instanceof HTMLSelectElement
    ? Array.from(topicSelect.selectedOptions, (option) => Number(option.value))
    : [];
  if (topicIds.length === 0) {
    showToast("Vui lòng chọn ít nhất một chủ đề.", "error");
    return;
  }

  const payload: WordPayload = {
    language_code: getFieldValue("inputLanguage"),
    word,
    meaning,
    phonetic: getFieldValue("inputIpa") || null,
    part_of_speech: getFieldValue("inputPartOfSpeech") || null,
    audio_url: getFieldValue("inputAudioUrl") || null,
    example_sentence: getFieldValue("inputExample") || null,
    example_meaning: getFieldValue("inputExampleMeaning") || null,
    level: getFieldValue("inputDifficulty"),
    topic_ids: topicIds,
  };
  const wordId = Number(getFieldValue("editIndex"));
  const isEditing = Number.isInteger(wordId) && wordId > 0;
  const submitButton = getElement("btnSubmit");
  if (submitButton instanceof HTMLButtonElement) submitButton.disabled = true;
  try {
    if (isEditing) {
      await adminApi(`/api/v1/admin/words/${wordId}`, { method: "PUT", body: payload });
    } else {
      await adminApi("/api/v1/admin/words", { method: "POST", body: payload });
      currentPage = 0;
    }
    resetForm();
    await loadWords();
    showToast(isEditing ? "Đã cập nhật từ vựng." : "Đã thêm từ vựng mới.", "success");
  } catch (error) {
    showApiError(error);
  } finally {
    if (submitButton instanceof HTMLButtonElement) submitButton.disabled = false;
  }
}

function handleVocabTableClick(event: Event): void {
  const target = event.target;
  if (!(target instanceof Element)) return;

  const button = target.closest<HTMLButtonElement>("[data-action]");
  if (!button) return;

  const wordId = Number(button.dataset.id);
  if (!Number.isInteger(wordId) || wordId < 1) return;

  if (button.dataset.action === "view") {
    void showWordDetail(wordId).catch(showApiError);
  } else if (button.dataset.action === "edit") {
    void editVocab(wordId).catch(showApiError);
  } else if (button.dataset.action === "delete") {
    openDeleteModal(wordId);
  }
}

async function editVocab(wordId: number): Promise<void> {
  const response = await adminApi<{ word: VocabularyItem }>(`/api/v1/admin/words/${wordId}`);
  const item = response.word;

  const fields: Record<string, string> = {
    inputWord: item.word,
    inputIpa: item.phonetic ?? "",
    inputMeaning: item.meaning,
    inputExample: item.example_sentence ?? "",
    inputExampleMeaning: item.example_meaning ?? "",
    inputPartOfSpeech: item.part_of_speech ?? "",
    inputAudioUrl: item.audio_url ?? "",
    inputLanguage: item.language_code,
    inputDifficulty: item.level,
  };

  Object.entries(fields).forEach(([id, value]) => {
    const element = getElement(id);
    if (
      element instanceof HTMLInputElement ||
      element instanceof HTMLTextAreaElement ||
      element instanceof HTMLSelectElement
    ) {
      element.value = value;
    }
  });
  await loadTopics(item.language_code, item.topic_ids ?? []);

  const editIndexField = getElement("editIndex");
  if (editIndexField instanceof HTMLInputElement) editIndexField.value = String(wordId);

  const title = getElement("formTitle");
  if (title) title.textContent = "Chỉnh sửa Từ Vựng";
  const buttonText = getElement("btnText");
  if (buttonText) buttonText.textContent = "Cập nhật Từ Vựng";
  const buttonIcon = getElement("btnIcon");
  if (buttonIcon) buttonIcon.className = "fas fa-save mr-2";
  getElement("btnCancelEdit")?.classList.remove("hidden");

  scrollToVocabForm();
  document.querySelector<HTMLInputElement>("#inputWord")?.focus({ preventScroll: true });
}

function resetForm(): void {
  const form = getElement("vocabForm");
  if (form instanceof HTMLFormElement) form.reset();

  const editIndexField = getElement("editIndex");
  if (editIndexField instanceof HTMLInputElement) editIndexField.value = "-1";
  const title = getElement("formTitle");
  if (title) title.textContent = "Thêm Từ Vựng Mới";
  const buttonText = getElement("btnText");
  if (buttonText) buttonText.textContent = "Lưu Từ Vựng";
  const buttonIcon = getElement("btnIcon");
  if (buttonIcon) buttonIcon.className = "fas fa-plus mr-2";
  getElement("btnCancelEdit")?.classList.add("hidden");
}

function scrollToVocabForm(): void {
  getElement("vocab-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function openDeleteModal(wordId: number): void {
  const modal = getElement("confirmModal");
  const modalCard = getElement("modalCard");
  if (!modal || !modalCard) return;

  pendingDeleteId = wordId;
  modal.classList.remove("opacity-0", "pointer-events-none");
  modal.classList.add("opacity-100");
  modalCard.classList.remove("scale-95");
  modalCard.classList.add("scale-100");
  modal.setAttribute("aria-hidden", "false");
}

function closeDeleteModal(): void {
  const modal = getElement("confirmModal");
  const modalCard = getElement("modalCard");
  if (!modal || !modalCard) return;

  pendingDeleteId = null;
  modal.classList.add("opacity-0", "pointer-events-none");
  modal.classList.remove("opacity-100");
  modalCard.classList.add("scale-95");
  modalCard.classList.remove("scale-100");
  modal.setAttribute("aria-hidden", "true");
}

async function showWordDetail(wordId: number): Promise<void> {
  const response = await adminApi<{ word: VocabularyItem }>(`/api/v1/admin/words/${wordId}`);
  const word = response.word;
  const topics = await adminApi<{ items: TopicOption[] }>(
    `/api/v1/admin/topics?language_code=${encodeURIComponent(word.language_code)}`,
  );
  const topicNames = new Map(topics.items.map((topic) => [topic.id, topic.name]));

  const title = getElement("wordDetailTitle");
  if (title) title.textContent = word.word;
  const subtitle = getElement("wordDetailSubtitle");
  if (subtitle) {
    subtitle.textContent = [
      languages.get(word.language_code) ?? word.language_code,
      word.phonetic,
      word.level,
    ].filter(Boolean).join(" · ");
  }

  const details = getElement("wordDetailBody");
  if (details) {
    const values: Array<[string, string]> = [
      ["Nghĩa", word.meaning],
      ["Loại từ", word.part_of_speech ?? "Chưa phân loại"],
      ["Ví dụ", word.example_sentence ?? "—"],
      ["Nghĩa ví dụ", word.example_meaning ?? "—"],
      ["Âm thanh", word.audio_url ?? "—"],
      ["Chủ đề", (word.topic_ids ?? []).map((id) => topicNames.get(id) ?? `#${id}`).join(", ") || "—"],
    ];
    details.replaceChildren(...values.map(([label, value]) => {
      const wrapper = document.createElement("div");
      const term = document.createElement("dt");
      term.className = "font-semibold text-slate-700";
      term.textContent = label;
      const description = document.createElement("dd");
      description.className = "mt-1 whitespace-pre-wrap text-slate-600";
      description.textContent = value;
      wrapper.append(term, description);
      return wrapper;
    }));
  }

  const modal = getElement("wordDetailModal");
  modal?.classList.remove("opacity-0", "pointer-events-none");
  modal?.classList.add("opacity-100");
  modal?.setAttribute("aria-hidden", "false");
}

function closeWordDetail(): void {
  const modal = getElement("wordDetailModal");
  if (!modal) return;
  modal.classList.add("opacity-0", "pointer-events-none");
  modal.classList.remove("opacity-100");
  modal.setAttribute("aria-hidden", "true");
}

async function confirmDelete(): Promise<void> {
  if (pendingDeleteId === null) return;
  const wordId = pendingDeleteId;
  const button = getElement("modalConfirmBtn");
  if (button instanceof HTMLButtonElement) button.disabled = true;
  try {
    await adminApi(`/api/v1/admin/words/${wordId}`, { method: "DELETE" });
    closeDeleteModal();
    if (getFieldValue("editIndex") === String(wordId)) resetForm();
    if (currentPage > 0 && currentPage * PAGE_SIZE >= totalWords - 1) currentPage -= 1;
    await loadWords();
    showToast("Đã xóa từ vựng.", "success");
  } catch (error) {
    showApiError(error);
  } finally {
    if (button instanceof HTMLButtonElement) button.disabled = false;
  }
}

function showApiError(error: unknown): void {
  if (error instanceof ApiError || error instanceof Error) {
    showToast(error.message, "error");
  } else {
    showToast("Không thể hoàn tất yêu cầu. Vui lòng thử lại.", "error");
  }
}

function showToast(message: string, type: "success" | "error"): void {
  const container = getElement("toastContainer");
  if (!container) return;

  const toast = document.createElement("div");
  toast.setAttribute("role", "status");
  toast.className = `pointer-events-auto rounded-xl px-4 py-3 text-sm text-white shadow-lg ${
    type === "success" ? "bg-emerald-600" : "bg-rose-600"
  }`;
  toast.textContent = message;
  container.appendChild(toast);
  window.setTimeout(() => toast.remove(), 3000);
}
