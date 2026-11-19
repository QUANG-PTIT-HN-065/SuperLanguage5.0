/**
 * Slanguage - Select Lesson Module (Lựa chọn buổi học / Session)
 * Session Grid from Database topics with Premium gate for Learning Roadmap
 */

import { isLearnerAuthenticated, slanguageApi } from "../shared/api-client";
import { initializeLearnerHeader, logoutLearner, renderLearnerHeader } from "../shared/learner-header";
import { readHearts } from "../shared/hearts";
import { clearSkeleton, showSkeleton } from "../shared/skeleton";
import "../home/lesson-quiz";

type TargetLang = 'ja' | 'en' | 'vi';
type SessionTier = 'basic' | 'intermediate' | 'advanced' | 'master' | 'extension';

interface SessionData {
  id: number;
  numStr: string;
  tier: SessionTier;
  tierLabel: string;
  icon: string;
  title: Record<TargetLang, string>;
  desc: Record<TargetLang, string>;
  vocabCount: number;
  grammarCount: number;
  xpReward: number;
  topicId?: number;
  locked?: boolean;
  completed?: boolean;
}

interface LanguageMeta {
  code: TargetLang;
  name: string;
  flag: string;
}

class SelectLessonManager {
  private currentLang: TargetLang = 'ja';
  private selectedLessonId: number | null = null;
  private dbPathId: number | null = null;
  private isPremiumUser = false;
  // Số chủ đề nửa đầu miễn phí — nửa sau cần Premium
  private freeSessionCount = 0;
  private currentFilter: string = 'all';
  private searchQuery: string = '';

  private readonly langMetadata: Record<TargetLang, LanguageMeta> = {
    ja: { code: 'ja', name: 'Tiếng Nhật', flag: '../../../assets/flags/flag-jp.png' },
    en: { code: 'en', name: 'English', flag: '../../../assets/flags/flag-en.png' },
    vi: { code: 'vi', name: 'Tiếng Việt', flag: '../../../assets/flags/flag-vn.png' }
  };

  private sessionsList: SessionData[] = [];

  // DOM Elements
  private sessionsGridEl!: HTMLElement;
  private statusLessonTextEl!: HTMLElement;
  private selectionStatusCardEl!: HTMLElement;
  private statusIconEl!: HTMLElement;
  private btnProceedRoadmapEl!: HTMLButtonElement;
  private targetLangChipEl!: HTMLElement;
  private searchInputEl!: HTMLInputElement;
  private filterTabsEl!: HTMLElement;
  private toastEl!: HTMLElement;
  private toastTextEl!: HTMLElement;
  private currentLangFlagEl!: HTMLImageElement;
  private currentLangLabelEl!: HTMLElement;
  private langDropdownEl!: HTMLElement;
  private langDropdownBtnEl!: HTMLButtonElement;
  private userDropdownEl!: HTMLElement;
  private userDropdownBtnEl!: HTMLButtonElement;

  constructor() {
    if (localStorage.getItem('slanguage_is_logged_in') !== 'true') {
      window.location.replace('../login/index.html');
      return;
    }
    this.initDOM();
    this.loadUserData();
    this.bindEvents();
    this.applyCurrentLanguage();
    if (isLearnerAuthenticated()) {
      showSkeleton(this.sessionsGridEl, 'session-cards', { tone: 'dark', count: 8 });
      void this.loadDatabaseCatalog();
    } else {
      this.renderSessions();
    }
    this.updateStatusCard();
    void initializeLearnerHeader({ bindControls: false, loadProfile: false });
    document.body.dataset.pageState = "ready";
    window.dispatchEvent(new Event("learning:ready"));
  }

  private async loadDatabaseCatalog(): Promise<void> {
    try {
      const me = await slanguageApi('/api/v1/me');
      renderLearnerHeader(me.data);
      const meData = (me.data ?? {}) as Record<string, unknown>;
      const profile = (meData.profile ?? meData) as Record<string, unknown>;
      const profileLang = String(profile.target_language ?? '') as TargetLang;
      if (['ja', 'en', 'vi'].includes(profileLang) && profileLang !== this.currentLang) {
        this.currentLang = profileLang;
        this.applyCurrentLanguage();
      }
      this.isPremiumUser = String(profile.plan_id ?? '') === 'premium' || localStorage.getItem('slanguage_is_premium') === 'true';
      const pathsResponse = await slanguageApi('/api/v1/vocabulary/learning-paths');
      const paths = Array.isArray(pathsResponse.data) ? pathsResponse.data as Record<string, unknown>[] : [];
      const path = paths.find((item) => item.language_code === this.currentLang) ?? paths[0];
      const pathId = Number(path?.id);
      if (!pathId) {
        this.showToast('Chưa có lộ trình để học');
        this.renderSessions();
        return;
      }
      const detail = await slanguageApi(`/api/v1/vocabulary/learning-paths/${pathId}`);
      const detailData = (detail.data ?? {}) as Record<string, unknown>;
      const topics = Array.isArray(detailData.topics) ? detailData.topics as Record<string, unknown>[] : [];
      if (!topics.length) {
        this.showToast('Chưa có lộ trình để học');
        this.renderSessions();
        return;
      }
      this.dbPathId = pathId;
      this.sessionsList = topics.map((topic) => this.sessionFromTopic(topic, topics.length));
      // Nửa đầu miễn phí, nửa sau cần Premium — khoá theo vị trí, không theo tiến độ quiz
      this.freeSessionCount = Math.ceil(this.sessionsList.length / 2);
      this.sessionsList.forEach((session, index) => {
        session.locked = !this.isPremiumUser && index >= this.freeSessionCount;
      });
      this.renderFilterTabs();
      this.updateSessionCount();
      this.selectedLessonId = null;
      this.renderSessions();
      this.updateStatusCard();
    } catch (error) {
      this.showToast(error instanceof Error ? error.message : 'Không thể tải lộ trình từ Database.');
      this.renderSessions();
    }
  }

  private sessionFromTopic(topic: Record<string, unknown>, total: number): SessionData {
    const order = Number(topic.sort_order) || 0;
    const num = Math.max(1, Math.round(order / 10));
    // Chia nhóm theo số chủ đề thật của lộ trình, không cố định 4/8/12/16
    const groups = total > 16 ? 5 : 4;
    const groupSize = Math.max(1, Math.ceil(total / groups));
    const tierOrder: SessionTier[] = groups === 5
      ? ['basic', 'intermediate', 'advanced', 'master', 'extension']
      : ['basic', 'intermediate', 'advanced', 'master'];
    const tier = tierOrder[Math.min(groups - 1, Math.floor((num - 1) / groupSize))];
    const tierLabel = { basic: 'Cơ bản', intermediate: 'Giao tiếp', advanced: 'Nâng cao', master: 'Chuyên sâu', extension: 'Mở rộng' }[tier];
    const icon = { basic: 'fa-pen-nib', intermediate: 'fa-comments', advanced: 'fa-briefcase', master: 'fa-crown', extension: 'fa-rocket' }[tier];
    const name = String(topic.name ?? `Chủ đề ${num}`);
    const desc = String(topic.description ?? '');
    return {
      id: Number(topic.id),
      numStr: String(num).padStart(2, '0'),
      tier,
      tierLabel,
      icon,
      title: { ja: name, en: name, vi: name },
      desc: { ja: desc, en: desc, vi: desc },
      vocabCount: Number(topic.word_count) || 0,
      grammarCount: 0,
      xpReward: 0,
      topicId: Number(topic.id),
      locked: topic.is_locked === true,
      completed: topic.is_completed === true,
    };
  }

  private initDOM(): void {
    this.sessionsGridEl = document.getElementById('sessionsGrid') as HTMLElement;
    this.statusLessonTextEl = document.getElementById('statusLessonText') as HTMLElement;
    this.selectionStatusCardEl = document.getElementById('selectionStatusCard') as HTMLElement;
    this.statusIconEl = document.getElementById('statusIcon') as HTMLElement;
    this.btnProceedRoadmapEl = document.getElementById('btnProceedRoadmap') as HTMLButtonElement;
    this.targetLangChipEl = document.getElementById('targetLangChip') as HTMLElement;
    this.searchInputEl = document.getElementById('lessonSearchInput') as HTMLInputElement;
    this.filterTabsEl = document.getElementById('filterTabs') as HTMLElement;
    this.toastEl = document.getElementById('sessionToast') as HTMLElement;
    this.toastTextEl = document.getElementById('toastText') as HTMLElement;

    this.currentLangFlagEl = document.getElementById('currentLangFlag') as HTMLImageElement;
    this.currentLangLabelEl = document.getElementById('currentLangLabel') as HTMLElement;
    this.langDropdownEl = document.getElementById('langDropdown') as HTMLElement;
    this.langDropdownBtnEl = document.getElementById('langDropdownBtn') as HTMLButtonElement;
    this.userDropdownEl = document.getElementById('userDropdown') as HTMLElement;
    this.userDropdownBtnEl = document.getElementById('userDropdownBtn') as HTMLButtonElement;
  }

  private loadUserData(): void {
    const rawNative = (localStorage.getItem('slanguage_native_language') || 'vi').toLowerCase();
    const nativeLang = rawNative.includes('vi') || rawNative.includes('việt') ? 'vi' : (rawNative.includes('en') || rawNative.includes('anh') ? 'en' : (rawNative.includes('ja') || rawNative.includes('nhật') ? 'ja' : 'vi'));

    let savedLang = (localStorage.getItem('slanguage_current_lang') || localStorage.getItem('slanguage_active_language') || 'ja') as TargetLang;
    if (savedLang === nativeLang) {
      savedLang = (nativeLang === 'vi' ? 'ja' : (nativeLang === 'ja' ? 'en' : 'ja')) as TargetLang;
      localStorage.setItem('slanguage_current_lang', savedLang);
      localStorage.setItem('slanguage_active_language', savedLang);
    }
    if (savedLang && ['ja', 'en', 'vi'].includes(savedLang)) {
      this.currentLang = savedLang;
    }

    document.querySelectorAll<HTMLElement>('.lang-dropdown-item').forEach(item => {
      if (item.getAttribute('data-lang') === nativeLang) {
        item.style.display = 'none';
      } else {
        item.style.display = 'flex';
      }
    });

    // Header XP
    const userXP = localStorage.getItem('slanguage_user_xp') || '2,450 XP';
    const xpEl = document.getElementById('headerXPVal');
    if (xpEl) xpEl.textContent = userXP.includes('XP') ? userXP : `${userXP} XP`;

    // Header Hearts
    const userHearts = String(readHearts());
    const heartsEl = document.getElementById('headerHeartsVal');
    if (heartsEl) heartsEl.textContent = `${userHearts}/5`;

    // Current User profile
    const rawUser = localStorage.getItem('slanguage_current_user');
    if (rawUser) {
      try {
        const u = JSON.parse(rawUser);
        const nameEl = document.getElementById('headerUserName');
        if (nameEl && u.name) nameEl.textContent = u.name;
        const avatarEl = document.getElementById('headerAvatar') as HTMLImageElement;
        if (avatarEl && u.avatar) avatarEl.src = u.avatar;
      } catch (e) {
        // use default
      }
    }

    // Check if a lesson was previously chosen
    const rawLesson = localStorage.getItem('slanguage_selected_lesson');
    if (rawLesson) {
      try {
        const parsed = JSON.parse(rawLesson);
        if (parsed && typeof parsed.id === 'number') {
          this.selectedLessonId = parsed.id;
        }
      } catch (e) {
        // not set
      }
    }
  }

  private bindEvents(): void {
    // Language Dropdown
    this.langDropdownBtnEl.addEventListener('click', (e) => {
      e.stopPropagation();
      this.langDropdownEl.classList.toggle('open'); this.langDropdownEl.classList.toggle('show');
    });

    document.querySelectorAll('.lang-dropdown-item').forEach((item) => {
      item.addEventListener('click', (e) => {
        const lang = (e.currentTarget as HTMLElement).getAttribute('data-lang') as TargetLang;
        if (lang) {
          this.switchLanguage(lang);
        }
      });
    });

    // User Dropdown
    this.userDropdownBtnEl.addEventListener('click', (e) => {
      e.stopPropagation();
      this.userDropdownEl.classList.toggle('open'); this.userDropdownEl.classList.toggle('show');
    });

    // Close Dropdowns on outside click
    document.addEventListener('click', (e) => {
      if (!this.langDropdownEl.contains(e.target as Node)) {
        this.langDropdownEl.classList.remove('open'); this.langDropdownEl.classList.remove('show');
      }
      if (!this.userDropdownEl.contains(e.target as Node)) {
        this.userDropdownEl.classList.remove('open'); this.userDropdownEl.classList.remove('show');
      }
    });

    // Filter Buttons (uỷ quyền sự kiện — tab được sinh động từ dữ liệu Database)
    this.filterTabsEl.addEventListener('click', (e) => {
      const target = (e.target as HTMLElement).closest('.filter-btn') as HTMLElement | null;
      if (!target) return;
      const filter = target.getAttribute('data-filter') || 'all';
      this.filterTabsEl.querySelectorAll('.filter-btn').forEach((b) => b.classList.remove('active'));
      target.classList.add('active');
      this.currentFilter = filter;
      this.renderSessions();
    });

    // Search Input
    this.searchInputEl.addEventListener('input', () => {
      this.searchQuery = this.searchInputEl.value.trim().toLowerCase();
      this.renderSessions();
    });

    // Proceed to lesson reading + quiz
    this.btnProceedRoadmapEl.addEventListener('click', () => {
      if (this.selectedLessonId !== null) {
        void this.proceedToLesson();
      }
    });

    // Auth state synchronization
    const isLoggedIn = localStorage.getItem('slanguage_is_logged_in') === 'true';
    if (isLoggedIn) {
      document.body.classList.add('user-authenticated');
      document.body.classList.remove('user-guest');
    } else {
      document.body.classList.add('user-guest');
      document.body.classList.remove('user-authenticated');
    }

    // Logout
    const logoutBtn = document.getElementById('navLogoutItem');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => {
        void logoutLearner();
      });
    }
  }

  private switchLanguage(lang: TargetLang): void {
    const rawNative = (localStorage.getItem('slanguage_native_language') || 'vi').toLowerCase();
    const nativeLang = rawNative.includes('vi') || rawNative.includes('việt') ? 'vi' : (rawNative.includes('en') || rawNative.includes('anh') ? 'en' : (rawNative.includes('ja') || rawNative.includes('nhật') ? 'ja' : 'vi'));
    if (lang === nativeLang) {
      this.showToast(`Bạn không thể chọn ngôn ngữ mẹ đẻ để học!`);
      this.langDropdownEl.classList.remove('open'); this.langDropdownEl.classList.remove('show');
      return;
    }

    if (this.currentLang === lang) {
      this.langDropdownEl.classList.remove('open'); this.langDropdownEl.classList.remove('show');
      return;
    }
    if (isLearnerAuthenticated()) {
      void this.changeProfileLanguage(lang);
      return;
    }
    this.currentLang = lang;
    localStorage.setItem('slanguage_current_lang', lang);
    localStorage.setItem('slanguage_active_language', lang);
    this.applyCurrentLanguage();
    this.langDropdownEl.classList.remove('open'); this.langDropdownEl.classList.remove('show');
    this.renderSessions();
    this.updateStatusCard();
    this.showToast(`Đã chuyển mục tiêu sang ${this.langMetadata[lang].name}`);
  }

  private applyCurrentLanguage(): void {
    const meta = this.langMetadata[this.currentLang];
    this.currentLangFlagEl.src = meta.flag;
    this.currentLangFlagEl.alt = meta.name;
    this.currentLangLabelEl.textContent = meta.name;

    if (this.targetLangChipEl) {
      this.targetLangChipEl.innerHTML = `<i class="fa-solid fa-language"></i> Mục tiêu: ${meta.name}`;
    }

    document.querySelectorAll('.lang-dropdown-item').forEach((item) => {
      const l = item.getAttribute('data-lang');
      if (l === this.currentLang) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });
  }

  private renderSessions(): void {
    clearSkeleton(this.sessionsGridEl);
    this.sessionsGridEl.innerHTML = '';

    if (!this.sessionsList.length) {
      this.sessionsGridEl.innerHTML = `
        <div class="sessions-empty">
          <i class="fa-solid fa-route"></i>
          <p>Chưa có lộ trình để học</p>
        </div>`;
      return;
    }

    const filtered = this.sessionsList.filter((s) => {
      // Filter by tier
      if (this.currentFilter !== 'all' && s.tier !== this.currentFilter) {
        return false;
      }
      // Filter by search query
      if (this.searchQuery) {
        const title = (s.title[this.currentLang] || '').toLowerCase();
        const desc = (s.desc[this.currentLang] || '').toLowerCase();
        const num = s.numStr.toLowerCase();
        return title.includes(this.searchQuery) || desc.includes(this.searchQuery) || num.includes(this.searchQuery);
      }
      return true;
    });

    if (filtered.length === 0) {
      this.sessionsGridEl.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 48px 20px; background: rgba(12, 26, 41, 0.7); border-radius: 20px; border: 1px dashed rgba(255,255,255,0.15);">
          <i class="fa-solid fa-magnifying-glass" style="font-size: 2.2rem; color: #64748b; margin-bottom: 12px; display: block;"></i>
          <h3 style="color: #fff; font-size: 1.2rem; margin-bottom: 6px;">Không tìm thấy buổi học phù hợp</h3>
          <p style="color: #94a3b8; font-size: 0.9rem;">Vui lòng thử tìm kiếm với từ khóa khác hoặc xóa bộ lọc.</p>
        </div>
      `;
      return;
    }

    filtered.forEach((session) => {
      const isSelected = this.selectedLessonId === session.id;
      const card = document.createElement('div');
      card.className = `session-card ${isSelected ? 'selected' : ''} ${session.locked ? 'is-locked' : ''}`;
      card.setAttribute('data-id', session.id.toString());
      if (session.topicId) card.setAttribute('data-topic-id', session.topicId.toString());

      const title = session.title[this.currentLang] || session.title.ja;
      const desc = session.desc[this.currentLang] || session.desc.ja;
      const metaPills = [
        session.vocabCount > 0 ? `<span class="meta-pill"><i class="fa-solid fa-book-open"></i> ${session.vocabCount} Từ vựng</span>` : '',
        session.grammarCount > 0 ? `<span class="meta-pill"><i class="fa-solid fa-spell-check"></i> ${session.grammarCount} Ngữ pháp</span>` : '',
        session.xpReward > 0 ? `<span class="meta-pill xp"><i class="fa-solid fa-star"></i> +${session.xpReward} XP</span>` : '',
        session.completed ? '<span class="meta-pill xp"><i class="fa-solid fa-circle-check"></i> Hoàn thành</span>' : '',
        session.locked ? '<span class="meta-pill premium"><i class="fa-solid fa-crown"></i> Premium</span>' : '',
      ].join('');

      card.innerHTML = `
        <div class="card-header-row">
          <span class="session-num-pill">SESSION ${session.numStr}</span>
          <span class="session-tier-tag ${session.tier}">${session.tierLabel}</span>
        </div>

        <div class="card-main-content">
          <div class="card-icon-title-wrap">
            <div class="card-icon-box">
              <i class="fa-solid ${session.icon}"></i>
            </div>
            <div class="card-titles">
              <h3 class="card-title">${title}</h3>
              <p class="card-subtitle">${desc}</p>
            </div>
          </div>

          <div class="card-meta-pills">
            ${metaPills}
          </div>
        </div>

        <div class="card-action-bar">
          <button type="button" class="btn-card-select">
            ${session.locked
              ? '<i class="fa-solid fa-crown"></i> Cần Premium'
              : isSelected ? '<i class="fa-solid fa-circle-check"></i> Đang Chọn' : '<i class="fa-solid fa-arrow-pointer"></i> Chọn Buổi Này'}
          </button>
        </div>
      `;

      card.addEventListener('click', () => {
        this.selectSession(session);
      });

      this.sessionsGridEl.appendChild(card);
    });
  }

  private selectSession(session: SessionData): void {
    if (session.locked) {
      this.showPremiumModal();
      return;
    }
    this.selectedLessonId = session.id;

    const savedPayload = {
      id: session.id,
      numStr: session.numStr,
      tier: session.tier,
      tierLabel: session.tierLabel,
      title: session.title[this.currentLang],
      lang: this.currentLang,
      topicId: session.topicId ?? null,
      pathId: this.dbPathId,
      timestamp: Date.now()
    };

    localStorage.setItem('slanguage_selected_lesson', JSON.stringify(savedPayload));

    // Re-render to update selected classes
    this.renderSessions();
    this.updateStatusCard();
    this.showToast(`Đã chọn Session ${session.numStr}: ${session.title[this.currentLang]}`);
  }

  private updateStatusCard(): void {
    if (this.selectedLessonId !== null) {
      const session = this.sessionsList.find((s) => s.id === this.selectedLessonId);
      if (session) {
        const title = session.title[this.currentLang];
        this.statusLessonTextEl.textContent = `Session ${session.numStr}: ${title}`;
        this.selectionStatusCardEl.classList.add('active');
        this.statusIconEl.innerHTML = '<i class="fa-solid fa-circle-check"></i>';
        this.btnProceedRoadmapEl.disabled = false;
        this.btnProceedRoadmapEl.title = 'Nhấn để vào bản đồ học tập ngay!';
        return;
      }
    }

    this.statusLessonTextEl.textContent = 'Chưa chọn buổi học nào';
    this.selectionStatusCardEl.classList.remove('active');
    this.statusIconEl.innerHTML = '<i class="fa-solid fa-circle-exclamation"></i>';
    this.btnProceedRoadmapEl.disabled = true;
    this.btnProceedRoadmapEl.title = 'Vui lòng chọn 1 buổi học để tiếp tục';
  }

  private async changeProfileLanguage(lang: TargetLang): Promise<void> {
    this.langDropdownBtnEl.disabled = true;
    try {
      await slanguageApi('/api/v1/me', { method: 'PATCH', body: { target_language: lang } });
      localStorage.setItem('slanguage_current_lang', lang);
      localStorage.setItem('slanguage_active_language', lang);
      window.location.reload();
    } catch (error) {
      this.showToast(error instanceof Error ? error.message : 'Không thể cập nhật ngôn ngữ.');
    } finally {
      this.langDropdownBtnEl.disabled = false;
    }
  }

  private async proceedToLesson(): Promise<void> {
    const session = this.sessionsList.find((s) => s.id === this.selectedLessonId);
    if (!session) return;
    if (!session.topicId || !this.dbPathId) {
      if (!isLearnerAuthenticated()) {
        this.showToast('Cần đăng nhập tài khoản học viên để tải bài đọc từ Database.');
        window.location.assign('../login/index.html');
      } else {
        this.showToast('Chưa có lộ trình để học');
      }
      return;
    }
    if (session.locked) {
      this.showPremiumModal();
      return;
    }
    window.location.assign('../roadmap/index.html');
  }

  private renderFilterTabs(): void {
    if (!this.filterTabsEl) return;
    const counts = new Map<string, number>();
    this.sessionsList.forEach((session) => {
      counts.set(session.tier, (counts.get(session.tier) || 0) + 1);
    });
    const order: SessionTier[] = ['basic', 'intermediate', 'advanced', 'master', 'extension'];
    const labels: Record<SessionTier, string> = {
      basic: 'Cơ bản',
      intermediate: 'Giao tiếp',
      advanced: 'Nâng cao',
      master: 'Chuyên sâu',
      extension: 'Mở rộng'
    };
    const tabs = order
      .filter((tier) => counts.has(tier))
      .map((tier) => `<button class="filter-btn" data-filter="${tier}">${labels[tier]} (${counts.get(tier)})</button>`)
      .join('');
    this.filterTabsEl.querySelectorAll('.filter-btn:not([data-filter="all"])').forEach((btn) => btn.remove());
    const allBtn = this.filterTabsEl.querySelector('.filter-btn[data-filter="all"]');
    if (allBtn) allBtn.insertAdjacentHTML('afterend', tabs);
  }

  private updateSessionCount(): void {
    const el = document.getElementById('sessionCountText');
    if (el) el.textContent = `${this.sessionsList.length} Buổi Học (Session)`;
  }

  private showPremiumModal(): void {
    let overlay = document.getElementById('premiumModalOverlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'premiumModalOverlay';
      overlay.className = 'premium-modal-overlay';
      overlay.innerHTML = `
        <div class="premium-modal-card">
          <div class="premium-modal-icon"><i class="fa-solid fa-crown"></i></div>
          <h3>Nâng cấp Premium</h3>
          <p class="premium-modal-lead">Nửa sau của lộ trình (từ Session ${String(this.freeSessionCount + 1).padStart(2, '0')}) cần Premium để mở khóa. Nâng cấp để học toàn bộ chủ đề còn lại ngay lập tức.</p>
          <div class="premium-plan-row">
            <div class="premium-plan-card">
              <div class="premium-plan-name">Premium Tháng</div>
              <div class="premium-plan-price">99.000đ</div>
              <div class="premium-plan-note">/ 30 ngày</div>
            </div>
            <div class="premium-plan-card featured">
              <div class="premium-plan-badge">Tiết kiệm nhất</div>
              <div class="premium-plan-name">Premium Vĩnh Viễn</div>
              <div class="premium-plan-price">999.000đ</div>
              <div class="premium-plan-note">không giới hạn</div>
            </div>
          </div>
          <button type="button" id="premiumActivateBtn" class="premium-activate-btn"><i class="fa-solid fa-bolt"></i> Kích hoạt Premium (Demo)</button>
          <button type="button" id="premiumCloseBtn" class="premium-later-btn">Để sau</button>
        </div>`;
      document.body.appendChild(overlay);
      overlay.addEventListener('click', (event) => {
        if (event.target === overlay) this.closePremiumModal();
      });
      document.getElementById('premiumCloseBtn')?.addEventListener('click', () => this.closePremiumModal());
      document.getElementById('premiumActivateBtn')?.addEventListener('click', () => {
        localStorage.setItem('slanguage_is_premium', 'true');
        this.isPremiumUser = true;
        this.sessionsList.forEach((session) => { session.locked = false; });
        this.renderSessions();
        this.updateStatusCard();
        this.closePremiumModal();
        this.showToast('Kích hoạt Premium thành công! Toàn bộ chủ đề đã mở khóa 👑');
      });
    }
    overlay.classList.add('active');
  }

  private closePremiumModal(): void {
    document.getElementById('premiumModalOverlay')?.classList.remove('active');
  }

  private showToast(msg: string): void {
    if (!this.toastEl || !this.toastTextEl) return;
    this.toastTextEl.textContent = msg;
    this.toastEl.style.display = 'flex';
    setTimeout(() => {
      this.toastEl.style.display = 'none';
    }, 2800);
  }
}

// Global declaration and instantiation
declare global {
  interface Window {
    selectLessonApp?: SelectLessonManager;
  }
}

function initSelectLessonManager(): void {
  (window as unknown as { selectLessonApp?: SelectLessonManager }).selectLessonApp = new SelectLessonManager();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initSelectLessonManager);
} else {
  initSelectLessonManager();
}
export {};
