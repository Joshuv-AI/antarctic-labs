import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

// Vite config — Antarctic Labs production build.
//
// Entries:
//   - index.html                       → main React SPA (routes only)
//                                       → dist/index.html + dist/assets/main-[hash].js
export default defineConfig({
  resolve: {
    // The orbital-sphere background imports its three.js scene from
    // "three128" (its vendored three alias). Point it at the
    // project's three install so the module graph resolves at build time.
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
        // Long-lived vendor chunks: react and gsap change far less often
        // than app code, so isolating them keeps the CDN-cached vendor
        // bytes reusable across deploys. Matched on node_modules paths
        // (not bare substrings) so app files like gsap-iframe-injector.js
        // stay with their importing chunk.
        manualChunks(id) {
          if (
            id.includes("node_modules/react/") ||
            id.includes("node_modules/react-dom/") ||
            id.includes("node_modules/scheduler/")
          ) {
            return "vendor";
          }
          if (id.includes("node_modules/gsap/")) {
            return "gsap";
          }
        },
      },
    },
  },
});
