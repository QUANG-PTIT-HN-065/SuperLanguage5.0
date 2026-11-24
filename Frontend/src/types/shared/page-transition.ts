/**
 * Man hinh chuyen trang dung animation Rive cat_companion.riv,
 * dung chung cho cac trang hoc vien. Chan moi link dieu huong noi bo,
 * chieu animation mot nhip roi moi sang trang.
 */

import { playLoadingRive, stopLoadingRive } from "./loading-rive";

const OVERLAY_ID = "slanguageLoadingOverlay";
const DEFAULT_DURATION_MS = 1500;

// Dang xuat co luong rieng (thu hoi token roi replace location).
const SKIP_SELECTOR = 'a[href^="javascript:"], a[target], #navLogoutItem, #drawerLogoutBtn, .logout-item, .drawer-logout';

function overlayEl(): HTMLElement | null {
  return document.getElementById(OVERLAY_ID);
}

function hideOverlay(): void {
  overlayEl()?.classList.remove("active");
  stopLoadingRive();
}

export function triggerLoadingAndRedirect(targetUrl: string, duration: number = DEFAULT_DURATION_MS): void {
  const overlay = overlayEl();
  if (overlay) {
    overlay.classList.add("active");
    playLoadingRive();
  }
  window.setTimeout(() => {
    window.location.href = targetUrl;
  }, duration);
}

export function bindPageTransitions(): void {
  if (!overlayEl()) return;

  document.querySelectorAll<HTMLAnchorElement>("a[href]").forEach((link) => {
    if (link.matches(SKIP_SELECTOR)) return;
    const href = link.getAttribute("href");
    if (!href || href.startsWith("#")) return;
    link.addEventListener("click", (event) => {
      event.preventDefault();
      triggerLoadingAndRedirect(href);
    });
  });

  // Trinh phuc hoi trang tu bfcache: khong duoc de man hinh loading che noi dung.
  window.addEventListener("pageshow", hideOverlay);
}
