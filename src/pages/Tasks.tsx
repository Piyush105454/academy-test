import { useState, useEffect } from 'react';
import { Search, Plus, ExternalLink, ClipboardList, ChevronRight, MoreHorizontal, Eye, Trash2, BookOpen, Calendar, ArrowUpDown } from 'lucide-react';
import { useNavigate, Link } from 'react-router-dom';
import { logActivity } from '@/utils/activityLogger';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { RichTextEditor } from '@/components/ui/rich-text-editor';
import { useAcademicYear } from '@/contexts/AcademicYearContext';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

interface TaskItem {
  id: string;
  title: string;
  description: string;
  class_id: string;
  session_id: string;
  student_id: string;
  status: string;
  submission_link: string;
  due_date: string;
  created_at: string;
  student_name?: string;
  session_title?: string;
  class_name?: string;
  subject_name?: string;
  academic_year?: string;
  volunteer_name?: string;
  facilitator_name?: string;
  incharge_name?: string;
  created_by_name?: string;
  task_id?: string;
}

interface TaskGroup {
  title: string;
  description: string;
  created_at: string;
  due_date: string;
  subject_name: string;
  class_name: string;
  session_title: string;
  volunteer_name: string;
  facilitator_name: string;
  incharge_name: string;
  academic_year: string;
  reward: number;
  latestCompletionDate: string | null;
  tasks: TaskItem[];
  completedCount: number;
  submittedCount: number;
  task_id: string;
}

interface ClassOption {
  id: string;
  name: string;
}

interface SessionOption {
  id: string;
  title: string;
}

interface StudentOption {
  id: string;
  name: string;
}

export default function Tasks() {
  const navigate = useNavigate();
  const { selectedYear, getDateRange } = useAcademicYear();
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [filteredTasks, setFilteredTasks] = useState<TaskItem[]>([]);
  const [taskGroups, setTaskGroups] = useState<TaskGroup[]>([]);
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterClass, setFilterClass] = useState('all');
  const [filterSession, setFilterSession] = useState('all');
  const [filterSubject, setFilterSubject] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterIncharge, setFilterIncharge] = useState('all');
  const [inchargeOptions, setInchargeOptions] = useState<string[]>([]);
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [filterMonth, setFilterMonth] = useState<string>(() => {
    const currentMonthIndex = new Date().getMonth(); // 0 to 11
    return String(currentMonthIndex + 1); // "1" to "12"
  });

  const monthsList = [
    { value: 'all', label: 'All Months' },
    { value: '1', label: 'January' },
    { value: '2', label: 'February' },
    { value: '3', label: 'March' },
    { value: '4', label: 'April' },
    { value: '5', label: 'May' },
    { value: '6', label: 'June' },
    { value: '7', label: 'July' },
    { value: '8', label: 'August' },
    { value: '9', label: 'September' },
    { value: '10', label: 'October' },
    { value: '11', label: 'November' },
    { value: '12', label: 'December' },
  ];
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [taskToDelete, setTaskToDelete] = useState<TaskGroup | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');

  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [sessions, setSessions] = useState<SessionOption[]>([]);
  const [subjects, setSubjects] = useState<{ id: string, name: string }[]>([]);
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [filterSessions, setFilterSessions] = useState<SessionOption[]>([]);

  const { user } = useAuth();
  const [userRole, setUserRole] = useState<number | null>(null);
  const [isFacilitator, setIsFacilitator] = useState<boolean>(false);
  const [currentFacilitatorName, setCurrentFacilitatorName] = useState<string | null>(null);

  useEffect(() => {
    async function checkUserIdentity() {
      if (!user?.id) return;

      try {
        const { data: profileData } = await supabase
          .from('user_profiles')
          .select('role_id, full_name, email')
          .eq('id', user.id)
          .maybeSingle();

        let roleId = profileData?.role_id ?? null;
        let userEmail = user.email || profileData?.email || '';
        let fullName = profileData?.full_name || '';

        if (!profileData && user.email) {
          const { data: emailProfile } = await supabase
            .from('user_profiles')
            .select('role_id, full_name')
            .ilike('email', user.email)
            .maybeSingle();

          if (emailProfile) {
            roleId = emailProfile.role_id ?? null;
            if (emailProfile.full_name) fullName = emailProfile.full_name;
          }
        }

        setUserRole(roleId);

        let facName = '';
        if (userEmail) {
          const { data: facData } = await supabase
            .from('facilitators')
            .select('name')
            .ilike('email', userEmail)
            .maybeSingle();
          if (facData?.name) {
            facName = facData.name;
          }
        }

        if (roleId === 4 || facName) {
          const resolvedName = facName || fullName;
          setIsFacilitator(true);
          setCurrentFacilitatorName(resolvedName);
          setFilterIncharge(resolvedName);
        } else {
          setIsFacilitator(false);
          setCurrentFacilitatorName(null);
        }
      } catch (err) {
        console.error('Error checking user identity in Tasks:', err);
      }
    }

    checkUserIdentity();
  }, [user?.id]);

  useEffect(() => {
    fetchClasses();
    fetchTasks();
    fetchSubjects();
  }, [selectedYear]);

  useEffect(() => {
    let filtered = tasks;
    if (filterClass !== 'all') {
      const cls = classes.find((c) => c.id === filterClass);
      if (cls) {
        filtered = filtered.filter((t) => t.class_name === cls.name);
      }
    }
    if (filterSession !== 'all') {
      filtered = filtered.filter((t) => t.session_id === filterSession);
    }
    if (filterSubject !== 'all') {
      filtered = filtered.filter((t) => t.subject_name === filterSubject);
    }

    // Role-based Incharge filtering: Facilitators see only their own tasks
    if (isFacilitator && currentFacilitatorName) {
      const facLower = currentFacilitatorName.toLowerCase().trim();
      filtered = filtered.filter((t) => 
        (t.facilitator_name && t.facilitator_name.toLowerCase().trim() === facLower) || 
        (t.created_by_name && t.created_by_name.toLowerCase().trim() === facLower) ||
        (t.incharge_name && t.incharge_name.toLowerCase().trim() === facLower)
      );
    } else if (filterIncharge !== 'all') {
      filtered = filtered.filter((t) => 
        t.facilitator_name === filterIncharge || 
        t.created_by_name === filterIncharge ||
        t.incharge_name === filterIncharge
      );
    }
    
    // Month filter
    if (filterMonth !== 'all') {
      filtered = filtered.filter((t) => {
        const rawDate = t.due_date && t.due_date.trim() !== '' ? t.due_date : t.created_at;
        if (!rawDate || rawDate.trim() === '') return false;
        const dateToUse = new Date(rawDate);
        if (isNaN(dateToUse.getTime())) return false;
        const monthOfDate = dateToUse.getMonth() + 1; // 1 to 12
        return String(monthOfDate) === filterMonth;
      });
    }

    // Status filtering is applied after grouping to maintain correct denominator counts
    if (filterDateFrom || filterDateTo) {
      filtered = filtered.filter((t) => {
        if (!t.due_date) return false;
        const taskDate = new Date(t.due_date);
        if (filterDateFrom && taskDate < new Date(filterDateFrom)) return false;
        if (filterDateTo && taskDate > new Date(filterDateTo)) return false;
        return true;
      });
    }
    setFilteredTasks(filtered);

    // Pre-calculate canonical metadata for every task title across all tasks in the academic year
    const metadataMap = new Map<string, {
      task_id: string;
      created_at: string;
      due_date: string;
      subject_name: string;
      class_name: string;
      session_title: string;
      volunteer_name: string;
      facilitator_name: string;
      incharge_name: string;
      academic_year: string;
      reward: number;
    }>();

    tasks.forEach((t) => {
      const key = t.title;
      if (!key) return;
      
      const existing = metadataMap.get(key);
      if (!existing) {
        metadataMap.set(key, {
          task_id: t.task_id && t.task_id !== '-' ? t.task_id : '-',
          created_at: t.created_at,
          due_date: t.due_date,
          subject_name: t.subject_name && t.subject_name !== '-' ? t.subject_name : '-',
          class_name: t.class_name && t.class_name !== '-' ? t.class_name : '-',
          session_title: t.session_title && t.session_title !== '-' ? t.session_title : '-',
          volunteer_name: t.volunteer_name && t.volunteer_name !== '-' ? t.volunteer_name : '-',
          facilitator_name: t.facilitator_name && t.facilitator_name !== '-' ? t.facilitator_name : '-',
          incharge_name: t.incharge_name || '-',
          academic_year: t.academic_year || '-',
          reward: (t as any).earning_amount || 0,
        });
      } else {
        if (existing.task_id === '-' && t.task_id && t.task_id !== '-') {
          existing.task_id = t.task_id;
        }
        if (t.created_at && (!existing.created_at || new Date(t.created_at) < new Date(existing.created_at))) {
          existing.created_at = t.created_at;
        }
        if (t.due_date && (!existing.due_date || new Date(t.due_date) < new Date(existing.due_date))) {
          existing.due_date = t.due_date;
        }
        if (existing.subject_name === '-' && t.subject_name && t.subject_name !== '-') {
          existing.subject_name = t.subject_name;
        }
        if (existing.class_name === '-' && t.class_name && t.class_name !== '-') {
          existing.class_name = t.class_name;
        }
        if (existing.session_title === '-' && t.session_title && t.session_title !== '-') {
          existing.session_title = t.session_title;
        }
        if (existing.volunteer_name === '-' && t.volunteer_name && t.volunteer_name !== '-') {
          existing.volunteer_name = t.volunteer_name;
        }
        if (existing.facilitator_name === '-' && t.facilitator_name && t.facilitator_name !== '-') {
          existing.facilitator_name = t.facilitator_name;
        }
        if (existing.reward === 0 && (t as any).earning_amount) {
          existing.reward = (t as any).earning_amount;
        }
      }
    });

    // Group filtered tasks by title
    const grouped = new Map<string, TaskGroup>();
    filtered.forEach((task) => {
      const key = task.title;
      const meta = metadataMap.get(key);

      if (!grouped.has(key)) {
        grouped.set(key, {
          title: task.title,
          task_id: (meta?.task_id && meta.task_id !== '-') ? meta.task_id : (task.task_id || '-'),
          description: task.description,
          created_at: meta?.created_at || task.created_at,
          due_date: meta?.due_date || task.due_date,
          subject_name: (meta?.subject_name && meta.subject_name !== '-') ? meta.subject_name : (task.subject_name || '-'),
          class_name: (meta?.class_name && meta.class_name !== '-') ? meta.class_name : (task.class_name || '-'),
          session_title: (meta?.session_title && meta.session_title !== '-') ? meta.session_title : (task.session_title || '-'),
          volunteer_name: (meta?.volunteer_name && meta.volunteer_name !== '-') ? meta.volunteer_name : (task.volunteer_name || '-'),
          facilitator_name: (meta?.facilitator_name && meta.facilitator_name !== '-') ? meta.facilitator_name : (task.facilitator_name || '-'),
          incharge_name: meta?.incharge_name || task.incharge_name || '-',
          academic_year: meta?.academic_year || task.academic_year || '-',
          reward: meta?.reward || (task as any).earning_amount || 0,
          latestCompletionDate: null,
          tasks: [],
          completedCount: 0,
          submittedCount: 0,
        });
      }
      const group = grouped.get(key)!;
      group.tasks.push(task);
      
      // Update group metadata if the current task has better info
      if (group.task_id === '-' && task.task_id && task.task_id !== '-') {
        group.task_id = task.task_id;
      }
      if (group.subject_name === '-' && task.subject_name && task.subject_name !== '-') {
        group.subject_name = task.subject_name;
      }
      if (group.class_name === '-' && task.class_name && task.class_name !== '-') {
        group.class_name = task.class_name;
      }
      if (group.session_title === '-' && task.session_title && task.session_title !== '-') {
        group.session_title = task.session_title;
      }
      if (group.volunteer_name === '-' && task.volunteer_name && task.volunteer_name !== '-') {
        group.volunteer_name = task.volunteer_name;
      }
      if (group.facilitator_name === '-' && task.facilitator_name && task.facilitator_name !== '-') {
        group.facilitator_name = task.facilitator_name;
      }
      if (group.academic_year === '-' && task.academic_year) {
        group.academic_year = task.academic_year;
      }
      if (group.reward === 0 && (task as any).earning_amount) {
        group.reward = (task as any).earning_amount;
      }

      if (task.status === 'completed') {
        group.completedCount++;
        const completionDate = (task as any).updated_at || task.created_at;
        if (!group.latestCompletionDate || completionDate > group.latestCompletionDate) {
          group.latestCompletionDate = completionDate;
        }
      }
      
      if (task.status === 'submitted' || task.status === 'completed') {
        group.submittedCount++;
      }
    });
    let finalGroups = Array.from(grouped.values());
    if (filterStatus === 'to_verify') {
      finalGroups = finalGroups.filter((g) => g.completedCount !== g.submittedCount);
    } else if (filterStatus === 'verified') {
      finalGroups = finalGroups.filter((g) => g.completedCount === g.submittedCount);
    }

    // Also apply search at the group level (so task_id, title, class, etc. on the group are searched)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      finalGroups = finalGroups.filter((g) =>
        g.task_id?.toLowerCase().includes(q) ||
        g.title?.toLowerCase().includes(q) ||
        g.description?.toLowerCase().includes(q) ||
        g.class_name?.toLowerCase().includes(q) ||
        g.subject_name?.toLowerCase().includes(q) ||
        g.session_title?.toLowerCase().includes(q) ||
        g.incharge_name?.toLowerCase().includes(q) ||
        g.facilitator_name?.toLowerCase().includes(q) ||
        g.volunteer_name?.toLowerCase().includes(q) ||
        // also search within individual student names in the group
        g.tasks.some((t) => t.student_name?.toLowerCase().includes(q))
      );
    }

    setTaskGroups(finalGroups);
  }, [tasks, filterClass, filterSession, filterSubject, filterStatus, filterIncharge, filterDateFrom, filterDateTo, filterMonth, searchQuery, classes, isFacilitator, currentFacilitatorName]);

  const fetchClasses = async () => {
    try {
      const { data, error } = await (supabase as any)
        .from('classes')
        .select('id, name')
        .order('name');
      if (error) throw error;
      setClasses(data || []);
    } catch (e) {
      console.error('Error fetching classes:', e);
    }
  };

  const fetchSubjects = async () => {
    try {
      const { data, error } = await (supabase as any)
        .from('subjects')
        .select('id, name')
        .order('name');
      if (!error && data) setSubjects(data);
    } catch (e) {
      // subjects table may not exist — ignore silently
    }
  };

  const fetchSessionsByClass = async (classId: string) => {
    try {
      const cls = classes.find((c) => c.id === classId);
      if (!cls) return;
      const { data, error } = await (supabase as any)
        .from('sessions')
        .select('id, title')
        .eq('class_batch', cls.name)
        .order('session_date', { ascending: false });
      if (error) throw error;
      setSessions(data || []);
    } catch (e) {
      console.error('Error fetching sessions:', e);
    }
  };

  const fetchStudentsByClass = async (classId: string) => {
    try {
      const { data, error } = await (supabase as any)
        .from('students')
        .select('id, name')
        .eq('class_id', classId)
        .order('name');
      if (error) throw error;
      setStudents(data || []);
    } catch (e) {
      console.error('Error fetching students:', e);
    }
  };

  const fetchTasks = async () => {
    try {
      setLoading(true);
      const { startDate, endDate } = getDateRange();
      
      // Fetch user profiles first to map created_by to name
      const { data: profilesData } = await supabase
        .from('user_profiles')
        .select('id, full_name');
      const profilesMap = new Map((profilesData || []).map(p => [p.id, p.full_name]));

      // Fetch all tasks using pagination (Supabase caps individual queries at 1000 rows max)
      let allData: any[] = [];
      let page = 0;
      const pageSize = 1000;
      let hasMore = true;

      while (hasMore) {
        const from = page * pageSize;
        const to = from + pageSize - 1;

        const { data: pageData, error: pageError } = await supabase
          .from('student_task_feedback')
          .select(`
            id,
            task_name,
            task_id,
            task_description,
            deadline,
            submission_link,
            status,
            student_id,
            session_id,
            created_at,
            updated_at,
            academic_year,
            earning_amount,
            created_by,
            students:student_id(
              name,
              classes(name)
            ),
            sessions:session_id(
              title, 
              class_batch,
              volunteer_name,
              facilitator_name,
              subjects:subject_id(name)
            )
          `)
          .order('created_at', { ascending: false })
          .range(from, to);

        if (pageError) throw pageError;

        if (pageData && pageData.length > 0) {
          allData = allData.concat(pageData);
          if (pageData.length < pageSize) {
            hasMore = false;
          } else {
            page++;
          }
        } else {
          hasMore = false;
        }
      }

      // Client-side filter: keep tasks that belong to the selected academic year
      // A task belongs to the year if:
      //   1. Its academic_year field exactly matches selectedYear, OR
      //   2. Its academic_year is null/empty AND its created_at falls within the academic year date range
      const data = (allData || []).filter((task: any) => {
        const ay = task.academic_year;
        if (ay && ay.trim() !== '') {
          return ay === selectedYear;
        }
        // null or empty academic_year — use created_at date range
        if (!task.created_at) return false;
        const created = new Date(task.created_at);
        return created >= startDate && created <= endDate;
      });

      if (!data) throw new Error('No data returned');

      const enriched: TaskItem[] = (data || []).map((task: any) => {
        const creatorName = profilesMap.get(task.created_by) || '';
        const volName = task.sessions?.volunteer_name && task.sessions.volunteer_name !== '-' ? task.sessions.volunteer_name : '';
        const facName = task.sessions?.facilitator_name && task.sessions.facilitator_name !== '-' ? task.sessions.facilitator_name : '';
        const inchargeName = facName || volName || creatorName || '-';

        return {
          id: task.id,
          title: task.task_name || '',
          task_id: task.task_id || '',
          description: task.task_description || '',
          class_id: '',
          session_id: task.session_id || '',
          student_id: task.student_id || '',
          status: task.status || 'pending',
          submission_link: task.submission_link || '',
          due_date: task.deadline || '',
          created_at: task.created_at || '',
          updated_at: task.updated_at || '',
          academic_year: task.academic_year || '',
          earning_amount: task.earning_amount || 0,
          student_name: task.students?.name || '-',
          session_title: task.sessions?.title || '-',
          volunteer_name: task.sessions?.volunteer_name || '-',
          facilitator_name: task.sessions?.facilitator_name || '-',
          incharge_name: inchargeName,
          created_by_name: creatorName || '-',
          class_name: task.sessions?.class_batch || 
                     (task.students?.classes && !Array.isArray(task.students.classes) ? task.students.classes.name : 
                      Array.isArray(task.students?.classes) && task.students.classes.length > 0 ? task.students.classes[0].name : '-'),
          subject_name: (task.sessions?.subjects && !Array.isArray(task.sessions.subjects) ? task.sessions.subjects.name : 
                         Array.isArray(task.sessions?.subjects) && task.sessions.subjects.length > 0 ? task.sessions.subjects[0].name : '-'),
        };
      });

      // Heal missing task_ids for tasks that have no valid task_id set anywhere
      const taskTitleGroups = new Map<string, TaskItem[]>();
      enriched.forEach(t => {
        if (!t.title) return;
        if (!taskTitleGroups.has(t.title)) taskTitleGroups.set(t.title, []);
        taskTitleGroups.get(t.title)!.push(t);
      });

      for (const [title, items] of taskTitleGroups.entries()) {
        const firstValidId = items.find(i => i.task_id && i.task_id !== '-')?.task_id;
        if (firstValidId) {
          // Fill in any individual item in the group that was missing task_id
          items.forEach(i => {
            if (!i.task_id || i.task_id === '-') {
              i.task_id = firstValidId;
            }
          });
        } else if (items.length > 0) {
          // Generate a new sequential task_id for this task group
          try {
            const firstItem = items[0];
            const dateToUse = firstItem.created_at ? new Date(firstItem.created_at) : new Date();
            const yearStr = dateToUse.getFullYear();
            const monthStr = String(dateToUse.getMonth() + 1).padStart(2, '0');
            const classNameClean = (firstItem.class_name && firstItem.class_name !== '-' ? firstItem.class_name : 'Task').replace(/[\s\/]+/g, '');
            const prefix = `${yearStr}-${monthStr}-${classNameClean}-`;

            const { data: existingSeq } = await supabase
              .from('student_task_feedback')
              .select('task_id')
              .like('task_id', `${prefix}%`)
              .order('task_id', { ascending: false })
              .limit(1);

            let nextSeq = 1;
            if (existingSeq && existingSeq.length > 0 && existingSeq[0].task_id) {
              const lastSeqStr = existingSeq[0].task_id.split('-').pop();
              if (lastSeqStr) {
                const parsed = parseInt(lastSeqStr, 10);
                if (!isNaN(parsed)) nextSeq = parsed + 1;
              }
            }
            const generatedTaskId = `${prefix}${String(nextSeq).padStart(3, '0')}`;

            const idsToUpdate = items.map(i => i.id);
            await supabase
              .from('student_task_feedback')
              .update({ task_id: generatedTaskId })
              .in('id', idsToUpdate);

            items.forEach(i => {
              i.task_id = generatedTaskId;
            });
          } catch (healErr) {
            console.error('Error auto-generating task_id:', healErr);
          }
        }
      }

      setTasks(enriched);
    } catch (e) {
      console.error('Error fetching tasks:', e);
      toast.error('Failed to load tasks');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const names = new Set<string>();
    tasks.forEach(t => {
      if (t.facilitator_name && t.facilitator_name !== '-') names.add(t.facilitator_name);
      if (t.created_by_name && t.created_by_name !== '-') names.add(t.created_by_name);
    });
    setInchargeOptions(Array.from(names).sort());
  }, [tasks]);


  useEffect(() => {
    if (filterClass !== 'all') {
      const cls = classes.find((c) => c.id === filterClass);
      if (cls) {
        (supabase as any)
          .from('sessions')
          .select('id, title')
          .eq('class_batch', cls.name)
          .order('session_date', { ascending: false })
          .then(({ data }: any) => setFilterSessions(data || []));
      }
    } else {
      setFilterSessions([]);
      setFilterSession('all');
    }
  }, [filterClass, classes]);

  const handleDeleteTask = async () => {
    if (!taskToDelete) return;
    try {
      // First, get all task IDs in this group to delete their associated earnings
      const taskIds = taskToDelete.tasks.map(t => t.id);
      
      if (taskIds.length > 0) {
        const { error: earningError } = await supabase
          .from('student_earnings')
          .delete()
          .in('task_id', taskIds);
          
        if (earningError) {
          console.error("Error deleting associated earnings:", earningError);
        }
      }

      const { error } = await supabase
        .from('student_task_feedback')
        .delete()
        .eq('task_name', taskToDelete.title);
      if (error) throw error;
      
      await logActivity('DELETE', 'Tasks', `Deleted task: "${taskToDelete.title}"`);
      
      toast.success('Task deleted successfully');
      setDeleteDialogOpen(false);
      setTaskToDelete(null);
      setDeleteConfirmText('');
      fetchTasks();
    } catch (e) {
      console.error(e);
      toast.error('Failed to delete task');
    }
  };

  const handleSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const sortedGroups = [...taskGroups].sort((a, b) => {
    if (!sortConfig) return 0;
    const { key, direction } = sortConfig;
    let aVal: any = a[key as keyof typeof a];
    let bVal: any = b[key as keyof typeof b];

    if (key === 'completion') {
      aVal = a.tasks.length ? a.completedCount / a.tasks.length : 0;
      bVal = b.tasks.length ? b.completedCount / b.tasks.length : 0;
    } else if (key === 'submitted') {
      aVal = a.tasks.length ? a.submittedCount / a.tasks.length : 0;
      bVal = b.tasks.length ? b.submittedCount / b.tasks.length : 0;
    } else if (key === 'approved') {
      aVal = a.tasks.length ? a.completedCount / a.tasks.length : 0;
      bVal = b.tasks.length ? b.completedCount / b.tasks.length : 0;
    } else if (key === 'created_at' || key === 'due_date') {
      aVal = aVal ? new Date(aVal).getTime() : 0;
      bVal = bVal ? new Date(bVal).getTime() : 0;
    } else if (key === 'task_id') {
      aVal = aVal || '';
      bVal = bVal || '';
    }

    if (aVal < bVal) return direction === 'asc' ? -1 : 1;
    if (aVal > bVal) return direction === 'asc' ? 1 : -1;
    return 0;
  });

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl md:text-3xl font-bold text-foreground">📋 Tasks & Projects</h1>
            <p className="text-sm md:text-base text-muted-foreground mt-1">
              Manage student tasks and track submissions
            </p>
          </div>
          <Button onClick={() => navigate('/tasks/add')} className="gap-2 w-full sm:w-auto">
            <Plus className="h-4 w-4" />
            Create Task
          </Button>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-end flex-wrap">
          <div className="w-full sm:w-64">
            <label className="text-sm font-medium text-foreground mb-2 block">Search</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search tasks..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>

          <div className="w-full sm:w-40">
            <label className="text-sm font-medium text-foreground mb-2 block">Status</label>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger>
                <SelectValue placeholder="All" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="to_verify">To Verify</SelectItem>
                <SelectItem value="verified">Verified</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="w-full sm:w-48">
            <label className="text-sm font-medium text-foreground mb-2 block">Filter by Incharge</label>
            <Select 
              value={isFacilitator && currentFacilitatorName ? currentFacilitatorName : filterIncharge} 
              onValueChange={setFilterIncharge}
              disabled={isFacilitator}
            >
              <SelectTrigger>
                <SelectValue placeholder="All Incharges" />
              </SelectTrigger>
              <SelectContent>
                {!isFacilitator && <SelectItem value="all">All Incharges</SelectItem>}
                {isFacilitator && currentFacilitatorName && !inchargeOptions.includes(currentFacilitatorName) && (
                  <SelectItem value={currentFacilitatorName}>{currentFacilitatorName}</SelectItem>
                )}
                {inchargeOptions.map((name) => (
                  <SelectItem key={name} value={name}>{name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="w-full sm:w-48">
            <label className="text-sm font-medium text-foreground mb-2 block">Filter by Class</label>
            <Select value={filterClass} onValueChange={setFilterClass}>
              <SelectTrigger>
                <SelectValue placeholder="All Classes" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Classes</SelectItem>
                {classes.map((cls) => (
                  <SelectItem key={cls.id} value={cls.id}>{cls.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="w-full sm:w-48">
            <label className="text-sm font-medium text-foreground mb-2 block">Filter by Session</label>
            <Select value={filterSession} onValueChange={setFilterSession}>
              <SelectTrigger>
                <SelectValue placeholder="All Sessions" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sessions</SelectItem>
                {filterSessions.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="w-full sm:w-48">
            <label className="text-sm font-medium text-foreground mb-2 block">Subject</label>
            <Select value={filterSubject} onValueChange={setFilterSubject}>
              <SelectTrigger>
                <SelectValue placeholder="All Subjects" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Subjects</SelectItem>
                {subjects.map((s) => (
                  <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="w-full sm:w-72">
            <label className="text-sm font-medium text-foreground mb-2 block">Filter by Date</label>
            <div className="flex gap-2">
              <Input
                type="date"
                value={filterDateFrom}
                onChange={(e) => setFilterDateFrom(e.target.value)}
                placeholder="From"
                title="From date"
                className="h-10 text-xs"
              />
              <Input
                type="date"
                value={filterDateTo}
                onChange={(e) => setFilterDateTo(e.target.value)}
                placeholder="To"
                title="To date"
                className="h-10 text-xs"
              />
            </div>
          </div>

          <div className="w-full sm:w-40">
            <label className="text-sm font-medium text-foreground mb-2 block">Filter by Month</label>
            <Select value={filterMonth} onValueChange={setFilterMonth}>
              <SelectTrigger>
                <SelectValue placeholder="All Months" />
              </SelectTrigger>
              <SelectContent>
                {monthsList.map(month => (
                  <SelectItem key={month.value} value={month.value}>
                    {month.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {(filterClass !== 'all' || filterSession !== 'all' || filterStatus !== 'all' || filterIncharge !== 'all' || searchQuery.trim() || filterDateFrom || filterDateTo || filterMonth !== 'all') && (
            <div className="text-sm text-muted-foreground">
              Showing {filteredTasks.length} task{filteredTasks.length !== 1 ? 's' : ''}
            </div>
          )}
        </div>

        {/* Task List */}
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5 text-primary" />
              All Tasks ({taskGroups.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            ) : taskGroups.length === 0 ? (
              <div className="text-center py-12">
                <ClipboardList className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-medium text-foreground mb-2">No tasks found</h3>
                <p className="text-muted-foreground mb-4">Create a task to get started</p>
                <Button onClick={() => navigate('/tasks/add')}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Task
                </Button>
              </div>
            ) : (
              <div className="overflow-hidden rounded-md border border-border bg-card">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead><div className="flex items-center gap-1 cursor-pointer hover:text-primary" onClick={() => handleSort('task_id')}>Task ID <ArrowUpDown className="h-3 w-3" /></div></TableHead>
                      <TableHead className="w-[18%]"><div className="flex items-center gap-1 cursor-pointer hover:text-primary" onClick={() => handleSort('title')}>Task Name <ArrowUpDown className="h-3 w-3" /></div></TableHead>
                      <TableHead><div className="flex items-center gap-1 cursor-pointer hover:text-primary" onClick={() => handleSort('created_at')}>Created <ArrowUpDown className="h-3 w-3" /></div></TableHead>
                      <TableHead><div className="flex items-center gap-1 cursor-pointer hover:text-primary" onClick={() => handleSort('subject_name')}>Subject <ArrowUpDown className="h-3 w-3" /></div></TableHead>
                      <TableHead><div className="flex items-center gap-1 cursor-pointer hover:text-primary" onClick={() => handleSort('class_name')}>Class <ArrowUpDown className="h-3 w-3" /></div></TableHead>
                      <TableHead><div className="flex items-center gap-1 cursor-pointer hover:text-primary" onClick={() => handleSort('session_title')}>Session <ArrowUpDown className="h-3 w-3" /></div></TableHead>
                      <TableHead><div className="flex items-center gap-1 cursor-pointer hover:text-primary" onClick={() => handleSort('volunteer_name')}>Volunteer <ArrowUpDown className="h-3 w-3" /></div></TableHead>
                      <TableHead><div className="flex items-center gap-1 cursor-pointer hover:text-primary" onClick={() => handleSort('facilitator_name')}>Facilitator <ArrowUpDown className="h-3 w-3" /></div></TableHead>
                      <TableHead><div className="flex items-center gap-1 cursor-pointer hover:text-primary" onClick={() => handleSort('academic_year')}>Year <ArrowUpDown className="h-3 w-3" /></div></TableHead>
                      <TableHead><div className="flex items-center gap-1 cursor-pointer hover:text-primary" onClick={() => handleSort('reward')}>Reward <ArrowUpDown className="h-3 w-3" /></div></TableHead>
                      <TableHead><div className="flex items-center gap-1 cursor-pointer hover:text-primary" onClick={() => handleSort('due_date')}>Deadline <ArrowUpDown className="h-3 w-3" /></div></TableHead>
                      <TableHead><div className="flex items-center gap-1 cursor-pointer hover:text-primary" onClick={() => handleSort('approved')}>Status <ArrowUpDown className="h-3 w-3" /></div></TableHead>
                      <TableHead className="text-center"><div className="flex justify-center items-center gap-1 cursor-pointer hover:text-primary" onClick={() => handleSort('submitted')}>Submitted <ArrowUpDown className="h-3 w-3" /></div></TableHead>
                      <TableHead className="text-center"><div className="flex justify-center items-center gap-1 cursor-pointer hover:text-primary" onClick={() => handleSort('approved')}>Approved <ArrowUpDown className="h-3 w-3" /></div></TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedGroups.map((group) => (
                      <TableRow key={group.title} className="hover:bg-muted/50 transition-colors">
                        <TableCell className="font-mono text-xs text-muted-foreground whitespace-nowrap">
                          {group.task_id}
                        </TableCell>
                        <TableCell className="font-medium">
                          <Link 
                            to={`/tasks/${encodeURIComponent(group.title)}`}
                            className="text-primary hover:text-primary/80 hover:underline transition-colors cursor-pointer"
                          >
                            {group.title}
                          </Link>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {new Date(group.created_at || new Date()).toLocaleDateString()}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="font-normal whitespace-nowrap">
                            {group.subject_name}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs whitespace-nowrap">{group.class_name}</TableCell>
                        <TableCell>
                          {group.session_title !== '-' ? (
                            <div className="flex items-center gap-1 text-[10px] text-muted-foreground bg-muted/30 px-2 py-1 rounded-md w-fit">
                              <Calendar className="h-3 w-3" />
                              <span className="truncate max-w-[80px]" title={group.session_title}>
                                {group.session_title}
                              </span>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs whitespace-nowrap">{group.volunteer_name}</TableCell>
                        <TableCell className="text-xs whitespace-nowrap">{group.facilitator_name}</TableCell>
                        <TableCell className="text-[10px] whitespace-nowrap">{group.academic_year}</TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="bg-purple-50 text-purple-700 border-purple-100 text-[10px]">
                            {group.reward} pts
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs whitespace-nowrap">
                          {group.due_date ? new Date(group.due_date).toLocaleDateString() : '-'}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            <div className="flex justify-between text-[10px] text-muted-foreground">
                              <span>Progress</span>
                              <span>{group.completedCount}/{group.tasks.length}</span>
                            </div>
                            <div className="w-24 h-1 bg-muted rounded-full overflow-hidden">
                              <div 
                                className="h-full bg-primary" 
                                style={{ width: `${(group.completedCount / group.tasks.length) * 100}%` }}
                              />
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm font-medium text-center">
                          <span className={group.submittedCount === group.tasks.length ? "text-blue-600 font-semibold" : "text-foreground"}>
                            {group.submittedCount}/{group.tasks.length}
                          </span>
                        </TableCell>
                        <TableCell className="text-sm font-medium text-center">
                          <span className={group.completedCount === group.submittedCount && group.submittedCount > 0 ? "text-green-600 font-semibold" : "text-foreground"}>
                            {group.completedCount}/{group.submittedCount}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" className="h-8 w-8 p-0">
                                <span className="sr-only">Open menu</span>
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-[160px]">
                              <DropdownMenuLabel>Actions</DropdownMenuLabel>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => navigate(`/tasks/${encodeURIComponent(group.title)}`)}>
                                <Eye className="mr-2 h-4 w-4" />
                                View Details
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => navigate(`/tasks/${encodeURIComponent(group.title)}/edit`)}>
                                <ExternalLink className="mr-2 h-4 w-4" />
                                Edit Task
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onClick={() => {
                                  setTaskToDelete(group);
                                  setDeleteConfirmText('');
                                  setDeleteDialogOpen(true);
                                }}
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={(open) => {
        setDeleteDialogOpen(open);
        if (!open) { setTaskToDelete(null); setDeleteConfirmText(''); }
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Task</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  This will permanently delete <strong>"{taskToDelete?.title}"</strong> for all{' '}
                  <strong>{taskToDelete?.tasks.length}</strong> student(s). This action cannot be undone.
                </p>
                <div className="space-y-1">
                  <p className="text-sm font-medium text-foreground">
                    Type <span className="font-mono font-bold text-destructive">DELETE</span> to confirm:
                  </p>
                  <Input
                    id="delete-confirm-input"
                    value={deleteConfirmText}
                    onChange={(e) => setDeleteConfirmText(e.target.value)}
                    placeholder="Type DELETE here"
                    className="border-destructive/50 focus-visible:ring-destructive"
                  />
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteTask}
              disabled={deleteConfirmText !== 'DELETE'}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
