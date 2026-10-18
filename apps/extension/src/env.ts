import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

/**
 * Extension-only env. Root `.env` is loaded by Vite (`envDir`); PUBLIC_ values
 * are inlined via `define` for content/background bundles.
 */
export const env = createEnv({
  clientPrefix: "PUBLIC_",
  client: {
    PUBLIC_DEGIROID_API_ORIGIN: z.url(),
  },
  runtimeEnv: {
    PUBLIC_DEGIROID_API_ORIGIN: process.env.PUBLIC_DEGIROID_API_ORIGIN,
  },
  emptyStringAsUndefined: true,
});

export const DEGIROID_API_ORIGIN = env.PUBLIC_DEGIROID_API_ORIGIN;

export function getApiHostPermission(): string {
  return `${DEGIROID_API_ORIGIN.replace(/\/$/, "")}/*`;
}
