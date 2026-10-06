import re

with open('src/pages/Sessions.tsx', 'r', encoding='utf-8') as f:
    text = f.read()

# Add useSearchParams import if missing
if 'useSearchParams' not in text:
    text = text.replace('import { useNavigate } from \'react-router-dom\';', 'import { useNavigate, useSearchParams } from \'react-router-dom\';\nimport { Tabs, TabsList, TabsTrigger } from \'@/components/ui/tabs\';')

# Add searchParams and currentTab definitions if missing
if 'const currentTab' not in text:
    text = text.replace('const navigate = useNavigate();', 'const navigate = useNavigate();\n  const [searchParams] = useSearchParams();\n  const currentTab = searchParams.get(\'tab\') || \'facilitator\';')

# Update getFilteredSessions to filter by roles
if 'if (currentTab === \'coordinator\')' not in text:
    text = text.replace('''  const getFilteredSessions = () => {
    let filtered = sessions;''', '''  const getFilteredSessions = () => {
    let filtered = sessions;
    
    if (currentTab === 'coordinator') {
      filtered = filtered.filter(s => (s.facilitator_feedback_status || '').toLowerCase() === 'completed' || (s.facilitator_feedback_status || '').toLowerCase() === 'done');
    } else if (currentTab === 'supervisor') {
      filtered = filtered.filter(s => (s.coordinator_feedback_status || '').toLowerCase() === 'completed' || (s.coordinator_feedback_status || '').toLowerCase() === 'done');
    }''')

# Add Tabs UI
if '<Tabs value={currentTab}' not in text:
    text = text.replace('''<div className=\"flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto\">''', '''<div className=\"flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto\">\n              <Tabs value={currentTab} onValueChange={(v) => { const newP = new URLSearchParams(searchParams); newP.set('tab', v); navigate('?'+newP.toString()); }} className=\"w-full sm:w-auto\">\n                <TabsList>\n                  <TabsTrigger value=\"facilitator\">Facilitator</TabsTrigger>\n                  <TabsTrigger value=\"coordinator\">Coordinator</TabsTrigger>\n                  <TabsTrigger value=\"supervisor\">Supervisor</TabsTrigger>\n                </TabsList>\n              </Tabs>''')


with open('src/pages/Sessions.tsx', 'w', encoding='utf-8') as f:
    f.write(text)
