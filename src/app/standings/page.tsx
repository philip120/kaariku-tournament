'use client';

import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

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

interface Round {
  id: string;
  number: number;
  type: string;
  status: string;
}

interface Match {
  id: string;
  team1_id: string;
  team2_id: string;
  score1: number;
  score2: number;
  round_id: string;
  status: string;
  rounds?: { type: string; status: string }[];
}

interface Team {
  id: string;
  name: string;
  group_id: string;
}

export default function Standings() {
  const [standings, setStandings] = useState<{ [group: string]: Standing[] }>({});
  const [qualifiers, setQualifiers] = useState<string[]>([]);
  const [rounds, setRounds] = useState<Round[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      const { data: teamsData } = await supabase.from('teams').select('*');
      setTeams(teamsData || []);

      const { data: roundsData } = await supabase.from('rounds').select('*').order('number');
      setRounds(roundsData || []);

      const { data: matchesData } = await supabase.from('matches').select('*');
      setMatches(matchesData || []);

      calculateStandings(teamsData, matchesData.filter(m => m.rounds?.type === 'group' || !m.rounds?.type)); // Only group matches for standings
    };

    fetchData();

    const channel = supabase.channel('standings');
    channel.on('postgres_changes', { event: '*', schema: 'public', table: 'matches' }, fetchData)
           .on('postgres_changes', { event: '*', schema: 'public', table: 'rounds' }, fetchData)
           .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const calculateStandings = (teams, groupMatches) => {
    const standingsMap: { [group: string]: { [team: string]: Standing } } = {};

    // Initialize standingsMap with all teams, even if they haven't played any matches yet
    // This ensures they are present in the standings, but their stats will be 0 until they do
    teams.forEach(t => {
      const groupName = teams.find(g => g.id === t.group_id)?.name || '';
      if (!standingsMap[groupName]) {
        standingsMap[groupName] = {};
      }
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

    // Process group matches to update standings
    groupMatches.forEach(m => {
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
        } // assume no ties

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

    setStandings(sortedStandings);

    // Determine qualifiers: top 1 from each group + best PPG among seconds
    const tops = Object.values(sortedStandings).map(groupStandings => groupStandings[0]?.teamId).filter(Boolean);
    const seconds = Object.values(sortedStandings).map(groupStandings => groupStandings[1]).filter(Boolean);
    const bestSecond = seconds.sort((a, b) => b.ppg - a.ppg)[0]?.teamId;
    setQualifiers([...tops, bestSecond].filter(Boolean));
  };

  const getRoundMatches = (roundType) => {
    const round = rounds.find(r => r.type === roundType && r.status === 'finished');
    if (!round) return null;
    return matches.filter(m => m.round_id === round.id);
  };

  const getWinner = (match) => {
    if (match.score1 > match.score2) return teams.find(t => t.id === match.team1_id)?.name;
    if (match.score2 > match.score1) return teams.find(t => t.id === match.team2_id)?.name;
    return 'Tie';
  };

  return (
    <div className="p-4">
      <Link href="/" className="text-blue-500 underline mb-4 block">Back to Home</Link>
      <h1 className="text-2xl font-bold mb-4">Tournament Standings</h1>
      {Object.keys(standings).map(group => (
        <div key={group} className="mb-8">
          <h2 className="text-xl mb-2">Group {group}</h2>
          <table className="w-full border">
            <thead>
              <tr>
                <th>Team</th>
                <th>Played</th>
                <th>W</th>
                <th>L</th>
                <th>+</th>
                <th>-</th>
                <th>Diff</th>
                <th>PPG</th>
              </tr>
            </thead>
            <tbody>
              {standings[group].map(s => (
                <tr key={s.teamId}>
                  <td>{s.name}</td>
                  <td>{s.played}</td>
                  <td>{s.wins}</td>
                  <td>{s.losses}</td>
                  <td>{s.pointsFor}</td>
                  <td>{s.pointsAgainst}</td>
                  <td>{s.diff}</td>
                  <td>{s.ppg.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
      <section>
        <h2 className="text-xl mb-2">Semifinal Qualifiers</h2>
        <ul>
          {qualifiers.map(q => <li key={q}>{standings[Object.values(standings).find(s => s.some(t => t.teamId === q))?.[0].group || ''][Object.values(standings).find(s => s.some(t => t.teamId === q))?.findIndex(t => t.teamId === q) || 0]?.name}</li>)}
        </ul>
      </section>

      <section className="mt-8">
        <h2 className="text-xl mb-2">Semifinals</h2>
        {getRoundMatches('semi')?.map(m => (
          <div key={m.id} className="mb-2">
            {teams.find(t => t.id === m.team1_id)?.name} {m.score1} vs {teams.find(t => t.id === m.team2_id)?.name} {m.score2} - Winner: {getWinner(m)}
          </div>
        )) || <p>No semifinals completed yet.</p>}
      </section>

      <section className="mt-8">
        <h2 className="text-xl mb-2">Final</h2>
        {getRoundMatches('final')?.map(m => (
          <div key={m.id} className="mb-2">
            {teams.find(t => t.id === m.team1_id)?.name} {m.score1} vs {teams.find(t => t.id === m.team2_id)?.name} {m.score2} - Champion: {getWinner(m)}
          </div>
        )) || <p>No final completed yet.</p>}
      </section>
    </div>
  );
} 