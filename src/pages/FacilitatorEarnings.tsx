import { useState, useEffect, useMemo } from 'react';
import { Search, Loader2, ArrowUpDown, ChevronDown, CheckCircle2, Clock, Check, AlertCircle } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import { format } from 'date-fns';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  isSessionDelayed,
  getDelayReasonNote,
  calculateFacilitatorSessionAmount
} from '@/utils/facilitatorEarningsUtils';

interface FacilitatorSessionItem {
  id: string; // session id
  earning_id?: string;
  session_id_code: string;
  class_batch: string;
  module_topic: string;
  topics_covered?: string;
  module_name?: string;
  session_date: string;
  amount: number;
  status: 'eligible' | 'under_review' | 'paid';
  earning_status_raw?: string;
  transaction_id?: string;
  paid_at?: string;
  is_delayed?: boolean;
  delay_reason?: string | null;
}

export default function FacilitatorEarnings() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [currentFacilitator, setCurrentFacilitator] = useState<{ id: string; name: string } | null>(null);
  const [allFacilitators, setAllFacilitators] = useState<Array<{ id: string; name: string }>>([]);
  const [userRole, setUserRole] = useState<number | null>(null);
  const [perSessionRate, setPerSessionRate] = useState<number>(200);

  // Sessions and selection
  const [sessions, setSessions] = useState<FacilitatorSessionItem[]>([]);
  const [selectedSessionIds, setSelectedSessionIds] = useState<string[]>([]);
  const [isSubmitDialogOpen, setIsSubmitDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMonth, setSelectedMonth] = useState<string>('all');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<'all' | 'eligible' | 'under_review' | 'paid'>('all');

  useEffect(() => {
    initUserAndFacilitator();
  }, [user?.id]);

  useEffect(() => {
    if (currentFacilitator?.id) {
      loadFacilitatorSessions(currentFacilitator.id, currentFacilitator.name);
    }
  }, [currentFacilitator?.id, perSessionRate]);

  const initUserAndFacilitator = async () => {
    try {
      setLoading(true);

      // 1. Fetch default session rate from facilitator_settings
      const { data: settingsData } = await supabase
        .from('facilitator_settings')
        .select('per_session_amount')
        .limit(1)
        .maybeSingle();

      const rate = settingsData?.per_session_amount || 200;
      setPerSessionRate(rate);

      // 2. Fetch all facilitators for admin switcher
      const { data: facs } = await supabase
        .from('facilitators')
        .select('id, name, email')
        .order('name');
      
      setAllFacilitators(facs || []);

      // 3. Get user role & profile
      let role: number | null = null;
      let userName = '';
      if (user?.id) {
        const { data: profile } = await supabase
          .from('user_profiles')
          .select('role_id, full_name')
          .eq('id', user.id)
          .maybeSingle();
        
        role = profile?.role_id || null;
        userName = profile?.full_name || '';
        setUserRole(role);
      }

      // 4. Match facilitator by email or name
      let matchedFac = facs?.find(f => 
        (user?.email && f.email && f.email.toLowerCase() === user.email.toLowerCase()) ||
        (userName && f.name.toLowerCase().trim() === userName.toLowerCase().trim())
      );

      // If not matched and user is admin/supervisor, pick first facilitator
      if (!matchedFac && facs && facs.length > 0) {
        matchedFac = facs[0];
      }

      if (matchedFac) {
        setCurrentFacilitator({ id: matchedFac.id, name: matchedFac.name });
      }
    } catch (err) {
      console.error('Error initializing facilitator earnings:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadFacilitatorSessions = async (facId: string, facName: string) => {
    try {
      setLoading(true);

      // 1. Fetch completed sessions for this facilitator
      const { data: completedSessions, error: sessError } = await supabase
        .from('sessions')
        .select(`
          id,
          title,
          session_date,
          session_id_code,
          class_batch,
          content_category,
          module_no,
          module_name,
          topics_covered,
          status,
          facilitator_name,
          facilitator_feedback_status,
          recorded_at
        `)
        .ilike('status', 'completed')
        .ilike('facilitator_name', `%${facName}%`)
        .order('session_date', { ascending: false });

      if (sessError) throw sessError;

      // 2. Fetch earnings records from facilitator_earnings for this facilitator
      const { data: earningsData, error: earnError } = await supabase
        .from('facilitator_earnings')
        .select('*')
        .eq('facilitator_id', facId);

      if (earnError) throw earnError;

      // 3. Map earnings by session_id
      const earningsBySession: Record<string, any> = {};
      earningsData?.forEach(e => {
        if (e.session_id) {
          earningsBySession[e.session_id] = e;
        }
      });

      // 4. Build unified session items
      const items: FacilitatorSessionItem[] = (completedSessions || []).map(sess => {
        const earning = earningsBySession[sess.id];
        let status: 'eligible' | 'under_review' | 'paid' = 'eligible';
        const isDelayed = isSessionDelayed(sess);
        const delayReason = getDelayReasonNote(sess);
        const amount = calculateFacilitatorSessionAmount(sess, perSessionRate, earning?.amount);
        let earningId = undefined;

        if (earning) {
          earningId = earning.id;
          if (earning.status === 'approved') {
            status = 'paid';
          } else {
            // 'pending'
            status = 'under_review';
          }
        }

        // Format module & topic
        let modTopic = sess.topics_covered || sess.title || 'Session';
        if (sess.module_name && !modTopic.toLowerCase().includes(sess.module_name.toLowerCase())) {
          modTopic = `${sess.module_name}: ${modTopic}`;
        }

        return {
          id: sess.id,
          earning_id: earningId,
          session_id_code: sess.session_id_code || sess.id.slice(0, 8),
          class_batch: sess.class_batch || 'CCC EMP Fellow',
          module_topic: modTopic,
          topics_covered: sess.topics_covered || sess.title,
          module_name: sess.module_name || '',
          session_date: sess.session_date,
          amount,
          status,
          is_delayed: isDelayed,
          delay_reason: delayReason,
          earning_status_raw: earning?.status,
        };
      });

      setSessions(items);
      setSelectedSessionIds([]);
    } catch (err) {
      console.error('Error loading facilitator sessions:', err);
      toast.error('Failed to load session earnings');
    } finally {
      setLoading(false);
    }
  };

  // Distinct months available for filtering
  const availableMonths = useMemo(() => {
    const monthSet = new Map<string, string>();
    sessions.forEach(s => {
      if (s.session_date) {
        const d = new Date(s.session_date);
        if (!isNaN(d.getTime())) {
          const key = format(d, 'yyyy-MM');
          const label = format(d, 'MMMM yyyy');
          if (!monthSet.has(key)) {
            monthSet.set(key, label);
          }
        }
      }
    });
    return Array.from(monthSet.entries()).map(([key, label]) => ({ key, label }));
  }, [sessions]);

  // Filtered sessions
  const filteredSessions = useMemo(() => {
    return sessions.filter(s => {
      // Search
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch = !q ||
        s.session_id_code.toLowerCase().includes(q) ||
        s.class_batch.toLowerCase().includes(q) ||
        s.module_topic.toLowerCase().includes(q);

      // Month
      let matchesMonth = true;
      if (selectedMonth !== 'all' && s.session_date) {
        matchesMonth = s.session_date.startsWith(selectedMonth);
      }

      // Status
      let matchesStatus = true;
      if (selectedStatusFilter !== 'all') {
        matchesStatus = s.status === selectedStatusFilter;
      }

      return matchesSearch && matchesMonth && matchesStatus;
    });
  }, [sessions, searchQuery, selectedMonth, selectedStatusFilter]);

  // Eligible sessions in current filtered view
  const eligibleFilteredSessions = useMemo(() => {
    return filteredSessions.filter(s => s.status === 'eligible');
  }, [filteredSessions]);

  // Metric Cards
  const availableToEncash = useMemo(() => {
    return sessions
      .filter(s => s.status === 'eligible')
      .reduce((sum, s) => sum + s.amount, 0);
  }, [sessions]);

  const underReview = useMemo(() => {
    return sessions
      .filter(s => s.status === 'under_review')
      .reduce((sum, s) => sum + s.amount, 0);
  }, [sessions]);

  const paidToDate = useMemo(() => {
    return sessions
      .filter(s => s.status === 'paid')
      .reduce((sum, s) => sum + s.amount, 0);
  }, [sessions]);

  const totalCompletedSessions = sessions.length;

  // Selected Amount
  const selectedTotalAmount = useMemo(() => {
    return sessions
      .filter(s => selectedSessionIds.includes(s.id))
      .reduce((sum, s) => sum + s.amount, 0);
  }, [sessions, selectedSessionIds]);

  const selectedDelayedCount = useMemo(() => {
    return sessions
      .filter(s => selectedSessionIds.includes(s.id) && s.is_delayed)
      .length;
  }, [sessions, selectedSessionIds]);

  // Selection handlers
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      const eligibleIds = eligibleFilteredSessions.map(s => s.id);
      setSelectedSessionIds(Array.from(new Set([...selectedSessionIds, ...eligibleIds])));
    } else {
      const eligibleIds = new Set(eligibleFilteredSessions.map(s => s.id));
      setSelectedSessionIds(selectedSessionIds.filter(id => !eligibleIds.has(id)));
    }
  };

  const handleToggleSession = (sessionId: string) => {
    if (selectedSessionIds.includes(sessionId)) {
      setSelectedSessionIds(selectedSessionIds.filter(id => id !== sessionId));
    } else {
      setSelectedSessionIds([...selectedSessionIds, sessionId]);
    }
  };

  const isAllEligibleSelected = eligibleFilteredSessions.length > 0 &&
    eligibleFilteredSessions.every(s => selectedSessionIds.includes(s.id));

  // Submit Encashment
  const handleSubmitEncashment = async () => {
    if (!currentFacilitator?.id || selectedSessionIds.length === 0) return;

    try {
      setIsSubmitting(true);

      const inserts = selectedSessionIds.map(sessionId => {
        const sessItem = sessions.find(s => s.id === sessionId);
        const amount = sessItem?.amount ?? (sessItem?.is_delayed ? Math.round(perSessionRate / 2) : perSessionRate);
        return {
          facilitator_id: currentFacilitator.id,
          session_id: sessionId,
          amount,
          status: 'pending',
          created_at: new Date().toISOString(),
        };
      });

      const { error } = await supabase
        .from('facilitator_earnings')
        .insert(inserts);

      if (error) throw error;

      toast.success(`Submitted ${selectedSessionIds.length} session(s) totaling ₹${selectedTotalAmount.toLocaleString('en-IN')} for encashment!`);
      setIsSubmitDialogOpen(false);
      setSelectedSessionIds([]);

      // Reload sessions
      loadFacilitatorSessions(currentFacilitator.id, currentFacilitator.name);
    } catch (err: any) {
      console.error('Error submitting encashment:', err);
      toast.error('Failed to submit encashment request');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 pb-12 font-sans">
        
        {/* Header Section */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <div>
            <p className="text-xs font-bold text-blue-600 uppercase tracking-wider mb-1">
              REWARDS & EARNINGS
            </p>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
              My Facilitator Earnings
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Select eligible sessions and submit one consolidated encashment request.
            </p>

            {/* Admin Switcher (If Admin / Supervisor) */}
            {(userRole === 1 || userRole === 2) && allFacilitators.length > 1 && (
              <div className="mt-3 flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-600">Viewing Facilitator:</span>
                <Select
                  value={currentFacilitator?.id || ''}
                  onValueChange={(val) => {
                    const f = allFacilitators.find(x => x.id === val);
                    if (f) setCurrentFacilitator(f);
                  }}
                >
                  <SelectTrigger className="h-8 w-52 text-xs bg-slate-50 font-medium">
                    <SelectValue placeholder="Select Facilitator" />
                  </SelectTrigger>
                  <SelectContent>
                    {allFacilitators.map(f => (
                      <SelectItem key={f.id} value={f.id} className="text-xs">
                        {f.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <Button
            onClick={() => setIsSubmitDialogOpen(true)}
            disabled={selectedSessionIds.length === 0}
            className="bg-blue-600 hover:bg-blue-700 text-white font-semibold shadow-sm px-6 py-2.5 h-auto rounded-lg flex items-center gap-2 transition-all disabled:opacity-50"
          >
            <span className="font-bold text-base">₹</span>
            Submit for Encashment
            {selectedSessionIds.length > 0 && (
              <span className="ml-1 bg-white/20 text-white text-xs px-2 py-0.5 rounded-full font-bold">
                {selectedSessionIds.length}
              </span>
            )}
          </Button>
        </div>

        {/* 4 Summary Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          
          {/* Card 1: Available to Encash */}
          <Card className="border border-slate-200 bg-white shadow-sm overflow-hidden relative border-l-4 border-l-emerald-500">
            <CardContent className="p-5">
              <p className="text-xs font-medium text-slate-500 mb-2">Available to Encash</p>
              <h3 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
                ₹{availableToEncash.toLocaleString('en-IN')}
              </h3>
            </CardContent>
          </Card>

          {/* Card 2: Under Review */}
          <Card className="border border-slate-200 bg-white shadow-sm overflow-hidden relative border-l-4 border-l-amber-500">
            <CardContent className="p-5">
              <p className="text-xs font-medium text-slate-500 mb-2">Under Review</p>
              <h3 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
                ₹{underReview.toLocaleString('en-IN')}
              </h3>
            </CardContent>
          </Card>

          {/* Card 3: Paid to Date */}
          <Card className="border border-slate-200 bg-white shadow-sm overflow-hidden relative border-l-4 border-l-purple-500">
            <CardContent className="p-5">
              <p className="text-xs font-medium text-slate-500 mb-2">Paid to Date</p>
              <h3 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
                ₹{paidToDate.toLocaleString('en-IN')}
              </h3>
            </CardContent>
          </Card>

          {/* Card 4: Total Completed Sessions */}
          <Card className="border border-slate-200 bg-white shadow-sm overflow-hidden relative border-l-4 border-l-blue-500">
            <CardContent className="p-5">
              <p className="text-xs font-medium text-slate-500 mb-2">Total Completed Sessions</p>
              <h3 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
                {totalCompletedSessions}
              </h3>
            </CardContent>
          </Card>

        </div>

        {/* Completed Session Earnings Table Card */}
        <Card className="border border-slate-200 bg-white shadow-sm overflow-hidden">
          
          {/* Card Header & Subtitle */}
          <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
            <div>
              <h2 className="font-bold text-base text-slate-900">
                Completed Session Earnings
              </h2>
            </div>
            <p className="text-xs text-slate-400 italic">
              Only approved, unclaimed sessions can be selected
            </p>
          </div>

          {/* Controls & Filter Bar */}
          <div className="p-4 bg-slate-50/50 border-b border-slate-100 flex flex-col sm:flex-row gap-3 items-center justify-between">
            
            {/* Search */}
            <div className="relative w-full sm:flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Search session ID, class, module or topic..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-9 text-xs bg-white border-slate-200"
              />
            </div>

            {/* Dropdowns */}
            <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
              
              {/* Month Dropdown */}
              <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                <SelectTrigger className="h-9 w-full sm:w-44 text-xs bg-white border-slate-200 font-medium">
                  <SelectValue placeholder="All Months" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="text-xs">All Months</SelectItem>
                  {availableMonths.map(m => (
                    <SelectItem key={m.key} value={m.key} className="text-xs">
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Status Dropdown */}
              <Select value={selectedStatusFilter} onValueChange={(val: any) => setSelectedStatusFilter(val)}>
                <SelectTrigger className="h-9 w-full sm:w-36 text-xs bg-white border-slate-200 font-medium">
                  <SelectValue placeholder="All Statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="text-xs">All Statuses</SelectItem>
                  <SelectItem value="eligible" className="text-xs">Eligible</SelectItem>
                  <SelectItem value="under_review" className="text-xs">Under Review</SelectItem>
                  <SelectItem value="paid" className="text-xs">Paid</SelectItem>
                </SelectContent>
              </Select>

            </div>
          </div>

          {/* Table Content */}
          <div className="overflow-x-auto">
            {loading ? (
              <div className="flex flex-col justify-center items-center py-16 gap-2">
                <Loader2 className="h-7 w-7 animate-spin text-blue-600" />
                <p className="text-xs text-slate-400">Loading sessions...</p>
              </div>
            ) : filteredSessions.length === 0 ? (
              <div className="text-center py-16 text-slate-400 text-xs italic">
                No completed sessions found for the selected filters.
              </div>
            ) : (
              <Table className="text-xs">
                <TableHeader>
                  <TableRow className="bg-slate-50/70 border-b border-slate-200">
                    <TableHead className="w-12 text-center">
                      <Checkbox
                        checked={isAllEligibleSelected}
                        disabled={eligibleFilteredSessions.length === 0}
                        onCheckedChange={(checked) => handleSelectAll(!!checked)}
                        aria-label="Select all eligible sessions"
                      />
                    </TableHead>
                    <TableHead className="font-bold text-slate-600 uppercase text-[11px] min-w-[150px]">
                      SESSION ID
                    </TableHead>
                    <TableHead className="font-bold text-slate-600 uppercase text-[11px] min-w-[140px]">
                      CLASS / PROGRAM
                    </TableHead>
                    <TableHead className="font-bold text-slate-600 uppercase text-[11px] min-w-[200px]">
                      MODULE & TOPIC
                    </TableHead>
                    <TableHead className="font-bold text-slate-600 uppercase text-[11px] min-w-[110px]">
                      DATE
                    </TableHead>
                    <TableHead className="font-bold text-slate-600 uppercase text-[11px] min-w-[90px]">
                      AMOUNT
                    </TableHead>
                    <TableHead className="font-bold text-slate-600 uppercase text-[11px] min-w-[100px]">
                      STATUS
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredSessions.map((session) => {
                    const isEligible = session.status === 'eligible';
                    const isSelected = selectedSessionIds.includes(session.id);
                    const formattedDate = session.session_date
                      ? format(new Date(session.session_date), 'd MMM yyyy')
                      : '-';

                    return (
                      <TableRow
                        key={session.id}
                        className={`hover:bg-slate-50/80 transition-colors border-b border-slate-100 ${
                          isSelected ? 'bg-blue-50/40' : ''
                        }`}
                      >
                        {/* Checkbox */}
                        <TableCell className="text-center">
                          {isEligible ? (
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={() => handleToggleSession(session.id)}
                              aria-label={`Select ${session.session_id_code}`}
                            />
                          ) : (
                            <Checkbox
                              disabled
                              checked={false}
                              className="opacity-25 cursor-not-allowed"
                            />
                          )}
                        </TableCell>

                        {/* SESSION ID */}
                        <TableCell className="font-bold">
                          <a
                            href={`/sessions/${session.id}/recording`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:text-blue-800 hover:underline cursor-pointer"
                          >
                            {session.session_id_code}
                          </a>
                        </TableCell>

                        {/* CLASS / PROGRAM */}
                        <TableCell className="font-medium text-slate-700">
                          {session.class_batch}
                        </TableCell>

                        {/* MODULE & TOPIC */}
                        <TableCell className="text-slate-700 max-w-[240px] truncate" title={session.module_topic}>
                          {session.module_topic}
                        </TableCell>

                        {/* DATE */}
                        <TableCell className="text-slate-600 whitespace-nowrap">
                          {formattedDate}
                        </TableCell>

                        {/* AMOUNT */}
                        <TableCell className="font-bold text-emerald-600 text-sm whitespace-nowrap">
                          <div className="flex flex-col">
                            <span>₹{session.amount.toLocaleString('en-IN')}</span>
                            {session.is_delayed ? (
                              <div className="mt-0.5">
                                <span 
                                  className="text-[10px] font-semibold text-amber-800 bg-amber-50 border border-amber-300 rounded px-1.5 py-0.5 inline-flex items-center gap-1 whitespace-nowrap"
                                  title={session.delay_reason || "Delayed Session: 50% deduction applied"}
                                >
                                  ⚠️ Delayed (-50%)
                                </span>
                                <span 
                                  className="block text-[9px] text-amber-700 italic mt-0.5 max-w-[150px] truncate cursor-help"
                                  title={session.delay_reason || "Delayed session"}
                                >
                                  {session.delay_reason || "Late feedback submission"}
                                </span>
                              </div>
                            ) : (
                              <span className="text-[10px] text-slate-400 font-normal">Standard (₹{perSessionRate})</span>
                            )}
                          </div>
                        </TableCell>

                        {/* STATUS BADGE */}
                        <TableCell>
                          {session.status === 'eligible' && (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              Eligible
                            </span>
                          )}
                          {session.status === 'under_review' && (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                              Under Review
                            </span>
                          )}
                          {session.status === 'paid' && (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-purple-50 text-purple-700 border border-purple-200">
                              Paid
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </div>
        </Card>

        {/* Encashment Confirmation Dialog */}
        <Dialog open={isSubmitDialogOpen} onOpenChange={setIsSubmitDialogOpen}>
          <DialogContent className="sm:max-w-[440px]">
            <DialogHeader>
              <DialogTitle className="text-slate-900 font-bold flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-blue-600" />
                Submit for Encashment
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500">
                Please review your encashment request details before submitting for approval.
              </DialogDescription>
            </DialogHeader>

            <div className="py-4 space-y-3">
              <div className="bg-slate-50 rounded-lg p-3.5 border border-slate-200 text-xs space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 font-medium">Facilitator:</span>
                  <span className="font-bold text-slate-800">{currentFacilitator?.name}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 font-medium">Selected Sessions:</span>
                  <span className="font-bold text-slate-800">{selectedSessionIds.length}</span>
                </div>
                {selectedDelayedCount > 0 && (
                  <div className="flex justify-between items-center text-amber-700 font-medium">
                    <span>Delayed Sessions (50% Rate):</span>
                    <span className="font-bold">{selectedDelayedCount} (₹{Math.round(perSessionRate / 2)} each)</span>
                  </div>
                )}
                <div className="flex justify-between items-center border-t border-slate-200 pt-2 text-sm">
                  <span className="font-semibold text-slate-700">Total Encashment Amount:</span>
                  <span className="font-extrabold text-emerald-600 text-base">
                    ₹{selectedTotalAmount.toLocaleString('en-IN')}
                  </span>
                </div>
              </div>

              {selectedDelayedCount > 0 && (
                <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-[11px] flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                  <div>
                    <strong>{selectedDelayedCount} session(s)</strong> are categorized as <strong>Delayed</strong> (recorded after scheduled date) and have 50% deduction applied (₹{Math.round(perSessionRate / 2)} instead of ₹{perSessionRate}).
                  </div>
                </div>
              )}

              <p className="text-[11px] text-slate-400">
                Once submitted, these sessions will move to <strong>Under Review</strong> and will be processed by the admin for online payment.
              </p>
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                variant="outline"
                onClick={() => setIsSubmitDialogOpen(false)}
                disabled={isSubmitting}
                className="text-xs"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSubmitEncashment}
                disabled={isSubmitting}
                className="bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  'Confirm & Submit'
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

      </div>
    </DashboardLayout>
  );
}
