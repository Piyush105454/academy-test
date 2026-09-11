const fs = require('fs');

let content = fs.readFileSync('src/pages/StudentEarnings.tsx', 'utf-8');

const regex = /const categoryBreakdown = useMemo\(\(\) => \{[\s\S]*?return breakdown;\n  \}, \[validEarnings, rewardConfigs\]\);/;

const newLogic = `const categoryBreakdown = useMemo(() => {
    const configsToUse = rewardConfigs.length > 0 ? rewardConfigs : DEFAULT_EARNING_POTENTIAL;
    
    // Initialize breakdown buckets
    const breakdown = configsToUse.map(config => ({
      ...config,
      earnedAmount: 0,
      completedCount: 0,
    }));

    let otherEarned = 0;
    let otherCount = 0;

    validEarnings.forEach(r => {
      const taskName = (r.task_name || '').toLowerCase();
      const desc = (r.description || '').toLowerCase();
      const subj = (r.subject_name || '').toLowerCase();

      // Find the first config that matches the record
      const matchIndex = breakdown.findIndex(config => {
        const taskTypeLower = (config.task_type || '').toLowerCase();

        // 1. Attendance Match
        if (taskTypeLower.includes('attendance')) {
          if (desc.includes('attendance') || taskName.includes('attendance')) return true;
        } 
        
        // 2. CCC / Computer Match
        if (taskTypeLower.includes('ccc') || taskTypeLower.includes('computer')) {
          if (desc.includes('ccc') || desc.includes('computer') || taskName.includes('ccc') || taskName.includes('computer') || subj.includes('ccc') || subj.includes('computer')) {
            return true;
          }
        } 
        
        // 3. English Match
        if (taskTypeLower.includes('english') || taskTypeLower.includes('reading') || taskTypeLower.includes('speaking')) {
          if (desc.includes('english') || desc.includes('reading') || taskName.includes('english') || taskName.includes('reading') || subj.includes('english')) {
            return true;
          }
        } 
        
        // 4. Mentor Match
        if (taskTypeLower.includes('mentor')) {
          if (desc.includes('mentor') || taskName.includes('mentor')) {
            return true;
          }
        }

        // 5. GT / Session Match
        if (taskTypeLower.includes('gt') || taskTypeLower.includes('guest teacher') || taskTypeLower.includes('session')) {
          if (desc.includes('gt') || desc.includes('guest teacher') || taskName.includes('gt') || taskName.includes('guest teacher')) {
            return true;
          }
          // Generic session keyword
          if (desc.includes('session') || taskName.includes('session')) {
            // Prevent "English Session" or "Mentorship Session" from matching GT just because it has "session"
            if (!desc.includes('mentor') && !taskName.includes('mentor') && !desc.includes('english') && !taskName.includes('english')) {
              return true;
            }
          }
        }
        
        return false;
      });

      if (matchIndex >= 0) {
        breakdown[matchIndex].earnedAmount += r.amount;
        breakdown[matchIndex].completedCount += 1;
      } else {
        otherEarned += r.amount;
        otherCount += 1;
      }
    });

    if (otherCount > 0) {
      breakdown.push({
        id: 'other',
        task_type: 'Other / Custom Earning Rewards',
        expected_tasks: 0,
        frequency: 'Custom',
        rate_per_task: 0,
        potential_monthly: 0,
        how_to_earn: 'Additional custom or bonus rewards assigned directly',
        earnedAmount: otherEarned,
        completedCount: otherCount,
      });
    }

    return breakdown;
  }, [validEarnings, rewardConfigs]);`;

if (content.match(regex)) {
  content = content.replace(regex, newLogic);
  fs.writeFileSync('src/pages/StudentEarnings.tsx', content);
  console.log("Replaced categoryBreakdown logic successfully.");
} else {
  console.log("Could not match regex.");
}
