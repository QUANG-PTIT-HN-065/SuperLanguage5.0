import { readMockData } from "../shared/api-client";
import { showToast } from "../../ts/ui/toast";

type PairSide = "word" | "meaning";

interface MatchingPair {
  id: string;
  word: string;
  meaning: string;
}

interface MatchingDemoData {
  pairs: MatchingPair[];
}

interface DragCandidate {
  source: HTMLButtonElement;
  pointerId: number;
  startX: number;
  startY: number;
  dragging: boolean;
  ghost: HTMLDivElement | null;
  dropTarget: HTMLButtonElement | null;
}

const launchButton = document.getElementById("openMatchingDemo") as HTMLButtonElement | null;
const quizWorkspace = document.getElementById("lessonWorkspace");
const demoPanel = document.getElementById("matchingDemo");
const demoTitle = document.getElementById("matchingDemoTitle") as HTMLElement | null;
const wordCards = document.getElementById("matchingWordCards");
const meaningCards = document.getElementById("matchingMeaningCards");
const columns = document.getElementById("matchingDemoColumns");
const progressTrack = document.getElementById("matchingDemoProgress");
const progressFill = document.getElementById("matchingDemoProgressFill");
const feedback = document.getElementById("matchingDemoFeedback");
const comboLabel = document.getElementById("matchingDemoCombo");
const mistakesLabel = document.getElementById("matchingDemoMistakes");
const completePanel = document.getElementById("matchingDemoComplete");
const completeTitle = document.getElementById("matchingDemoCompleteTitle") as HTMLElement | null;
const completeText = document.getElementById("matchingDemoCompleteText");

let demoData: MatchingDemoData | null = null;
let matchedPairs = new Set<string>();
let combo = 0;
let mistakes = 0;
let resolutionTimer = 0;
let resolving = false;
let dragCandidate: DragCandidate | null = null;
let suppressNextClick = false;

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object"
    ? value as Record<string, unknown>
    : {};
}

function parseDemoData(value: unknown): MatchingDemoData {
  const payload = asRecord(value);
  if (!Array.isArray(payload.pairs) || payload.pairs.length < 2) {
    throw new Error("Dữ liệu ghép cặp cần có ít nhất hai cặp từ và nghĩa.");
  }

  const ids = new Set<string>();
  const pairs = payload.pairs.map((item): MatchingPair => {
    const pair = asRecord(item);
    const id = typeof pair.id === "string" ? pair.id.trim() : "";
    const word = typeof pair.word === "string" ? pair.word.trim() : "";
    const meaning = typeof pair.meaning === "string" ? pair.meaning.trim() : "";
    if (!id || !word || !meaning || ids.has(id)) {
      throw new Error("Dữ liệu ghép cặp có cặp từ/nghĩa không hợp lệ.");
    }
    ids.add(id);
    return { id, word, meaning };
  });

  return { pairs };
}

function shuffle<T>(values: T[]): T[] {
  const shuffled = [...values];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const otherIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[otherIndex]] = [shuffled[otherIndex], shuffled[index]];
  }
  return shuffled;
}

function createCard(pair: MatchingPair, side: PairSide): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "matching-demo__card";
  button.dataset.pairId = pair.id;
  button.dataset.side = side;
  button.setAttribute("aria-pressed", "false");
  button.setAttribute("aria-label", `Chọn ${side === "word" ? "từ" : "nghĩa"}: ${side === "word" ? pair.word : pair.meaning}`);
  button.textContent = side === "word" ? pair.word : pair.meaning;
  return button;
}

function renderCards(): void {
  if (!demoData || !wordCards || !meaningCards) return;
  wordCards.replaceChildren(...shuffle(demoData.pairs).map((pair) => createCard(pair, "word")));
  meaningCards.replaceChildren(...shuffle(demoData.pairs).map((pair) => createCard(pair, "meaning")));
}

function setFeedback(message: string): void {
  if (feedback) feedback.textContent = message;
}

function updateProgress(): void {
  if (!demoData || !progressTrack || !progressFill) return;
  const percent = Math.round((matchedPairs.size / demoData.pairs.length) * 100);
  progressFill.style.width = `${percent}%`;
  progressTrack.setAttribute("aria-valuenow", String(percent));
  if (comboLabel) {
    comboLabel.textContent = combo > 0 ? `Combo ×${combo}` : "Combo 0";
    comboLabel.dataset.level = String(Math.min(combo, 5));
  }
  if (mistakesLabel) {
    mistakesLabel.textContent = `Lỗi: ${mistakes}`;
  }
}

function clearSelection(): void {
  for (const card of demoPanel?.querySelectorAll<HTMLButtonElement>(".matching-demo__card.is-selected") ?? []) {
    card.classList.remove("is-selected");
    card.setAttribute("aria-pressed", "false");
  }
}

function selectedCards(): HTMLButtonElement[] {
  return [...(demoPanel?.querySelectorAll<HTMLButtonElement>(".matching-demo__card.is-selected") ?? [])];
}

function cardFrom(target: EventTarget | null): HTMLButtonElement | null {
  if (!(target instanceof Element)) return null;
  const card = target.closest<HTMLButtonElement>(".matching-demo__card[data-pair-id]");
  return card && demoPanel?.contains(card) ? card : null;
}

function pairCards(first: HTMLButtonElement, second: HTMLButtonElement): void {
  const firstId = first.dataset.pairId;
  const secondId = second.dataset.pairId;
  const firstSide = first.dataset.side;
  const secondSide = second.dataset.side;
  if (
    resolving ||
    !firstId ||
    !secondId ||
    !firstSide ||
    !secondSide ||
    firstSide === secondSide ||
    matchedPairs.has(firstId) ||
    matchedPairs.has(secondId)
  ) {
    return;
  }

  clearSelection();
  resolving = true;

  if (firstId === secondId) {
    matchedPairs.add(firstId);
    combo += 1;
    first.setAttribute("aria-pressed", "false");
    second.setAttribute("aria-pressed", "false");
    first.disabled = true;
    second.disabled = true;
    first.classList.add("is-matched");
    second.classList.add("is-matched");
    updateProgress();
    setFeedback(`Chính xác! Combo ${combo}.`);
    resolutionTimer = window.setTimeout(() => {
      first.hidden = true;
      second.hidden = true;
      resolving = false;
      if (demoData && matchedPairs.size === demoData.pairs.length) {
        finishDemo();
      }
    }, motionFeedbackDelay());
    return;
  }

  first.classList.add("is-selected");
  first.setAttribute("aria-pressed", "true");
  second.classList.add("is-selected");
  second.setAttribute("aria-pressed", "true");
  mistakes += 1;
  combo = 0;
  first.classList.add("is-wrong");
  second.classList.add("is-wrong");
  updateProgress();
  setFeedback("Chưa khớp. Nhớ lại rồi thử thêm lần nữa.");
  resolutionTimer = window.setTimeout(() => {
    first.classList.remove("is-wrong");
    second.classList.remove("is-wrong");
    clearSelection();
    resolving = false;
  }, motionFeedbackDelay());
}

function motionFeedbackDelay(): number {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 440;
}

function selectCard(card: HTMLButtonElement): void {
  const pairId = card.dataset.pairId;
  const side = card.dataset.side;
  if (resolving || card.disabled || !pairId || matchedPairs.has(pairId)) return;
  const selected = selectedCards()[0];

  if (!selected) {
    card.classList.add("is-selected");
    card.setAttribute("aria-pressed", "true");
    setFeedback(side === "word" ? "Đã chọn một từ. Giờ chọn nghĩa tương ứng." : "Đã chọn một nghĩa. Giờ chọn từ tương ứng.");
    return;
  }

  if (selected === card) {
    clearSelection();
    setFeedback("Đã bỏ chọn. Chọn một từ và nghĩa để ghép.");
    return;
  }

  if (selected.dataset.side === side) {
    clearSelection();
    card.classList.add("is-selected");
    card.setAttribute("aria-pressed", "true");
    setFeedback(side === "word" ? "Đã đổi từ đã chọn. Chọn nghĩa tương ứng." : "Đã đổi nghĩa đã chọn. Chọn từ tương ứng.");
    return;
  }

  pairCards(selected, card);
}

function finishDemo(): void {
  if (!demoData || !columns || !completePanel || !completeTitle || !completeText) return;
  columns.hidden = true;
  completePanel.hidden = false;
  completeTitle.textContent = `Bạn đã ghép đủ ${demoData.pairs.length}/${demoData.pairs.length} cặp`;
  completeText.textContent = `${demoData.pairs.length} cặp đã ghép đúng · ${mistakes} lỗi. Đây chỉ là lượt thử, chưa cập nhật tiến độ hay XP.`;
  setFeedback("Hoàn thành lượt ghép cặp thử nghiệm.");
  completeTitle.focus();
}

function clearDrag(): void {
  if (!dragCandidate) return;
  dragCandidate.ghost?.remove();
  dragCandidate.dropTarget?.classList.remove("is-drop-target");
  dragCandidate.source.classList.remove("is-dragging");
  dragCandidate = null;
}

function resetRound(): void {
  window.clearTimeout(resolutionTimer);
  resolutionTimer = 0;
  resolving = false;
  matchedPairs = new Set();
  combo = 0;
  mistakes = 0;
  clearSelection();
  if (columns) columns.hidden = false;
  if (completePanel) completePanel.hidden = true;
  renderCards();
  updateProgress();
  setFeedback("Chọn một thẻ ở mỗi cột. Dùng Tab rồi Enter để chọn bằng bàn phím.");
}

async function openDemo(): Promise<void> {
  if (!launchButton || !quizWorkspace || !demoPanel) return;
  launchButton.disabled = true;
  try {
    if (!demoData) demoData = parseDemoData(await readMockData<unknown>("matching-pairs.json"));
    resetRound();
    quizWorkspace.hidden = true;
    demoPanel.hidden = false;
    demoTitle?.focus();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Không tải được dữ liệu thử nghiệm.";
    showToast({ type: "error", message });
  } finally {
    launchButton.disabled = false;
  }
}

function closeDemo(): void {
  if (!quizWorkspace || !demoPanel) return;
  window.clearTimeout(resolutionTimer);
  resolutionTimer = 0;
  resolving = false;
  clearDrag();
  demoPanel.hidden = true;
  quizWorkspace.hidden = false;
  document.getElementById("lessonTitle")?.focus();
}

function updateDropTarget(target: HTMLButtonElement | null): void {
  if (!dragCandidate) return;
  dragCandidate.dropTarget?.classList.remove("is-drop-target");
  dragCandidate.dropTarget = target;
  target?.classList.add("is-drop-target");
}

function onPointerDown(event: PointerEvent): void {
  if (event.pointerType === "touch" || !event.isPrimary || event.button !== 0 || resolving) return;
  const source = cardFrom(event.target);
  if (!source || source.disabled) return;
  dragCandidate = {
    source,
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    dragging: false,
    ghost: null,
    dropTarget: null,
  };
}

function onPointerMove(event: PointerEvent): void {
  if (!dragCandidate || dragCandidate.pointerId !== event.pointerId) return;
  if (!dragCandidate.dragging && Math.hypot(event.clientX - dragCandidate.startX, event.clientY - dragCandidate.startY) < 8) return;
  dragCandidate.dragging = true;
  event.preventDefault();

  if (!dragCandidate.ghost) {
    const ghost = document.createElement("div");
    ghost.className = "matching-demo__card matching-demo__drag-ghost";
    ghost.textContent = dragCandidate.source.textContent;
    ghost.setAttribute("aria-hidden", "true");
    document.body.append(ghost);
    dragCandidate.ghost = ghost;
    dragCandidate.source.classList.add("is-dragging");
  }

  dragCandidate.ghost.style.left = `${event.clientX + 14}px`;
  dragCandidate.ghost.style.top = `${event.clientY + 14}px`;
  const target = cardFrom(document.elementFromPoint(event.clientX, event.clientY));
  updateDropTarget(
    target &&
    target !== dragCandidate.source &&
    target.dataset.side !== dragCandidate.source.dataset.side &&
    !target.disabled
      ? target
      : null,
  );
}

function onPointerUp(event: PointerEvent): void {
  if (!dragCandidate || dragCandidate.pointerId !== event.pointerId) return;
  const candidate = dragCandidate;
  const dragged = candidate.dragging;
  const target = cardFrom(document.elementFromPoint(event.clientX, event.clientY));
  clearDrag();
  if (!dragged) return;

  event.preventDefault();
  suppressNextClick = true;
  window.setTimeout(() => { suppressNextClick = false; }, 0);
  if (
    target &&
    target !== candidate.source &&
    target.dataset.side !== candidate.source.dataset.side &&
    !target.disabled
  ) {
    pairCards(candidate.source, target);
  }
}

function onPointerCancel(event: PointerEvent): void {
  if (dragCandidate?.pointerId === event.pointerId) clearDrag();
}

function syncLaunchButton(): void {
  if (launchButton) launchButton.hidden = document.body.dataset.demo !== "true";
}

document.getElementById("openMatchingDemo")?.addEventListener("click", () => void openDemo());
document.getElementById("closeMatchingDemo")?.addEventListener("click", closeDemo);
document.getElementById("returnFromMatchingDemo")?.addEventListener("click", closeDemo);
document.getElementById("restartMatchingDemo")?.addEventListener("click", () => {
  resetRound();
  demoPanel?.querySelector<HTMLButtonElement>(".matching-demo__card:not([hidden])")?.focus();
});
demoPanel?.addEventListener("click", (event) => {
  if (suppressNextClick) return;
  const card = cardFrom(event.target);
  if (card) selectCard(card);
});
demoPanel?.addEventListener("pointerdown", onPointerDown);
document.addEventListener("pointermove", onPointerMove);
document.addEventListener("pointerup", onPointerUp);
document.addEventListener("pointercancel", onPointerCancel);

if (document.body.dataset.pageState === "ready") syncLaunchButton();
else window.addEventListener("learning:ready", syncLaunchButton, { once: true });
