// utils/integrateEditor.ts
import React from 'react';
import ReactDOM from 'react-dom';
import { EditorView } from '@codemirror/view';
import LatexEditorWithChatIntegration from '../components/LatexEditorWithChatIntegration';

/**
 * Integrates the Chat and file mention functionality with the main editor
 * @param editor The CodeMirror editor instance or view
 * @param projectId Current project ID
 * @param userId Current user ID
 * @param files Project file list
 * @param callbacks Object containing callback functions
 */
export function integrateEditorWithChat(
  editor: any,
  projectId: string,
  userId: string,
  files: any[],
  callbacks: {
    onSaveFile: (fileId: string, content: string) => Promise<boolean>;
    onFileSelect: (fileId: string) => void;
    onCompile: () => void;
  }
) {
  // Create a container for the chat integration
  const containerEl = document.createElement('div');
  containerEl.className = 'editor-chat-integration';
  document.body.appendChild(containerEl);

  // Get current editor state
  const getCurrentFile = () => {
    // Access the editor state correctly based on what's available
    let currentContent = '';
    let currentFileId = null;
    let currentFileName = '';

    try {
      // Different ways to access the editor content depending on editor type
      if (editor.state && editor.state.doc) {
        // CodeMirror 6 style
        currentContent = editor.state.doc.toString();
      } else if (editor.getValue) {
        // CodeMirror 5 or similar style
        currentContent = editor.getValue();
      } else if (typeof editor.value === 'string') {
        // React component style
        currentContent = editor.value;
      }

      // Try to get file info from custom properties or state
      currentFileId = editor._fileId || editor.currentFileId || null;
      currentFileName = editor._fileName || editor.currentFileName || '';
    } catch (e) {
      console.error("Error accessing editor state:", e);
    }

    return {
      currentFileId,
      currentFileName,
      currentContent
    };
  };

  // Configure performance optimization for resize
  const optimizeForResize = () => {
    // Add resize performance styles
    const styleEl = document.createElement('style');
    styleEl.textContent = `
      body.resizing * {
        pointer-events: none;
      }
      body.resizing .resize-handle {
        pointer-events: auto !important;
      }
      body.resizing .cm-editor * {
        will-change: transform;
        transition: none !important;
      }
    `;
    document.head.appendChild(styleEl);

    // Add ResizeObserver to optimize render during resize
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const target = entry.target as HTMLElement;
        if (target.classList.contains('resizing')) {
          // Optimize rendering during resize
          target.style.willChange = 'transform, width, height';
        } else {
          target.style.willChange = 'auto';
        }
      }
    });

    // Observe resize handles
    document.querySelectorAll('.resize-handle').forEach(el => {
      resizeObserver.observe(el);
    });

    return () => {
      // Cleanup
      document.head.removeChild(styleEl);
      resizeObserver.disconnect();
    };
  };

  // Apply text changes to the editor safely
  const safelyApplyEditorChanges = (text: string, range?: {start: number, end: number}) => {
    try {
      // Different ways to update the editor content depending on editor type
      if (editor.dispatch && editor.state) {
        // CodeMirror 6 style
        const doc = editor.state.doc;
        const transaction = editor.state.update({
          changes: {
            from: range ? range.start : 0,
            to: range ? range.end : doc.length,
            insert: text
          }
        });
        editor.dispatch(transaction);
        return true;
      } else if (editor.replaceRange) {
        // CodeMirror 5 style
        if (range) {
          editor.replaceRange(text, editor.posFromIndex(range.start), editor.posFromIndex(range.end));
        } else {
          editor.setValue(text);
        }
        return true;
      } else if (editor.setValue) {
        // Simple editor style
        editor.setValue(text);
        return true;
      } else {
        console.error("No suitable method found to update editor content");
        return false;
      }
    } catch (e) {
      console.error("Error updating editor content:", e);
      return false;
    }
  };

  // Update the editor file reference when a new file is loaded
  const originalOnFileSelect = callbacks.onFileSelect;
  callbacks.onFileSelect = (fileId: string) => {
    originalOnFileSelect(fileId);
    
    // Find file details
    const fileInfo = files.find(f => f.id === fileId);
    if (fileInfo) {
      // Update file info on editor - use a consistent approach
      editor._fileId = fileId;
      editor._fileName = fileInfo._name_ || fileInfo.name || 'Untitled';
    }
  };

  // Render chat integration component
  const renderComponent = () => {
    const { currentFileId, currentFileName, currentContent } = getCurrentFile();
    
    ReactDOM.render(
      React.createElement(LatexEditorWithChatIntegration, {
        editor: editor,
        currentFileId,
        currentFileName,
        currentFileContent: currentContent,
        projectId,
        userId,
        files,
        onSaveFile: callbacks.onSaveFile,
        onFileSelect: callbacks.onFileSelect,
        onApplySuggestion: (text, range, fileId) => {
          if (fileId && fileId !== currentFileId) {
            // Handle suggestion for a different file
            callbacks.onFileSelect(fileId);
            // Set a timeout to apply the change after file is loaded
            setTimeout(() => {
              safelyApplyEditorChanges(text, range);
              callbacks.onSaveFile(fileId, text);
            }, 500);
          } else {
            // Apply suggestion to current file
            safelyApplyEditorChanges(text, range);
            if (currentFileId) {
              callbacks.onSaveFile(currentFileId, getCurrentFile().currentContent);
            }
          }
        }
      }),
      containerEl
    );
  };

  // Initial render
  renderComponent();
  
  // Start optimization
  const cleanupResize = optimizeForResize();

  // Return cleanup function
  return () => {
    ReactDOM.unmountComponentAtNode(containerEl);
    document.body.removeChild(containerEl);
    cleanupResize();
  };
}