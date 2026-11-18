import { initializeLearnerHeader } from "../shared/learner-header";
import { isLearnerAuthenticated, slanguageApi } from "../shared/api-client";

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

class SlanguageShopApp {
  private state: ShopState | null = null;
  private readonly xpInput = document.getElementById("xpExchangeInput") as HTMLInputElement | null;
  private readonly exchangeButton = document.getElementById("btnExecuteExchange") as HTMLButtonElement | null;
  private readonly itemsGrid = document.getElementById("shopItemsGrid");
  private readonly inventoryList = document.getElementById("inventoryList");
  private readonly historyBody = document.getElementById("historyTableBody");
  private readonly loadingMessage = this.createMessageElement();

  constructor() {
    if (!isLearnerAuthenticated()) {
      window.location.replace("../login/index.html");
      return;
    }

    void initializeLearnerHeader();
    this.bindEvents();
    void this.loadState();
  }

  private createMessageElement(): HTMLElement {
    const message = document.createElement("p");
    message.id = "shopStatusMessage";
    message.setAttribute("role", "status");
    message.textContent = "Đang tải dữ liệu cửa hàng…";
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

  }

  private async loadState(): Promise<void> {
    this.setBusy(true);
    try {
      const response = await slanguageApi<ShopState>("/api/v1/shop");
      this.state = response.data;
      this.render();
      this.loadingMessage.textContent = "";
    } catch (error) {
      this.showMessage(error instanceof Error ? error.message : "Không thể tải dữ liệu cửa hàng.");
    } finally {
      this.setBusy(false);
    }
  }

  private async exchangeXP(): Promise<void> {
    const amount = Number(this.xpInput?.value);
    if (!Number.isInteger(amount) || amount < 5 || amount % 5 !== 0) {
      this.showMessage("Số XP quy đổi phải là bội số của 5 và tối thiểu 5 XP.");
      return;
    }
    if (amount > (this.state?.xp_balance ?? 0)) {
      this.showMessage("Số XP khả dụng không đủ để quy đổi.");
      return;
    }

    await this.runTransaction("/api/v1/shop/exchange", {
      request_id: crypto.randomUUID(),
      xp_amount: amount,
    });
  }

  private async purchaseItem(itemId: string): Promise<void> {
    const item = this.state?.items.find((entry) => entry.id === itemId);
    if (!item || item.remaining_limit < 1) return;
    if (item.cost_coins > (this.state?.coin_balance ?? 0)) {
      this.showMessage("Số dư Coin không đủ để mua vật phẩm.");
      return;
    }
    if (!window.confirm(`Xác nhận mua "${item.title}" với ${item.cost_coins} Coin?`)) return;

    await this.runTransaction("/api/v1/shop/purchase", {
      request_id: crypto.randomUUID(),
      item_id: item.id,
    });
  }

  private async runTransaction(path: string, body: Record<string, string | number>): Promise<void> {
    this.setBusy(true);
    try {
      const response = await slanguageApi<ShopState>(path, { method: "POST", body });
      this.state = response.data;
      this.render();
      this.showMessage(response.message);
    } catch (error) {
      this.showMessage(error instanceof Error ? error.message : "Giao dịch thất bại.");
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
    if (!this.itemsGrid || !this.state) return;
    this.itemsGrid.innerHTML = this.state.items.map((item) => {
      const unavailable = item.remaining_limit === 0 || item.cost_coins > this.state!.coin_balance;
      const limit = item.limit_period === "daily" ? "hôm nay" : "tháng này";
      return `<article class="shop-item-card${unavailable ? " cannot-afford" : ""}" data-item-id="${this.escape(item.id)}">
        <div class="item-card-top">
          <div class="item-icon-box"><i class="${this.escape(item.icon)}"></i></div>
          <span class="item-badge ${this.escape(item.badge_class)}">${this.escape(item.badge)}</span>
        </div>
        <div class="item-card-body">
          <h3 class="item-title">${this.escape(item.title)}</h3>
          <p class="item-desc">${this.escape(item.description)}</p>
        </div>
        <div class="item-meta-badges">
          <span class="item-limit-tag${item.remaining_limit === 0 ? " exhausted" : ""}">Còn ${item.remaining_limit}/${item.limit_count} lượt ${limit}</span>
          ${item.non_stacking ? '<span class="item-non-stack-note">Không cộng dồn</span>' : ""}
        </div>
        <div class="item-card-footer">
          <button type="button" class="btn-buy-card${unavailable ? " disabled" : ""}" data-purchase-item="${this.escape(item.id)}" ${unavailable ? "disabled" : ""}>
            <i class="fa-solid fa-coins"></i> ${this.format(item.cost_coins)} Coin
          </button>
        </div>
      </article>`;
    }).join("");
  }

  private renderInventory(): void {
    if (!this.inventoryList || !this.state) return;
    this.inventoryList.innerHTML = this.state.inventory.length
      ? this.state.inventory.map((item) => `<div class="inventory-item-row">
          <span><i class="${this.escape(item.icon)}"></i> ${this.escape(item.title)}</span>
          <strong>×${this.format(item.quantity)}</strong>
        </div>`).join("")
      : '<p class="empty-state">Kho đồ hiện chưa có vật phẩm.</p>';
  }

  private renderHistory(): void {
    if (!this.historyBody || !this.state) return;
    this.historyBody.innerHTML = this.state.transactions.length
      ? this.state.transactions.map((transaction) => `<tr>
          <td>${transaction.type === "exchange" ? "Quy đổi" : "Mua vật phẩm"}</td>
          <td><strong>${this.escape(transaction.title)}</strong><br><small>${this.escape(transaction.details)}</small></td>
          <td>${transaction.xp_delta ? `${this.format(transaction.xp_delta)} XP` : ""} ${transaction.coin_delta > 0 ? "+" : ""}${this.format(transaction.coin_delta)} Coin</td>
          <td>${this.escape(new Date(transaction.created_at).toLocaleString("vi-VN"))}</td>
        </tr>`).join("")
      : '<tr><td colspan="4" class="empty-state">Chưa có giao dịch.</td></tr>';
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
