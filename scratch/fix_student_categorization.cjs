const fs = require('fs');
let content = fs.readFileSync('src/pages/StudentEarnings.tsx', 'utf-8');

const replacement = `      // First try to find a match using ONLY the task name (high confidence)
      let matchIndex = breakdown.findIndex(config => {
        const taskTypeLower = (config.task_type || '').toLowerCase();

        if (taskTypeLower.includes('attendance') && taskName.includes('attendance')) return true;
        if ((taskTypeLower.includes('ccc') || taskTypeLower.includes('computer')) && (taskName.includes('ccc') || taskName.includes('computer'))) return true;
        if ((taskTypeLower.includes('english') || taskTypeLower.includes('reading') || taskTypeLower.includes('speaking')) && (taskName.includes('english') || taskName.includes('reading'))) return true;
        if (taskTypeLower.includes('mentor') && taskName.includes('mentor')) return true;
        
        if (taskTypeLower.includes('gt') || taskTypeLower.includes('guest teacher') || taskTypeLower.includes('session')) {
          if (taskName.includes('gt') || taskName.includes('guest teacher')) return true;
          if (taskName.includes('session') && !taskName.includes('mentor') && !taskName.includes('english')) return true;
        }
        
        return false;
      });

      // If no match found by task name, fallback to description & subject (lower confidence)
      if (matchIndex === -1) {
        matchIndex = breakdown.findIndex(config => {
          const taskTypeLower = (config.task_type || '').toLowerCase();

          if (taskTypeLower.includes('attendance') && desc.includes('attendance')) return true;
          if ((taskTypeLower.includes('ccc') || taskTypeLower.includes('computer')) && (desc.includes('ccc') || desc.includes('computer') || subj.includes('ccc') || subj.includes('computer'))) return true;
          if ((taskTypeLower.includes('english') || taskTypeLower.includes('reading') || taskTypeLower.includes('speaking')) && (desc.includes('english') || desc.includes('reading') || subj.includes('english'))) return true;
          if (taskTypeLower.includes('mentor') && desc.includes('mentor')) return true;
          
          if (taskTypeLower.includes('gt') || taskTypeLower.includes('guest teacher') || taskTypeLower.includes('session')) {
            if (desc.includes('gt') || desc.includes('guest teacher')) return true;
            if (desc.includes('session') && !desc.includes('mentor') && !desc.includes('english')) return true;
          }
          
          return false;
        });
      }`;

const searchRegex = /\/\/ Find the first config that matches the record[\s\S]*?return false;\n      \}\);/g;

if (content.match(searchRegex)) {
  content = content.replace(searchRegex, replacement);
  fs.writeFileSync('src/pages/StudentEarnings.tsx', content);
  console.log("Successfully updated categorization logic to 2-pass.");
} else {
  console.log("Could not find the target string.");
}
