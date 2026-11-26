// Scratch mock tối thiểu cho trang select-language: chặn traffic vào 8000, log tên ảnh được xin.
import { createServer } from "node:http";

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "content-type, authorization",
  "access-control-allow-methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  "access-control-allow-private-network": "true",
};

createServer((req, res) => {
  const url = new URL(req.url, "http://localhost").pathname;
  console.log(`[mock] ${req.method} ${url}`);
  if (req.method === "OPTIONS") {
    res.writeHead(204, CORS);
    return res.end();
  }
  res.writeHead(404, { "content-type": "application/json", ...CORS });
  res.end(JSON.stringify({ status: "error", message: "scratch mock: no data needed", data: null, error: null }));
}).listen(8001, () => console.log("[mock] scratch server on 8001"));
