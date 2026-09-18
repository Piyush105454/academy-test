import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { Calendar as CalendarIcon, Loader2 } from 'lucide-react';


interface ClassOption {
  id: string;
  name: string;
}

interface TodayClassAttendanceWidgetProps {
  selectedClass?: string;
  selectedDesignation?: string;
  classes?: ClassOption[];
}

export function TodayClassAttendanceWidget({ 
  classes = [],
  selectedClass = 'all',
  selectedDesignation = 'all'
}: TodayClassAttendanceWidgetProps) {
  const [selectedDate, setSelectedDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState(true);

  const [attendanceData, setAttendanceData] = useState<any[]>([]);

  useEffect(() => {
    async function fetchAttendance() {
      setLoading(true);
      try {
        const { data: records, error } = await supabase
          .from('daily_attendance')
          .select('class_id, status')
          .eq('date', selectedDate);

        if (error) throw error;

        // Group by class_id
        const grouped: Record<string, { P: number, LT: number, A: number, L: number, H: number }> = {};
        
        classes.forEach(c => {
          grouped[c.id] = { P: 0, LT: 0, A: 0, L: 0, H: 0 };
        });

        records?.forEach(record => {
          if (grouped[record.class_id]) {
            const status = record.status as keyof typeof grouped[string];
            if (grouped[record.class_id][status] !== undefined) {
              grouped[record.class_id][status]++;
            }
          }
        });

        let formattedData = classes.map(c => ({
          id: c.id,
          name: c.name,
          stats: grouped[c.id] || { P: 0, LT: 0, A: 0, L: 0, H: 0 }
        })).sort((a, b) => a.name.localeCompare(b.name));

        if (selectedClass !== 'all') {
          formattedData = formattedData.filter(c => c.id === selectedClass);
        }

        setAttendanceData(formattedData);
      } catch (error) {
        console.error('Error fetching daily attendance:', error);
      } finally {
        setLoading(false);
      }
    }

    if (classes.length > 0) {
      fetchAttendance();
    } else {
      setLoading(false);
    }
  }, [selectedDate, classes, selectedClass]);

  const allTotal = attendanceData.reduce((acc, curr) => ({
    P: acc.P + curr.stats.P,
    LT: acc.LT + curr.stats.LT,
    A: acc.A + curr.stats.A,
    L: acc.L + curr.stats.L,
    H: acc.H + curr.stats.H,
  }), { P: 0, LT: 0, A: 0, L: 0, H: 0 });

  const totalExpected = allTotal.P + allTotal.LT + allTotal.A + allTotal.L + allTotal.H;
  const presentPercent = totalExpected > 0 ? ((allTotal.P + allTotal.LT) / totalExpected * 100).toFixed(1) : '0.0';

  return (
    <Card className="col-span-1 border-slate-200 shadow-sm flex flex-col h-full bg-slate-50 overflow-hidden font-sans">
      <div className="p-3 bg-slate-100 border-b flex flex-col gap-2">
        <h3 className="text-center font-bold text-slate-800 text-sm tracking-wide uppercase">ATTENDANCE - ALL INSTITUTES</h3>
        <div className="flex items-center justify-between bg-white rounded-md p-2 shadow-sm border border-slate-200">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-800">{new Date(selectedDate).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '-')}</span>
            <div className="relative flex items-center">
              <CalendarIcon className="w-4 h-4 text-slate-500 absolute left-2 pointer-events-none" />
              <input
                type="date"
                className="w-8 h-6 opacity-0 cursor-pointer"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
              />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="font-bold text-emerald-600 text-lg">{allTotal.P + allTotal.LT}</span>
            <span className="font-bold text-indigo-600 text-lg">{presentPercent}%</span>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-0 bg-white">
        {loading ? (
          <div className="flex justify-center items-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-white shadow-sm z-10">
              <tr className="border-b bg-slate-100 text-slate-700 font-bold text-[10px] sm:text-xs">
                <td className="p-2 py-2 text-left uppercase">ALL TOTAL</td>
                <td className="p-2 text-center text-emerald-600">{allTotal.P}</td>
                <td className="p-2 text-center text-rose-500">{allTotal.LT}</td>
                <td className="p-2 text-center text-red-600">{allTotal.A}</td>
                <td className="p-2 text-center text-blue-600">{allTotal.L}</td>
                <td className="p-2 text-center text-slate-600">{allTotal.H}</td>
              </tr>
              <tr className="border-b bg-white text-[10px] sm:text-xs">
                <th className="p-2 text-left font-bold text-slate-500 uppercase tracking-wider">CLASS</th>
                <th className="p-2 font-bold text-slate-500">P</th>
                <th className="p-2 font-bold text-slate-500">LT</th>
                <th className="p-2 font-bold text-slate-500">A</th>
                <th className="p-2 font-bold text-slate-500">L</th>
                <th className="p-2 font-bold text-slate-500">H</th>
              </tr>
            </thead>
            <tbody className="bg-white">
              <tr className="bg-slate-50/80 border-b">
                <td colSpan={6} className="p-2 py-2 text-left font-bold text-slate-700 tracking-wide uppercase">
                  INSTITUTE CLASSES
                </td>
              </tr>
              {attendanceData.map((cls) => (
                <tr key={cls.id} className="border-b last:border-0 hover:bg-slate-50 transition-colors">
                  <td className="p-2 font-semibold text-slate-700">{cls.name}</td>
                  <td className={`p-2 text-center ${cls.stats.P > 0 ? 'text-emerald-600 font-semibold' : 'text-slate-700 font-semibold'}`}>{cls.stats.P}</td>
                  <td className={`p-2 text-center ${cls.stats.LT > 0 ? 'text-rose-500 font-semibold' : 'text-slate-700 font-semibold'}`}>{cls.stats.LT}</td>
                  <td className={`p-2 text-center ${cls.stats.A > 0 ? 'text-red-600 font-semibold' : 'text-slate-700 font-semibold'}`}>{cls.stats.A}</td>
                  <td className={`p-2 text-center ${cls.stats.L > 0 ? 'text-blue-600 font-semibold' : 'text-slate-700 font-semibold'}`}>{cls.stats.L}</td>
                  <td className={`p-2 text-center ${cls.stats.H > 0 ? 'text-slate-600 font-semibold' : 'text-slate-700 font-semibold'}`}>{cls.stats.H}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Card>
  );
}
