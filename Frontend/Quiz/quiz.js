/**
 * Slanguage - Assessment Practice Quiz Engine (home.js)
 * Tương tác chuẩn xác theo UI Khung Làm Bài Trắc Nghiệm mới nhất:
 * - Đồng bộ đồng hồ đếm ngược thời gian thực (12 : 42)
 * - Quản lý thanh tiến độ, bộ đếm CÂU HỎI 04 / 10
 * - Chọn 1 đáp án duy nhất (A, B, C, D) với phản hồi trực quan
 * - Tự động khóa các đáp án còn lại (hiển thị icon ổ khóa 🔒) sau khi kiểm tra
 * - Phát âm giọng bản xứ Tokyo native qua Web Speech API (nút Nghe mẫu, Nghe ví dụ)
 * - Tạm dừng bài làm, nộp bài, báo cáo câu hỏi và chuyển câu tiếp theo
 * - Phím tắt điều hướng nhanh (1-4, A-D, Ctrl+Space phát âm, Enter chuyển câu)
 */

"use strict";

class SlanguageQuizEngine {
  constructor() {
    // Trạng thái bài thi hiện tại theo giao diện UI
    this.currentQuestionIndex = 3; // Index 3 tương ứng Câu 04
    this.totalQuestions = 10;
    this.selectedOption = 'A';
    this.isChecked = true; // Trạng thái đã kiểm tra đáp án A
    this.timeRemainingSeconds = 762; // 12 phút 42 giây (12 * 60 + 42)
    this.timerInterval = null;
    this.currentXP = 15;
    this.hearts = 3;

    // Dữ liệu câu hỏi chi tiết từ giao diện UI
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
        antonym: '不味い (Mazui) (dở, khó ăn)'
      }
    };

    this.init();
  }

  /**
   * Khởi tạo các sự kiện DOM và bộ đếm thời gian
   */
  init() {
    this.bindDOMEvents();
    this.startTimer();
    this.updateProgress();

    // Khóa các phương án nếu câu hỏi đang ở trạng thái đã kiểm tra (isChecked = true)
    if (this.isChecked) {
      this.lockAnswersAfterCheck();
    }
  }

  /**
   * Bộ đếm ngược thời gian làm bài từng giây
   */
  startTimer() {
    this.updateTimerDisplay();
    this.timerInterval = window.setInterval(() => {
      if (this.timeRemainingSeconds > 0) {
        this.timeRemainingSeconds--;
        this.updateTimerDisplay();
      } else {
        this.stopTimer();
        alert('Hết giờ làm bài! Hệ thống đang tự động tổng hợp kết quả và nộp bài.');
      }
    }, 1000);
  }

  /**
   * Dừng bộ đếm thời gian
   */
  stopTimer() {
    if (this.timerInterval !== null) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  /**
   * Cập nhật giao diện đồng hồ đếm ngược (định dạng MM : SS)
   */
  updateTimerDisplay() {
    const timerEl = document.getElementById('quizTimerText');
    if (!timerEl) return;
    const minutes = Math.floor(this.timeRemainingSeconds / 60);
    const seconds = this.timeRemainingSeconds % 60;
    const formattedMinutes = minutes.toString().padStart(2, '0');
    const formattedSeconds = seconds.toString().padStart(2, '0');
    timerEl.textContent = `${formattedMinutes} : ${formattedSeconds}`;
  }

  /**
   * Cập nhật thanh tiến độ trực quan và nhãn CÂU HỎI 04 / 10
   */
  updateProgress() {
    const progressBar = document.getElementById('quizProgressBar');
    const counterLabel = document.getElementById('questionCounterLabel');
    const percent = (this.currentQuestion.id / this.totalQuestions) * 100;

    if (progressBar) {
      progressBar.style.width = `${percent}%`;
    }
    if (counterLabel) {
      const qNum = this.currentQuestion.id.toString().padStart(2, '0');
      const totalNum = this.totalQuestions.toString().padStart(2, '0');
      counterLabel.innerHTML = `<i class="fa-regular fa-square-check text-[#0891B2]"></i> CÂU HỎI ${qNum} / ${totalNum}`;
    }
  }

  /**
   * Gắn các bộ lắng nghe sự kiện trên giao diện
   */
  bindDOMEvents() {
    // 1. Nút chuyển câu hỏi tiếp theo
    const btnNext = document.getElementById('btnNextQuestion');
    if (btnNext) {
      btnNext.addEventListener('click', () => {
        this.handleNextQuestion();
      });
    }

    // 2. Nút phát âm mẫu chuẩn Tokyo native
    const btnAudio = document.getElementById('btnPlayNativeAudio');
    if (btnAudio) {
      btnAudio.addEventListener('click', () => {
        this.speakText(this.currentQuestion.targetWord, 'ja-JP');
      });
    }

    // 3. Nút nghe câu thoại ví dụ ở phần giải thích
    const btnExplanationAudio = document.getElementById('btnListenExplanation');
    if (btnExplanationAudio) {
      btnExplanationAudio.addEventListener('click', () => {
        this.speakText('このラーメンはとても美味しいですね！', 'ja-JP');
      });
    }

    // 4. Nút tạm dừng / thoát giữa chừng
    const btnPause = document.getElementById('btnPauseExit');
    if (btnPause) {
      btnPause.addEventListener('click', () => {
        const confirmExit = confirm('Bạn có chắc chắn muốn tạm dừng bài làm? Tiến độ và thời gian còn lại sẽ được lưu tự động vào tài khoản.');
        if (confirmExit) {
          this.stopTimer();
          window.location.href = '../vocabulary/index.html';
        }
      });
    }

    // 5. Nút báo cáo câu hỏi
    const btnReport = document.getElementById('btnReportQuestion');
    if (btnReport) {
      btnReport.addEventListener('click', () => {
        alert('Cảm ơn bạn! Đóng góp về câu hỏi số 04 đã được gửi tới hội đồng học thuật Slanguage để kiểm duyệt.');
      });
    }

    // 6. Sự kiện click chọn thẻ đáp án A, B, C, D
    const optionCards = document.querySelectorAll('.quiz-option-card');
    optionCards.forEach(card => {
      card.addEventListener('click', (e) => {
        if (this.isChecked) return; // Nếu đã kiểm tra thì không cho phép đổi lựa chọn
        const optKey = card.getAttribute('data-option');
        if (optKey) {
          this.selectOption(optKey);
        }
      });
    });

    // 7. Hỗ trợ phím tắt điều hướng nhanh (1-4 hoặc A-D, Ctrl+Space để phát âm, Enter để sang câu tiếp)
    window.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (!this.isChecked) {
        const keyMap = { '1': 'A', '2': 'B', '3': 'C', '4': 'D', 'a': 'A', 'b': 'B', 'c': 'C', 'd': 'D' };
        const key = e.key.toLowerCase();
        if (keyMap[key]) {
          this.selectOption(keyMap[key]);
        }
      }

      if (e.key === ' ' && e.ctrlKey) {
        e.preventDefault();
        this.speakText(this.currentQuestion.targetWord, 'ja-JP');
      }

      if (e.key === 'Enter' && this.isChecked) {
        e.preventDefault();
        this.handleNextQuestion();
      }
    });
  }

  /**
   * Chọn 1 phương án trắc nghiệm duy nhất
   * @param {string} optKey - 'A' | 'B' | 'C' | 'D'
   */
  selectOption(optKey) {
    this.selectedOption = optKey;
    const optionCards = document.querySelectorAll('.quiz-option-card');
    optionCards.forEach(card => {
      const isSelected = card.getAttribute('data-option') === optKey;
      card.classList.toggle('selected', isSelected);
      if (isSelected) {
        card.classList.add('border-[#0891B2]', 'bg-cyan-50/60');
      } else {
        card.classList.remove('border-[#0891B2]', 'bg-cyan-50/60');
      }
    });
  }

  /**
   * Khóa tất cả các phương án còn lại sau khi người học kiểm tra đáp án
   * Giữ trạng thái đáp án chọn (A) và thêm biểu tượng ổ khóa 🔒 vào các đáp án B, C, D
   */
  lockAnswersAfterCheck() {
    this.isChecked = true;
    const optionCards = document.querySelectorAll('.quiz-option-card');

    optionCards.forEach(card => {
      const optKey = card.getAttribute('data-option');
      if (optKey !== this.selectedOption) {
        // Khóa các phương án không được chọn
        card.classList.add('locked');
        card.setAttribute('disabled', 'true');
        const iconSpan = card.querySelector('.status-icon');
        if (iconSpan) {
          iconSpan.innerHTML = '<i class="fa-solid fa-lock text-slate-400 text-sm"></i>';
        }
      } else {
        // Phương án đã chọn
        card.classList.add('selected');
        const iconSpan = card.querySelector('.status-icon');
        if (iconSpan) {
          iconSpan.innerHTML = '<i class="fa-solid fa-check text-[#0891B2] text-lg font-bold"></i>';
        }
      }
    });
  }

  /**
   * Chuyển sang câu hỏi tiếp theo
   */
  handleNextQuestion() {
    alert('Đang tải Câu hỏi 05 / 10...');
    // Trong môi trường thực tế, đoạn này sẽ nạp câu hỏi 5 từ API hoặc mảng câu hỏi
  }

  /**
   * Phát âm giọng bản xứ bằng Web Speech API
   * @param {string} text - Văn bản cần đọc
   * @param {string} lang - Mã ngôn ngữ (mặc định 'ja-JP')
   */
  speakText(text, lang = 'ja-JP') {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel(); // Ngắt âm đang phát dở nếu có
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = lang;
      utterance.rate = 0.88; // Tốc độ tự nhiên cho người học
      utterance.pitch = 1.0;
      window.speechSynthesis.speak(utterance);
    } else {
      alert(`Phát âm [${lang}]: ${text}`);
    }
  }
}

// Khởi chạy engine khi DOM đã sẵn sàng
document.addEventListener('DOMContentLoaded', () => {
  window.slanguageQuiz = new SlanguageQuizEngine();
});