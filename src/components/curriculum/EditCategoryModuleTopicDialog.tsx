import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface CurriculumItem {
  id: string;
  content_category: string;
  module_code: string;
  module_title: string;
  topic_title: string;
  videos: string;
  quiz_content_ppt: string;
  fresh_session?: string;
  revision_session?: string;
  created_at?: string;
  updated_at?: string;
}

interface EditCategoryModuleTopicDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: CurriculumItem | null;
  onSuccess: () => void;
}

export function EditCategoryModuleTopicDialog({
  open,
  onOpenChange,
  item,
  onSuccess,
}: EditCategoryModuleTopicDialogProps) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    content_category: '',
    module_name: '',
    topics_covered: '',
  });

  useEffect(() => {
    if (item) {
      setFormData({
        content_category: item.content_category || '',
        module_name: item.module_title || '',
        topics_covered: item.topic_title || '',
      });
    }
  }, [item, open]);

  const handleSave = async () => {
    if (!item) return;

    try {
      setLoading(true);

      const oldCategory = item.content_category;
      const oldModule = item.module_title;
      const oldTopic = item.topic_title;

      const newCategory = formData.content_category.trim() || null;
      const newModule = formData.module_name.trim() || null;
      const newTopic = formData.topics_covered.trim() || null;

      const { error } = await supabase
        .from('curriculum')
        .update({
          content_category: newCategory,
          module_name: newModule,
          topics_covered: newTopic,
          updated_at: new Date().toISOString(),
        })
        .eq('id', item.id);

      if (error) throw error;

      // Cascade update to sessions table so scheduled sessions stay linked
      if (oldTopic) {
        const sessionUpdate: any = {};
        if (newTopic && newTopic !== oldTopic) sessionUpdate.topics_covered = newTopic;
        if (newModule && newModule !== oldModule) sessionUpdate.module_name = newModule;
        if (newCategory && newCategory !== oldCategory) sessionUpdate.content_category = newCategory;

        if (Object.keys(sessionUpdate).length > 0) {
          const { error: sessionErr } = await supabase
            .from('sessions')
            .update(sessionUpdate)
            .eq('topics_covered', oldTopic);

          if (sessionErr) {
            console.warn('Warning: Failed to sync sessions table with new curriculum details:', sessionErr);
          }
        }
      }

      toast.success('Category, Module & Topic updated successfully');
      onOpenChange(false);
      onSuccess();
    } catch (error) {
      console.error('Error updating curriculum details:', error);
      toast.error('Failed to update Category, Module & Topic');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Category, Module & Topic</DialogTitle>
          <DialogDescription>
            Update category, module name, and topic title for this curriculum item.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="content_category" className="text-xs font-semibold">
              Category *
            </Label>
            <Input
              id="content_category"
              value={formData.content_category}
              onChange={(e) => setFormData({ ...formData, content_category: e.target.value })}
              placeholder="e.g. Application of AI"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="module_name" className="text-xs font-semibold">
              Module No & Name *
            </Label>
            <Input
              id="module_name"
              value={formData.module_name}
              onChange={(e) => setFormData({ ...formData, module_name: e.target.value })}
              placeholder="e.g. Module 9 - Application of AI"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="topics_covered" className="text-xs font-semibold">
              Topics Covered *
            </Label>
            <Input
              id="topics_covered"
              value={formData.topics_covered}
              onChange={(e) => setFormData({ ...formData, topics_covered: e.target.value })}
              placeholder="e.g. 9.1 - Introduction to bank"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={loading}>
            {loading ? 'Saving...' : 'Save Changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
