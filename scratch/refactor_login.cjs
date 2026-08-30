const fs = require('fs');

// 1. Update AuthContext.tsx
let authContext = fs.readFileSync('src/contexts/AuthContext.tsx', 'utf-8');

const signInReplacement = `
  const signIn = async (email: string, password: string) => {
    const { data: authData, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    
    if (!error && authData.user) {
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('is_active')
        .eq('id', authData.user.id)
        .maybeSingle();
        
      if (profile && profile.is_active === false) {
        await supabase.auth.signOut();
        return { error: new Error('Your account has been deactivated. Please contact an administrator.') };
      }
    }
    
    return { error };
  };
`;
authContext = authContext.replace(/const signIn = async [\s\S]*?return \{ error \};\n  \};/m, signInReplacement.trim());

const initAuthReplace = `
      const initializeAuth = async () => {
        try {
          const { data: { session: existingSession } } = await supabase.auth.getSession();
          
          let isValid = true;
          if (existingSession?.user) {
            const { data: profile } = await supabase
              .from('user_profiles')
              .select('is_active')
              .eq('id', existingSession.user.id)
              .maybeSingle();
              
            if (profile && profile.is_active === false) {
              isValid = false;
              await supabase.auth.signOut();
            }
          }
          
          if (isMounted) {
            setSession(isValid ? existingSession : null);
            setUser(isValid ? existingSession?.user ?? null : null);
          }
        } catch (error) {
`;
authContext = authContext.replace(/const initializeAuth = async \(\) => \{\s*try \{\s*\/\/ First, check for existing session\s*const \{ data: \{ session: existingSession \} \} = await supabase\.auth\.getSession\(\);\s*if \(isMounted\) \{\s*setSession\(existingSession\);\s*setUser\(existingSession\?\.user \?\? null\);\s*\}\s*\} catch \(error\) \{/m, initAuthReplace.trim() + " {");

const authStateReplace = `
      const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, currentSession) => {
        if (isMounted) {
          let isValid = true;
          if (currentSession?.user && event === 'SIGNED_IN') {
            const { data: profile } = await supabase.from('user_profiles').select('is_active').eq('id', currentSession.user.id).maybeSingle();
            if (profile && profile.is_active === false) {
              isValid = false;
              await supabase.auth.signOut();
            }
          }
          
          if (isValid) {
            setSession(currentSession);
            setUser(currentSession?.user ?? null);
          } else {
            setSession(null);
            setUser(null);
          }
          setLoading(false);
        }
      });
`;
authContext = authContext.replace(/const \{ data: \{ subscription \} \} = supabase\.auth\.onAuthStateChange\(\(event, currentSession\) => \{\s*if \(isMounted\) \{\s*setSession\(currentSession\);\s*setUser\(currentSession\?\.user \?\? null\);\s*setLoading\(false\);\s*\}\s*\}\);/m, authStateReplace.trim());

fs.writeFileSync('src/contexts/AuthContext.tsx', authContext);


// 2. Update StudentAuth.tsx
let studentAuth = fs.readFileSync('src/pages/StudentAuth.tsx', 'utf-8');

const studentLoginReplace = `
      try {
        // Validate student email first
        const isStudent = await validateStudentEmail(email);
        if (!isStudent) {
          setError('You do not have class email, or your account has been deactivated.');
          setLoading(false);
          return;
        }
        
        const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
  
        if (authError) {
          setError(authError.message);
        } else if (authData.user) {
          // Double check user profile status
          const { data: profile } = await supabase
            .from('user_profiles')
            .select('is_active')
            .eq('id', authData.user.id)
            .maybeSingle();
            
          if (profile && profile.is_active === false) {
            await supabase.auth.signOut();
            setError('Your account has been deactivated. Please contact your coordinator.');
          } else {
            navigate('/student-dashboard');
          }
        }
      } catch (err) {
`;

studentAuth = studentAuth.replace(/try \{\s*\/\/ Validate student email first\s*const isStudent = await validateStudentEmail\(email\);\s*if \(\!isStudent\) \{\s*setError\('You do not have class email'\);\s*setLoading\(false\);\s*return;\s*\}\s*const \{ error: authError \} = await supabase\.auth\.signInWithPassword\(\{\s*email,\s*password,\s*\}\);\s*if \(authError\) \{\s*setError\(authError\.message\);\s*\} else \{\s*navigate\('\/student-dashboard'\);\s*\}\s*\} catch \(err\) \{/m, studentLoginReplace.trim() + " {");

const validateStudentReplace = `
  const validateStudentEmail = async (studentEmail: string): Promise<boolean> => {
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('id, class_id, is_active')
        .ilike('email', studentEmail)
        .eq('role_id', 5) // Student role
        .not('class_id', 'is', null) // Must have a class assigned
        .limit(1)
        .maybeSingle();

      if (error) {
        return false;
      }
      
      // If found but inactive, deny validation
      if (data && data.is_active === false) {
        return false;
      }
      
      return !!data;
    } catch (err) {
      return false;
    }
  };
`;

studentAuth = studentAuth.replace(/const validateStudentEmail = async [\s\S]*?return false;\s*\}\s*\};/, validateStudentReplace.trim());

fs.writeFileSync('src/pages/StudentAuth.tsx', studentAuth);

console.log('Login logic updated to enforce is_active check!');
