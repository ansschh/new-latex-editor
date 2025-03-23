import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Loader, FileText, Folder, FolderOpen,
  Plus, Search, Upload, ChevronDown, ChevronRight,
  MoreVertical, File, Download, Trash2, Edit2, Copy, X
} from "lucide-react";
import {
  collection, query, where, getDocs, doc, getDoc,
  setDoc, updateDoc, deleteDoc, addDoc, serverTimestamp,
  writeBatch, onSnapshot, orderBy, runTransaction
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
  DndContext, DragEndEvent, DragOverlay, DragStartEvent,
  PointerSensor, useSensor, useSensors, closestCenter
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { restrictToWindowEdges } from "@dnd-kit/modifiers";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

// Define types for our file system
interface FileItem {
  id: string;
  name: string;
  type: 'file' | 'folder';
  parentId: string | null;
  content?: string;
  createdAt: any;
  updatedAt: any;
  path?: string;
  extension?: string;
  order: number;
}

interface ProjectFileTreeProps {
  projectId: string;
  userId: string;
  onFileSelect: (fileId: string, fileName: string, content: string) => void;
  currentFileId: string | null;
  onCreateNewFile?: (fileId: string) => void;
}

// Templates for different file types
const FILE_TEMPLATES = {
  tex: `\\documentclass{article}
\\usepackage[utf8]{inputenc}
\\usepackage{amsmath}
\\usepackage{graphicx}

\\title{New Document}
\\author{Author}
\\date{\\today}

\\begin{document}

\\maketitle

\\section{Introduction}
Start writing your document here.

\\end{document}`,
  bib: `@article{example,
  author = {Author, A.},
  title = {Example Article Title},
  journal = {Journal Name},
  year = {2025},
  volume = {1},
  pages = {1--10}
}`,
  md: `# Document Title

## Introduction
Write your introduction here.

## Main Content
Add your main content here.

## Conclusion
Summarize your document here.
`,
  json: `{
  "name": "example",
  "description": "An example JSON file",
  "properties": {
    "property1": "value1",
    "property2": "value2"
  }
}`
};

// File extension to icon mapping
const getFileIcon = (filename: string, className = "h-4 w-4 mr-2") => {
  const extension = filename.split('.').pop()?.toLowerCase() || '';

  switch (extension) {
    case 'tex':
      return <FileText className={`${className} text-blue-400`} />;
    case 'bib':
      return <FileText className={`${className} text-green-400`} />;
    case 'md':
      return <FileText className={`${className} text-yellow-400`} />;
    case 'json':
      return <FileText className={`${className} text-orange-400`} />;
    case 'png':
    case 'jpg':
    case 'jpeg':
    case 'svg':
      return <FileText className={`${className} text-purple-400`} />;
    default:
      return <FileText className={`${className} text-gray-400`} />;
  }
};

// Individual file item component that can be dragged
const SortableFileItem = ({
  file,
  depth,
  isActive,
  onSelect,
  onRename,
  onDelete,
  onDuplicate
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({
    id: file.id,
    data: {
      type: 'file',
      file
    }
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 1 : 'auto'
  };

  const [isContextMenuOpen, setIsContextMenuOpen] = useState(false);
  const [contextMenuPosition, setContextMenuPosition] = useState({ x: 0, y: 0 });
  const contextMenuRef = useRef(null);

  // Close context menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(event.target)) {
        setIsContextMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleContextMenu = (e) => {
    e.preventDefault();
    setContextMenuPosition({ x: e.clientX, y: e.clientY });
    setIsContextMenuOpen(true);
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      className={`flex items-center relative pl-${(depth * 3) + 3} py-1.5 pr-2 mb-0.5 group rounded ${isActive ? 'bg-gray-700 text-white' : 'hover:bg-gray-700/50 text-gray-300'
        } ${isDragging ? 'z-50' : ''}`}
      onContextMenu={handleContextMenu}
    >
      <div
        className="flex-1 flex items-center cursor-pointer"
        onClick={() => onSelect(file.id, file.name)}
      >
        <div className="mr-1 cursor-grab touch-none" {...listeners}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="9" cy="6" r="2" />
            <circle cx="9" cy="12" r="2" />
            <circle cx="9" cy="18" r="2" />
            <circle cx="15" cy="6" r="2" />
            <circle cx="15" cy="12" r="2" />
            <circle cx="15" cy="18" r="2" />
          </svg>
        </div>
        {getFileIcon(file.name)}
        <span className="truncate">{file.name}</span>
      </div>

      {/* Quick actions on hover */}
      <div className="hidden group-hover:flex items-center space-x-1">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRename(file.id, file.name);
          }}
          className="p-1 hover:bg-gray-600 rounded"
          title="Rename"
        >
          <Edit2 className="h-3.5 w-3.5 text-gray-400" />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDuplicate(file.id);
          }}
          className="p-1 hover:bg-gray-600 rounded"
          title="Duplicate"
        >
          <Copy className="h-3.5 w-3.5 text-gray-400" />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete(file.id, 'file');
          }}
          className="p-1 hover:bg-gray-600 rounded"
          title="Delete"
        >
          <Trash2 className="h-3.5 w-3.5 text-gray-400" />
        </button>
      </div>

      {/* Context Menu */}
      {isContextMenuOpen && (
        <div
          ref={contextMenuRef}
          className="absolute z-50 bg-gray-800 rounded-md shadow-lg py-1 w-48 border border-gray-700"
          style={{
            left: `${contextMenuPosition.x}px`,
            top: `${contextMenuPosition.y}px`,
            transform: 'translate(-90%, 0)'
          }}
        >
          <button
            onClick={() => {
              onSelect(file.id, file.name);
              setIsContextMenuOpen(false);
            }}
            className="w-full text-left px-4 py-1.5 text-sm hover:bg-gray-700 flex items-center"
          >
            <FileText className="h-4 w-4 mr-2 text-gray-400" />
            Open
          </button>
          <button
            onClick={() => {
              onRename(file.id, file.name);
              setIsContextMenuOpen(false);
            }}
            className="w-full text-left px-4 py-1.5 text-sm hover:bg-gray-700 flex items-center"
          >
            <Edit2 className="h-4 w-4 mr-2 text-gray-400" />
            Rename
          </button>
          <button
            onClick={() => {
              onDuplicate(file.id);
              setIsContextMenuOpen(false);
            }}
            className="w-full text-left px-4 py-1.5 text-sm hover:bg-gray-700 flex items-center"
          >
            <Copy className="h-4 w-4 mr-2 text-gray-400" />
            Duplicate
          </button>
          <div className="border-t border-gray-700 my-1"></div>
          <button
            onClick={() => {
              onDelete(file.id, 'file');
              setIsContextMenuOpen(false);
            }}
            className="w-full text-left px-4 py-1.5 text-sm text-red-400 hover:bg-gray-700 flex items-center"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Delete
          </button>
        </div>
      )}
    </div>
  );
};

// Individual folder component that can be dragged
const SortableFolderItem = ({
  folder,
  depth,
  isExpanded,
  onToggle,
  onAddItem,
  onRename,
  onDelete,
  onDuplicate
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({
    id: folder.id,
    data: {
      type: 'folder',
      folder
    }
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 1 : 'auto'
  };

  const [isContextMenuOpen, setIsContextMenuOpen] = useState(false);
  const [contextMenuPosition, setContextMenuPosition] = useState({ x: 0, y: 0 });
  const contextMenuRef = useRef(null);

  // Close context menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(event.target)) {
        setIsContextMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleContextMenu = (e) => {
    e.preventDefault();
    setContextMenuPosition({ x: e.clientX, y: e.clientY });
    setIsContextMenuOpen(true);
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      className={`relative mb-0.5 ${isDragging ? 'z-50' : ''}`}
      onContextMenu={handleContextMenu}
    >
      <div className={`flex items-center pl-${(depth * 3) + 3} py-1.5 pr-2 group rounded hover:bg-gray-700/50 text-gray-300`}>
        <div className="mr-1 cursor-grab touch-none" {...listeners}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="9" cy="6" r="2" />
            <circle cx="9" cy="12" r="2" />
            <circle cx="9" cy="18" r="2" />
            <circle cx="15" cy="6" r="2" />
            <circle cx="15" cy="12" r="2" />
            <circle cx="15" cy="18" r="2" />
          </svg>
        </div>

        <div
          className="flex-1 flex items-center cursor-pointer"
          onClick={() => onToggle(folder.id)}
        >
          {isExpanded ?
            <FolderOpen className="h-4 w-4 mr-2 text-blue-400" /> :
            <Folder className="h-4 w-4 mr-2 text-blue-400" />
          }
          <span className="truncate">{folder.name}</span>
        </div>

        {/* Quick actions on hover */}
        <div className="hidden group-hover:flex items-center space-x-1">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onAddItem(folder.id);
            }}
            className="p-1 hover:bg-gray-600 rounded"
            title="Add Item"
          >
            <Plus className="h-3.5 w-3.5 text-gray-400" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRename(folder.id, folder.name);
            }}
            className="p-1 hover:bg-blur-600 rounded"
            title="Rename"
          >
            <Edit2 className="h-3.5 w-3.5 text-gray-400" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete(folder.id, 'folder');
            }}
            className="p-1 hover:bg-gray-600 rounded"
            title="Delete"
          >
            <Trash2 className="h-3.5 w-3.5 text-gray-400" />
          </button>
        </div>
      </div>

      {/* Context Menu */}
      {isContextMenuOpen && (
        <div
          ref={contextMenuRef}
          className="absolute z-50 bg-gray-800 rounded-md shadow-lg py-1 w-48 border border-gray-700"
          style={{
            left: `${contextMenuPosition.x}px`,
            top: `${contextMenuPosition.y}px`,
            transform: 'translate(-90%, 0)'
          }}
        >
          <button
            onClick={() => {
              onToggle(folder.id);
              setIsContextMenuOpen(false);
            }}
            className="w-full text-left px-4 py-1.5 text-sm hover:bg-gray-700 flex items-center"
          >
            {isExpanded ?
              <ChevronDown className="h-4 w-4 mr-2 text-gray-400" /> :
              <ChevronRight className="h-4 w-4 mr-2 text-gray-400" />
            }
            {isExpanded ? 'Collapse' : 'Expand'}
          </button>
          <button
            onClick={() => {
              onAddItem(folder.id);
              setIsContextMenuOpen(false);
            }}
            className="w-full text-left px-4 py-1.5 text-sm hover:bg-gray-700 flex items-center"
          >
            <Plus className="h-4 w-4 mr-2 text-gray-400" />
            New Item
          </button>
          <button
            onClick={() => {
              onRename(folder.id, folder.name);
              setIsContextMenuOpen(false);
            }}
            className="w-full text-left px-4 py-1.5 text-sm hover:bg-gray-700 flex items-center"
          >
            <Edit2 className="h-4 w-4 mr-2 text-gray-400" />
            Rename
          </button>
          <button
            onClick={() => {
              onDuplicate(folder.id);
              setIsContextMenuOpen(false);
            }}
            className="w-full text-left px-4 py-1.5 text-sm hover:bg-gray-700 flex items-center"
          >
            <Copy className="h-4 w-4 mr-2 text-gray-400" />
            Duplicate
          </button>
          <div className="border-t border-gray-700 my-1"></div>
          <button
            onClick={() => {
              onDelete(folder.id, 'folder');
              setIsContextMenuOpen(false);
            }}
            className="w-full text-left px-4 py-1.5 text-sm text-red-400 hover:bg-gray-700 flex items-center"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Delete
          </button>
        </div>
      )}
    </div>
  );
};

// Empty folder placeholder when dragging
const EmptyFolderPlaceholder = ({ depth = 0 }) => (
  <div className={`pl-${(depth * 3) + 8} py-1.5 pr-2 text-gray-500 italic text-sm`}>
    This folder is empty
  </div>
);

// Main component
const ProjectFileTree: React.FC<ProjectFileTreeProps> = ({
  projectId,
  userId,
  onFileSelect,
  currentFileId,
  onCreateNewFile
}) => {
  // State management
  const [files, setFiles] = useState<FileItem[]>([]);
  const [folders, setFolders] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [newItemName, setNewItemName] = useState('');
  const [newItemType, setNewItemType] = useState<'file' | 'folder'>('file');
  const [fileExtension, setFileExtension] = useState<string>('tex');
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [isRenaming, setIsRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeDropTarget, setActiveDropTarget] = useState<string | null>(null);
  const [draggedItem, setDraggedItem] = useState<{ id: string, type: string } | null>(null);
  const [isDraggingOver, setIsDraggingOver] = useState<boolean>(false);
  const [recentFiles, setRecentFiles] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const unsubscribeRef = useRef<() => void | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Configure DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5, // 5px movement required to activate drag
      },
    })
  );

  // Subscribe to real-time updates from Firestore
  useEffect(() => {
    const setupRealtimeListener = () => {
      // Instead of using this query with orderBy which requires an index:
      // const filesQuery = query(
      //   collection(db, "projectFiles"),
      //   where("projectId", "==", projectId),
      //   orderBy("order", "asc")
      // );

      // Use this simpler query first to avoid index requirements:
      const filesQuery = query(
        collection(db, "projectFiles"),
        where("projectId", "==", projectId)
      );

      // Create the listener
      const unsubscribe = onSnapshot(filesQuery, (snapshot) => {
        const fetchedFiles: FileItem[] = [];
        const fetchedFolders: FileItem[] = [];

        snapshot.forEach((doc) => {
          const data = doc.data() as Omit<FileItem, 'id'>;
          const item = {
            id: doc.id,
            ...data,
            type: data.type || 'file',
            name: data.name || 'Untitled',
            parentId: data.parentId || null,
            order: data.order || 0
          } as FileItem;

          if (item.type === 'folder') {
            fetchedFolders.push(item);
          } else {
            fetchedFiles.push(item);
          }
        });

        // Sort files and folders client-side instead of in the query
        // This avoids the need for a composite index
        setFiles(fetchedFiles.sort((a, b) => (a.order || 0) - (b.order || 0)));
        setFolders(fetchedFolders.sort((a, b) => (a.order || 0) - (b.order || 0)));
        setLoading(false);
      }, (err) => {
        console.error("Error with real-time listener:", err);
        setError("Failed to sync with server");
        setLoading(false);
      });

      // Store the unsubscribe function
      unsubscribeRef.current = unsubscribe;
    };

    // Initialize
    if (projectId) {
      setupRealtimeListener();
      initializeProject();

      // Cleanup function
      return () => {
        if (unsubscribeRef.current) {
          unsubscribeRef.current();
        }
      };
    }
  }, [projectId]);


  // Load recent files from localStorage
  useEffect(() => {
    const storedRecents = localStorage.getItem(`${projectId}_recent_files`);
    if (storedRecents) {
      try {
        setRecentFiles(JSON.parse(storedRecents));
      } catch (e) {
        console.error("Error parsing recent files:", e);
      }
    }
  }, [projectId]);

  // Initialize the project - create default files if needed
  const initializeProject = async () => {
    try {
      // Check if project has files
      const filesQuery = query(
        collection(db, "projectFiles"),
        where("projectId", "==", projectId),
        orderBy("order", "asc")
      );

      const snapshot = await getDocs(filesQuery);

      // If no files, create defaults
      if (snapshot.empty) {
        console.log("Project is empty, creating default structure...");

        const batch = writeBatch(db);

        // Create root structure
        const mainFileId = await createDefaultFile(batch);
        await createDefaultFolder(batch, "sections");
        await createDefaultFolder(batch, "figures");

        // Commit all changes
        await batch.commit();

        // Auto-select the main file
        if (mainFileId && onCreateNewFile) {
          onCreateNewFile(mainFileId);
        }
      }
    } catch (error) {
      console.error("Error initializing project:", error);
      setError("Failed to initialize project");
    }
  };

  // Create default main.tex file
  const createDefaultFile = async (batch) => {
    try {
      const defaultContent = FILE_TEMPLATES.tex;

      // Create the document reference
      const docRef = doc(collection(db, "projectFiles"));

      // Add to batch
      batch.set(docRef, {
        name: "main.tex",
        type: "file",
        content: defaultContent,
        projectId,
        userId,
        parentId: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        extension: "tex",
        order: 0
      });

      return docRef.id;
    } catch (error) {
      console.error("Error creating default file:", error);
      return null;
    }
  };

  // Create a default folder
  const createDefaultFolder = async (batch, name, order = 1) => {
    try {
      // Create the document reference
      const docRef = doc(collection(db, "projectFiles"));

      // Add to batch
      batch.set(docRef, {
        name,
        type: "folder",
        projectId,
        userId,
        parentId: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        order
      });

      return docRef.id;
    } catch (error) {
      console.error(`Error creating ${name} folder:`, error);
      return null;
    }
  };

  // Update recent files 
  const updateRecentFiles = (fileId: string) => {
    // Move this file to the top of recent files or add it
    setRecentFiles(prev => {
      const newRecents = prev.filter(id => id !== fileId);
      newRecents.unshift(fileId);

      // Keep only the last 5 items
      const limitedRecents = newRecents.slice(0, 5);

      // Update localStorage
      localStorage.setItem(`${projectId}_recent_files`, JSON.stringify(limitedRecents));

      return limitedRecents;
    });
  };

  // Handle file selection
  const handleFileSelect = async (fileId: string, fileName: string) => {
    try {
      const fileDoc = await getDoc(doc(db, "projectFiles", fileId));

      if (fileDoc.exists()) {
        const fileData = fileDoc.data();
        onFileSelect(fileId, fileName, fileData.content || "");
        updateRecentFiles(fileId);
      } else {
        setError("File not found");
        showNotification("File not found", "error");
      }
    } catch (error) {
      console.error("Error loading file:", error);
      setError("Failed to load file");
      showNotification("Failed to load file", "error");
    }
  };

  // Generate default content based on file extension
  const getDefaultContent = (filename: string) => {
    const extension = filename.split('.').pop()?.toLowerCase();
    return FILE_TEMPLATES[extension] || '';
  };


  const createNewFile = async (name: string, content: string = "", parentId: string | null = null) => {
    try {
      const extension = name.includes('.') ? name.split('.').pop()?.toLowerCase() : fileExtension;
      const filename = name.includes('.') ? name : `${name}.${extension}`;

      // Check if file already exists in the same location
      const existingFile = files.find(f =>
        f.name.toLowerCase() === filename.toLowerCase() &&
        f.parentId === parentId
      );

      if (existingFile) {
        showNotification(`A file named "${filename}" already exists in this location`, "error");
        return null;
      }

      // Check if it's an image file
      const isImage = ['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp', 'bmp'].includes(extension || '');

      // Calculate order (highest order + 1 in the same parent)
      const itemsInParent = [...files, ...folders].filter(item => item.parentId === parentId);
      const highestOrder = itemsInParent.length > 0
        ? Math.max(...itemsInParent.map(item => item.order || 0))
        : -1;
      const newOrder = highestOrder + 1;

      // For regular text files
      const fileData = {
        name: filename,
        type: 'file',
        content: isImage ? '' : content, // Only store content for non-image files
        projectId,
        userId,
        parentId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        extension,
        order: newOrder
      };

      // Add dataUrl field for images if the content looks like a data URL
      if (isImage && content.startsWith('data:image/')) {
        fileData.dataUrl = content;
      }

      const docRef = await addDoc(collection(db, "projectFiles"), fileData);

      // Create a local file object for state update
      const newFile = {
        id: docRef.id,
        ...fileData,
        createdAt: new Date(),
        updatedAt: new Date()
      } as FileItem;

      setFiles(prev => [...prev, newFile]);

      showNotification(`File "${filename}" created successfully`);

      if (onCreateNewFile) {
        onCreateNewFile(docRef.id);
      }

      return docRef.id;
    } catch (error) {
      console.error("Error creating file:", error);
      showNotification("Failed to create file", "error");
      return null;
    }
  };

  // Create a new folder
  const createNewFolder = async (name: string, parentId: string | null = null) => {
    try {
      // Check if folder already exists in the same location
      const existingFolder = folders.find(f =>
        f.name.toLowerCase() === name.toLowerCase() &&
        f.parentId === parentId
      );

      if (existingFolder) {
        showNotification(`A folder named "${name}" already exists in this location`, "error");
        return null;
      }

      // Calculate order (highest order + 1 in the same parent)
      const itemsInParent = [...files, ...folders].filter(item => item.parentId === parentId);
      const highestOrder = itemsInParent.length > 0
        ? Math.max(...itemsInParent.map(item => item.order || 0))
        : -1;
      const newOrder = highestOrder + 1;

      // Create the new folder
      const docRef = await addDoc(collection(db, "projectFiles"), {
        name,
        type: 'folder',
        projectId,
        userId,
        parentId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        order: newOrder
      });

      // Auto-expand the newly created folder
      setExpandedFolders(prev => ({ ...prev, [docRef.id]: true }));

      showNotification(`Folder "${name}" created successfully`);

      return docRef.id;
    } catch (error) {
      console.error("Error creating folder:", error);
      showNotification("Failed to create folder", "error");
      return null;
    }
  };

  // Handle adding a new item (file or folder)
  const handleAddItem = async () => {
    if (!newItemName.trim()) {
      setError("Name cannot be empty");
      showNotification("Name cannot be empty", "error");
      return;
    }

    // For files without extension, add the selected extension
    const processedName = newItemType === 'file' && !newItemName.includes('.')
      ? `${newItemName}.${fileExtension}`
      : newItemName;

    if (newItemType === 'file') {
      await createNewFile(processedName, selectedFolder);
    } else {
      await createNewFolder(processedName, selectedFolder);
    }

    // Reset state
    setNewItemName('');
    setShowAddMenu(false);
    setSelectedFolder(null);
  };

  // Duplicate a file
  const handleDuplicateItem = async (itemId: string) => {
    try {
      // Get the original item
      const itemDoc = await getDoc(doc(db, "projectFiles", itemId));

      if (!itemDoc.exists()) {
        showNotification("Item not found", "error");
        return;
      }

      const itemData = itemDoc.data() as FileItem;
      const isFolder = itemData.type === 'folder';

      // Generate new name by adding " - Copy" or incrementing "(n)"
      let newName = itemData.name;
      const extension = newName.includes('.')
        ? '.' + newName.split('.').pop()
        : '';
      const baseName = newName.includes('.')
        ? newName.substring(0, newName.lastIndexOf('.'))
        : newName;

      if (baseName.match(/ - Copy( \(\d+\))?$/)) {
        const match = baseName.match(/ - Copy( \(\d+\))?$/);
        const num = match[1] ? parseInt(match[1].replace(/\D/g, '')) : 1;
        newName = baseName.replace(/ - Copy( \(\d+\))?$/, ` - Copy (${num + 1})`) + extension;
      } else {
        newName = baseName + " - Copy" + extension;
      }

      // Calculate new order
      const itemsInParent = [...files, ...folders].filter(item => item.parentId === itemData.parentId);
      const highestOrder = itemsInParent.length > 0
        ? Math.max(...itemsInParent.map(item => item.order || 0))
        : -1;
      const newOrder = highestOrder + 1;

      if (isFolder) {
        // For folders, create a new folder with the same parent
        const newFolderId = await createNewFolder(newName, itemData.parentId);

        // Duplicate all children (files and subfolders)
        const childItems = [
          ...files.filter(f => f.parentId === itemId),
          ...folders.filter(f => f.parentId === itemId)
        ];

        // Create a map to track original IDs to new IDs
        const idMap = new Map();
        idMap.set(itemId, newFolderId);

        // First duplicate all folders (to establish the structure)
        const childFolders = folders.filter(f => f.parentId === itemId);
        for (const folder of childFolders) {
          const newChildId = await duplicateFolderRecursive(folder.id, newFolderId, idMap);
          idMap.set(folder.id, newChildId);
        }

        // Then duplicate all files
        const childFiles = files.filter(f => f.parentId === itemId);
        for (const file of childFiles) {
          await duplicateFile(file.id, newFolderId);
        }

        showNotification(`Folder "${newName}" duplicated successfully`);
      } else {
        // For files, simply create a new file with duplicate content
        const newFileId = await addDoc(collection(db, "projectFiles"), {
          name: newName,
          type: 'file',
          content: itemData.content || '',
          projectId,
          userId,
          parentId: itemData.parentId,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          extension: itemData.extension,
          order: newOrder
        });

        showNotification(`File "${newName}" duplicated successfully`);
      }
    } catch (error) {
      console.error("Error duplicating item:", error);
      showNotification("Failed to duplicate item", "error");
    }
  };

  // Helper function to recursively duplicate a folder and its contents
  const duplicateFolderRecursive = async (folderId: string, newParentId: string, idMap: Map<string, string>) => {
    const folderDoc = await getDoc(doc(db, "projectFiles", folderId));
    if (!folderDoc.exists()) return null;

    const folderData = folderDoc.data() as FileItem;

    // Calculate new order
    const itemsInParent = [...files, ...folders].filter(item => item.parentId === newParentId);
    const highestOrder = itemsInParent.length > 0
      ? Math.max(...itemsInParent.map(item => item.order || 0))
      : -1;
    const newOrder = highestOrder + 1;

    // Create the new folder
    const newFolderRef = await addDoc(collection(db, "projectFiles"), {
      name: folderData.name,
      type: 'folder',
      projectId,
      userId,
      parentId: newParentId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      order: newOrder
    });

    const newFolderId = newFolderRef.id;

    // Add to the ID map
    idMap.set(folderId, newFolderId);

    // Get all direct children of this folder
    const childFolders = folders.filter(f => f.parentId === folderId);
    const childFiles = files.filter(f => f.parentId === folderId);

    // Recursively duplicate subfolders
    for (const subfolder of childFolders) {
      await duplicateFolderRecursive(subfolder.id, newFolderId, idMap);
    }

    // Duplicate all files in this folder
    for (const file of childFiles) {
      await duplicateFile(file.id, newFolderId);
    }

    return newFolderId;
  };

  // Helper to duplicate a single file
  const duplicateFile = async (fileId: string, newParentId: string) => {
    const fileDoc = await getDoc(doc(db, "projectFiles", fileId));
    if (!fileDoc.exists()) return null;

    const fileData = fileDoc.data() as FileItem;

    // Calculate new order
    const itemsInParent = [...files, ...folders].filter(item => item.parentId === newParentId);
    const highestOrder = itemsInParent.length > 0
      ? Math.max(...itemsInParent.map(item => item.order || 0))
      : -1;
    const newOrder = highestOrder + 1;

    // Create the duplicate file
    const newFileRef = await addDoc(collection(db, "projectFiles"), {
      name: fileData.name,
      type: 'file',
      content: fileData.content || '',
      projectId,
      userId,
      parentId: newParentId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      extension: fileData.extension,
      order: newOrder
    });

    return newFileRef.id;
  };

  // Handle deleting an item
  const handleDeleteItem = async (id: string, type: 'file' | 'folder') => {
    try {
      // Check if it's a folder with content
      if (type === 'folder') {
        const hasChildren = files.some(file => file.parentId === id) ||
          folders.some(folder => folder.parentId === id);

        if (hasChildren) {
          if (!window.confirm("This folder contains files. Delete this folder and all its contents?")) {
            return;
          }

          await deleteRecursively(id);
          showNotification(`Folder and all its contents deleted`);
          return;
        }
      }

      // Delete the item
      await deleteDoc(doc(db, "projectFiles", id));

      // If the current file was deleted, clear it
      if (currentFileId === id) {
        onFileSelect('', '', '');
      }

      showNotification(`${type === 'file' ? 'File' : 'Folder'} deleted successfully`);
    } catch (error) {
      console.error("Error deleting item:", error);
      setError(`Failed to delete ${type}`);
      showNotification(`Failed to delete ${type}`, "error");
    }
  };

  // Helper function to recursively delete a folder and all its contents
  const deleteRecursively = async (folderId: string) => {
    try {
      await runTransaction(db, async (transaction) => {
        // Get all children of this folder
        const childFiles = files.filter(file => file.parentId === folderId);
        const childFolders = folders.filter(folder => folder.parentId === folderId);

        // Delete all child files
        for (const file of childFiles) {
          transaction.delete(doc(db, "projectFiles", file.id));
        }

        // Recursively delete subfolders
        for (const subfolder of childFolders) {
          // Get all descendants of this subfolder
          const descendants = getAllDescendants(subfolder.id);

          // Delete all descendants
          for (const descendant of descendants) {
            transaction.delete(doc(db, "projectFiles", descendant.id));
          }

          // Delete the subfolder itself
          transaction.delete(doc(db, "projectFiles", subfolder.id));
        }

        // Finally, delete the folder itself
        transaction.delete(doc(db, "projectFiles", folderId));
      });
    } catch (error) {
      console.error("Error in recursive delete:", error);
      throw error;
    }
  };

  // Get all descendants (files and folders) of a folder
  const getAllDescendants = (folderId: string): Array<{ id: string, type: string }> => {
    const result: Array<{ id: string, type: string }> = [];

    // Get direct children
    const childFiles = files.filter(f => f.parentId === folderId);
    const childFolders = folders.filter(f => f.parentId === folderId);

    // Add files
    childFiles.forEach(file => {
      result.push({ id: file.id, type: 'file' });
    });

    // Add folders and their descendants
    childFolders.forEach(folder => {
      result.push({ id: folder.id, type: 'folder' });
      const descendants = getAllDescendants(folder.id);
      result.push(...descendants);
    });

    return result;
  };

  // Handle renaming an item
  const handleRename = async (id: string, type: 'file' | 'folder') => {
    if (!renameValue.trim()) {
      setError("Name cannot be empty");
      showNotification("Name cannot be empty", "error");
      return;
    }

    try {
      // Get the item to find its parent
      const itemDoc = await getDoc(doc(db, "projectFiles", id));
      if (!itemDoc.exists()) {
        showNotification("Item not found", "error");
        setIsRenaming(null);
        return;
      }

      const itemData = itemDoc.data();
      const parentId = itemData.parentId;

      // Check if name already exists in the same location
      let nameExists;
      if (type === 'file') {
        nameExists = files.some(f =>
          f.id !== id &&
          f.name.toLowerCase() === renameValue.toLowerCase() &&
          f.parentId === parentId
        );
      } else {
        nameExists = folders.some(f =>
          f.id !== id &&
          f.name.toLowerCase() === renameValue.toLowerCase() &&
          f.parentId === parentId
        );
      }

      if (nameExists) {
        showNotification(`A ${type} with this name already exists in this location`, "error");
        setIsRenaming(null);
        return;
      }

      // For files, update extension if needed
      let extension = itemData.extension;
      if (type === 'file' && renameValue.includes('.')) {
        extension = renameValue.split('.').pop();
      }

      await updateDoc(doc(db, "projectFiles", id), {
        name: renameValue,
        updatedAt: serverTimestamp(),
        ...(type === 'file' && extension ? { extension } : {})
      });

      setIsRenaming(null);
      showNotification(`${type === 'file' ? 'File' : 'Folder'} renamed successfully`);
    } catch (error) {
      console.error("Error renaming item:", error);
      setError(`Failed to rename ${type}`);
      showNotification(`Failed to rename ${type}`, "error");
    }
  };

  // Handle initiating renaming
  const handleStartRename = (id: string, currentName: string) => {
    setRenameValue(currentName);
    setIsRenaming(id);

    // Focus the input in the next render cycle
    setTimeout(() => {
      const input = document.getElementById(`rename-input-${id}`);
      if (input) {
        input.focus();
        // If it's a file with an extension, select just the filename part
        if (currentName.includes('.')) {
          const dotIndex = currentName.lastIndexOf('.');
          (input as HTMLInputElement).setSelectionRange(0, dotIndex);
        } else {
          (input as HTMLInputElement).select();
        }
      }
    }, 10);
  };

  // Handle drag start
  const handleDragStart = (event: DragStartEvent) => {
    const { id, type } = event.active.data.current;
    setDraggedItem({ id, type });

    // If we're dragging a folder, we need to expand the relevant folders
    if (type === 'folder') {
      // TODO: Visually indicate valid drop targets
    }
  };

  // Handle drag over
  const handleDragOver = (event) => {
    // Check if we're dragging over a folder
    const overItem = event.over?.data?.current;
    if (overItem && overItem.type === 'folder') {
      setActiveDropTarget(overItem.id);
      setIsDraggingOver(true);
    } else {
      setActiveDropTarget(null);
      setIsDraggingOver(false);
    }
  };

  // Handle drag end
  const handleDragEnd = async (event: DragEndEvent) => {
    setDraggedItem(null);
    setActiveDropTarget(null);
    setIsDraggingOver(false);

    // If dropped on itself or no drop target, do nothing
    if (!event.over || event.active.id === event.over.id) {
      return;
    }

    const activeId = event.active.id as string;
    const activeData = event.active.data.current;
    const overId = event.over.id as string;
    const overData = event.over?.data?.current;

    // Get the source item
    const item = activeData.type === 'file'
      ? files.find(f => f.id === activeId)
      : folders.find(f => f.id === activeId);

    if (!item) return;

    // Determine the drop target
    let targetParentId: string | null = null;

    // Case 1: Dropping into a folder
    if (overData && overData.type === 'folder') {
      // Don't allow dropping a folder into its own descendant
      if (activeData.type === 'folder') {
        const descendants = getAllDescendants(activeId).map(d => d.id);
        if (descendants.includes(overId)) {
          showNotification("Cannot move a folder into its own subfolder", "error");
          return;
        }
      }

      targetParentId = overId;

      // Auto-expand the target folder
      setExpandedFolders(prev => ({ ...prev, [overId]: true }));
    }
    // Case 2: Dropping next to a file or folder - get its parent
    else {
      const targetItem = overData.type === 'file'
        ? files.find(f => f.id === overId)
        : folders.find(f => f.id === overId);

      if (targetItem) {
        targetParentId = targetItem.parentId;
      }
    }

    // If the parent hasn't changed, this is a reordering within the same parent
    if (targetParentId === item.parentId) {
      await handleReorder(activeId, overId, item.parentId);
    }
    // Otherwise, this is moving to a new parent
    else {
      await handleMove(activeId, targetParentId);
    }
  };

  // Handle reordering items within the same parent
  const handleReorder = async (itemId: string, targetItemId: string, parentId: string | null) => {
    try {
      // Get all siblings (items with the same parent)
      const siblings = [...files, ...folders]
        .filter(item => item.parentId === parentId)
        .sort((a, b) => (a.order || 0) - (b.order || 0));

      // Find the moved item and target item
      const movedItem = siblings.find(item => item.id === itemId);
      const targetItem = siblings.find(item => item.id === targetItemId);

      if (!movedItem || !targetItem) return;

      // Remove the moved item from the array
      const newOrder = siblings.filter(item => item.id !== itemId);

      // Find the index of the target item
      const targetIndex = newOrder.findIndex(item => item.id === targetItemId);

      // Insert the moved item at the target position
      newOrder.splice(targetIndex + 1, 0, movedItem);

      // Update all orders in Firestore
      const batch = writeBatch(db);

      newOrder.forEach((item, index) => {
        batch.update(doc(db, "projectFiles", item.id), { order: index });
      });

      await batch.commit();
    } catch (error) {
      console.error("Error reordering items:", error);
      showNotification("Failed to reorder items", "error");
    }
  };

  // Handle moving an item to a new parent
  const handleMove = async (itemId: string, newParentId: string | null) => {
    try {
      // Get the item to be moved
      const item = [...files, ...folders].find(item => item.id === itemId);
      if (!item) return;

      // Prepare update data
      const updateData = {
        parentId: newParentId,
        updatedAt: serverTimestamp()
      };

      // Calculate new order (highest in target parent + 1)
      const siblingsInTarget = [...files, ...folders].filter(item => item.parentId === newParentId);
      const highestOrder = siblingsInTarget.length > 0
        ? Math.max(...siblingsInTarget.map(item => item.order || 0))
        : -1;

      // Update the item's parent and order
      await updateDoc(doc(db, "projectFiles", itemId), {
        ...updateData,
        order: highestOrder + 1
      });

      showNotification(`${item.type === 'file' ? 'File' : 'Folder'} moved successfully`);
    } catch (error) {
      console.error("Error moving item:", error);
      showNotification("Failed to move item", "error");
    }
  };

  // Handle file upload
  const handleFileUpload = async () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  // Process uploaded files
  // Add this within your ProjectFileTree component - specifically in the handleFileInputChange function 
  // where you handle file uploads (typically around line 400-450 in ProjectFileTree.tsx)

  // 1. FIRST, update the handleFileUpload function in ProjectFileTree.tsx:

  const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        console.log(`Processing file: ${file.name}, type: ${file.type}`);

        // Check if it's an image file
        const isImage = file.type.startsWith('image/');

        if (isImage) {
          // For images, convert to data URL
          console.log(`File ${file.name} is an image, converting to data URL`);

          const dataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (event) => {
              if (event.target?.result) {
                console.log(`Successfully read image data for ${file.name}`);
                resolve(event.target.result as string);
              } else {
                reject(new Error("Failed to read file"));
              }
            };
            reader.onerror = (event) => {
              console.error(`Error reading file: ${file.name}`, event);
              reject(new Error("Error reading file"));
            };
            reader.readAsDataURL(file);
          });

          console.log(`DataURL generated, length: ${dataUrl.length}`);

          // Extract extension
          const extension = file.name.split('.').pop()?.toLowerCase() || '';

          // Calculate order for new file
          const itemsInParent = [...files, ...folders].filter(item => item.parentId === selectedFolder);
          const highestOrder = itemsInParent.length > 0
            ? Math.max(...itemsInParent.map(item => item.order || 0))
            : -1;
          const newOrder = highestOrder + 1;

          // Create file document with the image data
          try {
            const docRef = await addDoc(collection(db, "projectFiles"), {
              name: file.name,
              type: 'file',
              projectId,
              userId,
              parentId: selectedFolder,
              dataUrl, // Store the full data URL here
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
              extension,
              order: newOrder
            });

            console.log(`Image document created with ID: ${docRef.id}`);

            // Add to local state for immediate display
            const newFile = {
              id: docRef.id,
              name: file.name,
              type: 'file',
              projectId,
              userId,
              parentId: selectedFolder,
              dataUrl,
              createdAt: new Date(),
              updatedAt: new Date(),
              extension,
              order: newOrder
            };

            setFiles(prev => [...prev, newFile as FileItem]);

            showNotification(`Image "${file.name}" uploaded successfully`);
          } catch (error) {
            console.error("Error creating image document:", error);
            showNotification(`Error saving image ${file.name}`, "error");
          }
        } else {
          // For non-image files, process as normal text
          console.log(`File ${file.name} is not an image, reading as text`);

          const textContent = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onload = (event) => {
              resolve(event.target?.result?.toString() || '');
            };
            reader.onerror = () => {
              resolve(''); // Provide empty content on error
            };
            reader.readAsText(file);
          });

          // Create text file
          await createNewFile(file.name, textContent, selectedFolder);
        }
      }
    } catch (error) {
      console.error("Error in file upload process:", error);
      showNotification("Failed to upload files", "error");
    } finally {
      setIsUploading(false);
      // Reset the input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };



  // Toggle folder expanded state
  const toggleFolder = (folderId: string) => {
    setExpandedFolders(prev => ({
      ...prev,
      [folderId]: !prev[folderId]
    }));
  };

  // Handle search
  const handleSearch = (query: string) => {
    setSearchQuery(query);
  };

  // Filter items based on search
  const getFilteredItems = () => {
    if (!searchQuery.trim()) return { files, folders };

    const query = searchQuery.toLowerCase();
    const filteredFiles = files.filter(file => file.name.toLowerCase().includes(query));
    const filteredFolders = folders.filter(folder => folder.name.toLowerCase().includes(query));

    return { files: filteredFiles, folders: filteredFolders };
  };

  // Get folder icon based on expansion state
  const getFolderIcon = (folderId: string, className = "h-4 w-4 mr-2") => {
    const isExpanded = expandedFolders[folderId] || false;
    const isActive = activeDropTarget === folderId;

    if (isActive && isDraggingOver) {
      return <FolderOpen className={`${className} text-green-400`} />;
    }

    return isExpanded ?
      <FolderOpen className={`${className} text-blue-400`} /> :
      <Folder className={`${className} text-blue-400`} />;
  };

  // Helper function to show notifications
  const showNotification = (message: string, type = "success") => {
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

  // Render folder content (recursive)
  const renderFolderContent = (folderId: string, depth = 0) => {
    const { files: filteredFiles, folders: filteredFolders } = getFilteredItems();

    const childFolders = filteredFolders.filter(f => f.parentId === folderId)
      .sort((a, b) => (a.order || 0) - (b.order || 0));

    const childFiles = filteredFiles.filter(f => f.parentId === folderId)
      .sort((a, b) => (a.order || 0) - (b.order || 0));

    // Get all items in this folder for the sortable context
    const childItems = [...childFolders, ...childFiles];
    const childIds = childItems.map(item => item.id);

    if (childItems.length === 0) {
      return <EmptyFolderPlaceholder depth={depth} />;
    }

    return (
      <SortableContext items={childIds} strategy={verticalListSortingStrategy}>
        <div className="space-y-0.5">
          {childFolders.map(folder => (
            <div key={folder.id} className="mb-0.5">
              <SortableFolderItem
                folder={folder}
                depth={depth}
                isExpanded={expandedFolders[folder.id] || false}
                onToggle={toggleFolder}
                onAddItem={setSelectedFolder}
                onRename={(id, name) => handleStartRename(id, name)}
                onDelete={handleDeleteItem}
                onDuplicate={handleDuplicateItem}
              />

              {expandedFolders[folder.id] && (
                <div className={depth > 3 ? 'pl-3' : ''}>
                  {renderFolderContent(folder.id, depth + 1)}
                </div>
              )}
            </div>
          ))}

          {childFiles.map(file => (
            <SortableFileItem
              key={file.id}
              file={file}
              depth={depth}
              isActive={currentFileId === file.id}
              onSelect={handleFileSelect}
              onRename={(id, name) => handleStartRename(id, name)}
              onDelete={handleDeleteItem}
              onDuplicate={handleDuplicateItem}
            />
          ))}
        </div>
      </SortableContext>
    );
  };

  // Render a minimal file item without drag capabilities - for recent files
  const renderRecentFile = (fileId: string) => {
    const file = files.find(f => f.id === fileId);
    if (!file) return null;

    const isActive = currentFileId === file.id;

    return (
      <div
        key={file.id}
        className={`flex items-center py-1 px-2 rounded cursor-pointer ${isActive ? 'bg-gray-700 text-white' : 'hover:bg-gray-700/50 text-gray-300'
          }`}
        onClick={() => handleFileSelect(file.id, file.name)}
      >
        {getFileIcon(file.name)}
        <span className="truncate">{file.name}</span>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-20">
        <Loader className="h-5 w-5 text-blue-500 animate-spin mr-2" />
        <span className="text-gray-400">Loading project files...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-red-500 p-4">
        Error: {error}
        <button
          onClick={() => initializeProject()}
          className="ml-2 text-blue-500 underline"
        >
          Retry
        </button>
      </div>
    );
  }

  // Filter for search
  const { files: filteredFiles, folders: filteredFolders } = getFilteredItems();

  // Root level items
  const rootFolders = filteredFolders.filter(folder => folder.parentId === null)
    .sort((a, b) => (a.order || 0) - (b.order || 0));

  const rootFiles = filteredFiles.filter(file => file.parentId === null)
    .sort((a, b) => (a.order || 0) - (b.order || 0));

  // Get all root items for the sortable context
  const rootItems = [...rootFolders, ...rootFiles];
  const rootIds = rootItems.map(item => item.id);

  return (
    <div className="text-gray-300">
      {/* Top Actions */}
      <div className="flex flex-col space-y-2 mb-4">
        {/* Header with Add Button */}
        <div className="flex items-center justify-between">
          <h2 className="text-gray-300 font-medium">Project Files</h2>
          <div className="flex items-center space-x-1">
            <button
              onClick={handleFileUpload}
              className="p-1.5 rounded-md hover:bg-gray-700 text-gray-300"
              title="Upload Files"
            >
              <Upload className="h-4 w-4" />
            </button>
            <button
              onClick={() => {
                setSelectedFolder(null);
                setShowAddMenu(true);
              }}
              className="p-1.5 rounded-md hover:bg-gray-700 text-gray-300"
              title="Add File/Folder"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Search Box */}
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none">
            <Search className="h-4 w-4 text-gray-400" />
          </div>
          <input
            type="text"
            placeholder="Search files..."
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-gray-700 border border-gray-600 rounded-md text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-gray-400 hover:text-gray-200"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Add File/Folder Menu */}
      {showAddMenu && (
        <div className="mb-4 p-4 bg-gray-700 rounded-md shadow-lg">
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-sm font-medium text-white">
              Add New {selectedFolder ? 'Item to Folder' : 'Root Item'}
            </h3>
            <button
              onClick={() => setShowAddMenu(false)}
              className="text-gray-400 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="mb-3">
            <label className="block text-sm text-gray-400 mb-1">Name:</label>
            <input
              type="text"
              value={newItemName}
              onChange={(e) => setNewItemName(e.target.value)}
              placeholder={newItemType === 'file' ? "filename" : "folder name"}
              className="w-full px-3 py-1.5 bg-gray-800 text-white border border-gray-600 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              autoFocus
            />
          </div>

          <div className="mb-4">
            <label className="block text-sm text-gray-400 mb-1">Type:</label>
            <div className="flex">
              <button
                onClick={() => setNewItemType('file')}
                className={`px-3 py-1.5 text-sm rounded-l ${newItemType === 'file'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-800 text-gray-300 hover:bg-gray-600'
                  }`}
              >
                File
              </button>
              <button
                onClick={() => setNewItemType('folder')}
                className={`px-3 py-1.5 text-sm rounded-r ${newItemType === 'folder'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-800 text-gray-300 hover:bg-gray-600'
                  }`}
              >
                Folder
              </button>
            </div>
          </div>

          {/* File extension selector */}
          {newItemType === 'file' && !newItemName.includes('.') && (
            <div className="mb-4">
              <label className="block text-sm text-gray-400 mb-1">Extension:</label>
              <div className="flex flex-wrap gap-2">
                {Object.keys(FILE_TEMPLATES).map(ext => (
                  <button
                    key={ext}
                    onClick={() => setFileExtension(ext)}
                    className={`px-3 py-1 text-xs rounded ${fileExtension === ext
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-800 text-gray-300 hover:bg-gray-600'
                      }`}
                  >
                    .{ext}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-end space-x-2">
            <button
              onClick={() => setShowAddMenu(false)}
              className="px-3 py-1.5 rounded text-sm bg-gray-600 hover:bg-gray-500"
            >
              Cancel
            </button>
            <button
              onClick={handleAddItem}
              className="px-3 py-1.5 rounded text-sm bg-blue-600 hover:bg-blue-700 text-white"
            >
              Create
            </button>
          </div>
        </div>
      )}

      {/* Recently Opened Files */}
      {recentFiles.length > 0 && !searchQuery && (
        <div className="mb-4">
          <h3 className="text-sm font-medium text-gray-400 mb-2">Recent Files</h3>
          <div className="space-y-0.5">
            {recentFiles.map(fileId => renderRecentFile(fileId))}
          </div>
          <div className="border-t border-gray-700 my-3"></div>
        </div>
      )}

      {/* File Tree with DnD */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        modifiers={[restrictToWindowEdges]}
      >
        <div className="overflow-auto max-h-[calc(100vh-200px)]">
          {rootItems.length === 0 ? (
            <p className="text-gray-400 text-sm py-2">
              {searchQuery
                ? "No files match your search"
                : "No files yet. Add your first file to get started."
              }
            </p>
          ) : (
            <SortableContext items={rootIds} strategy={verticalListSortingStrategy}>
              <div className="space-y-0.5">
                {rootFolders.map(folder => (
                  <div key={folder.id}>
                    <SortableFolderItem
                      folder={folder}
                      depth={0}
                      isExpanded={expandedFolders[folder.id] || false}
                      onToggle={toggleFolder}
                      onAddItem={setSelectedFolder}
                      onRename={(id, name) => handleStartRename(id, name)}
                      onDelete={handleDeleteItem}
                      onDuplicate={handleDuplicateItem}
                    />

                    {expandedFolders[folder.id] && renderFolderContent(folder.id, 1)}
                  </div>
                ))}

                {rootFiles.map(file => (
                  <SortableFileItem
                    key={file.id}
                    file={file}
                    depth={0}
                    isActive={currentFileId === file.id}
                    onSelect={handleFileSelect}
                    onRename={(id, name) => handleStartRename(id, name)}
                    onDelete={handleDeleteItem}
                    onDuplicate={handleDuplicateItem}
                  />
                ))}
              </div>
            </SortableContext>
          )}
        </div>

        {/* Drag overlay */}
        <DragOverlay>
          {draggedItem && draggedItem.type === 'file' && (
            <div className="flex items-center py-1.5 px-4 bg-gray-700 rounded border border-gray-600 shadow-lg opacity-90">
              {getFileIcon(files.find(f => f.id === draggedItem.id)?.name || '', "h-4 w-4 mr-2")}
              <span>{files.find(f => f.id === draggedItem.id)?.name}</span>
            </div>
          )}

          {draggedItem && draggedItem.type === 'folder' && (
            <div className="flex items-center py-1.5 px-4 bg-gray-700 rounded border border-gray-600 shadow-lg opacity-90">
              <Folder className="h-4 w-4 mr-2 text-blue-400" />
              <span>{folders.find(f => f.id === draggedItem.id)?.name}</span>
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {/* Rename Input (absolute positioned) */}
      {isRenaming && (
        <div className="fixed inset-0 bg-black bg-opacity-20 z-40 flex items-start justify-center">
          <div className="bg-gray-800 rounded-md shadow-lg p-4 mt-20 w-80">
            <h3 className="text-white font-medium mb-3">Rename</h3>
            <input
              id={`rename-input-${isRenaming}`}
              type="text"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              className="w-full px-3 py-2 bg-gray-700 text-white border border-gray-600 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent mb-3"
              autoFocus
            />
            <div className="flex justify-end space-x-2">
              <button
                onClick={() => setIsRenaming(null)}
                className="px-3 py-1.5 rounded text-sm bg-gray-600 hover:bg-gray-500"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const itemType = files.some(f => f.id === isRenaming) ? 'file' : 'folder';
                  handleRename(isRenaming, itemType);
                }}
                className="px-3 py-1.5 rounded text-sm bg-blue-600 hover:bg-blue-700 text-white"
              >
                Rename
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Hidden file input for uploads */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileInputChange}
        style={{ display: 'none' }}
        multiple
        accept=".tex,.bib,.md,.json,.txt"
      />
    </div>
  );
};

export default ProjectFileTree;