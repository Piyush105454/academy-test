import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { Target, TrendingUp } from 'lucide-react';
import { startOfMonth, endOfMonth, format } from 'date-fns';
import { Progress } from '@/components/ui/progress';

export function TargetSessionsWidget() {
  const [target, setTarget] = useState<number>(0);
  const [totalSessions, setTotalSessions] = useState<number>(0);
  const [classWiseData, setClassWiseData] = useState<{ [key: string]: number }>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchTargetData();
  }, []);

  const fetchTargetData = async () => {
    try {
      setLoading(true);
      const now = new Date();
      const currentMonthStr = format(now, 'yyyy-MM');
      const monthStart = startOfMonth(now).toISOString();
      const monthEnd = endOfMonth(now).toISOString();

      // Fetch Target
      const { data: targetData } = await supabase
        .from('monthly_targets')
        .select('target_sessions')
        .eq('month', currentMonthStr)
        .maybeSingle();
      
      if (targetData) {
        setTarget(targetData.target_sessions || 0);
      } else {
        setTarget(0); // default
      }

      // Fetch Sessions for this month
      const { data: sessions, error } = await supabase
        .from('sessions')
        .select('id, class_batch')
        .gte('session_date', monthStart)
        .lte('session_date', monthEnd)
        .neq('status', 'cancelled');
      
      if (error) {
        console.error('Error fetching sessions for target widget:', error);
      } else if (sessions) {
        setTotalSessions(sessions.length);
        
        const counts: { [key: string]: number } = {};
        sessions.forEach(s => {
          const c = s.class_batch || 'Unassigned';
          counts[c] = (counts[c] || 0) + 1;
        });
        setClassWiseData(counts);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const progressPercentage = target > 0 ? Math.min(100, Math.round((totalSessions / target) * 100)) : 0;

  return (
    <Card className="flex flex-col border border-border/50 shadow-sm transition-all hover:shadow-md">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div className="space-y-1">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <Target className="h-4 w-4 text-indigo-500" />
            Monthly Session Target
          </CardTitle>
          <div className="flex items-baseline gap-2">
            <h2 className="text-3xl font-bold tracking-tight text-foreground">
              {totalSessions}
            </h2>
            <span className="text-sm font-medium text-muted-foreground">
              / {target || '-'}
            </span>
          </div>
        </div>
        <div className="rounded-full bg-indigo-50 dark:bg-indigo-950/50 p-2">
          <TrendingUp className="h-5 w-5 text-indigo-500" />
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 mt-2">
        <div className="space-y-2">
          <div className="flex justify-between text-xs">
            {target > 0 ? <span className="font-medium">{progressPercentage}% Achieved</span> : <span className="font-medium text-muted-foreground">-</span>}
            <span className="text-muted-foreground">
              {target === 0 ? 'Target not set' : target > totalSessions ? `${target - totalSessions} remaining` : 'Target met!'}
            </span>
          </div>
          <Progress value={progressPercentage} className="h-2" />
        </div>

        <div className="pt-2 border-t border-border space-y-3">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Class-wise Breakdown</h4>
          <div className="space-y-2 max-h-[120px] overflow-y-auto pr-2 scrollbar-thin">
            {Object.entries(classWiseData)
              .sort((a, b) => b[1] - a[1])
              .map(([className, count]) => (
              <div key={className} className="flex justify-between items-center text-sm">
                <span className="truncate max-w-[150px] font-medium">{className}</span>
                <span className="bg-muted px-2 py-0.5 rounded-full text-xs font-semibold">{count}</span>
              </div>
            ))}
            {Object.keys(classWiseData).length === 0 && !loading && (
              <div className="text-xs text-muted-foreground italic">No sessions this month.</div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
