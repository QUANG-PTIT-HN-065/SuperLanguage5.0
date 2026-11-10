/**
 * Slanguage - Learner Registration & Login TypeScript Logic
 * Handles student registration submission, validation, backend auth communication,
 * session storage, and direct redirection to the Learner Dashboard.
 */

interface AuthEnvelope<T> {
  status: string;
  message: string;
  data: T;
  error: unknown;
}

interface StudentAuthData {
  access_token?: string;
  refresh_token?: string;
  user_id?: string;
  email?: string;
  email_confirmation_required?: boolean;
  needs_onboarding?: boolean;
  user?: {
    id: string;
    email: string;
    display_name: string | null;
  };
}

const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000'
).replace(/\/+$/, '');

class SlanguageRegister {
  // Sign Up DOM Elements
  private registerForm: HTMLFormElement | null = null;
  private regFullNameInput: HTMLInputElement | null = null;
  private regEmailInput: HTMLInputElement | null = null;
  private regPasswordInput: HTMLInputElement | null = null;
  private regConfirmPasswordInput: HTMLInputElement | null = null;
  private regTermsCheckbox: HTMLInputElement | null = null;
  private btnSubmitRegister: HTMLButtonElement | null = null;

  // Sign In DOM Elements
  private loginForm: HTMLFormElement | null = null;
  private emailInput: HTMLInputElement | null = null;
  private passwordInput: HTMLInputElement | null = null;
  private rememberCheckbox: HTMLInputElement | null = null;
  private togglePasswordBtn: HTMLButtonElement | null = null;
  private submitBtn: HTMLButtonElement | null = null;

  constructor() {
    this.init();
  }

  private init(): void {
    // Sign Up
    this.registerForm = document.getElementById('registerForm') as HTMLFormElement;
    this.regFullNameInput = document.getElementById('regFullName') as HTMLInputElement;
    this.regEmailInput = document.getElementById('regEmail') as HTMLInputElement;
    this.regPasswordInput = document.getElementById('regPassword') as HTMLInputElement;
    this.regConfirmPasswordInput = document.getElementById('regConfirmPassword') as HTMLInputElement;
    this.regTermsCheckbox = document.getElementById('regTerms') as HTMLInputElement;
    this.btnSubmitRegister = document.getElementById('btnSubmitRegister') as HTMLButtonElement;

    // Sign In
    this.loginForm = document.getElementById('loginForm') as HTMLFormElement;
    this.emailInput = document.getElementById('emailOrUser') as HTMLInputElement;
    this.passwordInput = document.getElementById('password') as HTMLInputElement;
    this.rememberCheckbox = document.getElementById('rememberMe') as HTMLInputElement;
    this.togglePasswordBtn = document.getElementById('togglePassword') as HTMLButtonElement;
    this.submitBtn = document.getElementById('btnSubmitLogin') as HTMLButtonElement;

    this.checkInitialMode();
    this.bindEvents();
    this.bindPageTransitions();
  }

  private checkInitialMode(): void {
    const urlParams = new URLSearchParams(window.location.search);
    const mode = urlParams.get('mode');
    const hash = window.location.hash;

    const radioSignUp = document.getElementById('showSignUp') as HTMLInputElement;
    const radioSignIn = document.getElementById('showSignIn') as HTMLInputElement;

    if (mode === 'signin' || hash === '#signin') {
      if (radioSignIn) radioSignIn.checked = true;
    } else {
      if (radioSignUp) radioSignUp.checked = true;
    }
  }

  private bindEvents(): void {
    // Register Form Submit
    if (this.registerForm) {
      this.registerForm.addEventListener('submit', (e: Event) => {
        e.preventDefault();
        this.handleRegister();
      });
    }

    // Login Form Submit
    if (this.loginForm) {
      this.loginForm.addEventListener('submit', (e: Event) => {
        e.preventDefault();
        this.handleLogin();
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

    // Real-time error clear
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
    if (this.emailInput) {
      this.emailInput.addEventListener('input', () => this.clearError('emailError'));
    }
    if (this.passwordInput) {
      this.passwordInput.addEventListener('input', () => this.clearError('passwordError'));
    }
  }

  private async handleRegister(): Promise<void> {
    let isValid = true;

    const fullName = this.regFullNameInput?.value.trim() || '';
    const email = this.regEmailInput?.value.trim() || '';
    const password = this.regPasswordInput?.value || '';
    const confirmPassword = this.regConfirmPasswordInput?.value || '';
    const terms = this.regTermsCheckbox?.checked || false;

    // Validate Full Name
    if (!fullName) {
      this.showError('nameError', 'Vui lòng nhập họ và tên của học viên.');
      isValid = false;
    }

    // Validate Email
    if (!email) {
      this.showError('regEmailError', 'Vui lòng nhập địa chỉ email.');
      isValid = false;
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      this.showError('regEmailError', 'Địa chỉ email không hợp lệ.');
      isValid = false;
    }

    // Validate Password
    if (!password) {
      this.showError('passError', 'Vui lòng đặt mật khẩu.');
      isValid = false;
    } else if (password.length < 8) {
      this.showError('passError', 'Mật khẩu phải từ 8 ký tự trở lên.');
      isValid = false;
    }

    // Validate Confirm Password
    if (password !== confirmPassword) {
      this.showError('confirmPassError', 'Xác nhận mật khẩu không khớp.');
      isValid = false;
    }

    // Validate Terms
    if (!terms) {
      this.showToast('Vui lòng đồng ý với Điều khoản của Slanguage.', 'info');
      isValid = false;
    }

    if (!isValid) return;

    if (this.btnSubmitRegister) {
      this.btnSubmitRegister.disabled = true;
      this.btnSubmitRegister.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Đang tạo tài khoản...`;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          display_name: fullName,
          native_language: 'vi',
          target_language: 'ja',
          accept_terms: terms,
        }),
      });

      const result = await this.readAuthResponse(response);

      // Save user session in localStorage
      if (result.data.access_token && result.data.refresh_token) {
        localStorage.setItem('slanguage_access_token', result.data.access_token);
        localStorage.setItem('slanguage_refresh_token', result.data.refresh_token);
        localStorage.setItem('slanguage_is_logged_in', 'true');
        localStorage.setItem('slanguage_user_email', email);
        localStorage.setItem('slanguage_user_name', fullName);
        if (result.data.user_id) {
          localStorage.setItem('slanguage_user_id', result.data.user_id);
        }
        localStorage.setItem('slanguage_active_language', 'ja');
        localStorage.setItem('slanguage_daily_goal', '30');
        localStorage.setItem('slanguage_user_xp', '100'); // Welcome bonus

        this.showToast('Đăng ký thành công! Đang chuyển đến Bảng điều khiển...', 'success');
        // Direct redirect to Learner Dashboard
        this.triggerLoadingAndRedirect('../learner/dashboard/index.html', 1200);
        return;
      }

      // If email confirmation is required by backend configuration
      if (result.data.email_confirmation_required) {
        this.showToast(result.message || 'Vui lòng kiểm tra email để xác thực tài khoản.', 'info');
        return;
      }

      // Fallback: If backend returns success without direct tokens
      this.showToast(result.message || 'Đăng ký thành công!', 'success');
      setTimeout(() => {
        const radioSignIn = document.getElementById('showSignIn') as HTMLInputElement;
        if (radioSignIn) radioSignIn.checked = true;
      }, 1500);

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Đăng ký thất bại. Vui lòng thử lại.';
      this.showToast(errorMsg, 'info');

      if (errorMsg.toLowerCase().includes('đã được đăng ký') || errorMsg.toLowerCase().includes('already')) {
        this.showError('regEmailError', 'Email này đã tồn tại trong hệ thống.');
      } else if (errorMsg.toLowerCase().includes('mật khẩu') || errorMsg.toLowerCase().includes('password')) {
        this.showError('passError', errorMsg);
      }
    } finally {
      if (this.btnSubmitRegister) {
        this.btnSubmitRegister.disabled = false;
        this.btnSubmitRegister.innerHTML = `<span>Xác nhận thông tin</span><i class="fa-solid fa-arrow-right"></i>`;
      }
    }
  }

  private async handleLogin(): Promise<void> {
    const emailOrUser = this.emailInput?.value.trim() || '';
    const password = this.passwordInput?.value || '';

    let isValid = true;
    if (!emailOrUser) {
      this.showError('emailError', 'Vui lòng nhập email hoặc tên đăng nhập.');
      isValid = false;
    }
    if (!password) {
      this.showError('passwordError', 'Vui lòng nhập mật khẩu.');
      isValid = false;
    }

    if (!isValid) return;

    if (this.submitBtn) {
      this.submitBtn.disabled = true;
      this.submitBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Đang đăng nhập...`;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: emailOrUser,
          password: password,
        }),
      });

      const result = await this.readAuthResponse(response);
      const auth = result.data;
      if (!auth.access_token || !auth.refresh_token) {
        throw new Error('Backend không trả về thông tin phiên đăng nhập.');
      }

      localStorage.setItem('slanguage_access_token', auth.access_token);
      localStorage.setItem('slanguage_refresh_token', auth.refresh_token);
      localStorage.setItem('slanguage_is_logged_in', 'true');
      localStorage.setItem('slanguage_user_email', auth.user?.email || emailOrUser);
      if (auth.user?.id) localStorage.setItem('slanguage_user_id', auth.user.id);
      if (auth.user?.display_name) {
        localStorage.setItem('slanguage_user_name', auth.user.display_name);
      }
      if (!localStorage.getItem('slanguage_active_language')) {
        localStorage.setItem('slanguage_active_language', 'ja');
      }
      if (!localStorage.getItem('slanguage_daily_goal')) {
        localStorage.setItem('slanguage_daily_goal', '30');
      }
      if (!localStorage.getItem('slanguage_user_xp')) {
        localStorage.setItem('slanguage_user_xp', '100');
      }

      this.showToast('Đăng nhập thành công!', 'success');
      this.triggerLoadingAndRedirect('../learner/dashboard/index.html', 1200);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Đăng nhập thất bại. Vui lòng thử lại.';
      this.showToast(msg, 'info');
      this.showError('passwordError', msg);
    } finally {
      if (this.submitBtn) {
        this.submitBtn.disabled = false;
        this.submitBtn.innerHTML = `<span>Đăng nhập</span><i class="fa-solid fa-arrow-right"></i>`;
      }
    }
  }

  private async readAuthResponse(
    response: Response
  ): Promise<AuthEnvelope<StudentAuthData>> {
    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const detail =
        typeof payload === 'object' &&
        payload !== null &&
        'detail' in payload &&
        typeof payload.detail === 'string'
          ? payload.detail
          : `Backend trả về lỗi HTTP ${response.status}.`;
      throw new Error(detail);
    }

    if (
      typeof payload !== 'object' ||
      payload === null ||
      !('data' in payload) ||
      typeof payload.data !== 'object' ||
      payload.data === null
    ) {
      throw new Error('Backend trả về dữ liệu không đúng định dạng.');
    }
    return payload as AuthEnvelope<StudentAuthData>;
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

    const icon = document.createElement('i');
    icon.className = type === 'success' ? 'fa-solid fa-circle-check' : 'fa-solid fa-circle-info';
    icon.style.color = type === 'success' ? '#FFB703' : '#00B4D8';
    icon.style.fontSize = '1.2rem';
    toast.replaceChildren(icon, document.createTextNode(` ${message}`));

    toast.style.display = 'flex';

    setTimeout(() => {
      toast.style.display = 'none';
    }, 3500);
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

  private triggerLoadingAndRedirect(targetUrl: string, duration: number = 1200): void {
    const overlay = document.getElementById('slanguageLoadingOverlay');
    if (overlay) {
      overlay.classList.add('active');
    }
    setTimeout(() => {
      if (overlay) {
        overlay.classList.remove('active');
      }
      window.location.href = targetUrl;
    }, duration);
  }
}

// Start on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  new SlanguageRegister();
});
