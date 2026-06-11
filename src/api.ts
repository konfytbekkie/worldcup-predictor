// Thin fetch wrapper over Supabase PostgREST. The anon key is public by design;
// row visibility and write rules are enforced server-side by RLS and RPCs.

const SUPABASE_URL = 'https://libqqybcujfodyifsuae.supabase.co';
const ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxpYnFxeWJjdWpmb2R5aWZzdWFlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExOTQ3NjEsImV4cCI6MjA5Njc3MDc2MX0.bBZgkWcn7jIP8gVXacSLrlNwCL-7wZCorDZgLvttb1M';

const headers = {
  apikey: ANON_KEY,
  Authorization: `Bearer ${ANON_KEY}`,
  'Content-Type': 'application/json',
};

export interface Player {
  id: number;
  name: string;
}

export interface Match {
  id: number;
  matchday: number | null;
  stage: string;
  grp: string | null;
  kickoff_utc: string;
  status: string;
  home_team: string | null;
  home_tla: string | null;
  home_crest: string | null;
  away_team: string | null;
  away_tla: string | null;
  away_crest: string | null;
  home_score: number | null;
  away_score: number | null;
  last_synced: string;
}

export interface Pick {
  player_id: number;
  match_id: number;
  home_pred: number;
  away_pred: number;
}

export interface LeaderRow {
  player_id: number;
  name: string;
  points: number;
  match_pts: number;
  bonus_pts: number;
  exacts: number;
  outcomes: number;
}

export interface MyPick {
  match_id: number;
  home_pred: number;
  away_pred: number;
}

export interface Bonus {
  champion: string | null;
  golden_boot: string | null;
  bafana_stage: string | null;
}

export interface BonusPickRow extends Bonus {
  player_id: number;
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers });
  if (!res.ok) throw new Error(`GET ${path}: ${res.status} ${await res.text()}`);
  return res.json();
}

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(args),
  });
  if (!res.ok) {
    const body = await res.text();
    if (body.includes('PICKS_LOCKED')) throw new Error('PICKS_LOCKED');
    if (body.includes('BONUS_LOCKED')) throw new Error('BONUS_LOCKED');
    if (body.includes('INVALID_SCORE')) throw new Error('INVALID_SCORE');
    throw new Error(`RPC ${fn}: ${res.status} ${body}`);
  }
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export const api = {
  players: () => get<Player[]>('players?select=*&order=id'),
  matches: () => get<Match[]>('matches?select=*&order=kickoff_utc'),
  leaderboard: () => get<LeaderRow[]>('leaderboard?select=*'),
  // RLS reveals these only for matches that have kicked off
  revealedPicks: () => get<Pick[]>('predictions?select=player_id,match_id,home_pred,away_pred'),
  // who has picked which upcoming match (counts only — scores stay hidden)
  pickCounts: () => get<{ match_id: number; player_id: number }[]>('match_points?select=match_id,player_id'),
  revealedBonus: () => get<BonusPickRow[]>('bonus_picks?select=player_id,champion,golden_boot,bafana_stage'),
  myPicks: (player: number) => rpc<MyPick[]>('my_picks', { p_player: player }),
  myBonus: (player: number) => rpc<Bonus[]>('my_bonus', { p_player: player }),
  savePick: (player: number, match: number, home: number, away: number) =>
    rpc<void>('save_pick', { p_player: player, p_match: match, p_home: home, p_away: away }),
  saveBonus: (player: number, champion: string | null, boot: string | null, bafana: string | null) =>
    rpc<void>('save_bonus', { p_player: player, p_champion: champion, p_boot: boot, p_bafana: bafana }),
};
