import React, { useEffect, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Trophy, Medal, Award, Loader2, Sparkles, User, CalendarDays } from 'lucide-react';

interface LeaderboardUser {
  rank: number;
  id: string;
  name: string;
  tasks: number;
  points: number;
}

export default function Leaderboard() {
  const [leaderboardData, setLeaderboardData] = useState<LeaderboardUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeFilter, setTimeFilter] = useState<'week' | 'monthly' | 'all'>('week');

  useEffect(() => {
    fetchLeaderboard();
  }, [timeFilter]);

  const fetchLeaderboard = async () => {
    setLoading(true);
    try {
      // 1. Fetch all facilitators (role_id = 4)
      const { data: profileData, error: profileErr } = await supabase
        .from('user_profiles')
        .select('id, full_name')
        .eq('role_id', 4)
        .eq('is_active', true);

      if (profileErr) throw profileErr;

      // Map to accumulate points & count per facilitator
      const userMap: Record<string, { id: string; name: string; tasks: number; points: number }> = {};
      
      (profileData || []).forEach(p => {
        userMap[p.id] = {
          id: p.id,
          name: p.full_name || 'Facilitator',
          tasks: 0,
          points: 0
        };
      });

      // 2. Fetch approved tasks with leaderboard points
      const { data: taskData, error: taskErr } = await supabase
        .from('academy_tasks')
        .select(`
          id,
          status,
          task_date,
          submitted_at,
          created_at,
          academy_task_assignments!inner (
            facilitator_id,
            user_profiles (id, full_name),
            academy_task_templates (
              name,
              leaderboard_points
            )
          )
        `)
        .eq('status', 'approved');

      if (taskErr) throw taskErr;

      // Filter tasks based on timeFilter
      const now = new Date();
      const oneWeekAgo = new Date();
      oneWeekAgo.setDate(now.getDate() - 7);
      const currentMonthPrefix = now.toISOString().slice(0, 7); // YYYY-MM

      (taskData || []).forEach((t: any) => {
        const assignment = t.academy_task_assignments;
        const facId = assignment?.facilitator_id;
        const template = assignment?.academy_task_templates;
        const points = Number(template?.leaderboard_points || 0);

        if (!facId) return;

        // Apply time range filter
        const taskDate = t.task_date ? new Date(t.task_date) : new Date(t.submitted_at || t.created_at);
        if (timeFilter === 'week' && taskDate < oneWeekAgo) return;
        if (timeFilter === 'monthly' && t.task_date && !t.task_date.startsWith(currentMonthPrefix)) return;

        if (!userMap[facId]) {
          userMap[facId] = {
            id: facId,
            name: assignment?.user_profiles?.full_name || 'Facilitator',
            tasks: 0,
            points: 0
          };
        }

        userMap[facId].tasks += 1;
        userMap[facId].points += points;
      });

      // Convert to array and sort descending by points then tasks
      const sortedUsers = Object.values(userMap)
        .sort((a, b) => b.points - a.points || b.tasks - a.tasks)
        .map((u, idx) => ({
          ...u,
          rank: idx + 1
        }));

      setLeaderboardData(sortedUsers);
    } catch (err: any) {
      console.error(err);
      toast.error('Failed to load leaderboard: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="p-6 max-w-5xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
            Leaderboard <Sparkles className="h-5 w-5 text-amber-500" />
          </h1>
          <p className="text-sm text-slate-500 mt-1">Real-time leaderboard rankings based on approved tasks.</p>
        </div>

        <div className="space-y-6">
          <div className="bg-blue-50/70 text-blue-800 px-4 py-3 rounded-xl text-sm font-semibold border border-blue-100 flex items-center gap-2 shadow-xs">
            <Trophy className="h-4 w-4 text-blue-600 shrink-0" />
            <span>Only tasks explicitly marked for leaderboard and approved by a manager contribute points.</span>
          </div>

          {/* Time Filter Tabs */}
          <div className="flex gap-2">
            <button 
              onClick={() => setTimeFilter('week')}
              className={`px-5 py-2 rounded-full text-sm font-semibold transition-all ${
                timeFilter === 'week' ? 'bg-[#0f172a] text-white shadow-xs' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
              }`}
            >
              This week
            </button>
            <button 
              onClick={() => setTimeFilter('monthly')}
              className={`px-5 py-2 rounded-full text-sm font-semibold transition-all ${
                timeFilter === 'monthly' ? 'bg-[#0f172a] text-white shadow-xs' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
              }`}
            >
              Monthly
            </button>
            <button 
              onClick={() => setTimeFilter('all')}
              className={`px-5 py-2 rounded-full text-sm font-semibold transition-all ${
                timeFilter === 'all' ? 'bg-[#0f172a] text-white shadow-xs' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
              }`}
            >
              All time
            </button>
          </div>

          {/* Leaderboard Table Container */}
          <div className="bg-white rounded-2xl shadow-xs border border-slate-200 overflow-hidden">
            {loading ? (
              <div className="p-12 text-center text-slate-500 flex flex-col items-center gap-3">
                <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
                <span className="font-medium text-sm">Calculating real-time leaderboard scores...</span>
              </div>
            ) : leaderboardData.length === 0 ? (
              <div className="p-12 text-center text-slate-500 font-medium">
                No approved leaderboard tasks yet for this time period.
              </div>
            ) : (
              leaderboardData.map((user, index) => {
                const isTop1 = user.rank === 1;
                const isTop2 = user.rank === 2;
                const isTop3 = user.rank === 3;

                return (
                  <div 
                    key={user.id} 
                    className={`p-6 flex items-center justify-between hover:bg-slate-50/70 transition-colors ${
                      index !== leaderboardData.length - 1 ? 'border-b border-slate-100' : ''
                    } ${isTop1 ? 'bg-amber-50/40' : ''}`}
                  >
                    <div className="flex items-center gap-6">
                      <div className="w-8 text-center flex justify-center items-center">
                        {isTop1 ? (
                          <span className="text-2xl" title="1st Place">🥇</span>
                        ) : isTop2 ? (
                          <span className="text-2xl" title="2nd Place">🥈</span>
                        ) : isTop3 ? (
                          <span className="text-2xl" title="3rd Place">🥉</span>
                        ) : (
                          <span className="text-base font-bold text-slate-500">#{user.rank}</span>
                        )}
                      </div>

                      <div className="flex items-center gap-3">
                        <div className={`p-2.5 rounded-full ${
                          isTop1 ? 'bg-amber-100 text-amber-800' :
                          isTop2 ? 'bg-slate-200 text-slate-800' :
                          isTop3 ? 'bg-amber-100/60 text-amber-900' :
                          'bg-slate-100 text-slate-600'
                        }`}>
                          <User className="h-5 w-5" />
                        </div>
                        <div>
                          <h3 className="font-bold text-slate-900 text-lg flex items-center gap-2">
                            {user.name}
                            {isTop1 && <span className="text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full font-bold">Leader</span>}
                          </h3>
                          <p className="text-xs text-slate-500 mt-0.5 font-medium">
                            {user.tasks} approved leaderboard {user.tasks === 1 ? 'task' : 'tasks'}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="text-right">
                      <span className={`text-xl font-black ${isTop1 ? 'text-amber-600' : 'text-slate-900'}`}>
                        {user.points} pts
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
