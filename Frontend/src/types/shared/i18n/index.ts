import { vi } from './vi';
import { en } from './en';
import { ja } from './ja';
import { vi as homeVi, en as homeEn, ja as homeJa } from './pages/home';
import { vi as learnVi, en as learnEn, ja as learnJa } from './pages/learn';
import { vi as vocabVi, en as vocabEn, ja as vocabJa } from './pages/vocab';
import { vi as aiVi, en as aiEn, ja as aiJa } from './pages/ai';
import { vi as boardVi, en as boardEn, ja as boardJa } from './pages/board';
import { vi as shopVi, en as shopEn, ja as shopJa } from './pages/shop';
import { vi as roadmapVi, en as roadmapEn, ja as roadmapJa } from './pages/roadmap';

export type UiLocale = 'vi' | 'en' | 'ja';
export const UI_LOCALES: UiLocale[] = ['vi', 'en', 'ja'];
const STORAGE_KEY = 'slanguage_ui_locale';
const DICTS: Record<UiLocale, Record<string, string>> = {
  vi: { ...vi, ...homeVi, ...learnVi, ...vocabVi, ...aiVi, ...boardVi, ...shopVi, ...roadmapVi },
  en: { ...en, ...homeEn, ...learnEn, ...vocabEn, ...aiEn, ...boardEn, ...shopEn, ...roadmapEn },
  ja: { ...ja, ...homeJa, ...learnJa, ...vocabJa, ...aiJa, ...boardJa, ...shopJa, ...roadmapJa },
};

export const LOCALE_EVENT = 'slanguage:locale';

export function getLocale(): UiLocale {
  const stored = localStorage.getItem(STORAGE_KEY);
  return UI_LOCALES.includes(stored as UiLocale) ? (stored as UiLocale) : 'vi';
}

export function t(key: string, vars?: Record<string, string | number>): string {
  const locale = getLocale();
  let text = DICTS[locale][key] ?? DICTS.vi[key] ?? key;
  if (vars) {
    for (const [name, value] of Object.entries(vars)) {
      text = text.split(`{${name}}`).join(String(value));
    }
  }
  return text;
}

export function localeLabel(code: string): string {
  return t(`lang.${code}`);
}

function setTextPreserveChildren(el: Element, text: string): void {
  const textNodes = Array.from(el.childNodes).filter((n) => n.nodeType === Node.TEXT_NODE);
  if (textNodes.length) {
    const lead = (textNodes[0].nodeValue ?? '').match(/^\s*/)?.[0] ?? '';
    textNodes[0].nodeValue = lead + text;
    for (let i = 1; i < textNodes.length; i += 1) textNodes[i].nodeValue = '';
  } else {
    el.appendChild(document.createTextNode(text));
  }
}

export function applyI18n(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => {
    setTextPreserveChildren(el, t(el.dataset.i18n as string));
  });
  root.querySelectorAll<HTMLElement>('[data-i18n-placeholder]').forEach((el) => {
    el.setAttribute('placeholder', t(el.dataset.i18nPlaceholder as string));
  });
  root.querySelectorAll<HTMLElement>('[data-i18n-title]').forEach((el) => {
    el.setAttribute('title', t(el.dataset.i18nTitle as string));
  });
  root.querySelectorAll<HTMLElement>('[data-i18n-aria-label]').forEach((el) => {
    el.setAttribute('aria-label', t(el.dataset.i18nAriaLabel as string));
  });
}

const NAV_KEYS: [string, string][] = [
  ['home/index.html', 'nav.home'],
  ['select-lesson/index.html', 'nav.learn'],
  ['vocabulary/index.html', 'nav.vocab'],
  ['ai-practice/index.html', 'nav.ai'],
  ['leaderboard/index.html', 'nav.board'],
];

const MENU_KEYS: [string, string, string][] = [
  ['profile/index.html', 'menu.profile', 'menu.profileSub'],
  ['#tabProgress', 'menu.progress', 'menu.progressSub'],
  ['shop/index.html', 'menu.shop', 'menu.shopSub'],
];

export function translateShell(root: ParentNode = document): void {
  // Link tới chính trang hiện tại thường là "./index.html" — phải resolve về
  // pathname tuyệt đối mới khớp khóa dịch của navbar/menu.
  const resolvedHref = (href: string): string => {
    if (href.startsWith('#')) return href;
    try {
      return new URL(href, document.baseURI).pathname;
    } catch {
      return href;
    }
  };

  root.querySelectorAll<HTMLAnchorElement>('.nav-links a').forEach((link) => {
    const href = resolvedHref(link.getAttribute('href') ?? '');
    const match = NAV_KEYS.find(([needle]) => href.includes(needle));
    if (match) setTextPreserveChildren(link, t(match[1]));
  });

  const chipTitles: [string, string][] = [
    ['.stat-chip.streak', 'chip.streak'],
    ['.stat-chip.xp', 'chip.xp'],
    ['.stat-chip.hearts', 'chip.hearts'],
  ];
  chipTitles.forEach(([selector, key]) => {
    root.querySelector(selector)?.setAttribute('title', t(key));
  });

  const langButton = root.querySelector('#langDropdownBtn');
  langButton?.setAttribute('title', t('shell.langTitle'));

  UI_LOCALES.forEach((code) => {
    root.querySelectorAll<HTMLElement>(`.lang-dropdown-item[data-lang="${code}"] .lang-name, .menu-item[data-lang="${code}"] .lang-name`).forEach((el) => {
      setTextPreserveChildren(el, localeLabel(code));
    });
  });
  const currentLabel = root.querySelector('#currentLangLabel');
  if (currentLabel) currentLabel.textContent = localeLabel(getLocale());
  const currentFlag = root.querySelector<HTMLImageElement>('#currentLangFlag');
  if (currentFlag) currentFlag.alt = localeLabel(getLocale());
  root.querySelectorAll<HTMLElement>('.lang-dropdown-item, .menu-item[data-lang]').forEach((item) => {
    const selected = item.dataset.lang === getLocale();
    item.classList.toggle('active', selected);
    item.classList.toggle('is-selected', selected);
    if (selected) item.setAttribute('aria-current', 'true');
    else item.removeAttribute('aria-current');
  });

  root.querySelectorAll<HTMLAnchorElement>('.user-dropdown-item').forEach((item) => {
    const href = resolvedHref(item.getAttribute('href') ?? '');
    if (item.id === 'navLogoutItem' || href.includes('login/index.html')) {
      const title = item.querySelector('.title');
      const sub = item.querySelector('.sub');
      if (title) title.textContent = t('menu.logout');
      if (sub) sub.textContent = t('menu.logoutSub');
      return;
    }
    const match = MENU_KEYS.find(([needle]) => href.includes(needle));
    if (!match) return;
    const title = item.querySelector('.title');
    const sub = item.querySelector('.sub');
    if (title) title.textContent = t(match[1]);
    if (sub) sub.textContent = t(match[2]);
  });

  const role = root.querySelector('.user-info-text .role');
  if (role) role.textContent = t('role.learner');
  const guestLogin = root.querySelector('.nav-auth-login');
  if (guestLogin) guestLogin.textContent = t('guest.login');
  const guestRegister = root.querySelector('.nav-auth-register');
  if (guestRegister) guestRegister.textContent = t('guest.register');
}

export function setLocale(locale: UiLocale): void {
  localStorage.setItem(STORAGE_KEY, locale);
  document.documentElement.lang = locale;
  translateShell();
  applyI18n();
  window.dispatchEvent(new CustomEvent(LOCALE_EVENT, { detail: { locale } }));
}

export function initI18n(): void {
  document.documentElement.lang = getLocale();
  translateShell();
  applyI18n();
}