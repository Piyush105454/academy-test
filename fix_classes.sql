ALTER TABLE public.classes 
ADD COLUMN IF NOT EXISTS is_attendance_enabled BOOLEAN DEFAULT true;
