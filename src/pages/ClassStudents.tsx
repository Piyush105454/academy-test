import { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, Trash2, ArrowLeft, MoreVertical, Edit, ArrowUpRight, Info, Key, UserCog, Lock, Unlock, Search } from 'lucide-react';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { logActivity } from '@/utils/activityLogger';
import { AddStudentDialog } from '@/components/classes/AddStudentDialog';
import { EditStudentDialog } from '@/components/classes/EditStudentDialog';
import { StudentInfoDialog } from '@/components/classes/StudentInfoDialog';
import { PromoteStudentDialog } from '@/components/classes/PromoteStudentDialog';
import { AssignMonitorDialog } from '@/components/classes/AssignMonitorDialog';
import { StudentAuthDialog } from '@/components/classes/StudentAuthDialog';
import { Badge } from '@/components/ui/badge';
import { useAcademicYear } from '@/contexts/AcademicYearContext';
import { isPlaceholderEmail, getUniqueStudentEmail, getStudentActiveStatus } from '@/utils/studentActiveHelper';

interface Class {
  id: string;
  name: string;
}

interface Student {
  id: string;
  student_id: string;
  name: string;
  gender: string | null;
  dob: string | null;
  email: string | null;
  phone_number: string | null;
  roll_number: string | null;
  subject: string | null;
  academic_year: string | null;
  designation: string | null;
  monitor_id?: string | null;
  monitor_name?: string | null;
  joining_year?: string | null;
  promotion_history?: any;
  bank_name?: string | null;
  account_number?: string | null;
  ifsc_code?: string | null;
  is_active?: boolean;
  class_id?: string | null;
  class_name?: string | null;
  location?: string | null;
  bio?: string | null;
  profile_image_url?: string | null;
}

type SortDirection = 'asc' | 'desc' | null;
type SortColumn = keyof Student | null;

export default function ClassStudents() {
  const { classId } = useParams<{ classId: string }>();
  const navigate = useNavigate();
  const { selectedYear } = useAcademicYear();
  const [classItem, setClassItem] = useState<Class | null>(null);
  const [userRole, setUserRole] = useState<number | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [allClasses, setAllClasses] = useState<Class[]>([]);
  const [selectedClassFilter, setSelectedClassFilter] = useState<string>(
    classId && classId !== 'all' ? classId : 'all'
  );
  const [loading, setLoading] = useState(true);
  const [isAddStudentOpen, setIsAddStudentOpen] = useState(false);
  const [isEditStudentOpen, setIsEditStudentOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [studentToDelete, setStudentToDelete] = useState<Student | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [searchParams] = useSearchParams();
  const urlSearch = searchParams.get('search') || '';
  const urlStudentId = searchParams.get('studentId') || searchParams.get('openStudentId');
  const [selectedAcademicYear, setSelectedAcademicYear] = useState<string>(urlSearch || urlStudentId ? 'all' : selectedYear);
  const [selectedDesignation, setSelectedDesignation] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>(urlSearch);

  useEffect(() => {
    const q = searchParams.get('search');
    const openId = searchParams.get('studentId') || searchParams.get('openStudentId');
    if (q) {
      setSearchQuery(q);
    }
    if (q || openId) {
      setSelectedAcademicYear('all');
    }
  }, [searchParams]);

  useEffect(() => {
    if (!searchParams.get('search') && !searchParams.get('studentId') && !searchParams.get('openStudentId')) {
      setSelectedAcademicYear(selectedYear);
    }
  }, [selectedYear, searchParams]);

  const [infoDialogOpen, setInfoDialogOpen] = useState(false);
  const [selectedStudentForInfo, setSelectedStudentForInfo] = useState<Student | null>(null);

  // Auto-open student profile popup if studentId or openStudentId query param is present
  useEffect(() => {
    const openStudentId = searchParams.get('studentId') || searchParams.get('openStudentId');
    if (!openStudentId) return;

    if (students.length > 0) {
      const found = students.find(s => s.id === openStudentId || s.student_id === openStudentId);
      if (found) {
        setSelectedStudentForInfo(found);
        setInfoDialogOpen(true);
        return;
      }
    }

    // Direct fetch fallback for immediate opening even while list is loading
    let isMounted = true;
    (async () => {
      try {
        const { data: directStudent, error } = await supabase
          .from('students')
          .select('*')
          .or(`id.eq.${openStudentId},student_id.eq.${openStudentId}`)
          .maybeSingle();

        if (error) {
          console.warn('Could not fetch student directly:', error.message);
          return;
        }

        if (directStudent && isMounted) {
          setSelectedStudentForInfo(directStudent as any);
          setInfoDialogOpen(true);
        }
      } catch (err) {
        console.error('Error auto-opening student profile:', err);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [searchParams, students]);
  const [isPromoteStudentOpen, setIsPromoteStudentOpen] = useState(false);
  const [studentToPromote, setStudentToPromote] = useState<Student | null>(null);
  const [sortColumn, setSortColumn] = useState<SortColumn>('student_id');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [isAssignMonitorOpen, setIsAssignMonitorOpen] = useState(false);
  const [studentForMonitor, setStudentForMonitor] = useState<Student | null>(null);
  const [isAuthDialogOpen, setIsAuthDialogOpen] = useState(false);
  const [studentForAuth, setStudentForAuth] = useState<Student | null>(null);

  const handleColumnSort = (column: SortColumn) => {
    if (sortColumn === column) {
      if (sortDirection === 'asc') setSortDirection('desc');
      else if (sortDirection === 'desc') {
        setSortColumn(null);
        setSortDirection(null);
      }
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const getSortIndicator = (column: SortColumn) => {
    if (sortColumn !== column) return '↕';
    if (sortDirection === 'asc') return '↑';
    if (sortDirection === 'desc') return '↓';
    return '↕';
  };

  const handlePromoteClick = (student: Student) => {
    setStudentToPromote(student);
    setIsPromoteStudentOpen(true);
  };

  const handlePromoteConfirm = async (academicYear: string, designation: string) => {
    if (!studentToPromote) return;
    
    try {
      const currentHistory = Array.isArray(studentToPromote.promotion_history) ? studentToPromote.promotion_history : [];
      const newHistoryRecord = {
        from: studentToPromote.academic_year,
        to: academicYear,
        date: new Date().toISOString()
      };
      const updatedHistory = [...currentHistory, newHistoryRecord];

      const { error } = await supabase
        .from('students')
        .update({ 
          academic_year: academicYear,
          designation: designation,
          promotion_history: updatedHistory
        })
        .eq('id', studentToPromote.id);

      if (error) throw error;

      setStudents(students.map((s) => (s.id === studentToPromote.id ? { ...s, academic_year: academicYear, designation: designation, promotion_history: updatedHistory } : s)));
      toast.success(`Student promoted to ${academicYear} (${designation || 'no designation change'})`);
    } catch (error) {
      console.error('Error promoting student:', error);
      toast.error('Failed to promote student');
    }
  };

  const filteredStudents = students.filter(student => {
    if (selectedClassFilter !== 'all' && student.class_id !== selectedClassFilter) return false;
    if (selectedAcademicYear !== 'all' && student.academic_year !== selectedAcademicYear) return false;
    if (selectedDesignation !== 'all' && student.designation !== selectedDesignation) return false;
    if (statusFilter === 'active' && student.is_active === false) return false;
    if (statusFilter === 'inactive' && student.is_active !== false) return false;
    
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      const nameMatch = student.name?.toLowerCase().includes(query);
      const idMatch = student.student_id?.toLowerCase().includes(query);
      const emailMatch = student.email?.toLowerCase().includes(query);
      const classMatch = student.class_name?.toLowerCase().includes(query);
      const phoneMatch = student.phone_number?.toLowerCase().includes(query);
      const rollMatch = student.roll_number?.toLowerCase().includes(query);
      if (!nameMatch && !idMatch && !emailMatch && !classMatch && !phoneMatch && !rollMatch) return false;
    }
    
    return true;
  }).sort((a, b) => {
    if (!sortColumn || !sortDirection) return 0;
    
    const aValue = a[sortColumn];
    const bValue = b[sortColumn];

    if (aValue == null && bValue == null) return 0;
    if (aValue == null) return sortDirection === 'asc' ? 1 : -1;
    if (bValue == null) return sortDirection === 'asc' ? -1 : 1;

    if (typeof aValue === 'string' && typeof bValue === 'string') {
      const comparison = aValue.toLowerCase().localeCompare(bValue.toLowerCase());
      return sortDirection === 'asc' ? comparison : -comparison;
    }

    if (typeof aValue === 'boolean' && typeof bValue === 'boolean') {
      return sortDirection === 'asc' ? (aValue === bValue ? 0 : aValue ? -1 : 1) : (aValue === bValue ? 0 : aValue ? 1 : -1);
    }

    return 0;
  });

  const academicYears = Array.from(new Set([...students.map(s => s.academic_year).filter(Boolean), selectedYear])).sort() as string[];
  const designations = Array.from(new Set(students.map(s => s.designation).filter(Boolean))).sort() as string[];

  
  useEffect(() => {
    const fetchUserRole = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return;
      try {
        const { data } = await supabase.from('user_profiles').select('role_id').eq('id', session.user.id).maybeSingle();
        if (data?.role_id) {
          setUserRole(data.role_id);
        }
      } catch (err) {}
    };
    fetchUserRole();
  }, []);
  const isAdmin = userRole === 1;

  useEffect(() => {
    if (classId && classId !== 'all') {
      setSelectedClassFilter(classId);
    } else {
      setSelectedClassFilter('all');
    }
    fetchClassAndStudents();
  }, [classId]);

  const fetchClassAndStudents = async () => {
    try {
      setLoading(true);
      
      // 1. Fetch all classes for filter dropdown and mapping
      const { data: classesData, error: classesError } = await supabase
        .from('classes')
        .select('*')
        .order('name', { ascending: true });

      if (classesError) throw classesError;
      setAllClasses(classesData || []);
      const classMap = new Map((classesData || []).map(c => [c.id, c.name]));

      if (classId && classId !== 'all') {
        const found = (classesData || []).find(c => c.id === classId);
        setClassItem(found || null);
      } else {
        setClassItem(null);
      }

      // 2. Fetch all students across classes
      const { data: studentsData, error: studentsError } = await supabase
        .from('students')
        .select('*')
        .order('name', { ascending: true });

      if (studentsError) throw studentsError;
      
      const emails = (studentsData || []).map((s: any) => s.email).filter(Boolean);
      const studentIds = (studentsData || []).map((s: any) => s.id).filter(Boolean);
      // Only include non-placeholder emails in remote query to avoid colliding on dummy emails
      const nonPlaceholderEmails = emails.filter((em: string) => !isPlaceholderEmail(em));

      let profileMapByEmail = new Map<string, boolean>();
      let profileMapById = new Map<string, boolean>();
      let profileDetailsByEmail = new Map<string, any>();
      let profileDetailsById = new Map<string, any>();

      try {
        const queryOr: string[] = [];
        if (studentIds.length > 0) queryOr.push(`id.in.(${studentIds.join(',')})`);
        if (nonPlaceholderEmails.length > 0) queryOr.push(`email.in.(${nonPlaceholderEmails.join(',')})`);

        if (queryOr.length > 0) {
          const { data: profiles } = await supabase
            .from('user_profiles')
            .select('id, email, is_active, location, bio, phone, profile_image_url')
            .or(queryOr.join(','));

          if (profiles) {
            profiles.forEach((p: any) => {
              if (p.id) {
                profileMapById.set(p.id, p.is_active);
                profileDetailsById.set(p.id, p);
              }
              if (p.email && !isPlaceholderEmail(p.email)) {
                const normEmail = p.email.toLowerCase().trim();
                profileMapByEmail.set(normEmail, p.is_active);
                profileDetailsByEmail.set(normEmail, p);
              }
            });
          }
        }
      } catch (e) {
        console.error('Error fetching user_profiles is_active:', e);
      }

      const enrichedStudents = (studentsData || []).map((student) => {
        const isActive = getStudentActiveStatus(student, profileMapById, profileMapByEmail);
        const className = student.class_id ? (classMap.get(student.class_id) || 'Unknown Class') : 'No Class';
        const profile = (student.email && profileDetailsByEmail.get(student.email.toLowerCase().trim())) ||
                        (student.id && profileDetailsById.get(student.id));

        const finalLocation = student.location || profile?.location || null;
        const finalBio = (student.bio && student.bio !== 'null') ? student.bio : (profile?.bio && profile.bio !== 'null' ? profile.bio : null);
        const profileImageUrl = profile?.profile_image_url || null;

        if (student.monitor_id) {
          const monitor = (studentsData || []).find(s => s.id === student.monitor_id);
          return {
            ...student,
            class_name: className,
            is_active: isActive,
            location: finalLocation,
            bio: finalBio,
            profile_image_url: profileImageUrl,
            monitor_name: monitor ? monitor.name : 'Unknown'
          };
        }
        return {
          ...student,
          class_name: className,
          is_active: isActive,
          location: finalLocation,
          bio: finalBio,
          profile_image_url: profileImageUrl,
        };
      });
      
      setStudents(enrichedStudents);
    } catch (error: any) {
      console.error('Error fetching data:', error);
      toast.error('Failed to load class and students: ' + (error.message || 'Unknown error'));
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteStudent = async (id: string) => {
    try {
      const { error } = await supabase.from('students').delete().eq('id', id);

      if (error) throw error;

      const targetStudent = students.find(s => s.id === id);
      await logActivity('DELETE', 'Students', `Removed student: ${targetStudent ? targetStudent.name : id}`);

      setStudents(students.filter((s) => s.id !== id));
      toast.success('Student removed successfully');
      setDeleteDialogOpen(false);
      setStudentToDelete(null);
    } catch (error) {
      console.error('Error deleting student:', error);
      toast.error('Failed to remove student');
    }
  };

  const handleEditStudent = (student: Student) => {
    setEditingStudent(student);
    setIsEditStudentOpen(true);
  };

  
  const handleToggleActive = async (student: Student) => {
    try {
      const newStatus = student.is_active === false;
      
      // 1. Ensure student has a unique email. If placeholder or missing, assign unique student email
      let studentEmail = student.email?.trim().toLowerCase();
      const needsUniqueEmail = isPlaceholderEmail(studentEmail);

      if (needsUniqueEmail) {
        studentEmail = getUniqueStudentEmail(student);
        await supabase
          .from('students')
          .update({ email: studentEmail })
          .eq('id', student.id);
      }

      // 2. Look for existing profile matching student.id OR matching valid email
      let existingProfileId: string | null = null;
      
      const { data: profileById } = await supabase
        .from('user_profiles')
        .select('id, email')
        .eq('id', student.id)
        .maybeSingle();

      if (profileById) {
        existingProfileId = profileById.id;
      } else if (studentEmail && !isPlaceholderEmail(studentEmail)) {
        const { data: profileByEmail } = await supabase
          .from('user_profiles')
          .select('id, email')
          .ilike('email', studentEmail)
          .maybeSingle();
        if (profileByEmail) {
          existingProfileId = profileByEmail.id;
        }
      }

      // 3. Update existing profile OR insert new profile specifically for this student
      if (existingProfileId) {
        const { error: upErr } = await supabase
          .from('user_profiles')
          .update({
            is_active: newStatus,
            email: studentEmail,
            updated_at: new Date().toISOString()
          })
          .eq('id', existingProfileId);
        if (upErr) throw upErr;
      } else {
        const { error: inErr } = await supabase
          .from('user_profiles')
          .insert({
            id: student.id,
            email: studentEmail,
            full_name: student.name,
            class_id: student.class_id || classId,
            role_id: 5,
            is_active: newStatus
          });
        
        if (inErr) {
          console.warn('Direct insert into user_profiles failed, fallback updating by email:', inErr);
          const { error: fallbackErr } = await supabase
            .from('user_profiles')
            .update({ is_active: newStatus })
            .ilike('email', studentEmail);
          if (fallbackErr) throw fallbackErr;
        }
      }

      setStudents(prev => prev.map(s => s.id === student.id ? { ...s, is_active: newStatus, email: studentEmail } : s));
      toast.success(newStatus ? 'Student activated' : 'Student deactivated');
    } catch (e: any) {
      console.error('Failed to toggle status:', e);
      toast.error('Failed to toggle status: ' + (e?.message || 'Unknown error'));
    }
  };

  const handleToggleProfileLock = async (student: Student) => {
    try {
      const newStatus = student.allow_profile_edit === false;
      
      const { error } = await supabase
        .from('students')
        .update({ allow_profile_edit: newStatus })
        .eq('id', student.id);
        
      if (error) throw error;
      
      await logActivity(newStatus ? 'UNLOCK' : 'LOCK', 'Students', `${newStatus ? 'Unlocked' : 'Locked'} profile editing for student: ${student.name}`);
      
      setStudents(students.map(s => s.id === student.id ? { ...s, allow_profile_edit: newStatus } : s));
      toast.success(`Profile editing ${newStatus ? 'unlocked' : 'locked'} for ${student.name}`);
    } catch (error: any) {
      console.error('Error toggling profile lock:', error);
      toast.error('Failed to toggle profile lock: ' + (error.message || 'Unknown error'));
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

  if (!loading && classId && classId !== 'all' && !classItem && selectedClassFilter !== 'all') {
    return (
      <DashboardLayout>
        <div className="text-center py-12">
          <p className="text-muted-foreground">Class not found</p>
          <Button onClick={() => navigate('/classes')} className="mt-4">
            Back to Classes
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate('/classes')}
              className="flex-shrink-0"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="min-w-0">
              <h1 className="text-2xl md:text-3xl font-bold text-foreground">
                {selectedClassFilter === 'all'
                  ? 'All Students'
                  : (allClasses.find(c => c.id === selectedClassFilter)?.name || classItem?.name || 'Class Students')}
              </h1>
              <p className="text-sm md:text-base text-muted-foreground mt-1">
                {selectedClassFilter === 'all'
                  ? 'Manage and view all students across all classes'
                  : 'Manage students in this class'}
              </p>
            </div>
          </div>
          {isAdmin && (
            <Button 
              onClick={() => setIsAddStudentOpen(true)}
              className="w-full sm:w-auto gap-2"
            >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Add Student</span>
            <span className="sm:hidden">Add</span>
            </Button>
          )}
          </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2 bg-muted/10 p-2 rounded-lg border border-border/60">
          {/* Class Filter */}
          <Select
            value={selectedClassFilter}
            onValueChange={(val) => {
              setSelectedClassFilter(val);
              if (val !== 'all') {
                const found = allClasses.find(c => c.id === val);
                setClassItem(found || null);
              } else {
                setClassItem(null);
              }
            }}
          >
            <SelectTrigger className="h-9 w-[170px] text-xs bg-transparent font-medium">
              <SelectValue placeholder="All Classes" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Classes</SelectItem>
              {allClasses.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-9 w-[150px] text-xs bg-transparent">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>

          <Select value={selectedAcademicYear} onValueChange={setSelectedAcademicYear}>
            <SelectTrigger className="h-9 w-[180px] text-xs bg-transparent">
              <SelectValue placeholder="Academic Year" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Academic Years</SelectItem>
              {academicYears.map(year => (
                <SelectItem key={year} value={year}>{year}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={selectedDesignation} onValueChange={setSelectedDesignation}>
            <SelectTrigger className="h-9 w-[180px] text-xs bg-transparent">
              <SelectValue placeholder="Designation" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Designations</SelectItem>
              {designations.map(desig => (
                <SelectItem key={desig} value={desig}>{desig}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="relative flex-1 min-w-[200px] sm:max-w-xs ml-auto">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search by name or ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-9 text-xs bg-transparent border-input focus-visible:ring-1"
            />
          </div>
        </div>

        {/* Students Table */}
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <span className="inline-flex items-center gap-2">
                Students
                <Badge variant="secondary" className="ml-2 font-mono">
                  {filteredStudents.length} Total
                </Badge>
                <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 font-mono">
                  {filteredStudents.filter(s => s.is_active !== false).length} Active
                </Badge>
                <Badge variant="outline" className="bg-slate-50 text-slate-600 border-slate-200 font-mono">
                  {filteredStudents.filter(s => s.is_active === false).length} Inactive
                </Badge>
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {filteredStudents.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-muted-foreground mb-4">No students added yet</p>
                {isAdmin && <Button onClick={() => setIsAddStudentOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Student
                </Button>}
                </div>
              ) : (
              <>
                {/* Desktop Table View */}
                <div className="hidden md:block overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[60px]">Action</TableHead>
                        <TableHead className="w-[110px]">Profile Edit</TableHead>
                        <TableHead 
                          className="w-[100px] cursor-pointer hover:bg-muted/50 transition-colors"
                          onClick={() => handleColumnSort('student_id')}
                        >
                          <div className="flex items-center gap-1">Student ID <span className="text-muted-foreground ml-1">{getSortIndicator('student_id')}</span></div>
                        </TableHead>
                        <TableHead 
                          className="cursor-pointer hover:bg-muted/50 transition-colors"
                          onClick={() => handleColumnSort('name')}
                        >
                          <div className="flex items-center gap-1">Name <span className="text-muted-foreground ml-1">{getSortIndicator('name')}</span></div>
                        </TableHead>
                        <TableHead 
                          className="w-[90px] cursor-pointer hover:bg-muted/50 transition-colors"
                          onClick={() => handleColumnSort('gender')}
                        >
                          <div className="flex items-center gap-1">Gender <span className="text-muted-foreground ml-1">{getSortIndicator('gender')}</span></div>
                        </TableHead>
                        <TableHead 
                          className="w-[90px] cursor-pointer hover:bg-muted/50 transition-colors"
                          onClick={() => handleColumnSort('is_active')}
                        >
                          <div className="flex items-center gap-1">Status <span className="text-muted-foreground ml-1">{getSortIndicator('is_active')}</span></div>
                        </TableHead>
                        <TableHead 
                          className="w-[100px] cursor-pointer hover:bg-muted/50 transition-colors"
                          onClick={() => handleColumnSort('dob')}
                        >
                          <div className="flex items-center gap-1">DOB <span className="text-muted-foreground ml-1">{getSortIndicator('dob')}</span></div>
                        </TableHead>
                        <TableHead 
                          className="cursor-pointer hover:bg-muted/50 transition-colors"
                          onClick={() => handleColumnSort('email')}
                        >
                          <div className="flex items-center gap-1">Email <span className="text-muted-foreground ml-1">{getSortIndicator('email')}</span></div>
                        </TableHead>
                        <TableHead 
                          className="cursor-pointer hover:bg-muted/50 transition-colors"
                          onClick={() => handleColumnSort('phone_number')}
                        >
                          <div className="flex items-center gap-1">Phone <span className="text-muted-foreground ml-1">{getSortIndicator('phone_number')}</span></div>
                        </TableHead>
                        <TableHead 
                          className="w-[120px] cursor-pointer hover:bg-muted/50 transition-colors"
                          onClick={() => handleColumnSort('monitor_name')}
                        >
                          <div className="flex items-center gap-1">Class Monitor <span className="text-muted-foreground ml-1">{getSortIndicator('monitor_name')}</span></div>
                        </TableHead>
                        <TableHead 
                          className="w-[120px] cursor-pointer hover:bg-muted/50 transition-colors"
                          onClick={() => handleColumnSort('subject')}
                        >
                          <div className="flex items-center gap-1">Subject <span className="text-muted-foreground ml-1">{getSortIndicator('subject')}</span></div>
                        </TableHead>
                        <TableHead 
                          className="w-[120px] cursor-pointer hover:bg-muted/50 transition-colors"
                          onClick={() => handleColumnSort('academic_year')}
                        >
                          <div className="flex items-center gap-1">Academic Year <span className="text-muted-foreground ml-1">{getSortIndicator('academic_year')}</span></div>
                        </TableHead>
                        <TableHead 
                          className="w-[150px] cursor-pointer hover:bg-muted/50 transition-colors"
                          onClick={() => handleColumnSort('designation')}
                        >
                          <div className="flex items-center gap-1">Designation <span className="text-muted-foreground ml-1">{getSortIndicator('designation')}</span></div>
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredStudents.map((student) => (
                        <TableRow key={student.id}>
                          <TableCell>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8">
                                  <MoreVertical className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="start" className="bg-popover">
                                <DropdownMenuItem onClick={() => {
                                  setSelectedStudentForInfo(student);
                                  setInfoDialogOpen(true);
                                }}>
                                  <Info className="h-4 w-4 mr-2" />
                                  Info
                                </DropdownMenuItem>
                                {userRole !== 4 && (
                                  <DropdownMenuItem onClick={() => handlePromoteClick(student)}>
                                    <ArrowUpRight className="h-4 w-4 mr-2" />
                                    Promote
                                  </DropdownMenuItem>
                                )}
                                {isAdmin && <DropdownMenuItem onClick={() => handleEditStudent(student)}><Edit className="h-4 w-4 mr-2" />Edit</DropdownMenuItem>}
                                <DropdownMenuItem onClick={() => {
                                  setStudentForMonitor(student);
                                  setIsAssignMonitorOpen(true);
                                }}>
                                  <UserCog className="h-4 w-4 mr-2" />
                                  Assign Monitor
                                </DropdownMenuItem>
                                
  {isAdmin && (
    <DropdownMenuItem onClick={() => handleToggleActive(student)}>
      {student.is_active !== false ? (
        <><UserCog className="h-4 w-4 mr-2 text-red-500" /><span className="text-red-500">Deactivate Account</span></>
      ) : (
        <><UserCog className="h-4 w-4 mr-2 text-green-500" /><span className="text-green-500">Activate Account</span></>
      )}
    </DropdownMenuItem>
  )}

                                  <DropdownMenuItem onClick={() => handleToggleProfileLock(student)}>
                                  {student.allow_profile_edit !== false ? (
                                    <>
                                      <Lock className="h-4 w-4 mr-2" />
                                      Lock Profile Edit
                                    </>
                                  ) : (
                                    <>
                                      <Unlock className="h-4 w-4 mr-2" />
                                      Unlock Profile Edit
                                    </>
                                  )}
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => {
                                  setStudentForAuth(student);
                                  setIsAuthDialogOpen(true);
                                }}>
                                  <Key className="h-4 w-4 mr-2" />
                                  Reset Password
                                </DropdownMenuItem>
                                {isAdmin && <DropdownMenuItem onClick={() => { setStudentToDelete(student); setDeleteDialogOpen(true); }} className="text-destructive focus:text-destructive"><Trash2 className="h-4 w-4 mr-2" />Delete</DropdownMenuItem>}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                          <TableCell className="text-sm">
                            {student.allow_profile_edit !== false ? (
                              <Badge variant="outline" className="bg-green-50 text-green-700 hover:bg-green-100 border-green-200">
                                🔓 Unlocked
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="bg-red-50 text-red-700 hover:bg-red-100 border-red-200">
                                🔒 Locked
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="font-medium">{student.student_id}</TableCell>
                          <TableCell>{student.name}</TableCell>
                          <TableCell className="text-sm">{student.gender || '-'}</TableCell>
                            <TableCell>
                              <Badge variant={student.is_active !== false ? 'default' : 'secondary'} className={student.is_active !== false ? 'bg-green-500 hover:bg-green-600' : ''}>
                                {student.is_active !== false ? 'Active' : 'Inactive'}
                              </Badge>
                            </TableCell>
                          <TableCell className="font-medium whitespace-nowrap">
                            <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-[11px] font-semibold">
                              {student.class_name || 'No Class'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm">
                            {student.dob
                              ? new Date(student.dob).toLocaleDateString()
                              : '-'}
                          </TableCell>
                          <TableCell className="text-sm">{student.email || '-'}</TableCell>
                          <TableCell className="text-sm">{student.phone_number || '-'}</TableCell>
                          <TableCell className="text-sm">
                            {student.monitor_name ? (
                              <Badge variant="outline" className="font-medium bg-blue-50 text-blue-700 hover:bg-blue-100 border-blue-200">
                                {student.monitor_name}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell className="text-sm">{student.subject || '-'}</TableCell>
                          <TableCell className="text-sm">{student.academic_year || '-'}</TableCell>
                          <TableCell className="text-sm">{student.designation || '-'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {/* Mobile Card View */}
                <div className="md:hidden space-y-4">
                  {filteredStudents.map((student) => (
                    <div key={student.id} className="bg-muted/50 rounded-lg p-4 space-y-3 border border-border">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <h3 className="font-semibold text-foreground break-words">{student.name}</h3>
                          <p className="text-xs text-muted-foreground mt-1">
                              ID: {student.student_id}
                            </p>
                            <Badge variant={student.is_active !== false ? 'default' : 'secondary'} className={`mt-2 ${student.is_active !== false ? 'bg-green-500' : ''}`}>
                              {student.is_active !== false ? 'Active' : 'Inactive'}
                            </Badge>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="col-span-2">
                          <span className="text-muted-foreground block">Class</span>
                          <span className="font-semibold text-blue-700 text-xs">{student.class_name || 'No Class'}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground block">Gender</span>
                          <span className="font-medium">{student.gender || '-'}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground block">DOB</span>
                          <span className="font-medium">
                            {student.dob
                              ? new Date(student.dob).toLocaleDateString()
                              : '-'}
                          </span>
                        </div>
                        <div>
                          <span className="text-muted-foreground block">Class Monitor</span>
                          <span className="font-medium">{student.monitor_name || '-'}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground block">Subject</span>
                          <span className="font-medium">{student.subject || '-'}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground block">Academic Year</span>
                          <span className="font-medium">{student.academic_year || '-'}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground block">Designation</span>
                          <span className="font-medium">{student.designation || '-'}</span>
                        </div>
                        {student.email && (
                          <div className="col-span-2">
                            <span className="text-muted-foreground block">Email</span>
                            <span className="font-medium text-xs break-all">{student.email}</span>
                          </div>
                        )}
                        {student.phone_number && (
                          <div className="col-span-2">
                            <span className="text-muted-foreground block">Phone</span>
                            <span className="font-medium">{student.phone_number}</span>
                          </div>
                        )}
                      </div>

                      <div className="pt-2 border-t border-border flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          onClick={() => {
                            setSelectedStudentForInfo(student);
                            setInfoDialogOpen(true);
                          }}
                          className="flex-1 min-w-[45%]"
                          variant="outline"
                        >
                          <Info className="h-4 w-4 mr-1" />
                          Info
                        </Button>
                        {userRole !== 4 && (
                          <Button
                            size="sm"
                            onClick={() => handlePromoteClick(student)}
                            className="flex-1 min-w-[45%]"
                            variant="outline"
                          >
                            <ArrowUpRight className="h-4 w-4 mr-1" />
                            Promote
                          </Button>
                        )}
                        {isAdmin && <Button
                            size="sm"
                            onClick={() => handleEditStudent(student)}
                            className="flex-1 min-w-[30%]"
                          >
                          <Edit className="h-4 w-4 mr-1" />
                            Edit
                          </Button>}
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            setStudentForAuth(student);
                            setIsAuthDialogOpen(true);
                          }}
                          className="flex-1 min-w-[45%]"
                        >
                          <Key className="h-4 w-4 mr-1" />
                          Reset Password
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => {
                            setStudentToDelete(student);
                            setDeleteDialogOpen(true);
                          }}
                          className="flex-1 min-w-[30%]"
                        >
                          <Trash2 className="h-4 w-4 mr-1" />
                          Delete
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Add Student Dialog */}
      <AddStudentDialog
        open={isAddStudentOpen}
        onOpenChange={setIsAddStudentOpen}
        classId={selectedClassFilter === 'all' ? undefined : selectedClassFilter}
        classes={allClasses}
        onSuccess={fetchClassAndStudents}
      />

      {/* Edit Student Dialog */}
      <EditStudentDialog
        open={isEditStudentOpen}
        onOpenChange={setIsEditStudentOpen}
        student={editingStudent}
        onSuccess={fetchClassAndStudents}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={(open) => {
        setDeleteDialogOpen(open);
        if (!open) {
          setStudentToDelete(null);
          setDeleteConfirmText('');
        }
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Student</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  Are you sure you want to delete "{studentToDelete?.name}"? This action cannot be undone.
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
              onClick={() => studentToDelete && handleDeleteStudent(studentToDelete.id)}
              disabled={deleteConfirmText !== 'DELETE'}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Student Info Dialog */}
      <StudentInfoDialog
        open={infoDialogOpen}
        onOpenChange={setInfoDialogOpen}
        student={selectedStudentForInfo}
      />

      {/* Promote Student Dialog */}
      <PromoteStudentDialog
        open={isPromoteStudentOpen}
        onOpenChange={setIsPromoteStudentOpen}
        student={studentToPromote}
        onConfirm={handlePromoteConfirm}
      />

      {/* Assign Monitor Dialog */}
      <AssignMonitorDialog
        open={isAssignMonitorOpen}
        onOpenChange={setIsAssignMonitorOpen}
        student={studentForMonitor}
        classId={studentForMonitor?.class_id || (selectedClassFilter !== 'all' ? selectedClassFilter : (allClasses[0]?.id || ''))}
        onSuccess={fetchClassAndStudents}
      />

      {/* Auth Settings Dialog */}
      <StudentAuthDialog
        open={isAuthDialogOpen}
        onOpenChange={setIsAuthDialogOpen}
        student={studentForAuth}
        classId={studentForAuth?.class_id || (selectedClassFilter !== 'all' ? selectedClassFilter : (allClasses[0]?.id || ''))}
      />
    </DashboardLayout>
  );
}
