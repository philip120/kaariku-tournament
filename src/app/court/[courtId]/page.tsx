'use client';

import { useParams } from 'next/navigation';
import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../../lib/supabase';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

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
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  
  useEffect(() => {
    const fetchActiveMatch = async () => {
      console.log(`Fetching active match for court ${courtId}`);
      const { data: activeRound } = await supabase.from('rounds').select('id, start_time, is_paused, total_paused_time, last_pause_start').eq('status', 'active').single();
      if (!activeRound) {
        console.log('No active round found');
        setMatch(null);
        setTeam1(null);
        setTeam2(null);
        if (timerRef.current) clearInterval(timerRef.current);
        return;
      }
      console.log('Active round found:', activeRound.id);

      const { data: matchData } = await supabase.from('matches')
        .select('*')
        .eq('round_id', activeRound.id)
        .eq('court', courtId)
        .eq('status', 'active')
        .single();

      if (matchData) {
        console.log('Active match found:', matchData.id);
        setMatch({ ...matchData, rounds: activeRound });

        const [team1Data, team2Data] = await Promise.all([
          supabase.from('teams').select('*').eq('id', matchData.team1_id).single(),
          supabase.from('teams').select('*').eq('id', matchData.team2_id).single()
        ]);

        setTeam1(team1Data.data);
        setTeam2(team2Data.data);

        if (activeRound && activeRound.start_time) {
          // Remove unused vars
          // const start = new Date(activeRound.start_time).getTime();
          // const now = Date.now();
          // let pausedTime = activeRound.total_paused_time || 0;
          // if (activeRound.is_paused && activeRound.last_pause_start) {
          //   pausedTime += Math.floor((now - new Date(activeRound.last_pause_start).getTime()) / 1000);
          // }
          // setElapsedTime(Math.floor((now - start) / 1000) - pausedTime); // This line is removed

          if (!activeRound.is_paused) {
            timerRef.current = setInterval(() => {
              // setElapsedTime(prev => prev + 1); // This line is removed
            }, 1000);
          } else if (timerRef.current) {
            clearInterval(timerRef.current);
          }
        }
      } else {
        console.log('No active match for this court');
        setMatch(null);
        setTeam1(null);
        setTeam2(null);
        if (timerRef.current) clearInterval(timerRef.current);
        // setElapsedTime(0); // This line is removed
      }
    };

    console.log('Initial fetch');
    fetchActiveMatch();

    const matchSubscription = supabase.channel(`match_${courtId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'matches',
        filter: `court=eq.${courtId}`
      }, (payload) => {
        console.log('Match change detected:', payload);
        const newMatch = payload.new as Match; // Add this cast to fix type error
        if (newMatch && match && newMatch.id === match.id) {
          setMatch(prev => prev ? { ...prev, ...newMatch } : prev);
        } else {
          fetchActiveMatch();
        }
      })
      .subscribe((status) => {
        console.log('Match subscription status:', status);
      });

    const roundSubscription = supabase.channel('rounds_changes')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'rounds'
      }, () => {
        console.log('Round change detected');
        fetchActiveMatch();
      })
      .subscribe((status) => {
        console.log('Round subscription status:', status);
      });

    const broadcastSubscription = supabase.channel('round_updates')
      .on('broadcast', { event: 'round_started' }, () => {
        console.log('Broadcast received: round_started');
        fetchActiveMatch();
      })
      .subscribe((status) => {
        console.log('Broadcast subscription status:', status);
      });

    return () => {
      supabase.removeChannel(matchSubscription);
      supabase.removeChannel(roundSubscription);
      supabase.removeChannel(broadcastSubscription);
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
    return (
      <div className="p-4">
        <Link href="/" className="text-blue-500 underline mb-4 block">Back to Home</Link>
        <div>Waiting for match to start on Court {courtId}...</div>
      </div>
    );
  }

  return (
    <div className="p-4">
      <Link href="/" className="text-blue-500 underline mb-4 block">Back to Home</Link>
      <h1 className="text-2xl font-bold mb-4">Court {courtId} - Active Match</h1>
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