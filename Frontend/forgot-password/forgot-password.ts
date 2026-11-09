/**
 * Slanguage - Forgot Password & 6-Digit OTP Verification Logic
 * Step-by-step password recovery:
 * 1. Validate registered student email.
 * 2. Generate simulated web OTP & render 6-digit individual interactive inputs.
 * 3. Verify OTP & allow setting new password with seamless transition.
 */

class SlanguageForgotPassword {
  private currentStage: number = 1;
  private registeredEmail: string = '';
  private currentOtpCode: string = '';
  private countdownTimer: number | null = null;
  private countdownRemaining: number = 60;

  // DOM Elements
  private stageEmail: HTMLElement | null = null;
  private stageOtp: HTMLElement | null = null;
  private stageNewPass: HTMLElement | null = null;

  private stepper1: HTMLElement | null = null;
  private stepper2: HTMLElement | null = null;
  private stepper3: HTMLElement | null = null;
  private line1: HTMLElement | null = null;
  private line2: HTMLElement | null = null;

  private recoveryEmailInput: HTMLInputElement | null = null;
  private otpDigits: HTMLInputElement[] = [];
  private newPasswordInput: HTMLInputElement | null = null;
  private confirmNewPasswordInput: HTMLInputElement | null = null;

  private webOtpToast: HTMLElement | null = null;
  private toastOtpNumber: HTMLElement | null = null;
  private countdownVal: HTMLElement | null = null;
  private countdownWrap: HTMLElement | null = null;
  private btnResendOtp: HTMLElement | null = null;

  constructor() {
    this.init();
  }

  private init(): void {
    this.stageEmail = document.getElementById('stageEmail');
    this.stageOtp = document.getElementById('stageOtp');
    this.stageNewPass = document.getElementById('stageNewPass');

    this.stepper1 = document.getElementById('stepper1');
    this.stepper2 = document.getElementById('stepper2');
    this.stepper3 = document.getElementById('stepper3');
    this.line1 = document.getElementById('line1');
    this.line2 = document.getElementById('line2');

    this.recoveryEmailInput = document.getElementById('recoveryEmail') as HTMLInputElement;
    this.newPasswordInput = document.getElementById('newPassword') as HTMLInputElement;
    this.confirmNewPasswordInput = document.getElementById('confirmNewPassword') as HTMLInputElement;

    this.webOtpToast = document.getElementById('webOtpToast');
    this.toastOtpNumber = document.getElementById('toastOtpNumber');
    this.countdownVal = document.getElementById('countdownVal');
    this.countdownWrap = document.getElementById('countdownWrap');
    this.btnResendOtp = document.getElementById('btnResendOtp');

    this.otpDigits = Array.from(document.querySelectorAll<HTMLInputElement>('.otp-digit'));

    // Pre-fill email if stored in localStorage
    const savedUserEmail = localStorage.getItem('slanguage_user_email');
    if (savedUserEmail && this.recoveryEmailInput) {
      this.recoveryEmailInput.value = savedUserEmail;
    }

    this.bindEvents();
  }

  private bindEvents(): void {
    // Stage 1: Request OTP Form
    const formRequestOtp = document.getElementById('formRequestOtp');
    if (formRequestOtp) {
      formRequestOtp.addEventListener('submit', (e) => {
        e.preventDefault();
        this.handleEmailSubmit();
      });
    }

    if (this.recoveryEmailInput) {
      this.recoveryEmailInput.addEventListener('input', () => this.clearError('emailError'));
    }

    // Stage 2: 6-digit OTP Inputs behavior
    this.bindOtpInputGrid();

    // Stage 2: Back to Email button
    const btnBackToEmail = document.getElementById('btnBackToEmail');
    if (btnBackToEmail) {
      btnBackToEmail.addEventListener('click', () => {
        this.goToStage(1);
      });
    }

    // Stage 2: Verify OTP button
    const btnVerifyOtp = document.getElementById('btnVerifyOtp');
    if (btnVerifyOtp) {
      btnVerifyOtp.addEventListener('click', () => {
        this.handleVerifyOtp();
      });
    }

    // Stage 2: Resend OTP button
    if (this.btnResendOtp) {
      this.btnResendOtp.addEventListener('click', () => {
        this.generateAndSendOtp(true);
      });
    }

    // Quick fill button in toast
    const btnQuickFillOtp = document.getElementById('btnQuickFillOtp');
    if (btnQuickFillOtp) {
      btnQuickFillOtp.addEventListener('click', () => {
        this.quickFillOtp();
      });
    }

    // Close toast button
    const btnCloseToast = document.getElementById('btnCloseToast');
    if (btnCloseToast && this.webOtpToast) {
      btnCloseToast.addEventListener('click', () => {
        this.webOtpToast!.classList.remove('show');
      });
    }

    // Stage 3: Reset password form
    const formResetPassword = document.getElementById('formResetPassword');
    if (formResetPassword) {
      formResetPassword.addEventListener('submit', (e) => {
        e.preventDefault();
        this.handleResetPassword();
      });
    }

    if (this.newPasswordInput) {
      this.newPasswordInput.addEventListener('input', () => this.clearError('newPassError'));
    }
    if (this.confirmNewPasswordInput) {
      this.confirmNewPasswordInput.addEventListener('input', () => this.clearError('confirmNewPassError'));
    }

    // Page navigation links with transition
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

  private bindOtpInputGrid(): void {
    this.otpDigits.forEach((input, index) => {
      // Input event: auto advance to next box
      input.addEventListener('input', (e: Event) => {
        const target = e.target as HTMLInputElement;
        const value = target.value.replace(/\D/g, '');
        target.value = value.slice(-1); // Only keep single digit

        if (target.value) {
          target.classList.add('filled');
          this.clearError('otpError');
          // Focus next input if available
          if (index < this.otpDigits.length - 1) {
            this.otpDigits[index + 1].focus();
          }
        } else {
          target.classList.remove('filled');
        }

        // Auto verify if all 6 boxes are filled
        const fullOtp = this.getEnteredOtp();
        if (fullOtp.length === 6) {
          this.handleVerifyOtp();
        }
      });

      // Keydown: backspace navigation
      input.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.key === 'Backspace' || e.key === 'Delete') {
          if (!input.value && index > 0) {
            this.otpDigits[index - 1].focus();
            this.otpDigits[index - 1].value = '';
            this.otpDigits[index - 1].classList.remove('filled');
          }
        } else if (e.key === 'ArrowLeft' && index > 0) {
          this.otpDigits[index - 1].focus();
        } else if (e.key === 'ArrowRight' && index < this.otpDigits.length - 1) {
          this.otpDigits[index + 1].focus();
        }
      });

      // Paste event: handle full 6-digit paste
      input.addEventListener('paste', (e: ClipboardEvent) => {
        e.preventDefault();
        const pastedData = (e.clipboardData || (window as any).clipboardData)?.getData('text') || '';
        const digits = pastedData.replace(/\D/g, '').slice(0, 6);
        if (digits) {
          for (let i = 0; i < digits.length && i < this.otpDigits.length; i++) {
            this.otpDigits[i].value = digits[i];
            this.otpDigits[i].classList.add('filled');
          }
          const focusIndex = Math.min(digits.length, this.otpDigits.length - 1);
          this.otpDigits[focusIndex].focus();
          this.clearError('otpError');

          if (digits.length === 6) {
            this.handleVerifyOtp();
          }
        }
      });
    });
  }

  private handleEmailSubmit(): void {
    const emailVal = this.recoveryEmailInput ? this.recoveryEmailInput.value.trim() : '';

    if (!emailVal) {
      this.showError('emailError', 'Vui lòng nhập địa chỉ email học viên.');
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailVal)) {
      this.showError('emailError', 'Địa chỉ email không đúng định dạng.');
      return;
    }

    this.registeredEmail = emailVal;
    const sentEmailEl = document.getElementById('sentTargetEmail');
    if (sentEmailEl) {
      sentEmailEl.textContent = emailVal;
    }

    // Generate and display simulated 6-digit OTP
    this.generateAndSendOtp(false);

    // Advance to Stage 2
    this.goToStage(2);
  }

  private generateAndSendOtp(isResend: boolean = false): void {
    // Generate a 6-digit simulation code
    this.currentOtpCode = Math.floor(100000 + Math.random() * 900000).toString();

    // Clear previous input digits
    this.otpDigits.forEach(input => {
      input.value = '';
      input.classList.remove('filled');
      input.style.borderColor = '';
    });
    this.clearError('otpError');

    // Display Toast banner: "Hãy kiểm tra email của bạn"
    if (this.webOtpToast) {
      this.webOtpToast.classList.add('show');
    }

    // Start 60s countdown
    this.startResendCountdown();

    // Auto-focus first box
    setTimeout(() => {
      if (this.otpDigits[0]) this.otpDigits[0].focus();
    }, 300);
  }

  private quickFillOtp(): void {
    const demoCode = this.currentOtpCode || '123456';
    for (let i = 0; i < 6; i++) {
      if (this.otpDigits[i]) {
        this.otpDigits[i].value = demoCode[i];
        this.otpDigits[i].classList.add('filled');
      }
    }
    this.clearError('otpError');
    if (this.webOtpToast) {
      this.webOtpToast.classList.remove('show');
    }
    this.handleVerifyOtp();
  }

  private getEnteredOtp(): string {
    return this.otpDigits.map(i => i.value).join('');
  }

  private handleVerifyOtp(): void {
    const entered = this.getEnteredOtp();

    if (entered.length < 6) {
      this.showError('otpError', 'Vui lòng điền đủ 6 chữ số mã OTP.');
      return;
    }

    // In web demo prototype, since OTP is simulated to user email,
    // any 6 digits entered (e.g. 123456 or generated code) will verify successfully
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
    }
    if (this.webOtpToast) {
      this.webOtpToast.classList.remove('show');
    }

    // OTP Verified! Advance to Stage 3
    this.goToStage(3);
  }

  private handleResetPassword(): void {
    const newPass = this.newPasswordInput ? this.newPasswordInput.value : '';
    const confirmPass = this.confirmNewPasswordInput ? this.confirmNewPasswordInput.value : '';

    let isValid = true;
    if (!newPass || newPass.length < 6) {
      this.showError('newPassError', 'Mật khẩu mới phải từ 6 ký tự trở lên.');
      isValid = false;
    }

    if (newPass !== confirmPass) {
      this.showError('confirmNewPassError', 'Mật khẩu xác nhận không khớp.');
      isValid = false;
    }

    if (!isValid) return;

    // Persist new password for student
    localStorage.setItem('slanguage_user_password', newPass);

    // Show loading transition back to login
    this.triggerLoadingAndRedirect('../login/index.html', 1500);
  }

  private startResendCountdown(): void {
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
    }

    this.countdownRemaining = 60;
    if (this.countdownVal) this.countdownVal.textContent = '60';
    if (this.countdownWrap) this.countdownWrap.style.display = 'inline';
    if (this.btnResendOtp) this.btnResendOtp.style.display = 'none';

    this.countdownTimer = window.setInterval(() => {
      this.countdownRemaining--;
      if (this.countdownVal) {
        this.countdownVal.textContent = this.countdownRemaining.toString();
      }

      if (this.countdownRemaining <= 0) {
        clearInterval(this.countdownTimer!);
        if (this.countdownWrap) this.countdownWrap.style.display = 'none';
        if (this.btnResendOtp) this.btnResendOtp.style.display = 'inline-block';
      }
    }, 1000);
  }

  private goToStage(stage: number): void {
    this.currentStage = stage;

    // Panels
    this.stageEmail?.classList.remove('active');
    this.stageOtp?.classList.remove('active');
    this.stageNewPass?.classList.remove('active');

    // Steppers
    this.stepper1?.classList.remove('active', 'done');
    this.stepper2?.classList.remove('active', 'done');
    this.stepper3?.classList.remove('active', 'done');
    this.line1?.classList.remove('active');
    this.line2?.classList.remove('active');

    const headerSub = document.getElementById('headerSubtitle');

    if (stage === 1) {
      this.stageEmail?.classList.add('active');
      this.stepper1?.classList.add('active');
      if (headerSub) headerSub.textContent = 'Nhập email đã đăng ký tài khoản của bạn để nhận mã xác thực OTP 6 số.';
    } else if (stage === 2) {
      this.stageOtp?.classList.add('active');
      this.stepper1?.classList.add('done');
      this.stepper2?.classList.add('active');
      this.line1?.classList.add('active');
      if (headerSub) headerSub.textContent = 'Nhập 6 chữ số mã xác thực OTP được cung cấp để xác minh danh tính.';
      setTimeout(() => {
        if (this.otpDigits[0]) this.otpDigits[0].focus();
      }, 200);
    } else if (stage === 3) {
      this.stageNewPass?.classList.add('active');
      this.stepper1?.classList.add('done');
      this.stepper2?.classList.add('done');
      this.stepper3?.classList.add('active');
      this.line1?.classList.add('active');
      this.line2?.classList.add('active');
      if (headerSub) headerSub.textContent = 'Tạo mật khẩu mới bảo mật để tiếp tục quá trình học tập.';
    }
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

  private showError(id: string, msg: string): void {
    const el = document.getElementById(id);
    if (el) {
      el.textContent = msg;
      el.style.display = 'block';
    }
  }

  private clearError(id: string): void {
    const el = document.getElementById(id);
    if (el) {
      el.style.display = 'none';
    }
  }
}

// Start on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  new SlanguageForgotPassword();
});
