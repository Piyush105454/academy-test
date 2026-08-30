const fs = require('fs');

// Facilitators
let fac = fs.readFileSync('src/pages/Facilitators.tsx', 'utf-8');
const facUpdateAuth = `
        if (error) throw error;
        
        // Update user_profiles login status
        try {
          await supabase.from('user_profiles').update({ is_active: formData.status === 'active' }).ilike('email', normalizedEmail);
        } catch(e) {}
        
        toast.success('Facilitator updated successfully');
`;
fac = fac.replace(/if \(error\) throw error;\s*toast\.success\('Facilitator updated successfully'\);/, facUpdateAuth);

const facCreateAuth = `
        if (error) throw error;
        
        // Ensure user_profiles gets the right active status if it exists
        try {
          await supabase.from('user_profiles').update({ is_active: formData.status === 'active' }).ilike('email', normalizedEmail);
        } catch(e) {}
        
        toast.success('Facilitator created successfully');
`;
fac = fac.replace(/if \(error\) throw error;\s*toast\.success\('Facilitator created successfully'\);/, facCreateAuth);

fs.writeFileSync('src/pages/Facilitators.tsx', fac);

// Coordinators
let coord = fs.readFileSync('src/pages/Coordinators.tsx', 'utf-8');
const coordUpdateAuth = `
          .eq('id', editingCoordinator.id);

        if (error) throw error;
        
        // Update user_profiles login status
        try {
          await supabase.from('user_profiles').update({ is_active: editForm.status === 'active' }).ilike('email', normalizedEmail);
        } catch(e) {}

        setCoordinators(coordinators.map(c => 
`;
coord = coord.replace(/\.eq\('id', editingCoordinator\.id\);\s*if \(error\) throw error;\s*setCoordinators\(coordinators\.map\(c => /m, coordUpdateAuth);

const coordCreateAuth = `
          }]);

        if (error) throw error;
        
        // Ensure user_profiles gets the right active status if it exists
        try {
          await supabase.from('user_profiles').update({ is_active: newForm.status === 'active' }).ilike('email', normalizedEmail);
        } catch(e) {}

        toast.success('Coordinator created successfully');
`;
coord = coord.replace(/\}\]\);\s*if \(error\) throw error;\s*toast\.success\('Coordinator created successfully'\);/m, coordCreateAuth);

fs.writeFileSync('src/pages/Coordinators.tsx', coord);
console.log('Facilitators and Coordinators updated!');
