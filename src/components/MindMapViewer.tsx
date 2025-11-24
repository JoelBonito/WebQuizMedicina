import { useEffect, useRef, useState } from 'react';
import mermaid from 'mermaid';
import { Button } from './ui/button';
import { ZoomIn, ZoomOut, Maximize2, Download } from 'lucide-react';
import { toast } from 'sonner';

interface MindMapViewerProps {
  content: string; // Mermaid diagram code
  title?: string;
}

export function MindMapViewer({ content, title }: MindMapViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [isRendering, setIsRendering] = useState(false);
  const [renderError, setRenderError] = useState<string | null>(null);

  // Initialize mermaid
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

 // Render mermaid diagram when content changes
  useEffect(() => {
    if (!content || !containerRef.current) return;

    const renderDiagram = async () => {
      setIsRendering(true);
      setRenderError(null);

      try {
        if (containerRef.current) {
          containerRef.current.innerHTML = '';
        }

        // --- SANITIZER COM IDs EXPLÍCITOS (SOLUÇÃO FINAL) ---
        // 1. Normaliza quebras de linha
        let rawLines = content.replace(/\\n/g, '\n').split('\n');

        const processedLines = rawLines.map((line, index) => {
          const trimmed = line.trim();
          
          // Mantém cabeçalho 'mindmap' puro
          if (trimmed === 'mindmap') return 'mindmap';
          if (!trimmed) return ''; // Remove linhas vazias

          // Preserva a indentação original
          const indentMatch = line.match(/^(\s*)/);
          const indent = indentMatch ? indentMatch[1] : '';

          // LIMPEZA DO TEXTO:
          let cleanText = trimmed
            // Remove IDs ou definições de forma antigas que a IA possa ter mandado
            .replace(/^[\w\d_]+\s*[\(\[\{]+/, '') 
            .replace(/^[\(\[\{]+/, '')            
            .replace(/[\)\]\}]+$/, '')
            // Remove aspas externas que a IA possa ter colocado
            .replace(/^"|"$/g, '')
            // IMPORTANTE: Troca aspas duplas internas por simples para não quebrar a string do Mermaid
            .replace(/"/g, "'");

          // GERAÇÃO DE NÓ ROBUSTO:
          // Cria um ID único (n + index) e força o formato de nó quadrado ["Texto"]
          // Isso protege qualquer caractere especial dentro do texto (ex: parenteses, dois pontos)
          return `${indent}n${index}["${cleanText}"]`;
        });

        // Filtra linhas vazias e garante cabeçalho
        const finalLines = processedLines.filter(l => l !== '');
        if (finalLines.length > 0 && !finalLines[0].includes('mindmap')) {
            finalLines.unshift('mindmap');
        }

        const finalContent = finalLines.join('\n');
        console.log('MindMap Final:', finalContent); // Debug
        // --------------------------------------

        const id = `mermaid-${Date.now()}`;
        const { svg } = await mermaid.render(id, finalContent);

        if (containerRef.current) {
          containerRef.current.innerHTML = svg;
          
          const svgElement = containerRef.current.querySelector('svg');
          if (svgElement) {
            svgElement.style.maxWidth = '100%';
            svgElement.style.height = 'auto';
            svgElement.style.backgroundColor = 'white';
          }
        }
      } catch (error: any) {
        console.error('Mermaid rendering error:', error);
        // Se falhar, mostra mensagem amigável
        setRenderError('Não foi possível visualizar o diagrama complexo, mas o conteúdo foi salvo.');
      } finally {
        setIsRendering(false);
      }
    };

    renderDiagram();
  }, [content]);

  const handleZoomIn = () => {
    setZoom((prev) => Math.min(prev + 0.2, 3));
  };

  const handleZoomOut = () => {
    setZoom((prev) => Math.max(prev - 0.2, 0.5));
  };

  const handleResetZoom = () => {
    setZoom(1);
  };

  const handleDownload = () => {
    if (!containerRef.current) return;

    const svgElement = containerRef.current.querySelector('svg');
    if (!svgElement) {
      toast.error('Nenhum diagrama para baixar');
      return;
    }

    try {
      // Create a blob from the SVG
      const svgData = new XMLSerializer().serializeToString(svgElement);
      const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);

      // Create download link
      const link = document.createElement('a');
      link.href = url;
      link.download = `${title || 'mapa-mental'}.svg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // Clean up
      URL.revokeObjectURL(url);

      toast.success('Mapa mental baixado com sucesso!');
    } catch (error) {
      console.error('Download error:', error);
      toast.error('Erro ao baixar o mapa mental');
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Controls */}
      <div className="flex items-center justify-between p-4 border-b bg-white">
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={handleZoomOut}
            disabled={zoom <= 0.5}
            className="rounded-lg"
          >
            <ZoomOut className="w-4 h-4" />
          </Button>
          <span className="text-sm font-medium text-gray-700 min-w-[60px] text-center">
            {Math.round(zoom * 100)}%
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={handleZoomIn}
            disabled={zoom >= 3}
            className="rounded-lg"
          >
            <ZoomIn className="w-4 h-4" />
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handleResetZoom}
            className="rounded-lg"
          >
            <Maximize2 className="w-4 h-4" />
          </Button>
        </div>

        <Button
          size="sm"
          onClick={handleDownload}
          className="rounded-lg bg-[#0891B2] hover:bg-[#0891B2]/90"
        >
          <Download className="w-4 h-4 mr-2" />
          Baixar SVG
        </Button>
      </div>

      {/* Diagram Container */}
      <div className="flex-1 overflow-auto p-6 bg-gray-50">
        {isRendering && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#0891B2] mx-auto mb-4"></div>
              <p className="text-gray-600">Renderizando mapa mental...</p>
            </div>
          </div>
        )}

        {renderError && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center max-w-md">
              <div className="bg-red-50 border border-red-200 rounded-lg p-6">
                <h3 className="text-red-800 font-semibold mb-2">Erro ao renderizar</h3>
                <p className="text-red-600 text-sm">{renderError}</p>
              </div>
            </div>
          </div>
        )}

        {!isRendering && !renderError && (
          <div
            className="flex items-center justify-center min-h-full"
            style={{
              transform: `scale(${zoom})`,
              transformOrigin: 'center center',
              transition: 'transform 0.2s ease-out',
            }}
          >
            <div
              ref={containerRef}
              className="mermaid-container bg-white rounded-xl shadow-sm p-8"
              style={{ minWidth: '300px' }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
