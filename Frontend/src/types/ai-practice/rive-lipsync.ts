/**
 * Nhân vật AI (Rive) + môi hình khớp tiếng động.
 * Port từ prototype ai-practice: Rive runtime là UMD nên nạp động bằng <script>,
 * .riv/.wasm lấy qua new URL(..., import.meta.url) để dùng được cả dev lẫn build.
 */

const RIVE_SRC = new URL("../../../assets/catcatcharacter-binding.riv", import.meta.url).href;
const RIVE_WASM = new URL("../../../assets/rive.wasm", import.meta.url).href;
const RIVE_RUNTIME = new URL("../../../assets/rive.js", import.meta.url).href;

const MOUTH_NAME_RE = /(mouth|jaw|talk|speak|voice|lip|amp|volume|open|audio)/i;
const CLICK_NAME_RE = /(click|tap|hit|poke|interact)/i;
const MAX_DPR = 1.5;

// Kích thước artboard thật trong catcatcharacter-binding.riv.
const ARTBOARD_W = 2340;
const ARTBOARD_H = 1080;
// Bán kính (đơn vị artboard) quanh mèo coi như "chạm vào mèo" để kéo.
const CAT_GRAB_RADIUS = 300;

let riveRuntimeLoader: Promise<any> | null = null;

function loadRiveRuntime(): Promise<any> {
  const existing = (window as any).rive;
  if (existing) return Promise.resolve(existing);
  if (!riveRuntimeLoader) {
    riveRuntimeLoader = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = RIVE_RUNTIME;
      script.onload = () => {
        const runtime = (window as any).rive;
        if (runtime) resolve(runtime);
        else reject(new Error("Rive runtime không đăng ký global."));
      };
      script.onerror = () => {
        riveRuntimeLoader = null;
        reject(new Error("Không tải được Rive runtime."));
      };
      document.head.appendChild(script);
    });
  }
  return riveRuntimeLoader;
}

/** Một AudioContext + AnalyserNode duy nhất cho cả trang (fftSize 256 = trễ thấp). */
class PageAudioGraph {
  private static ctx: AudioContext | null = null;
  private static analyser: AnalyserNode | null = null;
  private static samples: Float32Array | null = null;

  static context(): AudioContext | null {
    if (!PageAudioGraph.ctx) {
      const Ctor = window.AudioContext || (window as any).webkitAudioContext;
      if (!Ctor) return null;
      PageAudioGraph.ctx = new Ctor();
      PageAudioGraph.analyser = PageAudioGraph.ctx.createAnalyser();
      PageAudioGraph.analyser.fftSize = 256;
      PageAudioGraph.analyser.smoothingTimeConstant = 0.25;
      PageAudioGraph.samples = new Float32Array(256);
    }
    return PageAudioGraph.ctx;
  }

  static getAnalyser(): AnalyserNode | null {
    PageAudioGraph.context();
    return PageAudioGraph.analyser;
  }

  static getSamples(): Float32Array | null {
    PageAudioGraph.context();
    return PageAudioGraph.samples;
  }

  static resume(): void {
    const ctx = PageAudioGraph.context();
    if (ctx && ctx.state === "suspended") void ctx.resume().catch(() => {});
  }
}

export class RiveCharacterLipSync {
  private sourceNode: MediaElementAudioSourceNode | null = null;
  private gainNode: GainNode | null = null;
  private animId: number | null = null;
  private riveInstance: any = null;
  private stateMachineName = "State Machine 1";
  private mouthNumInput: any = null;
  private mouthBoolInput: any = null;
  private mouthTriggers: any[] = [];
  private allInputs: any[] = [];
  private isRiveLoaded = false;
  private isAnalyzing = false;
  private isSpeakingTts = false;
  private listenersBound = false;
  private wasResetToIdle = false;
  private mouthOpen = 0;
  private isTalkingState = false;
  private ttsTick = 0;
  private viewModel: any = null;
  private charXInput: any = null;
  private charYInput: any = null;
  private clickXInput: any = null;
  private clickYInput: any = null;
  private walkTrigger: any = null;
  private petTrigger: any = null;
  private dragPointerId: number | null = null;
  private dragMoved = false;
  private dragOffset = { x: 0, y: 0 };

  constructor(
    private canvas: HTMLCanvasElement,
    private audio: HTMLAudioElement | null,
    private threshold: number = 0.05,
    private onStateChange?: (isTalking: boolean, volume: number) => void
  ) {
    if (this.audio) {
      this.audio.volume = 0.8;
      this.audio.addEventListener("play", () => {
        this.ensureAudioGraph();
        this.isAnalyzing = true;
      });
      this.audio.addEventListener("pause", () => this.handleSilence());
      this.audio.addEventListener("ended", () => this.handleSilence());
    }
    void this.initRive();
    this.startLoop();
  }

  private async initRive(): Promise<void> {
    let rive: any;
    try {
      rive = await loadRiveRuntime();
    } catch (error) {
      console.warn("[Rive] không nạp được runtime:", error);
      return;
    }
    if (!this.canvas) return;
    try {
      rive.RuntimeLoader?.setWasmUrl(RIVE_WASM);
    } catch (error) {
      console.warn("[Rive] setWasmUrl:", error);
    }

    this.syncCanvasResolution();

    this.riveInstance = new rive.Rive({
      src: RIVE_SRC,
      canvas: this.canvas,
      autoplay: true,
      stateMachines: this.stateMachineName,
      layout: new rive.Layout({ fit: rive.Fit.Contain, alignment: rive.Alignment.BottomCenter }),
      onLoad: () => this.onRiveLoad(),
      onLoadError: (error: any) => console.warn("[Rive] onLoadError:", error)
    });

    if (this.listenersBound) return;
    this.listenersBound = true;
    // Bấm vào sân khấu: mèo đi tới (clickX/clickY + trigger clickwalk trong .riv).
    // Bấm kéo ngay trên mèo: dời nhân vật theo con trỏ (characterX/characterY).
    this.canvas.addEventListener("pointerdown", (event) => this.handlePointerDown(event));
    this.canvas.addEventListener("pointermove", (event) => this.handlePointerMove(event));
    this.canvas.addEventListener("pointerup", (event) => this.handlePointerUp(event));
    this.canvas.addEventListener("pointercancel", () => this.endDrag());
    // Listener gốc của file .riv cũng đọc mousedown/touchstart: khi đang kéo mèo
    // phải chặn từ vòng capture để nó không biến cú kéo thành lệnh đi bộ.
    const blockWhileDrag = (event: Event) => {
      if (this.dragPointerId !== null) event.stopPropagation();
    };
    for (const type of ["mousedown", "mousemove", "mouseup", "touchstart", "touchmove", "touchend"]) {
      window.addEventListener(type, blockWhileDrag, true);
    }
    let resizeTimer: number | null = null;
    const scheduleSync = () => {
      if (resizeTimer !== null) window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => this.syncCanvasResolution(), 60);
    };
    window.addEventListener("resize", scheduleSync);
    if (typeof ResizeObserver !== "undefined") new ResizeObserver(scheduleSync).observe(this.canvas);
  }

  private onRiveLoad(): void {
    this.isRiveLoaded = true;
    try {
      this.riveInstance.resizeDrawingSurfaceToCanvas(Math.min(window.devicePixelRatio || 1, MAX_DPR));
    } catch (error) {}

    const names: string[] = this.riveInstance.stateMachineNames || [];
    if (names.length && !names.includes(this.stateMachineName)) {
      this.stateMachineName = names[0];
      try {
        this.riveInstance.play(this.stateMachineName);
      } catch (error) {}
    }

    try {
      const inputs = this.riveInstance.stateMachineInputs(this.stateMachineName) || [];
      this.allInputs = inputs;
      const numbers = inputs.filter((i: any) => typeof i.value === "number" || i.type === 56);
      const booleans = inputs.filter((i: any) => typeof i.value === "boolean" || i.type === 59);
      this.mouthNumInput = numbers.find((i: any) => MOUTH_NAME_RE.test(i.name)) || numbers[0] || null;
      this.mouthBoolInput = booleans.find((i: any) => MOUTH_NAME_RE.test(i.name)) || booleans[0] || null;
      this.mouthTriggers = inputs.filter((i: any) => typeof i.fire === "function" || i.type === 58);
    } catch (error) {
      console.warn("[Rive] không đọc được State Machine inputs:", error);
    }

    this.bindViewModel();
  }

  /** File .riv này điều khiển bằng ViewModel custom properties, không có state machine input. */
  private bindViewModel(): void {
    let viewModel = this.riveInstance?.viewModelInstance ?? null;
    if (!viewModel) {
      // Runtime không tự bind ViewModel1 của file này: tạo instance và bind thủ công
      // để state machine (kể cả Listener gốc của .riv) dùng chung dữ liệu.
      try {
        viewModel = this.riveInstance.defaultViewModel?.()?.defaultInstance?.() ?? null;
        if (viewModel) this.riveInstance.bindViewModelInstance(viewModel);
      } catch (error) {
        console.warn("[Rive] không tạo được ViewModel instance:", error);
        return;
      }
    }
    if (!viewModel) return;
    this.viewModel = viewModel;
    this.charXInput = this.readNumber(viewModel, "characterX");
    this.charYInput = this.readNumber(viewModel, "characterY");
    this.clickXInput = this.readNumber(viewModel, "clickX");
    this.clickYInput = this.readNumber(viewModel, "clickY");
    this.walkTrigger = this.readTrigger(viewModel, "clickwalk");
    this.petTrigger = this.readTrigger(viewModel, "clickcat");
  }

  private readNumber(viewModel: any, name: string): any {
    try {
      return viewModel.number(name) ?? null;
    } catch (error) {
      return null;
    }
  }

  private readTrigger(viewModel: any, name: string): any {
    try {
      return viewModel.trigger(name) ?? null;
    } catch (error) {
      return null;
    }
  }

  /** Đổi tọa độ màn hình sang hệ trục artboard (Fit.Contain + BottomCenter). */
  private toArtboard(clientX: number, clientY: number): { x: number; y: number } | null {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    const scale = Math.min(rect.width / ARTBOARD_W, rect.height / ARTBOARD_H);
    const offsetX = (rect.width - ARTBOARD_W * scale) / 2;
    const offsetY = rect.height - ARTBOARD_H * scale;
    const x = (clientX - rect.left - offsetX) / scale;
    const y = (clientY - rect.top - offsetY) / scale;
    if (x < 0 || x > ARTBOARD_W || y < 0 || y > ARTBOARD_H) return null;
    return { x, y };
  }

  private characterPosition(): { x: number; y: number } {
    return {
      x: typeof this.charXInput?.value === "number" ? this.charXInput.value : ARTBOARD_W / 2,
      y: typeof this.charYInput?.value === "number" ? this.charYInput.value : ARTBOARD_H
    };
  }

  private handlePointerDown(event: PointerEvent): void {
    if (!this.viewModel || event.button > 0) return;
    const point = this.toArtboard(event.clientX, event.clientY);
    if (!point) return;
    const cat = this.characterPosition();
    const nearCat = Math.hypot(point.x - cat.x, point.y - cat.y) <= CAT_GRAB_RADIUS;
    if (nearCat) {
      this.dragPointerId = event.pointerId;
      this.dragMoved = false;
      this.dragOffset = { x: point.x - cat.x, y: point.y - cat.y };
      this.canvas.classList.add("is-dragging");
      try {
        this.canvas.setPointerCapture(event.pointerId);
      } catch (error) {}
      return;
    }
    this.walkTo(point.x, point.y);
  }

  private handlePointerMove(event: PointerEvent): void {
    if (this.dragPointerId !== event.pointerId) return;
    const point = this.toArtboard(event.clientX, event.clientY);
    if (!point) return;
    this.dragMoved = true;
    const x = Math.min(Math.max(point.x - this.dragOffset.x, 0), ARTBOARD_W);
    const y = Math.min(Math.max(point.y - this.dragOffset.y, 0), ARTBOARD_H);
    if (this.charXInput) this.charXInput.value = x;
    if (this.charYInput) this.charYInput.value = y;
  }

  private handlePointerUp(event: PointerEvent): void {
    if (this.dragPointerId !== event.pointerId) return;
    const wasTap = !this.dragMoved;
    this.endDrag();
    if (wasTap) this.playClickReaction();
  }

  private endDrag(): void {
    this.dragPointerId = null;
    this.dragMoved = false;
    this.canvas.classList.remove("is-dragging");
  }

  private walkTo(x: number, y: number): void {
    try {
      if (this.clickXInput) this.clickXInput.value = x;
      if (this.clickYInput) this.clickYInput.value = y;
      this.walkTrigger?.fire?.();
    } catch (error) {}
  }

  /** Canvas có thể đổi kích thước theo layout; đồng bộ hệ số pixel để bắt đúng hit-test. */
  syncCanvasResolution(): void {
    const maxDpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    if (this.riveInstance && this.isRiveLoaded) {
      try {
        this.riveInstance.resizeDrawingSurfaceToCanvas(maxDpr);
        return;
      } catch (error) {}
    }
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const width = Math.round(rect.width * maxDpr);
    const height = Math.round(rect.height * maxDpr);
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
  }

  /** Nối <audio> TTS vào analyser để biên độ thật điều khiển miệng. */
  private ensureAudioGraph(): boolean {
    const ctx = PageAudioGraph.context();
    if (!ctx) return false;
    PageAudioGraph.resume();
    const analyser = PageAudioGraph.getAnalyser();
    if (!this.sourceNode && analyser && this.audio) {
      try {
        this.sourceNode = ctx.createMediaElementSource(this.audio);
        this.gainNode = ctx.createGain();
        this.gainNode.gain.value = this.audio.muted ? 0 : 1;
        this.sourceNode.connect(analyser);
        this.sourceNode.connect(this.gainNode);
        this.gainNode.connect(ctx.destination);
      } catch (error) {}
    }
    return true;
  }

  private startLoop(): void {
    if (this.animId !== null) return;
    const loop = () => {
      this.updateFrame();
      this.animId = requestAnimationFrame(loop);
    };
    this.animId = requestAnimationFrame(loop);
  }

  private rms(): number {
    const analyser = PageAudioGraph.getAnalyser();
    const samples = PageAudioGraph.getSamples();
    if (!analyser || !samples) return 0;
    analyser.getFloatTimeDomainData(samples as any);
    let sum = 0;
    for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
    return Math.sqrt(sum / samples.length);
  }

  private updateFrame(): void {
    let target = 0;
    let isTalking = false;

    if (this.isSpeakingTts) {
      this.ttsTick++;
      const wave = Math.sin(this.ttsTick * 0.4) * 0.5 + 0.5;
      target = wave > 0.2 ? wave * 0.4 + 0.1 : 0.02;
      isTalking = target > 0.05;
    } else if (this.isAnalyzing) {
      const volume = this.rms();
      if (volume > this.threshold) {
        target = Math.min(Math.max((volume - this.threshold) / 0.18, 0), 1);
        isTalking = true;
      }
    }

    this.mouthOpen += (target - this.mouthOpen) * 0.42;
    if (this.mouthOpen < 0.005) this.mouthOpen = 0;

    // Khi đã im lặng tuyệt đối chỉ ghi 0 MỘT LẦN để state machine idle chạy tự nhiên.
    if (isTalking || this.mouthOpen > 0.005) {
      this.wasResetToIdle = false;
      if (this.mouthNumInput) this.mouthNumInput.value = this.mouthOpen * 100;
      if (this.mouthBoolInput) this.mouthBoolInput.value = isTalking;
    } else if (!this.wasResetToIdle) {
      this.mouthOpen = 0;
      if (this.mouthNumInput) this.mouthNumInput.value = 0;
      if (this.mouthBoolInput) this.mouthBoolInput.value = false;
      this.wasResetToIdle = true;
    }

    if (this.isTalkingState !== isTalking) {
      this.isTalkingState = isTalking;
      this.onStateChange?.(isTalking, this.mouthOpen);
    }
  }

  handleSilence(): void {
    this.isAnalyzing = false;
    this.mouthOpen = 0;
    if (this.mouthNumInput) this.mouthNumInput.value = 0;
    if (this.mouthBoolInput) this.mouthBoolInput.value = false;
    this.wasResetToIdle = true;
    if (this.isTalkingState) {
      this.isTalkingState = false;
      this.onStateChange?.(false, 0);
    }
  }

  /** Khẩu hình mô phỏng khi trình duyệt đọc voice (không có stream audio để phân tích). */
  startSpeechSync(): void {
    this.isSpeakingTts = true;
  }

  /** Audio thật (blob TTS) sẽ điều khiển miệng: tắt mô phỏng và nối analyser ngay. */
  beginAudioSync(): void {
    this.isSpeakingTts = false;
    this.isAnalyzing = this.ensureAudioGraph();
  }

  stopSpeechSync(): void {
    this.isSpeakingTts = false;
    this.handleSilence();
  }

  setMuted(muted: boolean): void {
    if (this.gainNode) this.gainNode.gain.value = muted ? 0 : 1;
    if (this.audio) {
      this.audio.muted = muted;
      if (muted) {
        this.audio.pause();
        this.audio.currentTime = 0;
      }
    }
  }

  playClickReaction(): void {
    try {
      if (this.petTrigger?.fire) {
        this.petTrigger.fire();
        return;
      }
      this.mouthTriggers[0]?.fire();
      const click = this.allInputs.find((input: any) => CLICK_NAME_RE.test(input.name));
      if (click && typeof click.fire === "function") {
        click.fire();
      } else if (click && typeof click.value === "boolean") {
        click.value = true;
        window.setTimeout(() => {
          try {
            click.value = false;
          } catch (error) {}
        }, 100);
      }
    } catch (error) {}
  }

  destroy(): void {
    if (this.animId !== null) {
      cancelAnimationFrame(this.animId);
      this.animId = null;
    }
    if (this.riveInstance) {
      try {
        this.riveInstance.cleanup();
      } catch (error) {}
      this.riveInstance = null;
    }
    this.isRiveLoaded = false;
    if (this.sourceNode) {
      try {
        this.sourceNode.disconnect();
      } catch (error) {}
      this.sourceNode = null;
    }
  }
}
