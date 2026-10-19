# Degiroid MCP

Market-data MCP tools shared by Cursor and Mastra. Proxies to the local Degiroid API only (never calls AI routes).

Config: single repo-root [`.env`](../../.env.example), validated in [`src/env.ts`](./src/env.ts) (`createEnv` + Zod; only vars this app uses).

## Tools

- `lookup_stock` — `name` and/or `ticker` (or free-text `query`)
- `get_quote` — `productId`, or `name` / `ticker`
- `get_price_history` — `productId`, or `name` / `ticker`
- `get_index_losers`
- `structured_analyze` — `productId`, or `name` / `ticker`
- `research_fundamentals` — company overview + recent headlines (`name` / `ticker` / `query`)

## Run

Requires the API (see `DEGIROID_API_*` in root `.env`).

```bash
bun run dev --filter=mcp
```

HTTP MCP URL is derived from `DEGIROID_MCP_HOST` / `PORT` / `PATH` (must be set in root `.env`). Keep [`.cursor/mcp.json`](../../.cursor/mcp.json) in sync with that URL.

Stdio (optional):

```bash
bun run start:stdio --filter=mcp
```

## Cursor

Enable the `degiroid` server in Cursor after API + MCP are running and the extension is connected to the trader tab.
