import { useEffect, useRef, useState } from 'react';
import mermaid from 'mermaid';
import { Button } from './ui/button';
import { ZoomIn, ZoomOut, Maximize2, Download } from 'lucide-react';
import { toast } from 'sonner';

/**
 * Sanitizes Mermaid code to prevent parsing errors from special characters
 * Wraps text containing (), :, [], etc. in quotes if not already quoted
 */
function sanitizeMermaidCode(code: string): string {
  // Convert literal \n to actual newlines if needed
  let normalizedCode = code.replace(/\\n/g, '\n');

  // Remove stray quotes that appear after valid shapes like ))" or ]"
  // This fixes cases where AI adds quotes incorrectly
  normalizedCode = normalizedCode.replace(/(\)\)|\]|\})\s*"/g, '$1\n');

  // Remove isolated quotes at the start of words (like " Anti-inflamató)
  normalizedCode = normalizedCode.replace(/\s+"\s+/g, '\n  ');

  const lines = normalizedCode.split('\n');
  const processedLines = lines.map(line => {
    // Match line with optional indentation and content
    const match = line.match(/^(\s*)(.+)$/);
    if (!match) return line;

    const [_, indent, text] = match;
    const trimmedText = text.trim();

    // Skip empty lines
    if (!trimmedText) return line;

    // Don't modify structural keywords
    if (trimmedText === 'mindmap' || trimmedText.startsWith('graph ')) {
      return line;
    }

    // Remove any trailing/leading stray quotes
    let cleanedText = trimmedText.replace(/^"\s*/, '').replace(/\s*"$/, '');

    // Already properly quoted - leave as is
    if (trimmedText.startsWith('"') && trimmedText.endsWith('"') && trimmedText.length > 2) {
      return line;
    }

    // Valid Mermaid shapes that should not be quoted
    // ((text)), [text], {text}, (text), [[text]], etc.
    const isValidShape = /^[\(\[\{][\(\[\{]?.+[\)\]\}][\)\]\}]?$/.test(cleanedText);
    if (isValidShape) {
      return `${indent}${cleanedText}`;
    }

    // Arrow syntax - don't quote
    if (cleanedText.includes('-->') || cleanedText.includes('---')) {
      return `${indent}${cleanedText}`;
    }

    // Check if text contains problematic characters
    const hasProblematicChars = /[():\[\]]/.test(cleanedText);

    if (hasProblematicChars) {
      // Escape internal quotes by replacing " with '
      const escapedText = cleanedText.replace(/"/g, "'");
      return `${indent}"${escapedText}"`;
    }

    return `${indent}${cleanedText}`;
  });

  return processedLines.join('\n');
}

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
        // Clear previous diagram
        if (containerRef.current) {
          containerRef.current.innerHTML = '';
        }

        // Generate unique ID for this diagram
        const id = `mermaid-${Date.now()}`;

        // Sanitize mermaid code to prevent parsing errors from special characters
        const sanitizedContent = sanitizeMermaidCode(content);

        // Render the diagram
        const { svg } = await mermaid.render(id, sanitizedContent);

        // Insert the rendered SVG
        if (containerRef.current) {
          containerRef.current.innerHTML = svg;

          // Add responsive scaling
          const svgElement = containerRef.current.querySelector('svg');
          if (svgElement) {
            svgElement.style.maxWidth = '100%';
            svgElement.style.height = 'auto';
          }
        }
      } catch (error: any) {
        console.error('Mermaid rendering error:', error);
        setRenderError(error.message || 'Erro ao renderizar o mapa mental');
        toast.error('Erro ao renderizar o diagrama');
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
