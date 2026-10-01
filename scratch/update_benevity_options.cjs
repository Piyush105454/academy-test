const fs = require('fs');

let code = fs.readFileSync('src/pages/SessionRecording.tsx', 'utf8');

const oldBlock = 
`                            <div>
                              <Label htmlFor="logged_hours_in_benevity" className="text-sm">Logged hours in Benevity?</Label>
                              <div className="flex items-center gap-2 mt-2">
                                <input
                                  id="logged_hours_in_benevity"
                                  type="checkbox"
                                  checked={hoursData.logged_hours_in_benevity}
                                  onChange={(e) => setHoursData({ ...hoursData, logged_hours_in_benevity: e.target.checked })}
                                  className="w-5 h-5"
                                />
                                <span className="text-sm">{hoursData.logged_hours_in_benevity ? 'Yes' : 'No'}</span>
                              </div>
                            </div>`;

const newBlock = 
`                            <div>
                              <Label className="text-sm font-semibold">Logged hours in Benevity?</Label>
                              <div className="flex items-center gap-4 mt-2">
                                <label 
                                  className={\`flex items-center gap-2 px-3 py-1.5 rounded-md border cursor-pointer transition-colors \${
                                    hoursData.logged_hours_in_benevity === true 
                                      ? 'bg-emerald-50 border-emerald-500 text-emerald-700 font-semibold' 
                                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                                  }\`}
                                >
                                  <input
                                    type="radio"
                                    name="logged_hours_in_benevity"
                                    value="yes"
                                    checked={hoursData.logged_hours_in_benevity === true}
                                    onChange={() => setHoursData({ ...hoursData, logged_hours_in_benevity: true })}
                                    className="w-4 h-4 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                                  />
                                  <span className="text-sm">Yes</span>
                                </label>

                                <label 
                                  className={\`flex items-center gap-2 px-3 py-1.5 rounded-md border cursor-pointer transition-colors \${
                                    hoursData.logged_hours_in_benevity === false 
                                      ? 'bg-rose-50 border-rose-500 text-rose-700 font-semibold' 
                                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                                  }\`}
                                >
                                  <input
                                    type="radio"
                                    name="logged_hours_in_benevity"
                                    value="no"
                                    checked={hoursData.logged_hours_in_benevity === false}
                                    onChange={() => setHoursData({ ...hoursData, logged_hours_in_benevity: false })}
                                    className="w-4 h-4 text-rose-600 focus:ring-rose-500 cursor-pointer"
                                  />
                                  <span className="text-sm">No</span>
                                </label>
                              </div>
                            </div>`;

const oldBlockCRLF = oldBlock.replace(/\n/g, '\r\n');
const newBlockCRLF = newBlock.replace(/\n/g, '\r\n');

if (code.includes(oldBlockCRLF)) {
  code = code.replace(oldBlockCRLF, newBlockCRLF);
  console.log('Replaced with CRLF');
} else if (code.includes(oldBlock)) {
  code = code.replace(oldBlock, newBlock);
  console.log('Replaced with LF');
} else {
  console.error('Could not find oldBlock in SessionRecording.tsx');
  process.exit(1);
}

fs.writeFileSync('src/pages/SessionRecording.tsx', code, 'utf8');
console.log('Updated SessionRecording.tsx successfully');
