const fs = require('fs');
let content = fs.readFileSync('src/pages/ClassStudents.tsx', 'utf-8');

// Fix the dangling bracket for Delete
content = content.replace(
  /<DropdownMenuItem\s*onClick=\{\(\) => \{\s*setStudentToDelete\(student\);\s*setDeleteDialogOpen\(true\);\s*\}\}\s*className="text-destructive focus:text-destructive"\s*>\s*<Trash2 className="h-4 w-4 mr-2" \/>\s*Delete\s*<\/DropdownMenuItem>\}/g,
  "{isAdmin && <DropdownMenuItem onClick={() => { setStudentToDelete(student); setDeleteDialogOpen(true); }} className=\"text-destructive focus:text-destructive\"><Trash2 className=\"h-4 w-4 mr-2\" />Delete</DropdownMenuItem>}"
);

// We should also ensure the Edit button doesn't have a dangling bracket.
content = content.replace(
  /<DropdownMenuItem onClick=\{\(\) => handleEditStudent\(student\)\}>\s*<Edit className="h-4 w-4 mr-2" \/>\s*Edit\s*<\/DropdownMenuItem>\}/g,
  "{isAdmin && <DropdownMenuItem onClick={() => handleEditStudent(student)}><Edit className=\"h-4 w-4 mr-2\" />Edit</DropdownMenuItem>}"
);

// We should check for any remaining `}` that we added accidentally
// But replacing the block should be enough.

fs.writeFileSync('src/pages/ClassStudents.tsx', content);
