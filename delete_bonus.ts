import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = "https://bkafweywaswykowzrhmx.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJrYWZ3ZXl3YXN3eWtvd3pyaG14Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTI3NDczNCwiZXhwIjoyMDg0ODUwNzM0fQ.fTluY0mP6RwFpTuZ_yXq6nXH3nQ0PSIssEldYMuT-RU";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  console.log("Deleting 100% attendance bonus earnings...");
  const { data, error } = await supabase
    .from('student_earnings')
    .delete()
    .eq('amount', 200)
    .ilike('description', '%100% attendance%');
    
  if (error) {
    console.error("Error deleting:", error);
  } else {
    console.log("Deleted successfully.");
  }
}

run();
