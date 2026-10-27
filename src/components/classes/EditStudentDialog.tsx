import { useState, useEffect } from 'react';
import { Edit, Plus, Trash2, Package, Monitor, Tag, FileText, Upload, Loader2, ExternalLink } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { logActivity } from '@/utils/activityLogger';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';

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
  bank_name?: string | null;
  account_number?: string | null;
  ifsc_code?: string | null;
  allow_profile_edit?: boolean;
  location?: string | null;
  bio?: string | null;
}

interface AssignedItem {
  id?: string;
  student_id: string;
  item_type: 'device' | 'other' | 'document';
  item_name: string;
  item_id: string;
  serial_number: string;
  condition: string;
  isNew?: boolean;
  isDeleted?: boolean;
}

const EMPTY_ITEM = (): Omit<AssignedItem, 'student_id'> => ({
  item_type: 'device',
  item_name: '',
  item_id: '',
  serial_number: '',
  condition: '',
  isNew: true,
});

interface EditStudentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  student: Student | null;
  onSuccess: () => void;
}

export function EditStudentDialog({
  open,
  onOpenChange,
  student,
  onSuccess,
}: EditStudentDialogProps) {
  const [saving, setSaving] = useState(false);
  const [editedStudent, setEditedStudent] = useState<Student | null>(null);
  const [originalEmail, setOriginalEmail] = useState<string | null>(null);
  const [assignedItems, setAssignedItems] = useState<AssignedItem[]>([]);
  const [documents, setDocuments] = useState<AssignedItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [uploadingDocType, setUploadingDocType] = useState<string | null>(null);
  
  const { user } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    if (user?.id) {
      const fetchRole = async () => {
        const { data } = await supabase
          .from('user_profiles')
          .select('role_id')
          .eq('id', user.id)
          .single();
        if (data?.role_id === 1) setIsAdmin(true);
      };
      fetchRole();
    }
  }, [user?.id]);

  useEffect(() => {
    if (student) {
      setEditedStudent(student);
      setOriginalEmail(student.email);
    }
  }, [student, open]);

  useEffect(() => {
    if (open && student) {
      fetchAssignedItems(student.id);
    } else {
      setAssignedItems([]);
    }
  }, [open, student]);

  const fetchAssignedItems = async (studentId: string) => {
    setLoadingItems(true);
    try {
      const { data, error } = await (supabase as any)
        .from('student_assigned_items')
        .select('*')
        .eq('student_id', studentId)
        .order('created_at', { ascending: true });
      if (error) {
        // Table may not exist yet — silently ignore
        console.warn('student_assigned_items table not ready:', error.message);
        setAssignedItems([]);
        setDocuments([]);
      } else {
        const allItems = data || [];
        setAssignedItems(allItems.filter(i => i.item_type !== 'document'));
        setDocuments(allItems.filter(i => i.item_type === 'document'));
      }
    } catch {
      setAssignedItems([]);
    } finally {
      setLoadingItems(false);
    }
  };

  const addItem = () => {
    if (!editedStudent) return;
    setAssignedItems(prev => [
      ...prev,
      { ...EMPTY_ITEM(), student_id: editedStudent.id },
    ]);
  };

  const updateItem = (index: number, field: keyof AssignedItem, value: string) => {
    setAssignedItems(prev =>
      prev.map((item, i) =>
        i === index ? { ...item, [field]: value } : item
      )
    );
  };

  const handleUploadDocument = async (event: React.ChangeEvent<HTMLInputElement>, index: number) => {
    const file = event.target.files?.[0];
    const doc = documents[index];
    if (!file || !editedStudent || !doc || !doc.item_name) {
      if (!doc?.item_name) toast.error('Please select a document type first.');
      return;
    }
    
    if (file.type !== 'application/pdf') {
      toast.error('Only PDF files are allowed for documents.');
      return;
    }
    
    if (file.size > 10 * 1024 * 1024) {
      toast.error('File size must be under 10MB.');
      return;
    }
    
    try {
      setUploadingDocType(`doc-${index}`);
      const { data: { session } } = await supabase.auth.getSession();
      
      const folderPath = ["document", editedStudent.academic_year || 'Unknown Year', editedStudent.designation || 'Unknown Class', `${editedStudent.name} - ${editedStudent.roll_number || editedStudent.student_id}`];
      
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/upload-to-gdrive`;
      
      const formData = new FormData();
      formData.append('file', file);
      formData.append('folderPath', JSON.stringify(folderPath));
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session?.access_token}`
        },
        body: formData
      });
      
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Upload failed');
      }
      
      const result = await response.json();
      
      // Save to database
      const newDoc = {
        student_id: editedStudent.id,
        item_type: 'document' as const,
        item_name: doc.item_name,
        item_id: result.webViewLink,
        serial_number: file.name,
        condition: 'Uploaded'
      };
      
      const { data, error } = await supabase.from('student_assigned_items').insert([newDoc]).select();
      if (error) throw error;
      
      if (data && data.length > 0) {
        setDocuments(prev => prev.map((d, i) => i === index ? data[0] : d));
        toast.success(`${doc.item_name} uploaded successfully`);
      }
      
    } catch (e: any) {
      console.error(e);
      toast.error(e.message || 'Failed to upload document');
    } finally {
      setUploadingDocType(null);
      event.target.value = '';
    }
  };

  const handleDeleteDocument = async (doc: AssignedItem) => {
    if (!doc.id) return;
    try {
      setUploadingDocType(doc.item_name);
      
      // Delete from GDrive
      const { data: { session } } = await supabase.auth.getSession();
      await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/upload-to-gdrive`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token}`
        },
        body: JSON.stringify({ link: doc.item_id })
      });
      
      // Delete from DB
      const { error } = await supabase.from('student_assigned_items').delete().eq('id', doc.id);
      if (error) throw error;
      
      setDocuments(prev => prev.filter(d => d.id !== doc.id));
      toast.success(`${doc.item_name} removed`);
      
    } catch (e: any) {
      console.error(e);
      toast.error('Failed to remove document');
    } finally {
      setUploadingDocType(null);
    }
  };

  const removeItem = (index: number) => {
    setAssignedItems(prev => prev.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    if (!editedStudent || !editedStudent.name.trim()) {
      toast.error('Student name is required');
      return;
    }

    // Bank Account validation if provided
    if (editedStudent.account_number && editedStudent.account_number.trim()) {
      const accountRegex = /^\d{9,18}$/;
      if (!accountRegex.test(editedStudent.account_number.trim())) {
        toast.error('Bank Account Number must be between 9 and 18 digits');
        return;
      }
    }

    // IFSC Code validation if provided
    if (editedStudent.ifsc_code && editedStudent.ifsc_code.trim()) {
      const ifscRegex = /^[A-Za-z]{4}0[A-Za-z0-9]{6}$/;
      if (!ifscRegex.test(editedStudent.ifsc_code.trim())) {
        toast.error('IFSC Code must be an 11-character alphanumeric code (e.g. SBIN0001234)');
        return;
      }
    }

    // Validate assigned items - name required
    for (const item of assignedItems) {
      if (!item.item_name.trim()) {
        toast.error('Item Name is required for all assigned items');
        return;
      }
    }

    try {
      setSaving(true);
      const { error } = await (supabase as any)
        .from('students')
        .update({
          student_id: editedStudent.student_id.trim(),
          name: editedStudent.name.trim(),
          gender: editedStudent.gender || null,
          dob: editedStudent.dob || null,
          email: editedStudent.email || null,
          phone_number: editedStudent.phone_number || null,
          roll_number: editedStudent.roll_number || null,
          subject: editedStudent.subject || null,
          academic_year: editedStudent.academic_year || null,
          designation: editedStudent.designation || null,
          bank_name: editedStudent.bank_name ? editedStudent.bank_name.trim() : null,
          account_number: editedStudent.account_number ? editedStudent.account_number.trim() : null,
          ifsc_code: editedStudent.ifsc_code ? editedStudent.ifsc_code.trim() : null,
          allow_profile_edit: editedStudent.allow_profile_edit !== false,
          location: editedStudent.location ? editedStudent.location.trim() : null,
          bio: editedStudent.bio ? editedStudent.bio.trim() : null,
        })
        .eq('id', editedStudent.id);

      if (error) throw error;

      // Also sync to user_profiles if email exists
      if (editedStudent.email) {
        try {
          await (supabase as any)
            .from('user_profiles')
            .update({
              location: editedStudent.location ? editedStudent.location.trim() : null,
              bio: editedStudent.bio ? editedStudent.bio.trim() : null,
              phone: editedStudent.phone_number || null,
            })
            .ilike('email', editedStudent.email.trim());
        } catch (upErr) {
          console.warn('Could not update user_profiles from EditStudentDialog:', upErr);
        }
      }

      // Save assigned items — delete all existing then re-insert
      try {
        await (supabase as any)
          .from('student_assigned_items')
          .delete()
          .eq('student_id', editedStudent.id);

        if (assignedItems.length > 0) {
          const itemsToInsert = assignedItems.map(item => ({
            student_id: editedStudent.id,
            item_type: item.item_type,
            item_name: item.item_name.trim(),
            item_id: item.item_id?.trim() || null,
            serial_number: item.serial_number?.trim() || null,
            condition: item.condition?.trim() || null,
          }));
          await (supabase as any).from('student_assigned_items').insert(itemsToInsert);
        }
      } catch (itemError: any) {
        console.warn('Could not save assigned items (table may not exist):', itemError?.message);
        toast.warning('Student saved, but assigned items could not be saved. Please run the DB migration first.');
      }

      await logActivity('UPDATE', 'Students', 'Updated student details: ' + editedStudent.name.trim() + ' (Email: ' + editedStudent.email + ')');
      
      // Automatic account creation/update if email is provided
      if (editedStudent.email) {
        try {
          const { data: studentData } = await supabase
            .from('students')
            .select('class_id')
            .eq('id', editedStudent.id)
            .single();
            
          const classId = studentData?.class_id;

          if (classId) {
            const { error: accountError } = await supabase.rpc('ensure_student_account', {
              student_email: editedStudent.email.trim(),
              student_full_name: editedStudent.name.trim(),
              student_class_id: classId,
              old_email: originalEmail?.trim() || null
            });
            
            if (accountError) {
              console.error('Error ensuring student account:', accountError);
              toast.error('Student updated, but account sync failed: ' + accountError.message);
            } else {
              setOriginalEmail(editedStudent.email.trim());
            }
          }
        } catch (accError) {
          console.error('Exception ensuring student account:', accError);
        }
      }

      toast.success('Student updated successfully');
      onOpenChange(false);
      onSuccess();
    } catch (error: any) {
      console.error('Error updating student:', error);
      toast.error('Failed to update student');
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    setEditedStudent(null);
    setAssignedItems([]);
    onOpenChange(false);
  };

  if (!editedStudent) return null;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Edit className="h-5 w-5 text-primary" />
            Edit Student
          </DialogTitle>
          <DialogDescription>
            Update student details
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="student_id" className="text-sm">
                Student ID
              </Label>
              <Input
                id="student_id"
                value={editedStudent.student_id}
                disabled={!isAdmin}
                onChange={(e) => setEditedStudent({ ...editedStudent, student_id: e.target.value })}
                className={cn("mt-1", !isAdmin && "bg-muted")}
              />
              {!isAdmin && <p className="text-xs text-muted-foreground mt-1">Cannot be changed</p>}
            </div>
            <div>
              <Label htmlFor="name" className="text-sm">
                Student Name *
              </Label>
              <Input
                id="name"
                placeholder="Enter student name"
                value={editedStudent.name}
                onChange={(e) =>
                  setEditedStudent({ ...editedStudent, name: e.target.value })
                }
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="gender" className="text-sm">
                Gender
              </Label>
              <Select
                value={editedStudent.gender || 'none'}
                onValueChange={(value) =>
                  setEditedStudent({ ...editedStudent, gender: value === 'none' ? null : value })
                }
              >
                <SelectTrigger id="gender" className="mt-1">
                  <SelectValue placeholder="Select gender" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  <SelectItem value="Male">Male</SelectItem>
                  <SelectItem value="Female">Female</SelectItem>
                  <SelectItem value="Other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="dob" className="text-sm">
                Date of Birth
              </Label>
              <Input
                id="dob"
                type="date"
                value={editedStudent.dob || ''}
                onChange={(e) =>
                  setEditedStudent({ ...editedStudent, dob: e.target.value || null })
                }
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="email" className="text-sm">
                Email
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="student@example.com"
                value={editedStudent.email || ''}
                onChange={(e) =>
                  setEditedStudent({ ...editedStudent, email: e.target.value || null })
                }
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="phone" className="text-sm">
                Phone Number
              </Label>
              <Input
                id="phone"
                placeholder="+1234567890"
                value={editedStudent.phone_number || ''}
                onChange={(e) =>
                  setEditedStudent({ ...editedStudent, phone_number: e.target.value || null })
                }
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="roll_number" className="text-sm">
                Roll Number
              </Label>
              <Input
                id="roll_number"
                placeholder="e.g., 1, 2, 3"
                value={editedStudent.roll_number || ''}
                onChange={(e) =>
                  setEditedStudent({ ...editedStudent, roll_number: e.target.value || null })
                }
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="subject" className="text-sm">
                Subject
              </Label>
              <Select
                value={editedStudent.subject || 'none'}
                onValueChange={(value) =>
                  setEditedStudent({ ...editedStudent, subject: value === 'none' ? null : value })
                }
              >
                <SelectTrigger id="subject" className="mt-1">
                  <SelectValue placeholder="Select subject" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  <SelectItem value="Commerce">Commerce</SelectItem>
                  <SelectItem value="Computer Science">Computer Science</SelectItem>
                  <SelectItem value="Arts">Arts</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="academic_year" className="text-sm">
                Academic Year
              </Label>
              <Select
                value={editedStudent.academic_year || 'none'}
                onValueChange={(value) =>
                  setEditedStudent({ ...editedStudent, academic_year: value === 'none' ? null : value })
                }
              >
                <SelectTrigger id="academic_year" className="mt-1">
                  <SelectValue placeholder="Select year" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  <SelectItem value="2025-26">2025-26</SelectItem>
                  <SelectItem value="2026-27">2026-27</SelectItem>
                  <SelectItem value="2027-28">2027-28</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="designation" className="text-sm">
                Designation
              </Label>
              <Select
                value={editedStudent.designation || 'none'}
                onValueChange={(value) =>
                  setEditedStudent({ ...editedStudent, designation: value === 'none' ? null : value })
                }
              >
                <SelectTrigger id="designation" className="mt-1">
                  <SelectValue placeholder="Select designation" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  <SelectItem value="1. CCC">1. CCC</SelectItem>
                  <SelectItem value="2. Junior Fellow">2. Junior Fellow</SelectItem>
                  <SelectItem value="3. Senior Fellow">3. Senior Fellow</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Bank Details Section */}
          <div className="border-t pt-4 space-y-3">
            <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">Bank Details</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="bank_name" className="text-sm">Bank Name</Label>
                <Input
                  id="bank_name"
                  placeholder="e.g. State Bank of India"
                  value={editedStudent.bank_name || ''}
                  onChange={(e) => setEditedStudent({ ...editedStudent, bank_name: e.target.value || null })}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="account_number" className="text-sm">Account Number</Label>
                <Input
                  id="account_number"
                  placeholder="e.g. 123456789012"
                  value={editedStudent.account_number || ''}
                  onChange={(e) => setEditedStudent({ ...editedStudent, account_number: e.target.value || null })}
                  className="mt-1"
                />
              </div>
              <div className="md:col-span-2">
                <Label htmlFor="ifsc_code" className="text-sm">IFSC Code</Label>
                <Input
                  id="ifsc_code"
                  placeholder="e.g. SBIN0001234"
                  value={editedStudent.ifsc_code || ''}
                  onChange={(e) => setEditedStudent({ ...editedStudent, ifsc_code: e.target.value || null })}
                  className="mt-1"
                />
              </div>
            </div>
          </div>

          {/* Location & Bio Section */}
          <div className="border-t pt-4 space-y-3">
            <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">Location & Bio</h3>
            <div className="grid grid-cols-1 gap-4">
              <div>
                <Label htmlFor="student_location" className="text-sm">Location</Label>
                <Input
                  id="student_location"
                  placeholder="e.g. Dhanpuri, Shahdol"
                  value={editedStudent.location || ''}
                  onChange={(e) => setEditedStudent({ ...editedStudent, location: e.target.value || null })}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="student_bio" className="text-sm">Bio</Label>
                <Textarea
                  id="student_bio"
                  placeholder="Short bio or introduction..."
                  value={editedStudent.bio || ''}
                  onChange={(e) => setEditedStudent({ ...editedStudent, bio: e.target.value || null })}
                  className="mt-1 min-h-[70px]"
                />
              </div>
            </div>
          </div>

          {/* ── Assigned Items Section (Admin Only) ────────────────── */}
          <div className="border-t pt-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Package className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">
                  Assigned Items
                </h3>
                {assignedItems.length > 0 && (
                  <Badge variant="secondary" className="text-xs">
                    {assignedItems.length}
                  </Badge>
                )}
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={addItem}
                className="h-8 text-xs gap-1.5 border-primary text-primary hover:bg-primary/5"
              >
                <Plus className="h-3.5 w-3.5" />
                Add Item
              </Button>
            </div>

            {loadingItems ? (
              <p className="text-xs text-muted-foreground">Loading items...</p>
            ) : assignedItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-6 border border-dashed rounded-lg bg-muted/30">
                <Package className="h-8 w-8 text-muted-foreground/40 mb-2" />
                <p className="text-xs text-muted-foreground">No items assigned yet.</p>
                <p className="text-xs text-muted-foreground">Click <strong>Add Item</strong> to assign a device or other item.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {assignedItems.map((item, index) => (
                  <div
                    key={index}
                    className="relative border border-border rounded-xl p-3 bg-muted/20 space-y-3"
                  >
                    {/* Item header */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {item.item_type === 'device' ? (
                          <Monitor className="h-3.5 w-3.5 text-primary" />
                        ) : (
                          <Tag className="h-3.5 w-3.5 text-amber-500" />
                        )}
                        <span className="text-xs font-semibold text-foreground">
                          Item {index + 1}
                        </span>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-destructive hover:bg-destructive/10"
                        onClick={() => removeItem(index)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>

                    {/* Row 1: Type + Name */}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="text-xs text-muted-foreground mb-1 block">Type *</Label>
                        <Select
                          value={item.item_type}
                          onValueChange={(val) => updateItem(index, 'item_type', val as 'device' | 'other')}
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="device">Device</SelectItem>
                            <SelectItem value="other">Other</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground mb-1 block">Name *</Label>
                        <Input
                          className="h-8 text-xs"
                          placeholder="e.g. Laptop, Book"
                          value={item.item_name}
                          onChange={(e) => updateItem(index, 'item_name', e.target.value)}
                        />
                      </div>
                    </div>

                    {/* Row 2: ID + Serial Number */}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="text-xs text-muted-foreground mb-1 block">Item ID</Label>
                        <Input
                          className="h-8 text-xs"
                          placeholder="e.g. LPT-001"
                          value={item.item_id}
                          onChange={(e) => updateItem(index, 'item_id', e.target.value)}
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground mb-1 block">Serial Number</Label>
                        <Input
                          className="h-8 text-xs"
                          placeholder="e.g. SN123456"
                          value={item.serial_number}
                          onChange={(e) => updateItem(index, 'serial_number', e.target.value)}
                        />
                      </div>
                    </div>

                    {/* Row 3: Condition */}
                    <div>
                      <Label className="text-xs text-muted-foreground mb-1 block">Condition</Label>
                      <Input
                        className="h-8 text-xs"
                        placeholder="e.g. Good, Fair, Damaged"
                        value={item.condition}
                        onChange={(e) => updateItem(index, 'condition', e.target.value)}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* MY DOCUMENTS */}
            <div className="pt-4 border-t border-border">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-blue-500" />
                  <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">
                    My Documents
                  </h3>
                  {documents.length > 0 && (
                    <Badge variant="secondary" className="text-xs bg-blue-100 text-blue-800 hover:bg-blue-200">
                      {documents.length}
                    </Badge>
                  )}
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setDocuments(prev => [...prev, { student_id: editedStudent.id, item_type: 'document', item_name: '', item_id: '', serial_number: '', condition: 'Uploaded' } as AssignedItem])}
                  className="h-8 text-xs gap-1.5 border-blue-500 text-blue-600 hover:bg-blue-50"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add Document
                </Button>
              </div>

              {documents.length === 0 ? (
                <div className="text-center py-6 border-2 border-dashed rounded-lg bg-muted/20">
                  <FileText className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
                  <p className="text-sm text-muted-foreground">No documents uploaded yet.</p>
                  <p className="text-xs text-muted-foreground">Click <strong className="font-medium">Add Document</strong> to upload a PDF.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {documents.map((doc, index) => {
                    const isUploadingThis = uploadingDocType === `doc-${index}`;
                    return (
                      <div key={index} className="p-4 border rounded-lg bg-card/50 relative group">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            if (doc.id) {
                              handleDeleteDocument(doc);
                            } else {
                              setDocuments(prev => prev.filter((_, i) => i !== index));
                            }
                          }}
                          className="absolute -top-3 -right-3 h-6 w-6 rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90 opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                          disabled={uploadingDocType !== null}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <Label className="text-xs text-muted-foreground mb-1 block">Document Type *</Label>
                            <Select
                              value={['10th', '12th', 'Affidavit', 'Form'].includes(doc.item_name || '') ? doc.item_name : ((documents[index] as any).isOther || (doc.item_name && !['10th', '12th', 'Affidavit', 'Form'].includes(doc.item_name))) ? 'Other' : ''}
                              onValueChange={(val) => {
                                setDocuments(prev => prev.map((d, i) => i === index ? { ...d, item_name: val === 'Other' ? '' : val, isOther: val === 'Other' } as any : d));
                              }}
                              disabled={!!doc.id || isUploadingThis}
                            >
                              <SelectTrigger className="h-8 text-xs">
                                <SelectValue placeholder="Select type" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="10th">10th</SelectItem>
                                <SelectItem value="12th">12th</SelectItem>
                                <SelectItem value="Affidavit">Affidavit</SelectItem>
                                <SelectItem value="Form">Form</SelectItem>
                                <SelectItem value="Other">Other</SelectItem>
                              </SelectContent>
                            </Select>
                            
                            {((documents[index] as any).isOther || (doc.item_name && !['10th', '12th', 'Affidavit', 'Form'].includes(doc.item_name))) && (
                              <Input 
                                className="h-8 text-xs mt-2" 
                                placeholder="Enter document name"
                                value={doc.item_name || ''}
                                onChange={(e) => setDocuments(prev => prev.map((d, i) => i === index ? { ...d, item_name: e.target.value } : d))}
                                disabled={!!doc.id || isUploadingThis}
                              />
                            )}
                          </div>
                          
                          <div>
                            <Label className="text-xs text-muted-foreground mb-1 block">File</Label>
                            {doc.id ? (
                              <div className="flex items-center gap-2 h-8 px-3 rounded-md border bg-muted/50 text-xs">
                                <FileText className="h-3.5 w-3.5 text-blue-500 flex-shrink-0" />
                                <span className="truncate flex-1" title={doc.serial_number}>{doc.serial_number}</span>
                                <a 
                                  href={doc.item_id} 
                                  target="_blank" 
                                  rel="noopener noreferrer"
                                  className="text-blue-600 hover:text-blue-800 flex-shrink-0"
                                  title="View Document"
                                >
                                  <ExternalLink className="h-3.5 w-3.5" />
                                </a>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2">
                                <Input
                                  type="file"
                                  accept="application/pdf"
                                  className="h-8 text-xs file:h-full file:bg-transparent file:border-0 file:text-xs file:font-medium"
                                  onChange={(e) => handleUploadDocument(e, index)}
                                  disabled={!doc.item_name || isUploadingThis}
                                />
                                {isUploadingThis && <Loader2 className="h-4 w-4 animate-spin text-blue-500" />}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving || !editedStudent.name.trim()}
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
