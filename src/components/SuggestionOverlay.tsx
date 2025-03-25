// components/SuggestionOverlay.tsx
import React, { useState, useEffect } from 'react';
import { Check, X, ChevronUp, ChevronDown, Edit, Copy } from 'lucide-react';

interface SuggestionOverlayProps {
  suggestion: {
    text: string;
    range?: { start: number; end: number };
  };
  onApply: (text: string, range?: { start: number; end: number }) => void;
  onReject: () => void;
  position?: 'top' | 'bottom' | 'left' | 'right';
  editorRef?: React.RefObject<any>;
}

/**
 * A floating overlay component to display and apply code suggestions from the AI
 */
const SuggestionOverlay: React.FC<SuggestionOverlayProps> = ({
  suggestion,
  onApply,
  onReject,
  position = 'bottom',
  editorRef
}) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [isHovered, setIsHovered] = useState(false);
  
  // Extract line and column information from range if available
  const lineInfo = React.useMemo(() => {
    if (!suggestion.range || !editorRef?.current) return null;
    
    try {
      const editor = editorRef.current;
      const pos = editor.posToOffset(suggestion.range.start);
      const lineNumber = editor.offsetToPos(pos).line + 1;
      return `Line ${lineNumber}`;
    } catch (e) {
      return null;
    }
  }, [suggestion.range, editorRef]);

  // Handle keyboard shortcuts for apply/reject
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Accept with Ctrl+Enter
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        onApply(suggestion.text, suggestion.range);
      }
      
      // Reject with Escape
      if (e.key === 'Escape') {
        e.preventDefault();
        onReject();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [suggestion, onApply, onReject]);

  // Get the appropriate position classes based on position prop
  const getPositionClasses = () => {
    switch (position) {
      case 'top':
        return 'bottom-full mb-2';
      case 'right':
        return 'left-full ml-2';
      case 'left':
        return 'right-full mr-2';
      case 'bottom':
      default:
        return 'top-full mt-2';
    }
  };

  return (
    <div
      className={`absolute z-50 ${getPositionClasses()} bg-gray-800 border border-gray-700 rounded-md shadow-lg w-96 overflow-hidden`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Header */}
      <div className="flex items-center justify-between bg-gray-750 px-3 py-2 border-b border-gray-700">
        <div className="flex items-center">
          <Edit className="h-4 w-4 text-blue-400 mr-1.5" />
          <span className="text-sm font-medium text-gray-200">AI Suggestion</span>
          {lineInfo && (
            <span className="ml-2 text-xs text-gray-400 bg-gray-700 px-1.5 py-0.5 rounded">
              {lineInfo}
            </span>
          )}
        </div>
        
        <div className="flex items-center space-x-1">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1 text-gray-400 hover:text-gray-200 rounded"
            title={isExpanded ? 'Collapse' : 'Expand'}
          >
            {isExpanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </button>
          <button
            onClick={onReject}
            className="p-1 text-gray-400 hover:text-red-400 rounded"
            title="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Content */}
      {isExpanded && (
        <div className="p-2">
          <pre className="bg-gray-900 p-3 rounded-md text-xs overflow-x-auto max-h-[300px] overflow-y-auto">
            <code className="text-gray-300 font-mono whitespace-pre-wrap">
              {suggestion.text}
            </code>
          </pre>
        </div>
      )}

      {/* Footer - Action buttons */}
      <div className="flex items-center justify-between p-2 bg-gray-750 border-t border-gray-700">
        <div className="text-xs text-gray-400">
          <kbd className="px-1.5 py-0.5 bg-gray-700 rounded border border-gray-600 mr-1">Ctrl</kbd>
          <kbd className="px-1.5 py-0.5 bg-gray-700 rounded border border-gray-600">Enter</kbd>
          <span className="ml-1">to apply</span>
        </div>
        <div className="flex space-x-2">
          <button
            onClick={() => {
              navigator.clipboard.writeText(suggestion.text);
            }}
            className="flex items-center text-xs px-2 py-1 rounded bg-gray-700 hover:bg-gray-600 text-gray-300"
          >
            <Copy className="h-3 w-3 mr-1" />
            Copy
          </button>
          <button
            onClick={() => onApply(suggestion.text, suggestion.range)}
            className="flex items-center text-xs px-2 py-1 rounded bg-blue-600 hover:bg-blue-700 text-white"
          >
            <Check className="h-3 w-3 mr-1" />
            Apply
          </button>
        </div>
      </div>
    </div>
  );
};

export default SuggestionOverlay;