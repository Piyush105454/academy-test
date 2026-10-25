export interface SubmissionRequirement {
  id: string;
  title: string;
  type: string;
}

export interface StudentReflection {
  learned: string;
  challenges: string;
  doubts: string;
}

/**
 * Parses the raw `submission_types` array from the database into structured requirements.
 * Handles backwards compatibility for old tasks that just had strings like ["pdf", "ppt"].
 */
export function parseSubmissionRequirements(rawTypes: string[] | null | undefined): SubmissionRequirement[] {
  if (!rawTypes || !Array.isArray(rawTypes) || rawTypes.length === 0) {
    return [
      { id: 'req-video', title: 'Video Recording Submission', type: 'video' },
      { id: 'req-pdf', title: 'PDF / File Submission', type: 'pdf' },
      { id: 'req-text', title: 'Notes / Text Summary', type: 'text' },
      { id: 'req-link', title: 'Resource / Project Link', type: 'link' },
    ];
  }

  return rawTypes.map((item, index) => {
    if (item.startsWith('{') && item.endsWith('}')) {
      try {
        return JSON.parse(item) as SubmissionRequirement;
      } catch (e) {
        // Fallback if parsing fails
      }
    }
    
    // Legacy format fallback
    let typeName = item.charAt(0).toUpperCase() + item.slice(1);
    if (item.toLowerCase() === 'ppt') typeName = 'Presentation';
    if (item.toLowerCase() === 'doc') typeName = 'Document';

    return {
      id: `legacy-${index}-${item}`,
      title: `${typeName} Submission`,
      type: item
    };
  });
}

/**
 * Converts the structured requirements back into a string array for saving to the database.
 */
export function serializeSubmissionRequirements(requirements: SubmissionRequirement[]): string[] {
  return requirements.map(req => JSON.stringify({
    id: req.id,
    title: req.title,
    type: req.type
  }));
}

/**
 * Parses the student's submission reflections (learned, challenges, doubts) from the submission_link payload.
 */
export function parseStudentReflection(rawLink: string | null | undefined): StudentReflection | null {
  if (!rawLink) return null;

  if (rawLink.startsWith('{') && rawLink.endsWith('}')) {
    try {
      const parsed = JSON.parse(rawLink);
      if (parsed._reflection && typeof parsed._reflection === 'object') {
        return {
          learned: parsed._reflection.learned || '',
          challenges: parsed._reflection.challenges || '',
          doubts: parsed._reflection.doubts || '',
        };
      }
      if (parsed.reflection_learned || parsed.reflection_challenges || parsed.reflection_doubts) {
        return {
          learned: parsed.reflection_learned || '',
          challenges: parsed.reflection_challenges || '',
          doubts: parsed.reflection_doubts || '',
        };
      }
    } catch (e) {
      // Fallback
    }
  }

  return null;
}

/**
 * Parses the student's submission links from the database into a map of requirementId -> url.
 * Handles backwards compatibility for old tasks that just had comma-separated URLs.
 */
export function parseSubmissionLinks(rawLink: string | null | undefined, requirements: SubmissionRequirement[]): Record<string, string> {
  if (!rawLink) return {};

  if (rawLink.startsWith('{') && rawLink.endsWith('}')) {
    try {
      const parsed = JSON.parse(rawLink) as Record<string, unknown>;
      const result: Record<string, string> = {};
      for (const [key, value] of Object.entries(parsed)) {
        if (typeof value === 'string' && !key.startsWith('_') && !key.startsWith('reflection_')) {
          result[key] = value;
        }
      }
      return result;
    } catch (e) {
      // Fallback
    }
  }

  // Legacy format fallback: just a URL or comma separated URLs
  const links = rawLink.split(',').filter(Boolean);
  const result: Record<string, string> = {};
  
  // Try to map legacy links to the legacy requirements (in order)
  requirements.forEach((req, idx) => {
    if (links[idx]) {
      result[req.id] = links[idx].trim();
    }
  });

  return result;
}

/**
 * Serializes the student's submission links map and optional reflection answers back into a string for saving.
 */
export function serializeSubmissionLinks(
  links: Record<string, string>,
  reflection?: StudentReflection | null
): string {
  const payload: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(links)) {
    if (typeof value === 'string' && !key.startsWith('_') && !key.startsWith('reflection_')) {
      if (value.trim()) {
        payload[key] = value.trim();
      }
    }
  }

  if (reflection) {
    const r: StudentReflection = {
      learned: reflection.learned?.trim() || '',
      challenges: reflection.challenges?.trim() || '',
      doubts: reflection.doubts?.trim() || ''
    };
    if (r.learned || r.challenges || r.doubts) {
      payload._reflection = r;
    }
  }

  if (Object.keys(payload).length === 0) return '';
  return JSON.stringify(payload);
}
