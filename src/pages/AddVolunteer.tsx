import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { generateVolunteerId } from '@/utils/volunteerHelper';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { z } from 'zod';
import { ArrowLeft } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { countries, commonIndianCities, countryCodes } from '@/utils/geoData';

const volunteerSchema = z.object({
  organization_type: z.enum(['company', 'individual', 'institute']),
  organization_name: z.string().trim().max(100, 'Organization name must be less than 100 characters').optional(),
  name: z.string().trim().min(1, 'Name is required').max(100, 'Name must be less than 100 characters'),
  personal_email: z.string().trim().email('Please enter a valid personal email').max(255, 'Email must be less than 255 characters').optional().or(z.literal('')),
  work_email: z.string().trim().email('Please enter a valid work email').max(255, 'Email must be less than 255 characters').optional().or(z.literal('')),
  country: z.string().trim().max(100, 'Country must be less than 100 characters').optional(),
  city: z.string().trim().max(100, 'City must be less than 100 characters').optional(),
  country_code: z.string().min(2, 'Country code is required').max(2, 'Invalid country code'),
  phone_number: z.string().trim().min(10, 'Phone number must be at least 10 digits').max(15, 'Phone number is too long'),
  linkedin_profile: z.string().trim().url('Please enter a valid LinkedIn URL').max(255, 'LinkedIn URL is too long').optional().or(z.literal('')),
  regular_volunteering: z.boolean().optional(),
  frequency_per_month: z.number().min(0).optional(),
  interested_area: z.string().trim().optional(),
  interested_topic: z.string().trim().optional(),
  preferred_day: z.string().trim().optional(),
  preferred_class: z.string().trim().optional(),
  remarks: z.string().trim().optional(),
  volunteer_status: z.string().trim().optional(),
  preference: z.string().trim().optional(),
}).refine((data) => data.personal_email || data.work_email, {
  message: 'At least one email (personal or work) is required',
  path: ['work_email'],
});

export default function AddVolunteer() {
  const [organizationType, setOrganizationType] = useState<'company' | 'individual' | 'institute'>('company');
  const [organizationName, setOrganizationName] = useState('');
  const [name, setName] = useState('');
  const [personalEmail, setPersonalEmail] = useState('');
  const [workEmail, setWorkEmail] = useState('');
  const [frequency, setFrequency] = useState('');
  const [linkedin, setLinkedin] = useState('');
  const [preferences, setPreferences] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [country, setCountry] = useState('India');
  const [city, setCity] = useState('');
  const [isOtherCity, setIsOtherCity] = useState(false);
  const [countryCode, setCountryCode] = useState('IN'); // Default to India
  const [phoneNumber, setPhoneNumber] = useState('');
  const [linkedinProfile, setLinkedinProfile] = useState('');
  const [volunteerStatus, setVolunteerStatus] = useState('active');
  const [regularVolunteering, setRegularVolunteering] = useState(false);
  const [frequencyPerMonth, setFrequencyPerMonth] = useState(0);
  const [interestedArea, setInterestedArea] = useState('');
  const [interestedTopic, setInterestedTopic] = useState('');
  const [preferredDay, setPreferredDay] = useState('none');
  const [preferredClass, setPreferredClass] = useState('');
  const [remarks, setRemarks] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [countryList, setCountryList] = useState<{name: string, code: string, dialCode: string}[]>([]);
  const navigate = useNavigate();

  // Fetch countries
  import('react').then(React => {
    React.useEffect(() => {
      fetch('https://restcountries.com/v3.1/all')
        .then(r => r.json())
        .then(d => {
          if (Array.isArray(d)) {
            const list = d.filter((c: any) => c.idd && c.idd.root).map((c: any) => ({
              name: c.name.common,
              code: c.cca2,
              dialCode: c.idd.root + (c.idd.suffixes?.length === 1 ? c.idd.suffixes[0] : '')
            })).sort((a: any, b: any) => a.name.localeCompare(b.name));
            setCountryList(list);
          }
        })
        .catch(console.error);
    }, []);
  });

  // Country code data
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    // Validate input
    const validation = volunteerSchema.safeParse({
      organization_type: organizationType,
      organization_name: organizationType === 'individual' ? 'Self' : organizationName || undefined,
      name,
      personal_email: personalEmail || undefined,
      work_email: workEmail || undefined,
      country: country || undefined,
      city: city || undefined,
      country_code: countryCode,
      phone_number: phoneNumber,
      linkedin_profile: linkedinProfile || undefined,
      volunteer_status: volunteerStatus,
      regular_volunteering: regularVolunteering,
      frequency_per_month: frequencyPerMonth,
      interested_area: interestedArea || undefined,
      interested_topic: interestedTopic || undefined,
      preferred_day: preferredDay || undefined,
      preferred_class: preferredClass || undefined,
      remarks: remarks || undefined,
      preference: preferences.length > 0 ? preferences.join(', ') : undefined
    });

    if (!validation.success) {
      toast.error(validation.error.errors[0].message);
      setIsLoading(false);
      return;
    }

    try {
      const { error } = await supabase.from('volunteers').insert({
        organization_type: validation.data.organization_type,
        organization_name: validation.data.organization_type === 'individual' ? 'Self' : validation.data.organization_name || null,
        name: validation.data.name,
        personal_email: validation.data.personal_email || null,
        work_email: validation.data.work_email || null,
        country: validation.data.country || null,
        city: validation.data.city || null,
        country_code: validation.data.country_code,
        phone_number: validation.data.phone_number,
        linkedin_profile: validation.data.linkedin_profile || null,
        volunteer_status: validation.data.volunteer_status,
        regular_volunteering: validation.data.regular_volunteering,
        frequency_per_month: validation.data.frequency_per_month,
        interested_area: validation.data.interested_area || null,
        interested_topic: validation.data.interested_topic || null,
        preferred_day: validation.data.preferred_day === 'none' ? null : validation.data.preferred_day || null,
        preferred_class: validation.data.preferred_class || null,
        remarks: validation.data.remarks || null,
        preference: validation.data.preference || null,
        is_active: validation.data.volunteer_status === 'active',
      });

      if (error) {
        if (error.message.includes('duplicate')) {
          toast.error('A volunteer with this email already exists.');
        } else {
          toast.error(error.message);
        }
      } else {
        toast.success('Volunteer added successfully!');
        navigate('/volunteers');
      }
    } catch (error) {
      toast.error('An unexpected error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-xl">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate('/volunteers')}
            className="h-10 w-10"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold text-foreground">Add Volunteer</h1>
            <p className="text-muted-foreground mt-1">
              Add a new volunteer to the system
            </p>
          </div>
        </div>

        {/* Form Card */}
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle>Volunteer Details</CardTitle>
            <CardDescription>
              Enter the volunteer's information below
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Full Name *</Label>
                <Input
                  id="name"
                  type="text"
                  placeholder="Enter full name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-3">
                <Label>Role / Session</Label>
                <div className="flex flex-wrap gap-4">
                  {['Guest Teacher', 'Guest Speaker', 'Mentor', 'Other'].map((role) => (
                    <div key={role} className="flex items-center space-x-2">
                      <Checkbox
                        id={`role-${role}`}
                        checked={preferences.includes(role)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setPreferences([...preferences, role]);
                          } else {
                            setPreferences(preferences.filter(p => p !== role));
                          }
                        }}
                      />
                      <label htmlFor={`role-${role}`} className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                        {role}
                      </label>
                    </div>
                  ))}
                </div>
              </div>

              {/* Organization Type */}
              <div className="space-y-2">
                <Label htmlFor="organizationType">Organization Type *</Label>
                <Select
                  value={organizationType}
                  onValueChange={(value: 'company' | 'individual' | 'institute') => {
                    setOrganizationType(value);
                    if (value === 'individual') {
                      setOrganizationName('Self');
                    } else {
                      setOrganizationName('');
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select organization type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="company">Company</SelectItem>
                    <SelectItem value="individual">Individual</SelectItem>
                    <SelectItem value="institute">Institute</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Organization Name - shown for company and institute */}
              {organizationType !== 'individual' && (
                <div className="space-y-2">
                  <Label htmlFor="organizationName">
                    {organizationType === 'company' ? 'Company Name' : 'Institute Name'} *
                  </Label>
                  <Input
                    id="organizationName"
                    type="text"
                    placeholder={`Enter ${organizationType === 'company' ? 'company' : 'institute'} name`}
                    value={organizationName}
                    onChange={(e) => setOrganizationName(e.target.value)}
                    required
                  />
                </div>
              )}

              {/* Individual - show Self label */}
              {organizationType === 'individual' && (
                <div className="space-y-2">
                  <Label>Organization</Label>
                  <div className="px-3 py-2 bg-muted rounded-md text-muted-foreground">
                    Self
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="personalEmail">Personal Email</Label>
                <Input
                  id="personalEmail"
                  type="email"
                  placeholder="Enter personal email address"
                  value={personalEmail}
                  onChange={(e) => setPersonalEmail(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="workEmail">Work Email</Label>
                <Input
                  id="workEmail"
                  type="email"
                  placeholder="Enter work email address"
                  value={workEmail}
                  onChange={(e) => setWorkEmail(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  At least one email (personal or work) is required
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="country">Country</Label>
                <Select value={country} onValueChange={(value) => {
                  setCountry(value);
                  const selectedCountryInfo = countryList.length > 0 
                    ? countryList.find(c => c.name === value)
                    : countryCodes.find(c => c.name === value);
                    
                  if (selectedCountryInfo) {
                    setCountryCode(selectedCountryInfo.code);
                  }
                  if (value !== 'India') {
                    setIsOtherCity(true);
                  } else {
                    setIsOtherCity(false);
                    setCity('');
                  }
                }}>
                  <SelectTrigger id="country">
                    <SelectValue placeholder="Select country" />
                  </SelectTrigger>
                  <SelectContent>
                    {countryList.length > 0 ? countryList.map((c) => (
                      <SelectItem key={c.name} value={c.name}>{c.name}</SelectItem>
                    )) : countries.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="city">City</Label>
                {!isOtherCity && country === 'India' ? (
                  <Select value={city} onValueChange={(value) => {
                    if (value === 'other') {
                      setIsOtherCity(true);
                      setCity('');
                    } else {
                      setCity(value);
                    }
                  }}>
                    <SelectTrigger id="city">
                      <SelectValue placeholder="Select city" />
                    </SelectTrigger>
                    <SelectContent>
                      {commonIndianCities.map((c) => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                      <SelectItem value="other">Other City...</SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="flex gap-2">
                    <Input
                      id="city"
                      type="text"
                      placeholder="Enter city"
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      required
                    />
                    {country === 'India' && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setIsOtherCity(false);
                          setCity('');
                        }}
                      >
                        Reset
                      </Button>
                    )}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="phoneNumber">Phone Number *</Label>
                <div className="flex gap-2">
                  <div className="w-[100px]">
                    <Select value={countryCode} onValueChange={setCountryCode}>
                      <SelectTrigger id="countryCode">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {countryList.length > 0 ? countryList.map((country) => (
                          <SelectItem key={country.code} value={country.code}>
                            {country.code} ({country.dialCode})
                          </SelectItem>
                        )) : countryCodes.map((country) => (
                          <SelectItem key={country.code} value={country.code}>
                            {country.code} ({country.dialCode})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Input
                    id="phoneNumber"
                    type="tel"
                    placeholder="Enter phone number"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    required
                    className="flex-1"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="linkedinProfile">LinkedIn Profile</Label>
                <Input
                  id="linkedinProfile"
                  type="url"
                  placeholder="https://linkedin.com/in/username"
                  value={linkedinProfile}
                  onChange={(e) => setLinkedinProfile(e.target.value)}
                />
              </div>

              {/* Preferences Section */}
              <div className="pt-4 border-t space-y-4">
                <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Volunteering Preferences</h3>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="regularVolunteering"
                    checked={regularVolunteering}
                    onCheckedChange={(checked) => setRegularVolunteering(checked as boolean)}
                  />
                  <Label htmlFor="regularVolunteering" className="text-sm font-medium cursor-pointer">Regular Volunteering</Label>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="frequency">Frequency per Month</Label>
                  <Input
                    id="frequency"
                    type="number"
                    min="0"
                    value={frequencyPerMonth}
                    onChange={(e) => setFrequencyPerMonth(parseInt(e.target.value) || 0)}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="interestedArea">Interested Area</Label>
                    <Input
                      id="interestedArea"
                      value={interestedArea}
                      onChange={(e) => setInterestedArea(e.target.value)}
                      placeholder="e.g. Technology"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="interestedTopic">Interested Topic</Label>
                    <Input
                      id="interestedTopic"
                      value={interestedTopic}
                      onChange={(e) => setInterestedTopic(e.target.value)}
                      placeholder="e.g. Artificial Intelligence"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="preferredDay">Preferred Day</Label>
                    <Select value={preferredDay} onValueChange={setPreferredDay}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select day" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        <SelectItem value="Monday">Monday</SelectItem>
                        <SelectItem value="Tuesday">Tuesday</SelectItem>
                        <SelectItem value="Wednesday">Wednesday</SelectItem>
                        <SelectItem value="Thursday">Thursday</SelectItem>
                        <SelectItem value="Friday">Friday</SelectItem>
                        <SelectItem value="Saturday">Saturday</SelectItem>
                        <SelectItem value="Sunday">Sunday</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="preferredClass">Preferred Class</Label>
                    <Input
                      id="preferredClass"
                      value={preferredClass}
                      onChange={(e) => setPreferredClass(e.target.value)}
                      placeholder="e.g. Class 10"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="volunteerStatus">Status</Label>
                  <Select value={volunteerStatus} onValueChange={setVolunteerStatus}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="inactive">Inactive</SelectItem>
                      <SelectItem value="on_leave">On Leave</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="remarks">Remarks</Label>
                  <Textarea
                    id="remarks"
                    value={remarks}
                    onChange={(e) => setRemarks(e.target.value)}
                    placeholder="Any additional notes..."
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => navigate('/volunteers')}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isLoading}
                  className="flex-1"
                >
                  {isLoading ? 'Adding...' : 'Add Volunteer'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
