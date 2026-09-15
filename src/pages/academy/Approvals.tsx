import React, { useEffect, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { 
  CheckCircle2, AlertCircle, Clock, ExternalLink, Search, 
  FileText, Link2, ShieldCheck, User, Sparkles, Filter
} from 'lucide-react';

export default function Approvals() {
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'submitted' | 'approved' | 'rejected' | 'all'>('submitted');

  // Reject dialog state
  const [isRejectDialogOpen, setIsRejectDialogOpen] = useState(false);
  const [selectedSubForReject, setSelectedSubForReject] = useState<any>(null);
  const [rejectComment, setRejectComment] = useState("");
  const [rejectDueDate, setRejectDueDate] = useState<string>('');
  const [rejectDueTime, setRejectDueTime] = useState<string>('23:59');
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    fetchSubmissions();
  }, []);

  const fetchSubmissions = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('academy_submissions')
        .select(`
          *,
          academy_tasks!inner (
            id,
            status,
            task_date,
            due_time,
            auto_approve_at,
            manager_approval_required,
            auto_approve_minutes,
            academy_task_assignments (
              custom_reward_amount,
              user_profiles (full_name),
              academy_task_templates (
                name,
                category,
                base_reward_amount,
                leaderboard_points
              )
            )
          )
        `)
        .order('submitted_at', { ascending: false });

      if (error) throw error;
      setSubmissions(data || []);
    } catch (err: any) {
      toast.error('Failed to load approvals: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (submission: any) => {
    setIsProcessing(true);
    try {
      // Approve the task
      const { error: taskError } = await supabase
        .from('academy_tasks')
        .update({ status: 'approved' })
        .eq('id', submission.task_id);
      
      if (taskError) throw taskError;

      // Update submission metadata
      const { error: subError } = await supabase
        .from('academy_submissions')
        .update({ 
          reviewed_at: new Date().toISOString(),
          reviewer_comments: "Approved by manager"
        })
        .eq('id', submission.id);

      if (subError) throw subError;

      toast.success('Task submission approved successfully!');
      fetchSubmissions();
    } catch (err: any) {
      toast.error('Error approving submission: ' + err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReject = async () => {
    if (!selectedSubForReject) return;
    setIsProcessing(true);
    try {
      // Reject the task and set new resubmission deadline
      const { error: taskError } = await (supabase as any)
        .from('academy_tasks')
        .update({ 
          status: 'rejected',
          task_date: rejectDueDate || new Date().toISOString().split('T')[0],
          due_time: rejectDueTime || '23:59'
        })
        .eq('id', selectedSubForReject.task_id);
      
      if (taskError) throw taskError;

      // Add reviewer comment
      const { error: subError } = await supabase
        .from('academy_submissions')
        .update({ 
          reviewed_at: new Date().toISOString(),
          reviewer_comments: rejectComment
        })
        .eq('id', selectedSubForReject.id);

      if (subError) throw subError;

      toast.success('Task rejected with new resubmission deadline set!');
      setIsRejectDialogOpen(false);
      fetchSubmissions();
    } catch (err: any) {
      toast.error('Error rejecting submission: ' + err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  // Filter logic
  const filteredSubmissions = submissions.filter(sub => {
    const task = sub.academy_tasks;
    const assignment = task?.academy_task_assignments;
    const template = assignment?.academy_task_templates;
    const facName = (assignment?.user_profiles?.full_name || '').toLowerCase();
    const taskName = (template?.name || '').toLowerCase();
    const query = searchQuery.toLowerCase().trim();

    const matchesSearch = !query || facName.includes(query) || taskName.includes(query);
    const matchesStatus = statusFilter === 'all' || task.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const pendingCount = submissions.filter(s => s.academy_tasks?.status === 'submitted').length;
  const approvedCount = submissions.filter(s => s.academy_tasks?.status === 'approved').length;
  const rejectedCount = submissions.filter(s => s.academy_tasks?.status === 'rejected').length;

  return (
    <DashboardLayout>
      <div className="p-6 max-w-6xl mx-auto space-y-6">
        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Approvals</h1>
            <p className="text-sm text-slate-500 mt-1">Review submission evidence before earnings are credited.</p>
          </div>

          {/* Search & Filter Controls */}
          <div className="flex items-center gap-3">
            <div className="relative min-w-[240px]">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Search facilitator or task..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 bg-white text-sm border-slate-200"
              />
            </div>
          </div>
        </div>

        {/* Status Filter Tabs */}
        <div className="flex items-center gap-2 border-b border-slate-200 pb-3">
          <button
            onClick={() => setStatusFilter('submitted')}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors flex items-center gap-2 ${
              statusFilter === 'submitted'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            <Clock className="h-4 w-4" />
            Pending Review
            <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
              statusFilter === 'submitted' ? 'bg-blue-700 text-white' : 'bg-slate-100 text-slate-700'
            }`}>
              {pendingCount}
            </span>
          </button>

          <button
            onClick={() => setStatusFilter('approved')}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors flex items-center gap-2 ${
              statusFilter === 'approved'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            <ShieldCheck className="h-4 w-4" />
            Approved
            <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
              statusFilter === 'approved' ? 'bg-emerald-700 text-white' : 'bg-slate-100 text-slate-700'
            }`}>
              {approvedCount}
            </span>
          </button>

          <button
            onClick={() => setStatusFilter('rejected')}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors flex items-center gap-2 ${
              statusFilter === 'rejected'
                ? 'bg-red-600 text-white shadow-xs'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            <AlertCircle className="h-4 w-4" />
            Rejected
            <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
              statusFilter === 'rejected' ? 'bg-red-700 text-white' : 'bg-slate-100 text-slate-700'
            }`}>
              {rejectedCount}
            </span>
          </button>

          <button
            onClick={() => setStatusFilter('all')}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
              statusFilter === 'all'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            All Submissions ({submissions.length})
          </button>
        </div>

        {/* Table Container */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase text-xs tracking-wider">
                <tr>
                  <th className="px-6 py-4">Facilitator & Task</th>
                  <th className="px-6 py-4">Submission Date</th>
                  <th className="px-6 py-4">Submitted Evidence</th>
                  <th className="px-6 py-4">Reward & Points</th>
                  <th className="px-6 py-4 text-center">Status</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-slate-500">Loading submissions...</td>
                  </tr>
                ) : filteredSubmissions.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                      No submissions found for the selected filter.
                    </td>
                  </tr>
                ) : (
                  filteredSubmissions.map((sub) => {
                    const task = sub.academy_tasks;
                    const assignment = task?.academy_task_assignments;
                    const template = assignment?.academy_task_templates;
                    const reward = assignment?.custom_reward_amount || template?.base_reward_amount || 20;
                    const facName = assignment?.user_profiles?.full_name || 'Unknown User';

                    // Evidence link parsing
                    const rawPhoto = sub.photo_url || '';
                    let linksList: string[] = [];

                    if (rawPhoto.startsWith('{') && rawPhoto.endsWith('}')) {
                      try {
                        const parsed = JSON.parse(rawPhoto);
                        linksList = Object.values(parsed).filter((v: any) => typeof v === 'string' && v.trim() !== '') as string[];
                      } catch(e) {}
                    } else if (rawPhoto) {
                      linksList = rawPhoto.split(',').filter(Boolean);
                    }

                    return (
                      <tr key={sub.id} className="hover:bg-slate-50/70 transition-colors">
                        {/* Facilitator & Task */}
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="p-2.5 bg-blue-50 text-blue-700 rounded-xl border border-blue-100">
                              <User className="h-5 w-5" />
                            </div>
                            <div>
                              <div className="font-bold text-slate-900 text-base">{facName}</div>
                              <div className="text-xs text-slate-500 font-medium mt-0.5 flex items-center gap-2">
                                <span>{template?.name || 'Task'}</span>
                                {template?.category && (
                                  <Badge variant="outline" className="capitalize text-[10px] bg-slate-50 text-slate-600 px-1.5 py-0">
                                    {template.category}
                                  </Badge>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Submission Date */}
                        <td className="px-6 py-4 text-slate-600">
                          <div className="font-medium text-slate-900">
                            {new Date(sub.submitted_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </div>
                          <div className="text-xs text-slate-500">
                            {new Date(sub.submitted_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </td>

                        {/* Submitted Evidence */}
                        <td className="px-6 py-4 max-w-xs">
                          <div className="space-y-1.5">
                            {sub.submission_note && (
                              <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 leading-relaxed font-medium">
                                <span className="font-bold text-slate-900 block mb-0.5">Note:</span>
                                {sub.submission_note}
                              </div>
                            )}

                            {linksList.length > 0 && (
                              <div className="flex flex-wrap gap-1.5">
                                {linksList.map((link, lIdx) => (
                                  <Button
                                    key={lIdx}
                                    variant="outline"
                                    size="sm"
                                    className="h-7 text-xs gap-1 border-blue-200 text-blue-700 bg-blue-50 hover:bg-blue-100"
                                    onClick={() => window.open(link.trim(), '_blank')}
                                  >
                                    <Link2 className="h-3 w-3" />
                                    <span>Evidence {linksList.length > 1 ? lIdx + 1 : ''}</span>
                                    <ExternalLink className="h-3 w-3 ml-0.5" />
                                  </Button>
                                ))}
                              </div>
                            )}

                            {!sub.submission_note && linksList.length === 0 && (
                              <span className="text-xs text-slate-400 italic">No notes or links attached</span>
                            )}
                          </div>
                        </td>

                        {/* Reward & Points */}
                        <td className="px-6 py-4">
                          <div className="font-black text-slate-900 text-base">₹{reward}</div>
                          {template?.leaderboard_points > 0 && (
                            <div className="inline-flex px-2 py-0.5 bg-purple-50 text-purple-700 border border-purple-200 text-xs font-semibold rounded-md mt-1">
                              ⏳ +{template.leaderboard_points} pts
                            </div>
                          )}
                        </td>

                        {/* Status */}
                        <td className="px-6 py-4 text-center">
                          {task?.status === 'submitted' && (
                            <span className="inline-flex px-3 py-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-full text-xs font-bold items-center gap-1">
                              <Clock className="h-3.5 w-3.5" /> Pending
                            </span>
                          )}
                          {task?.status === 'approved' && (
                            <span className="inline-flex px-3 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full text-xs font-bold items-center gap-1">
                              <ShieldCheck className="h-3.5 w-3.5" /> Approved
                            </span>
                          )}
                          {task?.status === 'rejected' && (
                            <span className="inline-flex px-3 py-1 bg-red-50 text-red-700 border border-red-200 rounded-full text-xs font-bold items-center gap-1">
                              <AlertCircle className="h-3.5 w-3.5" /> Rejected
                            </span>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="px-6 py-4 text-right">
                          {task?.status === 'submitted' ? (
                            <div className="flex items-center justify-end gap-2">
                              <Button 
                                variant="outline" 
                                size="sm"
                                className="text-red-600 border-red-200 bg-red-50 hover:bg-red-100 font-semibold h-8 rounded-lg"
                                onClick={() => {
                                  setSelectedSubForReject(sub);
                                  setRejectComment("");
                                  const today = new Date().toISOString().split('T')[0];
                                  setRejectDueDate(sub.academy_tasks?.task_date || today);
                                  setRejectDueTime(sub.academy_tasks?.due_time || "23:59");
                                  setIsRejectDialogOpen(true);
                                }}
                              >
                                Reject
                              </Button>
                              <Button 
                                size="sm"
                                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold h-8 px-5 rounded-lg shadow-xs"
                                onClick={() => handleApprove(sub)}
                                disabled={isProcessing}
                              >
                                Approve
                              </Button>
                            </div>
                          ) : (
                            <span className="text-xs text-slate-400 font-medium italic">Reviewed</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Reject Dialog */}
      <Dialog open={isRejectDialogOpen} onOpenChange={setIsRejectDialogOpen}>
        <DialogContent className="max-w-md bg-white">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-red-600" /> Reject Task Submission
            </DialogTitle>
            <DialogDescription className="text-sm text-slate-500 mt-1">
              Provide feedback and set a new resubmission deadline for the facilitator.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-xs font-semibold text-slate-700 mb-1.5 block">Rejection Feedback / Reason</label>
              <Textarea 
                placeholder="e.g. Please upload a clear photo of the session attendance sheet..." 
                value={rejectComment}
                onChange={(e) => setRejectComment(e.target.value)}
                rows={3}
                className="resize-none bg-slate-50 text-sm"
              />
            </div>

            <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
              <div>
                <label className="text-xs font-semibold text-slate-700 mb-1 block">New Due Date</label>
                <Input 
                  type="date"
                  value={rejectDueDate}
                  onChange={(e) => setRejectDueDate(e.target.value)}
                  className="bg-white text-xs h-9"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-700 mb-1 block">New Due Time</label>
                <Input 
                  type="time"
                  value={rejectDueTime}
                  onChange={(e) => setRejectDueTime(e.target.value)}
                  className="bg-white text-xs h-9"
                />
              </div>
            </div>
          </div>
          <DialogFooter className="flex gap-2 justify-end pt-2">
            <Button variant="outline" onClick={() => setIsRejectDialogOpen(false)} disabled={isProcessing}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleReject} disabled={isProcessing || !rejectComment.trim()}>
              {isProcessing ? 'Processing...' : 'Reject Submission'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
