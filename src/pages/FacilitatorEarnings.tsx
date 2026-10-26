import { useState, useEffect, useMemo } from 'react';
import { 
  Search, 
  Loader2, 
  ArrowUpDown, 
  ChevronDown, 
  CheckCircle2, 
  Clock, 
  Check, 
  AlertCircle, 
  FileText, 
  Video, 
  Wallet, 
  UploadCloud, 
  FileCheck, 
  Eye, 
  ExternalLink, 
  ShieldCheck 
} from 'lucide-react';
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
  calculateFacilitatorSessionAmount,
  getStoredPayments,
  getStoredVouchers,
  saveStoredVoucher,
  getStoredSubmissions,
  saveStoredSubmission,
  removeStoredSubmission
} from '@/utils/facilitatorEarningsUtils';
import { GoogleDriveResumableUploader } from '@/utils/GoogleDriveResumableUploader';

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
  status: 'pending' | 'submitted' | 'approved' | 'to_pay' | 'paid';
  earning_status_raw?: string;
  transaction_id?: string;
  paid_at?: string;
  voucher_url?: string;
  is_delayed?: boolean;
  delay_reason?: string | null;
  record_sheet_link?: string | null;
  final_content_ppt?: string | null;
  recording_url?: string | null;
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
  
  // Dialog 1: Submit for Approval
  const [isApprovalDialogOpen, setIsApprovalDialogOpen] = useState(false);
  const [ackApproval, setAckApproval] = useState(false);
  
  // Dialog 2: Submit Encashment Request (Signed Voucher)
  const [isEncashDialogOpen, setIsEncashDialogOpen] = useState(false);
  const [ackEncash, setAckEncash] = useState(false);
  const [voucherFile, setVoucherFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Voucher preview dialog
  const [previewVoucherUrl, setPreviewVoucherUrl] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMonth, setSelectedMonth] = useState<string>('all');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<'all' | 'approved' | 'to_pay' | 'submitted' | 'pending' | 'paid'>('all');

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
          recorded_at,
          record_sheet_link,
          final_content_ppt,
          recording_url
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

      const storedPayments = getStoredPayments();
      const storedVouchers = getStoredVouchers();
      const storedSubmissions = getStoredSubmissions();

      // 4. Build unified session items
      const items: FacilitatorSessionItem[] = (completedSessions || []).map(sess => {
        const earning = earningsBySession[sess.id];
        let status: 'pending' | 'submitted' | 'approved' | 'to_pay' | 'paid' = 'pending';
        const isDelayed = isSessionDelayed(sess);
        const delayReason = getDelayReasonNote(sess);
        const amount = calculateFacilitatorSessionAmount(sess, perSessionRate, earning?.amount);
        let earningId = undefined;

        const storedPayment = storedPayments[earning?.id || sess.id];
        const storedVoucher = storedVouchers[earning?.id || sess.id];
        const storedSubmission = storedSubmissions[sess.id] || (earning?.id ? storedSubmissions[earning.id] : undefined);

        if (earning) {
          earningId = earning.id;
          const rawStatus = (earning.status || '').toLowerCase();
          const notes = (earning.notes || '').toLowerCase();

          if (rawStatus === 'paid_online' || rawStatus === 'paid' || !!storedPayment || !!earning.transaction_id || !!earning.paid_at) {
            status = 'paid';
          } else if (rawStatus === 'to_pay' || rawStatus === 'encash_requested' || !!storedVoucher || !!earning.signed_voucher_url) {
            status = 'to_pay';
          } else if (rawStatus === 'approved') {
            status = 'approved'; // Available to Encash (NOT PAID!)
          } else if (
            rawStatus === 'submitted' || 
            rawStatus === 'pending_approval' || 
            rawStatus === 'under_review' || 
            notes.includes('submitted') ||
            rawStatus === 'pending' || // In facilitator_earnings table, a row with pending status indicates submission awaiting admin review
            !!storedSubmission
          ) {
            status = 'submitted';
          } else {
            status = 'pending';
          }
        } else if (storedSubmission) {
          status = 'submitted';
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
          transaction_id: storedPayment?.transaction_id || earning?.transaction_id,
          paid_at: storedPayment?.paid_at || earning?.paid_at,
          voucher_url: storedVoucher?.voucher_url || earning?.signed_voucher_url,
          record_sheet_link: sess.record_sheet_link,
          final_content_ppt: sess.final_content_ppt,
          recording_url: sess.recording_url,
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

  // Distinct months available for filtering (sorted descending)
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
    return Array.from(monthSet.entries())
      .map(([key, label]) => ({ key, label }))
      .sort((a, b) => b.key.localeCompare(a.key));
  }, [sessions]);

  // Month-filtered sessions (used for metric cards and base for search/status filter)
  const monthFilteredSessions = useMemo(() => {
    if (selectedMonth === 'all') return sessions;
    return sessions.filter(s => {
      if (!s.session_date) return false;
      const d = new Date(s.session_date);
      if (isNaN(d.getTime())) {
        return s.session_date.startsWith(selectedMonth);
      }
      return format(d, 'yyyy-MM') === selectedMonth;
    });
  }, [sessions, selectedMonth]);

  // Filtered sessions for table (month + search + status)
  const filteredSessions = useMemo(() => {
    return monthFilteredSessions.filter(s => {
      // Search
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch = !q ||
        s.session_id_code.toLowerCase().includes(q) ||
        s.class_batch.toLowerCase().includes(q) ||
        s.module_topic.toLowerCase().includes(q);

      // Status
      let matchesStatus = true;
      if (selectedStatusFilter !== 'all') {
        matchesStatus = s.status === selectedStatusFilter;
      }

      return matchesSearch && matchesStatus;
    });
  }, [monthFilteredSessions, searchQuery, selectedStatusFilter]);

  // Determine current selection mode (either pending or approved)
  const selectedSessions = useMemo(() => {
    return sessions.filter(s => selectedSessionIds.includes(s.id));
  }, [sessions, selectedSessionIds]);

  const selectedMode = useMemo<'pending' | 'approved' | null>(() => {
    if (selectedSessions.length === 0) return null;
    return selectedSessions[0].status === 'approved' ? 'approved' : 'pending';
  }, [selectedSessions]);

  // Filter selectable sessions depending on mode
  const selectableFilteredSessions = useMemo(() => {
    if (selectedMode === 'approved') {
      return filteredSessions.filter(s => s.status === 'approved');
    }
    if (selectedMode === 'pending') {
      return filteredSessions.filter(s => s.status === 'pending');
    }
    return filteredSessions.filter(s => s.status === 'pending' || s.status === 'approved');
  }, [filteredSessions, selectedMode]);

  // Metric Cards (Filtered based on selected month)
  const availableToEncash = useMemo(() => {
    return monthFilteredSessions
      .filter(s => s.status === 'approved')
      .reduce((sum, s) => sum + s.amount, 0);
  }, [monthFilteredSessions]);

  const toPayAmount = useMemo(() => {
    return monthFilteredSessions
      .filter(s => s.status === 'to_pay')
      .reduce((sum, s) => sum + s.amount, 0);
  }, [monthFilteredSessions]);

  const pendingApprovalAmount = useMemo(() => {
    return monthFilteredSessions
      .filter(s => s.status === 'pending' || s.status === 'submitted')
      .reduce((sum, s) => sum + s.amount, 0);
  }, [monthFilteredSessions]);

  const paidToDate = useMemo(() => {
    return monthFilteredSessions
      .filter(s => s.status === 'paid')
      .reduce((sum, s) => sum + s.amount, 0);
  }, [monthFilteredSessions]);

  const totalCompletedSessions = monthFilteredSessions.length;

  // Selected Amount
  const selectedTotalAmount = useMemo(() => {
    return selectedSessions.reduce((sum, s) => sum + s.amount, 0);
  }, [selectedSessions]);

  const selectedDelayedCount = useMemo(() => {
    return selectedSessions.filter(s => s.is_delayed).length;
  }, [selectedSessions]);

  // Selection handlers
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      // Prioritize approved if in view or if no pending
      const targetList = selectableFilteredSessions;
      setSelectedSessionIds(Array.from(new Set(targetList.map(s => s.id))));
    } else {
      setSelectedSessionIds([]);
    }
  };

  const handleToggleSession = (sessionItem: FacilitatorSessionItem) => {
    if (selectedSessionIds.includes(sessionItem.id)) {
      setSelectedSessionIds(selectedSessionIds.filter(id => id !== sessionItem.id));
    } else {
      // If switching modes, replace selection
      if (selectedMode && selectedMode !== (sessionItem.status === 'approved' ? 'approved' : 'pending')) {
        toast.info(`Switched selection to ${sessionItem.status === 'approved' ? 'Approved (Encashment)' : 'Pending (Approval)'} sessions`);
        setSelectedSessionIds([sessionItem.id]);
      } else {
        setSelectedSessionIds([...selectedSessionIds, sessionItem.id]);
      }
    }
  };

  const isAllSelectableChecked = selectableFilteredSessions.length > 0 &&
    selectableFilteredSessions.every(s => selectedSessionIds.includes(s.id));

  // Action 1: Submit Sessions for Approval (Step 1 by FAL)
  const handleSubmitForApproval = async () => {
    if (!currentFacilitator?.id || selectedSessionIds.length === 0) return;
    if (!ackApproval) {
      toast.error('Please confirm the acknowledgment declaration first.');
      return;
    }

    try {
      setIsSubmitting(true);

      for (const sessionId of selectedSessionIds) {
        const sessItem = sessions.find(s => s.id === sessionId);
        const amount = sessItem?.amount ?? (sessItem?.is_delayed ? Math.round(perSessionRate / 2) : perSessionRate);

        // 1. Save submission locally so it survives refreshes across roles immediately
        saveStoredSubmission({
          session_id: sessionId,
          facilitator_id: currentFacilitator.id,
          amount,
          submitted_at: new Date().toISOString()
        });

        // 2. Persist to facilitator_earnings table in database
        try {
          if (sessItem?.earning_id) {
            const { error: updateErr } = await supabase
              .from('facilitator_earnings')
              .update({
                status: 'submitted',
                amount,
                notes: 'submitted_for_approval'
              })
              .eq('id', sessItem.earning_id);

            if (updateErr) {
              // Fallback for databases with check constraint (pending, approved)
              await supabase
                .from('facilitator_earnings')
                .update({
                  status: 'pending',
                  amount,
                  notes: 'submitted_for_approval'
                })
                .eq('id', sessItem.earning_id);
            }
          } else {
            const { error: insertErr } = await supabase
              .from('facilitator_earnings')
              .insert({
                facilitator_id: currentFacilitator.id,
                session_id: sessionId,
                amount,
                status: 'submitted',
                notes: 'submitted_for_approval',
                created_at: new Date().toISOString()
              });

            if (insertErr) {
              // Fallback for databases with check constraint (pending, approved)
              await supabase
                .from('facilitator_earnings')
                .insert({
                  facilitator_id: currentFacilitator.id,
                  session_id: sessionId,
                  amount,
                  status: 'pending',
                  notes: 'submitted_for_approval',
                  created_at: new Date().toISOString()
                });
            }
          }
        } catch (dbErr) {
          console.warn('Database write handled gracefully with local sync:', dbErr);
        }

        // 3. Update session's supervisor review status
        try {
          await supabase
            .from('sessions')
            .update({ supervisor_feedback_status: 'submitted_for_approval' })
            .eq('id', sessionId);
        } catch (sessUpdateErr) {
          console.warn('Could not update session supervisor status:', sessUpdateErr);
        }
      }

      toast.success(`Submitted ${selectedSessionIds.length} session(s) totaling ₹${selectedTotalAmount.toLocaleString('en-IN')} for supervisor/admin approval!`);
      setIsApprovalDialogOpen(false);
      setAckApproval(false);
      setSelectedSessionIds([]);
      await loadFacilitatorSessions(currentFacilitator.id, currentFacilitator.name);
    } catch (err: any) {
      console.error('Error submitting for approval:', err);
      toast.error('Failed to submit sessions for approval: ' + (err?.message || ''));
    } finally {
      setIsSubmitting(false);
    }
  };

  // Action 2: Submit Encashment Request with Signed Voucher (Step 2 by FAL)
  const handleSubmitEncashment = async () => {
    if (!currentFacilitator?.id || selectedSessionIds.length === 0) return;
    if (!ackEncash) {
      toast.error('Please confirm the agreement declaration.');
      return;
    }
    if (!voucherFile) {
      toast.error('Please upload your signed voucher image or document.');
      return;
    }

    try {
      setIsSubmitting(true);
      let voucherUrl = '';

      // Upload voucher file
      try {
        const folderPath = ["FELLOW", "Vouchers", currentFacilitator.name.replace(/[^a-zA-Z0-9_-]/g, '_')];
        const { data: { session: authSession } } = await supabase.auth.getSession();

        const uploader = new GoogleDriveResumableUploader({
          file: voucherFile,
          folderPath,
          supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
          accessToken: authSession?.access_token || '',
        });

        const uploadResult = await uploader.upload();
        voucherUrl = uploadResult.webViewLink;
      } catch (uploadErr) {
        console.warn('Gdrive upload fallback to base64 Data URL:', uploadErr);
        voucherUrl = await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve(e.target?.result as string || '');
          reader.readAsDataURL(voucherFile);
        });
      }

      for (const sessionId of selectedSessionIds) {
        const sessItem = sessions.find(s => s.id === sessionId);
        const amount = sessItem?.amount ?? perSessionRate;
        let earningId = sessItem?.earning_id;

        if (earningId) {
          await supabase
            .from('facilitator_earnings')
            .update({ status: 'to_pay' })
            .eq('id', earningId);
        } else {
          const { data: newRow } = await supabase
            .from('facilitator_earnings')
            .insert({
              facilitator_id: currentFacilitator.id,
              session_id: sessionId,
              amount,
              status: 'to_pay',
              created_at: new Date().toISOString()
            })
            .select('id')
            .maybeSingle();

          if (newRow?.id) earningId = newRow.id;
        }

        saveStoredVoucher({
          earning_id: earningId || sessionId,
          session_id: sessionId,
          voucher_url: voucherUrl,
          uploaded_at: new Date().toISOString(),
          file_name: voucherFile.name,
          amount
        });
      }

      toast.success(`Encashment request for ₹${selectedTotalAmount.toLocaleString('en-IN')} submitted! Status is now To Pay.`);
      setIsEncashDialogOpen(false);
      setAckEncash(false);
      setVoucherFile(null);
      setSelectedSessionIds([]);
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
              My Session Reward
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Submit sessions for admin approval, and encash approved sessions with your signed voucher.
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

          <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
            {/* Header Month Filter */}
            <div className="w-full sm:w-44">
              <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                <SelectTrigger className="h-10 text-xs bg-white border-slate-200 font-medium shadow-xs">
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
            </div>

            {/* Dynamic Action Button based on Selection */}
            {selectedMode === 'approved' ? (
              <Button
                onClick={() => {
                  setAckEncash(false);
                  setVoucherFile(null);
                  setIsEncashDialogOpen(true);
                }}
                disabled={selectedSessionIds.length === 0}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold shadow-sm px-5 py-2.5 h-10 rounded-lg flex items-center gap-2 transition-all"
              >
                <Wallet className="h-4 w-4" />
                Submit Encashment Request ({selectedSessionIds.length})
                <span className="ml-1 bg-white/20 text-white text-xs px-2 py-0.5 rounded-full font-bold">
                  ₹{selectedTotalAmount.toLocaleString('en-IN')}
                </span>
              </Button>
            ) : selectedMode === 'pending' ? (
              <Button
                onClick={() => {
                  setAckApproval(false);
                  setIsApprovalDialogOpen(true);
                }}
                disabled={selectedSessionIds.length === 0}
                className="bg-blue-600 hover:bg-blue-700 text-white font-semibold shadow-sm px-5 py-2.5 h-10 rounded-lg flex items-center gap-2 transition-all"
              >
                <Clock className="h-4 w-4" />
                Submit for Approval ({selectedSessionIds.length})
                <span className="ml-1 bg-white/20 text-white text-xs px-2 py-0.5 rounded-full font-bold">
                  ₹{selectedTotalAmount.toLocaleString('en-IN')}
                </span>
              </Button>
            ) : (
              <Button
                disabled
                variant="outline"
                className="h-10 text-xs px-4 border-slate-200 text-slate-400 gap-1.5 cursor-not-allowed"
                title="Select pending or approved sessions below"
              >
                Select Sessions to Proceed
              </Button>
            )}
          </div>
        </div>

        {/* 4 Summary Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          
          {/* Card 1: Approved - Available to Encash */}
          <Card className="border border-slate-200 bg-white shadow-sm overflow-hidden relative border-l-4 border-l-green-500">
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-green-700 uppercase tracking-wider">Approved - Available to Encash</p>
                {selectedMonth !== 'all' && (
                  <span className="text-[10px] font-semibold text-green-700 bg-green-50 px-1.5 py-0.5 rounded border border-green-200/50">
                    {availableMonths.find(m => m.key === selectedMonth)?.label || selectedMonth}
                  </span>
                )}
              </div>
              <h3 className="text-2xl sm:text-3xl font-extrabold text-green-600 tracking-tight">
                ₹{availableToEncash.toLocaleString('en-IN')}
              </h3>
              <p className="text-[11px] text-slate-500 mt-1">
                Approved by Admin • Ready for encashment
              </p>
            </CardContent>
          </Card>

          {/* Card 2: To Pay (Encashment Submitted) */}
          <Card className="border border-slate-200 bg-white shadow-sm overflow-hidden relative border-l-4 border-l-blue-500">
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-blue-700 uppercase tracking-wider">To Pay (Encashment Submitted)</p>
                {selectedMonth !== 'all' && (
                  <span className="text-[10px] font-semibold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200/50">
                    {availableMonths.find(m => m.key === selectedMonth)?.label || selectedMonth}
                  </span>
                )}
              </div>
              <h3 className="text-2xl sm:text-3xl font-extrabold text-blue-600 tracking-tight">
                ₹{toPayAmount.toLocaleString('en-IN')}
              </h3>
              <p className="text-[11px] text-slate-500 mt-1">
                Voucher submitted • Awaiting admin payout
              </p>
            </CardContent>
          </Card>

          {/* Card 3: Pending Approval */}
          <Card className="border border-slate-200 bg-white shadow-sm overflow-hidden relative border-l-4 border-l-amber-500">
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-amber-700 uppercase tracking-wider">Pending Approval</p>
                {selectedMonth !== 'all' && (
                  <span className="text-[10px] font-semibold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200/50">
                    {availableMonths.find(m => m.key === selectedMonth)?.label || selectedMonth}
                  </span>
                )}
              </div>
              <h3 className="text-2xl sm:text-3xl font-extrabold text-amber-600 tracking-tight">
                ₹{pendingApprovalAmount.toLocaleString('en-IN')}
              </h3>
              <p className="text-[11px] text-slate-500 mt-1">
                Awaiting submission or admin review
              </p>
            </CardContent>
          </Card>

          {/* Card 4: Paid Online */}
          <Card className="border border-slate-200 bg-white shadow-sm overflow-hidden relative border-l-4 border-l-purple-500">
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-purple-700 uppercase tracking-wider">Paid Online</p>
                {selectedMonth !== 'all' && (
                  <span className="text-[10px] font-semibold text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded border border-purple-200/50">
                    {availableMonths.find(m => m.key === selectedMonth)?.label || selectedMonth}
                  </span>
                )}
              </div>
              <h3 className="text-2xl sm:text-3xl font-extrabold text-purple-600 tracking-tight">
                ₹{paidToDate.toLocaleString('en-IN')}
              </h3>
              <p className="text-[11px] text-slate-500 mt-1">
                Total payouts received ({totalCompletedSessions} total sessions)
              </p>
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
              <p className="text-xs text-slate-500 mt-0.5">
                Lifecycle: <strong>Pending</strong> (Submit for Approval) ➔ <strong>Under Review</strong> ➔ <strong>Approved (Available to Encash)</strong> ➔ <strong>To Pay</strong> (Upload Voucher) ➔ <strong>Paid</strong>
              </p>
            </div>
            {selectedSessionIds.length > 0 && (
              <Badge className="bg-slate-900 text-white font-medium text-xs px-2.5 py-1">
                {selectedSessionIds.length} session(s) selected ({selectedMode === 'approved' ? 'Encashment' : 'Approval'}) • Total: ₹{selectedTotalAmount.toLocaleString('en-IN')}
              </Badge>
            )}
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
                <SelectTrigger className="h-9 w-full sm:w-48 text-xs bg-white border-slate-200 font-medium">
                  <SelectValue placeholder="All Statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="text-xs">All Statuses</SelectItem>
                  <SelectItem value="approved" className="text-xs">Approved - Available to Encash</SelectItem>
                  <SelectItem value="to_pay" className="text-xs">To Pay (Encashment Submitted)</SelectItem>
                  <SelectItem value="submitted" className="text-xs">Pending Approval (Under Review)</SelectItem>
                  <SelectItem value="pending" className="text-xs">Pending (Ready to Submit)</SelectItem>
                  <SelectItem value="paid" className="text-xs">Paid Online</SelectItem>
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
                        checked={isAllSelectableChecked}
                        disabled={selectableFilteredSessions.length === 0}
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
                    <TableHead className="font-bold text-slate-600 uppercase text-[11px] min-w-[130px]">
                      IMPACT PPT LINK
                    </TableHead>
                    <TableHead className="font-bold text-slate-600 uppercase text-[11px] min-w-[130px]">
                      VIDEO RECORDING
                    </TableHead>
                    <TableHead className="font-bold text-slate-600 uppercase text-[11px] min-w-[90px]">
                      AMOUNT
                    </TableHead>
                    <TableHead className="font-bold text-slate-600 uppercase text-[11px] min-w-[140px]">
                      STATUS
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredSessions.map((session) => {
                    const isSelectable = session.status === 'pending' || session.status === 'approved';
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
                          {isSelectable ? (
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={() => handleToggleSession(session)}
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

                        {/* IMPACT PPT LINK */}
                        <TableCell>
                          {session.record_sheet_link || session.final_content_ppt ? (
                            <a
                              href={session.record_sheet_link || session.final_content_ppt}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-800 hover:underline bg-blue-50/80 hover:bg-blue-100 px-2 py-1 rounded-md border border-blue-200 transition-colors whitespace-nowrap"
                              title="Open Session PPT Slide Link"
                            >
                              <FileText className="h-3.5 w-3.5 text-blue-600 shrink-0" />
                              <span>PPT Slide</span>
                            </a>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </TableCell>

                        {/* VIDEO RECORDING */}
                        <TableCell>
                          {session.recording_url ? (
                            <a
                              href={session.recording_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 text-xs font-semibold text-purple-600 hover:text-purple-800 hover:underline bg-purple-50/80 hover:bg-purple-100 px-2 py-1 rounded-md border border-purple-200 transition-colors whitespace-nowrap"
                              title="Watch Session Video Recording"
                            >
                              <Video className="h-3.5 w-3.5 text-purple-600 shrink-0" />
                              <span>Watch Video</span>
                            </a>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
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
                          {session.status === 'approved' && (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-green-50 text-green-700 border border-green-200 gap-1">
                              <CheckCircle2 className="h-3 w-3 text-green-600" />
                              Approved - Available to Encash
                            </span>
                          )}
                          {session.status === 'to_pay' && (
                            <div className="flex flex-col gap-1 items-start">
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 gap-1">
                                <Wallet className="h-3 w-3 text-emerald-600" />
                                To Pay (Encashment Submitted)
                              </span>
                              {session.voucher_url && (
                                <button
                                  type="button"
                                  onClick={() => setPreviewVoucherUrl(session.voucher_url || null)}
                                  className="text-[10px] text-blue-600 hover:underline inline-flex items-center gap-1"
                                >
                                  <Eye className="h-2.5 w-2.5" /> View Voucher
                                </button>
                              )}
                            </div>
                          )}
                          {session.status === 'submitted' && (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200 gap-1">
                              <Clock className="h-3 w-3 text-amber-600" />
                              Pending Approval (Under Review)
                            </span>
                          )}
                          {session.status === 'pending' && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-50 text-slate-600 border border-slate-200">
                              Pending (Ready to Submit)
                            </span>
                          )}
                          {session.status === 'paid' && (
                            <div className="flex flex-col gap-0.5 items-start">
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-purple-50 text-purple-700 border border-purple-200">
                                Paid Online
                              </span>
                              {session.transaction_id && (
                                <span className="text-[10px] text-purple-600 font-mono">
                                  UTR: {session.transaction_id}
                                </span>
                              )}
                            </div>
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

        {/* DIALOG 1: Submit Sessions for Approval (Step 1 by FAL) */}
        <Dialog open={isApprovalDialogOpen} onOpenChange={setIsApprovalDialogOpen}>
          <DialogContent className="sm:max-w-[460px]">
            <DialogHeader>
              <DialogTitle className="text-slate-900 font-bold flex items-center gap-2">
                <Clock className="h-5 w-5 text-blue-600" />
                Submit Sessions for Approval
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500">
                Review your session details and acknowledge before submitting for supervisor/admin approval.
              </DialogDescription>
            </DialogHeader>

            <div className="py-4 space-y-4">
              {/* Session stats box */}
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
                    <span>Delayed Sessions (-50%):</span>
                    <span className="font-bold">{selectedDelayedCount} (₹{Math.round(perSessionRate / 2)} each)</span>
                  </div>
                )}
                <div className="flex justify-between items-center border-t border-slate-200 pt-2 text-sm">
                  <span className="font-semibold text-slate-700">Total Approval Amount:</span>
                  <span className="font-extrabold text-blue-600 text-base">
                    ₹{selectedTotalAmount.toLocaleString('en-IN')}
                  </span>
                </div>
              </div>

              {selectedDelayedCount > 0 && (
                <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-[11px] flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                  <div>
                    <strong>{selectedDelayedCount} session(s)</strong> have 50% deduction applied for delayed recording after scheduled date.
                  </div>
                </div>
              )}

              {/* Mandatory Acknowledgment */}
              <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-lg space-y-2">
                <div className="flex items-start gap-2.5">
                  <Checkbox
                    id="ack-approval"
                    checked={ackApproval}
                    onCheckedChange={(checked) => setAckApproval(!!checked)}
                    className="mt-0.5"
                  />
                  <label htmlFor="ack-approval" className="text-xs text-blue-950 font-medium leading-relaxed cursor-pointer select-none">
                    I confirm and acknowledge that I have completed all PPT slides, recording links, and all information is correct. I have reviewed everything carefully and twice.
                  </label>
                </div>
              </div>
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                variant="outline"
                onClick={() => setIsApprovalDialogOpen(false)}
                disabled={isSubmitting}
                className="text-xs"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSubmitForApproval}
                disabled={isSubmitting || !ackApproval}
                className="bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs gap-1.5"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  'Confirm & Submit for Approval'
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* DIALOG 2: Submit Encashment Request with Signed Voucher (Step 2 by FAL) */}
        <Dialog open={isEncashDialogOpen} onOpenChange={setIsEncashDialogOpen}>
          <DialogContent className="sm:max-w-[480px]">
            <DialogHeader>
              <DialogTitle className="text-slate-900 font-bold flex items-center gap-2">
                <Wallet className="h-5 w-5 text-emerald-600" />
                Submit Encashment Request
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500">
                Review approved sessions, agree to declaration, and upload your signed voucher to request payout.
              </DialogDescription>
            </DialogHeader>

            <div className="py-4 space-y-4">
              {/* Session stats box */}
              <div className="bg-slate-50 rounded-lg p-3.5 border border-slate-200 text-xs space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 font-medium">Facilitator:</span>
                  <span className="font-bold text-slate-800">{currentFacilitator?.name}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 font-medium">Approved Sessions Selected:</span>
                  <span className="font-bold text-slate-800">{selectedSessionIds.length}</span>
                </div>
                <div className="flex justify-between items-center border-t border-slate-200 pt-2 text-sm">
                  <span className="font-semibold text-slate-700">Total Encashment Payout:</span>
                  <span className="font-extrabold text-emerald-600 text-base">
                    ₹{selectedTotalAmount.toLocaleString('en-IN')}
                  </span>
                </div>
              </div>

              {/* Mandatory Acknowledgment */}
              <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-lg space-y-2">
                <div className="flex items-start gap-2.5">
                  <Checkbox
                    id="ack-encash"
                    checked={ackEncash}
                    onCheckedChange={(checked) => setAckEncash(!!checked)}
                    className="mt-0.5"
                  />
                  <label htmlFor="ack-encash" className="text-xs text-emerald-950 font-medium leading-relaxed cursor-pointer select-none">
                    I agree and declare that the encashment amount and session data are fully correct and reviewed, and there is no discrepancy.
                  </label>
                </div>
              </div>

              {/* Signed Voucher Upload */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 flex items-center justify-between">
                  <span>Upload Signed Voucher <span className="text-destructive">*</span></span>
                  <span className="text-[11px] text-muted-foreground font-normal">Image (PNG, JPG) or PDF</span>
                </label>
                
                <div className="border-2 border-dashed border-slate-300 hover:border-emerald-500 rounded-lg p-3.5 text-center transition-colors bg-slate-50/50">
                  <input
                    type="file"
                    id="voucher-upload-input"
                    accept="image/*,application/pdf"
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        setVoucherFile(e.target.files[0]);
                      }
                    }}
                  />
                  {voucherFile ? (
                    <div className="flex items-center justify-between gap-2 p-2 bg-white rounded border border-emerald-200">
                      <div className="flex items-center gap-2 overflow-hidden text-left">
                        <FileCheck className="h-5 w-5 text-emerald-600 shrink-0" />
                        <div className="truncate">
                          <p className="text-xs font-semibold text-slate-800 truncate">{voucherFile.name}</p>
                          <p className="text-[10px] text-slate-500">{(voucherFile.size / 1024).toFixed(1)} KB</p>
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs text-destructive hover:bg-destructive/10"
                        onClick={() => setVoucherFile(null)}
                      >
                        Change
                      </Button>
                    </div>
                  ) : (
                    <label
                      htmlFor="voucher-upload-input"
                      className="cursor-pointer flex flex-col items-center justify-center gap-1.5 py-1"
                    >
                      <UploadCloud className="h-7 w-7 text-slate-400" />
                      <span className="text-xs font-medium text-emerald-700 hover:underline">
                        Click to browse signed voucher file
                      </span>
                      <span className="text-[10px] text-slate-400">Attach photo/scan of physical voucher signed by you</span>
                    </label>
                  )}
                </div>
              </div>

              <p className="text-[11px] text-slate-400">
                Once submitted, status will change to <strong>To Pay</strong> and Admin will disburse the online payout with transaction details.
              </p>
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                variant="outline"
                onClick={() => setIsEncashDialogOpen(false)}
                disabled={isSubmitting}
                className="text-xs"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSubmitEncashment}
                disabled={isSubmitting || !ackEncash || !voucherFile}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs gap-1.5"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Uploading & Submitting...
                  </>
                ) : (
                  'Confirm & Submit Encashment'
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* DIALOG 3: View Signed Voucher Preview */}
        <Dialog open={!!previewVoucherUrl} onOpenChange={(open) => !open && setPreviewVoucherUrl(null)}>
          <DialogContent className="sm:max-w-[540px]">
            <DialogHeader>
              <DialogTitle className="flex items-center justify-between text-slate-900 font-bold">
                <span className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-emerald-600" />
                  Signed Encashment Voucher
                </span>
                {previewVoucherUrl && (
                  <a
                    href={previewVoucherUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary hover:underline inline-flex items-center gap-1 font-normal mr-4"
                  >
                    <ExternalLink className="h-3.5 w-3.5" /> Open Full
                  </a>
                )}
              </DialogTitle>
            </DialogHeader>

            <div className="py-2 flex justify-center items-center bg-slate-100 rounded-lg overflow-hidden min-h-[300px] max-h-[60vh] p-2 border border-slate-200">
              {previewVoucherUrl ? (
                previewVoucherUrl.endsWith('.pdf') || previewVoucherUrl.includes('application/pdf') ? (
                  <iframe
                    src={previewVoucherUrl}
                    title="Signed Voucher PDF"
                    className="w-full h-[50vh] rounded"
                  />
                ) : (
                  <img
                    src={previewVoucherUrl}
                    alt="Signed Voucher"
                    className="max-h-[55vh] w-auto max-w-full object-contain rounded shadow-sm"
                  />
                )
              ) : null}
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPreviewVoucherUrl(null)}
                className="text-xs"
              >
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

      </div>
    </DashboardLayout>
  );
}
