/**
 * Slanguage - Dungeon Skill Tree Roadmap TypeScript Logic
 * Sinh cây 5 tầng cho chủ đề đang chọn từ Database:
 * - Mỗi tầng: 1 mốc bài đọc riêng (topics.readings, 5 bài/chủ đề) + 3 nhánh Dễ / Vừa / Khó
 * - Câu hỏi nhánh sinh ngẫu nhiên từ từ vựng chủ đề (vocabulary/words)
 * - Tầng 5: node BOSS = quiz 25 câu do AI soạn từ mọi chủ đề (máy chủ chấm)
 * - Nhánh độ khó: 15 câu theo tỉ lệ (Dễ 7:3 trắc nghiệm/điền từ; Vừa & Khó 5:4:1 điền từ/nối từ/trắc nghiệm)
 * - Câu điền từ là chính tả: nghe giọng đọc đáp án rồi gõ lại từ
 * - Thắng nhận XP, sai trừ Máu, hết máu khóa hồi 24 giờ rồi mới được chơi tiếp; tiến độ lưu theo chủ đề trong localStorage
 */

import { isLearnerAuthenticated, slanguageApi, slanguageApiAudio } from "../shared/api-client";
import { initializeLearnerHeader, logoutLearner } from "../shared/learner-header";
import { clearSkeleton, showSkeleton } from "../shared/skeleton";
import {
  DEFAULT_MAX_HEARTS,
  formatHeartLock,
  formatHearts,
  getHeartCap,
  heartCapLabel,
  heartLockRemainingMs,
  isHeartsLocked,
  readHearts,
  spendHearts,
} from "../shared/hearts";
import { offerHealPotion } from "../shared/heal-offer";
import { playLoadingRive, stopLoadingRive } from "../shared/loading-rive";
import { launchConfetti } from "../ui/confetti";
import { applyI18n, getLocale, setLocale, t, LOCALE_EVENT, type UiLocale } from "../shared/i18n";

type DungeonDifficulty = 'easy' | 'normal' | 'hard';
type TargetLang = 'ja' | 'en' | 'vi';

interface TrialBase {
  prompt: string;
  explanation: string;
  bossIndex?: number;
  // Khóa i18n cho câu hỏi sinh cục bộ (câu Boss do máy chủ trả về là dữ liệu, giữ nguyên)
  promptKey?: string;
  promptVars?: Record<string, string | number>;
  explanationKey?: string;
  explanationVars?: Record<string, string | number>;
}

interface McTrial extends TrialBase {
  kind: 'mc';
  choices: string[];
  answerIdx: number;
  optionIds?: string[];
}

interface FillTrial extends TrialBase {
  kind: 'fill';
  answer: string;
}

interface MatchTrial extends TrialBase {
  kind: 'match';
  words: string[];
  meanings: string[];
  pairs: Record<string, string>;
}

type DungeonTrial = McTrial | FillTrial | MatchTrial;

interface BossPublicQuestion {
  index: number;
  question_type: 'multiple_choice' | 'fill_in' | 'match';
  prompt: string;
  options?: Array<{ id: string; text: string }>;
  words?: string[];
  meanings?: string[];
}

const TRIAL_TOTAL = 15;
const TRIAL_MIX: Record<DungeonDifficulty, { mc: number; fill: number; match: number }> = {
  easy: { mc: 11, fill: 4, match: 0 },
  normal: { mc: 1, fill: 8, match: 6 },
  hard: { mc: 1, fill: 8, match: 6 },
};
const TTS_LANGUAGE_NAMES: Record<TargetLang, 'English' | 'Japanese' | 'Vietnamese'> = {
  en: 'English',
  ja: 'Japanese',
  vi: 'Vietnamese',
};

interface DungeonReadingSection {
  heading: string;
  icon?: string;
  text: string;
  callout?: string;
}

interface DungeonReadingArticle {
  title: string;
  lead: string;
  sections: DungeonReadingSection[];
  keyTakeaway: string;
}

interface TopicReadingEntry {
  title: string;
  passage: string;
  translation: string;
}

interface TopicWord {
  id: number;
  word: string;
  meaning: string;
  phonetic: string | null;
  example_sentence: string | null;
  example_meaning: string | null;
}

interface DungeonNode {
  id: string;
  stage: number;
  stageName: string;
  isHub: boolean;
  official?: boolean;
  difficulty?: DungeonDifficulty;
  title: string;
  desc: string;
  icon: string;
  xpReward: number;
  heartPenalty: number;
  status: 'mastered' | 'current' | 'available' | 'locked';
  parents: string[];
  objectives: string[];
  preview: string;
  readingArticle?: DungeonReadingArticle;
  pool?: TopicWord[];
}

interface SelectedLessonPayload {
  numStr: string;
  title: string;
  lang: TargetLang;
  topicId: number;
  pathId: number;
}

const HUB_ICONS = [
  'fa-solid fa-dungeon',
  'fa-solid fa-monument',
  'fa-solid fa-city',
  'fa-solid fa-vault',
  'fa-solid fa-crown',
];

/** Nhánh độ khó mở lần lượt trong cùng một tầng: Dễ → Vừa → Khó. */
const TIER_ORDER: DungeonDifficulty[] = ['easy', 'normal', 'hard'];

const DIFF_META: Record<DungeonDifficulty, { icon: string; xp: number; hearts: number; titleKey: string; objectiveKeys: string[] }> = {
  easy: {
    icon: 'fa-solid fa-feather-pointed',
    xp: 5,
    hearts: 1,
    titleKey: 'rm.easyTitle',
    objectiveKeys: ['rm.easyObj1', 'rm.easyObj2'],
  },
  normal: {
    icon: 'fa-solid fa-wand-magic-sparkles',
    xp: 10,
    hearts: 2,
    titleKey: 'rm.normalTitle',
    objectiveKeys: ['rm.normalObj1', 'rm.normalObj2'],
  },
  hard: {
    icon: 'fa-solid fa-skull',
    xp: 15,
    hearts: 3,
    titleKey: 'rm.hardTitle',
    objectiveKeys: ['rm.normalObj1', 'rm.hardObj2'],
  },
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ==================== PHẢN HỒI ĐÚNG/SAI (âm thanh + toast) ==================== */
type DungeonCue = 'correct' | 'wrong' | 'pass' | 'fail';

const DUNGEON_CUE_NOTES: Record<DungeonCue, number[]> = {
  correct: [880, 1318.5],
  wrong: [392, 261.6],
  pass: [659.3, 830.6, 1046.5, 1318.5],
  fail: [440, 349.2, 261.6],
};

const VERDICT_ANIMATIONS = ['is-in', 'is-shake', 'is-glow'];

let cueAudioContext: AudioContext | null = null;
let verdictToastTimer = 0;

/** Trình duyệt chỉ mở AudioContext sau một thao tác chạm/phím của người dùng. */
function unlockDungeonAudio(): void {
  const Constructor = window.AudioContext
    ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Constructor) return;
  try {
    cueAudioContext ??= new Constructor();
    if (cueAudioContext.state === 'suspended') void cueAudioContext.resume();
  } catch {
    cueAudioContext = null;
  }
}

/** Âm báo tổng hợp — khỏi nạp file audio cho từng lượt đúng/sai. */
function playDungeonCue(cue: DungeonCue): void {
  const context = cueAudioContext;
  if (!context || context.state === 'closed') return;
  const rising = cue === 'correct' || cue === 'pass';
  try {
    let at = context.currentTime;
    for (const frequency of DUNGEON_CUE_NOTES[cue]) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = rising ? 'sine' : 'triangle';
      oscillator.frequency.setValueAtTime(frequency, at);
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(rising ? 0.16 : 0.12, at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.22);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(at);
      oscillator.stop(at + 0.24);
      at += rising ? 0.09 : 0.14;
    }
  } catch {
    // Bỏ qua khi trình duyệt chặn phát âm thanh.
  }
}

function replayAnimation(element: HTMLElement, className: string): void {
  element.classList.remove(...VERDICT_ANIMATIONS);
  void element.offsetWidth;
  element.classList.add(className);
}

interface DungeonAnswerReview {
  prompt: string;
  selected: string;
  correct: string;
  explanation: string;
  isCorrect: boolean;
}

class SlanguageDungeonTree {
  private currentLang: TargetLang = 'ja';
  private totalXP: number = 0;
  private currentHearts: number = readHearts();
  private selectedNode: DungeonNode | null = null;
  private selectedChoiceIdx: number | null = null;

  private topicId: number = 0;
  private pathId: number = 0;
  private topicTitle: string = '';
  private storageKey: string = '';
  private words: TopicWord[] = [];
  private nodes: DungeonNode[] = [];
  private mastered: Set<string> = new Set();
  private quizLessonId: number = 0;
  private quizXp: number = 20;
  private quizCompleted: boolean = false;
  private lessonNumStr: string = '';
  // Dữ liệu thô cache lại để dựng lại phần chữ UI khi đổi ngôn ngữ giao diện
  private quizDescription: string = '';
  private quizTitleRaw: string = '';
  private readings: TopicReadingEntry[] = [];
  private bossLoading = false;
  private trialResultState: { className: string; render: () => string } | null = null;

  // Quiz Boss (AI chấm phía server) & trạng thái câu hỏi nhiều dạng
  private bossToken: string | null = null;
  private bossQuestions: BossPublicQuestion[] = [];
  private bossAnswers: Array<{ index: number; value: unknown }> = [];
  private failReason: 'hearts' | 'boss' | 'trial' | null = null;
  private matchPairs: Map<string, string> = new Map();
  private matchSelectedWord: string | null = null;
  private fillInput: HTMLInputElement | null = null;
  private audioUrl: string | null = null;
  private audioEl: HTMLAudioElement | null = null;
  private extraWords: TopicWord[] = [];
  private extraPoolLoaded = false;
  private grading = false;
  private answerReviews: DungeonAnswerReview[] = [];
  private reviewFilter: 'all' | 'correct' | 'wrong' = 'all';
  private summaryState: { passed: boolean; xp: number; boostNote: string; body: string; retryable: boolean } | null = null;

  // DOM Elements
  private treeSvgCanvas: SVGSVGElement | null = null;
  private treeNodesFlow: HTMLElement | null = null;
  private treeMainTitle: HTMLElement | null = null;
  private treeMainSubtitle: HTMLElement | null = null;
  private treeProgressFill: HTMLElement | null = null;
  private treeProgressPercent: HTMLElement | null = null;
  private treeNodesRatio: HTMLElement | null = null;
  private treeTotalXP: HTMLElement | null = null;
  private treeDungeonXp: HTMLElement | null = null;
  private treeLevelVal: HTMLElement | null = null;
  private navXPVal: HTMLElement | null = null;
  private navHeartsVal: HTMLElement | null = null;
  private navHeartIcon: HTMLElement | null = null;

  // Modal Elements
  private nodeModalOverlay: HTMLElement | null = null;
  private modalNodeBadge: HTMLElement | null = null;
  private modalNodeTier: HTMLElement | null = null;
  private modalNodeTitle: HTMLElement | null = null;
  private modalNodeStatus: HTMLElement | null = null;
  private modalNodeXP: HTMLElement | null = null;
  private modalNodeObjectives: HTMLElement | null = null;
  private modalObjectivesWrap: HTMLElement | null = null;
  private modalNodePreview: HTMLElement | null = null;
  private modalTrialBox: HTMLElement | null = null;
  private modalTrialPrompt: HTMLElement | null = null;
  private modalTrialChoices: HTMLElement | null = null;
  private modalTrialResult: HTMLElement | null = null;
  private modalTrialStepBadge: HTMLElement | null = null;
  private modalTrialProgressFill: HTMLElement | null = null;
  private modalTrialHearts: HTMLElement | null = null;
  private currentQuestionIdx: number = 0;
  private currentQuestionsList: DungeonTrial[] = [];
  private currentTrialPhase: 'idle' | 'checked' | 'failed' = 'idle';
  private btnExecuteTrial: HTMLButtonElement | null = null;
  private modalHubReadingBox: HTMLElement | null = null;
  private readingArticleTitle: HTMLElement | null = null;
  private readingArticleContent: HTMLElement | null = null;

  constructor() {
    if (!isLearnerAuthenticated()) {
      window.location.replace('../login/index.html');
      return;
    }
    const payload = this.readSelectedLesson();
    if (!payload) {
      window.location.replace('../select-lesson/index.html');
      return;
    }
    this.topicId = payload.topicId;
    this.pathId = payload.pathId;
    this.topicTitle = payload.title;
    this.lessonNumStr = payload.numStr;
    this.currentLang = payload.lang;
    this.storageKey = `slanguage_dungeon_topic_${this.currentLang}_${this.topicId}`;
    try {
      const saved = JSON.parse(localStorage.getItem(this.storageKey) || '[]');
      if (Array.isArray(saved)) this.mastered = new Set(saved.filter((id) => typeof id === 'string'));
    } catch {
      this.mastered = new Set();
    }
    this.initStorage();
    this.cacheDom();
    this.initEventListeners();
    void initializeLearnerHeader({ bindControls: false }).then(() => {
      const savedXP = localStorage.getItem('slanguage_user_xp');
      if (savedXP) {
        this.totalXP = parseInt(savedXP, 10) || 0;
        this.updateStatsDisplays();
      }
    });
    // Đổi ngôn ngữ GIAO DIỆN: chỉ dịch lại chữ UI, không đổi ngôn ngữ học / không gọi API
    window.addEventListener(LOCALE_EVENT, () => {
      applyI18n();
      this.handleLocaleChange();
    });
    showSkeleton(this.treeNodesFlow, 'dungeon', { tone: 'dark' });
    void this.loadDungeon();
  }

  private readSelectedLesson(): SelectedLessonPayload | null {
    const raw = localStorage.getItem('slanguage_selected_lesson');
    if (!raw) return null;
    try {
      const parsed = asRecord(JSON.parse(raw));
      const topicId = Number(parsed.topicId);
      const pathId = Number(parsed.pathId);
      const lang = asString(parsed.lang);
      const title = asString(parsed.title);
      if (!Number.isInteger(topicId) || topicId < 1 || !Number.isInteger(pathId) || pathId < 1 || !title) return null;
      if (lang !== 'ja' && lang !== 'en' && lang !== 'vi') return null;
      const titleEl = document.getElementById('activeLessonTitle');
      if (titleEl) titleEl.textContent = t('rm.sessionFormat', { num: asString(parsed.numStr) || '01', title });
      return { numStr: asString(parsed.numStr), title, lang, topicId, pathId };
    } catch {
      localStorage.removeItem('slanguage_selected_lesson');
      return null;
    }
  }

  private officialId(): string {
    return `t${this.topicId}_official`;
  }

  private hubId(stage: number): string {
    return `t${this.topicId}_s${stage}_hub`;
  }

  private initStorage(): void {
    localStorage.setItem('slanguage_active_language', this.currentLang);
    localStorage.setItem('slanguage_current_lang', this.currentLang);

    // Bản cũ ghi sẵn 2450 XP giả vào storage — dọn một lần duy nhất
    if (!localStorage.getItem('slanguage_xp_v2_reset')) {
      localStorage.removeItem('slanguage_user_xp');
      localStorage.setItem('slanguage_xp_v2_reset', '1');
    }
    const savedXP = localStorage.getItem('slanguage_user_xp');
    if (savedXP) {
      this.totalXP = parseInt(savedXP, 10) || 0;
    }
    this.currentHearts = readHearts();
  }

  private cacheDom(): void {
    this.treeSvgCanvas = document.getElementById('treeSvgCanvas') as unknown as SVGSVGElement;
    this.treeNodesFlow = document.getElementById('treeNodesFlow');
    this.treeMainTitle = document.getElementById('treeMainTitle');
    this.treeMainSubtitle = document.getElementById('treeMainSubtitle');
    this.treeProgressFill = document.getElementById('treeProgressFill');
    this.treeProgressPercent = document.getElementById('treeProgressPercent');
    this.treeNodesRatio = document.getElementById('treeNodesRatio');
    this.treeTotalXP = document.getElementById('treeTotalXP');
    this.treeDungeonXp = document.getElementById('treeDungeonXp');
    this.treeLevelVal = document.getElementById('treeLevelVal');
    this.navXPVal = document.getElementById('headerXPVal');
    this.navHeartsVal = document.getElementById('headerHeartsVal');
    this.navHeartIcon = document.getElementById('navHeartIcon');

    this.nodeModalOverlay = document.getElementById('nodeModalOverlay');
    this.modalNodeBadge = document.getElementById('modalNodeBadge');
    this.modalNodeTier = document.getElementById('modalNodeTier');
    this.modalNodeTitle = document.getElementById('modalNodeTitle');
    this.modalNodeStatus = document.getElementById('modalNodeStatus');
    this.modalNodeXP = document.getElementById('modalNodeXP');
    this.modalNodeObjectives = document.getElementById('modalNodeObjectives');
    this.modalObjectivesWrap = document.getElementById('modalObjectivesWrap');
    this.modalNodePreview = document.getElementById('modalNodePreview');
    this.modalTrialBox = document.getElementById('modalTrialBox');
    this.modalTrialPrompt = document.getElementById('modalTrialPrompt');
    this.modalTrialChoices = document.getElementById('modalTrialChoices');
    this.modalTrialResult = document.getElementById('modalTrialResult');
    this.modalTrialStepBadge = document.getElementById('modalTrialStepBadge');
    this.modalTrialProgressFill = document.getElementById('modalTrialProgressFill');
    this.modalTrialHearts = document.getElementById('modalTrialHearts');
    this.btnExecuteTrial = document.getElementById('btnExecuteTrial') as HTMLButtonElement;
    this.modalHubReadingBox = document.getElementById('modalHubReadingBox');
    this.readingArticleTitle = document.getElementById('readingArticleTitle');
    this.readingArticleContent = document.getElementById('readingArticleContent');

    if (this.treeMainTitle) this.treeMainTitle.textContent = t('rm.loadingTitle');
    if (this.treeMainSubtitle) this.treeMainSubtitle.innerHTML = `<p class="intro-lead">${t('rm.loadingSubtitle')}</p>`;
    if (this.treeDungeonXp) this.treeDungeonXp.textContent = t('rm.dungeonXpLoading');

    this.updateStatsDisplays();
  }

  private initEventListeners(): void {
    const isLoggedIn = isLearnerAuthenticated();
    document.body.classList.toggle('user-authenticated', isLoggedIn);
    document.body.classList.toggle('user-guest', !isLoggedIn);

    const logoutBtn = document.getElementById('navLogoutItem');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => {
        void logoutLearner();
      });
    }

    const langDropdownBtn = document.getElementById('langDropdownBtn');
    const langDropdown = document.getElementById('langDropdown');
    const userDropdownBtn = document.getElementById('userDropdownBtn');
    const userDropdown = document.getElementById('userDropdown');

    if (langDropdownBtn && langDropdown) {
      langDropdownBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        langDropdown.classList.toggle('active');
        langDropdown.classList.toggle('open');
        if (userDropdown) {
          userDropdown.classList.remove('active');
          userDropdown.classList.remove('open');
        }
      });
    }

    if (userDropdownBtn && userDropdown) {
      userDropdownBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        userDropdown.classList.toggle('active');
        userDropdown.classList.toggle('open');
        if (langDropdown) {
          langDropdown.classList.remove('active');
          langDropdown.classList.remove('open');
        }
      });
    }

    document.addEventListener('click', (e) => {
      const target = e.target as Node;
      if (langDropdown && !langDropdown.contains(target)) {
        langDropdown.classList.remove('active');
        langDropdown.classList.remove('open');
      }
      if (userDropdown && !userDropdown.contains(target)) {
        userDropdown.classList.remove('active');
        userDropdown.classList.remove('open');
      }
    });

    // Dropdown ngôn ngữ trên navbar chỉ đổi locale GIAO DIỆN (i18n),
    // không PATCH target_language, không đổi ngôn ngữ học, không tải lại lộ trình.
    document.querySelectorAll<HTMLButtonElement>('.lang-dropdown-item').forEach(item => {
      item.addEventListener('click', () => {
        const code = item.dataset.lang as UiLocale | undefined;
        if (code && code !== getLocale()) setLocale(code);
        if (langDropdown) {
          langDropdown.classList.remove('active');
          langDropdown.classList.remove('open');
        }
        langDropdownBtn?.setAttribute('aria-expanded', 'false');
      });
    });

    const btnCloseModal = document.getElementById('btnCloseNodeModal');
    if (btnCloseModal) {
      btnCloseModal.addEventListener('click', () => this.closeModal());
    }
    if (this.nodeModalOverlay) {
      this.nodeModalOverlay.addEventListener('click', (e) => {
        if (e.target === this.nodeModalOverlay) this.closeModal();
      });
    }

    if (this.btnExecuteTrial) {
      this.btnExecuteTrial.addEventListener('click', () => this.handleTrialSubmission());
    }

    document.getElementById('btnSummaryRetry')?.addEventListener('click', () => this.retryCurrentNode());
    document.querySelectorAll<HTMLElement>('#modalReviewFilters .dungeon-review__filter').forEach((tab) => {
      tab.addEventListener('click', () => {
        const raw = tab.dataset.reviewFilter;
        this.applyReviewFilter(raw === 'correct' || raw === 'wrong' ? raw : 'all');
      });
    });
    const trialHost = document.getElementById('nodeModalOverlay');
    trialHost?.addEventListener('pointerdown', unlockDungeonAudio);
    window.addEventListener('keydown', unlockDungeonAudio, { once: true });

    window.addEventListener('resize', () => {
      this.drawConnectingBranches();
    });
    // Màn xoay đã đổi kích thước canvas trước cả event resize: vẽ lại trễ một nhịp
    // để đường nối không bám theo toạ độ cũ.
    window.addEventListener('orientationchange', () => {
      window.setTimeout(() => this.drawConnectingBranches(), 100);
    });

    this.bindPageTransitions();
  }

  // Điều khiển đổi ngôn ngữ HỌC (không thuộc navbar) — hiện dùng cho các liên kết ở footer.
  public switchLanguage(lang: TargetLang): void {
    if (lang === this.currentLang) return;
    localStorage.setItem('slanguage_current_lang', lang);
    localStorage.setItem('slanguage_active_language', lang);
    void slanguageApi('/api/v1/me', { method: 'PATCH', body: { target_language: lang } }).catch(() => {});
    this.showToast(t('rm.switchLangToast'));
    window.location.assign('../select-lesson/index.html');
  }

  private updateStatsDisplays(): void {
    this.currentHearts = readHearts();
    if (this.navXPVal) this.navXPVal.textContent = `${this.totalXP.toLocaleString()} XP`;
    if (this.treeTotalXP) this.treeTotalXP.textContent = `${this.totalXP.toLocaleString()} XP`;
    if (this.treeLevelVal) this.treeLevelVal.textContent = t('rm.level', { n: Math.floor(this.totalXP / 100) + 1 });
    if (this.navHeartsVal) {
      this.navHeartsVal.textContent = formatHearts(this.currentHearts);
      const chip = this.navHeartsVal.closest<HTMLElement>('.hud-chip, .stat-chip') || this.navHeartsVal;
      chip.title = isHeartsLocked()
        ? t('rm.heartsChipLocked', { time: formatHeartLock(heartLockRemainingMs()) })
        : t('rm.heartsChip', { cur: this.currentHearts, max: heartCapLabel() });
    }
    this.renderTrialHearts();
    if (this.navHeartIcon) {
      if (this.currentHearts === 0) {
        this.navHeartIcon.style.color = '#64748b';
        this.navHeartIcon.style.animation = 'none';
      } else {
        this.navHeartIcon.style.color = 'var(--color-crimson, #DC143C)';
      }
    }
  }

  /** Nạp tiến trình lưu trên tài khoản: đăng xuất hay đổi máy không mất ải đã qua. */
  private mergeServerProgress(response: { data?: unknown } | null): void {
    const completed = response ? asRecord(response.data).completed_nodes : null;
    if (!Array.isArray(completed)) return;
    const before = this.mastered.size;
    for (const id of completed) {
      if (typeof id === 'string') this.mastered.add(id);
    }
    if (this.mastered.size !== before) this.persistProgress();
  }

  private async loadDungeon(): Promise<void> {
    try {
      const [wordsResponse, lessonsResponse, readingsResponse, progressResponse] = await Promise.all([
        slanguageApi(`/api/v1/vocabulary/words?topic_id=${this.topicId}&limit=100`),
        slanguageApi(`/api/v1/lessons/topics/${this.topicId}/lessons?path_id=${this.pathId}`),
        slanguageApi(`/api/v1/lessons/topics/${this.topicId}/readings`).catch(() => null),
        slanguageApi(`/api/v1/lessons/topics/${this.topicId}/dungeon-progress`).catch(() => null),
      ]);
      this.mergeServerProgress(progressResponse);
      const wordItems = Array.isArray(asRecord(wordsResponse.data).items)
        ? (asRecord(wordsResponse.data).items as unknown[])
        : [];
      this.words = wordItems.map((item) => {
        const row = asRecord(item);
        return {
          id: Number(row.id),
          word: asString(row.word),
          meaning: asString(row.meaning),
          phonetic: asString(row.phonetic) || null,
          example_sentence: asString(row.example_sentence) || null,
          example_meaning: asString(row.example_meaning) || null,
        };
      }).filter((word) => word.id && word.word && word.meaning);

      const lessons = Array.isArray(lessonsResponse.data) ? lessonsResponse.data as unknown[] : [];
      const quiz = asRecord(lessons[0]);
      this.quizLessonId = Number(quiz.id);
      this.quizXp = Number(quiz.xp_reward) || 20;
      this.quizCompleted = quiz.is_completed === true;
      if (!this.words.length || !this.quizLessonId) {
        throw new Error(t('rm.noData'));
      }
      const readingsData = readingsResponse ? asRecord(readingsResponse.data) : {};
      const rawReadings = Array.isArray(readingsData.readings) ? readingsData.readings as unknown[] : [];
      const readings: TopicReadingEntry[] = rawReadings.map((item) => {
        const row = asRecord(item);
        return {
          title: asString(row.title),
          passage: asString(row.passage),
          translation: asString(row.translation),
        };
      });
      this.quizDescription = asString(quiz.description);
      this.quizTitleRaw = asString(quiz.title) || this.topicTitle;
      this.readings = readings;
      this.buildNodes(this.quizDescription, this.quizTitleRaw, readings);
      if (this.quizCompleted) this.mastered.add(this.officialId());
      this.applyStatuses();
      this.renderTree();
    } catch (error) {
      clearSkeleton(this.treeNodesFlow);
      this.showToast(error instanceof Error ? error.message : t('rm.loadFail'));
      window.setTimeout(() => window.location.replace('../select-lesson/index.html'), 3000);
    }
  }

  private buildNodes(description: string, quizTitle: string, readings: TopicReadingEntry[]): void {
    const legacyArticle = this.buildReadingArticle(description, quizTitle);
    const chunk = Math.max(1, Math.ceil(this.words.length / 5));
    this.nodes = [];
    for (let stage = 1; stage <= 5; stage++) {
      const slice = this.words.slice((stage - 1) * chunk, stage * chunk);
      const pool = stage === 5 || !slice.length ? this.words : slice;
      const hubId = this.hubId(stage);
      const stageName = t('rm.stageName', { stage, topic: this.topicTitle.toUpperCase() });
      const parents = stage === 1
        ? []
        : (['easy', 'normal', 'hard'] as DungeonDifficulty[]).map((diff) => `t${this.topicId}_s${stage - 1}_${diff}`);
      const entry = readings[stage - 1];
      const article = entry && entry.passage.trim()
        ? this.buildStageArticle(entry, stage)
        : (stage === 1 ? legacyArticle : undefined);
      this.nodes.push({
        id: hubId,
        stage,
        stageName,
        isHub: true,
        title: entry?.title.trim() || t('rm.hubTitleFallback', { stage, topic: this.topicTitle }),
        desc: t('rm.hubDesc', { stage, count: pool.length }),
        icon: HUB_ICONS[stage - 1],
        xpReward: 0,
        heartPenalty: 0,
        status: 'locked',
        parents,
        objectives: pool.map((word) => `${word.word} — ${word.meaning}`),
        preview: pool.map((word) => word.word).join(' • '),
        readingArticle: article,
        pool,
      });
      for (const diff of ['easy', 'normal', 'hard'] as DungeonDifficulty[]) {
        const meta = DIFF_META[diff];
        if (stage === 5 && diff === 'hard') {
          this.nodes.push({
            id: this.officialId(),
            stage,
            stageName,
            isHub: false,
            official: true,
            difficulty: 'hard',
            title: t('rm.bossTitle'),
            desc: t('rm.bossDesc'),
            icon: 'fa-solid fa-dragon',
            xpReward: this.quizXp,
            heartPenalty: 1,
            status: 'locked',
            parents: [hubId],
            objectives: [t('rm.bossObj1'), t('rm.bossObj2'), t('rm.bossObj3')],
            preview: t('rm.bossPreview'),
            pool,
          });
          continue;
        }
        this.nodes.push({
          id: `t${this.topicId}_s${stage}_${diff}`,
          stage,
          stageName,
          isHub: false,
          difficulty: diff,
          title: t(meta.titleKey),
          desc: t('rm.branchDesc', { stage }),
          icon: meta.icon,
          xpReward: meta.xp,
          heartPenalty: meta.hearts,
          status: 'locked',
          parents: [hubId],
          objectives: meta.objectiveKeys.map((key) => t(key)),
          preview: pool.map((word) => word.word).join(' • '),
          pool,
        });
      }
    }
  }

  private buildReadingArticle(description: string, quizTitle: string): DungeonReadingArticle | undefined {
    const translationMarker = this.currentLang === 'vi' ? '\n\nBẢN DỊCH TIẾNG ANH\n' : '\n\nBẢN DỊCH TIẾNG VIỆT\n';
    const splitAt = description.indexOf(translationMarker);
    const passage = (splitAt >= 0 ? description.slice(0, splitAt) : description)
      .replace(/^BÀI ĐỌC TIẾNG (NHẬT|ANH|VIỆT)\n/, '')
      .trim();
    if (!passage) return undefined;
    const translation = splitAt >= 0 ? description.slice(splitAt + translationMarker.length).trim() : '';
    const paragraphs = passage.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);
    return {
      title: quizTitle,
      lead: t('rm.readingLeadTopic', { topic: this.topicTitle }),
      sections: (paragraphs.length ? paragraphs : [passage]).map((text, index) => ({
        heading: t('rm.paragraph', { n: index + 1 }),
        icon: 'fa-solid fa-book-open',
        text,
      })),
      keyTakeaway: translation || t('rm.noTranslationTopic'),
    };
  }

  private buildStageArticle(entry: TopicReadingEntry, stage: number): DungeonReadingArticle | undefined {
    const passage = entry.passage.trim();
    if (!passage) return undefined;
    const paragraphs = passage.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);
    return {
      title: entry.title.trim() || t('rm.hubTitleFallback', { stage, topic: this.topicTitle }),
      lead: t('rm.readingLeadStage', { stage, topic: this.topicTitle }),
      sections: (paragraphs.length ? paragraphs : [passage]).map((text, index) => ({
        heading: t('rm.paragraph', { n: index + 1 }),
        icon: 'fa-solid fa-book-open',
        text,
      })),
      keyTakeaway: entry.translation.trim() || t('rm.noTranslation'),
    };
  }

  private applyStatuses(): void {
    // Đọc xong bài đọc (hub) mở nhánh đầu tiên của tầng đó; mỗi nhánh sau chỉ mở
    // khi đã QUA nhánh ngay trước (Dễ → Vừa → Khó). Tầng sau mở khi vượt ÍT NHẤT
    // 1 ải bất kỳ của tầng trước.
    const stageOpen = (stage: number): boolean =>
      stage === 1 ||
      this.nodes
        .filter((node) => node.stage === stage - 1 && !node.isHub)
        .some((node) => this.mastered.has(node.id));
    for (const node of this.nodes) {
      if (this.mastered.has(node.id)) {
        node.status = 'mastered';
      } else if (!stageOpen(node.stage) || (!node.isHub && (!this.mastered.has(this.hubId(node.stage)) || !this.tierUnlocked(node)))) {
        node.status = 'locked';
      } else {
        node.status = 'available';
      }
    }
  }

  /** Nhánh độ khó chỉ mở khi nhánh liền trước trong cùng tầng đã được master. */
  private tierUnlocked(node: DungeonNode): boolean {
    const rank = node.difficulty ? TIER_ORDER.indexOf(node.difficulty) : -1;
    if (rank <= 0) return true;
    const previousTier = TIER_ORDER[rank - 1];
    return this.nodes.some((other) => !other.isHub
      && other.stage === node.stage
      && other.difficulty === previousTier
      && this.mastered.has(other.id));
  }

  private persistProgress(): void {
    localStorage.setItem(this.storageKey, JSON.stringify([...this.mastered]));
  }

  private markMastered(node: DungeonNode): void {
    this.mastered.add(node.id);
    this.persistProgress();
    this.applyStatuses();
    this.syncProgressToServer();
  }

  /**
   * Đẩy toàn bộ tiến trình lên tài khoản (server hợp nhất, không ghi đè thiết bị khác).
   * Lỗi mạng thì bỏ qua: localStorage vẫn là bản sao để chơi offline.
   */
  private syncProgressToServer(): void {
    void slanguageApi(`/api/v1/lessons/topics/${this.topicId}/dungeon-progress`, {
      method: 'POST',
      body: { completed_nodes: [...this.mastered] },
    }).catch(() => {});
  }

  private renderTree(): void {
    if (!this.treeNodesFlow || !this.nodes.length) return;

    if (this.treeMainTitle) {
      this.treeMainTitle.textContent = t('rm.treeTitle', { topic: this.topicTitle });
    }
    if (this.treeMainSubtitle) {
      this.treeMainSubtitle.innerHTML = `
        <p class="intro-lead">${t('rm.introLead')}</p>`;
    }

    const totalRooms = this.nodes.filter(n => !n.isHub).length;
    const masteredRooms = this.nodes.filter(n => !n.isHub && n.status === 'mastered').length;
    const progressPercent = Math.round((masteredRooms / totalRooms) * 100);

    if (this.treeProgressFill) this.treeProgressFill.style.width = `${progressPercent}%`;
    if (this.treeProgressPercent) this.treeProgressPercent.textContent = `${progressPercent}%`;
    if (this.treeNodesRatio) this.treeNodesRatio.textContent = t('rm.nodesRatio', { done: masteredRooms, total: totalRooms });

    const dungeonXpMax = this.nodes.filter(n => !n.isHub).reduce((sum, n) => sum + n.xpReward, 0);
    const dungeonXpEarned = this.nodes.filter(n => !n.isHub && this.mastered.has(n.id)).reduce((sum, n) => sum + n.xpReward, 0);
    if (this.treeDungeonXp) this.treeDungeonXp.textContent = t('rm.dungeonXp', { earned: dungeonXpEarned, max: dungeonXpMax });

    const stages: Record<number, { hub?: DungeonNode; branches: DungeonNode[] }> = {};
    for (let i = 1; i <= 5; i++) {
      stages[i] = { branches: [] };
    }
    this.nodes.forEach(node => {
      if (node.isHub) {
        stages[node.stage].hub = node;
      } else {
        stages[node.stage].branches.push(node);
      }
    });

    clearSkeleton(this.treeNodesFlow);
    this.treeNodesFlow.innerHTML = '';
    for (let s = 1; s <= 5; s++) {
      const stageData = stages[s];
      const stageEl = document.createElement('div');
      stageEl.className = 'dungeon-stage-section';
      stageEl.setAttribute('data-stage', s.toString());

      const stagePill = document.createElement('div');
      stagePill.className = 'dungeon-stage-pill';
      stagePill.innerHTML = `<i class="fa-solid fa-dungeon"></i> ${t('rm.stagePill', { stage: s, name: stageData.hub ? stageData.hub.stageName : t('rm.topicFallback', { stage: s }) })}`;
      stageEl.appendChild(stagePill);

      if (stageData.hub) {
        const hubEl = this.createNodeElement(stageData.hub);
        hubEl.classList.add('dungeon-hub-card');
        stageEl.appendChild(hubEl);
      }

      const branchesRow = document.createElement('div');
      branchesRow.className = 'dungeon-branches-row';
      const diffOrder: Record<string, number> = { easy: 1, normal: 2, hard: 3 };
      stageData.branches.sort((a, b) => (diffOrder[a.difficulty || ''] || 0) - (diffOrder[b.difficulty || ''] || 0));
      stageData.branches.forEach(branch => {
        branchesRow.appendChild(this.createNodeElement(branch));
      });

      stageEl.appendChild(branchesRow);
      this.treeNodesFlow.appendChild(stageEl);
    }

    requestAnimationFrame(() => {
      setTimeout(() => {
        this.drawConnectingBranches();
      }, 70);
    });
  }

  private createNodeElement(node: DungeonNode): HTMLElement {
    const el = document.createElement('div');
    const diffClass = node.difficulty ? `diff-${node.difficulty}` : 'hub-node';
    el.className = `dungeon-node ${node.status} ${diffClass} ${node.isHub ? 'is-hub' : ''}`;
    el.id = `node_${node.id}`;

    let statusBadgeHtml = '';
    let statusText = t('rm.statusLocked');
    if (node.status === 'mastered') {
      statusBadgeHtml = `<div class="node-status-badge mastered"><i class="fa-solid fa-check"></i></div>`;
      statusText = node.isHub ? t('rm.tipReadDone') : (node.official ? t('rm.bossDefeated') : t('rm.cleared'));
    } else if (node.status === 'current') {
      statusBadgeHtml = `<div class="node-status-badge current"><i class="fa-solid fa-play"></i></div>`;
      statusText = node.isHub ? t('rm.readingNow') : t('rm.openNow');
    } else if (node.status === 'available') {
      statusBadgeHtml = `<div class="node-status-badge available"><i class="fa-solid fa-unlock"></i></div>`;
      statusText = node.isHub ? t('rm.readyRead') : (node.official ? t('rm.readyBoss') : t('rm.readyFight'));
    } else {
      statusBadgeHtml = `<div class="node-status-badge locked"><i class="fa-solid fa-lock"></i></div>`;
      statusText = t('rm.statusLocked');
    }

    let diffPillHtml = '';
    if (node.isHub) {
      diffPillHtml = `<span class="diff-chip chip-hub"><i class="fa-solid fa-book-open"></i> ${t('rm.hubChip', { stage: node.stage })}</span>`;
    } else if (node.official) {
      diffPillHtml = `<span class="diff-chip chip-hard"><i class="fa-solid fa-crown"></i> BOSS</span>`;
    } else if (node.difficulty === 'easy') {
      diffPillHtml = `<span class="diff-chip chip-easy"><i class="fa-solid fa-feather"></i> ${t('rm.easy')}</span>`;
    } else if (node.difficulty === 'normal') {
      diffPillHtml = `<span class="diff-chip chip-normal"><i class="fa-solid fa-shield-halved"></i> ${t('rm.normal')}</span>`;
    } else {
      diffPillHtml = `<span class="diff-chip chip-hard"><i class="fa-solid fa-skull"></i> ${t('rm.hard')}</span>`;
    }

    let compactStakesHtml = '';
    if (node.isHub) {
      compactStakesHtml = `<div class="node-compact-stakes hub-mode"><span class="stake-reading-tag"><i class="fa-solid fa-book-open"></i> ${t('rm.topicReading')}</span></div>`;
    } else if (node.official) {
      compactStakesHtml = `<div class="node-compact-stakes"><span class="stake-win">+${node.xpReward} XP</span><span class="stake-reading-tag"><i class="fa-solid fa-graduation-cap"></i> ${t('rm.bossUnlockShort')}</span></div>`;
    } else if (node.difficulty === 'easy') {
      compactStakesHtml = `<div class="node-compact-stakes"><span class="stake-win">+5 XP</span><span class="stake-loss">-1 ❤️</span></div>`;
    } else if (node.difficulty === 'normal') {
      compactStakesHtml = `<div class="node-compact-stakes"><span class="stake-win">+10 XP</span><span class="stake-loss">-2 ❤️</span></div>`;
    } else {
      compactStakesHtml = `<div class="node-compact-stakes"><span class="stake-win">+15 XP</span><span class="stake-loss">-3 ❤️</span></div>`;
    }

    let tooltipStakesHtml = '';
    let clickHint = `<i class="fa-solid fa-hand-pointer"></i> ${t('rm.hintTrial')}`;
    if (node.isHub) {
      tooltipStakesHtml = `
        <div class="tooltip-stakes-bar hub-mode">
          <span class="stake-info" style="color: #38bdf8; font-weight:700;"><i class="fa-solid fa-book-open"></i> ${t('rm.hubNoStakes')}</span>
        </div>`;
      clickHint = `<i class="fa-solid fa-book-reader"></i> ${t('rm.hintReading')}`;
    } else if (node.official) {
      tooltipStakesHtml = `
        <div class="tooltip-stakes-bar">
          <span class="stake-win"><i class="fa-solid fa-trophy"></i> ${t('rm.bossWinStake', { xp: node.xpReward })}</span>
        </div>`;
      clickHint = `<i class="fa-solid fa-graduation-cap"></i> ${t('rm.hintBoss')}`;
    } else {
      tooltipStakesHtml = `
        <div class="tooltip-stakes-bar">
          <span class="stake-win"><i class="fa-solid fa-trophy"></i> ${t('rm.winStake', { xp: node.xpReward })}</span>
          ${node.heartPenalty > 0 ? `<span class="stake-loss"><i class="fa-solid fa-heart-crack"></i> ${t('rm.loseStake', { penalty: node.heartPenalty })}</span>` : ''}
        </div>`;
    }

    const tooltipHtml = `
      <div class="node-hover-tooltip">
        <div class="tooltip-header">
          <span class="tooltip-stage-badge">${node.stageName}</span>
          <span class="tooltip-status-text ${node.status}">${statusText}</span>
        </div>
        <div class="tooltip-title">${node.title}</div>
        <div class="tooltip-desc">${node.desc}</div>
        ${tooltipStakesHtml}
        <div class="tooltip-click-hint">
          ${clickHint}
        </div>
      </div>
    `;

    el.innerHTML = `
      <div class="dungeon-node-card-inner">
        <div class="node-header-row">
          ${diffPillHtml}
          ${statusBadgeHtml}
        </div>
        <div class="node-icon-wrapper">
          <div class="node-icon-circle">
            <i class="${node.icon}"></i>
          </div>
        </div>
        ${compactStakesHtml}
      </div>
      ${tooltipHtml}
    `;

    el.addEventListener('click', () => {
      void (async () => {
        if (!node.isHub && isHeartsLocked()) {
          const healed = await offerHealPotion();
          if (!healed) {
            this.showToast(t('rm.heartsLockedToast', { time: formatHeartLock(heartLockRemainingMs()) }));
            return;
          }
          this.currentHearts = readHearts();
          this.updateStatsDisplays();
        }
        void this.openModal(node);
      })();
    });

    return el;
  }

  private drawConnectingBranches(): void {
    if (!this.treeSvgCanvas) return;
    this.treeSvgCanvas.innerHTML = '';
    const canvasRect = this.treeSvgCanvas.getBoundingClientRect();
    if (canvasRect.width === 0 || canvasRect.height === 0) return;

    this.treeSvgCanvas.setAttribute('width', `${canvasRect.width}`);
    this.treeSvgCanvas.setAttribute('height', `${canvasRect.height}`);

    this.nodes.forEach(node => {
      if (!node.parents || node.parents.length === 0) return;
      const childEl = document.getElementById(`node_${node.id}`);
      if (!childEl) return;
      const childRect = childEl.getBoundingClientRect();
      const childX = childRect.left + childRect.width / 2 - canvasRect.left;
      const childY = childRect.top + childRect.height / 2 - canvasRect.top;

      node.parents.forEach(parentId => {
        const parentEl = document.getElementById(`node_${parentId}`);
        if (!parentEl) return;
        const parentRect = parentEl.getBoundingClientRect();
        const parentX = parentRect.left + parentRect.width / 2 - canvasRect.left;
        const parentY = parentRect.top + parentRect.height / 2 - canvasRect.top;
        const parentNode = this.nodes.find(n => n.id === parentId);
        const effectiveDifficulty: DungeonDifficulty = (node.difficulty || parentNode?.difficulty || 'normal') as DungeonDifficulty;

        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', this.calculateWindingPath(parentX, parentY, childX, childY, effectiveDifficulty));
        path.classList.add('dungeon-winding-path');
        if (effectiveDifficulty === 'easy') {
          path.classList.add('path-easy');
        } else if (effectiveDifficulty === 'normal') {
          path.classList.add('path-normal');
        } else {
          path.classList.add('path-hard');
        }

        if (node.status === 'mastered' || (parentNode && parentNode.status === 'mastered')) {
          path.classList.add('branch-mastered');
        } else if (node.status === 'locked' && (!parentNode || parentNode.status === 'locked')) {
          path.classList.add('branch-locked');
        } else {
          path.classList.add('branch-active');
        }

        this.treeSvgCanvas!.appendChild(path);
      });
    });
  }

  private calculateWindingPath(
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    difficulty?: DungeonDifficulty
  ): string {
    const dx = x1 - x0;
    const dy = y1 - y0;

    let amp = 35;
    if (difficulty === 'easy') amp = -45;
    else if (difficulty === 'hard') amp = 45;
    else if (difficulty === 'normal') amp = 25;
    else amp = 20;

    // Biên độ uốn tỉ lệ theo bề rộng: màn điện thoại hẹp vẫn giữ dáng lượn như bản laptop.
    const widthFactor = Math.min(1, Math.max(0.42, window.innerWidth / 900));
    amp *= widthFactor;

    const cp1x = x0 + dx * 0.15 + amp * 0.8;
    const cp1y = y0 + dy * 0.25;
    const midX = x0 + dx * 0.5 - amp * 0.6;
    const midY = y0 + dy * 0.5;
    const cp2x = x0 + dx * 0.85 + amp * 0.5;
    const cp2y = y0 + dy * 0.75;

    return `M ${x0.toFixed(1)} ${y0.toFixed(1)} ` +
           `C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ` +
           `${(midX - amp * 0.2).toFixed(1)} ${midY.toFixed(1)}, ` +
           `${midX.toFixed(1)} ${midY.toFixed(1)} ` +
           `S ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ` +
           `${x1.toFixed(1)} ${y1.toFixed(1)}`;
  }

  private async openModal(node: DungeonNode): Promise<void> {
    this.selectedNode = node;
    this.selectedChoiceIdx = null;
    this.summaryState = null;
    this.answerReviews = [];
    this.resetSummaryPanel(false);
    if (!this.nodeModalOverlay) return;

    this.renderModalChrome(node);

    if (!node.isHub && !node.official) {
      this.currentQuestionIdx = 0;
      await this.ensureExtendedPool();
      this.currentQuestionsList = this.generateTrials(node);
      this.renderCurrentQuestion();
    }

    this.nodeModalOverlay.classList.add('active');
  }

  /** Phần chữ UI của modal (không sinh câu hỏi) — gọi lại được khi đổi locale. */
  private renderModalChrome(node: DungeonNode): void {
    if (this.modalNodeBadge) {
      this.modalNodeBadge.innerHTML = `<i class="${node.icon}"></i>`;
    }
    if (this.modalNodeTier) {
      this.modalNodeTier.textContent = node.stageName;
    }
    if (this.modalNodeTitle) {
      this.modalNodeTitle.textContent = node.title;
    }

    if (this.modalNodeStatus) {
      if (node.status === 'mastered') {
        this.modalNodeStatus.textContent = node.isHub ? t('rm.modalReadDone') : (node.official ? t('rm.bossDefeated') : t('rm.modalDone'));
        this.modalNodeStatus.className = 'node-tag status-tag mastered';
      } else if (node.status === 'locked') {
        this.modalNodeStatus.textContent = t('rm.statusLocked');
        this.modalNodeStatus.className = 'node-tag status-tag locked';
      } else {
        this.modalNodeStatus.textContent = node.isHub ? t('rm.modalReadyRead') : (node.official ? t('rm.readyBoss') : t('rm.readyFight'));
        this.modalNodeStatus.className = 'node-tag status-tag available';
      }
    }

    if (node.isHub) {
      if (this.modalTrialBox) this.modalTrialBox.style.display = 'none';
      if (this.modalObjectivesWrap) {
        this.modalObjectivesWrap.style.display = 'none';
      }
      if (this.modalNodePreview) this.modalNodePreview.style.display = 'none';

      if (this.modalNodeXP) {
        this.modalNodeXP.innerHTML = `
          <span style="color: #38bdf8; font-weight:700;"><i class="fa-solid fa-book-open"></i> ${t('rm.hubStakes', { stage: node.stage })}</span>
        `;
      }

      if (this.modalHubReadingBox) {
        this.modalHubReadingBox.style.display = 'block';
        if (this.readingArticleTitle) {
          this.readingArticleTitle.textContent = node.readingArticle?.title || node.title;
        }
        if (this.readingArticleContent) {
          const article = node.readingArticle;
          if (article) {
            const sectionsHtml = article.sections.map(sec => `
              <div class="reading-section-box">
                <h4 class="reading-section-heading">
                  ${sec.icon ? `<i class="${sec.icon}"></i>` : ''} ${escapeHtml(sec.heading)}
                </h4>
                <p class="reading-section-text">${escapeHtml(sec.text).replace(/\n/g, '<br>')}</p>
                ${sec.callout ? `<div class="reading-callout-box"><i class="fa-solid fa-lightbulb"></i> <span>${escapeHtml(sec.callout)}</span></div>` : ''}
              </div>
            `).join('');

            this.readingArticleContent.innerHTML = `
              <p class="reading-lead-p">${escapeHtml(article.lead)}</p>
              ${sectionsHtml}
              <div class="reading-takeaway-box">
                <i class="fa-solid fa-gem"></i>
                <div>
                  <strong>${t('rm.takeaway')}</strong>
                  <p>${escapeHtml(article.keyTakeaway)}</p>
                </div>
              </div>
            `;
          } else {
            this.readingArticleContent.innerHTML = `
              <p class="reading-lead-p">${t('rm.noArticle', { stage: node.stage })}</p>
              <div class="reading-callout-box"><i class="fa-solid fa-circle-info"></i> <span>${t('rm.noArticleHint')}</span></div>
            `;
          }
        }
      }
    } else if (node.official) {
      if (this.modalHubReadingBox) this.modalHubReadingBox.style.display = 'none';
      if (this.modalTrialBox) this.modalTrialBox.style.display = 'none';
      if (this.modalObjectivesWrap) {
        this.modalObjectivesWrap.style.display = 'block';
      }
      if (this.modalNodePreview) this.modalNodePreview.style.display = 'block';

      if (this.modalNodeXP) {
        this.modalNodeXP.innerHTML = `
          <span style="font-weight:700;">${t('rm.officialExam')}</span> •
          <span style="color:#22c55e;">${t('rm.officialXp', { xp: node.xpReward })}</span> •
          <span style="color:#ef4444;">${t('rm.officialPenalty')}</span> •
          <span style="color:#38bdf8;">${t('rm.officialUnlock')}</span>
        `;
      }
      if (this.modalNodeObjectives) {
        this.modalNodeObjectives.innerHTML = node.objectives
          .map(obj => `<li><i class="fa-solid fa-circle-check"></i> <span>${obj}</span></li>`)
          .join('');
      }
      if (this.modalNodePreview) {
        this.modalNodePreview.innerHTML = `<strong>${t('rm.previewLabel')}</strong><br>${node.preview}`;
      }
    } else {
      if (this.modalHubReadingBox) this.modalHubReadingBox.style.display = 'none';
      if (this.modalTrialBox) this.modalTrialBox.style.display = 'block';
      if (this.modalObjectivesWrap) {
        this.modalObjectivesWrap.style.display = 'block';
      }
      if (this.modalNodePreview) this.modalNodePreview.style.display = 'block';

      if (this.modalNodeXP) {
        let diffText = t('rm.diffEasy');
        if (node.difficulty === 'normal') diffText = t('rm.diffNormal');
        else if (node.difficulty === 'hard') diffText = t('rm.diffHard');

        this.modalNodeXP.innerHTML = `
          <span style="font-weight:700;">${t('rm.difficultyLabel', { diff: diffText })}</span> •
          <span style="color:#22c55e;">${t('rm.branchXp', { xp: node.xpReward })}</span> •
          <span style="color:#ef4444;">${t('rm.branchPenalty', { penalty: node.heartPenalty })}</span>
        `;
      }

      if (this.modalNodeObjectives) {
        this.modalNodeObjectives.innerHTML = node.objectives
          .map(obj => `<li><i class="fa-solid fa-circle-check"></i> <span>${obj}</span></li>`)
          .join('');
      }
      if (this.modalNodePreview) {
        this.modalNodePreview.innerHTML = `<strong>${t('rm.previewLabel')}</strong><br>${node.preview}`;
      }
    }

    this.refreshModalButton();
  }

  /** Nhãn nút hành động của modal theo trạng thái hiện tại (dùng lại khi đổi locale). */
  private refreshModalButton(): void {
    const btn = this.btnExecuteTrial;
    const node = this.selectedNode;
    if (!btn || !node) return;

    if (this.summaryState) {
      btn.disabled = false;
      btn.style.opacity = '1';
      btn.className = 'btn-trial-action complete-action';
      btn.innerHTML = `<i class="fa-solid ${this.summaryState.passed ? 'fa-map' : 'fa-door-open'}"></i> ${t(this.summaryState.passed ? 'rm.summaryContinue' : 'rm.summaryExit')}`;
      return;
    }

    if (node.isHub) {
      btn.disabled = false;
      btn.classList.remove('complete-action');
      if (node.status === 'locked') {
        btn.disabled = true;
        btn.innerHTML = `<i class="fa-solid fa-lock"></i> ${t('rm.hubLocked')}`;
        btn.style.opacity = '0.5';
      } else if (node.status === 'mastered') {
        btn.innerHTML = `<i class="fa-solid fa-circle-check"></i> ${t('rm.hubDone')}`;
        btn.style.opacity = '1';
      } else {
        btn.innerHTML = `<i class="fa-solid fa-book-reader"></i> ${t('rm.hubComplete')}`;
        btn.style.opacity = '1';
      }
      return;
    }

    if (this.bossLoading) {
      btn.disabled = true;
      btn.className = 'btn-trial-action check-action';
      btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> ${t('rm.preparing')}`;
      return;
    }

    if (node.official && !this.bossToken && this.currentQuestionsList.length === 0 && this.currentTrialPhase !== 'failed') {
      btn.className = 'btn-trial-action complete-action';
      btn.style.opacity = '1';
      if (node.status === 'locked') {
        btn.disabled = true;
        btn.innerHTML = `<i class="fa-solid fa-lock"></i> ${t('rm.hubLocked')}`;
        btn.style.opacity = '0.5';
      } else if (node.status === 'mastered') {
        btn.disabled = false;
        btn.innerHTML = `<i class="fa-solid fa-rotate-left"></i> ${t('rm.bossRetry')}`;
      } else {
        btn.disabled = false;
        btn.innerHTML = `<i class="fa-solid fa-graduation-cap"></i> ${t('rm.bossStart')}`;
      }
      return;
    }

    if (this.currentTrialPhase === 'failed') {
      btn.disabled = false;
      btn.className = 'btn-trial-action retry-action';
      btn.style.opacity = '1';
      if (this.failReason === 'hearts') {
        btn.innerHTML = `<i class="fa-solid fa-door-open"></i> ${t('rm.exitLesson')}`;
      } else if (this.currentQuestionsList.length === 0) {
        btn.innerHTML = `<i class="fa-solid fa-rotate-right"></i> ${t('rm.retry')}`;
      } else {
        btn.innerHTML = `<i class="fa-solid fa-rotate-right"></i> ${t('rm.retryBoss')}`;
      }
      return;
    }

    if (this.currentTrialPhase === 'checked') {
      if (this.grading) {
        btn.disabled = true;
        btn.className = 'btn-trial-action check-action';
        btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> ${t('rm.gradingAll')}`;
        return;
      }
      const isLastQ = (this.currentQuestionIdx === this.currentQuestionsList.length - 1);
      btn.disabled = false;
      btn.style.opacity = '1';
      if (isLastQ) {
        btn.className = 'btn-trial-action complete-action';
        btn.innerHTML = `<i class="fa-solid fa-circle-check"></i> ${t('rm.complete')}`;
      } else {
        btn.className = 'btn-trial-action next-action';
        btn.innerHTML = `<i class="fa-solid fa-arrow-right"></i> ${t('rm.next')}`;
      }
      return;
    }

    this.refreshCheckButton();
  }

  /** Dịch lại phần chữ UI của câu hỏi đang mở (giữ nguyên lựa chọn / cặp nối / ô điền). */
  private refreshTrialChrome(): void {
    if (!this.modalTrialBox || this.modalTrialBox.style.display === 'none') return;
    if (this.bossLoading) {
      if (this.modalTrialStepBadge) this.modalTrialStepBadge.textContent = t('rm.questionStepPlaceholder');
      if (this.modalTrialPrompt) this.modalTrialPrompt.textContent = t('rm.bossLoadingPrompt');
      if (this.modalTrialChoices) this.modalTrialChoices.innerHTML = `<div class="trial-loading"><i class="fa-solid fa-spinner fa-spin"></i> ${t('rm.bossLoadingChoices')}</div>`;
    } else {
      const trial = this.currentQuestionsList[this.currentQuestionIdx];
      if (trial) {
        if (this.modalTrialStepBadge) {
          this.modalTrialStepBadge.textContent = t('rm.questionStep', { n: this.currentQuestionIdx + 1, total: this.currentQuestionsList.length });
        }
        if (this.modalTrialPrompt) {
          this.modalTrialPrompt.textContent = trial.promptKey ? t(trial.promptKey, trial.promptVars) : trial.prompt;
        }
        const audioBtn = document.getElementById('trialAudioBtn');
        if (audioBtn && !(audioBtn as HTMLButtonElement).disabled) {
          audioBtn.innerHTML = `<i class="fa-solid fa-volume-high"></i> ${t('rm.listenAnswer')}`;
        }
        const fill = document.getElementById('trialFillInput') as HTMLInputElement | null;
        if (fill) fill.placeholder = t('rm.fillPlaceholder');
        const fillHint = this.modalTrialChoices?.querySelector('.trial-fill-hint');
        if (fillHint) fillHint.textContent = t('rm.fillHint');
        const matchHint = this.modalTrialChoices?.querySelector('.trial-match-hint');
        if (matchHint) matchHint.textContent = t('rm.matchHint');
      }
    }
    this.renderTrialHearts();
    if (this.modalTrialResult && this.modalTrialResult.style.display !== 'none' && this.trialResultState) {
      this.modalTrialResult.className = this.trialResultState.className;
      this.modalTrialResult.innerHTML = this.trialResultState.render();
    }
  }

  /** Đổi locale giao diện: dựng lại chữ UI từ dữ liệu đã cache, không gọi API. */
  private handleLocaleChange(): void {
    const titleEl = document.getElementById('activeLessonTitle');
    if (titleEl) titleEl.textContent = t('rm.sessionFormat', { num: this.lessonNumStr || '01', title: this.topicTitle });
    this.updateStatsDisplays();
    if (this.nodes.length) {
      this.buildNodes(this.quizDescription, this.quizTitleRaw, this.readings);
      if (this.quizCompleted) this.mastered.add(this.officialId());
      this.applyStatuses();
      this.renderTree();
    } else {
      if (this.treeMainTitle) this.treeMainTitle.textContent = t('rm.loadingTitle');
      if (this.treeMainSubtitle) this.treeMainSubtitle.innerHTML = `<p class="intro-lead">${t('rm.loadingSubtitle')}</p>`;
      if (this.treeDungeonXp) this.treeDungeonXp.textContent = t('rm.dungeonXpLoading');
    }
    if (this.selectedNode && this.nodeModalOverlay?.classList.contains('active')) {
      const node = this.nodes.find((n) => n.id === this.selectedNode?.id);
      if (node) {
        this.selectedNode = node;
        this.renderModalChrome(node);
        this.refreshTrialChrome();
        if (this.summaryState) this.renderSummary();
      }
    }
  }

  private showTrialResult(className: string, render: () => string): void {
    this.trialResultState = { className, render };
    if (this.modalTrialResult) {
      this.modalTrialResult.style.display = 'block';
      this.modalTrialResult.className = className;
      this.modalTrialResult.innerHTML = render();
    }
  }

  private shuffle<T>(items: T[]): T[] {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  private pickChoices(correct: string, candidates: string[]): string[] {
    const distractors = this.shuffle([...new Set(candidates)].filter((value) => value !== correct)).slice(0, 3);
    return this.shuffle([correct, ...distractors]);
  }

  private async ensureExtendedPool(): Promise<void> {
    if (this.extraPoolLoaded) return;
    this.extraPoolLoaded = true;
    try {
      const response = await slanguageApi(`/api/v1/vocabulary/learning-paths/${this.pathId}`);
      const topics = Array.isArray(asRecord(response.data).topics)
        ? (asRecord(response.data).topics as unknown[])
        : [];
      const passedIds = topics
        .map((item) => asRecord(item))
        .filter((row) => row.is_completed === true && Number(row.id) !== this.topicId)
        .slice(0, 6)
        .map((row) => Number(row.id));
      const known = new Set(this.words.map((word) => word.id));
      for (const topicId of passedIds) {
        const wordsResponse = await slanguageApi(`/api/v1/vocabulary/words?topic_id=${topicId}&limit=100`);
        const items = Array.isArray(asRecord(wordsResponse.data).items)
          ? (asRecord(wordsResponse.data).items as unknown[])
          : [];
        for (const item of items) {
          const row = asRecord(item);
          const word: TopicWord = {
            id: Number(row.id),
            word: asString(row.word),
            meaning: asString(row.meaning),
            phonetic: asString(row.phonetic) || null,
            example_sentence: asString(row.example_sentence) || null,
            example_meaning: asString(row.example_meaning) || null,
          };
          if (word.id && word.word && word.meaning && !known.has(word.id)) {
            known.add(word.id);
            this.extraWords.push(word);
          }
        }
      }
    } catch {
      // Kho từ tích lũy chỉ là phần mở rộng; lỗi thì vẫn chơi với từ của chủ đề hiện tại
    }
  }

  private trialPool(node: DungeonNode): TopicWord[] {
    const base = node.pool && node.pool.length ? node.pool : this.words;
    const seen = new Set<number>();
    const pool: TopicWord[] = [];
    for (const word of [...base, ...this.extraWords]) {
      if (!seen.has(word.id)) {
        seen.add(word.id);
        pool.push(word);
      }
    }
    return pool;
  }

  private generateTrials(node: DungeonNode): DungeonTrial[] {
    const pool = this.trialPool(node);
    const difficulty = node.difficulty || 'easy';
    const mix = { ...TRIAL_MIX[difficulty] };
    if (pool.length < 4) {
      mix.fill += mix.match;
      mix.match = 0;
    }
    const shuffled = this.shuffle(pool);
    let cursor = 0;
    const nextWord = (): TopicWord => shuffled[cursor++ % shuffled.length];
    const wordChoices = pool.map((item) => item.word);
    const meaningChoices = pool.map((item) => item.meaning);
    const trials: DungeonTrial[] = [];

    for (let index = 0; index < mix.mc; index++) {
      const word = nextWord();
      const explanationVars = { word: word.word, meaning: word.meaning };
      if (difficulty === 'easy') {
        const choices = this.pickChoices(word.meaning, meaningChoices);
        trials.push({
          kind: 'mc',
          prompt: t('rm.mcMeaningPrompt', { word: word.word }),
          promptKey: 'rm.mcMeaningPrompt',
          promptVars: { word: word.word },
          choices,
          answerIdx: choices.indexOf(word.meaning),
          explanation: t('rm.wordExplanation', explanationVars),
          explanationKey: 'rm.wordExplanation',
          explanationVars,
        });
      } else {
        const choices = this.pickChoices(word.word, wordChoices);
        trials.push({
          kind: 'mc',
          prompt: t('rm.mcWordPrompt', { meaning: word.meaning }),
          promptKey: 'rm.mcWordPrompt',
          promptVars: { meaning: word.meaning },
          choices,
          answerIdx: choices.indexOf(word.word),
          explanation: t('rm.wordExplanation', explanationVars),
          explanationKey: 'rm.wordExplanation',
          explanationVars,
        });
      }
    }
    for (let index = 0; index < mix.fill; index++) {
      const word = nextWord();
      const explanationVars = { word: word.word, meaning: word.meaning };
      trials.push({
        kind: 'fill',
        prompt: t('rm.fillPrompt', { meaning: word.meaning }),
        promptKey: 'rm.fillPrompt',
        promptVars: { meaning: word.meaning },
        answer: word.word,
        explanation: t('rm.wordExplanation', explanationVars),
        explanationKey: 'rm.wordExplanation',
        explanationVars,
      });
    }
    for (let index = 0; index < mix.match; index++) {
      const group = [nextWord(), nextWord(), nextWord(), nextWord()];
      const pairs: Record<string, string> = {};
      for (const word of group) pairs[word.word] = word.meaning;
      trials.push({
        kind: 'match',
        prompt: t('rm.matchPrompt'),
        promptKey: 'rm.matchPrompt',
        words: this.shuffle(group.map((word) => word.word)),
        meanings: this.shuffle(group.map((word) => word.meaning)),
        pairs,
        explanation: group.map((word) => `${word.word} → ${word.meaning}`).join('; '),
      });
    }
    return this.shuffle(trials);
  }

  private renderTrialHearts(): void {
    if (!this.modalTrialHearts) return;
    const penalty = this.selectedNode?.heartPenalty || 1;
    const cap = getHeartCap();
    const iconCount = cap ?? DEFAULT_MAX_HEARTS;
    const icons = Array.from({ length: iconCount }, (_, index) =>
      `<i class="fa-solid fa-heart" style="color:${cap === null || index < this.currentHearts ? '#ef4444' : '#334155'};"></i>`
    ).join('');
    this.modalTrialHearts.innerHTML = `${icons}<span class="trial-hearts-note">${
      isHeartsLocked()
        ? t('rm.heartsLockedNote', { time: formatHeartLock(heartLockRemainingMs()) })
        : t('rm.wrongPenaltyNote', { penalty })
    }</span>`;
  }

  private renderCurrentQuestion(): void {
    if (!this.selectedNode) return;
    const totalQ = this.currentQuestionsList.length;
    const qIdx = this.currentQuestionIdx;
    const currentTrial = this.currentQuestionsList[qIdx];
    if (!currentTrial) return;
    this.selectedChoiceIdx = null;
    this.matchPairs = new Map();
    this.matchSelectedWord = null;
    this.fillInput = null;
    this.currentTrialPhase = 'idle';
    this.stopAudio();

    if (this.modalTrialStepBadge) {
      this.modalTrialStepBadge.textContent = t('rm.questionStep', { n: qIdx + 1, total: totalQ });
    }
    if (this.modalTrialProgressFill) {
      this.modalTrialProgressFill.style.width = `${((qIdx + 1) / totalQ) * 100}%`;
    }
    if (this.modalTrialResult) {
      this.modalTrialResult.style.display = 'none';
      this.modalTrialResult.textContent = '';
    }
    this.trialResultState = null;
    this.renderTrialHearts();
    if (this.modalTrialPrompt) {
      this.modalTrialPrompt.textContent = currentTrial.promptKey ? t(currentTrial.promptKey, currentTrial.promptVars) : currentTrial.prompt;
    }

    const box = this.modalTrialChoices;
    if (!box) return;
    box.innerHTML = '';
    if (currentTrial.kind === 'mc') {
      currentTrial.choices.forEach((choice, idx) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'dungeon-choice-btn';
        btn.innerHTML = `<span class="choice-num">${String.fromCharCode(65 + idx)}</span> <span>${escapeHtml(choice)}</span>`;
        btn.addEventListener('click', () => {
          if (this.currentTrialPhase !== 'idle') return;
          box.querySelectorAll('.dungeon-choice-btn').forEach(b => b.classList.remove('selected'));
          btn.classList.add('selected');
          this.selectedChoiceIdx = idx;
          this.refreshCheckButton();
        });
        box.appendChild(btn);
      });
    } else if (currentTrial.kind === 'fill') {
      box.innerHTML = `
        <div class="trial-fill-box">
          <button type="button" class="trial-audio-btn" id="trialAudioBtn"><i class="fa-solid fa-volume-high"></i> ${t('rm.listenAnswer')}</button>
          <input type="text" id="trialFillInput" class="trial-fill-input" placeholder="${t('rm.fillPlaceholder')}" autocomplete="off" spellcheck="false">
          <p class="trial-fill-hint">${t('rm.fillHint')}</p>
        </div>`;
      this.fillInput = document.getElementById('trialFillInput') as HTMLInputElement | null;
      document.getElementById('trialAudioBtn')?.addEventListener('click', () => void this.playFillAudio(currentTrial));
      this.fillInput?.addEventListener('input', () => this.refreshCheckButton());
      this.fillInput?.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') void this.handleTrialSubmission();
      });
      void this.playFillAudio(currentTrial);
    } else {
      const wordsHtml = currentTrial.words
        .map((word) => `<button type="button" class="match-item-btn" data-word="${escapeHtml(word)}">${escapeHtml(word)}</button>`)
        .join('');
      const meaningsHtml = currentTrial.meanings
        .map((meaning) => `<button type="button" class="match-item-btn" data-meaning="${escapeHtml(meaning)}">${escapeHtml(meaning)}</button>`)
        .join('');
      box.innerHTML = `
        <div class="trial-match-grid">
          <div class="match-col">${wordsHtml}</div>
          <div class="match-col">${meaningsHtml}</div>
        </div>
        <p class="trial-match-hint">${t('rm.matchHint')}</p>`;
      box.querySelectorAll('[data-word]').forEach((el) => {
        el.addEventListener('click', () => this.handleMatchWordClick(el as HTMLElement, currentTrial));
      });
      box.querySelectorAll('[data-meaning]').forEach((el) => {
        el.addEventListener('click', () => this.handleMatchMeaningClick(el as HTMLElement, currentTrial));
      });
    }
    this.refreshCheckButton();
  }

  private trialReady(): boolean {
    const trial = this.currentQuestionsList[this.currentQuestionIdx];
    if (!trial) return false;
    if (trial.kind === 'mc') return this.selectedChoiceIdx !== null;
    if (trial.kind === 'fill') return !!this.fillInput && this.fillInput.value.trim().length > 0;
    return this.matchPairs.size === trial.words.length;
  }

  private refreshCheckButton(): void {
    if (!this.btnExecuteTrial || !this.selectedNode || this.currentTrialPhase !== 'idle') return;
    this.btnExecuteTrial.className = 'btn-trial-action check-action';
    this.btnExecuteTrial.style.opacity = '1';
    if (this.selectedNode.status === 'locked') {
      this.btnExecuteTrial.disabled = true;
      this.btnExecuteTrial.innerHTML = `<i class="fa-solid fa-lock"></i> ${t('rm.nodeLocked')}`;
      this.btnExecuteTrial.style.opacity = '0.5';
      return;
    }
    this.btnExecuteTrial.disabled = !this.trialReady() || this.grading;
    this.btnExecuteTrial.innerHTML = this.grading
      ? `<i class="fa-solid fa-spinner fa-spin"></i> ${t('rm.grading')}`
      : `<i class="fa-solid fa-magnifying-glass"></i> ${t('rm.check')}`;
  }

  private handleMatchWordClick(btn: HTMLElement, trial: MatchTrial): void {
    if (this.currentTrialPhase !== 'idle') return;
    const word = btn.dataset.word || '';
    if (this.matchPairs.has(word)) {
      this.matchPairs.delete(word);
      this.matchSelectedWord = null;
    } else {
      this.matchSelectedWord = this.matchSelectedWord === word ? null : word;
    }
    this.renderMatchState(trial);
  }

  private handleMatchMeaningClick(btn: HTMLElement, trial: MatchTrial): void {
    if (this.currentTrialPhase !== 'idle') return;
    const meaning = btn.dataset.meaning || '';
    if (!this.matchSelectedWord) {
      this.showToast(t('rm.selectWordFirst'));
      return;
    }
    for (const [word, paired] of [...this.matchPairs.entries()]) {
      if (paired === meaning) this.matchPairs.delete(word);
    }
    this.matchPairs.set(this.matchSelectedWord, meaning);
    this.matchSelectedWord = null;
    this.renderMatchState(trial);
  }

  private renderMatchState(trial: MatchTrial): void {
    const box = this.modalTrialChoices;
    if (!box) return;
    const pairOrder = [...this.matchPairs.keys()];
    box.querySelectorAll('[data-word]').forEach((el) => {
      const btn = el as HTMLElement;
      const word = btn.dataset.word || '';
      const idx = pairOrder.indexOf(word);
      btn.classList.toggle('selected', this.matchSelectedWord === word);
      btn.classList.toggle('paired', idx >= 0);
      btn.innerHTML = `${idx >= 0 ? `<span class="match-pair-num">${idx + 1}</span>` : ''}${escapeHtml(word)}`;
    });
    box.querySelectorAll('[data-meaning]').forEach((el) => {
      const btn = el as HTMLElement;
      const meaning = btn.dataset.meaning || '';
      const word = pairOrder.find((key) => this.matchPairs.get(key) === meaning);
      const idx = word ? pairOrder.indexOf(word) : -1;
      btn.classList.toggle('paired', idx >= 0);
      btn.innerHTML = `${idx >= 0 ? `<span class="match-pair-num">${idx + 1}</span>` : ''}${escapeHtml(meaning)}`;
    });
    this.refreshCheckButton();
  }

  private stopAudio(): void {
    if (this.audioEl) {
      this.audioEl.pause();
      this.audioEl = null;
    }
    if (this.audioUrl) {
      URL.revokeObjectURL(this.audioUrl);
      this.audioUrl = null;
    }
  }

  private async playFillAudio(trial: FillTrial): Promise<void> {
    const btn = document.getElementById('trialAudioBtn') as HTMLButtonElement | null;
    try {
      if (btn) {
        btn.disabled = true;
        btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> ${t('rm.loadingVoice')}`;
      }
      const blob = trial.bossIndex !== undefined && this.bossToken
        ? await slanguageApiAudio('/api/v1/lessons/boss-quiz/speak', { quiz_token: this.bossToken, index: trial.bossIndex })
        : await slanguageApiAudio('/api/v1/chat-ai/tts', { text: trial.answer, language: TTS_LANGUAGE_NAMES[this.currentLang], provider: 'edge' });
      this.stopAudio();
      this.audioUrl = URL.createObjectURL(blob);
      this.audioEl = new Audio(this.audioUrl);
      await this.audioEl.play();
    } catch {
      this.showToast(t('rm.voiceError'));
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `<i class="fa-solid fa-volume-high"></i> ${t('rm.listenAnswer')}`;
      }
    }
  }

  private normalizeText(value: string): string {
    return value.trim().replace(/\s+/g, ' ').toLowerCase();
  }

  private async gradeCurrentTrial(trial: DungeonTrial): Promise<{ isCorrect: boolean; correctDisplay: string; explanation: string }> {
    if (trial.bossIndex !== undefined && this.bossToken) {
      let value: unknown;
      if (trial.kind === 'mc') {
        const mcTrial = trial as McTrial;
        value = mcTrial.optionIds?.[this.selectedChoiceIdx ?? 0]
          ?? this.bossQuestions.find((q) => q.index === trial.bossIndex)?.options?.[this.selectedChoiceIdx ?? 0]?.id
          ?? '';
      } else if (trial.kind === 'fill') {
        value = this.fillInput?.value ?? '';
      } else {
        value = Object.fromEntries(this.matchPairs.entries());
      }
      const response = await slanguageApi('/api/v1/lessons/boss-quiz/grade', {
        method: 'POST',
        body: { quiz_token: this.bossToken, answers: [{ index: trial.bossIndex, value }] },
      });
      const results = Array.isArray(asRecord(response.data).results)
        ? (asRecord(response.data).results as unknown[])
        : [];
      const result = asRecord(results[0]);
      this.bossAnswers = this.bossAnswers.filter((entry) => entry.index !== trial.bossIndex);
      this.bossAnswers.push({ index: trial.bossIndex, value });
      return {
        isCorrect: result.is_correct === true,
        correctDisplay: asString(result.correct_answer),
        explanation: asString(result.explanation),
      };
    }
    const localExplanation = trial.explanationKey ? t(trial.explanationKey, trial.explanationVars) : trial.explanation;
    if (trial.kind === 'mc') {
      return {
        isCorrect: this.selectedChoiceIdx === trial.answerIdx,
        correctDisplay: trial.choices[trial.answerIdx],
        explanation: localExplanation,
      };
    }
    if (trial.kind === 'fill') {
      const typed = this.fillInput?.value ?? '';
      return {
        isCorrect: this.normalizeText(typed) === this.normalizeText(trial.answer),
        correctDisplay: trial.answer,
        explanation: localExplanation,
      };
    }
    const expected = trial.pairs;
    const got = Object.fromEntries(this.matchPairs.entries());
    const isCorrect = Object.keys(expected).length === Object.keys(got).length
      && Object.keys(expected).every((key) => got[key] === expected[key]);
    return {
      isCorrect,
      correctDisplay: Object.keys(expected).map((key) => `${key} → ${expected[key]}`).join('; '),
      explanation: localExplanation,
    };
  }

  private bossToTrial(question: BossPublicQuestion): DungeonTrial {
    if (question.question_type === 'multiple_choice') {
      const shuffledOptions = this.shuffle(question.options || []);
      return {
        kind: 'mc',
        prompt: question.prompt,
        choices: shuffledOptions.map((option) => option.text),
        optionIds: shuffledOptions.map((option) => option.id),
        answerIdx: -1,
        explanation: '',
        bossIndex: question.index,
      };
    }
    if (question.question_type === 'match') {
      return {
        kind: 'match',
        prompt: question.prompt,
        words: this.shuffle(question.words || []),
        meanings: this.shuffle(question.meanings || []),
        pairs: {},
        explanation: '',
        bossIndex: question.index,
      };
    }
    return {
      kind: 'fill',
      prompt: question.prompt,
      answer: '',
      explanation: '',
      bossIndex: question.index,
    };
  }

  private closeModal(): void {
    if (this.nodeModalOverlay) {
      this.nodeModalOverlay.classList.remove('active');
    }
    this.selectedNode = null;
    this.selectedChoiceIdx = null;
    this.currentQuestionIdx = 0;
    this.currentTrialPhase = 'idle';
    this.failReason = null;
    this.grading = false;
    this.bossToken = null;
    this.bossQuestions = [];
    this.bossAnswers = [];
    this.currentQuestionsList = [];
    this.trialResultState = null;
    this.summaryState = null;
    this.answerReviews = [];
    this.resetSummaryPanel();
    this.matchPairs = new Map();
    this.matchSelectedWord = null;
    this.fillInput = null;
    this.stopAudio();
  }

  private async handleTrialSubmission(): Promise<void> {
    if (!this.selectedNode || this.grading) return;
    const node = this.selectedNode;

    if (this.summaryState) {
      this.closeModal();
      return;
    }

    if (node.isHub) {
      if (node.status !== 'mastered') {
        this.markMastered(node);
        this.updateStatsDisplays();
        this.renderTree();
        this.showToast(t('rm.hubDoneToast'));
      }
      this.closeModal();
      return;
    }

    if (node.official && !this.bossToken && this.currentQuestionsList.length === 0) {
      if (node.status === 'locked') return;
      await this.startBossQuiz(node);
      return;
    }

    if (this.currentTrialPhase === 'failed') {
      if (this.currentQuestionsList.length === 0) {
        await this.startBossQuiz(node);
        return;
      }
      if (this.failReason === 'hearts') {
        this.updateStatsDisplays();
        this.openSummary(false, 0, '', t('rm.failedBody', { time: formatHeartLock(heartLockRemainingMs()) }), false);
      } else {
        const correctCount = this.trialCorrectCount();
        this.openSummary(false, 0, '', t('rm.bossNotDefeated', { count: correctCount }), true);
      }
      return;
    }

    if (this.currentTrialPhase === 'idle') {
      const trial = this.currentQuestionsList[this.currentQuestionIdx];
      if (!trial || !this.trialReady()) {
        this.showToast(t('rm.answerFirst'));
        return;
      }
      this.grading = true;
      this.refreshCheckButton();
      let verdict: { isCorrect: boolean; correctDisplay: string; explanation: string };
      try {
        verdict = await this.gradeCurrentTrial(trial);
      } catch (error) {
        this.grading = false;
        this.refreshCheckButton();
        this.showToast(error instanceof Error ? error.message : t('rm.gradeFail'));
        return;
      }
      this.grading = false;
      this.currentTrialPhase = 'checked';
      const isLastQ = (this.currentQuestionIdx === this.currentQuestionsList.length - 1);

      if (trial.kind === 'mc') {
        const allChoices = this.modalTrialChoices?.querySelectorAll('.dungeon-choice-btn');
        const correctIdx = trial.bossIndex !== undefined
          ? trial.choices.indexOf(verdict.correctDisplay)
          : trial.answerIdx;
        if (allChoices) {
          allChoices.forEach(b => (b as HTMLElement).style.pointerEvents = 'none');
          if (this.selectedChoiceIdx !== null && allChoices[this.selectedChoiceIdx]) {
            allChoices[this.selectedChoiceIdx].classList.add(verdict.isCorrect ? 'choice-correct' : 'choice-wrong');
          }
          if (!verdict.isCorrect && correctIdx >= 0 && allChoices[correctIdx]) {
            allChoices[correctIdx].classList.add('choice-correct');
          }
        }
      } else if (trial.kind === 'fill') {
        if (this.fillInput) {
          this.fillInput.disabled = true;
          this.fillInput.classList.add(verdict.isCorrect ? 'fill-correct' : 'fill-wrong');
        }
        document.getElementById('trialAudioBtn')?.setAttribute('disabled', 'true');
      } else {
        this.modalTrialChoices?.querySelectorAll('.match-item-btn').forEach((el) => {
          (el as HTMLElement).style.pointerEvents = 'none';
        });
      }

      const explanationNow = () => trial.explanationKey ? t(trial.explanationKey, trial.explanationVars) : verdict.explanation;
      this.answerReviews.push({
        prompt: trial.promptKey ? t(trial.promptKey, trial.promptVars) : trial.prompt,
        selected: this.describeAnswer(trial),
        correct: verdict.correctDisplay,
        explanation: explanationNow() || '',
        isCorrect: verdict.isCorrect,
      });
      if (verdict.isCorrect) {
        this.showTrialResult('modal-trial-result success', () => `
          <div class="result-icon"><i class="fa-solid fa-circle-check"></i></div>
          <div class="result-text">
            <strong>${t('rm.correctTitle')}</strong>
            <p>${escapeHtml(explanationNow() || verdict.correctDisplay || t('rm.correctFallback'))}</p>
          </div>
        `);
        this.reactToVerdict(true, 0);
      } else {
        const penalty = node.heartPenalty || 1;
        this.currentHearts = spendHearts(penalty);
        this.updateStatsDisplays();
        this.triggerDamageFeedback();
        this.renderTrialHearts();

        this.showTrialResult('modal-trial-result error', () => `
          <div class="result-icon"><i class="fa-solid fa-circle-xmark"></i></div>
          <div class="result-text">
            <strong>${t('rm.wrongTitle', { penalty })}</strong>
            <p>${t('rm.correctAnswer')} <strong>${escapeHtml(verdict.correctDisplay)}</strong>.<br>${escapeHtml(explanationNow() || '')}</p>
          </div>
        `);
        this.reactToVerdict(false, penalty);

        if (this.currentHearts === 0) {
          const healed = await offerHealPotion();
          if (healed) {
            this.currentHearts = readHearts();
            this.updateStatsDisplays();
            this.renderTrialHearts();
            this.showTrialResult('modal-trial-result success', () => `
              <div class="result-icon"><i class="fa-solid fa-heart-pulse"></i></div>
              <div class="result-text">
                <strong>${t('rm.healedTitle')}</strong>
                <p>${t('rm.healedBody', { answer: escapeHtml(verdict.correctDisplay) })}</p>
              </div>
            `);
          } else {
            this.currentTrialPhase = 'failed';
            this.failReason = 'hearts';
            this.showTrialResult('modal-trial-result error', () => `
              <div class="result-icon"><i class="fa-solid fa-heart-crack"></i></div>
              <div class="result-text">
                <strong>${t('rm.failedTitle')}</strong>
                <p>${t('rm.failedBody', { time: formatHeartLock(heartLockRemainingMs()) })}</p>
              </div>
            `);
            if (this.btnExecuteTrial) {
              this.btnExecuteTrial.disabled = false;
              this.btnExecuteTrial.className = 'btn-trial-action complete-action';
              this.btnExecuteTrial.innerHTML = `<i class="fa-solid fa-chart-simple"></i> ${t('rm.viewResult')}`;
            }
            return;
          }
        }
      }

      if (this.btnExecuteTrial) {
        this.btnExecuteTrial.disabled = false;
        if (isLastQ) {
          this.btnExecuteTrial.className = 'btn-trial-action complete-action';
          this.btnExecuteTrial.innerHTML = `<i class="fa-solid fa-circle-check"></i> ${t('rm.complete')}`;
        } else {
          this.btnExecuteTrial.className = 'btn-trial-action next-action';
          this.btnExecuteTrial.innerHTML = `<i class="fa-solid fa-arrow-right"></i> ${t('rm.next')}`;
        }
      }
      return;
    }

    if (this.currentTrialPhase === 'checked') {
      const isLastQ = (this.currentQuestionIdx === this.currentQuestionsList.length - 1);
      if (!isLastQ) {
        this.currentQuestionIdx++;
        this.renderCurrentQuestion();
        return;
      }
      if (node.official) {
        await this.finishBossQuiz(node);
        return;
      }
      if (this.trialCorrectCount() < this.currentQuestionsList.length) {
        this.failTrial();
        return;
      }
      await this.completeTrialNode(node);
    }
  }

  private trialCorrectCount(): number {
    return this.answerReviews.filter((entry) => entry.isCorrect).length;
  }

  /**
   * ải thường chỉ qua khi đúng cả 15 câu (giống điều kiện server ghi nhận boss):
   * sai bất kỳ câu nào → không tích mastered, không XP, nhánh tiếp theo vẫn khóa.
   */
  private failTrial(): void {
    this.currentTrialPhase = 'failed';
    this.failReason = 'trial';
    const total = this.currentQuestionsList.length;
    this.openSummary(false, 0, '', t('rm.trialNotPassed', { correct: this.trialCorrectCount(), total }), true);
  }

  private async completeTrialNode(node: DungeonNode, winNote?: string): Promise<void> {
    this.markMastered(node);

    let awardedXP = node.xpReward;
    let boostNote = '';
    try {
      const response = await slanguageApi('/api/v1/minigame/progress', {
        method: 'POST',
        body: { xp: node.xpReward, word_ids: [], use_boost: true },
      });
      const data = asRecord(response.data);
      const finalXp = Number(data.xp);
      if (Number.isFinite(finalXp) && finalXp >= 0) awardedXP = finalXp;
      const boost = asRecord(data.boost);
      if (typeof boost.title === 'string' && boost.title) boostNote = ` (${boost.title}!)`;
    } catch {
      // Không lưu được server: vẫn cộng XP gốc cục bộ như hành vi cũ.
    }

    this.totalXP += awardedXP;
    localStorage.setItem('slanguage_user_xp', this.totalXP.toString());

    this.updateStatsDisplays();
    this.renderTree();

    this.openSummary(true, awardedXP, boostNote, winNote || t('rm.summaryPassBody'), false);
  }

  /** Màn tổng kết ải: điểm, số câu đúng, XP nhận được, xem lại câu sai. */
  private openSummary(passed: boolean, xp: number, boostNote: string, body: string, retryable: boolean): void {
    const summary = document.getElementById('modalSummaryBox');
    if (!summary) return;
    this.summaryState = { passed, xp, boostNote, body, retryable };
    this.resetSummaryPanel(false);
    if (this.modalTrialBox) this.modalTrialBox.style.display = 'none';
    summary.style.display = 'block';
    summary.classList.remove('is-in');
    void summary.offsetWidth;
    summary.classList.add('is-in');
    if (this.nodeModalOverlay) this.nodeModalOverlay.scrollTop = 0;
    const modalBox = this.nodeModalOverlay?.querySelector<HTMLElement>('.node-modal-box');
    if (modalBox) modalBox.scrollTop = 0;
    this.renderSummary();
    playDungeonCue(passed ? 'pass' : 'fail');
    if (passed && modalBox) launchConfetti(modalBox);
    this.refreshModalButton();
  }

  /** Ẩn bảng tổng kết, trả lại khung thử thách như trước khi làm ải. */
  private resetSummaryPanel(hideTrialBox = true): void {
    this.reviewFilter = 'all';
    const summary = document.getElementById('modalSummaryBox');
    if (summary) {
      summary.style.display = 'none';
      summary.classList.remove('is-in');
    }
    document.getElementById('btnSummaryRetry')?.setAttribute('hidden', '');
    const list = document.getElementById('modalReviewList');
    if (list) list.innerHTML = '';
    if (hideTrialBox && this.modalTrialBox) this.modalTrialBox.style.display = 'none';
  }

  private renderSummary(): void {
    const state = this.summaryState;
    if (!state) return;
    const total = this.answerReviews.length;
    const correct = this.answerReviews.filter((entry) => entry.isCorrect).length;
    const percent = total ? Math.round((correct / total) * 100) : 0;

    const banner = document.getElementById('modalSummaryBanner');
    if (banner) banner.dataset.state = state.passed ? 'pass' : 'fail';
    const icon = document.getElementById('modalSummaryIcon');
    if (icon) icon.className = `fa-solid ${state.passed ? 'fa-trophy' : 'fa-heart-crack'}`;
    const title = document.getElementById('modalSummaryTitle');
    if (title) title.textContent = t(state.passed ? 'rm.summaryPassTitle' : 'rm.summaryFailTitle');
    const text = document.getElementById('modalSummaryText');
    // Mã i18n được phép kèm <strong> trong chữ động nên phải nạp HTML.
    if (text) text.innerHTML = state.body;

    const setText = (id: string, value: string): void => {
      const element = document.getElementById(id);
      if (element) element.textContent = value;
    };
    setText('summaryScore', total ? `${percent}%` : '—');
    setText('summaryCorrect', `${correct}/${total}`);
    setText('summaryXp', state.passed ? `+${state.xp} XP${state.boostNote}` : '+0 XP');
    setText('summaryHearts', formatHearts(this.currentHearts));

    const retry = document.getElementById('btnSummaryRetry');
    if (retry) {
      retry.hidden = !state.retryable;
      const label = retry.querySelector<HTMLElement>('[data-i18n]');
      const node = this.selectedNode;
      if (label && node?.official) label.textContent = t('rm.retryBoss');
    }
    this.openDefaultReviewFilter();
  }

  private applyReviewFilter(filter: 'all' | 'correct' | 'wrong'): void {
    this.reviewFilter = filter;
    document.querySelectorAll<HTMLElement>('#modalReviewFilters .dungeon-review__filter').forEach((tab) => {
      const active = tab.dataset.reviewFilter === filter;
      tab.classList.toggle('is-active', active);
      tab.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    this.renderReviewList();
  }

  private renderReviewList(): void {
    const list = document.getElementById('modalReviewList');
    const empty = document.getElementById('modalReviewEmpty');
    if (!list) return;
    const total = this.answerReviews.length;
    const correctCount = this.answerReviews.filter((entry) => entry.isCorrect).length;
    const wrongCount = total - correctCount;
    const setCount = (id: string, value: number): void => {
      const element = document.getElementById(id);
      if (element) element.textContent = String(value);
    };
    setCount('reviewCountAll', total);
    setCount('reviewCountCorrect', correctCount);
    setCount('reviewCountWrong', wrongCount);

    const entries = this.answerReviews
      .map((entry, index) => ({ entry, no: index + 1 }))
      .filter(({ entry }) => this.reviewFilter === 'all'
        || (this.reviewFilter === 'correct' ? entry.isCorrect : !entry.isCorrect));

    list.innerHTML = entries.map(({ entry, no }) => `
      <li class="d-review ${entry.isCorrect ? 'is-correct' : 'is-wrong'}">
        <div class="d-review__head">
          <span class="d-review__no">${escapeHtml(t('rm.reviewQuestion', { n: no, total }))}</span>
          <span class="d-review__status"><i class="fa-solid ${entry.isCorrect ? 'fa-check' : 'fa-xmark'}"></i> ${escapeHtml(t(entry.isCorrect ? 'rm.reviewStatusCorrect' : 'rm.reviewStatusWrong'))}</span>
        </div>
        <p class="d-review__prompt">${escapeHtml(entry.prompt)}</p>
        <div class="d-review__answers${entry.isCorrect ? ' d-review__answers--single' : ''}">
          <div class="d-review__answer ${entry.isCorrect ? 'is-right' : 'is-wrong'}">
            <span class="d-review__answer-label">${escapeHtml(t('rm.reviewYourAnswer'))}</span>
            <strong>${escapeHtml(entry.selected || '—')}</strong>
          </div>
          ${entry.isCorrect ? '' : `
            <div class="d-review__answer is-right">
              <span class="d-review__answer-label">${escapeHtml(t('rm.reviewCorrectAnswer'))}</span>
              <strong>${escapeHtml(entry.correct || '—')}</strong>
            </div>`}
        </div>
        ${entry.explanation ? `<p class="d-review__note"><i class="fa-solid fa-circle-info"></i> ${escapeHtml(entry.explanation)}</p>` : ''}
      </li>`).join('');

    if (empty) {
      const hasNothing = entries.length === 0;
      empty.hidden = !hasNothing;
      if (hasNothing) {
        empty.textContent = t(this.reviewFilter === 'wrong' ? 'rm.reviewEmptyWrong' : 'rm.reviewEmptyOther');
      }
    }
  }

  /** Chọn bộ lọc mặc định: có câu sai thì mở tab "Sai" để học viên soi lỗi ngay. */
  private openDefaultReviewFilter(): void {
    const hasWrong = this.answerReviews.some((entry) => !entry.isCorrect);
    this.applyReviewFilter(hasWrong ? 'wrong' : 'all');
  }

  private describeAnswer(trial: DungeonTrial): string {
    if (trial.kind === 'mc') {
      return this.selectedChoiceIdx !== null ? (trial.choices[this.selectedChoiceIdx] ?? '—') : '—';
    }
    if (trial.kind === 'fill') return this.fillInput?.value.trim() || '—';
    const pairs = Array.from(this.matchPairs.entries()).map(([word, meaning]) => `${word} → ${meaning}`);
    return pairs.join('; ') || '—';
  }

  /** Toast nổi + âm báo + rung/nhấp nháy khung câu hỏi khi chấm một câu. */
  private reactToVerdict(isCorrect: boolean, heartsLost: number): void {
    const toast = document.getElementById('dungeonVerdictToast');
    if (toast) {
      toast.dataset.state = isCorrect ? 'correct' : 'incorrect';
      const icon = toast.querySelector<HTMLElement>('.dungeon-toast__icon');
      if (icon) icon.className = `dungeon-toast__icon fa-solid ${isCorrect ? 'fa-circle-check' : 'fa-heart-crack'}`;
      const text = toast.querySelector<HTMLElement>('.dungeon-toast__text');
      if (text) {
        text.textContent = isCorrect
          ? t('rm.verdictCorrect')
          : heartsLost > 0
            ? t('rm.verdictHearts', { lost: heartsLost, hearts: formatHearts(this.currentHearts) })
            : t('rm.verdictWrong');
      }
      replayAnimation(toast, 'is-in');
      window.clearTimeout(verdictToastTimer);
      verdictToastTimer = window.setTimeout(() => toast.classList.remove('is-in'), 1800);
    }
    if (this.modalTrialBox) replayAnimation(this.modalTrialBox, isCorrect ? 'is-glow' : 'is-shake');
    playDungeonCue(isCorrect ? 'correct' : 'wrong');
  }

  /** Làm lại ải đang chơi dở (chỉ khi còn tim / boss chưa hạ được). */
  private retryCurrentNode(): void {
    const node = this.selectedNode;
    if (!node || !this.summaryState) return;
    this.summaryState = null;
    this.answerReviews = [];
    this.resetSummaryPanel();
    this.failReason = null;
    this.currentQuestionIdx = 0;
    this.currentTrialPhase = 'idle';
    if (this.modalTrialBox) this.modalTrialBox.style.display = 'block';
    if (node.official) {
      this.bossAnswers = [];
      this.currentQuestionsList = this.shuffle(this.bossQuestions.map((question) => this.bossToTrial(question)));
      this.renderCurrentQuestion();
      return;
    }
    void this.ensureExtendedPool().then(() => {
      this.currentQuestionsList = this.generateTrials(node);
      this.renderCurrentQuestion();
    });
  }

  private async startBossQuiz(node: DungeonNode): Promise<void> {
    this.bossToken = null;
    this.bossAnswers = [];
    this.bossQuestions = [];
    this.currentQuestionsList = [];
    this.currentQuestionIdx = 0;
    this.currentTrialPhase = 'idle';
    this.failReason = null;
    this.bossLoading = true;
    this.trialResultState = null;
    this.stopAudio();

    if (this.modalHubReadingBox) this.modalHubReadingBox.style.display = 'none';
    if (this.modalObjectivesWrap) this.modalObjectivesWrap.style.display = 'none';
    if (this.modalNodePreview) this.modalNodePreview.style.display = 'none';
    if (this.modalTrialBox) this.modalTrialBox.style.display = 'block';
    if (this.modalTrialStepBadge) this.modalTrialStepBadge.textContent = t('rm.questionStepPlaceholder');
    if (this.modalTrialProgressFill) this.modalTrialProgressFill.style.width = '0%';
    this.renderTrialHearts();
    if (this.modalTrialPrompt) {
      this.modalTrialPrompt.textContent = t('rm.bossLoadingPrompt');
    }
    if (this.modalTrialChoices) {
      this.modalTrialChoices.innerHTML = `<div class="trial-loading"><i class="fa-solid fa-spinner fa-spin"></i> ${t('rm.bossLoadingChoices')}</div>`;
    }
    if (this.modalTrialResult) this.modalTrialResult.style.display = 'none';
    if (this.btnExecuteTrial) {
      this.btnExecuteTrial.disabled = true;
      this.btnExecuteTrial.className = 'btn-trial-action check-action';
      this.btnExecuteTrial.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> ${t('rm.preparing')}`;
    }

    try {
      const response = await slanguageApi('/api/v1/lessons/boss-quiz', {
        method: 'POST',
        body: { topic_id: this.topicId, path_id: this.pathId },
      });
      const data = asRecord(response.data);
      this.bossToken = asString(data.quiz_token);
      this.bossQuestions = Array.isArray(data.questions)
        ? (data.questions as unknown[]).map((item) => asRecord(item) as unknown as BossPublicQuestion)
        : [];
      if (!this.bossToken || !this.bossQuestions.length) {
        throw new Error(t('rm.bossNoQuestions'));
      }
      this.bossLoading = false;
      this.currentQuestionsList = this.shuffle(this.bossQuestions.map((question) => this.bossToTrial(question)));
      this.renderCurrentQuestion();
    } catch (error) {
      this.bossLoading = false;
      this.currentTrialPhase = 'failed';
      this.failReason = 'boss';
      const errorMessage = error instanceof Error ? error.message : null;
      this.showTrialResult('modal-trial-result error', () => `
        <div class="result-icon"><i class="fa-solid fa-circle-xmark"></i></div>
        <div class="result-text">
          <strong>${t('rm.bossFailTitle')}</strong>
          <p>${escapeHtml(errorMessage ?? t('rm.unknownError'))} ${t('rm.bossFailRetry')}</p>
        </div>
      `);
      if (this.btnExecuteTrial) {
        this.btnExecuteTrial.disabled = false;
        this.btnExecuteTrial.className = 'btn-trial-action retry-action';
        this.btnExecuteTrial.innerHTML = `<i class="fa-solid fa-rotate-right"></i> ${t('rm.retry')}`;
      }
    }
  }

  private async finishBossQuiz(node: DungeonNode): Promise<void> {
    if (!this.bossToken) return;
    this.grading = true;
    if (this.btnExecuteTrial) {
      this.btnExecuteTrial.disabled = true;
      this.btnExecuteTrial.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> ${t('rm.gradingAll')}`;
    }
    try {
      const response = await slanguageApi('/api/v1/lessons/boss-quiz/grade', {
        method: 'POST',
        body: { quiz_token: this.bossToken, answers: this.bossAnswers },
      });
      const data = asRecord(response.data);
      this.grading = false;
      if (data.passed === true) {
        this.quizCompleted = true;
        await this.completeTrialNode(node, t('rm.bossWinToast'));
      } else {
        const correctCount = Number(data.correct_count) || 0;
        this.currentTrialPhase = 'failed';
        this.failReason = 'boss';
        this.showTrialResult('modal-trial-result error', () => `
          <div class="result-icon"><i class="fa-solid fa-heart-crack"></i></div>
          <div class="result-text">
            <strong>${t('rm.bossNotDefeated', { count: correctCount })}</strong>
            <p>${t('rm.bossNotDefeatedBody')}</p>
          </div>
        `);
        playDungeonCue('fail');
        if (this.btnExecuteTrial) {
          this.btnExecuteTrial.disabled = false;
          this.btnExecuteTrial.className = 'btn-trial-action complete-action';
          this.btnExecuteTrial.innerHTML = `<i class="fa-solid fa-chart-simple"></i> ${t('rm.viewResult')}`;
        }
      }
    } catch (error) {
      this.grading = false;
      this.showToast(error instanceof Error ? error.message : t('rm.bossGradeFail'));
      if (this.btnExecuteTrial) {
        this.btnExecuteTrial.disabled = false;
        this.btnExecuteTrial.className = 'btn-trial-action complete-action';
        this.btnExecuteTrial.innerHTML = `<i class="fa-solid fa-circle-check"></i> ${t('rm.complete')}`;
      }
    }
  }

  private triggerDamageFeedback(): void {
    if (this.navHeartsVal) {
      this.navHeartsVal.style.color = '#ef4444';
      this.navHeartsVal.style.transform = 'scale(1.3)';
      setTimeout(() => {
        if (this.navHeartsVal) {
          this.navHeartsVal.style.color = '';
          this.navHeartsVal.style.transform = '';
        }
      }, 400);
    }
  }

  private async refreshQuizStatus(): Promise<void> {
    if (!this.topicId || !this.pathId) return;
    try {
      const response = await slanguageApi(`/api/v1/lessons/topics/${this.topicId}/lessons?path_id=${this.pathId}`);
      const lessons = Array.isArray(response.data) ? response.data as unknown[] : [];
      const completed = asRecord(lessons[0]).is_completed === true;
      if (completed && !this.quizCompleted) {
        this.quizCompleted = true;
        const official = this.nodes.find((node) => node.official);
        if (official) this.markMastered(official);
        this.renderTree();
        this.showToast(t('rm.quizStatusToast'));
      }
      this.updateStatsDisplays();
    } catch {
      return;
    }
  }

  private showToast(message: string, flagImg?: string): void {
    const toast = document.getElementById('roadmapToast');
    if (!toast) return;

    const flagHtml = flagImg
      ? `<img src="${flagImg}" alt="Flag" style="width: 24px; height: 16px; object-fit: cover; border-radius: 3px; box-shadow: 0 1px 4px rgba(0,0,0,0.4); flex-shrink: 0; vertical-align: middle;">`
      : '';

    toast.style.display = 'flex';
    toast.style.flexDirection = 'column';
    toast.style.alignItems = 'flex-start';
    toast.style.gap = '6px';
    toast.style.border = '2px solid #4ADE80';
    toast.style.background = '#0a0d10';
    toast.style.borderRadius = '16px';
    toast.style.boxShadow = '0 12px 32px rgba(0, 0, 0, 0.8), 0 0 18px rgba(74, 222, 128, 0.3)';
    toast.style.padding = '12px 20px';

    toast.innerHTML = `
      <div style="display: flex; align-items: center; gap: 8px; padding-bottom: 5px; border-bottom: 1px solid rgba(74, 222, 128, 0.25); width: 100%;">
        <i class="fa-solid fa-dungeon" style="color: #4ADE80; font-size: 1rem;"></i>
        <span style="font-size: 0.85rem; font-weight: 700; color: #4ADE80; letter-spacing: 0.2px;">Slanguage Dungeon:</span>
      </div>
      <div style="display: flex; align-items: center; gap: 8px; font-size: 0.95rem; font-weight: 700; color: #ffffff;">
        <span>${message}</span>
        ${flagHtml}
      </div>
    `;

    setTimeout(() => {
      toast.style.display = 'none';
    }, 3800);
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

    window.addEventListener('pageshow', () => {
      const overlay = document.getElementById('slanguageLoadingOverlay');
      if (overlay) overlay.classList.remove('active');
      stopLoadingRive();
      const savedXP = localStorage.getItem('slanguage_user_xp');
      if (savedXP) this.totalXP = parseInt(savedXP, 10) || this.totalXP;
      this.currentHearts = readHearts();
      this.updateStatsDisplays();
      void this.refreshQuizStatus();
    });
  }

  private triggerLoadingAndRedirect(targetUrl: string, duration: number = 1500): void {
    const overlay = document.getElementById('slanguageLoadingOverlay');
    if (overlay) {
      overlay.classList.add('active');
      playLoadingRive();
    }
    setTimeout(() => {
      stopLoadingRive();
      if (overlay) overlay.classList.remove('active');
      window.location.href = targetUrl;
    }, duration);
  }
}

function initSlanguageDungeonTree(): void {
  (window as unknown as { roadmapApp?: SlanguageDungeonTree }).roadmapApp = new SlanguageDungeonTree();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initSlanguageDungeonTree);
} else {
  initSlanguageDungeonTree();
}