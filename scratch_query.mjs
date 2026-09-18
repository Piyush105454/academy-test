import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY);
async function run() {
  const { data, error } = await supabase
    .from('student_task_feedback')
    .select('id, student_id, task_id, task_name, earning_amount, status, students(name)')
    .eq('task_id', '2026-08-CCCEMPFellow-069');
  console.log(JSON.stringify({data, error}, null, 2));
}
run();
