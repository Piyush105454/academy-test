import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://bkafweywaswykowzrhmx.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJrYWZ3ZXl3YXN3eWtvd3pyaG14Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTI3NDczNCwiZXhwIjoyMDg0ODUwNzM0fQ.fTluY0mP6RwFpTuZ_yXq6nXH3nQ0PSIssEldYMuT-RU';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function checkOrAddColumn() {
  const { error } = await supabase.from('volunteers').select('custom_volunteer_id').limit(1);
  if (error) {
    console.log('custom_volunteer_id error:', error.message);
  } else {
    console.log('custom_volunteer_id column exists or accessible!');
  }
}

checkOrAddColumn();
