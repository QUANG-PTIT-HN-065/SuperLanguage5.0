/**
 * slanguage-progress.ts
 * Bản đồ hành trình dạng hầm ngục, dựng từ dữ liệu thật.
 *
 * - Chủ đề: GET /api/v1/vocabulary/topics (đúng ngôn ngữ đích + giới hạn gói)
 * - Hành trang: GET /api/v1/me (XP, cấp, chuỗi, từ, bài)
 * - Không hiển thị trạng thái "đã xong" / "bị khóa" vì backend không trả
 *   tiến độ theo từng bài. Mọi cổng đều là chủ đề đang mở.
 */

import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { renderHeader } from "../../../types/shared/header";
import { initPageReveal } from "../../../types/shared/gsap-animations";
import {
  isLearnerAuthenticated,
  slanguageApi,
} from "../../../types/shared/api-client";
import {
  XP_PER_LEVEL,
  cacheOverview,
  escapeHtml,
  fetchLearnerOverview,
  formatNumber,
  languageLabel,
  readCachedProgress,
  type LearnerOverview,
} from "../../../types/shared/learner-progress";

gsap.registerPlugin(ScrollTrigger);

renderHeader({ containerId: "sl-header", activePage: "progress" });

interface TopicItem {
  id: number | string;
  name: string;
  description?: string | null;
  language_code?: string;
  icon_url?: string | null;
}

interface TopicsPayload {
  items?: TopicItem[];
  total?: number;
  available?: number;
  plan?: string;
}

const authGuard = document.getElementById("sl-auth-guard");
const content = document.getElementById("sl-progress-content");
const loadingEl = document.getElementById("sl-map-loading");
const errorEl = document.getElementById("sl-map-error");
const errorMessageEl = document.getElementById("sl-map-error-message");
const emptyEl = document.getElementById("sl-map-empty");
const trackEl = document.getElementById("sl-map-track");
const nodesEl = document.getElementById("sl-map-nodes");
const planEl = document.getElementById("sl-map-plan");
const introEl = document.getElementById("sl-progress-intro");
const statusEl = document.getElementById("sl-progress-status");
const retryBtn = document.getElementById("sl-map-retry") as HTMLButtonElement | null;

let mapTrigger: ScrollTrigger | null = null;
let hasRevealed = false;
let lastTopics: TopicsPayload | null = null;

function setText(id: string, value: string): void {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function renderStats(overview: LearnerOverview): void {
  const { profile, stats } = overview;
  setText("sl-map-xp", `${formatNumber(stats.xpTotal)} XP`);
  setText("sl-map-level", `Cấp ${overview.level}`);
  setText("sl-map-streak", `${stats.currentStreak} ngày`);
  setText("sl-map-longest", `${stats.longestStreak} ngày`);
  setText("sl-map-words", formatNumber(stats.wordsLearned));
  setText("sl-map-lessons", formatNumber(stats.lessonsCompleted));
  setText(
    "sl-map-goal",
    profile.dailyGoalXp > 0 ? `${formatNumber(profile.dailyGoalXp)} XP` : "Chưa thiết lập"
  );
  setText(
    "sl-map-language",
    profile.targetLanguage ? languageLabel(profile.targetLanguage) : "Chưa chọn"
  );
  setText(
    "sl-progress-intro",
    profile.targetLanguage
      ? `Những cổng dưới đây là chủ đề đang mở cho ${languageLabel(profile.targetLanguage)}. Bạn đang ở cấp ${overview.level} với ${formatNumber(stats.xpTotal)} XP.`
      : "Hồ sơ chưa có ngôn ngữ đích. Bản đồ sẽ trống cho tới khi bạn cập nhật hồ sơ."
  );
  setText("sl-map-stats-note", "Các chỉ số được đọc từ hồ sơ học tập hiện tại.");
}

function renderCachedStats(): void {
  const cached = readCachedProgress();
  if (!cached) {
    setText(
      "sl-map-stats-note",
      "Không tải được hồ sơ. Các chỉ số để trống thay vì dùng số liệu mẫu."
    );
    return;
  }
  setText("sl-map-xp", `${formatNumber(cached.xp)} XP`);
  setText("sl-map-level", `Cấp ${Math.floor(cached.xp / XP_PER_LEVEL) + 1}`);
  setText("sl-map-streak", `${cached.streak} ngày`);
  setText(
    "sl-map-stats-note",
    "Máy chủ không phản hồi. Đang hiển thị số liệu của lần đồng bộ gần nhất."
  );
}

function showOnly(target: HTMLElement | null): void {
  [loadingEl, errorEl, emptyEl, trackEl].forEach((el) => {
    if (el) el.hidden = el !== target;
  });
}

function initMapMotion(): void {
  mapTrigger?.kill();
  mapTrigger = null;

  if (!trackEl || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return;
  }

  const fill = document.getElementById("sl-map-fill");
  const orb = document.getElementById("sl-map-orb");
  if (!fill || !orb) return;

  mapTrigger = ScrollTrigger.create({
    trigger: trackEl,
    start: "top 85%",
    end: "bottom 55%",
    scrub: 0.3,
    onUpdate: (self) => {
      gsap.set(fill, { scaleY: self.progress });
      const distance = Math.max(0, (trackEl.clientHeight || 0) - orb.offsetHeight);
      gsap.set(orb, { y: distance * self.progress });
    },
  });
  ScrollTrigger.refresh();
}

function renderTopics(payload: TopicsPayload): void {
  lastTopics = payload;
  const items = (payload.items ?? []).filter(
    (topic) => topic && typeof topic.name === "string" && topic.name.trim() !== ""
  );

  if (items.length === 0) {
    showOnly(emptyEl);
    if (planEl) planEl.hidden = true;
    setText("sl-progress-status", "API chưa trả về chủ đề nào.");
    return;
  }

  if (nodesEl) {
    nodesEl.innerHTML = items
      .map((topic, index) => {
        const name = escapeHtml(topic.name);
        const description = escapeHtml(
          topic.description || "Chủ đề này chưa có mô tả từ hệ thống."
        );
        const topicId = encodeURIComponent(String(topic.id));
        return `
          <div class="slg-map-node">
            <span class="slg-map-gate" aria-hidden="true">${String(index + 1).padStart(2, "0")}</span>
            <article class="slg-map-card">
              <div class="slg-map-card-head">
                <h3>${name}</h3>
                <span class="slg-chip slg-chip--teal">Có thể mở</span>
              </div>
              <p>${description}</p>
              <div class="slg-map-actions">
                <button
                  type="button"
                  class="slg-btn slg-btn--primary slg-btn--sm"
                  data-topic-chat="${name}"
                >
                  Luyện nói
                </button>
                <a
                  class="slg-btn slg-btn--ghost slg-btn--sm"
                  href="../flashcard/index.html?topic_id=${topicId}"
                >
                  Mở kho thẻ
                </a>
              </div>
            </article>
          </div>
        `;
      })
      .join("");
  }

  showOnly(trackEl);

  const available = payload.available;
  const total = payload.total;
  if (planEl) {
    if (typeof available === "number" && typeof total === "number" && total > 0) {
      planEl.hidden = false;
      planEl.textContent =
        `Gói ${payload.plan === "premium" ? "Premium" : "hiện tại"}: ` +
        `${available}/${total} chủ đề đang mở. Bản đồ chỉ vẽ các chủ đề API trả về.`;
    } else {
      planEl.hidden = true;
    }
  }

  setText(
    "sl-progress-status",
    `${items.length} cổng chủ đề đang mở.`
  );

  if (!hasRevealed) {
    initPageReveal({ container: ".slg-reveal" });
    hasRevealed = true;
  }
  initMapMotion();
}

function showTopicsError(message: string): void {
  showOnly(errorEl);
  if (errorMessageEl) errorMessageEl.textContent = message;
  setText("sl-progress-status", "Không tải được bản đồ chủ đề.");
}

async function loadAll(): Promise<void> {
  showOnly(loadingEl);
  if (statusEl) statusEl.hidden = false;
  setText("sl-progress-status", "Đang tải bản đồ…");
  if (planEl) planEl.hidden = true;

  const [overviewResult, topicsResult] = await Promise.allSettled([
    fetchLearnerOverview(),
    slanguageApi("/api/v1/vocabulary/topics?limit=30", { method: "GET" }),
  ]);

  if (overviewResult.status === "fulfilled") {
    cacheOverview(overviewResult.value);
    renderStats(overviewResult.value);
  } else {
    renderCachedStats();
  }

  if (topicsResult.status === "fulfilled") {
    renderTopics((topicsResult.value ?? {}) as TopicsPayload);
  } else {
    const reason = topicsResult.reason;
    showTopicsError(
      reason instanceof Error
        ? reason.message
        : "Không tải được danh sách chủ đề. Vui lòng thử lại."
    );
    if (!hasRevealed) {
      initPageReveal({ container: ".slg-reveal" });
      hasRevealed = true;
    }
  }
}

if (!isLearnerAuthenticated()) {
  if (authGuard) authGuard.hidden = false;
  if (content) content.hidden = true;
} else {
  if (authGuard) authGuard.hidden = true;
  if (content) content.hidden = false;
  void loadAll();
}

retryBtn?.addEventListener("click", () => {
  void loadAll();
});

nodesEl?.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const button = target.closest<HTMLButtonElement>("[data-topic-chat]");
  if (!button) return;
  const topicName = button.dataset.topicChat;
  if (!topicName) return;
  localStorage.setItem("slanguage_selected_topic", topicName);
  window.location.assign("../../chat/index.html");
});

window.addEventListener("pagehide", () => {
  mapTrigger?.kill();
  mapTrigger = null;
});

// Dữ liệu chủ đề chỉ dùng để ghi nhớ trong phiên trang này;
// biến giữ lại để tránh rò rỉ state khi hot reload.
void lastTopics;
void initMapMotion;
