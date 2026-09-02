const fs = require('fs');
let content = fs.readFileSync('src/components/dashboard/TargetSessionsWidget.tsx', 'utf-8');

// Fix text logic
content = content.replace(
  /\{target > totalSessions \? `\$\{target - totalSessions\} remaining` : 'Target met!'\}/,
  "{target === 0 ? 'Target not set' : target > totalSessions ? `${target - totalSessions} remaining` : 'Target met!'}"
);

// Fix percentage text logic so it doesn't say 0% Achieved if target is not set
content = content.replace(
  /<span className="font-medium">\{progressPercentage\}% Achieved<\/span>/,
  "{target > 0 ? <span className=\"font-medium\">{progressPercentage}% Achieved</span> : <span className=\"font-medium text-muted-foreground\">-</span>}"
);

fs.writeFileSync('src/components/dashboard/TargetSessionsWidget.tsx', content);
