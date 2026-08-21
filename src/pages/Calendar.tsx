import { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Plus, CalendarDays } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
  DialogFooter,
} from '@/components/ui/dialog';
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
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { AddSessionDialog } from '@/components/sessions/AddSessionDialog';
import { EditSessionDialog } from '@/components/sessions/EditSessionDialog';
import { SessionTypeDialog } from '@/components/sessions/SessionTypeDialog';
import { Badge } from '@/components/ui/badge';

interface Facilitator {
  id: string;
  name: string;
  email?: string;
}

interface Class {
  id: string;
  name: string;
}

interface Subject {
  id: string;
  name: string;
}

interface Session {
  id: string;
  title: string;
  content_category?: string;
  module_name?: string;
  modules?: string;
  s_no?: number;
  topics_covered?: string;
  status: string;
  session_date: string;
  session_time: string;
  session_type?: string;
  facilitator_name?: string;
  facilitator_email?: string;
  volunteer_name?: string;
  volunteer_email?: string;
  coordinator_name?: string;
  coordinator_email?: string;
  videos?: string;
  quiz_content_ppt?: string;
  final_content_ppt?: string;
  meeting_link?: string;
  centre_id?: string;
  centre_time_slot_id?: string;
  centre_name?: string;
  centre_location?: string;
  centre_email?: string;
  slot_day?: string;
  slot_start_time?: string;
  slot_end_time?: string;
  class_batch?: string;
  designation?: string;
  designations?: string[];
  subject_id?: string;
  subject_name?: string;
}

interface CalendarDay {
  date: Date;
  sessions: Session[];
  isCurrentMonth: boolean;
}

export default function Calendar() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [sessions, setSessions] = useState<Session[]>([]);
  const [facilitators, setFacilitators] = useState<Facilitator[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [selectedFacilitator, setSelectedFacilitator] = useState<string>('all');
  const [selectedClass, setSelectedClass] = useState<string>('all');
  const [selectedDesignation, setSelectedDesignation] = useState<string>('all');
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [selectedSubject, setSelectedSubject] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [calendarDays, setCalendarDays] = useState<CalendarDay[]>([]);
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const [isSessionTypeOpen, setIsSessionTypeOpen] = useState(false);
  const [isAddSessionOpen, setIsAddSessionOpen] = useState(false);
  const [isEditSessionOpen, setIsEditSessionOpen] = useState(false);
  const [selectedSessionType, setSelectedSessionType] = useState<'guest_teacher' | 'guest_speaker' | 'local_teacher' | null>(null);
  const [selectedDateForNewSession, setSelectedDateForNewSession] = useState<Date | null>(null);
  const [expandedDateKey, setExpandedDateKey] = useState<string | null>(null);
  const [sessionsListDate, setSessionsListDate] = useState<Date | null>(null);
  const [sessionTypeFilter, setSessionTypeFilter] = useState<string>('all');
  const [userRole, setUserRole] = useState<number | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [calendarView, setCalendarView] = useState<'month' | '1-week' | '3-day' | '1-day'>(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      return '3-day';
    }
    return 'month';
  });
  const [selectedActiveDate, setSelectedActiveDate] = useState<Date>(() => new Date());

  useEffect(() => {
    if (user?.id) {
      loadUserRoleAndClass();
      fetchFacilitators();
      fetchClasses();
      fetchSubjects();
      fetchSessions();
    }
  }, [user?.id]);

  const loadUserRoleAndClass = async () => {
    try {
      // Get user role and class info
      const { data: profileData, error: profileError } = await supabase
        .from('user_profiles')
        .select('role_id, class_id, full_name')
        .eq('id', user?.id)
        .single();

      if (profileError && profileError.code !== 'PGRST116') {
        console.error('Error loading user role:', profileError);
      }

      if (profileData?.role_id) {
        setUserRole(profileData.role_id);

        // If student (role_id = 5) and has class_id, fetch and set their class
        if (profileData.role_id === 5 && profileData.class_id) {
          const { data: classData } = await supabase
            .from('classes')
            .select('name')
            .eq('id', profileData.class_id)
            .single();
          
          if (classData?.name) {
            setSelectedClass(classData.name);
          }
        }

        // If facilitator (role_id = 4), automatically select their name
        if (profileData.role_id === 4 && profileData.full_name) {
          setSelectedFacilitator(profileData.full_name);
        }
      }
    } catch (error) {
      console.error('Error loading user info:', error);
    }
  };

  useEffect(() => {
    generateCalendar();
  }, [currentDate, sessions, selectedFacilitator, selectedClass, sessionTypeFilter, selectedSubject, selectedDesignation, calendarView]);

  const fetchFacilitators = async () => {
    try {
      const { data, error } = await supabase
        .from('facilitators')
        .select('id, name')
        .eq('status', 'active')
        .order('name', { ascending: true });

      if (error) throw error;
      setFacilitators(data || []);
    } catch (error) {
      console.error('Error fetching facilitators:', error);
      toast.error('Failed to load facilitators');
    }
  };

  const fetchClasses = async () => {
    try {
      const { data, error } = await supabase
        .from('classes')
        .select('id, name')
        .order('name', { ascending: true });

      if (error) throw error;
      setClasses(data || []);
    } catch (error) {
      console.error('Error fetching classes:', error);
      toast.error('Failed to load classes');
    }
  };

  const fetchSubjects = async () => {
    try {
      const { data, error } = await supabase
        .from('subjects')
        .select('id, name')
        .order('name', { ascending: true });

      if (error) throw error;
      setSubjects(data || []);
    } catch (error) {
      console.error('Error fetching subjects:', error);
      toast.error('Failed to load subjects');
    }
  };

  const fetchSessions = async () => {
    try {
      const { data, error } = await supabase
        .from('sessions')
        .select(`
          *,
          coordinators:coordinator_id(name, email),
          centres:centre_id(name, location, email),
          centre_time_slots:centre_time_slot_id(day, start_time, end_time),
          subjects(name),
          volunteers:volunteer_id(name, personal_email, work_email)
        `)
        .order('session_date', { ascending: true });

      if (error) throw error;

      // Fetch facilitators list to match names/IDs to emails
      const { data: facilitatorsList } = await supabase
        .from('facilitators')
        .select('id, name, email');
      
      const facilitatorEmailMap: Record<string, string> = {};
      const facilitatorIdEmailMap: Record<string, string> = {};
      facilitatorsList?.forEach(f => {
        if (f.name && f.email) {
          facilitatorEmailMap[f.name.trim().toLowerCase()] = f.email;
        }
        if (f.id && f.email) {
          facilitatorIdEmailMap[f.id] = f.email;
        }
      });
      
      // Transform data without making individual queries for emails
      const transformedData = (data || []).map((session: any) => {
        const facNameKey = session.facilitator_name?.trim().toLowerCase();
        const facilitatorEmail = session.guest_teacher_id
          ? facilitatorIdEmailMap[session.guest_teacher_id]
          : (facNameKey ? facilitatorEmailMap[facNameKey] : null);

        return {
          ...session,
          facilitator_email: facilitatorEmail || null,
          volunteer_email: session.volunteers?.personal_email || session.volunteers?.work_email || null,
          coordinator_name: session.coordinators?.name || null,
          coordinator_email: session.coordinators?.email || null,
          centre_name: session.centres?.name || null,
          centre_location: session.centres?.location || null,
          centre_email: session.centres?.email || null,
          slot_day: session.centre_time_slots?.day || null,
          slot_start_time: session.centre_time_slots?.start_time || null,
          slot_end_time: session.centre_time_slots?.end_time || null,
          subject_name: session.subjects?.name || null,
        };
      });
      
      setSessions(transformedData || []);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching sessions:', error);
      toast.error('Failed to load sessions');
      setLoading(false);
    }
  };

  const generateCalendar = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    
    // Filter sessions based on selected facilitator and class
    let filteredSessions = sessions;
    
    if (selectedFacilitator !== 'all') {
      filteredSessions = filteredSessions.filter(s => s.facilitator_name === selectedFacilitator);
    }
    
    if (selectedClass !== 'all') {
      filteredSessions = filteredSessions.filter(s => s.class_batch === selectedClass);
    }

    if (sessionTypeFilter !== 'all') {
      filteredSessions = filteredSessions.filter(s => s.session_type === sessionTypeFilter);
    }

    if (selectedSubject !== 'all') {
      filteredSessions = filteredSessions.filter(s => s.subject_name === selectedSubject);
    }

    if (selectedDesignation !== 'all') {
      filteredSessions = filteredSessions.filter(s => {
        if (!s.designations || s.designations.length === 0) return true;
        return s.designations.includes(selectedDesignation);
      });
    }

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
        // Format date as YYYY-MM-DD without timezone conversion
        const dateStr = year + '-' + String(month + 1).padStart(2, '0') + '-' + String(i).padStart(2, '0');
        const daySessions = filteredSessions.filter(s => s.session_date === dateStr);
        
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
      // 1-week view starting from the start of the week of currentDate
      const dayOfWeek = currentDate.getDay();
      const startOfWeek = new Date(currentDate);
      startOfWeek.setDate(currentDate.getDate() - dayOfWeek);

      for (let i = 0; i < 7; i++) {
        const date = new Date(startOfWeek);
        date.setDate(startOfWeek.getDate() + i);
        const dateStr = date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
        const daySessions = filteredSessions.filter(s => s.session_date === dateStr);

        days.push({
          date,
          sessions: daySessions,
          isCurrentMonth: true,
        });
      }
    } else if (calendarView === '3-day') {
      // 3-day view starting from currentDate
      for (let i = 0; i < 3; i++) {
        const date = new Date(currentDate);
        date.setDate(currentDate.getDate() + i);
        const dateStr = date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
        const daySessions = filteredSessions.filter(s => s.session_date === dateStr);

        days.push({
          date,
          sessions: daySessions,
          isCurrentMonth: true,
        });
      }
    } else if (calendarView === '1-day') {
      // 1-day view for currentDate
      const dateStr = currentDate.getFullYear() + '-' + String(currentDate.getMonth() + 1).padStart(2, '0') + '-' + String(currentDate.getDate()).padStart(2, '0');
      const daySessions = filteredSessions.filter(s => s.session_date === dateStr);

      days.push({
        date: currentDate,
        sessions: daySessions,
        isCurrentMonth: true,
      });
    }

    setCalendarDays(days);
  };

  const handleCancelSession = async (sessionId: string) => {
    if (!confirm('Are you sure you want to cancel this session? The status will be changed to cancelled.')) {
      return;
    }

    try {
      // Try to remove from Google Calendar first
      try {
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
        
        const response = await fetch(supabaseUrl + '/functions/v1/sync-google-calendar', {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + supabaseAnonKey,
          },
          body: JSON.stringify({ sessionId }),
        });

        if (!response.ok) {
          console.warn('Could not remove from Google Calendar:', await response.text());
        }
      } catch (calendarError) {
        console.warn('Could not remove from Google Calendar:', calendarError);
      }

      // Update status to cancelled instead of deleting
      const { error } = await supabase
        .from('sessions')
        .update({ status: 'cancelled' })
        .eq('id', sessionId);

      if (error) throw error;

      toast.success('Session status changed to cancelled');
      setSelectedSession(null);
      fetchSessions();
    } catch (error) {
      console.error('Error cancelling session:', error);
      toast.error('Failed to cancel session');
    }
  };

  const handleDeleteSession = async (sessionId: string) => {
    try {
      // Try to remove from Google Calendar first
      try {
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
        
        const response = await fetch(supabaseUrl + '/functions/v1/sync-google-calendar', {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + supabaseAnonKey,
          },
          body: JSON.stringify({ sessionId }),
        });

        if (!response.ok) {
          console.warn('Could not remove from Google Calendar:', await response.text());
        }
      } catch (calendarError) {
        console.warn('Could not remove from Google Calendar:', calendarError);
      }

      // Actually delete the session from database
      const { error } = await supabase
        .from('sessions')
        .delete()
        .eq('id', sessionId);

      if (error) throw error;

      toast.success('Session deleted successfully');
      setSelectedSession(null);
      fetchSessions();
    } catch (error) {
      console.error('Error deleting session:', error);
      toast.error('Failed to delete session');
    } finally {
      setDeleteDialogOpen(false);
      setDeleteConfirmText('');
    }
  };

  const handleModifySession = (session: Session) => {
    // Open the edit dialog
    setSelectedSession(session);
    setIsEditSessionOpen(true);
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
    // Format: "WES GT Session - Class - by Volunteer - Module - Topic"
    const typeLabel = getSessionTypeLabel(session.session_type);
    const parts: string[] = [];
    parts.push('WES ' + typeLabel + ' Session');
    if (session.class_batch) parts.push(session.class_batch);
    if (session.volunteer_name) {
      parts.push('by ' + session.volunteer_name);
    }
    if (session.modules) parts.push(session.modules);
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

  const getSessionTypeDotColor = (sessionType?: string) => {
    switch (sessionType) {
      case 'guest_teacher': return 'bg-cyan-500';
      case 'guest_speaker': return 'bg-violet-500';
      case 'local_teacher': return 'bg-pink-500';
      default: return 'bg-blue-500';
    }
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

  const handleDateClick = (date: Date) => {
    setSelectedDateForNewSession(date);
    setIsAddSessionOpen(true);
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
            <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-foreground">Session Calendar</h1>
            <p className="hidden sm:block text-sm md:text-base text-muted-foreground mt-1 font-normal">Plan and track session progress</p>
          </div>
          {userRole !== 5 && (
            <Button
              onClick={() => setIsSessionTypeOpen(true)}
              size="sm"
              className="shrink-0 gap-1 px-3 h-8 text-xs font-semibold"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Add</span>
            </Button>
          )}
        </div>

        <div className="grid grid-cols-1 gap-6">
          {/* Calendar */}
          <div className="bg-card border border-border rounded-lg p-4 md:p-6">
            {/* Volunteer and Class Filters - Only show for non-students */}
            {userRole !== 5 && (
              <div className="border-b border-border/80 pb-4 mb-6">
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3 md:gap-4">
                  {/* Facilitator Filter */}
                  <div>
                    <label className="text-[10px] md:text-xs font-semibold text-muted-foreground uppercase block mb-1.5">
                      Facilitator
                    </label>
                    <Select value={selectedFacilitator} onValueChange={setSelectedFacilitator}>
                      <SelectTrigger className="w-full h-8 md:h-9 text-xs">
                        <SelectValue placeholder="All Facilitators" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Facilitators</SelectItem>
                        {facilitators.map((facilitator) => (
                          <SelectItem key={facilitator.id} value={facilitator.name}>
                            {facilitator.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Class Filter */}
                  <div>
                    <label className="text-[10px] md:text-xs font-semibold text-muted-foreground uppercase block mb-1.5">
                      Class
                    </label>
                    <Select value={selectedClass} onValueChange={setSelectedClass}>
                      <SelectTrigger className="w-full h-8 md:h-9 text-xs">
                        <SelectValue placeholder="All Classes" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Classes</SelectItem>
                        {classes.map((cls) => (
                          <SelectItem key={cls.id} value={cls.name}>
                            {cls.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Designation Filter */}
                  {(selectedClass === 'all' || selectedClass === 'CCC EMP Fellow') && (
                    <div>
                      <label className="text-[10px] md:text-xs font-semibold text-muted-foreground uppercase block mb-1.5">
                        Designation
                      </label>
                      <Select value={selectedDesignation} onValueChange={setSelectedDesignation}>
                        <SelectTrigger className="w-full h-8 md:h-9 text-xs">
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
                  )}

                  {/* Session Type Filter */}
                  <div>
                    <label className="text-[10px] md:text-xs font-semibold text-muted-foreground uppercase block mb-1.5">
                      Type
                    </label>
                    <Select value={sessionTypeFilter} onValueChange={setSessionTypeFilter}>
                      <SelectTrigger className="w-full h-8 md:h-9 text-xs">
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

                  {/* Subject Filter */}
                  <div>
                    <label className="text-[10px] md:text-xs font-semibold text-muted-foreground uppercase block mb-1.5">
                      Subject
                    </label>
                    <Select value={selectedSubject} onValueChange={setSelectedSubject}>
                      <SelectTrigger className="w-full h-8 md:h-9 text-xs">
                        <SelectValue placeholder="All Subjects" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Subjects</SelectItem>
                        {subjects.map((subject) => (
                          <SelectItem key={subject.id} value={subject.name}>
                            {subject.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            )}

            {/* Student Class Display */}
            {userRole === 5 && (
              <div className="bg-blue-50/50 border border-blue-100 rounded-lg p-3 text-xs text-blue-800 mb-6 flex justify-between items-center">
                <span><strong>Your Class:</strong> {selectedClass !== 'all' ? selectedClass : 'Loading...'}</span>
                <span className="text-[10px] text-blue-700/80">Showing sessions for your class only</span>
              </div>
            )}
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
                {userRole !== 5 && (
                  <Button 
                    size="sm" 
                    variant="outline" 
                    className="h-8 text-xs font-semibold gap-1.5"
                    onClick={() => {
                      setSelectedDateForNewSession(selectedActiveDate);
                      setIsAddSessionOpen(true);
                    }}
                  >
                    + Add Session
                  </Button>
                )}
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
                              <div>{session.class_batch || '-'}</div>
                              {((Array.isArray(session.designations) && session.designations.length > 0) || session.designation) && (
                                <div className="flex flex-wrap gap-1 mt-0.5">
                                  {Array.isArray(session.designations) && session.designations.length > 0 ? (
                                    session.designations.map(d => (
                                      <Badge key={d} variant="outline" className="text-[9px] px-1 py-0 bg-purple-50 text-purple-700 border-purple-200">
                                        {d}
                                      </Badge>
                                    ))
                                  ) : (
                                    <Badge variant="outline" className="text-[9px] px-1 py-0 bg-purple-50 text-purple-700 border-purple-200">
                                      {session.designation}
                                    </Badge>
                                  )}
                                </div>
                              )}
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
                            {session.modules && (
                              <div>
                                <span className="font-medium text-foreground block text-[10px] uppercase text-muted-foreground/80">Module</span>
                                {session.modules}
                              </div>
                            )}
                            {session.topics_covered && (
                              <div className={session.modules ? "col-span-1" : "col-span-2"}>
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

            {/* Mobile Floating Action Button (FAB) */}
            {userRole !== 5 && (
              <div className="fixed bottom-6 right-6 md:hidden z-50">
                <Button
                  size="icon"
                  className="h-14 w-14 rounded-full shadow-lg bg-primary hover:bg-primary/90 text-primary-foreground flex items-center justify-center border-none"
                  onClick={() => {
                    setSelectedDateForNewSession(selectedActiveDate);
                    setIsAddSessionOpen(true);
                  }}
                >
                  <Plus className="h-6 w-6" />
                </Button>
              </div>
            )}
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
                    <p className="font-medium">{new Date(selectedSession.session_date).toLocaleDateString()}</p>
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
                      {selectedSession.facilitator_email && (
                        <a href={`mailto:${selectedSession.facilitator_email}`} className="block text-xs text-blue-600 mt-1 hover:underline">📧 {selectedSession.facilitator_email}</a>
                      )}
                    </div>
                  )}
                  
                  {selectedSession.volunteer_name && (
                    <div className="bg-purple-50 border border-purple-200 rounded p-3">
                      <p className="text-xs text-muted-foreground">👥 Volunteer</p>
                      <p className="font-medium text-sm">{selectedSession.volunteer_name}</p>
                      {selectedSession.volunteer_email && (
                        <a href={`mailto:${selectedSession.volunteer_email}`} className="block text-xs text-purple-600 mt-1 hover:underline">📧 {selectedSession.volunteer_email}</a>
                      )}
                    </div>
                  )}
                  
                  {selectedSession.coordinator_name && (
                    <div className="bg-green-50 border border-green-200 rounded p-3">
                      <p className="text-xs text-muted-foreground">📋 Coordinator</p>
                      <p className="font-medium text-sm">{selectedSession.coordinator_name}</p>
                      {selectedSession.coordinator_email && (
                        <a href={`mailto:${selectedSession.coordinator_email}`} className="block text-xs text-green-600 mt-1 hover:underline">📧 {selectedSession.coordinator_email}</a>
                      )}
                    </div>
                  )}

                  {selectedSession.centre_name && (
                    <div className="bg-orange-50 border border-orange-200 rounded p-3">
                      <p className="text-xs text-muted-foreground">📍 Centre</p>
                      <p className="font-medium text-sm">{selectedSession.centre_name}</p>
                      {selectedSession.centre_location && (
                        <p className="text-xs text-muted-foreground">{selectedSession.centre_location}</p>
                      )}
                      {selectedSession.centre_email && (
                        <p className="text-xs text-orange-600 mt-1">📧 {selectedSession.centre_email}</p>
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
                        // Fix malformed Google Meet URLs
                        if (url && url.includes('_meet/whoops')) {
                          // Extract meeting code if embedded, or show raw link
                          url = url.replace('/_meet/whoops', '');
                        }
                        // Ensure URL has protocol
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

            {/* Action Buttons */}
            {selectedSession && (
              <div className="border-t border-border pt-4 mt-4 space-y-3">
                <div className="bg-blue-50 border border-blue-200 rounded p-3 text-sm text-blue-800">
                  ℹ️ Calendar invitations have been sent to the volunteer and facilitator. They will receive email notifications from Google Calendar.
                </div>
                
                <div className="flex gap-2 flex-wrap">
                  <button
                    onClick={() => navigate(`/sessions/${selectedSession.id}/recording`)}
                    className="flex-1 min-w-[120px] px-4 py-2 bg-green-600 border border-green-700 text-white rounded hover:bg-green-700 transition-colors text-sm font-medium"
                  >
                    Record Feedback
                  </button>
                  <button
                    onClick={() => handleCancelSession(selectedSession.id)}
                    className="flex-1 min-w-[120px] px-4 py-2 bg-yellow-50 border border-yellow-200 text-yellow-700 rounded hover:bg-yellow-100 transition-colors text-sm font-medium"
                  >
                    Cancel Session
                  </button>
                  <button
                    onClick={() => setDeleteDialogOpen(true)}
                    className="flex-1 min-w-[120px] px-4 py-2 bg-red-50 border border-red-200 text-red-700 rounded hover:bg-red-100 transition-colors text-sm font-medium"
                  >
                    Delete Session
                  </button>
                  <button
                    onClick={() => handleModifySession(selectedSession)}
                    className="flex-1 min-w-[120px] px-4 py-2 bg-blue-50 border border-blue-200 text-blue-700 rounded hover:bg-blue-100 transition-colors text-sm font-medium"
                  >
                    Modify Session
                  </button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Add Session Dialog */}
        <AddSessionDialog
          open={isAddSessionOpen}
          onOpenChange={setIsAddSessionOpen}
          selectedDate={selectedDateForNewSession}
          sessionType={selectedSessionType || 'guest_teacher'}
          onSuccess={() => {
            fetchSessions();
            setSelectedDateForNewSession(null);
          }}
        />

        {/* Edit Session Dialog */}
        <EditSessionDialog
          open={isEditSessionOpen}
          onOpenChange={setIsEditSessionOpen}
          session={selectedSession}
          onSuccess={() => {
            fetchSessions();
            setSelectedSession(null);
          }}
        />

        {/* Session Type Dialog */}
        <SessionTypeDialog
          open={isSessionTypeOpen}
          onOpenChange={setIsSessionTypeOpen}
          onSelectType={(type) => {
            setSelectedSessionType(type);
            setIsSessionTypeOpen(false);
            setIsAddSessionOpen(true);
          }}
        />
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={(open) => {
        setDeleteDialogOpen(open);
        if (!open) {
          setDeleteConfirmText('');
        }
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Session</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  Are you sure you want to permanently delete this session? This will remove it from Google Calendar and send cancellation emails to all participants. This action cannot be undone.
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
              onClick={() => selectedSession && handleDeleteSession(selectedSession.id)}
              disabled={deleteConfirmText !== 'DELETE'}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
              const daySessions = sessions.filter(s => new Date(s.session_date).toDateString() === dateKey);
              
              return daySessions.map((session) => (
                <div 
                  key={session.id} 
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
    </DashboardLayout>
  );
}
