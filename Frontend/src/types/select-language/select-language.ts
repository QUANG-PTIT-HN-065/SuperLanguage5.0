import {
  clearAuthTokens,
  saveAuthTokens,
  saveLearnerIdentity,
  slanguageApi,
} from "../shared/api-client";

/**
 * ===================================================================
 * SLANGUAGE - DEDICATED LANGUAGE SELECTION CONTROLLER
 * Module: select-language/select-language.ts
 * Purpose: Dedicated page for configuring native language & target language
 * ===================================================================
 */

type AppLanguage = 'vi' | 'en' | 'ja';

interface LanguageDetail {
  name: string;
  flag: string;
  title: string;
}

const LANGUAGE_MAP: Record<AppLanguage, LanguageDetail> = {
  vi: {
    name: 'Tiếng Việt',
    flag: '../assets/flags/flag-vn.png',
    title: 'Tiếng Việt (Bản Xứ)'
  },
  en: {
    name: 'English',
    flag: '../assets/flags/flag-en.png',
    title: 'Tiếng Anh (IELTS & Giao tiếp)'
  },
  ja: {
    name: '日本語',
    flag: '../assets/flags/flag-jp.png',
    title: 'Tiếng Nhật (JLPT N5)'
  }
};

class SelectLanguageController {
  private originLanguage: AppLanguage = 'vi';
  private targetLanguage: AppLanguage = 'ja';

  // DOM Elements
  private streamOriginFlag: HTMLImageElement | null = null;
  private streamOriginTitle: HTMLElement | null = null;
  private streamTargetFlag: HTMLImageElement | null = null;
  private streamTargetTitle: HTMLElement | null = null;
  private streamBanner: HTMLElement | null = null;
  private langConflictAlert: HTMLElement | null = null;
  private langConflictMsg: HTMLElement | null = null;
  private btnProceedToOtp: HTMLButtonElement | null = null;
  private toastElement: HTMLElement | null = null;
  private toastTimer: number | null = null;

  constructor() {
    this.init();
  }

  private init(): void {
    // Cache DOM Elements
    this.streamOriginFlag = document.getElementById('streamOriginFlag') as HTMLImageElement;
    this.streamOriginTitle = document.getElementById('streamOriginTitle');
    this.streamTargetFlag = document.getElementById('streamTargetFlag') as HTMLImageElement;
    this.streamTargetTitle = document.getElementById('streamTargetTitle');
    this.streamBanner = document.getElementById('translationStreamBanner');
    this.langConflictAlert = document.getElementById('langConflictAlert');
    this.langConflictMsg = document.getElementById('langConflictMsg');
    this.btnProceedToOtp = document.getElementById('btnProceedToOtp') as HTMLButtonElement;
    this.toastElement = document.getElementById('langToast');

    // Restore any previous selections if stored
    const savedNative = (sessionStorage.getItem('slanguage_reg_native') || localStorage.getItem('slanguage_native_language')) as AppLanguage;
    const savedTarget = (sessionStorage.getItem('slanguage_reg_target') || localStorage.getItem('slanguage_active_language')) as AppLanguage;

    if (savedNative && LANGUAGE_MAP[savedNative]) {
      this.originLanguage = savedNative;
    }
    if (savedTarget && LANGUAGE_MAP[savedTarget]) {
      this.targetLanguage = savedTarget;
    }

    this.bindEvents();
    this.syncAllUI();
    this.validateLanguagePair();

    // Check if user has registration session
    const regEmail = sessionStorage.getItem('slanguage_reg_email');
    if (regEmail) {
      this.showToast(`Chào mừng bạn! Vui lòng chọn ngôn ngữ để học tập.`);
    }
  }

  private bindEvents(): void {
    // 1. Origin Language Cards Selection
    const originCards = document.querySelectorAll<HTMLElement>('[data-origin]');
    originCards.forEach(card => {
      card.addEventListener('click', () => {
        const lang = card.getAttribute('data-origin') as AppLanguage;
        if (lang && LANGUAGE_MAP[lang]) {
          this.originLanguage = lang;
          this.syncAllUI();
          this.validateLanguagePair();
        }
      });
      card.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          card.click();
        }
      });
    });

    // 2. Target Language Cards Selection
    const targetCards = document.querySelectorAll<HTMLElement>('[data-target]');
    targetCards.forEach(card => {
      card.addEventListener('click', () => {
        const lang = card.getAttribute('data-target') as AppLanguage;
        if (lang && LANGUAGE_MAP[lang]) {
          this.targetLanguage = lang;
          this.syncAllUI();
          this.validateLanguagePair();
        }
      });
      card.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          card.click();
        }
      });
    });

    // 3. Confirm & Proceed to OTP Page
    if (this.btnProceedToOtp) {
      this.btnProceedToOtp.addEventListener('click', () => {
        this.handleProceedToOtp();
      });
    }
  }

  private syncOriginCardUI(): void {
    const originCards = document.querySelectorAll<HTMLElement>('[data-origin]');
    originCards.forEach(c => {
      const lang = c.getAttribute('data-origin');
      const isSelected = lang === this.originLanguage;
      if (isSelected) {
        c.classList.add('selected');
        c.setAttribute('aria-checked', 'true');
      } else {
        c.classList.remove('selected');
        c.setAttribute('aria-checked', 'false');
      }
    });
  }

  private syncTargetCardUI(): void {
    const targetCards = document.querySelectorAll<HTMLElement>('[data-target]');
    targetCards.forEach(c => {
      const lang = c.getAttribute('data-target');
      const isSelected = lang === this.targetLanguage;
      if (isSelected) {
        c.classList.add('selected');
        c.setAttribute('aria-checked', 'true');
      } else {
        c.classList.remove('selected');
        c.setAttribute('aria-checked', 'false');
      }
    });
  }

  private updateTranslationStreamUI(): void {
    const origin = LANGUAGE_MAP[this.originLanguage];
    const target = LANGUAGE_MAP[this.targetLanguage];

    if (this.streamOriginFlag) this.streamOriginFlag.src = origin.flag;
    if (this.streamOriginTitle) this.streamOriginTitle.textContent = `${origin.name} (Bản Xứ)`;
    if (this.streamTargetFlag) this.streamTargetFlag.src = target.flag;
    if (this.streamTargetTitle) this.streamTargetTitle.textContent = target.title;
  }

  private validateLanguagePair(): boolean {
    const isConflict = this.originLanguage === this.targetLanguage;
    const origin = LANGUAGE_MAP[this.originLanguage];

    if (this.langConflictAlert) {
      if (isConflict) {
        this.langConflictAlert.style.display = 'flex';
        if (this.langConflictMsg) {
          this.langConflictMsg.textContent = `Ngôn ngữ muốn học không được trùng với ngôn ngữ mẹ đẻ (${origin.name}). Vui lòng chọn ngôn ngữ khác!`;
        }
      } else {
        this.langConflictAlert.style.display = 'none';
      }
    }

    if (this.streamBanner) {
      const arrowLabel = this.streamBanner.querySelector('.stream-arrow-label');
      if (isConflict) {
        this.streamBanner.classList.add('conflict');
        if (arrowLabel) arrowLabel.textContent = 'Trùng lặp ngôn ngữ';
      } else {
        this.streamBanner.classList.remove('conflict');
        if (arrowLabel) arrowLabel.textContent = 'Biên dịch song ngữ';
      }
    }

    // Highlight conflicting target card
    const targetCards = document.querySelectorAll<HTMLElement>('[data-target]');
    targetCards.forEach(c => {
      const lang = c.getAttribute('data-target');
      if (isConflict && lang === this.targetLanguage) {
        c.classList.add('conflict');
      } else {
        c.classList.remove('conflict');
      }
    });

    if (this.btnProceedToOtp) {
      this.btnProceedToOtp.disabled = isConflict;
    }

    return !isConflict;
  }

  private syncAllUI(): void {
    this.syncOriginCardUI();
    this.syncTargetCardUI();
    this.updateTranslationStreamUI();
  }

  private async handleProceedToOtp(): Promise<void> {
    if (!this.validateLanguagePair()) {
      const origin = LANGUAGE_MAP[this.originLanguage];
      this.showToast(`⚠️ Ngôn ngữ muốn học không được trùng với ngôn ngữ mẹ đẻ (${origin.name})!`);
      if (this.langConflictAlert) {
        this.langConflictAlert.classList.remove('shake');
        void this.langConflictAlert.offsetWidth; // Trigger reflow for animation restart
        this.langConflictAlert.classList.add('shake');
      }
      return;
    }

    const fullName = sessionStorage.getItem('slanguage_reg_name');
    const email = sessionStorage.getItem('slanguage_reg_email');
    const password = sessionStorage.getItem('slanguage_reg_pass');
    if (!fullName || !email || !password) {
      this.showToast('Phiên đăng ký không còn hợp lệ. Vui lòng nhập lại thông tin.');
      window.location.href = '../register/index.html';
      return;
    }

    if (this.btnProceedToOtp) {
      this.btnProceedToOtp.disabled = true;
      this.btnProceedToOtp.dataset.originalText = this.btnProceedToOtp.innerHTML;
      this.btnProceedToOtp.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang gửi yêu cầu...';
    }

    try {
      const response = await slanguageApi<{
        user_id: string;
        email: string;
        email_confirmation_required: boolean;
        access_token?: string;
        refresh_token?: string;
      }>('/api/v1/auth/register', {
        method: 'POST',
        anonymous: true,
        body: {
          email,
          password,
          display_name: fullName,
          native_language: this.originLanguage,
          target_language: this.targetLanguage,
          accept_terms: true
        }
      });

      sessionStorage.setItem('slanguage_reg_native', this.originLanguage);
      sessionStorage.setItem('slanguage_reg_target', this.targetLanguage);
      localStorage.setItem('slanguage_native_language', this.originLanguage);
      localStorage.setItem('slanguage_active_language', this.targetLanguage);

      if (response.data.email_confirmation_required) {
        clearAuthTokens();
        localStorage.setItem('slanguage_is_logged_in', 'false');
        localStorage.removeItem('slanguage_user_id');
        localStorage.setItem('slanguage_user_name', fullName);
        localStorage.setItem('slanguage_user_email', response.data.email);
        this.showToast('Đã gửi mã xác thực. Vui lòng kiểm tra email của bạn.');
        window.location.href = '../verify-otp/index.html';
        return;
      }

      if (!response.data.access_token || !response.data.refresh_token) {
        throw new Error('Backend không trả về phiên đăng nhập hợp lệ.');
      }
      saveAuthTokens({
        access_token: response.data.access_token,
        refresh_token: response.data.refresh_token
      });
      saveLearnerIdentity({
        id: response.data.user_id,
        email: response.data.email,
        display_name: fullName
      });
      sessionStorage.removeItem('slanguage_reg_pass');
      window.location.href = '../home/index.html';
    } catch (error) {
      this.showToast(error instanceof Error ? error.message : 'Không thể đăng ký lúc này. Vui lòng thử lại.');
      if (this.btnProceedToOtp) {
        this.btnProceedToOtp.disabled = false;
        this.btnProceedToOtp.innerHTML = this.btnProceedToOtp.dataset.originalText || 'Xác nhận & Nhận mã OTP';
      }
    }
  }

  private showToast(message: string): void {
    if (!this.toastElement) return;
    this.toastElement.textContent = message;
    this.toastElement.classList.add('show');

    if (this.toastTimer) window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => {
      if (this.toastElement) this.toastElement.classList.remove('show');
    }, 3500);
  }
}

// Start on DOM ready
function initSelectLanguage(): void {
  (window as unknown as { selectLanguageApp?: SelectLanguageController }).selectLanguageApp = new SelectLanguageController();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initSelectLanguage);
} else {
  initSelectLanguage();
}

export {};
