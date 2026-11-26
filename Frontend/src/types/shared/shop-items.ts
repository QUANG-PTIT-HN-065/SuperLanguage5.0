import { slanguageApi } from "./api-client";
import { fillHearts, formatHearts } from "./hearts";
import { showToast } from "../ui/toast";

/** Hết máu: dùng Hồi Phục Máu Siêu Tốc từ kho để hồi đầy, xóa khóa 24 giờ.
 * Chỉ gọi khi người dùng chủ động chọn dùng (nút game-over, hộp thoại heal-offer, Shop). */
export async function tryHealHearts(): Promise<boolean> {
  try {
    await slanguageApi("/api/v1/shop/items/use", {
      method: "POST",
      body: { request_id: crypto.randomUUID(), item_id: "heal_hearts", context: "lesson_heal" },
    });
  } catch {
    return false;
  }
  const hearts = fillHearts();
  showToast({ type: "success", message: `Đã dùng Hồi Phục Máu Siêu Tốc — máu hiện tại ${formatHearts(hearts)}, học tiếp nào!` });
  return true;
}