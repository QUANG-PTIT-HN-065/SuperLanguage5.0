/**
 * Man hinh chuyen trang dung animation Rive (assets/cat_companion.riv).
 * Runtime UMD nap dong bang script, tai lieu lay qua new URL de dung duoc ca dev lan build.
 */

const RIVE_SRC = new URL("../../../assets/cat_companion.riv", import.meta.url).href;
const RIVE_WASM = new URL("../../../assets/rive.wasm", import.meta.url).href;
const RIVE_RUNTIME = new URL("../../../assets/rive.js", import.meta.url).href;
const MAX_DPR = 1.5;
// Timeline duy nhat giua me o giua man hinh lien tuc; State Machine 1 cua file nay
// di chieu theo huong pet ban lon (an me sau intro) nen khong dung.
const LOAD_ANIM = "dancing";

let runtimeLoader: Promise<any> | null = null;
let riveInstance: any = null;

function loadRiveRuntime(): Promise<any> {
  const existing = (window as any).rive;
  if (existing) return Promise.resolve(existing);
  if (!runtimeLoader) {
    runtimeLoader = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = RIVE_RUNTIME;
      script.onload = () => {
        const runtime = (window as any).rive;
        if (runtime) resolve(runtime);
        else reject(new Error("Rive runtime khong dang ky global."));
      };
      script.onerror = () => {
        runtimeLoader = null;
        reject(new Error("Khong tai duoc Rive runtime."));
      };
      document.head.appendChild(script);
    });
  }
  return runtimeLoader;
}

function canvasEl(): HTMLCanvasElement | null {
  return document.getElementById("loadingRiveCanvas") as HTMLCanvasElement | null;
}

function artboardSize(): { w: number; h: number } {
  const ab = riveInstance?.artboards?.[0]?.artboard ?? riveInstance?.artboard ?? riveInstance?.defaultArtboard;
  const w = Number(ab?.width) || Number(riveInstance?._artboardWidth) || 0;
  const h = Number(ab?.height) || Number(riveInstance?._artboardHeight) || 0;
  return { w, h };
}

function styleCanvas(canvas: HTMLCanvasElement, retry = true): void {
  canvas.style.width = "100%";
  canvas.style.display = "block";
  try {
    const { w, h } = artboardSize();
    if (w > 0 && h > 0) {
      canvas.style.aspectRatio = `${w} / ${h}`;
    } else if (retry) {
      // Artboard co the chua san khi onLoad vua chay: thu lan nua som.
      window.setTimeout(() => styleCanvas(canvas, false), 400);
    }
  } catch {
    /* .riv khong lo artboard kich thuoc */
  }
  try {
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    riveInstance.resizeDrawingSurfaceToCanvas(dpr);
  } catch {
    /* runtime cu khong ho tro resize */
  }
}

export function playLoadingRive(): void {
  const canvas = canvasEl();
  if (!canvas) return;
  if (riveInstance) {
    try {
      riveInstance.play(LOAD_ANIM);
    } catch {
      /* ignore */
    }
    return;
  }
  void loadRiveRuntime()
    .then((rive) => {
      try {
        rive.RuntimeLoader?.setWasmUrl(RIVE_WASM);
      } catch {
        /* that bai thi van thu khoi tao */
      }
      try {
        // Setter nam tren class Rive (khong phai namespace window.rive).
        rive.Rive.suppressDeprecationWarnings = ["default-state-machine"];
      } catch {
        /* ban runtime cu */
      }
      riveInstance = new rive.Rive({
        src: RIVE_SRC,
        canvas,
        // autoplay:false de runtime khong tu chay timeline dau ("not dancing" - me o ngoai man hinh).
        autoplay: false,
        layout: new rive.Layout({ fit: rive.Fit.Contain, alignment: rive.Alignment.BottomCenter }),
        onLoad: () => {
          styleCanvas(canvas);
          try {
            const names: string[] = riveInstance.animationNames ?? [];
            const chosen = names.includes(LOAD_ANIM) ? LOAD_ANIM : (names[0] ?? null);
            if (chosen) riveInstance.play(chosen);
          } catch {
            /* that bai thi giu frame tinh */
          }
        },
        onLoadError: (error: any) => console.warn("[LoadingRive] loi nap .riv:", error),
      });
    })
    .catch((error) => console.warn("[LoadingRive] loi runtime:", error));
}

export function stopLoadingRive(): void {
  try {
    riveInstance?.pause();
  } catch {
    /* ignore */
  }
}
