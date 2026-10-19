import { loadRootEnv } from "@repo/env";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

loadRootEnv();

export const env = createEnv({
  server: {
    DEGIROID_API_HOST: z.string().min(1),
    DEGIROID_API_PORT: z.coerce.number().int().positive(),
    DEGIROID_API_ORIGIN: z.string().url().optional(),

    DEGIROID_MCP_URL: z.string().url().optional(),
    DEGIROID_MCP_HOST: z.string().min(1),
    DEGIROID_MCP_PORT: z.coerce.number().int().positive(),
    DEGIROID_MCP_PATH: z.string().regex(/^\//),

    DEGIROID_JOB_TIMEOUT_MS: z.coerce.number().int().positive(),
    DEGIROID_JOB_POLL_WAIT_MS: z.coerce.number().int().positive(),
    DEGIROID_RECS_CACHE_TTL_MS: z.coerce.number().int().positive(),
    DEGIROID_MAX_BUY_ORDER_AMOUNT: z.coerce.number().positive(),

    MASTRA_MODEL: z.string().min(1),
    OPENAI_API_KEY: z.string().optional(),
    ANTHROPIC_API_KEY: z.string().optional(),
    GOOGLE_GENERATIVE_AI_API_KEY: z.string().optional(),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});

export const API_HOST = env.DEGIROID_API_HOST;
export const API_PORT = env.DEGIROID_API_PORT;
export const API_ORIGIN =
  env.DEGIROID_API_ORIGIN ??
  `http://${env.DEGIROID_API_HOST}:${env.DEGIROID_API_PORT}`;

export const MCP_URL =
  env.DEGIROID_MCP_URL ??
  `http://${env.DEGIROID_MCP_HOST}:${env.DEGIROID_MCP_PORT}${env.DEGIROID_MCP_PATH}`;

export const JOB_TIMEOUT_MS = env.DEGIROID_JOB_TIMEOUT_MS;
export const JOB_POLL_WAIT_MS = env.DEGIROID_JOB_POLL_WAIT_MS;
export const RECS_CACHE_TTL_MS = env.DEGIROID_RECS_CACHE_TTL_MS;
export const MAX_BUY_ORDER_AMOUNT = env.DEGIROID_MAX_BUY_ORDER_AMOUNT;
export const MASTRA_MODEL = env.MASTRA_MODEL;

export function hasModelKey(): boolean {
  return Boolean(
    env.OPENAI_API_KEY ||
    env.ANTHROPIC_API_KEY ||
    env.GOOGLE_GENERATIVE_AI_API_KEY,
  );
}
