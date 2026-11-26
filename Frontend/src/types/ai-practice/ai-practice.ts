/**
 * Slanguage - AI Practice Module (Luyện tập giao tiếp với AI)
 * Multi-language conversational AI Tutor (English, Japanese, Vietnamese)
 * Supports Speech-to-Text (Mic), Text-to-Speech (Audio Voice), Grammar Corrections & XP Rewards.
 */

import { isLearnerAuthenticated, slanguageApi, slanguageApiAudio, slanguageApiStream } from '../shared/api-client';
import { bindMobileSideDrawer, initializeLearnerHeader, logoutLearner } from '../shared/learner-header';
import { bindPageTransitions } from '../shared/page-transition';
import {
  submitPronunciationTurn,
  transcribeVoiceMessage,
  type PronunciationTurnFeedback,
} from '../shared/speech-api';
import { RiveCharacterLipSync } from './rive-lipsync';
import { applyI18n, getLocale, setLocale, t, LOCALE_EVENT, type UiLocale } from '../shared/i18n';

// Global Window Speech Recognition Types
interface IWindow extends Window {
  SpeechRecognition?: any;
  webkitSpeechRecognition?: any;
  aiPracticeApp?: AIPracticeManager;
}

declare const window: IWindow;

type PracticeMode = 'free' | 'pronounce';
type TargetLang = 'ja' | 'en' | 'vi';
type StageStatus = 'ready' | 'thinking' | 'talking' | 'listening';

interface ChatMessage {
  id: string;
  sender: 'bot' | 'user';
  text: string;
  romajiOrPhonetic?: string;
  translation?: string;
  tip?: string;
  feedback?: GrammarFeedback | null;
  timestamp: string;
  isPendingVoice?: boolean;
}

interface GrammarFeedback {
  grammarError: string;
  corrected: string;
  natural: string;
  pronunciationScore?: number | null;
  pronunciationFeedback?: string;
  nextTopic?: string;
  comment?: string;
}

interface RevealTarget {
  el: HTMLElement;
  full: string;
  onDone?: () => void;
}

interface HistoryConversation {
  id: string;
  title?: string | null;
  language_code?: string | null;
  practice_mode?: string | null;
  updated_at?: string | null;
}

interface HistoryMessage {
  id: string;
  sender_type: string;
  content: string;
  ai_feedback?: string | null;
  created_at?: string | null;
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

class AIPracticeManager {
  private currentLang: TargetLang = 'ja';
  private currentMode: PracticeMode = 'free';
  private conversationId: string | null = null;
  private isPending: boolean = false;
  private voiceEnabled: boolean = true;
  private voiceRate: number = 1.0;
  private aiQuotaUsed: number = 0;
  private aiQuotaLimit: number = 50;
  private isRecording: boolean = false;
  private speechRecognizer: any = null;
  private micHeld = false;
  private micPointerId: number | null = null;
  private micKey: string | null = null;
  private micReleasePending = false;
  private micDraft = '';
  private micTranscript = '';
  private micSessionTranscript = '';
  private mediaStream: MediaStream | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private recordRequestId = 0;
  private recordChunks: Blob[] = [];
  private recordStartedAt = 0;
  // Người dùng tự lướt lên thì không được kéo khung chat nhảy xuống nữa.
  private stickToBottom = true;

  private readonly langMetadata: Record<TargetLang, LanguageMeta> = {
    ja: {
      code: 'ja',
      locale: 'ja-JP',
      aiName: 'Sal7'
    },
    en: {
      code: 'en',
      locale: 'en-US',
      aiName: 'Sal7'
    },
    vi: {
      code: 'vi',
      locale: 'vi-VN',
      aiName: 'Sal7'
    }
  };

  // DOM Elements
  private chatMessagesEl!: HTMLElement;
  private chatInputEl!: HTMLTextAreaElement;
  private sendBtnEl!: HTMLButtonElement;
  private micBtnEl!: HTMLButtonElement;
  private waveVisualizerEl!: HTMLElement;
  private waveLabelEl: HTMLElement | null = null;
  private jumpBtnEl: HTMLElement | null = null;
  private suggestionsRowEl: HTMLElement | null = null;
  private suggestionsListEl!: HTMLElement;
  private quotaUsedEl!: HTMLElement;
  private remainingQuotaEl!: HTMLElement;
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
  private riveCanvasEl!: HTMLCanvasElement;
  private soundtrackEl!: HTMLAudioElement;
  private characterBoxEl: HTMLElement | null = null;
  private lipSync: RiveCharacterLipSync | null = null;
  private comicBubbleEl!: HTMLElement;
  private aiStatusIndicatorEl!: HTMLElement;
  private aiStatusLabelEl!: HTMLElement;
  private chatHeaderDotEl: HTMLElement | null = null;
  private chatHeaderStatusEl: HTMLElement | null = null;
  private characterTalkingTimer: any = null;
  private currentAIResponseText: string = '';
  private historyPanelEl: HTMLElement | null = null;
  private historyListEl: HTMLElement | null = null;

  // Hiển thị chữ dần theo giọng nói
  private revealTimer: number | null = null;
  private revealFallback: number | null = null;
  private revealEl: HTMLElement | null = null;
  private revealFull = '';
  private revealPos = 0;
  private revealDone: (() => void) | null = null;

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
    void this.refreshQuota();
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
    const map: Record<StageStatus, [string, string, string]> = {
      ready: ['', 'ai.statusReady', 'ai.chatStatusReady'],
      thinking: ['🟡 ', 'ai.statusThinking', 'ai.chatStatusThinking'],
      talking: ['🔴 ', 'ai.statusTalking', 'ai.chatStatusTalking'],
      listening: ['🟢 ', 'ai.statusListening', 'ai.chatStatusListening'],
    };
    const [emoji, statusKey, chatKey] = map[this.stageStatus];
    if (this.aiStatusLabelEl) {
      this.aiStatusLabelEl.textContent = emoji + t(statusKey);
    }
    if (this.chatHeaderStatusEl) {
      this.chatHeaderStatusEl.textContent = t(chatKey);
    }
    // Chấm trạng thái khung chat nhấp nháy khi Sal7 đang xử lý hoặc đang nói.
    const busy = this.stageStatus === 'thinking' || this.stageStatus === 'talking';
    this.chatHeaderDotEl?.classList.toggle('talking', busy);
  }

  private refreshDynamicChrome(): void {
    document.title = t('ai.pageTitle');
    this.engineIndicatorEl.textContent = this.engineRaw ?? t(this.engineKey);
    this.updateStageStatus();
    if (this.micUnsupported) this.micBtnEl.title = t('ai.micUnsupported');
    this.applyModeUI();
    this.renderVoiceToneOptions();
    this.chatMessagesEl.querySelectorAll<HTMLImageElement>('.msg-avatar-img').forEach((img) => {
      img.alt = t('ai.you');
    });
    this.chatMessagesEl.querySelectorAll<HTMLButtonElement>('.btn-speak-msg').forEach((btn) => {
      btn.title = t('ai.speakTitle');
    });
  }

  /**
   * Đồng bộ UI theo chế độ.
   * - Đàm thoại: gõ chữ hoặc nói, AI chỉ trả lời lời thoại, không tự bật giọng đọc.
   * - Phát Âm & Chính tả: chỉ nói, AI chấm câu rồi tự mở mic cho nội dung kế tiếp.
   */
  private applyModeUI(): void {
    const speak = this.currentMode === 'pronounce';
    this.chatInputEl.placeholder = t(speak ? 'ai.inputPlaceholderSpeak' : 'ai.inputPlaceholder');
    this.suggestionsRowEl?.classList.toggle('is-hidden', speak);

    const waveKey = speak ? 'ai.waveLabelSpeak' : 'ai.waveLabel';
    if (this.waveLabelEl) {
      this.waveLabelEl.dataset.i18n = waveKey;
      this.waveLabelEl.textContent = t(waveKey);
    }
    const hintEl = document.querySelector<HTMLElement>('.input-hint [data-i18n]');
    if (hintEl) {
      const hintKey = speak ? 'ai.inputHintSpeak' : 'ai.inputHint';
      hintEl.dataset.i18n = hintKey;
      hintEl.textContent = t(hintKey);
    }
    if (!this.micUnsupported) {
      const micKey = speak ? 'ai.micTap' : 'ai.micHold';
      this.micBtnEl.dataset.i18nTitle = micKey;
      this.micBtnEl.dataset.i18nAriaLabel = micKey;
      this.micBtnEl.title = t(micKey);
      this.micBtnEl.setAttribute('aria-label', t(micKey));
    }

    const voiceKey = speak ? 'ai.voiceToggleTitle' : 'ai.voiceFreeHint';
    this.voiceToggleBtnEl.disabled = !speak;
    this.voiceToggleBtnEl.dataset.i18nTitle = voiceKey;
    this.voiceToggleBtnEl.title = t(voiceKey);
    const labelKey = speak
      ? (this.voiceEnabled ? 'ai.voiceOn' : 'ai.voiceOff')
      : 'ai.voiceMutedFree';
    this.voiceToggleIconEl.className = speak && this.voiceEnabled
      ? 'fa-solid fa-volume-high'
      : 'fa-solid fa-volume-xmark';
    this.voiceToggleTextEl.dataset.i18n = labelKey;
    this.voiceToggleTextEl.textContent = t(labelKey);
    this.voiceToggleBtnEl.classList.toggle('active', speak && this.voiceEnabled);

    this.updateInputControls();
  }

  private initDOM(): void {
    this.chatMessagesEl = document.getElementById('chatMessages') as HTMLElement;
    this.chatInputEl = document.getElementById('chatInputText') as HTMLTextAreaElement;
    this.sendBtnEl = document.getElementById('btnSendMessage') as HTMLButtonElement;
    this.micBtnEl = document.getElementById('btnMicRecord') as HTMLButtonElement;
    this.waveVisualizerEl = document.getElementById('audioWaveVisualizer') as HTMLElement;
    this.waveLabelEl = this.waveVisualizerEl.querySelector<HTMLElement>('.wave-label');
    this.jumpBtnEl = document.getElementById('btnJumpLatest');
    this.suggestionsRowEl = document.getElementById('quickSuggestions');
    this.suggestionsListEl = document.getElementById('suggestionChipsList') as HTMLElement;
    this.quotaUsedEl = document.getElementById('practiceSessionCount') as HTMLElement;
    this.remainingQuotaEl = document.getElementById('remainingQuotaCount') as HTMLElement;
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

    // Nhân vật Rive + audio dùng chung cho khớp khẩu hình
    this.riveCanvasEl = document.getElementById('riveCanvas') as HTMLCanvasElement;
    this.soundtrackEl = document.getElementById('aiSoundtrack') as HTMLAudioElement;
    this.comicBubbleEl = document.getElementById('comicSpeechBubble') as HTMLElement;
    this.aiStatusIndicatorEl = document.getElementById('aiStatusIndicator') as HTMLElement;
    this.aiStatusLabelEl = document.getElementById('aiStatusLabel') as HTMLElement;
    this.chatHeaderDotEl = document.getElementById('chatHeaderDot');
    this.chatHeaderStatusEl = document.getElementById('chatHeaderStatusText');
    this.historyPanelEl = document.getElementById('aiHistoryPanel');
    this.historyListEl = document.getElementById('aiHistoryList');

    this.characterBoxEl = document.getElementById('aiCharacterBox');

    if (this.riveCanvasEl) {
      this.lipSync = new RiveCharacterLipSync(this.riveCanvasEl, this.soundtrackEl ?? null);
    }
  }

  private loadUserData(): void {
    const savedLang = (localStorage.getItem('slanguage_current_lang') || localStorage.getItem('slanguage_active_language') || 'ja') as TargetLang;
    if (savedLang && ['ja', 'en', 'vi'].includes(savedLang)) {
      this.currentLang = savedLang;
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
        profile: {
          display_name?: string | null;
          email: string;
          avatar_url?: string | null;
          target_language?: string | null;
        };
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
      // Mic phải nghe đúng ngôn ngữ đang học; localStorage chỉ là giá trị tạm thời.
      const target = profile.target_language;
      if (target === 'ja' || target === 'en' || target === 'vi') {
        this.setLearningLanguage(target);
      }
    } catch {
      // Không tải được hồ sơ thì giữ tên/avatar mặc định
    }
  }

  /** Đổi ngôn ngữ HỌC (khác ngôn ngữ giao diện) — mic, TTS và đề bài phụ thuộc vào đây. */
  private setLearningLanguage(code: TargetLang): void {
    if (code === this.currentLang) return;
    this.currentLang = code;
    localStorage.setItem('slanguage_current_lang', code);
    localStorage.setItem('slanguage_active_language', code);
    this.renderVoiceToneOptions();
    if (!this.hasUserMessages()) this.resetConversation();
  }

  private hasUserMessages(): boolean {
    return Boolean(this.chatMessagesEl.querySelector('.chat-msg-row.user'));
  }

  private bindEvents(): void {
    // Send Message
    this.sendBtnEl.addEventListener('click', () => {
      if (this.isRecording) {
        this.stopRecordSession();
        return;
      }
      this.handleSendMessage();
    });
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
      // Chế độ Phát Âm & Chính tả dùng mic theo kiểu bấm một lần để bật, bấm lần nữa để gửi.
      if (this.currentMode === 'pronounce') return;
      if (event.button !== 0 || !event.isPrimary || this.isRecording || this.isPending) {
        event.preventDefault();
        return;
      }
      event.preventDefault();
      this.micBtnEl.setPointerCapture(event.pointerId);
      this.micPointerId = event.pointerId;
      this.micReleasePending = false;
      void this.startRecordSession();
    });
    this.micBtnEl.addEventListener('pointerup', (event) => {
      if (this.currentMode === 'pronounce') return;
      if (event.pointerId !== this.micPointerId) return;
      event.preventDefault();
      this.micPointerId = null;
      this.releaseMicHold();
    });
    this.micBtnEl.addEventListener('pointercancel', () => this.cancelMicHold());
    this.micBtnEl.addEventListener('lostpointercapture', () => {
      if (this.micPointerId !== null) this.cancelMicHold();
    });
    this.micBtnEl.addEventListener('contextmenu', (event) => event.preventDefault());
    this.micBtnEl.addEventListener('click', (event) => {
      if (this.isPending) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (this.currentMode === 'pronounce') {
        this.toggleRecordSession();
        return;
      }
      if (this.isRecording) {
        this.stopRecordSession();
      }
    });
    this.micBtnEl.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') this.cancelMicHold();
      if (event.code !== 'Space' && event.code !== 'Enter') return;
      event.preventDefault();
      if (event.repeat) return;
      if (this.isPending) return;
      if (this.currentMode === 'pronounce') {
        this.toggleRecordSession();
        return;
      }
      if (this.isRecording) {
        this.stopRecordSession();
        return;
      }
      this.micKey = event.code;
      this.micReleasePending = false;
      void this.startRecordSession();
    });
    this.micBtnEl.addEventListener('keyup', (event) => {
      if (event.code !== this.micKey) return;
      event.preventDefault();
      this.micKey = null;
      this.releaseMicHold();
    });
    this.micBtnEl.addEventListener('blur', () => {
      if (this.micKey) this.cancelMicHold();
    });
    window.addEventListener('blur', () => this.cancelMicHold());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.cancelMicHold();
    });

    // Giữ nguyên vị trí lướt của người dùng khi tin nhắn mới về.
    this.chatMessagesEl.addEventListener('scroll', () => {
      this.stickToBottom = this.isNearBottom();
      if (this.stickToBottom) this.hideJumpPill();
    }, { passive: true });
    this.jumpBtnEl?.addEventListener('click', () => {
      this.stickToBottom = true;
      this.scrollToBottom(true);
    });

    // Practice Mode Switch
    document.querySelectorAll('.ai-mode-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        if (this.isPending) return;
        const target = (e.currentTarget as HTMLElement);
        const mode = target.getAttribute('data-mode') as PracticeMode;
        if (mode && mode !== this.currentMode) {
          this.cancelMicHold();
          document.querySelectorAll('.ai-mode-btn').forEach((b) => b.classList.remove('active'));
          target.classList.add('active');
          this.currentMode = mode;
          this.applyModeUI();
          this.resetConversation();
        }
      });
    });

    // Voice Output Toggle — chỉ có tác dụng ở chế độ Phát Âm & Chính tả.
    this.voiceToggleBtnEl.addEventListener('click', () => {
      if (this.currentMode !== 'pronounce') return;
      this.voiceEnabled = !this.voiceEnabled;
      this.lipSync?.setMuted(!this.voiceEnabled);
      this.applyModeUI();
      this.showToast(t(this.voiceEnabled ? 'ai.toastVoiceOn' : 'ai.toastVoiceOff'));
    });

    // Clear Chat (nằm ở đầu khung hội thoại)
    const btnClearChat = document.getElementById('btnClearChatHistory');
    if (btnClearChat) {
      btnClearChat.addEventListener('click', () => {
        if (this.isPending) return;
        this.resetConversation();
        this.showToast(t('ai.toastCleared'));
      });
    }

    // Lịch sử hội thoại
    document.getElementById('btnOpenHistory')?.addEventListener('click', () => void this.toggleHistory());
    document.getElementById('btnCloseHistory')?.addEventListener('click', () => this.closeHistory());
    document.getElementById('btnHistoryNew')?.addEventListener('click', () => {
      if (this.isPending || this.isRecording) return;
      this.resetConversation();
      this.closeHistory();
    });

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

    // Logout (dropdown tài khoản + drawer di động)
    document.querySelectorAll('#navLogoutItem, #drawerLogoutBtn').forEach((logoutBtn) => {
      logoutBtn.addEventListener('click', (e) => {
        e.preventDefault();
        void logoutLearner();
      });
    });

    // Trang này tự binding dropdown nên drawer + màn hình chuyển trang nạp ở đây.
    bindMobileSideDrawer();
    bindPageTransitions();
  }

  private resetConversation(): void {
    if (this.isPending || this.isRecording) return;
    this.conversationId = null;
    this.speechRecognizer?.abort();
    this.stopSpeechRecognition();
    this.abandonRecordSession();
    this.activeAudio?.pause();
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    this.stopReveal();
    this.stopCharacterTalking();
    this.closeHistory();
    this.stickToBottom = true;
    this.hideJumpPill();
    this.chatMessagesEl.innerHTML = '';
    this.setEngine('ai.engineReset');
    this.renderWelcomeGreeting();
  }

  private closeHistory(): void {
    if (this.historyPanelEl) this.historyPanelEl.hidden = true;
  }

  private async toggleHistory(): Promise<void> {
    if (!this.historyPanelEl) return;
    if (this.historyPanelEl.hidden) await this.openHistory();
    else this.closeHistory();
  }

  private async openHistory(): Promise<void> {
    if (!this.historyPanelEl || !this.historyListEl) return;
    this.historyPanelEl.hidden = false;
    this.historyListEl.innerHTML = `<div class="ai-history-note">${this.escapeHtml(t('ai.historyLoading'))}</div>`;
    let items: HistoryConversation[] = [];
    try {
      const res = await slanguageApi<HistoryConversation[]>('/api/v1/chat-ai/conversations?limit=30');
      items = Array.isArray(res.data) ? res.data : [];
    } catch (error) {
      const message = error instanceof Error ? error.message : t('ai.historyFailed');
      this.historyListEl.innerHTML = `<div class="ai-history-note">${this.escapeHtml(message)}</div>`;
      return;
    }

    if (!items.length) {
      this.historyListEl.innerHTML = `<div class="ai-history-note">${this.escapeHtml(t('ai.historyEmpty'))}</div>`;
      return;
    }

    this.historyListEl.innerHTML = '';
    for (const convo of items) {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'ai-history-item';
      if (convo.id === this.conversationId) item.classList.add('is-current');

      const title = document.createElement('span');
      title.className = 'ai-history-item-title';
      title.textContent = convo.title?.trim() || t('ai.historyUntitled');

      const meta = document.createElement('span');
      meta.className = 'ai-history-item-meta';
      const lang = document.createElement('span');
      lang.className = 'ai-history-item-lang';
      lang.textContent = this.historyLangLabel(convo.language_code);
      const when = document.createElement('span');
      when.textContent = this.formatHistoryDate(convo.updated_at);
      meta.appendChild(lang);
      meta.appendChild(when);

      item.appendChild(title);
      item.appendChild(meta);
      item.addEventListener('click', () => void this.loadConversation(convo.id));
      this.historyListEl.appendChild(item);
    }
  }

  private historyLangLabel(code?: string | null): string {
    const key = ({ English: 'ai.lang.en', Japanese: 'ai.lang.ja', Vietnamese: 'ai.lang.vi' } as Record<string, string>)[code ?? ''];
    return key ? t(key) : (code || '-');
  }

  private formatHistoryDate(value?: string | null): string {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleString(getLocale() === 'vi' ? 'vi-VN' : getLocale() === 'ja' ? 'ja-JP' : 'en-US', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  /** Mở lại một đoạn hội thoại cũ: chỉ đọc, không gửi tin nhắn khi đang chờ AI. */
  private async loadConversation(id: string): Promise<void> {
    if (!this.historyListEl) return;
    this.historyListEl.innerHTML = `<div class="ai-history-note">${this.escapeHtml(t('ai.historyLoading'))}</div>`;
    let messages: HistoryMessage[] = [];
    try {
      const res = await slanguageApi<HistoryMessage[]>(
        `/api/v1/chat-ai/conversations/${encodeURIComponent(id)}/messages?limit=500`,
      );
      messages = Array.isArray(res.data) ? res.data : [];
    } catch (error) {
      const message = error instanceof Error ? error.message : t('ai.historyFailed');
      this.historyListEl.innerHTML = `<div class="ai-history-note">${this.escapeHtml(message)}</div>`;
      return;
    }

    this.stopReveal();
    this.activeAudio?.pause();
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    this.stopCharacterTalking();
    this.conversationId = id;
    this.chatMessagesEl.innerHTML = '';
    for (const row of messages) {
      const sender = row.sender_type === 'user' ? 'user' : 'bot';
      const parsed: { text: string; translation?: string } = sender === 'bot'
        ? this.splitTranslation(this.stripFeedbackLeak(row.content ?? ''))
        : { text: row.content ?? '' };
      this.renderMessage({
        id: 'hist_' + row.id,
        sender,
        text: parsed.text,
        translation: parsed.translation,
        feedback: sender === 'bot' && this.currentMode === 'pronounce' ? this.parseFeedback(row.ai_feedback) : null,
        timestamp: this.formatHistoryTime(row.created_at)
      });
    }
    if (!messages.length) {
      this.renderWelcomeGreeting();
    }
    this.stickToBottom = true;
    this.scrollToBottom(true);
    this.closeHistory();
    this.setEngine('ai.engineHistory');
  }

  private formatHistoryTime(value?: string | null): string {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const h = String(date.getHours()).padStart(2, '0');
    const m = String(date.getMinutes()).padStart(2, '0');
    return `${h}:${m}`;
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
    this.stageStatus = 'listening';
    this.updateStageStatus();
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
      this.isRecording = false;
      this.micHeld = false;
      this.micPointerId = null;
      this.micKey = null;
      this.micReleasePending = false;
      this.micBtnEl.classList.remove('recording');
      this.micBtnEl.setAttribute('aria-pressed', 'false');
      this.waveVisualizerEl.style.display = 'none';

      if (transcript) {
        this.isPending = true;
        this.updateInputControls();
        this.chatInputEl.value = [this.micDraft, transcript].filter(Boolean).join(' ');
        void this.handleSendMessage();
      } else {
        this.isPending = false;
        this.updateInputControls();
        this.setEngine('ai.engineIdle');
        this.showToast(t('ai.toastNothingHeard'));
      }
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
    this.isPending = true;
    this.updateInputControls();
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
    this.micReleasePending = false;
    this.micBtnEl.classList.remove('recording');
    this.micBtnEl.setAttribute('aria-pressed', 'false');
    this.waveVisualizerEl.style.display = 'none';
    this.setEngine('ai.engineIdle');
    if (!this.isPending) {
      this.stageStatus = 'ready';
      this.updateStageStatus();
    }
    this.updateInputControls();
  }

  /** Thả mic ở chế độ Đàm thoại: dừng bản ghi (hoặc nhận diện) đang chạy để gửi đi. */
  private releaseMicHold(): void {
    if (this.mediaRecorder) {
      this.stopRecordSession();
      return;
    }
    if (this.speechRecognizer) {
      this.releaseSpeechRecognition();
      return;
    }
    // Chưa kịp mở bản ghi (đang chờ duyệt quyền micro): dừng ngay khi nó mở.
    this.micReleasePending = true;
    this.isPending = true;
    this.updateInputControls();
    this.setEngine('ai.engineFinishing');
  }

  /** Hủy lượt nói đang giữ mic mà không gửi lên backend. */
  private cancelMicHold(): void {
    const shouldClearPending = this.isPending && (
      this.isRecording
      || this.mediaRecorder !== null
      || this.micReleasePending
      || this.micPointerId !== null
      || this.micKey !== null
    );
    this.recordRequestId++;
    this.micReleasePending = false;
    this.micPointerId = null;
    this.micKey = null;
    this.abandonRecordSession();
    this.cancelSpeechRecognition();
    if (shouldClearPending) {
      this.isPending = false;
      this.stageStatus = 'ready';
      this.updateStageStatus();
      this.setEngine('ai.engineIdle');
      this.updateInputControls();
    }
  }

  /* --------- Ghi âm trực tiếp cho chế độ Phát Âm & Chính tả --------- */

  /** Bấm mic một lần để nói, bấm lần nữa để gửi; Sal7 tự bấm giúp sau mỗi lượt. */
  private toggleRecordSession(): void {
    if (this.isPending) return;
    if (this.mediaRecorder) this.stopRecordSession();
    else void this.startRecordSession();
  }

  private async startRecordSession(): Promise<void> {
    if (this.isPending || this.isRecording) return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      this.startSpeechRecognition();
      return;
    }
    const requestId = ++this.recordRequestId;
    this.activeAudio?.pause();
    this.previewAudio?.pause();
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    this.stopCharacterTalking();
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      if (requestId !== this.recordRequestId) return;
      this.showToast(t('ai.toastMicDenied'));
      return;
    }
    if (requestId !== this.recordRequestId) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }
    if (this.isRecording || this.mediaRecorder) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }
    this.mediaStream = stream;
    this.micDraft = this.chatInputEl.value;
    const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']
      .find((candidate) => MediaRecorder.isTypeSupported(candidate)) ?? '';
    this.recordChunks = [];
    this.mediaRecorder = mimeType
      ? new MediaRecorder(this.mediaStream, { mimeType })
      : new MediaRecorder(this.mediaStream);
    this.mediaRecorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) this.recordChunks.push(event.data);
    };
    this.mediaRecorder.onerror = () => {
      this.abandonRecordSession();
      this.stopSpeechRecognition();
      this.showToast(t('ai.toastMicInterrupted'));
    };
    this.mediaRecorder.onstop = () => this.finishRecordSession();
    this.mediaRecorder.start();
    this.recordStartedAt = Date.now();
    this.isRecording = true;
    this.micHeld = this.currentMode !== 'pronounce';
    this.stageStatus = 'listening';
    this.updateStageStatus();
    this.micBtnEl.classList.add('recording');
    this.micBtnEl.setAttribute('aria-pressed', 'true');
    this.waveVisualizerEl.style.display = 'flex';
    this.setEngine('ai.engineRecording');
    this.updateInputControls();
    // Thả mic trước khi bản ghi kịp mở: dừng ngay, bản ghi quá ngắn sẽ bị bỏ.
    if (this.micReleasePending) {
      this.micReleasePending = false;
      this.stopRecordSession();
    }
  }

  private stopRecordSession(): void {
    const recorder = this.mediaRecorder;
    if (!recorder) return;
    this.isPending = true;
    this.updateInputControls();
    this.setEngine('ai.engineFinishing');
    try {
      recorder.stop();
    } catch {
      this.abandonRecordSession();
      this.stopSpeechRecognition();
    }
  }

  private finishRecordSession(): void {
    const blob = new Blob(this.recordChunks, { type: this.recordChunks[0]?.type || 'audio/webm' });
    this.mediaRecorder = null;
    this.recordChunks = [];
    this.releaseStream();
    this.micBtnEl.classList.remove('recording');
    const tooShort = Date.now() - this.recordStartedAt < 700 || blob.size < 1500;
    this.stopSpeechRecognition();
    if (tooShort) {
      this.isPending = false;
      this.updateInputControls();
      this.stageStatus = 'ready';
      this.updateStageStatus();
      this.showToast(t('ai.toastNothingHeard'));
      return;
    }
    if (this.currentMode === 'pronounce') void this.submitPronunciation(blob);
    else void this.transcribeSpokenMessage(blob);
  }

  /** Đàm thoại: nói ngôn ngữ nào ra chữ ngôn ngữ đó (backend tự nhận diện, không dịch). */
  private async transcribeSpokenMessage(audio: Blob): Promise<void> {
    this.isPending = true;
    this.updateInputControls();
    this.setEngine('ai.voiceTranscribing');

    // === Hiện bóng chat user ngay lập tức với trạng thái "đang nhận diện" ===
    const pendingId = 'user_voice_' + Date.now();
    this.renderMessage({
      id: pendingId,
      sender: 'user',
      text: t('ai.voiceTranscribing'),
      isPendingVoice: true,
      timestamp: this.getFormattedTime(),
    });

    let transcript = '';
    let failure = '';
    try {
      await this.ensureConversation(t('ai.modeFree'));
      transcript = await transcribeVoiceMessage(this.conversationId as string, audio);
    } catch (error) {
      failure = error instanceof Error ? error.message : t('ai.errConnect');
    }

    if (failure) {
      // Xóa bóng chat pending, mở khóa mic
      document.getElementById(pendingId)?.remove();
      this.isPending = false;
      this.updateInputControls();
      this.setEngineRaw(failure);
      this.showToast(failure);
      return;
    }

    const fullText = [this.micDraft, transcript].filter(Boolean).join(' ').trim();
    if (!fullText) {
      document.getElementById(pendingId)?.remove();
      this.isPending = false;
      this.updateInputControls();
      this.setEngine('ai.engineIdle');
      this.showToast(t('ai.toastNothingHeard'));
      return;
    }

    // === Cập nhật bóng chat pending thành nội dung thực ===
    const pendingRow = document.getElementById(pendingId);
    if (pendingRow) {
      const textEl = pendingRow.querySelector('.msg-text');
      if (textEl) textEl.textContent = fullText;
      const pulseIcon = pendingRow.querySelector('.voice-pulse-icon');
      pulseIcon?.remove();
      pendingRow.classList.remove('is-pending-voice');
    }

    this.chatInputEl.value = '';
    this.chatInputEl.style.height = 'auto';

    // === Tiếp tục gửi tin nhắn tới AI (không qua handleSendMessage để tránh guard) ===
    this.showTypingIndicator();
    this.setEngine('ai.engineWaiting');
    try {
      await this.ensureConversation(fullText);
      await this.sendAndStreamMessage(fullText);
      void this.refreshQuota();
      this.setEngine('ai.engineDone');
    } catch (error) {
      document.getElementById(pendingId)?.remove();
      this.chatInputEl.value = fullText;
      this.stopReveal();
      this.stopCharacterTalking();
      const message = error instanceof Error ? error.message : t('ai.errConnect');
      this.setEngineRaw(message);
      this.showToast(message);
      void this.refreshQuota();
    } finally {
      this.removeTypingIndicator();
      this.isPending = false;
      this.updateInputControls();
    }
  }

  /** Hủy bản ghi đang chạy mà không gửi lên backend. */
  private abandonRecordSession(): void {
    const recorder = this.mediaRecorder;
    this.mediaRecorder = null;
    this.recordChunks = [];
    if (recorder && recorder.state !== 'inactive') {
      recorder.onstop = null;
      try {
        recorder.stop();
      } catch {
        // Recorder có thể đã dừng sẵn — bỏ qua vì kết quả sẽ không được dùng.
      }
    }
    this.releaseStream();
    this.micBtnEl.classList.remove('recording');
  }

  private releaseStream(): void {
    this.mediaStream?.getTracks().forEach((track) => track.stop());
    this.mediaStream = null;
  }

  private async submitPronunciation(audio: Blob): Promise<void> {
    if (this.isPending) return;
    this.isPending = true;
    this.updateInputControls();

    // === Hiện bóng chat user ngay lập tức ===
    const pendingId = 'user_pron_' + Date.now();
    this.renderMessage({
      id: pendingId,
      sender: 'user',
      text: t('ai.voiceAnalyzing'),
      isPendingVoice: true,
      timestamp: this.getFormattedTime(),
    });

    this.showTypingIndicator();
    this.setEngine('ai.engineWaiting');
    try {
      await this.ensureConversation(t('ai.modeSpeak'));
      const result = await submitPronunciationTurn(this.conversationId as string, audio);
      this.removeTypingIndicator();

      // Cập nhật bóng chat pending thành nội dung thực
      const pendingRow = document.getElementById(pendingId);
      if (pendingRow) {
        const textEl = pendingRow.querySelector('.msg-text');
        if (textEl) textEl.textContent = result.transcript;
        const pulseIcon = pendingRow.querySelector('.voice-pulse-icon');
        pulseIcon?.remove();
        pendingRow.classList.remove('is-pending-voice');
      }

      this.renderMessage({
        id: 'bot_' + Date.now(),
        sender: 'bot',
        text: result.ai_response,
        feedback: this.speakFeedback(result.ai_feedback),
        timestamp: this.getFormattedTime()
      }, true);
      void this.refreshQuota();
      this.setEngine('ai.engineDone');
    } catch (error) {
      document.getElementById(pendingId)?.remove();
      const message = error instanceof Error ? error.message : t('ai.errConnect');
      this.setEngineRaw(message);
      this.showToast(message);
      void this.refreshQuota();
    } finally {
      this.removeTypingIndicator();
      this.isPending = false;
      this.updateInputControls();
    }
  }

  private speakFeedback(feedback: PronunciationTurnFeedback): GrammarFeedback {
    return {
      grammarError: feedback.grammar_error || '',
      corrected: feedback.corrected_sentence || '',
      natural: feedback.natural_suggestion || '',
      pronunciationScore: typeof feedback.pronunciation_score === 'number'
        ? feedback.pronunciation_score
        : null,
      pronunciationFeedback: feedback.pronunciation_feedback || '',
      nextTopic: feedback.next_topic || '',
      comment: feedback.comment || ''
    };
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
      } else {
        greetingText = '発音・綴りモードです！マイクを押して、学んだ日本語の文を声に出してください。';
        romaji = 'Hatsuon / tsuzuri mōdo desu! Maiku o oshite, benkyō shita Nihongo no bun o koe ni dashite kudasai.';
        translation = 'Bạn đang ở chế độ Phát Âm & Chính tả! Bấm mic và nói to câu tiếng Nhật bạn vừa học.';
        tip = 'Sal7 tự mở mic sau mỗi lượt: nghe câu mẫu, nói theo rồi nhận điểm phát âm và chủ đề mới.';
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
      } else {
        greetingText = 'Pronunciation and spelling drill is ready. Tap the mic and say a sentence out loud.';
        translation = 'Chế độ Phát Âm & Chính tả đã sẵn sàng! Bấm mic và nói to một câu tiếng Anh bạn vừa học.';
        tip = 'Sal7 opens the mic for you after every turn: listen to the model sentence, say it, get scored.';
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
      } else {
        greetingText = 'Luyện Phát Âm & Chính tả: bấm mic rồi nói to câu bạn vừa học, mình sẽ chấm từng âm và sửa câu.';
        tip = 'Sau mỗi lượt Sal7 tự mở mic — bạn chỉ cần nghe câu mẫu rồi nói theo, không cần gõ chữ.';
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
    if (this.currentMode === 'pronounce') return;
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
      await this.ensureConversation(text);
      await this.sendAndStreamMessage(text);
      void this.refreshQuota();
      this.setEngine('ai.engineDone');
    } catch (error) {
      document.getElementById(userId)?.remove();
      this.chatInputEl.value = text;
      this.stopReveal();
      this.stopCharacterTalking();
      const message = error instanceof Error ? error.message : t('ai.errConnect');
      this.setEngineRaw(message);
      this.showToast(message);
      void this.refreshQuota();
    } finally {
      this.removeTypingIndicator();
      this.isPending = false;
      this.updateInputControls();
    }
  }

  /** Gửi tin nhắn qua SSE streaming và cập nhật bong bóng chat theo thời gian thực. */
  private async sendAndStreamMessage(userMessage: string): Promise<void> {
    const botId = 'bot_' + Date.now();
    let bubbleCreated = false;
    let streamedRaw = '';
    let finalReply = '';
    let streamError: string | null = null;

    try {
      await slanguageApiStream(
        '/api/v1/chat-ai/send-message-stream',
        {
          conversation_id: this.conversationId,
          user_message: userMessage,
        },
        (event) => {
          if (event.type === 'error') {
            streamError = event.message || t('ai.errConnect');
            return;
          }
          if (event.type === 'chunk' && event.delta) {
            if (!bubbleCreated) {
              this.removeTypingIndicator();
              this.renderMessage({
                id: botId,
                sender: 'bot',
                text: '',
                timestamp: this.getFormattedTime(),
              }, false);
              bubbleCreated = true;
            }
            streamedRaw += event.delta;
            const textEl = document.querySelector(`#${botId} .msg-text`);
            if (textEl) textEl.textContent = streamedRaw;
            this.scrollToBottom();
            return;
          }
          if (event.type === 'done') {
            finalReply = event.ai_response || streamedRaw;
          }
        },
      );
    } catch (err) {
      if (bubbleCreated) document.getElementById(botId)?.remove();
      throw err;
    }

    if (streamError) {
      if (bubbleCreated) document.getElementById(botId)?.remove();
      throw new Error(streamError);
    }

    const reply = finalReply || streamedRaw;
    if (!reply.trim()) throw new Error(t('ai.errNoReply'));

    this.removeTypingIndicator();
    if (bubbleCreated) document.getElementById(botId)?.remove();
    const { text: mainText, translation } = this.splitTranslation(this.stripFeedbackLeak(reply));
    this.renderMessage({
      id: botId,
      sender: 'bot',
      text: mainText,
      translation,
      timestamp: this.getFormattedTime(),
    }, false);
  }

  /** Tạo phòng hội thoại theo ngôn ngữ HỌC hiện tại nếu phiên chưa có phòng. */
  private async ensureConversation(title: string): Promise<void> {
    if (this.conversationId) return;
    const languages: Record<TargetLang, string> = { vi: 'Vietnamese', en: 'English', ja: 'Japanese' };
    const created = await slanguageApi<{ id: string }>('/api/v1/chat-ai/conversations', {
      method: 'POST',
      body: {
        title: title.slice(0, 100),
        language_code: languages[this.currentLang],
        practice_mode: 'free-chat',
      },
    });
    if (!created.data?.id) throw new Error(t('ai.errNoConversation'));
    this.conversationId = created.data.id;
  }

  /**
   * Backend tách khối [Feedback in Vietnamese] khỏi câu trả lời bằng dấu `---`.
   * Nếu model quên dấu phân cách thì khối JSON lọt vào ai_response, cắt bỏ ở đây.
   */
  private stripFeedbackLeak(text: string): string {
    const marker = text.indexOf('[Feedback in Vietnamese]');
    return (marker >= 0 ? text.slice(0, marker) : text).trim();
  }

  /** Tách phần trả lời bằng ngôn ngữ mục tiêu khỏi bản dịch tiếng Việt sau marker `[Bản dịch]`. */
  private splitTranslation(text: string): { text: string; translation?: string } {
    const marker = text.indexOf('[Bản dịch]');
    if (marker < 0) return { text: text.trim() };
    return {
      text: text.slice(0, marker).trim(),
      translation: text.slice(marker + '[Bản dịch]'.length).trim() || undefined,
    };
  }

  private parseFeedback(feedback?: string | null): GrammarFeedback | null {
    if (!feedback) return null;
    let value: any = null;
    try {
      value = JSON.parse(feedback);
    } catch {
      value = null;
    }
    if (!value || typeof value !== 'object') {
      const text = feedback.trim();
      if (!text || text === '{}') return null;
      return { grammarError: text, corrected: '', natural: '' };
    }
    const field = (key: string) => (typeof value[key] === 'string' ? value[key].trim() : '');
    const parsed: GrammarFeedback = {
      grammarError: field('grammar_error'),
      corrected: field('corrected_sentence'),
      natural: field('natural_suggestion'),
      pronunciationScore: typeof value.pronunciation_score === 'number' ? value.pronunciation_score : null,
      pronunciationFeedback: field('pronunciation_feedback'),
      nextTopic: field('next_topic'),
      comment: field('comment')
    };
    const hasText = Boolean(parsed.grammarError || parsed.corrected || parsed.natural
      || parsed.pronunciationFeedback || parsed.comment);
    if (!hasText && parsed.pronunciationScore === null) return null;
    return parsed;
  }

  private updateInputControls(): void {
    const busy = this.isPending || this.isRecording;
    const speakOnly = this.currentMode === 'pronounce';
    this.chatInputEl.disabled = busy || speakOnly;

    // Nút gửi: khi đang ghi âm thì được bật để bấm gửi/kết thúc bản ghi ngay
    if (this.isRecording) {
      this.sendBtnEl.disabled = this.isPending;
      this.sendBtnEl.classList.add('is-recording-send');
      this.sendBtnEl.title = t('ai.sendVoice') || 'Gửi bản ghi âm';
    } else {
      this.sendBtnEl.classList.remove('is-recording-send');
      this.sendBtnEl.disabled = this.isPending || speakOnly;
      this.sendBtnEl.title = '';
    }

    this.micBtnEl.disabled = this.isPending;
    this.micBtnEl.classList.toggle('is-disabled', this.isPending);
    // Đang ghi âm thì vẫn được đổi tab (bản ghi sẽ bị bỏ), chỉ khoá khi đang chờ backend.
    document.querySelectorAll<HTMLButtonElement>('.ai-mode-btn, #btnClearChatHistory, #btnOpenHistory')
      .forEach(button => { button.disabled = this.isPending; });
    document.querySelectorAll<HTMLButtonElement>('.suggestion-chip')
      .forEach(button => { button.disabled = busy; });
  }

  /** animate = true: bubble rỗng, chữ hiện dần theo giọng đọc, phần phụ hiện sau cùng. */
  private renderMessage(msg: ChatMessage, animate = false): void {
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

    const textEl = document.createElement('div');
    textEl.className = 'msg-text';

    // Nếu là bóng chat pending giọng nói → hiện icon pulse + text nhạt
    if (msg.isPendingVoice) {
      row.classList.add('is-pending-voice');
      const pulseIcon = document.createElement('i');
      pulseIcon.className = 'fa-solid fa-microphone voice-pulse-icon';
      const pendingSpan = document.createElement('span');
      pendingSpan.className = 'msg-pending-voice';
      pendingSpan.appendChild(pulseIcon);
      pendingSpan.appendChild(document.createTextNode(' ' + msg.text));
      textEl.appendChild(pendingSpan);
    } else {
      textEl.textContent = msg.text;
    }
    bubble.appendChild(textEl);

    let extrasHtml = '';

    if (msg.romajiOrPhonetic) {
      extrasHtml += `<div style="font-size: 0.88rem; color: #38bdf8; margin-top: 6px; font-style: italic;"><i class="fa-solid fa-language"></i> ${this.escapeHtml(msg.romajiOrPhonetic)}</div>`;
    }

    if (msg.translation) {
      extrasHtml += `<div style="font-size: 0.9rem; color: #cbd5e1; margin-top: 6px; border-top: 1px dashed rgba(255,255,255,0.1); padding-top: 6px;"><i class="fa-solid fa-circle-check" style="color: #4ade80;"></i> ${this.escapeHtml(msg.translation)}</div>`;
    }

    if (msg.tip) {
      extrasHtml += `<div class="msg-tip-card"><i class="fa-solid fa-lightbulb" style="color: #fbbf24;"></i> ${this.escapeHtml(msg.tip)}</div>`;
    }

    if (msg.feedback) {
      extrasHtml += this.renderFeedbackCard(msg.feedback);
    }

    if (msg.sender === 'bot') {
      extrasHtml += `
        <div class="bot-action-bar">
          <button class="btn-speak-msg" data-text="${this.escapeHtml(msg.text)}" title="${this.escapeHtml(t('ai.speakTitle'))}">
            <i class="fa-solid fa-volume-high"></i> <span data-i18n="ai.speakBtn">${this.escapeHtml(t('ai.speakBtn'))}</span>
          </button>
          <span class="msg-tag-badge" data-i18n="ai.lang.${this.currentLang}">${this.escapeHtml(this.langName())}</span>
        </div>
      `;
    }

    const extras = document.createElement('div');
    extras.className = 'msg-extras';
    extras.innerHTML = extrasHtml;
    bubble.appendChild(extras);

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

    if (animate) {
      textEl.textContent = '';
      extras.hidden = true;
      this.currentAIResponseText = msg.text;
      const revealTarget = {
        el: textEl,
        full: msg.text,
        onDone: () => {
          extras.hidden = false;
          this.scrollToBottom();
        }
      };
      // Sal7 đọc xong KHÔNG tự mở mic: người dùng tự bấm nút mic cho lượt kế tiếp.
      // Đàm thoại: chỉ hiện chữ, không bật giọng đọc.
      const useAutoVoice = this.voiceEnabled && this.currentMode === 'pronounce';
      if (!useAutoVoice) {
        this.hideBubble();
        this.stageStatus = 'ready';
        this.updateStageStatus();
        this.runReveal(revealTarget, this.estimateRevealMs(msg.text));
        return;
      }
      this.startCharacterTalking();
      const clean = msg.text.split('\n')[0].replace(/<[^>]*>?/gm, '').trim();
      this.armRevealFallback(revealTarget);
      if (this.voicesReady && this.selectedVoiceId()) void this.speakWithAdsup(clean, revealTarget);
      else this.speakWithBrowser(clean, this.langMetadata[this.currentLang].locale, revealTarget);
    }
  }

  private showTypingIndicator(): void {
    this.stageStatus = 'thinking';
    this.updateStageStatus();
    this.showBubbleTyping();

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

  /**
   * Chỉ tự xuống đáy khi người dùng đang đứng gần đáy. Khi họ đang lướt lại lịch sử,
   * tin nhắn mới hiện nút nhảy xuống thay vì giật khung chat về cuối.
   */
  private isNearBottom(): boolean {
    const el = this.chatMessagesEl;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 90;
  }

  private scrollToBottom(force = false): void {
    if (!force && !this.stickToBottom) {
      this.showJumpPill();
      return;
    }
    this.chatMessagesEl.scrollTo({ top: this.chatMessagesEl.scrollHeight, behavior: 'instant' as ScrollBehavior });
    this.stickToBottom = true;
    this.hideJumpPill();
  }

  private showJumpPill(): void {
    if (this.jumpBtnEl) this.jumpBtnEl.hidden = false;
  }

  private hideJumpPill(): void {
    if (this.jumpBtnEl) this.jumpBtnEl.hidden = true;
  }

  /** Bong bóng sân khấu: ba dấu chấm khi Sal7 đang chuẩn bị hoặc đang nói. */
  private showBubbleTyping(): void {
    if (!this.comicBubbleEl) return;
    this.comicBubbleEl.classList.remove('is-talking');
    this.comicBubbleEl.classList.add('active');
  }

  private hideBubble(): void {
    if (!this.comicBubbleEl) return;
    this.comicBubbleEl.classList.remove('active', 'is-talking');
  }

  private estimateRevealMs(text: string): number {
    return Math.min(Math.max(text.length * 72, 900), 22000) / Math.max(this.voiceRate, 0.6);
  }

  private clearReveal(): void {
    if (this.revealTimer !== null) window.clearInterval(this.revealTimer);
    this.revealTimer = null;
    if (this.revealFallback !== null) window.clearTimeout(this.revealFallback);
    this.revealFallback = null;
  }

  /** Bắt đầu gõ dần `target.full` vào `target.el` trong `ms`. */
  private runReveal(target: RevealTarget, ms: number): void {
    this.clearReveal();
    this.revealEl = target.el;
    this.revealFull = target.full;
    this.revealPos = target.el.textContent?.length ?? 0;
    this.revealDone = target.onDone ?? null;
    if (this.revealPos >= target.full.length) {
      this.completeReveal();
      return;
    }
    const from = this.revealPos;
    const startedAt = Date.now();
    const total = Math.max(250, ms);
    this.revealTimer = window.setInterval(() => {
      const k = Math.min(1, (Date.now() - startedAt) / total);
      this.applyReveal(Math.round(from + (target.full.length - from) * k));
      if (k >= 1) {
        if (this.revealTimer !== null) window.clearInterval(this.revealTimer);
        this.revealTimer = null;
        this.completeReveal();
      }
    }, 24);
  }

  private applyReveal(pos: number): void {
    if (!this.revealEl) return;
    this.revealPos = Math.max(0, Math.min(pos, this.revealFull.length));
    this.revealEl.textContent = this.revealFull.slice(0, this.revealPos);
    if (this.revealPos < this.revealFull.length) {
      const cursor = document.createElement('span');
      cursor.className = 'ai-msg-cursor';
      this.revealEl.appendChild(cursor);
    }
    // Dòng chữ mới mỗi giây làm khung chat phình ra: giữ đáy nếu người dùng đang ở đáy.
    this.scrollToBottom();
  }

  private completeReveal(): void {
    this.showAllReveal();
    const done = this.revealDone;
    this.revealDone = null;
    done?.();
  }

  /** Hiện toàn bộ chữ, xóa con trỏ nhưng giữ trạng thái reveal để not restart. */
  private showAllReveal(): void {
    if (this.revealEl && this.revealFull) {
      this.revealEl.textContent = this.revealFull;
      this.revealPos = this.revealFull.length;
    }
  }

  /** Kết thúc hẳn lượt hiển thị (dùng khi có lỗi, đổi phiên, bấm nghe lại). */
  private stopReveal(): void {
    this.clearReveal();
    this.showAllReveal();
    this.revealEl = null;
    this.revealFull = '';
    this.revealPos = 0;
    this.revealDone = null;
  }

  /** Giọng đọc chậm vào vẫn chưa kịp chạy chữ: tự hiện sau 4s. */
  private armRevealFallback(target: RevealTarget): void {
    this.clearReveal();
    this.revealEl = target.el;
    this.revealFull = target.full;
    this.revealPos = 0;
    this.revealDone = target.onDone ?? null;
    target.el.textContent = '';
    this.applyReveal(0);
    this.revealFallback = window.setTimeout(() => {
      this.revealFallback = null;
      if (this.revealTimer !== null || this.revealPos >= this.revealFull.length) return;
      this.runReveal(target, this.estimateRevealMs(target.full));
    }, 4000);
  }

  private startCharacterTalking(): void {
    if (this.characterTalkingTimer) clearTimeout(this.characterTalkingTimer);

    // Không có luồng audio để phân tích (browser speechSynthesis) thì mô phỏng khẩu hình.
    this.lipSync?.startSpeechSync();
    this.comicBubbleEl?.classList.add('active', 'is-talking');

    if (this.aiStatusIndicatorEl) {
      this.aiStatusIndicatorEl.classList.add('is-talking');
    }
    this.characterBoxEl?.classList.add('is-talking');
    this.stageStatus = 'talking';
    this.updateStageStatus();
  }

  private stopCharacterTalking(): void {
    if (this.characterTalkingTimer) clearTimeout(this.characterTalkingTimer);

    if (!this.soundtrackEl || this.soundtrackEl.paused) this.lipSync?.stopSpeechSync();
    this.hideBubble();
    this.completeRevealIfRunning();

    if (this.aiStatusIndicatorEl) {
      this.aiStatusIndicatorEl.classList.remove('is-talking');
    }
    this.characterBoxEl?.classList.remove('is-talking');
    this.stageStatus = this.isRecording ? 'listening' : 'ready';
    this.updateStageStatus();
  }

  /** Giọng đọc kết thúc sớm hơn dự kiến: hiện nốt phần chữ còn lại. */
  private completeRevealIfRunning(): void {
    if (this.revealEl) this.completeReveal();
    this.stopReveal();
  }

  private speakText(text: string, locale: string, reveal?: RevealTarget): void {
    if (!this.voiceEnabled) {
      if (reveal) this.runReveal(reveal, this.estimateRevealMs(reveal.full));
      return;
    }

    // Clean text from translation or tags if present
    const clean = text.split('\n')[0].replace(/<[^>]*>?/gm, '');
    if (this.voicesReady && this.selectedVoiceId()) {
      void this.speakWithAdsup(clean, reveal);
      return;
    }
    this.speakWithBrowser(clean, locale, reveal);
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

  private async speakWithAdsup(clean: string, reveal?: RevealTarget): Promise<void> {
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
      // Phát qua <audio id="aiSoundtrack"> để analyser đo biên độ thật và khớp khẩu hình.
      const audio = this.soundtrackEl ?? new Audio();
      this.lipSync?.beginAudioSync();
      audio.src = url;
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
      if (reveal) {
        const measured = Number.isFinite(audio.duration) && audio.duration > 0.3
          ? audio.duration * 1000
          : this.estimateRevealMs(reveal.full);
        this.runReveal(reveal, measured);
      }
    } catch {
      if (reveal) this.runReveal(reveal, this.estimateRevealMs(reveal.full));
      this.speakWithBrowser(clean, this.langMetadata[this.currentLang].locale);
    }
  }

  private speakWithBrowser(clean: string, locale: string, reveal?: RevealTarget): void {
    if (!('speechSynthesis' in window)) {
      if (reveal) this.runReveal(reveal, this.estimateRevealMs(reveal.full));
      this.stopCharacterTalking();
      return;
    }
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(clean);
    utter.lang = locale;
    utter.rate = this.voiceRate;

    utter.onstart = () => {
      this.startCharacterTalking();
      if (reveal) {
        // speechSynthesis không báo thời lượng: ước lượng theo độ dài và tốc độ đọc.
        this.runReveal(reveal, this.estimateRevealMs(reveal.full));
      }
    };

    utter.onend = () => {
      this.stopCharacterTalking();
    };

    utter.onerror = () => {
      this.stopCharacterTalking();
    };

    window.speechSynthesis.speak(utter);
  }

  /**
   * Hạn mức AI là của server theo tài khoản (50 lượt/ngày, múi giờ người dùng).
   * Chat không cộng XP nên chỉ cần đọc lại lượt đã dùng sau mỗi lượt đổi.
   */
  private async refreshQuota(): Promise<void> {
    try {
      const response = await slanguageApi<{ used: number; daily_limit: number; remaining: number }>(
        '/api/v1/chat-ai/quota',
      );
      const data = response.data;
      const limit = typeof data?.daily_limit === 'number' ? data.daily_limit : this.aiQuotaLimit;
      const used = typeof data?.used === 'number' ? data.used : this.aiQuotaUsed;
      this.aiQuotaLimit = limit;
      this.aiQuotaUsed = Math.min(Math.max(used, 0), limit);
    } catch {
      // Giữ số liệu đang hiển thị: hạn mức chỉ là thông tin, không chặn được việc học.
    }

    if (this.quotaUsedEl) {
      this.quotaUsedEl.textContent = `${this.aiQuotaUsed}/${this.aiQuotaLimit}`;
    }
    if (this.remainingQuotaEl) {
      this.remainingQuotaEl.textContent = String(this.aiQuotaLimit - this.aiQuotaUsed);
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

  private renderFeedbackCard(feedback: GrammarFeedback): string {
    const row = (icon: string, color: string, title: string, value: string) => `
      <div class="msg-fix-row">
        <div class="msg-fix-label"><i class="fa-solid ${icon}" style="color:${color};"></i> ${this.escapeHtml(title)}</div>
        <div class="msg-fix-value">${this.escapeHtml(value)}</div>
      </div>`;
    let inner = '';
    if (feedback.pronunciationScore !== null && feedback.pronunciationScore !== undefined) {
      const score = Math.max(0, Math.min(100, Math.round(feedback.pronunciationScore)));
      inner += `
        <div class="msg-pron-score">
          <div class="msg-pron-ring" style="--pron:${score}">
            <span class="msg-pron-value">${score}</span>
          </div>
          <div class="msg-pron-caption">
            <span class="msg-pron-title">${this.escapeHtml(t('ai.pronScore'))}</span>
            <span class="msg-pron-hint">${this.escapeHtml(feedback.pronunciationFeedback || '')}</span>
          </div>
        </div>`;
    } else if (feedback.pronunciationFeedback) {
      inner += row('fa-wave-square', '#38bdf8', t('ai.pronScore'), feedback.pronunciationFeedback);
    }
    if (feedback.comment) {
      inner += row('fa-comment-dots', '#7ae2cf', t('ai.pronComment'), feedback.comment);
    }
    if (feedback.grammarError) {
      inner += row('fa-triangle-exclamation', '#f87171', t('ai.fixError'), feedback.grammarError);
    }
    if (feedback.corrected) {
      inner += row('fa-circle-check', '#4ade80', t('ai.fixCorrected'), feedback.corrected);
    }
    if (feedback.natural) {
      inner += row('fa-wand-magic-sparkles', '#fbbf24', t('ai.fixNatural'), feedback.natural);
    }
    if (feedback.nextTopic) {
      inner += row('fa-lightbulb', '#a78bfa', t('ai.pronTopic'), feedback.nextTopic);
    }
    return inner ? `<div class="msg-fix-card">${inner}</div>` : '';
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
export { };
