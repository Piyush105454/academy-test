import { useState, useEffect, useMemo } from 'react';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription,
  DialogFooter,
  DialogClose 
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useAcademicYear } from '@/contexts/AcademicYearContext';
import { serializeSubmissionRequirements, type SubmissionRequirement } from '@/utils/submissionUtils';
import { toast } from 'sonner';
import { 
  Zap, 
  UploadCloud, 
  Calendar, 
  CheckCircle2, 
  Clock, 
  FileSpreadsheet, 
  Layers, 
  AlertCircle, 
  Users,
  Loader2,
  BookOpen
} from 'lucide-react';
import * as XLSX from 'xlsx';
import preloadedTasksData from '@/data/preloadedTasks.json';

interface BulkAssignTasksDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

interface ClassOption {
  id: string;
  name: string;
}

interface SubjectOption {
  id: string;
  name: string;
}

interface StudentOption {
  id: string;
  name: string;
  class_id: string;
  designation?: string;
}

interface TaskTemplate {
  title: string;
  category?: string;
  difficulty?: string;
  topic?: string;
  description: string;
  excelReleaseDate?: string | null;
  excelDeadlineDate?: string | null;
}

// Helper to parse Excel dates (serial numbers or string formats DD/MM/YYYY, YYYY-MM-DD)
const parseExcelDate = (val: any): string | null => {
  if (val === null || val === undefined || val === '') return null;
  if (typeof val === 'number') {
    const dateObj = new Date(Math.round((val - 25569) * 86400 * 1000));
    if (!isNaN(dateObj.getTime())) {
      return dateObj.toISOString().split('T')[0];
    }
  }
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (!trimmed) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
    const ddmmyyyy = trimmed.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (ddmmyyyy) {
      const day = ddmmyyyy[1].padStart(2, '0');
      const month = ddmmyyyy[2].padStart(2, '0');
      const year = ddmmyyyy[3];
      return `${year}-${month}-${day}`;
    }
    const parsed = new Date(trimmed);
    if (!isNaN(parsed.getTime())) {
      return parsed.toISOString().split('T')[0];
    }
  }
  return null;
};

export function BulkAssignTasksDialog({ open, onOpenChange, onSuccess }: BulkAssignTasksDialogProps) {
  const { user } = useAuth();
  const { selectedYear } = useAcademicYear();

  // Selection states
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [subjects, setSubjects] = useState<SubjectOption[]>([]);
  const [students, setStudents] = useState<StudentOption[]>([]);
  
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  // Default designation fixed to 3. Senior Fellow as requested by user
  const [selectedDesignation, setSelectedDesignation] = useState<string>('3. Senior Fellow');
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>('');

  // Source Choice
  const [sourceType, setSourceType] = useState<'preloaded_te' | 'preloaded_ss' | 'excel_upload'>('preloaded_te');
  const [uploadedTasks, setUploadedTasks] = useState<TaskTemplate[]>([]);
  const [uploadedFileName, setUploadedFileName] = useState<string>('');

  // Task Range
  const [startTaskNum, setStartTaskNum] = useState<number>(1);
  const [endTaskNum, setEndTaskNum] = useState<number>(30);

  // Scheduling Configuration
  const [startDate, setStartDate] = useState<string>(() => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  });
  const [frequency, setFrequency] = useState<'daily' | 'weekdays' | 'every_2_days' | 'same_day'>('daily');
  const [deadlineOffsetDays, setDeadlineOffsetDays] = useState<number>(1); // default 1 day after
  const [earningAmount, setEarningAmount] = useState<number>(10);

  // Submission requirements (Default: Video & PDF/Doc enabled as requested)
  const [reqText, setReqText] = useState<boolean>(true);
  const [reqVideo, setReqVideo] = useState<boolean>(true);
  const [reqDoc, setReqDoc] = useState<boolean>(true); // PDF / Document Upload

  // Loading & Progress
  const [loadingData, setLoadingData] = useState<boolean>(false);
  const [assigning, setAssigning] = useState<boolean>(false);
  const [progressText, setProgressText] = useState<string>('');

  useEffect(() => {
    if (open) {
      fetchInitialData();
    }
  }, [open]);

  // Auto select subject matching task type
  useEffect(() => {
    if (subjects.length > 0) {
      if (sourceType === 'preloaded_te') {
        const teSub = subjects.find(s => s.name.toLowerCase().includes('english'));
        if (teSub) setSelectedSubjectId(teSub.id);
      } else if (sourceType === 'preloaded_ss') {
        const ssSub = subjects.find(s => s.name.toLowerCase().includes('soft skill') || s.name.toLowerCase().includes('skills'));
        if (ssSub) setSelectedSubjectId(ssSub.id);
      }
    }
  }, [sourceType, subjects]);

  const fetchInitialData = async () => {
    try {
      setLoadingData(true);

      const [classesRes, subjectsRes, studentsRes] = await Promise.all([
        supabase.from('classes').select('id, name').order('name'),
        supabase.from('subjects').select('id, name').order('name'),
        supabase.from('students').select('id, name, class_id, designation').order('name')
      ]);

      if (classesRes.data) {
        setClasses(classesRes.data);
        if (classesRes.data.length > 0 && !selectedClassId) {
          setSelectedClassId(classesRes.data[0].id);
        }
      }

      if (subjectsRes.data) {
        setSubjects(subjectsRes.data);
        if (subjectsRes.data.length > 0 && !selectedSubjectId) {
          const teSub = subjectsRes.data.find(s => s.name.toLowerCase().includes('english')) || subjectsRes.data[0];
          setSelectedSubjectId(teSub.id);
        }
      }

      if (studentsRes.data) {
        setStudents(studentsRes.data);
      }
    } catch (e) {
      console.error('Error fetching data for bulk task assignment:', e);
      toast.error('Failed to load classes or students');
    } finally {
      setLoadingData(false);
    }
  };

  // Filter students based on selected class and designation
  const matchingStudents = useMemo(() => {
    if (!selectedClassId) return [];
    return students.filter(s => {
      if (s.class_id !== selectedClassId) return false;
      if (selectedDesignation !== 'all' && s.designation) {
        return s.designation === selectedDesignation;
      }
      return true;
    });
  }, [students, selectedClassId, selectedDesignation]);

  // Determine full task list based on selected source
  const fullTasksList = useMemo<TaskTemplate[]>(() => {
    if (sourceType === 'preloaded_te') {
      return (preloadedTasksData.technicalEnglish || []).map(t => ({
        title: t.title,
        category: t.category,
        difficulty: t.difficulty,
        topic: t.topic,
        description: t.fullDescription
      }));
    } else if (sourceType === 'preloaded_ss') {
      return (preloadedTasksData.softSkills || []).map(t => ({
        title: t.title,
        category: t.category,
        difficulty: t.difficulty,
        topic: t.topic,
        description: t.fullDescription
      }));
    } else {
      return uploadedTasks;
    }
  }, [sourceType, uploadedTasks]);

  // Max available tasks
  const maxAvailableTasks = fullTasksList.length;

  // Selected range of tasks
  const selectedTasksSlice = useMemo<TaskTemplate[]>(() => {
    if (fullTasksList.length === 0) return [];
    const start = Math.max(0, startTaskNum - 1);
    const end = Math.min(fullTasksList.length, endTaskNum);
    return fullTasksList.slice(start, end);
  }, [fullTasksList, startTaskNum, endTaskNum]);

  // Handle custom Excel upload with support for Prepare Date & Deadline Date columns
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadedFileName(file.name);
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = new Uint8Array(event.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });

        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const jsonRows: any[] = XLSX.utils.sheet_to_json(worksheet);

        const parsed: TaskTemplate[] = jsonRows.map((row, idx) => {
          const rowKeys = Object.keys(row);
          
          // Positional fallbacks: Column 1 = Description, Column 2 = Title
          const posDesc = rowKeys.length > 0 ? String(row[rowKeys[0]] || '') : '';
          const posTitle = rowKeys.length > 1 ? String(row[rowKeys[1]] || '') : '';

          // Extract title (check Task Title, Topic, Title, Name, or Column 2)
          const title = row['Task Title'] || row['Topic'] || row['Title'] || row['Task'] || row['Task Name'] || posTitle || `Task ${idx + 1}`;
          const category = row['Category'] || '';
          const difficulty = row['Difficulty'] || '';
          const topic = row['Topic'] || '';

          // Extract article / description (check Article, Description, Final Task, or Column 1)
          const article = row['Article'] || row['Article (English + Hindi Summary)'] || row['Description'] || row['Task Description'] || '';
          const keyTerms = row['Technical Terms and Simple Meanings'] || row['Key Terms and Meanings'] || row['Key Terms'] || '';
          const finalTask = row['Final Technical English Daily Task'] || row['Final Soft Skills Daily Task'] || row['Daily Task'] || row['Final Task'] || '';

          const fullDesc = [article, keyTerms ? `--- KEY TERMS ---\n${keyTerms}` : '', finalTask ? `--- DAILY TASK ---\n${finalTask}` : ''].filter(Boolean).join('\n\n') || posDesc;

          // Extract Prepare Date / Release Date / Assigned Date column (Column I in Excel)
          const prepDateVal = row['Assigned Date'] || row['AssignedDate'] || row['Prepare Date'] || row['Prep Date'] || row['PrepareDate'] || row['Release Date'] || row['Start Date'] || row['Date'];
          const excelReleaseDate = parseExcelDate(prepDateVal);

          // Extract Deadline Date / Due Date / Submission Date column (Column J in Excel)
          const deadlineDateVal = row['Submission Date'] || row['SubmissionDate'] || row['Deadline Date'] || row['Deadline'] || row['Due Date'] || row['Submission'];
          const excelDeadlineDate = parseExcelDate(deadlineDateVal);

          return {
            title,
            category,
            difficulty,
            topic,
            description: fullDesc || title,
            excelReleaseDate,
            excelDeadlineDate
          };
        });

        setUploadedTasks(parsed);
        setSourceType('excel_upload');
        setStartTaskNum(1);
        setEndTaskNum(parsed.length);
        toast.success(`Loaded ${parsed.length} tasks from ${file.name}`);
      } catch (err) {
        console.error('Error parsing Excel file:', err);
        toast.error('Failed to parse Excel file. Please check file format.');
      }
    };
    reader.readAsArrayBuffer(file);
  };

  // Helper to compute release date and deadline date for task at index i
  const computeDatesForIndex = (taskIndex: number, task?: TaskTemplate) => {
    let releaseDateStr = task?.excelReleaseDate || null;
    let deadlineDateStr = task?.excelDeadlineDate || null;

    if (!releaseDateStr) {
      const start = new Date(startDate);
      let releaseDate = new Date(start);

      if (frequency === 'daily') {
        releaseDate.setDate(releaseDate.getDate() + taskIndex);
      } else if (frequency === 'weekdays') {
        let addedDays = 0;
        while (addedDays < taskIndex) {
          releaseDate.setDate(releaseDate.getDate() + 1);
          const dayOfWeek = releaseDate.getDay();
          if (dayOfWeek !== 0 && dayOfWeek !== 6) {
            addedDays++;
          }
        }
      } else if (frequency === 'every_2_days') {
        releaseDate.setDate(releaseDate.getDate() + (taskIndex * 2));
      }
      releaseDateStr = releaseDate.toISOString().split('T')[0];
    }

    if (!deadlineDateStr) {
      const releaseObj = new Date(releaseDateStr);
      const deadlineObj = new Date(releaseObj);
      deadlineObj.setDate(deadlineObj.getDate() + deadlineOffsetDays);
      deadlineDateStr = deadlineObj.toISOString().split('T')[0];
    }

    const deadlineIsoStr = new Date(`${deadlineDateStr}T23:59:59.999Z`).toISOString();

    return {
      releaseDateStr,
      deadlineIsoStr,
      deadlineDateStr
    };
  };

  // Serialize submission requirements to string[] array format for PostgreSQL TEXT[] column
  const getSubmissionTypes = (): string[] => {
    const reqs: SubmissionRequirement[] = [];
    if (reqText) reqs.push({ id: 'req-text', title: 'Written Summary / Text Answer', type: 'text' });
    if (reqVideo) reqs.push({ id: 'req-video', title: 'Video Recording Link', type: 'link' });
    if (reqDoc) reqs.push({ id: 'req-doc', title: 'PDF / Document Upload', type: 'file' });
    return serializeSubmissionRequirements(reqs);
  };

  // Execute Bulk Task Creation
  const handleBulkAssign = async () => {
    if (matchingStudents.length === 0) {
      toast.error('No matching students found for the selected Class & Designation.');
      return;
    }

    if (selectedTasksSlice.length === 0) {
      toast.error('No tasks selected in the range.');
      return;
    }

    try {
      setAssigning(true);

      const selectedClass = classes.find(c => c.id === selectedClassId);
      const classNameStr = selectedClass ? selectedClass.name.replace(/[\s\/]+/g, '') : 'Class';

      const submissionTypesJson = getSubmissionTypes();
      const taskTypeLabel = sourceType === 'preloaded_te' ? 'Technical English Daily Task' :
                            sourceType === 'preloaded_ss' ? 'Soft Skills Daily Task' : 'Custom Excel Task';

      let totalInserted = 0;
      const totalTasksToCreate = selectedTasksSlice.length;

      for (let tIdx = 0; tIdx < selectedTasksSlice.length; tIdx++) {
        const task = selectedTasksSlice[tIdx];
        const dates = computeDatesForIndex(tIdx, task);

        setProgressText(`Creating task ${tIdx + 1} of ${totalTasksToCreate}: "${task.title.slice(0, 30)}..."`);

        // Compute release date timestamp and release year/month for Task ID
        const releaseDateObj = dates.releaseDateStr ? new Date(`${dates.releaseDateStr}T09:00:00.000Z`) : new Date();
        const releaseIsoStr = !isNaN(releaseDateObj.getTime()) ? releaseDateObj.toISOString() : new Date().toISOString();
        const relYear = !isNaN(releaseDateObj.getTime()) ? releaseDateObj.getFullYear() : new Date().getFullYear();
        const relMonth = !isNaN(releaseDateObj.getTime()) ? String(releaseDateObj.getMonth() + 1).padStart(2, '0') : String(new Date().getMonth() + 1).padStart(2, '0');
        const prefix = `${relYear}-${relMonth}-${classNameStr}-`;

        const seqStr = String(tIdx + 1).padStart(3, '0');
        const generatedTaskId = `${prefix}${seqStr}-${Date.now().toString().slice(-4)}`;

        const recordsToInsert = matchingStudents.map(student => ({
          session_id: null,
          student_id: student.id,
          feedback_type: taskTypeLabel,
          task_name: task.title,
          task_id: generatedTaskId,
          task_description: task.description,
          deadline: dates.deadlineIsoStr,
          submission_link: null,
          status: 'pending',
          created_at: releaseIsoStr,
          academic_year: selectedYear,
          subject_id: selectedSubjectId || null,
          earning_amount: earningAmount,
          submission_types: submissionTypesJson,
          created_by: user?.id || null,
        }));

        const { error } = await supabase.from('student_task_feedback').insert(recordsToInsert);
        if (error) {
          console.error(`Error creating task "${task.title}":`, error.message || error.details || error);
          toast.error(`Error on task "${task.title.slice(0, 25)}": ${error.message || 'Insert failed'}`);
        } else {
          totalInserted++;
        }
      }

      toast.success(`Successfully assigned ${totalInserted} daily tasks to ${matchingStudents.length} students!`);
      onOpenChange(false);
      if (onSuccess) onSuccess();
    } catch (e) {
      console.error('Error during bulk task assignment:', e);
      toast.error('An error occurred during bulk assignment.');
    } finally {
      setAssigning(false);
      setProgressText('');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto p-6">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-amber-50 text-amber-600 border border-amber-200">
              <Zap className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-xl font-bold">Bulk Assign Daily Tasks</DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Batch create and schedule tasks from Technical English / Soft Skills library or Excel for a Class & Designation
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {loadingData ? (
          <div className="flex justify-center items-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-6">
            {/* Step 1: Target Class, Designation & Subject */}
            <div className="bg-muted/40 p-4 rounded-xl border border-border/80 space-y-3">
              <h3 className="text-xs font-bold text-foreground uppercase tracking-wider flex items-center gap-1.5">
                <Users className="h-4 w-4 text-primary" />
                1. Target Audience & Subject
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Class */}
                <div>
                  <Label className="text-xs font-semibold">Class</Label>
                  <Select value={selectedClassId} onValueChange={setSelectedClassId}>
                    <SelectTrigger className="h-9 text-xs mt-1">
                      <SelectValue placeholder="Select Class" />
                    </SelectTrigger>
                    <SelectContent>
                      {classes.map(c => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Designation - Fixed/Defaulted to 3. Senior Fellow */}
                <div>
                  <Label className="text-xs font-semibold">Designation Target</Label>
                  <Select value={selectedDesignation} onValueChange={setSelectedDesignation}>
                    <SelectTrigger className="h-9 text-xs mt-1 font-semibold text-purple-950 dark:text-purple-100">
                      <SelectValue placeholder="Select Designation" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="3. Senior Fellow">3. Senior Fellow (Default)</SelectItem>
                      <SelectItem value="2. Junior Fellow">2. Junior Fellow</SelectItem>
                      <SelectItem value="1. CCC">1. CCC</SelectItem>
                      <SelectItem value="all">All Designations</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Subject */}
                <div>
                  <Label className="text-xs font-semibold">Subject</Label>
                  <Select value={selectedSubjectId} onValueChange={setSelectedSubjectId}>
                    <SelectTrigger className="h-9 text-xs mt-1">
                      <SelectValue placeholder="Select Subject" />
                    </SelectTrigger>
                    <SelectContent>
                      {subjects.map(s => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex items-center justify-between pt-1 text-xs">
                <span className="text-muted-foreground">Targeted Students Count:</span>
                <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30 font-bold px-2.5">
                  {matchingStudents.length} Students Selected
                </Badge>
              </div>
            </div>

            {/* Step 2: Task Source & Range */}
            <div className="bg-muted/40 p-4 rounded-xl border border-border/80 space-y-4">
              <h3 className="text-xs font-bold text-foreground uppercase tracking-wider flex items-center gap-1.5">
                <BookOpen className="h-4 w-4 text-primary" />
                2. Task Library / Source & Range Selection
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <Button 
                  type="button"
                  variant={sourceType === 'preloaded_te' ? 'default' : 'outline'}
                  className="h-auto py-2.5 px-3 flex flex-col items-start gap-1 text-left"
                  onClick={() => {
                    setSourceType('preloaded_te');
                    setStartTaskNum(1);
                    setEndTaskNum(Math.min(30, preloadedTasksData.technicalEnglish.length));
                  }}
                >
                  <span className="font-bold text-xs">Technical English Library</span>
                  <span className="text-[10px] opacity-80">250 Pre-loaded Daily Tasks</span>
                </Button>

                <Button 
                  type="button"
                  variant={sourceType === 'preloaded_ss' ? 'default' : 'outline'}
                  className="h-auto py-2.5 px-3 flex flex-col items-start gap-1 text-left"
                  onClick={() => {
                    setSourceType('preloaded_ss');
                    setStartTaskNum(1);
                    setEndTaskNum(Math.min(30, preloadedTasksData.softSkills.length));
                  }}
                >
                  <span className="font-bold text-xs">Soft Skills Library</span>
                  <span className="text-[10px] opacity-80">250 Pre-loaded Daily Tasks</span>
                </Button>

                <div className="relative">
                  <Input 
                    type="file" 
                    accept=".xlsx, .xls"
                    className="hidden"
                    id="excel-file-upload"
                    onChange={handleFileUpload}
                  />
                  <Label 
                    htmlFor="excel-file-upload"
                    className={`h-full min-h-[50px] py-2.5 px-3 rounded-lg border flex flex-col items-start gap-1 cursor-pointer transition-colors ${
                      sourceType === 'excel_upload' ? 'bg-primary text-primary-foreground border-primary' : 'bg-background hover:bg-accent border-input'
                    }`}
                  >
                    <span className="font-bold text-xs flex items-center gap-1">
                      <FileSpreadsheet className="h-3.5 w-3.5" />
                      Upload Custom Excel
                    </span>
                    <span className="text-[10px] opacity-80 truncate max-w-[200px]">
                      {uploadedFileName || 'Drop .xlsx file (Prep & Deadline dates supported)'}
                    </span>
                  </Label>
                </div>
              </div>

              {/* Task Index Range */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                <div>
                  <Label className="text-xs font-semibold">Start Task Number (#)</Label>
                  <Input 
                    type="number"
                    min={1}
                    max={maxAvailableTasks || 1}
                    value={startTaskNum}
                    onChange={(e) => setStartTaskNum(parseInt(e.target.value) || 1)}
                    className="h-9 text-xs mt-1"
                  />
                </div>

                <div>
                  <Label className="text-xs font-semibold">End Task Number (#)</Label>
                  <Input 
                    type="number"
                    min={startTaskNum}
                    max={maxAvailableTasks || 1}
                    value={endTaskNum}
                    onChange={(e) => setEndTaskNum(parseInt(e.target.value) || 1)}
                    className="h-9 text-xs mt-1"
                  />
                </div>

                <div className="flex flex-col justify-end">
                  <Badge variant="secondary" className="h-9 flex items-center justify-center font-bold text-xs bg-amber-50 text-amber-800 border-amber-200">
                    {selectedTasksSlice.length} Tasks Selected in Range
                  </Badge>
                </div>
              </div>
            </div>

            {/* Step 3: Schedule, Frequency & Reward */}
            <div className="bg-muted/40 p-4 rounded-xl border border-border/80 space-y-4">
              <h3 className="text-xs font-bold text-foreground uppercase tracking-wider flex items-center gap-1.5">
                <Calendar className="h-4 w-4 text-primary" />
                3. Pacing, Deadlines & Rewards
              </h3>

              {sourceType === 'excel_upload' ? (
                <div className="p-3 bg-emerald-50/80 border border-emerald-200 rounded-lg flex items-center justify-between text-xs text-emerald-800">
                  <div className="flex items-center gap-2 font-semibold">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                    <span>Dates loaded directly from Excel columns: <strong>"Assigned Date"</strong> & <strong>"Submission Date"</strong></span>
                  </div>
                  <Badge variant="outline" className="bg-emerald-100 text-emerald-900 border-emerald-300 font-bold">
                    Excel Auto-Dates Active
                  </Badge>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Start Date */}
                  <div>
                    <Label className="text-xs font-semibold">Start Release Date</Label>
                    <Input 
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="h-9 text-xs mt-1"
                    />
                  </div>

                  {/* Frequency */}
                  <div>
                    <Label className="text-xs font-semibold">Release Pacing</Label>
                    <Select value={frequency} onValueChange={(val: any) => setFrequency(val)}>
                      <SelectTrigger className="h-9 text-xs mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="daily">Every Day (1 task/day)</SelectItem>
                        <SelectItem value="weekdays">Weekdays Only (Mon-Fri)</SelectItem>
                        <SelectItem value="every_2_days">Every 2 Days</SelectItem>
                        <SelectItem value="same_day">All Same Release Date</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Deadline Duration */}
                  <div>
                    <Label className="text-xs font-semibold">Deadline Offset</Label>
                    <Select 
                      value={deadlineOffsetDays.toString()} 
                      onValueChange={(val) => setDeadlineOffsetDays(parseInt(val))}
                    >
                      <SelectTrigger className="h-9 text-xs mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="0">Same Day (11:59 PM)</SelectItem>
                        <SelectItem value="1">1 Day After (11:59 PM)</SelectItem>
                        <SelectItem value="2">2 Days After (11:59 PM)</SelectItem>
                        <SelectItem value="3">3 Days After (11:59 PM)</SelectItem>
                        <SelectItem value="7">7 Days After (11:59 PM)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                {/* Earning Reward */}
                <div>
                  <Label className="text-xs font-semibold">Reward per Task (₹)</Label>
                  <Input 
                    type="number"
                    min={0}
                    value={earningAmount}
                    onChange={(e) => setEarningAmount(parseFloat(e.target.value) || 0)}
                    className="h-9 text-xs mt-1"
                  />
                </div>
              </div>

              {/* Submission Requirements Checkboxes (PDF & Video Link enabled) */}
              <div>
                <Label className="text-xs font-semibold block mb-2">Required Submissions</Label>
                <div className="flex flex-wrap gap-4 text-xs">
                  <label className="flex items-center gap-2 cursor-pointer font-medium">
                    <Checkbox checked={reqText} onCheckedChange={(c) => setReqText(!!c)} />
                    <span>Text Summary / Answer</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer font-bold text-purple-700 dark:text-purple-300">
                    <Checkbox checked={reqVideo} onCheckedChange={(c) => setReqVideo(!!c)} />
                    <span>Video Recording Link</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer font-bold text-blue-700 dark:text-blue-300">
                    <Checkbox checked={reqDoc} onCheckedChange={(c) => setReqDoc(!!c)} />
                    <span>PDF / Document Upload</span>
                  </label>
                </div>
              </div>
            </div>

            {/* Step 4: Schedule Live Preview */}
            <div className="space-y-2">
              <h3 className="text-xs font-bold text-foreground uppercase tracking-wider flex items-center justify-between">
                <span>4. Schedule Preview (First 5 Tasks)</span>
                <span className="text-[11px] font-semibold text-muted-foreground">
                  Total Assignment Volume: {selectedTasksSlice.length * matchingStudents.length} Individual Student Tasks
                </span>
              </h3>

              <div className="border rounded-xl overflow-hidden max-h-48 overflow-y-auto">
                <Table>
                  <TableHeader className="bg-muted/80 sticky top-0">
                    <TableRow>
                      <TableHead className="text-xs">#</TableHead>
                      <TableHead className="text-xs">Task Title</TableHead>
                      <TableHead className="text-xs">Release Date</TableHead>
                      <TableHead className="text-xs">Deadline</TableHead>
                      <TableHead className="text-xs">Students</TableHead>
                      <TableHead className="text-xs">Reward</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedTasksSlice.slice(0, 5).map((task, idx) => {
                      const dates = computeDatesForIndex(idx, task);
                      return (
                        <TableRow key={idx} className="text-xs">
                          <TableCell className="font-semibold text-muted-foreground">{idx + 1}</TableCell>
                          <TableCell className="font-medium max-w-xs truncate">{task.title}</TableCell>
                          <TableCell className="font-semibold text-amber-700">{dates.releaseDateStr}</TableCell>
                          <TableCell className="font-semibold text-purple-700">{dates.deadlineDateStr}</TableCell>
                          <TableCell>{matchingStudents.length}</TableCell>
                          <TableCell className="font-bold text-emerald-600">₹{earningAmount}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>

            {/* Progress Text during execution */}
            {assigning && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-center gap-3 text-xs text-amber-800 font-semibold animate-pulse">
                <Loader2 className="h-4 w-4 animate-spin text-amber-600 shrink-0" />
                <span>{progressText || 'Creating and assigning tasks...'}</span>
              </div>
            )}
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0 pt-4 border-t">
          <DialogClose asChild>
            <Button variant="outline" size="sm" disabled={assigning}>Cancel</Button>
          </DialogClose>

          <Button 
            onClick={handleBulkAssign} 
            size="sm" 
            disabled={assigning || matchingStudents.length === 0 || selectedTasksSlice.length === 0}
            className="gap-2 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white font-bold"
          >
            {assigning ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Assigning Tasks...</span>
              </>
            ) : (
              <>
                <Zap className="h-4 w-4" />
                <span>Assign {selectedTasksSlice.length} Tasks to {matchingStudents.length} Students</span>
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
