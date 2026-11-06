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
        "src/pages/LoginAdmin/index.html",
        "src/pages/dasboardAdmin/index.html",
        "src/pages/chat/index.html",
      ],
    },
  },
});
