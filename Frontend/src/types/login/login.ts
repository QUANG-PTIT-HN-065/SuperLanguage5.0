/**
 * Slanguage - Learner Login & Registration Slider TypeScript Logic
 * Handles credential validation, password reveal/hide, registration submission,
 * dual-panel slider synchronization, and redirection to Home dashboard.
 */

interface LoginCredentials {
  emailOrUser: string;
  password: string;
  rememberMe: boolean;
}

class SlanguageLogin {
  private loginForm: HTMLFormElement | null = null;
  private registerForm: HTMLFormElement | null = null;

  // Sign In inputs
  private emailInput: HTMLInputElement | null = null;
  private passwordInput: HTMLInputElement | null = null;
  private rememberCheckbox: HTMLInputElement | null = null;
  private togglePasswordBtn: HTMLButtonElement | null = null;
  private submitBtn: HTMLButtonElement | null = null;

  // Sign Up inputs
  private regFullNameInput: HTMLInputElement | null = null;
  private regEmailInput: HTMLInputElement | null = null;
  private regPasswordInput: HTMLInputElement | null = null;
  private regConfirmPasswordInput: HTMLInputElement | null = null;
  private regTermsCheckbox: HTMLInputElement | null = null;
  private btnSubmitRegister: HTMLButtonElement | null = null;

  constructor() {
    this.init();
  }

  private init(): void {
    // Sign In DOM Elements
    this.loginForm = document.getElementById('loginForm') as HTMLFormElement;
    this.emailInput = document.getElementById('emailOrUser') as HTMLInputElement;
    this.passwordInput = document.getElementById('password') as HTMLInputElement;
    this.rememberCheckbox = document.getElementById('rememberMe') as HTMLInputElement;
    this.togglePasswordBtn = document.getElementById('togglePassword') as HTMLButtonElement;
    this.submitBtn = document.getElementById('btnSubmitLogin') as HTMLButtonElement;

    // Sign Up DOM Elements
    this.registerForm = document.getElementById('registerForm') as HTMLFormElement;
    this.regFullNameInput = document.getElementById('regFullName') as HTMLInputElement;
    this.regEmailInput = document.getElementById('regEmail') as HTMLInputElement;
    this.regPasswordInput = document.getElementById('regPassword') as HTMLInputElement;
    this.regConfirmPasswordInput = document.getElementById('regConfirmPassword') as HTMLInputElement;
    this.regTermsCheckbox = document.getElementById('regTerms') as HTMLInputElement;
    this.btnSubmitRegister = document.getElementById('btnSubmitRegister') as HTMLButtonElement;

    this.checkInitialMode();
    this.checkExistingSession();
    this.bindEvents();
  }

  private checkInitialMode(): void {
    const urlParams = new URLSearchParams(window.location.search);
    const mode = urlParams.get('mode');
    const hash = window.location.hash;

    if (mode === 'signup' || hash === '#signup') {
      const radioSignUp = document.getElementById('showSignUp') as HTMLInputElement;
      if (radioSignUp) radioSignUp.checked = true;
    }
  }

  private bindEvents(): void {
    // Sign In Form submit
    if (this.loginForm) {
      this.loginForm.addEventListener('submit', (e: Event) => {
        e.preventDefault();
        this.handleLogin();
      });
    }

    // Sign Up Form submit
    if (this.registerForm) {
      this.registerForm.addEventListener('submit', (e: Event) => {
        e.preventDefault();
        this.handleRegister();
      });
    }

    // Toggle Password Visibility
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

    // Real-time input clearing errors for Sign In
    if (this.emailInput) {
      this.emailInput.addEventListener('input', () => this.clearError('emailError'));
    }
    if (this.passwordInput) {
      this.passwordInput.addEventListener('input', () => this.clearError('passwordError'));
    }

    // Real-time input clearing errors for Sign Up
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

    // Forgot password trigger
    const forgotLink = document.getElementById('forgotPasswordLink');
    if (forgotLink) {
      forgotLink.addEventListener('click', (e) => {
        e.preventDefault();
        this.triggerLoadingAndRedirect('../forgot-password/index.html', 1500);
      });
    }

    // Intercept navigation links
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

  private checkExistingSession(): void {
    const savedUser = localStorage.getItem('slanguage_user_email');
    if (savedUser && this.emailInput && this.rememberCheckbox) {
      this.emailInput.value = savedUser;
      this.rememberCheckbox.checked = true;
    }
  }

  private validateLogin(): LoginCredentials | null {
    let isValid = true;
    const emailVal = this.emailInput ? this.emailInput.value.trim() : '';
    const passVal = this.passwordInput ? this.passwordInput.value : '';
    const rememberVal = this.rememberCheckbox ? this.rememberCheckbox.checked : false;

    // Validate Email/Username
    if (!emailVal) {
      this.showError('emailError', 'Vui lòng nhập email hoặc tên đăng nhập của học viên.');
      isValid = false;
    } else if (emailVal.includes('@') && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailVal)) {
      this.showError('emailError', 'Địa chỉ email không đúng định dạng.');
      isValid = false;
    }

    // Validate Password
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
      rememberMe: rememberVal
    };
  }

  private handleLogin(): void {
    const creds = this.validateLogin();
    if (!creds) return;

    // Show loading indicator
    if (this.submitBtn) {
      this.submitBtn.disabled = true;
      this.submitBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Đang xác thực...`;
    }

    setTimeout(() => {
      // Simulate Successful Login
      localStorage.setItem('slanguage_is_logged_in', 'true');
      localStorage.setItem('slanguage_user_email', creds.emailOrUser);
      
      // If student name not set yet, set default
      if (!localStorage.getItem('slanguage_user_name')) {
        localStorage.setItem('slanguage_user_name', 'Nguyễn Nhật Anh');
      }

      // Show video loading screen for 1.5s
      this.triggerLoadingAndRedirect('../home/index.html', 1500);
    }, 400);
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

    if (this.btnSubmitRegister) {
      this.btnSubmitRegister.disabled = true;
      this.btnSubmitRegister.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Đang tạo tài khoản...`;
    }

    setTimeout(() => {
      localStorage.setItem('slanguage_user_name', fullName);
      localStorage.setItem('slanguage_user_email', email);
      if (!localStorage.getItem('slanguage_active_language')) {
        localStorage.setItem('slanguage_active_language', 'ja');
      }
      localStorage.setItem('slanguage_user_xp', '100');
      localStorage.setItem('slanguage_is_logged_in', 'true');

      this.triggerLoadingAndRedirect('../home/index.html', 1500);
    }, 400);
  }

  private showError(elementId: string, message: string): void {
    const errEl = document.getElementById(elementId);
    if (errEl) {
      errEl.textContent = message;
      errEl.style.display = 'flex';
    }
  }

  private clearError(elementId: string): void {
    const errEl = document.getElementById(elementId);
    if (errEl) {
      errEl.style.display = 'none';
    }
  }

  private showToast(message: string, type: 'success' | 'info' = 'success'): void {
    const toast = document.getElementById('loginToast');
    if (!toast) return;

    toast.innerHTML = type === 'success' 
      ? `<i class="fa-solid fa-circle-check" style="color: #FFB703; font-size: 1.2rem;"></i> ${message}`
      : `<i class="fa-solid fa-circle-info" style="color: #00B4D8; font-size: 1.2rem;"></i> ${message}`;

    toast.style.display = 'flex';

    setTimeout(() => {
      toast.style.display = 'none';
    }, 3500);
  }
}

// Initialize on DOM load
document.addEventListener('DOMContentLoaded', () => {
  new SlanguageLogin();
});
