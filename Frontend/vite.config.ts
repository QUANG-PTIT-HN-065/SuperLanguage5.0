import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [tailwindcss()],
  base: "./",
  build: {
    rollupOptions: {
      input: [
        "index.html",
        "src/pages/login/index.html",
        "src/pages/register/index.html",
        "src/pages/forgot-password/index.html",
        "src/pages/LoginAdmin/code.html",
        "src/pages/LoginAdmin/index.html",
        "src/pages/dasboardAdmin/code.html",
        "src/pages/dasboardAdmin/index.html",
        "src/pages/chat/index.html",
        "src/pages/vocabularyAdmin/code.html",
        "src/pages/vocabularyAdmin/index.html",
        // Learner pages (UI tasks từ workbook)
        "src/pages/learner/dashboard/index.html",
        "src/pages/learner/topics/index.html",
        "src/pages/learner/quiz/index.html",
        "src/pages/learner/quiz-result/index.html",
        "src/pages/learner/progress/index.html",
        "src/pages/learner/stats/index.html",
        "src/pages/learner/speech/index.html",
        "src/pages/learner/sentence/index.html",
        "src/pages/learner/flashcard/index.html",
      ],
    },
  },
});
