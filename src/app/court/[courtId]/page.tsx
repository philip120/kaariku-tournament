'use client';

import { useParams } from 'next/navigation';
import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../../lib/supabase';

interface Match {
  id: string;
  team1_id: string;
  team2_id: string;
  score1: number;
  score2: number;
  status: string;
  rounds: { start_time: string | null };
}

interface Team {
  id: string;
  name: string;
}

export default function Court() {
  const { courtId } = useParams();
  const [match, setMatch] = useState<Match | null>(null);
  const [team1, setTeam1] = useState<Team | null>(null);
  const [team2, setTeam2] = useState<Team | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  
  useEffect(() => {
    const fetchActiveMatch = async () => {
      const { data: activeRound } = await supabase.from('rounds').select('id, start_time').eq('status', 'active').single();
      if (!activeRound) {
        setMatch(null);
        setTeam1(null);
        setTeam2(null);
        if (timerRef.current) clearInterval(timerRef.current);
        setElapsedTime(0);
        return;
      }

      const { data: matchData } = await supabase.from('matches')
        .select('*')
        .eq('round_id', activeRound.id)
        .eq('court', courtId)
        .eq('status', 'active')
        .single();

      if (matchData) {
        setMatch({ ...matchData, rounds: { start_time: activeRound.start_time } });

        const [team1Data, team2Data] = await Promise.all([
          supabase.from('teams').select('*').eq('id', matchData.team1_id).single(),
          supabase.from('teams').select('*').eq('id', matchData.team2_id).single()
        ]);

        setTeam1(team1Data.data);
        setTeam2(team2Data.data);

        if (activeRound.start_time) {
          const start = new Date(activeRound.start_time).getTime();
          const now = Date.now();
          setElapsedTime(Math.floor((now - start) / 1000));
          timerRef.current = setInterval(() => {
            setElapsedTime(prev => prev + 1);
          }, 1000);
        }
      } else {
        setMatch(null);
        setTeam1(null);
        setTeam2(null);
        if (timerRef.current) clearInterval(timerRef.current);
        setElapsedTime(0);
      }
    };

    fetchActiveMatch();

    const matchSubscription = supabase.channel(`match_${courtId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'matches',
        filter: `court=eq.${courtId}`
      }, (payload) => {
        const newMatch = payload.new as Match; // Add this cast to fix type error
        if (newMatch && match && newMatch.id === match.id) {
          setMatch(prev => prev ? { ...prev, ...newMatch } : prev);
        } else {
          fetchActiveMatch();
        }
      })
      .subscribe();

    const roundSubscription = supabase.channel('rounds_changes')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'rounds'
      }, () => {
        fetchActiveMatch();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(matchSubscription);
      supabase.removeChannel(roundSubscription);
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [courtId, match]);

  const updateScore = async (matchId: string, scoreField: 'score1' | 'score2', delta: number) => {
    if (!match || match.id !== matchId) return;

    // Optimistic update
    const previousScore = match[scoreField];
    const newScore = previousScore + delta;
    if (newScore < 0) return;

    setMatch(prev => prev ? { ...prev, [scoreField]: newScore } : prev);

    try {
      const { error } = await supabase.from('matches').update({ [scoreField]: newScore }).eq('id', matchId);
      if (error) {
        // Rollback on error
        setMatch(prev => prev ? { ...prev, [scoreField]: previousScore } : prev);
        console.error('Update error:', error);
        alert('Failed to update score. Please try again.');
      }
    } catch (err) {
      // Rollback on exception
      setMatch(prev => prev ? { ...prev, [scoreField]: previousScore } : prev);
      console.error('Failed to update score:', err);
      alert('Failed to update score. Please try again.');
    }
  };

  if (!match) {
    return <div className="p-4">Waiting for match to start on Court {courtId}...</div>;
  }

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">Court {courtId} - Active Match</h1>
      <div className="text-lg mb-2">Elapsed Time: {Math.floor(elapsedTime / 60)}:{(elapsedTime % 60).toString().padStart(2, '0')}</div>
      <div className="flex justify-around">
        <div className="text-center">
          <h2 className="text-xl">{team1?.name}</h2>
          <div className="text-4xl">{match.score1}</div>
          <button onClick={() => updateScore(match.id, 'score1', 1)} className="bg-green-500 text-white p-2 m-1">+</button>
          <button onClick={() => updateScore(match.id, 'score1', -1)} className="bg-red-500 text-white p-2 m-1">-</button>
        </div>
        <div className="text-2xl">vs</div>
        <div className="text-center">
          <h2 className="text-xl">{team2?.name}</h2>
          <div className="text-4xl">{match.score2}</div>
          <button onClick={() => updateScore(match.id, 'score2', 1)} className="bg-green-500 text-white p-2 m-1">+</button>
          <button onClick={() => updateScore(match.id, 'score2', -1)} className="bg-red-500 text-white p-2 m-1">-</button>
        </div>
      </div>
    </div>
  );
} 