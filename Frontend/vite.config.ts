import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [tailwindcss()],
  base: "./",
  build: {
    rollupOptions: {
      input: ["index.html", "src/pages/LoginAdmin/index.html", "src/pages/dasboardAdmin/index.html"],
    },
  },
});
