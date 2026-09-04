import { supabase } from './src/integrations/supabase/client';

async function check() {
  const { data, error } = await supabase.from('reward_configurations').select('class_id').limit(1);
  console.log("Error:", error?.message);
  console.log("Data:", data);
}
check();
