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
import { vi as hubVi, en as hubEn, ja as hubJa } from './pages/hub';
import { vi as writingVi, en as writingEn, ja as writingJa } from './pages/writing';

export type UiLocale = 'vi' | 'en' | 'ja';
export const UI_LOCALES: UiLocale[] = ['vi', 'en', 'ja'];
const STORAGE_KEY = 'slanguage_ui_locale';
const DICTS: Record<UiLocale, Record<string, string>> = {
  vi: { ...vi, ...homeVi, ...learnVi, ...vocabVi, ...aiVi, ...boardVi, ...shopVi, ...roadmapVi, ...hubVi, ...writingVi },
  en: { ...en, ...homeEn, ...learnEn, ...vocabEn, ...aiEn, ...boardEn, ...shopEn, ...roadmapEn, ...hubEn, ...writingEn },
  ja: { ...ja, ...homeJa, ...learnJa, ...vocabJa, ...aiJa, ...boardJa, ...shopJa, ...roadmapJa, ...hubJa, ...writingJa },
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
  ['minigames/index.html', 'nav.minigame'],
  ['leaderboard/index.html', 'nav.board'],
];

const MENU_KEYS: [string, string, string][] = [
  ['profile/index.html', 'menu.profile', 'menu.profileSub'],
  ['#tabProgress', 'menu.progress', 'menu.progressSub'],
  ['shop/index.html', 'menu.shop', 'menu.shopSub'],
];

// [needle trong href, khóa tiêu đề, khóa mô tả (rỗng nếu chỉ có tiêu đề)]
const SHELL_LINKS: [string, string, string][] = [
  ['home/index.html', 'nav.home', ''],
  ['roadmap/index.html', 'nav.newLesson', 'nav.newLessonDesc'],
  ['vocabulary/index.html', 'nav.vocabTrain', 'nav.vocabTrainDesc'],
  ['ai-practice/index.html', 'nav.aiTrain', 'nav.aiTrainDesc'],
  ['writing/index.html', 'nav.write', 'nav.writeDesc'],
  ['minigames/index.html', 'nav.minigame', ''],
  ['leaderboard/index.html', 'nav.board', ''],
  ['profile/index.html', 'menu.profile', ''],
  ['shop/index.html', 'menu.shop', ''],
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
    // Mục dropdown "Học tập" đã có tiêu đề + mô tả riêng (dịch ở khối dưới);
    // nếu gắn nhãn ngắn vào đây sẽ sinh text node thừa ngay trong link.
    if (link.closest('.nav-dropdown-menu')) return;
    const href = resolvedHref(link.getAttribute('href') ?? '');
    const match = NAV_KEYS.find(([needle]) => href.includes(needle));
    if (match) setTextPreserveChildren(link, t(match[1]));
  });

  // Nhóm "Học tập": dropdown navbar + các mục trong drawer di động, dịch theo href đích.
  const learnButton = root.querySelector('#learnNavDropdownBtn span');
  if (learnButton) learnButton.textContent = t('nav.learn');
  root.querySelectorAll<HTMLAnchorElement>('.nav-dropdown-link').forEach((link) => {
    const href = resolvedHref(link.getAttribute('href') ?? '');
    const match = SHELL_LINKS.find(([needle]) => href.includes(needle));
    if (!match) return;
    const title = link.querySelector('.nav-dropdown-title');
    const desc = link.querySelector('.nav-dropdown-desc');
    if (title) title.textContent = t(match[1]);
    if (desc && match[2]) desc.textContent = t(match[2]);
  });
  root.querySelectorAll<HTMLElement>('.drawer-nav-item').forEach((link) => {
    if (link.id === 'drawerLogoutBtn') {
      const label = link.querySelector('.drawer-nav-label');
      if (label) label.textContent = t('menu.logout');
      return;
    }
    const href = resolvedHref(link.getAttribute('href') ?? '');
    const match = SHELL_LINKS.find(([needle]) => href.includes(needle));
    const label = link.querySelector('.drawer-nav-label');
    if (match && label) label.textContent = t(match[1]);
  });
  root.querySelectorAll<HTMLElement>('.drawer-section-title').forEach((title) => {
    const isAccount = Boolean(title.nextElementSibling?.querySelector('#drawerLogoutBtn'));
    title.textContent = t(isAccount ? 'drawer.accountMenu' : 'drawer.mainMenu');
  });
  const dropdownStatLabels: [string, string][] = [
    ['.dropdown-stat-chip.streak .dropdown-stat-label', 'chip.streakShort'],
    ['.dropdown-stat-chip.xp .dropdown-stat-label', 'chip.xpShort'],
    ['.dropdown-stat-chip.hearts .dropdown-stat-label', 'chip.heartsShort'],
  ];
  dropdownStatLabels.forEach(([selector, key]) => {
    const element = root.querySelector(selector);
    if (element) element.textContent = t(key);
  });
  const drawerChipTitles: [string, string][] = [
    ['.drawer-stat-pill.streak', 'chip.streak'],
    ['.drawer-stat-pill.xp', 'chip.xp'],
    ['.drawer-stat-pill.hearts', 'chip.hearts'],
    ['.dropdown-stat-chip.streak', 'chip.streak'],
    ['.dropdown-stat-chip.xp', 'chip.xp'],
    ['.dropdown-stat-chip.hearts', 'chip.hearts'],
  ];
  drawerChipTitles.forEach(([selector, key]) => {
    root.querySelectorAll<HTMLElement>(selector).forEach((chip) => chip.setAttribute('title', t(key)));
  });
  root.querySelectorAll<HTMLElement>('.dropdown-user-role, .drawer-user-role').forEach((role) => {
    role.textContent = t('shell.learnerRole');
  });
  const hamburger = root.querySelector('#navHamburgerBtn');
  hamburger?.setAttribute('title', t('shell.menuTitle'));
  const userButton = root.querySelector('#userDropdownBtn');
  userButton?.setAttribute('title', t('shell.accountMenuTitle'));

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