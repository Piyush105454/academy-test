const fs = require('fs');
let content = fs.readFileSync('src/pages/ClassStudents.tsx', 'utf-8');

content = content.replace(
  /\{isAdmin && \{isAdmin && <DropdownMenuItem onClick=\{\(\) => handleEditStudent\(student\)\}><Edit className="h-4 w-4 mr-2" \/>Edit<\/DropdownMenuItem>\}/g,
  "{isAdmin && <DropdownMenuItem onClick={() => handleEditStudent(student)}><Edit className=\"h-4 w-4 mr-2\" />Edit</DropdownMenuItem>}"
);

content = content.replace(
  /\{isAdmin && \{isAdmin && <DropdownMenuItem onClick=\{\(\) => \{ setStudentToDelete\(student\); setDeleteDialogOpen\(true\); \}\} className="text-destructive focus:text-destructive"><Trash2 className="h-4 w-4 mr-2" \/>Delete<\/DropdownMenuItem>\}/g,
  "{isAdmin && <DropdownMenuItem onClick={() => { setStudentToDelete(student); setDeleteDialogOpen(true); }} className=\"text-destructive focus:text-destructive\"><Trash2 className=\"h-4 w-4 mr-2\" />Delete</DropdownMenuItem>}"
);

content = content.replace(
  /\{isAdmin && \{isAdmin && <Button size="sm" onClick=\{\(\) => handleEditStudent\(student\)\} className="flex-1 min-w-\[30%\]"><Edit className="h-4 w-4 mr-1" \/>Edit<\/Button>\}/g,
  "{isAdmin && <Button size=\"sm\" onClick={() => handleEditStudent(student)} className=\"flex-1 min-w-[30%]\"><Edit className=\"h-4 w-4 mr-1\" />Edit</Button>}"
);

fs.writeFileSync('src/pages/ClassStudents.tsx', content);
