'use client';

import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

interface Group {
  id: string;
  name: string;
}

interface Team {
  id: string;
  name: string;
  group_id: string;
}

interface Round {
  id: string;
  number: number;
  status: string;
  start_time: string | null;
  end_time: string | null;
  is_paused: boolean;
  total_paused_time: number;
  last_pause_start: string | null;
  type: string;
}

interface Standing {
  teamId: string;
  name: string;
  group: string;
  played: number;
  wins: number;
  losses: number;
  pointsFor: number;
  pointsAgainst: number;
  diff: number;
  ppg: number;
}

interface Match {
  id: string;
  round_id: string;
  court: number;
  team1_id: string;
  team2_id: string;
  score1: number;
  score2: number;
  status: string;
}

export default function Admin() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [rounds, setRounds] = useState<Round[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [newGroupName, setNewGroupName] = useState('');
  const [newTeamName, setNewTeamName] = useState('');
  const [selectedGroupForTeam, setSelectedGroupForTeam] = useState('');
  const [newRoundNumber, setNewRoundNumber] = useState(0);
  const [newMatchRoundId, setNewMatchRoundId] = useState('');
  const [newMatchCourt, setNewMatchCourt] = useState(1);
  const [newMatchTeam1, setNewMatchTeam1] = useState('');
  const [newMatchTeam2, setNewMatchTeam2] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    const { data: groupsData } = await supabase.from('groups').select('*');
    setGroups(groupsData || []);

    const { data: teamsData } = await supabase.from('teams').select('*');
    setTeams(teamsData || []);

    const { data: roundsData } = await supabase.from('rounds').select('*').order('number');
    setRounds(roundsData || []);

    const { data: matchesData } = await supabase.from('matches').select('*');
    setMatches(matchesData || []);
  };

  const addGroup = async () => {
    await supabase.from('groups').insert({ name: newGroupName });
    setNewGroupName('');
    fetchData();
  };

  const addTeam = async () => {
    await supabase.from('teams').insert({ name: newTeamName, group_id: selectedGroupForTeam });
    setNewTeamName('');
    setSelectedGroupForTeam('');
    fetchData();
  };

  const addRound = async () => {
    await supabase.from('rounds').insert({ number: newRoundNumber });
    setNewRoundNumber(0);
    fetchData();
  };

  const addMatch = async () => {
    await supabase.from('matches').insert({
      round_id: newMatchRoundId,
      court: newMatchCourt,
      team1_id: newMatchTeam1,
      team2_id: newMatchTeam2
    });
    setNewMatchRoundId('');
    setNewMatchCourt(1);
    setNewMatchTeam1('');
    setNewMatchTeam2('');
    fetchData();
  };

  const startRound = async (roundId: string) => {
    await supabase.from('rounds').update({ status: 'active', start_time: new Date().toISOString() }).eq('id', roundId);
    await supabase.from('matches').update({ status: 'active' }).eq('round_id', roundId);

    // Broadcast to notify courts
    await supabase.channel('round_updates').send({
      type: 'broadcast',
      event: 'round_started',
      payload: { roundId }
    });

    fetchData();
  };

  const finishRound = async (roundId: string) => {
    await supabase.from('rounds').update({ status: 'finished', end_time: new Date().toISOString() }).eq('id', roundId);
    await supabase.from('matches').update({ status: 'finished' }).eq('round_id', roundId);
    fetchData();
  };

  const resetRound = async (roundId: string) => {
    if (!confirm('Are you sure you want to restart this round? This will reset scores and status to pending.')) return;
    await supabase.from('rounds').update({ status: 'pending', end_time: new Date().toISOString() }).eq('id', roundId);
    await supabase.from('matches').update({ status: 'pending' }).eq('round_id', roundId);
    fetchData();
  };

  const pauseRound = async (roundId: string) => {
    await supabase.from('rounds').update({ is_paused: true, last_pause_start: new Date().toISOString() }).eq('id', roundId);
    fetchData();
  };

  const resumeRound = async (roundId: string) => {
    const { data: round } = await supabase.from('rounds').select('total_paused_time, last_pause_start').eq('id', roundId).single();
    if (round && round.last_pause_start) {
      const pauseDuration = Math.floor((Date.now() - new Date(round.last_pause_start).getTime()) / 1000);
      const newTotal = (round.total_paused_time || 0) + pauseDuration;
      await supabase.from('rounds').update({ is_paused: false, last_pause_start: null, total_paused_time: newTotal }).eq('id', roundId);
    }
    fetchData();
  };

  const generateSemifinals = async () => {
    const { data: teams } = await supabase.from('teams').select('*');
    const { data: groups } = await supabase.from('groups').select('*');
    const { data: matches } = await supabase.from('matches').select('*').eq('status', 'finished');

    if (!teams || !groups || !matches) return;

    const standingsMap: { [group: string]: { [team: string]: Standing } } = {};

    groups.forEach(g => { standingsMap[g.name] = {}; });

    teams.forEach(t => {
      const groupName = groups.find(g => g.id === t.group_id)?.name || '';
      if (!standingsMap[groupName][t.id]) {
        standingsMap[groupName][t.id] = {
          teamId: t.id,
          name: t.name,
          group: groupName,
          played: 0,
          wins: 0,
          losses: 0,
          pointsFor: 0,
          pointsAgainst: 0,
          diff: 0,
          ppg: 0,
        };
      }
    });

    matches.forEach(m => {
      const team1Standing = Object.values(standingsMap).flatMap(s => Object.values(s)).find(s => s.teamId === m.team1_id);
      const team2Standing = Object.values(standingsMap).flatMap(s => Object.values(s)).find(s => s.teamId === m.team2_id);

      if (team1Standing && team2Standing) {
        team1Standing.played++;
        team2Standing.played++;
        team1Standing.pointsFor += m.score1;
        team1Standing.pointsAgainst += m.score2;
        team2Standing.pointsFor += m.score2;
        team2Standing.pointsAgainst += m.score1;

        if (m.score1 > m.score2) {
          team1Standing.wins++;
          team2Standing.losses++;
        } else if (m.score2 > m.score1) {
          team2Standing.wins++;
          team1Standing.losses++;
        }

        team1Standing.diff = team1Standing.pointsFor - team1Standing.pointsAgainst;
        team2Standing.diff = team2Standing.pointsFor - team2Standing.pointsAgainst;
        team1Standing.ppg = team1Standing.played > 0 ? team1Standing.pointsFor / team1Standing.played : 0;
        team2Standing.ppg = team2Standing.played > 0 ? team2Standing.pointsFor / team2Standing.played : 0;
      }
    });

    const sortedStandings: { [group: string]: Standing[] } = {};
    Object.keys(standingsMap).forEach(group => {
      sortedStandings[group] = Object.values(standingsMap[group]).sort((a, b) => b.wins - a.wins || b.diff - a.diff || b.ppg - a.ppg);
    });

    const tops = Object.values(sortedStandings).map(groupStandings => groupStandings[0]?.teamId).filter(Boolean);
    const seconds = Object.values(sortedStandings).map(groupStandings => groupStandings[1]).filter(Boolean);
    const bestSecond = seconds.sort((a, b) => b.ppg - a.ppg)[0]?.teamId;
    const qualifiers = [...tops, bestSecond].filter(Boolean);

    if (qualifiers.length < 4) return alert('Not enough qualifiers for semifinals');

    // Create semi round
    const semiNumber = Math.max(...rounds.map(r => r.number), 0) + 1;
    const { data: semiRound } = await supabase.from('rounds').insert({ number: semiNumber, type: 'semi' }).select().single();

    // Assign matches: 1vs4 on court 1, 2vs3 on court 2
    await supabase.from('matches').insert([
      { round_id: semiRound.id, court: 1, team1_id: qualifiers[0], team2_id: qualifiers[3] },
      { round_id: semiRound.id, court: 2, team1_id: qualifiers[1], team2_id: qualifiers[2] }
    ]);

    fetchData();
  };

  const generateFinal = async () => {
    const { data: semiRound } = await supabase.from('rounds').select('*').eq('type', 'semi').eq('status', 'finished').single();
    if (!semiRound) return alert('Semifinals not finished');

    const { data: semiMatches } = await supabase.from('matches').select('*').eq('round_id', semiRound.id).eq('status', 'finished');

    if (!semiMatches || semiMatches.length !== 2) return alert('Invalid semifinal results');

    const winners = semiMatches.map(m => (m.score1 > m.score2 ? m.team1_id : m.team2_id));

    // Create final round
    const finalNumber = Math.max(...rounds.map(r => r.number), 0) + 1;
    const { data: finalRound } = await supabase.from('rounds').insert({ number: finalNumber, type: 'final' }).select().single();

    // Assign final match on court 1
    await supabase.from('matches').insert({ round_id: finalRound.id, court: 1, team1_id: winners[0], team2_id: winners[1] });

    fetchData();
  };

  const deleteRound = async (roundId: string) => {
    if (!confirm('Are you sure you want to delete this round and all its matches?')) return;
    
    // Delete matches first
    await supabase.from('matches').delete().eq('round_id', roundId);
    
    // Then delete round
    await supabase.from('rounds').delete().eq('id', roundId);
    
    fetchData();
  };

  return (
    <div className="p-4">
      <Link href="/" className="text-blue-500 underline mb-4 block">Back to Home</Link>
      <h1 className="text-2xl font-bold mb-4">Admin Panel - Baseball Tournament</h1>
      
      <section className="mb-8">
        <h2 className="text-xl mb-2">Alagrupid</h2>
        <input
          type="text"
          value={newGroupName}
          onChange={(e) => setNewGroupName(e.target.value)}
          placeholder="New Group Name"
          className="border p-1 mr-2"
        />
        <button onClick={addGroup} className="bg-blue-500 text-white p-1">Add Group</button>
        <ul>
          {groups.map(g => <li key={g.id}>{g.name}</li>)}
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="text-xl mb-2">Tiimid</h2>
        <input
          type="text"
          value={newTeamName}
          onChange={(e) => setNewTeamName(e.target.value)}
          placeholder="New Team Name"
          className="border p-1 mr-2"
        />
        <select
          value={selectedGroupForTeam}
          onChange={(e) => setSelectedGroupForTeam(e.target.value)}
          className="border p-1 mr-2"
        >
          <option value="">Select Group</option>
          {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
        <button onClick={addTeam} className="bg-blue-500 text-white p-1">Add Team</button>
        <ul>
          {teams.map(t => <li key={t.id}>{t.name} (Group: {groups.find(g => g.id === t.group_id)?.name || ''})</li>)}
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="text-xl mb-2">Roundid</h2>
        <input
          type="number"
          value={newRoundNumber}
          onChange={(e) => setNewRoundNumber(parseInt(e.target.value))}
          placeholder="Round Number"
          className="border p-1 mr-2"
        />
        <button onClick={addRound} className="bg-blue-500 text-white p-1">Add Round</button>
        <ul>
          {rounds.map(r => (
            <li key={r.id}>
              Round {r.number} - Status: {r.status} {r.is_paused ? '(Paused)' : ''}
              {r.status === 'pending' && <button onClick={() => startRound(r.id)} className="ml-2 bg-green-500 text-white p-1">Start</button>}
              {r.status === 'active' && !r.is_paused && <button onClick={() => pauseRound(r.id)} className="ml-2 bg-yellow-500 text-white p-1">Pause</button>}
              {r.status === 'active' && r.is_paused && <button onClick={() => resumeRound(r.id)} className="ml-2 bg-green-500 text-white p-1">Resume</button>}
              {r.status === 'active' && <button onClick={() => finishRound(r.id)} className="ml-2 bg-red-500 text-white p-1">Finish</button>}
              {r.status === 'finished' && <button onClick={() => resetRound(r.id)} className="ml-2 bg-yellow-500 text-white p-1">Restart</button>}
              {(r.type === 'semi' || r.type === 'final') && <button onClick={() => deleteRound(r.id)} className="ml-2 bg-red-700 text-white p-1">Delete</button>}
            </li>
          ))}
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="text-xl mb-2">Matches</h2>
        <div className="mb-4">
          <select
            value={newMatchRoundId}
            onChange={(e) => setNewMatchRoundId(e.target.value)}
            className="border p-1 mr-2"
          >
            <option value="">Select Round</option>
            {rounds.map(r => <option key={r.id} value={r.id}>Round {r.number} ({r.type || 'group'})</option>)}
          </select>
          <input
            type="number"
            value={newMatchCourt}
            onChange={(e) => setNewMatchCourt(parseInt(e.target.value))}
            placeholder="Court"
            className="border p-1 mr-2"
            min={1}
            max={4}
          />
          <select
            value={newMatchTeam1}
            onChange={(e) => setNewMatchTeam1(e.target.value)}
            className="border p-1 mr-2"
          >
            <option value="">Team 1</option>
            {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <select
            value={newMatchTeam2}
            onChange={(e) => setNewMatchTeam2(e.target.value)}
            className="border p-1 mr-2"
          >
            <option value="">Team 2</option>
            {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <button onClick={addMatch} className="bg-blue-500 text-white p-1">Add Match</button>
        </div>

        {rounds.sort((a, b) => a.number - b.number).map(round => (
          <div key={round.id} className="mb-6">
            <h3 className="text-lg font-bold">Round {round.number} ({round.type || 'group'}) - Status: {round.status}</h3>
            <table className="w-full border mt-2">
              <thead>
                <tr>
                  <th className="border p-2">Court</th>
                  <th className="border p-2">Team 1</th>
                  <th className="border p-2">Score</th>
                  <th className="border p-2">vs</th>
                  <th className="border p-2">Team 2</th>
                  <th className="border p-2">Score</th>
                  <th className="border p-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {matches.filter(m => m.round_id === round.id).map(m => (
                  <tr key={m.id}>
                    <td className="border p-2">{m.court}</td>
                    <td className="border p-2">{teams.find(t => t.id === m.team1_id)?.name}</td>
                    <td className="border p-2">{m.score1}</td>
                    <td className="border p-2">vs</td>
                    <td className="border p-2">{teams.find(t => t.id === m.team2_id)?.name}</td>
                    <td className="border p-2">{m.score2}</td>
                    <td className="border p-2">{m.status}</td>
                  </tr>
                ))}
                {matches.filter(m => m.round_id === round.id).length === 0 && (
                  <tr>
                    <td colSpan={7} className="border p-2 text-center">No matches for this round</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        ))}
      </section>

      <section className="mb-8">
        <button onClick={generateSemifinals} className="bg-purple-500 text-white p-1 mr-2">Generate Semifinals</button>
        <button onClick={generateFinal} className="bg-purple-500 text-white p-1">Generate Final</button>
      </section>
    </div>
  );
} 