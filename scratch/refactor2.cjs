const fs = require('fs');
let content = fs.readFileSync('src/pages/ScheduledTasks.tsx', 'utf-8');

// 1. Add session state
const state_adds = `
  const [importSessionId, setImportSessionId] = useState('none');
  const [availableSessions, setAvailableSessions] = useState<{id: string, title: string}[]>([]);
`;
content = content.replace(/(const \[allSubjects, setAllSubjects\] = useState<\{id: string, name: string\}\[\]>\(\[\]\);\n)/g, "$1" + state_adds);

// 2. Fetch sessions when targetClass changes
const fetch_sessions = `
    // Fetch Sessions when class changes
    useEffect(() => {
      const fetchSessions = async () => {
        if (!targetClass) { setAvailableSessions([]); return; }
        const { data } = await (supabase as any)
          .from('sessions')
          .select('id, title')
          .eq('class_batch', targetClass)
          .order('session_date', { ascending: false });
        if (data) setAvailableSessions(data);
      };
      fetchSessions();
      setImportSessionId('none');
    }, [targetClass]);
`;
content = content.replace(/(\/\/ Update preview whenever selectedSheet or customSubjectOverride changes)/g, fetch_sessions + "\n  $1");

// 3. Move Subject Mapping out of the file selection area
// First, find and remove the existing Subject Mapping dropdown
const subject_regex = /<div className="space-y-1\.5">\s*<Label className="text-xs font-semibold flex items-center gap-1\.5">\s*<BookOpen className="h-3\.5 w-3\.5 text-primary" \/>\s*Subject Mapping\s*<\/Label>\s*<Select value=\{customSubjectOverride\} onValueChange=\{setCustomSubjectOverride\}>\s*<SelectTrigger className="h-9 text-xs bg-background">\s*<SelectValue placeholder="Select Subject" \/>\s*<\/SelectTrigger>\s*<SelectContent>\s*<SelectItem value="auto">Auto-detect Subject from Sheet<\/SelectItem>[\s\S]*?<\/SelectContent>\s*<\/Select>\s*<\/div>/;
content = content.replace(subject_regex, "");

// Add Subject Mapping and Linked Session UI to the main grid
const ui_adds = `
                      <div className="space-y-1.5">
                        <Label>Subject (Optional)</Label>
                        <Select value={customSubjectOverride} onValueChange={setCustomSubjectOverride}>
                          <SelectTrigger><SelectValue placeholder="Select Subject" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="auto">Auto-detect from Sheet</SelectItem>
                            {allSubjects.map(s => <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      
                      <div className="space-y-1.5">
                        <Label>Linked Session (Optional)</Label>
                        <Select value={importSessionId} onValueChange={setImportSessionId}>
                          <SelectTrigger><SelectValue placeholder="No Session" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">None</SelectItem>
                            {availableSessions.map(s => <SelectItem key={s.id} value={s.id}>{s.title}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
`;
content = content.replace(/(<div className="space-y-1\.5">\s*<Label htmlFor="excel-file">Upload Excel File \(\.xlsx \/ \.csv\)<\/Label>)/g, ui_adds + "\n                      $1");


// 4. Update encode string
const encode_str = "`\\n\\n__REQ[${importSubmissionTypes.join(',')}]__\\n\\n__TYPE[${importTaskType}]__\\n\\n__YEAR[${importAcademicYear}]__\\n\\n__SESSION[${importSessionId}]__`";
content = content.replace(/`\\n\\n__REQ\[\$\{importSubmissionTypes\.join\(\',\'\)\}\]__\\n\\n__TYPE\[\$\{importTaskType\}\]__\\n\\n__YEAR\[\$\{importAcademicYear\}\]__`/g, encode_str);


// 5. Update decode logic
const decode_logic = `
      let finalDesc = task.description;
      let finalReqs = ['video', 'pdf'];
      let finalType = 'general';
      let finalYear = task.academic_year || selectedYear;
      let finalSessionId = null;
      
      const reqMatch = finalDesc.match(/__REQ\\[(.*?)\\]__/);
      if (reqMatch) { finalReqs = reqMatch[1] ? reqMatch[1].split(',') : []; finalDesc = finalDesc.replace(reqMatch[0], ''); }
      const typeMatch = finalDesc.match(/__TYPE\\[(.*?)\\]__/);
      if (typeMatch) { finalType = typeMatch[1]; finalDesc = finalDesc.replace(typeMatch[0], ''); }
      const yearMatch = finalDesc.match(/__YEAR\\[(.*?)\\]__/);
      if (yearMatch) { finalYear = yearMatch[1]; finalDesc = finalDesc.replace(yearMatch[0], ''); }
      const sessionMatch = finalDesc.match(/__SESSION\\[(.*?)\\]__/);
      if (sessionMatch) { finalSessionId = sessionMatch[1] === 'none' ? null : sessionMatch[1]; finalDesc = finalDesc.replace(sessionMatch[0], ''); }
      
      finalDesc = finalDesc.trim();
`;
content = content.replace(/let finalDesc = task\.description;[\s\S]*?finalDesc = finalDesc\.trim\(\);/m, decode_logic.trim());

// 6. Apply session_id to taskRecords
content = content.replace(/status: 'pending',/g, "session_id: finalSessionId,\n          status: 'pending',");

fs.writeFileSync('src/pages/ScheduledTasks.tsx', content);
console.log('Refactored ScheduledTasks.tsx again!');
