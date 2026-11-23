/**
 * Slanguage - AI Practice Module (Luyện tập giao tiếp với AI)
 * Multi-language conversational AI Tutor (English, Japanese, Vietnamese)
 * Supports Speech-to-Text (Mic), Text-to-Speech (Audio Voice), Grammar Corrections & XP Rewards.
 */

import { isLearnerAuthenticated, slanguageApi, slanguageApiAudio } from '../shared/api-client';
import { initializeLearnerHeader, logoutLearner } from '../shared/learner-header';
import { applyI18n, getLocale, setLocale, t, LOCALE_EVENT, type UiLocale } from '../shared/i18n';

// Global Window Speech Recognition Types
interface IWindow extends Window {
  SpeechRecognition?: any;
  webkitSpeechRecognition?: any;
  aiPracticeApp?: AIPracticeManager;
}

declare const window: IWindow;

type PracticeMode = 'free' | 'interview' | 'grammar' | 'pronounce';
type TargetLang = 'ja' | 'en' | 'vi';
type StageStatus = 'ready' | 'thinking' | 'talking' | 'listening';

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
  locale: string;
  aiName: string;
}

interface VoiceOption {
  id: string;
  name: string;
  language: string;
  gender: string;
  category_name: string | null;
  has_preview: boolean;
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
  private conversationId: string | null = null;
  private isPending: boolean = false;
  private voiceEnabled: boolean = true;
  private voiceRate: number = 1.0;
  private practiceCount: number = 0;
  private earnedXP: number = 0;
  private isRecording: boolean = false;
  private speechRecognizer: any = null;
  private micHeld = false;
  private micPointerId: number | null = null;
  private micKey: string | null = null;
  private micDraft = '';
  private micTranscript = '';
  private micSessionTranscript = '';

  private readonly langMetadata: Record<TargetLang, LanguageMeta> = {
    ja: {
      code: 'ja',
      locale: 'ja-JP',
      aiName: 'Sensei Slanguage'
    },
    en: {
      code: 'en',
      locale: 'en-US',
      aiName: 'Tutor Slanguage'
    },
    vi: {
      code: 'vi',
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
  private voiceSpeedRangeEl!: HTMLInputElement;
  private voiceSpeedValEl!: HTMLElement;
  private voiceToneSelectEl!: HTMLSelectElement;
  private btnPreviewVoiceEl!: HTMLButtonElement;
  private voiceToneHelpEl!: HTMLElement;
  private adsupVoices: Record<TargetLang, VoiceOption[]> = { ja: [], en: [], vi: [] };
  private adsupDefaults: Partial<Record<TargetLang, string>> = {};
  private voicesReady: boolean = false;
  private activeAudio: HTMLAudioElement | null = null;
  private previewAudio: HTMLAudioElement | null = null;
  private engineIndicatorEl!: HTMLElement;
  private toastEl!: HTMLElement;
  private toastMessageEl!: HTMLElement;
  private headerAvatarImgEl: HTMLImageElement | null = null;
  private headerUserNameEl: HTMLElement | null = null;
  private userAvatarUrl: string | null = null;

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

  // Trạng thái chrome động để render lại khi đổi ngôn ngữ GIAO DIỆN (i18n)
  private stageStatus: StageStatus = 'ready';
  private engineKey: string = 'ai.engineDefault';
  private engineRaw: string | null = null;
  private micUnsupported: boolean = false;

  constructor() {
    if (!isLearnerAuthenticated()) {
      window.location.replace('../login/index.html');
      return;
    }
    this.initDOM();
    this.loadUserData();
    this.initSpeechRecognition();
    this.bindEvents();
    this.renderWelcomeGreeting();
    void this.loadVoiceTones();
    void this.loadOwnProfile();
    void initializeLearnerHeader({ bindControls: false });

    // Đổi ngôn ngữ GIAO DIỆN: dịch lại chrome tĩnh + render lại chrome động.
    // Ngôn ngữ HỌC (currentLang) giữ nguyên, không reset hội thoại.
    window.addEventListener(LOCALE_EVENT, () => {
      applyI18n();
      this.refreshDynamicChrome();
    });
    this.refreshDynamicChrome();
  }

  private langName(): string {
    return t(`ai.lang.${this.currentLang}`);
  }

  private setEngine(key: string): void {
    this.engineKey = key;
    this.engineRaw = null;
    this.engineIndicatorEl.textContent = t(key);
  }

  private setEngineRaw(message: string): void {
    this.engineRaw = message;
    this.engineIndicatorEl.textContent = message;
  }

  private updateStageStatus(): void {
    if (!this.aiStatusLabelEl) return;
    const map: Record<StageStatus, [string, string]> = {
      ready: ['', 'ai.statusReady'],
      thinking: ['🟡 ', 'ai.statusThinking'],
      talking: ['🔴 ', 'ai.statusTalking'],
      listening: ['🟢 ', 'ai.statusListening'],
    };
    const [emoji, key] = map[this.stageStatus];
    this.aiStatusLabelEl.textContent = emoji + t(key);
  }

  private refreshDynamicChrome(): void {
    document.title = t('ai.pageTitle');
    this.engineIndicatorEl.textContent = this.engineRaw ?? t(this.engineKey);
    this.updateStageStatus();
    if (this.micUnsupported) this.micBtnEl.title = t('ai.micUnsupported');
    this.renderVoiceToneOptions();
    this.chatMessagesEl.querySelectorAll<HTMLImageElement>('.msg-avatar-img').forEach((img) => {
      img.alt = t('ai.you');
    });
    this.chatMessagesEl.querySelectorAll<HTMLButtonElement>('.btn-speak-msg').forEach((btn) => {
      btn.title = t('ai.speakTitle');
    });
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
    this.voiceSpeedRangeEl = document.getElementById('voiceSpeedRange') as HTMLInputElement;
    this.voiceSpeedValEl = document.getElementById('voiceSpeedVal') as HTMLElement;
    this.voiceToneSelectEl = document.getElementById('voiceToneSelect') as HTMLSelectElement;
    this.btnPreviewVoiceEl = document.getElementById('btnPreviewVoice') as HTMLButtonElement;
    this.voiceToneHelpEl = document.getElementById('voiceToneHelp') as HTMLElement;
    this.engineIndicatorEl = document.getElementById('currentEngineIndicator') as HTMLElement;
    this.toastEl = document.getElementById('aiToast') as HTMLElement;
    this.toastMessageEl = document.getElementById('toastMessage') as HTMLElement;
    this.headerAvatarImgEl = document.getElementById('headerAvatar') as HTMLImageElement | null;
    this.headerUserNameEl = document.getElementById('headerUserName');

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
    const savedLang = (localStorage.getItem('slanguage_current_lang') || localStorage.getItem('slanguage_active_language') || 'ja') as TargetLang;
    if (savedLang && ['ja', 'en', 'vi'].includes(savedLang)) {
      this.currentLang = savedLang;
    }

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
  }

  private async loadOwnProfile(): Promise<void> {
    try {
      const response = await slanguageApi<{
        profile: { display_name?: string | null; email: string; avatar_url?: string | null };
      }>('/api/v1/me', { method: 'GET' });
      const profile = response.data?.profile;
      if (!profile) return;
      if (this.headerUserNameEl) {
        this.headerUserNameEl.textContent = profile.display_name || profile.email;
      }
      const avatarUrl = profile.avatar_url || '';
      if (avatarUrl.startsWith('https://')) {
        this.userAvatarUrl = avatarUrl;
        if (this.headerAvatarImgEl) this.headerAvatarImgEl.src = avatarUrl;
      }
    } catch {
      // Không tải được hồ sơ thì giữ tên/avatar mặc định
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

    this.micBtnEl.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 || !event.isPrimary || this.isRecording || this.isPending) return;
      event.preventDefault();
      this.micBtnEl.setPointerCapture(event.pointerId);
      this.micPointerId = event.pointerId;
      this.startSpeechRecognition();
    });
    this.micBtnEl.addEventListener('pointerup', (event) => {
      if (event.pointerId !== this.micPointerId) return;
      event.preventDefault();
      this.micPointerId = null;
      this.releaseSpeechRecognition();
    });
    this.micBtnEl.addEventListener('pointercancel', () => this.cancelSpeechRecognition());
    this.micBtnEl.addEventListener('lostpointercapture', () => {
      if (this.micHeld) this.cancelSpeechRecognition();
    });
    this.micBtnEl.addEventListener('contextmenu', (event) => event.preventDefault());
    this.micBtnEl.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') this.cancelSpeechRecognition();
      if (event.code !== 'Space' && event.code !== 'Enter') return;
      event.preventDefault();
      if (event.repeat || this.isRecording || this.isPending) return;
      this.micKey = event.code;
      this.startSpeechRecognition();
    });
    this.micBtnEl.addEventListener('keyup', (event) => {
      if (event.code !== this.micKey) return;
      event.preventDefault();
      this.micKey = null;
      this.releaseSpeechRecognition();
    });
    this.micBtnEl.addEventListener('blur', () => {
      if (this.micKey) this.cancelSpeechRecognition();
    });
    window.addEventListener('blur', () => this.cancelSpeechRecognition());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.cancelSpeechRecognition();
    });

    // Practice Mode Switch
    document.querySelectorAll('.ai-mode-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        if (this.isPending || this.isRecording) return;
        const target = (e.currentTarget as HTMLElement);
        const mode = target.getAttribute('data-mode') as PracticeMode;
        if (mode && mode !== this.currentMode) {
          document.querySelectorAll('.ai-mode-btn').forEach((b) => b.classList.remove('active'));
          target.classList.add('active');
          this.currentMode = mode;
          this.resetConversation();
        }
      });
    });

    // Voice Output Toggle
    this.voiceToggleBtnEl.addEventListener('click', () => {
      this.voiceEnabled = !this.voiceEnabled;
      const textKey = this.voiceEnabled ? 'ai.voiceOn' : 'ai.voiceOff';
      this.voiceToggleBtnEl.classList.toggle('active', this.voiceEnabled);
      this.voiceToggleIconEl.className = this.voiceEnabled ? 'fa-solid fa-volume-high' : 'fa-solid fa-volume-xmark';
      this.voiceToggleTextEl.dataset.i18n = textKey;
      this.voiceToggleTextEl.textContent = t(textKey);
      this.showToast(t(this.voiceEnabled ? 'ai.toastVoiceOn' : 'ai.toastVoiceOff'));
    });

    // Clear Chat
    const btnClearChat = document.getElementById('btnClearChat');
    if (btnClearChat) {
      btnClearChat.addEventListener('click', () => {
        if (this.isPending || this.isRecording) return;
        this.resetConversation();
        this.showToast(t('ai.toastCleared'));
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

    // Voice Speed Range
    this.voiceSpeedRangeEl.addEventListener('input', () => {
      this.voiceRate = parseFloat(this.voiceSpeedRangeEl.value);
      this.voiceSpeedValEl.textContent = `${this.voiceRate.toFixed(1)}x`;
    });

    // Voice Tone (ADSUP) selection & preview
    this.voiceToneSelectEl.addEventListener('change', () => {
      if (this.voiceToneSelectEl.value) {
        localStorage.setItem(`slanguage_ai_voice_${this.currentLang}`, this.voiceToneSelectEl.value);
      }
    });
    this.btnPreviewVoiceEl.addEventListener('click', () => void this.previewSelectedVoice());

    // Navbar Language Dropdown — chỉ đổi ngôn ngữ GIAO DIỆN (i18n).
    // Không PATCH target_language, không ghi localStorage ngôn ngữ học,
    // không reset hội thoại. translateShell lo nhãn/cờ/trạng thái selected.
    this.langDropdownBtnEl.addEventListener('click', (e) => {
      e.stopPropagation();
      this.langDropdownEl.classList.toggle('open');
    });

    document.querySelectorAll('.lang-dropdown-item').forEach((item) => {
      item.addEventListener('click', (e) => {
        const code = (e.currentTarget as HTMLElement).getAttribute('data-lang') as UiLocale | null;
        if (code && code !== getLocale()) {
          setLocale(code);
        }
        this.langDropdownEl.classList.remove('open');
      });
    });

    // User Dropdown
    this.userDropdownBtnEl.addEventListener('click', (e) => {
      e.stopPropagation();
      this.userDropdownEl.classList.toggle('open');
    });

    // Close Dropdowns on Click Outside
    document.addEventListener('click', (e) => {
      if (!this.langDropdownEl.contains(e.target as Node)) {
        this.langDropdownEl.classList.remove('open');
      }
      if (!this.userDropdownEl.contains(e.target as Node)) {
        this.userDropdownEl.classList.remove('open');
      }
    });

    // Auth state synchronization
    const isLoggedIn = isLearnerAuthenticated();
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
      logoutBtn.addEventListener('click', (e) => {
        e.preventDefault();
        void logoutLearner();
      });
    }
  }

  private resetConversation(): void {
    if (this.isPending || this.isRecording) return;
    this.conversationId = null;
    this.speechRecognizer?.abort();
    this.stopSpeechRecognition();
    this.activeAudio?.pause();
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    this.stopCharacterTalking();
    this.chatMessagesEl.innerHTML = '';
    this.setEngine('ai.engineReset');
    this.renderWelcomeGreeting();
  }

  private initSpeechRecognition(): void {
    if (!window.SpeechRecognition && !window.webkitSpeechRecognition) {
      this.micUnsupported = true;
      // Gỡ data-i18n-title để applyI18n không ghi đè tiêu đề báo lỗi hỗ trợ.
      delete this.micBtnEl.dataset.i18nTitle;
      this.micBtnEl.title = t('ai.micUnsupported');
    }
  }

  private startSpeechRecognition(): void {
    if (this.isPending || this.isRecording) return;
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      this.showToast(t('ai.toastNoSpeechApi'));
      return;
    }
    this.activeAudio?.pause();
    this.previewAudio?.pause();
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    this.stopCharacterTalking();
    this.micDraft = this.chatInputEl.value;
    this.micTranscript = '';
    this.micSessionTranscript = '';
    this.micHeld = true;
    this.isRecording = true;
    this.micBtnEl.classList.add('recording');
    this.micBtnEl.setAttribute('aria-pressed', 'true');
    this.waveVisualizerEl.style.display = 'flex';
    this.setEngine('ai.engineListening');
    this.updateInputControls();
    const recognizer = new SpeechRecognition();
    this.speechRecognizer = recognizer;
    recognizer.continuous = true;
    recognizer.interimResults = true;
    recognizer.lang = this.langMetadata[this.currentLang].locale;
    recognizer.onstart = () => {
      if (this.speechRecognizer === recognizer && !this.micHeld) recognizer.stop();
    };
    recognizer.onresult = (event: any) => {
      if (this.speechRecognizer !== recognizer) return;
      const final: string[] = [];
      const interim: string[] = [];
      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i];
        (result.isFinal ? final : interim).push(result[0].transcript.trim());
      }
      this.micSessionTranscript = final.join(' ');
      this.chatInputEl.value = [this.micDraft, this.micTranscript, this.micSessionTranscript, ...interim]
        .filter(Boolean).join(' ');
      this.chatInputEl.style.height = Math.min(this.chatInputEl.scrollHeight, 140) + 'px';
    };
    recognizer.onerror = (event: any) => {
      if (this.speechRecognizer !== recognizer || event.error === 'no-speech') return;
      this.cancelSpeechRecognition();
      this.showToast(event.error === 'not-allowed'
        ? t('ai.toastMicDenied')
        : t('ai.toastNotRecognized'));
    };
    recognizer.onend = () => {
      if (this.speechRecognizer !== recognizer) return;
      this.micTranscript = [this.micTranscript, this.micSessionTranscript].filter(Boolean).join(' ');
      this.micSessionTranscript = '';
      if (this.micHeld) {
        try {
          recognizer.start();
        } catch {
          this.cancelSpeechRecognition();
          this.showToast(t('ai.toastMicInterrupted'));
        }
        return;
      }
      const transcript = this.micTranscript.trim();
      this.speechRecognizer = null;
      this.stopSpeechRecognition();
      this.chatInputEl.value = [this.micDraft, transcript].filter(Boolean).join(' ');
      if (transcript) void this.handleSendMessage();
      else this.showToast(t('ai.toastNothingHeard'));
    };
    try {
      recognizer.start();
    } catch {
      this.cancelSpeechRecognition();
      this.showToast(t('ai.toastMicOpenFail'));
    }
  }

  private releaseSpeechRecognition(): void {
    if (!this.isRecording || !this.micHeld) return;
    this.micHeld = false;
    this.micBtnEl.setAttribute('aria-pressed', 'false');
    this.setEngine('ai.engineFinishing');
    this.speechRecognizer?.stop();
  }

  private cancelSpeechRecognition(): void {
    if (!this.isRecording) return;
    const recognizer = this.speechRecognizer;
    this.speechRecognizer = null;
    this.chatInputEl.value = this.micDraft;
    this.stopSpeechRecognition();
    recognizer?.abort();
  }

  private stopSpeechRecognition(): void {
    this.isRecording = false;
    this.micHeld = false;
    this.micPointerId = null;
    this.micKey = null;
    this.micBtnEl.classList.remove('recording');
    this.micBtnEl.setAttribute('aria-pressed', 'false');
    this.waveVisualizerEl.style.display = 'none';
    this.setEngine('ai.engineIdle');
    this.updateInputControls();
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
        if (this.isPending || this.isRecording) return;
        this.chatInputEl.value = prompt;
        this.handleSendMessage();
      });
      this.suggestionsListEl.appendChild(btn);
    });
  }

  private async handleSendMessage(): Promise<void> {
    if (this.isPending || this.isRecording) return;
    const text = this.chatInputEl.value.trim();
    if (!text) return;
    if (text.length > 4000) {
      this.showToast(t('ai.toastTooLong'));
      return;
    }
    this.isPending = true;
    this.updateInputControls();
    const userId = 'user_' + Date.now();
    this.renderMessage({ id: userId, sender: 'user', text, timestamp: this.getFormattedTime() });
    this.chatInputEl.value = '';
    this.chatInputEl.style.height = 'auto';
    this.showTypingIndicator();
    this.setEngine('ai.engineWaiting');
    try {
      if (!this.conversationId) {
        const languages = { vi: 'Vietnamese', en: 'English', ja: 'Japanese' };
        const created = await slanguageApi<{ id: string }>('/api/v1/chat-ai/conversations', {
          method: 'POST',
          body: { title: text.slice(0, 100), language_code: languages[this.currentLang], practice_mode: 'free-chat' },
        });
        if (!created.data?.id) throw new Error(t('ai.errNoConversation'));
        this.conversationId = created.data.id;
      }
      const response = await slanguageApi<{ ai_response: string; ai_feedback?: string | null }>(
        '/api/v1/chat-ai/send-message',
        { method: 'POST', body: { conversation_id: this.conversationId, user_message: text } },
      );
      const reply = response.data?.ai_response;
      if (typeof reply !== 'string' || !reply.trim()) throw new Error(t('ai.errNoReply'));
      const tip = this.formatFeedback(response.data.ai_feedback);
      this.removeTypingIndicator();
      this.renderMessage({ id: 'bot_' + Date.now(), sender: 'bot', text: reply, tip, timestamp: this.getFormattedTime() });
      this.triggerAICharacterResponse(reply, undefined, tip);
      this.speakText(reply, this.langMetadata[this.currentLang].locale);
      this.awardXP();
      this.setEngine('ai.engineDone');
    } catch (error) {
      document.getElementById(userId)?.remove();
      this.chatInputEl.value = text;
      this.stopCharacterTalking();
      const message = error instanceof Error ? error.message : t('ai.errConnect');
      this.setEngineRaw(message);
      this.showToast(message);
    } finally {
      this.removeTypingIndicator();
      this.isPending = false;
      this.updateInputControls();
    }
  }

  private formatFeedback(feedback?: string | null): string {
    if (!feedback) return '';
    try {
      const value = JSON.parse(feedback);
      return ['grammar_error', 'corrected_sentence', 'natural_suggestion']
        .map(key => typeof value?.[key] === 'string' ? value[key].trim() : '')
        .filter(Boolean).join('\n');
    } catch {
      return feedback;
    }
  }

  private updateInputControls(): void {
    const busy = this.isPending || this.isRecording;
    this.chatInputEl.disabled = busy;
    this.sendBtnEl.disabled = busy;
    this.micBtnEl.disabled = this.isPending;
    document.querySelectorAll<HTMLButtonElement>('.ai-mode-btn, .suggestion-chip, #btnClearChat')
      .forEach(button => { button.disabled = busy; });
  }

  private renderMessage(msg: ChatMessage): void {
    const row = document.createElement('div');
    row.className = `chat-msg-row ${msg.sender}`;
    row.id = msg.id;

    const avatar = document.createElement('div');
    avatar.className = 'msg-avatar';
    avatar.innerHTML = msg.sender === 'bot'
      ? '<i class="fa-solid fa-robot"></i>'
      : this.userAvatarUrl
        ? `<img class="msg-avatar-img" src="${this.escapeHtml(this.userAvatarUrl)}" alt="${this.escapeHtml(t('ai.you'))}">`
        : '<i class="fa-solid fa-user"></i>';

    const body = document.createElement('div');
    body.className = 'msg-body';

    const meta = document.createElement('div');
    meta.className = 'msg-meta';
    const author = msg.sender === 'bot' 
      ? this.langMetadata[this.currentLang].aiName 
      : (document.getElementById('headerUserName')?.textContent || t('ai.you'));
    meta.innerHTML = `<span class="msg-author">${this.escapeHtml(author)}</span> • <span>${this.escapeHtml(msg.timestamp)}</span>`;

    const bubble = document.createElement('div');
    bubble.className = 'msg-bubble';

    let bubbleContent = `<div>${this.escapeHtml(msg.text)}</div>`;

    if (msg.romajiOrPhonetic) {
      bubbleContent += `<div style="font-size: 0.88rem; color: #38bdf8; margin-top: 6px; font-style: italic;"><i class="fa-solid fa-language"></i> ${this.escapeHtml(msg.romajiOrPhonetic)}</div>`;
    }

    if (msg.translation) {
      bubbleContent += `<div style="font-size: 0.9rem; color: #cbd5e1; margin-top: 6px; border-top: 1px dashed rgba(255,255,255,0.1); padding-top: 6px;"><i class="fa-solid fa-circle-check" style="color: #4ade80;"></i> ${this.escapeHtml(msg.translation)}</div>`;
    }

    if (msg.tip) {
      bubbleContent += `<div class="msg-tip-card"><i class="fa-solid fa-lightbulb" style="color: #fbbf24;"></i> ${this.escapeHtml(msg.tip)}</div>`;
    }

    if (msg.sender === 'bot') {
      bubbleContent += `
        <div class="bot-action-bar">
          <button class="btn-speak-msg" data-text="${this.escapeHtml(msg.text)}" title="${this.escapeHtml(t('ai.speakTitle'))}">
            <i class="fa-solid fa-volume-high"></i> <span data-i18n="ai.speakBtn">${this.escapeHtml(t('ai.speakBtn'))}</span>
          </button>
          <span class="msg-tag-badge" data-i18n="ai.lang.${this.currentLang}">${this.escapeHtml(this.langName())}</span>
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
    this.stageStatus = 'thinking';
    this.updateStageStatus();

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
      <span data-i18n="ai.typing" style="font-size: 0.8rem; color: #94a3b8; margin-left: 8px;">${this.escapeHtml(t('ai.typing'))}</span>
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
        this.comicBubbleTipEl.innerHTML = `<i class="fa-solid fa-lightbulb"></i> ${this.escapeHtml(tip)}`;
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
    this.stageStatus = 'talking';
    this.updateStageStatus();
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
    this.stageStatus = 'listening';
    this.updateStageStatus();
  }

  private speakText(text: string, locale: string): void {
    if (!this.voiceEnabled) return;

    // Clean text from translation or tags if present
    const clean = text.split('\n')[0].replace(/<[^>]*>?/gm, '');
    if (this.voicesReady && this.selectedVoiceId()) {
      void this.speakWithAdsup(clean);
      return;
    }
    this.speakWithBrowser(clean, locale);
  }

  private async loadVoiceTones(): Promise<void> {
    try {
      const res = await slanguageApi<{ voices: VoiceOption[]; defaults: Record<string, string> }>(
        '/api/v1/chat-ai/tts/voices',
      );
      for (const lang of ['ja', 'en', 'vi'] as TargetLang[]) {
        this.adsupVoices[lang] = res.data.voices.filter(v => v.language === lang);
      }
      this.adsupDefaults = res.data.defaults;
      this.voicesReady = true;
      this.renderVoiceToneOptions();
    } catch {
      this.voicesReady = false;
      this.voiceToneSelectEl.disabled = true;
      this.btnPreviewVoiceEl.disabled = true;
      this.voiceToneHelpEl.dataset.i18n = 'ai.voiceToneHelpFail';
      this.voiceToneHelpEl.textContent = t('ai.voiceToneHelpFail');
    }
  }

  private renderVoiceToneOptions(): void {
    const list = this.adsupVoices[this.currentLang];
    this.voiceToneSelectEl.innerHTML = '';
    if (!this.voicesReady || !list.length) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = t('ai.voiceBrowserDefault');
      this.voiceToneSelectEl.appendChild(opt);
      this.voiceToneSelectEl.disabled = true;
      this.btnPreviewVoiceEl.disabled = true;
      return;
    }
    this.voiceToneSelectEl.disabled = false;
    this.btnPreviewVoiceEl.disabled = false;
    for (const voice of list) {
      const opt = document.createElement('option');
      opt.value = voice.id;
      opt.textContent = `${voice.name} • ${voice.gender === 'female' ? t('ai.voiceFemale') : t('ai.voiceMale')}${voice.category_name ? ` • ${voice.category_name}` : ''}`;
      this.voiceToneSelectEl.appendChild(opt);
    }
    const saved = localStorage.getItem(`slanguage_ai_voice_${this.currentLang}`);
    const fallback = this.adsupDefaults[this.currentLang];
    this.voiceToneSelectEl.value =
      saved && list.some(v => v.id === saved) ? saved
      : fallback && list.some(v => v.id === fallback) ? fallback
      : list[0].id;
  }

  private selectedVoiceId(): string | null {
    if (!this.voicesReady) return null;
    return this.voiceToneSelectEl.value || this.adsupDefaults[this.currentLang] || null;
  }

  private async previewSelectedVoice(): Promise<void> {
    const id = this.selectedVoiceId();
    if (!id) return;
    try {
      this.previewAudio?.pause();
      const blob = await slanguageApiAudio(`/api/v1/chat-ai/tts/voices/${id}/preview`, undefined, 'GET');
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      this.previewAudio = audio;
      audio.onended = () => URL.revokeObjectURL(url);
      await audio.play();
    } catch {
      this.showToast(t('ai.toastPreviewFail'));
    }
  }

  private async speakWithAdsup(clean: string): Promise<void> {
    const backendLanguage = ({ ja: 'Japanese', en: 'English', vi: 'Vietnamese' } as const)[this.currentLang];
    try {
      this.activeAudio?.pause();
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
      const blob = await slanguageApiAudio('/api/v1/chat-ai/tts', {
        text: clean,
        language: backendLanguage,
        voice_id: this.selectedVoiceId(),
        speed: this.voiceRate,
      });
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      this.activeAudio = audio;
      audio.onended = () => {
        URL.revokeObjectURL(url);
        this.stopCharacterTalking();
      };
      audio.onerror = () => {
        URL.revokeObjectURL(url);
        this.stopCharacterTalking();
      };
      await audio.play();
    } catch {
      this.speakWithBrowser(clean, this.langMetadata[this.currentLang].locale);
    }
  }

  private speakWithBrowser(clean: string, locale: string): void {
    if (!('speechSynthesis' in window)) {
      this.stopCharacterTalking();
      return;
    }
    window.speechSynthesis.cancel();
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
      this.showToast(t('ai.toastXp', { xp: newXP }));
    }
  }

  private saveSettings(): void {
    this.showToast(t('ai.toastSettingsSaved'));

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
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
}

// Instantiate and expose globally
document.addEventListener('DOMContentLoaded', () => {
  window.aiPracticeApp = new AIPracticeManager();
});
export {};
