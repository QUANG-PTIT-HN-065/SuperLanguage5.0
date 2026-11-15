export interface StructuredAiFeedback {
  grammar_error: string;
  corrected_sentence: string;
  natural_suggestion: string;
}

export type AiFeedbackDisplay =
  | { kind: "empty" }
  | { kind: "structured"; feedback: StructuredAiFeedback }
  | { kind: "text"; text: string };

function stripCodeFence(feedback: string): string {
  return feedback
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function parseStructuredAiFeedback(feedback: string): StructuredAiFeedback | null {
  const normalized = stripCodeFence(feedback);
  if (!normalized) return null;

  try {
    const parsed: unknown = JSON.parse(normalized);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;

    const record = parsed as Record<string, unknown>;
    return {
      grammar_error:
        typeof record.grammar_error === "string" ? record.grammar_error.trim() : "",
      corrected_sentence:
        typeof record.corrected_sentence === "string"
          ? record.corrected_sentence.trim()
          : "",
      natural_suggestion:
        typeof record.natural_suggestion === "string"
          ? record.natural_suggestion.trim()
          : "",
    };
  } catch {
    return null;
  }
}

function looksLikeJson(feedback: string): boolean {
  const normalized = stripCodeFence(feedback);
  if (normalized.startsWith("{") || normalized.startsWith("[")) return true;

  try {
    JSON.parse(normalized);
    return true;
  } catch {
    return feedback.trim().startsWith("```");
  }
}

export function getAiFeedbackDisplay(feedback?: string | null): AiFeedbackDisplay {
  const text = feedback?.trim();
  if (!text) return { kind: "empty" };

  const structured = parseStructuredAiFeedback(text);
  if (structured) {
    const hasContent = Object.values(structured).some(Boolean);
    return hasContent
      ? { kind: "structured", feedback: structured }
      : { kind: "empty" };
  }

  if (looksLikeJson(text)) return { kind: "empty" };
  return { kind: "text", text };
}
