/**
 * Slanguage - AI Practice Module (Luyện tập giao tiếp với AI)
 * Multi-language conversational AI Tutor (English, Japanese, Vietnamese)
 * Supports Speech-to-Text (Mic), Text-to-Speech (Audio Voice), Grammar Corrections & XP Rewards.
 */

// Global Window Speech Recognition Types
interface IWindow extends Window {
  SpeechRecognition?: any;
  webkitSpeechRecognition?: any;
  aiPracticeApp?: AIPracticeManager;
}

declare const window: IWindow;

type PracticeMode = 'free' | 'interview' | 'grammar' | 'pronounce';
type TargetLang = 'ja' | 'en' | 'vi';

interface ChatMessage {
  id: string;
  sender: 'bot' | 'user';
  text: string;
  romajiOrPhonetic?: string;
  translation?: string;
  tip?: string;
  timestamp: string;
}

interface LanguageMeta {
  code: TargetLang;
  name: string;
  flag: string;
  locale: string;
  aiName: string;
}

/**
 * Real-time Chroma Key Renderer that removes the white background from Freddy's talking video
 * and renders clean, transparent-background animation onto an HTML5 Canvas.
 */
class FreddyChromaKeyRenderer {
  private video: HTMLVideoElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D | null = null;
  private isAnimating: boolean = false;
  private animId: number | null = null;

  constructor(video: HTMLVideoElement, canvas: HTMLCanvasElement) {
    this.video = video;
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { willReadFrequently: true });

    // Video aspect ratio 720x1280
    this.canvas.width = 360;
    this.canvas.height = 640;

    this.video.addEventListener('loadedmetadata', () => this.renderFrame());
    this.video.addEventListener('canplay', () => this.renderFrame());
    this.video.addEventListener('play', () => this.start());
    this.video.addEventListener('pause', () => {
      this.stop();
      this.renderFrame();
    });
    this.video.addEventListener('seeked', () => this.renderFrame());

    if (this.video.readyState >= 2) {
      this.renderFrame();
    }
  }

  public start(): void {
    if (this.isAnimating) return;
    this.isAnimating = true;
    this.loop();
  }

  public stop(): void {
    this.isAnimating = false;
    if (this.animId !== null) {
      cancelAnimationFrame(this.animId);
      this.animId = null;
    }
  }

  public renderFrame(): void {
    if (!this.ctx || this.video.readyState < 2) return;
    this.processFrame();
  }

  private loop = (): void => {
    if (!this.isAnimating) return;
    if (!this.video.paused && !this.video.ended && this.video.readyState >= 2) {
      this.processFrame();
    }
    this.animId = requestAnimationFrame(this.loop);
  };

  private processFrame(): void {
    if (!this.ctx) return;
    const w = this.canvas.width;
    const h = this.canvas.height;

    this.ctx.drawImage(this.video, 0, 0, w, h);
    const frame = this.ctx.getImageData(0, 0, w, h);
    const data = frame.data;
    const len = data.length;

    // Chroma-key out white background (pure & near-white studio background)
    for (let i = 0; i < len; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];

      if (r > 230 && g > 230 && b > 230) {
        const minVal = Math.min(r, g, b);
        if (minVal >= 242) {
          data[i + 3] = 0; // Transparent
        } else {
          const factor = (242 - minVal) / 12;
          data[i + 3] = Math.round(255 * factor);
        }
      }
    }

    this.ctx.putImageData(frame, 0, 0);
  }
}

class AIPracticeManager {
  private currentLang: TargetLang = 'ja';
  private currentMode: PracticeMode = 'free';
  private voiceEnabled: boolean = true;
  private voiceRate: number = 1.0;
  private practiceCount: number = 0;
  private earnedXP: number = 0;
  private isRecording: boolean = false;
  private speechRecognizer: any = null;

  private readonly langMetadata: Record<TargetLang, LanguageMeta> = {
    ja: {
      code: 'ja',
      name: 'Tiếng Nhật',
      flag: '../assets/flags/flag-jp.png',
      locale: 'ja-JP',
      aiName: 'Sensei Slanguage'
    },
    en: {
      code: 'en',
      name: 'English',
      flag: '../assets/flags/flag-en.png',
      locale: 'en-US',
      aiName: 'Tutor Slanguage'
    },
    vi: {
      code: 'vi',
      name: 'Tiếng Việt',
      flag: '../assets/flags/flag-vn.png',
      locale: 'vi-VN',
      aiName: 'Trợ lý Slanguage'
    }
  };

  // DOM Elements
  private chatMessagesEl!: HTMLElement;
  private chatInputEl!: HTMLTextAreaElement;
  private sendBtnEl!: HTMLButtonElement;
  private micBtnEl!: HTMLButtonElement;
  private waveVisualizerEl!: HTMLElement;
  private suggestionsListEl!: HTMLElement;
  private practiceCountEl!: HTMLElement;
  private earnedXPEl!: HTMLElement;
  private headerXPEl!: HTMLElement;
  private currentLangFlagEl!: HTMLImageElement;
  private currentLangLabelEl!: HTMLElement;
  private langDropdownEl!: HTMLElement;
  private langDropdownBtnEl!: HTMLButtonElement;
  private userDropdownEl!: HTMLElement;
  private userDropdownBtnEl!: HTMLButtonElement;
  private voiceToggleBtnEl!: HTMLButtonElement;
  private voiceToggleIconEl!: HTMLElement;
  private voiceToggleTextEl!: HTMLElement;
  private settingsModalEl!: HTMLElement;
  private btnOpenSettingsEl!: HTMLButtonElement;
  private btnCloseSettingsEl!: HTMLButtonElement;
  private btnCancelSettingsEl!: HTMLButtonElement;
  private btnSaveSettingsEl!: HTMLButtonElement;
  private radioOfflineEl!: HTMLInputElement;
  private radioGeminiEl!: HTMLInputElement;
  private geminiKeyGroupEl!: HTMLElement;
  private geminiApiKeyInputEl!: HTMLInputElement;
  private voiceSpeedRangeEl!: HTMLInputElement;
  private voiceSpeedValEl!: HTMLElement;
  private engineIndicatorEl!: HTMLElement;
  private toastEl!: HTMLElement;
  private toastMessageEl!: HTMLElement;

  // AI Character Stage & Comic Speech Bubble Elements
  private freddyVideoEl!: HTMLVideoElement;
  private freddyCanvasEl!: HTMLCanvasElement;
  private chromaRenderer: FreddyChromaKeyRenderer | null = null;
  private comicBubbleEl!: HTMLElement;
  private comicBubbleTextEl!: HTMLElement;
  private comicBubbleSubEl!: HTMLElement;
  private comicBubbleTipEl!: HTMLElement;
  private aiStatusIndicatorEl!: HTMLElement;
  private aiStatusLabelEl!: HTMLElement;
  private characterTalkingTimer: any = null;
  private currentAIResponseText: string = '';

  constructor() {
    if (localStorage.getItem('slanguage_is_logged_in') !== 'true') {
      window.location.replace('../login/index.html');
      return;
    }
    this.initDOM();
    this.loadUserData();
    this.initSpeechRecognition();
    this.bindEvents();
    this.applyCurrentLanguage();
    this.renderWelcomeGreeting();
  }

  private initDOM(): void {
    this.chatMessagesEl = document.getElementById('chatMessages') as HTMLElement;
    this.chatInputEl = document.getElementById('chatInputText') as HTMLTextAreaElement;
    this.sendBtnEl = document.getElementById('btnSendMessage') as HTMLButtonElement;
    this.micBtnEl = document.getElementById('btnMicRecord') as HTMLButtonElement;
    this.waveVisualizerEl = document.getElementById('audioWaveVisualizer') as HTMLElement;
    this.suggestionsListEl = document.getElementById('suggestionChipsList') as HTMLElement;
    this.practiceCountEl = document.getElementById('practiceSessionCount') as HTMLElement;
    this.earnedXPEl = document.getElementById('earnedPracticeXP') as HTMLElement;
    this.headerXPEl = document.getElementById('headerXPVal') as HTMLElement;
    this.currentLangFlagEl = document.getElementById('currentLangFlag') as HTMLImageElement;
    this.currentLangLabelEl = document.getElementById('currentLangLabel') as HTMLElement;
    this.langDropdownEl = document.getElementById('langDropdown') as HTMLElement;
    this.langDropdownBtnEl = document.getElementById('langDropdownBtn') as HTMLButtonElement;
    this.userDropdownEl = document.getElementById('userDropdown') as HTMLElement;
    this.userDropdownBtnEl = document.getElementById('userDropdownBtn') as HTMLButtonElement;
    this.voiceToggleBtnEl = document.getElementById('btnToggleVoice') as HTMLButtonElement;
    this.voiceToggleIconEl = document.getElementById('voiceToggleIcon') as HTMLElement;
    this.voiceToggleTextEl = document.getElementById('voiceToggleText') as HTMLElement;
    this.settingsModalEl = document.getElementById('settingsModal') as HTMLElement;
    this.btnOpenSettingsEl = document.getElementById('btnOpenSettings') as HTMLButtonElement;
    this.btnCloseSettingsEl = document.getElementById('btnCloseSettings') as HTMLButtonElement;
    this.btnCancelSettingsEl = document.getElementById('btnCancelSettings') as HTMLButtonElement;
    this.btnSaveSettingsEl = document.getElementById('btnSaveSettings') as HTMLButtonElement;
    this.radioOfflineEl = document.getElementById('radioOffline') as HTMLInputElement;
    this.radioGeminiEl = document.getElementById('radioGemini') as HTMLInputElement;
    this.geminiKeyGroupEl = document.getElementById('geminiKeyGroup') as HTMLElement;
    this.geminiApiKeyInputEl = document.getElementById('geminiApiKeyInput') as HTMLInputElement;
    this.voiceSpeedRangeEl = document.getElementById('voiceSpeedRange') as HTMLInputElement;
    this.voiceSpeedValEl = document.getElementById('voiceSpeedVal') as HTMLElement;
    this.engineIndicatorEl = document.getElementById('currentEngineIndicator') as HTMLElement;
    this.toastEl = document.getElementById('aiToast') as HTMLElement;
    this.toastMessageEl = document.getElementById('toastMessage') as HTMLElement;

    // Initialize Freddy Character & Chroma-Key Canvas
    this.freddyVideoEl = document.getElementById('aiFreddyVideo') as HTMLVideoElement;
    this.freddyCanvasEl = document.getElementById('aiFreddyCanvas') as HTMLCanvasElement;
    this.comicBubbleEl = document.getElementById('comicSpeechBubble') as HTMLElement;
    this.comicBubbleTextEl = document.getElementById('comicBubbleText') as HTMLElement;
    this.comicBubbleSubEl = document.getElementById('comicBubbleSub') as HTMLElement;
    this.comicBubbleTipEl = document.getElementById('comicBubbleTip') as HTMLElement;
    this.aiStatusIndicatorEl = document.getElementById('aiStatusIndicator') as HTMLElement;
    this.aiStatusLabelEl = document.getElementById('aiStatusLabel') as HTMLElement;

    if (this.freddyVideoEl && this.freddyCanvasEl) {
      this.freddyVideoEl.muted = true;
      this.chromaRenderer = new FreddyChromaKeyRenderer(this.freddyVideoEl, this.freddyCanvasEl);
    }
  }

  private loadUserData(): void {
    const rawNative = (localStorage.getItem('slanguage_native_language') || 'vi').toLowerCase();
    const nativeLang = rawNative.includes('vi') || rawNative.includes('việt') ? 'vi' : (rawNative.includes('en') || rawNative.includes('anh') ? 'en' : (rawNative.includes('ja') || rawNative.includes('nhật') ? 'ja' : 'vi'));

    let savedLang = (localStorage.getItem('slanguage_current_lang') || localStorage.getItem('slanguage_active_language') || 'ja') as TargetLang;
    if (savedLang === nativeLang) {
      savedLang = (nativeLang === 'vi' ? 'ja' : (nativeLang === 'ja' ? 'en' : 'ja')) as TargetLang;
      localStorage.setItem('slanguage_current_lang', savedLang);
      localStorage.setItem('slanguage_active_language', savedLang);
    }
    if (savedLang && ['ja', 'en', 'vi'].includes(savedLang)) {
      this.currentLang = savedLang;
    }

    document.querySelectorAll<HTMLElement>('.lang-dropdown-item').forEach(item => {
      if (item.getAttribute('data-lang') === nativeLang) {
        item.style.display = 'none';
      } else {
        item.style.display = 'flex';
      }
    });

    // User XP
    const userXP = localStorage.getItem('slanguage_user_xp') || '2,450 XP';
    if (this.headerXPEl) {
      this.headerXPEl.textContent = userXP.includes('XP') ? userXP : `${userXP} XP`;
    }

    // User Profile
    const rawUser = localStorage.getItem('slanguage_current_user');
    if (rawUser) {
      try {
        const u = JSON.parse(rawUser);
        const nameEl = document.getElementById('headerUserName');
        if (nameEl && u.name) nameEl.textContent = u.name;
        const avatarEl = document.getElementById('headerAvatar') as HTMLImageElement;
        if (avatarEl && u.avatar) avatarEl.src = u.avatar;
      } catch (e) {
        // use default
      }
    }

    // Gemini API Key
    const geminiKey = localStorage.getItem('slanguage_gemini_key') || '';
    if (this.geminiApiKeyInputEl) {
      this.geminiApiKeyInputEl.value = geminiKey;
    }
    const engineMode = localStorage.getItem('slanguage_ai_engine') || 'offline';
    if (engineMode === 'gemini' && geminiKey) {
      if (this.radioGeminiEl) this.radioGeminiEl.checked = true;
      if (this.geminiKeyGroupEl) this.geminiKeyGroupEl.style.display = 'flex';
      if (this.engineIndicatorEl) this.engineIndicatorEl.textContent = 'Chế độ: Google Gemini Cloud AI';
    } else {
      if (this.radioOfflineEl) this.radioOfflineEl.checked = true;
      if (this.geminiKeyGroupEl) this.geminiKeyGroupEl.style.display = 'none';
      if (this.engineIndicatorEl) this.engineIndicatorEl.textContent = 'Chế độ: Smart AI Offline (Sẵn sàng)';
    }
  }

  private bindEvents(): void {
    // Send Message
    this.sendBtnEl.addEventListener('click', () => this.handleSendMessage());
    this.chatInputEl.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.handleSendMessage();
      }
    });

    // Auto-expand textarea
    this.chatInputEl.addEventListener('input', () => {
      this.chatInputEl.style.height = 'auto';
      this.chatInputEl.style.height = Math.min(this.chatInputEl.scrollHeight, 140) + 'px';
    });

    // Mic Recording
    this.micBtnEl.addEventListener('click', () => this.toggleSpeechRecognition());

    // Practice Mode Switch
    document.querySelectorAll('.ai-mode-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const target = (e.currentTarget as HTMLElement);
        const mode = target.getAttribute('data-mode') as PracticeMode;
        if (mode && mode !== this.currentMode) {
          document.querySelectorAll('.ai-mode-btn').forEach((b) => b.classList.remove('active'));
          target.classList.add('active');
          this.currentMode = mode;
          this.renderWelcomeGreeting();
        }
      });
    });

    // Voice Output Toggle
    this.voiceToggleBtnEl.addEventListener('click', () => {
      this.voiceEnabled = !this.voiceEnabled;
      if (this.voiceEnabled) {
        this.voiceToggleBtnEl.classList.add('active');
        this.voiceToggleIconEl.className = 'fa-solid fa-volume-high';
        this.voiceToggleTextEl.textContent = 'Giọng đọc: BẬT';
        this.showToast('Đã BẬT giọng đọc phát âm tự động');
      } else {
        this.voiceToggleBtnEl.classList.remove('active');
        this.voiceToggleIconEl.className = 'fa-solid fa-volume-xmark';
        this.voiceToggleTextEl.textContent = 'Giọng đọc: TẮT';
        this.showToast('Đã TẮT giọng đọc phát âm');
      }
    });

    // Clear Chat
    const btnClearChat = document.getElementById('btnClearChat');
    if (btnClearChat) {
      btnClearChat.addEventListener('click', () => {
        this.chatMessagesEl.innerHTML = '';
        this.renderWelcomeGreeting();
        this.showToast('Đã làm mới phiên hội thoại');
      });
    }

    // Settings Modal
    this.btnOpenSettingsEl.addEventListener('click', () => {
      this.settingsModalEl.style.display = 'flex';
    });
    this.btnCloseSettingsEl.addEventListener('click', () => {
      this.settingsModalEl.style.display = 'none';
    });
    this.btnCancelSettingsEl.addEventListener('click', () => {
      this.settingsModalEl.style.display = 'none';
    });
    this.btnSaveSettingsEl.addEventListener('click', () => this.saveSettings());

    // Radios in Settings
    this.radioOfflineEl.addEventListener('change', () => {
      this.geminiKeyGroupEl.style.display = 'none';
      document.querySelectorAll('.engine-radio-card').forEach((c) => c.classList.remove('active'));
      this.radioOfflineEl.closest('.engine-radio-card')?.classList.add('active');
    });
    this.radioGeminiEl.addEventListener('change', () => {
      this.geminiKeyGroupEl.style.display = 'flex';
      document.querySelectorAll('.engine-radio-card').forEach((c) => c.classList.remove('active'));
      this.radioGeminiEl.closest('.engine-radio-card')?.classList.add('active');
    });

    // Voice Speed Range
    this.voiceSpeedRangeEl.addEventListener('input', () => {
      this.voiceRate = parseFloat(this.voiceSpeedRangeEl.value);
      this.voiceSpeedValEl.textContent = `${this.voiceRate.toFixed(1)}x`;
    });

    // Language Dropdown
    this.langDropdownBtnEl.addEventListener('click', (e) => {
      e.stopPropagation();
      this.langDropdownEl.classList.toggle('show');
    });

    document.querySelectorAll('.lang-dropdown-item').forEach((item) => {
      item.addEventListener('click', (e) => {
        const lang = (e.currentTarget as HTMLElement).getAttribute('data-lang') as TargetLang;
        if (lang) {
          this.switchLanguage(lang);
        }
      });
    });

    // User Dropdown
    this.userDropdownBtnEl.addEventListener('click', (e) => {
      e.stopPropagation();
      this.userDropdownEl.classList.toggle('show');
    });

    // Close Dropdowns on Click Outside
    document.addEventListener('click', (e) => {
      if (!this.langDropdownEl.contains(e.target as Node)) {
        this.langDropdownEl.classList.remove('show');
      }
      if (!this.userDropdownEl.contains(e.target as Node)) {
        this.userDropdownEl.classList.remove('show');
      }
    });

    // Auth state synchronization
    const isLoggedIn = localStorage.getItem('slanguage_is_logged_in') === 'true';
    if (isLoggedIn) {
      document.body.classList.add('user-authenticated');
      document.body.classList.remove('user-guest');
    } else {
      document.body.classList.add('user-guest');
      document.body.classList.remove('user-authenticated');
    }

    // Logout
    const logoutBtn = document.getElementById('navLogoutItem');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => {
        localStorage.setItem('slanguage_is_logged_in', 'false');
        localStorage.removeItem('slanguage_current_user');
      });
    }
  }

  private switchLanguage(lang: TargetLang): void {
    const rawNative = (localStorage.getItem('slanguage_native_language') || 'vi').toLowerCase();
    const nativeLang = rawNative.includes('vi') || rawNative.includes('việt') ? 'vi' : (rawNative.includes('en') || rawNative.includes('anh') ? 'en' : (rawNative.includes('ja') || rawNative.includes('nhật') ? 'ja' : 'vi'));
    if (lang === nativeLang) {
      this.showToast(`Bạn không thể chọn ngôn ngữ mẹ đẻ để học!`);
      this.langDropdownEl.classList.remove('show');
      return;
    }

    if (this.currentLang === lang) {
      this.langDropdownEl.classList.remove('show');
      return;
    }
    this.currentLang = lang;
    localStorage.setItem('slanguage_current_lang', lang);
    localStorage.setItem('slanguage_active_language', lang);
    this.applyCurrentLanguage();
    this.langDropdownEl.classList.remove('show');
    this.chatMessagesEl.innerHTML = '';
    this.renderWelcomeGreeting();
    this.showToast(`Đã chuyển mục tiêu luyện tập sang ${this.langMetadata[lang].name}`);
  }

  private applyCurrentLanguage(): void {
    const meta = this.langMetadata[this.currentLang];
    this.currentLangFlagEl.src = meta.flag;
    this.currentLangFlagEl.alt = meta.name;
    this.currentLangLabelEl.textContent = meta.name;

    // Update active item in dropdown
    document.querySelectorAll('.lang-dropdown-item').forEach((item) => {
      const l = item.getAttribute('data-lang');
      if (l === this.currentLang) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });

    // Update Speech Recognizer Locale
    if (this.speechRecognizer) {
      this.speechRecognizer.lang = meta.locale;
    }
  }

  private initSpeechRecognition(): void {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      this.speechRecognizer = new SpeechRecognition();
      this.speechRecognizer.continuous = false;
      this.speechRecognizer.interimResults = false;
      this.speechRecognizer.lang = this.langMetadata[this.currentLang].locale;

      this.speechRecognizer.onstart = () => {
        this.isRecording = true;
        this.micBtnEl.classList.add('recording');
        this.waveVisualizerEl.style.display = 'flex';
      };

      this.speechRecognizer.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        if (transcript) {
          this.chatInputEl.value = transcript;
          this.chatInputEl.style.height = 'auto';
          this.handleSendMessage();
        }
      };

      this.speechRecognizer.onerror = (event: any) => {
        console.warn('Speech Recognition error:', event.error);
        this.stopSpeechRecognition();
        this.showToast('Không nhận diện được giọng nói, vui lòng thử lại');
      };

      this.speechRecognizer.onend = () => {
        this.stopSpeechRecognition();
      };
    } else {
      this.micBtnEl.title = 'Trình duyệt của bạn chưa hỗ trợ Web Speech API';
    }
  }

  private toggleSpeechRecognition(): void {
    if (!this.speechRecognizer) {
      this.showToast('Trình duyệt chưa hỗ trợ ghi âm trực tiếp. Hãy dùng bàn phím để gõ nhé!');
      return;
    }

    if (this.isRecording) {
      this.speechRecognizer.stop();
      this.stopSpeechRecognition();
    } else {
      this.speechRecognizer.lang = this.langMetadata[this.currentLang].locale;
      try {
        this.speechRecognizer.start();
      } catch (e) {
        this.stopSpeechRecognition();
      }
    }
  }

  private stopSpeechRecognition(): void {
    this.isRecording = false;
    this.micBtnEl.classList.remove('recording');
    this.waveVisualizerEl.style.display = 'none';
  }

  private renderWelcomeGreeting(): void {
    const meta = this.langMetadata[this.currentLang];
    let greetingText = '';
    let romaji = '';
    let translation = '';
    let tip = '';
    let suggestions: string[] = [];

    if (this.currentLang === 'ja') {
      if (this.currentMode === 'free') {
        greetingText = 'こんにちは！私はSlanguage AI Senseiです。今日はどんなことについて話しましょうか？';
        romaji = 'Konnichiwa! Watashi wa Slanguage AI Sensei desu. Kyou wa donna koto ni tsuite hanashimashou ka?';
        translation = 'Xin chào! Tôi là AI Sensei của Slanguage. Hôm nay bạn muốn trò chuyện về chủ đề gì nào?';
        tip = 'Gợi ý: Bạn có thể gõ bằng chữ Hiragana, Kanji hoặc Romaji. Nhấn vào biểu tượng loa để nghe phát âm chuẩn Tokyo!';
        suggestions = [
          '自己紹介を練習したいです (Luyện tự giới thiệu bản thân)',
          '日本旅行でおすすめの場所はどこですか？ (Hỏi địa điểm du lịch Nhật Bản)',
          'レストランで料理を注文する会話 (Đàm thoại gọi món nhà hàng)',
          '日本語のあいさつを教えてください (Dạy câu chào hỏi thông dụng)'
        ];
      } else if (this.currentMode === 'interview') {
        greetingText = '面接練習へようこそ！では、まず簡単に自己紹介と志望動機をお願いします。';
        romaji = 'Mensetsu renshuu e youkoso! Dewa, mazu kantan ni jikoshoukai to shibou douki o onegai shimasu.';
        translation = 'Chào mừng bạn đến với phòng luyện phỏng vấn! Trước tiên, xin mời bạn tự giới thiệu và nêu lý do ứng tuyển.';
        tip = 'Lưu ý: Hãy sử dụng thể lịch sự Desu/Masu hoặc Kính ngữ (Keigo) khi trả lời phỏng vấn nhé.';
        suggestions = [
          'はじめまして、私はベトナム出身の... (Tôi đến từ Việt Nam...)',
          '貴社のITサービスにとても興味があります (Tôi rất quan tâm dịch vụ IT của quý công ty)',
          '私の強みはチームワークと学習意欲です (Thế mạnh của tôi là tinh thần học hỏi)'
        ];
      } else if (this.currentMode === 'grammar') {
        greetingText = '文法チェックモードです！添削したい日本語の文章を入力してください。自然な表現に直します。';
        romaji = 'Bunpou chekku moudo desu! Tensaku shitai nihongo no bunshou o nyuuryoku shite kudasai.';
        translation = 'Chế độ sửa lỗi ngữ pháp! Hãy nhập câu tiếng Nhật bạn muốn kiểm tra, tôi sẽ sửa lại tự nhiên nhất kèm giải thích.';
        tip = 'Bạn có thể nhập câu chưa hoàn chỉnh hoặc phân vân giữa các trợ từ như は (wa) và が (ga).';
        suggestions = [
          '「私は映画を見ることが好き」は自然ですか？',
          '「は」と「が」の違いを教えてください (Phân biệt trợ từ wa và ga)',
          'ビジネスメールの締めの挨拶を直してください (Sửa lời chào kết email)'
        ];
      } else {
        greetingText = '発音と漢字の練習モードです！発音を聞きたい漢字やフレーズを入力、またはマイクで発声してください。';
        romaji = 'Hatsuon to Kanji no renshuu moudo desu! Kiitai kanji ya fureezu o nyuuryoku shite kudasai.';
        translation = 'Chế độ luyện phát âm & Kanji! Hãy nhập từ vựng/Hán tự bạn muốn luyện nghe hoặc bấm Mic để thử phát âm.';
        tip = 'Nhấn loa để nghe nhịp điệu cao độ chuẩn tiếng Nhật (Pitch Accent).';
        suggestions = [
          '「桜」「一期一会」の発音と意味 (Phát âm và ý nghĩa từ Sakura)',
          '「よろしくお願いします」の正しいアクセント (Nghe ngữ điệu Yoroshiku)',
          'N5・N4でよく出る重要漢字5つ (5 Hán tự thường gặp trong đề JLPT)'
        ];
      }
    } else if (this.currentLang === 'en') {
      if (this.currentMode === 'free') {
        greetingText = 'Hello! Welcome to Slanguage AI Practice. What would you like to chat about today?';
        translation = 'Xin chào! Chào mừng bạn đến với phòng luyện tiếng Anh Slanguage. Hôm nay bạn muốn đàm thoại về điều gì?';
        tip = 'Tip: Feel free to speak naturally. Click the speaker icon on any message to hear native pronunciation.';
        suggestions = [
          'Let’s practice daily casual conversation! (Luyện giao tiếp thường ngày)',
          'Can you recommend some good habits for learning English?',
          'Tell me an interesting fun fact about cultures!',
          'How do I order food like a native speaker at a restaurant?'
        ];
      } else if (this.currentMode === 'interview') {
        greetingText = 'Welcome to the Job Interview Simulator! Let’s begin: "Could you tell me a little about yourself and your background?"';
        translation = 'Chào mừng bạn đến với phần mô phỏng phỏng vấn xin việc! Bắt đầu nhé: "Bạn có thể giới thiệu đôi nét về bản thân và học vấn của mình?"';
        tip = 'Tip: Structure your response using the STAR method (Situation, Task, Action, Result).';
        suggestions = [
          'Sure! I have 2 years of experience in project management...',
          'My greatest strength is problem-solving and rapid learning.',
          'Why is teamwork so valued in your corporate environment?'
        ];
      } else if (this.currentMode === 'grammar') {
        greetingText = 'Grammar & Proofreading mode activated! Send me any sentence or email draft, and I will polish it for you.';
        translation = 'Chế độ sửa lỗi ngữ pháp đã sẵn sàng! Gửi cho tôi bất kỳ câu văn hoặc bản nháp email nào, tôi sẽ sửa và giải thích chi tiết.';
        tip = 'Ask about confusing prepositions (in, on, at) or tense differences (Past Simple vs Present Perfect).';
        suggestions = [
          'Please correct: "I am looking forward to hear from you soon."',
          'What is the difference between "affect" and "effect"?',
          'Make this email sound more professional and polite.'
        ];
      } else {
        greetingText = 'Pronunciation & Vocabulary Lab! Let’s train your tongue. Type a challenging phrase or click the Mic to test your speech!';
        translation = 'Phòng luyện phát âm & Từ vựng! Hãy thử thách với các cụm từ khó hoặc bấm Mic để kiểm tra phát âm tiếng Anh chuẩn.';
        tip = 'Pay attention to intonation, word stress, and connected speech.';
        suggestions = [
          'Pronounce: "Thoroughly thought through" (Luyện âm th)',
          'Explain the idiom "hit the nail on the head"',
          'Top 5 essential phrasal verbs for office work'
        ];
      }
    } else {
      // Vietnamese
      if (this.currentMode === 'free') {
        greetingText = 'Chào bạn! Mình là Trợ lý AI Slanguage. Hôm nay bạn muốn luyện tập đàm thoại về chủ đề gì nào?';
        tip = 'Mẹo: Bạn có thể luyện đối thoại, hỏi ngữ nghĩa từ láy hoặc luyện đặt câu chuẩn ngữ cảnh.';
        suggestions = [
          'Luyện tập đối thoại hỏi đường và bắt xe công nghệ',
          'Giải thích ý nghĩa câu thành ngữ "Uống nước nhớ nguồn"',
          'Cách xưng hô chuẩn mực và lịch sự trong giao tiếp người Việt',
          'Gợi ý các món ăn đường phố đặc sắc tại Hà Nội và Sài Gòn'
        ];
      } else if (this.currentMode === 'interview') {
        greetingText = 'Chào mừng bạn đến với buổi phỏng vấn thử! Xin mời bạn tự giới thiệu ngắn gọn và chia sẻ mục tiêu nghề nghiệp trong 2 năm tới.';
        tip = 'Mẹo: Trả lời tự tin, rõ ràng và mạch lạc.';
        suggestions = [
          'Dạ xin chào anh/chị, tôi là một chuyên viên phát triển phần mềm...',
          'Mục tiêu của tôi là nâng cao kỹ năng đàm phán và quản trị dự án.',
          'Tôi luôn hướng tới việc tối ưu hóa hiệu suất làm việc nhóm.'
        ];
      } else if (this.currentMode === 'grammar') {
        greetingText = 'Chế độ kiểm tra chính tả & ngữ pháp! Nhập bất kỳ đoạn văn nào, tôi sẽ soát lỗi dấu câu, thanh điệu và từ vựng giúp bạn.';
        tip = 'Phân biệt thanh hỏi / ngã, cách dùng từ láy và cách chấm phẩy câu mạch lạc.';
        suggestions = [
          'Kiểm tra chính tả câu: "Sắp xếp hay xắp sếp, từ nào đúng?"',
          'Sửa giúp tôi bức thư xin phép nghỉ phép gửi cấp trên',
          'Phân biệt cách dùng "dành cho" và "giành cho"'
        ];
      } else {
        greetingText = 'Chế độ luyện phát âm & Thanh điệu! Tiếng Việt có 6 thanh điệu đặc sắc (Ngang, Huyền, Sắc, Hỏi, Ngã, Nặng). Hãy cùng luyện nhé!';
        tip = 'Bấm vào biểu tượng loa để nghe cao độ chuẩn xác của từng dấu thanh.';
        suggestions = [
          'Luyện phân biệt 6 thanh qua chữ: Ma, Mà, Má, Mả, Mã, Mạ',
          'Luyện câu nói líu lưỡi: "Nồi đồng nấu ốc, nồi đất nấu ếch"',
          'Cách phát âm chuẩn các phụ âm đầu: Tr/Ch, S/X, R/D/Gi'
        ];
      }
    }

    const initialMsg: ChatMessage = {
      id: 'welcome_' + Date.now(),
      sender: 'bot',
      text: greetingText,
      romajiOrPhonetic: romaji,
      translation: translation,
      tip: tip,
      timestamp: this.getFormattedTime()
    };

    this.renderMessage(initialMsg);
    this.triggerAICharacterResponse(initialMsg.text, initialMsg.romajiOrPhonetic, initialMsg.tip);
    this.stopCharacterTalking(); // Welcome message starts in idle state with bubble visible
    this.renderSuggestionChips(suggestions);
  }

  private renderSuggestionChips(chips: string[]): void {
    this.suggestionsListEl.innerHTML = '';
    chips.forEach((prompt) => {
      const btn = document.createElement('button');
      btn.className = 'suggestion-chip';
      btn.textContent = prompt;
      btn.addEventListener('click', () => {
        this.chatInputEl.value = prompt;
        this.handleSendMessage();
      });
      this.suggestionsListEl.appendChild(btn);
    });
  }

  private handleSendMessage(): void {
    const text = this.chatInputEl.value.trim();
    if (!text) return;

    // Render User Message
    const userMsg: ChatMessage = {
      id: 'user_' + Date.now(),
      sender: 'user',
      text: text,
      timestamp: this.getFormattedTime()
    };
    this.renderMessage(userMsg);

    // Reset input
    this.chatInputEl.value = '';
    this.chatInputEl.style.height = 'auto';

    // Show Typing Indicator
    this.showTypingIndicator();

    // Process Bot Response
    setTimeout(() => {
      this.removeTypingIndicator();
      this.generateBotReply(text);
      this.awardXP();
    }, 700);
  }

  private generateBotReply(userPrompt: string): void {
    const isGeminiMode = localStorage.getItem('slanguage_ai_engine') === 'gemini';
    const apiKey = localStorage.getItem('slanguage_gemini_key') || '';

    if (isGeminiMode && apiKey) {
      this.callGeminiAPI(userPrompt, apiKey);
    } else {
      this.generateOfflineReply(userPrompt);
    }
  }

  private generateOfflineReply(prompt: string): void {
    const lower = prompt.toLowerCase();
    let replyText = '';
    let romaji = '';
    let translation = '';
    let tip = '';

    if (this.currentLang === 'ja') {
      if (lower.includes('xin chào') || lower.includes('chào') || lower.includes('hello') || lower.includes('konnichiwa') || lower.includes('こんにちは')) {
        replyText = 'こんにちは！お会いできて嬉しいです。日本語の勉強は順調ですか？何か質問があれば何でも聞いてくださいね。';
        romaji = 'Konnichiwa! Oaidekite ureshii desu. Nihongo no benkyou wa junchou desu ka? Nanika shitsumon ga areba nandemo kiite kudasai ne.';
        translation = 'Chào bạn! Rất vui được gặp bạn. Việc học tiếng Nhật của bạn có thuận lợi không? Nếu có thắc mắc gì hãy cứ hỏi tôi nhé.';
        tip = 'Mẹo: Dùng "お会いできて嬉しいです" (Oaidekite ureshii desu) để bày tỏ sự hân hạnh khi gặp gỡ.';
      } else if (lower.includes('giới thiệu') || lower.includes('jikoshoukai') || lower.includes('自己紹介')) {
        replyText = '素晴らしいですね！自己紹介の基本パターンはこうです：「初めまして、[名前]と申します。ベトナムから来ました。趣味は読書です。どうぞよろしくお願いします！」';
        romaji = 'Hajimemashite, [Tên] to moushimasu. Betonamu kara kimashita. Shuumi wa dokusho desu. Douzo yoroshiku onegai shimasu!';
        translation = 'Rất tuyệt vời! Mẫu tự giới thiệu chuẩn: "Rất vui được gặp bạn, tôi tên là [Tên]. Tôi đến từ Việt Nam. Sở thích của tôi là đọc sách. Rất mong nhận được sự giúp đỡ của bạn!"';
        tip = 'Dùng "と申します" (to moushimasu) là thể khiêm nhường ngữ lịch sự hơn "です" (desu).';
      } else if (lower.includes('nhà hàng') || lower.includes('order') || lower.includes('gọi món') || lower.includes('chuumon') || lower.includes('注文')) {
        replyText = 'レストランでは店員を呼ぶ時に「すみません！」と言います。注文する時は「これをお願いします (Kore o onegai shimasu)」や「お会計をお願いします (O-kaikei o onegai shimasu)」が定番です。';
        romaji = 'Sumimasen! Kore o onegai shimasu. O-kaikei o onegai shimasu.';
        translation = 'Tại quán ăn, khi gọi phục vụ hãy nói "Sumimasen!". Khi gọi món: "Cho tôi món này" hoặc tính tiền: "Cho tôi xin hóa đơn".';
        tip = 'Thêm chữ "O-" phía trước từ (O-kaikei, O-mizu) giúp lời nói trở nên tao nhã và lịch thiệp.';
      } else if (lower.includes('wa') && lower.includes('ga') || lower.includes('は') && lower.includes('が')) {
        replyText = '「は」は主題（〜について言えば）を表し、既知の情報を提示します。一方、「が」は新しい情報や主語そのものを強調・特定する際に使います。例：「私が山田です (Chính tôi là Yamada)」vs「私は学生です (Tôi là học sinh)」。';
        translation = 'Trợ từ "は" biểu thị chủ đề câu chuyện (nhắc lại thông tin đã biết), còn "が" nhấn mạnh tân thông tin hoặc đích danh chủ thể hành động.';
        tip = 'Quy tắc nhanh: Sau "が" là thông tin quan trọng nhất, sau "は" là vị ngữ chứa trọng tâm.';
      } else {
        replyText = `「${prompt}」についてですね！とても良い表現です。相手に共感を示す時は「そうですね (Sou desu ne)」や「なるほど (Naruhodo)」と相槌を打つと、会話がとてもスムーズになりますよ。`;
        romaji = 'Sou desu ne / Naruhodo.';
        translation = `Về nội dung "${prompt}", bạn diễn đạt rất tốt! Khi đàm thoại, hãy thường xuyên đệm các từ phụ họa như "Sou desu ne" (Đúng vậy nhỉ) hay "Naruhodo" (Ra là vậy) để cuộc nói chuyện tự nhiên hơn nhé.`;
        tip = 'Văn hóa相槌 (Aizuchi) gật đầu phụ họa là chìa khóa vàng trong đàm thoại tiếng Nhật.';
      }
    } else if (this.currentLang === 'en') {
      if (lower.includes('hello') || lower.includes('hi') || lower.includes('chào') || lower.includes('xin chào')) {
        replyText = 'Hi there! Great to chat with you today. How is your English learning journey going so far?';
        translation = 'Xin chào bạn! Thật vui được trò chuyện hôm nay. Hành trình học tiếng Anh của bạn dạo này thế nào rồi?';
        tip = 'Native tip: Instead of just "I am fine, thank you", try replying: "I\'m doing fantastic, thanks for asking!"';
      } else if (lower.includes('phỏng vấn') || lower.includes('interview') || lower.includes('kỹ năng')) {
        replyText = 'In job interviews, always remember to connect your personal skills with business outcomes. For example: "I improved team productivity by 25% by streamlining daily reporting workflows."';
        translation = 'Trong phỏng vấn xin việc, hãy nhớ luôn gắn kết kỹ năng của bạn với kết quả đo lường được bằng số liệu cụ thể.';
        tip = 'Action verbs to impress recruiters: Spearheaded, Streamlined, Orchestrated, Optimized.';
      } else if (lower.includes('look forward') || lower.includes('sửa') || lower.includes('correct')) {
        replyText = 'The phrase "look forward to" requires a gerund (-ing form)! Therefore, the correct sentence is: "I am looking forward to hearing from you soon," NOT "to hear".';
        translation = 'Cụm "look forward to" bắt buộc đi kèm V-ing! Do đó câu đúng là: "I am looking forward to hearing from you soon", không dùng "to hear".';
        tip = 'Other similar structures: be used to + V-ing, object to + V-ing.';
      } else {
        replyText = `That's an interesting point regarding "${prompt}"! In conversational English, fluency comes from practicing collocations and expressing opinions with phrases like "From my perspective" or "I\'m strongly convinced that..."`;
        translation = `Ý tưởng rất hay về "${prompt}"! Để nói tiếng Anh lưu loát, hãy áp dụng các cụm diễn đạt quan điểm tự nhiên như "Theo góc nhìn của tôi" hay "Tôi tin chắc rằng...".`;
        tip = 'Keep the conversation going: Try asking me a follow-up question!';
      }
    } else {
      // Vietnamese
      if (lower.includes('chào') || lower.includes('hello')) {
        replyText = 'Chào bạn nhé! Thật vui được đồng hành cùng bạn trên Slanguage. Hôm nay bạn muốn tìm hiểu hay trau chuốt phần giao tiếp nào?';
        tip = 'Người Việt thường chào kèm theo xưng hô thân mật: "Em chào anh", "Chào bạn", "Cháu chào cô".';
      } else if (lower.includes('sắp xếp') || lower.includes('xắp sếp') || lower.includes('chính tả')) {
        replyText = 'Từ đúng chính tả chuẩn tiếng Việt là "Sắp xếp" (S nặng), không phải "Xắp sếp". "Sắp" mang nghĩa chuẩn bị, thu xếp ngăn nắp.';
        tip = 'Mẹo ghi nhớ: Sắp đặt, sắp xếp, xếp hàng, ngăn nắp.';
      } else {
        replyText = `Về chủ đề "${prompt}", bạn đặt câu rất tự nhiên và chuẩn văn phong giao tiếp. Điểm đặc sắc của tiếng Việt là thanh điệu uyển chuyển và từ ngữ giàu hình ảnh biểu cảm.`;
        tip = 'Luyện tập thường xuyên để phản xạ giao tiếp ngày càng nhuần nhuyễn bạn nhé!';
      }
    }

    const botMsg: ChatMessage = {
      id: 'bot_' + Date.now(),
      sender: 'bot',
      text: replyText,
      romajiOrPhonetic: romaji,
      translation: translation,
      tip: tip,
      timestamp: this.getFormattedTime()
    };

    this.renderMessage(botMsg);
    this.triggerAICharacterResponse(botMsg.text, botMsg.romajiOrPhonetic, botMsg.tip);
    // Tự động phát âm thanh mỗi lần AI trả lời
    this.speakText(replyText, this.langMetadata[this.currentLang].locale);
  }

  private async callGeminiAPI(prompt: string, apiKey: string): Promise<void> {
    const meta = this.langMetadata[this.currentLang];
    const systemPrompt = `You are Slanguage AI Tutor, an encouraging, professional, and friendly language teacher specializing in ${meta.name}.
Respond in ${meta.name} concisely (under 80 words), followed by a brief Vietnamese translation and a helpful grammar/vocabulary tip. Keep tone warm, motivating, and interactive.`;

    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              { role: 'user', parts: [{ text: `${systemPrompt}\n\nStudent says: "${prompt}"` }] }
            ]
          })
        }
      );

      if (!response.ok) {
        throw new Error('Gemini API request failed');
      }

      const data = await response.json();
      const rawReply = data.candidates?.[0]?.content?.parts?.[0]?.text || 'I understood your question! Let us continue practicing.';

      const botMsg: ChatMessage = {
        id: 'bot_gemini_' + Date.now(),
        sender: 'bot',
        text: rawReply,
        tip: 'Phản hồi trực tiếp từ Google Gemini AI qua API Cloud.',
        timestamp: this.getFormattedTime()
      };

      this.renderMessage(botMsg);
      this.triggerAICharacterResponse(botMsg.text, undefined, botMsg.tip);
      // Tự động phát âm thanh mỗi lần AI trả lời
      this.speakText(rawReply, meta.locale);
    } catch (err) {
      console.warn('Gemini API call failed, falling back to smart offline mode:', err);
      this.generateOfflineReply(prompt);
      this.showToast('Kết nối Gemini gặp sự cố, đã chuyển sang Offline Smart AI');
    }
  }

  private renderMessage(msg: ChatMessage): void {
    const row = document.createElement('div');
    row.className = `chat-msg-row ${msg.sender}`;

    const avatar = document.createElement('div');
    avatar.className = 'msg-avatar';
    avatar.innerHTML = msg.sender === 'bot' 
      ? '<i class="fa-solid fa-robot"></i>' 
      : '<i class="fa-solid fa-user"></i>';

    const body = document.createElement('div');
    body.className = 'msg-body';

    const meta = document.createElement('div');
    meta.className = 'msg-meta';
    const author = msg.sender === 'bot' 
      ? this.langMetadata[this.currentLang].aiName 
      : (document.getElementById('headerUserName')?.textContent || 'Bạn');
    meta.innerHTML = `<span class="msg-author">${author}</span> • <span>${msg.timestamp}</span>`;

    const bubble = document.createElement('div');
    bubble.className = 'msg-bubble';

    let bubbleContent = `<div>${msg.text}</div>`;

    if (msg.romajiOrPhonetic) {
      bubbleContent += `<div style="font-size: 0.88rem; color: #38bdf8; margin-top: 6px; font-style: italic;"><i class="fa-solid fa-language"></i> ${msg.romajiOrPhonetic}</div>`;
    }

    if (msg.translation) {
      bubbleContent += `<div style="font-size: 0.9rem; color: #cbd5e1; margin-top: 6px; border-top: 1px dashed rgba(255,255,255,0.1); padding-top: 6px;"><i class="fa-solid fa-circle-check" style="color: #4ade80;"></i> ${msg.translation}</div>`;
    }

    if (msg.tip) {
      bubbleContent += `<div class="msg-tip-card"><i class="fa-solid fa-lightbulb" style="color: #fbbf24;"></i> ${msg.tip}</div>`;
    }

    if (msg.sender === 'bot') {
      bubbleContent += `
        <div class="bot-action-bar">
          <button class="btn-speak-msg" data-text="${this.escapeHtml(msg.text)}" title="Nghe phát âm chuẩn bản ngữ">
            <i class="fa-solid fa-volume-high"></i> Nghe phát âm
          </button>
          <span class="msg-tag-badge">${this.langMetadata[this.currentLang].name}</span>
        </div>
      `;
    }

    bubble.innerHTML = bubbleContent;

    // Attach speaker button event
    if (msg.sender === 'bot') {
      const speakBtn = bubble.querySelector('.btn-speak-msg');
      if (speakBtn) {
        speakBtn.addEventListener('click', () => {
          this.speakText(msg.text, this.langMetadata[this.currentLang].locale);
        });
      }
    }

    body.appendChild(meta);
    body.appendChild(bubble);

    row.appendChild(avatar);
    row.appendChild(body);

    this.chatMessagesEl.appendChild(row);
    this.scrollToBottom();
  }

  private showTypingIndicator(): void {
    if (this.aiStatusLabelEl) {
      this.aiStatusLabelEl.textContent = '🟡 Freddy đang suy nghĩ...';
    }

    const row = document.createElement('div');
    row.className = 'chat-msg-row bot typing-indicator-row';
    row.id = 'typingIndicator';

    const avatar = document.createElement('div');
    avatar.className = 'msg-avatar';
    avatar.innerHTML = '<i class="fa-solid fa-robot"></i>';

    const bubble = document.createElement('div');
    bubble.className = 'msg-bubble typing-bubble';
    bubble.innerHTML = `
      <div class="typing-dot"></div>
      <div class="typing-dot"></div>
      <div class="typing-dot"></div>
      <span style="font-size: 0.8rem; color: #94a3b8; margin-left: 8px;">AI đang suy nghĩ phản hồi...</span>
    `;

    row.appendChild(avatar);
    row.appendChild(bubble);
    this.chatMessagesEl.appendChild(row);
    this.scrollToBottom();
  }

  private removeTypingIndicator(): void {
    const el = document.getElementById('typingIndicator');
    if (el) el.remove();
  }

  private scrollToBottom(): void {
    this.chatMessagesEl.scrollTop = this.chatMessagesEl.scrollHeight;
  }

  private triggerAICharacterResponse(text: string, sub?: string, tip?: string): void {
    this.currentAIResponseText = text;

    if (this.comicBubbleTextEl) {
      this.comicBubbleTextEl.textContent = text;
    }

    if (this.comicBubbleSubEl) {
      if (sub) {
        this.comicBubbleSubEl.textContent = sub;
        this.comicBubbleSubEl.style.display = 'block';
      } else {
        this.comicBubbleSubEl.style.display = 'none';
      }
    }

    if (this.comicBubbleTipEl) {
      if (tip) {
        this.comicBubbleTipEl.innerHTML = `<i class="fa-solid fa-lightbulb"></i> ${tip}`;
        this.comicBubbleTipEl.style.display = 'block';
      } else {
        this.comicBubbleTipEl.style.display = 'none';
      }
    }

    if (this.comicBubbleEl) {
      this.comicBubbleEl.style.display = 'block';
      this.comicBubbleEl.classList.remove('pop-anim');
      void this.comicBubbleEl.offsetWidth;
      this.comicBubbleEl.classList.add('pop-anim');
    }

    // Start video playback
    this.startCharacterTalking();

    // Auto pause video if voice is disabled or speechSynthesis is unavailable
    if (!this.voiceEnabled || !('speechSynthesis' in window)) {
      if (this.characterTalkingTimer) clearTimeout(this.characterTalkingTimer);
      const readingDuration = Math.min(Math.max(text.length * 60, 3000), 9000);
      this.characterTalkingTimer = setTimeout(() => {
        this.stopCharacterTalking();
      }, readingDuration);
    }
  }

  private startCharacterTalking(): void {
    if (this.characterTalkingTimer) clearTimeout(this.characterTalkingTimer);

    if (this.freddyVideoEl) {
      this.freddyVideoEl.muted = true;
      this.freddyVideoEl.currentTime = 0;
      this.freddyVideoEl.play().catch((e) => console.log('Video play deferred:', e));
    }
    if (this.chromaRenderer) {
      this.chromaRenderer.start();
    }

    if (this.aiStatusIndicatorEl) {
      this.aiStatusIndicatorEl.classList.add('is-talking');
    }
    if (this.aiStatusLabelEl) {
      this.aiStatusLabelEl.textContent = '🔴 Freddy đang nói...';
    }
  }

  private stopCharacterTalking(): void {
    if (this.characterTalkingTimer) clearTimeout(this.characterTalkingTimer);

    if (this.freddyVideoEl) {
      this.freddyVideoEl.pause();
      this.freddyVideoEl.currentTime = 0;
    }
    if (this.chromaRenderer) {
      this.chromaRenderer.stop();
      this.chromaRenderer.renderFrame();
    }

    if (this.aiStatusIndicatorEl) {
      this.aiStatusIndicatorEl.classList.remove('is-talking');
    }
    if (this.aiStatusLabelEl) {
      this.aiStatusLabelEl.textContent = '🟢 Freddy đang lắng nghe...';
    }
  }

  private speakText(text: string, locale: string): void {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();

    // Clean text from translation or tags if present
    const clean = text.split('\n')[0].replace(/<[^>]*>?/gm, '');
    const utter = new SpeechSynthesisUtterance(clean);
    utter.lang = locale;
    utter.rate = this.voiceRate;

    utter.onstart = () => {
      this.startCharacterTalking();
    };

    utter.onend = () => {
      this.stopCharacterTalking();
    };

    utter.onerror = () => {
      this.stopCharacterTalking();
    };

    window.speechSynthesis.speak(utter);
  }

  private awardXP(): void {
    this.practiceCount++;
    this.earnedXP += 5;

    if (this.practiceCountEl) {
      this.practiceCountEl.textContent = this.practiceCount.toString();
    }
    if (this.earnedXPEl) {
      this.earnedXPEl.textContent = `+${this.earnedXP} XP`;
    }

    // Persist XP to user total
    const currentXP = parseInt(localStorage.getItem('slanguage_user_xp') || '2450', 10) || 2450;
    const newXP = currentXP + 5;
    localStorage.setItem('slanguage_user_xp', newXP.toString());

    if (this.headerXPEl) {
      this.headerXPEl.textContent = `${newXP.toLocaleString()} XP`;
    }

    // Show toast for every 2 interactions
    if (this.practiceCount % 2 === 0) {
      this.showToast(`⭐ +5 XP: Luyện tập đối thoại thành công! (Tổng: ${newXP} XP)`);
    }
  }

  private saveSettings(): void {
    const isGemini = this.radioGeminiEl.checked;
    const apiKey = this.geminiApiKeyInputEl.value.trim();

    if (isGemini) {
      if (!apiKey) {
        this.showToast('Vui lòng nhập API Key của Gemini nếu chọn chế độ Cloud');
        return;
      }
      localStorage.setItem('slanguage_ai_engine', 'gemini');
      localStorage.setItem('slanguage_gemini_key', apiKey);
      this.engineIndicatorEl.textContent = 'Chế độ: Google Gemini Cloud AI';
      this.showToast('Đã lưu cấu hình Google Gemini Cloud AI');
    } else {
      localStorage.setItem('slanguage_ai_engine', 'offline');
      this.engineIndicatorEl.textContent = 'Chế độ: Smart AI Offline (Sẵn sàng)';
      this.showToast('Đã lưu chế độ Smart AI Offline');
    }

    this.settingsModalEl.style.display = 'none';
  }

  private showToast(msg: string): void {
    if (!this.toastEl || !this.toastMessageEl) return;
    this.toastMessageEl.textContent = msg;
    this.toastEl.style.display = 'flex';
    setTimeout(() => {
      this.toastEl.style.display = 'none';
    }, 3200);
  }

  private getFormattedTime(): string {
    const now = new Date();
    const h = String(now.getHours()).padStart(2, '0');
    const m = String(now.getMinutes()).padStart(2, '0');
    return `${h}:${m}`;
  }

  private escapeHtml(str: string): string {
    return str.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
}

// Instantiate and expose globally
document.addEventListener('DOMContentLoaded', () => {
  window.aiPracticeApp = new AIPracticeManager();
});
export {};
