/**
 * slanguage-topics.ts
 * Thư viện chủ đề theo dữ liệu thật.
 *
 * - GET /api/v1/vocabulary/topics (đã lọc theo target_language + gói)
 * - GET /api/v1/me để hiển thị ngôn ngữ đích
 * - Không còn danh sách chủ đề mẫu: lỗi hoặc rỗng đều có trạng thái riêng.
 */

import { renderHeader } from "../../../types/shared/header";
import { initPageReveal } from "../../../types/shared/gsap-animations";
import {
  getLearnerProfile,
  isLearnerAuthenticated,
  slanguageApi,
} from "../../../types/shared/api-client";
import {
  cacheOverview,
  escapeHtml,
  fetchLearnerOverview,
  languageLabel,
} from "../../../types/shared/learner-progress";

renderHeader({ containerId: "sl-header", activePage: "topics" });

interface TopicItem {
  id: number | string;
  name: string;
  description?: string | null;
}

interface TopicsPayload {
  items?: TopicItem[];
  total?: number;
  available?: number;
  plan?: string;
}

const authGuard = document.getElementById("sl-auth-guard");
const content = document.getElementById("sl-topics-content");
const loadingEl = document.getElementById("sl-topics-loading");
const errorEl = document.getElementById("sl-topics-error");
const errorMessageEl = document.getElementById("sl-topics-error-message");
const emptyEl = document.getElementById("sl-topics-empty");
const gridEl = document.getElementById("sl-topics-grid");
const planEl = document.getElementById("sl-topics-plan");
const statusEl = document.getElementById("sl-topics-status");
const introEl = document.getElementById("sl-topics-intro");
const langEl = document.getElementById("sl-topics-lang");
const retryBtn = document.getElementById("sl-topics-retry") as HTMLButtonElement | null;

function setText(id: string, value: string): void {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function showOnly(target: HTMLElement | null): void {
  [loadingEl, errorEl, emptyEl].forEach((el) => {
    if (el) el.hidden = el !== target;
  });
}

function renderTopics(payload: TopicsPayload): void {
  const items = (payload.items ?? []).filter(
    (topic) => topic && typeof topic.name === "string" && topic.name.trim() !== ""
  );

  if (items.length === 0) {
    showOnly(emptyEl);
    if (gridEl) gridEl.innerHTML = "";
    if (planEl) planEl.hidden = true;
    setText("sl-topics-status", "API chưa trả về chủ đề nào.");
    return;
  }

  showOnly(null);
  if (planEl) {
    if (
      typeof payload.available === "number" &&
      typeof payload.total === "number" &&
      payload.total > 0
    ) {
      planEl.hidden = false;
      planEl.textContent =
        `Gói ${payload.plan === "premium" ? "Premium" : "hiện tại"}: ` +
        `${payload.available}/${payload.total} chủ đề đang mở.`;
    } else {
      planEl.hidden = true;
    }
  }

  if (gridEl) {
    gridEl.innerHTML = items
      .map((topic, index) => {
        const name = escapeHtml(topic.name);
        const description = escapeHtml(
          topic.description || "Chủ đề này chưa có mô tả từ hệ thống."
        );
        const topicId = encodeURIComponent(String(topic.id));
        return `
          <article class="slg-topic-card">
            <div class="slg-topic-top">
              <span class="slg-topic-num">CỔNG ${String(index + 1).padStart(2, "0")}</span>
              <span class="slg-topic-badge">Chủ đề</span>
            </div>
            <h3>${name}</h3>
            <p>${description}</p>
            <div class="slg-topic-actions">
              <button
                type="button"
                class="slg-btn slg-btn--primary slg-btn--sm"
                data-topic-chat="${name}"
              >
                Luyện nói
              </button>
              <a
                href="../flashcard/index.html?topic_id=${topicId}"
                class="slg-btn slg-btn--ghost slg-btn--sm"
              >
                Kho thẻ
              </a>
            </div>
          </article>
        `;
      })
      .join("");
  }

  setText("sl-topics-status", `${items.length} chủ đề đang mở.`);
  if (!document.documentElement.dataset.slTopicsRevealed) {
    initPageReveal({ container: ".slg-reveal" });
    document.documentElement.dataset.slTopicsRevealed = "true";
  }
}

async function loadTopics(): Promise<void> {
  showOnly(loadingEl);
  if (gridEl) gridEl.innerHTML = "";
  if (planEl) planEl.hidden = true;
  setText("sl-topics-status", "Đang tải chủ đề…");

  const [overviewResult, topicsResult] = await Promise.allSettled([
    fetchLearnerOverview(),
    slanguageApi("/api/v1/vocabulary/topics?limit=30", { method: "GET" }),
  ]);

  if (overviewResult.status === "fulfilled") {
    cacheOverview(overviewResult.value);
    const language = overviewResult.value.profile.targetLanguage;
    if (langEl) langEl.textContent = language ? languageLabel(language) : "Chưa chọn";
    if (introEl) {
      introEl.textContent = language
        ? `Danh sách chủ đề đang mở cho ${languageLabel(language)}. Bấm “Luyện nói” để mang chủ đề sang phòng chat, hoặc mở kho thẻ của chủ đề đó.`
        : "Hồ sơ chưa có ngôn ngữ đích.";
    }
  } else {
    const fallbackLanguage = getLearnerProfile().activeLanguage;
    if (langEl) {
      langEl.textContent = fallbackLanguage
        ? languageLabel(fallbackLanguage)
        : "Chưa chọn";
    }
  }

  if (topicsResult.status === "fulfilled") {
    renderTopics((topicsResult.value ?? {}) as TopicsPayload);
  } else {
    showOnly(errorEl);
    const reason = topicsResult.reason;
    const message =
      reason instanceof Error
        ? reason.message
        : "Không tải được danh sách chủ đề. Vui lòng thử lại.";
    if (errorMessageEl) errorMessageEl.textContent = message;
    setText("sl-topics-status", "Không tải được thư viện chủ đề.");
    if (!document.documentElement.dataset.slTopicsRevealed) {
      initPageReveal({ container: ".slg-reveal" });
      document.documentElement.dataset.slTopicsRevealed = "true";
    }
  }
}

if (!isLearnerAuthenticated()) {
  if (authGuard) authGuard.hidden = false;
  if (content) content.hidden = true;
} else {
  if (authGuard) authGuard.hidden = true;
  if (content) content.hidden = false;
  void loadTopics();
}

retryBtn?.addEventListener("click", () => {
  void loadTopics();
});

gridEl?.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const button = target.closest<HTMLButtonElement>("[data-topic-chat]");
  if (!button) return;
  const topicName = button.dataset.topicChat;
  if (!topicName) return;
  localStorage.setItem("slanguage_selected_topic", topicName);
  window.location.assign("../../chat/index.html");
});
