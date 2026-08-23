import { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { useDeveloperMode } from '@/contexts/DeveloperModeContext';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Wrench, Shield, CheckCircle2, AlertTriangle, Clock, Power, RefreshCw, Eye, Server, Activity, Lock, Users } from 'lucide-react';
import { toast } from 'sonner';
import wesLogo from '@/assets/wes-logo.jpg';

export default function DeveloperModePage() {
  const { isDevMode, maintenanceMessage, estimatedCompletion, toggleDevMode, updateSettings, lastUpdatedAt, lastUpdatedBy } = useDeveloperMode();
  const { user } = useAuth();

  const [message, setMessage] = useState(maintenanceMessage);
  const [completion, setCompletion] = useState(estimatedCompletion);
  const [saving, setSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    setMessage(maintenanceMessage);
    setCompletion(estimatedCompletion);
  }, [maintenanceMessage, estimatedCompletion]);

  const handleToggle = async (checked: boolean) => {
    try {
      await toggleDevMode(checked);
      if (checked) {
        toast.warning('Developer Mode is ON! Platform is now under maintenance for normal users.');
      } else {
        toast.success('Developer Mode is OFF! Platform is live for all users.');
      }
    } catch (err: any) {
      toast.error('Failed to toggle dev mode: ' + err.message);
    }
  };

  const handleSaveSettings = async () => {
    try {
      setSaving(true);
      await updateSettings({
        maintenanceMessage: message,
        estimatedCompletion: completion,
        lastUpdatedBy: user?.email || 'System Admin',
      });
      toast.success('Maintenance settings updated successfully!');
    } catch (err: any) {
      toast.error('Failed to save settings: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-7xl mx-auto pb-12">
        {/* Page Title & Breadcrumb Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-card p-6 rounded-xl border border-border shadow-sm">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 font-bold px-2.5 py-0.5">
                ADMIN SYSTEM TOOLS
              </Badge>
              <span className="text-xs text-muted-foreground">• Production Maintenance Management</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-foreground flex items-center gap-3">
              <Wrench className="h-7 w-7 text-primary" />
              Developer Mode & Maintenance Control
            </h1>
            <p className="text-sm text-muted-foreground">
              Manage platform maintenance mode, custom announcements, and developer bypass access for production builds.
            </p>
          </div>

          {/* Quick Toggle Button */}
          <div className="flex items-center gap-3 bg-muted/50 p-3 rounded-xl border border-border">
            <div className="text-right">
              <p className="text-xs font-semibold text-foreground">Maintenance Status</p>
              <p className={`text-xs font-bold ${isDevMode ? 'text-amber-500' : 'text-emerald-500'}`}>
                {isDevMode ? 'DEVELOPER MODE ON' : 'NORMAL PRODUCTION MODE'}
              </p>
            </div>
            <Switch
              checked={isDevMode}
              onCheckedChange={handleToggle}
              className="data-[state=checked]:bg-amber-500 scale-125"
            />
          </div>
        </div>

        {/* Master Control Banner */}
        <Card className={`border-2 shadow-md ${isDevMode ? 'border-amber-500/50 bg-amber-500/5' : 'border-emerald-500/50 bg-emerald-500/5'}`}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <div>
              <CardTitle className="text-xl font-bold flex items-center gap-2">
                {isDevMode ? (
                  <>
                    <AlertTriangle className="h-6 w-6 text-amber-500 animate-pulse" />
                    <span>Developer Mode is Currently ACTIVE</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-6 w-6 text-emerald-500" />
                    <span>Platform is Operating NORMALLY</span>
                  </>
                )}
              </CardTitle>
              <CardDescription className="text-sm mt-1">
                {isDevMode
                  ? 'Normal users (Students, Volunteers) are redirected to the "Platform Under Maintenance" page. Admins retain full access.'
                  : 'All users have full access to their respective dashboards and tools.'}
              </CardDescription>
            </div>

            <Button
              size="lg"
              onClick={() => handleToggle(!isDevMode)}
              className={isDevMode ? 'bg-rose-600 hover:bg-rose-700 text-white font-bold gap-2' : 'bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold gap-2'}
            >
              <Power className="h-5 w-5" />
              {isDevMode ? 'Turn OFF Maintenance' : 'Turn ON Developer Mode'}
            </Button>
          </CardHeader>
        </Card>

        {/* Settings & Preview Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Settings Column */}
          <Card className="border border-border shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg font-bold flex items-center gap-2">
                <Shield className="h-5 w-5 text-primary" />
                Maintenance Notice & Settings
              </CardTitle>
              <CardDescription>
                Customize the announcement message and completion timestamp shown to normal users.
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="m-message" className="font-semibold text-sm">
                  Platform Maintenance Message
                </Label>
                <Textarea
                  id="m-message"
                  rows={4}
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  placeholder="Enter custom maintenance message..."
                  className="bg-background text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  This message will be displayed prominently on the maintenance landing page.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="m-time" className="font-semibold text-sm">
                  Estimated Completion Date & Time
                </Label>
                <Input
                  id="m-time"
                  type="text"
                  value={completion}
                  onChange={e => setCompletion(e.target.value)}
                  placeholder="e.g. Today at 11:30 PM IST or Aug 24, 2026 06:00 AM"
                  className="bg-background text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  Optional. Displays a highlighted completion badge to users.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-muted/40 border border-border space-y-2">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5 font-medium">
                    <Clock className="h-3.5 w-3.5 text-primary" />
                    Last Updated:
                  </span>
                  <span className="font-mono text-foreground">{new Date(lastUpdatedAt).toLocaleString()}</span>
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5 font-medium">
                    <Users className="h-3.5 w-3.5 text-primary" />
                    Updated By:
                  </span>
                  <span className="font-semibold text-foreground">{lastUpdatedBy}</span>
                </div>
              </div>
            </CardContent>

            <CardFooter className="flex justify-between border-t border-border pt-4">
              <Button
                variant="outline"
                onClick={() => setShowPreview(!showPreview)}
                className="gap-2"
              >
                <Eye className="h-4 w-4" />
                {showPreview ? 'Hide Live Preview' : 'Show Maintenance Preview'}
              </Button>

              <Button
                onClick={handleSaveSettings}
                disabled={saving}
                className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold gap-2"
              >
                {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Save Settings
              </Button>
            </CardFooter>
          </Card>

          {/* Live Maintenance Preview Column */}
          <Card className="border border-border shadow-sm flex flex-col">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg font-bold flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Eye className="h-5 w-5 text-amber-500" />
                  Maintenance Page Live Preview
                </span>
                <Badge variant="secondary" className="text-[10px] bg-amber-500/10 text-amber-600">
                  USER VIEW PREVIEW
                </Badge>
              </CardTitle>
              <CardDescription>
                Real-time preview of what students and normal users see when Developer Mode is active.
              </CardDescription>
            </CardHeader>

            <CardContent className="flex-1 flex flex-col justify-center p-4">
              <div className="border border-slate-800 bg-slate-950 text-white rounded-2xl p-6 shadow-xl space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <div className="flex items-center gap-2">
                    <img src={wesLogo} alt="WES Logo" className="h-7 w-7 rounded-lg" />
                    <span className="font-bold text-sm">WesFellow Hub</span>
                  </div>
                  <Badge variant="outline" className="border-amber-500/30 text-amber-400 text-[10px]">
                    MAINTENANCE MODE
                  </Badge>
                </div>

                <div className="text-center py-2 space-y-2">
                  <div className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-400 bg-amber-500/10 px-3 py-1 rounded-full border border-amber-500/20">
                    <Wrench className="h-3 w-3 animate-bounce" />
                    DEVELOPER MODE ACTIVE
                  </div>
                  <h3 className="text-xl font-black text-white">Platform Under Maintenance</h3>
                  <p className="text-xs text-slate-400 leading-relaxed max-w-md mx-auto">
                    {message}
                  </p>
                </div>

                {completion && (
                  <div className="bg-slate-900 p-2.5 rounded-lg text-xs flex items-center justify-between text-slate-300 border border-slate-800">
                    <span className="text-slate-400 flex items-center gap-1">
                      <Clock className="h-3 w-3 text-amber-400" />
                      Completion:
                    </span>
                    <span className="font-semibold text-amber-400">{completion}</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* System Diagnostics & Bypass Security Card */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="border border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold flex items-center gap-2 text-muted-foreground">
                <Server className="h-4 w-4 text-primary" />
                Supabase DB Connectivity
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <span className="text-2xl font-black text-emerald-600">CONNECTED</span>
                <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-300">Active</Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-1">Real-time sync enabled</p>
            </CardContent>
          </Card>

          <Card className="border border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold flex items-center gap-2 text-muted-foreground">
                <Lock className="h-4 w-4 text-primary" />
                Developer Bypass Role
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <span className="text-2xl font-black text-primary">ADMIN (ROLE 1)</span>
                <Badge variant="outline" className="font-bold">Secured</Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-1">Non-admins redirected to maintenance</p>
            </CardContent>
          </Card>

          <Card className="border border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold flex items-center gap-2 text-muted-foreground">
                <Activity className="h-4 w-4 text-primary" />
                Active Dev Session
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold truncate max-w-[180px]">{user?.email || 'Admin User'}</span>
                <Badge variant="secondary" className="text-[10px]">AUTHORIZED</Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-1">Logged in via authenticated session</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
