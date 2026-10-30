import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Unlock, Lock, Clock, Calendar, AlertCircle, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { logActivity } from '@/utils/activityLogger';
import {
  isFeedbackCurrentlyUnlocked,
  getUnlockRemainingTimeText,
  formatUnlockDateTime,
} from '@/utils/feedbackLockUtils';

interface Session {
  id: string;
  title?: string;
  session_id_code?: string;
  class_batch?: string;
  session_date?: string;
  facilitator_name?: string;
  feedback_unlocked?: boolean;
  feedback_unlocked_until?: string | null;
}

interface UnlockFeedbackDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  session: Session | null;
  onSuccess: () => void;
}

const PRESET_OPTIONS = [
  { value: '8', label: '8 Hours', sublabel: 'Recommended Standard', badge: 'Default' },
  { value: '4', label: '4 Hours', sublabel: 'Quick Entry Window' },
  { value: '12', label: '12 Hours', sublabel: 'Half Day Window' },
  { value: '24', label: '24 Hours', sublabel: 'Full Day Window' },
  { value: 'custom', label: 'Custom Date & Time', sublabel: 'Pick specific deadline' },
];

export function UnlockFeedbackDialog({
  open,
  onOpenChange,
  session,
  onSuccess,
}: UnlockFeedbackDialogProps) {
  const [selectedDuration, setSelectedDuration] = useState<string>('8');
  const [customDateTime, setCustomDateTime] = useState<string>('');
  const [saving, setSaving] = useState(false);

  const isCurrentlyUnlocked = session ? isFeedbackCurrentlyUnlocked(session) : false;
  const remainingText = session?.feedback_unlocked_until
    ? getUnlockRemainingTimeText(session.feedback_unlocked_until)
    : null;

  // Reset to default 8 hours on dialog open
  useEffect(() => {
    if (open) {
      setSelectedDuration('8');
      // Set default custom date-time to now + 8 hours formatted for datetime-local input
      const defaultDate = new Date(Date.now() + 8 * 60 * 60 * 1000);
      const localIso = new Date(defaultDate.getTime() - defaultDate.getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 16);
      setCustomDateTime(localIso);
    }
  }, [open, session]);

  // Calculate target expiry time based on selection
  const getCalculatedExpiryDate = (): Date => {
    if (selectedDuration === 'custom') {
      if (customDateTime) {
        const parsed = new Date(customDateTime);
        if (!isNaN(parsed.getTime())) return parsed;
      }
      return new Date(Date.now() + 8 * 60 * 60 * 1000);
    }
    const hours = parseInt(selectedDuration, 10) || 8;
    return new Date(Date.now() + hours * 60 * 60 * 1000);
  };

  const calculatedExpiry = getCalculatedExpiryDate();

  const handleSaveUnlock = async () => {
    if (!session) return;

    const expiryDate = getCalculatedExpiryDate();

    if (expiryDate.getTime() <= Date.now()) {
      toast.error('Expiration time must be in the future.');
      return;
    }

    try {
      setSaving(true);
      const expiryIso = expiryDate.toISOString();

      // Attempt update with feedback_unlocked_until
      const { error: fullError } = await supabase
        .from('sessions')
        .update({
          feedback_unlocked: true,
          feedback_unlocked_until: expiryIso,
        } as any)
        .eq('id', session.id);

      if (fullError) {
        // If feedback_unlocked_until column does not exist yet in schema cache, fallback to boolean
        if (
          fullError.code === 'PGRST204' ||
          fullError.message?.includes('feedback_unlocked_until')
        ) {
          console.warn('feedback_unlocked_until column not in DB yet, updating feedback_unlocked boolean fallback...');
          const { error: fallbackError } = await supabase
            .from('sessions')
            .update({ feedback_unlocked: true })
            .eq('id', session.id);

          if (fallbackError) throw fallbackError;
        } else {
          throw fullError;
        }
      }

      const hoursLabel = selectedDuration === 'custom' ? 'custom time' : `${selectedDuration} hours`;
      await logActivity(
        'UNLOCK',
        'Sessions',
        `Unlocked feedback for session "${session.session_id_code || session.title || session.id}" for ${hoursLabel} (until ${expiryIso})`
      );

      toast.success(
        `Feedback unlocked for ${hoursLabel}! Automatically re-locks at ${formatUnlockDateTime(expiryDate)}.`
      );
      onOpenChange(false);
      onSuccess();
    } catch (err: any) {
      console.error('Error unlocking feedback:', err);
      toast.error('Failed to unlock feedback: ' + (err.message || 'Unknown error'));
    } finally {
      setSaving(false);
    }
  };

  const handleLockImmediately = async () => {
    if (!session) return;

    try {
      setSaving(true);

      const { error: fullError } = await supabase
        .from('sessions')
        .update({
          feedback_unlocked: false,
          feedback_unlocked_until: null,
        } as any)
        .eq('id', session.id);

      if (fullError) {
        // Fallback if column not in schema cache
        const { error: fallbackError } = await supabase
          .from('sessions')
          .update({ feedback_unlocked: false })
          .eq('id', session.id);

        if (fallbackError) throw fallbackError;
      }

      await logActivity(
        'LOCK',
        'Sessions',
        `Locked feedback for session "${session.session_id_code || session.title || session.id}"`
      );

      toast.success('Feedback locked successfully.');
      onOpenChange(false);
      onSuccess();
    } catch (err: any) {
      console.error('Error locking feedback:', err);
      toast.error('Failed to lock feedback: ' + (err.message || 'Unknown error'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-full bg-amber-100 flex items-center justify-center text-amber-600">
              <Unlock className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-lg font-bold">
                {isCurrentlyUnlocked ? 'Manage Feedback Unlock' : 'Unlock Feedback'}
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                Set a temporary time limit. Feedback automatically locks when time expires.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Session details banner */}
        {session && (
          <div className="bg-muted/40 border border-border/80 rounded-lg p-3 space-y-1.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-foreground truncate max-w-[280px]">
                {session.title || 'Session'}
              </span>
              <Badge variant="outline" className="font-mono text-[10px]">
                {session.session_id_code || '---'}
              </Badge>
            </div>
            <div className="flex items-center justify-between text-muted-foreground text-[11px]">
              <span>Class: {session.class_batch || 'General'}</span>
              <span>Date: {session.session_date || 'N/A'}</span>
            </div>
            <div className="pt-1 flex items-center justify-between border-t border-border/50 text-[11px]">
              <span className="text-muted-foreground">Current Status:</span>
              {isCurrentlyUnlocked ? (
                <Badge className="bg-amber-100 text-amber-800 border-amber-300 gap-1 text-[10px] font-semibold">
                  <Unlock className="h-3 w-3" /> Unlocked ({remainingText || 'Active'})
                </Badge>
              ) : (
                <Badge variant="outline" className="bg-slate-100 text-slate-700 border-slate-300 gap-1 text-[10px]">
                  <Lock className="h-3 w-3" /> Locked
                </Badge>
              )}
            </div>
          </div>
        )}

        {/* Duration selection */}
        <div className="space-y-3 py-1">
          <Label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 text-primary" />
            Select Unlock Duration
          </Label>

          <RadioGroup
            value={selectedDuration}
            onValueChange={setSelectedDuration}
            className="grid grid-cols-2 gap-2"
          >
            {PRESET_OPTIONS.map((opt) => {
              const isSelected = selectedDuration === opt.value;
              return (
                <div
                  key={opt.value}
                  onClick={() => setSelectedDuration(opt.value)}
                  className={`relative flex items-start gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-all ${
                    isSelected
                      ? 'border-primary bg-primary/5 ring-1 ring-primary/30 shadow-xs'
                      : 'border-border/70 hover:bg-muted/40'
                  } ${opt.value === 'custom' ? 'col-span-2' : ''}`}
                >
                  <RadioGroupItem value={opt.value} id={`duration-${opt.value}`} className="mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-semibold text-foreground">{opt.label}</span>
                      {opt.badge && (
                        <Badge variant="secondary" className="text-[9px] px-1.5 py-0 h-4 bg-primary/10 text-primary">
                          {opt.badge}
                        </Badge>
                      )}
                    </div>
                    <p className="text-[10px] text-muted-foreground truncate">{opt.sublabel}</p>
                  </div>
                </div>
              );
            })}
          </RadioGroup>

          {/* Custom Date & Time Picker */}
          {selectedDuration === 'custom' && (
            <div className="pt-2 space-y-1.5">
              <Label htmlFor="custom-datetime" className="text-[11px] font-medium text-muted-foreground">
                Set Exact Date & Time
              </Label>
              <div className="relative">
                <Input
                  id="custom-datetime"
                  type="datetime-local"
                  value={customDateTime}
                  onChange={(e) => setCustomDateTime(e.target.value)}
                  className="text-xs h-9"
                />
              </div>
            </div>
          )}

          {/* Expiration Preview Card */}
          <div className="bg-amber-50/70 border border-amber-200/80 rounded-lg p-2.5 text-xs text-amber-900 space-y-1">
            <div className="flex items-center gap-1.5 font-semibold text-[11px] text-amber-800">
              <Calendar className="h-3.5 w-3.5 text-amber-600" />
              <span>Automatic Re-Lock Schedule:</span>
            </div>
            <p className="text-xs font-bold text-amber-950 pl-5">
              {formatUnlockDateTime(calculatedExpiry)}
            </p>
            <p className="text-[10px] text-amber-700/90 pl-5">
              After this exact time, feedback entry and editing will automatically be locked for facilitators, coordinators, and supervisors.
            </p>
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2 pt-2 border-t border-border/50">
          {isCurrentlyUnlocked && (
            <Button
              type="button"
              variant="outline"
              onClick={handleLockImmediately}
              disabled={saving}
              className="text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700 sm:mr-auto w-full sm:w-auto text-xs"
            >
              <Lock className="h-3.5 w-3.5 mr-1" />
              Lock Now
            </Button>
          )}

          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={saving}
            className="text-xs"
          >
            Cancel
          </Button>

          <Button
            type="button"
            onClick={handleSaveUnlock}
            disabled={saving}
            className="bg-amber-600 hover:bg-amber-700 text-white gap-1.5 text-xs shadow-xs"
          >
            <Unlock className="h-3.5 w-3.5" />
            {saving
              ? 'Saving...'
              : isCurrentlyUnlocked
              ? 'Update / Extend Unlock'
              : selectedDuration === 'custom'
              ? 'Unlock Until Date'
              : `Unlock for ${selectedDuration} Hours`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
