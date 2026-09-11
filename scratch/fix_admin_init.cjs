const fs = require('fs');

let content = fs.readFileSync('src/pages/AdminStudentEarnings.tsx', 'utf-8');

content = content.replace(
  /const fetchClasses = async \((.*?)\) => \{([\s\S]*?)if \(data\) \{\s*setClasses\(data\);\s*setSelectedModalClass\(prev => \(prev === 'all' \|\| !prev\) \? \(data\[0\]\?\.id \|\| ''\) : prev\);\s*\}\s*\};/,
  `const fetchClasses = async ($1) => {$2if (data) {
        setClasses(data);
        const defaultClass = data[0]?.id || '';
        setSelectedModalClass(prev => (prev === 'all' || !prev) ? defaultClass : prev);
        return defaultClass;
      }
      return '';
    };`
);

content = content.replace(
  /await fetchClasses\(role, facClassIds\);\s*await fetchStudentEarnings\(role, facClassIds\);\s*fetchRewardConfigs\(selectedModalClass !== "all" \? selectedModalClass : undefined\);/,
  `const defaultClassId = await fetchClasses(role, facClassIds);
        await fetchStudentEarnings(role, facClassIds);
        fetchRewardConfigs(selectedModalClass || defaultClassId || undefined);`
);

content = content.replace(
  /fetchRewardConfigs\(selectedModalClass !== "all" \? selectedModalClass : undefined\);/g,
  `fetchRewardConfigs(selectedModalClass || undefined);`
);

content = content.replace(
  /fetchRewardConfigs\(selectedModalClass !== 'all' \? selectedModalClass : undefined\);/g,
  `fetchRewardConfigs(selectedModalClass || undefined);`
);

fs.writeFileSync('src/pages/AdminStudentEarnings.tsx', content);
console.log("Updated AdminStudentEarnings.tsx init logic");
