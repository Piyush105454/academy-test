import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { Crown, Edit, Search } from 'lucide-react';
import { startOfMonth, endOfMonth, format } from 'date-fns';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { FacilitatorTargetDialog } from '@/components/dashboard/FacilitatorTargetDialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { DashboardLayout } from '@/components/layout/DashboardLayout';

interface FacilitatorPerformance {
  id: string;
  name: string;
  planned: number;
  actual: number;
}

export default function MonthlyLeaderboard() {
  const [globalTarget, setGlobalTarget] = useState<number>(0);
  const [totalSessions, setTotalSessions] = useState<number>(0);
  
  const [facilitators, setFacilitators] = useState<FacilitatorPerformance[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);

  const [isGlobalTargetOpen, setIsGlobalTargetOpen] = useState(false);
  const [editingGlobalTargetStr, setEditingGlobalTargetStr] = useState('');
  const [savingGlobal, setSavingGlobal] = useState(false);

  const [editingFacilitator, setEditingFacilitator] = useState<FacilitatorPerformance | null>(null);

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
      setEditingGlobalTargetStr((targetData?.target_sessions || 0).toString());

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
        console.warn('facilitator_targets table might be missing');
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

  const handleSaveGlobalTarget = async () => {
    try {
      setSavingGlobal(true);
      const val = parseInt(editingGlobalTargetStr, 10);
      if (isNaN(val) || val < 0) {
        toast.error('Please enter a valid number');
        return;
      }
      const { error } = await supabase
        .from('monthly_targets')
        .upsert(
          { month: currentMonthStr, target_sessions: val, updated_at: new Date().toISOString() },
          { onConflict: 'month' }
        );
      if (error) throw error;
      toast.success('Global target updated');
      setIsGlobalTargetOpen(false);
      fetchData();
    } catch (e) {
      toast.error('Failed to update target');
    } finally {
      setSavingGlobal(false);
    }
  };

  const variance = totalSessions - globalTarget;
  const achievement = globalTarget > 0 ? ((totalSessions / globalTarget) * 100).toFixed(1) : '0.0';
  const progressPercent = globalTarget > 0 ? Math.min(100, (totalSessions / globalTarget) * 100) : 0;

  const filteredFacilitators = facilitators.filter(f => f.name.toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <DashboardLayout>
      <div className="w-full space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 mb-8">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-card p-4 md:p-6 rounded-xl border border-border shadow-sm">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-indigo-100 dark:bg-indigo-900/50 rounded-xl text-indigo-600 dark:text-indigo-400">
            <Crown className="h-8 w-8" />
          </div>
          <div>
            <h2 className="text-xl md:text-2xl font-bold">Monthly Session Leaderboard</h2>
            <p className="text-sm text-muted-foreground mt-1">Planned versus actual session performance</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 font-medium px-4 py-2 rounded-full text-sm border border-indigo-100 dark:border-indigo-900">
            Monthly target: {globalTarget}
          </div>
          <Button onClick={() => setIsGlobalTargetOpen(true)} className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-full gap-2">
            <Edit className="h-4 w-4" /> Edit target
          </Button>
        </div>
      </div>

      {/* Main Content Area */}
      <Tabs defaultValue="facilitator" className="w-full">
        <div className="bg-muted/30 p-2 rounded-lg border border-border/50 mb-6 flex overflow-x-auto">
          <TabsList className="bg-transparent h-auto p-0 gap-2 w-full justify-start sm:justify-center">
            <TabsTrigger value="facilitator" className="px-8 py-2.5 rounded-md data-[state=active]:bg-background data-[state=active]:shadow-sm">Facilitator</TabsTrigger>
            <TabsTrigger value="class" className="px-8 py-2.5 rounded-md data-[state=active]:bg-background data-[state=active]:shadow-sm">Class</TabsTrigger>
            <TabsTrigger value="category" className="px-8 py-2.5 rounded-md data-[state=active]:bg-background data-[state=active]:shadow-sm">Session Category</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="facilitator" className="space-y-6 mt-0">
          
          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="shadow-sm">
              <CardContent className="p-5 flex flex-col justify-center h-full">
                <p className="text-[11px] font-bold text-muted-foreground tracking-wider uppercase mb-2">Monthly Planned</p>
                <h3 className="text-3xl font-bold">{globalTarget}</h3>
                <p className="text-xs text-muted-foreground mt-2">Target sessions</p>
              </CardContent>
            </Card>
            <Card className="shadow-sm">
              <CardContent className="p-5 flex flex-col justify-center h-full">
                <p className="text-[11px] font-bold text-muted-foreground tracking-wider uppercase mb-2">Actual</p>
                <h3 className="text-3xl font-bold">{totalSessions}</h3>
                <p className="text-xs text-muted-foreground mt-2">Sessions delivered</p>
              </CardContent>
            </Card>
            <Card className="shadow-sm">
              <CardContent className="p-5 flex flex-col justify-center h-full">
                <p className="text-[11px] font-bold text-muted-foreground tracking-wider uppercase mb-2">Variance</p>
                <h3 className={`text-3xl font-bold ${variance >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                  {variance > 0 ? '+' : ''}{variance}
                </h3>
                <p className="text-xs text-muted-foreground mt-2">Actual minus target</p>
              </CardContent>
            </Card>
            <Card className="shadow-sm">
              <CardContent className="p-5 flex flex-col justify-center h-full">
                <p className="text-[11px] font-bold text-muted-foreground tracking-wider uppercase mb-2">Achievement</p>
                <h3 className="text-3xl font-bold">{achievement}%</h3>
                <p className="text-xs text-muted-foreground mt-2">Of monthly target</p>
              </CardContent>
            </Card>
          </div>

          {/* Progress Bar */}
          <Card className="shadow-sm">
            <CardContent className="p-6">
              <div className="flex justify-between items-end mb-4">
                <h3 className="font-bold text-foreground">Overall monthly progress</h3>
                <span className="text-sm text-muted-foreground">{totalSessions} of {globalTarget} sessions</span>
              </div>
              <Progress value={progressPercent} className="h-3 bg-muted" indicatorColor="bg-indigo-500" />
            </CardContent>
          </Card>

          {/* Table */}
          <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
            <div className="p-4 border-b border-border flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <h3 className="font-bold text-lg">Facilitator performance</h3>
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search facilitator..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="pl-9 h-9"
                />
              </div>
            </div>
            
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-muted/50">
                  <TableRow>
                    <TableHead className="font-bold text-xs uppercase tracking-wider">Facilitator</TableHead>
                    <TableHead className="font-bold text-xs uppercase tracking-wider text-center">Monthly Planned</TableHead>
                    <TableHead className="font-bold text-xs uppercase tracking-wider text-center">Actual</TableHead>
                    <TableHead className="font-bold text-xs uppercase tracking-wider text-center">+ / -</TableHead>
                    <TableHead className="font-bold text-xs uppercase tracking-wider w-48">Achievement</TableHead>
                    <TableHead className="font-bold text-xs uppercase tracking-wider text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredFacilitators.map((f, i) => {
                    const varVal = f.actual - f.planned;
                    const ach = f.planned > 0 ? Math.min(100, (f.actual / f.planned) * 100) : 0;
                    return (
                      <TableRow key={f.id} className="hover:bg-muted/30">
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-[#FFF9C4] text-[#FBC02D] flex items-center justify-center font-bold text-xs">
                              {i + 1}
                            </div>
                            <div>
                              <p className="font-bold text-sm">{f.name}</p>
                              <p className="text-xs text-muted-foreground">Facilitator</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-center font-bold">{f.planned}</TableCell>
                        <TableCell className="text-center font-bold">{f.actual}</TableCell>
                        <TableCell className="text-center">
                          <span className={`text-xs font-bold px-2 py-1 rounded-full ${varVal >= 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                            {varVal > 0 ? '+' : ''}{varVal}
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <Progress value={ach} className="h-1.5 flex-1" indicatorColor="bg-indigo-500" />
                            <span className="text-xs font-bold w-8">{f.planned > 0 ? Math.round(ach) : 0}%</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="h-8 text-indigo-600 border-indigo-200 hover:bg-indigo-50"
                            onClick={() => setEditingFacilitator(f)}
                          >
                            Edit
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {filteredFacilitators.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        {loading ? 'Loading performance data...' : 'No facilitators found.'}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="class">
          <Card className="border-dashed py-12">
            <CardContent className="flex flex-col items-center justify-center text-center">
              <p className="text-lg font-medium text-muted-foreground">Class breakdowns coming soon</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="category">
          <Card className="border-dashed py-12">
            <CardContent className="flex flex-col items-center justify-center text-center">
              <p className="text-lg font-medium text-muted-foreground">Category breakdowns coming soon</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Global Target Modal */}
      <Dialog open={isGlobalTargetOpen} onOpenChange={setIsGlobalTargetOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Set Monthly Target Session</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="flex flex-col gap-2">
              <label htmlFor="gtarget" className="text-sm font-medium">
                Global Target for {format(new Date(), 'MMMM yyyy')}
              </label>
              <Input
                id="gtarget"
                type="number"
                min="0"
                value={editingGlobalTargetStr}
                onChange={(e) => setEditingGlobalTargetStr(e.target.value)}
                placeholder="e.g. 60"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsGlobalTargetOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveGlobalTarget} disabled={savingGlobal}>
              {savingGlobal ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Facilitator Target Modal */}
      {editingFacilitator && (
        <FacilitatorTargetDialog
          open={!!editingFacilitator}
          onOpenChange={(open) => !open && setEditingFacilitator(null)}
          facilitatorId={editingFacilitator.id}
          facilitatorName={editingFacilitator.name}
          currentMonth={currentMonthStr}
          currentValue={editingFacilitator.planned}
          onSaved={() => {
            fetchData();
          }}
        />
      )}
    </div>
    </DashboardLayout>
  );
}
