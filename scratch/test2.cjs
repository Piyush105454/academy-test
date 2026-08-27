const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const dotenv = require('dotenv');
const envConfig = dotenv.parse(fs.readFileSync('.env'));
const supabase = createClient(envConfig.VITE_SUPABASE_URL, envConfig.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { count } = await supabase.from('student_task_feedback').select('*', { count: 'exact', head: true }).eq('task_name', 'test');
  console.log('Task count in DB:', count);
}
run();
