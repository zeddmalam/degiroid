import { useState } from "react";
import type { DegiroSessionSnapshot } from "@/shared/degiro";
import { LosersTable } from "./LosersTable";
import { OrdersList } from "./OrdersList";
import type { UiVariant } from "./types";

type TabId = "losers" | "orders";

type ContentTabsProps = {
  snapshot: DegiroSessionSnapshot;
  variant: UiVariant;
};

const TABS: { id: TabId; label: string; caption: string }[] = [
  {
    id: "losers",
    label: "Losers",
    caption: "German index losers · top 10",
  },
  {
    id: "orders",
    label: "Orders",
    caption: "Outstanding orders · Δ market − order",
  },
];

export function ContentTabs({ snapshot, variant }: ContentTabsProps) {
  const [active, setActive] = useState<TabId>("losers");
  const prefix = variant === "panel" ? "degiroid-" : "";
  const tabListClass = `${prefix}tabs`;
  const tabClass = `${prefix}tab`;
  const panelClass = `${prefix}tab-panel`;
  const captionClass =
    variant === "panel" ? "degiroid-section-label" : "section-label";
  const activeTab = TABS.find((tab) => tab.id === active) ?? TABS[0];
  const ordersCount = snapshot.orders.length;

  return (
    <div className={`${prefix}content-tabs`}>
      <div className={tabListClass} role="tablist" aria-label="Degiroid views">
        {TABS.map((tab) => {
          const selected = tab.id === active;
          const label =
            tab.id === "orders" && ordersCount > 0
              ? `${tab.label} (${ordersCount})`
              : tab.label;

          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`${prefix}tab-${tab.id}`}
              className={tabClass}
              aria-selected={selected}
              aria-controls={`${prefix}tab-panel-${tab.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActive(tab.id)}
            >
              {label}
            </button>
          );
        })}
      </div>

      <p className={captionClass}>{activeTab.caption}</p>

      <div
        role="tabpanel"
        id={`${prefix}tab-panel-${active}`}
        className={panelClass}
        aria-labelledby={`${prefix}tab-${active}`}
      >
        {active === "losers" ? (
          <LosersTable snapshot={snapshot} variant={variant} />
        ) : (
          <OrdersList snapshot={snapshot} variant={variant} />
        )}
      </div>
    </div>
  );
}
