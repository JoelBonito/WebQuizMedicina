/**
 * Recovery Session Tracker
 *
 * Tracks which quiz/flashcard sessions were generated from the
 * Difficulties Analysis page (recovery mode) to show the correct badge.
 */

const STORAGE_KEY = 'recovery_sessions';

interface RecoverySession {
  sessionId: string;
  type: 'quiz' | 'flashcards';
  projectId: string;
  createdAt: string;
}

/**
 * Mark a session as recovery mode
 */
export function markAsRecoverySession(
  sessionId: string,
  type: 'quiz' | 'flashcards',
  projectId: string
): void {
  try {
    const sessions = getRecoverySessions();

    // Add new session
    sessions.push({
      sessionId,
      type,
      projectId,
      createdAt: new Date().toISOString(),
    });

    // Keep only last 100 sessions to avoid localStorage bloat
    const recentSessions = sessions.slice(-100);

    localStorage.setItem(STORAGE_KEY, JSON.stringify(recentSessions));
  } catch (error) {
    console.error('Failed to mark recovery session:', error);
  }
}

/**
 * Check if a session is from recovery mode
 */
export function isRecoverySession(sessionId: string): boolean {
  try {
    const sessions = getRecoverySessions();
    return sessions.some(s => s.sessionId === sessionId);
  } catch (error) {
    console.error('Failed to check recovery session:', error);
    return false;
  }
}

/**
 * Get all recovery sessions
 */
function getRecoverySessions(): RecoverySession[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];

    const sessions = JSON.parse(stored) as RecoverySession[];

    // Clean up sessions older than 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    return sessions.filter(s => new Date(s.createdAt) > thirtyDaysAgo);
  } catch (error) {
    console.error('Failed to get recovery sessions:', error);
    return [];
  }
}

/**
 * Clear all recovery sessions (useful for cleanup)
 */
export function clearRecoverySessions(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.error('Failed to clear recovery sessions:', error);
  }
}
