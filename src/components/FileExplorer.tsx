import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  File, Folder, ChevronRight, ChevronDown, Search, X, Plus,
  MoreHorizontal, Edit2, Trash2, Upload, FilePlus, FolderPlus,
  Star, FileText, Image, FileCode, FilePdf
} from 'lucide-react';
import { collection, query, where, orderBy, getDocs, doc, updateDoc, deleteDoc, addDoc, serverTimestamp, getDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '@/lib/firebase';

interface FileItem {
  id: string;
  _name_: string;
  type: 'file' | 'folder';
  fileType?: string;
  parentId: string | null;
  content?: string;
  createdAt: any;
  lastModified: any;
  downloadURL?: string;
}

interface FileExplorerProps {
  projectId: string;
  userId: string;
  currentFileId: string | null;
  onFileSelect: (fileId: string) => void;
  onFilesChange?: () => Promise<any[]>;
  className?: string;
}

const FileExplorer: React.FC<FileExplorerProps> = ({
  projectId,
  userId,
  currentFileId,
  onFileSelect,
  onFilesChange,
  className = ''
}) => {
  // State
  const [files, setFiles] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredFiles, setFilteredFiles] = useState<FileItem[]>([]);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; itemId: string } | null>(null);
  const [activeTab, setActiveTab] = useState<'files' | 'outline'>('files');
  const [renamingItemId, setRenamingItemId] = useState<string | null>(null);
  const [renamingValue, setRenamingValue] = useState('');
  const [favorites, setFavorites] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ [key: string]: number }>({});
  const [uploadComplete, setUploadComplete] = useState<boolean>(false);
  const [outline, setOutline] = useState<any[]>([]);
  
  // Refs
  const searchInputRef = useRef<HTMLInputElement>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Load files on component mount
  useEffect(() => {
    fetchFiles();
    
    // Load favorites from localStorage
    const storedFavorites = localStorage.getItem(`favorites-${projectId}`);
    if (storedFavorites) {
      setFavorites(JSON.parse(storedFavorites));
    }
  }, [projectId]);

  // Filter files based on search query
  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredFiles([]);
      return;
    }
    
    const filtered = files.filter(file => 
      file._name_.toLowerCase().includes(searchQuery.toLowerCase())
    );
    
    setFilteredFiles(filtered);
  }, [searchQuery, files]);
  
  // Close context menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(event.target as Node)) {
        setContextMenu(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Focus rename input when opened
  useEffect(() => {
    if (renamingItemId && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renamingItemId]);

  // Extract outline from a LaTeX file's content
  useEffect(() => {
    const getCurrentFileContent = async () => {
      if (!currentFileId) {
        setOutline([]);
        return;
      }

      try {
        const fileDoc = await getDoc(doc(db, "projectFiles", currentFileId));
        if (fileDoc.exists() && fileDoc.data().type === 'file') {
          const content = fileDoc.data().content || '';
          extractOutline(content);
        }
      } catch (error) {
        console.error("Error getting file content:", error);
      }
    };

    getCurrentFileContent();
  }, [currentFileId]);

  // Extract document structure from LaTeX content
  const extractOutline = (content: string) => {
    if (!content) {
      setOutline([]);
      return;
    }

    const lines = content.split('\n');
    const outlineItems = [];
    const sectionRegex = /\\(chapter|section|subsection|subsubsection)\{([^}]+)\}/;

    lines.forEach((line, index) => {
      const match = line.match(sectionRegex);
      if (match) {
        const type = match[1];
        const title = match[2];
        let level = 0;

        switch (type) {
          case 'chapter': level = 0; break;
          case 'section': level = 1; break;
          case 'subsection': level = 2; break;
          case 'subsubsection': level = 3; break;
        }

        outlineItems.push({
          id: `outline-${index}`,
          title,
          type,
          level,
          lineNumber: index + 1
        });
      }
    });

    setOutline(outlineItems);
  };

  // Fetch files from Firestore
  const fetchFiles = async () => {
    try {
      setLoading(true);
      
      let filesList: FileItem[] = [];
      
      if (onFilesChange) {
        filesList = await onFilesChange();
      } else {
        const filesQuery = query(
          collection(db, "projectFiles"),
          where("projectId", "==", projectId),
          orderBy("_name_", "asc")
        );
        
        const filesSnapshot = await getDocs(filesQuery);
        
        filesSnapshot.forEach((doc) => {
          filesList.push({
            id: doc.id,
            ...doc.data()
          } as FileItem);
        });
      }
      
      setFiles(filesList);
      
      // Auto-expand root folders
      const rootFolders = filesList.filter(f => f.type === 'folder' && f.parentId === null);
      const newExpandedFolders = { ...expandedFolders };
      
      rootFolders.forEach(folder => {
        newExpandedFolders[folder.id] = true;
      });
      
      setExpandedFolders(newExpandedFolders);
      setLoading(false);
    } catch (error) {
      console.error("Error fetching files:", error);
      setLoading(false);
    }
  };

  // Toggle folder expansion
  const toggleFolder = (folderId: string, event: React.MouseEvent) => {
    event.stopPropagation();
    setExpandedFolders(prev => ({
      ...prev,
      [folderId]: !prev[folderId]
    }));
  };

  // Toggle favorite status
  const toggleFavorite = (fileId: string, event: React.MouseEvent) => {
    event.stopPropagation();
    
    setFavorites(prev => {
      const newFavorites = prev.includes(fileId)
        ? prev.filter(id => id !== fileId)
        : [...prev, fileId];
      
      localStorage.setItem(`favorites-${projectId}`, JSON.stringify(newFavorites));
      return newFavorites;
    });
  };

  // Show context menu
  const handleContextMenu = (event: React.MouseEvent, itemId: string) => {
    event.preventDefault();
    event.stopPropagation();
    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      itemId
    });
  };
  
  // Start renaming item
  const startRenaming = (itemId: string) => {
    const item = files.find(f => f.id === itemId);
    if (item) {
      setRenamingItemId(itemId);
      setRenamingValue(item._name_);
    }
    setContextMenu(null);
  };

  // Save renamed item
  const saveRename = async () => {
    if (!renamingItemId || !renamingValue.trim()) {
      setRenamingItemId(null);
      return;
    }

    try {
      const itemRef = doc(db, "projectFiles", renamingItemId);
      await updateDoc(itemRef, {
        _name_: renamingValue.trim(),
        lastModified: serverTimestamp()
      });
      
      await fetchFiles();
    } catch (error) {
      console.error("Error renaming item:", error);
    } finally {
      setRenamingItemId(null);
    }
  };

  // Create a new file
  const createFile = async (parentId: string | null = null) => {
    const fileName = prompt("Enter file name:");
    if (!fileName) return;

    try {
      const fileData = {
        _name_: fileName,
        type: 'file',
        fileType: 'text',
        projectId: projectId,
        parentId: parentId,
        ownerId: userId,
        content: '',
        createdAt: serverTimestamp(),
        lastModified: serverTimestamp()
      };

      const docRef = await addDoc(collection(db, "projectFiles"), fileData);
      
      await fetchFiles();
      onFileSelect(docRef.id);
    } catch (error) {
      console.error("Error creating file:", error);
    }
  };

  // Create a new folder
  const createFolder = async (parentId: string | null = null) => {
    const folderName = prompt("Enter folder name:");
    if (!folderName) return;

    try {
      const folderData = {
        _name_: folderName,
        type: 'folder',
        projectId: projectId,
        parentId: parentId,
        ownerId: userId,
        createdAt: serverTimestamp(),
        lastModified: serverTimestamp()
      };

      await addDoc(collection(db, "projectFiles"), folderData);
      
      await fetchFiles();
    } catch (error) {
      console.error("Error creating folder:", error);
    }
  };

  // Delete file or folder
  const deleteItem = async (itemId: string) => {
    const item = files.find(f => f.id === itemId);
    if (!item) return;

    if (!window.confirm(`Are you sure you want to delete "${item._name_}"?`)) {
      return;
    }

    try {
      // If it's a folder, delete all children recursively
      if (item.type === 'folder') {
        await deleteFolder(itemId);
      }

      await deleteDoc(doc(db, "projectFiles", itemId));
      
      setContextMenu(null);
      await fetchFiles();
      
      // Remove from favorites if present
      if (favorites.includes(itemId)) {
        setFavorites(prev => {
          const newFavorites = prev.filter(id => id !== itemId);
          localStorage.setItem(`favorites-${projectId}`, JSON.stringify(newFavorites));
          return newFavorites;
        });
      }
    } catch (error) {
      console.error("Error deleting item:", error);
    }
  };

  // Recursively delete folder and its contents
  const deleteFolder = async (folderId: string) => {
    const children = files.filter(f => f.parentId === folderId);
    
    for (const child of children) {
      if (child.type === 'folder') {
        await deleteFolder(child.id);
      }
      
      await deleteDoc(doc(db, "projectFiles", child.id));
    }
  };

  // Read text file content
  const readFileAsText = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          resolve(event.target.result as string);
        } else {
          reject(new Error("Failed to read file"));
        }
      };
      reader.onerror = (error) => reject(error);
      reader.readAsText(file);
    });
  };

  // Handle file upload
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    setIsUploading(true);
    setUploadProgress({});
    
    try {
      // Convert FileList to array for easier processing
      const fileArray = Array.from(files);
      const uploadPromises = fileArray.map(async (file) => {
        // Initialize progress for this file
        setUploadProgress(prev => ({ ...prev, [file.name]: 0 }));
        
        // For text files (like .tex, .bib, etc.), read content and store directly
        if (
          file.type === 'text/plain' || 
          file.name.endsWith('.tex') || 
          file.name.endsWith('.bib') || 
          file.name.endsWith('.cls') || 
          file.name.endsWith('.sty')
        ) {
          const content = await readFileAsText(file);
          
          // Add file to Firestore
          await addDoc(collection(db, "projectFiles"), {
            _name_: file.name,
            type: 'file',
            fileType: 'text',
            size: file.size,
            content: content,
            projectId: projectId,
            parentId: null,
            ownerId: userId,
            createdAt: serverTimestamp(),
            lastModified: serverTimestamp()
          });
          
          // Update progress
          setUploadProgress(prev => ({ ...prev, [file.name]: 100 }));
          
          return { name: file.name, success: true };
        } 
        // For binary files (images, PDFs, etc.), upload to Storage
        else {
          // Create a reference to the file location in Firebase Storage
          const fileRef = ref(storage, `projects/${projectId}/files/${file.name}`);
          
          // Upload the file
          await uploadBytes(fileRef, file);
          
          // Get the download URL
          const downloadURL = await getDownloadURL(fileRef);
          
          // Add file metadata to Firestore
          await addDoc(collection(db, "projectFiles"), {
            _name_: file.name,
            type: 'file',
            fileType: 'binary',
            size: file.size,
            storageRef: fileRef.fullPath,
            downloadURL: downloadURL,
            projectId: projectId,
            parentId: null,
            ownerId: userId,
            createdAt: serverTimestamp(),
            lastModified: serverTimestamp()
          });
          
          // Update progress
          setUploadProgress(prev => ({ ...prev, [file.name]: 100 }));
          
          return { name: file.name, success: true };
        }
      });
      
      await Promise.all(uploadPromises);
      setUploadComplete(true);
      
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      
      // Refresh file list
      await fetchFiles();
      
      // Clear progress after a delay
      setTimeout(() => {
        setUploadProgress({});
        setUploadComplete(false);
        setIsUploading(false);
      }, 3000);
    } catch (error) {
      console.error("Upload error:", error);
      setIsUploading(false);
    }
  };

  // Helper function to get file icon based on file type
  const getFileIcon = (fileName: string) => {
    if (fileName.endsWith('.tex')) {
      return <FileText className="h-4 w-4 text-amber-400" />;
    } else if (fileName.match(/\.(png|jpg|jpeg|gif|svg)$/i)) {
      return <Image className="h-4 w-4 text-blue-400" />;
    } else if (fileName.endsWith('.pdf')) {
      return <FilePdf className="h-4 w-4 text-red-400" />;
    } else if (fileName.match(/\.(cls|sty|bib)$/i)) {
      return <FileCode className="h-4 w-4 text-green-400" />;
    } else {
      return <File className="h-4 w-4 text-blue-400" />;
    }
  };

  // Jump to a section in the editor
  const jumpToSection = (lineNumber: number) => {
    // This would be implemented to communicate with the editor component
    console.log(`Jump to line ${lineNumber}`);
  };

  // Recursive function to render file tree
  const renderFileTree = (parentId: string | null = null, depth: number = 0) => {
    const childItems = files.filter(file => file.parentId === parentId);
    
    if (childItems.length === 0) {
      return parentId === null ? (
        <div className="py-6 text-center text-gray-500">
          <Folder className="h-12 w-12 mx-auto mb-3 text-gray-400 opacity-50" />
          <p className="text-sm mb-4">No files yet</p>
          <div className="flex justify-center space-x-2">
            <button
              onClick={() => createFile(null)}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded-md flex items-center"
            >
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              New File
            </button>
          </div>
        </div>
      ) : null;
    }
    
    // Sort: favorites first, then folders, then files alphabetically
    const sortedItems = [...childItems].sort((a, b) => {
      // Favorites first
      if (favorites.includes(a.id) && !favorites.includes(b.id)) return -1;
      if (!favorites.includes(a.id) && favorites.includes(b.id)) return 1;
      
      // Then folders vs files
      if (a.type !== b.type) {
        return a.type === 'folder' ? -1 : 1;
      }
      
      // Then alphabetically
      return a._name_.localeCompare(b._name_);
    });
    
    return (
      <div className={depth > 0 ? "ml-3 border-l border-gray-700 pl-1" : ""}>
        {sortedItems.map(item => {
          const isFolder = item.type === 'folder';
          const isExpanded = expandedFolders[item.id];
          const isActive = currentFileId === item.id;
          const hasChildren = files.some(f => f.parentId === item.id);
          const isFavorite = favorites.includes(item.id);
          
          return (
            <div key={item.id} className="relative">
              <div
                className={`group flex items-center py-1 px-1.5 cursor-pointer rounded-md my-0.5 transition-colors ${
                  isActive ? 'bg-blue-600/80 text-white' : 
                  isFavorite ? 'text-white hover:bg-gray-700/80' : 
                  'text-gray-300 hover:bg-gray-700/60'
                }`}
                onClick={isFolder ? () => {} : () => onFileSelect(item.id)}
                onContextMenu={(e) => handleContextMenu(e, item.id)}
                onMouseEnter={() => {}}
                onMouseLeave={() => {}}
              >
                {isFolder ? (
                  <div 
                    className="flex items-center flex-1"
                    onClick={(e) => toggleFolder(item.id, e)}
                  >
                    <span className="w-4 flex justify-center">
                      {hasChildren && (
                        isExpanded ? (
                          <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
                        ) : (
                          <ChevronRight className="h-3.5 w-3.5 text-gray-400" />
                        )
                      )}
                    </span>
                    
                    <Folder className={`h-4 w-4 ${isActive ? 'text-white' : 'text-yellow-400'} mr-1.5`} />
                    
                    {renamingItemId === item.id ? (
                      <input
                        ref={renameInputRef}
                        className="ml-1 p-0.5 text-sm bg-gray-800 border border-blue-500 rounded flex-1 min-w-0 text-white"
                        value={renamingValue}
                        onChange={(e) => setRenamingValue(e.target.value)}
                        onBlur={saveRename}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') saveRename();
                          if (e.key === 'Escape') setRenamingItemId(null);
                        }}
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : (
                      <span className="text-sm font-medium truncate">
                        {item._name_}
                      </span>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center flex-1">
                    <span className="w-4" />
                    {getFileIcon(item._name_)}
                    <span className="ml-1.5" />
                    
                    {renamingItemId === item.id ? (
                      <input
                        ref={renameInputRef}
                        className="ml-1 p-0.5 text-sm bg-gray-800 border border-blue-500 rounded flex-1 min-w-0 text-white"
                        value={renamingValue}
                        onChange={(e) => setRenamingValue(e.target.value)}
                        onBlur={saveRename}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') saveRename();
                          if (e.key === 'Escape') setRenamingItemId(null);
                        }}
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : (
                      <span className="text-sm truncate">
                        {item._name_}
                      </span>
                    )}
                  </div>
                )}
                
                {/* Item actions */}
                {renamingItemId !== item.id && (
                  <div className="opacity-0 group-hover:opacity-100 flex items-center space-x-1 ml-auto">
                    <button
                      onClick={(e) => toggleFavorite(item.id, e)}
                      className={`p-1 rounded-full ${isFavorite ? 'text-yellow-400 opacity-100' : 'text-gray-400 hover:text-yellow-400'}`}
                      title={isFavorite ? "Remove from favorites" : "Add to favorites"}
                    >
                      <Star className="h-3.5 w-3.5" />
                    </button>
                    
                    <button
                      className="p-1 rounded-full text-gray-400 hover:text-white"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleContextMenu(e, item.id);
                      }}
                      title="More options"
                    >
                      <MoreHorizontal className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>
              
              {/* Render folder children if expanded */}
              {isFolder && isExpanded && renderFileTree(item.id, depth + 1)}
            </div>
          );
        })}
      </div>
    );
  };

  // Render outline
  const renderOutline = () => {
    if (outline.length === 0) {
      return (
        <div className="py-6 text-center text-gray-500">
          <FileText className="h-12 w-12 mx-auto mb-3 text-gray-400 opacity-50" />
          <p className="text-sm">No document structure found</p>
          <p className="text-xs mt-2 text-gray-600 max-w-xs mx-auto">
            Add sections to your LaTeX document using \section{}, \subsection{}, etc.
          </p>
        </div>
      );
    }
    
    return (
      <div className="p-2">
        {outline.map((item) => (
          <div
            key={item.id}
            className="flex items-center py-1 px-2 rounded-md cursor-pointer hover:bg-gray-700/60 text-gray-300"
            style={{ paddingLeft: `${item.level * 12 + 8}px` }}
            onClick={() => jumpToSection(item.lineNumber)}
          >
            <div className="w-2 h-2 bg-blue-500 rounded-full mr-2"></div>
            <span className="text-sm truncate">{item.title}</span>
          </div>
        ))}
      </div>
    );
  };

  // Render file search results
  const renderSearchResults = () => {
    if (!searchQuery) return null;
    
    return filteredFiles.length > 0 ? (
      <div className="p-2">
        <div className="text-sm text-gray-400 px-2 py-1">
          {filteredFiles.length} {filteredFiles.length === 1 ? 'result' : 'results'}
        </div>
        
        {filteredFiles.map(file => (
          <div
            key={file.id}
            className={`flex items-center py-1.5 px-2 rounded-md cursor-pointer my-1 ${
              currentFileId === file.id 
                ? 'bg-blue-600/80 text-white' 
                : 'text-gray-300 hover:bg-gray-700/60'
            }`}
            onClick={() => onFileSelect(file.id)}
          >
            {file.type === 'folder' 
              ? <Folder className="h-4 w-4 text-yellow-400" /> 
              : getFileIcon(file._name_)
            }
            <span className="ml-2 text-sm truncate">{file._name_}</span>
          </div>
        ))}
      </div>
    ) : (
      <div className="text-sm text-gray-500 text-center py-4">
        No matching files found
      </div>
    );
  };

  // Decide what content to render based on state
  const renderContent = () => {
    if (loading) {
      return (
        <div className="flex justify-center items-center h-48">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
        </div>
      );
    }
    
    if (searchQuery) {
      return renderSearchResults();
    }
    
    switch (activeTab) {
      case 'files':
        return renderFileTree();
      case 'outline':
        return renderOutline();
      default:
        return renderFileTree();
    }
  };

  return (
    <div className={`flex flex-col h-full bg-gray-900 ${className}`}>
      {/* Search bar */}
      <div className="p-2 border-b border-gray-700/50">
        <div className="relative">
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Search files..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-gray-800 text-gray-200 placeholder-gray-500 text-sm rounded-md py-1.5 pl-8 pr-3 focus:outline-none focus:ring-1 focus:ring-blue-500 border border-gray-700"
          />
          <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-gray-500" />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-2 text-gray-500 hover:text-gray-300"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
      
      {/* Tabs */}
      <div className="flex border-b border-gray-700/50 bg-gray-800/30">
        <button
          className={`flex-1 py-2 text-xs font-medium ${
            activeTab === 'files' 
              ? 'text-blue-400 border-b-2 border-blue-400' 
              : 'text-gray-400 hover:text-gray-300'
          }`}
          onClick={() => setActiveTab('files')}
        >
          Files
        </button>
        <button
          className={`flex-1 py-2 text-xs font-medium ${
            activeTab === 'outline' 
              ? 'text-blue-400 border-b-2 border-blue-400' 
              : 'text-gray-400 hover:text-gray-300'
          }`}
          onClick={() => setActiveTab('outline')}
        >
          Outline
        </button>
      </div>
      
      {/* Main content */}
      <div className="flex-1 overflow-auto scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent">
        {renderContent()}
      </div>
      
      {/* Upload progress */}
      {Object.keys(uploadProgress).length > 0 && (
        <div className="p-2 border-t border-gray-700/50 bg-gray-800/50">
          <div className="text-xs font-medium text-gray-300 mb-1.5 flex justify-between">
            <span>Uploading files...</span>
            {uploadComplete && <span className="text-green-400">Complete!</span>}
          </div>
          <div className="space-y-2">
            {Object.entries(uploadProgress).map(([fileName, progress]) => (
              <div key={fileName} className="bg-gray-900 rounded p-1.5">
                <div className="flex justify-between text-xs mb-1">
                  <span className="font-medium truncate text-gray-300">{fileName}</span>
                  <span className="text-gray-400">{progress}%</span>
                </div>
                <div className="w-full bg-gray-700 rounded-full h-1">
                  <div 
                    className="bg-blue-600 h-1 rounded-full transition-all duration-300" 
                    style={{ width: `${progress}%` }}
                  ></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      
      {/* Buttons at bottom */}
      <div className="p-2 border-t border-gray-700/50 bg-gray-800/30 flex justify-between">
        <button
          onClick={() => createFile(null)}
          className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded-md flex items-center transition-colors"
        >
          <FilePlus className="h-3.5 w-3.5 mr-1.5" />
          New File
        </button>
        
        <button
          onClick={() => createFolder(null)}
          className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white text-xs rounded-md flex items-center transition-colors"
        >
          <FolderPlus className="h-3.5 w-3.5 mr-1.5" />
          New Folder
        </button>
        
        <label
          className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white text-xs rounded-md flex items-center cursor-pointer transition-colors"
        >
          <Upload className="h-3.5 w-3.5 mr-1.5" />
          Upload
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            className="hidden"
            multiple
          />
        </label>
      </div>
      
      {/* Context Menu */}
      {contextMenu && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setContextMenu(null)}
          />
          <div
            ref={contextMenuRef}
            style={{
              position: 'fixed',
              left: `${contextMenu.x}px`,
              top: `${contextMenu.y}px`,
              zIndex: 50
            }}
            className="bg-gray-800 rounded-lg shadow-lg border border-gray-700 py-1 min-w-[160px] animate-in fade-in zoom-in-95 duration-100"
          >
            <button
              onClick={() => onFileSelect(contextMenu.itemId)}
              className="w-full text-left px-3 py-1.5 text-sm flex items-center hover:bg-gray-700/80 text-gray-300"
            >
              <File className="h-4 w-4 mr-3 text-gray-500" />
              Open
            </button>
            
            <button
              onClick={() => startRenaming(contextMenu.itemId)}
              className="w-full text-left px-3 py-1.5 text-sm flex items-center hover:bg-gray-700/80 text-gray-300"
            >
              <Edit2 className="h-4 w-4 mr-3 text-gray-500" />
              Rename
            </button>
            
            <button
              onClick={(e) => toggleFavorite(contextMenu.itemId, e)}
              className="w-full text-left px-3 py-1.5 text-sm flex items-center hover:bg-gray-700/80 text-gray-300"
            >
              <Star className="h-4 w-4 mr-3 text-gray-500" />
              {favorites.includes(contextMenu.itemId) ? 'Remove from favorites' : 'Add to favorites'}
            </button>
            
            <div className="border-t border-gray-700 my-1"></div>
            
            {files.find(f => f.id === contextMenu.itemId)?.type === 'folder' && (
              <>
                <button
                  onClick={() => {
                    createFile(contextMenu.itemId);
                    setContextMenu(null);
                  }}
                  className="w-full text-left px-3 py-1.5 text-sm flex items-center hover:bg-gray-700/80 text-gray-300"
                >
                  <FilePlus className="h-4 w-4 mr-3 text-gray-500" />
                  New File
                </button>
                
                <button
                  onClick={() => {
                    createFolder(contextMenu.itemId);
                    setContextMenu(null);
                  }}
                  className="w-full text-left px-3 py-1.5 text-sm flex items-center hover:bg-gray-700/80 text-gray-300"
                >
                  <FolderPlus className="h-4 w-4 mr-3 text-gray-500" />
                  New Folder
                </button>
                
                <div className="border-t border-gray-700 my-1"></div>
              </>
            )}
            
            <button
              onClick={() => deleteItem(contextMenu.itemId)}
              className="w-full text-left px-3 py-1.5 text-sm flex items-center hover:bg-gray-700/80 text-red-400"
            >
              <Trash2 className="h-4 w-4 mr-3 text-red-400" />
              Delete
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default FileExplorer;