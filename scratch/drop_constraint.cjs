const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

async function main() {
  let env = fs.readFileSync('.env', 'utf-8');
  let urlMatch = env.match(/SUPABASE_URL=(.*)/);
  let keyMatch = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/);
  
  const supabaseUrl = urlMatch[1].trim();
  const supabaseKey = keyMatch[1].trim();
  const supabase = createClient(supabaseUrl, supabaseKey);

  // Run SQL to drop constraint and create new one
  const { data, error } = await supabase.rpc('execute_sql', {
    sql_query: `
      ALTER TABLE reward_configurations DROP CONSTRAINT IF EXISTS unique_task_type;
      ALTER TABLE reward_configurations DROP CONSTRAINT IF EXISTS reward_configurations_task_type_key;
      ALTER TABLE reward_configurations ADD CONSTRAINT unique_class_task_type UNIQUE NULLS NOT DISTINCT (class_id, task_type);
    `
  });
  
  console.log("Executed SQL. Error:", error?.message);

  // Or maybe there is no execute_sql RPC. If so, I have to ask the user to run it.
}
main();
