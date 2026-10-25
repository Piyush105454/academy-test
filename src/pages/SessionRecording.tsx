import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { ArrowLeft, Save, ChevronRight, ChevronLeft, Plus, Trash2, Shield, ExternalLink, Mic, MicOff, CheckCircle, Info, Calendar, Search, Edit, Check, ChevronsUpDown, X, ArrowUpDown, UploadCloud, Loader2, Eye, Lock } from 'lucide-react';
import { parseSubmissionRequirements, serializeSubmissionRequirements, type SubmissionRequirement } from "../utils/submissionUtils";
import { useNavigate, useParams } from 'react-router-dom';
import { logActivity } from '@/utils/activityLogger';
import { cn } from '@/lib/utils';
import { GoogleDriveResumableUploader } from '@/utils/GoogleDriveResumableUploader';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { RichTextEditor } from '@/components/ui/rich-text-editor';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useAuth } from '@/contexts/AuthContext';
import { useAcademicYear } from '@/contexts/AcademicYearContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { filterActiveStudents, isPlaceholderEmail } from '@/utils/studentActiveHelper';
import { Badge } from '@/components/ui/badge';
import { formatSingleSessionCode } from '@/utils/sessionIdGenerator';
import { getDirectImageUrl, handleImageError } from '@/utils/imageUtils';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface SessionRecording {
  id: string;
  session_id_code?: string;
  title: string;
  session_date: string;
  session_time: string;
  facilitator_name: string;
  volunteer_name: string;
  coordinator_name?: string;
  preferred_class?: string;
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
  designations?: string[];
  feedback_unlocked?: boolean;
}

interface StudentPerformance {
  id?: string;
  student_name: string;
  attendance_status?: 'Present' | 'Absent';
  questions_asked: number;
  performance_rating: number;
  performance_comment: string | null;
  bad_behaviour_points?: number;
}

interface SessionHoursTracker {
  id?: string;
  session_id: string;
  volunteer_id?: string;
  plan_coordinate_hours: number;
  preparation_hours: number;
  session_hours: number;
  reflection_feedback_followup_hours: number;
  total_volunteering_time?: number;
  logged_hours_in_benevity: boolean;
  notes: string;
  supervisor_feedback?: string;
}

const isRichTextEmpty = (html: string | null | undefined) => {
  if (!html) return true;
  const stripped = html.replace(/<[^>]*>/g, '').trim();
  return stripped.length === 0;
};

const parseSubmissionLinks = (rawLink: string | null | undefined): { label: string; url: string }[] => {
  if (!rawLink || !rawLink.trim()) return [];
  const trimmed = rawLink.trim();

  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (typeof parsed === 'object' && parsed !== null) {
        return Object.entries(parsed).map(([key, val], idx) => {
          let url = String(val || '').trim();
          if (url.startsWith('https//')) url = 'https://' + url.substring(7);
          else if (url.startsWith('http//')) url = 'http://' + url.substring(6);
          else if (!url.startsWith('http')) url = 'https://' + url;
          return {
            label: `View Submission ${Object.keys(parsed).length > 1 ? idx + 1 : ''}`.trim(),
            url,
          };
        }).filter(item => item.url && item.url !== 'https://');
      }
    } catch (e) {
      const urlRegex = /(https?:\/\/[^\s",}]+|https?\/\/[^\s",}]+)/g;
      const matches = trimmed.match(urlRegex);
      if (matches && matches.length > 0) {
        return matches.map((m, idx) => {
          let url = m;
          if (url.startsWith('https//')) url = 'https://' + url.substring(7);
          else if (url.startsWith('http//')) url = 'http://' + url.substring(6);
          return {
            label: `View Submission ${matches.length > 1 ? idx + 1 : ''}`.trim(),
            url,
          };
        });
      }
    }
  }

  return trimmed.split(',').filter(Boolean).map((link, idx) => {
    let url = link.trim();
    if (url.startsWith('https//')) url = 'https://' + url.substring(7);
    else if (url.startsWith('http//')) url = 'http://' + url.substring(6);
    else if (!url.startsWith('http')) url = 'https://' + url;
    return {
      label: `View Submission ${trimmed.split(',').length > 1 ? idx + 1 : ''}`.trim(),
      url,
    };
  });
};

export default function SessionRecording() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { sessionId } = useParams();
  const { selectedYear } = useAcademicYear();
  const [userRole, setUserRole] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
    const [uploadingPictures, setUploadingPictures] = useState(false);
  const [previewPictureUrl, setPreviewPictureUrl] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);
  const [savingStudents, setSavingStudents] = useState(false);
  const [session, setSession] = useState<SessionRecording | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [currentSubTab, setCurrentSubTab] = useState('a');
  const [hoursSubTab, setHoursSubTab] = useState('a');
  const [studentPerformance, setStudentPerformance] = useState<StudentPerformance[]>([]);
  const [studentFormData, setStudentFormData] = useState<{ [key: string]: StudentPerformance }>({});
  const [performerSearchQuery, setPerformerSearchQuery] = useState('');
  const [formData, setFormData] = useState({
    session_objective: '',
    practical_activities: '',
    session_highlights: '',
    learning_outcomes: '',
    facilitator_reflection: '',
    best_performer: '',
    guest_teacher_feedback: '',
    incharge_reviewer_feedback: '',
    recording_url: '',
    mic_sound_rating: 5,
    seating_view_rating: 5,
    session_strength: 5,
    coordinator_mic_sound_rating: 5,
    coordinator_seating_view_rating: 5,
    coordinator_session_strength: 5,
    class_batch: '',
  });
  const [hoursData, setHoursData] = useState<SessionHoursTracker>({
    session_id: sessionId || '',
    plan_coordinate_hours: 0,
    preparation_hours: 0,
    session_hours: 0,
    reflection_feedback_followup_hours: 0,
    logged_hours_in_benevity: false,
    notes: '',
    supervisor_feedback: '',
  });
  const [supervisorFeedback, setSupervisorFeedback] = useState<string>('');
  const [hoursValidationId, setHoursValidationId] = useState<string>('');
  const [homeworkRecords, setHomeworkRecords] = useState<any[]>([]);
  const [homeworkLoading, setHomeworkLoading] = useState(false);
  const [savingHomework, setSavingHomework] = useState(false);
  const [students, setStudents] = useState<any[]>([]);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [studentSearch, setStudentSearch] = useState('');
  const [studentStatusFilter, setStudentStatusFilter] = useState<'all' | 'Present' | 'Absent'>('all');
  const [studentDesignationFilter, setStudentDesignationFilter] = useState<string>('all');
  const [studentSortField, setStudentSortField] = useState<'name' | 'rating' | 'questions'>('name');
  const [studentSortDirection, setStudentSortDirection] = useState<'asc' | 'desc'>('asc');
  const [newHomework, setNewHomework] = useState({
    student_id: '',
    task_name: '',
    task_type: '',
    custom_task_type: '',
    deadline: '',
    task_description: '',
    submission_link: '',
    feedback_notes: '',
    earning_amount: '5',
    submission_requirements: [] as SubmissionRequirement[],
  });

  const [isListening, setIsListening] = useState(false);
  const [isEditingHomework, setIsEditingHomework] = useState(false);
  const [selectedHomeworkTaskId, setSelectedHomeworkTaskId] = useState<string>('all');

  // Draft Auto-Save & Browser Cache State
  const [draftSaving, setDraftSaving] = useState(false);
  const [lastDraftSavedAt, setLastDraftSavedAt] = useState<Date | null>(null);
  const isInitialFormMount = useRef(true);
  const lastSavedDraftRef = useRef<string>('');
  const [activeTaskDetailId, setActiveTaskDetailId] = useState<string>('');
  const [homeworkSearch, setHomeworkSearch] = useState<string>('');
  const [homeworkStatusFilter, setHomeworkStatusFilter] = useState<string>('all');
  const [homeworkViewMode, setHomeworkViewMode] = useState<'by_task' | 'by_student'>('by_task');
  const [editingTaskId, setEditingTaskId] = useState<string>('');
  const [isBestPerformerManual, setIsBestPerformerManual] = useState(false);
  const [rewardConfigs, setRewardConfigs] = useState<{ task_type: string, rate_per_task: number }[]>([]);

  const isHomeworkSaved = (() => {
    if (homeworkRecords.length === 0 || homeworkRecords[0].status !== 'draft') {
      return false;
    }
    const draft = homeworkRecords[0];
    
    const taskNameMatch = (newHomework.task_name || '').trim().toLowerCase() === (draft.task_name || '').trim().toLowerCase();
    
    const resolvedNewType = newHomework.task_type === 'Other' ? (newHomework.custom_task_type || '').trim() : (newHomework.task_type || '').trim();
    const resolvedDraftType = (draft.feedback_type || '').trim();
    const taskTypeMatch = resolvedNewType.toLowerCase() === resolvedDraftType.toLowerCase();
    
    const newDesc = (newHomework.task_description || '').trim();
    const draftDesc = (draft.task_description || '').trim();
    const descMatch = newDesc === draftDesc;
    
    // Normalize deadline formats
    let deadlineMatch = false;
    if (!newHomework.deadline && !draft.deadline) {
      deadlineMatch = true;
    } else if (newHomework.deadline && draft.deadline) {
      try {
        const newTime = new Date(newHomework.deadline).getTime();
        const draftTime = new Date(draft.deadline).getTime();
        deadlineMatch = Math.abs(newTime - draftTime) < 60000;
      } catch (e) {
        deadlineMatch = false;
      }
    }
    
    const earningMatch = Number(newHomework.earning_amount || 0) === Number(draft.earning_amount || 0);
    
    const draftTypes = serializeSubmissionRequirements(parseSubmissionRequirements(draft.submission_types));
    const newTypes = serializeSubmissionRequirements(newHomework.submission_requirements);
    const typesMatch = draftTypes.join(',') === newTypes.join(',');

    return taskNameMatch && taskTypeMatch && descMatch && deadlineMatch && earningMatch && typesMatch;
  })();

  useEffect(() => {
    if (session && rewardConfigs.length > 0 && !newHomework.task_type) {
      const typeStr = session.session_type?.toLowerCase() || '';
      let matchedType = '';
      if (typeStr === 'guest_teacher') matchedType = rewardConfigs.find(c => c.task_type.toLowerCase().includes('guest teacher'))?.task_type || '';
      else if (typeStr === 'local_teacher') matchedType = rewardConfigs.find(c => c.task_type.toLowerCase().includes('local teacher'))?.task_type || '';
      else if (typeStr === 'guest_speaker') matchedType = rewardConfigs.find(c => c.task_type.toLowerCase().includes('guest speaker'))?.task_type || '';
      
      if (!matchedType) {
        matchedType = rewardConfigs.find(c => c.task_type.toLowerCase() === 'other' || c.task_type.toLowerCase().includes('other'))?.task_type || '';
      }
      
      if (matchedType) {
        const config = rewardConfigs.find(c => c.task_type === matchedType);
        setNewHomework(prev => ({ 
          ...prev, 
          task_type: matchedType,
          earning_amount: config?.rate_per_task?.toString() || '5'
        }));
      }
    }
  }, [session, rewardConfigs, newHomework.task_type]);

  const toggleVoiceTyping = () => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      toast.error('Voice typing is not supported in this browser.');
      return;
    }

    if (isListening) {
      setIsListening(false);
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognition();

    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
      setIsListening(true);
      toast.info('Listening... Speak now.');
    };

    recognition.onerror = (event: any) => {
      console.error('Speech recognition error', event.error);
      setIsListening(false);
      toast.error('Voice typing failed: ' + event.error);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setNewHomework(prev => ({
        ...prev,
        task_description: (prev.task_description ? prev.task_description + ' ' : '') + transcript
      }));
      toast.success('Text added!');
    };

    recognition.start();
  };

  const handleNextPage = () => {
    if (currentPage === 1) {
      if (currentSubTab === 'a') setCurrentSubTab('b');
      else if (currentSubTab === 'b') setCurrentSubTab('c');
      else if (currentSubTab === 'c') setCurrentPage(3);
    } else if (currentPage === 3) {
      setCurrentPage(2);
    }
  };

  const handlePreviousPage = () => {
    if (currentPage === 2) {
      setCurrentPage(3);
    } else if (currentPage === 3) {
      setCurrentPage(1);
      setCurrentSubTab('c');
    } else if (currentPage === 1) {
      if (currentSubTab === 'c') setCurrentSubTab('b');
      else if (currentSubTab === 'b') setCurrentSubTab('a');
    }
  };

  useEffect(() => {
    if (user?.id) {
      loadUserRole();
    }
  }, [user?.id]);

  useEffect(() => {
    if (students.length === 0) return;

    // Calculate top 3 present students with highest score: (Questions + Response - Bad Behaviour) / 2
    const resolved = students.map(student => {
      const formDataForStudent = studentFormData[student.id];
      const dbDataForStudent = studentPerformance.find(sp => (sp.student_name || '').trim() === student.name.trim());
      const perfData = formDataForStudent || dbDataForStudent || {
        student_name: student.name,
        attendance_status: 'Present',
        questions_asked: 0,
        performance_rating: 0,
        performance_comment: '',
        bad_behaviour_points: 0,
      };
      
      const rating = Number(perfData.performance_rating) || 0;
      const badBehaviour = Number(perfData.bad_behaviour_points) || 0;
      const questions = Number(perfData.questions_asked) || 0;
      const score = Math.max(0, (questions + rating - badBehaviour) / 2);

      return {
        name: student.name,
        isPresent: perfData.attendance_status !== 'Absent',
        score,
        questions,
      };
    });

    // Filter present students with a positive rating/score
    const eligible = resolved.filter(s => s.isPresent && s.score > 0);

    // Sort descending by score, then by questions asked
    eligible.sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      return b.questions - a.questions;
    });

    // Get top 3 names
    const top3Names = eligible.slice(0, 3).map(s => s.name).join(', ');

    // Only update if changed to avoid infinite rendering loop
    if (formData.best_performer !== top3Names) {
      setFormData(prev => ({ ...prev, best_performer: top3Names }));
    }
  }, [studentFormData, studentPerformance, students, formData.best_performer]);

  const isFeedbackLocked = (() => {
    if (!session || userRole === 1 || session.feedback_unlocked) return false;
    if (!session.session_date) return false;
    
    const msPerDay = 1000 * 60 * 60 * 24;
    const sessionTime = new Date(session.session_date).getTime();
    const diffDays = Math.floor((Date.now() - sessionTime) / msPerDay);

    if ((userRole === 4 || userRole === 3) && diffDays > 3) return true;
    if (userRole === 2 && diffDays > 7) return true;
    
    return false;
  })();

  const canEditFacilitatorSection = userRole === 1 || userRole === 4;
  const canEditCoordinatorSection = userRole === 1 || userRole === 3;
  const canEditSupervisorSection = userRole === 1 || userRole === 2;
  const userRoleName = userRole === 1 ? 'Administrator' : userRole === 3 ? 'Coordinator' : userRole === 4 ? 'Facilitator' : userRole === 2 ? 'Supervisor' : 'User';

  const loadUserRole = async () => {
    try {
      if (!user) return;
      const userEmail = user.email || '';
      let roleId: number | null = null;

      if (user.id) {
        const { data } = await supabase
          .from('user_profiles')
          .select('role_id')
          .eq('id', user.id)
          .maybeSingle();

        if (data?.role_id) {
          roleId = data.role_id;
        }
      }

      if (!roleId && userEmail) {
        const { data: emailProfile } = await supabase
          .from('user_profiles')
          .select('role_id')
          .ilike('email', userEmail)
          .maybeSingle();

        if (emailProfile?.role_id) {
          roleId = emailProfile.role_id;
        }
      }

      // Check if user is in coordinators table
      if (userEmail) {
        const { data: coordData } = await supabase
          .from('coordinators')
          .select('id, name')
          .ilike('email', userEmail)
          .maybeSingle();

        if (coordData) {
          roleId = 3; // Enforce Coordinator Role
        }
      }

      if (roleId) {
        setUserRole(roleId);
        // Automatically land on the appropriate tab for their role
        if (roleId === 3) {
          setCurrentPage(3); // 2. Feedback & Closure by Coordinator
        } else if (roleId === 2) {
          setCurrentPage(2); // 3. Session Hours Tracker by Supervisor
        } else {
          setCurrentPage(1); // 1. Session Details & Performance by Facilitator
        }
      }
    } catch (error) {
      console.error('Error loading user role:', error);
    }
  };

  useEffect(() => {
    if (sessionId) {
      fetchSession();
      fetchStudentPerformance();
      fetchHoursTracker();
      fetchHomeworkRecords();
      fetchStudents();
    }
  }, [sessionId, selectedYear]);

  const fetchRewardConfigs = async (classId?: string) => {
    try {
      let query = supabase.from('reward_configurations').select('task_type, rate_per_task');
      if (classId) {
        query = query.eq('class_id', classId);
      } else {
        query = query.is('class_id', null);
      }
      
      const { data, error } = await query.order('task_type');
      if (!error && data) {
        if (classId && data.length === 0) {
          // Fallback to global defaults if no specific class configs found
          const { data: fallbackData } = await supabase
            .from('reward_configurations')
            .select('task_type, rate_per_task')
            .is('class_id', null)
            .order('task_type');
          if (fallbackData) setRewardConfigs(fallbackData);
        } else {
          setRewardConfigs(data);
        }
      }
    } catch (e) {
      console.error('Error fetching reward configs:', e);
    }
  };

  const fetchSession = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const { data, error } = await supabase
        .from('sessions')
        .select(`
          *,
          coordinators:coordinator_id(name)
        `)
        .eq('id', sessionId)
        .single();

      if (error) throw error;

      const sessionData = data as any;

      // Fetch volunteer's preferred class separately
      let preferredClass = null;
      if (sessionData.volunteer_name) {
        const { data: volunteerDataList } = await supabase
          .from('volunteers')
          .select('preferred_class')
          .eq('name', sessionData.volunteer_name)
          .limit(1);

        const volunteerData = volunteerDataList?.[0];
        preferredClass = volunteerData?.preferred_class || null;
      }

      setSession({
        ...sessionData,
        coordinator_name: sessionData.coordinators?.name || null,
        preferred_class: preferredClass,
      } as SessionRecording);

      // Pre-select designation filter if session was scheduled with specific designations
      if (Array.isArray(sessionData.designations) && sessionData.designations.length > 0) {
        if (sessionData.designations.length === 1) {
          setStudentDesignationFilter(sessionData.designations[0]);
        } else {
          setStudentDesignationFilter('scheduled');
        }
      }
      const bestPerformerVal = (sessionData as any).best_performer || '';
      
      let loadedData: any = {
        session_objective: (sessionData as any).session_objective ?? '',
        practical_activities: (sessionData as any).practical_activities ?? '',
        session_highlights: (sessionData as any).session_highlights ?? '',
        learning_outcomes: (sessionData as any).learning_outcomes ?? '',
        facilitator_reflection: (sessionData as any).facilitator_reflection ?? '',
        best_performer: bestPerformerVal || '',
        guest_teacher_feedback: (sessionData as any).guest_teacher_feedback ?? '',
        incharge_reviewer_feedback: (sessionData as any).incharge_reviewer_feedback ?? '',
        recording_url: (sessionData as any).recording_url ?? '',
        record_sheet_link: (sessionData as any).record_sheet_link ?? '',
        session_pictures: (sessionData as any).session_pictures || [],
        mic_sound_rating: (sessionData as any).mic_sound_rating ?? 5,
        seating_view_rating: (sessionData as any).seating_view_rating ?? 5,
        session_strength: (sessionData as any).session_strength ?? 5,
        coordinator_mic_sound_rating: (sessionData as any).coordinator_mic_sound_rating ?? 5,
        coordinator_seating_view_rating: (sessionData as any).coordinator_seating_view_rating ?? 5,
        coordinator_session_strength: (sessionData as any).coordinator_session_strength ?? 5,
        class_batch: (sessionData as any).class_batch ?? '',
      };

      // Check for cached draft in browser storage
      const draftKey = `session_recording_draft_${sessionId}`;
      const cachedDraftStr = localStorage.getItem(draftKey);
      if (cachedDraftStr) {
        try {
          const parsedDraft = JSON.parse(cachedDraftStr);
          const draftData = parsedDraft.data || parsedDraft;
          if (draftData && typeof draftData === 'object') {
            const hasNewDraftContent = Object.keys(draftData).some(k => {
              const dVal = (draftData as any)[k];
              const sVal = (loadedData as any)[k];
              if (Array.isArray(dVal)) {
                return dVal.length > (Array.isArray(sVal) ? sVal.length : 0);
              }
              return (dVal || '').toString().trim() !== '' && (dVal || '').toString().trim() !== (sVal || '').toString().trim();
            });

            if (hasNewDraftContent) {
              loadedData = {
                ...loadedData,
                ...draftData
              };
              if (parsedDraft.savedAt) {
                setLastDraftSavedAt(new Date(parsedDraft.savedAt));
              }
              toast.info('Restored your unsaved draft from browser cache', { duration: 4000 });
            }
          }
        } catch (e) {
          console.warn('Could not parse cached draft', e);
        }
      }

      setFormData(prev => ({
        ...prev,
        ...loadedData
      } as any));

      lastSavedDraftRef.current = JSON.stringify(loadedData);
      setTimeout(() => {
        isInitialFormMount.current = false;
      }, 500);

      if (loadedData.best_performer) {
        setIsBestPerformerManual(true);
      } else {
        setIsBestPerformerManual(false);
      }
    } catch (error) {
      console.error('Error fetching session:', error);
      toast.error('Failed to load session');
      navigate('/sessions');
    } finally {
      if (!silent) setLoading(false);
    }
  };

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
        performance_rating: item.performance_rating ?? 0,
        questions_asked: item.questions_asked ?? 0,
        bad_behaviour_points: item.bad_behaviour_points ?? 0,
      }));

      setStudentPerformance(cleaned as unknown as StudentPerformance[]);
    } catch (error) {
      console.error('Error fetching student performance:', error);
    }
  };

  const fetchHoursTracker = async () => {
    try {
      const { data, error } = await supabase
        .from('session_hours_tracker' as any)
        .select('*')
        .eq('session_id', sessionId)
        .limit(1);

      if (error && error.code !== 'PGRST116') {
        // PGRST116 is "no rows found" which is expected if no hours tracker exists
        throw error;
      }
      if (data && data.length > 0) {
        const record = data[0] as any;
        let sFeedback = record.supervisor_feedback || '';
        let cleanNotes = record.notes || '';

        if (!sFeedback && cleanNotes.includes('SUPERVISOR_FEEDBACK:')) {
          const parts = cleanNotes.split('SUPERVISOR_FEEDBACK:');
          const fbPart = parts[1]?.split('\n---NOTES---\n')[0] || parts[1];
          sFeedback = fbPart?.trim() || '';
          const noteParts = parts[1]?.split('\n---NOTES---\n');
          cleanNotes = noteParts && noteParts.length > 1 ? noteParts[1].trim() : (parts[0] || '').trim();
        }

        setHoursData({
          ...record,
          notes: cleanNotes,
          supervisor_feedback: sFeedback,
        } as unknown as SessionHoursTracker);
        setSupervisorFeedback(sFeedback);
        setHoursValidationId(record.validation_id || '');
      }
    } catch (error) {
      console.error('Error fetching hours tracker:', error);
    }
  };

  const fetchHomeworkRecords = async () => {
    try {
      setHomeworkLoading(true);
      const { data, error } = await supabase
        .from('student_task_feedback')
        .select(`
          id,
          student_id,
          feedback_type,
          task_name,
          task_id,
          task_description,
          deadline,
          submission_link,
          status,
          feedback_notes,
          earning_amount,
          submission_types,
          students:student_id(name),
          student_earnings(amount)
        `)
        .eq('session_id', sessionId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching homework records:', error);
        return;
      }

      let firstValidTaskId = (data || []).find((item: any) => item.task_id)?.task_id;
      
      // If all records have empty task_id, generate a new sequential task_id
      if (!firstValidTaskId && data && data.length > 0) {
        try {
          const d = new Date();
          const yearStr = d.getFullYear();
          const monthStr = String(d.getMonth() + 1).padStart(2, '0');
          const classNameStr = (session?.class_batch || 'Class').replace(/[\s\/]+/g, '');
          const prefix = `${yearStr}-${monthStr}-${classNameStr}-`;
          
          const { data: existingSeqTasks } = await supabase
            .from('student_task_feedback')
            .select('task_id')
            .like('task_id', `${prefix}%`)
            .order('task_id', { ascending: false })
            .limit(1);
          
          let nextSeq = 1;
          if (existingSeqTasks && existingSeqTasks.length > 0 && existingSeqTasks[0].task_id) {
            const lastId = existingSeqTasks[0].task_id;
            const lastSeqStr = lastId.split('-').pop();
            if (lastSeqStr) {
              const lastSeqNum = parseInt(lastSeqStr, 10);
              if (!isNaN(lastSeqNum)) {
                nextSeq = lastSeqNum + 1;
              }
            }
          }
          const seqStr = String(nextSeq).padStart(3, '0');
          firstValidTaskId = `${prefix}${seqStr}`;
        } catch (e) {
          console.error('Error generating task_id during healing:', e);
        }
      }
      
      // Background healing of empty task_ids in database
      const emptyTaskIdRecords = (data || []).filter((item: any) => !item.task_id);
      if (firstValidTaskId && emptyTaskIdRecords.length > 0) {
        supabase
          .from('student_task_feedback')
          .update({ task_id: firstValidTaskId })
          .eq('session_id', sessionId)
          .is('task_id', null)
          .then(({ error }) => {
            if (error) console.error('Error healing empty task_ids in DB:', error);
          });
      }

      const transformedData = (data || []).map((item: any) => {
        const actualEarning = item.status === 'completed'
          ? (item.student_earnings?.[0]?.amount ?? item.earning_amount ?? 5)
          : 0;
        return {
          ...item,
          task_id: item.task_id || firstValidTaskId || '',
          student_name: item.students?.name || 'Unknown',
          actual_earning: Number(actualEarning)
        };
      });

      setHomeworkRecords(transformedData);

      if (transformedData.length > 0 && transformedData[0].status === 'draft') {
        const draft = transformedData[0];
        
        // Fetch reward configs to determine standard vs custom types
        const { data: configsData } = await supabase
          .from('reward_configurations')
          .select('task_type');
        const standardTypes = (configsData || []).map((c: any) => c.task_type);
        const isStandardType = standardTypes.includes(draft.feedback_type);
        
        setNewHomework({
          student_id: draft.student_id || '',
          task_name: draft.task_name || '',
          task_type: isStandardType ? draft.feedback_type : 'Other',
          custom_task_type: isStandardType ? '' : draft.feedback_type,
          deadline: draft.deadline ? formatDatetimeLocal(draft.deadline) : '',
          task_description: draft.task_description || '',
          submission_link: draft.submission_link || '',
          feedback_notes: draft.feedback_notes || '',
          earning_amount: draft.earning_amount?.toString() || '5',
          submission_requirements: parseSubmissionRequirements(draft.submission_types),
        });
      }
    } catch (error) {
      console.error('Error fetching homework records:', error);
    } finally {
      setHomeworkLoading(false);
    }
  };

  
  const uniqueTasks = useMemo(() => {
    const taskMap = new Map<string, any>();
    homeworkRecords.filter(hw => hw.status !== 'draft').forEach(hw => {
      const key = hw.task_id || hw.task_name;
      if (!taskMap.has(key)) {
        taskMap.set(key, hw);
      }
    });
    return Array.from(taskMap.values());
  }, [homeworkRecords]);

  const currentDisplayedTask = useMemo(() => {
    if (uniqueTasks.length === 0) return null;
    return uniqueTasks.find(t => t.task_id === activeTaskDetailId) || uniqueTasks[0];
  }, [uniqueTasks, activeTaskDetailId]);

  const filteredHomeworkRecords = useMemo(() => {
    let records = homeworkRecords.filter(hw => hw.status !== 'draft');

    if (selectedHomeworkTaskId !== 'all') {
      records = records.filter(hw => (hw.task_id || hw.task_name) === selectedHomeworkTaskId);
    }

    if (homeworkStatusFilter !== 'all') {
      records = records.filter(hw => hw.status === homeworkStatusFilter);
    }

    if (homeworkSearch.trim()) {
      const q = homeworkSearch.toLowerCase().trim();
      records = records.filter(hw => 
        (hw.student_name && hw.student_name.toLowerCase().includes(q)) ||
        (hw.task_name && hw.task_name.toLowerCase().includes(q)) ||
        (hw.task_id && hw.task_id.toLowerCase().includes(q))
      );
    }

    return records;
  }, [homeworkRecords, selectedHomeworkTaskId, homeworkStatusFilter, homeworkSearch]);

  const recordsGroupedByTask = useMemo(() => {
    const groups: { task: any; records: any[] }[] = [];
    const taskMap = new Map<string, { task: any; records: any[] }>();

    filteredHomeworkRecords.forEach(hw => {
      const key = hw.task_id || hw.task_name;
      if (!taskMap.has(key)) {
        const groupObj = { task: hw, records: [] as any[] };
        taskMap.set(key, groupObj);
        groups.push(groupObj);
      }
      taskMap.get(key)!.records.push(hw);
    });

    return groups;
  }, [filteredHomeworkRecords]);

  const recordsGroupedByStudent = useMemo(() => {
    const studentMap = new Map<string, { studentId: string; studentName: string; records: any[] }>();
    const list: { studentId: string; studentName: string; records: any[] }[] = [];

    filteredHomeworkRecords.forEach(hw => {
      const sId = hw.student_id;
      if (!studentMap.has(sId)) {
        const studentObj = { studentId: sId, studentName: hw.student_name, records: [] as any[] };
        studentMap.set(sId, studentObj);
        list.push(studentObj);
      }
      studentMap.get(sId)!.records.push(hw);
    });

    return list;
  }, [filteredHomeworkRecords]);

  const fetchStudents = async () => {
    try {
      setStudentsLoading(true);

      // Get session to find its class batch & target designations
      const { data: sessionData, error: sessionError } = await supabase
        .from('sessions')
        .select('class_batch, designations')
        .eq('id', sessionId)
        .single();

      if (sessionError) throw sessionError;

      if (!sessionData?.class_batch) {
        toast.error('Session has no class assigned');
        return;
      }

      // Find class by matching class_batch name
      const { data: classDataList, error: classError } = await supabase
        .from('classes')
        .select('id')
        .ilike('name', `%${sessionData.class_batch}%`)
        .limit(1);

      if (classError || !classDataList || classDataList.length === 0) {
        console.warn('Could not find class by name:', sessionData.class_batch);
        toast.error('Could not find class for this session');
        return;
      }
      
      const classData = classDataList[0];
      fetchRewardConfigs(classData.id);

      // Fetch students from that class filtered by selected academic year
      const { data: studentsData, error: studentsError } = await supabase
        .from('students')
        .select('id, name, student_id, designation, email')
        .eq('class_id', classData.id)
        .eq('academic_year', selectedYear)
        .order('name', { ascending: true });
        
      if (studentsError) throw studentsError;

      let finalStudents = studentsData || [];

      // Filter out inactive students
      try {
        const ids = finalStudents.map((st: any) => st.id).filter(Boolean);
        const emails = finalStudents.map((st: any) => st.email).filter(Boolean);
        const validEmails = emails.filter((em: string) => !isPlaceholderEmail(em));
        const queryOr: string[] = [];
        if (ids.length > 0) queryOr.push(`id.in.(${ids.join(',')})`);
        if (validEmails.length > 0) queryOr.push(`email.in.(${validEmails.join(',')})`);

        if (queryOr.length > 0) {
          const { data: profiles, error: profileError } = await supabase
            .from('user_profiles')
            .select('id, email, is_active')
            .or(queryOr.join(','));

          if (!profileError && profiles) {
            finalStudents = filterActiveStudents(finalStudents, profiles);
          }
        }
      } catch (profileErr) {
        console.error('Error filtering inactive students:', profileErr);
      }

      if (
        Array.isArray(sessionData?.designations) &&
        sessionData.designations.length > 0
      ) {
        finalStudents = finalStudents.filter((st: any) => {
          if (!st.designation) return false;
          const stDes = st.designation.toLowerCase();
          return sessionData.designations.some((targetDes: string) => {
            const targetDesLower = targetDes.toLowerCase();
            return stDes === targetDesLower || stDes.includes(targetDesLower) || targetDesLower.includes(stDes);
          });
        });
      }

      setStudents(finalStudents);
      if (finalStudents.length === 0) {
        toast.warning(`No students found for academic year ${selectedYear} in this class`);
      }
    } catch (error) {
      console.error('Error fetching students:', error);
      toast.error('Failed to load students');
    } finally {
       setStudentsLoading(false);
     }
   };

  const getPresentStudents = () => {
    return students.filter(student => {
      const formDataForStudent = studentFormData[student.id];
      const dbDataForStudent = studentPerformance.find(sp => (sp.student_name || '').trim() === student.name.trim());
      const perfData = formDataForStudent || dbDataForStudent || {
        attendance_status: 'Present',
      };
      return perfData.attendance_status !== 'Absent';
    });
  };

  const handleStudentSort = (field: string) => {
    if (studentSortField === field) {
      setStudentSortDirection(studentSortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setStudentSortField(field);
      setStudentSortDirection('asc');
    }
  };

  const getProcessedStudents = () => {
    // 1. Resolve performance data for each student
    const resolved = students.map(student => {
      const formDataForStudent = studentFormData[student.id];
      const dbDataForStudent = studentPerformance.find(sp => (sp.student_name || '').trim() === student.name.trim());
      const perfData = formDataForStudent || dbDataForStudent || {
        student_name: student.name,
        attendance_status: 'Present',
        questions_asked: 0,
        performance_rating: 0,
        performance_comment: '',
      };
      return {
        student,
        perfData,
        dbDataForStudent
      };
    });

    // 2. Filter
    let filtered = resolved;

    // Search query filter
    if (studentSearch.trim()) {
      const q = studentSearch.toLowerCase();
      filtered = filtered.filter(item => 
        item.student.name.toLowerCase().includes(q) || 
        (item.student.student_id && item.student.student_id.toLowerCase().includes(q))
      );
    }

    // Attendance status filter
    if (studentStatusFilter !== 'all') {
      filtered = filtered.filter(item => item.perfData.attendance_status === studentStatusFilter);
    }

    // Designation filter
    if (studentDesignationFilter !== 'all') {
      filtered = filtered.filter(item => {
        const designation = item.student.designation;
        if (studentDesignationFilter === 'scheduled' && Array.isArray(session?.designations) && session.designations.length > 0) {
          if (!designation) return false;
          const stDes = designation.toLowerCase();
          return session.designations.some((targetDes: string) => {
            const targetDesLower = targetDes.toLowerCase();
            return stDes === targetDesLower || stDes.includes(targetDesLower) || targetDesLower.includes(stDes);
          });
        }
        if (studentDesignationFilter === 'none') {
          return !designation || designation === 'none';
        }
        if (!designation) return false;
        const stDes = designation.toLowerCase();
        const filterDes = studentDesignationFilter.toLowerCase();
        return stDes === filterDes || stDes.includes(filterDes) || filterDes.includes(stDes);
      });
    }

    // 3. Sort
    filtered.sort((a, b) => {
      let comparison = 0;
      if (studentSortField === 'name') {
        comparison = a.student.name.localeCompare(b.student.name);
      } else if (studentSortField === 'response') {
        const ratingA = Number(a.perfData.performance_rating) || 0;
        const ratingB = Number(b.perfData.performance_rating) || 0;
        comparison = ratingA - ratingB;
      } else if (studentSortField === 'rating') {
        const totalA = ((Number(a.perfData.questions_asked) || 0) + (Number(a.perfData.performance_rating) || 0) - (Number(a.perfData.bad_behaviour_points) || 0)) / 2;
        const totalB = ((Number(b.perfData.questions_asked) || 0) + (Number(b.perfData.performance_rating) || 0) - (Number(b.perfData.bad_behaviour_points) || 0)) / 2;
        comparison = totalA - totalB;
      } else if (studentSortField === 'questions') {
        const questionsA = Number(a.perfData.questions_asked) || 0;
        const questionsB = Number(b.perfData.questions_asked) || 0;
        comparison = questionsA - questionsB;
      } else if (studentSortField === 'bad_behaviour') {
        const bbA = Number(a.perfData.bad_behaviour_points) || 0;
        const bbB = Number(b.perfData.bad_behaviour_points) || 0;
        comparison = bbA - bbB;
      }

      return studentSortDirection === 'asc' ? comparison : -comparison;
    });

    return filtered;
  };

  const handleTogglePerformer = (studentName: string) => {
    setIsBestPerformerManual(true);
    setFormData(prev => {
      const currentNames = prev.best_performer 
        ? prev.best_performer.split(',').map(name => name.trim()).filter(Boolean)
        : [];
      let updatedNames: string[];
      if (currentNames.includes(studentName)) {
        updatedNames = currentNames.filter(name => name !== studentName);
      } else {
        updatedNames = [...currentNames, studentName];
      }
      return { ...prev, best_performer: updatedNames.join(', ') };
    });
  };

    const handlePictureUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    
    const filesArray = Array.from(files).slice(0, 3);
    
    try {
      setUploadingPictures(true);
      const folderPath = ["FELLOW", selectedYear || "Unknown Year", "session_pictures", sessionId || "unknown"];
      const { data: { session: authSession } } = await supabase.auth.getSession();
      
      const newLinks: string[] = [];
      
      for (const file of filesArray) {
        const uploader = new GoogleDriveResumableUploader({
          file,
          folderPath,
          supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
          accessToken: authSession?.access_token || '',
        });
        const result = await uploader.upload();
        newLinks.push(result.webViewLink);
      }
      
      setFormData(prev => ({
        ...prev,
        session_pictures: [...((prev as any).session_pictures || []), ...newLinks]
      } as any));
      
      toast.success("Pictures uploaded successfully!");
    } catch (error) {
      console.error('File upload error:', error);
      toast.error('Failed to upload pictures');
    } finally {
      setUploadingPictures(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // Save form draft to localStorage and sync partial fields to DB
  const handleAutoSaveDraft = async (dataToSave = formData, isManual = false) => {
    if (!sessionId || isFeedbackLocked) return;
    try {
      setDraftSaving(true);
      const draftPayload = {
        data: dataToSave,
        savedAt: new Date().toISOString(),
        sessionId
      };
      try {
        localStorage.setItem(`session_recording_draft_${sessionId}`, JSON.stringify(draftPayload));
      } catch (e) {
        console.warn('localStorage draft cache failed:', e);
      }

      lastSavedDraftRef.current = JSON.stringify(dataToSave);
      setLastDraftSavedAt(new Date());

      // Quietly sync partial draft to database without marking feedback as done
      const partialUpdate: any = {
        session_objective: dataToSave.session_objective || null,
        practical_activities: dataToSave.practical_activities || null,
        session_highlights: dataToSave.session_highlights || null,
        learning_outcomes: dataToSave.learning_outcomes || null,
        facilitator_reflection: dataToSave.facilitator_reflection || null,
        best_performer: dataToSave.best_performer || null,
        recording_url: dataToSave.recording_url?.trim() || null,
        record_sheet_link: (dataToSave as any).record_sheet_link?.trim() || null,
        mic_sound_rating: Number(dataToSave.mic_sound_rating) || 5,
        seating_view_rating: Number(dataToSave.seating_view_rating) || 5,
        session_strength: Number(dataToSave.session_strength) || 5,
        class_batch: dataToSave.class_batch || null,
      };

      if (currentPage === 3) {
        partialUpdate.guest_teacher_feedback = dataToSave.guest_teacher_feedback || null;
        partialUpdate.incharge_reviewer_feedback = dataToSave.incharge_reviewer_feedback || null;
        partialUpdate.coordinator_mic_sound_rating = Number(dataToSave.coordinator_mic_sound_rating) || 5;
        partialUpdate.coordinator_seating_view_rating = Number(dataToSave.coordinator_seating_view_rating) || 5;
        partialUpdate.coordinator_session_strength = Number(dataToSave.coordinator_session_strength) || 5;
      }

      if (Array.isArray((dataToSave as any).session_pictures)) {
        partialUpdate.session_pictures = (dataToSave as any).session_pictures;
      }

      let { error } = await supabase
        .from('sessions')
        .update(partialUpdate)
        .eq('id', sessionId);

      if (error && (error.message?.includes('session_pictures') || error.code === 'PGRST204')) {
        delete partialUpdate.session_pictures;
        await supabase.from('sessions').update(partialUpdate).eq('id', sessionId);
      }

      if (isManual) {
        toast.success('Draft saved successfully! (Browser cache & Database updated)');
      }
    } catch (err) {
      console.error('Error saving draft:', err);
      if (isManual) {
        toast.error('Draft cached in browser, but database sync had an issue');
      }
    } finally {
      setDraftSaving(false);
    }
  };

  // Auto-save form draft whenever typed data changes (2 seconds debounce, matching attendance marking)
  useEffect(() => {
    if (isInitialFormMount.current) {
      return;
    }
    if (isFeedbackLocked || (!canEditFacilitatorSection && !canEditCoordinatorSection)) {
      return;
    }

    const currentStr = JSON.stringify(formData);
    if (!currentStr || currentStr === lastSavedDraftRef.current) {
      return;
    }

    setDraftSaving(true);
    const timer = setTimeout(() => {
      handleAutoSaveDraft(formData, false);
    }, 2000); // 2 seconds debounce matching student performance auto-save

    return () => clearTimeout(timer);
  }, [formData, isFeedbackLocked, canEditFacilitatorSection, canEditCoordinatorSection]);

  const handleSaveFeedback = async () => {
    if (isFeedbackLocked) { toast.error('Feedback is locked. Please contact an admin to unlock.'); return; }
    if (!sessionId) return;

    // Check permissions
    if (currentPage === 1 && !canEditFacilitatorSection) {
      toast.error('Access Denied: Only Facilitators and Admins can fill Facilitator feedback.');
      return;
    }
    if (currentPage === 3 && !canEditCoordinatorSection) {
      toast.error('Access Denied: Only Coordinators and Admins can fill Coordinator feedback.');
      return;
    }

    // Validation for Facilitator (Teacher) feedback fields
    if (currentPage === 1) {
      if (isRichTextEmpty(formData.session_objective)) {
        toast.error("Session Objective is required");
        return;
      }
      if (!formData.mic_sound_rating || formData.mic_sound_rating < 1 || formData.mic_sound_rating > 10) {
        toast.error("Mic/Sound Quality rating is required (1-10)");
        return;
      }
      if (!formData.seating_view_rating || formData.seating_view_rating < 1 || formData.seating_view_rating > 10) {
        toast.error("Seating/View rating is required (1-10)");
        return;
      }
      if (!formData.session_strength || formData.session_strength < 1 || formData.session_strength > 10) {
        toast.error("Session Strength rating is required (1-10)");
        return;
      }
      if (isRichTextEmpty(formData.practical_activities)) {
        toast.error("Practical Activities is required");
        return;
      }
      if (isRichTextEmpty(formData.session_highlights)) {
        toast.error("Session Highlights is required");
        return;
      }
      if (isRichTextEmpty(formData.learning_outcomes)) {
        toast.error("Learning Outcomes is required");
        return;
      }
      if (isRichTextEmpty(formData.facilitator_reflection)) {
        toast.error("Facilitator Reflection is required");
        return;
      }
      if (getPresentStudents().length > 0 && (!formData.best_performer || formData.best_performer.trim() === '')) {
        toast.error("Best Performer is required (select at least one student)");
        return;
      }

      // Mandatory Record PPT Link, Session Pictures, and Recording Link
      if (!(formData as any).record_sheet_link || !(formData as any).record_sheet_link.trim()) {
        toast.error("Record PPT Slide Link is required");
        return;
      }
      if (!Array.isArray((formData as any).session_pictures) || (formData as any).session_pictures.length === 0) {
        toast.error("At least one session picture is required (Please upload 1 to 3 pictures)");
        return;
      }
      if (!formData.recording_url || !formData.recording_url.trim()) {
        toast.error("Session Video Recording URL is required");
        return;
      }
    }

    // Validation for Coordinator feedback fields
    if (currentPage === 3) {
      if (isRichTextEmpty(formData.guest_teacher_feedback)) {
        toast.error("Guest Teacher Feedback is required");
        return;
      }
      if (isRichTextEmpty(formData.incharge_reviewer_feedback)) {
        toast.error("Feedback by Coordinator is required");
        return;
      }
      if (!formData.coordinator_mic_sound_rating || formData.coordinator_mic_sound_rating < 1 || formData.coordinator_mic_sound_rating > 10) {
        toast.error("Coordinator Mic/Sound Quality rating is required (1-10)");
        return;
      }
      if (!formData.coordinator_seating_view_rating || formData.coordinator_seating_view_rating < 1 || formData.coordinator_seating_view_rating > 10) {
        toast.error("Coordinator Seating/View rating is required (1-10)");
        return;
      }
      if (!formData.coordinator_session_strength || formData.coordinator_session_strength < 1 || formData.coordinator_session_strength > 10) {
        toast.error("Coordinator Session Strength rating is required (1-10)");
        return;
      }
    }

    try {
      setSaving(true);

      // Prepare the update object strictly scoped to current page role
      let updateData: any = {
        recorded_at: new Date().toISOString(),
      };

      if (currentPage === 1) {
        // Only Facilitator fields - NEVER touch Coordinator fields
        updateData = {
          ...updateData,
          session_objective: formData.session_objective,
          practical_activities: formData.practical_activities,
          session_highlights: formData.session_highlights,
          learning_outcomes: formData.learning_outcomes,
          facilitator_reflection: formData.facilitator_reflection,
          best_performer: formData.best_performer,
          recording_url: formData.recording_url,
          record_sheet_link: (formData as any).record_sheet_link?.trim() || null,
          ...(Array.isArray((formData as any).session_pictures) && (formData as any).session_pictures.length > 0 ? { session_pictures: (formData as any).session_pictures } : {}),
          mic_sound_rating: Number(formData.mic_sound_rating) || 5,
          seating_view_rating: Number(formData.seating_view_rating) || 5,
          session_strength: Number(formData.session_strength) || 5,
          class_batch: formData.class_batch,
          facilitator_feedback_status: 'done',
        };
      } else if (currentPage === 3) {
        // Only Coordinator fields - NEVER touch Facilitator fields
        updateData = {
          ...updateData,
          guest_teacher_feedback: formData.guest_teacher_feedback,
          incharge_reviewer_feedback: formData.incharge_reviewer_feedback,
          coordinator_mic_sound_rating: Number(formData.coordinator_mic_sound_rating) || 5,
          coordinator_seating_view_rating: Number(formData.coordinator_seating_view_rating) || 5,
          coordinator_session_strength: Number(formData.coordinator_session_strength) || 5,
          coordinator_feedback_status: 'done',
        };
      } else {
        // Fallback for general update
        updateData = {
          ...updateData,
          session_objective: formData.session_objective,
          practical_activities: formData.practical_activities,
          session_highlights: formData.session_highlights,
          learning_outcomes: formData.learning_outcomes,
          facilitator_reflection: formData.facilitator_reflection,
          best_performer: formData.best_performer,
          guest_teacher_feedback: formData.guest_teacher_feedback,
          incharge_reviewer_feedback: formData.incharge_reviewer_feedback,
          recording_url: formData.recording_url,
          record_sheet_link: (formData as any).record_sheet_link?.trim() || null,
          ...(Array.isArray((formData as any).session_pictures) && (formData as any).session_pictures.length > 0 ? { session_pictures: (formData as any).session_pictures } : {}),
          mic_sound_rating: Number(formData.mic_sound_rating) || 5,
          seating_view_rating: Number(formData.seating_view_rating) || 5,
          session_strength: Number(formData.session_strength) || 5,
          coordinator_mic_sound_rating: Number(formData.coordinator_mic_sound_rating) || 5,
          coordinator_seating_view_rating: Number(formData.coordinator_seating_view_rating) || 5,
          coordinator_session_strength: Number(formData.coordinator_session_strength) || 5,
          class_batch: formData.class_batch,
        };
      }

      // First, fetch the current session to check all feedback statuses
      const { data: currentSession, error: fetchError } = await supabase
        .from('sessions')
        .select('facilitator_feedback_status, coordinator_feedback_status, supervisor_feedback_status')
        .eq('id', sessionId)
        .single();

      if (fetchError) throw fetchError;

      // Determine what the statuses will be after this update
      const facilitatorStatus = currentPage === 1 ? 'done' : (currentSession?.facilitator_feedback_status || 'pending');
      const coordinatorStatus = currentPage === 3 ? 'done' : (currentSession?.coordinator_feedback_status || 'pending');

      // If both teacher (facilitator) and coordinator feedback are done, mark the session as completed
      if (facilitatorStatus === 'done' && coordinatorStatus === 'done') {
        updateData.status = 'completed';
        updateData.admin_feedback_status = 'submitted';
      } else if (facilitatorStatus === 'done' || coordinatorStatus === 'done') {
        updateData.status = 'in_progress';
      }

      let { error } = await supabase
        .from('sessions')
        .update(updateData)
        .eq('id', sessionId);

      if (error && (error.message?.includes('session_pictures') || error.code === 'PGRST204')) {
        console.warn('session_pictures column not in schema cache, retrying without it...');
        delete updateData.session_pictures;
        const retryResult = await supabase
          .from('sessions')
          .update(updateData)
          .eq('id', sessionId);
        error = retryResult.error;
      }

      if (error) throw error;

      await logActivity(
        'UPDATE', 
        'Sessions', 
        `Submitted/updated feedback for session: "${session?.title}" (Class: ${session?.class_batch}, Role: ${currentPage === 1 ? 'Facilitator' : 'Coordinator'}, Status: ${updateData.status || 'in_progress'})`
      );

      // Update student profiles for best performers in this session (Facilitator page only)
      if (currentPage === 1 && students.length > 0) {
        const sessionDateStr = session?.session_date || new Date().toISOString().split('T')[0];
        const selectedPerformerNames = formData.best_performer 
          ? formData.best_performer.split(',').map(name => name.trim()).filter(Boolean)
          : [];

        // Update performance records with is_best_performer flag
        const presentStudents = getPresentStudents();
        for (const student of presentStudents) {
          const isSelected = selectedPerformerNames.includes(student.name);
          
          const dbDataForStudent = studentPerformance.find(sp => (sp.student_name || '').trim() === student.name.trim());
          if (dbDataForStudent) {
            const { error: spError } = await supabase
              .from('student_performance')
              .update({ is_best_performer: isSelected })
              .eq('id', dbDataForStudent.id);
              
            if (spError) {
              console.error(`Failed to update performance flag for ${student.name}:`, spError);
            }
          }
        }
      }

      await fetchSession(true);
      // Clear cached draft upon successful submission
      try {
        localStorage.removeItem(`session_recording_draft_${sessionId}`);
        setLastDraftSavedAt(null);
        lastSavedDraftRef.current = '';
      } catch (e) {}
      toast.success('Session feedback saved successfully');
    } catch (error) {
      console.error('Error saving session:', error);
      toast.error('Failed to save session feedback');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveStudentPerformance = async () => {
    try {
      setSavingStudents(true);
      // Student performance is already saved when fields are changed
      // This just confirms and navigates back
      toast.success('Student performance saved successfully');
      navigate('/feedback');
    } catch (error) {
      console.error('Error saving student performance:', error);
      toast.error('Failed to save student performance');
    } finally {
      setSavingStudents(false);
    }
  };

  const handleSaveHoursTracker = async () => {
    if (isFeedbackLocked) { toast.error('Feedback is locked. Please contact an admin to unlock.'); return; }
    if (!canEditSupervisorSection) {
      toast.error('Access Denied: Only Supervisors and Admins can fill Session Hours Tracker.');
      return;
    }
    if (!sessionId) return;

    if (
      hoursData.plan_coordinate_hours === '' ||
      hoursData.plan_coordinate_hours === null ||
      hoursData.plan_coordinate_hours === undefined ||
      hoursData.plan_coordinate_hours < 0
    ) {
      toast.error('Plan & Coordinate Hours is required and must be 0 or more.');
      return;
    }
    if (
      hoursData.preparation_hours === '' ||
      hoursData.preparation_hours === null ||
      hoursData.preparation_hours === undefined ||
      hoursData.preparation_hours < 0
    ) {
      toast.error('Preparation Hours is required and must be 0 or more.');
      return;
    }
    if (
      hoursData.session_hours === '' ||
      hoursData.session_hours === null ||
      hoursData.session_hours === undefined ||
      hoursData.session_hours < 0
    ) {
      toast.error('Session Hours is required and must be 0 or more.');
      return;
    }
    if (
      hoursData.reflection_feedback_followup_hours === '' ||
      hoursData.reflection_feedback_followup_hours === null ||
      hoursData.reflection_feedback_followup_hours === undefined ||
      hoursData.reflection_feedback_followup_hours < 0
    ) {
      toast.error('Reflection & Feedback & Followup Hours is required and must be 0 or more.');
      return;
    }
    // Benevity ID is now optional
    if (hoursSubTab === 'benevity' && !hoursValidationId) {
      // toast.error('Benevity ID is required.');
      // return false;
    }
    if (!hoursData.notes || hoursData.notes.trim() === '') {
      toast.error('Notes is required.');
      return;
    }

    try {
      setSaving(true);

      // Check if hours tracker already exists
      const { data: existingDataList } = await supabase
        .from('session_hours_tracker' as any)
        .select('id')
        .eq('session_id', sessionId)
        .limit(1);
      const existingData = existingDataList?.[0];

      const formattedNotes = supervisorFeedback.trim()
        ? `SUPERVISOR_FEEDBACK: ${supervisorFeedback.trim()}\n---NOTES---\n${hoursData.notes || ''}`
        : hoursData.notes;

      if (existingData) {
        // Update existing record
        const { error } = await supabase
          .from('session_hours_tracker' as any)
          .update({
            plan_coordinate_hours: Number(hoursData.plan_coordinate_hours) || 0,
            preparation_hours: Number(hoursData.preparation_hours) || 0,
            session_hours: Number(hoursData.session_hours) || 0,
            reflection_feedback_followup_hours: Number(hoursData.reflection_feedback_followup_hours) || 0,
            logged_hours_in_benevity: hoursData.logged_hours_in_benevity,
            notes: formattedNotes,
            validation_id: hoursValidationId,
            updated_at: new Date().toISOString(),
          })
          .eq('session_id', sessionId);

        if (error) throw error;
      } else {
        // Insert new record
        const { error } = await supabase
          .from('session_hours_tracker' as any)
          .insert([
            {
              session_id: sessionId,
              plan_coordinate_hours: Number(hoursData.plan_coordinate_hours) || 0,
              preparation_hours: Number(hoursData.preparation_hours) || 0,
              session_hours: Number(hoursData.session_hours) || 0,
              reflection_feedback_followup_hours: Number(hoursData.reflection_feedback_followup_hours) || 0,
              logged_hours_in_benevity: hoursData.logged_hours_in_benevity,
              notes: formattedNotes,
              validation_id: hoursValidationId,
            },
          ]);

        if (error) throw error;
      }

      // Fetch current session to check all feedback statuses
      const { data: currentSession, error: fetchError } = await supabase
        .from('sessions')
        .select('facilitator_feedback_status, coordinator_feedback_status, supervisor_feedback_status')
        .eq('id', sessionId)
        .single();

      if (fetchError) throw fetchError;

      // Prepare update data for supervisor status
      const updateData: any = {
        supervisor_feedback_status: 'done',
      };

      // If all three feedback statuses are done, mark session as completed
      if (
        (currentSession?.facilitator_feedback_status || 'pending') === 'done' &&
        (currentSession?.coordinator_feedback_status || 'pending') === 'done'
      ) {
        updateData.status = 'completed';
        updateData.admin_feedback_status = 'submitted';
      }

      // Update the supervisor status in the main sessions table
      const { error: sessionError } = await supabase
        .from('sessions')
        .update(updateData)
        .eq('id', sessionId);

      if (sessionError) {
        console.warn('Hours saved but failed to update session status:', sessionError);
      }

      toast.success('Hours tracker saved successfully');
      navigate('/feedback');
    } catch (error) {
      console.error('Error saving hours tracker:', error);
      toast.error('Failed to save hours tracker');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveStudentPerformanceField = (studentId: string, fieldName: string, value: any) => {
    if (isFeedbackLocked) { toast.error('Feedback is locked. Please contact an admin to unlock.'); return; }
    // Get the student object to get the name
    const student = students.find(s => s.id === studentId);
    if (!student) return;

    const data = studentFormData[studentId] || {
      student_name: student.name,
      attendance_status: 'Present',
      questions_asked: 0,
      performance_rating: 0,
      performance_comment: '',
      bad_behaviour_points: 0,
    };

    const updatedData = {
      ...data,
      student_name: student.name,
      [fieldName]: value,
    };

    // Update local state immediately for UI responsiveness (no database call yet)
    setStudentFormData({
      ...studentFormData,
      [studentId]: updatedData,
    });
  };

  const handleBatchSaveStudentPerformance = useCallback(async () => {
    if (isFeedbackLocked) { toast.error('Feedback is locked. Please contact an admin to unlock.'); return; }
    if (Object.keys(studentFormData).length === 0) return;

    try {
      setSavingStudents(true);

      // Create a snapshot of current form data to save
      const dataToSave = { ...studentFormData };
      const studentIdsToClear = Object.keys(dataToSave);
  
      // Fetch template task for homework syncing
      const { data: sessionTasks } = await supabase
        .from('student_task_feedback')
        .select('*')
        .eq('session_id', sessionId)
        .limit(1);
      const templateTask = sessionTasks?.[0];

      // Process all student form data in the snapshot
      for (const [studentId, data] of Object.entries(dataToSave)) {
        const student = students.find(s => s.id === studentId);
        if (!student) continue;

        const payload: any = {
          session_id: sessionId,
          student_id: student.id,
          student_name: student.name.trim(),
          attendance_status: data.attendance_status || 'Present',
          questions_asked: data.questions_asked ?? 0,
          performance_comment: data.performance_comment || '',
          bad_behaviour_points: data.bad_behaviour_points ?? 0,
        };

        // Only include rating if it's not our "0" placeholder, or let the DB handle it if allowed
        if ((data.performance_rating || 0) !== 0) {
          payload.performance_rating = data.performance_rating;
        } else {
          // If 0, try null as a bypass to legacy constraints
          payload.performance_rating = null;
        }

        const { error } = await supabase
          .from('student_performance')
          .upsert(payload, { onConflict: 'session_id,student_name' });

        if (error) {
          console.warn('First save attempt failed, retrying without rating:', error);
          // Fallback: If it failed (likely constraint), try saving without the rating column entirely
          const { error: retryError } = await supabase
            .from('student_performance')
            .upsert({
              session_id: sessionId,
              student_id: student.id,
              student_name: student.name.trim(),
              attendance_status: payload.attendance_status,
              questions_asked: payload.questions_asked,
              performance_comment: payload.performance_comment,
              bad_behaviour_points: payload.bad_behaviour_points,
            }, { onConflict: 'session_id,student_name' });
          
          if (retryError) throw retryError;
        }

        // Sync homework based on attendance
        if (payload.attendance_status === 'Absent') {
          const { data: tasksToDelete } = await supabase
            .from('student_task_feedback')
            .select('id')
            .eq('session_id', sessionId)
            .eq('student_id', student.id);
          if (tasksToDelete && tasksToDelete.length > 0) {
            const taskIds = tasksToDelete.map(t => t.id);
            await supabase.from('student_earnings').delete().in('task_id', taskIds);
            await supabase.from('student_task_feedback').delete().in('id', taskIds);
          }
        } else if (payload.attendance_status === 'Present' && templateTask) {
          const { data: studentTask } = await supabase
            .from('student_task_feedback')
            .select('id')
            .eq('session_id', sessionId)
            .eq('student_id', student.id);
          if (!studentTask || studentTask.length === 0) {
            await supabase.from('student_task_feedback').insert([{
              session_id: sessionId,
              student_id: student.id,
              student_name: student.name,
              feedback_type: templateTask.feedback_type,
              task_name: templateTask.task_name,
              task_id: templateTask.task_id || null,
              task_description: templateTask.task_description,
              deadline: templateTask.deadline,
              status: 'pending',
              earning_amount: templateTask.earning_amount,
              submission_types: templateTask.submission_types || [],
              academic_year: templateTask.academic_year || selectedYear,
              created_by: user?.id || null
            }]);
          }
        }
      }

      // First fetch the latest data from DB to ensure UI doesn't flash stale data
      await fetchStudentPerformance();
      await fetchHomeworkRecords();

      // Only clear the records that were actually saved
      // This prevents wiping data that was changed while the save was in progress
      setStudentFormData(prev => {
        const newState = { ...prev };
        studentIdsToClear.forEach(id => {
          // Only delete if the data hasn't changed since we started saving
          if (JSON.stringify(newState[id]) === JSON.stringify(dataToSave[id])) {
            delete newState[id];
          }
        });
        return newState;
      });
    } catch (error: any) {
      console.error('Error saving student performance:', error);
      toast.error(`Database Error: ${error.message || 'Unknown error'}`);
    } finally {
      setSavingStudents(false);
    }
  }, [studentFormData, students, sessionId]);

  // Auto-save student performance when form data changes
  useEffect(() => {
    if (Object.keys(studentFormData).length > 0) {
      const timer = setTimeout(() => {
        handleBatchSaveStudentPerformance();
      }, 2000); // Auto-save after 2 seconds of inactivity

      return () => clearTimeout(timer);
    }
  }, [handleBatchSaveStudentPerformance]);

  const handleDeleteStudent = async (id: string | undefined) => {
    if (!id) return;

    try {
      const { error } = await supabase
        .from('student_performance' as any)
        .delete()
        .eq('id', id);

      if (error) throw error;

      setStudentPerformance(studentPerformance.filter(s => s.id !== id));
      toast.success('Student removed successfully');
    } catch (error) {
      console.error('Error deleting student:', error);
      toast.error('Failed to remove student');
    }
  };

  const formatDatetimeLocal = (dateString?: string) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '';
    const tzOffset = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - tzOffset).toISOString().slice(0, 16);
  };

  const handleStartEditHomework = () => {
    if (homeworkRecords.length > 0) {
      const currentHw = homeworkRecords[0];
      setNewHomework({
        student_id: '',
        task_name: currentHw.task_name || '',
        task_type: currentHw.feedback_type || '',
        custom_task_type: '',
        deadline: currentHw.deadline ? formatDatetimeLocal(currentHw.deadline) : '',
        task_description: currentHw.task_description || '',
        submission_link: '',
        feedback_notes: '',
        earning_amount: currentHw.earning_amount?.toString() || '5',
        submission_requirements: parseSubmissionRequirements(currentHw.submission_types),
      });
      setIsEditingHomework(true);
    }
  };



  const handleSaveTaskSettings = async () => {
    if (isFeedbackLocked) { toast.error('Feedback is locked. Please contact an admin to unlock.'); return; }
    if (!newHomework.task_name.trim()) {
      toast.error('Please enter a task name');
      return;
    }

    if (!newHomework.task_type) {
      toast.error('Please select a task type');
      return;
    }

    if (newHomework.task_type === 'Other' && !newHomework.custom_task_type?.trim()) {
      toast.error('Please specify the custom task type');
      return;
    }

    // Validate task description
    const isDescriptionEmpty = !newHomework.task_description || newHomework.task_description.replace(/<[^>]*>/g, '').trim() === '';
    if (isDescriptionEmpty) {
      toast.error('Task description is required for homework');
      return;
    }

    // Validate due date
    if (!newHomework.deadline) {
      toast.error('Due date is required for homework');
      return;
    }

    // Validate submission requirements
    if (newHomework.submission_requirements.length === 0) {
      toast.error('Please add at least one submission requirement for the homework');
      return;
    }

    // Validate that all submission requirements have a title
    const missingTitle = newHomework.submission_requirements.some(req => !req.title.trim());
    if (missingTitle) {
      toast.error('All submission requirements must have a title');
      return;
    }

    const finalTaskType = newHomework.task_type === 'Other' ? newHomework.custom_task_type : newHomework.task_type;

    try {
      setSavingHomework(true);

      // Get all present students in the class
      const presentStudents = getPresentStudents();
      if (presentStudents.length === 0) {
        toast.error('No present students found to save task for. Please mark attendance first.');
        setSavingHomework(false);
        return;
      }

      // Check if we already have records for this session
      const { data: existingRecords } = await supabase
        .from('student_task_feedback')
        .select('id, task_id')
        .eq('session_id', sessionId);

      let taskIdToUse = existingRecords?.[0]?.task_id;

      if (existingRecords && existingRecords.length > 0) {
        // Update existing tasks/drafts for this session
        const { error } = await supabase
          .from('student_task_feedback')
          .update({
            feedback_type: finalTaskType || 'homework',
            task_name: newHomework.task_name,
            task_description: newHomework.task_description || null,
            deadline: newHomework.deadline ? new Date(newHomework.deadline).toISOString() : null,
            earning_amount: Number(newHomework.earning_amount) || 5,
            submission_types: serializeSubmissionRequirements(newHomework.submission_requirements),
            updated_at: new Date().toISOString(),
          })
          .eq('session_id', sessionId);

        if (error) throw error;
        toast.success('Task settings updated and saved permanently to database');
      } else {
        // Insert new draft records
        // Generate task ID
        const d = new Date();
        const yearStr = d.getFullYear();
        const monthStr = String(d.getMonth() + 1).padStart(2, '0');
        const classNameStr = (session?.class_batch || 'Class').replace(/[\s\/]+/g, '');
        const prefix = `${yearStr}-${monthStr}-${classNameStr}-`;
        
        const { data: existingSeqTasks } = await supabase
          .from('student_task_feedback')
          .select('task_id')
          .like('task_id', `${prefix}%`)
          .order('task_id', { ascending: false })
          .limit(1);
        
        let nextSeq = 1;
        if (existingSeqTasks && existingSeqTasks.length > 0 && existingSeqTasks[0].task_id) {
          const lastId = existingSeqTasks[0].task_id;
          const lastSeqStr = lastId.split('-').pop();
          if (lastSeqStr) {
            const lastSeqNum = parseInt(lastSeqStr, 10);
            if (!isNaN(lastSeqNum)) {
              nextSeq = lastSeqNum + 1;
            }
          }
        }
        const seqStr = String(nextSeq).padStart(3, '0');
        const generatedTaskId = `${prefix}${seqStr}`;

        const homeworkRecords = presentStudents.map(student => ({
          session_id: sessionId,
          student_id: student.id,
          feedback_type: finalTaskType || 'homework',
          task_name: newHomework.task_name,
          task_id: generatedTaskId,
          task_description: newHomework.task_description || null,
          deadline: newHomework.deadline ? new Date(newHomework.deadline).toISOString() : null,
          submission_link: newHomework.submission_link || null,
          feedback_notes: newHomework.feedback_notes || null,
          earning_amount: Number(newHomework.earning_amount) || 5,
          submission_types: serializeSubmissionRequirements(newHomework.submission_requirements),
          academic_year: selectedYear,
          status: 'draft',
          created_at: new Date().toISOString(),
          created_by: user?.id || null
        }));

        const { error } = await supabase
          .from('student_task_feedback')
          .insert(homeworkRecords);

        if (error) throw error;
        toast.success('Task settings saved permanently to database');
      }

      fetchHomeworkRecords();
    } catch (error) {
      console.error('Error saving task settings:', error);
      toast.error('Failed to save task settings');
    } finally {
      setSavingHomework(false);
    }
  };

  const handleSaveHomework = async () => {
    if (isFeedbackLocked) { toast.error('Feedback is locked. Please contact an admin to unlock.'); return; }
    if (!newHomework.task_name.trim()) {
      toast.error('Please enter a task name');
      return;
    }

    if (!newHomework.task_type) {
      toast.error('Please select a task type');
      return;
    }

    if (newHomework.task_type === 'Other' && !newHomework.custom_task_type?.trim()) {
      toast.error('Please specify the custom task type');
      return;
    }

    // Validate task description
    const isDescriptionEmpty = !newHomework.task_description || newHomework.task_description.replace(/<[^>]*>/g, '').trim() === '';
    if (isDescriptionEmpty) {
      toast.error('Task description is required for homework');
      return;
    }

    // Validate due date
    if (!newHomework.deadline) {
      toast.error('Due date is required for homework');
      return;
    }

    // Validate submission requirements
    if (newHomework.submission_requirements.length === 0) {
      toast.error('Please add at least one submission requirement for the homework');
      return;
    }

    // Validate that all submission requirements have a title
    const missingTitle = newHomework.submission_requirements.some(req => !req.title.trim());
    if (missingTitle) {
      toast.error('All submission requirements must have a title');
      return;
    }

    const finalTaskType = newHomework.task_type === 'Other' ? newHomework.custom_task_type : newHomework.task_type;

    try {
      setSavingHomework(true);

      // Get all students in the class
      if (students.length === 0) {
        toast.error('No students found in this class');
        return;
      }

      if (isEditingHomework) {
        // Fetch to check if any task already has task_id
        const { data: existingTasks } = await supabase
          .from('student_task_feedback')
          .select('task_id')
          .eq('session_id', sessionId)
          .limit(1);
          
        let taskIdToUse = existingTasks?.[0]?.task_id;
        
        if (!taskIdToUse) {
          const d = new Date();
          const yearStr = d.getFullYear();
          const monthStr = String(d.getMonth() + 1).padStart(2, '0');
          const classNameStr = (session?.class_batch || 'Class').replace(/[\s\/]+/g, '');
          const prefix = `${yearStr}-${monthStr}-${classNameStr}-`;
          
          const { data: existingSeqTasks } = await supabase
            .from('student_task_feedback')
            .select('task_id')
            .like('task_id', `${prefix}%`)
            .order('task_id', { ascending: false })
            .limit(1);
          
          let nextSeq = 1;
          if (existingSeqTasks && existingSeqTasks.length > 0 && existingSeqTasks[0].task_id) {
            const lastId = existingSeqTasks[0].task_id;
            const lastSeqStr = lastId.split('-').pop();
            if (lastSeqStr) {
              const lastSeqNum = parseInt(lastSeqStr, 10);
              if (!isNaN(lastSeqNum)) {
                nextSeq = lastSeqNum + 1;
              }
            }
          }
          const seqStr = String(nextSeq).padStart(3, '0');
          taskIdToUse = `${prefix}${seqStr}`;
        }

        // Update existing tasks for this session
        const { error } = await supabase
          .from('student_task_feedback')
          .update({
            feedback_type: finalTaskType || 'homework',
            task_name: newHomework.task_name,
            task_id: taskIdToUse,
            task_description: newHomework.task_description || null,
            deadline: newHomework.deadline ? new Date(newHomework.deadline).toISOString() : null,
            earning_amount: Number(newHomework.earning_amount) || 5,
            submission_types: serializeSubmissionRequirements(newHomework.submission_requirements),
            updated_at: new Date().toISOString(),
          })
          .eq('session_id', sessionId);

        if (error) throw error;
        
        await logActivity('UPDATE', 'Tasks', `Updated session homework: "${newHomework.task_name}" for session: "${session?.title}"`);
        
        toast.success('Homework updated successfully');
        setIsEditingHomework(false);
        setEditingTaskId('');
      } else {
        // If there are existing draft records, we just update their status to 'pending'
        const { data: existingDrafts } = await supabase
          .from('student_task_feedback')
          .select('id, task_id')
          .eq('session_id', sessionId)
          .eq('status', 'draft');

        if (existingDrafts && existingDrafts.length > 0) {
          const { error } = await supabase
            .from('student_task_feedback')
            .update({
              status: 'pending',
              feedback_type: finalTaskType || 'homework',
              task_name: newHomework.task_name,
              task_description: newHomework.task_description || null,
              deadline: newHomework.deadline ? new Date(newHomework.deadline).toISOString() : null,
              submission_link: newHomework.submission_link || null,
              feedback_notes: newHomework.feedback_notes || null,
              earning_amount: Number(newHomework.earning_amount) || 5,
              submission_types: serializeSubmissionRequirements(newHomework.submission_requirements),
              updated_at: new Date().toISOString(),
            })
            .eq('session_id', sessionId);

          if (error) throw error;

          const presentStudents = getPresentStudents();
          await logActivity('CREATE', 'Tasks', `Assigned session homework: "${newHomework.task_name}" (Task ID: ${existingDrafts[0].task_id}) to ${presentStudents.length} present students`);
          toast.success(`Homework assigned to ${presentStudents.length} present students`);
        } else {
          // Create task for each present student — tagged with current academic year
          const presentStudents = getPresentStudents();
          if (presentStudents.length === 0) {
            toast.error('No present students found to assign homework to');
            setSavingHomework(false);
            return;
          }

          // Check if a task with the same name already exists in this academic year
          const { data: duplicateCheck, error: duplicateCheckError } = await supabase
            .from('student_task_feedback')
            .select('id')
            .eq('task_name', newHomework.task_name)
            .eq('academic_year', selectedYear)
            .limit(1);

          if (duplicateCheck && duplicateCheck.length > 0) {
            toast.error('A task with this title already exists in this academic year. Please use a unique title.');
            setSavingHomework(false);
            return;
          }

          // Generate task ID
          const d = new Date();
          const yearStr = d.getFullYear();
          const monthStr = String(d.getMonth() + 1).padStart(2, '0');
          const classNameStr = (session?.class_batch || 'Class').replace(/[\s\/]+/g, '');
          const prefix = `${yearStr}-${monthStr}-${classNameStr}-`;
          
          const { data: existingTasks } = await supabase
            .from('student_task_feedback')
            .select('task_id')
            .like('task_id', `${prefix}%`)
            .order('task_id', { ascending: false })
            .limit(1);
          
          let nextSeq = 1;
          if (existingTasks && existingTasks.length > 0 && existingTasks[0].task_id) {
            const lastId = existingTasks[0].task_id;
            const lastSeqStr = lastId.split('-').pop();
            if (lastSeqStr) {
              const lastSeqNum = parseInt(lastSeqStr, 10);
              if (!isNaN(lastSeqNum)) {
                nextSeq = lastSeqNum + 1;
              }
            }
          }
          const seqStr = String(nextSeq).padStart(3, '0');
          const generatedTaskId = `${prefix}${seqStr}`;

          const homeworkRecords = presentStudents.map(student => ({
            session_id: sessionId,
            student_id: student.id,
            feedback_type: finalTaskType || 'homework',
            task_name: newHomework.task_name,
            task_id: generatedTaskId,
            task_description: newHomework.task_description || null,
            deadline: newHomework.deadline ? new Date(newHomework.deadline).toISOString() : null,
            submission_link: newHomework.submission_link || null,
            feedback_notes: newHomework.feedback_notes || null,
            earning_amount: Number(newHomework.earning_amount) || 5,
            submission_types: serializeSubmissionRequirements(newHomework.submission_requirements),
            academic_year: selectedYear,
            status: 'pending',
            created_at: new Date().toISOString(),
            created_by: user?.id || null
          }));

          const { error } = await supabase
            .from('student_task_feedback')
            .insert(homeworkRecords);

          if (error) throw error;
          
          await logActivity('CREATE', 'Tasks', `Assigned session homework: "${newHomework.task_name}" (Task ID: ${generatedTaskId}) to ${presentStudents.length} present students`);
          
          toast.success(`Homework assigned to ${presentStudents.length} present students`);
        }
      }

      setNewHomework({
        student_id: '',
        task_name: '',
        task_type: '',
        custom_task_type: '',
        deadline: '',
        task_description: '',
        submission_link: '',
        feedback_notes: '',
        earning_amount: '5',
        submission_requirements: [],
      });
      fetchHomeworkRecords();
    } catch (error) {
      console.error('Error saving homework:', error);
      toast.error('Failed to save homework feedback');
    } finally {
      setSavingHomework(false);
    }
  };

  const handleDeleteHomework = async (id: string) => {
    if (isFeedbackLocked) { toast.error('Feedback is locked. Please contact an admin to unlock.'); return; }
    if (!confirm('Delete this homework feedback?')) return;

    try {
      const targetHw = homeworkRecords.find(h => h.id === id);
      const taskName = targetHw?.task_name || 'Homework';

      // Delete associated earnings first to prevent orphan records
      const { error: earningError } = await supabase
        .from('student_earnings')
        .delete()
        .eq('task_id', id);

      if (earningError) {
        console.error('Error deleting associated earnings:', earningError);
      }

      const { error } = await supabase
        .from('student_task_feedback')
        .delete()
        .eq('id', id);

      if (error) throw error;

      await logActivity('DELETE', 'Tasks', `Deleted session homework: "${taskName}" for session: "${session?.title}"`);

      toast.success('Homework deleted successfully');
      fetchHomeworkRecords();
    } catch (error) {
      console.error('Error deleting homework:', error);
      toast.error('Failed to delete homework');
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      
      {/* Picture Lightbox Preview Modal */}
      <Dialog open={!!previewPictureUrl} onOpenChange={(open) => !open && setPreviewPictureUrl(null)}>
        <DialogContent className="max-w-3xl p-4 bg-background/95 backdrop-blur-md">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between text-base">
              <span>Session Picture Preview</span>
              {previewPictureUrl && (
                <a
                  href={previewPictureUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-primary hover:underline inline-flex items-center gap-1 font-normal mr-6"
                >
                  <ExternalLink className="h-3.5 w-3.5" /> Open Original
                </a>
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="flex items-center justify-center p-2 bg-slate-950/5 dark:bg-slate-950/50 rounded-xl overflow-hidden min-h-[300px] max-h-[70vh]">
            {previewPictureUrl && (
              <img
                src={getDirectImageUrl(previewPictureUrl)}
                alt="Session Picture Preview"
                className="max-h-[65vh] w-auto max-w-full object-contain rounded-lg shadow-sm"
                onError={(e) => handleImageError(e, previewPictureUrl)}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
    );
  }

  if (!session) {
    return (
      <DashboardLayout>
        <div className="text-center py-12">
          <p className="text-muted-foreground">Session not found</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="max-w-2xl mx-auto space-y-6">
        {isFeedbackLocked && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-start gap-3">
            <Shield className="h-5 w-5 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-semibold text-sm">Feedback is Locked</p>
              <p className="text-sm mt-1">
                The deadline for editing this session's feedback has passed. Please contact an Admin to unlock it if you need to make changes.
              </p>
            </div>
          </div>
        )}
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
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
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-2xl font-bold text-foreground">Session Feedback</h1>
                <Badge variant="outline" className="font-mono text-xs bg-primary/10 text-primary border-primary/20 font-bold px-2 py-0.5">
                  {(session as any)?.session_id_code || formatSingleSessionCode(session?.session_date || '', session?.class_batch, session?.session_type)}
                </Badge>
                {draftSaving && (
                  <span className="inline-flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 px-2.5 py-0.5 rounded-full font-medium shadow-sm animate-pulse">
                    <Loader2 className="h-3 w-3 text-amber-600 animate-spin" />
                    Auto-saving draft...
                  </span>
                )}
                {lastDraftSavedAt && !draftSaving && (
                  <span className="inline-flex items-center gap-1.5 text-xs text-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 px-2.5 py-0.5 rounded-full font-medium shadow-sm" title="Your typed draft is safely cached in browser & database">
                    <CheckCircle className="h-3.5 w-3.5 text-emerald-600" />
                    Draft saved {lastDraftSavedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                {(() => {
                  const sessionData = session as any;
                  const typeLabel = sessionData.session_type === 'guest_speaker' ? 'GS' : sessionData.session_type === 'local_teacher' ? 'LT' : 'GT';
                  const classBatch = sessionData.class_batch || formData.class_batch || '';
                  const volunteerName = sessionData.volunteer_name || '';
                  const modules = sessionData.modules || '';
                  const topics = sessionData.topics_covered || sessionData.title || '';
                  return `WES ${typeLabel} Session${classBatch ? ` - ${classBatch}` : ''}${volunteerName ? ` - by ${volunteerName}` : ''}${modules ? ` - ${modules}` : ''}${topics ? ` - ${topics}` : ''}`;
                })()}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              onClick={() => navigate(`/sessions/${sessionId}/feedback-details`)}
              className="gap-2 border-primary/20 text-primary hover:bg-primary/5 shrink-0"
            >
              <Eye className="h-4 w-4" />
              View Feedback
            </Button>
            <Button 
              variant="outline" 
              onClick={() => window.open('https://docs.google.com/presentation/d/19QjljocxshsJ5pNr_QhtFI2s7ByK91mHgXsILF3K-3k/mobilepresent?pli=1&slide=id.g3f36f08c6d8_1_6', '_blank')}
              className="gap-2 border-primary/20 text-primary hover:bg-primary/5 shrink-0"
            >
              <ExternalLink className="h-4 w-4" />
              Guest Teacher Overview
            </Button>
            <Button 
              variant="outline" 
              onClick={() => window.open('https://docs.google.com/presentation/d/12m8A4LNl84soS68Npny-q2Jx6VPbMi6yyAEmfB-eFKA/edit?usp=drivesdk', '_blank')}
              className="gap-2 border-primary/20 text-primary hover:bg-primary/5 shrink-0"
            >
              <ExternalLink className="h-4 w-4" />
              Guest Speaker Overview
            </Button>
          </div>
        </div>

        {/* Session Info */}
        <Card className="bg-muted/50">
          <CardContent className="pt-6">
            <div className="grid grid-cols-2 md:grid-cols-6 gap-3 text-sm">
              <div>
                <span className="text-muted-foreground">Date</span>
                <p className="font-medium">{new Date(session.session_date).toLocaleDateString()}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Time</span>
                <p className="font-medium">{session.session_time}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Facilitator</span>
                <p className="font-medium">{session.facilitator_name || '-'}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Volunteer</span>
                <p className="font-medium">{session.volunteer_name || '-'}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Coordinator</span>
                <p className="font-medium">{session.coordinator_name || '-'}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Class</span>
                <p className="font-medium">{session.preferred_class || formData.class_batch || '-'}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Page Indicator - 3 Tabs */}
        <div className="flex justify-center gap-2 flex-wrap">
          <button
            onClick={() => {
              setCurrentPage(1);
              setCurrentSubTab('a');
            }}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${currentPage === 1
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
          >
            <div className="flex flex-col items-center">
              <span className="text-sm font-semibold flex items-center justify-center gap-1.5">
                1. Session Details & Performance
                {!canEditFacilitatorSection && <Lock className="h-3.5 w-3.5 inline opacity-70" />}
              </span>
              <span className="text-xs ">by Facilitator</span>
            </div>
          </button>
          <button
            onClick={() => setCurrentPage(3)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${currentPage === 3
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
          >
            <div className="flex flex-col items-center">
              <span className="text-sm font-semibold flex items-center justify-center gap-1.5">
                2. Feedback & Closure
                {!canEditCoordinatorSection && <Lock className="h-3.5 w-3.5 inline opacity-70" />}
              </span>
              <span className="text-xs ">by Coordinator</span>
            </div>
          </button>
          <button
            onClick={() => setCurrentPage(2)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${currentPage === 2
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
          >
            <div className="flex flex-col items-center">
              <span className="text-sm font-semibold flex items-center justify-center gap-1.5">
                3. Session Hours Tracker
                {!canEditSupervisorSection && <Lock className="h-3.5 w-3.5 inline opacity-70" />}
              </span>
              <span className="text-xs ">by Supervisor</span>
            </div>
          </button>
        </div>

        {/* Sub-tabs for Tab A */}
        {currentPage === 1 && (
          <div className="flex justify-center gap-2 flex-wrap border-b border-border pb-4">
            <button
              onClick={() => setCurrentSubTab('a')}
              className={`px-3 py-1 rounded text-xs font-medium transition-colors ${currentSubTab === 'a'
                ? 'bg-blue-100 text-blue-700 border border-blue-300'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
            >
              a) Session Objective
            </button>
            <button
              onClick={() => setCurrentSubTab('b')}
              className={`px-3 py-1 rounded text-xs font-medium transition-colors ${currentSubTab === 'b'
                ? 'bg-blue-100 text-blue-700 border border-blue-300'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
            >
              b) Performance Details
            </button>
            <button
              onClick={() => setCurrentSubTab('c')}
              className={`px-3 py-1 rounded text-xs font-medium transition-colors ${currentSubTab === 'c'
                ? 'bg-blue-100 text-blue-700 border border-blue-300'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
            >
              c) Student Homework Feedback
            </button>
          </div>
        )}

        {/* Page 1: Session Details & Performance by Facilitator */}
        {currentPage === 1 && (
          <div className="space-y-4">
            {!canEditFacilitatorSection && (
              <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-lg flex items-start gap-3">
                <Lock className="h-5 w-5 mt-0.5 flex-shrink-0 text-amber-600" />
                <div>
                  <p className="font-semibold text-sm">Facilitator Feedback is Locked (Read Only)</p>
                  <p className="text-xs mt-1 text-amber-700">
                    You are logged in as a {userRoleName}. Only Facilitators and Administrators can fill or edit this section.
                  </p>
                </div>
              </div>
            )}
            <fieldset disabled={!canEditFacilitatorSection || isFeedbackLocked} className={`space-y-4 border-0 p-0 m-0 ${!canEditFacilitatorSection || isFeedbackLocked ? 'pointer-events-none select-none opacity-85' : ''}`}>


            {/* Sub-tab a: Session Objective Only */}
            {currentSubTab === 'a' && (
              <div className="space-y-4">                 {/* Session Objective */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Session Objective <span className="text-destructive">*</span></CardTitle>
                  </CardHeader>
                  <CardContent>
                    <RichTextEditor
                      value={formData.session_objective || ''}
                      onChange={(value) => setFormData(prev => ({ ...prev, session_objective: value }))}
                      placeholder="What were the main objectives?"
                      minHeight="120px"
                    />
                  </CardContent>
                </Card>
                {/* Quality Ratings - Before Session Objective */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Quality Test Ratings</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <Label className="text-sm font-medium">Mic/Sound Quality <span className="text-destructive">*</span></Label>
                        <Select
                          value={formData.mic_sound_rating?.toString() || ''}
                          onValueChange={(val) => setFormData(prev => ({ ...prev, mic_sound_rating: parseInt(val) } as any))}
                        >
                          <SelectTrigger className="mt-1"><SelectValue placeholder="Rate 1-10" /></SelectTrigger>
                          <SelectContent>
                            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => (
                              <SelectItem key={n} value={n.toString()}>{n}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-sm font-medium">Seating/View <span className="text-destructive">*</span></Label>
                        <Select
                          value={formData.seating_view_rating?.toString() || ''}
                          onValueChange={(val) => setFormData(prev => ({ ...prev, seating_view_rating: parseInt(val) } as any))}
                        >
                          <SelectTrigger className="mt-1"><SelectValue placeholder="Rate 1-10" /></SelectTrigger>
                          <SelectContent>
                            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => (
                              <SelectItem key={n} value={n.toString()}>{n}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-sm font-medium">Session Strength <span className="text-destructive">*</span></Label>
                        <Select
                          value={formData.session_strength?.toString() || ''}
                          onValueChange={(val) => setFormData(prev => ({ ...prev, session_strength: parseInt(val) } as any))}
                        >
                          <SelectTrigger className="mt-1"><SelectValue placeholder="Rate 1-10" /></SelectTrigger>
                          <SelectContent>
                            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => (
                              <SelectItem key={n} value={n.toString()}>{n}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Sub-tab b: Performance Details */}
            {currentSubTab === 'b' && (
              <div className="space-y-4">
                {/* Practical Activities */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Practical Activities <span className="text-destructive">*</span></CardTitle>
                  </CardHeader>
                  <CardContent>
                    <RichTextEditor
                      value={formData.practical_activities || ''}
                      onChange={(value) => setFormData(prev => ({ ...prev, practical_activities: value }))}
                      placeholder="Describe the practical activities"
                      minHeight="120px"
                    />
                  </CardContent>
                </Card>

                {/* Session Highlights */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Session Highlights <span className="text-destructive">*</span></CardTitle>
                  </CardHeader>
                  <CardContent>
                    <RichTextEditor
                      value={formData.session_highlights || ''}
                      onChange={(value) => setFormData(prev => ({ ...prev, session_highlights: value }))}
                      placeholder="Key highlights and summary"
                      minHeight="120px"
                    />
                  </CardContent>
                </Card>

                {/* Learning Outcomes */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Learning Outcomes <span className="text-destructive">*</span></CardTitle>
                  </CardHeader>
                  <CardContent>
                    <RichTextEditor
                      value={formData.learning_outcomes || ''}
                      onChange={(value) => setFormData(prev => ({ ...prev, learning_outcomes: value }))}
                      placeholder="What did students learn?"
                      minHeight="120px"
                    />
                  </CardContent>
                </Card>

                {/* Student Performance - All Students Visible in Compact Inline Format */}
                <Card>
                  <CardHeader>
                    <div className="flex justify-between items-center">
                      <CardTitle className="text-base">Student Performance Feedback</CardTitle>
                      {Object.keys(studentFormData).length > 0 && (
                        <Button
                          onClick={handleBatchSaveStudentPerformance}
                          disabled={savingStudents}
                          size="sm"
                          className="bg-green-600 hover:bg-green-700"
                        >
                          {savingStudents ? 'Saving...' : 'Save All Changes'}
                        </Button>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {students.length === 0 ? (
                      <p className="text-muted-foreground text-sm">Loading students...</p>
                    ) : (
                      <div className="space-y-4">
                        {/* Filters and Sort Controls Row */}
                        <div className="flex flex-col sm:flex-row gap-3 items-center justify-between pb-3 border-b border-border">
                          {/* Search Input */}
                          <div className="w-full sm:w-1/3 relative">
                            <Search className="absolute left-2.5 top-1/2 transform -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                            <Input
                              placeholder="Search student..."
                              value={studentSearch}
                              onChange={(e) => setStudentSearch(e.target.value)}
                              className="pl-8 h-8 text-xs"
                            />
                            {studentSearch && (
                              <button
                                onClick={() => setStudentSearch('')}
                                className="absolute right-2.5 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            )}
                          </div>
                          
                          {/* Filter/Sort select boxes */}
                          <div className="flex flex-wrap w-full sm:w-auto items-center gap-3 justify-end">
                            {/* Attendance filter */}
                            <div className="w-[130px]">
                              <Select
                                value={studentStatusFilter}
                                onValueChange={(val: any) => setStudentStatusFilter(val)}
                              >
                                <SelectTrigger className="h-8 text-xs">
                                  <SelectValue placeholder="All Attendance" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="all">All Attendance</SelectItem>
                                  <SelectItem value="Present">Present Only</SelectItem>
                                  <SelectItem value="Absent">Absent Only</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>

                            {/* Designation filter */}
                            <div className="min-w-[170px]">
                              <Select
                                value={studentDesignationFilter}
                                onValueChange={(val: string) => setStudentDesignationFilter(val)}
                              >
                                <SelectTrigger className="h-8 text-xs font-medium border-primary/50">
                                  <SelectValue placeholder="All Designations" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="all">All Designations</SelectItem>
                                  {session?.designations && session.designations.length > 0 && (
                                    <SelectItem value="scheduled">
                                      Scheduled ({session.designations.join(', ')})
                                    </SelectItem>
                                  )}
                                  <SelectItem value="1. CCC">1. CCC</SelectItem>
                                  <SelectItem value="2. Junior Fellow">2. Junior Fellow</SelectItem>
                                  <SelectItem value="3. Senior Fellow">3. Senior Fellow</SelectItem>
                                  <SelectItem value="none">None</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>

                          </div>
                        </div>

                        {/* Header Row */}
                        <div className="grid grid-cols-12 gap-2 pb-2 border-b border-border items-center">
                          <div className="col-span-2 cursor-pointer hover:text-primary flex items-center gap-1" onClick={() => handleStudentSort('name')}>
                            <p className="text-xs font-semibold text-muted-foreground">Student Name</p>
                            <ArrowUpDown className="h-3 w-3 text-muted-foreground" />
                          </div>
                          <div className="col-span-1 text-center">
                            <p className="text-xs font-semibold text-muted-foreground">Status</p>
                          </div>
                          <div className="col-span-2 cursor-pointer hover:text-primary flex items-center justify-center gap-1" onClick={() => handleStudentSort('questions')}>
                            <p className="text-xs font-semibold text-muted-foreground text-center">Questions</p>
                            <ArrowUpDown className="h-3 w-3 text-muted-foreground" />
                          </div>
                          <div className="col-span-2 cursor-pointer hover:text-primary flex items-center justify-center gap-1" onClick={() => handleStudentSort('response')}>
                            <p className="text-xs font-semibold text-muted-foreground text-center">Response</p>
                            <ArrowUpDown className="h-3 w-3 text-muted-foreground" />
                          </div>
                          <div className="col-span-2 cursor-pointer hover:text-primary flex items-center justify-center gap-1" onClick={() => handleStudentSort('bad_behaviour')}>
                            <p className="text-xs font-semibold text-muted-foreground text-center">Bad Behaviour</p>
                            <ArrowUpDown className="h-3 w-3 text-muted-foreground" />
                          </div>
                          <div className="col-span-1 cursor-pointer hover:text-primary flex items-center justify-center gap-1" onClick={() => handleStudentSort('rating')}>
                            <p className="text-xs font-semibold text-muted-foreground">Rating</p>
                            <ArrowUpDown className="h-3 w-3 text-muted-foreground" />
                          </div>
                          <div className="col-span-2">
                            <p className="text-xs font-semibold text-muted-foreground">Comment</p>
                          </div>
                        </div>

                        {/* Student Rows */}
                        {getProcessedStudents().map(({ student, perfData, dbDataForStudent }) => {
                          return (
                            <div key={student.id} className="grid grid-cols-12 gap-2 items-center py-2 hover:bg-muted/30 rounded px-2 transition-colors">
                              <div className="col-span-2">
                                <p className="text-sm font-medium break-words whitespace-normal">
                                  {student.name}
                                  {student.student_id && <span className="text-xs text-muted-foreground ml-1">({student.student_id})</span>}
                                </p>
                              </div>

                              <div className="col-span-1 flex justify-center">
                                {(() => {
                                  const isAbsent = perfData.attendance_status === 'Absent';
                                  return (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const newValue = isAbsent ? 'Present' : 'Absent';
                                        setStudentFormData(prev => ({
                                          ...prev,
                                          [student.id]: { 
                                            ...(prev[student.id] || dbDataForStudent || { attendance_status: 'Present', performance_rating: 0, questions_asked: 0, performance_comment: '', bad_behaviour_points: 0 }), 
                                            attendance_status: newValue 
                                          }
                                        }));
                                      }}
                                      className={`w-8 h-8 rounded-full text-xs font-bold border-2 transition-colors ${isAbsent
                                        ? 'bg-red-100 text-red-700 border-red-300 hover:bg-red-200'
                                        : 'bg-green-100 text-green-700 border-green-300 hover:bg-green-200'
                                        }`}
                                      title={isAbsent ? 'Absent - Click to mark Present' : 'Present - Click to mark Absent'}
                                    >
                                      {isAbsent ? 'A' : 'P'}
                                    </button>
                                  );
                                })()}
                              </div>
                              <div className="col-span-2">
                                <select
                                  value={perfData.questions_asked ?? 0}
                                  onChange={(e) => {
                                    const newValue = parseInt(e.target.value) || 0;
                                    setStudentFormData(prev => ({
                                      ...prev,
                                      [student.id]: { 
                                        ...(prev[student.id] || dbDataForStudent || { attendance_status: 'Present', performance_rating: 0, questions_asked: 0, performance_comment: '', bad_behaviour_points: 0 }), 
                                        questions_asked: newValue
                                      }
                                    }));
                                  }}
                                  className="h-8 w-full rounded-md border border-input bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                                >
                                  {Array.from({ length: 11 }, (_, i) => (
                                    <option key={i} value={i}>{i}</option>
                                  ))}
                                </select>
                              </div>
 
                              <div className="col-span-2">
                                <select
                                  value={perfData.performance_rating ?? 0}
                                  onChange={(e) => {
                                    const newValue = parseInt(e.target.value) || 0;
                                    setStudentFormData(prev => ({
                                      ...prev,
                                      [student.id]: { 
                                        ...(prev[student.id] || dbDataForStudent || { attendance_status: 'Present', performance_rating: 0, questions_asked: 0, performance_comment: '', bad_behaviour_points: 0 }), 
                                        performance_rating: newValue
                                      }
                                    }));
                                  }}
                                  className="h-8 w-full rounded-md border border-input bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                                >
                                  {Array.from({ length: 11 }, (_, i) => (
                                    <option key={i} value={i}>{i}</option>
                                  ))}
                                </select>
                              </div>

                              <div className="col-span-2">
                                <select
                                  value={perfData.bad_behaviour_points ?? 0}
                                  onChange={(e) => {
                                    const newValue = parseInt(e.target.value) || 0;
                                    setStudentFormData(prev => ({
                                      ...prev,
                                      [student.id]: { 
                                        ...(prev[student.id] || dbDataForStudent || { attendance_status: 'Present', performance_rating: 0, questions_asked: 0, performance_comment: '', bad_behaviour_points: 0 }), 
                                        bad_behaviour_points: newValue
                                      }
                                    }));
                                  }}
                                  className="h-8 w-full rounded-md border border-input bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                                >
                                  {Array.from({ length: 11 }, (_, i) => (
                                    <option key={i} value={i}>{i}</option>
                                  ))}
                                </select>
                              </div>

                              <div className="col-span-1 text-center font-bold text-blue-600 text-sm">
                                {Math.max(0, ((perfData.questions_asked ?? 0) + (perfData.performance_rating ?? 0) - (perfData.bad_behaviour_points ?? 0)) / 2)}
                              </div>

                              <div className="col-span-2">
                                <Input
                                  type="text"
                                  value={perfData.performance_comment || ''}
                                  onChange={(e) => {
                                    setStudentFormData(prev => ({
                                      ...prev,
                                      [student.id]: { 
                                        ...(prev[student.id] || dbDataForStudent || { attendance_status: 'Present', performance_rating: 0, questions_asked: 0, performance_comment: '', bad_behaviour_points: 0 }), 
                                        performance_comment: e.target.value 
                                      }
                                    }));
                                  }}
                                  placeholder="Comment..."
                                  className="h-8 text-xs p-1"
                                />
                              </div>
                            </div>
                          );
                        })}

                        {/* Student Count Summary */}
                        <div className="pt-3 mt-3 border-t border-border flex justify-between items-center text-xs font-semibold text-muted-foreground">
                          <p>
                            Total Students in Class: <span className="text-foreground">{students.length}</span>
                          </p>
                          {(studentSearch || studentStatusFilter !== 'all' || studentDesignationFilter !== 'all') && (
                            <p>
                              Filtered: <span className="text-foreground">{getProcessedStudents().length}</span>
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
                 {/* Facilitator Reflection */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Facilitator Reflection <span className="text-destructive">*</span></CardTitle>
                  </CardHeader>
                  <CardContent>
                    <RichTextEditor
                      value={formData.facilitator_reflection || ''}
                      onChange={(value) => setFormData(prev => ({ ...prev, facilitator_reflection: value }))}
                      placeholder="Facilitator's reflection and remarks"
                      minHeight="120px"
                    />
                  </CardContent>
                </Card>

                {/* Best Performer */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Best Performer <span className="text-destructive">*</span></CardTitle>
                  </CardHeader>
                  <CardContent>
                    {(() => {
                      const selectedPerformerNames = formData.best_performer 
                        ? formData.best_performer.split(',').map(name => name.trim()).filter(Boolean)
                        : [];
                        
                      return (
                        <div className="space-y-2">
                          <div className="min-h-[40px] h-auto p-2 border border-input rounded-md bg-muted/30">
                            {selectedPerformerNames.length > 0 ? (
                              <div className="flex flex-wrap gap-1.5">
                                {selectedPerformerNames.map((name) => (
                                  <Badge
                                    key={name}
                                    variant="secondary"
                                    className="flex items-center gap-1 bg-secondary/80 text-secondary-foreground"
                                  >
                                    {name}
                                  </Badge>
                                ))}
                              </div>
                            ) : (
                              <span className="text-muted-foreground text-sm italic">No best performers yet (automatically calculated from top 3 present students' ratings)</span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">
                            Automatically selected as the top 3 present students based on their ratings. Non-editable.
                          </p>
                        </div>
                      );
                    })()}
                  </CardContent>
                </Card>

                {/* Record Sheet Link */}
                <Card className="border-l-4 border-l-blue-500 shadow-sm">
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <ExternalLink className="h-4 w-4 text-blue-600" />
                      Record PPT Slide Link and Pictures <span className="text-xs text-red-500 font-bold">* (Required)</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div>
                      <Label htmlFor="record_sheet_link" className="text-sm font-semibold flex items-center gap-1">
                        Record PPT Slide Link <span className="text-xs text-red-500 font-bold">* (Required)</span>
                      </Label>
                      <Input
                        id="record_sheet_link"
                        type="url"
                        value={(formData as any).record_sheet_link || ''}
                        onChange={(e) => setFormData(prev => ({ ...prev, record_sheet_link: e.target.value } as any))}
                        placeholder="please paste link the record sheet(physical) of sesssion(pdf)"
                        className="mt-1"
                        required
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        Paste the link to the session record sheet / presentation slide (Mandatory)
                      </p>
                    </div>
                      
                      <div className="mt-5 pt-4 border-t space-y-3">
                        <div className="flex items-center justify-between flex-wrap gap-2">
                          <div>
                            <Label className="text-sm font-semibold text-foreground flex items-center gap-1">
                              Upload Session Pictures (1 to 3) <span className="text-xs text-red-500 font-bold">* (Required)</span>
                            </Label>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              Add at least 1 picture (up to 3) from the classroom session to verify attendance & engagement (Mandatory)
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${((formData as any).session_pictures?.length || 0) > 0 ? 'bg-emerald-50 text-emerald-700 border-emerald-300' : 'bg-red-50 text-red-700 border-red-300'}`}>
                              {((formData as any).session_pictures?.length || 0)} / 3 uploaded {((formData as any).session_pictures?.length || 0) === 0 ? '(Required)' : '✓'}
                            </span>
                            {((formData as any).session_pictures?.length || 0) < 3 && (
                              <Button 
                                variant="outline" 
                                size="sm"
                                type="button" 
                                onClick={() => fileInputRef.current?.click()}
                                disabled={uploadingPictures || isFeedbackLocked}
                                className="h-8 text-xs gap-1.5"
                              >
                                {uploadingPictures ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UploadCloud className="h-3.5 w-3.5" />}
                                Upload Picture
                              </Button>
                            )}
                          </div>
                        </div>

                        {/* Hidden file input */}
                        <input 
                          type="file" 
                          ref={fileInputRef} 
                          className="hidden" 
                          multiple 
                          accept="image/*"
                          onChange={handlePictureUpload} 
                        />

                        {/* 1 Row Gallery Cards */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 w-full pt-1">
                          {((formData as any).session_pictures || []).map((pic: string, index: number) => (
                            <div 
                              key={index} 
                              className="relative group rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-900/5 shadow-sm hover:shadow-md transition-all duration-200 aspect-[16/10] sm:aspect-[4/3] flex flex-col justify-between"
                            >
                              <img 
                                src={getDirectImageUrl(pic)} 
                                alt={`Session Photo ${index + 1}`} 
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                onError={(e) => handleImageError(e, pic)}
                              />
                              
                              {/* Top Bar: Badge & Remove button */}
                              <div className="absolute top-2.5 inset-x-2.5 flex items-center justify-between z-10">
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-black/70 text-white backdrop-blur-md shadow-sm">
                                  Photo {index + 1}
                                </span>
                                {!isFeedbackLocked && (
                                  <button 
                                    type="button" 
                                    className="h-6 w-6 rounded-full bg-red-600 hover:bg-red-700 text-white flex items-center justify-center shadow-md transition-all hover:scale-110 active:scale-95" 
                                    title="Remove this photo"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      setFormData(prev => {
                                        const newPics = [...((prev as any).session_pictures || [])];
                                        newPics.splice(index, 1);
                                        return { ...prev, session_pictures: newPics } as any;
                                      });
                                    }}
                                  >
                                    <X className="h-3.5 w-3.5 stroke-[2.5]" />
                                  </button>
                                )}
                              </div>

                              {/* Hover Overlay with Preview and Drive links */}
                              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-end justify-between p-2.5 z-10">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setPreviewPictureUrl(pic);
                                  }}
                                  className="inline-flex items-center gap-1 text-[11px] font-medium text-white bg-white/20 hover:bg-white/30 backdrop-blur-md px-2.5 py-1 rounded-md transition-colors"
                                >
                                  <Eye className="h-3.5 w-3.5" /> View
                                </button>
                                <a 
                                  href={pic} 
                                  target="_blank" 
                                  rel="noopener noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  className="inline-flex items-center gap-1 text-[11px] font-medium text-white bg-white/20 hover:bg-white/30 backdrop-blur-md px-2.5 py-1 rounded-md transition-colors"
                                  title="Open in Google Drive"
                                >
                                  <ExternalLink className="h-3.5 w-3.5" /> Drive
                                </a>
                              </div>
                            </div>
                          ))}

                          {/* Upload Slot if less than 3 pictures */}
                          {((formData as any).session_pictures?.length || 0) < 3 && (
                            uploadingPictures ? (
                              <div className="rounded-xl border-2 border-dashed border-primary/40 bg-primary/5 aspect-[16/10] sm:aspect-[4/3] flex flex-col items-center justify-center p-3 text-center">
                                <Loader2 className="h-7 w-7 text-primary animate-spin mb-2" />
                                <span className="text-xs font-semibold text-primary">Uploading to Drive...</span>
                                <span className="text-[10px] text-muted-foreground mt-0.5">Please wait</span>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => fileInputRef.current?.click()}
                                disabled={uploadingPictures || isFeedbackLocked}
                                className="rounded-xl border-2 border-dashed border-slate-300 hover:border-primary hover:bg-primary/5 dark:border-slate-700 dark:hover:border-primary aspect-[16/10] sm:aspect-[4/3] flex flex-col items-center justify-center p-3 text-center transition-all group cursor-pointer"
                              >
                                <div className="h-10 w-10 rounded-full bg-slate-100 dark:bg-slate-800 group-hover:bg-primary/10 flex items-center justify-center mb-2 transition-colors">
                                  <UploadCloud className="h-5 w-5 text-slate-500 group-hover:text-primary transition-colors" />
                                </div>
                                <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 group-hover:text-primary transition-colors">
                                  + Add Picture
                                </span>
                                <span className="text-[10px] text-muted-foreground mt-0.5">
                                  {3 - ((formData as any).session_pictures?.length || 0)} slot{3 - ((formData as any).session_pictures?.length || 0) > 1 ? 's' : ''} left
                                </span>
                              </button>
                            )
                          )}
                        </div>
                      </div>
                    {(formData as any).record_sheet_link && (
                      <a
                        href={(formData as any).record_sheet_link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-primary hover:underline text-sm"
                      >
                        <ExternalLink className="h-3 w-3" />
                        Open Record Sheet
                      </a>
                    )}
                  </CardContent>
                </Card>

                {/* Session Video Recording */}
                <Card className="border-l-4 border-l-purple-500 shadow-sm">
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <ExternalLink className="h-4 w-4 text-purple-600" />
                      Session Video Recording <span className="text-xs text-red-500 font-bold">* (Required)</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <Label htmlFor="recording_url" className="text-sm font-semibold flex items-center gap-1">
                        Session Video Recording URL <span className="text-xs text-red-500 font-bold">* (Required)</span>
                      </Label>
                      <Input
                        id="recording_url"
                        type="url"
                        value={formData.recording_url || ''}
                        onChange={(e) => setFormData(prev => ({ ...prev, recording_url: e.target.value }))}
                        placeholder="https://example.com/recording"
                        className="w-full"
                        required
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        Paste the link to the recorded session video (e.g. Google Drive, Zoom, YouTube) (Mandatory)
                      </p>
                      {formData.recording_url && (
                        <a
                          href={formData.recording_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-primary hover:underline text-sm mt-2"
                        >
                          <ExternalLink className="h-3 w-3" />
                          View Recording
                        </a>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Sub-tab c: Student Homework Feedback */}
            {currentSubTab === 'c' && (
              <div className="space-y-4">
                {uniqueTasks.length > 0 && homeworkRecords[0].status !== 'draft' && !isEditingHomework ? (
                  <Card>
                    <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 gap-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <CardTitle className="text-base">Assigned Student Homework</CardTitle>
                        <Badge variant="secondary" className="text-xs font-semibold">
                          {uniqueTasks.length} {uniqueTasks.length === 1 ? 'Task' : 'Tasks'} Assigned
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleStartEditHomework(currentDisplayedTask?.task_id)}
                          className="gap-1.5"
                        >
                          <Edit className="h-3.5 w-3.5" />
                          Edit This Task
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            setNewHomework({
                              student_id: '',
                              task_name: '',
                              task_type: '',
                              custom_task_type: '',
                              deadline: '',
                              task_description: '',
                              submission_link: '',
                              feedback_notes: '',
                              earning_amount: '5',
                              submission_requirements: [],
                            });
                            setIsEditingHomework(true);
                            setEditingTaskId('');
                          }}
                          className="gap-1.5 text-xs"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          Assign Another Task
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {uniqueTasks.length > 1 && (
                        <div className="space-y-1.5">
                          <span className="text-xs font-semibold text-muted-foreground block">
                            Assigned Tasks in this Session (Click to view details):
                          </span>
                          <div className="flex flex-wrap items-center gap-1.5 p-1.5 bg-muted/50 rounded-xl border border-border/50">
                            {uniqueTasks.map((t, idx) => {
                              const isSelected = (currentDisplayedTask?.task_id === t.task_id) || (!currentDisplayedTask && idx === 0);
                              return (
                                <button
                                  key={t.task_id || idx}
                                  type="button"
                                  onClick={() => {
                                    setActiveTaskDetailId(t.task_id);
                                    setSelectedHomeworkTaskId(t.task_id);
                                  }}
                                  className={cn(
                                    "text-xs px-2.5 py-1.5 rounded-lg font-medium transition-all flex items-center gap-1.5 cursor-pointer",
                                    isSelected 
                                      ? "bg-white text-primary shadow-xs font-bold border border-primary/20" 
                                      : "text-muted-foreground hover:text-foreground hover:bg-white/60"
                                  )}
                                >
                                  <span className="font-mono text-[11px] bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                                    {t.task_id ? t.task_id.split('-').pop() : '#' + (idx + 1)}
                                  </span>
                                  <span className="truncate max-w-[150px] sm:max-w-[200px]">{t.task_name}</span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {currentDisplayedTask && (
                        <>
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 bg-muted/40 p-4 rounded-lg">
                            <div>
                              <span className="text-xs text-muted-foreground block">Task ID</span>
                              <span className="font-mono font-bold text-foreground text-sm">{currentDisplayedTask.task_id || '-'}</span>
                            </div>
                            <div>
                              <span className="text-xs text-muted-foreground block">Task Name</span>
                              <span className="font-bold text-foreground text-sm">{currentDisplayedTask.task_name}</span>
                            </div>
                            <div>
                              <span className="text-xs text-muted-foreground block">Task Type</span>
                              <span className="font-bold text-foreground text-sm capitalize">{currentDisplayedTask.feedback_type}</span>
                            </div>
                            <div>
                              <span className="text-xs text-muted-foreground block">Deadline</span>
                              <span className="font-bold text-foreground text-sm">
                                {currentDisplayedTask.deadline 
                                  ? new Date(currentDisplayedTask.deadline).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) 
                                  : '-'}
                              </span>
                            </div>
                            <div>
                              <span className="text-xs text-muted-foreground block">Earning Amount</span>
                              <span className="font-bold text-green-600 text-sm">{currentDisplayedTask.earning_amount || 5} units</span>
                            </div>
                          </div>
                          {currentDisplayedTask.task_description && (
                            <div>
                              <span className="text-xs text-muted-foreground block mb-1">Task Description</span>
                              <div 
                                className="prose prose-sm max-w-none text-muted-foreground mt-2 task-description-content"
                                dangerouslySetInnerHTML={{ __html: currentDisplayedTask.task_description }}
                              />
                            </div>
                          )}
                        </>
                      )}
                    </CardContent>
                  </Card>
                ) : (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">
                        {isEditingHomework ? 'Edit Student Homework & Tasks' : 'Add Student Homework & Tasks'}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor="hw_task" className="text-sm">Task Name *</Label>
                          <Input
                            id="hw_task"
                            placeholder="e.g., Chapter 5 Exercise"
                            value={newHomework.task_name}
                            onChange={(e) => setNewHomework({ ...newHomework, task_name: e.target.value })}
                            className="mt-1"
                          />
                        </div>
                        <div>
                          <Label htmlFor="hw_type" className="text-sm">Task Type *</Label>
                          <Select
                            value={newHomework.task_type}
                            onValueChange={(v) => {
                              const config = rewardConfigs.find(c => c.task_type === v);
                              setNewHomework({ 
                                ...newHomework, 
                                task_type: v,
                                earning_amount: config ? config.rate_per_task.toString() : newHomework.earning_amount
                              });
                            }}
                          >
                            <SelectTrigger id="hw_type" className="mt-1">
                              <SelectValue placeholder="Select task type" />
                            </SelectTrigger>
                            <SelectContent>
                              {rewardConfigs.filter(c => c.task_type).map((config) => (
                                <SelectItem key={config.task_type} value={config.task_type}>
                                  {config.task_type}
                                </SelectItem>
                              ))}
                              {!rewardConfigs.some(c => c.task_type === 'Other') && (
                                <SelectItem value="Other">Other</SelectItem>
                              )}
                            </SelectContent>
                          </Select>
                        </div>
                        {newHomework.task_type === 'Other' && (
                          <div className="md:col-span-2">
                            <Label htmlFor="hw_custom_type" className="text-sm">Specify Task Type *</Label>
                            <Input
                              id="hw_custom_type"
                              placeholder="Type custom task type"
                              value={newHomework.custom_task_type || ''}
                              onChange={(e) => setNewHomework({ ...newHomework, custom_task_type: e.target.value })}
                              className="mt-1"
                            />
                          </div>
                        )}
                        <div>
                          <Label htmlFor="hw_deadline" className="text-sm">Deadline *</Label>
                          <Input
                            id="hw_deadline"
                            type="datetime-local"
                            value={newHomework.deadline}
                            onChange={(e) => setNewHomework({ ...newHomework, deadline: e.target.value })}
                            className="mt-1"
                          />
                        </div>
                        <div>
                          <Label htmlFor="hw_earning" className="text-sm">Earning Amount</Label>
                          <Input
                            id="hw_earning"
                            type="number"
                            min="0"
                            value={newHomework.earning_amount}
                            onChange={(e) => setNewHomework({ ...newHomework, earning_amount: e.target.value })}
                            placeholder="e.g. 5"
                            className="mt-1"
                          />
                        </div>
                      </div>
                      
                      <div className="space-y-4 mt-6">
                        <div className="flex items-center justify-between">
                          <Label>Submission Requirements *</Label>
                          <Button 
                            type="button" 
                            variant="outline" 
                            size="sm"
                            onClick={() => {
                              const newReq: SubmissionRequirement = {
                                id: `req-${Date.now()}`,
                                title: '',
                                type: 'pdf'
                              };
                              setNewHomework({
                                ...newHomework,
                                submission_requirements: [...newHomework.submission_requirements, newReq]
                              });
                            }}
                          >
                            + Add Requirement
                          </Button>
                        </div>
                        
                        {newHomework.submission_requirements.length === 0 ? (
                          <div className="text-sm text-red-500 font-medium">At least one submission requirement is mandatory. Add a requirement to save the homework.</div>
                        ) : (
                          <div className="space-y-3">
                            {newHomework.submission_requirements.map((req, index) => (
                              <div key={req.id} className="flex gap-2 items-start border p-3 rounded-md bg-gray-50">
                                <div className="flex-1 space-y-2">
                                  <div>
                                    <Label className="text-xs">Requirement Title *</Label>
                                    <Input 
                                      placeholder="e.g., Presentation PPT" 
                                      value={req.title}
                                      onChange={(e) => {
                                        const updated = [...newHomework.submission_requirements];
                                        updated[index].title = e.target.value;
                                        setNewHomework({ ...newHomework, submission_requirements: updated });
                                      }}
                                    />
                                  </div>
                                </div>
                                <div className="w-48 space-y-2">
                                  <Label className="text-xs">File Type</Label>
                                  <select 
                                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                                    value={req.type}
                                    onChange={(e) => {
                                      const updated = [...newHomework.submission_requirements];
                                      updated[index].type = e.target.value;
                                      setNewHomework({ ...newHomework, submission_requirements: updated });
                                    }}
                                  >
                                    <option value="video">Video</option>
                                    <option value="pdf">Pdf</option>
                                    <option value="doc">Doc</option>
                                    <option value="ppt">Ppt</option>
                                    <option value="excel">Excel</option>
                                    <option value="image">Image</option>
                                    <option value="code">Code</option>
                                    <option value="link">Link</option>
                                  </select>
                                </div>
                                <div className="pt-6">
                                  <Button
                                    type="button"
                                    variant="destructive"
                                    size="icon"
                                    onClick={() => {
                                      const updated = newHomework.submission_requirements.filter((_, i) => i !== index);
                                      setNewHomework({ ...newHomework, submission_requirements: updated });
                                    }}
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      
                      <div className="mt-4">
                        <div className="flex items-center justify-between mb-1">
                          <Label htmlFor="hw_description" className="text-sm">Task Description *</Label>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={toggleVoiceTyping}
                            className={cn(
                              "h-7 gap-1.5 text-[10px] font-bold uppercase tracking-wider transition-all",
                              isListening ? "text-red-500 bg-red-50 animate-pulse border border-red-200" : "text-primary hover:bg-primary/10"
                            )}
                          >
                            {isListening ? <MicOff className="h-3 w-3" /> : <Mic className="h-3 w-3" />}
                            {isListening ? 'Stop Listening' : 'Speak to Type'}
                          </Button>
                        </div>
                        <RichTextEditor
                          value={newHomework.task_description}
                          onChange={(value) => setNewHomework({ ...newHomework, task_description: value })}
                          placeholder="Describe the task or assignment with formatting..."
                        />
                      </div>
                      <div className="flex flex-col sm:flex-row gap-3">
                        {isEditingHomework ? (
                          <>
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => setIsEditingHomework(false)}
                              className="w-1/3"
                            >
                              Cancel
                            </Button>
                            <Button
                              onClick={handleSaveHomework}
                              disabled={savingHomework}
                              className="w-2/3 gap-2"
                            >
                              <Check className="h-4 w-4" />
                              {savingHomework ? 'Saving...' : 'Save Changes'}
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button
                              type="button"
                              variant={isHomeworkSaved ? "secondary" : "default"}
                              onClick={handleSaveTaskSettings}
                              disabled={savingHomework}
                              className="flex-1 gap-2"
                            >
                              <Save className="h-4 w-4" />
                              {savingHomework ? 'Saving...' : 'Save Task'}
                            </Button>
                            <Button
                              type="button"
                              onClick={handleSaveHomework}
                              disabled={!isHomeworkSaved || savingHomework}
                              className="flex-1 gap-2 bg-green-600 hover:bg-green-700 text-white disabled:bg-gray-200 disabled:text-gray-400"
                            >
                              <Plus className="h-4 w-4" />
                              {savingHomework ? 'Assigning...' : 'Assign Task'}
                            </Button>
                          </>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Homework List */}
                <Card>
                  <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 gap-3">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <CardTitle className="text-base">
                          Student Homework Records ({filteredHomeworkRecords.length})
                        </CardTitle>
                        {uniqueTasks.length > 1 && (
                          <Badge variant="outline" className="text-xs">
                            {uniqueTasks.length} Tasks
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {uniqueTasks.length > 1 
                          ? 'Showing homework records across ' + uniqueTasks.length + ' assigned tasks in this session.'
                          : 'Homework submissions for the assigned task.'}
                      </p>
                    </div>

                    {/* View Mode Toggle: By Task vs By Student */}
                    {uniqueTasks.length > 1 && (
                      <div className="flex items-center gap-1 bg-muted p-1 rounded-lg self-start sm:self-auto">
                        <button
                          type="button"
                          onClick={() => setHomeworkViewMode('by_task')}
                          className={cn(
                            "text-xs px-2.5 py-1 rounded-md font-medium transition-all cursor-pointer",
                            homeworkViewMode === 'by_task' ? "bg-white shadow-xs font-bold text-primary" : "text-muted-foreground hover:text-foreground"
                          )}
                        >
                          Group by Task
                        </button>
                        <button
                          type="button"
                          onClick={() => setHomeworkViewMode('by_student')}
                          className={cn(
                            "text-xs px-2.5 py-1 rounded-md font-medium transition-all cursor-pointer",
                            homeworkViewMode === 'by_student' ? "bg-white shadow-xs font-bold text-primary" : "text-muted-foreground hover:text-foreground"
                          )}
                        >
                          Group by Student
                        </button>
                      </div>
                    )}
                  </CardHeader>

                  <CardContent className="space-y-4">
                    {/* Filters: Task, Search Student, Status */}
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 pb-2">
                      {uniqueTasks.length > 1 && (
                        <div className="w-full sm:w-64">
                          <Select 
                            value={selectedHomeworkTaskId} 
                            onValueChange={(val) => {
                              setSelectedHomeworkTaskId(val);
                              if (val !== 'all') setActiveTaskDetailId(val);
                            }}
                          >
                            <SelectTrigger className="h-9 text-xs">
                              <SelectValue placeholder="All Tasks" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">
                                All Tasks ({uniqueTasks.length} Tasks, {homeworkRecords.filter(hw => hw.status !== 'draft').length} Records)
                              </SelectItem>
                              {uniqueTasks.map(t => {
                                const count = homeworkRecords.filter(h => (h.task_id || h.task_name) === t.task_id).length;
                                return (
                                  <SelectItem key={t.task_id} value={t.task_id}>
                                    {t.task_id.split('-').pop()} - {t.task_name} ({count} std)
                                  </SelectItem>
                                );
                              })}
                            </SelectContent>
                          </Select>
                        </div>
                      )}

                      <div className="relative flex-1">
                        <Search className="w-3.5 h-3.5 absolute left-3 top-3 text-muted-foreground" />
                        <Input 
                          placeholder="Search by student name or task..."
                          value={homeworkSearch}
                          onChange={(e) => setHomeworkSearch(e.target.value)}
                          className="h-9 pl-8 text-xs"
                        />
                        {homeworkSearch && (
                          <button onClick={() => setHomeworkSearch('')} className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground cursor-pointer">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>

                      <div className="w-full sm:w-36">
                        <Select value={homeworkStatusFilter} onValueChange={setHomeworkStatusFilter}>
                          <SelectTrigger className="h-9 text-xs">
                            <SelectValue placeholder="All Status" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All Statuses</SelectItem>
                            <SelectItem value="completed">Completed</SelectItem>
                            <SelectItem value="submitted">Submitted</SelectItem>
                            <SelectItem value="reviewed">Reviewed</SelectItem>
                            <SelectItem value="pending">Pending</SelectItem>
                            <SelectItem value="rejected">Rejected</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {homeworkLoading ? (
                      <div className="text-center py-8 text-muted-foreground">
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mx-auto mb-2"></div>
                        Loading homework records...
                      </div>
                    ) : filteredHomeworkRecords.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        <p>No matching homework records found</p>
                        <p className="text-xs mt-1 text-slate-400">Try adjusting your task or search filter</p>
                      </div>
                    ) : homeworkViewMode === 'by_student' && uniqueTasks.length > 1 ? (
                      /* MODE 2: GROUPED BY STUDENT (Shows each of the students once with all their tasks) */
                      <div className="space-y-4">
                        {recordsGroupedByStudent.map((stdGroup) => {
                          const completedCount = stdGroup.records.filter(r => r.status === 'completed').length;
                          const pendingCount = stdGroup.records.filter(r => r.status === 'pending').length;
                          const rejectedCount = stdGroup.records.filter(r => r.status === 'rejected').length;
                          const submittedCount = stdGroup.records.filter(r => r.status === 'submitted' || r.status === 'reviewed').length;

                          return (
                            <div key={stdGroup.studentId} className="border border-border/80 rounded-xl overflow-hidden shadow-2xs">
                              <div className="bg-slate-50 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border/60">
                                <div className="flex items-center gap-2.5">
                                  <span className="w-7 h-7 rounded-full bg-indigo-100 text-indigo-700 font-bold text-xs flex items-center justify-center">
                                    {stdGroup.studentName.charAt(0).toUpperCase()}
                                  </span>
                                  <div>
                                    <h4 className="font-bold text-sm text-foreground">{stdGroup.studentName}</h4>
                                    <span className="text-[11px] text-muted-foreground">{stdGroup.records.length} Tasks Assigned</span>
                                  </div>
                                </div>

                                <div className="flex items-center gap-1.5 flex-wrap">
                                  {completedCount > 0 && (
                                    <Badge className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px]">
                                      {completedCount} Completed
                                    </Badge>
                                  )}
                                  {submittedCount > 0 && (
                                    <Badge className="bg-blue-50 text-blue-700 border border-blue-200 text-[10px]">
                                      {submittedCount} Submitted
                                    </Badge>
                                  )}
                                  {pendingCount > 0 && (
                                    <Badge className="bg-amber-50 text-amber-700 border border-amber-200 text-[10px]">
                                      {pendingCount} Pending
                                    </Badge>
                                  )}
                                  {rejectedCount > 0 && (
                                    <Badge className="bg-rose-50 text-rose-700 border border-rose-200 text-[10px]">
                                      {rejectedCount} Rejected
                                    </Badge>
                                  )}
                                </div>
                              </div>

                              <div className="p-3 space-y-2 bg-background">
                                {stdGroup.records.map((homework) => (
                                  <div key={homework.id} className="p-2.5 rounded-lg border border-border/40 hover:bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                                    <div className="space-y-0.5 flex-1">
                                      <div className="flex items-center gap-2">
                                        <span className="font-mono text-[10px] bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded font-semibold">
                                          {homework.task_id}
                                        </span>
                                        <span className="font-semibold text-slate-800">{homework.task_name}</span>
                                      </div>
                                      {homework.feedback_notes && (
                                        <p className="text-slate-500 text-[11px] italic pl-1">Note: {homework.feedback_notes}</p>
                                      )}
                                      {homework.submission_link && (
                                        <div className="flex gap-2 pt-1">
                                          {parseSubmissionLinks(homework.submission_link).map((linkObj, lIdx) => (
                                            <a
                                              key={lIdx}
                                              href={linkObj.url}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              className="text-primary hover:underline text-[11px] inline-flex items-center gap-1"
                                            >
                                              {linkObj.label} <ExternalLink className="h-2.5 w-2.5" />
                                            </a>
                                          ))}
                                        </div>
                                      )}
                                    </div>

                                    <div className="flex items-center gap-3 shrink-0">
                                      <span className="font-bold text-slate-700">{homework.actual_earning} units</span>
                                      <span className={cn(
                                        "px-2 py-0.5 rounded text-[11px] font-semibold capitalize",
                                        homework.status === 'pending' ? 'bg-amber-100 text-amber-800' :
                                        homework.status === 'submitted' ? 'bg-blue-100 text-blue-800' :
                                        homework.status === 'reviewed' ? 'bg-purple-100 text-purple-800' :
                                        homework.status === 'completed' ? 'bg-emerald-100 text-emerald-800' :
                                        'bg-rose-100 text-rose-800'
                                      )}>
                                        {homework.status}
                                      </span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      /* MODE 1: GROUPED BY TASK OR SINGLE TASK */
                      <div className="space-y-4">
                        {recordsGroupedByTask.map((group, gIdx) => (
                          <div key={group.task.task_id || gIdx} className="border border-border/80 rounded-xl overflow-hidden shadow-2xs">
                            <div className="bg-slate-50 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border/60">
                              <div className="flex items-center gap-2.5 flex-wrap">
                                <Badge className="font-mono text-xs bg-indigo-100 text-indigo-700 border-none font-bold">
                                  {group.task.task_id}
                                </Badge>
                                <h4 className="font-bold text-sm text-foreground">{group.task.task_name}</h4>
                                <Badge variant="outline" className="text-[11px] capitalize">
                                  {group.task.feedback_type}
                                </Badge>
                              </div>
                              <div className="text-xs text-muted-foreground flex items-center gap-3">
                                <span className="font-medium text-slate-600">{group.records.length} Students</span>
                                {group.task.deadline && (
                                  <span>Deadline: {new Date(group.task.deadline).toLocaleDateString()} {new Date(group.task.deadline).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true })}</span>
                                )}
                              </div>
                            </div>

                            <div className="p-3 space-y-2.5 bg-background">
                              {group.records.map((homework, idx) => (
                                <div key={homework.id} className="border border-border/60 rounded-lg p-3 space-y-2 hover:border-primary/30 transition-colors">
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="flex items-center gap-2">
                                      <span className="text-xs font-bold text-slate-400">{idx + 1}.</span>
                                      <h5 className="font-semibold text-foreground text-sm">
                                        {homework.student_name}
                                      </h5>
                                    </div>
                                    <span className={cn(
                                      "px-2 py-0.5 rounded text-xs font-semibold capitalize",
                                      homework.status === 'pending' ? 'bg-amber-100 text-amber-800' :
                                      homework.status === 'submitted' ? 'bg-blue-100 text-blue-800' :
                                      homework.status === 'reviewed' ? 'bg-purple-100 text-purple-800' :
                                      homework.status === 'completed' ? 'bg-emerald-100 text-emerald-800' :
                                      'bg-rose-100 text-rose-800'
                                    )}>
                                      {homework.status}
                                    </span>
                                  </div>

                                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs pt-0.5">
                                    <div>
                                      <span className="text-muted-foreground block text-[10px] uppercase font-bold">Task ID</span>
                                      <span className="font-mono font-medium text-slate-700">{homework.task_id || '-'}</span>
                                    </div>
                                    <div>
                                      <span className="text-muted-foreground block text-[10px] uppercase font-bold">Type</span>
                                      <span className="font-medium capitalize text-slate-700">{homework.feedback_type}</span>
                                    </div>
                                    <div>
                                      <span className="text-muted-foreground block text-[10px] uppercase font-bold">Deadline</span>
                                      <span className="font-medium text-slate-700">
                                        {homework.deadline ? (
                                        <>
                                          <span>{new Date(homework.deadline).toLocaleDateString()}</span>{' '}
                                          <span className="text-[10px] text-muted-foreground font-normal">
                                            {new Date(homework.deadline).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true })}
                                          </span>
                                        </>
                                      ) : '-'}
                                      </span>
                                    </div>
                                    <div>
                                      <span className="text-muted-foreground block text-[10px] uppercase font-bold">Earning</span>
                                      <span className={cn("font-bold", homework.status === 'completed' ? "text-emerald-600" : "text-muted-foreground")}>
                                        {homework.actual_earning} units
                                      </span>
                                    </div>
                                  </div>

                                  {homework.feedback_notes && (
                                    <div className="bg-muted/40 rounded p-2 text-xs">
                                      <p className="text-muted-foreground font-semibold">Notes:</p>
                                      <p className="text-foreground">{homework.feedback_notes}</p>
                                    </div>
                                  )}

                                  {homework.submission_link && (
                                    <div className="pt-2 border-t border-border flex flex-wrap gap-2">
                                      {parseSubmissionLinks(homework.submission_link).map((linkObj, lIdx) => (
                                        <a
                                          key={lIdx}
                                          href={linkObj.url}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="text-primary hover:underline text-xs flex items-center gap-1 bg-primary/5 hover:bg-primary/10 px-2.5 py-1 rounded-md font-medium"
                                        >
                                          {linkObj.label} <ExternalLink className="h-3 w-3" />
                                        </a>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}
            </fieldset>
            {/* Save Button for Page 1 */}
            {/* Removed - using main navigation buttons at bottom */}
          </div>
        )}



        {/* Page 2: Feedback & Closure */}
        {currentPage === 3 && (
          <div className="space-y-4">
            {!canEditCoordinatorSection && (
              <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-lg flex items-start gap-3">
                <Lock className="h-5 w-5 mt-0.5 flex-shrink-0 text-amber-600" />
                <div>
                  <p className="font-semibold text-sm">Coordinator Feedback is Locked (Read Only)</p>
                  <p className="text-xs mt-1 text-amber-700">
                    You are logged in as a {userRoleName}. Only Coordinators and Administrators can fill or edit this section.
                  </p>
                </div>
              </div>
            )}
            <fieldset disabled={!canEditCoordinatorSection || isFeedbackLocked} className={`space-y-4 border-0 p-0 m-0 ${!canEditCoordinatorSection || isFeedbackLocked ? 'pointer-events-none select-none opacity-85' : ''}`}>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Guest Teacher Feedback <span className="text-destructive">*</span></CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Label htmlFor="guest_teacher_feedback" className="text-sm">Feedback <span className="text-destructive">*</span></Label>
                  <RichTextEditor
                    value={formData.guest_teacher_feedback || ''}
                    onChange={(value) => setFormData(prev => ({ ...prev, guest_teacher_feedback: value }))}
                    placeholder="Feedback from guest teacher"
                    minHeight="120px"
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Feedback by Coordinator <span className="text-destructive">*</span></CardTitle>
              </CardHeader>
              <CardContent>
                <RichTextEditor
                  value={formData.incharge_reviewer_feedback || ''}
                  onChange={(value) => setFormData(prev => ({ ...prev, incharge_reviewer_feedback: value }))}
                  placeholder="Feedback from incharge or reviewer"
                  minHeight="120px"
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Coordinator Quality Ratings <span className="text-destructive">*</span></CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <Label className="text-sm font-medium">Mic/Sound Quality <span className="text-destructive">*</span></Label>
                    <Select
                      value={formData.coordinator_mic_sound_rating?.toString() || ''}
                      onValueChange={(val) => setFormData(prev => ({ ...prev, coordinator_mic_sound_rating: parseInt(val) } as any))}
                    >
                      <SelectTrigger className="mt-1"><SelectValue placeholder="Rate 1-10" /></SelectTrigger>
                      <SelectContent>
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => (
                          <SelectItem key={n} value={n.toString()}>{n}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-sm font-medium">Seating/View <span className="text-destructive">*</span></Label>
                    <Select
                      value={formData.coordinator_seating_view_rating?.toString() || ''}
                      onValueChange={(val) => setFormData(prev => ({ ...prev, coordinator_seating_view_rating: parseInt(val) } as any))}
                    >
                      <SelectTrigger className="mt-1"><SelectValue placeholder="Rate 1-10" /></SelectTrigger>
                      <SelectContent>
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => (
                          <SelectItem key={n} value={n.toString()}>{n}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-sm font-medium">Session Strength <span className="text-destructive">*</span></Label>
                    <Select
                      value={formData.coordinator_session_strength?.toString() || ''}
                      onValueChange={(val) => setFormData(prev => ({ ...prev, coordinator_session_strength: parseInt(val) } as any))}
                    >
                      <SelectTrigger className="mt-1"><SelectValue placeholder="Rate 1-10" /></SelectTrigger>
                      <SelectContent>
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => (
                          <SelectItem key={n} value={n.toString()}>{n}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>

            </fieldset>
            {/* Save Button for Page 3 */}
            {/* Removed - using main navigation buttons at bottom */}
          </div>
        )}

        {/* Page 2: Session Hours Tracker */}
        {currentPage === 2 && (
          <>
            {canEditSupervisorSection ? (
              <div className="space-y-4">
                {/* Sub-tabs for Hours Tracker */}
                <div className="flex justify-center gap-2 flex-wrap border-b border-border pb-4">
                  <button
                    onClick={() => setHoursSubTab('a')}
                    className={`px-3 py-1 rounded text-xs font-medium transition-colors ${hoursSubTab === 'a'
                      ? 'bg-blue-100 text-blue-700 border border-blue-300'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                  >
                    a) Volunteer Hours
                  </button>
                  <button
                    onClick={() => setHoursSubTab('b')}
                    className={`px-3 py-1 rounded text-xs font-medium transition-colors ${hoursSubTab === 'b'
                      ? 'bg-blue-100 text-blue-700 border border-blue-300'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                  >
                    b) Benevity ID
                  </button>
                </div>

                {/* Sub-tab a: Volunteer Hours */}
                {hoursSubTab === 'a' && (
                  <div className="space-y-4">
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">Volunteer Hours Tracking</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <Label htmlFor="plan_coordinate_hours" className="text-sm">Plan & Coordinate Hours <span className="text-destructive">*</span></Label>
                            <Input
                              id="plan_coordinate_hours"
                              type="number"
                              min="0"
                              step="0.5"
                              value={hoursData.plan_coordinate_hours}
                              onChange={(e) => {
                                const val = e.target.value;
                                setHoursData({ ...hoursData, plan_coordinate_hours: val === '' ? '' : parseFloat(val) } as any);
                              }}
                              placeholder="0.0"
                              className="mt-1"
                            />
                          </div>
                          <div>
                            <Label htmlFor="preparation_hours" className="text-sm">Preparation Hours <span className="text-destructive">*</span></Label>
                            <Input
                              id="preparation_hours"
                              type="number"
                              min="0"
                              step="0.5"
                              value={hoursData.preparation_hours}
                              onChange={(e) => {
                                const val = e.target.value;
                                setHoursData({ ...hoursData, preparation_hours: val === '' ? '' : parseFloat(val) } as any);
                              }}
                              placeholder="0.0"
                              className="mt-1"
                            />
                          </div>
                          <div>
                            <Label htmlFor="session_hours" className="text-sm">Session Hours <span className="text-destructive">*</span></Label>
                            <Input
                              id="session_hours"
                              type="number"
                              min="0"
                              step="0.5"
                              value={hoursData.session_hours}
                              onChange={(e) => {
                                const val = e.target.value;
                                setHoursData({ ...hoursData, session_hours: val === '' ? '' : parseFloat(val) } as any);
                              }}
                              placeholder="0.0"
                              className="mt-1"
                            />
                          </div>
                          <div>
                            <Label htmlFor="reflection_feedback_followup_hours" className="text-sm">Reflection & Feedback & Followup Hours <span className="text-destructive">*</span></Label>
                            <Input
                              id="reflection_feedback_followup_hours"
                              type="number"
                              min="0"
                              step="0.5"
                              value={hoursData.reflection_feedback_followup_hours}
                              onChange={(e) => {
                                const val = e.target.value;
                                setHoursData({ ...hoursData, reflection_feedback_followup_hours: val === '' ? '' : parseFloat(val) } as any);
                              }}
                              placeholder="0.0"
                              className="mt-1"
                            />
                          </div>
                        </div>

                        {/* Total Volunteering Time Display */}
                        <div className="bg-blue-50 border border-blue-200 rounded p-4">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                              <Label className="text-sm font-semibold">Total Volunteering Time</Label>
                              <p className="text-2xl font-bold text-blue-600 mt-2">
                                {(
                                  (hoursData.plan_coordinate_hours || 0) +
                                  (hoursData.preparation_hours || 0) +
                                  (hoursData.session_hours || 0) +
                                  (hoursData.reflection_feedback_followup_hours || 0)
                                ).toFixed(2)} hours
                              </p>
                            </div>
                            <div>
                              <Label className="text-sm font-semibold">Logged hours in Benevity?</Label>
                              <div className="flex items-center gap-4 mt-2">
                                <label 
                                  className={`flex items-center gap-2 px-3 py-1.5 rounded-md border cursor-pointer transition-colors ${
                                    hoursData.logged_hours_in_benevity === true 
                                      ? 'bg-emerald-50 border-emerald-500 text-emerald-700 font-semibold' 
                                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                                  }`}
                                >
                                  <input
                                    type="radio"
                                    name="logged_hours_in_benevity"
                                    value="yes"
                                    checked={hoursData.logged_hours_in_benevity === true}
                                    onChange={() => setHoursData({ ...hoursData, logged_hours_in_benevity: true })}
                                    className="w-4 h-4 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                                  />
                                  <span className="text-sm">Yes</span>
                                </label>

                                <label 
                                  className={`flex items-center gap-2 px-3 py-1.5 rounded-md border cursor-pointer transition-colors ${
                                    hoursData.logged_hours_in_benevity === false 
                                      ? 'bg-rose-50 border-rose-500 text-rose-700 font-semibold' 
                                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                                  }`}
                                >
                                  <input
                                    type="radio"
                                    name="logged_hours_in_benevity"
                                    value="no"
                                    checked={hoursData.logged_hours_in_benevity === false}
                                    onChange={() => setHoursData({ ...hoursData, logged_hours_in_benevity: false })}
                                    className="w-4 h-4 text-rose-600 focus:ring-rose-500 cursor-pointer"
                                  />
                                  <span className="text-sm">No</span>
                                </label>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Supervisor Feedback */}
                        <div>
                          <Label htmlFor="supervisor_feedback" className="text-sm">Supervisor Feedback <span className="text-muted-foreground text-xs font-normal">(Optional)</span></Label>
                          <Textarea
                            id="supervisor_feedback"
                            value={supervisorFeedback}
                            onChange={(e) => setSupervisorFeedback(e.target.value)}
                            placeholder="Add supervisor feedback, remarks, or observations about this session"
                            className="mt-1 min-h-[80px]"
                          />
                        </div>

                        {/* Notes */}
                        <div>
                          <Label htmlFor="hours_notes" className="text-sm">Notes <span className="text-destructive">*</span></Label>
                          <Textarea
                            id="hours_notes"
                            value={hoursData.notes}
                            onChange={(e) => setHoursData({ ...hoursData, notes: e.target.value })}
                            placeholder="Add any additional notes about the hours tracked"
                            className="mt-1 min-h-[80px]"
                          />
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                )}

                {/* Sub-tab b: Validation ID */}
                {hoursSubTab === 'b' && (
                  <div className="space-y-4">
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">Benevity ID</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div>
                          <Label htmlFor="hours_validation_id" className="text-sm">Benevity ID <span className="text-muted-foreground text-xs font-normal">(Optional)</span></Label>
                          <Input
                            id="hours_validation_id"
                            type="text"
                            value={hoursValidationId}
                            onChange={(e) => setHoursValidationId(e.target.value)}
                            placeholder="Enter Benevity ID number"
                            className="mt-1"
                          />
                          <p className="text-xs text-muted-foreground mt-2">Enter the Benevity ID for hours tracker verification</p>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                )}
              </div>
            ) : (
              <Card>
                <CardContent className="pt-6">
                  <div className="text-center space-y-4">
                    <Lock className="h-12 w-12 text-amber-500 mx-auto" />
                    <h2 className="text-xl font-bold">Session Hours Tracker Locked</h2>
                    <p className="text-muted-foreground text-sm">
                      You are logged in as a {userRoleName}. Session Hours Tracker can only be filled and edited by Supervisors and Administrators.
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}
        
        {/* Navigation Buttons */}
        <div className="flex gap-3 justify-between">
          <Button
            variant="outline"
            onClick={() => navigate('/feedback')}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>

          <div className="flex gap-2">
            {currentPage === 1 && currentSubTab !== 'a' && (
              <Button
                variant="outline"
                onClick={handlePreviousPage}
                className="gap-2"
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </Button>
            )}

            {/* Next buttons */}
            {currentPage === 1 && currentSubTab !== 'c' && (
              <Button
                onClick={handleNextPage}
                variant="outline"
                className="gap-2"
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
            )}
            {currentPage === 1 && currentSubTab === 'c' && userRole === 1 && (
              <Button
                onClick={handleNextPage}
                variant="outline"
                className="gap-2"
              >
                Next (Coordinator)
                <ChevronRight className="h-4 w-4" />
              </Button>
            )}
            {currentPage === 3 && userRole === 1 && (
              <Button
                onClick={handleNextPage}
                variant="outline"
                className="gap-2"
              >
                Next (Supervisor)
                <ChevronRight className="h-4 w-4" />
              </Button>
            )}

            {/* Save Buttons - Only show for authorized role */}
            {currentPage === 1 && canEditFacilitatorSection && (
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleAutoSaveDraft(formData, true)}
                  disabled={draftSaving || saving || isFeedbackLocked}
                  className="gap-2 border-slate-300 dark:border-slate-700 hover:bg-slate-100"
                  title="Save partial work as draft in browser cache & database without mandatory checks"
                >
                  {draftSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4 text-slate-600" />}
                  <span>Save Draft</span>
                </Button>
                <Button
                  onClick={handleSaveFeedback}
                  disabled={saving || isFeedbackLocked}
                  className="gap-2 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold"
                >
                  <Save className="h-4 w-4" />
                  {saving ? 'Saving...' : 'Save & Submit'}
                </Button>
              </div>
            )}

            {currentPage === 2 && canEditSupervisorSection && (
              <Button
                onClick={handleSaveHoursTracker}
                disabled={saving || isFeedbackLocked}
                className="gap-2"
              >
                <Save className="h-4 w-4" />
                {saving ? 'Saving...' : 'Save Hours'}
              </Button>
            )}

            {currentPage === 3 && canEditCoordinatorSection && (
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleAutoSaveDraft(formData, true)}
                  disabled={draftSaving || saving || isFeedbackLocked}
                  className="gap-2 border-slate-300 dark:border-slate-700 hover:bg-slate-100"
                  title="Save partial work as draft in browser cache & database"
                >
                  {draftSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4 text-slate-600" />}
                  <span>Save Draft</span>
                </Button>
                <Button
                  onClick={handleSaveFeedback}
                  disabled={saving || isFeedbackLocked}
                  className="gap-2"
                >
                  <Save className="h-4 w-4" />
                  {saving ? 'Saving...' : 'Save & Complete'}
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}






