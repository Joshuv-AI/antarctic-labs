import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

// Vite config — Antarctic Labs production build.
//
// Entries:
//   - index.html                       → main React SPA (routes only)
//                                       → dist/index.html + dist/assets/main-[hash].js
//
// The Aura Borealis background asset was removed in the 2026-09-21 cleanup.
// A new background asset will be wired in via this entry point once it's
// ready. See src/main.jsx for the homepage integration site.
export default defineConfig({
  resolve: {
    // The exact ThreeUI animated-top-dock source imports its glass particle
    // field from "three128" (its vendored three alias). Point it at the
    // project's three install so the module graph resolves at build time.
    // Only the modern variant is mounted, so that chunk never loads.
    alias: {
      three128: "three",
    },
  },
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
      },
      output: {
        entryFileNames: "assets/[name]-[hash].js",
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
      },
    },
  },
});
