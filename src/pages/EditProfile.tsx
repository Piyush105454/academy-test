import { useState, useEffect } from 'react';
import { ArrowLeft, Upload, X, MapPin, ExternalLink, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export default function EditProfile() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [fetchingLocation, setFetchingLocation] = useState(false);
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const [profileImageFile, setProfileImageFile] = useState<File | null>(null);
  const [profileData, setProfileData] = useState({
    full_name: '',
    phone: '',
    bio: '',
    location: '',
  });

  const [isStudent, setIsStudent] = useState(false);
  const [bankName, setBankName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [ifscCode, setIfscCode] = useState('');
  const [isLocked, setIsLocked] = useState(false);

  useEffect(() => {
    if (user?.id) {
      loadProfileData();
    }
  }, [user]);

  const loadProfileData = async () => {
    try {
      setLoading(true);
      
      // Fetch user profile from user_profiles table
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', user?.id)
        .single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      if (data) {
        setProfileData({
          full_name: data.full_name || '',
          phone: data.phone || '',
          bio: data.bio && data.bio !== 'null' ? data.bio : '',
          location: data.location && data.location !== 'null' ? data.location : '',
        });
        if (data.profile_image_url) {
          setProfileImage(data.profile_image_url);
        }

        // Check if student (role_id = 5)
        if (data.role_id === 5) {
          setIsStudent(true);

          // Fetch student record by email
          const { data: studentRecord } = await supabase
            .from('students')
            .select('bank_name, account_number, ifsc_code, allow_profile_edit, location, bio, phone_number, name')
            .ilike('email', data.email)
            .maybeSingle();

          if (studentRecord) {
            setBankName(studentRecord.bank_name || '');
            setAccountNumber(studentRecord.account_number || '');
            setIfscCode(studentRecord.ifsc_code || '');
            setIsLocked(studentRecord.allow_profile_edit === false);

            setProfileData(prev => ({
              full_name: prev.full_name || studentRecord.name || '',
              phone: prev.phone || studentRecord.phone_number || '',
              bio: prev.bio || (studentRecord.bio && studentRecord.bio !== 'null' ? studentRecord.bio : ''),
              location: prev.location || (studentRecord.location && studentRecord.location !== 'null' ? studentRecord.location : ''),
            }));
          }
        }
      }
    } catch (error) {
      console.error('Error loading profile:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        toast.error('Image size must be less than 5MB');
        return;
      }

      // Validate file type
      if (!file.type.startsWith('image/')) {
        toast.error('Please select a valid image file');
        return;
      }

      setProfileImageFile(file);
      const reader = new FileReader();
      reader.onload = (e) => {
        setProfileImage(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const uploadProfileImage = async (): Promise<string | null> => {
    if (!profileImageFile || !user?.id) return null;

    try {
      setUploading(true);
      const fileExt = profileImageFile.name.split('.').pop();
      const fileName = `${user.id}-${Date.now()}.${fileExt}`;
      const filePath = `${user.id}/${fileName}`;

      // Upload to storage
      const { error: uploadError } = await supabase.storage
        .from('profile-images')
        .upload(filePath, profileImageFile, { upsert: true });

      if (uploadError) {
        console.error('Upload error:', uploadError);
        toast.error('Image upload failed. You can save your profile without an image.');
        return null;
      }

      // Get public URL
      const { data } = supabase.storage
        .from('profile-images')
        .getPublicUrl(filePath);

      return data.publicUrl;
    } catch (error) {
      console.error('Error uploading image:', error);
      toast.error('Image upload failed. Continuing without image.');
      return null;
    } finally {
      setUploading(false);
    }
  };

  const handleSaveProfile = async () => {
    if (isLocked) {
      toast.error('Profile editing is locked by the admin.');
      return;
    }

    if (isStudent) {
      if (accountNumber && accountNumber.trim()) {
        const accountRegex = /^\d{9,18}$/;
        if (!accountRegex.test(accountNumber.trim())) {
          toast.error('Bank Account Number must be between 9 and 18 digits');
          return;
        }
      }

      if (ifscCode && ifscCode.trim()) {
        const ifscRegex = /^[A-Za-z]{4}0[A-Za-z0-9]{6}$/;
        if (!ifscRegex.test(ifscCode.trim())) {
          toast.error('IFSC Code must be an 11-character alphanumeric code (e.g. SBIN0001234)');
          return;
        }
      }
    }

    try {
      setSaving(true);

      let imageUrl = profileImage;

      // Upload image if a new one was selected
      if (profileImageFile) {
        const uploadedUrl = await uploadProfileImage();
        if (uploadedUrl) {
          imageUrl = uploadedUrl;
        } else {
          // If image upload fails, continue without image
          imageUrl = profileImage;
        }
      }

      // Update or create user profile
      const profilePayload = {
        id: user?.id,
        email: user?.email,
        full_name: profileData.full_name || null,
        phone: profileData.phone || null,
        bio: profileData.bio || null,
        location: profileData.location || null,
        profile_image_url: imageUrl || null,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from('user_profiles')
        .upsert(profilePayload, { onConflict: 'id' });

      if (error) {
        console.error('Upsert error:', error);
        throw error;
      }

      // If student, save bank details to students table
      if (isStudent && user?.email) {
        const { error: studentUpdateError } = await supabase
          .from('students')
          .update({
            bank_name: bankName.trim() || null,
            account_number: accountNumber.trim() || null,
            ifsc_code: ifscCode.trim() || null,
            name: profileData.full_name.trim() || undefined,
            phone_number: profileData.phone.trim() || undefined,
            location: profileData.location?.trim() || null,
            bio: profileData.bio?.trim() || null,
          })
          .ilike('email', user.email);

        if (studentUpdateError) {
          console.error('Student update error:', studentUpdateError);
          throw studentUpdateError;
        }
      }

      toast.success('Profile updated successfully');
      setProfileImageFile(null);
      navigate(-1);
    } catch (error) {
      console.error('Error saving profile:', error);
      toast.error('Failed to save profile. Please ensure the migration has been run on Supabase.');
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveImage = () => {
    setProfileImage(null);
    setProfileImageFile(null);
  };

  const fetchLiveLocation = () => {
    if (!navigator.geolocation) {
      toast.error('Geolocation is not supported by your browser');
      return;
    }
    
    setFetchingLocation(true);
    toast.info('Fetching your exact location...');
    
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        try {
          // Use OpenStreetMap Nominatim for free reverse geocoding
          const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`);
          if (!res.ok) throw new Error('Failed to fetch address');
          
          const data = await res.json();
          const address = data.display_name || `${latitude}, ${longitude}`;
          
          setProfileData({
            ...profileData,
            location: JSON.stringify({ address, lat: latitude, lng: longitude })
          });
          toast.success('Live location fetched successfully!');
        } catch (e) {
          console.error(e);
          toast.error('Failed to get address from coordinates. Saving coordinates only.');
          setProfileData({
            ...profileData,
            location: JSON.stringify({ address: `Coordinates: ${latitude}, ${longitude}`, lat: latitude, lng: longitude })
          });
        } finally {
          setFetchingLocation(false);
        }
      },
      (err) => {
        console.error(err);
        setFetchingLocation(false);
        toast.error('Error fetching location: ' + err.message);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  const parseLocation = (locString: string) => {
    if (!locString) return { address: '', lat: null, lng: null };
    try {
      const parsed = JSON.parse(locString);
      if (parsed && typeof parsed === 'object' && parsed.address) {
        return parsed;
      }
    } catch (e) {
      // not json
    }
    return { address: locString, lat: null, lng: null };
  };

  const locData = parseLocation(profileData.location);

  return (
    <DashboardLayout>
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate(-1)}
            className="h-10 w-10"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Edit Profile</h1>
            <p className="text-sm text-muted-foreground">Update your profile information</p>
          </div>
        </div>

        {/* Profile Form */}
        <Card>
          <CardHeader>
            <CardTitle>Profile Information</CardTitle>
            <CardDescription>Update your personal details and profile picture</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {isLocked && (
              <div className="p-4 bg-amber-50 border border-amber-250 rounded-lg text-sm text-amber-800 flex gap-2 items-start">
                <span className="text-base">🔒</span>
                <div>
                  <strong className="font-semibold">Profile Editing Locked:</strong> Editing details is currently locked by the admin for your class. You can review your details, but making updates is disabled.
                </div>
              </div>
            )}

            {/* Profile Image */}
            <div>
              <Label className="text-sm font-medium mb-3 block">Profile Picture</Label>
              <div className="flex items-center gap-4">
                {profileImage ? (
                  <div className="relative">
                    <img
                      src={profileImage}
                      alt="Profile"
                      className="h-24 w-24 rounded-lg object-cover border border-border"
                    />
                    {!isLocked && (
                      <button
                        onClick={handleRemoveImage}
                        className="absolute -top-2 -right-2 bg-destructive text-white rounded-full p-1 hover:bg-destructive/90"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="h-24 w-24 rounded-lg border-2 border-dashed border-border flex items-center justify-center bg-muted/50">
                    <Upload className="h-6 w-6 text-muted-foreground" />
                  </div>
                )}
                <div className="flex-1">
                  <Input
                    type="file"
                    accept="image/*"
                    onChange={handleImageSelect}
                    disabled={uploading || isLocked}
                    className="cursor-pointer"
                  />
                  <p className="text-xs text-muted-foreground mt-2">
                    JPG, PNG or GIF (max 5MB)
                  </p>
                </div>
              </div>
            </div>

            {/* Email (Read-only) */}
            <div>
              <Label htmlFor="email" className="text-sm font-medium">Email Address</Label>
              <Input
                id="email"
                type="email"
                value={user?.email || ''}
                disabled
                className="mt-1 bg-muted/50"
              />
              <p className="text-xs text-muted-foreground mt-1">Email cannot be changed</p>
            </div>

            {/* Full Name */}
            <div>
              <Label htmlFor="full_name" className="text-sm font-medium">Full Name</Label>
              <Input
                id="full_name"
                type="text"
                placeholder="Enter your full name"
                value={profileData.full_name}
                onChange={(e) => setProfileData({ ...profileData, full_name: e.target.value })}
                disabled={isLocked}
                className="mt-1"
              />
            </div>

            {/* Phone */}
            <div>
              <Label htmlFor="phone" className="text-sm font-medium">Phone Number</Label>
              <Input
                id="phone"
                type="tel"
                placeholder="Enter your phone number"
                value={profileData.phone}
                onChange={(e) => setProfileData({ ...profileData, phone: e.target.value })}
                disabled={isLocked}
                className="mt-1"
              />
            </div>

            {/* Location */}
            <div>
              <div className="flex justify-between items-center mb-1">
                <Label htmlFor="location" className="text-sm font-medium">Location</Label>
                <Button 
                  type="button" 
                  variant="outline" 
                  size="sm" 
                  onClick={fetchLiveLocation}
                  disabled={isLocked || fetchingLocation}
                  className="h-8 gap-1.5 text-xs"
                >
                  {fetchingLocation ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MapPin className="h-3.5 w-3.5 text-blue-500" />}
                  {fetchingLocation ? 'Fetching...' : 'Fetch Live Location'}
                </Button>
              </div>
              <Input
                id="location"
                type="text"
                placeholder="Enter your location or fetch live location"
                value={locData.address}
                onChange={(e) => {
                  const newAddress = e.target.value;
                  if (locData.lat && locData.lng) {
                    setProfileData({ ...profileData, location: JSON.stringify({ ...locData, address: newAddress }) });
                  } else {
                    setProfileData({ ...profileData, location: newAddress });
                  }
                }}
                disabled={isLocked}
                className="mt-1"
              />
              {locData.lat && locData.lng && (
                <div className="mt-3 p-3 bg-blue-50 border border-blue-100 rounded-lg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs text-slate-600">
                    <MapPin className="h-3.5 w-3.5 text-blue-500" />
                    <span>
                      <strong className="text-slate-700">Saved Coordinates:</strong> {locData.lat.toFixed(5)}, {locData.lng.toFixed(5)}
                    </span>
                  </div>
                  <a 
                    href={`https://www.google.com/maps/search/?api=1&query=${locData.lat},${locData.lng}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-800 bg-white px-2.5 py-1 rounded-md shadow-sm border border-blue-200 transition-colors"
                  >
                    View on Google Maps
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              )}
            </div>

            {/* Bio */}
            <div>
              <Label htmlFor="bio" className="text-sm font-medium">Bio</Label>
              <Textarea
                id="bio"
                placeholder="Tell us about yourself"
                value={profileData.bio}
                onChange={(e) => setProfileData({ ...profileData, bio: e.target.value })}
                disabled={isLocked}
                className="mt-1 min-h-[100px]"
              />
            </div>

            {/* Bank Details Section for Students */}
            {isStudent && (
              <div className="border-t pt-6 space-y-4">
                <div className="flex flex-col gap-1">
                  <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">Bank Details</h3>
                  <p className="text-xs text-muted-foreground">
                    Bank details are locked and can only be updated by an administrator. Please contact your coordinator to request changes.
                  </p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="bank_name" className="text-sm font-medium text-muted-foreground">Bank Name</Label>
                    <Input
                      id="bank_name"
                      type="text"
                      placeholder="e.g. State Bank of India"
                      value={bankName}
                      onChange={(e) => setBankName(e.target.value)}
                      disabled={true}
                      className="mt-1 bg-muted/50 text-muted-foreground"
                    />
                  </div>
                  <div>
                    <Label htmlFor="account_number" className="text-sm font-medium text-muted-foreground">Account Number</Label>
                    <Input
                      id="account_number"
                      type="text"
                      placeholder="e.g. 123456789012"
                      value={accountNumber}
                      onChange={(e) => setAccountNumber(e.target.value)}
                      disabled={true}
                      className="mt-1 font-mono bg-muted/50 text-muted-foreground"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <Label htmlFor="ifsc_code" className="text-sm font-medium text-muted-foreground">IFSC Code</Label>
                    <Input
                      id="ifsc_code"
                      type="text"
                      placeholder="e.g. SBIN0001234"
                      value={ifscCode}
                      onChange={(e) => setIfscCode(e.target.value)}
                      disabled={true}
                      className="mt-1 font-mono bg-muted/50 text-muted-foreground"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-3 pt-4">
              <Button
                variant="outline"
                onClick={() => navigate(-1)}
              >
                {isLocked ? 'Back' : 'Cancel'}
              </Button>
              {!isLocked && (
                <Button
                  onClick={handleSaveProfile}
                  disabled={saving || uploading}
                >
                  {saving || uploading ? 'Saving...' : 'Save Changes'}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
