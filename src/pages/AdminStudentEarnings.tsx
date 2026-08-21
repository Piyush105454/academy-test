import { useState, useEffect, useMemo } from 'react';
import { Wallet, Search, Filter, ArrowUpDown, Pencil, Trash2, TrendingUp, Info, FileSpreadsheet, UploadCloud, ArrowLeft, History, Plus, CheckCircle2 } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { useAcademicYear } from '@/contexts/AcademicYearContext';

interface StudentEarning {
  student_id: string;
  student_name: string;
  class_name: string;
  designation: string;
  total_earned: number;
  last_earned_at: string | null;
  bank_name?: string | null;
  account_number?: string | null;
  ifsc_code?: string | null;
}

interface EarningRecord {
  id: string;
  student_id: string;
  amount: number;
  earned_at: string;
  description: string;
}

interface RewardConfig {
  id: string;
  task_type: string;
  expected_tasks: number;
  frequency: string;
  rate_per_task: number;
  potential_monthly: number;
  how_to_earn: string;
  reviewer_rate?: number;
}

const DEFAULT_EARNING_POTENTIAL = [
  { task_type: 'English Reading & speaking Task', expected_tasks: 2, frequency: 'Daily', rate_per_task: 5, potential_monthly: 10, how_to_earn: 'Read, Write, Speak & Record The Given article and earn.', reviewer_rate: 0 },
  { task_type: 'CCC - Computers - Task', expected_tasks: 1, frequency: 'Daily', rate_per_task: 10, potential_monthly: 10, how_to_earn: 'Complete the assigned homework, research and write and earn', reviewer_rate: 0 },
  { task_type: 'GT Session Task', expected_tasks: 1, frequency: 'Daily', rate_per_task: 20, potential_monthly: 20, how_to_earn: 'Complete GT Session task and earn', reviewer_rate: 0 },
  { task_type: 'Mentor connect Task', expected_tasks: 2, frequency: 'Monthly', rate_per_task: 400, potential_monthly: 800, how_to_earn: 'Connect with your mentor complete the mentprhsip sessions as per the agenda share record timey and earn', reviewer_rate: 0 },
  { task_type: 'Bonus for 100% attendance', expected_tasks: 25, frequency: 'Monthly', rate_per_task: 8, potential_monthly: 200, how_to_earn: 'Achive 100% attendance and earn bonus of 200 rs', reviewer_rate: 0 },
];

export default function AdminStudentEarnings() {
  const [loading, setLoading] = useState(true);
  const [classes, setClasses] = useState<{ id: string, name: string }[]>([]);
  const [selectedClass, setSelectedClass] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [studentEarnings, setStudentEarnings] = useState<StudentEarning[]>([]);
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
  const [selectedStudent, setSelectedStudent] = useState<StudentEarning | null>(null);
  const [studentRecords, setStudentRecords] = useState<EarningRecord[]>([]);
  const [loadingRecords, setLoadingRecords] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<EarningRecord | null>(null);
  const [isPotentialModalOpen, setIsPotentialModalOpen] = useState(false);
  const [subjects, setSubjects] = useState<{id: string, name: string}[]>([]);
  const [filterSubject, setFilterSubject] = useState('all');
  const [rewardConfigs, setRewardConfigs] = useState<RewardConfig[]>([]);
  const [isEditingConfigs, setIsEditingConfigs] = useState(false);
  const [editingConfigs, setEditingConfigs] = useState<RewardConfig[]>([]);
  const [selectedMonth, setSelectedMonth] = useState<string>('all');
  const [selectedDesignation, setSelectedDesignation] = useState<string>('all');
  const { selectedYear, getDateRange } = useAcademicYear();

  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importMonth, setImportMonth] = useState<string>(new Date().getMonth().toString());

  const categoryBreakdown = useMemo(() => {
    if (!selectedStudent) return [];
    
    const today = new Date();
    const currentMonthIdx = today.getMonth();
    const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
    const isCurrentMonthEnded = today.getDate() === lastDayOfMonth;

    const filtered = studentRecords.filter(r => {
      const earnedAt = new Date(r.earned_at);
      const matchesMonth = selectedMonth === 'all' || earnedAt.getMonth().toString() === selectedMonth;
      if (!matchesMonth) return false;

      const desc = (r.description || '').toLowerCase();
      const isAttendanceBonus = desc.includes('attendance');
      if (isAttendanceBonus) {
        const isCurrentMonth = earnedAt.getMonth() === currentMonthIdx && earnedAt.getFullYear() === today.getFullYear();
        if (isCurrentMonth && !isCurrentMonthEnded) {
          return false;
        }
      }
      return true;
    });

    const matchedRecordIds = new Set<string>();
    const configsToUse = rewardConfigs.length > 0 ? rewardConfigs : DEFAULT_EARNING_POTENTIAL;

    const breakdown = configsToUse.map(config => {
      const taskTypeLower = (config.task_type || '').toLowerCase();
      
      const matchingRecords = filtered.filter(r => {
        const taskName = ((r as any).student_task_feedback?.task_name || '').toLowerCase();
        const desc = (r.description || '').toLowerCase();
        const subj = ((r as any).student_task_feedback?.subjects?.name || '').toLowerCase();

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

      const earnedAmount = matchingRecords.reduce((sum, r) => sum + parseFloat(r.amount as any || 0), 0);
      const completedCount = matchingRecords.length;

      return {
        ...config,
        earnedAmount,
        completedCount,
      };
    });

    const otherRecords = filtered.filter(r => !matchedRecordIds.has(r.id));
    if (otherRecords.length > 0) {
      const otherEarned = otherRecords.reduce((sum, r) => sum + parseFloat(r.amount as any || 0), 0);
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
  }, [selectedStudent, studentRecords, rewardConfigs, selectedMonth]);

  const totalPotentialMonthly = useMemo(() => {
    const configsToUse = rewardConfigs.length > 0 ? rewardConfigs : DEFAULT_EARNING_POTENTIAL;
    return configsToUse.reduce((sum, c) => sum + (c.potential_monthly || 0), 0);
  }, [rewardConfigs]);

  const totalCategoryEarned = useMemo(() => {
    return categoryBreakdown.reduce((sum, c) => sum + c.earnedAmount, 0);
  }, [categoryBreakdown]);

  const totalCompletedTasks = useMemo(() => {
    return categoryBreakdown.reduce((sum, c) => sum + c.completedCount, 0);
  }, [categoryBreakdown]);

  useEffect(() => {
    fetchClasses();
    fetchStudentEarnings();
    fetchRewardConfigs();
    fetchSubjects();
  }, [selectedYear, selectedMonth]);

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
        console.warn('reward_configurations table might not exist, using defaults');
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

  const fetchClasses = async () => {
    const { data, error } = await supabase
      .from('classes')
      .select('id, name')
      .order('name');
    if (data) setClasses(data);
  };

  const fetchStudentEarnings = async () => {
    try {
      setLoading(true);
      
      // Fetch students and their earnings
      const { data: students, error: studentError } = await supabase
        .from('students')
        .select(`
          id,
          name,
          designation,
          bank_name,
          account_number,
          ifsc_code,
          classes (name),
          student_earnings (
            amount, 
            earned_at,
            description
          )
        `);

      if (studentError) throw studentError;

      const today = new Date();
      const currentMonthIdx = today.getMonth();
      const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
      const isCurrentMonthEnded = today.getDate() === lastDayOfMonth;

      const { startDate, endDate } = getDateRange();
      const aggregated = (students || []).map((s: any) => {
        const filteredEarnings = (s.student_earnings || []).filter((e: any) => {
          const earnedAt = new Date(e.earned_at);
          const matchesAcademicYear = earnedAt >= startDate && earnedAt <= endDate;
          const matchesMonth = selectedMonth === 'all' || earnedAt.getMonth().toString() === selectedMonth;
          if (!matchesAcademicYear || !matchesMonth) return false;

          const desc = (e.description || '').toLowerCase();
          if (desc.includes('attendance')) {
            const isCurrentMonth = earnedAt.getMonth() === currentMonthIdx && earnedAt.getFullYear() === today.getFullYear();
            if (isCurrentMonth && !isCurrentMonthEnded) return false;
          }
          return true;
        });
        
        const total = filteredEarnings.reduce((sum: number, e: any) => sum + parseFloat(e.amount), 0);
        const lastRecord = filteredEarnings.length > 0 
          ? [...filteredEarnings].sort((a: any, b: any) => new Date(b.earned_at).getTime() - new Date(a.earned_at).getTime())[0]
          : null;
        
        const lastDate = lastRecord?.earned_at || null;

        return {
          student_id: s.id,
          student_name: s.name,
          class_name: s.classes?.name || 'Unassigned',
          designation: s.designation || '-',
          total_earned: total,
          last_earned_at: lastDate,
          bank_name: s.bank_name || null,
          account_number: s.account_number || null,
          ifsc_code: s.ifsc_code || null
        };
      });

      setStudentEarnings(aggregated);
    } catch (error) {
      console.error('Error fetching earnings:', error);
      toast.error('Failed to load earnings data');
    } finally {
      setLoading(false);
    }
  };

  const fetchStudentRecords = async (studentId: string) => {
    try {
      setLoadingRecords(true);
      const { startDate, endDate } = getDateRange();
      const { data, error } = await supabase
        .from('student_earnings')
        .select(`
          *,
          student_task_feedback(
            task_name,
            task_id,
            deadline,
            subjects(name),
            sessions(title)
          )
        `)
        .eq('student_id', studentId)
        .gte('earned_at', startDate.toISOString())
        .lte('earned_at', endDate.toISOString())
        .order('earned_at', { ascending: false });

      if (error) throw error;
      setStudentRecords(data || []);
    } catch (error) {
      console.error('Error fetching records:', error);
      toast.error('Failed to load records');
    } finally {
      setLoadingRecords(false);
    }
  };

  const handleEditRecord = async () => {
    if (!editingRecord) return;
    try {
      const { error } = await supabase
        .from('student_earnings')
        .update({
          amount: editingRecord.amount,
          description: editingRecord.description,
          earned_at: editingRecord.earned_at
        })
        .eq('id', editingRecord.id);

      if (error) throw error;
      toast.success('Record updated successfully');
      setIsEditModalOpen(false);
      if (selectedStudent) fetchStudentRecords(selectedStudent.student_id);
      fetchStudentEarnings();
    } catch (error) {
      console.error('Error updating record:', error);
      toast.error('Failed to update record');
    }
  };

  const handleDeleteRecord = async (id: string) => {
    if (!confirm('Are you sure you want to delete this earning record?')) return;
    try {
      const { error } = await supabase
        .from('student_earnings')
        .delete()
        .eq('id', id);

      if (error) throw error;
      toast.success('Record deleted successfully');
      if (selectedStudent) fetchStudentRecords(selectedStudent.student_id);
      fetchStudentEarnings();
    } catch (error) {
      console.error('Error deleting record:', error);
      toast.error('Failed to delete record');
    }
  };

  const handleSaveConfigs = async () => {
    try {
      setLoading(true);
      for (const config of editingConfigs) {
        const { error } = await supabase
          .from('reward_configurations')
          .upsert({
            task_type: config.task_type,
            expected_tasks: config.expected_tasks,
            frequency: config.frequency,
            rate_per_task: config.rate_per_task,
            potential_monthly: config.expected_tasks * config.rate_per_task,
            how_to_earn: config.how_to_earn,
            reviewer_rate: config.reviewer_rate || 0
          }, { 
            onConflict: 'task_type' 
          });
        if (error) throw error;
      }
      toast.success('Reward configurations updated');
      fetchRewardConfigs();
      setIsEditingConfigs(false);
    } catch (error: any) {
      console.error('Error saving configs:', error);
      toast.error(`Failed to save: ${error.message || 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleExportBankFormat = () => {
    if (selectedMonth === 'all') {
      toast.warning('Please select a specific month from the dropdown to export payouts.');
      return;
    }

    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    const monthLabel = monthNames[parseInt(selectedMonth)];

    const headers = [
      'Student Name',
      'Class',
      'Designation',
      'Bank Name',
      'Account Number',
      'IFSC Code',
      `Earnings (₹) - ${monthLabel} ${selectedYear}`
    ];

    const csvRows = [headers.join(',')];

    const escapeCsv = (val: any) => {
      if (val === null || val === undefined) return '';
      const str = String(val);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    let count = 0;
    sortedStudents.forEach((s) => {
      if (s.total_earned <= 0) return;
      count++;
      const row = [
        s.student_name,
        s.class_name,
        s.designation,
        s.bank_name || '-',
        s.account_number || '-',
        s.ifsc_code || '-',
        s.total_earned
      ];
      csvRows.push(row.map(escapeCsv).join(','));
    });

    if (count === 0) {
      toast.error('No earnings found for the selected month.');
      return;
    }

    const csvContent = csvRows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Bank_Payout_${monthLabel}_${selectedYear}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast.success(`Successfully exported payouts for ${count} students`);
  };

  const handleImportMentorConnect = async () => {
    if (!importFile) {
      toast.error('Please select an Excel file');
      return;
    }

    try {
      setLoading(true);
      const XLSX = await import('xlsx');
      const data = await importFile.arrayBuffer();
      const workbook = XLSX.read(data);
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(worksheet);

      let successCount = 0;
      let notFoundCount = 0;

      // Find the mentor connect rate
      const mentorRate = rewardConfigs.find(r => r.task_type === 'Mentor connect Task')?.rate_per_task || 400;

      for (const row of rows as any[]) {
        // Find email column (case insensitive key search)
        const emailKey = Object.keys(row).find(k => k.toLowerCase().includes('email'));
        if (!emailKey) continue;
        
        const email = row[emailKey]?.toString().trim();
        if (!email) continue;

        // Check for Tasks Completed or Amount columns
        const tasksKey = Object.keys(row).find(k => k.toLowerCase().includes('tasks') || k.toLowerCase().includes('completed'));
        const amountKey = Object.keys(row).find(k => k.toLowerCase().includes('amount') || k.toLowerCase().includes('earnings'));

        let finalAmount = mentorRate; // default to 1 task

        if (amountKey && !isNaN(Number(row[amountKey]))) {
          finalAmount = Number(row[amountKey]);
        } else if (tasksKey && !isNaN(Number(row[tasksKey]))) {
          finalAmount = Number(row[tasksKey]) * mentorRate;
        }

        // Find student by email
        const { data: student } = await supabase
          .from('students')
          .select('id')
          .ilike('email', email)
          .maybeSingle();

        if (student) {
          // Add earning
          const date = new Date(selectedYear ? parseInt(selectedYear.split('-')[0]) : new Date().getFullYear(), parseInt(importMonth), 28);
          
          await supabase.from('student_earnings').insert({
            student_id: student.id,
            amount: finalAmount,
            earned_at: date.toISOString(),
            description: 'Mentor connect Task (Imported)',
            task_type: 'Mentor connect Task'
          });
          successCount++;
        } else {
          notFoundCount++;
        }
      }

      toast.success(`Import complete. ${successCount} added. ${notFoundCount > 0 ? `${notFoundCount} not found.` : ''}`);
      setIsImportModalOpen(false);
      setImportFile(null);
      fetchStudentEarnings();
    } catch (error) {
      console.error('Import error:', error);
      toast.error('Failed to import file');
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadSample = () => {
    const csvContent = "Email,Tasks Completed,Amount\nstudent1@example.com,1,\nstudent2@example.com,2,\nstudent3@example.com,,400";
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'Mentor_Connect_Import_Sample.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const filteredStudents = studentEarnings.filter(s => {
    const matchesSearch = s.student_name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesClass = selectedClass === 'all' || s.class_name === selectedClass;
    const matchesDesignation = selectedDesignation === 'all' || s.designation === selectedDesignation;
    return matchesSearch && matchesClass && matchesDesignation;
  });

  const sortedStudents = [...filteredStudents].sort((a, b) => {
    if (!sortConfig) return 0;
    const { key, direction } = sortConfig;
    let aVal: any = a[key as keyof typeof a];
    let bVal: any = b[key as keyof typeof b];

    if (key === 'last_earned_at') {
      aVal = aVal ? new Date(aVal).getTime() : 0;
      bVal = bVal ? new Date(bVal).getTime() : 0;
    }

    if (aVal < bVal) return direction === 'asc' ? -1 : 1;
    if (aVal > bVal) return direction === 'asc' ? 1 : -1;
    return 0;
  });

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {selectedStudent ? (
          /* =========================================================================
             DETAILED STUDENT EARNING PAGE VIEW (Opened on "View Details" Click)
             ========================================================================= */
          <div className="space-y-6">
            {/* Back Button & Action Controls */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <Button
                variant="outline"
                onClick={() => setSelectedStudent(null)}
                className="gap-2 bg-background hover:bg-accent font-semibold border-primary/30"
              >
                <ArrowLeft className="h-4 w-4" /> Back to Student List
              </Button>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  onClick={() => setIsPotentialModalOpen(true)}
                  variant="outline"
                  size="sm"
                  className="gap-1.5 border-blue-500/30 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/30"
                >
                  <TrendingUp className="h-4 w-4" />
                  View/Edit Reward Structure
                </Button>
              </div>
            </div>

            {/* Student Profile Header Card */}
            <Card className="border border-primary/20 shadow-sm bg-gradient-to-r from-background via-blue-50/30 to-indigo-50/20 dark:via-blue-950/20 dark:to-indigo-950/10">
              <CardContent className="p-6">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="space-y-2">
                    <div className="flex items-center gap-3 flex-wrap">
                      <h2 className="text-2xl font-black text-foreground tracking-tight">{selectedStudent.student_name}</h2>
                      <Badge variant="secondary" className="font-bold text-xs bg-primary/10 text-primary">
                        {selectedStudent.class_name}
                      </Badge>
                      <Badge variant="outline" className="text-xs uppercase font-extrabold border-blue-400 text-blue-600 dark:text-blue-400">
                        {selectedStudent.designation}
                      </Badge>
                    </div>
                    {selectedStudent.bank_name ? (
                      <p className="text-xs text-muted-foreground">
                        Bank: <span className="font-medium text-foreground">{selectedStudent.bank_name}</span> | Account: <span className="font-medium text-foreground">{selectedStudent.account_number}</span> | IFSC: <span className="font-medium text-foreground">{selectedStudent.ifsc_code}</span>
                      </p>
                    ) : (
                      <p className="text-xs text-muted-foreground italic">No bank details registered</p>
                    )}
                  </div>

                  {/* Summary KPI Counters */}
                  <div className="flex items-center gap-6 bg-background/80 backdrop-blur-xs p-4 rounded-xl border border-border shadow-xs">
                    <div>
                      <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Total Earned</p>
                      <p className="text-2xl font-black text-green-600 dark:text-green-400">₹{selectedStudent.total_earned.toLocaleString()}</p>
                    </div>
                    <div className="h-10 w-px bg-border" />
                    <div>
                      <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Monthly Potential</p>
                      <p className="text-2xl font-black text-blue-600 dark:text-blue-400">₹{totalPotentialMonthly.toLocaleString()}</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Reward Structure & Monthly Earned Breakdown */}
            <Card className="border border-border">
              <CardHeader className="border-b bg-muted/20">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <CardTitle className="text-lg font-bold flex items-center gap-2">
                      <TrendingUp className="h-5 w-5 text-blue-600" />
                      Reward Criteria & Monthly Earned Breakdown
                    </CardTitle>
                    <CardDescription>
                      Full breakdown of monthly criteria potentials vs {selectedStudent.student_name}'s actual earnings
                    </CardDescription>
                  </div>

                  {/* Month Filter */}
                  <div className="w-full sm:w-48">
                    <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                      <SelectTrigger className="h-9 text-xs font-semibold bg-background">
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
                      <TableHead className="font-bold text-right">Student Earned (₹)</TableHead>
                      <TableHead className="font-bold text-center">Completion Status</TableHead>
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
                          ₹{item.potential_monthly}
                        </TableCell>
                        <TableCell className="text-center font-bold text-sm">
                          {item.completedCount}
                        </TableCell>
                        <TableCell className="text-right font-black text-green-600 dark:text-green-400">
                          ₹{item.earnedAmount.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-center">
                          {item.potential_monthly > 0 ? (
                            <Badge
                              variant={item.earnedAmount >= item.potential_monthly ? "default" : item.earnedAmount > 0 ? "secondary" : "outline"}
                              className="text-[10px] font-bold"
                            >
                              {Math.min(100, Math.round((item.earnedAmount / item.potential_monthly) * 100))}% Cap Achieved
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="text-[10px] font-bold">
                              ₹{item.earnedAmount} Earned
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                    {/* Total Summary Row */}
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

            {/* Itemized Earning History Table */}
            <Card className="border border-border">
              <CardHeader className="border-b bg-muted/20">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-lg font-bold flex items-center gap-2">
                      <History className="h-5 w-5 text-primary" />
                      Itemized Earning History
                    </CardTitle>
                    <CardDescription>
                      Individual reward entries earned by {selectedStudent.student_name}
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {loadingRecords ? (
                  <div className="py-12 text-center text-muted-foreground font-medium">Loading earning records...</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/40 text-xs">
                        <TableHead>Task ID</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Task / Description</TableHead>
                        <TableHead>Subject</TableHead>
                        <TableHead>Session</TableHead>
                        <TableHead>Deadline</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead className="text-right">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(() => {
                        const today = new Date();
                        const currentMonthIdx = today.getMonth();
                        const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
                        const isCurrentMonthEnded = today.getDate() === lastDayOfMonth;

                        const validStudentRecords = studentRecords.filter(r => {
                          const earnedAt = new Date(r.earned_at);
                          const matchesMonth = selectedMonth === 'all' || earnedAt.getMonth().toString() === selectedMonth;
                          if (!matchesMonth) return false;

                          const desc = (r.description || '').toLowerCase();
                          const isAttendanceBonus = desc.includes('attendance');
                          if (isAttendanceBonus) {
                            const isCurrentMonth = earnedAt.getMonth() === currentMonthIdx && earnedAt.getFullYear() === today.getFullYear();
                            if (isCurrentMonth && !isCurrentMonthEnded) {
                              return false;
                            }
                          }
                          return true;
                        });

                        if (validStudentRecords.length === 0) {
                          return (
                            <TableRow>
                              <TableCell colSpan={8} className="text-center py-8 text-muted-foreground font-medium">
                                No earning records found for this student in the selected period.
                              </TableCell>
                            </TableRow>
                          );
                        }

                        return validStudentRecords.map((r) => (
                            <TableRow key={r.id}>
                              <TableCell className="font-mono text-xs text-muted-foreground whitespace-nowrap">
                                {(r as any).student_task_feedback?.task_id || '-'}
                              </TableCell>
                              <TableCell className="text-xs font-medium whitespace-nowrap">
                                {new Date(r.earned_at).toLocaleDateString()}
                              </TableCell>
                              <TableCell>
                                <div className="font-medium text-sm">
                                  {(r as any).student_task_feedback?.task_name || r.description || 'Reward'}
                                </div>
                                {(r as any).student_task_feedback?.task_name && r.description && (
                                  <div className="text-[10px] text-muted-foreground">{r.description}</div>
                                )}
                              </TableCell>
                              <TableCell>
                                {(r as any).student_task_feedback?.subjects?.name ? (
                                  <Badge variant="outline" className="text-[10px] uppercase font-bold">
                                    {(r as any).student_task_feedback?.subjects?.name}
                                  </Badge>
                                ) : '-'}
                              </TableCell>
                              <TableCell className="text-xs truncate max-w-[120px]">
                                {(r as any).student_task_feedback?.sessions?.title || '-'}
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                                {(r as any).student_task_feedback?.deadline ? new Date((r as any).student_task_feedback.deadline).toLocaleDateString() : '-'}
                              </TableCell>
                              <TableCell className="text-right font-black text-green-600 dark:text-green-400">
                                ₹{r.amount}
                              </TableCell>
                              <TableCell className="text-right">
                                <button
                                  onClick={() => handleDeleteRecord(r.id)}
                                  className="p-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 rounded transition-colors"
                                  title="Delete this earning record"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </TableCell>
                            </TableRow>
                          ));
                      })()}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>
        ) : (
          /* =========================================================================
             MAIN ALL STUDENTS EARNINGS LIST VIEW
             ========================================================================= */
          <>
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <h1 className="text-2xl font-bold flex items-center gap-2">
                  <Wallet className="h-6 w-6 text-primary" />
                  Student Earnings Management
                </h1>
                <p className="text-sm text-muted-foreground mt-1">
                  Monitor and manage rewards earned by students
                </p>
              </div>
              <div className="flex gap-2">
                <Button onClick={handleExportBankFormat} className="gap-2 bg-green-600 hover:bg-green-700">
                  <FileSpreadsheet className="h-4 w-4" />
                  Export Bank Format
                </Button>
                <Button onClick={() => setIsImportModalOpen(true)} className="gap-2 bg-indigo-600 hover:bg-indigo-700 text-white">
                  <UploadCloud className="h-4 w-4" />
                  Import Mentor Connect
                </Button>
                <Button onClick={() => setIsPotentialModalOpen(true)} className="gap-2 bg-blue-600 hover:bg-blue-700">
                  <TrendingUp className="h-4 w-4" />
                  Set Monthly Potential
                </Button>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search students..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              <div className="w-full sm:w-48">
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
              <div className="w-full sm:w-48">
                <Select value={selectedClass} onValueChange={setSelectedClass}>
                  <SelectTrigger>
                    <SelectValue placeholder="All Classes" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Classes</SelectItem>
                    {classes.map((c) => (
                      <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="w-full sm:w-48">
                <Select value={selectedDesignation} onValueChange={setSelectedDesignation}>
                  <SelectTrigger>
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
              <div className="w-full sm:w-48">
                <Select value={filterSubject} onValueChange={setFilterSubject}>
                  <SelectTrigger>
                    <SelectValue placeholder="All Subjects" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Subjects</SelectItem>
                    {subjects.map((s) => (
                      <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead><div className="flex items-center gap-1 cursor-pointer hover:text-primary" onClick={() => handleSort('student_name')}>Student Name <ArrowUpDown className="h-3 w-3" /></div></TableHead>
                      <TableHead><div className="flex items-center gap-1 cursor-pointer hover:text-primary" onClick={() => handleSort('class_name')}>Class <ArrowUpDown className="h-3 w-3" /></div></TableHead>
                      <TableHead><div className="flex items-center gap-1 cursor-pointer hover:text-primary" onClick={() => handleSort('designation')}>Designation <ArrowUpDown className="h-3 w-3" /></div></TableHead>
                      <TableHead className="text-right"><div className="flex items-center justify-end gap-1 cursor-pointer hover:text-primary" onClick={() => handleSort('total_earned')}>Total Earned <ArrowUpDown className="h-3 w-3" /></div></TableHead>
                      <TableHead><div className="flex items-center gap-1 cursor-pointer hover:text-primary" onClick={() => handleSort('last_earned_at')}>Last Reward <ArrowUpDown className="h-3 w-3" /></div></TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-10 text-muted-foreground">
                          Loading data...
                        </TableCell>
                      </TableRow>
                    ) : sortedStudents.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-10 text-muted-foreground">
                          No student records found
                        </TableCell>
                      </TableRow>
                    ) : (
                      sortedStudents.map((s) => (
                        <TableRow key={s.student_id}>
                          <TableCell className="font-medium">{s.student_name}</TableCell>
                          <TableCell>{s.class_name}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-[10px] uppercase font-bold">{s.designation}</Badge>
                          </TableCell>
                          <TableCell className="text-right font-bold text-green-600">
                            ₹{s.total_earned.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                            {s.last_earned_at ? new Date(s.last_earned_at).toLocaleDateString() : '-'}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={() => {
                                setSelectedStudent(s);
                                fetchStudentRecords(s.student_id);
                              }}
                            >
                              View Details
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </>
        )}

        {/* Edit Record Modal */}
        <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Earning Record</DialogTitle>
            </DialogHeader>
            {editingRecord && (
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Amount (₹)</Label>
                  <Input 
                    type="number" 
                    value={editingRecord.amount} 
                    onChange={(e) => setEditingRecord({...editingRecord, amount: parseFloat(e.target.value)})}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Description</Label>
                  <Input 
                    value={editingRecord.description} 
                    onChange={(e) => setEditingRecord({...editingRecord, description: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Date</Label>
                  <Input 
                    type="date" 
                    value={editingRecord.earned_at.split('T')[0]} 
                    onChange={(e) => setEditingRecord({...editingRecord, earned_at: new Date(e.target.value).toISOString()})}
                  />
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsEditModalOpen(false)}>Cancel</Button>
              <Button onClick={handleEditRecord}>Save Changes</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Potential Earning Info Modal */}
        <Dialog open={isPotentialModalOpen} onOpenChange={(open) => {
          setIsPotentialModalOpen(open);
          if (!open) setIsEditingConfigs(false);
        }}>
          <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <div className="flex items-center justify-between pr-8">
                <div>
                  <DialogTitle className="flex items-center gap-2 text-xl">
                    <TrendingUp className="h-6 w-6 text-blue-600" />
                    Reward Structure & Monthly Potential
                  </DialogTitle>
                  <DialogDescription>
                    Configure how much students can earn for each task type
                  </DialogDescription>
                </div>
                {!isEditingConfigs ? (
                  <Button variant="outline" size="sm" onClick={() => {
                    setEditingConfigs([...rewardConfigs]);
                    setIsEditingConfigs(true);
                  }}>
                    <Pencil className="h-4 w-4 mr-2" />
                    Edit Structure
                  </Button>
                ) : (
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => setIsEditingConfigs(false)}>
                      Cancel
                    </Button>
                    <Button size="sm" onClick={handleSaveConfigs}>
                      Save All
                    </Button>
                  </div>
                )}
              </div>
            </DialogHeader>
            
            <div className="mt-4 border rounded-xl overflow-hidden shadow-sm">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50 hover:bg-muted/50">
                    <TableHead className="font-bold text-foreground">Task Type</TableHead>
                    <TableHead className="text-center font-bold text-foreground">Tasks/Month</TableHead>
                    <TableHead className="text-center font-bold text-foreground">Frequency</TableHead>
                    <TableHead className="text-center font-bold text-foreground">Rate (₹)</TableHead>
                    <TableHead className="text-center font-bold text-foreground">Monthly (₹)</TableHead>
                    <TableHead className="text-center font-bold text-foreground">Reviewer Earning (₹)</TableHead>
                    <TableHead className="font-bold text-foreground">How to Earn</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(isEditingConfigs ? editingConfigs : rewardConfigs).map((row, idx) => (
                    <TableRow key={idx} className="group hover:bg-muted/30 transition-colors">
                      <TableCell className="font-semibold text-sm">
                        {isEditingConfigs ? (
                          <Input 
                            value={row.task_type} 
                            onChange={(e) => {
                              const newConfigs = [...editingConfigs];
                              newConfigs[idx].task_type = e.target.value;
                              setEditingConfigs(newConfigs);
                            }}
                            className="h-8 text-xs"
                          />
                        ) : row.task_type}
                      </TableCell>
                      <TableCell className="text-center">
                        {isEditingConfigs ? (
                          <Input 
                            type="number"
                            value={row.expected_tasks} 
                            onChange={(e) => {
                              const newConfigs = [...editingConfigs];
                              newConfigs[idx].expected_tasks = parseInt(e.target.value) || 0;
                              setEditingConfigs(newConfigs);
                            }}
                            className="h-8 w-16 mx-auto text-center text-xs"
                          />
                        ) : <span className="text-sm font-medium">{row.expected_tasks}</span>}
                      </TableCell>
                      <TableCell className="text-center">
                        {isEditingConfigs ? (
                          <Select 
                            value={row.frequency} 
                            onValueChange={(v) => {
                              const newConfigs = [...editingConfigs];
                              newConfigs[idx].frequency = v;
                              setEditingConfigs(newConfigs);
                            }}
                          >
                            <SelectTrigger className="h-8 w-24 mx-auto text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Daily">Daily</SelectItem>
                              <SelectItem value="Weekly">Weekly</SelectItem>
                              <SelectItem value="Monthly">Monthly</SelectItem>
                            </SelectContent>
                          </Select>
                        ) : <Badge variant="secondary" className="text-[10px] uppercase font-bold px-1.5">{row.frequency}</Badge>}
                      </TableCell>
                      <TableCell className="text-center">
                        {isEditingConfigs ? (
                          <Input 
                            type="number"
                            value={row.rate_per_task} 
                            onChange={(e) => {
                              const newConfigs = [...editingConfigs];
                              newConfigs[idx].rate_per_task = parseInt(e.target.value) || 0;
                              setEditingConfigs(newConfigs);
                            }}
                            className="h-8 w-16 mx-auto text-center text-xs font-bold text-green-600"
                          />
                        ) : <span className="text-sm font-bold text-green-600">₹{row.rate_per_task}</span>}
                      </TableCell>
                      <TableCell className="text-center font-black text-blue-600 text-sm">
                        ₹{(isEditingConfigs ? (row.expected_tasks * row.rate_per_task) : row.potential_monthly).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-center">
                        {isEditingConfigs ? (
                          <Input 
                            type="number"
                            value={row.reviewer_rate || 0} 
                            onChange={(e) => {
                              const newConfigs = [...editingConfigs];
                              newConfigs[idx] = {
                                ...newConfigs[idx],
                                reviewer_rate: parseInt(e.target.value) || 0
                              };
                              setEditingConfigs(newConfigs);
                            }}
                            className="h-8 w-16 mx-auto text-center text-xs font-bold text-purple-600"
                          />
                        ) : <span className="text-sm font-bold text-purple-600">₹{row.reviewer_rate || 0}</span>}
                      </TableCell>
                      <TableCell>
                        {isEditingConfigs ? (
                          <Input 
                            value={row.how_to_earn} 
                            onChange={(e) => {
                              const newConfigs = [...editingConfigs];
                              newConfigs[idx].how_to_earn = e.target.value;
                              setEditingConfigs(newConfigs);
                            }}
                            className="h-8 text-xs min-w-[300px]"
                          />
                        ) : <p className="text-xs text-muted-foreground leading-snug">{row.how_to_earn}</p>}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="bg-blue-50/50 hover:bg-blue-50/50 border-t-2 border-blue-100">
                    <TableCell colSpan={5} className="font-bold text-right text-base text-blue-900 py-4">Total Potential Monthly:</TableCell>
                    <TableCell className="text-center font-black text-blue-700 text-lg py-4">
                      ₹{(isEditingConfigs ? editingConfigs : rewardConfigs).reduce((sum, r) => sum + (r.expected_tasks * r.rate_per_task), 0).toLocaleString()}
                    </TableCell>
                    <TableCell colSpan={2}></TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
            
            <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 flex gap-2">
              <Info className="h-4 w-4 flex-shrink-0" />
              <p>
                <strong>Note:</strong> This table reflects the standardized reward rates. Individual student earnings are calculated based on these rates when tasks are marked as completed.
              </p>
            </div>
          </DialogContent>
        </Dialog>

        {/* Import Mentor Connect Modal */}
        <Dialog open={isImportModalOpen} onOpenChange={(open) => {
          setIsImportModalOpen(open);
          if (!open) setImportFile(null);
        }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Import Mentor Connect Earnings</DialogTitle>
              <DialogDescription>
                Upload an Excel file containing student emails. This will automatically add the monthly mentor connect earnings to matching students.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Earning Month</Label>
                <Select value={importMonth} onValueChange={setImportMonth}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select Month" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">January</SelectItem>
                    <SelectItem value="1">February</SelectItem>
                    <SelectItem value="2">March</SelectItem>
                    <SelectItem value="3">April</SelectItem>
                    <SelectItem value="4">May</SelectItem>
                    <SelectItem value="5">June</SelectItem>
                    <SelectItem value="6">July</SelectItem>
                    <SelectItem value="7">August</SelectItem>
                    <SelectItem value="8">September</SelectItem>
                    <SelectItem value="9">October</SelectItem>
                    <SelectItem value="10">November</SelectItem>
                    <SelectItem value="11">December</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Excel File</Label>
                <div className="flex gap-2 items-center">
                  <Input 
                    type="file" 
                    accept=".xlsx, .xls, .csv" 
                    onChange={(e) => setImportFile(e.target.files?.[0] || null)}
                    className="flex-1"
                  />
                  <Button 
                    variant="outline" 
                    size="icon" 
                    onClick={handleDownloadSample}
                    title="Download Sample Format"
                    className="shrink-0 text-blue-600 hover:text-blue-700"
                  >
                    <FileSpreadsheet className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  The file must contain an <strong>Email</strong> column. Optionally, add a <strong>Tasks Completed</strong> column (e.g. 1 or 2) OR an <strong>Amount</strong> column to specify custom earnings. If omitted, it defaults to 1 task (₹400).
                </p>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setIsImportModalOpen(false)}>Cancel</Button>
              <Button onClick={handleImportMentorConnect} disabled={!importFile || loading}>
                {loading ? 'Importing...' : 'Import Earnings'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
