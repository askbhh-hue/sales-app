# Sales Rep PWA — Beni Suef

Arabic RTL PWA for an agricultural inputs sales rep. Vanilla JS, single-file app, GitHub Pages hosting.

## Status
Phase 0 — preparation only. No Supabase migrations have been applied.

## Architecture (target)
```mermaid
flowchart LR
  A[PWA on GitHub Pages] -->|anon key + JWT| B[Supabase Auth]
  A -->|text / voice / image| C[Edge Function ai-gateway]
  C --> D[Gemini / OpenRouter]
  C -->|whitelisted RPC| E[(Postgres + PostGIS)]
  F[pg_cron] --> G[daily-briefing]
  G --> H[Telegram Bot]
  C --> I[ai_runs / audit]
