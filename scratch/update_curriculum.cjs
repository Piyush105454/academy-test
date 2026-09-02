const fs = require('fs');

function updateCurriculum() {
    let content = fs.readFileSync('src/pages/Curriculum.tsx', 'utf-8');

    // 1. Update interfaces
    content = content.replace(
        /quiz_content_ppt: string;\n\s*fresh_session\?: string;/g,
        "quiz_content_ppt: string;\n    material_link?: string;\n    fresh_session?: string;"
    );

    // 2. Update TableHead
    content = content.replace(
        /<TableHead className="min-w-\[100px\]">PPT\/Quiz<\/TableHead>/g,
        '<TableHead className="min-w-[100px]">Quiz</TableHead>\n                            <TableHead className="min-w-[100px]">Material</TableHead>'
    );
    
    // There might be another place where the column is shown, let's look for PPT/Quiz
    content = content.replace(
        /PPT\/Quiz/g,
        'Quiz'
    );

    // 3. Update TableBody (Desktop view)
    const pptQuizCellRegex = /(<TableCell>\s*\{item\.quiz_content_ppt \? \(\s*<a\s*href=\{item\.quiz_content_ppt\}[\s\S]*?<\/TableCell>)/;
    const materialCell = `
                            <TableCell>
                              {item.material_link ? (
                                <a
                                  href={item.material_link}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-primary hover:underline"
                                >
                                  <div className="flex items-center gap-1">
                                    <FileText className="h-4 w-4 text-purple-500" />
                                    <span>View</span>
                                  </div>
                                </a>
                              ) : '-'}
                            </TableCell>`;
    
    content = content.replace(pptQuizCellRegex, "$1" + materialCell);

    // 4. Update Mobile view
    const mobilePptQuizRegex = /(\{item\.quiz_content_ppt && \([\s\S]*?<\/a>\s*<\/div>\s*\)\})/;
    const mobileMaterialBlock = `
                        {item.material_link && (
                          <div className="text-xs">
                            <a
                              href={item.material_link}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-primary hover:underline font-medium"
                            >
                              <div className="flex items-center gap-1">
                                <FileText className="h-3 w-3 text-purple-500" />
                                <span>Material</span>
                              </div>
                            </a>
                          </div>
                        )}`;
    
    content = content.replace(mobilePptQuizRegex, "$1\n" + mobileMaterialBlock);

    fs.writeFileSync('src/pages/Curriculum.tsx', content);
    console.log('Curriculum.tsx updated!');
}

updateCurriculum();
