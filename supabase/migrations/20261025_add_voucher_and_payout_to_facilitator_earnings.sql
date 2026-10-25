-- Migration: Add voucher and payout tracking to facilitator_earnings
-- Supports the full lifecycle:
-- 1. pending -> submitted (FAL submits for approval with ACK)
-- 2. submitted -> approved (Admin/Supervisor approves -> FAL sees "Approved - Available to Encash")
-- 3. approved -> to_pay (FAL submits encashment request with ACK and signed voucher)
-- 4. to_pay -> paid_online (Admin completes payout with transaction ID/UTR)

ALTER TABLE public.facilitator_earnings 
ADD COLUMN IF NOT EXISTS transaction_id text,
ADD COLUMN IF NOT EXISTS paid_at text,
ADD COLUMN IF NOT EXISTS signed_voucher_url text,
ADD COLUMN IF NOT EXISTS notes text,
ADD COLUMN IF NOT EXISTS encashed_at timestamp with time zone;
