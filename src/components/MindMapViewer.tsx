import { useEffect, useRef, useState } from 'react';
import mermaid from 'mermaid';
import { Button } from './ui/button';
import { ZoomIn, ZoomOut, Maximize2, Download } from 'lucide-react';
import { toast } from 'sonner';

interface MindMapViewerProps {
  content: string;
  title?: string;
}

export function MindMapViewer({ content, title }: MindMapViewerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [isRendering, setIsRendering] = useState(false);
  const [renderError, setRenderError] = useState<string | null>(null);

  useEffect(() => {
    mermaid.initialize({
      startOnLoad: false,
      theme: 'default',
      securityLevel: 'loose',
      fontFamily: 'ui-sans-serif, system-ui, sans-serif',
      flowchart: {
        useMaxWidth: true,
        htmlLabels: true,
      },
      mindmap: {
        useMaxWidth: true,
        padding: 10,
      },
    });
  }, []);

  const normalizeContent = (raw: string): string => {
    if (!raw) return '';

    // 1. Converte \n escapado para quebra real
    let text = raw.replace(/\\n/g, '\n');
    
    // 2. Normaliza quebras de linha
    text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    
    // 3. Divide em linhas e remove vazias
    let lines = text.split('\n')
      .map(line => line.trimEnd())
      .filter(line => line.trim() !== '');
    
    // 4. Se não há linhas válidas, retorna vazio
    if (lines.length === 0) return '';
    
    // 5. Detecta todos os níveis únicos de indentação no documento
    const indentLevels = new Set<number>();
    lines.forEach(line => {
      const spaces = line.length - line.trimStart().length;
      indentLevels.add(spaces);
    });
    
    // 6. Cria mapeamento de indentação: ordena e mapeia para múltiplos de 2
    const sortedLevels = Array.from(indentLevels).sort((a, b) => a - b);
    const indentMap = new Map<number, number>();
    sortedLevels.forEach((level, index) => {
      // Mapeia cada nível único para múltiplos de 2: 0, 2, 4, 6, 8...
      indentMap.set(level, index * 2);
    });
    
    // Log para debug da normalização
    console.log('[MindMap] Níveis de indentação detectados:', Array.from(indentLevels).sort((a, b) => a - b));
    console.log('[MindMap] Mapeamento de indentação:', Array.from(indentMap.entries()));
    
    // 7. Reconstrói as linhas com indentação normalizada
    const normalizedLines = lines.map((line, index) => {
      const originalSpaces = line.length - line.trimStart().length;
      const content = line.trimStart();
      const newSpaces = indentMap.get(originalSpaces) || 0;
      
      // Remove aspas duplas externas se existirem (limpeza)
      let cleanContent = content;
      if (content.startsWith('"') && content.endsWith('"') && content.length > 1) {
        cleanContent = content.slice(1, -1);
        // Remove aspas duplas escapadas que possam ter ficado
        cleanContent = cleanContent.replace(/\\"/g, '"');
      }
      
      // Caso especial: primeira linha deve ser "mindmap" sem aspas
      if (index === 0 && (cleanContent.toLowerCase() === 'mindmap' || content.toLowerCase() === 'mindmap')) {
        return 'mindmap';
      }
      
      // Caso especial: se a primeira linha não é "mindmap", adicionar
      if (index === 0 && cleanContent.toLowerCase() !== 'mindmap') {
        // Insere mindmap como primeira linha e reprocessa a linha atual
        normalizedLines.unshift('mindmap');
        // Esta linha agora será o título principal com 2 espaços
        return '  ' + `"${cleanContent}"`;
      }
      
      // Todas as outras linhas: indentação + conteúdo entre aspas
      return ' '.repeat(newSpaces) + `"${cleanContent}"`;
    });
    
    // 8. Garante que a primeira linha seja "mindmap"
    if (normalizedLines.length > 0) {
      const firstLine = normalizedLines[0].trim().toLowerCase();
      if (firstLine !== 'mindmap') {
        // Se não começa com mindmap, adiciona
        normalizedLines.unshift('mindmap');
        // E ajusta a indentação da antiga primeira linha
        if (normalizedLines[1] && !normalizedLines[1].startsWith('  ')) {
          normalizedLines[1] = '  ' + normalizedLines[1].trim();
        }
      }
    }
    
    // 9. Validação final: verifica se há saltos de indentação inconsistentes
    const finalResult = normalizedLines.join('\n');
    const resultLines = finalResult.split('\n');
    
    // Verifica consistência de indentação
    let lastIndent = -2; // Começa com -2 porque mindmap tem 0 e o próximo deve ter 2
    for (let i = 0; i < resultLines.length; i++) {
      const line = resultLines[i];
      if (line.trim() === 'mindmap') {
        lastIndent = -2;
        continue;
      }
      
      const currentIndent = line.length - line.trimStart().length;
      const indentDiff = currentIndent - lastIndent;
      
      // A indentação pode aumentar em 2 (filho) ou diminuir para qualquer nível anterior
      if (indentDiff > 4) {
        console.warn(`[MindMap] Aviso: Salto de indentação muito grande na linha ${i + 1}: de ${lastIndent} para ${currentIndent} espaços`);
      }
      
      lastIndent = currentIndent;
    }
    
    console.log('[MindMap] Conteúdo normalizado - Total de linhas:', resultLines.length);
    console.log('[MindMap] Primeiras 10 linhas normalizadas:');
    resultLines.slice(0, 10).forEach((line, i) => {
      const spaces = line.length - line.trimStart().length;
      console.log(`  Linha ${i}: [${spaces} espaços] ${JSON.stringify(line)}`);
    });
    
    return finalResult;
  };

  useEffect(() => {
    if (!content || !containerRef.current) return;

    const renderDiagram = async () => {
      setIsRendering(true);
      setRenderError(null);

      try {
        const container = containerRef.current;
        if (!container) return;
        
        container.innerHTML = '';

        // Normaliza o conteúdo antes de enviar ao Mermaid
        const finalContent = normalizeContent(content);
        
        // Se não há conteúdo válido após normalização
        if (!finalContent || finalContent.trim() === 'mindmap') {
          setRenderError('Conteúdo vazio ou inválido para renderização');
          return;
        }
        
        console.log('[MindMap] Enviando ao Mermaid para renderização...');

        const id = `mermaid-${Date.now()}`;
        
        try {
          const { svg } = await mermaid.render(id, finalContent);

          if (containerRef.current) {
            containerRef.current.innerHTML = svg;
            const svgElement = containerRef.current.querySelector('svg');

            if (svgElement) {
              svgElement.style.maxWidth = '100%';
              svgElement.style.height = 'auto';
              svgElement.style.backgroundColor = 'white';
              svgElement.style.transformOrigin = 'top left';
              svgElement.style.transform = `scale(${zoom})`;
              
              console.log('[MindMap] ✅ Renderização bem-sucedida');
            }
          }
        } catch (mermaidError: any) {
          console.error('[MindMap] Erro do Mermaid:', mermaidError);
          
          // Tenta identificar o problema específico
          const errorMessage = mermaidError.message || '';
          
          if (errorMessage.includes('Expecting') || errorMessage.includes('Parse error')) {
            setRenderError(`Erro de sintaxe no diagrama. Verifique a indentação e as aspas. Detalhes: ${errorMessage}`);
          } else {
            setRenderError(`Erro ao renderizar o mapa mental: ${errorMessage}`);
          }
          
          // Log do conteúdo que causou erro para debug
          console.error('[MindMap] Conteúdo que causou erro:', finalContent.substring(0, 500));
        }
      } catch (error: any) {
        console.error('[MindMap] Erro geral:', error);
        setRenderError(`Erro inesperado: ${error.message || 'Erro desconhecido'}`);
      } finally {
        setIsRendering(false);
      }
    };

    renderDiagram();
  }, [content, zoom]);

  const handleZoomIn = () => setZoom((prev) => Math.min(prev + 0.2, 3));
  const handleZoomOut = () => setZoom((prev) => Math.max(prev - 0.2, 0.5));
  const handleResetZoom = () => setZoom(1);

  const handleDownload = () => {
    if (!containerRef.current) return;
    const svgElement = containerRef.current.querySelector('svg');
    if (!svgElement) {
      toast.error('Nenhum diagrama para baixar');
      return;
    }

    try {
      const svgData = new XMLSerializer().serializeToString(svgElement);
      const blob = new Blob([svgData], {
        type: 'image/svg+xml;charset=utf-8',
      });
      const url = URL.createObjectURL(blob);

      const link = document.createElement('a');
      link.href = url;
      link.download = `${title || 'mapa-mental'}.svg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success('Mapa mental baixado com sucesso!');
    } catch (error) {
      console.error('[MindMap] Erro ao baixar:', error);
      toast.error('Erro ao baixar o mapa mental');
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={handleZoomOut}
            aria-label="Diminuir zoom"
            disabled={zoom <= 0.5}
          >
            <ZoomOut className="h-4 w-4" />
          </Button>
          <span className="text-sm tabular-nums font-medium">
            {Math.round(zoom * 100)}%
          </span>
          <Button
            variant="outline"
            size="icon"
            onClick={handleZoomIn}
            aria-label="Aumentar zoom"
            disabled={zoom >= 3}
          >
            <ZoomIn className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={handleResetZoom}
            aria-label="Resetar zoom"
            disabled={zoom === 1}
          >
            <Maximize2 className="h-4 w-4" />
          </Button>
        </div>

        <Button 
          variant="outline" 
          size="sm" 
          onClick={handleDownload}
          disabled={renderError !== null || isRendering}
        >
          <Download className="h-4 w-4 mr-1" />
          Baixar SVG
        </Button>
      </div>

      <div className="relative min-h-[400px] rounded-lg border bg-white p-4 overflow-auto">
        {isRendering && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/80 backdrop-blur-sm">
            <div className="text-center">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary mb-2" />
              <p className="text-sm text-muted-foreground">Renderizando mapa mental...</p>
            </div>
          </div>
        )}

        {renderError && (
          <div className="space-y-3">
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="font-semibold text-red-900 mb-2">Erro ao renderizar mapa mental</p>
              <p className="text-sm text-red-700 mb-3">{renderError}</p>
              <details className="text-xs text-red-600">
                <summary className="cursor-pointer font-medium hover:text-red-800">
                  Ver detalhes técnicos
                </summary>
                <div className="mt-2 p-2 bg-red-100 rounded font-mono overflow-x-auto">
                  <p>Verifique o console do navegador para mais informações.</p>
                  <p>O erro geralmente indica problemas de indentação ou sintaxe.</p>
                </div>
              </details>
            </div>
            <div className="text-sm text-muted-foreground">
              <p>💡 Dica: Tente gerar o mapa mental novamente. Se o erro persistir, entre em contato com o suporte.</p>
            </div>
          </div>
        )}

        {!renderError && !isRendering && (
          <div
            ref={containerRef}
            className="mermaid w-full"
            style={{
              transformOrigin: 'top left',
              transform: `scale(${zoom})`,
              transition: 'transform 0.2s ease-in-out',
            }}
          />
        )}
      </div>
    </div>
  );
}
