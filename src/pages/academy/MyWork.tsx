import React, { useEffect, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from "@/components/ui/button";
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export default function MyWork() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user?.id) {
      fetchMyTasks();
    }
  }, [user?.id]);

  const fetchMyTasks = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('academy_tasks')
        .select(`
          *,
          academy_task_assignments (
            custom_reward_amount,
            academy_task_templates (
              name,
              due_time,
              base_reward_amount,
              leaderboard_points
            )
          )
        `)
        .eq('task_date', new Date().toISOString().split('T')[0])
        .order('due_time', { ascending: true });

      if (error) throw error;
      setTasks(data || []);
    } catch (err: any) {
      toast.error('Failed to load tasks: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="p-6 max-w-5xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">My Work</h1>
          <p className="text-sm text-slate-500 mt-1">See what is assigned, due and completed.</p>
        </div>
        <div className="space-y-6">
          <div className="flex gap-2">
            <button className="px-5 py-2 bg-[#0f172a] text-white rounded-full text-sm font-medium">Today</button>
            <button className="px-5 py-2 bg-white text-slate-600 border rounded-full text-sm font-medium hover:bg-slate-50">Upcoming</button>
            <button className="px-5 py-2 bg-white text-slate-600 border rounded-full text-sm font-medium hover:bg-slate-50">Submitted</button>
            <button className="px-5 py-2 bg-white text-slate-600 border rounded-full text-sm font-medium hover:bg-slate-50">Completed</button>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
            {loading ? (
              <div className="p-12 text-center text-slate-500">Loading your tasks...</div>
            ) : tasks.length === 0 ? (
              <div className="p-12 text-center text-slate-500">
                <p className="font-semibold text-lg text-slate-700">No tasks generated for today.</p>
                <p className="mt-2">Tasks are automatically generated at midnight. If you just created templates, please run the cron job manually in Supabase.</p>
              </div>
            ) : (
              tasks.map((task) => {
                const template = task.academy_task_assignments?.academy_task_templates;
                const reward = task.academy_task_assignments?.custom_reward_amount || template?.base_reward_amount;
                const isCompleted = task.status === 'approved' || task.status === 'submitted';
                
                return (
                  <div key={task.id} className="p-6 border-b border-slate-100 flex items-center justify-between">
                    <div>
                      <h3 className="font-bold text-slate-900 text-lg">{template?.name || 'Unknown Task'}</h3>
                      <p className="text-sm text-slate-500 mt-1">Today • Due {template?.due_time || task.due_time || 'EOD'}</p>
                      <div className="flex gap-2 mt-2">
                        <div className={`inline-flex px-2 py-1 text-xs font-semibold rounded capitalize ${
                          task.status === 'pending' ? 'bg-orange-50 text-orange-700' :
                          task.status === 'submitted' ? 'bg-blue-50 text-blue-700' :
                          'bg-green-50 text-green-700'
                        }`}>
                          {task.status}
                        </div>
                        {template?.leaderboard_points > 0 && (
                          <div className="inline-flex px-2 py-1 bg-purple-50 text-purple-700 text-xs font-semibold rounded flex items-center gap-1">
                            ⏳ {template.leaderboard_points} pts
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-6">
                      <span className="font-bold text-slate-900">₹{reward}</span>
                      {isCompleted ? (
                        <Button variant="secondary" className="bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-full px-6">View</Button>
                      ) : (
                        <Button className="bg-blue-600 hover:bg-blue-700 text-white rounded-full px-6">Open task</Button>
                      )}
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
