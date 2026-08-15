-- Migration to add designations column to sessions table
-- Supports multi-select designation targeting (e.g., ['1. CCC', '2. Junior Fellow', '3. Senior Fellow'])
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS designations TEXT[] DEFAULT '{}';
