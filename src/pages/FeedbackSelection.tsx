import { useState, useEffect } from 'react';
import { FileText, MoreVertical, Eye, Plus, Search, X, GraduationCap, Upload, Check, ChevronsUpDown, ExternalLink, Download, Video } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { TruncatedText } from '@/components/ui/truncated-text';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAcademicYear } from '@/contexts/AcademicYearContext';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import { attachSessionIdCodes } from '@/utils/sessionIdGenerator';

interface FeedbackSession {
  id: string;
  session_id_code?: string;
  title: string;
  session_date: string;
  session_time: string;
  session_type: string;
  facilitator_name: string;
  volunteer_name: string;
  volunteer_id?: string | null;
  organization_name?: string | null;
  centre_name?: string | null;
  session_strength?: number | null;
  recorded_at?: string | null;
  coordinator_name: string | null;
  status: string;
  topics_covered: string | null;
  content_category: string | null;
  module_name: string | null;
  session_objective: string | null;
  practical_activities: string | null;
  session_highlights: string | null;
  learning_outcomes: string | null;
  facilitator_reflection: string | null;
  best_performer: string | null;
  guest_teacher_feedback: string | null;
  incharge_reviewer_feedback: string | null;
  mic_sound_rating: number | null;
  seating_view_rating: number | null;
  session_strength: number | null;
  class_batch: string | null;
  recorded_at: string | null;
  subject_name?: string | null;
  recording_url?: string | null;
  facilitator_feedback_status?: string;
  coordinator_feedback_status?: string;
  supervisor_feedback_status?: string;
  admin_feedback_status?: string;
}


const isDelayed = (session: any) => {
  const isDone = session.status === 'completed';
  if (isDone && session.recorded_at) {
    const sessionDateStr = session.session_date;
    const recordedDateStr = new Date(session.recorded_at).toISOString().split('T')[0];
    return recordedDateStr > sessionDateStr;
  }
  if (!isDone) {
    const todayStr = new Date().toISOString().split('T')[0];
    return session.session_date < todayStr;
  }
  return false;
};

export default function FeedbackSelection() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [feedbackSessions, setFeedbackSessions] = useState<FeedbackSession[]>([]);
  
  // Filters and sorting state matching Sessions.tsx
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [timeFilter, setTimeFilter] = useState<string | null>(null);
  const [volunteerFilter, setVolunteerFilter] = useState<string | null>(null);
  const [organizationFilter, setOrganizationFilter] = useState<string | null>(null);
  const [facilitatorFilter, setFacilitatorFilter] = useState<string | null>(null);
  const [coordinatorFilter, setCoordinatorFilter] = useState<string | null>(null);
  const [subjectFilter, setSubjectFilter] = useState<string | null>(null);
  const [sessionTypeFilter, setSessionTypeFilter] = useState<string | null>(null);
  const [dateFromFilter, setDateFromFilter] = useState<string>(() => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
  });
  const [dateToFilter, setDateToFilter] = useState<string>(() => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().split('T')[0];
  });
  const [sortColumn, setSortColumn] = useState<keyof FeedbackSession | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc' | null>(null);
  const [facilitatorStatusFilter, setFacilitatorStatusFilter] = useState<string | null>(null);
  const [coordinatorStatusFilter, setCoordinatorStatusFilter] = useState<string | null>(null);
  const [supervisorStatusFilter, setSupervisorStatusFilter] = useState<string | null>(null);
  const { selectedYear, getDateRange } = useAcademicYear();

  const [isAddFeedbackDialogOpen, setIsAddFeedbackDialogOpen] = useState(false);
  const [committedSessions, setCommittedSessions] = useState<FeedbackSession[]>([]);
  const [loadingCommitted, setLoadingCommitted] = useState(false);
  const [dialogFilter, setDialogFilter] = useState<string>('recent');
  const [isVolunteerPopoverOpen, setIsVolunteerPopoverOpen] = useState(false);
  const [isOrganizationPopoverOpen, setIsOrganizationPopoverOpen] = useState(false);

  useEffect(() => {
    fetchFeedbackSessions();
  }, [selectedYear]);

  const fetchFeedbackSessions = async () => {
    try {
      setLoading(true);
      
      // Fetch volunteers for organization mapping
      const { data: volunteersData } = await supabase
        .from('volunteers')
        .select('id, name, organization_name');

      const volunteerIdOrgMap = new Map<string, string>();
      const volunteerNameOrgMap = new Map<string, string>();

      (volunteersData || []).forEach((v: any) => {
        if (v.organization_name) {
          if (v.id) volunteerIdOrgMap.set(v.id, v.organization_name);
          if (v.name) volunteerNameOrgMap.set(v.name.trim().toLowerCase(), v.organization_name);
        }
      });
      
      // Fetch sessions with academic year filtering
      const { startDate, endDate } = getDateRange();
      const { data: sessionsData, error: sessionsError } = await supabase
        .from('sessions')
        .select(`
          *,
          coordinators:coordinator_id(name),
          subjects(name),
          volunteers:volunteer_id(name, organization_name),
          centres:centre_id(name),
          session_hours_tracker(plan_coordinate_hours, preparation_hours, session_hours, reflection_feedback_followup_hours, total_volunteering_time, logged_hours_in_benevity, notes)
        `)
        .not('recorded_at', 'is', null)
        .gte('session_date', startDate.toISOString().split('T')[0])
        .lte('session_date', endDate.toISOString().split('T')[0])
        .order('session_date', { ascending: false });

      if (sessionsError) throw sessionsError;

      // Transform sessions data
      const transformedSessions = (sessionsData || []).map((session: any) => {
        const orgName = session.volunteers?.organization_name ||
          (session.volunteer_id ? volunteerIdOrgMap.get(session.volunteer_id) : null) ||
          (session.volunteer_name ? volunteerNameOrgMap.get(session.volunteer_name.trim().toLowerCase()) : null) ||
          null;

        return {
          ...session,
          coordinator_name: session.coordinators?.name || null,
          subject_name: session.subjects?.name || null,
          organization_name: orgName,
          centre_name: session.centres?.name || null,
        };
      });

      const processedWithCodes = attachSessionIdCodes(transformedSessions);

      setFeedbackSessions(processedWithCodes as FeedbackSession[]);
    } catch (error) {
      console.error('Error fetching feedback sessions:', error);
      toast.error('Failed to load feedback sessions');
    } finally {
      setLoading(false);
    }
  };

  const getFilteredSessions = () => {
    let filtered = feedbackSessions;

    // Apply search query
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
        (s.organization_name?.toLowerCase().includes(query)) ||
        (s.coordinator_name?.toLowerCase().includes(query)) ||
        (s.class_batch?.toLowerCase().includes(query)) ||
        (s.subject_name?.toLowerCase().includes(query)) ||
        (s.status?.toLowerCase().includes(query))
      );
    }

    // Status filter
    if (statusFilter) {
      filtered = filtered.filter(s => s.status === statusFilter);
    }

    // Time filter
    if (timeFilter) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (timeFilter === 'upcoming') {
        filtered = filtered.filter(s => new Date(s.session_date) >= today);
      } else if (timeFilter === 'past') {
        filtered = filtered.filter(s => new Date(s.session_date) < today);
      }
    }

    // Session Type filter
    if (sessionTypeFilter) {
      filtered = filtered.filter(s => s.session_type === sessionTypeFilter);
    }

    // Subject filter
    if (subjectFilter) {
      filtered = filtered.filter(s => s.subject_name === subjectFilter);
    }

    // Date range
    if (dateFromFilter) {
      filtered = filtered.filter(s => s.session_date >= dateFromFilter);
    }
    if (dateToFilter) {
      filtered = filtered.filter(s => s.session_date <= dateToFilter);
    }

    // Other filters
    if (volunteerFilter) filtered = filtered.filter(s => s.volunteer_name === volunteerFilter);
    if (organizationFilter) filtered = filtered.filter(s => s.organization_name === organizationFilter);
    if (facilitatorFilter) filtered = filtered.filter(s => s.facilitator_name === facilitatorFilter);
    if (coordinatorFilter) filtered = filtered.filter(s => s.coordinator_name === coordinatorFilter);

    // New status filters
    if (facilitatorStatusFilter) {
      filtered = filtered.filter(s => (s.facilitator_feedback_status || 'pending') === facilitatorStatusFilter);
    }
    if (coordinatorStatusFilter) {
      filtered = filtered.filter(s => (s.coordinator_feedback_status || 'pending') === coordinatorStatusFilter);
    }
    if (supervisorStatusFilter) {
      filtered = filtered.filter(s => (s.supervisor_feedback_status || 'pending') === supervisorStatusFilter);
    }

    // Sorting
    if (sortColumn && sortDirection) {
      filtered = [...filtered].sort((a, b) => {
        const aValue = a[sortColumn];
        const bValue = b[sortColumn];
        if (aValue == null && bValue == null) return 0;
        if (aValue == null) return sortDirection === 'asc' ? 1 : -1;
        if (bValue == null) return sortDirection === 'asc' ? -1 : 1;

        if (typeof aValue === 'string' && typeof bValue === 'string') {
          const comparison = aValue.toLowerCase().localeCompare(bValue.toLowerCase());
          return sortDirection === 'asc' ? comparison : -comparison;
        }
        return 0;
      });
    }

    return filtered;
  };

  const handleColumnSort = (column: keyof FeedbackSession) => {
    if (sortColumn === column) {
      if (sortDirection === 'asc') setSortDirection('desc');
      else if (sortDirection === 'desc') {
        setSortColumn(null);
        setSortDirection(null);
      }
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const getSortIndicator = (column: keyof FeedbackSession) => {
    if (sortColumn !== column) return '↕';
    return sortDirection === 'asc' ? '↑' : '↓';
  };

  const getStatusBadge = (status: string | undefined) => {
    const s = status || 'pending';
    if (s === 'done') return <Badge variant="secondary" className="bg-blue-100 text-blue-700 hover:bg-blue-200 border-blue-200">Done</Badge>;
    if (s === 'submitted') return <Badge variant="default" className="bg-green-600 hover:bg-green-700">Submit</Badge>;
    return <Badge variant="outline" className="text-muted-foreground border-dashed">Pending</Badge>;
  };

  const handleViewDetails = (sessionId: string) => {
    navigate(`/sessions/${sessionId}/feedback-details`);
  };

  const handleAddFeedback = (sessionId: string) => {
    navigate(`/sessions/${sessionId}/recording`);
  };

  const handleOpenAddFeedbackDialog = async () => {
    try {
      setLoadingCommitted(true);
      const { data: sessionsData, error: sessionsError } = await supabase
        .from('sessions')
        .select(`*, coordinators:coordinator_id(name)`)
        .is('recorded_at', null)
        .order('session_date', { ascending: false });

      if (sessionsError) throw sessionsError;
      const transformed = (sessionsData || []).map((session: any) => ({
        ...session,
        coordinator_name: session.coordinators?.name || null,
      }));
      setCommittedSessions(transformed as FeedbackSession[]);
      setIsAddFeedbackDialogOpen(true);
    } catch (error) {
      console.error('Error fetching committed sessions:', error);
      toast.error('Failed to load sessions');
    } finally {
      setLoadingCommitted(false);
    }
  };

  const getFilteredCommittedSessions = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayString = today.toISOString().split('T')[0];

    return committedSessions.filter(session => {
      // Exclude upcoming sessions entirely since feedback cannot be recorded for them yet
      if (session.session_date > todayString) return false;

      if (dialogFilter === 'present') return session.session_date === todayString;
      if (dialogFilter === 'past') return session.session_date < todayString;
      return true;
    });
  };

  const filteredSessions = getFilteredSessions();

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl md:text-3xl font-bold text-foreground flex items-center gap-3">
              <FileText className="h-8 w-8 text-primary" />
              Feedback Results
            </h1>
            <p className="text-sm md:text-base text-muted-foreground mt-1">
              View recorded feedback and session results
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
              variant="outline" 
              onClick={async () => {
                const XLSX = await import('xlsx');
                const data = filteredSessions.map(session => {
                  const hours = Array.isArray(session.session_hours_tracker) 
                    ? session.session_hours_tracker[0] 
                    : session.session_hours_tracker;
                    
                  return {
                    Date: new Date(session.session_date).toLocaleDateString(),
                    Time: session.session_time,
                    Class: session.class_batch || '-',
                    Facilitator: session.facilitator_name || '-',
                    Volunteer: session.volunteer_name || '-',
                    Organization: session.organization_name || '-',
                    Coordinator: session.coordinator_name || '-',
                    'Session Type': session.session_type,
                    Category: session.content_category || '-',
                    Module: session.module_name || '-',
                    Topic: session.topics_covered || '-',
                    'Supervisor Feedback - Status': session.supervisor_feedback_status || 'Pending',
                    'Plan & Coordinate Hours': hours?.plan_coordinate_hours || 0,
                    'Preparation Hours': hours?.preparation_hours || 0,
                    'Session Hours': hours?.session_hours || 0,
                    'Reflection & Feedback Hours': hours?.reflection_feedback_followup_hours || 0,
                    'Total Volunteering Time': hours?.total_volunteering_time || 0,
                    'Logged in Benevity': hours?.logged_hours_in_benevity ? 'Yes' : 'No',
                    'Notes': hours?.notes || '',
                  };
                });
                const ws = XLSX.utils.json_to_sheet(data);
                const wb = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(wb, ws, "Supervisor Report");
                XLSX.writeFile(wb, `Supervisor_Report.xlsx`);
              }}
              className="w-full sm:w-auto gap-2 bg-green-600 hover:bg-green-700 text-white border-none"
            >
              <Download className="h-4 w-4" />
              <span className="hidden sm:inline">Export Supervisor Report</span>
            </Button>
            <Button onClick={handleOpenAddFeedbackDialog} className="w-full sm:w-auto">
              <Plus className="h-4 w-4 mr-2" />
              <span className="hidden sm:inline">Add Feedback to Session</span>
              <span className="sm:hidden">Add Feedback</span>
            </Button>
          </div>
        </div>

        {/* Filters */}
        <Card className="shadow-sm">
          <CardContent className="pt-6 space-y-4">
            {/* Search Bar */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search feedback by topic, facilitator, volunteer, coordinator, class, or category..."
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

            {/* Filter Rows */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              {/* Row 1 */}
              <div>
                <label className="text-xs font-medium mb-1 block">Subject</label>
                <Select value={subjectFilter || 'all'} onValueChange={(v) => setSubjectFilter(v === 'all' ? null : v)}>
                  <SelectTrigger className="h-9 truncate"><SelectValue placeholder="All Subjects" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Subjects</SelectItem>
                    {[...new Set(feedbackSessions.map(s => s.subject_name).filter(Boolean))].sort().map(s => (
                      <SelectItem key={s} value={s!}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-xs font-medium mb-1 block">Time</label>
                <Select value={timeFilter || 'all'} onValueChange={(v) => setTimeFilter(v === 'all' ? null : v)}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="All Time" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Time</SelectItem>
                    <SelectItem value="upcoming">Upcoming</SelectItem>
                    <SelectItem value="past">Past</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-xs font-medium mb-1 block">Type</label>
                <Select value={sessionTypeFilter || 'all'} onValueChange={(v) => setSessionTypeFilter(v === 'all' ? null : v)}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="All Types" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="guest_teacher">Guest Teacher (GT)</SelectItem>
                    <SelectItem value="guest_speaker">Guest Speaker (GS)</SelectItem>
                    <SelectItem value="local_teacher">Local Teacher (LT)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <DateRangePicker
                  label="Date Range"
                  dateFrom={dateFromFilter}
                  dateTo={dateToFilter}
                  onDateFromChange={setDateFromFilter}
                  onDateToChange={setDateToFilter}
                />
              </div>

              {/* Volunteer Filter - Moved to Row 1 */}
              <div>
                <label className="text-xs font-medium mb-1 block">Volunteer</label>
                <Popover open={isVolunteerPopoverOpen} onOpenChange={setIsVolunteerPopoverOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={isVolunteerPopoverOpen}
                      className="w-full h-9 justify-between font-normal text-xs px-3"
                    >
                      <span className="truncate">
                        {volunteerFilter ? volunteerFilter : "All Volunteers"}
                      </span>
                      <ChevronsUpDown className="ml-2 h-3 w-3 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[200px] p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Search volunteer..." className="h-8 text-xs" />
                      <CommandList>
                        <CommandEmpty className="text-xs py-2 px-4">No volunteer found.</CommandEmpty>
                        <CommandGroup>
                          <CommandItem
                            value="all"
                            onSelect={() => {
                              setVolunteerFilter(null);
                              setIsVolunteerPopoverOpen(false);
                            }}
                            className="text-xs"
                          >
                            <Check
                              className={cn(
                                "mr-2 h-3 w-3",
                                !volunteerFilter ? "opacity-100" : "opacity-0"
                              )}
                            />
                            All Volunteers
                          </CommandItem>
                          {[...new Set(feedbackSessions.map(s => s.volunteer_name).filter(Boolean))].sort().map((v) => (
                            <CommandItem
                              key={v}
                              value={v!}
                              onSelect={() => {
                                setVolunteerFilter(v!);
                                setIsVolunteerPopoverOpen(false);
                              }}
                              className="text-xs"
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-3 w-3",
                                  volunteerFilter === v ? "opacity-100" : "opacity-0"
                                )}
                              />
                              {v}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {/* Row 2 */}
              {/* Organisation Filter */}
              <div>
                <label className="text-xs font-medium mb-1 block">Organisation</label>
                <Popover open={isOrganizationPopoverOpen} onOpenChange={setIsOrganizationPopoverOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={isOrganizationPopoverOpen}
                      className="w-full h-9 justify-between font-normal text-xs px-3"
                    >
                      <span className="truncate">
                        {organizationFilter ? organizationFilter : "All Organisations"}
                      </span>
                      <ChevronsUpDown className="ml-2 h-3 w-3 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[200px] p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Search organisation..." className="h-8 text-xs" />
                      <CommandList>
                        <CommandEmpty className="text-xs py-2 px-4">No organisation found.</CommandEmpty>
                        <CommandGroup>
                          <CommandItem
                            value="all"
                            onSelect={() => {
                              setOrganizationFilter(null);
                              setIsOrganizationPopoverOpen(false);
                            }}
                            className="text-xs"
                          >
                            <Check
                              className={cn(
                                "mr-2 h-3 w-3",
                                !organizationFilter ? "opacity-100" : "opacity-0"
                              )}
                            />
                            All Organisations
                          </CommandItem>
                          {[...new Set(feedbackSessions.map(s => s.organization_name).filter(Boolean))].sort().map((org) => (
                            <CommandItem
                              key={org}
                              value={org!}
                              onSelect={() => {
                                setOrganizationFilter(org!);
                                setIsOrganizationPopoverOpen(false);
                              }}
                              className="text-xs"
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-3 w-3",
                                  organizationFilter === org ? "opacity-100" : "opacity-0"
                                )}
                              />
                              {org}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>

              <div>
                <label className="text-xs font-medium mb-1 block">Facilitator</label>
                <Select value={facilitatorFilter || 'all'} onValueChange={(v) => setFacilitatorFilter(v === 'all' ? null : v)}>
                  <SelectTrigger className="h-9 truncate"><SelectValue placeholder="All Facilitators" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Facilitators</SelectItem>
                    {[...new Set(feedbackSessions.map(s => s.facilitator_name).filter(Boolean))].sort().map(s => (
                      <SelectItem key={s} value={s!}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-xs font-medium mb-1 block">Coordinator</label>
                <Select value={coordinatorFilter || 'all'} onValueChange={(v) => setCoordinatorFilter(v === 'all' ? null : v)}>
                  <SelectTrigger className="h-9 truncate"><SelectValue placeholder="All Coordinators" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Coordinators</SelectItem>
                    {[...new Set(feedbackSessions.map(s => s.coordinator_name).filter(Boolean))].sort().map(s => (
                      <SelectItem key={s} value={s!}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-end text-xs text-muted-foreground pb-2">
                Showing {filteredSessions.length} of {feedbackSessions.length} results
              </div>
            </div>

            {/* Status Filter Row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 border-t border-border pt-4">
              <div>
                <label className="text-xs font-medium mb-1 block">Facilitator Status</label>
                <Select value={facilitatorStatusFilter || 'all'} onValueChange={(v) => setFacilitatorStatusFilter(v === 'all' ? null : v)}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="All Status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="done">Done</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-xs font-medium mb-1 block">Coordinator Status</label>
                <Select value={coordinatorStatusFilter || 'all'} onValueChange={(v) => setCoordinatorStatusFilter(v === 'all' ? null : v)}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="All Status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="done">Done</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-xs font-medium mb-1 block">Supervisor Status</label>
                <Select value={supervisorStatusFilter || 'all'} onValueChange={(v) => setSupervisorStatusFilter(v === 'all' ? null : v)}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="All Status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="done">Done</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-end pb-1">
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => {
                    setFacilitatorStatusFilter(null);
                    setCoordinatorStatusFilter(null);
                    setSupervisorStatusFilter(null);
                    setSearchQuery('');
                    setSubjectFilter(null);
                    setTimeFilter(null);
                    setSessionTypeFilter(null);
                    setVolunteerFilter(null);
                    setOrganizationFilter(null);
                    setFacilitatorFilter(null);
                    setCoordinatorFilter(null);
                    setDateFromFilter('');
                    setDateToFilter('');
                  }}
                  className="text-xs h-9 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3 w-3 mr-2" />
                  Clear All Filters
                </Button>
              </div>
            </div>

            {/* Table */}
            {loading ? (
              <div className="flex justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            ) : (
              <div className="overflow-x-auto border border-border rounded-lg">
                <Table className="text-xs">
                  <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="font-bold min-w-[150px]">Session ID</TableHead>
                        <TableHead className="min-w-[100px]">Subject</TableHead>
                        <TableHead className="min-w-[100px]">Category</TableHead>
                        <TableHead className="min-w-[150px]">Module No & Name</TableHead>
                        <TableHead className="min-w-[150px]">Topics Covered</TableHead>
                        <TableHead className="min-w-[80px]">Type</TableHead>
                        <TableHead className="min-w-[100px]">Volunteer</TableHead>
                        <TableHead className="min-w-[100px]">Organisation</TableHead>
                        <TableHead className="min-w-[100px]">Coordinator</TableHead>
                        <TableHead className="min-w-[100px]">Facilitator</TableHead>
                        <TableHead className="min-w-[80px]">Class</TableHead>
                        <TableHead className="min-w-[100px]">Centre</TableHead>
                        <TableHead className="min-w-[80px]">Strength</TableHead>
                        <TableHead className="min-w-[100px]">Date</TableHead>
                        <TableHead className="min-w-[100px]">Time</TableHead>
                        <TableHead className="min-w-[100px] text-center">Recording</TableHead>
                        <TableHead className="min-w-[100px] text-center">Meeting</TableHead>
                        <TableHead className="min-w-[120px]">Status</TableHead>
                        <TableHead className="min-w-[80px]">Delayed</TableHead>
                        <TableHead className="w-[60px]">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                  <TableBody>
                    {filteredSessions.map((session) => (
                      <TableRow key={session.id} className="hover:bg-muted/50">
                        <TableCell className="font-medium">
                          <span 
                            className="text-primary hover:underline cursor-pointer" 
                            onClick={() => navigate(`/sessions/${session.id}/feedback-details`)}
                          >
                            {session.session_id_code || '---'}
                          </span>
                        </TableCell>
                        <TableCell>{session.subject_name || '-'}</TableCell>
                        <TableCell>{session.content_category || '-'}</TableCell>
                        <TableCell>{session.module_no ? `${session.module_no} - ${session.module_name || ''}` : session.module_name || '-'}</TableCell>
                        <TableCell className="max-w-[150px] truncate" title={session.topics_covered || ''}>
                          {session.topics_covered || '-'}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" >
                            {session.session_type}
                          </Badge>
                        </TableCell>
                        <TableCell>{session.volunteer_name || '-'}</TableCell>
                        <TableCell>{session.organization_name || '-'}</TableCell>
                        <TableCell>{session.coordinator_name || '-'}</TableCell>
                        <TableCell>{session.facilitator_name || '-'}</TableCell>
                        <TableCell>{session.class_batch || '-'}</TableCell>
                        <TableCell>{session.centre_name || '-'}</TableCell>
                        <TableCell className="text-center">{session.session_strength ?? '-'}</TableCell>
                        <TableCell>{new Date(session.session_date).toLocaleDateString("en-GB")}</TableCell>
                        <TableCell>{session.session_time || '-'}</TableCell>
                        
                        <TableCell className="text-center">
                          {session.recording_url ? (
                            <a href={session.recording_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 bg-blue-50 px-2 py-1 rounded-md transition-colors font-medium">
                              <Video className="h-3.5 w-3.5" />
                              View
                            </a>
                          ) : (
                            <span className="text-muted-foreground text-xs italic">-</span>
                          )}
                        </TableCell>

                        <TableCell className="text-center">
                          {session.meeting_link ? (
                            <a href={session.meeting_link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center p-1.5 rounded-full hover:bg-slate-100 transition-colors text-primary" title="Join Meeting">
                              <Video className="h-4 w-4" />
                            </a>
                          ) : (
                            <span className="text-muted-foreground text-xs italic">-</span>
                          )}
                        </TableCell>

                        <TableCell>
                          {getStatusBadge(session.status)}
                        </TableCell>

                        <TableCell className="text-center">
                          {isDelayed(session) ? <Badge variant="destructive">Yes</Badge> : <Badge variant="secondary">No</Badge>}
                        </TableCell>

                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" className="h-8 w-8 p-0">
                                <span className="sr-only">Open menu</span>
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => navigate(`/sessions/${session.id}/feedback-details`)}>
                                <Eye className="mr-2 h-4 w-4" /> View Record
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

      {/* Add Feedback Dialog */}
      <Dialog open={isAddFeedbackDialogOpen} onOpenChange={setIsAddFeedbackDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Select Session to Add Feedback</DialogTitle>
            <DialogDescription>Choose a session to record performance details.</DialogDescription>
          </DialogHeader>
          <div className="flex gap-2 mb-4">
            <Button variant={dialogFilter === 'recent' ? 'default' : 'outline'} size="sm" onClick={() => setDialogFilter('recent')}>Recent</Button>
            <Button variant={dialogFilter === 'past' ? 'default' : 'outline'} size="sm" onClick={() => setDialogFilter('past')}>Past</Button>
            <Button variant={dialogFilter === 'present' ? 'default' : 'outline'} size="sm" onClick={() => setDialogFilter('present')}>Today</Button>
          </div>
          <div className="space-y-2">
            {getFilteredCommittedSessions().map(s => (
              <Button key={s.id} variant="outline" className="w-full justify-start text-left h-auto py-2" onClick={() => { setIsAddFeedbackDialogOpen(false); handleAddFeedback(s.id); }}>
                <div className="flex flex-col text-sm">
                  <span className="font-bold">{s.topics_covered || s.title}</span>
                  <span className="text-xs text-muted-foreground">{new Date(s.session_date).toLocaleDateString()} | {s.facilitator_name}</span>
                </div>
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
