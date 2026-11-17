import http from "node:http";

const SCENARIO = process.env.SCENARIO || "passed";

const profile = {
  id: "u-1",
  username: "hien",
  display_name: "Nguyễn Hiến",
  email: "hien@example.com",
  role: "learner",
  target_language: "ja",
  native_language: "vi",
  avatar_url: null,
  timezone: "Asia/Ho_Chi_Minh",
};
let xpTotal = 130;

const topics = [
  { id: 101, name: "Chào hỏi & Làm quen", is_completed: SCENARIO === "passed", is_locked: false },
  { id: 102, name: "Gia đình & Bạn bè", is_completed: SCENARIO === "passed", is_locked: false },
  { id: 103, name: "Ẩm thực & Mua sắm", is_completed: false, is_locked: false },
  { id: 104, name: "Du lịch & Phương hướng", is_completed: false, is_locked: true },
];

const words = {
  101: [
    { id: 1, word: "こんにちは", phonetic: "konnichiwa", meaning: "Xin chào (buổi trưa)", part_of_speech: "phrase", example_sentence: "こんにちは、元気ですか。", example_meaning: "Xin chào, bạn có khỏe không?", level: "A1", mastery_level: 5 },
    { id: 2, word: "ありがとう", phonetic: "arigatou", meaning: "Cảm ơn", part_of_speech: "phrase", example_sentence: "ありがとう、助かりました。", example_meaning: "Cảm ơn, bạn đã giúp tôi rất nhiều.", level: "A1", mastery_level: 2 },
    { id: 3, word: "すみません", phonetic: "sumimasen", meaning: "Xin lỗi / Xin phép", part_of_speech: "phrase", example_sentence: "すみません、駅はどこですか。", example_meaning: "Xin lỗi, nhà ga ở đâu ạ?", level: "A1", mastery_level: 0 },
  ],
  102: [
    { id: 4, word: "家族", phonetic: "kazoku", meaning: "Gia đình", part_of_speech: "noun", example_sentence: "私の家族は四人です。", example_meaning: "Gia đình tôi có bốn người.", level: "A1", mastery_level: 5 },
    { id: 5, word: "友達", phonetic: "tomodachi", meaning: "Bạn bè", part_of_speech: "noun", example_sentence: "友達と公園で遊びます。", example_meaning: "Tôi chơi với bạn ở công viên.", level: "A1", mastery_level: 0 },
  ],
};
const mastery = new Map();
for (const list of Object.values(words)) for (const w of list) mastery.set(w.id, w.mastery_level);

const json = (res, code, body) => {
  res.writeHead(code, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "content-type,authorization",
    "Access-Control-Allow-Methods": "GET,POST,PATCH,OPTIONS",
  });
  res.end(JSON.stringify(body));
};
const ok = (res, data) => json(res, 200, { status: "success", message: "ok", data });

const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  const path = url.pathname;
  if (req.method === "OPTIONS") return json(res, 204, {});
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const payload = body ? JSON.parse(body) : {};
    if (path === "/api/v1/me" && req.method === "GET") {
      return ok(res, { profile, stats: { xp_total: xpTotal, current_streak: 1 }, plan: { max_hearts: 5 }, daily_activity: [], needs_onboarding: false });
    }
    if (path === "/api/v1/me" && req.method === "PATCH") {
      Object.assign(profile, payload);
      return ok(res, { profile, stats: { xp_total: xpTotal, current_streak: 1 }, plan: { max_hearts: 5 } });
    }
    if (path === "/api/v1/vocabulary/learning-paths" && req.method === "GET") {
      return ok(res, [{ id: 7, language_code: "ja", name: "Lộ trình tiếng Nhật", topic_count: 4 }]);
    }
    if (path === "/api/v1/vocabulary/learning-paths/7" && req.method === "GET") {
      return ok(res, { id: 7, language_code: "ja", name: "Lộ trình tiếng Nhật", topics });
    }
    if (path === "/api/v1/vocabulary/words" && req.method === "GET") {
      const topicId = Number(url.searchParams.get("topic_id"));
      const items = (words[topicId] || []).map((w) => ({
        ...w,
        language_code: "ja",
        audio_url: null,
        created_at: "2025-01-01T00:00:00Z",
        mastery_level: mastery.get(w.id) ?? 0,
        is_mastered: (mastery.get(w.id) ?? 0) >= 5,
      }));
      return ok(res, { items, total: items.length, available: items.length, limit: 100, offset: 0, plan: "free", topic: topics.find((t) => t.id === topicId) || null });
    }
    const reviewMatch = path.match(/^\/api\/v1\/vocabulary\/words\/(\d+)\/review$/);
    if (reviewMatch && req.method === "POST") {
      const id = Number(reviewMatch[1]);
      const current = mastery.get(id) ?? 0;
      const next = payload.rating === "Khó" ? Math.max(0, current - 1) : Math.min(5, current + 1);
      mastery.set(id, next);
      return ok(res, { word_id: id, review_id: payload.review_id, rating: payload.rating, mastery_level: next, review_count: 1, last_reviewed_at: new Date().toISOString(), next_review_at: new Date().toISOString(), already_applied: false });
    }
    if (path === "/api/v1/minigame/progress" && req.method === "POST") {
      xpTotal += payload.xp || 0;
      return ok(res, { xp: payload.xp, activity: { xp_earned: payload.xp } });
    }
    return json(res, 404, { status: "error", message: `mock missing ${req.method} ${path}` });
  });
});

server.listen(8001, "127.0.0.1", () => console.log(`vocab mock ready scenario=${SCENARIO}`));