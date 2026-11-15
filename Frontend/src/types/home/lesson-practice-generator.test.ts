import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  generateMockPractice,
  MOCK_PRACTICE_TOPIC_IDS,
  parseTopicVocabulary,
  type TopicVocabulary,
} from "./lesson-practice-generator";

const vocabularyResponse: unknown = JSON.parse(
  readFileSync(new URL("../../../mock/topic-vocabulary.json", import.meta.url), "utf8"),
);
const vocabularyFixture = (vocabularyResponse as { data: unknown }).data;

const fixture: TopicVocabulary = {
  id: 3,
  name: "Giao thông",
  language_code: "ja",
  words: Array.from({ length: 30 }, (_, index) => ({
    id: `word-${index + 1}`,
    word: `語${index + 1}`,
    reading: `ご${index + 1}`,
    meaning: `Nghĩa ${index + 1}`,
  })),
};

function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
}

describe("generateMockPractice", () => {
  it("creates 10–15 mixed questions with unique vocabulary per attempt", () => {
    const generated = generateMockPractice(301, "Mua vé tàu", fixture, [], seededRandom(12));
    const questions = generated.content.questions;
    const usedWords = generated.questionKeys.flatMap((key) =>
      key.startsWith("matching:")
        ? key.slice("matching:".length).split(":")
        : [key.split(":").at(-1) ?? ""],
    );

    expect(questions.length).toBeGreaterThanOrEqual(10);
    expect(questions.length).toBeLessThanOrEqual(15);
    expect(new Set(questions.map((question) => question.question_type)).size).toBe(3);
    expect(new Set(usedWords).size).toBe(usedWords.length);
    expect(questions.filter((question) => question.question_type === "multiple_choice")
      .every((question) => question.options.length === 4)).toBe(true);
    expect(questions.filter((question) => question.question_type === "matching")
      .every((question) => question.pairs.length === 3)).toBe(true);
  });

  it("avoids recently used question variants when generating the next set", () => {
    const first = generateMockPractice(301, "Mua vé tàu", fixture, [], seededRandom(48));
    const second = generateMockPractice(
      301,
      "Mua vé tàu",
      fixture,
      first.questionKeys,
      seededRandom(72),
    );

    expect(second.questionKeys.some((key) => first.questionKeys.includes(key))).toBe(false);
  });

  it("supports randomized practice for every configured mock topic", () => {
    for (const topicId of MOCK_PRACTICE_TOPIC_IDS) {
      const topic = parseTopicVocabulary(vocabularyFixture, topicId);
      const generated = generateMockPractice(
        9000 + topicId,
        topic.name,
        topic,
        [],
        seededRandom(topicId),
      );

      expect(generated.content.questions.length).toBeGreaterThanOrEqual(10);
      expect(generated.content.questions.length).toBeLessThanOrEqual(15);
      expect(new Set(generated.content.questions.map((question) => question.question_type)).size).toBe(3);
      expect(generated.content.generation?.language_code).toBe(topic.language_code);
      if (topic.language_code === "en") {
        expect(generated.content.questions.find((question) => question.question_type === "fill_in")?.prompt)
          .toContain("nghĩa tiếng Việt");
      }
    }
  });

  it("adapts the matching count to a smaller vocabulary without reusing words", () => {
    const smallTopic = { ...fixture, words: fixture.words.slice(0, 16) };
    const generated = generateMockPractice(301, "Mua vé tàu", smallTopic, [], () => 0.999);
    const usedWords = generated.questionKeys.flatMap((key) =>
      key.startsWith("matching:")
        ? key.slice("matching:".length).split(":")
        : [key.split(":").at(-1) ?? ""],
    );

    expect(generated.content.questions.length).toBe(14);
    expect(new Set(generated.content.questions.map((question) => question.question_type)).size).toBe(3);
    expect(new Set(usedWords).size).toBe(usedWords.length);
  });
});

describe("parseTopicVocabulary", () => {
  it("rejects a topic too small to produce a 10-question mixed quiz", () => {
    expect(() => parseTopicVocabulary({
      topics: {
        "3": {
          id: 3,
          name: "Giao thông",
          language_code: "ja",
          words: fixture.words.slice(0, 11),
        },
      },
    }, 3)).toThrow("ít nhất 12 từ");
  });
});
