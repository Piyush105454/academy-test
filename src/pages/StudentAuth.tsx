import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertCircle, Loader2 } from 'lucide-react';

export function StudentAuth() {
  const navigate = useNavigate();
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const validateStudentEmail = async (studentEmail: string): Promise<boolean> => {
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('id, class_id, is_active')
        .ilike('email', studentEmail)
        .eq('role_id', 5) // Student role
        .not('class_id', 'is', null) // Must have a class assigned
        .limit(1)
        .maybeSingle();

      if (error) {
        return false;
      }
      
      // If found but inactive, deny validation
      if (data && data.is_active === false) {
        return false;
      }
      
      return !!data;
    } catch (err) {
      return false;
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
        const cleanEmail = email.trim();
        // Validate student email first
        const isStudent = await validateStudentEmail(cleanEmail);
        if (!isStudent) {
          setError('You do not have class email, or your account has been deactivated.');
          setLoading(false);
          return;
        }
        
        const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password,
        });
  
        if (authError) {
          setError(authError.message);
        } else if (authData.user) {
          // Double check user profile status
          const { data: profile } = await supabase
            .from('user_profiles')
            .select('is_active')
            .eq('id', authData.user.id)
            .maybeSingle();
            
          if (profile && profile.is_active === false) {
            await supabase.auth.signOut();
            setError('Your account has been deactivated. Please contact your coordinator.');
          } else {
            navigate('/student-dashboard');
          }
        }
      } catch (err) {
      setError('An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const cleanEmail = email.trim();
      // Validate student email exists in any class
      const isStudent = await validateStudentEmail(cleanEmail);
      if (!isStudent) {
        setError('You do not have class email');
        setLoading(false);
        return;
      }

      // Signup is disabled - students are pre-registered
      setError('Student accounts are pre-registered. Please use your email and password to login.');
    } catch (err) {
      setError('An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-2">
          <CardTitle className="text-2xl">Student Portal</CardTitle>
          <CardDescription>
            {isLogin ? 'Login to your student account' : 'Student signup'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={isLogin ? handleLogin : handleSignup} className="space-y-4">
            {error && (
              <div className="flex gap-2 p-3 bg-red-50 border border-red-200 rounded-md">
                <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            <div className="space-y-2">
              <label className="text-sm font-medium">Email</label>
              <Input
                type="email"
                placeholder="your.email@ccc2526@gmail.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={loading}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Password</label>
              <Input
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={loading}
              />
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={loading}
            >
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isLogin ? 'Login' : 'Signup'}
            </Button>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-300"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white text-gray-500">
                  {isLogin ? "Don't have an account?" : 'Already have an account?'}
                </span>
              </div>
            </div>

            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => {
                setIsLogin(!isLogin);
                setError('');
              }}
              disabled={loading}
            >
              {isLogin ? 'Signup' : 'Login'}
            </Button>
          </form>

          {!isLogin && (
            <p className="text-xs text-gray-500 mt-4 text-center">
              Student accounts are pre-registered by administrators. If you don't have an account, please contact your administrator.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
