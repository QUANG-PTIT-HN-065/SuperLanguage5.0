/**
 * Slanguage - Learner Registration TypeScript Logic
 * Multi-step wizard for selecting study language (English, Japanese, Vietnamese),
 * password strength evaluation, validation, and profile initialization.
 */

interface LearnerRegistrationData {
  targetLanguage: 'en' | 'ja' | 'vi';
  dailyGoalMinutes: number;
  fullName: string;
  email: string;
  password: string;
}

class SlanguageRegister {
  private currentStep: number = 1;
  private selectedLanguage: 'en' | 'ja' | 'vi' = 'ja';
  private selectedGoal: number = 30;

  // DOM Elements
  private step1Panel: HTMLElement | null = null;
  private step2Panel: HTMLElement | null = null;
  private stepperItem1: HTMLElement | null = null;
  private stepperItem2: HTMLElement | null = null;
  private stepLine: HTMLElement | null = null;

  private fullNameInput: HTMLInputElement | null = null;
  private emailInput: HTMLInputElement | null = null;
  private passwordInput: HTMLInputElement | null = null;
  private confirmPasswordInput: HTMLInputElement | null = null;
  private termsCheckbox: HTMLInputElement | null = null;

  private strengthFill: HTMLElement | null = null;
  private strengthText: HTMLElement | null = null;
  private successModal: HTMLElement | null = null;

  constructor() {
    this.init();
  }

  private init(): void {
    this.step1Panel = document.getElementById('step1Panel');
    this.step2Panel = document.getElementById('step2Panel');
    this.stepperItem1 = document.getElementById('stepperItem1');
    this.stepperItem2 = document.getElementById('stepperItem2');
    this.stepLine = document.getElementById('stepLine');

    this.fullNameInput = document.getElementById('regFullName') as HTMLInputElement;
    this.emailInput = document.getElementById('regEmail') as HTMLInputElement;
    this.passwordInput = document.getElementById('regPassword') as HTMLInputElement;
    this.confirmPasswordInput = document.getElementById('regConfirmPassword') as HTMLInputElement;
    this.termsCheckbox = document.getElementById('regTerms') as HTMLInputElement;

    this.strengthFill = document.getElementById('strengthFill');
    this.strengthText = document.getElementById('strengthText');
    this.successModal = document.getElementById('successOverlay');

    this.bindEvents();
  }

  private bindEvents(): void {
    // Password strength listener
    if (this.passwordInput) {
      this.passwordInput.addEventListener('input', () => {
        this.checkPasswordStrength(this.passwordInput!.value);
      });
    }

    // Clear field errors on input
    if (this.fullNameInput) {
      this.fullNameInput.addEventListener('input', () => this.clearError('nameError'));
    }
    if (this.emailInput) {
      this.emailInput.addEventListener('input', () => this.clearError('emailError'));
    }
    if (this.passwordInput) {
      this.passwordInput.addEventListener('input', () => this.clearError('passError'));
    }
    if (this.confirmPasswordInput) {
      this.confirmPasswordInput.addEventListener('input', () => this.clearError('confirmPassError'));
    }

    // Step 1: Confirm Personal Info Form Submit
    const personalInfoForm = document.getElementById('personalInfoForm');
    if (personalInfoForm) {
      personalInfoForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.handleStep1Submit();
      });
    }

    // Step 2: Language card selections (English, Japanese, Vietnamese)
    const choiceCards = document.querySelectorAll<HTMLElement>('.choice-card');
    choiceCards.forEach(card => {
      card.addEventListener('click', () => {
        choiceCards.forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        this.selectedLanguage = card.getAttribute('data-lang') as 'en' | 'ja' | 'vi';
      });
    });

    // Step 2: Daily goal cards
    const goalCards = document.querySelectorAll<HTMLElement>('.goal-card');
    goalCards.forEach(card => {
      card.addEventListener('click', () => {
        goalCards.forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        this.selectedGoal = parseInt(card.getAttribute('data-minutes') || '30', 10);
      });
    });

    // Step 2 -> Back to Step 1
    const btnBackToStep1 = document.getElementById('btnBackToStep1');
    if (btnBackToStep1) {
      btnBackToStep1.addEventListener('click', () => {
        this.goToStep(1);
      });
    }

    // Step 2 -> Finalize Registration
    const btnCompleteRegister = document.getElementById('btnCompleteRegister');
    if (btnCompleteRegister) {
      btnCompleteRegister.addEventListener('click', () => {
        this.handleFinalizeRegistration();
      });
    }

    // Modal redirect
    const btnGoToStudy = document.getElementById('btnGoToStudy');
    if (btnGoToStudy) {
      btnGoToStudy.addEventListener('click', () => {
        this.triggerLoadingAndRedirect('../home/index.html', 1500);
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

  private goToStep(step: number): void {
    this.currentStep = step;
    if (step === 2) {
      this.step1Panel?.classList.remove('active');
      this.step2Panel?.classList.add('active');

      this.stepperItem1?.classList.remove('active');
      this.stepperItem1?.classList.add('done');
      this.stepperItem2?.classList.add('active');
      this.stepLine?.classList.add('active');
    } else {
      this.step2Panel?.classList.remove('active');
      this.step1Panel?.classList.add('active');

      this.stepperItem2?.classList.remove('active');
      this.stepperItem1?.classList.remove('done');
      this.stepperItem1?.classList.add('active');
      this.stepLine?.classList.remove('active');
    }
  }

  private checkPasswordStrength(pass: string): void {
    if (!this.strengthFill || !this.strengthText) return;

    if (!pass) {
      this.strengthFill.className = 'strength-bar-fill';
      this.strengthFill.style.width = '0%';
      this.strengthText.textContent = 'Độ mạnh mật khẩu: Chưa nhập';
      return;
    }

    let score = 0;
    if (pass.length >= 6) score++;
    if (pass.length >= 9) score++;
    if (/[A-Z]/.test(pass)) score++;
    if (/[0-9]/.test(pass)) score++;
    if (/[^A-Za-z0-9]/.test(pass)) score++;

    if (score <= 2) {
      this.strengthFill.className = 'strength-bar-fill strength-weak';
      this.strengthText.innerHTML = '<span style="color: #ff7675;">Độ mạnh: Yếu</span> (Nên thêm chữ hoa, số & ký tự đặc biệt)';
    } else if (score <= 4) {
      this.strengthFill.className = 'strength-bar-fill strength-medium';
      this.strengthText.innerHTML = '<span style="color: #FFB703;">Độ mạnh: Trung bình</span> (Khá an toàn)';
    } else {
      this.strengthFill.className = 'strength-bar-fill strength-strong';
      this.strengthText.innerHTML = '<span style="color: #00B4D8;">Độ mạnh: Rất mạnh</span> (Bảo mật xuất sắc!)';
    }
  }

  private registeredFullName: string = '';
  private registeredEmail: string = '';
  private registeredPassword: string = '';

  private handleStep1Submit(): void {
    let isValid = true;

    const fullName = this.fullNameInput?.value.trim() || '';
    const email = this.emailInput?.value.trim() || '';
    const password = this.passwordInput?.value || '';
    const confirmPassword = this.confirmPasswordInput?.value || '';
    const terms = this.termsCheckbox?.checked || false;

    // Validate Full Name
    if (!fullName) {
      this.showError('nameError', 'Vui lòng nhập họ và tên của học viên.');
      isValid = false;
    }

    // Validate Email
    if (!email) {
      this.showError('emailError', 'Vui lòng nhập địa chỉ email.');
      isValid = false;
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      this.showError('emailError', 'Địa chỉ email không hợp lệ.');
      isValid = false;
    }

    // Validate Password
    if (!password) {
      this.showError('passError', 'Vui lòng đặt mật khẩu.');
      isValid = false;
    } else if (password.length < 6) {
      this.showError('passError', 'Mật khẩu phải từ 6 ký tự trở lên.');
      isValid = false;
    }

    // Validate Confirm Password
    if (password !== confirmPassword) {
      this.showError('confirmPassError', 'Xác nhận mật khẩu không khớp.');
      isValid = false;
    }

    // Terms
    if (!terms) {
      alert('Vui lòng đồng ý với Điều khoản dịch vụ và Chính sách bảo mật của Slanguage.');
      isValid = false;
    }

    if (!isValid) return;

    // Store verified credentials and proceed to Step 2 (Choose roadmap)
    this.registeredFullName = fullName;
    this.registeredEmail = email;
    this.registeredPassword = password;

    this.goToStep(2);
  }

  private handleFinalizeRegistration(): void {
    const fullName = this.registeredFullName || this.fullNameInput?.value.trim() || 'Học viên Slanguage';
    const email = this.registeredEmail || this.emailInput?.value.trim() || 'hocvien@slanguage.edu.vn';
    const password = this.registeredPassword || this.passwordInput?.value || '';

    // Save student profile to localStorage
    const registrationData: LearnerRegistrationData = {
      targetLanguage: this.selectedLanguage,
      dailyGoalMinutes: this.selectedGoal,
      fullName: fullName,
      email: email,
      password: password
    };

    localStorage.setItem('slanguage_user_name', registrationData.fullName);
    localStorage.setItem('slanguage_user_email', registrationData.email);
    localStorage.setItem('slanguage_active_language', registrationData.targetLanguage);
    localStorage.setItem('slanguage_daily_goal', registrationData.dailyGoalMinutes.toString());
    localStorage.setItem('slanguage_user_xp', '100'); // 100 XP Welcome bonus!
    localStorage.setItem('slanguage_is_logged_in', 'true');

    // Show celebration modal
    if (this.successModal) {
      const summaryMsg = document.getElementById('successSummary');
      const langNames = { en: 'Tiếng Anh 🇬🇧', ja: 'Tiếng Nhật 🇯🇵', vi: 'Tiếng Việt 🇻🇳' };
      if (summaryMsg) {
        summaryMsg.innerHTML = `
          Chúc mừng <strong>${fullName}</strong>!<br>
          Bạn đã đăng ký thành công khóa học <strong>${langNames[this.selectedLanguage]}</strong> với mục tiêu <strong>${this.selectedGoal} phút/ngày</strong>.<br>
          <span style="color: #FFB703; font-weight: 700; margin-top: 8px; display: inline-block;">🎁 Đã tặng +100 XP thưởng tân thủ!</span>
        `;
      }
      this.successModal.style.display = 'flex';
    }
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
  new SlanguageRegister();
});
