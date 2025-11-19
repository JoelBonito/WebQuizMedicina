import { useState, useRef, useEffect } from "react";
import { Button } from "./ui/button";
import { MessageSquare, Star } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface SummaryViewerProps {
  html: string;
  onAskChat?: (selectedText: string) => void;
  onHighlight?: (selectedText: string) => void;
}

export function SummaryViewer({ html, onAskChat, onHighlight }: SummaryViewerProps) {
  const [selectedText, setSelectedText] = useState("");
  const [popoverPosition, setPopoverPosition] = useState({ top: 0, left: 0 });
  const [showPopover, setShowPopover] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleSelectionChange = () => {
      const selection = window.getSelection();
      const text = selection?.toString().trim();

      if (text && text.length > 0) {
        // Check if selection is within our content div
        const range = selection?.getRangeAt(0);
        if (range && contentRef.current?.contains(range.commonAncestorContainer)) {
          setSelectedText(text);

          // Get selection position for popover
          const rect = range.getBoundingClientRect();
          const contentRect = contentRef.current.getBoundingClientRect();

          setPopoverPosition({
            top: rect.top - contentRect.top - 50, // 50px above selection
            left: rect.left - contentRect.left + rect.width / 2,
          });

          setShowPopover(true);
        }
      } else {
        setShowPopover(false);
      }
    };

    // Add listener for selection changes
    document.addEventListener("selectionchange", handleSelectionChange);

    // Hide popover when clicking outside
    const handleClickOutside = (e: MouseEvent) => {
      if (showPopover && !(e.target as HTMLElement).closest('.summary-popover')) {
        setShowPopover(false);
        window.getSelection()?.removeAllRanges();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      document.removeEventListener("selectionchange", handleSelectionChange);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showPopover]);

  const handleAskChat = () => {
    if (onAskChat && selectedText) {
      onAskChat(selectedText);
      setShowPopover(false);
      window.getSelection()?.removeAllRanges();
    }
  };

  const handleHighlight = () => {
    if (onHighlight && selectedText) {
      onHighlight(selectedText);
      setShowPopover(false);
      window.getSelection()?.removeAllRanges();
    }
  };

  return (
    <div className="relative" ref={contentRef}>
      {/* Summary Content */}
      <div
        className="prose prose-sm max-w-none select-text"
        dangerouslySetInnerHTML={{ __html: html }}
        style={{ userSelect: 'text', WebkitUserSelect: 'text', MozUserSelect: 'text' }}
      />

      {/* Selection Popover */}
      <AnimatePresence>
        {showPopover && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="summary-popover absolute z-50 glass-dark rounded-xl shadow-2xl border-2 border-[#BAE6FD] p-2 flex gap-2"
            style={{
              top: `${popoverPosition.top}px`,
              left: `${popoverPosition.left}px`,
              transform: 'translateX(-50%)',
            }}
          >
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

            {onHighlight && (
              <Button
                size="sm"
                variant="outline"
                onClick={handleHighlight}
                className="rounded-lg border-yellow-300 text-yellow-700 hover:bg-yellow-50 text-xs"
              >
                <Star className="w-3 h-3 mr-1" />
                Marcar Importante
              </Button>
            )}

            {/* Triangle pointer */}
            <div className="absolute -bottom-2 left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-8 border-r-8 border-t-8 border-l-transparent border-r-transparent border-t-[#BAE6FD]"></div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
