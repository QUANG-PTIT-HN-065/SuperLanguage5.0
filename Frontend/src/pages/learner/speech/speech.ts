/**
 * slanguage-speech.ts
 * Trang Diễn văn (R27).
 * - Yêu cầu đăng nhập
 * - Ghi âm giọng nói qua MediaRecorder
 * - Phát lại bản ghi, gửi bài diễn văn
 * - GSAP animations
 * - Không tạo API mới; chỉ dùng luồng upload âm thanh hiện có (/api/v1/chat-ai/upload-audio) nếu có conversation_id
 */

import { showErrorToast, showSuccessToast } from "../../../types/shared/toast";
import { renderHeader } from "../../../types/shared/header";
import { initPageReveal, initCardStagger, animateButtonPress } from "../../../types/shared/gsap-animations";
import { isLearnerAuthenticated, slanguageApi } from "../../../types/shared/api-client";

renderHeader({ containerId: "sl-header", activePage: "speech" });

const authGuard = document.getElementById("sl-auth-guard");
const speechContent = document.getElementById("sl-speech-content");

if (!isLearnerAuthenticated()) {
  if (authGuard) authGuard.style.display = "block";
  if (speechContent) speechContent.style.display = "none";
} else {
  if (authGuard) authGuard.style.display = "none";
  if (speechContent) speechContent.style.display = "block";

  // ---- Elements ----
  const recordBtn = document.getElementById("sl-speech-record") as HTMLButtonElement | null;
  const stopBtn = document.getElementById("sl-speech-stop") as HTMLButtonElement | null;
  const recordIcon = document.getElementById("sl-record-icon");
  const recordText = document.getElementById("sl-record-text");
  const statusEl = document.getElementById("sl-speech-status");
  const timerEl = document.getElementById("sl-speech-timer");
  const previewEl = document.getElementById("sl-speech-preview");
  const audioEl = document.getElementById("sl-speech-audio") as HTMLAudioElement;
  const uploadBtn = document.getElementById("sl-speech-upload");
  const playSampleBtn = document.getElementById("sl-speech-play-sample");
  const sampleText = document.getElementById("sl-speech-sample");

  // ---- State ----
  let recorder: MediaRecorder | null = null;
  let stream: MediaStream | null = null;
  let chunks: BlobPart[] = [];
  let recordingStart = 0;
  let timerInterval: number | null = null;
  let recordingUrl: string | null = null;

  const SAMPLES = [
    "Chào mừng bạn đến với SuperLanguage.",
    "Hello, welcome to SuperLanguage.",
    "Kontecchiwa, SuperLanguage e ikimasu.",
  ];
  let currentSampleIndex = 0;

  // ---- Helpers ----
  function formatTime(s: number): string {
    const m = Math.floor(s / 60).toString().padStart(2, "0");
    const sec = (s % 60).toString().padStart(2, "0");
    return `${m}:${sec}`;
  }

  function setRecording(recording: boolean) {
    if (recordBtn) recordBtn.disabled = recording;
    if (stopBtn) stopBtn.disabled = !recording;
    if (recordIcon) recordIcon.textContent = recording ? "■" : "●";
    if (recordText) recordText.textContent = recording ? "Đang ghi" : "Ghi âm";
    if (statusEl) statusEl.textContent = recording ? "Đang ghi âm..." : "Nhấn nút ghi âm để bắt đầu";
    if (recordBtn) {
      recordBtn.classList.toggle("sl-btn-danger", !recording);
      recordBtn.classList.toggle("sl-btn-secondary", recording);
    }
  }

  function updateTimer() {
    if (!recordingStart || !timerEl) return;
    const elapsed = Math.floor((Date.now() - recordingStart) / 1000);
    timerEl.textContent = formatTime(Math.min(elapsed, 60));
  }

  // ---- Play sample ----
  if (playSampleBtn && sampleText) {
    playSampleBtn.addEventListener("click", () => {
      animateButtonPress(playSampleBtn as HTMLElement);
      if ("speechSynthesis" in window) {
        window.speechSynthesis.cancel();
        const utter = new SpeechSynthesisUtterance(sampleText.textContent || "");
        utter.lang = "en-US";
        window.speechSynthesis.speak(utter);
      }
    });
  }

  // ---- Start recording ----
  if (recordBtn) {
    recordBtn.addEventListener("click", async () => {
      animateButtonPress(recordBtn);
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        showErrorToast("Trình duyệt không hỗ trợ ghi âm.", 4000);
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mimeType = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find(
          (m) => MediaRecorder.isTypeSupported?.(m)
        ) || undefined;
        recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);

        recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
        recorder.onstop = () => {
          const firstChunk = chunks[0];
          const chunkType = firstChunk instanceof Blob ? firstChunk.type : "audio/webm";
          const blob = new Blob(chunks, { type: chunkType || "audio/webm" });
          recordingUrl = URL.createObjectURL(blob);
          if (audioEl) {
            audioEl.src = recordingUrl;
            audioEl.hidden = false;
          }
          if (previewEl) previewEl.classList.remove("sl-hidden");
          chunks = [];
          setRecording(false);
          if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
          if (timerEl) timerEl.textContent = formatTime(0);
          showSuccessToast("Đã ghi âm xong. Bạn có thể phát lại hoặc gửi bài.", 4000);
        };
        recorder.onerror = () => {
          showErrorToast("Không thể ghi âm. Vui lòng kiểm tra micro.", 4000);
          setRecording(false);
        };

        chunks = [];
        recordingStart = Date.now();
        recorder.start(250);
        setRecording(true);
        timerInterval = window.setInterval(updateTimer, 250);
      } catch (err) {
        showErrorToast("Không truy cập được micro. Vui lòng cấp quyền.", 4000);
        setRecording(false);
      }
    });
  }

  // ---- Stop recording ----
  if (stopBtn) {
    stopBtn.addEventListener("click", () => {
      animateButtonPress(stopBtn);
      if (recorder?.state === "recording") recorder.stop();
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
        stream = null;
      }
    });
  }

  // ---- Upload ----
  if (uploadBtn) {
    uploadBtn.addEventListener("click", async () => {
      animateButtonPress(uploadBtn);
      if (!recordingUrl) {
        showErrorToast("Chưa có bản ghi để gửi.", 4000);
        return;
      }
      // Lấy blob từ URL (đã lưu trong recorder, nhưng ta recreate từ url)
      // Dùng fetch để lấy blob rồi upload qua FormData
      try {
        const resp = await fetch(recordingUrl!);
        const blob = await resp.blob();
        const formData = new FormData();
        formData.append("audio", blob, "speech-recording.webm");

        const conversationId = localStorage.getItem("slanguage_conversation_id");
        if (conversationId) formData.append("conversation_id", conversationId);

        // Gọi endpoint upload âm thanh hiện có
        await slanguageApi("/api/v1/chat-ai/upload-audio", {
          method: "POST",
          body: formData,
          requiresAuth: true,
        });

        showSuccessToast("Đã gửi bài diễn văn thành công.", 4000);
      } catch (err: any) {
        showErrorToast(err?.message || "Không thể gửi bài diễn văn.", 5000);
      }
    });
  }

  // ---- Cleanup ----
  window.addEventListener("beforeunload", () => {
    if (recorder?.state === "recording") recorder.stop();
    if (stream) stream.getTracks().forEach((t) => t.stop());
    if (recordingUrl) URL.revokeObjectURL(recordingUrl);
    if (timerInterval) clearInterval(timerInterval);
  });

  initPageReveal({ container: ".sl-page-reveal" });
  initCardStagger({ container: ".sl-page-reveal", item: ".sl-stagger-item" });
}
