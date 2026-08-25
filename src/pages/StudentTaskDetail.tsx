import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, CheckCircle2, Clock, CalendarDays,
  BookOpen, Link2, Trophy, AlertCircle, ExternalLink, Loader2, X, Upload
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { parseSubmissionRequirements, parseSubmissionLinks, serializeSubmissionLinks, type SubmissionRequirement } from "../utils/submissionUtils";
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';

interface StudentTask {
  id: string;
  task_name: string;
  task_id?: string;
  task_description: string;
  deadline: string;
  feedback_type: string;
  status: string;
  feedback_notes?: string;
  submission_link?: string;
  created_at: string;
  earning_amount?: number;
  academic_year?: string;
  rejection_comment?: string | null;
  submission_types?: string[];
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  pending:   { label: 'Pending',   color: 'bg-amber-100 text-amber-700 border-amber-200',  icon: Clock },
  submitted: { label: 'Submitted', color: 'bg-blue-100 text-blue-700 border-blue-200',     icon: CheckCircle2 },
  reviewed:  { label: 'Reviewed',  color: 'bg-purple-100 text-purple-700 border-purple-200', icon: Trophy },
  approved:  { label: 'Approved',  color: 'bg-green-100 text-green-700 border-green-200',  icon: CheckCircle2 },
  completed: { label: 'Completed', color: 'bg-green-100 text-green-700 border-green-200',  icon: CheckCircle2 },
  rejected:  { label: 'Rejected',  color: 'bg-red-100 text-red-700 border-red-200',        icon: AlertCircle },
};


const formatDescriptionText = (desc?: string): string => {
  if (!desc) return '';
  let formatted = desc
    .replace(/\s*CATEGORY:\s*/gi, '<br/><br/><strong>📌 CATEGORY:</strong> ')
    .replace(/\s*DIFFICULTY:\s*/gi, '<br/><strong>🎯 DIFFICULTY:</strong> ')
    .replace(/\s*TOPIC:\s*/gi, '<br/><strong>📚 TOPIC:</strong> ')
    .replace(/\s*ARTICLE:\s*/gi, '<br/><br/><strong>📖 ARTICLE:</strong><br/>')
    .replace(/\s*TECHNICAL TERMS AND SIMPLE MEANINGS:\s*/gi, '<br/><br/><strong>🔤 TECHNICAL TERMS AND SIMPLE MEANINGS:</strong><br/>')
    .replace(/\s*KEY TERMS AND HINDI MEANINGS:\s*/gi, '<br/><br/><strong>🔤 KEY TERMS AND HINDI MEANINGS:</strong><br/>')
    .replace(/\s*WORD COUNT:\s*/gi, '<br/><br/><strong>📊 WORD COUNT:</strong> ')
    .replace(/\s*Word Power Practice:\s*/gi, '<br/><br/><strong>💡 Word Power Practice:</strong><br/>')
    .replace(/\s*आसान Hinglish Summary:\s*/gi, '<br/><br/><strong>📝 आसान Hinglish Summary:</strong><br/>');

  if (!formatted.includes('<p>') && !formatted.includes('<br/>')) {
    formatted = formatted.replace(/\n\n/g, '<br/><br/>').replace(/\n/g, '<br/>');
  }
  return formatted;
};

export default function StudentTaskDetail() {
  const { taskId } = useParams<{ taskId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [task, setTask] = useState<StudentTask | null>(null);
  const [loading, setLoading] = useState(true);
  const [requirements, setRequirements] = useState<SubmissionRequirement[]>([]);
  const [submissionLinks, setSubmissionLinks] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [uploadingReqId, setUploadingReqId] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [showConfirmOpen, setShowConfirmOpen] = useState(false);

  useEffect(() => {
    if (taskId) fetchTask();
  }, [taskId]);

  const fetchTask = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('student_task_feedback')
        .select(`
          *,
          task_id,
          students (
            name, 
            roll_number,
            classes (name)
          ),
          sessions (class_batch)
        `)
        .eq('id', taskId)
        .single();

      if (error) throw error;
      setTask(data as any);
      
      const reqs = parseSubmissionRequirements((data as StudentTask).submission_types);
      setRequirements(reqs);
      setSubmissionLinks(parseSubmissionLinks((data as StudentTask).submission_link, reqs));
    } catch (err) {
      console.error(err);
      toast.error('Failed to load task details');
      navigate('/student-tasks');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!task) return;
    
    const hasAnySubmission = Object.values(submissionLinks).some(link => link.trim() !== '');
    if (!hasAnySubmission && requirements.length > 0) {
      toast.error('Please submit your work for at least one requirement.');
      return;
    }

    // Validate submission is not past the exact deadline
    const cutoffDate = new Date(task.deadline);

    if (new Date() > cutoffDate) {
      toast.error('Submission closed. The deadline has passed.');
      return;
    }

    // Open confirmation dialog
    setShowConfirmOpen(true);
  };

  const executeSubmit = async () => {
    setShowConfirmOpen(false);
    if (!task) return;

    const processedLinks = { ...submissionLinks };
    for (const reqId of Object.keys(processedLinks)) {
      let l = processedLinks[reqId].trim();
      if (l && !l.startsWith('http://') && !l.startsWith('https://')) {
        processedLinks[reqId] = `https://${l}`;
      }
    }

    try {
      setSaving(true);
      const { error } = await supabase
        .from('student_task_feedback')
        .update({
          submission_link: serializeSubmissionLinks(processedLinks),
          status: 'submitted',
          updated_at: new Date().toISOString(),
        })
        .eq('id', task.id);

      if (error) throw error;
      toast.success('Task submitted successfully! 🎉');
      await fetchTask(); // refresh
    } catch (err) {
      console.error(err);
      toast.error('Failed to submit task');
    } finally {
      setSaving(false);
    }
  };

  const uploadFileWithProgress = (
    file: File, 
    folderPath: string[], 
    accessToken: string,
    onProgress: (percent: number) => void,
    signal?: AbortSignal
  ): Promise<any> => {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      
      if (signal) {
        signal.addEventListener('abort', () => {
          xhr.abort();
          reject(new DOMException('Aborted', 'AbortError'));
        });
      }

      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable) {
          const percent = Math.round((event.loaded / event.total) * 100);
          onProgress(percent);
        }
      });

      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const response = JSON.parse(xhr.responseText);
            resolve(response);
          } catch (e) {
            reject(new Error('Invalid response from server'));
          }
        } else {
          try {
            const errorRes = JSON.parse(xhr.responseText);
            reject(new Error(errorRes.error || `Upload failed with status ${xhr.status}`));
          } catch (e) {
            reject(new Error(`Upload failed with status ${xhr.status}`));
          }
        }
      });

      xhr.addEventListener('error', () => {
        reject(new Error('Network error during upload'));
      });

      xhr.addEventListener('abort', () => {
        reject(new DOMException('Aborted', 'AbortError'));
      });

      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/upload-to-gdrive`;
      xhr.open('POST', url, true);
      xhr.setRequestHeader('Authorization', `Bearer ${accessToken}`);
      
      const formData = new FormData();
      formData.append('file', file);
      formData.append('folderPath', JSON.stringify(folderPath));
      
      xhr.send(formData);
    });
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>, reqId: string, reqType: string) => {
    const files = event.target.files;
    if (!files || files.length === 0 || !task) return;
    
    const allowedTypes = [reqType];
    const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB limit
    
    // Validate all files
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      
      // Check file size
      if (file.size > MAX_FILE_SIZE) {
        toast.error(`File "${file.name}" is too large (${(file.size / (1024 * 1024)).toFixed(1)} MB). Maximum size allowed is 25 MB.`);
        return;
      }
      
      const isPdf = file.type === 'application/pdf';
      const isDoc = file.type.includes('word') || file.name.endsWith('.doc') || file.name.endsWith('.docx');
      const isPpt = file.type.includes('presentation') || file.name.endsWith('.ppt') || file.name.endsWith('.pptx');
      const isExcel = file.type.includes('spreadsheet') || file.type.includes('excel') || file.name.endsWith('.xls') || file.name.endsWith('.xlsx');
      const isImage = file.type.includes('image');
      const isVideo = file.type.includes('video');
      const isCode = ['.js', '.ts', '.jsx', '.tsx', '.html', '.css', '.py', '.java', '.cpp', '.c', '.txt', '.json', '.zip'].some(ext => file.name.toLowerCase().endsWith(ext));
      
      let valid = false;
      if (allowedTypes.includes('pdf') && isPdf) valid = true;
      if (allowedTypes.includes('doc') && isDoc) valid = true;
      if (allowedTypes.includes('ppt') && isPpt) valid = true;
      if (allowedTypes.includes('excel') && isExcel) valid = true;
      if (allowedTypes.includes('image') && isImage) valid = true;
      if (allowedTypes.includes('video') && isVideo) valid = true;
      if (allowedTypes.includes('code') && isCode) valid = true;
      
      if (!valid) {
        toast.error(`Invalid file format for "${file.name}". Please upload an allowed format.`);
        return;
      }
    }

    try {
      setUploadingReqId(reqId);
      setUploadProgress(0);
      const newLinks: string[] = [];
      const { data: { session } } = await supabase.auth.getSession();
      
      const year = task.academic_year || 'Unknown Year';
      const className = (task as any).sessions?.class_batch || 
                        (task as any).students?.classes?.name || 
                        'Unassigned';
      const studentName = (task as any).students?.name || 'Unknown Student';
      const rollNum = (task as any).students?.roll_number || 'No Roll';
      const studentFolder = `${studentName} - ${rollNum}`;
      const taskFolder = (task.task_id && task.task_id !== '-') 
        ? task.task_id 
        : task.task_name.replace(/^["']|["']$/g, '');
      const folderPath = ["FELLOW", year, className, taskFolder, studentFolder];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        
        // Timeout handling (60 seconds)
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 60000);

        try {
          const result = await uploadFileWithProgress(
            file,
            folderPath,
            session?.access_token || '',
            (percent) => {
              setUploadProgress(percent);
            },
            controller.signal
          );
          
          clearTimeout(timeoutId);
          newLinks.push(result.webViewLink);
        } catch (err: any) {
          clearTimeout(timeoutId);
          throw err;
        }
      }
      
      setSubmissionLinks(prev => {
        const existingLinks = prev[reqId] ? prev[reqId].split(',').filter(Boolean) : [];
        return {
          ...prev,
          [reqId]: [...existingLinks, ...newLinks].join(',')
        };
      });
      toast.success(files.length > 1 ? 'Files uploaded successfully!' : 'File uploaded successfully!');
    } catch (err: any) {
      console.error(err);
      if (err.name === 'AbortError') {
        toast.error('Upload timed out. Please check your internet connection or try a smaller file.');
      } else {
        toast.error('Failed to upload file: ' + err.message);
      }
    } finally {
      setUploadingReqId(null);
      setUploadProgress(0);
      event.target.value = ''; 
    }
  };

  const handleDeleteFile = async (linkToDelete: string, reqId: string) => {
    try {
      setUploadingReqId(reqId);
      const { data: { session } } = await supabase.auth.getSession();
      
      // Delete from Google Drive
      if (linkToDelete.includes('drive.google.com')) {
        await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/upload-to-gdrive`, {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session?.access_token}`
          },
          body: JSON.stringify({ link: linkToDelete.trim() })
        });
      }
      
      // Remove from UI state
      setSubmissionLinks(prev => {
        const existingLinks = prev[reqId] ? prev[reqId].split(',').filter(Boolean) : [];
        const filteredLinks = existingLinks.filter(l => l.trim() !== linkToDelete.trim());
        return {
          ...prev,
          [reqId]: filteredLinks.join(',')
        };
      });
      
      toast.success('File removed successfully');
    } catch (err: any) {
      console.error(err);
      toast.error('Failed to remove file: ' + err.message);
    } finally {
      setUploadingReqId(null);
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex justify-center items-center min-h-[60vh]">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  if (!task) return null;

  const statusCfg = STATUS_CONFIG[task.status] || STATUS_CONFIG['pending'];
  const StatusIcon = statusCfg.icon;
  const isDeadlinePast = task.deadline && new Date(task.deadline) < new Date();
  const canSubmit = task.status === 'pending' || task.status === 'rejected';
  const isRejected = task.status === 'rejected';

  const cutoffDate = task?.deadline ? new Date(task.deadline) : null;
  const isSubmissionClosed = cutoffDate ? new Date() > cutoffDate : false;

  const rawDesc = task.task_description || '';

  return (
    <DashboardLayout>
      <div className="max-w-3xl mx-auto space-y-6">

        {/* Back Button */}
        <Button
          variant="ghost"
          size="sm"
          className="gap-2 -ml-2 text-muted-foreground hover:text-foreground"
          onClick={() => navigate('/student-tasks')}
        >
          <ArrowLeft className="h-4 w-4" />
          Back to My Tasks
        </Button>

        {/* Hero Header */}
        <div className="rounded-2xl border border-border bg-gradient-to-br from-primary/5 via-card to-card p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
            <span
              className={cn(
                'inline-flex items-center gap-1.5 text-sm font-semibold px-3 py-1 rounded-full border',
                statusCfg.color
              )}
            >
              <StatusIcon className="h-3.5 w-3.5" />
              {statusCfg.label}
            </span>

            <div className="flex gap-2">
              {task.task_id && (
                <span className="font-mono text-xs bg-muted px-2.5 py-1 rounded-full text-muted-foreground font-medium">
                  Task ID: {task.task_id}
                </span>
              )}
              {task.academic_year && (
                <span className="text-xs bg-muted px-2.5 py-1 rounded-full text-muted-foreground font-medium">
                  AY: {task.academic_year}
                </span>
              )}
            </div>
          </div>

          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
            {task.task_name}
          </h1>

          {/* Meta row */}
          <div className="mt-4 flex flex-wrap gap-4">
            {task.deadline && (
              <div className={cn(
                "flex items-center gap-2 text-sm px-3 py-1.5 rounded-lg border font-semibold",
                isDeadlinePast && task.status === 'pending' ? "bg-red-50 text-red-600 border-red-200" : "bg-blue-50 text-blue-700 border-blue-200"
              )}>
                <CalendarDays className="h-4 w-4" />
                <span>
                  {isDeadlinePast && task.status === 'pending' ? 'Overdue · ' : 'Due · '}
                  {new Date(task.deadline).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })}
                </span>
              </div>
            )}
            <div className="flex items-center gap-2 text-sm">
              <BookOpen className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground capitalize">{task.feedback_type.replace(/_/g, ' ')}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Trophy className="h-4 w-4 text-amber-500" />
              <span className="font-semibold text-amber-600">+{task.earning_amount || 5} units</span>
            </div>
          </div>
        </div>

        {/* Description */}
        {rawDesc && (
          <div className="rounded-2xl border border-border bg-card p-6 shadow-sm space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-primary flex items-center gap-2">
              <BookOpen className="h-4 w-4" /> Description
            </h2>
            {/* Full HTML rendered — supports images, links, colors, headings */}
            <div
              className="prose prose-sm max-w-none text-foreground/90 leading-relaxed task-description-content"
              style={{ lineHeight: '1.75' }}
              dangerouslySetInnerHTML={{ __html: formatDescriptionText(rawDesc) }}
              onClick={(e) => {
                const target = e.target as HTMLElement;
                if (target.tagName === 'IMG') {
                  setLightboxImage((target as HTMLImageElement).src);
                }
                if (target.tagName === 'A') {
                  e.preventDefault();
                  const href = target.getAttribute('href');
                  if (href) {
                    window.open(href, '_blank', 'noopener,noreferrer');
                  }
                }
              }}
            />
          </div>
        )}

        {/* Feedback Notes from Teacher */}
        {task.feedback_notes && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 shadow-sm space-y-2">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-amber-700 flex items-center gap-2">
              <AlertCircle className="h-4 w-4" /> Teacher's Note
            </h2>
            <p className="text-sm text-amber-800 leading-relaxed">{task.feedback_notes}</p>
          </div>
        )}

        {/* Rejection Comment — shown prominently when rejected */}
        {isRejected && (
          <div className="rounded-2xl border-2 border-red-300 bg-red-50 p-6 shadow-sm space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-red-700 flex items-center gap-2">
              <AlertCircle className="h-4 w-4" /> Task Rejected
            </h2>
            {task.rejection_comment ? (
              <div>
                <p className="text-xs text-red-500 font-medium mb-1">Reason from admin/facilitator:</p>
                <p className="text-sm text-red-800 leading-relaxed font-medium">{task.rejection_comment}</p>
              </div>
            ) : (
              <p className="text-sm text-red-600 italic">Your submission was rejected. Please contact your class monitor or facilitator for more details.</p>
            )}
            <p className="text-xs text-red-500">Please fix the issues and resubmit your work.</p>
          </div>
        )}


        {/* Submit Work Section */}
        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm space-y-4">
          <h2 className="text-base font-semibold flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-green-600" />
            {canSubmit || isRejected ? 'Submit Your Work' : 'Update Submission'}
          </h2>

          {!canSubmit && !isRejected && task.status !== 'submitted' ? (
            <div className="rounded-xl bg-muted/60 border border-dashed border-border p-4 text-center space-y-4">
              <div className="text-sm text-muted-foreground">
                This task has been <strong className="text-foreground capitalize">{task.status}</strong> — no further submissions needed.
              </div>
              {Object.values(submissionLinks).some(link => link.trim() !== '') && (
                <div className="flex flex-col gap-3 mt-4">
                  {requirements.map((req, idx) => {
                    const reqLink = submissionLinks[req.id];
                    if (!reqLink) return null;
                    return (
                      <div key={idx} className="flex flex-col gap-2 text-left p-3 border rounded-lg bg-white">
                        <span className="text-sm font-semibold">{req.title}</span>
                        <div className="flex flex-wrap gap-2">
                          {reqLink.split(',').filter(Boolean).map((link, linkIdx) => (
                            <Button key={linkIdx} variant="outline" size="sm" onClick={() => window.open(link.trim().startsWith('http') ? link.trim() : `https://${link.trim()}`, '_blank')}>
                              View Submission {reqLink.split(',').length > 1 ? linkIdx + 1 : ''}
                            </Button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {isSubmissionClosed && (
                <div className="bg-destructive/10 border border-destructive/20 text-destructive rounded-lg p-3 text-sm flex items-center gap-2 font-medium">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>Submission period closed. Submissions are no longer allowed after the deadline.</span>
                </div>
              )}

              <div className="space-y-6">
                {requirements.length === 0 && (
                  <div className="text-sm text-gray-500 italic p-4 bg-gray-50 rounded-lg border text-center">
                    No submission required for this task.
                  </div>
                )}
                {requirements.map((req, index) => {
                  const reqLink = submissionLinks[req.id] || '';
                  const isLinkType = req.type === 'link';
                  const hasSubmittedFiles = reqLink && !isLinkType;

                  return (
                    <div key={req.id} className="space-y-3 p-5 border rounded-xl bg-card shadow-sm">
                      <Label className="text-sm font-semibold flex items-center gap-2">
                        <span className="bg-primary/10 text-primary px-2 py-0.5 rounded-full text-xs">Requirement {index + 1}</span>
                        {req.title}
                      </Label>
                      
                      {!isLinkType && (
                        <label 
                          htmlFor={`file_upload_${req.id}`}
                          className={cn(
                            "flex flex-col items-center justify-center border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all bg-card shadow-sm hover:bg-accent/40 border-border hover:border-primary/50 group",
                            (isSubmissionClosed || !canSubmit || uploadingReqId === req.id) && "opacity-60 cursor-not-allowed hover:bg-card hover:border-border"
                          )}
                        >
                          <input
                            id={`file_upload_${req.id}`}
                            type="file"
                            multiple
                            onChange={(e) => handleFileUpload(e, req.id, req.type)}
                            disabled={isSubmissionClosed || !canSubmit || uploadingReqId === req.id}
                            className="hidden"
                            accept={req.type === 'pdf' ? '.pdf' : req.type === 'doc' ? '.doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document' : req.type === 'ppt' ? '.ppt,.pptx,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation' : req.type === 'excel' ? '.xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : req.type === 'image' ? 'image/*' : req.type === 'video' ? 'video/*' : req.type === 'code' ? '.js,.ts,.jsx,.tsx,.html,.css,.py,.java,.cpp,.c,.txt,.json,.zip' : ''}
                          />
                          
                          {uploadingReqId === req.id ? (
                            <div className="flex flex-col items-center gap-2 py-4">
                              <Loader2 className="h-10 w-10 text-primary animate-spin" />
                              <p className="text-sm font-semibold text-primary animate-pulse">
                                Uploading file...
                              </p>
                            </div>
                          ) : (
                            <div className="flex flex-col items-center gap-2">
                              <div className="p-3 bg-primary/10 text-primary rounded-full group-hover:bg-primary/20 transition-colors">
                                <Upload className="h-6 w-6" />
                              </div>
                              <div>
                                <span className="font-semibold text-sm text-primary group-hover:underline">Click to upload</span> or drag and drop
                                <p className="text-xs text-muted-foreground mt-1 capitalize">
                                  Supported: {req.type} (Max size: 25 MB)
                                </p>
                              </div>
                            </div>
                          )}
                        </label>
                      )}
                      
                      {isLinkType && (
                        <div className="space-y-1.5">
                          <Input
                            placeholder="https://..."
                            value={reqLink}
                            onChange={(e) => setSubmissionLinks(prev => ({ ...prev, [req.id]: e.target.value }))}
                            className="text-sm disabled:opacity-60 disabled:cursor-not-allowed"
                            disabled={isSubmissionClosed || !canSubmit}
                          />
                          <p className="text-xs text-muted-foreground">Paste a shareable link to your completed work.</p>
                        </div>
                      )}

                      {hasSubmittedFiles && (
                        <div className="mt-2 flex flex-col gap-2 bg-green-50/50 p-3 rounded-md border border-green-200">
                          <span className="text-xs text-green-700 flex items-center gap-1.5 font-medium">
                            <CheckCircle2 className="h-4 w-4" /> File(s) uploaded successfully
                          </span>
                          <div className="flex flex-col gap-2">
                            {reqLink.split(',').filter(Boolean).map((link, idx) => (
                              <div key={idx} className="flex items-center justify-between p-2 bg-white rounded border">
                                <div className="flex items-center gap-2">
                                  <BookOpen className="h-4 w-4 text-primary" />
                                  <span className="text-xs font-medium truncate max-w-[150px] sm:max-w-[200px]">Uploaded File {idx + 1}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Button variant="outline" size="sm" type="button" className="h-7 text-xs" onClick={() => window.open(link.trim(), '_blank')}>
                                    View
                                  </Button>
                                  {(canSubmit && !isSubmissionClosed) && (
                                    <Button 
                                      variant="outline" 
                                      size="sm"
                                      type="button" 
                                      className="text-destructive hover:bg-red-50 hover:text-red-600 h-7 w-7 p-0" 
                                      onClick={() => handleDeleteFile(link.trim(), req.id)} 
                                      title="Remove file"
                                    >
                                      <X className="h-3 w-3" />
                                    </Button>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {(canSubmit || isRejected) && (
                <Button
                  onClick={handleSubmit}
                  disabled={saving || isSubmissionClosed}
                  className="w-full sm:w-auto gap-2"
                  size="lg"
                >
                  {saving ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> Submitting...</>
                  ) : (
                    <><CheckCircle2 className="h-4 w-4" /> {isRejected ? 'Resubmit Work' : 'Save Submission'}</>
                  )}
                </Button>
              )}
            </div>
          )}
        </div>

        {/* Created date footer */}
        <p className="text-xs text-muted-foreground text-center pb-4">
          Task assigned on {new Date(task.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
        {/* Lightbox Modal */}
        <Dialog open={!!lightboxImage} onOpenChange={(open) => !open && setLightboxImage(null)}>
          <DialogContent className="max-w-4xl p-1 bg-black/90 border-none overflow-hidden flex items-center justify-center rounded-xl shadow-2xl">
            <div className="relative w-full h-full max-h-[85vh] flex items-center justify-center p-2">
              <img 
                src={lightboxImage || ''} 
                alt="Full size task attachment" 
                className="max-w-full max-h-[80vh] object-contain rounded-lg shadow-lg" 
              />
              <button 
                onClick={() => setLightboxImage(null)}
                className="absolute top-4 right-4 bg-white/20 hover:bg-white/40 text-white rounded-full p-2 transition-colors duration-200"
                title="Close preview"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Final Confirmation Dialog */}
        <Dialog open={showConfirmOpen} onOpenChange={setShowConfirmOpen}>
          <DialogContent className="max-w-md bg-card">
            <DialogHeader>
              <DialogTitle className="text-lg font-bold text-foreground">Confirm Submission</DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground mt-2">
                Are you sure you want to submit your homework? Once submitted, you won't be able to edit it unless a reviewer rejects it or requests changes.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="flex gap-2 justify-end mt-4">
              <Button variant="outline" onClick={() => setShowConfirmOpen(false)} disabled={saving}>
                Cancel
              </Button>
              <Button onClick={executeSubmit} disabled={saving} className="bg-primary text-primary-foreground hover:bg-primary/90">
                Submit Final
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
