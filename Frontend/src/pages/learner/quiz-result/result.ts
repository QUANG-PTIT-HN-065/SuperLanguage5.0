/**
 * slanguage-quiz-result.ts
 * Trang Kết quả trắc nghiệm (R43 - Phản hồi đúng/sai và màn hình kết quả).
 * - Đọc kết quả quiz từ sessionStorage (được lưu bởi quiz.ts)
 * - Hiển thị điểm số, badges, chi tiết từng câu
 * - GSAP animations
 */

import { renderHeader } from "../../../types/shared/header";
import { initPageReveal, initCardStagger, animateButtonPress } from "../../../types/shared/gsap-animations";
import { isLearnerAuthenticated } from "../../../types/shared/api-client";

renderHeader({ containerId: "sl-header", activePage: "quiz" });

const authGuard = document.getElementById("sl-auth-guard");
const resultContent = document.getElementById("sl-result-content");

if (!isLearnerAuthenticated()) {
  if (authGuard) authGuard.style.display = "block";
  if (resultContent) resultContent.style.display = "none";
} else {
  if (authGuard) authGuard.style.display = "none";
  if (resultContent) resultContent.style.display = "block";

  // Đọc kết quả từ sessionStorage (quiz page lưu trước khi chuyển trang)
  const raw = sessionStorage.getItem("slanguage_quiz_result");
  const result = raw ? JSON.parse(raw) : null;

  const resultEl = document.getElementById("sl-result-emoji");
  const titleEl = document.getElementById("sl-result-title");
  const scoreEl = document.getElementById("sl-result-score");
  const badgeEl = document.getElementById("sl-result-badge");
  const msgEl = document.getElementById("sl-result-message");
  const progressFill = document.getElementById("sl-result-progress-fill");
  const listEl = document.getElementById("sl-result-list");
  const emptyEl = listEl?.querySelector(".sl-empty") as HTMLElement | null;
  const retakeBtn = document.getElementById("sl-result-retake") as HTMLButtonElement | null;

  if (!result || !result.questions) {
    if (emptyEl) emptyEl.style.display = "block";
  } else {
    const { questions, score, total } = result;
    const pct = total ? Math.round((score / total) * 100) : 0;

    if (resultEl) resultEl.textContent = pct >= 70 ? "🏆" : pct >= 40 ? "👍" : "💪";
    if (titleEl) {
      titleEl.textContent = pct >= 70 ? "Xuất sắc!" : pct >= 40 ? "Bạn đang tiến bộ" : "Hãy ôn tập lại";
    }
    if (scoreEl) scoreEl.textContent = `${score} / ${total}`;
    if (badgeEl) {
      badgeEl.textContent = `${pct}%`;
      badgeEl.className = `sl-badge sl-badge-${pct >= 70 ? "success" : pct >= 40 ? "warning" : "danger"}`;
    }
    if (msgEl) {
      msgEl.textContent = pct >= 70
        ? "Kiến thức ngôn ngữ của bạn rất tốt. Tiếp tục duy trì nhé!"
        : pct >= 40
        ? "Bạn đã nắm được một phần. Hãy làm lại để cải thiện điểm số."
        : "Hãy ôn tập bài học rồi quay lại làm lại.";
    }
    if (progressFill) progressFill.style.width = `${pct}%`;

    // Render chi tiết từng câu
    if (listEl) {
      listEl.innerHTML = questions.map((q: any, i: number) => {
        const userAns = q.userSelectedIndex;
        const correctAns = q.correctIndex;
        const isCorrect = userAns === correctAns;
        const letter = (idx: number) => String.fromCharCode(65 + idx);
        return `
          <div class="sl-card p-4 sl-stagger-item" style="--stagger-index:${i}">
            <div class="flex justify-between items-start mb-2">
              <span class="font-semibold text-slate-900">Câu ${i + 1}</span>
              <span class="sl-badge ${isCorrect ? "sl-badge-success" : "sl-badge-danger"}">
                ${isCorrect ? "Đúng" : "Sai"}
              </span>
            </div>
            <p class="text-slate-800 mb-3">${q.question}</p>
            <div class="text-sm space-y-1">
              ${q.options.map((opt: string, idx: number) => {
                const isUser = idx === userAns;
                const isCorrectOpt = idx === correctAns;
                let badge = "";
                if (isCorrectOpt) badge = '<span class="text-emerald-600 font-bold">✓ Đáp án đúng</span>';
                if (isUser && !isCorrect) badge = '<span class="text-rose-600 font-bold">✕ Bạn chọn</span>';
                return `<div class="flex items-center gap-2"><span style="opacity:0.6">${letter(idx)}.</span> <span class="${isUser ? 'font-semibold' : ''}">${opt}</span> ${badge}</div>`;
              }).join("")}
            </div>
            ${q.explanation ? `<p class="mt-2 text-xs text-slate-muted">${q.explanation}</p>` : ""}
          </div>
        `;
      }).join("");
    }
  }

  if (retakeBtn) {
    retakeBtn.addEventListener("click", () => {
      animateButtonPress(retakeBtn as HTMLElement);
      sessionStorage.removeItem("slanguage_quiz_result");
      window.location.assign("../quiz/index.html");
    });
  }

  initPageReveal({ container: ".sl-page-reveal" });
  initCardStagger({ container: ".sl-page-reveal", item: ".sl-stagger-item" });
}
