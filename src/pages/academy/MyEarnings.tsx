import React, { useEffect, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Wallet, Clock, TrendingUp, CheckCircle2, ArrowDownCircle, Loader2 } from 'lucide-react';

export default function MyEarnings() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'all' | 'approved' | 'submitted' | 'pending'>('all');

  useEffect(() => {
    if (user?.id) {
      fetchMyEarnings();
    }
  }, [user?.id]);

  const fetchMyEarnings = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('academy_tasks')
        .select(`
          id,
          status,
          task_date,
          due_time,
          submitted_at,
          created_at,
          academy_task_assignments!inner (
            facilitator_id,
            custom_reward_amount,
            academy_task_templates (
              name,
              category,
              base_reward_amount,
              leaderboard_points
            )
          )
        `)
        .eq('academy_task_assignments.facilitator_id', user.id)
        .order('task_date', { ascending: false });

      if (error) throw error;
      setTasks(data || []);
    } catch (err: any) {
      toast.error('Failed to load earnings data: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Calculate Real Financial Totals
  let approvedTotal = 0;
  let pendingTotal = 0;
  let possibleTotal = 0;
  let paidThisMonth = 0;

  const currentMonthPrefix = new Date().toISOString().slice(0, 7); // YYYY-MM

  tasks.forEach(t => {
    const template = t.academy_task_assignments?.academy_task_templates;
    const reward = Number(t.academy_task_assignments?.custom_reward_amount || template?.base_reward_amount || 0);

    if (t.status === 'approved') {
      approvedTotal += reward;
      if (t.task_date && t.task_date.startsWith(currentMonthPrefix)) {
        paidThisMonth += reward;
      }
    } else if (t.status === 'submitted') {
      pendingTotal += reward;
    } else if (t.status === 'pending') {
      possibleTotal += reward;
    }
  });

  const filteredTasks = tasks.filter(t => {
    if (activeTab === 'all') return true;
    return t.status === activeTab;
  });

  return (
    <DashboardLayout>
      <div className="p-6 max-w-5xl mx-auto space-y-8">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">My Earnings</h1>
          <p className="text-sm text-slate-500 mt-1">Real-time transparent approved, pending, and expected earnings.</p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-2xl p-6 shadow-xs border border-emerald-100 bg-gradient-to-br from-emerald-50/50 via-white to-white">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-semibold text-emerald-800">Approved Earnings</p>
              <div className="p-2 bg-emerald-100 text-emerald-700 rounded-lg">
                <CheckCircle2 className="h-4 w-4" />
              </div>
            </div>
            <h2 className="text-3xl font-black text-slate-900">₹{approvedTotal}</h2>
            <p className="text-xs text-emerald-700 font-medium mt-2">Verified & ready for payout</p>
          </div>

          <div className="bg-white rounded-2xl p-6 shadow-xs border border-blue-100 bg-gradient-to-br from-blue-50/50 via-white to-white">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-semibold text-blue-800">Pending Review</p>
              <div className="p-2 bg-blue-100 text-blue-700 rounded-lg">
                <Clock className="h-4 w-4" />
              </div>
            </div>
            <h2 className="text-3xl font-black text-slate-900">₹{pendingTotal}</h2>
            <p className="text-xs text-blue-700 font-medium mt-2">Submitted, under review</p>
          </div>

          <div className="bg-white rounded-2xl p-6 shadow-xs border border-amber-100 bg-gradient-to-br from-amber-50/50 via-white to-white">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-semibold text-amber-800">Possible Earnings</p>
              <div className="p-2 bg-amber-100 text-amber-700 rounded-lg">
                <TrendingUp className="h-4 w-4" />
              </div>
            </div>
            <h2 className="text-3xl font-black text-slate-900">₹{possibleTotal}</h2>
            <p className="text-xs text-amber-700 font-medium mt-2">Assigned upcoming tasks</p>
          </div>

          <div className="bg-white rounded-2xl p-6 shadow-xs border border-purple-100 bg-gradient-to-br from-purple-50/50 via-white to-white">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-semibold text-purple-800">Earned This Month</p>
              <div className="p-2 bg-purple-100 text-purple-700 rounded-lg">
                <Wallet className="h-4 w-4" />
              </div>
            </div>
            <h2 className="text-3xl font-black text-slate-900">₹{paidThisMonth}</h2>
            <p className="text-xs text-purple-700 font-medium mt-2">{new Date().toLocaleString('en-US', { month: 'long' })} total</p>
          </div>
        </div>

        {/* Ledger Section */}
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-bold text-slate-900">Earnings Ledger</h3>
              <p className="text-xs text-slate-500">Track task earnings across all approval stages.</p>
            </div>

            {/* Filter Tabs */}
            <div className="flex gap-2">
              <button
                onClick={() => setActiveTab('all')}
                className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                  activeTab === 'all' ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                }`}
              >
                All ({tasks.length})
              </button>
              <button
                onClick={() => setActiveTab('approved')}
                className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                  activeTab === 'approved' ? 'bg-emerald-600 text-white' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                }`}
              >
                Approved
              </button>
              <button
                onClick={() => setActiveTab('submitted')}
                className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                  activeTab === 'submitted' ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                }`}
              >
                Submitted
              </button>
              <button
                onClick={() => setActiveTab('pending')}
                className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                  activeTab === 'pending' ? 'bg-amber-600 text-white' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                }`}
              >
                Assigned
              </button>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-xs border border-slate-200 overflow-hidden">
            {loading ? (
              <div className="p-12 text-center text-slate-500 flex flex-col items-center gap-2">
                <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
                <span>Loading your real earnings data...</span>
              </div>
            ) : filteredTasks.length === 0 ? (
              <div className="p-12 text-center text-slate-500">
                <p className="font-semibold text-slate-700">No earnings records found for this filter.</p>
                <p className="text-xs text-slate-400 mt-1">Complete and submit assigned tasks to earn rewards!</p>
              </div>
            ) : (
              filteredTasks.map((task, idx) => {
                const template = task.academy_task_assignments?.academy_task_templates;
                const reward = Number(task.academy_task_assignments?.custom_reward_amount || template?.base_reward_amount || 0);
                const isApproved = task.status === 'approved';
                const isSubmitted = task.status === 'submitted';
                const isRejected = task.status === 'rejected';

                return (
                  <div 
                    key={task.id} 
                    className={`p-5 flex items-center justify-between hover:bg-slate-50/70 transition-colors ${
                      idx !== filteredTasks.length - 1 ? 'border-b border-slate-100' : ''
                    }`}
                  >
                    <div>
                      <h4 className="font-bold text-slate-900 text-base">{template?.name || 'Assigned Task'}</h4>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-xs text-slate-500">
                          {task.task_date || 'Today'}
                        </span>
                        <span className={`inline-flex px-2 py-0.5 text-[10px] font-bold rounded capitalize ${
                          isApproved ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                          isSubmitted ? 'bg-blue-50 text-blue-700 border border-blue-200' :
                          isRejected ? 'bg-red-50 text-red-700 border border-red-200' :
                          'bg-amber-50 text-amber-700 border border-amber-200'
                        }`}>
                          {isApproved ? 'Approved' : isSubmitted ? 'Pending Review' : isRejected ? 'Rejected' : 'Assigned'}
                        </span>
                      </div>
                    </div>

                    <div className="text-right">
                      {isApproved ? (
                        <div className="font-black text-emerald-600 text-lg">+₹{reward}</div>
                      ) : isSubmitted ? (
                        <div className="font-bold text-blue-600 text-base">₹{reward}</div>
                      ) : (
                        <div className="font-semibold text-slate-400 text-base">₹{reward}</div>
                      )}
                      <span className="text-[10px] text-slate-400 block font-medium">
                        {isApproved ? 'Credited' : isSubmitted ? 'Pending Manager' : 'Expected'}
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
