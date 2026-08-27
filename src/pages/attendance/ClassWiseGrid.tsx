import React, { useEffect, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/card';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface ClassData {
  id: string;
  name: string;
}

interface StudentData {
  id: string;
  name: string;
  roll_no?: string;
}

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

export default function ClassWiseGrid() {
  const navigate = useNavigate();
  const { user } = useAuth();
  
  const currentDate = new Date();
  const [selectedMonth, setSelectedMonth] = useState<number>(currentDate.getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState<number>(currentDate.getFullYear());
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  
  const [classes, setClasses] = useState<ClassData[]>([]);
  const [students, setStudents] = useState<StudentData[]>([]);
  const [attendanceData, setAttendanceData] = useState<Record<string, Record<number, string>>>({});
  
  const [loading, setLoading] = useState(false);
  const [classesLoading, setClassesLoading] = useState(true);

  // Years for dropdown (e.g., current year - 2 to current year + 2)
  const years = Array.from({ length: 5 }, (_, i) => currentDate.getFullYear() - 2 + i);

  useEffect(() => {
    fetchClasses();
  }, [user]);

  useEffect(() => {
    if (selectedClassId) {
      fetchGridData();
    } else {
      setStudents([]);
      setAttendanceData({});
    }
  }, [selectedClassId, selectedMonth, selectedYear]);

  const fetchClasses = async () => {
    setClassesLoading(true);
    try {
      if (!user?.email) return;

      const { data: profile } = await supabase
        .from('user_profiles')
        .select('role_id, id')
        .ilike('email', user.email)
        .maybeSingle();

      const roleId = profile?.role_id;
      let query = supabase.from('classes').select('id, name').neq('name', '__SYSTEM_DEV_MODE__').order('name');

      if (roleId === 4) {
        const { data: fac } = await supabase
          .from('facilitators')
          .select('id')
          .ilike('email', user.email)
          .maybeSingle();
          
        if (fac) {
          const { data: facClasses } = await supabase
            .from('facilitator_classes')
            .select('class_id')
            .eq('facilitator_id', fac.id);
          
          if (facClasses && facClasses.length > 0) {
            query = query.in('id', facClasses.map(fc => fc.class_id));
          } else {
            setClasses([]);
            setClassesLoading(false);
            return;
          }
        }
      }

      const { data, error } = await query;
      if (!error && data) {
        setClasses(data);
        if (data.length > 0) {
          setSelectedClassId(data[0].id);
        }
      }
    } catch (error) {
      console.error('Error fetching classes:', error);
    } finally {
      setClassesLoading(false);
    }
  };

  const fetchGridData = async () => {
    if (!selectedClassId) return;
    setLoading(true);
    try {
      // 1. Fetch Students
      const { data: studs } = await supabase
        .from('students')
        .select('id, name')
        .eq('class_id', selectedClassId)
        .order('name');
        
      setStudents(studs || []);

      // 2. Fetch Attendance for the month
      const startDate = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-01`;
      const lastDay = new Date(selectedYear, selectedMonth, 0).getDate();
      const endDate = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

      const { data: attRecords } = await supabase
        .from('daily_attendance')
        .select('student_id, date, status')
        .eq('class_id', selectedClassId)
        .gte('date', startDate)
        .lte('date', endDate);

      // 3. Process data into Map: { studentId: { dayNumber: status } }
      const attMap: Record<string, Record<number, string>> = {};
      if (attRecords) {
        attRecords.forEach(record => {
          const day = new Date(record.date).getDate();
          if (!attMap[record.student_id]) {
            attMap[record.student_id] = {};
          }
          attMap[record.student_id][day] = record.status;
        });
      }
      setAttendanceData(attMap);

    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const daysInMonth = new Date(selectedYear, selectedMonth, 0).getDate();
  const daysArray = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  const getStatusDisplay = (day: number, studentId: string) => {
    // Check if recorded
    const status = attendanceData[studentId]?.[day];
    if (status) return status;

    // Check if Sunday
    const dateObj = new Date(selectedYear, selectedMonth - 1, day);
    if (dateObj.getDay() === 0) {
      return 'H'; // Sunday
    }

    // Check if future date
    const today = new Date();
    today.setHours(0,0,0,0);
    if (dateObj > today) {
      return '';
    }

    return '-'; // Not marked yet
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'P': return 'text-green-700 font-bold';
      case 'A': return 'text-red-500 font-bold';
      case 'L': return 'text-blue-500 font-bold';
      case 'LT': return 'text-yellow-600 font-bold';
      case 'H': return 'text-slate-900 font-bold text-xs';
      default: return 'text-slate-300';
    }
  };

  return (
    <DashboardLayout>
      <div className="p-6 md:p-8 max-w-[100vw] mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="icon" onClick={() => navigate('/attendance-management')}>
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 uppercase">CLASS WISE ATTENDANCE</h1>
            <p className="text-muted-foreground text-sm">Detailed daily view for students.</p>
          </div>
        </div>

        <Card className="p-6">
          {/* Filters */}
          <div className="flex flex-col md:flex-row gap-4 mb-6">
            <div className="flex-1">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1 block">Select Class</label>
              <Select value={selectedClassId} onValueChange={setSelectedClassId} disabled={classesLoading}>
                <SelectTrigger className="w-full sm:w-[250px] bg-slate-50">
                  <SelectValue placeholder="Select a class" />
                </SelectTrigger>
                <SelectContent>
                  {classes.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1 block">Month</label>
              <Select value={selectedMonth.toString()} onValueChange={(v) => setSelectedMonth(Number(v))}>
                <SelectTrigger className="w-[150px] bg-slate-50">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MONTHS.map(m => (
                    <SelectItem key={m.value} value={m.value.toString()}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1 block">Year</label>
              <Select value={selectedYear.toString()} onValueChange={(v) => setSelectedYear(Number(v))}>
                <SelectTrigger className="w-[120px] bg-slate-50">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {years.map(y => (
                    <SelectItem key={y} value={y.toString()}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Data Grid */}
          <div className="border rounded-xl overflow-x-auto shadow-sm">
            <table className="w-full text-sm text-center border-collapse min-w-max">
              <thead>
                <tr className="bg-slate-50 text-slate-500 text-xs tracking-wider border-b">
                  <th className="sticky left-0 bg-slate-50 p-3 font-semibold text-left min-w-[200px] border-r z-10">
                    <div className="flex items-center gap-4">
                      <span>ROLL NO</span>
                      <span>STUDENT NAME</span>
                    </div>
                  </th>
                  {daysArray.map(day => (
                    <th key={day} className="p-2 min-w-[32px] font-semibold">
                      {day}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y text-slate-600">
                {loading ? (
                  <tr>
                    <td colSpan={daysInMonth + 1} className="py-12 text-center">
                      Loading grid data...
                    </td>
                  </tr>
                ) : students.length === 0 ? (
                  <tr>
                    <td colSpan={daysInMonth + 1} className="py-12 text-center text-muted-foreground">
                      No students found for the selected class.
                    </td>
                  </tr>
                ) : (
                  students.map(student => (
                    <tr key={student.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="sticky left-0 bg-white group-hover:bg-slate-50/50 p-3 border-r text-left z-10 shadow-[1px_0_0_0_#e2e8f0]">
                        <div className="flex items-center gap-4">
                          <span className="font-mono text-xs text-blue-600 font-semibold w-12">{student.roll_no || student.id.substring(0, 5).toUpperCase()}</span>
                          <span className="font-medium text-slate-800">{student.name}</span>
                        </div>
                      </td>
                      {daysArray.map(day => {
                        const status = getStatusDisplay(day, student.id);
                        return (
                          <td key={day} className="p-1">
                            <div className="flex items-center justify-center w-full h-full min-h-[32px]">
                              <span className={getStatusColor(status)}>
                                {status}
                              </span>
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </DashboardLayout>
  );
}
