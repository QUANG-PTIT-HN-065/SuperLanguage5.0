import Chart from "chart.js/auto";
import { adminApi, ApiError, ForbiddenError, logoutAdmin, requireAdminSession } from "./auth";

export interface TopicItem {
  id: number;
  language_code: string;
  name: string;
  description: string | null;
  icon_url: string | null;
  sort_order: number;
  word_count?: number;
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
}

interface OverviewStats {
  total_students: number;
  total_words: number;
  total_topics: number;
  total_xp: number;
  max_streak: number;
  language_distribution: Record<string, number>;
}

const languagesMap = new Map<string, string>();
let topicsList: TopicItem[] = [];
let usersList: UserItem[] = [];
let activeTab = "dashboard";
let currentTopicFilterLang = "all";
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

    // Nạp dữ liệu thật từ Backend Supabase
    await loadLanguages();
    await Promise.all([
      loadDashboardStats(),
      loadTopics(),
      loadUsers(),
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
    showApiError(err);
  }
}

function renderTopicsTable(): void {
  const tableBody = getElement("topicsTableBody");
  if (!tableBody) return;

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
 * 3. NẠP DANH SÁCH NGƯỜI DÙNG THẬT TỪ CSDL
 */
async function loadUsers(): Promise<void> {
  try {
    const res = await adminApi<{ items: UserItem[]; total: number }>("/api/v1/admin/users?limit=50&offset=0");
    usersList = res.items || [];
    renderUsersTable();
  } catch (err) {
    console.warn("Không thể tải danh sách người dùng:", err);
  }
}

function renderUsersTable(): void {
  const tbody = getElement("usersTableBody");
  if (!tbody) return;

  if (usersList.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" class="py-10 text-center text-slate-400">
          Chưa có người dùng nào trong cơ sở dữ liệu.
        </td>
      </tr>
    `;
    return;
  }

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
    tdStatus.innerHTML = user.status === "active"
      ? '<span class="inline-flex items-center gap-1 text-xs text-emerald-700 font-semibold"><span class="w-2 h-2 rounded-full bg-emerald-500"></span>Hoạt động</span>'
      : '<span class="inline-flex items-center gap-1 text-xs text-rose-700 font-semibold"><span class="w-2 h-2 rounded-full bg-rose-500"></span>Tạm khóa</span>';

    tr.append(tdUser, tdLang, tdPlan, tdStats, tdStatus);
    return tr;
  }));

  const userBadge = getElement("totalUsersBadge");
  if (userBadge) userBadge.textContent = `${usersList.length} tài khoản`;
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

    if (topicLangSelect) {
      topicLangSelect.replaceChildren(...res.items.map((l) => {
        const opt = document.createElement("option");
        opt.value = l.code;
        opt.textContent = `${l.name} (${String(l.code ?? "").toUpperCase()})`;
        return opt;
      }));
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
        users: "Quản Trị Học Viên & Người Dùng",
        analytics: "Thống Kê Báo Cáo Chuyên Sâu",
        settings: "Cài Đặt Hệ Thống & Phân Quyền",
      };
      pageTitle.textContent = titles[tabName] || "Dashboard";
    }

    if (tabName === "dashboard" && chartInstance) {
      chartInstance.resize();
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
  if (hash && ["dashboard", "topics", "users", "analytics", "settings"].includes(hash)) {
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