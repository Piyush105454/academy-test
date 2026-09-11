const fs = require('fs');

let content = fs.readFileSync('src/pages/AdminStudentEarnings.tsx', 'utf-8');

// 1. Update fetchRewardConfigs to not use `.or`
content = content.replace(
  /if \(classId && classId !== 'all'\) \{\s*query = query\.or\(`class_id\.eq\.\$\{classId\},class_id\.is\.null`\);\s*\} else \{\s*query = query\.is\('class_id', null\);\s*\}/g,
  `if (classId && classId !== 'all') {
          query = query.eq('class_id', classId);
        } else {
          // Fallback if somehow no class is provided
          query = query.is('class_id', null);
        }`
);

// 2. Remove the "Global Default" from the dropdown in the UI
content = content.replace(
  /<SelectValue placeholder="Global Default" \/>/,
  `<SelectValue placeholder="Select Class" />`
);

content = content.replace(
  /<SelectItem value="all">Global Default<\/SelectItem>/,
  ``
);

// 3. Update fetchClasses to set default
content = content.replace(
  /const fetchClasses = async \((.*?)\) => \{([\s\S]*?)if \(data\) setClasses\(data\);\n    \};/,
  `const fetchClasses = async ($1) => {$2if (data) {
        setClasses(data);
        setSelectedModalClass(prev => (prev === 'all' || !prev) ? (data[0]?.id || '') : prev);
      }
    };`
);

// 4. Update the initialization of selectedModalClass just in case
content = content.replace(
  /const \[selectedModalClass, setSelectedModalClass\] = useState<string>\('all'\);/,
  `const [selectedModalClass, setSelectedModalClass] = useState<string>('');`
);

fs.writeFileSync('src/pages/AdminStudentEarnings.tsx', content);
console.log("Updated AdminStudentEarnings.tsx");
