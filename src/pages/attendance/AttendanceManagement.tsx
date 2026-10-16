import React, { useEffect, useState, useMemo } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/card';
import { useNavigate } from 'react-router-dom';
import { 
  Users, 
  CalendarDays, 
  Settings, 
  Loader2, 
  ChevronsUpDown, 
  RefreshCw, 
  UploadCloud, 
  Search, 
  X, 
  TrendingUp, 
  Award, 
  ArrowRight,
  Filter,
  FileSpreadsheet
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList } from '@/components/ui/command';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList, Cell } from 'recharts';

const MONTHS = [
  { value: 1, label: 'January', short: 'Jan' },
  { value: 2, label: 'February', short: 'Feb' },
  { value: 3, label: 'March', short: 'Mar' },
  { value: 4, label: 'April', short: 'Apr' },
  { value: 5, label: 'May', short: 'May' },
  { value: 6, label: 'June', short: 'Jun' },
  { value: 7, label: 'July', short: 'Jul' },
  { value: 8, label: 'August', short: 'Aug' },
  { value: 9, label: 'September', short: 'Sep' },
  { value: 10, label: 'October', short: 'Oct' },
  { value: 11, label: 'November', short: 'Nov' },
  { value: 12, label: 'December', short: 'Dec' },
];

const YEARS = [2024, 2025, 2026, 2027];

// Colorful palette for comparisons
const COLOR_PALETTE = [
  '#10b981', // Emerald (Top)
  '#2563eb', // Royal Blue
  '#3b82f6', // Bright Blue
  '#6366f1', // Indigo
  '#8b5cf6', // Violet
  '#06b6d4', // Cyan
  '#f59e0b', // Amber
  '#ec4899', // Pink
  '#14b8a6', // Teal
  '#f97316', // Orange
];

export default function AttendanceManagement() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  
  // Settings
  const [lateTime, setLateTime] = useState('09:00:00');
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [syncingAdmissions, setSyncingAdmissions] = useState(false);

  // Filters
  const currentMonthNum = new Date().getMonth() + 1;
  const [selectedMonths, setSelectedMonths] = useState<number[]>([currentMonthNum]);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedGender, setSelectedGender] = useState('All Genders');
  const [selectedReligion, setSelectedReligion] = useState('All Religions');
  const [selectedOccupation, setSelectedOccupation] = useState('All Occupations');
  const [selectedClasses, setSelectedClasses] = useState<string[]>([]); // empty = All Classes
  const [selectedStudents, setSelectedStudents] = useState<string[]>([]);
  
  // Search query for student combobox
  const [studentSearchInput, setStudentSearchInput] = useState('');
  const [classFilterSearch, setClassFilterSearch] = useState('');
  
  // Data
  const [classes, setClasses] = useState<{ id: string; name: string }[]>([]);
  const [students, setStudents] = useState<{ id: string; name: string; class_id: string; gender: string; roll_number?: string }[]>([]);
  const [attendanceRecords, setAttendanceRecords] = useState<{ student_id: string; class_id: string; status: string; date: string }[]>([]);
  const [loading, setLoading] = useState(true);

  // Dropdown open states
  const [monthDropdownOpen, setMonthDropdownOpen] = useState(false);
  const [classDropdownOpen, setClassDropdownOpen] = useState(false);
  const [studentSearchOpen, setStudentSearchOpen] = useState(false);

  useEffect(() => {
    checkRoleAndFetchSettings();
    fetchClassesAndStudents();
  }, [user]);

  useEffect(() => {
    fetchAttendance();
  }, [selectedMonths, selectedYear]);

  const checkRoleAndFetchSettings = async () => {
    if (!user?.email) return;
    try {
      const { data: profile } = await supabase.from('user_profiles').select('role_id').ilike('email', user.email).maybeSingle();
      if (profile?.role_id === 1) setIsAdmin(true);
      const { data: settings } = await supabase.from('attendance_settings').select('late_threshold_time').eq('id', 1).maybeSingle();
      if (settings?.late_threshold_time) setLateTime(settings.late_threshold_time);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchClassesAndStudents = async () => {
    try {
      const { data: clsData } = await supabase
        .from('classes')
        .select('id, name')
        .neq('name', '__SYSTEM_DEV_MODE__')
        .not('is_attendance_enabled', 'eq', false)
        .order('name');
      if (clsData) setClasses(clsData);

      const { data: stdData } = await supabase
        .from('students')
        .select('id, name, class_id, gender, roll_number');
      if (stdData) setStudents(stdData);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchAttendance = async () => {
    if (selectedMonths.length === 0) {
      setAttendanceRecords([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const minMonth = Math.min(...selectedMonths);
      const maxMonth = Math.max(...selectedMonths);

      const startDate = new Date(selectedYear, minMonth - 1, 1).toISOString().split('T')[0];
      const endDate = new Date(selectedYear, maxMonth, 0).toISOString().split('T')[0];

      const { data } = await supabase
        .from('daily_attendance')
        .select('student_id, class_id, status, date')
        .gte('date', startDate)
        .lte('date', endDate);
      
      // Filter strictly for the months selected
      const filtered = (data || []).filter(r => {
        if (!r.date) return false;
        const m = parseInt(r.date.split('-')[1], 10);
        return selectedMonths.includes(m);
      });

      setAttendanceRecords(filtered);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSettings = async () => {
    setSaving(true);
    try {
      await supabase.from('attendance_settings').upsert({ id: 1, late_threshold_time: lateTime });
      toast.success('Attendance settings saved successfully');
      setDialogOpen(false);
    } catch (e) {
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleSyncAdmission = async () => {
    setSyncingAdmissions(true);
    try {
      await fetchClassesAndStudents();
      await fetchAttendance();
      toast.success('Synced admissions and attendance rosters successfully');
    } catch (e) {
      toast.error('Failed to sync admissions');
    } finally {
      setSyncingAdmissions(false);
    }
  };

  // Month Multi-Select Handlers
  const toggleMonth = (monthVal: number) => {
    setSelectedMonths(prev => {
      if (prev.includes(monthVal)) {
        if (prev.length === 1) return prev; // Keep at least one
        return prev.filter(m => m !== monthVal);
      } else {
        return [...prev, monthVal].sort((a, b) => a - b);
      }
    });
  };

  const selectAllMonths = () => {
    setSelectedMonths(MONTHS.map(m => m.value));
  };

  const selectCurrentMonthOnly = () => {
    setSelectedMonths([currentMonthNum]);
  };

  // Class Multi-Select Handlers
  const isAllClasses = selectedClasses.length === 0;

  const toggleClass = (classId: string) => {
    setSelectedClasses(prev => {
      if (prev.includes(classId)) {
        return prev.filter(id => id !== classId);
      } else {
        return [...prev, classId];
      }
    });
    // Reset specific student picks if class filter changes
    setSelectedStudents([]);
  };

  const selectAllClasses = () => {
    setSelectedClasses([]);
    setSelectedStudents([]);
  };

  // Filtered Students for student combobox
  const availableStudents = useMemo(() => {
    let filtered = students;
    if (selectedClasses.length > 0) {
      const classIdSet = new Set(selectedClasses);
      filtered = filtered.filter(s => classIdSet.has(s.class_id));
    }
    if (selectedGender !== 'All Genders') {
      filtered = filtered.filter(s => (s.gender || '').toLowerCase() === selectedGender.toLowerCase());
    }
    return filtered;
  }, [students, selectedClasses, selectedGender]);

  // Search filtered students
  const searchedStudents = useMemo(() => {
    if (!studentSearchInput.trim()) return availableStudents;
    const q = studentSearchInput.toLowerCase().trim();
    return availableStudents.filter(s => 
      s.name.toLowerCase().includes(q) || 
      (s.roll_number && s.roll_number.toLowerCase().includes(q))
    );
  }, [availableStudents, studentSearchInput]);

  const toggleStudent = (id: string) => {
    setSelectedStudents(prev => 
      prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]
    );
  };

  const removeStudentTag = (id: string) => {
    setSelectedStudents(prev => prev.filter(s => s !== id));
  };

  const clearAllSelectedStudents = () => {
    setSelectedStudents([]);
    setStudentSearchInput('');
  };

  // Class map for fast lookup
  const classMap = useMemo(() => {
    const map = new Map<string, string>();
    classes.forEach(c => map.set(c.id, c.name));
    return map;
  }, [classes]);

  // Chart Data with Comparison Logic
  const chartData = useMemo(() => {
    if (!attendanceRecords.length) return [];

    let filteredRecords = attendanceRecords;
    
    // Apply Class filter
    if (selectedClasses.length > 0) {
      const classIdSet = new Set(selectedClasses);
      filteredRecords = filteredRecords.filter(r => classIdSet.has(r.class_id));
    }

    // Apply Gender filter
    if (selectedGender !== 'All Genders') {
      const allowedStdIds = new Set(
        students.filter(s => (s.gender || '').toLowerCase() === selectedGender.toLowerCase()).map(s => s.id)
      );
      filteredRecords = filteredRecords.filter(r => allowedStdIds.has(r.student_id));
    }

    // Apply student filter if specific students picked
    if (selectedStudents.length > 0) {
      const stdIdSet = new Set(selectedStudents);
      filteredRecords = filteredRecords.filter(r => stdIdSet.has(r.student_id));
    }

    // MODE 1: Specific students are selected -> Compare individual students
    if (selectedStudents.length > 0) {
      const relevant = students.filter(s => selectedStudents.includes(s.id));
      const grouped: Record<string, { total: number; present: number; name: string; subLabel: string }> = {};

      relevant.forEach(s => {
        const cName = classMap.get(s.class_id) || '';
        grouped[s.id] = {
          total: 0,
          present: 0,
          name: s.name,
          subLabel: cName,
        };
      });

      filteredRecords.forEach(r => {
        if (grouped[r.student_id]) {
          grouped[r.student_id].total++;
          if (r.status === 'P' || r.status === 'LT') grouped[r.student_id].present++;
        }
      });

      return Object.entries(grouped).map(([id, g]) => ({
        id,
        name: g.name,
        displayName: g.subLabel ? `${g.name} (${g.subLabel})` : g.name,
        shortName: g.name.length > 12 ? g.name.substring(0, 10) + '...' : g.name,
        percent: g.total > 0 ? Math.round((g.present / g.total) * 100) : 0,
        total: g.total,
        present: g.present,
      })).sort((a, b) => b.percent - a.percent);
    }

    // MODE 2: Exactly ONE class selected -> Compare all students inside that class
    if (selectedClasses.length === 1) {
      const targetClassId = selectedClasses[0];
      let classStudents = students.filter(s => s.class_id === targetClassId);
      if (selectedGender !== 'All Genders') {
        classStudents = classStudents.filter(s => (s.gender || '').toLowerCase() === selectedGender.toLowerCase());
      }

      const grouped: Record<string, { total: number; present: number; name: string }> = {};
      classStudents.forEach(s => {
        grouped[s.id] = { total: 0, present: 0, name: s.name };
      });

      filteredRecords.forEach(r => {
        if (grouped[r.student_id]) {
          grouped[r.student_id].total++;
          if (r.status === 'P' || r.status === 'LT') grouped[r.student_id].present++;
        }
      });

      return Object.entries(grouped).map(([id, g]) => ({
        id,
        name: g.name,
        displayName: g.name,
        shortName: g.name.length > 12 ? g.name.substring(0, 10) + '...' : g.name,
        percent: g.total > 0 ? Math.round((g.present / g.total) * 100) : 0,
        total: g.total,
        present: g.present,
      })).sort((a, b) => b.percent - a.percent);
    }

    // MODE 3: Multiple classes selected OR All classes -> Compare classes side-by-side
    const targetClasses = selectedClasses.length > 0 
      ? classes.filter(c => selectedClasses.includes(c.id))
      : classes;

    const grouped: Record<string, { total: number; present: number; name: string }> = {};
    targetClasses.forEach(c => {
      grouped[c.id] = { total: 0, present: 0, name: c.name };
    });

    filteredRecords.forEach(r => {
      if (grouped[r.class_id]) {
        grouped[r.class_id].total++;
        if (r.status === 'P' || r.status === 'LT') grouped[r.class_id].present++;
      }
    });

    return Object.entries(grouped).map(([id, g]) => ({
      id,
      name: g.name,
      displayName: g.name,
      shortName: g.name,
      percent: g.total > 0 ? Math.round((g.present / g.total) * 100) : 0,
      total: g.total,
      present: g.present,
    })).sort((a, b) => b.percent - a.percent);

  }, [attendanceRecords, selectedClasses, selectedGender, selectedStudents, classes, students, classMap]);

  // Overall Insights Calculation
  const insights = useMemo(() => {
    let totalRecords = 0;
    let presentRecords = 0;
    attendanceRecords.forEach(r => {
      totalRecords++;
      if (r.status === 'P' || r.status === 'LT') presentRecords++;
    });
    const overall = totalRecords > 0 ? Math.round((presentRecords / totalRecords) * 100) : 0;

    let min = 100, max = 0;
    let minItem = '', maxItem = '';

    if (chartData.length > 0) {
      chartData.forEach(c => {
        if (c.percent > max) {
          max = c.percent;
          maxItem = c.displayName;
        }
        if (c.percent < min && c.percent > 0) {
          min = c.percent;
          minItem = c.displayName;
        }
      });
      if (min === 100 && max === 0) min = 0;
    } else {
      min = 0;
    }

    return { overall, min, max, minItem, maxItem, totalRecords, presentRecords };
  }, [attendanceRecords, chartData]);

  // Month header text
  const selectedMonthsText = useMemo(() => {
    if (selectedMonths.length === 12) return 'FULL YEAR';
    if (selectedMonths.length === 1) {
      return (MONTHS.find(m => m.value === selectedMonths[0])?.label || '').toUpperCase();
    }
    return selectedMonths.map(m => MONTHS.find(mo => mo.value === m)?.short).join(', ').toUpperCase();
  }, [selectedMonths]);

  // Chart Title
  const chartTitle = useMemo(() => {
    if (selectedStudents.length > 0) {
      return `STUDENT ATTENDANCE COMPARISON ${selectedMonthsText} ${selectedYear}`;
    }
    if (selectedClasses.length === 1) {
      const clsName = classMap.get(selectedClasses[0]) || 'CLASS';
      return `${clsName.toUpperCase()} STUDENTS ATTENDANCE ${selectedMonthsText} ${selectedYear}`;
    }
    if (selectedClasses.length > 1) {
      return `CLASSES ATTENDANCE COMPARISON ${selectedMonthsText} ${selectedYear}`;
    }
    return `CLASSES ATTENDANCE ${selectedMonthsText} ${selectedYear}`;
  }, [selectedStudents, selectedClasses, selectedMonthsText, selectedYear, classMap]);

  // Filter classes in class popover
  const filteredClassOptions = useMemo(() => {
    if (!classFilterSearch.trim()) return classes;
    return classes.filter(c => c.name.toLowerCase().includes(classFilterSearch.toLowerCase()));
  }, [classes, classFilterSearch]);

  return (
    <DashboardLayout>
      <div className="w-full px-4 sm:px-6 lg:px-8 py-6 space-y-6 bg-slate-50/70 min-h-screen">
        
        {/* Header Bar */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">ATTENDANCE MANAGEMENT</h1>
            <p className="text-slate-500 text-sm mt-0.5">Global tracking and school-wide metrics.</p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleSyncAdmission} 
              disabled={syncingAdmissions}
              className="bg-white border-slate-200 text-slate-700 hover:bg-slate-50 font-medium shadow-2xs"
            >
              <RefreshCw className={`w-4 h-4 mr-2 text-indigo-600 ${syncingAdmissions ? 'animate-spin' : ''}`} />
              Sync with Admission
            </Button>

            <Button 
              size="sm" 
              onClick={() => setImportDialogOpen(true)}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium shadow-xs"
            >
              <UploadCloud className="w-4 h-4 mr-2" />
              Global Import
            </Button>

            {isAdmin && (
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setDialogOpen(true)}
                className="bg-white border-slate-200 text-slate-700 hover:bg-slate-50 font-medium shadow-2xs"
              >
                <Settings className="w-4 h-4 mr-2 text-slate-500" />
                Settings
              </Button>
            )}
          </div>
        </div>

        {/* Top Quick Metric & Action Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          
          {/* Card 1: Class Wise */}
          <Card 
            onClick={() => navigate('/attendance-management/class-wise')}
            className="p-4 bg-gradient-to-br from-blue-50/80 to-indigo-50/40 border border-blue-200/70 hover:border-blue-400 hover:shadow-md transition-all cursor-pointer group rounded-2xl flex items-center justify-between"
          >
            <div className="flex items-center space-x-3.5">
              <div className="w-11 h-11 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-xs group-hover:scale-105 transition-transform">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-900 text-base leading-tight">Class Wise</h3>
                <span className="text-xs font-semibold text-blue-600 flex items-center gap-1 mt-0.5">
                  View Grid <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                </span>
              </div>
            </div>
            <div className="w-8 h-8 rounded-full bg-blue-100/60 flex items-center justify-center text-blue-700 opacity-60 group-hover:opacity-100 transition-opacity">
              <ArrowRight className="w-4 h-4" />
            </div>
          </Card>

          {/* Card 2: Daily Register */}
          <Card 
            onClick={() => navigate('/attendance-management/daily')}
            className="p-4 bg-gradient-to-br from-amber-50/80 to-orange-50/40 border border-amber-200/70 hover:border-amber-400 hover:shadow-md transition-all cursor-pointer group rounded-2xl flex items-center justify-between"
          >
            <div className="flex items-center space-x-3.5">
              <div className="w-11 h-11 rounded-xl bg-amber-500 text-white flex items-center justify-center shadow-xs group-hover:scale-105 transition-transform">
                <CalendarDays className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-900 text-base leading-tight">Daily Register</h3>
                <span className="text-xs font-semibold text-amber-600 flex items-center gap-1 mt-0.5">
                  Mark Today <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                </span>
              </div>
            </div>
            <div className="w-8 h-8 rounded-full bg-amber-100/60 flex items-center justify-center text-amber-700 opacity-60 group-hover:opacity-100 transition-opacity">
              <ArrowRight className="w-4 h-4" />
            </div>
          </Card>

          {/* Card 3: Avg. Attendance */}
          <Card className="p-4 bg-gradient-to-br from-emerald-50/80 to-teal-50/40 border border-emerald-200/70 hover:border-emerald-400 hover:shadow-md transition-all rounded-2xl flex items-center justify-between">
            <div className="flex items-center space-x-3.5">
              <div className="w-11 h-11 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-xs">
                <TrendingUp className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-900 text-base leading-tight">Avg. Attendance</h3>
                <span className="text-xs text-slate-500 mt-0.5 block">School-wide Average</span>
              </div>
            </div>
            <div className="text-right">
              <span className="text-2xl font-black text-emerald-600 tracking-tight">
                {insights.overall}%
              </span>
            </div>
          </Card>

        </div>

        {/* FILTERS Section */}
        <Card className="p-5 shadow-xs border-slate-200/80 rounded-2xl bg-white space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Filter className="w-3.5 h-3.5 text-indigo-600" />
              <h3 className="text-xs font-bold text-slate-600 uppercase tracking-wider">FILTERS</h3>
            </div>
            {(selectedClasses.length > 0 || selectedStudents.length > 0 || selectedGender !== 'All Genders') && (
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => {
                  setSelectedClasses([]);
                  setSelectedStudents([]);
                  setSelectedGender('All Genders');
                  setSelectedReligion('All Religions');
                  setSelectedOccupation('All Occupations');
                  setSelectedMonths([currentMonthNum]);
                }}
                className="h-7 text-xs text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 font-medium"
              >
                Reset All Filters
              </Button>
            )}
          </div>

          {/* First Row of Filters: Month, Year, Gender, Religion, Occupation */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3.5">
            
            {/* MONTH(S) Multi-Select */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wide">
                MONTHS {selectedMonths.length > 1 && `(${selectedMonths.length})`}
              </label>
              <Popover open={monthDropdownOpen} onOpenChange={setMonthDropdownOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="h-10 w-full justify-between text-left font-normal text-sm px-3 bg-white border-slate-200 hover:border-slate-300">
                    <span className="truncate">
                      {selectedMonths.length === 12
                        ? "All Months"
                        : selectedMonths.length === 1
                        ? MONTHS.find(m => m.value === selectedMonths[0])?.label
                        : `${selectedMonths.length} Months selected`}
                    </span>
                    <ChevronsUpDown className="ml-1.5 h-3.5 w-3.5 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-56 p-2 rounded-xl" align="start">
                  <div className="flex items-center justify-between border-b pb-2 mb-2 px-1">
                    <span className="text-xs font-semibold text-slate-700">Select Months</span>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" onClick={selectAllMonths} className="h-6 text-[10px] px-1.5 text-indigo-600">
                        All
                      </Button>
                      <Button variant="ghost" size="sm" onClick={selectCurrentMonthOnly} className="h-6 text-[10px] px-1.5 text-slate-600">
                        Current
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-1 max-h-60 overflow-y-auto">
                    {MONTHS.map(m => {
                      const isChecked = selectedMonths.includes(m.value);
                      return (
                        <div
                          key={m.value}
                          onClick={() => toggleMonth(m.value)}
                          className="flex items-center space-x-2.5 px-2 py-1.5 rounded-lg hover:bg-slate-100 cursor-pointer text-sm"
                        >
                          <Checkbox checked={isChecked} onCheckedChange={() => toggleMonth(m.value)} />
                          <span className={isChecked ? 'font-medium text-indigo-900' : 'text-slate-700'}>
                            {m.label}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </PopoverContent>
              </Popover>
            </div>

            {/* YEAR Select */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wide">YEAR</label>
              <Select value={selectedYear.toString()} onValueChange={(v) => setSelectedYear(parseInt(v))}>
                <SelectTrigger className="h-10 text-sm bg-white border-slate-200"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {YEARS.map(y => <SelectItem key={y} value={y.toString()}>{y}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* GENDER Select */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wide">GENDER</label>
              <Select value={selectedGender} onValueChange={setSelectedGender}>
                <SelectTrigger className="h-10 text-sm bg-white border-slate-200"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="All Genders">All Genders</SelectItem>
                  <SelectItem value="Male">Male</SelectItem>
                  <SelectItem value="Female">Female</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* RELIGION Select */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wide">RELIGION</label>
              <Select value={selectedReligion} onValueChange={setSelectedReligion}>
                <SelectTrigger className="h-10 text-sm bg-white border-slate-200"><SelectValue placeholder="All Religions" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="All Religions">All Religions</SelectItem>
                  <SelectItem value="Hindu">Hindu</SelectItem>
                  <SelectItem value="Muslim">Muslim</SelectItem>
                  <SelectItem value="Christian">Christian</SelectItem>
                  <SelectItem value="Sikh">Sikh</SelectItem>
                  <SelectItem value="Other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* OCCUPATION Select */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wide">OCCUPATION</label>
              <Select value={selectedOccupation} onValueChange={setSelectedOccupation}>
                <SelectTrigger className="h-10 text-sm bg-white border-slate-200"><SelectValue placeholder="All Occupations" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="All Occupations">All Occupations</SelectItem>
                  <SelectItem value="Student">Student</SelectItem>
                  <SelectItem value="Parent - Salaried">Parent - Salaried</SelectItem>
                  <SelectItem value="Self-Employed">Self-Employed</SelectItem>
                  <SelectItem value="Business">Business</SelectItem>
                  <SelectItem value="Other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>

          </div>

          {/* Second Row of Filters: Multi-select Classes and Big Stretched Student Search Field */}
          <div className="flex flex-col md:flex-row items-stretch md:items-end gap-3.5 pt-1">
            
            {/* CLASSES FILTER Multi-Select */}
            <div className="w-full md:w-72 space-y-1.5 shrink-0">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wide">
                  CLASSES FILTER {selectedClasses.length > 0 && `(${selectedClasses.length})`}
                </label>
                {selectedClasses.length > 0 && (
                  <span 
                    onClick={selectAllClasses} 
                    className="text-[10px] text-indigo-600 hover:underline cursor-pointer font-medium"
                  >
                    Select All Classes
                  </span>
                )}
              </div>
              
              <Popover open={classDropdownOpen} onOpenChange={setClassDropdownOpen}>
                <PopoverTrigger asChild>
                  <Button 
                    variant="outline" 
                    className="h-10 w-full justify-between text-left font-normal text-sm px-3 bg-white border-slate-200 hover:border-slate-300"
                  >
                    <span className="truncate font-medium text-slate-800">
                      {isAllClasses
                        ? "All Classes"
                        : selectedClasses.length === 1
                        ? classMap.get(selectedClasses[0]) || "1 Class Selected"
                        : `${selectedClasses.length} Classes Selected`}
                    </span>
                    <ChevronsUpDown className="ml-1.5 h-3.5 w-3.5 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                
                <PopoverContent className="w-72 p-2 rounded-xl shadow-lg border-slate-200" align="start">
                  <div className="p-1 mb-2">
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
                      <input 
                        type="text" 
                        placeholder="Filter classes..." 
                        value={classFilterSearch}
                        onChange={(e) => setClassFilterSearch(e.target.value)}
                        className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
                      />
                    </div>
                  </div>

                  <div className="space-y-1 max-h-64 overflow-y-auto px-1">
                    {/* All Classes Option */}
                    <div 
                      onClick={selectAllClasses}
                      className="flex items-center space-x-2.5 px-2.5 py-2 rounded-lg hover:bg-indigo-50/70 cursor-pointer border-b border-slate-100"
                    >
                      <Checkbox checked={isAllClasses} onCheckedChange={selectAllClasses} />
                      <span className={`text-sm ${isAllClasses ? 'font-bold text-indigo-900' : 'font-medium text-slate-700'}`}>
                        All Classes
                      </span>
                    </div>

                    {/* Class Options */}
                    {filteredClassOptions.map(c => {
                      const isChecked = selectedClasses.includes(c.id);
                      const stdCount = students.filter(s => s.class_id === c.id).length;
                      return (
                        <div 
                          key={c.id}
                          onClick={() => toggleClass(c.id)}
                          className="flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-slate-100 cursor-pointer text-sm"
                        >
                          <div className="flex items-center space-x-2.5 truncate">
                            <Checkbox checked={isChecked} onCheckedChange={() => toggleClass(c.id)} />
                            <span className={isChecked ? 'font-semibold text-indigo-900' : 'text-slate-700'}>
                              {c.name}
                            </span>
                          </div>
                          <Badge variant="secondary" className="text-[10px] font-normal text-slate-500 bg-slate-100">
                            {stdCount} std
                          </Badge>
                        </div>
                      );
                    })}

                    {filteredClassOptions.length === 0 && (
                      <div className="text-xs text-slate-400 text-center py-4">No matching classes found</div>
                    )}
                  </div>
                </PopoverContent>
              </Popover>
            </div>

            {/* INDIVIDUAL STUDENTS: BIG STRETCHED SEARCH FIELD */}
            <div className="flex-1 space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wide">
                  INDIVIDUAL STUDENTS {selectedStudents.length > 0 && `(${selectedStudents.length} SELECTED)`}
                </label>
                {selectedStudents.length > 0 && (
                  <button 
                    onClick={clearAllSelectedStudents}
                    className="text-[10px] text-rose-600 hover:underline font-semibold flex items-center gap-1 cursor-pointer"
                  >
                    <X className="w-3 h-3" /> Clear Selection
                  </button>
                )}
              </div>

              <Popover open={studentSearchOpen} onOpenChange={setStudentSearchOpen}>
                <PopoverTrigger asChild>
                  <div className="relative w-full cursor-pointer">
                    <div className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm flex items-center justify-between shadow-2xs hover:border-slate-300">
                      <div className="flex items-center space-x-2 overflow-hidden flex-1">
                        <Search className="h-4 w-4 text-slate-400 shrink-0" />
                        {selectedStudents.length === 0 ? (
                          <span className="text-slate-400 font-normal truncate">
                            Search and select students to compare attendance...
                          </span>
                        ) : (
                          <div className="flex items-center gap-1.5 overflow-hidden flex-1">
                            <Badge className="bg-indigo-600 text-white shrink-0 text-xs px-2 py-0.5">
                              {selectedStudents.length} selected
                            </Badge>
                            <span className="text-xs text-slate-600 truncate">
                              {selectedStudents
                                .slice(0, 3)
                                .map(id => students.find(s => s.id === id)?.name)
                                .filter(Boolean)
                                .join(', ')}
                              {selectedStudents.length > 3 && ` + ${selectedStudents.length - 3} more`}
                            </span>
                          </div>
                        )}
                      </div>
                      <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50 ml-2" />
                    </div>
                  </div>
                </PopoverTrigger>

                <PopoverContent className="w-[var(--radix-popover-trigger-width)] min-w-[340px] max-w-2xl p-0 rounded-xl shadow-xl border-slate-200" align="start">
                  <Command>
                    <div className="p-2 border-b border-slate-100 flex items-center">
                      <Search className="w-4 h-4 text-slate-400 mr-2 shrink-0" />
                      <input 
                        type="text" 
                        placeholder="Type student name or roll number..." 
                        value={studentSearchInput}
                        onChange={(e) => setStudentSearchInput(e.target.value)}
                        className="w-full text-sm bg-transparent border-none focus:outline-hidden text-slate-800 placeholder:text-slate-400"
                      />
                      {studentSearchInput && (
                        <button onClick={() => setStudentSearchInput('')} className="text-slate-400 hover:text-slate-600 p-1">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    <CommandList className="max-h-72 overflow-y-auto p-1.5">
                      {searchedStudents.length === 0 ? (
                        <CommandEmpty className="py-6 text-center text-xs text-slate-500">
                          No students found matching your criteria.
                        </CommandEmpty>
                      ) : (
                        <CommandGroup>
                          {searchedStudents.map(student => {
                            const isSelected = selectedStudents.includes(student.id);
                            const cName = classMap.get(student.class_id) || 'Unknown Class';
                            return (
                              <CommandItem
                                key={student.id}
                                value={student.name}
                                onSelect={() => toggleStudent(student.id)}
                                className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-slate-100 cursor-pointer"
                              >
                                <div className="flex items-center space-x-3 truncate">
                                  <Checkbox checked={isSelected} onCheckedChange={() => toggleStudent(student.id)} />
                                  <div className="w-7 h-7 rounded-full bg-indigo-100 text-indigo-700 font-bold text-xs flex items-center justify-center shrink-0">
                                    {student.name.charAt(0).toUpperCase()}
                                  </div>
                                  <div className="truncate">
                                    <div className="text-sm font-medium text-slate-900 truncate">{student.name}</div>
                                    <div className="text-[11px] text-slate-500 flex items-center gap-1.5">
                                      <span>{cName}</span>
                                      {student.gender && <span>• {student.gender}</span>}
                                      {student.roll_number && <span>• Roll: {student.roll_number}</span>}
                                    </div>
                                  </div>
                                </div>
                                {isSelected && (
                                  <Badge className="bg-emerald-600 text-white text-[10px]">Selected</Badge>
                                )}
                              </CommandItem>
                            );
                          })}
                        </CommandGroup>
                      )}
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

          </div>

          {/* Selected Student Chips for Quick Dismiss */}
          {selectedStudents.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <span className="text-xs text-slate-500 font-medium mr-1">Active Students:</span>
              {selectedStudents.map(id => {
                const std = students.find(s => s.id === id);
                if (!std) return null;
                const cName = classMap.get(std.class_id);
                return (
                  <Badge 
                    key={id} 
                    variant="secondary" 
                    className="bg-indigo-50 text-indigo-700 border border-indigo-200/60 pl-2.5 pr-1 py-1 rounded-full text-xs font-medium flex items-center gap-1.5"
                  >
                    <span>{std.name} {cName ? `(${cName})` : ''}</span>
                    <button 
                      onClick={() => removeStudentTag(id)} 
                      className="hover:bg-indigo-200/80 text-indigo-700 rounded-full p-0.5 transition-colors"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </Badge>
                );
              })}
            </div>
          )}

        </Card>

        {/* MAIN CONTENT AREA: Comparison Chart & Insights */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          
          {/* Main Comparison Chart (3 cols) */}
          <Card className="lg:col-span-3 p-6 shadow-xs border-slate-200/80 rounded-2xl bg-white flex flex-col min-h-[460px]">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 mb-2 border-b border-slate-100 gap-2">
              <div>
                <h2 className="text-base sm:text-lg font-bold text-slate-800 tracking-wide uppercase">
                  {chartTitle}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  {selectedStudents.length > 0 
                    ? `Comparing attendance for ${chartData.length} selected individual students`
                    : selectedClasses.length === 1
                    ? `Showing attendance for all students enrolled in ${classMap.get(selectedClasses[0])}`
                    : selectedClasses.length > 1
                    ? `Side-by-side attendance comparison of ${chartData.length} selected classes`
                    : 'School-wide comparative view of attendance across all classes'}
                </p>
              </div>

              {chartData.length > 0 && (
                <div className="flex items-center gap-2 self-start sm:self-auto">
                  <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 border-none font-semibold text-xs">
                    ★ Top: {insights.maxItem} ({insights.max}%)
                  </Badge>
                </div>
              )}
            </div>
            
            {loading ? (
              <div className="flex-1 flex flex-col justify-center items-center py-20">
                <Loader2 className="h-10 w-10 animate-spin text-indigo-600 mb-2" />
                <span className="text-sm font-medium text-slate-500">Calculating attendance metrics...</span>
              </div>
            ) : chartData.length === 0 ? (
              <div className="flex-1 flex flex-col justify-center items-center py-20 text-slate-400">
                <Users className="w-12 h-12 stroke-1 text-slate-300 mb-2" />
                <p className="text-base font-semibold text-slate-600">No attendance records found</p>
                <p className="text-xs text-slate-400 mt-1">Try selecting different months, classes or students.</p>
              </div>
            ) : (
              <div className="flex-1 w-full h-[400px] mt-4">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 25, right: 15, left: -15, bottom: 45 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis 
                      dataKey="shortName" 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fill: '#475569', fontSize: 12, fontWeight: 500 }}
                      dy={10}
                      angle={chartData.length > 8 ? -35 : 0}
                      textAnchor={chartData.length > 8 ? 'end' : 'middle'}
                      height={60}
                    />
                    <YAxis 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fill: '#94a3b8', fontSize: 12 }} 
                      domain={[0, 100]}
                      tickFormatter={(val) => `${val}%`}
                    />
                    <Tooltip 
                      cursor={{ fill: 'rgba(241, 245, 249, 0.6)' }}
                      content={({ active, payload }) => {
                        if (!active || !payload || !payload.length) return null;
                        const data = payload[0].payload;
                        return (
                          <div className="bg-slate-900 text-white px-3.5 py-2.5 rounded-xl shadow-xl text-xs space-y-1">
                            <p className="font-bold text-sm text-white">{data.displayName || data.name}</p>
                            <p className="text-emerald-400 font-semibold text-sm">Attendance: {data.percent}%</p>
                            <div className="text-slate-300 text-[11px] pt-1 border-t border-slate-700/80 flex gap-3">
                              <span>Present: <b className="text-white">{data.present}</b></span>
                              <span>Total Days: <b className="text-white">{data.total}</b></span>
                            </div>
                          </div>
                        );
                      }}
                    />
                    <Bar dataKey="percent" radius={[6, 6, 0, 0]} maxBarSize={56}>
                      {chartData.map((entry, index) => {
                        const isTop = index === 0 && entry.percent > 0;
                        const barColor = isTop ? '#10b981' : COLOR_PALETTE[(index % (COLOR_PALETTE.length - 1)) + 1];
                        return (
                          <Cell 
                            key={`cell-${index}`} 
                            fill={barColor} 
                          />
                        );
                      })}
                      <LabelList 
                        dataKey="percent" 
                        position="top" 
                        formatter={(val: number) => `${val}%`} 
                        style={{ fill: '#1e293b', fontSize: 12, fontWeight: '700' }} 
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>

          {/* Right Insights & Performance Column (1 col) */}
          <div className="space-y-4">
            
            {/* Monthly Overview Card */}
            <Card className="p-5 shadow-xs border-slate-200/80 rounded-2xl bg-white">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-7 h-7 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                  <CalendarDays className="w-4 h-4" />
                </div>
                <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">MONTHLY OVERVIEW</h3>
              </div>
              
              <p className="text-sm text-slate-600 leading-relaxed">
                In the period of <span className="font-bold text-slate-900">{selectedMonthsText}</span>, the overall attendance of the school was{' '}
                <span className="font-extrabold text-emerald-600 text-base">{insights.overall}%</span>.
              </p>

              <div className="mt-4 pt-3 border-t border-slate-100 grid grid-cols-2 gap-2 text-center">
                <div className="bg-slate-50 p-2 rounded-xl">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Total Days</span>
                  <span className="text-sm font-bold text-slate-700">{insights.totalRecords}</span>
                </div>
                <div className="bg-emerald-50/60 p-2 rounded-xl">
                  <span className="text-[10px] uppercase font-bold text-emerald-600 block">Present</span>
                  <span className="text-sm font-bold text-emerald-700">{insights.presentRecords}</span>
                </div>
              </div>
            </Card>

            {/* Performance Comparison Card */}
            <Card className="p-5 shadow-xs border-slate-200/80 rounded-2xl bg-white">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                  <TrendingUp className="w-4 h-4" />
                </div>
                <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  {selectedStudents.length > 0 ? 'STUDENT PERFORMANCE' : 'CLASS PERFORMANCE'}
                </h3>
              </div>
              
              <p className="text-sm text-slate-600 leading-relaxed">
                Attendance across items ranged between{' '}
                <span className="font-bold text-slate-900">{insights.min}%</span> to{' '}
                <span className="font-bold text-slate-900">{insights.max}%</span>.
              </p>

              {chartData.length > 0 && (
                <div className="space-y-2 mt-4 pt-3 border-t border-slate-100">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500 flex items-center gap-1.5 truncate">
                      <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                      Highest: <b className="text-slate-800 truncate">{insights.maxItem}</b>
                    </span>
                    <span className="font-bold text-emerald-600 shrink-0">{insights.max}%</span>
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500 flex items-center gap-1.5 truncate">
                      <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                      Lowest: <b className="text-slate-800 truncate">{insights.minItem}</b>
                    </span>
                    <span className="font-bold text-rose-500 shrink-0">{insights.min}%</span>
                  </div>
                </div>
              )}
            </Card>

            {/* Top Rankings List */}
            {chartData.length > 0 && (
              <Card className="p-5 shadow-xs border-slate-200/80 rounded-2xl bg-white">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-7 h-7 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
                    <Award className="w-4 h-4" />
                  </div>
                  <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">TOP RANKINGS</h3>
                </div>

                <div className="space-y-2.5">
                  {chartData.slice(0, 4).map((item, idx) => (
                    <div key={item.id} className="flex items-center justify-between text-xs p-2 rounded-xl bg-slate-50 hover:bg-slate-100 transition-colors">
                      <div className="flex items-center space-x-2 truncate">
                        <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black shrink-0 ${
                          idx === 0 ? 'bg-amber-100 text-amber-800' :
                          idx === 1 ? 'bg-slate-200 text-slate-700' :
                          idx === 2 ? 'bg-amber-50 text-amber-900' :
                          'bg-slate-100 text-slate-500'
                        }`}>
                          #{idx + 1}
                        </span>
                        <span className="font-medium text-slate-800 truncate">{item.displayName || item.name}</span>
                      </div>
                      <Badge className="bg-emerald-50 text-emerald-700 border border-emerald-200/60 font-bold shrink-0">
                        {item.percent}%
                      </Badge>
                    </div>
                  ))}
                </div>
              </Card>
            )}

          </div>

        </div>

      </div>

      {/* Settings Dialog (Late threshold) */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold">Attendance Settings</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm font-semibold text-slate-700 mb-1 block">
                Late Check-in Time (Threshold)
              </label>
              <p className="text-xs text-slate-500 mb-3">
                Students checking in after this time will automatically be marked as Late (LT).
              </p>
              <input 
                type="time" 
                step="1"
                className="border border-slate-200 rounded-xl px-3 py-2 w-full text-sm focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                value={lateTime}
                onChange={(e) => setLateTime(e.target.value)}
              />
            </div>
            <Button onClick={handleSaveSettings} disabled={saving} className="w-full bg-indigo-600 hover:bg-indigo-700">
              {saving ? 'Saving...' : 'Save Settings'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Global Import Dialog */}
      <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-indigo-600" />
              Global Attendance Import
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="border-2 border-dashed border-slate-300 rounded-2xl p-6 text-center hover:border-indigo-500 transition-colors cursor-pointer bg-slate-50/50">
              <UploadCloud className="w-10 h-10 text-indigo-500 mx-auto mb-2" />
              <p className="text-sm font-semibold text-slate-700">Upload Attendance Spreadsheet</p>
              <p className="text-xs text-slate-400 mt-1">Supports CSV, XLSX with student ID and dates</p>
              <Button variant="outline" size="sm" className="mt-4 text-xs font-medium">
                Browse File
              </Button>
            </div>

            <div className="bg-amber-50 border border-amber-200/80 rounded-xl p-3 text-xs text-amber-800">
              <b>Format tip:</b> Columns should include <code>student_id</code>, <code>class_id</code>, <code>date</code>, and <code>status (P/LT/A)</code>.
            </div>

            <Button 
              onClick={() => {
                toast.info('File upload preview will process once file is selected');
                setImportDialogOpen(false);
              }}
              className="w-full bg-indigo-600 hover:bg-indigo-700 rounded-xl"
            >
              Done
            </Button>
          </div>
        </DialogContent>
      </Dialog>

    </DashboardLayout>
  );
}
