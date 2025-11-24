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
  const containerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [isRendering, setIsRendering] = useState(false);
  const [renderError, setRenderError] = useState<string | null>(null);

  // Initialize mermaid
  useEffect(() => {
    mermaid.initialize({
      startOnLoad: false,
      theme: 'base',
      securityLevel: 'loose',
      fontFamily: 'ui-sans-serif, system-ui, sans-serif',
      flowchart: {
        useMaxWidth: true,
        htmlLabels: true,
        curve: 'basis', // Linhas curvas mais bonitas
        rankSpacing: 50,
        nodeSpacing: 20,
      },
    });
  }, []);

  // Conversor Inteligente: Texto Indentado -> Graph LR
  const convertToGraph = (text: string) => {
    const lines = text.replace(/\\n/g, '\n').split('\n');
    const nodes: { id: string; label: string; level: number }[] = [];
    const edges: string[] = [];
    const stack: { id: string; level: number }[] = [];
    
    let nodeIdCounter = 0;

    lines.forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed === 'mindmap') return;

      // Detecta nível de indentação (2 espaços = 1 nível)
      const indentMatch = line.match(/^(\s*)/);
      const spaces = indentMatch ? indentMatch[1].length : 0;
      const level = Math.floor(spaces / 2);

      // Limpa o texto de caracteres do mermaid antigo
      let cleanLabel = trimmed
        .replace(/^[\w\d_]+\s*[\(\[\{]+/, '') // Remove IDs antigos
        .replace(/^[\(\[\{]+/, '')            // Remove formas (( ))
        .replace(/[\)\]\}]+$/, '')            // Remove fechamento
        .replace(/^"|"$/g, '')                // Remove aspas externas
        .replace(/"/g, "'");                  // Escapa aspas internas

      const nodeId = `n${nodeIdCounter++}`;
      
      // Adiciona nó
      nodes.push({ id: nodeId, label: cleanLabel, level });

      // Lógica de Conexão (Pilha)
      // Remove da pilha nós que são mais profundos ou do mesmo nível (irmãos anteriores)
      while (stack.length > 0 && stack[stack.length - 1].level >= level) {
        stack.pop();
      }

      // Se sobrou alguém na pilha, é o pai
      if (stack.length > 0) {
        const parent = stack[stack.length - 1];
        edges.push(`${parent.id} --> ${nodeId}`);
      }

      // Adiciona atual na pilha para ser pai dos próximos
      stack.push({ id: nodeId, level });
    });

    // Monta o diagrama final
    // graph LR = Left to Right (melhor para mapas mentais)
    // style = deixa visual mais limpo
    let diagram = 'graph LR\n';
    
    // Define estilos globais
    diagram += '  classDef default fill:#f9fafb,stroke:#0891b2,stroke-width:1px,color:#1f2937,rx:5,ry:5;\n';
    diagram += '  classDef root fill:#0891b2,stroke:#0e7490,stroke-width:2px,color:white,font-weight:bold,font-size:16px;\n';

    // Adiciona nós
    nodes.forEach((node, index) => {
      // Nó raiz ganha destaque
      const className = index === 0 ? ':::root' : ''; 
      diagram += `  ${node.id}["${node.label}"]${className}\n`;
    });

    // Adiciona conexões
    edges.forEach(edge => {
      diagram += `  ${edge}\n`;
    });

    return diagram;
  };

  useEffect(() => {
    if (!content || !containerRef.current) return;

    const renderDiagram = async () => {
      setIsRendering(true);
      setRenderError(null);

      try {
        if (containerRef.current) {
          containerRef.current.innerHTML = '';
        }

        // 1. Converte a estrutura
        const graphDefinition = convertToGraph(content);
        console.log('Graph Diagram:', graphDefinition); // Debug

        // 2. Renderiza
        const id = `mermaid-${Date.now()}`;
        const { svg } = await mermaid.render(id, graphDefinition);

        if (containerRef.current) {
          containerRef.current.innerHTML = svg;
          
          const svgElement = containerRef.current.querySelector('svg');
          if (svgElement) {
            svgElement.style.maxWidth = '100%';
            svgElement.style.height = 'auto';
            // Garante visibilidade do texto
            svgElement.style.backgroundColor = 'white'; 
          }
        }
      } catch (error: any) {
        console.error('Mermaid rendering error:', error);
        setRenderError('Não foi possível visualizar o diagrama.');
      } finally {
        setIsRendering(false);
      }
    };

    renderDiagram();
  }, [content]);

  // ... (Mantenha as funções de zoom e o return do componente iguais ao original)
  const handleZoomIn = () => setZoom((prev) => Math.min(prev + 0.2, 3));
  const handleZoomOut = () => setZoom((prev) => Math.max(prev - 0.2, 0.5));
  const handleResetZoom = () => setZoom(1);
  const handleDownload = () => {
    if (!containerRef.current) return;
    const svgElement = containerRef.current.querySelector('svg');
    if (!svgElement) return;
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
      toast.success('Mapa baixado com sucesso!');
    } catch (error) {
      console.error('Download error:', error);
      toast.error('Erro ao baixar');
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between p-4 border-b bg-white">
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={handleZoomOut} disabled={zoom <= 0.5} className="rounded-lg"><ZoomOut className="w-4 h-4" /></Button>
          <span className="text-sm font-medium text-gray-700 min-w-[60px] text-center">{Math.round(zoom * 100)}%</span>
          <Button size="sm" variant="outline" onClick={handleZoomIn} disabled={zoom >= 3} className="rounded-lg"><ZoomIn className="w-4 h-4" /></Button>
          <Button size="sm" variant="outline" onClick={handleResetZoom} className="rounded-lg"><Maximize2 className="w-4 h-4" /></Button>
        </div>
        <Button size="sm" onClick={handleDownload} className="rounded-lg bg-[#0891B2] hover:bg-[#0891B2]/90"><Download className="w-4 h-4 mr-2" />Baixar SVG</Button>
      </div>
      <div className="flex-1 overflow-auto p-6 bg-gray-50">
        {isRendering && (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-8 h-8 animate-spin text-[#0891B2]" />
          </div>
        )}
        {renderError && (
          <div className="flex items-center justify-center h-full text-red-500">{renderError}</div>
        )}
        <div className="flex items-center justify-center min-h-full" style={{ transform: `scale(${zoom})`, transformOrigin: 'center center', transition: 'transform 0.2s ease-out' }}>
          <div ref={containerRef} className="mermaid-container bg-white rounded-xl shadow-sm p-8" style={{ minWidth: '300px' }} />
        </div>
      </div>
    </div>
  );
}

// Import necessário para o Loader se não tiver importado
import { Loader2 } from 'lucide-react';
