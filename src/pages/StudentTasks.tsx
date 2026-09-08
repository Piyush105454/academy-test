import { useState, useEffect, useMemo } from 'react';
import { ListTodo, Search, Clock, CheckCircle2, History, ArrowRight, AlertCircle } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { LayoutGrid, List, ArrowUpDown } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { useAcademicYear } from '@/contexts/AcademicYearContext';
import { cn } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getScheduledTasks } from '@/utils/scheduledTasksStore';

interface StudentTask {
  id: string;
  task_name: string;
  task_description: string;
  deadline: string;
  feedback_type: string;
  status: string;
  feedback_notes?: string;
  submission_link?: string;
  created_at: string;
  earning_amount?: number;
  rejection_comment?: string | null;
  created_by?: string | null;
  incharge_name?: string;
  subjects?: { name: string } | null;
}

export default function StudentTasks() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' }>({ key: 'deadline', direction: 'asc' });
  const [tasks, setTasks] = useState<StudentTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'pending' | 'submitted' | 'completed' | 'overdue' | 'rejected'>('pending');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterSubject, setFilterSubject] = useState('all');
  const [filterTaskType, setFilterTaskType] = useState('all');
  const [filterIncharge, setFilterIncharge] = useState('all');
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
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

  const { selectedYear, getDateRange } = useAcademicYear();

  useEffect(() => {
    if (user?.email) {
      loadStudentTasks();
    }
  }, [user?.email, selectedYear]);

  const loadStudentTasks = async () => {
    try {
      setLoading(true);

      // 1. Check if user is linked to a student profile
      const { data: students } = await supabase
        .from('students')
        .select('id, name, class_id, classes(name)')
        .ilike('email', user?.email || '');

      let studentIds: string[] = [];
      let studentClassName = 'senior fellow';

      if (students && students.length > 0) {
        studentIds = students.map(s => s.id);
        const rawClassName = students[0]?.classes?.name || (Array.isArray(students[0]?.classes) && (students[0]?.classes as any)[0]?.name) || '';
        if (rawClassName) studentClassName = String(rawClassName).trim().toLowerCase();
      }

      const { startDate, endDate } = getDateRange();

      // 2. Load DB task submissions if student record exists
      let loadedTasks: StudentTask[] = [];
      if (studentIds.length > 0) {
        // Paginated fetch — load all tasks for this student (bypass 1000-row limit)
        let allTasks: any[] = [];
        let pageFrom = 0;
        const pageSize = 1000;
        while (true) {
          const { data: pageData } = await supabase
            .from('student_task_feedback')
            .select('id, task_name, task_description, deadline, feedback_type, status, feedback_notes, submission_link, created_at, earning_amount, rejection_comment, created_by, subjects(name)')
            .in('student_id', studentIds)
            .or(`academic_year.eq.${selectedYear},created_at.gte.${startDate.toISOString()}`)
            .order('created_at', { ascending: false })
            .range(pageFrom, pageFrom + pageSize - 1);

          if (!pageData || pageData.length === 0) break;
          allTasks = allTasks.concat(pageData);
          if (pageData.length < pageSize) break;
          pageFrom += pageSize;
        }

        if (allTasks.length > 0) {
          // Fetch incharge names
          const inchargeIds = Array.from(new Set(allTasks.map(t => t.created_by).filter(Boolean)));
          if (inchargeIds.length > 0) {
            const { data: profiles } = await supabase
              .from('user_profiles')
              .select('id, full_name')
              .in('id', inchargeIds);
            
            const profileMap = new Map((profiles || []).map(p => [p.id, p.full_name]));
            allTasks = allTasks.map(t => ({
              ...t,
              incharge_name: t.created_by ? profileMap.get(t.created_by) || 'Unknown' : 'System',
            }));
          } else {
            allTasks = allTasks.map(t => ({ ...t, incharge_name: 'System' }));
          }

          loadedTasks = allTasks;
        }
      }

      setTasks(loadedTasks);
    } catch (error) {
      console.error('Error loading tasks:', error);
      toast.error('Failed to load your tasks');
    } finally {
      setLoading(false);
    }
  };

  const uniqueSubjects = useMemo(() => {
    const subs = new Set<string>();
    tasks.forEach(t => {
      if (t.subjects?.name) subs.add(t.subjects.name);
    });
    return Array.from(subs).sort();
  }, [tasks]);

  const uniqueTaskTypes = useMemo(() => {
    const types = new Set<string>();
    tasks.forEach(t => {
      if (t.feedback_type) types.add(t.feedback_type.toUpperCase());
    });
    return Array.from(types).sort();
  }, [tasks]);

  const uniqueIncharges = useMemo(() => {
    const incharges = new Set<string>();
    tasks.forEach(t => {
      if (t.incharge_name) incharges.add(t.incharge_name);
    });
    return Array.from(incharges).sort();
  }, [tasks]);

  const filteredTasks = useMemo(() => {
    return tasks.filter(task => {
      const matchesSearch = task.task_name?.toLowerCase().includes(searchQuery.toLowerCase());
      if (!matchesSearch) return false;

      if (selectedMonth !== 'all') {
        const dateToUse = task.deadline ? new Date(task.deadline) : new Date(task.created_at);
        const monthOfDate = dateToUse.getMonth() + 1;
        if (String(monthOfDate) !== selectedMonth) return false;
      }

      if (filterSubject !== 'all' && task.subjects?.name !== filterSubject) return false;
      if (filterTaskType !== 'all' && task.feedback_type?.toUpperCase() !== filterTaskType) return false;
      if (filterIncharge !== 'all' && task.incharge_name !== filterIncharge) return false;

      if (filter === 'all') return true;
      if (filter === 'submitted') return task.status === 'submitted';
      if (filter === 'completed') return task.status === 'completed' || task.status === 'approved';
      if (filter === 'rejected') return task.status === 'rejected';
      if (filter === 'pending') {
        const isPending = task.status === 'pending' || task.status === 'rejected';
        const isUpcoming = !task.deadline || new Date(task.deadline) >= new Date();
        return isPending && isUpcoming;
      }
      if (filter === 'overdue') {
        const isPending = task.status === 'pending' || task.status === 'rejected';
        const isOverdue = task.deadline && new Date(task.deadline) < new Date();
        return isPending && isOverdue;
      }
      return true;
    }).sort((a, b) => {
      let aVal: any = a[sortConfig.key as keyof StudentTask] || '';
      let bVal: any = b[sortConfig.key as keyof StudentTask] || '';
      
      if (sortConfig.key === 'deadline') {
        aVal = a.deadline ? new Date(a.deadline).getTime() : 0;
        bVal = b.deadline ? new Date(b.deadline).getTime() : 0;
      }

      if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [tasks, searchQuery, selectedMonth, filter, filterSubject, filterTaskType, filterIncharge, sortConfig]);

  const statusBadgeVariant = (status: string) => {
    if (status === 'submitted') return 'secondary';
    if (status === 'approved' || status === 'reviewed' || status === 'completed') return 'default';
    if (status === 'rejected') return 'destructive';
    return 'outline';
  };

  const handleSort = (key: string) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <ListTodo className="h-8 w-8 text-primary" />
              My Tasks
            </h1>
            <p className="text-muted-foreground mt-1">Manage and track your assigned activities</p>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <div className="hidden md:flex border rounded-md overflow-hidden bg-background mr-2">
              <Button
                variant={viewMode === 'list' ? 'secondary' : 'ghost'}
                size="icon"
                onClick={() => setViewMode('list')}
                className="h-9 w-9 rounded-none"
                title="List View"
              >
                <List className="h-4 w-4" />
              </Button>
              <Button
                variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
                size="icon"
                onClick={() => setViewMode('grid')}
                className="h-9 w-9 rounded-none"
                title="Grid View"
              >
                <LayoutGrid className="h-4 w-4" />
              </Button>
            </div>
            <Select value={selectedMonth} onValueChange={setSelectedMonth}>
              <SelectTrigger className="w-full sm:w-[150px] bg-card border-border">
                <SelectValue placeholder="Filter by Month" />
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

        {/* Search & Filter Bar */}
        <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-card p-4 rounded-xl border border-border shadow-sm">
          <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto flex-1">
              <div className="relative w-full md:w-80 shrink-0">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search tasks..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 bg-muted/50 border-none focus-visible:ring-primary h-9"
                />
              </div>
              <Select value={filterSubject} onValueChange={setFilterSubject}>
                <SelectTrigger className="w-full sm:w-[150px] shrink-0 bg-muted/50 border-none h-9">
                  <SelectValue placeholder="All Subjects" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Subjects</SelectItem>
                  {uniqueSubjects.map(sub => <SelectItem key={sub} value={sub}>{sub}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filterTaskType} onValueChange={setFilterTaskType}>
                <SelectTrigger className="w-full sm:w-[150px] shrink-0 bg-muted/50 border-none h-9">
                  <SelectValue placeholder="All Types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  {uniqueTaskTypes.map(typ => <SelectItem key={typ} value={typ}>{typ}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          <div className="flex gap-2 w-full md:w-auto overflow-x-auto pb-2 md:pb-0">
            <Select value={filterIncharge} onValueChange={setFilterIncharge}>
              <SelectTrigger className="w-full sm:w-[150px] shrink-0 bg-muted/50 border-none h-9">
                <SelectValue placeholder="All Incharge" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Incharge</SelectItem>
                {uniqueIncharges.map(inc => <SelectItem key={inc} value={inc}>{inc}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filter} onValueChange={(val: any) => setFilter(val)}>
              <SelectTrigger className="w-full sm:w-[150px] shrink-0 bg-muted/50 border-none h-9">
                <SelectValue placeholder="All Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="submitted">Submitted</SelectItem>
                <SelectItem value="completed">Approved</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
                <SelectItem value="overdue">Overdue</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Task Grid */}
        {loading ? (
          <div className="flex justify-center py-12 text-sm text-muted-foreground font-medium">
            Loading tasks...
          </div>
        ) : filteredTasks.length === 0 ? (
          <Card className="border-dashed py-20">
            <CardContent className="flex flex-col items-center gap-4">
              <div className="p-4 bg-muted rounded-full">
                <ListTodo className="h-10 w-10 text-muted-foreground" />
              </div>
              <div className="text-center">
                <p className="text-lg font-medium">No tasks found</p>
                <p className="text-sm text-muted-foreground">Adjust your filters or search to find what you're looking for</p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Grid View (Always on Mobile, Optional on Desktop) */}
            <div className={cn("grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6", viewMode === 'list' && "md:hidden")}>
            {filteredTasks.map((task) => (
              <Card
                key={task.id}
                className="hover:shadow-md hover:-translate-y-0.5 transition-all cursor-pointer group border-border/50"
                onClick={() => navigate(`/student-tasks/${task.id}`)}
              >
                <CardHeader className="pb-3">
                  <div className="flex justify-between items-start">
                    <Badge variant={statusBadgeVariant(task.status)}>
                      {task.status}
                    </Badge>
                    {task.deadline && (() => {
                      const isPast = new Date(task.deadline) < new Date();
                      const isPending = task.status === 'pending';
                      return (
                        <div className={cn(
                          "text-[11px] font-semibold px-2 py-1 rounded-md border flex items-center gap-1",
                          isPast && isPending ? "bg-red-50 text-red-600 border-red-200" : "bg-blue-50 text-blue-700 border-blue-200"
                        )} title="Deadline">
                          <Clock className="h-3 w-3" />
                          {isPast && isPending ? "Overdue: " : "Due: "}
                          {new Date(task.deadline).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })}
                        </div>
                      );
                    })()}
                  </div>
                  <CardTitle className="text-xl mt-3 group-hover:text-primary transition-colors line-clamp-2">
                    {task.task_name}
                  </CardTitle>
                  {(task as any).task_id && (
                    <div className="font-mono text-[10px] text-muted-foreground mt-1.5 bg-muted/60 px-2 py-0.5 rounded w-fit">
                      {(task as any).task_id}
                    </div>
                  )}
                  <CardDescription className="line-clamp-2 mt-1">
                    {task.task_description
                      ? task.task_description.replace(/<[^>]*>/g, '').slice(0, 120) + (task.task_description.length > 120 ? '…' : '')
                      : 'No description provided'}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {(task.rejection_comment || task.feedback_notes) && (
                    <div className={cn("text-xs p-3 rounded-md mb-4 border", task.status === 'rejected' ? "bg-red-50 text-red-700 border-red-200" : "bg-green-50 text-green-700 border-green-200")}>
                      <span className="font-semibold block mb-1">
                        {task.status === 'rejected' ? 'Rejection Reason:' : 'Teacher Note:'}
                      </span>
                      <span className="line-clamp-2">{task.status === 'rejected' ? task.rejection_comment : task.feedback_notes}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between pt-4 border-t border-border mt-2">
                    <div className="text-[10px] sm:text-xs text-muted-foreground font-medium flex gap-2 sm:gap-3 flex-wrap items-center">
                      <span>TYPE: {task.feedback_type.toUpperCase()}</span>
                        {task.subjects?.name && <span>SUBJECT: {task.subjects.name.toUpperCase()}</span>}
                        {task.incharge_name && <span>INCHARGE: {task.incharge_name.toUpperCase()}</span>}
                      <span className="text-primary font-bold">&#8377; {task.earning_amount || 5}</span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 text-primary gap-1 group-hover:gap-2 transition-all"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/student-tasks/${task.id}`);
                      }}
                    >
                      View Details
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

            {/* Table View (Desktop Only) */}
          {viewMode === 'list' && (
            <div className="hidden md:block overflow-x-auto bg-card rounded-xl border border-border shadow-sm">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[300px] cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => handleSort('task_name')}>
                      <div className="flex items-center gap-1">Task Name <ArrowUpDown className="h-3 w-3" /></div>
                    </TableHead>
                    <TableHead className="cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => handleSort('feedback_type')}>
                        <div className="flex items-center gap-1">Type <ArrowUpDown className="h-3 w-3" /></div>
                      </TableHead>
                      <TableHead>Subject</TableHead>
                      <TableHead>Incharge</TableHead>
                    <TableHead className="cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => handleSort('status')}>
                      <div className="flex items-center gap-1">Status <ArrowUpDown className="h-3 w-3" /></div>
                    </TableHead>
                    <TableHead className="cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => handleSort('deadline')}>
                      <div className="flex items-center gap-1">Deadline <ArrowUpDown className="h-3 w-3" /></div>
                    </TableHead>
                    <TableHead className="cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => handleSort('earning_amount')}>
                      <div className="flex items-center gap-1">Earning <ArrowUpDown className="h-3 w-3" /></div>
                    </TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTasks.map((task) => {
                    const isPast = task.deadline ? new Date(task.deadline) < new Date() : false;
                    const isPending = task.status === 'pending';

                    return (
                      <TableRow key={task.id} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/student-tasks/${task.id}`)}>
                        <TableCell className="font-medium">
                          <div className="line-clamp-2" title={task.task_name}>{task.task_name}</div>
                          {(task as any).task_id && (
                            <div className="font-mono text-[10px] text-muted-foreground mt-1 bg-muted px-1.5 py-0.5 rounded w-fit">
                              {(task as any).task_id}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                            <span className="text-xs text-muted-foreground">{task.feedback_type.toUpperCase()}</span>
                          </TableCell>
                          <TableCell>
                            <span className="text-xs text-muted-foreground">{task.subjects?.name || '-'}</span>
                          </TableCell>
                          <TableCell>
                            <span className="text-xs text-muted-foreground">{task.incharge_name || '-'}</span>
                          </TableCell>
                        <TableCell>
                          <Badge variant={statusBadgeVariant(task.status)}>
                            {task.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {task.deadline ? (
                            <div className={cn(
                              "text-xs px-2 py-1 rounded-md border inline-flex items-center gap-1 whitespace-nowrap",
                              isPast && isPending ? "bg-red-50 text-red-600 border-red-200" : "bg-blue-50 text-blue-700 border-blue-200"
                            )}>
                              <Clock className="h-3 w-3" />
                              {isPast && isPending ? "Overdue" : "Due"}
                              <span className="hidden lg:inline ml-1">
                                {new Date(task.deadline).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })}
                              </span>
                            </div>
                          ) : (
                            <span className="text-muted-foreground text-xs">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <span className="text-primary font-bold">&#8377; {task.earning_amount || 5}</span>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm" className="h-8 text-primary group-hover:gap-2 transition-all">
                            View
                            <ArrowRight className="h-3.5 w-3.5 ml-1" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              </div>
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
