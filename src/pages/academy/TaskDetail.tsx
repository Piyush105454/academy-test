import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { 
  ArrowLeft, CheckCircle2, Clock, CalendarDays, BookOpen, 
  FileText, Image as ImageIcon, Link2, Trophy, AlertCircle, 
  Upload, X, Loader2, ExternalLink, ShieldCheck, FileCheck
} from 'lucide-react';
import { GoogleDriveResumableUploader } from '@/utils/GoogleDriveResumableUploader';

interface TaskRequirement {
  id: string;
  title: string;
  type: 'text' | 'image' | 'pdf' | 'link';
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bgClass: string; icon: React.ElementType }> = {
  pending:   { label: 'Pending',   color: 'text-amber-700 border-amber-200 bg-amber-50', bgClass: 'bg-amber-100 text-amber-800', icon: Clock },
  submitted: { label: 'Submitted', color: 'text-blue-700 border-blue-200 bg-blue-50',    bgClass: 'bg-blue-100 text-blue-800',  icon: CheckCircle2 },
  approved:  { label: 'Approved',  color: 'text-green-700 border-green-200 bg-green-50', bgClass: 'bg-green-100 text-green-800', icon: ShieldCheck },
  rejected:  { label: 'Rejected',  color: 'text-red-700 border-red-200 bg-red-50',       bgClass: 'bg-red-100 text-red-800',    icon: AlertCircle },
};

export default function AcademyTaskDetail() {
  const { taskId } = useParams<{ taskId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [taskData, setTaskData] = useState<any | null>(null);
  const [submission, setSubmission] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form State
  const [submissionNote, setSubmissionNote] = useState('');
  const [submissionLinks, setSubmissionLinks] = useState<Record<string, string>>({});
  const [uploadingReqId, setUploadingReqId] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);

  useEffect(() => {
    if (taskId) {
      fetchTaskDetail();
    }
  }, [taskId]);

  const fetchTaskDetail = async () => {
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
              id,
              name,
              category,
              description,
              due_time,
              base_reward_amount,
              leaderboard_points,
              requires_note,
              requires_photo,
              manager_approval_required,
              auto_approve_minutes
            )
          ),
          academy_submissions (
            id,
            submission_note,
            photo_url,
            submitted_at,
            reviewed_at,
            reviewer_comments
          )
        `)
        .eq('id', taskId)
        .single();

      if (error) throw error;
      setTaskData(data);

      const existingSub = Array.isArray(data.academy_submissions) 
        ? data.academy_submissions[0] 
        : data.academy_submissions;
        
      setSubmission(existingSub || null);

      if (existingSub) {
        setSubmissionNote(existingSub.submission_note || '');
        
        // Parse photo_url links map if structured
        const rawPhoto = existingSub.photo_url || '';
        if (rawPhoto.startsWith('{') && rawPhoto.endsWith('}')) {
          try {
            setSubmissionLinks(JSON.parse(rawPhoto));
          } catch(e) {
            setSubmissionLinks({ default: rawPhoto });
          }
        } else if (rawPhoto) {
          setSubmissionLinks({ 'req-photo': rawPhoto, 'req-doc': rawPhoto, 'req-link': rawPhoto });
        }
      }
    } catch (err: any) {
      console.error(err);
      toast.error('Failed to load task details: ' + err.message);
      navigate('/academy/my-work');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
          <Loader2 className="h-10 w-10 animate-spin text-blue-600" />
          <p className="text-sm font-medium text-slate-500">Loading task details...</p>
        </div>
      </DashboardLayout>
    );
  }

  if (!taskData) return null;

  const template = taskData.academy_task_assignments?.academy_task_templates;
  const reward = taskData.academy_task_assignments?.custom_reward_amount || template?.base_reward_amount || 20;
  const statusCfg = STATUS_CONFIG[taskData.status] || STATUS_CONFIG.pending;
  const StatusIcon = statusCfg.icon;

  // Clean description string from hidden tags
  let rawDesc = template?.description || '';
  rawDesc = rawDesc.replace(/__AUTOAPPROVE\[.*?\]__/g, '').replace(/__REQS\[.*?\]__/g, '').trim();

  // Extract submission requirements
  const requirements: TaskRequirement[] = [];
  
  if (template?.requires_note ?? true) {
    requirements.push({ id: 'req-note', title: 'Text Note / Context Summary', type: 'text' });
  }
  if (template?.requires_photo ?? true) {
    requirements.push({ id: 'req-photo', title: 'Photo(s) / Image Evidence', type: 'image' });
  }
  // Check description tags or default doc/link
  if (template?.description?.includes('Document') || template?.requires_doc) {
    requirements.push({ id: 'req-doc', title: 'Document (PDF / Word File)', type: 'pdf' });
  }
  if (template?.description?.includes('Link') || template?.requires_link) {
    requirements.push({ id: 'req-link', title: 'Google Drive / External Link', type: 'link' });
  }

  const managerApprovalReq = taskData.manager_approval_required ?? template?.manager_approval_required ?? true;
  const autoApproveMins = taskData.auto_approve_minutes ?? template?.auto_approve_minutes;

  // Handle File Upload directly to Google Drive
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, reqId: string) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    try {
      setUploadingReqId(reqId);
      setUploadProgress(0);
      const { data: { session } } = await supabase.auth.getSession();
      
      const folderPath = ["ACADEMY_TEACHER_TASKS", template?.name || 'Task_Submissions', user?.id || 'User'];
      const newLinks: string[] = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const uploader = new GoogleDriveResumableUploader({
          file,
          folderPath,
          supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
          accessToken: session?.access_token || '',
          onProgress: (percent) => setUploadProgress(percent),
          chunkSize: 10 * 1024 * 1024
        });

        const result = await uploader.upload();
        newLinks.push(result.webViewLink);
      }

      setSubmissionLinks(prev => {
        const existing = prev[reqId] ? prev[reqId].split(',').filter(Boolean) : [];
        return {
          ...prev,
          [reqId]: [...existing, ...newLinks].join(',')
        };
      });

      toast.success('File uploaded successfully!');
    } catch (err: any) {
      console.error(err);
      toast.error('Upload failed: ' + err.message);
    } finally {
      setUploadingReqId(null);
      setUploadProgress(0);
      e.target.value = '';
    }
  };

  const handleRemoveLink = (reqId: string, linkToRemove: string) => {
    setSubmissionLinks(prev => {
      const existing = prev[reqId] ? prev[reqId].split(',').filter(Boolean) : [];
      const updated = existing.filter(l => l.trim() !== linkToRemove.trim());
      return {
        ...prev,
        [reqId]: updated.join(',')
      };
    });
  };

  const handleSubmitTask = async () => {
    setIsSubmitting(true);
    try {
      const now = new Date();
      let newStatus = 'submitted';
      let autoApproveAt: string | null = null;
      let reviewedAt: string | null = null;

      if (!managerApprovalReq) {
        if (autoApproveMins === 0) {
          newStatus = 'approved';
          reviewedAt = now.toISOString();
        } else if (autoApproveMins && autoApproveMins > 0) {
          autoApproveAt = new Date(now.getTime() + autoApproveMins * 60 * 1000).toISOString();
        }
      }

      // Format photo_url field
      const serializedLinks = JSON.stringify(submissionLinks);
      const firstDirectLink = Object.values(submissionLinks).find(l => l.trim() !== '') || '';

      // Upsert submission
      const { error: submitError } = await supabase
        .from('academy_submissions')
        .upsert({
          task_id: taskData.id,
          submission_note: submissionNote,
          photo_url: serializedLinks !== '{}' ? serializedLinks : firstDirectLink,
          submitted_at: now.toISOString(),
          ...(newStatus === 'approved' ? { reviewed_at: reviewedAt, reviewer_comments: 'Auto-Approved immediately' } : {})
        } as any, { onConflict: 'task_id' });

      if (submitError) throw submitError;

      // Update task record
      const { error: updateError } = await (supabase as any)
        .from('academy_tasks')
        .update({
          status: newStatus,
          submitted_at: now.toISOString(),
          auto_approve_at: autoApproveAt,
          manager_approval_required: managerApprovalReq,
          auto_approve_minutes: autoApproveMins
        })
        .eq('id', taskData.id);

      if (updateError) throw updateError;

      if (newStatus === 'approved') {
        toast.success('Task submitted and instantly auto-approved!');
      } else if (autoApproveAt) {
        toast.success(`Task submitted! Auto-approves in ${autoApproveMins < 60 ? `${autoApproveMins}m` : `${autoApproveMins / 60}h`}.`);
      } else {
        toast.success('Task submitted for manager review!');
      }

      await fetchTaskDetail();
    } catch (err: any) {
      toast.error('Error submitting task: ' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const isCompletedOrApproved = taskData.status === 'approved';
  const isRejected = taskData.status === 'rejected';

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto space-y-6 pb-12">
        {/* Navigation Bar */}
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            className="gap-2 text-slate-600 hover:text-slate-900"
            onClick={() => navigate('/academy/my-work')}
          >
            <ArrowLeft className="h-4 w-4" /> Back to My Work
          </Button>
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full border ${statusCfg.color}`}>
              <StatusIcon className="h-3.5 w-3.5" />
              {statusCfg.label}
            </span>
          </div>
        </div>

        {/* Task Header & Details Card */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 md:p-8 shadow-sm space-y-6">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 border-b border-slate-100 pb-6">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Badge variant="outline" className="capitalize bg-blue-50 text-blue-700 border-blue-200 font-semibold">
                  {template?.category || 'Task'}
                </Badge>
                {managerApprovalReq ? (
                  <Badge variant="outline" className="bg-amber-50 text-amber-800 border-amber-200">
                    Manager Review Required
                  </Badge>
                ) : (
                  <Badge variant="outline" className="bg-emerald-50 text-emerald-800 border-emerald-200">
                    Auto-Approve Enabled ({autoApproveMins === 0 ? 'Immediate' : `${autoApproveMins / 60}h`})
                  </Badge>
                )}
              </div>
              <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight">
                {template?.name || 'Task Detail'}
              </h1>
              <p className="text-sm text-slate-500 mt-1 flex items-center gap-4">
                <span className="flex items-center gap-1">
                  <CalendarDays className="h-4 w-4 text-slate-400" />
                  Date: {taskData.task_date || 'Today'}
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="h-4 w-4 text-slate-400" />
                  Due Time: {template?.due_time || taskData.due_time || 'EOD'}
                </span>
              </p>
            </div>

            <div className="flex items-center gap-3 bg-slate-50 p-4 rounded-xl border border-slate-100 self-start">
              <div className="text-right">
                <p className="text-xs text-slate-500 font-medium uppercase">Reward</p>
                <p className="text-2xl font-black text-slate-900">₹{reward}</p>
              </div>
              {template?.leaderboard_points > 0 && (
                <div className="border-l border-slate-200 pl-3 text-right">
                  <p className="text-xs text-purple-600 font-medium uppercase">Points</p>
                  <p className="text-lg font-bold text-purple-700">⏳ +{template.leaderboard_points} pts</p>
                </div>
              )}
            </div>
          </div>

          {/* Description Section */}
          <div className="space-y-2">
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-blue-600" /> Task Overview & Instructions
            </h3>
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-100 text-sm text-slate-700 leading-relaxed whitespace-pre-line">
              {rawDesc || 'Complete the assigned task and submit the requested evidence below.'}
            </div>
          </div>

          {/* Submission Requirements Summary Banner */}
          <div className="p-4 rounded-xl bg-blue-50/60 border border-blue-100 space-y-2">
            <h4 className="text-xs font-bold text-blue-900 uppercase tracking-wider flex items-center gap-1.5">
              <FileCheck className="h-4 w-4 text-blue-600" /> Required Submission Evidence
            </h4>
            <div className="flex flex-wrap gap-2 pt-1">
              {requirements.map((req) => (
                <div key={req.id} className="inline-flex items-center gap-1.5 bg-white text-blue-800 border border-blue-200 px-3 py-1.5 rounded-lg text-xs font-semibold shadow-xs">
                  {req.type === 'text' && <FileText className="h-3.5 w-3.5 text-blue-600" />}
                  {req.type === 'image' && <ImageIcon className="h-3.5 w-3.5 text-blue-600" />}
                  {req.type === 'pdf' && <FileText className="h-3.5 w-3.5 text-blue-600" />}
                  {req.type === 'link' && <Link2 className="h-3.5 w-3.5 text-blue-600" />}
                  <span>{req.title}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Rejection Alert */}
          {isRejected && (
            <div className="p-5 rounded-xl bg-red-50 border-2 border-red-200 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-red-200 pb-2">
                <div className="flex items-center gap-2 text-red-800 font-bold text-sm">
                  <AlertCircle className="h-5 w-5 text-red-600" /> Task Rejected — Resubmission Required
                </div>
                <div className="flex items-center gap-1.5 bg-red-100 text-red-800 px-3 py-1 rounded-full text-xs font-bold border border-red-200 self-start sm:self-auto">
                  <CalendarDays className="h-3.5 w-3.5 text-red-600" />
                  <span>Resubmission Deadline: {taskData.task_date || 'Today'} {taskData.due_time ? `at ${taskData.due_time}` : ''}</span>
                </div>
              </div>
              <p className="text-sm text-red-800 font-medium">
                <strong>Reviewer Reason:</strong> {submission?.reviewer_comments || 'Your submission requires updates. Please check instructions, update your evidence below, and resubmit.'}
              </p>
            </div>
          )}

          {/* Approved Alert */}
          {isCompletedOrApproved && (
            <div className="p-5 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-100 text-emerald-700 rounded-full">
                  <ShieldCheck className="h-6 w-6" />
                </div>
                <div>
                  <h4 className="font-bold text-emerald-900 text-sm">Task Approved & Earnings Credited</h4>
                  <p className="text-xs text-emerald-700 mt-0.5">
                    {submission?.reviewed_at ? `Approved on ${new Date(submission.reviewed_at).toLocaleDateString()}` : 'Your work has been successfully verified.'}
                  </p>
                </div>
              </div>
              <Badge className="bg-emerald-600 text-white font-bold px-3 py-1">₹{reward} Earned</Badge>
            </div>
          )}
        </div>

        {/* Task Submission Form Card */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 md:p-8 shadow-sm space-y-6">
          <div className="border-b border-slate-100 pb-4">
            <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              <CheckCircle2 className="h-6 w-6 text-blue-600" />
              {submission ? (isRejected ? 'Resubmit Your Work' : 'Your Submission Evidence') : 'Submit Your Work'}
            </h2>
            <p className="text-xs text-slate-500 mt-1">Provide all requested evidence according to the task submission requirements.</p>
          </div>

          <div className="space-y-6">
            {/* Requirement Input Sections */}
            {requirements.map((req, idx) => {
              const currentLinkVal = submissionLinks[req.id] || '';
              const linkList = currentLinkVal ? currentLinkVal.split(',').filter(Boolean) : [];

              return (
                <div key={req.id} className="p-5 rounded-xl bg-slate-50/70 border border-slate-200 space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-bold text-slate-800 flex items-center gap-2">
                      <span className="bg-blue-100 text-blue-800 px-2 py-0.5 rounded text-xs">Requirement {idx + 1}</span>
                      {req.title}
                    </Label>
                    <span className="text-xs text-slate-500 font-mono capitalize">{req.type}</span>
                  </div>

                  {req.type === 'text' && (
                    <Textarea
                      placeholder="Enter detailed notes, context, or summary of your task work..."
                      value={submissionNote}
                      onChange={(e) => setSubmissionNote(e.target.value)}
                      rows={4}
                      className="bg-white resize-none"
                    />
                  )}

                  {(req.type === 'image' || req.type === 'pdf') && (
                    <div className="space-y-3">
                      <label 
                        className={`flex flex-col items-center justify-center border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all bg-white border-slate-300 hover:border-blue-500 hover:bg-blue-50/20 ${uploadingReqId === req.id ? 'opacity-50 cursor-not-allowed' : ''}`}
                      >
                        <input
                          type="file"
                          multiple
                          className="hidden"
                          disabled={uploadingReqId === req.id}
                          accept={req.type === 'image' ? 'image/*' : '.pdf,.doc,.docx'}
                          onChange={(e) => handleFileUpload(e, req.id)}
                        />
                        {uploadingReqId === req.id ? (
                          <div className="flex flex-col items-center gap-2 py-2">
                            <Loader2 className="h-8 w-8 text-blue-600 animate-spin" />
                            <p className="text-xs font-semibold text-blue-700">Uploading to Drive... {uploadProgress}%</p>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center gap-2">
                            <div className="p-3 bg-blue-50 text-blue-600 rounded-full">
                              <Upload className="h-5 w-5" />
                            </div>
                            <div>
                              <span className="text-sm font-bold text-blue-600 hover:underline">Click to upload file(s)</span>
                              <p className="text-xs text-slate-500 mt-0.5">Supports {req.type === 'image' ? 'JPG, PNG images' : 'PDF, Word Documents'}</p>
                            </div>
                          </div>
                        )}
                      </label>

                    </div>
                  )}

                  {req.type === 'link' && (
                    <div className="space-y-1.5">
                      <Label className="text-xs text-slate-600">External / Google Drive Link</Label>
                      <Input
                        placeholder="https://drive.google.com/..."
                        value={currentLinkVal}
                        onChange={(e) => setSubmissionLinks(prev => ({ ...prev, [req.id]: e.target.value }))}
                        className="bg-white text-sm"
                      />
                      <p className="text-xs text-slate-500">Paste Google Drive, Figma, GitHub, or web report link.</p>
                    </div>
                  )}

                  {/* Uploaded links list */}
                  {linkList.length > 0 && req.type !== 'text' && (
                    <div className="space-y-2 pt-2 border-t border-slate-200">
                      <p className="text-xs font-semibold text-slate-700">Attached Evidence Files:</p>
                      {linkList.map((link, lIdx) => (
                        <div key={lIdx} className="flex items-center justify-between p-2.5 bg-white rounded-lg border border-slate-200 text-xs">
                          <div className="flex items-center gap-2 truncate max-w-[80%]">
                            <Link2 className="h-4 w-4 text-blue-600 shrink-0" />
                            <span className="truncate font-medium text-slate-700">{link}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => window.open(link, '_blank')}>
                              View <ExternalLink className="h-3 w-3" />
                            </Button>
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-500 hover:bg-red-50" onClick={() => handleRemoveLink(req.id, link)}>
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Action Buttons */}
          <div className="pt-6 border-t border-slate-100 flex items-center justify-end gap-3">
            <Button variant="outline" onClick={() => navigate('/academy/my-work')} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmitTask}
              disabled={isSubmitting}
              className="px-8 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg shadow-sm gap-2"
            >
              {isSubmitting ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Submitting...</>
              ) : (
                <><CheckCircle2 className="h-4 w-4" /> {isRejected ? 'Resubmit Work' : 'Submit Work'}</>
              )}
            </Button>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
