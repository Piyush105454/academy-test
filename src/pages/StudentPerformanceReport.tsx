import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  TrendingUp,
  ClipboardList,
  CheckCircle2,
  Clock,
  CalendarCheck,
  UserCheck,
  Coins,
  Download,
  Search,
  Filter,
  RotateCcw,
  FileSpreadsheet,
  ChevronsUpDown,
  Eye,
  Award,
  AlertTriangle,
  Check,
  ExternalLink,
  ChevronDown,
  X,
  Layers,
  BarChart3,
  Users,
  ArrowUpDown,
  ArrowUp,
  ArrowDown
} from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useAcademicYear } from '@/contexts/AcademicYearContext';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  Legend
} from 'recharts';

interface Student {
  id: string;
  name: string;
  roll_number: string | null;
  class_id: string;
  class_name: string;
  designation: string | null;
  gender: string | null;
  email: string | null;
  phone_number: string | null;
}

interface TaskRecord {
  id: string;
  student_id: string;
  task_name: string;
  task_id: string;
  deadline: string | null;
  status: string;
  submission_link: string | null;
  feedback_type: string | null;
  earning_amount: number | null;
  created_at: string;
  subject_id: string | null;
  subject_name?: string;
  class_name?: string;
}

interface AttendanceRecord {
  id: string;
  student_id: string;
  status: string; // 'Present', 'Absent', 'Late', 'Leave' etc.
  date: string;
  session_title?: string;
}

interface StudentPerformanceRow {
  student: Student;
  // Tasks
  tasksAssigned: number;
  tasksCompleted: number;
  tasksSubmitted: number;
  tasksPending: number;
  taskCompletionPercent: number;
  // Attendance
  presents: number; // P + LT
  ontimePresents: number;
  latePresents: number;
  absents: number;
  leaves: number;
  sessionDays: number; // P(P+LT) + A + L
  attendancePercent: number;
  // Earnings
  earningsForecasted: number;
  earningsEarned: number;
  earningsPercent: number;
  // Tier
  performanceLevel: 'outstanding' | 'good' | 'average' | 'needs_attention';
  scoreIndex: number;
}

const MONTH_OPTIONS = [
  { value: '4', label: 'April' },
  { value: '5', label: 'May' },
  { value: '6', label: 'June' },
  { value: '7', label: 'July' },
  { value: '8', label: 'August' },
  { value: '9', label: 'September' },
  { value: '10', label: 'October' },
  { value: '11', label: 'November' },
  { value: '12', label: 'December' },
  { value: '1', label: 'January' },
  { value: '2', label: 'February' },
  { value: '3', label: 'March' },
];

export default function StudentPerformanceReport() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { selectedYear, getDateRange } = useAcademicYear();

  // State
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState<number | null>(null);
  const [facilitatorClassIds, setFacilitatorClassIds] = useState<string[]>([]);

  // Raw data from Supabase
  const [classesList, setClassesList] = useState<{ id: string; name: string }[]>([]);
  const [studentsList, setStudentsList] = useState<Student[]>([]);
  const [tasksList, setTasksList] = useState<TaskRecord[]>([]);
  const [attendanceList, setAttendanceList] = useState<AttendanceRecord[]>([]);
  const [earningsList, setEarningsList] = useState<any[]>([]);
  const [subjectsList, setSubjectsList] = useState<{ id: string; name: string }[]>([]);

  // Filters (Multi-select)
  const [selectedClasses, setSelectedClasses] = useState<string[]>([]);
  const [selectedStudents, setSelectedStudents] = useState<string[]>([]);
  const [selectedDesignations, setSelectedDesignations] = useState<string[]>([]);
  const [selectedTaskTypes, setSelectedTaskTypes] = useState<string[]>([]);
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>([]);
  const [selectedMonths, setSelectedMonths] = useState<string[]>([]);
  const [startDateFilter, setStartDateFilter] = useState<string>('');
  const [endDateFilter, setEndDateFilter] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [tierFilter, setTierFilter] = useState<string>('all');

  // Sorting
  const [sortField, setSortField] = useState<string>('taskCompletionPercent');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Dialog for Student Drilldown History
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [selectedStudentForHistory, setSelectedStudentForHistory] = useState<StudentPerformanceRow | null>(null);

  // Active View Mode (Table / Chart)
  const [showChart, setShowChart] = useState(true);

  // 1. Fetch User Role & Facilitator Classes
  useEffect(() => {
    const fetchUserRole = async () => {
      if (!user) return;
      try {
        const { data: profile } = await supabase
          .from('user_profiles')
          .select('role_id, email')
          .eq('id', user.id)
          .maybeSingle();

        const role = profile?.role_id ?? null;
        setUserRole(role);

        if (role === 4 && profile?.email) {
          const { data: facData } = await supabase
            .from('facilitators')
            .select('id, name')
            .ilike('email', profile.email)
            .maybeSingle();

          if (facData) {
            const { data: facClasses } = await supabase
              .from('classes')
              .select('id')
              .or(`facilitator_id.eq.${facData.id},facilitator_name.ilike.%${facData.name}%`);
            setFacilitatorClassIds((facClasses || []).map((c: any) => c.id));
          }
        }
      } catch (err) {
        console.error('Error fetching user role:', err);
      }
    };
    fetchUserRole();
  }, [user]);

  // 2. Load Core Data (Students, Classes, Tasks, Attendance)
  useEffect(() => {
    loadAllReportData();
  }, [selectedYear, userRole, facilitatorClassIds]);

  const loadAllReportData = async () => {
    try {
      setLoading(true);

      // A. Classes
      let classesQuery = supabase
        .from('classes')
        .select('id, name')
        .neq('name', '__SYSTEM_DEV_MODE__')
        .neq('id', '00000000-0000-0000-0000-000000000000')
        .order('name');

      if (userRole === 4 && facilitatorClassIds.length > 0) {
        classesQuery = classesQuery.in('id', facilitatorClassIds);
      }

      const { data: clsData } = await classesQuery;
      const validClasses = clsData || [];
      setClassesList(validClasses);

      const classIds = validClasses.map(c => c.id);
      const classMap = new Map<string, string>();
      validClasses.forEach(c => classMap.set(c.id, c.name));

      // B. Subjects
      const { data: subjData } = await supabase.from('subjects').select('id, name').order('name');
      setSubjectsList(subjData || []);
      const subjMap = new Map<string, string>();
      (subjData || []).forEach(s => subjMap.set(s.id, s.name));

      // C. Students
      let stdQuery = supabase
        .from('students')
        .select('id, name, roll_number, class_id, designation, gender, email, phone_number, academic_year')
        .order('name');

      if (selectedYear) {
        stdQuery = stdQuery.eq('academic_year', selectedYear);
      }
      if (classIds.length > 0) {
        stdQuery = stdQuery.in('class_id', classIds);
      }

      const { data: stdData, error: stdErr } = await stdQuery;
      if (stdErr) throw stdErr;

      const formattedStudents: Student[] = (stdData || []).map(s => ({
        id: s.id,
        name: s.name,
        roll_number: s.roll_number,
        class_id: s.class_id,
        class_name: classMap.get(s.class_id) || 'Unassigned',
        designation: s.designation || 'Student',
        gender: s.gender,
        email: s.email,
        phone_number: s.phone_number,
      }));
      setStudentsList(formattedStudents);

      const studentIds = formattedStudents.map(s => s.id);

      // D. Tasks (student_task_feedback) with pagination if needed
      let allTasks: any[] = [];
      if (studentIds.length > 0) {
        // Chunk student IDs if more than 500
        const chunkSize = 200;
        for (let i = 0; i < studentIds.length; i += chunkSize) {
          const slice = studentIds.slice(i, i + chunkSize);
          let taskQ = supabase
            .from('student_task_feedback')
            .select(`
              id,
              student_id,
              task_name,
              task_id,
              deadline,
              status,
              submission_link,
              feedback_type,
              earning_amount,
              created_at,
              subject_id
            `)
            .in('student_id', slice);

          if (selectedYear) {
            taskQ = taskQ.eq('academic_year', selectedYear);
          }

          const { data: tData } = await taskQ;
          if (tData) allTasks = allTasks.concat(tData);
        }
      }

      const formattedTasks: TaskRecord[] = allTasks.map(t => ({
        id: t.id,
        student_id: t.student_id,
        task_name: t.task_name,
        task_id: t.task_id,
        deadline: t.deadline,
        status: (t.status || 'pending').toLowerCase(),
        submission_link: t.submission_link,
        feedback_type: t.feedback_type || 'General Task',
        earning_amount: Number(t.earning_amount) || 0,
        created_at: t.created_at,
        subject_id: t.subject_id,
        subject_name: t.subject_id ? subjMap.get(t.subject_id) : undefined,
      }));
      setTasksList(formattedTasks);

      // E. Attendance (De-duplicated by student_id & date across daily_attendance & student_performance)
      const { startDate, endDate } = getDateRange();
      const startIso = startDate.toISOString().split('T')[0];
      const endIso = endDate.toISOString().split('T')[0];

      const attendanceMap = new Map<string, AttendanceRecord>();

      // E1: daily_attendance
      if (classIds.length > 0) {
        const { data: dailyData } = await supabase
          .from('daily_attendance')
          .select('id, student_id, status, date')
          .in('class_id', classIds)
          .gte('date', startIso)
          .lte('date', endIso);

        (dailyData || []).forEach(d => {
          if (!d.student_id || !d.date) return;
          const key = `${d.student_id}_${d.date}`;
          attendanceMap.set(key, {
            id: d.id,
            student_id: d.student_id,
            status: d.status || 'Present',
            date: d.date,
            session_title: 'Daily Session',
          });
        });
      }

      // E2: student_performance (merge cleanly without double-counting the same day)
      if (studentIds.length > 0) {
        const chunkSize = 200;
        for (let i = 0; i < studentIds.length; i += chunkSize) {
          const slice = studentIds.slice(i, i + chunkSize);
          const { data: perfData } = await supabase
            .from('student_performance')
            .select(`
              id,
              student_id,
              attendance_status,
              created_at,
              sessions (
                title,
                session_date
              )
            `)
            .in('student_id', slice);

          (perfData || []).forEach((p: any) => {
            const date = p.sessions?.session_date || p.created_at;
            if (!date) return;
            const dateStr = date.split('T')[0];
            if (dateStr >= startIso && dateStr <= endIso && p.student_id) {
              const key = `${p.student_id}_${dateStr}`;
              const statusStr = (p.attendance_status || '').toLowerCase();
              const isPresent = statusStr === 'present' || statusStr === 'p' || statusStr.includes('late');

              if (!attendanceMap.has(key)) {
                attendanceMap.set(key, {
                  id: p.id,
                  student_id: p.student_id,
                  status: p.attendance_status || 'Present',
                  date: dateStr,
                  session_title: p.sessions?.title || 'Session Attendance',
                });
              } else if (isPresent) {
                // If either system logged Present, reflect Present
                attendanceMap.get(key)!.status = p.attendance_status || 'Present';
              }
            }
          });
        }
      }

      setAttendanceList(Array.from(attendanceMap.values()));

      // F. Real Earnings (from official student_earnings table)
      let allEarnings: any[] = [];
      if (studentIds.length > 0) {
        const chunkSize = 200;
        for (let i = 0; i < studentIds.length; i += chunkSize) {
          const slice = studentIds.slice(i, i + chunkSize);
          const { data: earnData } = await supabase
            .from('student_earnings')
            .select('id, student_id, amount, earned_at, description, task_id')
            .in('student_id', slice)
            .gte('earned_at', startDate.toISOString())
            .lte('earned_at', endDate.toISOString());

          if (earnData) allEarnings = allEarnings.concat(earnData);
        }
      }
      setEarningsList(allEarnings);
    } catch (err) {
      console.error('Error loading student performance report data:', err);
      toast.error('Failed to load performance report data');
    } finally {
      setLoading(false);
    }
  };

  // Distinct Filter Options
  const designationOptions = useMemo(() => {
    const set = new Set<string>();
    studentsList.forEach(s => {
      if (s.designation) set.add(s.designation.trim());
    });
    return Array.from(set).sort();
  }, [studentsList]);

  const taskTypeOptions = useMemo(() => {
    const set = new Set<string>();
    tasksList.forEach(t => {
      if (t.feedback_type) set.add(t.feedback_type.trim());
    });
    return Array.from(set).sort();
  }, [tasksList]);

  // Filter Helper: matches Date Range & Months
  const matchesDateAndMonth = (dateStr?: string | null) => {
    if (!dateStr) return true;
    const dateObj = new Date(dateStr);
    if (isNaN(dateObj.getTime())) return true;

    // Month filter
    if (selectedMonths.length > 0) {
      const monthNum = (dateObj.getMonth() + 1).toString();
      if (!selectedMonths.includes(monthNum)) return false;
    }

    // Custom Date Range filter
    const isoDate = dateObj.toISOString().split('T')[0];
    if (startDateFilter && isoDate < startDateFilter) return false;
    if (endDateFilter && isoDate > endDateFilter) return false;

    return true;
  };

  // 3. Process Performance Rows per Student
  const performanceRows: StudentPerformanceRow[] = useMemo(() => {
    return studentsList.map(student => {
      // Filter tasks for this student
      let studentTasks = tasksList.filter(t => t.student_id === student.id);

      // Apply task-level filters
      if (selectedTaskTypes.length > 0) {
        studentTasks = studentTasks.filter(t => t.feedback_type && selectedTaskTypes.includes(t.feedback_type));
      }
      if (selectedSubjects.length > 0) {
        studentTasks = studentTasks.filter(t => t.subject_id && selectedSubjects.includes(t.subject_id));
      }
      const { startDate: aStart, endDate: aEnd } = getDateRange();
      studentTasks = studentTasks.filter(t => {
        const tDateStr = t.created_at || t.deadline;
        if (tDateStr) {
          const tDate = new Date(tDateStr);
          if (tDate < aStart || tDate > aEnd) return false;
        }
        return matchesDateAndMonth(tDateStr);
      });

      const tasksAssigned = studentTasks.length;
      const tasksCompleted = studentTasks.filter(t => t.status === 'completed' || t.status === 'approved').length;
      const tasksSubmitted = studentTasks.filter(t => t.status === 'submitted' || t.status === 'completed' || t.status === 'approved').length;
      const tasksPending = Math.max(0, tasksAssigned - tasksCompleted);
      const taskCompletionPercent = tasksAssigned > 0 ? Math.round((tasksCompleted / tasksAssigned) * 100) : 0;

      // Filter attendance for this student
      let studentAttendance = attendanceList.filter(a => a.student_id === student.id);
      studentAttendance = studentAttendance.filter(a => matchesDateAndMonth(a.date));

      let ontimePresents = 0;
      let latePresents = 0;
      let absents = 0;
      let leaves = 0;

      studentAttendance.forEach(a => {
        const st = (a.status || '').toLowerCase().trim();
        if (st === 'present' || st === 'p') {
          ontimePresents++;
        } else if (st === 'late' || st === 'lt' || st.includes('late')) {
          latePresents++;
        } else if (st === 'absent' || st === 'a') {
          absents++;
        } else if (st === 'leave' || st === 'l') {
          leaves++;
        } else {
          ontimePresents++;
        }
      });

      const presents = ontimePresents + latePresents; // P(P+LT)
      const sessionDays = presents + absents + leaves; // Total of (P(P+LT)+A+L)
      const attendancePercent = sessionDays > 0 ? Math.round((presents / sessionDays) * 100) : 0;

      // Academic Year date range
      const { startDate: acadStart, endDate: acadEnd } = getDateRange();

      // Real Earnings from student_earnings table (filtered by date & month)
      const studentEarnings = earningsList.filter(e => {
        if (e.student_id !== student.id) return false;
        const eDate = new Date(e.earned_at);
        if (eDate < acadStart || eDate > acadEnd) return false;
        return matchesDateAndMonth(e.earned_at);
      });

      const tableEarningsSum = studentEarnings.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);

      // Check tasks completed that might have reward units not yet synced to student_earnings
      const loggedTaskIds = new Set(studentEarnings.map(e => e.task_id).filter(Boolean));
      const unloggedTaskRewards = studentTasks
        .filter(t => (t.status === 'completed' || t.status === 'approved') && !loggedTaskIds.has(t.id))
        .reduce((sum, t) => sum + (t.earning_amount || 0), 0);

      const earningsEarned = Math.round(tableEarningsSum + unloggedTaskRewards);

      // Potential / Forecasted Earnings:
      // Standard monthly potential per active student is ₹840 (Mentor Connect ₹800 + Daily Tasks ₹40)
      const today = new Date();
      let elapsedMonths = selectedMonths.length > 0
        ? selectedMonths.length
        : Math.max(1, Math.min(12, ((today.getFullYear() - acadStart.getFullYear()) * 12 + (today.getMonth() - acadStart.getMonth()) + 1)));
      
      const standardPotential = elapsedMonths * 840;
      const assignedTaskPotential = studentTasks.reduce((sum, t) => sum + (t.earning_amount || 0), 0);
      const earningsForecasted = Math.max(earningsEarned, Math.max(standardPotential, assignedTaskPotential));
      const earningsPercent = earningsForecasted > 0 ? Math.min(100, Math.round((earningsEarned / earningsForecasted) * 100)) : 0;

      // Composite Performance Index (Task Completion 50% + Attendance 50%)
      const scoreIndex = Math.round((taskCompletionPercent * 0.5) + (attendancePercent * 0.5));
      let performanceLevel: StudentPerformanceRow['performanceLevel'] = 'good';
      if (scoreIndex >= 85) performanceLevel = 'outstanding';
      else if (scoreIndex >= 70) performanceLevel = 'good';
      else if (scoreIndex >= 50) performanceLevel = 'average';
      else performanceLevel = 'needs_attention';

      return {
        student,
        tasksAssigned,
        tasksCompleted,
        tasksSubmitted,
        tasksPending,
        taskCompletionPercent,
        presents,
        ontimePresents,
        latePresents,
        absents,
        leaves,
        sessionDays,
        attendancePercent,
        earningsForecasted,
        earningsEarned,
        earningsPercent,
        performanceLevel,
        scoreIndex,
      };
    });
  }, [studentsList, tasksList, attendanceList, earningsList, selectedTaskTypes, selectedSubjects, selectedMonths, startDateFilter, endDateFilter]);

  // 4. Filter Rows by Student-level selections (Class, Student, Designation, Search, Tier)
  const filteredRows = useMemo(() => {
    return performanceRows.filter(row => {
      // Class filter
      if (selectedClasses.length > 0 && !selectedClasses.includes(row.student.class_id)) {
        return false;
      }

      // Student filter
      if (selectedStudents.length > 0 && !selectedStudents.includes(row.student.id)) {
        return false;
      }

      // Designation filter
      if (selectedDesignations.length > 0) {
        const desig = (row.student.designation || '').trim();
        if (!selectedDesignations.includes(desig)) return false;
      }

      // Tier filter
      if (tierFilter !== 'all' && row.performanceLevel !== tierFilter) {
        return false;
      }

      // Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesName = row.student.name.toLowerCase().includes(q);
        const matchesRoll = row.student.roll_number?.toLowerCase().includes(q);
        const matchesClass = row.student.class_name.toLowerCase().includes(q);
        const matchesEmail = row.student.email?.toLowerCase().includes(q);
        if (!matchesName && !matchesRoll && !matchesClass && !matchesEmail) {
          return false;
        }
      }

      return true;
    });
  }, [performanceRows, selectedClasses, selectedStudents, selectedDesignations, tierFilter, searchQuery]);

  // 5. Sorted Rows
  const sortedRows = useMemo(() => {
    return [...filteredRows].sort((a, b) => {
      let aVal: any = a[sortField as keyof StudentPerformanceRow];
      let bVal: any = b[sortField as keyof StudentPerformanceRow];

      if (sortField === 'name') {
        aVal = a.student.name;
        bVal = b.student.name;
      } else if (sortField === 'class_name') {
        aVal = a.student.class_name;
        bVal = b.student.class_name;
      } else if (sortField === 'designation') {
        aVal = a.student.designation || '';
        bVal = b.student.designation || '';
      } else if (sortField === 'scoreIndex' || sortField === 'performanceLevel') {
        aVal = a.scoreIndex;
        bVal = b.scoreIndex;
      }

      if (typeof aVal === 'string') {
        const comp = aVal.localeCompare(bVal);
        return sortOrder === 'asc' ? comp : -comp;
      }
      return sortOrder === 'asc' ? (aVal - bVal) : (bVal - aVal);
    });
  }, [filteredRows, sortField, sortOrder]);

  // 6. Overall Metrics for Colored Box Overview
  const overviewMetrics = useMemo(() => {
    const totalStudents = filteredRows.length;
    let totalAssigned = 0;
    let totalCompleted = 0;
    let totalPending = 0;
    let totalPresents = 0;
    let totalOntime = 0;
    let totalLate = 0;
    let totalSessionDays = 0;
    let totalForecasted = 0;
    let totalEarned = 0;

    filteredRows.forEach(r => {
      totalAssigned += r.tasksAssigned;
      totalCompleted += r.tasksCompleted;
      totalPending += r.tasksPending;
      totalPresents += r.presents;
      totalOntime += r.ontimePresents;
      totalLate += r.latePresents;
      totalSessionDays += r.sessionDays;
      totalForecasted += r.earningsForecasted;
      totalEarned += r.earningsEarned;
    });

    const completionRate = totalAssigned > 0 ? Math.round((totalCompleted / totalAssigned) * 100) : 0;
    const attendanceRate = totalSessionDays > 0 ? Math.round((totalPresents / totalSessionDays) * 100) : 0;
    const earningsRate = totalForecasted > 0 ? Math.round((totalEarned / totalForecasted) * 100) : 0;

    // Tiers
    const outstandingCount = filteredRows.filter(r => r.performanceLevel === 'outstanding').length;
    const goodCount = filteredRows.filter(r => r.performanceLevel === 'good').length;
    const averageCount = filteredRows.filter(r => r.performanceLevel === 'average').length;
    const needsAttentionCount = filteredRows.filter(r => r.performanceLevel === 'needs_attention').length;

    return {
      totalStudents,
      totalAssigned,
      totalCompleted,
      totalPending,
      completionRate,
      totalPresents,
      totalOntime,
      totalLate,
      totalSessionDays,
      attendanceRate,
      totalForecasted,
      totalEarned,
      earningsRate,
      outstandingCount,
      goodCount,
      averageCount,
      needsAttentionCount,
    };
  }, [filteredRows]);

  // 7. Class Comparison Chart Data
  const classComparisonChartData = useMemo(() => {
    const classMapData: Record<string, {
      className: string;
      tasksAssigned: number;
      tasksCompleted: number;
      presents: number;
      sessionDays: number;
      studentsCount: number;
    }> = {};

    filteredRows.forEach(row => {
      const cId = row.student.class_id;
      if (!classMapData[cId]) {
        classMapData[cId] = {
          className: row.student.class_name,
          tasksAssigned: 0,
          tasksCompleted: 0,
          presents: 0,
          sessionDays: 0,
          studentsCount: 0,
        };
      }
      classMapData[cId].tasksAssigned += row.tasksAssigned;
      classMapData[cId].tasksCompleted += row.tasksCompleted;
      classMapData[cId].presents += row.presents;
      classMapData[cId].sessionDays += row.sessionDays;
      classMapData[cId].studentsCount += 1;
    });

    return Object.values(classMapData).map(c => ({
      name: c.className.length > 18 ? c.className.substring(0, 16) + '...' : c.className,
      fullName: c.className,
      'Tasks Assigned': c.tasksAssigned,
      'Tasks Completed': c.tasksCompleted,
      'Completion %': c.tasksAssigned > 0 ? Math.round((c.tasksCompleted / c.tasksAssigned) * 100) : 0,
      'Attendance %': c.sessionDays > 0 ? Math.round((c.presents / c.sessionDays) * 100) : 0,
      students: c.studentsCount,
    }));
  }, [filteredRows]);

  // Export to Excel
  const handleExportExcel = () => {
    if (sortedRows.length === 0) {
      toast.error('No data to export');
      return;
    }

    const exportData = sortedRows.map((r, idx) => ({
      'S.No': idx + 1,
      'Student Name': r.student.name,
      'Roll Number': r.student.roll_number || '-',
      'Class': r.student.class_name,
      'Designation': r.student.designation || 'Student',
      'Tasks Assigned': r.tasksAssigned,
      'Tasks Completed': r.tasksCompleted,
      'Tasks Pending': r.tasksPending,
      'Task Completion %': `${r.taskCompletionPercent}%`,
      'Presents (P+LT)': r.presents,
      'Session Days (P+LT+A+L)': r.sessionDays,
      'Attendance %': `${r.attendancePercent}%`,
      'Earnings Forecasted (Rs)': r.earningsForecasted,
      'Earnings Earned (Rs)': r.earningsEarned,
      'Earnings Realized %': `${r.earningsPercent}%`,
      'Overall Performance Tier': r.performanceLevel.replace('_', ' ').toUpperCase(),
      'Score Index': `${r.scoreIndex}%`,
      'Email': r.student.email || '-',
      'Phone': r.student.phone_number || '-',
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Student Performance');
    XLSX.writeFile(workbook, `Student_Performance_Report_${new Date().toISOString().split('T')[0]}.xlsx`);
    toast.success('Performance report exported successfully!');
  };

  // Reset Filters
  const resetAllFilters = () => {
    setSelectedClasses([]);
    setSelectedStudents([]);
    setSelectedDesignations([]);
    setSelectedTaskTypes([]);
    setSelectedSubjects([]);
    setSelectedMonths([]);
    setStartDateFilter('');
    setEndDateFilter('');
    setSearchQuery('');
    setTierFilter('all');
  };


  const renderSortIcon = (field: string) => {
    if (sortField === field) {
      return sortOrder === 'asc' ? (
        <ArrowUp className="h-3.5 w-3.5 text-primary shrink-0 transition-transform" />
      ) : (
        <ArrowDown className="h-3.5 w-3.5 text-primary shrink-0 transition-transform" />
      );
    }
    return <ArrowUpDown className="h-3 w-3 text-muted-foreground/40 shrink-0 opacity-60 group-hover:opacity-100 group-hover:text-primary transition-all" />;
  };
  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortOrder(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  const hasActiveFilters = Boolean(
    selectedClasses.length > 0 ||
    selectedStudents.length > 0 ||
    selectedDesignations.length > 0 ||
    selectedTaskTypes.length > 0 ||
    selectedSubjects.length > 0 ||
    selectedMonths.length > 0 ||
    startDateFilter ||
    endDateFilter ||
    searchQuery.trim() ||
    tierFilter !== 'all'
  );

  return (
    <DashboardLayout>
      <div className="space-y-6 pb-12">
        {/* Navigation Tabs Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-border pb-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="p-2 rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-400">
                <TrendingUp className="h-6 w-6" />
              </span>
              <div>
                <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground flex items-center gap-2">
                  Performance Report
                  <Badge variant="outline" className="text-xs font-semibold bg-primary/10 text-primary border-primary/20">
                    {selectedYear}
                  </Badge>
                </h1>
                <p className="text-xs md:text-sm text-muted-foreground mt-0.5">
                  Comprehensive comparison of tasks assigned vs completed, attendance days, and student earnings
                </p>
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="flex items-center gap-2 w-full sm:w-auto flex-wrap">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowChart(!showChart)}
              className="gap-1.5 text-xs h-9 bg-card"
            >
              <BarChart3 className="h-3.5 w-3.5 text-indigo-600" />
              {showChart ? 'Hide Analytics' : 'Show Analytics'}
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={handleExportExcel}
              className="gap-1.5 text-xs h-9 bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800"
            >
              <Download className="h-3.5 w-3.5" />
              Export Excel
            </Button>

            <Button
              variant="ghost"
              size="sm"
              onClick={loadAllReportData}
              disabled={loading}
              className="gap-1.5 text-xs h-9"
            >
              <RotateCcw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>

        {/* Tab switcher: Tasks List vs Performance Report */}
        <div className="flex items-center gap-2 border-b border-border/60 pb-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/tasks')}
            className="text-xs font-medium text-muted-foreground hover:text-foreground h-8 gap-1.5"
          >
            <ClipboardList className="h-3.5 w-3.5" />
            Tasks & Projects List
          </Button>
          <Button
            variant="default"
            size="sm"
            className="text-xs font-semibold h-8 gap-1.5 shadow-xs"
          >
            <TrendingUp className="h-3.5 w-3.5" />
            Performance & Completion Report
          </Button>
        </div>

        {/* MULTI-SELECT FILTERS BAR */}
        <Card className="rounded-2xl border-border shadow-xs bg-card p-4 space-y-4">
          <div className="flex items-center justify-between border-b border-border/60 pb-2">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
                Filters (Multi-Select Enabled)
              </h3>
            </div>
            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={resetAllFilters}
                className="h-7 text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/30 gap-1 font-medium"
              >
                <X className="h-3 w-3" />
                Reset Filters
              </Button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
            {/* 1. Class Multi-Select */}
            <div>
              <label className="text-xs font-semibold text-muted-foreground mb-1 block">Class</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="w-full justify-between h-9 text-xs px-2.5 font-normal">
                    <span className="truncate">
                      {selectedClasses.length === 0
                        ? 'All Classes'
                        : selectedClasses.length === 1
                        ? classesList.find(c => c.id === selectedClasses[0])?.name || '1 Class'
                        : `${selectedClasses.length} Classes`}
                    </span>
                    <ChevronsUpDown className="h-3.5 w-3.5 opacity-50 shrink-0 ml-1" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-64 p-2" align="start">
                  <div className="flex justify-between items-center pb-2 mb-2 border-b text-xs">
                    <span className="font-semibold">Select Classes</span>
                    <div className="space-x-2">
                      <button onClick={() => setSelectedClasses(classesList.map(c => c.id))} className="text-primary hover:underline text-[11px]">All</button>
                      <button onClick={() => setSelectedClasses([])} className="text-muted-foreground hover:underline text-[11px]">Clear</button>
                    </div>
                  </div>
                  <div className="max-h-48 overflow-y-auto space-y-1">
                    {classesList.map(c => (
                      <label key={c.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted text-xs cursor-pointer">
                        <Checkbox
                          checked={selectedClasses.includes(c.id)}
                          onCheckedChange={(checked) => {
                            setSelectedClasses(prev =>
                              checked ? [...prev, c.id] : prev.filter(id => id !== c.id)
                            );
                          }}
                        />
                        <span className="truncate">{c.name}</span>
                      </label>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
            </div>

            {/* 2. Students Multi-Select with Search */}
            <div>
              <label className="text-xs font-semibold text-muted-foreground mb-1 block">Student Name</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="w-full justify-between h-9 text-xs px-2.5 font-normal">
                    <span className="truncate">
                      {selectedStudents.length === 0
                        ? 'All Students'
                        : selectedStudents.length === 1
                        ? studentsList.find(s => s.id === selectedStudents[0])?.name || '1 Student'
                        : `${selectedStudents.length} Students`}
                    </span>
                    <ChevronsUpDown className="h-3.5 w-3.5 opacity-50 shrink-0 ml-1" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-72 p-2" align="start">
                  <div className="flex justify-between items-center pb-2 mb-2 border-b text-xs">
                    <span className="font-semibold">Filter Students</span>
                    <button onClick={() => setSelectedStudents([])} className="text-muted-foreground hover:underline text-[11px]">Clear</button>
                  </div>
                  <div className="max-h-52 overflow-y-auto space-y-1">
                    {studentsList.map(s => (
                      <label key={s.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted text-xs cursor-pointer">
                        <Checkbox
                          checked={selectedStudents.includes(s.id)}
                          onCheckedChange={(checked) => {
                            setSelectedStudents(prev =>
                              checked ? [...prev, s.id] : prev.filter(id => id !== s.id)
                            );
                          }}
                        />
                        <div className="truncate">
                          <span className="font-medium truncate block">{s.name}</span>
                          <span className="text-[10px] text-muted-foreground block truncate">{s.class_name}</span>
                        </div>
                      </label>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
            </div>

            {/* 3. Designation Multi-Select */}
            <div>
              <label className="text-xs font-semibold text-muted-foreground mb-1 block">Designation</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="w-full justify-between h-9 text-xs px-2.5 font-normal">
                    <span className="truncate">
                      {selectedDesignations.length === 0
                        ? 'All Designations'
                        : selectedDesignations.length === 1
                        ? selectedDesignations[0]
                        : `${selectedDesignations.length} Selected`}
                    </span>
                    <ChevronsUpDown className="h-3.5 w-3.5 opacity-50 shrink-0 ml-1" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-56 p-2" align="start">
                  <div className="flex justify-between items-center pb-2 mb-2 border-b text-xs">
                    <span className="font-semibold">Designations</span>
                    <button onClick={() => setSelectedDesignations([])} className="text-muted-foreground hover:underline text-[11px]">Clear</button>
                  </div>
                  <div className="max-h-48 overflow-y-auto space-y-1">
                    {designationOptions.map(desig => (
                      <label key={desig} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted text-xs cursor-pointer">
                        <Checkbox
                          checked={selectedDesignations.includes(desig)}
                          onCheckedChange={(checked) => {
                            setSelectedDesignations(prev =>
                              checked ? [...prev, desig] : prev.filter(d => d !== desig)
                            );
                          }}
                        />
                        <span>{desig}</span>
                      </label>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
            </div>

            {/* 4. Task Type Multi-Select */}
            <div>
              <label className="text-xs font-semibold text-muted-foreground mb-1 block">Task Type</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="w-full justify-between h-9 text-xs px-2.5 font-normal">
                    <span className="truncate">
                      {selectedTaskTypes.length === 0
                        ? 'All Task Types'
                        : selectedTaskTypes.length === 1
                        ? selectedTaskTypes[0]
                        : `${selectedTaskTypes.length} Types`}
                    </span>
                    <ChevronsUpDown className="h-3.5 w-3.5 opacity-50 shrink-0 ml-1" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-56 p-2" align="start">
                  <div className="flex justify-between items-center pb-2 mb-2 border-b text-xs">
                    <span className="font-semibold">Task Types</span>
                    <button onClick={() => setSelectedTaskTypes([])} className="text-muted-foreground hover:underline text-[11px]">Clear</button>
                  </div>
                  <div className="max-h-48 overflow-y-auto space-y-1">
                    {taskTypeOptions.map(tType => (
                      <label key={tType} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted text-xs cursor-pointer">
                        <Checkbox
                          checked={selectedTaskTypes.includes(tType)}
                          onCheckedChange={(checked) => {
                            setSelectedTaskTypes(prev =>
                              checked ? [...prev, tType] : prev.filter(t => t !== tType)
                            );
                          }}
                        />
                        <span>{tType}</span>
                      </label>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
            </div>

            {/* 5. Subject Multi-Select */}
            <div>
              <label className="text-xs font-semibold text-muted-foreground mb-1 block">Subject</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="w-full justify-between h-9 text-xs px-2.5 font-normal">
                    <span className="truncate">
                      {selectedSubjects.length === 0
                        ? 'All Subjects'
                        : selectedSubjects.length === 1
                        ? subjectsList.find(s => s.id === selectedSubjects[0])?.name || '1 Subject'
                        : `${selectedSubjects.length} Subjects`}
                    </span>
                    <ChevronsUpDown className="h-3.5 w-3.5 opacity-50 shrink-0 ml-1" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-64 p-2" align="start">
                  <div className="flex justify-between items-center pb-2 mb-2 border-b text-xs">
                    <span className="font-semibold">Subjects</span>
                    <button onClick={() => setSelectedSubjects([])} className="text-muted-foreground hover:underline text-[11px]">Clear</button>
                  </div>
                  <div className="max-h-48 overflow-y-auto space-y-1">
                    {subjectsList.map(s => (
                      <label key={s.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted text-xs cursor-pointer">
                        <Checkbox
                          checked={selectedSubjects.includes(s.id)}
                          onCheckedChange={(checked) => {
                            setSelectedSubjects(prev =>
                              checked ? [...prev, s.id] : prev.filter(id => id !== s.id)
                            );
                          }}
                        />
                        <span className="truncate">{s.name}</span>
                      </label>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
            </div>

            {/* 6. Months Multi-Select */}
            <div>
              <label className="text-xs font-semibold text-muted-foreground mb-1 block">Months</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="w-full justify-between h-9 text-xs px-2.5 font-normal">
                    <span className="truncate">
                      {selectedMonths.length === 0
                        ? 'All Months'
                        : selectedMonths.length === 1
                        ? MONTH_OPTIONS.find(m => m.value === selectedMonths[0])?.label || '1 Month'
                        : `${selectedMonths.length} Months`}
                    </span>
                    <ChevronsUpDown className="h-3.5 w-3.5 opacity-50 shrink-0 ml-1" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-56 p-2" align="start">
                  <div className="flex justify-between items-center pb-2 mb-2 border-b text-xs">
                    <span className="font-semibold">Months</span>
                    <button onClick={() => setSelectedMonths([])} className="text-muted-foreground hover:underline text-[11px]">Clear</button>
                  </div>
                  <div className="max-h-48 overflow-y-auto space-y-1">
                    {MONTH_OPTIONS.map(m => (
                      <label key={m.value} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted text-xs cursor-pointer">
                        <Checkbox
                          checked={selectedMonths.includes(m.value)}
                          onCheckedChange={(checked) => {
                            setSelectedMonths(prev =>
                              checked ? [...prev, m.value] : prev.filter(v => v !== m.value)
                            );
                          }}
                        />
                        <span>{m.label}</span>
                      </label>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {/* Row 2: Date Range, Search & Tier Filter */}
          <div className="flex flex-col sm:flex-row items-center gap-3 pt-1 border-t border-border/40 flex-wrap">
            {/* Search Input */}
            <div className="relative flex-1 min-w-[220px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search by student name, roll number, or class..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 h-9 text-xs"
              />
            </div>

            {/* Date Range: Start Date */}
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <span className="text-xs text-muted-foreground whitespace-nowrap">From:</span>
              <Input
                type="date"
                value={startDateFilter}
                onChange={(e) => setStartDateFilter(e.target.value)}
                className="h-9 text-xs w-36"
              />
              <span className="text-xs text-muted-foreground whitespace-nowrap">To:</span>
              <Input
                type="date"
                value={endDateFilter}
                onChange={(e) => setEndDateFilter(e.target.value)}
                className="h-9 text-xs w-36"
              />
            </div>

            {/* Tier Filter Pills */}
            <div className="flex items-center gap-1.5 ml-auto flex-wrap">
              <span className="text-xs text-muted-foreground mr-1">Tier:</span>
              <Button
                variant={tierFilter === 'all' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setTierFilter('all')}
                className="h-7 text-xs px-2"
              >
                All
              </Button>
              <Button
                variant={tierFilter === 'outstanding' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setTierFilter('outstanding')}
                className="h-7 text-xs px-2 text-emerald-600 hover:text-emerald-700 font-semibold"
              >
                ★ Outstanding (85%+)
              </Button>
              <Button
                variant={tierFilter === 'good' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setTierFilter('good')}
                className="h-7 text-xs px-2 text-blue-600 hover:text-blue-700 font-semibold"
              >
                Good (70-84%)
              </Button>
              <Button
                variant={tierFilter === 'needs_attention' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setTierFilter('needs_attention')}
                className="h-7 text-xs px-2 text-rose-600 hover:text-rose-700 font-semibold"
              >
                Needs Help (&lt;50%)
              </Button>
            </div>
          </div>
        </Card>


        {/* COLOURED OVERVIEW BOXES (Metrics Cards like in Attendance) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3.5">
          {/* Box 1: Total Tasks Assigned */}
          <Card className="rounded-2xl border-l-4 border-l-blue-500 bg-gradient-to-br from-blue-50/70 to-indigo-50/30 dark:from-blue-950/30 dark:to-background border shadow-xs">
            <CardContent className="p-4">
              <div className="flex items-center justify-between text-blue-600 dark:text-blue-400 mb-1.5">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">Tasks Assigned</span>
                <ClipboardList className="w-4 h-4" />
              </div>
              <div className="text-2xl font-black text-slate-900 dark:text-white">
                {overviewMetrics.totalAssigned}
              </div>
              <p className="text-[11px] text-muted-foreground mt-1 truncate">
                Across {overviewMetrics.totalStudents} students
              </p>
            </CardContent>
          </Card>

          {/* Box 2: Tasks Completed */}
          <Card className="rounded-2xl border-l-4 border-l-emerald-500 bg-gradient-to-br from-emerald-50/70 to-teal-50/30 dark:from-emerald-950/30 dark:to-background border shadow-xs">
            <CardContent className="p-4">
              <div className="flex items-center justify-between text-emerald-600 dark:text-emerald-400 mb-1.5">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">Tasks Completed</span>
                <CheckCircle2 className="w-4 h-4" />
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
                  {overviewMetrics.totalCompleted}
                </span>
                <span className="text-xs font-bold text-emerald-700 dark:text-emerald-300">
                  ({overviewMetrics.completionRate}%)
                </span>
              </div>
              <div className="mt-1.5">
                <Progress value={overviewMetrics.completionRate} className="h-1.5 bg-emerald-100 dark:bg-emerald-950" />
              </div>
            </CardContent>
          </Card>

          {/* Box 3: Tasks Pending */}
          <Card className="rounded-2xl border-l-4 border-l-amber-500 bg-gradient-to-br from-amber-50/70 to-orange-50/30 dark:from-amber-950/30 dark:to-background border shadow-xs">
            <CardContent className="p-4">
              <div className="flex items-center justify-between text-amber-600 dark:text-amber-400 mb-1.5">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">Pending Tasks</span>
                <Clock className="w-4 h-4" />
              </div>
              <div className="text-2xl font-black text-amber-600 dark:text-amber-400">
                {overviewMetrics.totalPending}
              </div>
              <p className="text-[11px] text-muted-foreground mt-1 truncate">
                {overviewMetrics.totalAssigned > 0 ? `${100 - overviewMetrics.completionRate}% incomplete` : 'None pending'}
              </p>
            </CardContent>
          </Card>

          {/* Box 4: Session Attendance % */}
          <Card className="rounded-2xl border-l-4 border-l-purple-500 bg-gradient-to-br from-purple-50/70 to-pink-50/30 dark:from-purple-950/30 dark:to-background border shadow-xs">
            <CardContent className="p-4">
              <div className="flex items-center justify-between text-purple-600 dark:text-purple-400 mb-1.5">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">Attendance %</span>
                <CalendarCheck className="w-4 h-4" />
              </div>
              <div className="text-2xl font-black text-purple-600 dark:text-purple-400">
                {overviewMetrics.attendanceRate}%
              </div>
              <p className="text-[11px] text-muted-foreground mt-1 truncate">
                {overviewMetrics.totalPresents} / {overviewMetrics.totalSessionDays} Days
              </p>
            </CardContent>
          </Card>

          {/* Box 5: Presents Breakdown */}
          <Card className="rounded-2xl border-l-4 border-l-teal-500 bg-gradient-to-br from-teal-50/70 to-cyan-50/30 dark:from-teal-950/30 dark:to-background border shadow-xs">
            <CardContent className="p-4">
              <div className="flex items-center justify-between text-teal-600 dark:text-teal-400 mb-1.5">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">Presents P(P+LT)</span>
                <UserCheck className="w-4 h-4" />
              </div>
              <div className="text-2xl font-black text-slate-900 dark:text-white">
                {overviewMetrics.totalPresents}
              </div>
              <p className="text-[11px] text-muted-foreground mt-1 truncate">
                {overviewMetrics.totalOntime} P • {overviewMetrics.totalLate} LT
              </p>
            </CardContent>
          </Card>

          {/* Box 6: Forecasted vs Earned */}
          <Card className="rounded-2xl border-l-4 border-l-indigo-500 bg-gradient-to-br from-indigo-50/70 to-violet-50/30 dark:from-indigo-950/30 dark:to-background border shadow-xs">
            <CardContent className="p-4">
              <div className="flex items-center justify-between text-indigo-600 dark:text-indigo-400 mb-1.5">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">Earned (Rs)</span>
                <Coins className="w-4 h-4" />
              </div>
              <div className="text-2xl font-black text-indigo-600 dark:text-indigo-400">
                ₹{overviewMetrics.totalEarned.toLocaleString('en-IN')}
              </div>
              <p className="text-[11px] text-muted-foreground mt-1 truncate">
                Forecasted: ₹{overviewMetrics.totalForecasted.toLocaleString('en-IN')}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* VISUAL ANALYTICS / COMPARISON CHART (Collapsible) */}
        {showChart && classComparisonChartData.length > 0 && (
          <Card className="rounded-2xl border-border shadow-xs overflow-hidden bg-card">
            <CardHeader className="py-4 px-6 border-b border-border/50 bg-muted/20 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base font-bold flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-primary" />
                  Class Comparison: Tasks Assigned vs Completed & Attendance
                </CardTitle>
                <CardDescription className="text-xs mt-0.5">
                  Visual benchmark across all active classes matching current filters
                </CardDescription>
              </div>
              <Badge variant="secondary" className="text-xs font-semibold">
                {classComparisonChartData.length} Classes Shown
              </Badge>
            </CardHeader>
            <CardContent className="p-4 sm:p-6">
              <div className="w-full h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={classComparisonChartData} margin={{ top: 10, right: 20, left: 0, bottom: 25 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" opacity={0.6} />
                    <XAxis
                      dataKey="name"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: '#64748b', fontSize: 11, fontWeight: 500 }}
                      dy={8}
                    />
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: '#94a3b8', fontSize: 11 }}
                    />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload || !payload.length) return null;
                        const data = payload[0].payload;
                        return (
                          <div className="bg-slate-900 text-white px-3.5 py-2.5 rounded-xl shadow-xl text-xs space-y-1.5 border border-slate-700">
                            <p className="font-bold text-sm text-white">{data.fullName}</p>
                            <div className="flex justify-between gap-4 text-slate-300">
                              <span>Tasks Assigned:</span>
                              <b className="text-blue-400">{data['Tasks Assigned']}</b>
                            </div>
                            <div className="flex justify-between gap-4 text-slate-300">
                              <span>Tasks Completed:</span>
                              <b className="text-emerald-400">{data['Tasks Completed']} ({data['Completion %']}%)</b>
                            </div>
                            <div className="flex justify-between gap-4 text-slate-300">
                              <span>Attendance Rate:</span>
                              <b className="text-purple-400">{data['Attendance %']}%</b>
                            </div>
                            <div className="text-[10px] text-slate-400 pt-1 border-t border-slate-800">
                              Enrolled Students: {data.students}
                            </div>
                          </div>
                        );
                      }}
                    />
                    <Legend wrapperStyle={{ paddingTop: '10px', fontSize: '12px' }} />
                    <Bar dataKey="Tasks Assigned" fill="#3b82f6" radius={[4, 4, 0, 0]} maxBarSize={38} />
                    <Bar dataKey="Tasks Completed" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={38} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        )}

        {/* DETAILED REPORT TABLE */}
        <Card className="rounded-2xl border-border shadow-xs overflow-hidden bg-card">
          <CardHeader className="py-4 px-6 border-b border-border/50 bg-muted/20 flex flex-row items-center justify-between flex-wrap gap-2">
            <div>
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <Users className="h-4 w-4 text-primary" />
                Student Performance & Task Comparison Breakdown
              </CardTitle>
              <CardDescription className="text-xs mt-0.5">
                Showing {sortedRows.length} students matching active filters
              </CardDescription>
            </div>
          </CardHeader>

          <CardContent className="p-0">
            {loading ? (
              <div className="py-20 flex flex-col items-center justify-center gap-3">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                <p className="text-xs text-muted-foreground">Calculating student performance report...</p>
              </div>
            ) : sortedRows.length === 0 ? (
              <div className="py-16 text-center space-y-3">
                <AlertTriangle className="h-9 w-9 text-amber-500 mx-auto" />
                <p className="text-sm font-semibold">No students match your selected filters</p>
                <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                  Try clearing some filters or picking another class to view student performance.
                </p>
                <Button variant="outline" size="sm" onClick={resetAllFilters} className="text-xs">
                  Reset All Filters
                </Button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="bg-muted/40">
                    <TableRow className="border-b border-border/60">
                      {/* S.No */}
                      <TableHead className="w-12 text-center text-xs font-bold text-muted-foreground">#</TableHead>

                      {/* Student Info */}
                      <TableHead
                        onClick={() => handleSort('name')}
                        className="cursor-pointer hover:text-primary text-xs font-bold min-w-[160px] select-none group transition-colors"
                        title="Click to sort by Student Name"
                      >
                        <div className="flex items-center gap-1.5">
                          <span>Student Name</span>
                          {renderSortIcon('name')}
                        </div>
                      </TableHead>
                      <TableHead
                        onClick={() => handleSort('class_name')}
                        className="cursor-pointer hover:text-primary text-xs font-bold select-none group transition-colors"
                        title="Click to sort by Class"
                      >
                        <div className="flex items-center gap-1.5">
                          <span>Class</span>
                          {renderSortIcon('class_name')}
                        </div>
                      </TableHead>
                      <TableHead
                        onClick={() => handleSort('designation')}
                        className="cursor-pointer hover:text-primary text-xs font-bold select-none group transition-colors"
                        title="Click to sort by Designation"
                      >
                        <div className="flex items-center gap-1.5">
                          <span>Designation</span>
                          {renderSortIcon('designation')}
                        </div>
                      </TableHead>

                      {/* TASKS METRICS */}
                      <TableHead
                        onClick={() => handleSort('tasksAssigned')}
                        className="cursor-pointer hover:text-primary text-xs font-bold text-center bg-blue-50/50 dark:bg-blue-950/20 select-none group transition-colors"
                        title="Click to sort by Total Assigned Tasks"
                      >
                        <div className="flex items-center justify-center gap-1.5">
                          <span>Total Assigned</span>
                          {renderSortIcon('tasksAssigned')}
                        </div>
                      </TableHead>
                      <TableHead
                        onClick={() => handleSort('tasksCompleted')}
                        className="cursor-pointer hover:text-primary text-xs font-bold text-center bg-blue-50/50 dark:bg-blue-950/20 select-none group transition-colors"
                        title="Click to sort by Completed Tasks"
                      >
                        <div className="flex items-center justify-center gap-1.5">
                          <span>Completed</span>
                          {renderSortIcon('tasksCompleted')}
                        </div>
                      </TableHead>
                      <TableHead
                        onClick={() => handleSort('taskCompletionPercent')}
                        className="cursor-pointer hover:text-primary text-xs font-bold text-center bg-blue-50/50 dark:bg-blue-950/20 min-w-[130px] select-none group transition-colors"
                        title="Click to sort by Completion %"
                      >
                        <div className="flex items-center justify-center gap-1.5">
                          <span>Completion %</span>
                          {renderSortIcon('taskCompletionPercent')}
                        </div>
                      </TableHead>

                      {/* ATTENDANCE METRICS */}
                      <TableHead
                        onClick={() => handleSort('presents')}
                        className="cursor-pointer hover:text-primary text-xs font-bold text-center bg-purple-50/50 dark:bg-purple-950/20 select-none group transition-colors"
                        title="Click to sort by Presents"
                      >
                        <div className="flex items-center justify-center gap-1.5">
                          <span>Presents (P+LT)</span>
                          {renderSortIcon('presents')}
                        </div>
                      </TableHead>
                      <TableHead
                        onClick={() => handleSort('sessionDays')}
                        className="cursor-pointer hover:text-primary text-xs font-bold text-center bg-purple-50/50 dark:bg-purple-950/20 select-none group transition-colors"
                        title="Click to sort by Session Days"
                      >
                        <div className="flex items-center justify-center gap-1.5">
                          <span>Session Days</span>
                          {renderSortIcon('sessionDays')}
                        </div>
                      </TableHead>
                      <TableHead
                        onClick={() => handleSort('attendancePercent')}
                        className="cursor-pointer hover:text-primary text-xs font-bold text-center bg-purple-50/50 dark:bg-purple-950/20 min-w-[110px] select-none group transition-colors"
                        title="Click to sort by Attendance %"
                      >
                        <div className="flex items-center justify-center gap-1.5">
                          <span>Attendance %</span>
                          {renderSortIcon('attendancePercent')}
                        </div>
                      </TableHead>

                      {/* EARNINGS METRICS */}
                      <TableHead
                        onClick={() => handleSort('earningsForecasted')}
                        className="cursor-pointer hover:text-primary text-xs font-bold text-right bg-emerald-50/50 dark:bg-emerald-950/20 select-none group transition-colors"
                        title="Click to sort by Forecasted Earnings"
                      >
                        <div className="flex items-center justify-end gap-1.5">
                          <span>Forecasted (₹)</span>
                          {renderSortIcon('earningsForecasted')}
                        </div>
                      </TableHead>
                      <TableHead
                        onClick={() => handleSort('earningsEarned')}
                        className="cursor-pointer hover:text-primary text-xs font-bold text-right bg-emerald-50/50 dark:bg-emerald-950/20 select-none group transition-colors"
                        title="Click to sort by Actual Earned"
                      >
                        <div className="flex items-center justify-end gap-1.5">
                          <span>Earned (₹)</span>
                          {renderSortIcon('earningsEarned')}
                        </div>
                      </TableHead>
                      <TableHead
                        onClick={() => handleSort('earningsPercent')}
                        className="cursor-pointer hover:text-primary text-xs font-bold text-center bg-emerald-50/50 dark:bg-emerald-950/20 select-none group transition-colors"
                        title="Click to sort by Earned %"
                      >
                        <div className="flex items-center justify-center gap-1.5">
                          <span>Earned %</span>
                          {renderSortIcon('earningsPercent')}
                        </div>
                      </TableHead>

                      {/* Overall Level & Actions */}
                      <TableHead 
                        onClick={() => handleSort('scoreIndex')}
                        className="cursor-pointer hover:text-primary text-center text-xs font-bold min-w-[120px] select-none group transition-colors"
                        title="Click to sort by Rating / Tier"
                      >
                        <div className="flex items-center justify-center gap-1.5">
                          <span>Rating / Tier</span>
                          {renderSortIcon('scoreIndex')}
                        </div>
                      </TableHead>
                      <TableHead className="text-right text-xs font-bold w-20">Actions</TableHead>
                    </TableRow>
                  </TableHeader>

                  <TableBody>
                    {sortedRows.map((row, idx) => {
                      const isHigh = row.taskCompletionPercent >= 80;
                      const isMid = row.taskCompletionPercent >= 50 && row.taskCompletionPercent < 80;

                      return (
                        <TableRow key={row.student.id} className="hover:bg-muted/30 transition-colors">
                          <TableCell className="text-center text-xs text-muted-foreground font-mono">
                            {idx + 1}
                          </TableCell>

                          {/* Student Name */}
                          <TableCell className="font-semibold text-xs">
                            <button
                              onClick={() => {
                                setSelectedStudentForHistory(row);
                                setHistoryModalOpen(true);
                              }}
                              className="hover:underline text-left text-foreground hover:text-primary font-bold flex items-center gap-1.5"
                            >
                              <span>{row.student.name}</span>
                            </button>
                            {row.student.roll_number && (
                              <span className="text-[10px] text-muted-foreground block font-mono">
                                Roll: {row.student.roll_number}
                              </span>
                            )}
                          </TableCell>

                          {/* Class */}
                          <TableCell className="text-xs">
                            <Badge variant="outline" className="font-medium text-[11px] bg-card">
                              {row.student.class_name}
                            </Badge>
                          </TableCell>

                          {/* Designation */}
                          <TableCell className="text-xs">
                            <span className="text-[11px] font-medium text-slate-600 dark:text-slate-400">
                              {row.student.designation || 'Student'}
                            </span>
                          </TableCell>

                          {/* Task Metrics: Total Assigned */}
                          <TableCell className="text-center text-xs font-bold bg-blue-50/20 dark:bg-blue-950/10">
                            {row.tasksAssigned}
                          </TableCell>

                          {/* Task Metrics: Completed */}
                          <TableCell className="text-center text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-blue-50/20 dark:bg-blue-950/10">
                            {row.tasksCompleted}
                          </TableCell>

                          {/* Task Metrics: Completion % */}
                          <TableCell className="text-center text-xs bg-blue-50/20 dark:bg-blue-950/10">
                            <div className="flex items-center justify-center gap-2">
                              <Badge
                                variant="outline"
                                className={`font-bold text-[11px] ${
                                  isHigh
                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300'
                                    : isMid
                                    ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300'
                                    : 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300'
                                }`}
                              >
                                {row.taskCompletionPercent}%
                              </Badge>
                            </div>
                          </TableCell>

                          {/* Attendance: Presents */}
                          <TableCell className="text-center text-xs font-semibold text-purple-700 dark:text-purple-300 bg-purple-50/20 dark:bg-purple-950/10">
                            {row.presents}
                          </TableCell>

                          {/* Attendance: Session Days */}
                          <TableCell className="text-center text-xs font-medium text-muted-foreground bg-purple-50/20 dark:bg-purple-950/10">
                            {row.sessionDays}
                          </TableCell>

                          {/* Attendance: % */}
                          <TableCell className="text-center text-xs font-bold bg-purple-50/20 dark:bg-purple-950/10">
                            <Badge
                              variant="outline"
                              className={`text-[11px] font-bold ${
                                row.attendancePercent >= 80
                                  ? 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300'
                                  : row.attendancePercent >= 60
                                  ? 'bg-amber-50 text-amber-700 border-amber-200'
                                  : 'bg-rose-50 text-rose-700 border-rose-200'
                              }`}
                            >
                              {row.attendancePercent}%
                            </Badge>
                          </TableCell>

                          {/* Earnings: Forecasted */}
                          <TableCell className="text-right text-xs font-medium text-muted-foreground bg-emerald-50/20 dark:bg-emerald-950/10">
                            ₹{row.earningsForecasted.toLocaleString('en-IN')}
                          </TableCell>

                          {/* Earnings: Earned */}
                          <TableCell className="text-right text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50/20 dark:bg-emerald-950/10">
                            ₹{row.earningsEarned.toLocaleString('en-IN')}
                          </TableCell>

                          {/* Earnings: % */}
                          <TableCell className="text-center text-xs font-medium bg-emerald-50/20 dark:bg-emerald-950/10">
                            {row.earningsPercent}%
                          </TableCell>

                          {/* Performance Level */}
                          <TableCell className="text-center text-xs">
                            {row.performanceLevel === 'outstanding' ? (
                              <Badge className="bg-emerald-600 text-white font-semibold text-[10px] hover:bg-emerald-600">
                                ★ Outstanding
                              </Badge>
                            ) : row.performanceLevel === 'good' ? (
                              <Badge variant="secondary" className="bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 font-semibold text-[10px]">
                                Good
                              </Badge>
                            ) : row.performanceLevel === 'average' ? (
                              <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-800 font-semibold text-[10px]">
                                Average
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="border-rose-300 bg-rose-50 text-rose-700 font-semibold text-[10px]">
                                Needs Push
                              </Badge>
                            )}
                          </TableCell>

                          {/* Actions */}
                          <TableCell className="text-right text-xs">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setSelectedStudentForHistory(row);
                                setHistoryModalOpen(true);
                              }}
                              className="h-7 px-2 text-primary hover:text-primary hover:bg-primary/10 gap-1 text-[11px]"
                            >
                              <Eye className="h-3 w-3" />
                              Details
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* STUDENT DRILLDOWN HISTORY MODAL */}
        <Dialog open={historyModalOpen} onOpenChange={setHistoryModalOpen}>
          <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto rounded-2xl">
            {selectedStudentForHistory && (
              <>
                <DialogHeader className="border-b pb-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <DialogTitle className="text-lg font-bold flex items-center gap-2">
                        {selectedStudentForHistory.student.name}
                        <Badge variant="outline" className="text-xs">
                          {selectedStudentForHistory.student.class_name}
                        </Badge>
                      </DialogTitle>
                      <DialogDescription className="text-xs mt-0.5">
                        Designation: {selectedStudentForHistory.student.designation || 'Student'} • Roll: {selectedStudentForHistory.student.roll_number || 'N/A'} • Email: {selectedStudentForHistory.student.email || 'N/A'}
                      </DialogDescription>
                    </div>
                  </div>
                </DialogHeader>

                {/* Quick Summary Badges inside Modal */}
                <div className="grid grid-cols-3 gap-3 py-3 border-b text-center">
                  <div className="p-2.5 rounded-xl bg-blue-50/60 dark:bg-blue-950/30">
                    <span className="text-[10px] font-bold text-muted-foreground uppercase block">Task Completion</span>
                    <span className="text-lg font-black text-blue-600 dark:text-blue-400">
                      {selectedStudentForHistory.taskCompletionPercent}%
                    </span>
                    <span className="text-[10px] text-muted-foreground block">
                      {selectedStudentForHistory.tasksCompleted} of {selectedStudentForHistory.tasksAssigned} tasks
                    </span>
                  </div>

                  <div className="p-2.5 rounded-xl bg-purple-50/60 dark:bg-purple-950/30">
                    <span className="text-[10px] font-bold text-muted-foreground uppercase block">Attendance Rate</span>
                    <span className="text-lg font-black text-purple-600 dark:text-purple-400">
                      {selectedStudentForHistory.attendancePercent}%
                    </span>
                    <span className="text-[10px] text-muted-foreground block">
                      {selectedStudentForHistory.presents} of {selectedStudentForHistory.sessionDays} days
                    </span>
                  </div>

                  <div className="p-2.5 rounded-xl bg-emerald-50/60 dark:bg-emerald-950/30">
                    <span className="text-[10px] font-bold text-muted-foreground uppercase block">Earnings Realized</span>
                    <span className="text-lg font-black text-emerald-600 dark:text-emerald-400">
                      ₹{selectedStudentForHistory.earningsEarned}
                    </span>
                    <span className="text-[10px] text-muted-foreground block">
                      Forecasted ₹{selectedStudentForHistory.earningsForecasted}
                    </span>
                  </div>
                </div>

                {/* Tabs inside Modal */}
                <Tabs defaultValue="tasks" className="w-full pt-2">
                  <TabsList className="grid grid-cols-3 w-full mb-3">
                    <TabsTrigger value="tasks" className="text-xs">
                      Assigned Tasks ({tasksList.filter(t => t.student_id === selectedStudentForHistory.student.id).length})
                    </TabsTrigger>
                    <TabsTrigger value="attendance" className="text-xs">
                      Attendance Log ({attendanceList.filter(a => a.student_id === selectedStudentForHistory.student.id).length})
                    </TabsTrigger>
                    <TabsTrigger value="earnings" className="text-xs">
                      Earnings Log ({earningsList.filter(e => e.student_id === selectedStudentForHistory.student.id).length})
                    </TabsTrigger>
                  </TabsList>

                  {/* Tasks Tab */}
                  <TabsContent value="tasks" className="space-y-2">
                    {(() => {
                      const studentTasks = tasksList.filter(t => t.student_id === selectedStudentForHistory.student.id);
                      if (studentTasks.length === 0) {
                        return (
                          <div className="py-8 text-center text-xs text-muted-foreground">
                            No tasks assigned to this student in this academic year.
                          </div>
                        );
                      }
                      return (
                        <div className="rounded-xl border overflow-hidden">
                          <Table>
                            <TableHeader className="bg-muted/40">
                              <TableRow>
                                <TableHead className="text-xs font-bold">Task Name</TableHead>
                                <TableHead className="text-xs font-bold">Type</TableHead>
                                <TableHead className="text-xs font-bold">Deadline</TableHead>
                                <TableHead className="text-xs font-bold text-center">Status</TableHead>
                                <TableHead className="text-xs font-bold text-right">Points</TableHead>
                                <TableHead className="text-xs font-bold text-right">Submission</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {studentTasks.map(t => (
                                <TableRow key={t.id} className="text-xs">
                                  <TableCell className="font-semibold">{t.task_name}</TableCell>
                                  <TableCell>
                                    <Badge variant="outline" className="text-[10px]">
                                      {t.feedback_type}
                                    </Badge>
                                  </TableCell>
                                  <TableCell className="text-muted-foreground">
                                    {t.deadline ? new Date(t.deadline).toLocaleDateString() : '-'}
                                  </TableCell>
                                  <TableCell className="text-center">
                                    <Badge
                                      className={`text-[10px] capitalize ${
                                        t.status === 'completed' || t.status === 'approved'
                                          ? 'bg-emerald-600 text-white'
                                          : t.status === 'submitted'
                                          ? 'bg-blue-600 text-white'
                                          : 'bg-amber-100 text-amber-800'
                                      }`}
                                    >
                                      {t.status}
                                    </Badge>
                                  </TableCell>
                                  <TableCell className="text-right font-medium">₹{t.earning_amount || 0}</TableCell>
                                  <TableCell className="text-right">
                                    {t.submission_link ? (
                                      <a
                                        href={t.submission_link}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-primary hover:underline font-bold inline-flex items-center gap-1 text-[11px]"
                                      >
                                        View Link <ExternalLink className="h-3 w-3" />
                                      </a>
                                    ) : (
                                      <span className="text-muted-foreground text-[11px]">-</span>
                                    )}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      );
                    })()}
                  </TabsContent>

                  {/* Attendance Tab */}
                  <TabsContent value="attendance" className="space-y-2">
                    {(() => {
                      const studentAtt = attendanceList.filter(a => a.student_id === selectedStudentForHistory.student.id);
                      if (studentAtt.length === 0) {
                        return (
                          <div className="py-8 text-center text-xs text-muted-foreground">
                            No attendance records logged for this student.
                          </div>
                        );
                      }
                      return (
                        <div className="rounded-xl border overflow-hidden max-h-72 overflow-y-auto">
                          <Table>
                            <TableHeader className="bg-muted/40">
                              <TableRow>
                                <TableHead className="text-xs font-bold">Date</TableHead>
                                <TableHead className="text-xs font-bold">Session</TableHead>
                                <TableHead className="text-xs font-bold text-right">Status</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {studentAtt.map(a => (
                                <TableRow key={a.id} className="text-xs">
                                  <TableCell className="font-medium">{a.date}</TableCell>
                                  <TableCell className="text-muted-foreground">{a.session_title || 'Session'}</TableCell>
                                  <TableCell className="text-right">
                                    <Badge
                                      variant="outline"
                                      className={`text-[10px] font-bold ${
                                        a.status.toLowerCase().includes('present')
                                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                          : a.status.toLowerCase().includes('late')
                                          ? 'bg-amber-50 text-amber-700 border-amber-200'
                                          : 'bg-rose-50 text-rose-700 border-rose-200'
                                      }`}
                                    >
                                      {a.status}
                                    </Badge>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      );
                    })()}
                  </TabsContent>

                  {/* Earnings Tab */}
                  <TabsContent value="earnings" className="space-y-2">
                    {(() => {
                      const studentEarnings = earningsList.filter(e => e.student_id === selectedStudentForHistory.student.id);
                      if (studentEarnings.length === 0) {
                        return (
                          <div className="py-8 text-center text-xs text-muted-foreground">
                            No earning transactions recorded for this student in this academic year.
                          </div>
                        );
                      }
                      return (
                        <div className="rounded-xl border overflow-hidden">
                          <Table>
                            <TableHeader className="bg-muted/40">
                              <TableRow>
                                <TableHead className="text-xs font-bold">Earned Date</TableHead>
                                <TableHead className="text-xs font-bold">Description / Reward</TableHead>
                                <TableHead className="text-xs font-bold text-right">Amount (₹)</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {studentEarnings.map(e => (
                                <TableRow key={e.id} className="text-xs">
                                  <TableCell className="text-muted-foreground">
                                    {e.earned_at ? new Date(e.earned_at).toLocaleDateString() : '-'}
                                  </TableCell>
                                  <TableCell className="font-semibold">
                                    {e.description || 'Reward'}
                                  </TableCell>
                                  <TableCell className="text-right font-bold text-emerald-600">
                                    ₹{e.amount}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      );
                    })()}
                  </TabsContent>
                </Tabs>
              </>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
