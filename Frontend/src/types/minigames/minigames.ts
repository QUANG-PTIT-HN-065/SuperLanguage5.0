import { initializeLearnerHeader } from "../shared/learner-header";
import { initI18n, localeLabel, t, LOCALE_EVENT } from "../shared/i18n";

type HubGameState = "open" | "soon";

interface HubGame {
  id: string;
  icon: string;
  cover: string;
  state: HubGameState;
  href?: string;
  tags: string[];
}

const GAMES: HubGame[] = [
  {
    id: "sentenceQuest",
    icon: "fa-wand-magic-sparkles",
    cover: "cover-quest",
    state: "open",
    href: "../minigame/01_minigame.html",
    tags: ["tagWrite", "tagGrammar", "tagXp"],
  },
  {
    id: "wordRace",
    icon: "fa-bolt",
    cover: "cover-race",
    state: "soon",
    tags: ["tagReflex", "tagVocab"],
  },
  {
    id: "listenPicture",
    icon: "fa-headphones",
    cover: "cover-listen",
    state: "soon",
    tags: ["tagListening", "tagPronunciation"],
  },
  {
    id: "gapStory",
    icon: "fa-file-lines",
    cover: "cover-story",
    state: "soon",
    tags: ["tagReading", "tagContext"],
  },
];

const LANG_NAMES: Record<string, string> = { ja: "ja", en: "en", vi: "vi" };

let toastTimer: number | undefined;

function showToast(message: string): void {
  const toast = document.getElementById("hubToast");
  if (!(toast instanceof HTMLElement)) return;
  toast.textContent = message;
  toast.hidden = false;
  toast.classList.add("is-visible");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toast.classList.remove("is-visible");
    toast.hidden = true;
  }, 2600);
}

function createTag(label: string): HTMLElement {
  const tag = document.createElement("li");
  tag.className = "hub-tag";
  tag.textContent = label;
  return tag;
}

function createCard(game: HubGame): HTMLElement {
  const card = document.createElement("article");
  card.className = `hub-card is-${game.state}`;

  const cover = document.createElement("div");
  cover.className = `hub-card-cover ${game.cover}`;
  const icon = document.createElement("i");
  icon.className = `fa-solid ${game.icon}`;
  icon.setAttribute("aria-hidden", "true");
  const badge = document.createElement("span");
  badge.className = "hub-card-badge";
  badge.textContent = t(game.state === "open" ? "hub.badgeOpen" : "hub.badgeSoon");
  cover.append(icon, badge);

  const body = document.createElement("div");
  body.className = "hub-card-body";
  const title = document.createElement("h3");
  title.textContent = t(`hub.game.${game.id}`);
  const desc = document.createElement("p");
  desc.textContent = t(`hub.desc.${game.id}`);
  const tags = document.createElement("ul");
  tags.className = "hub-card-tags";
  game.tags.forEach((tag) => tags.append(createTag(t(`hub.${tag}`))));

  if (game.state === "open" && game.href) {
    const link = document.createElement("a");
    link.className = "hub-card-btn";
    link.href = game.href;
    link.textContent = t("hub.play");
    body.append(title, desc, tags, link);
    card.append(cover, body);
    return card;
  }

  const button = document.createElement("button");
  button.type = "button";
  button.className = "hub-card-btn is-soon";
  button.textContent = t("hub.notify");
  button.addEventListener("click", () => showToast(t("hub.lockedToast")));
  body.append(title, desc, tags, button);
  card.append(cover, body);
  return card;
}

function setText(id: string, value: string): void {
  const slot = document.getElementById(id);
  if (slot) slot.textContent = value;
}

function renderGrid(): void {
  const grid = document.getElementById("hubGrid");
  if (!(grid instanceof HTMLElement)) return;
  grid.replaceChildren(...GAMES.map(createCard));
  setText("hubOpenCount", String(GAMES.filter((game) => game.state === "open").length));
  setText("hubSoonCount", String(GAMES.filter((game) => game.state === "soon").length));
}

function renderLanguage(): void {
  const code = localStorage.getItem("slanguage_active_language") || "";
  setText("hubLangLabel", LANG_NAMES[code] ? localeLabel(LANG_NAMES[code]) : code.toUpperCase() || "—");
}

function bootstrap(): void {
  initI18n();
  void initializeLearnerHeader();
  renderGrid();
  renderLanguage();
  window.addEventListener(LOCALE_EVENT, () => {
    renderGrid();
    renderLanguage();
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootstrap);
} else {
  bootstrap();
}
