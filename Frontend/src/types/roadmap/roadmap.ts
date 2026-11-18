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

import { slanguageApi, slanguageApiAudio } from "../shared/api-client";
import { initializeLearnerHeader, logoutLearner } from "../shared/learner-header";
import {
  formatHeartLock,
  gainHearts,
  heartLockRemainingMs,
  isHeartsLocked,
  readHearts,
  spendHearts,
} from "../shared/hearts";

type DungeonDifficulty = 'easy' | 'normal' | 'hard';
type TargetLang = 'ja' | 'en' | 'vi';

interface TrialBase {
  prompt: string;
  explanation: string;
  bossIndex?: number;
}

interface McTrial extends TrialBase {
  kind: 'mc';
  choices: string[];
  answerIdx: number;
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
  premiumLocked?: boolean;
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

const DIFF_META: Record<DungeonDifficulty, { icon: string; xp: number; hearts: number; title: string; objectives: string[] }> = {
  easy: {
    icon: 'fa-solid fa-feather-pointed',
    xp: 5,
    hearts: 1,
    title: 'Nhánh Dễ: Trắc nghiệm & Điền từ (7:3)',
    objectives: [
      '15 câu ngẫu nhiên: 11 trắc nghiệm + 4 điền từ nghe chính tả',
      'Sai trừ 1 máu — hết máu phải thoát khỏi bài học',
    ],
  },
  normal: {
    icon: 'fa-solid fa-wand-magic-sparkles',
    xp: 10,
    hearts: 2,
    title: 'Nhánh Vừa: Điền từ & Nối nghĩa (5:4:1)',
    objectives: [
      '15 câu ngẫu nhiên: 8 điền từ chính tả + 6 nối từ với nghĩa + 1 trắc nghiệm',
      'Sai trừ 2 máu — hết máu phải thoát khỏi bài học',
    ],
  },
  hard: {
    icon: 'fa-solid fa-skull',
    xp: 15,
    hearts: 3,
    title: 'Nhánh Khó: Điền từ & Nối nghĩa (5:4:1)',
    objectives: [
      '15 câu ngẫu nhiên: 8 điền từ chính tả + 6 nối từ với nghĩa + 1 trắc nghiệm',
      'Sai trừ 3 máu — hết máu phải thoát khỏi bài học',
    ],
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

class SlanguageDungeonTree {
  private currentLang: TargetLang = 'ja';
  private totalXP: number = 0;
  private currentHearts: number = 5;
  private maxHearts: number = 5;
  // Số tầng miễn phí; các tầng sau là khu vực Premium
  private readonly FREE_TIERS = 2;
  private isPremiumUser = false;
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

  // Quiz Boss (AI chấm phía server) & trạng thái câu hỏi nhiều dạng
  private bossToken: string | null = null;
  private bossQuestions: BossPublicQuestion[] = [];
  private bossAnswers: Array<{ index: number; value: unknown }> = [];
  private failReason: 'hearts' | 'boss' | null = null;
  private matchPairs: Map<string, string> = new Map();
  private matchSelectedWord: string | null = null;
  private fillInput: HTMLInputElement | null = null;
  private audioUrl: string | null = null;
  private audioEl: HTMLAudioElement | null = null;
  private extraWords: TopicWord[] = [];
  private extraPoolLoaded = false;
  private grading = false;

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
    if (localStorage.getItem('slanguage_is_logged_in') !== 'true') {
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
      if (titleEl) titleEl.textContent = `Session ${asString(parsed.numStr) || '01'} - ${title}`;
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
    const rawNative = (localStorage.getItem('slanguage_native_language') || 'vi').toLowerCase();
    const nativeLang = rawNative.includes('vi') || rawNative.includes('việt') ? 'vi' : (rawNative.includes('en') || rawNative.includes('anh') ? 'en' : (rawNative.includes('ja') || rawNative.includes('nhật') ? 'ja' : 'vi'));

    localStorage.setItem('slanguage_active_language', this.currentLang);
    localStorage.setItem('slanguage_current_lang', this.currentLang);

    document.querySelectorAll<HTMLElement>('.lang-dropdown-item').forEach(item => {
      item.style.display = item.getAttribute('data-lang') === nativeLang ? 'none' : 'flex';
    });

    // Bản cũ ghi sẵn 2450 XP giả vào storage — dọn một lần duy nhất
    if (!localStorage.getItem('slanguage_xp_v2_reset')) {
      localStorage.removeItem('slanguage_user_xp');
      localStorage.setItem('slanguage_xp_v2_reset', '1');
    }
    const savedXP = localStorage.getItem('slanguage_user_xp');
    if (savedXP) {
      this.totalXP = parseInt(savedXP, 10) || 0;
    }
    this.isPremiumUser = localStorage.getItem('slanguage_is_premium') === 'true';
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

    this.updateStatsDisplays();
  }

  private initEventListeners(): void {
    const isLoggedIn = localStorage.getItem('slanguage_is_logged_in') === 'true';
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

    document.querySelectorAll('.lang-dropdown-item').forEach(item => {
      item.addEventListener('click', () => {
        const lang = item.getAttribute('data-lang') as TargetLang;
        if (lang) this.switchLanguage(lang);
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

    window.addEventListener('resize', () => {
      this.drawConnectingBranches();
    });

    this.bindPageTransitions();
  }

  public switchLanguage(lang: TargetLang): void {
    if (lang === this.currentLang) return;
    localStorage.setItem('slanguage_current_lang', lang);
    localStorage.setItem('slanguage_active_language', lang);
    void slanguageApi('/api/v1/me', { method: 'PATCH', body: { target_language: lang } }).catch(() => {});
    this.showToast('Đổi ngôn ngữ sẽ quay lại trang chọn chủ đề của lộ trình mới.');
    window.location.assign('../select-lesson/index.html');
  }

  private updateStatsDisplays(): void {
    if (this.navXPVal) this.navXPVal.textContent = `${this.totalXP.toLocaleString()} XP`;
    if (this.treeTotalXP) this.treeTotalXP.textContent = `${this.totalXP.toLocaleString()} XP`;
    if (this.treeLevelVal) this.treeLevelVal.textContent = `Level ${Math.floor(this.totalXP / 100) + 1}`;
    if (this.navHeartsVal) {
      this.navHeartsVal.textContent = `${this.currentHearts}/${this.maxHearts}`;
      const chip = this.navHeartsVal.closest<HTMLElement>('.hud-chip, .stat-chip') || this.navHeartsVal;
      chip.title = isHeartsLocked()
        ? `Hết máu — sinh lực khóa hồi 24 giờ, còn ${formatHeartLock(heartLockRemainingMs())}`
        : `Sinh lực: ${this.currentHearts}/${this.maxHearts}`;
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

  private async loadDungeon(): Promise<void> {
    try {
      const [wordsResponse, lessonsResponse, readingsResponse] = await Promise.all([
        slanguageApi(`/api/v1/vocabulary/words?topic_id=${this.topicId}&limit=100`),
        slanguageApi(`/api/v1/lessons/topics/${this.topicId}/lessons?path_id=${this.pathId}`),
        slanguageApi(`/api/v1/lessons/topics/${this.topicId}/readings`).catch(() => null),
      ]);
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
        throw new Error('Chủ đề chưa có từ vựng hoặc bài học trong Database. Hãy nạp SeedData rồi thử lại.');
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
      this.buildNodes(asString(quiz.description), asString(quiz.title) || this.topicTitle, readings);
      if (this.quizCompleted) this.mastered.add(this.officialId());
      this.applyStatuses();
      this.renderTree();
    } catch (error) {
      this.showToast(error instanceof Error ? error.message : 'Không thể tải dungeon của chủ đề từ Database.');
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
      const stageName = `MỐC ${stage}: ${this.topicTitle.toUpperCase()}`;
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
        title: entry?.title.trim() || `Bài đọc tầng ${stage}: ${this.topicTitle}`,
        desc: `Chặng ${stage}/5 • ${pool.length} từ vựng trọng tâm`,
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
            title: 'BOSS: Kiểm tra AI (25 câu)',
            desc: 'AI soạn 25 câu từ tất cả chủ đề — đúng hết để mở chủ đề kế tiếp',
            icon: 'fa-solid fa-dragon',
            xpReward: this.quizXp,
            heartPenalty: 1,
            status: 'locked',
            parents: [hubId],
            objectives: [
              '25 câu trộn trắc nghiệm, điền từ nghe chính tả và nối từ với nghĩa',
              'AI soạn đề từ toàn bộ chủ đề của lộ trình',
              'Sai trừ 1 máu; đúng cả 25 để máy chủ ghi nhận hoàn thành chủ đề',
            ],
            preview: 'Quiz Boss gọi AI tạo câu hỏi mới mỗi lần mở, phủ rộng mọi chủ đề đã có.',
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
          title: meta.title,
          desc: `Chặng ${stage}/5 • 15 câu ngẫu nhiên từ kho từ đã tích lũy`,
          icon: meta.icon,
          xpReward: meta.xp,
          heartPenalty: meta.hearts,
          status: 'locked',
          parents: [hubId],
          objectives: meta.objectives,
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
      lead: `Đọc kỹ bài đọc của chủ đề "${this.topicTitle}" rồi bấm hoàn thành để mở 3 nhánh thử thách của chặng.`,
      sections: (paragraphs.length ? paragraphs : [passage]).map((text, index) => ({
        heading: `Đoạn ${index + 1}`,
        icon: 'fa-solid fa-book-open',
        text,
      })),
      keyTakeaway: translation || 'Chủ đề chưa có bản dịch trong Database.',
    };
  }

  private buildStageArticle(entry: TopicReadingEntry, stage: number): DungeonReadingArticle | undefined {
    const passage = entry.passage.trim();
    if (!passage) return undefined;
    const paragraphs = passage.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);
    return {
      title: entry.title.trim() || `Bài đọc tầng ${stage}: ${this.topicTitle}`,
      lead: `Đọc kỹ bài đọc tầng ${stage} của chủ đề "${this.topicTitle}" rồi bấm hoàn thành để mở 3 nhánh thử thách của tầng.`,
      sections: (paragraphs.length ? paragraphs : [passage]).map((text, index) => ({
        heading: `Đoạn ${index + 1}`,
        icon: 'fa-solid fa-book-open',
        text,
      })),
      keyTakeaway: entry.translation.trim() || 'Bài đọc chưa có bản dịch trong Database.',
    };
  }

  private applyStatuses(): void {
    // Đọc xong bài đọc (hub) chỉ mở 3 nhánh thử thách của tầng đó; tầng sau
    // mở khi vượt ÍT NHẤT 1 ải bất kỳ của tầng trước.
    const stageOpen = (stage: number): boolean =>
      stage === 1 ||
      this.nodes
        .filter((node) => node.stage === stage - 1 && !node.isHub)
        .some((node) => this.mastered.has(node.id));
    for (const node of this.nodes) {
      node.premiumLocked = !this.isPremiumUser && node.stage > this.FREE_TIERS && !this.mastered.has(node.id);
      if (this.mastered.has(node.id)) {
        node.status = 'mastered';
      } else if (node.premiumLocked || !stageOpen(node.stage) || (!node.isHub && !this.mastered.has(this.hubId(node.stage)))) {
        node.status = 'locked';
      } else {
        node.status = 'available';
      }
    }
  }

  private persistProgress(): void {
    localStorage.setItem(this.storageKey, JSON.stringify([...this.mastered]));
  }

  private markMastered(node: DungeonNode): void {
    this.mastered.add(node.id);
    this.persistProgress();
    this.applyStatuses();
  }

  private renderTree(): void {
    if (!this.treeNodesFlow || !this.nodes.length) return;

    if (this.treeMainTitle) {
      this.treeMainTitle.textContent = `Dungeon 5 Tầng: ${this.topicTitle}`;
    }
    if (this.treeMainSubtitle) {
      this.treeMainSubtitle.innerHTML = `
        <p class="intro-lead">
          Mỗi tầng gồm một mốc <strong>bài đọc riêng</strong> tải từ Database (5 bài/chủ đề) và 3 nhánh thử thách
          <strong>Dễ / Vừa / Khó</strong> sinh câu hỏi ngẫu nhiên từ từ vựng của chủ đề.
          Đọc xong mốc để mở nhánh, vượt tầng trước để mở tầng sau; tầng 5 có Boss quiz AI 25 câu mở chủ đề kế tiếp.
          ${this.isPremiumUser ? '' : `Tầng ${this.FREE_TIERS + 1} trở lên là <strong>khu vực Premium 👑</strong> — cần nâng cấp để học tiếp.`}
        </p>`;
    }

    const totalRooms = this.nodes.filter(n => !n.isHub).length;
    const masteredRooms = this.nodes.filter(n => !n.isHub && n.status === 'mastered').length;
    const progressPercent = Math.round((masteredRooms / totalRooms) * 100);

    if (this.treeProgressFill) this.treeProgressFill.style.width = `${progressPercent}%`;
    if (this.treeProgressPercent) this.treeProgressPercent.textContent = `${progressPercent}%`;
    if (this.treeNodesRatio) this.treeNodesRatio.textContent = `${masteredRooms} / ${totalRooms} Ải đã vượt`;

    const dungeonXpMax = this.nodes.filter(n => !n.isHub).reduce((sum, n) => sum + n.xpReward, 0);
    const dungeonXpEarned = this.nodes.filter(n => !n.isHub && this.mastered.has(n.id)).reduce((sum, n) => sum + n.xpReward, 0);
    if (this.treeDungeonXp) this.treeDungeonXp.textContent = `Dungeon này: ${dungeonXpEarned} / ${dungeonXpMax} XP có thể đạt`;

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

    this.treeNodesFlow.innerHTML = '';
    for (let s = 1; s <= 5; s++) {
      const stageData = stages[s];
      const stageEl = document.createElement('div');
      stageEl.className = 'dungeon-stage-section';
      stageEl.setAttribute('data-stage', s.toString());

      const stagePill = document.createElement('div');
      stagePill.className = 'dungeon-stage-pill';
      const premiumTag = !this.isPremiumUser && s > this.FREE_TIERS ? ' <i class="fa-solid fa-crown"></i>' : '';
      stagePill.innerHTML = `<i class="fa-solid fa-dungeon"></i> TẦNG ${s}: ${stageData.hub ? stageData.hub.stageName : `CHỦ ĐỀ ${s}`}${premiumTag}`;
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
    let statusText = 'Đang khóa 🔒';
    if (node.status === 'mastered') {
      statusBadgeHtml = `<div class="node-status-badge mastered"><i class="fa-solid fa-check"></i></div>`;
      statusText = node.isHub ? 'Đã đọc bài 📖' : (node.official ? 'Đã hạ Boss 🌟' : 'Đã vượt ải 🌟');
    } else if (node.premiumLocked) {
      statusBadgeHtml = `<div class="node-status-badge locked premium"><i class="fa-solid fa-crown"></i></div>`;
      statusText = node.isHub ? 'Mốc Premium 👑 — cần nâng cấp' : 'Ải Premium 👑 — cần nâng cấp';
    } else if (node.status === 'current') {
      statusBadgeHtml = `<div class="node-status-badge current"><i class="fa-solid fa-play"></i></div>`;
      statusText = node.isHub ? 'Đang đọc 📖' : 'Đang mở ⚡';
    } else if (node.status === 'available') {
      statusBadgeHtml = `<div class="node-status-badge available"><i class="fa-solid fa-unlock"></i></div>`;
      statusText = node.isHub ? 'Sẵn sàng đọc 📖' : (node.official ? 'Sẵn sàng hạ Boss 🎓' : 'Sẵn sàng khiêu chiến ⚔️');
    } else {
      statusBadgeHtml = `<div class="node-status-badge locked"><i class="fa-solid fa-lock"></i></div>`;
      statusText = 'Đang khóa 🔒';
    }

    let diffPillHtml = '';
    if (node.isHub) {
      diffPillHtml = `<span class="diff-chip chip-hub"><i class="fa-solid fa-book-open"></i> MỐC ${node.stage}</span>`;
    } else if (node.official) {
      diffPillHtml = `<span class="diff-chip chip-hard"><i class="fa-solid fa-crown"></i> BOSS</span>`;
    } else if (node.difficulty === 'easy') {
      diffPillHtml = `<span class="diff-chip chip-easy"><i class="fa-solid fa-feather"></i> DỄ</span>`;
    } else if (node.difficulty === 'normal') {
      diffPillHtml = `<span class="diff-chip chip-normal"><i class="fa-solid fa-shield-halved"></i> VỪA</span>`;
    } else {
      diffPillHtml = `<span class="diff-chip chip-hard"><i class="fa-solid fa-skull"></i> KHÓ</span>`;
    }

    let compactStakesHtml = '';
    if (node.isHub) {
      compactStakesHtml = `<div class="node-compact-stakes hub-mode"><span class="stake-reading-tag"><i class="fa-solid fa-book-open"></i> Bài đọc chủ đề</span></div>`;
    } else if (node.official) {
      compactStakesHtml = `<div class="node-compact-stakes"><span class="stake-win">+${node.xpReward} XP</span><span class="stake-reading-tag"><i class="fa-solid fa-graduation-cap"></i> 25/25 mở chủ đề kế</span></div>`;
    } else if (node.difficulty === 'easy') {
      compactStakesHtml = `<div class="node-compact-stakes"><span class="stake-win">+5 XP</span><span class="stake-loss">-1 ❤️</span></div>`;
    } else if (node.difficulty === 'normal') {
      compactStakesHtml = `<div class="node-compact-stakes"><span class="stake-win">+10 XP</span><span class="stake-loss">-2 ❤️</span></div>`;
    } else {
      compactStakesHtml = `<div class="node-compact-stakes"><span class="stake-win">+15 XP</span><span class="stake-loss">-3 ❤️</span></div>`;
    }

    let tooltipStakesHtml = '';
    let clickHint = '<i class="fa-solid fa-hand-pointer"></i> Nhấn để mở phòng thử thách';
    if (node.isHub) {
      tooltipStakesHtml = `
        <div class="tooltip-stakes-bar hub-mode">
          <span class="stake-info" style="color: #38bdf8; font-weight:700;"><i class="fa-solid fa-book-open"></i> Bài đọc chủ đề (Không tính thưởng / phạt)</span>
        </div>`;
      clickHint = '<i class="fa-solid fa-book-reader"></i> Nhấn để mở bài đọc chuyên đề';
    } else if (node.official) {
      tooltipStakesHtml = `
        <div class="tooltip-stakes-bar">
          <span class="stake-win"><i class="fa-solid fa-trophy"></i> Đạt 25/25: +${node.xpReward} XP (máy chủ chấm)</span>
        </div>`;
      clickHint = '<i class="fa-solid fa-graduation-cap"></i> Nhấn để vào bài kiểm tra chính thức';
    } else {
      tooltipStakesHtml = `
        <div class="tooltip-stakes-bar">
          <span class="stake-win"><i class="fa-solid fa-trophy"></i> Thắng: +${node.xpReward} XP</span>
          ${node.heartPenalty > 0 ? `<span class="stake-loss"><i class="fa-solid fa-heart-crack"></i> Thua: -${node.heartPenalty} ❤️</span>` : ''}
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
      if (node.premiumLocked) {
        this.showPremiumModal();
        return;
      }
      if (!node.isHub && isHeartsLocked()) {
        this.showToast(`💔 Hết máu! Sinh lực bị khóa hồi 24 giờ — còn ${formatHeartLock(heartLockRemainingMs())} nữa mới hồi đầy.`);
        return;
      }
      void this.openModal(node);
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
    if (!this.nodeModalOverlay) return;

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
        this.modalNodeStatus.textContent = node.isHub ? 'Đã hoàn thành bài đọc 📖' : (node.official ? 'Đã hạ Boss 🌟' : 'Đã hoàn thành 🌟');
        this.modalNodeStatus.className = 'node-tag status-tag mastered';
      } else if (node.status === 'locked') {
        this.modalNodeStatus.textContent = 'Đang khóa 🔒';
        this.modalNodeStatus.className = 'node-tag status-tag locked';
      } else {
        this.modalNodeStatus.textContent = node.isHub ? 'Sẵn sàng đọc bài 📖' : (node.official ? 'Sẵn sàng hạ Boss 🎓' : 'Sẵn sàng khiêu chiến ⚔️');
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
          <span style="color: #38bdf8; font-weight:700;"><i class="fa-solid fa-book-open"></i> Bài Đọc Tầng ${node.stage}: Tiếp thu kiến thức cốt lõi (Không thưởng / phạt)</span>
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
                  <strong>Điểm Cốt Lõi:</strong>
                  <p>${escapeHtml(article.keyTakeaway)}</p>
                </div>
              </div>
            `;
          } else {
            this.readingArticleContent.innerHTML = `
              <p class="reading-lead-p">Tầng ${node.stage} của chủ đề này chưa có bài đọc trong Database.</p>
              <div class="reading-callout-box"><i class="fa-solid fa-circle-info"></i> <span>Quản trị viên có thể soạn bài đọc cho tầng này ở tab “Quản lý Bài đọc” trong trang Quản trị (mỗi chủ đề 5 bài, tương ứng 5 tầng). Bạn vẫn có thể hoàn thành mốc để mở các nhánh thử thách.</span></div>
            `;
          }
        }
      }

      if (this.btnExecuteTrial) {
        this.btnExecuteTrial.disabled = false;
        this.btnExecuteTrial.classList.remove('complete-action');
        if (node.status === 'locked') {
          this.btnExecuteTrial.disabled = true;
          this.btnExecuteTrial.innerHTML = `<i class="fa-solid fa-lock"></i> Mốc chủ đề chưa mở khóa`;
          this.btnExecuteTrial.style.opacity = '0.5';
        } else if (node.status === 'mastered') {
          this.btnExecuteTrial.innerHTML = `<i class="fa-solid fa-circle-check"></i> Đã hoàn thành bài đọc (Đóng lại)`;
          this.btnExecuteTrial.style.opacity = '1';
        } else {
          this.btnExecuteTrial.innerHTML = `<i class="fa-solid fa-book-reader"></i> Đã Đọc Xong & Hoàn Thành Chủ Đề 🌟`;
          this.btnExecuteTrial.style.opacity = '1';
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
          <span style="font-weight:700;">Bài kiểm tra chính thức</span> •
          <span style="color:#22c55e;">+${node.xpReward} XP khi đạt 25/25</span> •
          <span style="color:#ef4444;">-1 Máu mỗi câu sai</span> •
          <span style="color:#38bdf8;">Mở khóa chủ đề kế tiếp</span>
        `;
      }
      if (this.modalNodeObjectives) {
        this.modalNodeObjectives.innerHTML = node.objectives
          .map(obj => `<li><i class="fa-solid fa-circle-check"></i> <span>${obj}</span></li>`)
          .join('');
      }
      if (this.modalNodePreview) {
        this.modalNodePreview.innerHTML = `<strong>Minh họa kiến thức:</strong><br>${node.preview}`;
      }
      if (this.btnExecuteTrial) {
        this.btnExecuteTrial.className = 'btn-trial-action complete-action';
        this.btnExecuteTrial.style.opacity = '1';
        if (node.status === 'locked') {
          this.btnExecuteTrial.disabled = true;
          this.btnExecuteTrial.innerHTML = `<i class="fa-solid fa-lock"></i> Mốc chủ đề chưa mở khóa`;
          this.btnExecuteTrial.style.opacity = '0.5';
        } else if (node.status === 'mastered') {
          this.btnExecuteTrial.disabled = false;
          this.btnExecuteTrial.innerHTML = `<i class="fa-solid fa-rotate-left"></i> Làm lại Boss quiz (25 câu)`;
        } else {
          this.btnExecuteTrial.disabled = false;
          this.btnExecuteTrial.innerHTML = `<i class="fa-solid fa-graduation-cap"></i> Bắt đầu Boss quiz (25 câu)`;
        }
      }
    } else {
      if (this.modalHubReadingBox) this.modalHubReadingBox.style.display = 'none';
      if (this.modalTrialBox) this.modalTrialBox.style.display = 'block';
      if (this.modalObjectivesWrap) {
        this.modalObjectivesWrap.style.display = 'block';
      }
      if (this.modalNodePreview) this.modalNodePreview.style.display = 'block';

      if (this.modalNodeXP) {
        let diffText = 'Dễ (Light Green)';
        if (node.difficulty === 'normal') diffText = 'Bình thường (Light Yellow)';
        else if (node.difficulty === 'hard') diffText = 'Khó (Light Red Crimson)';

        this.modalNodeXP.innerHTML = `
          <span style="font-weight:700;">Độ khó: ${diffText}</span> •
          <span style="color:#22c55e;">+${node.xpReward} XP nếu hoàn thành</span> •
          <span style="color:#ef4444;">-${node.heartPenalty} Máu nếu sai</span>
        `;
      }

      if (this.modalNodeObjectives) {
        this.modalNodeObjectives.innerHTML = node.objectives
          .map(obj => `<li><i class="fa-solid fa-circle-check"></i> <span>${obj}</span></li>`)
          .join('');
      }
      if (this.modalNodePreview) {
        this.modalNodePreview.innerHTML = `<strong>Minh họa kiến thức:</strong><br>${node.preview}`;
      }

      this.currentQuestionIdx = 0;
      await this.ensureExtendedPool();
      this.currentQuestionsList = this.generateTrials(node);
      this.renderCurrentQuestion();
    }

    this.nodeModalOverlay.classList.add('active');
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
      const explanation = `"${word.word}" nghĩa là "${word.meaning}".`;
      if (difficulty === 'easy') {
        const choices = this.pickChoices(word.meaning, meaningChoices);
        trials.push({
          kind: 'mc',
          prompt: `Từ "${word.word}" có nghĩa là gì?`,
          choices,
          answerIdx: choices.indexOf(word.meaning),
          explanation,
        });
      } else {
        const choices = this.pickChoices(word.word, wordChoices);
        trials.push({
          kind: 'mc',
          prompt: `Chọn từ đúng với nghĩa: "${word.meaning}"`,
          choices,
          answerIdx: choices.indexOf(word.word),
          explanation,
        });
      }
    }
    for (let index = 0; index < mix.fill; index++) {
      const word = nextWord();
      trials.push({
        kind: 'fill',
        prompt: `Nghĩa: "${word.meaning}". Nghe giọng đọc và viết lại từ bạn nghe được.`,
        answer: word.word,
        explanation: `"${word.word}" nghĩa là "${word.meaning}".`,
      });
    }
    for (let index = 0; index < mix.match; index++) {
      const group = [nextWord(), nextWord(), nextWord(), nextWord()];
      const pairs: Record<string, string> = {};
      for (const word of group) pairs[word.word] = word.meaning;
      trials.push({
        kind: 'match',
        prompt: 'Nối mỗi từ với nghĩa đúng của nó:',
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
    const icons = Array.from({ length: this.maxHearts }, (_, index) =>
      `<i class="fa-solid fa-heart" style="color:${index < this.currentHearts ? '#ef4444' : '#334155'};"></i>`
    ).join('');
    this.modalTrialHearts.innerHTML = `${icons}<span class="trial-hearts-note">${
      isHeartsLocked()
        ? `Hết máu — hồi sau ${formatHeartLock(heartLockRemainingMs())}`
        : `Sai trừ ${penalty} máu`
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
      this.modalTrialStepBadge.textContent = `Câu ${qIdx + 1}/${totalQ}`;
    }
    if (this.modalTrialProgressFill) {
      this.modalTrialProgressFill.style.width = `${((qIdx + 1) / totalQ) * 100}%`;
    }
    if (this.modalTrialResult) {
      this.modalTrialResult.style.display = 'none';
      this.modalTrialResult.textContent = '';
    }
    this.renderTrialHearts();
    if (this.modalTrialPrompt) {
      this.modalTrialPrompt.textContent = currentTrial.prompt;
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
          <button type="button" class="trial-audio-btn" id="trialAudioBtn"><i class="fa-solid fa-volume-high"></i> Nghe đáp án</button>
          <input type="text" id="trialFillInput" class="trial-fill-input" placeholder="Gõ từ bạn nghe được..." autocomplete="off" spellcheck="false">
          <p class="trial-fill-hint">Không phân biệt hoa/thường. Bấm "Nghe đáp án" để nghe lại giọng đọc.</p>
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
        <p class="trial-match-hint">Chọn một từ ở cột trái rồi chọn nghĩa tương ứng ở cột phải. Bấm lại từ đã nối để gỡ cặp.</p>`;
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
      this.btnExecuteTrial.innerHTML = `<i class="fa-solid fa-lock"></i> Ải chưa mở khóa`;
      this.btnExecuteTrial.style.opacity = '0.5';
      return;
    }
    this.btnExecuteTrial.disabled = !this.trialReady() || this.grading;
    this.btnExecuteTrial.innerHTML = this.grading
      ? `<i class="fa-solid fa-spinner fa-spin"></i> Đang chấm...`
      : `<i class="fa-solid fa-magnifying-glass"></i> Kiểm tra`;
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
      this.showToast('Hãy chọn một từ ở cột trái trước khi chọn nghĩa!');
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
        btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Đang tải giọng...`;
      }
      const blob = trial.bossIndex !== undefined && this.bossToken
        ? await slanguageApiAudio('/api/v1/lessons/boss-quiz/speak', { quiz_token: this.bossToken, index: trial.bossIndex })
        : await slanguageApiAudio('/api/v1/chat-ai/tts', { text: trial.answer, language: TTS_LANGUAGE_NAMES[this.currentLang], provider: 'edge' });
      this.stopAudio();
      this.audioUrl = URL.createObjectURL(blob);
      this.audioEl = new Audio(this.audioUrl);
      await this.audioEl.play();
    } catch {
      this.showToast('Không tải được giọng đọc. Bấm "Nghe đáp án" để thử lại.');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `<i class="fa-solid fa-volume-high"></i> Nghe đáp án`;
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
        const question = this.bossQuestions[trial.bossIndex];
        value = question?.options?.[this.selectedChoiceIdx ?? 0]?.id ?? '';
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
    if (trial.kind === 'mc') {
      return {
        isCorrect: this.selectedChoiceIdx === trial.answerIdx,
        correctDisplay: trial.choices[trial.answerIdx],
        explanation: trial.explanation,
      };
    }
    if (trial.kind === 'fill') {
      const typed = this.fillInput?.value ?? '';
      return {
        isCorrect: this.normalizeText(typed) === this.normalizeText(trial.answer),
        correctDisplay: trial.answer,
        explanation: trial.explanation,
      };
    }
    const expected = trial.pairs;
    const got = Object.fromEntries(this.matchPairs.entries());
    const isCorrect = Object.keys(expected).length === Object.keys(got).length
      && Object.keys(expected).every((key) => got[key] === expected[key]);
    return {
      isCorrect,
      correctDisplay: Object.keys(expected).map((key) => `${key} → ${expected[key]}`).join('; '),
      explanation: trial.explanation,
    };
  }

  private bossToTrial(question: BossPublicQuestion): DungeonTrial {
    if (question.question_type === 'multiple_choice') {
      return {
        kind: 'mc',
        prompt: question.prompt,
        choices: (question.options || []).map((option) => option.text),
        answerIdx: -1,
        explanation: '',
        bossIndex: question.index,
      };
    }
    if (question.question_type === 'match') {
      return {
        kind: 'match',
        prompt: question.prompt,
        words: question.words || [],
        meanings: question.meanings || [],
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
    this.matchPairs = new Map();
    this.matchSelectedWord = null;
    this.fillInput = null;
    this.stopAudio();
  }

  private showPremiumModal(): void {
    let overlay = document.getElementById('premiumModalOverlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'premiumModalOverlay';
      overlay.className = 'node-modal-overlay active';
      overlay.innerHTML = `
        <div class="premium-modal-card">
          <div class="premium-modal-icon"><i class="fa-solid fa-crown"></i></div>
          <h3>Nâng cấp Premium 👑</h3>
          <p class="premium-modal-lead">Nửa còn lại của hành trình (Tầng ${this.FREE_TIERS + 1} → Tầng 5) là khu vực dành riêng cho thành viên Premium. Nâng cấp để mở khoá toàn bộ bài đọc, ải thử thách và XP phía sau.</p>
          <div class="premium-plan-row">
            <div class="premium-plan-card">
              <div class="premium-plan-name">Premium Tháng</div>
              <div class="premium-plan-price">99.000đ</div>
              <div class="premium-plan-note">/ 30 ngày</div>
            </div>
            <div class="premium-plan-card featured">
              <div class="premium-plan-badge">Tiết kiệm nhất</div>
              <div class="premium-plan-name">Premium Vĩnh Viễn</div>
              <div class="premium-plan-price">999.000đ</div>
              <div class="premium-plan-note">không giới hạn</div>
            </div>
          </div>
          <button type="button" id="premiumActivateBtn" class="premium-activate-btn"><i class="fa-solid fa-bolt"></i> Kích hoạt Premium (Demo)</button>
          <button type="button" id="premiumCloseBtn" class="premium-later-btn">Để sau</button>
        </div>`;
      document.body.appendChild(overlay);
      overlay.addEventListener('click', (event) => {
        if (event.target === overlay) this.closePremiumModal();
      });
      document.getElementById('premiumCloseBtn')?.addEventListener('click', () => this.closePremiumModal());
      document.getElementById('premiumActivateBtn')?.addEventListener('click', () => {
        localStorage.setItem('slanguage_is_premium', 'true');
        this.isPremiumUser = true;
        this.applyStatuses();
        this.renderTree();
        this.closePremiumModal();
        this.showToast('Kích hoạt Premium thành công! Toàn bộ hành trình đã mở khoá 👑');
      });
    }
    overlay.classList.add('active');
  }

  private closePremiumModal(): void {
    document.getElementById('premiumModalOverlay')?.classList.remove('active');
  }

  private async handleTrialSubmission(): Promise<void> {
    if (!this.selectedNode || this.grading) return;
    const node = this.selectedNode;

    if (node.isHub) {
      if (node.status !== 'mastered') {
        this.markMastered(node);
        this.updateStatsDisplays();
        this.renderTree();
        this.showToast('Bạn đã hoàn thành bài đọc chủ đề! Toàn bộ 3 nhánh độ khó đã sẵn sàng khiêu chiến.');
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
      if (this.failReason === 'hearts') {
        this.updateStatsDisplays();
        this.closeModal();
        this.showToast(`💔 Hết máu — bạn đã thoát khỏi bài học. Sinh lực khóa hồi 24 giờ, còn ${formatHeartLock(heartLockRemainingMs())} nữa mới hồi đầy.`);
      } else if (this.currentQuestionsList.length === 0) {
        await this.startBossQuiz(node);
      } else {
        this.bossAnswers = [];
        this.currentQuestionIdx = 0;
        this.failReason = null;
        this.renderCurrentQuestion();
      }
      return;
    }

    if (this.currentTrialPhase === 'idle') {
      const trial = this.currentQuestionsList[this.currentQuestionIdx];
      if (!trial || !this.trialReady()) {
        this.showToast('Vui lòng hoàn thành đáp án trước khi kiểm tra!');
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
        this.showToast(error instanceof Error ? error.message : 'Không chấm được đáp án lúc này. Thử lại nhé.');
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

      if (this.modalTrialResult) {
        this.modalTrialResult.style.display = 'block';
      }
      if (verdict.isCorrect) {
        this.modalTrialResult!.className = 'modal-trial-result success';
        this.modalTrialResult!.innerHTML = `
          <div class="result-icon"><i class="fa-solid fa-circle-check"></i></div>
          <div class="result-text">
            <strong>CHÍNH XÁC!</strong>
            <p>${escapeHtml(verdict.explanation || verdict.correctDisplay || 'Rất xuất sắc! Bấm nút bên dưới để tiếp tục.')}</p>
          </div>
        `;
      } else {
        const penalty = node.heartPenalty || 1;
        this.currentHearts = spendHearts(penalty);
        this.updateStatsDisplays();
        this.triggerDamageFeedback();
        this.renderTrialHearts();

        this.modalTrialResult!.className = 'modal-trial-result error';
        this.modalTrialResult!.innerHTML = `
          <div class="result-icon"><i class="fa-solid fa-circle-xmark"></i></div>
          <div class="result-text">
            <strong>SAI RỒI! (-${penalty} Máu)</strong>
            <p>Đáp án đúng: <strong>${escapeHtml(verdict.correctDisplay)}</strong>.<br>${escapeHtml(verdict.explanation || '')}</p>
          </div>
        `;

        if (this.currentHearts === 0) {
          this.currentTrialPhase = 'failed';
          this.failReason = 'hearts';
          this.modalTrialResult!.innerHTML = `
            <div class="result-icon"><i class="fa-solid fa-heart-crack"></i></div>
            <div class="result-text">
              <strong>HẾT MÁU — THẤT BẠI!</strong>
              <p>Bạn đã dùng hết sinh lực của bài học này. Sinh lực bị <strong>khóa hồi trong 24 giờ</strong> (còn ${formatHeartLock(heartLockRemainingMs())}). Bấm <strong>Thoát khỏi bài học</strong> để rời ải.</p>
            </div>
          `;
          if (this.btnExecuteTrial) {
            this.btnExecuteTrial.disabled = false;
            this.btnExecuteTrial.className = 'btn-trial-action retry-action';
            this.btnExecuteTrial.innerHTML = `<i class="fa-solid fa-door-open"></i> Thoát khỏi bài học`;
          }
          return;
        }
      }

      if (this.btnExecuteTrial) {
        this.btnExecuteTrial.disabled = false;
        if (isLastQ) {
          this.btnExecuteTrial.className = 'btn-trial-action complete-action';
          this.btnExecuteTrial.innerHTML = `<i class="fa-solid fa-circle-check"></i> Hoàn thành`;
        } else {
          this.btnExecuteTrial.className = 'btn-trial-action next-action';
          this.btnExecuteTrial.innerHTML = `<i class="fa-solid fa-arrow-right"></i> Tiếp theo`;
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
      this.completeTrialNode(node);
    }
  }

  private completeTrialNode(node: DungeonNode): void {
    this.markMastered(node);

    let awardedXP = node.xpReward;
    const activeExpBoost = localStorage.getItem('slanguage_active_exp_boost');
    let boostNote = '';
    if (activeExpBoost === 'double_xp') {
      awardedXP = node.xpReward * 2;
      boostNote = ' (x2 XP Gấp Đôi!)';
      localStorage.removeItem('slanguage_active_exp_boost');
      localStorage.removeItem('slanguage_xp_boost_active');
    } else if (activeExpBoost === 'boost_10') {
      awardedXP = Math.round(node.xpReward * 1.1);
      boostNote = ' (+10% Boost XP!)';
      localStorage.removeItem('slanguage_active_exp_boost');
      localStorage.removeItem('slanguage_xp_boost_active');
    }

    this.totalXP += awardedXP;
    localStorage.setItem('slanguage_user_xp', this.totalXP.toString());
    void slanguageApi('/api/v1/minigame/progress', {
      method: 'POST',
      body: { xp: awardedXP, word_ids: [] },
    }).catch(() => undefined);

    const restoredHearts = gainHearts(1);
    if (restoredHearts > 0) this.currentHearts = restoredHearts;
    this.updateStatsDisplays();
    this.renderTree();

    const hitPremiumWall = !this.isPremiumUser && node.stage >= this.FREE_TIERS && node.stage < 5;
    if (hitPremiumWall) {
      this.showToast(`Hoàn thành ải, nhận +${awardedXP} XP! Các tầng tiếp theo là khu vực Premium 👑 — nâng cấp để học tiếp.`);
    } else {
      this.showToast(`Tuyệt đỉnh! Đã hoàn thành ải, nhận +${awardedXP} XP${boostNote}. Các nhánh đường tiếp theo đã mở khóa!`);
    }
    this.closeModal();
  }

  private async startBossQuiz(node: DungeonNode): Promise<void> {
    this.bossToken = null;
    this.bossAnswers = [];
    this.bossQuestions = [];
    this.currentQuestionsList = [];
    this.currentQuestionIdx = 0;
    this.currentTrialPhase = 'idle';
    this.failReason = null;
    this.stopAudio();

    if (this.modalHubReadingBox) this.modalHubReadingBox.style.display = 'none';
    if (this.modalObjectivesWrap) this.modalObjectivesWrap.style.display = 'none';
    if (this.modalNodePreview) this.modalNodePreview.style.display = 'none';
    if (this.modalTrialBox) this.modalTrialBox.style.display = 'block';
    if (this.modalTrialStepBadge) this.modalTrialStepBadge.textContent = 'Câu –/25';
    if (this.modalTrialProgressFill) this.modalTrialProgressFill.style.width = '0%';
    this.renderTrialHearts();
    if (this.modalTrialPrompt) {
      this.modalTrialPrompt.textContent = 'AI đang soạn 25 câu hỏi từ tất cả chủ đề của lộ trình...';
    }
    if (this.modalTrialChoices) {
      this.modalTrialChoices.innerHTML = `<div class="trial-loading"><i class="fa-solid fa-spinner fa-spin"></i> Đang gọi AI soạn đề Boss...</div>`;
    }
    if (this.modalTrialResult) this.modalTrialResult.style.display = 'none';
    if (this.btnExecuteTrial) {
      this.btnExecuteTrial.disabled = true;
      this.btnExecuteTrial.className = 'btn-trial-action check-action';
      this.btnExecuteTrial.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Đang soạn đề...`;
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
        throw new Error('Máy chủ chưa trả về bộ câu hỏi Boss.');
      }
      this.currentQuestionsList = this.bossQuestions.map((question) => this.bossToTrial(question));
      this.renderCurrentQuestion();
    } catch (error) {
      this.currentTrialPhase = 'failed';
      this.failReason = 'boss';
      if (this.modalTrialResult) {
        this.modalTrialResult.style.display = 'block';
        this.modalTrialResult.className = 'modal-trial-result error';
        this.modalTrialResult.innerHTML = `
          <div class="result-icon"><i class="fa-solid fa-circle-xmark"></i></div>
          <div class="result-text">
            <strong>CHƯA SOẠN ĐƯỢC ĐỀ BOSS</strong>
            <p>${escapeHtml(error instanceof Error ? error.message : 'Lỗi không xác định.')} Bấm thử lại để gọi AI lần nữa.</p>
          </div>
        `;
      }
      if (this.btnExecuteTrial) {
        this.btnExecuteTrial.disabled = false;
        this.btnExecuteTrial.className = 'btn-trial-action retry-action';
        this.btnExecuteTrial.innerHTML = `<i class="fa-solid fa-rotate-right"></i> Thử lại`;
      }
    }
  }

  private async finishBossQuiz(node: DungeonNode): Promise<void> {
    if (!this.bossToken) return;
    this.grading = true;
    if (this.btnExecuteTrial) {
      this.btnExecuteTrial.disabled = true;
      this.btnExecuteTrial.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Đang chấm toàn bài...`;
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
        this.completeTrialNode(node);
        this.showToast(`🐉 Đã hạ Boss với 25/25 câu đúng! Chủ đề kế tiếp đã mở khóa.`);
      } else {
        const correctCount = Number(data.correct_count) || 0;
        this.currentTrialPhase = 'failed';
        this.failReason = 'boss';
        if (this.modalTrialResult) {
          this.modalTrialResult.style.display = 'block';
          this.modalTrialResult.className = 'modal-trial-result error';
          this.modalTrialResult.innerHTML = `
            <div class="result-icon"><i class="fa-solid fa-heart-crack"></i></div>
            <div class="result-text">
              <strong>CHƯA HẠ ĐƯỢC BOSS (${correctCount}/25)</strong>
              <p>Boss yêu cầu đúng cả 25 câu. Bấm <strong>Làm lại Boss</strong> để thử lại từ đầu.</p>
            </div>
          `;
        }
        if (this.btnExecuteTrial) {
          this.btnExecuteTrial.disabled = false;
          this.btnExecuteTrial.className = 'btn-trial-action retry-action';
          this.btnExecuteTrial.innerHTML = `<i class="fa-solid fa-rotate-right"></i> Làm lại Boss`;
        }
      }
    } catch (error) {
      this.grading = false;
      this.showToast(error instanceof Error ? error.message : 'Không chấm được toàn bài Boss. Thử lại nhé.');
      if (this.btnExecuteTrial) {
        this.btnExecuteTrial.disabled = false;
        this.btnExecuteTrial.className = 'btn-trial-action complete-action';
        this.btnExecuteTrial.innerHTML = `<i class="fa-solid fa-circle-check"></i> Hoàn thành`;
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
        this.showToast('🎓 Boss quiz đã đạt 25/25! Chủ đề kế tiếp đã mở khóa.');
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
      const video = document.getElementById('loadingVideoPlayer') as HTMLVideoElement;
      if (overlay) overlay.classList.remove('active');
      if (video) {
        video.pause();
        video.muted = true;
        video.currentTime = 0;
      }
      const savedXP = localStorage.getItem('slanguage_user_xp');
      if (savedXP) this.totalXP = parseInt(savedXP, 10) || this.totalXP;
      this.currentHearts = readHearts();
      this.updateStatsDisplays();
      void this.refreshQuizStatus();
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