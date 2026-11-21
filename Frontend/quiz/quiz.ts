/* ===================================================================
   SLANGUAGE - FULL SCREEN QUIZ ARENA LOGIC (QUIZ ENGINE)
   Tách riêng trang trả lời câu hỏi toàn màn hình, tỉ lệ phân bố chuẩn
   =================================================================== */

interface DungeonTrial {
  prompt: string;
  choices: string[];
  answerIdx: number;
  explanation: string;
}

interface DungeonNodeData {
  id: string;
  stage: number;
  stageName: string;
  title: string;
  desc: string;
  icon: string;
  difficulty: 'easy' | 'normal' | 'hard';
  xpReward: number;
  heartPenalty: number;
  status: 'available' | 'locked' | 'mastered';
  isHub?: boolean;
}

interface QuizPayload {
  node: DungeonNodeData;
  trials: DungeonTrial[];
  lang: string;
}

class SlanguageQuizApp {
  private currentLang: string = 'ja';
  private totalXP: number = 2450;
  private currentHearts: number = 5;
  private readonly maxHearts: number = 5;
  private currentStreak: number = 18;

  private quizPayload!: QuizPayload;
  private currentQuestionIdx: number = 0;
  private selectedChoiceIdx: number | null = null;
  private currentTrialWrongCount: number = 0;
  private currentTrialPhase: 'idle' | 'checked' = 'idle';

  // DOM Elements - Top Navbar
  private btnExitQuiz!: HTMLButtonElement;
  private headerStageCrumb!: HTMLElement;
  private headerNodeTitle!: HTMLElement;
  private headerStreakVal!: HTMLElement;
  private headerXPVal!: HTMLElement;
  private headerHeartsVal!: HTMLElement;

  // DOM Elements - Hero Banner
  private stageHeroIconWrap!: HTMLElement;
  private stageHeroIcon!: HTMLElement;
  private stageHeroTier!: HTMLElement;
  private stageHeroTitle!: HTMLElement;
  private stageHeroStatus!: HTMLElement;
  private stageHeroDifficulty!: HTMLElement;
  private stageHeroXP!: HTMLElement;
  private stageHeroPenalty!: HTMLElement;

  // DOM Elements - Quiz Arena Card
  private stepCounterBadge!: HTMLElement;
  private arenaProgressFill!: HTMLElement;
  private arenaQuestionPrompt!: HTMLElement;
  private arenaChoicesGrid!: HTMLElement;
  private arenaResultBanner!: HTMLElement;
  private resultBannerIcon!: HTMLElement;
  private resultBannerHeading!: HTMLElement;
  private resultBannerDesc!: HTMLElement;
  private btnQuizAction!: HTMLButtonElement;

  // Modals & Toast
  private modalConfirmExit!: HTMLElement;
  private btnCancelExit!: HTMLButtonElement;
  private btnConfirmExit!: HTMLButtonElement;
  private modalRevive!: HTMLElement;
  private reviveModalBody!: HTMLElement;
  private modalVictory!: HTMLElement;
  private victoryModalTitle!: HTMLElement;
  private victoryModalDesc!: HTMLElement;
  private btnVictoryReturn!: HTMLButtonElement;
  private quizToast!: HTMLElement;
  private quizToastText!: HTMLElement;

  constructor() {
    this.initDOM();
    this.loadUserData();
    this.loadQuizPayload();
    this.bindEvents();
    this.renderHeaderStats();
    this.renderStageHero();
    this.renderCurrentQuestion();
  }

  private initDOM(): void {
    // Top Navbar
    this.btnExitQuiz = document.getElementById('btnExitQuiz') as HTMLButtonElement;
    this.headerStageCrumb = document.getElementById('headerStageCrumb')!;
    this.headerNodeTitle = document.getElementById('headerNodeTitle')!;
    this.headerStreakVal = document.getElementById('headerStreakVal')!;
    this.headerXPVal = document.getElementById('headerXPVal')!;
    this.headerHeartsVal = document.getElementById('headerHeartsVal')!;

    // Hero Banner
    this.stageHeroIconWrap = document.getElementById('stageHeroIconWrap')!;
    this.stageHeroIcon = document.getElementById('stageHeroIcon')!;
    this.stageHeroTier = document.getElementById('stageHeroTier')!;
    this.stageHeroTitle = document.getElementById('stageHeroTitle')!;
    this.stageHeroStatus = document.getElementById('stageHeroStatus')!;
    this.stageHeroDifficulty = document.getElementById('stageHeroDifficulty')!;
    this.stageHeroXP = document.getElementById('stageHeroXP')!;
    this.stageHeroPenalty = document.getElementById('stageHeroPenalty')!;

    // Quiz Arena Card
    this.stepCounterBadge = document.getElementById('stepCounterBadge')!;
    this.arenaProgressFill = document.getElementById('arenaProgressFill')!;
    this.arenaQuestionPrompt = document.getElementById('arenaQuestionPrompt')!;
    this.arenaChoicesGrid = document.getElementById('arenaChoicesGrid')!;
    this.arenaResultBanner = document.getElementById('arenaResultBanner')!;
    this.resultBannerIcon = document.getElementById('resultBannerIcon')!;
    this.resultBannerHeading = document.getElementById('resultBannerHeading')!;
    this.resultBannerDesc = document.getElementById('resultBannerDesc')!;
    this.btnQuizAction = document.getElementById('btnQuizAction') as HTMLButtonElement;

    // Modals
    this.modalConfirmExit = document.getElementById('modalConfirmExit')!;
    this.btnCancelExit = document.getElementById('btnCancelExit') as HTMLButtonElement;
    this.btnConfirmExit = document.getElementById('btnConfirmExit') as HTMLButtonElement;
    this.modalRevive = document.getElementById('modalRevive')!;
    this.reviveModalBody = document.getElementById('reviveModalBody')!;
    this.modalVictory = document.getElementById('modalVictory')!;
    this.victoryModalTitle = document.getElementById('victoryModalTitle')!;
    this.victoryModalDesc = document.getElementById('victoryModalDesc')!;
    this.btnVictoryReturn = document.getElementById('btnVictoryReturn') as HTMLButtonElement;
    this.quizToast = document.getElementById('quizToast')!;
    this.quizToastText = document.getElementById('quizToastText')!;
  }

  private loadUserData(): void {
    // Đồng bộ XP
    const savedXP = localStorage.getItem('slanguage_user_xp');
    if (savedXP !== null) {
      const clean = savedXP.replace(/[^0-9]/g, '');
      const parsed = parseInt(clean, 10);
      if (!isNaN(parsed)) this.totalXP = parsed;
    } else {
      this.totalXP = 2450;
      localStorage.setItem('slanguage_user_xp', '2450');
    }

    // Đồng bộ Máu (Hearts)
    const savedHearts = localStorage.getItem('slanguage_user_hearts');
    if (savedHearts !== null) {
      const parsed = parseInt(savedHearts, 10);
      if (!isNaN(parsed)) this.currentHearts = Math.min(this.maxHearts, Math.max(0, parsed));
    } else {
      this.currentHearts = 5;
      localStorage.setItem('slanguage_user_hearts', '5');
    }

    // Đồng bộ Streak
    const savedStreak = localStorage.getItem('slanguage_user_streak');
    if (savedStreak !== null) {
      const parsed = parseInt(savedStreak, 10);
      if (!isNaN(parsed)) this.currentStreak = parsed;
    } else {
      this.currentStreak = 18;
      localStorage.setItem('slanguage_user_streak', '18');
    }

    // Ngôn ngữ
    const savedLang = localStorage.getItem('slanguage_user_lang');
    if (savedLang) {
      this.currentLang = savedLang;
    }
  }

  private loadQuizPayload(): void {
    // 1. Đọc dữ liệu từ localStorage được roadmap.ts gửi qua
    const raw = localStorage.getItem('slanguage_active_quiz_node');
    if (raw) {
      try {
        this.quizPayload = JSON.parse(raw);
        if (this.quizPayload.lang) {
          this.currentLang = this.quizPayload.lang;
        }
      } catch (e) {
        console.error('Lỗi phân tích cú pháp slanguage_active_quiz_node:', e);
      }
    }

    // 2. Nếu không có dữ liệu trong localStorage, kiểm tra query params hoặc tạo dữ liệu mẫu dự phòng
    if (!this.quizPayload || !this.quizPayload.node || !this.quizPayload.trials || this.quizPayload.trials.length === 0) {
      const urlParams = new URLSearchParams(window.location.search);
      const paramLang = urlParams.get('lang');
      if (paramLang) this.currentLang = paramLang;

      // Dữ liệu câu hỏi mẫu chuẩn theo từng ngôn ngữ
      if (this.currentLang === 'ja') {
        this.quizPayload = {
          lang: 'ja',
          node: {
            id: 'ja_s1_easy',
            stage: 1,
            stageName: 'MỐC CHỦ ĐỀ 1: CỔNG NHẬP MÔN & NGỮ ÂM KANA',
            title: 'Nhận Diện 10 Nguyên Âm Cơ Bản',
            desc: 'Nắm vững 5 nguyên âm chính Hiragana và Katakana: a, i, u, e, o.',
            icon: 'fa-solid fa-feather',
            difficulty: 'easy',
            xpReward: 5,
            heartPenalty: 1,
            status: 'available'
          },
          trials: [
            {
              prompt: 'Từ "あい" (ai) trong tiếng Nhật có nghĩa là gì?',
              choices: ['Tình yêu', 'Màu xanh', 'Cái bàn'],
              answerIdx: 0,
              explanation: 'Chính xác! "あい" (Ai) mang ý nghĩa cao đẹp là "Tình yêu" trong tiếng Nhật.'
            },
            {
              prompt: 'Trong bảng chữ cái Hiragana, nguyên âm "う" tương ứng với âm nào?',
              choices: ['Âm "u"', 'Âm "e"', 'Âm "o"'],
              answerIdx: 0,
              explanation: 'Rất chuẩn mực! "う" đọc là âm [u] nhẹ, môi hơi khép tự nhiên theo giọng Tokyo.'
            },
            {
              prompt: 'Nguyên âm "え" (e) khi kết hợp với "い" (i) thành "えい" sẽ phát âm thế nào?',
              choices: ['Kéo dài trường âm "ee"', 'Đọc ngắt quãng từng từ', 'Phát âm thành âm "ai"'],
              answerIdx: 0,
              explanation: 'Xuất sắc! "えい" thường được phát âm như một trường âm [ee] kéo dài 2 phách nhịp.'
            }
          ]
        };
      } else if (this.currentLang === 'en') {
        this.quizPayload = {
          lang: 'en',
          node: {
            id: 'en_s1_easy',
            stage: 1,
            stageName: 'STAGE 1: THE FOUNDATION & PHONETICS',
            title: 'Mastering English Vowel Sounds',
            desc: 'Differentiate short and long vowels in daily English conversations.',
            icon: 'fa-solid fa-microphone-lines',
            difficulty: 'easy',
            xpReward: 5,
            heartPenalty: 1,
            status: 'available'
          },
          trials: [
            {
              prompt: 'Which word contains the long vowel sound /iː/?',
              choices: ['Sheep', 'Ship', 'Sit'],
              answerIdx: 0,
              explanation: 'Excellent! "Sheep" has the long vowel /iː/, whereas "Ship" has the short /ɪ/.'
            },
            {
              prompt: 'What is the correct pronunciation of the word "Cat"?',
              choices: ['/kæt/ with short open "æ"', '/keɪt/ with diphthong', '/kɑːt/ with long back "a"'],
              answerIdx: 0,
              explanation: 'Well done! "Cat" is pronounced with the standard short vowel /æ/.'
            },
            {
              prompt: 'In connected speech, what happens to the vowel in unstressed syllables?',
              choices: ['It often reduces to the schwa /ə/', 'It becomes louder and longer', 'It is completely silent'],
              answerIdx: 0,
              explanation: 'Outstanding! The neutral schwa /ə/ is the most frequent sound in natural English.'
            }
          ]
        };
      } else {
        this.quizPayload = {
          lang: 'vi',
          node: {
            id: 'vi_s1_easy',
            stage: 1,
            stageName: 'MỐC CHỦ ĐỀ 1: THANH ĐIỆU & CƠ BẢN',
            title: 'Hệ Thống 6 Thanh Điệu Tiếng Việt',
            desc: 'Phân biệt chính xác thanh Ngang, Huyền, Sắc, Hỏi, Ngã, Nặng.',
            icon: 'fa-solid fa-volume-high',
            difficulty: 'easy',
            xpReward: 5,
            heartPenalty: 1,
            status: 'available'
          },
          trials: [
            {
              prompt: 'Từ nào sau đây mang dấu ngã và được phát âm có độ lượn giọng đặc trưng?',
              choices: ['Mãnh liệt', 'Mạnh mẽ', 'Mảnh khảnh'],
              answerIdx: 0,
              explanation: 'Chính xác! "Mãnh" mang thanh Ngã, tạo ngữ điệu gãy âm và lượn giọng vút lên.'
            },
            {
              prompt: 'Thanh Ngang trong tiếng Việt có đặc điểm cao độ như thế nào?',
              choices: ['Cao độ trung bình, bằng phẳng và kéo dài tự nhiên', 'Rơi mạnh xuống đáy giọng', 'Ngắt đột ngột ở cuối âm'],
              answerIdx: 0,
              explanation: 'Rất chuẩn! Thanh Ngang (thanh không dấu) duy trì âm vực ổn định, mượt mà.'
            },
            {
              prompt: 'Cặp từ "Bình" và "Bính" lần lượt mang thanh điệu nào?',
              choices: ['Thanh Huyền và thanh Sắc', 'Thanh Ngang và thanh Hỏi', 'Thanh Nặng và thanh Ngã'],
              answerIdx: 0,
              explanation: 'Tuyệt vời! "Bình" mang thanh Huyền (trầm) và "Bính" mang thanh Sắc (bổng).'
            }
          ]
        };
      }
    }
  }

  private bindEvents(): void {
    // Nút rời khỏi góc trái
    this.btnExitQuiz.addEventListener('click', () => {
      this.modalConfirmExit.classList.add('active');
    });

    // Modal Exit Actions
    this.btnCancelExit.addEventListener('click', () => {
      this.modalConfirmExit.classList.remove('active');
    });

    this.btnConfirmExit.addEventListener('click', () => {
      this.returnToRoadmap();
    });

    // Nút hành động chính: Kiểm tra / Tiếp theo / Hoàn thành
    this.btnQuizAction.addEventListener('click', () => {
      this.handleQuizAction();
    });

    // Modal Victory Return
    this.btnVictoryReturn.addEventListener('click', () => {
      this.returnToRoadmap();
    });

    // Phím tắt bàn phím: 1, 2, 3 tương ứng A, B, C; Enter để Kiểm tra / Tiếp theo
    window.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === '1' || e.key === 'a' || e.key === 'A') {
        this.selectChoiceByIndex(0);
      } else if (e.key === '2' || e.key === 'b' || e.key === 'B') {
        this.selectChoiceByIndex(1);
      } else if (e.key === '3' || e.key === 'c' || e.key === 'C') {
        this.selectChoiceByIndex(2);
      } else if (e.key === '4' || e.key === 'd' || e.key === 'D') {
        this.selectChoiceByIndex(3);
      } else if (e.key === 'Enter') {
        if (!this.btnQuizAction.disabled) {
          this.btnQuizAction.click();
        }
      }
    });
  }

  private renderHeaderStats(): void {
    this.headerStreakVal.textContent = `${this.currentStreak} Ngày`;
    this.headerXPVal.textContent = `${this.totalXP.toLocaleString()} XP`;
    this.headerHeartsVal.textContent = `${this.currentHearts}/${this.maxHearts}`;
    if (this.currentHearts <= 1) {
      this.headerHeartsVal.parentElement?.classList.add('danger');
    }
  }

  private renderStageHero(): void {
    const node = this.quizPayload.node;

    // Header Breadcrumbs
    this.headerStageCrumb.textContent = `MỐC CHỦ ĐỀ ${node.stage}`;
    this.headerNodeTitle.textContent = node.title;

    // Stage Hero Banner
    this.stageHeroIcon.className = node.icon || 'fa-solid fa-shield-halved';
    this.stageHeroTier.textContent = node.stageName || `MỐC CHỦ ĐỀ ${node.stage}`;
    this.stageHeroTitle.textContent = node.title;

    // Status Badge
    if (node.status === 'mastered') {
      this.stageHeroStatus.innerHTML = '<i class="fa-solid fa-star"></i> Đã hoàn thành 🌟';
      this.stageHeroStatus.className = 'stage-status-badge';
      this.stageHeroStatus.style.background = 'rgba(34, 197, 94, 0.2)';
      this.stageHeroStatus.style.borderColor = 'rgba(34, 197, 94, 0.5)';
      this.stageHeroStatus.style.color = '#86EFAC';
    } else {
      this.stageHeroStatus.innerHTML = '<i class="fa-solid fa-shield-halved"></i> Sẵn sàng khiêu chiến ⚔️';
    }

    // Difficulty Stakes Ribbon
    let diffName = 'Dễ';
    let diffColor = '#34D399';
    if (node.difficulty === 'normal') {
      diffName = 'Bình thường';
      diffColor = '#FBBF24';
    } else if (node.difficulty === 'hard') {
      diffName = 'Khó';
      diffColor = '#F87171';
    }

    this.stageHeroDifficulty.textContent = `Độ khó: ${diffName}`;
    this.stageHeroDifficulty.style.color = diffColor;

    this.stageHeroXP.textContent = `+${node.xpReward} XP nếu đúng toàn bộ`;
    this.stageHeroPenalty.textContent = `-${node.heartPenalty} Máu khi hoàn thành nếu sai`;
  }

  private renderCurrentQuestion(): void {
    const totalQ = this.quizPayload.trials.length;
    const currentQ = this.quizPayload.trials[this.currentQuestionIdx];
    this.selectedChoiceIdx = null;
    this.currentTrialPhase = 'idle';

    // Step Counter & Progress bar
    this.stepCounterBadge.textContent = `Câu ${this.currentQuestionIdx + 1}/${totalQ}`;
    const progressPercent = ((this.currentQuestionIdx + 1) / totalQ) * 100;
    this.arenaProgressFill.style.width = `${progressPercent}%`;

    // Question Prompt
    this.arenaQuestionPrompt.textContent = currentQ.prompt;

    // Render Choices
    this.arenaChoicesGrid.innerHTML = '';
    const letters = ['A', 'B', 'C', 'D', 'E'];

    currentQ.choices.forEach((choiceText, idx) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'dungeon-choice-btn';
      btn.dataset.index = idx.toString();
      btn.innerHTML = `
        <span class="choice-num">${letters[idx] || (idx + 1)}</span>
        <span class="choice-text">${choiceText}</span>
      `;

      btn.addEventListener('click', () => {
        if (this.currentTrialPhase === 'idle') {
          this.selectChoiceByIndex(idx);
        }
      });

      this.arenaChoicesGrid.appendChild(btn);
    });

    // Hide result banner
    this.arenaResultBanner.className = 'arena-result-banner';
    this.arenaResultBanner.style.display = 'none';

    // Reset action button
    this.btnQuizAction.className = 'btn-quiz-action';
    this.btnQuizAction.disabled = true;
    this.btnQuizAction.innerHTML = '<i class="fa-solid fa-magnifying-glass"></i> Kiểm tra';
  }

  private selectChoiceByIndex(idx: number): void {
    if (this.currentTrialPhase !== 'idle') return;
    const allBtns = this.arenaChoicesGrid.querySelectorAll<HTMLButtonElement>('.dungeon-choice-btn');
    if (!allBtns || !allBtns[idx]) return;

    this.selectedChoiceIdx = idx;

    allBtns.forEach((btn, i) => {
      if (i === idx) {
        btn.classList.add('selected');
      } else {
        btn.classList.remove('selected');
      }
    });

    // Kích hoạt nút Kiểm tra
    this.btnQuizAction.disabled = false;
  }

  private handleQuizAction(): void {
    const totalQ = this.quizPayload.trials.length;
    const currentQ = this.quizPayload.trials[this.currentQuestionIdx];
    const isLastQ = (this.currentQuestionIdx === totalQ - 1);

    // ================= PHA 1: NGƯỜI DÙNG BẤM "KIỂM TRA" =================
    if (this.currentTrialPhase === 'idle') {
      if (this.selectedChoiceIdx === null) {
        this.showToast('Vui lòng chọn một đáp án trước khi bấm Kiểm tra!');
        return;
      }

      this.currentTrialPhase = 'checked';
      const isCorrect = (this.selectedChoiceIdx === currentQ.answerIdx);

      // Khóa tương tác của danh sách đáp án
      const allBtns = this.arenaChoicesGrid.querySelectorAll<HTMLButtonElement>('.dungeon-choice-btn');
      allBtns.forEach(btn => btn.style.pointerEvents = 'none');

      this.arenaResultBanner.style.display = 'flex';

      if (isCorrect) {
        // Nổi bật đáp án đúng
        if (allBtns[this.selectedChoiceIdx]) {
          allBtns[this.selectedChoiceIdx].classList.add('choice-correct');
        }

        this.arenaResultBanner.className = 'arena-result-banner success';
        this.resultBannerIcon.innerHTML = '<i class="fa-solid fa-circle-check"></i>';
        this.resultBannerHeading.textContent = 'CHÍNH XÁC!';
        this.resultBannerDesc.textContent = currentQ.explanation || 'Rất xuất sắc! Bấm nút bên dưới để tiếp tục.';
      } else {
        this.currentTrialWrongCount++;

        // Nổi bật đáp án sai (đỏ) và đáp án đúng (xanh)
        if (allBtns[this.selectedChoiceIdx]) {
          allBtns[this.selectedChoiceIdx].classList.add('choice-wrong');
        }
        if (allBtns[currentQ.answerIdx]) {
          allBtns[currentQ.answerIdx].classList.add('choice-correct');
        }

        // Quy tắc: MÁU CHỈ TRỪ KHI HOÀN THÀNH BỘ CÂU HỎI THEO MỨC ĐỘ, KHÔNG TRỪ TỪNG CÂU
        this.arenaResultBanner.className = 'arena-result-banner error';
        this.resultBannerIcon.innerHTML = '<i class="fa-solid fa-circle-xmark"></i>';
        this.resultBannerHeading.textContent = 'CHƯA CHÍNH XÁC!';
        this.resultBannerDesc.innerHTML = `
          Đáp án đúng là: <strong>${currentQ.choices[currentQ.answerIdx]}</strong>.<br>
          ${currentQ.explanation || 'Hãy ghi nhớ lý giải này để vận dụng vào các câu tiếp theo!'}
        `;
      }

      // Đổi trạng thái nút bấm: Nếu câu cuối cùng -> "Hoàn thành", nếu chưa cuối -> "Tiếp theo"
      this.btnQuizAction.disabled = false;
      if (isLastQ) {
        this.btnQuizAction.className = 'btn-quiz-action complete-phase';
        this.btnQuizAction.innerHTML = '<i class="fa-solid fa-circle-check"></i> Hoàn thành';
      } else {
        this.btnQuizAction.className = 'btn-quiz-action next-phase';
        this.btnQuizAction.innerHTML = '<i class="fa-solid fa-arrow-right"></i> Tiếp theo';
      }
      return;
    }

    // ================= PHA 2: NGƯỜI DÙNG BẤM "TIẾP THEO" HOẶC "HOÀN THÀNH" =================
    if (this.currentTrialPhase === 'checked') {
      if (!isLastQ) {
        this.currentQuestionIdx++;
        this.renderCurrentQuestion();
      } else {
        this.handleQuizCompletion();
      }
    }
  }

  private handleQuizCompletion(): void {
    const totalQ = this.quizPayload.trials.length;
    const node = this.quizPayload.node;
    const correctCount = totalQ - this.currentTrialWrongCount;

    if (this.currentTrialWrongCount === 0) {
      // ================= ĐÚNG TOÀN BỘ 100% CÁC CÂU HỎI =================
      // EXP CHỈ CỘNG KHI NGƯỜI DÙNG ĐÚNG TOÀN BỘ PHẦN CÁC CÂU HỎI
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

      // Tiêu thụ vật phẩm boost trong túi đồ nếu có
      if (activeExpBoost) {
        const rawInv = localStorage.getItem('slanguage_user_inventory');
        if (rawInv) {
          try {
            const inv = JSON.parse(rawInv);
            inv.xpBoostCount = 0;
            inv.doubleXPCount = 0;
            localStorage.setItem('slanguage_user_inventory', JSON.stringify(inv));
          } catch (e) {}
        }
      }

      this.totalXP += awardedXP;
      localStorage.setItem('slanguage_user_xp', this.totalXP.toString());

      // Cập nhật chuỗi Streak theo ngày học thực tế
      let currentStreak = parseInt(localStorage.getItem('slanguage_user_streak') || '18', 10);
      if (isNaN(currentStreak)) currentStreak = 18;
      const todayStr = new Date().toISOString().split('T')[0];
      const lastStudy = localStorage.getItem('slanguage_last_study_date');
      if (lastStudy !== todayStr) {
        currentStreak += 1;
        localStorage.setItem('slanguage_last_study_date', todayStr);
        localStorage.setItem('slanguage_user_streak', currentStreak.toString());
        this.currentStreak = currentStreak;
      }

      // Cập nhật Cấp cao nhất nếu đạt kỷ lục mới
      const currentLvl = Math.max(1, Math.floor(this.totalXP / 180) + 1);
      const savedHighest = localStorage.getItem('slanguage_user_highest_level');
      const highestLvl = savedHighest !== null ? Math.max(14, parseInt(savedHighest, 10)) : 14;
      if (currentLvl > highestLvl) {
        localStorage.setItem('slanguage_user_highest_level', currentLvl.toString());
      }

      // Lưu ải mastered vào localStorage
      this.markNodeMastered(node.id);

      // Lưu vào danh sách lịch sử bài học cho trang Hồ sơ cá nhân
      this.recordLessonHistory(node.title, this.currentLang, awardedXP, totalQ, totalQ);

      // Cập nhật tổng thời gian học (+15 phút)
      let totalMins = parseInt(localStorage.getItem('slanguage_total_study_minutes') || '2910', 10);
      if (isNaN(totalMins)) totalMins = 2910;
      totalMins += 15;
      localStorage.setItem('slanguage_total_study_minutes', totalMins.toString());

      this.renderHeaderStats();
      window.dispatchEvent(new Event('storage'));
      window.dispatchEvent(new CustomEvent('slanguage_data_changed'));

      // Hiển thị Victory Modal
      this.victoryModalTitle.textContent = 'Xuất Sắc! Chinh Phục Ải Thành Công! 🌟';
      this.victoryModalDesc.innerHTML = `
        Bạn đã trả lời chính xác trọn vẹn <strong>${totalQ}/${totalQ} câu hỏi</strong>.<br>
        Nhận thưởng: <strong style="color: #38bdf8;">+${awardedXP} XP</strong>${boostNote}.<br>
        Các thử thách và bài học tiếp theo trên lộ trình đã được mở khóa!
      `;
      this.modalVictory.classList.add('active');
    } else {
      // ================= CÓ CÂU TRẢ LỜI SAI =================
      // 1. Máu chỉ trừ khi người dùng đã hoàn thành bộ câu hỏi theo mức độ
      const penalty = node.heartPenalty;
      this.currentHearts = Math.max(0, this.currentHearts - penalty);
      localStorage.setItem('slanguage_user_hearts', this.currentHearts.toString());
      this.renderHeaderStats();
      window.dispatchEvent(new Event('storage'));
      window.dispatchEvent(new CustomEvent('slanguage_data_changed'));

      // 2. Không cộng EXP vì không đúng toàn bộ câu hỏi
      if (this.currentHearts === 0) {
        this.promptReviveModal(correctCount, totalQ, penalty);
      } else {
        this.showToast(`Bạn hoàn thành với ${correctCount}/${totalQ} câu đúng. Vì có câu trả lời sai nên bị trừ -${penalty} Máu (còn ${this.currentHearts}/${this.maxHearts}) và không nhận được EXP. Cần đạt 100% để vượt qua!`);
        setTimeout(() => {
          this.returnToRoadmap();
        }, 3200);
      }
    }
  }

  private markNodeMastered(nodeId: string): void {
    const key = `slanguage_dungeon_mastered_${this.currentLang}`;
    const raw = localStorage.getItem(key);
    let masteredIds: string[] = [];
    if (raw) {
      try {
        masteredIds = JSON.parse(raw);
      } catch (e) {
        masteredIds = [];
      }
    }
    if (!masteredIds.includes(nodeId)) {
      masteredIds.push(nodeId);
      localStorage.setItem(key, JSON.stringify(masteredIds));
    }
  }

  private recordLessonHistory(title: string, lang: string, xpEarned: number, correctCount: number, totalQ: number): void {
    try {
      const raw = localStorage.getItem('slanguage_recent_lessons');
      let history: any[] = [];
      if (raw) {
        history = JSON.parse(raw);
        if (!Array.isArray(history)) history = [];
      }
      const newEntry = {
        title: title || 'Thử thách bài học',
        lang: lang || this.currentLang || 'ja',
        timestamp: new Date().toISOString(),
        score: `${Math.round((correctCount / totalQ) * 100)}/100`,
        status: correctCount === totalQ ? 'Xuất sắc' : 'Đạt',
        xpEarned: xpEarned
      };
      history.unshift(newEntry);
      if (history.length > 20) history = history.slice(0, 20);
      localStorage.setItem('slanguage_recent_lessons', JSON.stringify(history));
    } catch (e) {}
  }

  private promptReviveModal(correctCount: number, totalQ: number, penalty: number): void {
    const rawInv = localStorage.getItem('slanguage_user_inventory');
    let inv: any = {};
    let healPotions = 0;
    if (rawInv) {
      try {
        inv = JSON.parse(rawInv);
        healPotions = inv.healPotionsCount ?? 0;
      } catch (e) {
        inv = {};
      }
    }

    if (healPotions > 0) {
      this.reviveModalBody.innerHTML = `
        <div class="modal-icon-badge potion">
          <img src="../assets/potion_red.png" alt="Dược Phẩm Hồi Phục">
        </div>
        <h3 class="quiz-modal-title">Bạn Đã Cạn Kiệt Máu! 💔</h3>
        <p class="quiz-modal-desc">
          Kết quả: <strong>${correctCount}/${totalQ} câu đúng</strong>. Bị trừ <strong>-${penalty} Máu</strong> (còn 0/5 Máu).<br>
          Trong tủ đồ của bạn hiện có <strong>${healPotions} Dược Phẩm Hồi Phục</strong> 🧪.<br>
          Bạn có muốn dùng ngay 1 bình để hồi sinh <strong>5/5 Máu</strong> và tiếp tục thử thách không?
        </p>
        <div class="quiz-modal-footer">
          <button type="button" class="btn-modal-cancel" id="btnReviveCancel">
            <i class="fa-solid fa-arrow-left"></i> Rời Khỏi
          </button>
          <button type="button" class="btn-modal-confirm" id="btnReviveConfirm">
            <i class="fa-solid fa-heart-pulse"></i> Sử Dụng (Còn ${healPotions - 1} bình)
          </button>
        </div>
      `;

      const btnCancel = document.getElementById('btnReviveCancel');
      const btnConfirm = document.getElementById('btnReviveConfirm');

      if (btnCancel) {
        btnCancel.onclick = () => {
          this.modalRevive.classList.remove('active');
          this.returnToRoadmap();
        };
      }

      if (btnConfirm) {
        btnConfirm.onclick = () => {
          inv.healPotionsCount = Math.max(0, healPotions - 1);
          localStorage.setItem('slanguage_user_inventory', JSON.stringify(inv));
          this.currentHearts = this.maxHearts;
          localStorage.setItem('slanguage_user_hearts', this.currentHearts.toString());
          this.renderHeaderStats();
          this.modalRevive.classList.remove('active');
          this.showToast('❤️ Đã sử dụng Dược Phẩm Hồi Phục! Máu đã hồi đầy bình (5/5). Đang tải lại thử thách...');
          setTimeout(() => {
            window.location.reload();
          }, 1500);
        };
      }
    } else {
      this.reviveModalBody.innerHTML = `
        <div class="modal-icon-badge potion">
          <i class="fa-solid fa-heart-crack" style="color: #EF4444;"></i>
        </div>
        <h3 class="quiz-modal-title">Bạn Đã Cạn Kiệt Máu! 💔</h3>
        <p class="quiz-modal-desc">
          Kết quả: <strong>${correctCount}/${totalQ} câu đúng</strong>. Bị trừ <strong>-${penalty} Máu</strong> (còn 0/5 Máu).<br>
          Trong tủ đồ của bạn hiện không còn <strong>Dược Phẩm Hồi Phục</strong> nào.<br>
          Hãy ghé Cửa Hàng (Shop) để quy đổi EXP lấy Dược Phẩm Hồi Phục nhé!
        </p>
        <div class="quiz-modal-footer">
          <button type="button" class="btn-modal-cancel" id="btnReviveCancel">
            <i class="fa-solid fa-arrow-left"></i> Trở Về Lộ Trình
          </button>
          <a href="../shop/index.html" class="btn-modal-shop">
            <i class="fa-solid fa-store"></i> Đến Cửa Hàng (Shop)
          </a>
        </div>
      `;

      const btnCancel = document.getElementById('btnReviveCancel');
      if (btnCancel) {
        btnCancel.onclick = () => {
          this.modalRevive.classList.remove('active');
          this.returnToRoadmap();
        };
      }
    }

    this.modalRevive.classList.add('active');
  }

  private returnToRoadmap(): void {
    window.location.href = '../roadmap/index.html';
  }

  private showToast(msg: string): void {
    this.quizToastText.textContent = msg;
    this.quizToast.classList.add('active');
    setTimeout(() => {
      this.quizToast.classList.remove('active');
    }, 3500);
  }
}

// Khởi chạy ứng dụng tức thì và an toàn
function initSlanguageQuizApp(): void {
  if (!(window as any).quizApp) {
    try {
      (window as any).quizApp = new SlanguageQuizApp();
    } catch (e) {
      console.error('Lỗi khi khởi chạy SlanguageQuizApp:', e);
    }
  }
}

(window as any).initSlanguageQuizApp = initSlanguageQuizApp;

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initSlanguageQuizApp);
} else {
  initSlanguageQuizApp();
}
