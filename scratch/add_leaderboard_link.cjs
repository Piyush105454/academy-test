const fs = require('fs');
let content = fs.readFileSync('src/components/dashboard/TargetSessionsWidget.tsx', 'utf-8');

// 1. Import Link from react-router-dom
content = content.replace(
  /import \{ Progress \} from '@\/components\/ui\/progress';/,
  "import { Progress } from '@/components/ui/progress';\nimport { Link } from 'react-router-dom';\nimport { ExternalLink } from 'lucide-react';"
);

// 2. Add "View Leaderboard" link at the bottom of CardContent
content = content.replace(
  /<\/CardContent>/,
  `  <div className="pt-2 mt-1 border-t border-border flex justify-end">
          <Link to="/leaderboard" className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 flex items-center gap-1 transition-colors">
            View detailed leaderboard <ExternalLink className="h-3 w-3" />
          </Link>
        </div>
      </CardContent>`
);

fs.writeFileSync('src/components/dashboard/TargetSessionsWidget.tsx', content);
