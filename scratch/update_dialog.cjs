const fs = require('fs');

function updateDialog() {
    let content = fs.readFileSync('src/components/curriculum/EditCurriculumDialog.tsx', 'utf-8');

    // 1. Update interface
    content = content.replace(
        /quiz_content_ppt: string;/g,
        "quiz_content_ppt: string;\n  material_link?: string;"
    );

    // 2. Update formData state
    content = content.replace(
        /quiz_content_ppt: '',\s*\n\s*\}\);/g,
        "quiz_content_ppt: '',\n    material_link: '',\n  });"
    );

    // 3. Update useEffect
    content = content.replace(
        /quiz_content_ppt: item\.quiz_content_ppt \|\| '',\s*\n\s*\}\);/g,
        "quiz_content_ppt: item.quiz_content_ppt || '',\n        material_link: item.material_link || '',\n      });"
    );

    // 4. Update handleSave
    content = content.replace(
        /quiz_content_ppt: formData\.quiz_content_ppt \|\| null,/g,
        "quiz_content_ppt: formData.quiz_content_ppt || null,\n          material_link: formData.material_link || null,"
    );

    // 5. Update UI Labels (PPT/Quiz -> Quiz, adding Material)
    content = content.replace(
        /Update video links, PPT\/Quiz, and session links/g,
        "Update video links, Quiz, Material, and session links"
    );

    content = content.replace(
        /PPT\/Quiz Link/g,
        "Quiz Link"
    );

    const inputBlockRegex = /(<Label htmlFor="quiz_content_ppt"[\s\S]*?<\/div>)/;
    const materialInputBlock = `
          <div>
            <Label htmlFor="material_link" className="text-sm font-medium">
              Material Link
            </Label>
            <Input
              id="material_link"
              placeholder="https://example.com/material"
              value={formData.material_link}
              onChange={(e) =>
                setFormData({ ...formData, material_link: e.target.value })
              }
              className="mt-1"
            />
          </div>`;
    
    content = content.replace(inputBlockRegex, "$1\n" + materialInputBlock);

    fs.writeFileSync('src/components/curriculum/EditCurriculumDialog.tsx', content);
    console.log('EditCurriculumDialog.tsx updated!');
}

updateDialog();
