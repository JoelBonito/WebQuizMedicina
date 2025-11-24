import { useEffect, useRef, useState } from 'react';
import mermaid from 'mermaid';
import { Button } from './ui/button';
import { ZoomIn, ZoomOut, Maximize2, Download } from 'lucide-react';
import { toast } from 'sonner';

interface MindMapViewerProps {
  content: string; // Mermaid mindmap code
  title?: string;
}

export function MindMapViewer({ content, title }: MindMapViewerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [isRendering, setIsRendering] = useState(false);
  const [renderError, setRenderError] = useState<string | null>(null);

  // Inicializa o mermaid uma única vez
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
      },
    });
  }, []);

  // Função bem leve para normalizar apenas quebras de linha/caracteres básicos
  const normalizeContent = (raw: string): string => {
    if (!raw) return '';

    // Se veio com "\n" escapado de JSON, converte para quebras de linha reais
    let text = raw.replace(/\\n/g, '\n');

    // Normaliza \r\n / \r
    text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    const lines = text
      .split('\n')
      .map((line) => line.replace(/\s+$/g, '')) // tira espaços no fim
      .filter((line, idx, arr) => {
        // remove linhas totalmente vazias extras no topo e no fim
        if (line.trim() !== '') return true;
        if (idx === 0) return false;
        if (idx === arr.length - 1) return false;
        return true;
      });

    // Garante que começa com "mindmap"
    if (lines.length > 0 && !lines[0].trim().startsWith('mindmap')) {
      lines.unshift('mindmap');
    }

    return lines.join('\n');
  };

  // Renderiza o diagrama sempre que o content mudar
  useEffect(() => {
    if (!content || !containerRef.current) return;

    const renderDiagram = async () => {
      setIsRendering(true);
      setRenderError(null);

      try {
        const container = containerRef.current;
        container.innerHTML = '';

        const finalContent = normalizeContent(content);
        console.log('MindMap final enviado ao mermaid:\n', finalContent);

        const id = `mermaid-${Date.now()}`;
        const { svg } = await mermaid.render(id, finalContent);

        if (containerRef.current) {
          containerRef.current.innerHTML = svg;
          const svgElement = containerRef.current.querySelector('svg') as
            | SVGSVGElement
            | null;

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
        setRenderError(
          'Erro ao visualizar o mapa mental. Tente gerar novamente ou revisar o conteúdo.'
        );
      } finally {
        setIsRendering(false);
      }
    };

    renderDiagram();
    // importante: também reagir ao zoom para re-aplicar o scale no SVG
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
      {/* Controles */}
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

      {/* Container do diagrama */}
      <div className="relative min-h-[200px] rounded-lg border bg-white p-3 overflow-auto">
        {isRendering && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
            Renderizando mapa mental...
          </div>
        )}

        {renderError && (
          <div className="text-sm text-red-500">
            <p>Erro ao renderizar o mapa mental.</p>
            <p className="mt-1">{renderError}</p>
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
