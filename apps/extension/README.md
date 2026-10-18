# Degiroid browser extension

Chrome/Edge MV3 extension tightly bound to the DEGIRO web trader at
[https://trader.degiro.nl](https://trader.degiro.nl).

## What it does

- Injects only on `https://trader.degiro.nl/*`
- Waits for the trader page session (fetching via a page-world bridge so cookies apply), then reads client, portfolio, and outstanding orders
- Shows each outstanding order with the delta between market price and order price
- Shows the top 10 day-losers across German indexes (DAX, MDAX, SDAX, TecDAX), deduped and sorted worst-first
- Shows a floating panel on the trader SPA
- Exposes the same snapshot in the toolbar popup

It does **not** automate trades or capture credentials.

## Develop

```bash
bun install
bun run dev --filter=extension
```

Load `apps/extension/dist` via **chrome://extensions** → Developer mode → Load unpacked.

## Build

```bash
bun run build --filter=extension
```

## Permissions

| Permission / host | Why |
| --- | --- |
| `https://trader.degiro.nl/*` | Inject UI + call trader APIs with your session |
| `https://charting.vwdservices.com/*` | Live last prices used for order market deltas |
| `cookies` | Read `JSESSIONID` as the `sessionId` query param DEGIRO APIs require |
| `storage` | Cache the latest session snapshot |
| `tabs` | Find/refresh the active DEGIRO tab |
| `alarms` | Periodic light sync while the browser is open |
