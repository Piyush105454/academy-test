import { useState, useEffect, useRef } from 'react';
import { 
  Clock, 
  Search, 
  Upload, 
  CheckCircle2, 
  X, 
  Filter, 
  CreditCard, 
  Edit3, 
  Save, 
  AlertCircle,
  FileSpreadsheet,
  MoreVertical,
  RotateCcw
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { useAcademicYear } from '@/contexts/AcademicYearContext';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import { generateVolunteerId } from '@/utils/volunteerHelper';

interface VolunteerSessionLog {
  session_id: string;
  session_id_code: string;
  session_title: string;
  session_date: string;
  volunteer_id: string | null;
  volunteer_code: string;
  volunteer_name: string;
  work_email: string | null;
  personal_email: string | null;
  benevity_id: string | null;
  logged_hours_in_benevity: boolean;
  hours_tracker_id: string | null;
}

const BENEVITY_STORAGE_KEY = 'volunteer_benevity_ids_v1';

const getStoredBenevityIds = (): Record<string, string> => {
  try {
    const data = localStorage.getItem(BENEVITY_STORAGE_KEY);
    return data ? JSON.parse(data) : {};
  } catch (e) {
    return {};
  }
};

const saveStoredBenevityId = (sessionId: string, benevityId: string) => {
  try {
    const current = getStoredBenevityIds();
    current[sessionId] = benevityId;
    localStorage.setItem(BENEVITY_STORAGE_KEY, JSON.stringify(current));
  } catch (e) {
    console.error('Error saving stored Benevity ID:', e);
  }
};

export default function VolunteerLogHours() {
  const [loading, setLoading] = useState(true);
  const [sessionLogs, setSessionLogs] = useState<VolunteerSessionLog[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  
  const { selectedYear, getDateRange } = useAcademicYear();
  const [selectedMonth, setSelectedMonth] = useState<string>(new Date().getMonth().toString());
  
  // Editing Benevity ID state
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editingBenevityInput, setEditingBenevityInput] = useState('');

  // File upload ref
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isImporting, setIsImporting] = useState(false);

  useEffect(() => {
    fetchSessionLogs();
  }, [selectedYear, selectedMonth]);

  const fetchSessionLogs = async () => {
    try {
      setLoading(true);
      const { startDate, endDate } = getDateRange();
      const storedBenevity = getStoredBenevityIds();

      // Fetch ONLY COMPLETED sessions in academic year
      const { data: sessions, error: sessionsErr } = await supabase
        .from('sessions')
        .select(`
          id,
          session_id_code,
          title,
          session_date,
          status,
          volunteer_name,
          volunteer_id,
          volunteers:volunteer_id (
            id,
            name,
            work_email,
            personal_email,
            organization_name,
            organization_type,
            city,
            preference
          )
        `)
        .ilike('status', 'completed')
        .gte('session_date', startDate.toISOString())
        .lte('session_date', endDate.toISOString())
        .order('session_date', { ascending: false });

      if (sessionsErr) throw sessionsErr;

      // Fetch all volunteers for fallback matching
      const { data: allVolunteers } = await supabase
        .from('volunteers')
        .select('id, name, work_email, personal_email, organization_name, organization_type, city, preference');

      const volunteersMap = new Map<string, any>();
      (allVolunteers || []).forEach(v => {
        const key = v.name.trim().toLowerCase();
        volunteersMap.set(key, v);
      });

      // Fetch session hours tracker records
      const sessionIds = (sessions || []).map(s => s.id);
      let hoursTrackers: any[] = [];
      if (sessionIds.length > 0) {
        const { data: trackerData } = await supabase
          .from('session_hours_tracker')
          .select('*')
          .in('session_id', sessionIds);
        hoursTrackers = trackerData || [];
      }

      const trackerMap = new Map<string, any>();
      hoursTrackers.forEach(t => trackerMap.set(t.session_id, t));

      // Map records
      const logs: VolunteerSessionLog[] = (sessions || [])
        .filter(s => s.volunteer_name && s.volunteer_name.trim() !== '')
        .map((s: any) => {
          const tracker = trackerMap.get(s.id);
          const matchedVol = s.volunteers || volunteersMap.get(s.volunteer_name.trim().toLowerCase());
          
          let workEmail = matchedVol?.work_email || null;
          let personalEmail = matchedVol?.personal_email || null;

          const vCode = matchedVol?.volunteer_id || generateVolunteerId(matchedVol || { name: s.volunteer_name });

          const storedId = storedBenevity[s.id] || (tracker?.notes?.includes('BENEVITY_ID:') ? tracker.notes.split('BENEVITY_ID:')[1].trim() : null);
          const hasBenevityId = Boolean(storedId && storedId.trim() !== '' && storedId !== '-');
          const isLogged = hasBenevityId && (tracker?.logged_hours_in_benevity ?? true);

          return {
            session_id: s.id,
            session_id_code: s.session_id_code || `#${s.id.slice(0, 8).toUpperCase()}`,
            session_title: s.title || 'Volunteer Session',
            session_date: s.session_date,
            volunteer_id: s.volunteer_id,
            volunteer_code: vCode,
            volunteer_name: s.volunteer_name,
            work_email: workEmail,
            personal_email: personalEmail,
            benevity_id: hasBenevityId ? storedId : null,
            logged_hours_in_benevity: isLogged,
            hours_tracker_id: tracker?.id || null
          };
        });

      setSessionLogs(logs);
    } catch (err) {
      console.error('Error fetching session logs:', err);
      toast.error('Failed to load volunteer session logs');
    } finally {
      setLoading(false);
    }
  };

  // Toggle logged status / save Benevity ID manually
  const saveBenevityIdForSession = async (log: VolunteerSessionLog, benevityId: string, loggedState = true) => {
    try {
      const cleanBenevityId = benevityId.trim();

      // Save to localStorage
      saveStoredBenevityId(log.session_id, cleanBenevityId);

      // Save to DB if tracker exists or create tracker
      if (log.hours_tracker_id) {
        await supabase
          .from('session_hours_tracker')
          .update({
            logged_hours_in_benevity: loggedState,
            notes: cleanBenevityId ? `BENEVITY_ID:${cleanBenevityId}` : null
          })
          .eq('id', log.hours_tracker_id);
      } else {
        await supabase
          .from('session_hours_tracker')
          .insert({
            session_id: log.session_id,
            volunteer_id: log.volunteer_id,
            logged_hours_in_benevity: loggedState,
            notes: cleanBenevityId ? `BENEVITY_ID:${cleanBenevityId}` : null
          });
      }

      toast.success(`Updated Benevity status for ${log.volunteer_name}!`);
      setEditingSessionId(null);
      fetchSessionLogs();
    } catch (err) {
      console.error('Error updating Benevity ID:', err);
      toast.error('Failed to save Benevity ID');
    }
  };

  // Excel / CSV File Import with Sequential Mapping & Email Matching
  const handleExcelImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsImporting(true);
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      const jsonRows: any[] = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

      if (jsonRows.length === 0) {
        toast.error('The uploaded file contains no data rows.');
        return;
      }

      // Auto-detect columns
      const sampleRow = jsonRows[0];
      const keys = Object.keys(sampleRow);
      
      const emailKey = keys.find(k => {
        const lower = k.toLowerCase().replace(/[^a-z]/g, '');
        return lower.includes('email') || lower.includes('workemail') || lower.includes('personalemail');
      });

      const benevityKey = keys.find(k => {
        const lower = k.toLowerCase().replace(/[^a-z]/g, '');
        return lower.includes('benevity') || lower.includes('transaction') || lower.includes('txnid') || lower.includes('trackingid') || lower.includes('ref') || lower === 'id';
      });

      if (!emailKey) {
        toast.error('Could not find an Email column in your Excel file. Please ensure a column named Email, Work Email, or Personal Email exists.');
        return;
      }

      // Group Excel entries by normalized email
      const excelMap = new Map<string, string[]>();
      jsonRows.forEach(row => {
        const emailVal = String(row[emailKey] || '').trim().toLowerCase();
        const benevityVal = benevityKey ? String(row[benevityKey] || '').trim() : '';
        if (emailVal) {
          if (!excelMap.has(emailVal)) excelMap.set(emailVal, []);
          excelMap.get(emailVal)!.push(benevityVal);
        }
      });

      let updatedCount = 0;
      let matchedVolunteersCount = 0;

      // Filter sessions for the current selected month if applicable
      const monthFilteredLogs = sessionLogs.filter(log => {
        if (selectedMonth === 'all') return true;
        const month = new Date(log.session_date).getMonth().toString();
        return month === selectedMonth;
      });

      // Group sessions by volunteer emails (work & personal)
      const volunteerSessionsMap = new Map<string, VolunteerSessionLog[]>();
      monthFilteredLogs.forEach(log => {
        const workEm = log.work_email?.trim().toLowerCase();
        const persEm = log.personal_email?.trim().toLowerCase();
        
        if (workEm) {
          if (!volunteerSessionsMap.has(workEm)) volunteerSessionsMap.set(workEm, []);
          if (!volunteerSessionsMap.get(workEm)!.includes(log)) {
            volunteerSessionsMap.get(workEm)!.push(log);
          }
        }
        if (persEm) {
          if (!volunteerSessionsMap.has(persEm)) volunteerSessionsMap.set(persEm, []);
          if (!volunteerSessionsMap.get(persEm)!.includes(log)) {
            volunteerSessionsMap.get(persEm)!.push(log);
          }
        }
      });

      // Process Excel mapping sequentially
      for (const [excelEmail, benevityIdsList] of excelMap.entries()) {
        const targetSessions = volunteerSessionsMap.get(excelEmail);
        if (targetSessions && targetSessions.length > 0) {
          matchedVolunteersCount++;

          // Sort sessions chronologically
          targetSessions.sort((a, b) => new Date(a.session_date).getTime() - new Date(b.session_date).getTime());

          // Map sequentially 1st excel row -> 1st session, 2nd excel row -> 2nd session, etc.
          for (let i = 0; i < targetSessions.length && i < benevityIdsList.length; i++) {
            const session = targetSessions[i];
            const benevityId = benevityIdsList[i] || `BEN-${Date.now().toString().slice(-6)}`;

            saveStoredBenevityId(session.session_id, benevityId);

            if (session.hours_tracker_id) {
              await supabase
                .from('session_hours_tracker')
                .update({
                  logged_hours_in_benevity: true,
                  notes: `BENEVITY_ID:${benevityId}`
                })
                .eq('id', session.hours_tracker_id);
            } else {
              await supabase
                .from('session_hours_tracker')
                .insert({
                  session_id: session.session_id,
                  volunteer_id: session.volunteer_id,
                  logged_hours_in_benevity: true,
                  notes: `BENEVITY_ID:${benevityId}`
                });
            }
            updatedCount++;
          }
        }
      }

      if (updatedCount > 0) {
        toast.success(`Import complete! Updated ${updatedCount} sessions for ${matchedVolunteersCount} volunteers.`);
        fetchSessionLogs();
      } else {
        toast.warning('No matching volunteer emails were found between the Excel file and existing session records.');
      }
    } catch (err) {
      console.error('Error importing Excel file:', err);
      toast.error('Failed to parse and import Excel file. Please verify file format.');
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Filtered logs for table display
  const filteredLogs = sessionLogs.filter(log => {
    // 1. Month filter
    if (selectedMonth !== 'all') {
      const month = new Date(log.session_date).getMonth().toString();
      if (month !== selectedMonth) return false;
    }

    // 2. Status filter
    if (statusFilter === 'logged' && !log.logged_hours_in_benevity) return false;
    if (statusFilter === 'pending' && log.logged_hours_in_benevity) return false;

    // 3. Search query
    const q = searchQuery.toLowerCase();
    if (!q) return true;

    return (
      (log.volunteer_code && log.volunteer_code.toLowerCase().includes(q)) ||
      log.volunteer_name.toLowerCase().includes(q) ||
      (log.work_email && log.work_email.toLowerCase().includes(q)) ||
      (log.personal_email && log.personal_email.toLowerCase().includes(q)) ||
      log.session_id_code.toLowerCase().includes(q) ||
      (log.benevity_id && log.benevity_id.toLowerCase().includes(q))
    );
  });

  const loggedCount = filteredLogs.filter(l => l.logged_hours_in_benevity).length;
  const pendingCount = filteredLogs.length - loggedCount;

  return (
    <DashboardLayout role="admin">
      <div className="space-y-6">
        {/* Top Header & Actions */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Clock className="h-6 w-6 text-primary" />
              Volunteer Log Hours & Benevity Sync
            </h1>
            <p className="text-muted-foreground text-sm">
              Track completed volunteer sessions, manage work & personal emails, and sync Benevity tracking IDs monthly.
            </p>
          </div>

          <div className="flex gap-2">
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleExcelImport} 
              accept=".xlsx, .xls, .csv" 
              className="hidden" 
            />
            
            <Button 
              onClick={() => fileInputRef.current?.click()}
              disabled={isImporting}
              className="gap-2 bg-green-600 hover:bg-green-700 text-white"
            >
              <FileSpreadsheet className="h-4 w-4" />
              {isImporting ? 'Importing...' : 'Import Excel / CSV'}
            </Button>
          </div>
        </div>

        {/* Top Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card className="border-l-4 border-l-blue-500">
            <CardContent className="p-4">
              <p className="text-xs font-medium text-muted-foreground">Completed Sessions</p>
              <h3 className="text-2xl font-bold mt-1 text-blue-600">{filteredLogs.length}</h3>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-green-500">
            <CardContent className="p-4">
              <p className="text-xs font-medium text-muted-foreground">Logged in Benevity</p>
              <h3 className="text-2xl font-bold mt-1 text-green-600">{loggedCount}</h3>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-amber-500">
            <CardContent className="p-4">
              <p className="text-xs font-medium text-muted-foreground">Pending Benevity Sync</p>
              <h3 className="text-2xl font-bold mt-1 text-amber-600">{pendingCount}</h3>
            </CardContent>
          </Card>
        </div>

        {/* Main Log Hours Card & Table */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div>
                <CardTitle className="text-base font-bold">Volunteer Session Logs</CardTitle>
                <CardDescription className="text-xs">Filter by month or search by volunteer name, email, or Benevity ID.</CardDescription>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Search logs..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-8 text-xs h-9 w-[200px]"
                  />
                </div>

                <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                  <SelectTrigger className="w-[130px] text-xs h-9">
                    <SelectValue placeholder="Month" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Months</SelectItem>
                    <SelectItem value="5">June</SelectItem>
                    <SelectItem value="6">July</SelectItem>
                    <SelectItem value="7">August</SelectItem>
                    <SelectItem value="8">September</SelectItem>
                    <SelectItem value="9">October</SelectItem>
                    <SelectItem value="10">November</SelectItem>
                    <SelectItem value="11">December</SelectItem>
                    <SelectItem value="0">January</SelectItem>
                    <SelectItem value="1">February</SelectItem>
                    <SelectItem value="2">March</SelectItem>
                    <SelectItem value="3">April</SelectItem>
                    <SelectItem value="4">May</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[140px] text-xs h-9">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="logged">Logged in Benevity</SelectItem>
                    <SelectItem value="pending">Pending Log</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-0">
            <div className="overflow-x-auto border-t">
              <Table className="text-xs">
                <TableHeader className="bg-muted/50">
                  <TableRow>
                    <TableHead className="font-bold min-w-[180px]">Session ID</TableHead>
                    <TableHead className="font-bold min-w-[160px]">Volunteer Name</TableHead>
                    <TableHead className="font-bold min-w-[180px]">Work Email</TableHead>
                    <TableHead className="font-bold min-w-[180px]">Personal Email</TableHead>
                    <TableHead className="font-bold min-w-[190px]">Benevity ID</TableHead>
                    <TableHead className="font-bold min-w-[110px]">Session Date</TableHead>
                    <TableHead className="font-bold min-w-[130px]">Benevity Status</TableHead>
                    <TableHead className="font-bold text-right min-w-[80px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8 text-xs">Loading completed volunteer logs...</TableCell>
                    </TableRow>
                  ) : filteredLogs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8 text-xs text-muted-foreground">
                        No completed volunteer session records found for the selected month.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredLogs.map((log) => (
                      <TableRow key={log.session_id} className="hover:bg-muted/40">
                        {/* 2. SESSION ID */}
                        <TableCell className="py-2.5">
                          <Badge 
                            variant="outline" 
                            className="font-mono text-[11px] bg-primary/10 text-primary border-primary/20 font-bold px-2 py-0.5 whitespace-nowrap"
                          >
                            {log.session_id_code}
                          </Badge>
                        </TableCell>

                        {/* 2. VOLUNTEER NAME */}
                        <TableCell className="font-semibold text-foreground">
                          {log.volunteer_name}
                        </TableCell>

                        {/* 3. WORK EMAIL */}
                        <TableCell className="font-mono text-[11px]">
                          {log.work_email ? (
                            <span className="text-foreground">{log.work_email}</span>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>

                        {/* 4. PERSONAL EMAIL */}
                        <TableCell className="font-mono text-[11px]">
                          {log.personal_email ? (
                            <span className="text-foreground">{log.personal_email}</span>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>

                        {/* 5. BENEVITY ID WITH INLINE EDIT & CLOSE (X) BUTTON */}
                        <TableCell className="font-mono">
                          {editingSessionId === log.session_id ? (
                            <div className="flex items-center gap-1">
                              <Input 
                                value={editingBenevityInput}
                                onChange={(e) => setEditingBenevityInput(e.target.value)}
                                placeholder="Enter Benevity ID"
                                className="h-7 text-xs font-mono w-32"
                                autoFocus
                              />
                              <Button 
                                size="icon" 
                                className="h-7 w-7 bg-green-600 hover:bg-green-700 text-white" 
                                title="Save Benevity ID"
                                onClick={() => saveBenevityIdForSession(log, editingBenevityInput, true)}
                              >
                                <Save className="h-3.5 w-3.5" />
                              </Button>
                              <Button 
                                size="icon" 
                                variant="ghost" 
                                className="h-7 w-7 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" 
                                title="Cancel Edit"
                                onClick={() => setEditingSessionId(null)}
                              >
                                <X className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          ) : log.benevity_id ? (
                            <span className="inline-flex items-center gap-1 text-purple-700 font-semibold bg-purple-50 px-2 py-0.5 rounded border border-purple-200 text-[11px]">
                              💳 {log.benevity_id}
                            </span>
                          ) : (
                            <span className="text-muted-foreground text-[11px]">-</span>
                          )}
                        </TableCell>

                        {/* 6. SESSION DATE */}
                        <TableCell className="whitespace-nowrap font-medium">
                          {new Date(log.session_date).toLocaleDateString('en-GB')}
                        </TableCell>

                        {/* 7. BENEVITY STATUS */}
                        <TableCell>
                          {log.logged_hours_in_benevity ? (
                            <Badge className="bg-green-600 hover:bg-green-700 text-white text-[10px] whitespace-nowrap font-semibold">
                              Logged in Benevity
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="text-[10px] whitespace-nowrap text-yellow-700 bg-yellow-100 border-yellow-300 font-semibold">
                              Pending Log
                            </Badge>
                          )}
                        </TableCell>

                        {/* 8. ACTIONS WITH 3-DOT DROPDOWN MENU */}
                        <TableCell className="text-right">
                          {editingSessionId === log.session_id ? (
                            <div className="flex justify-end gap-1">
                              <Button 
                                size="sm" 
                                className="h-7 text-xs bg-green-600 hover:bg-green-700 text-white" 
                                onClick={() => saveBenevityIdForSession(log, editingBenevityInput, true)}
                              >
                                Save
                              </Button>
                              <Button 
                                size="sm" 
                                variant="ghost" 
                                className="h-7 text-xs" 
                                onClick={() => setEditingSessionId(null)}
                              >
                                Cancel
                              </Button>
                            </div>
                          ) : (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-7 w-7">
                                  <MoreVertical className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="bg-popover text-xs">
                                <DropdownMenuItem 
                                  onClick={() => {
                                    setEditingSessionId(log.session_id);
                                    setEditingBenevityInput(log.benevity_id || '');
                                  }} 
                                  className="gap-2 cursor-pointer text-blue-600 font-medium"
                                >
                                  <Edit3 className="h-3.5 w-3.5" />
                                  {log.benevity_id ? 'Edit Benevity ID' : 'Add Benevity ID'}
                                </DropdownMenuItem>

                                <DropdownMenuSeparator />

                                {log.logged_hours_in_benevity ? (
                                  <DropdownMenuItem 
                                    onClick={() => saveBenevityIdForSession(log, log.benevity_id || '', false)} 
                                    className="gap-2 cursor-pointer text-yellow-600"
                                  >
                                    <RotateCcw className="h-3.5 w-3.5" />
                                    Mark Pending Log
                                  </DropdownMenuItem>
                                ) : (
                                  <DropdownMenuItem 
                                    onClick={() => saveBenevityIdForSession(log, log.benevity_id || `BEN-${Date.now().toString().slice(-6)}`, true)} 
                                    className="gap-2 cursor-pointer text-green-600 font-medium"
                                  >
                                    <CheckCircle2 className="h-3.5 w-3.5" />
                                    Mark Logged in Benevity
                                  </DropdownMenuItem>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
