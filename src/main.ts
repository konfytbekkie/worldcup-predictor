import './style.css';
import {
  api,
  type Bonus,
  type BonusPickRow,
  type LeaderRow,
  type Match,
  type MyPick,
  type Pick,
  type Player,
} from './api';

type Tab = 'board' | 'fixtures' | 'bonus' | 'rules';

interface Me {
  id: number;
  name: string;
}

const state = {
  players: [] as Player[],
  matches: [] as Match[],
  leaderboard: [] as LeaderRow[],
  revealed: [] as Pick[],
  pickCounts: new Map<number, number>(),
  myPicks: new Map<number, MyPick>(),
  myBonus: null as Bonus | null,
  revealedBonus: [] as BonusPickRow[],
  me: loadMe(),
  tab: 'board' as Tab,
  fixturesView: 'upcoming' as 'upcoming' | 'played',
  loaded: false,
};

const app = document.getElementById('app')!;

// ---------------------------------------------------------------- helpers

function loadMe(): Me | null {
  try {
    return JSON.parse(localStorage.getItem('dcx-player') ?? 'null');
  } catch {
    return null;
  }
}

function isKnockout(stage: string): boolean {
  return stage !== 'GROUP_STAGE';
}

function stageLabel(m: Match): string {
  if (m.stage === 'GROUP_STAGE') return m.grp ? `Group ${m.grp.slice(-1)}` : 'Group stage';
  const labels: Record<string, string> = {
    LAST_32: 'Round of 32',
    LAST_16: 'Round of 16',
    QUARTER_FINALS: 'Quarter-final',
    SEMI_FINALS: 'Semi-final',
    THIRD_PLACE: 'Third place',
    FINAL: 'THE FINAL',
  };
  return labels[m.stage] ?? m.stage;
}

const BAFANA_STAGES: [string, string][] = [
  ['GROUP', 'Group stage exit'],
  ['LAST_32', 'Out in the Round of 32'],
  ['LAST_16', 'Out in the Round of 16'],
  ['QUARTER_FINALS', 'Out in the quarter-finals'],
  ['SEMI_FINALS', 'Out in the semis (3rd/4th place)'],
  ['RUNNER_UP', 'Runners-up'],
  ['CHAMPIONS', 'World champions'],
];

function kickedOff(m: Match): boolean {
  return new Date(m.kickoff_utc).getTime() <= Date.now();
}

function pointsFor(home_pred: number, away_pred: number, m: Match): number | null {
  if (m.status !== 'FINISHED' || m.home_score === null || m.away_score === null) return null;
  const mult = isKnockout(m.stage) ? 2 : 1;
  if (home_pred === m.home_score && away_pred === m.away_score) return 3 * mult;
  if (Math.sign(home_pred - away_pred) === Math.sign(m.home_score - m.away_score)) return mult;
  return 0;
}

function fmtDay(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

function teamHtml(name: string | null, crest: string | null, side: 'home' | 'away'): string {
  const crestImg = crest
    ? `<img class="crest" src="${esc(crest)}" alt="" loading="lazy" onerror="this.style.display='none'">`
    : '<span class="crest tbd">?</span>';
  const label = `<span class="team-name">${name ? esc(name) : 'TBD'}</span>`;
  return side === 'home'
    ? `<span class="team home">${label}${crestImg}</span>`
    : `<span class="team away">${crestImg}${label}</span>`;
}

let toastTimer: number | undefined;
function toast(msg: string, ok = true) {
  document.querySelector('.toast')?.remove();
  const el = document.createElement('div');
  el.className = `toast ${ok ? 'ok' : 'err'}`;
  el.textContent = msg;
  document.body.appendChild(el);
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el.remove(), 2600);
}

// ---------------------------------------------------------------- data loading

async function loadShared() {
  const [players, matches, leaderboard, revealed, counts] = await Promise.all([
    api.players(),
    api.matches(),
    api.leaderboard(),
    api.revealedPicks(),
    api.pickCounts(),
  ]);
  state.players = players;
  state.matches = matches;
  state.leaderboard = leaderboard;
  state.revealed = revealed;
  state.pickCounts = new Map();
  for (const c of counts) {
    state.pickCounts.set(c.match_id, (state.pickCounts.get(c.match_id) ?? 0) + 1);
  }
  if (bonusLocked()) {
    state.revealedBonus = await api.revealedBonus();
  }
}

async function loadMine() {
  if (!state.me) return;
  const [picks, bonus] = await Promise.all([api.myPicks(state.me.id), api.myBonus(state.me.id)]);
  state.myPicks = new Map(picks.map((p) => [p.match_id, p]));
  state.myBonus = bonus[0] ?? null;
}

function bonusLockTime(): Date | null {
  const r32 = state.matches.filter((m) => m.stage === 'LAST_32');
  if (!r32.length) return null;
  return new Date(Math.min(...r32.map((m) => new Date(m.kickoff_utc).getTime())));
}

function bonusLocked(): boolean {
  const t = bonusLockTime();
  return t !== null && t.getTime() <= Date.now();
}

// ---------------------------------------------------------------- rendering

function render() {
  if (!state.loaded) return;
  app.innerHTML = `
    <header>
      <div class="header-inner">
        <h1>DCX <span class="accent">PREDICTOR</span></h1>
        <div class="sub">FIFA World Cup 2026 · office pool</div>
        ${state.me ? `<button class="player-chip" data-action="switch-player">⚽ ${esc(state.me.name)} <small>switch</small></button>` : ''}
      </div>
      <div class="tri-bar"></div>
    </header>
    <nav>
      ${tabBtn('board', 'Standings')}
      ${tabBtn('fixtures', 'Fixtures')}
      ${tabBtn('bonus', 'Bonus')}
      ${tabBtn('rules', 'Rules')}
    </nav>
    <main>${renderTab()}</main>
    <footer>Results auto-update every 30 minutes · scores are 90-minute results</footer>
    ${state.me ? '' : renderNameModal()}
  `;
}

function tabBtn(tab: Tab, label: string): string {
  return `<button class="tab ${state.tab === tab ? 'active' : ''}" data-tab="${tab}">${label}</button>`;
}

function renderNameModal(): string {
  return `
    <div class="modal-backdrop">
      <div class="modal">
        <h2>Who are you?</h2>
        <p>Pick your name — it's remembered on this phone.</p>
        <div class="name-grid">
          ${state.players.map((p) => `<button class="name-btn" data-player="${p.id}">${esc(p.name)}</button>`).join('')}
        </div>
        <p class="fine">Honesty system: play as yourself. Kudos won by cheating is anti-kudos.</p>
      </div>
    </div>`;
}

// -------- standings

function renderBoard(): string {
  const rows = state.leaderboard;
  const prev: Record<string, number> = JSON.parse(localStorage.getItem('dcx-ranks') ?? '{}');
  const anyPoints = rows.some((r) => r.points > 0);
  const html = `
    <div class="board">
      ${rows
        .map((r, i) => {
          const rank = i + 1;
          const prevRank = prev[String(r.player_id)];
          let move = '';
          if (prevRank && prevRank !== rank) {
            move = prevRank > rank ? '<span class="up">▲</span>' : '<span class="down">▼</span>';
          }
          const medal = anyPoints && rank === 1 ? '👑 ' : '';
          const spoon = anyPoints && rank === rows.length ? ' 🥄' : '';
          const isMe = state.me?.id === r.player_id;
          return `
            <div class="board-row ${isMe ? 'me' : ''}">
              <span class="rank">${rank}${move}</span>
              <span class="bname">${medal}${esc(r.name)}${spoon}</span>
              <span class="bstats">${r.exacts}× exact${r.bonus_pts ? ` · +${r.bonus_pts} bonus` : ''}</span>
              <span class="bpts">${r.points}</span>
            </div>`;
        })
        .join('')}
    </div>
    <p class="fine center">▲▼ movement since you last checked · 🥄 wooden spoon</p>`;
  localStorage.setItem(
    'dcx-ranks',
    JSON.stringify(Object.fromEntries(rows.map((r, i) => [r.player_id, i + 1]))),
  );
  return html;
}

// -------- fixtures

function renderFixtures(): string {
  const upcoming = state.matches.filter((m) => !kickedOff(m));
  const played = state.matches.filter(kickedOff).reverse();
  const list = state.fixturesView === 'upcoming' ? upcoming : played;

  const pills = `
    <div class="pills">
      <button class="pill ${state.fixturesView === 'upcoming' ? 'active' : ''}" data-fview="upcoming">To pick (${upcoming.length})</button>
      <button class="pill ${state.fixturesView === 'played' ? 'active' : ''}" data-fview="played">Played (${played.length})</button>
    </div>`;

  if (!list.length) return `${pills}<p class="empty">Nothing here yet.</p>`;

  let html = pills;
  let lastDay = '';
  for (const m of list) {
    const day = fmtDay(m.kickoff_utc);
    if (day !== lastDay) {
      html += `<h3 class="day">${day}</h3>`;
      lastDay = day;
    }
    html += kickedOff(m) ? playedCard(m) : upcomingCard(m);
  }
  return html;
}

function upcomingCard(m: Match): string {
  const mine = state.myPicks.get(m.id);
  const pickable = !!(m.home_team && m.away_team);
  const count = state.pickCounts.get(m.id) ?? 0;
  return `
    <div class="card match" data-match="${m.id}">
      <div class="meta">
        <span class="stage ${isKnockout(m.stage) ? 'ko' : ''}">${stageLabel(m)}${isKnockout(m.stage) ? ' · 2×' : ''}</span>
        <span class="time">${fmtTime(m.kickoff_utc)}</span>
        <span class="count">${count}/${state.players.length} in</span>
      </div>
      <div class="row">
        ${teamHtml(m.home_team, m.home_crest, 'home')}
        ${
          pickable
            ? `<span class="score-inputs">
                 <input type="number" min="0" max="20" inputmode="numeric" class="pred home" value="${mine ? mine.home_pred : ''}" ${state.me ? '' : 'disabled'}>
                 <span class="dash">–</span>
                 <input type="number" min="0" max="20" inputmode="numeric" class="pred away" value="${mine ? mine.away_pred : ''}" ${state.me ? '' : 'disabled'}>
               </span>`
            : '<span class="score-inputs tbc">TBC</span>'
        }
        ${teamHtml(m.away_team, m.away_crest, 'away')}
      </div>
      <div class="save-row">
        <button class="save" data-action="save-pick" hidden>Save pick</button>
        <span class="saved-tick" ${mine ? '' : 'hidden'}>✓ pick in</span>
      </div>
    </div>`;
}

function playedCard(m: Match): string {
  const live = m.status === 'IN_PLAY' || m.status === 'PAUSED';
  const finished = m.status === 'FINISHED';
  const picks = state.revealed.filter((p) => p.match_id === m.id);
  const byId = new Map(state.players.map((p) => [p.id, p.name]));
  const pickRows = picks
    .sort((a, b) => (pointsFor(b.home_pred, b.away_pred, m) ?? 0) - (pointsFor(a.home_pred, a.away_pred, m) ?? 0))
    .map((p) => {
      const pts = pointsFor(p.home_pred, p.away_pred, m);
      const cls = pts === null ? '' : pts >= 3 ? 'exact' : pts > 0 ? 'outcome' : 'zero';
      return `<span class="pick-chip ${cls}">${esc(byId.get(p.player_id) ?? '?')} ${p.home_pred}–${p.away_pred}${pts !== null ? ` · ${pts}` : ''}</span>`;
    })
    .join('');
  return `
    <div class="card match played">
      <div class="meta">
        <span class="stage ${isKnockout(m.stage) ? 'ko' : ''}">${stageLabel(m)}${isKnockout(m.stage) ? ' · 2×' : ''}</span>
        ${live ? '<span class="live">● LIVE</span>' : `<span class="time">${finished ? 'FT' : fmtTime(m.kickoff_utc)}</span>`}
      </div>
      <div class="row">
        ${teamHtml(m.home_team, m.home_crest, 'home')}
        <span class="result">${m.home_score ?? '·'}<span class="dash">–</span>${m.away_score ?? '·'}</span>
        ${teamHtml(m.away_team, m.away_crest, 'away')}
      </div>
      ${picks.length ? `<div class="picks">${pickRows}</div>` : '<div class="picks fine">No picks for this one.</div>'}
    </div>`;
}

// -------- bonus

function renderBonus(): string {
  const lock = bonusLockTime();
  if (bonusLocked()) {
    const byId = new Map(state.players.map((p) => [p.id, p.name]));
    const stageByKey = new Map(BAFANA_STAGES);
    return `
      <div class="card">
        <h2>Bonus picks — locked 🔒</h2>
        <table class="bonus-table">
          <tr><th></th><th>Champion 10</th><th>Boot 5</th><th>Bafana 5</th></tr>
          ${state.revealedBonus
            .map(
              (b) => `<tr>
                <td>${esc(byId.get(b.player_id) ?? '?')}</td>
                <td>${b.champion ? esc(b.champion) : '—'}</td>
                <td>${b.golden_boot ? esc(b.golden_boot) : '—'}</td>
                <td>${b.bafana_stage ? esc(stageByKey.get(b.bafana_stage) ?? b.bafana_stage) : '—'}</td>
              </tr>`,
            )
            .join('')}
        </table>
      </div>`;
  }

  const teams = [...new Set(
    state.matches
      .filter((m) => m.stage === 'GROUP_STAGE')
      .flatMap((m) => [m.home_team, m.away_team])
      .filter((t): t is string => !!t),
  )].sort();
  const b = state.myBonus;
  return `
    <div class="card bonus-form">
      <h2>Bonus picks</h2>
      <p class="fine">Locks at the first Round-of-32 kickoff${lock ? ` — ${fmtDay(lock.toISOString())}, ${fmtTime(lock.toISOString())}` : ''}. Hidden from others until then.</p>
      <label>World champions <strong>(10 pts)</strong>
        <select id="bonus-champion">
          <option value="">— pick a team —</option>
          ${teams.map((t) => `<option ${b?.champion === t ? 'selected' : ''}>${esc(t)}</option>`).join('')}
        </select>
      </label>
      <label>Golden Boot (top scorer) <strong>(5 pts)</strong>
        <input id="bonus-boot" type="text" maxlength="60" placeholder="e.g. Mbappé" value="${b?.golden_boot ? esc(b.golden_boot) : ''}">
      </label>
      <label>How far do Bafana Bafana go? <strong>(5 pts)</strong>
        <select id="bonus-bafana">
          <option value="">— pick a stage —</option>
          ${BAFANA_STAGES.map(([k, label]) => `<option value="${k}" ${b?.bafana_stage === k ? 'selected' : ''}>${label}</option>`).join('')}
        </select>
      </label>
      <button class="save" data-action="save-bonus">Save bonus picks</button>
      ${b ? '<span class="saved-tick">✓ bonus picks in</span>' : ''}
    </div>`;
}

// -------- rules

function renderRules(): string {
  const lock = bonusLockTime();
  return `
    <div class="card rules">
      <h2>How it works</h2>
      <ul>
        <li><strong>Predict the exact score</strong> of every match before kickoff. You can change a pick any time until then.</li>
        <li>Exact 90-minute score: <strong>3 pts</strong> · correct outcome (right winner, or a draw): <strong>1 pt</strong>.</li>
        <li><strong>Knockout rounds count double</strong>: exact 6, outcome 2.</li>
        <li>Knockouts are scored on the <strong>90-minute result</strong> — predicting a draw pays out if it goes to extra time.</li>
        <li><strong>Bonus picks</strong> (lock${lock ? `: ${fmtDay(lock.toISOString())}` : ' at the first Round-of-32 kickoff'}): Champion 10 pts, Golden Boot 5 pts, Bafana's finishing stage 5 pts.</li>
        <li>Everyone's picks stay <strong>hidden until kickoff</strong>, then all are revealed on the match card.</li>
        <li>Tiebreak: most exact scores, then most correct outcomes.</li>
        <li>Results and the leaderboard update automatically every 30 minutes.</li>
        <li>Matchday-1 picks sent on WhatsApp before the site went live are loaded in by the admin.</li>
        <li>Honesty system — there are no logins, so play as yourself. The prize is kudos; cheating is therefore self-defeating. 🏆</li>
      </ul>
    </div>`;
}

function renderTab(): string {
  switch (state.tab) {
    case 'board':
      return renderBoard();
    case 'fixtures':
      return renderFixtures();
    case 'bonus':
      return renderBonus();
    case 'rules':
      return renderRules();
  }
}

// ---------------------------------------------------------------- events

app.addEventListener('click', async (e) => {
  const t = e.target as HTMLElement;

  const tabBtn = t.closest<HTMLElement>('[data-tab]');
  if (tabBtn) {
    state.tab = tabBtn.dataset.tab as Tab;
    void refresh(false);
    render();
    return;
  }

  const pill = t.closest<HTMLElement>('[data-fview]');
  if (pill) {
    state.fixturesView = pill.dataset.fview as 'upcoming' | 'played';
    render();
    return;
  }

  const nameBtn = t.closest<HTMLElement>('[data-player]');
  if (nameBtn) {
    const id = Number(nameBtn.dataset.player);
    const player = state.players.find((p) => p.id === id)!;
    state.me = { id: player.id, name: player.name };
    localStorage.setItem('dcx-player', JSON.stringify(state.me));
    await loadMine();
    render();
    return;
  }

  if (t.closest('[data-action="switch-player"]')) {
    state.me = null;
    state.myPicks = new Map();
    state.myBonus = null;
    localStorage.removeItem('dcx-player');
    render();
    return;
  }

  if (t.closest('[data-action="save-pick"]')) {
    const card = t.closest<HTMLElement>('[data-match]')!;
    await savePickFromCard(card);
    return;
  }

  if (t.closest('[data-action="save-bonus"]')) {
    await saveBonusFromForm();
    return;
  }
});

app.addEventListener('input', (e) => {
  const input = (e.target as HTMLElement).closest<HTMLInputElement>('input.pred');
  if (!input) return;
  const card = input.closest<HTMLElement>('[data-match]')!;
  card.querySelector<HTMLElement>('.save')!.hidden = false;
  card.querySelector<HTMLElement>('.saved-tick')?.setAttribute('hidden', '');
});

async function savePickFromCard(card: HTMLElement) {
  if (!state.me) return;
  const matchId = Number(card.dataset.match);
  const home = card.querySelector<HTMLInputElement>('input.pred.home')!.value;
  const away = card.querySelector<HTMLInputElement>('input.pred.away')!.value;
  if (home === '' || away === '') {
    toast('Fill in both scores', false);
    return;
  }
  try {
    await api.savePick(state.me.id, matchId, Number(home), Number(away));
    state.myPicks.set(matchId, { match_id: matchId, home_pred: Number(home), away_pred: Number(away) });
    card.querySelector<HTMLElement>('.save')!.hidden = true;
    const tick = card.querySelector<HTMLElement>('.saved-tick')!;
    tick.removeAttribute('hidden');
    toast('Pick saved ✓');
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    if (msg === 'PICKS_LOCKED') toast('Too late — this match has started', false);
    else if (msg === 'INVALID_SCORE') toast('Scores must be 0–20', false);
    else toast('Could not save — try again', false);
  }
}

async function saveBonusFromForm() {
  if (!state.me) return;
  const champion = (document.getElementById('bonus-champion') as HTMLSelectElement).value || null;
  const boot = (document.getElementById('bonus-boot') as HTMLInputElement).value.trim() || null;
  const bafana = (document.getElementById('bonus-bafana') as HTMLSelectElement).value || null;
  try {
    await api.saveBonus(state.me.id, champion, boot, bafana);
    state.myBonus = { champion, golden_boot: boot, bafana_stage: bafana };
    toast('Bonus picks saved ✓');
    render();
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    if (msg === 'BONUS_LOCKED') toast('Bonus picks are locked', false);
    else toast('Could not save — try again', false);
  }
}

// ---------------------------------------------------------------- refresh loop

let refreshing = false;
async function refresh(withMine = true) {
  if (refreshing) return;
  refreshing = true;
  try {
    await loadShared();
    if (withMine) await loadMine();
  } catch {
    // keep showing the last good data; next cycle retries
  } finally {
    refreshing = false;
  }
}

setInterval(async () => {
  if (document.visibilityState !== 'visible') return;
  await refresh();
  render();
}, 180_000);

document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState === 'visible') {
    await refresh();
    render();
  }
});

// ---------------------------------------------------------------- boot

(async () => {
  try {
    await loadShared();
    await loadMine();
    state.loaded = true;
    render();
  } catch (err) {
    app.innerHTML = `<div class="loading">😵 Could not load the pool. Check your signal and refresh.<br><small>${esc(String(err))}</small></div>`;
  }
})();
