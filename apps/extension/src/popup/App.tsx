import { sessionStatusLabel } from "@/shared/degiro";
import { ContentTabs } from "@/ui/ContentTabs";
import { Metrics } from "@/ui/Metrics";
import { SessionBadge } from "@/ui/SessionBadge";
import { useExtensionSnapshot } from "./useExtensionSnapshot";

export function App() {
  const { snapshot, syncNow, openTrader } = useExtensionSnapshot();

  return (
    <main>
      <header>
        <div>
          <p className="eyebrow">Degiroid</p>
          <h1>DEGIRO companion</h1>
        </div>
        <SessionBadge snapshot={snapshot} variant="popup" />
      </header>

      <section id="summary">
        <p id="status">{sessionStatusLabel(snapshot)}</p>
      </section>

      {snapshot.connected ? (
        <section id="metrics-wrap">
          <Metrics snapshot={snapshot} variant="popup" />
        </section>
      ) : null}

      <ContentTabs snapshot={snapshot} variant="popup" />

      <footer>
        <button type="button" onClick={syncNow}>
          Sync now
        </button>
        <button type="button" className="secondary" onClick={openTrader}>
          Open trader
        </button>
      </footer>
    </main>
  );
}
