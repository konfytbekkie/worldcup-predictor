# Security Posture — Squad Goals FC

**Standard level:** Low (internal fun project, kudos stakes, minimal PII: first names only)
**Current phase:** Production (static site + managed Supabase), day-one ship
**Last reviewed:** 11/06/2026

## Active controls

| Control | Implementation |
|---|---|
| Row Level Security | Enabled on all tables. Anon role: read-only on `players`/`matches`; `predictions` readable only after kickoff; all writes via validated `SECURITY DEFINER` RPCs. |
| Pick-lock enforcement | Server-side in `save_pick()`/`save_bonus()` (kickoff / Round-of-32 checks), not client-side only. |
| Input validation | RPC-side: integer scores 0–20, known player ids (FK), known match ids (FK). |
| Secret management | Service-role key + football-data token only in GitHub Actions secrets and local `.env` (gitignored). Anon key is public by design and RLS-gated. Fail-fast when env vars missing. |
| Dependency surface | Zero runtime dependencies in the frontend; dev deps: vite, typescript. Sync script uses Node stdlib fetch only. |
| Error handling | RPC errors mapped to friendly messages client-side; no stack traces or internals surfaced. |

## Accepted risks / debt register

| ID | Description | Severity | Deferred from phase | Tracker reference |
|---|---|---|---|---|
| SD-01 | Identity is name-selection only — a player can view/submit as another player. Accepted: 9 trusted colleagues, kudos stakes. Known to the group. | Low | v1 design | T-19 (document in Rules) |
| SD-02 | Supabase service-role key, anon key and football-data token were shared via chat during setup. Rotate all three after the tournament (or sooner if abused). | Medium | Setup | T-23 |
| SD-03 | Public site URL + anon key allow an outsider who finds the URL to submit picks under a seeded name. Mitigations: obscure URL, FK-limited to 9 names, RLS caps blast radius, picks are overwrite-able by the real player pre-kickoff. | Low | v1 design | accepted, revisit only on abuse |
| SD-04 | No rate limiting on RPCs beyond Supabase platform defaults. | Low | v1 design | accepted for 9-user scale |

## Phase transition criteria

Not applicable — the project sunsets after 19/07/2026 (final). End-of-life action:
rotate/revoke keys (SD-02), set the Supabase project to paused, archive the repo.
