import { useState, useEffect } from 'react';
import { Plus, Trash2, MoreVertical, BookOpen, Link, KeyRound, Edit, UserCheck } from 'lucide-react';
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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { SessionTypeDialog } from '@/components/sessions/SessionTypeDialog';
import { AddSessionDialog } from '@/components/sessions/AddSessionDialog';

interface Facilitator {
  id: string;
  name: string;
  email: string;
  phone: string;
  location: string;
  status: string;
  created_at: string;
  facilitator_classes?: any[];
}

export default function Facilitators() {
  const navigate = useNavigate();
  const [facilitators, setFacilitators] = useState<Facilitator[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedFacilitator, setSelectedFacilitator] = useState<Facilitator | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [isTypeDialogOpen, setIsTypeDialogOpen] = useState(false);
  const [isFormDialogOpen, setIsFormDialogOpen] = useState(false);
  const [selectedSessionType, setSelectedSessionType] = useState<'guest_teacher' | 'guest_speaker' | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    location: '',
    status: 'active',
  });

  // Class assignment states
  const [isAssignDialogOpen, setIsAssignDialogOpen] = useState(false);
  const [assigningFacilitator, setAssigningFacilitator] = useState<Facilitator | null>(null);
  const [allClasses, setAllClasses] = useState<{ id: string, name: string }[]>([]);
  const [assignedClasses, setAssignedClasses] = useState<Record<string, { assigned: boolean, link: string }>>({});
  const [savingAssign, setSavingAssign] = useState(false);

  // Reset Password States
  const [resetPasswordOpen, setResetPasswordOpen] = useState(false);
  const [resetTarget, setResetTarget] = useState<Facilitator | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [resettingPassword, setResettingPassword] = useState(false);

  const handleOpenResetPassword = (facilitator: Facilitator) => {
    setResetTarget(facilitator);
    setNewPassword('');
    setResetPasswordOpen(true);
  };

  const handleResetPassword = async () => {
    if (!resetTarget || !newPassword) return;
    if (newPassword.length < 6) {
      toast.error('Password must be at least 6 characters');
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
            role_id: 4, // Facilitator
            is_active: true
          });
        }
      }

      toast.success(`Password set successfully for ${resetTarget.name}. User can now log in.`);
      setResetPasswordOpen(false);
      setNewPassword('');
      setResetTarget(null);
    } catch (err: any) {
      console.error('Error in handleResetPassword:', err);
      toast.error('Failed to set password: ' + (err.message || 'Error occurred'));
    } finally {
      setResettingPassword(false);
    }
  };

  useEffect(() => {
    fetchFacilitators();
  }, []);

  const fetchFacilitators = async () => {
    try {
      setLoading(true);
      
      // Try fetching facilitators with their assigned classes
      const { data, error } = await supabase
        .from('facilitators')
        .select(`
          *,
          facilitator_classes (
            classes (
              name
            )
          )
        `)
        .order('name', { ascending: true });

      if (error) {
        // Fallback to simple facilitators query if facilitator_classes doesn't exist yet
        if (error.code === 'PGRST205' || error.message?.includes('facilitator_classes')) {
          const { data: fallbackData, error: fallbackError } = await supabase
            .from('facilitators')
            .select('*')
            .order('name', { ascending: true });
          if (fallbackError) throw fallbackError;
          setFacilitators(fallbackData || []);
        } else {
          throw error;
        }
      } else {
        setFacilitators(data || []);
      }
    } catch (error) {
      console.error('Error fetching facilitators:', error);
      toast.error('Failed to load facilitators');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name || !formData.email) {
      toast.error('Please fill in required fields');
      return;
    }

    try {
      const normalizedEmail = formData.email.trim().toLowerCase();

      if (!editingId) {
        // Check if email already exists in coordinators
        const { data: existingCoord } = await (supabase as any)
          .from('coordinators')
          .select('id, name')
          .ilike('email', normalizedEmail)
          .maybeSingle();

        if (existingCoord) {
          toast.error(`This email is already registered as a Coordinator (${existingCoord.name}). Cannot register duplicate user.`);
          return;
        }

        // Check if email already exists in user_profiles
        const { data: existingProfile } = await (supabase as any)
          .from('user_profiles')
          .select('id')
          .ilike('email', normalizedEmail)
          .maybeSingle();

        if (existingProfile) {
          toast.error('This email is already registered to an existing user in the system.');
          return;
        }
      }

      if (editingId) {
        const { error } = await supabase
          .from('facilitators')
          .update({
            ...formData,
            email: normalizedEmail
          })
          .eq('id', editingId);

        if (error) throw error;
        toast.success('Facilitator updated successfully');
      } else {
        const { error } = await supabase
          .from('facilitators')
          .insert([{
            ...formData,
            email: normalizedEmail
          }]);

        if (error) throw error;
        toast.success('Facilitator created successfully');
      }

      resetForm();
      fetchFacilitators();
    } catch (error) {
      console.error('Error saving facilitator:', error);
      toast.error('Failed to save facilitator');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase
        .from('facilitators')
        .delete()
        .eq('id', id);

      if (error) throw error;
      toast.success('Facilitator deleted successfully');
      setFacilitators(facilitators.filter((f) => f.id !== id));
    } catch (error) {
      console.error('Error deleting facilitator:', error);
      toast.error('Failed to delete facilitator');
    } finally {
      setDeleteDialogOpen(false);
      setSelectedFacilitator(null);
    }
  };

  const handleEdit = (facilitator: Facilitator) => {
    setFormData({
      name: facilitator.name,
      email: facilitator.email,
      phone: facilitator.phone,
      location: facilitator.location,
      status: facilitator.status,
    });
    setEditingId(facilitator.id);
    setShowForm(true);
  };

  const resetForm = () => {
    setShowForm(false);
    setEditingId(null);
    setFormData({
      name: '',
      email: '',
      phone: '',
      location: '',
      status: 'active',
    });
  };

  const handleAddSession = () => {
    setIsTypeDialogOpen(true);
  };

  const handleSessionTypeSelect = (type: 'guest_teacher' | 'guest_speaker') => {
    setSelectedSessionType(type);
    setIsFormDialogOpen(true);
  };

  const handleOpenAssignDialog = async (facil: Facilitator) => {
    setAssigningFacilitator(facil);
    setIsAssignDialogOpen(true);
    
    // Fetch all classes
    const { data: classesData } = await supabase
      .from('classes')
      .select('id, name')
      .order('name');
    setAllClasses(classesData || []);

    // Fetch current assignments
    const { data: currentAssigned, error: assignmentError } = await supabase
      .from('facilitator_classes')
      .select('class_id, class_link')
      .eq('facilitator_id', facil.id);

    if (assignmentError) {
      console.warn('Could not fetch facilitator_classes assignments (table might not exist yet):', assignmentError);
    }

    const initialAssigned: Record<string, { assigned: boolean, link: string }> = {};
    // Pre-populate
    (classesData || []).forEach(c => {
      initialAssigned[c.id] = { assigned: false, link: '' };
    });
    (currentAssigned || []).forEach(a => {
      initialAssigned[a.class_id] = { assigned: true, link: a.class_link || '' };
    });
    setAssignedClasses(initialAssigned);
  };

  const handleSaveAssignments = async () => {
    if (!assigningFacilitator) return;
    setSavingAssign(true);

    try {
      // 1. Delete all current assignments
      const { error: deleteError } = await supabase
        .from('facilitator_classes')
        .delete()
        .eq('facilitator_id', assigningFacilitator.id);

      if (deleteError) throw deleteError;

      // 2. Insert new selected assignments
      const inserts = Object.entries(assignedClasses)
        .filter(([_, value]) => value.assigned)
        .map(([classId, value]) => ({
          facilitator_id: assigningFacilitator.id,
          class_id: classId,
          class_link: value.link || null
        }));

      if (inserts.length > 0) {
        const { error: insertError } = await supabase
          .from('facilitator_classes')
          .insert(inserts);

        if (insertError) throw insertError;
      }

      toast.success('Class assignments updated successfully');
      setIsAssignDialogOpen(false);
    } catch (err: any) {
      console.error(err);
      if (err.code === 'PGRST205' || err.message?.includes('facilitator_classes') || err.message?.includes('Relation "facilitator_classes" does not exist')) {
        toast.error("Table 'facilitator_classes' does not exist in database. Please run the SQL migration script in your Supabase SQL Editor!");
      } else {
        toast.error('Failed to save class assignments');
      }
    } finally {
      setSavingAssign(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl md:text-3xl font-bold text-foreground">Facilitators</h1>
            <p className="text-sm md:text-base text-muted-foreground mt-1">
              Manage facilitators and instructors
            </p>
          </div>
          <Button
            onClick={() => setShowForm(!showForm)}
            className="gap-2 w-full sm:w-auto"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Add Facilitator</span>
            <span className="sm:hidden">Add</span>
          </Button>
        </div>

        {/* Form */}
        {showForm && (
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle>{editingId ? 'Edit Facilitator' : 'Add New Facilitator'}</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Name *</label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full px-3 py-2 border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                      placeholder="Facilitator name"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Email *</label>
                    <input
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      className="w-full px-3 py-2 border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                      placeholder="Email address"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Phone</label>
                    <input
                      type="tel"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      className="w-full px-3 py-2 border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                      placeholder="Phone number"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Location</label>
                    <input
                      type="text"
                      value={formData.location}
                      onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                      className="w-full px-3 py-2 border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                      placeholder="City or location"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Status</label>
                    <select
                      value={formData.status}
                      onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                      className="w-full px-3 py-2 border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                    >
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button type="submit">
                    {editingId ? 'Update Facilitator' : 'Add Facilitator'}
                  </Button>
                  <Button type="button" variant="outline" onClick={resetForm}>
                    Cancel
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Facilitators Table */}
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle>All Facilitators</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            ) : facilitators.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-sm md:text-base text-muted-foreground mb-4">
                  No facilitators yet. Add one to get started!
                </p>
                <Button onClick={() => setShowForm(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Facilitator
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
                      {facilitators.map((facilitator) => (
                        <TableRow key={facilitator.id}>
                          <TableCell className="font-medium">{facilitator.name}</TableCell>
                          <TableCell className="max-w-[200px] truncate">{facilitator.email}</TableCell>
                          <TableCell className="max-w-[220px]">
                            <div className="flex flex-wrap gap-1">
                              {(() => {
                                const classes = facilitator.facilitator_classes || [];
                                const names = classes.map((fc: any) => fc.classes?.name).filter(Boolean);
                                if (names.length === 0) return <span className="text-xs text-muted-foreground">None</span>;
                                return names.map((name: string) => (
                                  <Badge key={name} variant="outline" className="bg-primary/5 text-primary border-primary/20 text-[10px] py-0.5 px-1.5 font-medium">
                                    {name}
                                  </Badge>
                                ));
                              })()}
                            </div>
                          </TableCell>
                          <TableCell>{facilitator.phone || '-'}</TableCell>
                          <TableCell>{facilitator.location || '-'}</TableCell>
                          <TableCell>
                            <Badge variant={facilitator.status === 'active' ? 'default' : 'secondary'}>
                              {facilitator.status}
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
                                  onClick={() => handleEdit(facilitator)}
                                >
                                  <Edit className="h-4 w-4 mr-2" />
                                  Edit Details
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => handleOpenResetPassword(facilitator)}
                                >
                                  <KeyRound className="h-4 w-4 mr-2 text-amber-500" />
                                  Reset Password
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={handleAddSession}
                                  className="gap-2"
                                >
                                  <BookOpen className="h-4 w-4" />
                                  Add Session
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => handleOpenAssignDialog(facilitator)}
                                  className="gap-2"
                                >
                                  <Link className="h-4 w-4" />
                                  Assign Classes
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => {
                                    setSelectedFacilitator(facilitator);
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
                  {facilitators.map((facilitator) => (
                    <div key={facilitator.id} className="bg-muted/50 rounded-lg p-4 space-y-3 border border-border">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <h3 className="font-semibold text-foreground break-words">{facilitator.name}</h3>
                          <p className="text-xs text-muted-foreground mt-1">ID: {facilitator.id.substring(0, 8)}</p>
                        </div>
                        <Badge variant={facilitator.status === 'active' ? 'default' : 'secondary'} className="flex-shrink-0">
                          {facilitator.status}
                        </Badge>
                      </div>

                      <div className="text-xs">
                        <span className="text-muted-foreground block">Email</span>
                        <p className="font-medium break-all text-sm">{facilitator.email}</p>
                      </div>

                      <div className="text-xs">
                        <span className="text-muted-foreground block">Assigned Classes</span>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {(() => {
                            const classes = facilitator.facilitator_classes || [];
                            const names = classes.map((fc: any) => fc.classes?.name).filter(Boolean);
                            if (names.length === 0) return <span className="text-xs text-muted-foreground">None</span>;
                            return names.map((name: string) => (
                              <Badge key={name} variant="outline" className="bg-primary/5 text-primary border-primary/20 text-[10px] py-0.5 px-1.5 font-medium">
                                {name}
                              </Badge>
                            ));
                          })()}
                        </div>
                      </div>

                      {facilitator.phone && (
                        <div className="text-xs">
                          <span className="text-muted-foreground">Phone</span>
                          <p className="font-medium text-sm">{facilitator.phone}</p>
                        </div>
                      )}

                      {facilitator.location && (
                        <div className="text-xs">
                          <span className="text-muted-foreground">Location</span>
                          <p className="font-medium text-sm">{facilitator.location}</p>
                        </div>
                      )}

                      <div className="flex gap-2 pt-2 border-t border-border">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleEdit(facilitator)}
                          className="flex-1"
                        >
                          Edit
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-9 w-9">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="bg-popover">
                            <DropdownMenuItem
                              onClick={() => navigate('/sessions')}
                              className="gap-2"
                            >
                              <BookOpen className="h-4 w-4" />
                              Add Session
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => handleOpenAssignDialog(facilitator)}
                              className="gap-2"
                            >
                              <Link className="h-4 w-4" />
                              Assign Classes
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => {
                                setSelectedFacilitator(facilitator);
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
        onSuccess={fetchFacilitators}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={(open) => {
        setDeleteDialogOpen(open);
        if (!open) {
          setSelectedFacilitator(null);
          setDeleteConfirmText('');
        }
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Facilitator</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  Are you sure you want to delete {selectedFacilitator?.name}? This action cannot be undone.
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
              onClick={() => selectedFacilitator && handleDelete(selectedFacilitator.id)}
              disabled={deleteConfirmText !== 'DELETE'}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Assign Classes Dialog */}
      <Dialog open={isAssignDialogOpen} onOpenChange={setIsAssignDialogOpen}>
        <DialogContent className="max-w-md bg-popover rounded-xl shadow-lg border border-border">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold flex items-center gap-2">
              🔗 Assign Classes — {assigningFacilitator?.name}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 max-h-[350px] overflow-y-auto pr-1 py-2">
            {allClasses.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center">No classes found in database.</p>
            ) : (
              allClasses.map(c => {
                const config = assignedClasses[c.id] || { assigned: false, link: '' };
                return (
                  <div key={c.id} className="flex items-center gap-2.5 p-3 rounded-xl border border-border bg-muted/20">
                    <input
                      type="checkbox"
                      id={`class-${c.id}`}
                      checked={config.assigned}
                      onChange={e => {
                        setAssignedClasses(prev => ({
                          ...prev,
                          [c.id]: { ...config, assigned: e.target.checked }
                        }));
                      }}
                      className="rounded border-input text-primary focus:ring-primary h-4 w-4 cursor-pointer"
                    />
                    <label htmlFor={`class-${c.id}`} className="font-semibold text-sm cursor-pointer select-none flex-1">
                      {c.name}
                    </label>
                  </div>
                );
              })
            )}
          </div>
          
          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsAssignDialogOpen(false)}
              className="rounded-xl"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSaveAssignments}
              disabled={savingAssign}
              className="rounded-xl bg-primary hover:bg-primary/95 text-white"
            >
              {savingAssign ? 'Saving...' : 'Save Assignments'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

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
    </DashboardLayout>
  );
}
