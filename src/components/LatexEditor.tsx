import React, { useState, useEffect, useRef, useCallback } from "react";
import dynamic from "next/dynamic";
import { doc, getDoc, updateDoc, serverTimestamp, collection, addDoc, getDocs, query, where, orderBy, deleteDoc } from "firebase/firestore";
import { db, storage } from "@/lib/firebase";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { authenticateWithFirebase } from "@/lib/firebase-auth";
import {
  Loader, Save, Download, Play, Edit, Eye, Layout, Menu,
  FileText, Folder, FolderOpen, RefreshCw, ChevronLeft, ChevronRight, ChevronDown,
  MoreVertical, FilePlus, FolderPlus, File, MessageSquare,
  X, Upload, FileUp, Trash, Plus, Edit2, Trash2, Copy
} from "lucide-react";
import { useRouter } from "next/navigation";
import CodeMirror from '@uiw/react-codemirror';
import { StreamLanguage } from '@codemirror/language';
import { stex } from '@codemirror/legacy-modes/mode/stex';
import { ChatProvider, useChat } from '../context/ChatContext';
import ChatPanel from './ChatWindow';
import HeaderChatButton from './HeaderChatButton';
import { EditorView } from '@codemirror/view';
import { compileLatex } from "@/services/latexService";
import SuggestionOverlay from './SuggestionOverlay';

// Import components
import EnhancedSidebar from '../components/EnhancedSidebar';
import EditableProjectName from '../components/EditableProjectName';
import PdfViewer from "../components/PdfViewer";

// Define types for the internal file structure
interface FileTreeItem {
  id: string;
  name: string;
  type: 'file' | 'folder';
  parentId: string | null;
  content?: string;
  children?: FileTreeItem[];
}

// For file mentions in chat
interface FileMention {
  id: string;
  name: string;
  type: 'file' | 'folder';
}

interface TextWithMentions {
  text: string;
  mentions: FileMention[];
}

// Editor extensions to ensure full height
const editorSetup = EditorView.theme({
  "&": {
    height: "100%",
    maxHeight: "100%"
  },
  ".cm-scroller": {
    overflow: "auto !important" // Force scrolling to be enabled
  },
  ".cm-content": {
    minHeight: "100%",
    paddingBottom: "50px" // Add padding at the bottom for better scrolling experience
  },
  ".cm-editor": {
    height: "100%",
    overflow: "hidden" // Hide overflow on the editor container
  }
});

// Determine if a file is an image
const isImageFile = (filename: string): boolean => {
  if (!filename) return false;
  const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.svg', '.bmp', '.webp'];
  const lowerFilename = filename.toLowerCase();
  return imageExtensions.some(ext => lowerFilename.endsWith(ext));
};

// Custom theme extension for LaTeX syntax highlighting
const latexTheme = EditorView.theme({
  "&.cm-focused": {
    outline: "none"
  },
  ".cm-line": {
    padding: "0 4px"
  },
  ".cm-activeLine": {
    backgroundColor: "rgba(73, 72, 62, 0.3)"
  },
  ".cm-gutters": {
    backgroundColor: "#1f2937",
    color: "#6b7280",
    border: "none"
  },
  ".cm-activeLineGutter": {
    backgroundColor: "rgba(73, 72, 62, 0.3)"
  },
  // LaTeX-specific syntax highlighting
  ".cm-keyword": { color: "#93c5fd", fontWeight: "bold" },
  ".cm-comment": { color: "#6b7280", fontStyle: "italic" },
  ".cm-string": { color: "#fde68a" },
  ".cm-tag": { color: "#f472b6", fontWeight: "bold" },
  ".cm-bracket": { color: "#e5e7eb", fontWeight: "bold" },
  ".cm-property": { color: "#60a5fa" },
  ".cm-m-stex.cm-keyword": { color: "#f472b6", fontWeight: "bold" },
  ".cm-m-stex.cm-builtin": { color: "#93c5fd", fontWeight: "bold" },
  ".cm-m-stex.cm-tag": { color: "#f472b6", fontWeight: "bold" },
  ".cm-m-stex.cm-bracket": { color: "#e5e7eb", fontWeight: "bold" },
  ".cm-m-stex.cm-comment": { color: "#6b7280", fontStyle: "italic" },
  ".cm-m-stex.cm-string": { color: "#fde68a" },
});

// Performance optimization styles to reduce repaints during resize
const performanceStyles = `
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
  
  .resize-handle {
    touch-action: none;
    will-change: transform;
  }
  
  .panel-transition {
    transition: width 0.1s ease, height 0.1s ease;
  }
  
  body.resizing .panel-transition {
    transition: none !important;
  }
  
  .file-mention {
    display: inline-flex;
    align-items: center;
    background-color: rgba(59, 130, 246, 0.2);
    border-radius: 0.25rem;
    padding: 0 0.375rem;
    color: rgb(147, 197, 253);
    cursor: pointer;
    white-space: nowrap;
  }
  
  .file-mention:hover {
    background-color: rgba(59, 130, 246, 0.3);
  }
  
  .mention-list {
    max-height: 200px;
    overflow-y: auto;
    contain: content;
  }
`;

// Dynamically import Image Preview
const ImagePreview = dynamic(() => import('./ImagePreview'), {
  ssr: false,
  loading: () => (
    <div className="h-full flex items-center justify-center bg-gray-900">
      <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
    </div>
  ),
});

// Enhanced ResizablePanel for smooth resizing
const ResizablePanel = ({
  children,
  direction,
  initialSize,
  minSize = 100,
  maxSize = 800,
  className = '',
  onChange,
  resizeFrom = 'both' // Control which side has resize handles
}) => {
  const [size, setSize] = useState(initialSize);
  const containerRef = useRef(null);
  const isResizing = useRef(false);
  const startPos = useRef(0);
  const startSize = useRef(0);
  const rafId = useRef(null);

  // Update size if initialSize changes and we're not currently resizing
  useEffect(() => {
    if (!isResizing.current) {
      setSize(initialSize);
    }
  }, [initialSize]);

  // Optimized resize handler using requestAnimationFrame
  const handleResize = useCallback((clientPos, edge) => {
    if (!isResizing.current || !containerRef.current) return;

    // Cancel any pending animation frame
    if (rafId.current !== null) {
      cancelAnimationFrame(rafId.current);
    }

    // Schedule the resize calculation on the next animation frame
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

      // Calculate new size with constraints
      let newSize = startSize.current + delta;
      newSize = Math.max(minSize, Math.min(maxSize, newSize));

      // Update size
      setSize(newSize);
      if (onChange) onChange(newSize);
    });
  }, [minSize, maxSize, onChange, direction]);

  // Handle mouse down event
  const handleMouseDown = (e, edge) => {
    e.preventDefault();
    isResizing.current = true;
    startPos.current = direction === 'horizontal' ? e.clientX : e.clientY;
    startSize.current = size;
    document.body.style.cursor = direction === 'horizontal' ? 'col-resize' : 'row-resize';
    document.body.style.userSelect = 'none';

    // Optimize performance during resize by adding a resize class to body
    document.body.classList.add('resizing');

    // Add event listeners to document
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const handleMouseMove = useCallback((e) => {
    if (!isResizing.current) return;
    const currentPos = direction === 'horizontal' ? e.clientX : e.clientY;

    // Get the current container bounds
    const containerRect = containerRef.current?.getBoundingClientRect();

    // Determine which edge we're resizing from
    let edge = 'end';
    if (containerRect) {
      if (direction === 'horizontal') {
        // Detect if we're resizing from the left edge (start)
        const isLeftResize = startPos.current < containerRect.left + 10;
        edge = isLeftResize ? 'start' : 'end';
      }
    }

    handleResize(currentPos, edge);
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
  }, [handleMouseMove]);

  // Add event listeners when component mounts
  useEffect(() => {
    return () => {
      // Cleanup on unmount
      if (rafId.current !== null) {
        cancelAnimationFrame(rafId.current);
      }
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  // Set up container style
  const containerStyle = {
    position: 'relative',
    ...(direction === 'horizontal'
      ? { width: `${size}px`, height: '100%' }
      : { width: '100%', height: `${size}px` }),
    transition: isResizing.current ? 'none' : 'width 0.1s ease, height 0.1s ease'
  };

  return (
    <div ref={containerRef} className={`${className} panel-transition`} style={containerStyle}>
      {children}

      {/* Left resize handle for horizontal */}
      {direction === 'horizontal' && (resizeFrom === 'both' || resizeFrom === 'start') && (
        <div
          className="absolute left-0 top-0 w-1 h-full cursor-col-resize hover:bg-blue-500 z-10 resize-handle"
          onMouseDown={(e) => handleMouseDown(e, 'start')}
        >
          <div className="absolute inset-0 w-4 -ml-1.5 group-hover:bg-blue-500/10 group-active:bg-blue-500/20" />
        </div>
      )}

      {/* Right resize handle for horizontal */}
      {direction === 'horizontal' && (resizeFrom === 'both' || resizeFrom === 'end') && (
        <div
          className="absolute right-0 top-0 w-1 h-full cursor-col-resize hover:bg-blue-500 z-10 resize-handle"
          onMouseDown={(e) => handleMouseDown(e, 'end')}
        >
          <div className="absolute inset-0 w-4 -mr-1.5 group-hover:bg-blue-500/10 group-active:bg-blue-500/20" />
        </div>
      )}

      {/* Bottom resize handle for vertical */}
      {direction === 'vertical' && (
        <div
          className="absolute bottom-0 left-0 h-1 w-full cursor-row-resize hover:bg-blue-500 z-10 resize-handle"
          onMouseDown={(e) => handleMouseDown(e, 'end')}
        >
          <div className="absolute inset-0 h-4 -mb-1.5 group-hover:bg-blue-500/10 group-active:bg-blue-500/20" />
        </div>
      )}
    </div>
  );
};

// File mention utility functions
const parseMentions = (text, availableFiles) => {
  const mentions = [];

  // Regular expression to match mentions in the format @[name](id)
  const mentionRegex = /@\[([^\]]+)\]\(([^)]+)\)/g;

  // Find all mentions in the format @[name](id)
  let match;
  while ((match = mentionRegex.exec(text)) !== null) {
    const name = match[1];
    const id = match[2];

    // Try to find the file type
    const fileInfo = availableFiles.find(f => f.id === id);
    const type = fileInfo?.type === 'folder' ? 'folder' : 'file';

    mentions.push({ id, name, type });
  }

  // Replace mentions with plain text version for storage
  const cleanText = text.replace(mentionRegex, '@$1');

  return { text: cleanText, mentions };
};

const renderTextWithMentions = (text, mentions = [], onFileSelect = null) => {
  if (!mentions || mentions.length === 0) {
    return text;
  }

  // Create a map of mentions for quick lookup
  const mentionMap = new Map();
  mentions.forEach(mention => {
    mentionMap.set(mention.name, mention);
  });

  // Split the message by @ symbol
  const parts = text.split('@');

  if (parts.length === 1) {
    return text; // No @ symbols
  }

  // Render each part, checking for mentions
  return (
    <>
      {parts[0]}
      {parts.slice(1).map((part, index) => {
        // Check if this part starts with a mention name
        const mentionName = mentions.find(m => part.startsWith(m.name))?.name;

        if (mentionName) {
          const mention = mentionMap.get(mentionName);
          const restOfText = part.substring(mentionName.length);

          return (
            <React.Fragment key={`mention-${index}`}>
              <span
                className="file-mention"
                onClick={() => mention && onFileSelect && onFileSelect(mention.id)}
              >
                @{mentionName}
              </span>
              {restOfText}
            </React.Fragment>
          );
        }

        return <React.Fragment key={`text-${index}`}>@{part}</React.Fragment>;
      })}
    </>
  );
};

// Interface for the EnhancedLatexEditor component
interface EnhancedLatexEditorProps {
  projectId: string;
  userId: string;
  debug?: boolean;
}

// Main editor component wrapper with ChatProvider
const EnhancedLatexEditorWrapper: React.FC<EnhancedLatexEditorProps> = (props) => {
  return (
    <ChatProvider>
      <EnhancedLatexEditor {...props} />
    </ChatProvider>
  );
};

// Main editor component
const EnhancedLatexEditor: React.FC<EnhancedLatexEditorProps> = ({ projectId, userId, debug = false }) => {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [projectData, setProjectData] = useState(null);
  const [files, setFiles] = useState([]);
  const [code, setCode] = useState("");
  const [isSaved, setIsSaved] = useState(true);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [viewMode, setViewMode] = useState("split");
  const [isEditingProjectName, setIsEditingProjectName] = useState(false);
  const [editedProjectName, setEditedProjectName] = useState("");
  const [isCompiling, setIsCompiling] = useState(false);
  const [compilationError, setCompilationError] = useState(null);
  const [pdfData, setPdfData] = useState(null);
  const [htmlPreview, setHtmlPreview] = useState(null);
  const [autoCompile, setAutoCompile] = useState(false);
  const [compileTimeout, setCompileTimeout] = useState(null);
  const [currentFileId, setCurrentFileId] = useState(null);
  const [currentFileName, setCurrentFileName] = useState("");
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState(null);

  // Chat and suggestion state
  const { isChatOpen, openChat, closeChat, toggleChat } = useChat();
  const [activeSuggestion, setActiveSuggestion] = useState(null);
  const [chatFileList, setChatFileList] = useState([]);

  // File tree specific state
  const [expandedFolders, setExpandedFolders] = useState({});
  const [isDragging, setIsDragging] = useState(null);
  const [dragOverTarget, setDragOverTarget] = useState(null);
  const [fileContextMenu, setFileContextMenu] = useState(null);

  // Determine if the current file is an image
  const isImageView = currentFileName && isImageFile(currentFileName);

  // State and refs for resizing
  const [sidebarWidth, setSidebarWidth] = useState(250);
  const [editorRatio, setEditorRatio] = useState(0.5); // Editor takes 50% of available space in split mode
  const containerRef = useRef(null);
  const contentRef = useRef(null);
  const isResizingSidebar = useRef(false);
  const isResizingEditor = useRef(false);
  const resizeStartX = useRef(0);
  const initialSidebarWidth = useRef(0);

  const editorRef = useRef(null);
  const saveButtonRef = useRef(null);
  const compileButtonRef = useRef(null);
  const contextMenuRef = useRef(null);
  const fileInputRef = useRef(null);
  const dragNode = useRef(null);
  const dragOverNode = useRef(null);

  // Add performance styles
  useEffect(() => {
    const styleElement = document.createElement('style');
    styleElement.textContent = performanceStyles;
    document.head.appendChild(styleElement);

    return () => {
      document.head.removeChild(styleElement);
    };
  }, []);

  // Set up keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Save shortcut (Ctrl+S)
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (!isSaved && currentFileId) {
          saveButtonRef.current?.click();
        }
      }

      // Compile shortcut (Ctrl+Enter)
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        if (currentFileId) {
          compileButtonRef.current?.click();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isSaved, currentFileId]);

  // Handle auto-compilation
  useEffect(() => {
    if (!autoCompile || isSaved || !currentFileId) return;

    // Clear previous timeout
    if (compileTimeout) {
      clearTimeout(compileTimeout);
    }

    // Set a new timeout to compile after typing stops
    const timeout = setTimeout(() => {
      handleCompile();
    }, 2000); // 2 second delay

    setCompileTimeout(timeout);

    // Cleanup
    return () => {
      if (compileTimeout) clearTimeout(compileTimeout);
    };
  }, [code, autoCompile, isSaved, currentFileId]);

  // Process files for chat mentions
  useEffect(() => {
    // Convert files to a format suitable for chat file references
    const formatFilesForChat = () => {
      return files.filter(f => !f.deleted).map(file => ({
        id: file.id,
        name: file._name_ || file.name || 'Untitled',
        type: file.type || 'file'
      }));
    };

    setChatFileList(formatFilesForChat());
  }, [files]);

  // Load project data
  useEffect(() => {
    if (!projectId || !userId) {
      setError("Missing project ID or user ID");
      setLoading(false);
      return;
    }

    const fetchProjectData = async () => {
      try {
        setLoading(true);

        // Authenticate with Firebase
        await authenticateWithFirebase(userId);

        // Get project details
        const projectRef = doc(db, "projects", projectId);
        const projectDoc = await getDoc(projectRef);

        if (!projectDoc.exists()) {
          throw new Error("Project not found");
        }

        const project = {
          id: projectDoc.id,
          ...projectDoc.data()
        };

        setProjectData(project);

        // Fetch project files
        await refreshFiles();

        setLoading(false);
      } catch (error) {
        console.error("Error fetching project data:", error);
        setError(error instanceof Error ? error.message : "An error occurred");
        setLoading(false);
      }
    };

    fetchProjectData();
  }, [projectId, userId]);

  // Setup global event listeners for resizing
  useEffect(() => {
    const handleMouseMove = (e) => {
      if (isResizingSidebar.current && containerRef.current) {
        // Resize sidebar
        const containerRect = containerRef.current.getBoundingClientRect();
        const newWidth = e.clientX - containerRect.left;
        const constrainedWidth = Math.max(180, Math.min(400, newWidth));
        setSidebarWidth(constrainedWidth);
      } else if (isResizingEditor.current && contentRef.current) {
        // Resize editor/preview split
        const containerRect = contentRef.current.getBoundingClientRect();
        const containerWidth = containerRect.width;
        const offsetX = e.clientX - containerRect.left;
        const newRatio = Math.max(0.2, Math.min(0.8, offsetX / containerWidth));
        setEditorRatio(newRatio);
      }
    };

    const handleMouseUp = () => {
      if (isResizingSidebar.current || isResizingEditor.current) {
        isResizingSidebar.current = false;
        isResizingEditor.current = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        document.body.classList.remove('resizing');
      }
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  // Handle sidebar resize start
  const startSidebarResize = (e) => {
    e.preventDefault();
    isResizingSidebar.current = true;
    resizeStartX.current = e.clientX;
    initialSidebarWidth.current = sidebarWidth;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.body.classList.add('resizing');
  };

  const startEditProjectName = () => {
    setEditedProjectName(projectData?.title || "Untitled Project");
    setIsEditingProjectName(true);
  };

  const cancelEditProjectName = () => {
    setIsEditingProjectName(false);
  };

  const handleSaveProjectName = async () => {
    if (!editedProjectName.trim() || !projectId) {
      setIsEditingProjectName(false);
      return;
    }

    try {
      // Update the project title in Firestore
      const projectRef = doc(db, "projects", projectId);
      await updateDoc(projectRef, {
        title: editedProjectName.trim(),
        lastModified: serverTimestamp()
      });

      // Update local state
      setProjectData(prev => ({
        ...prev,
        title: editedProjectName.trim()
      }));

      setIsEditingProjectName(false);
      showNotification("Project name updated successfully");
    } catch (error) {
      console.error("Error updating project name:", error);
      showNotification("Failed to update project name", "error");
      setIsEditingProjectName(false);
    }
  };

  // Handle editor-preview split resize start
  const startEditorResize = (e) => {
    e.preventDefault();
    isResizingEditor.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.body.classList.add('resizing');
  };

  // Helper function to build file tree
  const buildFileTree = (files) => {
    const tree = [];
    const itemMap = new Map();

    // First create all items
    files.forEach(file => {
      // Skip deleted files
      if (file.deleted === true) {
        return;
      }

      const item = {
        id: file.id,
        name: file._name_ || file.name || 'Untitled',
        type: file.type || 'file',
        parentId: file.parentId,
        content: file.content,
        children: file.type === 'folder' ? [] : undefined
      };
      itemMap.set(file.id, item);
    });

    // Then build the tree structure
    files.forEach(file => {
      // Skip deleted files
      if (file.deleted === true) {
        return;
      }

      const item = itemMap.get(file.id);
      if (item) {
        if (!file.parentId) {
          // Root item
          tree.push(item);
        } else {
          // Child item
          const parent = itemMap.get(file.parentId);
          if (parent && parent.children) {
            parent.children.push(item);
          } else if (!parent) {
            // If parent is not found, add as root item
            tree.push(item);
          }
        }
      }
    });

    // Sort the tree - folders first, then alphabetically
    const sortItems = (items) => {
      return items.sort((a, b) => {
        if (a.type !== b.type) {
          return a.type === 'folder' ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
      });
    };

    const sortTree = (items) => {
      sortItems(items);
      items.forEach(item => {
        if (item.children) {
          sortTree(item.children);
        }
      });
    };

    sortTree(tree);
    return tree;
  };

  // Refresh files list
  const refreshFiles = async () => {
    try {
      // Use only projectId filter to avoid index issues
      const filesQuery = query(
        collection(db, "projectFiles"),
        where("projectId", "==", projectId)
      );

      const filesSnapshot = await getDocs(filesQuery);
      const filesList = [];

      filesSnapshot.forEach((doc) => {
        const data = doc.data();
        // Filter out deleted files client-side
        if (data.deleted !== true) {
          filesList.push({
            id: doc.id,
            _name_: data._name_ || data.name || "Untitled",
            name: data._name_ || data.name || "Untitled", // For consistency
            type: data.type || 'file',
            projectId: data.projectId,
            parentId: data.parentId,
            content: data.content || '',
            createdAt: data.createdAt,
            lastModified: data.lastModified || data.updatedAt || serverTimestamp(),
            ...data // Include other fields
          });
        }
      });

      console.log(`Refreshed ${filesList.length} files`);
      setFiles(filesList);

      // If no file is currently selected, try to select one
      if (!currentFileId) {
        selectDefaultFile(filesList);
      }

      return filesList;
    } catch (error) {
      console.error("Error refreshing files:", error);
      showNotification("Failed to load project files", "error");
      return [];
    }
  };

  // Helper to select a default file
  const selectDefaultFile = (filesList) => {
    // Get project details to check for last compiled file
    const projectRef = doc(db, "projects", projectId);
    getDoc(projectRef).then(projectDoc => {
      if (projectDoc.exists()) {
        const projectData = projectDoc.data();

        // First priority: Check if there's a last compiled file
        if (projectData?.lastCompiledFileId) {
          const lastCompiledFile = filesList.find(f => f.id === projectData.lastCompiledFileId);
          if (lastCompiledFile) {
            setCurrentFileId(lastCompiledFile.id);
            setCurrentFileName(lastCompiledFile._name_ || lastCompiledFile.name || '');
            setCode(lastCompiledFile.content || '');
            return;
          }
        }

        // Second priority: Find main.tex
        const mainFile = filesList.find(f =>
          (f._name_ === 'main.tex' || f.name === 'main.tex') && f.type === 'file'
        );
        if (mainFile) {
          setCurrentFileId(mainFile.id);
          setCurrentFileName(mainFile._name_ || mainFile.name || '');
          setCode(mainFile.content || '');
          return;
        }

        // Third priority: Find any .tex file
        const anyTexFile = filesList.find(f =>
          ((f._name_?.toLowerCase() || f.name?.toLowerCase() || '').endsWith('.tex')) &&
          f.type === 'file'
        );
        if (anyTexFile) {
          setCurrentFileId(anyTexFile.id);
          setCurrentFileName(anyTexFile._name_ || anyTexFile.name || '');
          setCode(anyTexFile.content || '');
        }
      }
    }).catch(error => {
      console.error("Error getting project data:", error);
    });
  };

  // Handle code changes
  const handleCodeChange = (value) => {
    setCode(value);
    setIsSaved(false);
  };

  // Handle file selection
  const handleFileSelect = async (fileId) => {
    if (fileId === currentFileId) return;

    // If there are unsaved changes in the current file, prompt the user
    if (!isSaved && currentFileId) {
      if (window.confirm("You have unsaved changes. Do you want to save them before switching files?")) {
        await handleSave();
      }
    }

    try {
      console.log(`Selecting file: ${fileId}`);

      // Try both collection names for consistency
      let fileData = null;
      let foundDoc = false;

      // Try projectFiles first
      try {
        const fileRef = doc(db, "projectFiles", fileId);
        const fileDoc = await getDoc(fileRef);
        if (fileDoc.exists()) {
          fileData = fileDoc.data();
          foundDoc = true;
          console.log(`Found file in projectFiles collection`);
        }
      } catch (err) {
        console.log("Document not found in projectFiles");
      }

      // If not found, try project_files
      if (!foundDoc) {
        try {
          const fileRef = doc(db, "project_files", fileId);
          const fileDoc = await getDoc(fileRef);
          if (fileDoc.exists()) {
            fileData = fileDoc.data();
            foundDoc = true;
            console.log(`Found file in project_files collection`);
          }
        } catch (err) {
          console.log("Document not found in project_files");
        }
      }

      if (foundDoc && fileData) {
        setCurrentFileId(fileId);
        // Handle different field names for the filename
        const fileName = fileData._name_ || fileData.name || "Untitled";
        setCurrentFileName(fileName);

        // Check if it's an image file
        if (isImageFile(fileName)) {
          console.log("Selected an image file:", fileName);
          // For image files, set an empty code as we'll show the ImagePreview component
          setCode("");
          // Set view mode to ensure ImagePreview is visible
          if (viewMode === "code") {
            setViewMode("split");
          }
        } else {
          // For non-image files, set the content
          setCode(fileData.content || "");
        }

        setIsSaved(true);

        // For .tex files, save as last opened file for this project
        if (fileName.toLowerCase().endsWith('.tex')) {
          try {
            // Update the project with current file as last opened
            const projectRef = doc(db, "projects", projectId);
            await updateDoc(projectRef, {
              lastOpenedFileId: fileId,
              lastModified: serverTimestamp()
            });
          } catch (updateError) {
            console.error("Error updating last opened file:", updateError);
          }
        }
      } else {
        console.error("File not found:", fileId);
        showNotification("File not found", "error");
      }
    } catch (error) {
      console.error("Error loading file:", error);
      showNotification("Failed to load file", "error");
    }
  };

  // Create a new file
  const handleCreateFile = async (parentId = null) => {
    const fileName = prompt("Enter file name:");
    if (!fileName) return;

    try {
      const fileData = {
        _name_: fileName,
        name: fileName, // For consistency
        type: 'file',
        projectId: projectId,
        parentId: parentId,
        ownerId: userId,
        content: '',
        createdAt: serverTimestamp(),
        lastModified: serverTimestamp()
      };

      const docRef = await addDoc(collection(db, "projectFiles"), fileData);

      await refreshFiles();
      showNotification(`File "${fileName}" created`);

      // Select the new file
      handleFileSelect(docRef.id);
    } catch (error) {
      console.error("Error creating file:", error);
      showNotification("Failed to create file", "error");
    }
  };

  // Create a new folder
  const handleCreateFolder = async (parentId = null) => {
    const folderName = prompt("Enter folder name:");
    if (!folderName) return;

    try {
      const folderData = {
        _name_: folderName,
        name: folderName, // For consistency
        type: 'folder',
        projectId: projectId,
        parentId: parentId,
        ownerId: userId,
        createdAt: serverTimestamp(),
        lastModified: serverTimestamp()
      };

      await addDoc(collection(db, "projectFiles"), folderData);

      await refreshFiles();
      showNotification(`Folder "${folderName}" created`);
    } catch (error) {
      console.error("Error creating folder:", error);
      showNotification("Failed to create folder", "error");
    }
  };

  // Delete file or folder
  const handleDeleteItem = async (itemId) => {
    const item = files.find(f => f.id === itemId);
    if (!item) return;

    if (!window.confirm(`Are you sure you want to delete this ${item.type}?`)) {
      return;
    }

    try {
      // If it's the current file, clear selection
      if (currentFileId === itemId) {
        setCurrentFileId(null);
        setCurrentFileName('');
        setCode('');
      }

      // Mark as deleted rather than actually deleting
      const itemRef = doc(db, "projectFiles", itemId);
      await updateDoc(itemRef, {
        deleted: true,
        lastModified: serverTimestamp()
      });

      await refreshFiles();
      showNotification(`Item deleted`);
    } catch (error) {
      console.error(`Error deleting item:`, error);
      showNotification(`Failed to delete item`, "error");
    }
  };

  // Move file or folder
  const moveFile = async (fileId, newParentId) => {
    try {
      // Get the file being moved
      const fileToMove = files.find(f => f.id === fileId);
      if (!fileToMove) {
        console.error('File not found:', fileId);
        return;
      }

      // Don't do anything if parent hasn't changed
      if (fileToMove.parentId === newParentId) {
        return;
      }

      // Check that we're not creating a circular reference
      if (fileToMove.type === 'folder' && newParentId !== null) {
        // Check if newParentId is a descendant of fileId
        const isDescendant = (parentId, potentialDescendantId) => {
          if (parentId === potentialDescendantId) return true;

          const descendants = files.filter(f => f.parentId === parentId);
          return descendants.some(d => d.type === 'folder' && isDescendant(d.id, potentialDescendantId));
        };

        if (isDescendant(fileId, newParentId)) {
          showNotification('Cannot move a folder inside itself', 'error');
          return;
        }
      }

      // Update the file's parent in Firestore
      const fileRef = doc(db, "projectFiles", fileId);
      await updateDoc(fileRef, {
        parentId: newParentId,
        lastModified: serverTimestamp()
      });

      // Expand the target folder automatically
      if (newParentId !== null) {
        setExpandedFolders(prev => ({
          ...prev,
          [newParentId]: true
        }));
      }

      // Refresh files to show the updated structure
      await refreshFiles();

      showNotification('File moved successfully');
    } catch (error) {
      console.error('Error moving file:', error);
      showNotification('Failed to move file', 'error');
    }
  };

  // Toggle folder expand/collapse
  const toggleFolder = (folderId, e) => {
    if (e) {
      e.stopPropagation();
    }

    setExpandedFolders(prev => ({
      ...prev,
      [folderId]: !prev[folderId]
    }));
  };

  // Context menu handlers
  const handleContextMenu = (event, itemId) => {
    event.preventDefault();
    event.stopPropagation();
    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      itemId
    });
  };

  // Close context menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(event.target)) {
        setContextMenu(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Drag and drop handlers
  const handleDragStart = (e, fileId) => {
    e.stopPropagation();
    // Set the data to be transferred
    e.dataTransfer.setData('text/plain', fileId);
    // Set drag effect
    e.dataTransfer.effectAllowed = 'move';
    // Set visual feedback
    setIsDragging(fileId);
    dragNode.current = e.currentTarget;

    // Add visual styling to dragged element
    setTimeout(() => {
      if (dragNode.current) {
        dragNode.current.style.opacity = '0.4';
      }
    }, 0);
  };

  const handleDragOver = (e, fileId, isFolder) => {
    e.preventDefault();
    e.stopPropagation();

    // Only allow drop on folders or top level
    if (isFolder || fileId === 'root') {
      e.dataTransfer.dropEffect = 'move';
      setDragOverTarget(fileId);
      dragOverNode.current = e.currentTarget;
    } else {
      e.dataTransfer.dropEffect = 'none';
    }
  };

  const handleDragEnter = (e, fileId, isFolder) => {
    e.preventDefault();
    e.stopPropagation();

    // Visual feedback for valid drop targets
    if (isFolder || fileId === 'root') {
      setDragOverTarget(fileId);
      dragOverNode.current = e.currentTarget;

      // Add highlighting to drop target
      e.currentTarget.classList.add('drag-over');
    }
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();

    // Remove highlighting when leaving potential drop target
    e.currentTarget.classList.remove('drag-over');

    // Only clear if we're leaving this specific target (not its children)
    if (e.currentTarget === dragOverNode.current) {
      setDragOverTarget(null);
      dragOverNode.current = null;
    }
  };

  const handleDragEnd = (e) => {
    e.stopPropagation();

    // Reset drag state
    setIsDragging(null);
    setDragOverTarget(null);

    // Clear styles
    if (dragNode.current) {
      dragNode.current.style.opacity = '1';
      dragNode.current = null;
    }

    // Remove drag-over class from all elements
    document.querySelectorAll('.drag-over').forEach(el => {
      el.classList.remove('drag-over');
    });
  };

  // Handle the actual drop
  const handleDrop = async (e, targetId, isFolder) => {
    e.preventDefault();
    e.stopPropagation();

    // Clear visual feedback
    setIsDragging(null);
    setDragOverTarget(null);

    if (dragNode.current) {
      dragNode.current.style.opacity = '1';
      dragNode.current = null;
    }

    // Remove drag-over class from all elements
    document.querySelectorAll('.drag-over').forEach(el => {
      el.classList.remove('drag-over');
    });

    // Get the dragged item id
    const draggedItemId = e.dataTransfer.getData('text/plain');
    if (!draggedItemId) return;

    // Don't do anything if dropping onto itself
    if (draggedItemId === targetId) {
      return;
    }

    // Check if targetId is a valid folder (or root)
    if (targetId === 'root' || (isFolder && targetId)) {
      // Move the file
      await moveFile(draggedItemId, targetId === 'root' ? null : targetId);
    }
  };

  // Handle file upload
  const handleFileUpload = async (event) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    try {
      setIsUploadModalOpen(false);

      for (let i = 0; i < files.length; i++) {
        const file = files[i];

        // For text files (like .tex, .bib, etc.), read content and store directly
        if (
          file.type === 'text/plain' ||
          file.name.endsWith('.tex') ||
          file.name.endsWith('.bib') ||
          file.name.endsWith('.cls')
        ) {
          const content = await readFileAsText(file);

          // Add file to Firestore
          await addDoc(collection(db, "projectFiles"), {
            _name_: file.name,
            name: file.name, // For consistency
            type: 'file',
            projectId: projectId,
            parentId: null,
            ownerId: userId,
            content: content,
            createdAt: serverTimestamp(),
            lastModified: serverTimestamp()
          });
        }
        // For binary files (images, etc.)
        else {
          // For images, store as data URL
          if (file.type.startsWith('image/')) {
            const dataUrl = await readFileAsDataURL(file);

            await addDoc(collection(db, "projectFiles"), {
              _name_: file.name,
              name: file.name, // For consistency
              type: 'file',
              fileType: 'image',
              projectId: projectId,
              parentId: null,
              ownerId: userId,
              content: dataUrl,
              createdAt: serverTimestamp(),
              lastModified: serverTimestamp()
            });
          } else {
            // For other files, try to store in Storage
            // Create a reference to Storage
            const storageRef = ref(storage, `projects/${projectId}/files/${file.name}`);

            // Upload the file
            await uploadBytes(storageRef, file);

            // Get the download URL
            const downloadURL = await getDownloadURL(storageRef);

            // Add file metadata to Firestore
            await addDoc(collection(db, "projectFiles"), {
              _name_: file.name,
              name: file.name, // For consistency
              type: 'file',
              fileType: 'binary',
              projectId: projectId,
              parentId: null,
              ownerId: userId,
              downloadURL: downloadURL,
              createdAt: serverTimestamp(),
              lastModified: serverTimestamp()
            });
          }
        }
      }

      showNotification(`${files.length} files uploaded successfully`);
      await refreshFiles();
    } catch (error) {
      console.error("Error uploading files:", error);
      showNotification("Failed to upload files", "error");
    }
  };

  // Handle file upload for chat
  const handleChatFileUpload = async (file: File): Promise<string> => {
    try {
      let fileUrl = '';
      const isImage = file.type.startsWith('image/');

      // Create a unique filename to avoid collisions
      const timestamp = Date.now();
      const safeFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
      const uniqueFileName = `${timestamp}_${safeFileName}`;

      console.log(`Uploading file: ${uniqueFileName}`);

      // Reference to the file location in Firebase Storage
      const storageRef = ref(storage, `chats/${projectId}/${uniqueFileName}`);

      // For small images, consider direct Firestore upload instead of Storage
      if (isImage && file.size < 500000) { // Less than 500KB
        try {
          // Read image as data URL
          const dataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });

          // Create document in Firestore with the data URL
          const docRef = await addDoc(collection(db, "chatAttachments"), {
            projectId,
            fileName: file.name,
            contentType: file.type,
            size: file.size,
            dataUrl,
            createdAt: serverTimestamp(),
            userId
          });

          // Generate a URL that can be used to reference this attachment
          fileUrl = `chat-attachment:${docRef.id}`;
          console.log(`Uploaded small image directly to Firestore: ${fileUrl}`);

          return fileUrl;
        } catch (error) {
          console.error("Error uploading small image to Firestore:", error);
          // Fall back to regular storage upload
        }
      }

      // Upload to Firebase Storage with proper error handling
      try {
        // Upload the file to Firebase Storage
        const snapshot = await uploadBytes(storageRef, file);
        console.log(`Uploaded file to Firebase Storage: ${snapshot.ref.fullPath}`);

        // Get the download URL
        fileUrl = await getDownloadURL(snapshot.ref);
        console.log(`Generated download URL: ${fileUrl}`);

        return fileUrl;
      } catch (storageError) {
        console.error("Firebase Storage upload error:", storageError);

        // Provide better error reporting
        if (storageError.message && storageError.message.includes('CORS')) {
          throw new Error("CORS error: Firebase Storage is not configured to accept uploads from this origin. Please check your Firebase Storage CORS configuration.");
        }

        throw storageError;
      }
    } catch (error) {
      console.error("Error in file upload:", error);
      throw error;
    }
  };


  // Handle applying a suggestion from chat
  const safelyApplyEditorChanges = (
    editorRef: React.RefObject<any>,
    suggestion: string,
    range?: { start: number, end: number }
  ): boolean => {
    if (!editorRef.current) {
      console.error("Editor reference is not available");
      return false;
    }

    try {
      let state = editorRef.current.state;

      // If state isn't available, the editor might not be initialized properly
      if (!state) {
        console.error("Editor state is not available");
        return false;
      }

      let docLength = state.doc?.toString().length || 0;

      // Determine where to insert
      let from = range?.start || 0;
      let to = range?.end || from;

      // Ensure bounds are valid
      from = Math.max(0, Math.min(from, docLength));
      to = Math.max(from, Math.min(to, docLength));

      // Check what API is available and use the appropriate method
      if (editorRef.current.dispatch && state.update) {
        // CodeMirror 6 style
        let transaction = state.update({
          changes: {
            from,
            to,
            insert: suggestion
          }
        });

        editorRef.current.dispatch(transaction);
        return true;
      }
      else if (editorRef.current.replaceRange) {
        // CodeMirror 5 style
        editorRef.current.replaceRange(
          suggestion,
          editorRef.current.posFromIndex(from),
          editorRef.current.posFromIndex(to)
        );
        return true;
      }
      else if (typeof editorRef.current.setValue === 'function') {
        // Simple editor with setValue method
        // This is less precise but at least applies the change
        editorRef.current.setValue(suggestion);
        return true;
      }
      else {
        console.error("No suitable method found to update editor content");
        return false;
      }
    } catch (error) {
      console.error("Error applying editor changes:", error);
      return false;
    }
  };

  const handleApplySuggestion = (suggestion: string, range?: { start: number; end: number }, fileId?: string) => {
    // If suggestion is for a different file, switch to that file first
    if (fileId && fileId !== currentFileId) {
      handleFileSelect(fileId).then(() => {
        // Store the suggestion to apply after file is loaded
        setActiveSuggestion({
          text: suggestion,
          range,
          fileId
        });
      });
      return;
    }

    // For current file, apply directly
    if (suggestion && editorRef.current) {
      try {
        // Access the editor instance from the wrapper
        const success = safelyApplyEditorChanges(editorRef, suggestion, range);

        if (success) {
          // Clear active suggestion
          setActiveSuggestion(null);

          // Mark as unsaved
          setIsSaved(false);

          showNotification('Suggestion applied successfully');
        } else {
          // If direct editor manipulation failed, fallback to updating the code state
          console.log("Direct editor update failed, using state update fallback");

          // Update the code state directly
          let newCode = code;
          if (range) {
            const start = Math.max(0, Math.min(range.start, code.length));
            const end = Math.max(start, Math.min(range.end, code.length));
            newCode = code.substring(0, start) + suggestion + code.substring(end);
          } else {
            newCode = suggestion;
          }

          // Update state
          setCode(newCode);
          setIsSaved(false);
          setActiveSuggestion(null);
          showNotification('Suggestion applied successfully');
        }
      } catch (error) {
        console.error("Error applying suggestion:", error);
        showNotification('Failed to apply suggestion', 'error');
      }
    }
  };


  useEffect(() => {
    // If we have an active suggestion and the editor is available, apply it
    if (activeSuggestion?.text && editorRef.current) {
      const { text, range } = activeSuggestion;

      // Apply with a slight delay to ensure editor is fully initialized
      const timer = setTimeout(() => {
        const success = safelyApplyEditorChanges(editorRef, text, range);

        if (success) {
          setActiveSuggestion(null);
          setIsSaved(false);
          showNotification('Suggestion applied successfully');
        }
      }, 100);

      return () => clearTimeout(timer);
    }
  }, [editorRef.current, activeSuggestion]);




  // Helper function to read file as text
  const readFileAsText = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (reader.result) {
          resolve(reader.result);
        } else {
          reject(new Error("Failed to read file"));
        }
      };
      reader.onerror = (error) => reject(error);
      reader.readAsText(file);
    });
  };

  // Helper function to read file as data URL
  const readFileAsDataURL = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (reader.result) {
          resolve(reader.result);
        } else {
          reject(new Error("Failed to read file"));
        }
      };
      reader.onerror = (error) => reject(error);
      reader.readAsDataURL(file);
    });
  };

  // Save current file
  const handleSave = async () => {
    if (!currentFileId) {
      showNotification("No file selected to save", "error");
      return false;
    }

    try {
      // First check if the document exists
      let fileRef;
      let documentExists = false;

      try {
        // Try projectFiles collection first
        fileRef = doc(db, "projectFiles", currentFileId);
        const docSnap = await getDoc(fileRef);

        if (docSnap.exists()) {
          documentExists = true;
        } else {
          // Try project_files collection as fallback
          fileRef = doc(db, "project_files", currentFileId);
          const altDocSnap = await getDoc(fileRef);

          if (altDocSnap.exists()) {
            documentExists = true;
          }
        }
      } catch (checkError) {
        console.error("Error checking document existence:", checkError);
      }

      if (!documentExists) {
        // If document doesn't exist, create it instead of updating
        console.log("Document doesn't exist, creating new document");

        const newFileData = {
          _name_: currentFileName,
          name: currentFileName, // For consistency
          type: 'file',
          projectId: projectId,
          parentId: null,
          ownerId: userId,
          content: code,
          createdAt: serverTimestamp(),
          lastModified: serverTimestamp()
        };

        // Try to create in projectFiles collection
        try {
          await addDoc(collection(db, "projectFiles"), newFileData);
          setIsSaved(true);
          showNotification("File created successfully");

          // Refresh files list to get the new file ID
          await refreshFiles();
          return true;
        } catch (createError) {
          console.error("Error creating document:", createError);
          throw new Error("Failed to create document");
        }
      } else {
        // Document exists, proceed with update
        try {
          // Update the document
          await updateDoc(fileRef, {
            content: code,
            lastModified: serverTimestamp()
          });

          // Update project's lastModified timestamp
          try {
            const projectRef = doc(db, "projects", projectId);
            await updateDoc(projectRef, {
              lastModified: serverTimestamp()
            });
          } catch (projectUpdateError) {
            console.warn("Could not update project timestamp:", projectUpdateError);
            // Continue even if this fails
          }

          setIsSaved(true);
          showNotification("File saved successfully");
          return true;
        } catch (updateError) {
          console.error("Error updating document:", updateError);
          throw new Error("Failed to update document");
        }
      }
    } catch (error) {
      console.error("Error saving document:", error);
      showNotification(`Failed to save document: ${error instanceof Error ? error.message : "Unknown error"}`, "error");
      return false;
    }
  };

  // Compile LaTeX
  const handleCompile = async () => {
    if (isCompiling) return;

    // If no file is selected, can't compile
    if (!currentFileId) {
      showNotification("Please select a file to compile", "error");
      return;
    }

    // Check if the current file is a .tex file
    if (!currentFileName.toLowerCase().endsWith('.tex')) {
      showNotification("Only .tex files can be compiled", "error");
      return;
    }

    setIsCompiling(true);
    setCompilationError(null);
    setHtmlPreview(null);

    try {
      // Save current changes first
      if (!isSaved) {
        await handleSave();
      }

      // Compile the document - pass projectId for image handling
      const result = await compileLatex(code, projectId);

      if (result.success) {
        if (result.pdfData) {
          setPdfData(result.pdfData);
          setHtmlPreview(result.htmlPreview || null);
          setCompilationError(null);

          // Switch to PDF view if we're currently in code-only view
          if (viewMode === "code") {
            setViewMode("split");
          }

          showNotification("Compilation successful");
        } else if (result.htmlPreview) {
          setHtmlPreview(result.htmlPreview);
          setPdfData(null);
          setCompilationError(null);
          showNotification("Preview generated successfully");
        } else {
          setCompilationError("No content returned from compilation");
          showNotification("Compilation failed: No output generated", "error");
        }
      } else {
        console.error("Compilation failed:", result.error);
        setCompilationError(result.error || "Unknown compilation error");
        setPdfData(null);
        setHtmlPreview(null);
        showNotification("Compilation failed", "error");
      }
    } catch (error) {
      console.error("Error compiling LaTeX:", error);
      setCompilationError(
        error instanceof Error ? error.message : "Unknown compilation error"
      );
      setPdfData(null);
      setHtmlPreview(null);
      showNotification("Compilation failed", "error");
    } finally {
      setIsCompiling(false);
    }
  };

  // Download PDF
  const handleDownloadPdf = () => {
    if (!pdfData) {
      // If no compiled PDF, compile it first
      if (!isCompiling) {
        handleCompile().then(() => {
          if (pdfData) {
            triggerPdfDownload();
          }
        });
      }
      return;
    }

    triggerPdfDownload();
  };

  // Helper function to trigger the actual download
  const triggerPdfDownload = () => {
    if (typeof pdfData === 'string' && pdfData.startsWith('data:application/pdf')) {
      // Create temporary link
      const link = document.createElement('a');
      link.href = pdfData;
      link.download = `${currentFileName.replace('.tex', '') || "document"}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      showNotification(`PDF downloaded successfully`);
    } else if (pdfData instanceof ArrayBuffer) {
      // Handle ArrayBuffer data
      const blob = new Blob([pdfData], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);

      const link = document.createElement('a');
      link.href = url;
      link.download = `${currentFileName.replace('.tex', '') || "document"}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // Clean up the URL
      setTimeout(() => URL.revokeObjectURL(url), 100);

      showNotification(`PDF downloaded successfully`);
    } else {
      showNotification("Could not download PDF - try compiling first", "error");
    }
  };

  // Helper function to show notifications
  const showNotification = (message, type = "success") => {
    const notification = document.createElement('div');
    notification.className = `fixed bottom-4 right-4 px-4 py-2 rounded-md shadow-lg z-50 ${type === "success" ? "bg-green-600 text-white" :
      type === "error" ? "bg-red-600 text-white" :
        "bg-blue-600 text-white"
      }`;
    notification.textContent = message;
    document.body.appendChild(notification);

    setTimeout(() => {
      if (document.body.contains(notification)) {
        document.body.removeChild(notification);
      }
    }, 3000);
  };

  // Toggle sidebar visibility
  const toggleSidebar = () => {
    setIsSidebarCollapsed(!isSidebarCollapsed);
  };

  // File tree rendering function
  const renderFileTree = () => {
    // Convert the flat file list to a tree structure
    const treeData = buildFileTree(files);

    // Recursive function to render a tree item and its children
    const renderTreeItem = (item, depth = 0) => {
      const isExpanded = expandedFolders[item.id] || false;
      const isFolder = item.type === 'folder';
      const isActive = item.id === currentFileId;
      const isDraggingThis = isDragging === item.id;
      const isDragTarget = dragOverTarget === item.id;

      return (
        <div key={item.id} style={{ marginLeft: `${depth * 16}px` }}>
          <div
            className={`file-tree-item ${isFolder ? 'folder-item' : 'file-item'} flex items-center py-1.5 px-2 my-0.5 rounded cursor-pointer hover:bg-gray-700 transition-colors group ${isActive ? 'bg-gray-700 text-white' : 'text-gray-300'
              } ${isDraggingThis ? 'dragging' : ''} ${isDragTarget ? 'drag-over' : ''}`}
            onClick={isFolder ? () => toggleFolder(item.id) : () => handleFileSelect(item.id)}
            draggable
            onDragStart={(e) => handleDragStart(e, item.id)}
            onDragOver={(e) => handleDragOver(e, item.id, isFolder)}
            onDragEnter={(e) => handleDragEnter(e, item.id, isFolder)}
            onDragLeave={handleDragLeave}
            onDragEnd={handleDragEnd}
            onDrop={(e) => handleDrop(e, item.id, isFolder)}
            onContextMenu={(e) => handleContextMenu(e, item.id)}
          >
            {/* Folder icon or chevron */}
            {isFolder ? (
              <span onClick={(e) => { e.stopPropagation(); toggleFolder(item.id); }}>
                {isExpanded ? (
                  <ChevronDown className="h-3.5 w-3.5 text-gray-400 mr-1.5" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5 text-gray-400 mr-1.5" />
                )}
              </span>
            ) : (
              <div className="w-3.5 mr-1.5"></div>
            )}

            {/* Item icon */}
            {isFolder ? (
              isExpanded ? (
                <FolderOpen className="h-4 w-4 mr-2 text-blue-400" />
              ) : (
                <Folder className="h-4 w-4 mr-2 text-blue-400" />
              )
            ) : (
              getFileIcon(item.name)
            )}

            {/* Item name */}
            <span className="ml-1 text-sm truncate flex-1">
              {item.name}
            </span>

            {/* Actions */}
            <div className={`${isFolder ? 'folder-actions' : 'file-actions'} ml-auto opacity-0 group-hover:opacity-100 flex items-center space-x-1`}>
              {isFolder && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleCreateFile(item.id);
                  }}
                  className="p-1 hover:bg-gray-600 rounded"
                  title="Add File"
                >
                  <Plus className="h-3.5 w-3.5 text-gray-400" />
                </button>
              )}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleContextMenu(e, item.id);
                }}
                className="p-1 hover:bg-gray-600 rounded"
              >
                <MoreVertical className="h-3.5 w-3.5 text-gray-400" />
              </button>
            </div>
          </div>

          {/* Render children if folder is expanded */}
          {isFolder && isExpanded && item.children && item.children.length > 0 && (
            <div className="ml-2">
              {item.children.map(child => renderTreeItem(child, depth + 1))}
            </div>
          )}

          {/* Show empty folder message */}
          {isFolder && isExpanded && (!item.children || item.children.length === 0) && (
            <div className="pl-8 py-1 text-gray-500 text-xs italic ml-4">
              Empty folder
            </div>
          )}
        </div>
      );
    };

    return (
      <div
        className="h-full overflow-auto px-2 py-2"
        onDragOver={(e) => handleDragOver(e, 'root', true)}
        onDragEnter={(e) => handleDragEnter(e, 'root', true)}
        onDragLeave={handleDragLeave}
        onDrop={(e) => handleDrop(e, 'root', true)}
      >
        {files.length === 0 ? (
          <div className="text-center py-6">
            <p className="text-gray-400 mb-2">No files yet</p>
            <p className="text-gray-500 text-sm">
              Drag files here or create a new file
            </p>
          </div>
        ) : (
          treeData.map(item => renderTreeItem(item))
        )}
      </div>
    );
  };

  // Helper to get the appropriate file icon
  const getFileIcon = (filename) => {
    if (!filename) return <FileText className="h-4 w-4 text-gray-400" />;

    const extension = filename.split('.').pop()?.toLowerCase();

    if (extension === 'tex' || extension === 'latex')
      return <FileText className="h-4 w-4 text-amber-400" />;
    if (isImageFile(filename))
      return <FileText className="h-4 w-4 text-purple-400" />;
    if (extension === 'pdf')
      return <FileText className="h-4 w-4 text-red-400" />;
    if (['bib', 'cls', 'sty'].includes(extension || ''))
      return <FileText className="h-4 w-4 text-green-400" />;

    return <FileText className="h-4 w-4 text-gray-400" />;
  };

  // Render loading state
  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-900">
        <div className="flex flex-col items-center">
          <Loader className="h-10 w-10 text-blue-500 animate-spin" />
          <p className="mt-4 text-gray-400">Loading editor...</p>
        </div>
      </div>
    );
  }

  // Render error state
  if (error) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-900">
        <div className="max-w-md p-6 bg-gray-800 rounded-lg shadow-lg text-center">
          <div className="text-red-500 text-5xl mb-4">⚠️</div>
          <h2 className="text-xl font-semibold text-gray-200 mb-2">Error Loading Project</h2>
          <p className="text-gray-400 mb-4">{error}</p>
          <div className="flex flex-col space-y-3">
            <button
              onClick={() => router.push("/dashboard")}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
            >
              Return to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-gray-900 text-gray-100" ref={containerRef}>
      {/* Header - fixed height */}
      <header className="px-4 py-2 bg-gray-800 border-b border-gray-700 flex items-center z-10">
        {/* Left section */}
        <div className="flex items-center w-1/3">
          <button
            className="p-1.5 rounded-md hover:bg-gray-700 mr-3 text-gray-300 focus:outline-none"
            onClick={toggleSidebar}
            title="Toggle Sidebar"
          >
            <Menu className="h-5 w-5" />
          </button>

          <button
            onClick={() => router.push("/dashboard")}
            className="px-3 py-1.5 flex items-center text-sm bg-gray-700 hover:bg-gray-600 rounded-md text-gray-200"
          >
            <ChevronLeft className="h-4 w-4 mr-1.5" />
            Dashboard
          </button>
        </div>

        {/* Center section - Project Title */}
        <div className="flex items-center justify-center w-1/3">
          <EditableProjectName
            projectId={projectId}
            initialTitle={projectData?.title || "Untitled Project"}
            showUnsavedIndicator={!isSaved}
            onTitleChange={(newTitle) => {
              setProjectData(prev => ({
                ...prev,
                title: newTitle
              }));

              // Show notification
              showNotification("Project name updated successfully");
            }}
          />
        </div>

        {/* Right section */}
        <div className="flex items-center justify-end w-1/3 space-x-2">
          {/* Chat button */}
          <HeaderChatButton className="mr-2" />

          {/* View toggle buttons */}
          <div className="hidden md:flex items-center bg-gray-700 rounded-md overflow-hidden border border-gray-600 mr-2">
            <button
              className={`px-3 py-1.5 flex items-center text-sm ${viewMode === "code"
                ? "bg-gray-600 text-white"
                : "text-gray-300 hover:bg-gray-600"
                }`}
              onClick={() => setViewMode("code")}
              title="Editor Only"
            >
              <Edit className="h-4 w-4 mr-1.5" />
              <span className="hidden lg:inline">Code</span>
            </button>
            <button
              className={`px-3 py-1.5 flex items-center text-sm ${viewMode === "split"
                ? "bg-gray-600 text-white"
                : "text-gray-300 hover:bg-gray-600"
                }`}
              onClick={() => setViewMode("split")}
              title="Split View"
            >
              <Layout className="h-4 w-4 mr-1.5" />
              <span className="hidden lg:inline">Split</span>
            </button>
            <button
              className={`px-3 py-1.5 flex items-center text-sm ${viewMode === "pdf"
                ? "bg-gray-600 text-white"
                : "text-gray-300 hover:bg-gray-600"
                }`}
              onClick={() => setViewMode("pdf")}
              title="PDF Preview"
            >
              <Eye className="h-4 w-4 mr-1.5" />
              <span className="hidden lg:inline">PDF</span>
            </button>
          </div>

          {/* Action buttons */}
          <div className="flex items-center space-x-2">
            <button
              ref={saveButtonRef}
              onClick={handleSave}
              disabled={isSaved || !currentFileId}
              className={`flex items-center px-3 py-1.5 rounded-md ${isSaved || !currentFileId
                ? "bg-gray-600 text-gray-400 cursor-not-allowed"
                : "bg-blue-600 hover:bg-blue-700 text-white"
                } text-sm transition-colors`}
              title="Save (Ctrl+S)"
            >
              <Save className="h-4 w-4 mr-1.5" />
              <span className="hidden sm:inline">Save</span>
            </button>

            <button
              ref={compileButtonRef}
              onClick={handleCompile}
              disabled={isCompiling || !currentFileId}
              className={`flex items-center px-3 py-1.5 rounded-md ${isCompiling || !currentFileId
                ? "bg-gray-600 text-gray-300 cursor-not-allowed"
                : "bg-teal-600 hover:bg-teal-700 text-white"
                } text-sm transition-colors`}
              title="Compile (Ctrl+Enter)"
            >
              {isCompiling ? (
                <>
                  <Loader className="h-4 w-4 mr-1.5 animate-spin" />
                  <span className="hidden sm:inline">Compiling...</span>
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 mr-1.5" />
                  <span className="hidden sm:inline">Compile</span>
                </>
              )}
            </button>

            <button
              onClick={handleDownloadPdf}
              disabled={!pdfData}
              className={`flex items-center px-3 py-1.5 rounded-md ${!pdfData
                ? "bg-gray-600 text-gray-400 cursor-not-allowed"
                : "bg-gray-700 hover:bg-gray-600 text-white"
                } text-sm transition-colors`}
              title="Download PDF"
            >
              <Download className="h-4 w-4 mr-1.5" />
              <span className="hidden md:inline">Download</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main content area - flexible height with NO GAPS */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar - with NO right margin/padding */}
        {!isSidebarCollapsed && (
          <ResizablePanel
            direction="horizontal"
            initialSize={sidebarWidth}
            minSize={180}
            maxSize={400}
            onChange={setSidebarWidth}
            className="h-full flex-shrink-0 bg-gray-800 relative flex flex-col"
            resizeFrom="end"
          >
            {/* Sidebar header */}
            <div className="p-2 border-b border-gray-700 bg-gray-800 flex items-center justify-between">
              <h3 className="font-medium text-sm text-gray-300">PROJECT FILES</h3>
              <div className="flex space-x-1">
                <button
                  onClick={() => handleCreateFile(null)}
                  className="p-1 rounded text-gray-400 hover:text-white hover:bg-gray-700"
                  title="New File"
                >
                  <FilePlus className="h-4 w-4" />
                </button>
                <button
                  onClick={() => handleCreateFolder(null)}
                  className="p-1 rounded text-gray-400 hover:text-white hover:bg-gray-700"
                  title="New Folder"
                >
                  <FolderPlus className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setIsUploadModalOpen(true)}
                  className="p-1 rounded text-gray-400 hover:text-white hover:bg-gray-700"
                  title="Upload Files"
                >
                  <Upload className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* File tree */}
            <div className="flex-1 overflow-hidden">
              {renderFileTree()}
            </div>
          </ResizablePanel>
        )}

        {/* Main editor area - Ensure left border is 0 width */}
        <div className="flex-1 overflow-hidden h-full" ref={contentRef}>
          {/* Active suggestion overlay */}
          {activeSuggestion && (
            <div className="absolute inset-0 z-30 bg-black/20 flex items-center justify-center">
              <div className="bg-gray-800 p-6 rounded-lg shadow-xl max-w-xl">
                <SuggestionOverlay
                  suggestion={activeSuggestion}
                  onApply={handleApplySuggestion}
                  onReject={() => setActiveSuggestion(null)}
                  editorRef={editorRef}
                />
              </div>
            </div>
          )}

          {/* Code-only view - Apply specific styling for CodeMirror to fill vertical space */}
          {viewMode === "code" && !isImageView && (
            <div className="w-full h-full bg-gray-900 overflow-hidden">
              <CodeMirror
                ref={(el) => {
                  // Only assign if the ref changed and is not null
                  if (el && el !== editorRef.current) {
                    editorRef.current = el;
                    console.log("Editor reference updated", el);
                  }
                }}
                value={code}
                width="100%"
                height="100%"
                extensions={[
                  StreamLanguage.define(stex),
                  latexTheme,
                  editorSetup
                ]}
                onChange={handleCodeChange}
                theme="dark"
                className="h-full overflow-auto"
                basicSetup={{
                  lineNumbers: true,
                  highlightActiveLineGutter: true,
                  highlightSpecialChars: true,
                  foldGutter: true,
                  drawSelection: true,
                  dropCursor: true,
                  allowMultipleSelections: true,
                  indentOnInput: true,
                  syntaxHighlighting: true,
                  bracketMatching: true,
                  closeBrackets: true,
                  autocompletion: true,
                  rectangularSelection: true,
                  crosshairCursor: true,
                  highlightActiveLine: true,
                  highlightSelectionMatches: true,
                  closeBracketsKeymap: true,
                  searchKeymap: true,
                  foldKeymap: true,
                  completionKeymap: true,
                  lintKeymap: true,
                }}
              />
            </div>
          )}

          {/* Split view (code + preview) */}
          {viewMode === "split" && !isImageView && (
            <div className="flex w-full h-full">
              {/* Editor */}
              <div
                className="h-full relative panel-transition"
                style={{ width: `${editorRatio * 100}%` }}
              >
                <div className="absolute inset-0 overflow-hidden">
                  <CodeMirror
                    ref={editorRef}
                    value={code}
                    width="100%"
                    height="100%"
                    extensions={[
                      StreamLanguage.define(stex),
                      latexTheme,
                      editorSetup
                    ]}
                    onChange={handleCodeChange}
                    theme="dark"
                    className="h-full overflow-auto" // Added overflow-auto
                    basicSetup={{
                      lineNumbers: true,
                      highlightActiveLineGutter: true,
                      highlightSpecialChars: true,
                      foldGutter: true,
                      drawSelection: true,
                      dropCursor: true,
                      allowMultipleSelections: true,
                      indentOnInput: true,
                      syntaxHighlighting: true,
                      bracketMatching: true,
                      closeBrackets: true,
                      autocompletion: true,
                      rectangularSelection: true,
                      crosshairCursor: true,
                      highlightActiveLine: true,
                      highlightSelectionMatches: true,
                      closeBracketsKeymap: true,
                      searchKeymap: true,
                      foldKeymap: true,
                      completionKeymap: true,
                      lintKeymap: true,
                    }}
                  />
                </div>
              </div>

              {/* Resize Handle - fills gap completely */}
              <div
                className="w-2 h-full cursor-col-resize flex items-center justify-center z-10 bg-gray-700 resize-handle"
                onMouseDown={startEditorResize}
              >
                <div className="w-1 h-full bg-gray-700 hover:bg-blue-500 active:bg-blue-600"></div>
              </div>

              {/* Preview - NO left gap */}
              <div
                className="h-full overflow-hidden panel-transition"
                style={{ width: `calc(${(1 - editorRatio) * 100}% - 8px)` }}
              >
                {isCompiling ? (
                  <div className="h-full flex items-center justify-center bg-gray-900">
                    <div className="flex flex-col items-center">
                      <Loader className="h-10 w-10 text-blue-500 animate-spin" />
                      <p className="mt-4 text-gray-400">Compiling LaTeX...</p>
                    </div>
                  </div>
                ) : compilationError ? (
                  <div className="h-full flex items-center justify-center p-4 bg-gray-900">
                    <div className="max-w-lg p-6 bg-gray-800 border border-red-800 rounded-lg">
                      <h3 className="text-lg font-medium text-red-400 mb-2">Compilation Error</h3>
                      <pre className="text-sm text-red-300 whitespace-pre-wrap font-mono bg-gray-900 p-4 rounded border border-red-900 max-h-80 overflow-auto">
                        {compilationError}
                      </pre>
                    </div>
                  </div>
                ) : !pdfData ? (
                  <div className="h-full flex items-center justify-center bg-gray-900">
                    <div className="text-center max-w-md p-6">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 text-gray-700 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      <p className="text-gray-400 text-lg font-medium mb-2">No PDF Preview</p>
                      <p className="text-gray-500 mb-4">Click "Compile" to generate a PDF preview of your LaTeX document.</p>
                      <button
                        onClick={handleCompile}
                        className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                      >
                        Compile Now
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="h-full">
                    <PdfViewer
                      pdfData={pdfData}
                      isLoading={isCompiling}
                      error={compilationError}
                      htmlPreview={htmlPreview || undefined}
                      documentTitle={currentFileName || projectData?.title || "document"}
                      onRecompileRequest={handleCompile}
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* PDF-only view */}
          {viewMode === "pdf" && !isImageView && (
            <div className="w-full h-full">
              {isCompiling ? (
                <div className="h-full flex items-center justify-center bg-gray-900">
                  <div className="flex flex-col items-center">
                    <Loader className="h-10 w-10 text-blue-500 animate-spin" />
                    <p className="mt-4 text-gray-400">Compiling LaTeX...</p>
                  </div>
                </div>
              ) : compilationError ? (
                <div className="h-full flex items-center justify-center p-4 bg-gray-900">
                  <div className="max-w-lg p-6 bg-gray-800 border border-red-800 rounded-lg">
                    <h3 className="text-lg font-medium text-red-400 mb-2">Compilation Error</h3>
                    <pre className="text-sm text-red-300 whitespace-pre-wrap font-mono bg-gray-900 p-4 rounded border border-red-900 max-h-80 overflow-auto">
                      {compilationError}
                    </pre>
                  </div>
                </div>
              ) : !pdfData ? (
                <div className="h-full flex items-center justify-center bg-gray-900">
                  <div className="text-center max-w-md p-6">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 text-gray-700 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <p className="text-gray-400 text-lg font-medium mb-2">No PDF Preview</p>
                    <p className="text-gray-500 mb-4">Click "Compile" to generate a PDF preview of your LaTeX document.</p>
                    <button
                      onClick={handleCompile}
                      className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                    >
                      Compile Now
                    </button>
                  </div>
                </div>
              ) : (
                <div className="h-full">
                  <PdfViewer
                    pdfData={pdfData}
                    isLoading={isCompiling}
                    error={compilationError}
                    htmlPreview={htmlPreview || undefined}
                    documentTitle={currentFileName || projectData?.title || "document"}
                    onRecompileRequest={handleCompile}
                    hideToolbar={false} // We show the PdfViewer's toolbar in PDF-only mode
                  />
                </div>
              )}
            </div>
          )}

          {/* Image view */}
          {isImageView && (
            <div className="w-full h-full bg-gray-900">
              <ImagePreview
                filename={currentFileName}
                fileId={currentFileId || ""}
                projectId={projectId}
              />
            </div>
          )}
        </div>

        {/* Chat Panel - integrated with smooth resizing */}
        {isChatOpen && (
          <div
            className="h-full flex-shrink-0 shadow-lg bg-[#1e1e1e]"
            style={{
              width: '350px',
              contain: 'strict', // Add containment for better performance isolation
              willChange: 'width', // Signal to browser to optimize this element
            }}
          >
            <ChatPanel
              isOpen={isChatOpen}
              onClose={closeChat}
              projectId={projectId}
              userId={userId}
              currentFileName={currentFileName}
              currentFileId={currentFileId}
              currentFileContent={code}
              projectFiles={chatFileList}
              onSuggestionApply={handleApplySuggestion}
              onSuggestionReject={() => setActiveSuggestion(null)}
              onFileSelect={handleFileSelect}
              onFileUpload={handleChatFileUpload}
              initialWidth={350}
              minWidth={280}
              maxWidth={600}
            />
          </div>
        )}
      </div>

      {/* Status bar - fixed height */}
      <div className="h-6 bg-gray-800 border-t border-gray-700 flex items-center px-4 text-xs text-gray-400 z-10">
        <div className="flex-1 flex items-center">
          {currentFileName ? (
            <>
              <span className="font-mono">{currentFileName}</span>
              <span className="mx-2">•</span>
              <span>{code.split('\n').length} lines</span>
              {!isSaved && (
                <>
                  <span className="mx-2">•</span>
                  <span className="text-yellow-400">Unsaved changes</span>
                </>
              )}
            </>
          ) : (
            <span>No file selected</span>
          )}
        </div>
        <div className="flex items-center">
          <label className="flex items-center mr-4 cursor-pointer">
            <input
              type="checkbox"
              checked={autoCompile}
              onChange={(e) => setAutoCompile(e.target.checked)}
              className="mr-1.5 h-3 w-3"
            />
            <span>Auto-compile</span>
          </label>
          <span>LaTeX Editor</span>
        </div>
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          style={{
            position: 'fixed',
            left: `${contextMenu.x}px`,
            top: `${contextMenu.y}px`,
            zIndex: 50
          }}
          className="bg-gray-800 rounded-lg shadow-lg border border-gray-700 py-1 min-w-[160px]"
        >
          {/* Context menu items */}
          <button
            onClick={() => {
              const item = files.find(f => f.id === contextMenu.itemId);
              if (item && item.type === 'file') {
                handleFileSelect(contextMenu.itemId);
              }
              setContextMenu(null);
            }}
            className="w-full text-left px-3 py-1.5 text-sm flex items-center hover:bg-gray-700/80 text-gray-300"
          >
            <FileText className="h-4 w-4 mr-3 text-gray-500" />
            Open
          </button>

          {/* Folder-specific actions */}
          {files.find(f => f.id === contextMenu.itemId)?.type === 'folder' && (
            <button
              onClick={() => {
                handleCreateFile(contextMenu.itemId);
                setContextMenu(null);
              }}
              className="w-full text-left px-3 py-1.5 text-sm flex items-center hover:bg-gray-700/80 text-gray-300"
            >
              <FilePlus className="h-4 w-4 mr-3 text-gray-500" />
              New File
            </button>
          )}

          <button
            onClick={() => {
              handleDeleteItem(contextMenu.itemId);
              setContextMenu(null);
            }}
            className="w-full text-left px-3 py-1.5 text-sm flex items-center hover:bg-gray-700/80 text-red-400"
          >
            <Trash className="h-4 w-4 mr-3 text-red-400" />
            Delete
          </button>
        </div>
      )}

      {/* Upload Modal */}
      {isUploadModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70">
          <div className="bg-gray-800 rounded-lg shadow-xl p-6 max-w-xl w-full m-4">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-gray-100">Upload Files</h2>
              <button
                onClick={() => setIsUploadModalOpen(false)}
                className="p-1 text-gray-400 hover:text-gray-200 rounded-full"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            <div className="mb-4">
              <p className="text-gray-300 text-sm mb-4">
                Upload files to your LaTeX project. You can upload .tex files, images, and other resources.
              </p>

              <input
                type="file"
                multiple
                ref={fileInputRef}
                onChange={handleFileUpload}
                className="hidden"
              />

              <div
                className="border-2 border-dashed border-gray-600 rounded-lg p-8 text-center cursor-pointer hover:border-blue-500 hover:bg-gray-700/50"
                onClick={() => fileInputRef.current?.click()}
              >
                <FileUp className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                <p className="text-gray-300">
                  Drag files here or click to browse
                </p>
                <p className="text-gray-500 text-sm mt-2">
                  Support for .tex, .bib, images, and more
                </p>
              </div>
            </div>

            <div className="flex justify-end mt-6">
              <button
                onClick={() => setIsUploadModalOpen(false)}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-md"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EnhancedLatexEditorWrapper;