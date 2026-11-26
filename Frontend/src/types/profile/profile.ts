/**
 * Slanguage - Learner Profile & Analytics
 * Toàn bộ số liệu lấy từ backend: /me, /me/progress, /leaderboard,
 * /vocabulary/learning-paths (+ chi tiết) — không dùng dữ liệu hardcode.
 * Chuỗi hiển thị đi qua i18n (t/applyI18n); navbar đổi ngôn ngữ GIAO DIỆN,
 * còn ngôn ngữ mục tiêu (lộ trình học) chỉ đổi khi lưu hồ sơ.
 */

import { isLearnerAuthenticated, slanguageApi } from '../shared/api-client';
import { initializeLearnerHeader, renderLearnerHeader } from '../shared/learner-header';
import { applyI18n, getLocale, localeLabel, t, LOCALE_EVENT } from '../shared/i18n';
import { clearSkeleton, showSkeleton } from '../shared/skeleton';
import { playLoadingRive, stopLoadingRive } from '../shared/loading-rive';

interface ActivityDay {
  activity_date: string;
  xp_earned: number;
  lessons_completed: number;
  goal_met: boolean;
}

interface PathTopic {
  word_count: number;
  mastered_word_count: number;
}

interface BadgeDef {
  icon: string;
  flame?: boolean;
  title: string;
  desc: string;
  value: number;
  target: number;
}

const LANG_FLAGS: Record<string, string> = {
  ja: new URL('../../../assets/flags/flag-jp.png', import.meta.url).href,
  en: new URL('../../../assets/flags/flag-en.png', import.meta.url).href,
  vi: new URL('../../../assets/flags/flag-vn.png', import.meta.url).href,
};
const SVG_NS = 'http://www.w3.org/2000/svg';

function numLocale(): string {
  const locale = getLocale();
  return locale === 'en' ? 'en-US' : locale === 'ja' ? 'ja-JP' : 'vi-VN';
}
function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}
function asText(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}
function asCount(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0;
}
function setText(id: string, value: string): void {
  const element = document.getElementById(id);
  if (element) element.textContent = value;
}
function setWidth(id: string, percent: number): void {
  const element = document.getElementById(id);
  if (element) element.style.width = `${Math.max(0, Math.min(100, percent))}%`;
}
function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] as string));
}
function todayInTimeZone(timezone: string): string {
  try {
    return new Date().toLocaleDateString('en-CA', { timeZone: timezone });
  } catch {
    return new Date().toLocaleDateString('en-CA');
  }
}
function formatDate(iso: string): string {
  const [year, month, day] = iso.split('-');
  return `${day}/${month}/${year}`;
}

class SlanguageProfile {
  private me: Record<string, unknown> = {};
  private progress: Record<string, unknown> = {};
  private rank: number | null = null;
  private activity: ActivityDay[] = [];
  private topics: PathTopic[] = [];

  constructor() {
    if (!isLearnerAuthenticated()) {
      window.location.replace('../login/index.html');
      return;
    }
    this.init();
  }

  private init(): void {
    this.bindTabs();
    this.bindForm();
    this.bindAvatarUpload();
    this.bindPasswordForm();
    this.bindCertificates();
    this.bindPageTransitions();
    void initializeLearnerHeader({ loadProfile: false });

    window.addEventListener(LOCALE_EVENT, () => {
      applyI18n();
      this.renderAll();
    });

    window.addEventListener('pageshow', () => {
      const overlay = document.getElementById('slanguageLoadingOverlay');
      if (overlay) overlay.classList.remove('active');
      stopLoadingRive();
    });
    window.addEventListener('pagehide', () => stopLoadingRive());

    void this.loadAll();
  }

  private async loadAll(): Promise<void> {
    showSkeleton('activityTableBody', 'table-rows', { tone: 'amethyst', cols: 5, count: 5 });
    showSkeleton('badgesGrid', 'badge-cards', { tone: 'amethyst', count: 8 });
    showSkeleton('certGrid', 'cert-cards', { tone: 'dark', count: 3 });
    try {
      const [meResponse, progressResponse, boardResponse, pathsResponse] = await Promise.all([
        slanguageApi('/api/v1/me'),
        slanguageApi('/api/v1/me/progress'),
        slanguageApi('/api/v1/leaderboard?period=week&limit=1'),
        slanguageApi('/api/v1/vocabulary/learning-paths'),
      ]);
      this.me = asRecord(meResponse.data);
      this.progress = asRecord(progressResponse.data);
      const board = asRecord(boardResponse.data);
      const currentUser = asRecord(board.current_user);
      this.rank = board.current_user ? asCount(currentUser.rank) : null;
      this.activity = (Array.isArray(this.me.daily_activity) ? this.me.daily_activity : [])
        .map((row) => asRecord(row))
        .filter((row) => /^\d{4}-\d{2}-\d{2}$/.test(asText(row.activity_date)))
        .map((row) => ({
          activity_date: asText(row.activity_date),
          xp_earned: asCount(row.xp_earned),
          lessons_completed: asCount(row.lessons_completed),
          goal_met: row.goal_met === true,
        }));

      const profile = asRecord(this.me.profile);
      const lang = asText(profile.target_language, 'ja');
      const paths = (Array.isArray(pathsResponse.data) ? pathsResponse.data : []).map((row) => asRecord(row));
      const path = paths.find((item) => item.language_code === lang) ?? paths[0];
      const pathId = asCount(path?.id);
      this.topics = [];
      if (pathId) {
        const detail = await slanguageApi(`/api/v1/vocabulary/learning-paths/${pathId}`);
        const detailData = asRecord(detail.data);
        this.topics = (Array.isArray(detailData.topics) ? detailData.topics : [])
          .map((row) => asRecord(row))
          .map((row) => ({
            word_count: asCount(row.word_count),
            mastered_word_count: asCount(row.mastered_word_count),
          }));
      }

      renderLearnerHeader(meResponse.data);
      this.renderAll();
    } catch (error) {
      clearSkeleton('activityTableBody');
      clearSkeleton('badgesGrid');
      clearSkeleton('certGrid');
      this.showToast(error instanceof Error ? error.message : t('to.loadFail'));
    }
  }

  private renderAll(): void {
    const profile = asRecord(this.me.profile);
    const stats = asRecord(this.me.stats);
    this.renderHero(profile, stats);
    this.renderLanguageCircle(profile);
    this.renderGlobalStats(stats);
    this.renderWeeklyChart(profile);
    this.renderActivityTable(profile);
    this.renderDailyGoal(profile, stats);
    this.renderBadgesAndCerts(stats);
    this.populateFormFields();
  }

  private renderHero(profile: Record<string, unknown>, stats: Record<string, unknown>): void {
    const name = asText(profile.display_name, asText(profile.username, t('role.learner')));
    const level = asCount(this.progress.level) || 1;
    const band = level >= 20 ? t('hero.band4') : level >= 10 ? t('hero.band3') : level >= 5 ? t('hero.band2') : t('hero.band1');
    const idHex = asText(profile.id).replace(/-/g, '').slice(0, 6).toUpperCase();
    const createdAt = asText(profile.created_at);
    const joined = createdAt ? new Date(createdAt) : null;
    const lang = asText(profile.target_language, 'ja');
    const langName = localeLabel(lang);

    setText('heroStudentName', name);
    setText('heroStudentId', `${t('hero.idPrefix')}SLANG-${idHex || '------'}`);
    const levelBadge = document.getElementById('heroLevelBadge');
    if (levelBadge) levelBadge.innerHTML = `<i class="fa-solid fa-medal"></i> ${t('hero.levelPrefix')}${level} - ${band}`;
    const joinedBadge = document.getElementById('heroJoinedBadge');
    if (joinedBadge) {
      joinedBadge.innerHTML = joined && !Number.isNaN(joined.getTime())
        ? `<i class="fa-solid fa-calendar-check"></i> ${t('hero.joinedPrefix', { m: joined.getMonth() + 1, y: joined.getFullYear() })}`
        : `<i class="fa-solid fa-calendar-check"></i> ${t('hero.joinedUnknown')}`;
    }
    const targetBadge = document.getElementById('heroTargetLangBadge');
    if (targetBadge) {
      targetBadge.innerHTML = `<img src="${LANG_FLAGS[lang] || LANG_FLAGS.ja}" alt="${escapeHtml(langName)}" class="flag-icon-inline" width="20" height="14" style="width:20px;height:14px;object-fit:cover;"> ${t('hero.targetPrefix')}${escapeHtml(langName)}`;
    }
    const currentLevel = asText(profile.current_level, 'A1');
    const targetLevel = asText(profile.target_level, 'A1');
    const goalLabel = t('opt.' + asText(profile.learning_goal, 'other'));
    setText('heroBioText', t('hero.bio', {
      goal: goalLabel,
      target: targetLevel,
      current: currentLevel,
      xp: asCount(profile.daily_goal_xp),
      minutes: asCount(profile.daily_goal_minutes),
    }));

    setText('heroStreakVal', `${asCount(stats.current_streak)} ${t('unit.day')}`);
    setText('heroXPVal', asCount(stats.xp_total).toLocaleString(numLocale()));
    setText('heroRankVal', this.rank === null ? t('hero.rankNone') : `${t('hero.rankPrefix')}${this.rank}`);
    setText('heroLessonsVal', asCount(stats.lessons_completed).toLocaleString(numLocale()));
  }

  private renderLanguageCircle(profile: Record<string, unknown>): void {
    const lang = asText(profile.target_language, 'ja');
    const totalWords = this.topics.reduce((sum, topic) => sum + topic.word_count, 0);
    const mastered = this.topics.reduce((sum, topic) => sum + topic.mastered_word_count, 0);
    const percent = totalWords ? Math.round((mastered * 100) / totalWords) : 0;
    const fill = document.getElementById('langCircleFill');
    if (fill) {
      fill.setAttribute('stroke-dashoffset', (238.8 * (1 - percent / 100)).toFixed(1));
      fill.classList.remove('ja', 'en', 'vi');
      fill.classList.add(lang);
    }
    const svg = document.getElementById('langCircleSvg');
    if (svg) {
      svg.classList.remove('ja', 'en', 'vi');
      svg.classList.add(lang);
    }
    setText('langCirclePercent', `${percent}%`);
    setText('langCircleTitle', localeLabel(lang));
    const flag = document.getElementById('langCircleFlag') as HTMLImageElement | null;
    if (flag) flag.src = LANG_FLAGS[lang] || LANG_FLAGS.ja;
    setText('langLevelPill', `${asText(profile.current_level, 'A1')} → ${asText(profile.target_level, 'A1')}`);
    setText('langWordsPill', totalWords.toLocaleString(numLocale()));
    setText('langMasteredPill', mastered.toLocaleString(numLocale()));
  }

  private renderGlobalStats(stats: Record<string, unknown>): void {
    setText('statWordsLearned', asCount(stats.words_learned).toLocaleString(numLocale()));
    setText('statLessonsDone', asCount(stats.lessons_completed).toLocaleString(numLocale()));
    setText('statLongestStreak', `${asCount(stats.longest_streak)} ${t('unit.day')}`);
    setText('statStreakFreezes', String(asCount(stats.streak_freezes)));
  }

  private renderWeeklyChart(profile: Record<string, unknown>): void {
    const goal = asCount(profile.daily_goal_xp) || 20;
    const timezone = asText(profile.timezone, 'Asia/Ho_Chi_Minh');
    const today = todayInTimeZone(timezone);
    const todayDate = new Date(`${today}T00:00:00`);
    const monday = new Date(todayDate);
    monday.setDate(todayDate.getDate() - ((todayDate.getDay() + 6) % 7));
    const byDate = new Map(this.activity.map((row) => [row.activity_date, row]));
    const values: number[] = [];
    const dates: string[] = [];
    for (let i = 0; i < 7; i += 1) {
      const day = new Date(monday);
      day.setDate(monday.getDate() + i);
      const key = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
      dates.push(key);
      values.push(byDate.get(key)?.xp_earned ?? 0);
    }
    const maxVal = Math.max(goal, ...values, 10);
    const y = (value: number): number => 155 - (value / maxVal) * 135;
    const x = (index: number): number => 45 + index * (590 / 6);

    setText('chartTargetLabel', t('ch.target', { n: goal }));
    const gridLine = document.getElementById('chartGridLine');
    const gridLabel = document.getElementById('chartGridLabel');
    const halfY = y(maxVal / 2);
    if (gridLine) {
      gridLine.setAttribute('y1', halfY.toFixed(1));
      gridLine.setAttribute('y2', halfY.toFixed(1));
    }
    if (gridLabel) {
      gridLabel.setAttribute('y', (halfY + 4).toFixed(1));
      gridLabel.textContent = String(Math.round(maxVal / 2));
    }
    const targetY = y(goal);
    const targetLine = document.getElementById('chartTargetLine');
    const targetValue = document.getElementById('chartTargetValue');
    if (targetLine) {
      targetLine.setAttribute('y1', targetY.toFixed(1));
      targetLine.setAttribute('y2', targetY.toFixed(1));
    }
    if (targetValue) {
      targetValue.setAttribute('y', (targetY + 4).toFixed(1));
      targetValue.textContent = String(goal);
    }

    const points = values.map((value, index) => ({ x: x(index), y: y(value) }));
    const clampY = (value: number): number => Math.max(20, Math.min(155, value));
    let stroke = `M ${points[0].x.toFixed(1)},${points[0].y.toFixed(1)}`;
    for (let i = 0; i < points.length - 1; i += 1) {
      const p0 = points[Math.max(0, i - 1)];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = points[Math.min(points.length - 1, i + 2)];
      const c1x = p1.x + (p2.x - p0.x) / 6;
      const c1y = clampY(p1.y + (p2.y - p0.y) / 6);
      const c2x = p2.x - (p3.x - p1.x) / 6;
      const c2y = clampY(p2.y - (p3.y - p1.y) / 6);
      stroke += ` C ${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
    }
    const fillPath = document.getElementById('weeklyAreaFill');
    const strokePath = document.getElementById('weeklyAreaStroke');
    if (fillPath) fillPath.setAttribute('d', `${stroke} L ${points[6].x.toFixed(1)},155 L ${points[0].x.toFixed(1)},155 Z`);
    if (strokePath) strokePath.setAttribute('d', stroke);

    const peak = Math.max(...values);
    const group = document.getElementById('weeklyPoints');
    if (group) {
      group.replaceChildren();
      values.forEach((value, index) => {
        const isPeak = value === peak && peak > 0;
        const point = document.createElementNS(SVG_NS, 'g');
        point.setAttribute('class', `area-data-point${isPeak ? ' peak-day' : ''}`);
        const dot = document.createElementNS(SVG_NS, 'circle');
        dot.setAttribute('cx', points[index].x.toFixed(1));
        dot.setAttribute('cy', points[index].y.toFixed(1));
        dot.setAttribute('r', isPeak ? '6.5' : '5');
        dot.setAttribute('class', `point-dot${isPeak ? ' peak' : ''}`);
        const valLabel = document.createElementNS(SVG_NS, 'text');
        valLabel.setAttribute('x', points[index].x.toFixed(1));
        valLabel.setAttribute('y', (points[index].y - (isPeak ? 14 : 12)).toFixed(1));
        valLabel.setAttribute('class', `point-val-label${isPeak ? ' peak' : ''}`);
        valLabel.textContent = `${value} ${t('unit.xp')}${isPeak ? ' ⭐' : ''}`;
        const dayLabel = document.createElementNS(SVG_NS, 'text');
        dayLabel.setAttribute('x', points[index].x.toFixed(1));
        dayLabel.setAttribute('y', '174');
        dayLabel.setAttribute('class', `day-axis-label${isPeak ? ' peak' : ''}`);
        dayLabel.textContent = dates[index] === today ? t('ch.today') : t(`ch.d${index + 1}`);
        point.append(dot, valLabel, dayLabel);
        group.append(point);
      });
    }

    const total = values.reduce((sum, value) => sum + value, 0);
    const goalDays = this.activity.filter((row) => row.goal_met).length;
    const totalLabel = document.getElementById('weeklyTotalLabel');
    if (totalLabel) totalLabel.innerHTML = `${t('ch.totalPrefix')}<strong>${total.toLocaleString(numLocale())}</strong>`;
    const goalDaysLabel = document.getElementById('weeklyGoalDaysLabel');
    if (goalDaysLabel) goalDaysLabel.innerHTML = `<i class="fa-solid fa-circle-check"></i> ${t('ch.goalDays', { n: goalDays })}`;
  }

  private renderActivityTable(profile: Record<string, unknown>): void {
    const body = document.getElementById('activityTableBody');
    if (!body) return;
    clearSkeleton(body);
    body.replaceChildren();
    const goal = asCount(profile.daily_goal_xp) || 20;
    const timezone = asText(profile.timezone, 'Asia/Ho_Chi_Minh');
    const today = todayInTimeZone(timezone);
    const rows = [...this.activity].sort((a, b) => b.activity_date.localeCompare(a.activity_date));
    if (!rows.length) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 5;
      td.style.textAlign = 'center';
      td.style.color = 'var(--text-muted)';
      td.textContent = t('hi.empty');
      tr.append(td);
      body.append(tr);
      return;
    }
    for (const row of rows) {
      const tr = document.createElement('tr');
      const dateCell = document.createElement('td');
      const strong = document.createElement('strong');
      strong.textContent = row.activity_date === today ? t('hi.today', { date: formatDate(row.activity_date) }) : formatDate(row.activity_date);
      dateCell.append(strong);
      const xpCell = document.createElement('td');
      const xpBadge = document.createElement('span');
      xpBadge.className = 'score-badge';
      xpBadge.textContent = `${row.xp_earned} ${t('unit.xp')}`;
      xpCell.append(xpBadge);
      const lessonsCell = document.createElement('td');
      lessonsCell.textContent = String(row.lessons_completed);
      const goalCell = document.createElement('td');
      goalCell.textContent = `${goal} ${t('unit.xp')}`;
      const statusCell = document.createElement('td');
      statusCell.innerHTML = row.goal_met
        ? `<span style="color: #10b981; font-weight: 700;"><i class="fa-solid fa-circle-check"></i> ${t('hi.met')}</span>`
        : `<span style="color: #f59e0b; font-weight: 700;"><i class="fa-solid fa-circle-half-stroke"></i> ${t('hi.notMet')}</span>`;
      tr.append(dateCell, xpCell, lessonsCell, goalCell, statusCell);
      body.append(tr);
    }
  }

  private renderDailyGoal(profile: Record<string, unknown>, stats: Record<string, unknown>): void {
    const timezone = asText(profile.timezone, 'Asia/Ho_Chi_Minh');
    const today = todayInTimeZone(timezone);
    const todayRow = this.activity.find((row) => row.activity_date === today);
    const todayXp = todayRow?.xp_earned ?? 0;
    const todayLessons = todayRow?.lessons_completed ?? 0;
    const goalXp = asCount(profile.daily_goal_xp) || 20;
    const goalLessons = asCount(profile.daily_goal_lessons) || 1;
    const goalMinutes = asCount(profile.daily_goal_minutes) || 15;
    const streak = asCount(stats.current_streak);
    const longest = asCount(stats.longest_streak);

    setText('goalXpScore', `${todayXp}/${goalXp}`);
    setWidth('goalXpFill', (todayXp * 100) / goalXp);
    setText('goalLessonsScore', `${todayLessons}/${goalLessons}`);
    setWidth('goalLessonsFill', (todayLessons * 100) / goalLessons);
    setText('goalStreakScore', `${streak}/${Math.max(longest, streak)}`);
    setWidth('goalStreakFill', longest > 0 ? (streak * 100) / longest : streak > 0 ? 100 : 0);

    const tip = document.getElementById('dailyGoalTip');
    if (tip) {
      const remaining = goalXp - todayXp;
      tip.innerHTML = remaining > 0
        ? `<i class="fa-solid fa-lightbulb" style="color: #f59e0b;"></i> ${t('go.tipRemaining', { n: remaining, minutes: goalMinutes })}`
        : `<i class="fa-solid fa-lightbulb" style="color: #f59e0b;"></i> ${t('go.tipDone', { n: goalXp, streak })}`;
    }
    setText('habitReminder', asText(profile.reminder_time).slice(0, 5) || t('ha.notSet'));
    setText('habitLongestStreak', `${longest} ${t('unit.day')}`);
  }

  private badgeDefs(stats: Record<string, unknown>): BadgeDef[] {
    const streak = asCount(stats.current_streak);
    const longest = asCount(stats.longest_streak);
    const words = asCount(stats.words_learned);
    const lessons = asCount(stats.lessons_completed);
    const xp = asCount(stats.xp_total);
    return [
      { icon: '', flame: true, title: t('ba.b1t'), desc: t('ba.b1d'), value: streak, target: 7 },
      { icon: 'fa-fire', title: t('ba.b2t'), desc: t('ba.b2d'), value: longest, target: 14 },
      { icon: 'fa-trophy', title: t('ba.b3t'), desc: t('ba.b3d'), value: longest, target: 30 },
      { icon: 'fa-book-bookmark', title: t('ba.b4t'), desc: t('ba.b4d'), value: words, target: 100 },
      { icon: 'fa-gem', title: t('ba.b5t'), desc: t('ba.b5d'), value: words, target: 500 },
      { icon: 'fa-book-open', title: t('ba.b6t'), desc: t('ba.b6d'), value: lessons, target: 10 },
      { icon: 'fa-graduation-cap', title: t('ba.b7t'), desc: t('ba.b7d'), value: lessons, target: 50 },
      { icon: 'fa-star', title: t('ba.b8t'), desc: t('ba.b8d'), value: xp, target: 1000 },
    ];
  }

  private certDefs(): { title: string; level: number }[] {
    return [
      { title: t('ce.c1t'), level: 5 },
      { title: t('ce.c2t'), level: 10 },
    ];
  }

  private renderBadgesAndCerts(stats: Record<string, unknown>): void {
    const badges = this.badgeDefs(stats);
    const unlocked = badges.filter((badge) => badge.value >= badge.target).length;
    setText('badgesCountLabel', t('ba.count', { n: unlocked, total: badges.length }));
    setText('habitBadgesCount', t('ha.badgesCount', { n: unlocked, total: badges.length }));

    const grid = document.getElementById('badgesGrid');
    if (grid) {
      clearSkeleton(grid);
      grid.replaceChildren();
      for (const badge of badges) {
        const isUnlocked = badge.value >= badge.target;
        const card = document.createElement('div');
        card.className = `badge-card${isUnlocked ? ' unlocked' : ''}`;
        if (!isUnlocked) card.style.opacity = '0.55';
        const iconBox = document.createElement('div');
        iconBox.className = 'badge-icon-box';
        if (badge.flame) {
          const img = document.createElement('img');
          img.src = new URL('../../../assets/streak-flame.gif', import.meta.url).href;
          img.alt = t('ba.b1t');
          img.className = 'streak-flame-img streak-flame-badge';
          iconBox.append(img);
        } else {
          const icon = document.createElement('i');
          icon.className = `fa-solid ${badge.icon}`;
          iconBox.append(icon);
        }
        const title = document.createElement('h4');
        title.textContent = badge.title;
        const desc = document.createElement('p');
        desc.textContent = t('ba.desc', {
          desc: badge.desc,
          v: Math.min(badge.value, badge.target).toLocaleString(numLocale()),
          t: badge.target.toLocaleString(numLocale()),
        });
        card.append(iconBox, title, desc);
        grid.append(card);
      }
    }

    const level = asCount(this.progress.level) || 1;
    const certs = this.certDefs();
    const certUnlocked = certs.filter((cert) => level >= cert.level).length;
    setText('habitCertsCount', t('ha.certsCount', { n: certUnlocked }));
    const certGrid = document.getElementById('certGrid');
    if (certGrid) {
      clearSkeleton(certGrid);
      certGrid.replaceChildren();
      const profile = asRecord(this.me.profile);
      const name = asText(profile.display_name, asText(profile.username, t('role.learner')));
      const idHex = asText(profile.id).replace(/-/g, '').slice(0, 6).toUpperCase();
      const langName = localeLabel(asText(profile.target_language, 'ja'));
      certs.forEach((cert, index) => {
        const isUnlocked = level >= cert.level;
        const card = document.createElement('div');
        card.className = 'cert-card';
        if (!isUnlocked) card.style.opacity = '0.6';
        const certDate = isUnlocked
          ? t('ce.dateUnlocked', { level: cert.level, xp: asCount(stats.xp_total).toLocaleString(numLocale()) })
          : t('ce.dateLocked', { level: cert.level, current: level });
        card.innerHTML = `
          <div class="cert-stamp"><i class="fa-solid ${isUnlocked ? 'fa-stamp' : 'fa-lock'}"></i></div>
          <span style="font-size: 0.78rem; text-transform: uppercase; letter-spacing: 1px; color: var(--color-yellow);">${isUnlocked ? t('ce.unlocked') : t('ce.locked')}</span>
          <h4>${escapeHtml(cert.title)}</h4>
          <div class="cert-date">${certDate}</div>
          <p style="font-size: 0.88rem; color: #b7ccd6; line-height: 1.5; margin-bottom: 22px;">${t('ce.body', { name: escapeHtml(name), id: idHex || '------', lang: escapeHtml(langName) })}</p>
        `;
        const button = document.createElement('button');
        button.className = 'btn-cert-download';
        button.dataset.cert = String(index);
        button.disabled = !isUnlocked;
        button.innerHTML = isUnlocked
          ? `<i class="fa-solid fa-file-arrow-down"></i> ${t('ce.download')}`
          : `<i class="fa-solid fa-lock"></i> ${t('ce.lockedBtn')}`;
        card.append(button);
        certGrid.append(card);
      });
    }
  }

  private bindTabs(): void {
    const tabBtns = document.querySelectorAll<HTMLButtonElement>('.tab-btn');
    const tabPanels = document.querySelectorAll<HTMLElement>('.tab-content');
    tabBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const targetTab = btn.getAttribute('data-tab');
        if (!targetTab) return;
        tabBtns.forEach((b) => b.classList.remove('active'));
        tabPanels.forEach((p) => p.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(targetTab)?.classList.add('active');
      });
    });
  }

  private bindForm(): void {
    const form = document.getElementById('profileEditForm') as HTMLFormElement | null;
    if (!form) return;
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      void this.saveProfile();
    });
    document.getElementById('btnResetForm')?.addEventListener('click', () => {
      this.populateFormFields();
      this.showToast(t('to.reset'));
    });
  }

  private inputValue(id: string): string {
    const element = document.getElementById(id) as HTMLInputElement | HTMLSelectElement | null;
    return element ? element.value.trim() : '';
  }

  private setSelect(id: string, value: string): void {
    const select = document.getElementById(id) as HTMLSelectElement | null;
    if (!select || !value) return;
    if (![...select.options].some((option) => option.value === value)) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = `${value}${t('opt.currentSuffix')}`;
      select.append(option);
    }
    select.value = value;
  }

  private populateFormFields(): void {
    const profile = asRecord(this.me.profile);
    const setInput = (id: string, value: string): void => {
      const element = document.getElementById(id) as HTMLInputElement | null;
      if (element) element.value = value;
    };
    setInput('profFullName', asText(profile.display_name));
    setInput('profUsername', asText(profile.username));
    setInput('profEmail', asText(profile.email));
    setInput('profBirthYear', profile.birth_year ? String(asCount(profile.birth_year)) : '');
    setInput('profCountry', asText(profile.country_code));
    this.setSelect('profNativeLang', asText(profile.native_language, 'vi'));
    this.setSelect('profTargetLang', asText(profile.target_language, 'ja'));
    this.setSelect('profLearningGoal', asText(profile.learning_goal, 'other'));
    this.setSelect('profCurrentLevel', asText(profile.current_level, 'A1'));
    this.setSelect('profTargetLevel', asText(profile.target_level, 'A1'));
    this.setSelect('profDailyGoalXp', String(asCount(profile.daily_goal_xp) || 20));
    this.setSelect('profDailyGoalMinutes', String(asCount(profile.daily_goal_minutes) || 15));
    this.setSelect('profDailyGoalLessons', String(asCount(profile.daily_goal_lessons) || 1));
    setInput('profReminderTime', asText(profile.reminder_time).slice(0, 5));
    setInput('profAvatarUrl', asText(profile.avatar_url));
  }

  private async saveProfile(): Promise<void> {
    const reminder = this.inputValue('profReminderTime');
    const body: Record<string, unknown> = {
      display_name: this.inputValue('profFullName'),
      username: this.inputValue('profUsername'),
      birth_year: this.inputValue('profBirthYear') ? Number(this.inputValue('profBirthYear')) : null,
      country_code: this.inputValue('profCountry') ? this.inputValue('profCountry').toUpperCase() : null,
      native_language: this.inputValue('profNativeLang'),
      target_language: this.inputValue('profTargetLang'),
      current_level: this.inputValue('profCurrentLevel'),
      target_level: this.inputValue('profTargetLevel'),
      learning_goal: this.inputValue('profLearningGoal'),
      daily_goal_xp: Number(this.inputValue('profDailyGoalXp')),
      daily_goal_minutes: Number(this.inputValue('profDailyGoalMinutes')),
      daily_goal_lessons: Number(this.inputValue('profDailyGoalLessons')),
      reminder_time: reminder || null,
      avatar_url: this.inputValue('profAvatarUrl') || null,
    };
    try {
      const response = await slanguageApi('/api/v1/me', { method: 'PATCH', body });
      this.me = asRecord(response.data);
      renderLearnerHeader(response.data);
      this.renderAll();
      this.showToast(t('to.saved'));
    } catch (error) {
      this.showToast(error instanceof Error ? error.message : t('to.saveFail'));
    }
  }

  private bindAvatarUpload(): void {
    const button = document.getElementById('btnChangeAvatar');
    const fileInput = document.getElementById('avatarFileInput') as HTMLInputElement | null;
    if (!button || !fileInput) return;
    button.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => {
      const file = fileInput.files?.[0];
      fileInput.value = '';
      if (file) void this.uploadAvatar(file);
    });
  }

  private readFileAsDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error('Không thể đọc file ảnh.'));
      reader.readAsDataURL(file);
    });
  }

  private async uploadAvatar(file: File): Promise<void> {
    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      this.showToast('Chỉ chấp nhận ảnh JPG hoặc PNG.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      this.showToast('Ảnh vượt quá giới hạn 10MB.');
      return;
    }
    const preview = document.getElementById('profileAvatarImg') as HTMLImageElement | null;
    const previousSrc = preview?.src ?? '';
    const button = document.getElementById('btnChangeAvatar') as HTMLButtonElement | null;
    if (button) button.disabled = true;
    try {
      if (preview) preview.src = await this.readFileAsDataUrl(file);
      const formData = new FormData();
      formData.append('file', file);
      const response = await slanguageApi('/api/v1/me/avatar', { method: 'POST', body: formData });
      this.me = asRecord(response.data);
      renderLearnerHeader(response.data);
      const urlInput = document.getElementById('profAvatarUrl') as HTMLInputElement | null;
      if (urlInput) urlInput.value = asText(asRecord(this.me.profile).avatar_url);
      this.showToast('✅ Đã cập nhật ảnh đại diện!');
    } catch (error) {
      if (preview) preview.src = previousSrc;
      this.showToast(error instanceof Error ? error.message : 'Không thể tải ảnh đại diện lên.');
    } finally {
      if (button) button.disabled = false;
    }
  }

  private bindPasswordForm(): void {
    const form = document.getElementById('passwordChangeForm') as HTMLFormElement | null;
    if (!form) return;
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      void this.changePassword();
    });
    form.querySelectorAll<HTMLButtonElement>('.pwd-toggle').forEach((toggle) => {
      toggle.addEventListener('click', () => {
        const input = document.getElementById(toggle.dataset.target ?? '') as HTMLInputElement | null;
        if (!input) return;
        const reveal = input.type === 'password';
        input.type = reveal ? 'text' : 'password';
        toggle.innerHTML = reveal
          ? '<i class="fa-solid fa-eye-slash"></i>'
          : '<i class="fa-solid fa-eye"></i>';
      });
    });
    document.getElementById('pwdNew')?.addEventListener('input', () => this.renderPasswordStrength());
    document.getElementById('pwdConfirm')?.addEventListener('input', () => this.renderPasswordMatch());
  }

  private renderPasswordStrength(): void {
    const value = (document.getElementById('pwdNew') as HTMLInputElement | null)?.value ?? '';
    const wrap = document.getElementById('pwdStrength');
    const bar = document.getElementById('pwdStrengthBar');
    const label = document.getElementById('pwdStrengthLabel');
    if (!wrap || !bar || !label) return;
    if (!value) {
      wrap.hidden = true;
      bar.style.width = '0%';
      label.textContent = '';
      this.renderPasswordMatch();
      return;
    }
    wrap.hidden = false;
    let score = 0;
    if (value.length >= 8) score += 1;
    if (value.length >= 12) score += 1;
    if (/[a-z]/.test(value) && /[A-Z]/.test(value)) score += 1;
    if (/\d/.test(value)) score += 1;
    if (/[^A-Za-z0-9]/.test(value)) score += 1;
    const levels = [
      { width: '20%', color: '#ef4444', text: 'Rất yếu' },
      { width: '40%', color: '#f97316', text: 'Yếu' },
      { width: '60%', color: '#f59e0b', text: 'Trung bình' },
      { width: '80%', color: '#10b981', text: 'Mạnh' },
      { width: '100%', color: '#059669', text: 'Rất mạnh' },
    ];
    const level = levels[Math.max(0, Math.min(score, levels.length) - 1)];
    bar.style.width = level.width;
    bar.style.background = level.color;
    label.textContent = `Độ mạnh: ${level.text}`;
    label.style.color = level.color;
    this.renderPasswordMatch();
  }

  private renderPasswordMatch(): void {
    const newPassword = (document.getElementById('pwdNew') as HTMLInputElement | null)?.value ?? '';
    const confirm = (document.getElementById('pwdConfirm') as HTMLInputElement | null)?.value ?? '';
    const hint = document.getElementById('pwdMatchHint');
    if (!hint) return;
    if (!confirm) {
      hint.textContent = '';
      return;
    }
    const match = confirm === newPassword;
    hint.textContent = match ? '✓ Mật khẩu xác nhận khớp' : '✗ Mật khẩu xác nhận chưa khớp';
    hint.style.color = match ? '#059669' : '#b91c1c';
  }

  private showPasswordMessage(message: string, isError: boolean): void {
    const element = document.getElementById('pwdMessage');
    if (!element) return;
    element.textContent = message;
    element.hidden = false;
    element.classList.toggle('is-error', isError);
    element.classList.toggle('is-success', !isError);
  }

  private async changePassword(): Promise<void> {
    const oldInput = document.getElementById('pwdOld') as HTMLInputElement | null;
    const newInput = document.getElementById('pwdNew') as HTMLInputElement | null;
    const confirmInput = document.getElementById('pwdConfirm') as HTMLInputElement | null;
    const button = document.getElementById('btnChangePassword') as HTMLButtonElement | null;
    const oldPassword = oldInput?.value ?? '';
    const newPassword = newInput?.value ?? '';
    const confirm = confirmInput?.value ?? '';

    if (!oldPassword) {
      this.showPasswordMessage('Vui lòng nhập mật khẩu hiện tại.', true);
      return;
    }
    if (newPassword.length < 8) {
      this.showPasswordMessage('Mật khẩu mới phải có ít nhất 8 ký tự.', true);
      return;
    }
    if (newPassword !== confirm) {
      this.showPasswordMessage('Mật khẩu xác nhận chưa khớp.', true);
      return;
    }
    if (newPassword === oldPassword) {
      this.showPasswordMessage('Mật khẩu mới phải khác mật khẩu cũ.', true);
      return;
    }

    if (button) {
      button.disabled = true;
      button.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang cập nhật...';
    }
    try {
      await slanguageApi('/api/v1/me/password', {
        method: 'POST',
        body: { old_password: oldPassword, new_password: newPassword },
      });
      if (oldInput) oldInput.value = '';
      if (newInput) newInput.value = '';
      if (confirmInput) confirmInput.value = '';
      this.renderPasswordStrength();
      this.showPasswordMessage('✅ Đổi mật khẩu thành công!', false);
      this.showToast('✅ Đã đổi mật khẩu thành công!');
    } catch (error) {
      this.showPasswordMessage(error instanceof Error ? error.message : 'Không thể đổi mật khẩu.', true);
    } finally {
      if (button) {
        button.disabled = false;
        button.innerHTML = '<i class="fa-solid fa-key"></i> Cập nhật mật khẩu';
      }
    }
  }

  private bindCertificates(): void {
    document.getElementById('certGrid')?.addEventListener('click', (event) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>('.btn-cert-download');
      if (!button || button.disabled) return;
      this.printCertificate(Number(button.dataset.cert));
    });
  }

  private printCertificate(index: number): void {
    const cert = this.certDefs()[index];
    if (!cert) return;
    const profile = asRecord(this.me.profile);
    const stats = asRecord(this.me.stats);
    const name = escapeHtml(asText(profile.display_name, asText(profile.username, t('role.learner'))));
    const idHex = asText(profile.id).replace(/-/g, '').slice(0, 6).toUpperCase();
    const lang = escapeHtml(localeLabel(asText(profile.target_language, 'ja')));
    const printedAt = new Date().toLocaleDateString(numLocale());
    const win = window.open('', '_blank');
    if (!win) {
      this.showToast(t('to.certBlocked'));
      return;
    }
    win.document.write(`<!DOCTYPE html>
<html lang="${getLocale()}"><head><meta charset="utf-8"><title>${escapeHtml(cert.title)}</title>
<style>
  body { font-family: Georgia, serif; background: #f4f8fa; margin: 0; padding: 40px; }
  .cert { max-width: 800px; margin: 0 auto; background: #fff; border: 10px double #0077B6; padding: 60px 50px; text-align: center; }
  h1 { color: #0077B6; letter-spacing: 4px; font-size: 1.6rem; }
  h2 { color: #061A28; font-size: 2rem; margin: 24px 0 8px; }
  .code { color: #64748b; letter-spacing: 2px; }
  .line { width: 220px; border-top: 2px solid #FFB703; margin: 28px auto; }
  p { color: #334155; line-height: 1.7; }
  .meta { margin-top: 36px; display: flex; justify-content: space-between; color: #64748b; font-size: 0.9rem; }
  button { margin: 24px auto 0; display: block; padding: 10px 28px; background: #0077B6; color: #fff; border: 0; border-radius: 8px; font-size: 1rem; cursor: pointer; }
  @media print { button { display: none; } body { background: #fff; padding: 0; } }
</style></head><body>
<div class="cert">
  <h1>${t('cp.heading')}</h1>
  <div class="line"></div>
  <p>${t('cp.certify')}</p>
  <h2>${name}</h2>
  <div class="code">${t('cp.codePrefix')}SLANG-${idHex || '------'}</div>
  <p>${t('cp.completedPrefix')} <strong>${escapeHtml(cert.title)}</strong><br>${t('cp.onPath')} ${lang} ${t('cp.withTotal')} <strong>${asCount(stats.xp_total).toLocaleString(numLocale())} ${t('unit.xp')}</strong>.</p>
  <div class="line"></div>
  <div class="meta"><span>${t('cp.printedAt')} ${printedAt}</span><span>${t('cp.platform')}</span></div>
</div>
<button onclick="window.print()">${t('cp.printBtn')}</button>
</body></html>`);
    win.document.close();
  }

  private bindPageTransitions(): void {
    document.querySelectorAll<HTMLAnchorElement>('a[href]').forEach((link) => {
      const href = link.getAttribute('href');
      if (href && !href.startsWith('#') && !href.startsWith('javascript:') && !link.hasAttribute('target')) {
        link.addEventListener('click', (event) => {
          event.preventDefault();
          this.triggerLoadingAndRedirect(href);
        });
      }
    });
  }

  private triggerLoadingAndRedirect(targetUrl: string, duration = 1500): void {
    const overlay = document.getElementById('slanguageLoadingOverlay');
    if (overlay) {
      overlay.classList.add('active');
      playLoadingRive();
    }
    setTimeout(() => {
      stopLoadingRive();
      overlay?.classList.remove('active');
      window.location.href = targetUrl;
    }, duration);
  }

  private showToast(message: string): void {
    let toast = document.getElementById('profileToast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'profileToast';
      toast.className = 'profile-toast';
      document.body.appendChild(toast);
    }
    toast.style.display = 'flex';
    toast.style.flexDirection = 'column';
    toast.style.alignItems = 'flex-start';
    toast.style.gap = '6px';
    toast.style.border = '2px solid #FFB703';
    toast.style.background = '#061A28';
    toast.style.borderRadius = '16px';
    toast.style.boxShadow = '0 12px 32px rgba(6, 26, 40, 0.6), 0 0 18px rgba(255, 183, 3, 0.25)';
    toast.style.padding = '12px 20px';
    toast.innerHTML = `
      <div style="display: flex; align-items: center; gap: 8px; padding-bottom: 5px; border-bottom: 1px solid rgba(255, 183, 3, 0.25); width: 100%;">
        <img src="${new URL('../../../assets/logo.png', import.meta.url).href}" alt="S Language Logo" style="width: 20px; height: 20px; object-fit: contain; flex-shrink: 0;">
        <span style="font-size: 0.85rem; font-weight: 700; color: #FFB703; letter-spacing: 0.2px;">${escapeHtml(t('to.brand'))}</span>
      </div>
      <div style="display: flex; align-items: center; gap: 8px; font-size: 0.96rem; font-weight: 700; color: #ffffff;">
        <span>${escapeHtml(message)}</span>
      </div>
    `;
    setTimeout(() => {
      if (toast) toast.style.display = 'none';
    }, 3200);
  }
}

function initSlanguageProfile(): void {
  (window as unknown as { profileApp?: SlanguageProfile }).profileApp = new SlanguageProfile();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initSlanguageProfile);
} else {
  initSlanguageProfile();
}