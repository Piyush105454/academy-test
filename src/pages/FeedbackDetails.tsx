import { useState, useEffect } from 'react';
import { ArrowLeft, Download, Edit } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { formatSingleSessionCode } from '@/utils/sessionIdGenerator';

interface FeedbackData {
  id: string;
  session_id_code?: string;
  title: string;
  session_date: string;
  session_time: string;
  facilitator_name: string;
  volunteer_name: string;
  session_objective: string | null;
  practical_activities: string | null;
  session_highlights: string | null;
  learning_outcomes: string | null;
  facilitator_reflection: string | null;
  best_performer: string | null;
  guest_teacher_feedback: string | null;
  incharge_reviewer_feedback: string | null;
  mic_sound_rating: number | null;
  seating_view_rating: number | null;
  session_strength: number | null;
  class_batch: string | null;
  recorded_at: string | null;
  coordinator_mic_sound_rating: number | null;
  coordinator_seating_view_rating: number | null;
  coordinator_session_strength: number | null;
  record_sheet_link?: string | null;
  recording_url?: string | null;
  coordinator_name?: string | null;
  session_type?: string | null;
  content_category?: string | null;
  module_name?: string | null;
  topics_covered?: string | null;
  supervisor_feedback_status?: string | null;
}

interface StudentPerformance {
  id: string;
  student_name: string;
  attendance_status?: 'Present' | 'Absent';
  questions_asked: number;
  performance_rating: number;
  performance_comment: string;
  bad_behaviour_points?: number;
}

interface SessionHoursTracker {
  id: string;
  plan_coordinate_hours: number;
  preparation_hours: number;
  session_hours: number;
  reflection_feedback_followup_hours: number;
  total_volunteering_time: number;
  logged_hours_in_benevity: boolean;
  notes: string;
  supervisor_feedback?: string;
}

export default function FeedbackDetails() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { sessionId } = useParams();
  const [loading, setLoading] = useState(true);

  const getFormattedSessionType = (type?: string | null) => {
    switch (type) {
      case 'guest_teacher': return 'Guest Teacher';
      case 'guest_speaker': return 'Guest Speaker';
      case 'local_teacher': return 'Local Teacher';
      default: return type || 'Regular Session';
    }
  };
  const [feedback, setFeedback] = useState<FeedbackData | null>(null);
  const [studentPerformance, setStudentPerformance] = useState<StudentPerformance[]>([]);
  const [allStudents, setAllStudents] = useState<any[]>([]);
  const [hoursTracker, setHoursTracker] = useState<SessionHoursTracker | null>(null);
  const [userRole, setUserRole] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<'facilitator' | 'coordinator' | 'supervisor'>('facilitator');
  const [printMode, setPrintMode] = useState<'standard' | 'supervisor'>('standard');

  const handlePrint = (mode: 'standard' | 'supervisor') => {
    setPrintMode(mode);
    setTimeout(() => {
      window.print();
    }, 100);
  };

  useEffect(() => {
    if (user?.id) {
      loadUserRole();
    }
  }, [user?.id]);

  const loadUserRole = async () => {
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('role_id')
        .eq('id', user?.id)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('Error loading user role:', error);
      }

      if (data?.role_id) {
        setUserRole(data.role_id);
      }
    } catch (error) {
      console.error('Error loading user role:', error);
    }
  };

  useEffect(() => {
    if (sessionId) {
      fetchFeedback();
      fetchStudentPerformance();
      fetchHoursTracker();
      fetchAllStudentsInClass();
    }
  }, [sessionId]);

  const fetchStudentPerformance = async () => {
    try {
      const { data, error } = await supabase
        .from('student_performance' as any)
        .select('*')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: true });

      if (error) throw error;

      // Clean up old data and deduplicate
      const cleaned = (data || []).map((item: any) => ({
        ...item,
        student_name: (item.student_name || '').trim(),
        performance_comment: (item.performance_comment === 'Present' || item.performance_comment === 'Absent') ? '' : (item.performance_comment || ''),
        performance_rating: item.performance_rating === 5 ? 0 : (item.performance_rating ?? 0),
        bad_behaviour_points: item.bad_behaviour_points ?? 0,
      }));

      const deduplicated = cleaned.reduce((acc: any[], current: any) => {
        const x = acc.findIndex(item => (item.student_name || '').trim() === (current.student_name || '').trim());
        if (x > -1) {
          acc[x] = current;
        } else {
          acc.push(current);
        }
        return acc;
      }, []);

      setStudentPerformance(deduplicated as unknown as StudentPerformance[]);
    } catch (error) {
      console.error('Error fetching student performance:', error);
    }
  };

  const fetchAllStudentsInClass = async () => {
    try {
      // Get session to find its class batch and academic year
      const { data: sessionData, error: sessionError } = await supabase
        .from('sessions')
        .select('class_batch, academic_year')
        .eq('id', sessionId)
        .single();

      if (sessionError || !sessionData?.class_batch) {
        console.warn('Could not find class batch for session');
        return;
      }

      // Find class by matching class_batch name
      const { data: classData, error: classError } = await supabase
        .from('classes')
        .select('id')
        .ilike('name', `%${sessionData.class_batch}%`)
        .single();

      if (classError || !classData) {
        console.warn('Could not find class for session');
        return;
      }

      // Fetch all students from that class, filtered by session academic year if available
      let studentQuery = supabase
        .from('students')
        .select('id, name, student_id')
        .eq('class_id', classData.id);

      if (sessionData?.academic_year) {
        studentQuery = studentQuery.eq('academic_year', sessionData.academic_year);
      }

      const { data: studentsData, error: studentsError } = await studentQuery.order('name', { ascending: true });

      if (studentsError) throw studentsError;

      console.log('Students fetched:', studentsData);
      setAllStudents(studentsData || []);
    } catch (error) {
      console.error('Error fetching all students:', error);
    }
  };

  const fetchFeedback = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('sessions')
        .select(`
          *,
          coordinators:coordinator_id(name)
        `)
        .eq('id', sessionId)
        .single();

      if (error) throw error;
      
      // Extract coordinator name from the joined relationship
      const sessionData = data as any;
      const coordinatorName = sessionData.coordinators?.name || null;
      const generatedCode = sessionData.session_id_code || formatSingleSessionCode(sessionData.session_date, sessionData.class_batch, sessionData.session_type);
      
      setFeedback({
        ...sessionData,
        session_id_code: generatedCode,
        coordinator_name: coordinatorName
      } as any);
    } catch (error) {
      console.error('Error fetching feedback:', error);
      toast.error('Failed to load feedback');
      navigate('/feedback');
    } finally {
      setLoading(false);
    }
  };

  const fetchHoursTracker = async () => {
    try {
      const { data, error } = await supabase
        .from('session_hours_tracker' as any)
        .select('*')
        .eq('session_id', sessionId)
        .single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }
      if (data) {
        const record = data as any;
        let sFeedback = record.supervisor_feedback || '';
        let cleanNotes = record.notes || '';

        if (!sFeedback && cleanNotes.includes('SUPERVISOR_FEEDBACK:')) {
          const parts = cleanNotes.split('SUPERVISOR_FEEDBACK:');
          const fbPart = parts[1]?.split('\n---NOTES---\n')[0] || parts[1];
          sFeedback = fbPart?.trim() || '';
          const noteParts = parts[1]?.split('\n---NOTES---\n');
          cleanNotes = noteParts && noteParts.length > 1 ? noteParts[1].trim() : (parts[0] || '').trim();
        }

        setHoursTracker({
          ...record,
          notes: cleanNotes,
          supervisor_feedback: sFeedback,
        } as unknown as SessionHoursTracker);
      }
    } catch (error) {
      console.error('Error fetching hours tracker:', error);
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </DashboardLayout>
    );
  }

  if (!feedback) {
    return (
      <DashboardLayout>
        <div className="text-center py-12">
          <p className="text-muted-foreground">Feedback not found</p>
        </div>
      </DashboardLayout>
    );
  }

  // Get all present students with their calculated finalRating
  const presentStudentsWithPerformance = (() => {
    let list: { studentName: string; rating: number; comment: string; id: string }[] = [];

    if (allStudents.length > 0) {
      allStudents.forEach((student) => {
        const perfData = studentPerformance.find(
          (sp) => (sp.student_name || '').trim() === student.name.trim()
        );
        if (perfData && perfData.attendance_status !== 'Absent') {
          const finalRating = Math.max(
            0,
            ((perfData.questions_asked ?? 0) +
              (perfData.performance_rating ?? 0) -
              (perfData.bad_behaviour_points ?? 0)) /
              2
          );
          list.push({
            id: student.id,
            studentName: student.name,
            rating: finalRating,
            comment: perfData.performance_comment || '',
          });
        }
      });
    } else {
      studentPerformance
        .filter((s) => s.attendance_status !== 'Absent')
        .forEach((student) => {
          const finalRating = Math.max(
            0,
            ((student.questions_asked ?? 0) +
              (student.performance_rating ?? 0) -
              (student.bad_behaviour_points ?? 0)) /
              2
          );
          list.push({
            id: student.id,
            studentName: student.student_name,
            rating: finalRating,
            comment: student.performance_comment || '',
          });
        });
    }

    // Sort by rating descending
    return list.sort((a, b) => b.rating - a.rating);
  })();

  return (
    <DashboardLayout>
      {/* PRINT VIEW - Only visible when printing */}
      <div className="hidden print:block w-full max-w-none bg-white text-black p-4 space-y-4">
        {/* WES Logo Header */}
        <div className="flex justify-between items-center border-b pb-3 mb-4">
          <div className="flex items-center gap-3">
            <img src="/wes-logo.jpg" alt="WES Foundation Logo" className="h-12 w-auto object-contain" />
            <div>
              <h1 className="text-xl font-bold text-gray-900">WES Foundation</h1>
              <p className="text-[10px] text-gray-500">Session Feedback & Performance Report</p>
            </div>
          </div>
          <div className="text-right text-[10px] text-gray-400">
            Report Generated: {new Date().toLocaleDateString('en-IN')}
          </div>
        </div>
        
        {/* Header Info */}
        <div className="bg-gray-50 p-3 rounded-lg border border-gray-200 mb-4">
          <h2 className="text-sm font-bold text-gray-950 mb-2">{feedback.title}</h2>
          <div className="grid grid-cols-3 gap-y-2 gap-x-4 text-xs text-gray-700">
             <p><strong>Date:</strong> {new Date(feedback.session_date).toLocaleDateString('en-IN')}</p>
             <p><strong>Time:</strong> {feedback.session_time}</p>
             <p><strong>Class:</strong> {feedback.class_batch || '-'}</p>
             <p><strong>Facilitator:</strong> {feedback.facilitator_name || '-'}</p>
             <p><strong>Volunteer:</strong> {feedback.volunteer_name || '-'}</p>
             <p><strong>Coordinator:</strong> {feedback.coordinator_name || '-'}</p>
             <p><strong>Session Type:</strong> {getFormattedSessionType(feedback.session_type)}</p>
             <p><strong>Category:</strong> {feedback.content_category || '-'}</p>
             <p><strong>Module:</strong> {feedback.module_name || '-'}</p>
             <p className="col-span-3"><strong>Topic:</strong> {feedback.topics_covered || '-'}</p>
          </div>
        </div>

        {printMode === 'standard' ? (
          <>
            {/* Feedback Grid - 2 columns for side-by-side printing (Compact) */}
            <div className="grid grid-cols-2 gap-6 text-xs mb-4">
          {/* Facilitator Column */}
          <div className="space-y-3 border-r pr-6 border-gray-200">
            <h3 className="text-sm font-bold text-gray-950 border-b pb-1">Facilitator Feedback</h3>
            {feedback.session_objective && (
              <div>
                <span className="font-bold text-gray-800">Session Objective</span>
                <div 
                  dangerouslySetInnerHTML={{ __html: feedback.session_objective }} 
                  className="prose prose-sm text-gray-700 mt-0.5" 
                  style={{ fontSize: '11px', lineHeight: '1.4' }}
                />
              </div>
            )}
            {feedback.practical_activities && (
              <div>
                <span className="font-bold text-gray-800">Practical Activities</span>
                <div 
                  dangerouslySetInnerHTML={{ __html: feedback.practical_activities }} 
                  className="prose prose-sm text-gray-700 mt-0.5" 
                  style={{ fontSize: '11px', lineHeight: '1.4' }}
                />
              </div>
            )}
            {feedback.session_highlights && (
              <div>
                <span className="font-bold text-gray-800">Session Highlights</span>
                <div 
                  dangerouslySetInnerHTML={{ __html: feedback.session_highlights }} 
                  className="prose prose-sm text-gray-700 mt-0.5" 
                  style={{ fontSize: '11px', lineHeight: '1.4' }}
                />
              </div>
            )}
            {feedback.learning_outcomes && (
              <div>
                <span className="font-bold text-gray-800">Learning Outcomes</span>
                <div 
                  dangerouslySetInnerHTML={{ __html: feedback.learning_outcomes }} 
                  className="prose prose-sm text-gray-700 mt-0.5" 
                  style={{ fontSize: '11px', lineHeight: '1.4' }}
                />
              </div>
            )}
            {feedback.facilitator_reflection && (
              <div>
                <span className="font-bold text-gray-800">Facilitator Reflection</span>
                <div 
                  dangerouslySetInnerHTML={{ __html: feedback.facilitator_reflection }} 
                  className="prose prose-sm text-gray-700 mt-0.5" 
                  style={{ fontSize: '11px', lineHeight: '1.4' }}
                />
              </div>
            )}
            <div className="flex justify-between bg-gray-50 p-2 rounded border border-gray-200 text-[10px]">
               {feedback.mic_sound_rating && <p><strong>Mic/Sound:</strong> {feedback.mic_sound_rating}/10</p>}
               {feedback.seating_view_rating && <p><strong>Seating/View:</strong> {feedback.seating_view_rating}/10</p>}
               {feedback.session_strength && <p><strong>Strength:</strong> {feedback.session_strength}/10</p>}
            </div>
          </div>

          {/* Coordinator Column */}
          <div className="space-y-3">
            <h3 className="text-sm font-bold text-gray-950 border-b pb-1">Coordinator Feedback</h3>
            {feedback.guest_teacher_feedback && (
              <div>
                <span className="font-bold text-gray-800">Guest Teacher Feedback</span>
                <div 
                  dangerouslySetInnerHTML={{ __html: feedback.guest_teacher_feedback }} 
                  className="prose prose-sm text-gray-700 mt-0.5" 
                  style={{ fontSize: '11px', lineHeight: '1.4' }}
                />
              </div>
            )}
            {feedback.incharge_reviewer_feedback && (
              <div>
                <span className="font-bold text-gray-800">Incharge/Reviewer Feedback</span>
                <div 
                  dangerouslySetInnerHTML={{ __html: feedback.incharge_reviewer_feedback }} 
                  className="prose prose-sm text-gray-700 mt-0.5" 
                  style={{ fontSize: '11px', lineHeight: '1.4' }}
                />
              </div>
            )}
            <div className="flex justify-between bg-gray-50 p-2 rounded border border-gray-200 text-[10px]">
               {feedback.coordinator_mic_sound_rating && <p><strong>Mic/Sound:</strong> {feedback.coordinator_mic_sound_rating}/10</p>}
               {feedback.coordinator_seating_view_rating && <p><strong>Seating/View:</strong> {feedback.coordinator_seating_view_rating}/10</p>}
               {feedback.coordinator_session_strength && <p><strong>Strength:</strong> {feedback.coordinator_session_strength}/10</p>}
            </div>
          </div>
        </div>

        <hr className="border-gray-200" />

        {/* Present Students Performance - Compact & Styled */}
        <div className="space-y-2 mt-4 print:break-before-page" style={{ pageBreakBefore: 'always' }}>
          <div className="flex justify-between items-center border-b pb-1">
            <h2 className="text-sm font-bold text-gray-950">Present Students Performance</h2>
            <div className="text-xs font-bold text-gray-700">
              Total Present: {presentStudentsWithPerformance.length}
            </div>
          </div>
          <table className="w-full text-xs border-collapse border border-gray-200">
            <thead>
              <tr className="bg-[#0f172a] text-white">
                <th className="border border-gray-200 text-center px-2 py-1.5 w-12">#</th>
                <th className="border border-gray-200 text-left px-3 py-1.5">Student Name</th>
                <th className="border border-gray-200 text-center px-2 py-1.5 w-24">Rating / 5</th>
                <th className="border border-gray-200 text-left px-3 py-1.5">Comment / Notes</th>
              </tr>
            </thead>
            <tbody>
              {presentStudentsWithPerformance.length > 0 ? (
                presentStudentsWithPerformance.map((student, idx) => (
                  <tr key={student.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                    <td className="border border-gray-200 px-2 py-1 text-center font-medium text-gray-500">{idx + 1}</td>
                    <td className="border border-gray-200 px-3 py-1 font-semibold text-gray-800">{student.studentName}</td>
                    <td className="border border-gray-200 px-2 py-1 text-center">
                      <span className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                        student.rating >= 4 ? 'bg-green-100 text-green-800' :
                        student.rating >= 2.5 ? 'bg-blue-100 text-blue-800' :
                        student.rating > 0 ? 'bg-orange-100 text-orange-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {student.rating} ★
                      </span>
                    </td>
                    <td className="border border-gray-200 px-3 py-1 text-gray-600">{student.comment || '-'}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className="border border-gray-200 px-3 py-4 text-center text-gray-400 italic">
                    No performance records found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        </>
        ) : (
          <div className="space-y-4 text-xs">
            <h3 className="text-sm font-bold text-gray-950 border-b pb-1">Supervisor Hours Tracking</h3>
            {hoursTracker ? (
              <div className="grid grid-cols-2 gap-y-3 gap-x-6 bg-gray-50 p-4 rounded border border-gray-200">
                <p><strong>Plan & Coordinate Hours:</strong> {hoursTracker.plan_coordinate_hours} hrs</p>
                <p><strong>Preparation Hours:</strong> {hoursTracker.preparation_hours} hrs</p>
                <p><strong>Session Hours:</strong> {hoursTracker.session_hours} hrs</p>
                <p><strong>Reflection & Feedback Hours:</strong> {hoursTracker.reflection_feedback_followup_hours} hrs</p>
                <p className="col-span-2 text-blue-800 font-bold text-sm bg-blue-50 p-2 rounded inline-block mt-1">
                  <strong>Total Volunteering Time:</strong> {hoursTracker.total_volunteering_time} hrs
                </p>
                <p className="mt-2"><strong>Logged in Benevity:</strong> {hoursTracker.logged_hours_in_benevity ? '✓ Yes' : 'No'}</p>
                {hoursTracker.supervisor_feedback && (
                  <div className="col-span-2 mt-4 pt-3 border-t border-gray-200">
                    <span className="font-bold text-gray-800">Supervisor Feedback:</span>
                    <p className="whitespace-pre-wrap mt-1 text-gray-700">{hoursTracker.supervisor_feedback}</p>
                  </div>
                )}
                {hoursTracker.notes && (
                  <div className="col-span-2 mt-4 pt-3 border-t border-gray-200">
                    <span className="font-bold text-gray-800">Notes:</span>
                    <p className="whitespace-pre-wrap mt-1 text-gray-700">{hoursTracker.notes}</p>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-gray-500 italic">No hours tracked</p>
            )}
          </div>
        )}
      </div>

      <div className="max-w-6xl mx-auto space-y-6 print:hidden">
        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate('/feedback')}
              className="h-10 w-10"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Feedback Details</h1>
              <p className="text-sm text-muted-foreground">
                {feedback.title} - {new Date(feedback.session_date).toLocaleDateString()}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button 
              variant="outline" 
              onClick={() => navigate(`/sessions/${sessionId}/recording`)}
              className="gap-2"
            >
              <Edit className="h-4 w-4" />
              Edit Feedback
            </Button>
            {userRole === 1 && (
              <Button onClick={async () => {
                const XLSX = await import('xlsx');
                const data = [{
                  Date: new Date(feedback.session_date).toLocaleDateString(),
                  Time: feedback.session_time,
                  Class: feedback.class_batch || '-',
                  Facilitator: feedback.facilitator_name || '-',
                  Volunteer: feedback.volunteer_name || '-',
                  Coordinator: feedback.coordinator_name || '-',
                  'Session Type': getFormattedSessionType(feedback.session_type),
                  Category: feedback.content_category || '-',
                  Module: feedback.module_name || '-',
                  Topic: feedback.topics_covered || '-',
                  'Supervisor Feedback - Status': feedback.supervisor_feedback_status || 'Pending',
                  'Plan & Coordinate Hours': hoursTracker?.plan_coordinate_hours || 0,
                  'Preparation Hours': hoursTracker?.preparation_hours || 0,
                  'Session Hours': hoursTracker?.session_hours || 0,
                  'Reflection & Feedback Hours': hoursTracker?.reflection_feedback_followup_hours || 0,
                  'Total Volunteering Time': hoursTracker?.total_volunteering_time || 0,
                  'Logged in Benevity': hoursTracker?.logged_hours_in_benevity ? 'Yes' : 'No',
                  'Notes': hoursTracker?.notes || '',
                }];
                const ws = XLSX.utils.json_to_sheet(data);
                const wb = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(wb, ws, "Supervisor Report");
                XLSX.writeFile(wb, `Supervisor_Report_${feedback.title}.xlsx`);
              }} className="gap-2 bg-green-600 hover:bg-green-700 text-white">
                <Download className="h-4 w-4" />
                <span className="hidden sm:inline">Download</span> Supervisor Excel
              </Button>
            )}
            <Button onClick={() => handlePrint('standard')} className="gap-2">
              <Download className="h-4 w-4" />
              Download PDF
            </Button>
          </div>
        </div>

        {/* Session Info */}
        <Card className="bg-muted/50">
          <CardContent className="pt-6">
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground block text-xs uppercase tracking-wider">Session ID</span>
                <Badge variant="outline" className="font-mono text-xs bg-primary/10 text-primary border-primary/20 font-bold px-2 py-0.5 mt-0.5">
                  {feedback.session_id_code || formatSingleSessionCode(feedback.session_date, feedback.class_batch, feedback.session_type)}
                </Badge>
              </div>
              <div>
                <span className="text-muted-foreground block text-xs uppercase tracking-wider">Date</span>
                <p className="font-medium mt-0.5">{new Date(feedback.session_date).toLocaleDateString()}</p>
              </div>
              <div>
                <span className="text-muted-foreground block text-xs uppercase tracking-wider">Time</span>
                <p className="font-medium mt-0.5">{feedback.session_time}</p>
              </div>
              <div>
                <span className="text-muted-foreground block text-xs uppercase tracking-wider">Class</span>
                <p className="font-medium mt-0.5">{feedback.class_batch || '-'}</p>
              </div>
              <div>
                <span className="text-muted-foreground block text-xs uppercase tracking-wider">Facilitator</span>
                <p className="font-medium mt-0.5">{feedback.facilitator_name || '-'}</p>
              </div>
              <div>
                <span className="text-muted-foreground block text-xs uppercase tracking-wider">Volunteer</span>
                <p className="font-medium mt-0.5">{feedback.volunteer_name || '-'}</p>
              </div>
              <div>
                <span className="text-muted-foreground block text-xs uppercase tracking-wider">Coordinator</span>
                <p className="font-medium mt-0.5">{feedback.coordinator_name || '-'}</p>
              </div>
              <div>
                <span className="text-muted-foreground block text-xs uppercase tracking-wider">Session Type</span>
                <p className="font-medium mt-0.5">{getFormattedSessionType(feedback.session_type)}</p>
              </div>
              <div>
                <span className="text-muted-foreground block text-xs uppercase tracking-wider">Category</span>
                <p className="font-medium mt-0.5">{feedback.content_category || '-'}</p>
              </div>
              <div>
                <span className="text-muted-foreground block text-xs uppercase tracking-wider">Module</span>
                <p className="font-medium mt-0.5">{feedback.module_name || '-'}</p>
              </div>
              <div className="col-span-2 md:col-span-4 lg:col-span-5">
                <span className="text-muted-foreground block text-xs uppercase tracking-wider">Topic</span>
                <p className="font-medium mt-0.5">{feedback.topics_covered || '-'}</p>
              </div>
              <div>
                <span className="text-muted-foreground block text-xs uppercase tracking-wider">Present Students</span>
                <p className="font-medium mt-0.5">
                  {studentPerformance.filter(sp => sp.attendance_status === 'Present').length}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Filter Tabs */}
        <div className="flex gap-2 flex-wrap border-b border-border pb-4">
          <button
            onClick={() => setActiveTab('facilitator')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'facilitator'
              ? 'bg-blue-100 text-blue-700 border border-blue-300'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
          >
            Facilitator Feedback
          </button>
          <button
            onClick={() => setActiveTab('coordinator')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'coordinator'
              ? 'bg-green-100 text-green-700 border border-green-300'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
          >
            Coordinator Feedback
          </button>
          <button
            onClick={() => setActiveTab('supervisor')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'supervisor'
              ? 'bg-purple-100 text-purple-700 border border-purple-300'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
          >
            Supervisor Feedback (Admin Only)
          </button>
        </div>

        {/* Facilitator Feedback Tab - Table Format */}
        {activeTab === 'facilitator' && (
          <Card>
            <CardHeader>
              <CardTitle>Facilitator Feedback</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[200px]">Field</TableHead>
                      <TableHead>Value</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {feedback.session_objective && (
                      <TableRow>
                        <TableCell className="font-semibold">Session Objective</TableCell>
                        <TableCell>
                          <div dangerouslySetInnerHTML={{ __html: feedback.session_objective }} className="prose prose-sm max-w-none text-foreground/90 leading-relaxed" />
                        </TableCell>
                      </TableRow>
                    )}
                    {feedback.practical_activities && (
                      <TableRow>
                        <TableCell className="font-semibold">Practical Activities</TableCell>
                        <TableCell>
                          <div dangerouslySetInnerHTML={{ __html: feedback.practical_activities }} className="prose prose-sm max-w-none text-foreground/90 leading-relaxed" />
                        </TableCell>
                      </TableRow>
                    )}
                    {feedback.session_highlights && (
                      <TableRow>
                        <TableCell className="font-semibold">Session Highlights</TableCell>
                        <TableCell>
                          <div dangerouslySetInnerHTML={{ __html: feedback.session_highlights }} className="prose prose-sm max-w-none text-foreground/90 leading-relaxed" />
                        </TableCell>
                      </TableRow>
                    )}
                    {feedback.learning_outcomes && (
                      <TableRow>
                        <TableCell className="font-semibold">Learning Outcomes</TableCell>
                        <TableCell>
                          <div dangerouslySetInnerHTML={{ __html: feedback.learning_outcomes }} className="prose prose-sm max-w-none text-foreground/90 leading-relaxed" />
                        </TableCell>
                      </TableRow>
                    )}
                    {feedback.facilitator_reflection && (
                      <TableRow>
                        <TableCell className="font-semibold">Facilitator Reflection</TableCell>
                        <TableCell>
                          <div dangerouslySetInnerHTML={{ __html: feedback.facilitator_reflection }} className="prose prose-sm max-w-none text-foreground/90 leading-relaxed" />
                        </TableCell>
                      </TableRow>
                    )}
                    {feedback.best_performer && (
                      <TableRow>
                        <TableCell className="font-semibold">Best Performer</TableCell>
                        <TableCell className="whitespace-pre-wrap">{feedback.best_performer}</TableCell>
                      </TableRow>
                    )}
                    {feedback.mic_sound_rating && (
                      <TableRow>
                        <TableCell className="font-semibold">Mic/Sound Rating</TableCell>
                        <TableCell className="font-medium">{feedback.mic_sound_rating}/10</TableCell>
                      </TableRow>
                    )}
                    {feedback.seating_view_rating && (
                      <TableRow>
                        <TableCell className="font-semibold">Seating/View Rating</TableCell>
                        <TableCell className="font-medium">{feedback.seating_view_rating}/10</TableCell>
                      </TableRow>
                    )}
                    {feedback.session_strength && (
                      <TableRow>
                        <TableCell className="font-semibold">Session Strength</TableCell>
                        <TableCell className="font-medium">{feedback.session_strength}/10</TableCell>
                      </TableRow>
                    )}
                    {!feedback.session_objective && !feedback.practical_activities && !feedback.session_highlights && !feedback.learning_outcomes && !feedback.facilitator_reflection && !feedback.best_performer && !feedback.mic_sound_rating && !feedback.seating_view_rating && !feedback.session_strength && (
                      <TableRow>
                        <TableCell colSpan={2} className="text-center text-muted-foreground italic py-8">
                          No facilitator feedback provided
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>

              {studentPerformance.length > 0 || allStudents.length > 0 ? (
                <div className="mt-6 w-full space-y-3">
                  <h3 className="font-semibold text-base mb-4">Student Performance Records</h3>
                  {allStudents.length > 0 ? (
                    // Show all students from class with their performance data
                    allStudents.map((student, index) => {
                      const perfData = studentPerformance.find(sp => (sp.student_name || '').trim() === student.name.trim());
                      const isAbsent = perfData?.attendance_status === 'Absent';
                      const hasData = !!perfData;
                      
                      return (
                        <div key={student.id} className={`p-3 border-l-4 rounded ${!hasData ? 'bg-gray-50 border-l-gray-300' : 'bg-white border-l-blue-500'}`}>
                          <div className="flex flex-col gap-2">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <p className="text-xs text-gray-500 mb-0.5">Student #{index + 1}</p>
                                <p className="font-bold text-lg text-gray-900 break-words overflow-visible whitespace-normal">{student.name}</p>
                                {student.student_id && <p className="text-xs text-gray-600 mt-1">ID: {student.student_id}</p>}
                              </div>
                              {hasData && (
                                <Badge className={isAbsent ? 'bg-red-500' : 'bg-green-500'}>
                                  {isAbsent ? 'Absent' : 'Present'}
                                </Badge>
                              )}
                            </div>
                            
                            {hasData && (
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 mt-2 border-t border-gray-200">
                                <div>
                                  <p className="text-xs text-gray-600">Questions</p>
                                  <p className="font-semibold">{perfData.questions_asked}</p>
                                </div>
                                <div>
                                  <p className="text-xs text-gray-600">Response</p>
                                  <p className="font-semibold">{perfData.performance_rating}/10</p>
                                </div>
                                <div>
                                  <p className="text-xs text-gray-600">Bad Behaviour</p>
                                  <p className="font-semibold">{perfData.bad_behaviour_points ?? 0}/10</p>
                                </div>
                                <div>
                                  <p className="text-xs text-gray-600">Total</p>
                                  <p className="font-bold text-blue-600">{Math.max(0, ((perfData.questions_asked ?? 0) + (perfData.performance_rating ?? 0) - (perfData.bad_behaviour_points ?? 0)) / 2)}/10</p>
                                </div>
                              </div>
                            )}
                            
                            {perfData?.performance_comment && (
                              <div className="pt-2 mt-2 border-t border-gray-200">
                                <p className="text-xs text-gray-600 mb-1">Comment:</p>
                                <p className="text-sm text-gray-700 break-words">{perfData.performance_comment}</p>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    // Fallback: show only students with performance data
                    studentPerformance.map((student, index) => {
                      const isAbsent = student.attendance_status === 'Absent';
                      return (
                        <div key={student.id} className="p-3 border-l-4 border-l-blue-500 bg-white rounded">
                          <div className="flex flex-col gap-2">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <p className="text-xs text-gray-500 mb-0.5">Student #{index + 1}</p>
                                <p className="font-bold text-lg text-gray-900 break-words overflow-visible whitespace-normal">{student.student_name}</p>
                              </div>
                              <Badge className={isAbsent ? 'bg-red-500' : 'bg-green-500'}>
                                {isAbsent ? 'Absent' : 'Present'}
                              </Badge>
                            </div>
                            
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 mt-2 border-t border-gray-200">
                              <div>
                                <p className="text-xs text-gray-600">Questions</p>
                                <p className="font-semibold">{student.questions_asked}</p>
                              </div>
                              <div>
                                <p className="text-xs text-gray-600">Response</p>
                                <p className="font-semibold">{student.performance_rating}/10</p>
                              </div>
                              <div>
                                <p className="text-xs text-gray-600">Bad Behaviour</p>
                                <p className="font-semibold">{(student.bad_behaviour_points ?? 0)}/10</p>
                              </div>
                              <div>
                                <p className="text-xs text-gray-600">Total</p>
                                <p className="font-bold text-blue-600">{Math.max(0, ((student.questions_asked ?? 0) + (student.performance_rating ?? 0) - (student.bad_behaviour_points ?? 0)) / 2)}/10</p>
                              </div>
                            </div>
                            
                            {student.performance_comment && (
                              <div className="pt-2 mt-2 border-t border-gray-200">
                                <p className="text-xs text-gray-600 mb-1">Comment:</p>
                                <p className="text-sm text-gray-700 break-words">{student.performance_comment}</p>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                  
                  {/* Student Count Summary */}
                  <div className="mt-4 pt-4 border-t border-border flex flex-col sm:flex-row sm:justify-between gap-2">
                    <p className="text-sm font-semibold text-muted-foreground">
                      Total Students in Class: <span className="text-foreground">{allStudents.length > 0 ? allStudents.length : studentPerformance.length}</span>
                    </p>
                    {allStudents.length > 0 && studentPerformance.length > 0 && (
                      <p className="text-sm text-muted-foreground">
                        Feedback Recorded: <span className="text-foreground font-medium">{studentPerformance.length}</span>
                      </p>
                    )}
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>
        )}

        {/* Coordinator Feedback Tab - Table Format */}
        {activeTab === 'coordinator' && (
          <Card>
            <CardHeader>
              <CardTitle>Coordinator Feedback</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[200px]">Field</TableHead>
                      <TableHead>Value</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {feedback.guest_teacher_feedback && (
                      <TableRow>
                        <TableCell className="font-semibold">Guest Teacher Feedback</TableCell>
                        <TableCell>
                          <div dangerouslySetInnerHTML={{ __html: feedback.guest_teacher_feedback }} className="prose prose-sm max-w-none text-foreground/90 leading-relaxed" />
                        </TableCell>
                      </TableRow>
                    )}
                    {feedback.incharge_reviewer_feedback && (
                      <TableRow>
                        <TableCell className="font-semibold">Incharge/Reviewer Feedback</TableCell>
                        <TableCell>
                          <div dangerouslySetInnerHTML={{ __html: feedback.incharge_reviewer_feedback }} className="prose prose-sm max-w-none text-foreground/90 leading-relaxed" />
                        </TableCell>
                      </TableRow>
                    )}
                    {feedback.recording_url && (
                      <TableRow>
                        <TableCell className="font-semibold">Recording Link</TableCell>
                        <TableCell>
                          <a href={feedback.recording_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline inline-flex items-center gap-1">
                            View Recording
                          </a>
                        </TableCell>
                      </TableRow>
                    )}
                    {feedback.record_sheet_link && (
                      <TableRow>
                        <TableCell className="font-semibold">Record Sheet Link</TableCell>
                        <TableCell>
                          <a href={feedback.record_sheet_link} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline inline-flex items-center gap-1">
                            View Record Sheet
                          </a>
                        </TableCell>
                      </TableRow>
                    )}
                    {feedback.coordinator_mic_sound_rating && (
                      <TableRow>
                        <TableCell className="font-semibold">Coordinator Mic/Sound Rating</TableCell>
                        <TableCell className="font-medium">{feedback.coordinator_mic_sound_rating}/10</TableCell>
                      </TableRow>
                    )}
                    {feedback.coordinator_seating_view_rating && (
                      <TableRow>
                        <TableCell className="font-semibold">Coordinator Seating/View Rating</TableCell>
                        <TableCell className="font-medium">{feedback.coordinator_seating_view_rating}/10</TableCell>
                      </TableRow>
                    )}
                    {feedback.coordinator_session_strength && (
                      <TableRow>
                        <TableCell className="font-semibold">Coordinator Session Strength</TableCell>
                        <TableCell className="font-medium">{feedback.coordinator_session_strength}/10</TableCell>
                      </TableRow>
                    )}
                    {!feedback.guest_teacher_feedback && !feedback.incharge_reviewer_feedback && !feedback.coordinator_mic_sound_rating && !feedback.coordinator_seating_view_rating && !feedback.coordinator_session_strength && !feedback.recording_url && !feedback.record_sheet_link && (
                      <TableRow>
                        <TableCell colSpan={2} className="text-center text-muted-foreground italic py-8">
                          No coordinator feedback provided
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Supervisor Feedback Tab - Table Format - Admin Only */}
        {activeTab === 'supervisor' && userRole === 1 && (
          <Card>
            <CardHeader>
              <CardTitle>Supervisor Hours Tracking</CardTitle>
            </CardHeader>
            <CardContent>
              {hoursTracker ? (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[200px]">Field</TableHead>
                        <TableHead>Value</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <TableRow>
                        <TableCell className="font-semibold">Plan & Coordinate Hours</TableCell>
                        <TableCell className="font-medium">{hoursTracker.plan_coordinate_hours} hrs</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-semibold">Preparation Hours</TableCell>
                        <TableCell className="font-medium">{hoursTracker.preparation_hours} hrs</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-semibold">Session Hours</TableCell>
                        <TableCell className="font-medium">{hoursTracker.session_hours} hrs</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-semibold">Reflection & Feedback Hours</TableCell>
                        <TableCell className="font-medium">{hoursTracker.reflection_feedback_followup_hours} hrs</TableCell>
                      </TableRow>
                      <TableRow className="bg-blue-50">
                        <TableCell className="font-semibold">Total Volunteering Time</TableCell>
                        <TableCell className="font-bold text-lg text-blue-700">{hoursTracker.total_volunteering_time} hrs</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-semibold">Logged in Benevity</TableCell>
                        <TableCell>
                          <Badge variant={hoursTracker.logged_hours_in_benevity ? 'default' : 'secondary'}>
                            {hoursTracker.logged_hours_in_benevity ? '✓ Yes' : 'No'}
                          </Badge>
                        </TableCell>
                      </TableRow>
                      {hoursTracker.supervisor_feedback && (
                        <TableRow>
                          <TableCell className="font-semibold">Supervisor Feedback</TableCell>
                          <TableCell className="whitespace-pre-wrap">{hoursTracker.supervisor_feedback}</TableCell>
                        </TableRow>
                      )}
                      {hoursTracker.notes && (
                        <TableRow>
                          <TableCell className="font-semibold">Notes</TableCell>
                          <TableCell className="whitespace-pre-wrap">{hoursTracker.notes}</TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="text-center text-muted-foreground italic py-8">
                  No hours tracked
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Back Button */}
        <div className="flex justify-start">
          <Button
            variant="outline"
            onClick={() => navigate('/feedback')}
            className="gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
        </div>
      </div>
    </DashboardLayout>
  );
}