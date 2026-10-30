export function asNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

/**
 * DEGIRO `plBase` / `todayPlBase` amounts.
 * Seen shapes: `{ EUR: -475.12 }`, bare number, or
 * `[{ name: "EUR", value: -475.12 }]`.
 */
export function asCurrencyAmount(
  value: unknown,
  preferredCurrency?: string,
): number | undefined {
  const direct = asNumber(value);
  if (direct != null) return direct;
  if (!value || typeof value !== "object") return undefined;

  if (Array.isArray(value)) {
    const byName = new Map<string, number>();
    for (const entry of value) {
      if (!entry || typeof entry !== "object") continue;
      const row = entry as { name?: unknown; value?: unknown };
      const name = asString(row.name);
      const amount = asNumber(row.value);
      if (name && amount != null) byName.set(name.toUpperCase(), amount);
    }
    if (preferredCurrency) {
      const preferred = byName.get(preferredCurrency.toUpperCase());
      if (preferred != null) return preferred;
    }
    const first = byName.values().next();
    return first.done ? undefined : first.value;
  }

  const record = value as Record<string, unknown>;
  if (preferredCurrency) {
    const preferred = asNumber(record[preferredCurrency]);
    if (preferred != null) return preferred;
  }
  for (const entry of Object.values(record)) {
    const amount = asNumber(entry);
    if (amount != null) return amount;
  }
  return undefined;
}

export function asString(value: unknown): string | undefined {
  if (typeof value === "string" && value.length > 0) return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return undefined;
}
