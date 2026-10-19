# Degiroid API

Local HTTP API that orchestrates DEGIRO market data through the browser extension job bridge, and runs Mastra agents for AI recommendations.

Config: single repo-root [`.env`](../../.env.example), validated in [`src/env.ts`](./src/env.ts) (`createEnv` + Zod; only vars this app uses).

## Start order

1. Copy `.env.example` → `.env` at the repo root (optional `OPENAI_API_KEY`)
2. `bun run dev --filter=api`
3. `bun run dev --filter=mcp`
4. Load the extension and open [trader.degiro.nl](https://trader.degiro.nl) (signed in)

## Endpoints

| Path | Role |
| --- | --- |
| `GET /health` | Liveness + job queue stats |
| `GET /jobs/next` | Extension long-poll |
| `POST /jobs/:id/result` | Extension job result |
| `GET /v1/stocks/lookup?q=` | Product lookup |
| `GET /v1/stocks/:id/quote` | Quote |
| `GET /v1/stocks/:id/history` | Intraday history (default P1D / PT1M) |
| `GET /v1/indexes/losers` | German index losers |
| `POST /v1/stocks/structured-analyze` | Deterministic technical analysis |
| `POST /v1/stocks/analyze` | Mastra (or heuristic) analyze — technical + fundamental |
| `POST /v1/stocks/research-fundamentals` | Wikipedia overview + Google News headlines |
| `GET/POST /v1/recommendations/losers` | Loser recommendations |

Recommendations are **not financial advice**.
