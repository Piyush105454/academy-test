/**
 * Utility to generate and format sequential Session ID Codes.
 * Format: YYYY-MM-ClassName-TypePrefix-001
 * Example: 2026-07-CCCEMPFellow-gt-001
 * 
 * Rules:
 * - YYYY-MM: Year and Month from session date
 * - ClassName: Cleaned class batch name without special chars or spaces (e.g., CCCEMPFellow)
 * - TypePrefix: gt (guest_teacher), lt (local_teacher), gs (guest_speaker)
 * - Sequence: 3-digit number (001, 002...) resetting each month per class/type combination
 */

export interface SessionCodeItem {
  id: string;
  session_date: string;
  class_batch?: string | null;
  session_type?: string | null;
  session_id_code?: string | null;
}

export function getTypePrefix(sessionType?: string | null): string {
  switch (sessionType) {
    case 'guest_teacher':
      return 'gt';
    case 'local_teacher':
      return 'lt';
    case 'guest_speaker':
      return 'gs';
    default:
      return 'gt';
  }
}

export function cleanClassName(className?: string | null): string {
  if (!className || !className.trim()) return 'Class';
  // Remove spaces and non-alphanumeric characters
  const cleaned = className.trim().replace(/[^a-zA-Z0-9]/g, '');
  return cleaned || 'Class';
}

/**
 * Computes sequential Session ID Codes for a list of session objects.
 * Orders them chronologically and calculates sequence numbers 001, 002... per YYYY-MM-Class-Type group.
 */
export function attachSessionIdCodes<T extends SessionCodeItem>(sessions: T[]): (T & { session_id_code: string })[] {
  // Count frequencies of incoming session_id_codes to detect duplicates
  const rawCodeCounts: Record<string, number> = {};
  sessions.forEach(s => {
    if (s.session_id_code) {
      rawCodeCounts[s.session_id_code] = (rawCodeCounts[s.session_id_code] || 0) + 1;
    }
  });

  // Sort chronologically by date
  const sorted = [...sessions].sort((a, b) => {
    const dateA = new Date(a.session_date || '1970-01-01').getTime();
    const dateB = new Date(b.session_date || '1970-01-01').getTime();
    return dateA - dateB;
  });

  const groupCounters: Record<string, number> = {};
  const seenCodes = new Set<string>();

  const mapped = sorted.map(session => {
    const rawDate = session.session_date ? session.session_date.split('T')[0] : '2026-01-01';
    const parts = rawDate.split('-');
    const year = parts[0] || '2026';
    const month = parts[1] || '01';
    const ym = `${year}-${month}`;

    const cls = cleanClassName(session.class_batch);
    const prefix = getTypePrefix(session.session_type);
    const groupKey = `${ym}-${cls}-${prefix}`;

    // If a valid, unique session_id_code already exists on the record for this group and is not a duplicate, use it
    if (
      session.session_id_code &&
      session.session_id_code.startsWith(`${ym}-${cls}-${prefix}-`) &&
      rawCodeCounts[session.session_id_code] === 1 &&
      !seenCodes.has(session.session_id_code)
    ) {
      seenCodes.add(session.session_id_code);
      const seqPart = parseInt(session.session_id_code.split('-').pop() || '0', 10);
      if (!isNaN(seqPart) && seqPart > (groupCounters[groupKey] || 0)) {
        groupCounters[groupKey] = seqPart;
      }
      return { ...session, session_id_code: session.session_id_code };
    }

    // Otherwise, generate sequential code ensuring no duplicates
    groupCounters[groupKey] = (groupCounters[groupKey] || 0) + 1;
    let seq = String(groupCounters[groupKey]).padStart(3, '0');
    let generatedCode = `${ym}-${cls}-${prefix}-${seq}`;

    while (seenCodes.has(generatedCode)) {
      groupCounters[groupKey] = (groupCounters[groupKey] || 0) + 1;
      seq = String(groupCounters[groupKey]).padStart(3, '0');
      generatedCode = `${ym}-${cls}-${prefix}-${seq}`;
    }

    seenCodes.add(generatedCode);
    return {
      ...session,
      session_id_code: generatedCode
    };
  });

  // Map back to maintain original order if needed
  const codeMap = new Map(mapped.map(item => [item.id, item.session_id_code]));
  return sessions.map(s => ({
    ...s,
    session_id_code: codeMap.get(s.id) || formatSingleSessionCode(s.session_date, s.class_batch, s.session_type, 1)
  }));
}

/**
 * Formats a single session code given parameters and a sequence index.
 */
export function formatSingleSessionCode(
  sessionDate: string, 
  classBatch?: string | null, 
  sessionType?: string | null, 
  sequenceNumber: number = 1
): string {
  const rawDate = sessionDate ? sessionDate.split('T')[0] : '2026-01-01';
  const parts = rawDate.split('-');
  const year = parts[0] || '2026';
  const month = parts[1] || '01';
  
  const cls = cleanClassName(classBatch);
  const prefix = getTypePrefix(sessionType);
  const seq = String(sequenceNumber).padStart(3, '0');

  return `${year}-${month}-${cls}-${prefix}-${seq}`;
}
