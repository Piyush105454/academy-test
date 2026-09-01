const fs = require('fs');

function updateSessions() {
    let content = fs.readFileSync('src/pages/Sessions.tsx', 'utf-8');

    const headerReplacement = `<TableHeader>
                      <TableRow>
                        <TableHead className="min-w-[150px] font-bold">Session ID</TableHead>
                        <TableHead className="min-w-[100px]">Subject</TableHead>
                        <TableHead className="min-w-[100px]">Category</TableHead>
                        <TableHead className="min-w-[150px]">Module No & Name</TableHead>
                        <TableHead className="min-w-[150px]">Topics Covered</TableHead>
                        <TableHead className="min-w-[80px]">Type</TableHead>
                        <TableHead className="min-w-[100px]">Volunteer</TableHead>
                        <TableHead className="min-w-[100px]">Organisation</TableHead>
                        <TableHead className="min-w-[100px]">Coordinator</TableHead>
                        <TableHead className="min-w-[100px]">Facilitator</TableHead>
                        <TableHead className="min-w-[80px]">Class</TableHead>
                        <TableHead className="min-w-[100px]">Centre</TableHead>
                        <TableHead className="min-w-[80px]">Strength</TableHead>
                        <TableHead className="min-w-[100px]">Date</TableHead>
                        <TableHead className="min-w-[100px]">Time</TableHead>
                        <TableHead className="min-w-[120px]">Facilitator Status</TableHead>
                        <TableHead className="min-w-[120px]">Coordinator Status</TableHead>
                        <TableHead className="min-w-[120px]">Supervisor Status</TableHead>
                        <TableHead className="min-w-[80px]">Delayed</TableHead>
                        <TableHead className="min-w-[80px]">Actions</TableHead>
                      </TableRow>
                    </TableHeader>`;

    content = content.replace(/<TableHeader>[\s\S]*?<\/TableHeader>/, headerReplacement);

    const rowReplacement = `<TableRow key={session.id} className={rowBgClass}>
                          <TableCell className="font-medium text-primary">
                            {session.session_id_code || '---'}
                          </TableCell>
                          <TableCell>{session.subject_name || '-'}</TableCell>
                          <TableCell>{session.content_category || '-'}</TableCell>
                          <TableCell>{session.module_no ? \`\${session.module_no} - \${session.module_name || ''}\` : session.module_name || '-'}</TableCell>
                          <TableCell className="max-w-[150px] truncate" title={session.topics_covered || ''}>
                            {session.topics_covered || '-'}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={getSessionTypeColor(session.session_type)}>
                              {session.session_type}
                            </Badge>
                          </TableCell>
                          <TableCell>{session.volunteer_name || '-'}</TableCell>
                          <TableCell>{session.organization_name || '-'}</TableCell>
                          <TableCell>{session.coordinator_name || '-'}</TableCell>
                          <TableCell>{session.facilitator_name || '-'}</TableCell>
                          <TableCell>{session.class_batch || '-'}</TableCell>
                          <TableCell>{session.centre_name || '-'}</TableCell>
                          <TableCell className="text-center">{session.session_strength ?? '-'}</TableCell>
                          <TableCell>{formatDate(session.session_date)}</TableCell>
                          <TableCell>{session.session_time || '-'}</TableCell>
                          <TableCell>
                            <Badge className={getStatusColor(session.facilitator_feedback_status || session.status)}>
                              {(session.facilitator_feedback_status || session.status).toUpperCase()}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge className={getStatusColor(session.coordinator_feedback_status || 'pending')}>
                              {(session.coordinator_feedback_status || 'pending').toUpperCase()}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge className={getStatusColor(session.supervisor_feedback_status || 'pending')}>
                              {(session.supervisor_feedback_status || 'pending').toUpperCase()}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-center">
                            {isDelayed(session) ? <Badge variant="destructive">Yes</Badge> : <Badge variant="secondary">No</Badge>}
                          </TableCell>
                          <TableCell>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" className="h-8 w-8 p-0">
                                  <span className="sr-only">Open menu</span>
                                  <MoreVertical className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => { setSelectedSession(session); setIsTypeDialogOpen(true); }}>
                                  <Edit className="mr-2 h-4 w-4" /> Edit Type
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => navigate(\`/sessions/\${session.id}/recording\`)}>
                                  <Video className="mr-2 h-4 w-4" /> View Recording
                                </DropdownMenuItem>
                                {userRole === 1 && (
                                  <DropdownMenuItem onClick={() => { setSelectedSession(session); setDeleteDialogOpen(true); }} className="text-red-600">
                                    <Trash2 className="mr-2 h-4 w-4" /> Delete
                                  </DropdownMenuItem>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>`;

    content = content.replace(/<TableRow key=\{session\.id\} className=\{rowBgClass\}>[\s\S]*?<\/TableRow>/, rowReplacement);
    fs.writeFileSync('src/pages/Sessions.tsx', content);
}

function updateFeedback() {
    let content = fs.readFileSync('src/pages/FeedbackSelection.tsx', 'utf-8');

    const headerReplacement = `<TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="font-bold min-w-[150px]">Session ID</TableHead>
                        <TableHead className="min-w-[100px]">Subject</TableHead>
                        <TableHead className="min-w-[100px]">Category</TableHead>
                        <TableHead className="min-w-[150px]">Module No & Name</TableHead>
                        <TableHead className="min-w-[150px]">Topics Covered</TableHead>
                        <TableHead className="min-w-[80px]">Type</TableHead>
                        <TableHead className="min-w-[100px]">Volunteer</TableHead>
                        <TableHead className="min-w-[100px]">Organisation</TableHead>
                        <TableHead className="min-w-[100px]">Coordinator</TableHead>
                        <TableHead className="min-w-[100px]">Facilitator</TableHead>
                        <TableHead className="min-w-[80px]">Class</TableHead>
                        <TableHead className="min-w-[100px]">Centre</TableHead>
                        <TableHead className="min-w-[80px]">Strength</TableHead>
                        <TableHead className="min-w-[100px]">Date</TableHead>
                        <TableHead className="min-w-[100px]">Time</TableHead>
                        <TableHead className="min-w-[100px] text-center">Recording</TableHead>
                        <TableHead className="min-w-[100px] text-center">Meeting</TableHead>
                        <TableHead className="min-w-[120px]">Status</TableHead>
                        <TableHead className="min-w-[80px]">Delayed</TableHead>
                        <TableHead className="w-[60px]">Actions</TableHead>
                      </TableRow>
                    </TableHeader>`;
    content = content.replace(/<TableHeader>[\s\S]*?<\/TableHeader>/, headerReplacement);

    const rowReplacement = `<TableRow key={session.id} className="hover:bg-muted/50">
                        <TableCell className="font-medium text-primary">
                          {session.session_id_code || '---'}
                        </TableCell>
                        <TableCell>{session.subject_name || '-'}</TableCell>
                        <TableCell>{session.content_category || '-'}</TableCell>
                        <TableCell>{session.module_no ? \`\${session.module_no} - \${session.module_name || ''}\` : session.module_name || '-'}</TableCell>
                        <TableCell className="max-w-[150px] truncate" title={session.topics_covered || ''}>
                          {session.topics_covered || '-'}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={getSessionTypeColor(session.session_type)}>
                            {session.session_type}
                          </Badge>
                        </TableCell>
                        <TableCell>{session.volunteer_name || '-'}</TableCell>
                        <TableCell>{session.organization_name || '-'}</TableCell>
                        <TableCell>{session.coordinator_name || '-'}</TableCell>
                        <TableCell>{session.facilitator_name || '-'}</TableCell>
                        <TableCell>{session.class_batch || '-'}</TableCell>
                        <TableCell>{session.centre_name || '-'}</TableCell>
                        <TableCell className="text-center">{session.session_strength ?? '-'}</TableCell>
                        <TableCell>{formatDate(session.session_date)}</TableCell>
                        <TableCell>{session.session_time || '-'}</TableCell>
                        
                        <TableCell className="text-center">
                          {session.recording_url ? (
                            <a href={session.recording_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 bg-blue-50 px-2 py-1 rounded-md transition-colors font-medium">
                              <Video className="h-3.5 w-3.5" />
                              View
                            </a>
                          ) : (
                            <span className="text-muted-foreground text-xs italic">-</span>
                          )}
                        </TableCell>

                        <TableCell className="text-center">
                          {session.meeting_link ? (
                            <a href={session.meeting_link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center p-1.5 rounded-full hover:bg-slate-100 transition-colors text-primary" title="Join Meeting">
                              <Video className="h-4 w-4" />
                            </a>
                          ) : (
                            <span className="text-muted-foreground text-xs italic">-</span>
                          )}
                        </TableCell>

                        <TableCell>
                          <Badge className={getStatusColor(session.status)}>
                            {session.status.toUpperCase()}
                          </Badge>
                        </TableCell>

                        <TableCell className="text-center">
                          {isDelayed(session) ? <Badge variant="destructive">Yes</Badge> : <Badge variant="secondary">No</Badge>}
                        </TableCell>

                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" className="h-8 w-8 p-0">
                                <span className="sr-only">Open menu</span>
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => navigate(\`/sessions/\${session.id}/feedback-details\`)}>
                                <Eye className="mr-2 h-4 w-4" /> View Record
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>`;
    
    content = content.replace(/<TableRow key=\{session\.id\} className="hover:bg-muted\/50">[\s\S]*?<\/TableRow>/, rowReplacement);
    fs.writeFileSync('src/pages/FeedbackSelection.tsx', content);
}

try {
    updateSessions();
    console.log('updated sessions');
    updateFeedback();
    console.log('updated feedback');
} catch(e) {
    console.error(e);
}
