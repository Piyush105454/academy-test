-- Migration: Add feedback_unlocked_until timestamp to sessions table
-- Allows setting a temporary unlock with an automatic expiration limit (e.g. 8 hours)

ALTER TABLE public.sessions 
ADD COLUMN IF NOT EXISTS feedback_unlocked_until TIMESTAMPTZ DEFAULT NULL;

COMMENT ON COLUMN public.sessions.feedback_unlocked_until IS 'Timestamp when the temporary feedback unlock expires. After this time, feedback is automatically locked again.';
