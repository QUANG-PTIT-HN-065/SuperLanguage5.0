/**
 * Slanguage - Smart Vocabulary Practice TypeScript Module
 * Dữ liệu từ vựng thật: các từ thuộc chủ đề đã vượt qua quiz ở Học tập,
 * mức ghi nhớ (user_words) và XP đồng bộ trực tiếp với backend.
 */

import { isLearnerAuthenticated, slanguageApi } from "../shared/api-client";
import { initializeLearnerHeader, logoutLearner } from "../shared/learner-header";
import { clearSkeleton, showSkeleton } from "../shared/skeleton";
import { applyI18n, getLocale, localeLabel, setLocale, t, LOCALE_EVENT, type UiLocale } from "../shared/i18n";

interface VocabItem {
  id: number;
  topicId: number;
  word: string;
  phonetic: string;
  level: string;
  tag: string;
  meaning: string;
  exampleTarget: string;
  exampleMeaning: string;
  partOfSpeech: string;
  masteryLevel: number;
  status: 'mastered' | 'unmastered';
}

interface PassedTopic {
  id: number;
  name: string;
  wordCount: number;
}

interface LanguageMeta {
  name: string;
  flagImg: string;
  ttsCode: string;
}

const LANG_META: Record<string, LanguageMeta> = {
  ja: { name: 'Tiếng Nhật', flagImg: '../../../assets/flags/flag-jp.png', ttsCode: 'ja-JP' },
  en: { name: 'Tiếng Anh', flagImg: '../../../assets/flags/flag-en.png', ttsCode: 'en-US' },
  vi: { name: 'Tiếng Việt', flagImg: '../../../assets/flags/flag-vn.png', ttsCode: 'vi-VN' },
};

// Khóa i18n cho nhãn loại từ (part_of_speech từ API giữ nguyên, chỉ dịch nhãn UI).
const POS_LABELS: Record<string, string> = {
  noun: 'vc.pos.noun',
  verb: 'vc.pos.verb',
  adjective: 'vc.pos.adjective',
  adverb: 'vc.pos.adverb',
  phrase: 'vc.pos.phrase',
  other: 'vc.pos.other',
};

const STUDY_HREF = '../select-lesson/index.html';

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[char] || char);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function asText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

class SlanguageVocabulary {
  private currentLang = 'ja';
  private allWords: VocabItem[] = [];
  private passedTopics: PassedTopic[] = [];
  private currentDeck: VocabItem[] = [];
  private activeCardIndex = 0;
  private currentXP = 0;
  private quizStreak = 0;
  private quizScore = 0;
  private quizTimerInterval: number | null = null;
  private quizRemainingTime = 15;
  private currentQuizItem: VocabItem | null = null;
  private dataState: 'loading' | 'ready' | 'empty' | 'error' = 'loading';
  private loadErrorRaw = '';
  private lastFeedback: 'correct' | 'wrong' | 'timeout' | null = null;
  private lastFeedbackXp = 0;

  constructor() {
    this.loadInitialState();
    this.initNavbar();
    this.initModeTabs();
    this.initFlashcardDeck();
    this.initSpeedQuiz();
    this.initVocabularyVault();
    this.bindShortcuts();
    this.bindPageTransitions();
    // Đổi ngôn ngữ GIAO DIỆN: dịch lại HTML tĩnh + render lại vùng động từ dữ liệu đã cache.
    window.addEventListener(LOCALE_EVENT, () => {
      applyI18n();
      this.refreshDynamicUi();
    });
    showSkeleton('vaultGrid', 'vault-cards', { tone: 'cool', count: 8 });
    showSkeleton('flashcardBox', 'flashcard', { tone: 'cool', overlay: true });
    showSkeleton(document.querySelector('#tabQuiz .quiz-arena-container'), 'quiz', { tone: 'cool', overlay: true });
    const deckSelectEl = document.getElementById('deckSelect') as HTMLSelectElement | null;
    if (deckSelectEl) deckSelectEl.disabled = true;
    this.initHeroStats();
    void this.loadRealData();
  }

  // ================= REAL DATA =================
  private async fetchTopicWords(topicId: number): Promise<Record<string, unknown>[]> {
    const items: Record<string, unknown>[] = [];
    const langQuery = isLearnerAuthenticated() ? '' : `&language=${encodeURIComponent(this.currentLang)}`;
    for (let offset = 0; offset < 500; offset += 100) {
      const response = await slanguageApi<{ items?: unknown }>(
        `/api/v1/vocabulary/words?topic_id=${topicId}&limit=100&offset=${offset}${langQuery}`,
      );
      const page = Array.isArray(response.data.items) ? response.data.items : [];
      items.push(...page.map(asRecord));
      if (page.length < 100) break;
    }
    return items;
  }

  private async loadRealData(): Promise<void> {
    try {
      await initializeLearnerHeader({ bindControls: false });
      const savedLang = localStorage.getItem('slanguage_active_language') || this.currentLang;
      if (LANG_META[savedLang]) this.currentLang = savedLang;
      const savedXP = localStorage.getItem('slanguage_user_xp');
      if (savedXP) this.currentXP = parseInt(savedXP, 10) || 0;
      this.updateXPDisplays();
      const langQuery = isLearnerAuthenticated()
        ? ''
        : `?language=${encodeURIComponent(this.currentLang)}`;

      const pathsResponse = await slanguageApi<unknown>(`/api/v1/vocabulary/learning-paths${langQuery}`);
      const paths = Array.isArray(pathsResponse.data) ? pathsResponse.data.map(asRecord) : [];
      const path = paths.find((item) => item.language_code === this.currentLang);
      if (!path) throw new Error(t('vc.errNoPath'));

      const detailResponse = await slanguageApi<{ topics?: unknown }>(
        `/api/v1/vocabulary/learning-paths/${path.id}${langQuery}`,
      );
      const topics = Array.isArray(detailResponse.data.topics)
        ? detailResponse.data.topics.map(asRecord)
        : [];
      // Khách chưa đăng nhập: duyệt nửa đầu miễn phí của lộ trình (như tài khoản free)
      const passed = isLearnerAuthenticated()
        ? topics.filter((topic) => topic.is_completed === true)
        : topics.slice(0, Math.ceil(topics.length / 2));
      this.passedTopics = passed.map((topic) => ({
        id: Number(topic.id),
        name: asText(topic.name) || t('vc.topicFallback', { id: String(topic.id) }),
        wordCount: 0,
      }));

      if (!this.passedTopics.length) {
        this.allWords = [];
        this.currentDeck = [];
        this.dataState = 'empty';
        this.populateDeckSelect();
        this.initHeroStats();
        this.showNotices(this.noticeHtml(t('vc.noticeNoTopics'), 'study'));
        return;
      }

      const decks = await Promise.all(
        this.passedTopics.map((topic) => this.fetchTopicWords(topic.id)),
      );
      const seen = new Set<number>();
      const words: VocabItem[] = [];
      decks.forEach((items, index) => {
        const topic = this.passedTopics[index];
        topic.wordCount = items.length;
        for (const raw of items) {
          const id = Number(raw.id);
          if (!Number.isFinite(id) || seen.has(id)) continue;
          seen.add(id);
          const mastery = Number(raw.mastery_level) || 0;
          words.push({
            id,
            topicId: topic.id,
            word: asText(raw.word),
            phonetic: asText(raw.phonetic),
            level: asText(raw.level),
            tag: topic.name,
            meaning: asText(raw.meaning),
            exampleTarget: asText(raw.example_sentence),
            exampleMeaning: asText(raw.example_meaning),
            partOfSpeech: asText(raw.part_of_speech),
            masteryLevel: mastery,
            status: mastery >= 5 ? 'mastered' : 'unmastered',
          });
        }
      });

      this.allWords = words;
      this.currentDeck = [...words];
      this.activeCardIndex = 0;
      this.dataState = words.length ? 'ready' : 'empty';
      this.populateDeckSelect();
      this.initHeroStats();
      this.clearNotices();
      this.renderCurrentCard();
      this.renderVault();
      this.startSpeedQuizQuestion();
      if (!words.length) {
        this.showNotices(this.noticeHtml(t('vc.noticeNoWords'), 'study'));
      }
    } catch (error) {
      this.dataState = 'error';
      this.allWords = [];
      this.currentDeck = [];
      this.populateDeckSelect();
      this.initHeroStats();
      this.loadErrorRaw = error instanceof Error ? error.message : t('vc.errUnknown');
      this.showNotices(this.noticeHtml(t('vc.errLoad', { message: escapeHtml(this.loadErrorRaw) }), 'retry'));
    }
  }

  private noticeHtml(message: string, action?: 'study' | 'retry'): string {
    const link = action === 'study'
      ? `<a href="${STUDY_HREF}" class="vocab-notice-link" style="display:inline-block;margin-top:14px;padding:10px 22px;border-radius:999px;background:#0077B6;color:#fff;font-weight:700;text-decoration:none;">${t('vc.noticeStudyLink')}</a>`
      : action === 'retry'
        ? `<button type="button" class="vocab-notice-link" style="display:inline-block;margin-top:14px;padding:10px 22px;border-radius:999px;background:#0077B6;color:#fff;font-weight:700;border:none;cursor:pointer;">${t('vc.noticeRetry')}</button>`
        : '';
    return `
      <div class="vocab-panel-notice" style="grid-column:1 / -1;text-align:center;padding:36px 20px;color:#64748b;">
        <i class="fa-solid fa-book-open" style="font-size:2.2rem;margin-bottom:12px;opacity:0.5;"></i>
        <p style="font-size:1.02rem;font-weight:600;margin:0;">${message}</p>
        ${link}
      </div>
    `;
  }

  private showNotices(html: string): void {
    this.clearNotices();
    clearSkeleton('flashcardBox');
    clearSkeleton(document.querySelector('#tabQuiz .quiz-arena-container'));
    for (const panelId of ['tabFlashcard', 'tabQuiz']) {
      const panel = document.getElementById(panelId);
      if (!panel) continue;
      const main = panel.querySelector<HTMLElement>('.flashcard-deck-container, .quiz-arena-container');
      if (main) main.style.display = 'none';
      panel.insertAdjacentHTML('afterbegin', html);
    }
    const vaultGrid = document.getElementById('vaultGrid');
    if (vaultGrid) {
      clearSkeleton(vaultGrid);
      vaultGrid.innerHTML = html;
    }
    if (this.quizTimerInterval) clearInterval(this.quizTimerInterval);
    const deckSelect = document.getElementById('deckSelect') as HTMLSelectElement | null;
    if (deckSelect) deckSelect.disabled = true;
    document.querySelectorAll<HTMLElement>('.vocab-panel-notice .vocab-notice-link').forEach((el) => {
      el.addEventListener('click', (event) => {
        event.preventDefault();
        if (el.tagName === 'A') this.triggerLoadingAndRedirect(STUDY_HREF);
        else void this.loadRealData();
      });
    });
  }

  private clearNotices(): void {
    document.querySelectorAll('.vocab-panel-notice').forEach((el) => el.remove());
    for (const panelId of ['tabFlashcard', 'tabQuiz']) {
      const main = document.getElementById(panelId)
        ?.querySelector<HTMLElement>('.flashcard-deck-container, .quiz-arena-container');
      if (main) main.style.display = '';
    }
    const deckSelect = document.getElementById('deckSelect') as HTMLSelectElement | null;
    if (deckSelect) deckSelect.disabled = this.dataState !== 'ready';
  }

  // ================= LOCALE REFRESH =================
  // Render lại các vùng chữ động từ dữ liệu đã cache khi đổi ngôn ngữ giao diện.
  private refreshDynamicUi(): void {
    this.initHeroStats();
    // Lúc đang tải chưa có dữ liệu: giữ option "Đang tải chủ đề..." (đã dịch qua data-i18n).
    if (this.dataState !== 'loading') this.populateDeckSelect();
    this.updateXPDisplays();
    if (this.dataState === 'ready') {
      const flashcardBox = document.getElementById('flashcardBox');
      const wasFlipped = flashcardBox?.classList.contains('flipped') ?? false;
      this.renderCurrentCard();
      if (wasFlipped) flashcardBox?.classList.add('flipped');
      this.renderVault();
      this.refreshQuizTexts();
    } else if (this.dataState === 'empty') {
      const key = this.passedTopics.length ? 'vc.noticeNoWords' : 'vc.noticeNoTopics';
      this.showNotices(this.noticeHtml(t(key), 'study'));
    } else if (this.dataState === 'error') {
      this.showNotices(this.noticeHtml(t('vc.errLoad', { message: escapeHtml(this.loadErrorRaw) }), 'retry'));
    }
  }

  private refreshQuizTexts(): void {
    const optionsGrid = document.getElementById('quizOptionsGrid');
    if (this.allWords.length < 2) {
      if (optionsGrid) {
        optionsGrid.innerHTML = `<p style="grid-column:1 / -1;text-align:center;color:#64748b;font-weight:600;">${t('vc.quizNeedTwo')}</p>`;
      }
      return;
    }
    const subHintEl = document.getElementById('quizSubHint');
    if (subHintEl && this.currentQuizItem) {
      subHintEl.textContent = this.currentQuizItem.phonetic
        ? t('vc.quizPhonetic', { value: this.currentQuizItem.phonetic })
        : t('vc.quizTopic', { value: this.currentQuizItem.tag });
    }
    const feedbackBanner = document.getElementById('quizFeedbackBanner');
    const feedbackMsg = document.getElementById('quizFeedbackMsg');
    if (feedbackBanner?.classList.contains('show') && feedbackMsg && this.currentQuizItem && this.lastFeedback) {
      if (this.lastFeedback === 'correct') {
        feedbackMsg.textContent = t('vc.quizCorrect', { xp: this.lastFeedbackXp });
      } else if (this.lastFeedback === 'wrong') {
        feedbackMsg.textContent = t('vc.quizWrong', { answer: this.currentQuizItem.meaning });
      } else {
        feedbackMsg.textContent = t('vc.quizTimeout', { answer: this.currentQuizItem.meaning });
      }
    }
  }

  private populateDeckSelect(): void {
    const deckSelect = document.getElementById('deckSelect') as HTMLSelectElement | null;
    if (!deckSelect) return;
    const previousValue = deckSelect.value;
    deckSelect.replaceChildren();
    const all = document.createElement('option');
    all.value = 'all';
    all.textContent = t('vc.deckAll', { n: this.allWords.length });
    deckSelect.append(all);
    for (const topic of this.passedTopics) {
      if (!topic.wordCount) continue;
      const option = document.createElement('option');
      option.value = String(topic.id);
      option.textContent = t('vc.deckTopic', { name: topic.name, n: topic.wordCount });
      deckSelect.append(option);
    }
    // Giữ lựa chọn hiện tại khi dựng lại option (đổi locale không reset bộ lọc).
    if (Array.from(deckSelect.options).some((option) => option.value === previousValue)) {
      deckSelect.value = previousValue;
    }
    deckSelect.disabled = this.dataState !== 'ready';
  }

  private loadInitialState(): void {
    const savedLang = localStorage.getItem('slanguage_current_lang')
      || localStorage.getItem('slanguage_active_language')
      || 'ja';
    if (LANG_META[savedLang]) this.currentLang = savedLang;
    const savedXP = localStorage.getItem('slanguage_user_xp');
    if (savedXP) this.currentXP = parseInt(savedXP, 10) || 0;
  }

  private updateCurrentDeck(filter: string = 'all'): void {
    this.currentDeck = filter === 'all'
      ? [...this.allWords]
      : this.allWords.filter((item) => String(item.topicId) === filter);
    this.activeCardIndex = 0;
  }

  // ================= NAVBAR & DROPDOWNS =================
  private initNavbar(): void {
    this.updateXPDisplays();

    const langDropdown = document.getElementById('langDropdown');
    const langDropdownBtn = document.getElementById('langDropdownBtn');
    const langItems = document.querySelectorAll('.lang-dropdown-item');

    if (langDropdown && langDropdownBtn) {
      langDropdownBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        langDropdown.classList.toggle('open');
      });
    }

    // Dropdown navbar chỉ đổi ngôn ngữ GIAO DIỆN (i18n), không đụng ngôn ngữ học.
    langItems.forEach(item => {
      item.addEventListener('click', () => {
        const code = item.getAttribute('data-lang') as UiLocale | null;
        if (code && code !== getLocale()) setLocale(code);
        if (langDropdown) langDropdown.classList.remove('open');
      });
    });

    const isLoggedIn = isLearnerAuthenticated();
    if (isLoggedIn) {
      document.body.classList.add('user-authenticated');
      document.body.classList.remove('user-guest');
    } else {
      document.body.classList.add('user-guest');
      document.body.classList.remove('user-authenticated');
    }

    const logoutBtn = document.getElementById('navLogoutItem');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => {
        void logoutLearner();
      });
    }

    const userDropdown = document.getElementById('userDropdown');
    const userDropdownBtn = document.getElementById('userDropdownBtn');
    if (userDropdown && userDropdownBtn) {
      userDropdownBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        userDropdown.classList.toggle('open');
      });
    }

    document.addEventListener('click', (e) => {
      if (langDropdown && !langDropdown.contains(e.target as Node)) {
        langDropdown.classList.remove('open');
      }
      if (userDropdown && !userDropdown.contains(e.target as Node)) {
        userDropdown.classList.remove('open');
      }
    });
  }

  private updateVaultCounts(): void {
    const total = this.allWords.length;
    const mastered = this.allWords.filter(it => it.status === 'mastered').length;
    const unmastered = total - mastered;

    const countAll = document.getElementById('vaultCountAll');
    const countMastered = document.getElementById('vaultCountMastered');
    const countUnmastered = document.getElementById('vaultCountUnmastered');

    if (countAll) countAll.textContent = total.toString();
    if (countMastered) countMastered.textContent = mastered.toString();
    if (countUnmastered) countUnmastered.textContent = unmastered.toString();

    const statTotal = document.getElementById('statTotalWords');
    const statMastered = document.getElementById('statMasteredWords');
    const statReview = document.getElementById('statReviewWords');
    const statRetention = document.getElementById('statRetentionRate');

    if (statTotal) statTotal.textContent = total.toString();
    if (statMastered) statMastered.textContent = mastered.toString();
    if (statReview) statReview.textContent = unmastered.toString();
    if (statRetention) {
      const rate = total > 0 ? Math.round((mastered / total) * 100) : 0;
      statRetention.textContent = `${rate}%`;
    }
  }

  // ================= HERO STATS =================
  private initHeroStats(): void {
    const langName = localeLabel(this.currentLang);
    const heroTitle = document.getElementById('vocabHeroTitle');
    const heroDesc = document.getElementById('vocabHeroDesc');

    if (heroTitle) {
      heroTitle.textContent = this.dataState === 'ready' || this.dataState === 'empty'
        ? t('vc.heroTitleDone', { lang: langName, n: this.passedTopics.length })
        : t('vc.heroTitle', { lang: langName });
    }
    if (heroDesc) {
      if (this.dataState === 'ready') {
        heroDesc.textContent = t('vc.heroDescReady', { n: this.allWords.length });
      } else if (this.dataState === 'empty') {
        heroDesc.textContent = t('vc.heroDescEmpty');
      } else if (this.dataState === 'error') {
        heroDesc.textContent = t('vc.heroDescError');
      } else {
        heroDesc.textContent = t('vc.heroDescLoading');
      }
    }

    this.updateVaultCounts();
  }

  // ================= MODE TABS =================
  private initModeTabs(): void {
    const tabs = document.querySelectorAll('.mode-tab');
    const panels = {
      flashcard: document.getElementById('tabFlashcard'),
      quiz: document.getElementById('tabQuiz'),
      vault: document.getElementById('tabVault')
    };

    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');

        const target = tab.getAttribute('data-tab') as keyof typeof panels;
        Object.values(panels).forEach(p => p?.classList.remove('active'));
        if (target && panels[target]) {
          panels[target]?.classList.add('active');
          if (target === 'quiz') this.startSpeedQuizQuestion();
          else if (this.quizTimerInterval) clearInterval(this.quizTimerInterval);
          if (target === 'vault') this.renderVault();
        }
      });
    });

    const deckSelect = document.getElementById('deckSelect') as HTMLSelectElement;
    if (deckSelect) {
      deckSelect.addEventListener('change', () => {
        this.updateCurrentDeck(deckSelect.value);
        this.renderCurrentCard();
        this.renderVault();
        this.showToast(t('vc.toastFiltered', { name: deckSelect.options[deckSelect.selectedIndex].text }));
      });
    }
  }

  // ================= TAB 1: 3D FLASHCARD =================
  private initFlashcardDeck(): void {
    const flashcardBox = document.getElementById('flashcardBox');
    const btnNextCard = document.getElementById('btnNextCard');
    const btnPrevCard = document.getElementById('btnPrevCard');
    const btnShuffle = document.getElementById('btnShuffle');
    const btnSpeakerPrompt = document.getElementById('btnSpeakerPrompt');
    const fcSoundBtnFront = document.getElementById('fcSoundBtnFront');
    const fcSoundBtnBack = document.getElementById('fcSoundBtnBack');

    if (flashcardBox) {
      flashcardBox.addEventListener('click', () => {
        flashcardBox.classList.toggle('flipped');
      });
    }

    if (btnNextCard) {
      btnNextCard.addEventListener('click', (e) => {
        e.stopPropagation();
        this.nextCard();
      });
    }
    if (btnPrevCard) {
      btnPrevCard.addEventListener('click', (e) => {
        e.stopPropagation();
        this.prevCard();
      });
    }

    if (btnShuffle) {
      btnShuffle.addEventListener('click', () => {
        if (!this.currentDeck.length) return;
        this.shuffleDeck();
        this.renderCurrentCard();
        this.showToast(t('vc.toastShuffled'));
      });
    }

    if (btnSpeakerPrompt) {
      btnSpeakerPrompt.addEventListener('click', () => this.playCurrentWordAudio());
    }
    if (fcSoundBtnFront) {
      fcSoundBtnFront.addEventListener('click', (e) => {
        e.stopPropagation();
        this.playCurrentWordAudio();
      });
    }
    if (fcSoundBtnBack) {
      fcSoundBtnBack.addEventListener('click', (e) => {
        e.stopPropagation();
        this.playCurrentSentenceAudio();
      });
    }

    this.renderCurrentCard();
  }

  private renderCurrentCard(): void {
    if (this.currentDeck.length === 0) return;
    const item = this.currentDeck[this.activeCardIndex];
    const flashcardBox = document.getElementById('flashcardBox');
    if (flashcardBox) {
      clearSkeleton(flashcardBox);
      flashcardBox.classList.remove('flipped');
    }

    const fcTag = document.getElementById('fcTag');
    const fcWord = document.getElementById('fcWord');
    const fcPhonetic = document.getElementById('fcPhonetic');

    if (fcTag) fcTag.textContent = item.tag;
    if (fcWord) fcWord.textContent = item.word;
    if (fcPhonetic) fcPhonetic.textContent = item.phonetic;

    const fcBackTag = document.getElementById('fcBackTag');
    const fcMeaning = document.getElementById('fcMeaning');
    const fcExampleTarget = document.getElementById('fcExampleTarget');
    const fcExampleMeaning = document.getElementById('fcExampleMeaning');
    const fcNuance = document.getElementById('fcNuance');

    if (fcBackTag) fcBackTag.textContent = item.level;
    if (fcMeaning) fcMeaning.textContent = item.meaning;
    if (fcExampleTarget) fcExampleTarget.textContent = item.exampleTarget;
    if (fcExampleMeaning) fcExampleMeaning.textContent = item.exampleMeaning;
    if (fcNuance) {
      const posKey = POS_LABELS[item.partOfSpeech];
      fcNuance.innerHTML = `💡 <strong>${t('vc.masteryLabel')}</strong> ${item.masteryLevel}/5`
        + (posKey ? ` · <strong>${t('vc.posLabel')}</strong> ${escapeHtml(t(posKey))}` : '');
    }

    const cardIndexLabel = document.getElementById('cardIndexLabel');
    const cardTotalLabel = document.getElementById('cardTotalLabel');
    const cardProgressFill = document.getElementById('cardProgressFill');

    if (cardIndexLabel) cardIndexLabel.textContent = (this.activeCardIndex + 1).toString();
    if (cardTotalLabel) cardTotalLabel.textContent = this.currentDeck.length.toString();
    if (cardProgressFill) {
      const pct = Math.round(((this.activeCardIndex + 1) / this.currentDeck.length) * 100);
      cardProgressFill.style.width = `${pct}%`;
    }
  }

  private nextCard(): void {
    if (!this.currentDeck.length) return;
    if (this.activeCardIndex < this.currentDeck.length - 1) {
      this.activeCardIndex++;
    } else {
      this.activeCardIndex = 0;
      this.showToast(t('vc.toastLoop'));
    }
    this.renderCurrentCard();
  }

  private prevCard(): void {
    if (!this.currentDeck.length) return;
    if (this.activeCardIndex > 0) {
      this.activeCardIndex--;
    } else {
      this.activeCardIndex = this.currentDeck.length - 1;
    }
    this.renderCurrentCard();
  }

  private shuffleDeck(): void {
    for (let i = this.currentDeck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.currentDeck[i], this.currentDeck[j]] = [this.currentDeck[j], this.currentDeck[i]];
    }
    this.activeCardIndex = 0;
  }

  private playCurrentWordAudio(): void {
    if (this.currentDeck.length === 0) return;
    const item = this.currentDeck[this.activeCardIndex];
    this.speakText(item.word);
  }

  private playCurrentSentenceAudio(): void {
    if (this.currentDeck.length === 0) return;
    const item = this.currentDeck[this.activeCardIndex];
    this.speakText(item.exampleTarget);
  }

  private speakText(text: string): void {
    if (!text) return;
    if (!('speechSynthesis' in window)) {
      this.showToast(t('vc.toastNoTts'));
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = (LANG_META[this.currentLang] || LANG_META.ja).ttsCode;
    utterance.rate = 0.95;
    window.speechSynthesis.speak(utterance);
  }

  // ================= TAB 2: SPEED QUIZ =================
  private initSpeedQuiz(): void {
    const playSoundBtn = document.getElementById('quizPlaySound');
    const nextBtn = document.getElementById('quizNextBtn');

    if (playSoundBtn) {
      playSoundBtn.addEventListener('click', () => {
        if (this.currentQuizItem) this.speakText(this.currentQuizItem.word);
      });
    }

    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        this.startSpeedQuizQuestion();
      });
    }

    this.startSpeedQuizQuestion();
  }

  private startSpeedQuizQuestion(): void {
    if (this.dataState !== 'ready') return;
    clearSkeleton(document.querySelector('#tabQuiz .quiz-arena-container'));
    const deck = this.allWords;
    const optionsGrid = document.getElementById('quizOptionsGrid');
    const feedbackBanner = document.getElementById('quizFeedbackBanner');
    if (feedbackBanner) feedbackBanner.classList.remove('show', 'wrong-border');
    this.lastFeedback = null;

    if (deck.length < 2) {
      if (this.quizTimerInterval) clearInterval(this.quizTimerInterval);
      const targetWordEl = document.getElementById('quizTargetWord');
      const subHintEl = document.getElementById('quizSubHint');
      if (targetWordEl) targetWordEl.textContent = '—';
      if (subHintEl) subHintEl.textContent = '';
      if (optionsGrid) {
        optionsGrid.innerHTML = `<p style="grid-column:1 / -1;text-align:center;color:#64748b;font-weight:600;">${t('vc.quizNeedTwo')}</p>`;
      }
      return;
    }

    const randomIndex = Math.floor(Math.random() * deck.length);
    this.currentQuizItem = deck[randomIndex];

    const targetWordEl = document.getElementById('quizTargetWord');
    const subHintEl = document.getElementById('quizSubHint');

    if (targetWordEl) targetWordEl.textContent = this.currentQuizItem.word;
    if (subHintEl) subHintEl.textContent = this.currentQuizItem.phonetic
      ? t('vc.quizPhonetic', { value: this.currentQuizItem.phonetic })
      : t('vc.quizTopic', { value: this.currentQuizItem.tag });

    const options: string[] = [this.currentQuizItem.meaning];
    const otherItems = deck.filter(it => it.id !== this.currentQuizItem!.id);
    this.shuffleArray(otherItems);

    for (let i = 0; i < Math.min(3, otherItems.length); i++) {
      if (!options.includes(otherItems[i].meaning)) options.push(otherItems[i].meaning);
    }
    this.shuffleArray(options);

    if (optionsGrid) {
      optionsGrid.innerHTML = '';
      options.forEach(opt => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'quiz-option-btn';
        const label = document.createElement('span');
        label.textContent = opt;
        const icon = document.createElement('i');
        icon.className = 'fa-solid fa-arrow-right';
        icon.style.opacity = '0.4';
        btn.append(label, icon);
        btn.addEventListener('click', () => this.handleQuizAnswer(btn, opt));
        optionsGrid.appendChild(btn);
      });
    }

    // Đồng hồ chỉ chạy khi tab luyện tập đang mở, tránh trừ mức ghi nhớ oan
    if (document.getElementById('tabQuiz')?.classList.contains('active')) {
      this.startQuizTimer();
    } else if (this.quizTimerInterval) {
      clearInterval(this.quizTimerInterval);
    }
  }

  private startQuizTimer(): void {
    if (this.quizTimerInterval) clearInterval(this.quizTimerInterval);
    this.quizRemainingTime = 15;
    const timerText = document.getElementById('quizTimerText');
    if (timerText) timerText.textContent = `${this.quizRemainingTime}s`;

    this.quizTimerInterval = window.setInterval(() => {
      this.quizRemainingTime--;
      if (timerText) timerText.textContent = `${this.quizRemainingTime}s`;
      if (this.quizRemainingTime <= 0) {
        clearInterval(this.quizTimerInterval!);
        this.handleQuizTimeout();
      }
    }, 1000);
  }

  private handleQuizAnswer(selectedBtn: HTMLButtonElement, selectedAnswer: string): void {
    if (!this.currentQuizItem) return;
    if (this.quizTimerInterval) clearInterval(this.quizTimerInterval);

    const isCorrect = selectedAnswer === this.currentQuizItem.meaning;
    const allButtons = document.querySelectorAll('.quiz-option-btn');
    allButtons.forEach(b => (b as HTMLButtonElement).disabled = true);

    const feedbackBanner = document.getElementById('quizFeedbackBanner');
    const feedbackMsg = document.getElementById('quizFeedbackMsg');
    const streakCount = document.getElementById('quizStreakCount');
    const scoreCount = document.getElementById('quizScoreCount');

    if (isCorrect) {
      selectedBtn.classList.add('correct');
      this.quizStreak++;
      const bonusXP = 15 + (this.quizStreak * 5);
      this.quizScore += bonusXP;
      void this.persistReview(this.currentQuizItem, 'Tốt', bonusXP);
      this.lastFeedback = 'correct';
      this.lastFeedbackXp = bonusXP;

      if (feedbackBanner && feedbackMsg) {
        feedbackBanner.classList.add('show');
        feedbackBanner.classList.remove('wrong-border');
        feedbackMsg.textContent = t('vc.quizCorrect', { xp: bonusXP });
      }
    } else {
      selectedBtn.classList.add('wrong');
      this.quizStreak = 0;
      void this.persistReview(this.currentQuizItem, 'Khó', 0);
      this.lastFeedback = 'wrong';

      allButtons.forEach(b => {
        if (b.textContent?.includes(this.currentQuizItem!.meaning)) {
          b.classList.add('correct');
        }
      });

      if (feedbackBanner && feedbackMsg) {
        feedbackBanner.classList.add('show', 'wrong-border');
        feedbackMsg.textContent = t('vc.quizWrong', { answer: this.currentQuizItem.meaning });
      }
    }

    if (streakCount) streakCount.textContent = this.quizStreak.toString();
    if (scoreCount) scoreCount.textContent = `${this.quizScore} XP`;
  }

  private handleQuizTimeout(): void {
    this.quizStreak = 0;
    const streakCount = document.getElementById('quizStreakCount');
    if (streakCount) streakCount.textContent = '0';

    if (this.currentQuizItem) {
      void this.persistReview(this.currentQuizItem, 'Khó', 0);
    }

    const feedbackBanner = document.getElementById('quizFeedbackBanner');
    const feedbackMsg = document.getElementById('quizFeedbackMsg');
    if (feedbackBanner && feedbackMsg && this.currentQuizItem) {
      feedbackBanner.classList.add('show', 'wrong-border');
      feedbackMsg.textContent = t('vc.quizTimeout', { answer: this.currentQuizItem.meaning });
      this.lastFeedback = 'timeout';
    }
  }

  private async persistReview(item: VocabItem, rating: 'Khó' | 'Tốt', xp: number): Promise<void> {
    // Khách: không lưu tiến độ, chỉ làm mẫu trên giao diện
    if (!isLearnerAuthenticated()) return;
    try {
      const response = await slanguageApi<{ mastery_level?: unknown }>(
        `/api/v1/vocabulary/words/${item.id}/review`,
        { method: 'POST', body: { review_id: crypto.randomUUID(), rating } },
      );
      const mastery = Number(response.data.mastery_level) || 0;
      item.masteryLevel = mastery;
      item.status = mastery >= 5 ? 'mastered' : 'unmastered';
      this.updateVaultCounts();
      this.renderVault();
      if (this.currentDeck.includes(item)) this.renderCurrentCard();
    } catch {
      this.showToast(t('vc.toastSaveFail'));
      return;
    }

    if (xp > 0) {
      try {
        await slanguageApi('/api/v1/minigame/progress', {
          method: 'POST',
          body: { xp, word_ids: [] },
        });
        this.addXP(xp);
      } catch {
        this.showToast(t('vc.toastXpFail'));
      }
    }
  }

  // ================= TAB 3: VOCABULARY VAULT =================
  private initVocabularyVault(): void {
    const searchInput = document.getElementById('vaultSearchInput') as HTMLInputElement;
    const filterPills = document.querySelectorAll('.vault-pill');

    if (searchInput) {
      searchInput.addEventListener('input', () => {
        this.renderVault();
      });
    }

    filterPills.forEach(pill => {
      pill.addEventListener('click', () => {
        filterPills.forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        this.renderVault();
      });
    });

    this.renderVault();
  }

  private renderVault(keyword?: string, statusFilter?: string): void {
    const vaultGrid = document.getElementById('vaultGrid');
    if (!vaultGrid) return;
    if (this.dataState !== 'ready') return;
    clearSkeleton(vaultGrid);

    const searchInput = document.getElementById('vaultSearchInput') as HTMLInputElement | null;
    const activePill = document.querySelector('.vault-pill.active');
    const q = (keyword ?? searchInput?.value ?? '').toLowerCase().trim();
    const filter = statusFilter ?? activePill?.getAttribute('data-filter') ?? 'all';

    this.updateVaultCounts();

    let items = this.allWords;

    if (q) {
      items = items.filter(it =>
        it.word.toLowerCase().includes(q) ||
        it.phonetic.toLowerCase().includes(q) ||
        it.meaning.toLowerCase().includes(q) ||
        it.exampleTarget.toLowerCase().includes(q)
      );
    }

    if (filter === 'mastered') {
      items = items.filter(it => it.status === 'mastered');
    } else if (filter === 'unmastered') {
      items = items.filter(it => it.status !== 'mastered');
    }

    vaultGrid.innerHTML = '';

    if (items.length === 0) {
      vaultGrid.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 40px; color: #64748b;">
          <i class="fa-solid fa-folder-open" style="font-size: 2.5rem; margin-bottom: 12px; opacity: 0.5;"></i>
          <p style="font-size: 1.05rem; font-weight: 600;">${t('vc.vaultEmpty')}</p>
        </div>
      `;
      return;
    }

    items.forEach(item => {
      const card = document.createElement('div');
      card.className = 'vault-word-card';

      const isMastered = item.status === 'mastered';
      const st = isMastered
        ? { label: t('vc.statusMastered'), cls: 'mastered' }
        : { label: t('vc.statusUnmastered', { n: item.masteryLevel }), cls: 'unmastered' };

      card.innerHTML = `
        <div class="vwc-header">
          <div class="vwc-word">${escapeHtml(item.word)}</div>
          <span class="vwc-phonetic">${escapeHtml(item.phonetic)}</span>
        </div>
        <div class="vwc-meaning">${escapeHtml(item.meaning)}</div>
        <div class="vwc-example">
          "${escapeHtml(item.exampleTarget)}"<br>
          <small style="color: #64748b;">${escapeHtml(item.exampleMeaning)}</small>
        </div>
        <div class="vwc-footer">
          <span class="vwc-status-badge ${st.cls}">${st.label}</span>
          <div class="vwc-actions">
            <button type="button" class="vwc-btn btn-speak" title="${t('vc.cardSpeakTitle')}">
              <i class="fa-solid fa-volume-high"></i>
            </button>
            <button type="button" class="vwc-btn btn-study" title="${t('vc.cardStudyTitle')}">
              <i class="fa-solid fa-play"></i>
            </button>
          </div>
        </div>
      `;

      card.querySelector('.btn-speak')?.addEventListener('click', () => {
        this.speakText(item.word);
      });

      card.querySelector('.btn-study')?.addEventListener('click', () => {
        let foundIdx = this.currentDeck.findIndex(d => d.id === item.id);
        if (foundIdx === -1) {
          const deckSelect = document.getElementById('deckSelect') as HTMLSelectElement | null;
          if (deckSelect) deckSelect.value = String(item.topicId);
          this.updateCurrentDeck(String(item.topicId));
          foundIdx = this.currentDeck.findIndex(d => d.id === item.id);
        }
        if (foundIdx !== -1) {
          this.activeCardIndex = foundIdx;
          const flashTab = document.querySelector('[data-tab="flashcard"]') as HTMLButtonElement;
          if (flashTab) flashTab.click();
          this.renderCurrentCard();
          this.showToast(t('vc.toastOpenCard', { word: item.word }));
        }
      });

      vaultGrid.appendChild(card);
    });
  }

  // ================= KEYBOARD SHORTCUTS =================
  private bindShortcuts(): void {
    document.addEventListener('keydown', (e) => {
      if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA') return;

      if (e.code === 'Space') {
        e.preventDefault();
        const flashcardBox = document.getElementById('flashcardBox');
        if (flashcardBox) flashcardBox.classList.toggle('flipped');
      } else if (e.code === 'ArrowRight') {
        this.nextCard();
      } else if (e.code === 'ArrowLeft') {
        this.prevCard();
      }
    });
  }

  // ================= UTILITIES =================
  private updateXPDisplays(): void {
    const localeTag = getLocale() === 'en' ? 'en-US' : getLocale() === 'ja' ? 'ja-JP' : 'vi-VN';
    const label = `${this.currentXP.toLocaleString(localeTag)} ${t('unit.xp')}`;
    const navXPVal = document.getElementById('navXPVal');
    if (navXPVal) navXPVal.textContent = label;
    const headerXP = document.getElementById('headerXPVal');
    if (headerXP) {
      headerXP.textContent = headerXP.closest('.hud-chip--xp')
        ? this.currentXP.toLocaleString(localeTag)
        : label;
    }
  }

  private addXP(points: number): void {
    this.currentXP += points;
    localStorage.setItem('slanguage_user_xp', this.currentXP.toString());
    this.updateXPDisplays();
    const navXPVal = document.getElementById('navXPVal') || document.getElementById('headerXPVal');
    navXPVal?.parentElement?.classList.add('bounce');
    setTimeout(() => navXPVal?.parentElement?.classList.remove('bounce'), 400);
  }

  private showToast(message: string): void {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.style.display = 'flex';
    toast.style.flexDirection = 'column';
    toast.style.alignItems = 'flex-start';
    toast.style.gap = '6px';
    toast.style.padding = '12px 18px';
    toast.style.border = '2px solid #FFB703';
    toast.style.background = '#061A28';
    toast.style.borderRadius = '16px';
    toast.style.boxShadow = '0 12px 32px rgba(6, 26, 40, 0.6), 0 0 18px rgba(255, 183, 3, 0.25)';

    toast.innerHTML = `
      <div style="display: flex; align-items: center; gap: 8px; padding-bottom: 5px; border-bottom: 1px solid rgba(255, 183, 3, 0.25); width: 100%;">
        <img src="../../../assets/logo.png" alt="S Language Logo" style="width: 20px; height: 20px; object-fit: contain; flex-shrink: 0;">
        <span style="font-size: 0.85rem; font-weight: 700; color: #FFB703; letter-spacing: 0.2px;">${t('to.brand')}</span>
      </div>
      <div style="display: flex; align-items: center; gap: 8px; font-size: 0.95rem; font-weight: 700; color: #ffffff;">
        <span>${escapeHtml(message)}</span>
      </div>
    `;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  private shuffleArray<T>(array: T[]): void {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
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
            video.play().catch(() => {});
          });
        }
      }
    }
    setTimeout(() => {
      window.location.href = targetUrl;
    }, duration);
  }
}

// Initialize on DOM ready

function initSlanguageVocabulary(): void {
  (window as unknown as { vocabularyApp?: SlanguageVocabulary }).vocabularyApp = new SlanguageVocabulary();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initSlanguageVocabulary);
} else {
  initSlanguageVocabulary();
}