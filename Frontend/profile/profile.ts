/**
 * Slanguage - Learner Profile & Analytics TypeScript Logic
 * Manages tab switching, student personal information editing,
 * language mastery breakdowns (English, Japanese, Vietnamese),
 * weekly study chart rendering, certificate preview/download,
 * and dynamic synchronization with localStorage across pages.
 */

interface LevelInfo {
  level: number;
  title: string;
}

function calculateLevelFromXP(xp: number): LevelInfo {
  const safeXP = Math.max(0, xp);
  const level = Math.max(1, Math.floor(safeXP / 180) + 1);
  let title = 'Người yêu mới của mẹ bạn';
  if (level >= 20) {
    title = 'Bậc Thầy Ngôn Ngữ';
  } else if (level >= 15) {
    title = 'Học Viên Xuất Sắc';
  } else if (level >= 12) {
    title = 'Học Viên Ngôn Ngữ';
  } else if (level >= 9) {
    title = 'Học Viên Tinh Anh';
  } else if (level >= 6) {
    title = 'Học Viên Nỗ Lực';
  } else if (level >= 3) {
    title = 'Học Viên Chăm Chỉ';
  }
  return { level, title };
}

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
  currentLevel: number;
  highestLevel: number;
}

class SlanguageProfile {
  private profile: LearnerProfile = {
    fullName: 'Vua Xứ Thanh',
    studentId: 'SLANG-8842',
    email: 'vuaxuthanh@slanguage.edu.vn',
    phone: '0912 345 678',
    birthDate: '2004-05-15',
    gender: 'Nữ',
    city: 'Hà Nội, Việt Nam',
    nativeLanguage: 'Tiếng Việt',
    targetLanguage: 'ja',
    dailyGoal: 30,
    reminderTime: '20:00',
    bio: 'Đam mê văn hóa Nhật Bản và đang nỗ lực đạt chứng chỉ JLPT N3 cùng IELTS 7.0 trong năm nay! 🌸',
    xp: 2450,
    streak: 18,
    level: 14,
    currentLevel: 14,
    highestLevel: 14
  };

  constructor() {
    if (localStorage.getItem('slanguage_is_logged_in') !== 'true') {
      localStorage.setItem('slanguage_is_logged_in', 'true');
    }
    this.init();
  }

  private init(): void {
    const overlay = document.getElementById('slanguageLoadingOverlay');
    if (overlay) {
      overlay.classList.remove('active');
      overlay.style.pointerEvents = 'none';
    }

    this.loadFromStorage();
    this.bindTabs();
    this.bindForm();
    this.bindCertificates();
    this.bindAvatarUpload();
    this.bindLangDropdown();
    this.bindPageTransitions();

    const updateAll = () => {
      this.loadFromStorage();
      this.render();
    };

    // Auto-update header and stats across tabs, on focus, or when data changes locally
    window.addEventListener('storage', updateAll);
    window.addEventListener('focus', updateAll);
    window.addEventListener('pageshow', updateAll);
    window.addEventListener('slanguage_data_changed', updateAll);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        updateAll();
      }
    });

    // Reset and mute video if page is shown from bfcache or when hidden
    window.addEventListener('pageshow', () => {
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

    this.render();
  }

  private bindPageTransitions(): void {
    document.querySelectorAll<HTMLAnchorElement>('a[href]').forEach(link => {
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
          if (cleanHref === './index.html' || cleanHref === 'index.html' || cleanHref === '' || cleanHref.endsWith('/profile/') || cleanHref.endsWith('/profile/index.html')) {
            if (href.includes('#')) {
              e.preventDefault();
              const hash = href.split('#')[1];
              const tabBtn = document.querySelector<HTMLButtonElement>(`.tab-btn[data-tab="${hash}"]`);
              if (tabBtn) tabBtn.click();
            } else {
              e.preventDefault();
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }
            return;
          }
          e.preventDefault();
          this.triggerLoadingAndRedirect(href);
        });
      }
    });
  }

  private triggerLoadingAndRedirect(targetUrl: string, duration: number = 800): void {
    const overlay = document.getElementById('slanguageLoadingOverlay');
    const video = document.getElementById('loadingVideoPlayer') as HTMLVideoElement | null;
    if (overlay) {
      overlay.classList.add('active');
      overlay.style.pointerEvents = 'all';
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

    // Fallback: restore interactivity if navigation stalls
    setTimeout(() => {
      if (overlay) {
        overlay.classList.remove('active');
        overlay.style.pointerEvents = 'none';
      }
    }, 3500);
  }

  private loadFromStorage(): void {
    // 1. Tên học viên
    const savedName = localStorage.getItem('slanguage_user_name');
    if (savedName) {
      this.profile.fullName = savedName;
    } else {
      const rawUser = localStorage.getItem('slanguage_current_user');
      if (rawUser) {
        try {
          const u = JSON.parse(rawUser);
          if (u.name || u.fullName) this.profile.fullName = u.name || u.fullName;
        } catch (e) {}
      }
    }

    // 2. Email
    const savedEmail = localStorage.getItem('slanguage_user_email');
    if (savedEmail) this.profile.email = savedEmail;

    // 3. Số điện thoại
    const savedPhone = localStorage.getItem('slanguage_user_phone');
    if (savedPhone) this.profile.phone = savedPhone;

    // 4. Thành phố
    const savedCity = localStorage.getItem('slanguage_user_city');
    if (savedCity) this.profile.city = savedCity;

    // 5. Tiểu sử
    const savedBio = localStorage.getItem('slanguage_user_bio');
    if (savedBio) this.profile.bio = savedBio;

    // 6. Thời gian nhắc nhở
    const savedReminder = localStorage.getItem('slanguage_reminder_time');
    if (savedReminder) this.profile.reminderTime = savedReminder;

    // 7. Ngôn ngữ mẹ đẻ
    const rawNative = (localStorage.getItem('slanguage_native_language') || 'vi').toLowerCase();
    const nativeLang = rawNative.includes('vi') || rawNative.includes('việt') ? 'vi' : (rawNative.includes('en') || rawNative.includes('anh') ? 'en' : (rawNative.includes('ja') || rawNative.includes('nhật') ? 'ja' : 'vi'));
    this.profile.nativeLanguage = nativeLang === 'vi' ? 'Tiếng Việt' : (nativeLang === 'en' ? 'English' : 'Tiếng Nhật');

    // 8. Ngôn ngữ mục tiêu
    let savedLang = (localStorage.getItem('slanguage_active_language') || localStorage.getItem('slanguage_current_lang') || localStorage.getItem('slanguage_user_lang')) as 'ja' | 'en' | 'vi';
    if (!savedLang || !['ja', 'en', 'vi'].includes(savedLang)) {
      savedLang = 'ja';
    }
    this.profile.targetLanguage = savedLang;
    localStorage.setItem('slanguage_active_language', savedLang);
    localStorage.setItem('slanguage_current_lang', savedLang);
    localStorage.setItem('slanguage_user_lang', savedLang);

    // 9. Mục tiêu học mỗi ngày (phút)
    const savedGoal = localStorage.getItem('slanguage_daily_goal');
    if (savedGoal) {
      const parsedGoal = parseInt(savedGoal, 10);
      if (!isNaN(parsedGoal)) this.profile.dailyGoal = parsedGoal;
    }

    // 10. EXP
    let resolvedXP = 2450;
    const savedXP = localStorage.getItem('slanguage_user_xp');
    if (savedXP !== null) {
      const clean = savedXP.replace(/[^0-9]/g, '');
      const parsed = parseInt(clean, 10);
      if (!isNaN(parsed)) {
        resolvedXP = parsed;
      }
    } else {
      const rawUser = localStorage.getItem('slanguage_current_user');
      if (rawUser) {
        try {
          const u = JSON.parse(rawUser);
          if (typeof u.xp === 'number') resolvedXP = u.xp;
        } catch (e) {}
      }
      localStorage.setItem('slanguage_user_xp', resolvedXP.toString());
    }
    this.profile.xp = resolvedXP;

    // 11. Chuỗi Streak
    const savedStreak = localStorage.getItem('slanguage_user_streak');
    if (savedStreak !== null) {
      const parsedStreak = parseInt(savedStreak, 10);
      if (!isNaN(parsedStreak)) {
        this.profile.streak = parsedStreak;
      }
    } else {
      this.profile.streak = 18;
      localStorage.setItem('slanguage_user_streak', '18');
    }

    // 12. Máu / Sinh mệnh (Hearts)
    const savedHearts = localStorage.getItem('slanguage_user_hearts');
    if (savedHearts === null) {
      localStorage.setItem('slanguage_user_hearts', '5');
    }

    // 13. Cấp hiện tại (luân phiên thay đổi theo lượng exp người dùng hiện có)
    const currentInfo = calculateLevelFromXP(this.profile.xp);
    this.profile.currentLevel = currentInfo.level;

    // 14. Cấp cao nhất (thay đổi khi người dùng đạt mốc cấp cao nhất tiếp theo, không bị giảm khi đổi coin)
    const savedHighest = localStorage.getItem('slanguage_user_highest_level');
    let highest = savedHighest !== null ? parseInt(savedHighest, 10) : currentInfo.level;
    if (isNaN(highest) || highest < currentInfo.level) highest = currentInfo.level;
    this.profile.highestLevel = highest;
    localStorage.setItem('slanguage_user_highest_level', highest.toString());
    this.profile.level = this.profile.currentLevel;
  }

  private bindTabs(): void {
    const tabBtns = document.querySelectorAll<HTMLButtonElement>('.tab-btn');
    const tabPanels = document.querySelectorAll<HTMLElement>('.tab-content');

    const activateTab = (targetTab: string) => {
      tabBtns.forEach(b => {
        b.classList.toggle('active', b.getAttribute('data-tab') === targetTab);
      });
      tabPanels.forEach(p => {
        p.classList.toggle('active', p.id === targetTab);
      });
    };

    tabBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const targetTab = btn.getAttribute('data-tab');
        if (targetTab) {
          activateTab(targetTab);
          history.replaceState(null, '', `#${targetTab}`);
        }
      });
    });

    // Hash routing support on initial load
    const currentHash = window.location.hash.replace('#', '');
    if (currentHash && document.getElementById(currentHash)) {
      activateTab(currentHash);
    }

    window.addEventListener('hashchange', () => {
      const newHash = window.location.hash.replace('#', '');
      if (newHash && document.getElementById(newHash)) {
        activateTab(newHash);
      }
    });
  }

  private bindForm(): void {
    const form = document.getElementById('profileEditForm') as HTMLFormElement | null;
    if (!form) return;

    form.addEventListener('submit', (e: Event) => {
      e.preventDefault();
      this.saveProfile();
    });

    const resetBtn = document.getElementById('btnResetForm');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        this.loadFromStorage();
        this.populateFormFields();
        this.render();
        this.showToast('Đã khôi phục thông tin từ bộ nhớ!');
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
        const currentAvatar = localStorage.getItem('slanguage_user_avatar') || '';
        const newUrl = prompt('Nhập URL ảnh đại diện mới của bạn (hoặc để trống để hoàn tác):', currentAvatar);
        if (newUrl !== null) {
          const cleanUrl = newUrl.trim();
          if (cleanUrl) {
            localStorage.setItem('slanguage_user_avatar', cleanUrl);
            document.querySelectorAll<HTMLImageElement>('.user-avatar-mini, #headerAvatar, #profileAvatarImg').forEach(img => {
              img.src = cleanUrl;
            });
            this.showToast('✅ Đã cập nhật ảnh đại diện học viên!');
            window.dispatchEvent(new Event('storage'));
          }
        }
      });
    }
  }

  private saveProfile(): void {
    const nameInput = document.getElementById('profFullName') as HTMLInputElement | null;
    const emailInput = document.getElementById('profEmail') as HTMLInputElement | null;
    const phoneInput = document.getElementById('profPhone') as HTMLInputElement | null;
    const cityInput = document.getElementById('profCity') as HTMLInputElement | null;
    const targetLangSelect = document.getElementById('profTargetLang') as HTMLSelectElement | null;
    const goalInput = document.getElementById('profDailyGoal') as HTMLSelectElement | null;
    const reminderInput = document.getElementById('profReminderTime') as HTMLInputElement | null;
    const bioInput = document.getElementById('profBio') as HTMLTextAreaElement | null;

    if (nameInput && nameInput.value.trim()) this.profile.fullName = nameInput.value.trim();
    if (emailInput && emailInput.value.trim()) this.profile.email = emailInput.value.trim();
    if (phoneInput) this.profile.phone = phoneInput.value.trim();
    if (cityInput) this.profile.city = cityInput.value.trim();
    if (targetLangSelect) this.profile.targetLanguage = targetLangSelect.value as 'ja' | 'en' | 'vi';
    if (goalInput) this.profile.dailyGoal = parseInt(goalInput.value, 10);
    if (reminderInput) this.profile.reminderTime = reminderInput.value;
    if (bioInput) this.profile.bio = bioInput.value.trim();

    // Persist
    localStorage.setItem('slanguage_user_name', this.profile.fullName);
    localStorage.setItem('slanguage_user_email', this.profile.email);
    localStorage.setItem('slanguage_user_phone', this.profile.phone);
    localStorage.setItem('slanguage_user_city', this.profile.city);
    localStorage.setItem('slanguage_active_language', this.profile.targetLanguage);
    localStorage.setItem('slanguage_current_lang', this.profile.targetLanguage);
    localStorage.setItem('slanguage_user_lang', this.profile.targetLanguage);
    localStorage.setItem('slanguage_daily_goal', this.profile.dailyGoal.toString());
    localStorage.setItem('slanguage_reminder_time', this.profile.reminderTime);
    localStorage.setItem('slanguage_user_bio', this.profile.bio);

    // Synchronize current user object
    const rawUser = localStorage.getItem('slanguage_current_user');
    let uObj: any = {};
    if (rawUser) {
      try { uObj = JSON.parse(rawUser); } catch (e) {}
    }
    uObj.name = this.profile.fullName;
    uObj.fullName = this.profile.fullName;
    uObj.email = this.profile.email;
    uObj.phone = this.profile.phone;
    uObj.city = this.profile.city;
    uObj.bio = this.profile.bio;
    uObj.targetLanguage = this.profile.targetLanguage;
    localStorage.setItem('slanguage_current_user', JSON.stringify(uObj));

    // Update users database if present
    const rawDb = localStorage.getItem('slanguage_users_db');
    if (rawDb) {
      try {
        const db = JSON.parse(rawDb);
        if (Array.isArray(db)) {
          const userIdx = db.findIndex((u: any) => u.email === this.profile.email || u.fullName === this.profile.fullName);
          if (userIdx !== -1) {
            db[userIdx].fullName = this.profile.fullName;
            db[userIdx].phone = this.profile.phone;
            db[userIdx].city = this.profile.city;
            db[userIdx].bio = this.profile.bio;
            db[userIdx].targetLanguage = this.profile.targetLanguage;
            localStorage.setItem('slanguage_users_db', JSON.stringify(db));
          }
        }
      } catch (e) {}
    }

    this.render();
    window.dispatchEvent(new Event('storage'));
    window.dispatchEvent(new CustomEvent('slanguage_data_changed'));
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

    if (heroName) {
      heroName.innerHTML = `${this.profile.fullName} <i class="fa-solid fa-circle-check" style="color: var(--color-mint); font-size: 1.3rem;" title="Học viên đã xác minh"></i>`;
    }
    if (heroId) heroId.textContent = `Mã học viên: ${this.profile.studentId}`;
    if (heroBio) heroBio.textContent = this.profile.bio;
    if (heroXP) heroXP.textContent = this.profile.xp.toLocaleString();
    if (heroStreak) heroStreak.textContent = `${this.profile.streak} Ngày`;

    // Dynamic Top Navbar Header Stats
    const headerXPEl = document.getElementById('headerXPVal');
    const headerStreakEl = document.getElementById('headerStreakVal');
    if (headerXPEl) headerXPEl.textContent = `${this.profile.xp.toLocaleString()} XP`;
    const dropXp = document.getElementById('dropdownXPVal');
    if (dropXp) dropXp.textContent = `${this.profile.xp.toLocaleString()} XP`;
    if (headerStreakEl) headerStreakEl.textContent = `${this.profile.streak} Ngày`;
    const dropStreak = document.getElementById('dropdownStreakVal');
    if (dropStreak) dropStreak.textContent = `${this.profile.streak} Ngày`;
    const savedHearts = localStorage.getItem('slanguage_user_hearts');
    const heartsNum = savedHearts !== null ? Math.max(0, Math.min(5, parseInt(savedHearts, 10))) : 5;
    const headerHeartsEl = document.getElementById('headerHeartsVal');
    if (headerHeartsEl) headerHeartsEl.textContent = `${heartsNum}/5`;
    const dropHearts = document.getElementById('dropdownHeartsVal');
    if (dropHearts) dropHearts.textContent = `${heartsNum}/5`;

    // Dynamic Top Navbar User Name & Avatar
    document.querySelectorAll('.user-info-text .name, #dropdownUserName').forEach(el => {
      el.textContent = this.profile.fullName;
    });

    const savedAvatar = localStorage.getItem('slanguage_user_avatar');
    if (savedAvatar) {
      document.querySelectorAll<HTMLImageElement>('.user-avatar-mini, #headerAvatar').forEach(img => {
        img.src = savedAvatar;
      });
      const profileAvatarImg = document.getElementById('profileAvatarImg') as HTMLImageElement | null;
      if (profileAvatarImg) profileAvatarImg.src = savedAvatar;
    }

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

    const curLang = this.profile.targetLanguage || 'ja';
    const currentLangFlag = document.getElementById('currentLangFlag') as HTMLImageElement | null;
    const currentLangLabel = document.getElementById('currentLangLabel');
    if (currentLangFlag && langFlags[curLang]) {
      currentLangFlag.src = langFlags[curLang];
      currentLangFlag.alt = langNames[curLang] || 'Ngôn ngữ';
    }
    if (currentLangLabel && langNames[curLang]) {
      currentLangLabel.textContent = langNames[curLang];
    }
    document.querySelectorAll('.lang-dropdown-item').forEach(item => {
      item.classList.toggle('active', item.getAttribute('data-lang') === curLang);
    });

    if (heroTargetLang) {
      heroTargetLang.innerHTML = `<img src="${langFlags[curLang] || langFlags.ja}" alt="${langNames[curLang]}" class="flag-icon-inline" width="20" height="14" style="width:20px;height:14px;object-fit:cover;"> Mục tiêu chính: ${langNames[curLang] || 'Tiếng Nhật'}`;
    }

    // Render Cấp hiện tại & Cấp cao nhất
    const currentInfo = calculateLevelFromXP(this.profile.xp);
    this.profile.currentLevel = currentInfo.level;
    if (this.profile.currentLevel > this.profile.highestLevel) {
      this.profile.highestLevel = this.profile.currentLevel;
      localStorage.setItem('slanguage_user_highest_level', this.profile.highestLevel.toString());
    }
    const highestInfo = calculateLevelFromXP((this.profile.highestLevel - 1) * 180);

    const currentLevelText = document.getElementById('heroCurrentLevelText');
    if (currentLevelText) {
      currentLevelText.textContent = `Cấp hiện tại: Cấp ${this.profile.currentLevel} - ${currentInfo.title}`;
    }

    const highestLevelText = document.getElementById('heroHighestLevelText');
    if (highestLevelText) {
      highestLevelText.textContent = `Cấp cao nhất: Cấp ${this.profile.highestLevel} - ${highestInfo.title}`;
    }

    const habitHighestLevel = document.getElementById('habitHighestLevel');
    if (habitHighestLevel) {
      habitHighestLevel.textContent = `Cấp ${this.profile.highestLevel} - ${highestInfo.title}`;
    }

    const habitCurrentLevel = document.getElementById('habitCurrentLevel');
    if (habitCurrentLevel) {
      habitCurrentLevel.textContent = `Cấp ${this.profile.currentLevel} - ${currentInfo.title}`;
    }

    const habitStreakVal = document.getElementById('habitStreakVal');
    if (habitStreakVal) {
      habitStreakVal.textContent = `${this.profile.streak} Ngày`;
    }

    const habitReminder = document.getElementById('habitReminderTime');
    if (habitReminder) {
      const startTime = this.profile.reminderTime || '20:00';
      const parts = startTime.split(':');
      const startH = parseInt(parts[0], 10);
      const endH = !isNaN(startH) ? (startH + 1) % 24 : 21;
      const endFormatted = `${endH.toString().padStart(2, '0')}:${parts[1] || '00'}`;
      habitReminder.textContent = `${startTime} - ${endFormatted}`;
    }

    // Cập nhật ngày tham gia theo thời gian thực tế
    const heroJoinDate = document.getElementById('heroJoinDateBadge');
    if (heroJoinDate) {
      const savedJoinDate = localStorage.getItem('slanguage_user_created_at');
      let joinStr = 'Tháng 11, 2026';
      if (savedJoinDate) {
        try {
          const d = new Date(savedJoinDate);
          if (!isNaN(d.getTime())) {
            joinStr = `Tháng ${(d.getMonth() + 1).toString().padStart(2, '0')}, ${d.getFullYear()}`;
          }
        } catch (e) {}
      } else {
        const now = new Date();
        joinStr = `Tháng ${(now.getMonth() + 1).toString().padStart(2, '0')}, ${now.getFullYear()}`;
      }
      heroJoinDate.innerHTML = `<i class="fa-solid fa-calendar-check"></i> Tham gia: ${joinStr}`;
    }

    // Cập nhật tổng thời gian đã học
    const heroStudyHours = document.getElementById('heroStudyHoursVal');
    if (heroStudyHours) {
      const savedMinutes = parseInt(localStorage.getItem('slanguage_total_study_minutes') || '', 10);
      let hours = 48.5;
      if (!isNaN(savedMinutes) && savedMinutes > 0) {
        hours = Math.round((savedMinutes / 60) * 10) / 10;
      } else {
        hours = Math.max(1.0, Math.round((this.profile.xp * 1.2 / 60) * 10) / 10);
      }
      heroStudyHours.textContent = `${hours}h`;
    }

    // Cập nhật bảng Lịch sử bài học gần đây
    this.renderRecentLessons();

    // Cập nhật biểu đồ học tập tuần qua
    this.renderWeeklyActivityChart();

    // Update habit/circular cards focus styling if Japanese/English/Vietnamese is active
    document.querySelectorAll('.lang-circle-card').forEach(card => {
      const titleEl = card.querySelector('.circle-card-title .lang-title-text');
      if (titleEl) {
        const text = titleEl.textContent || '';
        const isMatch = (curLang === 'ja' && text.includes('Nhật')) ||
                        (curLang === 'en' && text.includes('Anh')) ||
                        (curLang === 'vi' && text.includes('Việt'));
        card.classList.toggle('active-focus', isMatch);
        let progTag = card.querySelector('.lang-prog-tag');
        if (isMatch) {
          if (!progTag) {
            progTag = document.createElement('span');
            progTag.className = 'lang-prog-tag';
            progTag.textContent = 'Ngôn ngữ chính';
            card.querySelector('.circle-card-title')?.appendChild(progTag);
          }
        } else {
          if (progTag) progTag.remove();
        }
      }
    });

    // Update certificates student name in Tab 3
    document.querySelectorAll('.cert-student-name').forEach(el => {
      el.textContent = this.profile.fullName;
    });

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

    const langDropdownItems = document.querySelectorAll<HTMLButtonElement>('.lang-dropdown-item');
    langDropdownItems.forEach(item => {
      item.style.display = 'flex';
    });

    langDropdownItems.forEach(item => {
      item.addEventListener('click', (e) => {
        const lang = (e.currentTarget as HTMLElement).getAttribute('data-lang') as 'ja' | 'en' | 'vi';
        if (lang) {
          localStorage.setItem('slanguage_active_language', lang);
          localStorage.setItem('slanguage_current_lang', lang);
          localStorage.setItem('slanguage_user_lang', lang);
          this.profile.targetLanguage = lang;
          this.saveProfile();
          this.render();
          window.dispatchEvent(new CustomEvent('slanguage_data_changed'));

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
          const currentLangFlag = document.getElementById('currentLangFlag') as HTMLImageElement | null;
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
    const nameInput = document.getElementById('profFullName') as HTMLInputElement | null;
    const emailInput = document.getElementById('profEmail') as HTMLInputElement | null;
    const phoneInput = document.getElementById('profPhone') as HTMLInputElement | null;
    const cityInput = document.getElementById('profCity') as HTMLInputElement | null;
    const targetLangSelect = document.getElementById('profTargetLang') as HTMLSelectElement | null;
    const goalInput = document.getElementById('profDailyGoal') as HTMLSelectElement | null;
    const reminderInput = document.getElementById('profReminderTime') as HTMLInputElement | null;
    const nativeLangInput = document.getElementById('profNativeLang') as HTMLInputElement | null;
    const bioInput = document.getElementById('profBio') as HTMLTextAreaElement | null;

    if (nameInput) nameInput.value = this.profile.fullName;
    if (emailInput) emailInput.value = this.profile.email;
    if (phoneInput) phoneInput.value = this.profile.phone;
    if (cityInput) cityInput.value = this.profile.city;
    if (targetLangSelect) targetLangSelect.value = this.profile.targetLanguage;
    if (goalInput) goalInput.value = this.profile.dailyGoal.toString();
    if (reminderInput) reminderInput.value = this.profile.reminderTime;
    if (nativeLangInput) nativeLangInput.value = this.profile.nativeLanguage;
    if (bioInput) bioInput.value = this.profile.bio;
  }

  private renderRecentLessons(): void {
    const tbody = document.getElementById('profileRecentLessonsBody');
    if (!tbody) return;

    let lessons: any[] = [];
    try {
      const raw = localStorage.getItem('slanguage_recent_lessons');
      if (raw) {
        lessons = JSON.parse(raw);
      }
    } catch (e) {}

    const now = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');

    // Nếu chưa có lịch sử lưu, khởi tạo mẫu động theo đúng mốc thời gian thực tế
    if (!Array.isArray(lessons) || lessons.length === 0) {
      lessons = [
        {
          title: 'Bài 14: Gọi món & Hỏi giá',
          lang: 'ja',
          timestamp: now.toISOString(),
          score: '98/100',
          status: 'Xuất sắc',
          xpEarned: 25
        },
        {
          title: 'Unit 9: Business Negotiation',
          lang: 'en',
          timestamp: new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
          score: '92/100',
          status: 'Đạt',
          xpEarned: 20
        },
        {
          title: 'Bài 5: 6 Thanh điệu & Trắc âm',
          lang: 'vi',
          timestamp: new Date(Date.now() - 48 * 3600 * 1000).toISOString(),
          score: '100/100',
          status: 'Hoàn hảo',
          xpEarned: 15
        }
      ];
      localStorage.setItem('slanguage_recent_lessons', JSON.stringify(lessons));
    }

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

    const formatTimestamp = (isoStr: string) => {
      try {
        const d = new Date(isoStr);
        if (isNaN(d.getTime())) return isoStr || 'Vừa xong';
        const isToday = d.toDateString() === now.toDateString();
        const yesterday = new Date(now);
        yesterday.setDate(now.getDate() - 1);
        const isYesterday = d.toDateString() === yesterday.toDateString();

        const timePart = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
        if (isToday) return `Hôm nay, ${timePart}`;
        if (isYesterday) return `Hôm qua, ${timePart}`;
        return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
      } catch (e) {
        return 'Vừa xong';
      }
    };

    tbody.innerHTML = lessons.slice(0, 5).map(item => {
      const flagSrc = langFlags[item.lang] || langFlags.ja;
      const langName = langNames[item.lang] || 'Tiếng Nhật';
      const timeDisplay = formatTimestamp(item.timestamp);
      const isPerfect = item.status === 'Hoàn hảo';
      const color = isPerfect ? '#10b981' : (item.status === 'Xuất sắc' ? '#0ea5e9' : '#10b981');
      return `
        <tr>
          <td><strong>${item.title}</strong></td>
          <td><img src="${flagSrc}" alt="${item.lang}" class="flag-icon-inline" width="20" height="14" style="width:20px;height:14px;object-fit:cover;"> ${langName}</td>
          <td>${timeDisplay}</td>
          <td><span class="score-badge">${item.score || '100/100'}</span></td>
          <td><span style="color: ${color}; font-weight: 700;"><i class="fa-solid fa-circle-check"></i> ${item.status || 'Xuất sắc'}</span></td>
        </tr>
      `;
    }).join('');
  }

  private renderWeeklyActivityChart(): void {
    const dayNames = ['CN', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
    const todayIndex = new Date().getDay();
    const todayName = dayNames[todayIndex];

    document.querySelectorAll<SVGGElement>('.area-data-point').forEach(point => {
      const day = point.getAttribute('data-day');
      const isToday = day === todayName;
      if (isToday) {
        point.classList.add('today-day');
        const text = point.querySelector('.day-axis-label');
        if (text) {
          text.setAttribute('font-weight', 'bold');
          text.setAttribute('fill', '#00B4D8');
        }
      }
    });

    const weeklyTotalEl = document.getElementById('weeklyStudyTotalText');
    if (weeklyTotalEl) {
      weeklyTotalEl.textContent = `315 phút (~5.2 giờ)`;
    }
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
  (window as any).calculateLevelFromXP = calculateLevelFromXP;
  (window as any).profileApp = new SlanguageProfile();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initSlanguageProfile);
} else {
  initSlanguageProfile();
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
