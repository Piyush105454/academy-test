-- Migration: Add AI feedback columns to student_task_feedback
ALTER TABLE student_task_feedback
ADD COLUMN IF NOT EXISTS ai_overall_rating NUMERIC,
ADD COLUMN IF NOT EXISTS ai_note_rating NUMERIC,
ADD COLUMN IF NOT EXISTS ai_feedback_en TEXT,
ADD COLUMN IF NOT EXISTS ai_feedback_hi TEXT,
ADD COLUMN IF NOT EXISTS ai_scores JSONB;

-- Create index for quick lookup of AI evaluated tasks
CREATE INDEX IF NOT EXISTS idx_student_task_feedback_ai_overall_rating 
ON student_task_feedback(ai_overall_rating);
