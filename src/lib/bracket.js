/**
 * bracket.js — Double-elimination bracket generation & propagation.
 * Pure functions, no side effects, safe to run in Node.js API routes.
 */

'use strict';

export function generateBracket(teamIds) {
  const n   = teamIds.length;
  const pow = Math.ceil(Math.log2(Math.max(n, 2)));
  const sz  = Math.pow(2, pow);

  const padded = [...teamIds];
  while (padded.length < sz) padded.push(null);

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
  const wbRounds   = [];

  // WB R1
  const wbR1 = [];
  for (let i = 0; i < sz / 2; i++) {
    const m = mkMatch('W', 1, seeded[i * 2], seeded[i * 2 + 1]);
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

  // LB R1
  const lbRounds = [];
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

  let curLB = lbRounds.length ? lbRounds[lbRounds.length - 1] : [];

  for (let wbR = 2; wbR <= pow - 1; wbR++) {
    const wbLosers = wbRounds[wbR - 1];
    const dropIn = [];
    for (let i = 0; i < wbLosers.length; i++) {
      const m = mkMatch('L', lbRounds.length + 1, null, null);
      if (curLB[i]) m.feedWinner = curLB[i].id;
      m.feedLoser = wbLosers[i].id;
      dropIn.push(m);
    }
    lbRounds.push(dropIn);
    allMatches.push(...dropIn);

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

  const gf = mkMatch('GF', 1, null, null);
  gf.feedWB = wbFinal.id;
  gf.feedLB = gfLBFeeder ? gfLBFeeder.id : null;
  allMatches.push(gf);

  propagate(allMatches);

  return { matches: allMatches, wbRounds, lbRounds, gfId: gf.id, pow, sz };
}

export function propagate(matches) {
  let changed = true;
  let passes  = 0;
  while (changed && passes < 30) {
    changed = false;
    passes++;
    for (const m of matches) {
      if (m.complete) continue;
      const prev1 = m.team1, prev2 = m.team2;

      if (m.feedWinners) {
        const [f1, f2] = m.feedWinners.map(id => matches.find(x => x.id === id));
        if (f1?.winner && !m.team1) m.team1 = f1.winner;
        if (f2?.winner && !m.team2) m.team2 = f2.winner;
      }
      if (m.feedLosers) {
        const [f1, f2] = m.feedLosers.map(id => matches.find(x => x.id === id));
        if (f1?.complete && !m.team1) m.team1 = f1.loser;
        if (f2?.complete && !m.team2) m.team2 = f2.loser;
        if (m.team1 === null && f1?.complete && m.team2) {
          m.winner = m.team2; m.loser = null; m.complete = true; changed = true;
        } else if (m.team2 === null && f2?.complete && m.team1) {
          m.winner = m.team1; m.loser = null; m.complete = true; changed = true;
        }
      }
      if (m.feedWinner != null) {
        const prev = matches.find(x => x.id === m.feedWinner);
        if (prev?.winner && !m.team1) m.team1 = prev.winner;
      }
      if (m.feedLoser != null) {
        const wbm = matches.find(x => x.id === m.feedLoser);
        if (wbm?.complete && !m.team2) m.team2 = wbm.loser;
        if (wbm?.complete && wbm.loser === null && m.team1) {
          m.winner = m.team1; m.loser = null; m.complete = true; changed = true;
        }
      }
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

function autoCompleteBye(m) {
  if (m.team1 === null && m.team2 === null) {
    m.complete = true; m.winner = null; m.loser = null;
  } else if (m.team1 === null) {
    m.complete = true; m.winner = m.team2; m.loser = null;
  } else if (m.team2 === null) {
    m.complete = true; m.winner = m.team1; m.loser = null;
  }
}

function getSeedOrder(n) {
  if (n === 1) return [0];
  if (n === 2) return [0, 1];
  const half = n / 2;
  const top  = getSeedOrder(half);
  const out  = [];
  for (const t of top) { out.push(t); out.push(n - 1 - t); }
  return out;
}
