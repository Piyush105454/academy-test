import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://bkafweywaswykowzrhmx.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJrYWZ3ZXl3YXN3eWtvd3pyaG14Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTI3NDczNCwiZXhwIjoyMDg0ODUwNzM0fQ.fTluY0mP6RwFpTuZ_yXq6nXH3nQ0PSIssEldYMuT-RU';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function addColumn() {
  try {
    const { error: selectErr } = await supabase.from('session_hours_tracker').select('supervisor_feedback').limit(1);
    if (selectErr && selectErr.message.includes('supervisor_feedback')) {
      console.log('Column supervisor_feedback error:', selectErr.message);
    } else {
      console.log('Column supervisor_feedback check finished successfully!');
    }
  } catch (err) {
    console.error('Error:', err);
  }
}

addColumn();
