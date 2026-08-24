import { useState } from 'react';
import { Wrench, ShieldAlert, RefreshCw, LogIn, Clock, Lock, CheckCircle, HelpCircle } from 'lucide-react';
import { useDeveloperMode } from '@/contexts/DeveloperModeContext';
import { useAuth } from '@/contexts/AuthContext';
import wesLogo from '@/assets/wes-logo.jpg';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

export default function MaintenancePage() {
  const { maintenanceMessage, estimatedCompletion } = useDeveloperMode();
  const { signIn, user } = useAuth();
  const [openLogin, setOpenLogin] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);

  const handleAdminSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error('Please enter admin email and password');
      return;
    }
    try {
      setLoggingIn(true);
      const { error } = await signIn(email, password);
      if (error) {
        toast.error('Authentication failed: ' + error.message);
      } else {
        toast.success('Admin authenticated! Maintenance bypass active.');
        setOpenLogin(false);
        window.location.href = '/dashboard';
      }
    } catch (err: any) {
      toast.error('Login error: ' + err.message);
    } finally {
      setLoggingIn(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between p-4 md:p-8 relative overflow-hidden font-sans">
      {/* Background Decorative Gradients */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-primary/20 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-10 right-10 w-[300px] h-[300px] bg-amber-500/10 blur-[100px] rounded-full pointer-events-none" />

      {/* Top Header */}
      <header className="w-full max-w-6xl mx-auto flex items-center justify-between z-10 py-2">
        <div className="flex items-center gap-3">
          <img src={wesLogo} alt="WES Logo" className="h-10 w-10 md:h-12 md:w-12 object-contain rounded-xl shadow-lg border border-slate-800" />
          <div>
            <h1 className="font-bold text-lg md:text-xl text-white tracking-tight">WesFellow Hub</h1>
            <p className="text-xs text-slate-400">Management Platform</p>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="w-full max-w-2xl mx-auto my-auto py-12 px-4 text-center z-10">
        {/* Animated Badge */}
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs md:text-sm font-semibold mb-6 shadow-xl backdrop-blur-md">
          <Wrench className="h-4 w-4 animate-bounce" />
          <span>DEVELOPER MODE ACTIVE</span>
        </div>

        {/* Main Title */}
        <h2 className="text-3xl md:text-5xl font-black text-white tracking-tight mb-4 leading-tight">
          Platform Under Maintenance
        </h2>

        {/* Maintenance Message Card */}
        <div className="bg-slate-900/90 border border-slate-800/80 rounded-2xl p-6 md:p-8 shadow-2xl backdrop-blur-md text-left space-y-4 mb-8">
          <div className="flex items-start gap-3">
            <ShieldAlert className="h-6 w-6 text-amber-400 flex-shrink-0 mt-1" />
            <div>
              <h3 className="font-bold text-slate-200 text-base md:text-lg mb-1">Scheduled Upgrade in Progress</h3>
              <p className="text-slate-400 text-sm leading-relaxed">
                {maintenanceMessage}
              </p>
            </div>
          </div>

          {estimatedCompletion && (
            <div className="pt-4 border-t border-slate-800/80 flex items-center justify-between text-xs md:text-sm text-slate-300">
              <div className="flex items-center gap-2 text-slate-400">
                <Clock className="h-4 w-4 text-primary" />
                <span>Estimated Completion:</span>
              </div>
              <span className="font-bold text-amber-400 bg-amber-400/10 px-3 py-1 rounded-md border border-amber-400/20">
                {estimatedCompletion}
              </span>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center justify-center gap-4">
          <Button
            onClick={() => window.location.reload()}
            variant="default"
            size="lg"
            className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold px-6 shadow-lg gap-2"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh Status
          </Button>
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full max-w-6xl mx-auto py-4 border-t border-slate-900 text-center text-xs text-slate-500 z-10 flex flex-col sm:flex-row items-center justify-between gap-2">
        <p>© {new Date().getFullYear()} WES Foundation. All rights reserved.</p>
        <p className="flex items-center gap-1 text-slate-400">
          <HelpCircle className="h-3.5 w-3.5" />
          Need urgent help? Contact platform administrator.
        </p>
      </footer>
    </div>
  );
}
