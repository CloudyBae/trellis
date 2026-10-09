import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const backendUrl = process.env.TRELLIS_BACKEND_URL;

export default defineConfig({
  plugins: [tailwindcss(), react()],
  base: "./",
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  build: {
    sourcemap: false,
    rolldownOptions: {
      output: { comments: false },
    },
  },
  server: {
    proxy: backendUrl ? { "/api": backendUrl } : undefined,
  },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
