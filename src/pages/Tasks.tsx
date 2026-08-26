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
import { getCleanTaskId, getScheduledTasks } from '@/utils/scheduledTasksStore';

const formatDateDisplay = (dateStr?: string) => {
  if (!dateStr || dateStr === '-') return '-';
  const trimmed = dateStr.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const [yyyy, mm, dd] = trimmed.split('-');
    return `${dd}/${mm}/${yyyy}`;
  }
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  } catch (e) {
    return dateStr;
  }
};

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
  const [classStudentCounts, setClassStudentCounts] = useState<Record<string, number>>({});

  const { user } = useAuth();
  const [userRole, setUserRole] = useState<number | null>(null);
  const [isFacilitator, setIsFacilitator] = useState<boolean>(false);
  const [currentFacilitatorName, setCurrentFacilitatorName] = useState<string | null>(null);
  const [coordinatorAssignedClasses, setCoordinatorAssignedClasses] = useState<string[]>([]);

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

        let isCoord = false;
        let coordId = '';
        if (userEmail) {
          const { data: coordData } = await supabase
            .from('coordinators')
            .select('id, name')
            .ilike('email', userEmail)
            .maybeSingle();

          if (coordData) {
            isCoord = true;
            coordId = coordData.id;
            roleId = 3; // Enforce Coordinator Role
          }
        }

        setUserRole(roleId);

        let facName = '';
        if (userEmail && !isCoord && roleId !== 1) {
          const { data: facData } = await supabase
            .from('facilitators')
            .select('name')
            .ilike('email', userEmail)
            .maybeSingle();
          if (facData?.name) {
            facName = facData.name;
          }
        }

        // Only set isFacilitator if user is strictly a Facilitator and NOT Coordinator or Admin
        if (roleId === 4 && !isCoord && roleId !== 1) {
          const resolvedName = facName || fullName;
          setIsFacilitator(true);
          setCurrentFacilitatorName(resolvedName);
          setFilterIncharge(resolvedName);
        } else {
          setIsFacilitator(false);
          setCurrentFacilitatorName(null);
          setFilterIncharge('all');
        }

        // Load Coordinator assigned classes if user is a coordinator
        if (isCoord || roleId === 3 || userEmail) {
          try {
            const stored = localStorage.getItem('coordinator_assigned_classes');
            if (stored) {
              const parsed = JSON.parse(stored);
              const classes = (coordId ? parsed[coordId] : null) || parsed[user.id] || (userEmail ? parsed[userEmail.toLowerCase().trim()] : []) || [];
              if (classes.length > 0) {
                setCoordinatorAssignedClasses(classes);
              }
            }
          } catch (e) {}
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
  }, [selectedYear, filterMonth]);

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

    // Role-based Class filtering: Coordinators see tasks for their assigned classes if specified
    if (coordinatorAssignedClasses.length > 0 && userRole !== 1) {
      const allowedClasses = new Set(coordinatorAssignedClasses.map(c => c.toLowerCase().trim()));
      filtered = filtered.filter((t) => 
        t.class_name && allowedClasses.has(t.class_name.toLowerCase().trim())
      );
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
  }, [tasks, filterClass, filterSession, filterSubject, filterStatus, filterIncharge, filterDateFrom, filterDateTo, filterMonth, searchQuery, classes, isFacilitator, currentFacilitatorName, coordinatorAssignedClasses, userRole]);

  const fetchClasses = async () => {
    try {
      const { data, error } = await (supabase as any)
        .from('classes')
        .select('id, name')
        .neq('name', '__SYSTEM_DEV_MODE__')
        .neq('id', '00000000-0000-0000-0000-000000000000')
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
      const isoStart = startDate.toISOString();

      const selectFields = `
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
        `;

      const buildQuery = () => {
        let q = supabase.from('student_task_feedback').select(selectFields);
        if (filterMonth !== 'all') {
          const m = Number(filterMonth);
          const yearNum = m >= 4 ? 2026 : 2027;
          const monthStart = new Date(Date.UTC(yearNum, m - 1, 1, 0, 0, 0)).toISOString();
          const monthEnd = new Date(Date.UTC(yearNum, m, 0, 23, 59, 59, 999)).toISOString();
          q = q.gte('created_at', monthStart).lte('created_at', monthEnd);
        } else {
          q = q.or(`academic_year.eq.${selectedYear},created_at.gte.${isoStart}`);
        }
        return q.order('created_at', { ascending: false });
      };

      // Paginated fetch — Supabase caps at 1000 rows per request by default
      let allData: any[] = [];
      let pageFrom = 0;
      const pageSize = 1000;
      while (true) {
        const { data: pageData, error: taskError } = await buildQuery()
          .range(pageFrom, pageFrom + pageSize - 1);

        if (taskError) throw taskError;
        if (!pageData || pageData.length === 0) break;
        allData = allData.concat(pageData);
        if (pageData.length < pageSize) break; // last page
        pageFrom += pageSize;
      }

      // Fetch user profiles for creator names
      const { data: profilesData } = await supabase
        .from('user_profiles')
        .select('id, full_name');
      const profilesMap = new Map((profilesData || []).map(p => [p.id, p.full_name]));

      // Fetch student counts by class name to populate accurate denominators
      try {
        const { data: studentsWithClass } = await supabase
          .from('students')
          .select('id, class_id, classes(name)');

        const classCountMap: Record<string, number> = {};
        if (studentsWithClass) {
          studentsWithClass.forEach((st: any) => {
            const cName = st.classes?.name || (Array.isArray(st.classes) && st.classes[0]?.name);
            if (cName) {
              const key = cName.trim().toLowerCase();
              classCountMap[key] = (classCountMap[key] || 0) + 1;
            }
          });
        }
        setClassStudentCounts(classCountMap);
      } catch (e) {
        console.error('Error fetching student counts by class:', e);
      }

      const data = allData || [];

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
          // For scheduled tasks (no session), extract subject from task_description or task_name prefix
          subject_name: (() => {
            // 1. Try from session join
            const fromSession = task.sessions?.subjects && !Array.isArray(task.sessions.subjects)
              ? task.sessions.subjects.name
              : Array.isArray(task.sessions?.subjects) && task.sessions.subjects.length > 0
              ? task.sessions.subjects[0].name : null;
            if (fromSession) return fromSession;
            // 2. For scheduled tasks: detect from task name prefix
            const tn = (task.task_name || '').trim();
            if (tn.match(/^SS\s/i)) return 'English Com and Soft Skill';
            if (tn.match(/^SE\s/i)) return 'English Com and Soft Skill';
            if (tn.match(/^TE\s/i)) return 'Azure (Specialization)';
            if (tn.match(/^AI\s/i)) return 'Artificial Intelligence';
            if (tn.match(/^PS\s/i)) return 'Problem Solving';
            return '-';
          })(),
        };
      });

      // Fetch subject_name overrides from wes_scheduled_tasks (allows manual subject editing)
      try {
        const { data: schedData } = await (supabase as any)
          .from('wes_scheduled_tasks')
          .select('title, subject_name')
          .not('subject_name', 'is', null);
        if (schedData) {
          const schedSubjectMap = new Map<string, string>(
            schedData.filter((s: any) => s.subject_name).map((s: any) => [s.title, s.subject_name])
          );
          enriched.forEach(item => {
            if (item.subject_name === '-' && schedSubjectMap.has(item.title)) {
              item.subject_name = schedSubjectMap.get(item.title)!;
            }
          });
        }
      } catch (_) { /* wes_scheduled_tasks may not have all tasks */ }

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
              <div className="flex justify-center py-12 text-sm text-muted-foreground font-medium">
                Loading tasks...
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
                          {formatDateDisplay(group.created_at)}
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
                          {formatDateDisplay(group.due_date)}
                        </TableCell>
                        <TableCell>
                          {(() => {
                            const classKey = (group.class_name || '').trim().toLowerCase();
                            const classEnrolledCount = classStudentCounts[classKey] || 0;
                            const totalClassStudents = Math.max(classEnrolledCount, group.tasks.length);
                            return (
                              <div className="flex flex-col gap-1">
                                <div className="flex justify-between text-[10px] text-muted-foreground">
                                  <span>Progress</span>
                                  <span>{group.completedCount}/{totalClassStudents}</span>
                                </div>
                                <div className="w-24 h-1 bg-muted rounded-full overflow-hidden">
                                  <div 
                                    className="h-full bg-primary" 
                                    style={{ width: `${(group.completedCount / totalClassStudents) * 100}%` }}
                                  />
                                </div>
                              </div>
                            );
                          })()}
                        </TableCell>
                        <TableCell className="text-sm font-medium text-center">
                          {(() => {
                            const classKey = (group.class_name || '').trim().toLowerCase();
                            const classEnrolledCount = classStudentCounts[classKey] || 0;
                            const totalClassStudents = Math.max(classEnrolledCount, group.tasks.length);
                            return (
                              <span className={group.submittedCount === totalClassStudents ? "text-blue-600 font-semibold" : "text-foreground"}>
                                {group.submittedCount}/{totalClassStudents}
                              </span>
                            );
                          })()}
                        </TableCell>
                        <TableCell className="text-sm font-medium text-center">
                          {(() => {
                            const classKey = (group.class_name || '').trim().toLowerCase();
                            const classEnrolledCount = classStudentCounts[classKey] || 0;
                            const totalClassStudents = Math.max(classEnrolledCount, group.tasks.length);
                            return (
                              <span className={group.completedCount === totalClassStudents && totalClassStudents > 0 ? "text-green-600 font-semibold" : "text-foreground"}>
                                {group.completedCount}/{totalClassStudents}
                              </span>
                            );
                          })()}
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
