import { useEffect, useState } from 'react';
import { Users, Calendar, BookOpen, Plus, Filter, FileText } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { VolunteerSessionStats } from '@/components/dashboard/VolunteerSessionStats';
import { VolunteerReachOutStats } from '@/components/dashboard/VolunteerReachOutStats';
import { TopStudentsWidget } from '@/components/dashboard/TopStudentsWidget';
import { TopFacilitatorsWidget } from '@/components/dashboard/TopFacilitatorsWidget';
import { TopVolunteersWidget } from '@/components/dashboard/TopVolunteersWidget';
import { TodayClassAttendanceWidget } from '@/components/dashboard/TodayClassAttendanceWidget';
import { MonthlyLeaderboardWidget } from '@/components/dashboard/MonthlyLeaderboardWidget';
import { FeedbackStatusWidget } from '@/components/dashboard/FeedbackStatusWidget';
import { useAcademicYear } from '@/contexts/AcademicYearContext';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface Stats {
  totalVolunteers: number;
  totalSessions: number;
  totalStudents: number;
  totalFacilitators: number;
  totalFeedback: number;
}

interface SessionStatus {
  pending: number;
  committed: number;
  available: number;
  completed: number;
}

interface CurriculumCategory {
  name: string;
  count: number;
  color: string;
}

interface Subject {
  id: string;
  name: string;
}

import { runScheduledTaskWorker } from '@/utils/scheduledTaskWorker';

export default function Dashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [stats, setStats] = useState<Stats>({
    totalVolunteers: 0,
    totalSessions: 0,
    totalStudents: 0,
    totalFacilitators: 0,
    totalFeedback: 0,
  });
  const [sessionStatus, setSessionStatus] = useState<SessionStatus>({
    pending: 0,
    committed: 0,
    available: 0,
    completed: 0,
  });
  const [curriculumCategories, setCurriculumCategories] = useState<CurriculumCategory[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [selectedSubject, setSelectedSubject] = useState<string>('all');
  const [selectedSessionType, setSelectedSessionType] = useState<string>('all');
  const [classes, setClasses] = useState<any[]>([]);
  const [selectedClass, setSelectedClass] = useState<string>('all');
  const [selectedDesignation, setSelectedDesignation] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState<number | null>(null);
  const [roleChecking, setRoleChecking] = useState(true);
  const { getDateRange, selectedYear } = useAcademicYear();

  useEffect(() => {
    async function fetchClasses() {
      const { data } = await supabase.from('classes').select('id, name').neq('name', '__SYSTEM_DEV_MODE__').neq('id', '00000000-0000-0000-0000-000000000000').order('name');
      if (data) setClasses(data);
    }
    fetchClasses();
  }, []);

  // Load current user's role
  useEffect(() => {
    if (!user?.id) return;
    async function fetchRole() {
      let { data } = await supabase.from('user_profiles').select('role_id').eq('id', user.id).maybeSingle();
      if (!data) {
        const res = await supabase.from('user_profiles').select('role_id').ilike('email', user.email || '').limit(1).maybeSingle();
        data = res.data;
      }
      if (data?.role_id) setUserRole(data.role_id);
    }
    fetchRole();
  }, [user?.id]);

  // Background worker: auto-assign scheduled tasks whose creation_date <= today
  useEffect(() => {
    runScheduledTaskWorker(selectedYear);
  }, [selectedYear]);

  const getAcademicYearMonths = (yearStr: string) => {
    const startYear = parseInt(yearStr.split('-')[0]);
    const startYearShort = String(startYear).slice(-2);
    const endYearShort = String(startYear + 1).slice(-2);
    return [
      { label: `June ${startYearShort}`, month: 5, year: startYear },
      { label: 'July', month: 6, year: startYear },
      { label: 'Aug', month: 7, year: startYear },
      { label: 'Sept', month: 8, year: startYear },
      { label: 'Oct', month: 9, year: startYear },
      { label: 'Nov', month: 10, year: startYear },
      { label: 'Dec', month: 11, year: startYear },
      { label: 'Jan', month: 0, year: startYear + 1 },
      { label: 'Feb', month: 1, year: startYear + 1 },
      { label: 'Mar', month: 2, year: startYear + 1 },
      { label: 'Apr', month: 3, year: startYear + 1 },
      { label: `May ${endYearShort}`, month: 4, year: startYear + 1 },
    ];
  };

  const getCurrentMonthValue = (yearStr: string) => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    const months = getAcademicYearMonths(yearStr);
    const matched = months.find(m => m.month === currentMonth && m.year === currentYear);
    return matched ? matched.label : months[0].label;
  };

  const [customStartDate, setCustomStartDate] = useState<Date | null>(() => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    const savedYear = localStorage.getItem('selectedAcademicYear_v2') || '2026-27';
    const startYear = parseInt(savedYear.split('-')[0]);
    const months = [
      { month: 5, year: startYear },
      { month: 6, year: startYear },
      { month: 7, year: startYear },
      { month: 8, year: startYear },
      { month: 9, year: startYear },
      { month: 10, year: startYear },
      { month: 11, year: startYear },
      { month: 0, year: startYear + 1 },
      { month: 1, year: startYear + 1 },
      { month: 2, year: startYear + 1 },
      { month: 3, year: startYear + 1 },
      { month: 4, year: startYear + 1 },
    ];
    const matched = months.find(m => m.month === currentMonth && m.year === currentYear);
    if (matched) {
      return new Date(matched.year, matched.month, 1);
    }
    return new Date(startYear, 5, 1);
  });

  const [customEndDate, setCustomEndDate] = useState<Date | null>(() => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    const savedYear = localStorage.getItem('selectedAcademicYear_v2') || '2026-27';
    const startYear = parseInt(savedYear.split('-')[0]);
    const months = [
      { month: 5, year: startYear },
      { month: 6, year: startYear },
      { month: 7, year: startYear },
      { month: 8, year: startYear },
      { month: 9, year: startYear },
      { month: 10, year: startYear },
      { month: 11, year: startYear },
      { month: 0, year: startYear + 1 },
      { month: 1, year: startYear + 1 },
      { month: 2, year: startYear + 1 },
      { month: 3, year: startYear + 1 },
      { month: 4, year: startYear + 1 },
    ];
    const matched = months.find(m => m.month === currentMonth && m.year === currentYear);
    if (matched) {
      return new Date(matched.year, matched.month + 1, 0, 23, 59, 59);
    }
    return new Date(startYear, 6, 0, 23, 59, 59);
  });

  useEffect(() => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    const startYear = parseInt(selectedYear.split('-')[0]);
    const months = [
      { month: 5, year: startYear },
      { month: 6, year: startYear },
      { month: 7, year: startYear },
      { month: 8, year: startYear },
      { month: 9, year: startYear },
      { month: 10, year: startYear },
      { month: 11, year: startYear },
      { month: 0, year: startYear + 1 },
      { month: 1, year: startYear + 1 },
      { month: 2, year: startYear + 1 },
      { month: 3, year: startYear + 1 },
      { month: 4, year: startYear + 1 },
    ];
    const matched = months.find(m => m.month === currentMonth && m.year === currentYear);
    if (matched) {
      setCustomStartDate(new Date(matched.year, matched.month, 1));
      setCustomEndDate(new Date(matched.year, matched.month + 1, 0, 23, 59, 59));
    } else {
      setCustomStartDate(new Date(startYear, 5, 1));
      setCustomEndDate(new Date(startYear, 6, 0, 23, 59, 59));
    }
  }, [selectedYear]);

  const monthsList = getAcademicYearMonths(selectedYear);

  const formatDateYMD = (d: Date | null): string => {
    if (!d) return '';
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const getSelectedMonthLabel = () => {
    if (!customStartDate || !customEndDate) return 'all';
    const startStr = formatDateYMD(customStartDate);
    const endStr = formatDateYMD(customEndDate);
    for (const m of monthsList) {
      const monthStart = new Date(m.year, m.month, 1);
      const monthEnd = new Date(m.year, m.month + 1, 0, 23, 59, 59);
      if (formatDateYMD(monthStart) === startStr && 
          formatDateYMD(monthEnd) === endStr) {
        return m.label;
      }
    }
    return 'custom';
  };

  useEffect(() => {
    async function checkUserRole() {
      if (!user?.id) return;

      try {
        const { data: profileData } = await supabase
          .from('user_profiles')
          .select('role_id')
          .eq('id', user.id)
          .single();

        if (profileData?.role_id) {
          setUserRole(profileData.role_id);
        }

        // Redirect students to their dashboard
        if (profileData?.role_id === 5) {
          navigate('/student-dashboard', { replace: true });
          return;
        }
      } catch (error) {
        console.error('Error checking user role:', error);
      }
    }

    checkUserRole();
  }, [user?.id, navigate]);

  useEffect(() => {
    async function fetchSubjects() {
      try {
        const { data, error } = await supabase
          .from('subjects')
          .select('id, name')
          .order('name', { ascending: true });

        if (error) throw error;
        setSubjects(data || []);

        // Find "Artificial Intelligence" to set as default
        const aiSubject = data?.find(s =>
          s.name === 'Artificial Intelligence' ||
          s.name.toLowerCase() === 'ai'
        );
        if (aiSubject) {
          setSelectedSubject(aiSubject.id);
        }
      } catch (error) {
        console.error('Error fetching subjects:', error);
      }
    }
    fetchSubjects();
  }, []);

  useEffect(() => {
    async function fetchDashboardData() {
      if (!user?.id) return;

      try {
        setLoading(true);
        const { startDate: yrStart, endDate: yrEnd } = getDateRange();
        const startDate = customStartDate || yrStart;
        const endDate = customEndDate || yrEnd;

        // Fetch user profile first to get role and name
        const { data: profileData } = await supabase
          .from('user_profiles')
          .select('role_id, full_name, email')
          .eq('id', user.id)
          .single();
          
        const isFacilitator = profileData?.role_id === 4;
        const fullName = profileData?.full_name;

        // Fetch stats
        const volunteersResult = await supabase.from('volunteers').select('id', { count: 'exact', head: true });
        
        let targetName = fullName ? fullName.toLowerCase().trim() : '';
        let facilName = '';
        
        if (isFacilitator && profileData?.email) {
          const { data: fData } = await supabase.from('facilitators').select('name').eq('email', profileData.email).single();
          if (fData?.name) {
            facilName = fData.name.toLowerCase().trim();
          }
        }

        // Use local date strings to prevent UTC timezone shifting
        const startYMD = `${startDate.getFullYear()}-${String(startDate.getMonth()+1).padStart(2, '0')}-${String(startDate.getDate()).padStart(2, '0')}`;
        const endYMD = `${endDate.getFullYear()}-${String(endDate.getMonth()+1).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')}`;

        // FILTER SESSIONS BY DATE RANGE
        const { data: allSessions } = await supabase
          .from('sessions')
          .select('id, status, facilitator_name, recorded_at, session_type, facilitator_feedback_status, coordinator_feedback_status, supervisor_feedback_status')
          .gte('session_date', startYMD)
          .lte('session_date', endYMD);
        
        let userSessions = allSessions || [];

        if (selectedSessionType !== 'all') {
          userSessions = userSessions.filter(s => s.session_type === selectedSessionType);
        }
        
        if (isFacilitator && (targetName || facilName)) {
           userSessions = userSessions.filter(s => {
             if (!s.facilitator_name) return false;
             const fn = s.facilitator_name.toLowerCase().trim();
             const matchesProfile = targetName ? (fn.includes(targetName) || targetName.includes(fn)) : false;
             const matchesFacil = facilName ? (fn.includes(facilName) || facilName.includes(fn)) : false;
             return matchesProfile || matchesFacil;
           });
        }
        
        const sessionsCount = userSessions.length;
        
        // Fetch total students filtered by academic year
        const studentsResult = await supabase
          .from('students')
          .select('id', { count: 'exact', head: true })
          .eq('academic_year', selectedYear);
        const facilitatorsResult = await supabase.from('facilitators').select('id', { count: 'exact', head: true });
        
        // Feedbacks are completed sessions with recording
        const feedbackCount = userSessions.filter(s => s.recorded_at !== null).length;

        setStats({
          totalVolunteers: volunteersResult.count || 0,
          totalSessions: sessionsCount,
          totalStudents: studentsResult.count || 0,
          totalFacilitators: facilitatorsResult.count || 0,
          totalFeedback: feedbackCount,
        });

        // Fetch session status breakdown
        const statusCounts = {
          pending: 0,
          committed: 0,
          inProgress: 0,
          completed: 0,
        };



        // Find committed sessions that have attendance records (meaning they are in progress)
        const committedSessionIds = userSessions
          .filter(s => s.status?.toLowerCase() === 'committed')
          .map(s => s.id);
          
        const sessionsWithAttendance = new Set();
        if (committedSessionIds.length > 0) {
          const { data: attendanceData } = await supabase
            .from('student_performance')
            .select('session_id')
            .in('session_id', committedSessionIds);
            
          attendanceData?.forEach(record => sessionsWithAttendance.add(record.session_id));
        }

        let facDone = 0;
        let coordDone = 0;
        let supDone = 0;

        userSessions.forEach((session: any) => {
          const status = session.status?.toLowerCase();
          let qualifiesForFeedback = false;
          
          const hasAnyFeedback = 
            session.facilitator_feedback_status?.toLowerCase().trim() === 'done' ||
            session.coordinator_feedback_status?.toLowerCase().trim() === 'done' ||
            session.supervisor_feedback_status?.toLowerCase().trim() === 'done';
          
          if (status === 'pending') statusCounts.pending++;
          else if (status === 'available' || status === 'in progress' || status === 'in-progress' || status === 'in_progress') {
            statusCounts.inProgress++;
            qualifiesForFeedback = true;
          } else if (status === 'completed') {
            statusCounts.completed++;
            qualifiesForFeedback = true;
          } else if (status === 'committed') {
            if (sessionsWithAttendance.has(session.id) || hasAnyFeedback) {
              statusCounts.inProgress++;
              qualifiesForFeedback = true;
            } else {
              statusCounts.committed++;
            }
          }
          
          if (qualifiesForFeedback) {
            if (session.facilitator_feedback_status?.toLowerCase().trim() === 'done') facDone++;
            if (session.coordinator_feedback_status?.toLowerCase().trim() === 'done') coordDone++;
            if (session.supervisor_feedback_status?.toLowerCase().trim() === 'done') supDone++;
          }
        });

        setSessionStatus(statusCounts);
        setStats(prev => ({
          ...prev,
          feedbackStats: { facDone, coordDone, supDone }
        }));
      } catch (error) {
        console.error('Error fetching dashboard data:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchDashboardData();
  }, [user?.id, selectedYear, customStartDate, customEndDate, selectedSessionType]);

  useEffect(() => {
    async function fetchCurriculumData() {
      try {
        // Fetch curriculum categories filtered by subject
        let query = supabase
          .from('curriculum')
          .select('content_category');

        if (selectedSubject !== 'all') {
          query = query.eq('subject_id', selectedSubject);
        }

        const { data: curriculumData, error: curriculumError } = await query;

        if (curriculumError) {
          console.warn('Error fetching curriculum:', curriculumError);
        }

        const categoryMap = new Map<string, number>();
        curriculumData?.forEach((item: any) => {
          const category = item.content_category;
          if (category) {
            categoryMap.set(category, (categoryMap.get(category) || 0) + 1);
          }
        });

        const categories = Array.from(categoryMap.entries()).map(([name, count]) => ({
          name,
          count,
          color: 'bg-muted/30', // More subtle color
        }));

        setCurriculumCategories(categories);
      } catch (error) {
        console.error('Error fetching curriculum data:', error);
      }
    }

    fetchCurriculumData();
  }, [selectedSubject]);

  const statCards = [
    { label: 'Total Volunteers', value: stats.totalVolunteers, icon: Users, color: 'text-blue-600' },
    { label: 'Total Sessions', value: stats.totalSessions, icon: Calendar, color: 'text-green-600' },
    { label: 'Total Students', value: stats.totalStudents, icon: Users, color: 'text-purple-600' },
    { label: 'Facilitator', value: stats.totalFacilitators, icon: Users, color: 'text-orange-600' },
    { label: 'Total Feedback', value: stats.totalFeedback, icon: FileText, color: 'text-pink-600' },
  ];

  const sessionStatusItems = [
    { label: 'Pending', value: sessionStatus.pending, color: 'bg-muted/30', textColor: 'text-yellow-700' },
    { label: 'Committed', value: sessionStatus.committed, color: 'bg-muted/30', textColor: 'text-purple-700' },
    { label: 'In Progress', value: sessionStatus.inProgress, color: 'bg-muted/30', textColor: 'text-blue-700' },
    { label: 'Completed', value: sessionStatus.completed, color: 'bg-muted/30', textColor: 'text-green-700' },
  ];

  if (roleChecking || userRole === 5) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
          <p className="text-muted-foreground">Loading your dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6 md:space-y-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-foreground">Dashboard</h1>
            <p className="text-sm md:text-base text-muted-foreground mt-1">
              Welcome to WesFellow Hub
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {/* Class Filter */}
            <div className="flex flex-col bg-card border border-border px-3 py-1.5 rounded-lg justify-center h-[58px] min-w-[140px]">
              <label className="text-[10px] text-muted-foreground font-semibold">CLASS</label>
              <Select 
                value={selectedClass} 
                onValueChange={setSelectedClass}
              >
                <SelectTrigger className="h-7 border-none bg-transparent focus:ring-0 text-sm font-semibold p-0 shadow-none hover:bg-transparent">
                  <SelectValue placeholder="All Classes" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Classes</SelectItem>
                  {classes.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Designation Filter */}
            <div className="flex flex-col bg-card border border-border px-3 py-1.5 rounded-lg justify-center h-[58px] min-w-[140px]">
              <label className="text-[10px] text-muted-foreground font-semibold">DESIGNATION</label>
              <Select 
                value={selectedDesignation} 
                onValueChange={setSelectedDesignation}
              >
                <SelectTrigger className="h-7 border-none bg-transparent focus:ring-0 text-sm font-semibold p-0 shadow-none hover:bg-transparent">
                  <SelectValue placeholder="All Designations" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Designations</SelectItem>
                  <SelectItem value="1. CCC">1. CCC</SelectItem>
                  <SelectItem value="2. Junior Fellow">2. Junior Fellow</SelectItem>
                  <SelectItem value="3. Senior Fellow">3. Senior Fellow</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Session Type Filter */}
            <div className="flex flex-col bg-card border border-border px-3 py-1.5 rounded-lg justify-center h-[58px] min-w-[150px]">
              <label className="text-[10px] text-muted-foreground font-semibold">SESSION TYPE</label>
              <Select 
                value={selectedSessionType} 
                onValueChange={setSelectedSessionType}
              >
                <SelectTrigger className="h-7 border-none bg-transparent focus:ring-0 text-sm font-semibold p-0 shadow-none hover:bg-transparent">
                  <SelectValue placeholder="All Types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="guest_teacher">Guest Teacher</SelectItem>
                  <SelectItem value="guest_speaker">Guest Speaker</SelectItem>
                  <SelectItem value="local_teacher">Local Teacher</SelectItem>
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
                    const matched = monthsList.find(m => m.label === val);
                    if (matched) {
                      setCustomStartDate(new Date(matched.year, matched.month, 1));
                      setCustomEndDate(new Date(matched.year, matched.month + 1, 0, 23, 59, 59));
                    }
                  }
                }}
              >
                <SelectTrigger className="h-7 border-none bg-transparent focus:ring-0 text-sm font-semibold p-0 shadow-none hover:bg-transparent">
                  <SelectValue placeholder="Select Month" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Months</SelectItem>
                  {monthsList.map((m) => (
                    <SelectItem key={m.label} value={m.label}>
                      {m.label}
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

        {/* Stats Cards Grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 md:gap-4">
          {statCards.filter(card => !(card.label === 'Total Volunteers' && userRole === 4)).map((card, index) => {
            const Icon = card.icon;
            return (
              <div key={index} className="bg-card border border-border rounded-lg p-3 md:p-4">
                <p className="text-xs md:text-sm text-muted-foreground font-medium mb-2">{card.label}</p>
                <p className={`text-xl md:text-2xl font-bold ${card.color}`}>
                  {loading ? '—' : card.value}
                </p>
              </div>
            );
          })}
        </div>

        {/* Status, Volunteer Stats, and Curriculum Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4 md:gap-6">
          {/* 1. Volunteer Session Stats */}
          {userRole !== 4 && <VolunteerSessionStats sessionType={selectedSessionType} />}

          {/* 2. Top Facilitators */}
          <TopFacilitatorsWidget 
            startDate={customStartDate || getDateRange().startDate} 
            endDate={customEndDate || getDateRange().endDate} 
            academicYear={selectedYear} 
            sessionType={selectedSessionType}
          />

          {/* 3. Session Status */}
          <div className="bg-card border border-border rounded-lg p-3 md:p-4">
            <h2 className="text-base md:text-lg font-bold text-foreground mb-3">Session</h2>
            <div className="space-y-2">
              {sessionStatusItems.map((item, index) => (
                <div key={index} className={`${item.color} rounded-lg p-2 md:p-3 flex justify-between items-center`}>
                  <span className={`font-medium text-xs md:text-sm ${item.textColor}`}>{item.label}</span>
                  <span className={`font-bold text-base md:text-lg ${item.textColor}`}>{item.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* 3.5 Feedback Completion Status */}
          <FeedbackStatusWidget 
            startDate={customStartDate || getDateRange().startDate} 
            endDate={customEndDate || getDateRange().endDate} 
            academicYear={selectedYear} 
            sessionType={selectedSessionType}
            totalExpected={sessionStatus.completed + sessionStatus.inProgress}
            precalculatedStats={(stats as any).feedbackStats}
          />

          {/* 4. Volunteer Reach Out */}
          {userRole !== 4 && <VolunteerReachOutStats />}
        </div>

                  {/* Top Rankings & Attendance Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
            <MonthlyLeaderboardWidget />

          

          {/* 5. Today's Attendance */}
          <TodayClassAttendanceWidget 
            selectedClass={selectedClass}
            selectedDesignation={selectedDesignation}
            classes={classes}
          />

          {/* 6. Top Performers */}
          <TopStudentsWidget 
            startDate={customStartDate || getDateRange().startDate} 
            endDate={customEndDate || getDateRange().endDate} 
            academicYear={selectedYear} 
            sessionType={selectedSessionType}
            selectedClass={selectedClass}
            selectedDesignation={selectedDesignation}
            classes={classes}
          />

          {/* 6.5 Top Volunteers — hidden for Facilitators */}
          {userRole !== 4 && (
            <TopVolunteersWidget
              startDate={customStartDate || getDateRange().startDate}
              endDate={customEndDate || getDateRange().endDate}
            />
          )}

          {/* 7. Curriculum */}
          <div className="bg-card border border-border rounded-lg p-3 md:p-4 flex flex-col">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-2">
              <h2 className="text-base md:text-lg font-bold text-foreground">Curriculum</h2>
              <div className="w-full sm:w-32">
                <Select value={selectedSubject} onValueChange={setSelectedSubject}>
                  <SelectTrigger className="h-8 text-[10px] md:text-xs">
                    <SelectValue placeholder="Subject" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Subjects</SelectItem>
                    {subjects.map((subject) => (
                      <SelectItem key={subject.id} value={subject.id} className="text-[10px] md:text-xs">
                        {subject.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2 flex-grow overflow-y-auto pr-1">
              {curriculumCategories.length > 0 ? (
                curriculumCategories.map((category, index) => (
                  <div key={index} className={`${category.color} rounded-lg p-2 md:p-3 flex justify-between items-center`}>
                    <span className="font-medium text-xs md:text-sm text-muted-foreground">{category.name}</span>
                    <span className="font-bold text-base md:text-lg text-muted-foreground">{category.count}</span>
                  </div>
                ))
              ) : (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <BookOpen className="h-8 w-8 text-muted-foreground/30 mb-2" />
                  <p className="text-muted-foreground text-[10px] md:text-xs">No curriculum data</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Quick Action Buttons */}
        <div className="bg-card border border-border rounded-lg p-3 md:p-4">
          <h2 className="text-base md:text-lg font-bold text-foreground mb-3">Quick Action</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <Button
              onClick={() => navigate('/calendar')}
              className="bg-blue-600 hover:bg-blue-700 text-white text-[10px] md:text-xs py-1.5 md:py-2"
            >
              <Plus className="h-3 w-3 md:h-4 md:w-4 mr-1" />
              New Session
            </Button>
            <Button
              onClick={() => navigate('/curriculum')}
              className="bg-yellow-600 hover:bg-yellow-700 text-white text-[10px] md:text-xs py-1.5 md:py-2"
            >
              <Plus className="h-3 w-3 md:h-4 md:w-4 mr-1" />
              New Topic
            </Button>
            <Button
              onClick={() => navigate('/facilitators')}
              className="bg-green-600 hover:bg-green-700 text-white text-[10px] md:text-xs py-1.5 md:py-2"
            >
              <Plus className="h-3 w-3 md:h-4 md:w-4 mr-1" />
              New Facilitator
            </Button>
            <Button
              onClick={() => navigate('/volunteers')}
              className="bg-purple-600 hover:bg-purple-700 text-white text-[10px] md:text-xs py-1.5 md:py-2"
            >
              <Plus className="h-3 w-3 md:h-4 md:w-4 mr-1" />
              New Volunteer
            </Button>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

// trigger rebuild