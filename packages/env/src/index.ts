import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";

/** Repo root (packages/env/src → ../../..). */
export const REPO_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

/**
 * Load the single monorepo `.env` / `.env.local` from the repo root into
 * `process.env`. Call before each app's local `createEnv(...)`.
 */
export function loadRootEnv(): void {
  for (const name of [".env", ".env.local"] as const) {
    const path = resolve(REPO_ROOT, name);
    if (existsSync(path)) {
      loadDotenv({ path, override: name === ".env.local" });
    }
  }
}
