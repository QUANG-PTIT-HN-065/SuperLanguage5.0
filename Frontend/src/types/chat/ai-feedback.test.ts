import { describe, expect, it } from "vitest";
import { getAiFeedbackDisplay } from "./ai-feedback";

describe("getAiFeedbackDisplay", () => {
  it("hides structured feedback when the AI has no corrections to show", () => {
    const feedback = JSON.stringify({
      grammar_error: "",
      corrected_sentence: "",
      natural_suggestion: "",
    });

    expect(getAiFeedbackDisplay(feedback)).toEqual({ kind: "empty" });
  });

  it("passes structured feedback values to the frontend", () => {
    const feedback = JSON.stringify({
      grammar_error: "Dùng sai thì quá khứ.",
      corrected_sentence: "I went to school.",
      natural_suggestion: "I headed to school.",
    });

    expect(getAiFeedbackDisplay(feedback)).toEqual({
      kind: "structured",
      feedback: {
        grammar_error: "Dùng sai thì quá khứ.",
        corrected_sentence: "I went to school.",
        natural_suggestion: "I headed to school.",
      },
    });
  });

  it("does not expose malformed JSON-like feedback", () => {
    expect(getAiFeedbackDisplay('{"grammar_error":')).toEqual({ kind: "empty" });
  });

  it("keeps support for legacy plain-text feedback", () => {
    expect(getAiFeedbackDisplay("Hãy thử dùng thì quá khứ.")).toEqual({
      kind: "text",
      text: "Hãy thử dùng thì quá khứ.",
    });
  });
});
