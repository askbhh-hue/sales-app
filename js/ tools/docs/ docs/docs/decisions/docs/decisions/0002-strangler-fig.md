# ADR 0002 — Strangler-fig migration

## Status
Accepted (Phase 0).

## Context
- Live app with real data.
- Zero downtime required.
- Rollback must be instant.

## Decision
- Introduce a `repo` data-access layer.
- Keep localStorage as the default backend.
- Add Supabase behind feature flags (`useCloud`, `dualWrite`).
- Default all flags to `false`.
- Write to both backends during dual-write; verify counts and balances.
- Switch reads to cloud only after reconciliation passes.
- Rollback = flag off. No code revert required.

## Consequences
- Temporary double writes and extra code.
- Need reconciliation reports and idempotent importer.
- UI remains unchanged during migration.
