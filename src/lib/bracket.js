/**
 * bracket.js — Double-elimination bracket generation & propagation.
 * Pure functions, no side effects, safe to run in Node.js API routes.
 */

'use strict';

export function generateBracket(teamIds, format = 'double_elimination') {
  if (format === 'round_robin') {
    return generateRoundRobinBracket(teamIds);
  }

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

  // Helper to sort matches chronologically for playing order
  function getMatchOrderKey(m) {
    if (m.bracket === 'GF') return 1000;
    if (m.bracket === 'GFR') return 1001;
    if (m.bracket === 'W') {
      return m.round === 1 ? 1 : (3 * m.round - 3);
    }
    if (m.bracket === 'L') {
      if (m.round === 1) return 2;
      const isEven = m.round % 2 === 0;
      const half = isEven ? m.round / 2 : (m.round - 1) / 2;
      return isEven ? (3 * half + 1) : (3 * half + 2);
    }
    return 999;
  }

  const isByeMatch = (m) => {
    return m.complete && m.sets.length === 0 && (!m.team1 || !m.team2);
  };

  // 1. Sort allMatches chronologically, pushing bye matches to the end
  const sortedMatches = [...allMatches].sort((a, b) => {
    const byeA = isByeMatch(a);
    const byeB = isByeMatch(b);
    if (byeA !== byeB) {
      return byeA ? 1 : -1;
    }
    const keyA = getMatchOrderKey(a);
    const keyB = getMatchOrderKey(b);
    if (keyA !== keyB) return keyA - keyB;
    return a.id - b.id;
  });

  // 2. Build map of oldId -> newId
  const oldToNew = {};
  sortedMatches.forEach((m, idx) => {
    oldToNew[m.id] = idx + 1;
  });

  // 3. Re-assign match IDs and update feed links
  sortedMatches.forEach((m) => {
    m.id = oldToNew[m.id];
    if (m.feedWinners) m.feedWinners = m.feedWinners.map(id => oldToNew[id]);
    if (m.feedLosers)  m.feedLosers = m.feedLosers.map(id => oldToNew[id]);
    if (m.feedWinner != null) m.feedWinner = oldToNew[m.feedWinner];
    if (m.feedLoser != null)  m.feedLoser = oldToNew[m.feedLoser];
    if (m.feedWB != null)     m.feedWB = oldToNew[m.feedWB];
    if (m.feedLB != null)     m.feedLB = oldToNew[m.feedLB];
  });

  // 4. Update the returned round structure with the new IDs
  const newWbRounds = wbRounds.map(r => r.map(m => oldToNew[m.id]));
  const newLbRounds = lbRounds.map(r => r.map(m => oldToNew[m.id]));
  const newGfId = gf ? oldToNew[gf.id] : null;

  return { format: 'double_elimination', matches: sortedMatches, wbRounds: newWbRounds, lbRounds: newLbRounds, gfId: newGfId, pow, sz };
}

export function generateRoundRobinBracket(teamIds) {
  let nextId = 1;
  const mkMatch = (bracket, round, t1, t2) => ({
    id: nextId++, bracket, round,
    team1: t1, team2: t2,
    sets: [], currentSet: 0, setsWon: [0, 0],
    winner: null, loser: null, complete: false,
  });

  const teams = [...teamIds];
  if (teams.length % 2 !== 0) {
    teams.push(null); // BYE
  }

  const numTeams = teams.length;
  const roundsCount = numTeams - 1;
  const half = numTeams / 2;
  const rrMatches = [];
  const rrRounds = [];

  let pool = [...teams];

  for (let r = 1; r <= roundsCount; r++) {
    const roundMatches = [];
    for (let i = 0; i < half; i++) {
      const t1 = pool[i];
      const t2 = pool[numTeams - 1 - i];
      if (t1 !== null && t2 !== null) {
        const m = mkMatch('RR', r, t1, t2);
        roundMatches.push(m);
        rrMatches.push(m);
      }
    }
    rrRounds.push(roundMatches.map(m => m.id));
    // Rotate pool (keep first element fixed)
    pool = [pool[0], pool[numTeams - 1], ...pool.slice(1, numTeams - 1)];
  }

  // Championship Playoff Final match between Top 2 teams
  const gf = mkMatch('GF', 1, null, null);
  gf.feedRR = true;
  const allMatches = [...rrMatches, gf];

  propagate(allMatches, 'round_robin', teamIds);

  return {
    format: 'round_robin',
    matches: allMatches,
    rrRounds,
    gfId: gf.id,
    sz: teamIds.length
  };
}

export function propagate(matches, format = 'double_elimination', teamIds = []) {
  const matchMap = new Map();
  for (let i = 0; i < matches.length; i++) {
    matchMap.set(matches[i].id, matches[i]);
  }

  let changed = true;
  let passes  = 0;
  while (changed && passes < 30) {
    changed = false;
    passes++;
    for (const m of matches) {
      if (m.complete) continue;
      const prev1 = m.team1, prev2 = m.team2;

      if (m.feedWinners) {
        const f1 = matchMap.get(m.feedWinners[0]);
        const f2 = matchMap.get(m.feedWinners[1]);
        if (f1?.winner && !m.team1) m.team1 = f1.winner;
        if (f2?.winner && !m.team2) m.team2 = f2.winner;
      }
      if (m.feedLosers) {
        const f1 = matchMap.get(m.feedLosers[0]);
        const f2 = matchMap.get(m.feedLosers[1]);
        if (f1?.complete && !m.team1) m.team1 = f1.loser;
        if (f2?.complete && !m.team2) m.team2 = f2.loser;
        if (m.team1 === null && f1?.complete && m.team2) {
          m.winner = m.team2; m.loser = null; m.complete = true; changed = true;
        } else if (m.team2 === null && f2?.complete && m.team1) {
          m.winner = m.team1; m.loser = null; m.complete = true; changed = true;
        }
      }
      if (m.feedWinner != null) {
        const prev = matchMap.get(m.feedWinner);
        if (prev?.winner && !m.team1) m.team1 = prev.winner;
      }
      if (m.feedLoser != null) {
        const wbm = matchMap.get(m.feedLoser);
        if (wbm?.complete && !m.team2) m.team2 = wbm.loser;
        if (wbm?.complete && wbm.loser === null && m.team1) {
          m.winner = m.team1; m.loser = null; m.complete = true; changed = true;
        }
      }
      if (m.feedWB != null) {
        const wb = matchMap.get(m.feedWB);
        if (wb?.winner && !m.team1) m.team1 = wb.winner;
      }
      if (m.feedLB != null) {
        const lb = matchMap.get(m.feedLB);
        if (lb?.winner && !m.team2) m.team2 = lb.winner;
      }
      if (m.team1 !== prev1 || m.team2 !== prev2) changed = true;
    }
  }

  // Round Robin Top-2 propagation to Grand Final
  if (format === 'round_robin' || matches.some(m => m.feedRR)) {
    const gf = matches.find(m => m.bracket === 'GF');
    if (gf && !gf.complete) {
      const rrMatches = matches.filter(m => m.bracket === 'RR');
      const allRRComplete = rrMatches.length > 0 && rrMatches.every(m => m.complete);
      if (allRRComplete) {
        // Calculate standings from RR matches
        const statsMap = {};
        rrMatches.forEach(m => {
          if (!m.winner) return;
          const winnerId = m.winner;
          const loserId = m.loser;
          if (!statsMap[winnerId]) statsMap[winnerId] = { wins: 0, losses: 0, setsWon: 0, setsLost: 0, pointsFor: 0, pointsAgainst: 0 };
          if (!statsMap[loserId]) statsMap[loserId] = { wins: 0, losses: 0, setsWon: 0, setsLost: 0, pointsFor: 0, pointsAgainst: 0 };

          statsMap[winnerId].wins += 1;
          statsMap[loserId].losses += 1;

          const isT1Winner = m.winner === m.team1;
          const wSets = isT1Winner ? m.setsWon[0] : m.setsWon[1];
          const lSets = isT1Winner ? m.setsWon[1] : m.setsWon[0];
          statsMap[winnerId].setsWon += wSets;
          statsMap[winnerId].setsLost += lSets;
          statsMap[loserId].setsWon += lSets;
          statsMap[loserId].setsLost += wSets;

          let wPts = 0, lPts = 0;
          m.sets.forEach(s => {
            wPts += isT1Winner ? s.t1 : s.t2;
            lPts += isT1Winner ? s.t2 : s.t1;
          });
          statsMap[winnerId].pointsFor += wPts;
          statsMap[winnerId].pointsAgainst += lPts;
          statsMap[loserId].pointsFor += lPts;
          statsMap[loserId].pointsAgainst += wPts;
        });

        // Get unique team IDs participating in RR
        const teamIdSet = new Set();
        rrMatches.forEach(m => { if (m.team1) teamIdSet.add(m.team1); if (m.team2) teamIdSet.add(m.team2); });
        const rrTeamIds = Array.from(teamIdSet);

        const sorted = rrTeamIds.sort((a, b) => {
          const stA = statsMap[a] || { wins:0, setsWon:0, setsLost:0, pointsFor:0, pointsAgainst:0 };
          const stB = statsMap[b] || { wins:0, setsWon:0, setsLost:0, pointsFor:0, pointsAgainst:0 };
          if (stA.wins !== stB.wins) return stB.wins - stA.wins;
          const diffA = stA.setsWon - stA.setsLost;
          const diffB = stB.setsWon - stB.setsLost;
          if (diffA !== diffB) return diffB - diffA;
          return (stB.pointsFor - stB.pointsAgainst) - (stA.pointsFor - stA.pointsAgainst);
        });

        if (sorted.length >= 2) {
          if (gf.team1 !== sorted[0] || gf.team2 !== sorted[1]) {
            gf.team1 = sorted[0];
            gf.team2 = sorted[1];
          }
        }
      }
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

