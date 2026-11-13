/**
 * Slanguage 3D Flashcard & SRS Controller (Task 54)
 * Xử lý thẻ lật 3D (rotateY, preserve-3d), phím tắt (Space, 1-4, Esc),
 * cử chỉ vuốt chạm cảm ứng (Swipe Left/Right), Web Speech API audio,
 * và điều khiển phiên ôn tập Spaced Repetition System.
 */

export interface FlashcardWord {
  id: number;
  word: string;
  phonetic: string | null;
  meaning: string;
  partOfSpeech: string | null;
  example: string | null;
  exampleMeaning: string | null;
  level: string;
  mastery_level?: number;
  next_review_at?: string;
}

export type ReviewRating = "Lại" | "Khó" | "Tốt" | "Dễ";

export interface FlashcardSessionOptions {
  words: FlashcardWord[];
  onRating: (word: FlashcardWord, rating: ReviewRating) => Promise<boolean>;
  onComplete: (reviewedCount: number, knownCount: number) => Promise<void>;
  onClose: () => void;
}

export class FlashcardController {
  private words: FlashcardWord[];
  private currentIndex = 0;
  private knownCount = 0;
  private isFlipped = false;
  private isBusy = false;

  private onRating: (word: FlashcardWord, rating: ReviewRating) => Promise<boolean>;
  private onComplete: (reviewedCount: number, knownCount: number) => Promise<void>;
  private onClose: () => void;

  // DOM Elements
  private backdrop: HTMLElement;
  private flipper: HTMLElement;
  private stage: HTMLElement;
  private revealBtn: HTMLButtonElement;
  private choicesContainer: HTMLElement;
  private completionContainer: HTMLElement;
  private progressFill: HTMLElement;
  private progressCounter: HTMLElement;
  private srsStatsChip: HTMLElement;

  // Touch tracking
  private touchStartX = 0;
  private touchStartY = 0;

  constructor(options: FlashcardSessionOptions) {
    this.words = options.words;
    this.onRating = options.onRating;
    this.onComplete = options.onComplete;
    this.onClose = options.onClose;

    this.backdrop = document.getElementById("focusModeBackdrop") as HTMLElement;
    this.flipper = document.getElementById("flashcardFlipper") as HTMLElement;
    this.stage = document.getElementById("flashcardStage") as HTMLElement;
    this.revealBtn = document.getElementById("revealMeaning") as HTMLButtonElement;
    this.choicesContainer = document.getElementById("reviewChoices") as HTMLElement;
    this.completionContainer = document.getElementById("reviewCompletion") as HTMLElement;
    this.progressFill = document.getElementById("reviewProgressFill") as HTMLElement;
    this.progressCounter = document.getElementById("reviewProgressText") as HTMLElement;
    this.srsStatsChip = document.getElementById("srsStatsSummary") as HTMLElement;

    this.bindEvents();
  }

  public start(): void {
    if (!this.words.length || !this.backdrop) return;
    this.currentIndex = 0;
    this.knownCount = 0;
    this.isFlipped = false;
    this.isBusy = false;

    this.backdrop.hidden = false;
    this.backdrop.setAttribute("aria-hidden", "false");
    document.body.classList.add("focus-mode-active");

    this.updateSrsStatsChip();
    this.renderCurrentCard();
    this.stage?.focus();
  }

  public close(): void {
    if (this.backdrop) {
      this.backdrop.hidden = true;
      this.backdrop.setAttribute("aria-hidden", "true");
    }
    document.body.classList.remove("focus-mode-active");
    this.onClose();
  }

  public flip(forceState?: boolean): void {
    if (!this.flipper) return;
    this.isFlipped = forceState !== undefined ? forceState : !this.isFlipped;
    this.flipper.classList.toggle("is-flipped", this.isFlipped);

    if (this.revealBtn) {
      this.revealBtn.setAttribute("aria-expanded", String(this.isFlipped));
      this.revealBtn.innerHTML = this.isFlipped
        ? '<i class="fa-solid fa-arrow-rotate-left" aria-hidden="true"></i> Lật lại mặt trước'
        : '<i class="fa-solid fa-arrows-rotate" aria-hidden="true"></i> Lật thẻ xem nghĩa';
    }
  }

  private updateSrsStatsChip(): void {
    if (!this.srsStatsChip) return;
    // Phân loại SRS: Ôn n, Đang học n, Mới n
    let dueCount = 0;
    let learningCount = 0;
    let newCount = 0;

    const now = new Date();
    this.words.forEach((w) => {
      const mastery = w.mastery_level || 0;
      if (mastery === 0) {
        newCount += 1;
      } else if (w.next_review_at && new Date(w.next_review_at) <= now) {
        dueCount += 1;
      } else {
        learningCount += 1;
      }
    });

    this.srsStatsChip.innerHTML = `
      <span class="srs-chip srs-chip--due" title="Đến hạn ôn tập hôm nay"><i class="fa-solid fa-clock"></i> Ôn ${dueCount}</span>
      <span class="srs-chip srs-chip--learning" title="Đang trong chu kỳ ghi nhớ"><i class="fa-solid fa-brain"></i> Đang học ${learningCount}</span>
      <span class="srs-chip srs-chip--new" title="Từ mới chưa đánh giá"><i class="fa-solid fa-sparkles"></i> Mới ${newCount}</span>
    `;
  }

  private renderCurrentCard(): void {
    const word = this.words[this.currentIndex];
    if (!word) return;

    this.flip(false);

    const levelEl = document.getElementById("reviewLevel");
    const posEl = document.getElementById("reviewPartOfSpeech");
    const wordEl = document.getElementById("reviewWord");
    const phoneticEl = document.getElementById("reviewPhonetic");
    const meaningText = document.getElementById("reviewMeaningText");
    const exampleEl = document.getElementById("reviewExample");
    const exampleMeaningEl = document.getElementById("reviewExampleMeaning");

    if (levelEl) levelEl.textContent = word.level || "A1";
    if (posEl) {
      posEl.textContent = word.partOfSpeech || "từ vựng";
      posEl.hidden = !word.partOfSpeech;
    }
    if (wordEl) wordEl.textContent = word.word;
    if (phoneticEl) phoneticEl.textContent = word.phonetic || "";
    if (meaningText) meaningText.textContent = word.meaning;
    if (exampleEl) exampleEl.textContent = word.example || "Chưa có ví dụ ngữ cảnh.";
    if (exampleMeaningEl) exampleMeaningEl.textContent = word.exampleMeaning || "";

    if (this.revealBtn) this.revealBtn.hidden = false;
    if (this.choicesContainer) this.choicesContainer.hidden = false;
    if (this.completionContainer) this.completionContainer.hidden = true;

    if (this.progressCounter) {
      this.progressCounter.textContent = `Còn ${this.words.length - this.currentIndex} từ cần ôn · ${this.currentIndex + 1} / ${this.words.length}`;
    }
    if (this.progressFill) {
      this.progressFill.style.width = `${((this.currentIndex) / this.words.length) * 100}%`;
    }
  }

  public async rate(rating: ReviewRating): Promise<void> {
    if (this.isBusy) return;
    const word = this.words[this.currentIndex];
    if (!word) return;

    this.isBusy = true;
    const buttons = Array.from(this.choicesContainer.querySelectorAll<HTMLButtonElement>("button"));
    buttons.forEach((b) => { b.disabled = true; });

    try {
      const ok = await this.onRating(word, rating);
      if (ok) {
        if (rating === "Tốt" || rating === "Dễ") {
          this.knownCount += 1;
        }
        this.currentIndex += 1;
        if (this.currentIndex < this.words.length) {
          this.renderCurrentCard();
        } else {
          this.showCompletion();
        }
      }
    } finally {
      buttons.forEach((b) => { b.disabled = false; });
      this.isBusy = false;
    }
  }

  private showCompletion(): void {
    if (this.choicesContainer) this.choicesContainer.hidden = true;
    if (this.revealBtn) this.revealBtn.hidden = true;
    if (this.completionContainer) this.completionContainer.hidden = false;

    if (this.progressCounter) {
      this.progressCounter.textContent = `Đã hoàn thành xuất sắc ${this.words.length} / ${this.words.length} từ!`;
    }
    if (this.progressFill) {
      this.progressFill.style.width = "100%";
    }

    const summaryText = document.getElementById("reviewCompletionText");
    if (summaryText) {
      summaryText.textContent = `Bạn đã hoàn tất phiên ôn tập ${this.words.length} từ vựng với ${this.knownCount} từ đạt mức Tốt hoặc Dễ.`;
    }

    void this.onComplete(this.words.length, this.knownCount);
  }

  public playAudio(): void {
    const word = this.words[this.currentIndex];
    if (!word || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(word.word);
    utterance.lang = "en-US";
    utterance.rate = 0.9;
    window.speechSynthesis.speak(utterance);
  }

  private bindEvents(): void {
    this.revealBtn?.addEventListener("click", () => this.flip());

    document.getElementById("flipBackBtn")?.addEventListener("click", () => this.flip(false));

    this.stage?.addEventListener("click", (e) => {
      const target = e.target as HTMLElement;
      if (target.closest("#reviewAudioBtn") || target.closest(".flip-back-btn")) return;
      this.flip();
    });

    document.getElementById("reviewAudioBtn")?.addEventListener("click", (e) => {
      e.stopPropagation();
      this.playAudio();
    });

    // Touch swipe gestures
    this.stage?.addEventListener("touchstart", (e) => {
      if (e.changedTouches.length) {
        this.touchStartX = e.changedTouches[0].clientX;
        this.touchStartY = e.changedTouches[0].clientY;
      }
    }, { passive: true });

    this.stage?.addEventListener("touchend", (e) => {
      if (!e.changedTouches.length) return;
      const diffX = e.changedTouches[0].clientX - this.touchStartX;
      const diffY = e.changedTouches[0].clientY - this.touchStartY;
      if (Math.abs(diffX) > 60 && Math.abs(diffY) < 50) {
        if (diffX < 0) {
          // Vuốt sang trái: Khó
          void this.rate("Khó");
        } else {
          // Vuốt sang phải: Dễ
          void this.rate("Dễ");
        }
      }
    }, { passive: true });

    // Click 4 Rating Buttons
    this.choicesContainer?.addEventListener("click", (e) => {
      const target = e.target;
      if (!(target instanceof Element)) return;
      const btn = target.closest<HTMLButtonElement>("[data-review-rating]");
      const rating = btn?.dataset.reviewRating as ReviewRating | undefined;
      if (rating) {
        void this.rate(rating);
      }
    });

    document.getElementById("cancelReview")?.addEventListener("click", () => this.close());

    // Keyboard Shortcuts (Space, 1 - 4, Esc)
    window.addEventListener("keydown", (e) => {
      if (this.backdrop && !this.backdrop.hidden) {
        if (e.key === "Escape") {
          this.close();
        } else if (e.key === " " || e.code === "Space") {
          e.preventDefault();
          this.flip();
        } else if (e.key === "1") {
          void this.rate("Lại");
        } else if (e.key === "2") {
          void this.rate("Khó");
        } else if (e.key === "3") {
          void this.rate("Tốt");
        } else if (e.key === "4") {
          void this.rate("Dễ");
        }
      }
    });
  }
}

