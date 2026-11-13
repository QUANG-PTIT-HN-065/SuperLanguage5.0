/**
 * Slanguage Avatar Upload Component (Task 31)
 * Hỗ trợ kéo-thả, chọn file, cắt tròn canvas preview, kiểm tra dung lượng (< 2MB)
 * và định dạng hợp lệ (JPG, PNG, WEBP).
 */

export interface AvatarUploadOptions {
  container: HTMLElement;
  initialAvatarUrl?: string;
  onAvatarSelected: (dataUrl: string, file: File) => void;
  onError: (errorMessage: string) => void;
}

export class AvatarUploader {
  private container: HTMLElement;
  private previewImg: HTMLImageElement;
  private fileInput: HTMLInputElement;
  private onAvatarSelected: (dataUrl: string, file: File) => void;
  private onError: (errorMessage: string) => void;
  private currentDataUrl: string | null = null;

  constructor(options: AvatarUploadOptions) {
    this.container = options.container;
    this.onAvatarSelected = options.onAvatarSelected;
    this.onError = options.onError;

    this.container.innerHTML = `
      <div class="avatar-upload-widget" role="region" aria-label="Tải lên ảnh đại diện">
        <div class="avatar-circle-wrapper" id="avatarCircleWrapper" tabindex="0" role="button" aria-label="Bấm hoặc kéo thả ảnh vào đây để thay đổi ảnh đại diện">
          <img class="avatar-preview-img" id="avatarPreviewImg" src="${options.initialAvatarUrl || '../../../assets/logo.png'}" alt="Ảnh đại diện">
          <div class="avatar-hover-overlay">
            <i class="fa-solid fa-camera" aria-hidden="true"></i>
            <span>Đổi ảnh</span>
          </div>
          <div class="avatar-upload-progress" id="avatarUploadProgress" hidden>
            <div class="avatar-progress-bar" id="avatarProgressBar"></div>
          </div>
        </div>
        <input type="file" id="avatarFileInput" accept="image/png, image/jpeg, image/webp" hidden>
        <div class="avatar-upload-meta">
          <button type="button" class="avatar-select-btn" id="avatarSelectBtn">
            <i class="fa-solid fa-cloud-arrow-up" aria-hidden="true"></i> Tải ảnh lên
          </button>
          <span class="avatar-hint-text">PNG, JPG hoặc WEBP. Tối đa 2MB.</span>
        </div>
      </div>
    `;

    this.previewImg = this.container.querySelector("#avatarPreviewImg") as HTMLImageElement;
    this.fileInput = this.container.querySelector("#avatarFileInput") as HTMLInputElement;

    this.bindEvents();
  }

  private bindEvents(): void {
    const wrapper = this.container.querySelector("#avatarCircleWrapper") as HTMLElement;
    const selectBtn = this.container.querySelector("#avatarSelectBtn") as HTMLButtonElement;

    const triggerFilePicker = () => this.fileInput.click();
    wrapper.addEventListener("click", triggerFilePicker);
    wrapper.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        triggerFilePicker();
      }
    });
    selectBtn.addEventListener("click", triggerFilePicker);

    // Kéo thả (Drag & Drop)
    wrapper.addEventListener("dragover", (e) => {
      e.preventDefault();
      wrapper.classList.add("is-dragover");
    });

    wrapper.addEventListener("dragleave", () => {
      wrapper.classList.remove("is-dragover");
    });

    wrapper.addEventListener("drop", (e) => {
      e.preventDefault();
      wrapper.classList.remove("is-dragover");
      if (e.dataTransfer?.files.length) {
        this.processFile(e.dataTransfer.files[0]);
      }
    });

    // File input change
    this.fileInput.addEventListener("change", () => {
      if (this.fileInput.files?.length) {
        this.processFile(this.fileInput.files[0]);
      }
    });
  }

  public processFile(file: File): void {
    const validTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!validTypes.includes(file.type)) {
      this.onError("Vui lòng chọn định dạng ảnh JPG, PNG hoặc WEBP.");
      return;
    }

    const maxSize = 2 * 1024 * 1024; // 2MB
    if (file.size > maxSize) {
      this.onError("Kích thước ảnh không được vượt quá 2MB.");
      return;
    }

    // Hiển thị thanh tiến trình giả lập xử lý ảnh
    const progressEl = this.container.querySelector("#avatarUploadProgress") as HTMLElement;
    const barEl = this.container.querySelector("#avatarProgressBar") as HTMLElement;
    if (progressEl && barEl) {
      progressEl.hidden = false;
      barEl.style.width = "40%";
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result;
      if (typeof result !== "string") return;

      // Cắt ảnh tròn & tối ưu kích thước bằng Canvas
      const img = new Image();
      img.onload = () => {
        const size = 256;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        // Vẽ tròn
        ctx.beginPath();
        ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();

        // Căn giữa tỷ lệ (center crop)
        const minDim = Math.min(img.width, img.height);
        const sx = (img.width - minDim) / 2;
        const sy = (img.height - minDim) / 2;
        ctx.drawImage(img, sx, sy, minDim, minDim, 0, 0, size, size);

        const croppedDataUrl = canvas.toDataURL("image/webp", 0.9);
        this.currentDataUrl = croppedDataUrl;
        this.previewImg.src = croppedDataUrl;

        if (barEl) barEl.style.width = "100%";
        setTimeout(() => {
          if (progressEl) progressEl.hidden = true;
          if (barEl) barEl.style.width = "0%";
        }, 300);

        this.onAvatarSelected(croppedDataUrl, file);
      };
      img.src = result;
    };
    reader.readAsDataURL(file);
  }

  public setAvatarUrl(url: string): void {
    if (url) {
      this.previewImg.src = url;
      this.currentDataUrl = url;
    }
  }

  public getAvatarDataUrl(): string | null {
    return this.currentDataUrl;
  }
}

