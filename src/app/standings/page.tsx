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

export default function Standings() {
  const [standings, setStandings] = useState<{ [group: string]: Standing[] }>({});
  const [qualifiers, setQualifiers] = useState<string[]>([]);

  useEffect(() => {
    const calculateStandings = async () => {
      const { data: teams } = await supabase.from('teams').select('*');
      const { data: groups } = await supabase.from('groups').select('*');
      const { data: matches } = await supabase.from('matches').select('*').eq('status', 'finished');

      if (!teams || !groups || !matches) return;

      const standingsMap: { [group: string]: { [team: string]: Standing } } = {};

      groups.forEach(g => {
        standingsMap[g.name] = {};
      });

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

    calculateStandings();

    const channel = supabase.channel('standings');
    channel.on('postgres_changes', { event: '*', schema: 'public', table: 'matches' }, calculateStandings).subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

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
    </div>
  );
} 