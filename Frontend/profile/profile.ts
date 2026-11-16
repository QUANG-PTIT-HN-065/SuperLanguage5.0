/**
 * Slanguage - Learner Profile & Analytics TypeScript Logic
 * Manages tab switching, student personal information editing,
 * language mastery breakdowns (English, Japanese, Vietnamese),
 * weekly study chart rendering, and certificate preview/download.
 */

interface LearnerProfile {
  fullName: string;
  studentId: string;
  email: string;
  phone: string;
  birthDate: string;
  gender: string;
  city: string;
  nativeLanguage: string;
  targetLanguage: 'ja' | 'en' | 'vi';
  dailyGoal: number;
  reminderTime: string;
  bio: string;
  xp: number;
  streak: number;
  level: number;
}

class SlanguageProfile {
  private profile: LearnerProfile = {
    fullName: 'Nguyễn Nhật Anh',
    studentId: 'SLANG-8842',
    email: 'nhatanh.nihon@slanguage.edu.vn',
    phone: '0912 345 678',
    birthDate: '2004-05-15',
    gender: 'Nữ',
    city: 'Hà Nội, Việt Nam',
    nativeLanguage: 'Tiếng Việt',
    targetLanguage: 'ja',
    dailyGoal: 30,
    reminderTime: '20:00',
    bio: 'Đam mê văn hóa Nhật Bản và đang nỗ lực đạt chứng chỉ JLPT N3 cùng IELTS 7.0 trong năm nay! 🌸',
    xp: 3850,
    streak: 18,
    level: 14
  };

  constructor() {
    if (localStorage.getItem('slanguage_is_logged_in') !== 'true') {
      window.location.replace('../login/index.html');
      return;
    }
    this.init();
  }

  private init(): void {
    this.loadFromStorage();
    this.bindTabs();
    this.bindForm();
    this.bindCertificates();
    this.bindAvatarUpload();
    this.bindLangDropdown();
    this.bindPageTransitions();

    // Reset and mute video if page is shown from bfcache or when hidden
    window.addEventListener('pageshow', () => {
      const overlay = document.getElementById('slanguageLoadingOverlay');
      const video = document.getElementById('loadingVideoPlayer') as HTMLVideoElement;
      if (overlay) overlay.classList.remove('active');
      if (video) {
        video.pause();
        video.muted = true;
        video.currentTime = 0;
      }
    });

    window.addEventListener('pagehide', () => {
      const video = document.getElementById('loadingVideoPlayer') as HTMLVideoElement;
      if (video) {
        video.pause();
        video.muted = true;
      }
    });

    this.render();
  }

  private bindPageTransitions(): void {
    document.querySelectorAll<HTMLAnchorElement>('a[href]').forEach(link => {
      const href = link.getAttribute('href');
      if (
        href && 
        !href.startsWith('#') && 
        !href.startsWith('javascript:') && 
        !link.hasAttribute('target')
      ) {
        link.addEventListener('click', (e: MouseEvent) => {
          e.preventDefault();
          this.triggerLoadingAndRedirect(href);
        });
      }
    });
  }

  private triggerLoadingAndRedirect(targetUrl: string, duration: number = 1500): void {
    const overlay = document.getElementById('slanguageLoadingOverlay');
    const video = document.getElementById('loadingVideoPlayer') as HTMLVideoElement;
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
            video.play();
          });
        }
      }
    }
    setTimeout(() => {
      if (video) {
        video.pause();
        video.muted = true;
      }
      if (overlay) {
        overlay.classList.remove('active');
      }
      window.location.href = targetUrl;
    }, duration);
  }

  private loadFromStorage(): void {
    const savedName = localStorage.getItem('slanguage_user_name');
    if (savedName) this.profile.fullName = savedName;

    const savedEmail = localStorage.getItem('slanguage_user_email');
    if (savedEmail) this.profile.email = savedEmail;

    const rawNative = (localStorage.getItem('slanguage_native_language') || 'vi').toLowerCase();
    const nativeLang = rawNative.includes('vi') || rawNative.includes('việt') ? 'vi' : (rawNative.includes('en') || rawNative.includes('anh') ? 'en' : (rawNative.includes('ja') || rawNative.includes('nhật') ? 'ja' : 'vi'));

    let savedLang = (localStorage.getItem('slanguage_active_language') || localStorage.getItem('slanguage_current_lang')) as 'ja' | 'en' | 'vi';
    if (savedLang === nativeLang) {
      savedLang = nativeLang === 'vi' ? 'ja' : (nativeLang === 'ja' ? 'en' : 'ja');
      localStorage.setItem('slanguage_active_language', savedLang);
      localStorage.setItem('slanguage_current_lang', savedLang);
    }
    if (savedLang) this.profile.targetLanguage = savedLang;

    const savedGoal = localStorage.getItem('slanguage_daily_goal');
    if (savedGoal) this.profile.dailyGoal = parseInt(savedGoal, 10);

    const savedXP = localStorage.getItem('slanguage_user_xp');
    if (savedXP) this.profile.xp = parseInt(savedXP, 10);
  }

  private bindTabs(): void {
    const tabBtns = document.querySelectorAll<HTMLButtonElement>('.tab-btn');
    const tabPanels = document.querySelectorAll<HTMLElement>('.tab-content');

    tabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const targetTab = btn.getAttribute('data-tab');
        if (!targetTab) return;

        tabBtns.forEach(b => b.classList.remove('active'));
        tabPanels.forEach(p => p.classList.remove('active'));

        btn.classList.add('active');
        const targetPanel = document.getElementById(targetTab);
        if (targetPanel) {
          targetPanel.classList.add('active');
        }
      });
    });
  }

  private bindForm(): void {
    const form = document.getElementById('profileEditForm') as HTMLFormElement;
    if (!form) return;

    form.addEventListener('submit', (e: Event) => {
      e.preventDefault();
      this.saveProfile();
    });

    const resetBtn = document.getElementById('btnResetForm');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        this.populateFormFields();
        this.showToast('Đã khôi phục thông tin ban đầu.');
      });
    }
  }

  private bindCertificates(): void {
    const certBtns = document.querySelectorAll<HTMLButtonElement>('.btn-cert-download');
    certBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const certName = (e.currentTarget as HTMLElement).getAttribute('data-cert');
        this.showToast(`📄 Đang tạo bản in PDF cho "${certName}"... Tải xuống thành công!`);
      });
    });
  }

  private bindAvatarUpload(): void {
    const avatarBtn = document.getElementById('btnChangeAvatar');
    if (avatarBtn) {
      avatarBtn.addEventListener('click', () => {
        const newUrl = prompt('Nhập URL ảnh đại diện mới của bạn (hoặc để trống để dùng ảnh mặc định):');
        if (newUrl) {
          const avatarImg = document.getElementById('profileAvatarImg') as HTMLImageElement;
          if (avatarImg) {
            avatarImg.src = newUrl;
            this.showToast('Đã cập nhật ảnh đại diện học viên!');
          }
        }
      });
    }
  }

  private saveProfile(): void {
    const nameInput = document.getElementById('profFullName') as HTMLInputElement;
    const emailInput = document.getElementById('profEmail') as HTMLInputElement;
    const phoneInput = document.getElementById('profPhone') as HTMLInputElement;
    const targetLangSelect = document.getElementById('profTargetLang') as HTMLSelectElement;
    const goalInput = document.getElementById('profDailyGoal') as HTMLSelectElement;
    const reminderInput = document.getElementById('profReminderTime') as HTMLInputElement;
    const bioInput = document.getElementById('profBio') as HTMLTextAreaElement;

    if (nameInput) this.profile.fullName = nameInput.value.trim();
    if (emailInput) this.profile.email = emailInput.value.trim();
    if (phoneInput) this.profile.phone = phoneInput.value.trim();
    if (targetLangSelect) this.profile.targetLanguage = targetLangSelect.value as 'ja' | 'en' | 'vi';
    if (goalInput) this.profile.dailyGoal = parseInt(goalInput.value, 10);
    if (reminderInput) this.profile.reminderTime = reminderInput.value;
    if (bioInput) this.profile.bio = bioInput.value.trim();

    // Persist
    localStorage.setItem('slanguage_user_name', this.profile.fullName);
    localStorage.setItem('slanguage_user_email', this.profile.email);
    localStorage.setItem('slanguage_active_language', this.profile.targetLanguage);
    localStorage.setItem('slanguage_daily_goal', this.profile.dailyGoal.toString());

    this.render();
    this.showToast('✅ Đã lưu cập nhật hồ sơ cá nhân thành công!');
  }

  private render(): void {
    // Header information
    const heroName = document.getElementById('heroStudentName');
    const heroId = document.getElementById('heroStudentId');
    const heroBio = document.getElementById('heroBioText');
    const heroXP = document.getElementById('heroXPVal');
    const heroStreak = document.getElementById('heroStreakVal');
    const heroTargetLang = document.getElementById('heroTargetLangBadge');

    if (heroName) heroName.textContent = this.profile.fullName;
    if (heroId) heroId.textContent = `Mã học viên: ${this.profile.studentId}`;
    if (heroBio) heroBio.textContent = this.profile.bio;
    if (heroXP) heroXP.textContent = this.profile.xp.toLocaleString();
    if (heroStreak) heroStreak.textContent = `${this.profile.streak} Ngày`;
    const headerXPEl = document.getElementById('headerXPVal');
    const headerStreakEl = document.getElementById('headerStreakVal');
    if (headerXPEl) headerXPEl.textContent = `${this.profile.xp.toLocaleString()} XP`;
    if (headerStreakEl) headerStreakEl.textContent = `${this.profile.streak} Ngày`;

    const langFlags: Record<string, string> = {
      ja: '../assets/flags/flag-jp.png',
      en: '../assets/flags/flag-en.png',
      vi: '../assets/flags/flag-vn.png'
    };
    const langNames: Record<string, string> = {
      ja: 'Tiếng Nhật',
      en: 'Tiếng Anh',
      vi: 'Tiếng Việt'
    };
    if (heroTargetLang) {
      const lang = this.profile.targetLanguage || 'ja';
      heroTargetLang.innerHTML = `<img src="${langFlags[lang] || langFlags.ja}" alt="${langNames[lang]}" class="flag-icon-inline"> Mục tiêu chính: ${langNames[lang] || 'Tiếng Nhật'}`;
    }

    this.populateFormFields();
  }

  private bindLangDropdown(): void {
    const langDropdown = document.getElementById('langDropdown');
    const langDropdownBtn = document.getElementById('langDropdownBtn');
    const userDropdown = document.getElementById('userDropdown');
    const userDropdownBtn = document.getElementById('userDropdownBtn');

    if (langDropdown && langDropdownBtn) {
      langDropdownBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        langDropdown.classList.toggle('open');
        const isOpen = langDropdown.classList.contains('open');
        langDropdownBtn.setAttribute('aria-expanded', isOpen.toString());
        if (userDropdown && userDropdownBtn) {
          userDropdown.classList.remove('open');
          userDropdownBtn.setAttribute('aria-expanded', 'false');
        }
      });

      document.addEventListener('click', (e) => {
        if (!langDropdown.contains(e.target as Node)) {
          langDropdown.classList.remove('open');
          langDropdownBtn.setAttribute('aria-expanded', 'false');
        }
      });
    }

    if (userDropdown && userDropdownBtn) {
      userDropdownBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        userDropdown.classList.toggle('open');
        const isOpen = userDropdown.classList.contains('open');
        userDropdownBtn.setAttribute('aria-expanded', isOpen.toString());
        if (langDropdown && langDropdownBtn) {
          langDropdown.classList.remove('open');
          langDropdownBtn.setAttribute('aria-expanded', 'false');
        }
      });

      document.addEventListener('click', (e) => {
        if (!userDropdown.contains(e.target as Node)) {
          userDropdown.classList.remove('open');
          userDropdownBtn.setAttribute('aria-expanded', 'false');
        }
      });
    }

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

    const rawNative = (localStorage.getItem('slanguage_native_language') || 'vi').toLowerCase();
    const nativeLang = rawNative.includes('vi') || rawNative.includes('việt') ? 'vi' : (rawNative.includes('en') || rawNative.includes('anh') ? 'en' : (rawNative.includes('ja') || rawNative.includes('nhật') ? 'ja' : 'vi'));

    const langDropdownItems = document.querySelectorAll<HTMLButtonElement>('.lang-dropdown-item');
    langDropdownItems.forEach(item => {
      if (item.getAttribute('data-lang') === nativeLang) {
        item.style.display = 'none';
      } else {
        item.style.display = 'flex';
      }
    });

    langDropdownItems.forEach(item => {
      item.addEventListener('click', (e) => {
        const lang = (e.currentTarget as HTMLElement).getAttribute('data-lang') as 'ja' | 'en' | 'vi';
        if (lang === nativeLang) return;
        if (lang) {
          localStorage.setItem('slanguage_active_language', lang);
          localStorage.setItem('slanguage_current_lang', lang);
          localStorage.setItem('slanguage_active_language', lang);
          this.profile.targetLanguage = lang;
          this.saveProfile();
          this.render();

          const langNames: Record<string, string> = {
            ja: 'Tiếng Nhật',
            en: 'English',
            vi: 'Tiếng Việt'
          };
          const flagImgs: Record<string, string> = {
            ja: '../assets/flags/flag-jp.png',
            en: '../assets/flags/flag-en.png',
            vi: '../assets/flags/flag-vn.png'
          };
          const currentLangLabel = document.getElementById('currentLangLabel');
          const currentLangFlag = document.getElementById('currentLangFlag') as HTMLImageElement;
          if (currentLangLabel) currentLangLabel.textContent = langNames[lang];
          if (currentLangFlag) currentLangFlag.src = flagImgs[lang];

          document.querySelectorAll('.lang-dropdown-item').forEach(el => {
            el.classList.toggle('active', el.getAttribute('data-lang') === lang);
          });

          if (langDropdown && langDropdownBtn) {
            langDropdown.classList.remove('open');
            langDropdownBtn.setAttribute('aria-expanded', 'false');
          }
        }
      });
    });
  }

  private populateFormFields(): void {
    const nameInput = document.getElementById('profFullName') as HTMLInputElement;
    const emailInput = document.getElementById('profEmail') as HTMLInputElement;
    const phoneInput = document.getElementById('profPhone') as HTMLInputElement;
    const targetLangSelect = document.getElementById('profTargetLang') as HTMLSelectElement;
    const goalInput = document.getElementById('profDailyGoal') as HTMLSelectElement;
    const reminderInput = document.getElementById('profReminderTime') as HTMLInputElement;
    const bioInput = document.getElementById('profBio') as HTMLTextAreaElement;

    if (nameInput) nameInput.value = this.profile.fullName;
    if (emailInput) emailInput.value = this.profile.email;
    if (phoneInput) phoneInput.value = this.profile.phone;
    if (targetLangSelect) targetLangSelect.value = this.profile.targetLanguage;
    if (goalInput) goalInput.value = this.profile.dailyGoal.toString();
    if (reminderInput) reminderInput.value = this.profile.reminderTime;
    if (bioInput) bioInput.value = this.profile.bio;
  }

  private showToast(message: string, flagImg?: string): void {
    let toast = document.getElementById('profileToast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'profileToast';
      toast.className = 'profile-toast';
      document.body.appendChild(toast);
    }

    const flagHtml = flagImg
      ? `<img src="${flagImg}" alt="Flag" style="width: 24px; height: 16px; object-fit: cover; border-radius: 3px; box-shadow: 0 1px 4px rgba(0,0,0,0.4); flex-shrink: 0; vertical-align: middle;">`
      : '';

    toast.style.display = 'flex';
    toast.style.flexDirection = 'column';
    toast.style.alignItems = 'flex-start';
    toast.style.gap = '6px';
    toast.style.border = '2px solid #FFB703';
    toast.style.background = '#061A28';
    toast.style.borderRadius = '16px';
    toast.style.boxShadow = '0 12px 32px rgba(6, 26, 40, 0.6), 0 0 18px rgba(255, 183, 3, 0.25)';
    toast.style.padding = '12px 20px';

    toast.innerHTML = `
      <div style="display: flex; align-items: center; gap: 8px; padding-bottom: 5px; border-bottom: 1px solid rgba(255, 183, 3, 0.25); width: 100%;">
        <img src="../assets/logo.png" alt="S Language Logo" style="width: 20px; height: 20px; object-fit: contain; flex-shrink: 0;">
        <span style="font-size: 0.85rem; font-weight: 700; color: #FFB703; letter-spacing: 0.2px;">S Language thông báo:</span>
      </div>
      <div style="display: flex; align-items: center; gap: 8px; font-size: 0.96rem; font-weight: 700; color: #ffffff;">
        <span>${message}</span>
        ${flagHtml}
      </div>
    `;

    setTimeout(() => {
      if (toast) toast.style.display = 'none';
    }, 3200);
  }
}

// Instantiate on DOMContentLoaded

function initSlanguageProfile(): void {
  (window as unknown as { profileApp?: SlanguageProfile }).profileApp = new SlanguageProfile();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initSlanguageProfile);
} else {
  initSlanguageProfile();
}
