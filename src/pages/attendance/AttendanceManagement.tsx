import React, { useEffect, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/card';
import { useNavigate } from 'react-router-dom';
import { Users, CalendarDays, ChevronRight, Settings } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

export default function AttendanceManagement() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [lateTime, setLateTime] = useState('09:00:00');
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    checkRoleAndFetchSettings();
  }, [user]);

  const checkRoleAndFetchSettings = async () => {
    if (!user?.email) return;
    try {
      const { data: profile } = await supabase.from('user_profiles').select('role_id').ilike('email', user.email).maybeSingle();
      if (profile?.role_id === 1) {
        setIsAdmin(true);
      }
      
      const { data: settings } = await supabase.from('attendance_settings').select('late_threshold_time').eq('id', 1).maybeSingle();
      if (settings?.late_threshold_time) {
        setLateTime(settings.late_threshold_time);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleSaveSettings = async () => {
    setSaving(true);
    try {
      const { error } = await supabase.from('attendance_settings').upsert({ id: 1, late_threshold_time: lateTime });
      if (error) throw error;
      toast.success('Settings saved successfully');
      setDialogOpen(false);
    } catch (e) {
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="p-6 md:p-8 max-w-6xl mx-auto space-y-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">ATTENDANCE MANAGEMENT</h1>
          <p className="text-muted-foreground mt-2">Global tracking and school-wide metrics.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card 
            className="p-6 hover:shadow-md transition-shadow cursor-pointer flex items-center justify-between group bg-slate-50/50"
            onClick={() => navigate('/attendance-management/class-wise')}
          >
            <div className="flex items-center gap-4">
              <div className="p-3 bg-blue-100 text-blue-600 rounded-xl">
                <Users className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-semibold text-lg text-slate-900">Class Wise</h3>
                <p className="text-sm text-blue-600 font-medium">View Grids</p>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-blue-600 transition-colors" />
          </Card>

          <Card 
            className="p-6 hover:shadow-md transition-shadow cursor-pointer flex items-center justify-between group bg-yellow-50/30"
            onClick={() => navigate('/attendance-management/daily')}
          >
            <div className="flex items-center gap-4">
              <div className="p-3 bg-yellow-100 text-yellow-700 rounded-xl">
                <CalendarDays className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-semibold text-lg text-slate-900">Daily Register</h3>
                <p className="text-sm text-yellow-700 font-medium">Mark Today</p>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-yellow-700 transition-colors" />
          </Card>

          {isAdmin && (
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Card className="p-6 hover:shadow-md transition-shadow cursor-pointer flex items-center justify-between group bg-slate-50">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-slate-200 text-slate-700 rounded-xl">
                      <Settings className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-lg text-slate-900">Attendance Settings</h3>
                      <p className="text-sm text-slate-500 font-medium">Configure Late Time</p>
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-slate-700 transition-colors" />
                </Card>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Attendance Settings</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div>
                    <label className="text-sm font-medium mb-1 block">Late Check-in Time (Threshold)</label>
                    <p className="text-sm text-muted-foreground mb-3">
                      Students checking in (P) after this time will automatically be marked as Late (LT).
                    </p>
                    <input 
                      type="time" 
                      step="1"
                      className="border rounded-md px-3 py-2 w-full"
                      value={lateTime}
                      onChange={(e) => setLateTime(e.target.value)}
                    />
                  </div>
                  <Button onClick={handleSaveSettings} disabled={saving} className="w-full">
                    {saving ? 'Saving...' : 'Save Settings'}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
