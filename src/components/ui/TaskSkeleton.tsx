import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader } from '@/components/ui/card';

export function TaskSkeleton() {
  return (
    <div className="space-y-4 w-full animate-pulse">
      {/* Header Controls Skeleton */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 rounded-xl bg-card border border-border">
        <div className="h-10 w-full sm:w-72 bg-muted/60 rounded-lg" />
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="h-10 w-32 bg-muted/60 rounded-lg" />
          <div className="h-10 w-32 bg-muted/60 rounded-lg" />
        </div>
      </div>

      {/* Task Cards Grid Skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <Card key={i} className="border border-border">
            <CardHeader className="pb-2 space-y-2">
              <div className="flex justify-between items-start gap-2">
                <div className="h-5 w-3/4 bg-muted/60 rounded" />
                <div className="h-5 w-16 bg-muted/60 rounded-full" />
              </div>
              <div className="h-4 w-1/2 bg-muted/40 rounded" />
            </CardHeader>
            <CardContent className="space-y-3 pt-2">
              <div className="h-12 w-full bg-muted/30 rounded-lg" />
              <div className="flex justify-between items-center pt-2">
                <div className="h-4 w-24 bg-muted/40 rounded" />
                <div className="h-8 w-20 bg-muted/60 rounded-md" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

export function PageLoadingSkeleton() {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center p-8 space-y-4">
      <div className="h-10 w-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      <p className="text-sm font-medium text-muted-foreground animate-pulse">Loading page content...</p>
    </div>
  );
}
