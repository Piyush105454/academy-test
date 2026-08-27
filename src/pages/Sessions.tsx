import { useState, useEffect, useMemo } from 'react';
import { Plus, Trash2, Upload, MoreVertical, GraduationCap, FileText, Edit, Film, Search, X, ExternalLink, Lock, Unlock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { logActivity } from '@/utils/activityLogger';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { TruncatedText } from '@/components/ui/truncated-text';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { useAcademicYear } from '@/contexts/AcademicYearContext';
import { SessionTypeDialog } from '@/components/sessions/SessionTypeDialog';
import { AddSessionDialog } from '@/components/sessions/AddSessionDialog';
import { ImportSessionsDialog } from '@/components/sessions/ImportSessionsDialog';
import { UpdateRecordingDialog } from '@/components/sessions/UpdateRecordingDialog';
import { EditSessionDialog } from '@/components/sessions/EditSessionDialog';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import { attachSessionIdCodes } from '@/utils/sessionIdGenerator';

interface Session {
  id: string;
  session_id_code?: string;
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
  coordinator_name: string | null;
  meeting_link: string | null;
  centre_id: string | null;
  centre_time_slot_id: string | null;
  class_batch: string | null;
  centre_name?: string | null;
  centre_location?: string | null;
  centre_email?: string | null;
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
  feedback_unlocked?: boolean;
}

const getLocalDateString = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export default function Sessions() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [userRole, setUserRole] = useState<number | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);

  useEffect(() => {
    if (user?.id) {
      supabase
        .from('user_profiles')
        .select('role_id')
        .eq('id', user.id)
        .single()
        .then(({ data }) => {
          if (data?.role_id) {
            setUserRole(data.role_id);
          }
        });
    }
  }, [user?.id]);
  const [loading, setLoading] = useState(true);
  const [isTypeDialogOpen, setIsTypeDialogOpen] = useState(false);
  const [isFormDialogOpen, setIsFormDialogOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [updateRecordingDialogOpen, setUpdateRecordingDialogOpen] = useState(false);
  const [editSessionDialogOpen, setEditSessionDialogOpen] = useState(false);
  const [selectedSessionType, setSelectedSessionType] = useState<'guest_teacher' | 'guest_speaker' | 'local_teacher' | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [newStatus, setNewStatus] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [timeFilter, setTimeFilter] = useState<string | null>(null);
  const [volunteerFilter, setVolunteerFilter] = useState<string | null>(null);
  const [facilitatorFilter, setFacilitatorFilter] = useState<string | null>(null);
  const [coordinatorFilter, setCoordinatorFilter] = useState<string | null>(null);
  const [categorySort, setCategorySort] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [dateFromFilter, setDateFromFilter] = useState<string>('');
  const [dateToFilter, setDateToFilter] = useState<string>('');
  const [sessionTypeFilter, setSessionTypeFilter] = useState<string | null>(null);
  const [subjectFilter, setSubjectFilter] = useState<string | null>(null);
  const [sortColumn, setSortColumn] = useState<keyof Session | null>('session_date');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc' | null>('asc');
  const { selectedYear, getDateRange } = useAcademicYear();
  const todayStr = useMemo(() => getLocalDateString(new Date()), []);
  const tomorrowStr = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return getLocalDateString(d);
  }, []);

  useEffect(() => {
    fetchSessions();
    
    // Subscribe to real-time updates on sessions table using the new API
    const subscription = supabase
      .channel('sessions-updates')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'sessions',
        },
        (payload) => {
          // Update the specific session in state with new data
          setSessions(prev => 
            prev.map(s => s.id === payload.new.id ? {
              ...s,
              ...payload.new,
              // Preserve transformed fields if they exist
              coordinator_name: s.coordinator_name,
              centre_name: s.centre_name,
              centre_location: s.centre_location,
              slot_day: s.slot_day,
              slot_start_time: s.slot_start_time,
              slot_end_time: s.slot_end_time,
            } : s)
          );
        }
      )
      .subscribe();
    
    return () => {
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (categorySort && subjectFilter) {
      const availableCategories = [...new Set(sessions
        .filter(s => s.subject_name === subjectFilter)
        .map(s => s.content_category)
        .filter(Boolean)
      )];
      if (!availableCategories.includes(categorySort)) {
        setCategorySort(null);
      }
    }
  }, [subjectFilter, sessions, categorySort]);

  const fetchSessions = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('sessions')
        .select(`
          *,
          coordinators:coordinator_id(name, email),
          centres:centre_id(name, location, email),
          centre_time_slots:centre_time_slot_id(day, start_time, end_time),
          subjects(name)
        `)
        .order('session_date', { ascending: true });

      if (error) throw error;
      
      // Transform data to flatten relationships
      const transformedData = (data || []).map((session: any) => ({
        ...session,
        coordinator_name: session.coordinators?.name || null,
        coordinator_email: session.coordinators?.email || null,
        centre_name: session.centres?.name || null,
        centre_location: session.centres?.location || null,
        centre_email: session.centres?.email || null,
        slot_day: session.centre_time_slots?.day || null,
        slot_start_time: session.centre_time_slots?.start_time || null,
        slot_end_time: session.centre_time_slots?.end_time || null,
        subject_name: session.subjects && !Array.isArray(session.subjects) ? session.subjects.name : 
                     Array.isArray(session.subjects) && session.subjects.length > 0 ? session.subjects[0].name : null,
      }));

      const processedWithCodes = attachSessionIdCodes(transformedData);
      
      setSessions(processedWithCodes as Session[]);
    } catch (error) {
      console.error('Error fetching sessions:', error);
      toast.error('Failed to load sessions');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const targetSession = sessions.find(s => s.id === id);
      const sessionDetails = targetSession 
        ? `${targetSession.title} (Date: ${targetSession.session_date}, Class: ${targetSession.class_batch})`
        : id;

      const { error } = await supabase
        .from('sessions')
        .delete()
        .eq('id', id);

      if (error) throw error;
      
      await logActivity('DELETE', 'Sessions', `Deleted session: ${sessionDetails}`);
      
      toast.success('Session deleted successfully');
      setSessions(sessions.filter((s) => s.id !== id));
      setDeleteDialogOpen(false);
      setSelectedSession(null);
      setDeleteConfirmText('');
    } catch (error) {
      console.error('Error deleting session:', error);
      toast.error('Failed to delete session');
    }
  };

  const handleEditStatus = (session: Session) => {
    setSelectedSession(session);
    setNewStatus(session.status);
    setStatusDialogOpen(true);
  };

  const handleSaveStatus = async () => {
    if (!selectedSession || !newStatus) return;

    try {
      const { error } = await supabase
        .from('sessions')
        .update({ status: newStatus })
        .eq('id', selectedSession.id);

      if (error) throw error;
      
      await logActivity('UPDATE', 'Sessions', `Updated session status for "${selectedSession.title}" to: ${newStatus}`);
      
      // Update local state
      setSessions(sessions.map(s => 
        s.id === selectedSession.id ? { ...s, status: newStatus } : s
      ));
      
      toast.success('Session status updated successfully');
      setStatusDialogOpen(false);
      setSelectedSession(null);
      setNewStatus('');
    } catch (error) {
      console.error('Error updating session status:', error);
      toast.error('Failed to update session status');
    }
  };

  const handleAddSession = () => {
    setSelectedDate(new Date());
    setIsTypeDialogOpen(true);
  };

  const getFilteredSessions = () => {
    let filtered = sessions;

    // Apply search query across all columns
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(s => 
        (s.session_id_code?.toLowerCase().includes(query)) ||
        (s.title?.toLowerCase().includes(query)) ||
        (s.content_category?.toLowerCase().includes(query)) ||
        (s.module_name?.toLowerCase().includes(query)) ||
        (s.topics_covered?.toLowerCase().includes(query)) ||
        (s.facilitator_name?.toLowerCase().includes(query)) ||
        (s.volunteer_name?.toLowerCase().includes(query)) ||
        (s.coordinator_name?.toLowerCase().includes(query)) ||
        (s.class_batch?.toLowerCase().includes(query)) ||
        (s.centre_name?.toLowerCase().includes(query)) ||
        (s.status?.toLowerCase().includes(query))
      );
    }

    // Apply status filter
    if (statusFilter) {
      filtered = filtered.filter(s => s.status === statusFilter);
    }

    // Apply time filter
    if (timeFilter) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      if (timeFilter === 'upcoming') {
        filtered = filtered.filter(s => new Date(s.session_date) >= today);
      } else if (timeFilter === 'past') {
        filtered = filtered.filter(s => new Date(s.session_date) < today);
      } else if (timeFilter === 'today') {
        filtered = filtered.filter(s => s.session_date === todayStr);
      } else if (timeFilter === 'tomorrow') {
        filtered = filtered.filter(s => s.session_date === tomorrowStr);
      }
    }

    // Apply session type filter
    if (sessionTypeFilter) {
      filtered = filtered.filter(s => s.session_type === sessionTypeFilter);
    }

    // Apply subject filter
    if (subjectFilter) {
      filtered = filtered.filter(s => s.subject_name === subjectFilter);
    }

    // Apply date range filter
    if (dateFromFilter) {
      const fromDate = new Date(dateFromFilter);
      fromDate.setHours(0, 0, 0, 0);
      filtered = filtered.filter(s => new Date(s.session_date) >= fromDate);
    }

    if (dateToFilter) {
      const toDate = new Date(dateToFilter);
      toDate.setHours(23, 59, 59, 999);
      filtered = filtered.filter(s => new Date(s.session_date) <= toDate);
    }

    // Apply academic year filter
    if (selectedYear) {
      const { startDate, endDate } = getDateRange();
      filtered = filtered.filter(s => {
        const sessionDate = new Date(s.session_date);
        return sessionDate >= startDate && sessionDate <= endDate;
      });
    }

    // Apply volunteer filter
    if (volunteerFilter) {
      filtered = filtered.filter(s => s.volunteer_name === volunteerFilter);
    }

    // Apply facilitator filter
    if (facilitatorFilter) {
      filtered = filtered.filter(s => s.facilitator_name === facilitatorFilter);
    }

    // Apply coordinator filter
    if (coordinatorFilter) {
      filtered = filtered.filter(s => s.coordinator_name === coordinatorFilter);
    }

    // Apply category sort - selected category sessions first, then others
    if (categorySort) {
      filtered = filtered.sort((a, b) => {
        const aMatches = a.content_category === categorySort ? 0 : 1;
        const bMatches = b.content_category === categorySort ? 0 : 1;
        return aMatches - bMatches;
      });
    }

    // Apply column sorting
    if (sortColumn && sortDirection) {
      filtered = [...filtered].sort((a, b) => {
        const aValue = a[sortColumn];
        const bValue = b[sortColumn];

        // Handle null/undefined values
        if (aValue == null && bValue == null) return 0;
        if (aValue == null) return sortDirection === 'asc' ? 1 : -1;
        if (bValue == null) return sortDirection === 'asc' ? -1 : 1;

        // String comparison (case-insensitive)
        if (typeof aValue === 'string' && typeof bValue === 'string') {
          const comparison = aValue.toLowerCase().localeCompare(bValue.toLowerCase());
          return sortDirection === 'asc' ? comparison : -comparison;
        }

        // Date comparison
        if (sortColumn === 'session_date' && typeof aValue === 'string' && typeof bValue === 'string') {
          const aDate = new Date(aValue).getTime();
          const bDate = new Date(bValue).getTime();
          return sortDirection === 'asc' ? aDate - bDate : bDate - aDate;
        }

        // Number comparison
        if (typeof aValue === 'number' && typeof bValue === 'number') {
          return sortDirection === 'asc' ? aValue - bValue : bValue - aValue;
        }

        return 0;
      });
    }

    return filtered;
  };

  function handleColumnSort(column: keyof Session) {
    if (sortColumn === column) {
      // If clicking the same column, cycle through: asc -> desc -> null
      if (sortDirection === 'asc') {
        setSortDirection('desc');
      } else if (sortDirection === 'desc') {
        setSortColumn(null);
        setSortDirection(null);
      }
    } else {
      // If clicking a different column, start with ascending
      setSortColumn(column);
      setSortDirection('asc');
    }
  }

  function getSortIndicator(column: keyof Session) {
    if (sortColumn !== column) return '↕';
    if (sortDirection === 'asc') return '↑';
    if (sortDirection === 'desc') return '↓';
    return '↕';
  }

  const filteredSessions = getFilteredSessions();

  const handleSessionTypeSelect = (type: 'guest_teacher' | 'guest_speaker' | 'local_teacher') => {
    setSelectedSessionType(type);
    setIsFormDialogOpen(true);
  };

  const handleToggleFeedbackLock = async (session: Session) => {
    try {
      const newStatus = !session.feedback_unlocked;
      const { error } = await supabase
        .from('sessions')
        .update({ feedback_unlocked: newStatus })
        .eq('id', session.id);
      
      if (error) throw error;
      
      toast.success(`Feedback ${newStatus ? 'unlocked' : 'locked'} successfully.`);
      fetchSessions();
    } catch (e) {
      console.error(e);
      toast.error('Failed to change feedback lock status.');
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl md:text-3xl font-bold text-foreground">Sessions</h1>
            <p className="text-sm md:text-base text-muted-foreground mt-1">
              Manage volunteer sessions and events
            </p>
          </div>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
            <Button 
              variant="outline" 
              onClick={() => window.open('https://docs.google.com/presentation/d/19QjljocxshsJ5pNr_QhtFI2s7ByK91mHgXsILF3K-3k/mobilepresent?pli=1&slide=id.g3f36f08c6d8_1_6', '_blank')}
              className="w-full sm:w-auto gap-2 border-primary/20 text-primary hover:bg-primary/5"
            >
              <ExternalLink className="h-4 w-4" />
              <span className="hidden sm:inline">Guest Teacher Overview</span>
              <span className="sm:hidden">GT Overview</span>
            </Button>
            <Button 
              variant="outline" 
              onClick={() => window.open('https://docs.google.com/presentation/d/12m8A4LNl84soS68Npny-q2Jx6VPbMi6yyAEmfB-eFKA/edit?usp=drivesdk', '_blank')}
              className="w-full sm:w-auto gap-2 border-primary/20 text-primary hover:bg-primary/5"
            >
              <ExternalLink className="h-4 w-4" />
              <span className="hidden sm:inline">Guest Speaker Overview</span>
              <span className="sm:hidden">GS Overview</span>
            </Button>
            <Button
              onClick={() => setIsImportOpen(true)}
              variant="outline"
              className="w-full sm:w-auto gap-2"
            >
              <Upload className="h-4 w-4" />
              <span className="hidden sm:inline">Import Sessions</span>
              <span className="sm:hidden">Import</span>
            </Button>
            <Button
              onClick={handleAddSession}
              className="w-full sm:w-auto gap-2"
            >
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">New Session</span>
              <span className="sm:hidden">Add</span>
            </Button>
          </div>
        </div>

        {/* Sessions Table/Cards */}
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <GraduationCap className="h-5 w-5 text-primary" />
              All Sessions
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            ) : sessions.length === 0 ? (
              <div className="text-center py-12">
                <GraduationCap className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-medium text-foreground mb-2">
                  No sessions yet
                </h3>
                <p className="text-muted-foreground mb-4">
                  Get started by creating your first session
                </p>
                <Button onClick={handleAddSession}>
                  <Plus className="h-4 w-4 mr-2" />
                  New Session
                </Button>
              </div>
            ) : (
              <>
                {/* Filters */}
                <div className="space-y-4 mb-6">
                  {/* Search Bar */}
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search sessions by title, topic, facilitator, volunteer, coordinator, class, centre, or status..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-10 pr-10"
                    />
                    {searchQuery && (
                      <button
                        onClick={() => setSearchQuery('')}
                        className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>

                  {/* Filter Row 1: Status, Time, Date Range */}
                  <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-end">
                    {/* Status Filter */}
                    <div className="w-full sm:w-48">
                      <label className="text-sm font-medium text-foreground mb-2 block">
                        Filter by Status
                      </label>
                      <Select value={statusFilter || 'all'} onValueChange={(value) => setStatusFilter(value === 'all' ? null : value)}>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select status" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Statuses</SelectItem>
                          <SelectItem value="committed">Committed</SelectItem>
                          <SelectItem value="in_progress">In Progress</SelectItem>
                          <SelectItem value="completed">Completed</SelectItem>
                          <SelectItem value="rescheduled">Rescheduled</SelectItem>
                          <SelectItem value="cancelled">Cancelled</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Time Filter */}
                    <div className="w-full sm:w-48">
                      <label className="text-sm font-medium text-foreground mb-2 block">
                        Filter by Time
                      </label>
                      <Select value={timeFilter || 'all'} onValueChange={(value) => setTimeFilter(value === 'all' ? null : value)}>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select time" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Times</SelectItem>
                          <SelectItem value="today">Today</SelectItem>
                          <SelectItem value="tomorrow">Tomorrow</SelectItem>
                          <SelectItem value="upcoming">Upcoming</SelectItem>
                          <SelectItem value="past">Past</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Date Range Filter */}
                    <div className="w-full sm:w-56">
                      <DateRangePicker
                        label="Date Range"
                        dateFrom={dateFromFilter}
                        dateTo={dateToFilter}
                        onDateFromChange={setDateFromFilter}
                        onDateToChange={setDateToFilter}
                      />
                    </div>

                    {/* Session Type Filter */}
                    <div className="w-full sm:w-48">
                      <label className="text-sm font-medium text-foreground mb-2 block">
                        Filter by Type
                      </label>
                      <Select value={sessionTypeFilter || 'all'} onValueChange={(value) => setSessionTypeFilter(value === 'all' ? null : value)}>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Types</SelectItem>
                          <SelectItem value="guest_teacher">Guest Teacher (GT)</SelectItem>
                          <SelectItem value="guest_speaker">Guest Speaker (GS)</SelectItem>
                          <SelectItem value="local_teacher">Local Teacher (LT)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Filter Row 2: Volunteer, Facilitator, Coordinator, Category Sort */}
                  <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-end">
                    {/* Volunteer Filter */}
                    <div className="w-full sm:w-48">
                      <label className="text-sm font-medium text-foreground mb-2 block">
                        Filter by Volunteer
                      </label>
                      <Select value={volunteerFilter || 'all'} onValueChange={(value) => setVolunteerFilter(value === 'all' ? null : value)}>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select volunteer" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Volunteers</SelectItem>
                          {[...new Set(sessions.map(s => s.volunteer_name).filter(Boolean))].sort().map((volunteer) => (
                            <SelectItem key={volunteer} value={volunteer || ''}>
                              {volunteer}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Facilitator Filter */}
                    <div className="w-full sm:w-48">
                      <label className="text-sm font-medium text-foreground mb-2 block">
                        Filter by Facilitator
                      </label>
                      <Select value={facilitatorFilter || 'all'} onValueChange={(value) => setFacilitatorFilter(value === 'all' ? null : value)}>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select facilitator" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Facilitators</SelectItem>
                          {[...new Set(sessions.map(s => s.facilitator_name).filter(Boolean))].sort().map((facilitator) => (
                            <SelectItem key={facilitator} value={facilitator || ''}>
                              {facilitator}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Coordinator Filter */}
                    <div className="w-full sm:w-48">
                      <label className="text-sm font-medium text-foreground mb-2 block">
                        Filter by Coordinator
                      </label>
                      <Select value={coordinatorFilter || 'all'} onValueChange={(value) => setCoordinatorFilter(value === 'all' ? null : value)}>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select coordinator" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Coordinators</SelectItem>
                          {[...new Set(sessions.map(s => s.coordinator_name).filter(Boolean))].sort().map((coordinator) => (
                            <SelectItem key={coordinator} value={coordinator || ''}>
                              {coordinator}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Academic Year Filter Info */}
                    <div className="w-full sm:w-48">
                      <label className="text-sm font-medium text-foreground mb-2 block">
                        Academic Year
                      </label>
                      <div className="h-10 flex items-center px-3 border border-border rounded-md bg-muted/50 text-sm font-medium">
                        {selectedYear}
                      </div>
                    </div>

                    {/* Category Sort */}
                    <div className="w-full sm:w-48">
                      <label className="text-sm font-medium text-foreground mb-2 block">
                        Sort by Category
                      </label>
                      <Select value={categorySort || 'all'} onValueChange={(value) => setCategorySort(value === 'all' ? null : value)}>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select category" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Categories</SelectItem>
                          {[...new Set(sessions
                            .filter(s => !subjectFilter || s.subject_name === subjectFilter)
                            .map(s => s.content_category)
                            .filter(Boolean)
                          )].sort().map((category) => (
                            <SelectItem key={category} value={category || ''}>
                              {category}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Subject Filter */}
                    <div className="w-full sm:w-48">
                      <label className="text-sm font-medium text-foreground mb-2 block">
                        Filter by Subject
                      </label>
                      <Select value={subjectFilter || 'all'} onValueChange={(value) => setSubjectFilter(value === 'all' ? null : value)}>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select subject" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Subjects</SelectItem>
                          {[...new Set(sessions.map(s => s.subject_name).filter(Boolean))].sort().map((subject) => (
                            <SelectItem key={subject} value={subject || ''}>
                              {subject}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Active Filters Summary */}
                    {(searchQuery || statusFilter || timeFilter || dateFromFilter || dateToFilter || volunteerFilter || facilitatorFilter || coordinatorFilter || categorySort || subjectFilter) && (
                      <div className="text-sm text-muted-foreground mt-2 sm:mt-0 w-full sm:w-auto">
                        Showing {filteredSessions.length} of {sessions.length} sessions
                      </div>
                    )}
                  </div>
                </div>

                {filteredSessions.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-muted-foreground">No sessions match the selected filters</p>
                  </div>
                ) : (
                  <>
                {/* Desktop Table View - Single Table with Horizontal Scroll */}
                <div className="hidden md:block overflow-x-auto border border-border rounded-lg">
                  <Table className="w-full text-sm">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="min-w-[220px] w-[220px] font-bold">Session ID</TableHead>
                        <TableHead className="min-w-[80px] cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => handleColumnSort('subject_name')}>
                          <div className="flex items-center gap-1">
                            Subject
                            <span className={sortColumn === 'subject_name' ? 'font-bold' : 'text-muted-foreground'}>
                              {getSortIndicator('subject_name')}
                            </span>
                          </div>
                        </TableHead>
                        <TableHead className="min-w-[70px] cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => handleColumnSort('content_category')}>
                          <div className="flex items-center gap-1">
                            Category
                            <span className={sortColumn === 'content_category' ? 'font-bold' : 'text-muted-foreground'}>
                              {getSortIndicator('content_category')}
                            </span>
                          </div>
                        </TableHead>
                        <TableHead className="min-w-[70px] cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => handleColumnSort('module_name')}>
                          <div className="flex items-center gap-1">
                            Module No & Module Name
                            <span className={sortColumn === 'module_name' ? 'font-bold' : 'text-muted-foreground'}>
                              {getSortIndicator('module_name')}
                            </span>
                          </div>
                        </TableHead>
                        <TableHead className="min-w-[70px] cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => handleColumnSort('topics_covered')}>
                          <div className="flex items-center gap-1">
                            Topics Covered
                            <span className={sortColumn === 'topics_covered' ? 'font-bold' : 'text-muted-foreground'}>
                              {getSortIndicator('topics_covered')}
                            </span>
                          </div>
                        </TableHead>
                        <TableHead className="min-w-[40px]">Type</TableHead>
                        <TableHead className="min-w-[70px] cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => handleColumnSort('volunteer_name')}>
                          <div className="flex items-center gap-1">
                            Volunteer
                            <span className={sortColumn === 'volunteer_name' ? 'font-bold' : 'text-muted-foreground'}>
                              {getSortIndicator('volunteer_name')}
                            </span>
                          </div>
                        </TableHead>
                        <TableHead className="min-w-[70px]">Coordinator</TableHead>
                        <TableHead className="min-w-[70px]">Facilitator</TableHead>
                        <TableHead className="min-w-[60px]">Class</TableHead>
                        <TableHead className="min-w-[70px]">Centre</TableHead>
                        <TableHead className="min-w-[70px] cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => handleColumnSort('session_date')}>
                          <div className="flex items-center gap-1">
                            Date
                            <span className={sortColumn === 'session_date' ? 'font-bold' : 'text-muted-foreground'}>
                              {getSortIndicator('session_date')}
                            </span>
                          </div>
                        </TableHead>
                        <TableHead className="min-w-[70px]">Time</TableHead>
                        <TableHead className="min-w-[60px]">Recording</TableHead>
                        <TableHead className="min-w-[50px]">Meeting</TableHead>
                        <TableHead className="min-w-[60px]">Status</TableHead>
                        <TableHead className="min-w-[50px]">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredSessions.map((session) => {
                        const isPastSession = new Date(session.session_date) < new Date();
                        
                        let rowBgClass = "hover:bg-muted/50 text-xs h-8 transition-colors";
                        if (session.session_date === todayStr) {
                          rowBgClass = "bg-amber-50/60 dark:bg-amber-950/25 hover:bg-amber-100/70 dark:hover:bg-amber-950/35 border-l-2 border-l-amber-500 text-xs h-8 transition-colors";
                        } else if (session.session_date === tomorrowStr) {
                          rowBgClass = "bg-blue-50/60 dark:bg-blue-950/25 hover:bg-blue-100/70 dark:hover:bg-blue-950/35 border-l-2 border-l-blue-500 text-xs h-8 transition-colors";
                        }

                        return (
                        <TableRow key={session.id} className={rowBgClass}>
                          <TableCell className="text-xs px-2 py-1 min-w-[220px] w-[220px]">
                            <Badge 
                              variant="outline" 
                              className="font-mono text-[11px] bg-primary/10 text-primary border-primary/20 font-bold px-2 py-0.5 whitespace-nowrap inline-block"
                              title={`Full Database UUID: ${session.id}`}
                            >
                              {session.session_id_code || `#${session.id.slice(0, 8).toUpperCase()}`}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs px-2 py-1 max-w-[70px]">
                            <div 
                              onClick={() => navigate(`/sessions/${session.id}/recording`)}
                              className="cursor-pointer hover:underline text-foreground"
                              title="Go to Recording & Feedback"
                            >
                              <TruncatedText text={session.subject_name} maxLength={20} />
                            </div>
                          </TableCell>
                          <TableCell className="text-xs px-2 py-1 max-w-[70px]"><TruncatedText text={session.content_category} maxLength={20} /></TableCell>
                          <TableCell className="text-xs px-2 py-1 max-w-[70px]"><TruncatedText text={session.module_name} maxLength={20} /></TableCell>
                          <TableCell className="text-xs px-2 py-1 max-w-[70px]"><TruncatedText text={session.topics_covered} maxLength={20} /></TableCell>
                          <TableCell className="px-2 py-1">
                            <Badge variant="outline" className="text-xs whitespace-nowrap">
                              {session.session_type === 'guest_speaker' ? 'GS' : session.session_type === 'local_teacher' ? 'LT' : 'GT'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs px-2 py-1 max-w-[70px]"><TruncatedText text={session.volunteer_name} maxLength={20} /></TableCell>
                          <TableCell className="text-xs px-2 py-1 max-w-[70px]"><TruncatedText text={session.coordinator_name} maxLength={20} /></TableCell>
                          <TableCell className="text-xs px-2 py-1 max-w-[70px]"><TruncatedText text={session.facilitator_name} maxLength={20} /></TableCell>
                          <TableCell className="text-xs px-2 py-1 max-w-[60px]"><TruncatedText text={session.class_batch} maxLength={15} /></TableCell>
                          <TableCell className="text-xs px-2 py-1 max-w-[70px]"><TruncatedText text={session.centre_name} maxLength={20} /></TableCell>
                          <TableCell className="text-xs px-2 py-1 whitespace-nowrap">
                            <div className="flex flex-col gap-0.5">
                              <span>
                                {new Date(session.session_date).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                              </span>
                              {session.session_date === todayStr && (
                                <span className="inline-flex items-center rounded px-1 py-0.5 text-[9px] font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 w-fit">
                                  Today
                                </span>
                              )}
                              {session.session_date === tomorrowStr && (
                                <span className="inline-flex items-center rounded px-1 py-0.5 text-[9px] font-semibold bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 w-fit">
                                  Tomorrow
                                </span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-xs px-2 py-1 whitespace-nowrap">
                            {session.slot_start_time && session.slot_end_time 
                              ? `${session.slot_start_time.slice(0, 5)}-${session.slot_end_time.slice(0, 5)}` 
                              : '-'}
                          </TableCell>
                          <TableCell className="text-xs px-2 py-1">
                            {session.recording_url ? (
                              <a
                                href={session.recording_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-primary hover:underline whitespace-nowrap text-xs"
                              >
                                📹
                              </a>
                            ) : session.recording_status === 'pending' ? (
                              <span className="text-xs">⏳</span>
                            ) : session.recording_status === 'failed' ? (
                              <span className="text-xs">❌</span>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell className="text-xs px-2 py-1">
                            {session.meeting_link ? (
                              <a
                                href={session.meeting_link}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-primary hover:underline whitespace-nowrap text-xs"
                              >
                                🔗
                              </a>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell className="text-xs px-2 py-1">
                            <Badge 
                              variant={
                                session.status === 'completed' ? 'default' :
                                session.status === 'rescheduled' ? 'secondary' :
                                session.status === 'cancelled' ? 'destructive' :
                                'outline'
                              }
                              className="text-xs whitespace-nowrap"
                            >
                              {session.status || '-'}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-6 w-6">
                                  <MoreVertical className="h-3 w-3" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="bg-popover">
                                <DropdownMenuItem 
                                  onClick={() => {
                                    setSelectedSession(session);
                                    setEditSessionDialogOpen(true);
                                  }}
                                >
                                  <Edit className="h-3 w-3 mr-1" />
                                  Edit Full
                                </DropdownMenuItem>
                                <DropdownMenuItem 
                                  onClick={() => handleEditStatus(session)}
                                >
                                  <Edit className="h-3 w-3 mr-1" />
                                  Edit Status
                                </DropdownMenuItem>
                                <DropdownMenuItem 
                                  onClick={() => navigate(`/sessions/${session.id}/recording`)}
                                >
                                  <FileText className="h-3 w-3 mr-1" />
                                  Record
                                </DropdownMenuItem>
                                {userRole === 1 && (
                                  <DropdownMenuItem 
                                    onClick={() => handleToggleFeedbackLock(session)}
                                  >
                                    {session.feedback_unlocked ? <Lock className="h-3 w-3 mr-1" /> : <Unlock className="h-3 w-3 mr-1" />}
                                    {session.feedback_unlocked ? 'Lock Feedback' : 'Unlock Feedback'}
                                  </DropdownMenuItem>
                                )}
                                {userRole === 1 && (
                                  <DropdownMenuItem 
                                    onClick={() => {
                                      setSelectedSession(session);
                                      setDeleteDialogOpen(true);
                                    }}
                                    className="text-destructive focus:text-destructive"
                                  >
                                    <Trash2 className="h-3 w-3 mr-1" />
                                    Delete
                                  </DropdownMenuItem>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>

                {/* Mobile Card View */}
                <div className="md:hidden space-y-4">
                  {filteredSessions.map((session) => {
                    let cardClass = "bg-muted/50 rounded-lg p-4 space-y-3 border border-border transition-all";
                    if (session.session_date === todayStr) {
                      cardClass = "bg-amber-50/40 dark:bg-amber-950/15 rounded-lg p-4 space-y-3 border-l-4 border-l-amber-500 border-t border-r border-b border-border/80 transition-all";
                    } else if (session.session_date === tomorrowStr) {
                      cardClass = "bg-blue-50/40 dark:bg-blue-950/15 rounded-lg p-4 space-y-3 border-l-4 border-l-blue-500 border-t border-r border-b border-border/80 transition-all";
                    }

                    return (
                    <div key={session.id} className={cardClass}>
                      {/* Topic and Status */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <h3 className="font-semibold text-foreground break-words">{session.topics_covered || '-'}</h3>
                          <p className="text-xs text-muted-foreground mt-1">ID: {session.id.substring(0, 8)}</p>
                        </div>
                        <Badge variant={
                          session.status === 'completed' ? 'default' :
                          session.status === 'rescheduled' ? 'secondary' :
                          session.status === 'cancelled' ? 'destructive' :
                          'outline'
                        }>
                          {session.status}
                        </Badge>
                      </div>

                      {/* Category and Module */}
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <span className="text-muted-foreground block">Category</span>
                          <span className="font-medium text-sm">{session.content_category || '-'}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground block">Module</span>
                          <span className="font-medium text-sm">{session.module_name || '-'}</span>
                        </div>
                      </div>

                      {/* Facilitator and Volunteer */}
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <span className="text-muted-foreground block">Facilitator</span>
                          <span className="font-medium text-sm">{session.facilitator_name || '-'}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground block">Volunteer</span>
                          <span className="font-medium text-sm">{session.volunteer_name || '-'}</span>
                        </div>
                      </div>

                      {/* Coordinator */}
                      <div className="text-xs">
                        <span className="text-muted-foreground block">Coordinator</span>
                        <span className="font-medium text-sm">{session.coordinator_name || '-'}</span>
                      </div>

                      {/* Class */}
                      <div className="text-xs">
                        <span className="text-muted-foreground block">Class</span>
                        <span className="font-medium text-sm">{session.class_batch || '-'}</span>
                      </div>

                      {/* Centre and Time Slot */}
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <span className="text-muted-foreground block">Centre</span>
                          <span className="font-medium text-sm">{session.centre_name || '-'}</span>
                          {session.centre_email && (
                            <span className="text-blue-600 text-xs block">{session.centre_email}</span>
                          )}
                        </div>
                        <div>
                          <span className="text-muted-foreground block">Time Slot</span>
                          <span className="font-medium text-sm">
                            {session.slot_start_time && session.slot_end_time 
                              ? `${session.slot_start_time} - ${session.slot_end_time}` 
                              : '-'}
                          </span>
                        </div>
                      </div>

                      {/* Meeting Link */}
                      {session.meeting_link && (
                        <div className="text-xs">
                          <span className="text-muted-foreground block">Meeting Link</span>
                          <a
                            href={session.meeting_link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:underline font-medium text-sm"
                          >
                            Join Meeting
                          </a>
                        </div>
                      )}

                      {/* Date and Time */}
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <span className="text-muted-foreground block">Date</span>
                          <span className="font-medium text-sm flex flex-wrap items-center gap-1">
                            {new Date(session.session_date).toLocaleDateString()}
                            {session.session_date === todayStr && (
                              <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[9px] font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                                Today
                              </span>
                            )}
                            {session.session_date === tomorrowStr && (
                              <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[9px] font-semibold bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300">
                                Tomorrow
                              </span>
                            )}
                          </span>
                        </div>
                        <div>
                          <span className="text-muted-foreground block">Time</span>
                          <span className="font-medium text-sm">{session.session_time}</span>
                        </div>
                      </div>

                      {/* Type */}
                      <div className="text-xs">
                        <span className="text-muted-foreground">Type</span>
                        <Badge variant="outline" className="capitalize mt-1">
                          {session.session_type === 'guest_speaker' ? 'Guest Speaker' : session.session_type === 'local_teacher' ? 'Local Teacher' : 'Guest Teacher'}
                        </Badge>
                      </div>

                      {/* Recording Status */}
                      {session.recording_url || session.recording_status ? (
                        <div className="text-xs">
                          <span className="text-muted-foreground block">Recording</span>
                          {session.recording_url ? (
                            <div className="space-y-1 mt-1">
                              <a
                                href={session.recording_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-primary hover:underline font-medium text-sm block"
                              >
                                📹 View Recording
                              </a>
                              <div className="text-xs text-muted-foreground">
                                {session.recording_duration && `${Math.floor(session.recording_duration / 60)}m`}
                                {session.recording_size && ` • ${session.recording_size}`}
                              </div>
                            </div>
                          ) : session.recording_status === 'pending' ? (
                            <Badge variant="secondary" className="bg-yellow-100 text-yellow-800 mt-1">
                              ⏳ Processing
                            </Badge>
                          ) : session.recording_status === 'failed' ? (
                            <Badge variant="secondary" className="bg-red-100 text-red-800 mt-1">
                              ❌ Failed
                            </Badge>
                          ) : null}
                        </div>
                      ) : null}

                      {/* Actions */}
                      <div className="flex gap-2 pt-2 border-t border-border">
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => handleEditStatus(session)}
                          className="flex-1"
                        >
                          <Edit className="h-4 w-4 mr-1" />
                          Status
                        </Button>
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => {
                            setSelectedSession(session);
                            setUpdateRecordingDialogOpen(true);
                          }}
                          className="flex-1"
                        >
                          <Film className="h-4 w-4 mr-1" />
                          Recording
                        </Button>
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => navigate(`/sessions/${session.id}/recording`)}
                          className="flex-1"
                        >
                          <FileText className="h-4 w-4 mr-1" />
                          Record
                        </Button>
                        {userRole === 1 && (
                          <Button 
                            size="sm" 
                            variant="outline"
                            onClick={() => handleToggleFeedbackLock(session)}
                            className="flex-1"
                            title={session.feedback_unlocked ? 'Lock Feedback' : 'Unlock Feedback'}
                          >
                            {session.feedback_unlocked ? <Lock className="h-4 w-4 mr-1" /> : <Unlock className="h-4 w-4 mr-1" />}
                            {session.feedback_unlocked ? 'Lock' : 'Unlock'}
                          </Button>
                        )}
                        {userRole === 1 && (
                          <Button 
                            size="sm" 
                            variant="destructive"
                            onClick={() => {
                              setSelectedSession(session);
                              setDeleteDialogOpen(true);
                            }}
                            className="flex-1"
                          >
                            <Trash2 className="h-4 w-4 mr-1" />
                            Delete
                          </Button>
                        )}
                      </div>
                    </div>
                    );
                  })}
                </div>
                  </>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Add Session Dialog - Type Selection */}
      <SessionTypeDialog
        open={isTypeDialogOpen}
        onOpenChange={setIsTypeDialogOpen}
        onSelectType={handleSessionTypeSelect}
      />

      {/* Add Session Dialog - Form */}
      <AddSessionDialog
        open={isFormDialogOpen}
        onOpenChange={setIsFormDialogOpen}
        selectedDate={selectedDate}
        onSuccess={fetchSessions}
        sessionType={selectedSessionType || 'guest_teacher'}
      />

      {/* Import Sessions Dialog */}
      <ImportSessionsDialog
        open={isImportOpen}
        onOpenChange={setIsImportOpen}
        onSuccess={fetchSessions}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={(open) => {
        setDeleteDialogOpen(open);
        if (!open) {
          setSelectedSession(null);
          setDeleteConfirmText('');
        }
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Session</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  Are you sure you want to delete "{selectedSession?.topics_covered}"? This action cannot be undone.
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
              onClick={() => selectedSession && handleDelete(selectedSession.id)}
              disabled={deleteConfirmText !== 'DELETE'}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit Status Dialog */}
      <Dialog open={statusDialogOpen} onOpenChange={setStatusDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Session Status</DialogTitle>
            <DialogDescription>
              Update the status for "{selectedSession?.topics_covered}"
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-foreground mb-2 block">
                Status
              </label>
              <Select value={newStatus} onValueChange={setNewStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="committed">Committed</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="rescheduled">Rescheduled</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStatusDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveStatus}>
              Save Status
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Session Dialog */}
      <EditSessionDialog
        open={editSessionDialogOpen}
        onOpenChange={setEditSessionDialogOpen}
        session={selectedSession}
        onSuccess={fetchSessions}
      />

      {/* Update Recording Dialog */}
      <UpdateRecordingDialog
        open={updateRecordingDialogOpen}
        onOpenChange={setUpdateRecordingDialogOpen}
        sessionId={selectedSession?.id || ''}
        sessionTitle={selectedSession?.topics_covered || ''}
        currentRecordingUrl={selectedSession?.recording_url}
        currentRecordingStatus={selectedSession?.recording_status}
        onSuccess={fetchSessions}
      />
    </DashboardLayout>
  );
}
