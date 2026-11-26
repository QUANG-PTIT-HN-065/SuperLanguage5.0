-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.languages (
  code text NOT NULL CHECK (code ~ '^[a-z]{2,3}$'::text),
  name text NOT NULL,
  native_name text NOT NULL,
  is_learnable boolean NOT NULL DEFAULT false,
  is_native_supported boolean NOT NULL DEFAULT false,
  sort_order smallint NOT NULL DEFAULT 100,
  CONSTRAINT languages_pkey PRIMARY KEY (code)
);
CREATE TABLE public.plans (
  id text NOT NULL,
  name text NOT NULL,
  daily_lesson_limit integer CHECK (daily_lesson_limit IS NULL OR daily_lesson_limit > 0),
  max_hearts integer CHECK (max_hearts IS NULL OR max_hearts > 0),
  video_access boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  sort_order smallint NOT NULL DEFAULT 100,
  CONSTRAINT plans_pkey PRIMARY KEY (id)
);
CREATE TABLE public.profiles (
  id uuid NOT NULL,
  email text,
  username text NOT NULL UNIQUE CHECK (username ~ '^[a-z0-9_]{3,30}$'::text),
  display_name text CHECK (char_length(display_name) >= 1 AND char_length(display_name) <= 50),
  avatar_url text CHECK (char_length(avatar_url) <= 500),
  birth_year smallint CHECK (birth_year >= 1900 AND birth_year <= 2100),
  country_code character CHECK (country_code ~ '^[A-Z]{2}$'::text),
  timezone text NOT NULL DEFAULT 'Asia/Ho_Chi_Minh'::text,
  native_language text NOT NULL DEFAULT 'vi'::text,
  target_language text NOT NULL DEFAULT 'en'::text,
  current_level USER-DEFINED,
  target_level USER-DEFINED,
  learning_goal text CHECK (learning_goal = ANY (ARRAY['travel'::text, 'work'::text, 'study'::text, 'exam'::text, 'hobby'::text, 'other'::text])),
  daily_goal_xp smallint NOT NULL DEFAULT 20 CHECK (daily_goal_xp >= 10 AND daily_goal_xp <= 500),
  reminder_time time without time zone,
  marketing_opt_in boolean NOT NULL DEFAULT false,
  show_on_leaderboard boolean NOT NULL DEFAULT true,
  terms_accepted_at timestamp with time zone,
  onboarding_completed_at timestamp with time zone,
  role USER-DEFINED NOT NULL DEFAULT 'learner'::user_role,
  status USER-DEFINED NOT NULL DEFAULT 'active'::user_status,
  plan_id text NOT NULL DEFAULT 'free'::text,
  plan_expires_at timestamp with time zone,
  last_sign_in_at timestamp with time zone,
  deleted_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  daily_goal_minutes smallint NOT NULL DEFAULT 15 CHECK (daily_goal_minutes >= 5 AND daily_goal_minutes <= 240),
  daily_goal_lessons smallint NOT NULL DEFAULT 1 CHECK (daily_goal_lessons >= 1 AND daily_goal_lessons <= 20),
  deletion_warning_at timestamp with time zone,
  deletion_scheduled_at timestamp with time zone,
  CONSTRAINT profiles_pkey PRIMARY KEY (id),
  CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id),
  CONSTRAINT profiles_native_language_fkey FOREIGN KEY (native_language) REFERENCES public.languages(code),
  CONSTRAINT profiles_target_language_fkey FOREIGN KEY (target_language) REFERENCES public.languages(code),
  CONSTRAINT profiles_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.plans(id)
);
CREATE TABLE public.user_stats (
  user_id uuid NOT NULL,
  xp_total bigint NOT NULL DEFAULT 0 CHECK (xp_total >= 0),
  words_learned integer NOT NULL DEFAULT 0 CHECK (words_learned >= 0),
  lessons_completed integer NOT NULL DEFAULT 0 CHECK (lessons_completed >= 0),
  current_streak integer NOT NULL DEFAULT 0 CHECK (current_streak >= 0),
  streak_start_date date,
  longest_streak integer NOT NULL DEFAULT 0 CHECK (longest_streak >= 0),
  longest_streak_start date,
  longest_streak_end date,
  last_activity_date date,
  streak_freezes smallint NOT NULL DEFAULT 0 CHECK (streak_freezes >= 0),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  hearts_remaining smallint NOT NULL DEFAULT 5 CHECK (hearts_remaining >= 0),
  hearts_locked_until timestamp with time zone,
  CONSTRAINT user_stats_pkey PRIMARY KEY (user_id),
  CONSTRAINT user_stats_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id)
);
CREATE TABLE public.daily_activity (
  user_id uuid NOT NULL,
  activity_date date NOT NULL,
  xp_earned integer NOT NULL DEFAULT 0 CHECK (xp_earned >= 0),
  lessons_completed integer NOT NULL DEFAULT 0 CHECK (lessons_completed >= 0),
  goal_met boolean NOT NULL DEFAULT false,
  CONSTRAINT daily_activity_pkey PRIMARY KEY (user_id, activity_date),
  CONSTRAINT daily_activity_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id)
);
CREATE TABLE public.streak_history (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  user_id uuid NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  length integer NOT NULL CHECK (length >= 1),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT streak_history_pkey PRIMARY KEY (id),
  CONSTRAINT streak_history_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id)
);
CREATE TABLE public.words (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  language_code text NOT NULL,
  word text NOT NULL,
  phonetic text,
  meaning text NOT NULL,
  part_of_speech text CHECK (part_of_speech = ANY (ARRAY['noun'::text, 'verb'::text, 'adjective'::text, 'adverb'::text, 'phrase'::text, 'other'::text])),
  audio_url text,
  example_sentence text,
  example_meaning text,
  level USER-DEFINED DEFAULT 'A1'::cefr_level,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT words_pkey PRIMARY KEY (id),
  CONSTRAINT words_language_code_fkey FOREIGN KEY (language_code) REFERENCES public.languages(code)
);
CREATE TABLE public.topics (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  language_code text NOT NULL,
  name text NOT NULL,
  description text,
  icon_url text,
  sort_order smallint DEFAULT 100,
  readings jsonb CHECK (readings IS NULL OR jsonb_typeof(readings) = 'array'::text AND jsonb_array_length(readings) = 5),
  CONSTRAINT topics_pkey PRIMARY KEY (id),
  CONSTRAINT topics_language_code_fkey FOREIGN KEY (language_code) REFERENCES public.languages(code)
);
CREATE TABLE public.word_topics (
  word_id bigint NOT NULL,
  topic_id bigint NOT NULL,
  CONSTRAINT word_topics_pkey PRIMARY KEY (word_id, topic_id),
  CONSTRAINT word_topics_word_id_fkey FOREIGN KEY (word_id) REFERENCES public.words(id),
  CONSTRAINT word_topics_topic_id_fkey FOREIGN KEY (topic_id) REFERENCES public.topics(id)
);
CREATE TABLE public.user_words (
  user_id uuid NOT NULL,
  word_id bigint NOT NULL,
  mastery_level smallint NOT NULL DEFAULT 0 CHECK (mastery_level >= 0 AND mastery_level <= 5),
  review_count integer NOT NULL DEFAULT 0 CHECK (review_count >= 0),
  last_reviewed_at timestamp with time zone,
  next_review_at timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT user_words_pkey PRIMARY KEY (user_id, word_id),
  CONSTRAINT user_words_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id),
  CONSTRAINT user_words_word_id_fkey FOREIGN KEY (word_id) REFERENCES public.words(id)
);
CREATE TABLE public.login_rate_limits (
  bucket_key text NOT NULL,
  attempts integer NOT NULL CHECK (attempts >= 0),
  window_started_at timestamp with time zone NOT NULL,
  CONSTRAINT login_rate_limits_pkey PRIMARY KEY (bucket_key)
);
CREATE TABLE public.conversations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  language_code text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  practice_mode text NOT NULL DEFAULT 'free-chat'::text CHECK (practice_mode = ANY (ARRAY['free-chat'::text, 'read-aloud'::text])),
  CONSTRAINT conversations_pkey PRIMARY KEY (id),
  CONSTRAINT conversations_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id),
  CONSTRAINT conversations_language_code_fkey FOREIGN KEY (language_code) REFERENCES public.languages(code)
);
CREATE TABLE public.messages (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL,
  sender_type text NOT NULL CHECK (sender_type = ANY (ARRAY['user'::text, 'ai'::text])),
  content text NOT NULL,
  audio_url text,
  ai_feedback text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT messages_pkey PRIMARY KEY (id),
  CONSTRAINT messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id)
);
CREATE TABLE public.lessons (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  topic_id bigint NOT NULL,
  title text NOT NULL CHECK (char_length(btrim(title)) >= 1 AND char_length(btrim(title)) <= 150),
  description text,
  sort_order smallint NOT NULL DEFAULT 100,
  xp_reward integer NOT NULL DEFAULT 20 CHECK (xp_reward >= 0 AND xp_reward <= 500),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  learning_path_id bigint,
  is_topic_quiz boolean NOT NULL DEFAULT false,
  CONSTRAINT lessons_pkey PRIMARY KEY (id),
  CONSTRAINT lessons_topic_id_fkey FOREIGN KEY (topic_id) REFERENCES public.topics(id),
  CONSTRAINT lessons_learning_path_id_fkey FOREIGN KEY (learning_path_id) REFERENCES public.learning_paths(id)
);
CREATE TABLE public.lesson_questions (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  lesson_id bigint NOT NULL,
  prompt text NOT NULL CHECK (char_length(btrim(prompt)) >= 1 AND char_length(btrim(prompt)) <= 1000),
  options jsonb NOT NULL,
  correct_option_id text NOT NULL,
  explanation text,
  sort_order smallint NOT NULL DEFAULT 100,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  question_type text NOT NULL DEFAULT 'multiple_choice'::text,
  CONSTRAINT lesson_questions_pkey PRIMARY KEY (id),
  CONSTRAINT lesson_questions_lesson_id_fkey FOREIGN KEY (lesson_id) REFERENCES public.lessons(id)
);
CREATE TABLE public.lesson_attempt_answers (
  user_id uuid NOT NULL,
  question_id bigint NOT NULL,
  selected_option_id text NOT NULL,
  is_correct boolean NOT NULL,
  checked_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT lesson_attempt_answers_pkey PRIMARY KEY (user_id, question_id),
  CONSTRAINT lesson_attempt_answers_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id),
  CONSTRAINT lesson_attempt_answers_question_id_fkey FOREIGN KEY (question_id) REFERENCES public.lesson_questions(id)
);
CREATE TABLE public.lesson_progress (
  user_id uuid NOT NULL,
  lesson_id bigint NOT NULL,
  score integer NOT NULL CHECK (score >= 0),
  question_count integer NOT NULL CHECK (question_count > 0),
  xp_awarded integer NOT NULL CHECK (xp_awarded >= 0),
  completed_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT lesson_progress_pkey PRIMARY KEY (user_id, lesson_id),
  CONSTRAINT lesson_progress_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id),
  CONSTRAINT lesson_progress_lesson_id_fkey FOREIGN KEY (lesson_id) REFERENCES public.lessons(id)
);
CREATE TABLE public.user_word_review_events (
  user_id uuid NOT NULL,
  review_id uuid NOT NULL,
  word_id bigint NOT NULL,
  rating text NOT NULL CHECK (rating = ANY (ARRAY['Khó'::text, 'Tốt'::text, 'Dễ'::text])),
  mastery_level smallint NOT NULL CHECK (mastery_level >= 0 AND mastery_level <= 5),
  review_count integer NOT NULL CHECK (review_count > 0),
  last_reviewed_at timestamp with time zone NOT NULL,
  next_review_at timestamp with time zone NOT NULL,
  CONSTRAINT user_word_review_events_pkey PRIMARY KEY (user_id, review_id),
  CONSTRAINT user_word_review_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id),
  CONSTRAINT user_word_review_events_word_id_fkey FOREIGN KEY (word_id) REFERENCES public.words(id)
);
CREATE TABLE public.learning_paths (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  language_code text NOT NULL,
  name text NOT NULL CHECK (char_length(btrim(name)) >= 1 AND char_length(btrim(name)) <= 150),
  description text,
  sort_order smallint NOT NULL DEFAULT 100,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT learning_paths_pkey PRIMARY KEY (id),
  CONSTRAINT learning_paths_language_code_fkey FOREIGN KEY (language_code) REFERENCES public.languages(code)
);
CREATE TABLE public.learning_path_topics (
  learning_path_id bigint NOT NULL,
  topic_id bigint NOT NULL,
  sort_order smallint NOT NULL,
  CONSTRAINT learning_path_topics_pkey PRIMARY KEY (learning_path_id, topic_id),
  CONSTRAINT learning_path_topics_learning_path_id_fkey FOREIGN KEY (learning_path_id) REFERENCES public.learning_paths(id),
  CONSTRAINT learning_path_topics_topic_id_fkey FOREIGN KEY (topic_id) REFERENCES public.topics(id)
);
CREATE TABLE public.rag_chunks (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  document_key text NOT NULL,
  chunk_index integer NOT NULL CHECK (chunk_index >= 0),
  title text NOT NULL,
  language_code text NOT NULL CHECK (language_code = ANY (ARRAY['English'::text, 'Japanese'::text, 'all'::text])),
  content text NOT NULL,
  embedding USER-DEFINED NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT rag_chunks_pkey PRIMARY KEY (id)
);
CREATE TABLE public.daily_ai_usage (
  user_id uuid NOT NULL,
  usage_date date NOT NULL,
  request_count integer NOT NULL DEFAULT 0 CHECK (request_count >= 0),
  CONSTRAINT daily_ai_usage_pkey PRIMARY KEY (user_id, usage_date),
  CONSTRAINT daily_ai_usage_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.reading_practice_turns (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL,
  question text NOT NULL,
  sample_answer text NOT NULL,
  transcript text,
  ai_feedback jsonb CHECK (ai_feedback IS NULL OR jsonb_typeof(ai_feedback) = 'object'::text),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT reading_practice_turns_pkey PRIMARY KEY (id),
  CONSTRAINT reading_practice_turns_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id)
);
CREATE TABLE public.shop_catalog (
  id text NOT NULL,
  title text NOT NULL,
  description text NOT NULL,
  cost_coins integer NOT NULL CHECK (cost_coins > 0),
  icon text NOT NULL,
  badge text NOT NULL,
  badge_class text NOT NULL,
  category text NOT NULL CHECK (category = ANY (ARRAY['boost'::text, 'heal'::text, 'shield'::text, 'premium'::text])),
  limit_period text NOT NULL CHECK (limit_period = ANY (ARRAY['daily'::text, 'monthly'::text])),
  limit_count integer NOT NULL CHECK (limit_count > 0),
  non_stacking boolean NOT NULL DEFAULT false,
  sort_order smallint NOT NULL DEFAULT 100,
  is_active boolean NOT NULL DEFAULT true,
  CONSTRAINT shop_catalog_pkey PRIMARY KEY (id)
);
CREATE TABLE public.shop_transactions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  request_id uuid NOT NULL,
  transaction_type text NOT NULL CHECK (transaction_type = ANY (ARRAY['exchange'::text, 'purchase'::text])),
  shop_item_id text,
  xp_delta bigint NOT NULL DEFAULT 0,
  coin_delta bigint NOT NULL,
  title text NOT NULL,
  details text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT shop_transactions_pkey PRIMARY KEY (id),
  CONSTRAINT shop_transactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id),
  CONSTRAINT shop_transactions_shop_item_id_fkey FOREIGN KEY (shop_item_id) REFERENCES public.shop_catalog(id)
);
CREATE TABLE public.shop_inventory (
  user_id uuid NOT NULL,
  shop_item_id text NOT NULL,
  quantity integer NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT shop_inventory_pkey PRIMARY KEY (user_id, shop_item_id),
  CONSTRAINT shop_inventory_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id),
  CONSTRAINT shop_inventory_shop_item_id_fkey FOREIGN KEY (shop_item_id) REFERENCES public.shop_catalog(id)
);
CREATE TABLE public.shop_item_usages (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  shop_item_id text NOT NULL,
  request_id uuid,
  context text NOT NULL DEFAULT ''::text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT shop_item_usages_pkey PRIMARY KEY (id),
  CONSTRAINT shop_item_usages_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id),
  CONSTRAINT shop_item_usages_shop_item_id_fkey FOREIGN KEY (shop_item_id) REFERENCES public.shop_catalog(id)
);
CREATE TABLE public.shop_active_boosts (
  user_id uuid NOT NULL,
  shop_item_id text NOT NULL,
  multiplier numeric NOT NULL CHECK (multiplier > 1::numeric),
  activated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT shop_active_boosts_pkey PRIMARY KEY (user_id),
  CONSTRAINT shop_active_boosts_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id),
  CONSTRAINT shop_active_boosts_shop_item_id_fkey FOREIGN KEY (shop_item_id) REFERENCES public.shop_catalog(id)
);
CREATE TABLE public.dungeon_progress (
  user_id uuid NOT NULL,
  topic_id integer NOT NULL CHECK (topic_id >= 1),
  completed_nodes jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(completed_nodes) = 'array'::text),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT dungeon_progress_pkey PRIMARY KEY (user_id, topic_id),
  CONSTRAINT dungeon_progress_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id)
);