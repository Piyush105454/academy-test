import { useState, useEffect } from 'react';
import { Plus, MoreVertical, Trash2, BookOpen, KeyRound, Edit, Link } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { AddCoordinatorDialog } from '@/components/coordinators/AddCoordinatorDialog';
import { SessionTypeDialog } from '@/components/sessions/SessionTypeDialog';
import { AddSessionDialog } from '@/components/sessions/AddSessionDialog';

interface Coordinator {
  id: string;
  name: string;
  email: string;
  phone: string;
  location: string;
  status: string;
  assigned_classes?: string[];
}

export function Coordinators() {
  const navigate = useNavigate();
  const [coordinators, setCoordinators] = useState<Coordinator[]>([]);
  const [loading, setLoading] = useState(true);
  const [openDialog, setOpenDialog] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedCoordinator, setSelectedCoordinator] = useState<Coordinator | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [isTypeDialogOpen, setIsTypeDialogOpen] = useState(false);
  const [isFormDialogOpen, setIsFormDialogOpen] = useState(false);
  const [selectedSessionType, setSelectedSessionType] = useState<'guest_teacher' | 'guest_speaker' | null>(null);
  const { toast } = useToast();

  // Reset Password States
  const [resetPasswordOpen, setResetPasswordOpen] = useState(false);
  const [resetTarget, setResetTarget] = useState<Coordinator | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [resettingPassword, setResettingPassword] = useState(false);

  const handleOpenResetPassword = (coordinator: Coordinator) => {
    setResetTarget(coordinator);
    setNewPassword('');
    setResetPasswordOpen(true);
  };

  const handleResetPassword = async () => {
    if (!resetTarget || !newPassword) return;
    if (newPassword.length < 6) {
      toast({ title: 'Error', description: 'Password must be at least 6 characters', variant: 'destructive' });
      return;
    }

    try {
      setResettingPassword(true);
      const normalizedEmail = resetTarget.email.trim().toLowerCase();

      // Check if user profile exists
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('id')
        .ilike('email', normalizedEmail)
        .maybeSingle();

      if (profile?.id) {
        // User profile exists, reset password via RPC
        const { error: rpcError } = await supabase.rpc('admin_reset_user_password', {
          target_user_id: profile.id,
          new_password: newPassword,
        });

        if (rpcError) throw rpcError;
      } else {
        // User profile does not exist in auth.users yet. Register auth user & profile!
        const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
          email: normalizedEmail,
          password: newPassword,
          options: {
            data: { full_name: resetTarget.name }
          }
        });

        if (signUpError) throw signUpError;

        if (signUpData.user?.id) {
          await supabase.from('user_profiles').upsert({
            id: signUpData.user.id,
            email: normalizedEmail,
            full_name: resetTarget.name,
            role_id: 3, // Coordinator
            is_active: true
          });
        }
      }

      toast({ title: 'Success', description: `Password set successfully for ${resetTarget.name}. User can now log in.` });
      setResetPasswordOpen(false);
      setNewPassword('');
      setResetTarget(null);
    } catch (err: any) {
      console.error('Error in handleResetPassword:', err);
      toast({ title: 'Error', description: 'Failed to set password: ' + (err.message || ''), variant: 'destructive' });
    } finally {
      setResettingPassword(false);
    }
  };

  // Edit Coordinator States
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingCoordinator, setEditingCoordinator] = useState<Coordinator | null>(null);
  const [editForm, setEditForm] = useState({
    name: '',
    email: '',
    phone: '',
    location: '',
    status: 'active',
  });
  const [savingEdit, setSavingEdit] = useState(false);

  const handleOpenEdit = (c: Coordinator) => {
    setEditingCoordinator(c);
    setEditForm({
      name: c.name || '',
      email: c.email || '',
      phone: c.phone || '',
      location: c.location || '',
      status: c.status || 'active',
    });
    setIsEditOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!editingCoordinator) return;
    if (!editForm.name.trim() || !editForm.email.trim()) {
      toast({ title: 'Error', description: 'Name and email are required', variant: 'destructive' });
      return;
    }

    try {
      setSavingEdit(true);
      const normalizedEmail = editForm.email.trim().toLowerCase();

      // Check if email belongs to an existing facilitator
      const { data: existingFac } = await (supabase as any)
        .from('facilitators')
        .select('id, name')
        .ilike('email', normalizedEmail)
        .maybeSingle();

      if (existingFac) {
        toast({
          title: 'Email Already Registered',
          description: `This email is already registered as a Facilitator (${existingFac.name}). Cannot use duplicate email.`,
          variant: 'destructive',
        });
        setSavingEdit(false);
        return;
      }

      const { error } = await supabase
        .from('coordinators')
        .update({
          name: editForm.name.trim(),
          email: normalizedEmail,
          phone: editForm.phone.trim(),
          location: editForm.location.trim(),
          status: editForm.status,
          updated_at: new Date().toISOString(),
        })
        .eq('id', editingCoordinator.id);

      if (error) throw error;

      toast({ title: 'Success', description: 'Coordinator updated successfully' });
      setIsEditOpen(false);
      setEditingCoordinator(null);
      fetchCoordinators();
    } catch (err: any) {
      toast({ title: 'Error', description: 'Failed to update coordinator: ' + (err.message || ''), variant: 'destructive' });
    } finally {
      setSavingEdit(false);
    }
  };

  // Assign Classes States
  const [isAssignDialogOpen, setIsAssignDialogOpen] = useState(false);
  const [assigningCoordinator, setAssigningCoordinator] = useState<Coordinator | null>(null);
  const [allClasses, setAllClasses] = useState<{ id: string; name: string }[]>([]);
  const [assignedClassesMap, setAssignedClassesMap] = useState<Record<string, Record<string, boolean>>>({});
  const [savingAssign, setSavingAssign] = useState(false);

  const handleOpenAssignDialog = async (c: Coordinator) => {
    setAssigningCoordinator(c);
    setIsAssignDialogOpen(true);
    // Fetch all classes
    const { data } = await supabase.from('classes').select('id, name').neq('name', '__SYSTEM_DEV_MODE__').neq('id', '00000000-0000-0000-0000-000000000000').order('name');
    if (data) {
      setAllClasses(data);
      const existingMap: Record<string, boolean> = {};
      const existingNames = new Set(c.assigned_classes || []);
      data.forEach(cls => {
        if (existingNames.has(cls.name)) {
          existingMap[cls.id] = true;
        }
      });
      setAssignedClassesMap(prev => ({
        ...prev,
        [c.id]: existingMap
      }));
    }
  };

  const handleSaveAssignments = async () => {
    if (!assigningCoordinator) return;
    try {
      setSavingAssign(true);
      const cId = assigningCoordinator.id;
      const selectedClassIds = Object.entries(assignedClassesMap[cId] || {})
        .filter(([_, checked]) => checked)
        .map(([classId]) => classId);

      const selectedClassNames = allClasses
        .filter(cls => selectedClassIds.includes(cls.id))
        .map(cls => cls.name);

      // Save persistent class assignment map
      let allMap: Record<string, string[]> = {};
      try {
        const stored = localStorage.getItem('coordinator_assigned_classes');
        if (stored) allMap = JSON.parse(stored);
      } catch (e) {}

      allMap[cId] = selectedClassNames;
      if (assigningCoordinator.email) {
        allMap[assigningCoordinator.email.toLowerCase().trim()] = selectedClassNames;
      }
      localStorage.setItem('coordinator_assigned_classes', JSON.stringify(allMap));

      setCoordinators(prev =>
        prev.map(c => c.id === cId ? { ...c, assigned_classes: selectedClassNames } : c)
      );

      toast({ title: 'Success', description: `Classes assigned successfully to ${assigningCoordinator.name}` });
      setIsAssignDialogOpen(false);
    } catch (err: any) {
      toast({ title: 'Error', description: 'Failed to save class assignments', variant: 'destructive' });
    } finally {
      setSavingAssign(false);
    }
  };

  useEffect(() => {
    fetchCoordinators();
  }, []);

  const fetchCoordinators = async () => {
    try {
      setLoading(true);
      const { data: coordData, error: coordErr } = await supabase
        .from('coordinators')
        .select('*')
        .order('name', { ascending: true });

      if (coordErr) throw coordErr;

      let storedMap: Record<string, string[]> = {};
      try {
        const stored = localStorage.getItem('coordinator_assigned_classes');
        if (stored) storedMap = JSON.parse(stored);
      } catch (e) {}

      const enriched = (coordData || []).map(c => {
        const assigned = storedMap[c.id] || storedMap[c.email?.toLowerCase()?.trim()] || [];
        return {
          ...c,
          assigned_classes: assigned
        };
      });

      setCoordinators(enriched);
    } catch (error) {
      console.error('Error fetching coordinators:', error);
      toast({
        title: 'Error',
        description: 'Failed to load coordinators',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase
        .from('coordinators')
        .delete()
        .eq('id', id);

      if (error) throw error;

      setCoordinators(coordinators.filter(c => c.id !== id));
      toast({
        title: 'Success',
        description: 'Coordinator deleted successfully',
      });
    } catch (error) {
      console.error('Error deleting coordinator:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete coordinator',
        variant: 'destructive',
      });
    } finally {
      setDeleteDialogOpen(false);
      setSelectedCoordinator(null);
    }
  };

  const handleAddSession = () => {
    setIsTypeDialogOpen(true);
  };

  const handleSessionTypeSelect = (type: 'guest_teacher' | 'guest_speaker') => {
    setSelectedSessionType(type);
    setIsFormDialogOpen(true);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl md:text-3xl font-bold text-foreground">Coordinators</h1>
            <p className="text-sm md:text-base text-muted-foreground mt-1">
              Manage coordinators and supervisors
            </p>
          </div>
          <Button
            onClick={() => setOpenDialog(true)}
            className="gap-2 w-full sm:w-auto"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Add Coordinator</span>
            <span className="sm:hidden">Add</span>
          </Button>
        </div>

        {/* Coordinators Table */}
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle>All Coordinators</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            ) : coordinators.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-sm md:text-base text-muted-foreground mb-4">
                  No coordinators yet. Add one to get started!
                </p>
                <Button onClick={() => setOpenDialog(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Coordinator
                </Button>
              </div>
            ) : (
              <>
                {/* Desktop Table View */}
                <div className="hidden md:block overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Assigned Classes</TableHead>
                        <TableHead>Phone</TableHead>
                        <TableHead>Location</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="w-[60px]">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {coordinators.map((coordinator) => (
                        <TableRow key={coordinator.id}>
                          <TableCell className="font-medium">{coordinator.name}</TableCell>
                          <TableCell className="max-w-[200px] truncate">{coordinator.email}</TableCell>
                          <TableCell className="max-w-[220px]">
                            <div className="flex flex-wrap gap-1">
                              {(() => {
                                const classes = coordinator.assigned_classes || [];
                                if (classes.length === 0) return <span className="text-xs text-muted-foreground">None</span>;
                                return classes.map((name: string) => (
                                  <Badge key={name} variant="outline" className="bg-primary/5 text-primary border-primary/20 text-[10px] py-0.5 px-1.5 font-medium">
                                    {name}
                                  </Badge>
                                ));
                              })()}
                            </div>
                          </TableCell>
                          <TableCell>{coordinator.phone || '-'}</TableCell>
                          <TableCell>{coordinator.location || '-'}</TableCell>
                          <TableCell>
                            <Badge variant={coordinator.status === 'active' ? 'default' : 'secondary'}>
                              {coordinator.status}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8">
                                  <MoreVertical className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                               <DropdownMenuContent align="end" className="bg-popover">
                                 <DropdownMenuItem
                                   onClick={() => handleOpenEdit(coordinator)}
                                 >
                                   <Edit className="h-4 w-4 mr-2" />
                                   Edit Details
                                 </DropdownMenuItem>
                                 <DropdownMenuItem
                                   onClick={() => handleOpenResetPassword(coordinator)}
                                 >
                                   <KeyRound className="h-4 w-4 mr-2 text-amber-500" />
                                   Reset Password
                                 </DropdownMenuItem>
                                 <DropdownMenuItem
                                   onClick={() => handleOpenAssignDialog(coordinator)}
                                 >
                                   <Link className="h-4 w-4 mr-2" />
                                   Assign Classes
                                 </DropdownMenuItem>
                                 <DropdownMenuItem
                                   onClick={handleAddSession}
                                   className="gap-2"
                                 >
                                   <BookOpen className="h-4 w-4" />
                                   Add Session
                                 </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => {
                                    setSelectedCoordinator(coordinator);
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
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {/* Mobile Card View */}
                <div className="md:hidden space-y-4">
                  {coordinators.map((coordinator) => (
                    <div key={coordinator.id} className="bg-muted/50 rounded-lg p-4 space-y-3 border border-border">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <h3 className="font-semibold text-foreground break-words">{coordinator.name}</h3>
                          <p className="text-xs text-muted-foreground mt-1">ID: {coordinator.id.substring(0, 8)}</p>
                        </div>
                        <Badge variant={coordinator.status === 'active' ? 'default' : 'secondary'} className="flex-shrink-0">
                          {coordinator.status}
                        </Badge>
                      </div>

                      <div className="text-xs">
                        <span className="text-muted-foreground block">Email</span>
                        <p className="font-medium break-all text-sm">{coordinator.email}</p>
                      </div>

                      {coordinator.phone && (
                        <div className="text-xs">
                          <span className="text-muted-foreground">Phone</span>
                          <p className="font-medium text-sm">{coordinator.phone}</p>
                        </div>
                      )}

                      {coordinator.location && (
                        <div className="text-xs">
                          <span className="text-muted-foreground">Location</span>
                          <p className="font-medium text-sm">{coordinator.location}</p>
                        </div>
                      )}

                      <div className="flex gap-2 pt-2 border-t border-border">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="outline" size="sm" className="flex-1">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="bg-popover">
                            <DropdownMenuItem
                              onClick={handleAddSession}
                              className="gap-2"
                            >
                              <BookOpen className="h-4 w-4" />
                              Add Session
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => {
                                setSelectedCoordinator(coordinator);
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
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <AddCoordinatorDialog
        open={openDialog}
        onOpenChange={setOpenDialog}
        onSuccess={fetchCoordinators}
      />

      {/* Add Session Dialog - Type Selection */}
      <SessionTypeDialog
        open={isTypeDialogOpen}
        onOpenChange={setIsTypeDialogOpen}
        onSelectType={handleSessionTypeSelect}
      />

      {/* Add Session Dialog - Form */}
      <AddSessionDialog
        open={isFormDialogOpen}
        onOpenChange={setIsFormDialogOpen}
        selectedDate={new Date()}
        sessionType={selectedSessionType}
        onSuccess={fetchCoordinators}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={(open) => {
        setDeleteDialogOpen(open);
        if (!open) {
          setSelectedCoordinator(null);
          setDeleteConfirmText('');
        }
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Coordinator</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  Are you sure you want to delete {selectedCoordinator?.name}? This action cannot be undone.
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
              onClick={() => selectedCoordinator && handleDelete(selectedCoordinator.id)}
              disabled={deleteConfirmText !== 'DELETE'}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reset Password Dialog */}
      <Dialog open={resetPasswordOpen} onOpenChange={setResetPasswordOpen}>
        <DialogContent className="sm:max-w-md bg-card border border-border">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold flex items-center gap-2 text-foreground">
              <KeyRound className="h-5 w-5 text-amber-500" />
              Reset Password for {resetTarget?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-3">
            <div className="space-y-2">
              <Label className="text-xs font-semibold text-foreground">New Password</Label>
              <Input
                type="password"
                placeholder="Enter new password (min 6 characters)"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                autoFocus
              />
              <p className="text-xs text-muted-foreground">
                Account Email: <strong className="text-foreground">{resetTarget?.email}</strong>
              </p>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <Button variant="outline" size="sm" onClick={() => setResetPasswordOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleResetPassword}
              disabled={resettingPassword}
              className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold"
            >
              {resettingPassword ? 'Setting Password...' : 'Update Password'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Details Dialog */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="sm:max-w-md bg-card border border-border">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold flex items-center gap-2 text-foreground">
              <Edit className="h-5 w-5 text-primary" />
              Edit Details — {editingCoordinator?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-3">
            <div className="space-y-2">
              <Label htmlFor="edit-name" className="text-xs font-semibold text-foreground">Full Name</Label>
              <Input
                id="edit-name"
                value={editForm.name}
                onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                placeholder="Enter coordinator name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-email" className="text-xs font-semibold text-foreground">Email Address</Label>
              <Input
                id="edit-email"
                type="email"
                value={editForm.email}
                onChange={e => setEditForm({ ...editForm, email: e.target.value })}
                placeholder="Enter email address"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-phone" className="text-xs font-semibold text-foreground">Phone Number</Label>
              <Input
                id="edit-phone"
                value={editForm.phone}
                onChange={e => setEditForm({ ...editForm, phone: e.target.value })}
                placeholder="Enter phone number"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-location" className="text-xs font-semibold text-foreground">Location</Label>
              <Input
                id="edit-location"
                value={editForm.location}
                onChange={e => setEditForm({ ...editForm, location: e.target.value })}
                placeholder="Enter location"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-status" className="text-xs font-semibold text-foreground">Status</Label>
              <Select value={editForm.status} onValueChange={v => setEditForm({ ...editForm, status: v })}>
                <SelectTrigger id="edit-status">
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setIsEditOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleSaveEdit} disabled={savingEdit} className="bg-primary text-primary-foreground font-bold">
              {savingEdit ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assign Classes Dialog */}
      <Dialog open={isAssignDialogOpen} onOpenChange={setIsAssignDialogOpen}>
        <DialogContent className="max-w-md bg-popover rounded-xl shadow-lg border border-border">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold flex items-center gap-2">
              🔗 Assign Classes — {assigningCoordinator?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 max-h-[350px] overflow-y-auto pr-1 py-2">
            {allClasses.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center">No classes found in database.</p>
            ) : (
              allClasses.map(c => {
                const config = assignedClassesMap[assigningCoordinator?.id || '']?.[c.id] || false;
                return (
                  <div key={c.id} className="flex items-center gap-2.5 p-3 rounded-xl border border-border bg-muted/20">
                    <input
                      type="checkbox"
                      id={`coord-class-${c.id}`}
                      checked={config}
                      onChange={e => {
                        const checked = e.target.checked;
                        const cId = assigningCoordinator?.id || '';
                        setAssignedClassesMap(prev => ({
                          ...prev,
                          [cId]: { ...(prev[cId] || {}), [c.id]: checked }
                        }));
                      }}
                      className="rounded border-input text-primary focus:ring-primary h-4 w-4 cursor-pointer"
                    />
                    <label htmlFor={`coord-class-${c.id}`} className="font-semibold text-sm cursor-pointer select-none flex-1">
                      {c.name}
                    </label>
                  </div>
                );
              })
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setIsAssignDialogOpen(false)} className="rounded-xl">
              Cancel
            </Button>
            <Button size="sm" onClick={handleSaveAssignments} disabled={savingAssign} className="rounded-xl bg-primary hover:bg-primary/95 text-white">
              {savingAssign ? 'Saving...' : 'Save Assignments'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
