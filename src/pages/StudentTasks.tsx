import { useState, useEffect, useMemo } from 'react';
import { ListTodo, Search, Clock, CheckCircle2, History, ArrowRight, AlertCircle } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
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
}

export default function StudentTasks() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [tasks, setTasks] = useState<StudentTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'pending' | 'submitted' | 'completed' | 'overdue' | 'rejected'>('pending');
  const [searchQuery, setSearchQuery] = useState('');
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
        const { data: existingDbTasks } = await supabase
          .from('student_task_feedback')
          .select('id, task_name, task_description, deadline, feedback_type, status, feedback_notes, submission_link, created_at, earning_amount, rejection_comment')
          .in('student_id', studentIds)
          .or(`academic_year.eq."${selectedYear}",and(academic_year.is.null,created_at.gte."${startDate.toISOString()}",created_at.lte."${endDate.toISOString()}")`)
          .order('created_at', { ascending: false });

        if (existingDbTasks) {
          loadedTasks = [...existingDbTasks];
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

  const filteredTasks = useMemo(() => {
    return tasks.filter(task => {
      const matchesSearch = task.task_name?.toLowerCase().includes(searchQuery.toLowerCase());
      if (!matchesSearch) return false;

      if (selectedMonth !== 'all') {
        const dateToUse = task.deadline ? new Date(task.deadline) : new Date(task.created_at);
        const monthOfDate = dateToUse.getMonth() + 1;
        if (String(monthOfDate) !== selectedMonth) return false;
      }

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
    });
  }, [tasks, searchQuery, selectedMonth, filter]);

  const statusBadgeVariant = (status: string) => {
    if (status === 'submitted') return 'secondary';
    if (status === 'approved' || status === 'reviewed' || status === 'completed') return 'default';
    if (status === 'rejected') return 'destructive';
    return 'outline';
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
          <div className="relative w-full md:w-96">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search tasks..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 bg-muted/50 border-none focus-visible:ring-primary"
            />
          </div>
          <div className="flex gap-2 w-full md:w-auto overflow-x-auto pb-2 md:pb-0">
            <Button variant={filter === 'pending' ? 'default' : 'ghost'} onClick={() => setFilter('pending')} size="sm" className="gap-1.5">
              <History className="h-4 w-4" /> Pending
            </Button>
            <Button variant={filter === 'submitted' ? 'default' : 'ghost'} onClick={() => setFilter('submitted')} size="sm" className="gap-1.5">
              <CheckCircle2 className="h-4 w-4" /> Submitted
            </Button>
            <Button variant={filter === 'completed' ? 'default' : 'ghost'} onClick={() => setFilter('completed')} size="sm" className="gap-1.5 text-green-600 hover:text-green-700 hover:bg-green-50">
              <CheckCircle2 className="h-4 w-4" /> Approved
            </Button>
            <Button variant={filter === 'rejected' ? 'default' : 'ghost'} onClick={() => setFilter('rejected')} size="sm" className="gap-1.5 text-amber-600 hover:text-amber-700 hover:bg-amber-50">
              <AlertCircle className="h-4 w-4" /> Rejected
            </Button>
            <Button variant={filter === 'overdue' ? 'default' : 'ghost'} onClick={() => setFilter('overdue')} size="sm" className="gap-1.5 text-red-600 hover:text-red-700 hover:bg-red-50">
              <Clock className="h-4 w-4" /> Overdue
            </Button>
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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
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
                    <div className="text-xs text-muted-foreground font-medium flex gap-3">
                      <span>TYPE: {task.feedback_type.toUpperCase()}</span>
                      <span className="text-primary font-bold">Earn: {task.earning_amount || 5}</span>
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
        )}
      </div>
    </DashboardLayout>
  );
}
