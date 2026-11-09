/**
 * slanguage-quiz.ts
 * Trang Làm bài trắc nghiệm.
 *
 * Backend hiện không có endpoint quiz cho người học, nên trang dùng bộ câu hỏi
 * luyện tập có sẵn trong ứng dụng (nội dung học, không phải số liệu thành tích).
 * Không gọi endpoint giả và không tuyên bố kết quả được máy chủ chấm.
 */

import { showSuccessToast } from "../../../types/shared/toast";
import { renderHeader } from "../../../types/shared/header";
import {
  initPageReveal,
  initCardStagger,
  animateButtonPress,
} from "../../../types/shared/gsap-animations";
import { isLearnerAuthenticated } from "../../../types/shared/api-client";

renderHeader({ containerId: "sl-header", activePage: "quiz" });

interface PracticeQuestion {
  id: string;
  question: string;
  options: string[];
  correctIndex: number;
  explanation?: string;
}

const authGuard = document.getElementById("sl-auth-guard");
const quizContent = document.getElementById("sl-quiz-content");

if (!isLearnerAuthenticated()) {
  if (authGuard) authGuard.style.display = "block";
  if (quizContent) quizContent.style.display = "none";
} else {
  if (authGuard) authGuard.style.display = "none";
  if (quizContent) quizContent.style.display = "block";

  const loadingEl = document.getElementById("sl-quiz-loading");
  const questionArea = document.getElementById("sl-quiz-question-area");
  const questionEl = document.getElementById("sl-quiz-question");
  const optionsEl = document.getElementById("sl-quiz-options");
  const prevBtn = document.getElementById("sl-quiz-prev") as HTMLButtonElement | null;
  const nextBtn = document.getElementById("sl-quiz-next") as HTMLButtonElement | null;
  const feedbackEl = document.getElementById("sl-quiz-feedback");
  const feedbackIcon = document.getElementById("sl-feedback-icon");
  const feedbackTitle = document.getElementById("sl-feedback-title");
  const feedbackMessage = document.getElementById("sl-feedback-message");
  const progressText = document.getElementById("sl-quiz-progress-text");
  const progressFill = document.getElementById("sl-quiz-progress-fill");
  const resultEl = document.getElementById("sl-quiz-result");
  const retakeBtn = document.getElementById("sl-quiz-retake");

  let questions: PracticeQuestion[] = [];
  let currentIndex = 0;
  let score = 0;
  let answered = false;
  let userAnswers: number[] = [];

  // Bộ câu hỏi luyện tập cố định của ứng dụng.
  const PRACTICE_QUESTIONS: PracticeQuestion[] = [
    {
      id: "1",
      question: "Từ nào sau đây mang nghĩa 'sự kiên trì, bền bỉ' trong tiếng Anh?",
      options: ["Perseverance", "Hesitation", "Reluctance", "Indifference"],
      correctIndex: 0,
      explanation:
        "'Perseverance' có nghĩa là sự kiên trì, bền bỉ vượt qua khó khăn để đạt mục tiêu.",
    },
    {
      id: "2",
      question: "Chọn dạng đúng của động từ: 'She ___ English with AI every morning.'",
      options: ["practice", "practices", "practicing", "practiced"],
      correctIndex: 1,
      explanation:
        "Chủ ngữ ngôi thứ 3 số ít 'She' ở thì hiện tại đơn đi với động từ thêm 's/es' -> 'practices'.",
    },
    {
      id: "3",
      question:
        "Thành ngữ 'Practice makes perfect' có nghĩa tương đương với câu nào sau đây?",
      options: [
        "Học thầy không tày học bạn",
        "Có công mài sắt, có ngày nên kim",
        "Đi một ngày đàng học một sàng khôn",
        "Thuốc đắng dã tật",
      ],
      correctIndex: 1,
      explanation:
        "'Practice makes perfect' nghĩa là luyện tập thường xuyên sẽ mang lại sự thành thạo.",
    },
    {
      id: "4",
      question: "Từ trái nghĩa với 'Fluency' (sự trôi chảy, lưu loát) là gì?",
      options: ["Hesitation", "Eloquence", "Accuracy", "Mastery"],
      correctIndex: 0,
      explanation:
        "'Hesitation' (sự ngập ngừng, do dự) là từ trái nghĩa trực tiếp với 'Fluency'.",
    },
    {
      id: "5",
      question: "Trong tiếng Nhật, câu chào trang trọng vào buổi sáng là gì?",
      options: [
        "Konnichiwa",
        "Konbanwa",
        "Ohayou gozaimasu",
        "Sayounara",
      ],
      correctIndex: 2,
      explanation:
        "'Ohayou gozaimasu' (おはようございます) là lời chào buổi sáng trang trọng trong tiếng Nhật.",
    },
  ];

  function initializeQuiz(): void {
    questions = [...PRACTICE_QUESTIONS];
    if (loadingEl) loadingEl.style.display = "none";
    if (questionArea) questionArea.style.display = "block";
    renderQuiz();
  }

  function renderQuiz(): void {
    if (questions.length === 0) return;

    const q = questions[currentIndex];
    if (questionEl) questionEl.textContent = `${currentIndex + 1}. ${q.question}`;

    if (optionsEl) {
      optionsEl.innerHTML = q.options
        .map(
          (opt, i) => `
        <button class="sl-btn sl-btn-secondary sl-text-left p-4 hover:sl-shadow-sm transition-all"
                id="sl-opt-${i}"
                onclick="selectOption(${i})">
          <span class="sl-option-letter">${String.fromCharCode(65 + i)}.</span>
          ${opt}
        </button>
      `
        )
        .join("");
    }

    if (prevBtn) prevBtn.disabled = currentIndex === 0;
    if (nextBtn) {
      nextBtn.disabled = !answered;
      nextBtn.textContent =
        currentIndex === questions.length - 1 ? "Xem kết quả" : "Tiếp theo";
    }

    if (feedbackEl) feedbackEl.style.display = "none";
    answered = false;

    updateProgress();
  }

  function updateProgress(): void {
    const pct = questions.length
      ? Math.round(((currentIndex + 1) / questions.length) * 100)
      : 0;
    if (progressText) progressText.textContent = `Câu ${currentIndex + 1} / ${questions.length}`;
    if (progressFill) progressFill.style.width = `${pct}%`;
  }

  (window as unknown as {
    selectOption: (index: number) => void;
  }).selectOption = (index: number) => {
    if (answered) return;
    animateButtonPress(document.getElementById(`sl-opt-${index}`) as HTMLElement);

    const q = questions[currentIndex];
    answered = true;

    const isCorrect = index === q.correctIndex;
    if (isCorrect) score++;
    userAnswers[currentIndex] = index;

    const buttons = optionsEl?.querySelectorAll<HTMLButtonElement>("button") || [];
    buttons.forEach((btn, i) => {
      btn.disabled = true;
      if (i === q.correctIndex) {
        btn.classList.remove("sl-btn-secondary");
        btn.style.background = "#10b981";
        btn.style.color = "#ffffff";
      } else if (i === index && !isCorrect) {
        btn.classList.remove("sl-btn-secondary");
        btn.style.background = "#ef4444";
        btn.style.color = "#ffffff";
      }
    });

    if (feedbackEl) {
      feedbackEl.style.display = "block";
      if (feedbackIcon) feedbackIcon.textContent = isCorrect ? "✅" : "❌";
      if (feedbackTitle) feedbackTitle.textContent = isCorrect ? "Đúng rồi!" : "Sai rồi.";
      if (feedbackMessage) {
        feedbackMessage.textContent = isCorrect
          ? "Câu trả lời của bạn chính xác."
          : `Đáp án đúng là: ${q.options[q.correctIndex]}. ${q.explanation || ""}`.trim();
      }
    }

    if (nextBtn) nextBtn.disabled = false;
    updateProgress();
  };

  if (prevBtn) {
    prevBtn.addEventListener("click", () => {
      if (currentIndex > 0) {
        currentIndex--;
        answered = false;
        renderQuiz();
      }
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener("click", () => {
      if (currentIndex < questions.length - 1) {
        currentIndex++;
        renderQuiz();
      } else {
        showResultPage();
      }
    });
  }

  function showResultPage(): void {
    const pct = questions.length ? Math.round((score / questions.length) * 100) : 0;

    const resultData = {
      questions: questions.map((q, i) => ({
        question: q.question,
        options: q.options,
        correctIndex: q.correctIndex,
        userSelectedIndex: userAnswers[i] ?? null,
        explanation: q.explanation,
      })),
      score,
      total: questions.length,
      percent: pct,
    };
    sessionStorage.setItem("slanguage_quiz_result", JSON.stringify(resultData));
    showSuccessToast("Đã hoàn thành bài luyện tập.", 2200);
    window.location.assign("../quiz-result/index.html");
  }

  if (retakeBtn) {
    retakeBtn.addEventListener("click", () => {
      currentIndex = 0;
      score = 0;
      answered = false;
      userAnswers = [];
      if (resultEl) resultEl.style.display = "none";
      if (questionArea) questionArea.style.display = "block";
      renderQuiz();
    });
  }

  initializeQuiz();
  initPageReveal({ container: ".sl-page-reveal" });
  initCardStagger({ container: ".sl-page-reveal", item: ".sl-stagger-item" });
}
