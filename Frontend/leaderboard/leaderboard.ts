/**
 * ===================================================================
 * SLANGUAGE - LEADERBOARD (BẢNG XẾP HẠNG HỌC VIÊN TOÀN DIỆN)
 * TypeScript Logic: Quản lý bảng xếp hạng theo XP, Top 3 Podium,
 * Bộ lọc thời gian, Ngôn ngữ, Tìm kiếm, và Nhận diện Vị trí Người dùng.
 * ===================================================================
 */

interface LearnerRank {
  rank: number;
  trend: 'up' | 'down' | 'same';
  trendValue: number;
  id: string;
  name: string;
  avatar: string;
  title: string;
  language: 'ja' | 'en' | 'vi';
  level: string;
  completedLessons: number;
  totalLessons: number;
  streakDays: number;
  accuracy: number;
  xp: number;
  coins: number;
  isCurrentUser: boolean;
  role: string;
}

type TimeFilter = 'today' | 'week' | 'month' | 'all';
type SortFilter = 'xp' | 'coin' | 'streak' | 'lessons' | 'accuracy';
type LangFilter = 'all' | 'ja' | 'en' | 'vi';
type BoardType = 'xp' | 'coin';

const INITIAL_LEARNERS: LearnerRank[] = [
  {
    rank: 1,
    trend: 'up',
    trendValue: 1,
    id: 'user_001',
    name: 'Kenjiro Takahashi',
    avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80',
    title: 'Đại Cao Thủ JLPT N1',
    language: 'ja',
    level: 'N1 Chuyên Sâu',
    completedLessons: 16,
    totalLessons: 16,
    streakDays: 32,
    accuracy: 99,
    xp: 4850,
    coins: 580,
    isCurrentUser: false,
    role: 'Học viên Xuất Sắc'
  },
  {
    rank: 2,
    trend: 'up',
    trendValue: 2,
    id: 'user_002',
    name: 'Alexander Wright',
    avatar: 'https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?w=150&auto=format&fit=crop&q=80',
    title: 'IELTS 8.5 Fluency Master',
    language: 'en',
    level: 'C2 Advanced',
    completedLessons: 15,
    totalLessons: 16,
    streakDays: 28,
    accuracy: 97,
    xp: 4220,
    coins: 640,
    isCurrentUser: false,
    role: 'Thủ Khoa Tiếng Anh'
  },
  {
    rank: 3,
    trend: 'down',
    trendValue: 1,
    id: 'user_003',
    name: 'Nguyễn Hải Yến',
    avatar: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=150&auto=format&fit=crop&q=80',
    title: 'Song Ngữ Anh - Nhật',
    language: 'vi',
    level: 'Bản Xứ Đi Làm',
    completedLessons: 14,
    totalLessons: 16,
    streakDays: 24,
    accuracy: 95,
    xp: 3910,
    coins: 820,
    isCurrentUser: false,
    role: 'Học viên Danh Dự'
  },
  {
    rank: 4,
    trend: 'up',
    trendValue: 3,
    id: 'user_004',
    name: 'Sarah Jenkins',
    avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80',
    title: 'Business English Pro',
    language: 'en',
    level: 'B2 Trung Cấp',
    completedLessons: 13,
    totalLessons: 16,
    streakDays: 20,
    accuracy: 93,
    xp: 3450,
    coins: 430,
    isCurrentUser: false,
    role: 'Học Viên Chăm Chỉ'
  },
  {
    rank: 5,
    trend: 'up',
    trendValue: 2,
    id: 'current_user',
    name: 'Vua Xứ Thanh',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
    title: 'Học Viên Tiên Phong Slanguage',
    language: 'ja',
    level: 'Sơ Cấp N5+',
    completedLessons: 12,
    totalLessons: 16,
    streakDays: 14,
    accuracy: 92,
    xp: 2450,
    coins: 120,
    isCurrentUser: true,
    role: 'Học viên Hiện tại'
  },
  {
    rank: 6,
    trend: 'same',
    trendValue: 0,
    id: 'user_006',
    name: 'Daiki Tanaka',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
    title: 'Kanji Samurai',
    language: 'ja',
    level: 'N3 Giao Tiếp',
    completedLessons: 11,
    totalLessons: 16,
    streakDays: 16,
    accuracy: 91,
    xp: 2320,
    coins: 350,
    isCurrentUser: false,
    role: 'Học viên'
  },
  {
    rank: 7,
    trend: 'down',
    trendValue: 2,
    id: 'user_007',
    name: 'Trần Bảo Nam',
    avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80',
    title: 'Chuyên Gia Văn Hóa Việt',
    language: 'vi',
    level: 'Trung Cấp',
    completedLessons: 10,
    totalLessons: 16,
    streakDays: 12,
    accuracy: 89,
    xp: 2180,
    coins: 490,
    isCurrentUser: false,
    role: 'Học viên'
  },
  {
    rank: 8,
    trend: 'up',
    trendValue: 1,
    id: 'user_008',
    name: 'Emily Watson',
    avatar: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=150&auto=format&fit=crop&q=80',
    title: 'Phát Âm Chuẩn Anh - Mỹ',
    language: 'en',
    level: 'B1 Cơ Bản',
    completedLessons: 9,
    totalLessons: 16,
    streakDays: 10,
    accuracy: 88,
    xp: 1950,
    coins: 260,
    isCurrentUser: false,
    role: 'Học viên'
  },
  {
    rank: 9,
    trend: 'down',
    trendValue: 1,
    id: 'user_009',
    name: 'Lê Hoàng Yến',
    avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150&auto=format&fit=crop&q=80',
    title: 'Ngữ Pháp N4 Tốc Hành',
    language: 'ja',
    level: 'N4 Trung Cấp',
    completedLessons: 8,
    totalLessons: 16,
    streakDays: 9,
    accuracy: 87,
    xp: 1820,
    coins: 380,
    isCurrentUser: false,
    role: 'Học viên'
  },
  {
    rank: 10,
    trend: 'same',
    trendValue: 0,
    id: 'user_010',
    name: 'Lucas Moreau',
    avatar: 'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?w=150&auto=format&fit=crop&q=80',
    title: 'Giao Tiếp Hàng Ngày',
    language: 'en',
    level: 'A2 Căn Bản',
    completedLessons: 7,
    totalLessons: 16,
    streakDays: 8,
    accuracy: 85,
    xp: 1640,
    coins: 210,
    isCurrentUser: false,
    role: 'Học viên'
  },
  {
    rank: 11,
    trend: 'up',
    trendValue: 2,
    id: 'user_011',
    name: 'Aoi Morita',
    avatar: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=150&auto=format&fit=crop&q=80',
    title: 'Hội Thoại Tokyo',
    language: 'ja',
    level: 'N5 Cơ Bản',
    completedLessons: 6,
    totalLessons: 16,
    streakDays: 7,
    accuracy: 84,
    xp: 1520,
    coins: 290,
    isCurrentUser: false,
    role: 'Học viên Mới'
  },
  {
    rank: 12,
    trend: 'same',
    trendValue: 0,
    id: 'user_012',
    name: 'Phạm Quốc Huy',
    avatar: 'https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?w=150&auto=format&fit=crop&q=80',
    title: 'Luyện Giọng Địa Phương',
    language: 'vi',
    level: 'Căn Bản',
    completedLessons: 5,
    totalLessons: 16,
    streakDays: 6,
    accuracy: 82,
    xp: 1380,
    coins: 180,
    isCurrentUser: false,
    role: 'Học viên'
  }
];

class LeaderboardApp {
  private learners: LearnerRank[] = [...INITIAL_LEARNERS];
  private boardType: BoardType = 'xp';
  private timeFilter: TimeFilter = 'week';
  private sortFilter: SortFilter = 'xp';
  private langFilter: LangFilter = 'all';
  private searchQuery: string = '';
  private currentPage: number = 1;
  private readonly itemsPerPage: number = 6;

  // DOM references
  private podiumTop1El: HTMLElement | null = null;
  private podiumTop2El: HTMLElement | null = null;
  private podiumTop3El: HTMLElement | null = null;
  private tableBodyEl: HTMLElement | null = null;
  private userStickyBarEl: HTMLElement | null = null;
  private searchInputEl: HTMLInputElement | null = null;
  private totalParticipantsEl: HTMLElement | null = null;
  private topScoreEl: HTMLElement | null = null;
  private championNameEl: HTMLElement | null = null;

  // Dynamic board mode DOM references
  private championLabelEl: HTMLElement | null = null;
  private championSubEl: HTMLElement | null = null;
  private recordLabelEl: HTMLElement | null = null;
  private recordSubEl: HTMLElement | null = null;
  private totalLabelEl: HTMLElement | null = null;
  private totalSubEl: HTMLElement | null = null;
  private sortMainMetricBtnEl: HTMLButtonElement | null = null;
  private podiumSectionTitleEl: HTMLElement | null = null;
  private tableTitleTextEl: HTMLElement | null = null;
  private tableMetricHeaderEl: HTMLElement | null = null;

  constructor() {
    if (localStorage.getItem('slanguage_is_logged_in') !== 'true') {
      window.location.replace('../login/index.html');
      return;
    }
    this.init();
  }

  public init(): void {
    this.bindDOM();
    this.bindNavbarDropdowns();
    this.syncNavbarStats();
    this.bindEvents();
    this.applyFiltersAndSort();
    this.render();
  }

  private bindDOM(): void {
    this.podiumTop1El = document.getElementById('podiumTop1');
    this.podiumTop2El = document.getElementById('podiumTop2');
    this.podiumTop3El = document.getElementById('podiumTop3');
    this.tableBodyEl = document.getElementById('leaderboardTableBody');
    this.userStickyBarEl = document.getElementById('userStickyBar');
    this.searchInputEl = document.getElementById('leaderboardSearchInput') as HTMLInputElement | null;
    this.totalParticipantsEl = document.getElementById('totalParticipantsVal');
    this.topScoreEl = document.getElementById('topScoreVal');
    this.championNameEl = document.getElementById('championNameVal');

    this.championLabelEl = document.getElementById('championLabel');
    this.championSubEl = document.getElementById('championSub');
    this.recordLabelEl = document.getElementById('recordLabel');
    this.recordSubEl = document.getElementById('recordSub');
    this.totalLabelEl = document.getElementById('totalLabel');
    this.totalSubEl = document.getElementById('totalSub');
    this.sortMainMetricBtnEl = document.getElementById('sortMainMetricBtn') as HTMLButtonElement | null;
    this.podiumSectionTitleEl = document.getElementById('podiumSectionTitle');
    this.tableTitleTextEl = document.getElementById('tableTitleText');
    this.tableMetricHeaderEl = document.getElementById('tableMetricHeader');
  }

  private bindNavbarDropdowns(): void {
    const langDropdown = document.getElementById('langDropdown');
    const langDropdownBtn = document.getElementById('langDropdownBtn');
    const userDropdown = document.getElementById('userDropdown');
    const userDropdownBtn = document.getElementById('userDropdownBtn');

    if (langDropdown && langDropdownBtn) {
      langDropdownBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = langDropdown.classList.contains('open') || langDropdown.classList.contains('active');
        if (isOpen) {
          langDropdown.classList.remove('open', 'active', 'show');
          langDropdownBtn.setAttribute('aria-expanded', 'false');
        } else {
          langDropdown.classList.add('open', 'active', 'show');
          langDropdownBtn.setAttribute('aria-expanded', 'true');
          if (userDropdown && userDropdownBtn) {
            userDropdown.classList.remove('open', 'active', 'show');
            userDropdownBtn.setAttribute('aria-expanded', 'false');
          }
        }
      });
    }

    if (userDropdown && userDropdownBtn) {
      userDropdownBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = userDropdown.classList.contains('open') || userDropdown.classList.contains('active');
        if (isOpen) {
          userDropdown.classList.remove('open', 'active', 'show');
          userDropdownBtn.setAttribute('aria-expanded', 'false');
        } else {
          userDropdown.classList.add('open', 'active', 'show');
          userDropdownBtn.setAttribute('aria-expanded', 'true');
          if (langDropdown && langDropdownBtn) {
            langDropdown.classList.remove('open', 'active', 'show');
            langDropdownBtn.setAttribute('aria-expanded', 'false');
          }
        }
      });
    }

    document.addEventListener('click', (e) => {
      const target = e.target as Node;
      if (langDropdown && !langDropdown.contains(target)) {
        langDropdown.classList.remove('open', 'active', 'show');
        if (langDropdownBtn) langDropdownBtn.setAttribute('aria-expanded', 'false');
      }
      if (userDropdown && !userDropdown.contains(target)) {
        userDropdown.classList.remove('open', 'active', 'show');
        if (userDropdownBtn) userDropdownBtn.setAttribute('aria-expanded', 'false');
      }
    });

    const langItems = document.querySelectorAll<HTMLElement>('.lang-dropdown-item');
    const currentLangFlag = document.getElementById('currentLangFlag') as HTMLImageElement | null;
    const currentLangLabel = document.getElementById('currentLangLabel');

    const langMap: Record<string, { name: string; flag: string }> = {
      ja: { name: 'Tiếng Nhật', flag: '../assets/flags/flag-jp.png' },
      en: { name: 'English', flag: '../assets/flags/flag-en.png' },
      vi: { name: 'Tiếng Việt', flag: '../assets/flags/flag-vn.png' },
    };

    langItems.forEach(item => {
      item.addEventListener('click', () => {
        const lang = item.getAttribute('data-lang') || 'ja';
        if (langMap[lang]) {
          localStorage.setItem('slanguage_user_lang', lang);
          localStorage.setItem('slanguage_active_language', lang);
          localStorage.setItem('slanguage_current_lang', lang);

          const rawUser = localStorage.getItem('slanguage_current_user');
          if (rawUser) {
            try {
              const u = JSON.parse(rawUser);
              u.targetLanguage = lang;
              localStorage.setItem('slanguage_current_user', JSON.stringify(u));
            } catch (e) {}
          }

          const rawDb = localStorage.getItem('slanguage_users_db');
          if (rawDb) {
            try {
              const db = JSON.parse(rawDb);
              const userEmail = localStorage.getItem('slanguage_user_email');
              if (Array.isArray(db) && userEmail) {
                const uIdx = db.findIndex((x: any) => x.email === userEmail);
                if (uIdx !== -1) {
                  db[uIdx].targetLanguage = lang;
                  localStorage.setItem('slanguage_users_db', JSON.stringify(db));
                }
              }
            } catch (e) {}
          }

          window.dispatchEvent(new CustomEvent('slanguage_data_changed'));

          if (currentLangLabel) currentLangLabel.textContent = langMap[lang].name;
          if (currentLangFlag) currentLangFlag.src = langMap[lang].flag;
          langItems.forEach(i => i.classList.remove('active'));
          item.classList.add('active');
        }
        if (langDropdown) {
          langDropdown.classList.remove('open', 'active', 'show');
          if (langDropdownBtn) langDropdownBtn.setAttribute('aria-expanded', 'false');
        }
      });
    });

    const logoutBtn = document.getElementById('navLogoutItem');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => {
        localStorage.setItem('slanguage_is_logged_in', 'false');
      });
    }
  }

  private syncNavbarStats(): void {
    const isLoggedIn = localStorage.getItem('slanguage_is_logged_in') === 'true';
    if (isLoggedIn) {
      document.body.classList.add('user-authenticated');
      document.body.classList.remove('user-guest');
    } else {
      document.body.classList.add('user-guest');
      document.body.classList.remove('user-authenticated');
    }

    const langItems = document.querySelectorAll<HTMLElement>('.lang-dropdown-item');
    const currentLangFlag = document.getElementById('currentLangFlag') as HTMLImageElement | null;
    const currentLangLabel = document.getElementById('currentLangLabel');

    const langMap: Record<string, { name: string; flag: string }> = {
      ja: { name: 'Tiếng Nhật', flag: '../assets/flags/flag-jp.png' },
      en: { name: 'English', flag: '../assets/flags/flag-en.png' },
      vi: { name: 'Tiếng Việt', flag: '../assets/flags/flag-vn.png' },
    };

    langItems.forEach(item => {
      item.style.display = 'flex';
    });

    let savedLang = localStorage.getItem('slanguage_user_lang') || localStorage.getItem('slanguage_active_language') || localStorage.getItem('slanguage_current_lang') || 'ja';
    if (!langMap[savedLang]) {
      savedLang = 'ja';
    }
    localStorage.setItem('slanguage_user_lang', savedLang);
    localStorage.setItem('slanguage_active_language', savedLang);
    localStorage.setItem('slanguage_current_lang', savedLang);

    if (langMap[savedLang]) {
      if (currentLangLabel) currentLangLabel.textContent = langMap[savedLang].name;
      if (currentLangFlag) currentLangFlag.src = langMap[savedLang].flag;
      langItems.forEach(item => {
        if (item.getAttribute('data-lang') === savedLang) {
          item.classList.add('active');
        } else {
          item.classList.remove('active');
        }
      });
    }

    const savedXP = localStorage.getItem('slanguage_user_xp');
    const savedCoins = localStorage.getItem('slanguage_user_coins');
    const savedName = localStorage.getItem('slanguage_user_name');
    const userObj = this.learners ? this.learners.find(l => l.isCurrentUser) : null;

    if (savedName) {
      if (userObj) userObj.name = savedName;
      const nameEl = document.getElementById('headerUserName');
      if (nameEl) nameEl.textContent = savedName;
      const dropNameEl = document.getElementById('dropdownUserName');
      if (dropNameEl) dropNameEl.textContent = savedName;
    }

    if (savedXP !== null) {
      const clean = savedXP.replace(/[^0-9]/g, '');
      const parsed = parseInt(clean, 10);
      if (!isNaN(parsed)) {
        if (userObj) userObj.xp = parsed;
        const xpEl = document.getElementById('headerXPVal');
        if (xpEl) xpEl.textContent = `${parsed.toLocaleString()} XP`;
        const dropXpEl = document.getElementById('dropdownXPVal');
        if (dropXpEl) dropXpEl.textContent = `${parsed.toLocaleString()} XP`;
      }
    }

    const savedHearts = localStorage.getItem('slanguage_user_hearts');
    const heartsNum = savedHearts !== null ? Math.max(0, Math.min(5, parseInt(savedHearts, 10))) : 5;
    const heartsEl = document.getElementById('headerHeartsVal');
    if (heartsEl) heartsEl.textContent = `${heartsNum}/5`;
    const dropHeartsEl = document.getElementById('dropdownHeartsVal');
    if (dropHeartsEl) dropHeartsEl.textContent = `${heartsNum}/5`;

    const savedStreak = localStorage.getItem('slanguage_user_streak') || '18';
    const streakEl = document.getElementById('headerStreakVal');
    if (streakEl) streakEl.textContent = `${savedStreak} Ngày`;
    const dropStreakEl = document.getElementById('dropdownStreakVal');
    if (dropStreakEl) dropStreakEl.textContent = `${savedStreak} Ngày`;

    if (savedCoins !== null && userObj) {
      const clean = savedCoins.replace(/[^0-9]/g, '');
      const parsed = parseInt(clean, 10);
      if (!isNaN(parsed)) {
        userObj.coins = parsed;
      }
    }
  }

  private bindEvents(): void {
    // Board Type Tabs (EXP vs Coin)
    const boardTabs = document.querySelectorAll<HTMLButtonElement>('[data-board-type]');
    boardTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const type = (tab.getAttribute('data-board-type') as BoardType) || 'xp';
        if (this.boardType === type) return;

        boardTabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        this.boardType = type;

        // Update default sort filter based on board type
        if (this.boardType === 'xp') {
          this.sortFilter = 'xp';
          if (this.sortMainMetricBtnEl) {
            this.sortMainMetricBtnEl.setAttribute('data-sort-filter', 'xp');
            this.sortMainMetricBtnEl.innerHTML = '<i class="fa-solid fa-star"></i> Sắp xếp: Điểm XP';
          }
        } else {
          this.sortFilter = 'coin';
          if (this.sortMainMetricBtnEl) {
            this.sortMainMetricBtnEl.setAttribute('data-sort-filter', 'coin');
            this.sortMainMetricBtnEl.innerHTML = '<i class="fa-solid fa-coins"></i> Sắp xếp: Số dư Coin';
          }
        }

        // Reset sort buttons active state to main metric
        const sortBtns = document.querySelectorAll<HTMLButtonElement>('[data-sort-filter]');
        sortBtns.forEach(b => b.classList.remove('active'));
        if (this.sortMainMetricBtnEl) {
          this.sortMainMetricBtnEl.classList.add('active');
        }

        this.currentPage = 1;
        this.applyFiltersAndSort();
        this.render();
      });
    });

    // Time Filter Buttons
    const timeBtns = document.querySelectorAll<HTMLButtonElement>('[data-time-filter]');
    timeBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        timeBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.timeFilter = (btn.getAttribute('data-time-filter') as TimeFilter) || 'week';
        this.applyFiltersAndSort();
        this.render();
      });
    });

    // Sort Filter Buttons
    const sortBtns = document.querySelectorAll<HTMLButtonElement>('[data-sort-filter]');
    sortBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        sortBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.sortFilter = (btn.getAttribute('data-sort-filter') as SortFilter) || (this.boardType === 'coin' ? 'coin' : 'xp');
        this.applyFiltersAndSort();
        this.render();
      });
    });

    // Language Filter Tabs
    const langBtns = document.querySelectorAll<HTMLButtonElement>('[data-lang-tab]');
    langBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        langBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.langFilter = (btn.getAttribute('data-lang-tab') as LangFilter) || 'all';
        this.applyFiltersAndSort();
        this.render();
      });
    });

    // Search Input
    if (this.searchInputEl) {
      this.searchInputEl.addEventListener('input', (e) => {
        this.searchQuery = (e.target as HTMLInputElement).value.trim().toLowerCase();
        this.currentPage = 1;
        this.render();
      });
    }

    // Scroll to current user button
    const btnScrollToMe = document.getElementById('btnScrollToMe');
    if (btnScrollToMe) {
      btnScrollToMe.addEventListener('click', () => {
        const row = document.querySelector('.table-row.current-user');
        if (row) {
          row.scrollIntoView({ behavior: 'smooth', block: 'center' });
          row.classList.add('highlight-pulse');
          setTimeout(() => row.classList.remove('highlight-pulse'), 2000);
        } else {
          // If user is on another page, find which page has user and navigate
          const userIdx = this.learners.findIndex(l => l.isCurrentUser);
          if (userIdx !== -1) {
            this.currentPage = Math.floor(userIdx / this.itemsPerPage) + 1;
            this.render();
            setTimeout(() => {
              const r = document.querySelector('.table-row.current-user');
              if (r) {
                r.scrollIntoView({ behavior: 'smooth', block: 'center' });
                r.classList.add('highlight-pulse');
                setTimeout(() => r.classList.remove('highlight-pulse'), 2000);
              }
            }, 100);
          }
        }
      });
    }

    // Pagination Buttons
    const prevBtn = document.getElementById('prevPageBtn');
    if (prevBtn) {
      prevBtn.addEventListener('click', () => {
        if (this.currentPage > 1) {
          this.currentPage--;
          this.render();
        }
      });
    }

    const nextBtn = document.getElementById('nextPageBtn');
    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        const totalPages = Math.max(1, Math.ceil(this.learners.length / this.itemsPerPage));
        if (this.currentPage < totalPages) {
          this.currentPage++;
          this.render();
        }
      });
    }

    // Modal Close Events
    const modalOverlay = document.getElementById('learnerModalOverlay');
    const modalCloseBtn = document.getElementById('modalCloseBtn');
    if (modalCloseBtn && modalOverlay) {
      modalCloseBtn.addEventListener('click', () => {
        modalOverlay.classList.remove('active');
      });
    }
    if (modalOverlay) {
      modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) {
          modalOverlay.classList.remove('active');
        }
      });
    }

    // Global Link Page Transition with loading video
    const overlay = document.getElementById('slanguageLoadingOverlay');
    if (overlay) overlay.style.pointerEvents = 'none';

    const navLinks = document.querySelectorAll<HTMLAnchorElement>('a[href]');
    navLinks.forEach(link => {
      const href = link.getAttribute('href');
      if (
        href &&
        !href.startsWith('#') &&
        !href.startsWith('javascript:') &&
        !link.hasAttribute('target') &&
        !href.startsWith('mailto:') &&
        !href.startsWith('tel:')
      ) {
        link.addEventListener('click', (e: MouseEvent) => {
          const cleanHref = href.split('?')[0].split('#')[0];
          // If clicking on current page, smooth scroll to top instead of reloading or freezing
          if (
            cleanHref === './index.html' ||
            cleanHref === 'index.html' ||
            cleanHref === '' ||
            cleanHref.endsWith('/leaderboard/') ||
            cleanHref.endsWith('/leaderboard/index.html')
          ) {
            e.preventDefault();
            window.scrollTo({ top: 0, behavior: 'smooth' });
            return;
          }

          e.preventDefault();
          this.triggerLoadingAndRedirect(href);
        });
      }
    });

    // Auto-sync Header Stats when storage or tab focus changes
    const syncHeaderStats = () => {
      this.syncNavbarStats();
      this.render();
    };
    window.addEventListener('storage', syncHeaderStats);
    window.addEventListener('focus', syncHeaderStats);
    window.addEventListener('slanguage_data_changed', syncHeaderStats);

    window.addEventListener('pageshow', () => {
      syncHeaderStats();
      const vOverlay = document.getElementById('slanguageLoadingOverlay');
      const video = document.getElementById('loadingVideoPlayer') as HTMLVideoElement | null;
      if (vOverlay) {
        vOverlay.classList.remove('active');
        vOverlay.style.pointerEvents = 'none';
      }
      if (video) {
        video.pause();
        video.muted = true;
        video.currentTime = 0;
      }
    });

    window.addEventListener('pagehide', () => {
      const video = document.getElementById('loadingVideoPlayer') as HTMLVideoElement | null;
      if (video) {
        video.pause();
        video.muted = true;
      }
    });
  }

  private triggerLoadingAndRedirect(targetUrl: string, duration: number = 700): void {
    const overlay = document.getElementById('slanguageLoadingOverlay');
    const video = document.getElementById('loadingVideoPlayer') as HTMLVideoElement | null;
    if (overlay) {
      overlay.classList.add('active');
      overlay.style.pointerEvents = 'auto';
      if (video) {
        video.muted = true;
        video.currentTime = 0;
        video.play().catch(() => {});
      }
    }
    setTimeout(() => {
      if (video) {
        video.pause();
        video.muted = true;
      }
      if (overlay) {
        overlay.classList.remove('active');
        overlay.style.pointerEvents = 'none';
      }
      window.location.href = targetUrl;
    }, duration);

    // Failsafe unlock if navigation takes too long
    setTimeout(() => {
      if (overlay) {
        overlay.classList.remove('active');
        overlay.style.pointerEvents = 'none';
      }
    }, 1800);
  }
  private applyFiltersAndSort(): void {
    // Calculate simulated multiplier based on timeFilter
    const multiplier = this.timeFilter === 'today' ? 0.22 :
                       this.timeFilter === 'week' ? 1.0 :
                       this.timeFilter === 'month' ? 3.6 : 8.5;

    const savedCoins = localStorage.getItem('slanguage_user_coins');
    const savedXP = localStorage.getItem('slanguage_user_xp');

    this.learners = INITIAL_LEARNERS.map(l => {
      let finalXP = Math.round(l.xp * multiplier);
      let finalCoins = l.coins;

      if (l.isCurrentUser) {
        if (savedXP !== null) {
          const cleanXP = savedXP.replace(/[^0-9]/g, '');
          const p = parseInt(cleanXP, 10);
          if (!isNaN(p)) finalXP = p;
        }
        if (savedCoins !== null) {
          const cleanC = savedCoins.replace(/[^0-9]/g, '');
          const p = parseInt(cleanC, 10);
          if (!isNaN(p)) finalCoins = p;
        }
      }

      return {
        ...l,
        xp: finalXP,
        coins: finalCoins
      };
    });

    // Apply Sorting based on active boardType and sortFilter
    if (this.boardType === 'coin' && (this.sortFilter === 'coin' || this.sortFilter === 'xp')) {
      this.learners.sort((a, b) => b.coins - a.coins);
    } else if (this.sortFilter === 'xp') {
      this.learners.sort((a, b) => b.xp - a.xp);
    } else if (this.sortFilter === 'coin') {
      this.learners.sort((a, b) => b.coins - a.coins);
    } else if (this.sortFilter === 'streak') {
      this.learners.sort((a, b) => b.streakDays - a.streakDays);
    } else if (this.sortFilter === 'lessons') {
      this.learners.sort((a, b) => b.completedLessons - a.completedLessons);
    } else if (this.sortFilter === 'accuracy') {
      this.learners.sort((a, b) => b.accuracy - a.accuracy);
    }

    // Re-assign ranks
    this.learners.forEach((l, index) => {
      l.rank = index + 1;
    });
  }

  private getFilteredList(): LearnerRank[] {
    return this.learners.filter(l => {
      const matchLang = this.langFilter === 'all' || l.language === this.langFilter;
      const matchSearch = this.searchQuery === '' ||
                          l.name.toLowerCase().includes(this.searchQuery) ||
                          l.title.toLowerCase().includes(this.searchQuery) ||
                          l.level.toLowerCase().includes(this.searchQuery);
      return matchLang && matchSearch;
    });
  }

  public render(): void {
    const filtered = this.getFilteredList();

    // Update Top 3 Podium
    this.renderPodium(filtered);

    // Update Detailed Table
    this.renderTable(filtered);

    // Update Summary Header Cards
    if (this.learners.length > 0) {
      const top1 = this.learners[0];
      if (this.boardType === 'xp') {
        if (this.championLabelEl) this.championLabelEl.textContent = 'Quán quân tuần này';
        if (this.championNameEl) this.championNameEl.textContent = top1.name;
        if (this.championSubEl) this.championSubEl.textContent = `${top1.xp.toLocaleString()} XP • ${top1.level}`;
        if (this.recordLabelEl) this.recordLabelEl.textContent = 'Điểm XP kỷ lục';
        if (this.topScoreEl) this.topScoreEl.textContent = `${top1.xp.toLocaleString()} XP`;
        if (this.recordSubEl) this.recordSubEl.textContent = 'Kỷ lục tuần • +420 XP hôm nay';
        if (this.totalLabelEl) this.totalLabelEl.textContent = 'Tổng người tham gia';
        if (this.totalParticipantsEl) this.totalParticipantsEl.textContent = `${(1280).toLocaleString()} Học Viên`;
        if (this.totalSubEl) this.totalSubEl.textContent = 'Đang hoạt động sôi nổi';
      } else {
        if (this.championLabelEl) this.championLabelEl.textContent = 'Đại Gia Vô Địch Coin 👑';
        if (this.championNameEl) this.championNameEl.textContent = top1.name;
        if (this.championSubEl) this.championSubEl.textContent = `${top1.coins.toLocaleString()} Coin • Phú Hộ Toàn Server`;
        if (this.recordLabelEl) this.recordLabelEl.textContent = 'Kho Coin kỷ lục';
        if (this.topScoreEl) this.topScoreEl.textContent = `${top1.coins.toLocaleString()} Coin`;
        if (this.recordSubEl) this.recordSubEl.textContent = 'Tích lũy từ Shop quy đổi & Thử thách';
        if (this.totalLabelEl) this.totalLabelEl.textContent = 'Tổng Coin lưu hành';
        const totalCoins = this.learners.reduce((sum, l) => sum + l.coins, 0) + 18500;
        if (this.totalParticipantsEl) this.totalParticipantsEl.textContent = `${totalCoins.toLocaleString()} Coin`;
        if (this.totalSubEl) this.totalSubEl.textContent = 'Dùng sắm sửa vật phẩm trong Shop';
      }
    }

    // Update Sticky Current User Bar
    this.renderStickyBar();
  }

  private renderPodium(list: LearnerRank[]): void {
    const top1 = list.find(l => l.rank === 1) || this.learners[0];
    const top2 = list.find(l => l.rank === 2) || this.learners[1];
    const top3 = list.find(l => l.rank === 3) || this.learners[2];

    if (this.podiumTop1El && top1) {
      this.podiumTop1El.innerHTML = this.buildPodiumCardHTML(top1, 1);
    }
    if (this.podiumTop2El && top2) {
      this.podiumTop2El.innerHTML = this.buildPodiumCardHTML(top2, 2);
    }
    if (this.podiumTop3El && top3) {
      this.podiumTop3El.innerHTML = this.buildPodiumCardHTML(top3, 3);
    }
  }

  private buildPodiumCardHTML(learner: LearnerRank, place: 1 | 2 | 3): string {
    const placeBadge = this.boardType === 'xp' ?
      (place === 1 ? '👑 Quán Quân Tuần' : place === 2 ? '🥈 Hạng Nhì' : '🥉 Hạng Ba') :
      (place === 1 ? '👑 Đại Gia Vô Địch' : place === 2 ? '🥈 Phú Hộ Xuất Sắc' : '🥉 Quý Tộc Slanguage');

    const placeClass = place === 1 ? 'top-1' : place === 2 ? 'top-2' : 'top-3';
    const placeMedal = place === 1 ? '🥇' : place === 2 ? '🥈' : '🥉';
    const flagImg = learner.language === 'ja' ? '../assets/flags/flag-jp.png' :
                    learner.language === 'en' ? '../assets/flags/flag-en.png' : '../assets/flags/flag-vn.png';

    const metricPillHTML = this.boardType === 'xp' ? `
      <div class="podium-xp-pill">
        <i class="fa-solid fa-star"></i>
        <span class="xp-val">${learner.xp.toLocaleString()} XP</span>
      </div>
    ` : `
      <div class="podium-coin-pill">
        <i class="fa-solid fa-coins"></i>
        <span class="coin-val">${learner.coins.toLocaleString()} Coin</span>
      </div>
    `;

    return `
      <div class="podium-card ${placeClass}">
        <div class="podium-crown-badge">
          <span>${placeBadge}</span>
        </div>
        
        <div class="podium-avatar-box">
          <img src="${learner.avatar}" alt="${learner.name}" class="podium-avatar">
          <div class="podium-rank-badge">${placeMedal}</div>
        </div>

        <div class="podium-info">
          <h3 class="podium-name">${learner.name}</h3>
          <div class="podium-title-tag">
            <img src="${flagImg}" alt="${learner.language}" class="flag-mini">
            <span>${learner.title}</span>
          </div>

          ${metricPillHTML}

          <div class="podium-stats-grid">
            <div class="p-stat">
              <span class="p-val"><i class="fa-solid fa-fire fire-icon"></i> ${learner.streakDays}</span>
              <span class="p-lbl">Streak</span>
            </div>
            <div class="p-stat">
              <span class="p-val"><i class="fa-solid fa-bullseye"></i> ${learner.accuracy}%</span>
              <span class="p-lbl">Chính xác</span>
            </div>
            <div class="p-stat">
              <span class="p-val"><i class="fa-solid fa-book-open"></i> ${learner.completedLessons}/16</span>
              <span class="p-lbl">Bài học</span>
            </div>
          </div>

          <button type="button" class="btn-podium-profile" onclick="window.slanguageLeaderboardApp.showUserModal('${learner.id}')">
            <i class="fa-solid fa-id-badge"></i>
            <span>Xem Hồ Sơ</span>
          </button>
        </div>
      </div>
    `;
  }

  private renderTable(list: LearnerRank[]): void {
    if (!this.tableBodyEl) return;

    // Update table headers according to boardType
    if (this.podiumSectionTitleEl) {
      this.podiumSectionTitleEl.textContent = this.boardType === 'xp' ?
        'Top 3 Học Viên Dẫn Đầu Bảng Vàng' : 'Top 3 Đại Gia Sở Hữu Nhiều Coin Nhất';
    }
    if (this.tableTitleTextEl) {
      this.tableTitleTextEl.textContent = this.boardType === 'xp' ?
        'Bảng Xếp Hạng Chi Tiết (Xếp Theo XP)' : 'Bảng Xếp Hạng Chi Tiết (Xếp Theo Số Dư Coin)';
    }
    if (this.tableMetricHeaderEl) {
      this.tableMetricHeaderEl.textContent = this.boardType === 'xp' ?
        'Điểm Kinh Nghiệm (XP)' : 'Kho Tiền Vàng Sở Hữu (Coin)';
    }

    const paginationEl = document.getElementById('tablePagination');
    if (list.length === 0) {
      this.tableBodyEl.innerHTML = `
        <div class="table-empty-box">
          <i class="fa-solid fa-magnifying-glass"></i>
          <h4>Không tìm thấy học viên phù hợp</h4>
          <p>Thử tìm kiếm với từ khóa khác hoặc xóa bộ lọc để hiển thị đầy đủ danh sách.</p>
        </div>
      `;
      if (paginationEl) paginationEl.style.display = 'none';
      return;
    }

    const totalPages = Math.max(1, Math.ceil(list.length / this.itemsPerPage));
    if (this.currentPage > totalPages) this.currentPage = totalPages;
    const startIndex = (this.currentPage - 1) * this.itemsPerPage;
    const paginatedList = list.slice(startIndex, startIndex + this.itemsPerPage);

    const maxXP = Math.max(...this.learners.map(l => l.xp), 1);
    const maxCoins = Math.max(...this.learners.map(l => l.coins), 1);

    const rowsHTML = paginatedList.map((learner) => {
      const isCurrentUser = learner.isCurrentUser;
      const rankClass = learner.rank === 1 ? 'rank-1' :
                        learner.rank === 2 ? 'rank-2' :
                        learner.rank === 3 ? 'rank-3' : 'rank-normal';

      const trendIcon = learner.trend === 'up' ? `<span class="trend-up"><i class="fa-solid fa-caret-up"></i> +${learner.trendValue}</span>` :
                        learner.trend === 'down' ? `<span class="trend-down"><i class="fa-solid fa-caret-down"></i> -${learner.trendValue}</span>` :
                        `<span class="trend-same"><i class="fa-solid fa-minus"></i></span>`;

      const flagImg = learner.language === 'ja' ? '../assets/flags/flag-jp.png' :
                      learner.language === 'en' ? '../assets/flags/flag-en.png' : '../assets/flags/flag-vn.png';

      const langName = learner.language === 'ja' ? 'Tiếng Nhật' :
                       learner.language === 'en' ? 'English' : 'Tiếng Việt';

      const xpPercent = Math.min(100, Math.max(12, Math.round((learner.xp / maxXP) * 100)));
      const coinPercent = Math.min(100, Math.max(12, Math.round((learner.coins / maxCoins) * 100)));

      const metricColHTML = this.boardType === 'xp' ? `
        <div class="col-xp">
          <div class="xp-score-line">
            <span class="xp-number">${learner.xp.toLocaleString()} XP</span>
          </div>
          <div class="xp-progress-track">
            <div class="xp-progress-fill" style="width: ${xpPercent}%;"></div>
          </div>
        </div>
      ` : `
        <div class="col-coin">
          <div class="coin-score-line">
            <span class="coin-number"><i class="fa-solid fa-coins" style="color: #FFB703;"></i> ${learner.coins.toLocaleString()} Coin</span>
          </div>
          <div class="coin-progress-track">
            <div class="coin-progress-fill" style="width: ${coinPercent}%;"></div>
          </div>
        </div>
      `;

      return `
        <div class="table-row ${rankClass} ${isCurrentUser ? 'current-user' : ''}" data-user-id="${learner.id}">
          <div class="col-rank">
            <div class="rank-number-box">
              <span class="rank-num">#${learner.rank}</span>
              ${trendIcon}
            </div>
          </div>

          <div class="col-learner">
            <div class="learner-meta-wrap">
              <div class="avatar-wrap">
                <img src="${learner.avatar}" alt="${learner.name}" class="learner-avatar">
                ${isCurrentUser ? '<span class="user-active-dot" title="Bạn"></span>' : ''}
              </div>
              <div class="learner-text-wrap">
                <div class="learner-name-line">
                  <span class="learner-name">${learner.name}</span>
                  ${isCurrentUser ? '<span class="you-badge"><i class="fa-solid fa-user-check"></i> Bạn</span>' : ''}
                </div>
                <span class="learner-sub-title">${learner.title}</span>
              </div>
            </div>
          </div>

          <div class="col-language">
            <div class="language-pill-tag">
              <img src="${flagImg}" alt="${langName}" class="flag-mini">
              <span>${langName}</span>
            </div>
          </div>

          <div class="col-level">
            <span class="level-chip">${learner.level}</span>
            <span class="lessons-count">${learner.completedLessons}/16 bài</span>
          </div>

          <div class="col-streak">
            <div class="streak-chip-mini">
              <i class="fa-solid fa-fire fire-icon"></i>
              <span>${learner.streakDays} ngày</span>
            </div>
            <div class="accuracy-score">
              <i class="fa-solid fa-star"></i>
              <span>${learner.accuracy}%</span>
            </div>
          </div>

          ${metricColHTML}

          <div class="col-action">
            <button type="button" class="btn-row-action" title="Xem thành tích" onclick="window.slanguageLeaderboardApp.showUserModal('${learner.id}')">
              <i class="fa-solid fa-arrow-right"></i>
            </button>
          </div>
        </div>
      `;
    }).join('');

    this.tableBodyEl.innerHTML = rowsHTML;
    this.renderPagination(totalPages);
  }

  private renderPagination(totalPages: number): void {
    const paginationEl = document.getElementById('tablePagination');
    if (!paginationEl) return;

    if (totalPages <= 1) {
      paginationEl.style.display = 'none';
      return;
    }
    paginationEl.style.display = 'flex';

    const prevBtn = document.getElementById('prevPageBtn') as HTMLButtonElement | null;
    const nextBtn = document.getElementById('nextPageBtn') as HTMLButtonElement | null;
    const pageNumbersGroup = document.getElementById('pageNumbersGroup');

    if (prevBtn) {
      prevBtn.disabled = this.currentPage === 1;
    }
    if (nextBtn) {
      nextBtn.disabled = this.currentPage === totalPages;
    }

    if (pageNumbersGroup) {
      let pagesHTML = '';
      for (let p = 1; p <= totalPages; p++) {
        const isActive = p === this.currentPage;
        pagesHTML += `<button type="button" class="page-num-btn ${isActive ? 'active' : ''}" data-page="${p}">${p}</button>`;
      }
      pageNumbersGroup.innerHTML = pagesHTML;

      pageNumbersGroup.querySelectorAll<HTMLButtonElement>('.page-num-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const page = parseInt(btn.getAttribute('data-page') || '1', 10);
          if (page !== this.currentPage) {
            this.currentPage = page;
            this.render();
            const tableSection = document.querySelector('.detailed-table-section');
            if (tableSection) {
              tableSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
          }
        });
      });
    }
  }

  private renderStickyBar(): void {
    if (!this.userStickyBarEl) return;
    const currentUser = this.learners.find(l => l.isCurrentUser);
    if (!currentUser) return;

    const top3User = this.learners.find(l => l.rank === 3);
    const stickyTextEl = document.getElementById('stickyUserText');
    if (!stickyTextEl) return;

    if (this.boardType === 'xp') {
      const xpDiff = top3User ? Math.max(0, top3User.xp - currentUser.xp + 50) : 0;
      stickyTextEl.innerHTML = `
        <strong>Hạng #${currentUser.rank}</strong> • ${currentUser.name} • 
        <span class="xp-bold">${currentUser.xp.toLocaleString()} XP</span>
        ${xpDiff > 0 ? ` <span class="xp-tip">(Còn ${xpDiff.toLocaleString()} XP nữa để lọt Top 3!)</span>` : ' <span class="xp-tip gold">🎉 Bạn đang nằm trong Top 3!</span>'}
      `;
    } else {
      const coinDiff = top3User ? Math.max(0, top3User.coins - currentUser.coins + 10) : 0;
      stickyTextEl.innerHTML = `
        <strong>Hạng #${currentUser.rank}</strong> • ${currentUser.name} • 
        <span class="coin-bold"><i class="fa-solid fa-coins"></i> ${currentUser.coins.toLocaleString()} Coin</span>
        ${coinDiff > 0 ? ` <span class="xp-tip">(Còn ${coinDiff.toLocaleString()} Coin nữa để lọt Top 3 Đại Gia!)</span>` : ' <span class="xp-tip gold">🎉 Bạn đang nằm trong Top 3 Đại Gia Coin!</span>'}
      `;
    }
  }

  public showUserModal(userId: string): void {
    const user = this.learners.find(l => l.id === userId);
    if (!user) return;

    const modalOverlay = document.getElementById('learnerModalOverlay');
    const modalContent = document.getElementById('modalLearnerContent');
    if (!modalOverlay || !modalContent) {
      alert(`🏆 Học viên: ${user.name} - Hạng #${user.rank} (${user.xp.toLocaleString()} XP | ${user.coins.toLocaleString()} Coin)`);
      return;
    }

    const flagImg = user.language === 'ja' ? '../assets/flags/flag-jp.png' :
                    user.language === 'en' ? '../assets/flags/flag-en.png' : '../assets/flags/flag-vn.png';
    const langName = user.language === 'ja' ? 'Tiếng Nhật' :
                     user.language === 'en' ? 'English' : 'Tiếng Việt';

    modalContent.innerHTML = `
      <div class="modal-learner-header">
        <div class="modal-avatar-frame">
          <img src="${user.avatar}" alt="${user.name}" class="modal-avatar">
          <span class="modal-rank-tag">#${user.rank}</span>
        </div>
        <div class="modal-learner-titles">
          <h3 class="modal-learner-name">${user.name}</h3>
          <span class="modal-badge-role">${user.role}</span>
          <div class="modal-lang-chip">
            <img src="${flagImg}" alt="${langName}" class="flag-mini">
            <span>${user.title}</span>
          </div>
        </div>
      </div>

      <div class="modal-balances-grid">
        <div class="modal-xp-banner">
          <div class="modal-xp-label">Điểm XP Tích Lũy</div>
          <div class="modal-xp-score"><i class="fa-solid fa-star"></i> ${user.xp.toLocaleString()} XP</div>
        </div>
        <div class="modal-coin-banner">
          <div class="modal-coin-label">Kho Tiền Vàng Sở Hữu</div>
          <div class="modal-coin-score"><i class="fa-solid fa-coins" style="color: #FFB703;"></i> ${user.coins.toLocaleString()} Coin</div>
        </div>
      </div>

      <div class="modal-stats-grid">
        <div class="modal-stat-box">
          <i class="fa-solid fa-fire fire-icon"></i>
          <span class="num">${user.streakDays} Ngày</span>
          <span class="lbl">Chuỗi học liên tục</span>
        </div>
        <div class="modal-stat-box">
          <i class="fa-solid fa-bullseye accuracy-icon"></i>
          <span class="num">${user.accuracy}%</span>
          <span class="lbl">Độ chính xác trung bình</span>
        </div>
        <div class="modal-stat-box">
          <i class="fa-solid fa-book-open lessons-icon"></i>
          <span class="num">${user.completedLessons}/16</span>
          <span class="lbl">Bài học hoàn thành</span>
        </div>
        <div class="modal-stat-box">
          <i class="fa-solid fa-award rank-icon"></i>
          <span class="num">${user.level}</span>
          <span class="lbl">Trình độ hiện tại</span>
        </div>
      </div>

      <div class="modal-footer-actions">
        <button type="button" class="btn-modal-close" onclick="document.getElementById('learnerModalOverlay').classList.remove('active')">
          <i class="fa-solid fa-check"></i> Đã hiểu
        </button>
      </div>
    `;

    modalOverlay.classList.add('active');
  }
}

// Khởi chạy khi DOM sẵn sàng
function initSlanguageLeaderboard(): void {
  (window as any).slanguageLeaderboardApp = new LeaderboardApp();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initSlanguageLeaderboard);
} else {
  initSlanguageLeaderboard();
}

// ================= MOBILE SIDE DRAWER CONTROLLER =================
function initMobileSideDrawer(): void {
  const hamburgerBtn = document.getElementById('navHamburgerBtn');
  const sideDrawer = document.getElementById('sideDrawer');
  const drawerBackdrop = document.getElementById('drawerBackdrop');
  const drawerCloseBtn = document.getElementById('drawerCloseBtn');

  if (!hamburgerBtn || !sideDrawer || !drawerBackdrop) return;

  const openDrawer = (e: Event): void => {
    e.stopPropagation();
    sideDrawer.classList.add('open');
    drawerBackdrop.classList.add('open');
    document.body.classList.add('drawer-open');
    hamburgerBtn.setAttribute('aria-expanded', 'true');
  };

  const closeDrawer = (): void => {
    sideDrawer.classList.remove('open');
    drawerBackdrop.classList.remove('open');
    document.body.classList.remove('drawer-open');
    hamburgerBtn.setAttribute('aria-expanded', 'false');
  };

  hamburgerBtn.addEventListener('click', openDrawer);
  drawerCloseBtn?.addEventListener('click', closeDrawer);
  drawerBackdrop.addEventListener('click', closeDrawer);

  sideDrawer.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', closeDrawer);
  });

  // Sync drawer user stats
  try {
    const rawUser = localStorage.getItem('slanguage_user');
    const user = rawUser ? JSON.parse(rawUser) : null;
    const streak = user?.streak ?? localStorage.getItem('slanguage_user_streak') ?? '18';
    const xp = user?.xp ?? localStorage.getItem('slanguage_user_xp') ?? '2450';
    const hearts = user?.hearts ?? localStorage.getItem('slanguage_user_hearts') ?? '5';
    const name = user?.name ?? user?.username ?? localStorage.getItem('slanguage_user_name') ?? 'Vua Xứ Thanh';
    const avatar = user?.avatar ?? localStorage.getItem('slanguage_user_avatar');

    const streakEl = document.getElementById('drawerStreakVal');
    if (streakEl) streakEl.textContent = `${streak} Ngày`;

    const xpEl = document.getElementById('drawerXPVal');
    if (xpEl) xpEl.textContent = `${Number(xp).toLocaleString()} XP`;

    const heartsEl = document.getElementById('drawerHeartsVal');
    if (heartsEl) heartsEl.textContent = `${hearts}/5`;

    const nameEl = document.getElementById('drawerUserName');
    if (nameEl) nameEl.textContent = name;

    const avatarEl = document.getElementById('drawerUserAvatar') as HTMLImageElement | null;
    if (avatarEl && avatar) avatarEl.src = avatar;
  } catch (err) {
    console.warn('Error syncing drawer user stats:', err);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initMobileSideDrawer);
} else {
  initMobileSideDrawer();
}
