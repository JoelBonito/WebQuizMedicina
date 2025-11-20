import { useState, useEffect } from 'react';

/**
 * Hook para detectar queries de mídia CSS
 * @param query - Media query CSS (ex: "(max-width: 1024px)")
 * @returns boolean indicando se a query está ativa
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState<boolean>(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia(query);

    // Define o valor inicial
    setMatches(mediaQuery.matches);

    // Handler para mudanças
    const handler = (event: MediaQueryListEvent) => {
      setMatches(event.matches);
    };

    // Adiciona listener
    mediaQuery.addEventListener('change', handler);

    // Cleanup
    return () => {
      mediaQuery.removeEventListener('change', handler);
    };
  }, [query]);

  return matches;
}

/**
 * Hook específico para detectar dispositivos mobile/tablet
 * Considera mobile: largura <= 1024px (iPad e menores)
 */
export function useIsMobile(): boolean {
  return useMediaQuery('(max-width: 1024px)');
}
