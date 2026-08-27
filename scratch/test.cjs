const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const dotenv = require('dotenv');
const envConfig = dotenv.parse(fs.readFileSync('.env'));
const supabase = createClient(envConfig.VITE_SUPABASE_URL, envConfig.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data } = await supabase.from('student_task_feedback').select('students(classes(name))').eq('task_name', 'test');
  const classNames = [...new Set(data.map(d => d.students?.classes?.name))];
  console.log('Classes:', classNames);
}
run();
