/**
 * Recovery Session Tracker (In-Memory)
 *
 * Tracks which quiz/flashcard sessions were generated from the
 * Difficulties Analysis page during the current browser session.
 * Uses in-memory Set instead of localStorage to work with incognito mode.
 */

// In-memory set of recovery session IDs (cleared on page refresh)
const recoverySessions = new Set<string>();

/**
 * Mark a session as recovery mode
 */
export function markAsRecoverySession(sessionId: string): void {
  recoverySessions.add(sessionId);
}

/**
 * Check if a session is from recovery mode
 */
export function isRecoverySession(sessionId: string): boolean {
  return recoverySessions.has(sessionId);
}

/**
 * Clear all recovery sessions
 */
export function clearRecoverySessions(): void {
  recoverySessions.clear();
}

