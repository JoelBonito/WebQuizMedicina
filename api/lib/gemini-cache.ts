/**
 * Gemini Context Caching Module
 *
 * Implements context caching to reduce input token costs by up to 95%.
 * Cache is reused across multiple requests with the same base content.
 *
 * Use cases:
 * - Quiz generation in batches (reuse medical content across batches)
 * - Flashcard generation in batches
 * - Chat sessions (reuse document context for multiple questions)
 */

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta';

export interface CacheInfo {
  name: string;
  displayName: string;
  model: string;
  createTime: string;
  updateTime: string;
  expireTime: string;
}

export interface CreateCacheOptions {
  ttlSeconds?: number; // Time-to-live in seconds (default: 300 = 5 minutes)
  displayName?: string; // Human-readable name for debugging
}

/**
 * Create a context cache for reuse across multiple requests
 *
 * @param content - The content to cache (e.g., medical document text)
 * @param apiKey - Gemini API key
 * @param model - The Gemini model to use
 * @param options - Cache configuration options
 * @returns Cache info including the cache name (ID) to use in subsequent requests
 */
export async function createContextCache(
  content: string,
  apiKey: string,
  model: 'gemini-2.5-flash' | 'gemini-2.5-pro' | 'gemini-2.5-flash-lite' = 'gemini-2.5-flash',
  options: CreateCacheOptions = {}
): Promise<CacheInfo> {
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY not configured');
  }

  const ttlSeconds = options.ttlSeconds || 300; // Default: 5 minutes
  const displayName = options.displayName || `cache-${Date.now()}`;

  console.log(`🔧 [Cache] Creating context cache...`);
  console.log(`📊 [Cache] Content size: ${content.length} chars (~${Math.ceil(content.length / 4)} tokens)`);
  console.log(`⏱️  [Cache] TTL: ${ttlSeconds}s (${Math.floor(ttlSeconds / 60)} minutes)`);

  const response = await fetch(
    `${GEMINI_API_URL}/cachedContents`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        model: `models/${model}`,
        displayName,
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: content
              }
            ]
          }
        ],
        ttl: `${ttlSeconds}s`
      }),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    console.error('❌ [Cache] Failed to create cache:', error);
    throw new Error(`Gemini Cache API error: ${error}`);
  }

  const cacheInfo: CacheInfo = await response.json();

  console.log(`✅ [Cache] Cache created successfully`);
  console.log(`🆔 [Cache] Cache name: ${cacheInfo.name}`);
  console.log(`⏰ [Cache] Expires at: ${cacheInfo.expireTime}`);

  return cacheInfo;
}

/**
 * Delete a context cache to free resources
 *
 * @param cacheName - The cache name returned from createContextCache
 * @param apiKey - Gemini API key
 */
export async function deleteContextCache(cacheName: string, apiKey: string): Promise<void> {
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY not configured');
  }

  console.log(`🗑️  [Cache] Deleting cache: ${cacheName}`);

  const response = await fetch(
    `${GEMINI_API_URL}/${cacheName}`,
    {
      method: 'DELETE',
      headers: {
        'x-goog-api-key': apiKey,
      },
    }
  );

  if (!response.ok) {
    const error = await response.text();
    console.warn(`⚠️ [Cache] Failed to delete cache: ${error}`);
    // Don't throw - cache will auto-expire anyway
    return;
  }

  console.log(`✅ [Cache] Cache deleted successfully`);
}

/**
 * Get information about an existing cache
 *
 * @param cacheName - The cache name to query
 * @param apiKey - Gemini API key
 * @returns Cache info or null if cache doesn't exist
 */
export async function getCacheInfo(cacheName: string, apiKey: string): Promise<CacheInfo | null> {
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY not configured');
  }

  const response = await fetch(
    `${GEMINI_API_URL}/${cacheName}`,
    {
      method: 'GET',
      headers: {
        'x-goog-api-key': apiKey,
      },
    }
  );

  if (!response.ok) {
    if (response.status === 404) {
      return null; // Cache not found or expired
    }
    const error = await response.text();
    throw new Error(`Failed to get cache info: ${error}`);
  }

  return await response.json();
}

/**
 * Check if a cache is still valid (not expired)
 *
 * @param cacheName - The cache name to check
 * @param apiKey - Gemini API key
 * @returns true if cache exists and is not expired
 */
export async function isCacheValid(cacheName: string, apiKey: string): Promise<boolean> {
  const cacheInfo = await getCacheInfo(cacheName, apiKey);

  if (!cacheInfo) {
    return false;
  }

  const expireTime = new Date(cacheInfo.expireTime);
  const now = new Date();

  return expireTime > now;
}

/**
 * Helper function to safely delete cache with error handling
 * Use this in finally blocks to ensure cleanup
 */
export async function safeDeleteCache(cacheName: string | null, apiKey: string): Promise<void> {
  if (!cacheName) {
    return;
  }

  try {
    await deleteContextCache(cacheName, apiKey);
  } catch (error) {
    console.warn(`⚠️ [Cache] Error during cache cleanup (non-critical):`, error);
    // Silently ignore cleanup errors
  }
}
