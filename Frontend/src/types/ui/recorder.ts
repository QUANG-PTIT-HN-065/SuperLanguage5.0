/**
 * AudioRecorder – Xử lý ghi âm giọng nói qua MediaRecorder và trực quan hóa sóng âm bằng Web Audio AnalyserNode.
 * Hỗ trợ trạng thái: idle | requesting | recording | denied | unsupported.
 */

export type RecorderState = 'idle' | 'requesting' | 'recording' | 'denied' | 'unsupported';

export interface AudioRecorderOptions {
  maxDurationSeconds?: number;
  onStateChange?: (state: RecorderState) => void;
  onTick?: (remainingSeconds: number, elapsedSeconds: number) => void;
  onError?: (type: 'denied' | 'unsupported' | 'error', message: string) => void;
}

export class AudioRecorder {
  private mediaStream: MediaStream | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private animationId: number | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private timerInterval: number | null = null;
  
  private maxDuration = 60; // 60 giây tối đa
  private startTime = 0;
  private currentState: RecorderState = 'idle';
  private options: AudioRecorderOptions;

  constructor(canvas?: HTMLCanvasElement | null, options?: AudioRecorderOptions) {
    this.canvas = canvas || null;
    this.options = options || {};
    if (this.options.maxDurationSeconds) {
      this.maxDuration = this.options.maxDurationSeconds;
    }
  }

  public getState(): RecorderState {
    return this.currentState;
  }

  private setState(state: RecorderState) {
    this.currentState = state;
    this.options.onStateChange?.(state);
  }

  public isSupported(): boolean {
    return !!(navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function' && window.MediaRecorder);
  }

  public async start(): Promise<boolean> {
    if (!this.isSupported()) {
      this.setState('unsupported');
      this.options.onError?.('unsupported', 'Trình duyệt không hỗ trợ ghi âm micro trực tiếp.');
      return false;
    }

    try {
      this.setState('requesting');
      this.audioChunks = [];

      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      // Xác định mimeType phù hợp nhất
      let mimeType = 'audio/webm;codecs=opus';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        if (MediaRecorder.isTypeSupported('audio/webm')) mimeType = 'audio/webm';
        else if (MediaRecorder.isTypeSupported('audio/mp4')) mimeType = 'audio/mp4';
        else if (MediaRecorder.isTypeSupported('audio/ogg')) mimeType = 'audio/ogg';
        else mimeType = '';
      }

      this.mediaRecorder = mimeType
        ? new MediaRecorder(this.mediaStream, { mimeType })
        : new MediaRecorder(this.mediaStream);

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      };

      this.mediaRecorder.start(200); // chunk mỗi 200ms
      this.startTime = Date.now();
      this.setState('recording');

      // Khởi động Visualizer
      if (this.canvas) {
        this.startVisualizer();
      }

      // Khởi động Countdown Timer
      this.startTimer();

      return true;
    } catch (err: any) {
      console.warn('Microphone access error:', err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        this.setState('denied');
        this.options.onError?.('denied', 'Trình duyệt hoặc người dùng đã từ chối quyền truy cập Micro.');
      } else {
        this.setState('idle');
        this.options.onError?.('error', err.message || 'Không thể khởi động micro.');
      }
      this.cleanup();
      return false;
    }
  }

  private startTimer() {
    this.stopTimer();
    this.timerInterval = window.setInterval(() => {
      const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
      const remaining = Math.max(0, this.maxDuration - elapsed);

      this.options.onTick?.(remaining, elapsed);

      if (remaining <= 0) {
        this.stop(); // Hết giờ tự động dừng
      }
    }, 200);
  }

  private stopTimer() {
    if (this.timerInterval !== null) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  private startVisualizer() {
    if (!this.canvas || !this.mediaStream) return;

    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      this.audioContext = new AudioContextClass();
      const source = this.audioContext.createMediaStreamSource(this.mediaStream);
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.8;
      source.connect(this.analyser);

      const ctx = this.canvas.getContext('2d');
      if (!ctx) return;

      const bufferLength = this.analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const render = () => {
        if (this.currentState !== 'recording' || !this.analyser || !this.canvas) return;

        this.analyser.getByteFrequencyData(dataArray);

        const width = this.canvas.width;
        const height = this.canvas.height;
        ctx.clearRect(0, 0, width, height);

        const barCount = 28;
        const step = Math.floor(bufferLength / barCount);
        const barWidth = Math.max(2, (width / barCount) - 3);

        for (let i = 0; i < barCount; i++) {
          const value = dataArray[i * step] || 0;
          const percent = value / 255;
          const barHeight = Math.max(4, percent * height * 0.9);
          const x = i * (barWidth + 3) + 2;
          const y = (height - barHeight) / 2;

          // Gradient màu Teal - Cyan
          const grad = ctx.createLinearGradient(0, y, 0, y + barHeight);
          grad.addColorStop(0, '#0f7c86');
          grad.addColorStop(1, '#4fb6bd');

          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.roundRect(x, y, barWidth, barHeight, 3);
          ctx.fill();
        }

        this.animationId = requestAnimationFrame(render);
      };

      render();
    } catch (e) {
      console.warn('AudioContext visualization not available:', e);
    }
  }

  public async stop(): Promise<Blob | null> {
    this.stopTimer();

    return new Promise<Blob | null>((resolve) => {
      if (!this.mediaRecorder || this.currentState !== 'recording') {
        this.cleanup();
        this.setState('idle');
        resolve(null);
        return;
      }

      this.mediaRecorder.onstop = () => {
        const mimeType = this.mediaRecorder?.mimeType || 'audio/webm';
        const blob = new Blob(this.audioChunks, { type: mimeType });
        this.cleanup();
        this.setState('idle');
        resolve(blob);
      };

      try {
        this.mediaRecorder.stop();
      } catch (e) {
        this.cleanup();
        this.setState('idle');
        resolve(null);
      }
    });
  }

  public cancel(): void {
    this.stopTimer();
    this.cleanup();
    this.setState('idle');
  }

  private cleanup() {
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
    if (this.audioContext && this.audioContext.state !== 'closed') {
      try { this.audioContext.close(); } catch (_) {}
      this.audioContext = null;
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }
    if (this.canvas) {
      const ctx = this.canvas.getContext('2d');
      if (ctx) ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
    this.mediaRecorder = null;
    this.analyser = null;
  }
}
