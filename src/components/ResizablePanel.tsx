// Enhanced ResizablePanel.tsx with improved resizing behavior

import React, { useState, useRef, useEffect, useCallback } from 'react';

interface ResizablePanelProps {
  children: React.ReactNode;
  direction: 'horizontal' | 'vertical';
  initialSize: number;
  minSize?: number;
  maxSize?: number;
  className?: string;
  onChange?: (newSize: number) => void;
  resizeFrom?: 'start' | 'end' | 'both'; // Control which side has resize handles
  onResizeStart?: () => void;  // Callback for resize start
  onResizeEnd?: () => void;    // Callback for resize end
}

const ResizablePanel: React.FC<ResizablePanelProps> = ({
  children,
  direction,
  initialSize,
  minSize = 100,
  maxSize = 800,
  className = '',
  onChange,
  resizeFrom = 'both',
  onResizeStart,
  onResizeEnd
}) => {
  const [size, setSize] = useState(initialSize);
  const containerRef = useRef<HTMLDivElement>(null);
  const isResizing = useRef(false);
  const startPos = useRef(0);
  const startSize = useRef(0);
  const rafId = useRef<number | null>(null);
  const resizeEdge = useRef<'start' | 'end'>('end');
  
  // Threshold for minimum movement to trigger a resize (helps with micro-jitters)
  const MOVEMENT_THRESHOLD = 2;
  // Last applied size to avoid unnecessary updates
  const lastAppliedSize = useRef(initialSize);

  // Update size when initialSize prop changes and we're not resizing
  useEffect(() => {
    if (!isResizing.current) {
      setSize(initialSize);
      lastAppliedSize.current = initialSize;
    }
  }, [initialSize]);

  // Enhanced resize handler using requestAnimationFrame with movement threshold
  const handleResize = useCallback((clientPos: number, edge: 'start' | 'end') => {
    if (!isResizing.current || !containerRef.current) return;
    
    // Cancel any pending animation frame to avoid queuing multiple updates
    if (rafId.current !== null) {
      cancelAnimationFrame(rafId.current);
    }
    
    // Schedule the resize calculation on the next animation frame for smooth performance
    rafId.current = requestAnimationFrame(() => {
      if (!containerRef.current) return;
      
      const currentPos = clientPos;
      
      // Calculate delta based on resize direction and edge
      let delta;
      if (direction === 'horizontal') {
        delta = edge === 'start' 
          ? startPos.current - currentPos 
          : currentPos - startPos.current;
      } else {
        delta = currentPos - startPos.current;
      }
      
      // Only process the resize if movement exceeds threshold (reduces jitter)
      if (Math.abs(delta) < MOVEMENT_THRESHOLD) {
        rafId.current = null;
        return;
      }
      
      // Calculate new size with constraints
      let newSize = startSize.current + delta;
      newSize = Math.max(minSize, Math.min(maxSize, newSize));
      
      // Round to integer to avoid subpixel rendering issues
      newSize = Math.round(newSize);
      
      // Only update if the size has actually changed
      if (newSize !== lastAppliedSize.current) {
        lastAppliedSize.current = newSize;
        setSize(newSize);
        if (onChange) onChange(newSize);
      }
      
      rafId.current = null;
    });
  }, [minSize, maxSize, onChange, direction]);

  // Enhanced mouse down event handler with edge detection
  const handleMouseDown = useCallback((e: React.MouseEvent, edge: 'start' | 'end') => {
    e.preventDefault();
    e.stopPropagation();
    
    isResizing.current = true;
    resizeEdge.current = edge;
    startPos.current = direction === 'horizontal' ? e.clientX : e.clientY;
    startSize.current = size;
    
    // Add visual indication and performance optimizations
    document.body.style.cursor = direction === 'horizontal' ? 'col-resize' : 'row-resize';
    document.body.style.userSelect = 'none';
    document.body.classList.add('resizing');
    
    // Call onResizeStart callback if provided
    if (onResizeStart) onResizeStart();

    // Add event listeners to document
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [direction, size, onResizeStart]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isResizing.current) return;
    
    // Get current pointer position
    const currentPos = direction === 'horizontal' ? e.clientX : e.clientY;
    
    // Use the edge that was set when the drag started
    handleResize(currentPos, resizeEdge.current);
  }, [direction, handleResize]);

  const handleMouseUp = useCallback(() => {
    isResizing.current = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    document.body.classList.remove('resizing');
    
    // Clean up animation frame if still pending
    if (rafId.current !== null) {
      cancelAnimationFrame(rafId.current);
      rafId.current = null;
    }
    
    // Remove event listeners
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
    
    // Call onResizeEnd callback if provided
    if (onResizeEnd) onResizeEnd();
  }, [handleMouseMove, onResizeEnd]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      // Cleanup on unmount
      if (rafId.current !== null) {
        cancelAnimationFrame(rafId.current);
      }
      document.removeEventListener('mousemove', handleMouseMove);
      document.body.classList.remove('resizing');
    };
  }, [handleMouseMove]);

  // Set up container style with proper will-change optimization
  const containerStyle: React.CSSProperties = {
    position: 'relative',
    ...(direction === 'horizontal' 
      ? { width: `${size}px`, height: '100%' } 
      : { width: '100%', height: `${size}px` }),
    // Remove transition during active resize to prevent jitter
    transition: isResizing.current ? 'none' : 'width 0.1s ease, height 0.1s ease',
    // Add will-change property for GPU acceleration
    willChange: 'width, height',
    // Add other GPU acceleration properties
    transform: 'translateZ(0)',
    backfaceVisibility: 'hidden',
    perspective: 1000,
    // Add containment for better performance
    contain: 'layout size style'
  };

  return (
    <div 
      ref={containerRef} 
      className={`${className} panel-transition`} 
      style={containerStyle}
    >
      {children}
      
      {/* Left resize handle for horizontal */}
      {direction === 'horizontal' && (resizeFrom === 'both' || resizeFrom === 'start') && (
        <div
          className="absolute left-0 top-0 w-1 h-full cursor-col-resize hover:bg-blue-500 z-10 group resize-handle"
          onMouseDown={(e) => handleMouseDown(e, 'start')}
        >
          <div className="absolute inset-0 w-4 -ml-1.5 group-hover:bg-blue-500/10 group-active:bg-blue-500/20" />
        </div>
      )}
      
      {/* Right resize handle for horizontal */}
      {direction === 'horizontal' && (resizeFrom === 'both' || resizeFrom === 'end') && (
        <div
          className="absolute right-0 top-0 w-1 h-full cursor-col-resize hover:bg-blue-500 z-10 group resize-handle"
          onMouseDown={(e) => handleMouseDown(e, 'end')}
        >
          <div className="absolute inset-0 w-4 -mr-1.5 group-hover:bg-blue-500/10 group-active:bg-blue-500/20" />
        </div>
      )}
      
      {/* Bottom resize handle for vertical */}
      {direction === 'vertical' && (
        <div
          className="absolute bottom-0 left-0 h-1 w-full cursor-row-resize hover:bg-blue-500 z-10 group resize-handle"
          onMouseDown={(e) => handleMouseDown(e, 'end')}
        >
          <div className="absolute inset-0 h-4 -mb-1.5 group-hover:bg-blue-500/10 group-active:bg-blue-500/20" />
        </div>
      )}
    </div>
  );
};

export default ResizablePanel;