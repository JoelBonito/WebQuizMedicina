import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "./ui/button";
import { MessageSquare, Star, ZoomIn, ZoomOut, Palette } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useHighlights, HighlightColor } from "../hooks/useHighlights";
import { toast } from "sonner";

interface SummaryViewerProps {
  html: string;
  summaryId: string;
  projectId: string;
  onAskChat?: (selectedText: string) => void;
  onHighlight?: (selectedText: string) => void;
}

const HIGHLIGHT_COLORS: { color: HighlightColor; label: string; class: string }[] = [
  { color: 'yellow', label: 'Amarelo', class: 'bg-yellow-200 hover:bg-yellow-300' },
  { color: 'green', label: 'Verde', class: 'bg-green-200 hover:bg-green-300' },
  { color: 'blue', label: 'Azul', class: 'bg-blue-200 hover:bg-blue-300' },
  { color: 'pink', label: 'Rosa', class: 'bg-pink-200 hover:bg-pink-300' },
];

export function SummaryViewer({ html, summaryId, projectId, onAskChat, onHighlight }: SummaryViewerProps) {
  const [selectedText, setSelectedText] = useState("");
  const [popoverPosition, setPopoverPosition] = useState({ top: 0, left: 0 });
  const [showPopover, setShowPopover] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(100);
  const [renderedHtml, setRenderedHtml] = useState(html);
  const contentRef = useRef<HTMLDivElement>(null);
  const originalHtmlRef = useRef<string>(html);
  const selectionRangeRef = useRef<Range | null>(null);

  const { highlights, addHighlight, removeHighlight } = useHighlights(summaryId, projectId);

  // Apply highlights to HTML
  const applyHighlightsToHtml = useCallback((baseHtml: string) => {
    if (highlights.length === 0) return baseHtml;

    // Sort highlights by start_offset (descending) to avoid offset issues
    const sortedHighlights = [...highlights].sort((a, b) => b.start_offset - a.start_offset);

    let result = baseHtml;

    sortedHighlights.forEach((highlight) => {
      const { text, color, id } = highlight;

      // Find the text in the HTML (simple approach)
      const textIndex = result.indexOf(text);
      if (textIndex !== -1) {
        const before = result.substring(0, textIndex);
        const highlighted = result.substring(textIndex, textIndex + text.length);
        const after = result.substring(textIndex + text.length);

        result = `${before}<mark class="text-highlight highlight-${color}" data-highlight-id="${id}" style="cursor: pointer;">${highlighted}</mark>${after}`;
      }
    });

    return result;
  }, [highlights]);

  // Update HTML when highlights change
  useEffect(() => {
    const highlightedHtml = applyHighlightsToHtml(originalHtmlRef.current);
    setRenderedHtml(highlightedHtml);
  }, [highlights, applyHighlightsToHtml]);

  // Add double-click listeners to marks
  useEffect(() => {
    if (contentRef.current) {
      const markElements = contentRef.current.querySelectorAll('mark[data-highlight-id]');

      const handleDoubleClick = async (e: Event) => {
        const target = e.target as HTMLElement;
        const highlightId = target.getAttribute('data-highlight-id');
        if (highlightId) {
          try {
            // Remoção otimista - remove visualmente IMEDIATAMENTE
            const textToRestore = target.textContent || '';
            const parent = target.parentNode;

            if (parent) {
              // Substitui o <mark> pelo texto puro
              const textNode = document.createTextNode(textToRestore);
              parent.replaceChild(textNode, target);

              // Atualiza o renderedHtml imediatamente
              const currentHtml = contentRef.current?.querySelector('.study-content')?.innerHTML || '';
              setRenderedHtml(currentHtml);
            }

            // Remove do Firestore (em background)
            await removeHighlight(highlightId);
            toast.success("Marcação removida");
          } catch (error) {
            console.error('Error removing highlight:', error);
            toast.error("Erro ao remover marcação");
            // Em caso de erro, força refresh do Firestore
            const highlightedHtml = applyHighlightsToHtml(originalHtmlRef.current);
            setRenderedHtml(highlightedHtml);
          }
        }
      };

      markElements.forEach((mark) => {
        mark.addEventListener('dblclick', handleDoubleClick);
      });

      return () => {
        markElements.forEach((mark) => {
          mark.removeEventListener('dblclick', handleDoubleClick);
        });
      };
    }
  }, [renderedHtml, removeHighlight, applyHighlightsToHtml]);

  // Handle text selection
  useEffect(() => {
    let selectionTimeout: number;

    const handleSelectionChange = () => {
      // Se o color picker está aberto, não fechar o popover
      if (showColorPicker) return;

      const selection = window.getSelection();
      const text = selection?.toString().trim();

      if (text && text.length > 0) {
        const range = selection?.getRangeAt(0);
        if (range && contentRef.current?.contains(range.commonAncestorContainer)) {
          setSelectedText(text);
          // Salva a referência do range para uso posterior
          selectionRangeRef.current = range.cloneRange();

          // Get selection position for popover
          const rect = range.getBoundingClientRect();
          const contentRect = contentRef.current.getBoundingClientRect();

          setPopoverPosition({
            top: rect.top - contentRect.top - 70, // Move mais para cima para não bloquear mobile
            left: rect.left - contentRect.left + rect.width / 2,
          });

          // Delay para permitir expansão de seleção no mobile
          clearTimeout(selectionTimeout);
          selectionTimeout = setTimeout(() => {
            setShowPopover(true);
          }, 600); // 600ms delay para mobile

          setShowColorPicker(false);
        }
      } else if (!showPopover) {
        // Só fecha se o popover não estiver aberto
        clearTimeout(selectionTimeout);
      }
    };

    document.addEventListener("selectionchange", handleSelectionChange);

    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      const target = e.target as HTMLElement;
      if (showPopover && !target.closest('.summary-popover')) {
        clearTimeout(selectionTimeout);
        setShowPopover(false);
        setShowColorPicker(false);
        selectionRangeRef.current = null;
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside);

    return () => {
      clearTimeout(selectionTimeout);
      document.removeEventListener("selectionchange", handleSelectionChange);
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, [showPopover, showColorPicker]);

  // Zoom controls
  const handleZoomIn = () => {
    setZoomLevel((prev) => Math.min(prev + 10, 200));
  };

  const handleZoomOut = () => {
    setZoomLevel((prev) => Math.max(prev - 10, 50));
  };

  // Pinch-to-zoom for iPad
  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -10 : 10;
        setZoomLevel((prev) => Math.max(50, Math.min(200, prev + delta)));
      }
    };

    const element = contentRef.current;
    if (element) {
      element.addEventListener('wheel', handleWheel, { passive: false });
      return () => element.removeEventListener('wheel', handleWheel);
    }
  }, []);

  // Handle chat
  const handleAskChat = () => {
    if (onAskChat && selectedText) {
      onAskChat(selectedText);
      setShowPopover(false);
      window.getSelection()?.removeAllRanges();
    }
  };

  // Handle legacy highlight (onHighlight prop)
  const handleHighlight = () => {
    if (onHighlight && selectedText) {
      onHighlight(selectedText);
      setShowPopover(false);
      window.getSelection()?.removeAllRanges();
    }
  };

  // Handle color selection for highlight
  const handleColorSelect = async (color: HighlightColor) => {
    if (!selectedText) return;

    try {
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) return;

      const range = selection.getRangeAt(0);

      // Calculate offsets (simple approach - may need refinement)
      const preSelectionRange = range.cloneRange();
      preSelectionRange.selectNodeContents(contentRef.current?.querySelector('.study-content')!);
      preSelectionRange.setEnd(range.startContainer, range.startOffset);
      const startOffset = preSelectionRange.toString().length;
      const endOffset = startOffset + selectedText.length;

      // Adiciona o highlight ao Firestore
      const highlightId = await addHighlight(selectedText, color, startOffset, endOffset);

      // Aplica marcação visual IMEDIATAMENTE no DOM (otimista)
      const currentHtml = renderedHtml;
      const textIndex = currentHtml.indexOf(selectedText);
      if (textIndex !== -1) {
        const before = currentHtml.substring(0, textIndex);
        const highlighted = currentHtml.substring(textIndex, textIndex + selectedText.length);
        const after = currentHtml.substring(textIndex + selectedText.length);

        const newHtml = `${before}<mark class="text-highlight highlight-${color}" data-highlight-id="${highlightId}" style="cursor: pointer;">${highlighted}</mark>${after}`;
        setRenderedHtml(newHtml);
      }

      toast.success(`Texto marcado com ${HIGHLIGHT_COLORS.find(c => c.color === color)?.label}`);

      setShowPopover(false);
      setShowColorPicker(false);
      window.getSelection()?.removeAllRanges();
    } catch (error) {
      console.error('Error adding highlight:', error);
      toast.error("Erro ao marcar texto");
    }
  };

  return (
    <div className="relative h-full flex flex-col" ref={contentRef}>
      {/* Zoom Controls */}
      <div className="absolute top-4 right-4 z-40 flex items-center gap-2 bg-white/95 backdrop-blur-sm rounded-xl p-2 border-2 border-gray-200 shadow-lg">
        <Button
          size="sm"
          variant="ghost"
          onClick={handleZoomOut}
          disabled={zoomLevel <= 50}
          className="h-8 w-8 p-0 text-gray-700 hover:text-gray-900 hover:bg-gray-100"
        >
          <ZoomOut className="w-4 h-4" />
        </Button>
        <span className="text-xs font-medium text-gray-900 px-2 min-w-[3rem] text-center">
          {zoomLevel}%
        </span>
        <Button
          size="sm"
          variant="ghost"
          onClick={handleZoomIn}
          disabled={zoomLevel >= 200}
          className="h-8 w-8 p-0 text-gray-700 hover:text-gray-900 hover:bg-gray-100"
        >
          <ZoomIn className="w-4 h-4" />
        </Button>
      </div>

      {/* Summary Content */}
      <div
        className="study-content select-text flex-1 overflow-auto custom-scrollbar transition-transform duration-200"
        dangerouslySetInnerHTML={{ __html: renderedHtml }}
        style={{
          userSelect: 'text',
          WebkitUserSelect: 'text',
          MozUserSelect: 'text',
          transform: `scale(${zoomLevel / 100})`,
          transformOrigin: 'top left',
          width: `${100 / (zoomLevel / 100)}%`,
        }}
      />

      {/* Selection Popover */}
      <AnimatePresence>
        {showPopover && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="summary-popover absolute z-50 glass-dark rounded-xl shadow-2xl border-2 border-[#BAE6FD] p-2 flex flex-col gap-2"
            style={{
              top: `${popoverPosition.top}px`,
              left: `${popoverPosition.left}px`,
              transform: 'translateX(-50%)',
            }}
          >
            <div className="flex gap-2">
              {onAskChat && (
                <Button
                  size="sm"
                  onClick={handleAskChat}
                  className="rounded-lg bg-gradient-to-r from-[#0891B2] to-[#7CB342] hover:from-[#0891B2] hover:to-[#7CB342] text-white shadow-lg text-xs"
                >
                  <MessageSquare className="w-3 h-3 mr-1" />
                  Perguntar ao Chat
                </Button>
              )}

              <Button
                size="sm"
                variant="outline"
                onMouseDown={(e) => e.preventDefault()}
                onTouchStart={(e) => e.preventDefault()}
                onClick={() => setShowColorPicker(!showColorPicker)}
                className="rounded-lg border-[#BAE6FD] bg-white text-gray-900 hover:bg-gray-100 text-xs font-medium"
              >
                <Palette className="w-3 h-3 mr-1" />
                Marcar Texto
              </Button>

              {onHighlight && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleHighlight}
                  className="rounded-lg border-yellow-300 bg-yellow-50 text-yellow-700 hover:bg-yellow-100 text-xs"
                >
                  <Star className="w-3 h-3 mr-1" />
                  Importante
                </Button>
              )}
            </div>

            {/* Color Picker */}
            {showColorPicker && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="flex gap-2 pt-2 border-t border-white/20"
              >
                {HIGHLIGHT_COLORS.map(({ color, label, class: className }) => (
                  <button
                    key={color}
                    onMouseDown={(e) => e.preventDefault()}
                    onTouchStart={(e) => e.preventDefault()}
                    onClick={() => handleColorSelect(color)}
                    className={`w-8 h-8 rounded-lg ${className} transition-transform hover:scale-110 border-2 border-white shadow-lg`}
                    title={label}
                  />
                ))}
              </motion.div>
            )}

            {/* Triangle pointer */}
            <div className="absolute -bottom-2 left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-8 border-r-8 border-t-8 border-l-transparent border-r-transparent border-t-[#BAE6FD]"></div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Highlight styles */}
      <style>{`
        .highlight-yellow { 
          background-color: #fef08a !important; 
          color: inherit !important;
        }
        .highlight-green { 
          background-color: #bbf7d0 !important; 
          color: inherit !important;
        }
        .highlight-blue { 
          background-color: #bfdbfe !important; 
          color: inherit !important;
        }
        .highlight-pink { 
          background-color: #fbcfe8 !important; 
          color: inherit !important;
        }

        mark.text-highlight {
          padding: 2px 4px;
          border-radius: 3px;
          cursor: pointer;
          transition: all 0.2s;
          position: relative;
        }

        mark.text-highlight:hover {
          filter: brightness(0.85);
          box-shadow: 0 0 0 2px rgba(0,0,0,0.1);
        }

        mark.text-highlight:hover::after {
          content: "Duplo clique para remover";
          position: absolute;
          bottom: 100%;
          left: 50%;
          transform: translateX(-50%);
          background: rgba(0,0,0,0.9);
          color: white;
          padding: 4px 8px;
          border-radius: 4px;
          font-size: 11px;
          white-space: nowrap;
          pointer-events: none;
          z-index: 1000;
          margin-bottom: 4px;
        }

        mark.text-highlight:hover::before {
          content: "";
          position: absolute;
          top: -4px;
          left: 50%;
          transform: translateX(-50%);
          border-left: 4px solid transparent;
          border-right: 4px solid transparent;
          border-top: 4px solid rgba(0,0,0,0.9);
          pointer-events: none;
          z-index: 1000;
        }
      `}</style>
    </div>
  );
}
