import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from "@/components/ui/button";
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export default function MyWork() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'today' | 'upcoming' | 'submitted' | 'completed'>('today');

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
          academy_task_assignments!inner (
            facilitator_id,
            custom_reward_amount,
            academy_task_templates (
              name,
              description,
              due_time,
              base_reward_amount,
              leaderboard_points,
              manager_approval_required,
              auto_approve_minutes
            )
          )
        `)
        .eq('academy_task_assignments.facilitator_id', user.id)
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

  const filteredTasks = tasks.filter(task => {
    if (activeTab === 'today') return true;
    if (activeTab === 'submitted') return task.status === 'submitted';
    if (activeTab === 'completed') return task.status === 'approved';
    return true;
  });

  return (
    <DashboardLayout>
      <div className="p-6 max-w-5xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">My Work</h1>
          <p className="text-sm text-slate-500 mt-1">See what is assigned, due and completed.</p>
        </div>
        <div className="space-y-6">
          <div className="flex gap-2">
            <button 
              onClick={() => setActiveTab('today')}
              className={`px-5 py-2 rounded-full text-sm font-medium transition-colors ${activeTab === 'today' ? 'bg-[#0f172a] text-white' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'}`}
            >
              Today
            </button>
            <button 
              onClick={() => setActiveTab('upcoming')}
              className={`px-5 py-2 rounded-full text-sm font-medium transition-colors ${activeTab === 'upcoming' ? 'bg-[#0f172a] text-white' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'}`}
            >
              Upcoming
            </button>
            <button 
              onClick={() => setActiveTab('submitted')}
              className={`px-5 py-2 rounded-full text-sm font-medium transition-colors ${activeTab === 'submitted' ? 'bg-[#0f172a] text-white' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'}`}
            >
              Submitted
            </button>
            <button 
              onClick={() => setActiveTab('completed')}
              className={`px-5 py-2 rounded-full text-sm font-medium transition-colors ${activeTab === 'completed' ? 'bg-[#0f172a] text-white' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'}`}
            >
              Completed
            </button>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
            {loading ? (
              <div className="p-12 text-center text-slate-500">Loading your tasks...</div>
            ) : filteredTasks.length === 0 ? (
              <div className="p-12 text-center text-slate-500">
                <p className="font-semibold text-lg text-slate-700">No tasks found.</p>
                <p className="mt-2 text-sm">Tasks are automatically generated at midnight. If you just created templates, please run the task generator.</p>
              </div>
            ) : (
              filteredTasks.map((task) => {
                const template = task.academy_task_assignments?.academy_task_templates;
                const reward = task.academy_task_assignments?.custom_reward_amount || template?.base_reward_amount || 20;
                const isCompleted = task.status === 'approved' || task.status === 'submitted';
                const isRejected = task.status === 'rejected';
                
                return (
                  <div key={task.id} className="p-6 border-b border-slate-100 flex items-center justify-between hover:bg-slate-50/50 transition-colors">
                    <div>
                      <h3 className="font-bold text-slate-900 text-lg">{template?.name || 'Unknown Task'}</h3>
                      <p className="text-sm text-slate-500 mt-1">Today • Due {template?.due_time || task.due_time || 'EOD'}</p>
                      <div className="flex gap-2 mt-2">
                        <div className={`inline-flex px-2.5 py-0.5 text-xs font-semibold rounded capitalize ${
                          task.status === 'pending' ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                          task.status === 'submitted' ? 'bg-blue-50 text-blue-700 border border-blue-200' :
                          task.status === 'rejected' ? 'bg-red-50 text-red-700 border border-red-200' :
                          'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        }`}>
                          {task.status}
                        </div>
                        {template?.leaderboard_points > 0 && (
                          <div className="inline-flex px-2 py-0.5 bg-purple-50 text-purple-700 text-xs font-semibold rounded border border-purple-200 flex items-center gap-1">
                            ⏳ {template.leaderboard_points} pts
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-6">
                      <span className="font-bold text-slate-900 text-lg">₹{reward}</span>
                      <Button 
                        className={`rounded-full px-6 text-sm font-semibold transition-all ${
                          isCompleted && !isRejected
                            ? 'bg-slate-100 hover:bg-slate-200 text-slate-700' 
                            : isRejected
                            ? 'bg-red-600 hover:bg-red-700 text-white'
                            : 'bg-blue-600 hover:bg-blue-700 text-white shadow-xs'
                        }`}
                        onClick={() => navigate(`/academy/my-work/${task.id}`)}
                      >
                        {isCompleted && !isRejected ? 'View' : isRejected ? 'Resubmit' : 'Open task'}
                      </Button>
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
