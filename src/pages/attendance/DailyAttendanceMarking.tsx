import React, { useEffect, useState, useMemo } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/card';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, Calendar as CalendarIcon, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { useAcademicYear } from '@/contexts/AcademicYearContext';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface StudentData {
  id: string;
  name: string;
  roll_number?: string;
  student_id?: string;
  roll_no?: string;
  email?: string;
  designation?: string | null;
}

interface AttendanceRecord {
  student_id: string;
  status: 'P' | 'LT' | 'A' | 'L' | 'H';
}

export default function DailyAttendanceMarking() {
  const { classId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { selectedYear } = useAcademicYear();
  
  const [className, setClassName] = useState('');
  const [students, setStudents] = useState<StudentData[]>([]);
  const [attendance, setAttendance] = useState<Record<string, 'P' | 'LT' | 'A' | 'L'>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [lateThreshold, setLateThreshold] = useState('09:00:00');
  const [selectedDesignation, setSelectedDesignation] = useState<string>('all');
  const [selectedAttendanceStatus, setSelectedAttendanceStatus] = useState<string>('all');

  useEffect(() => {
    fetchClassData();
    fetchSettings();
  }, [classId, selectedYear]);

  useEffect(() => {
    if (students.length > 0) {
      fetchAttendance();
    }
  }, [selectedDate, students]);

  const fetchSettings = async () => {
    try {
      const { data } = await supabase.from('attendance_settings').select('late_threshold_time').eq('id', 1).maybeSingle();
      if (data && data.late_threshold_time) {
        setLateThreshold(data.late_threshold_time);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchClassData = async () => {
    if (!classId) return;
    try {
      const { data: cls } = await supabase.from('classes').select('name').eq('id', classId).single();
      if (cls) setClassName(cls.name);

      const { data: studs } = await supabase
        .from('students')
        .select('id, name, roll_number, student_id, email, designation')
        .eq('class_id', classId)
        .eq('academic_year', selectedYear)
        .order('name');
      if (studs) {
        const emails = studs.map(s => s.email).filter(Boolean);
        const ids = studs.map(s => s.id).filter(Boolean);
        let activeData = studs;

        try {
          const queryOr: string[] = [];
          if (ids.length > 0) queryOr.push(`id.in.(${ids.join(',')})`);
          if (emails.length > 0) queryOr.push(`email.in.(${emails.join(',')})`);

          if (queryOr.length > 0) {
            const { data: profiles } = await supabase
              .from('user_profiles')
              .select('id, email, is_active')
              .or(queryOr.join(','));

            if (profiles) {
              const profileMapById = new Map(profiles.map(p => [p.id, p.is_active]));
              const profileMapByEmail = new Map(profiles.filter(p => p.email).map(p => [p.email!.toLowerCase().trim(), p.is_active]));

              activeData = studs.filter(s => {
                if (profileMapById.has(s.id) && profileMapById.get(s.id) === false) return false;
                if (s.email && profileMapByEmail.get(s.email.toLowerCase().trim()) === false) return false;
                return true;
              });
            }
          }
        } catch (err) {
          console.error('Error filtering inactive students:', err);
        }
        setStudents(activeData);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchAttendance = async () => {
    if (!classId) return;
    setLoading(true);
    try {
      const { data } = await supabase
        .from('daily_attendance')
        .select('student_id, status')
        .eq('class_id', classId)
        .eq('date', selectedDate);
        
      const attMap: Record<string, 'P' | 'LT' | 'A' | 'L' | 'H'> = {};
      if (data) {
        data.forEach(record => {
          attMap[record.student_id] = record.status as 'P' | 'LT' | 'A' | 'L' | 'H';
        });
      }
      setAttendance(attMap);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const availableDesignations = useMemo(() => {
    const set = new Set<string>();
    students.forEach(s => {
      if (s.designation && s.designation.trim()) {
        set.add(s.designation.trim());
      }
    });

    const standard = ['1. CCC', '2. Junior Fellow', '3. Senior Fellow'];
    const result: string[] = [];

    standard.forEach(std => {
      const hasMatch = Array.from(set).some(d => 
        d === std || 
        (std === '1. CCC' && (d.toLowerCase().includes('ccc') || d.startsWith('1'))) ||
        (std === '2. Junior Fellow' && (d.toLowerCase().includes('junior') || d.startsWith('2'))) ||
        (std === '3. Senior Fellow' && (d.toLowerCase().includes('senior') || d.startsWith('3')))
      );
      if (hasMatch) {
        result.push(std);
      }
    });

    set.forEach(d => {
      const isAlreadyInResult = result.some(r => 
        r === d || 
        (r === '1. CCC' && (d.toLowerCase().includes('ccc') || d.startsWith('1'))) ||
        (r === '2. Junior Fellow' && (d.toLowerCase().includes('junior') || d.startsWith('2'))) ||
        (r === '3. Senior Fellow' && (d.toLowerCase().includes('senior') || d.startsWith('3')))
      );
      if (!isAlreadyInResult) {
        result.push(d);
      }
    });

    if (result.length === 0) {
      return ['1. CCC', '2. Junior Fellow'];
    }
    return result;
  }, [students]);

  const studentsByDesignation = useMemo(() => {
    if (selectedDesignation === 'all' || !selectedDesignation) {
      return students;
    }
    const target = selectedDesignation.toLowerCase().trim();
    return students.filter(s => {
      if (!s.designation) return false;
      const des = s.designation.toLowerCase().trim();
      if (des === target) return true;
      if (target === '1. ccc' && (des.includes('ccc') || des.includes('certified') || des.startsWith('1'))) return true;
      if (target === '2. junior fellow' && (des.includes('junior') || des.includes('intern') || des.startsWith('2'))) return true;
      if (target === '3. senior fellow' && (des.includes('senior') || des.startsWith('3'))) return true;
      return des.includes(target);
    });
  }, [students, selectedDesignation]);

  const counts = useMemo(() => {
    let p = 0;
    let lt = 0;
    let a = 0;
    let l = 0;
    let h = 0;
    let unmarked = 0;

    studentsByDesignation.forEach((student) => {
      const status = attendance[student.id];
      if (status === 'P') p++;
      else if (status === 'LT') lt++;
      else if (status === 'A') a++;
      else if (status === 'L') l++;
      else if (status === 'H') h++;
      else unmarked++;
    });

    return {
      p,
      lt,
      a,
      l,
      h,
      unmarked,
      total: studentsByDesignation.length,
    };
  }, [studentsByDesignation, attendance]);

  const filteredStudents = useMemo(() => {
    if (selectedAttendanceStatus === 'all' || !selectedAttendanceStatus) {
      return studentsByDesignation;
    }
    if (selectedAttendanceStatus === 'unmarked') {
      return studentsByDesignation.filter(s => !attendance[s.id]);
    }
    return studentsByDesignation.filter(s => attendance[s.id] === selectedAttendanceStatus);
  }, [studentsByDesignation, selectedAttendanceStatus, attendance]);

  const handleMark = (studentId: string, status: 'P' | 'LT' | 'A' | 'L' | 'H') => {
    setAttendance(prev => ({ ...prev, [studentId]: status }));
  };

  const handleBulkMark = (status: 'P' | 'A' | 'H') => {
    const newAtt = { ...attendance };
    filteredStudents.forEach(s => {
      newAtt[s.id] = status;
    });
    setAttendance(newAtt);
  };
  
  const handleSave = async () => {
    if (!classId || !user?.email) return;
    setSaving(true);
    try {
      const { data: profile } = await supabase.from('user_profiles').select('id').ilike('email', user.email).maybeSingle();
      
      const records = Object.keys(attendance).map(studentId => ({
        student_id: studentId,
        class_id: classId,
        date: selectedDate,
        status: attendance[studentId],
        check_in_time: new Date().toISOString(),
        recorded_by: profile?.id
      }));

      if (records.length === 0) {
        toast.error('No attendance to save');
        setSaving(false);
        return;
      }

      // We'll use upsert. 
      const { error } = await supabase
        .from('daily_attendance')
        .upsert(records, { onConflict: 'student_id,date' });

      if (error) throw error;
      toast.success('Attendance saved successfully');
    } catch (e) {
      console.error('Save error', e);
      toast.error('Failed to save attendance');
    } finally {
      setSaving(false);
    }
  };

  const isHoliday = () => {
    const d = new Date(selectedDate);
    return d.getDay() === 0; // 0 is Sunday
  };

  return (
    <DashboardLayout>
      <div className="p-6 md:p-8 max-w-5xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="icon" onClick={() => navigate('/attendance-management/daily')}>
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 uppercase">DAILY ATTENDANCE</h1>
            <p className="text-muted-foreground text-sm">{className}</p>
          </div>
        </div>

        <Card className="p-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
            <div>
              <h2 className="text-xl font-semibold flex items-center gap-2">
                <CalendarIcon className="w-5 h-5 text-blue-600" />
                {className}
              </h2>
              <p className="text-sm text-muted-foreground">Daily Attendance Register</p>
            </div>
            
            <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
              {/* Designation Filter */}
              <div className="flex flex-col bg-card border border-border px-3 py-1 rounded-lg justify-center h-10 min-w-[170px] shadow-xs">
                <label className="text-[10px] text-muted-foreground font-semibold leading-none mb-0.5">DESIGNATION</label>
                <Select value={selectedDesignation} onValueChange={setSelectedDesignation}>
                  <SelectTrigger className="h-5 border-none bg-transparent focus:ring-0 text-xs font-semibold p-0 shadow-none hover:bg-transparent">
                    <SelectValue placeholder="All Designations" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Designations</SelectItem>
                    {availableDesignations.map((des) => (
                      <SelectItem key={des} value={des}>
                        {des}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Attendance Status Filter */}
              <div className="flex flex-col bg-card border border-border px-3 py-1 rounded-lg justify-center h-10 min-w-[160px] shadow-xs">
                <label className="text-[10px] text-muted-foreground font-semibold leading-none mb-0.5">ATTENDANCE</label>
                <Select value={selectedAttendanceStatus} onValueChange={setSelectedAttendanceStatus}>
                  <SelectTrigger className="h-5 border-none bg-transparent focus:ring-0 text-xs font-semibold p-0 shadow-none hover:bg-transparent">
                    <SelectValue placeholder="All Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="P">Present (P)</SelectItem>
                    <SelectItem value="A">Absent (A)</SelectItem>
                    <SelectItem value="LT">Late (LT)</SelectItem>
                    <SelectItem value="L">Leave (L)</SelectItem>
                    <SelectItem value="H">Holiday (H)</SelectItem>
                    <SelectItem value="unmarked">Unmarked</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <input 
                type="date" 
                className="border rounded-md px-3 py-2 text-sm h-10 w-full sm:w-auto"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                max={format(new Date(), 'yyyy-MM-dd')}
              />
              <Button onClick={handleSave} disabled={saving} className="bg-indigo-600 hover:bg-indigo-700 whitespace-nowrap h-10">
                <Save className="w-4 h-4 mr-2" />
                {saving ? 'Saving...' : 'SAVE'}
              </Button>
            </div>
          </div>

          {/* Real-time Attendance Count Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
            <div 
              onClick={() => setSelectedAttendanceStatus('all')}
              className={`bg-slate-50 border rounded-xl p-3 flex flex-col items-center justify-center text-center shadow-xs cursor-pointer transition-all hover:bg-slate-100 ${
                selectedAttendanceStatus === 'all' ? 'ring-2 ring-slate-400 border-slate-400' : 'border-slate-200/80'
              }`}
            >
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Total</span>
              <span className="text-2xl font-bold text-slate-800 mt-0.5">{counts.total}</span>
            </div>
            <div 
              onClick={() => setSelectedAttendanceStatus(selectedAttendanceStatus === 'P' ? 'all' : 'P')}
              className={`bg-emerald-50/80 border rounded-xl p-3 flex flex-col items-center justify-center text-center shadow-xs cursor-pointer transition-all hover:bg-emerald-100/80 ${
                selectedAttendanceStatus === 'P' ? 'ring-2 ring-emerald-500 border-emerald-500' : 'border-emerald-200'
              }`}
            >
              <span className="text-[11px] font-semibold text-emerald-700 uppercase tracking-wider">Present (P)</span>
              <span className="text-2xl font-bold text-emerald-700 mt-0.5">{counts.p}</span>
            </div>
            <div 
              onClick={() => setSelectedAttendanceStatus(selectedAttendanceStatus === 'A' ? 'all' : 'A')}
              className={`bg-rose-50/80 border rounded-xl p-3 flex flex-col items-center justify-center text-center shadow-xs cursor-pointer transition-all hover:bg-rose-100/80 ${
                selectedAttendanceStatus === 'A' ? 'ring-2 ring-rose-500 border-rose-500' : 'border-rose-200'
              }`}
            >
              <span className="text-[11px] font-semibold text-rose-700 uppercase tracking-wider">Absent (A)</span>
              <span className="text-2xl font-bold text-rose-700 mt-0.5">{counts.a}</span>
            </div>
            <div 
              onClick={() => setSelectedAttendanceStatus(selectedAttendanceStatus === 'LT' ? 'all' : 'LT')}
              className={`bg-amber-50/80 border rounded-xl p-3 flex flex-col items-center justify-center text-center shadow-xs cursor-pointer transition-all hover:bg-amber-100/80 ${
                selectedAttendanceStatus === 'LT' ? 'ring-2 ring-amber-500 border-amber-500' : 'border-amber-200'
              }`}
            >
              <span className="text-[11px] font-semibold text-amber-700 uppercase tracking-wider">Late (LT)</span>
              <span className="text-2xl font-bold text-amber-700 mt-0.5">{counts.lt}</span>
            </div>
            <div 
              onClick={() => setSelectedAttendanceStatus(selectedAttendanceStatus === 'L' ? 'all' : 'L')}
              className={`bg-blue-50/80 border rounded-xl p-3 flex flex-col items-center justify-center text-center shadow-xs cursor-pointer transition-all hover:bg-blue-100/80 ${
                selectedAttendanceStatus === 'L' ? 'ring-2 ring-blue-500 border-blue-500' : 'border-blue-200'
              }`}
            >
              <span className="text-[11px] font-semibold text-blue-700 uppercase tracking-wider">Leave (L)</span>
              <span className="text-2xl font-bold text-blue-700 mt-0.5">{counts.l}</span>
            </div>
            <div 
              onClick={() => setSelectedAttendanceStatus(selectedAttendanceStatus === 'H' ? 'all' : 'H')}
              className={`bg-purple-50/80 border rounded-xl p-3 flex flex-col items-center justify-center text-center shadow-xs cursor-pointer transition-all hover:bg-purple-100/80 ${
                selectedAttendanceStatus === 'H' ? 'ring-2 ring-purple-500 border-purple-500' : 'border-purple-200'
              }`}
            >
              <span className="text-[11px] font-semibold text-purple-700 uppercase tracking-wider">Holiday (H)</span>
              <span className="text-2xl font-bold text-purple-700 mt-0.5">{counts.h}</span>
            </div>
          </div>

          {isHoliday() && (
            <div className="p-4 mb-6 text-amber-600 bg-amber-50 rounded-lg border border-amber-200">
              <h3 className="font-semibold">Sunday / Holiday Warning</h3>
              <p className="text-sm mt-1">You are marking attendance for a Sunday. This is allowed but usually not required.</p>
            </div>
          )}

          <>
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pb-4 border-b">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-xs font-semibold text-slate-500 tracking-wider">BULK ACTIONS</span>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" className="text-green-700 border-green-200 hover:bg-green-50" onClick={() => handleBulkMark('P')}>MARK ALL P</Button>
                  <Button size="sm" variant="outline" className="text-red-700 border-red-200 hover:bg-red-50" onClick={() => handleBulkMark('A')}>MARK ALL A</Button>
                  <Button size="sm" variant="outline" className="text-purple-700 border-purple-200 hover:bg-purple-50" onClick={() => handleBulkMark('H')}>MARK ALL H</Button>
                </div>
              </div>

              {selectedAttendanceStatus !== 'all' && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    Filtered by: <span className="font-semibold text-slate-700">
                      {selectedAttendanceStatus === 'unmarked' ? 'Unmarked' : 
                       selectedAttendanceStatus === 'P' ? 'Present (P)' :
                       selectedAttendanceStatus === 'A' ? 'Absent (A)' :
                       selectedAttendanceStatus === 'LT' ? 'Late (LT)' :
                       selectedAttendanceStatus === 'L' ? 'Leave (L)' :
                       selectedAttendanceStatus === 'H' ? 'Holiday (H)' : selectedAttendanceStatus}
                    </span> ({filteredStudents.length})
                  </span>
                  <Button 
                    size="sm" 
                    variant="ghost" 
                    className="h-7 text-xs text-blue-600 hover:text-blue-800 px-2"
                    onClick={() => setSelectedAttendanceStatus('all')}
                  >
                    Clear Filter
                  </Button>
                </div>
              )}
            </div>

              <div className="mt-4">
                <div className="flex justify-between items-center pb-3 border-b text-xs font-semibold text-slate-500 tracking-wider">
                  <div className="flex w-1/2">
                    <div className="w-20 sm:w-24 shrink-0 uppercase">ROLL</div>
                    <div className="uppercase">STUDENT NAME</div>
                  </div>
                  <div className="uppercase text-right pr-2">ATTENDANCE STATUS</div>
                </div>

                {loading ? (
                  <div className="py-12 text-center text-muted-foreground">Loading students...</div>
                ) : filteredStudents.length === 0 ? (
                  <div className="py-12 text-center text-muted-foreground">No students match the selected filters.</div>
                ) : (
                  <div className="divide-y">
                    {filteredStudents.map((student) => (
                      <div key={student.id} className="flex justify-between items-center py-3 border-b last:border-0 hover:bg-slate-50/50 transition-colors">
                          <div className="flex items-center w-1/2">
                            <div className="w-20 sm:w-24 shrink-0 font-mono text-xs font-semibold text-slate-500">
                              {student.student_id || student.roll_number || '-'}
                            </div>
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-600 uppercase">
                                {student.name.charAt(0)}
                              </div>
                              <div className="flex flex-col">
                                <span className="font-medium text-sm text-slate-800">{student.name}</span>
                                {student.designation && (
                                  <span className="text-[11px] text-muted-foreground font-medium">{student.designation}</span>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="flex justify-end gap-1 sm:gap-2 pr-1">
                          <button 
                            onClick={() => handleMark(student.id, 'P')}
                            className={`w-8 h-8 sm:w-10 sm:h-10 rounded text-xs font-bold transition-colors ${attendance[student.id] === 'P' ? 'bg-green-600 text-white' : 'bg-slate-100 text-slate-400 hover:bg-green-100 hover:text-green-600'}`}
                          >
                            P
                          </button>
                          <button 
                            onClick={() => handleMark(student.id, 'LT')}
                            className={`w-8 h-8 sm:w-10 sm:h-10 rounded text-xs font-bold transition-colors ${attendance[student.id] === 'LT' ? 'bg-yellow-500 text-white' : 'bg-slate-100 text-slate-400 hover:bg-yellow-100 hover:text-yellow-600'}`}
                          >
                            LT
                          </button>
                          <button 
                            onClick={() => handleMark(student.id, 'A')}
                            className={`w-8 h-8 sm:w-10 sm:h-10 rounded text-xs font-bold transition-colors ${attendance[student.id] === 'A' ? 'bg-red-500 text-white' : 'bg-slate-100 text-slate-400 hover:bg-red-100 hover:text-red-500'}`}
                          >
                            A
                          </button>
                          <button 
                            onClick={() => handleMark(student.id, 'L')}
                            className={`w-8 h-8 sm:w-10 sm:h-10 rounded text-xs font-bold transition-colors ${attendance[student.id] === 'L' ? 'bg-blue-500 text-white' : 'bg-slate-100 text-slate-400 hover:bg-blue-100 hover:text-blue-500'}`}
                          >
                            L
                          </button>
                          <button 
                            onClick={() => handleMark(student.id, 'H')}
                            className={`w-8 h-8 sm:w-10 sm:h-10 rounded text-xs font-bold transition-colors ${attendance[student.id] === 'H' ? 'bg-purple-500 text-white' : 'bg-slate-100 text-slate-400 hover:bg-purple-100 hover:text-purple-500'}`}
                          >
                            H
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
        </Card>
      </div>
    </DashboardLayout>
  );
}
