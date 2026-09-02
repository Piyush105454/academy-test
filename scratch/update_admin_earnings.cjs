const fs = require('fs');
let content = fs.readFileSync('src/pages/AdminStudentEarnings.tsx', 'utf-8');

// 1. Add class_id to RewardConfig
content = content.replace(
  /interface RewardConfig \{/,
  'interface RewardConfig {\n  class_id?: string | null;'
);

// 2. Add selectedModalClass state
content = content.replace(
  /const \[isEditingConfigs, setIsEditingConfigs\] = useState\(false\);/,
  'const [isEditingConfigs, setIsEditingConfigs] = useState(false);\n  const [selectedModalClass, setSelectedModalClass] = useState<string>(\'all\');'
);

// 3. Update fetchRewardConfigs
const fetchNew = `const fetchRewardConfigs = async (classId?: string) => {
    try {
      let query = supabase.from('reward_configurations').select('*');
      
      if (classId && classId !== 'all') {
        query = query.eq('class_id', classId);
      } else {
        query = query.is('class_id', null);
      }
      
      const { data, error } = await query.order('task_type');`;

content = content.replace(
  /const fetchRewardConfigs = async \(\) => \{\n\s*try \{\n\s*const \{ data, error \} = await supabase\n\s*\.from\('reward_configurations'\)\n\s*\.select\('\*'\)\n\s*\.order\('task_type'\);/,
  fetchNew
);

// 4. Update handleSaveConfigs
const handleSaveNew = `const handleSaveConfigs = async () => {
    try {
      setLoading(true);
      const updates = editingConfigs.map(c => ({
        ...c,
        class_id: selectedModalClass !== 'all' ? selectedModalClass : null,
        potential_monthly: c.expected_tasks * c.rate_per_task
      }));`;

content = content.replace(
  /const handleSaveConfigs = async \(\) => \{\n\s*try \{\n\s*setLoading\(true\);\n\s*const updates = editingConfigs\.map\(c => \(\{\n\s*\.\.\.c,\n\s*potential_monthly: c\.expected_tasks \* c\.rate_per_task\n\s*\}\)\);/,
  handleSaveNew
);

content = content.replace(
  /fetchRewardConfigs\(\);/g,
  'fetchRewardConfigs(selectedModalClass !== "all" ? selectedModalClass : undefined);'
);

// 5. Add Effect
content = content.replace(
  /const fetchSubjects = async \(\)/,
  `useEffect(() => {
    if (isPotentialModalOpen) {
      fetchRewardConfigs(selectedModalClass !== 'all' ? selectedModalClass : undefined);
    }
  }, [selectedModalClass, isPotentialModalOpen]);\n\n  const fetchSubjects = async ()`
);

// 6. Update the UI Modal (DialogContent)
const dialogHeaderRegex = /<DialogDescription>\s*Configure how much students can earn for each task type\s*<\/DialogDescription>\s*<\/div>/;
const dialogHeaderNew = `<DialogDescription>
                      Configure how much students can earn for each task type
                    </DialogDescription>
                    <div className="mt-4 flex items-center gap-2">
                      <span className="text-sm font-medium">Configuration for Class:</span>
                      <Select value={selectedModalClass} onValueChange={setSelectedModalClass} disabled={isEditingConfigs}>
                        <SelectTrigger className="w-[200px]">
                          <SelectValue placeholder="Global Default" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Global Default</SelectItem>
                          {classes.map(cls => (
                            <SelectItem key={cls.id} value={cls.id}>{cls.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>`;

content = content.replace(dialogHeaderRegex, dialogHeaderNew);

fs.writeFileSync('src/pages/AdminStudentEarnings.tsx', content);
console.log('AdminStudentEarnings.tsx updated');
