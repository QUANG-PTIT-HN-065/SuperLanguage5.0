/**
 * ===================================================================
 * SLANGUAGE - REGISTER CONTROLLER
 * Module: login/login.ts
 * Purpose: Authentication portal (Sign In & Sign Up)
 * Post-Registration Flow: Redirects to dedicated ../select-language/index.html
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

interface LoginCredentials {
  emailOrUser: string;
  password: string;
  remember: boolean;
}

class SlanguageRegister {
  // DOM Elements - Forms & Inputs
  private container: HTMLElement | null = null;
  private loginForm: HTMLFormElement | null = null;
  private registerForm: HTMLFormElement | null = null;
  private emailInput: HTMLInputElement | null = null;
  private passwordInput: HTMLInputElement | null = null;
  private rememberCheckbox: HTMLInputElement | null = null;
  private togglePasswordBtn: HTMLButtonElement | null = null;
  private btnSubmitLogin: HTMLButtonElement | null = null;

  // Sign Up Form Elements
  private regFullNameInput: HTMLInputElement | null = null;
  private regEmailInput: HTMLInputElement | null = null;
  private regPasswordInput: HTMLInputElement | null = null;
  private regConfirmPasswordInput: HTMLInputElement | null = null;
  private regTermsCheckbox: HTMLInputElement | null = null;
  private btnSubmitRegister: HTMLButtonElement | null = null;

  // Feedback & Loading Elements
  private loginToast: HTMLElement | null = null;
  private toastTimer: number | null = null;
  private loadingOverlay: HTMLElement | null = null;
  private loadingVideo: HTMLVideoElement | null = null;

  constructor() {
    this.init();
  }

  private init(): void {
    // Container & Forms
    this.container = document.getElementById('container');
    this.loginForm = document.getElementById('loginForm') as HTMLFormElement;
    this.registerForm = document.getElementById('registerForm') as HTMLFormElement;

    // Sign In Elements
    this.emailInput = document.getElementById('emailOrUser') as HTMLInputElement;
    this.passwordInput = document.getElementById('password') as HTMLInputElement;
    this.rememberCheckbox = document.getElementById('rememberMe') as HTMLInputElement;
    this.togglePasswordBtn = document.getElementById('togglePassword') as HTMLButtonElement;
    this.btnSubmitLogin = document.getElementById('btnSubmitLogin') as HTMLButtonElement;

    // Sign Up Elements
    this.regFullNameInput = document.getElementById('regFullName') as HTMLInputElement;
    this.regEmailInput = document.getElementById('regEmail') as HTMLInputElement;
    this.regPasswordInput = document.getElementById('regPassword') as HTMLInputElement;
    this.regConfirmPasswordInput = document.getElementById('regConfirmPassword') as HTMLInputElement;
    this.regTermsCheckbox = document.getElementById('regTerms') as HTMLInputElement;
    this.btnSubmitRegister = document.getElementById('btnSubmitRegister') as HTMLButtonElement;

    // Overlay & Video
    this.loadingOverlay = document.getElementById('slanguageLoadingOverlay');
    this.loadingVideo = document.getElementById('loadingVideoPlayer') as HTMLVideoElement;
    if (this.loadingVideo) {
      this.loadingVideo.pause();
      this.loadingVideo.muted = true;
      this.loadingVideo.volume = 0;
      this.loadingVideo.currentTime = 0;
    }
    this.loginToast = document.getElementById('loginToast');

    this.checkInitialMode();
    this.checkExistingSession();
    this.bindEvents();
  }

  private checkInitialMode(): void {
    const urlParams = new URLSearchParams(window.location.search);
    const radioSignUp = document.getElementById('showSignUp') as HTMLInputElement;
    if (radioSignUp) radioSignUp.checked = true;
    const mode = urlParams.get('mode') || window.location.hash.replace('#', '');
    if (mode === 'signup' || mode === 'register') {
      const radioSignUp = document.getElementById('showSignUp') as HTMLInputElement;
      if (radioSignUp) radioSignUp.checked = true;
    }
  }

  private bindEvents(): void {
    // 1. Sign In Form Submit
    if (this.loginForm) {
      this.loginForm.addEventListener('submit', (e: Event) => {
        e.preventDefault();
        this.handleLogin();
      });
    }

    // 2. Sign Up Form Submit -> Validates & Redirects to dedicated select-language page
    if (this.registerForm) {
      this.registerForm.addEventListener('submit', (e: Event) => {
        e.preventDefault();
        this.handleRegister();
      });
    }

    // 3. Toggle Password Visibility
    if (this.togglePasswordBtn && this.passwordInput) {
      this.togglePasswordBtn.addEventListener('click', () => {
        const isPassword = this.passwordInput!.type === 'password';
        this.passwordInput!.type = isPassword ? 'text' : 'password';
        const icon = this.togglePasswordBtn!.querySelector('i');
        if (icon) {
          icon.className = isPassword ? 'fa-solid fa-eye-slash' : 'fa-solid fa-eye';
        }
      });
    }

    // 4. Input Error Clearing
    if (this.emailInput) {
      this.emailInput.addEventListener('input', () => this.clearError('emailError'));
    }
    if (this.passwordInput) {
      this.passwordInput.addEventListener('input', () => this.clearError('passwordError'));
    }
    if (this.regFullNameInput) {
      this.regFullNameInput.addEventListener('input', () => this.clearError('nameError'));
    }
    if (this.regEmailInput) {
      this.regEmailInput.addEventListener('input', () => this.clearError('regEmailError'));
    }
    if (this.regPasswordInput) {
      this.regPasswordInput.addEventListener('input', () => this.clearError('passError'));
    }
    if (this.regConfirmPasswordInput) {
      this.regConfirmPasswordInput.addEventListener('input', () => this.clearError('confirmPassError'));
    }

    // 5. Audio & Page Visibility Handling
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

  private checkExistingSession(): void {
    const savedUser = localStorage.getItem('slanguage_user_email');
    if (savedUser && this.emailInput && this.rememberCheckbox) {
      this.emailInput.value = savedUser;
      this.rememberCheckbox.checked = true;
    }

    if (window.location.hash === '#register' || window.location.hash === '#signup' || window.location.search.includes('mode=register')) {
      const radioSignUp = document.getElementById('showSignUp') as HTMLInputElement | null;
      if (radioSignUp) {
        radioSignUp.checked = true;
      }
    }
  }

  private validateLogin(): LoginCredentials | null {
    let isValid = true;
    const emailVal = this.emailInput ? this.emailInput.value.trim() : '';
    const passVal = this.passwordInput ? this.passwordInput.value : '';
    const rememberVal = this.rememberCheckbox ? this.rememberCheckbox.checked : false;

    if (!emailVal) {
      this.showError('emailError', 'Vui lòng nhập email hoặc tên đăng nhập của học viên.');
      isValid = false;
    } else if (emailVal.includes('@') && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailVal)) {
      this.showError('emailError', 'Địa chỉ email không đúng định dạng.');
      isValid = false;
    }

    if (!passVal) {
      this.showError('passwordError', 'Vui lòng nhập mật khẩu.');
      isValid = false;
    } else if (passVal.length < 6) {
      this.showError('passwordError', 'Mật khẩu phải chứa ít nhất 6 ký tự.');
      isValid = false;
    }

    if (!isValid) return null;

    return {
      emailOrUser: emailVal,
      password: passVal,
      remember: rememberVal
    };
  }

  private handleLogin(): void {
    const credentials = this.validateLogin();
    if (!credentials) return;

    const users = this.getUsersDB();
    const user = users.find(u => 
      u.email.trim().toLowerCase() === credentials.emailOrUser.trim().toLowerCase() ||
      u.fullName.trim().toLowerCase() === credentials.emailOrUser.trim().toLowerCase()
    );

    // 1. Validate if user exists in DB
    if (!user) {
      this.showError('emailError', 'Tài khoản hoặc email này chưa được đăng ký trong hệ thống.');
      if (this.emailInput) {
        this.emailInput.focus();
        this.emailInput.classList.add('error');
      }
      return;
    }

    // 2. Validate password
    if (user.password !== credentials.password) {
      this.showError('passwordError', 'Mật khẩu không chính xác. Vui lòng kiểm tra lại!');
      if (this.passwordInput) {
        this.passwordInput.focus();
        this.passwordInput.classList.add('error');
      }
      return;
    }

    if (this.btnSubmitLogin) {
      this.btnSubmitLogin.disabled = true;
      this.btnSubmitLogin.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang đăng nhập...';
    }

    if (credentials.remember) {
      localStorage.setItem('slanguage_remembered_email', user.email);
      localStorage.setItem('slanguage_user_email', user.email);
    } else {
      localStorage.removeItem('slanguage_remembered_email');
    }

    // Fully synchronize user profile to localStorage
    localStorage.setItem('slanguage_is_logged_in', 'true');
    localStorage.setItem('slanguage_user_name', user.fullName);
    localStorage.setItem('slanguage_user_email', user.email);
    localStorage.setItem('slanguage_user_password', user.password);
    localStorage.setItem('slanguage_native_language', user.nativeLanguage || 'vi');
    localStorage.setItem('slanguage_active_language', user.targetLanguage || 'ja');
    localStorage.setItem('slanguage_user_xp', (user.xp !== undefined ? user.xp : 0).toString());

    this.showToast(`Chào mừng ${user.fullName} trở lại! Đang chuyển hướng...`);
    this.triggerLoadingAndRedirect('../home/index.html', 1200);
  }

  private handleRegister(): void {
    let isValid = true;

    const fullName = this.regFullNameInput?.value.trim() || '';
    const email = this.regEmailInput?.value.trim() || '';
    const password = this.regPasswordInput?.value || '';
    const confirmPassword = this.regConfirmPasswordInput?.value || '';
    const terms = this.regTermsCheckbox?.checked || false;

    if (!fullName) {
      this.showError('nameError', 'Vui lòng nhập họ và tên của học viên.');
      isValid = false;
    }

    if (!email) {
      this.showError('regEmailError', 'Vui lòng nhập địa chỉ email.');
      isValid = false;
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      this.showError('regEmailError', 'Địa chỉ email không hợp lệ.');
      isValid = false;
    } else {
      // VALIDATE IF EMAIL ALREADY EXISTS IN DATABASE
      const users = this.getUsersDB();
      const isTaken = users.some(u => u.email.trim().toLowerCase() === email.toLowerCase());
      if (isTaken) {
        this.showError('regEmailError', `Email "${email}" đã tồn tại trong hệ thống. Vui lòng đăng nhập hoặc dùng email khác!`);
        isValid = false;
      }
    }

    if (!password) {
      this.showError('passError', 'Vui lòng đặt mật khẩu.');
      isValid = false;
    } else if (password.length < 6) {
      this.showError('passError', 'Mật khẩu phải từ 6 ký tự trở lên.');
      isValid = false;
    }

    if (password !== confirmPassword) {
      this.showError('confirmPassError', 'Xác nhận mật khẩu không khớp.');
      isValid = false;
    }

    if (!terms) {
      alert('Vui lòng đồng ý với Điều khoản của Slanguage.');
      isValid = false;
    }

    if (!isValid) return;

    // Save temporary registration draft to sessionStorage
    sessionStorage.setItem('slanguage_reg_name', fullName);
    sessionStorage.setItem('slanguage_reg_email', email);
    sessionStorage.setItem('slanguage_reg_pass', password);

    // Also persist email to localStorage so verify-otp can always read it
    localStorage.setItem('slanguage_user_name', fullName);
    localStorage.setItem('slanguage_user_email', email);

    // NAVIGATE TO DEDICATED STAGE 2: LANGUAGE SELECTION PAGE
    window.location.href = '../select-language/index.html';
  }

  private showError(elementId: string, message: string): void {
    const errorEl = document.getElementById(elementId);
    if (errorEl) {
      errorEl.textContent = message;
      errorEl.style.display = 'block';
      const input = errorEl.previousElementSibling?.querySelector('input');
      if (input) input.classList.add('error');
    }
  }

  private clearError(elementId: string): void {
    const errorEl = document.getElementById(elementId);
    if (errorEl) {
      errorEl.style.display = 'none';
      const input = errorEl.previousElementSibling?.querySelector('input');
      if (input) input.classList.remove('error');
    }
  }

  private showToast(message: string): void {
    if (!this.loginToast) return;
    this.loginToast.textContent = message;
    this.loginToast.classList.add('show');

    if (this.toastTimer) window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => {
      if (this.loginToast) this.loginToast.classList.remove('show');
    }, 3500);
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
}

// Start on DOM ready
function initSlanguageRegister(): void {
  (window as unknown as { registerApp?: SlanguageRegister }).registerApp = new SlanguageRegister();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initSlanguageRegister);
} else {
  initSlanguageRegister();
}
