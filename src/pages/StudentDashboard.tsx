import { useState, useEffect } from 'react';
import { Clock, CheckCircle2, Wallet, ClipboardCheck, Trophy } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAcademicYear } from '@/contexts/AcademicYearContext';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';

interface StudentTask {
  id: string;
  task_name: string;
  deadline: string;
  feedback_type: string;
  status: string;
  feedback_notes?: string;
  submission_link?: string;
}

interface SessionMeeting {
  id: string;
  title: string;
  session_date: string;
  session_time: string;
  facilitator_name?: string;
  meeting_link?: string;
}

const getStudentType = (designation?: string | null) => {
  if (!designation) return 'All';
  const d = designation.trim();
  
  if (d.includes('1. CCC') || d.toLowerCase().includes('ccc') || d.toLowerCase().includes('certified') || d.toLowerCase().includes('computer')) {
    return '1. CCC';
  }
  if (d.includes('2. Junior Fellow') || d.toLowerCase().includes('junior') || d.toLowerCase().includes('intern')) {
    return '2. Junior Fellow';
  }
  if (d.includes('3. Senior Fellow') || d.toLowerCase().includes('senior')) {
    return '3. Senior Fellow';
  }
  
  return 'All';
};

export default function StudentDashboard() {
  const { user } = useAuth();
  const [studentName, setStudentName] = useState('');
  const [tasks, setTasks] = useState<StudentTask[]>([]);
  const [sessions, setSessions] = useState<SessionMeeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [topStudent, setTopStudent] = useState<{ name: string; earnings: number } | null>(null);
  const [classStudentsList, setClassStudentsList] = useState<{ id: string; name: string; earnings: number; attendance: number }[]>([]);
  const [classEarnersLimit, setClassEarnersLimit] = useState(5);
  const [classAttendeesLimit, setClassAttendeesLimit] = useState(5);

  const [totalEarnings, setTotalEarnings] = useState(0);
  const [attendanceRate, setAttendanceRate] = useState('100%');
  const [attendanceDetails, setAttendanceDetails] = useState('No sessions');
  const { selectedYear, getDateRange } = useAcademicYear();

  // Filters and class stats states
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [selectedType, setSelectedType] = useState<string>('');
  const [classList, setClassList] = useState<{ id: string; name: string }[]>([]);
  const [courseCompletion, setCourseCompletion] = useState<number>(0);
  const [ownClassId, setOwnClassId] = useState<string>('');
  const [ownType, setOwnType] = useState<string>('Fellow');

  const formatDateYMD = (d: Date | null): string => {
    if (!d) return '';
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const [customStartDate, setCustomStartDate] = useState<Date | null>(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
  });

  const [customEndDate, setCustomEndDate] = useState<Date | null>(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
  });

  const [earningsList, setEarningsList] = useState<{ amount: number; earned_at: string }[]>([]);
  const [ownSessions, setOwnSessions] = useState<any[]>([]);
  const [studentPerformances, setStudentPerformances] = useState<any[]>([]);

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

  const getSelectedMonthLabel = () => {
    if (!customStartDate || !customEndDate) return 'all';
    const startStr = formatDateYMD(customStartDate);
    const endStr = formatDateYMD(customEndDate);
    
    const now = new Date();
    const year = now.getFullYear();
    for (let m = 0; m < 12; m++) {
      const mStart = formatDateYMD(new Date(year, m, 1));
      const mEnd = formatDateYMD(new Date(year, m + 1, 0, 23, 59, 59));
      if (mStart === startStr && mEnd === endStr) {
        return String(m + 1);
      }
    }
    return 'custom';
  };

  useEffect(() => {
    if (user?.id) {
      loadStudentData();
    }
  }, [user?.id, customStartDate, customEndDate, selectedYear]);

  // Reactive Attendance Rate Calculator
  useEffect(() => {
    if (!studentName || ownSessions.length === 0) {
      setAttendanceRate('100%');
      setAttendanceDetails('0 sessions');
      return;
    }

    const sessionsToUse = ownSessions.filter(s => {
      const sDate = s.session_date;
      if (customStartDate && sDate < formatDateYMD(customStartDate)) return false;
      if (customEndDate && sDate > formatDateYMD(customEndDate)) return false;
      return true;
    });

    let presentCount = 0;
    let totalCount = 0;

    sessionsToUse.forEach(session => {
      const perf = studentPerformances.find(p => p.session_id === session.id);
      if (perf) {
        totalCount++;
        if (perf.attendance_status === 'Present') {
          presentCount++;
        }
      }
    });

    if (totalCount > 0) {
      setAttendanceRate(`${Math.round((presentCount / totalCount) * 100)}%`);
      setAttendanceDetails(`${presentCount} of ${totalCount} present`);
    } else {
      setAttendanceRate('100%');
      setAttendanceDetails(!customStartDate && !customEndDate ? '0 sessions' : '0 sessions in range');
    }
  }, [ownSessions, studentPerformances, customStartDate, customEndDate, studentName]);

  // Load class list on mount
  useEffect(() => {
    async function fetchClasses() {
      try {
        const { data, error } = await supabase
          .from('classes')
          .select('id, name')
          .order('name');
        if (!error && data) {
          setClassList(data);
        }
      } catch (e) {
        console.error('Error loading classes list:', e);
      }
    }
    fetchClasses();
  }, []);

  // Load batch data when selected class, type or year changes
  useEffect(() => {
    async function loadBatchData() {
      if (!selectedClassId) return;

      try {
        // Fetch class info
        const { data: classData } = await supabase
          .from('classes')
          .select('id, name')
          .eq('id', selectedClassId)
          .single();

        const classDataName = classData?.name || '';

        // 1. Fetch sessions for the selected class
        const { startDate, endDate } = getDateRange();
        const { data: sessionsData } = await supabase
          .from('sessions')
          .select('id, title, session_date, session_time, facilitator_name, meeting_link, class_batch')
          .eq('class_batch', classDataName)
          .gte('session_date', startDate.toISOString().split('T')[0])
          .lte('session_date', endDate.toISOString().split('T')[0])
          .order('session_date', { ascending: true });

        setSessions(sessionsData || []);

        // 2. Calculate Course Completion %
        if (classDataName) {
          const { data: curriculumData } = await supabase
            .from('curriculum')
            .select('topics_covered')
            .eq('class_id', selectedClassId);

          const { data: completedSessionsData } = await supabase
            .from('sessions')
            .select('topics_covered')
            .eq('class_batch', classDataName)
            .eq('status', 'completed');

          if (curriculumData && curriculumData.length > 0) {
            const completedTopics = new Set(
              completedSessionsData?.map(s => s.topics_covered?.trim().toLowerCase()).filter(Boolean) || []
            );
            let completedCount = 0;
            curriculumData.forEach(item => {
              const topic = item.topics_covered?.trim().toLowerCase();
              if (topic && completedTopics.has(topic)) {
                completedCount++;
              }
            });
            setCourseCompletion(Math.round((completedCount / curriculumData.length) * 100));
          } else {
            setCourseCompletion(0);
          }
        } else {
          setCourseCompletion(0);
        }

        // 3. Load leaderboard (Class Top Performers)
        let studentsList: { id: string; name: string; designation: string }[] = [];
        const { data: studentsInClass } = await supabase
          .from('students')
          .select('id, name, designation')
          .eq('class_id', selectedClassId);
        
        if (studentsInClass) {
          studentsList = studentsInClass.map(s => ({
            id: s.id,
            name: s.name || '',
            designation: s.designation || ''
          }));
        }

        // Filter the class leaderboard by the selected designation type
        if (selectedType && selectedType !== 'All') {
          studentsList = studentsList.filter(s => {
            const mappedType = getStudentType(s.designation);
            return mappedType === selectedType;
          });
        }

        if (studentsList.length > 0) {
          const studentIds = studentsList.map(s => s.id);
          const { startDate: earningStart, endDate: earningEnd } = getDateRange();

          // Earnings for all filtered students
          const { data: earningsData } = await supabase
            .from('student_earnings')
            .select('student_id, amount, earned_at, description')
            .in('student_id', studentIds)
            .gte('earned_at', earningStart.toISOString())
            .lte('earned_at', earningEnd.toISOString());

          // Sessions for attendance mapping
          const { data: sessionsForLeaderboard } = await supabase
            .from('sessions')
            .select('id, session_date')
            .ilike('class_batch', `%${classDataName}%`)
            .gte('session_date', earningStart.toISOString().split('T')[0])
            .lte('session_date', earningEnd.toISOString().split('T')[0]);

          let attendanceData: any[] = [];
          if (sessionsForLeaderboard && sessionsForLeaderboard.length > 0) {
            const sessionIds = sessionsForLeaderboard.map(s => s.id);
            const chunkSize = 15;
            for (let i = 0; i < sessionIds.length; i += chunkSize) {
              const chunk = sessionIds.slice(i, i + chunkSize);
              const { data: perfChunk } = await supabase
                .from('student_performance')
                .select('student_id, session_id, attendance_status, student_name')
                .in('session_id', chunk)
                .eq('attendance_status', 'Present');
              if (perfChunk) {
                attendanceData = attendanceData.concat(perfChunk);
              }
            }
          }

          // Aggregate statistics - initialize all students with 0
          const statsMap: Record<string, { id: string; name: string; earnings: number; attendance: number }> = {};
          const studentNameMap: Record<string, string> = {};
          studentsList.forEach(s => {
            statsMap[s.id] = { id: s.id, name: s.name, earnings: 0, attendance: 0 };
            studentNameMap[s.name.toLowerCase().trim().replace(/\s+/g, ' ')] = s.id;
          });

          const today = new Date();
          const currentMonthIdx = today.getMonth();
          const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
          const isCurrentMonthEnded = today.getDate() === lastDayOfMonth;

          // Apply earnings filter
          earningsData?.forEach(item => {
            if (customStartDate && new Date(item.earned_at) < customStartDate) return;
            if (customEndDate && new Date(item.earned_at) > customEndDate) return;

            const desc = (item.description || '').toLowerCase();
            if (desc.includes('attendance')) {
              const earnedDate = new Date(item.earned_at || new Date());
              const isCurrentMonth = earnedDate.getMonth() === currentMonthIdx && earnedDate.getFullYear() === today.getFullYear();
              if (isCurrentMonth && !isCurrentMonthEnded) return;
            }

            const amount = parseFloat(item.amount as any) || 0;
            if (statsMap[item.student_id]) {
              statsMap[item.student_id].earnings += amount;
            }
          });

          // Only count attendance for sessions in the selected date range
          const validSessionIds = new Set(
            (sessionsForLeaderboard || [])
              .filter(s => {
                const sDate = s.session_date;
                if (customStartDate && sDate < formatDateYMD(customStartDate)) return false;
                if (customEndDate && sDate > formatDateYMD(customEndDate)) return false;
                return true;
              })
              .map(s => s.id)
          );

          // Count attendance using student_id (reliable) with name fallback and deduplication per session
          const countedStudentSessions = new Set<string>();
          attendanceData?.forEach(record => {
            if (!record.session_id || !validSessionIds.has(record.session_id)) return;
            let sId = record.student_id;
            if (!sId) {
              const nameKey = (record.student_name || '').toLowerCase().trim().replace(/\s+/g, ' ');
              sId = studentNameMap[nameKey];
            }
            if (sId && statsMap[sId]) {
              const dedupeKey = `${sId}_${record.session_id}`;
              if (!countedStudentSessions.has(dedupeKey)) {
                countedStudentSessions.add(dedupeKey);
                statsMap[sId].attendance += 1;
              }
            }
          });

          const aggregatedList = Object.values(statsMap);
          setClassStudentsList(aggregatedList);

          // Find top student
          let bestStudentName = '';
          let bestStudentEarnings = -1;
          aggregatedList.forEach(s => {
            if (s.earnings > bestStudentEarnings) {
              bestStudentEarnings = s.earnings;
              bestStudentName = s.name;
            }
          });
          if (bestStudentEarnings > 0 && bestStudentName) {
            setTopStudent({ name: bestStudentName, earnings: bestStudentEarnings });
          } else {
            setTopStudent(null);
          }
        } else {
          setClassStudentsList([]);
          setTopStudent(null);
        }
      } catch (err) {
        console.error('Error fetching batch statistics:', err);
        setClassStudentsList([]);
        setTopStudent(null);
      }
    }

    loadBatchData();
  }, [selectedClassId, selectedType, customStartDate, customEndDate, selectedYear]);

  const loadStudentData = async () => {
    try {
      setLoading(true);

      // Get student profile with class_id
      let profileData = null;
      let profileError = null;

      // Try to get profile using auth user ID first
      const { data: idData, error: idError } = await supabase
        .from('user_profiles')
        .select('full_name, class_id')
        .eq('id', user?.id)
        .single();

      if (idError) {
        if (idError.code === 'PGRST116') {
          console.warn('Profile ID mismatch detected, querying by email...');
          const { data: emailData, error: emailError } = await supabase
            .from('user_profiles')
            .select('full_name, class_id')
            .ilike('email', user?.email)
            .single();

          profileData = emailData;
          profileError = emailError;
        } else {
          profileError = idError;
        }
      } else {
        profileData = idData;
      }

      if (profileError) {
        console.error('Profile error:', profileError);
      }

      // Fetch student records from students table
      const { data: studentRecords, error: studentError } = await supabase
        .from('students')
        .select('id, name, designation, class_id')
        .ilike('email', user?.email);

      let activeStudentName = profileData?.full_name || '';
      let studentDesignation = '';
      let studentClassId = profileData?.class_id;

      if (studentRecords && studentRecords.length > 0) {
        studentDesignation = studentRecords[0].designation || '';
        if (!studentClassId && studentRecords[0].class_id) {
          studentClassId = studentRecords[0].class_id;
        }
        if (!activeStudentName && studentRecords[0].name) {
          activeStudentName = studentRecords[0].name;
        }
      }
      setStudentName(activeStudentName);

      const computedOwnType = getStudentType(studentDesignation);
      setOwnType(computedOwnType);

      if (studentClassId) {
        setOwnClassId(studentClassId);
        if (!selectedClassId) {
          setSelectedClassId(studentClassId);
        }
      }
      if (!selectedType) {
        setSelectedType(computedOwnType);
      }

      if (studentError) {
        console.warn('Student record not found for email:', user?.email, studentError);
        setTasks([]);
      } else if (studentRecords && studentRecords.length > 0) {
        const studentIds = studentRecords.map(s => s.id);
        
        // Fetch tasks for THIS STUDENT ONLY filtered by academic year
        const { startDate, endDate } = getDateRange();
        const { data: tasksData, error: tasksError } = await supabase
          .from('student_task_feedback')
          .select('*')
          .in('student_id', studentIds)
          .or(`academic_year.eq."${selectedYear}",and(academic_year.is.null,created_at.gte."${startDate.toISOString()}",created_at.lte."${endDate.toISOString()}")`)
          .order('deadline', { ascending: true });

        if (tasksError) {
          console.error('Error fetching tasks:', tasksError);
          setTasks([]);
        } else {
          setTasks(tasksData || []);
        }

        // Fetch Total Earnings filtered by academic year
        const { startDate: earningStart, endDate: earningEnd } = getDateRange();
        const { data: earningsData } = await supabase
          .from('student_earnings')
          .select('amount, earned_at')
          .in('student_id', studentIds)
          .gte('earned_at', earningStart.toISOString())
          .lte('earned_at', earningEnd.toISOString());
        
        setEarningsList(earningsData || []);
      }

      // Fetch personal attendance rate raw data
      const targetClassId = studentClassId || ownClassId;
      let ownSessionsList: SessionMeeting[] = [];
      if (targetClassId) {
        const { data: ownClassData } = await supabase
          .from('classes')
          .select('name')
          .eq('id', targetClassId)
          .single();

        if (ownClassData) {
          const { startDate, endDate } = getDateRange();
          const { data: ownSessionsData } = await supabase
            .from('sessions')
            .select('id, session_date')
            .eq('class_batch', ownClassData.name)
            .gte('session_date', startDate.toISOString().split('T')[0])
            .lte('session_date', endDate.toISOString().split('T')[0]);
          if (ownSessionsData) {
            ownSessionsList = ownSessionsData as any[];
            setOwnSessions(ownSessionsList);
          }
        }
      }

      if (studentIds.length > 0 || studentName) {
        const { data: perfData } = await supabase
          .from('student_performance')
          .select('session_id, attendance_status, student_id, student_name');
        
        if (perfData) {
          const sNameLower = (studentName || '').trim().toLowerCase();
          const filtered = perfData.filter((p: any) => {
            if (p.student_id && studentIds.includes(p.student_id)) return true;
            const pName = (p.student_name || '').trim().toLowerCase();
            return pName === sNameLower;
          });
          setStudentPerformances(filtered);
        }
      }
    } catch (error) {
      console.error('Error loading student data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </DashboardLayout>
    );
  }

  const filteredTasks = tasks.filter(task => {
    if (customStartDate || customEndDate) {
      const dateToUse = task.deadline ? new Date(task.deadline) : new Date(task.created_at);
      if (customStartDate && dateToUse < customStartDate) return false;
      if (customEndDate && dateToUse > customEndDate) return false;
    }
    return true;
  });

  const computedTotalEarnings = earningsList.filter(item => {
    if (customStartDate && new Date(item.earned_at) < customStartDate) return false;
    if (customEndDate && new Date(item.earned_at) > customEndDate) return false;
    return true;
  }).reduce((sum, item) => sum + parseFloat(item.amount as any), 0);

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground">My Dashboard</h1>
            <p className="text-sm text-muted-foreground">Welcome, {studentName}</p>
          </div>
          
          <div className="flex flex-wrap items-center gap-3">
            {/* Batch / Class Plain Text (Not Filter) */}
            <div className="flex flex-col bg-card border border-border px-3 py-1.5 rounded-lg justify-center h-[58px] min-w-[150px]">
              <label className="text-[10px] text-muted-foreground font-semibold">BATCH / CLASS</label>
              <span className="text-sm font-semibold text-foreground mt-0.5">
                {classList.find(c => c.id === ownClassId)?.name || 'Loading...'}
              </span>
            </div>

            {/* Designation Filter */}
            <div className="flex flex-col bg-card border border-border px-3 py-1.5 rounded-lg justify-center h-[58px] min-w-[220px]">
              <label className="text-[10px] text-muted-foreground font-semibold">DESIGNATION</label>
              <Select 
                value={selectedType} 
                onValueChange={setSelectedType}
              >
                <SelectTrigger className="h-7 border-none bg-transparent focus:ring-0 text-sm font-semibold p-0 shadow-none hover:bg-transparent">
                  <SelectValue placeholder="Select Designation" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="All">All Designations</SelectItem>
                  <SelectItem value="1. CCC">1. CCC</SelectItem>
                  <SelectItem value="2. Junior Fellow">2. Junior Fellow</SelectItem>
                  <SelectItem value="3. Senior Fellow">3. Senior Fellow</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Month Filter */}
            <div className="flex flex-col bg-card border border-border px-3 py-1.5 rounded-lg justify-center h-[58px] min-w-[140px]">
              <label className="text-[10px] text-muted-foreground font-semibold">MONTH</label>
              <Select 
                value={getSelectedMonthLabel()} 
                onValueChange={(val) => {
                  if (val === 'all') {
                    setCustomStartDate(null);
                    setCustomEndDate(null);
                  } else if (val !== 'custom') {
                    const monthNum = parseInt(val, 10);
                    const year = new Date().getFullYear();
                    setCustomStartDate(new Date(year, monthNum - 1, 1, 0, 0, 0));
                    setCustomEndDate(new Date(year, monthNum, 0, 23, 59, 59));
                  }
                }}
              >
                <SelectTrigger className="h-7 border-none bg-transparent focus:ring-0 text-sm font-semibold p-0 shadow-none hover:bg-transparent">
                  <SelectValue placeholder="Select Month" />
                </SelectTrigger>
                <SelectContent>
                  {monthsList.map(month => (
                    <SelectItem key={month.value} value={month.value}>
                      {month.label}
                    </SelectItem>
                  ))}
                  {getSelectedMonthLabel() === 'custom' && (
                    <SelectItem value="custom">Custom Range</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>

            {/* Custom Date Range */}
            <div className="flex items-center gap-2 bg-card border border-border p-2 rounded-lg h-[58px]">
              <div className="flex flex-col">
                <label className="text-[10px] text-muted-foreground font-semibold px-1">START DATE</label>
                <input 
                  type="date" 
                  className="bg-transparent text-sm border-0 focus:ring-0 cursor-pointer p-0 h-6"
                  value={formatDateYMD(customStartDate)}
                  onChange={e => {
                    if (e.target.value) {
                      const [y, m, d] = e.target.value.split('-').map(Number);
                      setCustomStartDate(new Date(y, m - 1, d, 0, 0, 0));
                    } else {
                      setCustomStartDate(null);
                    }
                  }}
                />
              </div>
              <div className="text-muted-foreground">-</div>
              <div className="flex flex-col">
                <label className="text-[10px] text-muted-foreground font-semibold px-1">END DATE</label>
                <input 
                  type="date" 
                  className="bg-transparent text-sm border-0 focus:ring-0 cursor-pointer p-0 h-6"
                  value={formatDateYMD(customEndDate)}
                  onChange={e => {
                    if (e.target.value) {
                      const [y, m, d] = e.target.value.split('-').map(Number);
                      setCustomEndDate(new Date(y, m - 1, d, 23, 59, 59));
                    } else {
                      setCustomEndDate(null);
                    }
                  }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
          <Card className="bg-card border-border/50 shadow-sm overflow-hidden border-l-4 border-l-primary">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Tasks</CardTitle>
              <ClipboardCheck className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{filteredTasks.length}</div>
              <p className="text-xs text-muted-foreground mt-1">Assigned to you</p>
            </CardContent>
          </Card>

          <Card className="bg-card border-border/50 shadow-sm overflow-hidden border-l-4 border-l-yellow-500">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium text-muted-foreground">Pending Tasks</CardTitle>
              <Clock className="h-4 w-4 text-yellow-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{filteredTasks.filter(t => t.status === 'pending' || t.status === 'rejected').length}</div>
              <p className="text-xs text-muted-foreground mt-1">Action required</p>
            </CardContent>
          </Card>

          <Card className="bg-card border-border/50 shadow-sm overflow-hidden border-l-4 border-l-green-500">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium text-muted-foreground">Completed</CardTitle>
              <CheckCircle2 className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{filteredTasks.filter(t => t.status === 'completed' || t.status === 'approved').length}</div>
              <p className="text-xs text-muted-foreground mt-1">Successfully finished</p>
            </CardContent>
          </Card>

          <Card className="bg-card border-border/50 shadow-sm overflow-hidden border-l-4 border-l-purple-500">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Earnings</CardTitle>
              <Wallet className="h-4 w-4 text-purple-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">₹{computedTotalEarnings.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground mt-1">Tokens earned</p>
            </CardContent>
          </Card>

          <Card className="bg-card border-border/50 shadow-sm overflow-hidden border-l-4 border-l-blue-500">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium text-muted-foreground">Attendance</CardTitle>
              <ClipboardCheck className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{attendanceRate}</div>
              <p className="text-xs text-muted-foreground mt-1">{attendanceDetails}</p>
            </CardContent>
          </Card>

          <Card className="bg-card border-border/50 shadow-sm overflow-hidden border-l-4 border-l-orange-500">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium text-muted-foreground">Course Completion</CardTitle>
              <CheckCircle2 className="h-4 w-4 text-orange-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{courseCompletion}%</div>
              <div className="w-full bg-muted rounded-full h-1.5 mt-2">
                <div 
                  className="bg-orange-500 h-1.5 rounded-full transition-all duration-500" 
                  style={{ width: `${courseCompletion}%` }}
                />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Class Top Performers List Widget */}
        <div className="max-w-md mt-6">
          <Card className="border-border/50 shadow-sm bg-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg font-semibold flex items-center gap-2">
                <Trophy className="h-5 w-5 text-amber-500" />
                Class Top Performers
              </CardTitle>
            </CardHeader>
            <CardContent>
              {classStudentsList.length === 0 ? (
                <p className="text-center text-sm text-muted-foreground py-8">No student data found.</p>
              ) : (
                <Tabs defaultValue="earnings" className="w-full">
                  <TabsList className="flex w-full mb-4 bg-muted/60 p-1 rounded-xl">
                    <TabsTrigger value="earnings" className="flex-1 rounded-lg">By Earnings</TabsTrigger>
                    <TabsTrigger value="attendance" className="flex-1 rounded-lg">By Attendance</TabsTrigger>
                  </TabsList>
                  
                  <TabsContent value="earnings" className="space-y-4">
                    {classStudentsList.filter(s => s.earnings > 0).length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-4">No earnings found.</p>
                    ) : (
                      <>
                        {[...classStudentsList]
                          .sort((a, b) => b.earnings - a.earnings)
                          .slice(0, classEarnersLimit)
                          .map((student, i) => (
                            <div key={`earn-${student.id}`} className="flex items-center justify-between group">
                              <div className="flex items-center gap-3 min-w-0">
                                {i === 0 && (
                                  <span className="flex items-center justify-center w-6 h-6 rounded-full bg-amber-100 text-[11px] font-extrabold text-amber-700 border border-amber-200 shrink-0">
                                    1
                                  </span>
                                )}
                                {i === 1 && (
                                  <span className="flex items-center justify-center w-6 h-6 rounded-full bg-slate-100 text-[11px] font-extrabold text-slate-700 border border-slate-200 shrink-0">
                                    2
                                  </span>
                                )}
                                {i === 2 && (
                                  <span className="flex items-center justify-center w-6 h-6 rounded-full bg-orange-100 text-[11px] font-extrabold text-orange-700 border border-orange-200 shrink-0">
                                    3
                                  </span>
                                )}
                                {i > 2 && (
                                  <span className="flex items-center justify-center w-6 h-6 rounded-full bg-muted text-[11px] font-bold text-muted-foreground shrink-0">
                                    {i + 1}
                                  </span>
                                )}
                                <span className="font-medium text-sm group-hover:text-primary transition-colors truncate" title={student.name}>{student.name}</span>
                              </div>
                              <div className="flex items-center gap-1 text-emerald-700 font-bold text-xs bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200 shrink-0">
                                <span>₹{student.earnings.toLocaleString()}</span>
                              </div>
                            </div>
                          ))}
                        
                        {(classStudentsList.filter(s => s.earnings > 0).length > classEarnersLimit || classEarnersLimit > 5) && (
                          <div className="pt-2 flex justify-center gap-2 border-t border-dashed mt-2">
                            {classStudentsList.filter(s => s.earnings > 0).length > classEarnersLimit && (
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                onClick={() => setClassEarnersLimit(prev => prev + 5)}
                                className="text-xs text-primary font-semibold hover:underline h-8 flex-1"
                              >
                                See More
                              </Button>
                            )}
                            {classEarnersLimit > 5 && (
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                onClick={() => setClassEarnersLimit(5)}
                                className="text-xs text-muted-foreground font-semibold hover:underline h-8 flex-1"
                              >
                                See Less
                              </Button>
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </TabsContent>

                  <TabsContent value="attendance" className="space-y-4">
                    {classStudentsList.filter(s => s.attendance > 0).length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-4">No attendance records found.</p>
                    ) : (
                      <>
                        {[...classStudentsList]
                          .sort((a, b) => b.attendance - a.attendance)
                          .slice(0, classAttendeesLimit)
                          .map((student, i) => (
                            <div key={`att-${student.id}`} className="flex items-center justify-between group">
                              <div className="flex items-center gap-3 min-w-0">
                                {i === 0 && (
                                  <span className="flex items-center justify-center w-6 h-6 rounded-full bg-amber-100 text-[11px] font-extrabold text-amber-700 border border-amber-200 shrink-0">
                                    1
                                  </span>
                                )}
                                {i === 1 && (
                                  <span className="flex items-center justify-center w-6 h-6 rounded-full bg-slate-100 text-[11px] font-extrabold text-slate-700 border border-slate-200 shrink-0">
                                    2
                                  </span>
                                )}
                                {i === 2 && (
                                  <span className="flex items-center justify-center w-6 h-6 rounded-full bg-orange-100 text-[11px] font-extrabold text-orange-700 border border-orange-200 shrink-0">
                                    3
                                  </span>
                                )}
                                {i > 2 && (
                                  <span className="flex items-center justify-center w-6 h-6 rounded-full bg-muted text-[11px] font-bold text-muted-foreground shrink-0">
                                    {i + 1}
                                  </span>
                                )}
                                <span className="font-medium text-sm group-hover:text-primary transition-colors truncate" title={student.name}>{student.name}</span>
                              </div>
                              <div className="flex items-center gap-1.5 text-green-600 font-bold text-xs bg-green-50/85 px-2.5 py-0.5 rounded-full border border-green-100 shrink-0">
                                <span>{student.attendance}</span>
                                <span className="text-[9px] uppercase tracking-wider text-green-700/80">Present</span>
                              </div>
                            </div>
                          ))}
                        
                        {(classStudentsList.filter(s => s.attendance > 0).length > classAttendeesLimit || classAttendeesLimit > 5) && (
                          <div className="pt-2 flex justify-center gap-2 border-t border-dashed mt-2">
                            {classStudentsList.filter(s => s.attendance > 0).length > classAttendeesLimit && (
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                onClick={() => setClassAttendeesLimit(prev => prev + 5)}
                                className="text-xs text-primary font-semibold hover:underline h-8 flex-1"
                              >
                                See More
                              </Button>
                            )}
                            {classAttendeesLimit > 5 && (
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                onClick={() => setClassAttendeesLimit(5)}
                                className="text-xs text-muted-foreground font-semibold hover:underline h-8 flex-1"
                              >
                                See Less
                              </Button>
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </TabsContent>
                </Tabs>
              )}
            </CardContent>
          </Card>
        </div>

      </div>
    </DashboardLayout>
  );
}
