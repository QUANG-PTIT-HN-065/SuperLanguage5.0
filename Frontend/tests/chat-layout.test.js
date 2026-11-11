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

  it("provides an accessible voice conversation control connected to chat", () => {
    expect(page).toContain('aria-label="Bắt đầu nói với AI"');
    expect(page).toContain('aria-pressed="false"');
    expect(page).toContain('id="voiceStatus" role="status" aria-live="polite"');
    expect(script).toContain("window.SpeechRecognition || window.webkitSpeechRecognition");
    expect(script).toContain('recognition.lang =');
    expect(script).toContain("void sendMessage(undefined, true)");
    expect(styles).toContain(".voice-button.is-recording");
  });
});
