const fs = require('fs');
let content = fs.readFileSync('src/components/dashboard/TargetSessionsWidget.tsx', 'utf-8');

// Replace the custom button and modal with MonthTargetDialog natively placed.
// Actually, I want a custom button "Edit target". I'll just write an inline dialog inside TargetSessionsWidget.

content = content.replace(
  /<Button onClick=\{\(\) => setIsGlobalTargetOpen\(true\)\} className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-full gap-2">[\s\S]*?<\/Button>/,
  `<Button onClick={() => setIsGlobalTargetOpen(true)} className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-full gap-2">
            <Edit className="h-4 w-4" /> Edit target
          </Button>`
);

content = content.replace(
  /\{\/\* Global Target Modal \*\/\}[\s\S]*?\{\/\* Facilitator Target Modal \*\/\}/,
  `{/* Global Target Modal */}
      <Dialog open={isGlobalTargetOpen} onOpenChange={(open) => {
        setIsGlobalTargetOpen(open);
        if (!open) fetchData();
      }}>
        <DialogContent className="sm:max-w-[425px]">
          <div className="p-4">
            <MonthTargetDialog />
            <p className="text-xs text-muted-foreground mt-4 text-center">Click the button above to set the target. Close this when done.</p>
          </div>
        </DialogContent>
      </Dialog>

      {/* Facilitator Target Modal */}`
);

fs.writeFileSync('src/components/dashboard/TargetSessionsWidget.tsx', content);
