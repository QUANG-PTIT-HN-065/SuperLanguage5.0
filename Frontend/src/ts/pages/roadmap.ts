import type { LearningPathTopic } from "../../types/home/learning-path-route";

export type RoadmapNodeState = "done" | "current" | "locked";

export interface RoadmapPoint {
  x: number;
  y: number;
}

export interface TopicLessonSlot {
  lessonId: number;
  label: string;
  ariaLabel: string;
}

export type TopicLessonState =
  | { status: "loading" }
  | { status: "ready"; slot: TopicLessonSlot | null }
  | { status: "empty"; message: string }
  | { status: "error"; message: string };

interface RoadmapNode {
  topic: LearningPathTopic;
  state: RoadmapNodeState;
  point: RoadmapPoint;
  length: number;
  group: SVGGElement;
  label: HTMLElement;
}

interface RoadmapInstance {
  container: HTMLElement;
  controller: AbortController;
  nodes: RoadmapNode[];
  endGroup: SVGGElement;
  endLabel: HTMLElement;
  endPoint: RoadmapPoint;
  endLength: number;
  wrapper: HTMLElement;
  scroller: HTMLElement;
  board: HTMLElement;
  svg: SVGSVGElement;
  guide: SVGPathElement;
  trail: SVGPathElement;
  runner: SVGGElement;
  popover: HTMLElement;
  sheet: HTMLElement;
  scrim: HTMLElement;
  tooltip: HTMLElement;
  live: HTMLElement;
  vertical: boolean;
  width: number;
  height: number;
  routeLength: number;
  samples: Array<{ x: number; y: number; length: number }>;
  progress: number;
  target: number;
  frame: number;
  timers: number[];
  surfaceFrame: number;
  openedAt: number;
  openTopicId: number;
  entryDone: boolean;
  topics: LearningPathTopic[];
  pathName: string;
}

const SVG_NS = "http://www.w3.org/2000/svg";
const LOCKED_HINT = "Cần đạt 4/4 để mở khóa chủ đề này";
const STATE_TEXT: Record<RoadmapNodeState, string> = {
  done: "đã hoàn thành",
  current: "đang mở",
  locked: "đã khoá",
};

const CHECK_PATHS = ["m5 12.6 4.6 4.6L19 7.4"];
const BOOK_PATHS = [
  "M12 6.6C10.4 5.1 8.3 4.5 4 4.7v12.8c4.3-.2 6.4.4 8 1.9 1.6-1.5 3.7-2.1 8-1.9V4.7c-4.3-.2-6.4.4-8 1.9Z",
  "M12 6.6v12.8",
];
const LOCK_PATHS = [
  "M7.6 10.4V8a4.4 4.4 0 0 1 8.8 0v2.4",
  "M5.9 10.4h12.2v8.3H5.9z",
  "M12 13.5v2.3",
];
const UNLOCK_PATHS = [
  "M7.6 10.4V8a4.4 4.4 0 0 1 8.5-1.5",
  "M5.9 10.4h12.2v8.3H5.9z",
  "M12 13.5v2.3",
];
const CHEST_PATHS = [
  "M4.4 10.6h15.2v8.2H4.4z",
  "M4.4 10.6c0-3.1 3.4-5.2 7.6-5.2s7.6 2.1 7.6 5.2",
  "M10.7 10.6h2.6v3h-2.6z",
];

const lessonStates = new Map<number, TopicLessonState>();
const previousStates = new WeakMap<HTMLElement, Map<number, RoadmapNodeState>>();
const previousProgress = new WeakMap<HTMLElement, number>();
const instances = new WeakMap<HTMLElement, RoadmapInstance>();
let active: RoadmapInstance | null = null;

function svgElement<K extends keyof SVGElementTagNameMap>(
  tag: K,
  className: string,
): SVGElementTagNameMap[K] {
  const element = document.createElementNS(SVG_NS, tag);
  element.setAttribute("class", className);
  return element;
}

function iconGroup(paths: string[], className: string): SVGGElement {
  const group = svgElement("g", className);
  group.setAttribute("fill", "none");
  group.setAttribute("stroke", "currentColor");
  group.setAttribute("stroke-width", "2.2");
  group.setAttribute("stroke-linecap", "round");
  group.setAttribute("stroke-linejoin", "round");
  group.setAttribute("aria-hidden", "true");
  for (const data of paths) {
    const path = svgElement("path", "");
    path.setAttribute("d", data);
    group.append(path);
  }
  return group;
}

function nodeState(topic: LearningPathTopic): RoadmapNodeState {
  if (topic.is_completed) return "done";
  return topic.is_locked ? "locked" : "current";
}

/** Toạ độ node suy từ mảng: zigzag ngang trên desktop, dọc trên mobile. */
export function layoutNodes(count: number, width: number, vertical: boolean): RoadmapPoint[] {
  const points: RoadmapPoint[] = [];
  if (vertical) {
    for (let index = 0; index < count; index += 1) {
      points.push({
        x: width * (index % 2 === 0 ? 0.3 : 0.7),
        y: 74 + index * 150,
      });
    }
    return points;
  }
  const pad = 84;
  const span = Math.max(width, count * 176) - pad * 2;
  const step = count > 1 ? span / (count - 1) : 0;
  for (let index = 0; index < count; index += 1) {
    points.push({
      x: pad + index * step,
      y: index % 2 === 0 ? 140 : 320,
    });
  }
  return points;
}

/** Đường bezier nối các node, không hard-code toạ độ. */
export function drawPath(points: RoadmapPoint[], vertical: boolean): string {
  const first = points[0];
  if (!first) return "";
  let data = `M${first.x} ${first.y}`;
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    if (!previous || !current) continue;
    if (vertical) {
      const middleY = (previous.y + current.y) / 2;
      data += ` C${previous.x} ${middleY} ${current.x} ${middleY} ${current.x} ${current.y}`;
    } else {
      const middleX = (previous.x + current.x) / 2;
      data += ` C${middleX} ${previous.y} ${middleX} ${current.y} ${current.x} ${current.y}`;
    }
  }
  return data;
}

export function setTopicLessonState(topicId: number, state: TopicLessonState): void {
  lessonStates.set(topicId, state);
  const instance = active;
  if (!instance || instance.openTopicId !== topicId) return;
  const node = instance.nodes.find((item) => item.topic.id === topicId);
  if (!node) return;
  const body = instance.vertical && isSheetMode() ? instance.sheet : instance.popover;
  refreshLessonList(body, node);
}

function isSheetMode(): boolean {
  return window.matchMedia("(max-width: 639.98px)").matches;
}

function easeOutCubic(value: number): number {
  return 1 - Math.pow(1 - value, 3);
}

function later(instance: RoadmapInstance, fn: () => void, ms: number): void {
  instance.timers.push(window.setTimeout(fn, ms));
}

function buildLegend(): HTMLElement {
  const legend = document.createElement("ul");
  legend.className = "roadmap-legend";
  legend.setAttribute("aria-label", "Chú giải trạng thái chủ đề");
  const entries: Array<{ state: RoadmapNodeState; paths: string[]; text: string }> = [
    { state: "done", paths: CHECK_PATHS, text: "Đã hoàn thành" },
    { state: "current", paths: BOOK_PATHS, text: "Đang mở" },
    { state: "locked", paths: LOCK_PATHS, text: "Đã khoá" },
  ];
  for (const entry of entries) {
    const item = document.createElement("li");
    item.className = `roadmap-legend__item is-${entry.state}`;
    const icon = document.createElementNS(SVG_NS, "svg");
    icon.setAttribute("viewBox", "0 0 24 24");
    icon.setAttribute("width", "14");
    icon.setAttribute("height", "14");
    icon.setAttribute("aria-hidden", "true");
    const group = iconGroup(entry.paths, "");
    icon.append(group);
    const text = document.createElement("span");
    text.textContent = entry.text;
    item.append(icon, text);
    legend.append(item);
  }
  return legend;
}

function buildNode(instance: RoadmapInstance, topic: LearningPathTopic, index: number): RoadmapNode {
  const state = nodeState(topic);
  const group = svgElement("g", "roadmap-node");
  group.dataset.topicId = String(topic.id);
  group.dataset.state = state;
  group.setAttribute("tabindex", "0");
  group.setAttribute("role", "button");
  group.setAttribute("aria-haspopup", "dialog");
  group.setAttribute(
    "aria-label",
    `${topic.name}: ${STATE_TEXT[state]}. ${
      state === "locked" ? `${LOCKED_HINT}.` : "Mở thẻ chủ đề để bắt đầu hoặc ôn từ vựng."
    }`,
  );

  const body = svgElement("g", "roadmap-node__body");
  const halo = svgElement("circle", "roadmap-node__halo");
  halo.setAttribute("r", "43");
  const ring = svgElement("circle", "roadmap-node__ring");
  ring.setAttribute("r", "34");
  const core = svgElement("circle", "roadmap-node__core");
  core.setAttribute("r", "28");
  const sheen = svgElement("circle", "roadmap-node__sheen");
  sheen.setAttribute("r", "28");
  sheen.setAttribute("fill", "url(#rm-sheen)");

  const icon = iconGroup(
    state === "done" ? CHECK_PATHS : state === "locked" ? LOCK_PATHS : BOOK_PATHS,
    "roadmap-node__icon",
  );
  icon.setAttribute("transform", "translate(-13 -13) scale(1.08)");
  const unlockIcon = iconGroup(UNLOCK_PATHS, "roadmap-node__unlock-icon");
  unlockIcon.setAttribute("transform", "translate(-13 -13) scale(1.08)");

  const burst = svgElement("g", "roadmap-node__burst");
  for (let ray = 0; ray < 8; ray += 1) {
    const angle = (Math.PI / 4) * ray;
    const line = svgElement("line", "");
    line.setAttribute("x1", String(Math.cos(angle) * 38));
    line.setAttribute("y1", String(Math.sin(angle) * 38));
    line.setAttribute("x2", String(Math.cos(angle) * 52));
    line.setAttribute("y2", String(Math.sin(angle) * 52));
    burst.append(line);
  }

  const badge = svgElement("circle", "roadmap-node__badge");
  badge.setAttribute("cx", "25");
  badge.setAttribute("cy", "-25");
  badge.setAttribute("r", "11");
  const badgeText = svgElement("text", "roadmap-node__index");
  badgeText.setAttribute("x", "25");
  badgeText.setAttribute("y", "-21");
  badgeText.setAttribute("text-anchor", "middle");
  badgeText.textContent = String(index + 1);

  body.append(halo, ring, core, sheen, icon, unlockIcon, burst, badge, badgeText);
  group.append(body);

  const label = document.createElement("div");
  label.className = "roadmap-label";
  label.dataset.state = state;
  label.textContent = topic.name;
  label.setAttribute("aria-hidden", "true");

  group.addEventListener("click", () => activateNode(instance, topic.id), {
    signal: instance.controller.signal,
  });
  group.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      activateNode(instance, topic.id);
      return;
    }
    const forward = event.key === "ArrowRight" || event.key === "ArrowDown";
    const backward = event.key === "ArrowLeft" || event.key === "ArrowUp";
    if (!forward && !backward) return;
    event.preventDefault();
    const position = instance.nodes.findIndex((item) => item.topic.id === topic.id);
    const next = instance.nodes[position + (forward ? 1 : -1)];
    next?.group.focus();
  }, { signal: instance.controller.signal });

  return { topic, state, point: { x: 0, y: 0 }, length: 0, group, label };
}

function buildEndNode(): { group: SVGGElement; label: HTMLElement } {
  const group = svgElement("g", "roadmap-node roadmap-node--end");
  group.setAttribute("role", "img");
  group.setAttribute("aria-label", "Đích đến của lộ trình");
  const body = svgElement("g", "roadmap-node__body");
  const ring = svgElement("circle", "roadmap-node__ring");
  ring.setAttribute("r", "30");
  const core = svgElement("circle", "roadmap-node__core");
  core.setAttribute("r", "24");
  const icon = iconGroup(CHEST_PATHS, "roadmap-node__icon");
  icon.setAttribute("transform", "translate(-12 -12)");
  body.append(ring, core, icon);
  group.append(body);
  const label = document.createElement("div");
  label.className = "roadmap-label roadmap-label--end";
  label.textContent = "Đích đến";
  label.setAttribute("aria-hidden", "true");
  return { group, label };
}

function lessonListFor(node: RoadmapNode): HTMLOListElement {
  const list = document.createElement("ol");
  list.className = "topic-lesson-list";
  list.dataset.topicId = String(node.topic.id);
  const state = lessonStates.get(node.topic.id) ?? { status: "loading" };
  if (state.status === "loading") list.setAttribute("aria-busy", "true");

  const row = document.createElement("li");
  row.className = "topic-lesson-row";
  if (state.status === "empty" || state.status === "error") {
    const message = document.createElement("span");
    message.className = `topic-lesson-empty${state.status === "error" ? " is-error" : ""}`;
    message.textContent = state.message;
    row.append(message);
  } else {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "study-primary-button topic-start-button";
    const slot = state.status === "ready" ? state.slot : null;
    if (state.status === "loading") {
      button.disabled = true;
      button.textContent = "Đang tải…";
    } else if (slot) {
      button.dataset.lessonId = String(slot.lessonId);
      button.textContent = slot.label;
      button.setAttribute("aria-label", slot.ariaLabel);
    } else {
      button.disabled = true;
      button.textContent = "Đã hết bài học";
    }
    row.append(button);
  }
  list.append(row);
  return list;
}

function refreshLessonList(body: HTMLElement, node: RoadmapNode): void {
  const current = body.querySelector<HTMLOListElement>(".topic-lesson-list");
  if (!current) return;
  const focusedLesson = document.activeElement instanceof HTMLButtonElement
    ? document.activeElement.dataset.lessonId
    : undefined;
  const next = lessonListFor(node);
  current.replaceWith(next);
  if (focusedLesson) {
    next.querySelector<HTMLButtonElement>(`[data-lesson-id="${focusedLesson}"]`)?.focus();
  }
}

function fillTopicBody(body: HTMLElement, instance: RoadmapInstance, node: RoadmapNode): void {
  body.replaceChildren();
  const head = document.createElement("div");
  head.className = "roadmap-popover__head";
  const stateChip = document.createElement("span");
  stateChip.className = "roadmap-popover__state";
  stateChip.dataset.state = node.state;
  stateChip.textContent = STATE_TEXT[node.state];
  const close = document.createElement("button");
  close.type = "button";
  close.className = "roadmap-popover__close";
  close.setAttribute("aria-label", "Đóng thẻ chủ đề");
  close.textContent = "×";
  close.addEventListener("click", () => closePopover(), { signal: instance.controller.signal });
  head.append(stateChip, close);

  const title = document.createElement("h3");
  title.className = "roadmap-popover__title";
  title.id = body.classList.contains("roadmap-sheet__body") ? "roadmapSheetTitle" : "roadmapPopoverTitle";
  title.textContent = node.topic.name;

  const description = document.createElement("p");
  description.className = "roadmap-popover__desc";
  description.textContent =
    node.topic.description || "Học từ vựng rồi làm bài trắc nghiệm 4 câu để mở chủ đề tiếp theo.";

  const meta = document.createElement("p");
  meta.className = "roadmap-popover__meta";
  const words = document.createElement("span");
  words.textContent = `${node.topic.word_count} từ`;
  const progress = document.createElement("span");
  progress.textContent = `${node.topic.progress_percent}%`;
  meta.append(words, progress);
  if (node.state === "done" && node.topic.quiz_question_count) {
    const score = document.createElement("span");
    score.textContent = `${node.topic.quiz_score ?? 0}/${node.topic.quiz_question_count} câu`;
    meta.append(score);
  }

  const review = document.createElement("a");
  review.className = "roadmap-popover__review";
  review.href = `../vocabulary/index.html?topic_id=${node.topic.id}&action=study`;
  review.textContent = "Ôn từ vựng";

  body.append(head, title, description, meta, lessonListFor(node), review);
}

function placePopover(instance: RoadmapInstance, node: RoadmapNode): void {
  const popover = instance.popover;
  popover.hidden = false;
  popover.classList.add("is-measuring");
  popover.classList.remove("is-open");
  const width = popover.offsetWidth;
  const height = popover.offsetHeight;
  const viewWidth = instance.scroller.clientWidth;
  const nodeX = node.point.x - instance.scroller.scrollLeft;
  const radius = 34;
  let left = nodeX - width / 2;
  left = Math.max(8, Math.min(viewWidth - width - 8, left));
  let top = node.point.y - radius - height - 16;
  let originY = height + 10;
  if (top < 6) {
    top = node.point.y + radius + 16;
    originY = -10;
  }
  const maxTop = instance.height - height - 8;
  if (top > maxTop) {
    top = Math.max(6, maxTop);
    originY = node.point.y - top;
  }
  popover.style.left = `${left}px`;
  popover.style.top = `${top}px`;
  popover.style.transformOrigin = `${nodeX - left}px ${originY}px`;
  popover.classList.remove("is-measuring");
  if (instance.surfaceFrame) window.cancelAnimationFrame(instance.surfaceFrame);
  instance.surfaceFrame = window.requestAnimationFrame(() => {
    instance.surfaceFrame = 0;
    popover.classList.add("is-open");
  });
}

/** Mở thẻ chủ đề: popover cạnh node trên desktop, bottom sheet dưới 640px. */
export function openPopover(topicId: number): void {
  const instance = active;
  if (!instance) return;
  const node = instance.nodes.find((item) => item.topic.id === topicId);
  if (!node) return;
  if (node.state === "locked") {
    rejectLocked(instance, node);
    return;
  }
  closePopover(false);
  instance.openTopicId = topicId;
  if (isSheetMode()) {
    instance.popover.classList.remove("is-open");
    instance.popover.hidden = true;
    const body = instance.sheet.querySelector<HTMLElement>(".roadmap-sheet__body");
    if (body) fillTopicBody(body, instance, node);
    instance.sheet.hidden = false;
    instance.scrim.hidden = false;
    instance.sheet.setAttribute("aria-labelledby", "roadmapSheetTitle");
    document.body.classList.add("roadmap-sheet-open");
    if (instance.surfaceFrame) window.cancelAnimationFrame(instance.surfaceFrame);
    instance.surfaceFrame = window.requestAnimationFrame(() => {
      instance.surfaceFrame = 0;
      instance.sheet.classList.add("is-open");
      instance.scrim.classList.add("is-open");
    });
    later(instance, () => {
      const focusTarget =
        instance.sheet.querySelector<HTMLButtonElement>(".topic-start-button:not([disabled])") ??
        instance.sheet.querySelector<HTMLButtonElement>(".roadmap-popover__close");
      focusTarget?.focus();
    }, 240);
  } else {
    instance.sheet.classList.remove("is-open");
    instance.scrim.classList.remove("is-open");
    instance.sheet.hidden = true;
    instance.scrim.hidden = true;
    const body = instance.popover.querySelector<HTMLElement>(".roadmap-popover__body");
    if (body) fillTopicBody(body, instance, node);
    instance.popover.setAttribute("aria-labelledby", "roadmapPopoverTitle");
    instance.openedAt = performance.now();
    placePopover(instance, node);
    later(instance, () => {
      const focusTarget =
        instance.popover.querySelector<HTMLButtonElement>(".topic-start-button:not([disabled])") ??
        instance.popover.querySelector<HTMLButtonElement>(".roadmap-popover__close");
      focusTarget?.focus();
    }, 200);
  }
}

export function closePopover(restoreFocus = true): void {
  const instance = active;
  if (!instance || !instance.openTopicId) return;
  const node = instance.nodes.find((item) => item.topic.id === instance.openTopicId);
  instance.openTopicId = 0;
  if (instance.surfaceFrame) window.cancelAnimationFrame(instance.surfaceFrame);
  instance.surfaceFrame = 0;
  instance.popover.classList.remove("is-open");
  instance.sheet.classList.remove("is-open");
  instance.scrim.classList.remove("is-open");
  document.body.classList.remove("roadmap-sheet-open");
  later(instance, () => {
    if (instance.openTopicId) return;
    instance.popover.hidden = true;
    instance.sheet.hidden = true;
    instance.scrim.hidden = true;
  }, 260);
  if (restoreFocus) node?.group.focus();
}

function rejectLocked(instance: RoadmapInstance, node: RoadmapNode): void {
  node.group.classList.remove("is-shaking");
  void node.group.getBoundingClientRect();
  node.group.classList.add("is-shaking");
  later(instance, () => node.group.classList.remove("is-shaking"), 340);

  const tooltip = instance.tooltip;
  tooltip.textContent = LOCKED_HINT;
  tooltip.hidden = false;
  const width = 232;
  const left = Math.max(8, Math.min(instance.width - width - 8, node.point.x - width / 2));
  let top = node.point.y - 34 - 60;
  if (top < 6) top = node.point.y + 34 + 14;
  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
  tooltip.classList.add("is-open");
  node.group.setAttribute("aria-describedby", "roadmapTooltip");
  instance.live.textContent = `${node.topic.name}: ${LOCKED_HINT}.`;
  later(instance, () => {
    tooltip.classList.remove("is-open");
    node.group.removeAttribute("aria-describedby");
    later(instance, () => {
      tooltip.hidden = true;
    }, 200);
  }, 2600);
}

function activateNode(instance: RoadmapInstance, topicId: number): void {
  if (instance.openTopicId === topicId) {
    closePopover();
    return;
  }
  openPopover(topicId);
}

function nearestLength(instance: RoadmapInstance, point: RoadmapPoint): number {
  let best = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const sample of instance.samples) {
    const distance = (sample.x - point.x) ** 2 + (sample.y - point.y) ** 2;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = sample.length;
    }
  }
  return best;
}

function paintProgress(instance: RoadmapInstance, length: number): void {
  instance.progress = length;
  instance.trail.style.strokeDashoffset = (instance.routeLength - length).toFixed(1);
  if (instance.routeLength > 0) {
    const point = instance.trail.getPointAtLength(Math.min(instance.routeLength, length));
    instance.runner.setAttribute("transform", `translate(${point.x} ${point.y})`);
  }
  for (const node of instance.nodes) {
    if (length >= node.length - 4) {
      node.group.classList.add("is-on");
      node.label.classList.add("is-on");
    }
  }
  if (length >= instance.endLength - 4) {
    instance.endGroup.classList.add("is-on");
    instance.endLabel.classList.add("is-on");
  }
}

/** Đèn chạy tới đâu node sáng tới đó; phần còn lại hiện dần theo nhịp stagger. */
function revealRemaining(instance: RoadmapInstance): void {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const pending: Array<{ group: SVGGElement; label: HTMLElement }> = [];
  for (const node of instance.nodes) {
    if (!node.group.classList.contains("is-on")) {
      pending.push({ group: node.group, label: node.label });
    }
  }
  if (!instance.endGroup.classList.contains("is-on")) {
    pending.push({ group: instance.endGroup, label: instance.endLabel });
  }
  if (!pending.length) return;
  pending.forEach((item, index) => {
    const delay = reduced ? 0 : index * 80;
    item.group.style.transitionDelay = `${delay}ms`;
    item.label.style.transitionDelay = `${delay + 40}ms`;
    item.group.classList.add("is-on");
    item.label.classList.add("is-on");
  });
  later(instance, () => {
    for (const item of pending) {
      item.group.style.transitionDelay = "";
      item.label.style.transitionDelay = "";
    }
  }, reduced ? 60 : pending.length * 80 + 500);
}

function travel(instance: RoadmapInstance, from: number, to: number, ms: number): void {
  if (instance.frame) window.cancelAnimationFrame(instance.frame);
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduced || ms <= 0 || to <= from || instance.routeLength <= 0) {
    paintProgress(instance, to);
    revealRemaining(instance);
    instance.runner.classList.add("is-idle");
    instance.entryDone = true;
    return;
  }
  instance.runner.classList.remove("is-idle");
  const start = performance.now();
  const step = (now: number): void => {
    const ratio = Math.min(1, (now - start) / ms);
    paintProgress(instance, from + (to - from) * easeOutCubic(ratio));
    if (ratio < 1) {
      instance.frame = window.requestAnimationFrame(step);
    } else {
      instance.frame = 0;
      instance.entryDone = true;
      instance.runner.classList.add("is-idle");
      revealRemaining(instance);
    }
  };
  instance.frame = window.requestAnimationFrame(step);
}

function updateGeometry(instance: RoadmapInstance): void {
  const width = instance.scroller.clientWidth;
  if (!width) return;
  instance.vertical = !window.matchMedia("(min-width: 768px)").matches;
  instance.wrapper.classList.toggle("is-vertical", instance.vertical);
  const nextWidth = instance.vertical ? width : Math.max(width, (instance.nodes.length + 1) * 176);
  const points = layoutNodes(instance.nodes.length + 1, nextWidth, instance.vertical);
  const nextHeight = instance.vertical ? (points.at(-1)?.y ?? 74) + 116 : 460;
  const resized = nextWidth !== instance.width || nextHeight !== instance.height;
  instance.width = nextWidth;
  instance.height = nextHeight;
  instance.board.style.width = `${instance.width}px`;
  instance.board.style.height = `${instance.height}px`;
  instance.svg.setAttribute("viewBox", `0 0 ${instance.width} ${instance.height}`);
  instance.svg.setAttribute("width", String(instance.width));
  instance.svg.setAttribute("height", String(instance.height));

  const data = drawPath(points, instance.vertical);
  instance.guide.setAttribute("d", data);
  instance.trail.setAttribute("d", data);
  instance.routeLength = data ? instance.trail.getTotalLength() : 0;
  instance.trail.style.strokeDasharray = `${instance.routeLength} ${instance.routeLength}`;

  instance.samples = [];
  if (instance.routeLength > 0) {
    for (let sample = 0; sample <= 240; sample += 1) {
      const length = (instance.routeLength * sample) / 240;
      const point = instance.trail.getPointAtLength(length);
      instance.samples.push({ x: point.x, y: point.y, length });
    }
  }

  instance.nodes.forEach((node, index) => {
    const point = points[index];
    if (!point) return;
    node.point = point;
    node.length = index === 0 ? 0 : nearestLength(instance, point);
    node.group.setAttribute("transform", `translate(${point.x} ${point.y})`);
    node.label.style.left = `${point.x - 72}px`;
    node.label.style.top = `${point.y + 46}px`;
  });
  const endPoint = points.at(-1);
  if (endPoint) {
    instance.endPoint = endPoint;
    instance.endLength = nearestLength(instance, endPoint);
    instance.endGroup.setAttribute("transform", `translate(${endPoint.x} ${endPoint.y})`);
    instance.endLabel.style.left = `${endPoint.x - 72}px`;
    instance.endLabel.style.top = `${endPoint.y + 42}px`;
  }

  const currentNode = instance.nodes.find((node) => node.state === "current");
  instance.target = instance.nodes.every((node) => node.state === "done")
    ? instance.routeLength
    : currentNode
      ? currentNode.length
      : 0;
  if (instance.entryDone) paintProgress(instance, instance.target);
  else if (resized && instance.frame) travel(instance, instance.progress, instance.target, 700);
}

function announceUnlock(instance: RoadmapInstance, node: RoadmapNode): void {
  node.group.classList.add("is-unlocking");
  instance.live.textContent = `Đã mở khoá chủ đề ${node.topic.name}. Tiếp tục học để giữ chuỗi ngày.`;
  later(instance, () => node.group.classList.remove("is-unlocking"), 1300);
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  later(instance, () => {
    node.group.scrollIntoView({
      behavior: reduced ? "auto" : "smooth",
      block: "center",
      inline: "center",
    });
  }, 260);
}

function teardown(instance: RoadmapInstance): void {
  instance.controller.abort();
  if (instance.frame) window.cancelAnimationFrame(instance.frame);
  if (instance.surfaceFrame) window.cancelAnimationFrame(instance.surfaceFrame);
  for (const timer of instance.timers) window.clearTimeout(timer);
  instance.sheet.remove();
  instance.scrim.remove();
  document.body.classList.remove("roadmap-sheet-open");
  if (active === instance) active = null;
}

export function renderRoadmap(
  container: HTMLElement,
  pathName: string,
  topics: LearningPathTopic[],
): void {
  const old = instances.get(container);
  const before = previousStates.get(container) ?? new Map<number, RoadmapNodeState>();
  const startProgress = previousProgress.get(container) ?? 0;
  if (old) teardown(old);
  container.replaceChildren();

  const controller = new AbortController();
  const wrapper = document.createElement("div");
  wrapper.className = "roadmap";
  wrapper.setAttribute("role", "region");
  wrapper.setAttribute("aria-label", `Bản đồ chủ đề của lộ trình ${pathName}`);

  const scroller = document.createElement("div");
  scroller.className = "roadmap__scroller";
  const board = document.createElement("div");
  board.className = "roadmap__board";

  const svg = svgElement("svg", "roadmap__svg");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  const defs = svgElement("defs", "");
  const glow = svgElement("filter", "");
  glow.setAttribute("id", "rm-glow");
  glow.setAttribute("x", "-60%");
  glow.setAttribute("y", "-60%");
  glow.setAttribute("width", "220%");
  glow.setAttribute("height", "220%");
  const blur = svgElement("feGaussianBlur", "");
  blur.setAttribute("stdDeviation", "3.4");
  blur.setAttribute("result", "soft");
  const merge = svgElement("feMerge", "");
  const mergeSoft = svgElement("feMergeNode", "");
  mergeSoft.setAttribute("in", "soft");
  const mergeSource = svgElement("feMergeNode", "");
  mergeSource.setAttribute("in", "SourceGraphic");
  merge.append(mergeSoft, mergeSource);
  glow.append(blur, merge);
  const sheen = svgElement("radialGradient", "");
  sheen.setAttribute("id", "rm-sheen");
  sheen.setAttribute("cx", "0.34");
  sheen.setAttribute("cy", "0.28");
  sheen.setAttribute("r", "0.9");
  const stopLight = svgElement("stop", "");
  stopLight.setAttribute("offset", "0");
  stopLight.setAttribute("stop-color", "#ffffff");
  stopLight.setAttribute("stop-opacity", "0.22");
  const stopDark = svgElement("stop", "");
  stopDark.setAttribute("offset", "1");
  stopDark.setAttribute("stop-color", "#ffffff");
  stopDark.setAttribute("stop-opacity", "0");
  sheen.append(stopLight, stopDark);
  defs.append(glow, sheen);

  const guide = svgElement("path", "roadmap__guide");
  guide.setAttribute("filter", "url(#rm-glow)");
  const trail = svgElement("path", "roadmap__trail");
  trail.setAttribute("filter", "url(#rm-glow)");
  const nodesGroup = svgElement("g", "roadmap__nodes");
  const runner = svgElement("g", "roadmap__runner");
  const runnerBob = svgElement("g", "roadmap__runner-bob");
  const runnerGlow = svgElement("circle", "roadmap__runner-glow");
  runnerGlow.setAttribute("r", "13");
  const runnerCore = svgElement("circle", "roadmap__runner-core");
  runnerCore.setAttribute("r", "6.5");
  const runnerSpark = svgElement("circle", "roadmap__runner-spark");
  runnerSpark.setAttribute("r", "2.4");
  runnerSpark.setAttribute("cx", "-2");
  runnerSpark.setAttribute("cy", "-2");
  runnerBob.append(runnerGlow, runnerCore, runnerSpark);
  runner.append(runnerBob);
  svg.append(defs, guide, trail, nodesGroup, runner);
  board.append(svg);

  const embers = document.createElement("div");
  embers.className = "roadmap__embers";
  embers.setAttribute("aria-hidden", "true");
  for (let index = 0; index < 7; index += 1) {
    const ember = document.createElement("span");
    ember.className = "roadmap__ember";
    ember.style.left = `${8 + index * 13}%`;
    ember.style.top = `${22 + ((index * 37) % 60)}%`;
    ember.style.animationDelay = `${index * 0.9}s`;
    ember.style.animationDuration = `${5 + (index % 3) * 1.6}s`;
    embers.append(ember);
  }
  board.append(embers);

  const hint = document.createElement("p");
  hint.className = "roadmap__hint";
  hint.textContent = "Đi theo ánh đèn tới chủ đề đang mở. Chọn node để bắt đầu hoặc ôn từ vựng.";
  board.append(hint);

  const popover = document.createElement("div");
  popover.className = "roadmap__popover";
  popover.setAttribute("role", "dialog");
  popover.setAttribute("aria-label", "Thẻ chủ đề");
  popover.hidden = true;
  const popoverBody = document.createElement("div");
  popoverBody.className = "roadmap-popover__body";
  popover.append(popoverBody);

  const tooltip = document.createElement("div");
  tooltip.className = "roadmap__tooltip";
  tooltip.id = "roadmapTooltip";
  tooltip.setAttribute("role", "tooltip");
  tooltip.hidden = true;
  board.append(tooltip);

  scroller.append(board);
  wrapper.append(scroller, buildLegend(), popover);

  const live = document.createElement("p");
  live.className = "sr-only";
  live.setAttribute("role", "status");
  live.setAttribute("aria-live", "polite");
  wrapper.append(live);
  container.append(wrapper);

  const sheet = document.createElement("div");
  sheet.className = "roadmap-sheet";
  sheet.setAttribute("role", "dialog");
  sheet.setAttribute("aria-modal", "true");
  sheet.setAttribute("aria-label", "Thẻ chủ đề");
  sheet.hidden = true;
  const sheetHandle = document.createElement("div");
  sheetHandle.className = "roadmap-sheet__handle";
  sheetHandle.setAttribute("aria-hidden", "true");
  const sheetBody = document.createElement("div");
  sheetBody.className = "roadmap-sheet__body";
  sheet.append(sheetHandle, sheetBody);
  const scrim = document.createElement("div");
  scrim.className = "roadmap-scrim";
  scrim.hidden = true;
  document.body.append(scrim, sheet);

  const instance: RoadmapInstance = {
    container,
    controller,
    nodes: [],
    endGroup: svgElement("g", ""),
    endLabel: document.createElement("div"),
    endPoint: { x: 0, y: 0 },
    endLength: 0,
    wrapper,
    scroller,
    board,
    svg,
    guide,
    trail,
    runner,
    popover,
    sheet,
    scrim,
    tooltip,
    live,
    vertical: false,
    width: 0,
    height: 0,
    routeLength: 0,
    samples: [],
    progress: 0,
    target: 0,
    frame: 0,
    timers: [],
    surfaceFrame: 0,
    openedAt: 0,
    openTopicId: 0,
    entryDone: false,
    topics,
    pathName,
  };

  if (!topics.length) {
    const empty = document.createElement("p");
    empty.className = "roadmap__empty";
    empty.textContent = "Lộ trình này chưa có chủ đề. Admin sẽ cập nhật sớm.";
    board.append(empty);
  }

  topics.forEach((topic, index) => {
    const node = buildNode(instance, topic, index);
    instance.nodes.push(node);
    nodesGroup.append(node.group);
    board.append(node.label);
    if (!topic.is_locked && !lessonStates.has(topic.id)) {
      lessonStates.set(topic.id, { status: "loading" });
    }
  });
  const end = buildEndNode();
  instance.endGroup = end.group;
  instance.endLabel = end.label;
  nodesGroup.append(end.group);
  board.append(end.label);

  instances.set(container, instance);
  active = instance;
  updateGeometry(instance);

  const unlocked = instance.nodes.filter(
    (node) => before.get(node.topic.id) === "locked" && node.state !== "locked",
  );
  const replayEntry = before.size === 0;
  if (replayEntry) {
    paintProgress(instance, 0);
    travel(instance, 0, instance.target, 1500);
  } else {
    instance.entryDone = true;
    paintProgress(instance, Math.min(startProgress, instance.routeLength));
    travel(instance, Math.min(startProgress, instance.routeLength), instance.target, 900);
    for (const node of unlocked) announceUnlock(instance, node);
  }
  previousStates.set(
    container,
    new Map(instance.nodes.map((node) => [node.topic.id, node.state])),
  );
  previousProgress.set(container, instance.target);

  const resizeObserver = new ResizeObserver(() => {
    updateGeometry(instance);
    if (instance.openTopicId) {
      const topicId = instance.openTopicId;
      closePopover(false);
      openPopover(topicId);
    }
  });
  resizeObserver.observe(scroller);
  controller.signal.addEventListener("abort", () => resizeObserver.disconnect(), { once: true });

  document.addEventListener(
    "pointerdown",
    (event) => {
      if (!instance.openTopicId) return;
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (popover.contains(target) || sheet.contains(target)) return;
      if (target instanceof Element && target.closest(".roadmap-node")) return;
      closePopover();
    },
    { signal: controller.signal },
  );
  document.addEventListener(
    "keydown",
    (event) => {
      if (event.key === "Escape" && instance.openTopicId) closePopover();
    },
    { signal: controller.signal },
  );
  document.addEventListener(
    "click",
    (event) => {
      if (!instance.openTopicId) return;
      const target = event.target;
      if (target instanceof Element && target.closest(".topic-start-button")) closePopover(false);
    },
    { signal: controller.signal },
  );
  scrim.addEventListener("click", () => closePopover(), { signal: controller.signal });
  sheet.addEventListener(
    "keydown",
    (event) => {
      if (event.key !== "Tab") return;
      const focusables = sheet.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
      );
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    },
    { signal: controller.signal },
  );
  scroller.addEventListener("scroll", () => {
    if (!instance.openTopicId || isSheetMode()) return;
    // Cuộn đưa node vào tầm nhìn trước khi bấm còn sự kiện trễ; đừng đóng thẻ vừa mở.
    if (performance.now() - instance.openedAt < 400) return;
    closePopover(false);
  }, { passive: true, signal: controller.signal });
}