const fs = require('fs');

let content = fs.readFileSync('src/pages/ClassStudents.tsx', 'utf-8');

// 1. Add userRole to determine isAdmin
content = content.replace(
  /const \[students, setStudents\] = useState<Student\[\]>\(\[\]\);/,
  `const [userRole, setUserRole] = useState<number | null>(null);\n  const [students, setStudents] = useState<Student[]>([]);`
);

const fetchUserRole = `
  useEffect(() => {
    const fetchUserRole = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return;
      try {
        const { data } = await supabase.from('user_profiles').select('role_id').eq('id', session.user.id).maybeSingle();
        if (data?.role_id) {
          setUserRole(data.role_id);
        }
      } catch (err) {}
    };
    fetchUserRole();
  }, []);
  const isAdmin = userRole === 1;
`;
content = content.replace(/(useEffect\(\(\) => \{\n\s*if \(classId\))/, fetchUserRole + "\n  $1");

// 2. Default sort by student_id
content = content.replace(
  /const \[sortColumn, setSortColumn\] = useState<SortColumn>\(null\);/,
  "const [sortColumn, setSortColumn] = useState<SortColumn>('student_id');"
);
content = content.replace(
  /const \[sortDirection, setSortDirection\] = useState<SortDirection>\(null\);/,
  "const [sortDirection, setSortDirection] = useState<SortDirection>('asc');"
);

// 3. Extend Student interface with is_active
content = content.replace(
  /ifsc_code\?: string \| null;/g,
  "ifsc_code?: string | null;\n  is_active?: boolean;"
);

// 4. Update fetchClassAndStudents to sync user_profiles.is_active
const fetch_replace = `
      const { data: studentsData, error: studentsError } = await supabase
        .from('students')
        .select('*')
        .eq('class_id', classId)
        .order('name');
        
      if (!studentsError && studentsData) {
        const emails = studentsData.map(s => s.email).filter(Boolean);
        let profileMap = new Map();
        if (emails.length > 0) {
          const { data: profiles } = await supabase.from('user_profiles').select('email, is_active').in('email', emails);
          if (profiles) {
            profileMap = new Map(profiles.map(p => [p.email?.toLowerCase(), p.is_active]));
          }
        }
        
        const enriched = studentsData.map(s => ({
          ...s,
          is_active: s.email ? (profileMap.get(s.email.toLowerCase()) ?? true) : true
        }));
        setStudents(enriched);
`;
content = content.replace(
  /const \{ data: studentsData, error: studentsError \} = await supabase[\s\S]*?if \(!studentsError && studentsData\) \{\n\s*setStudents\(studentsData\);/m,
  fetch_replace
);

// 5. Add toggle active logic
const toggle_active = `
  const handleToggleActive = async (student: Student) => {
    try {
      const newStatus = student.is_active === false;
      if (student.email) {
        const { error } = await supabase.from('user_profiles').update({ is_active: newStatus }).eq('email', student.email);
        if (error) throw error;
      }
      setStudents(students.map(s => s.id === student.id ? { ...s, is_active: newStatus } : s));
      toast.success(newStatus ? 'Student activated' : 'Student deactivated');
    } catch (e) {
      toast.error('Failed to toggle status');
    }
  };
`;
content = content.replace(/(const handleToggleProfileLock)/, toggle_active + "\n  $1");

// 6. Restrict buttons to isAdmin
content = content.replace(
  /<Button onClick=\{\(\) => setIsAddStudentOpen\(true\)\}>/,
  "{isAdmin && <Button onClick={() => setIsAddStudentOpen(true)}>"
);
content = content.replace(
  /<\/Button>\s*<\/div>\s*\)\ : \(/,
  "</Button>}\n                </div>\n              ) : ("
);

content = content.replace(
  /<Button\s*onClick=\{\(\) => setIsAddStudentOpen\(true\)\}\s*className="w-full sm:w-auto gap-2"\s*>/,
  "{isAdmin && (\n            <Button \n              onClick={() => setIsAddStudentOpen(true)}\n              className=\"w-full sm:w-auto gap-2\"\n            >"
);
content = content.replace(
  /<span className="sm:hidden">Add<\/span>\s*<\/Button>\s*<\/div>/,
  "<span className=\"sm:hidden\">Add</span>\n            </Button>\n          )}\n          </div>"
);

// Menu items
content = content.replace(
  /<DropdownMenuItem onClick=\{\(\) => handleEditStudent\(student\)\}>/g,
  "{isAdmin && <DropdownMenuItem onClick={() => handleEditStudent(student)}>"
);
content = content.replace(
  /<Edit className="h-4 w-4 mr-2" \/>\s*Edit\s*<\/DropdownMenuItem>/g,
  "<Edit className=\"h-4 w-4 mr-2\" />\n                                    Edit\n                                  </DropdownMenuItem>}"
);

content = content.replace(
  /<DropdownMenuItem\s*className="text-red-600 focus:bg-red-50"\s*onClick=\{\(\) => \{\s*setStudentToDelete\(student\);\s*setDeleteDialogOpen\(true\);\s*\}\}\s*>/g,
  "{isAdmin && <DropdownMenuItem\n                                    className=\"text-red-600 focus:bg-red-50\"\n                                    onClick={() => {\n                                      setStudentToDelete(student);\n                                      setDeleteDialogOpen(true);\n                                    }}\n                                  >"
);
content = content.replace(
  /<Trash2 className="h-4 w-4 mr-2" \/>\s*Delete\s*<\/DropdownMenuItem>/g,
  "<Trash2 className=\"h-4 w-4 mr-2\" />\n                                    Delete\n                                  </DropdownMenuItem>}"
);

// Toggle Active menu item
const active_menu = `
  {isAdmin && (
    <DropdownMenuItem onClick={() => handleToggleActive(student)}>
      {student.is_active !== false ? (
        <><UserCog className="h-4 w-4 mr-2 text-red-500" /><span className="text-red-500">Deactivate Account</span></>
      ) : (
        <><UserCog className="h-4 w-4 mr-2 text-green-500" /><span className="text-green-500">Activate Account</span></>
      )}
    </DropdownMenuItem>
  )}
`;
content = content.replace(/(<DropdownMenuItem onClick=\{\(\) => handleToggleProfileLock\(student\)\}>)/, active_menu + "\n                                  $1");

// Mobile cards edit button
content = content.replace(
  /<Button\s*size="sm"\s*onClick=\{\(\) => handleEditStudent\(student\)\}\s*className="flex-1 min-w-\[30%\]"\s*>/g,
  "{isAdmin && <Button\n                            size=\"sm\"\n                            onClick={() => handleEditStudent(student)}\n                            className=\"flex-1 min-w-[30%]\"\n                          >"
);
content = content.replace(
  /<Edit className="h-4 w-4 mr-1" \/>\s*Edit\s*<\/Button>/g,
  "<Edit className=\"h-4 w-4 mr-1\" />\n                            Edit\n                          </Button>}"
);

// Column display for Status
content = content.replace(
  /<TableHead className="w-\[100px\]">DOB<\/TableHead>/,
  "<TableHead className=\"w-[90px]\">Status</TableHead>\n                          <TableHead className=\"w-[100px]\">DOB</TableHead>"
);
content = content.replace(
  /<TableCell className="text-sm">\{student\.gender \|\| '-'\.toString\(\)\}<\/TableCell>/g,
  `<TableCell className="text-sm">{student.gender || '-'}</TableCell>`
);
content = content.replace(
  /<TableCell className="text-sm">\{student\.gender \|\| '-'\}<\/TableCell>/g,
  `<TableCell className="text-sm">{student.gender || '-'}</TableCell>\n                            <TableCell>\n                              <Badge variant={student.is_active !== false ? 'default' : 'secondary'} className={student.is_active !== false ? 'bg-green-500 hover:bg-green-600' : ''}>\n                                {student.is_active !== false ? 'Active' : 'Inactive'}\n                              </Badge>\n                            </TableCell>`
);

// Make sure that mobile cards also show Status
content = content.replace(
  /<p className="text-xs text-muted-foreground mt-1">\s*ID: \{student\.student_id\}\s*<\/p>/,
  "<p className=\"text-xs text-muted-foreground mt-1\">\n                              ID: {student.student_id}\n                            </p>\n                            <Badge variant={student.is_active !== false ? 'default' : 'secondary'} className={`mt-2 ${student.is_active !== false ? 'bg-green-500' : ''}`}>\n                              {student.is_active !== false ? 'Active' : 'Inactive'}\n                            </Badge>"
);

fs.writeFileSync('src/pages/ClassStudents.tsx', content);
console.log('ClassStudents.tsx updated');
