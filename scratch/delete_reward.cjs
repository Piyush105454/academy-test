const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const dotenv = require('dotenv');
const envConfig = dotenv.parse(fs.readFileSync('.env'));
const supabase = createClient(envConfig.VITE_SUPABASE_URL, envConfig.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { error } = await supabase.from('reward_configurations').delete().eq('id', '292ac474-cf99-48fd-a94b-21f50cb6cded');
  if (error) console.error(error);
  else console.log('Successfully deleted the duplicate.');
}
run();
