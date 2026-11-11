/**
 * ===================================================================
 * SLANGUAGE - DEDICATED OTP VERIFICATION CONTROLLER
 * Module: verify-otp/verify-otp.ts
 * Purpose: Dedicated page for 8-digit OTP confirmation & account activation
 * ===================================================================
 */

interface UserAccount {
  fullName: string;
  email: string;
  password: string;
  nativeLanguage?: string;
  targetLanguage?: string;
  xp?: number;
  createdAt?: string;
}

const DEFAULT_USERS_DB: UserAccount[] = [
  {
    fullName: 'Vua Xứ Thanh',
    email: 'quanquan@gmail.com',
    password: '123456',
    nativeLanguage: 'vi',
    targetLanguage: 'ja',
    xp: 0,
    createdAt: '2026-01-01T00:00:00.000Z'
  },
  {
    fullName: 'Học viên Slanguage',
    email: 'hocvien@slanguage.edu.vn',
    password: '123456',
    nativeLanguage: 'vi',
    targetLanguage: 'en',
    xp: 0,
    createdAt: '2026-01-01T00:00:00.000Z'
  },
  {
    fullName: 'Nguyễn Văn A',
    email: 'learner@gmail.com',
    password: '123456',
    nativeLanguage: 'vi',
    targetLanguage: 'ja',
    xp: 0,
    createdAt: '2026-01-01T00:00:00.000Z'
  }
];

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

class VerifyOtpController {
  private registeredFullName: string = 'Học viên Slanguage';
  private registeredEmail: string = 'learner@gmail.com';
  private originLanguage: AppLanguage = 'vi';
  private targetLanguage: AppLanguage = 'ja';

  private currentOtpCode: string = '86868686';
  private otpSecondsLeft: number = 60;
  private otpTimerInterval: number | null = null;

  // DOM Elements
  private displayOtpEmail: HTMLElement | null = null;
  private displayLangPairTag: HTMLElement | null = null;
  private otpBoxes: HTMLInputElement[] = [];
  private otpErrorNote: HTMLElement | null = null;
  private timerCountdownWrap: HTMLElement | null = null;
  private timerCountdownCount: HTMLElement | null = null;
  private btnResendOtp: HTMLButtonElement | null = null;
  private btnConfirmOtp: HTMLButtonElement | null = null;

  // Success Modal & Loading
  private registrationSuccessModal: HTMLElement | null = null;
  private btnGoToHomeAfterReg: HTMLButtonElement | null = null;
  private loadingOverlay: HTMLElement | null = null;
  private loadingVideo: HTMLVideoElement | null = null;

  // Toast
  private toastElement: HTMLElement | null = null;
  private toastTimer: number | null = null;

  constructor() {
    this.init();
  }

  private init(): void {
    // 1. Read registered user data from sessionStorage/localStorage
    const savedName = sessionStorage.getItem('slanguage_reg_name') || localStorage.getItem('slanguage_user_name');
    const savedEmail = sessionStorage.getItem('slanguage_reg_email') || localStorage.getItem('slanguage_user_email');
    const savedNative = (sessionStorage.getItem('slanguage_reg_native') || localStorage.getItem('slanguage_native_language')) as AppLanguage;
    const savedTarget = (sessionStorage.getItem('slanguage_reg_target') || localStorage.getItem('slanguage_active_language')) as AppLanguage;

    if (savedName) this.registeredFullName = savedName;
    if (savedEmail) this.registeredEmail = savedEmail;
    if (savedNative && LANGUAGE_MAP[savedNative]) this.originLanguage = savedNative;
    if (savedTarget && LANGUAGE_MAP[savedTarget]) this.targetLanguage = savedTarget;

    // 2. Cache DOM elements
    this.displayOtpEmail = document.getElementById('displayOtpEmail');
    this.displayLangPairTag = document.getElementById('displayLangPairTag');
    this.otpBoxes = Array.from(document.querySelectorAll<HTMLInputElement>('.otp-box'));
    this.otpErrorNote = document.getElementById('otpErrorNote');
    this.timerCountdownWrap = document.getElementById('timerCountdownWrap');
    this.timerCountdownCount = document.getElementById('timerCountdownCount');
    this.btnResendOtp = document.getElementById('btnResendOtp') as HTMLButtonElement;
    this.btnConfirmOtp = document.getElementById('btnConfirmOtp') as HTMLButtonElement;

    this.registrationSuccessModal = document.getElementById('registrationSuccessModal');
    this.btnGoToHomeAfterReg = document.getElementById('btnGoToHomeAfterReg') as HTMLButtonElement;
    this.loadingOverlay = document.getElementById('slanguageLoadingOverlay');
    this.loadingVideo = document.getElementById('loadingVideoPlayer') as HTMLVideoElement;
    this.toastElement = document.getElementById('otpToast');

    // 3. Ensure loading video is muted and paused on startup
    if (this.loadingVideo) {
      this.loadingVideo.pause();
      this.loadingVideo.muted = true;
      this.loadingVideo.volume = 0;
      this.loadingVideo.currentTime = 0;
    }

    // 4. Update UI labels
    if (this.displayOtpEmail) {
      this.displayOtpEmail.textContent = this.registeredEmail;
    }
    const origin = LANGUAGE_MAP[this.originLanguage];
    const target = LANGUAGE_MAP[this.targetLanguage];
    if (this.displayLangPairTag) {
      this.displayLangPairTag.textContent = `${origin.name} ➔ ${target.title}`;
    }

    this.bindEvents();
    this.startOtpCountdown();
    this.showToast(`📬 Mã xác thực OTP 8 số đã gửi tới ${this.registeredEmail}`);
  }

  private bindEvents(): void {
    // 1. OTP Input handling
    this.otpBoxes.forEach((box, index) => {
      // Input event
      box.addEventListener('input', (e: Event) => {
        const inputEvent = e as InputEvent;
        const value = box.value;

        // Keep only numbers
        const cleanVal = value.replace(/[^0-9]/g, '');
        box.value = cleanVal ? cleanVal.slice(-1) : '';

        if (box.value) {
          box.classList.add('filled');
          if (index < this.otpBoxes.length - 1) {
            this.otpBoxes[index + 1].focus();
            this.otpBoxes[index + 1].select();
          }
        } else {
          box.classList.remove('filled');
        }

        if (this.otpErrorNote) this.otpErrorNote.style.display = 'none';

        // Auto submit if all 8 digits are entered
        if (this.getEnteredOtp().length === 8) {
          this.handleVerifyOtp();
        }
      });

      // Backspace handling
      box.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.key === 'Backspace') {
          if (!box.value && index > 0) {
            this.otpBoxes[index - 1].focus();
            this.otpBoxes[index - 1].value = '';
            this.otpBoxes[index - 1].classList.remove('filled');
          } else {
            box.value = '';
            box.classList.remove('filled');
          }
          if (this.otpErrorNote) this.otpErrorNote.style.display = 'none';
        } else if (e.key === 'ArrowLeft' && index > 0) {
          this.otpBoxes[index - 1].focus();
        } else if (e.key === 'ArrowRight' && index < this.otpBoxes.length - 1) {
          this.otpBoxes[index + 1].focus();
        } else if (e.key === 'Enter') {
          this.handleVerifyOtp();
        }
      });

      // Paste handling
      box.addEventListener('paste', (e: ClipboardEvent) => {
        e.preventDefault();
        const pasted = e.clipboardData?.getData('text') || '';
        const digits = pasted.replace(/[^0-9]/g, '').slice(0, 8);
        if (digits) {
          digits.split('').forEach((d, idx) => {
            if (this.otpBoxes[idx]) {
              this.otpBoxes[idx].value = d;
              this.otpBoxes[idx].classList.add('filled');
            }
          });
          const nextFocus = Math.min(digits.length, 7);
          this.otpBoxes[nextFocus].focus();
          if (digits.length === 8) {
            this.handleVerifyOtp();
          }
        }
      });
    });

    // 3. Resend OTP Button
    if (this.btnResendOtp) {
      this.btnResendOtp.addEventListener('click', () => {
        this.currentOtpCode = '86868686';
        this.clearOtpInputs();
        this.startOtpCountdown();
        this.showToast(`📬 Mã OTP mới đã gửi tới ${this.registeredEmail}`);
      });
    }

    // 4. Confirm OTP Button
    if (this.btnConfirmOtp) {
      this.btnConfirmOtp.addEventListener('click', () => {
        this.handleVerifyOtp();
      });
    }

    // 5. Success Modal: Enter Study Button
    if (this.btnGoToHomeAfterReg) {
      this.btnGoToHomeAfterReg.addEventListener('click', () => {
        this.triggerLoadingAndRedirect('../home/index.html', 1500);
      });
    }

    // 6. Page Visibility Audio Cutoff
    window.addEventListener('pageshow', () => {
      if (this.loadingOverlay) this.loadingOverlay.classList.remove('active');
      if (this.loadingVideo) {
        this.loadingVideo.pause();
        this.loadingVideo.muted = true;
        this.loadingVideo.volume = 0;
        this.loadingVideo.currentTime = 0;
      }
    });

    window.addEventListener('pagehide', () => {
      if (this.loadingVideo) {
        this.loadingVideo.pause();
        this.loadingVideo.muted = true;
        this.loadingVideo.volume = 0;
      }
    });
  }

  private startOtpCountdown(): void {
    if (this.otpTimerInterval) {
      clearInterval(this.otpTimerInterval);
    }
    this.otpSecondsLeft = 60;
    if (this.btnResendOtp) {
      this.btnResendOtp.style.display = 'none';
      this.btnResendOtp.disabled = true;
    }
    if (this.timerCountdownWrap) {
      this.timerCountdownWrap.style.display = 'inline';
    }
    if (this.timerCountdownCount) {
      this.timerCountdownCount.textContent = `${this.otpSecondsLeft}s`;
    }

    this.otpTimerInterval = window.setInterval(() => {
      this.otpSecondsLeft--;
      if (this.timerCountdownCount) {
        this.timerCountdownCount.textContent = `${this.otpSecondsLeft}s`;
      }
      if (this.otpSecondsLeft <= 0) {
        clearInterval(this.otpTimerInterval!);
        this.otpTimerInterval = null;
        if (this.timerCountdownWrap) this.timerCountdownWrap.style.display = 'none';
        if (this.btnResendOtp) {
          this.btnResendOtp.style.display = 'inline';
          this.btnResendOtp.disabled = false;
        }
      }
    }, 1000);
  }

  private getUsersDB(): UserAccount[] {
    const raw = localStorage.getItem('slanguage_users_db');
    if (!raw) {
      localStorage.setItem('slanguage_users_db', JSON.stringify(DEFAULT_USERS_DB));
      return [...DEFAULT_USERS_DB];
    }
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    } catch (e) {
      console.error('Error parsing slanguage_users_db:', e);
    }
    localStorage.setItem('slanguage_users_db', JSON.stringify(DEFAULT_USERS_DB));
    return [...DEFAULT_USERS_DB];
  }

  private saveUsersDB(users: UserAccount[]): void {
    localStorage.setItem('slanguage_users_db', JSON.stringify(users));
  }

  private clearOtpInputs(): void {
    this.otpBoxes.forEach(b => {
      b.value = '';
      b.classList.remove('filled', 'error-shake');
    });
    if (this.otpBoxes.length > 0) this.otpBoxes[0].focus();
    if (this.otpErrorNote) this.otpErrorNote.style.display = 'none';
  }

  private getEnteredOtp(): string {
    return this.otpBoxes.map(b => b.value.trim()).join('');
  }

  private handleVerifyOtp(): void {
    const entered = this.getEnteredOtp();

    if (entered.length < 8) {
      if (this.otpErrorNote) {
        this.otpErrorNote.textContent = 'Vui lòng nhập đủ 8 chữ số mã OTP.';
        this.otpErrorNote.style.display = 'block';
      }
      return;
    }

    if (entered !== this.currentOtpCode) {
      this.otpBoxes.forEach(b => b.classList.add('error-shake'));
      if (this.otpErrorNote) {
        this.otpErrorNote.textContent = 'Mã OTP không chính xác. Vui lòng kiểm tra lại!';
        this.otpErrorNote.style.display = 'block';
      }
      setTimeout(() => {
        this.otpBoxes.forEach(b => b.classList.remove('error-shake'));
      }, 500);
      return;
    }

    // SUCCESS: Save registered user to slanguage_users_db
    const savedPass = sessionStorage.getItem('slanguage_reg_pass') || '123456';
    const users = this.getUsersDB();
    const existingIndex = users.findIndex(u => u.email.trim().toLowerCase() === this.registeredEmail.trim().toLowerCase());
    const newUser: UserAccount = {
      fullName: this.registeredFullName,
      email: this.registeredEmail,
      password: savedPass,
      nativeLanguage: this.originLanguage,
      targetLanguage: this.targetLanguage,
      xp: 0,
      createdAt: new Date().toISOString()
    };
    if (existingIndex >= 0) {
      users[existingIndex] = newUser;
    } else {
      users.push(newUser);
    }
    this.saveUsersDB(users);

    // Save user session to localStorage (No bonus XP or coins for new users)
    localStorage.setItem('slanguage_user_name', this.registeredFullName);
    localStorage.setItem('slanguage_user_email', this.registeredEmail);
    localStorage.setItem('slanguage_user_password', savedPass);
    localStorage.setItem('slanguage_native_language', this.originLanguage);
    localStorage.setItem('slanguage_active_language', this.targetLanguage);
    localStorage.setItem('slanguage_user_xp', '0');
    localStorage.setItem('slanguage_is_logged_in', 'true');

    // Show celebration modal
    this.showSuccessModal();
  }

  private showSuccessModal(): void {
    const mainCard = document.getElementById('otpStageCard');
    if (mainCard) mainCard.style.display = 'none';

    if (this.registrationSuccessModal) {
      this.registrationSuccessModal.style.display = 'flex';

      // Auto redirect after 3.5s if user does not click "Bắt đầu học tập"
      setTimeout(() => {
        this.triggerLoadingAndRedirect('../home/index.html', 1500);
      }, 3500);
    }
  }

  private triggerLoadingAndRedirect(targetUrl: string, duration: number = 1500): void {
    if (this.loadingOverlay) {
      this.loadingOverlay.classList.add('active');
      if (this.loadingVideo) {
        this.loadingVideo.currentTime = 0;
        this.loadingVideo.muted = false;
        this.loadingVideo.volume = 1.0;
        const playPromise = this.loadingVideo.play();
        if (playPromise !== undefined) {
          playPromise.catch(() => {
            if (this.loadingVideo) {
              this.loadingVideo.muted = true;
              this.loadingVideo.play();
            }
          });
        }
      }
    }

    setTimeout(() => {
      if (this.loadingVideo) {
        this.loadingVideo.pause();
        this.loadingVideo.muted = true;
        this.loadingVideo.volume = 0;
        this.loadingVideo.currentTime = 0;
      }
      if (this.loadingOverlay) this.loadingOverlay.classList.remove('active');
      window.location.href = targetUrl;
    }, duration);
  }

  private showToast(message: string): void {
    if (!this.toastElement) return;
    this.toastElement.textContent = message;
    this.toastElement.classList.add('show');

    if (this.toastTimer) window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => {
      if (this.toastElement) this.toastElement.classList.remove('show');
    }, 4000);
  }
}

// Start on DOM ready
function initVerifyOtp(): void {
  (window as unknown as { verifyOtpApp?: VerifyOtpController }).verifyOtpApp = new VerifyOtpController();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initVerifyOtp);
} else {
  initVerifyOtp();
}
