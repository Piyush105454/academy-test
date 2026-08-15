import { useState, useEffect, useMemo } from 'react';
import { Wallet, TrendingUp, History, Gift, CheckCircle2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { toast } from 'sonner';
import { useAcademicYear } from '@/contexts/AcademicYearContext';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

interface EarningRecord {
  id: string;
  amount: number;
  earned_at: string;
  description: string;
  task_id?: string;
  task_id_code?: string;
  task_name?: string;
  deadline?: string;
  subject_name?: string;
  session_title?: string;
}

interface RewardConfig {
  id: string;
  task_type: string;
  expected_tasks: number;
  frequency: string;
  rate_per_task: number;
  potential_monthly: number;
  how_to_earn: string;
}

const DEFAULT_EARNING_POTENTIAL = [
  { task_type: 'English Reading & speaking Task', expected_tasks: 2, frequency: 'Daily', rate_per_task: 5, potential_monthly: 10, how_to_earn: 'Read, Write, Speak & Record The Given article and earn.' },
  { task_type: 'CCC - Computers - Task', expected_tasks: 1, frequency: 'Daily', rate_per_task: 10, potential_monthly: 10, how_to_earn: 'Complete the assigned homework, research and write and earn' },
  { task_type: 'GT Session Task', expected_tasks: 1, frequency: 'Daily', rate_per_task: 20, potential_monthly: 20, how_to_earn: 'Complete GT Session task and earn' },
  { task_type: 'Mentor connect Task', expected_tasks: 2, frequency: 'Monthly', rate_per_task: 400, potential_monthly: 800, how_to_earn: 'Connect with your mentor complete the mentprhsip sessions as per the agenda share record timey and earn' },
  { task_type: 'Bonus for 100% attendance', expected_tasks: 25, frequency: 'Monthly', rate_per_task: 8, potential_monthly: 200, how_to_earn: 'Achive 100% attendance and earn bonus of 200 rs' },
];

export default function StudentEarnings() {
  const { user } = useAuth();
  const [earnings, setEarnings] = useState<EarningRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [rewardConfigs, setRewardConfigs] = useState<RewardConfig[]>([]);
  const [subjects, setSubjects] = useState<{id: string, name: string}[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterSubject, setFilterSubject] = useState('all');
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    return String(new Date().getMonth()); // 0 to 11 (0-indexed matching SelectItem values)
  });
  const { selectedYear, getDateRange } = useAcademicYear();

  useEffect(() => {
    if (user?.email) {
      loadEarningsData();
      fetchRewardConfigs();
      fetchSubjects();
    }
  }, [user?.email, selectedYear]);

  const filteredEarnings = useMemo(() => {
    return earnings.filter(record => {
      const matchesSearch = 
        (record.task_name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (record.description || '').toLowerCase().includes(searchQuery.toLowerCase());
      const matchesSubject = filterSubject === 'all' || record.subject_name === filterSubject;
      const recordDate = new Date(record.earned_at);
      const matchesMonth = selectedMonth === 'all' || recordDate.getMonth().toString() === selectedMonth;
      return matchesSearch && matchesSubject && matchesMonth;
    });
  }, [earnings, searchQuery, filterSubject, selectedMonth]);

  // Filter earnings to exclude premature attendance bonuses for ongoing months until month end
  const validEarnings = useMemo(() => {
    const today = new Date();
    const currentMonthIdx = today.getMonth();
    const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
    const isCurrentMonthEnded = today.getDate() === lastDayOfMonth;

    return filteredEarnings.filter(r => {
      const desc = (r.description || '').toLowerCase();
      const taskName = (r.task_name || '').toLowerCase();
      const isAttendanceBonus = desc.includes('attendance') || taskName.includes('attendance');

      if (isAttendanceBonus) {
        const earnedDate = new Date(r.earned_at);
        const isCurrentMonth = earnedDate.getMonth() === currentMonthIdx && earnedDate.getFullYear() === today.getFullYear();
        if (isCurrentMonth && !isCurrentMonthEnded) {
          return false;
        }
      }
      return true;
    });
  }, [filteredEarnings]);

  const totalBalance = useMemo(() => {
    return validEarnings.reduce((sum, item) => sum + item.amount, 0);
  }, [validEarnings]);

  const categoryBreakdown = useMemo(() => {
    const matchedRecordIds = new Set<string>();
    const configsToUse = rewardConfigs.length > 0 ? rewardConfigs : DEFAULT_EARNING_POTENTIAL;

    const breakdown = configsToUse.map(config => {
      const taskTypeLower = (config.task_type || '').toLowerCase();
      
      const matchingRecords = validEarnings.filter(r => {
        const taskName = (r.task_name || '').toLowerCase();
        const desc = (r.description || '').toLowerCase();
        const subj = (r.subject_name || '').toLowerCase();

        let isMatch = false;
        if (taskTypeLower.includes('attendance') && (desc.includes('attendance') || taskName.includes('attendance'))) {
          isMatch = true;
        } else if (taskTypeLower.includes('ccc') || taskTypeLower.includes('computer')) {
          if (desc.includes('ccc') || desc.includes('computer') || taskName.includes('ccc') || taskName.includes('computer') || subj.includes('ccc') || subj.includes('computer')) {
            isMatch = true;
          }
        } else if (taskTypeLower.includes('english') || taskTypeLower.includes('reading') || taskTypeLower.includes('speaking')) {
          if (desc.includes('english') || desc.includes('reading') || taskName.includes('english') || taskName.includes('reading') || subj.includes('english')) {
            isMatch = true;
          }
        } else if (taskTypeLower.includes('gt') || taskTypeLower.includes('guest teacher') || taskTypeLower.includes('session')) {
          if (desc.includes('gt') || desc.includes('guest teacher') || desc.includes('session') || taskName.includes('gt') || taskName.includes('guest teacher')) {
            isMatch = true;
          }
        } else if (taskTypeLower.includes('mentor')) {
          if (desc.includes('mentor') || taskName.includes('mentor')) {
            isMatch = true;
          }
        }

        if (isMatch) {
          matchedRecordIds.add(r.id);
        }
        return isMatch;
      });

      const earnedAmount = matchingRecords.reduce((sum, r) => sum + r.amount, 0);
      const completedCount = matchingRecords.length;

      return {
        ...config,
        earnedAmount,
        completedCount,
      };
    });

    const otherRecords = validEarnings.filter(r => !matchedRecordIds.has(r.id));
    if (otherRecords.length > 0) {
      const otherEarned = otherRecords.reduce((sum, r) => sum + r.amount, 0);
      breakdown.push({
        id: 'other',
        task_type: 'Other / Custom Earning Rewards',
        expected_tasks: 0,
        frequency: 'Custom',
        rate_per_task: 0,
        potential_monthly: 0,
        how_to_earn: 'Additional custom or bonus rewards assigned directly',
        earnedAmount: otherEarned,
        completedCount: otherRecords.length,
      });
    }

    return breakdown;
  }, [validEarnings, rewardConfigs]);

  const totalPotentialMonthly = useMemo(() => {
    const configsToUse = rewardConfigs.length > 0 ? rewardConfigs : DEFAULT_EARNING_POTENTIAL;
    return configsToUse.reduce((sum, c) => sum + (c.potential_monthly || (c.expected_tasks * c.rate_per_task) || 0), 0);
  }, [rewardConfigs]);

  const totalCategoryEarned = useMemo(() => {
    return categoryBreakdown.reduce((sum, c) => sum + c.earnedAmount, 0);
  }, [categoryBreakdown]);

  const totalCompletedTasks = useMemo(() => {
    return categoryBreakdown.reduce((sum, c) => sum + c.completedCount, 0);
  }, [categoryBreakdown]);

  const fetchSubjects = async () => {
    const { data } = await supabase.from('subjects').select('id, name').order('name');
    if (data) setSubjects(data);
  };

  const fetchRewardConfigs = async () => {
    try {
      const { data, error } = await supabase
        .from('reward_configurations')
        .select('*')
        .order('task_type');

      if (error) {
        setRewardConfigs(DEFAULT_EARNING_POTENTIAL as any);
        return;
      }

      if (data && data.length > 0) {
        setRewardConfigs(data);
      } else {
        setRewardConfigs(DEFAULT_EARNING_POTENTIAL as any);
      }
    } catch (error) {
      console.error('Error fetching configs:', error);
      setRewardConfigs(DEFAULT_EARNING_POTENTIAL as any);
    }
  };

  const loadEarningsData = async () => {
    try {
      setLoading(true);
      
      // Get all student records first
      const { data: students, error: studentError } = await supabase
        .from('students')
        .select('id')
        .ilike('email', user?.email);

      if (studentError) throw studentError;

      if (!students || students.length === 0) {
        setEarnings([]);
        setLoading(false);
        return;
      }

      const studentIds = students.map(s => s.id);

      // Fetch from student_earnings table filtered by academic year
      const { startDate, endDate } = getDateRange();
      const { data: earningsData, error: earningsError } = await supabase
        .from('student_earnings')
        .select(`
          id,
          amount,
          earned_at,
          description,
          task_id,
          task:task_id(
            task_name, 
            task_id,
            deadline,
            subject:subjects(name),
            session:sessions(title)
          )
        `)
        .in('student_id', studentIds)
        .gte('earned_at', startDate.toISOString())
        .lte('earned_at', endDate.toISOString())
        .order('earned_at', { ascending: false });

      if (earningsError) throw earningsError;

      const formatted: EarningRecord[] = (earningsData || []).map((item: any) => {
        const taskData = Array.isArray(item.task) ? item.task[0] : item.task;
        return {
          id: item.id,
          amount: parseFloat(item.amount),
          earned_at: item.earned_at,
          description: item.description,
          task_id: item.task_id,
          task_id_code: taskData?.task_id,
          task_name: taskData?.task_name,
          deadline: taskData?.deadline,
          subject_name: taskData?.subject?.name,
          session_title: taskData?.session?.title || item.description
        };
      });

      setEarnings(formatted);
    } catch (error) {
      console.error('Error loading earnings:', error);
      toast.error('Failed to load earnings data');
    } finally {
      setLoading(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2 text-foreground">
            <Wallet className="h-8 w-8 text-green-600" />
            My Earnings
          </h1>
          <p className="text-muted-foreground mt-1 font-medium">
            You can earn up to <span className="text-primary font-bold">₹{rewardConfigs.reduce((sum, r) => sum + (r.expected_tasks * r.rate_per_task), 0).toLocaleString()}</span> every month by completing all your tasks!
          </p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="bg-gradient-to-br from-green-600 to-green-700 text-white border-none shadow-lg overflow-hidden relative group">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-125 transition-transform duration-500">
                <Wallet className="h-24 w-24" />
            </div>
            <CardHeader className="pb-2">
              <CardTitle className="text-green-100 flex items-center gap-2 text-sm font-medium uppercase tracking-wider">
                Total Balance
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-black flex items-baseline gap-1">
                <span className="text-2xl font-light opacity-80">₹</span>
                {totalBalance.toLocaleString()}
              </div>
              <div className="mt-4 flex items-center gap-2 text-green-100 text-sm bg-white/10 w-fit px-2 py-1 rounded">
                <TrendingUp className="h-4 w-4" />
                <span>Steady Growth</span>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white/50 backdrop-blur-sm border-border/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-muted-foreground flex items-center gap-2 text-sm font-medium uppercase tracking-wider">
                Tasks Completed
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold flex items-baseline gap-2">
                {filteredEarnings.filter(e => e.task_id).length}
                <span className="text-sm font-normal text-muted-foreground">Activities</span>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-blue-600 to-indigo-700 text-white border-none shadow-lg overflow-hidden relative group">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-125 transition-transform duration-500">
                <TrendingUp className="h-24 w-24" />
            </div>
            <CardHeader className="pb-2">
              <CardTitle className="text-blue-100 flex items-center gap-2 text-sm font-medium uppercase tracking-wider">
                Monthly Potential
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-black flex items-baseline gap-1">
                <span className="text-2xl font-light opacity-80">₹</span>
                {rewardConfigs.reduce((sum, r) => sum + (r.expected_tasks * r.rate_per_task), 0).toLocaleString()}
              </div>
              <div className="mt-4 flex items-center gap-2 text-blue-100 text-sm bg-white/10 w-fit px-2 py-1 rounded">
                <CheckCircle2 className="h-4 w-4" />
                <span>Max Possible Earning</span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Reward Criteria & Monthly Potential Breakdown */}
        <Card className="border border-border">
          <CardHeader className="border-b bg-muted/20">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <CardTitle className="text-lg font-bold flex items-center gap-2 text-foreground">
                  <TrendingUp className="h-5 w-5 text-blue-600" />
                  Monthly Reward Structure & Earned Breakdown
                </CardTitle>
                <CardDescription>
                  See how much money you can earn for each task type and your current progress
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 text-xs">
                  <TableHead className="font-bold">Task Type / Criteria</TableHead>
                  <TableHead className="font-bold">Frequency</TableHead>
                  <TableHead className="font-bold text-right">Rate (₹)</TableHead>
                  <TableHead className="font-bold text-right">Monthly Potential (₹)</TableHead>
                  <TableHead className="font-bold text-center">Tasks Completed</TableHead>
                  <TableHead className="font-bold text-right">My Earnings (₹)</TableHead>
                  <TableHead className="font-bold text-center">Status / Cap</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {categoryBreakdown.map((item) => (
                  <TableRow key={item.task_type}>
                    <TableCell>
                      <div className="font-semibold text-sm text-foreground">{item.task_type}</div>
                      <div className="text-[11px] text-muted-foreground">{item.how_to_earn}</div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="text-[10px] font-extrabold uppercase">
                        {item.frequency}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-medium text-green-600 dark:text-green-400">
                      ₹{item.rate_per_task}
                    </TableCell>
                    <TableCell className="text-right font-bold text-blue-600 dark:text-blue-400">
                      ₹{item.potential_monthly || (item.expected_tasks * item.rate_per_task)}
                    </TableCell>
                    <TableCell className="text-center font-bold text-sm">
                      {item.completedCount}
                    </TableCell>
                    <TableCell className="text-right font-black text-green-600 dark:text-green-400">
                      ₹{item.earnedAmount.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-center">
                      {(item.potential_monthly || (item.expected_tasks * item.rate_per_task)) > 0 ? (
                        <Badge
                          variant={item.earnedAmount >= (item.potential_monthly || (item.expected_tasks * item.rate_per_task)) ? "default" : item.earnedAmount > 0 ? "secondary" : "outline"}
                          className="text-[10px] font-bold"
                        >
                          {Math.min(100, Math.round((item.earnedAmount / (item.potential_monthly || (item.expected_tasks * item.rate_per_task))) * 100))}% Cap Achieved
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-[10px] font-bold">
                          ₹{item.earnedAmount} Earned
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="bg-muted/30 font-bold border-t-2">
                  <TableCell colSpan={3} className="text-right text-sm font-extrabold uppercase tracking-wide text-foreground">
                    Total Potential Monthly:
                  </TableCell>
                  <TableCell className="text-right text-base font-black text-blue-600 dark:text-blue-400">
                    ₹{totalPotentialMonthly.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-center text-base font-black text-foreground">
                    {totalCompletedTasks}
                  </TableCell>
                  <TableCell className="text-right text-base font-black text-green-600 dark:text-green-400">
                    ₹{totalCategoryEarned.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant="default" className="text-[11px] font-bold bg-green-600">
                      {totalPotentialMonthly > 0 ? `${Math.min(100, Math.round((totalCategoryEarned / totalPotentialMonthly) * 100))}% Overall` : '-'}
                    </Badge>
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Transaction History Filters */}
        <div className="flex flex-col sm:flex-row gap-4 items-end">
          <div className="w-full sm:w-64">
            <Label className="mb-2 block">Search Task</Label>
            <Input 
              placeholder="Search by task or description..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="w-full sm:w-48">
            <Label className="mb-2 block">Filter Subject</Label>
            <Select value={filterSubject} onValueChange={setFilterSubject}>
              <SelectTrigger>
                <SelectValue placeholder="All Subjects" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Subjects</SelectItem>
                {subjects.map(s => (
                  <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="w-full sm:w-48">
            <Label className="mb-2 block">Filter Month</Label>
            <Select value={selectedMonth} onValueChange={setSelectedMonth}>
              <SelectTrigger>
                <SelectValue placeholder="All Months" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Months</SelectItem>
                <SelectItem value="5">June</SelectItem>
                <SelectItem value="6">July</SelectItem>
                <SelectItem value="7">August</SelectItem>
                <SelectItem value="8">September</SelectItem>
                <SelectItem value="9">October</SelectItem>
                <SelectItem value="10">November</SelectItem>
                <SelectItem value="11">December</SelectItem>
                <SelectItem value="0">January</SelectItem>
                <SelectItem value="1">February</SelectItem>
                <SelectItem value="2">March</SelectItem>
                <SelectItem value="3">April</SelectItem>
                <SelectItem value="4">May</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Transaction History */}
        <Card className="shadow-sm border-border/50">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                    <History className="h-5 w-5 text-primary" />
                    Transaction History
                </CardTitle>
                <CardDescription>Recent earnings and rewards</CardDescription>
              </div>
              <Gift className="h-8 w-8 text-muted/20" />
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center py-10">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            ) : earnings.length === 0 ? (
              <div className="text-center py-12 bg-muted/20 rounded-xl border border-dashed">
                <p className="text-muted-foreground font-medium">No transactions yet</p>
                <p className="text-xs text-muted-foreground mt-1 text-balance max-w-xs mx-auto">
                    Complete your first task to start earning rewards!
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead>Task ID</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Task / Activity</TableHead>
                      <TableHead>Subject</TableHead>
                      <TableHead>Session</TableHead>
                      <TableHead>Deadline</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(() => {
                      if (validEarnings.length === 0) {
                        return (
                          <TableRow>
                            <TableCell colSpan={8} className="text-center py-6 text-muted-foreground">
                              No matching transactions found
                            </TableCell>
                          </TableRow>
                        );
                      }

                      return validEarnings.map((record) => (
                        <TableRow key={record.id} className="hover:bg-muted/30 transition-colors">
                          <TableCell className="font-mono text-xs text-muted-foreground whitespace-nowrap">
                            {record.task_id_code || '-'}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                            {new Date(record.earned_at).toLocaleDateString()}
                          </TableCell>
                          <TableCell>
                            <div className="font-medium text-sm">
                              {record.task_name || record.description || 'Reward'}
                            </div>
                            {record.task_name && record.description && (
                              <div className="text-[10px] text-muted-foreground">{record.description}</div>
                            )}
                          </TableCell>
                          <TableCell>
                            {record.subject_name ? (
                              <Badge variant="outline" className="text-[10px] uppercase font-bold">
                                {record.subject_name}
                              </Badge>
                            ) : '-'}
                          </TableCell>
                          <TableCell className="text-xs max-w-[150px] truncate" title={record.session_title}>
                            {record.session_title || '-'}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {record.deadline ? new Date(record.deadline).toLocaleDateString() : '-'}
                          </TableCell>
                          <TableCell className="text-right font-bold text-green-600">
                            +₹{record.amount}
                          </TableCell>
                        </TableRow>
                      ));
                    })()}
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
