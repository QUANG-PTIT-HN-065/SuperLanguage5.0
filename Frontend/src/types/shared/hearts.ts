export const MAX_HEARTS = 5;
export const HEART_LOCK_MS = 24 * 60 * 60 * 1000;

const HEARTS_KEY = 'slanguage_user_hearts';
const LOCK_KEY = 'slanguage_hearts_locked_until';

export function heartsLockUntil(): number {
  const raw = Number(localStorage.getItem(LOCK_KEY));
  return Number.isFinite(raw) && raw > 0 ? raw : 0;
}

export function isHeartsLocked(): boolean {
  return heartsLockUntil() > Date.now();
}

export function heartLockRemainingMs(): number {
  return Math.max(0, heartsLockUntil() - Date.now());
}

export function formatHeartLock(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

function lockHearts(): void {
  localStorage.setItem(LOCK_KEY, String(Date.now() + HEART_LOCK_MS));
  localStorage.setItem(HEARTS_KEY, '0');
}

export function readHearts(): number {
  const until = heartsLockUntil();
  if (until > 0) {
    if (Date.now() >= until) {
      localStorage.removeItem(LOCK_KEY);
      localStorage.setItem(HEARTS_KEY, String(MAX_HEARTS));
      return MAX_HEARTS;
    }
    localStorage.setItem(HEARTS_KEY, '0');
    return 0;
  }
  const raw = localStorage.getItem(HEARTS_KEY);
  const parsed = raw === null ? NaN : parseInt(raw, 10);
  const hearts = Number.isFinite(parsed) ? Math.max(0, Math.min(MAX_HEARTS, parsed)) : MAX_HEARTS;
  if (hearts === 0) {
    lockHearts();
    return 0;
  }
  localStorage.setItem(HEARTS_KEY, String(hearts));
  return hearts;
}

export function spendHearts(amount: number): number {
  const next = Math.max(0, readHearts() - amount);
  localStorage.setItem(HEARTS_KEY, String(next));
  if (next === 0) lockHearts();
  return next;
}

export function gainHearts(amount: number): number {
  if (isHeartsLocked()) return 0;
  const next = Math.min(MAX_HEARTS, readHearts() + amount);
  localStorage.setItem(HEARTS_KEY, String(next));
  return next;
}

/** Hồi máu bằng vật phẩm: xóa khóa 24 giờ rồi cộng máu. */
export function refillHearts(amount: number): number {
  localStorage.removeItem(LOCK_KEY);
  const raw = parseInt(localStorage.getItem(HEARTS_KEY) ?? '0', 10);
  const current = Number.isFinite(raw) ? Math.max(0, raw) : 0;
  const next = Math.min(MAX_HEARTS, current + amount);
  localStorage.setItem(HEARTS_KEY, String(next));
  return next;
}