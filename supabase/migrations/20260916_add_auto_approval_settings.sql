-- Migration: Add manager approval and auto-approval settings to academy tasks and templates

-- 1. Add manager approval and auto-approval minutes columns to academy_task_templates
ALTER TABLE public.academy_task_templates 
ADD COLUMN IF NOT EXISTS manager_approval_required boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS auto_approve_minutes integer DEFAULT 1440;

-- 2. Add manager approval, auto-approval minutes, and auto_approve_at to academy_tasks
ALTER TABLE public.academy_tasks 
ADD COLUMN IF NOT EXISTS manager_approval_required boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS auto_approve_minutes integer DEFAULT 1440,
ADD COLUMN IF NOT EXISTS auto_approve_at timestamp with time zone;

-- 3. Ensure submitted_at in academy_submissions defaults to now()
ALTER TABLE public.academy_submissions 
ALTER COLUMN submitted_at SET DEFAULT now();
