import path from "node:path";
import { crx } from "@crxjs/vite-plugin";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

const repoRoot = path.resolve(__dirname, "../..");

export default defineConfig(async ({ mode }) => {
  // Vite runs this config under Node (not Bun), so do not import @repo/env's .ts.
  // loadEnv reads the single repo-root .env before createEnv in manifest/src/env.
  Object.assign(process.env, loadEnv(mode, repoRoot, ""));

  const { default: manifest } = await import("./manifest.config");

  return {
    plugins: [react(), crx({ manifest })],
    envDir: repoRoot,
    envPrefix: ["PUBLIC_"],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "src"),
        "@repo/degiro": path.resolve(
          __dirname,
          "../../packages/degiro/src/index.ts",
        ),
      },
    },
    define: {
      "process.env.PUBLIC_DEGIROID_API_ORIGIN": JSON.stringify(
        process.env.PUBLIC_DEGIROID_API_ORIGIN ?? "http://127.0.0.1:3921",
      ),
    },
    build: {
      outDir: "dist",
      emptyOutDir: true,
      sourcemap: true,
    },
    server: {
      port: 5173,
      strictPort: true,
      hmr: {
        port: 5173,
      },
    },
  };
});
