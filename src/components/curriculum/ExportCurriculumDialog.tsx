import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { Download } from 'lucide-react';
import { toast } from 'sonner';
import { useAcademicYear } from '@/contexts/AcademicYearContext';
import { normalizeTopicKey, extractCoreTopic, isClassMatch } from '@/utils/curriculumTopicUtils';

interface ExportCurriculumDialogProps {
  isOpen: boolean;
  onClose: () => void;
  classes: any[];
  defaultClassId?: string;
}

type TimeframeOption = 'current_year' | 'previous_year' | 'monthly' | 'all_time';

export function ExportCurriculumDialog({
  isOpen,
  onClose,
  classes,
  defaultClassId,
}: ExportCurriculumDialogProps) {
  const { selectedYear } = useAcademicYear();
  const [selectedClass, setSelectedClass] = useState<string>(defaultClassId || 'all');
  const [timeframe, setTimeframe] = useState<TimeframeOption>('current_year');
  const [selectedMonth, setSelectedMonth] = useState<string>('');
  const [isExporting, setIsExporting] = useState(false);

  // Update default when changed
  React.useEffect(() => {
    if (defaultClassId && selectedClass !== 'all' && !selectedClass) {
      setSelectedClass(defaultClassId);
    }
  }, [defaultClassId, selectedClass]);

  const getDateRangeForTimeframe = () => {
    if (timeframe === 'all_time') {
      return { startDate: new Date('2000-01-01'), endDate: new Date('2100-01-01') };
    }
    
    if (timeframe === 'monthly' && selectedMonth) {
      const [year, month] = selectedMonth.split('-');
      const startDate = new Date(parseInt(year), parseInt(month) - 1, 1);
      const endDate = new Date(parseInt(year), parseInt(month), 0, 23, 59, 59); // Last day of month
      return { startDate, endDate };
    }

    let yearStr = selectedYear;
    if (timeframe === 'previous_year') {
      // Basic fallback to previous year based on selected year
      const [start] = selectedYear.split('-');
      const prevStart = parseInt(start) - 1;
      const prevEndStr = (prevStart + 1).toString().slice(2);
      yearStr = `${prevStart}-${prevEndStr}` as any;
    } else if (timeframe === 'current_year') {
      yearStr = selectedYear;
    }

    const [startYearStr] = yearStr.split('-');
    const startYear = parseInt(startYearStr);
    const startDate = new Date(startYear, 5, 1); // June 1st
    const endDate = new Date(startYear + 1, 4, 31, 23, 59, 59); // May 31st
    
    return { startDate, endDate };
  };

  const handleExport = async () => {
    if (!selectedClass) {
      toast.error('Please select a class');
      return;
    }
    
    if (timeframe === 'monthly' && !selectedMonth) {
      toast.error('Please select a month');
      return;
    }

    setIsExporting(true);
    try {
      let classObj: any = null;
      if (selectedClass !== 'all') {
        classObj = classes.find((c) => c.id === selectedClass);
        if (!classObj) throw new Error('Class not found');
      }

      // 1. Fetch Curriculum
      let curriculumQuery = supabase
        .from('curriculum')
        .select(`*, subjects:subject_id(name), classes:class_id(name)`)
        .order('content_category', { ascending: true })
        .order('module_no', { ascending: true });

      if (selectedClass !== 'all') {
        curriculumQuery = curriculumQuery.eq('class_id', selectedClass);
      }

      const { data: curriculumData, error: curriculumError } = await curriculumQuery;

      if (curriculumError) throw curriculumError;

      // 2. Fetch Sessions
      const { startDate, endDate } = getDateRangeForTimeframe();
      let sessionQuery = supabase
        .from('sessions')
        .select('id, topics_covered, status, volunteer_name, class_batch, session_date')
        .gte('session_date', startDate.toISOString())
        .lte('session_date', endDate.toISOString());

      if (selectedClass !== 'all') {
        sessionQuery = sessionQuery.eq('class_batch', classObj.name);
      }

      const { data: sessionData, error: sessionError } = await sessionQuery;

      if (sessionError) throw sessionError;

      // 3. Map Sessions to Topics by Class
      const topicSessions = new Map<string, any[]>();
      (sessionData || []).forEach(session => {
        if (!session.topics_covered || !session.class_batch) return;
        const cleanClass = session.class_batch.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
        const normTopic = normalizeTopicKey(session.topics_covered);
        const coreTopic = extractCoreTopic(session.topics_covered);

        const keys = [
          `${session.class_batch}||${session.topics_covered}`,
          `${cleanClass}||${normTopic}`,
        ];
        if (coreTopic && coreTopic.length >= 4) {
          keys.push(`${cleanClass}||${coreTopic}`);
        }

        keys.forEach(k => {
          const existing = topicSessions.get(k) || [];
          existing.push(session);
          topicSessions.set(k, existing);
        });
      });

      // 4. Generate Data Rows by Class
      const headers = [
        'Class Name',
        'Content Category',
        'Module No',
        'Module Name',
        'Topic Title',
        'Videos',
        'Quiz/Content/PPT',
        'Fresh Session',
        'Revision Session',
        'Status',
        'Latest Date',
        'Volunteer'
      ];

      const classDataMap = new Map<string, any[][]>();

      (curriculumData || []).forEach(item => {
        const className = item.classes?.name || (classObj ? classObj.name : 'Unknown');
        const cleanModuleTitle = item.module_name?.replace(/^-\s+/, '') || '';
        const topic = item.topics_covered || '';
        const cleanClass = className.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
        const normTopic = normalizeTopicKey(topic);
        const coreTopic = extractCoreTopic(topic);
        const sessions = topicSessions.get(`${className}||${topic}`) ||
          topicSessions.get(`${cleanClass}||${normTopic}`) ||
          (coreTopic && coreTopic.length >= 4 ? topicSessions.get(`${cleanClass}||${coreTopic}`) : undefined) ||
          [];
        
        let status = 'Not Started';
        let volunteerName = '-';
        let latestDate = '-';

        const formatDate = (dateStr: string) => {
          if (!dateStr) return '-';
          const d = new Date(dateStr);
          if (isNaN(d.getTime())) return '-';
          const day = String(d.getDate()).padStart(2, '0');
          const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
          const month = months[d.getMonth()];
          const year = d.getFullYear();
          // Adding a normal space at the start prevents Excel from applying a very long default date format that overflows the column.
          return ` ${day} ${month} ${year}`;
        };

        if (sessions.length > 0) {
            // Sort sessions by date descending to get the latest one
            sessions.sort((a, b) => new Date(b.session_date).getTime() - new Date(a.session_date).getTime());
            
            // Find if there's any completed session
            const completedSession = sessions.find(s => s.status === 'completed');
            
            if (completedSession) {
                status = 'Completed';
                volunteerName = completedSession.volunteer_name || 'Unknown';
                latestDate = formatDate(completedSession.session_date);
            } else {
                // Not completed, so use the status of the latest session
                const latestSession = sessions[0];
                status = latestSession.status ? (latestSession.status.charAt(0).toUpperCase() + latestSession.status.slice(1).replace('_', ' ')) : 'In Progress';
                volunteerName = latestSession.volunteer_name || '-';
                latestDate = formatDate(latestSession.session_date);
            }
        }

        const rowData = [
          className,
          item.content_category,
          item.module_no,
          cleanModuleTitle,
          topic,
          item.videos,
          item.quiz_content_ppt,
          item.fresh_session,
          item.revision_session,
          status,
          latestDate,
          volunteerName
        ];

        if (!classDataMap.has(className)) {
          classDataMap.set(className, [headers]); // First row is headers
        }
        classDataMap.get(className)!.push(rowData);
      });

      // 5. Create Workbook and Sheets
      const wb = XLSX.utils.book_new();

      if (classDataMap.size > 0) {
        classDataMap.forEach((rows, className) => {
          // Sheet names must be <= 31 chars and not contain invalid chars
          let safeSheetName = className.replace(/[\\\/\?\*\[\]]/g, '_').substring(0, 31);
          // Ensure uniqueness just in case two classes have same 31 char prefix (unlikely but safe)
          if (wb.SheetNames.includes(safeSheetName)) {
             safeSheetName = safeSheetName.substring(0, 27) + '_' + Math.floor(Math.random() * 1000);
          }
          const ws = XLSX.utils.aoa_to_sheet(rows);
          XLSX.utils.book_append_sheet(wb, ws, safeSheetName);
        });
      } else {
        const ws = XLSX.utils.aoa_to_sheet([headers]);
        XLSX.utils.book_append_sheet(wb, ws, "No Data");
      }

      let timeframeStr = timeframe;
      if (timeframe === 'monthly') timeframeStr = selectedMonth;
      const fileNameClass = selectedClass === 'all' ? 'All_Classes' : classObj.name.replace(/\s+/g, '_');
      
      XLSX.writeFile(wb, `Curriculum_Report_${fileNameClass}_${timeframeStr}.xlsx`);

      toast.success('Report downloaded successfully');
      onClose();
    } catch (err) {
      console.error(err);
      toast.error('Failed to generate report');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Export Curriculum Report</DialogTitle>
          <DialogDescription>
            Download a CSV report containing curriculum data along with completion status for the selected timeframe.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Class</Label>
            <Select value={selectedClass} onValueChange={setSelectedClass}>
              <SelectTrigger>
                <SelectValue placeholder="Select class..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Classes (Mixed)</SelectItem>
                {classes.map((cls) => (
                  <SelectItem key={cls.id} value={cls.id}>
                    {cls.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Timeframe</Label>
            <Select value={timeframe} onValueChange={(val) => setTimeframe(val as TimeframeOption)}>
              <SelectTrigger>
                <SelectValue placeholder="Select timeframe..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="current_year">Current Academic Year ({selectedYear})</SelectItem>
                <SelectItem value="previous_year">Previous Academic Year</SelectItem>
                <SelectItem value="monthly">Monthly Wise</SelectItem>
                <SelectItem value="all_time">All Time</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {timeframe === 'monthly' && (
            <div className="space-y-2">
              <Label>Select Month</Label>
              <Input 
                type="month" 
                value={selectedMonth} 
                onChange={(e) => setSelectedMonth(e.target.value)} 
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isExporting}>
            Cancel
          </Button>
          <Button onClick={handleExport} disabled={isExporting || !selectedClass}>
            <Download className="mr-2 h-4 w-4" />
            {isExporting ? 'Exporting...' : 'Export to CSV'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
