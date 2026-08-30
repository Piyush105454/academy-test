const fs = require('fs');

let content = fs.readFileSync('src/pages/ScheduledTasks.tsx', 'utf-8');

// 1. Add missing imports
if (!content.includes('SubmissionRequirement')) {
  content = content.replace(
    /import { useAcademicYear } from '@\/contexts\/AcademicYearContext';/,
    "import { useAcademicYear } from '@/contexts/AcademicYearContext';\nimport { type SubmissionRequirement, serializeSubmissionRequirements } from '../utils/submissionUtils';"
  );
}

// 2. Add state for earning amount and submission requirements
const state_adds = `
  const [importEarningAmount, setImportEarningAmount] = useState<number | ''>(5);
  const [importSubmissionRequirements, setImportSubmissionRequirements] = useState<SubmissionRequirement[]>([]);
`;
content = content.replace(/(const \[importSubmissionTypes, setImportSubmissionTypes\] = useState<string\[\]>\(\['video', 'pdf'\]\);\n)/g, state_adds + "\n$1");

// 3. Remove old checkboxes UI and add new UI
const old_ui_regex = /<div className="space-y-3 pt-3 border-t">[\s\S]*?<\/div>\s*<\/div>/;
const new_ui = `
                    <div className="space-y-3 pt-3 border-t">
                      <div className="flex justify-between items-center">
                        <Label className="text-sm font-bold flex items-center gap-2">
                          <CheckCircle2 className="h-4 w-4 text-primary" />
                          Required Submission Types (Applied to all imported tasks)
                        </Label>
                        <Button 
                          type="button" 
                          variant="outline" 
                          size="sm"
                          className="h-8 text-xs"
                          onClick={() => {
                            const newReq: SubmissionRequirement = {
                              id: Math.random().toString(36).substr(2, 9),
                              title: '',
                              type: 'pdf'
                            };
                            setImportSubmissionRequirements([...importSubmissionRequirements, newReq]);
                          }}
                        >
                          + Add Requirement
                        </Button>
                      </div>
                      
                      {importSubmissionRequirements.length === 0 ? (
                        <div className="text-sm text-red-500 font-medium">At least one submission requirement is mandatory. Add a requirement.</div>
                      ) : (
                        <div className="space-y-3">
                          {importSubmissionRequirements.map((req, index) => (
                            <div key={req.id} className="flex gap-2 items-start border p-3 rounded-md bg-gray-50">
                              <div className="flex-1 space-y-2">
                                <div>
                                  <Label className="text-xs">Requirement Title *</Label>
                                  <Input 
                                    placeholder="e.g., Presentation PPT" 
                                    value={req.title}
                                    onChange={(e) => {
                                      const updated = [...importSubmissionRequirements];
                                      updated[index].title = e.target.value;
                                      setImportSubmissionRequirements(updated);
                                    }}
                                  />
                                </div>
                              </div>
                              <div className="w-48 space-y-2">
                                <Label className="text-xs">File Type</Label>
                                <select 
                                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                                  value={req.type}
                                  onChange={(e) => {
                                    const updated = [...importSubmissionRequirements];
                                    updated[index].type = e.target.value as SubmissionRequirement['type'];
                                    setImportSubmissionRequirements(updated);
                                  }}
                                >
                                  <option value="video">Video</option>
                                  <option value="pdf">Pdf</option>
                                  <option value="doc">Doc</option>
                                  <option value="ppt">Ppt</option>
                                  <option value="excel">Excel</option>
                                  <option value="image">Image</option>
                                  <option value="code">Code</option>
                                  <option value="link">Link</option>
                                </select>
                              </div>
                              <div className="space-y-2 flex flex-col justify-end h-full mt-6">
                                <Button
                                  type="button"
                                  variant="destructive"
                                  size="icon"
                                  onClick={() => {
                                    const updated = importSubmissionRequirements.filter((_, i) => i !== index);
                                    setImportSubmissionRequirements(updated);
                                  }}
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    
                    <div className="space-y-1.5 pt-3 border-t">
                      <Label>Reward Points (Earning Amount)</Label>
                      <Input
                        type="number"
                        min="0"
                        value={importEarningAmount}
                        onChange={e => setImportEarningAmount(e.target.value ? Number(e.target.value) : '')}
                        placeholder="e.g., 5"
                      />
                    </div>
`;
content = content.replace(old_ui_regex, new_ui);

// 4. Update encode string in handleConfirmImport
// Need to stringify the submission requirements to pass it in description safely.
// And earning amount
const encode_logic = "description: t.description + (importSubmissionRequirements.length > 0 ? `\\n\\n__REQS[${encodeURIComponent(JSON.stringify(importSubmissionRequirements))}]__\\n\\n__TYPE[${importTaskType}]__\\n\\n__YEAR[${importAcademicYear}]__\\n\\n__SESSION[${importSessionId}]__\\n\\n__EARNING[${importEarningAmount}]__` : '')";
content = content.replace(/description: t\.description \+ \(importSubmissionTypes.*?''\)/g, encode_logic);

// Also need to add validation before import
const validation = `
      if (importSubmissionRequirements.length === 0) {
        toast.error('Please add at least one submission requirement');
        return;
      }
      if (importSubmissionRequirements.some(req => !req.title.trim())) {
        toast.error('All submission requirements must have a title');
        return;
      }
`;
content = content.replace(/(const handleConfirmImport = async \(\) => {\n      if \(previewTasks.length === 0\) return;\n)/g, "$1" + validation);

// 5. Update decode logic in handlePublishNow
const decode_logic = `
      let finalDesc = task.description;
      let finalReqs = ['video', 'pdf']; // fallback
      let finalType = 'general';
      let finalYear = task.academic_year || selectedYear;
      let finalSessionId = null;
      let finalEarningAmount = 5;
      
      const reqMatch = finalDesc.match(/__REQS\\[(.*?)\\]__/);
      if (reqMatch) { 
        try { 
          const decodedReqs = JSON.parse(decodeURIComponent(reqMatch[1]));
          finalReqs = serializeSubmissionRequirements(decodedReqs);
        } catch(e) {}
        finalDesc = finalDesc.replace(reqMatch[0], ''); 
      } else {
        // Fallback to old format
        const oldReqMatch = finalDesc.match(/__REQ\\[(.*?)\\]__/);
        if (oldReqMatch) { finalReqs = oldReqMatch[1] ? oldReqMatch[1].split(',') : []; finalDesc = finalDesc.replace(oldReqMatch[0], ''); }
      }
      
      const typeMatch = finalDesc.match(/__TYPE\\[(.*?)\\]__/);
      if (typeMatch) { finalType = typeMatch[1]; finalDesc = finalDesc.replace(typeMatch[0], ''); }
      
      const yearMatch = finalDesc.match(/__YEAR\\[(.*?)\\]__/);
      if (yearMatch) { finalYear = yearMatch[1]; finalDesc = finalDesc.replace(yearMatch[0], ''); }
      
      const sessionMatch = finalDesc.match(/__SESSION\\[(.*?)\\]__/);
      if (sessionMatch) { finalSessionId = sessionMatch[1] === 'none' ? null : sessionMatch[1]; finalDesc = finalDesc.replace(sessionMatch[0], ''); }
      
      const earningMatch = finalDesc.match(/__EARNING\\[(.*?)\\]__/);
      if (earningMatch) { finalEarningAmount = Number(earningMatch[1]) || 5; finalDesc = finalDesc.replace(earningMatch[0], ''); }
      
      finalDesc = finalDesc.trim();
`;
content = content.replace(/let finalDesc = task\.description;[\s\S]*?finalDesc = finalDesc\.trim\(\);/m, decode_logic.trim());

// 6. Update student_task_feedback insert object to include earning_amount
content = content.replace(/status: 'pending',/g, "earning_amount: finalEarningAmount,\n          status: 'pending',");

// 7. Update earning amount when Task Type changes
const task_type_change = `
                          <Select value={importTaskType} onValueChange={(val) => {
                            setImportTaskType(val);
                            const config = rewardConfigs.find(c => c.task_type === val);
                            if (config && config.rate_per_task) setImportEarningAmount(config.rate_per_task);
                          }}>
`;
content = content.replace(/<Select value=\{importTaskType\} onValueChange=\{setImportTaskType\}>/g, task_type_change);

// Make rewardConfigs fetch rate_per_task as well
content = content.replace(/select\('task_type'\)/g, "select('task_type, rate_per_task')");
content = content.replace(/<{task_type: string}\[\]>/g, "<{task_type: string, rate_per_task: number}[]>");

fs.writeFileSync('src/pages/ScheduledTasks.tsx', content);
console.log('Refactored requirements and points in ScheduledTasks.tsx!');
