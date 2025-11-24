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
      maxTextSize: 50000,
    });
  }, []);

  const normalizeContent = (raw: string): string => {
    if (!raw) return '';

    // 1. Normaliza quebras de linha
    let text = raw.replace(/\\n/g, '\n').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    
    const lines = text.split('\n');
    const result: string[] = [];
    
    let previousIndent = -1;
    
    for (let i = 0; i < lines.length; i++) {
      let line = lines[i];
      
      // Remove espaços no final
      line = line.trimEnd();
      
      // Pula linhas vazias
      if (line.trim() === '') continue;
      
      // Captura indentação e conteúdo
      const leadingSpaces = line.match(/^(\s*)/)?.[1] || '';
      const indent = leadingSpaces.length;
      let content = line.trimStart();
      
      // Remove aspas externas se existirem (caso de aspas duplicadas)
      if (content.startsWith('"') && content.endsWith('"') && content.length > 1) {
        content = content.slice(1, -1);
      }
      
      // Limita comprimento de texto muito longo (workaround para bug do Mermaid)
      if (content.length > 80) {
        content = content.substring(0, 77) + '...';
      }
      
      // Reconstrói linha
      if (content.toLowerCase() === 'mindmap') {
        result.push('mindmap');
        previousIndent = 0;
      } else {
        // Adiciona quebra extra entre nós irmãos em níveis profundos (>= 8 espaços)
        // Isso resolve o bug de parse do Mermaid com nós consecutivos
        if (indent === previousIndent && indent >= 8 && result.length > 0) {
          // Não adiciona linha vazia, mas garante formatação limpa
        }
        
        result.push(`${leadingSpaces}"${content}"`);
        previousIndent = indent;
      }
    }
    
    return result.join('\n');
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
        
        console.log('=== MindMap Debug ===');
        console.log('Total de linhas:', finalContent.split('\n').length);
        
        // Log detalhado das linhas 7-12 (região problemática)
        const lines = finalContent.split('\n');
        lines.slice(7, 12).forEach((line, idx) => {
          const actualLine = idx + 7;
          const spaces = line.length - line.trimStart().length;
          console.log(`Linha ${actualLine}: [${spaces} espaços] ${line}`);
        });

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
            }
          }
        } catch (renderErr: any) {
          // Se falhar, tenta versão simplificada (apenas primeiros 50 nós)
          console.warn('Tentando renderizar versão simplificada...');
          const simplifiedLines = lines.slice(0, 50);
          const simplifiedContent = simplifiedLines.join('\n');
          
          const { svg } = await mermaid.render(id + '-simple', simplifiedContent);
          
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
          
          toast.warning('Mapa mental muito grande. Mostrando versão simplificada.');
        }
        
      } catch (error: any) {
        console.error('Mermaid rendering error:', error);
        setRenderError(error.message || 'Erro ao renderizar o diagrama');
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
      const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);

      const link = document.createElement('a');
      link.href = url;
      link.download = `${title || 'mapa-mental'}.svg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success('Mapa mental baixado!');
    } catch (error) {
      console.error('Download error:', error);
      toast.error('Erro ao baixar');
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={handleZoomOut}>
            <ZoomOut className="h-4 w-4" />
          </Button>
          <span className="text-sm tabular-nums">{Math.round(zoom * 100)}%</span>
          <Button variant="outline" size="icon" onClick={handleZoomIn}>
            <ZoomIn className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={handleResetZoom}>
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
          <div className="absolute inset-0 flex items-center justify-center">
            Renderizando...
          </div>
        )}
        {renderError && (
          <div className="text-sm text-red-500 p-4">
            <p className="font-semibold mb-2">Erro ao renderizar:</p>
            <p className="font-mono text-xs bg-red-50 p-2 rounded">{renderError}</p>
          </div>
        )}
        {!renderError && <div ref={containerRef} className="mermaid" />}
      </div>
    </div>
  );
}
