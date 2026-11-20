import "../../styles/shared/skeleton.css";

export type SkeletonTone = "cream" | "amethyst" | "cool" | "dark";

export type SkeletonKind =
  | "quest-rows"
  | "streak-week"
  | "rank-rows"
  | "podium"
  | "lb-rows"
  | "shop-cards"
  | "inventory-rows"
  | "table-rows"
  | "session-cards"
  | "dungeon"
  | "badge-cards"
  | "cert-cards"
  | "vault-cards"
  | "flashcard"
  | "quiz"
  | "value";

export interface SkeletonOptions {
  count?: number;
  tone?: SkeletonTone;
  cols?: number;
  avatar?: boolean;
  overlay?: boolean;
}

function resolve(target: string | Element | null | undefined): HTMLElement | null {
  if (!target) return null;
  if (typeof target !== "string") return target as HTMLElement;
  return document.getElementById(target) ?? document.querySelector<HTMLElement>(target);
}

function line(width: string, height = 12, extra = ""): string {
  return `<span class="sk ${extra}" style="width:${width};height:${height}px"></span>`;
}

function circle(size: number): string {
  return `<span class="sk sk-circle" style="width:${size}px;height:${size}px"></span>`;
}

function pill(width: string, height = 22, extra = ""): string {
  return line(width, height, `sk-pill ${extra}`.trim());
}

function block(height: number): string {
  return `<span class="sk sk-block" style="width:100%;height:${height}px"></span>`;
}

function repeat(count: number, build: (index: number) => string): string {
  return Array.from({ length: count }, (_, index) => build(index)).join("");
}

function card(inner: string): string {
  return `<div class="sk-card">${inner}</div>`;
}

function template(kind: SkeletonKind, options: SkeletonOptions, tone: SkeletonTone): string {
  const count = options.count ?? 5;
  switch (kind) {
    case "quest-rows":
      return `<div class="sk-col" style="gap:14px">${repeat(options.count ?? 3, () =>
        `<div class="sk-row">${circle(26)}<div class="sk-col">${line("55%", 14)}${line("35%", 10)}</div></div>`,
      )}</div>`;
    case "streak-week":
      return `<div class="sk-streak">${repeat(7, () =>
        `<div class="sk-col">${line("22px", 8)}${circle(38)}</div>`,
      )}</div>`;
    case "rank-rows":
      return `<div class="sk-col" style="gap:12px">${repeat(count, () =>
        `<div class="sk-row">${line("22px", 14)}${circle(34)}${line("100%", 12, "sk-grow")}${pill("64px")}</div>`,
      )}</div>`;
    case "podium":
      return `<div class="sk-podium">${circle(76)}${line("65%", 16)}${line("45%", 11)}${pill("96px", 26)}<div class="sk-row" style="gap:18px;margin-top:6px">${repeat(3, () =>
        `<div class="sk-col sk-center" style="flex:none">${line("34px", 14)}${line("40px", 8)}</div>`,
      )}</div></div>`;
    case "lb-rows":
      return `<div class="sk-lb-rows">${repeat(count, () =>
        `<div class="sk-lb-row">${pill("44px", 18)}<div class="sk-row">${circle(36)}<div class="sk-col">${line("70%", 13)}${line("45%", 9)}</div></div>${pill("70%")}${pill("60%")}<div class="sk-col">${line("50%", 12)}${line("35%", 9)}</div>${line("65%", 14)}${line("28px", 12)}</div>`,
      )}</div>`;
    case "shop-cards":
      return `<div class="sk-cards">${repeat(options.count ?? 6, () =>
        card(`<div class="sk-row">${circle(52)}${pill("72px", 22, "sk-ml-auto")}</div>${line("65%", 18)}${line("90%", 11)}${line("55%", 11)}${pill("130px", 20)}${block(42)}`),
      )}</div>`;
    case "inventory-rows":
      return `<div class="sk-col" style="gap:10px">${repeat(options.count ?? 3, () =>
        `<div class="sk-row">${line("100%", 13, "sk-grow")}${pill("42px", 18)}</div>`,
      )}</div>`;
    case "table-rows": {
      const cols = options.cols ?? 4;
      const first = options.avatar
        ? `<div class="sk-row">${circle(30)}<div class="sk-col">${line("120px", 12)}${line("80px", 9)}</div></div>`
        : line("75%", 13);
      return repeat(options.count ?? 5, () =>
        `<tr class="sk-tr sk-tone-${tone}"><td>${first}</td>${repeat(cols - 1, () => `<td>${line("60%", 12)}</td>`)}</tr>`,
      );
    }
    case "session-cards":
      return `<div class="sk-sessions">${repeat(options.count ?? 8, () =>
        card(`<div class="sk-row">${pill("86px")}${pill("64px", 22, "sk-ml-auto")}</div><div class="sk-row">${circle(48)}<div class="sk-col">${line("80%", 16)}${line("55%", 11)}</div></div><div class="sk-row">${pill("104px", 24)}${pill("76px", 24)}</div>${block(42)}`),
      )}</div>`;
    case "dungeon":
      return `<div class="sk-dungeon">${repeat(5, () =>
        `<div class="sk-dungeon-stage">${pill("150px", 30)}${circle(88)}<div class="sk-dungeon-branches">${repeat(3, () => circle(62))}</div></div>`,
      )}</div>`;
    case "badge-cards":
      return `<div class="sk-cards">${repeat(options.count ?? 8, () =>
        card(`<div class="sk-col sk-center">${circle(54)}${line("70%", 14)}${line("90%", 10)}</div>`),
      )}</div>`;
    case "cert-cards":
      return `<div class="sk-cards">${repeat(options.count ?? 3, () =>
        card(`${circle(46)}${line("45%", 9)}${line("80%", 16)}${line("95%", 10)}${line("70%", 10)}${block(40)}`),
      )}</div>`;
    case "vault-cards":
      return `<div class="sk-cards">${repeat(options.count ?? 8, () =>
        card(`<div class="sk-row">${line("45%", 18)}${pill("58px", 22, "sk-ml-auto")}</div>${line("85%", 12)}${line("60%", 12)}<div class="sk-row">${pill("72px", 20)}${pill("92px", 20)}</div>`),
      )}</div>`;
    case "flashcard":
      return `<div class="sk-flashcard">${pill("90px", 22)}${line("55%", 30)}${line("35%", 14)}<div style="height:36px"></div>${line("75%", 14)}${line("50%", 12)}</div>`;
    case "quiz":
      return `<div class="sk-quiz">${line("80%", 18)}${line("60%", 12)}${repeat(4, () => block(46))}</div>`;
    case "value":
      return line("70%", 26);
  }
}

export function showSkeleton(
  target: string | Element | null | undefined,
  kind: SkeletonKind,
  options: SkeletonOptions = {},
): void {
  const element = resolve(target);
  if (!element) return;
  const tone = options.tone ?? "cream";
  const html = template(kind, options, tone);
  clearSkeleton(element);

  if (options.overlay) {
    if (getComputedStyle(element).position === "static") {
      element.style.position = "relative";
      element.dataset.skPosition = "1";
    }
    element.insertAdjacentHTML(
      "beforeend",
      `<div class="sk-wrap sk-overlay sk-tone-${tone}" data-sk-overlay aria-hidden="true">${html}</div>`,
    );
    element.dataset.skeletonOverlay = "1";
  } else if (element.tagName === "TBODY") {
    element.innerHTML = html;
  } else {
    element.innerHTML = `<div class="sk-wrap sk-tone-${tone}" aria-hidden="true">${html}</div>`;
  }
  element.dataset.skeleton = kind;
  element.setAttribute("aria-busy", "true");
}

export function clearSkeleton(target: string | Element | null | undefined): void {
  const element = resolve(target);
  if (!element || !element.dataset.skeleton) return;
  if (element.dataset.skeletonOverlay) {
    element.querySelector(":scope > [data-sk-overlay]")?.remove();
    delete element.dataset.skeletonOverlay;
    if (element.dataset.skPosition) {
      element.style.position = "";
      delete element.dataset.skPosition;
    }
  } else {
    element.innerHTML = "";
  }
  delete element.dataset.skeleton;
  element.removeAttribute("aria-busy");
}