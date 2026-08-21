import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { Trophy, CheckCircle, Loader2 } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from '@/components/ui/button';

interface ClassOption {
  id: string;
  name: string;
}

interface TopStudentsWidgetProps {
  startDate: Date | null;
  endDate: Date | null;
  academicYear: string;
  sessionType?: string;
  selectedClass?: string;
  selectedDesignation?: string;
  classes?: ClassOption[];
}

interface StudentStat {
  id: string;
  name: string;
  earnings: number;
  attendance: number;
}

export function TopStudentsWidget({ 
  startDate, 
  endDate, 
  academicYear, 
  sessionType,
  selectedClass = 'all',
  selectedDesignation = 'all',
  classes = []
}: TopStudentsWidgetProps) {
  const [students, setStudents] = useState<StudentStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [earnersLimit, setEarnersLimit] = useState(5);
  const [attendeesLimit, setAttendeesLimit] = useState(5);

  useEffect(() => {
    async function fetchTopStudents() {
      setLoading(true);
      try {
        // Fetch all students for mapping
        let studentsQuery = supabase.from('students').select('id, name, academic_year, class_id, designation');
        
        if (selectedClass !== 'all') {
          studentsQuery = studentsQuery.eq('class_id', selectedClass);
        }
        if (selectedDesignation !== 'all') {
          studentsQuery = studentsQuery.eq('designation', selectedDesignation);
        }

        const { data: allStudents } = await studentsQuery;
        
        const studentNameMap = new Map();
        const studentIdMap = new Map();
        allStudents?.forEach(s => {
          if (s.name) studentNameMap.set(s.name.toLowerCase().trim().replace(/\s+/g, ' '), s);
          studentIdMap.set(s.id, s);
        });

        // Fetch matching task IDs for the selected session type
        let matchingTaskIds = new Set<string>();
        if (sessionType && sessionType !== 'all') {
          const { data: matchingTasks } = await supabase
            .from('student_task_feedback')
            .select('id, sessions!inner(session_type)')
            .eq('sessions.session_type', sessionType);
          matchingTasks?.forEach(t => matchingTaskIds.add(t.id));
        }

        // Query 1: Earnings
        let earningsQuery = supabase
          .from('student_earnings')
          .select(`
            amount,
            student_id,
            task_id,
            description,
            earned_at
          `);
        
        if (startDate) {
          earningsQuery = earningsQuery.gte('earned_at', startDate.toISOString());
        }
        if (endDate) {
          const end = new Date(endDate);
          end.setDate(end.getDate() + 1);
          earningsQuery = earningsQuery.lt('earned_at', end.toISOString());
        }

        const { data: earningsData, error: earningsError } = await earningsQuery;
        
        if (earningsError) {
          console.error('Error fetching earnings:', earningsError);
          setErrorMessage(`Earnings Error: ${earningsError.message || JSON.stringify(earningsError)}`);
          // don't return, we can still show attendance
        }

        // Query 2: Attendance (Fetch sessions first to avoid missing relation error)
        let sessionsQuery = supabase
          .from('sessions')
          .select('id');

        const formatDateYMD = (d: Date): string => {
          const year = d.getFullYear();
          const month = String(d.getMonth() + 1).padStart(2, '0');
          const day = String(d.getDate()).padStart(2, '0');
          return `${year}-${month}-${day}`;
        };

        if (startDate) {
          sessionsQuery = sessionsQuery.gte('session_date', formatDateYMD(startDate));
        }
        if (endDate) {
          sessionsQuery = sessionsQuery.lte('session_date', formatDateYMD(endDate));
        }
        if (sessionType && sessionType !== 'all') {
          sessionsQuery = sessionsQuery.eq('session_type', sessionType);
        }

        const { data: sessionsData, error: sessionsError } = await sessionsQuery;
        
        let attendanceData: any[] = [];
        let attendanceError: any = null;

        if (sessionsError) {
          attendanceError = sessionsError;
        } else if (sessionsData && sessionsData.length > 0) {
          const sessionIds = sessionsData.map(s => s.id);
          const chunkSize = 5; // Small chunk size to ensure we don't hit the 1000 row limit per query
          
          for (let i = 0; i < sessionIds.length; i += chunkSize) {
            const chunk = sessionIds.slice(i, i + chunkSize);
            const { data, error } = await supabase
              .from('student_performance')
              .select('student_id, attendance_status, student_name')
              .in('session_id', chunk)
              .eq('attendance_status', 'Present');
              
            if (error) {
              attendanceError = error;
              break;
            }
            if (data) {
              attendanceData = attendanceData.concat(data);
            }
          }
        }

        if (attendanceError) {
          console.error('Error fetching attendance:', attendanceError);
          setErrorMessage(`Attendance Error: ${attendanceError.message || JSON.stringify(attendanceError)}`);
          // don't return, show whatever we have
        }

        // Aggregate
        const statsMap = new Map<string, StudentStat>();
        const today = new Date();
        const currentMonthIdx = today.getMonth();
        const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
        const isCurrentMonthEnded = today.getDate() === lastDayOfMonth;

        // Process Earnings
        earningsData?.forEach((record: any) => {
          if (sessionType && sessionType !== 'all' && (!record.task_id || !matchingTaskIds.has(record.task_id))) return;
          
          const desc = (record.description || '').toLowerCase();
          if (desc.includes('attendance')) {
            const earnedDate = new Date(record.earned_at || new Date());
            const isCurrentMonth = earnedDate.getMonth() === currentMonthIdx && earnedDate.getFullYear() === today.getFullYear();
            if (isCurrentMonth && !isCurrentMonthEnded) return;
          }

          const s = studentIdMap.get(record.student_id);
          if (!s) return;
          if (academicYear && academicYear !== 'All' && s.academic_year && s.academic_year !== academicYear) return;
          
          const sId = record.student_id;
          if (!statsMap.has(sId)) {
            statsMap.set(sId, { id: sId, name: s.name, earnings: 0, attendance: 0 });
          }
          statsMap.get(sId)!.earnings += Number(record.amount || 0);
        });

        // Process Attendance
        attendanceData?.forEach((record: any) => {
          let sId = record.student_id;
          
          if (!sId) {
            if (!record.student_name) return;
            let normalizedName = record.student_name.toLowerCase().trim().replace(/\s+/g, ' ');
            
            // Data correction for students whose names were changed in the students table
            // but their old attendance records still have the old name.
            if (normalizedName.includes('puspa lodhi')) normalizedName = 'pushpa lodhi';
            if (normalizedName.includes('nausheen naaj')) normalizedName = 'nausheen naaz';
            if (normalizedName === 'mohammad tauseef') normalizedName = 'tauseef';
            
            const s = studentNameMap.get(normalizedName);
            if (!s) return;
            sId = s.id;
          }

          if (academicYear && academicYear !== 'All') {
             const studentInfo = studentIdMap.get(sId);
             if (studentInfo && studentInfo.academic_year !== academicYear) return;
          }

          if (!statsMap.has(sId)) {
            const studentInfo = studentIdMap.get(sId);
            if (!studentInfo) return;
            statsMap.set(sId, { id: sId, name: studentInfo.name, earnings: 0, attendance: 0 });
          }
          statsMap.get(sId)!.attendance += 1;
        });

        setStudents(Array.from(statsMap.values()));
      } catch (e) {
        console.error('Error in fetchTopStudents:', e);
      } finally {
        setLoading(false);
      }
    }

    fetchTopStudents();
  }, [startDate, endDate, academicYear, sessionType, selectedClass, selectedDesignation, classes]);

  const topEarners = [...students].sort((a, b) => b.earnings - a.earnings).slice(0, earnersLimit);
  const topAttendees = [...students].sort((a, b) => b.attendance - a.attendance).slice(0, attendeesLimit);

  return (
    <Card className="col-span-1 border-border/50 shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg font-semibold flex items-center gap-2">
          <Trophy className="h-5 w-5 text-amber-500" />
          Top Performers
        </CardTitle>
      </CardHeader>
      <CardContent>
        {errorMessage ? (
          <div className="p-4 text-sm text-red-500 bg-red-50 rounded-md">
            {errorMessage}
          </div>
        ) : loading ? (
          <div className="flex justify-center items-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : students.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-8">No student data found for this period.</p>
        ) : (
          <Tabs defaultValue="earnings" className="w-full">
            <TabsList className="flex w-full mb-4 bg-muted/60 p-1 rounded-xl">
              <TabsTrigger value="earnings" className="flex-1 rounded-lg">By Earnings</TabsTrigger>
              <TabsTrigger value="attendance" className="flex-1 rounded-lg">By Attendance</TabsTrigger>
            </TabsList>
            
            <TabsContent value="earnings" className="space-y-4">
              {topEarners.length > 0 ? topEarners.map((student, i) => (
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
              )) : <p className="text-sm text-muted-foreground text-center py-4">No earnings found.</p>}
              {(students.filter(s => s.earnings > 0).length > earnersLimit || earnersLimit > 5) && (
                <div className="pt-2 flex justify-center gap-2 border-t border-dashed mt-2">
                  {students.filter(s => s.earnings > 0).length > earnersLimit && (
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={() => setEarnersLimit(prev => prev + 5)}
                      className="text-xs text-primary font-semibold hover:underline h-8 flex-1"
                    >
                      See More
                    </Button>
                  )}
                  {earnersLimit > 5 && (
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={() => setEarnersLimit(5)}
                      className="text-xs text-muted-foreground font-semibold hover:underline h-8 flex-1"
                    >
                      See Less
                    </Button>
                  )}
                </div>
              )}
            </TabsContent>
            
            <TabsContent value="attendance" className="space-y-4">
              {topAttendees.length > 0 ? topAttendees.map((student, i) => (
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
              )) : <p className="text-sm text-muted-foreground text-center py-4">No attendance records found.</p>}
              {(students.filter(s => s.attendance > 0).length > attendeesLimit || attendeesLimit > 5) && (
                <div className="pt-2 flex justify-center gap-2 border-t border-dashed mt-2">
                  {students.filter(s => s.attendance > 0).length > attendeesLimit && (
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={() => setAttendeesLimit(prev => prev + 5)}
                      className="text-xs text-primary font-semibold hover:underline h-8 flex-1"
                    >
                      See More
                    </Button>
                  )}
                  {attendeesLimit > 5 && (
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={() => setAttendeesLimit(5)}
                      className="text-xs text-muted-foreground font-semibold hover:underline h-8 flex-1"
                    >
                      See Less
                    </Button>
                  )}
                </div>
              )}
            </TabsContent>
          </Tabs>
        )}
      </CardContent>
    </Card>
  );
}
