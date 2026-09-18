import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

// Vite config — Antarctic Labs production build.
//
// Entries:
//   - index.html                       → main React SPA (PolarScene + routes)
//                                       → dist/index.html + dist/assets/main-[hash].js
//   - src/aura-renderer.entry.js       → the Aura Borealis GLB renderer.
//                                       Bundled as a SEPARATE entry (with three.js
//                                       + GLTFLoader inlined) and emitted as
//                                       dist/assets/aura-renderer.js (STABLE name,
//                                       no content hash). This stable name is
//                                       required because public/assets/aura-renderer.html
//                                       (a static file, not a Vite input) loads
//                                       /assets/aura-renderer.js via a fixed <script>
//                                       tag and cannot reference a hashed bundle path.
//
// Three.js is the same renderer the constellation uses (via
// NeuformBatchEffects.tsx); the only thing that changed is the GLB asset
// (single-mountain-snow.glb vs. the constellation's procedural particle rain).
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        "aura-renderer": resolve(__dirname, "src/aura-renderer.entry.js"),
      },
      output: {
        // Force the renderer bundle into dist/assets/aura-renderer.js with
        // NO content hash (so the static HTML can reference it by name).
        // The main bundle keeps its default hashed name (dist/assets/main-[hash].js).
        entryFileNames: (chunkInfo) => {
          if (chunkInfo.name === "aura-renderer") {
            return "assets/aura-renderer.js";
          }
          return "assets/[name]-[hash].js";
        },
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
      },
    },
  },
});
