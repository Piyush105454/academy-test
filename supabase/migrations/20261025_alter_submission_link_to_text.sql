-- Migration: Fix student task submission
-- 1. Alter submission_link in student_task_feedback to TEXT
-- Reason: Previously submission_link was character varying(255).
-- Now it stores structured JSON containing multiple submission requirement links and student reflections (learned, challenges, doubts).
-- Converting it to TEXT removes character length restrictions completely.

ALTER TABLE public.student_task_feedback 
ALTER COLUMN submission_link TYPE text;

-- 2. Ensure students can submit and update their own tasks via RLS
DO $$ 
BEGIN
    DROP POLICY IF EXISTS "Students can submit and update their own tasks" ON public.student_task_feedback;

    CREATE POLICY "Students can submit and update their own tasks" ON public.student_task_feedback
    FOR UPDATE
    TO authenticated
    USING (
        student_id IN (
            SELECT s.id FROM public.students s
            JOIN public.user_profiles up ON LOWER(s.email) = LOWER(up.email)
            WHERE up.id = auth.uid()
        )
        OR student_id = auth.uid()
    )
    WITH CHECK (
        student_id IN (
            SELECT s.id FROM public.students s
            JOIN public.user_profiles up ON LOWER(s.email) = LOWER(up.email)
            WHERE up.id = auth.uid()
        )
        OR student_id = auth.uid()
    );
END $$;
