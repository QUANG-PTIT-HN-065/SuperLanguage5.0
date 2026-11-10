/**
 * ==========================================================================
 * SLANGUAGE - ASSESSMENT PRACTICE QUIZ ENGINE (Frontend/quiz/quiz.ts)
 * Design System: Ocean Blue (#00A3C4 / #0096C7), Teal (#0891B2), 
 *               Emerald (#10B981), Topaz Yellow (#FFB703), Crimson (#DC143C)
 * ==========================================================================
 */

export interface QuizOption {
  key: 'A' | 'B' | 'C' | 'D';
  text: string;
}

export interface QuizExplanation {
  word: string;
  reading: string;
  description: string;
  antonym?: string;
  exampleSentence?: string;
}

export interface QuestionData {
  id: number;
  total: number;
  category: string;
  tag: string;
  targetWord: string;
  targetRomaji: string;
  dialogueJa: string;
  dialogueRomaji: string;
  questionText: string;
  options: QuizOption[];
  correctKey: 'A' | 'B' | 'C' | 'D';
  explanation: QuizExplanation;
  earnedXP: number;
}

export interface QuizSessionState {
  currentQuestionIndex: number;
  totalQuestions: number;
  selectedOption: 'A' | 'B' | 'C' | 'D' | null;
  isChecked: boolean;
  timeRemainingSeconds: number;
  heartsRemaining: number;
  totalHearts: number;
  totalEarnedXP: number;
  isPaused: boolean;
}

export class SlanguageQuizEngine {
  private state: QuizSessionState;
  private currentQuestion: QuestionData;
  private timerInterval: number | null = null;
  private synth: SpeechSynthesis | null = null;

  constructor() {
    this.state = {
      currentQuestionIndex: 3, // Câu 04 (index 3)
      totalQuestions: 10,
      selectedOption: 'A',
      isChecked: true, // Trạng thái đã kiểm tra đáp án A theo UI mẫu
      timeRemainingSeconds: 762, // 12 phút 42 giây (12 * 60 + 42)
      heartsRemaining: 3,
      totalHearts: 3,
      totalEarnedXP: 15,
      isPaused: false
    };

    // Chi tiết câu hỏi số 04 theo đúng UI
    this.currentQuestion = {
      id: 4,
      total: 10,
      category: 'Từ vựng & Ngữ cảnh • JLPT N4–N5',
      tag: '#ThựcChiến',
      targetWord: '美味しい',
      targetRomaji: 'Oishii',
      dialogueJa: '『 このラーメンはとても美味しいですね！ 』',
      dialogueRomaji: '"Kono raamen wa totemo oishii desu ne!"',
      questionText: 'Ý nghĩa chính xác của từ vựng 「美味しい」 (Oishii) trong câu trên là gì?',
      options: [
        { key: 'A', text: 'Ngon miệng, thơm ngon, đậm đà hương vị' },
        { key: 'B', text: 'Cay nồng, khó ăn' },
        { key: 'C', text: 'Đắt đỏ, xa xỉ' },
        { key: 'D', text: 'Nguội lạnh, thanh đạm' }
      ],
      correctKey: 'A',
      explanation: {
        word: '美味しい',
        reading: 'Oishii',
        description: 'là tính từ đuôi -i dùng để khen món ăn thơm ngon, hợp khẩu vị.',
        antonym: '不味い (Mazui) (dở, khó ăn)',
        exampleSentence: 'このラーメンはとても美味しいですね！'
      },
      earnedXP: 10
    };

    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      this.synth = window.speechSynthesis;
    }

    this.init();
  }

  /**
   * Khởi tạo giao diện, gắn sự kiện và kích hoạt bộ đếm thời gian
   */
  public init(): void {
    this.bindDOMEvents();
    this.startTimer();
    this.updateProgressTrack();
    this.renderQuestionData();

    // Nếu đã ở trạng thái đã kiểm tra đáp án, tiến hành khóa các đáp án còn lại
    if (this.state.isChecked && this.state.selectedOption) {
      this.lockAnswersAfterCheck();
    }
  }

  /**
   * Bộ đếm thời gian làm bài đếm ngược từng giây
   */
  private startTimer(): void {
    this.updateTimerDisplay();
    this.timerInterval = window.setInterval(() => {
      if (this.state.isPaused) return;

      if (this.state.timeRemainingSeconds > 0) {
        this.state.timeRemainingSeconds--;
        this.updateTimerDisplay();

        // Cảnh báo thời gian dưới 60 giây
        if (this.state.timeRemainingSeconds < 60) {
          const timerEl = document.getElementById('quizTimerText');
          if (timerEl && !timerEl.classList.contains('timer-warning')) {
            timerEl.classList.add('timer-warning');
          }
        }
      } else {
        this.stopTimer();
        this.handleTimeOut();
      }
    }, 1000);
  }

  /**
   * Tạm dừng hoặc dừng hẳn bộ đếm thời gian
   */
  private stopTimer(): void {
    if (this.timerInterval !== null) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  /**
   * Cập nhật hiển thị đồng hồ số (MM : SS)
   */
  private updateTimerDisplay(): void {
    const timerEl = document.getElementById('quizTimerText');
    if (!timerEl) return;

    const minutes: number = Math.floor(this.state.timeRemainingSeconds / 60);
    const seconds: number = this.state.timeRemainingSeconds % 60;
    const formattedMin: string = minutes.toString().padStart(2, '0');
    const formattedSec: string = seconds.toString().padStart(2, '0');

    timerEl.textContent = `${formattedMin} : ${formattedSec}`;
  }

  /**
   * Cập nhật thanh tiến trình hoàn thành và nhãn hiển thị số câu
   */
  private updateProgressTrack(): void {
    const progressBar = document.getElementById('quizProgressBar') as HTMLElement | null;
    const counterLabel = document.getElementById('questionCounterLabel');
    const percentage: number = (this.currentQuestion.id / this.state.totalQuestions) * 100;

    if (progressBar) {
      progressBar.style.width = `${percentage}%`;
    }

    if (counterLabel) {
      const qIndexStr = this.currentQuestion.id.toString().padStart(2, '0');
      const totalStr = this.state.totalQuestions.toString().padStart(2, '0');
      counterLabel.innerHTML = `<i class="fa-regular fa-square-check text-[#0891B2]"></i> CÂU HỎI ${qIndexStr} / ${totalStr}`;
    }
  }

  /**
   * Hiển thị dữ liệu câu hỏi và ngữ cảnh lên giao diện
   */
  private renderQuestionData(): void {
    const dialogueJaEl = document.querySelector('.dialogue-ja-text');
    if (dialogueJaEl) {
      dialogueJaEl.innerHTML = `『 このラーメンはとても<span class="dialogue-highlight-word text-[#0891B2] underline underline-offset-4 decoration-2 font-black">${this.currentQuestion.targetWord}</span>ですね！ 』`;
    }

    const questionHeading = document.querySelector('.question-heading');
    if (questionHeading) {
      questionHeading.innerHTML = `Ý nghĩa chính xác của từ vựng <span class="question-heading-target text-[#0891B2]">「${this.currentQuestion.targetWord}」</span> (${this.currentQuestion.targetRomaji}) trong câu trên là gì?`;
    }
  }

  /**
   * Gắn các sự kiện tương tác DOM
   */
  private bindDOMEvents(): void {
    // 1. Nút Nghe mẫu phát âm chuẩn Tokyo
    const btnAudio = document.getElementById('btnPlayNativeAudio') as HTMLButtonElement | null;
    if (btnAudio) {
      btnAudio.addEventListener('click', () => {
        this.playNativePronunciation(this.currentQuestion.targetWord, btnAudio);
      });
    }

    // 2. Nút Nghe ví dụ trong phần giải thích
    const btnExplanationAudio = document.getElementById('btnListenExplanation') as HTMLButtonElement | null;
    if (btnExplanationAudio) {
      btnExplanationAudio.addEventListener('click', () => {
        this.playNativePronunciation(this.currentQuestion.explanation.exampleSentence || 'このラーメンはとても美味しいですね！', btnExplanationAudio);
      });
    }

    // 3. Nút Tạm dừng bài làm
    const btnPause = document.getElementById('btnPauseExit') as HTMLButtonElement | null;
    if (btnPause) {
      btnPause.addEventListener('click', () => {
        this.handlePauseAndExit();
      });
    }

    // 4. Nút Báo cáo câu hỏi
    const btnReport = document.getElementById('btnReportQuestion') as HTMLButtonElement | null;
    if (btnReport) {
      btnReport.addEventListener('click', () => {
        this.handleReportQuestion();
      });
    }

    // 5. Nút Câu tiếp theo
    const btnNext = document.getElementById('btnNextQuestion') as HTMLButtonElement | null;
    if (btnNext) {
      btnNext.addEventListener('click', () => {
        this.handleNextQuestion();
      });
    }

    // 6. Lựa chọn thẻ phương án A, B, C, D
    const optionCards = document.querySelectorAll<HTMLElement>('.quiz-option-card, .quiz-option-item');
    optionCards.forEach((card) => {
      card.addEventListener('click', () => {
        if (this.state.isChecked) return;
        const optKey = card.getAttribute('data-option') as 'A' | 'B' | 'C' | 'D' | null;
        if (optKey) {
          this.selectOption(optKey);
        }
      });
    });

    // 7. Phím tắt thao tác nhanh (1-4 / A-D, Ctrl+Space, Enter)
    window.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (!this.state.isChecked) {
        const keyMap: Record<string, 'A' | 'B' | 'C' | 'D'> = {
          '1': 'A', 'a': 'A',
          '2': 'B', 'b': 'B',
          '3': 'C', 'c': 'C',
          '4': 'D', 'd': 'D'
        };
        const selected = keyMap[e.key.toLowerCase()];
        if (selected) {
          this.selectOption(selected);
        }
      }

      // Ctrl + Space: Nghe phát âm
      if (e.code === 'Space' && e.ctrlKey) {
        e.preventDefault();
        this.playNativePronunciation(this.currentQuestion.targetWord);
      }

      // Enter: Tiếp tục sang câu tiếp theo
      if (e.key === 'Enter' && this.state.isChecked) {
        e.preventDefault();
        this.handleNextQuestion();
      }
    });
  }

  /**
   * Chọn 1 phương án duy nhất
   */
  public selectOption(optKey: 'A' | 'B' | 'C' | 'D'): void {
    this.state.selectedOption = optKey;
    const optionCards = document.querySelectorAll<HTMLElement>('.quiz-option-card, .quiz-option-item');

    optionCards.forEach((card) => {
      const isSelected = card.getAttribute('data-option') === optKey;
      card.classList.toggle('selected', isSelected);

      const statusIcon = card.querySelector('.status-icon, .option-status-icon');
      if (statusIcon) {
        statusIcon.innerHTML = isSelected
          ? '<i class="fa-solid fa-check text-[#0891B2] text-lg font-bold"></i>'
          : '';
      }
    });
  }

  /**
   * Khóa tất cả các phương án không được chọn sau khi kiểm tra kết quả
   * Giữ trạng thái đáp án chọn (A) và hiển thị icon ổ khóa 🔒 cho B, C, D
   */
  public lockAnswersAfterCheck(): void {
    this.state.isChecked = true;
    const optionCards = document.querySelectorAll<HTMLElement>('.quiz-option-card, .quiz-option-item');

    optionCards.forEach((card) => {
      const optKey = card.getAttribute('data-option');
      const isSelected = optKey === this.state.selectedOption;

      if (!isSelected) {
        card.classList.add('locked');
        card.setAttribute('disabled', 'true');
        card.style.pointerEvents = 'none';

        const statusIcon = card.querySelector('.status-icon, .option-status-icon');
        if (statusIcon) {
          statusIcon.innerHTML = '<i class="fa-solid fa-lock text-slate-400 text-sm"></i>';
        }
      } else {
        card.classList.add('selected');
        const statusIcon = card.querySelector('.status-icon, .option-status-icon');
        if (statusIcon) {
          statusIcon.innerHTML = '<i class="fa-solid fa-check text-[#0891B2] text-lg font-bold"></i>';
        }
      }
    });
  }

  /**
   * Phát âm giọng đọc chuẩn Tokyo qua Web Speech API
   */
  public playNativePronunciation(text: string, triggerBtn?: HTMLElement): void {
    if (!this.synth) {
      alert(`Phát âm [ja-JP]: ${text}`);
      return;
    }

    this.synth.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'ja-JP';
    utterance.rate = 0.88;
    utterance.pitch = 1.0;

    if (triggerBtn) {
      triggerBtn.classList.add('audio-playing');
      utterance.onend = () => {
        triggerBtn.classList.remove('audio-playing');
      };
      utterance.onerror = () => {
        triggerBtn.classList.remove('audio-playing');
      };
    }

    this.synth.speak(utterance);
  }

  /**
   * Tạm dừng bài làm và quay về trung tâm luyện tập
   */
  private handlePauseAndExit(): void {
    this.state.isPaused = true;
    const confirmExit: boolean = window.confirm(
      'Bạn có chắc chắn muốn tạm dừng bài làm? Tiến độ câu hỏi và thời gian còn lại sẽ được lưu tự động vào tài khoản.'
    );

    if (confirmExit) {
      this.stopTimer();
      window.location.href = '../vocabulary/index.html';
    } else {
      this.state.isPaused = false;
    }
  }

  /**
   * Gửi báo cáo góp ý câu hỏi
   */
  private handleReportQuestion(): void {
    alert(
      `Cảm ơn bạn! Báo cáo phản hồi về Câu hỏi số ${this.currentQuestion.id.toString().padStart(2, '0')} đã được gửi tới hội đồng học thuật Slanguage để rà soát.`
    );
  }

  /**
   * Chuyển sang câu hỏi tiếp theo
   */
  private handleNextQuestion(): void {
    const nextId = this.currentQuestion.id + 1;
    if (nextId <= this.state.totalQuestions) {
      alert(`Đang tải dữ liệu Câu hỏi ${nextId.toString().padStart(2, '0')} / ${this.state.totalQuestions}...`);
    } else {
      alert('Chúc mừng bạn đã hoàn thành xuất sắc bài kiểm tra luyện tập 10/10!');
    }
  }

  /**
   * Xử lý khi hết thời gian làm bài
   */
  private handleTimeOut(): void {
    alert('Đã hết giờ làm bài! Hệ thống đang tự động tổng hợp kết quả làm bài của bạn.');
  }
}

// Tự động khởi tạo phiên làm bài khi tài liệu đã tải xong
document.addEventListener('DOMContentLoaded', () => {
  (window as unknown as { slanguageQuiz: SlanguageQuizEngine }).slanguageQuiz = new SlanguageQuizEngine();
});