// components/LatexEditorWithChatIntegration.tsx
import React, { useState, useEffect, useRef } from 'react';
import { ChatProvider } from '../context/ChatContext';
import ChatWindow from './ChatWindow';
import SuggestionOverlay from './SuggestionOverlay';
import { 
  getDoc, 
  collection, 
  query, 
  where, 
  getDocs, 
  orderBy 
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Loader, MessageSquare, X } from 'lucide-react';

interface EditorIntegrationProps {
  editor: any; // CodeMirror editor or editor view instance
  currentFileId: string | null;
  currentFileName: string;
  currentFileContent: string;
  projectId: string;
  userId: string;
  files: any[]; // Array of project files
  onSaveFile: (fileId: string, content: string) => Promise<boolean>;
  onFileSelect: (fileId: string) => void;
  onApplySuggestion?: (text: string, range?: {start: number, end: number}, fileId?: string) => void;
}

const LatexEditorWithChatIntegration: React.FC<EditorIntegrationProps> = ({
  editor,
  currentFileId,
  currentFileName,
  currentFileContent,
  projectId,
  userId,
  files,
  onSaveFile,
  onFileSelect,
  onApplySuggestion
}) => {
  // State for chat integration
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [activeSuggestion, setActiveSuggestion] = useState<{
    text: string;
    range?: { start: number; end: number };
    fileId?: string;
  } | null>(null);
  const [isLoadingProject, setIsLoadingProject] = useState(false);
  const [projectFiles, setProjectFiles] = useState<{id: string, name: string, type: string}[]>([]);
  const [chatWidth, setChatWidth] = useState(350);
  
  const chatPanelRef = useRef<HTMLDivElement>(null);

  // Update project files list for file mentions
  useEffect(() => {
    // Load all project files for mention feature
    const loadProjectFiles = async () => {
      if (!projectId) return;
      
      setIsLoadingProject(true);
      
      try {
        // Query for all files in this project
        const filesQuery = query(
          collection(db, "projectFiles"),
          where("projectId", "==", projectId),
          orderBy("_name_", "asc")
        );
        
        const snapshot = await getDocs(filesQuery);
        
        const filesList = snapshot.docs
          .filter(doc => !doc.data().deleted) // Filter out deleted files
          .map(doc => ({
            id: doc.id,
            name: doc.data()._name_ || doc.data().name || 'Untitled',
            type: doc.data().type || 'file',
          }));
        
        setProjectFiles(filesList);
      } catch (error) {
        console.error("Error loading project files for chat:", error);
      } finally {
        setIsLoadingProject(false);
      }
    };
    
    loadProjectFiles();
  }, [projectId, files]); // Reload when files change

  // Toggle chat panel
  const toggleChat = () => {
    setIsChatOpen(prev => !prev);
  };

  // Handle applying a suggestion to the editor
  const handleApplySuggestion = (suggestion: string, range?: {start: number, end: number}, fileId?: string) => {
    if (onApplySuggestion) {
      onApplySuggestion(suggestion, range, fileId);
    } else {
      // If no external handler is provided, implement a basic one
      // If suggestion is for a different file, switch to that file first
      if (fileId && fileId !== currentFileId) {
        onFileSelect(fileId);
        
        // Store the suggestion to apply after file is loaded
        setActiveSuggestion({
          text: suggestion,
          range,
          fileId
        });
        
        return;
      }
      
      // Apply to current file if editor is available
      if (editor) {
        try {
          // Different ways to update the editor content depending on editor type
          if (editor.dispatch && editor.state) {
            // CodeMirror 6 style
            const doc = editor.state.doc;
            const transaction = editor.state.update({
              changes: {
                from: range ? range.start : 0,
                to: range ? range.end : doc.length,
                insert: suggestion
              }
            });
            editor.dispatch(transaction);
          } else if (editor.replaceRange) {
            // CodeMirror 5 style
            if (range) {
              editor.replaceRange(suggestion, editor.posFromIndex(range.start), editor.posFromIndex(range.end));
            } else {
              editor.setValue(suggestion);
            }
          } else if (editor.setValue) {
            // Simple editor style
            editor.setValue(suggestion);
          } else {
            console.error("No suitable method found to update editor content");
          }
          
          // Clear active suggestion
          setActiveSuggestion(null);
          
          // Auto-save the file after applying suggestion
          setTimeout(() => {
            if (currentFileId) {
              // Get current content from editor
              let content = '';
              if (editor.state && editor.state.doc) {
                content = editor.state.doc.toString();
              } else if (editor.getValue) {
                content = editor.getValue();
              } else if (typeof editor.value === 'string') {
                content = editor.value;
              }
              
              onSaveFile(currentFileId, content);
            }
          }, 500);
        } catch (error) {
          console.error("Error applying suggestion:", error);
        }
      }
    }
  };

  // Handle file upload in chat
  const handleChatFileUpload = async (file: File): Promise<string> => {
    // Implement file upload logic
    // This would typically upload to your storage and return a URL
    
    // For now, we'll return a placeholder
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve(`https://example.com/files/${file.name}`);
      }, 1000);
    });
  };

  // Handle chat panel resize
  const handleChatResize = (newWidth: number) => {
    setChatWidth(newWidth);
  };

  // Render chat button
  const renderChatButton = () => (
    <button
      onClick={toggleChat}
      className={`fixed z-20 right-4 bottom-4 p-3 rounded-full shadow-lg 
        ${isChatOpen 
          ? 'bg-red-600 hover:bg-red-700' 
          : 'bg-blue-600 hover:bg-blue-700'} 
        text-white transition-all duration-150 ease-in-out`}
      aria-label={isChatOpen ? "Close chat" : "Open chat"}
    >
      {isChatOpen ? (
        <X className="h-5 w-5" />
      ) : (
        <MessageSquare className="h-5 w-5" />
      )}
    </button>
  );

  return (
    <div className="relative h-full">
      {/* Active suggestion overlay */}
      {activeSuggestion && (
        <div className="absolute inset-0 z-30 bg-black/20 flex items-center justify-center">
          <div className="bg-gray-800 p-6 rounded-lg shadow-xl max-w-xl">
            <SuggestionOverlay
              suggestion={activeSuggestion}
              onApply={handleApplySuggestion}
              onReject={() => setActiveSuggestion(null)}
            />
          </div>
        </div>
      )}
      
      {/* Chat panel */}
      {isChatOpen && (
        <div 
          ref={chatPanelRef}
          className="absolute right-0 top-0 bottom-0 z-10 h-full"
        >
          <ChatWindow
            isOpen={isChatOpen}
            onClose={() => setIsChatOpen(false)}
            projectId={projectId}
            userId={userId}
            currentFileName={currentFileName}
            currentFileId={currentFileId || ''}
            currentFileContent={currentFileContent}
            projectFiles={projectFiles}
            onSuggestionApply={handleApplySuggestion}
            onSuggestionReject={() => setActiveSuggestion(null)}
            onFileSelect={onFileSelect}
            onFileUpload={handleChatFileUpload}
            initialWidth={chatWidth}
            onChange={handleChatResize}
          />
        </div>
      )}
      
      {/* Loading overlay for project files */}
      {isLoadingProject && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center">
          <div className="bg-gray-800 p-6 rounded-lg flex items-center">
            <Loader className="h-5 w-5 text-blue-500 animate-spin mr-3" />
            <span className="text-white">Loading project data...</span>
          </div>
        </div>
      )}
      
      {/* Chat button */}
      {renderChatButton()}
    </div>
  );
};

export default LatexEditorWithChatIntegration;