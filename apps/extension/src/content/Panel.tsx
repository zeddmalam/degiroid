import { useState } from "react";
import { sessionStatusLabel } from "@/shared/degiro";
import type { DegiroSessionSnapshot } from "@/shared/degiro";
import { ContentTabs } from "@/ui/ContentTabs";
import { Metrics } from "@/ui/Metrics";
import { SessionBadge } from "@/ui/SessionBadge";

type PanelProps = {
  snapshot: DegiroSessionSnapshot;
};

export function Panel({ snapshot }: PanelProps) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      id="degiroid-panel"
      data-collapsed={collapsed ? "true" : "false"}
      aria-label="Degiroid DEGIRO companion"
    >
      <header>
        <h1>Degiroid</h1>
        <button
          type="button"
          id="degiroid-toggle"
          aria-label="Collapse Degiroid panel"
          onClick={() => setCollapsed((value) => !value)}
        >
          {collapsed ? "Show" : "Hide"}
        </button>
      </header>

      {!collapsed ? (
        <>
          <div id="degiroid-status">
            <SessionBadge snapshot={snapshot} variant="panel" />
            <span id="degiroid-status-text">
              {sessionStatusLabel(snapshot)}
            </span>
          </div>

          <div id="degiroid-body">
            {!snapshot.connected ? (
              <p id="degiroid-error">
                {snapshot.error ?? "Syncing with the DEGIRO trader page…"}
              </p>
            ) : (
              <>
                <Metrics snapshot={snapshot} variant="panel" />
                {snapshot.error ? (
                  <p id="degiroid-error">{snapshot.error}</p>
                ) : null}
                <ContentTabs snapshot={snapshot} variant="panel" />
              </>
            )}
          </div>

          <footer>Bound to https://trader.degiro.nl</footer>
        </>
      ) : null}
    </aside>
  );
}
