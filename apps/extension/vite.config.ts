import path from "node:path";
import { crx } from "@crxjs/vite-plugin";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

const repoRoot = path.resolve(__dirname, "../..");

export default defineConfig(async ({ mode, command }) => {
  // Vite runs this config under Node (not Bun), so do not import @repo/env's .ts.
  // loadEnv reads the single repo-root .env before createEnv in src/env.
  Object.assign(process.env, loadEnv(mode, repoRoot, ""));

  const { DEGIROID_API_ORIGIN } = await import("./src/env");
  const { default: manifest } = await import("./manifest.config");

  // Watch rebuilds must not wipe dist/ — Chrome keeps the unpacked extension
  // loaded from there, and emptyOutDir races leave only icons briefly.
  const watching = process.argv.includes("--watch");

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
      "process.env.PUBLIC_DEGIROID_API_ORIGIN":
        JSON.stringify(DEGIROID_API_ORIGIN),
    },
    build: {
      outDir: "dist",
      emptyOutDir: command === "build" && !watching,
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
