const fs = require('fs');
let content = fs.readFileSync('src/pages/StudentTasks.tsx', 'utf-8');

// If handleSort is missing, add it before return
if (!content.includes('const handleSort')) {
  const insertIndex = content.lastIndexOf('return (');
  if (insertIndex > -1) {
    const code = `
  const handleSort = (key: string) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };
  
`;
    content = content.slice(0, insertIndex) + code + content.slice(insertIndex);
  }
}

// We also need to sort the tasks. Find where `return filtered;` is inside the useMemo
if (content.includes('return filtered;') && !content.includes('filtered.sort')) {
  content = content.replace('return filtered;', `
    filtered.sort((a, b) => {
      let valA: any = (a as any)[sortConfig.key];
      let valB: any = (b as any)[sortConfig.key];
      
      if (sortConfig.key === 'deadline' || sortConfig.key === 'created_at') {
        valA = valA ? new Date(valA).getTime() : 0;
        valB = valB ? new Date(valB).getTime() : 0;
      }
      
      if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
      if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });

    return filtered;
  `);
}

// Ensure sortConfig is in the useMemo dependencies
content = content.replace(/\[tasks, filter, searchQuery, selectedMonth\]\);/g, '[tasks, filter, searchQuery, selectedMonth, sortConfig]);');

fs.writeFileSync('src/pages/StudentTasks.tsx', content);
