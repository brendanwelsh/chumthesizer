import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

// Electron loads the built files from disk, so use relative asset paths.
export default defineConfig({
  base: "./",
  server: { port: 5173, host: "127.0.0.1" },
  build: {
    outDir: "dist",
    target: "es2022",
    sourcemap: true,
    rollupOptions: {
      // Two pages ship together: index.html = the playable app (also what Electron loads);
      // about.html = the showcase/landing page served at /about.html on GitHub Pages.
      input: { main: r("./index.html"), about: r("./about.html") },
    },
  },
});
