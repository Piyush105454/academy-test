const fs = require('fs');

let content = fs.readFileSync('src/pages/StudentTasks.tsx', 'utf-8');

// 1. Add new imports
const extraImports = `import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { LayoutGrid, List, ArrowUpDown } from 'lucide-react';
`;

if (!content.includes('TableBody')) {
  content = content.replace("import { Badge } from '@/components/ui/badge';", extraImports + "import { Badge } from '@/components/ui/badge';");
}

// 2. Add state variables inside the component
const stateVarsOld = `  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState<StudentTask[]>([]);
  const [filter, setFilter] = useState('pending');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMonth, setSelectedMonth] = useState('all');`;

const stateVarsNew = `  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState<StudentTask[]>([]);
  const [filter, setFilter] = useState('pending');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMonth, setSelectedMonth] = useState('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  const [sortConfig, setSortConfig] = useState<{ key: keyof StudentTask | 'isPast', direction: 'asc' | 'desc' }>({ key: 'deadline', direction: 'asc' });`;

content = content.replace(stateVarsOld, stateVarsNew);

// 3. Update the filteredTasks definition to include sorting
const filteredOld = `  const filteredTasks = useMemo(() => {
    let filtered = tasks;

    // Filter by tab
    if (filter === 'pending') {
      filtered = filtered.filter(t => t.status === 'pending');
    } else if (filter === 'submitted') {
      filtered = filtered.filter(t => t.status === 'submitted');
    } else if (filter === 'completed') {
      filtered = filtered.filter(t => t.status === 'completed');
    } else if (filter === 'rejected') {
      filtered = filtered.filter(t => t.status === 'rejected');
    } else if (filter === 'overdue') {
      filtered = filtered.filter(t => {
        if (!t.deadline) return false;
        return t.status === 'pending' && new Date(t.deadline) < new Date();
      });
    }

    // Filter by search
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(t => 
        t.task_name.toLowerCase().includes(q) || 
        (t.task_description && t.task_description.toLowerCase().includes(q))
      );
    }
    
    // Filter by month
    if (selectedMonth !== 'all') {
      filtered = filtered.filter(t => {
        if (!t.created_at) return false;
        const date = new Date(t.created_at);
        const monthYear = \`\${date.getFullYear()}-\${String(date.getMonth() + 1).padStart(2, '0')}\`;
        return monthYear === selectedMonth;
      });
    }

    return filtered;
  }, [tasks, filter, searchQuery, selectedMonth]);`;

const filteredNew = `  const filteredTasks = useMemo(() => {
    let filtered = tasks;

    // Filter by tab
    if (filter === 'pending') {
      filtered = filtered.filter(t => t.status === 'pending');
    } else if (filter === 'submitted') {
      filtered = filtered.filter(t => t.status === 'submitted');
    } else if (filter === 'completed') {
      filtered = filtered.filter(t => t.status === 'completed');
    } else if (filter === 'rejected') {
      filtered = filtered.filter(t => t.status === 'rejected');
    } else if (filter === 'overdue') {
      filtered = filtered.filter(t => {
        if (!t.deadline) return false;
        return t.status === 'pending' && new Date(t.deadline) < new Date();
      });
    }

    // Filter by search
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(t => 
        t.task_name.toLowerCase().includes(q) || 
        (t.task_description && t.task_description.toLowerCase().includes(q)) ||
        t.feedback_type.toLowerCase().includes(q)
      );
    }
    
    // Filter by month
    if (selectedMonth !== 'all') {
      filtered = filtered.filter(t => {
        if (!t.created_at) return false;
        const date = new Date(t.created_at);
        const monthYear = \`\${date.getFullYear()}-\${String(date.getMonth() + 1).padStart(2, '0')}\`;
        return monthYear === selectedMonth;
      });
    }

    // Sort tasks
    filtered.sort((a, b) => {
      let valA: any = a[sortConfig.key as keyof StudentTask];
      let valB: any = b[sortConfig.key as keyof StudentTask];
      
      if (sortConfig.key === 'isPast') {
        valA = a.deadline ? (new Date(a.deadline) < new Date() ? 1 : 0) : -1;
        valB = b.deadline ? (new Date(b.deadline) < new Date() ? 1 : 0) : -1;
      }
      
      if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
      if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });

    return filtered;
  }, [tasks, filter, searchQuery, selectedMonth, sortConfig]);

  const handleSort = (key: keyof StudentTask | 'isPast') => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };
`;

content = content.replace(filteredOld, filteredNew);

// 4. Update the View mode toggle in the header
const headerOld = `          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Select value={selectedMonth} onValueChange={setSelectedMonth}>`;
const headerNew = `          <div className="flex items-center gap-2 w-full sm:w-auto">
            <div className="hidden md:flex border rounded-md overflow-hidden bg-background mr-2">
              <Button
                variant={viewMode === 'list' ? 'secondary' : 'ghost'}
                size="icon"
                onClick={() => setViewMode('list')}
                className="h-9 w-9 rounded-none"
                title="List View"
              >
                <List className="h-4 w-4" />
              </Button>
              <Button
                variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
                size="icon"
                onClick={() => setViewMode('grid')}
                className="h-9 w-9 rounded-none"
                title="Grid View"
              >
                <LayoutGrid className="h-4 w-4" />
              </Button>
            </div>
            <Select value={selectedMonth} onValueChange={setSelectedMonth}>`;

content = content.replace(headerOld, headerNew);


// 5. Update the Grid rendering to support the Table
const renderOldRegex = /(<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">[\s\S]*?)(\s*<\/div>\s*<\/DashboardLayout>)/;
const renderMatch = content.match(renderOldRegex);

if (renderMatch) {
  const originalGrid = renderMatch[1];
  // Replace the first grid div with a conditional class
  const updatedGrid = originalGrid.replace(
    '<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">', 
    '{/* Grid View (Always on Mobile, Optional on Desktop) */}\n          <div className={cn("grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6", viewMode === \'list\' && "md:hidden")}>'
  );

  const tableRender = `          
          {/* Table View (Desktop Only) */}
          {viewMode === 'list' && (
            <div className="hidden md:block overflow-x-auto bg-card rounded-xl border border-border shadow-sm">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[300px] cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => handleSort('task_name')}>
                      <div className="flex items-center gap-1">Task Name <ArrowUpDown className="h-3 w-3" /></div>
                    </TableHead>
                    <TableHead className="cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => handleSort('feedback_type')}>
                      <div className="flex items-center gap-1">Type <ArrowUpDown className="h-3 w-3" /></div>
                    </TableHead>
                    <TableHead className="cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => handleSort('status')}>
                      <div className="flex items-center gap-1">Status <ArrowUpDown className="h-3 w-3" /></div>
                    </TableHead>
                    <TableHead className="cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => handleSort('deadline')}>
                      <div className="flex items-center gap-1">Deadline <ArrowUpDown className="h-3 w-3" /></div>
                    </TableHead>
                    <TableHead className="cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => handleSort('earning_amount')}>
                      <div className="flex items-center gap-1">Earning <ArrowUpDown className="h-3 w-3" /></div>
                    </TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTasks.map((task) => {
                    const isPast = task.deadline ? new Date(task.deadline) < new Date() : false;
                    const isPending = task.status === 'pending';
                    return (
                      <TableRow key={task.id} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate(\`/student-tasks/\${task.id}\`)}>
                        <TableCell className="font-medium">
                          <div className="line-clamp-2" title={task.task_name}>{task.task_name}</div>
                          {(task as any).task_id && (
                            <div className="font-mono text-[10px] text-muted-foreground mt-1 bg-muted px-1.5 py-0.5 rounded w-fit">
                              {(task as any).task_id}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <span className="text-xs text-muted-foreground">{task.feedback_type.toUpperCase()}</span>
                        </TableCell>
                        <TableCell>
                          <Badge variant={statusBadgeVariant(task.status)}>
                            {task.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {task.deadline ? (
                            <div className={cn(
                              "text-xs px-2 py-1 rounded-md border inline-flex items-center gap-1 whitespace-nowrap",
                              isPast && isPending ? "bg-red-50 text-red-600 border-red-200" : "bg-blue-50 text-blue-700 border-blue-200"
                            )}>
                              <Clock className="h-3 w-3" />
                              {isPast && isPending ? "Overdue" : "Due"}
                              <span className="hidden lg:inline ml-1">
                                {new Date(task.deadline).toLocaleDateString()}
                              </span>
                            </div>
                          ) : (
                            <span className="text-muted-foreground text-xs">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <span className="text-primary font-bold">?{task.earning_amount || 5}</span>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm" className="h-8 text-primary group-hover:gap-2 transition-all">
                            View
                            <ArrowRight className="h-3.5 w-3.5 ml-1" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}`;
  
  content = content.replace(renderMatch[0], updatedGrid + "\n" + tableRender + renderMatch[2]);
}

fs.writeFileSync('src/pages/StudentTasks.tsx', content);
console.log('Successfully updated StudentTasks.tsx');
