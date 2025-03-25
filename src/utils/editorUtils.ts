// utils/editorUtils.ts
import { EditorView, ViewUpdate } from '@codemirror/view';

/**
 * Safely applies changes to the CodeMirror editor
 * This function handles different ways to update editor content based on what API is available
 */
export const safelyApplyEditorChanges = (
  editorRef: React.RefObject<any>,
  suggestion: string,
  range?: { start: number, end: number }
): boolean => {
  if (!editorRef.current) {
    console.error("Editor reference is not available");
    return false;
  }

  try {
    // For @uiw/react-codemirror specifically:
    // The editor instance is available directly on the ref
    const editor = editorRef.current;
    
    // First check if it's a @uiw/react-codemirror instance
    // It should have a view property that contains the EditorView
    if (editor.view && editor.view instanceof EditorView) {
      const view = editor.view;
      const state = view.state;
      const docLength = state.doc.toString().length;
      
      // Determine where to insert
      const from = range ? Math.max(0, Math.min(range.start, docLength)) : 0;
      const to = range ? Math.max(from, Math.min(range.end, docLength)) : from;
      
      // Create and dispatch the transaction
      const transaction = state.update({
        changes: {
          from,
          to,
          insert: suggestion
        }
      });
      
      view.dispatch(transaction);
      console.log("Applied changes using @uiw/react-codemirror API");
      return true;
    }
    
    // If it's a CodeMirror 6 instance directly
    if (editor.dispatch && editor.state) {
      const state = editor.state;
      const docLength = state.doc.toString().length;
      
      const from = range ? Math.max(0, Math.min(range.start, docLength)) : 0;
      const to = range ? Math.max(from, Math.min(range.end, docLength)) : from;
      
      const transaction = state.update({
        changes: {
          from,
          to,
          insert: suggestion
        }
      });
      
      editor.dispatch(transaction);
      console.log("Applied changes using CodeMirror 6 API");
      return true;
    }
    
    // For CodeMirror 5 style
    if (editor.replaceRange && editor.posFromIndex) {
      const from = range ? editor.posFromIndex(range.start) : editor.getCursor();
      const to = range ? editor.posFromIndex(range.end) : from;
      
      editor.replaceRange(suggestion, from, to);
      console.log("Applied changes using CodeMirror 5 API");
      return true;
    }
    
    // Last resort: if it has a setValue method (but this replaces all content)
    if (typeof editor.setValue === 'function') {
      editor.setValue(suggestion);
      console.log("Applied changes using setValue API");
      return true;
    }
    
    // If we have access to the root DOM element
    if (editor.root && typeof document !== 'undefined') {
      // Find contenteditable or textarea within
      const editable = editor.root.querySelector('[contenteditable="true"]') || 
                       editor.root.querySelector('textarea');
      
      if (editable) {
        editable.value = suggestion;
        console.log("Applied changes by manipulating DOM element");
        return true;
      }
    }
    
    console.error("No suitable method found to update editor content", editor);
    return false;
  } catch (error) {
    console.error("Error applying editor changes:", error);
    return false;
  }
};

/**
 * Gets the correct editor reference from either @uiw/react-codemirror or direct CodeMirror
 */
export const getEditorInstance = (ref: React.RefObject<any>): any => {
  if (!ref.current) return null;
  
  // For @uiw/react-codemirror
  if (ref.current.view) {
    return ref.current.view;
  }
  
  // Already a direct editor reference
  return ref.current;
};