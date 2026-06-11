# Execution Tracker — DCX Predictor

Single source of truth for progress. Every session reads this first.
Status: `[ ]` pending · `[~]` in progress · `[x]` done · `[!]` blocked

## Phase 1 — Foundations
- [x] **T-01** — SPEC.md (source of truth, domain model, stakeholders, invariants, journeys, contract matrix)
- [x] **T-02** — SECURITY.md baseline with debt register
- [x] **T-03** — Execution tracker (this file)
- [x] **T-04** — Verify football-data.org token + fixture data shape (104 matches confirmed)

## Phase 2 — Database (Supabase)
- [ ] **T-05** — `supabase/schema.sql`: tables (players, matches, predictions, bonus_picks, bonus_results)
- [ ] **T-06** — Scoring views (`match_points`, `leaderboard`) implementing I4
- [ ] **T-07** — RLS policies implementing I2/I3 + RPCs (`save_pick`, `my_picks`, `save_bonus`, `my_bonus`)
- [ ] **T-08** — Seed 9 players
- [ ] **T-09** — Apply schema in Supabase SQL editor `depends on: T-05..T-08, USER ACTION`

## Phase 3 — Sync (GitHub Actions)
- [ ] **T-10** — `sync/sync.mjs`: fetch WC matches → 90-min scores → upsert to Supabase (I5, C7)
- [ ] **T-11** — `.github/workflows/sync.yml`: cron */30 with tournament-window guard
- [ ] **T-12** — Initial sync run to populate all 104 matches `depends on: T-09`

## Phase 4 — Frontend (Vite + TS, GitHub Pages)
- [ ] **T-13** — Scaffold (package.json, tsconfig, vite config, zero runtime deps)
- [ ] **T-14** — Name picker (localStorage) + tab shell (Leaderboard / Fixtures / Bonus / Rules)
- [ ] **T-15** — Fixtures & picks UI: grouped by day, score inputs, save via RPC, lock at kickoff, reveal all picks + points after kickoff (C1–C4)
- [ ] **T-16** — Leaderboard: points, exacts, localStorage movement arrows, wooden spoon
- [ ] **T-17** — Bonus picks UI (champion, golden boot, Bafana stage) with 28/06 lock
- [ ] **T-18** — Rules tab rendering SPEC §8
- [ ] **T-19** — WC26 styling: tri-host gradient, flags/crests, mobile-first cards; note SD-01 honesty line in Rules
- [ ] **T-20** — `.github/workflows/deploy.yml`: build → GitHub Pages

## Phase 5 — Launch
- [ ] **T-21** — Create GitHub repo (konfytbekkie), push, set Actions secrets, enable Pages
- [ ] **T-22** — End-to-end verify: save pick via UI, confirm RLS lock behaviour, leaderboard renders
- [ ] **T-23** — WhatsApp launch message drafted (`launch-message.md`) — includes backfill plan for matchday-1 picks
- [ ] **T-24** — Backfill matchday-1 picks collected on WhatsApp `depends on: USER input`

## Post-tournament
- [ ] **T-25** — Fill `bonus_results` after the final (19/07/2026)
- [ ] **T-26** — Rotate keys, pause Supabase project, archive repo (SD-02)

## Cross-findings log

| Date | Finding | Affects |
|---|---|---|
| 11/06/2026 | football-data v4: knockout teams are `null` until decided; statuses TIMED/IN_PLAY/PAUSED/FINISHED; `regularTime` only present when ET occurred | T-10, T-15 |
| 11/06/2026 | Only 1 fixture on 11/06 UTC (MEX–RSA 19:00Z); KOR–CZE is 04:00Z on 12/06 | T-23 |
