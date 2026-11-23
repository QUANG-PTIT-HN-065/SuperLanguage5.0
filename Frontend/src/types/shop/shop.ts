import { initializeLearnerHeader } from "../shared/learner-header";
import { isLearnerAuthenticated, slanguageApi, type ApiResponse } from "../shared/api-client";
import { applyI18n, t, LOCALE_EVENT } from "../shared/i18n";
import { clearSkeleton, showSkeleton } from "../shared/skeleton";
import { readHearts, refillHearts } from "../shared/hearts";

interface ShopItem {
  id: string;
  title: string;
  description: string;
  cost_coins: number;
  icon: string;
  badge: string;
  badge_class: string;
  category: "boost" | "heal" | "shield";
  limit_period: "daily" | "monthly";
  limit_count: number;
  remaining_limit: number;
  non_stacking: boolean;
}

interface ShopInventoryItem {
  item_id: string;
  title: string;
  icon: string;
  quantity: number;
}

interface ShopTransaction {
  id: string;
  type: "exchange" | "purchase";
  title: string;
  details: string;
  xp_delta: number;
  coin_delta: number;
  created_at: string;
}

interface ShopState {
  xp_total: number;
  xp_balance: number;
  coin_balance: number;
  items: ShopItem[];
  inventory: ShopInventoryItem[];
  transactions: ShopTransaction[];
}

// Ảnh vật phẩm dùng lại thiết kế prototype (Fallback: icon Font Awesome từ API)
const ITEM_IMAGES: Record<string, string> = {
  heal_hearts: "../../../assets/potion_red.png",
  heal_potion: "../../../assets/potion_red.png",
  boost_xp_10: "../../../assets/potion_yellow.png",
  double_xp: "../../../assets/potion_yellow.png",
  streak_freeze: "../../../assets/potion_blue.png",
};

function itemVisual(id: string, iconClass: string, cssClass: string, alt: string): string {
  const image = ITEM_IMAGES[id];
  if (image) return `<img src="${image}" alt="${alt}" class="${cssClass}">`;
  return `<i class="${iconClass}"></i>`;
}

class SlanguageShopApp {
  private state: ShopState | null = null;
  private readonly xpInput = document.getElementById("xpExchangeInput") as HTMLInputElement | null;
  private readonly exchangeButton = document.getElementById("btnExecuteExchange") as HTMLButtonElement | null;
  private readonly itemsGrid = document.getElementById("shopItemsGrid");
  private readonly inventoryList = document.getElementById("inventoryList");
  private readonly historyBody = document.getElementById("historyTableBody");
  private readonly modalOverlay = document.getElementById("shopModalOverlay");
  private readonly modalBody = document.getElementById("modalBodyContent");
  private readonly loadingMessage = this.createMessageElement();

  constructor() {
    if (!isLearnerAuthenticated()) {
      window.location.replace("../login/index.html");
      return;
    }

    void initializeLearnerHeader();
    document.title = t("sh.pageTitle");
    this.bindEvents();
    void this.loadState();

    window.addEventListener(LOCALE_EVENT, () => {
      applyI18n();
      document.title = t("sh.pageTitle");
      if (this.state) {
        this.renderItems();
        this.renderInventory();
        this.renderHistory();
        this.updateExchangePreview();
      }
    });
  }

  private createMessageElement(): HTMLElement {
    const message = document.createElement("p");
    message.id = "shopStatusMessage";
    message.setAttribute("role", "status");
    message.textContent = t("sh.loading");
    document.querySelector(".shop-main")?.prepend(message);
    return message;
  }

  private bindEvents(): void {
    this.xpInput?.addEventListener("input", () => this.updateExchangePreview());
    document.getElementById("btnMinusXP")?.addEventListener("click", () => this.adjustExchange(-5));
    document.getElementById("btnPlusXP")?.addEventListener("click", () => this.adjustExchange(5));
    document.querySelectorAll<HTMLButtonElement>(".quick-xp-btn").forEach((button) => {
      button.addEventListener("click", () => {
        const amount = button.dataset.xp === "max"
          ? Math.floor((this.state?.xp_balance ?? 0) / 5) * 5
          : Number(button.dataset.xp);
        if (this.xpInput && Number.isFinite(amount)) {
          this.xpInput.value = String(amount);
          this.updateExchangePreview();
        }
      });
    });

    this.exchangeButton?.addEventListener("click", () => void this.exchangeXP());
    this.itemsGrid?.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const button = target.closest<HTMLButtonElement>("[data-purchase-item]");
      if (button?.dataset.purchaseItem) void this.purchaseItem(button.dataset.purchaseItem);
    });

    document.getElementById("modalCloseBtn")?.addEventListener("click", () => this.closeModal());
    this.modalOverlay?.addEventListener("click", (event) => {
      if (event.target === this.modalOverlay) this.closeModal();
    });
    window.addEventListener("keydown", (event) => {
      if (event.key === "Escape") this.closeModal();
    });
    this.modalBody?.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const button = target.closest<HTMLButtonElement>("[data-modal-action]");
      if (!button) return;
      const action = button.dataset.modalAction;
      const itemId = button.dataset.itemModalId;
      if (action === "close") this.closeModal();
      else if (action === "buy" && itemId) void this.executePurchase(itemId);
      else if (action === "use" && itemId) void this.executeUseItem(itemId);
      else if (action === "goto-exchange") this.scrollToExchange();
    });
    this.inventoryList?.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const row = target.closest<HTMLElement>("[data-use-item-id]");
      if (!row) return;
      const itemId = row.dataset.useItemId;
      if (itemId) this.confirmUseItem(itemId);
    });
  }

  private async loadState(): Promise<void> {
    this.setBusy(true);
    showSkeleton(this.itemsGrid, "shop-cards", { tone: "dark", count: 6 });
    showSkeleton(this.inventoryList, "inventory-rows", { tone: "dark", count: 3 });
    showSkeleton(this.historyBody, "table-rows", { tone: "dark", cols: 4, count: 4 });
    try {
      const response = await slanguageApi<ShopState>("/api/v1/shop");
      this.state = response.data;
      this.render();
      this.loadingMessage.textContent = "";
    } catch (error) {
      clearSkeleton(this.itemsGrid);
      clearSkeleton(this.inventoryList);
      clearSkeleton(this.historyBody);
      this.showMessage(error instanceof Error ? error.message : t("sh.loadError"));
    } finally {
      this.setBusy(false);
    }
  }

  private async exchangeXP(): Promise<void> {
    const amount = Number(this.xpInput?.value);
    if (!Number.isInteger(amount) || amount < 5 || amount % 5 !== 0) {
      this.showMessage(t("sh.invalidAmount"));
      return;
    }
    if (amount > (this.state?.xp_balance ?? 0)) {
      this.showMessage(t("sh.insufficientXp"));
      return;
    }

    await this.runTransaction("/api/v1/shop/exchange", {
      request_id: crypto.randomUUID(),
      xp_amount: amount,
    }, (response) => {
      this.showSuccessModal(
        t("sh.modalExchangeSuccessTitle"),
        t("sh.modalExchangeSuccessDesc", { xp: this.format(amount), coins: this.format(amount / 5) }),
        response.message || t("sh.exchangeResultSub")
      );
    });
  }

  private purchaseItem(itemId: string): void {
    const item = this.state?.items.find((entry) => entry.id === itemId);
    if (!item) return;

    const period = item.limit_period === "daily" ? t("sh.limitDaily") : t("sh.limitMonthly");
    if (item.remaining_limit < 1) {
      this.showToast(t("sh.toastLimitReached", { period }));
      return;
    }
    const balance = this.state?.coin_balance ?? 0;
    if (item.cost_coins > balance) {
      this.showInsufficientCoinsModal(item, balance);
      return;
    }
    if (item.non_stacking && this.hasActiveBoost()) {
      this.showNonStackModal(item);
      return;
    }
    this.showConfirmPurchaseModal(item, balance);
  }

  private hasActiveBoost(): boolean {
    return (this.state?.inventory ?? []).some(
      (entry) => (entry.item_id === "boost_xp_10" || entry.item_id === "double_xp") && entry.quantity > 0
    );
  }

  private showConfirmPurchaseModal(item: ShopItem, balance: number): void {
    const title = this.escape(item.title);
    this.openDialog({
      iconClass: "success",
      icon: "fa-solid fa-bag-shopping",
      titleHtml: t("sh.modalConfirmBuyTitle"),
      descHtml: t("sh.modalConfirmBuyDesc", { title, coins: this.format(item.cost_coins) }),
      subHtml: t("sh.modalConfirmBuySub", {
        balance: this.format(balance),
        after: this.format(balance - item.cost_coins),
      }),
      footerHtml: `
        <button type="button" class="btn-dialog-secondary" data-modal-action="close">
          <i class="fa-solid fa-xmark"></i> ${this.escape(t("sh.modalBtnCancel"))}
        </button>
        <button type="button" class="btn-dialog-action" data-modal-action="buy" data-item-modal-id="${this.escape(item.id)}">
          <i class="fa-solid fa-check"></i> ${this.escape(t("sh.modalBtnBuyNow"))}
        </button>`,
    });
  }

  private showInsufficientCoinsModal(item: ShopItem, balance: number): void {
    const shortage = item.cost_coins - balance;
    this.openDialog({
      iconClass: "warning",
      icon: "fa-solid fa-triangle-exclamation",
      titleHtml: t("sh.modalNotEnoughCoinsTitle"),
      descHtml: t("sh.modalNotEnoughCoinsDesc", { shortage: this.format(shortage), title: this.escape(item.title) }),
      subHtml: t("sh.modalNotEnoughCoinsSub", { neededXP: this.format(shortage * 5), shortage: this.format(shortage) }),
      footerHtml: `
        <button type="button" class="btn-dialog-secondary" data-modal-action="close">
          ${this.escape(t("sh.modalBtnClose"))}
        </button>
        <button type="button" class="btn-dialog-action" data-modal-action="goto-exchange">
          <i class="fa-solid fa-arrow-up"></i> ${this.escape(t("sh.modalBtnGotoExchange"))}
        </button>`,
    });
  }

  private showNonStackModal(item: ShopItem): void {
    this.openDialog({
      iconClass: "warning",
      icon: "fa-solid fa-triangle-exclamation",
      titleHtml: t("sh.modalNonStackTitle"),
      descHtml: t("sh.modalNonStackDesc"),
      subHtml: t("sh.modalNonStackSub", { title: this.escape(item.title) }),
      footerHtml: `
        <button type="button" class="btn-dialog-crimson" data-modal-action="close">
          <i class="fa-solid fa-xmark"></i> ${this.escape(t("sh.modalBtnCancel"))}
        </button>
        <button type="button" class="btn-dialog-action warning" data-modal-action="buy" data-item-modal-id="${this.escape(item.id)}">
          <i class="fa-solid fa-check"></i> ${this.escape(t("sh.modalBtnBuyAnyway"))}
        </button>`,
    });
  }

  private showPurchaseSuccessModal(item: ShopItem, message: string): void {
    this.openDialog({
      iconClass: "success",
      icon: "fa-solid fa-circle-check",
      titleHtml: t("sh.modalPurchaseSuccessTitle"),
      descHtml: t("sh.modalPurchaseSuccessDesc", { title: this.escape(item.title), coins: this.format(item.cost_coins) }),
      subHtml: this.escape(message),
      footerHtml: `
        <button type="button" class="btn-dialog-action" data-modal-action="close">
          <i class="fa-solid fa-thumbs-up"></i> ${this.escape(t("sh.modalBtnGreat"))}
        </button>`,
    });
  }

  private openDialog(options: {
    iconClass: "success" | "warning";
    icon: string;
    titleHtml: string;
    descHtml: string;
    subHtml: string;
    footerHtml: string;
  }): void {
    if (!this.modalBody) return;
    this.modalBody.innerHTML = `
      <div class="modal-dialog-icon ${options.iconClass}">
        <i class="${options.icon}"></i>
      </div>
      <h3 class="modal-dialog-title">${options.titleHtml}</h3>
      <p class="modal-dialog-desc">${options.descHtml}</p>
      <div class="modal-dialog-subnote">${options.subHtml}</div>
      <div class="modal-dialog-footer">${options.footerHtml}</div>`;
    this.modalOverlay?.classList.add("active");
  }

  private showSuccessModal(title: string, descHtml: string, subHtml: string): void {
    this.openDialog({
      iconClass: "success",
      icon: "fa-solid fa-circle-check",
      titleHtml: title,
      descHtml,
      subHtml: this.escape(subHtml),
      footerHtml: `
        <button type="button" class="btn-dialog-action" data-modal-action="close">
          <i class="fa-solid fa-thumbs-up"></i> ${this.escape(t("sh.modalBtnGreat"))}
        </button>`,
    });
  }

  private closeModal(): void {
    this.modalOverlay?.classList.remove("active");
  }

  private scrollToExchange(): void {
    this.closeModal();
    const section = document.getElementById("exchangeHubCard");
    if (section) {
      section.scrollIntoView({ behavior: "smooth", block: "center" });
      section.classList.add("highlight-pulse");
      window.setTimeout(() => section.classList.remove("highlight-pulse"), 2000);
    }
  }

  private showToast(message: string): void {
    let toast = document.getElementById("shopToast");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "shopToast";
      toast.className = "shop-toast";
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add("show");
    window.setTimeout(() => toast?.classList.remove("show"), 2800);
  }

  private async executePurchase(itemId: string): Promise<void> {
    const item = this.state?.items.find((entry) => entry.id === itemId);
    if (!item) return;
    this.closeModal();
    await this.runTransaction("/api/v1/shop/purchase", {
      request_id: crypto.randomUUID(),
      item_id: item.id,
    }, (response) => this.showPurchaseSuccessModal(item, response.message));
  }

  private categoryOf(itemId: string): ShopItem["category"] | null {
    return this.state?.items.find((entry) => entry.id === itemId)?.category ?? null;
  }

  private confirmUseItem(itemId: string): void {
    const entry = this.state?.inventory.find((item) => item.item_id === itemId);
    if (!entry) return;
    const category = this.categoryOf(itemId);
    const title = this.escape(entry.title);

    if (category === "heal" && readHearts() >= 5) {
      this.showSuccessModal(
        t("sh.modalHealFullTitle"),
        t("sh.modalHealFullDesc", { title }),
        t("sh.modalHealFullSub", { count: this.format(entry.quantity) })
      );
      return;
    }

    const effectLine = category === "boost"
      ? t("sh.modalUseBoostDesc", { title })
      : category === "heal"
        ? t("sh.modalUseHealDesc", { title })
        : t("sh.modalUseDesc", { title });

    this.openDialog({
      iconClass: "success",
      icon: "fa-solid fa-wand-magic-sparkles",
      titleHtml: this.escape(t("sh.modalUseTitle")),
      descHtml: effectLine,
      subHtml: this.escape(t("sh.modalUseSub", { count: this.format(entry.quantity) })),
      footerHtml: `
        <button type="button" class="btn-dialog-secondary" data-modal-action="close">
          ${this.escape(t("sh.modalBtnCancel"))}
        </button>
        <button type="button" class="btn-dialog-action" data-modal-action="use" data-item-modal-id="${this.escape(itemId)}">
          <i class="fa-solid fa-bolt"></i> ${this.escape(t("sh.modalBtnUseNow"))}
        </button>`,
    });
  }

  private async executeUseItem(itemId: string): Promise<void> {
    const entry = this.state?.inventory.find((item) => item.item_id === itemId);
    if (!entry) return;
    const category = this.categoryOf(itemId);
    this.closeModal();
    try {
      if (category === "boost") {
        const response = await slanguageApi<{ title?: string; multiplier?: number; already_active?: boolean } | null>(
          "/api/v1/shop/boost/activate",
          { method: "POST", body: { request_id: crypto.randomUUID() } },
        );
        await this.loadState();
        const data = response.data;
        this.showSuccessModal(
          t("sh.modalUseSuccessTitle"),
          t("sh.modalUseBoostSuccessDesc", {
            title: this.escape(data?.title ?? entry.title),
            multiplier: data?.multiplier ? `${data.multiplier}×` : "",
          }),
          response.message || t("sh.modalUseBoostSuccessSub"),
        );
        return;
      }

      await slanguageApi("/api/v1/shop/items/use", {
        method: "POST",
        body: {
          request_id: crypto.randomUUID(),
          item_id: itemId,
          context: category ?? "",
        },
      });
      if (category === "heal") {
        refillHearts(5);
        this.refreshHeartsDisplay();
      }
      await this.loadState();
      this.showSuccessModal(
        t("sh.modalUseSuccessTitle"),
        t("sh.modalUseItemSuccessDesc", { title: this.escape(entry.title) }),
        t("sh.modalUseItemSuccessSub"),
      );
    } catch (error) {
      this.showMessage(error instanceof Error ? error.message : t("sh.transactionFailed"));
    }
  }

  private refreshHeartsDisplay(): void {
    const hearts = readHearts();
    document.querySelectorAll<HTMLElement>("#headerHeartsVal, .stat-chip.hearts span").forEach((element) => {
      element.textContent = `${hearts}/5`;
    });
  }

  private async runTransaction(
    path: string,
    body: Record<string, string | number>,
    onSuccess?: (response: ApiResponse<ShopState>) => void
  ): Promise<void> {
    this.setBusy(true);
    try {
      const response = await slanguageApi<ShopState>(path, { method: "POST", body });
      this.state = response.data;
      this.render();
      if (onSuccess) onSuccess(response);
      else this.showMessage(response.message);
    } catch (error) {
      this.showMessage(error instanceof Error ? error.message : t("sh.transactionFailed"));
    } finally {
      this.setBusy(false);
    }
  }

  private adjustExchange(amount: number): void {
    if (!this.xpInput) return;
    const balance = this.state?.xp_balance ?? 0;
    const next = Math.min(balance, Math.max(5, Number(this.xpInput.value || 5) + amount));
    this.xpInput.value = String(Math.floor(next / 5) * 5);
    this.updateExchangePreview();
  }

  private updateExchangePreview(): void {
    const amount = Number(this.xpInput?.value);
    const valid = Number.isInteger(amount) && amount >= 5 && amount % 5 === 0;
    const coins = valid ? amount / 5 : 0;
    const preview = document.getElementById("previewCoinsVal");
    const residual = document.getElementById("previewResidualVal");
    if (preview) preview.textContent = `+${coins.toLocaleString("vi-VN")}`;
    if (residual) residual.textContent = "";
    if (this.exchangeButton) {
      this.exchangeButton.disabled = !valid || amount > (this.state?.xp_balance ?? 0);
    }
  }

  private render(): void {
    if (!this.state) return;
    this.setText("userCoinsDisplay", `${this.format(this.state.coin_balance)} Coin`);
    this.setText("userXPDisplay", `${this.format(this.state.xp_balance)} XP`);
    this.setText("userHeartsDisplay", `${this.format(this.state.xp_total)} XP`);
    this.setText("headerCoinsVal", `${this.format(this.state.coin_balance)} Coin`);
    if (this.xpInput) {
      this.xpInput.max = String(this.state.xp_balance);
      this.xpInput.value = String(Math.min(50, Math.floor(this.state.xp_balance / 5) * 5));
    }
    this.renderItems();
    this.renderInventory();
    this.renderHistory();
    this.updateExchangePreview();
  }

  private renderItems(): void {
    clearSkeleton(this.itemsGrid);
    if (!this.itemsGrid || !this.state) return;
    this.itemsGrid.innerHTML = this.state.items.map((item) => {
      const limitReached = item.remaining_limit === 0;
      const cannotAfford = item.cost_coins > this.state!.coin_balance;
      const limit = item.limit_period === "daily" ? t("sh.limitDaily") : t("sh.limitMonthly");
      const btnHtml = limitReached
        ? `<button type="button" class="btn-buy-card limit-reached" data-purchase-item="${this.escape(item.id)}" disabled>
             <i class="fa-solid fa-ban"></i> ${this.escape(t("sh.btnLimitReached", { period: limit }))}
           </button>`
        : `<button type="button" class="btn-buy-card${cannotAfford ? " disabled" : ""}" data-purchase-item="${this.escape(item.id)}">
             <i class="fa-solid fa-${cannotAfford ? "lock" : "bag-shopping"}"></i> ${this.escape(t("sh.btnBuyWith", { coins: this.format(item.cost_coins) }))}
           </button>`;
      return `<article class="shop-item-card${limitReached ? " limit-reached-card" : cannotAfford ? " cannot-afford" : ""}" data-item-id="${this.escape(item.id)}">
        <div class="item-card-top">
          <span class="item-badge ${this.escape(item.badge_class)}">${this.escape(item.badge)}</span>
          <div class="item-cost-chip">
            <i class="fa-solid fa-coins"></i>
            <span>${this.format(item.cost_coins)} Coin</span>
          </div>
        </div>
        <div class="item-header-row">
          <div class="item-icon-box">${itemVisual(item.id, this.escape(item.icon), "potion-icon-img", this.escape(item.title))}</div>
          <h3 class="item-title">${this.escape(item.title)}</h3>
        </div>
        <div class="item-card-body">
          <p class="item-desc">${this.escape(item.description)}</p>
          <div class="item-meta-badges">
            <span class="item-limit-tag${limitReached ? " exhausted" : ""}">
              <i class="fa-regular fa-clock"></i> ${this.escape(t("sh.itemLimit", { remaining: item.remaining_limit, count: item.limit_count, period: limit }))}
            </span>
            ${item.non_stacking ? `<span class="item-non-stack-note"><i class="fa-solid fa-circle-exclamation"></i> ${this.escape(t("sh.nonStacking"))}</span>` : ""}
          </div>
        </div>
        <div class="item-card-footer">${btnHtml}</div>
      </article>`;
    }).join("");
  }

  private renderInventory(): void {
    clearSkeleton(this.inventoryList);
    if (!this.inventoryList || !this.state) return;
    this.inventoryList.innerHTML = this.state.inventory.length
      ? this.state.inventory.map((item) => `<div class="inventory-item-row clickable-potion" role="button" tabindex="0" data-use-item-id="${this.escape(item.item_id)}" title="${this.escape(t("sh.invUseHint"))}">
          <div class="inv-icon">${itemVisual(item.item_id, this.escape(item.icon), "inv-potion-img", this.escape(item.title))}</div>
          <div class="inv-info">
            <span class="inv-name">${this.escape(item.title)} <i class="fa-solid fa-hand-pointer inv-use-hint"></i></span>
            <span class="inv-status">${this.escape(t("sh.invOwned"))}</span>
          </div>
          <div class="inv-qty-tag">x${this.format(item.quantity)}</div>
        </div>`).join("")
      : `<p class="empty-state">${this.escape(t("sh.emptyInventory"))}</p>`;
  }

  private renderHistory(): void {
    clearSkeleton(this.historyBody);
    if (!this.historyBody || !this.state) return;
    this.historyBody.innerHTML = this.state.transactions.length
      ? this.state.transactions.map((transaction) => `<tr>
          <td>${this.escape(transaction.type === "exchange" ? t("sh.txExchange") : t("sh.txPurchase"))}</td>
          <td><strong>${this.escape(transaction.title)}</strong><br><small>${this.escape(transaction.details)}</small></td>
          <td>${transaction.xp_delta ? `${this.format(transaction.xp_delta)} XP` : ""} ${transaction.coin_delta > 0 ? "+" : ""}${this.format(transaction.coin_delta)} Coin</td>
          <td>${this.escape(new Date(transaction.created_at).toLocaleString("vi-VN"))}</td>
        </tr>`).join("")
      : `<tr><td colspan="4" class="empty-state">${this.escape(t("sh.emptyHistory"))}</td></tr>`;
  }

  private setBusy(busy: boolean): void {
    if (busy) {
      if (this.exchangeButton) this.exchangeButton.disabled = true;
      this.itemsGrid?.querySelectorAll<HTMLButtonElement>("[data-purchase-item]").forEach((button) => {
        button.disabled = true;
      });
      return;
    }
    this.renderItems();
    this.updateExchangePreview();
  }

  private showMessage(message: string): void {
    this.loadingMessage.textContent = message;
    this.loadingMessage.setAttribute("role", "alert");
  }

  private setText(id: string, value: string): void {
    const element = document.getElementById(id);
    if (element) element.textContent = value;
  }

  private format(value: number): string {
    return value.toLocaleString("vi-VN");
  }

  private escape(value: string): string {
    return value.replace(/[&<>"']/g, (character) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    })[character] ?? character);
  }
}

new SlanguageShopApp();
