/* ============================================================
   Slanguage · ui/header.ts
   Header dùng chung: inject partial, bóng cuộn, indicator trượt,
   chip streak/XP, dropdown ngôn ngữ & tài khoản, tab bar mobile.
   ============================================================ */

import { readStoredLanguage } from "../api.js";
import type { LanguageCode } from "../api.js";
import { isSignedIn, logout } from "../state/auth.js";
import { headerStore, loadHeader, setLearningLanguage } from "../state/store.js";
import type { HeaderState } from "../state/store.js";

export type NavKey = "home" | "learning" | "vocabulary" | "chat" | "profile";

export interface HeaderOptions {
  active: NavKey;
  partial?: string;
  externalState?: boolean;
}

const DEFAULT_PARTIAL = "/src/pages/partials/header.html";
const XP_DURATION = 900;

interface LanguageMeta {
  label: string;
  flag: string;
}

const LANGUAGES: Record<LanguageCode, LanguageMeta> = {
  ja: { label: "Tiếng Nhật", flag: "/assets/flags/flag-jp.png" },
  en: { label: "Tiếng Anh", flag: "/assets/flags/flag-en.png" },
  vi: { label: "Tiếng Việt", flag: "/assets/flags/flag-vn.png" },
};

let xpShown = 0;

/* ---------- helpers ---------- */
function pick<T extends Element>(root: ParentNode, selector: string): T | null {
  return root.querySelector<T>(selector);
}

function pickAll<T extends Element>(root: ParentNode, selector: string): T[] {
  return Array.from(root.querySelectorAll<T>(selector));
}

function reducedMotion(): boolean {
  return matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function formatNumber(value: number): string {
  return value.toLocaleString("vi-VN");
}

async function fetchPartial(src: string): Promise<string> {
  const response = await fetch(src, { headers: { Accept: "text/html" } });
  if (!response.ok) {
    throw new Error(`Không tải được header dùng chung (${response.status}).`);
  }
  return response.text();
}

/* ---------- sticky shadow ---------- */
function bindScrollShadow(header: HTMLElement): void {
  const apply = (): void => {
    header.classList.toggle("is-scrolled", scrollY > 8);
  };
  apply();
  addEventListener("scroll", apply, { passive: true });
}

/* ---------- indicator trượt (chỉ translateX + scaleX) ---------- */
function bindIndicator(root: ParentNode): void {
  const links = pickAll<HTMLElement>(root, ".nav-link");
  const bar = pick<HTMLElement>(root, ".nav-indicator");
  const nav = pick<HTMLElement>(root, ".main-nav");
  if (!bar || !nav || links.length === 0) return;

  const move = (): void => {
    const active = links.find((link) => link.classList.contains("is-active")) ?? links[0];
    const navBox = nav.getBoundingClientRect();
    const box = active.getBoundingClientRect();
    // làm tròn để đường gạch không nằm ở pixel lẻ
    bar.style.setProperty("--ind-x", `${Math.round(box.left - navBox.left)}px`);
    bar.style.setProperty("--ind-w", `${Math.round(box.width)}`);
    bar.classList.add("is-ready");
  };

  move();
  addEventListener("resize", move);
  requestAnimationFrame(move);
  if (document.fonts) void document.fonts.ready.then(move).catch(() => undefined);
}

/* ---------- dropdown: Esc, click ngoài, điều hướng bàn phím ---------- */
function bindDropdowns(root: ParentNode): void {
  const dropdowns = pickAll<HTMLElement>(root, ".dropdown");
  if (dropdowns.length === 0) return;

  const triggerOf = (dd: HTMLElement): HTMLButtonElement | null => pick<HTMLButtonElement>(dd, ".trigger");

  const close = (dd: HTMLElement): void => {
    dd.classList.remove("is-open");
    triggerOf(dd)?.setAttribute("aria-expanded", "false");
  };

  const open = (dd: HTMLElement): void => {
    dropdowns.forEach(close);
    dd.classList.add("is-open");
    triggerOf(dd)?.setAttribute("aria-expanded", "true");
  };

  for (const dd of dropdowns) {
    const menu = dd.querySelector<HTMLElement>(".menu");
    const trigger = triggerOf(dd);
    if (menu?.id && trigger) trigger.setAttribute("aria-controls", menu.id);
    trigger?.addEventListener("click", () => {
      if (dd.classList.contains("is-open")) close(dd);
      else open(dd);
    });

    // Tab rời khỏi menu -> đóng (không đóng khi Tab vào item kế tiếp)
    dd.addEventListener("focusout", (event) => {
      const next = event.relatedTarget;
      if (dd.classList.contains("is-open") && next instanceof Node && !dd.contains(next)) close(dd);
    });

    dd.addEventListener("keydown", (event) => {
      const items = pickAll<HTMLElement>(dd, ".menu-item");
      const index = items.indexOf(document.activeElement as HTMLElement);

      if (event.key === "Escape") {
        close(dd);
        trigger?.focus();
        return;
      }
      if (items.length === 0) return;
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const step = event.key === "ArrowDown" ? 1 : -1;
        // focus đang ở trigger (index < 0) -> xuống: phần tử đầu, lên: phần tử cuối
        const base = index < 0 ? (step > 0 ? -1 : 0) : index;
        items[(base + step + items.length) % items.length].focus();
      } else if (event.key === "Home") {
        event.preventDefault();
        items[0].focus();
      } else if (event.key === "End") {
        event.preventDefault();
        items[items.length - 1].focus();
      }
    });
  }

  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Node)) return;
    if (dropdowns.some((dd) => dd.contains(target))) return;
    dropdowns.forEach(close);
  });
}

/* ---------- count-up XP ---------- */
function countUp(element: HTMLElement, target: number): void {
  const from = xpShown;
  xpShown = target;

  if (reducedMotion() || from === target) {
    element.textContent = formatNumber(target);
    return;
  }

  const startedAt = performance.now();
  const tick = (now: number): void => {
    const progress = Math.min(1, (now - startedAt) / XP_DURATION);
    const eased = 1 - (1 - progress) ** 3;
    element.textContent = formatNumber(Math.round(from + (target - from) * eased));
    if (progress < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/* ---------- render state -> DOM ---------- */
function renderState(root: ParentNode, state: HeaderState): void {
  const stats = state.stats;
  if (stats) {
    const streak = pick<HTMLElement>(root, "#headerStreakVal");
    if (streak) streak.textContent = String(stats.current_streak);
    const xp = pick<HTMLElement>(root, "#headerXPVal");
    if (xp) countUp(xp, stats.xp_total);
  }

  const profile = state.profile;
  if (profile) {
    pickAll<HTMLElement>(root, "[data-learner-name]").forEach((node) => {
      node.textContent = profile.display_name || profile.username;
    });
    if (profile.avatar_url?.startsWith("https://")) {
      const avatar = pick<HTMLImageElement>(root, "#headerAvatar");
      if (avatar) avatar.src = profile.avatar_url;
    }
  }

  const meta = LANGUAGES[state.language];
  const label = pick<HTMLElement>(root, "#currentLangLabel");
  if (label) label.textContent = meta.label;
  const flag = pick<HTMLImageElement>(root, "#currentLangFlag");
  if (flag) {
    flag.src = meta.flag;
    flag.alt = meta.label;
  }
  pickAll<HTMLElement>(root, ".menu-item[data-lang]").forEach((item) => {
    const selected = item.dataset.lang === state.language;
    item.classList.toggle("is-selected", selected);
    if (selected) item.setAttribute("aria-current", "true");
    else item.removeAttribute("aria-current");
  });
}

/* ---------- ngôn ngữ ---------- */
function bindLanguage(root: ParentNode): void {
  pickAll<HTMLButtonElement>(root, ".menu-item[data-lang]").forEach((item) => {
    item.addEventListener("click", () => {
      const code = item.dataset.lang;
      if (code === "ja" || code === "en" || code === "vi") {
        void setLearningLanguage(code);
        item.closest(".dropdown")?.classList.remove("is-open");
      }
    });
  });
}

/* ---------- trạng thái kết nối (chỉ trang Luyện tập AI) ---------- */
function bindConnectionStatus(root: ParentNode, active: NavKey, externalState: boolean): void {
  const pill = pick<HTMLElement>(root, "#connectionStatus");
  if (!pill) return;
  if (active !== "chat") {
    pill.hidden = true;
    return;
  }
  pill.hidden = false;
  if (externalState) return;

  const label = pick<HTMLElement>(root, "#connectionLabel");
  const online = (): void => {
    pill.classList.add("is-online");
    if (label) label.textContent = "Đã kết nối";
  };
  if (reducedMotion()) online();
  else setTimeout(online, 700);
}

function applyAuthClasses(): void {
  const signedIn = isSignedIn();
  document.body.classList.toggle("user-authenticated", signedIn);
  document.body.classList.toggle("user-guest", !signedIn);
}

function markActiveNav(root: ParentNode, active: NavKey): void {
  pickAll<HTMLElement>(root, "[data-nav]").forEach((node) => {
    const isActive = node.dataset.nav === active;
    node.classList.toggle("is-active", isActive);
    if (isActive) node.setAttribute("aria-current", "page");
    else node.removeAttribute("aria-current");
  });
}

/* ---------- entry point ---------- */
export async function mountHeader(options: HeaderOptions): Promise<void> {
  const mount = document.querySelector<HTMLElement>("[data-app-header]");
  if (!mount) {
    throw new Error('Trang thiếu <div data-app-header> để gắn header dùng chung.');
  }

  const signedIn = isSignedIn();
  mount.innerHTML = await fetchPartial(options.partial ?? DEFAULT_PARTIAL);

  applyAuthClasses();
  markActiveNav(mount, options.active);

  const header = pick<HTMLElement>(mount, ".app-header");
  if (header) bindScrollShadow(header);
  bindIndicator(mount);
  bindConnectionStatus(mount, options.active, options.externalState === true);

  if (options.externalState) {
    headerStore.set({ status: "ready", language: readStoredLanguage() ?? "ja" });
    return;
  }

  bindDropdowns(mount);
  bindLanguage(mount);
  pick<HTMLButtonElement>(mount, "#navLogoutItem")?.addEventListener("click", logout);
  headerStore.subscribe((state) => renderState(mount, state));

  if (signedIn) await loadHeader();
  else headerStore.set({ status: "ready", language: readStoredLanguage() ?? "ja" });
}
