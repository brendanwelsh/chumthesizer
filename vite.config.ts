import { defineConfig } from "vite";

// Electron loads the built files from disk, so use relative asset paths.
export default defineConfig({
  base: "./",
  server: { port: 5173, host: "127.0.0.1" },
  build: { outDir: "dist", target: "es2022", sourcemap: true },
});
