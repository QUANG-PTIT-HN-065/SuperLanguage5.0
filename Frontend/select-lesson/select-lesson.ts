/**
 * Slanguage - Select Lesson Module (Lựa chọn buổi học / Session)
 * 16-Session Grid System (4x4) with Gatekeeper for Learning Roadmap
 */

type TargetLang = 'ja' | 'en' | 'vi';
type SessionTier = 'basic' | 'intermediate' | 'advanced' | 'master';

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
}

interface LanguageMeta {
  code: TargetLang;
  name: string;
  flag: string;
}

class SelectLessonManager {
  private currentLang: TargetLang = 'ja';
  private selectedLessonId: number | null = null;
  private currentFilter: string = 'all';
  private searchQuery: string = '';

  private readonly langMetadata: Record<TargetLang, LanguageMeta> = {
    ja: { code: 'ja', name: 'Tiếng Nhật', flag: '../assets/flags/flag-jp.png' },
    en: { code: 'en', name: 'English', flag: '../assets/flags/flag-en.png' },
    vi: { code: 'vi', name: 'Tiếng Việt', flag: '../assets/flags/flag-vn.png' }
  };

  private readonly sessionsList: SessionData[] = [
    {
      id: 1,
      numStr: '01',
      tier: 'basic',
      tierLabel: 'Cơ bản',
      icon: 'fa-pen-nib',
      title: {
        ja: 'Bảng Chữ Cái & Phát Âm Căn Bản',
        en: 'Alphabet & Phonics Essentials',
        vi: 'Bảng Chữ Cái & 6 Dấu Thanh Điệu'
      },
      desc: {
        ja: 'Làm quen Hiragana, Katakana & quy tắc phát âm trường âm, âm ngắt.',
        en: 'Master phonics, vowels, consonants, and phonetic building blocks.',
        vi: 'Nắm vững 29 chữ cái, phụ âm ghép và 6 dấu thanh điệu tiếng Việt.'
      },
      vocabCount: 25,
      grammarCount: 3,
      xpReward: 50
    },
    {
      id: 2,
      numStr: '02',
      tier: 'basic',
      tierLabel: 'Cơ bản',
      icon: 'fa-handshake',
      title: {
        ja: 'Chào Hỏi & Tự Giới Thiệu',
        en: 'Greetings & Self-Introductions',
        vi: 'Chào Hỏi & Tự Giới Thiệu Bản Thân'
      },
      desc: {
        ja: 'Chào theo buổi trong ngày, giới thiệu tên, quê quán & nghề nghiệp.',
        en: 'Everyday greetings, breaking the ice, stating name and background.',
        vi: 'Lời chào thân mật, phép tắc xưng hô và chia sẻ thông tin cá nhân.'
      },
      vocabCount: 30,
      grammarCount: 4,
      xpReward: 60
    },
    {
      id: 3,
      numStr: '03',
      tier: 'basic',
      tierLabel: 'Cơ bản',
      icon: 'fa-clock',
      title: {
        ja: 'Số Đếm, Thời Gian & Ngày Tháng',
        en: 'Numbers, Time & Daily Calendar',
        vi: 'Số Đếm, Giờ Giấc & Lịch Trình'
      },
      desc: {
        ja: 'Đếm số, hỏi giờ, các ngày trong tuần và lịch hẹn thường nhật.',
        en: 'Telling time, dates, ordinal numbers, and scheduling daily routines.',
        vi: 'Cách đọc giờ, thứ ngày tháng năm và sắp xếp lịch làm việc.'
      },
      vocabCount: 35,
      grammarCount: 3,
      xpReward: 70
    },
    {
      id: 4,
      numStr: '04',
      tier: 'basic',
      tierLabel: 'Cơ bản',
      icon: 'fa-people-roof',
      title: {
        ja: 'Gia Đình & Đại Từ Xưng Hô',
        en: 'Family Members & Personal Pronouns',
        vi: 'Gia Đình & Thứ Bậc Xưng Hô'
      },
      desc: {
        ja: 'Gọi tên thành viên gia đình mình vs gia đình người khác lịch sự.',
        en: 'Kinship terms, relational pronouns, and talking about relatives.',
        vi: 'Hệ thống đại từ xưng hô tôn trọng theo vai vế gia đình Việt.'
      },
      vocabCount: 28,
      grammarCount: 4,
      xpReward: 80
    },
    {
      id: 5,
      numStr: '05',
      tier: 'intermediate',
      tierLabel: 'Giao tiếp',
      icon: 'fa-cart-shopping',
      title: {
        ja: 'Mua Sắm, Tiền Tệ & Mặc Cả',
        en: 'Shopping, Currency & Bargaining',
        vi: 'Mua Sắm, Giá Cả & Thanh Toán'
      },
      desc: {
        ja: 'Hỏi giá tiền Yên, phương thức thanh toán & hỏi mua đồ tại siêu thị.',
        en: 'Asking prices, paying via card/cash, discounts, and store dialogue.',
        vi: 'Hỏi giá, đổi trả hàng, thanh toán tiền mặt và chuyển khoản.'
      },
      vocabCount: 32,
      grammarCount: 4,
      xpReward: 90
    },
    {
      id: 6,
      numStr: '06',
      tier: 'intermediate',
      tierLabel: 'Giao tiếp',
      icon: 'fa-utensils',
      title: {
        ja: 'Ẩm Thực, Nhà Hàng & Gọi Món',
        en: 'Food, Dining Out & Ordering',
        vi: 'Ẩm Thực, Quán Ăn & Kỹ Năng Gọi Món'
      },
      desc: {
        ja: 'Văn hóa Itadakimasu, gọi món ăn Nhật, hỏi thực đơn & tính tiền.',
        en: 'Restaurant etiquette, dietary preferences, ordering courses and bill.',
        vi: 'Khám phá món ăn vùng miền, dặn dò khẩu vị và thanh toán hóa đơn.'
      },
      vocabCount: 36,
      grammarCount: 4,
      xpReward: 100
    },
    {
      id: 7,
      numStr: '07',
      tier: 'intermediate',
      tierLabel: 'Giao tiếp',
      icon: 'fa-map-location-dot',
      title: {
        ja: 'Phương Tiện & Hỏi Đường Đi',
        en: 'Transportation & Asking Directions',
        vi: 'Phương Tiện, Đi Lại & Hỏi Đường'
      },
      desc: {
        ja: 'Đi tàu điện ngầm Shinkansen, xe buýt và chỉ dẫn phương hướng.',
        en: 'Navigating subway/bus systems, asking directions, catching a cab.',
        vi: 'Bắt xe công nghệ, hỏi đường phố, ngõ ngách và khoảng cách di chuyển.'
      },
      vocabCount: 30,
      grammarCount: 3,
      xpReward: 110
    },
    {
      id: 8,
      numStr: '08',
      tier: 'intermediate',
      tierLabel: 'Giao tiếp',
      icon: 'fa-icons',
      title: {
        ja: 'Sở Thích, Giải Trí & Cuối Tuần',
        en: 'Hobbies, Entertainment & Weekends',
        vi: 'Sở Thích, Thể Thao & Cuối Tuần'
      },
      desc: {
        ja: 'Chia sẻ sở thích âm nhạc, anime, thể thao & kế hoạch nghỉ ngơi.',
        en: 'Discussing pastimes, favorite movies, outdoor adventures, leisure.',
        vi: 'Trò chuyện về sở thích cá nhân, dã ngoại và hoạt động thư giãn.'
      },
      vocabCount: 34,
      grammarCount: 4,
      xpReward: 120
    },
    {
      id: 9,
      numStr: '09',
      tier: 'advanced',
      tierLabel: 'Nâng cao',
      icon: 'fa-briefcase',
      title: {
        ja: 'Công Sở & Đàm Thoại Văn Phòng',
        en: 'Office Workplace & Business Talk',
        vi: 'Môi Trường Công Sở & Đàm Thoại IT'
      },
      desc: {
        ja: 'Kính ngữ Keigo văn phòng, trao đổi công việc và văn hóa báo cáo.',
        en: 'Professional workplace communication, project updates, meetings.',
        vi: 'Trao đổi công việc chuyên nghiệp, họp nhóm và cộng tác dự án.'
      },
      vocabCount: 38,
      grammarCount: 5,
      xpReward: 130
    },
    {
      id: 10,
      numStr: '10',
      tier: 'advanced',
      tierLabel: 'Nâng cao',
      icon: 'fa-cloud-sun',
      title: {
        ja: 'Thời Tiết, Khí Hậu & Bốn Mùa',
        en: 'Weather, Climate & Four Seasons',
        vi: 'Thời Tiết, Khí Hậu & Bốn Mùa'
      },
      desc: {
        ja: 'Miêu tả mùa hoa anh đào, lá đỏ thu, bão tuyết & dự báo thời tiết.',
        en: 'Describing forecasts, climate changes, weather phenomena, seasons.',
        vi: 'Khí hậu nhiệt đới 4 mùa, mùa mưa nắng và cảnh sắc thiên nhiên.'
      },
      vocabCount: 28,
      grammarCount: 3,
      xpReward: 140
    },
    {
      id: 11,
      numStr: '11',
      tier: 'advanced',
      tierLabel: 'Nâng cao',
      icon: 'fa-face-smile-beam',
      title: {
        ja: 'Cảm Xúc & Miêu Tả Ngoại Hình',
        en: 'Feelings, Moods & Appearance',
        vi: 'Cảm Xúc, Tâm Trạng & Miêu Tả Người'
      },
      desc: {
        ja: 'Diễn tả cảm xúc vui buồn, bất ngờ và tính từ miêu tả tính cách.',
        en: 'Expressing nuance, personality traits, physical descriptions.',
        vi: 'Từ láy tượng thanh, tượng hình biểu cảm tâm trạng sâu sắc.'
      },
      vocabCount: 32,
      grammarCount: 4,
      xpReward: 150
    },
    {
      id: 12,
      numStr: '12',
      tier: 'advanced',
      tierLabel: 'Nâng cao',
      icon: 'fa-heart-pulse',
      title: {
        ja: 'Sức Khỏe, Bệnh Viện & Thăm Khám',
        en: 'Healthcare, Symptoms & Pharmacy',
        vi: 'Sức Khỏe, Nhà Thuốc & Bệnh Viện'
      },
      desc: {
        ja: 'Nêu triệu chứng cảm sốt, mua thuốc tại hiệu và bảo hiểm y tế.',
        en: 'Describing aches, visiting a doctor, prescriptions and wellness.',
        vi: 'Mô tả triệu chứng bệnh, mua thuốc và lối sống lành mạnh.'
      },
      vocabCount: 30,
      grammarCount: 3,
      xpReward: 160
    },
    {
      id: 13,
      numStr: '13',
      tier: 'master',
      tierLabel: 'Chuyên sâu',
      icon: 'fa-envelope-open-text',
      title: {
        ja: 'Điện Thoại, Email & Thư Từ',
        en: 'Phone Calls, Formal Emails & Notes',
        vi: 'Điện Thoại, Soạn Email & Văn Bản'
      },
      desc: {
        ja: 'Mẫu thư tín trang trọng, cấu trúc email Nhật chuẩn mực mở đầu/kết.',
        en: 'Drafting polite emails, professional call etiquette, follow-ups.',
        vi: 'Soạn thảo thư điện tử công việc, lời chúc và phản hồi tin nhắn.'
      },
      vocabCount: 35,
      grammarCount: 5,
      xpReward: 170
    },
    {
      id: 14,
      numStr: '14',
      tier: 'master',
      tierLabel: 'Chuyên sâu',
      icon: 'fa-torii-gate',
      title: {
        ja: 'Lễ Hội Truyền Thống & Văn Hóa',
        en: 'Cultural Festivals & Traditions',
        vi: 'Lễ Hội Truyền Thống & Phong Tục'
      },
      desc: {
        ja: 'Lễ hội Matsuri, phong tục Tết Oshougatsu & ứng xử chuẩn mực.',
        en: 'Holidays, traditions, cultural heritage, cross-cultural etiquette.',
        vi: 'Tết cổ truyền, lễ hội dân gian và nét đẹp phong tục người Việt.'
      },
      vocabCount: 36,
      grammarCount: 4,
      xpReward: 180
    },
    {
      id: 15,
      numStr: '15',
      tier: 'master',
      tierLabel: 'Chuyên sâu',
      icon: 'fa-fire',
      title: {
        ja: 'Thành Ngữ, Từ Lóng & Đàm Thoại Nhanh',
        en: 'Idioms, Slang & Fluent Reflexes',
        vi: 'Thành Ngữ, Ca Dao & Phản Xạ Nhanh'
      },
      desc: {
        ja: 'Yojijukugo (Thành ngữ 4 chữ), tiếng lóng giới trẻ Tokyo thực chiến.',
        en: 'Common idioms, natural phrasal verbs, fluent native expressions.',
        vi: 'Kho tàng thành ngữ dân gian, cách nói ẩn dụ và biến tấu hiện đại.'
      },
      vocabCount: 40,
      grammarCount: 4,
      xpReward: 190
    },
    {
      id: 16,
      numStr: '16',
      tier: 'master',
      tierLabel: 'Chuyên sâu',
      icon: 'fa-crown',
      title: {
        ja: 'Tổng Kết Cấp Độ & Đấu Trường Boss',
        en: 'Final Level Mastery & Boss Arena',
        vi: 'Tổng Kết Toàn Diện & Đấu Trường Master'
      },
      desc: {
        ja: 'Tổng duyệt toàn bộ kiến thức N5/N4, sẵn sàng chinh phục đấu trường.',
        en: 'Comprehensive milestone test, testing all 4 core language pillars.',
        vi: 'Đánh giá tổng thể trình độ, tổng kết từ vựng và cấp chứng nhận.'
      },
      vocabCount: 50,
      grammarCount: 6,
      xpReward: 250
    }
  ];

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
  private loadingOverlayEl!: HTMLElement;
  private loadingVideoEl!: HTMLVideoElement | null;
  private currentLangFlagEl!: HTMLImageElement;
  private currentLangLabelEl!: HTMLElement;
  private langDropdownEl!: HTMLElement;
  private langDropdownBtnEl!: HTMLButtonElement;
  private userDropdownEl!: HTMLElement;
  private userDropdownBtnEl!: HTMLButtonElement;

  constructor() {
    this.initDOM();
    this.loadUserData();
    this.bindEvents();
    this.applyCurrentLanguage();
    this.renderSessions();
    this.updateStatusCard();
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
    this.loadingOverlayEl = document.getElementById('slanguageLoadingOverlay') as HTMLElement;
    this.loadingVideoEl = document.getElementById('loadingVideoPlayer') as HTMLVideoElement | null;

    this.currentLangFlagEl = document.getElementById('currentLangFlag') as HTMLImageElement;
    this.currentLangLabelEl = document.getElementById('currentLangLabel') as HTMLElement;
    this.langDropdownEl = document.getElementById('langDropdown') as HTMLElement;
    this.langDropdownBtnEl = document.getElementById('langDropdownBtn') as HTMLButtonElement;
    this.userDropdownEl = document.getElementById('userDropdown') as HTMLElement;
    this.userDropdownBtnEl = document.getElementById('userDropdownBtn') as HTMLButtonElement;
  }

  private loadUserData(): void {
    // Current Target Language
    const savedLang = localStorage.getItem('slanguage_current_lang') as TargetLang;
    if (savedLang && ['ja', 'en', 'vi'].includes(savedLang)) {
      this.currentLang = savedLang;
    }

    // Header XP
    const userXP = localStorage.getItem('slanguage_user_xp') || '2,450 XP';
    const xpEl = document.getElementById('headerXPVal');
    if (xpEl) xpEl.textContent = userXP.includes('XP') ? userXP : `${userXP} XP`;

    // Header Hearts
    const userHearts = localStorage.getItem('slanguage_user_hearts') || '5';
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

    // Filter Buttons
    this.filterTabsEl.querySelectorAll('.filter-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const target = e.currentTarget as HTMLElement;
        const filter = target.getAttribute('data-filter') || 'all';
        this.filterTabsEl.querySelectorAll('.filter-btn').forEach((b) => b.classList.remove('active'));
        target.classList.add('active');
        this.currentFilter = filter;
        this.renderSessions();
      });
    });

    // Search Input
    this.searchInputEl.addEventListener('input', () => {
      this.searchQuery = this.searchInputEl.value.trim().toLowerCase();
      this.renderSessions();
    });

    // Proceed to Roadmap Button
    this.btnProceedRoadmapEl.addEventListener('click', () => {
      if (this.selectedLessonId !== null) {
        this.navigateToRoadmap();
      }
    });

    // Logout
    const logoutBtn = document.getElementById('navLogoutItem');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => {
        localStorage.removeItem('slanguage_current_user');
      });
    }
  }

  private switchLanguage(lang: TargetLang): void {
    if (this.currentLang === lang) {
      this.langDropdownEl.classList.remove('open'); this.langDropdownEl.classList.remove('show');
      return;
    }
    this.currentLang = lang;
    localStorage.setItem('slanguage_current_lang', lang);
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
    this.sessionsGridEl.innerHTML = '';

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
      card.className = `session-card ${isSelected ? 'selected' : ''}`;
      card.setAttribute('data-id', session.id.toString());

      const title = session.title[this.currentLang] || session.title.ja;
      const desc = session.desc[this.currentLang] || session.desc.ja;

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
            <span class="meta-pill"><i class="fa-solid fa-book-open"></i> ${session.vocabCount} Từ vựng</span>
            <span class="meta-pill"><i class="fa-solid fa-spell-check"></i> ${session.grammarCount} Ngữ pháp</span>
            <span class="meta-pill xp"><i class="fa-solid fa-star"></i> +${session.xpReward} XP</span>
          </div>
        </div>

        <div class="card-action-bar">
          <button type="button" class="btn-card-select">
            ${isSelected ? '<i class="fa-solid fa-circle-check"></i> Đang Chọn' : '<i class="fa-solid fa-arrow-pointer"></i> Chọn Buổi Này'}
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
    this.selectedLessonId = session.id;

    const savedPayload = {
      id: session.id,
      numStr: session.numStr,
      tier: session.tier,
      tierLabel: session.tierLabel,
      title: session.title[this.currentLang],
      lang: this.currentLang,
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

  private navigateToRoadmap(): void {
    if (this.loadingOverlayEl) {
      this.loadingOverlayEl.classList.add('active');
      if (this.loadingVideoEl) {
        this.loadingVideoEl.muted = true;
        this.loadingVideoEl.play().catch(() => {});
      }
    }

    setTimeout(() => {
      window.location.href = '../roadmap/index.html';
    }, 600);
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
