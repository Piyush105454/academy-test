import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { Crown } from 'lucide-react';
import { startOfMonth, endOfMonth, format } from 'date-fns';
import { Progress } from '@/components/ui/progress';
import { Link } from 'react-router-dom';
import { ExternalLink } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface FacilitatorPerformance {
  id: string;
  name: string;
  planned: number;
  actual: number;
}

export function MonthlyLeaderboardWidget() {
  const [globalTarget, setGlobalTarget] = useState<number>(0);
  const [totalSessions, setTotalSessions] = useState<number>(0);
  const [facilitators, setFacilitators] = useState<FacilitatorPerformance[]>([]);
  const [loading, setLoading] = useState(true);

  const currentMonthStr = format(new Date(), 'yyyy-MM');

  useEffect(() => {
    fetchData();
  }, [currentMonthStr]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const now = new Date();
      const monthStart = startOfMonth(now).toISOString();
      const monthEnd = endOfMonth(now).toISOString();

      // 1. Fetch Global Target
      const { data: targetData } = await supabase
        .from('monthly_targets')
        .select('target_sessions')
        .eq('month', currentMonthStr)
        .maybeSingle();
      
      setGlobalTarget(targetData?.target_sessions || 0);

      // 2. Fetch Sessions for this month
      const { data: sessions, error: sessionsError } = await supabase
        .from('sessions')
        .select('id, facilitator_name')
        .gte('session_date', monthStart)
        .lte('session_date', monthEnd)
        .neq('status', 'cancelled');
      
      if (!sessionsError && sessions) {
        setTotalSessions(sessions.length);
      }

      // 3. Fetch Facilitators
      const { data: facs } = await supabase
        .from('facilitators')
        .select('id, name');

      // 4. Fetch Facilitator Targets
      let facTargets: Record<string, number> = {};
      try {
        const { data: targets } = await supabase
          .from('facilitator_targets')
          .select('facilitator_id, target_sessions')
          .eq('month', currentMonthStr);
        
        if (targets) {
          targets.forEach(t => facTargets[t.facilitator_id] = t.target_sessions || 0);
        }
      } catch (e) {
        // ignore
      }

      // 5. Compute actuals per facilitator
      const actuals: Record<string, number> = {};
      sessions?.forEach(s => {
        if (s.facilitator_name) {
          actuals[s.facilitator_name.trim().toLowerCase()] = (actuals[s.facilitator_name.trim().toLowerCase()] || 0) + 1;
        }
      });

      // 6. Build final array
      if (facs) {
        const perfData = facs.map(f => {
          const actual = actuals[f.name.trim().toLowerCase()] || 0;
          return {
            id: f.id,
            name: f.name,
            planned: facTargets[f.id] || 0,
            actual,
          };
        }).sort((a, b) => b.actual - a.actual);
        setFacilitators(perfData);
      }

    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const progressPercentage = globalTarget > 0 ? Math.min(100, Math.round((totalSessions / globalTarget) * 100)) : 0;

  return (
    <Card className="flex flex-col border border-border/50 shadow-sm transition-all hover:shadow-md">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div className="space-y-1">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <Crown className="h-4 w-4 text-indigo-500" />
            Monthly Leaderboard
          </CardTitle>
          <div className="flex items-baseline gap-2">
            <h2 className="text-3xl font-bold tracking-tight text-foreground">
              {totalSessions}
            </h2>
            <span className="text-sm font-medium text-muted-foreground">
              / {globalTarget || '-'}
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 mt-2">
        <div className="space-y-2">
          <div className="flex justify-between text-xs">
            {globalTarget > 0 ? <span className="font-medium">{progressPercentage}% Achieved</span> : <span className="font-medium text-muted-foreground">-</span>}
            <span className="text-muted-foreground">
              {globalTarget === 0 ? 'Target not set' : globalTarget > totalSessions ? `${globalTarget - totalSessions} remaining` : 'Target met!'}
            </span>
          </div>
          <Progress value={progressPercentage} className="h-2" />
        </div>

        <div className="pt-2 border-t border-border">
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
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full w-6 text-center ${variance >= 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
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
        </div>

        <div className="pt-2 mt-1 border-t border-border flex justify-end">
          <Link to="/leaderboard" className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 flex items-center gap-1 transition-colors">
            Full Leaderboard <ExternalLink className="h-3 w-3" />
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}