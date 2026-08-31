import React, { useEffect, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/card';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, Calendar as CalendarIcon, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { format } from 'date-fns';

interface StudentData {
  id: string;
  name: string;
    roll_number?: string;
  student_id?: string;
  roll_no?: string;
}

interface AttendanceRecord {
  student_id: string;
  status: 'P' | 'LT' | 'A' | 'L' | 'H';
}

export default function DailyAttendanceMarking() {
  const { classId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  
  const [className, setClassName] = useState('');
  const [students, setStudents] = useState<StudentData[]>([]);
  const [attendance, setAttendance] = useState<Record<string, 'P' | 'LT' | 'A' | 'L'>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [lateThreshold, setLateThreshold] = useState('09:00:00');

  useEffect(() => {
    fetchClassData();
    fetchSettings();
  }, [classId]);

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

      const { data: studs } = await supabase.from('students').select('id, name, roll_number, student_id').eq('class_id', classId).order('name');
      if (studs) setStudents(studs);
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
        
      const attMap: Record<string, any> = {};
      if (data) {
        data.forEach(record => {
          attMap[record.student_id] = record.status;
        });
      }
      setAttendance(attMap);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleMark = (studentId: string, status: 'P' | 'LT' | 'A' | 'L' | 'H') => {
    setAttendance(prev => ({ ...prev, [studentId]: status }));
  };

  const handleBulkMark = (status: 'P' | 'A' | 'H') => {
    const newAtt = { ...attendance };
    students.forEach(s => {
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
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
            <div>
              <h2 className="text-xl font-semibold flex items-center gap-2">
                <CalendarIcon className="w-5 h-5 text-blue-600" />
                {className}
              </h2>
              <p className="text-sm text-muted-foreground">Daily Attendance Register</p>
            </div>
            
            <div className="flex items-center gap-3 w-full sm:w-auto">
              <input 
                type="date" 
                className="border rounded-md px-3 py-2 text-sm w-full sm:w-auto"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                max={format(new Date(), 'yyyy-MM-dd')}
              />
              <Button onClick={handleSave} disabled={saving} className="bg-indigo-600 hover:bg-indigo-700 whitespace-nowrap">
                <Save className="w-4 h-4 mr-2" />
                {saving ? 'Saving...' : 'SAVE'}
              </Button>
            </div>
          </div>

          {isHoliday() && (
            <div className="p-4 mb-6 text-amber-600 bg-amber-50 rounded-lg border border-amber-200">
              <h3 className="font-semibold">Sunday / Holiday Warning</h3>
              <p className="text-sm mt-1">You are marking attendance for a Sunday. This is allowed but usually not required.</p>
            </div>
          )}

          <>
            <div className="flex justify-between items-center pb-4 border-b">
              <span className="text-xs font-semibold text-slate-500 tracking-wider">BULK ACTIONS</span>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" className="text-green-700 border-green-200 hover:bg-green-50" onClick={() => handleBulkMark('P')}>MARK ALL P</Button>
                  <Button size="sm" variant="outline" className="text-red-700 border-red-200 hover:bg-red-50" onClick={() => handleBulkMark('A')}>MARK ALL A</Button>
                  <Button size="sm" variant="outline" className="text-purple-700 border-purple-200 hover:bg-purple-50" onClick={() => handleBulkMark('H')}>MARK ALL H</Button>
                </div>
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
                ) : students.length === 0 ? (
                  <div className="py-12 text-center text-muted-foreground">No students in this class.</div>
                ) : (
                  <div className="divide-y">
                    {students.map((student) => (
                      <div key={student.id} className="flex justify-between items-center py-3 border-b last:border-0 hover:bg-slate-50/50 transition-colors">
                          <div className="flex items-center w-1/2">
                            <div className="w-20 sm:w-24 shrink-0 font-mono text-xs font-semibold text-slate-500">
                              {student.student_id || student.roll_number || '-'}
                            </div>
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-600 uppercase">
                                {student.name.charAt(0)}
                              </div>
                              <span className="font-medium text-sm text-slate-800">{student.name}</span>
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
