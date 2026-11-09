/**
 * Slanguage - Learner Dashboard TypeScript Logic
 * Manages dynamic language switching (English, Japanese, Vietnamese),
 * flashcard interactions, XP tracker, streak logic, and lesson preview modal.
 */

import { slanguageApi } from '../shared/api-client';

interface VocabularyReviewResult {
  data: {
    xp_total: number;
    current_streak: number;
    xp_awarded: number;
    already_completed: boolean;
  };
}

function isVocabularyReviewResult(value: unknown): value is VocabularyReviewResult {
  if (!value || typeof value !== 'object' || !('data' in value)) return false;
  const data = value.data;
  return Boolean(
    data &&
    typeof data === 'object' &&
    'xp_total' in data &&
    typeof data.xp_total === 'number' &&
    'current_streak' in data &&
    typeof data.current_streak === 'number' &&
    'xp_awarded' in data &&
    typeof data.xp_awarded === 'number' &&
    'already_completed' in data &&
    typeof data.already_completed === 'boolean'
  );
}

// Interface for language specific data
interface LanguageData {
  id: 'en' | 'ja' | 'vi';
  name: string;
  nativeName: string;
  flag: string;
  flagImg: string;
  courseTitle: string;
  currentLesson: string;
  lessonProgress: number;
  totalWordsLearned: number;
  level: string;
  flashcard: {
    tag: string;
    word: string;
    phonetic: string;
    meaning: string;
    example: string;
  };
  quizQuestion: {
    question: string;
    options: string[];
    correctIndex: number;
  };
}

// Language database for English, Japanese, Vietnamese
const languagesDB: Record<string, LanguageData> = {
  ja: {
    id: 'ja',
    name: 'Tiếng Nhật',
    nativeName: '日本語',
    flag: '🇯🇵',
    flagImg: new URL('../../../assets/flags/flag-jp.png', import.meta.url).href,
    courseTitle: 'Tiếng Nhật Sơ Cấp JLPT N5',
    currentLesson: 'Bài 14: Gọi món trong quán ăn Tokyo & Mẫu câu V-tai desu',
    lessonProgress: 72,
    totalWordsLearned: 380,
    level: 'Sơ Cấp N5',
    flashcard: {
      tag: 'Kanji & Từ Vựng N5',
      word: '美味しい (Oishii)',
      phonetic: '/oɪ.ʃiː/ - [Tính từ đuôi い]',
      meaning: 'Ngon miệng, thơm ngon',
      example: '「このラーメンはとても美味しいですね！」(Món ramen này thực sự rất ngon!)'
    },
    quizQuestion: {
      question: 'Chọn từ tiếng Nhật đúng nghĩa với: "Cảm ơn rất nhiều"',
      options: ['Arigatou gozaimasu', 'Konnichiwa', 'Sayounara', 'Sumimasen'],
      correctIndex: 0
    }
  },
  en: {
    id: 'en',
    name: 'Tiếng Anh',
    nativeName: 'English',
    flag: '🇺🇸',
    flagImg: new URL('../../../assets/flags/flag-us.png', import.meta.url).href,
    courseTitle: 'English for Global Workplace & Fluency',
    currentLesson: 'Unit 9: Business Negotiation & Idiomatic Expressions',
    lessonProgress: 85,
    totalWordsLearned: 1450,
    level: 'Trung Cấp B2',
    flashcard: {
      tag: 'Business Idiom',
      word: 'Hit the nail on the head',
      phonetic: '/hɪt ðə neɪl ɒn ðə hed/',
      meaning: 'Nói trúng phóc, hoàn toàn chính xác',
      example: '"Your analysis of the market problem really hit the nail on the head."'
    },
    quizQuestion: {
      question: 'Which word is synonymous with "Meticulous"?',
      options: ['Careful and precise', 'Extremely angry', 'Very slow', 'Casual'],
      correctIndex: 0
    }
  },
  vi: {
    id: 'vi',
    name: 'Tiếng Việt',
    nativeName: 'Tiếng Việt',
    flag: '🇻🇳',
    flagImg: new URL('../../../assets/flags/flag-vn.png', import.meta.url).href,
    courseTitle: 'Tiếng Việt Ứng Dụng & Giao Tiếp Đời Sống',
    currentLesson: 'Bài 6: Văn hóa ứng xử & Thành ngữ thường dùng',
    lessonProgress: 94,
    totalWordsLearned: 2100,
    level: 'Bản Xứ / Chuyên Sâu',
    flashcard: {
      tag: 'Thành Ngữ Dân Gian',
      word: 'Học ăn, học nói',
      phonetic: '/hɔkʔ aːn hɔkʔ nɔj˧˥/',
      meaning: 'Học hỏi những điều căn bản và văn minh trong cách ứng xử',
      example: '"Người xưa luôn răn dạy: Học ăn, học nói, học gói, học mở."'
    },
    quizQuestion: {
      question: 'Thành ngữ nào có ý nghĩa tương đương với "Kiên trì ắt thành công"?',
      options: ['Có công mài sắt có ngày nên kim', 'Ăn quả nhớ kẻ trồng cây', 'Một con ngựa đau cả tàu bỏ cỏ', 'Gần mực thì đen gần đèn thì rạng'],
      correctIndex: 0
    }
  }
};

class SlanguageDashboard {
  private currentLang: 'en' | 'ja' | 'vi' = 'ja';
  private currentXP: number = 2450;
  private currentStreak: number = 14;
  private isLoggedIn: boolean = false;
  private isCompletingReview = false;
  private pendingReview: { sessionId: string; knowsWord: boolean } | null = null;
  private langCarouselTimer: number | null = null;
  private currentSlideIndex: number = 0;
  private isCarouselPaused: boolean = false;

  constructor() {
    this.init();
  }

  private init(): void {
    // Check Auth State
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has('auth')) {
      this.isLoggedIn = urlParams.get('auth') === '1' || urlParams.get('auth') === 'true';
      localStorage.setItem('slanguage_is_logged_in', this.isLoggedIn ? 'true' : 'false');
    } else if (urlParams.has('logout')) {
      this.isLoggedIn = false;
      localStorage.setItem('slanguage_is_logged_in', 'false');
    } else {
      this.isLoggedIn = localStorage.getItem('slanguage_is_logged_in') === 'true';
    }

    this.applyAuthState();

    // Check saved language or default to Japanese
    const savedLang = localStorage.getItem('slanguage_active_language') as 'en' | 'ja' | 'vi';
    if (savedLang && languagesDB[savedLang]) {
      this.currentLang = savedLang;
    }

    // Check saved XP
    const savedXP = localStorage.getItem('slanguage_user_xp');
    if (savedXP) {
      this.currentXP = parseInt(savedXP, 10);
    }
    const savedStreak = localStorage.getItem('slanguage_user_streak');
    if (savedStreak) {
      this.currentStreak = parseInt(savedStreak, 10);
    }
    const xpBadge = document.getElementById('headerXPVal');
    if (xpBadge) {
      xpBadge.textContent = `${this.currentXP.toLocaleString()} XP`;
    }
    this.updateStreakDisplay();

    // Check saved user name and sync with Header & Leaderboard
    const savedUserName = localStorage.getItem('slanguage_user_name') || 'Vua Xứ Thanh';
    document.querySelectorAll('.user-info-text .name').forEach(el => {
      el.textContent = savedUserName;
    });
    this.updateUserRankDisplay();

    this.bindEvents();
    this.render();
  }

  private applyAuthState(): void {
    if (this.isLoggedIn) {
      document.body.classList.add('user-authenticated');
      document.body.classList.remove('user-guest');
    } else {
      document.body.classList.add('user-guest');
      document.body.classList.remove('user-authenticated');
    }
    const heroBadgeLabel = document.getElementById('heroBadgeLabel');
    if (heroBadgeLabel) {
      heroBadgeLabel.textContent = this.isLoggedIn ? 'Đang học' : 'Đang chọn';
    }
  }

  private bindEvents(): void {
    // Top Language Dropdown Toggle
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

    // User Account Dropdown Toggle
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

      // Logout Handler
      const logoutBtn = document.getElementById('navLogoutItem');
      if (logoutBtn) {
        logoutBtn.addEventListener('click', (e) => {
          e.preventDefault();
          localStorage.setItem('slanguage_is_logged_in', 'false');
          this.isLoggedIn = false;
          this.applyAuthState();
          this.showToast('Bạn đã đăng xuất tài khoản 👋');
          if (userDropdown) userDropdown.classList.remove('open');
        });
      }
    }

    // Language Dropdown Items
    const langDropdownItems = document.querySelectorAll<HTMLButtonElement>('.lang-dropdown-item');
    langDropdownItems.forEach(item => {
      item.addEventListener('click', (e) => {
        const lang = (e.currentTarget as HTMLElement).getAttribute('data-lang') as 'en' | 'ja' | 'vi';
        if (lang) {
          this.switchLanguage(lang);
          if (langDropdown && langDropdownBtn) {
            langDropdown.classList.remove('open');
            langDropdownBtn.setAttribute('aria-expanded', 'false');
          }
        }
      });
    });

    // Backward-compat for any lang-btn
    const topLangBtns = document.querySelectorAll<HTMLButtonElement>('.lang-btn');
    topLangBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const lang = (e.currentTarget as HTMLElement).getAttribute('data-lang') as 'en' | 'ja' | 'vi';
        if (lang) this.switchLanguage(lang);
      });
    });

    // Language cards in section
    const langCards = document.querySelectorAll<HTMLElement>('.lang-card');
    langCards.forEach(card => {
      card.addEventListener('click', (e) => {
        const lang = (e.currentTarget as HTMLElement).getAttribute('data-lang') as 'en' | 'ja' | 'vi';
        if (lang) this.switchLanguage(lang);
      });
    });

    // Flashcard Flip
    const flashcardBox = document.getElementById('flashcardBox');
    if (flashcardBox) {
      const flipFlashcard = (): void => {
        const isFlipped = flashcardBox.classList.toggle('flipped');
        flashcardBox.setAttribute('aria-pressed', isFlipped.toString());
        flashcardBox.querySelector('.flashcard-front')?.setAttribute('aria-hidden', isFlipped.toString());
        flashcardBox.querySelector('.flashcard-back')?.setAttribute('aria-hidden', (!isFlipped).toString());
      };

      flashcardBox.addEventListener('click', flipFlashcard);
      flashcardBox.addEventListener('keydown', (event: KeyboardEvent) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          flipFlashcard();
        }
      });
    }

    // Flashcard response buttons
    const btnKnow = document.getElementById('btnFlashcardKnow');
    const btnAgain = document.getElementById('btnFlashcardAgain');

    if (btnKnow) {
      btnKnow.addEventListener('click', () => void this.completeVocabularyReview(true, flashcardBox));
    }

    if (btnAgain) {
      btnAgain.addEventListener('click', () => void this.completeVocabularyReview(false, flashcardBox));
    }

    // Modal lesson quiz trigger
    const btnResumeLesson = document.getElementById('btnResumeLesson');
    const lessonModal = document.getElementById('lessonModalOverlay');
    const modalClose = document.getElementById('modalCloseBtn');

    if (btnResumeLesson && lessonModal) {
      btnResumeLesson.addEventListener('click', () => {
        this.openQuizModal();
      });
    }

    if (modalClose && lessonModal) {
      modalClose.addEventListener('click', () => {
        lessonModal.classList.remove('active');
      });
    }

    // Listen audio simulation button
    const btnListenAudio = document.getElementById('btnListenAudio');
    if (btnListenAudio) {
      btnListenAudio.addEventListener('click', () => {
        this.playAudioSimulation();
      });
    }

    // Page navigation transitions
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

    // Initialize 1.5s Auto-rotating Language Banner Carousel
    this.initLanguageCarousel();
  }

  private initLanguageCarousel(): void {
    const carousel = document.getElementById('languageBannerCarousel');
    if (!carousel) return;

    const slides = carousel.querySelectorAll<HTMLElement>('.lang-banner-slide');
    const timerFill = document.getElementById('carouselTimerProgress');

    if (slides.length === 0) return;

    // Start with current language slide if matching
    const initialLangIdx = Array.from(slides).findIndex(s => s.getAttribute('data-lang') === this.currentLang);
    if (initialLangIdx !== -1) {
      this.currentSlideIndex = initialLangIdx;
    }

    const showSlide = (index: number) => {
      this.currentSlideIndex = (index + slides.length) % slides.length;
      slides.forEach((slide, idx) => {
        slide.classList.toggle('active', idx === this.currentSlideIndex);
      });

      // Restart timer bar animation (1.5s cycle)
      if (timerFill) {
        timerFill.style.animation = 'none';
        void timerFill.offsetWidth; // trigger reflow
        timerFill.style.animation = 'carouselTimerAnim 1.5s linear infinite';
      }
    };

    const nextSlide = () => {
      showSlide(this.currentSlideIndex + 1);
    };

    const startTimer = () => {
      stopTimer();
      this.langCarouselTimer = window.setInterval(() => {
        if (!this.isCarouselPaused) {
          nextSlide();
        }
      }, 1500);
    };

    const stopTimer = () => {
      if (this.langCarouselTimer !== null) {
        clearInterval(this.langCarouselTimer);
        this.langCarouselTimer = null;
      }
    };

    // Pause on hover so the user can comfortably view
    carousel.addEventListener('mouseenter', () => {
      this.isCarouselPaused = true;
      if (timerFill) timerFill.style.animationPlayState = 'paused';
    });

    carousel.addEventListener('mouseleave', () => {
      this.isCarouselPaused = false;
      if (timerFill) timerFill.style.animationPlayState = 'running';
    });

    // Initial display and start 1.5s rotation
    showSlide(this.currentSlideIndex);
    startTimer();
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

  public switchLanguage(lang: 'en' | 'ja' | 'vi'): void {
    this.currentLang = lang;
    localStorage.setItem('slanguage_active_language', lang);
    this.render();
    this.showToast(`Đã chuyển sang học: ${languagesDB[lang].name}`, languagesDB[lang].flagImg);
  }

  private addXP(points: number): void {
    this.currentXP += points;
    localStorage.setItem('slanguage_user_xp', this.currentXP.toString());
    const xpBadge = document.getElementById('headerXPVal');
    if (xpBadge) {
      xpBadge.textContent = `${this.currentXP.toLocaleString()} XP`;
    }
    const userRankXP = document.getElementById('currentUserRankXP') || document.querySelector('.rank-item.is-user .rank-xp');
    if (userRankXP) {
      userRankXP.textContent = `${this.currentXP.toLocaleString()} XP`;
    }
  }

  private async completeVocabularyReview(knowsWord: boolean, flashcardBox: HTMLElement | null): Promise<void> {
    if (this.isCompletingReview) return;

    if (!this.isLoggedIn) {
      this.showToast('Đăng nhập để lưu tiến độ ôn tập và nhận XP.');
      return;
    }

    if (this.pendingReview && this.pendingReview.knowsWord !== knowsWord) {
      this.showToast('Hãy thử gửi lại lựa chọn ôn tập trước đó để đồng bộ tiến độ.');
      return;
    }

    this.isCompletingReview = true;
    const reviewButtons = [
      document.getElementById('btnFlashcardKnow'),
      document.getElementById('btnFlashcardAgain'),
    ].filter((button): button is HTMLButtonElement => button instanceof HTMLButtonElement);
    reviewButtons.forEach(button => {
      button.disabled = true;
    });

    try {
      this.pendingReview ??= {
        sessionId: window.crypto.randomUUID(),
        knowsWord,
      };
      const sessionId = this.pendingReview.sessionId;
      const response: unknown = await slanguageApi('/api/v1/vocabulary/review-sessions/complete', {
        method: 'POST',
        body: {
          session_id: sessionId,
          reviewed_count: 1,
          known_count: knowsWord ? 1 : 0,
        },
      });
      if (!isVocabularyReviewResult(response)) {
        throw new Error('Máy chủ chưa trả về số liệu XP và streak hợp lệ.');
      }

      this.currentXP = response.data.xp_total;
      this.currentStreak = response.data.current_streak;
      localStorage.setItem('slanguage_user_xp', this.currentXP.toString());
      localStorage.setItem('slanguage_user_streak', this.currentStreak.toString());
      const xpBadge = document.getElementById('headerXPVal');
      if (xpBadge) xpBadge.textContent = `${this.currentXP.toLocaleString()} XP`;
      const userRankXP = document.getElementById('currentUserRankXP')
        || document.querySelector('.rank-item.is-user .rank-xp');
      if (userRankXP) userRankXP.textContent = `${this.currentXP.toLocaleString()} XP`;
      this.updateStreakDisplay();
      this.pendingReview = null;

      if (response.data.already_completed) {
        this.showToast('Phiên ôn tập này đã được đồng bộ trước đó.');
      } else if (knowsWord) {
        this.showToast(`Tuyệt vời! +${response.data.xp_awarded} XP. Chuỗi học: ${this.currentStreak} ngày.`);
      } else {
        this.showToast(`Đã ghi nhận từ cần ôn lại. Chuỗi học: ${this.currentStreak} ngày.`);
      }

      if (flashcardBox) {
        flashcardBox.classList.remove('flipped');
        flashcardBox.setAttribute('aria-pressed', 'false');
        flashcardBox.querySelector('.flashcard-front')?.setAttribute('aria-hidden', 'false');
        flashcardBox.querySelector('.flashcard-back')?.setAttribute('aria-hidden', 'true');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Lỗi không xác định.';
      this.showToast(`Không thể lưu phiên ôn tập: ${message}`);
    } finally {
      this.isCompletingReview = false;
      reviewButtons.forEach(button => {
        button.disabled = false;
      });
    }
  }

  private updateStreakDisplay(): void {
    document.querySelectorAll('.stat-chip.streak span, .streak-count span').forEach(element => {
      element.textContent = `${this.currentStreak} Ngày`;
    });
  }

  private updateUserRankDisplay(): void {
    const userHeaderName = document.querySelector('.user-info-text .name')?.textContent?.trim();
    const currentUserName = localStorage.getItem('slanguage_user_name') || userHeaderName || 'Vua Xứ Thanh';

    const userRankName = document.getElementById('currentUserRankName') || document.querySelector('.rank-item.is-user .rank-name');
    if (userRankName) {
      userRankName.textContent = `Bạn (${currentUserName})`;
    }

    const userRankXP = document.getElementById('currentUserRankXP') || document.querySelector('.rank-item.is-user .rank-xp');
    if (userRankXP) {
      userRankXP.textContent = `${this.currentXP.toLocaleString()} XP`;
    }

    const miniAvatar = document.querySelector('.user-avatar-mini') as HTMLImageElement;
    const userRankAvatar = (document.getElementById('currentUserRankAvatar') || document.querySelector('.rank-item.is-user .rank-avatar')) as HTMLImageElement;
    if (miniAvatar && userRankAvatar && miniAvatar.src) {
      userRankAvatar.src = miniAvatar.src;
    }
  }

  private render(): void {
    const data = languagesDB[this.currentLang];
    if (!data) return;

    // Update active state in top navbar & dropdown
    document.querySelectorAll<HTMLButtonElement>('.lang-dropdown-item').forEach(item => {
      item.classList.toggle('active', item.getAttribute('data-lang') === this.currentLang);
    });

    document.querySelectorAll<HTMLButtonElement>('.lang-btn').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-lang') === this.currentLang);
    });

    // Update current selected language label & flag on dropdown button
    const currentLangLabel = document.getElementById('currentLangLabel');
    const currentLangFlag = document.getElementById('currentLangFlag') as HTMLImageElement;
    if (currentLangLabel) {
      currentLangLabel.textContent = data.name;
    }
    if (currentLangFlag) {
      currentLangFlag.src = data.flagImg;
      currentLangFlag.alt = data.name;
    }

    // Update active card in showcase grid & banner carousel
    document.querySelectorAll<HTMLElement>('.lang-card').forEach(card => {
      card.classList.toggle('active-selected', card.getAttribute('data-lang') === this.currentLang);
    });

    document.querySelectorAll<HTMLElement>('.lang-banner-slide').forEach(slide => {
      const isCurrent = slide.getAttribute('data-lang') === this.currentLang;
      const statusBadge = slide.querySelector('.lang-banner-badge');
      if (statusBadge) {
        if (isCurrent) {
          statusBadge.innerHTML = `<i class="fa-solid fa-circle-check"></i> Đang học`;
          statusBadge.className = 'lang-banner-badge is-learning';
        } else {
          statusBadge.innerHTML = `<i class="fa-solid fa-graduation-cap"></i> Khóa học tiêu chuẩn`;
          statusBadge.className = 'lang-banner-badge';
        }
      }
    });

    // Update Hero elements
    const heroLangBadge = document.getElementById('heroActiveLang');
    if (heroLangBadge) {
      heroLangBadge.innerHTML = `<img src="${data.flagImg}" alt="${data.name}" class="flag-icon-badge"> <span>${data.name}</span>`;
    }

    const heroSubtitle = document.getElementById('heroCourseTitle');
    if (heroSubtitle) {
      heroSubtitle.textContent = `Lộ trình: ${data.courseTitle}`;
    }

    const heroLessonName = document.getElementById('heroLessonName');
    if (heroLessonName) {
      heroLessonName.textContent = data.currentLesson;
    }

    const heroProgressPercent = document.getElementById('heroProgressPercent');
    const heroProgressFill = document.getElementById('heroProgressFill');
    if (heroProgressPercent && heroProgressFill) {
      heroProgressPercent.textContent = `${data.lessonProgress}%`;
      heroProgressFill.style.width = `${data.lessonProgress}%`;
      heroProgressFill.parentElement?.setAttribute('aria-valuenow', data.lessonProgress.toString());
    }

    // Update Flashcard
    const fcTag = document.getElementById('fcTag');
    const fcWord = document.getElementById('fcWord');
    const fcPhonetic = document.getElementById('fcPhonetic');
    const fcMeaning = document.getElementById('fcMeaning');
    const fcExample = document.getElementById('fcExample');

    if (fcTag) fcTag.textContent = data.flashcard.tag;
    if (fcWord) fcWord.textContent = data.flashcard.word;
    if (fcPhonetic) fcPhonetic.textContent = data.flashcard.phonetic;
    if (fcMeaning) fcMeaning.textContent = data.flashcard.meaning;
    if (fcExample) fcExample.textContent = data.flashcard.example;

    // Reset flipped state
    const flashcardBox = document.getElementById('flashcardBox');
    if (flashcardBox) {
      flashcardBox.classList.remove('flipped');
      flashcardBox.setAttribute('aria-pressed', 'false');
      flashcardBox.querySelector('.flashcard-front')?.setAttribute('aria-hidden', 'false');
      flashcardBox.querySelector('.flashcard-back')?.setAttribute('aria-hidden', 'true');
    }

    // Keep Leaderboard user rank item in sync
    this.updateUserRankDisplay();
  }

  private openQuizModal(): void {
    const data = languagesDB[this.currentLang];
    const modal = document.getElementById('lessonModalOverlay');
    const quizTitle = document.getElementById('quizModalTitle');
    const quizContainer = document.getElementById('quizOptionsContainer');
    const quizFeedback = document.getElementById('quizFeedback');

    if (!modal || !quizTitle || !quizContainer) return;

    quizTitle.textContent = `${data.flag} Bài Luyện Nhanh: ${data.name}`;
    quizContainer.innerHTML = '';
    if (quizFeedback) quizFeedback.innerHTML = '';

    const q = data.quizQuestion;
    const questionText = document.getElementById('quizQuestionText');
    if (questionText) questionText.textContent = q.question;

    q.options.forEach((opt, idx) => {
      const btn = document.createElement('button');
      btn.className = 'quiz-option-btn';
      btn.innerHTML = `<strong>${String.fromCharCode(65 + idx)}.</strong> ${opt}`;
      btn.addEventListener('click', () => {
        this.handleQuizAnswer(idx, q.correctIndex, btn);
      });
      quizContainer.appendChild(btn);
    });

    modal.classList.add('active');
  }

  private handleQuizAnswer(selectedIdx: number, correctIdx: number, btnElement: HTMLElement): void {
    const feedback = document.getElementById('quizFeedback');
    const buttons = document.querySelectorAll<HTMLButtonElement>('.quiz-option-btn');
    buttons.forEach(b => (b.disabled = true));

    if (selectedIdx === correctIdx) {
      btnElement.classList.add('selected-correct');
      if (feedback) {
        feedback.innerHTML = `
          <div style="background: #E0F2FE; border: 1px solid #0077B6; color: #0077B6; padding: 14px; border-radius: 12px; margin-top: 14px; font-weight: 700;">
            <i class="fa-solid fa-circle-check"></i> Chính xác tuyệt đối! +20 XP đã được cộng!
          </div>
        `;
      }
      this.addXP(20);
    } else {
      btnElement.style.background = '#FDE8EC';
      btnElement.style.borderColor = '#DC143C';
      btnElement.style.color = '#9E002B';
      if (feedback) {
        feedback.innerHTML = `
          <div style="background: #FDE8EC; border: 1px solid #DC143C; color: #9E002B; padding: 14px; border-radius: 12px; margin-top: 14px; font-weight: 600;">
            <i class="fa-solid fa-circle-xmark"></i> Chưa chính xác rồi, hãy thử ôn tập lại từ này nhé!
          </div>
        `;
      }
    }
  }

  private playAudioSimulation(): void {
    const data = languagesDB[this.currentLang];
    this.showToast(`🔊 Đang phát phát âm mẫu (${data.name})...`);

    // Use Web Speech API if supported in browser
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(data.flashcard.word);
      if (this.currentLang === 'ja') utterance.lang = 'ja-JP';
      else if (this.currentLang === 'vi') utterance.lang = 'vi-VN';
      else utterance.lang = 'en-US';
      window.speechSynthesis.speak(utterance);
    }
  }

  private showToast(message: string, flagImg?: string): void {
    let toast = document.getElementById('dashboardToast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'dashboardToast';
      toast.style.position = 'fixed';
      toast.style.bottom = '28px';
      toast.style.right = '28px';
      toast.style.background = '#061A28';
      toast.style.color = '#FFB703';
      toast.style.border = '2px solid #FFB703';
      toast.style.padding = '12px 20px';
      toast.style.borderRadius = '16px';
      toast.style.boxShadow = '0 12px 32px rgba(6, 26, 40, 0.6), 0 0 18px rgba(255, 183, 3, 0.25)';
      toast.style.zIndex = '3000';
      toast.style.transition = 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)';
      toast.style.fontFamily = "'Be Vietnam Pro', sans-serif";
      document.body.appendChild(toast);
    }

    const flagHtml = flagImg
      ? `<img src="${flagImg}" alt="Flag" style="width: 24px; height: 16px; object-fit: cover; border-radius: 3px; box-shadow: 0 1px 4px rgba(0,0,0,0.4); flex-shrink: 0; vertical-align: middle;">`
      : '';

    toast.innerHTML = `
      <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px; padding-bottom: 6px; border-bottom: 1px solid rgba(255, 183, 3, 0.25);">
        <img src="../assets/logo.png" alt="S Language Logo" style="width: 20px; height: 20px; object-fit: contain; flex-shrink: 0; filter: drop-shadow(0 1px 3px rgba(0,0,0,0.3));">
        <span style="font-size: 0.85rem; font-weight: 700; color: #FFB703; letter-spacing: 0.2px;">S Language thông báo:</span>
      </div>
      <div style="display: flex; align-items: center; gap: 8px; font-size: 0.96rem; font-weight: 700; color: #ffffff;">
        <span>${message}</span>
        ${flagHtml}
      </div>
    `;

    toast.style.opacity = '1';
    toast.style.transform = 'translateY(0)';

    setTimeout(() => {
      if (toast) {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(15px)';
      }
    }, 3000);
  }
}

// Instantiate on DOMContentLoaded
function initSlanguageDashboard(): void {
  (window as unknown as { homeApp?: SlanguageDashboard }).homeApp = new SlanguageDashboard();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initSlanguageDashboard);
} else {
  initSlanguageDashboard();
}
