import { useState, useEffect } from 'react';
import { runScheduledTaskWorker } from '@/utils/scheduledTaskWorker';
import { 
  Clock, 
  Upload, 
  Search, 
  Filter, 
  Calendar, 
  CheckCircle2, 
  AlertCircle, 
  Plus, 
  Trash2, 
  Eye,
  MoreHorizontal,
  Edit,
  RotateCcw, 
  FileSpreadsheet,
  ArrowRight,
  BookOpen,
  GraduationCap,
  Layers
} from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { useAcademicYear } from '@/contexts/AcademicYearContext';
import { type SubmissionRequirement, serializeSubmissionRequirements } from '../utils/submissionUtils';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import { getCleanTaskId, getScheduledTasks, saveScheduledTasks as persistScheduledTasks } from '@/utils/scheduledTasksStore';

export interface ScheduledTask {
  id: string;
  title: string;
  description: string;
  class_name: string;
  subject_name: string;
  creation_date: string;
  deadline: string;
  academic_year: string;
  status: 'scheduled' | 'published';
  created_at: string;
  sheet_name?: string;
}

const STORAGE_KEY = 'wes_scheduled_tasks_v2';

export default function ScheduledTasks() {
  const { selectedYear } = useAcademicYear();
  const [scheduledTasks, setScheduledTasks] = useState<ScheduledTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [classes, setClasses] = useState<{ id: string; name: string }[]>([]);

  // Filter States
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTasks, setSelectedTasks] = useState<string[]>([]);
  const [filterClass, setFilterClass] = useState('all');
  const [filterSubject, setFilterSubject] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');

  // Bulk Import Modal States
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [targetClass, setTargetClass] = useState('Senior Fellow');
  const [availableSheets, setAvailableSheets] = useState<string[]>([]);
  const [selectedSheet, setSelectedSheet] = useState('all');
  const [customSubjectOverride, setCustomSubjectOverride] = useState('auto');
  const [rawParsedTasks, setRawParsedTasks] = useState<ScheduledTask[]>([]);
  const [previewTasks, setPreviewTasks] = useState<ScheduledTask[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [importFileName, setImportFileName] = useState<string>('');
  
  const [importEarningAmount, setImportEarningAmount] = useState<number | ''>(5);
  const [importSubmissionRequirements, setImportSubmissionRequirements] = useState<SubmissionRequirement[]>([]);

const [importSubmissionTypes, setImportSubmissionTypes] = useState<string[]>(['video', 'pdf']);

  const [importTaskType, setImportTaskType] = useState('Task');
  const [importAcademicYear, setImportAcademicYear] = useState(selectedYear);
  const [rewardConfigs, setRewardConfigs] = useState<{task_type: string, rate_per_task: number}[]>([]);
  const [allSubjects, setAllSubjects] = useState<{id: string, name: string}[]>([]);

  const [importSessionId, setImportSessionId] = useState('none');
  const [importInchargeId, setImportInchargeId] = useState<string>('none');
  const [inchargeOptions, setInchargeOptions] = useState<{id: string, name: string}[]>([]);
  const [availableSessions, setAvailableSessions] = useState<{id: string, title: string}[]>([]);
  
  // Dashboard Metricsk View Modal
  const [selectedTask, setSelectedTask] = useState<ScheduledTask | null>(null);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<ScheduledTask | null>(null);
  const [editTaskForm, setEditTaskForm] = useState({ title: '', subject_name: '', creation_date: '', deadline: '' });

  // Helper date formatter
  const formatExcelDate = (excelDate: any): string => {
    if (typeof excelDate === 'number') {
      const date = XLSX.SSF.parse_date_code(excelDate);
      if (date) {
        const yyyy = date.y;
        const mm = String(date.m).padStart(2, '0');
        const dd = String(date.d).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
      }
    }
    if (typeof excelDate === 'string' && excelDate.includes('-')) {
      return excelDate.trim();
    }
    return String(excelDate || '').trim();
  };

  
    // Fetch Task Types & Subjects
    useEffect(() => {
      const fetchLookups = async () => {
        const { data: configs } = await (supabase as any).from('reward_configurations').select('task_type, rate_per_task');
        if (configs) setRewardConfigs(configs);
        const { data: subs } = await (supabase as any).from('subjects').select('id, name').order('full_name');
        if (subs) setAllSubjects(subs);
        
        const { data: profiles } = await (supabase as any)
          .from('user_profiles')
          .select('id, full_name, role_id')
          .in('role_id', [1, 2, 3, 4])
          .order('full_name');
        if (profiles) {
            setInchargeOptions(profiles.map((p: any) => ({ id: p.id, name: p.full_name })));
          }
      };
      fetchLookups();
    }, []);

  // Load Classes for dropdown
  useEffect(() => {
    const fetchClasses = async () => {
      try {
        const { data } = await supabase
          .from('classes')
          .select('id, name')
          .neq('name', '__SYSTEM_DEV_MODE__')
          .order('full_name');
        if (data) setClasses(data);
      } catch (e) {
        console.error('Error loading classes:', e);
      }
    };
    fetchClasses();
  }, []);

  // Load Scheduled Tasks
  useEffect(() => {
    loadScheduledTasks();
  }, [selectedYear]);

  const loadScheduledTasks = async () => {
    setLoading(true);
    try {
      const { data, error } = await (supabase as any)
        .from('wes_scheduled_tasks')
        .select('*')
        .order('creation_date', { ascending: true });

      if (error) {
        console.error('Error loading from DB:', error.message);
        // Fallback to localStorage cache
        try {
          const cached = localStorage.getItem('wes_scheduled_tasks_v2');
          if (cached) setScheduledTasks(JSON.parse(cached));
        } catch { /* ignore */ }
      } else {
        setScheduledTasks(data || []);
        // Keep localStorage in sync as cache
        try { localStorage.setItem('wes_scheduled_tasks_v2', JSON.stringify(data || [])); } catch { /* ignore */ }
      }
    } catch (e) {
      console.error('Error loading scheduled tasks:', e);
    } finally {
      setLoading(false);
    }
  };

  // No longer needed but kept to avoid breaking references
  const saveScheduledTasks = (tasks: ScheduledTask[]) => {
    setScheduledTasks(tasks);
    try { localStorage.setItem('wes_scheduled_tasks_v2', JSON.stringify(tasks)); } catch { /* ignore */ }
  };

  
    // Fetch Sessions when class changes
    useEffect(() => {
      const fetchSessions = async () => {
        if (!targetClass) { setAvailableSessions([]); return; }
        const { data } = await (supabase as any)
          .from('sessions')
          .select('id, title')
          .eq('class_batch', targetClass)
          .order('session_date', { ascending: false });
        if (data) setAvailableSessions(data);
      };
      fetchSessions();
      setImportSessionId('none');
    }, [targetClass]);

  // Update preview whenever selectedSheet or customSubjectOverride changes
  useEffect(() => {
    if (rawParsedTasks.length === 0) {
      setPreviewTasks([]);
      return;
    }

    let filtered = rawParsedTasks;
    if (selectedSheet !== 'all') {
      filtered = rawParsedTasks.filter(t => t.sheet_name === selectedSheet);
    }

    // Apply subject override if set
    if (customSubjectOverride !== 'auto') {
      filtered = filtered.map(t => ({ ...t, subject_name: customSubjectOverride }));
    }

    // Apply class name
    filtered = filtered.map(t => ({ ...t, class_name: targetClass }));

    setPreviewTasks(filtered);
  }, [rawParsedTasks, selectedSheet, customSubjectOverride, targetClass]);

  // Handle Excel File Select & Parse
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportFileName(file.name);
    const reader = new FileReader();

    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const workbook = XLSX.read(bstr, { type: 'binary' });

        setAvailableSheets(workbook.SheetNames);
        setSelectedSheet('all');
        setCustomSubjectOverride('auto');

        const parsedList: ScheduledTask[] = [];

        workbook.SheetNames.forEach((sheetName, sIdx) => {
          const sheet = workbook.Sheets[sheetName];
          const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

          let subjectName = (sheetName.toLowerCase().includes('soft') || sheetName.toLowerCase().includes('english') || sIdx === 1)
            ? 'English Com and Soft Skill'
            : 'Azure (Specialization)';

          for (let i = 1; i < rows.length; i++) {
            const r = rows[i];
            if (!r || r.length < 5) continue;

            const title = r[7] || r[2] || r[0];
            const desc = r[6] || r[3] || r[0];
            const assignDate = formatExcelDate(r[8]);
            const deadlineDate = formatExcelDate(r[9]);

            if (title && assignDate) {
              parsedList.push({
                id: `sched_${sIdx}_${parsedList.length + 1}`,
                title: String(title).trim(),
                description: String(desc).trim(),
                class_name: targetClass,
                subject_name: subjectName,
                creation_date: assignDate,
                deadline: deadlineDate || assignDate,
                academic_year: selectedYear,
                status: 'scheduled',
                created_at: new Date().toISOString(),
                sheet_name: sheetName
              });
            }
          }
        });

        if (parsedList.length === 0) {
          toast.error('No valid scheduled tasks found in file');
        } else {
          setRawParsedTasks(parsedList);
          toast.success(`Successfully loaded ${parsedList.length} tasks across ${workbook.SheetNames.length} sheets!`);
        }
      } catch (err: any) {
        console.error('Error parsing Excel file:', err);
        toast.error('Failed to parse Excel file: ' + (err.message || ''));
      }
    };

    reader.readAsBinaryString(file);
  };

  // Save Bulk Import Tasks → directly to Supabase DB
  const handleConfirmImport = async () => {
    if (previewTasks.length === 0) return;
    setIsImporting(true);

    try {
      const { error } = await (supabase as any)
        .from('wes_scheduled_tasks')
        .insert(previewTasks.map(t => ({
          title: t.title,
          description: t.description + (importSubmissionRequirements.length > 0 ? `\n\n__REQS[${encodeURIComponent(JSON.stringify(importSubmissionRequirements))}]__\n\n__TYPE[${importTaskType}]__\n\n__YEAR[${importAcademicYear}]__\n\n__SESSION[${importSessionId}]__\n\n__INCHARGE[${importInchargeId}]__\n\n__EARNING[${importEarningAmount}]__` : ''),
          class_name: t.class_name,
          subject_name: t.subject_name,
          creation_date: t.creation_date,
          deadline: t.deadline || t.creation_date,
          academic_year: t.academic_year || selectedYear,
          status: 'scheduled',
        })));

      if (error) {
        toast.error(`Import failed: ${error.message}`);
        return;
      }

      toast.success(`✅ Imported ${previewTasks.length} tasks for ${targetClass} to database!`);
      setImportDialogOpen(false);
      setPreviewTasks([]);
      setRawParsedTasks([]);
      setImportFileName('');
      await loadScheduledTasks();
      
      // Auto-assign any tasks that are due today immediately after import
      await runScheduledTaskWorker(selectedYear);
      await loadScheduledTasks(); // Reload again in case statuses changed to 'published'
    } catch (e: any) {
      toast.error('Error saving imported tasks');
      console.error('Import error:', e);
    } finally {
      setIsImporting(false);
    }
  };

  
  const handleDeleteSelectedTasks = async () => {
    if (selectedTasks.length === 0) return;
    if (window.confirm(`⚠️ Delete ${selectedTasks.length} selected task(s)?\n\nIf these tasks were already assigned to students, they will also be permanently removed from their portals.\n\nClick OK to confirm.`)) {
      try {
        const tasksToDelete = scheduledTasks.filter(t => selectedTasks.includes(t.id));
        const taskTitles = tasksToDelete.map(t => t.title);

        const { error } = await (supabase as any)
          .from('wes_scheduled_tasks')
          .delete()
          .in('id', selectedTasks);
          
        if (error) { toast.error(`Delete failed: ${error.message}`); return; }

        // Also delete from student_task_feedback if published
        if (taskTitles.length > 0) {
          const { error: fbError } = await (supabase as any)
            .from('student_task_feedback')
            .delete()
            .in('task_name', taskTitles);
          if (fbError) console.error('Failed to delete from feedback table:', fbError);
        }

        setScheduledTasks(prev => prev.filter(t => !selectedTasks.includes(t.id)));
        setSelectedTasks([]);
        toast.success(`Deleted ${selectedTasks.length} task(s) successfully`);
      } catch (e) {
        toast.error('Failed to delete tasks');
      }
    }
  };

  
  const handleUndoPublish = async (task: ScheduledTask) => {
    if (window.confirm(`⚠️ Undo publishing for "${task.title}"?\n\nThis will instantly remove the task from all students' dashboards.\n\nClick OK to confirm.`)) {
      try {
        const { error: fbError } = await (supabase as any)
          .from('student_task_feedback')
          .delete()
          .eq('task_name', task.title);
        if (fbError) throw new Error(fbError.message);

        // We must push the creation_date to tomorrow, otherwise it will instantly show up as "Published" again
        // due to the Auto-Assign logic that considers any past date as published.
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowIso = tomorrow.toISOString().split('T')[0];
        const todayIso = new Date().toISOString().split('T')[0];
        
        const newCreationDate = task.creation_date <= todayIso ? tomorrowIso : task.creation_date;

        const { error: scheduleError } = await (supabase as any)
          .from('wes_scheduled_tasks')
          .update({ status: 'scheduled', creation_date: newCreationDate })
          .eq('id', task.id);
        if (scheduleError) throw new Error(scheduleError.message);

        setScheduledTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: 'scheduled', creation_date: newCreationDate } : t));
        toast.success(`Task "${task.title}" has been unpublished.` + (newCreationDate !== task.creation_date ? ` Date moved to ${newCreationDate} to prevent auto-publishing.` : ''));
      } catch (e: any) {
        toast.error(`Failed to undo publish: ${e.message}`);
      }
    }
  };

  const handleDeleteSingle = async (task: ScheduledTask) => {
    if (window.confirm(`⚠️ Delete "${task.title}"?\n\nIf this task was already assigned to students, it will also be permanently removed from their portals.\n\nClick OK to confirm.`)) {
      try {
        const { error: scheduledError } = await (supabase as any)
          .from('wes_scheduled_tasks')
          .delete()
          .eq('id', task.id);
        if (scheduledError) throw new Error(scheduledError.message);

        const { error: fbError } = await (supabase as any)
          .from('student_task_feedback')
          .delete()
          .eq('task_name', task.title);
        if (fbError) console.error('Failed to delete from feedback table:', fbError);

        setScheduledTasks(prev => prev.filter(t => t.id !== task.id));
        toast.success(`Deleted task successfully`);
      } catch (e: any) {
        toast.error(`Failed to delete task: ${e.message}`);
      }
    }
  };

  const handleSaveEdit = async () => {
    if (!editingTask) return;
    try {
      const { error: updateError } = await (supabase as any)
        .from('wes_scheduled_tasks')
        .update({
          title: editTaskForm.title,
          subject_name: editTaskForm.subject_name,
          creation_date: editTaskForm.creation_date,
          deadline: editTaskForm.deadline
        })
        .eq('id', editingTask.id);
      if (updateError) throw new Error(updateError.message);

      const isPastOrToday = editingTask.creation_date <= todayIso;
      const isPublished = editingTask.status === 'published' || isPastOrToday;
      if (isPublished) {
        const { error: fbError } = await (supabase as any)
          .from('student_task_feedback')
          .update({
            task_name: editTaskForm.title,
            deadline: `${editTaskForm.deadline}T23:59:59Z`
          })
          .eq('task_name', editingTask.title);
        if (fbError) console.error('Failed to sync edit to students:', fbError);
      }

      setScheduledTasks(prev => prev.map(t => t.id === editingTask.id ? { ...t, ...editTaskForm } : t));
      setEditDialogOpen(false);
      toast.success('Task updated successfully');
    } catch (e: any) {
      toast.error(`Failed to update task: ${e.message}`);
    }
  };

  const handlePublishNow = async (task: ScheduledTask) => {
    try {
      // 1. Find the class record by name
      const { data: classData } = await (supabase as any)
        .from('classes')
        .select('id, name')
        .ilike('name', task.class_name.trim())
        .limit(1);

      const classId = classData?.[0]?.id;
      if (!classId) {
        toast.error(`Class "${task.class_name}" not found in database`);
        return;
      }

      // 2. Fetch all students enrolled in that class
      const { data: studentsData } = await (supabase as any)
        .from('students')
        .select('id, name')
        .eq('class_id', classId);

      if (!studentsData || studentsData.length === 0) {
        toast.error(`No students found in class "${task.class_name}"`);
        return;
      }

      // 3. Generate task_id matching AddTask.tsx format exactly
      const d = new Date();
      const yearStr = d.getFullYear();
      const monthStr = String(d.getMonth() + 1).padStart(2, '0');
      const classNameStr = (task.class_name || 'SeniorFellow').replace(/[\s\/]+/g, '');
      const prefix = `${yearStr}-${monthStr}-${classNameStr}-`;

      const { data: existingTasks } = await (supabase as any)
        .from('student_task_feedback')
        .select('task_id')
        .like('task_id', `${prefix}%`)
        .order('task_id', { ascending: false })
        .limit(1);

      let nextSeq = 1;
      if (existingTasks && existingTasks.length > 0 && existingTasks[0].task_id) {
        const lastSeqStr = (existingTasks[0].task_id as string).split('-').pop();
        if (lastSeqStr) {
          const n = parseInt(lastSeqStr, 10);
          if (!isNaN(n)) nextSeq = n + 1;
        }
      }

      const generatedTaskId = `${prefix}${String(nextSeq).padStart(3, '0')}`;

      // 4. Look up real subject_id from subjects table
      let resolvedSubjectId: string | null = null;
      if (task.subject_name) {
        const { data: subjectData } = await (supabase as any)
          .from('subjects')
          .select('id')
          .ilike('name', task.subject_name.trim())
          .limit(1);
        resolvedSubjectId = subjectData?.[0]?.id || null;
      }

      
      let finalDesc = task.description;
      let finalReqs = ['video', 'pdf']; // fallback
      let finalType = 'general';
      let finalYear = task.academic_year || selectedYear;
      let finalSessionId = null;
      let finalInchargeId = null;
      let finalEarningAmount = 5;
      
      const reqMatch = finalDesc.match(/__REQS\[(.*?)\]__/);
      if (reqMatch) { 
        try { 
          const decodedReqs = JSON.parse(decodeURIComponent(reqMatch[1]));
          finalReqs = serializeSubmissionRequirements(decodedReqs);
        } catch(e) {}
        finalDesc = finalDesc.replace(reqMatch[0], ''); 
      } else {
        // Fallback to old format
        const oldReqMatch = finalDesc.match(/__REQ\[(.*?)\]__/);
        if (oldReqMatch) { finalReqs = oldReqMatch[1] ? oldReqMatch[1].split(',') : []; finalDesc = finalDesc.replace(oldReqMatch[0], ''); }
      }
      
      const typeMatch = finalDesc.match(/__TYPE\[(.*?)\]__/);
      if (typeMatch) { finalType = typeMatch[1]; finalDesc = finalDesc.replace(typeMatch[0], ''); }
      
      const yearMatch = finalDesc.match(/__YEAR\[(.*?)\]__/);
      if (yearMatch) { finalYear = yearMatch[1]; finalDesc = finalDesc.replace(yearMatch[0], ''); }
      
      const sessionMatch = finalDesc.match(/__SESSION\[(.*?)\]__/);
      if (sessionMatch) { finalSessionId = sessionMatch[1] === 'none' ? null : sessionMatch[1]; finalDesc = finalDesc.replace(sessionMatch[0], ''); }
      
      const earningMatch = finalDesc.match(/__EARNING\[(.*?)\]__/);
      if (earningMatch) { finalEarningAmount = Number(earningMatch[1]) || 5; finalDesc = finalDesc.replace(earningMatch[0], ''); }
      
      finalDesc = finalDesc.trim();

      // 5. Insert one row per student (same as AddTask)
      const taskRecords = studentsData.map((student: any) => ({
        student_id: student.id,
        task_name: task.title,
        task_description: finalDesc,
        task_id: generatedTaskId,
        deadline: task.deadline ? `${task.deadline}T23:59:59Z` : new Date().toISOString(),
        session_id: finalSessionId,
          created_by: finalInchargeId,
          earning_amount: finalEarningAmount,
          status: 'pending',
        feedback_type: finalType,
        academic_year: finalYear,
        created_at: new Date().toISOString(),
        submission_types: finalReqs,
        subject_id: resolvedSubjectId,
      }));

      const { error } = await (supabase as any)
        .from('student_task_feedback')
        .insert(taskRecords);

      if (error) {
        console.error('Insert error:', error.message);
        toast.error(`DB error: ${error.message}`);
        return;
      }

      // 5. Mark as published in Supabase DB
      await (supabase as any)
        .from('wes_scheduled_tasks')
        .update({ status: 'published', updated_at: new Date().toISOString() })
        .eq('id', task.id);

      // Update local state
      setScheduledTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: 'published' as const } : t));
      toast.success(`✅ Published "${task.title}" to ${studentsData.length} students → Task ID: ${generatedTaskId}`);
    } catch (e: any) {
      toast.error('Failed to publish task');
      console.error('handlePublishNow error:', e);
    }
  };

  // Today Date for Status Check
  const todayIso = new Date().toISOString().split('T')[0];

  // Filter Tasks for Display
  const filteredTasks = scheduledTasks.filter(t => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchTitle = t.title.toLowerCase().includes(q);
      const matchDesc = t.description.toLowerCase().includes(q);
      if (!matchTitle && !matchDesc) return false;
    }
    if (filterClass !== 'all' && t.class_name.toLowerCase() !== filterClass.toLowerCase()) {
      return false;
    }
    if (filterSubject !== 'all' && t.subject_name.toLowerCase() !== filterSubject.toLowerCase()) {
      return false;
    }
    if (filterStatus !== 'all') {
      const isPast = t.creation_date <= todayIso;
      if (filterStatus === 'scheduled' && (t.status === 'published' || isPast)) return false;
      if (filterStatus === 'published' && (t.status !== 'published' && !isPast)) return false;
    }
    return true;
  });

  // Calculate Metrics
  const totalTasks = scheduledTasks.length;
  const pendingCount = scheduledTasks.filter(t => t.creation_date > todayIso && t.status !== 'published').length;
  const publishedCount = scheduledTasks.filter(t => t.creation_date <= todayIso || t.status === 'published').length;
  const uniqueClassesCount = new Set(scheduledTasks.map(t => t.class_name)).size;

  // Deduplicated class list options
  const classOptions = Array.from(
    new Set(
      ['Senior Fellow', 'CCC EMP Fellow', 'Class 10', 'Class 9', 'Class 8', ...classes.map(c => c.name)]
        .filter(name => name && name !== '__SYSTEM_DEV_MODE__')
    )
  );

  return (
    <DashboardLayout>
      <div className="space-y-6 pb-12">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-foreground flex items-center gap-2">
              <Clock className="h-7 w-7 text-primary" />
              Scheduled Tasks & Projects
            </h1>
            <p className="text-muted-foreground mt-1 text-xs md:text-sm">
              Manage bulk imported daily tasks and automated scheduled creation date releases
            </p>
          </div>

          <div className="flex items-center gap-2">
            {selectedTasks.length > 0 && (
                <Button
                  variant="destructive"
                  className="gap-2 font-semibold"
                  onClick={handleDeleteSelectedTasks}
                >
                  <Trash2 className="h-4 w-4" />
                  Delete Selected ({selectedTasks.length})
                </Button>
              )}

            <Button 
              variant="outline" 
              className="gap-2"
              onClick={async () => {
                toast.info('Running auto-assignment worker...');
                await runScheduledTaskWorker(selectedYear);
                await loadScheduledTasks();
                toast.success('Auto-assignment complete!');
              }}
            >
              <Clock className="h-4 w-4" />
              Run Auto-Assign
            </Button>

            <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
              <DialogTrigger asChild>
                <Button className="gap-2 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold">
                  <Upload className="h-4 w-4" />
                  Bulk Import Excel Tasks
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2 text-xl">
                    <FileSpreadsheet className="h-6 w-6 text-primary" />
                    Bulk Import Scheduled Tasks from Excel
                  </DialogTitle>
                  <DialogDescription>
                    Upload an Excel file (`.xlsx`). You can choose to import all sheets together or import specific sheets separately.
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-2">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    
                      <div className="space-y-1.5">
                        <Label>Task Type</Label>
                        
                          <Select value={importTaskType} onValueChange={(val) => {
                            setImportTaskType(val);
                            const config = rewardConfigs.find(c => c.task_type === val);
                            if (config && config.rate_per_task) setImportEarningAmount(config.rate_per_task);
                          }}>

                          <SelectTrigger><SelectValue placeholder="Select Task Type" /></SelectTrigger>
                          <SelectContent>
                            {rewardConfigs.map(c => <SelectItem key={c.task_type} value={c.task_type}>{c.task_type}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      
                      <div className="space-y-1.5">
                        <Label>Academic Year</Label>
                        <Select value={importAcademicYear} onValueChange={setImportAcademicYear}>
                          <SelectTrigger><SelectValue placeholder="Select Year" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="2026-27">2026-27</SelectItem>
                            <SelectItem value="2025-26">2025-26</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-1.5">
                      <Label htmlFor="target-class">Target Class / Designation</Label>
                      <Select value={targetClass} onValueChange={setTargetClass}>
                        <SelectTrigger id="target-class">
                          <SelectValue placeholder="Select Designation / Class" />
                        </SelectTrigger>
                        <SelectContent>
                          {classOptions.map(name => (
                            <SelectItem key={name} value={name}>{name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    
                      <div className="space-y-1.5">
                        <Label>Subject (Optional)</Label>
                        <Select value={customSubjectOverride} onValueChange={setCustomSubjectOverride}>
                          <SelectTrigger><SelectValue placeholder="Select Subject" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="auto">Auto-detect from Sheet</SelectItem>
                            {allSubjects.map(s => <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      
                      
                      <div className="space-y-1.5">
                        <Label>Incharge (Optional)</Label>
                        <Select value={importInchargeId} onValueChange={setImportInchargeId}>
                          <SelectTrigger><SelectValue placeholder="No Incharge" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">None</SelectItem>
                            {inchargeOptions.map(i => <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>

                        <div className="space-y-1.5">
                          <Label>Linked Session (Optional)</Label>
                        <Select value={importSessionId} onValueChange={setImportSessionId}>
                          <SelectTrigger><SelectValue placeholder="No Session" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">None</SelectItem>
                            {availableSessions.map(s => <SelectItem key={s.id} value={s.id}>{s.title}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-1.5">
                      <Label htmlFor="excel-file">Upload Excel File (.xlsx / .csv)</Label>
                      <Input
                        id="excel-file"
                        type="file"
                        accept=".xlsx, .xls, .csv"
                        onChange={handleFileUpload}
                        className="cursor-pointer"
                      />
                      {importFileName && (
                        <p className="text-xs text-emerald-600 font-medium mt-1">
                          Loaded file: {importFileName}
                        </p>
                      )}
                    </div>
                  </div>

                  {availableSheets.length > 0 && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 border p-3 rounded-xl bg-slate-50">
                      <div className="space-y-1.5">
                        <Label className="text-xs font-semibold flex items-center gap-1.5">
                          <Layers className="h-3.5 w-3.5 text-primary" />
                          Select Sheet to Import
                        </Label>
                        <Select value={selectedSheet} onValueChange={setSelectedSheet}>
                          <SelectTrigger className="h-9 text-xs bg-background">
                            <SelectValue placeholder="Select Sheet" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All Sheets ({rawParsedTasks.length} Total Tasks)</SelectItem>
                            {availableSheets.map((sName, idx) => {
                              const count = rawParsedTasks.filter(t => t.sheet_name === sName).length;
                              return (
                                <SelectItem key={sName} value={sName}>
                                  Sheet {idx + 1}: {sName} ({count} Tasks)
                                </SelectItem>
                              );
                            })}
                          </SelectContent>
                        </Select>
                      </div>

                      
                    </div>
                  )}

                  
                    <div className="space-y-3 pt-3 border-t">
                      <div className="flex justify-between items-center">
                        <Label className="text-sm font-bold flex items-center gap-2">
                          <CheckCircle2 className="h-4 w-4 text-primary" />
                          Required Submission Types (Applied to all imported tasks)
                        </Label>
                        <Button 
                          type="button" 
                          variant="outline" 
                          size="sm"
                          className="h-8 text-xs"
                          onClick={() => {
                            const newReq: SubmissionRequirement = {
                              id: Math.random().toString(36).substr(2, 9),
                              title: '',
                              type: 'pdf'
                            };
                            setImportSubmissionRequirements([...importSubmissionRequirements, newReq]);
                          }}
                        >
                          + Add Requirement
                        </Button>
                      </div>
                      
                      {importSubmissionRequirements.length === 0 ? (
                        <div className="text-sm text-red-500 font-medium">At least one submission requirement is mandatory. Add a requirement.</div>
                      ) : (
                        <div className="space-y-3">
                          {importSubmissionRequirements.map((req, index) => (
                            <div key={req.id} className="flex gap-2 items-start border p-3 rounded-md bg-gray-50">
                              <div className="flex-1 space-y-2">
                                <div>
                                  <Label className="text-xs">Requirement Title *</Label>
                                  <Input 
                                    placeholder="e.g., Presentation PPT" 
                                    value={req.title}
                                    onChange={(e) => {
                                      const updated = [...importSubmissionRequirements];
                                      updated[index].title = e.target.value;
                                      setImportSubmissionRequirements(updated);
                                    }}
                                  />
                                </div>
                              </div>
                              <div className="w-48 space-y-2">
                                <Label className="text-xs">File Type</Label>
                                <select 
                                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                                  value={req.type}
                                  onChange={(e) => {
                                    const updated = [...importSubmissionRequirements];
                                    updated[index].type = e.target.value as SubmissionRequirement['type'];
                                    setImportSubmissionRequirements(updated);
                                  }}
                                >
                                  <option value="video">Video</option>
                                  <option value="pdf">Pdf</option>
                                  <option value="doc">Doc</option>
                                  <option value="ppt">Ppt</option>
                                  <option value="excel">Excel</option>
                                  <option value="image">Image</option>
                                  <option value="code">Code</option>
                                  <option value="link">Link</option>
                                </select>
                              </div>
                              <div className="space-y-2 flex flex-col justify-end h-full mt-6">
                                <Button
                                  type="button"
                                  variant="destructive"
                                  size="icon"
                                  onClick={() => {
                                    const updated = importSubmissionRequirements.filter((_, i) => i !== index);
                                    setImportSubmissionRequirements(updated);
                                  }}
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    
                    <div className="space-y-1.5 pt-3 border-t">
                      <Label>Reward Points (Earning Amount)</Label>
                      <Input
                        type="number"
                        min="0"
                        value={importEarningAmount}
                        onChange={e => setImportEarningAmount(e.target.value ? Number(e.target.value) : '')}
                        placeholder="e.g., 5"
                      />
                    </div>


                  {previewTasks.length > 0 && (
                    <div className="space-y-2 border rounded-xl p-3 bg-muted/30">
                      <div className="flex items-center justify-between text-xs font-bold">
                        <span>Parsed Task Preview ({previewTasks.length} Tasks Ready)</span>
                        <span className="text-primary">Target: {targetClass}</span>
                      </div>

                      <div className="max-h-48 overflow-y-auto rounded-md border bg-background text-xs">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Subject</TableHead>
                              <TableHead>Task Title</TableHead>
                              <TableHead>Assign Date</TableHead>
                              <TableHead>Deadline</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {previewTasks.slice(0, 15).map((t, idx) => (
                              <TableRow key={idx}>
                                <TableCell className="font-semibold text-primary">{t.subject_name}</TableCell>
                                <TableCell className="truncate max-w-[200px]">{t.title}</TableCell>
                                <TableCell>{t.creation_date}</TableCell>
                                <TableCell>{t.deadline}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                      {previewTasks.length > 15 && (
                        <p className="text-[11px] text-muted-foreground text-center">
                          + {previewTasks.length - 15} more daily tasks ready to import
                        </p>
                      )}
                    </div>
                  )}
                </div>

                <DialogFooter className="gap-2">
                  <Button variant="outline" onClick={() => setImportDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    onClick={handleConfirmImport}
                    disabled={previewTasks.length === 0 || isImporting}
                    className="gap-2 bg-primary"
                  >
                    {isImporting ? 'Importing Tasks...' : `Import & Schedule ${previewTasks.length} Tasks`}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* KPI Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="border-l-4 border-l-primary">
            <CardHeader className="py-3">
              <CardDescription className="text-xs">Total Scheduled Tasks</CardDescription>
              <CardTitle className="text-2xl font-bold">{totalTasks}</CardTitle>
            </CardHeader>
          </Card>

          <Card className="border-l-4 border-l-amber-500">
            <CardHeader className="py-3">
              <CardDescription className="text-xs">Pending Scheduled Release</CardDescription>
              <CardTitle className="text-2xl font-bold text-amber-600">{pendingCount}</CardTitle>
            </CardHeader>
          </Card>

          <Card className="border-l-4 border-l-emerald-500">
            <CardHeader className="py-3">
              <CardDescription className="text-xs">Published / Active Tasks</CardDescription>
              <CardTitle className="text-2xl font-bold text-emerald-600">{publishedCount}</CardTitle>
            </CardHeader>
          </Card>

          <Card className="border-l-4 border-l-blue-500">
            <CardHeader className="py-3">
              <CardDescription className="text-xs">Designations Covered</CardDescription>
              <CardTitle className="text-2xl font-bold text-blue-600">{uniqueClassesCount}</CardTitle>
            </CardHeader>
          </Card>
        </div>

        {/* Filters & Search */}
        <Card>
          <CardHeader className="py-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="relative w-full md:w-80">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search scheduled task title or description..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>

              <div className="flex flex-wrap items-center gap-3">
                {/* Filter Class */}
                <div className="w-40">
                  <Select value={filterClass} onValueChange={setFilterClass}>
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue placeholder="Filter by Class" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Classes / Designations</SelectItem>
                      {classOptions.map(name => (
                        <SelectItem key={name} value={name}>{name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Filter Subject */}
                <div className="w-44">
                    <Select value={filterSubject} onValueChange={setFilterSubject}>
                      <SelectTrigger className="h-9 text-xs">
                        <SelectValue placeholder="Filter by Subject" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Subjects</SelectItem>
                        {Array.from(new Set([...allSubjects.map(s => s.name), ...scheduledTasks.map(t => t.subject_name)])).sort().map(s => (
                          <SelectItem key={s} value={s}>{s}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                {/* Filter Status */}
                <div className="w-40">
                  <Select value={filterStatus} onValueChange={setFilterStatus}>
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue placeholder="Filter by Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Release Status</SelectItem>
                      <SelectItem value="scheduled">Pending Scheduled</SelectItem>
                      <SelectItem value="published">Published / Active</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </CardHeader>

          <CardContent>
            {loading ? (
              <div className="py-12 text-center text-sm text-muted-foreground">
                Loading scheduled tasks...
              </div>
            ) : filteredTasks.length === 0 ? (
              <div className="py-12 text-center space-y-3">
                <Clock className="h-10 w-10 text-muted-foreground mx-auto" />
                <p className="font-semibold text-base">No scheduled tasks found</p>
                <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                  Click "Bulk Import Excel Tasks" above to upload daily task schedules from Excel spreadsheets.
                </p>
              </div>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">
                        <Checkbox 
                          checked={filteredTasks.length > 0 && selectedTasks.length === filteredTasks.slice(0, 100).length}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setSelectedTasks(filteredTasks.slice(0, 100).map(t => t.id));
                            } else {
                              setSelectedTasks([]);
                            }
                          }}
                        />
                      </TableHead>
                      <TableHead>Task ID</TableHead>
                      <TableHead>Task Title</TableHead>
                      <TableHead>Class / Designation</TableHead>
                      <TableHead>Subject</TableHead>
                      <TableHead>Assign Date</TableHead>
                      <TableHead>Deadline</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredTasks.slice(0, 100).map((t, idx) => {
                      const isPastOrToday = t.creation_date <= todayIso;
                      const isPublished = t.status === 'published' || isPastOrToday;

                      return (
                        <TableRow key={t.id} className={selectedTasks.includes(t.id) ? "bg-muted/50" : ""}>
                          <TableCell>
                            <Checkbox 
                              checked={selectedTasks.includes(t.id)}
                              onCheckedChange={(checked) => {
                                if (checked) {
                                  setSelectedTasks([...selectedTasks, t.id]);
                                } else {
                                  setSelectedTasks(selectedTasks.filter(id => id !== t.id));
                                }
                              }}
                            />
                          </TableCell>
                          <TableCell className="font-mono text-xs text-muted-foreground whitespace-nowrap">
                            {getCleanTaskId(t, idx)}
                          </TableCell>
                          <TableCell className="font-semibold max-w-[280px]">
                            <div className="truncate" title={t.title}>
                              {t.title}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="bg-slate-100 text-slate-800 text-[11px]">
                              {t.class_name}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs text-primary font-medium">
                            {t.subject_name}
                          </TableCell>
                          <TableCell className="text-xs font-mono">
                            {formatExcelDate(t.creation_date)}
                          </TableCell>
                          <TableCell className="text-xs font-mono text-muted-foreground">
                            {formatExcelDate(t.deadline)}
                          </TableCell>
                          <TableCell>
                            {isPublished ? (
                              <Badge className="bg-emerald-500/15 text-emerald-700 border-emerald-300 gap-1 text-[11px]">
                                <CheckCircle2 className="h-3 w-3" />
                                Published
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="bg-amber-500/15 text-amber-700 border-amber-300 gap-1 text-[11px]">
                                <Clock className="h-3 w-3" />
                                Scheduled ({t.creation_date})
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" className="h-8 w-8 p-0">
                                    <span className="sr-only">Open menu</span>
                                    <MoreHorizontal className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem onClick={() => {
                                    setSelectedTask(t);
                                    setViewDialogOpen(true);
                                  }}>
                                    <Eye className="mr-2 h-4 w-4" /> View Details
                                  </DropdownMenuItem>
                                  
                                  <DropdownMenuItem onClick={() => {
                                    setEditingTask(t);
                                    setEditTaskForm({
                                      title: t.title,
                                      subject_name: t.subject_name,
                                      creation_date: t.creation_date,
                                      deadline: t.deadline || t.creation_date
                                    });
                                    setEditDialogOpen(true);
                                  }}>
                                    <Edit className="mr-2 h-4 w-4" /> Edit Task
                                  </DropdownMenuItem>

                                  {!isPublished && (
                                    <DropdownMenuItem onClick={() => handlePublishNow(t)}>
                                      <CheckCircle2 className="mr-2 h-4 w-4 text-emerald-600" /> Publish Now
                                    </DropdownMenuItem>
                                  )}

                                  {isPublished && (
                                    <DropdownMenuItem onClick={() => handleUndoPublish(t)}>
                                      <RotateCcw className="mr-2 h-4 w-4 text-amber-600" /> Undo Publish
                                    </DropdownMenuItem>
                                  )}

                                  <DropdownMenuSeparator />
                                  
                                  <DropdownMenuItem onClick={() => handleDeleteSingle(t)} className="text-destructive focus:text-destructive">
                                    <Trash2 className="mr-2 h-4 w-4" /> Delete Task
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
                {filteredTasks.length > 100 && (
                  <p className="text-xs text-muted-foreground text-center py-2 bg-muted/20">
                    Showing top 100 of {filteredTasks.length} scheduled tasks
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* View Task Dialog */}
        <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
          <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-lg font-bold">
                {selectedTask?.title}
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground flex items-center gap-3 pt-1">
                <span>Class: {selectedTask?.class_name}</span>
                <span>•</span>
                <span>Subject: {selectedTask?.subject_name}</span>
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="grid grid-cols-2 gap-3 text-xs bg-muted/40 p-3 rounded-lg border">
                <div>
                  <span className="text-muted-foreground">Assign Date:</span>
                  <p className="font-bold text-foreground">{selectedTask?.creation_date}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Deadline:</span>
                  <p className="font-bold text-foreground">{selectedTask?.deadline}</p>
                </div>
              </div>

              <div>
                <Label className="text-xs text-muted-foreground">Task Content / Description:</Label>
                <div className="mt-1.5 p-3 rounded-lg border bg-background text-xs whitespace-pre-wrap leading-relaxed max-h-80 overflow-y-auto font-mono">
                  {selectedTask?.description}
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button onClick={() => setViewDialogOpen(false)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      
          {/* Edit Task Dialog */}
          <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Edit Task</DialogTitle>
                <DialogDescription>
                  Modify the details of this scheduled task. Changes to published tasks will automatically update student dashboards.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Task Title</Label>
                  <Input 
                    value={editTaskForm.title} 
                    onChange={e => setEditTaskForm({...editTaskForm, title: e.target.value})}
                  />
                </div>
                                  <div className="space-y-2">
                    <Label>Subject</Label>
                    <Select 
                      value={editTaskForm.subject_name} 
                      onValueChange={val => setEditTaskForm({...editTaskForm, subject_name: val})}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select Subject" />
                      </SelectTrigger>
                      <SelectContent>
                        {allSubjects.map(s => (
                          <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Assign Date</Label>
                    <Input 
                      type="date"
                      value={editTaskForm.creation_date} 
                      onChange={e => setEditTaskForm({...editTaskForm, creation_date: e.target.value})}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Deadline</Label>
                    <Input 
                      type="date"
                      value={editTaskForm.deadline} 
                      onChange={e => setEditTaskForm({...editTaskForm, deadline: e.target.value})}
                    />
                  </div>
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setEditDialogOpen(false)}>Cancel</Button>
                <Button onClick={handleSaveEdit}>Save Changes</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

        </div>
      </DashboardLayout>
  );
}
