import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const page = readFileSync(resolve(process.cwd(), "src/pages/chat/index.html"), "utf8");
const script = readFileSync(resolve(process.cwd(), "src/types/chat/chat.ts"), "utf8");
const chatApi = readFileSync(resolve(process.cwd(), "src/types/chat/chat-api.ts"), "utf8");
const styles = readFileSync(resolve(process.cwd(), "src/css/chat/style.css"), "utf8");

describe("AI chat page", () => {
  it("uses unique IDs for the active chat controls", () => {
    for (const id of ["messages", "welcomeCard", "messageForm", "messageInput", "sendButton", "voiceButton", "voiceStatus"]) {
      const matches = page.match(new RegExp(`id="${id}"`, "g")) ?? [];
      expect(matches, `${id} must appear once`).toHaveLength(1);
    }
  });

  it("connects the conversation history to its list and message APIs", () => {
    expect(page).toContain('id="conversationHistory"');
    expect(chatApi).toContain('const CHAT_API_PREFIX = "/api/v1/chat-ai"');
    expect(chatApi).toContain("listChatConversations");
    expect(chatApi).toContain("listConversationMessages");
    expect(script).toContain("async function openConversation(");
    expect(page).not.toContain('data-lang="Vietnamese"');
  });

  it("shows account navigation and identifies both sides of the chat", () => {
    expect(page).toContain("data-app-header");
    expect(script).toContain('await mountHeader({ active: "chat", externalState: true })');
    expect(script).toContain("await initializeLearnerHeader()");
    expect(script).toContain('message.sender_type === "user"');
    expect(page).toContain("Gia sư AI");
  });

  it("defines a responsive two-column chat layout", () => {
    expect(styles).toMatch(/\.room-grid\s*\{[^}]*grid-template-columns:\s*var\(--chat-sidebar-width\)\s+minmax\(0,\s*1fr\)/s);
    expect(styles).toMatch(/@media\s*\(max-width:\s*1023px\)[\s\S]*?\.room-grid\s*\{[^}]*grid-template-columns:\s*1fr/);
  });

  it("shows accessible recording status and sends recorded audio for transcription", () => {
    expect(page).toContain('aria-label="Giữ để nói với AI"');
    expect(page).toContain('aria-pressed="false"');
    expect(page).toContain('id="voiceStatus" role="status" aria-live="polite"');
    expect(page).toContain("Giữ phím Space");
    expect(script).toContain("new AudioRecorder");
    expect(script).toContain('addEventListener("pointerdown"');
    expect(script).toContain('addEventListener("pointerup"');
    expect(chatApi).toContain("/transcribe-audio");
    expect(chatApi).toContain('formData.append("conversation_id"');
    expect(chatApi).toContain('formData.append("audio"');
    expect(styles).toContain(".voice-button.is-recording");
  });
});
