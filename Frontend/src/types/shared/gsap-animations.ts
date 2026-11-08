/**
 * slanguage-gsap.ts
 * Hiệu ứng GSAP dùng chung cho các trang learner.
 * Tuân theo prefers-reduced-motion, quản lý vòng đời đúng cách.
 */

import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

// Danh sách các animation đang chạy để dọn dẹp khi cần
const activeAnimations: gsap.core.Animation[] = [];

export interface PageRevealOptions {
  container?: string;
}

export interface CardStaggerOptions {
  container?: string;
  item?: string;
}

export interface CounterOptions {
  start?: number;
  end: number;
  duration?: number;
  suffix?: string;
}

export function initPageReveal({
  container = ".sl-page-reveal",
}: PageRevealOptions = {}): void {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    document.querySelectorAll(container).forEach((el) => {
      (el as HTMLElement).style.opacity = "1";
      (el as HTMLElement).style.transform = "none";
    });
    return;
  }

  const els = Array.from(document.querySelectorAll(container));
  if (els.length === 0) return;
  els.forEach((el) => {
    gsap.set(el, { opacity: 0, y: 20 });
  });

  const anim = gsap.to(els, {
    opacity: 1,
    y: 0,
    duration: 0.6,
    stagger: 0.08,
    ease: "power3.out",
    clearProps: "all",
  });
  activeAnimations.push(anim);
}

export function initCardStagger({
  container = ".sl-card-stagger",
  item = ".sl-stagger-item",
}: CardStaggerOptions = {}): void {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    document.querySelectorAll(`${container} ${item}`).forEach((el) => {
      (el as HTMLElement).style.opacity = "1";
      (el as HTMLElement).style.transform = "none";
    });
    return;
  }

  const parent = document.querySelector(container);
  if (!parent) return;

  const items = Array.from(parent.querySelectorAll(item));
  if (items.length === 0) return;
  gsap.set(items, { opacity: 0, y: 15 });

  const anim = gsap.to(items, {
    scrollTrigger: {
      trigger: parent,
      start: "top 85%",
      toggleActions: "play none none reverse",
    },
    opacity: 1,
    y: 0,
    duration: 0.5,
    stagger: 0.06,
    ease: "power2.out",
  });
  activeAnimations.push(anim);
}

export function initCounter(element: HTMLElement, { start = 0, end = 0, duration = 1.2, suffix = "" }: CounterOptions = { end: 0 }): void {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    element.textContent = `${end}${suffix}`;
    return;
  }

  const anim = gsap.fromTo(
    element,
    { innerText: start },
    {
      innerText: end,
      duration,
      snap: { innerText: 1 },
      ease: "power2.out",
      onUpdate: () => {
        element.textContent = `${Math.floor(
          parseFloat(element.innerText)
        )}${suffix}`;
      },
    }
  );
  activeAnimations.push(anim);
}

export function animateButtonPress(button: HTMLElement): void {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  gsap.to(button, {
    scale: 0.95,
    duration: 0.1,
    yoyo: true,
    repeat: 1,
    ease: "power2.inOut",
  });
}

export function animateToastAppear(toastElement: HTMLElement): void {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  gsap.fromTo(
    toastElement,
    { x: 30, opacity: 0 },
    { x: 0, opacity: 1, duration: 0.3, ease: "power2.out" }
  );
}

export function animateModalOpen(modalElement: HTMLElement): void {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    modalElement.style.opacity = "1";
    modalElement.style.transform = "none";
    return;
  }
  gsap.fromTo(
    modalElement,
    { scale: 0.9, opacity: 0 },
    { scale: 1, opacity: 1, duration: 0.3, ease: "power2.out" }
  );
}

export function animateModalClose(
  modalElement: HTMLElement,
  onComplete?: () => void
): void {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    modalElement.style.opacity = "0";
    if (onComplete) onComplete();
    return;
  }
  gsap.to(modalElement, {
    scale: 0.9,
    opacity: 0,
    duration: 0.2,
    ease: "power2.in",
    onComplete,
  });
}

export function killAll(): void {
  activeAnimations.forEach((anim) => anim.kill());
  activeAnimations.length = 0;
  ScrollTrigger.getAll().forEach((st) => st.kill());
}
