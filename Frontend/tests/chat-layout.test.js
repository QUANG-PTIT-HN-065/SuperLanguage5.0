import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const page = readFileSync(resolve(process.cwd(), "src/pages/chat/index.html"), "utf8");
const script = readFileSync(resolve(process.cwd(), "src/types/chat/chat.ts"), "utf8");
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
    expect(script).toContain('apiGet<Conversation[]>("/api/v1/chat-ai/conversations")');
    expect(script).toContain("/messages?limit=1000&offset=0");
    expect(script).toContain("function renderConversationHistory()");
    expect(script).toContain("async function openConversation(");
  });

  it("shows account navigation and identifies both sides of the chat", () => {
    expect(page).toContain('href="../home/index.html"');
    expect(page).toContain('id="userAccount"');
    expect(page).toContain('id="profileName"');
    expect(page).toContain('id="logoutButton"');
    expect(script).toContain('role === "user"');
    expect(script).toContain('"Gia sư AI"');
  });

  it("defines a responsive two-column chat layout", () => {
    expect(styles).toMatch(/\.room-grid\s*\{[^}]*grid-template-columns:\s*minmax\(250px,\s*310px\)\s+minmax\(0,\s*1fr\)/s);
    expect(styles).toMatch(/@media\s*\(max-width:\s*700px\)[\s\S]*?\.room-grid\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/);
  });

  it("shows a live transcript and sends the final multilingual Whisper transcript", () => {
    expect(page).toContain('aria-label="Giữ để nói với AI"');
    expect(page).toContain('aria-pressed="false"');
    expect(page).toContain('id="voiceStatus" role="status" aria-live="polite"');
    expect(page).toContain("Giữ Space để nói");
    expect(script).toContain("recognition.onresult");
    expect(script).toContain('event.code !== "Space"');
    expect(script).toContain('addEventListener("pointerdown"');
    expect(script).toContain('addEventListener("pointerup"');
    expect(script).toContain('"/api/v1/chat-ai/transcribe-audio"');
    expect(script).toContain("messageInput.value = finalMessage");
    expect(script).toContain("Đã nhận dạng xong; đang gửi tin nhắn...");
    expect(script).toContain("void sendMessage(undefined, true)");
    expect(script).toContain("navigator.language");
    expect(styles).toContain(".voice-button.is-recording");
  });
});
