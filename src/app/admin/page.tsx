'use client';

import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

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
    fetchData();
  };

  const finishRound = async (roundId: string) => {
    await supabase.from('rounds').update({ status: 'finished', end_time: new Date().toISOString() }).eq('id', roundId);
    await supabase.from('matches').update({ status: 'finished' }).eq('round_id', roundId);
    fetchData();
  };

  const resetRound = async (roundId: string) => {
    await supabase.from('rounds').update({ status: 'pending', start_time: null, end_time: null }).eq('id', roundId);
    await supabase.from('matches').update({ status: 'pending', score1: 0, score2: 0 }).eq('round_id', roundId);
    fetchData();
  };

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">Admin Panel - Baseball Tournament</h1>
      
      <section className="mb-8">
        <h2 className="text-xl mb-2">Groups</h2>
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
        <h2 className="text-xl mb-2">Teams</h2>
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
        <h2 className="text-xl mb-2">Rounds</h2>
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
              Round {r.number} - Status: {r.status}
              {r.status === 'pending' && <button onClick={() => startRound(r.id)} className="ml-2 bg-green-500 text-white p-1">Start</button>}
              {r.status === 'active' && <button onClick={() => finishRound(r.id)} className="ml-2 bg-red-500 text-white p-1">Finish</button>}
              {r.status === 'finished' && <button onClick={() => resetRound(r.id)} className="ml-2 bg-yellow-500 text-white p-1">Restart</button>}
            </li>
          ))}
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="text-xl mb-2">Matches</h2>
        <select
          value={newMatchRoundId}
          onChange={(e) => setNewMatchRoundId(e.target.value)}
          className="border p-1 mr-2"
        >
          <option value="">Select Round</option>
          {rounds.map(r => <option key={r.id} value={r.id}>Round {r.number}</option>)}
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
        <ul>
          {matches.map(m => (
            <li key={m.id}>
              Round {rounds.find(r => r.id === m.round_id)?.number} Court {m.court}: 
              {teams.find(t => t.id === m.team1_id)?.name} ({m.score1}) vs {teams.find(t => t.id === m.team2_id)?.name} ({m.score2}) - {m.status}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
} 