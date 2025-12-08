import { useEffect, useRef, useState } from 'react';
import { Transformer } from 'markmap-lib';
import { Markmap } from 'markmap-view';
import { Toolbar } from 'markmap-toolbar';
import 'markmap-toolbar/dist/style.css';
import { Loader2, Maximize2, Minimize2 } from 'lucide-react';

interface MindMapViewerProps {
  content: string;
  title?: string;
}

const transformer = new Transformer();

export function MindMapViewer({ content, title }: MindMapViewerProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [isRendering, setIsRendering] = useState(false);
  const [markmapInstance, setMarkmapInstance] = useState<Markmap | null>(null);
  const rootRef = useRef<any>(null);
  const [retryCount, setRetryCount] = useState(0);
  const maxRetries = 20; // ~2 seconds with requestAnimationFrame
  const animationFrameRef = useRef<number | null>(null);
  const isUnmountedRef = useRef(false);

  // Convert Mermaid-like indented text to Markdown list (Legacy Support)
  const convertMermaidToMarkdown = (text: string) => {
    const lines = text.split('\n');
    let markdown = '';

    // Find minimum indentation level (ignoring 'mindmap' line and empty lines)
    let minIndent = Infinity;
    lines.forEach(line => {
      const trimmed = line.trim();
      if (!trimmed || trimmed === 'mindmap') return;
      const indentMatch = line.match(/^(\s*)/);
      const spaces = indentMatch ? indentMatch[1].length : 0;
      if (spaces < minIndent) minIndent = spaces;
    });

    if (minIndent === Infinity) minIndent = 0;

    lines.forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed === 'mindmap') return;

      // Calculate indentation level
      const indentMatch = line.match(/^(\s*)/);
      const spaces = indentMatch ? indentMatch[1].length : 0;

      // Normalize indentation: subtract minIndent
      const normalizedSpaces = Math.max(0, spaces - minIndent);
      const indent = ' '.repeat(normalizedSpaces);

      // Clean the label: remove quotes, parentheses, etc.
      let cleanLabel = trimmed
        .replace(/^"|"$/g, '') // Remove surrounding quotes
        .replace(/\\"/g, '"'); // Unescape internal quotes

      markdown += `${indent}- ${cleanLabel}\n`;
    });

    return markdown;
  };

  const handleExpandAll = () => {
    if (!markmapInstance || !rootRef.current) return;
    // Ensure wrapper has valid dimensions before expanding
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const { width, height } = wrapper.getBoundingClientRect();
    if (width === 0 || height === 0) {
      console.warn('[MindMapViewer] Skip expandAll due to zero dimensions');
      return;
    }

    const expand = (node: any) => {
      if (node.payload) {
        node.payload = { ...node.payload, fold: 0 };
      }
      if (node.children) {
        node.children.forEach(expand);
      }
    };

    expand(rootRef.current);
    markmapInstance.setData(rootRef.current);
    markmapInstance.fit();
  };

  const handleCollapseAll = () => {
    if (!markmapInstance || !rootRef.current) return;
    // Ensure wrapper has valid dimensions before collapsing
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const { width, height } = wrapper.getBoundingClientRect();
    if (width === 0 || height === 0) {
      console.warn('[MindMapViewer] Skip collapseAll due to zero dimensions');
      return;
    }

    const collapse = (node: any) => {
      // Don't collapse root (depth 0)
      if (node.depth > 0 && node.payload) {
        node.payload = { ...node.payload, fold: 1 };
      }
      if (node.children) {
        node.children.forEach(collapse);
      }
    };

    collapse(rootRef.current);
    markmapInstance.setData(rootRef.current);
    markmapInstance.fit();
  };

  useEffect(() => {
    if (!content || !svgRef.current || !wrapperRef.current) return;

    let isCancelled = false;

    const renderMindMap = async () => {
      if (isCancelled || isUnmountedRef.current) return; // Add unmounted guard

      // Double check dimensions before proceeding
      if (!wrapperRef.current) return;
      const { width, height } = wrapperRef.current.getBoundingClientRect();

      if (width === 0 || height === 0) {
        // If still 0, wait for next frame (with retry limit)
        if (retryCount >= maxRetries) {
          console.warn('[MindMapViewer] Max retries reached in renderMindMap, using fallback dimensions');
          // fallback dimensions will be set later
        } else {
          setRetryCount(prev => prev + 1);
          animationFrameRef.current = requestAnimationFrame(renderMindMap); // Store ID for cancellation
          return;
        }
      } else {
        // Reset retry counter when dimensions are ok
        setRetryCount(0);
      }

      setIsRendering(true);

      try {
        // 1. Prepare Markdown Content
        let markdown = content;
        // Check if content is legacy mermaid-like syntax
        if (content.trim().startsWith('mindmap')) {
          markdown = convertMermaidToMarkdown(content);
        }

        // 2. Transform Markdown to Markmap Data
        const { root } = transformer.transform(markdown);

        // Helper to process nodes: add depth, collapse, and style
        const processNode = (node: any, depth = 0) => {
          node.depth = depth;

          // 1. Collapse by default
          // Set fold = 1 for all nodes that have children
          if (node.children && node.children.length > 0) {
            node.payload = { ...node.payload, fold: 1 };
          }

          // 2. Wrap content for styling (Pill/Tag look)
          // We wrap the content in a span with specific classes
          const colorClass = `depth-${Math.min(depth, 3)}`;
          // Ensure we don't double-wrap if re-rendering (though we recreate root each time)
          if (!node.content.startsWith('<span class="mm-pill')) {
            node.content = `<span class="mm-pill ${colorClass}">${node.content}</span>`;
          }

          if (node.children) {
            node.children.forEach((child: any) => processNode(child, depth + 1));
          }
          return node;
        };

        processNode(root);
        rootRef.current = root; // Store processed root

        // 3. Clear previous instance if exists
        if (markmapInstance) {
          markmapInstance.destroy();
          svgRef.current!.innerHTML = '';
        }

        // Custom color function based on depth (for lines)
        const colorFn = (node: any) => {
          const depth = node.depth || 0;
          if (depth === 0) return '#A78BFA'; // Purple (Root)
          if (depth === 1) return '#4B5563'; // Gray (Level 1)
          if (depth === 2) return '#34D399'; // Green (Level 2)
          return '#60A5FA'; // Blue (Deeper levels)
        };

        // 4. Create new Markmap instance with options
        // We use requestAnimationFrame to ensure the SVG is in the DOM and has dimensions
        animationFrameRef.current = requestAnimationFrame(() => { // Store ID for cancellation
          if (isCancelled || isUnmountedRef.current || !svgRef.current || !wrapperRef.current) return;

          // CRITICAL FIX: Explicitly set SVG dimensions to prevent SVGLength error
          const wrapper = wrapperRef.current;
          const rect = wrapper.getBoundingClientRect();

          // Ensure wrapper has valid dimensions
          if (rect.width === 0 || rect.height === 0) {
            console.warn('[MindMapViewer] Wrapper has zero dimensions, delaying render');
            // Retry on next frame if dimensions still not available
            animationFrameRef.current = requestAnimationFrame(() => renderMindMap()); // Store ID for cancellation
            return;
          }

          // Set explicit dimensions on SVG to prevent relative length issues
          svgRef.current.setAttribute('width', `${rect.width}px`);
          svgRef.current.setAttribute('height', `${rect.height}px`);

          try {
            const mm = Markmap.create(svgRef.current, {
              autoFit: true,
              fitRatio: 0.95,
              duration: 500,
              spacingVertical: 10, // Increased spacing
              spacingHorizontal: 120, // Increased spacing
              embedGlobalCSS: true,
              zoom: true,
              pan: true,
              scrollForPan: true,
              color: colorFn, // Apply custom coloring
            }, root);

            setMarkmapInstance(mm);

            // 5. Add Toolbar
            const existingToolbar = wrapperRef.current?.querySelector('.markmap-toolbar');
            if (existingToolbar) {
              existingToolbar.remove();
            }

            const { el } = Toolbar.create(mm);
            el.style.position = 'absolute';
            el.style.bottom = '1rem';
            el.style.right = '1rem';
            el.style.zIndex = '10';
            el.classList.add('markmap-toolbar');
            wrapperRef.current!.append(el);

            setIsRendering(false);
          } catch (error) {
            console.error('[MindMapViewer] Error creating Markmap instance:', error);
            setIsRendering(false);
          }
        });

      } catch (error) {
        console.error('Markmap rendering error:', error);
        setIsRendering(false);
      }
    };

    // Initial check with a small delay to allow layout to settle
    const timer = setTimeout(() => {
      animationFrameRef.current = requestAnimationFrame(renderMindMap); // Store ID for cancellation
    }, 100);

    return () => {
      isCancelled = true;
      clearTimeout(timer);
      // Mark component as unmounted to avoid further renders
      isUnmountedRef.current = true;
      // Cancel any pending animation frames
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      // Reset markmap instance reference
      setMarkmapInstance(null);

      // Clean up markmap instance safely
      if (markmapInstance) {
        try {
          // Stop any ongoing animations/transitions before destroying
          markmapInstance.destroy();
        } catch (error) {
          // Suppress errors during cleanup (SVG might be already removed from DOM)
          console.debug('[MindMapViewer] Cleanup error (expected during unmount):', error);
        }
      }

      // Clear SVG content to prevent stale transform errors
      if (svgRef.current) {
        try {
          svgRef.current.innerHTML = '';
        } catch (error) {
          // Suppress if SVG is already removed
          console.debug('[MindMapViewer] SVG cleanup error:', error);
        }
      }

      const existingToolbar = wrapperRef.current?.querySelector('.markmap-toolbar');
      if (existingToolbar) {
        existingToolbar.remove();
      }
    };
  }, [content]);

  return (
    <div className="flex flex-col h-full relative" ref={wrapperRef}>
      {/* CSS for dark theme and touch optimization */}
      <style>{`
        .markmap-toolbar {
          display: flex;
          gap: 0.5rem;
          background: rgba(30, 30, 30, 0.9);
          backdrop-filter: blur(4px);
          padding: 0.5rem;
          border-radius: 0.75rem;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.3);
          border: 1px solid rgba(255,255,255,0.1);
        }
        .markmap-toolbar .mm-toolbar-item {
          width: 2.5rem;
          height: 2.5rem;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 0.5rem;
          cursor: pointer;
          transition: all 0.2s;
          color: #e5e7eb;
        }
        .markmap-toolbar .mm-toolbar-item:hover {
          background-color: #374151;
          color: #ffffff;
        }
        .markmap-toolbar .mm-toolbar-item:active {
          background-color: #4b5563;
        }
        
        /* Node Pills Styling */
        .mm-pill {
          display: inline-block;
          padding: 6px 16px;
          border-radius: 999px; /* Pill shape */
          color: white;
          font-weight: 500;
          font-family: 'Inter', sans-serif;
          box-shadow: 0 2px 4px rgba(0,0,0,0.2);
          max-width: 300px; /* Prevent overly wide nodes */
          white-space: normal; /* Allow wrapping */
          text-align: center;
          line-height: 1.4;
        }
        
        /* Depth Colors */
        .mm-pill.depth-0 {
          background-color: #8B5CF6; /* Violet-500 */
          font-size: 18px;
          font-weight: 700;
          padding: 10px 24px;
        }
        .mm-pill.depth-1 {
          background-color: #374151; /* Gray-700 */
          font-size: 15px;
          border: 1px solid #4B5563;
        }
        .mm-pill.depth-2 {
          background-color: #10B981; /* Emerald-500 */
          color: #ffffff;
          font-size: 14px;
        }
        .mm-pill.depth-3 {
          background-color: #3B82F6; /* Blue-500 */
          font-size: 14px;
        }

        /* Dark Theme Overrides for SVG */
        svg.markmap {
          touch-action: none;
          background-color: #1a1a1a; /* Dark background */
        }
        svg.markmap text {
          fill: #f3f4f6 !important; /* Light text */
          font-family: 'Inter', sans-serif;
        }
        svg.markmap circle {
          stroke-width: 2px;
        }
        /* Hide the default circle/dot if we want just the pill? 
           Markmap renders a circle at the node junction. 
           We can keep it or hide it. Let's keep it for now as it shows connection points. 
        */
      `}</style>

      {title && (
        <div className="p-4 border-b border-gray-800 bg-[#1a1a1a] z-10 flex justify-between items-center shadow-sm">
          <h3 className="font-semibold text-gray-200">{title}</h3>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCollapseAll}
              className="p-1.5 text-gray-400 hover:text-white hover:bg-accent rounded-md transition-colors"
              title="Colapsar Tudo"
            >
              <Minimize2 size={18} />
            </button>
            <button
              onClick={handleExpandAll}
              className="p-1.5 text-gray-400 hover:text-white hover:bg-accent rounded-md transition-colors"
              title="Expandir Tudo"
            >
              <Maximize2 size={18} />
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-hidden bg-[#1a1a1a] relative touch-none">
        {isRendering && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-20">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        )}
        <svg ref={svgRef} className="w-full h-full block markmap" />
      </div>
    </div>
  );
}
