import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ClipboardList, Search, RefreshCw, AlertTriangle, Terminal, Info, FileSpreadsheet, Download, Calendar as CalendarIcon } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface ActivityLog {
  id: string;
  user_email: string;
  user_name: string | null;
  action: string;
  module: string;
  details: string | null;
  created_at: string;
}

export default function ActivityLogs() {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterModule, setFilterModule] = useState('all');
  const [filterAction, setFilterAction] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [errorNotice, setErrorNotice] = useState(false);
  const [limit, setLimit] = useState(50);

  const fetchLogs = async () => {
    try {
      setLoading(true);
      setErrorNotice(false);
      
      let query = supabase
        .from('activity_logs')
        .select('*')
        .order('created_at', { ascending: false });

      if (startDate) {
        query = query.gte('created_at', `${startDate}T00:00:00`);
      }
      if (endDate) {
        query = query.lte('created_at', `${endDate}T23:59:59`);
      }

      const { data, error } = await query.limit(limit);

      if (error) {
        if (error.code === 'PGRST205' || error.message.includes('relation "public.activity_logs" does not exist')) {
          setErrorNotice(true);
        } else {
          throw error;
        }
      } else {
        setLogs(data || []);
      }
    } catch (error: any) {
      console.error('Error fetching logs:', error);
      toast.error('Failed to load activity logs');
    } finally {
      setLoading(false);
    }
  };

  const handleExportExcel = async () => {
    try {
      setExporting(true);
      toast.loading('Exporting Activity Logs to Excel...', { id: 'export-excel' });

      // Fetch all logs matching active filters and date range without small page limits
      let query = supabase
        .from('activity_logs')
        .select('*')
        .order('created_at', { ascending: false });

      if (filterModule !== 'all') {
        query = query.eq('module', filterModule);
      }
      if (filterAction !== 'all') {
        query = query.eq('action', filterAction);
      }
      if (startDate) {
        query = query.gte('created_at', `${startDate}T00:00:00`);
      }
      if (endDate) {
        query = query.lte('created_at', `${endDate}T23:59:59`);
      }

      let allRecords: any[] = [];
      let page = 0;
      let pageSize = 1000;
      let done = false;

      while (!done) {
        const { data, error } = await query.range(page * pageSize, (page + 1) * pageSize - 1);
        if (error) throw error;
        if (data && data.length > 0) {
          allRecords = allRecords.concat(data);
          if (data.length < pageSize) done = true;
          else page++;
        } else {
          done = true;
        }
      }

      if (allRecords.length === 0) {
        toast.error('No activity logs available for the selected date range.', { id: 'export-excel' });
        return;
      }

      // Filter locally by search query if set
      const finalData = allRecords.filter(log => {
        if (!searchQuery.trim()) return true;
        const q = searchQuery.toLowerCase();
        return (
          (log.user_name || '').toLowerCase().includes(q) ||
          (log.user_email || '').toLowerCase().includes(q) ||
          (log.details || '').toLowerCase().includes(q)
        );
      });

      if (finalData.length === 0) {
        toast.error('No activity logs match the search query.', { id: 'export-excel' });
        return;
      }

      // Format data rows for Excel sheet
      const excelRows = finalData.map((log, index) => ({
        'S.No': index + 1,
        'Date & Time': new Date(log.created_at).toLocaleString('en-IN', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          second: '2-digit',
          hour12: true
        }),
        'User Name': log.user_name || 'System User',
        'User Email': log.user_email || '',
        'Action': log.action || '',
        'Module': log.module || '',
        'Details': log.details || '-'
      }));

      // Import XLSX dynamically
      const XLSX = await import('xlsx');
      const worksheet = XLSX.utils.json_to_sheet(excelRows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Activity Logs');

      // Adjust column widths
      worksheet['!cols'] = [
        { wch: 6 },  // S.No
        { wch: 24 }, // Date & Time
        { wch: 22 }, // User Name
        { wch: 30 }, // User Email
        { wch: 12 }, // Action
        { wch: 16 }, // Module
        { wch: 70 }, // Details
      ];

      const rangeTag = startDate || endDate ? `_${startDate || 'Start'}_to_${endDate || 'End'}` : `_AllTime_${new Date().toISOString().split('T')[0]}`;
      XLSX.writeFile(workbook, `Activity_Logs${rangeTag}.xlsx`);
      toast.success(`Exported ${excelRows.length} activity log records to Excel!`, { id: 'export-excel' });
    } catch (err: any) {
      console.error('Error exporting logs:', err);
      toast.error('Failed to export Excel file: ' + (err.message || 'Unknown error'), { id: 'export-excel' });
    } finally {
      setExporting(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [limit, startDate, endDate]);

  // Unique modules and actions for filter dropdowns
  const modules = ['Classes', 'Students', 'Tasks', 'Sessions', 'Earnings'];
  const actions = ['CREATE', 'UPDATE', 'DELETE', 'LOCK', 'UNLOCK', 'VERIFY', 'REJECT'];

  const filteredLogs = logs.filter(log => {
    const matchesSearch = 
      (log.user_name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (log.user_email || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (log.details || '').toLowerCase().includes(searchQuery.toLowerCase());

    const matchesModule = filterModule === 'all' || log.module === filterModule;
    const matchesAction = filterAction === 'all' || log.action === filterAction;

    return matchesSearch && matchesModule && matchesAction;
  });

  const getActionBadgeVariant = (action: string) => {
    switch (action.toUpperCase()) {
      case 'CREATE':
        return 'default';
      case 'UPDATE':
        return 'secondary';
      case 'DELETE':
        return 'destructive';
      case 'LOCK':
        return 'outline';
      case 'UNLOCK':
        return 'outline';
      case 'VERIFY':
        return 'default';
      case 'REJECT':
        return 'destructive';
      default:
        return 'secondary';
    }
  };

  const getActionBadgeClass = (action: string) => {
    switch (action.toUpperCase()) {
      case 'CREATE':
        return 'bg-green-100 text-green-800 hover:bg-green-100 border-green-200';
      case 'VERIFY':
        return 'bg-emerald-100 text-emerald-800 hover:bg-emerald-100 border-emerald-200';
      case 'UPDATE':
        return 'bg-blue-100 text-blue-800 hover:bg-blue-100 border-blue-200';
      case 'DELETE':
      case 'REJECT':
        return 'bg-red-100 text-red-800 hover:bg-red-100 border-red-200';
      case 'LOCK':
        return 'bg-amber-100 text-amber-800 hover:bg-amber-100 border-amber-200';
      case 'UNLOCK':
        return 'bg-teal-100 text-teal-800 hover:bg-teal-100 border-teal-200';
      default:
        return '';
    }
  };

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Activity Logs</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Audit trails of all administrator actions across the platform
            </p>
          </div>
          <div className="flex items-center gap-2 self-start md:self-auto">
            <Button 
              size="sm" 
              onClick={handleExportExcel} 
              disabled={exporting || loading}
              className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs h-9 shadow-sm"
            >
              <FileSpreadsheet className={`h-4 w-4 ${exporting ? 'animate-spin' : ''}`} />
              <span>{exporting ? 'Exporting...' : 'Export Excel'}</span>
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={fetchLogs} 
              disabled={loading}
              className="gap-2 text-xs font-semibold h-9"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh Logs</span>
            </Button>
          </div>
        </div>

        {/* Database Migration Alert Notice if Table doesn't exist */}
        {errorNotice && (
          <Card className="border-amber-200 bg-amber-50/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-amber-800 flex items-center gap-2 text-base">
                <AlertTriangle className="h-5 w-5 text-amber-600" />
                Database Migration Required
              </CardTitle>
              <CardDescription className="text-amber-700 text-xs">
                The <code className="bg-amber-100 px-1 py-0.5 rounded text-amber-900">activity_logs</code> database table needs to be created. Please run the migration SQL below inside your Supabase console SQL Editor to activate logging.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-slate-900 text-slate-100 p-4 rounded-lg font-mono text-xs overflow-x-auto relative group">
                <Button 
                  size="xs" 
                  variant="ghost" 
                  className="absolute right-2 top-2 text-[10px] text-slate-400 hover:text-slate-100 h-6 bg-slate-800"
                  onClick={() => {
                    navigator.clipboard.writeText(`CREATE TABLE IF NOT EXISTS public.activity_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_email TEXT NOT NULL,
    user_name TEXT,
    action TEXT NOT NULL,
    module TEXT NOT NULL,
    details TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow authenticated users to insert activity logs" ON public.activity_logs FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Allow authenticated users to select activity logs" ON public.activity_logs FOR SELECT TO authenticated USING (true);`);
                    toast.success('SQL migration script copied to clipboard!');
                  }}
                >
                  Copy SQL
                </Button>
                <span className="text-slate-400">-- 1. Create table</span>
                <br />
                CREATE TABLE IF NOT EXISTS public.activity_logs (
                <br />
                &nbsp;&nbsp;&nbsp;&nbsp;id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                <br />
                &nbsp;&nbsp;&nbsp;&nbsp;user_email TEXT NOT NULL,
                <br />
                &nbsp;&nbsp;&nbsp;&nbsp;user_name TEXT,
                <br />
                &nbsp;&nbsp;&nbsp;&nbsp;action TEXT NOT NULL,
                <br />
                &nbsp;&nbsp;&nbsp;&nbsp;module TEXT NOT NULL,
                <br />
                &nbsp;&nbsp;&nbsp;&nbsp;details TEXT,
                <br />
                &nbsp;&nbsp;&nbsp;&nbsp;created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
                <br />
                );
                <br />
                <span className="text-slate-400">-- 2. Enable RLS and setup policies</span>
                <br />
                ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;
                <br />
                CREATE POLICY "Allow authenticated users to insert activity logs" ON public.activity_logs FOR INSERT TO authenticated WITH CHECK (true);
                <br />
                CREATE POLICY "Allow authenticated users to select activity logs" ON public.activity_logs FOR SELECT TO authenticated USING (true);
              </div>
              <div className="flex items-start gap-2 text-xs text-amber-700">
                <Info className="h-4 w-4 shrink-0 mt-0.5" />
                <span>Once the database migration is executed, refresh this page to view activity logs.</span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Filters and Controls */}
        <Card className="shadow-sm border-border/50">
          <CardContent className="p-4 flex flex-col md:flex-row gap-4 items-center justify-between">
            {/* Search Input */}
            <div className="w-full md:w-1/4 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search user or details..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 text-sm border-border h-9"
              />
            </div>

            {/* Date Pickers & Dropdown Filters */}
            <div className="flex flex-wrap w-full md:w-auto items-center gap-2.5 justify-end">
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <CalendarIcon className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="font-medium">From:</span>
                <Input 
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="h-8 text-xs w-[130px] border-border"
                />
              </div>

              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <span className="font-medium">To:</span>
                <Input 
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="h-8 text-xs w-[130px] border-border"
                />
              </div>

              {(startDate || endDate) && (
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={() => { setStartDate(''); setEndDate(''); }}
                  className="h-8 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 px-2"
                >
                  Clear Dates
                </Button>
              )}

              <Select value={filterModule} onValueChange={setFilterModule}>
                <SelectTrigger className="w-[130px] text-xs h-8 border-border">
                  <SelectValue placeholder="All Modules" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Modules</SelectItem>
                  {modules.map(mod => (
                    <SelectItem key={mod} value={mod}>{mod}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={filterAction} onValueChange={setFilterAction}>
                <SelectTrigger className="w-[130px] text-xs h-8 border-border">
                  <SelectValue placeholder="All Actions" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Actions</SelectItem>
                  {actions.map(act => (
                    <SelectItem key={act} value={act}>{act}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Audit Logs Table */}
        <Card className="shadow-sm border-border/50">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg flex items-center gap-2">
                  <ClipboardList className="h-5 w-5 text-primary" />
                  Audit logs
                </CardTitle>
                <CardDescription>
                  Showing {filteredLogs.length} of the latest actions recorded
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex justify-center py-20">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary"></div>
              </div>
            ) : filteredLogs.length === 0 ? (
              <div className="text-center py-20 text-muted-foreground border-t">
                No activity logs found matching the selected filters.
              </div>
            ) : (
              <div className="overflow-x-auto border-t">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="w-[200px]">Date & Time</TableHead>
                      <TableHead className="w-[220px]">User</TableHead>
                      <TableHead className="w-[110px]">Action</TableHead>
                      <TableHead className="w-[120px]">Module</TableHead>
                      <TableHead>Details</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredLogs.map((log) => (
                      <TableRow key={log.id} className="hover:bg-muted/30 transition-colors">
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {new Date(log.created_at).toLocaleString('en-IN', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                            hour: 'numeric',
                            minute: '2-digit',
                            second: '2-digit',
                            hour12: true
                          })}
                        </TableCell>
                        <TableCell>
                          <div className="font-semibold text-sm text-foreground">
                            {log.user_name || 'System User'}
                          </div>
                          <div className="text-xs text-muted-foreground truncate max-w-[200px]" title={log.user_email}>
                            {log.user_email}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge 
                            variant={getActionBadgeVariant(log.action)}
                            className={cn("text-[10px] uppercase font-bold", getActionBadgeClass(log.action))}
                          >
                            {log.action}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[10px] font-normal whitespace-nowrap">
                            {log.module}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {log.details || '-'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
            
            {logs.length >= limit && (
              <div className="flex justify-center p-4 border-t">
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => setLimit(prev => prev + 50)}
                  disabled={loading}
                >
                  Load More Logs
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
