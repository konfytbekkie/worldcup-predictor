// Syncs World Cup fixtures/results from football-data.org into Supabase.
// Touches the `matches` table only (SPEC invariant I5). One API call per run (C7).
// Required env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, FOOTBALL_DATA_TOKEN

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, FOOTBALL_DATA_TOKEN, FORCE_SYNC } = process.env;

for (const [k, v] of Object.entries({ SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, FOOTBALL_DATA_TOKEN })) {
  if (!v) {
    console.error(`Missing required env var: ${k}`);
    process.exit(1);
  }
}

const now = new Date();
const windowStart = new Date('2026-06-10T00:00:00Z');
const windowEnd = new Date('2026-07-21T00:00:00Z');
if (!FORCE_SYNC && (now < windowStart || now > windowEnd)) {
  console.log('Outside tournament window, nothing to do.');
  process.exit(0);
}

const apiRes = await fetch('https://api.football-data.org/v4/competitions/WC/matches', {
  headers: { 'X-Auth-Token': FOOTBALL_DATA_TOKEN },
});
if (!apiRes.ok) {
  console.error(`football-data.org returned ${apiRes.status}: ${await apiRes.text()}`);
  process.exit(1);
}
const { matches } = await apiRes.json();

// Pool rule: we score the 90-minute (regulation) result. When extra time was played,
// football-data moves the regulation score into score.regularTime.
function regulationScore(score) {
  if (score.duration !== 'REGULAR' && score.regularTime) return score.regularTime;
  return score.fullTime;
}

const rows = matches.map((m) => {
  const reg = regulationScore(m.score);
  return {
    id: m.id,
    matchday: m.matchday,
    stage: m.stage,
    grp: m.group,
    kickoff_utc: m.utcDate,
    status: m.status,
    home_team: m.homeTeam.name,
    home_tla: m.homeTeam.tla,
    home_crest: m.homeTeam.crest,
    away_team: m.awayTeam.name,
    away_tla: m.awayTeam.tla,
    away_crest: m.awayTeam.crest,
    home_score: reg?.home ?? null,
    away_score: reg?.away ?? null,
    last_synced: new Date().toISOString(),
  };
});

const dbRes = await fetch(`${SUPABASE_URL}/rest/v1/matches?on_conflict=id`, {
  method: 'POST',
  headers: {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
    Prefer: 'resolution=merge-duplicates,return=minimal',
  },
  body: JSON.stringify(rows),
});
if (!dbRes.ok) {
  console.error(`Supabase upsert failed ${dbRes.status}: ${await dbRes.text()}`);
  process.exit(1);
}

const finished = rows.filter((r) => r.status === 'FINISHED').length;
const live = rows.filter((r) => r.status === 'IN_PLAY' || r.status === 'PAUSED').length;
console.log(`Synced ${rows.length} matches (${finished} finished, ${live} live).`);
