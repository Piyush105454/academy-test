import { useState, useEffect, useMemo } from 'react';
import { 
  MapPin, 
  Search, 
  Filter, 
  Download, 
  ExternalLink, 
  Eye, 
  Building2, 
  GraduationCap, 
  Users, 
  Phone, 
  Mail, 
  Compass, 
  ArrowUpDown,
  RefreshCw,
  Map as MapIcon,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
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
import { supabase } from '@/integrations/supabase/client';
import { useAcademicYear } from '@/contexts/AcademicYearContext';
import { StudentInfoDialog } from '@/components/classes/StudentInfoDialog';
import { toast } from 'sonner';

export interface ParsedLocation {
  raw: string;
  address: string;
  lat: number | null;
  lng: number | null;
  mapUrl: string | null;
  hasLocation: boolean;
}

export const parseLocationData = (loc: any): ParsedLocation => {
  if (!loc || loc === 'null' || loc === '-' || loc === '') {
    return { raw: '', address: '', lat: null, lng: null, mapUrl: null, hasLocation: false };
  }

  if (typeof loc === 'object') {
    const lat = loc.lat ? Number(loc.lat) : null;
    const lng = loc.lng ? Number(loc.lng) : null;
    const address = loc.address || (lat && lng ? `${lat}, ${lng}` : '');
    const mapUrl = lat && lng 
      ? `https://www.google.com/maps?q=${lat},${lng}` 
      : (address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}` : null);
    return { raw: JSON.stringify(loc), address, lat, lng, mapUrl, hasLocation: !!address };
  }

  if (typeof loc === 'string') {
    const trimmed = loc.trim();
    if (!trimmed || trimmed === 'null' || trimmed === '-') {
      return { raw: '', address: '', lat: null, lng: null, mapUrl: null, hasLocation: false };
    }
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === 'object') {
        const lat = parsed.lat ? Number(parsed.lat) : null;
        const lng = parsed.lng ? Number(parsed.lng) : null;
        const address = parsed.address || (lat && lng ? `${lat}, ${lng}` : trimmed);
        const mapUrl = lat && lng 
          ? `https://www.google.com/maps?q=${lat},${lng}` 
          : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
        return { raw: trimmed, address, lat, lng, mapUrl, hasLocation: !!address };
      }
    } catch {
      // plain text string
    }
    return {
      raw: trimmed,
      address: trimmed,
      lat: null,
      lng: null,
      mapUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(trimmed)}`,
      hasLocation: true
    };
  }

  return { raw: String(loc), address: String(loc), lat: null, lng: null, mapUrl: null, hasLocation: true };
};

export default function StudentLocations() {
  const { selectedYear } = useAcademicYear();
  const [students, setStudents] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedClassFilter, setSelectedClassFilter] = useState('all');
  const [selectedDesignationFilter, setSelectedDesignationFilter] = useState('all');
  const [selectedLocationMode, setSelectedLocationMode] = useState<'all' | 'with_location' | 'missing_location' | string>('all');
  const [sortField, setSortField] = useState<'name' | 'class' | 'location' | 'designation'>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  // Modal preview
  const [selectedStudentForInfo, setSelectedStudentForInfo] = useState<any | null>(null);
  const [infoDialogOpen, setInfoDialogOpen] = useState(false);

  useEffect(() => {
    fetchData();
  }, [selectedYear]);

  const fetchData = async () => {
    try {
      setLoading(true);

      // 1. Fetch classes
      const { data: classesData, error: classErr } = await supabase
        .from('classes')
        .select('id, name')
        .neq('name', '__SYSTEM_DEV_MODE__')
        .order('name');
      if (classErr) throw classErr;
      setClasses(classesData || []);

      const classMap = new Map<string, string>();
      (classesData || []).forEach(c => classMap.set(c.id, c.name));

      // 2. Fetch all students
      const { data: studentsData, error: studentErr } = await supabase
        .from('students')
        .select('*')
        .order('name');
      if (studentErr) throw studentErr;

      // 3. Fetch user_profiles to backfill missing location/bio/phone/images
      const emails = (studentsData || []).map(s => s.email).filter(Boolean);
      const studentIds = (studentsData || []).map(s => s.id).filter(Boolean);

      const queryOr: string[] = [];
      if (studentIds.length > 0) queryOr.push(`id.in.(${studentIds.join(',')})`);
      if (emails.length > 0) queryOr.push(`email.in.(${emails.join(',')})`);

      let profileMapByEmail = new Map<string, any>();
      let profileMapById = new Map<string, any>();

      if (queryOr.length > 0) {
        try {
          const { data: profiles } = await supabase
            .from('user_profiles')
            .select('id, email, location, bio, phone, profile_image_url')
            .or(queryOr.join(','));

          if (profiles) {
            profiles.forEach(p => {
              if (p.id) profileMapById.set(p.id, p);
              if (p.email) profileMapByEmail.set(p.email.toLowerCase().trim(), p);
            });
          }
        } catch (upErr) {
          console.warn('Error fetching profiles for locations:', upErr);
        }
      }

      // Merge and parse
      const enriched = (studentsData || []).map(st => {
        const prof = (st.email && profileMapByEmail.get(st.email.toLowerCase().trim())) ||
                     (st.id && profileMapById.get(st.id));

        const locRaw = st.location || prof?.location || null;
        const locParsed = parseLocationData(locRaw);
        const bio = (st.bio && st.bio !== 'null') ? st.bio : (prof?.bio && prof.bio !== 'null' ? prof.bio : null);
        const phone = st.phone_number || prof?.phone || null;
        const profileImage = prof?.profile_image_url || null;
        const className = st.class_id ? (classMap.get(st.class_id) || 'Unknown Class') : 'No Class';

        return {
          ...st,
          class_name: className,
          location_data: locParsed,
          bio: bio,
          phone_number: phone,
          profile_image_url: profileImage
        };
      });

      setStudents(enriched);
    } catch (err: any) {
      console.error('Error fetching student locations:', err);
      toast.error('Failed to load student locations: ' + (err.message || 'Unknown error'));
    } finally {
      setLoading(false);
    }
  };

  // Distinct extracted locations for quick filter
  const locationOptions = useMemo(() => {
    const set = new Set<string>();
    students.forEach(s => {
      if (s.location_data?.hasLocation && s.location_data.address) {
        // Clean and push simplified location area
        const cleaned = s.location_data.address.split(',')[0].trim();
        if (cleaned && cleaned.length > 1) {
          set.add(cleaned);
        }
      }
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [students]);

  // Filtered Students
  const filteredStudents = useMemo(() => {
    return students.filter(student => {
      // Academic Year Filter (if specified and student has academic_year)
      if (selectedYear && selectedYear !== 'all' && student.academic_year && student.academic_year !== selectedYear) {
        return false;
      }

      // Class Filter
      if (selectedClassFilter !== 'all') {
        if (student.class_id !== selectedClassFilter) return false;
      }

      // Designation Filter
      if (selectedDesignationFilter !== 'all') {
        if (!student.designation || !student.designation.includes(selectedDesignationFilter)) return false;
      }

      // Location Mode / Specific Location Filter
      if (selectedLocationMode === 'with_location') {
        if (!student.location_data?.hasLocation) return false;
      } else if (selectedLocationMode === 'missing_location') {
        if (student.location_data?.hasLocation) return false;
      } else if (selectedLocationMode !== 'all') {
        // Matches specific location tag
        const addr = (student.location_data?.address || '').toLowerCase();
        if (!addr.includes(selectedLocationMode.toLowerCase())) return false;
      }

      // Search Query (Student Name, Email, ID, Roll, or Address)
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const nameMatch = (student.name || '').toLowerCase().includes(q);
        const emailMatch = (student.email || '').toLowerCase().includes(q);
        const idMatch = (student.student_id || student.roll_number || '').toLowerCase().includes(q);
        const locMatch = (student.location_data?.address || '').toLowerCase().includes(q);
        const classMatch = (student.class_name || '').toLowerCase().includes(q);
        if (!nameMatch && !emailMatch && !idMatch && !locMatch && !classMatch) {
          return false;
        }
      }

      return true;
    }).sort((a, b) => {
      let valA = '';
      let valB = '';

      if (sortField === 'name') {
        valA = a.name || '';
        valB = b.name || '';
      } else if (sortField === 'class') {
        valA = a.class_name || '';
        valB = b.class_name || '';
      } else if (sortField === 'location') {
        valA = a.location_data?.address || '';
        valB = b.location_data?.address || '';
      } else if (sortField === 'designation') {
        valA = a.designation || '';
        valB = b.designation || '';
      }

      return sortOrder === 'asc' 
        ? valA.localeCompare(valB) 
        : valB.localeCompare(valA);
    });
  }, [students, selectedYear, selectedClassFilter, selectedDesignationFilter, selectedLocationMode, searchQuery, sortField, sortOrder]);

  // Statistics
  const stats = useMemo(() => {
    const total = students.length;
    const withLoc = students.filter(s => s.location_data?.hasLocation).length;
    const missing = total - withLoc;
    const uniqueAreas = locationOptions.length;
    return { total, withLoc, missing, uniqueAreas };
  }, [students, locationOptions]);

  // Export to Excel
  const handleExport = async () => {
    try {
      const XLSX = await import('xlsx');
      const rows = filteredStudents.map((s, idx) => ({
        '#': idx + 1,
        'Student Name': s.name,
        'Student ID': s.student_id || s.roll_number || '-',
        'Class': s.class_name,
        'Designation': s.designation || '-',
        'Location Address': s.location_data?.address || 'Not Provided',
        'Google Maps Link': s.location_data?.mapUrl || '',
        'Latitude': s.location_data?.lat || '',
        'Longitude': s.location_data?.lng || '',
        'Phone Number': s.phone_number || '-',
        'Email': s.email || '-',
        'Bio': s.bio || '',
        'Academic Year': s.academic_year || selectedYear,
      }));

      const worksheet = XLSX.utils.json_to_sheet(rows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Student Locations');
      XLSX.writeFile(workbook, `Student_Locations_${selectedYear}_${new Date().toISOString().split('T')[0]}.xlsx`);
      toast.success('Student locations exported to Excel successfully!');
    } catch (err: any) {
      console.error('Export error:', err);
      toast.error('Failed to export locations: ' + (err.message || 'Unknown error'));
    }
  };

  const handleOpenInfo = (student: any) => {
    setSelectedStudentForInfo(student);
    setInfoDialogOpen(true);
  };

  const toggleSort = (field: 'name' | 'class' | 'location' | 'designation') => {
    if (sortField === field) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Page Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 rounded-xl">
                <Compass className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
                  Student Locations Directory
                </h1>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Location-wise directory of all enrolled students across all classes with live maps and filters
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              onClick={fetchData}
              disabled={loading}
              className="gap-2"
              title="Refresh student data"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </Button>

            <Button
              variant="default"
              size="sm"
              onClick={handleExport}
              disabled={filteredStudents.length === 0}
              className="gap-2 bg-primary hover:bg-primary/90 text-primary-foreground shadow-xs"
            >
              <Download className="h-4 w-4" />
              <span>Export Excel</span>
            </Button>
          </div>
        </div>

        {/* Metric Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <Card className="border-border/60 shadow-2xs">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total Students</p>
                <h3 className="text-2xl font-bold text-foreground mt-1">{stats.total}</h3>
              </div>
              <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-600 flex items-center justify-center">
                <Users className="h-5 w-5" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/60 shadow-2xs">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">Location Recorded</p>
                <h3 className="text-2xl font-bold text-emerald-700 dark:text-emerald-300 mt-1">{stats.withLoc}</h3>
              </div>
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
                <CheckCircle2 className="h-5 w-5" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/60 shadow-2xs">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wider">Missing Location</p>
                <h3 className="text-2xl font-bold text-amber-700 dark:text-amber-300 mt-1">{stats.missing}</h3>
              </div>
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center">
                <AlertCircle className="h-5 w-5" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/60 shadow-2xs">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-purple-600 dark:text-purple-400 uppercase tracking-wider">Unique Areas</p>
                <h3 className="text-2xl font-bold text-purple-700 dark:text-purple-300 mt-1">{stats.uniqueAreas}</h3>
              </div>
              <div className="w-10 h-10 rounded-xl bg-purple-500/10 text-purple-600 flex items-center justify-center">
                <MapPin className="h-5 w-5" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filter Controls Bar */}
        <Card className="border-border/60 shadow-2xs">
          <CardContent className="p-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {/* Search Box */}
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search name, ID, or location..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 h-9 text-xs sm:text-sm"
                />
              </div>

              {/* Location Status / Area Filter */}
              <div>
                <Select value={selectedLocationMode} onValueChange={setSelectedLocationMode}>
                  <SelectTrigger className="h-9 text-xs sm:text-sm">
                    <SelectValue placeholder="Filter Location" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">📍 All Locations (Show All)</SelectItem>
                    <SelectItem value="with_location">✓ Only With Location ({stats.withLoc})</SelectItem>
                    <SelectItem value="missing_location">⚠ Missing Location ({stats.missing})</SelectItem>
                    {locationOptions.length > 0 && (
                      <>
                        <div className="px-2 py-1 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                          Areas / Neighborhoods
                        </div>
                        {locationOptions.map(area => (
                          <SelectItem key={area} value={area}>
                            📌 {area}
                          </SelectItem>
                        ))}
                      </>
                    )}
                  </SelectContent>
                </Select>
              </div>

              {/* Class Filter */}
              <div>
                <Select value={selectedClassFilter} onValueChange={setSelectedClassFilter}>
                  <SelectTrigger className="h-9 text-xs sm:text-sm">
                    <SelectValue placeholder="All Classes" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Classes</SelectItem>
                    {classes.map(c => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Designation Filter */}
              <div>
                <Select value={selectedDesignationFilter} onValueChange={setSelectedDesignationFilter}>
                  <SelectTrigger className="h-9 text-xs sm:text-sm">
                    <SelectValue placeholder="All Designations" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Designations</SelectItem>
                    <SelectItem value="1. CCC">1. CCC</SelectItem>
                    <SelectItem value="2. Junior Fellow">2. Junior Fellow</SelectItem>
                    <SelectItem value="3. Senior Fellow">3. Senior Fellow</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Active Filter Indicators */}
            {(searchQuery || selectedLocationMode !== 'all' || selectedClassFilter !== 'all' || selectedDesignationFilter !== 'all') && (
              <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border/60 text-xs text-muted-foreground flex-wrap">
                <span className="font-semibold text-foreground">Active Filters:</span>
                {searchQuery && (
                  <Badge variant="secondary" className="gap-1 text-[11px]">
                    Search: "{searchQuery}"
                    <button onClick={() => setSearchQuery('')} className="ml-1 hover:text-foreground">×</button>
                  </Badge>
                )}
                {selectedLocationMode !== 'all' && (
                  <Badge variant="secondary" className="gap-1 text-[11px]">
                    Location: {selectedLocationMode === 'with_location' ? 'Recorded Only' : selectedLocationMode === 'missing_location' ? 'Missing Only' : selectedLocationMode}
                    <button onClick={() => setSelectedLocationMode('all')} className="ml-1 hover:text-foreground">×</button>
                  </Badge>
                )}
                {selectedClassFilter !== 'all' && (
                  <Badge variant="secondary" className="gap-1 text-[11px]">
                    Class: {classes.find(c => c.id === selectedClassFilter)?.name || selectedClassFilter}
                    <button onClick={() => setSelectedClassFilter('all')} className="ml-1 hover:text-foreground">×</button>
                  </Badge>
                )}
                {selectedDesignationFilter !== 'all' && (
                  <Badge variant="secondary" className="gap-1 text-[11px]">
                    Designation: {selectedDesignationFilter}
                    <button onClick={() => setSelectedDesignationFilter('all')} className="ml-1 hover:text-foreground">×</button>
                  </Badge>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSearchQuery('');
                    setSelectedLocationMode('all');
                    setSelectedClassFilter('all');
                    setSelectedDesignationFilter('all');
                  }}
                  className="h-6 text-xs text-destructive hover:bg-destructive/10"
                >
                  Clear All
                </Button>
                <span className="ml-auto font-medium">
                  Showing <span className="font-bold text-foreground">{filteredStudents.length}</span> of {students.length} students
                </span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Data Table */}
        <Card className="border-border/60 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="w-12 text-center text-xs font-bold uppercase">#</TableHead>
                  <TableHead 
                    className="text-xs font-bold uppercase cursor-pointer select-none hover:text-foreground"
                    onClick={() => toggleSort('name')}
                  >
                    <div className="flex items-center gap-1.5">
                      <span>Student</span>
                      <ArrowUpDown className="h-3 w-3 opacity-60" />
                    </div>
                  </TableHead>
                  <TableHead 
                    className="text-xs font-bold uppercase cursor-pointer select-none hover:text-foreground"
                    onClick={() => toggleSort('class')}
                  >
                    <div className="flex items-center gap-1.5">
                      <span>Class & Subject</span>
                      <ArrowUpDown className="h-3 w-3 opacity-60" />
                    </div>
                  </TableHead>
                  <TableHead 
                    className="text-xs font-bold uppercase cursor-pointer select-none hover:text-foreground"
                    onClick={() => toggleSort('designation')}
                  >
                    <div className="flex items-center gap-1.5">
                      <span>Designation</span>
                      <ArrowUpDown className="h-3 w-3 opacity-60" />
                    </div>
                  </TableHead>
                  <TableHead 
                    className="min-w-[240px] text-xs font-bold uppercase cursor-pointer select-none hover:text-foreground"
                    onClick={() => toggleSort('location')}
                  >
                    <div className="flex items-center gap-1.5 text-rose-600 dark:text-rose-400">
                      <MapPin className="h-3.5 w-3.5 shrink-0" />
                      <span>Location Address</span>
                      <ArrowUpDown className="h-3 w-3 opacity-60" />
                    </div>
                  </TableHead>
                  <TableHead className="text-xs font-bold uppercase">Contact</TableHead>
                  <TableHead className="text-xs font-bold uppercase text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-48 text-center">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                        <p className="text-xs text-muted-foreground">Loading student locations...</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : filteredStudents.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-48 text-center">
                      <div className="flex flex-col items-center justify-center gap-2 text-muted-foreground">
                        <MapPin className="h-10 w-10 text-muted-foreground/40" />
                        <p className="text-base font-semibold text-foreground">No students found matching your filters</p>
                        <p className="text-xs">Try selecting a different location area or clear search filters.</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredStudents.map((student, idx) => {
                    const loc = student.location_data as ParsedLocation;
                    return (
                      <TableRow key={student.id} className="hover:bg-muted/30 transition-colors">
                        {/* Index */}
                        <TableCell className="text-center font-mono text-xs text-muted-foreground">
                          {idx + 1}
                        </TableCell>

                        {/* Student Name & Avatar */}
                        <TableCell>
                          <div className="flex items-center gap-3">
                            {student.profile_image_url ? (
                              <img
                                src={student.profile_image_url}
                                alt={student.name}
                                className="w-8 h-8 rounded-full object-cover border border-border shrink-0"
                              />
                            ) : (
                              <div className="w-8 h-8 rounded-full bg-primary/10 text-primary font-bold text-xs flex items-center justify-center shrink-0">
                                {student.name?.charAt(0).toUpperCase() || 'S'}
                              </div>
                            )}
                            <div className="min-w-0">
                              <p 
                                className="text-xs sm:text-sm font-semibold text-foreground hover:text-primary cursor-pointer truncate"
                                onClick={() => handleOpenInfo(student)}
                              >
                                {student.name}
                              </p>
                              <p className="text-[11px] font-mono text-muted-foreground truncate">
                                {student.student_id || student.roll_number || 'No ID'}
                              </p>
                            </div>
                          </div>
                        </TableCell>

                        {/* Class & Subject */}
                        <TableCell>
                          <div className="space-y-1">
                            <span className="inline-block px-2 py-0.5 rounded-md text-[11px] font-medium bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 border border-blue-200/60 dark:border-blue-800">
                              {student.class_name}
                            </span>
                            {student.subject && (
                              <p className="text-[11px] text-muted-foreground font-medium">
                                {student.subject}
                              </p>
                            )}
                          </div>
                        </TableCell>

                        {/* Designation */}
                        <TableCell>
                          {student.designation ? (
                            <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-800 whitespace-nowrap">
                              {student.designation}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">-</span>
                          )}
                        </TableCell>

                        {/* Location Address */}
                        <TableCell>
                          {loc?.hasLocation ? (
                            <div className="space-y-1 max-w-[320px]">
                              <div className="flex items-start gap-1.5">
                                <MapPin className="h-3.5 w-3.5 text-rose-500 shrink-0 mt-0.5" />
                                <span className="text-xs text-foreground font-medium break-words leading-tight">
                                  {loc.address}
                                </span>
                              </div>
                              {loc.mapUrl && (
                                <a
                                  href={loc.mapUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline font-medium ml-5"
                                  title="Open in Google Maps"
                                >
                                  <span>Open on Google Maps</span>
                                  <ExternalLink className="h-3 w-3 shrink-0" />
                                </a>
                              )}
                            </div>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-slate-100 dark:bg-slate-800 text-muted-foreground">
                              Not Provided
                            </span>
                          )}
                        </TableCell>

                        {/* Contact */}
                        <TableCell>
                          <div className="space-y-1 text-xs">
                            {student.phone_number ? (
                              <a 
                                href={`tel:${student.phone_number}`}
                                className="flex items-center gap-1.5 text-foreground hover:text-primary font-mono text-[11px]"
                              >
                                <Phone className="h-3 w-3 text-muted-foreground shrink-0" />
                                <span>{student.phone_number}</span>
                              </a>
                            ) : null}
                            {student.email && !student.email.includes('placeholder') ? (
                              <a 
                                href={`mailto:${student.email}`}
                                className="flex items-center gap-1.5 text-muted-foreground hover:text-primary text-[11px] truncate max-w-[180px]"
                                title={student.email}
                              >
                                <Mail className="h-3 w-3 shrink-0" />
                                <span className="truncate">{student.email}</span>
                              </a>
                            ) : null}
                            {!student.phone_number && (!student.email || student.email.includes('placeholder')) && (
                              <span className="text-xs text-muted-foreground">-</span>
                            )}
                          </div>
                        </TableCell>

                        {/* Actions */}
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleOpenInfo(student)}
                              className="h-8 px-2.5 text-xs gap-1.5 text-muted-foreground hover:text-foreground"
                              title="View full student record"
                            >
                              <Eye className="h-3.5 w-3.5 text-primary" />
                              <span>Details</span>
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>

          {/* Table Footer */}
          <div className="p-3 bg-muted/20 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
            <div>
              Showing <span className="font-bold text-foreground">{filteredStudents.length}</span> students
            </div>
            <div>
              Location Data: <span className="font-bold text-emerald-600 dark:text-emerald-400">{stats.withLoc}</span> available, <span className="font-bold text-amber-600 dark:text-amber-400">{stats.missing}</span> pending
            </div>
          </div>
        </Card>

        {/* Student Info Dialog Modal */}
        {selectedStudentForInfo && (
          <StudentInfoDialog
            open={infoDialogOpen}
            onOpenChange={setInfoDialogOpen}
            student={selectedStudentForInfo}
          />
        )}
      </div>
    </DashboardLayout>
  );
}
