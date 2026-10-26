/**
 * Utility functions for Facilitator Earnings and Delay Calculations.
 * 
 * Rules:
 * - The 50% delayed deduction policy is ONLY effective for sessions on or after 19 October 2026.
 * - Sessions before 19 October 2026 are never marked delayed and receive the full amount.
 * - A session (on or after 19-10-2026) is delayed if:
 *   1) It is completed/recorded and recorded_at date > session_date
 *   2) It is not completed and session_date < today's date
 * - When a session is delayed, the facilitator earning is HALVED (50% deduction) by default.
 *   E.g., if standard rate is ₹200, the delayed rate is ₹100.
 * - If an explicit/custom amount is saved by admin, that custom amount takes precedence.
 */

export const DELAY_PENALTY_EFFECTIVE_DATE = '2026-10-19';

export const isSessionDelayed = (session: any): boolean => {
  if (!session || !session.session_date) return false;

  const sessionDateStr = session.session_date.split('T')[0];

  // Delay penalty ONLY applies to sessions on or after 19 October 2026
  if (sessionDateStr < DELAY_PENALTY_EFFECTIVE_DATE) {
    return false;
  }

  const fStatus = (session.facilitator_feedback_status || '').toLowerCase();
  const sStatus = (session.status || '').toLowerCase();
  const isDone = fStatus === 'completed' || fStatus === 'done' || sStatus === 'completed';

  if (isDone && session.recorded_at) {
    const recordedDateStr = new Date(session.recorded_at).toISOString().split('T')[0];
    return recordedDateStr > sessionDateStr;
  }

  if (!isDone) {
    const todayStr = new Date().toISOString().split('T')[0];
    return sessionDateStr < todayStr;
  }

  return false;
};

export const getDelayReasonNote = (session: any): string | null => {
  if (!isSessionDelayed(session)) return null;

  const fStatus = (session.facilitator_feedback_status || '').toLowerCase();
  const sStatus = (session.status || '').toLowerCase();
  const isDone = fStatus === 'completed' || fStatus === 'done' || sStatus === 'completed';

  if (isDone && session.recorded_at) {
    try {
      const recDate = new Date(session.recorded_at).toLocaleDateString('en-GB');
      const sessDate = new Date(session.session_date).toLocaleDateString('en-GB');
      return `Feedback submitted on ${recDate} (Scheduled: ${sessDate}) • 50% deduction applied`;
    } catch {
      return `Delayed submission • 50% deduction applied`;
    }
  }

  if (!isDone) {
    return `Session completed after schedule • 50% deduction applied`;
  }

  return `Delayed session • 50% deduction applied`;
};

export const calculateFacilitatorSessionAmount = (
  session: any,
  perSessionAmount: number = 200,
  existingAmount?: number | null
): number => {
  const delayed = isSessionDelayed(session);

  // If an existing/custom amount has been explicitly specified or saved
  if (existingAmount !== undefined && existingAmount !== null && !isNaN(existingAmount) && existingAmount >= 0) {
    // If the session is NOT delayed (e.g. before 19 Oct 2026), but has an old 100 deduction, restore it to full rate
    if (!delayed && existingAmount === Math.round(perSessionAmount / 2)) {
      return perSessionAmount;
    }
    return existingAmount;
  }

  const halfRate = Math.round(perSessionAmount / 2);

  if (delayed) {
    return halfRate;
  }

  return perSessionAmount;
};

export type FacilitatorEarningStatus = 
  | 'pending'           // Completed session, not yet submitted for approval
  | 'submitted'         // FAL submitted for approval (Under Review by Supervisor/Admin)
  | 'approved'          // Approved by Admin/Supervisor -> "Approved - Available to Encash" for FAL
  | 'to_pay'            // FAL requested encashment with signed voucher (ready for admin payout)
  | 'paid_online';      // Admin paid online / completed payout

export interface EncashmentVoucherInfo {
  earning_id?: string;
  session_id: string;
  voucher_url: string;
  uploaded_at: string;
  file_name?: string;
  amount?: number;
}

export interface OnlinePaymentInfo {
  earning_id: string;
  transaction_id: string;
  paid_amount: number;
  paid_at: string;
  notes?: string;
}

const PAYMENTS_STORAGE_KEY = 'facilitator_online_payments_v2';

export const getStoredPayments = (): Record<string, OnlinePaymentInfo> => {
  try {
    const data = localStorage.getItem(PAYMENTS_STORAGE_KEY);
    return data ? JSON.parse(data) : {};
  } catch (e) {
    return {};
  }
};

export const saveStoredPayment = (info: OnlinePaymentInfo) => {
  try {
    const current = getStoredPayments();
    current[info.earning_id] = info;
    localStorage.setItem(PAYMENTS_STORAGE_KEY, JSON.stringify(current));
  } catch (e) {
    console.error('Error saving stored payment:', e);
  }
};

const VOUCHERS_STORAGE_KEY = 'facilitator_encashment_vouchers_v2';

export const getStoredVouchers = (): Record<string, EncashmentVoucherInfo> => {
  try {
    const data = localStorage.getItem(VOUCHERS_STORAGE_KEY);
    return data ? JSON.parse(data) : {};
  } catch (e) {
    return {};
  }
};

export const saveStoredVoucher = (info: EncashmentVoucherInfo) => {
  try {
    const current = getStoredVouchers();
    if (info.earning_id) current[info.earning_id] = info;
    if (info.session_id) current[info.session_id] = info;
    localStorage.setItem(VOUCHERS_STORAGE_KEY, JSON.stringify(current));
  } catch (e) {
    console.error('Error saving stored voucher:', e);
  }
};

export interface FacilitatorSubmissionInfo {
  session_id: string;
  facilitator_id?: string;
  amount?: number;
  submitted_at: string;
}

const SUBMISSIONS_STORAGE_KEY = 'facilitator_approval_submissions_v2';

export const getStoredSubmissions = (): Record<string, FacilitatorSubmissionInfo> => {
  try {
    const data = localStorage.getItem(SUBMISSIONS_STORAGE_KEY);
    return data ? JSON.parse(data) : {};
  } catch (e) {
    return {};
  }
};

export const saveStoredSubmission = (info: FacilitatorSubmissionInfo) => {
  try {
    const current = getStoredSubmissions();
    current[info.session_id] = info;
    localStorage.setItem(SUBMISSIONS_STORAGE_KEY, JSON.stringify(current));
  } catch (e) {
    console.error('Error saving stored submission:', e);
  }
};

export const removeStoredSubmission = (sessionId: string) => {
  try {
    const current = getStoredSubmissions();
    delete current[sessionId];
    localStorage.setItem(SUBMISSIONS_STORAGE_KEY, JSON.stringify(current));
  } catch (e) {
    console.error('Error removing stored submission:', e);
  }
};


