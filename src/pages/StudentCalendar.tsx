import { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
  DialogFooter,
} from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';

interface Session {
  id: string;
  title: string;
  session_date: string;
  session_time: string;
  session_type: string;
  status: string;
  content_category: string | null;
  module_name: string | null;
  topics_covered: string | null;
  videos: string | null;
  quiz_content_ppt: string | null;
  facilitator_name: string | null;
  volunteer_name: string | null;
  volunteer_language?: string;
  coordinator_name: string | null;
  meeting_link: string | null;
  centre_id: string | null;
  centre_time_slot_id: string | null;
  class_batch: string | null;
  designation?: string | null;
  designations?: string[] | null;
  centre_name?: string | null;
  centre_location?: string | null;
  slot_day?: string | null;
  slot_start_time?: string | null;
  slot_end_time?: string | null;
  recording_url?: string | null;
  recording_status?: string | null;
  recording_duration?: number | null;
  recording_size?: string | null;
  recording_created_at?: string | null;
  google_event_id?: string | null;
  subject_id?: string | null;
  subject_name?: string | null;
  created_at: string;
  updated_at: string;
  facilitator_email?: string | null;
  volunteer_email?: string | null;
  coordinator_email?: string | null;
  centre_email?: string | null;
}

interface CalendarDay {
  date: Date;
  sessions: Session[];
  isCurrentMonth: boolean;
}

export const parseLocalDate = (dateStr: string | null | undefined): Date | null => {
  if (!dateStr) return null;
  const clean = dateStr.split('T')[0];
  const parts = clean.split('-').map(Number);
  if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
    return new Date(parts[0], parts[1] - 1, parts[2]);
  }
  return new Date(dateStr);
};

export default function StudentCalendar() {
  const { user } = useAuth();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [calendarDays, setCalendarDays] = useState<CalendarDay[]>([]);
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const [studentClass, setStudentClass] = useState<string>('');
  const [sessionsListDate, setSessionsListDate] = useState<Date | null>(null);
  
  const [calendarView, setCalendarView] = useState<'month' | '1-week' | '3-day' | '1-day'>(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      return '3-day';
    }
    return 'month';
  });
  const [selectedActiveDate, setSelectedActiveDate] = useState<Date>(() => new Date());

  useEffect(() => {
    if (user?.id) {
      loadStudentClassAndSessions();
    }
  }, [user?.id]);

  useEffect(() => {
    generateCalendar();
  }, [currentDate, sessions, calendarView]);

  const loadStudentClassAndSessions = async () => {
    try {
      setLoading(true);

      // Get student's class from user_profiles
      const { data: profileData, error: profileError } = await supabase
        .from('user_profiles')
        .select('class_id')
        .eq('id', user?.id)
        .single();

      if (profileError && profileError.code !== 'PGRST116') {
        console.error('Error loading student class:', profileError);
      }

      if (profileData?.class_id) {
        // Get class name
        const { data: classData } = await supabase
          .from('classes')
          .select('name')
          .eq('id', profileData.class_id)
          .single();

        if (classData?.name) {
          setStudentClass(classData.name);
        }

        // Fetch sessions for this class only
        const { data: sessionsData, error: sessionsError } = await supabase
          .from('sessions')
          .select(`
            *,
            coordinators:coordinator_id(name, email),
            centres:centre_id(name, location),
            centre_time_slots:centre_time_slot_id(day, start_time, end_time),
            subjects(name),
            volunteers:volunteer_id(name, personal_email, work_email, remarks)
          `)
          .eq('class_batch', classData?.name)
          .order('session_date', { ascending: true });

        if (sessionsError) throw sessionsError;

        // Fetch facilitators list to match names to emails
        const { data: facilitatorsList } = await supabase
          .from('facilitators')
          .select('name, email');
        
        const facilitatorEmailMap: Record<string, string> = {};
        facilitatorsList?.forEach(f => {
          if (f.name && f.email) {
            facilitatorEmailMap[f.name.trim().toLowerCase()] = f.email;
          }
        });

        // Get student designation if available
        let studentDesignation: string | null = null;
        if (user?.email || profileData?.id) {
          const { data: studentObj } = await supabase
            .from('students')
            .select('designation')
            .or(`email.eq.${user?.email},id.eq.${user?.id}`)
            .maybeSingle();
          if (studentObj?.designation) {
            studentDesignation = studentObj.designation;
          }
        }

        // Transform data to flatten relationships
        const transformedData = (sessionsData || []).map((session: any) => {
          const facNameKey = session.facilitator_name?.trim().toLowerCase();
          const facilitatorEmail = facNameKey ? facilitatorEmailMap[facNameKey] : null;

          let vLang = null;
            if (session.volunteers?.remarks) {
              const m = session.volunteers.remarks.match(/\[LANG:(.*?)\]/);
              if (m) vLang = m[1];
            }

            return {
              ...session,
              volunteer_language: vLang,
            facilitator_email: facilitatorEmail || null,
            volunteer_email: session.volunteers?.personal_email || session.volunteers?.work_email || null,
            coordinator_name: session.coordinators?.name || null,
            coordinator_email: session.coordinators?.email || null,
            centre_name: session.centres?.name || null,
            centre_location: session.centres?.location || null,
            centre_email: null,
            slot_day: session.centre_time_slots?.day || null,
            slot_start_time: session.centre_time_slots?.start_time || null,
            slot_end_time: session.centre_time_slots?.end_time || null,
            subject_name: session.subjects?.name || null,
          };
        });

        // Filter by target designations if session has designations specified
        const filteredByDesignation = (transformedData || []).filter((session: any) => {
          if (
            Array.isArray(session.designations) &&
            session.designations.length > 0 &&
            studentDesignation
          ) {
            const studentDesLower = studentDesignation.toLowerCase();
            return session.designations.some((targetDes: string) => {
              const targetDesLower = targetDes.toLowerCase();
              return studentDesLower === targetDesLower || studentDesLower.includes(targetDesLower) || targetDesLower.includes(studentDesLower);
            });
          }
          return true;
        });

        setSessions(filteredByDesignation || []);
      }
    } catch (error) {
      console.error('Error loading student calendar:', error);
      toast.error('Failed to load your calendar');
    } finally {
      setLoading(false);
    }
  };

  const generateCalendar = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const days: CalendarDay[] = [];

    if (calendarView === 'month') {
      const firstDay = new Date(year, month, 1);
      const lastDay = new Date(year, month + 1, 0);
      const daysInMonth = lastDay.getDate();
      const startingDayOfWeek = firstDay.getDay();

      // Previous month days
      const prevMonthLastDay = new Date(year, month, 0).getDate();
      for (let i = startingDayOfWeek - 1; i >= 0; i--) {
        const date = new Date(year, month - 1, prevMonthLastDay - i);
        days.push({
          date,
          sessions: [],
          isCurrentMonth: false,
        });
      }

      // Current month days
      for (let i = 1; i <= daysInMonth; i++) {
        const date = new Date(year, month, i);
        const dateStr = year + '-' + String(month + 1).padStart(2, '0') + '-' + String(i).padStart(2, '0');
        const daySessions = sessions.filter(s => (s.session_date ? s.session_date.split('T')[0] : '') === dateStr);
        
        days.push({
          date,
          sessions: daySessions,
          isCurrentMonth: true,
        });
      }

      // Next month days
      const remainingDays = 42 - days.length;
      for (let i = 1; i <= remainingDays; i++) {
        const date = new Date(year, month + 1, i);
        days.push({
          date,
          sessions: [],
          isCurrentMonth: false,
        });
      }
    } else if (calendarView === '1-week') {
      const dayOfWeek = currentDate.getDay();
      const startOfWeek = new Date(currentDate);
      startOfWeek.setDate(currentDate.getDate() - dayOfWeek);

      for (let i = 0; i < 7; i++) {
        const date = new Date(startOfWeek);
        date.setDate(startOfWeek.getDate() + i);
        const dateStr = date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
        const daySessions = sessions.filter(s => (s.session_date ? s.session_date.split('T')[0] : '') === dateStr);

        days.push({
          date,
          sessions: daySessions,
          isCurrentMonth: true,
        });
      }
    } else if (calendarView === '3-day') {
      for (let i = 0; i < 3; i++) {
        const date = new Date(currentDate);
        date.setDate(currentDate.getDate() + i);
        const dateStr = date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
        const daySessions = sessions.filter(s => (s.session_date ? s.session_date.split('T')[0] : '') === dateStr);

        days.push({
          date,
          sessions: daySessions,
          isCurrentMonth: true,
        });
      }
    } else if (calendarView === '1-day') {
      const dateStr = currentDate.getFullYear() + '-' + String(currentDate.getMonth() + 1).padStart(2, '0') + '-' + String(currentDate.getDate()).padStart(2, '0');
      const daySessions = sessions.filter(s => (s.session_date ? s.session_date.split('T')[0] : '') === dateStr);

      days.push({
        date: currentDate,
        sessions: daySessions,
        isCurrentMonth: true,
      });
    }

    days.forEach(day => {
      // Sort day sessions by time
      day.sessions.sort((a, b) => a.session_time.localeCompare(b.session_time));
    });

    setCalendarDays(days);
  };

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'available':
        return 'bg-blue-100 text-blue-800';
      case 'committed':
        return 'bg-purple-100 text-purple-800';
      default:
        return 'bg-yellow-100 text-yellow-800';
    }
  };

  const getSessionTypeLabel = (sessionType?: string) => {
    switch (sessionType) {
      case 'guest_teacher': return 'GT';
      case 'guest_speaker': return 'GS';
      case 'local_teacher': return 'LT';
      default: return '';
    }
  };

  const getSessionDisplayTitle = (session: Session) => {
    const typeLabel = getSessionTypeLabel(session.session_type);
    const parts: string[] = [];
    parts.push('WES ' + typeLabel + ' Session');
    if (session.class_batch) parts.push(session.class_batch);
    if (session.volunteer_name) {
      parts.push('by ' + session.volunteer_name);
    }
    if (session.module_name) parts.push(session.module_name);
    if (session.topics_covered) parts.push(session.topics_covered);
    return parts.join(' - ');
  };

  const getSessionTypeColor = (sessionType?: string) => {
    switch (sessionType) {
      case 'guest_teacher': return 'bg-cyan-50 border-l-2 border-l-cyan-500 text-cyan-900';
      case 'guest_speaker': return 'bg-violet-50 border-l-2 border-l-violet-500 text-violet-900';
      case 'local_teacher': return 'bg-pink-50 border-l-2 border-l-pink-500 text-pink-900';
      default: return 'bg-blue-50 border-l-2 border-l-blue-500 text-blue-900';
    }
  };

  const previousPeriod = () => {
    if (calendarView === 'month') {
      setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
    } else if (calendarView === '1-week') {
      const d = new Date(currentDate);
      d.setDate(currentDate.getDate() - 7);
      setCurrentDate(d);
    } else if (calendarView === '3-day') {
      const d = new Date(currentDate);
      d.setDate(currentDate.getDate() - 3);
      setCurrentDate(d);
    } else if (calendarView === '1-day') {
      const d = new Date(currentDate);
      d.setDate(currentDate.getDate() - 1);
      setCurrentDate(d);
    }
  };

  const nextPeriod = () => {
    if (calendarView === 'month') {
      setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
    } else if (calendarView === '1-week') {
      const d = new Date(currentDate);
      d.setDate(currentDate.getDate() + 7);
      setCurrentDate(d);
    } else if (calendarView === '3-day') {
      const d = new Date(currentDate);
      d.setDate(currentDate.getDate() + 3);
      setCurrentDate(d);
    } else if (calendarView === '1-day') {
      const d = new Date(currentDate);
      d.setDate(currentDate.getDate() + 1);
      setCurrentDate(d);
    }
  };

  const getHeaderTitle = () => {
    if (calendarView === 'month') {
      return currentDate.toLocaleString('default', { month: 'long', year: 'numeric' });
    }
    if (calendarView === '1-week') {
      const dayOfWeek = currentDate.getDay();
      const startOfWeek = new Date(currentDate);
      startOfWeek.setDate(currentDate.getDate() - dayOfWeek);
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 6);
      
      const startStr = startOfWeek.toLocaleDateString('default', { day: 'numeric', month: 'short' });
      const endStr = endOfWeek.toLocaleDateString('default', { day: 'numeric', month: 'short', year: 'numeric' });
      return startStr + ' – ' + endStr;
    }
    if (calendarView === '3-day') {
      const endDate = new Date(currentDate);
      endDate.setDate(currentDate.getDate() + 2);
      
      const startStr = currentDate.toLocaleDateString('default', { day: 'numeric', month: 'short' });
      const endStr = endDate.toLocaleDateString('default', { day: 'numeric', month: 'short', year: 'numeric' });
      return startStr + ' – ' + endStr;
    }
    if (calendarView === '1-day') {
      return currentDate.toLocaleDateString('default', { day: 'numeric', month: 'long', year: 'numeric' });
    }
    return '';
  };

  const getGridColsClass = () => {
    if (calendarView === 'month' || calendarView === '1-week') return 'grid-cols-7';
    if (calendarView === '3-day') return 'grid-cols-3';
    if (calendarView === '1-day') return 'grid-cols-1';
    return 'grid-cols-7';
  };

  const renderDayHeaders = () => {
    if (calendarView === 'month' || calendarView === '1-week') {
      const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const selectedDayIndex = selectedActiveDate ? selectedActiveDate.getDay() : -1;
      
      return daysOfWeek.map((day, idx) => (
        <div 
          key={day} 
          className={`text-center font-bold text-[11px] md:text-xs py-2 uppercase tracking-wider ${
            idx === selectedDayIndex ? 'text-primary' : 'text-muted-foreground'
          }`}
        >
          {day}
        </div>
      ));
    }
    
    if (calendarView === '3-day') {
      const headers = [];
      for (let i = 0; i < 3; i++) {
        const d = new Date(currentDate);
        d.setDate(currentDate.getDate() + i);
        const dayStr = d.toLocaleDateString('default', { weekday: 'short', day: 'numeric' });
        headers.push(
          <div key={i} className="text-center font-semibold text-sm text-muted-foreground py-2">
            {dayStr}
          </div>
        );
      }
      return headers;
    }
    
    if (calendarView === '1-day') {
      const dayStr = currentDate.toLocaleDateString('default', { weekday: 'long', day: 'numeric' });
      return (
        <div className="text-center font-semibold text-sm text-muted-foreground py-2">
          {dayStr}
        </div>
      );
    }
    
    return null;
  };

  const isToday = (date: Date) => {
    const today = new Date();
    return date.getDate() === today.getDate() &&
           date.getMonth() === today.getMonth() &&
           date.getFullYear() === today.getFullYear();
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

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-foreground">My Class Calendar</h1>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">
              {studentClass ? `Class: ${studentClass}` : 'Loading your class...'}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6">
          {/* Calendar */}
          <div className="bg-card border border-border rounded-lg p-4 md:p-6">
            {/* Month Navigation & View Selector */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-6 pb-4 border-b">
              <div className="flex items-center gap-3">
                <h2 className="text-lg md:text-xl font-bold">{getHeaderTitle()}</h2>
                <div className="flex gap-1.5">
                  <Button size="icon" variant="outline" className="h-8 w-8" onClick={previousPeriod}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="outline" className="h-8 w-8" onClick={nextPeriod}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                  <Button size="sm" variant="outline" className="h-8 text-xs font-semibold px-2.5" onClick={() => setCurrentDate(new Date())}>
                    Today
                  </Button>
                </div>
              </div>
              <div className="flex bg-muted/60 p-1 rounded-lg border">
                {(['month', '1-week', '3-day', '1-day'] as const).map((view) => (
                  <button
                    key={view}
                    onClick={() => setCalendarView(view)}
                    className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                      calendarView === view
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {view === 'month' ? 'Month' : view === '1-week' ? '1 Week' : view === '3-day' ? '3 Day' : '1 Day'}
                  </button>
                ))}
              </div>
            </div>

            {/* Day Headers */}
            <div className={`grid ${getGridColsClass()} gap-2 mb-2`}>
              {renderDayHeaders()}
            </div>

            {/* Calendar Days */}
            <div className={`grid ${getGridColsClass()} gap-1.5 md:gap-2`}>
              {calendarDays.map((day, idx) => {
                const todayFlag = isToday(day.date);
                const isSelected = selectedActiveDate &&
                  day.date.getDate() === selectedActiveDate.getDate() &&
                  day.date.getMonth() === selectedActiveDate.getMonth() &&
                  day.date.getFullYear() === selectedActiveDate.getFullYear();
                
                // If in Month View, hide previous/next month padding days completely to make current month very clear
                if (calendarView === 'month' && !day.isCurrentMonth) {
                  return (
                    <div key={idx} className="bg-transparent border border-transparent min-h-[56px] md:min-h-[96px]" />
                  );
                }
                  
                return (
                  <div
                    key={idx}
                    onClick={() => {
                      if (calendarView === 'month' ? day.isCurrentMonth : true) {
                        setSelectedActiveDate(day.date);
                      }
                    }}
                    className={`min-h-[56px] md:min-h-[96px] p-1 md:p-2 border rounded-lg cursor-pointer transition-all flex flex-col justify-between ${
                      isSelected
                        ? 'bg-primary/5 border-primary border-2 shadow-sm'
                        : todayFlag
                        ? 'bg-background border-primary/40 hover:bg-accent hover:border-primary'
                        : 'bg-background border-border hover:bg-accent hover:border-primary'
                    }`}
                  >
                    <div className="flex justify-between items-center mb-1">
                      <span
                        className={`text-xs font-bold flex items-center justify-center h-6 w-6 rounded-full transition-all ${
                          isSelected
                            ? 'bg-primary text-primary-foreground font-extrabold shadow-sm scale-110'
                            : todayFlag
                            ? 'border border-primary text-primary font-bold'
                            : 'text-foreground font-semibold'
                        }`}
                      >
                        {day.date.getDate()}
                      </span>
                      {calendarView !== 'month' && (
                        <span className="text-[10px] font-semibold text-muted-foreground uppercase">
                          {day.date.toLocaleDateString('default', { weekday: 'short' })}
                        </span>
                      )}
                    </div>
                    
                    {/* Session Capsules List (Both Mobile & Desktop) */}
                    <div className="space-y-1 mt-1.5 w-full overflow-hidden">
                      {day.sessions.slice(0, 3).map((session, i) => (
                        <button
                          key={i}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedSession(session);
                          }}
                          className={`text-[9px] md:text-[10px] px-1 md:px-1.5 py-0.5 rounded w-full text-left truncate whitespace-nowrap overflow-hidden block border hover:opacity-85 ${getSessionTypeColor(session.session_type)}`}
                          title={session.title || getSessionDisplayTitle(session)}
                        >
                          {session.title || getSessionDisplayTitle(session)}
                        </button>
                      ))}
                      {day.sessions.length > 3 && (
                        <div 
                          className="text-[9px] text-primary font-bold pl-1 mt-0.5 cursor-pointer hover:underline"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedActiveDate(day.date);
                            setSessionsListDate(day.date);
                          }}
                        >
                          +{day.sessions.length - 3} more
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Selected Day's Sessions List (Especially important for mobile) */}
            <div className="mt-6 pt-6 border-t border-border">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-base font-bold text-foreground">
                    Sessions on {selectedActiveDate.toLocaleDateString('default', { weekday: 'long', day: 'numeric', month: 'long' })}
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {(() => {
                      const year = selectedActiveDate.getFullYear();
                      const month = selectedActiveDate.getMonth();
                      const date = selectedActiveDate.getDate();
                      const dayData = calendarDays.find(d => {
                        const dy = d.date.getFullYear();
                        const dm = d.date.getMonth();
                        const dd = d.date.getDate();
                        return dy === year && dm === month && dd === date;
                      });
                      const count = dayData?.sessions.length || 0;
                      return `${count} ${count === 1 ? 'session' : 'sessions'} scheduled`;
                    })()}
                  </p>
                </div>
              </div>

              {/* Sessions List */}
              {(() => {
                const year = selectedActiveDate.getFullYear();
                const month = selectedActiveDate.getMonth();
                const date = selectedActiveDate.getDate();
                const dayData = calendarDays.find(d => {
                  const dy = d.date.getFullYear();
                  const dm = d.date.getMonth();
                  const dd = d.date.getDate();
                  return dy === year && dm === month && dd === date;
                });
                const daySessions = dayData?.sessions || [];

                if (daySessions.length === 0) {
                  return (
                    <div className="bg-muted/30 border border-dashed border-border rounded-xl p-6 text-center">
                      <p className="text-sm text-muted-foreground">No sessions scheduled for this day.</p>
                    </div>
                  );
                }

                return (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {daySessions.map((session, i) => (
                      <div 
                        key={i}
                        onClick={() => setSelectedSession(session)}
                        className="bg-card hover:bg-accent/40 border border-border/60 hover:border-primary/40 rounded-xl p-4 transition-all cursor-pointer shadow-sm flex flex-col justify-between gap-3 group relative overflow-hidden"
                      >
                        {/* Colored border indicator on left */}
                        <div className={`absolute left-0 top-0 bottom-0 w-1 ${
                          session.session_type === 'guest_teacher' ? 'bg-cyan-500' :
                          session.session_type === 'guest_speaker' ? 'bg-violet-500' :
                          session.session_type === 'local_teacher' ? 'bg-pink-500' :
                          'bg-blue-500'
                        }`} />
                        
                        <div className="pl-1">
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                              {session.session_type === 'guest_teacher' ? 'Guest Teacher' :
                               session.session_type === 'guest_speaker' ? 'Guest Speaker' :
                               session.session_type === 'local_teacher' ? 'Local Teacher' :
                               'Regular Session'}
                            </span>
                            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                              session.status === 'completed' ? 'bg-green-50 text-green-700 border border-green-200' :
                              session.status === 'committed' ? 'bg-purple-50 text-purple-700 border border-purple-200' :
                              session.status === 'available' ? 'bg-blue-50 text-blue-700 border border-blue-200' :
                              'bg-amber-50 text-amber-700 border border-amber-200'
                            }`}>
                              {session.status.toUpperCase()}
                            </span>
                          </div>
                          
                          <h4 className="font-bold text-sm text-foreground mt-2 group-hover:text-primary transition-colors line-clamp-2">
                            {session.title || 'Untitled Session'}
                          </h4>
                          
                          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 mt-3 text-xs text-muted-foreground">
                            <div>
                              <span className="font-medium text-foreground block text-[10px] uppercase text-muted-foreground/80">Class</span>
                              {session.class_batch || '-'}
                            </div>
                            <div>
                              <span className="font-medium text-foreground block text-[10px] uppercase text-muted-foreground/80">Volunteer</span>
                              {session.volunteer_name || '-'}
                            </div>
                            {session.facilitator_name && (
                              <div className="col-span-2">
                                <span className="font-medium text-foreground block text-[10px] uppercase text-muted-foreground/80">Facilitator</span>
                                {session.facilitator_name}
                              </div>
                            )}
                            {session.module_name && (
                              <div>
                                <span className="font-medium text-foreground block text-[10px] uppercase text-muted-foreground/80">Module</span>
                                {session.module_name}
                              </div>
                            )}
                            {session.topics_covered && (
                              <div className={session.module_name ? "col-span-1" : "col-span-2"}>
                                <span className="font-medium text-foreground block text-[10px] uppercase text-muted-foreground/80">Topic</span>
                                {session.topics_covered}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
          </div>
        </div>

        {/* Session Details Modal */}
        <Dialog open={!!selectedSession} onOpenChange={(open) => !open && setSelectedSession(null)}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Session Details</DialogTitle>
              <DialogClose />
            </DialogHeader>

            {selectedSession && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Topic & Basic Info */}
                <div className="space-y-3">
                  {selectedSession.session_type && (
                    <div>
                      <p className="text-xs text-muted-foreground">Session Type</p>
                      <p className="font-medium capitalize">
                        {selectedSession.session_type === 'guest_teacher' ? 'Guest Teacher' :
                         selectedSession.session_type === 'guest_speaker' ? 'Guest Speaker' :
                         selectedSession.session_type === 'local_teacher' ? 'Local Teacher' :
                         selectedSession.session_type}
                      </p>
                    </div>
                  )}
                  {selectedSession.content_category && (
                    <div>
                      <p className="text-xs text-muted-foreground">Category</p>
                      <p className="font-medium">{selectedSession.content_category}</p>
                    </div>
                  )}
                  {selectedSession.module_name && (
                    <div>
                      <p className="text-xs text-muted-foreground">Module</p>
                      <p className="font-medium">{selectedSession.module_name}</p>
                    </div>
                  )}
                  {selectedSession.topics_covered && (
                    <div>
                      <p className="text-xs text-muted-foreground">Topic</p>
                      <p className="font-medium">{selectedSession.topics_covered}</p>
                    </div>
                  )}
                  {selectedSession.class_batch && (
                    <div>
                      <p className="text-xs text-muted-foreground">Class</p>
                      <p className="font-medium">{selectedSession.class_batch}</p>
                    </div>
                  )}
                  {((Array.isArray(selectedSession.designations) && selectedSession.designations.length > 0) || selectedSession.designation) && (
                    <div>
                      <p className="text-xs text-muted-foreground">Designation</p>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {Array.isArray(selectedSession.designations) && selectedSession.designations.length > 0 ? (
                          selectedSession.designations.map((d: string) => (
                            <Badge key={d} variant="outline" className="text-xs bg-purple-50 text-purple-700 border-purple-200 font-semibold">
                              {d}
                            </Badge>
                          ))
                        ) : (
                          <Badge variant="outline" className="text-xs bg-purple-50 text-purple-700 border-purple-200 font-semibold">
                            {selectedSession.designation}
                          </Badge>
                        )}
                      </div>
                    </div>
                  )}
                  <div>
                    <p className="text-xs text-muted-foreground">Title</p>
                    <p className="font-medium">{getSessionDisplayTitle(selectedSession)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Date</p>
                    <p className="font-medium">{parseLocalDate(selectedSession.session_date)?.toLocaleDateString() || selectedSession.session_date}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Time</p>
                    <p className="font-medium">{selectedSession.session_time.split(':').slice(0, 2).join(':')}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Status</p>
                    <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold capitalize ${
                      selectedSession.status === 'completed' ? 'bg-green-100 text-green-800' :
                      selectedSession.status === 'available' ? 'bg-blue-100 text-blue-800' :
                      selectedSession.status === 'committed' ? 'bg-purple-100 text-purple-800' :
                      'bg-yellow-100 text-yellow-800'
                    }`}>
                      {selectedSession.status}
                    </span>
                  </div>
                  {selectedSession.quiz_content_ppt && (
                    <div>
                      <p className="text-xs text-muted-foreground">Quiz/Content PPT</p>
                      {(() => {
                        const url = selectedSession.quiz_content_ppt.trim();
                        const isLink = url.startsWith('http://') || url.startsWith('https://') || url.includes('.com') || url.includes('.org') || url.includes('.net') || url.includes('drive.google.com') || url.includes('docs.google.com');
                        let resolvedUrl = url;
                        if (isLink && !url.startsWith('http://') && !url.startsWith('https://')) {
                          resolvedUrl = `https://${url}`;
                        }
                        return isLink ? (
                          <a
                            href={resolvedUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:text-blue-800 hover:underline font-medium text-sm break-all flex items-center gap-1"
                          >
                            Open Quiz/Content Link
                          </a>
                        ) : (
                          <p className="font-medium text-sm break-all">{url}</p>
                        );
                      })()}
                      <p className="text-xs text-muted-foreground mt-0.5 font-normal">shared by guest / local teacher</p>
                    </div>
                  )}
                </div>

                {/* Participants & Details */}
                <div className="space-y-3">
                  {selectedSession.meeting_link && (
                    <div className="bg-indigo-50 border border-indigo-200 rounded p-3 mb-2">
                      <h4 className="font-semibold text-sm text-indigo-900 mb-1">🔗 Google Meet Link</h4>
                      <a 
                        href={selectedSession.meeting_link} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-indigo-600 hover:text-indigo-800 hover:underline font-medium text-sm break-all"
                      >
                        {selectedSession.meeting_link}
                      </a>
                    </div>
                  )}

                  <h4 className="font-semibold text-sm">Participants & Meeting Invites</h4>
                  
                  {selectedSession.facilitator_name && (
                    <div className="bg-blue-50 border border-blue-200 rounded p-3">
                      <p className="text-xs text-muted-foreground">👤 Facilitator</p>
                      <p className="font-medium text-sm">{selectedSession.facilitator_name}</p>
                    </div>
                  )}
                  
                  {selectedSession.volunteer_name && (
                      <div className="bg-purple-50 border border-purple-200 rounded p-3">
                        <p className="text-xs text-muted-foreground">👤 Volunteer</p>
                        <p className="font-medium text-sm">{selectedSession.volunteer_name}</p>
                        {selectedSession.volunteer_language && (
                          <div className="mt-2 inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold bg-white text-purple-800 border-purple-200">
                            Language: {selectedSession.volunteer_language}
                          </div>
                        )}
                      </div>
                    )}
                  
                  {selectedSession.coordinator_name && (
                    <div className="bg-green-50 border border-green-200 rounded p-3">
                      <p className="text-xs text-muted-foreground">📋 Coordinator</p>
                      <p className="font-medium text-sm">{selectedSession.coordinator_name}</p>
                    </div>
                  )}

                  {selectedSession.centre_name && (
                    <div className="bg-orange-50 border border-orange-200 rounded p-3">
                      <p className="text-xs text-muted-foreground">📍 Centre</p>
                      <p className="font-medium text-sm">{selectedSession.centre_name}</p>
                      {selectedSession.centre_location && (
                        <p className="text-xs text-muted-foreground">{selectedSession.centre_location}</p>
                      )}
                    </div>
                  )}

                  {selectedSession.slot_start_time && selectedSession.slot_end_time && (
                    <div className="bg-indigo-50 border border-indigo-200 rounded p-3">
                      <p className="text-xs text-muted-foreground">⏰ Time Slot</p>
                      <p className="font-medium text-sm">{selectedSession.slot_start_time.split(':').slice(0, 2).join(':')} - {selectedSession.slot_end_time.split(':').slice(0, 2).join(':')}</p>
                    </div>
                  )}

                  {selectedSession.meeting_link && (
                    <div className="bg-cyan-50 border border-cyan-200 rounded p-3">
                      <p className="text-xs text-muted-foreground">🔗 Meeting Link</p>
                      {(() => {
                        let url = selectedSession.meeting_link;
                        if (url && url.includes('_meet/whoops')) {
                          url = url.replace('/_meet/whoops', '');
                        }
                        if (url && !url.startsWith('http://') && !url.startsWith('https://')) {
                          url = `https://${url}`;
                        }
                        return (
                          <>
                            <a
                              href={url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-cyan-600 hover:text-cyan-800 hover:underline text-sm font-medium break-all"
                            >
                              Join Meeting
                            </a>
                            <p className="text-xs text-muted-foreground mt-1 break-all">{url}</p>
                          </>
                        );
                      })()}
                    </div>
                  )}
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Sessions on Date Dialog */}
        <Dialog open={!!sessionsListDate} onOpenChange={(open) => !open && setSessionsListDate(null)}>
          <DialogContent className="max-w-md max-h-[85vh] flex flex-col p-6">
            <DialogHeader>
              <DialogTitle className="text-lg font-bold flex items-center gap-2">
                <CalendarDays className="h-5 w-5 text-primary" />
                Sessions on {sessionsListDate?.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
              </DialogTitle>
            </DialogHeader>

            <div className="flex-grow overflow-y-auto mt-4 space-y-3">
              {sessionsListDate && (() => {
                const dateKey = sessionsListDate.toDateString();
                const daySessions = calendarDays.find(d => d.date.toDateString() === dateKey)?.sessions || [];
                
                return daySessions.map((session, i) => (
                  <div 
                    key={i} 
                    onClick={() => {
                      setSelectedSession(session);
                      setSessionsListDate(null);
                    }}
                    className="p-3 border border-border/60 rounded-xl cursor-pointer hover:bg-muted/40 transition-colors flex flex-col gap-1.5"
                  >
                    <div className="flex justify-between items-start gap-2">
                      <span className="font-bold text-sm text-foreground hover:text-primary transition-colors line-clamp-2">
                        {session.title || getSessionDisplayTitle(session)}
                      </span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold capitalize whitespace-nowrap ${getSessionTypeColor(session.session_type)}`}>
                        {session.session_type === 'guest_teacher' ? 'Guest Teacher' :
                         session.session_type === 'guest_speaker' ? 'Guest Speaker' :
                         session.session_type === 'local_teacher' ? 'Local Teacher' :
                         session.session_type}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground mt-0.5">
                      <span className="flex items-center gap-1 font-medium">
                        ⏰ {session.session_time.split(':').slice(0, 2).join(':')}
                      </span>
                      {session.class_batch && (
                        <span className="font-medium bg-muted px-1.5 py-0.5 rounded text-[10px]">
                          {session.class_batch}
                        </span>
                      )}
                    </div>
                  </div>
                ));
              })()}
            </div>
            
            <DialogFooter className="mt-4">
              <Button onClick={() => setSessionsListDate(null)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
