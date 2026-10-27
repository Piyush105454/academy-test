import { useState, useEffect, useRef } from 'react';
import { Plus, Trash2, MoreVertical, BookOpen, Users, Upload, Pencil, Eye, Lock, Unlock, Search, X, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

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
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { logActivity } from '@/utils/activityLogger';

import { AddClassDialog } from '@/components/classes/AddClassDialog';
import { EditClassDialog } from '@/components/classes/EditClassDialog';
import { useAcademicYear } from '@/contexts/AcademicYearContext';
import { BulkStudentImportDialog } from '@/components/classes/BulkStudentImportDialog';
import { useAuth } from '@/contexts/AuthContext';

interface Class {
  id: string;
  name: string;
  description: string | null;
  email: string | null;
  created_at: string;
  updated_at: string;
  student_count?: number;
  active_count?: number;
  inactive_count?: number;
  allow_profile_edit?: boolean; is_attendance_enabled?: boolean;
}

export default function Classes() {
  const navigate = useNavigate();
  const { selectedYear } = useAcademicYear();
  const { user } = useAuth();

  const [classes, setClasses] = useState<Class[]>([]);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState<number | null>(null);

  const [isAddClassOpen, setIsAddClassOpen] = useState(false);
  const [isBulkImportOpen, setIsBulkImportOpen] = useState(false);
  const [isViewStudentsOpen, setIsViewStudentsOpen] = useState(false);

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [classToDelete, setClassToDelete] = useState<Class | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');

  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [classToEdit, setClassToEdit] = useState<Class | null>(null);

  // Global Student Search State
  const [searchStudentQuery, setSearchStudentQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setIsSearchOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const term = searchStudentQuery.trim();
    if (!term) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const { data, error } = await supabase
          .from('students')
          .select(`
            id,
            name,
            student_id,
            roll_number,
            designation,
            class_id,
            classes (
              id,
              name
            )
          `)
          .or(`name.ilike.%${term}%,student_id.ilike.%${term}%,roll_number.ilike.%${term}%`)
          .limit(15);

        if (error) throw error;

        const formatted = (data || []).map((s: any) => ({
          id: s.id,
          name: s.name,
          student_id: s.student_id || s.roll_number || '',
          roll_number: s.roll_number || '',
          class_id: s.class_id,
          class_name: s.classes?.name || 'No Class',
          designation: s.designation || ''
        }));

        setSearchResults(formatted);
        setIsSearchOpen(true);
      } catch (err) {
        console.error('Error searching students:', err);
      } finally {
        setIsSearching(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [searchStudentQuery]);

  useEffect(() => {
    fetchClasses();
  }, [selectedYear]);

  const fetchClasses = async () => {
    try {
      setLoading(true);

      let roleId = userRole;
      if (!roleId && user?.email) {
        const { data: profile } = await supabase
          .from('user_profiles')
          .select('role_id')
          .ilike('email', user.email)
          .maybeSingle();
        if (profile?.role_id) {
          roleId = profile.role_id;
          setUserRole(roleId);
        }
      }

      let query = supabase
        .from('classes')
        .select('id, name, description, email, allow_profile_edit, is_attendance_enabled, created_at, updated_at')
        .neq('id', '00000000-0000-0000-0000-000000000000')
        .neq('name', '__SYSTEM_DEV_MODE__')
        .order('name', { ascending: true });

      if (roleId === 4 && user?.email) {
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
              const classIds = facClasses.map(fc => fc.class_id);
              query = query.in('id', classIds);
            } else {
              setClasses([]);
              return;
            }
          }
      }

      const { data, error } = await query;

      if (error) throw error;

      const classIds = (data || []).map(c => c.id);
      
      const { data: studentsData } = await supabase
        .from('students')
        .select('class_id, email')
        .in('class_id', classIds)
        .eq('academic_year', selectedYear);

      let profileMap = new Map<string, boolean>();
      if (studentsData && studentsData.length > 0) {
        const emails = [...new Set(studentsData.map(s => s.email).filter(Boolean))];
        if (emails.length > 0) {
          const { data: profiles } = await supabase
            .from('user_profiles')
            .select('email, is_active')
            .in('email', emails);
          if (profiles) {
            profileMap = new Map(profiles.map(p => [p.email?.toLowerCase().trim(), p.is_active]));
          }
        }
      }

      const classesWithCounts = (data || []).map(classItem => {
        const classStudents = studentsData?.filter(s => s.class_id === classItem.id) || [];
        const total = classStudents.length;
        let active = 0;
        let inactive = 0;
        
        classStudents.forEach(s => {
          const isActive = s.email ? profileMap.get(s.email.toLowerCase().trim()) !== false : true;
          if (isActive) active++;
          else inactive++;
        });

        return {
          ...classItem,
          student_count: total,
          active_count: active,
          inactive_count: inactive
        };
      });

      setClasses(classesWithCounts);
    } catch (error) {
      console.error(error);
      toast.error('Failed to load classes');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteClass = async () => {
    if (!classToDelete) return;
    if (deleteConfirmText !== classToDelete.name) {
      toast.error('Class name does not match');
      return;
    }

    try {
      setIsDeleting(true);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('classes')
        .delete()
        .eq('id', classToDelete.id);

      if (error) throw error;

      await logActivity(
        user.id,
        'Class Deleted',
        `Deleted class: ${classToDelete.name}`,
        'delete',
        'classes'
      );

      toast.success('Class deleted successfully');
      setDeleteDialogOpen(false);
      fetchClasses();
    } catch (error) {
      console.error('Error deleting class:', error);
      toast.error('Failed to delete class. Make sure it has no students attached.');
    } finally {
      setIsDeleting(false);
    }
  };

  const toggleAttendance = async (classItem: Class) => {
    try {
      const newValue = classItem.is_attendance_enabled === false ? true : false;
      const { error } = await supabase
        .from('classes')
        .update({ is_attendance_enabled: newValue })
        .eq('id', classItem.id);

      if (error) throw error;

      toast.success(`Attendance ${newValue ? 'enabled' : 'disabled'} for ${classItem.name}`);
      fetchClasses();
    } catch (error) {
      console.error('Error toggling attendance:', error);
      toast.error('Failed to update attendance setting');
    }
  };

  const handleViewStudents = (classItem: Class) => {
    navigate(`/classes/${classItem.id}/students`);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">

        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">Classes</h1>
            <p className="text-muted-foreground">
              Manage classes and students
            </p>
          </div>

          <div className="flex flex-wrap sm:flex-nowrap items-center gap-2.5">
            {/* Global Student Search Box */}
            <div ref={searchRef} className="relative w-full sm:w-64 md:w-72">
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <Input
                  type="text"
                  placeholder="Search student by name or ID..."
                  value={searchStudentQuery}
                  onChange={(e) => {
                    setSearchStudentQuery(e.target.value);
                    if (e.target.value.trim()) setIsSearchOpen(true);
                  }}
                  onFocus={() => {
                    if (searchStudentQuery.trim() && searchResults.length > 0) {
                      setIsSearchOpen(true);
                    }
                  }}
                  className="pl-9 pr-8 bg-white h-9 text-xs sm:text-sm border-slate-200 focus:border-blue-400 rounded-lg shadow-2xs"
                />
                {searchStudentQuery && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchStudentQuery('');
                      setSearchResults([]);
                      setIsSearchOpen(false);
                    }}
                    className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>

              {/* Autocomplete Result Dropdown */}
              {isSearchOpen && (
                <div className="absolute left-0 right-0 mt-1.5 bg-white border border-slate-200 rounded-xl shadow-xl z-50 max-h-80 overflow-y-auto divide-y divide-slate-100">
                  {isSearching ? (
                    <div className="px-4 py-5 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                      Searching students...
                    </div>
                  ) : searchResults.length === 0 ? (
                    <div className="px-4 py-5 text-center text-xs text-slate-400">
                      No students found matching "{searchStudentQuery}"
                    </div>
                  ) : (
                    <>
                      <div className="px-3 py-1.5 bg-slate-50 text-[10px] font-bold text-slate-400 uppercase tracking-wider flex justify-between">
                        <span>Students Found ({searchResults.length})</span>
                        <span className="font-normal text-slate-400">Name - Class</span>
                      </div>
                      {searchResults.map((student) => (
                        <div
                          key={student.id}
                          onClick={() => {
                            setIsSearchOpen(false);
                            navigate(`/classes/${student.class_id}/students?search=${encodeURIComponent(student.name)}`);
                          }}
                          className="px-3 py-2 hover:bg-blue-50/70 cursor-pointer flex items-center justify-between transition-colors group"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-xs shrink-0 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                              {student.name.charAt(0).toUpperCase()}
                            </div>
                            <div className="truncate">
                              <div className="text-xs sm:text-sm font-semibold text-slate-800 truncate">
                                <span>{student.name}</span>
                                <span className="text-slate-400 font-normal mx-1.5">-</span>
                                <span className="text-blue-600 font-semibold">{student.class_name}</span>
                              </div>
                              {student.student_id && (
                                <div className="text-[11px] text-slate-400 font-medium">
                                  ID: <span className="font-mono text-slate-600">{student.student_id}</span>
                                  {student.designation && (
                                    <span className="ml-2 px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded text-[10px]">
                                      {student.designation}
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              )}
            </div>
            <Button
              variant="outline"
              onClick={() => navigate('/students')}
              className="gap-2"
            >
              <Eye className="h-4 w-4" />
              View Students
            </Button>

            {userRole !== 4 && (
              <>
                <Button
                  variant="outline"
                  onClick={() => setIsBulkImportOpen(true)}
                  className="gap-2"
                >
                  <Upload className="h-4 w-4" />
                  Import Students
                </Button>

                <Button
                  onClick={() => setIsAddClassOpen(true)}
                  className="gap-2"
                >
                  <Plus className="h-4 w-4" />
                  Add Class
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Table */}
        <Card>
          <CardHeader>
            <CardTitle className="flex gap-2">
              <BookOpen className="h-5 w-5 text-primary" />
              All Classes
            </CardTitle>
          </CardHeader>

          <CardContent>
            {loading ? (
              <div className="flex justify-center py-10">
                <div className="animate-spin h-8 w-8 border-b-2 border-primary rounded-full" />
              </div>
            ) : classes.length === 0 ? (
              <div className="text-center py-10">
                <p className="text-muted-foreground">No classes yet</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Class Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Total Students</TableHead>
                    <TableHead>Profile Edit</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="w-[60px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {classes.map((classItem) => (
                    <TableRow key={classItem.id}>
                      <TableCell className="font-medium">
                        <button
                          onClick={() => handleViewStudents(classItem)}
                          className="hover:underline text-blue-600 hover:text-blue-800 text-left font-bold transition-colors"
                        >
                          {classItem.name}
                        </button>
                      </TableCell>

                      <TableCell>
                        {classItem.email || '-'}
                      </TableCell>

                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <span className="inline-flex w-fit items-center gap-1 px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-xs font-medium">
                            <Users className="h-3 w-3" />
                            {classItem.student_count || 0} Total
                          </span>
                          <span className="inline-flex w-fit items-center gap-1 px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-xs font-medium">
                            {classItem.active_count || 0} Active
                          </span>
                          <span className="inline-flex w-fit items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-xs font-medium">
                            {classItem.inactive_count || 0} Inactive
                          </span>
                        </div>
                      </TableCell>

                        <TableCell>
                          {classItem.allow_profile_edit !== false ? (
                            <Badge variant="outline" className="bg-green-50 text-green-700 hover:bg-green-100 border-green-200">
                              <Unlock className="w-3 h-3 mr-1" /> Unlocked
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="bg-red-50 text-red-700 hover:bg-red-100 border-red-200">
                              <Lock className="w-3 h-3 mr-1" /> Locked
                            </Badge>
                          )}
                        </TableCell>

                      <TableCell>
                        {new Date(classItem.created_at).toLocaleDateString()}
                      </TableCell>

                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>

                          <DropdownMenuContent align="end">

                            {/* EDIT */}
                            {userRole !== 4 && (
                              <DropdownMenuItem
                                onClick={() => {
                                  setClassToEdit(classItem);
                                  setEditDialogOpen(true);
                                }}
                              >
                                <Pencil className="h-4 w-4 mr-2" />
                                Edit
                              </DropdownMenuItem>
                            )}

                            {/* STUDENTS */}
                            <DropdownMenuItem
                              onClick={() => handleViewStudents(classItem)}
                            >
                              <Users className="h-4 w-4 mr-2" />
                              Students
                            </DropdownMenuItem>

                            {/* TOGGLE ATTENDANCE */}
                            {userRole !== 4 && (
                              <DropdownMenuItem
                                onClick={() => toggleAttendance(classItem)}
                              >
                                <BookOpen className="h-4 w-4 mr-2" />
                                {classItem.is_attendance_enabled === false ? 'Enable Attendance' : 'Disable Attendance'}
                              </DropdownMenuItem>
                            )}

                            {/* DELETE */}
                            {userRole !== 4 && (
                              <DropdownMenuItem
                                onClick={() => {
                                  setClassToDelete(classItem);
                                  setDeleteDialogOpen(true);
                                }}
                                className="text-destructive"
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Delete
                              </DropdownMenuItem>
                            )}

                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Dialogs */}

      <AddClassDialog
        open={isAddClassOpen}
        onOpenChange={setIsAddClassOpen}
        onSuccess={fetchClasses}
      />

      <EditClassDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        onSuccess={fetchClasses}
        classData={classToEdit}
      />

      <BulkStudentImportDialog
        open={isBulkImportOpen}
        onOpenChange={setIsBulkImportOpen}
        onSuccess={fetchClasses}
      />

      {/* Delete Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={(open) => {
        setDeleteDialogOpen(open);
        if (!open) {
          setClassToDelete(null);
          setDeleteConfirmText('');
        }
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Class</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  Are you sure you want to delete "{classToDelete?.name}"? This action cannot be undone.
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
              onClick={() => classToDelete && handleDelete(classToDelete.id)}
              disabled={deleteConfirmText !== 'DELETE'}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* View Students Dialog */}
      <Dialog open={isViewStudentsOpen} onOpenChange={setIsViewStudentsOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              Select Class to View Students
            </DialogTitle>
            <DialogDescription>
              Choose a class to view and manage its students
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {classes.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">No classes available</p>
            ) : (
              classes.map((classItem) => (
                <button
                  key={classItem.id}
                  onClick={() => {
                    handleViewStudents(classItem);
                    setIsViewStudentsOpen(false);
                  }}
                  className="w-full text-left px-4 py-3 rounded-lg border border-border hover:bg-muted transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-foreground">{classItem.name}</div>
                      {classItem.description && (
                        <div className="text-sm text-muted-foreground">{classItem.description}</div>
                      )}
                      {classItem.email && (
                        <div className="text-xs text-muted-foreground mt-1">{classItem.email}</div>
                      )}
                    </div>
                    <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-blue-100 text-blue-700 text-sm font-medium whitespace-nowrap ml-2">
                      <Users className="h-4 w-4" />
                      {classItem.student_count || 0}
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

    </DashboardLayout>
  );
}
