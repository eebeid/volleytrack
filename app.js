/**
 * VolleyTrack — app.js
 * Single-file application for volleyball tournament management.
 * Double elimination, Best of 3 sets, 6-8 teams.
 */

'use strict';

/* =============================================
   CONSTANTS
   ============================================= */
const STORAGE_KEY = 'volleytrack_v2';
const SET_WIN_PTS  = 25;   // Sets 1 & 2 target
const SET3_WIN_PTS = 15;   // Deciding set (3rd) target
const SETS_TO_WIN  = 2;    // Sets needed to win a match (best of 3)
const WIN_BY       = 2;    // Win by this many points

const PRESET_COLORS = [
  '#f97316','#22d3ee','#a78bfa','#34d399',
  '#f87171','#fbbf24','#60a5fa','#f472b6',
];

const DEFAULT_AVATAR = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' fill='%230d1530'/%3E%3Ccircle cx='50' cy='38' r='22' fill='%2394a3b8'/%3E%3Cellipse cx='50' cy='95' rx='38' ry='28' fill='%2394a3b8'/%3E%3C/svg%3E`;
const PLAYER_AVATAR  = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' fill='%230b1028'/%3E%3Ccircle cx='50' cy='38' r='22' fill='%23475569'/%3E%3Cellipse cx='50' cy='95' rx='38' ry='28' fill='%23475569'/%3E%3C/svg%3E`;

/* =============================================
   STATE
   ============================================= */
let S = {
  profile: { name: 'Player', avatarDataUrl: '' },
  teams: [],           // [{id,name,color,players:[{id,name,number,avatarDataUrl}],stats:{}}]
  tournament: {
    started: false,
    bracket: null,     // generated bracket object
    activeMatchId: null,
    champion: null,
    gfResetId: null,   // id of GF-reset match if created
  },
};

/* =============================================
   PERSISTENCE
   ============================================= */
function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) S = JSON.parse(raw);
    // Migrate missing stats on teams
    S.teams.forEach(t => {
      if (!t.stats) t.stats = emptyStats();
    });
  } catch (e) { console.warn('State load failed', e); }
}

function saveState() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(S)); }
  catch (e) { console.warn('State save failed', e); }
}

function emptyStats() {
  return { wins:0, losses:0, setsWon:0, setsLost:0, pointsFor:0, pointsAgainst:0 };
}

/* =============================================
   ROUTER
   ============================================= */
function showView(id) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));

  const view = document.getElementById('view-' + id);
  if (view) view.classList.add('active');

  const tab = document.getElementById('tab-' + id);
  if (tab) tab.classList.add('active');

  switch (id) {
    case 'dashboard': renderDashboard(); break;
    case 'bracket':   renderBracket();   break;
    case 'teams':     renderTeams();     break;
    case 'stats':     renderStats();     break;
    case 'profile':   renderProfile();   break;
  }
}

/* =============================================
   PROFILE
   ============================================= */
function renderProfile() {
  document.getElementById('profileAvatarImg').src  = S.profile.avatarDataUrl || DEFAULT_AVATAR;
  document.getElementById('profileNameInput').value = S.profile.name;
}

function saveProfile() {
  const name = document.getElementById('profileNameInput').value.trim();
  if (!name) { showToast('Please enter a display name', 'error'); return; }
  S.profile.name = name;
  saveState();
  refreshNavProfile();
  showToast('Profile saved!', 'success');
}

function refreshNavProfile() {
  document.getElementById('navAvatar').src = S.profile.avatarDataUrl || DEFAULT_AVATAR;
  document.getElementById('navName').textContent  = S.profile.name;
}

document.addEventListener('DOMContentLoaded', () => {
  const avatarInput = document.getElementById('avatarFileInput');
  if (avatarInput) {
    avatarInput.addEventListener('change', e => {
      const file = e.target.files[0]; if (!file) return;
      const reader = new FileReader();
      reader.onload = ev => {
        S.profile.avatarDataUrl = ev.target.result;
        document.getElementById('profileAvatarImg').src = ev.target.result;
        saveState(); refreshNavProfile();
        showToast('Profile picture updated!', 'success');
      };
      reader.readAsDataURL(file);
    });
  }

  const playerInput = document.getElementById('playerAvatarInput');
  if (playerInput) {
    playerInput.addEventListener('change', e => {
      const file = e.target.files[0]; if (!file) return;
      const reader = new FileReader();
      reader.onload = ev => {
        document.getElementById('playerAvatarPreview').src = ev.target.result;
        playerInput.dataset.dataUrl = ev.target.result;
      };
      reader.readAsDataURL(file);
    });
  }

  // Team logo upload in the "Add Team" modal
  const newTeamAvatarInput = document.getElementById('newTeamAvatarInput');
  if (newTeamAvatarInput) {
    newTeamAvatarInput.addEventListener('change', e => {
      const file = e.target.files[0]; if (!file) return;
      const reader = new FileReader();
      reader.onload = ev => {
        const prev = document.getElementById('newTeamAvatarPreview');
        if (prev) { prev.src = ev.target.result; prev.classList.add('has-image'); }
        newTeamAvatarInput.dataset.dataUrl = ev.target.result;
      };
      reader.readAsDataURL(file);
    });
  }
});

/* =============================================
   TEAM MANAGEMENT
   ============================================= */
function renderTeams() {
  const grid = document.getElementById('teamsGrid');
  const countLabel = document.getElementById('teamCountLabel');
  countLabel.textContent = `${S.teams.length} team${S.teams.length !== 1 ? 's' : ''} registered`;

  // Disable add button if tournament running
  const addBtn = document.getElementById('addTeamBtn');
  if (addBtn) addBtn.disabled = S.tournament.started;

  if (S.teams.length === 0) {
    grid.innerHTML = `
      <div class="empty-state" style="grid-column:1/-1">
        <div class="empty-icon">🏐</div>
        <p>No teams yet — add between 2 and 8 teams to get started.</p>
        <button class="btn btn-primary" onclick="openAddTeamModal()">＋ Add Your First Team</button>
      </div>`;
    return;
  }

  grid.innerHTML = S.teams.map(team => buildTeamCard(team)).join('');

  // Attach per-team logo file input listeners
  S.teams.forEach(team => {
    const inp = document.getElementById(`teamLogoInput-${team.id}`);
    if (inp) {
      inp.addEventListener('change', e => {
        const file = e.target.files[0]; if (!file) return;
        const reader = new FileReader();
        reader.onload = ev => {
          team.avatarDataUrl = ev.target.result;
          saveState();
          renderTeams();
          showToast(`${team.name} logo updated!`, 'success');
        };
        reader.readAsDataURL(file);
      });
    }
  });
}

function buildTeamCard(team) {
  const playerRows = team.players.length
    ? team.players.map(p => `
        <div class="roster-item">
          <img class="r-avatar" src="${p.avatarDataUrl || PLAYER_AVATAR}" alt="${esc(p.name)}">
          <div class="r-num">${p.number !== '' ? '#'+p.number : '—'}</div>
          <div class="r-name" title="${esc(p.name)}">${esc(p.name)}</div>
          ${!S.tournament.started ? `<button class="btn btn-sm btn-danger" style="margin-left:auto;padding:.2rem .45rem" onclick="deletePlayer('${team.id}','${p.id}')">✕</button>` : ''}
        </div>`).join('')
    : '<div class="empty-roster">No players — add some!</div>';

  const addBtn    = S.tournament.started ? '' : `<button class="add-player-row" onclick="openAddPlayerModal('${team.id}')">＋ Add Player</button>`;
  const deleteBtn = S.tournament.started ? '' : `<button class="btn btn-sm btn-danger" title="Delete team" onclick="deleteTeam('${team.id}')">✕</button>`;

  // Stats
  const st = team.stats || emptyStats();
  const statStr = S.tournament.started
    ? `${st.wins}W–${st.losses}L · ${st.pointsFor} pts`
    : `${team.players.length} player${team.players.length!==1?'s':''}`;

  // Badge: logo image if available, otherwise colored letter
  const badgeInner = team.avatarDataUrl
    ? `<img src="${team.avatarDataUrl}" class="tc-logo-img" alt="${esc(team.name)} logo">`
    : `<div class="tc-badge" style="background:${team.color};width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:1.2rem;font-weight:900;color:#fff;border-radius:12px">${esc(team.name.charAt(0))}</div>`;

  return `
    <div class="team-card" id="tc-${team.id}">
      <div class="tc-header">
        <div class="tc-badge-wrap" onclick="changeTeamAvatar('${team.id}')" title="Click to change team logo">
          ${badgeInner}
          <div class="tc-avatar-overlay"><span style="font-size:.9rem">📷</span><span>Logo</span></div>
          <input type="file" id="teamLogoInput-${team.id}" accept="image/*" hidden aria-label="Change ${esc(team.name)} logo">
        </div>
        <div class="tc-info">
          <div class="tc-name" title="${esc(team.name)}">${esc(team.name)}</div>
          <div class="tc-meta">${statStr}</div>
        </div>
        <div class="tc-actions">${deleteBtn}</div>
      </div>
      <div class="tc-roster">
        ${playerRows}
        ${addBtn}
      </div>
    </div>`;
}

function openAddTeamModal() {
  if (S.tournament.started) { showToast('Cannot add teams during a tournament', 'error'); return; }
  if (S.teams.length >= 8) { showToast('Maximum 8 teams allowed', 'error'); return; }
  document.getElementById('newTeamNameInput').value = '';
  const color = PRESET_COLORS[S.teams.length % PRESET_COLORS.length];
  document.getElementById('newTeamColorInput').value = color;
  renderColorPresets(color);
  // Reset avatar preview
  const prev = document.getElementById('newTeamAvatarPreview');
  if (prev) { prev.src = ''; prev.classList.remove('has-image'); }
  const inp = document.getElementById('newTeamAvatarInput');
  if (inp) { inp.value = ''; inp.dataset.dataUrl = ''; }
  openModal('modalAddTeam');
  setTimeout(() => document.getElementById('newTeamNameInput').focus(), 80);
}

function renderColorPresets(selected) {
  const wrap = document.getElementById('colorPresets');
  if (!wrap) return;
  wrap.innerHTML = PRESET_COLORS.map(c =>
    `<div class="color-preset${c===selected?' selected':''}" style="background:${c}"
          onclick="pickColor('${c}')" title="${c}" tabindex="0" role="button" aria-label="Color ${c}"></div>`
  ).join('');
}

function pickColor(c) {
  document.getElementById('newTeamColorInput').value = c;
  renderColorPresets(c);
}

function addTeam() {
  const name       = document.getElementById('newTeamNameInput').value.trim();
  const color      = document.getElementById('newTeamColorInput').value;
  const avatarDataUrl = document.getElementById('newTeamAvatarInput')?.dataset?.dataUrl || '';
  if (!name) { showToast('Please enter a team name', 'error'); return; }
  if (S.teams.length >= 8) { showToast('Maximum 8 teams', 'error'); return; }

  S.teams.push({ id: uid(), name, color, avatarDataUrl, players: [], stats: emptyStats() });
  saveState();
  closeModal('modalAddTeam');
  renderTeams();
  showToast(`"${name}" added!`, 'success');
}

/** Open the hidden file input for a team card logo change. */
function changeTeamAvatar(teamId) {
  const inp = document.getElementById(`teamLogoInput-${teamId}`);
  if (inp) inp.click();
}

function deleteTeam(teamId) {
  S.teams = S.teams.filter(t => t.id !== teamId);
  saveState();
  renderTeams();
  showToast('Team removed', 'info');
}

/* -- Players -- */
function openAddPlayerModal(teamId) {
  document.getElementById('newPlayerNameInput').value   = '';
  document.getElementById('newPlayerNumberInput').value = '';
  document.getElementById('addPlayerTeamId').value      = teamId;
  document.getElementById('playerAvatarPreview').src    = PLAYER_AVATAR;
  document.getElementById('playerAvatarInput').dataset.dataUrl = '';
  openModal('modalAddPlayer');
  setTimeout(() => document.getElementById('newPlayerNameInput').focus(), 80);
}

function addPlayer() {
  const teamId = document.getElementById('addPlayerTeamId').value;
  const name   = document.getElementById('newPlayerNameInput').value.trim();
  const number = document.getElementById('newPlayerNumberInput').value.trim();
  const avatar = document.getElementById('playerAvatarInput').dataset.dataUrl || '';
  if (!name) { showToast('Please enter a player name', 'error'); return; }

  const team = S.teams.find(t => t.id === teamId);
  if (!team) return;
  team.players.push({ id: uid(), name, number, avatarDataUrl: avatar });
  saveState();
  closeModal('modalAddPlayer');
  renderTeams();
  showToast(`${name} added to ${team.name}!`, 'success');
}

function deletePlayer(teamId, playerId) {
  const team = S.teams.find(t => t.id === teamId);
  if (!team) return;
  team.players = team.players.filter(p => p.id !== playerId);
  saveState();
  renderTeams();
}

/* =============================================
   TOURNAMENT CONTROL
   ============================================= */
function handleTournamentBtn() {
  if (S.tournament.started) {
    openModal('modalConfirmReset');
  } else {
    startTournament();
  }
}

function confirmReset() {
  closeModal('modalConfirmReset');
  resetTournament();
}

function resetTournament() {
  S.teams.forEach(t => t.stats = emptyStats());
  S.tournament = { started: false, bracket: null, activeMatchId: null, champion: null, gfResetId: null };
  document.getElementById('btnTournament').textContent = 'Start Tournament';
  saveState();
  renderDashboard();
  showToast('Tournament reset', 'info');
}

function startTournament() {
  if (S.teams.length < 2) {
    showToast('Add at least 2 teams first!', 'error');
    showView('teams');
    return;
  }

  S.teams.forEach(t => t.stats = emptyStats());

  const bracket = generateBracket(S.teams.map(t => t.id));
  S.tournament = {
    started:      true,
    bracket,
    activeMatchId: null,
    champion:      null,
    gfResetId:     null,
  };

  document.getElementById('btnTournament').textContent = 'Reset Tournament';
  saveState();
  showToast('Tournament started! 🏐', 'success');
  showView('bracket');
}

/* =============================================
   BRACKET GENERATION (Double Elimination)
   ============================================= */

/**
 * Generates a full double-elimination bracket for the given team IDs.
 * Pads to the next power of 2 using null (bye) slots.
 *
 * Returns:
 *   { matches: Match[], wbRounds: Match[][], lbRounds: Match[][], gfId: number, pow, size }
 *
 * Match shape:
 *   { id, bracket:'W'|'L'|'GF'|'GFR', round,
 *     team1, team2,               // teamId or null
 *     sets: [{t1,t2}],            // one per played set
 *     currentSet,                 // 0-based index of current set
 *     setsWon: [t1count, t2count],
 *     winner, loser,              // teamId or null
 *     complete,                   // bool
 *     // feed fields (null = not applicable)
 *     feedWinners: [id,id],       // WB advancement: winners of both come here
 *     feedLosers:  [id,id],       // LB R1: losers of both come here
 *     feedWinner:  id,            // one team is winner of this match
 *     feedLoser:   id,            // other team is loser of this match
 *     feedWB:      id,            // GF: WB champion comes from here
 *     feedLB:      id,            // GF: LB champion comes from here
 *   }
 */
function generateBracket(teamIds) {
  const n   = teamIds.length;
  const pow = Math.ceil(Math.log2(Math.max(n, 2)));
  const sz  = Math.pow(2, pow);

  // Pad with byes
  const padded = [...teamIds];
  while (padded.length < sz) padded.push(null);

  // Seed order (e.g. for sz=8: 1v8, 4v5, 3v6, 2v7)
  const seedIdx = getSeedOrder(sz);
  const seeded  = seedIdx.map(i => padded[i] ?? null);

  let nextId = 1;
  const mkMatch = (bracket, round, t1, t2) => ({
    id: nextId++, bracket, round,
    team1: t1, team2: t2,
    sets: [], currentSet: 0, setsWon: [0, 0],
    winner: null, loser: null, complete: false,
    feedWinners: null, feedLosers: null,
    feedWinner: null, feedLoser: null,
    feedWB: null, feedLB: null,
  });

  const allMatches = [];

  /* ---- Winners Bracket ---- */
  const wbRounds = [];

  // WB R1
  const wbR1 = [];
  for (let i = 0; i < sz / 2; i++) {
    const t1 = seeded[i * 2];
    const t2 = seeded[i * 2 + 1];
    const m  = mkMatch('W', 1, t1, t2);
    autoCompleteBye(m);
    wbR1.push(m);
  }
  wbRounds.push(wbR1);
  allMatches.push(...wbR1);

  // WB R2 … pow
  for (let r = 2; r <= pow; r++) {
    const prev  = wbRounds[r - 2];
    const round = [];
    for (let i = 0; i < prev.length / 2; i++) {
      const m = mkMatch('W', r, null, null);
      m.feedWinners = [prev[i * 2].id, prev[i * 2 + 1].id];
      round.push(m);
    }
    wbRounds.push(round);
    allMatches.push(...round);
  }

  /* ---- Losers Bracket ---- */
  const lbRounds = [];

  // LB R1: pair up WB R1 losers (cross seeded)
  if (wbR1.length >= 2) {
    const lbR1 = [];
    const half = Math.floor(wbR1.length / 2);
    for (let i = 0; i < half; i++) {
      const m = mkMatch('L', 1, null, null);
      m.feedLosers = [wbR1[i].id, wbR1[wbR1.length - 1 - i].id];
      lbR1.push(m);
    }
    lbRounds.push(lbR1);
    allMatches.push(...lbR1);
  }

  // For each WB round 2 … (pow-1): drop-in + possibly a survival round
  let curLB = lbRounds.length ? lbRounds[lbRounds.length - 1] : [];

  for (let wbR = 2; wbR <= pow - 1; wbR++) {
    const wbLosers = wbRounds[wbR - 1]; // WB round wbR (0-indexed)

    // Drop-in round
    const dropIn = [];
    for (let i = 0; i < wbLosers.length; i++) {
      const m = mkMatch('L', lbRounds.length + 1, null, null);
      if (curLB[i]) m.feedWinner = curLB[i].id;
      m.feedLoser = wbLosers[i].id;
      dropIn.push(m);
    }
    lbRounds.push(dropIn);
    allMatches.push(...dropIn);

    // Survival round (if > 1 match in drop-in)
    if (dropIn.length > 1) {
      const surv = [];
      for (let i = 0; i < Math.floor(dropIn.length / 2); i++) {
        const m = mkMatch('L', lbRounds.length + 1, null, null);
        m.feedWinners = [dropIn[i * 2].id, dropIn[i * 2 + 1].id];
        surv.push(m);
      }
      lbRounds.push(surv);
      allMatches.push(...surv);
      curLB = surv;
    } else {
      curLB = dropIn;
    }
  }

  /* ---- LB Final (loser of WB Final drops in) ---- */
  const wbFinal = wbRounds[pow - 1][0];
  let gfLBFeeder = null;

  if (curLB.length > 0) {
    const lbFinal = mkMatch('L', lbRounds.length + 1, null, null);
    lbFinal.feedWinner = curLB[curLB.length - 1].id;
    lbFinal.feedLoser  = wbFinal.id;
    lbRounds.push([lbFinal]);
    allMatches.push(lbFinal);
    gfLBFeeder = lbFinal;
  }

  /* ---- Grand Final ---- */
  const gf = mkMatch('GF', 1, null, null);
  gf.feedWB = wbFinal.id;
  gf.feedLB = gfLBFeeder ? gfLBFeeder.id : null;
  allMatches.push(gf);

  // Seed teams from completed bye matches
  propagate(allMatches);

  return { matches: allMatches, wbRounds, lbRounds, gfId: gf.id, pow, sz };
}

/** Set up a match won automatically (bye). */
function autoCompleteBye(m) {
  if (m.team1 === null && m.team2 === null) {
    m.complete = true; m.winner = null; m.loser = null;
  } else if (m.team1 === null) {
    m.complete = true; m.winner = m.team2; m.loser = null;
  } else if (m.team2 === null) {
    m.complete = true; m.winner = m.team1; m.loser = null;
  }
}

/** Standard tournament seeding index array. getSeedOrder(8) → [0,7,3,4,2,5,1,6] */
function getSeedOrder(n) {
  if (n === 1) return [0];
  if (n === 2) return [0, 1];
  const half = n / 2;
  const top  = getSeedOrder(half);
  const out  = [];
  for (const t of top) { out.push(t); out.push(n - 1 - t); }
  return out;
}

/* =============================================
   BRACKET PROPAGATION
   ============================================= */
function propagate(matches) {
  // Multiple passes until stable
  let changed = true;
  let passes  = 0;
  while (changed && passes < 30) {
    changed = false;
    passes++;
    for (const m of matches) {
      if (m.complete) continue;
      const prev1 = m.team1, prev2 = m.team2;

      // Winners advancement (feedWinners)
      if (m.feedWinners) {
        const [f1, f2] = m.feedWinners.map(id => matches.find(x => x.id === id));
        if (f1?.winner && !m.team1) m.team1 = f1.winner;
        if (f2?.winner && !m.team2) m.team2 = f2.winner;
      }

      // LB R1 from WB R1 losers (feedLosers)
      if (m.feedLosers) {
        const [f1, f2] = m.feedLosers.map(id => matches.find(x => x.id === id));
        if (f1?.complete && !m.team1) m.team1 = f1.loser;
        if (f2?.complete && !m.team2) m.team2 = f2.loser;
        // Check for byes (null losers)
        if (m.team1 === null && f1?.complete && m.team2) {
          m.winner = m.team2; m.loser = null; m.complete = true; changed = true;
        } else if (m.team2 === null && f2?.complete && m.team1) {
          m.winner = m.team1; m.loser = null; m.complete = true; changed = true;
        }
      }

      // Drop-in: LB survivor (feedWinner) + WB loser (feedLoser)
      if (m.feedWinner != null) {
        const prev = matches.find(x => x.id === m.feedWinner);
        if (prev?.winner && !m.team1) m.team1 = prev.winner;
      }
      if (m.feedLoser != null) {
        const wbm = matches.find(x => x.id === m.feedLoser);
        if (wbm?.complete && !m.team2) m.team2 = wbm.loser;
        // If WB loser is null (bye), team2 stays null
        if (wbm?.complete && wbm.loser === null && m.team1) {
          m.winner = m.team1; m.loser = null; m.complete = true; changed = true;
        }
      }

      // Grand Final
      if (m.feedWB != null) {
        const wb = matches.find(x => x.id === m.feedWB);
        if (wb?.winner && !m.team1) m.team1 = wb.winner;
      }
      if (m.feedLB != null) {
        const lb = matches.find(x => x.id === m.feedLB);
        if (lb?.winner && !m.team2) m.team2 = lb.winner;
      }

      if (m.team1 !== prev1 || m.team2 !== prev2) changed = true;
    }
  }
}

/* =============================================
   SCORING LOGIC
   ============================================= */
function getActiveMatch() {
  if (!S.tournament.started || !S.tournament.bracket) return null;
  const id = S.tournament.activeMatchId;
  if (id == null) return null;
  return S.tournament.bracket.matches.find(m => m.id === id) || null;
}

function adjustScore(teamIdx, delta) {
  const match = getActiveMatch();
  if (!match || match.complete) return;

  if (!match.sets[match.currentSet]) {
    match.sets[match.currentSet] = { t1: 0, t2: 0 };
  }

  const set = match.sets[match.currentSet];
  if (teamIdx === 0) {
    set.t1 = Math.max(0, set.t1 + delta);
  } else {
    set.t2 = Math.max(0, set.t2 + delta);
  }

  // Animate score bump
  const elId = teamIdx === 0 ? 'score1' : 'score2';
  const el   = document.getElementById(elId);
  if (el && delta > 0) {
    el.classList.remove('bump');
    void el.offsetWidth;
    el.classList.add('bump');

    // Pulse ring
    const ringId = teamIdx === 0 ? 'ring1' : 'ring2';
    const ring   = document.getElementById(ringId);
    if (ring) { ring.classList.remove('pulse'); void ring.offsetWidth; ring.classList.add('pulse'); }
  }

  // Check set win
  const isSet3   = match.currentSet === 2;
  const target   = isSet3 ? SET3_WIN_PTS : SET_WIN_PTS;
  const t1       = set.t1, t2 = set.t2;
  let setWinner  = null;
  if (t1 >= target && t1 - t2 >= WIN_BY) setWinner = 0;
  else if (t2 >= target && t2 - t1 >= WIN_BY) setWinner = 1;

  if (setWinner !== null) {
    match.setsWon[setWinner]++;
    const losIdx = 1 - setWinner;

    // Update sets stats on teams
    const tWin  = S.teams.find(t => t.id === (setWinner===0 ? match.team1 : match.team2));
    const tLose = S.teams.find(t => t.id === (setWinner===0 ? match.team2 : match.team1));
    if (tWin)  tWin.stats.setsWon++;
    if (tLose) tLose.stats.setsLost++;

    if (match.setsWon[setWinner] >= SETS_TO_WIN) {
      // Match over
      const winnerId = setWinner === 0 ? match.team1 : match.team2;
      const loserId  = setWinner === 0 ? match.team2 : match.team1;
      finaliseMatch(match, winnerId, loserId);
      saveState();
      renderDashboard();
      return;
    }

    // Next set
    match.currentSet++;
    if (!match.sets[match.currentSet]) match.sets[match.currentSet] = { t1:0, t2:0 };
  }

  saveState();
  renderDashboard();
}

function finaliseMatch(match, winnerId, loserId) {
  match.complete = true;
  match.winner   = winnerId;
  match.loser    = loserId;

  // Tally points
  let wPts = 0, lPts = 0;
  match.sets.forEach(s => {
    wPts += (winnerId === match.team1) ? s.t1 : s.t2;
    lPts += (loserId  === match.team1) ? s.t1 : s.t2;
  });
  const tWin  = S.teams.find(t => t.id === winnerId);
  const tLose = S.teams.find(t => t.id === loserId);
  if (tWin)  { tWin.stats.wins++;   tWin.stats.pointsFor  += wPts; tWin.stats.pointsAgainst  += lPts; }
  if (tLose) { tLose.stats.losses++; tLose.stats.pointsFor += lPts; tLose.stats.pointsAgainst += wPts; }

  // Propagate bracket
  propagate(S.tournament.bracket.matches);

  // Check Grand Final outcome
  const gf = S.tournament.bracket.matches.find(m => m.id === S.tournament.bracket.gfId);
  if (match.id === S.tournament.bracket.gfId && match.complete) {
    handleGFComplete(match, gf);
  }

  // Check GF Reset outcome
  if (S.tournament.gfResetId && match.id === S.tournament.gfResetId && match.complete) {
    S.tournament.champion = match.winner;
  }

  // Clear active match
  S.tournament.activeMatchId = null;

  // Show result modal
  showMatchResult(match, winnerId);
}

function handleGFComplete(match, gf) {
  // In double elimination, GF team1 = WB champion (0 losses), team2 = LB champion (1 loss)
  const wbChamp = gf.team1; // came from WB undefeated
  const lbChamp = gf.team2; // came from LB with 1 prior loss

  if (match.winner === lbChamp) {
    // LB champion wins → Grand Final Reset (both now have 1 loss)
    createGFReset(wbChamp, lbChamp);
  } else {
    // WB champion wins → tournament over
    S.tournament.champion = match.winner;
  }
}

function createGFReset(team1Id, team2Id) {
  const resetMatch = {
    id: Date.now(), bracket: 'GFR', round: 1,
    team1: team1Id, team2: team2Id,
    sets: [], currentSet: 0, setsWon: [0, 0],
    winner: null, loser: null, complete: false,
    feedWinners: null, feedLosers: null,
    feedWinner: null, feedLoser: null,
    feedWB: null, feedLB: null,
  };
  S.tournament.bracket.matches.push(resetMatch);
  S.tournament.gfResetId = resetMatch.id;

  const t1 = S.teams.find(t => t.id === team1Id);
  const t2 = S.teams.find(t => t.id === team2Id);

  const body = document.getElementById('gfResetBody');
  body.innerHTML = `
    <div style="font-size:2.5rem;margin-bottom:.75rem">🔥</div>
    <p style="font-size:1.1rem;font-weight:800;color:var(--orange);margin-bottom:.5rem">
      Grand Final Reset!
    </p>
    <p style="color:var(--text-2);margin-bottom:1.25rem">
      ${esc(t2?.name||'LB Champ')} won — both teams start fresh!<br>
      One deciding match to crown the champion.
    </p>
    <button class="btn btn-primary w-full" onclick="closeModal('modalGFReset');selectMatchById(${resetMatch.id})">
      Score Deciding Match
    </button>`;
  openModal('modalGFReset');
}

/* -- Match selection helpers -- */
function selectMatchById(id) {
  S.tournament.activeMatchId = id;
  const m = getActiveMatch();
  if (m && !m.sets[m.currentSet]) m.sets[m.currentSet] = { t1:0, t2:0 };
  saveState();
  showView('dashboard');
}

function getAvailableMatches() {
  if (!S.tournament.started || !S.tournament.bracket) return [];
  return S.tournament.bracket.matches.filter(
    m => !m.complete && m.team1 && m.team2
  );
}

function openSelectMatchModal() {
  const avail = getAvailableMatches();
  const body  = document.getElementById('selectMatchBody');
  if (avail.length === 0) {
    body.innerHTML = `<div class="empty-state" style="padding:2rem"><p>No matches available right now.</p></div>`;
  } else {
    body.innerHTML = avail.map(m => {
      const t1    = teamName(m.team1);
      const t2    = teamName(m.team2);
      const badge = matchLabel(m);
      return `
        <div class="match-select-item" onclick="pickMatch(${m.id})">
          <div>
            <div class="msi-title">${esc(t1)} vs ${esc(t2)}</div>
            <div class="msi-sub">${badge}</div>
          </div>
          <div class="msi-arrow">›</div>
        </div>`;
    }).join('');
  }
  openModal('modalSelectMatch');
}

function pickMatch(id) {
  closeModal('modalSelectMatch');
  selectMatchById(id);
}

function matchLabel(m) {
  if (m.bracket === 'GF')  return '🏆 Grand Final';
  if (m.bracket === 'GFR') return '🔥 Grand Final Reset';
  const side = m.bracket === 'W' ? 'Winners' : 'Losers';
  return `${side} Bracket · Round ${m.round}`;
}

/* =============================================
   DASHBOARD RENDER
   ============================================= */
function renderDashboard() {
  const empty     = document.getElementById('dashboardEmpty');
  const sbWrap    = document.getElementById('scoreboardContainer');
  const champWrap = document.getElementById('championBanner');
  const btnT      = document.getElementById('btnTournament');
  const btnS      = document.getElementById('btnSelectMatch');

  btnT.textContent = S.tournament.started ? 'Reset Tournament' : 'Start Tournament';
  btnS.style.display = S.tournament.started ? '' : 'none';

  // Champion banner
  if (S.tournament.champion) {
    champWrap.classList.remove('hidden');
    empty.classList.add('hidden');
    sbWrap.classList.add('hidden');
    const champ = S.teams.find(t => t.id === S.tournament.champion);
    document.getElementById('champName').textContent = (champ?.name || 'Unknown') + ' 🏆';
    return;
  }
  champWrap.classList.add('hidden');

  const match = getActiveMatch();

  if (!match) {
    sbWrap.classList.add('hidden');
    empty.classList.remove('hidden');
    const msg = document.getElementById('dashboardEmptyMsg');
    if (!S.tournament.started) {
      msg.textContent = 'Add at least 2 teams and start the tournament!';
    } else {
      const avail = getAvailableMatches();
      msg.textContent = avail.length
        ? `${avail.length} match${avail.length>1?'es':''} ready — select one to score.`
        : 'Waiting for matches to be set by the bracket…';
    }
    document.getElementById('matchContextLabel').textContent = 'No active match';
    return;
  }

  empty.classList.add('hidden');
  sbWrap.classList.remove('hidden');

  const t1   = S.teams.find(t => t.id === match.team1);
  const t2   = S.teams.find(t => t.id === match.team2);
  const set  = match.sets[match.currentSet] || { t1:0, t2:0 };
  const isS3 = match.currentSet === 2;
  const tgt  = isS3 ? SET3_WIN_PTS : SET_WIN_PTS;

  // Context label
  document.getElementById('matchContextLabel').textContent = matchLabel(match);

  // Team 1
  styleTeamSide('ring1','initial1','name1','score1','sets1', t1, set.t1, match.setsWon[0]);
  // Team 2
  styleTeamSide('ring2','initial2','name2','score2','sets2', t2, set.t2, match.setsWon[1]);

  // Centre
  document.getElementById('setNumDisplay').textContent = match.currentSet + 1;
  document.getElementById('targetInfo').textContent    = `First to ${tgt} · Win by ${WIN_BY}`;

  // Set history
  const hist = match.sets.slice(0, match.currentSet)
    .map((s, i) => `Set ${i+1}: ${s.t1}–${s.t2}`)
    .join(' · ');
  document.getElementById('setHistory').textContent = hist;

  // Match banner
  document.getElementById('matchBannerText').textContent = matchLabel(match);
  const badge = document.getElementById('matchBracketBadge');
  badge.textContent = match.bracket;
  badge.style.background = match.bracket==='W' ? 'var(--cyan-dim)' : match.bracket==='GF'||match.bracket==='GFR' ? 'var(--orange-dim)' : 'var(--purple-dim)';
  badge.style.color = match.bracket==='W' ? 'var(--cyan)' : match.bracket==='GF'||match.bracket==='GFR' ? 'var(--orange)' : 'var(--purple)';

  // Score buttons disable if match complete
  ['minus1','plus1','minus2','plus2'].forEach(id => {
    const b = document.getElementById(id);
    if (b) b.disabled = match.complete;
  });

  // Live chart
  drawLiveChart(match, t1, t2);
}

function styleTeamSide(ringId, initId, nameId, scoreId, setsId, team, pts, setsWon) {
  const color = team?.color || 'var(--orange)';
  const init  = team?.name?.charAt(0)?.toUpperCase() || '?';
  const name  = team?.name || 'TBD';

  // Ring — show logo image if team has one, otherwise colored initial
  const ring = document.getElementById(ringId);
  if (ring) {
    ring.style.borderColor = color;
    if (team?.avatarDataUrl) {
      ring.style.background = 'transparent';
      ring.innerHTML = `<img src="${team.avatarDataUrl}" alt="${esc(name)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
    } else {
      ring.style.background = hexToRgba(color, 0.15);
      ring.innerHTML = `<div class="team-initial" id="${initId}" style="color:${color}">${init}</div>`;
    }
  }

  // Name
  const nameEl = document.getElementById(nameId);
  if (nameEl) nameEl.textContent = name;

  // Score
  const scoreEl = document.getElementById(scoreId);
  if (scoreEl) scoreEl.textContent = pts;

  // Set pips
  const pips = document.querySelectorAll(`#${setsId} .set-pip`);
  pips.forEach((p, i) => p.classList.toggle('won', i < setsWon));
}

/* =============================================
   LIVE CHART (Canvas)
   ============================================= */
function drawLiveChart(match, t1, t2) {
  const canvas = document.getElementById('liveChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const parent = canvas.parentElement;
  canvas.width  = Math.max(200, (parent?.clientWidth || 500) - 48);
  canvas.height = 160;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const set   = match.sets[match.currentSet] || { t1:0, t2:0 };
  const c1    = t1?.color || '#f97316';
  const c2    = t2?.color || '#22d3ee';
  const maxV  = Math.max(set.t1, set.t2, 10);
  const pad   = { t:18, b:32, l:20, r:20 };
  const cW    = canvas.width - pad.l - pad.r;
  const cH    = canvas.height - pad.t - pad.b;
  const barW  = Math.min(80, cW * 0.3);

  // Grid
  for (let i = 0; i <= 4; i++) {
    const y = pad.t + cH - (i / 4) * cH;
    ctx.strokeStyle = 'rgba(255,255,255,.05)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(pad.l + cW, y); ctx.stroke();
    ctx.fillStyle = '#475569'; ctx.font = '10px Inter,sans-serif'; ctx.textAlign = 'right';
    ctx.fillText(Math.round((i/4)*maxV), pad.l - 4, y + 4);
  }

  // Bars
  const x1 = pad.l + cW * 0.25 - barW / 2;
  const x2 = pad.l + cW * 0.75 - barW / 2;
  drawBar(ctx, x1, barW, pad.t, cH, set.t1, maxV, c1);
  drawBar(ctx, x2, barW, pad.t, cH, set.t2, maxV, c2);

  // Labels
  ctx.textAlign = 'center'; ctx.font = 'bold 13px Inter,sans-serif'; ctx.fillStyle = '#f0f4ff';
  ctx.fillText(set.t1, x1 + barW/2, pad.t + cH - (set.t1/maxV)*cH - 7);
  ctx.fillText(set.t2, x2 + barW/2, pad.t + cH - (set.t2/maxV)*cH - 7);

  ctx.font = '11px Inter,sans-serif'; ctx.fillStyle = '#94a3b8';
  const n1 = (t1?.name||'T1').substring(0,9); const n2 = (t2?.name||'T2').substring(0,9);
  ctx.fillText(n1, x1 + barW/2, pad.t + cH + 18);
  ctx.fillText(n2, x2 + barW/2, pad.t + cH + 18);

  // Baseline
  ctx.strokeStyle = 'rgba(255,255,255,.08)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(pad.l, pad.t+cH); ctx.lineTo(pad.l+cW, pad.t+cH); ctx.stroke();
}

function drawBar(ctx, x, w, padT, cH, val, maxV, color) {
  const h  = maxV > 0 ? (val / maxV) * cH : 0;
  const y  = padT + cH - h;
  const r  = Math.min(6, h / 2, w / 2);
  if (h < 1) return;
  const g  = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, color + 'ee');
  g.addColorStop(1, color + '44');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h); ctx.lineTo(x, y + h); ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath(); ctx.fill();
}

/* =============================================
   MATCH RESULT MODAL
   ============================================= */
function showMatchResult(match, winnerId) {
  const wTeam   = S.teams.find(t => t.id === winnerId);
  const lTeam   = S.teams.find(t => t.id === match.loser);
  const isGF    = match.bracket === 'GF' || match.bracket === 'GFR';
  const setRows = match.sets.map((s, i) =>
    `<div style="font-size:.82rem;color:var(--text-2)">Set ${i+1}: ${s.t1}–${s.t2}</div>`
  ).join('');

  const title = document.getElementById('matchResultTitle');
  title.textContent = isGF ? '🏆 Match Complete!' : '🎉 Match Complete!';

  document.getElementById('matchResultBody').innerHTML = `
    <div style="text-align:center">
      <div style="font-size:2.5rem;margin-bottom:.5rem">${isGF ? '🏆' : '🎉'}</div>
      <div style="font-size:1.3rem;font-weight:900;color:var(--orange);margin-bottom:.4rem">
        ${esc(wTeam?.name||'Team')} Wins!
      </div>
      <div style="color:var(--text-2);margin-bottom:1rem;font-size:.88rem">
        ${lTeam ? `def. ${esc(lTeam.name)}` : matchLabel(match)}
      </div>
      <div style="margin-bottom:1.25rem;display:flex;flex-direction:column;gap:.2rem">${setRows}</div>
      <button class="btn btn-primary w-full" onclick="closeModal('modalMatchResult');showView('bracket')">View Bracket</button>
      ${!isGF ? `<button class="btn btn-secondary w-full" style="margin-top:.5rem" onclick="closeModal('modalMatchResult');openSelectMatchModal()">Next Match</button>` : ''}
    </div>`;
  openModal('modalMatchResult');
}

/* =============================================
   BRACKET RENDER
   ============================================= */
function renderBracket() {
  const wrap = document.getElementById('bracketWrap');

  if (!S.tournament.started || !S.tournament.bracket) {
    wrap.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🏆</div>
        <p>Start the tournament to generate the bracket.</p>
        <button class="btn btn-primary" onclick="startTournament()">Start Tournament</button>
      </div>`;
    return;
  }

  const { matches, wbRounds, lbRounds, gfId } = S.tournament.bracket;
  const gf  = matches.find(m => m.id === gfId);
  const gfr = S.tournament.gfResetId ? matches.find(m => m.id === S.tournament.gfResetId) : null;
  let html  = '<div class="bracket-container">';

  // Winners bracket
  html += buildBracketSection('Winners Bracket', 'wb', wbRounds, 'wb-match', m => scoreableTip(m));
  // Losers bracket
  if (lbRounds.length) html += buildBracketSection('Losers Bracket', 'lb', lbRounds, 'lb-match', m => scoreableTip(m));
  // Grand Final
  if (gf) {
    html += `<div class="bracket-section">
      <div class="bracket-section-label gf-label">🏆 Grand Final</div>
      <div class="bracket-row">
        <div class="bracket-col">
          ${renderMatchCard(gf,'gf-match')}
        </div>
      </div>
    </div>`;
  }
  // GF Reset
  if (gfr) {
    html += `<div class="bracket-section">
      <div class="bracket-section-label gf-label">🔥 Grand Final Reset</div>
      <div class="bracket-row">
        <div class="bracket-col">
          ${renderMatchCard(gfr,'gfr-match')}
        </div>
      </div>
    </div>`;
  }
  // Champion
  if (S.tournament.champion) {
    const champ = S.teams.find(t => t.id === S.tournament.champion);
    html += `<div class="bracket-section">
      <div style="display:flex;align-items:center;gap:.75rem;padding:.75rem 1.1rem;background:var(--orange-dim);border:1px solid rgba(249,115,22,.3);border-radius:12px;font-weight:800;color:var(--orange)">
        🏆 Tournament Champion: ${esc(champ?.name||'Unknown')}
      </div>
    </div>`;
  }

  html += '</div>';
  wrap.innerHTML = html;
}

function buildBracketSection(title, labelClass, rounds, matchClass, tipFn) {
  let html = `<div class="bracket-section">
    <div class="bracket-section-label ${labelClass}">${title}</div>
    <div class="bracket-row">`;
  rounds.forEach((round, ri) => {
    html += `<div class="bracket-col">
      <div class="bracket-round-label">Round ${ri+1}</div>`;
    round.forEach(m => { html += renderMatchCard(m, matchClass); });
    html += `</div>`;
  });
  html += `</div></div>`;
  return html;
}

function scoreableTip(m) {
  return !m.complete && m.team1 && m.team2;
}

function renderMatchCard(match, cls) {
  const isActive   = S.tournament.activeMatchId === match.id;
  const canScore   = !match.complete && match.team1 && match.team2;
  const click      = canScore ? `onclick="selectMatchFromBracket(${match.id})"` : '';
  const byeClass   = (!match.team1 || !match.team2) && !match.complete ? ' b-match-bye' : '';
  const activeClass= isActive ? ' active-match' : '';
  const doneClass  = match.complete ? ' done' : '';

  const t1Name = match.team1 ? teamName(match.team1) : (match.complete?'—':'TBD');
  const t2Name = match.team2 ? teamName(match.team2) : (match.complete?'—':'TBD');
  const t1Color= match.team1 ? teamColor(match.team1) : '#475569';
  const t2Color= match.team2 ? teamColor(match.team2) : '#475569';

  const t1Won = match.complete && match.winner === match.team1;
  const t2Won = match.complete && match.winner === match.team2;

  return `
    <div class="b-match ${cls}${activeClass}${doneClass}${byeClass}" ${click}
         title="${canScore ? 'Click to score this match' : ''}">
      <div class="b-team ${t1Won?'won':''} ${match.complete&&!t1Won?'lost':''}">
        <div class="b-label">
          <div class="b-dot" style="background:${t1Color}"></div>
          <span title="${esc(t1Name)}">${esc(truncate(t1Name,14))}</span>
        </div>
        <span class="b-sets">${match.setsWon[0]}</span>
      </div>
      <div class="b-team ${t2Won?'won':''} ${match.complete&&!t2Won?'lost':''}">
        <div class="b-label">
          <div class="b-dot" style="background:${t2Color}"></div>
          <span title="${esc(t2Name)}">${esc(truncate(t2Name,14))}</span>
        </div>
        <span class="b-sets">${match.setsWon[1]}</span>
      </div>
    </div>`;
}

function selectMatchFromBracket(matchId) {
  closeModal('modalSelectMatch');
  selectMatchById(matchId);
}

/* =============================================
   STATS RENDER
   ============================================= */
function renderStats() {
  drawStatsChart('statsPointsChart', 'pointsFor',  'Points Scored');
  drawStatsChart('statsWinsChart',   'wins',        'Wins');
  renderStatsTable();
}

function drawStatsChart(canvasId, statKey, label) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  canvas.width  = Math.max(200, (canvas.parentElement?.clientWidth||400) - 48);
  canvas.height = 260;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (S.teams.length === 0) {
    ctx.fillStyle = '#475569'; ctx.font = '14px Inter,sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('No data yet', canvas.width/2, canvas.height/2);
    return;
  }

  const data   = S.teams.map(t => ({ label: t.name, value: t.stats[statKey]||0, color: t.color }));
  const maxV   = Math.max(...data.map(d => d.value), 1);
  const pad    = { t:28, b:52, l:44, r:16 };
  const cW     = canvas.width  - pad.l - pad.r;
  const cH     = canvas.height - pad.t - pad.b;
  const barW   = Math.min(70, cW / data.length * 0.55);
  const slot   = cW / data.length;

  // Grid lines + y labels
  for (let i = 0; i <= 5; i++) {
    const y = pad.t + cH - (i/5)*cH;
    ctx.strokeStyle = 'rgba(255,255,255,.05)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(pad.l+cW, y); ctx.stroke();
    ctx.fillStyle = '#475569'; ctx.font = '10px Inter,sans-serif'; ctx.textAlign = 'right';
    ctx.fillText(Math.round((i/5)*maxV), pad.l-5, y+4);
  }

  data.forEach((d, i) => {
    const cx = pad.l + i * slot + slot/2;
    const x  = cx - barW/2;
    drawBar(ctx, x, barW, pad.t, cH, d.value, maxV, d.color);

    // Value
    ctx.fillStyle = '#f0f4ff'; ctx.font = 'bold 12px Inter,sans-serif'; ctx.textAlign = 'center';
    const bH = maxV > 0 ? (d.value/maxV)*cH : 0;
    ctx.fillText(d.value, cx, pad.t+cH - bH - 7);

    // Name (2 lines if needed)
    ctx.fillStyle = '#94a3b8'; ctx.font = '10px Inter,sans-serif';
    const words = d.label.split(' ');
    if (words.length > 1 && d.label.length > 9) {
      ctx.fillText(words[0], cx, pad.t+cH+17);
      ctx.fillText(words.slice(1).join(' '), cx, pad.t+cH+29);
    } else {
      ctx.fillText(truncate(d.label, 10), cx, pad.t+cH+17);
    }
    // Dot
    ctx.fillStyle = d.color;
    ctx.beginPath(); ctx.arc(cx, pad.t+cH+40, 4, 0, Math.PI*2); ctx.fill();
  });
}

function renderStatsTable() {
  const wrap = document.getElementById('statsTableWrap');
  if (S.teams.length === 0) { wrap.innerHTML = ''; return; }

  const rows = S.teams.map(t => `
    <tr>
      <td><div class="team-cell"><div class="tc-dot" style="background:${t.color}"></div>${esc(t.name)}</div></td>
      <td>${t.players.length}</td>
      <td>${t.stats.wins}</td>
      <td>${t.stats.losses}</td>
      <td>${t.stats.setsWon}</td>
      <td>${t.stats.setsLost}</td>
      <td>${t.stats.pointsFor}</td>
      <td>${t.stats.pointsAgainst}</td>
    </tr>`).join('');

  wrap.innerHTML = `
    <div class="glass-card chart-card">
      <div class="chart-card-header"><h3 class="chart-title">Team Statistics</h3></div>
      <div class="stats-table-wrap">
        <table class="stats-table">
          <thead>
            <tr>
              <th>Team</th><th>Players</th><th>W</th><th>L</th>
              <th>Sets W</th><th>Sets L</th><th>Pts For</th><th>Pts Vs</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;
}

/* =============================================
   MODAL HELPERS
   ============================================= */
function openModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('open');
}

function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('open');
}

// Close on overlay click
document.addEventListener('click', e => {
  if (e.target.classList.contains('modal-overlay')) {
    e.target.classList.remove('open');
  }
});

/* =============================================
   TOAST
   ============================================= */
let toastTimer = null;
function showToast(msg, type = '') {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.className   = `toast${type?' '+type:''}`;
  void el.offsetWidth;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
}

/* =============================================
   UTILITIES
   ============================================= */
function uid() { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36); }
function esc(s) {
  if (!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function truncate(s, n) { return s && s.length > n ? s.slice(0,n)+'…' : (s||''); }
function teamName(id)  { return S.teams.find(t=>t.id===id)?.name  || 'TBD'; }
function teamColor(id) { return S.teams.find(t=>t.id===id)?.color || '#475569'; }
function hexToRgba(hex, a) {
  const r = parseInt(hex.slice(1,3),16);
  const g = parseInt(hex.slice(3,5),16);
  const b = parseInt(hex.slice(5,7),16);
  return `rgba(${r},${g},${b},${a})`;
}

/* =============================================
   BOOTSTRAP
   ============================================= */
document.addEventListener('DOMContentLoaded', () => {
  loadState();

  // Nav tab routing
  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.addEventListener('click', () => showView(tab.dataset.view));
  });

  // Profile nav click
  const navProf = document.getElementById('navProfile');
  if (navProf) {
    navProf.addEventListener('keydown', e => { if (e.key==='Enter') showView('profile'); });
  }

  // Save profile on Enter
  const profileInput = document.getElementById('profileNameInput');
  if (profileInput) {
    profileInput.addEventListener('keydown', e => { if (e.key==='Enter') saveProfile(); });
  }

  // Add team on Enter
  const teamInput = document.getElementById('newTeamNameInput');
  if (teamInput) {
    teamInput.addEventListener('keydown', e => { if (e.key==='Enter') addTeam(); });
  }

  // Add player on Enter
  const playerInput = document.getElementById('newPlayerNameInput');
  if (playerInput) {
    playerInput.addEventListener('keydown', e => { if (e.key==='Enter') addPlayer(); });
  }

  // Initial render
  refreshNavProfile();
  showView('dashboard');
});
