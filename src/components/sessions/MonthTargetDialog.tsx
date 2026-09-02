import { useState, useEffect } from 'react';
import { Target } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { startOfMonth, format } from 'date-fns';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog';

export function MonthTargetDialog() {
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<string>('');
  const [loading, setLoading] = useState(false);

  const currentMonthStr = format(new Date(), 'yyyy-MM');

  useEffect(() => {
    if (open) {
      fetchTarget();
    }
  }, [open]);

  const fetchTarget = async () => {
    try {
      const { data, error } = await supabase
        .from('monthly_targets')
        .select('target_sessions')
        .eq('month', currentMonthStr)
        .maybeSingle();

      if (data) {
        setTarget(data.target_sessions.toString());
      } else {
        setTarget('0');
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleSave = async () => {
    try {
      setLoading(true);
      const val = parseInt(target, 10);
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
      toast.success('Monthly target saved successfully');
      setOpen(false);
    } catch (error) {
      console.error(error);
      toast.error('Failed to save monthly target');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="w-full sm:w-auto gap-2 border-indigo-200 text-indigo-700 hover:bg-indigo-50">
          <Target className="h-4 w-4" />
          <span className="hidden sm:inline">Set Target</span>
          <span className="sm:hidden">Target</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Set Monthly Target Session</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="flex flex-col gap-2">
            <label htmlFor="target" className="text-sm font-medium">
              Target for {format(new Date(), 'MMMM yyyy')}
            </label>
            <Input
              id="target"
              type="number"
              min="0"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              placeholder="e.g. 50"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={loading}>
            {loading ? 'Saving...' : 'Save Changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
