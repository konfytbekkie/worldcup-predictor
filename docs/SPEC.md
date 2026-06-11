# DCX Predictor — Specification (Source of Truth)

**Owner:** Marthelize Tredoux · **Created:** 11/06/2026 · **Status:** v1, shipping day one of WC2026

This document is the canonical reference for the project. Sessions and agents defer to it
for ambiguity resolution. The conversation that produced it is summarised here in full;
nothing outside this repo is required to understand the system.

## 1. What this is

A self-running World Cup 2026 prediction pool for the Datacentrix core team
(~9 players, kudos only, no money). Players predict exact scores for all 104 matches plus
three pre-knockout bonus picks. Results sync automatically from football-data.org;
scoring is computed in the database; the leaderboard is a static web page shared via one
WhatsApp link. No sign-ups, no logins.

## 2. Domain model

| Entity | Key fields | States / lifecycle |
|---|---|---|
| **Player** | id, name | Seeded once (9 names). No self-registration. |
| **Match** | id (football-data id), stage, group, kickoff_utc, status, home/away team, 90-min score | `TIMED` → `IN_PLAY` → `PAUSED` → `FINISHED` (statuses mirrored from football-data). Knockout matches start with TBD (null) teams that fill in via sync. |
| **Prediction** | player_id + match_id (unique), home_pred, away_pred | *Open* before kickoff (create/update allowed) → *Locked* at kickoff (immutable, visible to all). |
| **BonusPick** | player_id (one row each), champion, golden_boot, bafana_stage | Open until first LAST_32 kickoff, then locked. |
| **BonusResult** | single row, filled by admin after the final | Empty → filled. Drives bonus scoring. |

Vocabulary: "knockout" = any stage other than `GROUP_STAGE` (LAST_32, LAST_16,
QUARTER_FINALS, SEMI_FINALS, THIRD_PLACE, FINAL). "90-minute score" = regulation-time
result (football-data `regularTime` when extra time occurred, else `fullTime`).

## 3. Stakeholder map

| Actor | Role | Relationship |
|---|---|---|
| Players (9) | Direct users | Submit picks on their phones, view leaderboard. Marthelize, Garsen, Lewella, Keiketlile, Vuyo, Magonna, Thulani, Ramalau, Zayaan. |
| Admin (Marthelize) | Operator | Backfills late round-1 picks, fills bonus results after the final, owns all accounts/keys. |
| football-data.org | System integration | Read-only source of fixtures, kickoff times, statuses, scores. Free tier, 10 req/min. |
| GitHub Actions sync | The system itself | Cron every 30 min; upserts matches from the API into Supabase using the service-role key. |
| Supabase (Postgres + PostgREST) | Platform | Stores all data; RLS enforces pick locking and visibility; views compute scoring. |
| GitHub Pages | Platform | Hosts the static frontend at a public URL. |

## 4. System invariants (falsifiable)

| # | Invariant | Enforced by | Test |
|---|---|---|---|
| I1 | A player has at most one prediction per match. | `UNIQUE (player_id, match_id)` | DB constraint (self-testing). |
| I2 | No prediction can be created or changed at/after kickoff. | `save_pick()` RPC raises `PICKS_LOCKED`; no direct anon write path exists. | Manual: attempt save on a started match → error. |
| I3 | Anonymous reads cannot see another player's pick before that match kicks off. | RLS SELECT policy on `predictions` (`kickoff_utc <= now()`). | Manual: query pre-kickoff match via anon key → 0 rows. |
| I4 | Scoring: exact 90-min score = 3 pts, correct outcome = 1 pt, knockout stages ×2; only `FINISHED` matches score. | `match_points` view | SQL spot-checks after first finished match. |
| I5 | Sync never deletes or modifies predictions; it only upserts matches. | Sync script touches `matches` (and bonus lock metadata) only. | Code review of `sync/sync.mjs`. |
| I6 | The service-role key and API token never appear in the repo, the frontend bundle, or the browser. | Keys live only in GitHub Actions secrets and local `.env` (gitignored). | `git grep` for key fragments before each push. |
| I7 | Bonus picks lock at the first LAST_32 kickoff. | `save_bonus()` RPC checks `min(kickoff_utc)` of LAST_32. | Manual after 28/06. |

## 5. Stakeholder journeys

**Player — make picks (happy path):** open link → (first visit) tap own name, stored in
localStorage → Fixtures tab → enter scores for upcoming matches → tap save → confirmation
tick. Latency: page interactive < 2s on mobile data; save < 1s.

**Player — alternative paths:**
- *Pick after kickoff:* inputs disabled client-side; server raises `PICKS_LOCKED` if forced → friendly "match has started" message.
- *Change a pick:* re-save any time before kickoff (upsert).
- *Concurrent double-save:* last write wins on the unique row; harmless.
- *API/sync down:* page still loads; leaderboard shows "last updated" stamp from match data; no data loss.
- *TBD knockout match:* visible but shows placeholders; pickable once teams are named (any time before kickoff).

**Player — view standings:** open link → leaderboard with points, exact-score counts,
movement vs their last visit (localStorage), wooden spoon on last place. After kickoff,
match cards show everyone's picks and points earned.

**Admin — backfill round-1 picks:** collect picks via WhatsApp → insert via service-role
key (bypasses RLS lock) in a Claude session or `sync/backfill` helper. Allowed only for
matchday-1 catch-up, by agreement with the team.

**Admin — close the tournament:** after the final, fill the single `bonus_results` row →
bonus points appear in the leaderboard automatically.

**Sync — every 30 min:** fetch all WC matches (1 API call) → compute 90-min scores →
upsert into `matches`. On API failure: exit non-zero, GH Actions shows red run, no
partial writes. Outside 10/06–21/07 the job exits immediately.

## 6. Actor contract matrix

| # | Actor → expectation | Verifiable assertion |
|---|---|---|
| C1 | Player → System: saving a valid pick before kickoff succeeds and is acknowledged | `save_pick` returns 200; re-fetch via `my_picks` shows the value |
| C2 | Player → System: saving after kickoff fails clearly | `PICKS_LOCKED` error surfaced as a readable message |
| C3 | System → Player: malformed scores rejected | `save_pick` validates 0–20 integers; `INVALID_SCORE` error |
| C4 | Player → Player (via system): picks invisible until kickoff, then all revealed | I3 policy; post-kickoff SELECT returns all rows for the match |
| C5 | Player → Sync: a finished match shows points within ~30 min of full time | cron cadence; "results auto-update every 30 min" stated in Rules |
| C6 | Admin → System: backfill writes bypass the lock but never overwrite a player's own later pick | backfill uses upsert-with-do-nothing for existing rows |
| C7 | Sync → football-data: ≤ 2 requests per run (limit 10/min) | one matches call per run |
| C8 | Seam: player saves while sync is writing the same match row | different tables; no conflict possible |
| C9 | Seam: two players on one shared phone | name switcher in UI; picks keyed by selected player |

## 7. Architecture

```
[Player phone/browser]
   │  HTTPS (anon key, RLS-gated reads + RPCs)
   ▼
[GitHub Pages: static Vite+TS site]      [GitHub Actions cron (*/30)]
   │                                         │ service-role key (secret)
   ▼                                         ▼
[Supabase Postgres + PostgREST] ◄────── upsert matches ── [football-data.org v4]
   • tables: players, matches, predictions, bonus_picks, bonus_results
   • views: match_points, leaderboard  • RPCs: save_pick, my_picks, save_bonus, my_bonus
```

Trust boundaries: browser holds only the anon key (public by design, RLS-gated);
service-role key exists only in GH Actions secrets and the admin's local `.env`.

## 8. Scoring rules (player-facing, also rendered in the app)

- Exact 90-minute score: **3 pts** · Correct outcome (win/draw/win): **1 pt**
- Knockout rounds: points **doubled** (exact 6, outcome 2)
- Knockouts are scored on the 90-minute result — predicting a draw pays if it goes to extra time
- Bonus (lock 28/06, first Round-of-32 kickoff): Champion **10**, Golden Boot **5**, Bafana's finishing stage **5**
- Tiebreak: most exact scores, then most correct outcomes

## 9. Out of scope (v1)

Authentication, private leagues, push notifications, head-to-head rounds, odds,
rank-history snapshots (movement arrows are per-device via localStorage), automated
golden-boot resolution (admin fills it once after the final).
