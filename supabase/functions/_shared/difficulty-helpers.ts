/**
 * Difficulty Helpers Module (Phase 4C)
 *
 * Provides utilities for:
 * - Topic normalization using taxonomy
 * - Auto-resolution of difficulties
 * - Progress tracking
 */

export interface AutoResolveResult {
  difficulty_found: boolean;
  difficulty_id?: string;
  consecutive_correct?: number;
  auto_resolved?: boolean;
  threshold?: number;
}

/**
 * Normalize a difficulty topic using the taxonomy table
 *
 * Examples:
 * - "Coração" → "Cardiologia"
 * - "DM1" → "Diabetes Mellitus Tipo 1"
 * - "insulina" → "Insulina"
 *
 * @param supabaseClient - Supabase client instance
 * @param topic - Raw topic string to normalize
 * @returns Normalized canonical term
 */
export async function normalizeDifficultyTopic(
  supabaseClient: any,
  topic: string
): Promise<string> {
  if (!topic || topic.trim() === '') {
    return topic;
  }

  try {
    // Call the database function
    const { data, error } = await supabaseClient.rpc('normalize_difficulty_topic', {
      input_topic: topic
    });

    if (error) {
      console.warn(`⚠️ [Taxonomy] Error normalizing topic "${topic}":`, error);
      // Return original if normalization fails
      return topic.trim();
    }

    const normalized = data || topic;

    if (normalized !== topic) {
      console.log(`✅ [Taxonomy] Normalized "${topic}" → "${normalized}"`);
    }

    return normalized;
  } catch (error) {
    console.warn(`⚠️ [Taxonomy] Exception normalizing topic:`, error);
    return topic.trim();
  }
}

/**
 * Check and potentially auto-resolve a difficulty
 *
 * Call this after a student answers a recovery quiz/flashcard.
 * If they get 3 consecutive correct answers on the same topic,
 * the difficulty will be automatically marked as resolved.
 *
 * @param supabaseClient - Supabase client instance
 * @param userId - Student user ID
 * @param projectId - Project UUID
 * @param topic - Difficulty topic (normalized)
 * @param correct - Whether the answer was correct
 * @returns Result object with auto-resolution status
 */
export async function checkAutoResolveDifficulty(
  supabaseClient: any,
  userId: string,
  projectId: string,
  topic: string,
  correct: boolean
): Promise<AutoResolveResult> {
  try {
    const { data, error } = await supabaseClient.rpc('check_auto_resolve_difficulty', {
      p_user_id: userId,
      p_project_id: projectId,
      p_topic: topic,
      p_correct: correct
    });

    if (error) {
      console.error(`❌ [Auto-Resolve] Error checking difficulty:`, error);
      return { difficulty_found: false };
    }

    const result: AutoResolveResult = data || { difficulty_found: false };

    // Log the result
    if (result.difficulty_found) {
      if (result.auto_resolved) {
        console.log(`🎉 [Auto-Resolve] Difficulty "${topic}" AUTO-RESOLVED! (${result.consecutive_correct}/${result.threshold} correct)`);
      } else if (correct) {
        console.log(`✅ [Auto-Resolve] Progress on "${topic}": ${result.consecutive_correct}/${result.threshold} correct`);
      } else {
        console.log(`❌ [Auto-Resolve] Streak reset for "${topic}" (incorrect answer)`);
      }
    }

    return result;
  } catch (error) {
    console.error(`❌ [Auto-Resolve] Exception:`, error);
    return { difficulty_found: false };
  }
}

/**
 * Get all taxonomy entries (for admin/debugging)
 *
 * @param supabaseClient - Supabase client instance
 * @returns Array of taxonomy entries
 */
export async function getAllTaxonomyEntries(
  supabaseClient: any
): Promise<any[]> {
  try {
    const { data, error } = await supabaseClient
      .from('difficulty_taxonomy')
      .select('*')
      .order('category', { ascending: true })
      .order('canonical_term', { ascending: true });

    if (error) {
      console.error(`❌ [Taxonomy] Error fetching entries:`, error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error(`❌ [Taxonomy] Exception fetching entries:`, error);
    return [];
  }
}

/**
 * Add a new taxonomy entry (admin only)
 *
 * @param supabaseClient - Supabase client instance
 * @param canonicalTerm - The canonical/normalized term
 * @param synonyms - Array of synonym strings
 * @param category - Optional category (e.g., 'Cardiologia')
 * @param description - Optional description
 * @returns Success status
 */
export async function addTaxonomyEntry(
  supabaseClient: any,
  canonicalTerm: string,
  synonyms: string[],
  category?: string,
  description?: string
): Promise<boolean> {
  try {
    const { error } = await supabaseClient
      .from('difficulty_taxonomy')
      .insert({
        canonical_term: canonicalTerm,
        synonyms: synonyms,
        category: category || null,
        description: description || null
      });

    if (error) {
      console.error(`❌ [Taxonomy] Error adding entry:`, error);
      return false;
    }

    console.log(`✅ [Taxonomy] Added entry: "${canonicalTerm}" with ${synonyms.length} synonyms`);
    return true;
  } catch (error) {
    console.error(`❌ [Taxonomy] Exception adding entry:`, error);
    return false;
  }
}

/**
 * Search for a canonical term by synonym
 *
 * @param supabaseClient - Supabase client instance
 * @param synonym - Synonym to search for
 * @returns Canonical term or null if not found
 */
export async function findCanonicalTerm(
  supabaseClient: any,
  synonym: string
): Promise<string | null> {
  try {
    // Use the normalize function (it does exactly this)
    const normalized = await normalizeDifficultyTopic(supabaseClient, synonym);

    // If normalized === synonym (case-insensitive), no match was found in taxonomy
    if (normalized.toLowerCase() === synonym.toLowerCase()) {
      return null;
    }

    return normalized;
  } catch (error) {
    console.error(`❌ [Taxonomy] Exception finding canonical term:`, error);
    return null;
  }
}

/**
 * Get difficulty progress for a user in a project
 *
 * @param supabaseClient - Supabase client instance
 * @param userId - User ID
 * @param projectId - Project ID
 * @returns Array of difficulties with progress information
 */
export async function getDifficultyProgress(
  supabaseClient: any,
  userId: string,
  projectId: string
): Promise<any[]> {
  try {
    const { data, error } = await supabaseClient
      .from('difficulties')
      .select('*')
      .eq('user_id', userId)
      .eq('project_id', projectId)
      .order('nivel', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) {
      console.error(`❌ [Difficulty] Error fetching progress:`, error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error(`❌ [Difficulty] Exception fetching progress:`, error);
    return [];
  }
}

/**
 * Manually resolve a difficulty (admin/user action)
 *
 * @param supabaseClient - Supabase client instance
 * @param difficultyId - Difficulty UUID
 * @returns Success status
 */
export async function manuallyResolveDifficulty(
  supabaseClient: any,
  difficultyId: string
): Promise<boolean> {
  try {
    const { error } = await supabaseClient
      .from('difficulties')
      .update({ resolvido: true })
      .eq('id', difficultyId);

    if (error) {
      console.error(`❌ [Difficulty] Error manually resolving:`, error);
      return false;
    }

    console.log(`✅ [Difficulty] Manually resolved: ${difficultyId}`);
    return true;
  } catch (error) {
    console.error(`❌ [Difficulty] Exception manually resolving:`, error);
    return false;
  }
}

/**
 * Get statistics about difficulties (for dashboard)
 *
 * @param supabaseClient - Supabase client instance
 * @param userId - User ID
 * @param projectId - Optional project ID filter
 * @returns Statistics object
 */
export async function getDifficultyStatistics(
  supabaseClient: any,
  userId: string,
  projectId?: string
): Promise<{
  total: number;
  resolved: number;
  unresolved: number;
  autoResolved: number;
  averageStreak: number;
}> {
  try {
    let query = supabaseClient
      .from('difficulties')
      .select('*')
      .eq('user_id', userId);

    if (projectId) {
      query = query.eq('project_id', projectId);
    }

    const { data, error } = await query;

    if (error) {
      console.error(`❌ [Difficulty] Error fetching statistics:`, error);
      return {
        total: 0,
        resolved: 0,
        unresolved: 0,
        autoResolved: 0,
        averageStreak: 0
      };
    }

    const difficulties = data || [];
    const resolved = difficulties.filter((d: any) => d.resolvido);
    const autoResolved = difficulties.filter((d: any) => d.auto_resolved_at !== null);
    const totalStreak = difficulties.reduce((sum: number, d: any) => sum + (d.consecutive_correct || 0), 0);

    return {
      total: difficulties.length,
      resolved: resolved.length,
      unresolved: difficulties.length - resolved.length,
      autoResolved: autoResolved.length,
      averageStreak: difficulties.length > 0 ? totalStreak / difficulties.length : 0
    };
  } catch (error) {
    console.error(`❌ [Difficulty] Exception fetching statistics:`, error);
    return {
      total: 0,
      resolved: 0,
      unresolved: 0,
      autoResolved: 0,
      averageStreak: 0
    };
  }
}
