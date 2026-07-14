'use client';
import { useSession, signOut } from 'next-auth/react';
import { useState, useEffect, useRef, useCallback } from 'react';
import { generateBracket, propagate } from '@/lib/bracket';

/* ── Constants ───────────────────────────────────────────── */
const SETS_TO_WIN  = 2;
const WIN_BY       = 2;
const PRESET_COLORS = ['#f97316','#22d3ee','#a78bfa','#34d399','#f87171','#fbbf24','#60a5fa','#f472b6'];
const DEFAULT_AVATAR = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' fill='%230d1530'/%3E%3Ccircle cx='50' cy='38' r='22' fill='%2394a3b8'/%3E%3Cellipse cx='50' cy='95' rx='38' ry='28' fill='%2394a3b8'/%3E%3C/svg%3E`;
const PLAYER_AVATAR  = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' fill='%230b1028'/%3E%3Ccircle cx='50' cy='38' r='22' fill='%23475569'/%3E%3Cellipse cx='50' cy='95' rx='38' ry='28' fill='%23475569'/%3E%3C/svg%3E`;

/* ── Helpers ─────────────────────────────────────────────── */
const esc  = s => !s ? '' : String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const uid  = () => Math.random().toString(36).slice(2,10) + Date.now().toString(36);
const trunc = (s,n) => s && s.length>n ? s.slice(0,n)+'…' : (s||'');
const emptyStats = () => ({ wins:0, losses:0, setsWon:0, setsLost:0, pointsFor:0, pointsAgainst:0 });
const hexToRgba = (hex, a) => {
  const r=parseInt(hex.slice(1,3),16), g=parseInt(hex.slice(3,5),16), b=parseInt(hex.slice(5,7),16);
  return `rgba(${r},${g},${b},${a})`;
};

function matchLabel(m) {
  if (m.bracket==='GF')  return '🏆 Grand Final';
  if (m.bracket==='GFR') return '🔥 Grand Final Reset';
  return `${m.bracket==='W'?'Winners':'Losers'} Bracket · Round ${m.round}`;
}


function getMatchTime(startTimeStr, durationMinutes, matchIndex) {
  const [hours, minutes] = (startTimeStr || "10:00").split(':').map(Number);
  const totalMinutes = hours * 60 + minutes + matchIndex * (durationMinutes || 25);
  const h24 = Math.floor(totalMinutes / 60) % 24;
  const m = totalMinutes % 60;
  const ampm = h24 >= 12 ? 'PM' : 'AM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  const mStr = String(m).padStart(2, '0');
  return `${h12}:${mStr} ${ampm}`;
}

/* ═══════════════════════════════════════════════════════════
   MAIN APP
   ═══════════════════════════════════════════════════════════ */
export default function Home() {
  const { data: session, status } = useSession();
  const isAdmin = status === 'authenticated' && session?.user?.email === 'edebeid@gmail.com';

  /* ── State ── */
  const [view,        setView]        = useState('home');
  const [profile,     setProfile]     = useState({ name:'', avatarDataUrl:'' });
  const [teams,       setTeams]       = useState([]);
  const [tournament,  setTournament]  = useState({ started:false, bracketJson:null, activeMatchId:null, champion:null, gfResetId:null, setTargetPoints:21, set3TargetPoints:15 });
  const [toast,       setToast]       = useState({ msg:'', type:'', show:false });
  const [modal,       setModal]       = useState(null);   // current open modal id
  const [loading,     setLoading]     = useState(true);
  const [saving,      setSaving]      = useState(false);

  /* Add Team form state */
  const [newTeamName,   setNewTeamName]   = useState('');
  const [newTeamColor,  setNewTeamColor]  = useState(PRESET_COLORS[0]);
  const [newTeamAvatar, setNewTeamAvatar] = useState('');
  /* Add Player form state */
  const [addPlayerTeamId, setAddPlayerTeamId] = useState('');
  const [newPlayerName,   setNewPlayerName]   = useState('');
  const [newPlayerNum,    setNewPlayerNum]     = useState('');
  const [newPlayerAvatar, setNewPlayerAvatar] = useState('');

  /* Edit Team Name state */
  const [editingTeamId,   setEditingTeamId]   = useState(null);
  const [editingTeamName, setEditingTeamName] = useState('');

  /* Edit Player state */
  const [editingPlayerId, setEditingPlayerId] = useState(null);

  /* Auto Populate state */
  const [autoTeamCount,   setAutoTeamCount]   = useState(8);

  /* GF Reset */
  const [gfResetInfo, setGfResetInfo] = useState(null);
  /* Match result */
  const [matchResult,   setMatchResult]  = useState(null);

  /* Archive History state */
  const [archives, setArchives] = useState([]);
  const [selectedArchive, setSelectedArchive] = useState(null);
  const [archiveName, setArchiveName] = useState('');

  /* Photos state */
  const [photos, setPhotos] = useState([]);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  /* Orders state */
  const [orders, setOrders] = useState([]);
  const [orderCaptainName, setOrderCaptainName] = useState('');
  const [orderMemberNumber, setOrderMemberNumber] = useState('');
  const [orderHamCount, setOrderHamCount] = useState(0);
  const [orderTurkeyCount, setOrderTurkeyCount] = useState(0);
  const [orderEggSaladCount, setOrderEggSaladCount] = useState(0);
  const [orderDrinkPackages, setOrderDrinkPackages] = useState(0);
  const [submittingOrder, setSubmittingOrder] = useState(false);

  const liveChartRef = useRef(null);
  const toastTimerRef = useRef(null);

  /* ── Toast ── */
  const showToast = useCallback((msg, type='') => {
    setToast({ msg, type, show:true });
    clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(t => ({...t, show:false})), 3200);
  }, []);

  /* ── API helpers ── */
  const apiFetch = async (url, opts={}) => {
    const res = await fetch(url, { headers:{'Content-Type':'application/json'}, ...opts });
    if (!res.ok) { const e = await res.json().catch(()=>({})); throw new Error(e.error||'Error'); }
    return res.json();
  };

  /* ── Load all data on mount ── */
  useEffect(() => {
    if (status === 'loading') return;
    (async () => {
      try {
        const promises = [
          apiFetch('/api/teams'),
          apiFetch('/api/tournament'),
          apiFetch('/api/tournament/archive').catch(() => []),
          apiFetch('/api/photos').catch(() => [])
        ];
        if (status === 'authenticated') {
          promises.push(apiFetch('/api/profile').catch(() => ({ name: '', avatarDataUrl: '' })));
          promises.push(apiFetch('/api/orders').catch(() => []));
        }
        const results = await Promise.all(promises);
        const ts = results[0];
        const tourn = results[1];
        const archs = results[2];
        const pts = results[3];
        const prof = status === 'authenticated' ? results[4] : { name: '', avatarDataUrl: '' };
        const ords = status === 'authenticated' ? results[5] : [];

        setArchives(archs);
        setPhotos(pts);
        setOrders(ords);
        setProfile({ name: prof?.name||session?.user?.name||'', avatarDataUrl: prof?.avatarDataUrl||'' });
        setTeams(ts.map(t => ({ ...t, stats: t.stats || emptyStats() })));
        setTournament({
          started:      tourn.started      ?? false,
          bracketJson:  tourn.bracketJson  ?? null,
          activeMatchId: tourn.activeMatchId != null ? Number(tourn.activeMatchId) : null,
          champion:     tourn.champion     ?? null,
          gfResetId:    tourn.gfResetId   != null ? Number(tourn.gfResetId) : null,
          setTargetPoints: tourn.setTargetPoints ?? 21,
          set3TargetPoints: tourn.set3TargetPoints ?? 15,
        });
      } catch(e) { showToast('Failed to load data', 'error'); }
      finally { setLoading(false); }
    })();
  }, [status]);

  /* ── Lightweight Spectator Polling Hook ── */
  useEffect(() => {
    if (isAdmin) return;
    if (!tournament.started || tournament.champion) return;

    const interval = setInterval(async () => {
      try {
        const [ts, tourn, pts] = await Promise.all([
          apiFetch('/api/teams'),
          apiFetch('/api/tournament'),
          apiFetch('/api/photos').catch(() => [])
        ]);
        setTeams(ts.map(t => ({ ...t, stats: t.stats || emptyStats() })));
        setPhotos(pts);
        setTournament(prev => {
          const nextActiveId = tourn.activeMatchId != null ? Number(tourn.activeMatchId) : null;
          const nextGfResetId = tourn.gfResetId != null ? Number(tourn.gfResetId) : null;
          if (
            prev.started !== tourn.started ||
            JSON.stringify(prev.bracketJson) !== JSON.stringify(tourn.bracketJson) ||
            prev.activeMatchId !== nextActiveId ||
            prev.champion !== tourn.champion ||
            prev.gfResetId !== nextGfResetId ||
            prev.setTargetPoints !== tourn.setTargetPoints ||
            prev.set3TargetPoints !== tourn.set3TargetPoints
          ) {
            return {
              started:      tourn.started      ?? false,
              bracketJson:  tourn.bracketJson  ?? null,
              activeMatchId: nextActiveId,
              champion:     tourn.champion     ?? null,
              gfResetId:    nextGfResetId,
              setTargetPoints: tourn.setTargetPoints ?? 21,
              set3TargetPoints: tourn.set3TargetPoints ?? 15,
            };
          }
          return prev;
        });
      } catch (e) {
        // Silent error handling for background polling
      }
    }, 8000);

    return () => clearInterval(interval);
  }, [isAdmin, tournament.started, tournament.champion]);

  /* ── Save tournament to API ── */
  const saveTournament = useCallback(async (tourn) => {
    try {
      await apiFetch('/api/tournament', {
        method: 'PUT',
        body: JSON.stringify({
          started:       tourn.started,
          bracketJson:   tourn.bracketJson,
          activeMatchId: tourn.activeMatchId,
          champion:      tourn.champion,
          gfResetId:     tourn.gfResetId,
          setTargetPoints: tourn.setTargetPoints,
          set3TargetPoints: tourn.set3TargetPoints,
        }),
      });
    } catch(e) { showToast('Save failed', 'error'); }
  }, []);

  /* ── Save team stats ── */
  const saveTeamStats = async (teamId, stats) => {
    try { await apiFetch(`/api/teams/${teamId}`, { method:'PUT', body:JSON.stringify({ stats }) }); }
    catch(e) { /* silent */ }
  };

  /* ── Draw live chart ── */
  useEffect(() => {
    if (view !== 'dashboard') return;
    const match = getActiveMatch();
    if (!match) return;
    const t1 = teams.find(t => t.id === match.team1);
    const t2 = teams.find(t => t.id === match.team2);
    drawLiveChart(liveChartRef.current, match, t1, t2);
  }, [view, tournament.activeMatchId, tournament.bracketJson, teams]);

  /* ── Derived ── */
  const bracket = tournament.bracketJson;
  const allMatches = bracket?.matches ?? [];

  function getActiveMatch() {
    if (!tournament.started || !bracket) return null;
    if (tournament.activeMatchId == null) return null;
    return allMatches.find(m => m.id === tournament.activeMatchId) || null;
  }

  function getAvailableMatches() {
    if (!tournament.started || !bracket) return [];
    return allMatches.filter(m => !m.complete && m.team1 && m.team2);
  }

  const teamName  = id => teams.find(t=>t.id===id)?.name  || 'TBD';
  const teamColor = id => teams.find(t=>t.id===id)?.color || '#475569';

  /* ═══════════════════════════════════════════════════════════
     PROFILE
     ═══════════════════════════════════════════════════════════ */
  const saveProfile = async () => {
    try {
      await apiFetch('/api/profile', { method:'PUT', body:JSON.stringify({ name: profile.name, avatarDataUrl: profile.avatarDataUrl }) });
      showToast('Profile saved!', 'success');
    } catch(e) { showToast(e.message,'error'); }
  };

  /* ═══════════════════════════════════════════════════════════
     TEAMS
     ═══════════════════════════════════════════════════════════ */
  const addTeam = async () => {
    if (!newTeamName.trim()) { showToast('Enter a team name','error'); return; }
    if (teams.length >= 8)   { showToast('Maximum 8 teams','error'); return; }
    try {
      const team = await apiFetch('/api/teams', { method:'POST', body:JSON.stringify({ name:newTeamName.trim(), color:newTeamColor, avatarDataUrl:newTeamAvatar }) });
      setTeams(prev => [...prev, { ...team, stats: emptyStats() }]);
      setModal(null);
      showToast(`"${team.name}" added!`, 'success');
    } catch(e) { showToast(e.message,'error'); }
  };

  const deleteTeam = async (teamId) => {
    try {
      await apiFetch(`/api/teams/${teamId}`, { method:'DELETE' });
      setTeams(prev => prev.filter(t => t.id !== teamId));
      showToast('Team removed','info');
    } catch(e) { showToast(e.message,'error'); }
  };

  const clearAllTeams = async () => {
    try {
      await apiFetch('/api/teams', { method:'DELETE' });
      setTeams([]);
      showToast('All teams cleared','info');
    } catch(e) { showToast(e.message,'error'); }
  };

  const populateDefaultTeams = async () => {
    try {
      setSaving(true);
      const generatedTeams = await apiFetch('/api/teams/populate', {
        method: 'POST',
        body: JSON.stringify({ count: autoTeamCount }),
      });
      setTeams(generatedTeams.map(t => ({ ...t, stats: emptyStats() })));
      setTournament(prev => ({
        ...prev,
        started: false,
        bracketJson: null,
        activeMatchId: null,
        champion: null,
        gfResetId: null,
      }));
      showToast(`Generated ${autoTeamCount} default teams with rosters!`,'success');
    } catch(e) { showToast(e.message,'error'); }
    finally { setSaving(false); }
  };

  const updateTeamAvatar = async (teamId, avatarDataUrl) => {
    try {
      const updated = await apiFetch(`/api/teams/${teamId}`, { method:'PUT', body:JSON.stringify({ avatarDataUrl }) });
      setTeams(prev => prev.map(t => t.id===teamId ? { ...t, avatarDataUrl } : t));
      showToast('Logo updated!','success');
    } catch(e) { showToast(e.message,'error'); }
  };

  const saveTeamName = async (teamId) => {
    if (!editingTeamName.trim()) return;
    try {
      await apiFetch(`/api/teams/${teamId}`, { method:'PUT', body:JSON.stringify({ name:editingTeamName.trim() }) });
      setTeams(prev => prev.map(t => t.id===teamId ? { ...t, name:editingTeamName.trim() } : t));
      setEditingTeamId(null);
      showToast('Team name updated!','success');
    } catch(e) { showToast(e.message,'error'); }
  };

  const addPlayer = async () => {
    if (!newPlayerName.trim()) { showToast('Enter a player name','error'); return; }
    try {
      const player = await apiFetch(`/api/teams/${addPlayerTeamId}/players`, {
        method:'POST', body:JSON.stringify({ name:newPlayerName.trim(), number:newPlayerNum, avatarDataUrl:newPlayerAvatar }),
      });
      setTeams(prev => prev.map(t => t.id===addPlayerTeamId ? { ...t, players:[...t.players, player] } : t));
      setModal(null);
      showToast('Player added!','success');
    } catch(e) { showToast(e.message,'error'); }
  };

  const deletePlayer = async (teamId, playerId) => {
    try {
      await apiFetch(`/api/teams/${teamId}/players/${playerId}`, { method:'DELETE' });
      setTeams(prev => prev.map(t => t.id===teamId ? { ...t, players:t.players.filter(p=>p.id!==playerId) } : t));
    } catch(e) { showToast(e.message,'error'); }
  };
  const handlePhotoUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploadingPhoto(true);
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = async () => {
        try {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;

          const maxW = 1024;
          const maxH = 768;

          if (width > maxW || height > maxH) {
            const ratio = Math.min(maxW / width, maxH / height);
            width = Math.round(width * ratio);
            height = Math.round(height * ratio);
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);

          const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.8);

          await apiFetch('/api/photos', {
            method: 'POST',
            body: JSON.stringify({ dataUrl: compressedDataUrl, caption: '' })
          });

          // Refresh photos list
          const newPhotos = await apiFetch('/api/photos');
          setPhotos(newPhotos);
          showToast('Photo uploaded!', 'success');
        } catch (err) {
          showToast('Upload failed', 'error');
        } finally {
          setUploadingPhoto(false);
        }
      };
    };
    reader.readAsDataURL(file);
  };

  const deletePhoto = async (photoId) => {
    if (!window.confirm('Are you sure you want to delete this photo?')) return;
    try {
      await apiFetch(`/api/photos?id=${photoId}`, { method: 'DELETE' });
      const newPhotos = await apiFetch('/api/photos');
      setPhotos(newPhotos);
      showToast('Photo deleted', 'info');
    } catch (e) {
      showToast('Delete failed', 'error');
    }
  };

  const submitOrder = async (e) => {
    e.preventDefault();
    if (!orderCaptainName.trim()) { showToast('Captain Name is required', 'error'); return; }
    if (!orderMemberNumber.trim()) { showToast('Member Number is required', 'error'); return; }

    setSubmittingOrder(true);
    try {
      await apiFetch('/api/orders', {
        method: 'POST',
        body: JSON.stringify({
          captainName: orderCaptainName,
          memberNumber: orderMemberNumber,
          hamCount: orderHamCount,
          turkeyCount: orderTurkeyCount,
          eggSaladCount: orderEggSaladCount,
          drinkPackages: orderDrinkPackages,
        })
      });

      if (isAdmin) {
        const newOrders = await apiFetch('/api/orders');
        setOrders(newOrders);
      }

      showToast('Order submitted successfully! 🥪', 'success');
      setOrderCaptainName('');
      setOrderMemberNumber('');
      setOrderHamCount(0);
      setOrderTurkeyCount(0);
      setOrderEggSaladCount(0);
      setOrderDrinkPackages(0);
    } catch (err) {
      showToast('Failed to submit order', 'error');
    } finally {
      setSubmittingOrder(false);
    }
  };
  const updatePlayer = async () => {
    if (!newPlayerName.trim()) { showToast('Enter a player name','error'); return; }
    try {
      const player = await apiFetch(`/api/teams/${addPlayerTeamId}/players/${editingPlayerId}`, {
        method:'PUT', body:JSON.stringify({ name:newPlayerName.trim(), number:newPlayerNum, avatarDataUrl:newPlayerAvatar }),
      });
      setTeams(prev => prev.map(t => t.id===addPlayerTeamId ? {
        ...t,
        players: t.players.map(p => p.id===editingPlayerId ? player : p)
      } : t));
      setModal(null);
      showToast('Player updated!','success');
    } catch(e) { showToast(e.message,'error'); }
  };

  /* ═══════════════════════════════════════════════════════════
     TOURNAMENT
     ═══════════════════════════════════════════════════════════ */
  const startTournament = async () => {
    if (!isAdmin) return;
    if (teams.length < 2) { showToast('Add at least 2 teams first!','error'); setView('teams'); return; }
    const resetTeams = teams.map(t => ({ ...t, stats: emptyStats() }));
    setTeams(resetTeams);

    const newBracket = generateBracket(resetTeams.map(t=>t.id));
    newBracket.startTime = "10:00";
    newBracket.matchDuration = 25;
    const newTourn = {
      started:true,
      bracketJson:newBracket,
      activeMatchId:null,
      champion:null,
      gfResetId:null,
      setTargetPoints: tournament.setTargetPoints,
      set3TargetPoints: tournament.set3TargetPoints
    };
    setTournament(newTourn);
    await saveTournament(newTourn);
    showToast('Tournament started! 🏐','success');
    setView('bracket');
  };

  const archiveTournament = async (name) => {
    try {
      const sortedTeams = [...teams].sort((a,b) => {
        const wA = a.stats.wins, wB = b.stats.wins;
        if (wA !== wB) return wB - wA;
        return (b.stats.pointsFor - b.stats.pointsAgainst) - (a.stats.pointsFor - a.stats.pointsAgainst);
      });
      const champObj = teams.find(t => t.id === tournament.champion);

      await apiFetch('/api/tournament/archive', {
        method: 'POST',
        body: JSON.stringify({
          name: name,
          bracketJson: tournament.bracketJson,
          championName: champObj?.name || 'TBD',
          championColor: champObj?.color || '#e2c9a3',
          championAvatar: champObj?.avatarDataUrl || null,
          standingsJson: sortedTeams.map(t => ({
            id: t.id,
            name: t.name,
            color: t.color,
            avatarDataUrl: t.avatarDataUrl,
            wins: t.stats.wins,
            losses: t.stats.losses,
            setsWon: t.stats.setsWon,
            setsLost: t.stats.setsLost,
            pointsFor: t.stats.pointsFor,
            pointsAgainst: t.stats.pointsAgainst,
          }))
        })
      });

      const newArchs = await apiFetch('/api/tournament/archive');
      setArchives(newArchs);
      showToast('Tournament archived!', 'success');
    } catch (e) {
      showToast('Failed to archive', 'error');
    }
  };

  const resetTournament = async () => {
    try {
      await apiFetch('/api/tournament', { method:'DELETE' });
      const resetTeams = teams.map(t => ({ ...t, stats: emptyStats() }));
      setTeams(resetTeams);
      setTournament({ started:false, bracketJson:null, activeMatchId:null, champion:null, gfResetId:null, setTargetPoints: tournament.setTargetPoints, set3TargetPoints: tournament.set3TargetPoints });
      setModal(null);
      showToast('Tournament reset','info');
    } catch(e) { showToast(e.message,'error'); }
  };

  /* ── Scoring ── */
  const adjustScore = async (teamIdx, delta) => {
    const match = getActiveMatch();
    if (!match || match.complete) return;

    const newMatches = allMatches.map(m => m.id !== match.id ? m : (() => {
      const nm = { ...m, sets:[...m.sets.map(s=>({...s}))], setsWon:[...m.setsWon] };
      if (!nm.sets[nm.currentSet]) nm.sets[nm.currentSet] = { t1:0, t2:0 };
      const set = { ...nm.sets[nm.currentSet] };
      if (teamIdx===0) set.t1 = Math.max(0, set.t1 + delta);
      else             set.t2 = Math.max(0, set.t2 + delta);
      nm.sets[nm.currentSet] = set;

      const isS3  = nm.currentSet === 2;
      const tgt   = isS3 ? (tournament.set3TargetPoints || 15) : (tournament.setTargetPoints || 21);
      const t1=set.t1, t2=set.t2;
      let sw = null;
      if (t1>=tgt && t1-t2>=WIN_BY) sw=0;
      else if (t2>=tgt && t2-t1>=WIN_BY) sw=1;

      if (sw !== null) {
        nm.setsWon[sw]++;
        if (nm.setsWon[sw] >= SETS_TO_WIN) {
          nm.complete  = true;
          nm.winner    = sw===0 ? nm.team1 : nm.team2;
          nm.loser     = sw===0 ? nm.team2 : nm.team1;
        } else {
          nm.currentSet++;
          if (!nm.sets[nm.currentSet]) nm.sets[nm.currentSet] = { t1:0, t2:0 };
        }
      }
      return nm;
    })());

    propagate(newMatches);

    // After propagation — check if the completed match needs GF handling
    const completedMatch = newMatches.find(m => m.id === match.id);
    let newTourn = { ...tournament, bracketJson:{ ...bracket, matches:newMatches }, activeMatchId: completedMatch?.complete ? null : tournament.activeMatchId };

    if (completedMatch?.complete) {
      // Update team stats
      const wId = completedMatch.winner, lId = completedMatch.loser;
      const updatedTeams = teams.map(t => {
        if (t.id === wId) {
          let wPts=0, lPts=0;
          completedMatch.sets.forEach(s => { wPts += wId===completedMatch.team1?s.t1:s.t2; lPts += lId===completedMatch.team1?s.t1:s.t2; });
          const sW = wId === completedMatch.team1 ? completedMatch.setsWon[0] : completedMatch.setsWon[1];
          const sL = wId === completedMatch.team1 ? completedMatch.setsWon[1] : completedMatch.setsWon[0];
          const ns = { 
            ...t.stats, 
            wins: t.stats.wins + 1, 
            pointsFor: t.stats.pointsFor + wPts, 
            pointsAgainst: t.stats.pointsAgainst + lPts,
            setsWon: t.stats.setsWon + sW,
            setsLost: t.stats.setsLost + sL
          };
          saveTeamStats(t.id, ns);
          return { ...t, stats: ns };
        }
        if (t.id === lId) {
          let wPts=0, lPts=0;
          completedMatch.sets.forEach(s => { wPts += wId===completedMatch.team1?s.t1:s.t2; lPts += lId===completedMatch.team1?s.t1:s.t2; });
          const sW = lId === completedMatch.team1 ? completedMatch.setsWon[0] : completedMatch.setsWon[1];
          const sL = lId === completedMatch.team1 ? completedMatch.setsWon[1] : completedMatch.setsWon[0];
          const ns = { 
            ...t.stats, 
            losses: t.stats.losses + 1, 
            pointsFor: t.stats.pointsFor + lPts, 
            pointsAgainst: t.stats.pointsAgainst + wPts,
            setsWon: t.stats.setsWon + sW,
            setsLost: t.stats.setsLost + sL
          };
          saveTeamStats(t.id, ns);
          return { ...t, stats: ns };
        }
        return t;
      });
      setTeams(updatedTeams);

      // GF logic
      const gfId = bracket.gfId;
      if (completedMatch.id === gfId) {
        const gf = newMatches.find(m => m.id === gfId);
        const wbChamp = gf.team1, lbChamp = gf.team2;
        if (completedMatch.winner === lbChamp) {
          // GF Reset
          const resetMatch = {
            id: Date.now(), bracket:'GFR', round:1,
            team1: wbChamp, team2: lbChamp,
            sets:[], currentSet:0, setsWon:[0,0],
            winner:null, loser:null, complete:false,
            feedWinners:null, feedLosers:null, feedWinner:null, feedLoser:null, feedWB:null, feedLB:null,
          };
          newTourn.bracketJson.matches.push(resetMatch);
          newTourn.gfResetId = resetMatch.id;
          setGfResetInfo({ t1: updatedTeams.find(t=>t.id===wbChamp), t2: updatedTeams.find(t=>t.id===lbChamp), matchId: resetMatch.id });
          setModal('gfReset');
        } else {
          newTourn.champion = completedMatch.winner;
        }
      } else if (tournament.gfResetId && completedMatch.id === tournament.gfResetId) {
        newTourn.champion = completedMatch.winner;
      }

      setMatchResult({ match: completedMatch, winnerName: teams.find(t=>t.id===completedMatch.winner)?.name, loserName: teams.find(t=>t.id===completedMatch.loser)?.name });
      setModal('matchResult');
    }

    setTournament(newTourn);
    await saveTournament(newTourn);
  };

  const selectMatch = async (matchId) => {
    const newTourn = { ...tournament, activeMatchId: matchId };
    setTournament(newTourn);
    await saveTournament(newTourn);
    setModal(null);
    setView('dashboard');
  };

  /* ═══════════════════════════════════════════════════════════
     CANVAS CHART
     ═══════════════════════════════════════════════════════════ */
  function drawLiveChart(canvas, match, t1, t2) {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    canvas.width  = Math.max(200, (canvas.parentElement?.clientWidth||500)-48);
    canvas.height = 160;
    ctx.clearRect(0,0,canvas.width,canvas.height);
    const set = match.sets[match.currentSet] || { t1:0, t2:0 };
    const c1=t1?.color||'#f97316', c2=t2?.color||'#22d3ee';
    const maxV=Math.max(set.t1,set.t2,10);
    const pad={t:18,b:32,l:20,r:20};
    const cW=canvas.width-pad.l-pad.r, cH=canvas.height-pad.t-pad.b;
    const barW=Math.min(80,cW*0.3);
    for(let i=0;i<=4;i++){
      const y=pad.t+cH-(i/4)*cH;
      ctx.strokeStyle='rgba(255,255,255,.05)';ctx.lineWidth=1;
      ctx.beginPath();ctx.moveTo(pad.l,y);ctx.lineTo(pad.l+cW,y);ctx.stroke();
      ctx.fillStyle='#475569';ctx.font='10px Inter,sans-serif';ctx.textAlign='right';
      ctx.fillText(Math.round((i/4)*maxV),pad.l-4,y+4);
    }
    const x1=pad.l+cW*0.25-barW/2, x2=pad.l+cW*0.75-barW/2;
    drawBar(ctx,x1,barW,pad.t,cH,set.t1,maxV,c1);
    drawBar(ctx,x2,barW,pad.t,cH,set.t2,maxV,c2);
    ctx.textAlign='center';ctx.font='bold 13px Inter,sans-serif';ctx.fillStyle='#f0f4ff';
    const bH1=maxV>0?(set.t1/maxV)*cH:0, bH2=maxV>0?(set.t2/maxV)*cH:0;
    ctx.fillText(set.t1,x1+barW/2,pad.t+cH-bH1-7);
    ctx.fillText(set.t2,x2+barW/2,pad.t+cH-bH2-7);
    ctx.font='11px Inter,sans-serif';ctx.fillStyle='#94a3b8';
    ctx.fillText(trunc(t1?.name||'T1',9),x1+barW/2,pad.t+cH+18);
    ctx.fillText(trunc(t2?.name||'T2',9),x2+barW/2,pad.t+cH+18);
    ctx.strokeStyle='rgba(255,255,255,.08)';ctx.lineWidth=1;
    ctx.beginPath();ctx.moveTo(pad.l,pad.t+cH);ctx.lineTo(pad.l+cW,pad.t+cH);ctx.stroke();
  }

  function drawBar(ctx,x,w,padT,cH,val,maxV,color){
    const h=maxV>0?(val/maxV)*cH:0, y=padT+cH-h, r=Math.min(6,h/2,w/2);
    if(h<1)return;
    const g=ctx.createLinearGradient(0,y,0,y+h);
    g.addColorStop(0,color+'ee');g.addColorStop(1,color+'44');
    ctx.fillStyle=g;ctx.beginPath();
    ctx.moveTo(x+r,y);ctx.lineTo(x+w-r,y);ctx.quadraticCurveTo(x+w,y,x+w,y+r);
    ctx.lineTo(x+w,y+h);ctx.lineTo(x,y+h);ctx.lineTo(x,y+r);ctx.quadraticCurveTo(x,y,x+r,y);
    ctx.closePath();ctx.fill();
  }

  function drawStatsChart(canvas, statKey) {
    if (!canvas || teams.length===0) return;
    const ctx = canvas.getContext('2d');
    canvas.width  = Math.max(200,(canvas.parentElement?.clientWidth||400)-48);
    canvas.height = 240;
    ctx.clearRect(0,0,canvas.width,canvas.height);
    const data = teams.map(t=>({ label:t.name, value:t.stats[statKey]||0, color:t.color }));
    const maxV = Math.max(...data.map(d=>d.value),1);
    const pad={t:28,b:52,l:44,r:16};
    const cW=canvas.width-pad.l-pad.r, cH=canvas.height-pad.t-pad.b;
    const barW=Math.min(70,cW/data.length*0.55), slot=cW/data.length;
    for(let i=0;i<=5;i++){
      const y=pad.t+cH-(i/5)*cH;
      ctx.strokeStyle='rgba(255,255,255,.05)';ctx.lineWidth=1;
      ctx.beginPath();ctx.moveTo(pad.l,y);ctx.lineTo(pad.l+cW,y);ctx.stroke();
      ctx.fillStyle='#475569';ctx.font='10px Inter,sans-serif';ctx.textAlign='right';
      ctx.fillText(Math.round((i/5)*maxV),pad.l-5,y+4);
    }
    data.forEach((d,i)=>{
      const cx=pad.l+i*slot+slot/2, x=cx-barW/2;
      drawBar(ctx,x,barW,pad.t,cH,d.value,maxV,d.color);
      const bH=maxV>0?(d.value/maxV)*cH:0;
      ctx.fillStyle='#f0f4ff';ctx.font='bold 12px Inter,sans-serif';ctx.textAlign='center';
      ctx.fillText(d.value,cx,pad.t+cH-bH-7);
      ctx.fillStyle='#94a3b8';ctx.font='10px Inter,sans-serif';
      ctx.fillText(trunc(d.label,10),cx,pad.t+cH+17);
      ctx.fillStyle=d.color;ctx.beginPath();ctx.arc(cx,pad.t+cH+40,4,0,Math.PI*2);ctx.fill();
    });
  }

  /* ═══════════════════════════════════════════════════════════
     LOADING / AUTH GUARDS
     ═══════════════════════════════════════════════════════════ */
  if (status==='loading' || loading) {
    return (
      <div style={{ minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',flexDirection:'column',gap:'1rem' }}>
        <img src="/logo.png" alt="Logo" style={{ height:'60px',width:'auto',objectFit:'contain',filter:'invert(1)',mixBlendMode:'screen' }} />
        <div style={{ color:'#94a3b8',fontSize:'.9rem' }}>Loading Bootaleyzee Cup…</div>
      </div>
    );
  }

  /* ═══════════════════════════════════════════════════════════
     RENDER
     ═══════════════════════════════════════════════════════════ */
  const match    = getActiveMatch();
  const avail    = getAvailableMatches();
  const set      = match?.sets[match?.currentSet] || { t1:0, t2:0 };
  const t1Obj    = teams.find(t=>t.id===match?.team1);
  const t2Obj    = teams.find(t=>t.id===match?.team2);
  const champObj = tournament.champion ? teams.find(t=>t.id===tournament.champion) : null;
  const isPastRegistrationDeadline = new Date() > new Date('2026-07-25T23:59:59');

  const wbRoundsCount = allMatches.length > 0 ? Math.max(...allMatches.filter(m => m.bracket === 'W').map(m => m.round), 0) : 0;
  const wb = [];
  for (let r = 1; r <= wbRoundsCount; r++) {
    wb.push(allMatches.filter(m => m.bracket === 'W' && m.round === r).sort((a, b) => a.id - b.id));
  }

  const lbRoundsCount = allMatches.length > 0 ? Math.max(...allMatches.filter(m => m.bracket === 'L').map(m => m.round), 0) : 0;
  const lb = [];
  for (let r = 1; r <= lbRoundsCount; r++) {
    lb.push(allMatches.filter(m => m.bracket === 'L' && m.round === r).sort((a, b) => a.id - b.id));
  }
  const gf = allMatches.find(m=>m.id===bracket?.gfId);
  const gfr = tournament.gfResetId ? allMatches.find(m=>m.id===tournament.gfResetId) : null;

  return (
    <>
      {/* ── NAV ── */}
      <nav className="nav">
        <div className="nav-brand">
          <img src="/logo.png" className="nav-logo-img" alt="Logo" />
          <span className="nav-title" style={{ fontFamily: 'Anton, sans-serif', letterSpacing: '1.5px', fontSize: '1.4rem', textTransform: 'uppercase', color: 'var(--orange)' }}>Bootaleyzee Cup</span>
        </div>
        <div className="nav-tabs">
          {[['home','🏠','Home'],['dashboard','📊','Scoreboard'],['bracket','🏆','Bracket'],['schedule','📅','Schedule'],['teams','👥','Teams'],['stats','📈','Stats'],['photos','📷','Photos'],['history','📜','History'],['settings','⚙️','Settings']]
            .filter(([id]) => id !== 'settings' || isAdmin)
            .map(([id,icon,label])=>(
              <button key={id} className={`nav-tab${view===id?' active':''}`} onClick={()=>setView(id)}>
                <span className="tab-icon">{icon}</span>
                <span className="tab-label">{label}</span>
              </button>
            ))
          }
        </div>
        {isAdmin ? (
          <div className="nav-profile" onClick={()=>setView('profile')} style={{ cursor:'pointer',display:'flex',alignItems:'center',gap:'.5rem',padding:'.25rem .75rem',borderRadius:'50px',transition:'background .2s' }}>
            <img
              className="nav-avatar"
              src={profile.avatarDataUrl || session?.user?.image || DEFAULT_AVATAR}
              alt={profile.name || 'User'}
            />
            <span className="nav-name">{profile.name || session?.user?.name || 'User'}</span>
          </div>
        ) : (
          <a href="/auth/signin" className="btn btn-sm btn-primary" style={{ textDecoration:'none',fontFamily:'Inter,sans-serif',fontWeight:700 }}>
            Admin Login
          </a>
        )}
      </nav>

      <main className="main">

        {/* ══════════════════════════════
            HOME / SPLASH
            ══════════════════════════════ */}
        {view==='home' && (
          <div className="view active" style={{ display:'flex',flexDirection:'column',gap:'2rem' }}>
            
            {/* Hero Section */}
            <div className="glass-card" style={{ 
              position: 'relative', 
              padding: '3rem 2rem', 
              borderRadius: '16px', 
              overflow: 'hidden', 
              background: 'linear-gradient(135deg, rgba(8, 26, 19, 0.9) 0%, rgba(13, 44, 32, 0.9) 100%)',
              border: '1px solid rgba(226, 201, 163, 0.2)',
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '1rem'
            }}>
              <div style={{ 
                background: 'var(--orange)', 
                color: 'var(--bg)', 
                padding: '0.35rem 1rem', 
                borderRadius: '50px', 
                fontSize: '0.75rem', 
                fontWeight: 900, 
                letterSpacing: '2px',
                textTransform: 'uppercase'
              }}>
                ⭐ 10 Years of Volleyball Action ⭐
              </div>
              
              <h1 style={{ 
                fontFamily: 'Anton, sans-serif', 
                fontSize: 'clamp(3rem, 8vw, 5.5rem)', 
                fontWeight: 'normal', 
                color: '#fff', 
                margin: 0,
                letterSpacing: '3px',
                lineHeight: 1,
                textTransform: 'uppercase'
              }}>
                Boot<span style={{ color: 'var(--orange)' }}>alayzee</span>
              </h1>
              
              <p style={{ 
                fontSize: 'clamp(1rem, 2.5vw, 1.4rem)', 
                color: '#e2c9a3', 
                fontWeight: 800, 
                letterSpacing: '3px',
                textTransform: 'uppercase',
                margin: '0.5rem 0 1.5rem 0'
              }}>
                One Court. One Team. One Legend.
              </p>

              <div style={{ 
                display: 'flex', 
                justifyContent: 'center', 
                gap: '2rem', 
                flexWrap: 'wrap',
                background: 'rgba(255,255,255,0.03)',
                padding: '1rem 2rem',
                borderRadius: '50px',
                border: '1px solid rgba(255,255,255,0.05)',
                fontSize: '0.9rem',
                color: 'var(--text-1)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span>📅</span> <strong>August 2nd, 2026</strong>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span>⏰</span> <strong>10:00 AM</strong>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span>📍</span> <strong>Country Club of Fairfax</strong>
                </div>
              </div>
            </div>

            {/* Quick Requirements Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
              {[
                { title: 'Min Players', val: '5 Players', desc: 'Required per team', icon: '👥' },
                { title: 'Max Players', val: '8 Players', desc: 'No size inflation', icon: '👥' },
                { title: 'Co-Ed', val: 'Both Genders', desc: 'At least one woman', icon: '👩' },
                { title: 'Veterans', val: '40+ Player', desc: 'At least one required', icon: '🎂' },
                { title: 'Club Members', val: '2 CCF Members', desc: 'At least two required', icon: '💳' },
                { title: 'No Outside', val: 'Food/Drinks', desc: 'Strict club policies', icon: '🚫' }
              ].map((r, i) => (
                <div key={i} className="glass-card" style={{ padding: '1.25rem', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <div style={{ fontSize: '2rem' }}>{r.icon}</div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-3)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px' }}>{r.title}</div>
                  <div style={{ fontSize: '1.1rem', color: 'var(--orange)', fontWeight: 800 }}>{r.val}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-2)' }}>{r.desc}</div>
                </div>
              ))}
            </div>

            {/* Rules and Event Details Split */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem' }}>
              
              {/* Rules List */}
              <div className="glass-card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 900, color: 'var(--orange)', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem', margin: 0 }}>
                  🏐 Official Rules
                </h3>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {[
                    'Teams must include both genders.',
                    'At least one player over 40 years old.',
                    'No age restrictions this year on how young you are.',
                    'Every team must have at least two CCF members.',
                    'Max 8 players per team roster.',
                    '5 players minimum on court, maximum of 6.',
                    'Everyone must play. No ghosting, sandbags, or benchwarmers hiding.',
                    'Matches are best 2 out of 3 sets.',
                    'Sets 1 & 2 are first to 21 points (win by 2).',
                    'Set 3 (if needed) is first to 15 points (win by 2).'
                  ].map((rule, idx) => (
                    <li key={idx} style={{ fontSize: '0.85rem', color: 'var(--text-2)', display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
                      <span style={{ color: 'var(--orange)' }}>🏐</span>
                      <span>{rule}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {isPastRegistrationDeadline ? (
                <div className="glass-card" style={{ padding: '2rem 1.5rem', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', gap: '1rem' }}>
                  <div style={{ fontSize: '3.5rem' }}>🔒</div>
                  <h3 style={{ fontSize: '1.25rem', fontWeight: 900, color: '#fff', margin: 0 }}>Registration Closed</h3>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-2)', lineHeight: 1.6, margin: 0 }}>
                    Team registrations and lunch/beverage orders closed on July 25th, 2026.
                  </p>
                </div>
              ) : (
                <>
                  {/* Team Registration Form */}
                  <div className="glass-card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                    <div>
                      <h3 style={{ fontSize: '1.25rem', fontWeight: 900, color: 'var(--orange)', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem', margin: 0 }}>
                        🏆 Team Registration
                      </h3>
                      <p style={{ fontSize: '0.75rem', color: 'var(--text-2)', marginTop: '0.25rem' }}>
                        Register your team for the Bootaleyzee Cup. Maximum 8 teams total.
                      </p>
                    </div>

                    {tournament.started ? (
                      <div style={{ padding: '.75rem', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '.82rem', color: 'var(--text-2)' }}>
                        ℹ️ Tournament has already started. Registration is closed.
                      </div>
                    ) : teams.length >= 8 ? (
                      <div style={{ padding: '.75rem', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '.82rem', color: 'var(--orange)', fontWeight: 800 }}>
                        🚫 Maximum limit of 8 teams reached!
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <div className="form-group" style={{ margin: 0 }}>
                          <label className="form-label" style={{ fontSize: '0.75rem' }}>Team Name</label>
                          <input 
                            type="text" 
                            className="form-input" 
                            placeholder="E.g., Sandy Spikes" 
                            value={newTeamName}
                            onChange={e => setNewTeamName(e.target.value)} 
                          />
                        </div>

                        <div className="form-group" style={{ margin: 0 }}>
                          <label className="form-label" style={{ fontSize: '0.75rem', marginBottom: '0.5rem', display: 'block' }}>Team Theme Color</label>
                          <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                            {PRESET_COLORS.map(c => (
                              <div 
                                key={c} 
                                onClick={() => setNewTeamColor(c)}
                                style={{ 
                                  width: '24px', 
                                  height: '24px', 
                                  borderRadius: '50%', 
                                  background: c, 
                                  cursor: 'pointer',
                                  border: newTeamColor === c ? '2px solid #fff' : '1px solid rgba(0,0,0,0.3)',
                                  boxShadow: newTeamColor === c ? '0 0 8px rgba(255,255,255,0.5)' : 'none',
                                  transform: newTeamColor === c ? 'scale(1.15)' : 'none',
                                  transition: 'transform 0.1s'
                                }} 
                              />
                            ))}
                          </div>
                        </div>

                        <button 
                          type="button" 
                          className="btn btn-primary w-full"
                          disabled={saving || !newTeamName.trim()}
                          onClick={addTeam}
                        >
                          {saving ? 'Registering...' : 'Register Team'}
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Order Form & Pricing Estimator */}
                  <div className="glass-card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                    <div>
                      <h3 style={{ fontSize: '1.25rem', fontWeight: 900, color: 'var(--orange)', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem', margin: 0 }}>
                        🥪 Team Order Form
                      </h3>
                      <p style={{ fontSize: '0.75rem', color: 'var(--text-2)', marginTop: '0.25rem' }}>
                        Calculate and submit your team's lunch and beverage package. Teams register and order by <strong>July 22nd</strong>.
                      </p>
                    </div>

                    <form onSubmit={submitOrder} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                        <div className="form-group" style={{ margin: 0 }}>
                          <label className="form-label" style={{ fontSize: '0.75rem' }}>Captain Name</label>
                          <input 
                            type="text" 
                            className="form-input" 
                            placeholder="Edmond Ebeid" 
                            value={orderCaptainName}
                            onChange={e => setOrderCaptainName(e.target.value)} 
                            required 
                          />
                        </div>
                        <div className="form-group" style={{ margin: 0 }}>
                          <label className="form-label" style={{ fontSize: '0.75rem' }}>CCF Member #</label>
                          <input 
                            type="text" 
                            className="form-input" 
                            placeholder="E.g., 1947" 
                            value={orderMemberNumber}
                            onChange={e => setOrderMemberNumber(e.target.value)} 
                            required 
                          />
                        </div>
                      </div>

                      {/* Lunch Choice Quantities */}
                      <div style={{ background: 'rgba(255,255,255,0.02)', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border)' }}>
                        <span style={{ fontSize: '0.78rem', fontWeight: 800, color: '#fff', display: 'block', marginBottom: '0.5rem' }}>
                          Boxed Lunches ($10/each)
                        </span>
                        <span style={{ fontSize: '0.68rem', color: 'var(--text-3)', display: 'block', marginBottom: '0.5rem' }}>
                          Includes: Sandwich + Rosemary Chips + Cookie + Bottled Water
                        </span>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                          {[
                            { label: 'Ham Lunch', state: orderHamCount, setter: setOrderHamCount },
                            { label: 'Turkey Lunch', state: orderTurkeyCount, setter: setOrderTurkeyCount },
                            { label: 'Egg Salad Lunch', state: orderEggSaladCount, setter: setOrderEggSaladCount }
                          ].map((item, idx) => (
                            <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ fontSize: '0.8rem', color: 'var(--text-2)' }}>{item.label}</span>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <button type="button" className="btn btn-secondary btn-sm" style={{ padding: '0.1rem 0.4rem' }} onClick={() => item.setter(Math.max(0, item.state - 1))}>-</button>
                                <span style={{ fontSize: '0.85rem', width: '20px', textAlign: 'center', color: '#fff', fontWeight: 800 }}>{item.state}</span>
                                <button type="button" className="btn btn-secondary btn-sm" style={{ padding: '0.1rem 0.4rem' }} onClick={() => item.setter(item.state + 1)}>+</button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Beverage Packages */}
                      <div style={{ background: 'rgba(255,255,255,0.02)', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div>
                            <span style={{ fontSize: '0.78rem', fontWeight: 800, color: '#fff', display: 'block' }}>
                              Beverage Package ($10/pkg)
                            </span>
                            <span style={{ fontSize: '0.68rem', color: 'var(--text-3)' }}>
                              3 drinks package
                            </span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <button type="button" className="btn btn-secondary btn-sm" style={{ padding: '0.1rem 0.4rem' }} onClick={() => setOrderDrinkPackages(Math.max(0, orderDrinkPackages - 1))}>-</button>
                            <span style={{ fontSize: '0.85rem', width: '20px', textAlign: 'center', color: '#fff', fontWeight: 800 }}>{orderDrinkPackages}</span>
                            <button type="button" className="btn btn-secondary btn-sm" style={{ padding: '0.1rem 0.4rem' }} onClick={() => setOrderDrinkPackages(orderDrinkPackages + 1)}>+</button>
                          </div>
                        </div>
                      </div>

                      {/* Pricing Calculation Summary */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0', borderTop: '1px solid var(--border)' }}>
                        <span style={{ fontSize: '0.85rem', color: 'var(--text-2)' }}>Total Cost:</span>
                        <span style={{ fontSize: '1.25rem', fontWeight: 900, color: 'var(--orange)' }}>
                          ${(orderHamCount + orderTurkeyCount + orderEggSaladCount) * 10 + orderDrinkPackages * 10}
                        </span>
                      </div>

                      <button 
                        type="submit" 
                        className="btn btn-primary w-full"
                        disabled={submittingOrder || (!orderHamCount && !orderTurkeyCount && !orderEggSaladCount && !orderDrinkPackages)}
                      >
                        {submittingOrder ? 'Submitting...' : 'Submit Lunch & Drink Order'}
                      </button>
                    </form>
                  </div>
                </>
              )}
            </div>

            {/* Costumes alert & Contact Split */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
              
              <div className="glass-card" style={{ padding: '1.25rem', display: 'flex', alignItems: 'center', gap: '1rem', borderLeft: '4px solid var(--orange)' }}>
                <div style={{ fontSize: '2.25rem' }}>🎭</div>
                <div>
                  <h4 style={{ margin: 0, fontWeight: 900, color: '#fff' }}>Costumes & Flair!</h4>
                  <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-2)' }}>
                    Costumes, team names, and creative flair are strongly encouraged. Bragging rights last all year!
                  </p>
                </div>
              </div>

              <div className="glass-card" style={{ padding: '1.25rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <div style={{ fontSize: '2.25rem' }}>📞</div>
                <div>
                  <h4 style={{ margin: 0, fontWeight: 900, color: '#fff' }}>Contact Organizer</h4>
                  <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-2)' }}>
                    Edmond Ebeid &middot; 703-798-9744 &middot; edebeid@gmail.com
                  </p>
                </div>
              </div>

            </div>

          </div>
        )}

        {/* ══════════════════════════════
            DASHBOARD
            ══════════════════════════════ */}
        {view==='dashboard' && (
          <div className="view active">
            <div className="view-header">
              <div>
                <h1 className="view-title">Live Scoreboard</h1>
                <div className="view-subtitle">{match ? matchLabel(match) : 'No active match'}</div>
              </div>
              {isAdmin && (
                <div className="view-actions">
                  {tournament.started && (
                    <button className="btn btn-secondary" onClick={()=>setModal('selectMatch')}>Select Match</button>
                  )}
                  <button
                    className={`btn ${tournament.started?'btn-danger':'btn-primary'}`}
                    onClick={()=>{ if(tournament.started) setModal('confirmReset'); else startTournament(); }}
                  >
                    {tournament.started ? 'Reset Tournament' : 'Start Tournament'}
                  </button>
                </div>
              )}
            </div>

            {/* Champion */}
            {tournament.champion && champObj && (
              <div className="champion-banner">
                <div className="glass-card champion-inner">
                  <div className="champ-trophy">🏆</div>
                  <div className="champ-title">{champObj.name}</div>
                  <div className="champ-sub">Tournament Champion!</div>
                  <button className="btn btn-secondary" onClick={()=>setModal('confirmReset')}>New Tournament</button>
                </div>
              </div>
            )}

            {/* No match selected */}
            {!tournament.champion && !match && (
              <div className="empty-state">
                <div className="empty-icon">🏐</div>
                <p>
                  {!tournament.started
                    ? 'Add at least 2 teams and start the tournament!'
                    : avail.length
                      ? `${avail.length} match${avail.length>1?'es':''} ready — select one to score.`
                      : 'Waiting for matches to be set…'}
                </p>
                {tournament.started && avail.length>0 && (
                  <button className="btn btn-primary" onClick={()=>setModal('selectMatch')}>Select Match</button>
                )}
              </div>
            )}

            {/* Scoreboard */}
            {!tournament.champion && match && (
              <>
                <div id="matchBanner" className="glass-card match-banner">
                  <span style={{ fontWeight:800,fontSize:'.9rem' }}>{matchLabel(match)}</span>
                  <span className="match-banner-badge">{match.bracket}</span>
                </div>

                <div className="glass-card scoreboard" style={{ boxShadow:'0 0 40px rgba(249,115,22,0.12),0 8px 32px rgba(0,0,0,0.5)' }}>
                  {/* Team 1 */}
                  <div className="team-side">
                    <div className="team-avatar-ring" style={{ borderColor:t1Obj?.color||'var(--orange)', background:t1Obj?.avatarDataUrl?'transparent':hexToRgba(t1Obj?.color||'#f97316',0.15) }}>
                      {t1Obj?.avatarDataUrl
                        ? <img src={t1Obj.avatarDataUrl} alt={t1Obj.name} style={{ width:'100%',height:'100%',objectFit:'cover',borderRadius:'50%' }} />
                        : <div className="team-initial" style={{ color:t1Obj?.color||'var(--orange)' }}>{t1Obj?.name?.charAt(0)?.toUpperCase()||'?'}</div>
                      }
                    </div>
                    <div className="team-name-display">{t1Obj?.name||'TBD'}</div>
                    <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--orange)', marginTop: '0.25rem' }}>
                      Sets: {match.setsWon[0]}
                    </div>
                    <div className="sets-indicator">
                      <div className={`set-pip${match.setsWon[0]>0?' won':''}`}/>
                      <div className={`set-pip${match.setsWon[0]>1?' won':''}`}/>
                    </div>
                    <div id="score1" className="score-big">{set.t1}</div>
                    {isAdmin && (
                      <div className="score-btns">
                        <button className="sbtn minus" onClick={()=>adjustScore(0,-1)}>−</button>
                        <button className="sbtn plus"  onClick={()=>adjustScore(0,+1)}>+</button>
                      </div>
                    )}
                  </div>

                  {/* Centre */}
                  <div className="sb-center">
                    <div className="vs-badge">VS</div>
                    <div className="set-num-wrap">
                      <div className="set-num-label">SET</div>
                      <div className="set-num">{match.currentSet+1}</div>
                    </div>
                    <div className="set-history" style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', alignItems: 'center' }}>
                      <div style={{ fontWeight: 800, color: 'var(--orange)', fontSize: '1rem', marginBottom: '0.2rem' }}>
                        Sets: {match.setsWon[0]} – {match.setsWon[1]}
                      </div>
                      {match.sets.map((s,i)=>(
                        <div key={i} style={i === match.currentSet ? { color: '#fff', fontWeight: 700 } : { opacity: 0.6 }}>
                          Set {i+1}: {s.t1}–{s.t2} {i === match.currentSet ? '(Live)' : ''}
                        </div>
                      ))}
                    </div>
                    <div className="target-info">First to {match.currentSet===2?(tournament.set3TargetPoints || 15):(tournament.setTargetPoints || 21)} · Win by {WIN_BY}</div>
                  </div>

                  {/* Team 2 */}
                  <div className="team-side">
                    <div className="team-avatar-ring" style={{ borderColor:t2Obj?.color||'var(--cyan)', background:t2Obj?.avatarDataUrl?'transparent':hexToRgba(t2Obj?.color||'#22d3ee',0.15) }}>
                      {t2Obj?.avatarDataUrl
                        ? <img src={t2Obj.avatarDataUrl} alt={t2Obj.name} style={{ width:'100%',height:'100%',objectFit:'cover',borderRadius:'50%' }} />
                        : <div className="team-initial" style={{ color:t2Obj?.color||'var(--cyan)' }}>{t2Obj?.name?.charAt(0)?.toUpperCase()||'?'}</div>
                      }
                    </div>
                    <div className="team-name-display">{t2Obj?.name||'TBD'}</div>
                    <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--cyan)', marginTop: '0.25rem' }}>
                      Sets: {match.setsWon[1]}
                    </div>
                    <div className="sets-indicator">
                      <div className={`set-pip${match.setsWon[1]>0?' won':''}`}/>
                      <div className={`set-pip${match.setsWon[1]>1?' won':''}`}/>
                    </div>
                    <div id="score2" className="score-big">{set.t2}</div>
                    {isAdmin && (
                      <div className="score-btns">
                        <button className="sbtn minus" onClick={()=>adjustScore(1,-1)}>−</button>
                        <button className="sbtn plus"  onClick={()=>adjustScore(1,+1)}>+</button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Live chart */}
                <div className="glass-card chart-card">
                  <div className="chart-card-header">
                    <h3 className="chart-title">Current Set — Point Comparison</h3>
                  </div>
                  <canvas ref={liveChartRef} />
                </div>
              </>
            )}
          </div>
        )}

        {/* ══════════════════════════════
            BRACKET
            ══════════════════════════════ */}
        {view==='bracket' && (
          <div className="view active">
            <div className="view-header">
              <div>
                <h1 className="view-title">Tournament Bracket</h1>
                <div className="view-subtitle">Double Elimination · Best of 3 Sets</div>
              </div>
              <div className="bracket-legend">
                <span className="leg winners">Winners</span>
                <span className="leg losers">Losers</span>
                <span className="leg gf">Grand Final</span>
              </div>
            </div>

            <div id="bracketWrap" className="bracket-container">
              {!tournament.started ? (
                <div className="empty-state">
                  <div className="empty-icon">🏆</div>
                  <p>{isAdmin ? 'Start the tournament to generate the bracket.' : 'Waiting for the admin to start the tournament.'}</p>
                  {isAdmin && <button className="btn btn-primary" onClick={startTournament}>Start Tournament</button>}
                </div>
              ) : (
                <>
                  {/* Winners */}
                  {wb.length>0 && <BracketSection title="Winners Bracket" labelClass="wb" rounds={wb} matchClass="wb-match" activeId={tournament.activeMatchId} onSelect={selectMatch} teams={teams} />}
                  {/* Losers */}
                  {lb.length>0 && <BracketSection title="Losers Bracket"  labelClass="lb" rounds={lb} matchClass="lb-match" activeId={tournament.activeMatchId} onSelect={selectMatch} teams={teams} />}
                  {/* GF */}
                  {gf && (
                    <div className="bracket-section">
                      <div className="bracket-section-label gf-label">🏆 Grand Final</div>
                      <div className="bracket-row">
                        <div className="bracket-col">
                          <BracketMatchCard m={gf} cls="gf-match" activeId={tournament.activeMatchId} onSelect={selectMatch} teams={teams} />
                        </div>
                      </div>
                    </div>
                  )}
                  {/* GFR */}
                  {gfr && (
                    <div className="bracket-section">
                      <div className="bracket-section-label gf-label">🔥 Grand Final Reset</div>
                      <div className="bracket-row">
                        <div className="bracket-col">
                          <BracketMatchCard m={gfr} cls="gfr-match" activeId={tournament.activeMatchId} onSelect={selectMatch} teams={teams} />
                        </div>
                      </div>
                    </div>
                  )}
                  {/* Champion */}
                  {champObj && (
                    <div className="bracket-section">
                      <div style={{ display:'flex',alignItems:'center',gap:'.75rem',padding:'.75rem 1.1rem',background:'var(--orange-dim)',border:'1px solid rgba(249,115,22,.3)',borderRadius:'12px',fontWeight:800,color:'var(--orange)' }}>
                        🏆 Tournament Champion: {champObj.name}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {/* ══════════════════════════════
            TEAMS
            ══════════════════════════════ */}
        {view==='teams' && (
          <div className="view active">
            <div className="view-header">
              <div>
                <h1 className="view-title">Teams & Rosters</h1>
                <div className="view-subtitle" id="teamCountLabel">{teams.length} team{teams.length!==1?'s':''} registered</div>
              </div>
              <div className="view-actions">
                {isAdmin && !tournament.started && <button id="addTeamBtn" className="btn btn-primary" onClick={()=>{ setNewTeamName(''); setNewTeamColor(PRESET_COLORS[teams.length%PRESET_COLORS.length]); setNewTeamAvatar(''); setModal('addTeam'); }}>＋ Add Team</button>}
              </div>
            </div>

            {teams.length===0 ? (
              <div className="empty-state">
                <div className="empty-icon">🏐</div>
                <p>No teams yet — add between 2 and 8 teams to get started.</p>
                {isAdmin && <button className="btn btn-primary" onClick={()=>{ setNewTeamName(''); setNewTeamColor(PRESET_COLORS[0]); setNewTeamAvatar(''); setModal('addTeam'); }}>＋ Add Your First Team</button>}
              </div>
            ) : (
              <div className="teams-grid">
                {teams.map(team => (
                  <div key={team.id} className="team-card">
                    <div className="tc-header">
                      <div className="tc-badge-wrap" title={isAdmin ? "Click to change logo" : ""} onClick={isAdmin ? ()=>{
                        const inp = document.getElementById(`teamLogo-${team.id}`);
                        if (inp) inp.click();
                      } : undefined}>
                        {team.avatarDataUrl
                          ? <img src={team.avatarDataUrl} className="tc-logo-img" alt={team.name} />
                          : <div className="tc-badge" style={{ background:team.color,width:'100%',height:'100%',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'1.2rem',fontWeight:900,color:'#fff',borderRadius:'12px' }}>{team.name.charAt(0)}</div>
                        }
                        {isAdmin && <div className="tc-avatar-overlay"><span style={{ fontSize:'.9rem' }}>📷</span><span>Logo</span></div>}
                        {isAdmin && (
                          <input type="file" id={`teamLogo-${team.id}`} accept="image/*" hidden onChange={e=>{
                            const file=e.target.files[0]; if(!file) return;
                            const reader=new FileReader();
                            reader.onload=ev=>updateTeamAvatar(team.id, ev.target.result);
                            reader.readAsDataURL(file);
                          }} />
                        )}
                      </div>
                      <div className="tc-info">
                        {editingTeamId === team.id ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '.4rem' }}>
                            <input
                              className="form-input"
                              style={{ padding: '.25rem .5rem', fontSize: '.85rem', width: '120px', minHeight: 'auto', height: '30px' }}
                              value={editingTeamName}
                              onChange={e => setEditingTeamName(e.target.value)}
                              onKeyDown={e => {
                                if (e.key === 'Enter') saveTeamName(team.id);
                                if (e.key === 'Escape') setEditingTeamId(null);
                              }}
                              autoFocus
                            />
                            <button className="btn btn-sm btn-primary" style={{ padding: '.2rem .45rem', height: '30px' }} onClick={() => saveTeamName(team.id)}>✓</button>
                            <button className="btn btn-sm btn-secondary" style={{ padding: '.2rem .45rem', height: '30px' }} onClick={() => setEditingTeamId(null)}>✕</button>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '.45rem' }}>
                            <div className="tc-name">{team.name}</div>
                            {isAdmin && (
                              <button
                                style={{ background: 'none', border: 'none', cursor: 'pointer', opacity: 0.6, fontSize: '.8rem', padding: 0 }}
                                onClick={() => {
                                  setEditingTeamId(team.id);
                                  setEditingTeamName(team.name);
                                }}
                                title="Edit team name"
                              >
                                ✏️
                              </button>
                            )}
                          </div>
                        )}
                        <div className="tc-meta">
                          {tournament.started ? `${team.stats.wins}W–${team.stats.losses}L · ${team.stats.pointsFor} pts` : `${team.players.length} player${team.players.length!==1?'s':''}`}
                        </div>
                      </div>
                      {isAdmin && !tournament.started && (
                        <div className="tc-actions">
                          <button className="btn btn-sm btn-danger" onClick={()=>deleteTeam(team.id)}>✕</button>
                        </div>
                      )}
                    </div>
                    <div className="tc-roster">
                      {team.players.length===0 && <div className="empty-roster">No players — add some!</div>}
                      {team.players.map(p=>(
                        <div key={p.id} className="roster-item">
                          <img className="r-avatar" src={p.avatarDataUrl||PLAYER_AVATAR} alt={p.name} />
                          <div className="r-num">{p.number?'#'+p.number:'—'}</div>
                          <div className="r-name">{p.name}</div>
                          {isAdmin && (
                            <div className="player-actions" style={{ marginLeft:'auto', display:'flex', gap:'.35rem' }}>
                              <button
                                className="btn btn-sm btn-secondary"
                                style={{ padding:'.2rem .45rem', display:'flex', alignItems:'center', justifyContent:'center' }}
                                onClick={() => {
                                  setAddPlayerTeamId(team.id);
                                  setEditingPlayerId(p.id);
                                  setNewPlayerName(p.name);
                                  setNewPlayerNum(p.number || '');
                                  setNewPlayerAvatar(p.avatarDataUrl || '');
                                  setModal('editPlayer');
                                }}
                                title="Edit Player"
                              >
                                ✏️
                              </button>
                              <button
                                className="btn btn-sm btn-danger"
                                style={{ padding:'.2rem .45rem', display:'flex', alignItems:'center', justifyContent:'center' }}
                                onClick={() => deletePlayer(team.id, p.id)}
                                title="Delete Player"
                              >
                                ✕
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                      {isAdmin && (
                        <button className="add-player-row" onClick={()=>{ setAddPlayerTeamId(team.id); setNewPlayerName(''); setNewPlayerNum(''); setNewPlayerAvatar(''); setModal('addPlayer'); }}>＋ Add Player</button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════
            STATS
            ══════════════════════════════ */}
        {view==='stats' && (
          <div className="view active">
            <div className="view-header">
              <h1 className="view-title">Statistics</h1>
            </div>
            <div className="stats-layout">
              <div className="glass-card chart-card">
                <div className="chart-card-header"><h3 className="chart-title">Points Scored</h3></div>
                <canvas ref={el=>{ if(el && teams.length>0) setTimeout(()=>drawStatsChart(el,'pointsFor'),0); }} />
              </div>
              <div className="glass-card chart-card">
                <div className="chart-card-header"><h3 className="chart-title">Match Wins</h3></div>
                <canvas ref={el=>{ if(el && teams.length>0) setTimeout(()=>drawStatsChart(el,'wins'),0); }} />
              </div>
            </div>
            {teams.length>0 && (
              <div className="glass-card chart-card">
                <div className="chart-card-header"><h3 className="chart-title">Team Statistics</h3></div>
                <div className="stats-table-wrap">
                  <table className="stats-table">
                    <thead><tr><th>Team</th><th>Players</th><th>W</th><th>L</th><th>Sets W</th><th>Sets L</th><th>Pts For</th><th>Pts Vs</th></tr></thead>
                    <tbody>
                      {teams.map(t=>(
                        <tr key={t.id}>
                          <td><div className="team-cell"><div className="tc-dot" style={{ background:t.color }}></div>{t.name}</div></td>
                          <td>{t.players.length}</td>
                          <td>{t.stats.wins}</td><td>{t.stats.losses}</td>
                          <td>{t.stats.setsWon}</td><td>{t.stats.setsLost}</td>
                          <td>{t.stats.pointsFor}</td><td>{t.stats.pointsAgainst}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════
            SCHEDULE
            ══════════════════════════════ */}
        {view==='history' && (
          <div className="view active" style={{ display:'flex',flexDirection:'column',gap:'1.5rem' }}>
            <div>
              <h2 style={{ fontSize: '1.75rem', fontWeight: 900, color: 'var(--orange)', margin: 0 }}>📜 Tournament History</h2>
              <p style={{ fontSize: '.9rem', color: 'var(--text-2)', marginTop: '.25rem' }}>View past champions, standings, and brackets from previous years.</p>
            </div>

            {archives.length === 0 ? (
              <div className="glass-card" style={{ padding: '3rem 1.5rem', textAlign: 'center', color: 'var(--text-2)' }}>
                <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📜</div>
                <h3 style={{ fontWeight: 800, color: '#fff', fontSize: '1.2rem' }}>No Archived Tournaments</h3>
                <p style={{ fontSize: '0.85rem', marginTop: '0.25rem', opacity: 0.6 }}>When a tournament is reset, you can choose to archive it here.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                {archives.map(arch => {
                  const dateStr = new Date(arch.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
                  return (
                    <div key={arch.id} className="glass-card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                        <div>
                          <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#fff', margin: 0 }}>{arch.name}</h3>
                          <span style={{ fontSize: '0.78rem', color: 'var(--text-3)', fontWeight: 600 }}>Archived on {dateStr}</span>
                        </div>
                        
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(255,255,255,0.03)', padding: '0.35rem 0.85rem', borderRadius: '50px', border: '1px solid var(--border)' }}>
                            <span style={{ fontSize: '0.78rem', color: 'var(--text-2)', fontWeight: 600 }}>Winner:</span>
                            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: arch.championColor }} />
                            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--orange)' }}>{arch.championName}</span>
                          </div>
                          
                          <button 
                            className="btn btn-sm btn-primary" 
                            onClick={() => {
                              setSelectedArchive(arch);
                              setModal('viewArchiveDetail');
                            }}
                          >
                            View details
                          </button>

                          {isAdmin && (
                            <button 
                              className="btn btn-sm btn-danger" 
                              style={{ padding: '0.35rem 0.75rem', fontSize: '0.78rem' }}
                              onClick={async () => {
                                if (window.confirm("Are you sure you want to delete this tournament archive permanently?")) {
                                  try {
                                    await apiFetch(`/api/tournament/archive?id=${arch.id}`, { method: 'DELETE' });
                                    const newArchs = await apiFetch('/api/tournament/archive');
                                    setArchives(newArchs);
                                    showToast('Archive deleted', 'info');
                                  } catch (e) {
                                    showToast('Delete failed', 'error');
                                  }
                                }
                              }}
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {view==='photos' && (
          <div className="view active" style={{ display:'flex',flexDirection:'column',gap:'1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
              <div>
                <h2 style={{ fontSize: '1.75rem', fontWeight: 900, color: 'var(--orange)', margin: 0 }}>📷 Photo Gallery</h2>
                <p style={{ fontSize: '.9rem', color: 'var(--text-2)', marginTop: '.25rem' }}>Share and view live event photos from the tournament.</p>
              </div>
              <div>
                <button 
                  className="btn btn-primary" 
                  disabled={uploadingPhoto}
                  onClick={() => document.getElementById('galleryPhotoInput').click()}
                >
                  {uploadingPhoto ? 'Uploading...' : '📤 Upload Photo'}
                </button>
                <input 
                  type="file" 
                  id="galleryPhotoInput" 
                  accept="image/*" 
                  hidden 
                  onChange={handlePhotoUpload} 
                />
              </div>
            </div>

            {photos.length === 0 ? (
              <div className="glass-card" style={{ padding: '4rem 1.5rem', textAlign: 'center', color: 'var(--text-2)' }}>
                <div style={{ fontSize: '3.5rem', marginBottom: '1rem' }}>📷</div>
                <h3 style={{ fontWeight: 800, color: '#fff', fontSize: '1.2rem' }}>No Photos Yet</h3>
                <p style={{ fontSize: '0.85rem', marginTop: '0.25rem', opacity: 0.6 }}>Be the first to upload a photo from the courts!</p>
              </div>
            ) : (
              <div className="photos-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1.25rem' }}>
                {photos.map(p => (
                  <div key={p.id} className="glass-card photo-card" style={{ padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', position: 'relative', overflow: 'hidden' }}>
                    <div style={{ width: '100%', aspectRatio: '4/3', borderRadius: '8px', overflow: 'hidden', background: '#000' }}>
                      <img 
                        src={p.dataUrl} 
                        alt="Tournament snapshot" 
                        style={{ width: '100%', height: '100%', objectFit: 'cover', cursor: 'pointer' }}
                        onClick={() => window.open(p.dataUrl, '_blank')} 
                        title="Click to view full screen"
                      />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 0.25rem' }}>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>
                        Uploaded {new Date(p.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      {isAdmin && (
                        <button 
                          className="btn btn-sm btn-danger" 
                          style={{ padding: '0.2rem 0.5rem', fontSize: '0.72rem' }}
                          onClick={() => deletePhoto(p.id)}
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════
            SCHEDULE
            ══════════════════════════════ */}
        {view==='schedule' && (
          <div className="view active">
            <div className="view-header">
              <div>
                <h1 className="view-title">Tournament Schedule</h1>
                <div className="view-subtitle">Match times and chronological order of events</div>
              </div>
            </div>

            {!tournament.started || !bracket ? (
              <div className="empty-state">
                <div className="empty-icon">📅</div>
                <p>Start the tournament to generate a schedule of events.</p>
              </div>
            ) : (
              <>
                {/* Timeline */}
                <div className="timeline">
                  {(() => {
                    const matchesToSchedule = allMatches
                      .filter(m => !(m.complete && m.sets.length === 0 && (!m.team1 || !m.team2)))
                      .sort((a, b) => a.id - b.id);

                    if (matchesToSchedule.length === 0) {
                      return <div className="empty-state"><p>No matches to display in the schedule.</p></div>;
                    }

                    return matchesToSchedule.map((m, idx) => {
                      const isActive = m.id === tournament.activeMatchId;
                      const timeStr = getMatchTime(bracket.startTime || "10:00", bracket.matchDuration || 25, idx);
                      
                      const t1 = teams.find(t => t.id === m.team1);
                      const t2 = teams.find(t => t.id === m.team2);

                      const canScore = isAdmin && !m.complete && m.team1 && m.team2;

                      return (
                        <div key={m.id} className="timeline-item">
                          <div className="timeline-time">
                            <div>{timeStr}</div>
                            <div style={{ fontSize: '0.65rem', fontWeight: 600, color: 'var(--text-3)', marginTop: '0.2rem' }}>Match {m.id}</div>
                          </div>
                          <div className="timeline-content">
                            <div className="timeline-match-title">{matchLabel(m)}</div>
                            <div className="timeline-teams">
                              <span style={t1 ? { color: t1.color } : { opacity: 0.5 }}>{t1 ? t1.name : 'TBD'}</span>
                              <span style={{ margin: '0 0.5rem', opacity: 0.4 }}>vs</span>
                              <span style={t2 ? { color: t2.color } : { opacity: 0.5 }}>{t2 ? t2.name : 'TBD'}</span>
                            </div>
                            {m.sets.length > 0 && (
                              <div style={{ fontSize: '0.8rem', color: 'var(--text-2)', marginTop: '0.15rem' }}>
                                <span style={{ fontWeight: 600, color: m.complete ? 'var(--text-3)' : 'var(--orange)' }}>
                                  {m.complete ? 'Result: ' : 'Live: '}
                                </span>
                                <span style={{ fontWeight: 700, color: 'var(--text-1)' }}>{m.setsWon[0]} – {m.setsWon[1]}</span>
                                <span style={{ opacity: 0.5, fontSize: '0.75rem', marginLeft: '0.5rem' }}>
                                  ({m.sets.map((s, idx) => {
                                    const isLive = !m.complete && idx === m.currentSet;
                                    return `${s.t1}-${s.t2}${isLive ? '*' : ''}`;
                                  }).join(', ')})
                                </span>
                              </div>
                            )}
                          </div>
                          <div className="timeline-status">
                            {m.complete ? (
                              <span className="badge badge-completed">Completed</span>
                            ) : isActive ? (
                              <span className="badge badge-progress">Live</span>
                            ) : (
                              <span className="badge badge-scheduled">Scheduled</span>
                            )}

                            {canScore && (
                              <button
                                className="btn btn-sm btn-primary"
                                style={{ padding: '0.35rem 0.6rem' }}
                                onClick={async () => {
                                  const newTourn = { ...tournament, activeMatchId: m.id };
                                  setTournament(newTourn);
                                  await saveTournament(newTourn);
                                  setView('dashboard');
                                  showToast(`Match ${m.id} is now active!`, 'success');
                                }}
                              >
                                Score
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>
              </>
            )}
          </div>
        )}

        {/* ══════════════════════════════
            PROFILE
            ══════════════════════════════ */}
        {view==='profile' && (
          <div className="view active">
            <div className="view-header">
              <h1 className="view-title">Profile</h1>
            </div>
            <div className="glass-card profile-card">
              <div className="profile-avatar-section">
                <div className="profile-avatar-wrap" onClick={()=>document.getElementById('avatarFileInput').click()}>
                  <img className="profile-avatar-img" src={profile.avatarDataUrl||session?.user?.image||DEFAULT_AVATAR} alt="Your avatar" />
                  <div className="avatar-overlay"><span className="avatar-overlay-icon">📷</span><span>Change Photo</span></div>
                </div>
                <input type="file" id="avatarFileInput" accept="image/*" hidden onChange={e=>{
                  const file=e.target.files[0]; if(!file) return;
                  const reader=new FileReader();
                  reader.onload=ev=>setProfile(p=>({ ...p, avatarDataUrl:ev.target.result }));
                  reader.readAsDataURL(file);
                }} />
              </div>
              <div className="profile-fields">
                <div className="form-group">
                  <label className="form-label">Display Name</label>
                  <input className="form-input" value={profile.name} onChange={e=>setProfile(p=>({...p,name:e.target.value}))} onKeyDown={e=>e.key==='Enter'&&saveProfile()} placeholder="Your name" />
                </div>
                <div className="form-group">
                  <label className="form-label">Email</label>
                  <input className="form-input" value={session?.user?.email||''} disabled style={{ opacity:.5 }} />
                </div>
                <div style={{ display:'flex',gap:'.65rem',flexWrap:'wrap' }}>
                  <button className="btn btn-primary" onClick={saveProfile}>Save Profile</button>
                  <button className="btn btn-secondary" onClick={()=>signOut({ callbackUrl:'/auth/signin' })}>Sign Out</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════
            SETTINGS
            ══════════════════════════════ */}
        {view==='settings' && (
          <div className="view active">
            <div className="view-header">
              <div>
                <h1 className="view-title">Settings</h1>
                <div className="view-subtitle">Configure tournament parameters and data management</div>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', maxWidth: '600px' }}>
              
              {/* Game Length Settings */}
              <div className="glass-card" style={{ padding: '1.75rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--orange)', margin: 0 }}>🏐 Game Length Settings</h3>
                <p style={{ fontSize: '.85rem', color: 'var(--text-2)', lineHeight: 1.5, margin: 0 }}>
                  Adjust target points so that gameplay fits your schedule (e.g. 10:00 AM – 6:00 PM).
                </p>

                {tournament.started ? (
                  <div style={{ padding: '.75rem', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '.85rem', color: 'var(--text-2)' }}>
                    ⚠️ Game length settings cannot be changed while a tournament is in progress. Reset the tournament to change these settings.
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label" style={{ fontSize: '.78rem' }}>Sets 1 & 2 Target</label>
                      <div style={{ display: 'flex', gap: '.5rem', marginTop: '.35rem' }}>
                        {[15, 21, 25].map(pts => (
                          <button
                            key={pts}
                            className={`btn btn-sm ${tournament.setTargetPoints === pts ? 'btn-primary' : 'btn-secondary'}`}
                            style={{ flex: 1, padding: '.45rem .25rem', minWidth: 0 }}
                            onClick={async () => {
                              const newTourn = { ...tournament, setTargetPoints: pts };
                              setTournament(newTourn);
                              await saveTournament(newTourn);
                              showToast(`Sets 1 & 2 target set to ${pts} points.`, 'success');
                            }}
                          >
                            {pts} Pts
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label" style={{ fontSize: '.78rem' }}>Set 3 Target</label>
                      <div style={{ display: 'flex', gap: '.5rem', marginTop: '.35rem' }}>
                        {[15, 21].map(pts => (
                          <button
                            key={pts}
                            className={`btn btn-sm ${tournament.set3TargetPoints === pts ? 'btn-primary' : 'btn-secondary'}`}
                            style={{ flex: 1, padding: '.45rem .25rem', minWidth: 0 }}
                            onClick={async () => {
                              const newTourn = { ...tournament, set3TargetPoints: pts };
                              setTournament(newTourn);
                              await saveTournament(newTourn);
                              showToast(`Set 3 target set to ${pts} points.`, 'success');
                            }}
                          >
                            {pts} Pts
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Schedule & Duration Settings */}
              <div className="glass-card" style={{ padding: '1.75rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--orange)', margin: 0 }}>📅 Schedule & Duration Settings</h3>
                <p style={{ fontSize: '.85rem', color: 'var(--text-2)', lineHeight: 1.5, margin: 0 }}>
                  Configure the start time of the first match and the estimated duration for each match.
                </p>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label" style={{ fontSize: '.78rem' }}>Event Start Time</label>
                    <input
                      type="time"
                      className="form-input"
                      style={{ marginTop: '.35rem' }}
                      value={bracket?.startTime || "10:00"}
                      disabled={!tournament.started}
                      onChange={async (e) => {
                        const newBracket = { ...bracket, startTime: e.target.value };
                        const newTourn = { ...tournament, bracketJson: newBracket };
                        setTournament(newTourn);
                        await saveTournament(newTourn);
                      }}
                    />
                  </div>

                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label" style={{ fontSize: '.78rem' }}>Match Duration</label>
                    <select
                      className="form-input"
                      style={{ marginTop: '.35rem', background: '#0d1530', color: '#f0f4ff', border: '1px solid rgba(255,255,255,0.12)', height: '42px', padding: '0 0.75rem', borderRadius: '8px' }}
                      value={bracket?.matchDuration || 25}
                      disabled={!tournament.started}
                      onChange={async (e) => {
                        const newBracket = { ...bracket, matchDuration: Number(e.target.value) };
                        const newTourn = { ...tournament, bracketJson: newBracket };
                        setTournament(newTourn);
                        await saveTournament(newTourn);
                      }}
                    >
                      <option value={20}>20 Minutes</option>
                      <option value={25}>25 Minutes</option>
                      <option value={30}>30 Minutes</option>
                    </select>
                  </div>
                </div>

                {!tournament.started && (
                  <div style={{ padding: '.75rem', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '.85rem', color: 'var(--text-2)' }}>
                    ℹ️ Start the tournament to enable schedule settings.
                  </div>
                )}
              </div>

              {/* Auto Populate Teams & Rosters */}
              <div className="glass-card" style={{ padding: '1.75rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--orange)', margin: 0 }}>👥 Auto Populate Teams</h3>
                <p style={{ fontSize: '.85rem', color: 'var(--text-2)', lineHeight: 1.5, margin: 0 }}>
                  Instantly generate mock teams with rosters to test layouts or start the tournament immediately.
                </p>

                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                  <div className="form-group" style={{ marginBottom: 0, display: 'flex', alignItems: 'center', gap: '.5rem' }}>
                    <label className="form-label" style={{ marginBottom: 0 }}>Number of Teams:</label>
                    <select 
                      className="form-input" 
                      style={{ width: '100px', height: '38px', minHeight: 'auto', padding: '0 .5rem', background: 'rgba(255,255,255,0.04)', color: '#fff', border: '1px solid var(--border)', borderRadius: '6px' }}
                      value={autoTeamCount}
                      onChange={e => setAutoTeamCount(parseInt(e.target.value, 10))}
                    >
                      {[2, 3, 4, 5, 6, 7, 8].map(n => (
                        <option key={n} value={n} style={{ background: '#0b1028' }}>{n} Teams</option>
                      ))}
                    </select>
                  </div>

                  <button 
                    className="btn btn-primary" 
                    disabled={saving}
                    onClick={() => {
                      if (window.confirm(`This will delete any existing teams and replace them with ${autoTeamCount} default teams. Do you want to continue?`)) {
                        populateDefaultTeams();
                      }
                    }}
                  >
                    {saving ? 'Generating...' : 'Generate Teams & Rosters'}
                  </button>
                </div>
              </div>

              {/* Food & Beverage Orders list */}
              <div className="glass-card" style={{ padding: '1.75rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--orange)', margin: 0 }}>🥪 Team Food & Beverage Orders</h3>
                  {orders.length > 0 && (
                    <button 
                      className="btn btn-sm btn-danger" 
                      style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem' }}
                      onClick={async () => {
                        if (window.confirm("Are you sure you want to clear all team orders?")) {
                          try {
                            await apiFetch('/api/orders', { method: 'DELETE' });
                            setOrders([]);
                            showToast("All orders cleared", "info");
                          } catch (e) {
                            showToast("Failed to clear orders", "error");
                          }
                        }
                      }}
                    >
                      Clear All
                    </button>
                  )}
                </div>

                {orders.length === 0 ? (
                  <p style={{ fontSize: '.85rem', color: 'var(--text-3)', margin: 0 }}>
                    No team orders submitted yet.
                  </p>
                ) : (
                  <div className="table-responsive">
                    <table className="stats-table">
                      <thead>
                        <tr>
                          <th>Captain (Member #)</th>
                          <th>Ham</th>
                          <th>Turkey</th>
                          <th>Egg Salad</th>
                          <th>Drinks Pkg</th>
                          <th>Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {orders.map((ord) => (
                          <tr key={ord.id}>
                            <td>
                              <div style={{ fontWeight: 700, color: '#fff' }}>{ord.captainName}</div>
                              <div style={{ fontSize: '0.7rem', color: 'var(--text-3)' }}>#{ord.memberNumber}</div>
                            </td>
                            <td>{ord.hamCount}</td>
                            <td>{ord.turkeyCount}</td>
                            <td>{ord.eggSaladCount}</td>
                            <td>{ord.drinkPackages}</td>
                            <td style={{ fontWeight: 800, color: 'var(--orange)' }}>
                              ${(ord.hamCount + ord.turkeyCount + ord.eggSaladCount) * 10 + ord.drinkPackages * 10}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Data Actions */}
              <div className="glass-card" style={{ padding: '1.75rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--red)', margin: 0 }}>⚠️ Danger Zone</h3>
                <p style={{ fontSize: '.85rem', color: 'var(--text-2)', lineHeight: 1.5, margin: 0 }}>
                  Destructive actions that clear your data.
                </p>

                <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                  {tournament.started && (
                    <button className="btn btn-danger" onClick={() => setModal('confirmReset')}>
                      Reset Tournament (Clear Scores)
                    </button>
                  )}

                  <button 
                    className="btn btn-danger" 
                    onClick={() => {
                      if (window.confirm("Are you sure you want to delete all registered teams? This will clear all team history and rosters.")) {
                        clearAllTeams();
                      }
                    }}
                  >
                    Clear All Teams
                  </button>
                </div>
              </div>

            </div>
          </div>
        )}

      </main>

      {/* ── Footer ── */}
      <footer style={{ padding: '2rem 1.25rem 3.5rem', borderTop: '1px solid var(--border)', textAlign: 'center', fontSize: '0.78rem', color: 'var(--text-3)', background: 'rgba(6,9,26,0.2)' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', justifyContent: 'center', alignItems: 'center' }}>
          <span>v1.0 &middot; Bootaleyzee Cup</span>
          <span style={{ opacity: 0.3 }}>|</span>
          <span>
            Developed by{' '}
            <a
              href="https://blueechostudios.com"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: 'var(--orange)', textDecoration: 'none', fontWeight: 600 }}
              onMouseEnter={e => e.currentTarget.style.textDecoration = 'underline'}
              onMouseLeave={e => e.currentTarget.style.textDecoration = 'none'}
            >
              blueechostudios.com
            </a>
          </span>
        </div>
      </footer>

      {/* ══════════════════════════════
          MODALS
          ══════════════════════════════ */}

      {/* Add Team */}
      <div className={`modal-overlay${modal==='addTeam'?' open':''}`} onClick={e=>{ if(e.target===e.currentTarget) setModal(null); }}>
        <div className="modal">
          <div className="modal-header">
            <h2 className="modal-title">Add New Team</h2>
            <button className="modal-close" onClick={()=>setModal(null)}>✕</button>
          </div>
          <div className="modal-body">
            {/* Logo upload */}
            <div style={{ display:'flex',justifyContent:'center' }}>
              <div className="team-logo-upload" onClick={()=>document.getElementById('newTeamAvatarInput').click()}>
                <img id="newTeamAvatarPreviewEl" src={newTeamAvatar||''} alt="Logo preview" className={`team-logo-preview${newTeamAvatar?' has-image':''}`} />
                <div className="team-logo-overlay"><span style={{ fontSize:'1.1rem' }}>📷</span><span>Upload Logo</span></div>
              </div>
              <input type="file" id="newTeamAvatarInput" accept="image/*" hidden onChange={e=>{
                const file=e.target.files[0]; if(!file) return;
                const reader=new FileReader();
                reader.onload=ev=>setNewTeamAvatar(ev.target.result);
                reader.readAsDataURL(file);
              }} />
            </div>
            <div className="form-group">
              <label className="form-label">Team Name</label>
              <input className="form-input" value={newTeamName} onChange={e=>setNewTeamName(e.target.value)} onKeyDown={e=>e.key==='Enter'&&addTeam()} placeholder="e.g. Thunder Hawks" autoFocus maxLength={30} />
            </div>
            <div className="form-group">
              <label className="form-label">Team Color</label>
              <div className="color-row">
                <input type="color" className="color-swatch-input" value={newTeamColor} onChange={e=>setNewTeamColor(e.target.value)} />
                <div className="color-presets">
                  {PRESET_COLORS.map(c=>(
                    <div key={c} className={`color-preset${newTeamColor===c?' selected':''}`} style={{ background:c }} onClick={()=>setNewTeamColor(c)} />
                  ))}
                </div>
              </div>
            </div>
            <button className="btn btn-primary w-full" onClick={addTeam}>Create Team</button>
          </div>
        </div>
      </div>

      {/* Add Player */}
      <div className={`modal-overlay${modal==='addPlayer'?' open':''}`} onClick={e=>{ if(e.target===e.currentTarget) setModal(null); }}>
        <div className="modal">
          <div className="modal-header">
            <h2 className="modal-title">Add Player</h2>
            <button className="modal-close" onClick={()=>setModal(null)}>✕</button>
          </div>
          <div className="modal-body">
            <div style={{ display:'flex',justifyContent:'center' }}>
              <div className="player-avatar-upload" onClick={()=>document.getElementById('playerAvatarInput').click()}>
                <img className="player-preview-img" src={newPlayerAvatar||PLAYER_AVATAR} alt="Player" />
                <div className="player-avatar-overlay">📷 Photo</div>
              </div>
              <input type="file" id="playerAvatarInput" accept="image/*" hidden onChange={e=>{
                const file=e.target.files[0]; if(!file) return;
                const reader=new FileReader();
                reader.onload=ev=>setNewPlayerAvatar(ev.target.result);
                reader.readAsDataURL(file);
              }} />
            </div>
            <div className="form-group">
              <label className="form-label">Player Name</label>
              <input className="form-input" value={newPlayerName} onChange={e=>setNewPlayerName(e.target.value)} onKeyDown={e=>e.key==='Enter'&&addPlayer()} placeholder="Full name" autoFocus maxLength={40} />
            </div>
            <div className="form-group">
              <label className="form-label">Jersey Number</label>
              <input className="form-input" value={newPlayerNum} onChange={e=>setNewPlayerNum(e.target.value)} placeholder="e.g. 7" maxLength={3} />
            </div>
            <button className="btn btn-primary w-full" onClick={addPlayer}>Add Player</button>
          </div>
        </div>
      </div>

      {/* Edit Player */}
      <div className={`modal-overlay${modal==='editPlayer'?' open':''}`} onClick={e=>{ if(e.target===e.currentTarget) setModal(null); }}>
        <div className="modal">
          <div className="modal-header">
            <h2 className="modal-title">Edit Player</h2>
            <button className="modal-close" onClick={()=>setModal(null)}>✕</button>
          </div>
          <div className="modal-body">
            <div style={{ display:'flex',justifyContent:'center' }}>
              <div className="player-avatar-upload" onClick={()=>document.getElementById('editPlayerAvatarInput').click()}>
                <img className="player-preview-img" src={newPlayerAvatar||PLAYER_AVATAR} alt="Player" />
                <div className="player-avatar-overlay">📷 Photo</div>
              </div>
              <input type="file" id="editPlayerAvatarInput" accept="image/*" hidden onChange={e=>{
                const file=e.target.files[0]; if(!file) return;
                const reader=new FileReader();
                reader.onload=ev=>setNewPlayerAvatar(ev.target.result);
                reader.readAsDataURL(file);
              }} />
            </div>
            <div className="form-group">
              <label className="form-label">Player Name</label>
              <input className="form-input" value={newPlayerName} onChange={e=>setNewPlayerName(e.target.value)} onKeyDown={e=>e.key==='Enter'&&updatePlayer()} placeholder="Full name" autoFocus maxLength={40} />
            </div>
            <div className="form-group">
              <label className="form-label">Jersey Number</label>
              <input className="form-input" value={newPlayerNum} onChange={e=>setNewPlayerNum(e.target.value)} placeholder="e.g. 7" maxLength={3} />
            </div>
            <button className="btn btn-primary w-full" onClick={updatePlayer}>Save Changes</button>
          </div>
        </div>
      </div>

      {/* Select Match */}
      <div className={`modal-overlay${modal==='selectMatch'?' open':''}`} onClick={e=>{ if(e.target===e.currentTarget) setModal(null); }}>
        <div className="modal modal-wide">
          <div className="modal-header">
            <h2 className="modal-title">Select Match to Score</h2>
            <button className="modal-close" onClick={()=>setModal(null)}>✕</button>
          </div>
          <div className="modal-body">
            {avail.length===0
              ? <div className="empty-state" style={{ padding:'2rem' }}><p>No matches available right now.</p></div>
              : avail.map(m=>(
                  <div key={m.id} className="match-select-item" onClick={()=>selectMatch(m.id)}>
                    <div>
                      <div className="msi-title">{teamName(m.team1)} vs {teamName(m.team2)}</div>
                      <div className="msi-sub">{matchLabel(m)}</div>
                    </div>
                    <div className="msi-arrow">›</div>
                  </div>
                ))
            }
          </div>
        </div>
      </div>

      {/* Confirm Reset */}
      <div className={`modal-overlay${modal==='confirmReset'?' open':''}`} onClick={e=>{ if(e.target===e.currentTarget) setModal(null); }}>
        <div className="modal">
          <div className="modal-header">
            <h2 className="modal-title">Reset Tournament</h2>
            <button className="modal-close" onClick={()=>setModal(null)}>✕</button>
          </div>
          <div className="modal-body">
            <p style={{ color:'var(--text-2)',textAlign:'center',marginBottom:'1rem' }}>This will erase all match results and bracket progress. Teams will be kept.</p>
            <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)', borderRadius: '8px', padding: '1rem', marginBottom: '1.25rem' }}>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: 'var(--orange)', marginBottom: '0.5rem' }}>
                Optional: Archive before resetting?
              </label>
              <input
                type="text"
                placeholder="E.g., Bootaleyzee Cup 2026"
                className="form-input"
                value={archiveName}
                onChange={e => setArchiveName(e.target.value)}
                style={{ width: '100%', marginBottom: '0.5rem' }}
              />
              <span style={{ fontSize: '0.72rem', color: 'var(--text-2)' }}>
                Leave name empty to skip archiving.
              </span>
            </div>
            <div style={{ display:'flex',gap:'.65rem' }}>
              <button className="btn btn-secondary w-full" onClick={()=>setModal(null)}>Cancel</button>
              <button 
                className="btn btn-danger w-full" 
                onClick={async () => {
                  if (archiveName.trim()) {
                    await archiveTournament(archiveName.trim());
                  }
                  await resetTournament();
                }}
              >
                Yes, Reset
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Match Result */}
      <div className={`modal-overlay${modal==='matchResult'?' open':''}`} onClick={e=>{ if(e.target===e.currentTarget) setModal(null); }}>
        <div className="modal">
          <div className="modal-header">
            <h2 className="modal-title">🎉 Match Complete!</h2>
            <button className="modal-close" onClick={()=>setModal(null)}>✕</button>
          </div>
          {matchResult && (
            <div className="modal-body" style={{ textAlign:'center' }}>
              <div style={{ fontSize:'2.5rem',marginBottom:'.5rem' }}>🎉</div>
              <div style={{ fontSize:'1.3rem',fontWeight:900,color:'var(--orange)',marginBottom:'.4rem' }}>{matchResult.winnerName} Wins!</div>
              {matchResult.loserName && <div style={{ color:'var(--text-2)',marginBottom:'1rem',fontSize:'.88rem' }}>def. {matchResult.loserName}</div>}
              <div style={{ marginBottom:'1.25rem',display:'flex',flexDirection:'column',gap:'.2rem' }}>
                {matchResult.match.sets.map((s,i)=><div key={i} style={{ fontSize:'.82rem',color:'var(--text-2)' }}>Set {i+1}: {s.t1}–{s.t2}</div>)}
              </div>
              <button className="btn btn-primary w-full" onClick={()=>{ setModal(null); setView('bracket'); }}>View Bracket</button>
              <button className="btn btn-secondary w-full" style={{ marginTop:'.5rem' }} onClick={()=>{ setModal('selectMatch'); }}>Next Match</button>
            </div>
          )}
        </div>
      </div>

      {/* GF Reset */}
      <div className={`modal-overlay${modal==='gfReset'?' open':''}`} onClick={e=>{ if(e.target===e.currentTarget) setModal(null); }}>
        <div className="modal">
          <div className="modal-header">
            <h2 className="modal-title">🔥 Grand Final Reset</h2>
            <button className="modal-close" onClick={()=>setModal(null)}>✕</button>
          </div>
          {gfResetInfo && (
            <div className="modal-body" style={{ textAlign:'center' }}>
              <div style={{ fontSize:'2.5rem',marginBottom:'.75rem' }}>🔥</div>
              <p style={{ fontSize:'1.1rem',fontWeight:800,color:'var(--orange)',marginBottom:'.5rem' }}>Grand Final Reset!</p>
              <p style={{ color:'var(--text-2)',marginBottom:'1.25rem' }}>
                {gfResetInfo.t2?.name} won — both teams start fresh!<br/>One deciding match to crown the champion.
              </p>
              <button className="btn btn-primary w-full" onClick={()=>{ setModal(null); selectMatch(gfResetInfo.matchId); }}>Score Deciding Match</button>
            </div>
          )}
        </div>
      </div>

      {/* Archive Details Modal */}
      <div className={`modal-overlay${modal==='viewArchiveDetail'?' open':''}`} onClick={e=>{ if(e.target===e.currentTarget) setModal(null); }}>
        <div className="modal" style={{ maxWidth: '900px', width: '90%' }}>
          <div className="modal-header">
            <h2 className="modal-title">🏆 {selectedArchive?.name} Details</h2>
            <button className="modal-close" onClick={()=>setModal(null)}>✕</button>
          </div>
          {selectedArchive && (() => {
            const arch = selectedArchive;
            const archMatches = arch.bracketJson?.matches || [];
            const archiveTeams = arch.standingsJson || [];

            // Calculate bracket rounds
            const wbRoundsCount = archMatches.length > 0 ? Math.max(...archMatches.filter(m => m.bracket === 'W').map(m => m.round), 0) : 0;
            const archiveWb = [];
            for (let r = 1; r <= wbRoundsCount; r++) {
              archiveWb.push(archMatches.filter(m => m.bracket === 'W' && m.round === r).sort((a, b) => a.id - b.id));
            }

            const lbRoundsCount = archMatches.length > 0 ? Math.max(...archMatches.filter(m => m.bracket === 'L').map(m => m.round), 0) : 0;
            const archiveLb = [];
            for (let r = 1; r <= lbRoundsCount; r++) {
              archiveLb.push(archMatches.filter(m => m.bracket === 'L' && m.round === r).sort((a, b) => a.id - b.id));
            }

            const gf = archMatches.find(m => m.bracket === 'GF');
            const gfr = archMatches.find(m => m.bracket === 'GFR');

            return (
              <div className="modal-body" style={{ maxHeight: '80vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '2rem', padding: '1.5rem' }}>
                
                {/* Standings */}
                <div>
                  <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--orange)', marginBottom: '0.75rem' }}>📊 Final Standings</h3>
                  <div className="table-responsive">
                    <table className="stats-table">
                      <thead>
                        <tr>
                          <th>Team</th>
                          <th>Wins</th>
                          <th>Losses</th>
                          <th>Sets Ratio</th>
                          <th>Points Ratio</th>
                        </tr>
                      </thead>
                      <tbody>
                        {archiveTeams.map((t, idx) => (
                          <tr key={idx}>
                            <td>
                              <div className="team-cell">
                                <div className="tc-dot" style={{ background: t.color }}></div>
                                {t.name}
                              </div>
                            </td>
                            <td>{t.wins}</td>
                            <td>{t.losses}</td>
                            <td>{t.setsWon} – {t.setsLost}</td>
                            <td>{t.pointsFor} – {t.pointsAgainst}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Bracket View */}
                <div>
                  <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--orange)', marginBottom: '1.25rem' }}>🏆 Tournament Bracket</h3>
                  <div className="bracket-wrapper" style={{ overflowX: 'auto', paddingBottom: '1rem' }}>
                    <div className="bracket-container" style={{ minWidth: '800px' }}>
                      <BracketSection 
                        title="Winners Bracket" 
                        labelClass="wb-hdr" 
                        rounds={archiveWb}
                        matchClass="winners-match"
                        activeId={null}
                        onSelect={undefined}
                        teams={archiveTeams}
                      />

                      {gf && (
                        <div className="bracket-section">
                          <div className="bracket-section-label gf-hdr">Grand Final</div>
                          <div className="bracket-row">
                            <div className="bracket-col">
                              <div className="bracket-round-label">Finals</div>
                              <BracketMatchCard m={gf} cls="gf-match" activeId={null} onSelect={undefined} teams={archiveTeams} />
                              {gfr && (
                                <div style={{ marginTop: '1.5rem' }}>
                                  <div className="bracket-round-label" style={{ color: 'var(--orange)' }}>Reset Match</div>
                                  <BracketMatchCard m={gfr} cls="gf-match" activeId={null} onSelect={undefined} teams={archiveTeams} />
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      )}

                      {archiveLb.length > 0 && (
                        <BracketSection 
                          title="Losers Bracket" 
                          labelClass="lb-hdr" 
                          rounds={archiveLb}
                          matchClass="losers-match"
                          activeId={null}
                          onSelect={undefined}
                          teams={archiveTeams}
                        />
                      )}
                    </div>
                  </div>
                </div>

              </div>
            );
          })()}
        </div>
      </div>

      {/* ── Toast ── */}
      <div className={`toast${toast.show?' show':''}${toast.type?' '+toast.type:''}`}>{toast.msg}</div>
    </>
  );
}

/* ── Sub-components ─────────────────────────────────────── */
function BracketSection({ title, labelClass, rounds, matchClass, activeId, onSelect, teams=[] }) {
  return (
    <div className="bracket-section">
      <div className={`bracket-section-label ${labelClass}`}>{title}</div>
      <div className="bracket-row">
        {rounds.map((round, ri) => (
          <div key={ri} className="bracket-col">
            <div className="bracket-round-label">Round {ri+1}</div>
            {round.map(m => (
              <BracketMatchCard key={m.id} m={m} cls={matchClass} activeId={activeId} onSelect={onSelect} teams={teams} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function BracketMatchCard({ m, cls, activeId, onSelect, teams=[] }) {
  const canScore   = !m.complete && m.team1 && m.team2;
  const isActive   = activeId === m.id;
  const isBye      = (!m.team1 || !m.team2) && !m.complete;

  const teamName  = id => teams.find(t=>t.id===id)?.name  || (m.complete?'—':'TBD');
  const teamColor = id => teams.find(t=>t.id===id)?.color || '#475569';
  const t1Won = m.complete && m.winner === m.team1;
  const t2Won = m.complete && m.winner === m.team2;

  const getScoreDisplay = (teamIdx) => {
    if (m.complete) return m.setsWon[teamIdx];
    const setScore = m.sets[m.currentSet];
    const livePts = setScore ? (teamIdx === 0 ? setScore.t1 : setScore.t2) : 0;
    const hasSetsPlayed = m.sets.length > 0;
    return (
      <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        {m.setsWon[teamIdx]}
        {hasSetsPlayed && <span style={{ opacity: 0.6, fontSize: '0.85em', fontWeight: 'normal' }}>({livePts})</span>}
      </span>
    );
  };

  const renderSetHistory = () => {
    if (!m.sets || m.sets.length === 0) return null;
    const historyStrings = m.sets.map((s, idx) => {
      const isLive = !m.complete && idx === m.currentSet;
      return `${s.t1}-${s.t2}${isLive ? '*' : ''}`;
    });
    return (
      <div style={{ fontSize: '.7rem', color: '#94a3b8', padding: '.25rem .7rem', borderTop: '1px solid rgba(255,255,255,0.03)', textAlign: 'center', background: 'rgba(0,0,0,0.12)', fontStyle: 'italic' }}>
        ({historyStrings.join(', ')})
      </div>
    );
  };

  return (
    <div
      className={`b-match ${cls}${isActive?' active-match':''}${m.complete?' done':''}${isBye?' b-match-bye':''}`}
      onClick={canScore?()=>onSelect(m.id):undefined}
      title={canScore?'Click to score this match':''}
      style={{ overflow: 'hidden' }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.2rem 0.5rem', background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid rgba(255,255,255,0.03)', fontSize: '0.62rem', color: 'var(--text-3)', fontWeight: 800 }}>
        <span>MATCH {m.id}</span>
        {isActive && <span style={{ color: 'var(--orange)', animation: 'pulse 2s infinite' }}>● LIVE</span>}
      </div>
      <div className={`b-team${t1Won?' won':''}${m.complete&&!t1Won?' lost':''}`}>
        <div className="b-label">
          <div className="b-dot" style={{ background:teamColor(m.team1) }}/>
          <span title={teamName(m.team1)}>{trunc(teamName(m.team1),14)}</span>
        </div>
        <span className="b-sets">{getScoreDisplay(0)}</span>
      </div>
      <div className={`b-team${t2Won?' won':''}${m.complete&&!t2Won?' lost':''}`}>
        <div className="b-label">
          <div className="b-dot" style={{ background:teamColor(m.team2) }}/>
          <span title={teamName(m.team2)}>{trunc(teamName(m.team2),14)}</span>
        </div>
        <span className="b-sets">{getScoreDisplay(1)}</span>
      </div>
      {renderSetHistory()}
    </div>
  );
}
