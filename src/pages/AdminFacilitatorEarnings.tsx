import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  Wallet, 
  Search, 
  TrendingUp, 
  Settings, 
  CheckCircle, 
  ArrowLeft, 
  CreditCard, 
  MoreVertical, 
  RotateCcw, 
  Edit3, 
  Clock,
  X
} from 'lucide-react';
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { useAcademicYear } from '@/contexts/AcademicYearContext';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface FacilitatorEarning {
  id: string;
  name: string;
  total_approved: number;
  total_paid_online: number;
  total_pending: number;
  last_earned_at: string | null;
}

interface SessionData {
  id: string;
  title?: string;
  session_date: string;
  session_id_code?: string;
  class_batch?: string;
  content_category?: string;
  module_name?: string;
  topics_covered?: string;
  session_type?: string;
  volunteer_name?: string;
  coordinator_name?: string;
  facilitator_name?: string;
}

interface EarningRecord {
  id: string;
  facilitator_id: string;
  session_id: string;
  amount: number;
  status: string; // 'pending' | 'approved' | 'paid_online'
  created_at: string;
  approved_at: string | null;
  transaction_id?: string | null;
  paid_at?: string | null;
  is_unrecorded?: boolean;
  sessions?: SessionData;
}

interface OnlinePaymentInfo {
  earning_id: string;
  transaction_id: string;
  paid_amount: number;
  paid_at: string;
  notes?: string;
}

const PAYMENTS_STORAGE_KEY = 'facilitator_online_payments_v2';

const getStoredPayments = (): Record<string, OnlinePaymentInfo> => {
  try {
    const data = localStorage.getItem(PAYMENTS_STORAGE_KEY);
    return data ? JSON.parse(data) : {};
  } catch (e) {
    return {};
  }
};

const saveStoredPayment = (info: OnlinePaymentInfo) => {
  try {
    const current = getStoredPayments();
    current[info.earning_id] = info;
    localStorage.setItem(PAYMENTS_STORAGE_KEY, JSON.stringify(current));
  } catch (e) {
    console.error('Error saving stored payment:', e);
  }
};

// Truncated text component matching FeedbackSelection UI
const TruncatedText = ({ text, maxLength = 18 }: { text: string | null | undefined; maxLength?: number }) => {
  if (!text || text === '-' || text.trim() === '') return <span className="text-muted-foreground">-</span>;
  if (text.length <= maxLength) return <span>{text}</span>;
  return (
    <div className="group relative inline-block max-w-[180px]">
      <span className="truncate block font-medium" title={text}>{text.slice(0, maxLength)}...</span>
      <span className="text-[10px] text-primary cursor-pointer block hover:underline" title={text}>see more</span>
    </div>
  );
};

export default function AdminFacilitatorEarnings() {
  const { facilitatorId } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [earningsData, setEarningsData] = useState<FacilitatorEarning[]>([]);
  const [selectedFacilitator, setSelectedFacilitator] = useState<FacilitatorEarning | null>(null);
  
  // Detail page state
  const [allDetailRecords, setAllDetailRecords] = useState<EarningRecord[]>([]);
  const [loadingRecords, setLoadingRecords] = useState(false);

  // Filters
  const [detailSearchQuery, setDetailSearchQuery] = useState('');
  const [detailStatusFilter, setDetailStatusFilter] = useState('all');
  const [detailTypeFilter, setDetailTypeFilter] = useState('all');
  const [detailMonthFilter, setDetailMonthFilter] = useState<string>(() => new Date().getMonth().toString());
  
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [perSessionAmount, setPerSessionAmount] = useState<number>(200);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  
  const { selectedYear, getDateRange } = useAcademicYear();
  const [selectedMonth, setSelectedMonth] = useState<string>(() => new Date().getMonth().toString());
  
  // Editing state
  const [editingEarningId, setEditingEarningId] = useState<string | null>(null);
  const [editEarningAmount, setEditEarningAmount] = useState<string>('');

  // Pay Online Dialog State
  const [payOnlineDialogOpen, setPayOnlineDialogOpen] = useState(false);
  const [payOnlineTarget, setPayOnlineTarget] = useState<{
    earningId?: string;
    facilitatorId?: string;
    facilitatorName?: string;
    sessionTitle?: string;
    defaultAmount?: number;
    isUnrecorded?: boolean;
    sessionId?: string;
  } | null>(null);
  const [transactionIdInput, setTransactionIdInput] = useState('');
  const [payAmountInput, setPayAmountInput] = useState<number>(200);
  const [payDateInput, setPayDateInput] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [payNotesInput, setPayNotesInput] = useState('');
  const [isSavingPayment, setIsSavingPayment] = useState(false);

  // Undo Payment Dialog State
  const [undoDialogOpen, setUndoDialogOpen] = useState(false);
  const [undoTargetRecord, setUndoTargetRecord] = useState<EarningRecord | null>(null);
  const [undoConfirmInput, setUndoConfirmInput] = useState('');
  const [isUndoingPayment, setIsUndoingPayment] = useState(false);

  useEffect(() => {
    fetchEarnings();
    fetchSettings();
  }, [selectedYear, selectedMonth]);

  useEffect(() => {
    setDetailMonthFilter(selectedMonth);
  }, [selectedMonth]);

  // Handle route param change
  useEffect(() => {
    if (facilitatorId && earningsData.length > 0) {
      const fac = earningsData.find(f => f.id === facilitatorId);
      if (fac) {
        setSelectedFacilitator(fac);
        fetchFacilitatorRecords(fac.id, fac.name);
      }
    } else if (!facilitatorId) {
      setSelectedFacilitator(null);
      setAllDetailRecords([]);
    }
  }, [facilitatorId, earningsData]);

  const fetchSettings = async () => {
    try {
      const { data, error } = await supabase
        .from('facilitator_settings')
        .select('*')
        .limit(1)
        .single();
      
      if (error && error.code !== 'PGRST116') throw error;
      if (data) setPerSessionAmount(data.per_session_amount);
    } catch (err) {
      console.error('Error fetching settings:', err);
    }
  };

  const saveSettings = async () => {
    try {
      setIsSavingSettings(true);
      const { data: existingData } = await supabase
        .from('facilitator_settings')
        .select('id')
        .limit(1)
        .single();
        
      let error;
      if (existingData) {
        ({ error } = await supabase
          .from('facilitator_settings')
          .update({ per_session_amount: perSessionAmount })
          .eq('id', existingData.id));
      } else {
        ({ error } = await supabase
          .from('facilitator_settings')
          .insert({ per_session_amount: perSessionAmount }));
      }
      
      if (error) throw error;
      toast.success('Settings saved successfully');
      setIsSettingsOpen(false);
    } catch (err) {
      console.error('Error saving settings:', err);
      toast.error('Failed to save settings');
    } finally {
      setIsSavingSettings(false);
    }
  };

  const fetchEarnings = async () => {
    try {
      setLoading(true);
      
      const { data: facilitators, error: facError } = await supabase
        .from('facilitators')
        .select(`
          id,
          name,
          facilitator_earnings (
            id,
            amount,
            status,
            created_at,
            session_id,
            sessions (
              session_date
            )
          )
        `);

      if (facError) throw facError;

      const { startDate, endDate } = getDateRange();
      const storedPayments = getStoredPayments();

      const aggregated = (facilitators || []).map((f: any) => {
        const earnings = (f.facilitator_earnings || []).filter((e: any) => {
          const sessionDateStr = e.sessions?.session_date;
          const earnedAt = sessionDateStr ? new Date(sessionDateStr) : new Date(e.created_at);
          const matchesAcademicYear = earnedAt >= startDate && earnedAt <= endDate;
          const matchesMonth = selectedMonth === 'all' || (earnedAt.getMonth().toString() === selectedMonth);
          return matchesAcademicYear && matchesMonth;
        });

        let totalApproved = 0;
        let totalPaidOnline = 0;
        let totalPending = 0;

        earnings.forEach((e: any) => {
          const amt = parseFloat(e.amount) || 0;
          const paymentInfo = storedPayments[e.id];
          const isPaid = e.status === 'paid_online' || !!paymentInfo;

          if (isPaid) {
            totalPaidOnline += paymentInfo?.paid_amount || amt;
          } else if (e.status === 'approved') {
            totalApproved += amt;
          } else {
            totalPending += amt;
          }
        });
        
        const lastRecord = earnings.length > 0 
          ? [...earnings].sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]
          : null;

        return {
          id: f.id,
          name: f.name,
          total_approved: totalApproved,
          total_paid_online: totalPaidOnline,
          total_pending: totalPending,
          last_earned_at: lastRecord?.created_at || null
        };
      });

      setEarningsData(aggregated);

      if (facilitatorId) {
        const found = aggregated.find(a => a.id === facilitatorId);
        if (found) {
          setSelectedFacilitator(found);
          fetchFacilitatorRecords(found.id, found.name);
        }
      }
    } catch (error) {
      console.error('Error fetching earnings:', error);
      toast.error('Failed to load earnings data');
    } finally {
      setLoading(false);
    }
  };

  const fetchFacilitatorRecords = async (facId: string, facName: string) => {
    try {
      setLoadingRecords(true);
      const { data, error } = await supabase
        .from('facilitator_earnings')
        .select(`
          *,
          sessions (
            id,
            title,
            session_date,
            session_id_code,
            class_batch,
            content_category,
            module_name,
            topics_covered,
            session_type,
            volunteer_name,
            coordinator_id,
            facilitator_name,
            coordinators:coordinator_id(name)
          )
        `)
        .eq('facilitator_id', facId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      const { startDate, endDate } = getDateRange();
      const storedPayments = getStoredPayments();
      
      // Filter existing recorded earnings by academic year
      const recorded: EarningRecord[] = (data || [])
        .filter(r => {
          const earnedAt = r.sessions?.session_date ? new Date(r.sessions.session_date) : new Date(r.created_at);
          return earnedAt >= startDate && earnedAt <= endDate;
        })
        .map(r => {
          const paymentInfo = storedPayments[r.id];
          const sData = r.sessions ? {
            ...r.sessions,
            coordinator_name: (r.sessions as any).coordinators?.name || '-'
          } : undefined;

          if (paymentInfo) {
            return {
              ...r,
              sessions: sData,
              status: r.status === 'pending' ? 'pending' : 'paid_online',
              transaction_id: paymentInfo.transaction_id,
              paid_at: paymentInfo.paid_at,
            };
          }
          return {
            ...r,
            sessions: sData
          };
        });

      // Also fetch completed sessions that haven't been added to earnings yet
      const { data: completedSessions, error: sessionError } = await supabase
        .from('sessions')
        .select(`
          id,
          title,
          session_date,
          session_id_code,
          class_batch,
          content_category,
          module_name,
          topics_covered,
          session_type,
          volunteer_name,
          coordinator_id,
          facilitator_name,
          status,
          coordinators:coordinator_id(name)
        `)
        .ilike('status', 'completed')
        .ilike('facilitator_name', `%${facName}%`)
        .gte('session_date', startDate.toISOString())
        .lte('session_date', endDate.toISOString());
        
      if (sessionError) throw sessionError;
      
      // Filter out sessions that already have an earning record
      const existingSessionIds = (data || []).map((r: any) => r.session_id);
      const unrecordedSessions: EarningRecord[] = (completedSessions || [])
        .filter(s => !existingSessionIds.includes(s.id))
        .map((s: any) => ({
          id: `unrecorded_${s.id}`,
          facilitator_id: facId,
          session_id: s.id,
          amount: perSessionAmount,
          status: 'pending',
          created_at: s.session_date,
          approved_at: null,
          is_unrecorded: true,
          sessions: {
            ...s,
            coordinator_name: s.coordinators?.name || '-'
          }
        }));

      // Combine both into one unified list for the detail table
      const combined = [...recorded, ...unrecordedSessions].sort((a, b) => {
        const dateA = a.sessions?.session_date ? new Date(a.sessions.session_date).getTime() : new Date(a.created_at).getTime();
        const dateB = b.sessions?.session_date ? new Date(b.sessions.session_date).getTime() : new Date(b.created_at).getTime();
        return dateB - dateA;
      });

      setAllDetailRecords(combined);
    } catch (error) {
      console.error('Error fetching records:', error);
      toast.error('Failed to load records');
    } finally {
      setLoadingRecords(false);
    }
  };

  const approveEarning = async (record: EarningRecord) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();

      if (record.is_unrecorded) {
        // Create new earning record in DB
        const { error } = await supabase
          .from('facilitator_earnings')
          .insert({
            facilitator_id: selectedFacilitator!.id,
            session_id: record.session_id,
            amount: record.amount || perSessionAmount,
            status: 'approved',
            approved_at: new Date().toISOString(),
            approved_by: user?.id
          });
        if (error) throw error;
      } else {
        // Update existing record
        const { error } = await supabase
          .from('facilitator_earnings')
          .update({
            status: 'approved',
            approved_at: new Date().toISOString(),
            approved_by: user?.id
          })
          .eq('id', record.id);
        if (error) throw error;
      }

      toast.success('Earning approved successfully');
      
      if (selectedFacilitator) {
        fetchFacilitatorRecords(selectedFacilitator.id, selectedFacilitator.name);
      }
      fetchEarnings();
    } catch (error) {
      console.error('Error approving earning:', error);
      toast.error('Failed to approve earning');
    }
  };

  const resetToPendingEarning = async (record: EarningRecord) => {
    try {
      if (record.is_unrecorded) return;

      const { error } = await supabase
        .from('facilitator_earnings')
        .update({
          status: 'pending',
          approved_at: null,
          approved_by: null
        })
        .eq('id', record.id);

      if (error) throw error;
      toast.success('Earning status reset to pending');
      
      if (selectedFacilitator) {
        fetchFacilitatorRecords(selectedFacilitator.id, selectedFacilitator.name);
      }
      fetchEarnings();
    } catch (error) {
      console.error('Error resetting earning:', error);
      toast.error('Failed to reset earning');
    }
  };
  
  const updateEarningAmount = async (id: string) => {
    try {
      const amount = parseFloat(editEarningAmount);
      if (isNaN(amount) || amount < 0) {
        toast.error('Invalid amount');
        return;
      }
      
      const { error } = await supabase
        .from('facilitator_earnings')
        .update({ amount })
        .eq('id', id);

      if (error) throw error;

      // Also update storedPayments in localStorage if present
      const storedPayments = getStoredPayments();
      if (storedPayments[id]) {
        storedPayments[id].paid_amount = amount;
        localStorage.setItem(PAYMENTS_STORAGE_KEY, JSON.stringify(storedPayments));
      }

      toast.success('Earning updated successfully');
      
      if (selectedFacilitator) {
        fetchFacilitatorRecords(selectedFacilitator.id, selectedFacilitator.name);
      }
      fetchEarnings();
      setEditingEarningId(null);
    } catch (error) {
      console.error('Error updating earning:', error);
      toast.error('Failed to update earning');
    }
  };

  const openUndoPaymentModal = (record: EarningRecord) => {
    setUndoTargetRecord(record);
    setUndoConfirmInput('');
    setUndoDialogOpen(true);
  };

  const handleConfirmUndoPayment = async () => {
    if (!undoTargetRecord) return;
    if (undoConfirmInput.toLowerCase().trim() !== 'undo') {
      toast.error('Please type "undo" to confirm');
      return;
    }

    try {
      setIsUndoingPayment(true);

      // 1. Remove from storedPayments in localStorage if present
      const storedPayments = getStoredPayments();
      if (storedPayments[undoTargetRecord.id]) {
        delete storedPayments[undoTargetRecord.id];
        localStorage.setItem(PAYMENTS_STORAGE_KEY, JSON.stringify(storedPayments));
      }

      // 2. Update DB status back to 'approved' if record exists in DB
      if (!undoTargetRecord.is_unrecorded && !undoTargetRecord.id.startsWith('unrecorded_')) {
        const { error } = await supabase
          .from('facilitator_earnings')
          .update({
            status: 'approved'
          })
          .eq('id', undoTargetRecord.id);

        if (error) throw error;
      }

      toast.success('Payment undone successfully. Status reversed to Approved.');
      setUndoDialogOpen(false);
      setUndoTargetRecord(null);
      setUndoConfirmInput('');

      if (selectedFacilitator) {
        fetchFacilitatorRecords(selectedFacilitator.id, selectedFacilitator.name);
      }
      fetchEarnings();
    } catch (err) {
      console.error('Error undoing payment:', err);
      toast.error('Failed to undo payment');
    } finally {
      setIsUndoingPayment(false);
    }
  };

  // Open Pay Online modal for a specific record or for facilitator
  const openPayOnlineModal = (record?: EarningRecord, targetFac?: FacilitatorEarning) => {
    const fac = targetFac || selectedFacilitator;

    if (record) {
      setPayOnlineTarget({
        earningId: record.id,
        facilitatorId: record.facilitator_id,
        facilitatorName: fac?.name,
        sessionTitle: record.sessions?.title || record.sessions?.topics_covered || 'Session Earning',
        defaultAmount: record.amount || perSessionAmount,
        isUnrecorded: record.is_unrecorded,
        sessionId: record.session_id,
        isBulkPayment: false
      });
      setTransactionIdInput(record.transaction_id || '');
      setPayAmountInput(record.amount || perSessionAmount);
    } else if (fac) {
      const approvedAmount = (selectedFacilitator && detailApprovedSum > 0 ? detailApprovedSum : fac.total_approved) || 0;
      setPayOnlineTarget({
        facilitatorId: fac.id,
        facilitatorName: fac.name,
        sessionTitle: `All Approved Sessions for ${fac.name}`,
        defaultAmount: approvedAmount,
        isBulkPayment: true
      });
      setTransactionIdInput('');
      setPayAmountInput(approvedAmount);
    }
    setPayDateInput(new Date().toISOString().split('T')[0]);
    setPayNotesInput('');
    setPayOnlineDialogOpen(true);
  };

  // Submit Pay Online / Controlling
  const handleSavePayment = async () => {
    if (!transactionIdInput.trim()) {
      toast.error('Please enter a valid Transaction ID');
      return;
    }
    if (payAmountInput === undefined || payAmountInput < 0) {
      toast.error('Please enter a valid payment amount');
      return;
    }

    try {
      setIsSavingPayment(true);
      const { data: { user } } = await supabase.auth.getUser();

      if (payOnlineTarget?.isBulkPayment && payOnlineTarget.facilitatorId) {
        const facId = payOnlineTarget.facilitatorId;

        // 1. Process unrecorded approved sessions first if on detail view
        const unrecordedApproved = allDetailRecords.filter(
          r => r.is_unrecorded && r.status === 'approved'
        );

        for (const unrec of unrecordedApproved) {
          const { data: createdData } = await supabase
            .from('facilitator_earnings')
            .insert({
              facilitator_id: facId,
              session_id: unrec.session_id,
              amount: unrec.amount || perSessionAmount,
              status: 'paid_online',
              approved_at: new Date().toISOString(),
              approved_by: user?.id
            })
            .select('id, amount')
            .single();

          if (createdData) {
            saveStoredPayment({
              earning_id: createdData.id,
              transaction_id: transactionIdInput.trim(),
              paid_amount: createdData.amount,
              paid_at: payDateInput,
              notes: payNotesInput.trim()
            });
          }
        }

        // 2. Fetch and bulk update all existing approved earnings for this facilitator
        const { data: approvedEarnings, error: fetchErr } = await supabase
          .from('facilitator_earnings')
          .select('id, amount')
          .eq('facilitator_id', facId)
          .eq('status', 'approved');

        if (fetchErr) throw fetchErr;

        if (approvedEarnings && approvedEarnings.length > 0) {
          const ids = approvedEarnings.map(e => e.id);
          // Update DB status to paid_online
          await supabase
            .from('facilitator_earnings')
            .update({
              status: 'paid_online',
              approved_at: new Date().toISOString()
            })
            .in('id', ids);

          // Save payment info for each record in storage
          approvedEarnings.forEach(e => {
            saveStoredPayment({
              earning_id: e.id,
              transaction_id: transactionIdInput.trim(),
              paid_amount: e.amount,
              paid_at: payDateInput,
              notes: payNotesInput.trim()
            });
          });
        }
      } else if (payOnlineTarget?.isUnrecorded && payOnlineTarget.sessionId) {
        const { data: createdData, error: createErr } = await supabase
          .from('facilitator_earnings')
          .insert({
            facilitator_id: payOnlineTarget.facilitatorId || selectedFacilitator!.id,
            session_id: payOnlineTarget.sessionId,
            amount: payAmountInput,
            status: 'paid_online',
            approved_at: new Date().toISOString(),
            approved_by: user?.id
          })
          .select('id')
          .single();

        if (!createErr && createdData) {
          saveStoredPayment({
            earning_id: createdData.id,
            transaction_id: transactionIdInput.trim(),
            paid_amount: payAmountInput,
            paid_at: payDateInput,
            notes: payNotesInput.trim()
          });
        }
      } else if (payOnlineTarget?.earningId && !payOnlineTarget.earningId.startsWith('unrecorded_')) {
        await supabase
          .from('facilitator_earnings')
          .update({
            status: 'paid_online',
            approved_at: new Date().toISOString()
          })
          .eq('id', payOnlineTarget.earningId);

        saveStoredPayment({
          earning_id: payOnlineTarget.earningId,
          transaction_id: transactionIdInput.trim(),
          paid_amount: payAmountInput,
          paid_at: payDateInput,
          notes: payNotesInput.trim()
        });
      }

      toast.success(`Payment recorded! Txn ID: ${transactionIdInput.trim()}`);
      setPayOnlineDialogOpen(false);

      if (selectedFacilitator) {
        fetchFacilitatorRecords(selectedFacilitator.id, selectedFacilitator.name);
      }
      fetchEarnings();
    } catch (err) {
      console.error('Error saving payment:', err);
      toast.error('Failed to save payment');
    } finally {
      setIsSavingPayment(false);
    }
  };

  const handleExportBankFormat = () => {
    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    const monthLabel = selectedMonth === 'all' ? 'All_Months' : monthNames[parseInt(selectedMonth)];

    const headers = [
      'Facilitator Name',
      `Total Approved (₹) - ${monthLabel} ${selectedYear}`,
      `Paid Online (₹) - ${monthLabel} ${selectedYear}`,
      `Total Pending (₹) - ${monthLabel} ${selectedYear}`
    ];

    const csvRows = [headers.join(',')];

    const escapeCsv = (val: any) => {
      if (val === null || val === undefined) return '';
      const str = String(val);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    let count = 0;
    filteredData.forEach((f) => {
      if (f.total_approved <= 0 && f.total_paid_online <= 0 && f.total_pending <= 0) return;
      count++;
      const row = [
        f.name,
        f.total_approved,
        f.total_paid_online,
        f.total_pending
      ];
      csvRows.push(row.map(escapeCsv).join(','));
    });

    if (count === 0) {
      toast.error('No earnings found to export.');
      return;
    }

    const csvContent = csvRows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Facilitator_Earnings_${monthLabel}_${selectedYear}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast.success(`Successfully exported earnings for ${count} facilitators`);
  };

  const filteredData = earningsData.filter(f => 
    f.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Detail page filtering
  const filteredDetailRecords = allDetailRecords.filter(r => {
    const s = r.sessions || {};
    const code = s.session_id_code || r.session_id || '';
    const cat = s.content_category || '';
    const mod = s.module_name || '';
    const top = s.topics_covered || s.title || '';
    const vol = s.volunteer_name || '';
    const coor = s.coordinator_name || '';
    const fac = s.facilitator_name || '';
    const cls = s.class_batch || '';
    const txn = r.transaction_id || '';

    const q = detailSearchQuery.toLowerCase();
    const matchesSearch = 
      !q ||
      code.toLowerCase().includes(q) ||
      cat.toLowerCase().includes(q) ||
      mod.toLowerCase().includes(q) ||
      top.toLowerCase().includes(q) ||
      vol.toLowerCase().includes(q) ||
      coor.toLowerCase().includes(q) ||
      fac.toLowerCase().includes(q) ||
      cls.toLowerCase().includes(q) ||
      txn.toLowerCase().includes(q);
    
    const matchesStatus = detailStatusFilter === 'all' || r.status === detailStatusFilter;
    const matchesType = detailTypeFilter === 'all' || s.session_type === detailTypeFilter;

    const recordDate = s.session_date ? new Date(s.session_date) : new Date(r.created_at);
    const matchesMonth = detailMonthFilter === 'all' || (!isNaN(recordDate.getTime()) && recordDate.getMonth().toString() === detailMonthFilter);

    return matchesSearch && matchesStatus && matchesType && matchesMonth;
  });

  // Dynamic Detail Summary Card Computations
  const detailApprovedSum = allDetailRecords
    .filter(r => {
      const isPaid = r.status === 'paid_online' || !!r.transaction_id;
      const isApproved = r.status === 'approved';
      const recordDate = r.sessions?.session_date ? new Date(r.sessions.session_date) : new Date(r.created_at);
      const matchesMonth = detailMonthFilter === 'all' || (!isNaN(recordDate.getTime()) && recordDate.getMonth().toString() === detailMonthFilter);
      return isApproved && !isPaid && matchesMonth;
    })
    .reduce((acc, r) => acc + (parseFloat(r.amount as any) || 0), 0);

  const detailPaidOnlineSum = allDetailRecords
    .filter(r => {
      const isPaid = r.status === 'paid_online' || !!r.transaction_id;
      const recordDate = r.sessions?.session_date ? new Date(r.sessions.session_date) : new Date(r.created_at);
      const matchesMonth = detailMonthFilter === 'all' || (!isNaN(recordDate.getTime()) && recordDate.getMonth().toString() === detailMonthFilter);
      return isPaid && matchesMonth;
    })
    .reduce((acc, r) => acc + (parseFloat(r.amount as any) || 0), 0);

  const detailPendingSum = allDetailRecords
    .filter(r => {
      const isPaid = r.status === 'paid_online' || !!r.transaction_id;
      const isApproved = r.status === 'approved';
      const recordDate = r.sessions?.session_date ? new Date(r.sessions.session_date) : new Date(r.created_at);
      const matchesMonth = detailMonthFilter === 'all' || (!isNaN(recordDate.getTime()) && recordDate.getMonth().toString() === detailMonthFilter);
      return !isPaid && !isApproved && matchesMonth;
    })
    .reduce((acc, r) => acc + (parseFloat(r.amount as any) || 0), 0);

  const detailTotalSessionsCount = allDetailRecords.filter(r => {
    const recordDate = r.sessions?.session_date ? new Date(r.sessions.session_date) : new Date(r.created_at);
    return detailMonthFilter === 'all' || (!isNaN(recordDate.getTime()) && recordDate.getMonth().toString() === detailMonthFilter);
  }).length;

  // Totals for main summary cards
  const totalApprovedSum = earningsData.reduce((acc, curr) => acc + curr.total_approved, 0);
  const totalPaidOnlineSum = earningsData.reduce((acc, curr) => acc + curr.total_paid_online, 0);
  const totalPendingSum = earningsData.reduce((acc, curr) => acc + curr.total_pending, 0);

  // ==========================================
  // VIEW 1: DEDICATED FACILITATOR DETAIL PAGE
  // ==========================================
  if (facilitatorId && selectedFacilitator) {
    return (
      <DashboardLayout role="admin">
        <div className="space-y-6">
          {/* Header & Back Navigation */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <Button 
                variant="ghost" 
                onClick={() => navigate('/admin-facilitator-earnings')}
                className="gap-2 p-0 hover:bg-transparent text-primary hover:underline mb-1"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to Facilitators List
              </Button>
              <h1 className="text-2xl font-bold text-foreground">
                Facilitator Earnings: {selectedFacilitator.name}
              </h1>
              <p className="text-muted-foreground text-sm">
                View completed sessions, approve earnings, and control online payouts for {selectedFacilitator.name}
              </p>
            </div>
            
            <div className="flex gap-2">
              <Button 
                onClick={() => openPayOnlineModal()} 
                className="gap-2 bg-purple-600 hover:bg-purple-700 text-white"
              >
                <CreditCard className="h-4 w-4" />
                Controlling
              </Button>
            </div>
          </div>

          {/* Facilitator Detail Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="border-l-4 border-l-green-500">
              <CardContent className="p-4">
                <p className="text-xs font-medium text-muted-foreground">Approved (Unpaid)</p>
                <h3 className="text-xl font-bold mt-1 text-green-600">
                  ₹{detailApprovedSum.toLocaleString('en-IN')}
                </h3>
              </CardContent>
            </Card>

            <Card className="border-l-4 border-l-purple-500">
              <CardContent className="p-4">
                <p className="text-xs font-medium text-muted-foreground">Paid Online</p>
                <h3 className="text-xl font-bold mt-1 text-purple-600">
                  ₹{detailPaidOnlineSum.toLocaleString('en-IN')}
                </h3>
              </CardContent>
            </Card>

            <Card className="border-l-4 border-l-yellow-500">
              <CardContent className="p-4">
                <p className="text-xs font-medium text-muted-foreground">Pending Approval</p>
                <h3 className="text-xl font-bold mt-1 text-yellow-600">
                  ₹{detailPendingSum.toLocaleString('en-IN')}
                </h3>
              </CardContent>
            </Card>

            <Card className="border-l-4 border-l-blue-500">
              <CardContent className="p-4">
                <p className="text-xs font-medium text-muted-foreground">Total Sessions</p>
                <h3 className="text-xl font-bold mt-1 text-blue-600">
                  {detailTotalSessionsCount}
                </h3>
              </CardContent>
            </Card>
          </div>

          {/* Main Table Card (Exact columns & layout matching Record & Feedback UI) */}
          <Card className="shadow-sm">
            <CardContent className="p-4 space-y-4">
              {/* Search Bar */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by session ID, category, module, topic, volunteer, coordinator, or Txn ID..."
                  value={detailSearchQuery}
                  onChange={(e) => setDetailSearchQuery(e.target.value)}
                  className="pl-10 pr-10 text-xs h-9"
                />
                {detailSearchQuery && (
                  <button
                    onClick={() => setDetailSearchQuery('')}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>

              {/* Filter Controls Row */}
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-3 text-xs">
                <div className="flex flex-wrap items-center gap-3">
                  <div>
                    <label className="text-xs font-medium mb-1 block">Month Filter</label>
                    <Select value={detailMonthFilter} onValueChange={setDetailMonthFilter}>
                      <SelectTrigger className="h-9 w-[140px] text-xs"><SelectValue placeholder="All Months" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Months</SelectItem>
                        <SelectItem value="0">January</SelectItem>
                        <SelectItem value="1">February</SelectItem>
                        <SelectItem value="2">March</SelectItem>
                        <SelectItem value="3">April</SelectItem>
                        <SelectItem value="4">May</SelectItem>
                        <SelectItem value="5">June</SelectItem>
                        <SelectItem value="6">July</SelectItem>
                        <SelectItem value="7">August</SelectItem>
                        <SelectItem value="8">September</SelectItem>
                        <SelectItem value="9">October</SelectItem>
                        <SelectItem value="10">November</SelectItem>
                        <SelectItem value="11">December</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <label className="text-xs font-medium mb-1 block">Earning Status</label>
                    <Select value={detailStatusFilter} onValueChange={setDetailStatusFilter}>
                      <SelectTrigger className="h-9 w-[150px] text-xs"><SelectValue placeholder="All Statuses" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Statuses</SelectItem>
                        <SelectItem value="approved">Approved</SelectItem>
                        <SelectItem value="paid_online">Paid Online</SelectItem>
                        <SelectItem value="pending">Pending Approval</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <label className="text-xs font-medium mb-1 block">Session Type</label>
                    <Select value={detailTypeFilter} onValueChange={setDetailTypeFilter}>
                      <SelectTrigger className="h-9 w-[130px] text-xs"><SelectValue placeholder="All Types" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Types</SelectItem>
                        <SelectItem value="guest_teacher">GT</SelectItem>
                        <SelectItem value="guest_speaker">GS</SelectItem>
                        <SelectItem value="local_teacher">LT</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="text-xs text-muted-foreground">
                  Showing {filteredDetailRecords.length} of {allDetailRecords.length} sessions
                </div>
              </div>

              {/* Horizontal Scrollable Table with ALL 14 COLUMNS */}
              {loadingRecords ? (
                <div className="flex justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                </div>
              ) : (
                <div className="overflow-x-auto border border-border rounded-lg">
                  <Table className="text-xs">
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="font-bold min-w-[200px] w-[200px]">Session ID</TableHead>
                        <TableHead className="min-w-[150px]">Category</TableHead>
                        <TableHead className="min-w-[160px]">Module No & Name</TableHead>
                        <TableHead className="min-w-[220px]">Topics Covered</TableHead>
                        <TableHead className="w-[60px]">Type</TableHead>
                        <TableHead className="min-w-[130px]">Volunteer</TableHead>
                        <TableHead className="min-w-[130px]">Coordinator</TableHead>
                        <TableHead className="min-w-[130px]">Facilitator</TableHead>
                        <TableHead className="min-w-[100px]">Class</TableHead>
                        <TableHead className="whitespace-nowrap min-w-[100px]">Date</TableHead>
                        <TableHead className="text-right font-bold min-w-[90px]">Amount</TableHead>
                        <TableHead className="min-w-[110px]">Status</TableHead>
                        <TableHead className="min-w-[140px]">Transaction ID</TableHead>
                        <TableHead className="w-[60px] text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredDetailRecords.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={14} className="text-center py-8 text-muted-foreground">
                            No sessions found matching your filters.
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredDetailRecords.map((record) => {
                          const s = record.sessions || {};
                          const isPaid = record.status === 'paid_online' || !!record.transaction_id;
                          const isApproved = record.status === 'approved';
                          const sessionCode = s.session_id_code || (record.session_id ? `#${record.session_id.slice(0, 8).toUpperCase()}` : '-');

                          return (
                            <TableRow key={record.id} className="hover:bg-muted/50">
                              {/* 1. SESSION ID (FIRST COLUMN) */}
                              <TableCell className="py-2 min-w-[200px] w-[200px]">
                                <Badge 
                                  variant="outline" 
                                  className="font-mono text-[11px] bg-primary/10 text-primary border-primary/20 font-bold px-2 py-0.5 whitespace-nowrap inline-block"
                                  title={`Session Code: ${sessionCode}`}
                                >
                                  {sessionCode}
                                </Badge>
                              </TableCell>

                              {/* 2. CATEGORY */}
                              <TableCell><TruncatedText text={s.content_category} maxLength={18} /></TableCell>

                              {/* 3. MODULE NO & NAME */}
                              <TableCell><TruncatedText text={s.module_name} maxLength={20} /></TableCell>

                              {/* 4. TOPICS COVERED */}
                              <TableCell><TruncatedText text={s.topics_covered || s.title} maxLength={28} /></TableCell>

                              {/* 5. TYPE */}
                              <TableCell>
                                <Badge variant="outline" className="text-[10px] h-5 px-1 whitespace-nowrap font-bold">
                                  {s.session_type === 'guest_speaker' ? 'GS' : s.session_type === 'local_teacher' ? 'LT' : 'GT'}
                                </Badge>
                              </TableCell>

                              {/* 6. VOLUNTEER */}
                              <TableCell><TruncatedText text={s.volunteer_name} maxLength={15} /></TableCell>

                              {/* 7. COORDINATOR */}
                              <TableCell><TruncatedText text={s.coordinator_name} maxLength={15} /></TableCell>

                              {/* 8. FACILITATOR */}
                              <TableCell><TruncatedText text={s.facilitator_name || selectedFacilitator.name} maxLength={15} /></TableCell>

                              {/* 9. CLASS */}
                              <TableCell><span className="font-medium whitespace-nowrap">{s.class_batch || '-'}</span></TableCell>

                              {/* 10. DATE */}
                              <TableCell className="whitespace-nowrap font-medium">
                                {s.session_date ? new Date(s.session_date).toLocaleDateString('en-GB') : '-'}
                              </TableCell>

                              {/* 11. AMOUNT */}
                              <TableCell className="text-right font-bold text-green-600 whitespace-nowrap">
                                {editingEarningId === record.id ? (
                                  <Input 
                                    type="number" 
                                    value={editEarningAmount}
                                    onChange={(e) => setEditEarningAmount(e.target.value)}
                                    className="w-20 ml-auto text-right text-xs h-7"
                                  />
                                ) : (
                                  `₹${record.amount.toLocaleString('en-IN')}`
                                )}
                              </TableCell>

                              {/* 12. STATUS */}
                              <TableCell>
                                {isPaid ? (
                                  <Badge className="bg-purple-600 hover:bg-purple-700 text-white text-[10px] whitespace-nowrap font-semibold">
                                    Paid Online
                                  </Badge>
                                ) : isApproved ? (
                                  <Badge className="bg-green-600 hover:bg-green-700 text-white text-[10px] whitespace-nowrap font-semibold">
                                    Approved
                                  </Badge>
                                ) : (
                                  <Badge variant="secondary" className="text-[10px] whitespace-nowrap text-yellow-700 bg-yellow-100 border-yellow-300 font-semibold">
                                    Pending
                                  </Badge>
                                )}
                              </TableCell>

                              {/* 13. TRANSACTION ID */}
                              <TableCell className="font-mono">
                                {record.transaction_id ? (
                                  <span className="inline-flex items-center gap-1 text-purple-700 font-semibold bg-purple-50 px-1.5 py-0.5 rounded border border-purple-200 text-[10px]">
                                    💳 {record.transaction_id}
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground">-</span>
                                )}
                              </TableCell>

                              {/* 14. ACTIONS (3-DOT MENU) */}
                              <TableCell className="text-right">
                                {editingEarningId === record.id ? (
                                  <div className="flex justify-end gap-1">
                                    <Button size="sm" className="h-7 text-xs px-2" onClick={() => updateEarningAmount(record.id)}>Save</Button>
                                    <Button size="sm" variant="ghost" className="h-7 text-xs px-2" onClick={() => setEditingEarningId(null)}>Cancel</Button>
                                  </div>
                                ) : (
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <Button variant="ghost" size="icon" className="h-7 w-7">
                                        <MoreVertical className="h-4 w-4" />
                                      </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end" className="bg-popover text-xs">
                                      {!isPaid && record.status === 'pending' && (
                                        <DropdownMenuItem onClick={() => approveEarning(record)} className="gap-2 cursor-pointer text-green-700 font-medium">
                                          <CheckCircle className="h-3.5 w-3.5" />
                                          Approve Earning (₹{record.amount})
                                        </DropdownMenuItem>
                                      )}

                                      {!isPaid && record.status === 'approved' && (
                                        <DropdownMenuItem onClick={() => resetToPendingEarning(record)} className="gap-2 cursor-pointer text-yellow-700">
                                          <RotateCcw className="h-3.5 w-3.5" />
                                          Reset to Pending
                                        </DropdownMenuItem>
                                      )}

                                      {isPaid && (
                                        <DropdownMenuItem onClick={() => openUndoPaymentModal(record)} className="gap-2 cursor-pointer text-red-600 font-medium">
                                          <RotateCcw className="h-3.5 w-3.5 text-red-600" />
                                          Undo Paid Online
                                        </DropdownMenuItem>
                                      )}

                                      {!record.is_unrecorded && (
                                        <>
                                          <DropdownMenuSeparator />
                                          <DropdownMenuItem 
                                            onClick={() => {
                                              setEditingEarningId(record.id);
                                              setEditEarningAmount(record.amount.toString());
                                            }} 
                                            className="gap-2 cursor-pointer"
                                          >
                                            <Edit3 className="h-3.5 w-3.5 text-blue-600" />
                                            Edit Amount
                                          </DropdownMenuItem>
                                        </>
                                      )}
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                )}
                              </TableCell>
                            </TableRow>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* PAY ONLINE DIALOG */}
        <Dialog open={payOnlineDialogOpen} onOpenChange={setPayOnlineDialogOpen}>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-purple-700">
                <CreditCard className="h-5 w-5" />
                Record Online Payment
              </DialogTitle>
              <DialogDescription>
                Enter the online payment reference / transaction details for {payOnlineTarget?.facilitatorName}.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label htmlFor="txn-id" className="text-xs font-semibold">Transaction ID / Ref No *</Label>
                <Input 
                  id="txn-id"
                  placeholder="e.g. UPI/1234567890 or TXN-98765" 
                  value={transactionIdInput}
                  onChange={(e) => setTransactionIdInput(e.target.value)}
                  className="font-mono text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="pay-amt" className="text-xs font-semibold">Amount Paid (₹) *</Label>
                  <Input 
                    id="pay-amt"
                    type="number"
                    value={payAmountInput}
                    onChange={(e) => setPayAmountInput(Number(e.target.value))}
                    className="font-semibold text-green-700"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="pay-date" className="text-xs font-semibold">Payment Date *</Label>
                  <Input 
                    id="pay-date"
                    type="date"
                    value={payDateInput}
                    onChange={(e) => setPayDateInput(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="pay-notes" className="text-xs font-semibold">Notes / Reference (Optional)</Label>
                <Input 
                  id="pay-notes"
                  placeholder="e.g. Bank Transfer / GPay / PhonePe" 
                  value={payNotesInput}
                  onChange={(e) => setPayNotesInput(e.target.value)}
                  className="text-xs"
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setPayOnlineDialogOpen(false)}>Cancel</Button>
              <Button 
                onClick={handleSavePayment} 
                disabled={isSavingPayment} 
                className="bg-purple-600 hover:bg-purple-700 text-white"
              >
                {isSavingPayment ? 'Saving...' : 'Save Paid Online Record'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Undo Payment Confirmation Dialog */}
        <Dialog open={undoDialogOpen} onOpenChange={setUndoDialogOpen}>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-red-600">
                <RotateCcw className="h-5 w-5 text-red-600" />
                Undo Paid Online Status
              </DialogTitle>
              <DialogDescription>
                This will reverse the payment status back to <strong className="text-green-700">Approved</strong> and remove the recorded transaction reference.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="bg-red-50 border border-red-200 rounded-md p-3 text-xs text-red-800 space-y-1">
                <p className="font-semibold">Session: {undoTargetRecord?.sessions?.title || undoTargetRecord?.sessions?.topics_covered || undoTargetRecord?.sessions?.session_id_code || 'Session'}</p>
                <p>Amount: ₹{undoTargetRecord?.amount}</p>
                {undoTargetRecord?.transaction_id && <p className="font-mono">Txn ID: {undoTargetRecord.transaction_id}</p>}
              </div>

              <div className="space-y-2">
                <Label htmlFor="undo-confirm-input-v1" className="text-xs font-semibold">
                  To confirm, type <span className="font-bold text-red-600">undo</span> in the box below:
                </Label>
                <Input 
                  id="undo-confirm-input-v1"
                  placeholder='Type "undo" to confirm'
                  value={undoConfirmInput}
                  onChange={(e) => setUndoConfirmInput(e.target.value)}
                  className="font-mono text-sm"
                  autoFocus
                />
              </div>
            </div>

            <DialogFooter className="flex justify-end gap-2">
              <Button 
                variant="ghost" 
                onClick={() => setUndoDialogOpen(false)} 
                disabled={isUndoingPayment}
              >
                Cancel
              </Button>
              <Button 
                variant="destructive"
                onClick={handleConfirmUndoPayment}
                disabled={undoConfirmInput.toLowerCase().trim() !== 'undo' || isUndoingPayment}
                className="gap-2"
              >
                <RotateCcw className="h-4 w-4" />
                {isUndoingPayment ? 'Undoing...' : 'Confirm Undo'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </DashboardLayout>
    );
  }

  // ==========================================
  // VIEW 2: MAIN FACILITATOR EARNINGS LIST PAGE
  // ==========================================
  return (
    <DashboardLayout role="admin">
      <div className="space-y-6">
        {/* Header Actions */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Facilitator Earnings</h1>
            <p className="text-muted-foreground">Manage, approve, and track online payments for facilitators</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setIsSettingsOpen(true)} className="gap-2">
              <Settings className="h-4 w-4" />
              Settings
            </Button>
            <Button onClick={handleExportBankFormat} className="gap-2 bg-green-600 hover:bg-green-700 text-white border-0">
              <Wallet className="h-4 w-4" />
              Export Report
            </Button>
          </div>
        </div>

        {/* Top Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          <Card className="border-l-4 border-l-green-500">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Total Approved Payouts</p>
                  <h3 className="text-2xl font-bold mt-2 text-green-600">
                    ₹{totalApprovedSum.toLocaleString('en-IN')}
                  </h3>
                </div>
                <div className="p-3 bg-green-100 dark:bg-green-950/30 rounded-full">
                  <Wallet className="h-5 w-5 text-green-600" />
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card className="border-l-4 border-l-purple-500">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Total Paid Online</p>
                  <h3 className="text-2xl font-bold mt-2 text-purple-600">
                    ₹{totalPaidOnlineSum.toLocaleString('en-IN')}
                  </h3>
                </div>
                <div className="p-3 bg-purple-100 dark:bg-purple-950/30 rounded-full">
                  <CreditCard className="h-5 w-5 text-purple-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-yellow-500">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Total Pending Payouts</p>
                  <h3 className="text-2xl font-bold mt-2 text-yellow-600">
                    ₹{totalPendingSum.toLocaleString('en-IN')}
                  </h3>
                </div>
                <div className="p-3 bg-yellow-100 dark:bg-yellow-950/30 rounded-full">
                  <TrendingUp className="h-5 w-5 text-yellow-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main List Card */}
        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <CardTitle>Facilitator Earnings List</CardTitle>
              <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto">
                <div className="relative w-full sm:w-72">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search facilitators..."
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
                    <TableHead>Facilitator Name</TableHead>
                    <TableHead className="text-right">Total Approved</TableHead>
                    <TableHead className="text-right">Paid Online</TableHead>
                    <TableHead className="text-right">Total Pending</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8">Loading...</TableCell>
                    </TableRow>
                  ) : filteredData.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                        No facilitators found
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredData.map((f) => (
                      <TableRow key={f.id} className="hover:bg-muted/50">
                        <TableCell className="font-semibold text-foreground">{f.name}</TableCell>
                        <TableCell className="text-right text-green-600 font-semibold">
                          ₹{f.total_approved.toLocaleString('en-IN')}
                        </TableCell>
                        <TableCell className="text-right text-purple-600 font-semibold">
                          ₹{f.total_paid_online.toLocaleString('en-IN')}
                        </TableCell>
                        <TableCell className="text-right text-yellow-600 font-semibold">
                          ₹{f.total_pending.toLocaleString('en-IN')}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button 
                              size="sm" 
                              variant="outline"
                              onClick={() => navigate(`/admin-facilitator-earnings/${f.id}`)}
                              className="text-xs"
                            >
                              View Details
                            </Button>

                            <Button 
                              size="sm"
                              onClick={() => {
                                setSelectedFacilitator(f);
                                openPayOnlineModal();
                              }}
                              className="text-xs bg-purple-600 hover:bg-purple-700 text-white gap-1"
                            >
                              <CreditCard className="h-3 w-3" />
                              Controlling
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Global Pay Online Dialog */}
        <Dialog open={payOnlineDialogOpen} onOpenChange={setPayOnlineDialogOpen}>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-purple-700">
                <CreditCard className="h-5 w-5" />
                Record Online Payment
              </DialogTitle>
              <DialogDescription>
                Enter the online payment reference / transaction details for {payOnlineTarget?.facilitatorName}.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label htmlFor="txn-id-main" className="text-xs font-semibold">Transaction ID / Ref No *</Label>
                <Input 
                  id="txn-id-main"
                  placeholder="e.g. UPI/1234567890 or TXN-98765" 
                  value={transactionIdInput}
                  onChange={(e) => setTransactionIdInput(e.target.value)}
                  className="font-mono text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="pay-amt-main" className="text-xs font-semibold">Amount Paid (₹) *</Label>
                  <Input 
                    id="pay-amt-main"
                    type="number"
                    value={payAmountInput}
                    onChange={(e) => setPayAmountInput(Number(e.target.value))}
                    className="font-semibold text-green-700"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="pay-date-main" className="text-xs font-semibold">Payment Date *</Label>
                  <Input 
                    id="pay-date-main"
                    type="date"
                    value={payDateInput}
                    onChange={(e) => setPayDateInput(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="pay-notes-main" className="text-xs font-semibold">Notes / Reference (Optional)</Label>
                <Input 
                  id="pay-notes-main"
                  placeholder="e.g. Bank Transfer / GPay / PhonePe" 
                  value={payNotesInput}
                  onChange={(e) => setPayNotesInput(e.target.value)}
                  className="text-xs"
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setPayOnlineDialogOpen(false)}>Cancel</Button>
              <Button 
                onClick={handleSavePayment} 
                disabled={isSavingPayment} 
                className="bg-purple-600 hover:bg-purple-700 text-white"
              >
                {isSavingPayment ? 'Saving...' : 'Save Paid Online Record'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Settings Dialog */}
        <Dialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Facilitator Earnings Settings</DialogTitle>
              <DialogDescription>
                Configure the global per-session amount paid to facilitators.
              </DialogDescription>
            </DialogHeader>
            <div className="py-4 space-y-4">
              <div className="space-y-2">
                <Label>Per Session Amount (₹)</Label>
                <Input 
                  type="number" 
                  value={perSessionAmount} 
                  onChange={(e) => setPerSessionAmount(Number(e.target.value))}
                />
                <p className="text-xs text-muted-foreground">This amount will be used by default when approving new session earnings.</p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsSettingsOpen(false)}>Cancel</Button>
              <Button onClick={saveSettings} disabled={isSavingSettings}>Save Settings</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Undo Payment Confirmation Dialog */}
        <Dialog open={undoDialogOpen} onOpenChange={setUndoDialogOpen}>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-red-600">
                <RotateCcw className="h-5 w-5 text-red-600" />
                Undo Paid Online Status
              </DialogTitle>
              <DialogDescription>
                This will reverse the payment status back to <strong className="text-green-700">Approved</strong> and remove the recorded transaction reference.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="bg-red-50 border border-red-200 rounded-md p-3 text-xs text-red-800 space-y-1">
                <p className="font-semibold">Session: {undoTargetRecord?.sessions?.title || undoTargetRecord?.sessions?.topics_covered || undoTargetRecord?.sessions?.session_id_code || 'Session'}</p>
                <p>Amount: ₹{undoTargetRecord?.amount}</p>
                {undoTargetRecord?.transaction_id && <p className="font-mono">Txn ID: {undoTargetRecord.transaction_id}</p>}
              </div>

              <div className="space-y-2">
                <Label htmlFor="undo-confirm-input" className="text-xs font-semibold">
                  To confirm, type <span className="font-bold text-red-600">undo</span> in the box below:
                </Label>
                <Input 
                  id="undo-confirm-input"
                  placeholder='Type "undo" to confirm'
                  value={undoConfirmInput}
                  onChange={(e) => setUndoConfirmInput(e.target.value)}
                  className="font-mono text-sm"
                  autoFocus
                />
              </div>
            </div>

            <DialogFooter className="flex justify-end gap-2">
              <Button 
                variant="ghost" 
                onClick={() => setUndoDialogOpen(false)} 
                disabled={isUndoingPayment}
              >
                Cancel
              </Button>
              <Button 
                variant="destructive"
                onClick={handleConfirmUndoPayment}
                disabled={undoConfirmInput.toLowerCase().trim() !== 'undo' || isUndoingPayment}
                className="gap-2"
              >
                <RotateCcw className="h-4 w-4" />
                {isUndoingPayment ? 'Undoing...' : 'Confirm Undo'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
