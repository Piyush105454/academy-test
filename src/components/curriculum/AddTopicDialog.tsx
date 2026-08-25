import { useState, useEffect } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
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
import { toast } from 'sonner';

interface Class {
  id: string;
  name: string;
}

interface Subject {
  id: string;
  name: string;
}

interface AddTopicDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function AddTopicDialog({ open, onOpenChange, onSuccess }: AddTopicDialogProps) {
  const [classes, setClasses] = useState<Class[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [modules, setModules] = useState<Array<{ no: number; name: string }>>([]);
  const [selectedClass, setSelectedClass] = useState('');
  const [selectedSubject, setSelectedSubject] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedModule, setSelectedModule] = useState('');
  const [topicName, setTopicName] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (open) {
      fetchClasses();
      fetchSubjects();
    }
  }, [open]);

  useEffect(() => {
    if (selectedClass) {
      fetchCategories(selectedClass);
      setSelectedCategory('');
      setSelectedModule('');
    }
  }, [selectedClass]);

  useEffect(() => {
    if (selectedCategory && selectedClass) {
      fetchModules(selectedCategory, selectedClass);
      setSelectedModule('');
    }
  }, [selectedCategory, selectedClass]);

  const fetchClasses = async () => {
    try {
      const { data, error } = await (supabase as any)
        .from('classes')
        .select('id, name')
        .neq('name', '__SYSTEM_DEV_MODE__')
        .neq('id', '00000000-0000-0000-0000-000000000000')
        .order('name', { ascending: true });

      if (error) throw error;
      setClasses(data || []);
    } catch (error) {
      console.error('Error fetching classes:', error);
      toast.error('Failed to load classes');
    }
  };

  const fetchSubjects = async () => {
    try {
      const { data, error } = await (supabase as any)
        .from('subjects')
        .select('id, name')
        .order('name', { ascending: true });

      if (error) {
        console.warn('Subjects table not available');
        setSubjects([]);
        return;
      }
      setSubjects(data || []);
    } catch (error) {
      console.warn('Error fetching subjects:', error);
      setSubjects([]);
    }
  };

  const fetchCategories = async (classId: string) => {
    try {
      const { data, error } = await (supabase as any)
        .from('curriculum')
        .select('content_category')
        .eq('class_id', classId)
        .not('content_category', 'is', null);

      if (error) throw error;

      const uniqueCategories = [...new Set(data?.map((item: any) => item.content_category) || [])].sort();
      setCategories(uniqueCategories as string[]);
    } catch (error) {
      console.error('Error fetching categories:', error);
      toast.error('Failed to load categories');
    }
  };

  const fetchModules = async (category: string, classId: string) => {
    try {
      const { data, error } = await (supabase as any)
        .from('curriculum')
        .select('module_no, module_name')
        .eq('class_id', classId)
        .eq('content_category', category)
        .not('module_name', 'is', null);

      if (error) throw error;

      const uniqueModulesMap = new Map();
      data?.forEach((item: any) => {
        let moduleNo = item.module_no;
        let moduleName = item.module_name;

        if (!moduleNo && moduleName) {
          const match = moduleName.match(/^(\d+)\./);
          if (match) {
            moduleNo = parseInt(match[1]);
          }
        }

        const key = `${moduleNo}`;
        if (!uniqueModulesMap.has(key)) {
          uniqueModulesMap.set(key, { no: moduleNo, name: moduleName });
        }
      });

      const uniqueModules = Array.from(uniqueModulesMap.values()).sort((a, b) => (a.no || 0) - (b.no || 0));
      setModules(uniqueModules);
    } catch (error) {
      console.error('Error fetching modules:', error);
      toast.error('Failed to load modules');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedClass || !selectedCategory || !selectedModule || !topicName.trim()) {
      toast.error('Please fill in all fields');
      return;
    }

    setIsLoading(true);

    try {
      const selectedModuleObj = modules.find(m => m.name === selectedModule);
      const moduleNo = selectedModuleObj?.no || null;

      const { error: insertError } = await (supabase as any)
        .from('curriculum')
        .insert({
          class_id: selectedClass,
          content_category: selectedCategory,
          module_no: moduleNo,
          module_name: selectedModule,
          topics_covered: topicName.trim(),
          videos: '',
          quiz_content_ppt: '',
          subject_id: selectedSubject && selectedSubject !== 'all' ? selectedSubject : null,
        });

      if (insertError) throw insertError;

      toast.success(`Topic "${topicName}" added successfully`);
      setTopicName('');
      setSelectedClass('');
      setSelectedCategory('');
      setSelectedModule('');
      setSelectedSubject('');
      onOpenChange(false);
      onSuccess();
    } catch (error) {
      console.error('Error adding topic:', error);
      toast.error('Failed to add topic');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            Add New Topic
          </DialogTitle>
          <DialogDescription>
            Add a new topic to a specific class, category, and module
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Class Selection */}
          <div className="space-y-2">
            <Label htmlFor="class">Class *</Label>
            <Select value={selectedClass} onValueChange={setSelectedClass}>
              <SelectTrigger>
                <SelectValue placeholder="Select a class" />
              </SelectTrigger>
              <SelectContent>
                {classes.map((cls) => (
                  <SelectItem key={cls.id} value={cls.id}>
                    {cls.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Subject Selection */}
          {subjects.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor="subject">Subject</Label>
              <Select value={selectedSubject} onValueChange={setSelectedSubject}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a subject (optional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Subjects</SelectItem>
                  {subjects.map((subject) => (
                    <SelectItem key={subject.id} value={subject.id}>
                      {subject.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Category Selection */}
          <div className="space-y-2">
            <Label htmlFor="category">Content Category *</Label>
            <Select value={selectedCategory} onValueChange={setSelectedCategory} disabled={!selectedClass}>
              <SelectTrigger>
                <SelectValue placeholder="Select a category" />
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

          {/* Module Selection */}
          <div className="space-y-2">
            <Label htmlFor="module">Module *</Label>
            <Select value={selectedModule} onValueChange={setSelectedModule} disabled={!selectedCategory}>
              <SelectTrigger>
                <SelectValue placeholder="Select a module" />
              </SelectTrigger>
              <SelectContent>
                {modules.map((module) => (
                  <SelectItem key={module.name} value={module.name}>
                    {module.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Topic Name Input */}
          <div className="space-y-2">
            <Label htmlFor="topicName">Topic Name *</Label>
            <Input
              id="topicName"
              placeholder="Enter new topic name"
              value={topicName}
              onChange={(e) => setTopicName(e.target.value)}
              required
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? 'Adding...' : 'Add Topic'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
