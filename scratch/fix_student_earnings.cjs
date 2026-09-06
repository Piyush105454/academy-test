const fs = require('fs');
let content = fs.readFileSync('src/pages/StudentEarnings.tsx', 'utf-8');

// 1. Remove `fetchRewardConfigs();` from `useEffect`
content = content.replace(
  /loadEarningsData\(\);\n\s*fetchRewardConfigs\(\);/,
  `loadEarningsData();`
);

// 2. Change `fetchRewardConfigs` to accept classIds
content = content.replace(
  /const fetchRewardConfigs = async \(\) => \{[\s\S]*?try \{[\s\S]*?const \{ data, error \} = await supabase[\s\S]*?\.from\('reward_configurations'\)[\s\S]*?\.select\('\*'\)[\s\S]*?\.order\('task_type'\);/,
  `const fetchRewardConfigs = async (classIds: string[]) => {
    try {
      if (classIds.length === 0) {
        setRewardConfigs(DEFAULT_EARNING_POTENTIAL as any);
        return;
      }
      const { data, error } = await supabase
        .from('reward_configurations')
        .select('*')
        .in('class_id', classIds)
        .order('task_type');`
);

// 3. Update `loadEarningsData` to select class_id and call `fetchRewardConfigs`
content = content.replace(
  /const \{ data: students, error: studentError \} = await supabase\s*\n\s*\.from\('students'\)\s*\n\s*\.select\('id'\)\s*\n\s*\.ilike\('email', user\?\.email\);/,
  `const { data: students, error: studentError } = await supabase
        .from('students')
        .select('id, class_id')
        .ilike('email', user?.email)
        .eq('academic_year', selectedYear);`
);

content = content.replace(
  /const studentIds = students\.map\(s => s\.id\);/,
  `const studentIds = students.map(s => s.id);
      const classIds = [...new Set(students.map(s => s.class_id).filter(Boolean))];
      fetchRewardConfigs(classIds);`
);

fs.writeFileSync('src/pages/StudentEarnings.tsx', content);
console.log('Fixed StudentEarnings.tsx');
