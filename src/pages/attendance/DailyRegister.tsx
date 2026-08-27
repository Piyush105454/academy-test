import React, { useEffect, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/card';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Building2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

interface ClassData {
  id: string;
  name: string;
}

export default function DailyRegister() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [classes, setClasses] = useState<ClassData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchClasses = async () => {
      setLoading(true);
      try {
        if (!user?.email) return;

        // Get user role
        const { data: profile } = await supabase
          .from('user_profiles')
          .select('role_id, id')
          .ilike('email', user.email)
          .maybeSingle();

        const roleId = profile?.role_id;
        let query = supabase.from('classes').select('id, name').neq('name', '__SYSTEM_DEV_MODE__').order('name');

        if (roleId === 4) {
          // Facilitator: only show assigned classes
          const { data: fac } = await supabase
            .from('facilitators')
            .select('id')
            .ilike('email', user.email)
            .maybeSingle();
            
          if (fac) {
            const { data: facClasses } = await supabase
              .from('facilitator_classes')
              .select('class_id')
              .eq('facilitator_id', fac.id);
            
            if (facClasses && facClasses.length > 0) {
              const classIds = facClasses.map(fc => fc.class_id);
              query = query.in('id', classIds);
            } else {
              // No classes assigned
              setClasses([]);
              setLoading(false);
              return;
            }
          }
        }

        const { data, error } = await query;
        if (!error && data) {
          setClasses(data);
        }
      } catch (error) {
        console.error('Error fetching classes:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchClasses();
  }, [user]);

  return (
    <DashboardLayout>
      <div className="p-6 md:p-8 max-w-6xl mx-auto space-y-8">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="icon" onClick={() => navigate('/attendance-management')}>
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 uppercase">Daily Attendance</h1>
            <p className="text-muted-foreground text-sm">Select a class to mark attendance</p>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center p-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : classes.length === 0 ? (
          <div className="text-center p-12 text-muted-foreground">
            No classes found or assigned to you.
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {classes.map((cls) => (
              <Card 
                key={cls.id}
                className="p-6 flex flex-col items-center justify-center gap-4 cursor-pointer hover:border-blue-500 hover:shadow-md transition-all group"
                onClick={() => navigate(`/attendance-management/daily/${cls.id}`)}
              >
                <div className="p-3 bg-slate-100 rounded-lg group-hover:bg-blue-50 transition-colors">
                  <Building2 className="w-6 h-6 text-slate-600 group-hover:text-blue-600" />
                </div>
                <h3 className="font-semibold text-center text-sm group-hover:text-blue-700">{cls.name}</h3>
              </Card>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
