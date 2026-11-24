import { initializeLearnerHeader } from "../shared/learner-header";
import { getAuthCookie, isLearnerAuthenticated, slanguageApi } from "../shared/api-client";
import { clearSkeleton, showSkeleton } from "../shared/skeleton";
import { applyI18n, localeLabel, t, LOCALE_EVENT } from "../shared/i18n";

type Period = "today" | "week" | "month" | "all";
type Sort = "xp" | "streak" | "lessons" | "accuracy";
type Language = "all" | "ja" | "en" | "vi";

interface LeaderboardEntry {
  rank: number;
  user_id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  target_language: string;
  xp: number;
  current_streak: number;
  lessons_completed: number;
  accuracy: number;
  is_current_user: boolean;
}

interface LeaderboardResult {
  items: LeaderboardEntry[];
  total: number;
  current_user: { rank: number; xp: number } | null;
  period: Period;
  as_of: string;
}

class LeaderboardApp {
  private readonly pageSize = 6;
  private period: Period = "week";
  private sort: Sort = "xp";
  private language: Language = "all";
  private search = "";
  private page = 0;
  private debounceTimer: number | undefined;
  private result: LeaderboardResult | null = null;
  private readonly tableBody = document.getElementById("leaderboardTableBody");
  private readonly status = this.createStatusElement();

  constructor() {
    void initializeLearnerHeader();
    window.addEventListener(LOCALE_EVENT, () => {
      applyI18n();
      this.renderFilterLabels();
      if (this.result) {
        this.render();
      } else {
        const sticky = document.getElementById("stickyUserText");
        if (sticky) sticky.textContent = t("lb.stickyLoading");
      }
    });
    this.bindEvents();
    this.renderFilterLabels();
    const sticky = document.getElementById("stickyUserText");
    if (sticky && isLearnerAuthenticated()) sticky.textContent = t("lb.stickyLoading");
    if (!isLearnerAuthenticated()) {
      // Khách chưa đăng nhập: ẩn thanh "bạn ở hạng X"
      document.getElementById("userStickyBar")?.setAttribute("hidden", "");
    }
    void this.load();
  }

  private createStatusElement(): HTMLElement {
    const status = document.createElement("p");
    status.id = "leaderboardStatus";
    status.setAttribute("role", "status");
    status.textContent = t("lb.loading");
    document.querySelector(".leaderboard-main")?.prepend(status);
    return status;
  }

  private bindEvents(): void {
    document.querySelectorAll<HTMLButtonElement>("[data-time-filter]").forEach((button) => {
      button.addEventListener("click", () => {
        this.period = button.dataset.timeFilter as Period;
        this.setActive("[data-time-filter]", button);
        this.refreshFromFirstPage();
      });
    });
    document.querySelectorAll<HTMLButtonElement>("[data-sort-filter]").forEach((button) => {
      button.addEventListener("click", () => {
        this.sort = button.dataset.sortFilter as Sort;
        this.setActive("[data-sort-filter]", button);
        this.refreshFromFirstPage();
      });
    });
    document.querySelectorAll<HTMLButtonElement>("[data-lang-tab]").forEach((button) => {
      button.addEventListener("click", () => {
        this.language = button.dataset.langTab as Language;
        this.setActive("[data-lang-tab]", button);
        this.refreshFromFirstPage();
      });
    });

    const search = document.getElementById("leaderboardSearchInput") as HTMLInputElement | null;
    search?.addEventListener("input", () => {
      this.search = search.value.trim();
      window.clearTimeout(this.debounceTimer);
      this.debounceTimer = window.setTimeout(() => this.refreshFromFirstPage(), 250);
    });

    document.getElementById("prevPageBtn")?.addEventListener("click", () => {
      if (this.page > 0) {
        this.page--;
        void this.load();
      }
    });
    document.getElementById("nextPageBtn")?.addEventListener("click", () => {
      if (this.result && (this.page + 1) * this.pageSize < this.result.total) {
        this.page++;
        void this.load();
      }
    });
    document.getElementById("btnScrollToMe")?.addEventListener("click", () => {
      const currentRow = this.tableBody?.querySelector(".current-user");
      if (currentRow) {
        currentRow.scrollIntoView({ behavior: "smooth", block: "center" });
        return;
      }
      const name = getAuthCookie("slanguage_user_name") || "";
      const searchInput = document.getElementById("leaderboardSearchInput") as HTMLInputElement | null;
      if (searchInput && name) {
        searchInput.value = name;
        this.search = name;
        this.refreshFromFirstPage();
      } else {
        this.showMessage(t("lb.notOnPage"));
      }
    });
  }

  private async load(): Promise<void> {
    this.setLoading(true);
    showSkeleton(this.tableBody, "lb-rows", { tone: "dark", count: this.pageSize });
    for (const id of ["podiumTop1", "podiumTop2", "podiumTop3"]) {
      showSkeleton(id, "podium", { tone: "dark" });
    }
    const query = new URLSearchParams({
      period: this.period,
      language: this.language,
      sort: this.sort,
      limit: String(this.pageSize),
      offset: String(this.page * this.pageSize),
    });
    if (this.search) query.set("search", this.search);

    try {
      const response = await slanguageApi<LeaderboardResult>(`/api/v1/leaderboard?${query}`);
      this.result = response.data;
      this.render();
      this.status.textContent = "";
    } catch (error) {
      clearSkeleton(this.tableBody);
      for (const id of ["podiumTop1", "podiumTop2", "podiumTop3"]) {
        clearSkeleton(id);
      }
      this.showMessage(error instanceof Error ? error.message : t("lb.loadError"));
    } finally {
      this.setLoading(false);
    }
  }

  private render(): void {
    if (!this.result) return;
    const items = this.result.items;
    const top = this.page === 0 ? items.slice(0, 3) : [];
    this.renderPodium(top);
    this.renderRows(items);
    this.renderSummary(items);
    this.renderCurrentUser();
    this.renderPagination();
  }

  private renderPodium(items: LeaderboardEntry[]): void {
    const places = [
      { id: "podiumTop1", entry: items[0], place: "top-1" },
      { id: "podiumTop2", entry: items[1], place: "top-2" },
      { id: "podiumTop3", entry: items[2], place: "top-3" },
    ];
    for (const { id, entry, place } of places) {
      const container = document.getElementById(id);
      if (!container) continue;
      clearSkeleton(container);
      container.innerHTML = entry
        ? `<article class="podium-card ${place}${entry.is_current_user ? " current-user" : ""}">
            <div class="podium-crown-badge">#${entry.rank}</div>
            <div class="podium-avatar-box">${this.avatar(entry, "podium-avatar")}</div>
            <div class="podium-info">
              <strong class="podium-name">${this.escape(entry.display_name)}</strong>
              <span class="podium-title-tag">${this.languageName(entry.target_language)}</span>
              <span class="podium-xp-pill">${this.format(entry.xp)} XP</span>
              <div class="podium-stats-grid">
                <span class="p-stat"><strong class="p-val">${this.format(entry.current_streak)}</strong><small class="p-lbl">${t("lb.streakDays")}</small></span>
                <span class="p-stat"><strong class="p-val">${this.format(entry.lessons_completed)}</strong><small class="p-lbl">${t("lb.lessonsLabel")}</small></span>
                <span class="p-stat"><strong class="p-val">${this.format(entry.accuracy)}%</strong><small class="p-lbl">${t("lb.accuracyLabel")}</small></span>
              </div>
            </div>
          </article>`
        : "";
    }
  }

  private renderRows(items: LeaderboardEntry[]): void {
    if (!this.tableBody) return;
    clearSkeleton(this.tableBody);
    this.tableBody.innerHTML = items.length
      ? items.map((entry) => `<div class="table-row${entry.rank <= 3 ? ` rank-${entry.rank}` : ""}${entry.is_current_user ? " current-user" : ""}">
          <div class="col-rank"><span class="rank-num">#${entry.rank}</span></div>
          <div class="col-learner">
            <div class="learner-meta-wrap">
              ${this.avatar(entry, "learner-avatar")}
              <div class="learner-text-wrap">
                <div class="learner-name-line"><strong class="learner-name">${this.escape(entry.display_name)}</strong></div>
                <span class="learner-sub-title">@${this.escape(entry.username)}</span>
              </div>
            </div>
          </div>
          <div class="col-language"><span class="language-pill-tag">${this.languageName(entry.target_language)}</span></div>
          <div class="col-level"><span class="level-chip">${t("lb.lessonsCount", { count: this.format(entry.lessons_completed) })}</span></div>
          <div class="col-streak">
            <span class="streak-chip-mini"><i class="fa-solid fa-fire fire-icon"></i>${this.format(entry.current_streak)}</span>
            <span class="accuracy-score">${this.format(entry.accuracy)}%</span>
          </div>
          <div class="col-xp"><span class="xp-number">${this.format(entry.xp)} XP</span></div>
          <div class="col-action">${entry.is_current_user ? t("lb.you") : "—"}</div>
        </div>`).join("")
      : `<p class="empty-state">${t("lb.empty")}</p>`;
  }

  private renderSummary(items: LeaderboardEntry[]): void {
    const leader = this.page === 0 ? items[0] : undefined;
    this.setText(
      "championNameVal",
      leader?.display_name || (this.page === 0 ? t("lb.noData") : "—"),
    );
    const metric = leader
      ? {
          xp: `${this.format(leader.xp)} XP`,
          streak: t("lb.daysCount", { count: this.format(leader.current_streak) }),
          lessons: t("lb.lessonsCount", { count: this.format(leader.lessons_completed) }),
          accuracy: `${this.format(leader.accuracy)}%`,
        }[this.sort]
      : "—";
    this.setText("topScoreVal", metric);
    this.setText("totalParticipantsVal", t("lb.learnersCount", { count: this.format(this.result?.total ?? 0) }));
    const championSubtitle = document.querySelector<HTMLElement>("#championNameVal + .summary-sub");
    if (championSubtitle) {
      championSubtitle.textContent = leader ? this.languageName(leader.target_language) : "—";
    }
    const scoreSubtitle = document.querySelector<HTMLElement>("#topScoreVal + .summary-sub");
    if (scoreSubtitle) scoreSubtitle.textContent = leader ? t("lb.byCriteria", { sort: this.sortLabel() }) : "—";
    this.renderFilterLabels();
  }

  private renderFilterLabels(): void {
    const sectionTitle = document.querySelector<HTMLElement>(".detailed-table-section .section-header-title span");
    if (sectionTitle) sectionTitle.textContent = t("lb.tableTitle", { sort: this.sortLabel() });
    const labels: Record<Language, string> = {
      all: t("lb.langAll"),
      ja: t("lb.langJa"),
      en: t("lb.langEn"),
      vi: t("lb.langVi"),
    };
    document.querySelectorAll<HTMLElement>("[data-lang-tab]").forEach((button) => {
      button.textContent = labels[button.dataset.langTab as Language] ?? t("lb.langAll");
    });
  }

  private renderCurrentUser(): void {
    if (!isLearnerAuthenticated()) return;
    const sticky = document.getElementById("stickyUserText");
    if (!sticky || !this.result) return;
    const currentUser = this.result.current_user;
    sticky.textContent = currentUser
      ? t("lb.stickyRank", {
          rank: currentUser.rank,
          name: getAuthCookie("slanguage_user_name") || t("lb.you"),
          xp: this.format(currentUser.xp),
        })
      : t("lb.stickyNone");
  }

  private renderPagination(): void {
    const total = this.result?.total ?? 0;
    const pageCount = Math.ceil(total / this.pageSize);
    const pageNumbers = document.getElementById("pageNumbersGroup");
    if (pageNumbers) pageNumbers.textContent = pageCount ? `${this.page + 1} / ${pageCount}` : "0 / 0";
    const previous = document.getElementById("prevPageBtn") as HTMLButtonElement | null;
    const next = document.getElementById("nextPageBtn") as HTMLButtonElement | null;
    if (previous) previous.disabled = this.page === 0;
    if (next) next.disabled = (this.page + 1) * this.pageSize >= total;
  }

  private refreshFromFirstPage(): void {
    this.page = 0;
    void this.load();
  }

  private setActive(selector: string, activeButton: HTMLButtonElement): void {
    document.querySelectorAll(selector).forEach((button) => button.classList.remove("active"));
    activeButton.classList.add("active");
  }

  private setLoading(loading: boolean): void {
    if (loading) {
      document.querySelectorAll<HTMLButtonElement>("#prevPageBtn, #nextPageBtn").forEach((button) => {
        button.disabled = true;
      });
    } else {
      this.renderPagination();
    }
  }

  private showMessage(message: string): void {
    this.status.textContent = message;
    this.status.setAttribute("role", "alert");
  }

  private avatar(entry: LeaderboardEntry, className: string): string {
    const url = entry.avatar_url?.startsWith("https://") ? entry.avatar_url : "";
    return url
      ? `<img class="${className}" src="${this.escape(url)}" alt="" loading="lazy">`
      : `<span class="${className} avatar-placeholder" aria-hidden="true">${this.escape(entry.display_name.slice(0, 1).toUpperCase())}</span>`;
  }

  private languageName(code: string): string {
    return ["ja", "en", "vi"].includes(code) ? localeLabel(code) : code.toUpperCase();
  }

  private sortLabel(): string {
    const labels: Record<Sort, string> = {
      xp: t("lb.sortLabelXp"),
      streak: t("lb.sortLabelStreak"),
      lessons: t("lb.sortLabelLessons"),
      accuracy: t("lb.sortLabelAccuracy"),
    };
    return labels[this.sort];
  }

  private setText(id: string, value: string): void {
    const element = document.getElementById(id);
    if (element) element.textContent = value;
  }

  private format(value: number): string {
    return value.toLocaleString("vi-VN");
  }

  private escape(value: string): string {
    return value.replace(/[&<>"']/g, (character) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    })[character] ?? character);
  }
}

new LeaderboardApp();
