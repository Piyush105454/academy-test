import { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Mail, Shield, KeyRound } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
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

interface UserProfile {
  id: string;
  email: string;
  full_name: string | null;
  role_id: number | null;
  is_active: boolean;
  created_at: string;
}

interface Role {
  id: number;
  name: string;
  description: string | null;
}

export default function AdminPanel() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [userRole, setUserRole] = useState<number | null>(null);
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [formData, setFormData] = useState({
    email: '',
    full_name: '',
    role_id: '',
    password: '',
    new_password: '',
  });
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<UserProfile | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');

  // Standalone Reset Password State
  const [resetPasswordOpen, setResetPasswordOpen] = useState(false);
  const [resetTargetUser, setResetTargetUser] = useState<UserProfile | null>(null);
  const [resetPasswordInput, setResetPasswordInput] = useState('');
  const [resettingPassword, setResettingPassword] = useState(false);

  const handleOpenResetPassword = (u: UserProfile) => {
    setResetTargetUser(u);
    setResetPasswordInput('');
    setResetPasswordOpen(true);
  };

  const handleStandaloneResetPassword = async () => {
    if (!resetTargetUser || !resetPasswordInput) return;
    if (resetPasswordInput.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }

    try {
      setResettingPassword(true);
      const { error } = await supabase.rpc('admin_reset_user_password', {
        target_user_id: resetTargetUser.id,
        new_password: resetPasswordInput,
      });

      if (error) {
        toast.error(`Reset password failed: ${error.message}`);
      } else {
        toast.success(`Password updated successfully for ${resetTargetUser.full_name || resetTargetUser.email}`);
        setResetPasswordOpen(false);
        setResetPasswordInput('');
        setResetTargetUser(null);
      }
    } catch (err: any) {
      toast.error('Failed to reset password: ' + (err.message || 'Error'));
    } finally {
      setResettingPassword(false);
    }
  };

  useEffect(() => {
    if (user?.id) {
      checkAdminAccess();
    }
  }, [user?.id]);

  const checkAdminAccess = async () => {
    try {
      setCheckingAccess(true);
      const { data, error } = await supabase
        .from('user_profiles')
        .select('role_id')
        .eq('id', user?.id)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('Error checking access:', error);
      }

      if (data?.role_id === 1) {
        // User is Admin (role_id = 1)
        setUserRole(data.role_id);
        loadRoles();
        loadUsers();
      } else {
        // User is not Admin, redirect to dashboard
        toast.error('Access denied. Admin panel is only for administrators.');
        navigate('/dashboard', { replace: true });
      }
    } catch (error) {
      console.error('Error checking admin access:', error);
      navigate('/dashboard', { replace: true });
    } finally {
      setCheckingAccess(false);
    }
  };

  const loadRoles = async () => {
    try {
      const { data, error } = await supabase
        .from('roles')
        .select('*')
        .order('id');

      if (error) throw error;
      setRoles(data || []);
    } catch (error) {
      console.error('Error loading roles:', error);
      toast.error('Failed to load roles');
    }
  };

  const loadUsers = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .in('role_id', [1, 2]) // Admin and Supervisor accounts only
        .order('created_at', { ascending: false });

      if (error) throw error;
      setUsers(data || []);
    } catch (error) {
      console.error('Error loading users:', error);
      toast.error('Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDialog = (user?: UserProfile) => {
    if (user) {
      setEditingUser(user);
      setFormData({
        email: user.email,
        full_name: user.full_name || '',
        role_id: user.role_id?.toString() || '',
        password: '',
        new_password: '',
      });
    } else {
      setEditingUser(null);
      setFormData({
        email: '',
        full_name: '',
        role_id: '',
        password: '',
        new_password: '',
      });
    }
    setDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setEditingUser(null);
    setFormData({
      email: '',
      full_name: '',
      role_id: '',
      password: '',
      new_password: '',
    });
  };

  const handleSaveUser = async () => {
    try {
      if (!formData.email || !formData.role_id) {
        toast.error('Email and role are required');
        return;
      }

      if (editingUser) {
        // Update existing user
        const { error } = await supabase
          .from('user_profiles')
          .update({
            email: formData.email,
            full_name: formData.full_name,
            role_id: parseInt(formData.role_id),
            updated_at: new Date().toISOString(),
          })
          .eq('id', editingUser.id);

        if (error) throw error;

        // If a new password is provided, reset it using RPC
        if (formData.new_password) {
          const { error: rpcError } = await supabase.rpc('admin_reset_user_password', {
            target_user_id: editingUser.id,
            new_password: formData.new_password
          });

          if (rpcError) {
            console.error('RPC update error:', rpcError);
            toast.error(`User profile updated, but password reset failed: ${rpcError.message}`);
          } else {
            toast.success('User profile and password updated successfully');
          }
        } else {
          toast.success('User updated successfully');
        }
      } else {
        // Create new auth user with password
        if (!formData.password) {
          toast.error('Password is required for new users');
          return;
        }

        const { data: authData, error: authError } = await supabase.auth.signUp({
          email: formData.email,
          password: formData.password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth`,
            data: {
              skip_email_verification: true
            }
          }
        });

        if (authError) {
          console.error('Auth error:', authError);
          if (authError.message?.includes('already registered')) {
            toast.error('This email is already registered');
          } else {
            toast.error(`Error: ${authError.message || 'Failed to create user'}`);
          }
          return;
        }

        if (!authData.user?.id) {
          toast.error('Failed to create user account');
          return;
        }

        // Create user profile with the auth user ID
        const { error: profileError } = await supabase
          .from('user_profiles')
          .insert([{
            id: authData.user.id,
            email: formData.email,
            full_name: formData.full_name || null,
            role_id: parseInt(formData.role_id),
            is_active: true,
          }]);

        if (profileError) {
          console.error('Profile error:', profileError);
          toast.error(`Error: ${profileError.message || 'Failed to create user profile'}`);
          return;
        }

        // Sign out the newly created user to prevent auto-login
        // This ensures the new user is NOT logged in
        await supabase.auth.signOut();

        toast.success('User created successfully. They can login with their email and password.');
        handleCloseDialog();
        loadUsers();
        return;
      }

      handleCloseDialog();
      loadUsers();
    } catch (error) {
      console.error('Error saving user:', error);
      toast.error('Failed to save user');
    }
  };

  const handleDeleteUser = async (userId: string) => {
    try {
      // First, delete the user profile from user_profiles table
      const { error: profileError } = await supabase
        .from('user_profiles')
        .delete()
        .eq('id', userId);

      if (profileError) throw profileError;

      // Then, delete the auth user account
      // Note: This requires admin privileges in Supabase
      const { error: authError } = await supabase.auth.admin.deleteUser(userId);

      if (authError) {
        console.error('Error deleting auth user:', authError);
        // If auth deletion fails, the profile is already deleted, so show partial success
        toast.success('User profile deleted. Auth account may need manual deletion from Supabase console.');
      } else {
        toast.success('User and auth account deleted successfully');
      }

      loadUsers();
    } catch (error) {
      console.error('Error deleting user:', error);
      toast.error('Failed to delete user');
    } finally {
      setDeleteDialogOpen(false);
      setUserToDelete(null);
      setDeleteConfirmText('');
    }
  };

  const getRoleName = (roleId: number | null) => {
    if (!roleId) return 'Unassigned';
    const role = roles.find(r => r.id === roleId);
    return role?.name || 'Unknown';
  };

  return (
    <DashboardLayout>
      {checkingAccess ? (
        <div className="flex items-center justify-center py-12">
          <div className="flex flex-col items-center gap-4">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
            <p className="text-muted-foreground">Checking access...</p>
          </div>
        </div>
      ) : userRole !== 1 ? (
        <div className="flex items-center justify-center py-12">
          <Card className="max-w-md">
            <CardContent className="pt-6">
              <div className="text-center space-y-4">
                <Shield className="h-12 w-12 text-destructive mx-auto" />
                <h2 className="text-xl font-bold">Access Denied</h2>
                <p className="text-muted-foreground">
                  You do not have permission to access the Admin Panel. Only administrators can access this page.
                </p>
                <Button onClick={() => navigate('/dashboard')}>
                  Go to Dashboard
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : (
        <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">
              <Shield className="h-8 w-8" />
              Admin & Supervisor Management
            </h1>
            <p className="text-muted-foreground mt-1">Manage system administrators and supervisors</p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => handleOpenDialog()} className="gap-2">
                <Plus className="h-4 w-4" />
                Add Admin / Supervisor
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  {editingUser ? 'Edit Admin / Supervisor' : 'Add New Admin / Supervisor'}
                </DialogTitle>
                <DialogDescription>
                  {editingUser
                    ? 'Update administrator or supervisor account details'
                    : 'Add a new administrator or supervisor'}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="email">Email Address</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="user@example.com"
                    value={formData.email}
                    onChange={(e) =>
                      setFormData({ ...formData, email: e.target.value })
                    }
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="full_name">Full Name</Label>
                  <Input
                    id="full_name"
                    type="text"
                    placeholder="John Doe"
                    value={formData.full_name}
                    onChange={(e) =>
                      setFormData({ ...formData, full_name: e.target.value })
                    }
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="role">Role</Label>
                  <Select
                    value={formData.role_id}
                    onValueChange={(value) =>
                      setFormData({ ...formData, role_id: value })
                    }
                  >
                    <SelectTrigger id="role" className="mt-1">
                      <SelectValue placeholder="Select a role" />
                    </SelectTrigger>
                    <SelectContent>
                      {roles.filter(r => r.id === 1 || r.id === 2).map((role) => (
                        <SelectItem key={role.id} value={role.id.toString()}>
                          {role.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {!editingUser && (
                  <div>
                    <Label htmlFor="password">Password</Label>
                    <Input
                      id="password"
                      type="password"
                      placeholder="Enter password"
                      value={formData.password}
                      onChange={(e) =>
                        setFormData({ ...formData, password: e.target.value })
                      }
                      className="mt-1"
                    />
                    <p className="text-xs text-muted-foreground mt-1">User will login with this password</p>
                  </div>
                )}
                {editingUser && (
                  <div>
                    <Label htmlFor="new_password">Reset Password (Optional)</Label>
                    <Input
                      id="new_password"
                      type="password"
                      placeholder="Enter new password to reset"
                      value={formData.new_password}
                      onChange={(e) =>
                        setFormData({ ...formData, new_password: e.target.value })
                      }
                      className="mt-1"
                    />
                    <p className="text-xs text-muted-foreground mt-1">Leave blank to keep current password</p>
                  </div>
                )}
                <div className="flex gap-3 pt-4">
                  <Button
                    variant="outline"
                    onClick={handleCloseDialog}
                  >
                    Cancel
                  </Button>
                  <Button onClick={handleSaveUser}>
                    {editingUser ? 'Update User' : 'Add User'}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Users Table */}
        <Card>
          <CardHeader>
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <CardTitle>Admin & Supervisor Accounts</CardTitle>
                <CardDescription>
                  Manage system administrators and supervisors
                </CardDescription>
              </div>
              <div className="flex flex-col sm:flex-row items-center gap-2">
                <div className="relative w-full sm:w-64">
                  <Input
                    placeholder="Search name or email..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="h-9 pr-8"
                  />
                  {searchQuery && (
                    <button 
                      onClick={() => setSearchQuery('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      ×
                    </button>
                  )}
                </div>
                <Select value={roleFilter} onValueChange={setRoleFilter}>
                  <SelectTrigger className="w-full sm:w-48 h-9">
                    <SelectValue placeholder="Filter by Role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Admin/Supervisor Roles</SelectItem>
                    {roles.filter(r => r.id === 1 || r.id === 2).map((role) => (
                      <SelectItem key={role.id} value={role.id.toString()}>
                        {role.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            ) : users.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-muted-foreground">No users found</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Email</TableHead>
                      <TableHead>Full Name</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users
                      .filter(u => {
                        const studentRole = roles.find(r => r.name.toLowerCase() === 'student');
                        if (studentRole && u.role_id === studentRole.id) return false;
                        
                        const matchesRole = roleFilter === 'all' || u.role_id?.toString() === roleFilter;
                        const matchesSearch = !searchQuery || 
                          u.email.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          (u.full_name?.toLowerCase().includes(searchQuery.toLowerCase()));
                        return matchesRole && matchesSearch;
                      })
                      .map((user) => (
                      <TableRow key={user.id}>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            <Mail className="h-4 w-4 text-muted-foreground" />
                            {user.email}
                          </div>
                        </TableCell>
                        <TableCell>{user.full_name || '-'}</TableCell>
                        <TableCell>
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                            {getRoleName(user.role_id)}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                              user.is_active
                                ? 'bg-green-100 text-green-800'
                                : 'bg-gray-100 text-gray-800'
                            }`}
                          >
                            {user.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {new Date(user.created_at).toLocaleDateString()}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              title="Edit Details"
                              onClick={() => handleOpenDialog(user)}
                            >
                              <Edit2 className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              title="Reset Password"
                              onClick={() => handleOpenResetPassword(user)}
                              className="text-amber-500 hover:text-amber-600"
                            >
                              <KeyRound className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              title="Delete User"
                              onClick={() => {
                                setUserToDelete(user);
                                setDeleteDialogOpen(true);
                              }}
                              className="text-destructive hover:text-destructive"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Roles Reference */}
        <Card>
          <CardHeader>
            <CardTitle>Available Roles</CardTitle>
            <CardDescription>
              Reference guide for user roles in the system
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {roles.map((role) => (
                <div
                  key={role.id}
                  className="p-4 border border-border rounded-lg"
                >
                  <div className="flex items-start gap-3">
                    <Shield className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                    <div>
                      <h3 className="font-semibold text-foreground">{role.name}</h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        {role.description || 'No description'}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={(open) => {
        setDeleteDialogOpen(open);
        if (!open) {
          setUserToDelete(null);
          setDeleteConfirmText('');
        }
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete User</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  Are you sure you want to delete user "{userToDelete?.full_name || userToDelete?.email}"? This action cannot be undone.
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
              onClick={() => userToDelete && handleDeleteUser(userToDelete.id)}
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
              Reset Password for {resetTargetUser?.full_name || resetTargetUser?.email}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-3">
            <div className="space-y-2">
              <Label className="text-xs font-semibold text-foreground">New Password</Label>
              <Input
                type="password"
                placeholder="Enter new password (min 6 characters)"
                value={resetPasswordInput}
                onChange={e => setResetPasswordInput(e.target.value)}
                autoFocus
              />
              <p className="text-xs text-muted-foreground">
                Account Email: <strong className="text-foreground">{resetTargetUser?.email}</strong>
              </p>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <Button variant="outline" size="sm" onClick={() => setResetPasswordOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleStandaloneResetPassword}
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
