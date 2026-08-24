import { useState, useEffect } from 'react';
import { Plus, Trash2, MoreVertical, BookOpen, Users, Upload, Pencil, Eye } from 'lucide-react';
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

interface Class {
  id: string;
  name: string;
  description: string | null;
  email: string | null;
  created_at: string;
  updated_at: string;
  student_count?: number;
  allow_profile_edit?: boolean;
}

export default function Classes() {
  const navigate = useNavigate();
  const { selectedYear } = useAcademicYear();

  const [classes, setClasses] = useState<Class[]>([]);
  const [loading, setLoading] = useState(true);

  const [isAddClassOpen, setIsAddClassOpen] = useState(false);
  const [isBulkImportOpen, setIsBulkImportOpen] = useState(false);
  const [isViewStudentsOpen, setIsViewStudentsOpen] = useState(false);

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [classToDelete, setClassToDelete] = useState<Class | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');

  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [classToEdit, setClassToEdit] = useState<Class | null>(null);

  useEffect(() => {
    fetchClasses();
  }, [selectedYear]);

  const fetchClasses = async () => {
    try {
      setLoading(true);

      const { data, error } = await supabase
        .from('classes')
        .select('id, name, description, email, allow_profile_edit, created_at, updated_at')
        .neq('id', '00000000-0000-0000-0000-000000000000')
        .neq('name', '__SYSTEM_DEV_MODE__')
        .order('name', { ascending: true });

      if (error) throw error;

      // Fetch student count for each class, filtered by academic year
      const classesWithCounts = await Promise.all(
        (data || []).map(async (classItem) => {
          const { count, error: countError } = await supabase
            .from('students')
            .select('*', { count: 'exact', head: true })
            .eq('class_id', classItem.id)
            .eq('academic_year', selectedYear);

          return {
            ...classItem,
            student_count: countError ? 0 : (count || 0),
          };
        })
      );

      setClasses(classesWithCounts);
    } catch (error) {
      console.error(error);
      toast.error('Failed to load classes');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase.from('classes').delete().eq('id', id);

      if (error) throw error;

      const targetClass = classes.find(c => c.id === id);
      await logActivity('DELETE', 'Classes', `Deleted class: ${targetClass ? targetClass.name : id}`);

      toast.success('Class deleted');
      setClasses(classes.filter((c) => c.id !== id));

      setDeleteDialogOpen(false);
      setClassToDelete(null);
    } catch (error) {
      console.error(error);
      toast.error('Failed to delete class');
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

          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setIsViewStudentsOpen(true)}
              className="gap-2"
            >
              <Eye className="h-4 w-4" />
              View Students
            </Button>

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
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-blue-100 text-blue-700 text-sm font-medium">
                          <Users className="h-4 w-4" />
                          {classItem.student_count || 0}
                        </span>
                      </TableCell>

                      <TableCell>
                        {classItem.allow_profile_edit !== false ? (
                          <Badge variant="outline" className="bg-green-50 text-green-700 hover:bg-green-100 border-green-200">
                            🔓 Unlocked
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-red-50 text-red-700 hover:bg-red-100 border-red-200">
                            🔒 Locked
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
                            <DropdownMenuItem
                              onClick={() => {
                                setClassToEdit(classItem);
                                setEditDialogOpen(true);
                              }}
                            >
                              <Pencil className="h-4 w-4 mr-2" />
                              Edit
                            </DropdownMenuItem>

                            {/* STUDENTS */}
                            <DropdownMenuItem
                              onClick={() => handleViewStudents(classItem)}
                            >
                              <Users className="h-4 w-4 mr-2" />
                              Students
                            </DropdownMenuItem>

                            {/* DELETE */}
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
