import { initializeLearnerHeader } from "../shared/learner-header";
import { isLearnerAuthenticated } from "../shared/api-client.js";
import { mountHeader } from "../ui/header.js";
import { AudioRecorder, RecorderState } from "../ui/recorder.js";
import { renderQuickReplies } from "../ui/feedback.js";
import { getAiFeedbackDisplay } from "./ai-feedback.js";
import { ReadAloudPractice } from "./read-aloud.js";
import {
  createChatConversation,
  generateChatReadingPrompt,
  listChatConversations,
  listConversationMessages,
  listReadingPracticeTurns,
  sendChatMessage,
  sendVoiceChatMessage,
  synthesizeChatSpeech,
  type Conversation,
} from "./chat-api.js";

const GUEST_TRIAL_KEY = "slanguage_guest_chat_count";
const MAX_GUEST_TRIALS = 3;

// Language greetings
const LANGUAGE_META: Record<string, { flag: string; greeting: string; subtext: string; promptLang: string }> = {
  English: {
    flag: "../../../assets/flags/flag-en.png",
    greeting: "Hello! Ready to speak English?",
    subtext: "Bắt đầu bằng lời chào hoặc điều bạn muốn nói. Gia sư AI sẽ trò chuyện tiếp theo mạch của bạn.",
    promptLang: "en-US",
  },
  Japanese: {
    flag: "../../../assets/flags/flag-jp.png",
    greeting: "こんにちは！一緒に日本語を話しましょう！",
    subtext: "話したいことから始めましょう。AI が会話の流れに合わせて応答します。",
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
const readingPromptStatus = document.getElementById("readingPromptStatus") as HTMLElement | null;
const readPracticePanel = document.getElementById("readPractice") as HTMLElement | null;

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
const startSessionIcon = document.getElementById("startSessionIcon");
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
type PracticeMode = "free-chat" | "read-aloud";
let currentPracticeMode: PracticeMode = "free-chat";
let activeSessionMode: PracticeMode | null = null;
let activeConversation: Conversation | null = null;
let conversationHistory: Conversation[] = [];
let isGuest = true;
let guestTrialCount = 0;
let isStartingSession = false;
let isSessionStarted = false;
let isSendingMessage = false;
let isGeneratingReadingPrompt = false;
let sessionSeconds = 0;
let sessionTimerInterval: number | null = null;
let totalMessagesExchanged = 0;
let audioRecorder: AudioRecorder | null = null;
let speechRequestId = 0;
let activeSpeechAudio: HTMLAudioElement | null = null;
let activeSpeechUrl: string | null = null;
let spacePressed = false;
const readAloudPractice = new ReadAloudPractice((text, languageCode) =>
  speakText(text, languageCode.toLowerCase().startsWith("ja") ? "Japanese" : "English"),
  () => requestReadingPrompt(),
);

// Initial setup
async function init() {
  checkAuthStatus();
  setupLanguageChips();
  setupPracticeModeTabs();
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

  const guestCard = document.getElementById("guestCard");
  const learnerCard = document.getElementById("learnerCard");

  if (isGuest) {
    document.body.classList.add("user-guest");
    document.body.classList.remove("user-authenticated");
    if (guestCard) guestCard.hidden = false;
    if (learnerCard) learnerCard.hidden = true;
    if (guestQuotaBar) guestQuotaBar.hidden = false;
    if (readingPromptStatus) {
      readingPromptStatus.textContent = "Đăng nhập để tạo câu hỏi và nhận góp ý của AI.";
    }

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
    if (readingPromptStatus) {
      readingPromptStatus.textContent = "AI sẽ tạo câu hỏi và câu trả lời mẫu theo chủ đề.";
    }
    loadLearnerProfile();
  }
  updatePracticeModeView();
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
   NGÔN NGỮ & CHẾ ĐỘ LUYỆN TẬP
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

function setupPracticeModeTabs() {
  const tabs = Array.from(document.querySelectorAll<HTMLButtonElement>(".practice-mode-tab"));
  const tabList = document.querySelector<HTMLElement>('[role="tablist"][aria-label="Chế độ luyện tập"]');

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const mode = tab.dataset.practiceMode;
      if (mode === "free-chat" || mode === "read-aloud") setPracticeMode(mode);
    });
  });

  tabList?.addEventListener("keydown", (event) => {
    if (!(event instanceof KeyboardEvent)) return;
    const activeIndex = tabs.indexOf(document.activeElement as HTMLButtonElement);
    if (activeIndex < 0 || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;

    event.preventDefault();
    const nextIndex =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? tabs.length - 1
          : (activeIndex + (event.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length;
    tabs[nextIndex]?.focus();
    tabs[nextIndex]?.click();
  });

  updatePracticeModeView();
}

function setPracticeMode(mode: PracticeMode) {
  if (currentPracticeMode !== mode) readAloudPractice.reset();
  currentPracticeMode = mode;
  document.body.dataset.practiceMode = mode;

  document.querySelectorAll<HTMLButtonElement>(".practice-mode-tab").forEach((tab) => {
    const selected = tab.dataset.practiceMode === mode;
    tab.setAttribute("aria-selected", String(selected));
    tab.tabIndex = selected ? 0 : -1;
  });
  document.querySelectorAll<HTMLElement>("[data-practice-mode-panel]").forEach((panel) => {
    panel.hidden = panel.dataset.practiceModePanel !== mode;
  });

  updatePracticeModeView();
}

function updatePracticeModeView() {
  if (document.body) document.body.dataset.practiceMode = currentPracticeMode;
  if (startSessionBtnText) {
    startSessionBtnText.textContent =
      currentPracticeMode === "read-aloud" ? "Bắt đầu đọc theo mẫu" : "Bắt đầu trò chuyện tự do";
  }
  startSessionIcon?.classList.toggle("fa-microphone-lines", currentPracticeMode === "read-aloud");
  startSessionIcon?.classList.toggle("fa-comments", currentPracticeMode === "free-chat");
  if (startSessionHint) {
    if (isGuest && currentPracticeMode === "read-aloud") {
      startSessionHint.textContent = "Đăng nhập để tạo câu hỏi và nhận góp ý của AI.";
    } else if (currentPracticeMode === "read-aloud") {
      startSessionHint.textContent = "AI đưa câu hỏi và câu trả lời mẫu; bạn trả lời theo ý mình.";
    } else if (isGuest) {
      startSessionHint.textContent = "Bản xem trước giới hạn 3 lượt.";
    } else {
      startSessionHint.textContent = "Bắt đầu mà không cần chọn chủ đề.";
    }
  }
  if (!isSessionStarted && conversationTitle) {
    conversationTitle.textContent =
      currentPracticeMode === "read-aloud" ? currentTopic : "Trò chuyện tự do";
  }
  updateLanguageView(currentLanguage);
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
  if (conversationLanguage) {
    conversationLanguage.textContent =
      currentPracticeMode === "read-aloud" ? `${lang} · Đọc theo mẫu` : `${lang} · Trò chuyện tự do`;
  }

  const welcomeGreeting = document.getElementById("welcomeGreeting");
  const welcomeSubtext = document.getElementById("welcomeSubtext");
  if (welcomeGreeting) welcomeGreeting.textContent = meta.greeting;
  if (welcomeSubtext) {
    welcomeSubtext.textContent =
      currentPracticeMode === "read-aloud"
        ? "Chọn chủ đề, nghe câu hỏi, xem câu trả lời mẫu rồi trả lời theo cách của bạn."
        : meta.subtext;
  }
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
      if (currentPracticeMode === "read-aloud" && !isSessionStarted && conversationTitle) {
        conversationTitle.textContent = currentTopic;
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
      if (currentPracticeMode === "read-aloud" && !isSessionStarted && conversationTitle) {
        conversationTitle.textContent = val;
      }
    }
  });
}

function setupQuickStartCards() {
  const cards = document.querySelectorAll<HTMLButtonElement>(".quick-card");
  cards.forEach((card) => {
    card.addEventListener("click", () => {
      if (currentPracticeMode !== "free-chat") return;
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
      if (currentPracticeMode === "read-aloud") {
        if (isGuest) {
          showToast("Đăng nhập để tạo câu hỏi và nhận góp ý của AI.");
          return;
        }
        goToMobileChat(false);
        void startNewPracticeSession().then((started) => {
          if (started) void requestReadingPrompt();
        });
        return;
      }
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

function goToMobileChat(focusComposer = true) {
  document.body.setAttribute("data-mobile-step", "chat");
  if (focusComposer) messageInput?.focus();
}

async function startNewPracticeSession(initialAiPrompt?: string): Promise<boolean> {
  if (isStartingSession || isGeneratingReadingPrompt) return false;
  if (!isGuest && !isSupportedChatLanguage(currentLanguage)) {
    showToast("Hiện chỉ hỗ trợ luyện tập tiếng Anh và tiếng Nhật.");
    return false;
  }

  isStartingSession = true;
  if (startSessionBtn) startSessionBtn.disabled = true;
  const sessionTitle =
    currentPracticeMode === "read-aloud"
      ? currentTopic
      : initialAiPrompt
        ? currentTopic
        : "Trò chuyện tự do";
  if (conversationTitle) conversationTitle.textContent = sessionTitle;

  try {
    const conversation = isGuest
      ? null
      : await createChatConversation({
          title: sessionTitle,
          language_code: getSupportedChatLanguage(currentLanguage),
          practice_mode: currentPracticeMode,
        });

    activeConversation = conversation;
    activeSessionMode = currentPracticeMode;
    if (conversation) setHeaderConnectionStatus("connected");
    readAloudPractice.reset();
    isSessionStarted = true;
    totalMessagesExchanged = 0;
    sessionSeconds = 0;
    startSessionTimer();

    document.getElementById("welcomeCard")?.remove();
    if (messagesElement) messagesElement.replaceChildren();
    if (messageInput) messageInput.disabled = false;
    if (voiceButton) voiceButton.disabled = false;
    if (sendButton) sendButton.disabled = !messageInput?.value.trim();

    if (currentPracticeMode === "free-chat") {
      const prompt = initialAiPrompt || getInitialGreeting(currentLanguage, sessionTitle);
      appendAiMessage(prompt, generateQuickReplies(currentLanguage));
    }
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

async function requestReadingPrompt(): Promise<void> {
  if (isGuest) {
    showToast("Đăng nhập để AI tạo câu hỏi và chấm điểm phần đọc.");
    return;
  }
  if (isSendingMessage || isGeneratingReadingPrompt) {
    showToast("Hãy chờ tác vụ hiện tại hoàn tất rồi thử lại.");
    return;
  }
  const matchingReadingConversation =
    activeConversation &&
    activeSessionMode === "read-aloud" &&
    activeConversation.title === currentTopic &&
    languageFromCode(activeConversation.language_code) === currentLanguage;
  if ((!isSessionStarted || !matchingReadingConversation) && !(await startNewPracticeSession())) return;
  if (!activeConversation) {
    showToast("Không tìm thấy buổi luyện tập đang mở.");
    return;
  }
  const conversation = activeConversation;
  isGeneratingReadingPrompt = true;
  if (messageInput) messageInput.disabled = true;
  if (sendButton) sendButton.disabled = true;
  if (voiceButton) voiceButton.disabled = true;
  if (readingPromptStatus) readingPromptStatus.textContent = "AI đang tạo câu hỏi theo chủ đề...";
  if (readPracticePanel && messagesElement) {
    messagesElement.append(readPracticePanel);
    readPracticePanel.hidden = false;
  }
  setLiveStatus("THINKING");

  try {
    const response = await generateChatReadingPrompt(conversation.id);
    if (activeConversation?.id !== conversation.id) return;
    if (!response.question.trim() || !response.sample_answer.trim()) {
      throw new Error("AI chưa trả về câu hỏi và câu trả lời mẫu hợp lệ.");
    }

    document.getElementById("welcomeCard")?.remove();
    if (readPracticePanel && messagesElement) messagesElement.append(readPracticePanel);
    const newTurn = {
      ...response,
      transcript: null,
      ai_feedback: null,
    };
    readAloudPractice.addTurn(newTurn, conversation.language_code, conversation.id);
    await readAloudPractice.speakQuestion(newTurn);
    if (readingPromptStatus) readingPromptStatus.textContent = `Câu hỏi theo chủ đề “${conversation.title}” đã sẵn sàng.`;
    scrollToBottom();
  } catch (error) {
    const message = getErrorMessage(error);
    if (readingPromptStatus) readingPromptStatus.textContent = `Không tạo được câu hỏi: ${message}`;
    showToast(`Không tạo được câu hỏi: ${message}`);
  } finally {
    isGeneratingReadingPrompt = false;
    if (messageInput) messageInput.disabled = !isSupportedChatLanguage(currentLanguage);
    if (voiceButton) voiceButton.disabled = !isSupportedChatLanguage(currentLanguage);
    if (sendButton) {
      sendButton.disabled =
        !isSupportedChatLanguage(currentLanguage) || !messageInput?.value.trim();
    }
    setLiveStatus("READY");
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
    if (topic === "Trò chuyện tự do") return "こんにちは！今日は何について話しましょうか？";
    return `こんにちは！今日は「${topic}」について練習しましょう。準備はいいですか？`;
  }
  if (lang === "Vietnamese") {
    if (topic === "Trò chuyện tự do") return "Xin chào! Hôm nay bạn muốn trò chuyện về điều gì?";
    return `Xin chào bạn! Hôm nay chúng ta sẽ cùng luyện tập chủ đề "${topic}". Bạn muốn chia sẻ điều gì trước?`;
  }
  if (topic === "Trò chuyện tự do") return "Hi! What would you like to talk about today?";
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

    if (voiceStatus) voiceStatus.textContent = "Đang xử lý giọng nói...";
    const sent = await sendMessage("", blob);
    if (voiceStatus) {
      voiceStatus.textContent = sent
        ? "Đã gửi tin nhắn bằng giọng nói."
        : "Tin nhắn chưa được gửi. Hãy thử lại.";
    }
  } catch (error) {
    const message = getErrorMessage(error);
    if (voiceStatus) voiceStatus.textContent = `Không thể gửi giọng nói: ${message}`;
    showToast(`Không thể gửi giọng nói: ${message}`);
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

async function sendMessage(content: string, voiceAudio?: Blob): Promise<boolean> {
  const text = content.trim();
  if ((!text && !voiceAudio) || isSendingMessage || isGeneratingReadingPrompt) return false;

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
    const response = voiceAudio
      ? await sendVoiceChatMessage(conversationId, voiceAudio)
      : await sendChatMessage(conversationId, text);
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
    ttsBtn.addEventListener("click", () => {
      void speakText(text, currentLanguage);
    });
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

function stopSpeechPlayback(): number {
  speechRequestId++;
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();

  const audio = activeSpeechAudio;
  activeSpeechAudio = null;
  if (audio) {
    audio.onended = null;
    audio.onerror = null;
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
  }
  if (activeSpeechUrl) {
    URL.revokeObjectURL(activeSpeechUrl);
    activeSpeechUrl = null;
  }
  return speechRequestId;
}

function renderAiFeedback(feedback?: string | null): string {
  const display = getAiFeedbackDisplay(feedback);
  if (display.kind === "empty") return "";

  if (display.kind === "text") {
    return `
      <div class="ai-feedback-accordion" role="region" aria-label="Góp ý từ gia sư AI">
        <button type="button" class="feedback-toggle-btn" aria-expanded="false">
          <i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i>
          <span>Xem góp ý từ gia sư</span>
          <i class="fa-solid fa-chevron-down toggle-icon" aria-hidden="true"></i>
        </button>
        <div class="feedback-content" hidden><p>${escapeHtml(display.text)}</p></div>
      </div>
    `;
  }

  const structured = display.feedback;
  const rows = [
    structured.grammar_error ? `
      <div class="feedback-row">
        <div class="feedback-row-header"><span class="row-title"><i class="fa-solid fa-circle-exclamation"></i> Lỗi ngữ pháp</span></div>
        <p>${escapeHtml(structured.grammar_error)}</p>
      </div>
    ` : "",
    structured.corrected_sentence ? `
      <div class="feedback-row">
        <div class="feedback-row-header"><span class="row-title"><i class="fa-solid fa-check"></i> Câu sửa đúng</span></div>
        <p>${escapeHtml(structured.corrected_sentence)}</p>
      </div>
    ` : "",
    structured.natural_suggestion ? `
      <div class="feedback-row">
        <div class="feedback-row-header"><span class="row-title"><i class="fa-solid fa-comment-dots"></i> Gợi ý cách nói tự nhiên hơn</span></div>
        <p>${escapeHtml(structured.natural_suggestion)}</p>
      </div>
    ` : "",
  ].filter(Boolean).join("");

  return `
    <div class="ai-feedback-accordion" role="region" aria-label="Góp ý từ gia sư AI">
      <button type="button" class="feedback-toggle-btn" aria-expanded="false">
        <i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i>
        <span>Xem góp ý từ gia sư</span>
        <i class="fa-solid fa-chevron-down toggle-icon" aria-hidden="true"></i>
      </button>
      <div class="feedback-content" hidden>
        ${rows}
      </div>
    </div>
  `;
}

function speakWithBrowser(text: string, lang: string): void {
  if (!("speechSynthesis" in window)) {
    showToast("Dịch vụ giọng đọc và giọng đọc của trình duyệt đều không khả dụng.");
    return;
  }
  const utterance = new SpeechSynthesisUtterance(text);
  const code = LANGUAGE_META[lang]?.promptLang || "en-US";
  utterance.lang = code;
  window.speechSynthesis.speak(utterance);
}

async function speakText(text: string, lang: string): Promise<void> {
  const requestId = stopSpeechPlayback();
  let browserFallbackShown = false;
  const useBrowserFallback = (error?: unknown) => {
    if (requestId !== speechRequestId || browserFallbackShown) return;
    browserFallbackShown = true;
    if (error) {
      console.warn("Edge TTS failed; using browser speech synthesis.", error);
      showToast("Dịch vụ giọng đọc chưa khả dụng; đang dùng giọng trình duyệt.");
    }
    speakWithBrowser(text, lang);
  };

  if (isLearnerAuthenticated()) {
    try {
      const audioBlob = await synthesizeChatSpeech(text, lang);
      if (requestId !== speechRequestId) return;

      const url = URL.createObjectURL(audioBlob);
      const audio = new Audio(url);
      activeSpeechAudio = audio;
      activeSpeechUrl = url;
      const releaseAudio = () => {
        audio.onended = null;
        audio.onerror = null;
        if (activeSpeechAudio === audio) activeSpeechAudio = null;
        if (activeSpeechUrl === url) {
          URL.revokeObjectURL(url);
          activeSpeechUrl = null;
        }
      };
      audio.onended = releaseAudio;
      audio.onerror = () => {
        releaseAudio();
        useBrowserFallback(new Error("Không phát được audio TTS."));
      };
      try {
        await audio.play();
        return;
      } catch (error) {
        releaseAudio();
        throw error;
      }
    } catch (error) {
      useBrowserFallback(error);
      return;
    }
  }

  useBrowserFallback();
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
  if (!conversation || isSendingMessage || isGeneratingReadingPrompt) return;

  try {
    historyStatus.textContent = "Đang tải hội thoại...";
    historyStatus.hidden = false;
    const practiceMode = conversation.practice_mode ?? "free-chat";
    const [messages, readingTurns] = await Promise.all([
      practiceMode === "read-aloud" ? Promise.resolve([]) : listConversationMessages(conversationId),
      practiceMode === "read-aloud" ? listReadingPracticeTurns(conversationId) : Promise.resolve([]),
    ]);

    setPracticeMode(practiceMode);
    activeConversation = conversation;
    activeSessionMode = practiceMode;
    isSessionStarted = true;
    currentTopic = conversation.title;
    setSelectedLanguage(languageFromCode(conversation.language_code));
    if (conversationTitle) conversationTitle.textContent = conversation.title;
    if (messagesElement) messagesElement.replaceChildren();
    document.getElementById("welcomeCard")?.remove();

    if (practiceMode === "read-aloud") {
      if (readPracticePanel && messagesElement) messagesElement.append(readPracticePanel);
      readAloudPractice.setTurns(
        readingTurns,
        conversation.language_code,
        conversation.id,
      );
      if (readingPromptStatus) {
        readingPromptStatus.textContent = readAloudPractice.hasPendingTurn()
          ? "Đọc câu trả lời mẫu thành tiếng để AI chấm phát âm."
          : "AI đang chuẩn bị câu hỏi tiếp theo...";
      }
      totalMessagesExchanged = readingTurns.filter((turn) => turn.transcript).length;
    } else {
      readAloudPractice.reset();
      totalMessagesExchanged = messages.filter((message) => message.sender_type === "user").length;
      for (const message of messages) {
        if (message.sender_type === "user") appendUserMessage(message.content);
        else appendAiMessage(message.content, undefined, message.ai_feedback);
      }
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
    if (practiceMode === "read-aloud") {
      void requestReadingPrompt();
    }
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
