/**
 * ===================================================================
 * SLANGUAGE - SHOP QUY ĐỔI (COIN & VẬT PHẨM TRỢ LỰC CHIẾN BINH)
 * Module: shop/shop.ts
 * Purpose: Quản lý quy đổi 5 XP = 1 Coin, mua sắm vật phẩm trợ lực
 * (Hồi phục máu, Tăng 10% XP, Đóng băng Streak, Khung Avatar Hoàng Gia),
 * quản lý kho đồ và lịch sử giao dịch.
 * ===================================================================
 */

interface ShopItem {
  id: string;
  title: string;
  description: string;
  costCoins: number;
  icon: string;
  badge: string;
  badgeClass: string;
  category: 'boost' | 'heal' | 'shield';
  limitType: 'daily' | 'monthly';
  limitMax: number;
  nonStacking?: boolean;
}

interface PurchaseLimitsData {
  dailyDate: string; // YYYY-MM-DD
  monthlyDate: string; // YYYY-MM
  dailyCounts: { [itemId: string]: number };
  monthlyCounts: { [itemId: string]: number };
}

interface TransactionRecord {
  id: string;
  type: 'exchange' | 'purchase';
  title: string;
  details: string;
  changeXP: number;
  changeCoins: number;
  timestamp: string;
}

interface UserInventory {
  xpBoostCount: number;
  streakFreezeCount: number;
  doubleXPCount: number;
  hasRoyalFrame?: boolean;
  bossShieldCount?: number;
}

const SHOP_ITEMS: ShopItem[] = [
  {
    id: 'heal_hearts',
    title: 'Hồi Phục Máu Siêu Tốc (+5 ❤️)',
    description: 'Hồi phục đầy 5/5 trái tim ngay lập tức để tiếp tục vượt ải ngục tối, không lo bị gián đoạn bài học.',
    costCoins: 25,
    icon: 'fa-solid fa-heart-pulse',
    badge: 'Cứu Sinh',
    badgeClass: 'badge-heal',
    category: 'heal',
    limitType: 'daily',
    limitMax: 1
  },
  {
    id: 'boost_xp_10',
    title: 'Tăng Cường Kinh Nghiệm (+10% XP)',
    description: 'Tăng thêm +10% toàn bộ điểm XP nhận được cho một bài học kế tiếp.',
    costCoins: 30,
    icon: 'fa-solid fa-bolt-lightning',
    badge: 'Bứt Phá XP',
    badgeClass: 'badge-boost',
    category: 'boost',
    limitType: 'daily',
    limitMax: 2,
    nonStacking: true
  },
  {
    id: 'streak_freeze',
    title: 'Đóng Băng Chuỗi Học (Streak Freeze ❄️)',
    description: 'Bảo vệ chuỗi ngày học streak của bạn không bị mất nếu bận rộn không vào làm bài trong 24 giờ tới.',
    costCoins: 250,
    icon: 'fa-solid fa-snowflake',
    badge: 'Bảo Hộ Chuỗi',
    badgeClass: 'badge-shield',
    category: 'shield',
    limitType: 'monthly',
    limitMax: 1
  },
  {
    id: 'double_xp',
    title: 'Gấp Đôi Kinh Nghiệm (x2 XP ⚡)',
    description: 'Nhân 2 toàn bộ điểm kinh nghiệm thu thập được cho một bài học kế tiếp.',
    costCoins: 150,
    icon: 'fa-solid fa-star',
    badge: 'Siêu Tăng Tốc',
    badgeClass: 'badge-boost',
    category: 'boost',
    limitType: 'daily',
    limitMax: 1,
    nonStacking: true
  }
];

class SlanguageShopApp {
  // User Balances
  private currentXP: number = 2450;
  private currentCoins: number = 120;
  private currentHearts: number = 5;
  private activeExpBoost: 'boost_10' | 'double_xp' | null = null;
  private purchaseLimits: PurchaseLimitsData = {
    dailyDate: '',
    monthlyDate: '',
    dailyCounts: {},
    monthlyCounts: {}
  };
  private inventory: UserInventory = {
    xpBoostCount: 1,
    streakFreezeCount: 1,
    doubleXPCount: 0,
    hasRoyalFrame: false,
    bossShieldCount: 0
  };
  private history: TransactionRecord[] = [];

  // Exchange input state
  private selectedExchangeXP: number = 50;

  // DOM Elements
  private xpInputEl!: HTMLInputElement;
  private xpMinusBtnEl!: HTMLButtonElement;
  private xpPlusBtnEl!: HTMLButtonElement;
  private previewCoinsEl!: HTMLElement;
  private previewResidualEl!: HTMLElement;
  private btnExecuteExchangeEl!: HTMLButtonElement;

  private userXPDisplayEl!: HTMLElement;
  private userCoinsDisplayEl!: HTMLElement;
  private userHeartsDisplayEl!: HTMLElement;
  private headerStreakValEl: HTMLElement | null = null;
  private headerXPValEl: HTMLElement | null = null;
  private headerHeartsValEl: HTMLElement | null = null;
  private headerCoinsValEl: HTMLElement | null = null;

  private itemsGridEl!: HTMLElement;
  private inventoryListEl!: HTMLElement;
  private historyTableBodyEl!: HTMLElement;

  private shopModalOverlayEl!: HTMLElement;
  private shopModalCardEl!: HTMLElement;
  private modalCloseBtnEl!: HTMLButtonElement;
  private modalBodyEl!: HTMLElement;

  constructor() {
    if (localStorage.getItem('slanguage_is_logged_in') !== 'true') {
      window.location.replace('../login/index.html');
      return;
    }
    this.loadStateFromStorage();
    this.bindDOM();
    this.initNavbarHeader();
    this.bindEvents();
    this.updateUI();
  }

  private loadStateFromStorage(): void {
    // Read XP
    const savedXP = localStorage.getItem('slanguage_user_xp');
    if (savedXP !== null) {
      const parsed = parseInt(savedXP, 10);
      if (!isNaN(parsed)) this.currentXP = parsed;
    }

    // Read Coins
    const savedCoins = localStorage.getItem('slanguage_user_coins');
    if (savedCoins !== null) {
      const parsed = parseInt(savedCoins, 10);
      if (!isNaN(parsed)) this.currentCoins = parsed;
    } else {
      localStorage.setItem('slanguage_user_coins', this.currentCoins.toString());
    }

    // Read Hearts
    const savedHearts = localStorage.getItem('slanguage_user_hearts');
    if (savedHearts !== null) {
      const parsed = parseInt(savedHearts, 10);
      if (!isNaN(parsed)) this.currentHearts = parsed;
    } else {
      localStorage.setItem('slanguage_user_hearts', this.currentHearts.toString());
    }

    // Read Active Boost on Account
    const savedActiveBoost = localStorage.getItem('slanguage_active_exp_boost');
    if (savedActiveBoost === 'boost_10' || savedActiveBoost === 'double_xp') {
      this.activeExpBoost = savedActiveBoost;
    } else if (localStorage.getItem('slanguage_xp_boost_active') === 'true') {
      this.activeExpBoost = 'boost_10';
    } else {
      this.activeExpBoost = null;
    }

    // Read Purchase Limits
    this.loadPurchaseLimits();

    // Read Inventory
    const savedInv = localStorage.getItem('slanguage_user_inventory');
    if (savedInv) {
      try {
        this.inventory = { ...this.inventory, ...JSON.parse(savedInv) };
      } catch (e) {
        console.error('Failed to parse inventory:', e);
      }
    } else {
      this.saveInventory();
    }

    // Read History
    const savedHist = localStorage.getItem('slanguage_shop_history');
    if (savedHist) {
      try {
        this.history = JSON.parse(savedHist);
      } catch (e) {
        console.error('Failed to parse shop history:', e);
      }
    } else {
      // Default sample records
      this.history = [
        {
          id: 'tx_init_1',
          type: 'exchange',
          title: 'Quy đổi 100 XP lấy 20 Coin',
          details: 'Tỷ lệ 5 XP = 1 Coin Slanguage',
          changeXP: -100,
          changeCoins: 20,
          timestamp: '14:20 • Hôm nay'
        },
        {
          id: 'tx_init_2',
          type: 'purchase',
          title: 'Mua Tăng Cường +10% XP',
          details: 'Kích hoạt hiệu ứng bài học kế tiếp',
          changeXP: 0,
          changeCoins: -30,
          timestamp: '15:10 • Hôm nay'
        }
      ];
      this.saveHistory();
    }
  }

  private getTodayKey(): string {
    const d = new Date();
    return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`;
  }

  private getMonthKey(): string {
    const d = new Date();
    return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}`;
  }

  private loadPurchaseLimits(): void {
    const today = this.getTodayKey();
    const thisMonth = this.getMonthKey();
    const saved = localStorage.getItem('slanguage_shop_purchase_limits');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        this.purchaseLimits = {
          dailyDate: parsed.dailyDate || today,
          monthlyDate: parsed.monthlyDate || thisMonth,
          dailyCounts: parsed.dailyCounts || {},
          monthlyCounts: parsed.monthlyCounts || {}
        };
      } catch (e) {
        this.purchaseLimits = { dailyDate: today, monthlyDate: thisMonth, dailyCounts: {}, monthlyCounts: {} };
      }
    } else {
      this.purchaseLimits = { dailyDate: today, monthlyDate: thisMonth, dailyCounts: {}, monthlyCounts: {} };
    }

    let changed = false;
    if (this.purchaseLimits.dailyDate !== today) {
      this.purchaseLimits.dailyDate = today;
      this.purchaseLimits.dailyCounts = {};
      changed = true;
    }
    if (this.purchaseLimits.monthlyDate !== thisMonth) {
      this.purchaseLimits.monthlyDate = thisMonth;
      this.purchaseLimits.monthlyCounts = {};
      changed = true;
    }

    if (changed || !saved) {
      this.savePurchaseLimits();
    }
  }

  private savePurchaseLimits(): void {
    localStorage.setItem('slanguage_shop_purchase_limits', JSON.stringify(this.purchaseLimits));
  }

  public getRemainingPurchases(item: ShopItem): number {
    this.loadPurchaseLimits();
    if (item.limitType === 'daily') {
      const bought = this.purchaseLimits.dailyCounts[item.id] || 0;
      return Math.max(0, item.limitMax - bought);
    } else {
      const bought = this.purchaseLimits.monthlyCounts[item.id] || 0;
      return Math.max(0, item.limitMax - bought);
    }
  }

  private recordPurchaseLimit(itemId: string): void {
    const item = SHOP_ITEMS.find(i => i.id === itemId);
    if (!item) return;

    this.loadPurchaseLimits();
    if (item.limitType === 'daily') {
      this.purchaseLimits.dailyCounts[item.id] = (this.purchaseLimits.dailyCounts[item.id] || 0) + 1;
    } else {
      this.purchaseLimits.monthlyCounts[item.id] = (this.purchaseLimits.monthlyCounts[item.id] || 0) + 1;
    }
    this.savePurchaseLimits();
  }

  private saveState(): void {
    localStorage.setItem('slanguage_user_xp', this.currentXP.toString());
    localStorage.setItem('slanguage_user_coins', this.currentCoins.toString());
    localStorage.setItem('slanguage_user_hearts', this.currentHearts.toString());
    this.saveInventory();
    this.saveHistory();
  }

  private saveInventory(): void {
    localStorage.setItem('slanguage_user_inventory', JSON.stringify(this.inventory));
  }

  private saveHistory(): void {
    localStorage.setItem('slanguage_shop_history', JSON.stringify(this.history));
  }

  private bindDOM(): void {
    this.xpInputEl = document.getElementById('xpExchangeInput') as HTMLInputElement;
    this.xpMinusBtnEl = document.getElementById('btnMinusXP') as HTMLButtonElement;
    this.xpPlusBtnEl = document.getElementById('btnPlusXP') as HTMLButtonElement;
    this.previewCoinsEl = document.getElementById('previewCoinsVal') as HTMLElement;
    this.previewResidualEl = document.getElementById('previewResidualVal') as HTMLElement;
    this.btnExecuteExchangeEl = document.getElementById('btnExecuteExchange') as HTMLButtonElement;

    this.userXPDisplayEl = document.getElementById('userXPDisplay') as HTMLElement;
    this.userCoinsDisplayEl = document.getElementById('userCoinsDisplay') as HTMLElement;
    this.userHeartsDisplayEl = document.getElementById('userHeartsDisplay') as HTMLElement;

    this.headerStreakValEl = document.getElementById('headerStreakVal');
    this.headerXPValEl = document.getElementById('headerXPVal');
    this.headerHeartsValEl = document.getElementById('headerHeartsVal');
    this.headerCoinsValEl = document.getElementById('headerCoinsVal');

    this.itemsGridEl = document.getElementById('shopItemsGrid') as HTMLElement;
    this.inventoryListEl = document.getElementById('inventoryList') as HTMLElement;
    this.historyTableBodyEl = document.getElementById('historyTableBody') as HTMLElement;

    this.shopModalOverlayEl = document.getElementById('shopModalOverlay') as HTMLElement;
    this.shopModalCardEl = document.getElementById('shopModalCard') as HTMLElement;
    this.modalCloseBtnEl = document.getElementById('modalCloseBtn') as HTMLButtonElement;
    this.modalBodyEl = document.getElementById('modalBodyContent') as HTMLElement;
  }

  private initNavbarHeader(): void {
    const isLoggedIn = localStorage.getItem('slanguage_is_logged_in') === 'true';
    if (isLoggedIn) {
      document.body.classList.add('user-authenticated');
      document.body.classList.remove('user-guest');
    } else {
      document.body.classList.add('user-guest');
      document.body.classList.remove('user-authenticated');
    }

    const logoutBtn = document.getElementById('navLogoutItem');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => {
        localStorage.setItem('slanguage_is_logged_in', 'false');
      });
    }

    const langDropdown = document.getElementById('langDropdown');
    const langDropdownBtn = document.getElementById('langDropdownBtn');
    const userDropdown = document.getElementById('userDropdown');
    const userDropdownBtn = document.getElementById('userDropdownBtn');

    if (langDropdown && langDropdownBtn) {
      langDropdownBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        langDropdown.classList.toggle('open');
        langDropdown.classList.toggle('active');
        if (userDropdown) {
          userDropdown.classList.remove('open');
          userDropdown.classList.remove('active');
        }
      });
    }

    if (userDropdown && userDropdownBtn) {
      userDropdownBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        userDropdown.classList.toggle('open');
        userDropdown.classList.toggle('active');
        if (langDropdown) {
          langDropdown.classList.remove('open');
          langDropdown.classList.remove('active');
        }
      });
    }

    document.addEventListener('click', (e) => {
      const target = e.target as Node;
      if (langDropdown && !langDropdown.contains(target)) {
        langDropdown.classList.remove('open');
        langDropdown.classList.remove('active');
      }
      if (userDropdown && !userDropdown.contains(target)) {
        userDropdown.classList.remove('open');
        userDropdown.classList.remove('active');
      }
    });

    // Language Dropdown item selection
    const langItems = document.querySelectorAll<HTMLElement>('.lang-dropdown-item');
    const currentLangFlag = document.getElementById('currentLangFlag') as HTMLImageElement | null;
    const currentLangLabel = document.getElementById('currentLangLabel');

    const langMap: Record<string, { name: string; flag: string }> = {
      ja: { name: 'Tiếng Nhật', flag: '../assets/flags/flag-jp.png' },
      en: { name: 'English', flag: '../assets/flags/flag-en.png' },
      vi: { name: 'Tiếng Việt', flag: '../assets/flags/flag-vn.png' },
    };

    // Filter header language dropdown to exclude user's native language
    const rawNative = (localStorage.getItem('slanguage_native_language') || 'vi').toLowerCase();
    const nativeLang = rawNative.includes('vi') || rawNative.includes('việt') ? 'vi' : (rawNative.includes('en') || rawNative.includes('anh') ? 'en' : (rawNative.includes('ja') || rawNative.includes('nhật') ? 'ja' : 'vi'));

    langItems.forEach(item => {
      if (item.getAttribute('data-lang') === nativeLang) {
        item.style.display = 'none';
      } else {
        item.style.display = 'flex';
      }
    });

    let savedLang = localStorage.getItem('slanguage_active_language') || localStorage.getItem('slanguage_current_lang') || 'ja';
    if (savedLang === nativeLang) {
      savedLang = nativeLang === 'vi' ? 'ja' : (nativeLang === 'ja' ? 'en' : 'ja');
      localStorage.setItem('slanguage_active_language', savedLang);
      localStorage.setItem('slanguage_current_lang', savedLang);
    }

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

    langItems.forEach(item => {
      item.addEventListener('click', () => {
        const lang = item.getAttribute('data-lang') || 'ja';
        if (lang === nativeLang) return;
        if (langMap[lang]) {
          localStorage.setItem('slanguage_active_language', lang);
          localStorage.setItem('slanguage_current_lang', lang);
          if (currentLangLabel) currentLangLabel.textContent = langMap[lang].name;
          if (currentLangFlag) currentLangFlag.src = langMap[lang].flag;
          langItems.forEach(i => i.classList.remove('active'));
          item.classList.add('active');
        }
        if (langDropdown) {
          langDropdown.classList.remove('open');
          langDropdown.classList.remove('active');
        }
      });
    });
  }

  private bindEvents(): void {
    // Exchange input change
    if (this.xpInputEl) {
      this.xpInputEl.addEventListener('input', () => {
        let val = parseInt(this.xpInputEl.value, 10);
        if (isNaN(val) || val < 0) val = 0;
        this.selectedExchangeXP = val;
        this.updateExchangePreview();
      });
    }

    // Quick XP Pill buttons (+25, +50, +100, +250, Max)
    const quickPills = document.querySelectorAll<HTMLButtonElement>('.quick-xp-btn');
    quickPills.forEach(btn => {
      btn.addEventListener('click', () => {
        const valType = btn.getAttribute('data-xp');
        if (valType === 'max') {
          this.selectedExchangeXP = this.currentXP - (this.currentXP % 5);
        } else {
          const addVal = parseInt(valType || '0', 10);
          this.selectedExchangeXP = Math.min(this.currentXP, addVal);
        }
        if (this.xpInputEl) {
          this.xpInputEl.value = this.selectedExchangeXP.toString();
        }
        this.updateExchangePreview();
      });
    });

    // Step +/- buttons
    if (this.xpMinusBtnEl) {
      this.xpMinusBtnEl.addEventListener('click', () => {
        this.selectedExchangeXP = Math.max(0, this.selectedExchangeXP - 5);
        if (this.xpInputEl) this.xpInputEl.value = this.selectedExchangeXP.toString();
        this.updateExchangePreview();
      });
    }

    if (this.xpPlusBtnEl) {
      this.xpPlusBtnEl.addEventListener('click', () => {
        this.selectedExchangeXP = Math.min(this.currentXP, this.selectedExchangeXP + 5);
        if (this.xpInputEl) this.xpInputEl.value = this.selectedExchangeXP.toString();
        this.updateExchangePreview();
      });
    }

    // Execute Exchange button
    if (this.btnExecuteExchangeEl) {
      this.btnExecuteExchangeEl.addEventListener('click', () => {
        this.handleExecuteExchange();
      });
    }

    // Modal close events
    if (this.modalCloseBtnEl) {
      this.modalCloseBtnEl.addEventListener('click', () => {
        this.closeModal();
      });
    }

    if (this.shopModalOverlayEl) {
      this.shopModalOverlayEl.addEventListener('click', (e) => {
        if (e.target === this.shopModalOverlayEl) {
          this.closeModal();
        }
      });
    }

    // Global Link Page Transition with loading video
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
          e.preventDefault();
          this.triggerLoadingAndRedirect(href);
        });
      }
    });

    window.addEventListener('pageshow', () => {
      const overlay = document.getElementById('slanguageLoadingOverlay');
      const video = document.getElementById('loadingVideoPlayer') as HTMLVideoElement | null;
      if (overlay) overlay.classList.remove('active');
      if (video) {
        video.pause();
        video.muted = true;
        video.currentTime = 0;
      }
    });
  }

  private triggerLoadingAndRedirect(targetUrl: string, duration: number = 1500): void {
    const overlay = document.getElementById('slanguageLoadingOverlay');
    const video = document.getElementById('loadingVideoPlayer') as HTMLVideoElement | null;
    if (overlay) {
      overlay.classList.add('active');
      if (video) {
        video.muted = false;
        video.volume = 1.0;
        video.currentTime = 0;
        const playPromise = video.play();
        if (playPromise !== undefined) {
          playPromise.catch(() => {
            video.muted = true;
            video.play().catch(() => {});
          });
        }
      }
    }
    setTimeout(() => {
      window.location.href = targetUrl;
    }, duration);
  }

  private updateExchangePreview(): void {
    const xp = Math.max(0, this.selectedExchangeXP);
    const coinsEarned = Math.floor(xp / 5);
    const residual = xp % 5;

    if (this.previewCoinsEl) {
      this.previewCoinsEl.textContent = `+${coinsEarned.toLocaleString()}`;
    }
    if (this.previewResidualEl) {
      if (residual > 0) {
        this.previewResidualEl.textContent = `(Dư ${residual} XP chưa đủ đổi 1 Coin)`;
        this.previewResidualEl.style.display = 'inline';
      } else {
        this.previewResidualEl.style.display = 'none';
      }
    }

    // Disable exchange button if not enough XP or coinsEarned === 0
    if (this.btnExecuteExchangeEl) {
      if (xp < 5 || coinsEarned === 0 || xp > this.currentXP) {
        this.btnExecuteExchangeEl.disabled = true;
      } else {
        this.btnExecuteExchangeEl.disabled = false;
      }
    }
  }

  private handleExecuteExchange(): void {
    const xpToDeduct = this.selectedExchangeXP - (this.selectedExchangeXP % 5);
    const coinsToAdd = Math.floor(this.selectedExchangeXP / 5);

    if (xpToDeduct <= 0 || coinsToAdd <= 0) {
      this.showToast('Vui lòng nhập tối thiểu 5 XP để quy đổi!');
      return;
    }

    if (xpToDeduct > this.currentXP) {
      this.showToast('Số XP hiện tại không đủ để thực hiện quy đổi!');
      return;
    }

    // Perform transaction
    this.currentXP -= xpToDeduct;
    this.currentCoins += coinsToAdd;

    // Add transaction record
    const now = new Date();
    const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')} • Hôm nay`;

    const tx: TransactionRecord = {
      id: `tx_${Date.now()}`,
      type: 'exchange',
      title: `Quy đổi ${xpToDeduct.toLocaleString()} XP ➔ ${coinsToAdd.toLocaleString()} Coin`,
      details: `Tỷ lệ chuẩn 5 XP = 1 Coin Slanguage`,
      changeXP: -xpToDeduct,
      changeCoins: coinsToAdd,
      timestamp: timeStr
    };
    this.history.unshift(tx);

    // Save and Update UI
    this.saveState();
    this.selectedExchangeXP = Math.min(this.currentXP, 50);
    if (this.xpInputEl) this.xpInputEl.value = this.selectedExchangeXP.toString();
    this.updateUI();

    // Show celebration modal
    this.showSuccessModal(
      'Quy Đổi Thành Công! 🎉',
      `Bạn đã dùng <strong>-${xpToDeduct.toLocaleString()} XP</strong> để quy đổi thành công <strong>+${coinsToAdd.toLocaleString()} Coin 🪙</strong>!`,
      `Số dư mới: <strong>${this.currentCoins.toLocaleString()} Coin</strong> | <strong>${this.currentXP.toLocaleString()} XP</strong>.`
    );
  }

  public handlePurchaseItem(itemId: string): void {
    const item = SHOP_ITEMS.find(i => i.id === itemId);
    if (!item) return;

    // 1. Kiểm tra giới hạn lượt mua trong ngày/tháng
    const remaining = this.getRemainingPurchases(item);
    if (remaining <= 0) {
      const periodName = item.limitType === 'daily' ? 'hôm nay' : 'tháng này';
      this.showToast(`Bạn đã đạt giới hạn mua tối đa của vật phẩm này trong ${periodName}!`);
      return;
    }

    // 2. Kiểm tra số dư Coin
    if (this.currentCoins < item.costCoins) {
      const shortage = item.costCoins - this.currentCoins;
      const neededXP = shortage * 5;
      this.showWarningModal(
        'Không Đủ Coin! 🪙',
        `Bạn cần thêm <strong>${shortage} Coin</strong> để mua <strong>${item.title}</strong>.`,
        `Gợi ý: Dùng bộ quy đổi bên trên để đổi <strong>${neededXP} XP</strong> thành ${shortage} Coin ngay!`
      );
      return;
    }

    // 3. Logic không cộng dồn: Nếu tài khoản đang có Boost EXP và người dùng muốn mua thêm 1 Boost EXP nữa
    if (item.category === 'boost' && this.activeExpBoost !== null) {
      this.showNonStackWarningModal(item);
      return;
    }

    // 4. Tiến hành giao dịch
    this.executePurchase(item);
  }

  private showNonStackWarningModal(item: ShopItem): void {
    if (!this.modalBodyEl || !this.shopModalOverlayEl) return;

    const currentBoostName = this.activeExpBoost === 'double_xp'
      ? 'Gấp Đôi Kinh Nghiệm (x2 XP ⚡)'
      : 'Tăng Cường Kinh Nghiệm (+10% XP ⚡)';

    this.modalBodyEl.innerHTML = `
      <div class="modal-dialog-icon warning">
        <i class="fa-solid fa-triangle-exclamation"></i>
      </div>
      <h3 class="modal-dialog-title">Cảnh Báo: Không Cộng Dồn Hiệu Ứng! ⚠️</h3>
      <p class="modal-dialog-desc">
        Tài khoản của bạn hiện đang áp dụng hiệu ứng <strong>${currentBoostName}</strong> cho bài học kế tiếp.
      </p>
      <div class="modal-dialog-subnote" style="border-left: 3px solid #FFB703; text-align: left; background: rgba(255, 183, 3, 0.08);">
        <i class="fa-solid fa-circle-info" style="color: #FFB703; margin-right: 6px;"></i>
        Hai vật phẩm tăng kinh nghiệm (EXP) <strong>KHÔNG CỘNG DỒN</strong>. Nếu bạn tiếp tục mua <strong>${item.title}</strong>, hiệu ứng mới sẽ ghi đè lên hiệu ứng hiện tại!
      </div>
      <div class="modal-dialog-footer" style="display: flex; gap: 12px; justify-content: center; flex-wrap: wrap;">
        <button type="button" class="btn-dialog-secondary" onclick="window.slanguageShopApp.closeModal()">
          <i class="fa-solid fa-xmark"></i> Hủy Bỏ
        </button>
        <button type="button" class="btn-dialog-action warning" onclick="window.slanguageShopApp.confirmPurchaseWithOverwrite('${item.id}')">
          <i class="fa-solid fa-check"></i> Vẫn Muốn Mua
        </button>
      </div>
    `;
    this.shopModalOverlayEl.classList.add('active');
  }

  public confirmPurchaseWithOverwrite(itemId: string): void {
    this.closeModal();
    const item = SHOP_ITEMS.find(i => i.id === itemId);
    if (!item) return;
    this.executePurchase(item);
  }

  private executePurchase(item: ShopItem): void {
    // Trừ coin
    this.currentCoins -= item.costCoins;

    // Ghi nhận lượt mua
    this.recordPurchaseLimit(item.id);

    // Áp dụng hiệu ứng
    let effectMsg = '';
    if (item.id === 'heal_hearts') {
      this.currentHearts = 5;
      effectMsg = 'Điểm tim của bạn đã được hồi phục đầy đủ 5/5 ❤️!';
    } else if (item.id === 'boost_xp_10') {
      this.inventory.xpBoostCount += 1;
      this.activeExpBoost = 'boost_10';
      localStorage.setItem('slanguage_active_exp_boost', 'boost_10');
      localStorage.setItem('slanguage_xp_boost_active', 'true');
      effectMsg = 'Đã kích hoạt Tăng Cường +10% XP! Sẽ tự động áp dụng cho một bài học kế tiếp.';
    } else if (item.id === 'streak_freeze') {
      this.inventory.streakFreezeCount += 1;
      effectMsg = 'Đã trang bị 1 Đóng Băng Streak ❄️! Chuỗi ngày học của bạn được bảo vệ an toàn.';
    } else if (item.id === 'double_xp') {
      this.inventory.doubleXPCount += 1;
      this.activeExpBoost = 'double_xp';
      localStorage.setItem('slanguage_active_exp_boost', 'double_xp');
      localStorage.setItem('slanguage_xp_boost_active', 'true');
      effectMsg = 'Đã kích hoạt Gấp Đôi Kinh Nghiệm (x2 XP ⚡)! Sẽ áp dụng cho một bài học kế tiếp.';
    }

    // Ghi nhật ký giao dịch
    const now = new Date();
    const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')} • Hôm nay`;

    const tx: TransactionRecord = {
      id: `tx_${Date.now()}`,
      type: 'purchase',
      title: `Mua ${item.title}`,
      details: effectMsg,
      changeXP: 0,
      changeCoins: -item.costCoins,
      timestamp: timeStr
    };
    this.history.unshift(tx);

    // Lưu state và cập nhật UI
    this.saveState();
    this.updateUI();

    // Hiển thị modal thành công
    this.showSuccessModal(
      'Giao Dịch Thành Công! 🛍️',
      `Bạn đã mua thành công <strong>${item.title}</strong> với giá <strong>${item.costCoins} Coin</strong>.`,
      effectMsg
    );
  }

  private updateUI(): void {
    // 1. Update balances displays
    if (this.userXPDisplayEl) this.userXPDisplayEl.textContent = `${this.currentXP.toLocaleString()} XP`;
    if (this.userCoinsDisplayEl) this.userCoinsDisplayEl.textContent = `${this.currentCoins.toLocaleString()} Coin`;
    if (this.userHeartsDisplayEl) this.userHeartsDisplayEl.textContent = `${this.currentHearts}/5`;

    // 2. Update Header chips
    const savedStreak = localStorage.getItem('slanguage_user_streak') || '14';
    if (this.headerStreakValEl) this.headerStreakValEl.textContent = `${savedStreak} Ngày`;
    if (this.headerXPValEl) this.headerXPValEl.textContent = `${this.currentXP.toLocaleString()} XP`;
    if (this.headerHeartsValEl) this.headerHeartsValEl.textContent = `${this.currentHearts}/5`;
    if (this.headerCoinsValEl) this.headerCoinsValEl.textContent = `${this.currentCoins.toLocaleString()} Coin`;

    // 3. Update exchange preview
    this.updateExchangePreview();

    // 4. Render Items Grid
    this.renderItemsGrid();

    // 5. Render Inventory
    this.renderInventory();

    // 6. Render Transaction History
    this.renderHistory();
  }

  private renderItemsGrid(): void {
    if (!this.itemsGridEl) return;

    this.itemsGridEl.innerHTML = SHOP_ITEMS.map(item => {
      const remaining = this.getRemainingPurchases(item);
      const isLimitReached = remaining <= 0;
      const canAfford = this.currentCoins >= item.costCoins;

      const limitPeriod = item.limitType === 'daily' ? 'ngày' : 'tháng';
      const limitBadgeText = `Giới hạn: ${item.limitMax} lần/${limitPeriod} (Còn ${remaining}/${item.limitMax})`;

      let btnHtml = '';
      if (isLimitReached) {
        const periodText = item.limitType === 'daily' ? 'Hôm Nay' : 'Tháng Này';
        btnHtml = `
          <button type="button" class="btn-buy-card limit-reached" disabled title="Đã đạt giới hạn mua trong ${periodText}">
            <i class="fa-solid fa-ban"></i> Đạt Giới Hạn ${periodText}
          </button>
        `;
      } else if (!canAfford) {
        btnHtml = `
          <button type="button" class="btn-buy-card disabled" onclick="window.slanguageShopApp.handlePurchaseItem('${item.id}')">
            <i class="fa-solid fa-lock"></i> Mua Với ${item.costCoins} Coin
          </button>
        `;
      } else {
        btnHtml = `
          <button type="button" class="btn-buy-card" onclick="window.slanguageShopApp.handlePurchaseItem('${item.id}')">
            <i class="fa-solid fa-bag-shopping"></i> Mua Với ${item.costCoins} Coin
          </button>
        `;
      }

      return `
        <div class="shop-item-card ${isLimitReached ? 'limit-reached-card' : (!canAfford ? 'cannot-afford' : '')}" data-item-id="${item.id}">
          <div class="item-card-top">
            <span class="item-badge ${item.badgeClass}">${item.badge}</span>
            <div class="item-cost-chip">
              <i class="fa-solid fa-coins"></i>
              <span>${item.costCoins} Coin</span>
            </div>
          </div>

          <div class="item-icon-box">
            <i class="${item.icon}"></i>
          </div>

          <div class="item-card-body">
            <h3 class="item-title">${item.title}</h3>
            <p class="item-desc">${item.description}</p>

            <div class="item-meta-badges">
              <span class="item-limit-tag ${isLimitReached ? 'exhausted' : ''}">
                <i class="fa-regular fa-clock"></i> ${limitBadgeText}
              </span>
              ${item.nonStacking ? `
                <span class="item-non-stack-note">
                  <i class="fa-solid fa-circle-exclamation"></i> Không cộng dồn
                </span>
              ` : ''}
            </div>
          </div>

          <div class="item-card-footer">
            ${btnHtml}
          </div>
        </div>
      `;
    }).join('');
  }

  private renderInventory(): void {
    if (!this.inventoryListEl) return;

    let xpBoostStatus = 'Chưa có';
    if (this.activeExpBoost === 'boost_10') {
      xpBoostStatus = '⚡ Đang kích hoạt (+10% bài kế)';
    } else if (this.inventory.xpBoostCount > 0) {
      xpBoostStatus = `Đã tích lũy ${this.inventory.xpBoostCount} lượt`;
    }

    let doubleXPStatus = 'Chưa có';
    if (this.activeExpBoost === 'double_xp') {
      doubleXPStatus = '🔥 Đang kích hoạt (x2 XP bài kế)';
    } else if (this.inventory.doubleXPCount > 0) {
      doubleXPStatus = `Đã tích lũy ${this.inventory.doubleXPCount} lượt`;
    }

    const buffs = [
      {
        name: 'Vé Hồi Phục Máu (5/5 ❤️)',
        qty: this.currentHearts >= 5 ? 'Đầy máu' : `${this.currentHearts}/5`,
        icon: 'fa-solid fa-heart',
        iconColor: '#ff4d6d',
        status: 'Đang hoạt động'
      },
      {
        name: 'Tăng Cường Kinh Nghiệm (+10% XP)',
        qty: `x${this.inventory.xpBoostCount}`,
        icon: 'fa-solid fa-bolt-lightning',
        iconColor: '#FFB703',
        status: xpBoostStatus
      },
      {
        name: 'Gấp Đôi Kinh Nghiệm (x2 XP ⚡)',
        qty: `x${this.inventory.doubleXPCount}`,
        icon: 'fa-solid fa-star',
        iconColor: '#FB8500',
        status: doubleXPStatus
      },
      {
        name: 'Đóng Băng Chuỗi Streak (❄️)',
        qty: `x${this.inventory.streakFreezeCount}`,
        icon: 'fa-solid fa-snowflake',
        iconColor: '#00B4D8',
        status: this.inventory.streakFreezeCount > 0 ? 'Bảo vệ tự động' : 'Chưa trang bị'
      }
    ];

    this.inventoryListEl.innerHTML = buffs.map(b => `
      <div class="inventory-item-row">
        <div class="inv-icon" style="color: ${b.iconColor};">
          <i class="${b.icon}"></i>
        </div>
        <div class="inv-info">
          <span class="inv-name">${b.name}</span>
          <span class="inv-status">${b.status}</span>
        </div>
        <div class="inv-qty-tag">${b.qty}</div>
      </div>
    `).join('');
  }

  private renderHistory(): void {
    if (!this.historyTableBodyEl) return;

    if (this.history.length === 0) {
      this.historyTableBodyEl.innerHTML = `
        <tr>
          <td colspan="4" style="text-align: center; color: var(--text-muted); padding: 24px;">Chưa có giao dịch nào được ghi nhận.</td>
        </tr>
      `;
      return;
    }

    this.historyTableBodyEl.innerHTML = this.history.slice(0, 8).map(tx => {
      const isExchange = tx.type === 'exchange';
      const typeBadge = isExchange
        ? '<span class="tx-badge exchange"><i class="fa-solid fa-arrow-right-arrow-left"></i> Quy đổi</span>'
        : '<span class="tx-badge purchase"><i class="fa-solid fa-bag-shopping"></i> Mua vật phẩm</span>';

      const xpChange = tx.changeXP !== 0
        ? `<span class="tx-xp negative">${tx.changeXP.toLocaleString()} XP</span>`
        : '<span class="tx-neutral">—</span>';

      const coinsChange = tx.changeCoins > 0
        ? `<span class="tx-coin positive">+${tx.changeCoins.toLocaleString()} Coin</span>`
        : `<span class="tx-coin negative">${tx.changeCoins.toLocaleString()} Coin</span>`;

      return `
        <tr class="history-row">
          <td class="col-type">${typeBadge}</td>
          <td class="col-desc">
            <div class="tx-title">${tx.title}</div>
            <div class="tx-sub">${tx.details}</div>
          </td>
          <td class="col-balance">
            ${xpChange} • ${coinsChange}
          </td>
          <td class="col-time">${tx.timestamp}</td>
        </tr>
      `;
    }).join('');
  }

  private showSuccessModal(title: string, msgHtml: string, subHtml: string): void {
    if (!this.modalBodyEl || !this.shopModalOverlayEl) return;

    this.modalBodyEl.innerHTML = `
      <div class="modal-dialog-icon success">
        <i class="fa-solid fa-circle-check"></i>
      </div>
      <h3 class="modal-dialog-title">${title}</h3>
      <p class="modal-dialog-desc">${msgHtml}</p>
      <div class="modal-dialog-subnote">${subHtml}</div>
      <div class="modal-dialog-footer">
        <button type="button" class="btn-dialog-action" onclick="window.slanguageShopApp.closeModal()">
          <i class="fa-solid fa-thumbs-up"></i> Tuyệt Vời!
        </button>
      </div>
    `;
    this.shopModalOverlayEl.classList.add('active');
  }

  private showWarningModal(title: string, msgHtml: string, subHtml: string): void {
    if (!this.modalBodyEl || !this.shopModalOverlayEl) return;

    this.modalBodyEl.innerHTML = `
      <div class="modal-dialog-icon warning">
        <i class="fa-solid fa-triangle-exclamation"></i>
      </div>
      <h3 class="modal-dialog-title">${title}</h3>
      <p class="modal-dialog-desc">${msgHtml}</p>
      <div class="modal-dialog-subnote">${subHtml}</div>
      <div class="modal-dialog-footer" style="display: flex; gap: 10px;">
        <button type="button" class="btn-dialog-secondary" onclick="window.slanguageShopApp.closeModal()">
          Đóng
        </button>
        <button type="button" class="btn-dialog-action" onclick="window.slanguageShopApp.scrollToExchange()">
          <i class="fa-solid fa-arrow-up"></i> Đến Bộ Đổi XP
        </button>
      </div>
    `;
    this.shopModalOverlayEl.classList.add('active');
  }

  public closeModal(): void {
    if (this.shopModalOverlayEl) {
      this.shopModalOverlayEl.classList.remove('active');
    }
  }

  public scrollToExchange(): void {
    this.closeModal();
    const exCard = document.getElementById('exchangeHubCard');
    if (exCard) {
      exCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
      exCard.classList.add('highlight-pulse');
      setTimeout(() => exCard.classList.remove('highlight-pulse'), 2000);
    }
  }

  private showToast(message: string): void {
    let toast = document.getElementById('shopToast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'shopToast';
      toast.className = 'shop-toast';
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => {
      if (toast) toast.classList.remove('show');
    }, 2800);
  }
}

// Khởi tạo app
declare global {
  interface Window {
    slanguageShopApp: SlanguageShopApp;
  }
}

function initSlanguageShop(): void {
  (window as unknown as { slanguageShopApp?: SlanguageShopApp }).slanguageShopApp = new SlanguageShopApp();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initSlanguageShop);
} else {
  initSlanguageShop();
}
