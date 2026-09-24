import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env' });

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_PUBLISHABLE_KEY);

async function updateStudentIds() {
  const { data, error } = await supabase.from('students').select('id, student_id').order('created_at', { ascending: true });
  if (error) {
    console.error('Error fetching students:', error);
    return;
  }
  
  console.log(`Found ${data.length} students`);
  
  let i = 1;
  for (const student of data) {
    const newId = `STU${String(i).padStart(3, '0')}`;
    console.log(`Updating ${student.student_id} to ${newId}`);
    const { error: updateError } = await supabase.from('students').update({ student_id: newId }).eq('id', student.id);
    if (updateError) {
      console.error(`Error updating student ${student.id}:`, updateError);
    }
    i++;
  }
  
  console.log('Done!');
}

updateStudentIds();
