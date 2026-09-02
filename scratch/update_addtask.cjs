const fs = require('fs');

let content = fs.readFileSync('src/pages/AddTask.tsx', 'utf-8');

// 1. Update fetchRewardConfigs to filter by classId
const oldFetch = `const fetchRewardConfigs = async () => {
    const { data, error } = await supabase
      .from('reward_configurations')
      .select('task_type, rate_per_task')
      .order('task_type');
    if (!error && data) setRewardConfigs(data);
  };`;

const newFetch = `const fetchRewardConfigs = async (classId: string) => {
    let query = supabase.from('reward_configurations').select('task_type, rate_per_task');
    if (classId) {
      query = query.eq('class_id', classId);
    } else {
      query = query.is('class_id', null);
    }
    const { data, error } = await query.order('task_type');
    if (!error && data) {
      // If we queried a specific class and got nothing, maybe fallback to global defaults?
      if (classId && data.length === 0) {
        const { data: fallbackData } = await supabase.from('reward_configurations').select('task_type, rate_per_task').is('class_id', null).order('task_type');
        if (fallbackData) setRewardConfigs(fallbackData);
      } else {
        setRewardConfigs(data);
      }
    }
  };`;

content = content.replace(
  /const fetchRewardConfigs = async \(\) => \{\n\s*const \{ data, error \} = await supabase\n\s*\.from\('reward_configurations'\)\n\s*\.select\('task_type, rate_per_task'\)\n\s*\.order\('task_type'\);\n\s*if \(\!error && data\) setRewardConfigs\(data\);\n\s*\};/,
  newFetch
);

// Remove initial fetch without args
content = content.replace(/fetchRewardConfigs\(\);\n/, '');

// Add effect for class_id change
content = content.replace(
  /useEffect\(\(\) => \{\n\s*if \(formData\.class_id\)/,
  `useEffect(() => {
    if (formData.class_id) {
      fetchRewardConfigs(formData.class_id);
    } else {
      setRewardConfigs([]);
    }
  }, [formData.class_id]);

  useEffect(() => {
    if (formData.class_id)`
);

// UI order swapping
// Find Task Type block
const taskTypeRegex = /(<div className="space-y-2">\s*<Label htmlFor="task_type">Task Type \*(?:[\s\S]*?)<\/Select>\s*<\/div>)/;
const taskTypeMatch = content.match(taskTypeRegex);

// Find Class Block
const classBlockRegex = /(<div className="col-span-1 md:col-span-2 space-y-2">\s*<Label htmlFor="class">Assign to Class \*(?:[\s\S]*?)<\/Select>\s*<\/div>)/;
const classBlockMatch = content.match(classBlockRegex);

if (taskTypeMatch && classBlockMatch) {
  const taskTypeHtml = taskTypeMatch[0];
  let classHtml = classBlockMatch[0];
  
  // We want to make task_type disabled if !formData.class_id
  const updatedTaskTypeHtml = taskTypeHtml.replace(/<Select\n\s*value=\{formData\.task_type\}/, '<Select\n                    disabled={!formData.class_id}\n                    value={formData.task_type}');
  
  // Remove them from their original spots
  content = content.replace(taskTypeMatch[0], "%%TASK_TYPE_PLACEHOLDER%%");
  content = content.replace(classBlockMatch[0], "%%CLASS_PLACEHOLDER%%");
  
  // Put class where task type was, and task type where class was
  content = content.replace("%%TASK_TYPE_PLACEHOLDER%%", classHtml);
  content = content.replace("%%CLASS_PLACEHOLDER%%", updatedTaskTypeHtml);
}

fs.writeFileSync('src/pages/AddTask.tsx', content);
console.log('AddTask.tsx updated');
