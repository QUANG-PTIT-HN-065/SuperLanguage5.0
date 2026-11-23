/**
 * Slanguage - Select Lesson Module (Lựa chọn buổi học / Session)
 * Session Grid from Database topics with Premium gate for Learning Roadmap
 */

import { isLearnerAuthenticated, slanguageApi } from "../shared/api-client";
import { initializeLearnerHeader, logoutLearner, renderLearnerHeader } from "../shared/learner-header";
import { applyI18n, localeLabel, setLocale, t, LOCALE_EVENT, type UiLocale } from "../shared/i18n";
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
  // Đã tải xong catalog từ Database (thành công hoặc lỗi) — dùng để re-render khi đổi locale
  private catalogLoaded = false;

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
  private langDropdownEl!: HTMLElement;
  private langDropdownBtnEl!: HTMLButtonElement;
  private userDropdownEl!: HTMLElement;
  private userDropdownBtnEl!: HTMLButtonElement;

  constructor() {
    this.initDOM();
    this.loadUserData();
    this.bindEvents();
    this.applyCurrentLanguage();
    showSkeleton(this.sessionsGridEl, 'session-cards', { tone: 'dark', count: 8 });
    void this.loadDatabaseCatalog();
    this.updateStatusCard();
    void initializeLearnerHeader({ bindControls: false, loadProfile: false });
    // Đổi locale GIAO DIỆN: chỉ dịch UI + re-render từ dữ liệu đã cache, không gọi lại API
    window.addEventListener(LOCALE_EVENT, () => {
      applyI18n();
      this.applyCurrentLanguage();
      if (this.catalogLoaded) {
        this.renderFilterTabs();
        if (this.sessionsList.length) this.updateSessionCount();
        this.renderSessions();
        this.updateStatusCard();
      }
      const lead = document.querySelector('#premiumModalOverlay .premium-modal-lead');
      if (lead) {
        lead.textContent = t('sl.premiumLead', { num: String(this.freeSessionCount + 1).padStart(2, '0') });
      }
    });
    document.body.dataset.pageState = "ready";
    window.dispatchEvent(new Event("learning:ready"));
  }

  private async loadDatabaseCatalog(): Promise<void> {
    try {
      const authenticated = isLearnerAuthenticated();
      if (authenticated) {
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
      } else {
        // Khách xem catalogue như người dùng miễn phí, theo ngôn ngữ đang chọn trên trang
        this.isPremiumUser = false;
      }
      const langQuery = authenticated ? '' : `?language=${encodeURIComponent(this.currentLang)}`;
      const pathsResponse = await slanguageApi(`/api/v1/vocabulary/learning-paths${langQuery}`);
      const paths = Array.isArray(pathsResponse.data) ? pathsResponse.data as Record<string, unknown>[] : [];
      const path = paths.find((item) => item.language_code === this.currentLang) ?? paths[0];
      const pathId = Number(path?.id);
      if (!pathId) {
        this.showToast(t('sl.noPath'));
        this.catalogLoaded = true;
        this.renderSessions();
        return;
      }
      const detail = await slanguageApi(`/api/v1/vocabulary/learning-paths/${pathId}${langQuery}`);
      const detailData = (detail.data ?? {}) as Record<string, unknown>;
      const topics = Array.isArray(detailData.topics) ? detailData.topics as Record<string, unknown>[] : [];
      if (!topics.length) {
        this.showToast(t('sl.noPath'));
        this.catalogLoaded = true;
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
      this.catalogLoaded = true;
      this.renderSessions();
      this.updateStatusCard();
    } catch (error) {
      this.showToast(error instanceof Error ? error.message : t('sl.loadFail'));
      this.catalogLoaded = true;
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
    // tierLabel giữ tiếng Việt vì được lưu vào payload localStorage cho trang khác;
    // phần hiển thị UI dùng t('sl.tier.*') tại chỗ render.
    const tierLabel = { basic: 'Cơ bản', intermediate: 'Giao tiếp', advanced: 'Nâng cao', master: 'Chuyên sâu', extension: 'Mở rộng' }[tier];
    const icon = { basic: 'fa-pen-nib', intermediate: 'fa-comments', advanced: 'fa-briefcase', master: 'fa-crown', extension: 'fa-rocket' }[tier];
    const name = String(topic.name ?? t('sl.topicFallback', { n: num }));
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

    // Navbar dropdown là bộ chọn ngôn ngữ GIAO DIỆN (i18n) — không ẩn mục theo tiếng mẹ đẻ.

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

    // Navbar dropdown: CHỈ đổi locale giao diện (setLocale), không PATCH hồ sơ,
    // không ghi slanguage_active_language, không tải lại danh sách buổi học.
    document.querySelectorAll('.lang-dropdown-item').forEach((item) => {
      item.addEventListener('click', (e) => {
        const code = (e.currentTarget as HTMLElement).getAttribute('data-lang') as UiLocale | null;
        if (code === 'vi' || code === 'en' || code === 'ja') {
          setLocale(code);
        }
        this.langDropdownEl.classList.remove('open'); this.langDropdownEl.classList.remove('show');
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
    const isLoggedIn = isLearnerAuthenticated();
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
      this.showToast(t('sl.nativeBlocked'));
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
    this.showToast(t('sl.switchedTarget', { lang: this.langMetadata[lang].name }));
  }

  private applyCurrentLanguage(): void {
    // Chip "Mục tiêu" phản ánh ngôn ngữ HỌC (không phải locale giao diện).
    // Flag/nhãn/selected của navbar do translateShell + updateLanguageDisplay quản lý.
    if (this.targetLangChipEl) {
      this.targetLangChipEl.innerHTML = `<i class="fa-solid fa-language"></i> ${t('sl.targetChip', { lang: localeLabel(this.currentLang) })}`;
    }
  }

  private renderSessions(): void {
    clearSkeleton(this.sessionsGridEl);
    this.sessionsGridEl.innerHTML = '';

    if (!this.sessionsList.length) {
      this.sessionsGridEl.innerHTML = `
        <div class="sessions-empty">
          <i class="fa-solid fa-route"></i>
          <p>${t('sl.noPath')}</p>
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
          <h3 style="color: #fff; font-size: 1.2rem; margin-bottom: 6px;">${t('sl.noResults')}</h3>
          <p style="color: #94a3b8; font-size: 0.9rem;">${t('sl.noResultsHint')}</p>
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
        session.vocabCount > 0 ? `<span class="meta-pill"><i class="fa-solid fa-book-open"></i> ${t('sl.pillVocab', { n: session.vocabCount })}</span>` : '',
        session.grammarCount > 0 ? `<span class="meta-pill"><i class="fa-solid fa-spell-check"></i> ${t('sl.pillGrammar', { n: session.grammarCount })}</span>` : '',
        session.xpReward > 0 ? `<span class="meta-pill xp"><i class="fa-solid fa-star"></i> +${session.xpReward} XP</span>` : '',
        session.completed ? `<span class="meta-pill xp"><i class="fa-solid fa-circle-check"></i> ${t('sl.pillCompleted')}</span>` : '',
        session.locked ? '<span class="meta-pill premium"><i class="fa-solid fa-crown"></i> Premium</span>' : '',
      ].join('');

      card.innerHTML = `
        <div class="card-header-row">
          <span class="session-num-pill">SESSION ${session.numStr}</span>
          <span class="session-tier-tag ${session.tier}">${t(`sl.tier.${session.tier}`)}</span>
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
              ? `<i class="fa-solid fa-crown"></i> ${t('sl.needPremium')}`
              : isSelected ? `<i class="fa-solid fa-circle-check"></i> ${t('sl.selected')}` : `<i class="fa-solid fa-arrow-pointer"></i> ${t('sl.selectThis')}`}
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
    this.showToast(t('sl.toastSelected', { num: session.numStr, title: session.title[this.currentLang] }));
  }

  private updateStatusCard(): void {
    if (this.selectedLessonId !== null) {
      const session = this.sessionsList.find((s) => s.id === this.selectedLessonId);
      if (session) {
        const title = session.title[this.currentLang];
        this.statusLessonTextEl.textContent = t('sl.statusSelected', { num: session.numStr, title });
        this.selectionStatusCardEl.classList.add('active');
        this.statusIconEl.innerHTML = '<i class="fa-solid fa-circle-check"></i>';
        this.btnProceedRoadmapEl.disabled = false;
        this.btnProceedRoadmapEl.title = t('sl.proceedTitleActive');
        return;
      }
    }

    this.statusLessonTextEl.textContent = t('sl.statusNone');
    this.selectionStatusCardEl.classList.remove('active');
    this.statusIconEl.innerHTML = '<i class="fa-solid fa-circle-exclamation"></i>';
    this.btnProceedRoadmapEl.disabled = true;
    this.btnProceedRoadmapEl.title = t('sl.proceedTitleDisabled');
  }

  private async changeProfileLanguage(lang: TargetLang): Promise<void> {
    this.langDropdownBtnEl.disabled = true;
    try {
      await slanguageApi('/api/v1/me', { method: 'PATCH', body: { target_language: lang } });
      localStorage.setItem('slanguage_current_lang', lang);
      localStorage.setItem('slanguage_active_language', lang);
      window.location.reload();
    } catch (error) {
      this.showToast(error instanceof Error ? error.message : t('sl.langUpdateFail'));
    } finally {
      this.langDropdownBtnEl.disabled = false;
    }
  }

  private async proceedToLesson(): Promise<void> {
    const session = this.sessionsList.find((s) => s.id === this.selectedLessonId);
    if (!session) return;
    if (!session.topicId || !this.dbPathId) {
      if (!isLearnerAuthenticated()) {
        this.showToast(t('sl.loginRequired'));
        window.location.assign('../login/index.html');
      } else {
        this.showToast(t('sl.noPath'));
      }
      return;
    }
    if (session.locked) {
      this.showPremiumModal();
      return;
    }
    if (!isLearnerAuthenticated()) {
      this.showToast(t('sl.loginRequired'));
      window.location.assign('../login/index.html');
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
    const tabs = order
      .filter((tier) => counts.has(tier))
      .map((tier) => `<button class="filter-btn" data-filter="${tier}">${t(`sl.tier.${tier}`)} (${counts.get(tier)})</button>`)
      .join('');
    this.filterTabsEl.querySelectorAll('.filter-btn:not([data-filter="all"])').forEach((btn) => btn.remove());
    const allBtn = this.filterTabsEl.querySelector('.filter-btn[data-filter="all"]');
    if (allBtn) allBtn.insertAdjacentHTML('afterend', tabs);
  }

  private updateSessionCount(): void {
    const el = document.getElementById('sessionCountText');
    if (el) {
      // Nội dung động (có số lượng) — bỏ data-i18n tĩnh để applyI18n không ghi đè
      el.removeAttribute('data-i18n');
      el.textContent = t('sl.sessionCount', { n: this.sessionsList.length });
    }
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
          <h3 data-i18n="sl.premiumTitle">${t('sl.premiumTitle')}</h3>
          <p class="premium-modal-lead">${t('sl.premiumLead', { num: String(this.freeSessionCount + 1).padStart(2, '0') })}</p>
          <div class="premium-plan-row">
            <div class="premium-plan-card">
              <div class="premium-plan-name" data-i18n="sl.premiumMonthly">${t('sl.premiumMonthly')}</div>
              <div class="premium-plan-price">99.000đ</div>
              <div class="premium-plan-note" data-i18n="sl.per30Days">${t('sl.per30Days')}</div>
            </div>
            <div class="premium-plan-card featured">
              <div class="premium-plan-badge" data-i18n="sl.bestValue">${t('sl.bestValue')}</div>
              <div class="premium-plan-name" data-i18n="sl.premiumLifetime">${t('sl.premiumLifetime')}</div>
              <div class="premium-plan-price">999.000đ</div>
              <div class="premium-plan-note" data-i18n="sl.unlimited">${t('sl.unlimited')}</div>
            </div>
          </div>
          <button type="button" id="premiumActivateBtn" class="premium-activate-btn" data-i18n="sl.premiumActivate"><i class="fa-solid fa-bolt"></i> ${t('sl.premiumActivate')}</button>
          <button type="button" id="premiumCloseBtn" class="premium-later-btn" data-i18n="sl.later">${t('sl.later')}</button>
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
        this.showToast(t('sl.premiumActivated'));
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
