import { useState, useEffect } from 'react';
import { Trash2, MapPin, ExternalLink } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface StudentInfoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  student: any;
}

const parseLocationDisplay = (loc: any) => {
  if (!loc || loc === 'null' || loc === '-') return { address: '-', mapUrl: null };
  if (typeof loc === 'object') {
    return {
      address: loc.address || (loc.lat && loc.lng ? `${loc.lat}, ${loc.lng}` : '-'),
      mapUrl: loc.lat && loc.lng ? `https://www.google.com/maps?q=${loc.lat},${loc.lng}` : null
    };
  }
  if (typeof loc === 'string') {
    const trimmed = loc.trim();
    if (!trimmed || trimmed === 'null' || trimmed === '-') return { address: '-', mapUrl: null };
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === 'object') {
        return {
          address: parsed.address || (parsed.lat && parsed.lng ? `${parsed.lat}, ${parsed.lng}` : trimmed),
          mapUrl: parsed.lat && parsed.lng ? `https://www.google.com/maps?q=${parsed.lat},${parsed.lng}` : null
        };
      }
    } catch {
      // plain text location
    }
    return { address: trimmed, mapUrl: null };
  }
  return { address: String(loc).trim() || '-', mapUrl: null };
};

export function StudentInfoDialog({ open, onOpenChange, student }: StudentInfoDialogProps) {
  const [tasks, setTasks] = useState<any[]>([]);
  const [earnings, setEarnings] = useState<any[]>([]);
  const [localHistory, setLocalHistory] = useState<any[]>([]);
  const [details, setDetails] = useState<any>(student);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && student) {
      setDetails(student);
      setLocalHistory(Array.isArray(student.promotion_history) ? student.promotion_history : []);
      fetchStudentData();
    }
  }, [open, student]);

  const fetchStudentData = async () => {
    try {
      setLoading(true);

      let currentInfo = { ...student };

      // 1. Fetch fresh record from students table
      if (student.id) {
        const { data: sRecord } = await supabase
          .from('students')
          .select('*')
          .eq('id', student.id)
          .maybeSingle();
        if (sRecord) {
          currentInfo = { ...currentInfo, ...sRecord };
        }
      }

      // 2. Fetch fresh record from user_profiles by email
      const email = currentInfo.email || student.email;
      if (email) {
        const { data: uRecord } = await supabase
          .from('user_profiles')
          .select('location, bio, phone, profile_image_url')
          .ilike('email', email.trim())
          .maybeSingle();

        if (uRecord) {
          if (!currentInfo.location || currentInfo.location === 'null') {
            currentInfo.location = uRecord.location;
          }
          if (!currentInfo.bio || currentInfo.bio === 'null') {
            currentInfo.bio = uRecord.bio;
          }
          if (!currentInfo.phone_number) {
            currentInfo.phone_number = uRecord.phone;
          }
          if (uRecord.profile_image_url) {
            currentInfo.profile_image_url = uRecord.profile_image_url;
          }
        }
      }

      setDetails(currentInfo);

      // Fetch tasks
      const { data: taskData, error: taskError } = await supabase
        .from('student_task_feedback')
        .select('*')
        .eq('student_id', student.id);
      
      if (taskError) throw taskError;
      setTasks(taskData || []);

      // Fetch earnings
      const { data: earningData, error: earningError } = await supabase
        .from('student_earnings')
        .select('*')
        .eq('student_id', student.id);

      if (earningError) throw earningError;
      setEarnings(earningData || []);

    } catch (error) {
      console.error('Error fetching student data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteHistoryRecord = async (indexToDelete: number) => {
    if (!student) return;
    try {
      const updatedHistory = localHistory.filter((_, index) => index !== indexToDelete);
      
      const { error } = await supabase
        .from('students')
        .update({ promotion_history: updatedHistory })
        .eq('id', student.id);

      if (error) throw error;
      
      setLocalHistory(updatedHistory);
      toast.success('Promotion history record deleted');
      // Update the prop object temporarily so if dialog closes and re-opens without refresh it stays deleted
      student.promotion_history = updatedHistory;
    } catch (error) {
      console.error('Error deleting history record:', error);
      toast.error('Failed to delete history record');
    }
  };

  if (!student) return null;

  const currentStudent = details || student;
  const completedTasks = tasks.filter(t => t.status === 'completed');
  const pendingTasks = tasks.filter(t => t.status === 'pending');
  const totalEarnings = earnings.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  const locInfo = parseLocationDisplay(currentStudent.location);

  const getCalculatedJoiningYear = () => {
    if (currentStudent.joining_year) return currentStudent.joining_year;
    if (!currentStudent.academic_year || !currentStudent.designation) return '-';
    
    const designation = currentStudent.designation.toLowerCase();
    let yearsToSubtract = 0;
    
    if (designation.includes('ccc') || designation.includes('1.')) yearsToSubtract = 0;
    else if (designation.includes('junior') || designation.includes('2.')) yearsToSubtract = 1;
    else if (designation.includes('senior') || designation.includes('3.')) yearsToSubtract = 2;
    else return '-';

    const match = currentStudent.academic_year.match(/^(\d{4})-(\d{2})$/);
    if (match) {
      const startYear = parseInt(match[1], 10) - yearsToSubtract;
      const endYearStr = (startYear + 1).toString().slice(2);
      return `${startYear}-${endYearStr}`;
    }
    return '-';
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-3">
            {currentStudent.profile_image_url ? (
              <img
                src={currentStudent.profile_image_url}
                alt={currentStudent.name}
                className="h-10 w-10 rounded-full object-cover border border-border shrink-0"
              />
            ) : (
              <div className="h-10 w-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-sm shrink-0">
                {currentStudent.name?.slice(0, 2).toUpperCase() || 'ST'}
              </div>
            )}
            <div>
              <DialogTitle className="text-lg">Student Information: {currentStudent.name}</DialogTitle>
              {currentStudent.student_id && (
                <p className="text-xs text-muted-foreground font-mono">{currentStudent.student_id}</p>
              )}
            </div>
          </div>
        </DialogHeader>
        
        {loading ? (
          <div className="flex justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <Card>
                <CardContent className="pt-6">
                  <div className="text-sm text-muted-foreground">Joining Year</div>
                  <div className="text-xl font-bold">{getCalculatedJoiningYear()}</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-sm text-muted-foreground">Current Academic Year</div>
                  <div className="text-xl font-bold">{currentStudent.academic_year || '-'}</div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardContent className="pt-6">
                <h3 className="font-semibold mb-3">Personal Details</h3>
                <div className="grid grid-cols-2 gap-y-3 gap-x-6 text-sm mb-4">
                  <div>
                    <span className="text-muted-foreground block text-xs">Email</span>
                    <span className="font-medium text-foreground break-all">{currentStudent.email || '-'}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-xs">Phone</span>
                    <span className="font-medium text-foreground">{currentStudent.phone_number || '-'}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-xs">Gender</span>
                    <span className="font-medium text-foreground">{currentStudent.gender || '-'}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-xs">DOB</span>
                    <span className="font-medium text-foreground">
                      {currentStudent.dob ? new Date(currentStudent.dob).toLocaleDateString() : '-'}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-xs">Designation</span>
                    <span className="font-medium text-foreground">{currentStudent.designation || '-'}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-xs">Subject</span>
                    <span className="font-medium text-foreground">{currentStudent.subject || '-'}</span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-muted-foreground block text-xs">Location</span>
                    <div className="mt-0.5">
                      {locInfo.mapUrl ? (
                        <a
                          href={locInfo.mapUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-medium text-primary hover:underline inline-flex items-center gap-1.5 break-words"
                          title="View on Google Maps"
                        >
                          <MapPin className="h-3.5 w-3.5 text-rose-500 shrink-0" />
                          <span>{locInfo.address}</span>
                          <ExternalLink className="h-3 w-3 shrink-0 opacity-70" />
                        </a>
                      ) : (
                        <span className="font-medium text-foreground inline-flex items-center gap-1.5 break-words">
                          {locInfo.address !== '-' && <MapPin className="h-3.5 w-3.5 text-rose-500 shrink-0" />}
                          <span>{locInfo.address}</span>
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="border-t pt-3 mt-3">
                  <span className="text-muted-foreground block text-xs mb-1">Bio</span>
                  <p className="text-sm text-foreground italic bg-muted/30 p-2.5 rounded-lg border border-border/50 whitespace-pre-line">
                    {currentStudent.bio && currentStudent.bio !== 'null' && currentStudent.bio.trim()
                      ? `"${currentStudent.bio.trim()}"`
                      : 'No bio provided'}
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <h3 className="font-semibold mb-3">Bank Account Details</h3>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <div className="text-sm text-muted-foreground">Bank Name</div>
                    <div className="text-base font-bold">{currentStudent.bank_name || '-'}</div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">Account Number</div>
                    <div className="text-base font-bold font-mono">{currentStudent.account_number || '-'}</div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">IFSC Code</div>
                    <div className="text-base font-bold font-mono">{currentStudent.ifsc_code || '-'}</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <h3 className="font-semibold mb-4">Task & Earnings Summary</h3>
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <div className="text-2xl font-bold text-green-600">{completedTasks.length}</div>
                    <div className="text-sm text-muted-foreground">Completed Tasks</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-orange-600">{pendingTasks.length}</div>
                    <div className="text-sm text-muted-foreground">Pending Tasks</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-primary">₹{totalEarnings}</div>
                    <div className="text-sm text-muted-foreground">Total Earnings</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <h3 className="font-semibold mb-4">Promotion History</h3>
                {localHistory.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No promotion history available.</p>
                ) : (
                  <div className="space-y-4">
                    {localHistory.map((record: any, index: number) => (
                      <div key={index} className="flex justify-between items-center border-b pb-2 last:border-0">
                        <div>
                          <span className="font-medium">{record.from}</span>
                          <span className="mx-2 text-muted-foreground">→</span>
                          <span className="font-medium text-primary">{record.to}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-xs text-muted-foreground">
                            {new Date(record.date).toLocaleDateString()}
                          </div>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-6 w-6 text-destructive hover:bg-destructive/10 hover:text-destructive"
                            onClick={() => handleDeleteHistoryRecord(index)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
