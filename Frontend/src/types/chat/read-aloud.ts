import { transcribePracticeAudio } from "../shared/speech-api.js";
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

function renderComparedText(
  element: HTMLElement,
  source: string,
  words: ComparedWord[],
): void {
  const fragment = document.createDocumentFragment();
  let cursor = 0;
  for (const word of words) {
    fragment.append(document.createTextNode(source.slice(cursor, word.start)));
    const wrapper = document.createElement("span");
    wrapper.className = word.isCorrect
      ? "chat-reading-practice__word--correct"
      : "chat-reading-practice__word--incorrect";
    const accessibleLabel = document.createElement("span");
    accessibleLabel.className = "sr-only";
    accessibleLabel.textContent = `${word.isCorrect ? "Đúng" : "Chưa đúng"}: `;
    const visibleWord = document.createElement("span");
    visibleWord.setAttribute("aria-hidden", "true");
    visibleWord.textContent = word.text;
    wrapper.append(accessibleLabel, visibleWord);
    fragment.append(wrapper);
    cursor = word.end;
  }
  fragment.append(document.createTextNode(source.slice(cursor)));
  element.replaceChildren(fragment);
}

export class ReadAloudPractice {
  private readonly panel = document.getElementById("readPractice");
  private readonly prompt = document.getElementById("readPracticePrompt");
  private readonly recordButton = document.getElementById("readPracticeRecord") as HTMLButtonElement | null;
  private readonly buttonText = document.getElementById("readPracticeButtonText");
  private readonly status = document.getElementById("readPracticeStatus");
  private readonly result = document.getElementById("readPracticeResult");
  private readonly score = document.getElementById("readPracticeScore");
  private readonly expectedText = document.getElementById("readPracticeExpected");
  private readonly transcriptText = document.getElementById("readPracticeTranscript");
  private readonly recorder: AudioRecorder;
  private readonly supported: boolean;
  private sentence = "";
  private languageCode = "en";
  private conversationId = "";
  private generation = 0;
  private isTranscribing = false;

  constructor() {
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
  }

  public setSentence(sentence: string, languageCode: string, conversationId: string): void {
    this.generation += 1;
    if (this.recorder.getState() !== "idle") this.recorder.cancel();
    this.isTranscribing = false;
    this.sentence = sentence.trim();
    this.languageCode = languageCode.toLowerCase().startsWith("ja") ? "ja" : "en";
    this.conversationId = conversationId;
    if (this.panel) this.panel.hidden = !this.sentence;
    if (this.prompt) this.prompt.textContent = this.sentence;
    if (this.result) this.result.hidden = true;
    this.expectedText?.replaceChildren();
    this.transcriptText?.replaceChildren();
    this.score?.replaceChildren();
    this.setStatus(
      this.sentence
        ? this.supported
          ? "Đọc câu hỏi trên rồi bấm nút để bắt đầu."
          : "Trình duyệt này không hỗ trợ ghi âm bằng micro."
        : "",
    );
    this.updateButton();
  }

  public reset(): void {
    this.setSentence("", "en", "");
  }

  private async toggleRecording(): Promise<void> {
    if (!this.sentence || !this.supported || this.isTranscribing) return;
    if (this.recorder.getState() === "recording") {
      this.setStatus("Đang xử lý bản ghi...");
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
    if (started) this.setStatus("Đang ghi âm · đọc câu mẫu rồi bấm dừng.");
  }

  private handleRecorderState(state: RecorderState): void {
    if (state === "requesting") {
      this.setStatus("Đang mở micro...");
    } else if (state === "recording") {
      this.setStatus("Đang ghi âm · đọc câu mẫu rồi bấm dừng.");
    }
    this.updateButton();
  }

  private updateButton(): void {
    if (!this.recordButton || !this.buttonText) return;
    const state = this.recorder.getState();
    this.recordButton.disabled =
      !this.sentence || !this.supported || this.isTranscribing || state === "requesting";
    this.buttonText.textContent = state === "recording" ? "Dừng và chấm điểm" : "Đọc câu hỏi";
    this.recordButton.setAttribute(
      "aria-label",
      state === "recording" ? "Dừng ghi âm và chấm điểm câu đọc" : "Bắt đầu đọc câu hỏi",
    );
  }

  private async handleRecordingComplete(blob: Blob): Promise<void> {
    const generation = this.generation;
    if (!blob.size) {
      this.setStatus("Bản ghi trống. Hãy thử đọc lại câu hỏi.", true);
      return;
    }

    this.isTranscribing = true;
    this.updateButton();
    this.setStatus("Đang nhận diện câu trả lời...");
    try {
      const response = await transcribePracticeAudio(this.conversationId, blob);
      if (generation !== this.generation) return;
      const comparison = compareTranscript(this.sentence, response.transcript, this.languageCode);
      if (!comparison.totalWordCount) {
        this.setStatus("Câu mẫu không có từ để đối chiếu.", true);
        return;
      }
      if (this.expectedText) {
        renderComparedText(this.expectedText, this.sentence, comparison.expected);
      }
      if (this.transcriptText) {
        renderComparedText(this.transcriptText, response.transcript, comparison.spoken);
      }
      if (this.score) {
        this.score.textContent =
          `Độ chính xác ${comparison.accuracy}% · ${comparison.correctWordCount}/${comparison.totalWordCount} từ đúng`;
      }
      if (this.result) this.result.hidden = false;
      this.setStatus("Đã chấm điểm phần đọc.");
    } catch (error) {
      if (generation === this.generation) {
        this.setStatus(
          error instanceof Error ? error.message : "Không thể nhận diện câu đọc. Vui lòng thử lại.",
          true,
        );
      }
    } finally {
      if (generation === this.generation) {
        this.isTranscribing = false;
        this.updateButton();
      }
    }
  }

  private setStatus(message: string, isError = false): void {
    if (!this.status) return;
    this.status.textContent = message;
    this.status.dataset.state = isError ? "error" : "";
  }
}
