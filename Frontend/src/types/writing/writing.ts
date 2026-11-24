import { initializeLearnerHeader } from "../shared/learner-header";
import { slanguageApi } from "../shared/api-client";
import { initI18n, t, LOCALE_EVENT } from "../shared/i18n";

interface WritingTopic {
  title: string;
  prompt: string;
  min_words: number;
  checklist: string[];
}

interface WritingCriterion {
  name: string;
  score: number;
  comment: string;
}

interface WritingCorrection {
  original: string;
  corrected: string;
  issue: string;
}

interface WritingEvaluation {
  overall: number;
  criteria: WritingCriterion[];
  summary: string;
  corrections: WritingCorrection[];
  natural_version: string;
  next_step: string;
}

interface TopicsPayload {
  language: string;
  level: string;
  topics: WritingTopic[];
}

interface EvaluatePayload {
  evaluation: WritingEvaluation;
  word_count: number;
  xp: number;
}

const CEFR_LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"];
const JLPT_LEVELS = ["N5", "N4", "N3", "N2", "N1"];
const MIN_SUBMIT_WORDS = 20;
const TOPIC_COUNT = 4;

function levelsForLanguage(lang: string): string[] {
  return lang === "ja" ? JLPT_LEVELS : CEFR_LEVELS;
}

let language = "en";
let level = "A2";
let topics: WritingTopic[] = [];
let selected: WritingTopic | null = null;
let busy = false;

let toastTimer: number | undefined;

function el<T extends HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
}

function showToast(message: string): void {
  const toast = el<HTMLElement>("writingToast");
  if (!toast) return;
  toast.textContent = message;
  toast.hidden = false;
  toast.classList.add("is-visible");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toast.classList.remove("is-visible");
    toast.hidden = true;
  }, 3200);
}

function wordCount(text: string): number {
  const t = text.trim();
  if (!t) return 0;
  //CJK (Nhật/Trung/Hàn) không tách bằng dấu cách -> đếm theo ký tự + từ latin còn lại.
  if (language === "ja" || language === "zh" || language === "ko") {
    const cjk = (t.match(/[぀-ヿㇰ-ㇿ一-鿿가-힯]/g) || []).length;
    const latin = (t.match(/[A-Za-z0-9À-ỹ]+/g) || []).length;
    return cjk + latin;
  }
  return t.split(/\s+/).length;
}

function updateCounter(): void {
  const area = el<HTMLTextAreaElement>("writingText");
  const slot = el<HTMLElement>("writingCount");
  if (!area || !slot) return;
  const count = wordCount(area.value);
  const target = selected?.min_words ?? 60;
  slot.textContent = `${count} / ${target}`;
  slot.classList.toggle("is-enough", count >= target);
}

function renderLevels(): void {
  const wrap = el<HTMLElement>("writingLevels");
  if (!wrap) return;
  const chips = levelsForLanguage(language).map((code) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = `writing-level${code === level ? " is-active" : ""}`;
    chip.textContent = code;
    chip.addEventListener("click", () => {
      if (busy || code === level) return;
      level = code;
      renderLevels();
      void loadTopics();
    });
    return chip;
  });
  wrap.replaceChildren(...chips);
}

function renderBrief(): void {
  const brief = el<HTMLElement>("writingBrief");
  if (!brief) return;
  if (!selected) {
    brief.replaceChildren();
    return;
  }
  const title = document.createElement("h2");
  title.className = "writing-brief-title";
  title.textContent = selected.title;

  const prompt = document.createElement("p");
  prompt.className = "writing-brief-prompt";
  prompt.textContent = selected.prompt;

  const meta = document.createElement("div");
  meta.className = "writing-brief-meta";
  const target = document.createElement("span");
  target.className = "writing-brief-min";
  target.textContent = t("wr.minWords", { count: selected.min_words });
  meta.append(target);

  const list = document.createElement("ul");
  list.className = "writing-brief-checklist";
  (selected.checklist ?? []).forEach((item) => {
    const li = document.createElement("li");
    li.textContent = item;
    list.append(li);
  });

  brief.replaceChildren(title, prompt, meta, list);
  updateCounter();
}

function renderTopics(): void {
  const wrap = el<HTMLElement>("writingTopics");
  if (!wrap) return;
  if (!topics.length) {
    const empty = document.createElement("p");
    empty.className = "writing-empty";
    empty.textContent = t("wr.noTopics");
    wrap.replaceChildren(empty);
    return;
  }
  const cards = topics.map((topic) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = `writing-topic${topic === selected ? " is-active" : ""}`;
    const title = document.createElement("span");
    title.className = "writing-topic-title";
    title.textContent = topic.title;
    const desc = document.createElement("span");
    desc.className = "writing-topic-desc";
    desc.textContent = topic.prompt;
    const target = document.createElement("span");
    target.className = "writing-topic-min";
    target.textContent = t("wr.minWordsShort", { count: topic.min_words });
    card.append(title, desc, target);
    card.addEventListener("click", () => {
      selected = topic;
      renderTopics();
      renderBrief();
    });
    return card;
  });
  wrap.replaceChildren(...cards);
}

function topicState(message: string): void {
  const wrap = el<HTMLElement>("writingTopics");
  if (!wrap) return;
  const note = document.createElement("p");
  note.className = "writing-empty";
  note.textContent = message;
  wrap.replaceChildren(note);
}

async function loadTopics(): Promise<void> {
  busy = true;
  topicState(t("wr.loadingTopics"));
  try {
    const response = await slanguageApi<TopicsPayload>(
      `/api/v1/writing/topics?language=${encodeURIComponent(language)}&level=${encodeURIComponent(level)}&count=${TOPIC_COUNT}`,
      { method: "GET" },
    );
    topics = Array.isArray(response.data?.topics) ? response.data.topics : [];
    selected = topics[0] ?? null;
    renderTopics();
    renderBrief();
  } catch (error) {
    topics = [];
    selected = null;
    topicState(error instanceof Error ? error.message : t("wr.error"));
    renderBrief();
  } finally {
    busy = false;
  }
}

function scoreBand(score: number): string {
  if (score >= 8) return "is-high";
  if (score >= 5) return "is-mid";
  return "is-low";
}

function renderReport(payload: EvaluatePayload): void {
  const panel = el<HTMLElement>("writingReport");
  if (!panel) return;
  const evaluation = payload.evaluation;

  const head = document.createElement("header");
  head.className = "writing-panel-head";
  const heading = document.createElement("h2");
  heading.textContent = t("wr.reportTitle");
  head.append(heading);

  const scoreRow = document.createElement("div");
  scoreRow.className = "writing-score-row";
  const score = document.createElement("div");
  score.className = `writing-score ${scoreBand(evaluation.overall)}`;
  const scoreValue = document.createElement("strong");
  scoreValue.textContent = `${evaluation.overall}`;
  const scoreMax = document.createElement("span");
  scoreMax.textContent = "/10";
  score.append(scoreValue, scoreMax);

  const summary = document.createElement("p");
  summary.className = "writing-summary";
  summary.textContent = evaluation.summary;
  scoreRow.append(score, summary);

  const criteria = document.createElement("ul");
  criteria.className = "writing-criteria";
  (evaluation.criteria ?? []).forEach((item) => {
    const li = document.createElement("li");
    li.className = `writing-criterion ${scoreBand(item.score)}`;
    const top = document.createElement("div");
    top.className = "writing-criterion-top";
    const name = document.createElement("span");
    name.className = "writing-criterion-name";
    name.textContent = item.name;
    const value = document.createElement("span");
    value.className = "writing-criterion-value";
    value.textContent = `${item.score}/10`;
    top.append(name, value);
    const bar = document.createElement("div");
    bar.className = "writing-bar";
    const fill = document.createElement("i");
    fill.className = "writing-bar-fill";
    fill.style.width = `${Math.max(0, Math.min(100, item.score * 10))}%`;
    bar.append(fill);
    const comment = document.createElement("p");
    comment.className = "writing-criterion-comment";
    comment.textContent = item.comment;
    li.append(top, bar, comment);
    criteria.append(li);
  });

  const blocks: HTMLElement[] = [head, scoreRow, criteria];

  const corrections = evaluation.corrections ?? [];
  if (corrections.length) {
    const section = document.createElement("section");
    section.className = "writing-corrections";
    const title = document.createElement("h3");
    title.textContent = t("wr.corrections");
    const list = document.createElement("ul");
    corrections.forEach((item) => {
      const li = document.createElement("li");
      if (item.original) {
        const wrong = document.createElement("del");
        wrong.className = "writing-fix-wrong";
        wrong.textContent = item.original;
        li.append(wrong);
      }
      const right = document.createElement("ins");
      right.className = "writing-fix-right";
      right.textContent = item.corrected || item.original;
      li.append(right);
      if (item.issue) {
        const issue = document.createElement("span");
        issue.className = "writing-fix-issue";
        issue.textContent = item.issue;
        li.append(issue);
      }
      list.append(li);
    });
    section.append(title, list);
    blocks.push(section);
  }

  if (evaluation.natural_version) {
    const section = document.createElement("section");
    section.className = "writing-natural";
    const title = document.createElement("h3");
    title.textContent = t("wr.natural");
    const body = document.createElement("p");
    body.textContent = evaluation.natural_version;
    section.append(title, body);
    blocks.push(section);
  }

  const footer = document.createElement("div");
  footer.className = "writing-report-foot";
  const next = document.createElement("p");
  next.className = "writing-next";
  next.textContent = evaluation.next_step ? `${t("wr.nextStep")}: ${evaluation.next_step}` : "";
  const xp = document.createElement("span");
  xp.className = "writing-xp";
  xp.textContent = payload.xp ? t("wr.xpEarned", { xp: payload.xp }) : t("wr.xpNone");
  footer.append(next, xp);

  blocks.push(footer);

  panel.hidden = false;
  panel.replaceChildren(...blocks);
  panel.scrollIntoView({ behavior: "smooth", block: "start" });
}

function setSubmitState(active: boolean): void {
  const button = el<HTMLButtonElement>("writingSubmit");
  if (!button) return;
  button.disabled = active;
  const label = button.querySelector("span");
  if (label) label.textContent = active ? t("wr.grading") : t("wr.submit");
}

function renderGrading(): void {
  const panel = el<HTMLElement>("writingReport");
  if (!panel) return;
  const head = document.createElement("header");
  head.className = "writing-panel-head";
  const heading = document.createElement("h2");
  heading.textContent = t("wr.reportTitle");
  head.append(heading);

  const box = document.createElement("div");
  box.className = "writing-grading";
  box.setAttribute("role", "status");
  const spinner = document.createElement("span");
  spinner.className = "writing-spinner";
  spinner.setAttribute("aria-hidden", "true");
  const label = document.createElement("p");
  label.className = "writing-grading-label";
  label.textContent = t("wr.grading");
  const bars = document.createElement("div");
  bars.className = "writing-grading-bars";
  [85, 62, 74].forEach((width) => {
    const bar = document.createElement("i");
    bar.style.width = `${width}%`;
    bars.append(bar);
  });
  box.append(spinner, label, bars);

  panel.hidden = false;
  panel.replaceChildren(head, box);
  panel.scrollIntoView({ behavior: "smooth", block: "start" });
}

function resetReportPanel(): void {
  const panel = el<HTMLElement>("writingReport");
  if (!panel) return;
  panel.replaceChildren();
  panel.hidden = true;
}

async function submit(): Promise<void> {
  if (busy) return;
  const area = el<HTMLTextAreaElement>("writingText");
  if (!area || !selected) {
    showToast(t("wr.pickTopic"));
    return;
  }
  const text = area.value.trim();
  if (wordCount(text) < MIN_SUBMIT_WORDS) {
    showToast(t("wr.tooShort", { count: MIN_SUBMIT_WORDS }));
    return;
  }

  busy = true;
  setSubmitState(true);
  renderGrading();
  try {
    const response = await slanguageApi<EvaluatePayload>("/api/v1/writing/evaluate", {
      method: "POST",
      body: {
        language,
        level,
        topic_title: selected.title,
        topic_prompt: selected.prompt,
        text,
      },
    });
    renderReport(response.data);
    showToast(
      response.data.xp
        ? t("wr.xpEarned", { xp: response.data.xp })
        : t("wr.gradingDone"),
    );
  } catch (error) {
    resetReportPanel();
    showToast(error instanceof Error ? error.message : t("wr.error"));
  } finally {
    busy = false;
    setSubmitState(false);
  }
}

async function loadLearnerDefaults(): Promise<void> {
  const stored = localStorage.getItem("slanguage_active_language");
  try {
    const response = await slanguageApi<{
      profile?: { target_language?: string | null; target_level?: string | null };
    }>("/api/v1/me", { method: "GET" });
    const profile = response.data?.profile ?? {};
    language = String(profile.target_language || stored || "en");
    const profileLevel = String(profile.target_level || "").toUpperCase();
    if (levelsForLanguage(language).includes(profileLevel)) level = profileLevel;
  } catch {
    language = stored || "en";
  }
  if (!levelsForLanguage(language).includes(level)) level = levelsForLanguage(language)[0];
}

function bind(): void {
  const area = el<HTMLTextAreaElement>("writingText");
  area?.addEventListener("input", updateCounter);
  el<HTMLButtonElement>("writingSubmit")?.addEventListener("click", () => void submit());
  el<HTMLButtonElement>("writingRefresh")?.addEventListener("click", () => void loadTopics());
}

async function bootstrap(): Promise<void> {
  initI18n();
  void initializeLearnerHeader();
  renderLevels();
  bind();
  await loadLearnerDefaults();
  renderLevels();
  await loadTopics();
  updateCounter();
  window.addEventListener(LOCALE_EVENT, () => {
    renderLevels();
    renderBrief();
    renderTopics();
    updateCounter();
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => void bootstrap());
} else {
  void bootstrap();
}
