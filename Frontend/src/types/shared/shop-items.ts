import { slanguageApi } from "./api-client";
import { refillHearts } from "./hearts";
import { showToast } from "../ui/toast";

export interface ActiveBoost {
  item_id: string;
  title: string;
  multiplier: number;
  already_active?: boolean;
}

/** Vào bài học: server tự trừ kho và kích hoạt boost mạnh nhất (thắng/thua đều tính đã dùng). */
export async function activateBestBoost(): Promise<ActiveBoost | null> {
  try {
    const response = await slanguageApi<ActiveBoost | null>("/api/v1/shop/boost/activate", {
      method: "POST",
      body: { request_id: crypto.randomUUID() },
    });
    const boost = response.data;
    if (boost && !boost.already_active) {
      showToast({ type: "success", message: `Đã dùng ${boost.title} — hiệu ứng áp dụng cho bài học này.` });
    }
    return boost ?? null;
  } catch {
    return null;
  }
}

/** Hết máu: tự dùng Hồi Phục Máu Siêu Tốc từ kho để hồi +5 máu, xóa khóa 24 giờ. */
export async function tryHealHearts(): Promise<boolean> {
  try {
    await slanguageApi("/api/v1/shop/items/use", {
      method: "POST",
      body: { request_id: crypto.randomUUID(), item_id: "heal_hearts", context: "lesson_heal" },
    });
  } catch {
    return false;
  }
  const hearts = refillHearts(5);
  showToast({ type: "success", message: `Đã dùng Hồi Phục Máu Siêu Tốc (+5 ❤️) — máu hiện tại ${hearts}/5, học tiếp nào!` });
  return true;
}