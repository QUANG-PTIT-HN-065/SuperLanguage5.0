/**
 * slanguage-sentence.ts
 * Trang Ghép câu (R32).
 * - Yêu cầu đăng nhập
 * - Trò chơi kéo thả từ vựng để tạo thành câu
 * - Kiểm tra câu trả lời, hiển thị kết quả
 * - GSAP animations
 * - Không dùng mock data; câu mẫu cố định (không gọi API vì không có endpoint ghép câu dành cho learner)
 */

import { showErrorToast, showSuccessToast } from "../../../types/shared/toast";
import { renderHeader } from "../../../types/shared/header";
import { initPageReveal, initCardStagger, animateButtonPress } from "../../../types/shared/gsap-animations";
import { isLearnerAuthenticated } from "../../../types/shared/api-client";

renderHeader({ containerId: "sl-header", activePage: "sentence" });

const authGuard = document.getElementById("sl-auth-guard");
const sentenceContent = document.getElementById("sl-sentence-content");

if (!isLearnerAuthenticated()) {
  if (authGuard) authGuard.style.display = "block";
  if (sentenceContent) sentenceContent.style.display = "none";
} else {
  if (authGuard) authGuard.style.display = "none";
  if (sentenceContent) sentenceContent.style.display = "block";

  // ---- Data: câu mẫu (không gọi API vì không có endpoint ghép câu cho learner) ----
  const EXERCISES = [
    {
      target: "Chào mừng bạn đến với SuperLanguage.",
      words: ["Chào", "mừng", "bạn", "đến", "với", "SuperLanguage", "."],
    },
    {
      target: "Tôi đang học tiếng Anh mỗi ngày.",
      words: ["Tôi", "đang", "học", "tiếng", "Anh", "mỗi", "ngày", "."],
    },
    {
      target: "Bạn có thể nói tiếng Nhật không?",
      words: ["Bạn", "có", "thể", "nói", "tiếng", "Nhật", "không", "?"],
    },
    {
      target: "Hôm nay thời tiết rất đẹp.",
      words: ["Hôm", "nay", "thời", "tiết", "rất", "đẹp", "."],
    },
    {
      target: "Tôi thích học ngôn ngữ mới.",
      words: ["Tôi", "thích", "học", "ngôn", "ngữ", "mới", "."],
    },
  ];

  let currentExerciseIndex = 0;
  let currentWords: string[] = [];
  let targetWords: string[] = [];
  let placedWords: string[] = [];

  // ---- Elements ----
  const targetEl = document.getElementById("sl-sentence-target");
  const outputEl = document.getElementById("sl-sentence-output");
  const wordsGrid = document.getElementById("sl-sentence-words");
  const feedbackEl = document.getElementById("sl-sentence-feedback");
  const checkBtn = document.getElementById("sl-sentence-check") as HTMLButtonElement | null;
  const resetBtn = document.getElementById("sl-sentence-reset") as HTMLButtonElement | null;
  const nextBtn = document.getElementById("sl-sentence-next") as HTMLButtonElement | null;
  const resultEl = document.getElementById("sl-sentence-result");
  const resultIcon = document.getElementById("sl-sentence-result-icon");
  const resultTitle = document.getElementById("sl-sentence-result-title");
  const resultMsg = document.getElementById("sl-sentence-result-message");
  const resultFill = document.getElementById("sl-sentence-result-fill");
  const retakeBtn = document.getElementById("sl-sentence-retake") as HTMLButtonElement | null;

  // ---- Init ----
  function loadExercise() {
    const ex = EXERCISES[currentExerciseIndex];
    if (targetEl) targetEl.textContent = ex.target;
    targetWords = ex.target.split(" ");
    currentWords = [...ex.words].sort(() => Math.random() - 0.5);
    placedWords = [];
    if (outputEl) {
      outputEl.textContent = "";
      outputEl.style.color = "#94a3b8";
    }
    if (feedbackEl) feedbackEl.style.display = "none";
    if (checkBtn) checkBtn.disabled = false;
    if (resetBtn) resetBtn.disabled = false;
    if (nextBtn) {
      nextBtn.disabled = true;
      nextBtn.textContent = "Câu tiếp";
    }
    renderWords();
  }

  function renderWords() {
    if (!wordsGrid) return;
    wordsGrid.innerHTML = currentWords.map((w, i) => `
      <button class="sl-btn sl-btn-secondary p-3 text-left sl-stagger-item" 
              id="sl-word-${i}" 
              onclick="addWord(${i})"
              style="--stagger-index:${i}">
        ${w}
      </button>
    `).join("");
  }

  // Thêm từ vào câu
  (window as any).addWord = (index: number) => {
    const word = currentWords[index];
    if (!word || placedWords.includes(word)) return;
    placedWords.push(word);
    // Xóa từ đã chọn khỏi danh sách available
    currentWords = currentWords.filter((_, i) => i !== index);
    renderWords();
    updateOutput();
  };

  function updateOutput() {
    if (!outputEl) return;
    if (placedWords.length === 0) {
      outputEl.textContent = "(Kéo từ vào đây)";
      outputEl.style.color = "#94a3b8";
    } else {
      outputEl.textContent = placedWords.join(" ");
      outputEl.style.color = "#0f172a";
    }
  }

  // Xóa từ cuối cùng (kéo ra khỏi output)
  if (outputEl) {
    outputEl.addEventListener("click", () => {
      if (placedWords.length > 0) {
        const removed = placedWords.pop()!;
        currentWords.push(removed);
        renderWords();
        updateOutput();
      }
    });
  }

  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      animateButtonPress(resetBtn as HTMLElement);
      loadExercise();
    });
  }

  if (checkBtn) {
    checkBtn.addEventListener("click", () => {
      animateButtonPress(checkBtn as HTMLElement);
      const userSentence = placedWords.join(" ");
      const targetSentence = EXERCISES[currentExerciseIndex].target;
      const isCorrect = userSentence === targetSentence;

      if (feedbackEl) {
        feedbackEl.style.display = "block";
        feedbackEl.className = isCorrect ? "sl-badge sl-badge-success" : "sl-badge sl-badge-danger";
        feedbackEl.textContent = isCorrect ? "✅ Chính xác!" : "❌ Sai rồi. Hãy thử lại.";
      }

      if (checkBtn) checkBtn.disabled = true;
      if (nextBtn) nextBtn.disabled = !isCorrect;

      if (isCorrect) {
        showSuccessToast("Chính xác! Bạn đã ghép đúng câu (+10 XP).", 3000);
        const currentXp = parseInt(localStorage.getItem("slanguage_user_xp") || "0", 10);
        localStorage.setItem("slanguage_user_xp", String(currentXp + 10));
        const sentencesCount = parseInt(localStorage.getItem("slanguage_stat_sentences") || "0", 10);
        localStorage.setItem("slanguage_stat_sentences", String(sentencesCount + 1));
        localStorage.setItem("slanguage_studied_today", "true");
      }
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener("click", () => {
      animateButtonPress(nextBtn as HTMLElement);
      currentExerciseIndex = (currentExerciseIndex + 1) % EXERCISES.length;
      loadExercise();
    });
  }

  if (retakeBtn) {
    retakeBtn.addEventListener("click", () => {
      animateButtonPress(retakeBtn as HTMLElement);
      if (resultEl) resultEl.style.display = "none";
      loadExercise();
    });
  }

  // ---- Kết quả trang (nếu có từ session) ----
  const raw = sessionStorage.getItem("slanguage_sentence_result");
  if (raw) {
    const r = JSON.parse(raw);
    if (resultEl) {
      resultEl.style.display = "block";
      if (resultIcon) resultIcon.textContent = r.correct ? "🏆" : "💪";
      if (resultTitle) resultTitle.textContent = r.correct ? "Hoàn thành!" : "Hãy thử lại";
      if (resultMsg) resultMsg.textContent = r.message;
      if (resultFill) resultFill.style.width = `${r.score}%`;
    }
    sessionStorage.removeItem("slanguage_sentence_result");
  }

  loadExercise();
  initPageReveal({ container: ".sl-page-reveal" });
  initCardStagger({ container: ".sl-page-reveal", item: ".sl-stagger-item" });
}
