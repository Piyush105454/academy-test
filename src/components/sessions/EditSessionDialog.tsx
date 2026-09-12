import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { GraduationCap, Calendar, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { logActivity } from '@/utils/activityLogger';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { VolunteerSelector } from './VolunteerSelector';

const ALL_DESIGNATIONS = ['1. CCC', '2. Junior Fellow', '3. Senior Fellow'];

interface CurriculumItem {
  id: string;
  content_category: string;
  module_no: number;
  module_name: string;
  topics_covered: string;
  videos: string;
  quiz_content_ppt: string;
}

interface Session {
  id: string;
  title: string;
  session_date: string;
  session_time: string;
  content_category?: string;
  module_name?: string;
  topics_covered?: string;
  videos?: string;
  quiz_content_ppt?: string;
  facilitator_name?: string;
  volunteer_name?: string;
  coordinator_name?: string;
  meeting_link?: string;
  centre_id?: string;
  centre_time_slot_id?: string;
  class_batch?: string;
  volunteer_id?: string;
  coordinator_id?: string;
  guest_teacher_id?: string;
  session_type_option?: string;
  session_type?: string;
  designations?: string[];
}

interface Centre {
  id: string;
  name: string;
  location: string;
  email?: string | null;
}

interface CentreTimeSlot {
  id: string;
  centre_id: string;
  day: string;
  start_time: string;
  end_time: string;
}

interface Volunteer {
  id: string;
  name: string;
  personal_email: string;
  work_email: string;
  phone_number: string;
  organization_name: string;
}

interface Facilitator {
  id: string;
  name: string;
  email: string;
  phone: string;
  location: string;
  status: string;
}

interface Coordinator {
  id: string;
  name: string;
  email: string;
  phone: string;
  location: string;
  status: string;
}

interface EditSessionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  session: Session | null;
  onSuccess: () => void;
}

export function EditSessionDialog({
  open,
  onOpenChange,
  session,
  onSuccess,
}: EditSessionDialogProps) {
  const [formData, setFormData] = useState<Session | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [modules, setModules] = useState<string[]>([]);
  const [topics, setTopics] = useState<CurriculumItem[]>([]);
  const [centres, setCentres] = useState<Centre[]>([]);
  const [centreSlots, setCentreSlots] = useState<CentreTimeSlot[]>([]);
  const [classes, setClasses] = useState<{ id: string; name: string }[]>([]);
  const [volunteers, setVolunteers] = useState<Volunteer[]>([]);
  const [facilitators, setFacilitators] = useState<Facilitator[]>([]);
  const [coordinators, setCoordinators] = useState<Coordinator[]>([]);
  const [selectedTopic, setSelectedTopic] = useState<CurriculumItem | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [selectedDesignations, setSelectedDesignations] = useState<string[]>([]);
  const { toast } = useToast();

  const isCccEmpFellow = !!formData?.class_batch?.toLowerCase().includes('ccc emp');

  useEffect(() => {
    if (session && open) {
      setFormData(session);
      setSelectedDesignations(session.designations || []);
      setSelectedTopic(null);
      fetchAllData();
    } else if (!open) {
      setSelectedTopic(null);
      setTopics([]);
      setModules([]);
    }
  }, [session, open]);

  useEffect(() => {
    if (formData?.class_batch && classes.length > 0) {
      const classObj = classes.find(c => c.name === formData.class_batch);
      if (classObj) {
        setSelectedClassId(classObj.id);
        fetchCategories(classObj.id);
      } else {
        fetchCategories();
      }
    } else if (open) {
      fetchCategories();
    }
  }, [formData?.class_batch, classes, open]);

  useEffect(() => {
    if (formData?.content_category) {
      fetchModules(formData.content_category, selectedClassId || undefined);
    }
  }, [formData?.content_category, selectedClassId]);

  useEffect(() => {
    if (formData?.content_category && formData?.module_name) {
      fetchTopics(formData.content_category, formData.module_name, selectedClassId || undefined, formData.topics_covered || formData.title);
    }
  }, [formData?.content_category, formData?.module_name, selectedClassId]);

  useEffect(() => {
    if (topics.length > 0 && !selectedTopic) {
      const isSameModuleAsInitial = 
        formData?.content_category === session?.content_category && 
        formData?.module_name === session?.module_name;
      
      const targetTopic = formData?.topics_covered || session?.topics_covered || 
        (isSameModuleAsInitial ? (formData?.title || session?.title) : '');

      if (targetTopic) {
        const normalizedTarget = targetTopic.trim().toLowerCase();
        let matched = topics.find(t => 
          t.topics_covered?.trim().toLowerCase() === normalizedTarget
        );
        if (!matched) {
          matched = topics.find(t => 
            t.topics_covered?.trim().toLowerCase().includes(normalizedTarget) ||
            normalizedTarget.includes(t.topics_covered?.trim().toLowerCase())
          );
        }

        if (matched) {
          setSelectedTopic(matched);
        } else if (!topics.some(t => t.id.startsWith('custom-'))) {
          const customTopic: CurriculumItem = {
            id: 'custom-' + targetTopic,
            content_category: formData?.content_category || session?.content_category || '',
            module_no: 0,
            module_name: formData?.module_name || session?.module_name || '',
            topics_covered: targetTopic,
            videos: formData?.videos || session?.videos || '',
            quiz_content_ppt: formData?.quiz_content_ppt || session?.quiz_content_ppt || ''
          };
          setTopics(prev => [customTopic, ...prev]);
          setSelectedTopic(customTopic);
        }
      }
    }
  }, [topics, formData?.topics_covered, session?.topics_covered, formData?.title, session?.title, formData?.content_category, formData?.module_name, selectedTopic]);

  useEffect(() => {
    if (formData?.centre_id) {
      fetchCentreSlots(formData.centre_id);
    }
  }, [formData?.centre_id]);

  const fetchAllData = async () => {
    try {
      const [centresRes, classesRes, volunteersRes, facilitatorsRes, coordinatorsRes] = await Promise.all([
        supabase.from('centres').select('id, name, location, email').eq('status', 'active'),
        supabase.from('classes').select('id, name, email').neq('name', '__SYSTEM_DEV_MODE__').neq('id', '00000000-0000-0000-0000-000000000000').order('name', { ascending: true }),
        supabase.from('volunteers').select('id, name, personal_email, work_email, phone_number, organization_name').eq('is_active', true).order('name', { ascending: true }),
        supabase.from('facilitators').select('id, name, email, phone, location, status').eq('status', 'active').order('name', { ascending: true }),
        supabase.from('coordinators').select('id, name, email, phone, location, status').eq('status', 'active').order('name', { ascending: true }),
      ]);

      setCentres(centresRes.data || []);
      setClasses(classesRes.data || []);
      setVolunteers(volunteersRes.data || []);
      setFacilitators(facilitatorsRes.data || []);
      setCoordinators(coordinatorsRes.data || []);

      // Set selectedClassId if session has class_batch
      let foundClassId = '';
      if (session?.class_batch && classesRes.data) {
        const classObj = classesRes.data.find(c => c.name === session.class_batch);
        if (classObj) {
          foundClassId = classObj.id;
          setSelectedClassId(classObj.id);
        }
      }

      fetchCategories(foundClassId || undefined);

      if (session?.content_category) {
        fetchModules(session.content_category, foundClassId || undefined);
      }
      if (session?.content_category && session?.module_name) {
        fetchTopics(session.content_category, session.module_name, foundClassId || undefined, session.topics_covered || session.title);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    }
  };

  const fetchCategories = async (classId?: string) => {
    try {
      let query: any = supabase
        .from('curriculum')
        .select('content_category')
        .not('content_category', 'is', null);

      if (classId) {
        query = query.eq('class_id', classId);
      }

      let { data, error } = await query;

      if (error) throw error;

      if ((!data || data.length === 0) && classId) {
        const fallbackRes = await supabase
          .from('curriculum')
          .select('content_category')
          .not('content_category', 'is', null);
        if (!fallbackRes.error && fallbackRes.data) {
          data = fallbackRes.data;
        }
      }

      const uniqueCategories = [...new Set(data?.map(item => item.content_category) || [])];

      if (formData?.content_category && !uniqueCategories.includes(formData.content_category)) {
        uniqueCategories.push(formData.content_category);
      }
      if (session?.content_category && !uniqueCategories.includes(session.content_category)) {
        uniqueCategories.push(session.content_category);
      }

      setCategories(uniqueCategories as string[]);
    } catch (error) {
      console.error('Error fetching categories:', error);
    }
  };

  const fetchModules = async (category: string, classId?: string) => {
    try {
      let query: any = supabase
        .from('curriculum')
        .select('module_name')
        .eq('content_category', category)
        .not('module_name', 'is', null);

      if (classId) {
        query = query.eq('class_id', classId);
      }

      let { data, error } = await query;

      if (error) throw error;

      // If no data with class_id filter, try without it (fallback for NULL class_id)
      if ((!data || data.length === 0) && classId) {
        const fallbackQuery = supabase
          .from('curriculum')
          .select('module_name')
          .eq('content_category', category)
          .not('module_name', 'is', null);
        
        const { data: fallbackData, error: fallbackError } = await fallbackQuery;
        if (fallbackError) throw fallbackError;
        data = fallbackData;
      }

      const uniqueModules = [...new Set(data?.map(item => item.module_name) || [])];
      if (formData?.module_name && !uniqueModules.includes(formData.module_name)) {
        uniqueModules.push(formData.module_name);
      }
      if (session?.module_name && !uniqueModules.includes(session.module_name)) {
        uniqueModules.push(session.module_name);
      }
      setModules(uniqueModules as string[]);
    } catch (error) {
      console.error('Error fetching modules:', error);
    }
  };

  const fetchTopics = async (category: string, moduleName: string, classId?: string, topicToSelect?: string) => {
    try {
      let query: any = supabase
        .from('curriculum')
        .select('*')
        .eq('content_category', category)
        .eq('module_name', moduleName)
        .order('topics_covered', { ascending: true });

      if (classId) {
        query = query.eq('class_id', classId);
      }

      let { data, error } = await query;

      if (error) throw error;

      // If no data with class_id filter, try without it (fallback for NULL class_id)
      if ((!data || data.length === 0) && classId) {
        const fallbackQuery = supabase
          .from('curriculum')
          .select('*')
          .eq('content_category', category)
          .eq('module_name', moduleName)
          .order('topics_covered', { ascending: true });
        
        const { data: fallbackData, error: fallbackError } = await fallbackQuery;
        if (fallbackError) throw fallbackError;
        data = fallbackData;
      }

      let topicsList = [...(data || [])];
      const isSameModule = 
        category === session?.content_category && 
        moduleName === session?.module_name;

      const targetTopic = topicToSelect || formData?.topics_covered || session?.topics_covered ||
        (isSameModule ? (formData?.title || session?.title) : '');

      if (targetTopic && topicsList.length > 0) {
        const normalizedTarget = targetTopic.trim().toLowerCase();
        let matched = topicsList.find(t => 
          t.topics_covered?.trim().toLowerCase() === normalizedTarget
        );
        if (!matched) {
          matched = topicsList.find(t => 
            t.topics_covered?.trim().toLowerCase().includes(normalizedTarget) ||
            normalizedTarget.includes(t.topics_covered?.trim().toLowerCase())
          );
        }

        if (matched) {
          setSelectedTopic(matched);
        } else {
          const customTopic: CurriculumItem = {
            id: 'custom-' + targetTopic,
            content_category: category,
            module_no: 0,
            module_name: moduleName,
            topics_covered: targetTopic,
            videos: formData?.videos || session?.videos || '',
            quiz_content_ppt: formData?.quiz_content_ppt || session?.quiz_content_ppt || ''
          };
          topicsList = [customTopic, ...topicsList];
          setSelectedTopic(customTopic);
        }
      }

      setTopics(topicsList);
    } catch (error) {
      console.error('Error fetching topics:', error);
    }
  };

  const fetchCentreSlots = async (centreId: string) => {
    try {
      const { data } = await supabase
        .from('centre_time_slots')
        .select('id, centre_id, day, start_time, end_time')
        .eq('centre_id', centreId)
        .order('day', { ascending: true })
        .order('start_time', { ascending: true });

      setCentreSlots(data || []);
    } catch (error) {
      console.error('Error fetching centre slots:', error);
    }
  };

  const handleTopicSelect = (topicId: string) => {
    const topic = topics.find(t => t.id === topicId);
    if (topic) {
      setSelectedTopic(topic);
      setFormData(prev => prev ? {
        ...prev,
        module_name: topic.module_name || '',
        topics_covered: topic.topics_covered || '',
        videos: topic.videos || '',
        quiz_content_ppt: topic.quiz_content_ppt || '',
        title: topic.topics_covered || '',
      } : null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData) return;

    if (!formData.coordinator_id) {
      toast({
        title: 'Error',
        description: 'Please select a coordinator',
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);

    try {
      // Get the time from the selected time slot
      const selectedSlot = centreSlots.find(s => s.id === formData.centre_time_slot_id);
      const sessionTime = selectedSlot?.start_time || formData.session_time;

      const { error } = await supabase
        .from('sessions')
        .update({
          title: formData.title,
          session_date: formData.session_date,
          session_time: sessionTime,
          content_category: (formData.session_type === 'guest_speaker' || session?.session_type === 'guest_speaker') ? 'Life and Academic Journey' : formData.content_category,
          module_name: formData.module_name,
          topics_covered: formData.topics_covered,
          videos: formData.videos,
          quiz_content_ppt: formData.quiz_content_ppt,
          class_batch: formData.class_batch,
          centre_id: formData.centre_id,
          centre_time_slot_id: formData.centre_time_slot_id,
          session_type_option: formData.session_type_option,
          facilitator_name: formData.facilitator_name,
          guest_teacher_id: formData.guest_teacher_id || null,
          volunteer_id: formData.volunteer_id || null,
          volunteer_name: formData.volunteer_name || '',
          coordinator_id: formData.coordinator_id || null,
          designations: isCccEmpFellow ? selectedDesignations : [],
          status: 'rescheduled',
        })
        .eq('id', formData.id);

      if (error) throw error;

      await logActivity('UPDATE', 'Sessions', `Updated session: "${formData.title}" (Date: ${formData.session_date}, Class: ${formData.class_batch})`);

      // Try to update Google Calendar
      try {
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
        
        const selectedSlot = centreSlots.find(s => s.id === formData.centre_time_slot_id);
        const sessionTime = selectedSlot?.start_time || formData.session_time;
        const timePrefix = sessionTime ? sessionTime.substring(0, 5) : '09:00';
        const startDateTime = new Date(`${formData.session_date}T${timePrefix}:00+05:30`);
        const endDateTime = new Date(startDateTime.getTime() + 60 * 60 * 1000);

        // Get volunteer, facilitator, coordinator, class, and centre emails
        const volunteerData = volunteers.find(v => v.id === formData.volunteer_id);
        const facilitatorData = facilitators.find(f => f.id === formData.guest_teacher_id) || 
                                 facilitators.find(f => f.name.trim().toLowerCase() === formData.facilitator_name?.trim().toLowerCase());
        const coordinatorData = coordinators.find(c => c.id === formData.coordinator_id);
        const classData = classes.find(c => c.name.trim().toLowerCase() === formData.class_batch?.trim().toLowerCase());
        const centreData = centres.find(c => c.id === formData.centre_id);

        const patchData = {
          sessionId: formData.id,
          title: formData.title,
          description: `
📚 CONTENT INFORMATION

Category:    ${formData.content_category || 'N/A'}
Module:      ${formData.module_name || 'N/A'}
Topic:       ${formData.topics_covered || 'N/A'}
Session Type: ${formData.session_type_option === 'fresh' ? '🆕 Fresh Session' : '🔄 Revision Session'}

👥 VOLUNTEER, FACILITATOR & COORDINATOR
 
Volunteer:   ${formData.volunteer_name || 'N/A'} ${volunteerData?.work_email || volunteerData?.personal_email ? `(${[volunteerData.work_email, volunteerData.personal_email].filter(Boolean).join(', ')})` : ''}
Facilitator: ${formData.facilitator_name || 'N/A'}
Coordinator: ${formData.coordinator_name || 'N/A'}

📎 RESOURCES

${formData.videos ? `📹 Videos: ${formData.videos}` : ''}
${formData.quiz_content_ppt ? `📊 PPT/Quiz: ${formData.quiz_content_ppt}` : ''}

📋 SESSION TEMPLATE

Use this template to prepare your session:
${window.location.origin}/ppt/1.1.7.1.3%20GT%20WES_%20Sample%20Template%20for%20Session.pptx

Session updated with new details.
            `.trim(),
          startDateTime: startDateTime.toISOString(),
          endDateTime: endDateTime.toISOString(),
          volunteerEmails: [
            volunteerData?.personal_email,
            volunteerData?.work_email
          ].filter((email): email is string => !!(email && typeof email === 'string' && email.trim())),
          facilitatorEmail: facilitatorData?.email || '',
          coordinatorEmail: coordinatorData?.email || '',
          classEmail: classData?.email,
          centreEmail: centreData?.email,
        };

        console.log('Sending PATCH request to sync-google-calendar with centre email:', centreData?.email);

        await fetch(`${supabaseUrl}/functions/v1/sync-google-calendar`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseAnonKey}`,
          },
          body: JSON.stringify(patchData),
        });
      } catch (calendarError) {
        console.warn('Could not update Google Calendar:', calendarError);
      }

      toast({
        title: 'Success',
        description: 'Session updated successfully',
      });

      onOpenChange(false);
      onSuccess();
    } catch (error) {
      console.error('Error updating session:', error);
      toast({
        title: 'Error',
        description: 'Failed to update session',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (!formData) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-[95vw] sm:max-w-[600px] md:max-w-[700px] max-h-[90vh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader className="mb-4">
          <DialogTitle className="flex flex-col sm:flex-row items-start sm:items-center gap-2 text-lg sm:text-xl">
            <GraduationCap className="h-5 w-5 text-green-500 flex-shrink-0" />
            <span className="break-words">Edit Session</span>
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-5">
          {/* Date Selection */}
          <div className="space-y-2">
            <Label htmlFor="session_date" className="text-sm sm:text-base">Session Date *</Label>
            <div className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-gray-400" />
              <Input
                id="session_date"
                type="date"
                value={formData.session_date}
                onChange={(e) => setFormData({ ...formData, session_date: e.target.value })}
                className="text-sm sm:text-base"
                required
              />
            </div>
          </div>

          {/* Volunteer Selection */}
          <div className="space-y-2">
            <Label htmlFor="volunteer" className="text-sm sm:text-base">Select Volunteer *</Label>
            {volunteers.length === 0 ? (
              <div className="p-3 bg-yellow-50 border border-yellow-200 rounded text-xs sm:text-sm text-yellow-800">
                No active volunteers available.
              </div>
            ) : (
              <VolunteerSelector
                volunteers={volunteers}
                selectedVolunteer={formData.volunteer_id || ''}
                onSelectVolunteer={(volunteerId, volunteerName) => {
                  setFormData({ ...formData, volunteer_id: volunteerId, volunteer_name: volunteerName });
                }}
                placeholder="Choose a volunteer..."
              />
            )}
          </div>

          {/* Facilitator Selection */}
          <div className="space-y-2">
            <Label htmlFor="facilitator" className="text-sm sm:text-base">Select Facilitator *</Label>
            <Select 
              value={formData.guest_teacher_id || facilitators.find(f => f.name.trim().toLowerCase() === formData.facilitator_name?.trim().toLowerCase())?.id || ''} 
              onValueChange={(value) => {
                const facilitator = facilitators.find(f => f.id === value);
                if (facilitator) {
                  setFormData({ 
                    ...formData, 
                    guest_teacher_id: facilitator.id, 
                    facilitator_name: facilitator.name 
                  });
                }
              }}
            >
              <SelectTrigger className="text-sm sm:text-base">
                <SelectValue placeholder="Choose a facilitator" />
              </SelectTrigger>
              <SelectContent>
                {facilitators.map((facilitator) => (
                  <SelectItem key={facilitator.id} value={facilitator.id}>
                    {facilitator.name} ({facilitator.location})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Coordinator Selection */}
          <div className="space-y-2">
            <Label htmlFor="coordinator" className="text-sm sm:text-base">Select Coordinator *</Label>
            <Select value={formData.coordinator_id || ''} onValueChange={(value) => {
              const coordinator = coordinators.find(c => c.id === value);
              if (coordinator) {
                setFormData({ ...formData, coordinator_id: value, coordinator_name: coordinator.name });
              }
            }}>
              <SelectTrigger className="text-sm sm:text-base">
                <SelectValue placeholder="Choose a coordinator" />
              </SelectTrigger>
              <SelectContent>
                {coordinators.map((coordinator) => (
                  <SelectItem key={coordinator.id} value={coordinator.id}>
                    {coordinator.name} ({coordinator.location})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Class Selection - FIRST */}
          <div className="border-t border-border pt-4">
            <h4 className="font-medium text-sm sm:text-base text-foreground mb-3">Select Class & Content</h4>
            
            <div className="space-y-2 mb-4">
              <Label htmlFor="class_batch" className="text-sm sm:text-base">Class *</Label>
              <Select value={formData.class_batch || ''} onValueChange={(value) => setFormData({ ...formData, class_batch: value })}>
                <SelectTrigger className="text-sm sm:text-base">
                  <SelectValue placeholder="Select a class" />
                </SelectTrigger>
                <SelectContent>
                  {classes.map((cls) => (
                    <SelectItem key={cls.id} value={cls.name}>
                      {cls.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Designation Multi-Select Option - ONLY SHOW WHEN CLASS IS CCC EMP Fellow */}
            {isCccEmpFellow && (
              <div className="space-y-2 mb-4 p-3 bg-blue-50/60 dark:bg-blue-950/30 rounded-lg border border-blue-200/60 dark:border-blue-800/40">
                <Label htmlFor="designations" className="text-sm font-semibold text-blue-950 dark:text-blue-100 flex items-center justify-between">
                  <span>Designation Option (Target Students)</span>
                  <span className="text-xs font-normal text-muted-foreground bg-blue-100 dark:bg-blue-900/50 px-2 py-0.5 rounded text-blue-800 dark:text-blue-300">CCC EMP Fellow Only</span>
                </Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="w-full justify-between text-left font-normal bg-background"
                    >
                      <span className="truncate">
                        {selectedDesignations.length === 0
                          ? "All Designations"
                          : selectedDesignations.length === ALL_DESIGNATIONS.length
                          ? "All Designations"
                          : selectedDesignations.join(", ")}
                      </span>
                      <ChevronDown className="h-4 w-4 opacity-50 shrink-0 ml-2" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[300px] p-3" align="start">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between pb-2 border-b">
                        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Select Designations</span>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            className="text-xs text-primary hover:underline font-medium"
                            onClick={() => setSelectedDesignations([...ALL_DESIGNATIONS])}
                          >
                            Select All
                          </button>
                          <button
                            type="button"
                            className="text-xs text-muted-foreground hover:underline"
                            onClick={() => setSelectedDesignations([])}
                          >
                            Clear
                          </button>
                        </div>
                      </div>
                      <div className="space-y-2 pt-1">
                        {ALL_DESIGNATIONS.map((des) => {
                          const isChecked = selectedDesignations.includes(des);
                          return (
                            <label
                              key={des}
                              className="flex items-center gap-2 text-sm cursor-pointer p-1.5 rounded hover:bg-accent/50 transition-colors"
                            >
                              <Checkbox
                                checked={isChecked}
                                onCheckedChange={(checked) => {
                                  if (checked) {
                                    setSelectedDesignations([...selectedDesignations, des]);
                                  } else {
                                    setSelectedDesignations(selectedDesignations.filter((d) => d !== des));
                                  }
                                }}
                              />
                              <span>{des}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>
                <p className="text-xs text-muted-foreground">
                  Filter session to specific student designations (1. CCC, 2. Junior Fellow, 3. Senior Fellow).
                </p>
              </div>
            )}

            {/* Content Selection */}
            <div className="space-y-2 mb-4">
              <Label htmlFor="category" className="text-sm sm:text-base">Content Category *</Label>
              <Select value={formData.content_category || ''} onValueChange={(value) => {
                setFormData({ ...formData, content_category: value, module_name: '', topics_covered: '' });
                setSelectedTopic(null);
              }}>
                <SelectTrigger className="text-sm sm:text-base">
                  <SelectValue placeholder="Select a content category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((category) => (
                    <SelectItem key={category} value={category}>
                      {category}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {formData.content_category && modules.length > 0 && (
              <div className="space-y-2 mb-4">
                <Label htmlFor="module" className="text-sm sm:text-base">Module Name *</Label>
                <Select value={formData.module_name || ''} onValueChange={(value) => {
                  setFormData({ ...formData, module_name: value, topics_covered: '' });
                  setSelectedTopic(null);
                }}>
                  <SelectTrigger className="text-sm sm:text-base">
                    <SelectValue placeholder="Select a module" />
                  </SelectTrigger>
                  <SelectContent>
                    {modules.map((module) => (
                      <SelectItem key={module} value={module}>
                        {module}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {formData.module_name && topics.length > 0 && (
              <div className="space-y-2 mb-4">
                <Label htmlFor="topic" className="text-sm sm:text-base">Select Topic *</Label>
                <Select value={selectedTopic?.id || ''} onValueChange={handleTopicSelect}>
                  <SelectTrigger className="text-sm sm:text-base">
                    <SelectValue placeholder="Choose a topic to auto-fill fields" />
                  </SelectTrigger>
                  <SelectContent>
                    {topics.map((topic) => (
                      <SelectItem key={topic.id} value={topic.id}>
                        {topic.topics_covered}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {/* Content Details */}
          <div className="border-t border-border pt-4">
            <h4 className="font-medium text-sm sm:text-base text-foreground mb-3">Content Details {selectedTopic && '(Auto-filled)'}</h4>
            
            <div className="space-y-2 mb-4">
              <Label htmlFor="session_type_option" className="text-sm sm:text-base">Session Type Option *</Label>
              <Select value={formData.session_type_option || 'fresh'} onValueChange={(value) => setFormData({ ...formData, session_type_option: value })}>
                <SelectTrigger className="text-sm sm:text-base">
                  <SelectValue placeholder="Select session type option" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fresh">Fresh</SelectItem>
                  <SelectItem value="revision">Revision</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2 mb-4">
              <Label htmlFor="title" className="text-sm sm:text-base">Title *</Label>
              <Input
                id="title"
                placeholder="Session title"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                className="text-sm sm:text-base"
                required
              />
            </div>

            <div className="space-y-2 mb-4">
              <Label htmlFor="videos" className="text-sm sm:text-base">Videos</Label>
              <Input
                id="videos"
                placeholder="Video links or references"
                value={formData.videos || ''}
                onChange={(e) => setFormData({ ...formData, videos: e.target.value })}
                disabled={!!selectedTopic}
                className="text-sm sm:text-base"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="quiz_content_ppt" className="text-sm sm:text-base">Quiz/Content PPT</Label>
              <Input
                id="quiz_content_ppt"
                placeholder="Quiz or content PPT link"
                value={formData.quiz_content_ppt || ''}
                onChange={(e) => setFormData({ ...formData, quiz_content_ppt: e.target.value })}
                disabled={!!selectedTopic}
                className="text-sm sm:text-base"
              />
              <p className="text-xs text-muted-foreground mt-1">shared by guest / local teacher</p>
            </div>
          </div>

          {/* Centre & Time Slot Selection */}
          <div className="border-t border-border pt-4">
            <h4 className="font-medium text-sm sm:text-base text-foreground mb-3">Select Centre & Time Slot</h4>
            
            <div className="space-y-2 mb-4">
              <Label htmlFor="centre" className="text-sm sm:text-base">Centre *</Label>
              <Select value={formData.centre_id || ''} onValueChange={(value) => {
                setFormData({ ...formData, centre_id: value, centre_time_slot_id: '' });
              }}>
                <SelectTrigger className="text-sm sm:text-base">
                  <SelectValue placeholder="Choose a centre" />
                </SelectTrigger>
                <SelectContent>
                  {centres.map((centre) => (
                    <SelectItem key={centre.id} value={centre.id}>
                      {centre.name} ({centre.location})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {formData.centre_id && centreSlots.length > 0 && (
              <div className="space-y-2">
                <Label htmlFor="slot" className="text-sm sm:text-base">Time Slot *</Label>
                <Select value={formData.centre_time_slot_id || ''} onValueChange={(value) => setFormData({ ...formData, centre_time_slot_id: value })}>
                  <SelectTrigger className="text-sm sm:text-base">
                    <SelectValue placeholder="Choose a time slot" />
                  </SelectTrigger>
                  <SelectContent>
                    {centreSlots.map((slot) => (
                      <SelectItem key={slot.id} value={slot.id}>
                        {slot.start_time} to {slot.end_time}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {/* Session Template */}
          <div className="border-t border-border pt-4">
            <h4 className="font-medium text-sm sm:text-base text-foreground mb-3">Session Template</h4>
            
            <div className="space-y-2">
              <a 
                href="/ppt/1.1.7.1.3%20GT%20WES_%20Sample%20Template%20for%20Session.pptx"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded text-sm text-blue-600 hover:bg-blue-100 transition-colors"
              >
                📄 Open Session Template
              </a>
              <p className="text-xs text-muted-foreground mt-2">
                Use this template to prepare your session content
              </p>
            </div>
          </div>

          <DialogFooter className="flex flex-col-reverse sm:flex-row gap-2 sm:gap-3 pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="w-full sm:w-auto text-sm sm:text-base">
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading} className="w-full sm:w-auto text-sm sm:text-base">
              {isLoading ? 'Updating...' : 'Update Session'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
