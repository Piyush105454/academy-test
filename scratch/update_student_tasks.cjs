const fs = require('fs');
let content = fs.readFileSync('src/pages/StudentTasks.tsx', 'utf-8');

// 1. Interface
content = content.replace(
  /rejection_comment\?: string \| null;\n\}/,
  'rejection_comment?: string | null;\n  subjects?: { name: string } | null;\n}'
);

// 2. State vars
content = content.replace(
  /const \[searchQuery, setSearchQuery\] = useState\(''\);/,
  `const [searchQuery, setSearchQuery] = useState('');
  const [filterSubject, setFilterSubject] = useState('all');
  const [filterTaskType, setFilterTaskType] = useState('all');`
);

// 3. Select query
content = content.replace(
  /\.select\('id, task_name, task_description, deadline, feedback_type, status, feedback_notes, submission_link, created_at, earning_amount, rejection_comment'\)/,
  `.select('id, task_name, task_description, deadline, feedback_type, status, feedback_notes, submission_link, created_at, earning_amount, rejection_comment, subjects(name)')`
);

// 4. Extract unique options
content = content.replace(
  /const filteredTasks = useMemo\(\(\) => \{/,
  `const uniqueSubjects = useMemo(() => {
    const subs = new Set<string>();
    tasks.forEach(t => {
      if (t.subjects?.name) subs.add(t.subjects.name);
    });
    return Array.from(subs).sort();
  }, [tasks]);

  const uniqueTaskTypes = useMemo(() => {
    const types = new Set<string>();
    tasks.forEach(t => {
      if (t.feedback_type) types.add(t.feedback_type.toUpperCase());
    });
    return Array.from(types).sort();
  }, [tasks]);

  const filteredTasks = useMemo(() => {`
);

// 5. Apply filters inside the `return tasks.filter(t => {` block
content = content.replace(
  /if \(filter === 'overdue'\) \{[\s\S]*?return false;\n      \}/,
  `if (filter === 'overdue') {
        const isOverdue = t.deadline && new Date(t.deadline) < new Date() && t.status !== 'completed' && t.status !== 'submitted';
        if (!isOverdue) return false;
      } else {
        if (t.status !== filter) return false;
      }
      
      if (filterSubject !== 'all' && t.subjects?.name !== filterSubject) return false;
      if (filterTaskType !== 'all' && t.feedback_type?.toUpperCase() !== filterTaskType) return false;`
);

// 6. Fix Search & Filter Bar UI
// We have:
//             <div className="relative w-full md:w-96">
//               <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
//               <Input ... />
//             </div>
content = content.replace(
  /<div className="relative w-full md:w-96">\s*<Search className="absolute left-3 top-1\/2 -translate-y-1\/2 h-4 w-4 text-muted-foreground" \/>\s*<Input[\s\S]*?\/>\s*<\/div>/,
  `<div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto flex-1">
              <div className="relative w-full md:w-80 shrink-0">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search tasks..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 bg-muted/50 border-none focus-visible:ring-primary h-9"
                />
              </div>
              <Select value={filterSubject} onValueChange={setFilterSubject}>
                <SelectTrigger className="w-full sm:w-[150px] shrink-0 bg-muted/50 border-none h-9">
                  <SelectValue placeholder="All Subjects" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Subjects</SelectItem>
                  {uniqueSubjects.map(sub => <SelectItem key={sub} value={sub}>{sub}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filterTaskType} onValueChange={setFilterTaskType}>
                <SelectTrigger className="w-full sm:w-[150px] shrink-0 bg-muted/50 border-none h-9">
                  <SelectValue placeholder="All Types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  {uniqueTaskTypes.map(typ => <SelectItem key={typ} value={typ}>{typ}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>`
);

// 7. Grid view subject addition
content = content.replace(
  /<span>TYPE: \{task\.feedback_type\.toUpperCase\(\)\}<\/span>/,
  `<span>TYPE: {task.feedback_type.toUpperCase()}</span>\n                        {task.subjects?.name && <span>SUBJECT: {task.subjects.name.toUpperCase()}</span>}`
);

// 8. Table view headers
content = content.replace(
  /<TableHead className="cursor-pointer hover:bg-muted\/50 transition-colors" onClick=\{\(\) => handleSort\('feedback_type'\)\}>\s*<div className="flex items-center gap-1">Type <ArrowUpDown className="h-3 w-3" \/><\/div>\s*<\/TableHead>/,
  `<TableHead className="cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => handleSort('feedback_type')}>
                        <div className="flex items-center gap-1">Type <ArrowUpDown className="h-3 w-3" /></div>
                      </TableHead>
                      <TableHead>Subject</TableHead>`
);

// 9. Table view cells
content = content.replace(
  /<TableCell>\s*<span className="text-xs text-muted-foreground">\{task\.feedback_type\.toUpperCase\(\)\}<\/span>\s*<\/TableCell>/,
  `<TableCell>
                            <span className="text-xs text-muted-foreground">{task.feedback_type.toUpperCase()}</span>
                          </TableCell>
                          <TableCell>
                            <span className="text-xs text-muted-foreground">{task.subjects?.name || '-'}</span>
                          </TableCell>`
);

fs.writeFileSync('src/pages/StudentTasks.tsx', content);
console.log("Updated StudentTasks.tsx");
