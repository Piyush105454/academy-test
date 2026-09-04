const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

async function main() {
  let env = fs.readFileSync('.env', 'utf-8');
  let urlMatch = env.match(/VITE_SUPABASE_URL=(.*)/);
  let keyMatch = env.match(/VITE_SUPABASE_ANON_KEY=(.*)/);
  
  if (!urlMatch || !keyMatch) {
    // try to find it in other env files
    const files = fs.readdirSync('.');
    for (const file of files) {
      if (file.startsWith('.env')) {
        const content = fs.readFileSync(file, 'utf-8');
        urlMatch = content.match(/VITE_SUPABASE_URL=(.*)/);
        keyMatch = content.match(/VITE_SUPABASE_ANON_KEY=(.*)/);
        if (urlMatch && keyMatch) break;
      }
    }
  }

  const supabaseUrl = urlMatch[1].trim();
  const supabaseKey = keyMatch[1].trim();
  const supabase = createClient(supabaseUrl, supabaseKey);

  // 1. Delete blank rows
  const { data: delData, error: delErr } = await supabase
    .from('reward_configurations')
    .delete()
    .or('task_type.eq."",task_type.is.null');
  
  console.log("Deleted blank rows. Error:", delErr?.message);

  // 2. Fetch classes
  const { data: classes } = await supabase.from('classes').select('id, name');
  console.log("Classes found:", classes?.map(c => c.name).join(', '));

  const cccClass = classes?.find(c => c.name.toLowerCase().includes('ccc emp'));
  const srClass = classes?.find(c => c.name.toLowerCase().includes('senior'));

  if (cccClass) {
    // Delete existing CCC configs to replace them
    await supabase.from('reward_configurations').delete().eq('class_id', cccClass.id);
    
    // Insert new CCC configs
    const cccConfigs = [
      { class_id: cccClass.id, task_type: 'Best Performance and 100% attendance', expected_tasks: 1, frequency: 'MONTHLY', rate_per_task: 200, potential_monthly: 200, how_to_earn: 'Achieve 100% attendance and earn bonus of 200 rs', reviewer_rate: 0 },
      { class_id: cccClass.id, task_type: 'English Reading & speaking Task', expected_tasks: 50, frequency: 'DAILY', rate_per_task: 5, potential_monthly: 250, how_to_earn: 'Read, Write, Speak & Record The Given article and Earn.', reviewer_rate: 0 },
      { class_id: cccClass.id, task_type: 'CCC Session Task', expected_tasks: 25, frequency: 'DAILY', rate_per_task: 10, potential_monthly: 250, how_to_earn: '', reviewer_rate: 0 },
      { class_id: cccClass.id, task_type: 'GT Session Task', expected_tasks: 25, frequency: 'DAILY', rate_per_task: 20, potential_monthly: 500, how_to_earn: 'Complete GT Session task and earn', reviewer_rate: 0 },
      { class_id: cccClass.id, task_type: 'Mentor connect Task', expected_tasks: 2, frequency: 'MONTHLY', rate_per_task: 400, potential_monthly: 800, how_to_earn: 'Connect with your mentor complete the mentprhsip sessions as per the agend', reviewer_rate: 0 }
    ];
    const { error } = await supabase.from('reward_configurations').insert(cccConfigs);
    console.log("Inserted CCC configs. Error:", error?.message);
  } else {
    console.log("Could not find CCC EMP FELLOW class");
  }

  if (srClass) {
    // Delete existing SR configs to replace them
    await supabase.from('reward_configurations').delete().eq('class_id', srClass.id);
    
    // Insert new SR configs
    const srConfigs = [
      { class_id: srClass.id, task_type: 'Best Performance and 100% attendance', expected_tasks: 1, frequency: 'MONTHLY', rate_per_task: 200, potential_monthly: 200, how_to_earn: 'Perform best and Achieve 100% attendance and earn bonus of 200 rs', reviewer_rate: 0 },
      { class_id: srClass.id, task_type: 'English Reading & speaking Task', expected_tasks: 50, frequency: 'DAILY', rate_per_task: 10, potential_monthly: 500, how_to_earn: 'Read, Write, Speak & Record The Given article and Earn.', reviewer_rate: 0 },
      { class_id: srClass.id, task_type: 'GT Session Task', expected_tasks: 25, frequency: 'DAILY', rate_per_task: 20, potential_monthly: 500, how_to_earn: 'Complete GT Session task and earn', reviewer_rate: 0 },
      { class_id: srClass.id, task_type: 'Mentor connect Task', expected_tasks: 2, frequency: 'MONTHLY', rate_per_task: 400, potential_monthly: 800, how_to_earn: 'Connect with your mentor complete the mentprhsip sessions as per the agend', reviewer_rate: 0 }
    ];
    const { error } = await supabase.from('reward_configurations').insert(srConfigs);
    console.log("Inserted Senior configs. Error:", error?.message);
  } else {
    console.log("Could not find Senior Fellow class");
  }

}

main();
