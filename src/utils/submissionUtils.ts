export interface SubmissionRequirement {
  id: string;
  title: string;
  type: string;
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
 * Parses the student's submission links from the database into a map of requirementId -> url.
 * Handles backwards compatibility for old tasks that just had comma-separated URLs.
 */
export function parseSubmissionLinks(rawLink: string | null | undefined, requirements: SubmissionRequirement[]): Record<string, string> {
  if (!rawLink) return {};

  if (rawLink.startsWith('{') && rawLink.endsWith('}')) {
    try {
      return JSON.parse(rawLink) as Record<string, string>;
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
 * Serializes the student's submission links map back into a string for saving.
 */
export function serializeSubmissionLinks(links: Record<string, string>): string {
  if (Object.keys(links).length === 0) return '';
  return JSON.stringify(links);
}
