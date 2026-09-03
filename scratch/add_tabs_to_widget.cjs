const fs = require('fs');
let content = fs.readFileSync('src/components/dashboard/MonthlyLeaderboardWidget.tsx', 'utf-8');

// Add Tabs import if missing (it's missing in the file)
if (!content.includes('Tabs, TabsContent')) {
  content = content.replace(
    /import \{ ExternalLink \} from \'lucide-react\';/,
    "import { ExternalLink } from 'lucide-react';\nimport { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';"
  );
}

// Replace the hardcoded Facilitator Variance section with a Tabs component
const oldSection = `        <div className="pt-2 border-t border-border space-y-3">
          <div className="flex justify-between items-center">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Facilitator Variance</h4>
          </div>
          <div className="space-y-2 max-h-[120px] overflow-y-auto pr-2 scrollbar-thin">
            {facilitators.filter(f => f.planned > 0 || f.actual > 0).slice(0, 10).map(f => {
              const variance = f.actual - f.planned;
              return (
                <div key={f.id} className="flex justify-between items-center text-sm">
                  <span className="truncate max-w-[130px] font-medium">{f.name}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">{f.actual}/{f.planned}</span>
                    <span className={\`text-[10px] font-bold px-1.5 py-0.5 rounded-full \${variance >= 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}\`}>
                      {variance > 0 ? '+' : ''}{variance}
                    </span>
                  </div>
                </div>
              );
            })}
            {facilitators.length === 0 && !loading && (
              <div className="text-xs text-muted-foreground italic">No data this month.</div>
            )}
          </div>
        </div>`;

const newSection = `        <div className="pt-2 border-t border-border">
          <Tabs defaultValue="facilitator" className="w-full">
            <TabsList className="grid w-full grid-cols-3 h-8 mb-2">
              <TabsTrigger value="facilitator" className="text-[10px] px-1">Facilitator</TabsTrigger>
              <TabsTrigger value="class" className="text-[10px] px-1">Class</TabsTrigger>
              <TabsTrigger value="category" className="text-[10px] px-1">Category</TabsTrigger>
            </TabsList>
            
            <TabsContent value="facilitator" className="mt-0">
              <div className="space-y-2 max-h-[120px] overflow-y-auto pr-2 scrollbar-thin mt-2">
                {facilitators.map(f => {
                  const variance = f.actual - f.planned;
                  return (
                    <div key={f.id} className="flex justify-between items-center text-sm">
                      <span className="truncate max-w-[120px] font-medium">{f.name}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-muted-foreground whitespace-nowrap">{f.actual}/{f.planned}</span>
                        <span className={\`text-[9px] font-bold px-1.5 py-0.5 rounded-full w-6 text-center \${variance >= 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}\`}>
                          {variance > 0 ? '+' : ''}{variance}
                        </span>
                      </div>
                    </div>
                  );
                })}
                {facilitators.length === 0 && !loading && (
                  <div className="text-xs text-muted-foreground italic">No data this month.</div>
                )}
              </div>
            </TabsContent>
            
            <TabsContent value="class" className="mt-0">
              <div className="flex items-center justify-center h-[100px]">
                <span className="text-xs text-muted-foreground">Class breakdown coming soon</span>
              </div>
            </TabsContent>
            
            <TabsContent value="category" className="mt-0">
              <div className="flex items-center justify-center h-[100px]">
                <span className="text-xs text-muted-foreground">Category breakdown coming soon</span>
              </div>
            </TabsContent>
          </Tabs>
        </div>`;

content = content.replace(oldSection, newSection);

fs.writeFileSync('src/components/dashboard/MonthlyLeaderboardWidget.tsx', content);
