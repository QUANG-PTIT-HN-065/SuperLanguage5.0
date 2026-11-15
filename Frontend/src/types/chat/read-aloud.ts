import {
  submitReadingPracticeAnswer,
  type ReadingPracticeTurn,
} from "./chat-api.js";
import { AudioRecorder, RecorderState } from "../ui/recorder.js";

interface WordToken {
  text: string;
  normalized: string;
  start: number;
  end: number;
}

export interface ComparedWord extends WordToken {
  isCorrect: boolean;
}

export interface TranscriptComparison {
  expected: ComparedWord[];
  spoken: ComparedWord[];
  correctWordCount: number;
  totalWordCount: number;
  accuracy: number;
}

interface SegmentPart {
  segment: string;
  index: number;
  isWordLike?: boolean;
}

interface SegmenterLike {
  segment(input: string): Iterable<SegmentPart>;
}

type SegmenterConstructor = new (
  locales: string | string[],
  options: { granularity: "word" },
) => SegmenterLike;

const Segmenter = (Intl as typeof Intl & {
  Segmenter?: SegmenterConstructor;
}).Segmenter;

function normalizedWord(value: string, locale: string): string {
  return value.normalize("NFKC").toLocaleLowerCase(locale);
}

function tokenize(text: string, locale: string): WordToken[] {
  const tokens: WordToken[] = [];
  if (Segmenter) {
    const segmenter = new Segmenter(locale, { granularity: "word" });
    for (const part of segmenter.segment(text)) {
      if (!part.isWordLike) continue;
      tokens.push({
        text: part.segment,
        normalized: normalizedWord(part.segment, locale),
        start: part.index,
        end: part.index + part.segment.length,
      });
    }
    return tokens;
  }

  if (locale === "ja") {
    let offset = 0;
    for (const character of Array.from(text)) {
      const start = offset;
      offset += character.length;
      if (!/[\p{L}\p{N}\p{M}]/u.test(character)) continue;
      tokens.push({
        text: character,
        normalized: normalizedWord(character, locale),
        start,
        end: offset,
      });
    }
    return tokens;
  }

  for (const match of text.matchAll(/[\p{L}\p{N}\p{M}]+/gu)) {
    const start = match.index ?? 0;
    tokens.push({
      text: match[0],
      normalized: normalizedWord(match[0], locale),
      start,
      end: start + match[0].length,
    });
  }
  return tokens;
}

export function compareTranscript(
  expectedText: string,
  transcript: string,
  languageCode = "en",
): TranscriptComparison {
  const locale = languageCode.toLowerCase().startsWith("ja") ? "ja" : "en";
  const expected = tokenize(expectedText, locale).map((token) => ({ ...token, isCorrect: false }));
  const spoken = tokenize(transcript, locale).map((token) => ({ ...token, isCorrect: false }));
  const matches = Array.from(
    { length: expected.length + 1 },
    () => new Uint32Array(spoken.length + 1),
  );

  for (let expectedIndex = expected.length - 1; expectedIndex >= 0; expectedIndex -= 1) {
    for (let spokenIndex = spoken.length - 1; spokenIndex >= 0; spokenIndex -= 1) {
      matches[expectedIndex][spokenIndex] =
        expected[expectedIndex].normalized === spoken[spokenIndex].normalized
          ? matches[expectedIndex + 1][spokenIndex + 1] + 1
          : Math.max(
              matches[expectedIndex + 1][spokenIndex],
              matches[expectedIndex][spokenIndex + 1],
            );
    }
  }

  let expectedIndex = 0;
  let spokenIndex = 0;
  let correctWordCount = 0;
  while (expectedIndex < expected.length && spokenIndex < spoken.length) {
    if (expected[expectedIndex].normalized === spoken[spokenIndex].normalized) {
      expected[expectedIndex].isCorrect = true;
      spoken[spokenIndex].isCorrect = true;
      correctWordCount += 1;
      expectedIndex += 1;
      spokenIndex += 1;
    } else if (matches[expectedIndex + 1][spokenIndex] >= matches[expectedIndex][spokenIndex + 1]) {
      expectedIndex += 1;
    } else {
      spokenIndex += 1;
    }
  }

  const totalWordCount = expected.length;
  return {
    expected,
    spoken,
    correctWordCount,
    totalWordCount,
    accuracy: totalWordCount ? Math.round((correctWordCount / totalWordCount) * 100) : 0,
  };
}

export class ReadAloudPractice {
  private readonly panel = document.getElementById("readPractice");
  private readonly turnsElement = document.getElementById("readPracticeTurns");
  private readonly recordButton = document.getElementById("readPracticeRecord") as HTMLButtonElement | null;
  private readonly buttonText = document.getElementById("readPracticeButtonText");
  private readonly status = document.getElementById("readPracticeStatus");
  private readonly recorder: AudioRecorder;
  private readonly supported: boolean;
  private turns: ReadingPracticeTurn[] = [];
  private languageCode = "en";
  private conversationId = "";
  private generation = 0;
  private isSubmitting = false;

  constructor(
    private readonly speak: (text: string, languageCode: string) => Promise<void>,
    private readonly onAnswerSubmitted: () => Promise<void>,
  ) {
    this.recorder = new AudioRecorder(null, {
      maxDurationSeconds: 30,
      onStateChange: (state) => this.handleRecorderState(state),
      onTick: (remaining) => {
        if (remaining > 0 && remaining % 5 === 0) {
          this.setStatus(`Đang ghi âm · còn ${remaining} giây.`);
        }
      },
      onError: (_type, message) => this.setStatus(message, true),
      onRecordingComplete: (blob) => {
        void this.handleRecordingComplete(blob);
      },
    });
    this.supported = this.recorder.isSupported();
    this.recordButton?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      void this.toggleRecording();
    });
    this.turnsElement?.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const button = target.closest<HTMLButtonElement>("[data-speak-turn]");
      if (!button?.dataset.speakTurn) return;
      const turn = this.turns.find((item) => item.id === button.dataset.speakTurn);
      if (turn) {
        const text = button.dataset.speakPart === "sample"
          ? turn.sample_answer
          : turn.question;
        void this.speak(text, this.languageCode);
      }
    });
  }

  public setTurns(
    turns: ReadingPracticeTurn[],
    languageCode: string,
    conversationId: string,
  ): void {
    this.generation += 1;
    if (this.recorder.getState() !== "idle") this.recorder.cancel();
    this.isSubmitting = false;
    this.turns = turns;
    this.languageCode = languageCode.toLowerCase().startsWith("ja") ? "ja" : "en";
    this.conversationId = conversationId;
    if (this.panel) this.panel.hidden = !conversationId;
    this.renderTurns();
    this.setStatus(
      !conversationId
        ? ""
        : this.pendingTurn()
          ? this.supported
            ? "Đọc câu trả lời mẫu thành tiếng để AI chấm phát âm."
            : "Trình duyệt này không hỗ trợ ghi âm bằng micro."
          : "AI đang chuẩn bị câu hỏi tiếp theo...",
    );
    this.updateButton();
  }

  public addTurn(
    turn: ReadingPracticeTurn,
    languageCode: string,
    conversationId: string,
  ): void {
    this.languageCode = languageCode.toLowerCase().startsWith("ja") ? "ja" : "en";
    this.conversationId = conversationId;
    if (this.panel) this.panel.hidden = false;
    this.turns = this.turns.some((item) => item.id === turn.id)
      ? this.turns.map((item) => item.id === turn.id ? turn : item)
      : [...this.turns, turn];
    this.renderTurns();
    this.setStatus(
      this.supported
        ? "Đọc câu trả lời mẫu thành tiếng để AI chấm phát âm."
        : "Trình duyệt này không hỗ trợ ghi âm bằng micro.",
    );
    this.updateButton();
    this.scrollToLatestTurn();
  }

  public reset(): void {
    this.setTurns([], "en", "");
  }

  public speakQuestion(turn: ReadingPracticeTurn): Promise<void> {
    return this.speak(turn.question, this.languageCode);
  }

  public hasPendingTurn(): boolean {
    return Boolean(this.pendingTurn());
  }

  private pendingTurn(): ReadingPracticeTurn | undefined {
    return [...this.turns].reverse().find((turn) => !turn.transcript && !turn.ai_feedback);
  }

  private async toggleRecording(): Promise<void> {
    if (!this.pendingTurn() || !this.supported || this.isSubmitting) return;
    if (this.recorder.getState() === "recording") {
      this.setStatus("Đang xử lý câu trả lời...");
      this.updateButton();
      await this.recorder.stop();
      return;
    }
    if (this.recorder.getState() !== "idle") return;

    const generation = this.generation;
    const started = await this.recorder.start();
    if (generation !== this.generation) {
      this.recorder.cancel();
      return;
    }
    if (started) this.setStatus("Đang ghi âm · đọc câu trả lời mẫu rồi bấm dừng.");
  }

  private handleRecorderState(state: RecorderState): void {
    if (state === "requesting") {
      this.setStatus("Đang mở micro...");
    } else if (state === "recording") {
      this.setStatus("Đang ghi âm · đọc câu trả lời mẫu rồi bấm dừng.");
    }
    this.updateButton();
  }

  private updateButton(): void {
    if (!this.recordButton || !this.buttonText) return;
    const state = this.recorder.getState();
    this.recordButton.disabled =
      !this.pendingTurn() || !this.supported || this.isSubmitting || state === "requesting";
    this.buttonText.textContent = state === "recording"
      ? "Dừng và gửi bản ghi"
      : "Đọc câu mẫu để chấm phát âm";
    this.recordButton.setAttribute(
      "aria-label",
      state === "recording"
        ? "Dừng ghi âm và gửi bản ghi"
        : "Bắt đầu đọc câu trả lời mẫu",
    );
  }

  private async handleRecordingComplete(blob: Blob): Promise<void> {
    const generation = this.generation;
    const turn = this.pendingTurn();
    if (!turn) return;
    if (!blob.size) {
      this.setStatus("Bản ghi trống. Hãy thử trả lời lại.", true);
      return;
    }

    this.isSubmitting = true;
    this.updateButton();
    this.setStatus("Đang nghe và chấm phát âm...");
    try {
      const result = await submitReadingPracticeAnswer(
        this.conversationId,
        turn.id,
        blob,
      );
      if (generation !== this.generation) return;
      this.turns = this.turns.map((item) => item.id === result.id ? result : item);
      this.renderTurns();
      this.setStatus("Đã lưu điểm phát âm và góp ý của AI.");
      this.scrollToLatestTurn();
      await this.onAnswerSubmitted();
    } catch (error) {
      if (generation === this.generation) {
        this.setStatus(
          error instanceof Error
            ? error.message
            : "Không thể đánh giá câu trả lời. Vui lòng thử lại.",
          true,
        );
      }
    } finally {
      if (generation === this.generation) {
        this.isSubmitting = false;
        this.updateButton();
      }
    }
  }

  private renderTurns(): void {
    if (!this.turnsElement) return;
    const fragment = document.createDocumentFragment();
    for (const [index, turn] of this.turns.entries()) {
      const article = document.createElement("article");
      article.className = "chat-reading-practice__turn";

      const heading = document.createElement("div");
      heading.className = "chat-reading-practice__turn-heading";
      const title = document.createElement("h4");
      title.textContent = `Câu hỏi ${index + 1}`;
      const speakers = document.createElement("div");
      speakers.className = "chat-reading-practice__speakers";
      speakers.append(
        this.createSpeakButton(turn, "question", "Nghe câu hỏi", index),
        this.createSpeakButton(turn, "sample", "Nghe câu mẫu", index),
      );
      heading.append(title, speakers);
      article.append(heading);

      const messages = document.createElement("div");
      messages.className = "chat-reading-practice__messages";
      const questionMessage = document.createElement("div");
      questionMessage.className =
        "chat-reading-practice__message chat-reading-practice__message--assistant";
      this.appendTextBlock(questionMessage, "Câu hỏi", turn.question, "prompt");
      const sampleMessage = document.createElement("div");
      sampleMessage.className =
        "chat-reading-practice__message chat-reading-practice__message--sample";
      this.appendTextBlock(sampleMessage, "Câu trả lời mẫu", turn.sample_answer, "sample");
      messages.append(questionMessage, sampleMessage);

      if (turn.transcript) {
        const learnerColumn = document.createElement("div");
        learnerColumn.className = "chat-reading-practice__learner-column";
        const learnerMessage = document.createElement("div");
        learnerMessage.className =
          "chat-reading-practice__message chat-reading-practice__message--learner";
        this.appendTextBlock(learnerMessage, "Bạn đã trả lời", turn.transcript, "transcript");
        learnerColumn.append(learnerMessage);
        if (turn.ai_feedback) this.appendFeedback(learnerColumn, turn.ai_feedback);
        messages.append(learnerColumn);
      }

      article.append(messages);
      fragment.append(article);
    }
    this.turnsElement.replaceChildren(fragment);
  }

  private createSpeakButton(
    turn: ReadingPracticeTurn,
    part: "question" | "sample",
    label: string,
    index: number,
  ): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "chat-reading-practice__speak";
    button.dataset.speakTurn = turn.id;
    button.dataset.speakPart = part;
    button.setAttribute("aria-label", `${label}, câu hỏi ${index + 1}`);
    const icon = document.createElement("i");
    icon.className = "fa-solid fa-volume-high";
    icon.setAttribute("aria-hidden", "true");
    const text = document.createElement("span");
    text.textContent = label;
    button.append(icon, text);
    return button;
  }

  private appendTextBlock(
    parent: HTMLElement,
    label: string,
    text: string,
    kind: string,
  ): void {
    const block = document.createElement("div");
    block.className = `chat-reading-practice__block chat-reading-practice__block--${kind}`;
    const labelElement = document.createElement("p");
    labelElement.className = "chat-reading-practice__label";
    labelElement.textContent = label;
    const textElement = document.createElement("p");
    textElement.className = "chat-reading-practice__text";
    textElement.textContent = text;
    block.append(labelElement, textElement);
    parent.append(block);
  }

  private appendFeedback(
    parent: HTMLElement,
    feedback: NonNullable<ReadingPracticeTurn["ai_feedback"]>,
  ): void {
    const fields: [string, string][] = [
      ["Lỗi ngữ pháp", feedback.grammar_error],
      ["Câu sửa đúng", feedback.corrected_sentence],
      ["Cách nói tự nhiên hơn", feedback.natural_suggestion],
      ["Góp ý phát âm", feedback.pronunciation_feedback],
    ];
    if (feedback.pronunciation_score !== null) {
      fields.unshift(["Điểm phát âm", `${feedback.pronunciation_score}/100`]);
    }
    const populated = fields.filter(([, value]) => value.trim());
    if (!populated.length) {
      const notice = document.createElement("p");
      notice.className = "chat-reading-practice__feedback-empty";
      notice.textContent = "Câu trả lời không có lỗi đáng chú ý.";
      parent.append(notice);
      return;
    }

    const feedbackElement = document.createElement("div");
    feedbackElement.className = "chat-reading-practice__feedback";
    for (const [label, value] of populated) {
      this.appendTextBlock(feedbackElement, label, value, "feedback");
    }
    parent.append(feedbackElement);
  }

  private scrollToLatestTurn(): void {
    const lastTurn = this.turnsElement?.lastElementChild;
    lastTurn?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  private setStatus(message: string, isError = false): void {
    if (!this.status) return;
    this.status.textContent = message;
    this.status.dataset.state = isError ? "error" : "";
  }
}
