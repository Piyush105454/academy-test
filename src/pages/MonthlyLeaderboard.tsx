import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { Crown, Edit, Search, Plus, Trash2, Settings2 } from 'lucide-react';
import { startOfMonth, endOfMonth, format } from 'date-fns';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { FacilitatorTargetDialog } from '@/components/dashboard/FacilitatorTargetDialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { DashboardLayout } from '@/components/layout/DashboardLayout';

interface FacilitatorPerformance {
  id: string;
  name: string;
  planned: number;
  actual: number;
}

interface TargetRow {
  id: string; // local uuid for key
  facilitator_id: string;
  facilitator_name: string;
  class_name: string;
  session_type: string;
  target: number;
}

export default function MonthlyLeaderboard() {
  const [globalTarget, setGlobalTarget] = useState<number>(0);
  const [totalSessions, setTotalSessions] = useState<number>(0);
  
  const [facilitators, setFacilitators] = useState<FacilitatorPerformance[]>([]);
  const [classPerformance, setClassPerformance] = useState<FacilitatorPerformance[]>([]);
  const [categoryPerformance, setCategoryPerformance] = useState<FacilitatorPerformance[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);

  const [isGlobalTargetOpen, setIsGlobalTargetOpen] = useState(false);
  const [editingGlobalTargetStr, setEditingGlobalTargetStr] = useState('');
  const [savingGlobal, setSavingGlobal] = useState(false);

  const [editingFacilitator, setEditingFacilitator] = useState<FacilitatorPerformance | null>(null);
  
  const [editingOtherTarget, setEditingOtherTarget] = useState<{ name: string, planned: number, type: 'class' | 'category' } | null>(null);
  const [editingOtherTargetValue, setEditingOtherTargetValue] = useState('');
  const [savingOtherTarget, setSavingOtherTarget] = useState(false);

  // ---- Monthly Target Setup dialog ----
  const [isTargetSetupOpen, setIsTargetSetupOpen] = useState(false);
  const [targetRows, setTargetRows] = useState<TargetRow[]>([]);
  const [allFacilitators, setAllFacilitators] = useState<{ id: string; name: string }[]>([]);
  const [allClasses, setAllClasses] = useState<{ name: string }[]>([]);
  const [savingTargetRows, setSavingTargetRows] = useState(false);
  const [targetMonth, setTargetMonth] = useState(format(new Date(), 'yyyy-MM'));

  const SESSION_TYPES = [
    { value: 'guest_teacher', label: 'Guest Teacher (GT)' },
    { value: 'guest_speaker', label: 'Guest Speaker (GS)' },
    { value: 'local_teacher', label: 'Local Teacher (LT)' },
  ];

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
        .select('id, facilitator_name, class_batch, session_type')
          .gte('session_date', monthStart)
          .lte('session_date', monthEnd)
          .eq('status', 'completed');
      
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
          targets.forEach(t => {
            if (t.facilitator_id) facTargets[t.facilitator_id] = t.target_sessions || 0;
          });
        }
      } catch (e) {
        console.warn('facilitator_targets table might be missing');
      }

      // Fetch Class Targets
      let classTargetsMap: Record<string, number> = {};
      try {
        const { data: cTargets } = await supabase
          .from('class_targets')
          .select('class_name, target_sessions')
          .eq('month', currentMonthStr);
        if (cTargets) {
          cTargets.forEach(t => {
            if (t.class_name) classTargetsMap[t.class_name] = t.target_sessions || 0;
          });
        }
      } catch (e) {
        console.warn('class_targets table might be missing');
      }

      // Fetch Category Targets
      let categoryTargetsMap: Record<string, number> = {};
      try {
        const { data: catTargets } = await supabase
          .from('category_targets')
          .select('category_name, target_sessions')
          .eq('month', currentMonthStr);
        if (catTargets) {
          catTargets.forEach(t => {
            if (t.category_name) categoryTargetsMap[t.category_name] = t.target_sessions || 0;
          });
        }
      } catch (e) {
        console.warn('category_targets table might be missing');
      }

      // Fetch Granular Targets (Monthly Target Setup)
      try {
        const { data: granularTargets } = await supabase
          .from('facilitator_class_session_targets')
          .select('facilitator_id, facilitator_name, class_name, session_type, target_sessions')
          .eq('month', currentMonthStr);

        if (granularTargets) {
          granularTargets.forEach(t => {
            const val = t.target_sessions || 0;
            if (t.facilitator_id) {
              facTargets[t.facilitator_id] = (facTargets[t.facilitator_id] || 0) + val;
            }
            if (t.facilitator_name) {
              const fn = t.facilitator_name.trim().toLowerCase();
              facTargets[fn] = (facTargets[fn] || 0) + val;
            }
            if (t.class_name) {
              const cn = t.class_name.trim();
              classTargetsMap[cn] = (classTargetsMap[cn] || 0) + val;
            }
            if (t.session_type) {
              let catName = '';
              if (t.session_type === 'guest_teacher') catName = 'Guest Teacher';
              else if (t.session_type === 'guest_speaker') catName = 'Guest Speaker';
              else if (t.session_type === 'local_teacher') catName = 'Local Teacher';

              if (catName) {
                categoryTargetsMap[catName] = (categoryTargetsMap[catName] || 0) + val;
              }
            }
          });
        }
      } catch (e) {
        console.warn('facilitator_class_session_targets table might be missing');
      }

      // 5. Compute actuals
      const actuals: Record<string, number> = {};
      const classActualsMap: Record<string, number> = {};
      const categoryActualsMap: Record<string, number> = {};

      sessions?.forEach(s => {
        if (s.facilitator_name) {
          actuals[s.facilitator_name.trim().toLowerCase()] = (actuals[s.facilitator_name.trim().toLowerCase()] || 0) + 1;
        }
        if (s.class_batch) {
          const cName = s.class_batch.trim();
          classActualsMap[cName] = (classActualsMap[cName] || 0) + 1;
        }
        if (s.session_type) {
          let catName = s.session_type.trim();
          // Capitalize first letter and replace underscores for better display
          catName = catName.split('_').map((word: string) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
          categoryActualsMap[catName] = (categoryActualsMap[catName] || 0) + 1;
        }
      });

      // 6. Build final arrays
      if (facs) {
        const perfData = facs.map(f => {
          const normName = f.name.trim().toLowerCase();
          const actual = actuals[normName] || 0;
          const planned = facTargets[f.id] || facTargets[normName] || 0;
          return {
            id: f.id,
            name: f.name.trim(),
            planned,
            actual,
          };
        }).sort((a, b) => b.actual - a.actual || b.planned - a.planned);
        setFacilitators(perfData);
      }

      // Fetch All Classes
      let allClassNames: string[] = [];
      try {
        const { data: classesData } = await supabase.from('classes').select('name').neq('name', '__SYSTEM_DEV_MODE__');
        if (classesData) {
          allClassNames = classesData.map(c => c.name);
        }
      } catch (e) {
        console.warn('Could not fetch classes');
      }

      // Build class performance
      const classNames = Array.from(new Set([...allClassNames, ...Object.keys(classActualsMap), ...Object.keys(classTargetsMap)]));
      const classPerf = classNames.map(name => ({
        id: name,
        name: name,
        planned: classTargetsMap[name] || 0,
        actual: classActualsMap[name] || 0,
      })).sort((a, b) => {
        // Sort by actual descending, then alphabetically
        if (b.actual !== a.actual) return b.actual - a.actual;
        return (a.name || '').localeCompare(b.name || '');
      });
      setClassPerformance(classPerf);

      // Define standard categories to always show
      const standardCategories = ['Guest Teacher', 'Guest Speaker', 'Local Teacher'];
      
      // Build category performance
      const catNames = standardCategories;
      const catPerf = catNames.map(name => ({
        id: name,
        name: name,
        planned: categoryTargetsMap[name] || 0,
        actual: categoryActualsMap[name] || 0,
      })).sort((a, b) => {
        if (b.actual !== a.actual) return b.actual - a.actual;
        return (a.name || '').localeCompare(b.name || '');
      });
      setCategoryPerformance(catPerf);

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

  const handleSaveOtherTarget = async () => {
    if (!editingOtherTarget) return;
    try {
      setSavingOtherTarget(true);
      const val = parseInt(editingOtherTargetValue, 10);
      if (isNaN(val) || val < 0) {
        toast.error('Please enter a valid number');
        return;
      }
      
      const tableName = editingOtherTarget.type === 'class' ? 'class_targets' : 'category_targets';
      const nameCol = editingOtherTarget.type === 'class' ? 'class_name' : 'category_name';
      
      const { error } = await supabase
        .from(tableName)
        .upsert(
          { month: currentMonthStr, [nameCol]: editingOtherTarget.name, target_sessions: val },
          { onConflict: `${nameCol}, month` }
        );
      
      if (error) throw error;
      
      toast.success(`${editingOtherTarget.type === 'class' ? 'Class' : 'Category'} target updated`);
      setEditingOtherTarget(null);
      fetchData();
    } catch (e) {
      toast.error('Failed to update target. Ensure the SQL migration was run.');
      console.error(e);
    } finally {
      setSavingOtherTarget(false);
    }
  };

  const openTargetSetup = async () => {
    const month = targetMonth;
    // Load facilitators and classes for dropdowns
    const [{ data: facsData }, { data: classesData }, { data: existingRows }] = await Promise.all([
      supabase.from('facilitators').select('id, name').order('name'),
      supabase.from('classes').select('name').neq('name', '__SYSTEM_DEV_MODE__').order('name'),
      supabase.from('facilitator_class_session_targets').select('*').eq('month', month),
    ]);
    setAllFacilitators(facsData || []);
    setAllClasses(classesData || []);

    if (existingRows && existingRows.length > 0) {
      const rows: TargetRow[] = existingRows.map((r: any) => ({
        id: crypto.randomUUID(),
        facilitator_id: r.facilitator_id || '',
        facilitator_name: facsData?.find(f => f.id === r.facilitator_id)?.name || r.facilitator_name || '',
        class_name: r.class_name || '',
        session_type: r.session_type || '',
        target: r.target_sessions || 0,
      }));
      setTargetRows(rows);
    } else {
      setTargetRows([{ id: crypto.randomUUID(), facilitator_id: '', facilitator_name: '', class_name: '', session_type: '', target: 0 }]);
    }
    setIsTargetSetupOpen(true);
  };

  const handleMonthChange = async (newMonth: string) => {
    setTargetMonth(newMonth);
    // Reload rows for selected month
    const { data: existingRows } = await supabase
      .from('facilitator_class_session_targets').select('*').eq('month', newMonth);
    if (existingRows && existingRows.length > 0) {
      const rows: TargetRow[] = existingRows.map((r: any) => ({
        id: crypto.randomUUID(),
        facilitator_id: r.facilitator_id || '',
        facilitator_name: allFacilitators.find(f => f.id === r.facilitator_id)?.name || r.facilitator_name || '',
        class_name: r.class_name || '',
        session_type: r.session_type || '',
        target: r.target_sessions || 0,
      }));
      setTargetRows(rows);
    } else {
      setTargetRows([{ id: crypto.randomUUID(), facilitator_id: '', facilitator_name: '', class_name: '', session_type: '', target: 0 }]);
    }
  };

  const addTargetRow = () => {
    setTargetRows(prev => [...prev, { id: crypto.randomUUID(), facilitator_id: '', facilitator_name: '', class_name: '', session_type: '', target: 0 }]);
  };

  const removeTargetRow = (id: string) => {
    setTargetRows(prev => prev.filter(r => r.id !== id));
  };

  const updateTargetRow = (id: string, field: keyof TargetRow, value: any) => {
    setTargetRows(prev => prev.map(r => {
      if (r.id !== id) return r;
      const updated = { ...r, [field]: value };
      if (field === 'facilitator_id') {
        const fac = allFacilitators.find(f => f.id === value);
        updated.facilitator_name = fac?.name || '';
        updated.class_name = '';
        updated.session_type = '';
      }
      if (field === 'class_name') {
        updated.session_type = '';
      }
      return updated;
    }));
  };

  const handleSaveTargetRows = async () => {
    const validRows = targetRows.filter(r => r.facilitator_id && r.class_name && r.session_type && r.target > 0);
    if (validRows.length === 0) {
      toast.error('Please fill in at least one complete row');
      return;
    }
    setSavingTargetRows(true);
    try {
      // Delete all existing rows for this month first
      await supabase.from('facilitator_class_session_targets').delete().eq('month', targetMonth);

      // Insert all valid rows
      const inserts = validRows.map(r => ({
        month: targetMonth,
        facilitator_id: r.facilitator_id,
        facilitator_name: r.facilitator_name,
        class_name: r.class_name,
        session_type: r.session_type,
        target_sessions: r.target,
      }));
      const { error } = await supabase.from('facilitator_class_session_targets').insert(inserts);
      if (error) throw error;

      // Also update global target as sum of all rows (only for current month)
      if (targetMonth === currentMonthStr) {
        const totalTarget = validRows.reduce((sum, r) => sum + r.target, 0);
        await supabase.from('monthly_targets').upsert(
          { month: targetMonth, target_sessions: totalTarget, updated_at: new Date().toISOString() },
          { onConflict: 'month' }
        );
      }

      toast.success('Targets saved successfully!');
      setIsTargetSetupOpen(false);
      fetchData();
    } catch (e: any) {
      toast.error('Failed to save targets. Run the SQL migration first.');
      console.error(e);
    } finally {
      setSavingTargetRows(false);
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
          <Button onClick={openTargetSetup} variant="outline" className="rounded-full gap-2 border-indigo-200 text-indigo-700 hover:bg-indigo-50">
            <Settings2 className="h-4 w-4" /> Monthly Target Setup
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
                      </TableRow>
                    );
                  })}
                  {filteredFacilitators.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
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
          <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
            <div className="p-4 border-b border-border flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <h3 className="font-bold text-lg">Class performance</h3>
            </div>
            
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-muted/50">
                  <TableRow>
                    <TableHead className="font-bold text-xs uppercase tracking-wider">Class</TableHead>
                    <TableHead className="font-bold text-xs uppercase tracking-wider text-center">Monthly Planned</TableHead>
                    <TableHead className="font-bold text-xs uppercase tracking-wider text-center">Actual</TableHead>
                    <TableHead className="font-bold text-xs uppercase tracking-wider text-center">+ / -</TableHead>
                    <TableHead className="font-bold text-xs uppercase tracking-wider w-48">Achievement</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {classPerformance.map((f, i) => {
                    const varVal = f.actual - f.planned;
                    const ach = f.planned > 0 ? Math.min(100, (f.actual / f.planned) * 100) : 0;
                    return (
                      <TableRow key={f.id} className="hover:bg-muted/30">
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-xs">
                              {i + 1}
                            </div>
                            <div>
                              <p className="font-bold text-sm">{f.name}</p>
                              <p className="text-xs text-muted-foreground">Class</p>
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
                            <Progress value={ach} className="h-1.5 flex-1" indicatorColor="bg-blue-500" />
                            <span className="text-xs font-bold w-8">{f.planned > 0 ? Math.round(ach) : 0}%</span>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {classPerformance.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                        {loading ? 'Loading performance data...' : 'No classes found.'}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="category">
          <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
            <div className="p-4 border-b border-border flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <h3 className="font-bold text-lg">Category performance</h3>
            </div>
            
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-muted/50">
                  <TableRow>
                    <TableHead className="font-bold text-xs uppercase tracking-wider">Category</TableHead>
                    <TableHead className="font-bold text-xs uppercase tracking-wider text-center">Monthly Planned</TableHead>
                    <TableHead className="font-bold text-xs uppercase tracking-wider text-center">Actual</TableHead>
                    <TableHead className="font-bold text-xs uppercase tracking-wider text-center">+ / -</TableHead>
                    <TableHead className="font-bold text-xs uppercase tracking-wider w-48">Achievement</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {categoryPerformance.map((f, i) => {
                    const varVal = f.actual - f.planned;
                    const ach = f.planned > 0 ? Math.min(100, (f.actual / f.planned) * 100) : 0;
                    return (
                      <TableRow key={f.id} className="hover:bg-muted/30">
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center font-bold text-xs">
                              {i + 1}
                            </div>
                            <div>
                              <p className="font-bold text-sm">{f.name}</p>
                              <p className="text-xs text-muted-foreground">Category</p>
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
                            <Progress value={ach} className="h-1.5 flex-1" indicatorColor="bg-purple-500" />
                            <span className="text-xs font-bold w-8">{f.planned > 0 ? Math.round(ach) : 0}%</span>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {categoryPerformance.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                        {loading ? 'Loading performance data...' : 'No categories found.'}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
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

      {/* Class/Category Target Modal */}
      <Dialog open={!!editingOtherTarget} onOpenChange={(open) => !open && setEditingOtherTarget(null)}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Edit Target for {editingOtherTarget?.name}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <label className="text-right text-sm font-medium">Month</label>
              <div className="col-span-3 text-sm font-semibold">{format(new Date(currentMonthStr + '-01'), 'MMMM yyyy')}</div>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <label htmlFor="other-target" className="text-right text-sm font-medium">Target Sessions</label>
              <Input
                id="other-target"
                type="number"
                min="0"
                value={editingOtherTargetValue}
                onChange={(e) => setEditingOtherTargetValue(e.target.value)}
                className="col-span-3"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingOtherTarget(null)}>Cancel</Button>
            <Button onClick={handleSaveOtherTarget} disabled={savingOtherTarget}>
              {savingOtherTarget ? 'Saving...' : 'Save changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Monthly Target Setup Dialog */}
      <Dialog open={isTargetSetupOpen} onOpenChange={setIsTargetSetupOpen}>
        <DialogContent className="max-w-4xl w-full">
          <DialogHeader>
            <DialogTitle>Monthly Target Setup</DialogTitle>
            <DialogDescription>
              Add, edit, or remove target rows. The dashboard target is calculated automatically as the sum of every row.
            </DialogDescription>
          </DialogHeader>

          {/* Month Selector */}
          <div className="flex items-center gap-3 pb-2 border-b">
            <label className="text-sm font-medium text-muted-foreground whitespace-nowrap">Select Month:</label>
            <Input
              type="month"
              value={targetMonth}
              onChange={e => handleMonthChange(e.target.value)}
              className="h-9 w-44"
            />
            <span className="text-sm text-muted-foreground">
              Editing targets for <strong>{format(new Date(targetMonth + '-01'), 'MMMM yyyy')}</strong>
            </span>
          </div>

          <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 px-2 font-semibold text-xs uppercase tracking-wider text-muted-foreground">Facilitator</th>
                  <th className="text-left py-2 px-2 font-semibold text-xs uppercase tracking-wider text-muted-foreground">Class</th>
                  <th className="text-left py-2 px-2 font-semibold text-xs uppercase tracking-wider text-muted-foreground">Session Type</th>
                  <th className="text-left py-2 px-2 font-semibold text-xs uppercase tracking-wider text-muted-foreground">Target</th>
                  <th className="text-left py-2 px-2 font-semibold text-xs uppercase tracking-wider text-muted-foreground">Action</th>
                </tr>
              </thead>
              <tbody>
                {targetRows.map(row => (
                  <tr key={row.id} className="border-b last:border-0">
                    <td className="py-2 px-2">
                      <Select value={row.facilitator_id} onValueChange={v => updateTargetRow(row.id, 'facilitator_id', v)}>
                        <SelectTrigger className="h-9 min-w-[130px]">
                          <SelectValue placeholder="Select facilitator" />
                        </SelectTrigger>
                        <SelectContent>
                          {allFacilitators.map(f => (
                            <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="py-2 px-2">
                      <Select
                        value={row.class_name}
                        onValueChange={v => updateTargetRow(row.id, 'class_name', v)}
                        disabled={!row.facilitator_id}
                      >
                        <SelectTrigger className="h-9 min-w-[130px]">
                          <SelectValue placeholder="Select class" />
                        </SelectTrigger>
                        <SelectContent>
                          {allClasses.map(c => (
                            <SelectItem key={c.name} value={c.name}>{c.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="py-2 px-2">
                      <Select
                        value={row.session_type}
                        onValueChange={v => updateTargetRow(row.id, 'session_type', v)}
                        disabled={!row.class_name}
                      >
                        <SelectTrigger className="h-9 min-w-[160px]">
                          <SelectValue placeholder="Select session type" />
                        </SelectTrigger>
                        <SelectContent>
                          {SESSION_TYPES.map(st => (
                            <SelectItem key={st.value} value={st.value}>{st.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="py-2 px-2">
                      <Input
                        type="number"
                        min={0}
                        value={row.target || ''}
                        onChange={e => updateTargetRow(row.id, 'target', parseInt(e.target.value) || 0)}
                        className="h-9 w-20"
                        placeholder="0"
                      />
                    </td>
                    <td className="py-2 px-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-red-400 hover:text-red-600 hover:bg-red-50 h-9 w-9"
                        onClick={() => removeTargetRow(row.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="pt-2">
            <Button variant="outline" size="sm" onClick={addTargetRow} className="gap-2">
              <Plus className="h-4 w-4" /> Add target row
            </Button>
          </div>

          <div className="flex items-center justify-between pt-2 border-t">
            <p className="text-xs text-muted-foreground">Changes apply while this preview is open.</p>
            <div className="flex items-center gap-4">
              <span className="text-sm font-semibold">
                Total target: <span className="text-indigo-600">{targetRows.reduce((s, r) => s + (r.target || 0), 0)}</span>
              </span>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setIsTargetSetupOpen(false)}>Cancel</Button>
                <Button onClick={handleSaveTargetRows} disabled={savingTargetRows} className="bg-indigo-600 hover:bg-indigo-700 text-white">
                  {savingTargetRows ? 'Saving...' : 'Save targets'}
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
    </DashboardLayout>
  );
}


