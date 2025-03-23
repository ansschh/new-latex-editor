// Editor-Preview Split View component to handle resizing properly
import React, { useState, useRef, useEffect } from 'react';

interface SplitViewProps {
  leftContent: React.ReactNode;
  rightContent: React.ReactNode;
  initialRatio?: number; // Between 0 and 1, representing the fraction of space for left panel
  minLeftSize?: number;
  maxLeftSize?: number; 
  className?: string;
}

const SplitView: React.FC<SplitViewProps> = ({
  leftContent,
  rightContent,
  initialRatio = 0.5,
  minLeftSize = 100,
  maxLeftSize = 2000,
  className = ''
}) => {
  const [leftRatio, setLeftRatio] = useState(initialRatio);
  const containerRef = useRef<HTMLDivElement>(null);
  const isResizing = useRef(false);
  const startX = useRef(0);
  const startLeftWidth = useRef(0);

  // Adjust sizing whenever window resizes
  useEffect(() => {
    const handleResize = () => {
      // Only adjust if not actively resizing to prevent jumps
      if (!isResizing.current && containerRef.current) {
        // This ensures when window is resized, proportions are maintained
        const containerWidth = containerRef.current.clientWidth;
        const newLeftWidth = containerWidth * leftRatio;
        
        // Ensure left width stays within min/max bounds
        const boundedLeftWidth = Math.max(
          minLeftSize, 
          Math.min(maxLeftSize, newLeftWidth)
        );
        
        // Update ratio if bounds were applied
        if (boundedLeftWidth !== newLeftWidth) {
          setLeftRatio(boundedLeftWidth / containerWidth);
        }
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [leftRatio, minLeftSize, maxLeftSize]);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    isResizing.current = true;
    startX.current = e.clientX;
    
    if (containerRef.current) {
      startLeftWidth.current = containerRef.current.clientWidth * leftRatio;
    }
    
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isResizing.current || !containerRef.current) return;
    
    const containerWidth = containerRef.current.clientWidth;
    const dx = e.clientX - startX.current;
    let newLeftWidth = startLeftWidth.current + dx;
    
    // Apply constraints
    newLeftWidth = Math.max(minLeftSize, Math.min(maxLeftSize, newLeftWidth));
    
    // Calculate new ratio (constrained between 0.1 and 0.9)
    const newRatio = Math.max(0.1, Math.min(0.9, newLeftWidth / containerWidth));
    setLeftRatio(newRatio);
  };

  const handleMouseUp = () => {
    isResizing.current = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
  };

  return (
    <div 
      ref={containerRef} 
      className={`flex overflow-hidden relative ${className}`}
      style={{ width: '100%', height: '100%' }}
    >
      {/* Left panel */}
      <div 
        className="h-full overflow-hidden"
        style={{ width: `${leftRatio * 100}%` }}
      >
        {leftContent}
      </div>
      
      {/* Resizer */}
      <div
        className="absolute w-1 h-full bg-gray-700 hover:bg-blue-500 active:bg-blue-600 cursor-col-resize z-10"
        style={{ 
          left: `calc(${leftRatio * 100}% - 0.5px)`,
          top: 0
        }}
        onMouseDown={handleMouseDown}
      />
      
      {/* Right panel */}
      <div 
        className="h-full overflow-hidden"
        style={{ width: `${(1 - leftRatio) * 100}%` }}
      >
        {rightContent}
      </div>
    </div>
  );
};

export default SplitView;