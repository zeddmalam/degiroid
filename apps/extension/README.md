# Degiroid browser extension

Chrome/Edge MV3 extension tightly bound to the DEGIRO web trader at
[https://trader.degiro.nl](https://trader.degiro.nl).

## What it does

- Injects only on `https://trader.degiro.nl/*`
- Reuses your logged-in trader session (cookies) to read client + portfolio data
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
| `https://trader.degiro.nl/*` | Only host: inject UI + call trader APIs with your session |
| `storage` | Cache the latest portfolio snapshot |
| `tabs` | Find/refresh the active DEGIRO tab |
| `alarms` | Periodic light sync while the browser is open |
