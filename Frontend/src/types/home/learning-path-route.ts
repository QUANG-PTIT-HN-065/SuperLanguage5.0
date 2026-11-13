export interface LearningPathTopic {
  id: number;
  name: string;
  description: string | null;
  icon_url: string | null;
  word_count: number;
  mastered_word_count: number;
  progress_percent: number;
  is_locked: boolean;
  is_completed: boolean;
  quiz_score: number | null;
  quiz_question_count: number | null;
}
