import React, { useEffect, useState, useMemo } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/card';
import { useNavigate } from 'react-router-dom';
import { Users, CalendarDays, Settings, Loader2, Check, ChevronsUpDown } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { toast } from 'sonner';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList, Cell } from 'recharts';

const MONTHS = [
  { value: 1, label: 'January' },
  { value: 2, label: 'February' },
  { value: 3, label: 'March' },
  { value: 4, label: 'April' },
  { value: 5, label: 'May' },
  { value: 6, label: 'June' },
  { value: 7, label: 'July' },
  { value: 8, label: 'August' },
  { value: 9, label: 'September' },
  { value: 10, label: 'October' },
  { value: 11, label: 'November' },
  { value: 12, label: 'December' },
];

const YEARS = [2024, 2025, 2026, 2027];

export default function AttendanceManagement() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  
  // Settings
  const [lateTime, setLateTime] = useState('09:00:00');
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  // Filters
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedGender, setSelectedGender] = useState('All Genders');
  const [selectedClass, setSelectedClass] = useState('all');
  const [selectedStudents, setSelectedStudents] = useState<string[]>([]);
  
  // Data
  const [classes, setClasses] = useState<{id: string, name: string}[]>([]);
  const [students, setStudents] = useState<{id: string, name: string, class_id: string, gender: string}[]>([]);
  const [attendanceRecords, setAttendanceRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Combobox state
  const [studentSearchOpen, setStudentSearchOpen] = useState(false);

  useEffect(() => {
    checkRoleAndFetchSettings();
    fetchClassesAndStudents();
  }, [user]);

  useEffect(() => {
    fetchAttendance();
  }, [selectedMonth, selectedYear]);

  const checkRoleAndFetchSettings = async () => {
    if (!user?.email) return;
    try {
      const { data: profile } = await supabase.from('user_profiles').select('role_id').ilike('email', user.email).maybeSingle();
      if (profile?.role_id === 1) setIsAdmin(true);
      const { data: settings } = await supabase.from('attendance_settings').select('late_threshold_time').eq('id', 1).maybeSingle();
      if (settings?.late_threshold_time) setLateTime(settings.late_threshold_time);
    } catch (e) {}
  };

  const fetchClassesAndStudents = async () => {
    try {
      const { data: clsData } = await supabase.from('classes').select('id, name').neq('name', '__SYSTEM_DEV_MODE__').order('name');
      if (clsData) setClasses(clsData);

      const { data: stdData } = await supabase.from('students').select('id, name, class_id, gender');
      if (stdData) setStudents(stdData);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchAttendance = async () => {
    setLoading(true);
    try {
      const startDate = new Date(selectedYear, selectedMonth - 1, 1).toISOString().split('T')[0];
      const endDate = new Date(selectedYear, selectedMonth, 0).toISOString().split('T')[0];

      const { data } = await supabase
        .from('daily_attendance')
        .select('student_id, class_id, status, date')
        .gte('date', startDate)
        .lte('date', endDate);
      
      setAttendanceRecords(data || []);
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
      toast.success('Settings saved');
      setDialogOpen(false);
    } catch (e) {
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  // Filtered Students for combobox
  const availableStudents = useMemo(() => {
    let filtered = students;
    if (selectedClass !== 'all') {
      filtered = filtered.filter(s => s.class_id === selectedClass);
    }
    if (selectedGender !== 'All Genders') {
      filtered = filtered.filter(s => (s.gender || '').toLowerCase() === selectedGender.toLowerCase());
    }
    return filtered;
  }, [students, selectedClass, selectedGender]);

  const toggleStudent = (id: string) => {
    setSelectedStudents(prev => 
      prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]
    );
  };

  // Prepare Chart Data
  const chartData = useMemo(() => {
    if (!attendanceRecords.length) return [];

    let filteredRecords = attendanceRecords;
    
    // Apply Class filter
    if (selectedClass !== 'all') {
      filteredRecords = filteredRecords.filter(r => r.class_id === selectedClass);
    }

    // Apply Gender filter via join logic
    if (selectedGender !== 'All Genders') {
      const allowedStdIds = new Set(students.filter(s => (s.gender || '').toLowerCase() === selectedGender.toLowerCase()).map(s => s.id));
      filteredRecords = filteredRecords.filter(r => allowedStdIds.has(r.student_id));
    }

    // Apply specific students filter
    if (selectedStudents.length > 0) {
      filteredRecords = filteredRecords.filter(r => selectedStudents.includes(r.student_id));
    }

    // Grouping
    // Mode 1: Multiselect students -> show each student
    // Mode 2: Specific class -> show each student in that class
    // Mode 3: All classes -> show each class
    
    const showStudents = selectedStudents.length > 0 || selectedClass !== 'all';

    const grouped: Record<string, { total: number, present: number, name: string }> = {};

    if (showStudents) {
      // Group by student
      const relevantStudents = selectedStudents.length > 0 
        ? students.filter(s => selectedStudents.includes(s.id))
        : students.filter(s => s.class_id === selectedClass);

      relevantStudents.forEach(s => {
        grouped[s.id] = { total: 0, present: 0, name: s.name.split(' ')[0] }; // short name
      });

      filteredRecords.forEach(r => {
        if (grouped[r.student_id]) {
          grouped[r.student_id].total++;
          if (r.status === 'P' || r.status === 'LT') grouped[r.student_id].present++;
        }
      });
    } else {
      // Group by class
      classes.forEach(c => {
        grouped[c.id] = { total: 0, present: 0, name: c.name };
      });

      filteredRecords.forEach(r => {
        if (grouped[r.class_id]) {
          grouped[r.class_id].total++;
          if (r.status === 'P' || r.status === 'LT') grouped[r.class_id].present++;
        }
      });
    }

    const result = Object.values(grouped).map(g => {
      const percent = g.total > 0 ? Math.round((g.present / g.total) * 100) : 0;
      return {
        name: g.name,
        percent,
      };
    }).filter(item => showStudents ? item.name : true); // don't filter out classes if 0 to show the whole school

    return result.sort((a, b) => b.percent - a.percent); // sort by highest attendance

  }, [attendanceRecords, selectedClass, selectedGender, selectedStudents, classes, students]);

  // Insights
  const insights = useMemo(() => {
    let totalRecords = 0;
    let presentRecords = 0;
    attendanceRecords.forEach(r => {
      totalRecords++;
      if (r.status === 'P' || r.status === 'LT') presentRecords++;
    });
    const overall = totalRecords > 0 ? Math.round((presentRecords / totalRecords) * 100) : 0;

    let min = 100, max = 0;
    let minClass = '', maxClass = '';
    
    const classData = chartData; // If showStudents is false, chartData is classes
    
    if (selectedClass === 'all' && selectedStudents.length === 0) {
      classData.forEach(c => {
        if (c.percent > max) { max = c.percent; maxClass = c.name; }
        if (c.percent < min && c.percent > 0) { min = c.percent; minClass = c.name; } // avoid 0 if no records
      });
    }

    return { overall, min, max, minClass, maxClass };
  }, [attendanceRecords, chartData, selectedClass, selectedStudents]);

  return (
    <DashboardLayout>
      <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto space-y-6 bg-slate-50 min-h-screen">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">ATTENDANCE MANAGEMENT</h1>
            <p className="text-muted-foreground text-sm mt-1">Global tracking and school-wide metrics.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => navigate('/attendance-management/class-wise')} className="bg-white">
              <Users className="w-4 h-4 mr-2" /> Class Wise
            </Button>
            <Button variant="outline" size="sm" onClick={() => navigate('/attendance-management/daily')} className="bg-white">
              <CalendarDays className="w-4 h-4 mr-2" /> Daily Register
            </Button>
            {isAdmin && (
              <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm" className="bg-white">
                    <Settings className="w-4 h-4 mr-2" /> Settings
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Attendance Settings</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div>
                      <label className="text-sm font-medium mb-1 block">Late Check-in Time (Threshold)</label>
                      <p className="text-sm text-muted-foreground mb-3">
                        Students checking in after this time marked as Late (LT).
                      </p>
                      <input 
                        type="time" 
                        step="1"
                        className="border rounded-md px-3 py-2 w-full"
                        value={lateTime}
                        onChange={(e) => setLateTime(e.target.value)}
                      />
                    </div>
                    <Button onClick={handleSaveSettings} disabled={saving} className="w-full">
                      {saving ? 'Saving...' : 'Save Settings'}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            )}
          </div>
        </div>

        {/* Filters Section */}
        <Card className="p-4 shadow-sm border-slate-200">
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">FILTERS</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 xl:grid-cols-7 gap-3">
            <div className="space-y-1.5">
              <label className="text-[10px] font-semibold text-slate-500 uppercase">MONTHS</label>
              <Select value={selectedMonth.toString()} onValueChange={(v) => setSelectedMonth(parseInt(v))}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MONTHS.map(m => <SelectItem key={m.value} value={m.value.toString()}>{m.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-semibold text-slate-500 uppercase">YEAR</label>
              <Select value={selectedYear.toString()} onValueChange={(v) => setSelectedYear(parseInt(v))}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {YEARS.map(y => <SelectItem key={y} value={y.toString()}>{y}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-semibold text-slate-500 uppercase">GENDER</label>
              <Select value={selectedGender} onValueChange={setSelectedGender}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="All Genders">All Genders</SelectItem>
                  <SelectItem value="Male">Male</SelectItem>
                  <SelectItem value="Female">Female</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-semibold text-slate-500 uppercase">RELIGION</label>
              <Select defaultValue="all">
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="All Religions" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Religions</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-semibold text-slate-500 uppercase">OCCUPATION</label>
              <Select defaultValue="all">
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="All Occupations" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Occupations</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 xl:col-span-1">
              <label className="text-[10px] font-semibold text-slate-500 uppercase">CLASSES FILTER</label>
              <Select value={selectedClass} onValueChange={(v) => { setSelectedClass(v); setSelectedStudents([]); }}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Classes</SelectItem>
                  {classes.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 xl:col-span-1">
              <label className="text-[10px] font-semibold text-slate-500 uppercase">INDIVIDUAL STUDENTS</label>
              <Popover open={studentSearchOpen} onOpenChange={setStudentSearchOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" role="combobox" aria-expanded={studentSearchOpen} className="h-9 w-full justify-between text-left font-normal text-sm px-3">
                    <span className="truncate">
                      {selectedStudents.length === 0 ? "Search students..." : `${selectedStudents.length} selected`}
                    </span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[200px] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Search students..." />
                    <CommandList>
                      <CommandEmpty>No students found.</CommandEmpty>
                      <CommandGroup>
                        {availableStudents.map(student => (
                          <CommandItem
                            key={student.id}
                            value={student.name}
                            onSelect={() => toggleStudent(student.id)}
                          >
                            <Check className={`mr-2 h-4 w-4 ${selectedStudents.includes(student.id) ? "opacity-100" : "opacity-0"}`} />
                            {student.name}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
          </div>
        </Card>

        {/* Main Content Area */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <Card className="lg:col-span-3 p-6 shadow-sm border-slate-200 flex flex-col min-h-[400px]">
            <h2 className="text-lg font-bold text-slate-800 text-center uppercase mb-6 tracking-wide">
              {selectedStudents.length > 0 ? 'STUDENTS' : selectedClass !== 'all' ? `${classes.find(c => c.id === selectedClass)?.name}` : 'CLASSES'} ATTENDANCE {MONTHS.find(m => m.value === selectedMonth)?.label.toUpperCase()} {selectedYear}
            </h2>
            
            {loading ? (
              <div className="flex-1 flex justify-center items-center">
                <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
              </div>
            ) : chartData.length === 0 ? (
              <div className="flex-1 flex justify-center items-center text-slate-500">
                No attendance data found for this period.
              </div>
            ) : (
              <div className="flex-1 w-full h-[400px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 20, right: 10, left: -20, bottom: 40 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis 
                      dataKey="name" 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fill: '#64748b', fontSize: 12, fontWeight: 500 }}
                      dy={10}
                      angle={chartData.length > 10 ? -45 : 0}
                      textAnchor={chartData.length > 10 ? 'end' : 'middle'}
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
                      cursor={{fill: 'transparent'}}
                      contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                      formatter={(value) => [`${value}%`, 'Attendance']}
                    />
                    <Bar dataKey="percent" radius={[4, 4, 0, 0]} maxBarSize={50}>
                      {chartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.percent >= 75 ? '#15803d' : '#3b82f6'} />
                      ))}
                      <LabelList dataKey="percent" position="top" formatter={(val: number) => `${val}%`} style={{ fill: '#475569', fontSize: 11, fontWeight: 'bold' }} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>

          <div className="space-y-6">
            <Card className="p-5 shadow-sm border-slate-200 bg-white">
              <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide mb-3">MONTHLY OVERVIEW</h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                In the period of <span className="font-semibold text-slate-800">{MONTHS.find(m => m.value === selectedMonth)?.label}</span>, the overall attendance of the school was <span className="font-bold text-emerald-600">{insights.overall}%</span>.
              </p>
            </Card>

            {(selectedClass === 'all' && selectedStudents.length === 0) && (
              <Card className="p-5 shadow-sm border-slate-200 bg-white">
                <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide mb-3">CLASS PERFORMANCE</h3>
                <p className="text-sm text-slate-600 leading-relaxed">
                  Attendance across classes ranged between <span className="font-bold text-slate-800">{insights.min}%</span> to <span className="font-bold text-slate-800">{insights.max}%</span>.
                  {' '}<span className="font-semibold">{insights.maxClass}</span> had the highest attendance at <span className="font-bold text-emerald-600">{insights.max}%</span>, while <span className="font-semibold">{insights.minClass}</span> was the lowest at <span className="font-bold text-rose-500">{insights.min}%</span>.
                </p>
              </Card>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
