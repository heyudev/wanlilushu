import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// base "./" keeps the build portable: GitHub Pages sub-path, any static host, or opening dist/ directly.
export default defineConfig({
  base: "./",
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        // data and libraries change less often than the app code: separate files stay cached across releases
        manualChunks(id) {
          if (id.includes("/src/data/")) return "data";
          if (id.includes("node_modules")) return "vendor";
        },
      },
    },
  },
  test: { environment: "node", include: ["src/**/*.test.ts"] },
});
