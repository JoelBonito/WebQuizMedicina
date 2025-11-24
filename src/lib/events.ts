/**
 * Custom Events for Content Refresh
 *
 * This provides a fallback mechanism for refreshing content lists
 * when Realtime subscriptions fail or are delayed.
 *
 * Usage:
 * - Dispatch: window.dispatchEvent(new Event(CONTENT_REFRESH_EVENT))
 * - Listen: window.addEventListener(CONTENT_REFRESH_EVENT, callback)
 */

export const CONTENT_REFRESH_EVENT = 'force_content_refresh';

/**
 * Trigger a content refresh across all listening hooks
 * Call this after successful content generation to ensure UI updates
 */
export const triggerContentRefresh = () => {
  window.dispatchEvent(new Event(CONTENT_REFRESH_EVENT));
  console.log('[Events] Content refresh triggered');
};
