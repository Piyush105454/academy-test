const fs = require('fs');
let content = fs.readFileSync('src/pages/ScheduledTasks.tsx', 'utf-8');

const state_adds = `
  const [importTaskType, setImportTaskType] = useState('Task');
  const [importAcademicYear, setImportAcademicYear] = useState(selectedYear);
  const [rewardConfigs, setRewardConfigs] = useState<{task_type: string}[]>([]);
  const [allSubjects, setAllSubjects] = useState<{id: string, name: string}[]>([]);
`;
content = content.replace(/(const \[importSubmissionTypes, setImportSubmissionTypes\] = useState<string\[\]>\(\['video', 'pdf'\]\);\n)/g, "$1" + state_adds);


const fetch_adds = `
    // Fetch Task Types & Subjects
    useEffect(() => {
      const fetchLookups = async () => {
        const { data: configs } = await (supabase as any).from('reward_configurations').select('task_type');
        if (configs) setRewardConfigs(configs);
        const { data: subs } = await (supabase as any).from('subjects').select('id, name').order('name');
        if (subs) setAllSubjects(subs);
      };
      fetchLookups();
    }, []);
`;
content = content.replace(/(\/\/ Load Classes for dropdown)/g, fetch_adds + "\n  $1");


const encode_str = "`\\n\\n__REQ[${importSubmissionTypes.join(',')}]__\\n\\n__TYPE[${importTaskType}]__\\n\\n__YEAR[${importAcademicYear}]__`";
content = content.replace(/`\\n\\n__REQ\[\$\{importSubmissionTypes\.join\(\',\'\)\}\]__`/g, encode_str);


const decode_logic = `
      let finalDesc = task.description;
      let finalReqs = ['video', 'pdf'];
      let finalType = 'general';
      let finalYear = task.academic_year || selectedYear;
      
      const reqMatch = finalDesc.match(/__REQ\\[(.*?)\\]__/);
      if (reqMatch) { finalReqs = reqMatch[1] ? reqMatch[1].split(',') : []; finalDesc = finalDesc.replace(reqMatch[0], ''); }
      const typeMatch = finalDesc.match(/__TYPE\\[(.*?)\\]__/);
      if (typeMatch) { finalType = typeMatch[1]; finalDesc = finalDesc.replace(typeMatch[0], ''); }
      const yearMatch = finalDesc.match(/__YEAR\\[(.*?)\\]__/);
      if (yearMatch) { finalYear = yearMatch[1]; finalDesc = finalDesc.replace(yearMatch[0], ''); }
      
      finalDesc = finalDesc.trim();
`;
content = content.replace(/(\/\/ 5\. Insert one row per student \(same as AddTask\))/g, decode_logic + "\n      $1");

content = content.replace(/task_description: task\.description,/g, "task_description: finalDesc,");
content = content.replace(/feedback_type: 'general',/g, "feedback_type: finalType,");
content = content.replace(/academic_year: task\.academic_year \|\| selectedYear,/g, "academic_year: finalYear,");
content = content.replace(/submission_types: \['video', 'pdf'\],/g, "submission_types: finalReqs,");


const ui_adds = `
                      <div className="space-y-1.5">
                        <Label>Task Type</Label>
                        <Select value={importTaskType} onValueChange={setImportTaskType}>
                          <SelectTrigger><SelectValue placeholder="Select Task Type" /></SelectTrigger>
                          <SelectContent>
                            {rewardConfigs.map(c => <SelectItem key={c.task_type} value={c.task_type}>{c.task_type}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      
                      <div className="space-y-1.5">
                        <Label>Academic Year</Label>
                        <Select value={importAcademicYear} onValueChange={setImportAcademicYear}>
                          <SelectTrigger><SelectValue placeholder="Select Year" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="2026-27">2026-27</SelectItem>
                            <SelectItem value="2025-26">2025-26</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
`;
content = content.replace(/(<div className="space-y-1\.5">\s*<Label htmlFor="target-class">Target Class)/g, ui_adds + "\n                      $1");


const subject_ui = `<SelectContent>
                              <SelectItem value="auto">Auto-detect Subject from Sheet</SelectItem>
                              {allSubjects.map(s => <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>)}
                            </SelectContent>`;
content = content.replace(/<SelectContent>\s*<SelectItem value="auto">Auto-detect Subject from Sheet<\/SelectItem>\s*<SelectItem value="Azure[\s\S]*?<\/SelectContent>/, subject_ui);


fs.writeFileSync('src/pages/ScheduledTasks.tsx', content);
console.log('Refactored ScheduledTasks.tsx!');
