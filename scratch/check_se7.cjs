const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const dotenv = require('dotenv');
const envConfig = dotenv.parse(fs.readFileSync('.env'));
const supabase = createClient(envConfig.VITE_SUPABASE_URL, envConfig.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data } = await supabase
    .from('student_task_feedback')
    .select('id, task_name, sessions(title, class_batch), students(classes(name))')
    .ilike('task_name', '%Finding Your Voice%');
  console.log(JSON.stringify(data, null, 2));
}
run();
