const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const dotenv = require('dotenv');
const envConfig = dotenv.parse(fs.readFileSync('.env'));
const supabase = createClient(envConfig.VITE_SUPABASE_URL, envConfig.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data: cls } = await supabase.from('classes').select('id, name').ilike('name', '%CCC EMP Fellow%').single();
  const { data: st } = await supabase.from('students').select('name').eq('class_id', cls.id).limit(10);
  console.log('Sample CCC EMP Fellow students:', st.map(s => s.name));
}
run();
