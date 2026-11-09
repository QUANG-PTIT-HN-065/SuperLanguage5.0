/**
 * slanguage-landing.ts
 * Landing page kể chuyện theo chương.
 *
 * - CTA phản ánh trạng thái đăng nhập (localStorage hiện có).
 * - GSAP ScrollTrigger: reveal theo chương, parallax nhẹ, marker chạy dọc
 *   thanh lộ trình khi cuộn.
 * - GSAP ScrollToPlugin cho điều hướng anchor; hỗ trợ back/forward.
 * - Không dùng ScrollSmoother: plugin Bonus chưa có trong gói cài đặt,
 *   dùng cuộn native để giữ quyền kiểm soát của người dùng.
 * - Tôn trọng prefers-reduced-motion và luôn để nội dung hiển thị nếu
 *   animation không chạy được.
 */

import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { ScrollToPlugin } from "gsap/ScrollToPlugin";
import { escapeHtml } from "./shared/learner-progress";

gsap.registerPlugin(ScrollTrigger, ScrollToPlugin);

const reduceMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
const CHAPTER_LABELS = ["Chương I"];

interface LandingElements {
  actions: HTMLElement | null;
  drawerAuth: HTMLElement | null;
  heroCta: HTMLAnchorElement | null;
  finalCta: HTMLAnchorElement | null;
  secondaryCta: HTMLAnchorElement | null;
}

function getElements(): LandingElements {
  return {
    actions: document.getElementById("sl-landing-actions"),
    drawerAuth: document.getElementById("sl-landing-drawer-auth"),
    heroCta: document.getElementById("sl-hero-cta") as HTMLAnchorElement | null,
    finalCta: document.getElementById("sl-landing-cta") as HTMLAnchorElement | null,
    secondaryCta: document.getElementById("sl-landing-secondary") as HTMLAnchorElement | null,
  };
}

function clearSession(): void {
  [
    "slanguage_access_token",
    "slanguage_refresh_token",
    "slanguage_is_logged_in",
    "slanguage_user_id",
    "slanguage_user_email",
    "slanguage_user_name",
    "slanguage_active_language",
    "slanguage_daily_goal",
    "slanguage_user_xp",
    "slanguage_streak",
    "slanguage_stats_synced",
    "slanguage_stats_synced_at",
    "slanguage_selected_topic",
    "slanguage_studied_today",
  ].forEach((key) => localStorage.removeItem(key));
}

function updateAuthUI(): void {
  const isLoggedIn = localStorage.getItem("slanguage_is_logged_in") === "true";
  const userName = localStorage.getItem("slanguage_user_name") || "Học viên";
  const safeName = escapeHtml(userName);
  const initial = escapeHtml((userName.charAt(0) || "H").toUpperCase());
  const { actions, drawerAuth, heroCta, finalCta, secondaryCta } = getElements();

  if (isLoggedIn) {
    if (actions) {
      actions.innerHTML = `
        <a href="src/pages/chat/index.html" class="slg-btn slg-btn--primary slg-btn--sm">
          Vào phòng Chat AI
        </a>
        <button type="button" class="slg-btn slg-btn--ghost slg-btn--sm" id="sl-landing-logout">
          Đăng xuất
        </button>
      `;
    }
    if (drawerAuth) {
      drawerAuth.innerHTML = `
        <div class="slg-drawer-user">
          <span class="slg-avatar">${initial}</span>
          <div><strong>${safeName}</strong><small>Đang trong hành trình</small></div>
        </div>
        <a href="src/pages/chat/index.html" class="slg-btn slg-btn--primary slg-btn--block">Vào phòng Chat AI</a>
        <button type="button" class="slg-btn slg-btn--ghost slg-btn--block" id="sl-landing-drawer-logout">Đăng xuất</button>
      `;
    }
    if (heroCta) {
      heroCta.textContent = "Vào phòng Chat AI";
      heroCta.href = "src/pages/chat/index.html";
    }
    if (finalCta) {
      finalCta.textContent = "Vào phòng Chat AI";
      finalCta.href = "src/pages/chat/index.html";
    }
    if (secondaryCta) {
      secondaryCta.textContent = "Mở phòng Chat AI";
      secondaryCta.href = "src/pages/chat/index.html";
    }
  } else {
    if (actions) {
      actions.innerHTML = `
        <a href="src/pages/login/index.html" class="slg-btn slg-btn--ghost slg-btn--sm">Đăng nhập</a>
        <a href="src/pages/register/index.html" class="slg-btn slg-btn--primary slg-btn--sm">Bắt đầu</a>
      `;
    }
    if (drawerAuth) {
      drawerAuth.innerHTML = `
        <a href="src/pages/login/index.html" class="slg-btn slg-btn--ghost slg-btn--block">Đăng nhập</a>
        <a href="src/pages/register/index.html" class="slg-btn slg-btn--primary slg-btn--block">Bắt đầu miễn phí</a>
      `;
    }
    if (heroCta) {
      heroCta.textContent = "Bắt đầu miễn phí";
      heroCta.href = "src/pages/register/index.html";
    }
    if (finalCta) {
      finalCta.textContent = "Tạo tài khoản miễn phí";
      finalCta.href = "src/pages/register/index.html";
    }
    if (secondaryCta) {
      secondaryCta.textContent = "Đã có tài khoản? Đăng nhập";
      secondaryCta.href = "src/pages/login/index.html";
    }
  }

  const logout = (): void => {
    clearSession();
    updateAuthUI();
  };
  document.getElementById("sl-landing-logout")?.addEventListener("click", logout);
  document.getElementById("sl-landing-drawer-logout")?.addEventListener("click", logout);
}

// ---- Mobile drawer ----
let closeMenu = (): void => {};

function initMobileMenu(): void {
  const toggle = document.getElementById("sl-landing-mobile-toggle");
  const closeBtn = document.getElementById("sl-landing-drawer-close");
  const overlay = document.getElementById("sl-landing-overlay");
  const drawer = document.getElementById("sl-landing-drawer");

  const open = (): void => {
    drawer?.classList.add("is-open");
    drawer?.setAttribute("aria-hidden", "false");
    if (overlay) overlay.hidden = false;
    toggle?.setAttribute("aria-expanded", "true");
    document.body.style.overflow = "hidden";
    closeBtn?.focus();
  };

  closeMenu = (): void => {
    const focusWasInside = Boolean(drawer?.contains(document.activeElement));
    drawer?.classList.remove("is-open");
    drawer?.setAttribute("aria-hidden", "true");
    if (overlay) overlay.hidden = true;
    toggle?.setAttribute("aria-expanded", "false");
    document.body.style.overflow = "";
    if (focusWasInside) toggle?.focus();
  };

  toggle?.addEventListener("click", open);
  closeBtn?.addEventListener("click", closeMenu);
  overlay?.addEventListener("click", closeMenu);
  drawer?.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", closeMenu);
  });
  document.addEventListener("keydown", (event: KeyboardEvent) => {
    if (event.key === "Escape") closeMenu();
  });
}

// ---- Anchor navigation ----
function scrollToHash(hash: string, updateHistory: boolean): void {
  if (!hash || hash === "#") return;
  const target = document.getElementById(hash.slice(1));
  if (!target) return;

  const header = document.querySelector<HTMLElement>(".slg-header");
  const headerHeight = header?.getBoundingClientRect().height ?? 0;
  const top =
    target.getBoundingClientRect().top + window.pageYOffset - headerHeight - 16;

  if (reduceMotionQuery.matches) {
    window.scrollTo({ top, behavior: "auto" });
  } else {
    const nativeFallback = window.setTimeout(() => {
      if (Math.abs(window.scrollY - top) > 8) {
        window.scrollTo({
          top,
          behavior: document.visibilityState === "hidden" ? "auto" : "smooth",
        });
      }
    }, 1100);

    gsap.to(window, {
      duration: 0.9,
      ease: "power2.inOut",
      scrollTo: { y: top, autoKill: false },
      onComplete: () => window.clearTimeout(nativeFallback),
    });
  }

  if (updateHistory && window.location.hash !== hash) {
    history.pushState(null, "", hash);
  }

  if (!target.hasAttribute("tabindex")) {
    target.setAttribute("tabindex", "-1");
  }
  target.focus({ preventScroll: true });
}

function initAnchorLinks(): void {
  document.querySelectorAll<HTMLAnchorElement>('a[href^="#"]').forEach((link) => {
    link.addEventListener("click", (event) => {
      const href = link.getAttribute("href");
      if (!href || href === "#") return;
      const target = document.getElementById(href.slice(1));
      if (!target) return;
      event.preventDefault();
      closeMenu();
      scrollToHash(href, true);
    });
  });

  window.addEventListener("popstate", () => {
    if (window.location.hash) scrollToHash(window.location.hash, false);
  });

  if (window.location.hash) {
    window.setTimeout(() => scrollToHash(window.location.hash, false), 60);
  }
}

// ---- Journey rail / chapters ----
function setActiveChapter(index: number): void {
  const readout = document.getElementById("sl-chapter-readout");
  if (readout) readout.textContent = CHAPTER_LABELS[index] ?? "Hành trình";

  document.querySelectorAll<HTMLElement>(".slg-chapter").forEach((chapter, i) => {
    chapter.classList.toggle("is-active", i === index);
  });

  document.querySelectorAll<HTMLElement>(".slg-rail-stop").forEach((stop, i) => {
    const active = i === index;
    stop.classList.toggle("is-active", active);
    if (active) stop.setAttribute("aria-current", "step");
    else stop.removeAttribute("aria-current");
  });
}

function initJourney(): void {
  const journey = document.getElementById("hanh-trinh");
  const chapters = Array.from(document.querySelectorAll<HTMLElement>(".slg-chapter"));
  if (!journey || chapters.length === 0) return;

  setActiveChapter(0);

  const syncActiveFromScroll = (): void => {
    const midpoint = window.innerHeight * 0.55;
    let activeIndex = 0;
    chapters.forEach((chapter, index) => {
      if (chapter.getBoundingClientRect().top <= midpoint) activeIndex = index;
    });
    setActiveChapter(activeIndex);
  };

  if (reduceMotionQuery.matches) {
    chapters.forEach((chapter) => chapter.classList.add("is-active"));
    window.addEventListener("load", syncActiveFromScroll, { once: true });
    syncActiveFromScroll();
    return;
  }

  const mm = gsap.matchMedia();
  const ctx = gsap.context(() => {
    chapters.forEach((chapter, index) => {
      ScrollTrigger.create({
        trigger: chapter,
        start: "top 62%",
        end: "bottom 38%",
        onEnter: () => setActiveChapter(index),
        onEnterBack: () => setActiveChapter(index),
      });

      gsap.from(chapter, {
        opacity: 0,
        y: 28,
        duration: 0.7,
        ease: "power3.out",
        scrollTrigger: {
          trigger: chapter,
          start: "top 86%",
          once: true,
        },
      });
    });

    const marker = document.getElementById("sl-rail-marker");
    const track = document.getElementById("sl-rail-track");
    if (marker && track) {
      ScrollTrigger.create({
        trigger: journey,
        start: "top 65%",
        end: "bottom 70%",
        scrub: 0.3,
        onUpdate: (self) => {
          const distance = Math.max(0, track.clientHeight - marker.offsetHeight);
          gsap.set(marker, { y: distance * self.progress });
        },
      });
    }

    document.querySelectorAll<HTMLElement>("[data-parallax]").forEach((layer) => {
      const amount = Number(layer.dataset.parallax ?? "0");
      if (!amount) return;
      gsap.to(layer, {
        yPercent: amount,
        ease: "none",
        scrollTrigger: {
          trigger: "#chapter-0",
          start: "top top",
          end: "bottom top",
          scrub: true,
        },
      });
    });

    document.querySelectorAll<HTMLElement>(".slg-reveal").forEach((element) => {
      gsap.from(element, {
        opacity: 0,
        y: 22,
        duration: 0.65,
        ease: "power2.out",
        scrollTrigger: {
          trigger: element,
          start: "top 88%",
          once: true,
        },
      });
    });
  }, document.body);

  // Đồng bộ chương đang đọc khi mở trang giữa hành trình hoặc sau khi refresh.
  ScrollTrigger.addEventListener("refresh", syncActiveFromScroll);
  window.addEventListener("scroll", syncActiveFromScroll, { passive: true });
  window.addEventListener("load", () => {
    ScrollTrigger.refresh();
    syncActiveFromScroll();
  });
  syncActiveFromScroll();

  // Nếu trigger không chạy (plugin lỗi/không hỗ trợ), không giữ nội dung ẩn.
  window.setTimeout(() => {
    document.querySelectorAll<HTMLElement>(".slg-chapter, .slg-reveal").forEach((el) => {
      if (window.getComputedStyle(el).opacity === "0") {
        el.style.opacity = "1";
        el.style.transform = "none";
      }
    });
  }, 4000);

  window.addEventListener(
    "pagehide",
    () => {
      ScrollTrigger.removeEventListener("refresh", syncActiveFromScroll);
      window.removeEventListener("scroll", syncActiveFromScroll);
      mm.revert();
      ctx.revert();
    },
    { once: true }
  );
}

document.addEventListener("DOMContentLoaded", () => {
  updateAuthUI();
  initMobileMenu();
  initAnchorLinks();
  initJourney();
});
