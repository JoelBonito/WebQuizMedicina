import { useState, useRef, useEffect, ReactNode } from "react";
import { GripVertical } from "lucide-react";

interface ResizableLayoutProps {
  leftPanel: ReactNode;
  centerPanel: ReactNode;
  rightPanel: ReactNode;
}

export function ResizableLayout({ leftPanel, centerPanel, rightPanel }: ResizableLayoutProps) {
  const [leftWidth, setLeftWidth] = useState(25); // percentage
  const [rightWidth, setRightWidth] = useState(25); // percentage
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDraggingLeft, setIsDraggingLeft] = useState(false);
  const [isDraggingRight, setIsDraggingRight] = useState(false);

  // Calculate center width
  const centerWidth = 100 - leftWidth - rightWidth;

  const handleMouseDown = (side: 'left' | 'right') => (e: React.MouseEvent) => {
    e.preventDefault();
    if (side === 'left') {
      setIsDraggingLeft(true);
    } else {
      setIsDraggingRight(true);
    }
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;

      const container = containerRef.current;
      const containerRect = container.getBoundingClientRect();
      const containerWidth = containerRect.width;
      const mouseX = e.clientX - containerRect.left;

      if (isDraggingLeft) {
        // Calculate new left width as percentage
        const newLeftWidth = (mouseX / containerWidth) * 100;
        // Constrain between 15% and 50%
        const constrainedLeftWidth = Math.max(15, Math.min(50, newLeftWidth));
        setLeftWidth(constrainedLeftWidth);
      } else if (isDraggingRight) {
        // Calculate new right width as percentage (from right edge)
        const mouseFromRight = containerWidth - mouseX;
        const newRightWidth = (mouseFromRight / containerWidth) * 100;
        // Constrain between 15% and 50%
        const constrainedRightWidth = Math.max(15, Math.min(50, newRightWidth));
        setRightWidth(constrainedRightWidth);
      }
    };

    const handleMouseUp = () => {
      setIsDraggingLeft(false);
      setIsDraggingRight(false);
    };

    if (isDraggingLeft || isDraggingRight) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isDraggingLeft, isDraggingRight]);

  return (
    <div ref={containerRef} className="h-full flex overflow-hidden">
      {/* Left Panel */}
      <div style={{ width: `${leftWidth}%` }} className="h-full flex items-stretch overflow-hidden">
        {leftPanel}
      </div>

      {/* Left Divider */}
      <div
        onMouseDown={handleMouseDown('left')}
        className="w-1 bg-gray-200 hover:bg-[#0891B2] cursor-col-resize flex items-center justify-center group relative transition-colors duration-200"
      >
        <div className="absolute inset-y-0 -left-1 -right-1 flex items-center justify-center">
          <GripVertical className="w-3 h-3 text-gray-400 group-hover:text-[#0891B2] opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
      </div>

      {/* Center Panel */}
      <div style={{ width: `${centerWidth}%` }} className="h-full flex items-stretch overflow-hidden">
        {centerPanel}
      </div>

      {/* Right Divider */}
      <div
        onMouseDown={handleMouseDown('right')}
        className="w-1 bg-gray-200 hover:bg-[#0891B2] cursor-col-resize flex items-center justify-center group relative transition-colors duration-200"
      >
        <div className="absolute inset-y-0 -left-1 -right-1 flex items-center justify-center">
          <GripVertical className="w-3 h-3 text-gray-400 group-hover:text-[#0891B2] opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
      </div>

      {/* Right Panel */}
      <div style={{ width: `${rightWidth}%` }} className="h-full flex items-stretch overflow-hidden">
        {rightPanel}
      </div>
    </div>
  );
}
