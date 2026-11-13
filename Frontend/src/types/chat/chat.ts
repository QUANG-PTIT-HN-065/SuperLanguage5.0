import { initializeLearnerHeader } from "../shared/learner-header";
import { isLearnerAuthenticated } from "../shared/api-client.js";
import { mountHeader } from "../ui/header.js";
import { AudioRecorder, RecorderState } from "../ui/recorder.js";
import { renderQuickReplies } from "../ui/feedback.js";
import {
  createChatConversation,
  listChatConversations,
  listConversationMessages,
  sendChatMessage,
  transcribeChatAudio,
  type Conversation,
} from "./chat-api.js";

const GUEST_TRIAL_KEY = "slanguage_guest_chat_count";
const MAX_GUEST_TRIALS = 3;

// Language greetings
const LANGUAGE_META: Record<string, { flag: string; greeting: string; subtext: string; promptLang: string }> = {
  English: {
    flag: "../../../assets/flags/flag-en.png",
    greeting: "Hello! Ready to speak English?",
    subtext: "Chào mừng bạn! Tôi là gia sư AI của Slanguage. Hãy chọn một chủ đề hoặc giữ nút mic để bắt đầu luyện phản xạ nhé!",
    promptLang: "en-US",
  },
  Japanese: {
    flag: "../../../assets/flags/flag-jp.png",
    greeting: "こんにちは！一緒に日本語を話しましょう！",
    subtext: "Chào mừng bạn! Hãy cùng gia sư AI luyện tập đối thoại tiếng Nhật giao tiếp tự nhiên nhé!",
    promptLang: "ja-JP",
  },
  Vietnamese: {
    flag: "../../../assets/flags/flag-vn.png",
    greeting: "Xin chào! Sẵn sàng luyện giao tiếp hôm nay?",
    subtext: "Chào mừng bạn đến với phòng luyện nói Slanguage. Cùng trò chuyện và cải thiện phản xạ ngay thôi!",
    promptLang: "vi-VN",
  },
};

// DOM references
const messagesElement = document.getElementById("messages") as HTMLDivElement | null;
const messageForm = document.getElementById("messageForm") as HTMLFormElement | null;
const messageInput = document.getElementById("messageInput") as HTMLTextAreaElement | null;
const sendButton = document.getElementById("sendButton") as HTMLButtonElement | null;
const voiceButton = document.getElementById("voiceButton") as HTMLButtonElement | null;
const voiceRecordPanel = document.getElementById("voiceRecordPanel") as HTMLDivElement | null;
const waveformCanvas = document.getElementById("waveformCanvas") as HTMLCanvasElement | null;
const countdownVal = document.getElementById("countdownVal") as HTMLElement | null;
const micErrorTooltip = document.getElementById("micErrorTooltip") as HTMLDivElement | null;
const micErrorTitle = document.getElementById("micErrorTitle") as HTMLElement | null;
const micErrorMsg = document.getElementById("micErrorMsg") as HTMLElement | null;
const tooltipCloseBtn = document.getElementById("tooltipCloseBtn") as HTMLButtonElement | null;
const guestQuotaBar = document.getElementById("guestQuotaBar") as HTMLDivElement | null;
const guestQuotaText = document.getElementById("guestQuotaText") as HTMLElement | null;
const toastElement = document.getElementById("toast") as HTMLDivElement | null;
const assistantStatus = document.getElementById("assistantStatus") as HTMLDivElement | null;
const roomStatusBadge = document.getElementById("roomStatusBadge") as HTMLElement | null;
const scrollBottomBtn = document.getElementById("scrollBottomBtn") as HTMLButtonElement | null;
const mobileStepBackBtn = document.getElementById("mobileStepBackBtn") as HTMLButtonElement | null;
const voiceStatus = document.getElementById("voiceStatus") as HTMLElement | null;
const startSessionHint = document.getElementById("startSessionHint") as HTMLElement | null;

// Header meta
const headerLanguageFlag = document.getElementById("headerLanguageFlag") as HTMLImageElement | null;
const conversationTitle = document.getElementById("conversationTitle") as HTMLElement | null;
const conversationLanguage = document.getElementById("conversationLanguage") as HTMLElement | null;
const sessionTimerVal = document.getElementById("sessionTimerVal") as HTMLElement | null;
const finishSessionBtn = document.getElementById("finishSessionBtn") as HTMLButtonElement | null;

// Setup card controls
const conversationForm = document.getElementById("conversationForm") as HTMLFormElement | null;
const languageSelect = document.getElementById("languageSelect") as HTMLInputElement | null;
const topicInput = document.getElementById("topicInput") as HTMLInputElement | null;
const btnToggleCustomTopic = document.getElementById("btnToggleCustomTopic") as HTMLButtonElement | null;
const customTopicBox = document.getElementById("customTopicBox") as HTMLDivElement | null;
const startSessionBtn = document.getElementById("startSessionBtn") as HTMLButtonElement | null;
const startSessionBtnText = document.getElementById("startSessionBtnText") as HTMLElement | null;
const historyList = document.getElementById("conversationHistory") as HTMLDivElement | null;
const historyStatus = document.getElementById("historyStatus") as HTMLElement | null;
const refreshHistory = document.getElementById("refreshHistory") as HTMLButtonElement | null;
const historySearchInput = document.getElementById("historySearchInput") as HTMLInputElement | null;

// Modals
const guestLimitModal = document.getElementById("guestLimitModal") as HTMLDivElement | null;
const closeGuestModalBtn = document.getElementById("closeGuestModalBtn") as HTMLButtonElement | null;
const sessionSummaryModal = document.getElementById("sessionSummaryModal") as HTMLDivElement | null;
const btnCloseSummaryModal = document.getElementById("btnCloseSummaryModal") as HTMLButtonElement | null;
const btnContinuePractice = document.getElementById("btnContinuePractice") as HTMLButtonElement | null;

// App State
let currentLanguage = "English";
let currentTopic = "Giao tiếp hàng ngày";
let activeConversation: Conversation | null = null;
let conversationHistory: Conversation[] = [];
let isGuest = true;
let guestTrialCount = 0;
let isStartingSession = false;
let isSessionStarted = false;
let isSendingMessage = false;
let sessionSeconds = 0;
let sessionTimerInterval: number | null = null;
let totalMessagesExchanged = 0;
let audioRecorder: AudioRecorder | null = null;
let spacePressed = false;

// Initial setup
async function init() {
  checkAuthStatus();
  setupLanguageChips();
  setupTopicChips();
  setupCustomTopicToggle();
  setupQuickStartCards();
  setupAudioRecorder();
  setupMessageInput();
  setupModals();
  setupHistory();
  setupMobileStepper();

  try {
    await mountHeader({ active: "chat", externalState: true });
    await initializeLearnerHeader();
  } catch (error) {
    showStartupError(error);
  } finally {
    setHeaderConnectionStatus("checking");
    document.body.removeAttribute("data-page-state");
    void loadHistory();
  }
}

function checkAuthStatus() {
  isGuest = !isLearnerAuthenticated();
  if (startSessionHint) {
    startSessionHint.textContent = isGuest
      ? "Bản xem trước giới hạn 3 lượt."
      : "Bắt đầu hội thoại mới; tin nhắn sẽ được lưu vào lịch sử.";
  }

  const guestCard = document.getElementById("guestCard");
  const learnerCard = document.getElementById("learnerCard");

  if (isGuest) {
    document.body.classList.add("user-guest");
    document.body.classList.remove("user-authenticated");
    if (guestCard) guestCard.hidden = false;
    if (learnerCard) learnerCard.hidden = true;
    if (guestQuotaBar) guestQuotaBar.hidden = false;

    // Load trial count
    const savedTrials = parseInt(localStorage.getItem(GUEST_TRIAL_KEY) || "0", 10);
    guestTrialCount = isNaN(savedTrials) ? 0 : savedTrials;
    updateGuestQuotaUI();
  } else {
    document.body.classList.remove("user-guest");
    document.body.classList.add("user-authenticated");
    if (guestCard) guestCard.hidden = true;
    if (learnerCard) learnerCard.hidden = false;
    if (guestQuotaBar) guestQuotaBar.hidden = true;
    loadLearnerProfile();
  }
}

function updateGuestQuotaUI() {
  const remaining = Math.max(0, MAX_GUEST_TRIALS - guestTrialCount);
  if (guestQuotaText) {
    guestQuotaText.textContent = `Còn ${remaining}/${MAX_GUEST_TRIALS} câu thoại trải nghiệm miễn phí`;
  }
  const guestBadgeStatus = document.getElementById("guestBadgeStatus");
  if (guestBadgeStatus) {
    guestBadgeStatus.textContent = `${remaining} lượt thử miễn phí`;
  }
}

function loadLearnerProfile() {
  const rawProfile = localStorage.getItem("slanguage_user_profile");
  if (rawProfile) {
    try {
      const p = JSON.parse(rawProfile);
      const nameEl = document.getElementById("sidebarLearnerName");
      const avatarEl = document.getElementById("sidebarLearnerAvatar");
      if (nameEl && (p.full_name || p.username)) {
        nameEl.textContent = p.full_name || p.username;
      }
      if (avatarEl && (p.full_name || p.username)) {
        avatarEl.textContent = (p.full_name || p.username).substring(0, 2).toUpperCase();
      }
    } catch (_) {}
  }
}

/* ============================================================
   BƯỚC 1: NGÔN NGỮ & CHỦ ĐỀ
   ============================================================ */
function setupLanguageChips() {
  const chips = document.querySelectorAll<HTMLButtonElement>(".lang-chip");
  chips.forEach((chip) => {
    chip.addEventListener("click", () => {
      const language = chip.getAttribute("data-lang");
      if (language) setSelectedLanguage(language);
    });
  });
}

function setSelectedLanguage(language: string) {
  if (
    activeConversation &&
    languageFromCode(activeConversation.language_code) !== language
  ) {
    showToast("Ngôn ngữ mới sẽ áp dụng khi bạn bắt đầu buổi luyện tập tiếp theo.");
  }
  currentLanguage = language;
  document.querySelectorAll<HTMLButtonElement>(".lang-chip").forEach((chip) => {
    const selected = chip.getAttribute("data-lang") === language;
    chip.classList.toggle("is-active", selected);
    chip.setAttribute("aria-checked", String(selected));
  });
  if (languageSelect) languageSelect.value = language;
  const supported = isGuest || isSupportedChatLanguage(language);
  if (messageInput) messageInput.disabled = !supported;
  if (voiceButton) voiceButton.disabled = !supported;
  if (sendButton) sendButton.disabled = !supported || !messageInput?.value.trim();
  updateLanguageView(language);
}

function updateLanguageView(lang: string) {
  const meta = LANGUAGE_META[lang] || LANGUAGE_META.English;

  if (headerLanguageFlag) headerLanguageFlag.src = meta.flag;
  if (conversationLanguage) conversationLanguage.textContent = `${lang} · Phản xạ tự nhiên`;

  const welcomeGreeting = document.getElementById("welcomeGreeting");
  const welcomeSubtext = document.getElementById("welcomeSubtext");
  if (welcomeGreeting) welcomeGreeting.textContent = meta.greeting;
  if (welcomeSubtext) welcomeSubtext.textContent = meta.subtext;
}

function setupTopicChips() {
  const chips = document.querySelectorAll<HTMLButtonElement>(".topic-chip");
  chips.forEach((chip) => {
    chip.addEventListener("click", () => {
      chips.forEach((c) => {
        c.classList.remove("is-selected");
        c.setAttribute("aria-checked", "false");
      });
      chip.classList.add("is-selected");
      chip.setAttribute("aria-checked", "true");

      currentTopic = chip.getAttribute("data-topic") || "Giao tiếp hàng ngày";
      if (conversationTitle) conversationTitle.textContent = currentTopic;

      if (startSessionBtn) {
        startSessionBtn.disabled = false;
        if (startSessionBtnText) startSessionBtnText.textContent = `Bắt đầu: ${currentTopic}`;
      }
    });
  });
}

function setupCustomTopicToggle() {
  if (!btnToggleCustomTopic || !customTopicBox || !topicInput) return;

  btnToggleCustomTopic.addEventListener("click", () => {
    const isHidden = customTopicBox.hidden;
    customTopicBox.hidden = !isHidden;
    btnToggleCustomTopic.setAttribute("aria-expanded", String(isHidden));
    if (isHidden) topicInput.focus();
  });

  topicInput.addEventListener("input", () => {
    const val = topicInput.value.trim();
    if (val) {
      currentTopic = val;
      if (conversationTitle) conversationTitle.textContent = val;
      if (startSessionBtn) {
        startSessionBtn.disabled = false;
        if (startSessionBtnText) startSessionBtnText.textContent = `Bắt đầu: ${val}`;
      }
    }
  });
}

function setupQuickStartCards() {
  const cards = document.querySelectorAll<HTMLButtonElement>(".quick-card");
  cards.forEach((card) => {
    card.addEventListener("click", () => {
      const topic = card.getAttribute("data-topic") || "Giao tiếp hàng ngày";
      const prompt = card.getAttribute("data-prompt") || "Hello!";
      currentTopic = topic;
      if (conversationTitle) conversationTitle.textContent = topic;

      // Chuyển sang màn hình chat trên mobile
      goToMobileChat();

      // Bắt đầu ngay với lời chào của AI
      void startNewPracticeSession(prompt);
    });
  });
}

function setupMobileStepper() {
  if (conversationForm) {
    conversationForm.addEventListener("submit", (e) => {
      e.preventDefault();
      goToMobileChat();
      void startNewPracticeSession();
    });
  }

  if (mobileStepBackBtn) {
    mobileStepBackBtn.addEventListener("click", () => {
      document.body.setAttribute("data-mobile-step", "setup");
    });
  }
}

function goToMobileChat() {
  document.body.setAttribute("data-mobile-step", "chat");
  if (messageInput) messageInput.focus();
}

async function startNewPracticeSession(initialAiPrompt?: string): Promise<boolean> {
  if (isStartingSession) return false;
  if (!isGuest && !isSupportedChatLanguage(currentLanguage)) {
    showToast("Hiện chỉ hỗ trợ luyện tập tiếng Anh và tiếng Nhật.");
    return false;
  }

  isStartingSession = true;
  if (startSessionBtn) startSessionBtn.disabled = true;

  try {
    const conversation = isGuest
      ? null
      : await createChatConversation({
          title: currentTopic,
          language_code: getSupportedChatLanguage(currentLanguage),
        });

    activeConversation = conversation;
    if (conversation) setHeaderConnectionStatus("connected");
    isSessionStarted = true;
    totalMessagesExchanged = 0;
    sessionSeconds = 0;
    startSessionTimer();

    document.getElementById("welcomeCard")?.remove();
    if (messagesElement) messagesElement.replaceChildren();
    if (messageInput) messageInput.disabled = false;
    if (voiceButton) voiceButton.disabled = false;
    if (sendButton) sendButton.disabled = !messageInput?.value.trim();

    const prompt = initialAiPrompt || getInitialGreeting(currentLanguage, currentTopic);
    appendAiMessage(prompt, generateQuickReplies(currentLanguage));
    if (conversation) void loadHistory();
    return true;
  } catch (error) {
    setHeaderConnectionStatus("error");
    showToast(`Không thể tạo buổi luyện tập: ${getErrorMessage(error)}`);
    return false;
  } finally {
    isStartingSession = false;
    if (startSessionBtn) startSessionBtn.disabled = false;
  }
}

function isSupportedChatLanguage(language: string): language is "English" | "Japanese" {
  return language === "English" || language === "Japanese";
}

function getSupportedChatLanguage(language: string): "English" | "Japanese" {
  if (isSupportedChatLanguage(language)) return language;
  throw new Error("Hiện chỉ hỗ trợ luyện tập tiếng Anh và tiếng Nhật.");
}

function getInitialGreeting(lang: string, topic: string): string {
  if (lang === "Japanese") {
    return `こんにちは！今日は「${topic}」について練習しましょう。準備はいいですか？`;
  }
  if (lang === "Vietnamese") {
    return `Xin chào bạn! Hôm nay chúng ta sẽ cùng luyện tập chủ đề "${topic}". Bạn muốn chia sẻ điều gì trước?`;
  }
  return `Hello there! Today we are practicing the topic "${topic}". How are you doing today?`;
}

/* ============================================================
   BƯỚC 2: AUDIO RECORDER & NÚT MIC
   ============================================================ */
function setupAudioRecorder() {
  if (!voiceButton || !waveformCanvas) return;

  audioRecorder = new AudioRecorder(waveformCanvas, {
    maxDurationSeconds: 60,
    onStateChange: (state: RecorderState) => {
      handleRecorderStateChange(state);
    },
    onTick: (remaining: number) => {
      if (countdownVal) {
        const m = Math.floor(remaining / 60);
        const s = remaining % 60;
        countdownVal.textContent = `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
      }
    },
    onError: (type, msg) => {
      showMicErrorTooltip(msg);
    },
  });

  // Sự kiện Nhấn-và-giữ chuột / cảm ứng
  voiceButton.addEventListener("pointerdown", async (e) => {
    e.preventDefault();
    hideMicErrorTooltip();
    await startVoiceRecording();
  });

  const stopVoice = async (e: Event) => {
    e.preventDefault();
    if (audioRecorder?.getState() === "recording") {
      await stopVoiceRecording();
    }
  };

  voiceButton.addEventListener("pointerup", stopVoice);
  voiceButton.addEventListener("pointerleave", stopVoice);

  // Sự kiện giữ phím Space trên Desktop
  window.addEventListener("keydown", async (e) => {
    if (e.code === "Space" && !spacePressed) {
      const activeEl = document.activeElement;
      if (activeEl && (activeEl.tagName === "INPUT" || activeEl.tagName === "TEXTAREA")) {
        return; // Không chặn khi đang gõ chữ
      }
      e.preventDefault();
      spacePressed = true;
      hideMicErrorTooltip();
      await startVoiceRecording();
    }
  });

  window.addEventListener("keyup", async (e) => {
    if (e.code === "Space" && spacePressed) {
      e.preventDefault();
      spacePressed = false;
      await stopVoiceRecording();
    }
  });

  if (tooltipCloseBtn) {
    tooltipCloseBtn.addEventListener("click", hideMicErrorTooltip);
  }
}

async function startVoiceRecording() {
  if (!audioRecorder) return;
  if (voiceStatus) voiceStatus.textContent = "";
  const started = await audioRecorder.start();
  if (started) {
    setLiveStatus("LISTENING");
  }
}

async function stopVoiceRecording() {
  if (!audioRecorder) return;
  setLiveStatus("READY");
  const audioBlob = await audioRecorder.stop();
  if (audioBlob && audioBlob.size > 0) {
    // Nếu có blob, xử lý gửi giọng nói
    handleSpokenAudio(audioBlob);
  }
}

function handleRecorderStateChange(state: RecorderState) {
  if (!voiceButton || !voiceRecordPanel) return;

  if (state === "recording") {
    voiceButton.classList.add("is-recording");
    voiceButton.setAttribute("aria-pressed", "true");
    voiceRecordPanel.hidden = false;
  } else {
    voiceButton.classList.remove("is-recording");
    voiceButton.setAttribute("aria-pressed", "false");
    voiceRecordPanel.hidden = true;
  }
}

function showMicErrorTooltip(message: string) {
  if (!micErrorTooltip || !micErrorMsg) return;
  micErrorMsg.textContent = message;
  micErrorTooltip.hidden = false;
}

function hideMicErrorTooltip() {
  if (micErrorTooltip) micErrorTooltip.hidden = true;
}

async function handleSpokenAudio(blob: Blob) {
  if (isGuest) {
    const mockTranscripts: Record<string, string[]> = {
      English: [
        "I am doing great, thank you for asking!",
        "Could you tell me more about this topic?",
        "I think learning languages is very fun.",
      ],
      Japanese: [
        "はい、準備ができました！よろしくお願いします。",
        "今日はとても天気がいいですね。",
        "少し緊張していますが、頑張ります。",
      ],
      Vietnamese: [
        "Chào bạn, tôi rất hào hứng tham gia buổi học hôm nay!",
        "Bạn có thể giải thích thêm về điều này không?",
      ],
    };
    const list = mockTranscripts[currentLanguage] || mockTranscripts.English;
    const recognizedText = list[Math.floor(Math.random() * list.length)];

    if (voiceStatus) voiceStatus.textContent = "Bản xem trước dùng câu mẫu, chưa xử lý bản ghi âm.";
    await sendMessage(recognizedText);
    return;
  }

  try {
    if (!activeConversation && !(await startNewPracticeSession())) return;
    if (!activeConversation) throw new Error("Không tìm thấy buổi luyện tập đang mở.");

    if (voiceStatus) voiceStatus.textContent = "Đang nhận diện giọng nói...";
    const result = await transcribeChatAudio(activeConversation.id, blob);
    const transcript = result.transcript.trim();
    if (!transcript) throw new Error("Chưa nhận diện được lời nói. Hãy thử ghi âm lại.");

    if (voiceStatus) voiceStatus.textContent = "Đã nhận diện; đang gửi tin nhắn...";
    const sent = await sendMessage(transcript);
    if (voiceStatus) {
      voiceStatus.textContent = sent
        ? "Đã gửi tin nhắn bằng giọng nói."
        : "Tin nhắn chưa được gửi. Hãy thử lại.";
    }
  } catch (error) {
    const message = getErrorMessage(error);
    if (voiceStatus) voiceStatus.textContent = `Không thể gửi giọng nói: ${message}`;
    showToast(`Không thể nhận diện giọng nói: ${message}`);
  }
}

/* ============================================================
   BƯỚC 3: GỬI TIN NHẮN & PHẢN HỒI AI
   ============================================================ */
function setupMessageInput() {
  if (!messageInput || !sendButton || !messageForm) return;

  messageInput.addEventListener("input", () => {
    triggerAutoResize(messageInput);
    const hasText = messageInput.value.trim().length > 0;
    sendButton.disabled = !hasText || isSendingMessage;
  });

  messageInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!sendButton.disabled) {
        messageForm.requestSubmit();
      }
    }
  });

  messageForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const text = messageInput.value.trim();
    if (!text || isSendingMessage) return;

    // Hiệu ứng bay phi cơ giấy
    sendButton.classList.add("fly-anim");
    setTimeout(() => sendButton.classList.remove("fly-anim"), 500);

    messageInput.value = "";
    triggerAutoResize(messageInput);
    sendButton.disabled = true;

    void sendMessage(text);
  });

  if (scrollBottomBtn && messagesElement) {
    messagesElement.addEventListener("scroll", () => {
      const distFromBottom = messagesElement.scrollHeight - messagesElement.scrollTop - messagesElement.clientHeight;
      scrollBottomBtn.hidden = distFromBottom < 120;
    });

    scrollBottomBtn.addEventListener("click", () => {
      scrollToBottom();
      scrollBottomBtn.hidden = true;
    });
  }
}

function triggerAutoResize(textarea: HTMLTextAreaElement) {
  textarea.style.height = "auto";
  const newHeight = Math.min(textarea.scrollHeight, 120);
  textarea.style.height = `${newHeight}px`;
}

async function sendMessage(content: string): Promise<boolean> {
  const text = content.trim();
  if (!text || isSendingMessage) return false;

  if (isGuest && guestTrialCount >= MAX_GUEST_TRIALS) {
    if (guestLimitModal) guestLimitModal.hidden = false;
    return false;
  }

  if (!isSessionStarted && !(await startNewPracticeSession())) {
    restoreMessageDraft(text);
    return false;
  }

  const conversationId = isGuest ? null : activeConversation?.id;
  const matchesConversationLanguage =
    !activeConversation ||
    languageFromCode(activeConversation.language_code) === currentLanguage;
  if (
    !isGuest &&
    (!conversationId || !isSupportedChatLanguage(currentLanguage) || !matchesConversationLanguage)
  ) {
    showToast("Hãy bắt đầu buổi luyện tập mới để dùng ngôn ngữ đã chọn.");
    restoreMessageDraft(text);
    return false;
  }

  if (messageInput && messageInput.value.trim() === text) {
    messageInput.value = "";
    triggerAutoResize(messageInput);
  }

  isSendingMessage = true;
  showTyping(true);
  setLiveStatus("THINKING");

  try {
    if (isGuest) {
      appendUserMessage(text);
      totalMessagesExchanged++;
      guestTrialCount++;
      localStorage.setItem(GUEST_TRIAL_KEY, String(guestTrialCount));
      updateGuestQuotaUI();
      await new Promise<void>((resolve) => window.setTimeout(resolve, 700));
      appendAiMessage(generateAiResponse(text, currentLanguage), generateQuickReplies(currentLanguage));
      if (guestTrialCount >= MAX_GUEST_TRIALS) {
        window.setTimeout(() => {
          if (guestLimitModal) guestLimitModal.hidden = false;
        }, 1200);
      }
      return true;
    }

    if (!conversationId) throw new Error("Không tìm thấy buổi luyện tập đang mở.");
    const response = await sendChatMessage(conversationId, text);
    document.getElementById("welcomeCard")?.remove();
    appendUserMessage(response.user_message);
    appendAiMessage(
      response.ai_response,
      generateQuickReplies(currentLanguage),
      response.ai_feedback,
    );
    setHeaderConnectionStatus("connected");
    totalMessagesExchanged++;
    void loadHistory();
    return true;
  } catch (error) {
    showToast(`Không gửi được tin nhắn: ${getErrorMessage(error)}`);
    restoreMessageDraft(text);
    return false;
  } finally {
    showTyping(false);
    setLiveStatus("READY");
    isSendingMessage = false;
    if (sendButton) sendButton.disabled = !messageInput?.value.trim();
  }
}

function restoreMessageDraft(text: string) {
  if (!messageInput || messageInput.value.trim()) return;
  messageInput.value = text;
  triggerAutoResize(messageInput);
  if (sendButton) sendButton.disabled = false;
}

function appendUserMessage(text: string) {
  if (!messagesElement) return;

  const row = document.createElement("div");
  row.className = "message-row user";

  const timeStr = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  row.innerHTML = `
    <div class="message-avatar user" aria-hidden="true">Tôi</div>
    <div class="message-content-wrap">
      <div class="message-bubble">${escapeHtml(text)}</div>
      <span class="message-time-meta">${timeStr}</span>
    </div>
  `;

  messagesElement.appendChild(row);
  scrollToBottom();
}

function appendAiMessage(text: string, quickReplies?: string[], feedback?: string | null) {
  if (!messagesElement) return;

  const row = document.createElement("div");
  row.className = "message-row assistant";

  const timeStr = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  row.innerHTML = `
    <div class="message-avatar ai" aria-hidden="true">AI</div>
    <div class="message-content-wrap">
      <div class="message-bubble">${escapeHtml(text)}</div>

      <div class="ai-actions-bar">
        <button type="button" class="btn-ai-action btn-tts" title="Nghe phát âm">
          <i class="fa-solid fa-volume-high"></i> <span>Nghe</span>
        </button>
        <button type="button" class="btn-ai-action btn-copy" title="Sao chép nội dung">
          <i class="fa-regular fa-copy"></i> <span>Chép</span>
        </button>
      </div>

      ${renderAiFeedback(feedback)}

      ${quickReplies && quickReplies.length > 0 ? renderQuickReplies(quickReplies) : ""}

      <span class="message-time-meta">${timeStr}</span>
    </div>
  `;

  // TTS
  const ttsBtn = row.querySelector<HTMLButtonElement>(".btn-tts");
  if (ttsBtn) {
    ttsBtn.addEventListener("click", () => speakText(text, currentLanguage));
  }

  const feedbackToggle = row.querySelector<HTMLButtonElement>(".feedback-toggle-btn");
  const feedbackContent = row.querySelector<HTMLDivElement>(".feedback-content");
  if (feedbackToggle && feedbackContent) {
    feedbackToggle.addEventListener("click", () => {
      const expanded = feedbackToggle.getAttribute("aria-expanded") === "true";
      feedbackToggle.setAttribute("aria-expanded", String(!expanded));
      feedbackContent.hidden = expanded;
    });
  }

  // Sao chép
  const copyBtn = row.querySelector<HTMLButtonElement>(".btn-copy");
  if (copyBtn) {
    copyBtn.addEventListener("click", () => {
      navigator.clipboard.writeText(text);
      showToast("Đã sao chép vào bộ nhớ tạm!");
    });
  }

  // Gắn sự kiện cho các Quick reply chip
  const replyChips = row.querySelectorAll<HTMLButtonElement>(".quick-reply-chip");
  replyChips.forEach((chip) => {
    chip.addEventListener("click", () => {
      const reply = chip.getAttribute("data-reply");
      if (reply) {
        void sendMessage(reply);
      }
    });
  });

  messagesElement.appendChild(row);
  scrollToBottom();
}

function renderAiFeedback(feedback?: string | null): string {
  if (!feedback?.trim()) return "";
  return `
    <div class="ai-feedback-accordion" role="region" aria-label="Góp ý từ gia sư AI">
      <button type="button" class="feedback-toggle-btn" aria-expanded="false">
        <i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i>
        <span>Xem góp ý từ gia sư</span>
        <i class="fa-solid fa-chevron-down toggle-icon" aria-hidden="true"></i>
      </button>
      <div class="feedback-content" hidden><p>${escapeHtml(feedback)}</p></div>
    </div>
  `;
}

function speakText(text: string, lang: string) {
  if (!("speechSynthesis" in window)) {
    showToast("Trình duyệt không hỗ trợ đọc giọng nói TTS.");
    return;
  }
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  const code = LANGUAGE_META[lang]?.promptLang || "en-US";
  utterance.lang = code;
  window.speechSynthesis.speak(utterance);
}

function generateAiResponse(userText: string, lang: string): string {
  if (lang === "Japanese") {
    const resps = [
      "それは素晴らしいですね！普段はどんなことをしているのですか？",
      "なるほど、よく分かります。他にはどんな興味がありますか？",
      "とても上手な日本語ですね！次に挑戦してみたいことはありますか？",
    ];
    return resps[Math.floor(Math.random() * resps.length)];
  }
  if (lang === "Vietnamese") {
    const resps = [
      "Ý kiến của bạn rất thú vị! Bạn có thể kể chi tiết hơn một chút không?",
      "Rất hay! Điều này giúp bạn cảm thấy thế nào khi trải nghiệm thực tế?",
    ];
    return resps[Math.floor(Math.random() * resps.length)];
  }
  const enResps = [
    "That sounds wonderful! Could you tell me a little more about that?",
    "I completely agree with you. What was your favorite moment regarding this?",
    "Great explanation! You're speaking with good flow and confidence.",
  ];
  return enResps[Math.floor(Math.random() * enResps.length)];
}

function generateQuickReplies(lang: string): string[] {
  if (lang === "Japanese") {
    return ["はい、そうです！", "あまり詳しくないですが...", "もう少し教えてください。"];
  }
  if (lang === "Vietnamese") {
    return ["Tôi hoàn toàn đồng ý!", "Cũng tùy trường hợp nữa.", "Bạn nghĩ sao về điều đó?"];
  }
  return ["Yes, absolutely!", "I am not quite sure about that.", "Could you elaborate?"];
}

function scrollToBottom() {
  if (!messagesElement) return;
  messagesElement.scrollTop = messagesElement.scrollHeight;
}

function showTyping(show: boolean) {
  if (assistantStatus) assistantStatus.hidden = !show;
}

function setLiveStatus(status: "READY" | "LISTENING" | "THINKING") {
  if (!roomStatusBadge) return;
  roomStatusBadge.className = "live-pill";
  const txt = roomStatusBadge.querySelector<HTMLElement>(".status-txt");

  if (status === "LISTENING") {
    roomStatusBadge.classList.add("is-listening");
    if (txt) txt.textContent = "ĐANG NGHE...";
  } else if (status === "THINKING") {
    roomStatusBadge.classList.add("is-thinking");
    if (txt) txt.textContent = "AI ĐANG NGHĨ...";
  } else {
    if (txt) txt.textContent = "SẴN SÀNG";
  }
}

/* ============================================================
   TIMER & MODALS
   ============================================================ */
function startSessionTimer() {
  if (sessionTimerInterval !== null) clearInterval(sessionTimerInterval);
  sessionSeconds = 0;
  sessionTimerInterval = window.setInterval(() => {
    sessionSeconds++;
    const m = Math.floor(sessionSeconds / 60);
    const s = sessionSeconds % 60;
    if (sessionTimerVal) {
      sessionTimerVal.textContent = `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    }
  }, 1000);
}

function setupModals() {
  // Guest limit modal
  if (closeGuestModalBtn && guestLimitModal) {
    closeGuestModalBtn.addEventListener("click", () => {
      guestLimitModal.hidden = true;
    });
  }

  // Session summary modal
  if (finishSessionBtn && sessionSummaryModal) {
    finishSessionBtn.addEventListener("click", openSummaryModal);
  }

  if (btnCloseSummaryModal && sessionSummaryModal) {
    btnCloseSummaryModal.addEventListener("click", () => {
      sessionSummaryModal.hidden = true;
    });
  }

  if (btnContinuePractice && sessionSummaryModal) {
    btnContinuePractice.addEventListener("click", () => {
      sessionSummaryModal.hidden = true;
      void startNewPracticeSession();
    });
  }
}

function openSummaryModal() {
  if (!sessionSummaryModal) return;

  const m = Math.floor(sessionSeconds / 60);
  const s = sessionSeconds % 60;
  const durStr = `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;

  const sumDuration = document.getElementById("sumDuration");
  const sumMessages = document.getElementById("sumMessages");
  const sumPronunciation = document.getElementById("sumPronunciation");
  const summaryTopicName = document.getElementById("summaryTopicName");

  if (sumDuration) sumDuration.textContent = durStr;
  if (sumMessages) sumMessages.textContent = String(totalMessagesExchanged);

  if (sumPronunciation) sumPronunciation.textContent = "—";
  if (summaryTopicName) summaryTopicName.textContent = `Chủ đề: ${currentTopic}`;

  sessionSummaryModal.hidden = false;
}

/* ============================================================
   LỊCH SỬ HỘI THOẠI
   ============================================================ */
function setupHistory() {
  refreshHistory?.addEventListener("click", () => void loadHistory());
  historySearchInput?.addEventListener("input", filterHistory);
  historyList?.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const button = target.closest<HTMLButtonElement>(".history-item[data-id]");
    if (button?.dataset.id) void openConversation(button.dataset.id);
  });
}

async function loadHistory() {
  if (!historyList || !historyStatus) return;

  if (isGuest) {
    historyStatus.hidden = true;
    historyList.innerHTML = `
      <div class="history-item history-item-guest-blur">
        <div class="history-item-left">
          <img src="../../../assets/flags/flag-en.png" class="history-item-flag" alt="" />
          <span class="history-item-title">Gọi món tại nhà hàng</span>
        </div>
        <span class="history-item-time"><i class="fa-solid fa-lock"></i> 14:20</span>
      </div>
      <div class="history-item history-item-guest-blur">
        <div class="history-item-left">
          <img src="../../../assets/flags/flag-jp.png" class="history-item-flag" alt="" />
          <span class="history-item-title">Phỏng vấn xin việc Tokyo</span>
        </div>
        <span class="history-item-time"><i class="fa-solid fa-lock"></i> Hôm qua</span>
      </div>
      <div class="guest-history-prompt">
        <i class="fa-solid fa-key" style="color:var(--teal);"></i>
        <span>Đăng nhập để xem và lưu không giới hạn các buổi luyện tập.</span>
      </div>
    `;
    return;
  }

  try {
    historyStatus.textContent = "Đang tải lịch sử...";
    historyStatus.hidden = false;
    conversationHistory = await listChatConversations();
    setHeaderConnectionStatus("connected");
    renderHistoryItems(conversationHistory);
  } catch (error) {
    setHeaderConnectionStatus("error");
    historyStatus.replaceChildren(
      document.createTextNode(`Không tải được lịch sử: ${getErrorMessage(error)} `),
    );
    const retryButton = document.createElement("button");
    retryButton.type = "button";
    retryButton.textContent = "Thử lại";
    retryButton.addEventListener("click", () => void loadHistory());
    historyStatus.append(retryButton);
    historyStatus.hidden = false;
  }
}

function renderHistoryItems(items: Conversation[]) {
  if (!historyList || !historyStatus) return;
  historyStatus.hidden = true;

  if (items.length === 0) {
    historyList.innerHTML = `<p class="history-status">Chưa có lịch sử hội thoại nào.</p>`;
    return;
  }

  historyList.innerHTML = `
    <div class="history-date-label">Các buổi đã luyện</div>
    ${items.map((it) => {
      const language = languageFromCode(it.language_code);
      const flag = LANGUAGE_META[language].flag;
      const selected = it.id === activeConversation?.id;
      return `
        <button type="button" class="history-item${selected ? " is-active" : ""}" data-id="${escapeHtml(it.id)}" aria-pressed="${selected}">
          <div class="history-item-left">
            <img src="${flag}" class="history-item-flag" alt="" />
            <span class="history-item-title">${escapeHtml(it.title)}</span>
          </div>
          <span class="history-item-time">${it.created_at ? new Date(it.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""}</span>
        </button>
      `;
    }).join("")}
  `;
}

async function openConversation(conversationId: string) {
  if (!historyStatus) return;
  const conversation = conversationHistory.find((item) => item.id === conversationId);
  if (!conversation || isSendingMessage) return;

  try {
    historyStatus.textContent = "Đang tải hội thoại...";
    historyStatus.hidden = false;
    const messages = await listConversationMessages(conversationId);

    activeConversation = conversation;
    isSessionStarted = true;
    currentTopic = conversation.title;
    setSelectedLanguage(languageFromCode(conversation.language_code));
    if (conversationTitle) conversationTitle.textContent = conversation.title;
    if (messagesElement) messagesElement.replaceChildren();
    document.getElementById("welcomeCard")?.remove();

    totalMessagesExchanged = messages.filter((message) => message.sender_type === "user").length;
    for (const message of messages) {
      if (message.sender_type === "user") appendUserMessage(message.content);
      else appendAiMessage(message.content, undefined, message.ai_feedback);
    }

    const supported = isSupportedChatLanguage(currentLanguage);
    if (messageInput) messageInput.disabled = !supported;
    if (sendButton) sendButton.disabled = !supported || !messageInput?.value.trim();
    if (voiceButton) voiceButton.disabled = !supported;
    if (!supported) {
      showToast("Hội thoại này dùng ngôn ngữ không còn được hỗ trợ; bạn vẫn có thể xem lịch sử.");
    }

    sessionSeconds = 0;
    startSessionTimer();
    historyStatus.hidden = true;
    document.body.setAttribute("data-mobile-step", "chat");
    renderHistoryItems(conversationHistory);
    scrollToBottom();
  } catch (error) {
    historyStatus.textContent = `Không tải được hội thoại: ${getErrorMessage(error)}`;
    historyStatus.hidden = false;
    showToast(`Không tải được hội thoại: ${getErrorMessage(error)}`);
  }
}

function languageFromCode(code: string): string {
  const normalized = code.toLowerCase();
  if (normalized === "ja" || normalized === "japanese") return "Japanese";
  if (normalized === "vi" || normalized === "vietnamese") return "Vietnamese";
  return "English";
}

function filterHistory() {
  if (!historySearchInput) return;
  const q = historySearchInput.value.toLowerCase().trim();
  const filtered = conversationHistory.filter((c) => c.title.toLowerCase().includes(q));
  renderHistoryItems(filtered);
}

function showToast(msg: string) {
  if (!toastElement) return;
  toastElement.textContent = msg;
  toastElement.classList.add("visible");
  setTimeout(() => toastElement.classList.remove("visible"), 3200);
}

function setHeaderConnectionStatus(state: "checking" | "connected" | "error") {
  const status = document.getElementById("connectionStatus");
  const label = document.getElementById("connectionLabel");
  if (!status || !label) return;
  if (isGuest) {
    status.hidden = true;
    return;
  }

  status.hidden = false;
  status.classList.toggle("is-online", state === "connected");
  label.textContent =
    state === "connected"
      ? "Đã kết nối"
      : state === "error"
        ? "Không tải được dữ liệu"
        : "Đang kiểm tra…";
}

function showStartupError(error: unknown) {
  const startupError = document.getElementById("pageStartupError");
  if (!startupError) return;

  const retryButton = document.createElement("button");
  retryButton.type = "button";
  retryButton.textContent = "Thử lại";
  retryButton.addEventListener("click", () => {
    startupError.hidden = true;
    void initHeader();
  });
  startupError.replaceChildren(
    document.createTextNode(`Không tải được thanh điều hướng: ${getErrorMessage(error)} `),
    retryButton,
  );
  startupError.hidden = false;
}

async function initHeader() {
  try {
    await mountHeader({ active: "chat", externalState: true });
    await initializeLearnerHeader();
    const startupError = document.getElementById("pageStartupError");
    if (startupError) startupError.hidden = true;
  } catch (error) {
    showStartupError(error);
  } finally {
    document.body.removeAttribute("data-page-state");
  }
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error && error.message.trim()
    ? error.message
    : "Đã xảy ra lỗi không xác định.";
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Khởi chạy khi DOM sẵn sàng
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
