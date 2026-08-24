import { fileURLToPath, URL } from "node:url";
import { resolve } from "node:path";
import { defineConfig } from "vite";

const webRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root: webRoot,
  publicDir: resolve(webRoot, "public"),
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("../../src", import.meta.url)),
    },
  },
  build: {
    outDir: resolve(webRoot, "dist"),
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      input: {
        landing: resolve(webRoot, "index.html"),
        app: resolve(webRoot, "app/index.html"),
        privacy: resolve(webRoot, "privacy/index.html"),
      },
    },
  },
});
