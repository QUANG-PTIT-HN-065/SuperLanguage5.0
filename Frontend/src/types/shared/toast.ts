/**
 * slanguage-toast.ts
 * Thông báo toast dùng chung cho tất cả trang learner.
 * Tự tạo container nếu chưa có.
 */

type ToastType = "success" | "error" | "info" | "warning";

const TYPE_CONFIG: Record<ToastType, { bg: string; icon: string }> = {
  success: { bg: "#10b981", icon: "✓" },
  error: { bg: "#ef4444", icon: "✕" },
  info: { bg: "#3b82f6", icon: "ℹ" },
  warning: { bg: "#f59e0b", icon: "⚠" },
};

let container: HTMLDivElement | null = null;

function ensureContainer(): HTMLDivElement {
  if (container) return container;
  container = document.createElement("div");
  container.className = "sl-toast-container";
  document.body.appendChild(container);
  return container;
}

export function showToast(
  message: string,
  type: ToastType = "info",
  duration = 4000
): void {
  const parent = ensureContainer();
  const cfg = TYPE_CONFIG[type] ?? TYPE_CONFIG.info;

  const toast = document.createElement("div");
  toast.className = `sl-toast sl-toast-${type}`;
  toast.innerHTML = `
    <span style="font-weight:800">${cfg.icon}</span>
    <span>${message}</span>
    <button class="sl-btn sl-btn-ghost sl-btn-sm" style="margin-left:auto; padding:0.25rem; color:#ffffff; opacity:0.8">×</button>
  `;

  const closeBtn = toast.querySelector("button");
  if (closeBtn) {
    closeBtn.addEventListener("click", () => dismissToast(toast));
  }

  parent.appendChild(toast);

  // Kích hoạt animation
  requestAnimationFrame(() => {
    toast.classList.add("visible");
  });

  const timer = setTimeout(() => dismissToast(toast), duration);

  function dismissToast(el: HTMLElement): void {
    el.classList.remove("visible");
    clearTimeout(timer);
    setTimeout(() => {
      if (el.parentNode === parent) parent.removeChild(el);
    }, 300);
  }
}

export function showErrorToast(message: string, duration = 5000): void {
  showToast(message, "error", duration);
}

export function showSuccessToast(message: string, duration = 4000): void {
  showToast(message, "success", duration);
}

export function showInfoToast(message: string, duration = 4000): void {
  showToast(message, "info", duration);
}

export function showWarningToast(message: string, duration = 4000): void {
  showToast(message, "warning", duration);
}
