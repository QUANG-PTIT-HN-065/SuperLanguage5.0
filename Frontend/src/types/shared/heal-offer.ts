import { isLearnerAuthenticated, slanguageApi } from "./api-client";
import { fillHearts, formatHeartLock, formatHearts, heartLockRemainingMs } from "./hearts";
import { t } from "./i18n";
import { showToast } from "../ui/toast";

const POTION_IMG = new URL("../../../assets/potion_red.png", import.meta.url).href;

interface ShopStateLite {
  inventory?: { item_id: string; quantity: number }[];
}

let activeOffer: HTMLElement | null = null;

function removeOffer(): void {
  activeOffer?.remove();
  activeOffer = null;
}

/**
 * Hết máu: HỎI người dùng có dùng Hồi Phục Máu Siêu Tốc trong kho hay không —
 * không tự động tiêu dùng vật phẩm. Resolve true nếu người dùng đã hồi máu thành công.
 */
export function offerHealPotion(): Promise<boolean> {
  return new Promise((resolve) => {
    if (activeOffer || !isLearnerAuthenticated()) {
      resolve(false);
      return;
    }

    let settled = false;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") finish(false);
    };
    const finish = (used: boolean) => {
      if (settled) return;
      settled = true;
      removeOffer();
      document.removeEventListener("keydown", onKey);
      resolve(used);
    };

    const backdrop = document.createElement("div");
    backdrop.className = "heal-offer-backdrop";
    backdrop.innerHTML = `
      <style>
        .heal-offer-backdrop { position: fixed; inset: 0; z-index: 1200000; display: flex; align-items: center; justify-content: center; padding: 20px 16px calc(20px + env(safe-area-inset-bottom, 0px)); background: rgba(8, 12, 24, 0.72); backdrop-filter: blur(6px); font-family: 'K2D', sans-serif; }
        .heal-offer-card { width: min(400px, 100%); background: linear-gradient(160deg, #1e293b 0%, #0f172a 100%); border: 1.5px solid rgba(251, 113, 133, 0.55); border-radius: 22px; box-shadow: 0 24px 60px rgba(0, 0, 0, 0.6), 0 0 34px rgba(251, 113, 133, 0.22); padding: 26px 22px 22px; text-align: center; color: #f1f5f9; animation: healOfferIn 0.22s cubic-bezier(0.34, 1.56, 0.64, 1); }
        .heal-offer-card:focus { outline: none; }
        @keyframes healOfferIn { from { transform: translateY(14px) scale(0.96); opacity: 0; } to { transform: none; opacity: 1; } }
        @media (prefers-reduced-motion: reduce) { .heal-offer-card { animation: none; } }
        .heal-offer-potion { width: 74px; height: 74px; object-fit: contain; margin: 0 auto 10px; filter: drop-shadow(0 6px 14px rgba(251, 113, 133, 0.4)); }
        .heal-offer-title { margin: 0 0 8px; font-size: 1.25rem; font-weight: 800; color: #FB7185; }
        .heal-offer-body { margin: 0 0 10px; font-size: 0.95rem; line-height: 1.55; color: #cbd5e1; }
        .heal-offer-stock { margin: 0 0 16px; font-size: 0.85rem; font-weight: 700; color: #fbbf24; }
        .heal-offer-actions { display: flex; flex-direction: column; gap: 10px; }
        .heal-offer-btn { width: 100%; min-height: 44px; border-radius: 14px; border: none; font: inherit; font-weight: 700; cursor: pointer; transition: transform 0.15s ease, filter 0.15s ease; }
        .heal-offer-btn:active { transform: scale(0.97); }
        .heal-offer-btn.use { background: linear-gradient(135deg, #FB7185 0%, #E11D48 100%); color: #ffffff; box-shadow: 0 6px 18px rgba(225, 29, 72, 0.4); }
        .heal-offer-btn.use:disabled { filter: grayscale(0.6) brightness(0.7); cursor: not-allowed; }
        .heal-offer-btn.shop { background: rgba(56, 189, 248, 0.14); color: #38BDF8; border: 1.5px solid rgba(56, 189, 248, 0.45); }
        .heal-offer-btn.later { background: transparent; color: #94a3b8; }
      </style>
      <div class="heal-offer-card" role="dialog" aria-modal="true" tabindex="-1" aria-label="${t("hh.title")}">
        <img class="heal-offer-potion" src="${POTION_IMG}" alt="">
        <h3 class="heal-offer-title">${t("hh.title")}</h3>
        <p class="heal-offer-body">${t("hh.body", { time: formatHeartLock(heartLockRemainingMs()) })}</p>
        <p class="heal-offer-stock" data-role="stock" hidden></p>
        <div class="heal-offer-actions">
          <button type="button" class="heal-offer-btn use" data-role="use">${t("hh.btnUse")}</button>
          <button type="button" class="heal-offer-btn shop" data-role="shop">${t("hh.btnShop")}</button>
          <button type="button" class="heal-offer-btn later" data-role="later">${t("hh.btnLater")}</button>
        </div>
      </div>
    `;
    activeOffer = backdrop;
    document.body.appendChild(backdrop);

    const card = backdrop.querySelector<HTMLElement>(".heal-offer-card");
    const stockLine = backdrop.querySelector<HTMLElement>("[data-role=stock]");
    const useButton = backdrop.querySelector<HTMLButtonElement>("[data-role=use]");

    card?.addEventListener("click", (event) => event.stopPropagation());
    backdrop.addEventListener("click", () => finish(false));
    backdrop.querySelector("[data-role=later]")?.addEventListener("click", () => finish(false));
    backdrop.querySelector("[data-role=shop]")?.addEventListener("click", () => {
      finish(false);
      window.location.assign("../shop/index.html");
    });
    useButton?.addEventListener("click", () => {
      void (async () => {
        if (!useButton) return;
        useButton.disabled = true;
        try {
          await slanguageApi("/api/v1/shop/items/use", {
            method: "POST",
            body: {
              request_id: crypto.randomUUID(),
              item_id: "heal_hearts",
              context: "lesson_heal",
            },
          });
          const hearts = fillHearts();
          showToast({ type: "success", message: t("hh.usedToast", { hearts: formatHearts(hearts) }) });
          finish(true);
        } catch (error) {
          useButton.disabled = false;
          showToast({
            type: "error",
            message: error instanceof Error ? error.message : t("hh.useFailed"),
          });
        }
      })();
    });
    document.addEventListener("keydown", onKey);
    // Đưa tiêu điểm vào chính hộp thoại chứ không vào nút "Dùng": nếu focus nằm ở nút,
    // phím Enter/Space của thao tác trước đó sẽ kích hoạt ngay bình máu.
    (card ?? useButton)?.focus();

    // Số bình máu trong kho quyết định nút dùng: hết bình thì chỉ còn đường mua trong Shop.
    void (async () => {
      try {
        const response = await slanguageApi<ShopStateLite>("/api/v1/shop");
        const quantity = response.data.inventory?.find((entry) => entry.item_id === "heal_hearts")?.quantity ?? 0;
        if (settled || !stockLine || !useButton) return;
        if (quantity > 0) {
          stockLine.textContent = t("hh.stock", { n: quantity });
        } else {
          stockLine.textContent = t("hh.stockEmpty");
          useButton.disabled = true;
        }
        stockLine.hidden = false;
      } catch {
        // Không đọc được kho: giữ nút dùng bật, để server trả lỗi cụ thể khi bấm.
      }
    })();
  });
}
