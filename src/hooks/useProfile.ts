/**
 * useProfile Hook
 * 
 * Este hook consome o ProfileContext para obter dados do perfil do usuário.
 * Anteriormente, cada chamada deste hook criava um listener separado do Firestore,
 * causando múltiplos re-renders e desperdício de recursos.
 * 
 * Agora, o ProfileContext centraliza um único listener para toda a aplicação.
 */

import { useProfileContext, Profile } from '../contexts/ProfileContext';

// Re-export Profile type for backward compatibility
export type { Profile };

// Main hook - now just a thin wrapper around ProfileContext
export function useProfile() {
  return useProfileContext();
}
