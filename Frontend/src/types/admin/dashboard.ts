import Chart from "chart.js/auto";
import { ApiError, logoutAdmin, requireAdminSession } from "./auth";

interface VocabularyItem {
  word: string;
  ipa: string;
  meaning: string;
  example: string;
  language: string;
  difficulty: string;
}

const vocabList: VocabularyItem[] = [
  {
    word: "Serendipity",
    ipa: "/ˌserənˈdipədē/",
    meaning: "Sự tình cờ phát hiện ra những điều thú vị",
    example: "They met by pure serendipity at a coffee shop.",
    language: "English",
    difficulty: "Advanced (C1-C2)",
  },
  {
    word: "Hola",
    ipa: "/ˈola/",
    meaning: "Xin chào",
    example: "¡Hola! ¿Cómo estás?",
    language: "Spanish",
    difficulty: "Beginner (A1)",
  },
  {
    word: "Zeitgeist",
    ipa: "/ˈtsaɪtɡaɪst/",
    meaning: "Tinh thần thời đại",
    example: "The movie captures the zeitgeist of the 1990s.",
    language: "German",
    difficulty: "Intermediate (B1-B2)",
  },
  {
    word: "Komorebi",
    ipa: "/ko-mo-re-bi/",
    meaning: "Ánh nắng lọt qua kẽ lá",
    example: "We enjoyed the beautiful komorebi in the forest.",
    language: "Japanese",
    difficulty: "Intermediate (B1-B2)",
  },
];

let pendingDeleteIndex: number | null = null;

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
    renderVocabTable();
    updateStats();
    setupEventListeners();
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

function renderVocabTable(searchTerm = ""): void {
  const tableBody = getElement("vocabTableBody");
  if (!tableBody) return;

  const normalizedSearch = searchTerm.trim().toLocaleLowerCase();
  const visibleItems = vocabList
    .map((item, index) => ({ item, index }))
    .filter(({ item }) =>
      [item.word, item.ipa, item.meaning, item.example, item.language, item.difficulty]
        .join(" ")
        .toLocaleLowerCase()
        .includes(normalizedSearch),
    );

  tableBody.replaceChildren(...visibleItems.map(createVocabularyRow));

  const tableInfo = getElement("tableInfo");
  if (tableInfo) {
    tableInfo.textContent = `Đang hiển thị ${visibleItems.length} / ${vocabList.length} từ vựng`;
  }
}

function createVocabularyRow({ item, index }: { item: VocabularyItem; index: number }): HTMLTableRowElement {
  const row = document.createElement("tr");
  row.className = "hover:bg-slate-50/80 transition-colors";

  const wordCell = createCell();
  const word = document.createElement("div");
  word.className = "font-semibold text-slate-800";
  word.textContent = item.word;
  const ipa = document.createElement("div");
  ipa.className = "text-xs text-slate-500 mt-1";
  ipa.textContent = item.ipa;
  wordCell.append(word, ipa);

  const meaningCell = createCell();
  const meaning = document.createElement("div");
  meaning.className = "text-slate-700";
  meaning.textContent = item.meaning;
  meaningCell.appendChild(meaning);
  if (item.example) {
    const example = document.createElement("div");
    example.className = "text-xs text-slate-500 italic mt-1";
    example.textContent = item.example;
    meaningCell.appendChild(example);
  }

  const languageCell = createCell();
  languageCell.textContent = item.language;

  const difficultyCell = createCell();
  const difficulty = document.createElement("span");
  difficulty.className = "inline-flex rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700";
  difficulty.textContent = item.difficulty;
  difficultyCell.appendChild(difficulty);

  const actionsCell = createCell();
  actionsCell.classList.add("text-right", "whitespace-nowrap");
  actionsCell.append(
    createActionButton("edit", index, "Sửa từ vựng", "fa-pen"),
    createActionButton("delete", index, "Xóa từ vựng", "fa-trash"),
  );
  row.append(wordCell, meaningCell, languageCell, difficultyCell, actionsCell);
  return row;
}

function createCell(): HTMLTableCellElement {
  const cell = document.createElement("td");
  cell.className = "py-3 px-4 align-top";
  return cell;
}

function createActionButton(action: "edit" | "delete", index: number, label: string, iconName: string): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.dataset.action = action;
  button.dataset.index = String(index);
  button.setAttribute("aria-label", label);
  button.className =
    action === "edit"
      ? "p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
      : "p-2 text-rose-600 hover:bg-rose-50 rounded-lg transition-colors";

  const icon = document.createElement("i");
  icon.className = `fas ${iconName}`;
  button.appendChild(icon);
  return button;
}

function updateStats(): void {
  const vocabStat = getElement("statVocab");
  if (vocabStat) {
    vocabStat.textContent = new Intl.NumberFormat("vi-VN").format(vocabList.length);
  }
}

function setupEventListeners(): void {
  getElement("vocabForm")?.addEventListener("submit", handleVocabSubmit);
  getElement("searchInput")?.addEventListener("input", () => {
    renderVocabTable(getFieldValue("searchInput"));
  });
  getElement("vocabTableBody")?.addEventListener("click", handleVocabTableClick);

  getElement("btnCancelEdit")?.addEventListener("click", resetForm);
  document.querySelectorAll<HTMLElement>("[data-scroll-vocab]").forEach((button) => {
    button.addEventListener("click", scrollToVocabForm);
  });

  getElement("modalCancelBtn")?.addEventListener("click", closeDeleteModal);
  getElement("modalConfirmBtn")?.addEventListener("click", confirmDelete);
  getElement("adminLogout")?.addEventListener("click", () => {
    void logoutAdmin().catch((error: unknown) => {
      showToast(error instanceof Error ? error.message : "Đăng xuất thất bại.", "error");
    });
  });
  getElement("confirmModal")?.addEventListener("click", (event) => {
    if (event.target === event.currentTarget) closeDeleteModal();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeDeleteModal();
  });
}

function handleVocabSubmit(event: Event): void {
  event.preventDefault();

  const word = getFieldValue("inputWord");
  const meaning = getFieldValue("inputMeaning");
  if (!word || !meaning) {
    showToast("Vui lòng nhập từ vựng và nghĩa của từ.", "error");
    return;
  }

  const item: VocabularyItem = {
    word,
    ipa: getFieldValue("inputIpa"),
    meaning,
    example: getFieldValue("inputExample"),
    language: getFieldValue("inputLanguage"),
    difficulty: getFieldValue("inputDifficulty"),
  };

  const editIndex = Number(getFieldValue("editIndex"));
  if (Number.isInteger(editIndex) && editIndex >= 0 && editIndex < vocabList.length) {
    vocabList[editIndex] = item;
    showToast("Đã cập nhật từ vựng.", "success");
  } else {
    vocabList.push(item);
    showToast("Đã thêm từ vựng mới.", "success");
  }

  resetForm();
  renderVocabTable(getFieldValue("searchInput"));
  updateStats();
}

function handleVocabTableClick(event: Event): void {
  const target = event.target;
  if (!(target instanceof Element)) return;

  const button = target.closest<HTMLButtonElement>("[data-action]");
  if (!button) return;

  const index = Number(button.dataset.index);
  if (!Number.isInteger(index) || index < 0 || index >= vocabList.length) return;

  if (button.dataset.action === "edit") {
    editVocab(index);
  } else if (button.dataset.action === "delete") {
    openDeleteModal(index);
  }
}

function editVocab(index: number): void {
  const item = vocabList[index];
  if (!item) return;

  const fields: Record<string, string> = {
    inputWord: item.word,
    inputIpa: item.ipa,
    inputMeaning: item.meaning,
    inputExample: item.example,
    inputLanguage: item.language,
    inputDifficulty: item.difficulty,
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

  const editIndexField = getElement("editIndex");
  if (editIndexField instanceof HTMLInputElement) editIndexField.value = String(index);

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

function openDeleteModal(index: number): void {
  const modal = getElement("confirmModal");
  const modalCard = getElement("modalCard");
  if (!modal || !modalCard) return;

  pendingDeleteIndex = index;
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

  pendingDeleteIndex = null;
  modal.classList.add("opacity-0", "pointer-events-none");
  modal.classList.remove("opacity-100");
  modalCard.classList.add("scale-95");
  modalCard.classList.remove("scale-100");
  modal.setAttribute("aria-hidden", "true");
}

function confirmDelete(): void {
  if (pendingDeleteIndex === null) return;

  vocabList.splice(pendingDeleteIndex, 1);
  closeDeleteModal();
  resetForm();
  renderVocabTable(getFieldValue("searchInput"));
  updateStats();
  showToast("Đã xóa từ vựng.", "success");
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
