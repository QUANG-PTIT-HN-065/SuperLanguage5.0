export interface LessonOption {
  id: string;
  text: string;
}

export interface LessonMatchingPair {
  id: string;
  word: string;
  meaning: string;
}

interface LessonQuestionBase {
  id: number;
  prompt: string;
  correct_option_id?: string;
  explanation?: string | null;
}

export type LessonQuestion =
  | (LessonQuestionBase & {
      question_type: "multiple_choice";
      options: LessonOption[];
      pairs?: never;
    })
  | (LessonQuestionBase & {
      question_type: "fill_in";
      options: LessonOption[];
      pairs?: never;
    })
  | (LessonQuestionBase & {
      question_type: "matching";
      options: [];
      pairs: LessonMatchingPair[];
    });

export interface LessonContent {
  lesson: {
    id: number;
    title: string;
    description: string | null;
  };
  questions: LessonQuestion[];
  generation?: {
    source: "mock" | "ai";
    schema_version: 1;
    topic_id: number;
    topic_name: string;
    language_code: string;
  };
}

export interface TopicVocabularyWord {
  id: string;
  word: string;
  reading: string;
  meaning: string;
}

export interface TopicVocabulary {
  id: number;
  name: string;
  language_code: string;
  words: TopicVocabularyWord[];
}

export interface GeneratedPractice {
  content: LessonContent;
  questionKeys: string[];
}

export const MOCK_PRACTICE_TOPIC_IDS: ReadonlySet<number> = new Set([
  1, 2, 3, 4, 5, 6, 11, 17, 18,
]);

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object"
    ? value as Record<string, unknown>
    : {};
}

function shuffle<T>(values: T[], random: () => number): T[] {
  const shuffled = [...values];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[other]] = [shuffled[other], shuffled[index]];
  }
  return shuffled;
}

export function parseTopicVocabulary(value: unknown, topicId: number): TopicVocabulary {
  const topicData = asRecord(asRecord(asRecord(value).topics)[String(topicId)]);
  const id = Number(topicData.id);
  const name = typeof topicData.name === "string" ? topicData.name.trim() : "";
  const languageCode = typeof topicData.language_code === "string" ? topicData.language_code.trim() : "";
  if (id !== topicId || !name || !languageCode || !Array.isArray(topicData.words)) {
    throw new Error("Chủ đề chưa có dữ liệu từ vựng thử nghiệm hợp lệ.");
  }

  const seenIds = new Set<string>();
  const seenWords = new Set<string>();
  const words = topicData.words.map((value): TopicVocabularyWord => {
    const wordData = asRecord(value);
    const wordId = typeof wordData.id === "string" ? wordData.id.trim() : "";
    const word = typeof wordData.word === "string" ? wordData.word.trim() : "";
    const reading = typeof wordData.reading === "string" ? wordData.reading.trim() : "";
    const meaning = typeof wordData.meaning === "string" ? wordData.meaning.trim() : "";
    if (!wordId || !word || !reading || !meaning || seenIds.has(wordId) || seenWords.has(word)) {
      throw new Error("Danh sách từ vựng thử nghiệm có mục không hợp lệ hoặc bị trùng.");
    }
    seenIds.add(wordId);
    seenWords.add(word);
    return { id: wordId, word, reading, meaning };
  });

  if (words.length < 12) {
    throw new Error("Chủ đề cần ít nhất 12 từ để tạo đề thử từ 10 đến 15 câu.");
  }
  return { id, name, language_code: languageCode, words };
}

function buildQuestionTypes(
  count: number,
  vocabularySize: number,
  random: () => number,
): Array<"multiple_choice" | "fill_in" | "matching"> {
  const matchingCount = Math.max(
    1,
    Math.min(Math.floor(count / 3), Math.floor((vocabularySize - count) / 2)),
  );
  const singleWordCount = count - matchingCount;
  const multipleChoiceCount = Math.floor(singleWordCount / 2);
  const fillInCount = singleWordCount - multipleChoiceCount;
  return shuffle([
    ...Array.from({ length: multipleChoiceCount }, () => "multiple_choice" as const),
    ...Array.from({ length: fillInCount }, () => "fill_in" as const),
    ...Array.from({ length: matchingCount }, () => "matching" as const),
  ], random);
}

function matchingKey(words: TopicVocabularyWord[]): string {
  return `matching:${words.map((word) => word.id).sort().join(":")}`;
}

export function generateMockPractice(
  lessonId: number,
  lessonTitle: string,
  topic: TopicVocabulary,
  recentQuestionKeys: string[] = [],
  random: () => number = Math.random,
): GeneratedPractice {
  const maxQuestionCount = Math.min(15, topic.words.length - 2);
  const questionCount = 10 + Math.floor(random() * (maxQuestionCount - 9));
  const questionTypes = buildQuestionTypes(questionCount, topic.words.length, random);
  const questionKeys = new Set(recentQuestionKeys);
  const usedWords = new Set<string>();
  const availableWords = shuffle(topic.words, random);
  const questions: LessonQuestion[] = [];

  const takeSingleWord = (type: "multiple_choice" | "fill_in"): {
    word: TopicVocabularyWord;
    direction: "meaning_to_word" | "word_to_meaning";
    key: string;
  } => {
    const candidates = availableWords.filter((word) => !usedWords.has(word.id));
    for (const word of candidates) {
      const directions = type === "multiple_choice"
        ? shuffle(["word_to_meaning", "meaning_to_word"] as const, random)
        : ["word_to_meaning"] as const;
      const direction = directions.find((candidate) =>
        !questionKeys.has(`${type}:${candidate}:${word.id}`),
      );
      if (direction) {
        usedWords.add(word.id);
        const key = `${type}:${direction}:${word.id}`;
        questionKeys.add(key);
        return { word, direction, key };
      }
    }

    const word = candidates[0];
    if (!word) throw new Error("Không đủ từ vựng để tạo bộ câu hỏi thử nghiệm.");
    const direction = type === "multiple_choice" ? "word_to_meaning" : "word_to_meaning";
    usedWords.add(word.id);
    const key = `${type}:${direction}:${word.id}`;
    questionKeys.add(key);
    return { word, direction, key };
  };

  for (const type of questionTypes) {
    const id = lessonId * 1000 + questions.length + 1;
    if (type === "matching") {
      const candidates = availableWords.filter((word) => !usedWords.has(word.id));
      let group: TopicVocabularyWord[] | null = null;
      for (let attempt = 0; attempt < 100; attempt += 1) {
        const candidate = shuffle(candidates, random).slice(0, 3);
        if (candidate.length === 3 && !questionKeys.has(matchingKey(candidate))) {
          group = candidate;
          break;
        }
      }
      group ??= candidates.slice(0, 3);
      if (group.length !== 3) throw new Error("Không đủ từ vựng để tạo lượt ghép cặp.");
      const key = matchingKey(group);
      questionKeys.add(key);
      group.forEach((word) => usedWords.add(word.id));
      questions.push({
        id,
        question_type: "matching",
        prompt: "Ghép từng từ với nghĩa tiếng Việt tương ứng.",
        options: [],
        pairs: group.map(({ id: pairId, word, meaning }) => ({ id: pairId, word, meaning })),
        correct_option_id: "all-matched",
        explanation: "Ghép đủ các từ trong chủ đề mà không nhầm cặp.",
      });
      continue;
    }

    const selected = takeSingleWord(type);
    if (type === "fill_in") {
      const englishFillIn = topic.language_code === "en";
      questions.push({
        id,
        question_type: "fill_in",
        prompt: englishFillIn
          ? `Điền nghĩa tiếng Việt của “${selected.word.word}”.`
          : `Điền cách đọc của “${selected.word.word}”.`,
        options: [],
        correct_option_id: englishFillIn ? selected.word.meaning : selected.word.reading,
        explanation: englishFillIn
          ? `${selected.word.word} nghĩa là “${selected.word.meaning}”.`
          : `${selected.word.word} đọc là ${selected.word.reading}, nghĩa là “${selected.word.meaning}”.`,
      });
      continue;
    }

    const isReverse = selected.direction === "meaning_to_word";
    const distractors = shuffle(
      availableWords.filter((word) => word.id !== selected.word.id),
      random,
    ).slice(0, 3);
    const options = shuffle(
      [selected.word, ...distractors].map((word) => ({
        id: word.id,
        text: isReverse ? word.word : word.meaning,
      })),
      random,
    );
    questions.push({
      id,
      question_type: "multiple_choice",
      prompt: isReverse
        ? `Từ nào có nghĩa là “${selected.word.meaning}”?`
        : `“${selected.word.word}” có nghĩa là gì?`,
      options,
      correct_option_id: selected.word.id,
      explanation: `${selected.word.word} (${selected.word.reading}) nghĩa là “${selected.word.meaning}”.`,
    });
  }

  return {
    content: {
      lesson: {
        id: lessonId,
        title: lessonTitle === "Từ vựng cốt lõi" ? topic.name : lessonTitle,
        description: `Đề thử ngẫu nhiên từ vựng chủ đề ${topic.name}.`,
      },
      questions,
      generation: {
        source: "mock",
        schema_version: 1,
        topic_id: topic.id,
        topic_name: topic.name,
        language_code: topic.language_code,
      },
    },
    questionKeys: [...questionKeys].filter((key) => !recentQuestionKeys.includes(key)),
  };
}
