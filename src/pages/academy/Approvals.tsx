import React, { useEffect, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from "@/components/ui/button";
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

export default function Approvals() {
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Reject dialog state
  const [isRejectDialogOpen, setIsRejectDialogOpen] = useState(false);
  const [selectedSubForReject, setSelectedSubForReject] = useState<any>(null);
  const [rejectComment, setRejectComment] = useState("");
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
            academy_task_assignments (
              custom_reward_amount,
              user_profiles (full_name),
              academy_task_templates (
                name,
                base_reward_amount,
                leaderboard_points
              )
            )
          )
        `)
        .eq('academy_tasks.status', 'submitted')
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
          reviewer_comments: "Approved"
        })
        .eq('id', submission.id);

      if (subError) throw subError;

      // Ideally here we would also insert into academy_leaderboard_points if applicable
      // and maybe trigger payment processing

      toast.success('Task approved!');
      fetchSubmissions();
    } catch (err: any) {
      toast.error('Error approving: ' + err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReject = async () => {
    if (!selectedSubForReject) return;
    setIsProcessing(true);
    try {
      // Reject the task
      const { error: taskError } = await supabase
        .from('academy_tasks')
        .update({ status: 'rejected' })
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

      toast.success('Task rejected for changes.');
      setIsRejectDialogOpen(false);
      fetchSubmissions();
    } catch (err: any) {
      toast.error('Error rejecting: ' + err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="p-6 max-w-5xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Approvals</h1>
          <p className="text-sm text-slate-500 mt-1">Review evidence before earnings are credited.</p>
        </div>
        <div className="space-y-6">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
            {loading ? (
              <div className="p-12 text-center text-slate-500">Loading submissions...</div>
            ) : submissions.length === 0 ? (
              <div className="p-12 text-center text-slate-500">
                No pending approvals at the moment!
              </div>
            ) : (
              submissions.map((sub) => {
                const task = sub.academy_tasks;
                const assignment = task.academy_task_assignments;
                const template = assignment.academy_task_templates;
                const reward = assignment.custom_reward_amount || template.base_reward_amount;
                const facName = assignment.user_profiles?.full_name || 'Unknown User';

                return (
                  <div key={sub.id} className="p-6 border-b border-slate-100 flex flex-col md:flex-row justify-between md:items-center gap-4">
                    <div>
                      <h3 className="font-bold text-slate-900 text-lg">{facName} — {template.name}</h3>
                      <p className="text-sm text-slate-500 mt-1">Submitted {new Date(sub.submitted_at).toLocaleString()}</p>
                      
                      {(sub.photo_url || sub.submission_note) && (
                        <div className="mt-3 bg-slate-50 p-3 rounded-lg text-sm text-slate-700">
                          {sub.photo_url && (
                            <div className="mb-2">
                              <strong>Link: </strong>
                              <a href={sub.photo_url} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline break-all">
                                {sub.photo_url}
                              </a>
                            </div>
                          )}
                          {sub.submission_note && (
                            <div>
                              <strong>Note: </strong> {sub.submission_note}
                            </div>
                          )}
                        </div>
                      )}

                      <div className="flex gap-2 mt-3">
                        {template.leaderboard_points > 0 && (
                          <span className="inline-flex px-3 py-1 bg-purple-50 text-purple-700 text-xs font-semibold rounded-full flex items-center gap-1">
                            ⏳ {template.leaderboard_points} pts
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="font-bold text-slate-900 text-lg">₹{reward}</span>
                      <Button 
                        variant="outline" 
                        className="text-red-500 border-red-200 bg-red-50 hover:bg-red-100 hover:text-red-600 rounded-lg"
                        onClick={() => {
                          setSelectedSubForReject(sub);
                          setRejectComment("");
                          setIsRejectDialogOpen(true);
                        }}
                      >
                        Needs change
                      </Button>
                      <Button 
                        className="bg-[#10b981] hover:bg-[#059669] text-white rounded-lg px-6"
                        onClick={() => handleApprove(sub)}
                        disabled={isProcessing}
                      >
                        Approve
                      </Button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Reject Dialog */}
      <Dialog open={isRejectDialogOpen} onOpenChange={setIsRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Submission</DialogTitle>
            <DialogDescription>
              Provide feedback on why this submission needs changes. The facilitator will be notified.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <Textarea 
              placeholder="Please upload a clearer picture..." 
              value={rejectComment}
              onChange={(e) => setRejectComment(e.target.value)}
              rows={4}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsRejectDialogOpen(false)} disabled={isProcessing}>Cancel</Button>
            <Button variant="destructive" onClick={handleReject} disabled={isProcessing || !rejectComment.trim()}>
              {isProcessing ? 'Processing...' : 'Reject for changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
