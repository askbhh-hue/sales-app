# Supabase — Phase 0

> Phase 0 does not run migrations. Phase 1 will add numbered SQL files.

## Project
- Plan: Free.
- Region: Middle East (Dubai) if available; otherwise EU Central (Frankfurt).
- Database password: stored in the client's password manager.

## Secrets to set later (Dashboard → Edge Functions → Secrets)
- `GEMINI_API_KEY`
- `OPENROUTER_API_KEY`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`
- `APP_ORIGIN` (GitHub Pages origin, for CORS)

`SUPABASE_SERVICE_ROLE_KEY` is available automatically inside Edge Functions. Never expose it to the browser.

## Free limits (verify current docs before relying)
- 500 MB database
- 1 GB file storage
- 5 GB egress / month
- 50,000 monthly active users
- 500,000 Edge Function invocations / month
- 2 active projects
- Projects pause after 7 days of inactivity

## Keepalive plan
- Phase 1 adds `public.health()` RPC.
- A scheduled ping (GitHub Actions or pg_cron) will call it.
- Until then, set a weekly reminder to open the project dashboard.
