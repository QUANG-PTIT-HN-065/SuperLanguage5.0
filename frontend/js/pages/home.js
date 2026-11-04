// Trang chủ: gọi GET /api/health (qua axios trong js/api.js) để kiểm tra FE -> BE -> MySQL đã thông chưa.

async function checkHealth() {
  const box = document.getElementById("health-status");
  box.className = "status status-loading";
  box.textContent = "Đang kiểm tra kết nối...";

  try {
    const result = await api.get("/health");
    box.className = "status status-ok";
    box.textContent = `✅ Backend OK · MySQL: ${result.database}`;
  } catch (error) {
    box.className = "status status-error";
    // 503 = backend chạy nhưng không nối được MySQL; 0 = không gọi được backend
    box.textContent = `❌ ${error.status === 503 ? "Backend chạy nhưng MySQL lỗi: " + error.data.detail : error.message}`;
  }
}

document.getElementById("api-url").textContent = CONFIG.API_BASE_URL;
document.getElementById("btn-recheck").addEventListener("click", checkHealth);
checkHealth();
