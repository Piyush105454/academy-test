import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { Crown, ExternalLink, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { startOfMonth, endOfMonth, format } from 'date-fns';
import { Progress } from '@/components/ui/progress';
import { Link } from 'react-router-dom';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface ItemPerformance {
  id: string;
  name: string;
  planned: number;
  actual: number;
}

interface MonthlyLeaderboardWidgetProps {
  startDate: Date | null;
  endDate: Date | null;
}

export function MonthlyLeaderboardWidget({ startDate, endDate }: MonthlyLeaderboardWidgetProps) {
  const [globalTarget, setGlobalTarget] = useState<number>(0);
  const [totalSessions, setTotalSessions] = useState<number>(0);
  const [facilitators, setFacilitators] = useState<ItemPerformance[]>([]);
  const [classes, setClasses] = useState<ItemPerformance[]>([]);
  const [categories, setCategories] = useState<ItemPerformance[]>([]);
  const [activeTab, setActiveTab] = useState<'facilitator' | 'class' | 'category'>('facilitator');
  const [loading, setLoading] = useState(true);
  const [isExpanded, setIsExpanded] = useState(false);

  // Use the month from the provided startDate
  const currentMonthStr = startDate ? format(startDate, 'yyyy-MM') : format(new Date(), 'yyyy-MM');

  useEffect(() => {
    fetchData();
  }, [currentMonthStr]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const referenceDate = startDate || new Date();
      const monthStart = startOfMonth(referenceDate).toISOString();
      const monthEnd = endOfMonth(referenceDate).toISOString();

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
        .select('id, facilitator_name, class_batch, session_type')
        .gte('session_date', monthStart.split('T')[0])
        .lte('session_date', monthEnd.split('T')[0])
        .neq('status', 'cancelled');
      
      if (!sessionsError && sessions) {
        setTotalSessions(sessions.length);
      }

      // 3. Fetch Targets & Lists in parallel
      const [
        { data: facs },
        { data: classesData },
        { data: facTargetsData },
        { data: classTargetsData },
        { data: catTargetsData },
      ] = await Promise.all([
        supabase.from('facilitators').select('id, name').order('name'),
        supabase.from('classes').select('name').neq('name', '__SYSTEM_DEV_MODE__').order('name'),
        supabase.from('facilitator_targets').select('facilitator_id, target_sessions').eq('month', currentMonthStr),
        supabase.from('class_targets').select('class_name, target_sessions').eq('month', currentMonthStr),
        supabase.from('category_targets').select('category_name, target_sessions').eq('month', currentMonthStr),
      ]);

      const facTargets: Record<string, number> = {};
      facTargetsData?.forEach((t: any) => { facTargets[t.facilitator_id] = t.target_sessions || 0; });

      const classTargets: Record<string, number> = {};
      classTargetsData?.forEach((t: any) => { classTargets[t.class_name] = t.target_sessions || 0; });

      const catTargets: Record<string, number> = {};
      catTargetsData?.forEach((t: any) => { catTargets[t.category_name] = t.target_sessions || 0; });

      // 4. Compute actuals
      const facActuals: Record<string, number> = {};
      const classActuals: Record<string, number> = {};
      const catActuals: Record<string, number> = {
        'Guest Teacher (GT)': 0,
        'Guest Speaker (GS)': 0,
        'Local Teacher (LT)': 0,
      };

      sessions?.forEach(s => {
        if (s.facilitator_name) {
          const fn = s.facilitator_name.trim().toLowerCase();
          facActuals[fn] = (facActuals[fn] || 0) + 1;
        }
        if (s.class_batch) {
          const cb = s.class_batch.trim();
          classActuals[cb] = (classActuals[cb] || 0) + 1;
        }
        if (s.session_type) {
          if (s.session_type === 'guest_teacher') catActuals['Guest Teacher (GT)'] = (catActuals['Guest Teacher (GT)'] || 0) + 1;
          else if (s.session_type === 'guest_speaker') catActuals['Guest Speaker (GS)'] = (catActuals['Guest Speaker (GS)'] || 0) + 1;
          else if (s.session_type === 'local_teacher') catActuals['Local Teacher (LT)'] = (catActuals['Local Teacher (LT)'] || 0) + 1;
        }
      });

      // 5. Build Facilitator array
      if (facs) {
        const facPerf = facs.map(f => ({
          id: f.id,
          name: f.name,
          planned: facTargets[f.id] || 0,
          actual: facActuals[f.name.trim().toLowerCase()] || 0,
        })).sort((a, b) => b.actual - a.actual || b.planned - a.planned);
        setFacilitators(facPerf);
      }

      // 6. Build Class array
      const classSet = new Set<string>();
      classesData?.forEach(c => classSet.add(c.name));
      Object.keys(classActuals).forEach(c => classSet.add(c));
      Object.keys(classTargets).forEach(c => classSet.add(c));

      const classPerf: ItemPerformance[] = Array.from(classSet).map(cName => ({
        id: cName,
        name: cName,
        planned: classTargets[cName] || 0,
        actual: classActuals[cName] || 0,
      })).sort((a, b) => b.actual - a.actual || b.planned - a.planned);
      setClasses(classPerf);

      // 7. Build Category array
      const standardCats = ['Guest Teacher (GT)', 'Guest Speaker (GS)', 'Local Teacher (LT)'];
      const catPerf: ItemPerformance[] = standardCats.map(cat => ({
        id: cat,
        name: cat,
        planned: catTargets[cat] || catTargets[cat.split(' ')[0]] || 0,
        actual: catActuals[cat] || 0,
      })).sort((a, b) => b.actual - a.actual || b.planned - a.planned);
      setCategories(catPerf);

    } catch (e) {
      console.error('Error fetching monthly leaderboard widget data:', e);
    } finally {
      setLoading(false);
    }
  };

  const progressPercentage = globalTarget > 0 ? Math.min(100, Math.round((totalSessions / globalTarget) * 100)) : 0;
  const achievementRate = globalTarget > 0 ? ((totalSessions / globalTarget) * 100).toFixed(1) : '0.0';

  // Get active list
  const currentList = activeTab === 'facilitator' ? facilitators : activeTab === 'class' ? classes : categories;
  const headerLabel = activeTab === 'facilitator' ? 'FACILITATOR' : activeTab === 'class' ? 'CLASS' : 'CATEGORY';

  const currentTotalPlanned = currentList.reduce((sum, item) => sum + (item.planned || 0), 0);
  const currentTotalActual = currentList.reduce((sum, item) => sum + (item.actual || 0), 0);
  const currentVariance = currentTotalActual - currentTotalPlanned;
  const currentTotalAch = currentTotalPlanned > 0 ? Math.round((currentTotalActual / currentTotalPlanned) * 100) : (currentTotalActual > 0 ? 100 : 0);

  // Pagination / slice for See More / See Less
  const displayedList = isExpanded ? currentList : currentList.slice(0, 5);

  return (
    <Card className="col-span-1 border-slate-200 shadow-sm flex flex-col h-full bg-slate-50 overflow-hidden font-sans">
      {/* Header section matching Attendance Widget */}
      <div className="p-3 bg-slate-100 border-b flex flex-col gap-2">
        <h3 className="text-center font-bold text-slate-800 text-sm tracking-wide uppercase flex items-center justify-center gap-1.5">
          <Crown className="w-4 h-4 text-indigo-600" />
          MONTHLY TARGET BOARD
        </h3>
        
        {/* Tabs & Summary Banner */}
        <div className="flex items-center justify-between bg-white rounded-md p-1.5 shadow-sm border border-slate-200 gap-2">
          {/* Tab Navigation moved here */}
          <Tabs value={activeTab} onValueChange={(val: any) => setActiveTab(val)} className="flex-1 min-w-0">
            <TabsList className="grid w-full grid-cols-3 h-7 bg-slate-200/80 p-0.5 rounded-md">
              <TabsTrigger value="facilitator" className="text-[10px] sm:text-xs font-semibold py-0.5 px-1 data-[state=active]:bg-white data-[state=active]:text-slate-800 data-[state=active]:shadow-sm">
                Facil.
              </TabsTrigger>
              <TabsTrigger value="class" className="text-[10px] sm:text-xs font-semibold py-0.5 px-1 data-[state=active]:bg-white data-[state=active]:text-slate-800 data-[state=active]:shadow-sm">
                Class
              </TabsTrigger>
              <TabsTrigger value="category" className="text-[10px] sm:text-xs font-semibold py-0.5 px-1 data-[state=active]:bg-white data-[state=active]:text-slate-800 data-[state=active]:shadow-sm">
                Categ.
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="flex items-center gap-2 pr-1 shrink-0">
            <span className="font-bold text-emerald-600 text-sm sm:text-base whitespace-nowrap">
              {totalSessions} <span className="text-[10px] sm:text-xs text-slate-400 font-normal">/ {globalTarget || 0}</span>
            </span>
            <span className="font-bold text-indigo-600 text-sm sm:text-base whitespace-nowrap">{achievementRate}%</span>
          </div>
        </div>

        {/* Progress Bar & Remaining */}
        <div className="space-y-1">
          <div className="flex justify-between text-[11px] text-slate-500 font-medium">
            <span>{achievementRate}% Achieved</span>
            <span>
              {globalTarget === 0 ? 'Target not set' : globalTarget > totalSessions ? `${globalTarget - totalSessions} remaining` : 'Target met!'}
            </span>
          </div>
          <Progress value={progressPercentage} className="h-1.5 bg-slate-200" indicatorColor="bg-indigo-600" />
        </div>
      </div>

      {/* Table Content matching Attendance Card styling */}
      <div className={`flex-1 ${isExpanded ? 'max-h-[300px]' : ''} overflow-auto p-0 bg-white`}>
        {loading ? (
          <div className="flex justify-center items-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-white shadow-sm z-10">
              <tr className="border-b bg-slate-100 text-slate-700 font-bold text-[10px] sm:text-xs">
                <td className="p-2 py-1.5 text-left uppercase">ALL TOTAL</td>
                <td className="p-2 py-1.5 text-center text-slate-600 font-bold">{currentTotalPlanned}</td>
                <td className="p-2 py-1.5 text-center text-emerald-600 font-bold">{currentTotalActual}</td>
                <td className={`p-2 py-1.5 text-center font-bold ${currentVariance >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                  {currentVariance > 0 ? `+${currentVariance}` : currentVariance}
                </td>
                <td className="p-2 py-1.5 text-center text-indigo-600 font-bold">{currentTotalAch}%</td>
              </tr>
              <tr className="border-b bg-white text-[10px] sm:text-xs">
                <th className="p-2 text-left font-bold text-slate-500 uppercase tracking-wider">{headerLabel}</th>
                <th className="p-2 text-center font-bold text-slate-500">PLAN</th>
                <th className="p-2 text-center font-bold text-slate-500">ACT</th>
                <th className="p-2 text-center font-bold text-slate-500">+/-</th>
                <th className="p-2 text-center font-bold text-slate-500">%</th>
              </tr>
            </thead>
            <tbody className="bg-white">
              {displayedList.map((item, idx) => {
                const diff = item.actual - item.planned;
                const ach = item.planned > 0 ? Math.round((item.actual / item.planned) * 100) : (item.actual > 0 ? 100 : 0);
                return (
                  <tr key={item.id || idx} className="border-b last:border-0 hover:bg-slate-50 transition-colors">
                    <td className="p-2 font-semibold text-slate-700 truncate max-w-[130px]" title={item.name}>
                      {item.name}
                    </td>
                    <td className="p-2 text-center font-semibold text-slate-500">{item.planned}</td>
                    <td className="p-2 text-center font-semibold text-emerald-600">{item.actual}</td>
                    <td className={`p-2 text-center font-bold ${diff >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                      {diff > 0 ? `+${diff}` : diff}
                    </td>
                    <td className="p-2 text-center font-semibold text-indigo-600">{ach}%</td>
                  </tr>
                );
              })}
              {currentList.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center py-6 text-slate-400 italic">No data this month</td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Footer Link & See More/Less toggle */}
      <div className="p-2 px-3 bg-slate-50 border-t flex items-center justify-between">
        {currentList.length > 5 ? (
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-[11px] font-semibold text-slate-600 hover:text-indigo-600 flex items-center gap-1 transition-colors"
          >
            {isExpanded ? (
              <>
                <span>See Less</span>
                <ChevronUp className="h-3.5 w-3.5" />
              </>
            ) : (
              <>
                <span>See More ({currentList.length - 5})</span>
                <ChevronDown className="h-3.5 w-3.5" />
              </>
            )}
          </button>
        ) : (
          <div />
        )}

        <Link to="/leaderboard" className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 transition-colors">
          Full Leaderboard <ExternalLink className="h-3 w-3" />
        </Link>
      </div>
    </Card>
  );
}