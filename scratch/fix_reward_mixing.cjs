const fs = require('fs');
let content = fs.readFileSync('src/pages/AdminStudentEarnings.tsx', 'utf-8');

// Replace handleSaveConfigs logic to handle class_id separation correctly
content = content.replace(
  /\.upsert\(\{\s*task_type: config\.task_type,\s*expected_tasks: config\.expected_tasks,\s*frequency: config\.frequency,\s*rate_per_task: config\.rate_per_task,\s*potential_monthly: config\.expected_tasks \* config\.rate_per_task,\s*how_to_earn: config\.how_to_earn,\s*reviewer_rate: config\.reviewer_rate \|\| 0\s*\}, \{\s*onConflict: 'task_type'\s*\}\)/,
  `.upsert({
              ...(config.id && !config.id.startsWith('new-') ? { id: config.id } : {}),
              class_id: selectedModalClass !== "all" ? selectedModalClass : null,
              task_type: config.task_type,
              expected_tasks: config.expected_tasks,
              frequency: config.frequency,
              rate_per_task: config.rate_per_task,
              potential_monthly: config.expected_tasks * config.rate_per_task,
              how_to_earn: config.how_to_earn,
              reviewer_rate: config.reviewer_rate || 0
            })`
);

fs.writeFileSync('src/pages/AdminStudentEarnings.tsx', content);
