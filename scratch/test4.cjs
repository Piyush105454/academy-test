const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const dotenv = require('dotenv');
const envConfig = dotenv.parse(fs.readFileSync('.env'));
const supabase = createClient(envConfig.VITE_SUPABASE_URL, envConfig.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data: cls } = await supabase.from('classes').select('id').ilike('name', '%CCC EMP Fellow%').single();
  const { data } = await supabase.from('students').select('academic_year').eq('class_id', cls.id);
  
  const years = {};
  data.forEach(d => {
     years[d.academic_year] = (years[d.academic_year] || 0) + 1;
  });
  console.log('Students per academic year:', years);
}
run();
