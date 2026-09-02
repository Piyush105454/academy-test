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
  material_link?: string;
  fresh_session?: string;
  revision_session?: string;
  created_at?: string;
  updated_at?: string;
}

interface EditCurriculumDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: CurriculumItem | null;
  onSuccess: () => void;
}

export function EditCurriculumDialog({
  open,
  onOpenChange,
  item,
  onSuccess,
}: EditCurriculumDialogProps) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    videos: '',
    quiz_content_ppt: '',
    material_link: '',
  });

  useEffect(() => {
    if (item) {
      setFormData({
        videos: item.videos || '',
        quiz_content_ppt: item.quiz_content_ppt || '',
        material_link: item.material_link || '',
      });
    }
  }, [item, open]);

  const handleSave = async () => {
    if (!item) return;

    try {
      setLoading(true);

      const { error } = await (supabase as any)
        .from('curriculum')
        .update({
          videos: formData.videos || null,
          quiz_content_ppt: formData.quiz_content_ppt || null,
          material_link: formData.material_link || null,
          
        })
        .eq('id', item.id);

      if (error) throw error;

      toast.success('Curriculum item updated successfully');
      onOpenChange(false);
      onSuccess();
    } catch (error) {
      console.error('Error updating curriculum:', error);
      toast.error('Failed to update curriculum item');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Curriculum Item</DialogTitle>
          <DialogDescription>
            Update video links, Quiz, Material, and session links for "{item?.module_title}"
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="videos" className="text-sm font-medium">
              Videos Link
            </Label>
            <Input
              id="videos"
              placeholder="https://example.com/videos"
              value={formData.videos}
              onChange={(e) =>
                setFormData({ ...formData, videos: e.target.value })
              }
              className="mt-1"
            />
          </div>

          <div>
            <Label htmlFor="quiz_content_ppt" className="text-sm font-medium">
              Quiz Link
            </Label>
            <Input
              id="quiz_content_ppt"
              placeholder="https://example.com/ppt"
              value={formData.quiz_content_ppt}
              onChange={(e) =>
                setFormData({ ...formData, quiz_content_ppt: e.target.value })
              }
              className="mt-1"
            />
          </div>

          <div>
            <Label htmlFor="material_link" className="text-sm font-medium">
              Material Link
            </Label>
            <Input
              id="material_link"
              placeholder="https://example.com/material"
              value={formData.material_link}
              onChange={(e) =>
                setFormData({ ...formData, material_link: e.target.value })
              }
              className="mt-1"
            />
          </div>

        
          
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
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
