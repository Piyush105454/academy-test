import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://bkafweywaswykowzrhmx.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJrYWZ3ZXl3YXN3eWtvd3pyaG14Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTI3NDczNCwiZXhwIjoyMDg0ODUwNzM0fQ.fTluY0mP6RwFpTuZ_yXq6nXH3nQ0PSIssEldYMuT-RU';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function checkVolunteerCode() {
  const { data, error } = await supabase.from('volunteers').select('volunteer_code').limit(1);
  if (error) console.log('volunteer_code check error:', error.message);
  else console.log('volunteer_code check SUCCESS!');
}

checkVolunteerCode();
