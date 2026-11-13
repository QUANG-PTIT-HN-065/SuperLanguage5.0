/**
 * =========================================================================
 * SuperLanguage 5.0 — Mini-game "Tháp Giải Mã Ngữ Nghĩa"
 * Procedural Roguelike Language Puzzle Engine (16-Bit Pixel Art Edition)
 *
 * Tích hợp dữ liệu CSDL Supabase thật:
 * - GET  /api/v1/minigame/state    (Tải 120 từ vựng thật, SRS mastery, RAG rules)
 * - POST /api/v1/minigame/progress (Lưu XP, streak, cập nhật user_words)
 * =========================================================================
 */

// ==================== TYPE DEFINITIONS ====================
export interface VocabCard {
  id: string | number;
  word: string;
  forms?: string[];
  kana?: string;
  meaning: string;
  pos: string;
  topic: string;
  level: string;
  srs: number;
  due?: boolean;
  phonetic?: string | null;
  example?: string | null;
  exampleMeaning?: string | null;
  element?: 'fire' | 'ice' | 'neutral';
  bombTurns?: number | null;
}

export interface GrammarRule {
  id: string;
  category: string;
  title: string;
  desc: string;
  tip: string;
  check: (sentence: string) => boolean;
  failHint: string;
}

export interface BossInfo {
  name: string;
  spriteKey: 'slime' | 'golem' | 'knight' | 'dragon';
  hp: number;
  maxHp: number;
  hurtTimer: number;
  defeated: boolean;
}

export interface Mutator {
  type: 'taboo' | 'bomb' | 'blitz';
  label: string;
  forbidden?: string[];
  bombCardId?: string | number;
}

export interface PassiveBuff {
  id: string;
  icon: string;
  name: string;
  desc: string;
}

export interface CatSkin {
  id: string;
  name: string;
  fur: string;
  furDark: string;
  hat: string;
  scarf: string;
  staff: string;
  eye: string;
}

// ==================== CONSTANTS & GAME CONFIG ====================
const BOSS_ROSTER: Array<{ name: string; spriteKey: 'slime' | 'golem' | 'knight' | 'dragon'; baseHp: number }> = [
  { name: 'Slime Thì Quá Khứ', spriteKey: 'slime', baseHp: 110 },
  { name: 'Golem Phủ Định', spriteKey: 'golem', baseHp: 145 },
  { name: 'Hiệp Sĩ Trợ Từ', spriteKey: 'knight', baseHp: 180 },
  { name: 'Rồng Kính Ngữ', spriteKey: 'dragon', baseHp: 225 },
];

const CAT_SKINS: CatSkin[] = [
  {
    id: 'ginger',
    name: 'Mèo Cam Pháp Sư',
    fur: '#ff9e44',
    furDark: '#d96b27',
    hat: '#4f46e5',
    scarf: '#f43f5e',
    staff: '#ffd541',
    eye: '#1e1b4b',
  },
  {
    id: 'white',
    name: 'Mèo Trắng Hiệp Sĩ',
    fur: '#ffffff',
    furDark: '#cbd5e1',
    hat: '#0284c7',
    scarf: '#38bdf8',
    staff: '#7dd3fc',
    eye: '#0f172a',
  },
  {
    id: 'black',
    name: 'Mèo Đen Bóng Đêm',
    fur: '#3b3355',
    furDark: '#231d36',
    hat: '#be123c',
    scarf: '#fbbf24',
    staff: '#f472b6',
    eye: '#fde047',
  },
];

const PASSIVE_BUFFS: PassiveBuff[] = [
  {
    id: 'eternal_fire',
    icon: '🔥',
    name: 'Lửa Vĩnh Cửu',
    desc: 'Thẻ Lửa (từ mới SRS) tăng hệ số nhân từ ×2.0 lên ×2.5 sát thương.',
  },
  {
    id: 'frost_clock',
    icon: '❄️',
    name: 'Đồng Hồ Băng Giá',
    desc: 'Thẻ Băng cộng +8s thay vì +5s và tăng thêm +6s mỗi đầu tầng.',
  },
  {
    id: 'resonance_master',
    icon: '⚡',
    name: 'Bậc Thầy Cộng Hưởng',
    desc: 'Thưởng ghép thẻ cùng Chủ Đề tăng từ +50% lên +90% sát thương.',
  },
  {
    id: 'heart_spring',
    icon: '💖',
    name: 'Suối Nguồn Sinh Lực',
    desc: 'Hồi ngay +1 Tim (tối đa 5) và tăng +15 sát thương cơ bản mọi đòn.',
  },
  {
    id: 'arcane_claw',
    icon: '🐾',
    name: 'Vuốt Mèo Liên Hoàn',
    desc: 'Khi ghép từ 3 thẻ trở lên trong 1 câu, gây thêm +45 sát thương chuẩn.',
  },
];

const JA_QUICK_CHIPS = ['私は', 'は', 'が', 'を', 'に', 'で', 'と', 'です', 'ます', 'ました', 'ません', 'てください', 'たいです', '。'];

// Bộ quy tắc ngữ pháp nền tảng theo chuẩn quốc tế
const BASE_GRAMMAR_RULES: Record<string, GrammarRule[]> = {
  en: [
    {
      id: 'EN_PAST',
      category: 'RAG • Ngữ Pháp',
      title: 'Thì Quá Khứ Đơn (Past Simple)',
      desc: 'Đặt câu diễn tả hành động đã hoàn tất trong quá khứ (dùng động từ V2/ed hoặc dấu hiệu yesterday, last, ago).',
      tip: 'Yesterday, I bought a ticket and explored the scenic city.',
      check: (s) => /\b(yesterday|ago|last|went|ate|bought|saw|sent|traveled|travelled|explored|arrived|cooked|ordered|finished|improved|learned|learnt|was|were|did|\w+ed)\b/i.test(s),
      failHint: 'Hãy chia động từ ở quá khứ (như went, ate, bought, ...ed) hoặc thêm mốc thời gian quá khứ (yesterday, last week, ago).',
    },
    {
      id: 'EN_NEG',
      category: 'RAG • Ngữ Pháp',
      title: 'Câu Phủ Định (Negative Form)',
      desc: 'Đặt câu mang nghĩa phủ định sử dụng not, don’t, doesn’t, didn’t, won’t, can’t hoặc never.',
      tip: 'I didn’t eat the spicy food because I was not hungry.',
      check: (s) => /\b(not|n't|never|no)\b/i.test(s),
      failHint: 'Câu của bạn chưa có từ phủ định (ví dụ: not, don’t, didn’t, can’t, never).',
    },
    {
      id: 'EN_FUTURE',
      category: 'RAG • Ngữ Pháp',
      title: 'Kế Hoạch Tương Lai (Future)',
      desc: 'Diễn tả dự định sắp tới bằng will, going to, hope to, want to hoặc plan to.',
      tip: 'Next month, we will travel abroad and explore new places.',
      check: (s) => /\b(will|'ll|going to|tomorrow|next|plan to|hope to|want to|would like to)\b/i.test(s),
      failHint: 'Hãy dùng cấu trúc tương lai như "will", "going to", "want to" hoặc mốc thời gian "tomorrow / next...".',
    },
    {
      id: 'EN_POLITE',
      category: 'RAG • Văn Hóa Giao Tiếp',
      title: 'Yêu Cầu Lịch Sự (Polite Request)',
      desc: 'Giao tiếp lịch sự chuẩn bản xứ với Could you, Would you, Can I, Please hoặc I would like.',
      tip: 'Could you please send the report to my colleague before the meeting?',
      check: (s) => /\b(please|could|would|may|can i|can you|kindly|appreciate)\b/i.test(s),
      failHint: 'Để lịch sự hơn, hãy thêm "please", "could you", "would you like" hoặc "can I".',
    },
    {
      id: 'EN_CONNECT',
      category: 'RAG • Cấu Trúc Câu',
      title: 'Câu Ghép Mở Rộng (Conjunctions)',
      desc: 'Nối hai mệnh đề hoặc ý tưởng bằng liên từ: because, so, but, although, when, hoặc if.',
      tip: 'We arrived at the airport early because the weather was bad.',
      check: (s) => /\b(because|so|but|although|though|when|while|if|since|and)\b/i.test(s),
      failHint: 'Hãy nối các ý trong câu bằng liên từ như "because", "so", "but", "when" hoặc "if".',
    },
    {
      id: 'EN_QUESTION',
      category: 'RAG • Ngữ Pháp',
      title: 'Câu Nghi Vấn (Question)',
      desc: 'Đặt một câu hỏi hoàn chỉnh (bắt đầu bằng Do/Did/Are/Is/Can/What/Where/When/Why/How và kết thúc bằng dấu ?).',
      tip: 'Did you finish the project report before the meeting?',
      check: (s) => /\?$/.test(s.trim()) || /^(do|does|did|is|are|was|were|can|could|will|would|have|has|what|where|when|why|who|how)\b/i.test(s.trim()),
      failHint: 'Hãy đặt câu ở dạng câu hỏi (dùng trợ động từ / từ để hỏi ở đầu và dấu "?" ở cuối).',
    },
  ],
  ja: [
    {
      id: 'JA_MASU',
      category: 'RAG • Kính Ngữ Cơ Bản',
      title: 'Thể Lịch Sự (〜ます / 〜です)',
      desc: 'Kết thúc câu một cách lịch sự chuẩn mực bằng đuôi 〜ます hoặc 〜です.',
      tip: '私は毎日美味しいお茶を飲みます。',
      check: (s) => /(ます|です|でした|ました|ません)[。！!]?$/.test(s.trim()),
      failHint: 'Câu tiếng Nhật cần kết thúc lịch sự bằng 〜ます hoặc 〜です.',
    },
    {
      id: 'JA_PAST',
      category: 'RAG • Ngữ Pháp',
      title: 'Thì Quá Khứ Lịch Sự (〜ました / 〜でした)',
      desc: 'Diễn tả hành động hoặc trạng thái đã xảy ra trong quá khứ dùng 〜ました hoặc 〜でした.',
      tip: '昨日、友達と有名な料理を食べました。',
      check: (s) => /(ました|でした|かった)[。！!]?$/.test(s.trim()),
      failHint: 'Hãy chia đuôi câu sang quá khứ 〜ました hoặc 〜でした.',
    },
    {
      id: 'JA_PARTICLE',
      category: 'RAG • Trợ Từ Cốt Lõi',
      title: 'Trợ Từ Hành Động & Địa Điểm (を / に / で)',
      desc: 'Sử dụng chính xác trợ từ を (tân ngữ), に (đích đến/thời gian) hoặc で (địa điểm hành động) trong câu.',
      tip: '空港で新しい切符を買います。',
      check: (s) => /(を|に|で)/.test(s),
      failHint: 'Hãy thêm trợ từ を, に hoặc で để liên kết danh từ và động từ trong câu.',
    },
    {
      id: 'JA_REQUEST',
      category: 'RAG • Giao Tiếp',
      title: 'Đề Nghị & Mong Muốn (〜てください / 〜たいです)',
      desc: 'Đưa ra lời nhờ vả lịch sự (~てください) hoặc bày tỏ mong muốn bản thân (~たいです).',
      tip: '新しい景色を見たいです。 / 静かに話してください。',
      check: (s) => /(ください|たいです|たい)/.test(s),
      failHint: 'Hãy sử dụng cấu trúc 〜てください hoặc 〜たいです trong câu.',
    },
    {
      id: 'JA_NEG',
      category: 'RAG • Ngữ Pháp',
      title: 'Câu Phủ Định (〜ません / 〜ではない)',
      desc: 'Đặt câu phủ định lịch sự với 〜ません, 〜ませんでした hoặc 〜ではありません.',
      tip: '今日は仕事が忙しくありません。',
      check: (s) => /(ません|ない|ありません|じゃない|ではない)/.test(s),
      failHint: 'Câu cần có dạng phủ định như 〜ません hoặc 〜ありません.',
    },
  ],
};

// ==================== REPOSITORY (DỮ LIỆU THẬT CSDL) ====================
// Thay thế hoàn toàn dữ liệu ảo cứng. Dữ liệu nạp trực tiếp từ Supabase qua backend.
const activeCardsDatabase: Record<string, VocabCard[]> = {
  en: [],
  ja: [],
};

const activeRulesDatabase: Record<string, GrammarRule[]> = {
  en: [...BASE_GRAMMAR_RULES.en],
  ja: [...BASE_GRAMMAR_RULES.ja],
};

// ==================== GAME STATE OBJECT ====================
export const game = {
  lang: 'en' as 'en' | 'ja',
  floor: 1,
  hearts: 5,
  maxHearts: 5,
  isUnlimitedHearts: false,
  xp: 0,
  wordsPracticed: 0,
  practicedWordIds: new Set<number>(),
  progressSaved: false,
  rerollsLeft: 2,
  skinIndex: 0,

  // Boss & Floor
  boss: {
    name: 'Slime Thì Quá Khứ',
    spriteKey: 'slime' as 'slime' | 'golem' | 'knight' | 'dragon',
    hp: 110,
    maxHp: 110,
    hurtTimer: 0,
    defeated: false,
  },
  rule: null as GrammarRule | null,
  mutator: null as Mutator | null,
  hand: [] as VocabCard[],
  selectedIds: new Set<string | number>(),
  buffs: new Set<string>(),

  // Timer
  timeLeft: 45,
  timerInterval: null as any,
  dataReady: false,
  isGameOver: false,
  isTransitioning: false,

  // Animation & VFX
  cat: {
    state: 'IDLE' as 'IDLE' | 'CHARGING' | 'ATTACK' | 'HURT' | 'VICTORY',
    stateTimer: 0,
    x: 114,
    y: 50,
    jumpY: 0,
    frame: 0,
  },
  projectiles: [] as any[],
  particles: [] as any[],
  floatingTexts: [] as any[],
  screenShake: 0,
  hitStop: 0,
  soundOn: true,
};

// ==================== AUTH & DATABASE LOADER ====================
function getApiBaseUrl(): string {
  const envUrl = (import.meta as any).env?.VITE_API_BASE_URL;
  if (envUrl && typeof envUrl === 'string' && !envUrl.startsWith('%')) {
    return envUrl.replace(/\/+$/, '');
  }
  return window.location.origin.replace(/\/+$/, '');
}

function getAuthToken(): string {
  return (
    localStorage.getItem('slanguage_access_token') ||
    sessionStorage.getItem('superlanguage.admin.accessToken') ||
    ''
  );
}

/**
 * Tải dữ liệu thật từ cơ sở dữ liệu Supabase:
 * - Gọi GET /api/v1/minigame/state?card_count=120&language=...
 * - Nhận danh sách từ vựng của user kèm SRS mastery_level
 * - Nhận quy tắc RAG grammar chunks
 * - Nhận gói cước (free -> 5 tim, premium -> không giới hạn tim)
 */
export async function loadDatabaseGameState(lang?: 'en' | 'ja'): Promise<boolean> {
  const targetLang = lang || game.lang;
  const token = getAuthToken();
  const apiBase = getApiBaseUrl();

  // Show loading UI
  const loadingEl = document.getElementById('loading-indicator');
  if (loadingEl) loadingEl.style.display = 'flex';
  // Hide error toast
  const errorToast = document.getElementById('error-toast');
  if (errorToast) errorToast.style.display = 'none';

  const banner = document.getElementById('arena-state-banner');
  if (banner) banner.textContent = '📡 Đang đồng bộ kho từ vựng từ CSDL Supabase...';

  try {
    const url = `${apiBase}/api/v1/minigame/state?card_count=120&language=${encodeURIComponent(targetLang)}`;
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(url, { headers });
    if (!res.ok) {
      throw new Error(`Máy chủ trả về HTTP ${res.status}`);
    }

    const contentType = res.headers.get('content-type') || '';
    const responseText = await res.text();
    if (!contentType.toLowerCase().includes('application/json')) {
      throw new Error(
        `API mini game trả về ${contentType || 'HTML'} thay vì JSON. ` +
        'Kiểm tra VITE_API_BASE_URL và đường dẫn backend.',
      );
    }

    let json: any;
    try {
      json = JSON.parse(responseText);
    } catch {
      throw new Error('API mini game trả về JSON không hợp lệ.');
    }
    const data = json?.data;
    if (!data || !Array.isArray(data.cards) || data.cards.length === 0) {
      throw new Error('Chưa có từ vựng phù hợp trong CSDL.');
    }

    // Nạp thẻ từ vựng thật từ Database
    const cards: VocabCard[] = data.cards.map((c: any) => ({
      id: c.id,
      word: c.word,
      forms: Array.isArray(c.forms) && c.forms.length ? c.forms : [c.word],
      kana: c.kana || undefined,
      meaning: c.meaning || '',
      pos: c.pos || 'noun',
      topic: c.topic || 'Chung',
      level: c.level || 'A1',
      srs: typeof c.srs === 'number' ? c.srs : 0,
      due: Boolean(c.due),
      phonetic: c.phonetic || null,
      example: c.example || null,
      exampleMeaning: c.exampleMeaning || null,
    }));

    activeCardsDatabase[targetLang] = cards;

    // Nạp RAG Rules thật từ Database nếu có
    if (Array.isArray(data.rules) && data.rules.length > 0) {
      const ragRules: GrammarRule[] = data.rules.map((r: any, idx: number) => ({
        id: r.id || `rag-${idx}`,
        category: r.category || 'RAG • Tri thức học tập',
        title: r.title || 'Quy tắc ngữ pháp',
        desc: r.desc || '',
        tip: r.tip || r.desc || '',
        check: () => true, // Chấp nhận và ưu tiên phân tích ngữ nghĩa
        failHint: 'Hãy đặt câu hoàn chỉnh và phù hợp với ngữ cảnh học tập.',
      }));
      // Kết hợp RAG rules thật với bộ rules thực chiến
      activeRulesDatabase[targetLang] = [...ragRules, ...(BASE_GRAMMAR_RULES[targetLang] || [])];
    }

    // Cập nhật gói cước người chơi (FR-01)
    if (data.is_unlimited_hearts || data.plan_id === 'premium') {
      game.isUnlimitedHearts = true;
      game.maxHearts = 99;
      game.hearts = 99;
    } else {
      game.isUnlimitedHearts = false;
      game.maxHearts = typeof data.max_hearts === 'number' ? data.max_hearts : 5;
      game.hearts = Math.min(game.hearts, game.maxHearts);
    }

    // Hide loading indicator after successful load
    const loadingEl = document.getElementById('loading-indicator');
    if (loadingEl) loadingEl.style.display = 'none';
    if (banner) banner.textContent = '✨ Đã kết nối CSDL Supabase! Chọn thẻ từ vựng để Mèo tụ phép!';
    return true;
  } catch (err: any) {
    console.warn('[MiniGame] Không thể tải dữ liệu thật từ CSDL:', err?.message || err);
    // Hide loading indicator on failure
    const loadingEl = document.getElementById('loading-indicator');
    if (loadingEl) loadingEl.style.display = 'none';
    // Show error toast
    const errorToast = document.getElementById('error-toast');
    if (errorToast) {
      const msgSpan = document.getElementById('error-message');
      if (msgSpan) msgSpan.textContent = token ? err?.message || 'Lỗi kết nối CSDL' : 'Chưa đăng nhập tài khoản';
      errorToast.style.display = 'block';
    }
    if (banner) {
      banner.textContent = token
        ? `⚠️ ${err?.message || 'Lỗi kết nối CSDL'}. Đang chuyển chế độ dự phòng...`
        : '⚠️ Chưa đăng nhập tài khoản. Đang chạy dữ liệu kiểm thử.';
    }
    return false;
  }
}

/**
 * Lưu tiến trình leo tháp vào CSDL qua POST /api/v1/minigame/progress
 */
export async function saveGameProgress(): Promise<void> {
  if (game.progressSaved || game.xp <= 0) return;
  const token = getAuthToken();
  if (!token) return;

  const apiBase = getApiBaseUrl();
  game.progressSaved = true;

  try {
    await fetch(`${apiBase}/api/v1/minigame/progress`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        xp: game.xp,
        word_ids: Array.from(game.practicedWordIds).filter((n) => Number.isInteger(n)),
      }),
    });
  } catch (err) {
    game.progressSaved = false;
    console.warn('[MiniGame] Lỗi lưu tiến trình:', err);
  }
}

// ==================== 16-BIT WEB AUDIO SYNTHESIZER ====================
let audioCtx: AudioContext | null = null;

export function playRetroSfx(type: 'card' | 'cast' | 'hit' | 'hurt' | 'victory'): void {
  if (!game.soundOn) return;
  try {
    if (!audioCtx) {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      audioCtx = new AudioContextClass();
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();

    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);

    if (type === 'card') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(520, now);
      osc.frequency.exponentialRampToValueAtTime(780, now + 0.08);
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
      osc.start(now);
      osc.stop(now + 0.09);
    } else if (type === 'cast') {
      osc.type = 'square';
      osc.frequency.setValueAtTime(340, now);
      osc.frequency.exponentialRampToValueAtTime(920, now + 0.22);
      gain.gain.setValueAtTime(0.07, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
      osc.start(now);
      osc.stop(now + 0.24);
    } else if (type === 'hit') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(180, now);
      osc.frequency.exponentialRampToValueAtTime(48, now + 0.25);
      gain.gain.setValueAtTime(0.14, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.26);
      osc.start(now);
      osc.stop(now + 0.26);
    } else if (type === 'hurt') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(210, now);
      osc.frequency.linearRampToValueAtTime(110, now + 0.28);
      gain.gain.setValueAtTime(0.11, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
      osc.start(now);
      osc.stop(now + 0.3);
    } else if (type === 'victory') {
      const notes = [523.25, 659.25, 783.99, 1046.5];
      notes.forEach((freq, idx) => {
        if (!audioCtx) return;
        const o = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        o.type = 'square';
        o.frequency.setValueAtTime(freq, now + idx * 0.09);
        g.gain.setValueAtTime(0.07, now + idx * 0.09);
        g.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.09 + 0.22);
        o.connect(g);
        g.connect(audioCtx.destination);
        o.start(now + idx * 0.09);
        o.stop(now + idx * 0.09 + 0.23);
      });
    }
  } catch {
    // Không chặn luồng nếu chưa có user gesture
  }
}

export function toggleSound(): void {
  game.soundOn = !game.soundOn;
  const btn = document.getElementById('btn-sound');
  if (btn) btn.textContent = game.soundOn ? '🔊' : '🔇';
  if (game.soundOn) playRetroSfx('card');
}

// ==================== PROCEDURAL GENERATION & ENGINE ====================
function shuffleArray<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * Gán thuộc tính thẻ bài dựa trên dữ liệu DB (FR-03):
 * - Thẻ Lửa: mastery_level <= 1 (từ mới/yếu) -> nhân đôi x2 sát thương.
 * - Thẻ Băng: part_of_speech là tính từ / trạng từ -> cộng +5s thời gian.
 * - Thẻ Thường: các từ còn lại.
 */
export function getElementType(card: VocabCard): 'fire' | 'ice' | 'neutral' {
  if (card.srs <= 1) return 'fire';
  const posLower = (card.pos || '').toLowerCase();
  if (posLower.includes('adj') || posLower.includes('adv')) return 'ice';
  return 'neutral';
}

function dealProceduralHand(count = 6): VocabCard[] {
  const pool = activeCardsDatabase[game.lang] || [];
  if (pool.length === 0) return [];

  const fireCandidates = shuffleArray(pool.filter((w) => w.srs <= 1));
  const iceCandidates = shuffleArray(
    pool.filter((w) => {
      const p = (w.pos || '').toLowerCase();
      return w.srs > 1 && (p.includes('adj') || p.includes('adv'));
    })
  );

  const chosen: VocabCard[] = [];
  const usedIds = new Set<string | number>();

  // Ưu tiên 1 thẻ Lửa và 1 thẻ Băng để tăng tính chiến thuật
  if (fireCandidates.length > 0) {
    chosen.push(fireCandidates[0]);
    usedIds.add(fireCandidates[0].id);
  }
  if (iceCandidates.length > 0) {
    chosen.push(iceCandidates[0]);
    usedIds.add(iceCandidates[0].id);
  }

  // Ưu tiên thêm 1 thẻ cùng topic để kích hoạt Cộng hưởng chủ đề
  const anchorTopic = chosen[0]?.topic;
  if (anchorTopic) {
    const sameTopic = shuffleArray(pool.filter((w) => !usedIds.has(w.id) && w.topic === anchorTopic));
    if (sameTopic.length > 0) {
      chosen.push(sameTopic[0]);
      usedIds.add(sameTopic[0].id);
    }
  }

  // Điền đầy đủ số thẻ còn lại từ kho DB
  const remaining = shuffleArray(pool.filter((w) => !usedIds.has(w.id)));
  while (chosen.length < count && remaining.length > 0) {
    const next = remaining.pop()!;
    chosen.push(next);
    usedIds.add(next.id);
  }

  return shuffleArray(chosen).map((w) => ({
    ...w,
    element: getElementType(w),
    bombTurns: null,
  }));
}

export function generateFloor(floorNum: number): void {
  if (!game.dataReady) return;
  game.floor = floorNum;
  game.selectedIds.clear();
  game.rerollsLeft = 2;
  game.isTransitioning = false;
  setCatState('IDLE');

  // 1. Procedural Boss
  const bossTemplate = BOSS_ROSTER[(floorNum - 1) % BOSS_ROSTER.length];
  const scaledHp = Math.round(bossTemplate.baseHp + (floorNum - 1) * 42);
  game.boss = {
    name: `${bossTemplate.name} (Lv.${floorNum})`,
    spriteKey: bossTemplate.spriteKey,
    hp: scaledHp,
    maxHp: scaledHp,
    hurtTimer: 0,
    defeated: false,
  };

  // 2. Procedural Grammar / RAG Rule
  const rulesPool = activeRulesDatabase[game.lang] || BASE_GRAMMAR_RULES[game.lang];
  game.rule = rulesPool[(floorNum - 1 + Math.floor(Math.random() * rulesPool.length)) % rulesPool.length];

  // 3. Deal 6 Cards từ CSDL thật
  game.hand = dealProceduralHand(6);

  // 4. Sinh biến cố phá rối (Mutators - FR-04) từ tầng 2
  let baseTime = game.buffs.has('frost_clock') ? 51 : 45;
  game.mutator = null;

  if (floorNum >= 2) {
    const mutatorTypes: Array<'taboo' | 'bomb' | 'blitz'> = ['taboo', 'bomb', 'blitz'];
    const picked = mutatorTypes[(floorNum + Math.floor(Math.random() * 2)) % mutatorTypes.length];

    if (picked === 'taboo') {
      const forbidden = game.lang === 'en' ? ['very', 'good', 'nice'] : ['とても', 'いい', 'すごい'];
      game.mutator = {
        type: 'taboo',
        label: `🚫 Cấm từ: "${forbidden.join(', ')}"`,
        forbidden,
      };
    } else if (picked === 'bomb' && game.hand.length > 0) {
      const targetIdx = Math.floor(Math.random() * game.hand.length);
      game.hand[targetIdx].bombTurns = 2;
      game.mutator = {
        type: 'bomb',
        label: `💣 Bom thẻ "${game.hand[targetIdx].word}" (2 lượt)`,
        bombCardId: game.hand[targetIdx].id,
      };
    } else if (picked === 'blitz') {
      baseTime = game.buffs.has('frost_clock') ? 34 : 28;
      game.mutator = {
        type: 'blitz',
        label: '⚡ Bão Tốc Độ (28s • +35% ST)',
      };
    }
  }

  game.timeLeft = baseTime;
  const sentenceInput = document.getElementById('sentence-input') as HTMLInputElement | null;
  if (sentenceInput) sentenceInput.value = '';
  document.getElementById('ai-feedback-panel')?.classList.add('hidden');

  renderUI();
  startTurnTimer();
}

// ==================== TIMER & CONTROLLERS ====================
function startTurnTimer(): void {
  clearInterval(game.timerInterval);
  game.timerInterval = setInterval(() => {
    if (game.isGameOver || game.isTransitioning) return;
    game.timeLeft = Math.max(0, game.timeLeft - 1);
    updateTimerHUD();

    if (game.timeLeft <= 0) {
      clearInterval(game.timerInterval);
      handlePlayerDamage('⏰ Hết thời gian! Hộ Vệ Ngữ Pháp đã phản công.');
      if (!game.isGameOver) {
        game.timeLeft = game.mutator?.type === 'blitz' ? 28 : 40;
        startTurnTimer();
      }
    }
  }, 1000);
}

function updateTimerHUD(): void {
  const el = document.getElementById('timer-display');
  const box = document.getElementById('timer-box');
  if (!el || !box) return;
  el.textContent = `${game.timeLeft}s`;
  if (game.timeLeft <= 10) {
    el.className = 'font-vt text-2xl leading-none text-rose-400 font-bold animate-pulse';
    box.className = 'px-3 py-1.5 rounded-xl bg-rose-950/90 border border-rose-500 text-center min-w-[74px]';
  } else {
    el.className = 'font-vt text-2xl leading-none text-cyan-200 font-bold';
    box.className = 'px-3 py-1.5 rounded-xl bg-slate-950 border border-cyan-400/50 text-center min-w-[74px]';
  }
}

function setCatState(newState: 'IDLE' | 'CHARGING' | 'ATTACK' | 'HURT' | 'VICTORY', durationMs = 0): void {
  game.cat.state = newState;
  game.cat.stateTimer = durationMs;

  const banner = document.getElementById('arena-state-banner');
  if (!banner) return;
  const labels: Record<string, string> = {
    IDLE: '✨ Chọn thẻ từ vựng để Mèo tụ phép!',
    CHARGING: '🔮 Mèo đang tụ năng lượng từ các thẻ đã chọn...',
    ATTACK: '⚡ Mèo Pháp Sư tung chiêu giải mã!',
    HURT: '💥 Á! Sai ngữ pháp hoặc dính phản đòn!',
    VICTORY: '🎉 Chiến thắng! Mèo nhảy ăn mừng!',
  };
  banner.textContent = labels[newState] || labels.IDLE;
}

// ==================== CARD SELECTION & SYNERGY ====================
export function toggleSelectCard(cardId: string | number): void {
  if (game.isGameOver || game.isTransitioning) return;

  if (game.selectedIds.has(cardId)) {
    game.selectedIds.delete(cardId);
  } else {
    if (game.selectedIds.size >= 4) {
      showJudgeFeedback(false, 'Chỉ được kết hợp tối đa 4 thẻ từ vựng trong 1 lượt đánh!');
      return;
    }
    game.selectedIds.add(cardId);
    const selectedCard = game.hand.find((card) => String(card.id) === String(cardId));
    const sentenceInput = document.getElementById('sentence-input') as HTMLInputElement | null;
    if (selectedCard && sentenceInput) {
      const currentText = sentenceInput.value.trim();
      sentenceInput.value = currentText ? `${currentText} ${selectedCard.word}` : selectedCard.word;
      sentenceInput.focus();
      sentenceInput.setSelectionRange(sentenceInput.value.length, sentenceInput.value.length);
    }
  }

  playRetroSfx('card');
  setCatState(game.selectedIds.size > 0 ? 'CHARGING' : 'IDLE');
  renderCards();
  updateSynergyPreview();
}

export function rerollUnselectedCards(): void {
  if (game.rerollsLeft <= 0 || game.isTransitioning) return;
  game.rerollsLeft--;
  playRetroSfx('card');

  const usedIds = new Set(game.hand.map((c) => c.id));
  const pool = shuffleArray((activeCardsDatabase[game.lang] || []).filter((w) => !usedIds.has(w.id)));

  const refreshed = game.hand.map((card) => {
    if (game.selectedIds.has(card.id) || card.bombTurns !== null) return card;
    const replacement = pool.pop();
    if (!replacement) return card;
    return { ...replacement, element: getElementType(replacement), bombTurns: null };
  });

  game.hand = refreshed;
  renderCards();
  const rerollEl = document.getElementById('reroll-count');
  if (rerollEl) rerollEl.textContent = String(game.rerollsLeft);
}

function calculateSynergyStats() {
  const selectedCards = game.hand.filter((c) => game.selectedIds.has(c.id));
  const allInCheckbox = document.getElementById('toggle-all-in') as HTMLInputElement | null;
  const isAllIn = Boolean(allInCheckbox?.checked);

  if (selectedCards.length === 0) {
    return { selectedCards, totalDamage: 0, fireCount: 0, iceBonusSec: 0, hasTopicCombo: false, mult: 1, isAllIn };
  }

  let base = selectedCards.length * 32;
  if (game.buffs.has('heart_spring')) base += 15;
  if (game.buffs.has('arcane_claw') && selectedCards.length >= 3) base += 45;

  let mult = 1.0;
  const fireCount = selectedCards.filter((c) => c.element === 'fire').length;
  const iceCount = selectedCards.filter((c) => c.element === 'ice').length;

  // Thẻ Lửa (Fire)
  if (fireCount > 0) {
    const fireMult = game.buffs.has('eternal_fire') ? 2.5 : 2.0;
    mult *= Math.pow(fireMult, fireCount);
  }

  // Cộng hưởng chủ đề (Topic Resonance)
  const topicCounts: Record<string, number> = {};
  selectedCards.forEach((c) => {
    const t = c.topic || 'Chung';
    topicCounts[t] = (topicCounts[t] || 0) + 1;
  });
  const hasTopicCombo = Object.values(topicCounts).some((cnt) => cnt >= 2);
  if (hasTopicCombo) {
    mult *= game.buffs.has('resonance_master') ? 1.9 : 1.5;
  }

  // Biến cố Bão Tốc Độ
  if (game.mutator?.type === 'blitz') {
    mult *= 1.35;
  }

  // Cược Tất Tay
  if (isAllIn) {
    mult *= 1.5;
  }

  const icePerCard = game.buffs.has('frost_clock') ? 8 : 5;
  const iceBonusSec = iceCount * icePerCard;
  const totalDamage = Math.round(base * mult);

  return { selectedCards, totalDamage, fireCount, iceBonusSec, hasTopicCombo, mult, isAllIn };
}

function updateSynergyPreview(): void {
  const stats = calculateSynergyStats();
  const box = document.getElementById('synergy-preview');
  if (!box) return;

  if (stats.selectedCards.length === 0) {
    box.innerHTML = '<span>Chưa chọn thẻ bài nào. Hãy chạm vào thẻ từ vựng phía trên!</span>';
    return;
  }

  const badges: string[] = [];
  badges.push(`<span class="font-extrabold text-amber-300">⚔️ Sát thương dự kiến: ${stats.totalDamage}</span>`);
  if (stats.fireCount > 0) {
    badges.push(`<span class="px-1.5 py-0.5 rounded bg-orange-500/25 text-orange-300 font-bold">🔥 Lửa ×${stats.fireCount}</span>`);
  }
  if (stats.iceBonusSec > 0) {
    badges.push(`<span class="px-1.5 py-0.5 rounded bg-sky-500/25 text-sky-300 font-bold">❄️ +${stats.iceBonusSec}s</span>`);
  }
  if (stats.hasTopicCombo) {
    badges.push(`<span class="px-1.5 py-0.5 rounded bg-yellow-500/25 text-yellow-200 font-bold">⚡ Cộng hưởng chủ đề!</span>`);
  }

  box.innerHTML = badges.join(' ');
}

// ==================== ATTACK EVALUATION & COMBAT ====================
export function handleCastAttack(e: Event): void {
  e.preventDefault();
  if (game.isGameOver || game.isTransitioning) return;

  const inputEl = document.getElementById('sentence-input') as HTMLInputElement | null;
  const rawInput = inputEl?.value.trim() || '';
  const stats = calculateSynergyStats();

  if (stats.selectedCards.length === 0) {
    showJudgeFeedback(false, 'Bạn cần chọn ít nhất 1 thẻ từ vựng phía trên trước khi tung chiêu!');
    return;
  }

  if (rawInput.length < (game.lang === 'ja' ? 4 : 8)) {
    triggerWrongAnswer('Câu quá ngắn! Hãy đặt một câu có chủ ngữ và vị ngữ hoàn chỉnh.', stats.isAllIn);
    return;
  }

  // Kiểm tra Vùng Cấm Từ (Taboo Mutator)
  if (game.mutator?.type === 'taboo' && game.mutator.forbidden) {
    const lower = rawInput.toLowerCase();
    const violated = game.mutator.forbidden.find((fw) =>
      game.lang === 'en' ? new RegExp(`\\b${fw}\\b`, 'i').test(lower) : rawInput.includes(fw)
    );
    if (violated) {
      triggerWrongAnswer(`Vi phạm Vùng Cấm Từ! Bạn đã dùng từ bị cấm "${violated}".`, stats.isAllIn);
      return;
    }
  }

  // Kiểm tra xem tất cả các từ vựng đã chọn có xuất hiện trong câu không
  const lowerSentence = rawInput.toLowerCase();
  const missingCards = stats.selectedCards.filter((card) => {
    const forms = Array.isArray(card.forms) && card.forms.length ? card.forms : [card.word];
    return !forms.some((form) => {
      if (game.lang === 'en') {
        return new RegExp(`\\b${form.toLowerCase()}\\b`, 'i').test(lowerSentence);
      }
      return rawInput.includes(form);
    });
  });

  if (missingCards.length > 0) {
    const names = missingCards.map((c) => `"${c.word}"`).join(', ');
    triggerWrongAnswer(`Câu của bạn chưa chứa từ vựng đã chọn: ${names}.`, stats.isAllIn);
    return;
  }

  if (stats.isAllIn && stats.selectedCards.length < 2) {
    triggerWrongAnswer('Chế độ Cược Tất Tay yêu cầu ghép ít nhất 2 thẻ từ vựng trong cùng 1 câu!', true);
    return;
  }

  // Kiểm tra quy tắc ngữ pháp / văn hóa
  if (game.rule && typeof game.rule.check === 'function' && !game.rule.check(rawInput)) {
    triggerWrongAnswer(`Chưa đạt luật ải (${game.rule.title}): ${game.rule.failHint}`, stats.isAllIn);
    return;
  }

  executeSuccessfulAttack(rawInput, stats);
}

function executeSuccessfulAttack(sentence: string, stats: ReturnType<typeof calculateSynergyStats>): void {
  playRetroSfx('cast');
  setCatState('ATTACK', 900);

  let projType: 'lightning' | 'fire' | 'ice' | 'arcane' = 'arcane';
  if (stats.hasTopicCombo || stats.isAllIn) projType = 'lightning';
  else if (stats.fireCount > 0) projType = 'fire';
  else if (stats.iceBonusSec > 0) projType = 'ice';

  game.projectiles.push({
    x: 132,
    y: 36,
    targetX: 214,
    targetY: 36,
    vx: 5.2,
    type: projType,
    damage: stats.totalDamage,
    stats,
    sentence,
  });

  const inputEl = document.getElementById('sentence-input') as HTMLInputElement | null;
  if (inputEl) inputEl.value = '';

  const usedIds = new Set(stats.selectedCards.map((c) => c.id));
  game.wordsPracticed += usedIds.size;
  usedIds.forEach((id) => {
    const numId = Number(id);
    if (Number.isInteger(numId) && numId > 0) game.practicedWordIds.add(numId);
  });

  const currentPoolIds = new Set(game.hand.map((c) => c.id));
  const freshPool = shuffleArray((activeCardsDatabase[game.lang] || []).filter((w) => !currentPoolIds.has(w.id)));

  let bombExploded = false;
  game.hand = game.hand.map((card) => {
    if (usedIds.has(card.id)) {
      const replacement = freshPool.pop() || card;
      return { ...replacement, element: getElementType(replacement), bombTurns: null };
    }
    if (card.bombTurns !== null && typeof card.bombTurns === 'number') {
      card.bombTurns -= 1;
      if (card.bombTurns <= 0) {
        bombExploded = true;
        card.bombTurns = null;
      }
    }
    return card;
  });

  game.selectedIds.clear();
  renderCards();
  updateSynergyPreview();

  if (bombExploded) {
    setTimeout(() => {
      handlePlayerDamage('💣 Bom Hẹn Giờ phát nổ vì chưa giải kịp thẻ bị nguyền rủa!');
    }, 650);
  }
}

function applyProjectileImpact(proj: any): void {
  playRetroSfx('hit');
  game.hitStop = 4;
  game.screenShake = proj.type === 'lightning' ? 7 : 5;
  game.boss.hurtTimer = 14;

  game.boss.hp = Math.max(0, game.boss.hp - proj.damage);

  if (proj.stats.iceBonusSec > 0) {
    game.timeLeft = Math.min(60, game.timeLeft + proj.stats.iceBonusSec);
    updateTimerHUD();
  }

  const gainedXp = Math.round((25 + proj.stats.selectedCards.length * 15) * (proj.stats.isAllIn ? 2 : 1));
  game.xp += gainedXp;

  const colorsMap: Record<string, string[]> = {
    fire: ['#ff595e', '#ff924c', '#ffd541', '#ffffff'],
    ice: ['#38bdf8', '#7dd3fc', '#e0f2fe', '#ffffff'],
    lightning: ['#ffd541', '#fde047', '#c084fc', '#ffffff'],
    arcane: ['#f472b6', '#818cf8', '#5ce1e6', '#ffffff'],
  };
  const colors = colorsMap[proj.type] || colorsMap.arcane;

  for (let i = 0; i < 24; i++) {
    const angle = (Math.PI * 2 * i) / 24 + Math.random() * 0.3;
    const speed = 1.2 + Math.random() * 3.2;
    game.particles.push({
      x: proj.targetX,
      y: proj.targetY,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 0.8,
      life: 22 + Math.floor(Math.random() * 14),
      color: colors[i % colors.length],
      size: Math.random() > 0.5 ? 2 : 1,
    });
  }

  game.floatingTexts.push({
    x: proj.targetX - 10,
    y: proj.targetY - 14,
    text: `-${proj.damage}!`,
    color: proj.type === 'lightning' ? '#ffd541' : '#ffffff',
    life: 48,
  });

  const bonusNotes: string[] = [];
  if (proj.stats.fireCount > 0) bonusNotes.push(`🔥 Thẻ Lửa ×${proj.stats.fireCount}`);
  if (proj.stats.iceBonusSec > 0) bonusNotes.push(`❄️ +${proj.stats.iceBonusSec}s đóng băng`);
  if (proj.stats.hasTopicCombo) bonusNotes.push('⚡ Cộng hưởng chủ đề');
  if (proj.stats.isAllIn) bonusNotes.push('🎲 Cược Tất Tay ×2 XP');

  showJudgeFeedback(
    true,
    `Chuẩn ngữ pháp <strong>${game.rule?.title || 'Chính xác'}</strong>! Gây <strong>${proj.damage} sát thương</strong> (+${gainedXp} XP). ${bonusNotes.length ? 'Kích hoạt: ' + bonusNotes.join(' • ') : ''}`,
    game.rule?.tip ? `Gợi ý diễn đạt tự nhiên: "${game.rule.tip}"` : ''
  );

  updateTopHUD();

  if (game.boss.hp <= 0) {
    handleBossDefeated();
  }
}

function triggerWrongAnswer(reason: string, isAllInPenalty = false): void {
  handlePlayerDamage(reason);
  showJudgeFeedback(false, reason, game.rule?.tip ? `Ví dụ mẫu đúng luật: "${game.rule.tip}"` : '');
}

function handlePlayerDamage(reason: string): void {
  playRetroSfx('hurt');
  setCatState('HURT', 1100);
  game.screenShake = 6;

  // Nếu không phải gói unlimited hearts thì trừ tim
  if (!game.isUnlimitedHearts) {
    game.hearts = Math.max(0, game.hearts - 1);
  }

  game.floatingTexts.push({
    x: game.cat.x - 6,
    y: game.cat.y - 34,
    text: game.isUnlimitedHearts ? '🛡️ Shield' : '-1 ♥',
    color: '#ff595e',
    life: 45,
  });

  updateTopHUD();

  if (game.hearts <= 0) {
    game.isGameOver = true;
    void saveGameProgress();
    clearInterval(game.timerInterval);

    const reasonEl = document.getElementById('gameover-reason');
    if (reasonEl) reasonEl.textContent = reason;
    const floorEl = document.getElementById('stat-final-floor');
    if (floorEl) floorEl.textContent = `Tầng ${game.floor}`;
    const xpEl = document.getElementById('stat-final-xp');
    if (xpEl) xpEl.textContent = `${game.xp} XP`;
    const wordsEl = document.getElementById('stat-final-words');
    if (wordsEl) wordsEl.textContent = `${game.wordsPracticed} từ`;

    setTimeout(() => {
      const modal = document.getElementById('gameover-modal');
      modal?.classList.remove('hidden');
      modal?.classList.add('flex');
    }, 700);
  }
}

function handleBossDefeated(): void {
  game.boss.defeated = true;
  game.isTransitioning = true;
  clearInterval(game.timerInterval);
  playRetroSfx('victory');
  setCatState('VICTORY');

  for (let i = 0; i < 20; i++) {
    game.particles.push({
      x: game.cat.x + (Math.random() - 0.5) * 36,
      y: game.cat.y - 24,
      vx: (Math.random() - 0.5) * 1.4,
      vy: -1.0 - Math.random() * 1.8,
      life: 45,
      color: i % 2 === 0 ? '#ff7eb6' : '#ffd541',
      size: 2,
    });
  }

  // Tự động lưu tiến độ định kỳ sau khi qua mỗi tầng
  void saveGameProgress();

  setTimeout(() => {
    const choices = shuffleArray(PASSIVE_BUFFS).slice(0, 3);
    const container = document.getElementById('buff-choices');
    if (container) {
      container.innerHTML = choices
        .map(
          (b) => `
        <button onclick="selectPassiveBuff('${b.id}')" class="pixel-btn p-4 rounded-2xl bg-slate-900/95 hover:bg-indigo-950 border-2 border-indigo-400/50 hover:border-amber-400 flex flex-col justify-between gap-2 text-left transition cursor-pointer">
          <div>
            <div class="text-2xl mb-1.5">${b.icon}</div>
            <div class="font-extrabold text-sm text-amber-300">${b.name}</div>
            <p class="text-xs text-slate-300 mt-1 leading-relaxed">${b.desc}</p>
          </div>
          <div class="text-[11px] font-bold text-indigo-300 pt-1">Chọn bùa lợi ➔</div>
        </button>
      `
        )
        .join('');
    }

    const modal = document.getElementById('buff-modal');
    modal?.classList.remove('hidden');
    modal?.classList.add('flex');
  }, 950);
}

export function selectPassiveBuff(buffId: string): void {
  game.buffs.add(buffId);
  if (buffId === 'heart_spring' && !game.isUnlimitedHearts) {
    game.hearts = Math.min(game.maxHearts, game.hearts + 1);
  }
  playRetroSfx('card');

  const modal = document.getElementById('buff-modal');
  modal?.classList.add('hidden');
  modal?.classList.remove('flex');
  updateTopHUD();
  generateFloor(game.floor + 1);
}

export function restartGame(): void {
  if (!game.dataReady) return;
  game.hearts = game.maxHearts;
  game.xp = 0;
  game.wordsPracticed = 0;
  game.practicedWordIds.clear();
  game.progressSaved = false;
  game.buffs.clear();
  game.isGameOver = false;

  const modal = document.getElementById('gameover-modal');
  modal?.classList.add('hidden');
  modal?.classList.remove('flex');
  updateTopHUD();
  generateFloor(1);
}

export async function switchLanguage(newLang: 'en' | 'ja'): Promise<void> {
  if (game.lang === newLang && activeCardsDatabase[newLang].length > 0) return;

  game.dataReady = false;
  clearInterval(game.timerInterval);
  game.lang = newLang;
  playRetroSfx('card');

  const enBtn = document.getElementById('lang-en-btn');
  const jaBtn = document.getElementById('lang-ja-btn');
  if (enBtn) {
    enBtn.className =
      newLang === 'en'
        ? 'px-2.5 py-1 rounded-lg text-xs font-bold transition-all bg-indigo-600 text-white shadow'
        : 'px-2.5 py-1 rounded-lg text-xs font-bold transition-all text-indigo-300 hover:text-white';
  }
  if (jaBtn) {
    jaBtn.className =
      newLang === 'ja'
        ? 'px-2.5 py-1 rounded-lg text-xs font-bold transition-all bg-rose-600 text-white shadow'
        : 'px-2.5 py-1 rounded-lg text-xs font-bold transition-all text-indigo-300 hover:text-white';
  }

  const input = document.getElementById('sentence-input') as HTMLInputElement | null;
  if (input) {
    input.placeholder =
      newLang === 'en'
        ? 'Nhập câu tiếng Anh kết hợp các thẻ từ đã chọn...'
        : 'Nhập câu tiếng Nhật (Hiragana hoặc Kanji) kết hợp thẻ từ đã chọn...';
  }

  // Tải từ vựng CSDL thật của ngôn ngữ mới nếu chưa tải
  if (!activeCardsDatabase[newLang] || activeCardsDatabase[newLang].length === 0) {
    const loaded = await loadDatabaseGameState(newLang);
    if (!loaded) return;
  }

  game.dataReady = true;
  generateFloor(game.floor);
}

export function cycleCatSkin(): void {
  game.skinIndex = (game.skinIndex + 1) % CAT_SKINS.length;
  playRetroSfx('card');
  const label = document.getElementById('hero-skin-label');
  if (label) label.textContent = CAT_SKINS[game.skinIndex].name;
}

export function insertJaChip(token: string): void {
  const input = document.getElementById('sentence-input') as HTMLInputElement | null;
  if (!input) return;
  input.value += token;
  input.focus();
  playRetroSfx('card');
}

// ==================== UI RENDERING HELPERS ====================
function renderUI(): void {
  updateTopHUD();
  if (game.rule) {
    const catTag = document.getElementById('rule-category-tag');
    if (catTag) catTag.textContent = game.rule.category;
    const titleEl = document.getElementById('rule-title');
    if (titleEl) titleEl.textContent = game.rule.title;
    const descEl = document.getElementById('rule-desc');
    if (descEl) descEl.textContent = game.rule.desc;
  }

  const mutatorBox = document.getElementById('mutator-box');
  const mutatorText = document.getElementById('mutator-text');
  if (mutatorBox && mutatorText) {
    if (game.mutator) {
      mutatorText.textContent = game.mutator.label;
      mutatorBox.className = 'px-2.5 py-1.5 rounded-xl bg-rose-950/85 border border-rose-400/60 text-xs';
    } else {
      mutatorText.textContent = 'Không có (Tầng khởi đầu)';
      mutatorBox.className = 'px-2.5 py-1.5 rounded-xl bg-purple-950/80 border border-purple-400/40 text-xs';
    }
  }

  const rerollEl = document.getElementById('reroll-count');
  if (rerollEl) rerollEl.textContent = String(game.rerollsLeft);

  const jaBar = document.getElementById('ja-helper-bar');
  if (jaBar) {
    if (game.lang === 'ja') {
      jaBar.classList.remove('hidden');
      jaBar.classList.add('flex');
      jaBar.innerHTML =
        `<span class="text-[11px] font-bold text-pink-300 mr-1">Chèn nhanh:</span>` +
        JA_QUICK_CHIPS.map(
          (chip) => `
          <button type="button" onclick="insertJaChip('${chip}')" class="px-2 py-1 rounded-lg bg-slate-900 hover:bg-indigo-800 border border-indigo-400/40 text-xs font-bold text-white transition cursor-pointer">
            ${chip}
          </button>
        `
        ).join('');
    } else {
      jaBar.classList.add('hidden');
      jaBar.classList.remove('flex');
    }
  }

  renderCards();
  updateSynergyPreview();
  updateTimerHUD();
}

function updateTopHUD(): void {
  const floorEl = document.getElementById('hud-floor');
  if (floorEl) floorEl.textContent = `TẦNG ${game.floor}`;
  const xpEl = document.getElementById('hud-xp');
  if (xpEl) xpEl.textContent = `${game.xp} XP`;

  const heartsEl = document.getElementById('hud-hearts');
  if (heartsEl) {
    if (game.isUnlimitedHearts) {
      heartsEl.textContent = '❤️❤️❤️❤️❤️ (Vô hạn)';
      heartsEl.title = 'Tài khoản Premium: Không giới hạn tim!';
    } else {
      const heartsStr = '❤️'.repeat(game.hearts) + '🖤'.repeat(Math.max(0, game.maxHearts - game.hearts));
      heartsEl.textContent = heartsStr;
      heartsEl.title = `Sinh lực: ${game.hearts}/${game.maxHearts}`;
    }
  }

  const bossNameEl = document.getElementById('boss-name');
  if (bossNameEl) bossNameEl.textContent = game.boss.name;
  const bossHpEl = document.getElementById('boss-hp-text');
  if (bossHpEl) bossHpEl.textContent = `${game.boss.hp}/${game.boss.maxHp}`;
  const bossBar = document.getElementById('boss-hp-bar');
  if (bossBar) {
    const hpPct = Math.max(0, Math.min(100, (game.boss.hp / game.boss.maxHp) * 100));
    bossBar.style.width = `${hpPct}%`;
  }

  const buffsBar = document.getElementById('active-buffs-bar');
  if (buffsBar) {
    buffsBar.innerHTML = Array.from(game.buffs)
      .map((id) => {
        const b = PASSIVE_BUFFS.find((item) => item.id === id);
        if (!b) return '';
        return `<span title="${b.name}: ${b.desc}" class="px-1.5 py-0.5 rounded bg-slate-950/80 border border-amber-400/50 text-xs">${b.icon}</span>`;
      })
      .join('');
  }
}

function renderCards(): void {
  const grid = document.getElementById('cards-grid');
  if (!grid) return;

  if (game.hand.length === 0) {
    grid.innerHTML = `
      <div class="col-span-full py-8 text-center text-slate-400">
        <p class="text-sm">Đang tải thẻ bài từ CSDL...</p>
      </div>
    `;
    return;
  }

  grid.innerHTML = game.hand
    .map((card) => {
      const isSelected = game.selectedIds.has(card.id);
      const elementClass = card.element === 'fire' ? 'card-fire' : card.element === 'ice' ? 'card-ice' : 'card-neutral';

      const elementBadge =
        card.element === 'fire'
          ? `<span class="text-[10px] font-extrabold text-orange-300">🔥 ×${game.buffs.has('eternal_fire') ? '2.5' : '2.0'}</span>`
          : card.element === 'ice'
          ? `<span class="text-[10px] font-extrabold text-sky-300">❄️ +${game.buffs.has('frost_clock') ? '8s' : '5s'}</span>`
          : `<span class="text-[10px] font-bold text-indigo-300">✦ ${card.pos}</span>`;

      const bombHtml =
        card.bombTurns !== null && typeof card.bombTurns === 'number'
          ? `<span class="bomb-badge absolute -top-2 -right-1.5 px-1.5 py-0.5 rounded-md bg-rose-600 border border-amber-300 text-[10px] font-extrabold text-white shadow">💣 ${card.bombTurns}</span>`
          : '';

      return `
        <button
          type="button"
          onclick="toggleSelectCard('${card.id}')"
          class="vocab-card ${elementClass} ${isSelected ? 'selected' : ''} relative rounded-xl p-2.5 border-2 text-left flex flex-col justify-between min-h-[96px] cursor-pointer"
        >
          ${bombHtml}
          <div class="flex items-center justify-between gap-1 w-full">
            ${elementBadge}
            <span class="text-[10px] px-1.5 py-0.2 rounded bg-black/35 text-slate-300 font-semibold">${card.level}</span>
          </div>

          <div class="my-1">
            <div class="text-sm sm:text-base font-extrabold text-white leading-tight">${card.word}</div>
            ${card.kana ? `<div class="text-[11px] text-pink-300 font-medium">${card.kana}</div>` : ''}
            <div class="text-xs text-slate-300 truncate">${card.meaning}</div>
          </div>

          <div class="flex items-center justify-between text-[10px] text-indigo-200/80 border-t border-white/10 pt-1">
            <span class="truncate max-w-[90px]">🏷️ ${card.topic}</span>
            <span>${isSelected ? '✅ Đã chọn' : '+ Chọn'}</span>
          </div>
        </button>
      `;
    })
    .join('');
}

function showJudgeFeedback(isSuccess: boolean, mainText: string, subTip = ''): void {
  const panel = document.getElementById('ai-feedback-panel');
  if (!panel) return;
  panel.classList.remove('hidden');
  panel.className = isSuccess
    ? 'rounded-xl p-3 border text-xs sm:text-sm space-y-1 bg-emerald-950/75 border-emerald-400/60 text-emerald-100'
    : 'rounded-xl p-3 border text-xs sm:text-sm space-y-1 bg-rose-950/80 border-rose-400/60 text-rose-100';

  panel.innerHTML = `
    <div class="flex items-start gap-2">
      <span class="text-base shrink-0">${isSuccess ? '🤖✅' : '🤖⚠️'}</span>
      <div class="space-y-1">
        <div>${mainText}</div>
        ${subTip ? `<div class="text-xs opacity-85 italic">${subTip}</div>` : ''}
      </div>
    </div>
  `;
}

// ==================== 16-BIT PIXEL ART FLOATING WATERFALL ISLAND ====================
let arenaCanvas: HTMLCanvasElement | null = null;
let ctx: CanvasRenderingContext2D | null = null;
const W = 360;
const H = 185;
let tick = 0;

const backClouds = [
  { x: 18, y: 84, w: 68 },
  { x: 120, y: 92, w: 54 },
  { x: 245, y: 82, w: 76 },
  { x: 325, y: 90, w: 58 },
];
const midClouds = [
  { x: -10, y: 106, w: 85 },
  { x: 95, y: 116, w: 64 },
  { x: 228, y: 108, w: 92 },
  { x: 310, y: 118, w: 70 },
];
const frontClouds = [
  { x: -18, y: 132, w: 110 },
  { x: 75, y: 146, w: 75 },
  { x: 215, y: 138, w: 115 },
  { x: 295, y: 128, w: 95 },
];

function pxRect(x: number, y: number, w: number, h: number, color: string): void {
  if (!ctx) return;
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

function drawPixelSky(): void {
  if (!ctx) return;
  const bands = [
    { y: 0, h: 14, color: '#798ce8' },
    { y: 14, h: 14, color: '#8ea0ee' },
    { y: 28, h: 16, color: '#a6b2f2' },
    { y: 44, h: 18, color: '#c4bee9' },
    { y: 62, h: 22, color: '#e2bedf' },
    { y: 84, h: 52, color: '#f7c5d8' },
    { y: 136, h: 49, color: '#fbd3e0' },
  ];

  bands.forEach((b, idx) => {
    pxRect(0, b.y, W, b.h, b.color);
    if (idx > 0 && ctx) {
      ctx.fillStyle = bands[idx - 1].color;
      for (let x = 0; x < W; x += 4) {
        ctx.fillRect(x, b.y, 2, 1);
        ctx.fillRect(x + 2, b.y + 1, 2, 1);
      }
    }
  });

  const stars = [
    [34, 12],
    [78, 22],
    [148, 9],
    [286, 16],
    [332, 26],
    [195, 19],
  ];
  stars.forEach(([sx, sy], i) => {
    if ((tick + i * 17) % 60 < 42) {
      pxRect(sx, sy, 1, 1, '#ffffff');
    }
  });
}

function drawCloudCluster(cx: number, cy: number, width: number, topColor: string, midColor: string, shadowColor: string): void {
  const puffs = Math.max(3, Math.floor(width / 16));
  for (let i = 0; i < puffs; i++) {
    const px = cx + i * 14;
    const r = 10 + ((i * 7) % 7);
    const py = cy - (i % 2) * 4;
    pxRect(px - r, py - r + 4, r * 2, r + 10, shadowColor);
    pxRect(px - r + 1, py - r + 2, r * 2 - 2, r + 6, midColor);
    pxRect(px - r + 3, py - r, r * 2 - 6, 4, topColor);
  }
}

function drawParallaxClouds(): void {
  backClouds.forEach((c) => {
    const x = ((c.x + tick * 0.06) % (W + 100)) - 50;
    drawCloudCluster(x, c.y, c.w, '#fff8eb', '#ffe4d6', '#f2c4d4');
  });

  midClouds.forEach((c) => {
    const x = ((c.x - tick * 0.11 + W + 120) % (W + 120)) - 60;
    drawCloudCluster(x, c.y, c.w, '#f7d6f2', '#e4b2eb', '#c88ed9');
  });

  frontClouds.forEach((c) => {
    const x = ((c.x + tick * 0.16) % (W + 140)) - 70;
    drawCloudCluster(x, c.y, c.w, '#d9a7eb', '#a984d4', '#7664b3');
  });

  pxRect(0, 166, 118, 19, '#7664b3');
  pxRect(0, 173, 95, 12, '#5c4e96');
  pxRect(242, 164, 118, 21, '#7664b3');
  pxRect(262, 172, 98, 13, '#5c4e96');
}

function drawFloatingIsland(floatOffset: number): void {
  const iy = Math.round(floatOffset);

  const cliffRows = [
    { y: 54, x1: 84, x2: 276 },
    { y: 58, x1: 86, x2: 272 },
    { y: 63, x1: 90, x2: 268 },
    { y: 68, x1: 95, x2: 262 },
    { y: 74, x1: 101, x2: 256 },
    { y: 80, x1: 107, x2: 249 },
    { y: 86, x1: 114, x2: 241 },
    { y: 92, x1: 121, x2: 233 },
    { y: 99, x1: 129, x2: 225 },
    { y: 106, x1: 137, x2: 217 },
    { y: 114, x1: 145, x2: 209 },
    { y: 122, x1: 152, x2: 202 },
    { y: 130, x1: 158, x2: 196 },
    { y: 139, x1: 164, x2: 190 },
    { y: 148, x1: 169, x2: 184 },
    { y: 157, x1: 173, x2: 179 },
  ];

  cliffRows.forEach((row, idx) => {
    const h = idx < cliffRows.length - 1 ? cliffRows[idx + 1].y - row.y : 7;
    const w = row.x2 - row.x1;
    pxRect(row.x1, row.y + iy, w, h, '#3f2b3d');
    pxRect(row.x1 + 2, row.y + iy, Math.max(4, Math.floor(w * 0.28)), h, '#593e54');
    pxRect(row.x2 - Math.max(4, Math.floor(w * 0.24)), row.y + iy, Math.max(4, Math.floor(w * 0.24)), h, '#281927');
  });

  pxRect(91, 68 + iy, 3, 9, '#3f2b3d');
  pxRect(263, 66 + iy, 4, 14, '#281927');
  pxRect(264, 80 + iy, 2, 7, '#281927');
  pxRect(148, 128 + iy, 3, 12, '#3f2b3d');

  const sway = Math.sin(tick * 0.04) > 0.4 ? 1 : 0;
  drawPixelPineTree(218, 49 + iy, 16, sway);
  drawPixelPineTree(254, 49 + iy, 24, sway);
  drawPixelPineTree(236, 49 + iy, 31, sway);

  pxRect(83, 49 + iy, 194, 4, '#5cc22b');
  pxRect(85, 48 + iy, 190, 2, '#95eb3d');
  for (let gx = 86; gx < 272; gx += 6) {
    const drop = (gx * 7) % 3;
    pxRect(gx, 53 + iy, 4, 2 + drop, '#357d26');
  }

  pxRect(96, 46 + iy, 1, 2, '#5cc22b');
  pxRect(102, 47 + iy, 2, 1, '#fff078');
  pxRect(140, 47 + iy, 2, 1, '#ff85b3');

  const streams = [
    { x: 153, w: 6 },
    { x: 168, w: 17 },
    { x: 192, w: 6 },
  ];

  pxRect(114, 174, 132, 11, '#5a9cf5');
  pxRect(128, 172, 104, 4, '#8ac6ff');

  streams.forEach((st, sIdx) => {
    const topY = 50 + iy;
    const botY = 176;
    const totalH = botY - topY;

    pxRect(st.x, topY + 2, st.w, totalH - 2, '#4788f5');
    pxRect(st.x + 1, topY + 2, Math.max(2, st.w - 2), totalH - 2, '#73b9ff');
    pxRect(st.x - 1, topY, st.w + 2, 3, '#ffffff');
    pxRect(st.x, topY + 3, st.w, 2, '#c7e8ff');

    const scroll = (tick * 2 + sIdx * 7) % 12;
    for (let wy = topY + 4 + scroll; wy < botY - 4; wy += 12) {
      pxRect(st.x + 1, wy, 1, 6, '#ffffff');
      if (st.w > 10) {
        pxRect(st.x + 6, wy - 3, 2, 7, '#e0f4ff');
        pxRect(st.x + 12, wy + 1, 1, 6, '#ffffff');
      }
    }

    const splashPhase = Math.floor((tick + sIdx * 5) / 4) % 3;
    pxRect(st.x - 4 - splashPhase, 173, st.w + 8 + splashPhase * 2, 4, '#ffffff');
    pxRect(st.x - 2, 170 - (splashPhase % 2), 2, 2, '#ffffff');
    pxRect(st.x + st.w + 1, 171 - ((splashPhase + 1) % 2), 2, 2, '#ffffff');
  });
}

function drawPixelPineTree(baseX: number, baseY: number, height: number, sway: number): void {
  pxRect(baseX - 1, baseY - 4, 3, 4, '#4a2e22');
  const tiers = Math.floor(height / 5);
  for (let t = 0; t < tiers; t++) {
    const tierY = baseY - 5 - t * 4;
    const halfW = Math.max(2, Math.round((tiers - t) * 2.1));
    const sx = t >= tiers - 2 ? sway : 0;
    pxRect(baseX - halfW + sx, tierY - 3, halfW * 2, 4, '#245226');
    pxRect(baseX - halfW + sx, tierY - 3, Math.max(2, halfW * 2 - 2), 3, '#3b7d2c');
    pxRect(baseX - halfW + sx, tierY - 2, Math.max(2, Math.floor(halfW * 0.7)), 2, '#65ad3b');
  }
  pxRect(baseX + sway, baseY - 5 - tiers * 4, 1, 2, '#7ec44b');
}

function drawPixelCat(floatOffset: number): void {
  const skin = CAT_SKINS[game.skinIndex];
  const st = game.cat.state;

  let offsetX = 0;
  let offsetY = Math.round(floatOffset);
  let bobY = 0;

  if (st === 'IDLE') {
    bobY = Math.floor(tick / 18) % 2 === 0 ? 0 : -1;
  } else if (st === 'CHARGING') {
    bobY = Math.floor(tick / 8) % 2 === 0 ? -1 : -2;
  } else if (st === 'ATTACK') {
    offsetX = 18;
    offsetY -= 3;
  } else if (st === 'HURT') {
    offsetX = -6 + (tick % 4 < 2 ? -1 : 1);
  } else if (st === 'VICTORY') {
    offsetY -= Math.abs(Math.round(Math.sin(tick * 0.22) * 8));
  }

  const cx = game.cat.x + offsetX;
  const cy = game.cat.y + offsetY + bobY;

  pxRect(cx - 7, game.cat.y + Math.round(floatOffset) - 1, 14, 2, 'rgba(20, 14, 38, 0.45)');

  const furMain = st === 'HURT' && tick % 4 < 2 ? '#ff595e' : skin.fur;
  const furShade = st === 'HURT' && tick % 4 < 2 ? '#c9184a' : skin.furDark;

  const tailWag = Math.floor(tick / 12) % 2;
  pxRect(cx - 10, cy - 8, 3, 2, furShade);
  pxRect(cx - 12, cy - 11 - tailWag, 3, 4, furMain);
  pxRect(cx - 11, cy - 13 - tailWag, 2, 2, '#ffffff');

  pxRect(cx - 5, cy - 11, 10, 9, furMain);
  pxRect(cx - 3, cy - 9, 6, 6, '#fff8f0');
  pxRect(cx - 5, cy - 2, 4, 2, '#ffffff');
  pxRect(cx + 1, cy - 2, 4, 2, '#ffffff');

  pxRect(cx - 6, cy - 12, 12, 3, skin.scarf);
  pxRect(cx - 8, cy - 11 + tailWag, 3, 5, skin.scarf);

  pxRect(cx - 7, cy - 23, 14, 11, furMain);
  pxRect(cx - 6, cy - 24, 12, 1, furMain);
  pxRect(cx - 7, cy - 27, 4, 4, furMain);
  pxRect(cx - 6, cy - 26, 2, 2, '#ff85b3');
  pxRect(cx + 3, cy - 27, 4, 4, furMain);
  pxRect(cx + 4, cy - 26, 2, 2, '#ff85b3');

  pxRect(cx - 1, cy - 23, 2, 2, furShade);

  if (st === 'VICTORY') {
    pxRect(cx - 5, cy - 19, 3, 1, skin.eye);
    pxRect(cx + 2, cy - 19, 3, 1, skin.eye);
  } else if (st === 'HURT') {
    pxRect(cx - 5, cy - 19, 2, 2, skin.eye);
    pxRect(cx + 3, cy - 19, 2, 2, skin.eye);
  } else {
    pxRect(cx - 5, cy - 20, 2, 3, skin.eye);
    pxRect(cx - 5, cy - 20, 1, 1, '#ffffff');
    pxRect(cx + 3, cy - 20, 2, 3, skin.eye);
    pxRect(cx + 3, cy - 20, 1, 1, '#ffffff');
  }

  pxRect(cx - 6, cy - 16, 2, 1, '#ff7eb6');
  pxRect(cx + 4, cy - 16, 2, 1, '#ff7eb6');
  pxRect(cx - 1, cy - 17, 2, 1, '#ff7eb6');

  pxRect(cx - 6, cy - 26, 12, 2, skin.hat);
  pxRect(cx - 4, cy - 30, 8, 4, skin.hat);
  pxRect(cx - 2, cy - 33, 4, 3, skin.hat);
  pxRect(cx - 4, cy - 27, 8, 1, '#ffd541');

  const wandRaise = st === 'CHARGING' || st === 'ATTACK' ? -5 : 0;
  pxRect(cx + 7, cy - 16 + wandRaise, 2, 14, '#8d5524');
  const orbPulse = Math.floor(tick / 8) % 2 === 0;
  pxRect(cx + 6, cy - 19 + wandRaise, 4, 4, skin.staff);
  if (orbPulse || st === 'CHARGING') {
    pxRect(cx + 7, cy - 18 + wandRaise, 2, 2, '#ffffff');
  }

  if (st === 'CHARGING') {
    for (let i = 0; i < 4; i++) {
      const a = tick * 0.14 + (i * Math.PI) / 2;
      const ox = cx + Math.cos(a) * 14;
      const oy = cy - 14 + Math.sin(a) * 7;
      pxRect(ox, oy, 2, 2, i % 2 === 0 ? '#ffd541' : '#5ce1e6');
    }
  } else if (st === 'HURT') {
    const sx = cx + Math.sin(tick * 0.25) * 9;
    pxRect(sx, cy - 36, 2, 2, '#ffd541');
    pxRect(cx - Math.sin(tick * 0.25) * 9, cy - 35, 2, 2, '#ffffff');
  }
}

function drawPixelBoss(floatOffset: number): void {
  if (game.boss.defeated) return;

  const bounce = Math.round(Math.sin(tick * 0.08) * 1.5);
  const bx = 216;
  const by = 50 + Math.round(floatOffset) + bounce;
  const isHurt = game.boss.hurtTimer > 0;
  if (game.boss.hurtTimer > 0) game.boss.hurtTimer--;

  pxRect(bx - 10, 49 + Math.round(floatOffset), 20, 2, 'rgba(20, 14, 38, 0.45)');

  const key = game.boss.spriteKey;
  if (key === 'slime') {
    const cMain = isHurt ? '#ffffff' : '#10b981';
    const cDark = isHurt ? '#fda4af' : '#047857';
    const cLight = '#6ee7b7';
    pxRect(bx - 10, by - 12, 20, 12, cMain);
    pxRect(bx - 8, by - 16, 16, 4, cMain);
    pxRect(bx - 5, by - 19, 10, 3, cMain);
    pxRect(bx - 10, by - 4, 20, 4, cDark);
    pxRect(bx - 6, by - 14, 3, 3, cLight);
    pxRect(bx - 4, by - 22, 8, 3, '#ffd541');
    pxRect(bx - 5, by - 9, 2, 3, '#1e1b4b');
    pxRect(bx + 3, by - 9, 2, 3, '#1e1b4b');
  } else if (key === 'golem') {
    const cStone = isHurt ? '#ffffff' : '#475569';
    const cDark = isHurt ? '#fda4af' : '#1e293b';
    pxRect(bx - 11, by - 22, 22, 18, cStone);
    pxRect(bx - 14, by - 18, 4, 14, cDark);
    pxRect(bx + 10, by - 18, 4, 14, cDark);
    pxRect(bx - 8, by - 4, 6, 4, cDark);
    pxRect(bx + 2, by - 4, 6, 4, cDark);
    pxRect(bx - 6, by - 16, 4, 2, '#f43f5e');
    pxRect(bx + 2, by - 16, 4, 2, '#f43f5e');
    pxRect(bx - 3, by - 10, 6, 4, '#fb7185');
  } else if (key === 'knight') {
    const cArmor = isHurt ? '#ffffff' : '#6366f1';
    const cTrim = '#ffd541';
    pxRect(bx - 8, by - 22, 16, 18, cArmor);
    pxRect(bx - 10, by - 26, 3, 5, cTrim);
    pxRect(bx + 7, by - 26, 3, 5, cTrim);
    pxRect(bx - 6, by - 17, 12, 3, '#0f172a');
    pxRect(bx - 4, by - 16, 3, 2, '#38bdf8');
    pxRect(bx + 2, by - 16, 3, 2, '#38bdf8');
    pxRect(bx - 6, by - 4, 5, 4, '#312e81');
    pxRect(bx + 1, by - 4, 5, 4, '#312e81');
  } else {
    const cScale = isHurt ? '#ffffff' : '#9333ea';
    const cWing = isHurt ? '#fda4af' : '#c084fc';
    const flap = ((Math.floor(tick / 10) % 2) * 3);
    pxRect(bx - 15, by - 22 - flap, 7, 10, cWing);
    pxRect(bx + 8, by - 22 - flap, 7, 10, cWing);
    pxRect(bx - 9, by - 24, 18, 20, cScale);
    pxRect(bx - 5, by - 14, 10, 10, '#fde047');
    pxRect(bx - 5, by - 20, 3, 3, '#ffd541');
    pxRect(bx + 2, by - 20, 3, 3, '#ffd541');
  }
}

function updateAndDrawVFX(): void {
  for (let i = game.projectiles.length - 1; i >= 0; i--) {
    const p = game.projectiles[i];
    p.x += p.vx;

    game.particles.push({
      x: p.x - 2,
      y: p.y + (Math.random() - 0.5) * 4,
      vx: -0.6,
      vy: (Math.random() - 0.5) * 0.6,
      life: 10,
      color: p.type === 'fire' ? '#ff924c' : p.type === 'ice' ? '#7dd3fc' : '#ffd541',
      size: 2,
    });

    if (p.type === 'fire') {
      pxRect(p.x - 4, p.y - 4, 8, 8, '#ff595e');
      pxRect(p.x - 2, p.y - 2, 5, 5, '#ffd541');
    } else if (p.type === 'ice') {
      pxRect(p.x - 5, p.y - 2, 10, 4, '#38bdf8');
      pxRect(p.x - 2, p.y - 5, 4, 10, '#e0f2fe');
    } else {
      pxRect(p.x - 5, p.y - 3, 10, 6, '#ffd541');
      pxRect(p.x - 3, p.y - 1, 6, 2, '#ffffff');
    }

    if (p.x >= p.targetX) {
      applyProjectileImpact(p);
      game.projectiles.splice(i, 1);
    }
  }

  for (let i = game.particles.length - 1; i >= 0; i--) {
    const pt = game.particles[i];
    pt.x += pt.vx;
    pt.y += pt.vy;
    pt.life--;
    if (pt.life <= 0) {
      game.particles.splice(i, 1);
      continue;
    }
    pxRect(pt.x, pt.y, pt.size, pt.size, pt.color);
  }

  if (ctx) {
    ctx.font = 'bold 11px "Press Start 2P", monospace';
    for (let i = game.floatingTexts.length - 1; i >= 0; i--) {
      const ft = game.floatingTexts[i];
      ft.y -= 0.45;
      ft.life--;
      if (ft.life <= 0) {
        game.floatingTexts.splice(i, 1);
        continue;
      }
      ctx.fillStyle = '#130f26';
      ctx.fillText(ft.text, Math.round(ft.x) + 1, Math.round(ft.y) + 1);
      ctx.fillStyle = ft.color;
      ctx.fillText(ft.text, Math.round(ft.x), Math.round(ft.y));
    }
  }
}

function gameLoop(): void {
  if (game.hitStop > 0) {
    game.hitStop--;
    requestAnimationFrame(gameLoop);
    return;
  }

  tick++;
  if (ctx) ctx.imageSmoothingEnabled = false;

  if (game.cat.stateTimer > 0) {
    game.cat.stateTimer -= 16.6;
    if (game.cat.stateTimer <= 0 && !game.boss.defeated) {
      setCatState(game.selectedIds.size > 0 ? 'CHARGING' : 'IDLE');
    }
  }

  if (ctx) {
    ctx.save();
    if (game.screenShake > 0) {
      const sx = (Math.random() - 0.5) * game.screenShake;
      const sy = (Math.random() - 0.5) * game.screenShake;
      ctx.translate(Math.round(sx), Math.round(sy));
      game.screenShake = Math.max(0, game.screenShake - 0.45);
    }

    drawPixelSky();
    drawParallaxClouds();

    const islandFloat = Math.sin(tick * 0.035) * 2.2;
    drawFloatingIsland(islandFloat);

    drawPixelCat(islandFloat);
    drawPixelBoss(islandFloat);

    updateAndDrawVFX();
    ctx.restore();
  }

  requestAnimationFrame(gameLoop);
}

// ==================== WINDOW EXPORTS & BOOTSTRAP ====================
// Gắn các hàm gọi từ HTML onclick/onsubmit vào đối tượng window
Object.assign(window as any, {
  toggleSound,
  cycleCatSkin,
  switchLanguage,
  rerollUnselectedCards,
  handleCastAttack,
  restartGame,
  selectPassiveBuff,
  insertJaChip,
  toggleSelectCard,
  game,
});

export async function initGame(): Promise<void> {
  arenaCanvas = document.getElementById('pixel-arena') as HTMLCanvasElement | null;
  if (arenaCanvas) {
    ctx = arenaCanvas.getContext('2d');
  }

  // Chỉ khởi động game sau khi dữ liệu từ CSDL tải thành công.
  const loaded = await loadDatabaseGameState();
  if (!loaded) {
    game.dataReady = false;
    clearInterval(game.timerInterval);
    return;
  }
  game.dataReady = true;
  generateFloor(1);
  gameLoop();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => void initGame(), { once: true });
} else {
  void initGame();
}

