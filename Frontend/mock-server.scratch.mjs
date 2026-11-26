// Scratch mock cho thử nghiệm: heal-offer + vocabulary practice (kiểm tra không cộng XP).
import { createServer } from "node:http";

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "content-type, authorization",
  "access-control-allow-methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  "access-control-allow-private-network": "true",
};

let healQty = 2;

const shopState = () => ({
  xp_total: 1200,
  xp_balance: 200,
  coin_balance: 500,
  items: [],
  inventory: [
    { item_id: "heal_hearts", title: "Hồi Phục Máu Siêu Tốc", icon: "fa-heart-pulse", quantity: healQty },
  ],
  transactions: [],
});

const WORDS = [
  { id: 1, word: "goodbye", meaning: "tạm biệt", phonetic: "/ɡʊdˈbaɪ/", level: "A1", example_sentence: "Say goodbye.", example_meaning: "Nói tạm biệt.", part_of_speech: "noun", mastery_level: 0 },
  { id: 2, word: "hello", meaning: "xin chào", phonetic: "/həˈləʊ/", level: "A1", example_sentence: "Hello, friend!", example_meaning: "Chào bạn!", part_of_speech: "noun", mastery_level: 0 },
  { id: 3, word: "apple", meaning: "quả táo", phonetic: "/ˈæpl/", level: "A1", example_sentence: "I eat an apple.", example_meaning: "Tôi ăn một quả táo.", part_of_speech: "noun", mastery_level: 0 },
  { id: 4, word: "book", meaning: "quyển sách", phonetic: "/bʊk/", level: "A1", example_sentence: "This book is fun.", example_meaning: "Quyển sách này thú vị.", part_of_speech: "noun", mastery_level: 0 },
];

const ok = (res, data) => {
  res.writeHead(200, { "content-type": "application/json", ...CORS });
  res.end(JSON.stringify({ status: "success", message: "ok", data, error: null }));
};

createServer((req, res) => {
  const url = new URL(req.url, "http://localhost").pathname;
  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", () => {
    console.log(`[mock] ${req.method} ${url} ${body}`);
    if (req.method === "OPTIONS") {
      res.writeHead(204, CORS);
      return res.end();
    }
    if (req.method === "GET" && url === "/api/v1/shop") return ok(res, shopState());
    if (req.method === "POST" && url === "/api/v1/shop/items/use") {
      healQty = Math.max(0, healQty - 1);
      console.log(`[mock] heal inventory now ${healQty}`);
      return ok(res, { healQty });
    }
    if (req.method === "GET" && url === "/api/v1/me") {
      return ok(res, { profile: { display_name: "Học viên", username: "hv", role: "learner" }, stats: { xp_total: 1200, current_streak: 3 }, plan: { max_hearts: 5 } });
    }
    if (req.method === "GET" && url === "/api/v1/vocabulary/learning-paths") {
      return ok(res, [{ id: 1, language_code: "ja", name: "JLPT N5" }]);
    }
    if (url === "/api/v1/vocabulary/learning-paths/1") {
      return ok(res, { topics: [{ id: 10, name: "Everyday Basics", is_completed: true }] });
    }
    if (url === "/api/v1/vocabulary/words") {
      return ok(res, { items: WORDS });
    }
    if (url.startsWith("/api/v1/vocabulary/words/") && url.endsWith("/review")) {
      return ok(res, { mastery_level: 1 });
    }
    if (req.method === "POST" && url === "/api/v1/minigame/progress") {
      console.log(`[mock] !!! XP PROGRESS REQUEST: ${body}`);
      return ok(res, { xp: 0, xp_total: 1200 });
    }
    ok(res, {});
  });
}).listen(8001, () => console.log("[mock] scratch mock on 8001"));
