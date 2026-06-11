# Squad Goals FC — World Cup 2026 pool

Self-running prediction pool for the Datacentrix core team. Exact-score predictions for
all 104 matches, bonus picks, automatic results and scoring, kudos only.

- **Live site:** https://konfytbekkie.github.io/worldcup-predictor/
- **Spec / source of truth:** [docs/SPEC.md](docs/SPEC.md)
- **Progress:** [tracker.md](tracker.md) · **Security posture:** [SECURITY.md](SECURITY.md)

## How it runs

| Piece | Where | Notes |
|---|---|---|
| Frontend | GitHub Pages (`deploy.yml` on push to main) | Vite + TypeScript, zero runtime deps |
| Data | Supabase Postgres | schema in `supabase/schema.sql`, RLS + RPCs enforce the rules |
| Results sync | GitHub Actions cron, every 30 min (`sync.yml`) | `sync/sync.mjs`, one football-data.org call per run |

## Admin tasks (Marthelize)

- **Local sync / testing:** copy `.env.example` to `.env`, fill it in, then `npm run sync`.
- **Backfill matchday-1 picks** (collected on WhatsApp before launch): insert directly with
  the service-role key, which bypasses the kickoff lock — easiest done in a Claude session:
  "backfill these picks: Garsen MEX 1–1 RSA, …".
- **After the final:** fill the single `bonus_results` row (champion, golden boot,
  Bafana's stage) in the Supabase table editor — bonus points then appear automatically.
- **Post-tournament:** rotate keys, pause the Supabase project, archive this repo (SD-02).

## Development

```sh
npm install
npm run dev      # local dev server
npm run build    # typecheck + production build
```
