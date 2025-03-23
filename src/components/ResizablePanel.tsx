// components/ResizablePanel.tsx
import React, { useState, useRef, useEffect } from 'react';

interface ResizablePanelProps {
  children: React.ReactNode;
  direction: 'horizontal' | 'vertical';
  initialSize: number;
  minSize?: number;
  maxSize?: number;
  className?: string;
  onChange?: (newSize: number) => void;
}

const ResizablePanel: React.FC<ResizablePanelProps> = ({
  children,
  direction,
  initialSize,
  minSize = 100,
  maxSize = 800,
  className = '',
  onChange
}) => {
  const [size, setSize] = useState(initialSize);
  const containerRef = useRef<HTMLDivElement>(null);
  const isResizing = useRef(false);
  const startPos = useRef(0);
  const startSize = useRef(0);

  // Update size if initialSize changes
  useEffect(() => {
    if (!isResizing.current) {
      setSize(initialSize);
    }
  }, [initialSize]);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    isResizing.current = true;
    startPos.current = direction === 'horizontal' ? e.clientX : e.clientY;
    startSize.current = size;
    document.body.style.cursor = direction === 'horizontal' ? 'col-resize' : 'row-resize';
    document.body.style.userSelect = 'none';

    // Add event listeners to document
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isResizing.current) return;
    
    const currentPos = direction === 'horizontal' ? e.clientX : e.clientY;
    const delta = currentPos - startPos.current;
    let newSize = startSize.current + delta;
    
    // Apply constraints
    newSize = Math.max(minSize, Math.min(maxSize, newSize));
    
    setSize(newSize);
    if (onChange) onChange(newSize);
  };

  const handleMouseUp = () => {
    isResizing.current = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    
    // Remove event listeners
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
  };

  const containerStyle: React.CSSProperties = {
    position: 'relative',
    ...(direction === 'horizontal' 
      ? { width: `${size}px`, height: '100%' } 
      : { width: '100%', height: `${size}px` })
  };

  const resizerStyle: React.CSSProperties = {
    position: 'absolute',
    ...(direction === 'horizontal'
      ? {
          right: '-5px',
          top: 0,
          width: '10px',
          height: '100%',
          cursor: 'col-resize'
        }
      : {
          bottom: '-5px',
          left: 0,
          height: '10px',
          width: '100%',
          cursor: 'row-resize'
        }),
    zIndex: 10
  };

  return (
    <div ref={containerRef} className={className} style={containerStyle}>
      {children}
      <div
        className="resizer"
        style={resizerStyle}
        onMouseDown={handleMouseDown}
      />
    </div>
  );
};

export default ResizablePanel;