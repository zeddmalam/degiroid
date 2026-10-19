import { loadRootEnv } from "@repo/env";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

loadRootEnv();

export const env = createEnv({
  server: {
    DEGIROID_MCP_HOST: z.string().min(1),
    DEGIROID_MCP_PORT: z.coerce.number().int().positive(),
    DEGIROID_MCP_PATH: z.string().regex(/^\//),

    DEGIROID_API_ORIGIN: z.string().url().optional(),
    DEGIROID_API_HOST: z.string().min(1),
    DEGIROID_API_PORT: z.coerce.number().int().positive(),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});

export const MCP_HOST = env.DEGIROID_MCP_HOST;
export const MCP_PORT = env.DEGIROID_MCP_PORT;
export const MCP_PATH = env.DEGIROID_MCP_PATH;

export const API_ORIGIN =
  env.DEGIROID_API_ORIGIN ??
  `http://${env.DEGIROID_API_HOST}:${env.DEGIROID_API_PORT}`;
