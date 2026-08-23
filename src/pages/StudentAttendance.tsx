import { useState, useEffect, useMemo } from 'react';
import { 
  CalendarCheck, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  Search, 
  Filter, 
  Calendar as CalendarIcon, 
  TrendingUp, 
  BookOpen, 
  User, 
  Sparkles,
  ChevronRight,
  MessageSquare
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAcademicYear } from '@/contexts/AcademicYearContext';
import { format, isSameMonth, isSameWeek, parseISO } from 'date-fns';
import { attachSessionIdCodes } from '@/utils/sessionIdGenerator';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface AttendanceRecord {
  id: string;
  student_id?: string;
  student_name: string;
  attendance_status: 'Present' | 'Absent';
  performance_rating?: number;
  performance_comment?: string;
  questions_asked?: number;
  bad_behaviour_points?: number;
  created_at: string;
  session: {
    id: string;
    session_id_code?: string;
    title: string;
    session_date: string;
    session_time: string;
    session_type?: string;
    topics_covered?: string;
    class_batch?: string;
    module_name?: string;
    content_category?: string;
    volunteer_name?: string;
    facilitator_name?: string;
  };
}

export default function StudentAttendance() {
  const { user } = useAuth();
  const { getDateRange } = useAcademicYear();

  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [studentName, setStudentName] = useState<string>('');

  // Default filter to "month" (Current Month) as requested by user
  const [filterPeriod, setFilterPeriod] = useState<'month' | 'week' | 'all'>('month');
  
  // Default selected month to current month (1-12)
  const currentMonthNum = (new Date().getMonth() + 1).toString();
  const [selectedMonth, setSelectedMonth] = useState<string>(currentMonthNum);
  
  const [statusFilter, setStatusFilter] = useState<'all' | 'Present' | 'Absent'>('all');
  const [searchQuery, setSearchQuery] = useState('');

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

  useEffect(() => {
    if (user?.email) {
      loadStudentAttendance();
    }
  }, [user?.email]);

  const loadStudentAttendance = async () => {
    try {
      setLoading(true);

      // 1. Fetch student info with class details
      const { data: students, error: studentError } = await supabase
        .from('students')
        .select('id, name, email, designation, class_id, classes(id, name)')
        .ilike('email', user?.email || '');

      if (studentError) throw studentError;

      if (!students || students.length === 0) {
        setRecords([]);
        setLoading(false);
        return;
      }

      const primaryStudent = students[0];
      setStudentName(primaryStudent.name);
      const studentIds = students.map(s => s.id);
      const className = primaryStudent.classes?.name || '';
      const designation = primaryStudent.designation || '';

      const { startDate, endDate } = getDateRange();
      const startDateStr = startDate.toISOString().split('T')[0];
      const endDateStr = endDate.toISOString().split('T')[0];

      // 2. Fetch all sessions conducted for student's class batch in date range
      let sessionQuery = supabase
        .from('sessions')
        .select(`
          id,
          session_id_code,
          title,
          session_date,
          session_time,
          session_type,
          topics_covered,
          class_batch,
          module_name,
          content_category,
          volunteer_name,
          facilitator_name,
          designations
        `)
        .gte('session_date', startDateStr)
        .lte('session_date', endDateStr)
        .order('session_date', { ascending: false });

      if (className) {
        sessionQuery = sessionQuery.ilike('class_batch', `%${className}%`);
      }

      const { data: rawSessions } = await sessionQuery;

      // Filter sessions by student designation if specified
      const relevantSessions = (rawSessions || []).filter((sess: any) => {
        if (!designation || designation === '-') return true;
        if (!sess.designations || sess.designations.length === 0) return true;
        return sess.designations.includes(designation);
      });

      // 3. Query student_performance for explicit records
      const normalizedName = primaryStudent.name.trim().replace(/\s+/g, ' ');
      const studentNameLower = normalizedName.toLowerCase();

      const { data: perfData } = await supabase
        .from('student_performance')
        .select(`
          id,
          student_id,
          student_name,
          attendance_status,
          performance_rating,
          performance_comment,
          questions_asked,
          bad_behaviour_points,
          created_at,
          session_id
        `);

      const filteredPerf = (perfData || []).filter((item: any) => {
        const isStudentMatch = 
          (item.student_id && studentIds.includes(item.student_id)) ||
          ((item.student_name || '').trim().replace(/\s+/g, ' ').toLowerCase() === studentNameLower) ||
          (studentNameLower.includes('puspa lodhi') && (item.student_name || '').toLowerCase().includes('puspa')) ||
          (studentNameLower.includes('nausheen') && (item.student_name || '').toLowerCase().includes('naaj'));

        return isStudentMatch;
      });

      const perfMapBySessionId = new Map<string, any>();
      filteredPerf.forEach((p: any) => {
        if (p.session_id) {
          perfMapBySessionId.set(p.session_id, p);
        }
      });

      // 4. Combine sessions with student performance to build complete records (Present + Absent + Upcoming)
      const combinedRecords: AttendanceRecord[] = [];
      const processedSessionIds = new Set<string>();
      const todayYMD = new Date().toISOString().split('T')[0];

      relevantSessions.forEach((sess: any) => {
        processedSessionIds.add(sess.id);
        const existingPerf = perfMapBySessionId.get(sess.id);

        let status: 'Present' | 'Absent' | 'Upcoming' = 'Absent';
        if (existingPerf) {
          status = existingPerf.attendance_status === 'Absent' ? 'Absent' : 'Present';
        } else if (sess.session_date > todayYMD) {
          status = 'Upcoming';
        } else {
          status = 'Absent';
        }

        combinedRecords.push({
          id: existingPerf?.id || `session-${sess.id}`,
          student_id: primaryStudent.id,
          student_name: primaryStudent.name,
          attendance_status: status as any,
          performance_rating: existingPerf?.performance_rating || null,
          performance_comment: existingPerf?.performance_comment || null,
          questions_asked: existingPerf?.questions_asked || 0,
          bad_behaviour_points: existingPerf?.bad_behaviour_points || 0,
          created_at: existingPerf?.created_at || sess.session_date,
          session: {
            id: sess.id,
            session_id_code: sess.session_id_code,
            title: sess.title || 'Session',
            session_date: sess.session_date,
            session_time: sess.session_time || '',
            session_type: sess.session_type,
            topics_covered: sess.topics_covered,
            class_batch: sess.class_batch,
            module_name: sess.module_name,
            content_category: sess.content_category,
            volunteer_name: sess.volunteer_name,
            facilitator_name: sess.facilitator_name,
          }
        });
      });

      // Include any additional performance records not matched to relevantSessions
      filteredPerf.forEach((item: any) => {
        if (item.session_id && !processedSessionIds.has(item.session_id)) {
          const sDate = item.created_at ? item.created_at.split('T')[0] : null;
          if (!sDate || (sDate >= startDateStr && sDate <= endDateStr)) {
            combinedRecords.push({
              id: item.id,
              student_id: item.student_id,
              student_name: item.student_name,
              attendance_status: item.attendance_status === 'Absent' ? 'Absent' : 'Present',
              performance_rating: item.performance_rating,
              performance_comment: item.performance_comment,
              questions_asked: item.questions_asked,
              bad_behaviour_points: item.bad_behaviour_points,
              created_at: item.created_at,
              session: {
                id: item.session_id,
                session_id_code: null,
                title: 'Session',
                session_date: sDate || startDateStr,
                session_time: '',
                session_type: null,
                topics_covered: null,
                class_batch: className,
                module_name: null,
                content_category: null,
                volunteer_name: null,
                facilitator_name: null,
              }
            });
          }
        }
      });

      // Extract unique sessions, compute sequential session_id_codes
      const sessionList = combinedRecords.map(r => r.session);
      const sessionWithCodes = attachSessionIdCodes(sessionList);
      const codeBySessionId = new Map(sessionWithCodes.map(s => [s.id, s.session_id_code]));

      combinedRecords.forEach(r => {
        r.session.session_id_code = codeBySessionId.get(r.session.id) || r.session.session_id_code;
      });

      // Sort descending by session date
      combinedRecords.sort((a, b) => new Date(b.session.session_date).getTime() - new Date(a.session.session_date).getTime());

      setRecords(combinedRecords);
    } catch (err) {
      console.error('Error loading student attendance:', err);
    } finally {
      setLoading(false);
    }
  };

  // Filtered records calculation
  const filteredRecords = useMemo(() => {
    const today = new Date();

    return records.filter(record => {
      const sessionDate = parseISO(record.session.session_date);

      // Period Filter (Week / Month / All)
      if (filterPeriod === 'week') {
        if (!isSameWeek(sessionDate, today, { weekStartsOn: 1 })) {
          return false;
        }
      } else if (filterPeriod === 'month') {
        if (selectedMonth !== 'all') {
          const recordMonthNum = (sessionDate.getMonth() + 1).toString();
          if (recordMonthNum !== selectedMonth) {
            return false;
          }
        }
      }

      // Status Filter
      if (statusFilter !== 'all' && record.attendance_status !== statusFilter) {
        return false;
      }

      // Search Query Filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const sessionId = (record.session.id || '').toLowerCase();
        const topic = (record.session.topics_covered || '').toLowerCase();
        const title = (record.session.title || '').toLowerCase();
        const moduleName = (record.session.module_name || '').toLowerCase();
        const category = (record.session.content_category || '').toLowerCase();
        const volunteer = (record.session.volunteer_name || '').toLowerCase();
        const facilitator = (record.session.facilitator_name || '').toLowerCase();

        const matches = 
          sessionId.includes(query) ||
          topic.includes(query) || 
          title.includes(query) || 
          moduleName.includes(query) || 
          category.includes(query) ||
          volunteer.includes(query) ||
          facilitator.includes(query);

        if (!matches) return false;
      }

      return true;
    });
  }, [records, filterPeriod, selectedMonth, statusFilter, searchQuery]);

  // Statistics calculation based on past & today's filtered records (excluding future sessions)
  const stats = useMemo(() => {
    const todayYMD = new Date().toISOString().split('T')[0];
    const pastRecords = filteredRecords.filter(r => (r.session.session_date || '') <= todayYMD && (r.attendance_status as string) !== 'Upcoming');

    const total = pastRecords.length;
    const present = pastRecords.filter(r => r.attendance_status === 'Present').length;
    const absent = pastRecords.filter(r => r.attendance_status === 'Absent').length;
    const rate = total > 0 ? Math.round((present / total) * 100) : 0;

    return { total, present, absent, rate };
  }, [filteredRecords]);

  const getSessionTypeBadge = (type?: string) => {
    switch (type) {
      case 'guest_teacher':
        return <Badge variant="secondary" className="bg-purple-500/10 text-purple-600 border-purple-200">Guest Teacher</Badge>;
      case 'guest_speaker':
        return <Badge variant="secondary" className="bg-blue-500/10 text-blue-600 border-blue-200">Guest Speaker</Badge>;
      case 'local_teacher':
        return <Badge variant="secondary" className="bg-amber-500/10 text-amber-600 border-amber-200">Local Teacher</Badge>;
      default:
        return <Badge variant="outline" className="text-muted-foreground">Regular Session</Badge>;
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-primary/10 text-primary">
                <CalendarCheck className="h-6 w-6" />
              </div>
              <h1 className="text-2xl font-bold text-foreground">My Attendance</h1>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Session-wise attendance records for {studentName || 'Student'}
            </p>
          </div>
        </div>

        {/* Stats Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="bg-card border-border shadow-sm">
            <CardContent className="p-5 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Attendance Rate</p>
                <div className="flex items-baseline gap-2 mt-1">
                  <h3 className="text-2xl font-extrabold text-foreground">{stats.rate}%</h3>
                  <span className="text-xs text-muted-foreground">overall</span>
                </div>
              </div>
              <div className={`p-3 rounded-xl ${stats.rate >= 80 ? 'bg-emerald-500/10 text-emerald-600' : 'bg-amber-500/10 text-amber-600'}`}>
                <TrendingUp className="h-6 w-6" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card border-border shadow-sm">
            <CardContent className="p-5 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total Sessions</p>
                <h3 className="text-2xl font-extrabold text-foreground mt-1">{stats.total}</h3>
              </div>
              <div className="p-3 rounded-xl bg-blue-500/10 text-blue-600">
                <BookOpen className="h-6 w-6" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card border-border shadow-sm">
            <CardContent className="p-5 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Sessions Attended</p>
                <h3 className="text-2xl font-extrabold text-emerald-600 mt-1">{stats.present}</h3>
              </div>
              <div className="p-3 rounded-xl bg-emerald-500/10 text-emerald-600">
                <CheckCircle2 className="h-6 w-6" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card border-border shadow-sm">
            <CardContent className="p-5 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Sessions Missed</p>
                <h3 className="text-2xl font-extrabold text-rose-600 mt-1">{stats.absent}</h3>
              </div>
              <div className="p-3 rounded-xl bg-rose-500/10 text-rose-600">
                <XCircle className="h-6 w-6" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filter Controls Card */}
        <Card className="bg-card border-border shadow-sm">
          <CardContent className="p-4 md:p-6 space-y-4">
            <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
              
              {/* Period Quick Switcher (Weekly / Monthly / All) */}
              <div className="flex items-center gap-1 bg-muted p-1 rounded-xl border border-border/60 self-start">
                <Button
                  type="button"
                  variant={filterPeriod === 'month' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setFilterPeriod('month')}
                  className="rounded-lg text-xs md:text-sm font-semibold gap-1.5 h-8 px-3"
                >
                  <CalendarIcon className="h-3.5 w-3.5" />
                  Monthly View
                </Button>

                <Button
                  type="button"
                  variant={filterPeriod === 'week' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setFilterPeriod('week')}
                  className="rounded-lg text-xs md:text-sm font-semibold gap-1.5 h-8 px-3"
                >
                  <Clock className="h-3.5 w-3.5" />
                  This Week
                </Button>

                <Button
                  type="button"
                  variant={filterPeriod === 'all' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setFilterPeriod('all')}
                  className="rounded-lg text-xs md:text-sm font-semibold gap-1.5 h-8 px-3"
                >
                  All Sessions
                </Button>
              </div>

              {/* Secondary Selectors (Month Select, Status Filter, Search) */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 flex-1 lg:max-w-2xl">
                
                {/* Specific Month Select (Active when Monthly View is selected) */}
                {filterPeriod === 'month' && (
                  <div>
                    <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                      <SelectTrigger className="h-9 text-xs md:text-sm">
                        <SelectValue placeholder="Select Month" />
                      </SelectTrigger>
                      <SelectContent>
                        {monthsList.map(m => (
                          <SelectItem key={m.value} value={m.value}>
                            {m.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Status Filter */}
                <div>
                  <Select value={statusFilter} onValueChange={(val: any) => setStatusFilter(val)}>
                    <SelectTrigger className="h-9 text-xs md:text-sm">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Statuses</SelectItem>
                      <SelectItem value="Present">Present Only</SelectItem>
                      <SelectItem value="Absent">Absent Only</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Search Input */}
                <div className={`relative ${filterPeriod !== 'month' ? 'sm:col-span-2' : ''}`}>
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search session or topic..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9 h-9 text-xs md:text-sm"
                  />
                </div>

              </div>

            </div>
          </CardContent>
        </Card>

        {/* Sessions List Row Table */}
        <Card className="bg-card border-border shadow-sm overflow-hidden">
          <CardHeader className="p-4 md:p-6 border-b border-border bg-muted/30">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base md:text-lg font-bold flex items-center gap-2">
                  <span>Session History</span>
                  <Badge variant="secondary" className="font-normal text-xs">
                    {filteredRecords.length} records
                  </Badge>
                </CardTitle>
                <CardDescription className="text-xs text-muted-foreground mt-0.5">
                  Detailed row-by-row breakdown of your attendance
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-12 text-center text-muted-foreground">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-3"></div>
                Loading your attendance records...
              </div>
            ) : filteredRecords.length === 0 ? (
              <div className="p-12 text-center">
                <CalendarCheck className="h-12 w-12 text-muted-foreground/40 mx-auto mb-3" />
                <h4 className="text-base font-semibold text-foreground">No Attendance Records Found</h4>
                <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
                  No sessions found matching your selected period and filter settings. Try switching the filter to "All Months" or "All Sessions".
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="w-[120px] font-bold">Session ID</TableHead>
                      <TableHead className="w-[140px] font-bold">Date & Time</TableHead>
                      <TableHead className="font-bold">Session / Topic</TableHead>
                      <TableHead className="font-bold">Class / Batch</TableHead>
                      <TableHead className="font-bold">Facilitator / Volunteer</TableHead>
                      <TableHead className="text-center font-bold">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRecords.map((record) => {
                      const sessionDate = parseISO(record.session.session_date);
                      const isPresent = record.attendance_status === 'Present';
                      const rawSessionId = record.session.id || '';
                      const displaySessionCode = record.session.session_id_code || (rawSessionId ? `#${rawSessionId.slice(0, 8).toUpperCase()}` : 'N/A');

                      return (
                        <TableRow key={record.id} className="hover:bg-muted/40 transition-colors">
                          {/* 1st Column: Session ID */}
                          <TableCell className="align-top py-4">
                            <div className="flex flex-col gap-1">
                              <Badge 
                                variant="outline" 
                                className="font-mono text-xs bg-primary/10 text-primary border-primary/20 tracking-wide w-fit font-semibold px-2 py-0.5"
                                title={`Full Database UUID: ${rawSessionId}`}
                              >
                                {displaySessionCode}
                              </Badge>
                            </div>
                          </TableCell>

                          {/* Date & Time */}
                          <TableCell className="align-top py-4">
                            <div className="space-y-1">
                              <div className="flex items-center gap-1.5 font-semibold text-foreground text-xs md:text-sm">
                                <CalendarIcon className="h-3.5 w-3.5 text-primary flex-shrink-0" />
                                <span>{format(sessionDate, 'EEE, dd MMM yyyy')}</span>
                              </div>
                              {record.session.session_time && (
                                <div className="flex items-center gap-1 text-xs text-muted-foreground pl-5">
                                  <Clock className="h-3 w-3" />
                                  <span>{record.session.session_time}</span>
                                </div>
                              )}
                            </div>
                          </TableCell>

                          {/* Session / Topic */}
                          <TableCell className="align-top py-4">
                            <div className="space-y-1">
                              <p className="font-semibold text-foreground text-sm line-clamp-2">
                                {record.session.topics_covered || record.session.title || 'Class Session'}
                              </p>
                              <div className="flex flex-wrap items-center gap-1.5">
                                {record.session.module_name && (
                                  <Badge variant="outline" className="text-[10px] font-medium bg-muted/50">
                                    {record.session.module_name}
                                  </Badge>
                                )}
                                {getSessionTypeBadge(record.session.session_type)}
                              </div>
                              {record.performance_comment && (
                                <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1 bg-muted/30 p-1.5 rounded border border-border/40">
                                  <MessageSquare className="h-3 w-3 flex-shrink-0 text-primary" />
                                  <span className="italic">{record.performance_comment}</span>
                                </p>
                              )}
                            </div>
                          </TableCell>

                          {/* Class / Batch */}
                          <TableCell className="align-top py-4">
                            <Badge variant="secondary" className="font-medium text-xs">
                              {record.session.class_batch || 'Assigned Class'}
                            </Badge>
                          </TableCell>

                          {/* Facilitator / Volunteer */}
                          <TableCell className="align-top py-4 text-xs md:text-sm">
                            <div className="space-y-0.5">
                              {record.session.facilitator_name && (
                                <p className="text-foreground font-medium">
                                  <span className="text-muted-foreground text-xs">Teacher: </span>
                                  {record.session.facilitator_name}
                                </p>
                              )}
                              {record.session.volunteer_name && (
                                <p className="text-muted-foreground text-xs">
                                  <span>Volunteer: </span>
                                  {record.session.volunteer_name}
                                </p>
                              )}
                              {!record.session.facilitator_name && !record.session.volunteer_name && (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </div>
                          </TableCell>

                          {/* Attendance Status */}
                          <TableCell className="align-top py-4 text-center">
                            {record.attendance_status === 'Present' ? (
                              <Badge className="bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/20 border-emerald-300 font-bold px-3 py-1 gap-1 text-xs">
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                Present
                              </Badge>
                            ) : record.attendance_status === 'Upcoming' ? (
                              <Badge className="bg-blue-500/15 text-blue-700 hover:bg-blue-500/20 border-blue-300 font-bold px-3 py-1 gap-1 text-xs">
                                <Clock className="h-3.5 w-3.5" />
                                Scheduled
                              </Badge>
                            ) : (
                              <Badge className="bg-rose-500/15 text-rose-700 hover:bg-rose-500/20 border-rose-300 font-bold px-3 py-1 gap-1 text-xs">
                                <XCircle className="h-3.5 w-3.5" />
                                Absent
                              </Badge>
                            )}
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
      </div>
    </DashboardLayout>
  );
}
