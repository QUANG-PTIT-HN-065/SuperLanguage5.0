import { adminApi, ApiError, ForbiddenError, logoutAdmin, requireAdminSession } from "./auth";

export interface VocabularyItem {
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

export interface WordListResponse {
  items: VocabularyItem[];
  total: number;
  limit: number;
  offset: number;
}

export interface LanguageOption {
  code: string;
  name: string;
}

export interface TopicOption {
  id: number;
  name: string;
}

export interface WordPayload {
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

const PAGE_SIZE = 25;
const vocabList: VocabularyItem[] = [];
const languagesMap = new Map<string, string>();
const topicsMap = new Map<number, string>();
let currentPage = 0;
let totalWords = 0;
let pendingDeleteId: number | null = null;
let currentLanguageFilter = "all";
let currentCefrFilter = "all";

function getElement<T extends HTMLElement = HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
}

function getFieldValue(id: string): string {
  const el = getElement<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(id);
  return el ? el.value.trim() : "";
}

export async function initVocabularyPage(): Promise<void> {
  const statusEl = getElement("authStatus");
  try {
    const profile = await requireAdminSession();
    if (!profile) return;

    getElement("vocabApp")?.removeAttribute("hidden");
    statusEl?.setAttribute("hidden", "");

    const nameEl = getElement("adminDisplayName");
    if (nameEl) nameEl.textContent = profile.displayName || profile.email;
    const emailEl = getElement("adminEmail");
    if (emailEl) emailEl.textContent = profile.email;

    setupEventListeners();
    await loadLanguages();
    await loadWords();
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return;
    }
    if (statusEl) {
      statusEl.textContent = error instanceof ApiError || error instanceof Error
        ? error.message
        : "Không thể kết nối máy chủ. Vui lòng thử lại.";
    }
  }
}

async function loadLanguages(): Promise<void> {
  try {
    const res = await adminApi<{ items: LanguageOption[] }>("/api/v1/admin/languages");
    const select = getElement<HTMLSelectElement>("inputLanguage");
    const filterSelect = getElement<HTMLSelectElement>("filterLanguage");

    languagesMap.clear();
    res.items.forEach((l) => languagesMap.set(l.code, l.name));

    if (select) {
      select.replaceChildren(...res.items.map((lang) => {
        const opt = document.createElement("option");
        opt.value = lang.code;
        opt.textContent = `${lang.name} (${String(lang.code ?? "").toUpperCase()})`;
        return opt;
      }));
      if (select.value) {
        await loadTopicsForLanguage(select.value);
      }
    }

    if (filterSelect) {
      const allOpt = document.createElement("option");
      allOpt.value = "all";
      allOpt.textContent = "Tất cả ngôn ngữ";
      filterSelect.replaceChildren(allOpt, ...res.items.map((lang) => {
        const opt = document.createElement("option");
        opt.value = lang.code;
        opt.textContent = lang.name;
        return opt;
      }));
    }
  } catch (error) {
    showApiError(error);
  }
}

async function loadTopicsForLanguage(languageCode: string, selectedIds: number[] = []): Promise<void> {
  const select = getElement<HTMLSelectElement>("inputTopics");
  if (!select) return;
  select.disabled = true;

  try {
    const res = await adminApi<{ items: TopicOption[] }>(
      `/api/v1/admin/topics?language_code=${encodeURIComponent(languageCode)}`
    );
    res.items.forEach((t) => topicsMap.set(t.id, t.name));

    select.replaceChildren(...res.items.map((topic, idx) => {
      const opt = document.createElement("option");
      opt.value = String(topic.id);
      opt.textContent = topic.name;
      opt.selected = selectedIds.length > 0 ? selectedIds.includes(topic.id) : idx === 0;
      return opt;
    }));
    select.disabled = res.items.length === 0;
  } catch (error) {
    select.replaceChildren();
    select.disabled = true;
    showApiError(error);
  }
}

async function loadWords(): Promise<void> {
  try {
    const response = await adminApi<WordListResponse>(
      `/api/v1/admin/words?limit=${PAGE_SIZE}&offset=${currentPage * PAGE_SIZE}`
    );
    vocabList.splice(0, vocabList.length, ...response.items);
    totalWords = response.total;
    renderVocabTable();
    updateStats();
  } catch (error) {
    showApiError(error);
  }
}

function updateStats(): void {
  const totalCountEl = getElement("totalVocabCount");
  if (totalCountEl) totalCountEl.textContent = new Intl.NumberFormat("vi-VN").format(totalWords);
}

function renderVocabTable(): void {
  const tableBody = getElement("vocabTableBody");
  if (!tableBody) return;

  const searchTerm = getFieldValue("searchInput").toLocaleLowerCase();
  const visibleItems = vocabList.filter((item) => {
    const matchesSearch = [
      item.word,
      item.phonetic,
      item.meaning,
      item.example_sentence,
      languagesMap.get(item.language_code),
      item.level
    ].join(" ").toLocaleLowerCase().includes(searchTerm);

    const matchesLang = currentLanguageFilter === "all" || item.language_code === currentLanguageFilter;
    const matchesCefr = currentCefrFilter === "all" || item.level === currentCefrFilter;

    return matchesSearch && matchesLang && matchesCefr;
  });

  if (visibleItems.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="5" class="py-12 text-center text-slate-400">
          <span class="material-symbols-outlined text-4xl mb-2 text-slate-300 block">search_off</span>
          Không tìm thấy từ vựng nào phù hợp với bộ lọc.
        </td>
      </tr>
    `;
  } else {
    tableBody.replaceChildren(...visibleItems.map(createRow));
  }

  const tableInfo = getElement("tableInfo");
  if (tableInfo) {
    tableInfo.textContent = `Hiển thị ${visibleItems.length} từ (Trang ${currentPage + 1} / Tổng ${totalWords} từ vựng)`;
  }

  const prev = getElement<HTMLButtonElement>("prevPage");
  if (prev) prev.disabled = currentPage === 0;

  const next = getElement<HTMLButtonElement>("nextPage");
  if (next) next.disabled = (currentPage + 1) * PAGE_SIZE >= totalWords;

  const pageNum = getElement("pageNumber");
  if (pageNum) pageNum.textContent = String(currentPage + 1);
}

function createRow(item: VocabularyItem): HTMLTableRowElement {
  const tr = document.createElement("tr");
  tr.className = "hover:bg-slate-50/90 transition-colors border-b border-slate-100";

  // Word + IPA + Audio
  const tdWord = document.createElement("td");
  tdWord.className = "py-3.5 px-4 align-middle";
  const wordWrap = document.createElement("div");
  wordWrap.className = "flex items-center gap-2.5";

  if (item.audio_url) {
    const audioBtn = document.createElement("button");
    audioBtn.type = "button";
    audioBtn.className = "w-8 h-8 rounded-full bg-blue-50 text-blue-600 hover:bg-blue-600 hover:text-white flex items-center justify-center transition-all shrink-0 cursor-pointer";
    audioBtn.title = "Nghe phát âm";
    audioBtn.innerHTML = '<span class="material-symbols-outlined text-base">volume_up</span>';
    audioBtn.addEventListener("click", () => {
      new Audio(item.audio_url!).play().catch(() => playSpeech(item.word, item.language_code));
    });
    wordWrap.appendChild(audioBtn);
  } else {
    const speechBtn = document.createElement("button");
    speechBtn.type = "button";
    speechBtn.className = "w-8 h-8 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 flex items-center justify-center transition-all shrink-0";
    speechBtn.title = "Phát âm (Speech)";
    speechBtn.innerHTML = '<span class="material-symbols-outlined text-base">record_voice_over</span>';
    speechBtn.addEventListener("click", () => playSpeech(item.word, item.language_code));
    wordWrap.appendChild(speechBtn);
  }

  const textWrap = document.createElement("div");
  textWrap.className = "flex flex-col";
  const wordTitle = document.createElement("span");
  wordTitle.className = "font-bold text-slate-900 text-sm";
  wordTitle.textContent = item.word;
  textWrap.appendChild(wordTitle);

  if (item.phonetic || item.part_of_speech) {
    const meta = document.createElement("span");
    meta.className = "text-xs text-slate-500 font-mono";
    meta.textContent = [item.phonetic, item.part_of_speech ? `• ${item.part_of_speech}` : ""].filter(Boolean).join(" ");
    textWrap.appendChild(meta);
  }
  wordWrap.appendChild(textWrap);
  tdWord.appendChild(wordWrap);

  // Meaning & Example
  const tdMeaning = document.createElement("td");
  tdMeaning.className = "py-3.5 px-4 align-middle max-w-xs";
  const meaningText = document.createElement("div");
  meaningText.className = "text-sm text-slate-800 font-medium leading-snug";
  meaningText.textContent = item.meaning;
  tdMeaning.appendChild(meaningText);

  if (item.example_sentence) {
    const ex = document.createElement("div");
    ex.className = "text-xs text-slate-500 italic mt-1 truncate";
    ex.title = item.example_sentence;
    ex.textContent = `"${item.example_sentence}"`;
    tdMeaning.appendChild(ex);
  }

  // Language
  const tdLang = document.createElement("td");
  tdLang.className = "py-3.5 px-4 align-middle whitespace-nowrap";
  const langBadge = document.createElement("span");
  langBadge.className = "text-xs font-semibold text-slate-700 bg-slate-100 px-2.5 py-1 rounded-lg";
  langBadge.textContent = languagesMap.get(item.language_code) || String(item.language_code ?? "").toUpperCase();
  tdLang.appendChild(langBadge);

  // CEFR Level
  const tdLevel = document.createElement("td");
  tdLevel.className = "py-3.5 px-4 align-middle whitespace-nowrap";
  const levelBadge = document.createElement("span");
  const levelColors: Record<string, string> = {
    A1: "bg-emerald-50 text-emerald-700 border-emerald-200",
    A2: "bg-teal-50 text-teal-700 border-teal-200",
    B1: "bg-blue-50 text-blue-700 border-blue-200",
    B2: "bg-indigo-50 text-indigo-700 border-indigo-200",
    C1: "bg-purple-50 text-purple-700 border-purple-200",
    C2: "bg-rose-50 text-rose-700 border-rose-200",
  };
  levelBadge.className = `inline-flex text-xs font-bold px-2.5 py-0.5 rounded-full border ${
    levelColors[item.level] || "bg-slate-100 text-slate-700 border-slate-200"
  }`;
  levelBadge.textContent = item.level;
  tdLevel.appendChild(levelBadge);

  // Actions
  const tdActions = document.createElement("td");
  tdActions.className = "py-3.5 px-4 align-middle text-right whitespace-nowrap";
  const actionWrap = document.createElement("div");
  actionWrap.className = "flex items-center justify-end gap-1";

  // View Details
  const viewBtn = document.createElement("button");
  viewBtn.type = "button";
  viewBtn.className = "p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer";
  viewBtn.title = "Xem chi tiết";
  viewBtn.innerHTML = '<span class="material-symbols-outlined text-lg">visibility</span>';
  viewBtn.addEventListener("click", () => void showWordDetails(item.id));
  actionWrap.appendChild(viewBtn);

  // Edit
  const editBtn = document.createElement("button");
  editBtn.type = "button";
  editBtn.className = "p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer";
  editBtn.title = "Chỉnh sửa";
  editBtn.innerHTML = '<span class="material-symbols-outlined text-lg">edit</span>';
  editBtn.addEventListener("click", () => void fillFormForEdit(item.id));
  actionWrap.appendChild(editBtn);

  // Delete
  const delBtn = document.createElement("button");
  delBtn.type = "button";
  delBtn.className = "p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer";
  delBtn.title = "Xóa";
  delBtn.innerHTML = '<span class="material-symbols-outlined text-lg">delete</span>';
  delBtn.addEventListener("click", () => openDeleteModal(item.id));
  actionWrap.appendChild(delBtn);

  tdActions.appendChild(actionWrap);
  tr.append(tdWord, tdMeaning, tdLang, tdLevel, tdActions);
  return tr;
}

function playSpeech(text: string, langCode: string): void {
  if (!("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  const langMap: Record<string, string> = {
    en: "en-US",
    ja: "ja-JP",
    ko: "ko-KR",
    zh: "zh-CN",
    vi: "vi-VN",
  };
  utterance.lang = langMap[langCode] || "en-US";
  window.speechSynthesis.speak(utterance);
}

async function fillFormForEdit(wordId: number): Promise<void> {
  try {
    const res = await adminApi<{ word: VocabularyItem }>(`/api/v1/admin/words/${wordId}`);
    const w = res.word;

    const setVal = (id: string, val: string | null) => {
      const el = getElement<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(id);
      if (el) el.value = val ?? "";
    };

    setVal("inputWord", w.word);
    setVal("inputIpa", w.phonetic);
    setVal("inputMeaning", w.meaning);
    setVal("inputExample", w.example_sentence);
    setVal("inputExampleMeaning", w.example_meaning);
    setVal("inputLanguage", w.language_code);
    setVal("inputDifficulty", w.level);
    setVal("inputPartOfSpeech", w.part_of_speech);
    setVal("inputAudioUrl", w.audio_url);

    await loadTopicsForLanguage(w.language_code, w.topic_ids || []);

    const editIndexEl = getElement<HTMLInputElement>("editWordId");
    if (editIndexEl) editIndexEl.value = String(wordId);

    const formTitle = getElement("vocabFormTitle");
    if (formTitle) formTitle.textContent = "Chỉnh sửa Từ Vựng";
    const btnText = getElement("btnSubmitText");
    if (btnText) btnText.textContent = "Cập nhật Từ Vựng";
    getElement("btnCancelEdit")?.classList.remove("hidden");

    getElement("vocabFormContainer")?.scrollIntoView({ behavior: "smooth", block: "start" });
    document.getElementById("inputWord")?.focus();
  } catch (err) {
    showApiError(err);
  }
}

function resetForm(): void {
  const form = getElement<HTMLFormElement>("vocabForm");
  form?.reset();

  const editIndexEl = getElement<HTMLInputElement>("editWordId");
  if (editIndexEl) editIndexEl.value = "-1";

  const formTitle = getElement("vocabFormTitle");
  if (formTitle) formTitle.textContent = "Thêm Từ Vựng Mới";
  const btnText = getElement("btnSubmitText");
  if (btnText) btnText.textContent = "Lưu Từ Vựng";
  getElement("btnCancelEdit")?.classList.add("hidden");

  const langSelect = getElement<HTMLSelectElement>("inputLanguage");
  if (langSelect && langSelect.value) {
    void loadTopicsForLanguage(langSelect.value);
  }
}

async function showWordDetails(wordId: number): Promise<void> {
  try {
    const res = await adminApi<{ word: VocabularyItem }>(`/api/v1/admin/words/${wordId}`);
    const w = res.word;

    const titleEl = getElement("detailTitle");
    if (titleEl) titleEl.textContent = w.word;

    const subtitleEl = getElement("detailSubtitle");
    if (subtitleEl) {
      subtitleEl.textContent = [
        languagesMap.get(w.language_code) || String(w.language_code ?? "").toUpperCase(),
        w.phonetic,
        `CEFR ${w.level}`,
        w.part_of_speech,
      ].filter(Boolean).join(" • ");
    }

    const bodyEl = getElement("detailBody");
    if (bodyEl) {
      const rows: Array<[string, string]> = [
        ["Định nghĩa tiếng Việt", w.meaning],
        ["Ví dụ minh họa", w.example_sentence || "—"],
        ["Dịch câu ví dụ", w.example_meaning || "—"],
        ["URL âm thanh chuẩn", w.audio_url || "—"],
      ];

      bodyEl.replaceChildren(...rows.map(([label, val]) => {
        const wrap = document.createElement("div");
        wrap.className = "p-3 bg-slate-50 rounded-xl";
        wrap.innerHTML = `
          <dt class="text-xs font-bold text-slate-500 uppercase tracking-wider">${label}</dt>
          <dd class="mt-1 text-sm text-slate-900 font-medium">${val}</dd>
        `;
        return wrap;
      }));
    }

    const modal = getElement("detailModal");
    modal?.classList.remove("hidden");
  } catch (err) {
    showApiError(err);
  }
}

function openDeleteModal(wordId: number): void {
  pendingDeleteId = wordId;
  const modal = getElement("deleteConfirmModal");
  modal?.classList.remove("hidden");
}

function closeDeleteModal(): void {
  pendingDeleteId = null;
  getElement("deleteConfirmModal")?.classList.add("hidden");
}

async function confirmDelete(): Promise<void> {
  if (pendingDeleteId === null) return;
  const wordId = pendingDeleteId;
  const btn = getElement<HTMLButtonElement>("btnConfirmDelete");
  if (btn) btn.disabled = true;

  try {
    await adminApi(`/api/v1/admin/words/${wordId}`, { method: "DELETE" });
    closeDeleteModal();
    if (getFieldValue("editWordId") === String(wordId)) resetForm();
    await loadWords();
    showToast("Đã xóa từ vựng thành công.", "success");
  } catch (err) {
    showApiError(err);
  } finally {
    if (btn) btn.disabled = false;
  }
}

function setupEventListeners(): void {
  // Search
  getElement("searchInput")?.addEventListener("input", renderVocabTable);

  // Filters
  getElement("filterLanguage")?.addEventListener("change", (e) => {
    currentLanguageFilter = (e.target as HTMLSelectElement).value;
    renderVocabTable();
  });

  getElement("filterCefr")?.addEventListener("change", (e) => {
    currentCefrFilter = (e.target as HTMLSelectElement).value;
    renderVocabTable();
  });

  // Language change in form -> reload topics
  getElement("inputLanguage")?.addEventListener("change", (e) => {
    const lang = (e.target as HTMLSelectElement).value;
    void loadTopicsForLanguage(lang);
  });

  // Form submit
  getElement("vocabForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();

    const word = getFieldValue("inputWord");
    const meaning = getFieldValue("inputMeaning");
    if (!word || !meaning) {
      showToast("Vui lòng nhập từ và định nghĩa.", "error");
      return;
    }

    const topicSelect = getElement<HTMLSelectElement>("inputTopics");
    const topicIds = topicSelect
      ? Array.from(topicSelect.selectedOptions, (opt) => Number(opt.value)).filter((n) => Number.isInteger(n) && n > 0)
      : [];

    if (topicIds.length === 0) {
      showToast("Vui lòng chọn ít nhất một chủ đề liên kết.", "error");
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

    const editId = Number(getFieldValue("editWordId"));
    const isEditing = Number.isInteger(editId) && editId > 0;
    const submitBtn = getElement<HTMLButtonElement>("btnSubmitWord");
    if (submitBtn) submitBtn.disabled = true;

    try {
      if (isEditing) {
        await adminApi(`/api/v1/admin/words/${editId}`, { method: "PUT", body: payload });
        showToast("Cập nhật từ vựng thành công!", "success");
      } else {
        await adminApi("/api/v1/admin/words", { method: "POST", body: payload });
        currentPage = 0;
        showToast("Thêm từ vựng mới thành công!", "success");
      }
      resetForm();
      await loadWords();
    } catch (err) {
      showApiError(err);
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  });

  // Reset / Cancel Edit
  getElement("btnCancelEdit")?.addEventListener("click", resetForm);
  getElement("btnResetForm")?.addEventListener("click", resetForm);

  // Pagination
  getElement("prevPage")?.addEventListener("click", () => {
    if (currentPage > 0) {
      currentPage -= 1;
      void loadWords();
    }
  });

  getElement("nextPage")?.addEventListener("click", () => {
    if ((currentPage + 1) * PAGE_SIZE < totalWords) {
      currentPage += 1;
      void loadWords();
    }
  });

  // Modals
  getElement("detailCloseBtn")?.addEventListener("click", () => {
    getElement("detailModal")?.classList.add("hidden");
  });
  getElement("detailModal")?.addEventListener("click", (e) => {
    if (e.target === e.currentTarget) getElement("detailModal")?.classList.add("hidden");
  });

  getElement("btnCancelDelete")?.addEventListener("click", closeDeleteModal);
  getElement("btnConfirmDelete")?.addEventListener("click", () => void confirmDelete());
  getElement("deleteConfirmModal")?.addEventListener("click", (e) => {
    if (e.target === e.currentTarget) closeDeleteModal();
  });

  // Logout
  getElement("adminLogoutBtn")?.addEventListener("click", () => {
    void logoutAdmin();
  });
}

function showApiError(err: unknown): void {
  const msg = err instanceof ApiError || err instanceof Error ? err.message : "Đã xảy ra lỗi kết nối.";
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
  document.addEventListener("DOMContentLoaded", () => void initVocabularyPage(), { once: true });
} else {
  void initVocabularyPage();
}