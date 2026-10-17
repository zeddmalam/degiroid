import type { DegiroSessionSnapshot } from "./degiro";

export const STORAGE_KEY = "degiroid.session" as const;

export type ExtensionMessage =
  | { type: "DEGIROID_GET_SNAPSHOT" }
  | { type: "DEGIROID_SYNC_NOW" }
  | { type: "DEGIROID_SNAPSHOT_UPDATED"; snapshot: DegiroSessionSnapshot }
  | { type: "DEGIROID_CONTENT_READY"; url: string }
  | { type: "DEGIROID_OPEN_TRADER" };

export type ExtensionResponse =
  | { ok: true; snapshot: DegiroSessionSnapshot }
  | { ok: false; error: string };

export function isExtensionMessage(value: unknown): value is ExtensionMessage {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    typeof (value as { type: unknown }).type === "string"
  );
}
