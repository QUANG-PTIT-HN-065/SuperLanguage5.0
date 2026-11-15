import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import { globSync } from "glob";
import { fileURLToPath } from "url";
import path from "path";

// Tự động tìm tất cả file .html trong dự án (trừ node_modules và dist)
const htmlFiles = globSync("**/*.html", {
  ignore: ["node_modules/**", "dist/**"],
}).map((file) => fileURLToPath(new URL(file, import.meta.url)));

export default defineConfig({
  plugins: [tailwindcss()],
  base: "./",
  server: {
    host: "0.0.0.0",
    port: 5173,
    strictPort: true,
  },
  preview: {
    host: "0.0.0.0",
    port: 4173,
    strictPort: true,
  },
  build: {
    rollupOptions: {
      input: htmlFiles,
    },
  },
});