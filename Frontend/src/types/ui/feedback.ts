/**
 * Feedback helpers – Xử lý giao diện nhận xét phát âm, lỗi ngữ pháp và chip gợi ý câu trả lời.
 */

export interface WordScore {
  word: string;
  score: number; // 0 - 100
}

export interface PronunciationFeedback {
  overallScore: number;
  words?: WordScore[];
}

export interface GrammarFeedback {
  original: string;
  corrected: string;
  explanation?: string;
}

/**
 * Tạo HTML chip nhận xét phát âm với điểm số và phân loại màu sắc
 */
export function renderPronunciationChip(score: number): string {
  const safeScore = Math.max(0, Math.min(100, Math.round(score)));
  let badgeClass = 'score-high';
  let label = 'Chuẩn xác';

  if (safeScore < 60) {
    badgeClass = 'score-low';
    label = 'Cần luyện thêm';
  } else if (safeScore < 85) {
    badgeClass = 'score-mid';
    label = 'Khá tốt';
  }

  return `
    <div class="feedback-badge pronunciation-badge ${badgeClass}" title="Độ chính xác phát âm: ${safeScore}%">
      <i class="fa-solid fa-volume-high" aria-hidden="true"></i>
      <span class="score-val">${safeScore}/100</span>
      <span class="score-label">${label}</span>
    </div>
  `;
}

/**
 * Tạo panel chi tiết nhận xét phát âm từng từ và sửa lỗi ngữ pháp
 */
export function renderDetailedFeedbackPanel(
  grammar?: GrammarFeedback | null,
  pronunciation?: PronunciationFeedback | null,
): string {
  if (!grammar && !pronunciation) return '';

  const parts: string[] = [];

  if (pronunciation) {
    const safeScore = Math.round(pronunciation.overallScore);
    let wordsHtml = '';
    if (pronunciation.words && pronunciation.words.length > 0) {
      wordsHtml = `
        <div class="word-eval-list">
          ${pronunciation.words.map((w) => {
            const cls = w.score >= 80 ? 'w-good' : w.score >= 50 ? 'w-warn' : 'w-bad';
            return `<span class="word-item ${cls}" title="${w.score} điểm">${escapeHtml(w.word)}</span>`;
          }).join(' ')}
        </div>
      `;
    }

    parts.push(`
      <div class="feedback-row pronunciation-row">
        <div class="feedback-row-header">
          <span class="row-title"><i class="fa-solid fa-microphone-lines"></i> Phát âm (${safeScore}/100)</span>
        </div>
        ${wordsHtml}
      </div>
    `);
  }

  if (grammar && grammar.original !== grammar.corrected) {
    parts.push(`
      <div class="feedback-row grammar-row">
        <div class="feedback-row-header">
          <span class="row-title"><i class="fa-solid fa-spell-check"></i> Góp ý ngữ pháp</span>
        </div>
        <div class="grammar-diff">
          <del class="diff-original">${escapeHtml(grammar.original)}</del>
          <span class="diff-arrow">→</span>
          <ins class="diff-corrected">${escapeHtml(grammar.corrected)}</ins>
        </div>
        ${grammar.explanation ? `<p class="grammar-note">${escapeHtml(grammar.explanation)}</p>` : ''}
      </div>
    `);
  }

  return `
    <div class="ai-feedback-accordion" role="region" aria-label="Góp ý AI">
      <button type="button" class="feedback-toggle-btn" aria-expanded="false">
        <i class="fa-solid fa-wand-magic-sparkles"></i>
        <span>Xem góp ý chi tiết từ AI</span>
        <i class="fa-solid fa-chevron-down toggle-icon" aria-hidden="true"></i>
      </button>
      <div class="feedback-content" hidden>
        ${parts.join('')}
      </div>
    </div>
  `;
}

/**
 * Tạo danh sách các chip gợi ý câu trả lời nhanh (Quick replies) dưới tin nhắn của AI
 */
export function renderQuickReplies(replies: string[]): string {
  if (!replies || replies.length === 0) return '';
  return `
    <div class="quick-replies-list" role="group" aria-label="Gợi ý câu trả lời">
      <span class="quick-replies-label">Gợi ý trả lời:</span>
      ${replies.map((r) => `
        <button type="button" class="quick-reply-chip" data-reply="${escapeHtml(r)}">
          <span>${escapeHtml(r)}</span>
          <i class="fa-solid fa-arrow-turn-up" aria-hidden="true"></i>
        </button>
      `).join('')}
    </div>
  `;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
