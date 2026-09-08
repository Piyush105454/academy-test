import { useState, useEffect, useMemo } from 'react';
import { Plus, Trash2, FileText, ExternalLink, FileSpreadsheet, Eye, Download, Search, Filter, UploadCloud, Link as LinkIcon, Image as ImageIcon } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { GoogleDriveResumableUploader } from '@/utils/GoogleDriveResumableUploader';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAcademicYear } from '@/contexts/AcademicYearContext';

interface Resource {
  id: string;
  title: string;
  description: string;
  category: string;
  resource_type: string;
  target_audience: string;
  file_url: string;
  created_at: string;
}

const CATEGORIES = [
  'Notices', 'Forms', 'Guidelines', 'Worksheets', 
  'Reports', 'Admission', 'Student Resources', 'Teacher Resources', 'Agreement', 'Other'
];

export default function ResourceHub({ isStudent = false }: { isStudent?: boolean }) {
  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  const { selectedYear } = useAcademicYear();
  
  // Search & Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterType, setFilterType] = useState('all');

  // Form State
  const [uploadMode, setUploadMode] = useState<'file' | 'link'>('file');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [formData, setFormData] = useState({
    id: '',
    title: '',
    description: '',
    category: 'Notices',
    resource_type: 'pdf',
    target_audience: 'all',
    file_url: '',
    target_student_id: null as string | null,
  });

  const [students, setStudents] = useState<{id: string, name: string, class_id: string}[]>([]);
  const [classes, setClasses] = useState<{id: string, name: string}[]>([]);
  const [selectedClassForStudent, setSelectedClassForStudent] = useState<string>('');

  useEffect(() => {
    fetchResources();
    fetchStudents();
    fetchClasses();
  }, []);

  const fetchClasses = async () => {
    try {
      const { data } = await supabase.from('classes').select('id, name').neq('name', '__SYSTEM_DEV_MODE__').neq('id', '00000000-0000-0000-0000-000000000000').order('name');
      if (data) setClasses(data);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchStudents = async () => {
    try {
      const { data } = await supabase.from('students').select('id, name, class_id').order('name');
      if (data) setStudents(data);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchResources = async () => {
    try {
      setLoading(true);
      let query = supabase
        .from('resource_hub')
        .select('*')
        .order('created_at', { ascending: false });

      if (isStudent) {
        // Students can see: 'all' and resources tagged with their ID
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          query = query.or(`target_audience.eq.all,target_audience.like.student_${user.id}`);
        } else {
          query = query.eq('target_audience', 'all');
        }
      }

      const { data, error } = await query;

      if (error) {
        console.warn('Could not fetch resources:', error);
        return;
      }
      setResources(data || []);
    } catch (error) {
      console.error('Error fetching resources:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredResources = useMemo(() => {
    return resources.filter(res => {
      const matchesSearch = res.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                            (res.description && res.description.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchesCategory = filterCategory === 'all' || res.category === filterCategory;
      const matchesType = filterType === 'all' || res.resource_type === filterType;
      
      return matchesSearch && matchesCategory && matchesType;
    });
  }, [resources, searchQuery, filterCategory, filterType]);

  const handleFileUpload = async (file: File) => {
    try {
      setUploadingFile(true);
      const folderPath = ["FELLOW", selectedYear || "Unknown Year", "resourcehub"];
      const { data: { session } } = await supabase.auth.getSession();
      
      const uploader = new GoogleDriveResumableUploader({
        file,
        folderPath,
        supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
        accessToken: session?.access_token || '',
      });

      const result = await uploader.upload();
      return result.webViewLink;
    } catch (error) {
      console.error('File upload error:', error);
      throw error;
    } finally {
      setUploadingFile(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.title) {
      toast.error('Please enter a title');
      return;
    }

    if (formData.target_audience === 'specific_student' && !formData.target_student_id) {
      toast.error('Please select a student');
      return;
    }

    let finalFileUrl = formData.file_url;

    if (uploadMode === 'file') {
      if (!selectedFile && !editingId) {
        toast.error('Please select a file to upload');
        return;
      }
      if (selectedFile) {
        try {
          const toastId = toast.loading('Uploading file to Google Drive...');
          finalFileUrl = await handleFileUpload(selectedFile);
          toast.success('File uploaded successfully!', { id: toastId });
        } catch (error) {
          toast.error('Failed to upload file');
          return;
        }
      }
    } else {
      if (!finalFileUrl) {
        toast.error('Please enter the file link');
        return;
      }
    }

    try {
      const payload: any = {
        title: formData.title,
        description: formData.description,
        category: formData.category,
        resource_type: formData.resource_type,
        file_url: finalFileUrl,
      };

      if (formData.target_audience === 'specific_student' && formData.target_student_id) {
        payload.target_audience = `student_${formData.target_student_id}`;
      } else {
        payload.target_audience = formData.target_audience;
      }

      if (editingId) {
        const { error } = await supabase
          .from('resource_hub')
          .update(payload)
          .eq('id', editingId);

        if (error) throw error;
        toast.success('Resource updated successfully');
      } else {
        const { error } = await supabase
          .from('resource_hub')
          .insert([payload]);

        if (error) throw error;
        toast.success('Resource added successfully');
      }
      
      setShowForm(false);
      setEditingId(null);
      resetForm();
      fetchResources();
    } catch (error) {
      console.error('Error saving resource:', error);
      toast.error('Failed to save resource. Did you run the SQL migration?');
    }
  };

  const resetForm = () => {
    setFormData({
      id: '',
      title: '',
      description: '',
      category: 'Notices',
      resource_type: 'pdf',
      target_audience: 'all',
      file_url: '',
      target_student_id: null,
    });
    setSelectedFile(null);
    setSelectedClassForStudent('');
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this resource?')) return;
    try {
      const { error } = await supabase
        .from('resource_hub')
        .delete()
        .eq('id', id);

      if (error) throw error;
      toast.success('Resource deleted successfully');
      fetchResources();
    } catch (error) {
      console.error('Error deleting resource:', error);
      toast.error('Failed to delete resource');
    }
  };

  const getResourceIcon = (type: string) => {
    if (type === 'sheet') return <FileSpreadsheet className="h-5 w-5 text-green-600" />;
    if (type === 'image') return <ImageIcon className="h-5 w-5 text-purple-600" />;
    if (type === 'word') return <FileText className="h-5 w-5 text-blue-800" />;
    return <FileText className="h-5 w-5 text-red-600" />; // default pdf/notice
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Resource Hub</h1>
            <p className="text-muted-foreground">Central library for documents, notices, guidelines, and sheets.</p>
          </div>
          {!isStudent && (
            <Button onClick={() => {
              if (showForm && editingId) {
                setEditingId(null);
                resetForm();
              }
              setShowForm(!showForm);
            }}>
              {showForm ? 'Cancel' : (
                <>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Resource
                </>
              )}
            </Button>
          )}
        </div>

        {/* Filters and Search */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-card p-4 rounded-xl shadow-sm border border-border/50">
          <div className="relative col-span-1 md:col-span-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Search by title or description..." 
              className="pl-9"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div>
            <Select value={filterCategory} onValueChange={setFilterCategory}>
              <SelectTrigger>
                <SelectValue placeholder="All Categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {CATEGORIES.map(cat => (
                  <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger>
                <SelectValue placeholder="All File Types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="pdf">PDF / Docs</SelectItem>
                <SelectItem value="sheet">Excel / Google Sheets</SelectItem>
                <SelectItem value="image">Images</SelectItem>
                <SelectItem value="other">Other Forms / Links</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {!isStudent && showForm && (
          <Card className="border-primary/20 shadow-md">
            <CardHeader className="bg-muted/50 border-b">
              <CardTitle>{editingId ? 'Edit Resource' : 'Add New Resource'}</CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              <form onSubmit={handleSubmit} className="space-y-6">
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Title *</label>
                    <Input
                      required
                      placeholder="e.g. Annual Sports Guidelines"
                      value={formData.title}
                      onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Category</label>
                    <Select
                      value={formData.category}
                      onValueChange={(value) => setFormData({ ...formData, category: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CATEGORIES.map(cat => (
                          <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">File Type</label>
                    <Select
                      value={formData.resource_type}
                      onValueChange={(value) => setFormData({ ...formData, resource_type: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pdf">PDF</SelectItem>
                        <SelectItem value="word">Word Document</SelectItem>
                        <SelectItem value="sheet">Excel / Sheet</SelectItem>
                        <SelectItem value="image">Image</SelectItem>
                        <SelectItem value="notice">Notice / Form / Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">Visibility (Target Audience)</label>
                    <Select
                      value={formData.target_audience}
                      onValueChange={(value) => setFormData({ ...formData, target_audience: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Everyone</SelectItem>
                        <SelectItem value="teachers">Teachers Only</SelectItem>
                        <SelectItem value="admin_only">Admin Only</SelectItem>
                        <SelectItem value="specific_student">Specific Student</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {formData.target_audience === 'specific_student' && (
                    <>
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Select Class First</label>
                        <Select
                          value={selectedClassForStudent}
                          onValueChange={setSelectedClassForStudent}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Choose a class" />
                          </SelectTrigger>
                          <SelectContent className="max-h-[300px]">
                            {classes.map(c => (
                              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <label className="text-sm font-medium">Select Student *</label>
                        <Select
                          value={formData.target_student_id || ''}
                          onValueChange={(value) => setFormData({ ...formData, target_student_id: value })}
                          disabled={!selectedClassForStudent}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder={selectedClassForStudent ? "Choose a student" : "Select class first"} />
                          </SelectTrigger>
                          <SelectContent className="max-h-[300px]">
                            {students
                              .filter(s => s.class_id === selectedClassForStudent)
                              .map(student => (
                                <SelectItem key={student.id} value={student.id}>{student.name}</SelectItem>
                              ))
                            }
                          </SelectContent>
                        </Select>
                      </div>
                    </>
                  )}
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Resource Content / File *</label>
                  <Tabs value={uploadMode} onValueChange={(v) => setUploadMode(v as 'file'|'link')} className="w-full">
                    <TabsList className="grid w-full grid-cols-2 max-w-[400px]">
                      <TabsTrigger value="file"><UploadCloud className="w-4 h-4 mr-2"/> Upload File</TabsTrigger>
                      <TabsTrigger value="link"><LinkIcon className="w-4 h-4 mr-2"/> Paste Link</TabsTrigger>
                    </TabsList>
                    <TabsContent value="file" className="pt-4">
                      <div className="border-2 border-dashed rounded-lg p-6 flex flex-col items-center justify-center bg-muted/20">
                        <Input 
                          type="file" 
                          className="max-w-[300px]"
                          onChange={(e) => setSelectedFile(e.target.files ? e.target.files[0] : null)}
                        />
                        <p className="text-xs text-muted-foreground mt-2">
                          Files will be securely uploaded to Google Drive and shared.
                        </p>
                      </div>
                    </TabsContent>
                    <TabsContent value="link" className="pt-4">
                      <Input
                        placeholder="https://docs.google.com/..."
                        value={formData.file_url}
                        onChange={(e) => setFormData({ ...formData, file_url: e.target.value })}
                      />
                      <p className="text-xs text-muted-foreground mt-2">
                        Paste a direct link to a Google Sheet, Form, or external document.
                      </p>
                    </TabsContent>
                  </Tabs>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Short Description (Optional)</label>
                  <Textarea
                    placeholder="Brief details about this resource..."
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  />
                </div>

                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => {
                    setEditingId(null);
                    setShowForm(false);
                  }}>Cancel</Button>
                  <Button type="submit" disabled={uploadingFile}>
                    {uploadingFile ? 'Uploading...' : editingId ? 'Update Resource' : 'Save Resource'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 gap-6">
          <Card>
            <CardContent className="p-0">
              {loading ? (
                <div className="text-center py-12">Loading resources...</div>
              ) : filteredResources.length === 0 ? (
                <div className="text-center py-16 text-muted-foreground">
                  <div className="flex justify-center mb-4">
                    <FileText className="h-12 w-12 opacity-20" />
                  </div>
                  <h3 className="text-lg font-medium text-foreground">No resources found</h3>
                  <p className="mt-1">Adjust your filters or add a new resource.</p>
                </div>
              ) : (
                <div className="rounded-md overflow-x-auto">
                  <Table>
                    <TableHeader className="bg-muted/50">
                      <TableRow>
                        <TableHead>Type</TableHead>
                        <TableHead className="min-w-[200px]">Details</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead>Audience</TableHead>
                        <TableHead>Date Added</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredResources.map((resource) => (
                        <TableRow key={resource.id} className="hover:bg-muted/30">
                          <TableCell>
                            <div className="flex flex-col items-center gap-1 justify-center bg-muted/50 p-2 rounded-lg w-12 h-12">
                              {getResourceIcon(resource.resource_type)}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div>
                              <p className="font-semibold text-foreground">{resource.title}</p>
                              {resource.description && (
                                <p className="text-sm text-muted-foreground truncate max-w-[300px] mt-1">
                                  {resource.description}
                                </p>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="bg-primary/5 text-primary">
                              {resource.category || 'Notices'}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant={resource.target_audience === 'all' ? 'default' : 'secondary'} className="capitalize shadow-sm">
                              {resource.target_audience.replace('_', ' ')}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm font-medium text-muted-foreground">
                            {new Date(resource.created_at).toLocaleDateString(undefined, {
                              year: 'numeric', month: 'short', day: 'numeric'
                            })}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button
                                variant="default"
                                size="sm"
                                className="shadow-sm"
                                onClick={() => window.open(resource.file_url, '_blank')}
                                title="Preview Resource"
                              >
                                <Eye className="h-4 w-4 mr-1.5" /> View
                              </Button>
                              
                              <Button
                                variant="outline"
                                size="sm"
                                className="shadow-sm"
                                onClick={() => window.open(resource.file_url, '_blank')}
                                title="Download Resource"
                              >
                                <Download className="h-4 w-4 mr-1.5" /> Download
                              </Button>
                              
                              {!isStudent && (
                                <>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="shadow-sm"
                                    onClick={() => {
                                      setEditingId(resource.id);
                                      setFormData({
                                        id: resource.id,
                                        title: resource.title,
                                        description: resource.description || '',
                                        category: resource.category || 'Notices',
                                        resource_type: resource.resource_type || 'pdf',
                                        target_audience: resource.target_audience || 'all',
                                        file_url: resource.file_url,
                                        target_student_id: null,
                                      });
                                      setShowForm(true);
                                      setUploadMode('link');
                                    }}
                                    title="Edit Resource"
                                  >
                                    Edit
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="text-red-600 hover:text-red-800 hover:bg-red-50"
                                    onClick={() => handleDelete(resource.id)}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
