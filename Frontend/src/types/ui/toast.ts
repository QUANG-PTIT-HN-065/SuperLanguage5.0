export type ToastType = "success" | "error" | "info";

export interface ToastOptions {
  type: ToastType;
  message: string;
  duration?: number;
}

interface ToastEntry {
  element: HTMLDivElement;
  timeoutId: number;
  remaining: number;
  startedAt: number;
}

const MAX_TOASTS = 3;
const DEFAULT_DURATION = 3000;
const entries: ToastEntry[] = [];

function getRegion(): HTMLDivElement {
  let region = document.getElementById("slgToastRegion") as HTMLDivElement | null;
  if (!region) {
    region = document.createElement("div");
    region.id = "slgToastRegion";
    region.className = "slg-toast-region";
    region.setAttribute("aria-label", "Thông báo");
    document.body.append(region);
  }
  return region;
}

function removeEntry(entry: ToastEntry, immediate = false): void {
  window.clearTimeout(entry.timeoutId);
  const index = entries.indexOf(entry);
  if (index >= 0) entries.splice(index, 1);
  if (immediate) {
    entry.element.remove();
    return;
  }
  entry.element.classList.add("is-closing");
  window.setTimeout(() => entry.element.remove(), 180);
}

function pauseEntry(entry: ToastEntry): void {
  if (!entry.timeoutId) return;
  window.clearTimeout(entry.timeoutId);
  entry.timeoutId = 0;
  entry.remaining = Math.max(0, entry.remaining - (performance.now() - entry.startedAt));
  entry.element.style.setProperty("--toast-play-state", "paused");
}

function resumeEntry(entry: ToastEntry): void {
  if (entry.element.matches(":hover") || entry.element.contains(document.activeElement)) return;
  if (entry.timeoutId || !entries.includes(entry)) return;
  if (entry.remaining <= 0) {
    removeEntry(entry);
    return;
  }
  entry.element.style.setProperty("--toast-play-state", "running");
  entry.startedAt = performance.now();
  entry.timeoutId = window.setTimeout(() => removeEntry(entry), entry.remaining);
}

export function showToast({ type, message, duration = DEFAULT_DURATION }: ToastOptions): void {
  const text = message.trim();
  if (!text) return;

  while (entries.length >= MAX_TOASTS) removeEntry(entries[0], true);

  const region = getRegion();
  const toast = document.createElement("div");
  toast.className = `slg-toast slg-toast--${type}`;
  toast.setAttribute("role", "status");
  toast.setAttribute("aria-live", "polite");
  toast.setAttribute("aria-atomic", "true");

  const marker = document.createElement("span");
  marker.className = "slg-toast__marker";
  marker.setAttribute("aria-hidden", "true");

  const copy = document.createElement("p");
  copy.className = "slg-toast__message";
  copy.textContent = text;

  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.className = "slg-toast__close";
  closeButton.setAttribute("aria-label", "Đóng thông báo");
  closeButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>';

  const progress = document.createElement("span");
  progress.className = "slg-toast__progress";
  const entry: ToastEntry = {
    element: toast,
    timeoutId: 0,
    remaining: Number.isFinite(duration) && duration > 0 ? duration : DEFAULT_DURATION,
    startedAt: performance.now(),
  };
  toast.style.setProperty("--toast-duration", `${entry.remaining}ms`);
  toast.append(marker, copy, closeButton, progress);
  region.append(toast);
  entries.push(entry);

  closeButton.addEventListener("click", () => removeEntry(entry));
  toast.addEventListener("pointerenter", () => pauseEntry(entry));
  toast.addEventListener("pointerleave", () => resumeEntry(entry));
  toast.addEventListener("focusin", () => pauseEntry(entry));
  toast.addEventListener("focusout", (event) => {
    if (!toast.contains(event.relatedTarget as Node | null)) resumeEntry(entry);
  });

  let swipeStart: { x: number; y: number; pointerId: number } | null = null;
  toast.addEventListener("pointerdown", (event) => {
    if (event.pointerType !== "touch" || !event.isPrimary) return;
    swipeStart = { x: event.clientX, y: event.clientY, pointerId: event.pointerId };
    toast.setPointerCapture(event.pointerId);
  });
  toast.addEventListener("pointermove", (event) => {
    if (!swipeStart || swipeStart.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - swipeStart.x;
    const deltaY = event.clientY - swipeStart.y;
    if (Math.abs(deltaX) > Math.abs(deltaY)) {
      toast.style.setProperty("--toast-swipe-x", `${deltaX}px`);
    }
  });
  toast.addEventListener("pointerup", (event) => {
    if (!swipeStart || swipeStart.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - swipeStart.x;
    swipeStart = null;
    if (Math.abs(deltaX) >= 72) {
      removeEntry(entry);
    } else {
      toast.style.removeProperty("--toast-swipe-x");
    }
  });
  toast.addEventListener("pointercancel", () => {
    swipeStart = null;
    toast.style.removeProperty("--toast-swipe-x");
  });

  entry.timeoutId = window.setTimeout(() => removeEntry(entry), entry.remaining);
}
