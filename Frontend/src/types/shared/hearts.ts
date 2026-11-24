export const DEFAULT_MAX_HEARTS = 5;
export const HEART_LOCK_MS = 24 * 60 * 60 * 1000;

const HEARTS_KEY = 'slanguage_user_hearts';
const LOCK_KEY = 'slanguage_hearts_locked_until';
const CAP_KEY = 'slanguage_max_hearts';

// Giới hạn tim lấy từ plans.max_hearts (null = không giới hạn, gói premium).
// Lưu lại để module khác render sau khi header nạp /api/v1/me vẫn đọc đúng cap.
let heartCap: number | null = normalizeCap(localStorage.getItem(CAP_KEY), DEFAULT_MAX_HEARTS);

function normalizeCap(raw: string | null, fallback: number | null): number | null {
  if (raw === null) return fallback;
  if (raw === "") return null;
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function setHeartCap(value: number | null): void {
  heartCap = value === null ? null : normalizeCap(String(value), DEFAULT_MAX_HEARTS);
  localStorage.setItem(CAP_KEY, heartCap === null ? "" : String(heartCap));
  readHearts();
}

export function getHeartCap(): number | null {
  return heartCap;
}

export function isUnlimitedHearts(): boolean {
  return heartCap === null;
}

export function heartCapLabel(): string {
  return heartCap === null ? '∞' : String(heartCap);
}

export function formatHearts(current: number): string {
  return heartCap === null ? '∞' : `${current}/${heartCap}`;
}

export function isHeartsFull(): boolean {
  return heartCap !== null && readHearts() >= heartCap;
}

function clampHearts(value: number): number {
  const safe = Math.max(0, value);
  return heartCap === null ? safe : Math.min(heartCap, safe);
}

export function heartsLockUntil(): number {
  const raw = Number(localStorage.getItem(LOCK_KEY));
  return Number.isFinite(raw) && raw > 0 ? raw : 0;
}

export function isHeartsLocked(): boolean {
  // Gói không giới hạn tim thì không có khóa 24 giờ (kể cả khi còn khóa cũ từ gói free).
  return heartCap !== null && heartsLockUntil() > Date.now();
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

function storedHearts(): number {
  const raw = localStorage.getItem(HEARTS_KEY);
  const parsed = raw === null ? NaN : parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : (heartCap ?? DEFAULT_MAX_HEARTS);
}

export function readHearts(): number {
  if (heartCap === null) {
    localStorage.removeItem(LOCK_KEY);
    const hearts = clampHearts(storedHearts());
    localStorage.setItem(HEARTS_KEY, String(hearts));
    return hearts;
  }
  const until = heartsLockUntil();
  if (until > 0) {
    if (Date.now() >= until) {
      localStorage.removeItem(LOCK_KEY);
      localStorage.setItem(HEARTS_KEY, String(heartCap));
      return heartCap;
    }
    localStorage.setItem(HEARTS_KEY, '0');
    return 0;
  }
  const hearts = clampHearts(storedHearts());
  if (hearts === 0) {
    lockHearts();
    return 0;
  }
  localStorage.setItem(HEARTS_KEY, String(hearts));
  return hearts;
}

export function spendHearts(amount: number): number {
  if (heartCap === null) return readHearts();
  const next = Math.max(0, readHearts() - amount);
  localStorage.setItem(HEARTS_KEY, String(next));
  if (next === 0) lockHearts();
  return next;
}

export function gainHearts(amount: number): number {
  if (isHeartsLocked()) return 0;
  const next = clampHearts(readHearts() + amount);
  localStorage.setItem(HEARTS_KEY, String(next));
  return next;
}

/** Vật phẩm hồi phục đầy máu: bỏ khóa 24 giờ rồi lấp đầy theo giới hạn của gói. */
export function fillHearts(): number {
  localStorage.removeItem(LOCK_KEY);
  if (heartCap === null) return readHearts();
  localStorage.setItem(HEARTS_KEY, String(heartCap));
  return heartCap;
}
