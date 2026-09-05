const fs = require('fs');
let content = fs.readFileSync('src/pages/Sessions.tsx', 'utf-8');

// Find the DropdownMenuContent
const brokenMenu = `<DropdownMenuContent align="end">
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
                              </DropdownMenuContent>`;

const correctMenu = `<DropdownMenuContent align="end" className="bg-popover">
                                <DropdownMenuItem 
                                  onClick={() => {
                                    setSelectedSession(session);
                                    setEditSessionDialogOpen(true);
                                  }}
                                >
                                  <Edit className="h-4 w-4 mr-2" />
                                  Edit Details
                                </DropdownMenuItem>
                                <DropdownMenuItem 
                                  onClick={() => handleEditStatus(session)}
                                >
                                  <Edit className="h-4 w-4 mr-2" />
                                  Edit Status
                                </DropdownMenuItem>
                                {userRole === 1 && (
                                  <DropdownMenuItem 
                                    onClick={() => handleToggleFeedbackLock(session)}
                                  >
                                    {session.feedback_unlocked ? <Lock className="h-4 w-4 mr-2" /> : <Unlock className="h-4 w-4 mr-2" />}
                                    {session.feedback_unlocked ? 'Lock Feedback' : 'Unlock Feedback'}
                                  </DropdownMenuItem>
                                )}
                                {userRole === 1 && (
                                  <DropdownMenuItem 
                                    onClick={() => {
                                      setSelectedSession(session);
                                      setDeleteDialogOpen(true);
                                    }}
                                    className="text-red-600 focus:text-red-600"
                                  >
                                    <Trash2 className="h-4 w-4 mr-2" />
                                    Delete
                                  </DropdownMenuItem>
                                )}
                              </DropdownMenuContent>`;

if (content.includes(brokenMenu)) {
  content = content.replace(brokenMenu, correctMenu);
  fs.writeFileSync('src/pages/Sessions.tsx', content);
  console.log("Successfully restored menu.");
} else {
  // Let's use a regex in case whitespace is slightly different
  const regex = /<DropdownMenuContent align="end">[\s\S]*?Edit Type[\s\S]*?<\/DropdownMenuContent>/;
  if (content.match(regex)) {
    content = content.replace(regex, correctMenu);
    fs.writeFileSync('src/pages/Sessions.tsx', content);
    console.log("Successfully restored menu via regex.");
  } else {
    console.log("Could not find the broken menu to replace.");
  }
}
