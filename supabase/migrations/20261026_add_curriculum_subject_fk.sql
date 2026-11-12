-- Migration: Add foreign key relationship between curriculum and subjects
-- Resolves PGRST200 PostgREST error:
-- "Could not find a relationship between 'curriculum' and 'subject_id' in the schema cache"

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'curriculum_subject_id_fkey'
    AND table_name = 'curriculum'
  ) THEN
    ALTER TABLE public.curriculum
    ADD CONSTRAINT curriculum_subject_id_fkey
    FOREIGN KEY (subject_id)
    REFERENCES public.subjects(id)
    ON DELETE SET NULL;
  END IF;
END $$;

-- Reload PostgREST schema cache so Supabase immediately detects the foreign key
NOTIFY pgrst, 'reload schema';
