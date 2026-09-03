import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

interface FacilitatorTargetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  facilitatorId: string;
  facilitatorName: string;
  currentMonth: string; // 'yyyy-MM'
  currentValue: number;
  onSaved: () => void;
}

export function FacilitatorTargetDialog({
  open,
  onOpenChange,
  facilitatorId,
  facilitatorName,
  currentMonth,
  currentValue,
  onSaved,
}: FacilitatorTargetDialogProps) {
  const [target, setTarget] = useState<string>(currentValue.toString());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      setTarget(currentValue.toString());
    }
  }, [open, currentValue]);

  const handleSave = async () => {
    try {
      setLoading(true);
      const val = parseInt(target, 10);
      if (isNaN(val) || val < 0) {
        toast.error('Please enter a valid number');
        return;
      }

      const { error } = await supabase
        .from('facilitator_targets')
        .upsert(
          {
            facilitator_id: facilitatorId,
            month: currentMonth,
            target_sessions: val,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'facilitator_id, month' }
        );

      if (error) throw error;
      toast.success('Target updated successfully');
      onSaved();
      onOpenChange(false);
    } catch (e: any) {
      console.error(e);
      toast.error('Failed to update target');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Edit Target for {facilitatorName}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <label className="text-right text-sm font-medium">Month</label>
            <div className="col-span-3 text-sm font-semibold">{format(new Date(currentMonth + '-01'), 'MMMM yyyy')}</div>
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <label htmlFor="target" className="text-right text-sm font-medium">Target Sessions</label>
            <Input
              id="target"
              type="number"
              min="0"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              className="col-span-3"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={loading}>
            {loading ? 'Saving...' : 'Save changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
