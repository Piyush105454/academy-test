import { useState } from 'react';
import { Button } from '@/components/ui/button';
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
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface AddCoordinatorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function AddCoordinatorDialog({
  open,
  onOpenChange,
  onSuccess,
}: AddCoordinatorDialogProps) {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    location: '',
    status: 'active',
  });
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name || !formData.email) {
      toast({
        title: 'Error',
        description: 'Name and email are required',
        variant: 'destructive',
      });
      return;
    }

    try {
      setLoading(true);
      const normalizedEmail = formData.email.trim().toLowerCase();

      // Check if email exists in coordinators
      const { data: existingCoord } = await (supabase as any)
        .from('coordinators')
        .select('id')
        .ilike('email', normalizedEmail)
        .maybeSingle();

      if (existingCoord) {
        toast({
          title: 'Email Already Registered',
          description: 'This email is already registered as a Coordinator.',
          variant: 'destructive',
        });
        setLoading(false);
        return;
      }

      // Check if email exists in facilitators
      const { data: existingFac } = await (supabase as any)
        .from('facilitators')
        .select('id, name')
        .ilike('email', normalizedEmail)
        .maybeSingle();

      if (existingFac) {
        toast({
          title: 'Email Already Registered',
          description: `This email is already registered as a Facilitator (${existingFac.name}). Duplicate registration across roles is not allowed.`,
          variant: 'destructive',
        });
        setLoading(false);
        return;
      }

      // Check if email exists in user_profiles
      const { data: existingProfile } = await (supabase as any)
        .from('user_profiles')
        .select('id')
        .ilike('email', normalizedEmail)
        .maybeSingle();

      if (existingProfile) {
        toast({
          title: 'Email Already Registered',
          description: 'This email is already registered to an existing account in the system.',
          variant: 'destructive',
        });
        setLoading(false);
        return;
      }

      const { error } = await (supabase as any)
        .from('coordinators')
        .insert([{
          ...formData,
          email: normalizedEmail
        }]);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Coordinator added successfully',
      });

      setFormData({
        name: '',
        email: '',
        phone: '',
        location: '',
        status: 'active',
      });

      onOpenChange(false);
      onSuccess();
    } catch (error) {
      console.error('Error adding coordinator:', error);
      toast({
        title: 'Error',
        description: 'Failed to add coordinator',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-md">
        <DialogHeader>
          <DialogTitle>Add Coordinator</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Name *</Label>
            <Input
              id="name"
              placeholder="Coordinator name"
              value={formData.name}
              onChange={(e) =>
                setFormData({ ...formData, name: e.target.value })
              }
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email *</Label>
            <Input
              id="email"
              type="email"
              placeholder="coordinator@example.com"
              value={formData.email}
              onChange={(e) =>
                setFormData({ ...formData, email: e.target.value })
              }
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone">Phone</Label>
            <Input
              id="phone"
              placeholder="Phone number"
              value={formData.phone}
              onChange={(e) =>
                setFormData({ ...formData, phone: e.target.value })
              }
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="location">Location</Label>
            <Input
              id="location"
              placeholder="Location"
              value={formData.location}
              onChange={(e) =>
                setFormData({ ...formData, location: e.target.value })
              }
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="status">Status</Label>
            <Select
              value={formData.status}
              onValueChange={(value) =>
                setFormData({ ...formData, status: value })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Adding...' : 'Add Coordinator'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
