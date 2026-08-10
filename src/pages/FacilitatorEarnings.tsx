import { useState, useEffect } from 'react';
import { Wallet, Search, TrendingUp, Download, Info, CheckCircle } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import { useAcademicYear } from '@/contexts/AcademicYearContext';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface EarningRecord {
  id: string;
  facilitator_id: string;
  session_id: string;
  amount: number;
  status: string;
  created_at: string;
  approved_at: string | null;
  sessions?: {
    title: string;
    session_date: string;
  };
}

export default function FacilitatorEarnings() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [records, setRecords] = useState<EarningRecord[]>([]);
  const [totalApproved, setTotalApproved] = useState(0);
  const { selectedYear, getDateRange } = useAcademicYear();
  const [selectedMonth, setSelectedMonth] = useState<string>(new Date().getMonth().toString());

  useEffect(() => {
    if (user?.id) {
      fetchMyEarnings();
    }
  }, [user?.id, selectedYear, selectedMonth]);

  const fetchMyEarnings = async () => {
    try {
      setLoading(true);
      
      // First get facilitator ID for this user using their email
      const { data: facilitator, error: facError } = await supabase
        .from('facilitators')
        .select('id')
        .ilike('email', user?.email || '')
        .maybeSingle();
        
      if (facError) {
        throw facError;
      }

      if (!facilitator) {
        setLoading(false);
        return;
      }

      // Then get their earnings
      const { data, error } = await supabase
        .from('facilitator_earnings')
        .select(`
          *,
          sessions (
            title,
            session_date
          )
        `)
        .eq('facilitator_id', facilitator.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      const { startDate, endDate } = getDateRange();
      
      const fetchedRecords = data || [];
      
      const filtered = fetchedRecords.filter(r => {
        const recordDateStr = r.sessions?.session_date || r.created_at;
        const recordDate = new Date(recordDateStr);
        const matchesAcademicYear = recordDate >= startDate && recordDate <= endDate;
        const matchesMonth = selectedMonth === 'all' || recordDate.getMonth().toString() === selectedMonth;
        return matchesAcademicYear && matchesMonth;
      });
      
      setRecords(filtered);
      
      const approved = filtered.filter(r => r.status === 'approved').reduce((sum, r) => sum + Number(r.amount), 0);
      
      setTotalApproved(approved);
      
    } catch (error) {
      console.error('Error fetching earnings:', error);
      toast.error('Failed to load earnings history');
    } finally {
      setLoading(false);
    }
  };

  const filteredRecords = records.filter(r => 
    (r.sessions?.title || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <DashboardLayout role="facilitator">
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">My Earnings</h1>
            <p className="text-muted-foreground">Track your session payouts and earning history</p>
          </div>
          <Button variant="outline" className="gap-2">
            <Download className="h-4 w-4" />
            Download History
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Total Earnings</p>
                  <h3 className="text-3xl font-bold mt-2 text-green-600">
                    ₹{totalApproved.toLocaleString('en-IN')}
                  </h3>
                </div>
                <div className="p-4 bg-green-100 rounded-full">
                  <Wallet className="h-6 w-6 text-green-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Total Sessions</p>
                  <h3 className="text-3xl font-bold mt-2 text-blue-600">
                    {records.filter(r => r.status === 'approved').length}
                  </h3>
                </div>
                <div className="p-4 bg-blue-100 rounded-full">
                  <CheckCircle className="h-6 w-6 text-blue-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <CardTitle>Earning History</CardTitle>
              <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto">
                <div className="relative w-full sm:w-72">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search sessions..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                  />
                </div>
                <div className="w-full sm:w-48">
                  <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                    <SelectTrigger>
                      <SelectValue placeholder="All Months" />
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
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Session Title</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-8">Loading history...</TableCell>
                    </TableRow>
                  ) : filteredRecords.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                        No earning records found
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredRecords.map((record) => (
                      <TableRow key={record.id}>
                        <TableCell className="font-medium">{record.sessions?.title || 'Unknown Session'}</TableCell>
                        <TableCell>
                          {record.sessions?.session_date 
                            ? new Date(record.sessions.session_date).toLocaleDateString() 
                            : '-'}
                        </TableCell>
                        <TableCell>
                          <Badge variant={record.status === 'approved' ? 'default' : 'secondary'}>
                            {record.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          <span className={record.status === 'approved' ? 'text-green-600' : 'text-yellow-600'}>
                            ₹{record.amount.toLocaleString('en-IN')}
                          </span>
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
