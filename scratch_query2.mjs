import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY);
async function run() {
  const studentNames = [
    'Avantika Sen',
    'Pranjali Kahar',
    'Pushpa Lodhi',
    'Kashish Kushwaha',
    'Vrendra Tiwari',
    'Anshika kushwaha',
    'Nida Parveen Mansoori'
  ];
  
  // Find these students in the students table
  const { data: students, error: studentError } = await supabase
    .from('students')
    .select('id, name')
    .in('name', studentNames);
    
  if (studentError) {
    console.error(studentError);
    return;
  }
  
  const studentIds = students.map(s => s.id);
  
  // Find their task records for 100% attendance
  const { data: tasks, error: taskError } = await supabase
    .from('student_task_feedback')
    .select('id, student_id, task_id, task_name, earning_amount, status')
    .in('student_id', studentIds)
    .ilike('task_name', '%100 Percent%');
    
  console.log(JSON.stringify({students, tasks, taskError}, null, 2));
}
run();
