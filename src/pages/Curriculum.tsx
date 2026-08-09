import { useState, useEffect } from 'react';
import { Trash2, Upload, MoreVertical, Plus, Search, ListTodo, RefreshCcw, ExternalLink } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { TruncatedText } from '@/components/ui/truncated-text';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAcademicYear } from '@/contexts/AcademicYearContext';
import { UnifiedImportDialog } from '@/components/sessions/UnifiedImportDialog';
import { ExportCurriculumDialog } from '@/components/curriculum/ExportCurriculumDialog';
import { AddTopicDialog } from '@/components/curriculum/AddTopicDialog';
import { EditCurriculumDialog } from '@/components/curriculum/EditCurriculumDialog';
import { EditCategoryModuleTopicDialog } from '@/components/curriculum/EditCategoryModuleTopicDialog';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Download } from 'lucide-react';
import * as XLSX from 'xlsx';

interface RawCurriculumData {
  id: string;
  content_category: string;
  module_no: number;
  module_name: string;
  topics_covered: string;
  videos: string;
  quiz_content_ppt: string;
  fresh_session?: string;
  revision_session?: string;
  created_at?: string;
  updated_at?: string;
}

interface CurriculumItem {
  id: string;
  content_category: string;
  module_code: string;
  module_title: string;
  topic_title: string;
  videos: string;
  quiz_content_ppt: string;
  fresh_session?: string;
  revision_session?: string;
  created_at?: string;
  updated_at?: string;
  class_id?: string;
  subject_id?: string;
  subject_name?: string;
}

interface ExpandedSession {
  itemId: string;
  type: 'fresh' | 'revision';
}

interface Class {
  id: string;
  name: string;
}

interface SessionInfo {
  fresh_count: number;
  revision_count: number;
  fresh_status?: string;
  revision_status?: string;
  session_date?: string;
  volunteer_name?: string;
  fresh_sessions?: Array<{ id: string; date: string; volunteer: string; status: string }>;
  revision_sessions?: Array<{ id: string; date: string; volunteer: string; status: string }>;
  session_types: Set<string>;
}

const isSubjectHiddenInPublic = (name: string) => {
  if (!name) return false;
  const lower = name.toLowerCase().trim();
  return (
    lower.includes('certified computer') ||
    lower.includes('english')
  );
};

const getDisplaySubjectName = (name: string) => {
  if (!name) return name;
  const lower = name.toLowerCase().trim();
  if (lower.includes('certified computer') || lower.includes('computer course')) {
    return '1. Certified Computer Course (CCC)';
  }
  if (lower.includes('english') || lower.includes('soft skill')) {
    return '2. English Com and Soft Skill';
  }
  if (lower.includes('artificial intelligence')) {
    return '3.1 Artificial Intelligence (Main)';
  }
  if (lower.includes('python')) {
    return '3.2 Python (Specialization)';
  }
  if (lower.includes('cybersecurity') || lower.includes('cyber security') || lower.includes('cyber')) {
    return '3.3 Cybersecurity (Specialization)';
  }
  return name;
};

const getSubjectSortOrder = (name: string): number => {
  if (!name) return 99;
  const lower = name.toLowerCase().trim();
  if (lower.includes('certified computer') || lower.includes('computer course')) return 1;
  if (lower.includes('english') || lower.includes('soft skill')) return 2;
  if (lower.includes('artificial intelligence')) return 3;
  if (lower.includes('python')) return 4;
  if (lower.includes('cybersecurity') || lower.includes('cyber security') || lower.includes('cyber')) return 5;
  return 99;
};

export default function Curriculum({ isStudent = false }: { isStudent?: boolean }) {
  const { user } = useAuth();
  const [curriculum, setCurriculum] = useState<CurriculumItem[]>([]);
  const [filteredCurriculum, setFilteredCurriculum] = useState<CurriculumItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [isAddTopicOpen, setIsAddTopicOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isEditCategoryModuleTopicOpen, setIsEditCategoryModuleTopicOpen] = useState(false);
  const [userRole, setUserRole] = useState<number | null>(null);
  const [publicVolunteerSearch, setPublicVolunteerSearch] = useState('');
  const [allVolunteerNames, setAllVolunteerNames] = useState<string[]>([]);
  const [showVolunteerSuggestions, setShowVolunteerSuggestions] = useState(false);

  useEffect(() => {
    const fetchAllVolunteers = async () => {
      try {
        const { data: volData } = await supabase
          .from('volunteers')
          .select('name')
          .order('name', { ascending: true });

        const { data: sessData } = await supabase
          .from('sessions')
          .select('volunteer_name')
          .not('volunteer_name', 'is', null);

        const namesSet = new Set<string>();
        (volData || []).forEach((v: any) => {
          if (v.name && v.name.trim()) namesSet.add(v.name.trim());
        });
        (sessData || []).forEach((s: any) => {
          if (s.volunteer_name && s.volunteer_name.trim()) namesSet.add(s.volunteer_name.trim());
        });

        setAllVolunteerNames(Array.from(namesSet).sort((a, b) => a.localeCompare(b)));
      } catch (err) {
        console.error('Error fetching volunteer names for search:', err);
      }
    };

    fetchAllVolunteers();
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const container = document.getElementById('volunteer-search-container');
      if (container && !container.contains(e.target as Node)) {
        setShowVolunteerSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const matchingVolunteerSuggestions = publicVolunteerSearch.trim()
    ? allVolunteerNames.filter(name =>
        name.toLowerCase().includes(publicVolunteerSearch.toLowerCase().trim())
      )
    : [];

  useEffect(() => {
    const fetchUserRole = async () => {
      if (!user) return;
      try {
        const { data } = await supabase
          .from('user_profiles')
          .select('role_id')
          .eq('id', user.id)
          .maybeSingle();
        if (data?.role_id) {
          setUserRole(data.role_id);
        } else if (user.email) {
          const { data: emailData } = await supabase
            .from('user_profiles')
            .select('role_id')
            .eq('email', user.email)
            .maybeSingle();
          if (emailData?.role_id) {
            setUserRole(emailData.role_id);
          }
        }
      } catch (err) {
        console.error('Error fetching user role:', err);
      }
    };
    fetchUserRole();
  }, [user]);

  const isAdmin = userRole === 1;
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<CurriculumItem | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedClass, setSelectedClass] = useState<string>('');
  const [selectedSubject, setSelectedSubject] = useState<string>('');
  const [selectedModule, setSelectedModule] = useState<string>('all');
  const [selectedTopic, setSelectedTopic] = useState<string>('all');
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [newStatus, setNewStatus] = useState<string>('');
  const [categories, setCategories] = useState<string[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [modules, setModules] = useState<string[]>([]);
  const [topics, setTopics] = useState<string[]>([]);
  const [sessionInfo, setSessionInfo] = useState<Record<string, SessionInfo>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedSessions, setExpandedSessions] = useState<Set<string>>(new Set());
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sessionTypeFilter, setSessionTypeFilter] = useState<string>('all');
  const [sessionCategoryFilter, setSessionCategoryFilter] = useState<string>('all');
  const [sortColumn, setSortColumn] = useState<keyof CurriculumItem | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc' | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const { selectedYear, getDateRange } = useAcademicYear();
  const isPublic = !user;

  const getFilteredSessions = (sessions?: Array<{ id: string; date: string; volunteer: string; status: string }>) => {
    if (!sessions) return [];
    if (!isPublic || !publicVolunteerSearch.trim()) return sessions;
    const search = publicVolunteerSearch.toLowerCase().trim();
    return sessions.filter(s => s.volunteer.toLowerCase().includes(search));
  };

  // Calculate statistics
  const stats = (() => {
    let subjectBaseCurriculum = curriculum;
    if (isPublic) {
      subjectBaseCurriculum = subjectBaseCurriculum.filter(item => !isSubjectHiddenInPublic(item.subject_name || ''));
    }
    if (selectedSubject && selectedSubject !== 'all') {
      subjectBaseCurriculum = subjectBaseCurriculum.filter(item => item.subject_id === selectedSubject);
    }

    if (subjectBaseCurriculum.length === 0) return { fresh: 0, revision: 0, total: 0, freshCount: 0, revisionCount: 0 };
    
    let freshCompleted = 0;
    let revisionCompleted = 0;
    
    subjectBaseCurriculum.forEach(item => {
      const info = sessionInfo[item.topic_title];
      if (info) {
        const fresh = getFilteredSessions(info.fresh_sessions);
        if (fresh.some(s => s.status === 'completed')) freshCompleted++;
        const revision = getFilteredSessions(info.revision_sessions);
        if (revision.some(s => s.status === 'completed')) revisionCompleted++;
      }
    });

    const total = subjectBaseCurriculum.length;
    return {
      fresh: total > 0 ? Number(((freshCompleted / total) * 100).toFixed(1)) : 0,
      revision: total > 0 ? Number(((revisionCompleted / total) * 100).toFixed(1)) : 0,
      total,
      freshCount: freshCompleted,
      revisionCount: revisionCompleted
    };
  })();

  const subjectStats = (() => {
    const subjectsMap: Record<string, { total: number, fresh: number, revision: number, name: string }> = {};
    
    curriculum.forEach(item => {
      const sId = item.subject_id || 'unknown';
      if (!subjectsMap[sId]) {
        subjectsMap[sId] = { total: 0, fresh: 0, revision: 0, name: item.subject_name || 'Unknown' };
      }
      subjectsMap[sId].total++;
      
      const info = sessionInfo[item.topic_title];
      if (info) {
        if (info.fresh_sessions?.some(s => s.status === 'completed')) subjectsMap[sId].fresh++;
        if (info.revision_sessions?.some(s => s.status === 'completed')) subjectsMap[sId].revision++;
      }
    });
    
    return Object.values(subjectsMap);
  })();

  const rawSubjectName = selectedSubject && selectedSubject !== 'all'
    ? subjects.find((s) => s.id === selectedSubject)?.name || ''
    : 'All Subjects Included';
  const currentSubjectName = getDisplaySubjectName(rawSubjectName);

  const handleColumnSort = (column: keyof CurriculumItem) => {
    if (sortColumn === column) {
      if (sortDirection === 'asc') {
        setSortDirection('desc');
      } else if (sortDirection === 'desc') {
        setSortColumn(null);
        setSortDirection(null);
      }
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const getSortIndicator = (column: keyof CurriculumItem) => {
    if (sortColumn !== column) return '↕';
    if (sortDirection === 'asc') return '↑';
    if (sortDirection === 'desc') return '↓';
    return '↕';
  };

  useEffect(() => {
    if (isStudent) {
      if (user?.email) fetchClasses();
    } else {
      fetchClasses();
    }
  }, [isStudent, user?.email]);

  useEffect(() => {
    // When class changes, fetch subjects for that class & reset subject filter
    if (selectedClass) {
      fetchSubjects(selectedClass);
      setSelectedSubject('');
      setSelectedCategory('all');
      fetchCurriculum(selectedClass);
      fetchSessionInfo(selectedClass);
    } else {
      setCurriculum([]);
      setFilteredCurriculum([]);
      setSessionInfo({});
      setSubjects([]);
    }
  }, [selectedClass, selectedYear]);

  useEffect(() => {
    let source = curriculum;
    if (selectedSubject && selectedSubject !== 'all') {
      source = source.filter((item) => item.subject_id === selectedSubject);
    }
    const uniqueCategories = [...new Set(source.map((item) => item.content_category))].sort();
    setCategories(uniqueCategories as string[]);
    // Reset category if current selection is no longer valid
    if (selectedCategory !== 'all' && !uniqueCategories.includes(selectedCategory)) {
      setSelectedCategory('all');
    }
  }, [selectedSubject, curriculum]);

  // Auto-select subject when volunteer searches their name in public mode
  useEffect(() => {
    if (isPublic && publicVolunteerSearch.trim()) {
      const search = publicVolunteerSearch.toLowerCase().trim();
      const volunteerSubjectIds = new Set<string>();
      
      curriculum.forEach(item => {
        const info = sessionInfo[item.topic_title];
        if (info) {
          const hasFresh = info.fresh_sessions?.some(s => s.volunteer.toLowerCase().includes(search));
          const hasRevision = info.revision_sessions?.some(s => s.volunteer.toLowerCase().includes(search));
          if (hasFresh || hasRevision) {
            if (item.subject_id) volunteerSubjectIds.add(item.subject_id);
          }
        }
      });

      // If we found exactly one subject (or more), auto-select the first one
      if (volunteerSubjectIds.size > 0) {
        const firstSubject = Array.from(volunteerSubjectIds)[0];
        // Only auto-select if it's currently on 'all' or empty, so we don't override manual selections
        if (!selectedSubject || selectedSubject === 'all') {
           setSelectedSubject(firstSubject);
        }
      }
    }
  }, [publicVolunteerSearch, isPublic, curriculum, sessionInfo]);

  useEffect(() => {
    let filtered = curriculum;
    
    if (isPublic) {
      filtered = filtered.filter((item) => !isSubjectHiddenInPublic(item.subject_name || ''));
    }
    
    if (selectedSubject && selectedSubject !== 'all') {
      filtered = filtered.filter((item) => item.subject_id === selectedSubject);
    }

    if (selectedCategory !== 'all') {
      filtered = filtered.filter((item) => item.content_category === selectedCategory);
    }

    if (selectedModule !== 'all') {
      filtered = filtered.filter((item) => item.module_title === selectedModule);
    }

    if (selectedTopic !== 'all') {
      filtered = filtered.filter((item) => item.topic_title === selectedTopic);
    }

    // Filter by status
    if (statusFilter !== 'all') {
      filtered = filtered.filter((item) => {
        const info = sessionInfo[item.topic_title];
        if (statusFilter === 'fresh') {
          return info?.fresh_status === statusFilter || info?.fresh_count > 0;
        } else if (statusFilter === 'revision') {
          return info?.revision_status === statusFilter || info?.revision_count > 0;
        }
        return info?.fresh_status === statusFilter || info?.revision_status === statusFilter;
      });
    }

    // Filter by session type (Fresh or Revision)
    if (sessionTypeFilter !== 'all') {
      filtered = filtered.filter((item) => {
        const info = sessionInfo[item.topic_title];
        if (sessionTypeFilter === 'fresh') {
          return info?.fresh_count > 0;
        } else if (sessionTypeFilter === 'revision') {
          return info?.revision_count > 0;
        }
        return true;
      });
    }

    // Filter by session category (GT/GS/LT)
    if (sessionCategoryFilter !== 'all') {
      filtered = filtered.filter((item) => {
        const info = sessionInfo[item.topic_title];
        // Check if there are ANY sessions of the selected type for this topic
        return (info as any)?.session_types?.has(sessionCategoryFilter);
      });
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter((item) => {
        const info = sessionInfo[item.topic_title];
        return (
          item.content_category?.toLowerCase().includes(q) ||
          item.module_code?.toLowerCase().includes(q) ||
          item.module_title?.toLowerCase().includes(q) ||
          item.topic_title?.toLowerCase().includes(q) ||
          item.videos?.toLowerCase().includes(q) ||
          item.quiz_content_ppt?.toLowerCase().includes(q) ||
          item.subject_name?.toLowerCase().includes(q) ||
          info?.volunteer_name?.toLowerCase().includes(q) ||
          info?.fresh_status?.toLowerCase().includes(q) ||
          info?.revision_status?.toLowerCase().includes(q)
        );
      });
    }
    
    // Filter by volunteer search
    if (publicVolunteerSearch.trim()) {
      const search = publicVolunteerSearch.toLowerCase().trim();
      filtered = filtered.filter(item => {
        const info = sessionInfo[item.topic_title];
        if (!info) return false;
        const hasFresh = info.fresh_sessions?.some(s => s.volunteer.toLowerCase().includes(search));
        const hasRevision = info.revision_sessions?.some(s => s.volunteer.toLowerCase().includes(search));
        return Boolean(hasFresh || hasRevision);
      });
    }
    
    // Apply column sorting
    if (sortColumn && sortDirection) {
      filtered = [...filtered].sort((a, b) => {
        const aValue = a[sortColumn];
        const bValue = b[sortColumn];

        // Handle null/undefined values
        if (aValue == null && bValue == null) return 0;
        if (aValue == null) return sortDirection === 'asc' ? 1 : -1;
        if (bValue == null) return sortDirection === 'asc' ? -1 : 1;

        // String comparison (case-insensitive)
        if (typeof aValue === 'string' && typeof bValue === 'string') {
          const comparison = aValue.toLowerCase().localeCompare(bValue.toLowerCase());
          return sortDirection === 'asc' ? comparison : -comparison;
        }

        // Number comparison
        if (typeof aValue === 'number' && typeof bValue === 'number') {
          return sortDirection === 'asc' ? aValue - bValue : bValue - aValue;
        }

        return 0;
      });
    }
    
    setFilteredCurriculum(filtered);
  }, [selectedCategory, selectedSubject, selectedModule, selectedTopic, curriculum, searchQuery, sessionInfo, statusFilter, sessionTypeFilter, sortColumn, sortDirection, isPublic, publicVolunteerSearch]);

  const fetchCurriculum = async (classId?: string) => {
    try {
      setLoading(true);

      // Filter by class_id - fetch all subjects
      let query: any = supabase
        .from('curriculum')
        .select(`
          *,
          subjects:subject_id(id, name)
        `)
        .order('content_category', { ascending: true })
        .order('module_no', { ascending: true });

      if (classId) {
        query = query.eq('class_id', classId);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Fetch error:', error);
        throw error;
      }

      const formattedData = (data as any[] || []).map((item) => {
        // Remove leading "- " from module_name if present
        const cleanModuleTitle = item.module_name?.replace(/^-\s+/, '') || '';
        return {
          id: item.id,
          content_category: item.content_category || '',
          module_code: item.module_no?.toString() || '',
          module_title: cleanModuleTitle,
          topic_title: item.topics_covered || '',
          videos: item.videos || '',
          quiz_content_ppt: item.quiz_content_ppt || '',
          fresh_session: item.fresh_session || '',
          revision_session: item.revision_session || '',
          created_at: item.created_at,
          updated_at: item.updated_at,
          class_id: item.class_id,
          subject_id: item.subject_id,
          subject_name: item.subjects?.name || 'Artificial Intelligence',
        };
      });

      setCurriculum(formattedData);
    } catch (error) {
      console.error('Error fetching curriculum:', error);
      toast.error('Failed to load curriculum');
    } finally {
      setLoading(false);
    }
  };

  const fetchClasses = async () => {
    try {
      const { data, error } = await (supabase as any)
        .from('classes')
        .select('id, name')
        .order('name', { ascending: true });

      if (error) throw error;
      const classList = data || [];
      setClasses(classList);

      if (isStudent && user?.email) {
        const { data: student } = await supabase
          .from('students')
          .select('class_id')
          .ilike('email', user.email)
          .limit(1)
          .maybeSingle();
        if (student?.class_id) {
          setSelectedClass(student.class_id);
          return;
        }
      }

      // Auto-select "WES Fellows" class if available
      if (!selectedClass) {
        const wesFellows = classList.find((c: Class) =>
          c.name.toLowerCase().includes('wes fellow')
        );
        if (wesFellows) {
          setSelectedClass(wesFellows.id);
        } else if (classList.length > 0) {
          setSelectedClass(classList[0].id);
        }
      }
    } catch (error) {
      console.error('Error fetching classes:', error);
      toast.error('Failed to load classes');
    }
  };

  const fetchSubjects = async (classId?: string) => {
    try {
      let subjectsList: any[] = [];

      if (classId) {
        // Fetch only subjects assigned to the selected class's curriculum
        const { data: currSubjects, error: currErr } = await supabase
          .from('curriculum')
          .select('subject_id, subjects:subject_id(id, name, description)')
          .eq('class_id', classId);

        if (!currErr && currSubjects && currSubjects.length > 0) {
          const subMap = new Map<string, any>();
          currSubjects.forEach((item: any) => {
            if (item.subjects && item.subjects.id) {
              subMap.set(item.subjects.id, item.subjects);
            }
          });
          subjectsList = Array.from(subMap.values());
        }
      }

      // Fallback if no classId or no curriculum records for classId
      if (subjectsList.length === 0) {
        const { data, error } = await supabase
          .from('subjects')
          .select('id, name, description');
        if (!error && data) {
          subjectsList = data;
        }
      }

      // Sort by custom subject sequence
      subjectsList.sort((a, b) => getSubjectSortOrder(a.name) - getSubjectSortOrder(b.name));

      setSubjects(subjectsList);
    } catch (error) {
      console.warn('Error fetching subjects:', error);
      setSubjects([]);
    }
  };

  const fetchSessionInfo = async (classId?: string) => {
    try {
      // Only fetch if a class is selected
      if (!classId) {
        setSessionInfo({});
        return;
      }

      // Get the class name from the selected class ID
      const selectedClassObj = classes.find(c => c.id === classId);
      if (!selectedClassObj) {
        setSessionInfo({});
        return;
      }

      // Fetch sessions filtered by class_batch (class name) and academic year
      const { startDate, endDate } = getDateRange();
      const { data: sessions, error } = await supabase
        .from('sessions')
        .select('id, topics_covered, session_type_option, session_type, status, session_date, volunteer_name, content_category, class_batch')
        .eq('class_batch', selectedClassObj.name)
        .gte('session_date', startDate.toISOString().split('T')[0])
        .lte('session_date', endDate.toISOString().split('T')[0]);

      if (error) throw error;

      const sessionMap: Record<string, SessionInfo> = {};

      // Group sessions by topic
      (sessions as any[])?.forEach((session: any) => {
        const topic = session.topics_covered;
        if (!topic) return;

        if (!sessionMap[topic]) {
          sessionMap[topic] = {
            fresh_count: 0,
            revision_count: 0,
            fresh_sessions: [],
            revision_sessions: [],
            session_types: new Set<string>(),
          };
        }

        const info = sessionMap[topic];
        if (session.session_type) {
          info.session_types.add(session.session_type);
        }

        const sessionDetail = {
          id: session.id,
          date: session.session_date ? new Date(session.session_date).toLocaleDateString() : 'N/A',
          volunteer: session.volunteer_name || 'N/A',
          status: session.status || 'pending',
        };

        if (session.session_type_option === 'fresh') {
          sessionMap[topic].fresh_count += 1;
          sessionMap[topic].fresh_status = session.status;
          sessionMap[topic].fresh_sessions?.push(sessionDetail);
          if (!sessionMap[topic].session_date) {
            sessionMap[topic].session_date = session.session_date;
          }
          if (!sessionMap[topic].volunteer_name) {
            sessionMap[topic].volunteer_name = session.volunteer_name;
          }
        } else if (session.session_type_option === 'revision') {
          sessionMap[topic].revision_count += 1;
          sessionMap[topic].revision_status = session.status;
          sessionMap[topic].revision_sessions?.push(sessionDetail);
          if (!sessionMap[topic].session_date) {
            sessionMap[topic].session_date = session.session_date;
          }
          if (!sessionMap[topic].volunteer_name) {
            sessionMap[topic].volunteer_name = session.volunteer_name;
          }
        }
      });

      setSessionInfo(sessionMap);
    } catch (error) {
      console.error('Error fetching session info:', error);
    }
  };

  const handleDelete = async (id: string) => {
    if (!selectedItem) return;

    try {
      const { error } = await supabase
        .from('curriculum')
        .delete()
        .eq('id', id);

      if (error) throw error;
      toast.success('Curriculum item deleted successfully');
      setCurriculum(curriculum.filter((item) => item.id !== id));
    } catch (error) {
      console.error('Error deleting curriculum:', error);
      toast.error('Failed to delete curriculum item');
    } finally {
      setDeleteDialogOpen(false);
      setSelectedItem(null);
    }
  };

  const handleEditStatus = async () => {
    if (!selectedItem || !newStatus || !selectedClass) return;

    try {
      const selectedClassObj = classes.find(c => c.id === selectedClass);
      if (!selectedClassObj) {
        toast.error('Class not found');
        return;
      }

      // Update all sessions with matching topic and class
      const { error } = await supabase
        .from('sessions')
        .update({ status: newStatus })
        .eq('topics_covered', selectedItem.topic_title)
        .eq('class_batch', selectedClassObj.name);

      if (error) throw error;

      toast.success(`Updated status to "${newStatus}" for all sessions with this topic`);
      setStatusDialogOpen(false);
      setNewStatus('');
      setSelectedItem(null);
      
      // Refresh session info
      fetchSessionInfo(selectedClass);
    } catch (error) {
      console.error('Error updating session status:', error);
      toast.error('Failed to update session status');
    }
  };

  const handleManualSync = async () => {
    setIsSyncing(true);
    const toastId = toast.loading('Triggering Google Sheets sync...');
    try {
      // Call the edge function directly from the frontend
      const { data, error } = await supabase.functions.invoke('sync-sessions-to-sheet', {
        method: 'POST',
      });
      
      if (error) throw error;
      
      toast.success('Success! Google Sheets updated successfully.', { id: toastId });
    } catch (error: any) {
      console.error('Error triggering sync:', error);
      toast.error(error.message || 'Failed to trigger sync. Please ensure the edge function is deployed.', { id: toastId });
    } finally {
      setIsSyncing(false);
    }
  };

  const handlePublicExport = (format: 'csv' | 'xlsx') => {
    const headers = [
      'Class Name',
      'Content Category',
      'Module No',
      'Module Name',
      'Topic Title',
      'Videos',
      'Quiz/Content/PPT',
      'Fresh Session',
      'Revision Session',
      'Status',
      'Session Scheduled Date',
      'Latest Date',
      'Volunteer'
    ];

    const dataRows: string[][] = [];
    const className = classes.find(c => c.id === selectedClass)?.name || 'Unknown';

    filteredCurriculum.forEach(item => {
      const info = sessionInfo[item.topic_title];
      let status = 'Not Started';
      let latestDate = '-';
      let sessionScheduledDate = '-';
      let volunteerName = '-';
      let userSessions: any[] = [];
      
      if (info) {
        const search = publicVolunteerSearch.toLowerCase().trim();
        if (search) {
           const fresh = info.fresh_sessions?.filter((s: any) => s.volunteer.toLowerCase().includes(search)) || [];
           const revision = info.revision_sessions?.filter((s: any) => s.volunteer.toLowerCase().includes(search)) || [];
           userSessions = [...fresh, ...revision];
        } else {
           userSessions = [...(info.fresh_sessions || []), ...(info.revision_sessions || [])];
        }
      }

      if (userSessions.length > 0) {
        // Sort sessions by date descending
        userSessions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        const completed = userSessions.find(s => s.status === 'completed');
        if (completed) {
          status = 'Completed';
          latestDate = completed.date;
          volunteerName = completed.volunteer;
        } else {
          const latest = userSessions[0];
          status = latest.status.charAt(0).toUpperCase() + latest.status.slice(1).replace('_', ' ');
          sessionScheduledDate = latest.date; // Use as scheduled date
          volunteerName = latest.volunteer;
        }
      }

      dataRows.push([
        className,
        item.content_category || '',
        item.module_code || '',
        item.module_title || '',
        item.topic_title || '',
        item.videos || '',
        item.quiz_content_ppt || '',
        item.fresh_session || '',
        item.revision_session || '',
        status,
        sessionScheduledDate,
        latestDate,
        volunteerName
      ]);
    });

    const volunteerName = publicVolunteerSearch.trim() ? publicVolunteerSearch.trim().replace(/\s+/g, '_') : 'All';
    const fileName = `My_Progress_${volunteerName}`;

    if (format === 'csv') {
      const escapeCsv = (val: any) => {
        if (val === null || val === undefined) return '';
        const str = String(val);
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      };

      const csvRows = [headers.join(','), ...dataRows.map(row => row.map(escapeCsv).join(','))];
      const csvContent = csvRows.join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `${fileName}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else if (format === 'xlsx') {
      const worksheet = XLSX.utils.aoa_to_sheet([headers, ...dataRows]);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Progress');
      XLSX.writeFile(workbook, `${fileName}.xlsx`);
    }

    toast.success(`Progress exported as ${format.toUpperCase()} successfully!`);
  };

  const LayoutWrapper = isPublic ? 
    ({ children }: { children: React.ReactNode }) => (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <header className="bg-white border-b border-gray-200 px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-primary">Curriculum Completion Tracker</h1>
            <p className="text-sm text-gray-500 mt-1">Search your name to view your progress</p>
          </div>
          <div className="flex items-center gap-4 flex-wrap">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleManualSync} 
              disabled={isSyncing}
              className="gap-2 border-green-200 hover:bg-green-50 text-green-700 bg-white"
            >
              <RefreshCcw className={`h-4 w-4 ${isSyncing ? 'animate-spin' : ''}`} />
              {isSyncing ? 'Syncing...' : 'Sync to Sheets'}
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => window.open('https://docs.google.com/spreadsheets/d/1qWIjOraFCWwMLNz2EA_LZjVtrO9iezln_kf5AmO1YKQ/edit?usp=sharing', '_blank')}
              className="gap-2 border-primary/20 hover:bg-primary/5 text-primary bg-white"
            >
              <ExternalLink className="h-4 w-4" />
              View Format
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2 border-primary/20 hover:bg-primary/5 text-primary bg-white">
                  <Download className="h-4 w-4" />
                  Export My Progress
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => handlePublicExport('xlsx')} className="cursor-pointer">
                  Export as Excel (.xlsx)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handlePublicExport('csv')} className="cursor-pointer">
                  Export as CSV
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        <main className="flex-1 w-full p-4 md:p-8 max-w-7xl mx-auto overflow-x-hidden">
          {children}
        </main>
      </div>
    ) : DashboardLayout;

  return (
    <LayoutWrapper>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-foreground">📚 Curriculum</h1>
            <p className="text-sm md:text-base text-muted-foreground mt-1">
              Manage curriculum content
            </p>
          </div>
          {!isStudent && !isPublic && (
            <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
              <div className="flex flex-col sm:flex-row gap-2 mt-2 sm:mt-0 w-full sm:w-auto">
                <Button 
                  variant="outline" 
                  onClick={handleManualSync} 
                  disabled={isSyncing}
                  className="gap-2 shrink-0 h-10 border-green-200 hover:bg-green-50 text-green-700"
                >
                  <RefreshCcw className={`h-4 w-4 ${isSyncing ? 'animate-spin' : ''}`} />
                  {isSyncing ? 'Syncing...' : 'Sync to Sheets'}
                </Button>
                <Button 
                  variant="outline" 
                  onClick={() => window.open('https://docs.google.com/spreadsheets/d/1qWIjOraFCWwMLNz2EA_LZjVtrO9iezln_kf5AmO1YKQ/edit?usp=sharing', '_blank')}
                  className="gap-2 shrink-0 h-10 border-primary/20 hover:bg-primary/5"
                >
                  <ExternalLink className="h-4 w-4" />
                  View Format
                </Button>
                <Button variant="outline" onClick={() => setIsExportOpen(true)} className="gap-2 shrink-0 h-10 border-primary/20 hover:bg-primary/5">
                  <Upload className="h-4 w-4 rotate-180" />
                  Export Report
                </Button>
                <Button variant="outline" onClick={() => setIsImportOpen(true)} className="gap-2 shrink-0 h-10 border-primary/20 hover:bg-primary/5">
                  <Upload className="h-4 w-4" />
                  Import Curriculum
                </Button>
                <Button onClick={() => setIsAddTopicOpen(true)} className="gap-2 shrink-0 h-10">
                  <Plus className="h-4 w-4" />
                  Add Topic
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Stats Dashboard */}
        {selectedClass && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="bg-white border-blue-100 shadow-sm overflow-hidden border-l-4 border-l-blue-500">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-bold text-blue-600 uppercase tracking-widest">{currentSubjectName} Fresh</p>
                    <h3 className="text-3xl font-black text-slate-900 mt-1">{stats.fresh}%</h3>
                    <div className="flex items-center gap-1.5 mt-1">
                      <div className="h-1.5 w-24 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-500" style={{ width: `${stats.fresh}%` }} />
                      </div>
                      <p className="text-[10px] text-slate-500 font-bold">{stats.freshCount}/{stats.total}</p>
                    </div>
                  </div>
                  <div className="h-12 w-12 rounded-full bg-blue-50 flex items-center justify-center">
                    <span className="text-xl">✅</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-white border-purple-100 shadow-sm overflow-hidden border-l-4 border-l-purple-500">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-bold text-purple-600 uppercase tracking-widest">{currentSubjectName} Revision</p>
                    <h3 className="text-3xl font-black text-slate-900 mt-1">{stats.revision}%</h3>
                    <div className="flex items-center gap-1.5 mt-1">
                      <div className="h-1.5 w-24 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-purple-500" style={{ width: `${stats.revision}%` }} />
                      </div>
                      <p className="text-[10px] text-slate-500 font-bold">{stats.revisionCount}/{stats.total}</p>
                    </div>
                  </div>
                  <div className="h-12 w-12 rounded-full bg-purple-50 flex items-center justify-center">
                    <span className="text-xl">🔄</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-white border-slate-100 shadow-sm overflow-hidden border-l-4 border-l-slate-400">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Total Topics</p>
                    <h3 className="text-3xl font-black text-slate-900 mt-1">{stats.total}</h3>
                    <p className="text-[10px] text-slate-400 font-bold mt-1 uppercase">{currentSubjectName === 'All Subjects Included' ? 'Across All Subjects' : `In ${currentSubjectName}`}</p>
                  </div>
                  <div className="h-12 w-12 rounded-full bg-slate-50 flex items-center justify-center">
                    <ListTodo className="h-6 w-6 text-slate-400" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Filter Section */}
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-end flex-wrap">
          {isPublic ? (
            <div className="relative w-full sm:w-64" id="volunteer-search-container">
              <label className="text-sm font-medium text-foreground mb-2 block">
                Search Volunteer Name
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Enter your name..."
                  value={publicVolunteerSearch}
                  onChange={(e) => {
                    setPublicVolunteerSearch(e.target.value);
                    setShowVolunteerSuggestions(true);
                  }}
                  onFocus={() => setShowVolunteerSuggestions(true)}
                  className="pl-9 pr-8"
                />
                {publicVolunteerSearch && (
                  <button
                    type="button"
                    onClick={() => {
                      setPublicVolunteerSearch('');
                      setShowVolunteerSuggestions(false);
                    }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground p-1"
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* Fast Database Volunteer Suggestions Dropdown */}
              {showVolunteerSuggestions && matchingVolunteerSuggestions.length > 0 && (
                <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-popover border border-border rounded-md shadow-lg max-h-56 overflow-y-auto">
                  <div className="p-1.5 text-[11px] font-semibold text-muted-foreground uppercase border-b border-border/50 bg-muted/40">
                    Matching Volunteers ({matchingVolunteerSuggestions.length})
                  </div>
                  {matchingVolunteerSuggestions.map((name) => (
                    <button
                      key={name}
                      type="button"
                      onClick={() => {
                        setPublicVolunteerSearch(name);
                        setShowVolunteerSuggestions(false);
                      }}
                      className="w-full text-left px-3 py-2 text-xs hover:bg-accent hover:text-accent-foreground flex items-center justify-between cursor-pointer transition-colors border-b border-border/20 last:border-0"
                    >
                      <span className="font-medium">{name}</span>
                      <span className="text-[10px] text-primary font-semibold">Select</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="w-full sm:w-64">
              <label className="text-sm font-medium text-foreground mb-2 block">
                Search
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search all columns..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
          )}

          {!isStudent && (
            <div className="w-full sm:w-64">
              <label className="text-sm font-medium text-foreground mb-2 block">
                Filter by Class
              </label>
              <Select value={selectedClass} onValueChange={setSelectedClass}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select a class" />
                </SelectTrigger>
                <SelectContent>
                  {classes.map((cls) => (
                    <SelectItem key={cls.id} value={cls.id}>
                      {cls.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="w-full sm:w-64">
            <label className="text-sm font-medium text-foreground mb-2 block">
              Filter by Subject
            </label>
            <Select value={selectedSubject} onValueChange={setSelectedSubject}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a subject" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Subjects</SelectItem>
                {subjects
                  .filter((subject) => !isPublic || !isSubjectHiddenInPublic(subject.name))
                  .map((subject) => (
                    <SelectItem key={subject.id} value={subject.id}>
                      {getDisplaySubjectName(subject.name)}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          <div className="w-full sm:w-64">
            <label className="text-sm font-medium text-foreground mb-2 block">
              Filter by Category
            </label>
            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {categories.map((category) => (
                  <SelectItem key={category} value={category}>
                    {category}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="w-full sm:w-64">
            <label className="text-sm font-medium text-foreground mb-2 block">
              Filter by Module
            </label>
            <Select value={selectedModule} onValueChange={setSelectedModule}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a module" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Modules</SelectItem>
                {[...new Set(filteredCurriculum.map(item => item.module_title).filter(Boolean))].sort().map((module) => (
                  <SelectItem key={module} value={module}>
                    {module}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="w-full sm:w-64">
            <label className="text-sm font-medium text-foreground mb-2 block">
              Filter by Topic
            </label>
            <Select value={selectedTopic} onValueChange={setSelectedTopic}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a topic" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Topics</SelectItem>
                {[...new Set(filteredCurriculum.map(item => item.topic_title).filter(Boolean))].sort().map((topic) => (
                  <SelectItem key={topic} value={topic}>
                    {topic}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {!isStudent && (
            <div className="w-full sm:w-64">
              <label className="text-sm font-medium text-foreground mb-2 block">
                Filter by Session Category
              </label>
              <Select value={sessionCategoryFilter} onValueChange={setSessionCategoryFilter}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select session category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories (GT/GS{isPublic ? '' : '/LT'})</SelectItem>
                  <SelectItem value="guest_teacher">Guest Teacher (GT)</SelectItem>
                  <SelectItem value="guest_speaker">Guest Speaker (GS)</SelectItem>
                  {!isPublic && <SelectItem value="local_teacher">Local Teacher (LT)</SelectItem>}
                </SelectContent>
              </Select>
            </div>
          )}

          {(selectedCategory !== 'all' || selectedClass !== '' || selectedSubject !== '' || statusFilter !== 'all' || sessionTypeFilter !== 'all' || searchQuery.trim()) && (
            <div className="text-sm text-muted-foreground">
              Showing {filteredCurriculum.length} item{filteredCurriculum.length !== 1 ? 's' : ''}
            </div>
          )}
        </div>

        {/* Curriculum Table */}
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle>All Curriculum Items</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            ) : !selectedClass ? (
              <div className="text-center py-12">
                <p className="text-sm md:text-base text-muted-foreground mb-4">
                  Please select a class to view curriculum and session information.
                </p>
              </div>
            ) : curriculum.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-sm md:text-base text-muted-foreground mb-4">
                  No curriculum items yet. Import data to get started!
                </p>
                <Button onClick={() => setIsImportOpen(true)}>
                  <Upload className="h-4 w-4 mr-2" />
                  Import Curriculum
                </Button>
              </div>
            ) : filteredCurriculum.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-sm md:text-base text-muted-foreground mb-4">
                  No curriculum items found for the selected category.
                </p>
              </div>
            ) : (
              <>
                {/* Desktop Table View */}
                <div className="hidden md:block overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => handleColumnSort('subject_name')}>
                          <div className="flex items-center gap-1">
                            Subject
                            <span className={sortColumn === 'subject_name' ? 'font-bold' : 'text-muted-foreground'}>
                              {getSortIndicator('subject_name')}
                            </span>
                          </div>
                        </TableHead>
                        <TableHead className="cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => handleColumnSort('content_category')}>
                          <div className="flex items-center gap-1">
                            Category
                            <span className={sortColumn === 'content_category' ? 'font-bold' : 'text-muted-foreground'}>
                              {getSortIndicator('content_category')}
                            </span>
                          </div>
                        </TableHead>
                        <TableHead className="cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => handleColumnSort('module_title')}>
                          <div className="flex items-center gap-1">
                            Module No & Module Name
                            <span className={sortColumn === 'module_title' ? 'font-bold' : 'text-muted-foreground'}>
                              {getSortIndicator('module_title')}
                            </span>
                          </div>
                        </TableHead>
                        <TableHead className="cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => handleColumnSort('topic_title')}>
                          <div className="flex items-center gap-1">
                            Topics Covered
                            <span className={sortColumn === 'topic_title' ? 'font-bold' : 'text-muted-foreground'}>
                              {getSortIndicator('topic_title')}
                            </span>
                          </div>
                        </TableHead>
                        <TableHead>Videos</TableHead>
                        <TableHead>PPT/Quiz</TableHead>
                          <TableHead className="w-[120px]">
                            <div className="flex flex-col">
                              <span>Fresh Session</span>
                              <span className="text-[9px] font-normal text-blue-600">{stats.fresh}% Complete</span>
                            </div>
                          </TableHead>
                          <TableHead className="w-[120px]">
                            <div className="flex flex-col">
                              <span>Revision Session</span>
                              <span className="text-[9px] font-normal text-purple-600">{stats.revision}% Complete</span>
                            </div>
                          </TableHead>
                        {isAdmin && !isStudent && !isPublic && <TableHead className="w-[60px]">Actions</TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredCurriculum.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell>
                            <Badge variant="secondary">{getDisplaySubjectName(item.subject_name || 'Unassigned')}</Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline"><TruncatedText text={item.content_category} maxLength={15} /></Badge>
                          </TableCell>
                          <TableCell className="font-medium"><TruncatedText text={item.module_title} maxLength={25} /></TableCell>
                          <TableCell className="max-w-[200px]"><TruncatedText text={item.topic_title} maxLength={25} /></TableCell>
                          <TableCell>
                            {item.videos ? (
                              <a
                                href={item.videos}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-primary hover:underline"
                              >
                                🎥 View
                              </a>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {item.quiz_content_ppt ? (
                              <a
                                href={item.quiz_content_ppt}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-primary hover:underline"
                              >
                                📊 View
                              </a>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {(() => {
                              const info = sessionInfo[item.topic_title];
                              if (!info?.fresh_sessions || info.fresh_sessions.length === 0) {
                                return <span className="text-muted-foreground text-xs">-</span>;
                              }
                              const isExpanded = expandedSessions.has(`${item.id}-fresh`);
                              const displaySessions = isExpanded ? info.fresh_sessions : info.fresh_sessions.slice(0, 1);
                              return (
                                <div className="space-y-1">
                                  {displaySessions.map((session, idx) => (
                                    <div key={idx} className="text-[10px] bg-blue-50/50 p-1.5 rounded-md border border-blue-100 flex flex-col gap-0.5">
                                      <div className="font-bold text-blue-700 flex items-center gap-1">
                                        <span className="text-[10px]">🗓️</span> {session.date}
                                      </div>
                                      <div className="text-muted-foreground font-medium truncate">{session.volunteer}</div>
                                      <div className="mt-0.5">
                                        <Badge 
                                          variant="outline" 
                                          className={`text-[9px] h-4 px-1 leading-none border-blue-200 ${
                                            session.status === 'completed' ? 'bg-green-100 text-green-700 border-green-200' : 
                                            session.status === 'committed' ? 'bg-purple-100 text-purple-700 border-purple-200' : 
                                            'bg-blue-100 text-blue-700'
                                          }`}
                                        >
                                          {session.status}
                                        </Badge>
                                      </div>
                                    </div>
                                  ))}
                                  {info.fresh_sessions.length > 1 && (
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="text-xs h-6 p-1"
                                      onClick={() => {
                                        const key = `${item.id}-fresh`;
                                        setExpandedSessions(prev => {
                                          const newSet = new Set(prev);
                                          if (newSet.has(key)) {
                                            newSet.delete(key);
                                          } else {
                                            newSet.add(key);
                                          }
                                          return newSet;
                                        });
                                      }}
                                    >
                                      {isExpanded ? 'Show Less' : `+${info.fresh_sessions.length - 1} More`}
                                    </Button>
                                  )}
                                </div>
                              );
                            })()}
                          </TableCell>
                          <TableCell>
                            {(() => {
                              const info = sessionInfo[item.topic_title];
                              if (!info?.revision_sessions || info.revision_sessions.length === 0) {
                                return <span className="text-muted-foreground text-xs">-</span>;
                              }
                              const isExpanded = expandedSessions.has(`${item.id}-revision`);
                              const displaySessions = isExpanded ? info.revision_sessions : info.revision_sessions.slice(0, 1);
                              return (
                                <div className="space-y-1">
                                  {displaySessions.map((session, idx) => (
                                    <div key={idx} className="text-[10px] bg-purple-50/50 p-1.5 rounded-md border border-purple-100 flex flex-col gap-0.5">
                                      <div className="font-bold text-purple-700 flex items-center gap-1">
                                        <span className="text-[10px]">🗓️</span> {session.date}
                                      </div>
                                      <div className="text-muted-foreground font-medium truncate">{session.volunteer}</div>
                                      <div className="mt-0.5">
                                        <Badge 
                                          variant="outline" 
                                          className={`text-[9px] h-4 px-1 leading-none border-purple-200 ${
                                            session.status === 'completed' ? 'bg-green-100 text-green-700 border-green-200' : 
                                            session.status === 'committed' ? 'bg-purple-100 text-purple-700 border-purple-200' : 
                                            'bg-purple-100 text-purple-700'
                                          }`}
                                        >
                                          {session.status}
                                        </Badge>
                                      </div>
                                    </div>
                                  ))}
                                  {info.revision_sessions.length > 1 && (
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="text-xs h-6 p-1"
                                      onClick={() => {
                                        const key = `${item.id}-revision`;
                                        setExpandedSessions(prev => {
                                          const newSet = new Set(prev);
                                          if (newSet.has(key)) {
                                            newSet.delete(key);
                                          } else {
                                            newSet.add(key);
                                          }
                                          return newSet;
                                        });
                                      }}
                                    >
                                      {isExpanded ? 'Show Less' : `+${info.revision_sessions.length - 1} More`}
                                    </Button>
                                  )}
                                </div>
                              );
                            })()}
                          </TableCell>
                          {isAdmin && !isStudent && !isPublic && (
                            <TableCell>
                              <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8">
                                  <MoreVertical className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="bg-popover">
                                <DropdownMenuItem
                                  onClick={() => {
                                    setSelectedItem(item);
                                    setIsEditOpen(true);
                                  }}
                                >
                                  ✏️ Edit Video/PPT
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => {
                                    setSelectedItem(item);
                                    setIsEditCategoryModuleTopicOpen(true);
                                  }}
                                >
                                  📚 Edit Category, Module & Topic
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => {
                                    setSelectedItem(item);
                                    setStatusDialogOpen(true);
                                  }}
                                >
                                  📊 Edit Status
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => {
                                    setSelectedItem(item);
                                    setDeleteDialogOpen(true);
                                  }}
                                  className="text-destructive focus:text-destructive"
                                >
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                          )}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {/* Mobile Card View */}
                <div className="md:hidden space-y-4">
                      {filteredCurriculum.map((item) => (
                    <div key={item.id} className="bg-muted/50 rounded-lg p-4 space-y-3 border border-border">
                      {/* Category and Module Info */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <Badge variant="outline" className="mb-2">{item.content_category}</Badge>
                          <h3 className="font-semibold text-foreground break-words">{item.module_title}</h3>
                          <p className="text-xs text-muted-foreground mt-1">Module No & Module Name</p>
                        </div>
                      </div>

                      {/* Topics */}
                      <div className="text-xs">
                        <span className="text-muted-foreground block">Topics Covered</span>
                        <p className="font-medium text-sm mt-1">{item.topic_title}</p>
                      </div>

                      {/* Videos */}
                      {item.videos && (
                        <div className="text-xs">
                          <a
                            href={item.videos}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:underline font-medium"
                          >
                            🎥 View Videos →
                          </a>
                        </div>
                      )}

                      {/* PPT/Quiz */}
                      {item.quiz_content_ppt && (
                        <div className="text-xs">
                          <a
                            href={item.quiz_content_ppt}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:underline font-medium"
                          >
                            📊 View PPT/Quiz →
                          </a>
                        </div>
                      )}

                      {/* Fresh Session */}
                      {(() => {
                        const info = sessionInfo[item.topic_title];
                        if (!info?.fresh_sessions || info.fresh_sessions.length === 0) {
                          return null;
                        }
                        return (
                          <div className="text-xs">
                            <span className="text-muted-foreground block mb-1">🆕 Fresh Sessions</span>
                            <div className="space-y-1">
                              {info.fresh_sessions.map((session, idx) => (
                                <div key={idx} className="bg-blue-50 p-2 rounded border border-blue-200">
                                  <div className="font-medium">📅 {session.date}</div>
                                  <div className="text-muted-foreground">{session.volunteer}</div>
                                  <Badge variant="outline" className="text-xs mt-1">
                                    {session.status}
                                  </Badge>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })()}

                      {/* Revision Session */}
                      {(() => {
                        const info = sessionInfo[item.topic_title];
                        if (!info?.revision_sessions || info.revision_sessions.length === 0) {
                          return null;
                        }
                        return (
                          <div className="text-xs">
                            <span className="text-muted-foreground block mb-1">🔄 Revision Sessions</span>
                            <div className="space-y-1">
                              {info.revision_sessions.map((session, idx) => (
                                <div key={idx} className="bg-purple-50 p-2 rounded border border-purple-200">
                                  <div className="font-medium">📅 {session.date}</div>
                                  <div className="text-muted-foreground">{session.volunteer}</div>
                                  <Badge variant="outline" className="text-xs mt-1">
                                    {session.status}
                                  </Badge>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })()}

                      {/* Session Status */}
                      <div className="border-t border-border pt-2">
                        <p className="text-xs text-muted-foreground mb-2">Session Status</p>
                        {(() => {
                          const info = sessionInfo[item.topic_title];
                          if (!info || (info.fresh_count === 0 && info.revision_count === 0)) {
                            return <span className="text-xs text-muted-foreground">No sessions created</span>;
                          }
                          return (
                            <div className="space-y-1">
                              {info.fresh_count > 0 && (
                                <Badge variant="secondary" className="bg-blue-100 text-blue-800 text-xs">
                                  🆕 Fresh: {info.fresh_count} ({info.fresh_status || 'pending'})
                                </Badge>
                              )}
                              {info.revision_count > 0 && (
                                <Badge variant="secondary" className="bg-purple-100 text-purple-800 text-xs">
                                  🔄 Revision: {info.revision_count} ({info.revision_status || 'pending'})
                                </Badge>
                              )}
                            </div>
                          );
                        })()}
                      </div>

                      {/* Actions */}
                      {isAdmin && !isStudent && !isPublic && (
                        <div className="flex gap-2 pt-2 border-t border-border">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="outline" size="sm" className="flex-1">
                                <MoreVertical className="h-4 w-4 mr-2" />
                                Actions
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="bg-popover">
                              <DropdownMenuItem
                                onClick={() => {
                                  setSelectedItem(item);
                                  setIsEditOpen(true);
                                }}
                              >
                                ✏️ Edit Video/PPT
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => {
                                  setSelectedItem(item);
                                  setIsEditCategoryModuleTopicOpen(true);
                                }}
                              >
                                📚 Edit Category, Module & Topic
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => {
                                  setSelectedItem(item);
                                  setStatusDialogOpen(true);
                                }}
                              >
                                📊 Edit Status
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => {
                                  setSelectedItem(item);
                                  setDeleteDialogOpen(true);
                                }}
                                className="text-destructive focus:text-destructive"
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={(open) => {
        setDeleteDialogOpen(open);
        if (!open) {
          setSelectedItem(null);
          setDeleteConfirmText('');
        }
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Curriculum Item</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  Are you sure you want to delete "{selectedItem?.module_title}"? This action cannot be undone.
                </p>
                <div className="space-y-1">
                  <p className="text-sm font-medium text-foreground">
                    Type <span className="font-mono font-bold text-destructive">DELETE</span> to confirm:
                  </p>
                  <Input
                    id="delete-confirm-input"
                    value={deleteConfirmText}
                    onChange={(e) => setDeleteConfirmText(e.target.value)}
                    placeholder="Type DELETE here"
                    className="border-destructive/50 focus-visible:ring-destructive"
                  />
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => selectedItem && handleDelete(selectedItem.id)}
              disabled={deleteConfirmText !== 'DELETE'}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Import Dialog */}
      <UnifiedImportDialog
        open={isImportOpen}
        onOpenChange={setIsImportOpen}
        onSuccess={fetchCurriculum}
      />

      {/* Export Dialog */}
      <ExportCurriculumDialog
        isOpen={isExportOpen}
        onClose={() => setIsExportOpen(false)}
        classes={classes}
        defaultClassId={selectedClass}
      />

      {/* Add Topic Dialog */}
      <AddTopicDialog
        open={isAddTopicOpen}
        onOpenChange={setIsAddTopicOpen}
        onSuccess={fetchCurriculum}
      />

      {/* Edit Video/PPT Dialog */}
      <EditCurriculumDialog
        open={isEditOpen}
        onOpenChange={setIsEditOpen}
        item={selectedItem}
        onSuccess={fetchCurriculum}
      />

      {/* Edit Category, Module & Topic Dialog */}
      <EditCategoryModuleTopicDialog
        open={isEditCategoryModuleTopicOpen}
        onOpenChange={setIsEditCategoryModuleTopicOpen}
        item={selectedItem}
        onSuccess={() => fetchCurriculum(selectedClass)}
      />

      {/* Edit Status Dialog */}
      <Dialog open={statusDialogOpen} onOpenChange={setStatusDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Session Status</DialogTitle>
            <DialogDescription>
              Update the status for all sessions with topic "{selectedItem?.topic_title}" in {classes.find(c => c.id === selectedClass)?.name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-foreground mb-2 block">
                New Status
              </label>
              <Select value={newStatus} onValueChange={setNewStatus}>
                <SelectTrigger>
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="committed">Committed</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStatusDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleEditStatus} disabled={!newStatus}>
              Update Status
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </LayoutWrapper>
  );
}
