/**
 * Utility functions for session feedback locking and temporary time-limited unlocking
 */

export interface FeedbackLockableSession {
  id?: string;
  session_date?: string | null;
  feedback_unlocked?: boolean | null;
  feedback_unlocked_until?: string | null;
}

/**
 * Checks whether feedback is currently unlocked for a session.
 * If feedback_unlocked_until is specified, it ensures current time is before the expiration.
 * After the expiration time passes, the session is automatically considered locked again.
 */
export function isFeedbackCurrentlyUnlocked(session?: FeedbackLockableSession | null): boolean {
  if (!session || !session.feedback_unlocked) {
    return false;
  }

  // If an expiration timestamp is set, check if it has passed
  if (session.feedback_unlocked_until) {
    const expiry = new Date(session.feedback_unlocked_until).getTime();
    if (isNaN(expiry)) {
      return Boolean(session.feedback_unlocked);
    }
    // Expired! Automatically locked again
    if (expiry <= Date.now()) {
      return false;
    }
    return true;
  }

  // Legacy fallback if feedback_unlocked is true without explicit until date
  return true;
}

/**
 * Checks if feedback is locked for a given user role based on session age and unlock status.
 * - Admin (role 1): Never locked
 * - Temporary unlock: Unlocked if within active window
 * - Normal:
 *   - Facilitator (role 4) & Coordinator (role 3): Locked if session is older than 3 days
 *   - Supervisor (role 2): Locked if session is older than 7 days
 */
export function isSessionFeedbackLocked(
  session?: FeedbackLockableSession | null,
  userRole?: number | null
): boolean {
  if (!session || userRole === 1) return false;

  // Check temporary time-limited unlock
  if (isFeedbackCurrentlyUnlocked(session)) {
    return false;
  }

  if (!session.session_date) return false;

  const msPerDay = 1000 * 60 * 60 * 24;
  const sessionTime = new Date(session.session_date).getTime();
  if (isNaN(sessionTime)) return false;

  const diffDays = Math.floor((Date.now() - sessionTime) / msPerDay);

  if ((userRole === 4 || userRole === 3) && diffDays > 3) return true;
  if (userRole === 2 && diffDays > 7) return true;

  return false;
}

/**
 * Formats remaining time until unlock expires (e.g., "7h 45m left", "25m left", "Expired")
 */
export function getUnlockRemainingTimeText(untilDateStr?: string | null): string | null {
  if (!untilDateStr) return null;
  const expiry = new Date(untilDateStr).getTime();
  if (isNaN(expiry)) return null;

  const diffMs = expiry - Date.now();
  if (diffMs <= 0) return 'Expired';

  const totalMinutes = Math.floor(diffMs / (1000 * 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m left`;
  }
  return `${minutes}m left`;
}

/**
 * Formats date and time for display (e.g., "Today, 30 Oct at 05:30 PM")
 */
export function formatUnlockDateTime(dateInput: Date | string): string {
  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  if (isNaN(date.getTime())) return '';

  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const isTomorrow = date.toDateString() === tomorrow.toDateString();

  const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });

  if (isToday) {
    return `Today at ${timeStr}`;
  }
  if (isTomorrow) {
    return `Tomorrow at ${timeStr}`;
  }

  const dateStr = date.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
  return `${dateStr} at ${timeStr}`;
}
