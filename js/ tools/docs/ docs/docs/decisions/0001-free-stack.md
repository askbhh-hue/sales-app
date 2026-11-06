# ADR 0001 — Free-only stack

## Status
Accepted (Phase 0).

## Context
- Production PWA for a single sales rep in Beni Suef, Egypt.
- Target monthly cost: 0 EGP.
- Non-developer client.
- Real customer data (PII) must stay private.
- No offline requirement.

## Decision
- Database/Auth/Storage/Functions/Cron: Supabase Free (Postgres + PostGIS + RLS + Edge Functions + pg_cron).
- LLM primary: Google Gemini API Free Tier.
- LLM fallback: OpenRouter free models.
- STT: browser Web Speech API (ar-EG).
- Maps: OpenStreetMap (Leaflet) + Nominatim with caching + OSRM or haversine fallback.
- Notifications: Telegram Bot.
- Frontend hosting: GitHub Pages.
- No build step.

## Consequences
- Supabase Free limits: 500 MB DB, 1 GB storage, 5 GB egress/month, 50K MAU, 500K Edge Function invocations/month, 2 active projects. Projects pause after 7 days of inactivity.
- Gemini Free Tier: rate limits vary by model and project; free-tier prompts/outputs may be used by Google to improve products outside some regions. PII redaction is mandatory.
- GitHub Pages: 1 GB site, 100 GB/month soft bandwidth, public repo on free plan.
- Telegram Bot API: free.
- OpenRouter free: limits and data policies vary by model; verify per model.

## Alternatives considered
- Firebase: good free tier, but no Postgres/PostGIS/RLS.
- Neon: Postgres free, but no Auth/Storage/Edge Functions.
- Cloudflare D1: no PostGIS.
- Local-only: no multi-device, no server-side AI, no audit.

## Risks
- Free tiers can change. Mitigation: quotas, graceful degradation, monitoring, documented limits.
- Supabase pause. Mitigation: health RPC + keepalive in Phase 1.
- Free-tier data usage. Mitigation: redaction, provider fallback, local parser.
