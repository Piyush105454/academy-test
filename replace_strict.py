import sys

with open('src/pages/Sessions.tsx', 'r', encoding='utf-8') as f:
    text = f.read()

# Fix Tabs and currentTab
if 'useSearchParams' not in text:
    text = text.replace(
        "import { useNavigate } from 'react-router-dom';",
        "import { useNavigate, useSearchParams } from 'react-router-dom';\nimport { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';"
    )

if 'const currentTab' not in text:
    text = text.replace(
        "const navigate = useNavigate();",
        "const navigate = useNavigate();\n  const [searchParams] = useSearchParams();\n  const currentTab = searchParams.get('tab') || 'facilitator';"
    )

if "if (currentTab === 'coordinator')" not in text:
    text = text.replace(
        "const getFilteredSessions = () => {\n    let filtered = sessions;",
        "const getFilteredSessions = () => {\n    let filtered = sessions;\n    \n    if (currentTab === 'coordinator') {\n      filtered = filtered.filter(s => (s.facilitator_feedback_status || '').toLowerCase() === 'completed' || (s.facilitator_feedback_status || '').toLowerCase() === 'done');\n    } else if (currentTab === 'supervisor') {\n      filtered = filtered.filter(s => (s.coordinator_feedback_status || '').toLowerCase() === 'completed' || (s.coordinator_feedback_status || '').toLowerCase() === 'done');\n    }"
    )

if '<Tabs value={currentTab}' not in text:
    text = text.replace(
        '<div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">',
        '<div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">\n              <Tabs value={currentTab} onValueChange={(v) => { const newP = new URLSearchParams(searchParams); newP.set(\'tab\', v); navigate(\'?\'+newP.toString()); }} className="w-full sm:w-auto">\n                <TabsList>\n                  <TabsTrigger value="facilitator">Facilitator</TabsTrigger>\n                  <TabsTrigger value="coordinator">Coordinator</TabsTrigger>\n                  <TabsTrigger value="supervisor">Supervisor</TabsTrigger>\n                </TabsList>\n              </Tabs>'
    )

filtersTarget = '''{/* Facilitator Status Filter */}
                    <div className="flex-1 min-w-[150px]">
                      <label className="text-xs font-medium text-blue-600 mb-1 block">
                        Facilitator Status
                      </label>
                      <Select value={facilitatorStatusFilter || 'all'} onValueChange={(value) => setFacilitatorStatusFilter(value === 'all' ? null : value)}>
                        <SelectTrigger className="bg-blue-50/50 border-blue-200 text-xs h-9">
                          <SelectValue placeholder="All Status" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Status</SelectItem>
                          <SelectItem value="pending">Pending</SelectItem>
                          <SelectItem value="done">Done</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Coordinator Status Filter */}
                    <div className="flex-1 min-w-[150px]">
                      <label className="text-xs font-medium text-purple-600 mb-1 block">
                        Coordinator Status
                      </label>
                      <Select value={coordinatorStatusFilter || 'all'} onValueChange={(value) => setCoordinatorStatusFilter(value === 'all' ? null : value)}>
                        <SelectTrigger className="bg-purple-50/50 border-purple-200 text-xs h-9">
                          <SelectValue placeholder="All Status" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Status</SelectItem>
                          <SelectItem value="pending">Pending</SelectItem>
                          <SelectItem value="done">Done</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Supervisor Status Filter */}
                    <div className="flex-1 min-w-[150px]">
                      <label className="text-xs font-medium text-green-600 mb-1 block">
                        Supervisor Status
                      </label>
                      <Select value={supervisorStatusFilter || 'all'} onValueChange={(value) => setSupervisorStatusFilter(value === 'all' ? null : value)}>
                        <SelectTrigger className="bg-green-50/50 border-green-200 text-xs h-9">
                          <SelectValue placeholder="All Status" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Status</SelectItem>
                          <SelectItem value="pending">Pending</SelectItem>
                          <SelectItem value="done">Done</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>'''

filtersReplacement = '''{currentTab === 'facilitator' && (
                    <div className="w-full sm:w-48">
                      <label className="text-xs font-medium text-blue-600 mb-1 block">
                        Facilitator Status
                      </label>
                      <Select value={facilitatorStatusFilter || 'all'} onValueChange={(value) => setFacilitatorStatusFilter(value === 'all' ? null : value)}>
                        <SelectTrigger className="bg-blue-50/50 border-blue-200 text-xs h-9">
                          <SelectValue placeholder="All Status" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Status</SelectItem>
                          <SelectItem value="pending">Pending</SelectItem>
                          <SelectItem value="done">Done</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    )}
                    {currentTab === 'coordinator' && (
                    <div className="w-full sm:w-48">
                      <label className="text-xs font-medium text-purple-600 mb-1 block">
                        Coordinator Status
                      </label>
                      <Select value={coordinatorStatusFilter || 'all'} onValueChange={(value) => setCoordinatorStatusFilter(value === 'all' ? null : value)}>
                        <SelectTrigger className="bg-purple-50/50 border-purple-200 text-xs h-9">
                          <SelectValue placeholder="All Status" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Status</SelectItem>
                          <SelectItem value="pending">Pending</SelectItem>
                          <SelectItem value="done">Done</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    )}
                    {currentTab === 'supervisor' && (
                    <div className="w-full sm:w-48">
                      <label className="text-xs font-medium text-green-600 mb-1 block">
                        Supervisor Status
                      </label>
                      <Select value={supervisorStatusFilter || 'all'} onValueChange={(value) => setSupervisorStatusFilter(value === 'all' ? null : value)}>
                        <SelectTrigger className="bg-green-50/50 border-green-200 text-xs h-9">
                          <SelectValue placeholder="All Status" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Status</SelectItem>
                          <SelectItem value="pending">Pending</SelectItem>
                          <SelectItem value="done">Done</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    )}'''

text = text.replace(filtersTarget, filtersReplacement)


thTarget = '''<TableHead className="min-w-[120px] cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => handleColumnSort('facilitator_feedback_status')}>
                            <div className="flex items-center gap-1">
                              Facilitator Status
                              <span className={sortColumn === 'facilitator_feedback_status' ? 'font-bold text-foreground' : 'text-muted-foreground'}>
                                {getSortIndicator('facilitator_feedback_status')}
                              </span>
                            </div>
                          </TableHead>
                          <TableHead className="min-w-[120px] cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => handleColumnSort('coordinator_feedback_status')}>
                            <div className="flex items-center gap-1">
                              Coordinator Status
                              <span className={sortColumn === 'coordinator_feedback_status' ? 'font-bold text-foreground' : 'text-muted-foreground'}>
                                {getSortIndicator('coordinator_feedback_status')}
                              </span>
                            </div>
                          </TableHead>
                          <TableHead className="min-w-[120px] cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => handleColumnSort('supervisor_feedback_status')}>
                            <div className="flex items-center gap-1">
                              Supervisor Status
                              <span className={sortColumn === 'supervisor_feedback_status' ? 'font-bold text-foreground' : 'text-muted-foreground'}>
                                {getSortIndicator('supervisor_feedback_status')}
                              </span>
                            </div>
                          </TableHead>'''

thReplacement = '''{currentTab === 'facilitator' && (
                          <TableHead className="min-w-[120px] cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => handleColumnSort('facilitator_feedback_status')}>
                            <div className="flex items-center gap-1">
                              Facilitator Status
                              <span className={sortColumn === 'facilitator_feedback_status' ? 'font-bold text-foreground' : 'text-muted-foreground'}>
                                {getSortIndicator('facilitator_feedback_status')}
                              </span>
                            </div>
                          </TableHead>
                          )}
                          {currentTab === 'coordinator' && (
                          <TableHead className="min-w-[120px] cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => handleColumnSort('coordinator_feedback_status')}>
                            <div className="flex items-center gap-1">
                              Coordinator Status
                              <span className={sortColumn === 'coordinator_feedback_status' ? 'font-bold text-foreground' : 'text-muted-foreground'}>
                                {getSortIndicator('coordinator_feedback_status')}
                              </span>
                            </div>
                          </TableHead>
                          )}
                          {currentTab === 'supervisor' && (
                          <TableHead className="min-w-[120px] cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => handleColumnSort('supervisor_feedback_status')}>
                            <div className="flex items-center gap-1">
                              Supervisor Status
                              <span className={sortColumn === 'supervisor_feedback_status' ? 'font-bold text-foreground' : 'text-muted-foreground'}>
                                {getSortIndicator('supervisor_feedback_status')}
                              </span>
                            </div>
                          </TableHead>
                          )}'''

text = text.replace(thTarget, thReplacement)

tcTarget = '''<TableCell>
                            <Badge className={getStatusColor(session.facilitator_feedback_status)}>
                              {session.facilitator_feedback_status || 'PENDING'}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge className={getStatusColor(session.coordinator_feedback_status)}>
                              {session.coordinator_feedback_status || 'PENDING'}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge className={getStatusColor(session.supervisor_feedback_status)}>
                              {session.supervisor_feedback_status || 'PENDING'}
                            </Badge>
                          </TableCell>'''

tcReplacement = '''{currentTab === 'facilitator' && (
                          <TableCell>
                            <Badge className={getStatusColor(session.facilitator_feedback_status)}>
                              {session.facilitator_feedback_status || 'PENDING'}
                            </Badge>
                          </TableCell>
                          )}
                          {currentTab === 'coordinator' && (
                          <TableCell>
                            <Badge className={getStatusColor(session.coordinator_feedback_status)}>
                              {session.coordinator_feedback_status || 'PENDING'}
                            </Badge>
                          </TableCell>
                          )}
                          {currentTab === 'supervisor' && (
                          <TableCell>
                            <Badge className={getStatusColor(session.supervisor_feedback_status)}>
                              {session.supervisor_feedback_status || 'PENDING'}
                            </Badge>
                          </TableCell>
                          )}'''

text = text.replace(tcTarget, tcReplacement)

with open('src/pages/Sessions.tsx', 'w', encoding='utf-8') as f:
    f.write(text)

