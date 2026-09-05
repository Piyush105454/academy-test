const fs = require('fs');
let content = fs.readFileSync('src/pages/StudentTasks.tsx', 'utf-8');

// Replace the entire filteredTasks block
content = content.replace(
  /const filteredTasks = useMemo\(\(\) => \{\s*return tasks\.filter\(task => \{[\s\S]*?\}\);\s*\}, \[tasks, searchQuery, selectedMonth, filter\]\);/,
  `const filteredTasks = useMemo(() => {
    return tasks.filter(task => {
      const matchesSearch = task.task_name?.toLowerCase().includes(searchQuery.toLowerCase());
      if (!matchesSearch) return false;

      if (selectedMonth !== 'all') {
        const dateToUse = task.deadline ? new Date(task.deadline) : new Date(task.created_at);
        const monthOfDate = dateToUse.getMonth() + 1;
        if (String(monthOfDate) !== selectedMonth) return false;
      }

      if (filterSubject !== 'all' && task.subjects?.name !== filterSubject) return false;
      if (filterTaskType !== 'all' && task.feedback_type?.toUpperCase() !== filterTaskType) return false;

      if (filter === 'submitted') return task.status === 'submitted';
      if (filter === 'completed') return task.status === 'completed' || task.status === 'approved';
      if (filter === 'rejected') return task.status === 'rejected';
      if (filter === 'pending') {
        const isPending = task.status === 'pending' || task.status === 'rejected';
        const isUpcoming = !task.deadline || new Date(task.deadline) >= new Date();
        return isPending && isUpcoming;
      }
      if (filter === 'overdue') {
        const isPending = task.status === 'pending' || task.status === 'rejected';
        const isOverdue = task.deadline && new Date(task.deadline) < new Date();
        return isPending && isOverdue;
      }
      return true;
    });
  }, [tasks, searchQuery, selectedMonth, filter, filterSubject, filterTaskType]);`
);

fs.writeFileSync('src/pages/StudentTasks.tsx', content);
