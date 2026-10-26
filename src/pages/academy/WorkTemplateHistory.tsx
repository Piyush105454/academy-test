import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, 
  Calendar, 
  Clock, 
  Search, 
  CheckCircle2, 
  AlertCircle, 
  FileText, 
  ExternalLink, 
  RotateCcw, 
  Eye, 
  DollarSign, 
  TrendingUp, 
  Users,
  Edit,
  Award
} from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

interface SubmissionData {
  id: string;
  submission_note?: string | null;
  photo_url?: string | null;
  submitted_at?: string | null;
  reviewed_at?: string | null;
  reviewer_comments?: string | null;
}

interface TaskHistoryItem {
  taskId: string;
  assignmentId: string;
  taskDate: string;
  dueTime: string;
  status: 'pending' | 'submitted' | 'approved' | 'rejected' | 'overdue';
  rewardEarned: number;
  pointsEarned: number;
  submittedAt: string | null;
  facilitatorId: string;
  facilitatorName: string;
  facilitatorEmail: string;
  submission: SubmissionData | null;
  isOverdue: boolean;
}

interface TemplateDetails {
  id: string;
  name: string;
  category: string;
  description?: string | null;
  recurrence: string;
  recurrence_rule?: string | null;
  base_reward_amount: number;
  leaderboard_points: number;
  due_time?: string | null;
  end_date?: string | null;
  created_at?: string;
}

export default function WorkTemplateHistory() {
  const { templateId } = useParams<{ templateId: string }>();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [template, setTemplate] = useState<TemplateDetails | null>(null);
  const [historyItems, setHistoryItems] = useState<TaskHistoryItem[]>([]);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [filterFacilitator, setFilterFacilitator] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterTimeframe, setFilterTimeframe] = useState('all');

  // Extend Deadline Dialog State
  const [extendDialogOpen, setExtendDialogOpen] = useState(false);
  const [selectedTaskForExtend, setSelectedTaskForExtend] = useState<TaskHistoryItem | null>(null);
  const [newDueTime, setNewDueTime] = useState('18:00');
  const [newDueDate, setNewDueDate] = useState('');
  const [isUpdatingDeadline, setIsUpdatingDeadline] = useState(false);

  // View Submission Dialog State
  const [viewSubmissionOpen, setViewSubmissionOpen] = useState(false);
  const [selectedSubmissionTask, setSelectedSubmissionTask] = useState<TaskHistoryItem | null>(null);

  useEffect(() => {
    if (templateId) {
      fetchTemplateAndHistory();
    }
  }, [templateId]);

  const fetchTemplateAndHistory = async () => {
    try {
      setLoading(true);

      // 1. Fetch template details
      const { data: tplData, error: tplError } = await supabase
        .from('academy_task_templates')
        .select('*')
        .eq('id', templateId)
        .single();

      if (tplError) throw tplError;
      setTemplate(tplData);

      // 2. Fetch assignments, task instances, and submissions
      const { data: assignmentsData, error: asgnError } = await supabase
        .from('academy_task_assignments')
        .select(`
          id,
          template_id,
          facilitator_id,
          custom_reward_amount,
          user_profiles (
            id,
            full_name,
            email,
            role_id
          ),
          academy_tasks (
            id,
            assignment_id,
            task_date,
            due_time,
            status,
            reward_earned,
            points_earned,
            submitted_at,
            created_at,
            updated_at,
            academy_submissions (
              id,
              submission_note,
              photo_url,
              submitted_at,
              reviewed_at,
              reviewer_comments
            )
          )
        `)
        .eq('template_id', templateId);

      if (asgnError) throw asgnError;

      // 3. Flatten tasks into a chronological history list
      const items: TaskHistoryItem[] = [];
      const now = new Date();

      (assignmentsData || []).forEach((asgn: any) => {
        const facProfile = asgn.user_profiles || {};
        const facName = facProfile.full_name || 'Assigned Facilitator';
        const facEmail = facProfile.email || '';
        const facId = asgn.facilitator_id;

        (asgn.academy_tasks || []).forEach((t: any) => {
          let rawStatus = (t.status || 'pending').toLowerCase();
          
          // Check if overdue
          let isOverdue = false;
          if (rawStatus === 'pending' && t.task_date) {
            const dueTimeString = t.due_time || '23:59:59';
            const dueDateTime = new Date(`${t.task_date}T${dueTimeString}`);
            if (!isNaN(dueDateTime.getTime()) && dueDateTime < now) {
              isOverdue = true;
              rawStatus = 'overdue';
            }
          }

          // Submission data
          const subs = t.academy_submissions;
          const submissionData: SubmissionData | null = Array.isArray(subs) ? (subs[0] || null) : (subs || null);

          const defaultReward = asgn.custom_reward_amount ?? tplData.base_reward_amount ?? 20;
          const rewardEarned = t.reward_earned > 0 ? t.reward_earned : (rawStatus === 'approved' ? defaultReward : defaultReward);

          items.push({
            taskId: t.id,
            assignmentId: asgn.id,
            taskDate: t.task_date,
            dueTime: t.due_time || tplData.due_time || '16:00:00',
            status: rawStatus as any,
            rewardEarned,
            pointsEarned: t.points_earned || 0,
            submittedAt: t.submitted_at || submissionData?.submitted_at || null,
            facilitatorId: facId,
            facilitatorName: facName,
            facilitatorEmail: facEmail,
            submission: submissionData,
            isOverdue
          });
        });
      });

      // Sort newest date first
      items.sort((a, b) => new Date(b.taskDate).getTime() - new Date(a.taskDate).getTime());
      setHistoryItems(items);

    } catch (err: any) {
      console.error('Error fetching template history:', err);
      toast.error('Failed to load work history: ' + (err.message || ''));
    } finally {
      setLoading(false);
    }
  };

  // Distinct facilitators for filtering
  const facilitatorOptions = useMemo(() => {
    const map = new Map<string, string>();
    historyItems.forEach(item => {
      if (item.facilitatorId && item.facilitatorName) {
        map.set(item.facilitatorId, item.facilitatorName);
      }
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [historyItems]);

  // Filtered Items
  const filteredItems = useMemo(() => {
    return historyItems.filter(item => {
      // 1. Search Query (Date, Facilitator, Notes)
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesDate = item.taskDate?.toLowerCase().includes(q);
        const matchesFac = item.facilitatorName?.toLowerCase().includes(q);
        const matchesEmail = item.facilitatorEmail?.toLowerCase().includes(q);
        const matchesNote = item.submission?.submission_note?.toLowerCase().includes(q);
        if (!matchesDate && !matchesFac && !matchesEmail && !matchesNote) return false;
      }

      // 2. Facilitator Filter
      if (filterFacilitator !== 'all' && item.facilitatorId !== filterFacilitator) {
        return false;
      }

      // 3. Status Filter
      if (filterStatus !== 'all') {
        if (filterStatus === 'overdue') {
          if (!item.isOverdue) return false;
        } else if (item.status !== filterStatus) {
          return false;
        }
      }

      // 4. Timeframe Filter
      if (filterTimeframe === 'today') {
        const todayStr = new Date().toISOString().split('T')[0];
        if (item.taskDate !== todayStr) return false;
      } else if (filterTimeframe === 'last_7_days') {
        const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        if (new Date(item.taskDate) < cutoff) return false;
      } else if (filterTimeframe === 'this_month') {
        const now = new Date();
        const d = new Date(item.taskDate);
        if (d.getMonth() !== now.getMonth() || d.getFullYear() !== now.getFullYear()) return false;
      }

      return true;
    });
  }, [historyItems, searchQuery, filterFacilitator, filterStatus, filterTimeframe]);

  // Summary Metrics
  const totalTasks = historyItems.length;
  const submittedTasks = historyItems.filter(i => i.status === 'submitted').length;
  const approvedTasks = historyItems.filter(i => i.status === 'approved').length;
  const pendingTasks = historyItems.filter(i => i.status === 'pending' && !i.isOverdue).length;
  const overdueTasks = historyItems.filter(i => i.isOverdue).length;
  const totalEarned = historyItems.reduce((acc, curr) => {
    if (curr.status === 'approved') return acc + curr.rewardEarned;
    return acc;
  }, 0);

  // Handle Extend Deadline
  const handleOpenExtendDialog = (item: TaskHistoryItem) => {
    setSelectedTaskForExtend(item);
    setNewDueTime(item.dueTime ? item.dueTime.slice(0, 5) : '18:00');
    setNewDueDate(item.taskDate || '');
    setExtendDialogOpen(true);
  };

  const handleSaveExtendedDeadline = async () => {
    if (!selectedTaskForExtend) return;
    if (!newDueTime) {
      toast.error('Please enter a valid due time');
      return;
    }

    try {
      setIsUpdatingDeadline(true);
      const formattedTime = newDueTime.length === 5 ? `${newDueTime}:00` : newDueTime;

      const updatePayload: any = {
        due_time: formattedTime,
        updated_at: new Date().toISOString()
      };

      if (newDueDate && newDueDate !== selectedTaskForExtend.taskDate) {
        updatePayload.task_date = newDueDate;
      }

      const { error } = await supabase
        .from('academy_tasks')
        .update(updatePayload)
        .eq('id', selectedTaskForExtend.taskId);

      if (error) throw error;

      toast.success(`Deadline extended to ${formattedTime} on ${newDueDate || selectedTaskForExtend.taskDate}`);
      setExtendDialogOpen(false);
      setSelectedTaskForExtend(null);
      await fetchTemplateAndHistory();
    } catch (err: any) {
      console.error('Error extending deadline:', err);
      toast.error('Failed to extend deadline: ' + (err.message || ''));
    } finally {
      setIsUpdatingDeadline(false);
    }
  };

  // Helper to parse submission payload
  const parseSubmissionFields = (submission: SubmissionData | null) => {
    if (!submission) return [];
    const fields: Array<{ label: string; value: string; isLink?: boolean; isImage?: boolean }> = [];

    if (submission.submission_note) {
      fields.push({ label: 'Submission Note', value: submission.submission_note });
    }

    if (submission.photo_url) {
      try {
        const parsed = JSON.parse(submission.photo_url);
        if (typeof parsed === 'object' && parsed !== null) {
          Object.entries(parsed).forEach(([key, val]: [string, any]) => {
            const strVal = String(val || '');
            const isLink = strVal.startsWith('http://') || strVal.startsWith('https://');
            const isImage = isLink && (strVal.match(/\.(jpeg|jpg|gif|png|webp)($|\?)/i) != null || strVal.includes('google.com'));
            
            let label = key;
            if (key.includes('req-note')) label = 'Present Count / Note';
            else if (key.includes('req-photo')) label = 'Evidence Picture';
            else if (key.includes('req-doc')) label = 'Document Link';

            fields.push({ label, value: strVal, isLink, isImage });
          });
        } else {
          fields.push({ label: 'Uploaded Evidence', value: String(submission.photo_url), isLink: true });
        }
      } catch (e) {
        fields.push({ label: 'Uploaded File / Link', value: submission.photo_url, isLink: submission.photo_url.startsWith('http') });
      }
    }

    return fields;
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        
        {/* Header Navigation */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate('/academy/tasks')}
              className="text-slate-600 hover:text-slate-900"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-2xl font-bold text-slate-900">
                  {template?.name || 'Work Submission History'}
                </h1>
                <Badge variant="outline" className="capitalize text-xs font-semibold bg-blue-50 text-blue-700 border-blue-200">
                  {template?.category || 'Task'}
                </Badge>
                <Badge variant="outline" className="text-xs font-semibold bg-emerald-50 text-emerald-700 border-emerald-200">
                  ₹{template?.base_reward_amount || 0} / session
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Full chronological submission log, earned amounts, verification status, and deadline controls
              </p>
            </div>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={fetchTemplateAndHistory}
            className="gap-1.5 text-xs text-slate-600"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Refresh History
          </Button>
        </div>

        {/* Metric Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <Card className="shadow-sm border-slate-200">
            <CardContent className="p-4">
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Total Works</p>
              <h3 className="text-xl font-extrabold text-slate-800 mt-1">{totalTasks}</h3>
              <p className="text-[10px] text-slate-400 mt-0.5">Assigned instances</p>
            </CardContent>
          </Card>

          <Card className="shadow-sm border-l-4 border-l-blue-500 border-slate-200">
            <CardContent className="p-4">
              <p className="text-[11px] font-semibold text-blue-600 uppercase tracking-wider">Submitted</p>
              <h3 className="text-xl font-extrabold text-blue-700 mt-1">{submittedTasks}</h3>
              <p className="text-[10px] text-slate-400 mt-0.5">Awaiting manager review</p>
            </CardContent>
          </Card>

          <Card className="shadow-sm border-l-4 border-l-emerald-500 border-slate-200">
            <CardContent className="p-4">
              <p className="text-[11px] font-semibold text-emerald-600 uppercase tracking-wider">Approved</p>
              <h3 className="text-xl font-extrabold text-emerald-700 mt-1">{approvedTasks}</h3>
              <p className="text-[10px] text-slate-400 mt-0.5">Confirmed & credited</p>
            </CardContent>
          </Card>

          <Card className="shadow-sm border-l-4 border-l-orange-500 border-slate-200">
            <CardContent className="p-4">
              <p className="text-[11px] font-semibold text-orange-600 uppercase tracking-wider">Pending</p>
              <h3 className="text-xl font-extrabold text-orange-700 mt-1">{pendingTasks}</h3>
              <p className="text-[10px] text-slate-400 mt-0.5">Within deadline</p>
            </CardContent>
          </Card>

          <Card className="shadow-sm border-l-4 border-l-red-500 border-slate-200">
            <CardContent className="p-4">
              <p className="text-[11px] font-semibold text-red-600 uppercase tracking-wider">Overdue</p>
              <h3 className="text-xl font-extrabold text-red-700 mt-1">{overdueTasks}</h3>
              <p className="text-[10px] text-slate-400 mt-0.5">Missed deadline</p>
            </CardContent>
          </Card>

          <Card className="shadow-sm border-l-4 border-l-purple-500 border-slate-200">
            <CardContent className="p-4">
              <p className="text-[11px] font-semibold text-purple-600 uppercase tracking-wider">Total Earned</p>
              <h3 className="text-xl font-extrabold text-purple-700 mt-1">₹{totalEarned.toLocaleString('en-IN')}</h3>
              <p className="text-[10px] text-slate-400 mt-0.5">Approved payouts</p>
            </CardContent>
          </Card>
        </div>

        {/* Filter Bar */}
        <Card className="shadow-sm border-slate-200">
          <CardContent className="p-4 space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              {/* Search */}
              <div className="relative flex-1 min-w-[220px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  placeholder="Search date (YYYY-MM-DD), facilitator name, notes..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 h-9 text-xs"
                />
              </div>

              {/* FAL / Facilitator Filter */}
              <Select value={filterFacilitator} onValueChange={setFilterFacilitator}>
                <SelectTrigger className="h-9 w-[180px] text-xs">
                  <SelectValue placeholder="All Facilitators" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Facilitators</SelectItem>
                  {facilitatorOptions.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Status Filter */}
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="h-9 w-[150px] text-xs">
                  <SelectValue placeholder="All Statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="submitted">Submitted</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="overdue">Overdue</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                </SelectContent>
              </Select>

              {/* Timeframe Filter */}
              <Select value={filterTimeframe} onValueChange={setFilterTimeframe}>
                <SelectTrigger className="h-9 w-[140px] text-xs">
                  <SelectValue placeholder="All Dates" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Dates</SelectItem>
                  <SelectItem value="today">Today</SelectItem>
                  <SelectItem value="last_7_days">Last 7 Days</SelectItem>
                  <SelectItem value="this_month">This Month</SelectItem>
                </SelectContent>
              </Select>

              {(searchQuery || filterFacilitator !== 'all' || filterStatus !== 'all' || filterTimeframe !== 'all') && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSearchQuery('');
                    setFilterFacilitator('all');
                    setFilterStatus('all');
                    setFilterTimeframe('all');
                  }}
                  className="text-xs h-9 text-slate-500 hover:text-slate-800"
                >
                  Clear Filters
                </Button>
              )}
            </div>

            <div className="text-xs text-muted-foreground">
              Showing {filteredItems.length} of {historyItems.length} work instances
            </div>
          </CardContent>
        </Card>

        {/* History Table */}
        <Card className="shadow-sm border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-semibold uppercase text-[11px]">
                <tr>
                  <th className="px-4 py-3 min-w-[120px]">Work Date</th>
                  <th className="px-4 py-3 min-w-[180px]">Assigned Facilitator (FAL)</th>
                  <th className="px-4 py-3 min-w-[120px]">Deadline / Due</th>
                  <th className="px-4 py-3 min-w-[110px]">Status</th>
                  <th className="px-4 py-3 min-w-[100px] text-right">Earned</th>
                  <th className="px-4 py-3 min-w-[140px]">Submitted At</th>
                  <th className="px-4 py-3 min-w-[140px]">Evidence / Submission</th>
                  <th className="px-4 py-3 min-w-[130px] text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center text-slate-400">
                      <div className="flex items-center justify-center gap-2">
                        <Clock className="h-4 w-4 animate-spin text-blue-600" />
                        <span>Loading submission history...</span>
                      </div>
                    </td>
                  </tr>
                ) : filteredItems.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center text-slate-400 italic">
                      No work instances found matching your criteria.
                    </td>
                  </tr>
                ) : (
                  filteredItems.map((item) => {
                    const isApproved = item.status === 'approved';
                    const isSubmitted = item.status === 'submitted';
                    const isPending = item.status === 'pending';
                    const isOverdue = item.isOverdue;

                    return (
                      <tr key={item.taskId} className="hover:bg-slate-50/60 transition-colors">
                        
                        {/* 1. Work Date */}
                        <td className="px-4 py-3 font-semibold text-slate-900 whitespace-nowrap">
                          {item.taskDate ? new Date(item.taskDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'}
                        </td>

                        {/* 2. Facilitator */}
                        <td className="px-4 py-3">
                          <div className="font-semibold text-slate-800">{item.facilitatorName}</div>
                          <div className="text-[11px] text-slate-400 truncate max-w-[160px]">{item.facilitatorEmail}</div>
                        </td>

                        {/* 3. Deadline / Due */}
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="inline-flex items-center gap-1 font-mono text-[11px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded">
                            <Clock className="h-3 w-3 text-slate-500" />
                            <span>{item.dueTime || '16:00:00'}</span>
                          </div>
                        </td>

                        {/* 4. Status */}
                        <td className="px-4 py-3 whitespace-nowrap">
                          {isApproved && (
                            <Badge className="bg-emerald-600 text-white text-[10px] font-semibold gap-1">
                              <CheckCircle2 className="h-3 w-3" />
                              Approved
                            </Badge>
                          )}
                          {isSubmitted && (
                            <Badge className="bg-blue-600 text-white text-[10px] font-semibold">
                              Submitted
                            </Badge>
                          )}
                          {isOverdue && (
                            <Badge variant="destructive" className="text-[10px] font-semibold gap-1">
                              <AlertCircle className="h-3 w-3" />
                              Overdue
                            </Badge>
                          )}
                          {isPending && !isOverdue && (
                            <Badge variant="outline" className="text-orange-700 bg-orange-50 border-orange-200 text-[10px] font-semibold">
                              Pending
                            </Badge>
                          )}
                          {item.status === 'rejected' && (
                            <Badge variant="destructive" className="text-[10px] font-semibold">
                              Rejected
                            </Badge>
                          )}
                        </td>

                        {/* 5. Earned */}
                        <td className="px-4 py-3 text-right font-bold whitespace-nowrap">
                          {isApproved ? (
                            <span className="text-emerald-600">₹{item.rewardEarned}</span>
                          ) : (
                            <span className="text-slate-400 font-normal">₹{item.rewardEarned} (Est.)</span>
                          )}
                        </td>

                        {/* 6. Submitted At */}
                        <td className="px-4 py-3 whitespace-nowrap text-slate-600">
                          {item.submittedAt ? (
                            <span className="font-mono text-[11px]">
                              {new Date(item.submittedAt).toLocaleDateString('en-GB')} {new Date(item.submittedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          ) : (
                            <span className="text-slate-400 italic">Not submitted</span>
                          )}
                        </td>

                        {/* 7. Evidence / Submission View */}
                        <td className="px-4 py-3">
                          {item.submission || item.submittedAt ? (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setSelectedSubmissionTask(item);
                                setViewSubmissionOpen(true);
                              }}
                              className="h-6 text-[10px] px-2 py-0 gap-1 text-blue-700 border-blue-200 hover:bg-blue-50"
                            >
                              <Eye className="h-3 w-3" />
                              View Evidence
                            </Button>
                          ) : (
                            <span className="text-slate-400 text-[11px] italic">Awaiting submission</span>
                          )}
                        </td>

                        {/* 8. Actions (Extend Deadline) */}
                        <td className="px-4 py-3 text-right">
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => handleOpenExtendDialog(item)}
                            className="h-7 text-xs px-2.5 gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800"
                            title="Extend individual work deadline"
                          >
                            <Clock className="h-3.5 w-3.5 text-blue-600" />
                            Extend Deadline
                          </Button>
                        </td>

                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Dialog 1: Extend Deadline */}
        <Dialog open={extendDialogOpen} onOpenChange={setExtendDialogOpen}>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-blue-600" />
                Extend Work Deadline
              </DialogTitle>
              <DialogDescription>
                Update the deadline specifically for this individual work instance. Past history and other tasks remain untouched.
              </DialogDescription>
            </DialogHeader>

            {selectedTaskForExtend && (
              <div className="space-y-4 py-2">
                <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-xs space-y-1">
                  <div><strong>Facilitator:</strong> {selectedTaskForExtend.facilitatorName}</div>
                  <div><strong>Work Date:</strong> {selectedTaskForExtend.taskDate}</div>
                  <div><strong>Current Due:</strong> {selectedTaskForExtend.dueTime}</div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="due_time" className="text-xs font-semibold">New Due Time *</Label>
                  <Input
                    id="due_time"
                    type="time"
                    value={newDueTime}
                    onChange={(e) => setNewDueTime(e.target.value)}
                    className="text-sm"
                  />
                  <p className="text-[11px] text-muted-foreground">Select the extended submission time (24-hour format)</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="due_date" className="text-xs font-semibold">Work Date (Optional extension)</Label>
                  <Input
                    id="due_date"
                    type="date"
                    value={newDueDate}
                    onChange={(e) => setNewDueDate(e.target.value)}
                    className="text-sm"
                  />
                  <p className="text-[11px] text-muted-foreground">You can also move the work date forward if needed</p>
                </div>
              </div>
            )}

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setExtendDialogOpen(false)}
                disabled={isUpdatingDeadline}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSaveExtendedDeadline}
                disabled={isUpdatingDeadline}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                {isUpdatingDeadline ? 'Saving...' : 'Save Extended Deadline'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Dialog 2: View Submission Evidence */}
        <Dialog open={viewSubmissionOpen} onOpenChange={setViewSubmissionOpen}>
          <DialogContent className="sm:max-w-[550px] max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-blue-600" />
                Submission Evidence & Details
              </DialogTitle>
              <DialogDescription>
                {selectedSubmissionTask?.facilitatorName} • {selectedSubmissionTask?.taskDate}
              </DialogDescription>
            </DialogHeader>

            {selectedSubmissionTask && (
              <div className="space-y-4 py-2">
                {/* Status overview */}
                <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-200">
                  <div>
                    <span className="text-xs text-muted-foreground block">Review Status</span>
                    <span className="font-bold text-sm capitalize">{selectedSubmissionTask.status}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-xs text-muted-foreground block">Reward</span>
                    <span className="font-bold text-sm text-emerald-600">₹{selectedSubmissionTask.rewardEarned}</span>
                  </div>
                </div>

                {/* Fields */}
                <div className="space-y-3">
                  <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wider">Submitted Content</h4>
                  {parseSubmissionFields(selectedSubmissionTask.submission).length === 0 ? (
                    <p className="text-xs text-muted-foreground italic">No detailed submission fields recorded.</p>
                  ) : (
                    parseSubmissionFields(selectedSubmissionTask.submission).map((field, idx) => (
                      <div key={idx} className="p-3 bg-white rounded-lg border border-slate-200 space-y-1">
                        <Label className="text-[11px] text-slate-500 font-semibold">{field.label}</Label>
                        {field.isLink ? (
                          <div className="flex items-center gap-2 mt-1">
                            <a
                              href={field.value}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs font-semibold text-blue-600 hover:underline inline-flex items-center gap-1 break-all"
                            >
                              <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                              {field.value}
                            </a>
                          </div>
                        ) : (
                          <p className="text-xs font-medium text-slate-800 whitespace-pre-wrap">{field.value}</p>
                        )}
                      </div>
                    ))
                  )}
                </div>

                {selectedSubmissionTask.submission?.reviewer_comments && (
                  <div className="p-3 bg-emerald-50 rounded-lg border border-emerald-200">
                    <Label className="text-[11px] text-emerald-700 font-semibold">Manager Feedback / Comments</Label>
                    <p className="text-xs text-emerald-900 mt-1">{selectedSubmissionTask.submission.reviewer_comments}</p>
                  </div>
                )}
              </div>
            )}

            <DialogFooter>
              <Button onClick={() => setViewSubmissionOpen(false)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

      </div>
    </DashboardLayout>
  );
}
