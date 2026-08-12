import { useEffect, useState } from 'react';
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
  DropdownMenuSeparator,
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { RichTextEditor } from '@/components/ui/rich-text-editor';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Plus, Users, MoreVertical, Pencil, Calendar, Trash2, UserCheck, UserX, Upload, BookOpen, Settings, Search, ExternalLink, Filter, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { BulkUploadDialog } from '@/components/volunteers/BulkUploadDialog';
import { SessionTypeDialog } from '@/components/sessions/SessionTypeDialog';
import { AddSessionDialog } from '@/components/sessions/AddSessionDialog';
import { getDialCode } from '@/utils/geoData';
import { generateVolunteerId } from '@/utils/volunteerHelper';

interface Volunteer {
  id: string;
  volunteer_id?: string | null;
  organization_type: string;
  organization_name: string | null;
  name: string;
  personal_email: string | null;
  work_email: string | null;
  country: string | null;
  city: string | null;
  country_code: string | null;
  phone_number: string;
  linkedin_profile: string | null;
  is_active: boolean;
  regular_volunteering: boolean | null;
  frequency_per_month: number | null;
  interested_area: string | null;
  interested_topic: string | null;
  preferred_day: string | null;
  preferred_class: string | null;
  remarks: string | null;
  volunteer_status: string | null;
  created_at: string;
}

interface RemarkEntry {
  text: string;
  createdAt: string;
  createdBy: string;
}

type SortDirection = 'asc' | 'desc' | null;
type SortColumn = keyof Volunteer | null;

export default function VolunteerList() {
  const [volunteers, setVolunteers] = useState<Volunteer[]>([]);
  const [filteredVolunteers, setFilteredVolunteers] = useState<Volunteer[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [bulkUploadOpen, setBulkUploadOpen] = useState(false);
  const [preferencesDialogOpen, setPreferencesDialogOpen] = useState(false);
  const [selectedVolunteer, setSelectedVolunteer] = useState<Volunteer | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [isTypeDialogOpen, setIsTypeDialogOpen] = useState(false);
  const [isFormDialogOpen, setIsFormDialogOpen] = useState(false);
  const [selectedSessionType, setSelectedSessionType] = useState<'guest_teacher' | 'guest_speaker' | null>(null);
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);
  const [selectedCity, setSelectedCity] = useState<string>('all');
  const [selectedFrequency, setSelectedFrequency] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [selectedRole, setSelectedRole] = useState<string>('all');
  const [selectedOrganization, setSelectedOrganization] = useState<string>('all');
  const [selectedCountry, setSelectedCountry] = useState<string>('all');
  const [selectedType, setSelectedType] = useState<string>('all');
  const [sortColumn, setSortColumn] = useState<SortColumn>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);
  const [preferencesData, setPreferencesData] = useState({
    regular_volunteering: false,
    frequency_per_month: 0,
    interested_area: '',
    interested_topic: '',
    preferred_day: '',
    preferred_class: '',
    remarks: '',
    volunteer_status: 'active',
  });
  const [remarksDialogOpen, setRemarksDialogOpen] = useState(false);
  const [newRemark, setNewRemark] = useState('');
  const [isSavingRemark, setIsSavingRemark] = useState(false);
  const [editingRemarkIndex, setEditingRemarkIndex] = useState<number | null>(null);
  const [editingRemarkText, setEditingRemarkText] = useState<string>('');
  const navigate = useNavigate();

  function parseRemarks(remarksStr: string | null): RemarkEntry[] {
    if (!remarksStr) return [];
    try {
      const parsed = JSON.parse(remarksStr);
      if (Array.isArray(parsed)) return parsed as RemarkEntry[];
    } catch (e) {
      if (remarksStr.trim()) {
        return [{
          text: remarksStr,
          createdAt: 'Legacy',
          createdBy: 'System'
        }];
      }
    }
    return [];
  }

  const handleSaveRemark = async () => {
    if (!selectedVolunteer || !newRemark.trim()) return;

    setIsSavingRemark(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const userEmail = user?.email || 'Unknown User';

      const currentRemarks = parseRemarks(selectedVolunteer.remarks);
      const newEntry: RemarkEntry = {
        text: newRemark.trim(),
        createdAt: new Date().toISOString(),
        createdBy: userEmail,
      };

      const updatedRemarks = [newEntry, ...currentRemarks];
      const remarksStr = JSON.stringify(updatedRemarks);

      const { error } = await supabase
        .from('volunteers')
        .update({ remarks: remarksStr })
        .eq('id', selectedVolunteer.id);

      if (error) throw error;

      setVolunteers(volunteers.map(v =>
        v.id === selectedVolunteer.id ? { ...v, remarks: remarksStr } : v
      ));

      setSelectedVolunteer(prev => prev ? { ...prev, remarks: remarksStr } : null);

      toast.success('Remark added successfully');
      setNewRemark('');
    } catch (error) {
      console.error('Error saving remark:', error);
      toast.error('Failed to save remark');
    } finally {
      setIsSavingRemark(false);
    }
  };

  const handleEditRemarkStart = (index: number, currentText: string) => {
    setEditingRemarkIndex(index);
    setEditingRemarkText(currentText);
  };

  const handleCancelEditRemark = () => {
    setEditingRemarkIndex(null);
    setEditingRemarkText('');
  };

  const handleUpdateRemark = async (index: number) => {
    if (!selectedVolunteer || !editingRemarkText.trim()) return;

    try {
      const currentRemarks = parseRemarks(selectedVolunteer.remarks);
      if (index < 0 || index >= currentRemarks.length) return;

      currentRemarks[index] = {
        ...currentRemarks[index],
        text: editingRemarkText.trim(),
      };

      const remarksStr = JSON.stringify(currentRemarks);

      const { error } = await supabase
        .from('volunteers')
        .update({ remarks: remarksStr })
        .eq('id', selectedVolunteer.id);

      if (error) throw error;

      setVolunteers(volunteers.map(v =>
        v.id === selectedVolunteer.id ? { ...v, remarks: remarksStr } : v
      ));

      setSelectedVolunteer(prev => prev ? { ...prev, remarks: remarksStr } : null);
      toast.success('Remark updated successfully');
      setEditingRemarkIndex(null);
      setEditingRemarkText('');
    } catch (error) {
      console.error('Error updating remark:', error);
      toast.error('Failed to update remark');
    }
  };

  const handleDeleteRemark = async (index: number) => {
    if (!selectedVolunteer) return;
    if (!window.confirm('Are you sure you want to delete this remark?')) return;

    try {
      const currentRemarks = parseRemarks(selectedVolunteer.remarks);
      if (index < 0 || index >= currentRemarks.length) return;

      const updatedRemarks = currentRemarks.filter((_, i) => i !== index);
      const remarksStr = updatedRemarks.length > 0 ? JSON.stringify(updatedRemarks) : null;

      const { error } = await supabase
        .from('volunteers')
        .update({ remarks: remarksStr })
        .eq('id', selectedVolunteer.id);

      if (error) throw error;

      setVolunteers(volunteers.map(v =>
        v.id === selectedVolunteer.id ? { ...v, remarks: remarksStr } : v
      ));

      setSelectedVolunteer(prev => prev ? { ...prev, remarks: remarksStr } : null);
      toast.success('Remark deleted successfully');
    } catch (error) {
      console.error('Error deleting remark:', error);
      toast.error('Failed to delete remark');
    }
  };

  useEffect(() => {
    fetchVolunteers();
  }, []);

  useEffect(() => {
    // Filter volunteers based on search query and selected filters
    let filtered = volunteers;

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(v =>
        (v.volunteer_id || generateVolunteerId(v)).toLowerCase().includes(query) ||
        v.name.toLowerCase().includes(query) ||
        v.personal_email?.toLowerCase().includes(query) ||
        v.work_email?.toLowerCase().includes(query) ||
        v.phone_number?.toLowerCase().includes(query) ||
        v.organization_name?.toLowerCase().includes(query) ||
        v.city?.toLowerCase().includes(query) ||
        v.country?.toLowerCase().includes(query)
      );
    }

    if (selectedCity !== 'all') {
      filtered = filtered.filter(v => v.city === selectedCity);
    }

    if (selectedFrequency !== 'all') {
      filtered = filtered.filter(v =>
        v.frequency_per_month?.toString() === selectedFrequency
      );
    }

    if (selectedStatus !== 'all') {
      filtered = filtered.filter(v => v.volunteer_status === selectedStatus);
    }

    if (selectedRole !== 'all') {
      filtered = filtered.filter(v => {
        const prefString = (v as any).preference;
        if (!prefString) return false;
        const prefs = prefString.split(',').map((p: string) => p.trim() === 'Speaker' ? 'Guest Speaker' : p.trim()).filter(Boolean);
        return prefs.includes(selectedRole);
      });
    }

    if (selectedOrganization !== 'all') {
      filtered = filtered.filter(v => getOrganizationDisplay(v) === selectedOrganization);
    }

    if (selectedCountry !== 'all') {
      filtered = filtered.filter(v => v.country === selectedCountry);
    }

    if (selectedType !== 'all') {
      filtered = filtered.filter(v => v.organization_type === selectedType);
    }

    // Apply sorting
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

        // Boolean comparison
        if (typeof aValue === 'boolean' && typeof bValue === 'boolean') {
          return sortDirection === 'asc' ? (aValue === bValue ? 0 : aValue ? 1 : -1) : (aValue === bValue ? 0 : aValue ? -1 : 1);
        }

        return 0;
      });
    }

    setFilteredVolunteers(filtered);
  }, [searchQuery, volunteers, selectedCity, selectedFrequency, selectedStatus, sortColumn, sortDirection, selectedRole, selectedOrganization, selectedCountry, selectedType]);

  // Derived unique values for filters
  const cities = Array.from(new Set(volunteers.map(v => v.city).filter(Boolean))).sort() as string[];
  const frequencies = Array.from(new Set(volunteers.map(v => v.frequency_per_month).filter(f => f !== null))).sort((a, b) => (a || 0) - (b || 0)) as number[];
  const statuses = ['active', 'inactive', 'on_leave'];
  
  const roles = Array.from(new Set(
    volunteers.flatMap(v => {
      const prefString = (v as any).preference;
      if (!prefString) return [];
      return prefString.split(',').map((p: string) => p.trim() === 'Speaker' ? 'Guest Speaker' : p.trim()).filter(Boolean);
    })
  )).sort() as string[];
  
  const organizations = Array.from(new Set(volunteers.map(v => getOrganizationDisplay(v)).filter(o => o !== '-'))).sort() as string[];
  const countries = Array.from(new Set(volunteers.map(v => v.country).filter(Boolean))).sort() as string[];
  const types = Array.from(new Set(volunteers.map(v => v.organization_type).filter(Boolean))).sort() as string[];

  const isFiltered = searchQuery.trim() !== '' ||
    selectedCity !== 'all' ||
    selectedFrequency !== 'all' ||
    selectedStatus !== 'all' ||
    selectedRole !== 'all' ||
    selectedType !== 'all' ||
    selectedOrganization !== 'all' ||
    selectedCountry !== 'all';

  const resetFilters = () => {
    setSearchQuery('');
    setSelectedCity('all');
    setSelectedFrequency('all');
    setSelectedStatus('all');
    setSelectedRole('all');
    setSelectedType('all');
    setSelectedOrganization('all');
    setSelectedCountry('all');
  };

  async function fetchVolunteers() {
    try {
      const { data, error } = await supabase
        .from('volunteers')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setVolunteers(data || []);
    } catch (error) {
      console.error('Error fetching volunteers:', error);
      toast.error('Failed to load volunteers');
    } finally {
      setLoading(false);
    }
  }

  async function deleteVolunteer(id: string) {
    try {
      const { error } = await supabase.from('volunteers').delete().eq('id', id);
      if (error) throw error;
      toast.success('Volunteer deleted successfully');
      setVolunteers(volunteers.filter((v) => v.id !== id));
    } catch (error) {
      console.error('Error deleting volunteer:', error);
      toast.error('Failed to delete volunteer');
    } finally {
      setDeleteDialogOpen(false);
      setSelectedVolunteer(null);
    }
  }

  async function toggleVolunteerStatus(volunteer: Volunteer) {
    try {
      const newStatus = !volunteer.is_active;
      const { error } = await supabase
        .from('volunteers')
        .update({ is_active: newStatus })
        .eq('id', volunteer.id);

      if (error) throw error;

      toast.success(`Volunteer ${newStatus ? 'activated' : 'deactivated'} successfully`);
      setVolunteers(volunteers.map((v) =>
        v.id === volunteer.id ? { ...v, is_active: newStatus } : v
      ));
    } catch (error) {
      console.error('Error updating volunteer status:', error);
      toast.error('Failed to update volunteer status');
    }
  }

  function getOrganizationDisplay(volunteer: Volunteer) {
    if (volunteer.organization_type === 'individual') {
      return 'Self';
    }
    return volunteer.organization_name || '-';
  }

  function getEmailDisplay(volunteer: Volunteer) {
    const emails = [];
    if (volunteer.work_email) emails.push(volunteer.work_email);
    if (volunteer.personal_email) emails.push(volunteer.personal_email);
    return emails.length > 0 ? emails.join(', ') : '-';
  }

  function getLocationDisplay(volunteer: Volunteer) {
    const parts = [];
    if (volunteer.city) parts.push(volunteer.city);
    if (volunteer.country) parts.push(volunteer.country);
    return parts.length > 0 ? parts.join(', ') : '-';
  }

  function handleColumnSort(column: SortColumn) {
    if (sortColumn === column) {
      // If clicking the same column, cycle through: asc -> desc -> null
      if (sortDirection === 'asc') {
        setSortDirection('desc');
      } else if (sortDirection === 'desc') {
        setSortColumn(null);
        setSortDirection(null);
      }
    } else {
      // If clicking a different column, start with ascending
      setSortColumn(column);
      setSortDirection('asc');
    }
  }

  function getSortIndicator(column: SortColumn) {
    if (sortColumn !== column) return '↕';
    if (sortDirection === 'asc') return '↑';
    if (sortDirection === 'desc') return '↓';
    return '↕';
  }

  const handleAddSession = () => {
    setIsTypeDialogOpen(true);
  };

  const handleSessionTypeSelect = (type: 'guest_teacher' | 'guest_speaker') => {
    setSelectedSessionType(type);
    setIsFormDialogOpen(true);
  };

  const handleEditPreferences = (volunteer: Volunteer) => {
    setSelectedVolunteer(volunteer);
    setPreferencesData({
      regular_volunteering: volunteer.regular_volunteering || false,
      frequency_per_month: volunteer.frequency_per_month || 0,
      interested_area: volunteer.interested_area || '',
      interested_topic: volunteer.interested_topic || '',
      preferred_day: volunteer.preferred_day || 'none',
      preferred_class: volunteer.preferred_class || '',
      remarks: volunteer.remarks || '',
      volunteer_status: volunteer.volunteer_status || 'active',
    });
    setPreferencesDialogOpen(true);
  };

  const handleSavePreferences = async () => {
    if (!selectedVolunteer) return;

    try {
      const is_active = preferencesData.volunteer_status === 'active';
      const updateData = {
        ...preferencesData,
        is_active,
        preferred_day: preferencesData.preferred_day === 'none' ? null : preferencesData.preferred_day
      };

      const { error } = await supabase
        .from('volunteers')
        .update(updateData)
        .eq('id', selectedVolunteer.id);

      if (error) throw error;

      // Update local state
      setVolunteers(volunteers.map(v =>
        v.id === selectedVolunteer.id ? { ...v, ...updateData } : v
      ));

      toast.success('Volunteer preferences updated successfully');
      setPreferencesDialogOpen(false);
      setSelectedVolunteer(null);
    } catch (error) {
      console.error('Error updating preferences:', error);
      toast.error('Failed to update preferences');
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
          <div className="min-w-0">
            <h1 className="text-xl md:text-2xl font-bold text-foreground">Guest Teacher & Speaker list</h1>
            <p className="text-xs md:text-sm text-muted-foreground mt-0.5">
              Manage your volunteers
            </p>
          </div>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
            <Button 
              variant="outline" 
              onClick={() => window.open('https://docs.google.com/spreadsheets/d/1-q3gzkbBpoP2uEdUih-WLNRsSEyDcdoEtFNGJFVc0dU/edit?usp=drivesdk', '_blank')} 
              className="w-full sm:w-auto border-primary/20 text-primary hover:bg-primary/5 gap-2"
            >
              <ExternalLink className="h-4 w-4" />
              <span className="hidden sm:inline">Volunteer Pipeline</span>
              <span className="sm:hidden">Pipeline</span>
            </Button>
            <Button variant="outline" onClick={() => setBulkUploadOpen(true)} className="w-full sm:w-auto">
              <Upload className="h-4 w-4 mr-2" />
              <span className="hidden sm:inline">Bulk Upload</span>
              <span className="sm:hidden">Upload</span>
            </Button>
            <Button onClick={() => navigate('/volunteers/add')} className="w-full sm:w-auto">
              <Plus className="h-4 w-4 mr-2" />
              <span className="hidden sm:inline">Add Volunteer</span>
              <span className="sm:hidden">Add</span>
            </Button>
          </div>
        </div>

        {/* Summary Info (New) */}
        {!loading && volunteers.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
            <div className="bg-blue-50/50 border border-blue-100 rounded-lg p-3">
              <p className="text-[10px] text-blue-600 font-semibold uppercase tracking-wider mb-1">Total</p>
              <p className="text-xl font-bold text-blue-700">{volunteers.length}</p>
            </div>
            <div className="bg-green-50/50 border border-green-100 rounded-lg p-3">
              <p className="text-[10px] text-green-600 font-semibold uppercase tracking-wider mb-1">Active</p>
              <p className="text-xl font-bold text-green-700">{volunteers.filter(v => v.is_active).length}</p>
            </div>
            <div className="bg-orange-50/50 border border-orange-100 rounded-lg p-3">
              <p className="text-[10px] text-orange-600 font-semibold uppercase tracking-wider mb-1">Inactive</p>
              <p className="text-xl font-bold text-orange-700">{volunteers.filter(v => !v.is_active).length}</p>
            </div>
            <div className="bg-purple-50/50 border border-purple-100 rounded-lg p-3">
              <p className="text-[10px] text-purple-600 font-semibold uppercase tracking-wider mb-1">Regular</p>
              <p className="text-xl font-bold text-purple-700">{volunteers.filter(v => v.regular_volunteering).length}</p>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2 bg-muted/10 p-2 rounded-lg border border-border/60">
          <div className="relative w-full sm:w-[240px]">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search volunteers..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 h-9 text-xs bg-transparent"
            />
          </div>

          <Select value={selectedCity} onValueChange={setSelectedCity}>
            <SelectTrigger className="h-9 w-[130px] md:w-[150px] text-xs bg-transparent">
              <SelectValue placeholder="City" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Cities</SelectItem>
              {cities.map(city => (
                <SelectItem key={city} value={city}>{city}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={selectedFrequency} onValueChange={setSelectedFrequency}>
            <SelectTrigger className="h-9 w-[130px] md:w-[150px] text-xs bg-transparent">
              <SelectValue placeholder="Frequency" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any Frequency</SelectItem>
              {frequencies.map(f => (
                <SelectItem key={f} value={f.toString()}>{f} sessions</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={selectedStatus} onValueChange={setSelectedStatus}>
            <SelectTrigger className="h-9 w-[130px] md:w-[150px] text-xs bg-transparent capitalize">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              {statuses.map(status => (
                <SelectItem key={status} value={status} className="capitalize">{status.replace('_', ' ')}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={selectedRole} onValueChange={setSelectedRole}>
            <SelectTrigger className="h-9 w-[130px] md:w-[150px] text-xs bg-transparent">
              <SelectValue placeholder="Role / Session" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Roles</SelectItem>
              {roles.map(r => (
                <SelectItem key={r} value={r}>{r}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={selectedType} onValueChange={setSelectedType}>
            <SelectTrigger className="h-9 w-[130px] md:w-[150px] text-xs bg-transparent capitalize">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {types.map(t => (
                <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={selectedOrganization} onValueChange={setSelectedOrganization}>
            <SelectTrigger className="h-9 w-[130px] md:w-[150px] text-xs bg-transparent">
              <SelectValue placeholder="Organization" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Organizations</SelectItem>
              {organizations.map(o => (
                <SelectItem key={o} value={o}>{o}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={selectedCountry} onValueChange={setSelectedCountry}>
            <SelectTrigger className="h-9 w-[130px] md:w-[150px] text-xs bg-transparent">
              <SelectValue placeholder="Country" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Countries</SelectItem>
              {countries.map(c => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {isFiltered && (
            <div className="flex items-center gap-2 sm:ml-auto">
              <Badge variant="secondary" className="h-9 px-3 text-xs font-semibold bg-primary/10 text-primary border-primary/20 flex items-center gap-1.5 whitespace-nowrap">
                <Filter className="h-3.5 w-3.5" />
                {filteredVolunteers.length} out of {volunteers.length}
              </Badge>
              <Button
                variant="outline"
                size="sm"
                onClick={resetFilters}
                className="h-9 text-xs text-muted-foreground hover:text-foreground px-3 gap-1 border-dashed"
              >
                <X className="h-3.5 w-3.5" />
                Clear
              </Button>
            </div>
          )}
        </div>

        {/* Volunteers Table/Cards */}
        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              <span>All Guest Teacher & Speaker</span>
              <Badge variant={isFiltered ? "default" : "secondary"} className="text-xs font-medium ml-1">
                {isFiltered ? `${filteredVolunteers.length} out of ${volunteers.length}` : `${volunteers.length} total`}
              </Badge>
            </CardTitle>
            {isFiltered && (
              <Button
                variant="ghost"
                size="sm"
                onClick={resetFilters}
                className="h-8 text-xs text-muted-foreground hover:text-foreground gap-1"
              >
                <X className="h-3.5 w-3.5" />
                Clear Filters
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            ) : volunteers.length === 0 ? (
              <div className="text-center py-12">
                <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-medium text-foreground mb-2">
                  No volunteers yet
                </h3>
                <p className="text-muted-foreground mb-4">
                  Get started by adding your first volunteer
                </p>
                <Button onClick={() => navigate('/volunteers/add')}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Volunteer
                </Button>
              </div>
            ) : filteredVolunteers.length === 0 ? (
              <div className="text-center py-12">
                <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-medium text-foreground mb-2">
                  No volunteers found
                </h3>
                <p className="text-muted-foreground mb-4">
                  Try adjusting your search criteria (0 out of {volunteers.length} volunteers match)
                </p>
                <Button variant="outline" onClick={resetFilters} className="gap-1.5">
                  <X className="h-4 w-4" />
                  Clear Filters
                </Button>
              </div>
            ) : (
              <>
                {/* Desktop Table View */}
                <div className="hidden md:block overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead 
                          className="px-3 py-3 text-xs cursor-pointer hover:bg-muted/50 transition-colors"
                          onClick={() => handleColumnSort('name')}
                        >
                          <div className="flex items-center gap-1">
                            Name
                            <span className={sortColumn === 'name' ? 'font-bold' : 'text-muted-foreground'}>
                              {getSortIndicator('name')}
                            </span>
                          </div>
                        </TableHead>
                        <TableHead className="px-3 py-3 text-xs w-[120px]">Role / Session</TableHead>
                        <TableHead className="px-3 py-3 text-xs w-[80px]">Type</TableHead>
                        <TableHead className="px-3 py-3 text-xs">Organization</TableHead>
                        <TableHead className="px-3 py-3 text-xs">Work Email</TableHead>
                        <TableHead className="px-3 py-3 text-xs">Personal Email</TableHead>
                        <TableHead className="px-3 py-3 text-xs w-[120px]">Phone</TableHead>
                        <TableHead className="px-3 py-3 text-xs w-[90px]">Country</TableHead>
                        <TableHead className="px-3 py-3 text-xs w-[90px]">City</TableHead>
                        <TableHead className="px-3 py-3 text-xs w-[55px]">Freq</TableHead>
                        <TableHead className="px-3 py-3 text-xs w-[80px]">Status</TableHead>
                        <TableHead className="px-3 py-3 text-xs w-[50px]">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredVolunteers.map((volunteer) => (
                        <TableRow key={volunteer.id}>
                          <TableCell className="px-3 py-2 font-medium text-sm truncate max-w-[150px]" title={volunteer.name}>
                            {volunteer.name}
                          </TableCell>
                          <TableCell className="px-3 py-2">
                            {(() => {
                              const prefString = volunteer.preference;
                              if (!prefString) return <span className="text-sm">-</span>;
                              const prefs = prefString.split(',').map(p => p.trim() === 'Speaker' ? 'Guest Speaker' : p.trim()).filter(Boolean);
                              if (prefs.length === 0) return <span className="text-sm">-</span>;
                              if (prefs.length === 1) return <Badge variant="secondary" className="text-[10px] px-2 py-0 font-normal">{prefs[0]}</Badge>;
                              
                              return (
                                <div className="flex flex-wrap items-center gap-1">
                                  <Badge variant="secondary" className="text-[10px] px-2 py-0 font-normal">{prefs[0]}</Badge>
                                  <Popover>
                                    <PopoverTrigger className="inline-flex items-center rounded-full border px-1.5 py-0 text-[10px] font-medium bg-muted/30 hover:bg-muted transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 border-border text-foreground cursor-pointer">
                                        +{prefs.length - 1} more
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-2" side="top">
                                      <div className="flex flex-col gap-1.5">
                                        {prefs.map(p => (
                                           <Badge key={p} variant="secondary" className="text-xs justify-center font-normal">{p}</Badge>
                                        ))}
                                      </div>
                                    </PopoverContent>
                                  </Popover>
                                </div>
                              );
                            })()}
                          </TableCell>
                          <TableCell className="px-3 py-2">
                            <Badge variant="outline" className="capitalize text-xs">
                              {volunteer.organization_type}
                            </Badge>
                          </TableCell>
                          <TableCell className="px-3 py-2 text-sm truncate max-w-[140px]" title={getOrganizationDisplay(volunteer)}>
                            {getOrganizationDisplay(volunteer)}
                          </TableCell>
                          <TableCell className="px-3 py-2 text-sm truncate max-w-[180px]" title={volunteer.work_email || '-'}>
                            {volunteer.work_email || '-'}
                          </TableCell>
                          <TableCell className="px-3 py-2 text-sm truncate max-w-[180px]" title={volunteer.personal_email || '-'}>
                            {volunteer.personal_email || '-'}
                          </TableCell>
                          <TableCell className="px-3 py-2 text-sm">
                            {volunteer.country_code ? `${getDialCode(volunteer.country_code)} ${volunteer.phone_number}` : volunteer.phone_number}
                          </TableCell>
                          <TableCell className="px-3 py-2 text-sm truncate" title={volunteer.country || '-'}>{volunteer.country || '-'}</TableCell>
                          <TableCell className="px-3 py-2 text-sm truncate" title={volunteer.city || '-'}>{volunteer.city || '-'}</TableCell>
                          <TableCell className="px-3 py-2 text-sm text-center">{volunteer.frequency_per_month || '-'}</TableCell>
                          <TableCell className="px-3 py-2">
                            <Badge variant={volunteer.is_active ? 'default' : 'secondary'} className="text-xs">
                              {volunteer.is_active ? 'Active' : 'Inactive'}
                            </Badge>
                          </TableCell>
                          <TableCell className="px-3 py-2">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8">
                                  <MoreVertical className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="bg-popover">
                                <DropdownMenuItem
                                  onClick={() => {
                                    setSelectedVolunteer(volunteer);
                                    setDetailsDialogOpen(true);
                                  }}
                                >
                                  <BookOpen className="h-4 w-4 mr-2" />
                                  View Info
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => {
                                    setSelectedVolunteer(volunteer);
                                    setRemarksDialogOpen(true);
                                  }}
                                >
                                  <BookOpen className="h-4 w-4 mr-2" />
                                  Remarks Log
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={() => navigate(`/volunteers/edit/${volunteer.id}`)}
                                >
                                  <Pencil className="h-4 w-4 mr-2" />
                                  Edit
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => handleEditPreferences(volunteer)}
                                >
                                  <Settings className="h-4 w-4 mr-2" />
                                  Edit Preferences
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => navigate(`/calendar?assign=${volunteer.id}`)}
                                >
                                  <Calendar className="h-4 w-4 mr-2" />
                                  Assign Session
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={handleAddSession}
                                  className="gap-2"
                                >
                                  <BookOpen className="h-4 w-4" />
                                  Add Session
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={() => toggleVolunteerStatus(volunteer)}
                                >
                                  {volunteer.is_active ? (
                                    <>
                                      <UserX className="h-4 w-4 mr-2" />
                                      Deactivate
                                    </>
                                  ) : (
                                    <>
                                      <UserCheck className="h-4 w-4 mr-2" />
                                      Activate
                                    </>
                                  )}
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => {
                                    setSelectedVolunteer(volunteer);
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
                  {filteredVolunteers.map((volunteer) => (
                    <div key={volunteer.id} className="bg-muted/50 rounded-lg p-4 space-y-3 border border-border">
                      {/* Name and Status */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <h3 className="font-semibold text-foreground break-words">{volunteer.name}</h3>
                          <p className="text-xs text-muted-foreground mt-1">ID: {volunteer.id.substring(0, 8)}</p>
                        </div>
                        <Badge variant={volunteer.is_active ? 'default' : 'secondary'} className="flex-shrink-0">
                          {volunteer.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                      </div>

                      {/* Organization Type and Name */}
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <span className="text-muted-foreground block">Type</span>
                          <Badge variant="outline" className="capitalize mt-1">
                            {volunteer.organization_type}
                          </Badge>
                        </div>
                        <div>
                          <span className="text-muted-foreground block">Role / Session</span>
                          <div className="mt-1">
                            {(() => {
                              const prefString = volunteer.preference;
                              if (!prefString) return <span className="font-medium text-sm">-</span>;
                              const prefs = prefString.split(',').map(p => p.trim() === 'Speaker' ? 'Guest Speaker' : p.trim()).filter(Boolean);
                              if (prefs.length === 0) return <span className="font-medium text-sm">-</span>;
                              if (prefs.length === 1) return <Badge variant="secondary" className="text-[10px] px-2 py-0 font-normal">{prefs[0]}</Badge>;
                              
                              return (
                                <div className="flex flex-wrap items-center gap-1">
                                  <Badge variant="secondary" className="text-[10px] px-2 py-0 font-normal">{prefs[0]}</Badge>
                                  <Popover>
                                    <PopoverTrigger className="inline-flex items-center rounded-full border px-1.5 py-0 text-[10px] font-medium bg-muted/30 hover:bg-muted transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 border-border text-foreground cursor-pointer">
                                        +{prefs.length - 1} more
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-2" side="top">
                                      <div className="flex flex-col gap-1.5">
                                        {prefs.map(p => (
                                           <Badge key={p} variant="secondary" className="text-xs justify-center font-normal">{p}</Badge>
                                        ))}
                                      </div>
                                    </PopoverContent>
                                  </Popover>
                                </div>
                              );
                            })()}
                          </div>
                        </div>
                        <div>
                          <span className="text-muted-foreground block">Organization</span>
                          <span className="font-medium text-sm break-words">{getOrganizationDisplay(volunteer)}</span>
                        </div>
                      </div>

                      {/* Phone */}
                      <div className="text-xs">
                        <span className="text-muted-foreground">Phone</span>
                        <p className="font-medium text-sm">
                          {volunteer.country_code ? `${getDialCode(volunteer.country_code)} ${volunteer.phone_number}` : volunteer.phone_number}
                        </p>
                      </div>

                      {/* Work Email - Separate */}
                      {volunteer.work_email && (
                        <div className="text-xs">
                          <span className="text-muted-foreground">Work Email</span>
                          <p className="font-medium break-all text-sm">{volunteer.work_email}</p>
                        </div>
                      )}

                      {/* Personal Email - Separate */}
                      {volunteer.personal_email && (
                        <div className="text-xs">
                          <span className="text-muted-foreground">Personal Email</span>
                          <p className="font-medium break-all text-sm">{volunteer.personal_email}</p>
                        </div>
                      )}

                      {/* Country - Separate */}
                      {volunteer.country && (
                        <div className="text-xs">
                          <span className="text-muted-foreground">Country</span>
                          <p className="font-medium text-sm">{volunteer.country}</p>
                        </div>
                      )}

                      {/* City - Separate */}
                      {volunteer.city && (
                        <div className="text-xs">
                          <span className="text-muted-foreground">City</span>
                          <p className="font-medium text-sm">{volunteer.city}</p>
                        </div>
                      )}

                      {/* LinkedIn */}
                      {volunteer.linkedin_profile && (
                        <div className="text-xs">
                          <a
                            href={volunteer.linkedin_profile}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:underline font-medium"
                          >
                            View LinkedIn Profile →
                          </a>
                        </div>
                      )}

                      {/* Actions */}
                      <div className="flex gap-2 pt-2 border-t border-border">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => navigate(`/volunteers/edit/${volunteer.id}`)}
                          className="flex-1"
                        >
                          <Pencil className="h-4 w-4 mr-1" />
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => navigate(`/calendar?assign=${volunteer.id}`)}
                          className="flex-1"
                        >
                          <Calendar className="h-4 w-4 mr-1" />
                          Assign
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-9 w-9">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="bg-popover">
                            <DropdownMenuItem
                              onClick={() => {
                                setSelectedVolunteer(volunteer);
                                setDetailsDialogOpen(true);
                              }}
                              className="gap-2"
                            >
                              <BookOpen className="h-4 w-4" />
                              View Info
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => {
                                setSelectedVolunteer(volunteer);
                                setRemarksDialogOpen(true);
                              }}
                              className="gap-2"
                            >
                              <BookOpen className="h-4 w-4" />
                              Remarks Log
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={handleAddSession}
                              className="gap-2"
                            >
                              <BookOpen className="h-4 w-4" />
                              Add Session
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => handleEditPreferences(volunteer)}
                              className="gap-2"
                            >
                              <Settings className="h-4 w-4" />
                              Edit Preferences
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => toggleVolunteerStatus(volunteer)}
                            >
                              {volunteer.is_active ? (
                                <>
                                  <UserX className="h-4 w-4 mr-2" />
                                  Deactivate
                                </>
                              ) : (
                                <>
                                  <UserCheck className="h-4 w-4 mr-2" />
                                  Activate
                                </>
                              )}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => {
                                setSelectedVolunteer(volunteer);
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

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={(open) => {
        setDeleteDialogOpen(open);
        if (!open) {
          setSelectedVolunteer(null);
          setDeleteConfirmText('');
        }
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Volunteer</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  Are you sure you want to delete {selectedVolunteer?.name}? This action cannot be undone.
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
              onClick={() => selectedVolunteer && deleteVolunteer(selectedVolunteer.id)}
              disabled={deleteConfirmText !== 'DELETE'}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
        onSuccess={fetchVolunteers}
      />

      {/* Bulk Upload Dialog */}
      <BulkUploadDialog
        open={bulkUploadOpen}
        onOpenChange={setBulkUploadOpen}
        onSuccess={fetchVolunteers}
      />

      {/* Edit Preferences Dialog */}
      <Dialog open={preferencesDialogOpen} onOpenChange={setPreferencesDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Volunteer Preferences</DialogTitle>
            <DialogDescription>
              Update volunteering preferences for {selectedVolunteer?.name}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Regular Volunteering */}
            <div className="flex items-center space-x-2">
              <Checkbox
                id="regular_volunteering"
                checked={preferencesData.regular_volunteering}
                onCheckedChange={(checked) =>
                  setPreferencesData({ ...preferencesData, regular_volunteering: checked as boolean })
                }
              />
              <Label htmlFor="regular_volunteering" className="text-sm font-medium cursor-pointer">
                Regular Volunteering
              </Label>
            </div>

            {/* Frequency per Month */}
            <div>
              <Label htmlFor="frequency" className="text-sm font-medium mb-2 block">
                Frequency of Volunteering in a Month
              </Label>
              <Input
                id="frequency"
                type="number"
                min="0"
                value={preferencesData.frequency_per_month}
                onChange={(e) =>
                  setPreferencesData({ ...preferencesData, frequency_per_month: parseInt(e.target.value) || 0 })
                }
                placeholder="e.g., 2"
              />
            </div>

            {/* Interested Area */}
            <div>
              <Label htmlFor="interested_area" className="text-sm font-medium mb-2 block">
                Interested Area
              </Label>
              <Input
                id="interested_area"
                value={preferencesData.interested_area}
                onChange={(e) =>
                  setPreferencesData({ ...preferencesData, interested_area: e.target.value })
                }
                placeholder="e.g., Technology, Education"
              />
            </div>

            {/* Interested Topic */}
            <div>
              <Label htmlFor="interested_topic" className="text-sm font-medium mb-2 block">
                Interested Topic
              </Label>
              <Input
                id="interested_topic"
                value={preferencesData.interested_topic}
                onChange={(e) =>
                  setPreferencesData({ ...preferencesData, interested_topic: e.target.value })
                }
                placeholder="e.g., Artificial Intelligence, Web Development"
              />
            </div>

            {/* Preferred Day */}
            <div>
              <Label htmlFor="preferred_day" className="text-sm font-medium mb-2 block">
                Preferred Day
              </Label>
              <Select value={preferencesData.preferred_day} onValueChange={(value) =>
                setPreferencesData({ ...preferencesData, preferred_day: value })
              }>
                <SelectTrigger>
                  <SelectValue placeholder="Select day" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  <SelectItem value="Monday">Monday</SelectItem>
                  <SelectItem value="Tuesday">Tuesday</SelectItem>
                  <SelectItem value="Wednesday">Wednesday</SelectItem>
                  <SelectItem value="Thursday">Thursday</SelectItem>
                  <SelectItem value="Friday">Friday</SelectItem>
                  <SelectItem value="Saturday">Saturday</SelectItem>
                  <SelectItem value="Sunday">Sunday</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Preferred Class */}
            <div>
              <Label htmlFor="preferred_class" className="text-sm font-medium mb-2 block">
                Preferred Class
              </Label>
              <Input
                id="preferred_class"
                value={preferencesData.preferred_class}
                onChange={(e) =>
                  setPreferencesData({ ...preferencesData, preferred_class: e.target.value })
                }
                placeholder="e.g., Class 7, Class 8"
              />
            </div>

            {/* Remarks - Hidden from main edit since we have a dedicated dialog now */}

            {/* Status */}
            <div>
              <Label htmlFor="status" className="text-sm font-medium mb-2 block">
                Status
              </Label>
              <Select value={preferencesData.volunteer_status} onValueChange={(value) =>
                setPreferencesData({ ...preferencesData, volunteer_status: value })
              }>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                  <SelectItem value="on_leave">On Leave</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setPreferencesDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSavePreferences}>
              Save Preferences
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remarks Dialog */}
      <Dialog open={remarksDialogOpen} onOpenChange={setRemarksDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Remarks & Communication Log</DialogTitle>
            <DialogDescription>
              View history and add new remarks for {selectedVolunteer?.name}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto py-4 space-y-4">
            {/* Add Remark Section */}
            <div className="space-y-3 pb-4 border-b">
              <Label htmlFor="new_remark" className="text-sm font-medium">Add New Remark</Label>
              <div className="flex flex-col gap-2">
                <RichTextEditor
                  value={newRemark}
                  onChange={(val) => setNewRemark(val)}
                />
                <Button
                  onClick={handleSaveRemark}
                  disabled={isSavingRemark || !newRemark.trim() || newRemark === '<p><br></p>'}
                  className="self-end mt-2"
                >
                  {isSavingRemark ? 'Adding...' : 'Add Remark'}
                </Button>
              </div>
            </div>

            {/* History List */}
            <div className="space-y-3">
              <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">History</h4>
              {selectedVolunteer && parseRemarks(selectedVolunteer.remarks).length > 0 ? (
                <div className="space-y-3">
                  {parseRemarks(selectedVolunteer.remarks).map((remark, index) => {
                    const isEditing = editingRemarkIndex === index;
                    return (
                      <div key={index} className="p-3 bg-muted/50 rounded-lg border border-border/50 text-sm group/item">
                        {isEditing ? (
                          <div className="space-y-2">
                            <div className="flex justify-between items-start gap-2">
                              <span className="font-semibold text-foreground">{remark.createdBy}</span>
                              <span className="text-xs text-muted-foreground">
                                {remark.createdAt === 'Legacy' ? 'Legacy' : new Date(remark.createdAt).toLocaleString()}
                              </span>
                            </div>
                            <RichTextEditor
                              value={editingRemarkText}
                              onChange={(val) => setEditingRemarkText(val)}
                            />
                            <div className="flex justify-end gap-2 mt-2">
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                onClick={handleCancelEditRemark}
                                className="h-8 text-xs"
                              >
                                Cancel
                              </Button>
                              <Button 
                                size="sm" 
                                onClick={() => handleUpdateRemark(index)}
                                disabled={!editingRemarkText.trim() || editingRemarkText === '<p><br></p>'}
                                className="h-8 text-xs font-semibold"
                              >
                                Save
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="flex justify-between items-start gap-2 mb-1">
                              <div className="flex flex-col">
                                <span className="font-semibold text-foreground">{remark.createdBy}</span>
                                <span className="text-[10px] text-muted-foreground">
                                  {remark.createdAt === 'Legacy' ? 'Legacy' : new Date(remark.createdAt).toLocaleString()}
                                </span>
                              </div>
                              <div className="flex items-center gap-1 opacity-0 group-hover/item:opacity-100 transition-opacity">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-muted-foreground hover:text-foreground hover:bg-muted"
                                  onClick={() => handleEditRemarkStart(index, remark.text)}
                                  title="Edit remark"
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                                  onClick={() => handleDeleteRemark(index)}
                                  title="Delete remark"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </div>
                            <div className="text-muted-foreground prose prose-sm max-w-none mt-1" dangerouslySetInnerHTML={{ __html: remark.text }} />
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground italic">No remarks history yet.</p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setRemarksDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Volunteer Details Dialog */}
      <Dialog open={detailsDialogOpen} onOpenChange={setDetailsDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">Volunteer Information</DialogTitle>
            <DialogDescription>
              Detailed profile for {selectedVolunteer?.name}
            </DialogDescription>
          </DialogHeader>

          {selectedVolunteer && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 py-4">
              {/* Basic Information */}
              <div className="space-y-4">
                <h4 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground border-b pb-1">
                  Basic Details
                </h4>
                <div className="grid grid-cols-2 gap-y-3 gap-x-4 text-sm">
                  <div className="text-muted-foreground">Status</div>
                  <div className="font-medium capitalize">{selectedVolunteer.volunteer_status.replace('_', ' ')}</div>

                  <div className="text-muted-foreground">Organization Type</div>
                  <div className="font-medium capitalize">{selectedVolunteer.organization_type}</div>

                  <div className="text-muted-foreground">Organization Name</div>
                  <div className="font-medium">{getOrganizationDisplay(selectedVolunteer)}</div>

                  <div className="text-muted-foreground">Country</div>
                  <div className="font-medium">{selectedVolunteer.country || '-'}</div>

                  <div className="text-muted-foreground">City</div>
                  <div className="font-medium">{selectedVolunteer.city || '-'}</div>
                </div>
              </div>

              {/* Contact Information */}
              <div className="space-y-4">
                <h4 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground border-b pb-1">
                  Contact Info
                </h4>
                <div className="grid grid-cols-2 gap-y-3 gap-x-4 text-sm">
                  <div className="text-muted-foreground">Phone Number</div>
                  <div className="font-medium">{selectedVolunteer.phone_number}</div>

                  <div className="text-muted-foreground">Personal Email</div>
                  <div className="font-medium break-all">{selectedVolunteer.personal_email || '-'}</div>

                  <div className="text-muted-foreground">Work Email</div>
                  <div className="font-medium break-all">{selectedVolunteer.work_email || '-'}</div>

                  <div className="text-muted-foreground">LinkedIn</div>
                  <div className="font-medium">
                    {selectedVolunteer.linkedin_profile ? (
                      <a href={selectedVolunteer.linkedin_profile} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                        View Profile
                      </a>
                    ) : '-'}
                  </div>

                  <div className="text-muted-foreground">Volunteer ID</div>
                  <div className="font-medium font-mono text-primary font-bold">
                    {generateVolunteerId(selectedVolunteer)}
                  </div>
                </div>
              </div>

              {/* Volunteering Preferences */}
              <div className="space-y-4 md:col-span-2">
                <h4 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground border-b pb-1">
                  Volunteering Preferences
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-y-4 gap-x-6 text-sm">
                  <div>
                    <div className="text-muted-foreground mb-1">Regular Volunteering</div>
                    <Badge variant={selectedVolunteer.regular_volunteering ? 'default' : 'secondary'}>
                      {selectedVolunteer.regular_volunteering ? 'Yes' : 'No'}
                    </Badge>
                  </div>

                  <div>
                    <div className="text-muted-foreground mb-1">Frequency (Monthly)</div>
                    <div className="font-medium">{selectedVolunteer.frequency_per_month || '0'} sessions</div>
                  </div>

                  <div>
                    <div className="text-muted-foreground mb-1">Preferred Day</div>
                    <div className="font-medium">{selectedVolunteer.preferred_day || '-'}</div>
                  </div>

                  <div>
                    <div className="text-muted-foreground mb-1">Preferred Class</div>
                    <div className="font-medium">{selectedVolunteer.preferred_class || '-'}</div>
                  </div>

                  <div>
                    <div className="text-muted-foreground mb-1">Interested Area</div>
                    <div className="font-medium">{selectedVolunteer.interested_area || '-'}</div>
                  </div>

                  <div>
                    <div className="text-muted-foreground mb-1">Interested Topic</div>
                    <div className="font-medium">{selectedVolunteer.interested_topic || '-'}</div>
                  </div>
                </div>

                <div className="mt-4 pt-4 border-t">
                  <div className="text-muted-foreground text-sm mb-2">Remarks / Notes History</div>
                  <div className="space-y-2 max-h-[200px] overflow-y-auto p-2 border rounded-md bg-muted/20">
                    {selectedVolunteer && parseRemarks(selectedVolunteer.remarks).length > 0 ? (
                      parseRemarks(selectedVolunteer.remarks).map((remark, index) => (
                        <div key={index} className="p-2 border-b last:border-b-0 text-xs">
                          <div className="flex justify-between mb-1">
                            <span className="font-semibold">{remark.createdBy}</span>
                            <span className="text-muted-foreground">
                              {remark.createdAt === 'Legacy' ? 'Legacy' : new Date(remark.createdAt).toLocaleString()}
                            </span>
                          </div>
                          <p className="text-muted-foreground whitespace-pre-wrap">{remark.text}</p>
                        </div>
                      ))
                    ) : (
                      <p className="text-xs text-muted-foreground italic">No remarks provided.</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="sm:justify-between items-center bg-muted/20 -mx-6 -mb-6 p-4 rounded-b-lg">
            <div className="text-[10px] text-muted-foreground font-mono">
              ID: {selectedVolunteer?.id}
            </div>
            <Button type="button" onClick={() => setDetailsDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
