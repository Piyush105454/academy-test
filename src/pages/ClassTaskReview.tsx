import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAcademicYear } from '@/contexts/AcademicYearContext';
import { parseSubmissionRequirements, parseSubmissionLinks } from "../utils/submissionUtils";
import { cn } from '@/lib/utils';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  MoreVertical, 
  CheckCircle2, 
  ExternalLink,
  ClipboardList,
  Search,
  User,
  CheckCircle,
  Clock,
  ChevronDown,
  History
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Progress } from "@/components/ui/progress";

interface TaskRecord {
  id: string;
  task_name: string;
  status: string;
  deadline: string;
  submission_link: string | null;
  feedback_type: string;
  student_id: string;
  earning_amount?: number;
  submission_types?: string[];
}

interface StudentGroup {
  id: string;
  name: string;
  tasks: TaskRecord[];
  completedCount: number;
  totalCount: number;
  progress: number;
}

export default function ClassTaskReview() {
  const { user } = useAuth();
  const [studentGroups, setStudentGroups] = useState<StudentGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [className, setClassName] = useState('');
  const { selectedYear, getDateRange } = useAcademicYear();

  useEffect(() => {
    if (user?.email) {
      loadClassTasks();
    }
  }, [user, selectedYear]);

  const loadClassTasks = async () => {
    try {
      setLoading(true);

      // 1. Get the current student's class_id
      const { data: student, error: studentError } = await (supabase as any)
        .from('students')
        .select('id, class_id, classes(name)')
        .ilike('email', user?.email || '')
        .limit(1)
        .maybeSingle();

      if (studentError || !student) {
        console.error('Error fetching student record:', studentError);
        setLoading(false);
        return;
      }

      if (!student.id || !student.class_id) {
        console.error('Student ID or Class ID is missing');
        setLoading(false);
        return;
      }

      setClassName((student.classes as any)?.name || 'My Class');

      // 2. Get all students assigned to this monitor (current logged-in student)
      const { data: classmates, error: classmatesError } = await supabase
        .from('students')
        .select('id, name')
        .eq('monitor_id', student.id)
        .order('name', { ascending: true });

      if (classmatesError) throw classmatesError;

      if (classmates.length === 0) {
        setStudentGroups([]);
        setLoading(false);
        return;
      }

      const classmateIds = classmates.map(c => c.id);

      // 3. Get tasks for all classmates filtered by academic year
      const { startDate, endDate } = getDateRange();
      const { data: tasksData, error: tasksError } = await supabase
        .from('student_task_feedback')
        .select(`
          id,
          task_name,
          status,
          deadline,
          submission_link,
          feedback_type,
          student_id,
          earning_amount,
          submission_types,
          created_at
        `)
        .in('student_id', classmateIds)
        .gte('created_at', startDate.toISOString())
        .lte('created_at', endDate.toISOString())
        .order('deadline', { ascending: true });

      if (tasksError) throw tasksError;

      // 4. Group tasks by student
      const groups: StudentGroup[] = classmates.map(s => {
        const studentTasks = (tasksData || []).filter(t => t.student_id === s.id);
        const completed = studentTasks.filter(t => t.status === 'completed').length;
        const total = studentTasks.length;
        return {
          id: s.id,
          name: s.name,
          tasks: studentTasks,
          completedCount: completed,
          totalCount: total,
          progress: total > 0 ? Math.round((completed / total) * 100) : 0
        };
      });

      setStudentGroups(groups);
    } catch (error: any) {
      console.error('Detailed error loading class tasks:', error);
      toast.error('Failed to load class tasks: ' + (error.message || 'Unknown error'));
    } finally {
      setLoading(false);
    }
  };

  const handleMarkCompleted = async (taskId: string, studentId: string, taskName: string) => {
    try {
      // Find the task to get its earning amount
      const studentGroup = studentGroups.find(g => g.id === studentId);
      const task = studentGroup?.tasks.find(t => t.id === taskId);
      
      // Validation: student must have submitted the homework before it can be verified
      if (task && task.status !== 'submitted') {
        toast.error('Student needs to submit homework first');
        return;
      }

      const amount = task?.earning_amount || 5;

      const { data, error: updateError } = await supabase
        .from('student_task_feedback')
        .update({ status: 'completed', earning_amount: amount, verified_by: user?.id || null, updated_at: new Date().toISOString() })
        .eq('id', taskId)
        .select();

      if (updateError) throw updateError;
      
      if (!data || data.length === 0) {
        throw new Error('No rows updated. You might not have permission or student mapping is incorrect.');
      }

      // Add or update earning record
      const earningDesc = `Completed task: ${taskName} (Verified by Class Monitor)`;
      const { data: existingEarning } = await supabase
        .from('student_earnings')
        .select('id')
        .eq('student_id', studentId)
        .eq('task_id', taskId)
        .maybeSingle();

      let earningError = null;
      if (existingEarning) {
        const { error } = await supabase
          .from('student_earnings')
          .update({ amount: amount, description: earningDesc })
          .eq('id', existingEarning.id);
        earningError = error;
      } else {
        const { error } = await supabase.from('student_earnings').insert({
          student_id: studentId,
          task_id: taskId,
          amount: amount,
          description: earningDesc
        });
        earningError = error;
      }

      if (earningError) {
        console.error('Error adding earnings:', earningError);
        toast.warning('Task completed, but failed to add earnings');
      } else {
        toast.success('Task marked as completed and earnings added/synced');
      }

      // Add reviewer earning if the verifying user is a student (class leader/monitor)
      if (user?.email) {
        const { data: reviewerStudent } = await supabase
          .from('students')
          .select('id, name')
          .ilike('email', user.email)
          .limit(1)
          .maybeSingle();

        if (reviewerStudent) {
          const { data: configData } = await supabase
            .from('reward_configurations')
            .select('reviewer_rate')
            .eq('task_type', task?.feedback_type)
            .maybeSingle();

          const reviewerRate = configData?.reviewer_rate ? Number(configData.reviewer_rate) : 0;
          if (reviewerRate > 0) {
            const reviewerDesc = `Reviewed task: ${taskName} for ${studentGroup?.name || 'student'}`;
            const { error: reviewerEarningError } = await supabase.from('student_earnings').insert({
              student_id: reviewerStudent.id,
              task_id: taskId,
              amount: reviewerRate,
              description: reviewerDesc
            });

            if (reviewerEarningError) {
              console.error('Error adding reviewer earnings:', reviewerEarningError);
            } else {
              toast.success(`Added ₹${reviewerRate} reviewer earning for ${reviewerStudent.name}`);
            }
          }
        }
      }
      
      loadClassTasks();
    } catch (error: any) {
      console.error('Error completing task:', error);
      toast.error('Failed to update task status: ' + (error.message || 'Unknown error'));
    }
  };

  const handleResetToPending = async (taskId: string) => {
    try {
      if (!confirm('Are you sure you want to reset this task? This will remove the student\'s earnings for this task.')) return;
      
      const { data, error } = await supabase
        .from('student_task_feedback')
        .update({ status: 'pending', updated_at: new Date().toISOString() })
        .eq('id', taskId)
        .select();

      if (error) throw error;
      
      if (!data || data.length === 0) {
        throw new Error('No rows updated. You might not have permission or student mapping is incorrect.');
      }

      // Remove earnings associated with this task
      await supabase
        .from('student_earnings')
        .delete()
        .eq('task_id', taskId);

      toast.success('Task reset to pending and earnings removed');
      loadClassTasks();
    } catch (error: any) {
      console.error('Error resetting task:', error);
      toast.error('Failed to reset task: ' + (error.message || 'Unknown error'));
    }
  };

  const filteredGroups = studentGroups.filter(g => 
    g.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    g.tasks.some(t => t.task_name.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-6xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-3">
              <ClipboardList className="h-9 w-9 text-primary" />
              My Assigned Students
            </h1>
            <p className="text-muted-foreground mt-1">
              Monitoring tasks for your assigned students in <span className="font-semibold text-foreground">{className}</span>
            </p>
          </div>
          <div className="relative w-full md:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search student or task..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-11 bg-card border-primary/20 focus:border-primary shadow-sm"
            />
          </div>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
            <p className="text-muted-foreground animate-pulse">Loading class data...</p>
          </div>
        ) : filteredGroups.length === 0 ? (
          <Card className="border-dashed border-2 py-12">
            <CardContent className="flex flex-col items-center justify-center text-center">
              <div className="bg-muted p-4 rounded-full mb-4">
                <Search className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold">No students assigned to you yet</h3>
              <p className="text-muted-foreground">Ask an administrator to assign students to you for monitoring</p>
              <div className="mt-4 text-xs text-muted-foreground border-t pt-4">
                Logged in as: <span className="font-mono">{user?.email}</span>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Accordion type="multiple" className="space-y-4">
            {filteredGroups.map((group) => (
              <AccordionItem 
                key={group.id} 
                value={group.id}
                className="bg-card border border-border/60 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow"
              >
                <AccordionTrigger className="px-6 py-4 hover:no-underline">
                  <div className="flex flex-1 items-center justify-between gap-4 pr-4">
                    <div className="flex items-center gap-4">
                      <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                        <User className="h-5 w-5" />
                      </div>
                      <div className="text-left">
                        <h3 className="font-bold text-lg leading-tight">{group.name}</h3>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant="outline" className="text-[10px] uppercase font-bold py-0 h-5">
                            {group.completedCount}/{group.totalCount} Tasks
                          </Badge>
                          {group.progress === 100 && (
                            <Badge className="bg-green-500 hover:bg-green-600 text-white text-[10px] py-0 h-5">
                              Completed
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                    
                    <div className="hidden md:flex flex-col items-end gap-1 w-48">
                      <div className="flex justify-between w-full text-[10px] font-bold text-muted-foreground">
                        <span>PROGRESS</span>
                        <span>{group.progress}%</span>
                      </div>
                      <Progress value={group.progress} className="h-1.5 w-full" />
                    </div>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="px-6 pb-6 pt-0">
                  <div className="mt-4 border rounded-lg overflow-hidden bg-muted/30">
                    <Table>
                      <TableHeader className="bg-muted/50">
                        <TableRow>
                          <TableHead className="text-xs uppercase font-bold">Category</TableHead>
                          <TableHead className="text-xs uppercase font-bold">Task Details</TableHead>
                          <TableHead className="text-xs uppercase font-bold">Deadline</TableHead>
                          <TableHead className="text-xs uppercase font-bold">Status</TableHead>
                          <TableHead className="text-xs uppercase font-bold">Submission</TableHead>
                          <TableHead className="text-xs uppercase font-bold text-right">Action</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {group.tasks.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={6} className="text-center py-8 text-muted-foreground text-sm italic">
                              No tasks assigned to this student.
                            </TableCell>
                          </TableRow>
                        ) : (
                          group.tasks.map((task) => (
                            <TableRow key={task.id} className="hover:bg-muted/50 transition-colors">
                              <TableCell>
                                <Badge variant="secondary" className="text-[10px] bg-blue-50 text-blue-700 border-blue-100">
                                  {task.feedback_type}
                                </Badge>
                              </TableCell>
                              <TableCell className="font-medium max-w-[200px] truncate">
                                {task.task_name}
                              </TableCell>
                              <TableCell className="text-xs">
                                <div className="flex flex-col text-muted-foreground">
                                  <div className="flex items-center gap-1 font-medium text-foreground">
                                    <Clock className="h-3 w-3 text-primary shrink-0" />
                                    <span>{new Date(task.deadline).toLocaleDateString()}</span>
                                  </div>
                                  <span className="text-[10px] text-muted-foreground pl-4">
                                    {new Date(task.deadline).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true })}
                                  </span>
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-1.5">
                                  {task.status === 'completed' ? (
                                    <CheckCircle className="h-4 w-4 text-green-500" />
                                  ) : (
                                    <div className="h-2 w-2 rounded-full bg-yellow-500" />
                                  )}
                                  <span className={cn(
                                    "text-xs font-medium",
                                    task.status === 'completed' ? "text-green-600" : "text-yellow-600"
                                  )}>
                                    {task.status}
                                  </span>
                                </div>
                              </TableCell>
                              <TableCell>
                                {task.submission_link ? (() => {
                                  const reqs = parseSubmissionRequirements(task.submission_types);
                                  const links = parseSubmissionLinks(task.submission_link, reqs);
                                  const hasAny = Object.values(links).some(l => l.trim() !== '');
                                  
                                  if (!hasAny) return <span className="text-xs text-muted-foreground italic">No submission</span>;
                                  
                                  return (
                                    <div className="flex flex-col gap-1.5">
                                      {reqs.map(req => {
                                        const linkStr = links[req.id];
                                        if (!linkStr) return null;
                                        const splitLinks = linkStr.split(',').filter(Boolean);
                                        if (splitLinks.length === 0) return null;
                                        
                                        return (
                                          <div key={req.id} className="flex flex-col gap-0.5">
                                            <span className="text-[10px] font-semibold text-gray-500 uppercase">{req.title}</span>
                                            <div className="flex flex-wrap gap-1">
                                              {splitLinks.map((link, idx) => (
                                                <a
                                                  key={idx}
                                                  href={link.trim().startsWith('http') ? link.trim() : `https://${link.trim()}`}
                                                  target="_blank"
                                                  rel="noopener noreferrer"
                                                  className="inline-flex items-center gap-1 text-[10px] text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-2 py-0.5 rounded transition-colors"
                                                >
                                                  <ExternalLink className="h-2.5 w-2.5" />
                                                  View {splitLinks.length > 1 ? idx + 1 : ''}
                                                </a>
                                              ))}
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  );
                                })() : (
                                  <span className="text-xs text-muted-foreground italic">No submission</span>
                                )}
                              </TableCell>
                              <TableCell className="text-right">
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-muted">
                                      <MoreVertical className="h-4 w-4" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                    <DropdownMenuItem 
                                      onClick={() => handleMarkCompleted(task.id, group.id, task.task_name)}
                                      className="text-green-600 font-medium focus:text-green-600 focus:bg-green-50"
                                    >
                                      <CheckCircle2 className="h-4 w-4 mr-2" />
                                      {task.status === 'completed' ? 'Re-Verify / Sync Earnings' : 'Verify Completion'}
                                    </DropdownMenuItem>
                                    <DropdownMenuItem 
                                      onClick={() => handleResetToPending(task.id)}
                                      disabled={task.status === 'pending'}
                                      className="text-amber-600 font-medium focus:text-amber-600 focus:bg-amber-50"
                                    >
                                      <History className="h-4 w-4 mr-2" />
                                      Reset to Pending
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        )}
      </div>
    </DashboardLayout>
  );
}
