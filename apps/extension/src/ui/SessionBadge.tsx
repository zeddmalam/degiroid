import type { DegiroSessionSnapshot } from "@/shared/degiro";
import type { UiVariant } from "./types";

type SessionBadgeProps = {
  snapshot: DegiroSessionSnapshot;
  variant: UiVariant;
};

function popupBadgeState(
  snapshot: DegiroSessionSnapshot,
): "connected" | "pending" | "error" {
  if (snapshot.connected) return "connected";
  if (snapshot.pageKind === "trader") return "pending";
  return "error";
}

function panelBadgeState(
  snapshot: DegiroSessionSnapshot,
): "connected" | "pending" | "error" {
  if (snapshot.connected) return "connected";
  if (snapshot.pageKind === "login") return "error";
  return "pending";
}

function badgeLabel(snapshot: DegiroSessionSnapshot): string {
  if (snapshot.connected) return "Connected";
  if (snapshot.pageKind === "trader") return "Syncing";
  return "Offline";
}

export function SessionBadge({ snapshot, variant }: SessionBadgeProps) {
  if (variant === "panel") {
    return (
      <span id="degiroid-status-dot" data-state={panelBadgeState(snapshot)} />
    );
  }

  return (
    <span id="badge" data-state={popupBadgeState(snapshot)}>
      {badgeLabel(snapshot)}
    </span>
  );
}
