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

  // Normalização mais robusta
  const normalizeContent = (raw: string): string => {
    if (!raw) return '';

    // 1. Converte \n escapado para quebra real
    let text = raw.replace(/\\n/g, '\n');
    
    // 2. Normaliza todos os tipos de quebra de linha para \n
    text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    
    // 3. Remove espaços/tabs no FINAL de cada linha (crucial para Mermaid)
    const lines = text.split('\n').map(line => line.trimEnd());
    
    // 4. Remove linhas completamente vazias no início e fim
    while (lines.length > 0 && lines[0].trim() === '') {
      lines.shift();
    }
    while (lines.length > 0 && lines[lines.length - 1].trim() === '') {
      lines.pop();
    }
    
    // 5. Garante que a primeira linha é "mindmap"
    if (lines.length > 0 && !lines[0].trim().toLowerCase().startsWith('mindmap')) {
      lines.unshift('mindmap');
    }
    
    // 6. Remove linhas vazias duplicadas no meio (deixa no máximo uma)
    const cleanedLines: string[] = [];
    let lastWasEmpty = false;
    
    for (const line of lines) {
      const isEmpty = line.trim() === '';
      if (isEmpty) {
        if (!lastWasEmpty) {
          cleanedLines.push('');
          lastWasEmpty = true;
        }
        // Ignora linhas vazias consecutivas
      } else {
        cleanedLines.push(line);
        lastWasEmpty = false;
      }
    }
    
    // 7. Remove qualquer linha vazia que sobrou
    const finalLines = cleanedLines.filter(line => line.trim() !== '');
    
    return finalLines.join('\n');
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

        const finalContent = normalizeContent(content);
        
        console.log('MindMap final enviado ao mermaid:\n', finalContent);
        console.log('Total de linhas:', finalContent.split('\n').length);
        
        // Log das primeiras 15 linhas com detalhe da indentação
        finalContent.split('\n').slice(0, 15).forEach((line, i) => {
          const spaces = line.length - line.trimStart().length;
          console.log(`Linha ${i}: [${spaces} espaços] "${line}"`);
        });

        const id = `mermaid-${Date.now()}`;
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
          }
        }
      } catch (error: any) {
        console.error('Mermaid rendering error:', error);
        setRenderError(error.message || 'Erro desconhecido ao renderizar');
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
      console.error('Download error:', error);
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
          >
            <ZoomOut className="h-4 w-4" />
          </Button>
          <span className="text-sm tabular-nums">
            {Math.round(zoom * 100)}%
          </span>
          <Button
            variant="outline"
            size="icon"
            onClick={handleZoomIn}
            aria-label="Aumentar zoom"
          >
            <ZoomIn className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={handleResetZoom}
            aria-label="Resetar zoom"
          >
            <Maximize2 className="h-4 w-4" />
          </Button>
        </div>

        <Button variant="outline" size="sm" onClick={handleDownload}>
          <Download className="h-4 w-4 mr-1" />
          Baixar SVG
        </Button>
      </div>

      <div className="relative min-h-[200px] rounded-lg border bg-white p-3 overflow-auto">
        {isRendering && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
            Renderizando mapa mental...
          </div>
        )}

        {renderError && (
          <div className="text-sm text-red-500 space-y-2">
            <p className="font-semibold">Erro ao renderizar o mapa mental:</p>
            <p className="font-mono text-xs bg-red-50 p-2 rounded">{renderError}</p>
            <p className="text-xs">Tente gerar novamente ou verifique o console para mais detalhes.</p>
          </div>
        )}

        {!renderError && (
          <div
            ref={containerRef}
            className="mermaid"
            style={{
              transformOrigin: 'top left',
              transform: `scale(${zoom})`,
            }}
          />
        )}
      </div>
    </div>
  );
}
