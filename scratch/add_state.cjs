const fs = require('fs');
let content = fs.readFileSync('src/pages/StudentTasks.tsx', 'utf-8');

if (!content.includes('const [viewMode')) {
  content = content.replace(
    /const navigate = useNavigate\(\);/g,
    `const navigate = useNavigate();\n  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');\n  const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' }>({ key: 'deadline', direction: 'asc' });`
  );
}

fs.writeFileSync('src/pages/StudentTasks.tsx', content);
