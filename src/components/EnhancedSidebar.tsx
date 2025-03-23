// components/EnhancedSidebar.tsx
"use client";

import React, { useState, useEffect, useRef } from "react";
// Fix import issue by importing icons individually
import { ChevronDown } from "lucide-react";
import { ChevronRight } from "lucide-react";
import { Search } from "lucide-react";
import { X } from "lucide-react";
import { Edit2 } from "lucide-react";
import { Trash2 } from "lucide-react";
import DndFileTree from './DraggableFileTree';
import { Globe } from "lucide-react";
import { Download } from "lucide-react";
import { Upload } from "lucide-react";
// Replace FilePdf with File (generic icon) - assuming FilePdf is causing issues
import { File as FileIcon } from "lucide-react";
import { Folder } from "lucide-react";
import { FolderPlus } from "lucide-react";
import { FilePlus } from "lucide-react";

import { useRouter } from "next/navigation";
import { 
  collection, query, where, getDocs, addDoc, 
  doc, updateDoc, deleteDoc, serverTimestamp, 
  onSnapshot, orderBy, getDoc, setDoc 
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { authenticateWithFirebase } from "@/lib/firebase-auth";

// Type definitions
interface FileItem {
  id: string;
  name: string;
  type: "file" | "folder";
  parentId: string | null;
  content?: string;
  createdAt: any;
  lastModified: any;
  ownerId: string;
  isOpen?: boolean;
  children?: FileItem[];
  fileType?: string;
  downloadURL?: string;
}

interface SidebarProps {
  userId: string;
  projectId: string;
  activeFileId: string | null;
  onFileSelect: (fileId: string, content: string) => void;
  onSidebarToggle?: () => void;
  collapsed?: boolean;
}

// Main Sidebar Component
const EnhancedSidebar: React.FC<SidebarProps> = ({
  userId,
  projectId,
  activeFileId,
  onFileSelect,
  onSidebarToggle,
  collapsed = false
}) => {
  const router = useRouter();
  const [files, setFiles] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState("");
  const [filteredFiles, setFilteredFiles] = useState<FileItem[]>([]);
  const [newItemName, setNewItemName] = useState("");
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});
  const [isAddingFile, setIsAddingFile] = useState(false);
  const [isAddingFolder, setIsAddingFolder] = useState(false);
  const [currentParentId, setCurrentParentId] = useState<string | null>(null);
  const [fileStructure, setFileStructure] = useState<FileItem[]>([]);
  const [contextMenu, setContextMenu] = useState<{
    visible: boolean;
    x: number;
    y: number;
    fileId: string | null;
  }>({
    visible: false,
    x: 0,
    y: 0,
    fileId: null,
  });
  const [renaming, setRenaming] = useState<{
    id: string | null;
    name: string;
  }>({
    id: null,
    name: "",
  });
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ [key: string]: number }>({});
  const [isUrlModalOpen, setIsUrlModalOpen] = useState(false);
  const [urlInput, setUrlInput] = useState("");
  const [urlFileName, setUrlFileName] = useState("");

  // Refs
  const fileInputRef = useRef<HTMLInputElement>(null);
  const urlInputRef = useRef<HTMLInputElement>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  const handleFolderToggle = (folderId: string) => {
    setExpandedFolders(prev => ({
      ...prev,
      [folderId]: !prev[folderId]
    }));
  };
  

  // Helper function to get file icon based on file type
  const getFileIcon = (fileName: string) => {
    const extension = fileName.split('.').pop()?.toLowerCase();
    
    // Using generic FileIcon instead of specific icons that might not be available
    if (extension === 'tex' || extension === 'latex') 
      return <FileIcon className="h-4 w-4 text-amber-400" />;
    if (['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp'].includes(extension || '')) 
      return <FileIcon className="h-4 w-4 text-blue-400" />;
    if (extension === 'pdf') 
      return <FileIcon className="h-4 w-4 text-red-400" />;
    if (['mp3', 'wav', 'ogg'].includes(extension || '')) 
      return <FileIcon className="h-4 w-4 text-purple-400" />;
    if (['mp4', 'webm', 'mov'].includes(extension || '')) 
      return <FileIcon className="h-4 w-4 text-pink-400" />;
    if (['bib', 'cls', 'sty'].includes(extension || '')) 
      return <FileIcon className="h-4 w-4 text-green-400" />;
    
    return <FileIcon className="h-4 w-4 text-gray-400" />;
  };

  // Fetch files when component mounts
  useEffect(() => {
    if (!userId || !projectId) return;

    const fetchFiles = async () => {
      try {
        // Authenticate with Firebase
        await authenticateWithFirebase(userId);

        // Get project files
        const filesRef = collection(db, "project_files");
        const q = query(
          filesRef,
          where("projectId", "==", projectId),
          orderBy("createdAt", "asc")
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
          const filesData: FileItem[] = [];
          snapshot.forEach((doc) => {
            filesData.push({
              id: doc.id,
              ...doc.data(),
            } as FileItem);
          });

          setFiles(filesData);
          setLoading(false);
        }, (error) => {
          console.error("Error fetching files:", error);
          setLoading(false);
        });

        return unsubscribe;
      } catch (error) {
        console.error("Error setting up files listener:", error);
        setLoading(false);
      }
    };

    fetchFiles();
  }, [userId, projectId]);

  // Build file tree structure
  useEffect(() => {
    const buildFileTree = (items: FileItem[], parentId: string | null = null): FileItem[] => {
      return items
        .filter(item => item.parentId === parentId)
        .map(item => ({
          ...item,
          isOpen: item.isOpen || false,
          children: buildFileTree(items, item.id)
        }));
    };

    const fileTree = buildFileTree(files);
    setFileStructure(fileTree);
  }, [files]);

  // Filter files based on search text
  useEffect(() => {
    if (!searchText.trim()) {
      setFilteredFiles([]);
      return;
    }

    const filtered = files.filter(file =>
      file.name.toLowerCase().includes(searchText.toLowerCase())
    );
    setFilteredFiles(filtered);
  }, [searchText, files]);

  // Click outside to close context menu
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(event.target as Node)) {
        setContextMenu({
          visible: false,
          x: 0,
          y: 0,
          fileId: null
        });
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Focus rename input when opened
  useEffect(() => {
    if (renaming.id && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renaming.id]);

  // Get file type from file name
  const getFileTypeFromName = (fileName: string): string => {
    const extension = fileName.split('.').pop()?.toLowerCase();
    
    if (extension === 'tex' || extension === 'latex') return 'latex';
    if (['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp'].includes(extension || '')) return 'image';
    if (extension === 'pdf') return 'pdf';
    if (['mp3', 'wav', 'ogg'].includes(extension || '')) return 'audio';
    if (['mp4', 'webm', 'mov'].includes(extension || '')) return 'video';
    if (['bib'].includes(extension || '')) return 'bibliography';
    if (['cls', 'sty'].includes(extension || '')) return 'style';
    
    return 'text';
  };

  // Toggle folder open/closed
  const toggleFolder = (id: string) => {
    setFileStructure(prevStructure => {
      const updateFolderState = (items: FileItem[]): FileItem[] => {
        return items.map(item => {
          if (item.id === id) {
            return { ...item, isOpen: !item.isOpen };
          } else if (item.children && item.children.length > 0) {
            return { ...item, children: updateFolderState(item.children) };
          }
          return item;
        });
      };
      return updateFolderState(prevStructure);
    });
  };

  // Handle file search
  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchText(e.target.value);
  };

  // Clear search
  const clearSearch = () => {
    setSearchText("");
  };

  // Show context menu
  const handleContextMenu = (e: React.MouseEvent, fileId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      fileId
    });
  };

  // Hide context menu
  const hideContextMenu = () => {
    setContextMenu({
      visible: false,
      x: 0,
      y: 0,
      fileId: null
    });
  };

  // Start renaming a file/folder
  const startRenaming = (id: string, currentName: string) => {
    setRenaming({
      id,
      name: currentName
    });
    hideContextMenu();
  };

  // Handle rename submit
  const handleRename = (fileId: string, currentName: string) => {
    const newName = prompt("Enter new name:", currentName);
    if (!newName || newName === currentName) return;
  
    try {
      // Try both collections for consistency
      const collections = ['projectFiles', 'project_files'];
      
      for (const collectionName of collections) {
        try {
          const fileRef = doc(db, collectionName, fileId);
          updateDoc(fileRef, {
            _name_: newName,
            lastModified: serverTimestamp()
          }).then(() => {
            console.log(`File renamed in ${collectionName}`);
            refreshFiles(); // Make sure you have this function defined
          }).catch(err => {
            console.log(`Error updating in ${collectionName}`);
          });
        } catch (err) {
          console.log(`Error accessing ${collectionName}`);
        }
      }
    } catch (error) {
      console.error("Error renaming file:", error);
    }
  };

  const handleDelete = (fileId: string) => {
    if (!window.confirm("Are you sure you want to delete this item?")) {
      return;
    }
  
    try {
      // Try both collections for consistency
      const collections = ['projectFiles', 'project_files'];
      
      for (const collectionName of collections) {
        try {
          const fileRef = doc(db, collectionName, fileId);
          deleteDoc(fileRef).then(() => {
            console.log(`File deleted from ${collectionName}`);
            refreshFiles(); // Make sure you have this function defined
          }).catch(err => {
            console.log(`Error deleting from ${collectionName}`);
          });
        } catch (err) {
          console.log(`Error accessing ${collectionName}`);
        }
      }
    } catch (error) {
      console.error("Error deleting file:", error);
    }
  };
  
  
  // Delete file/folder and all children
  const deleteFileOrFolder = async (id: string) => {
    try {
      // Find the item to delete
      const itemToDelete = files.find(file => file.id === id);
      if (!itemToDelete) return;
      
      // If it's a folder, recursively delete all children
      if (itemToDelete.type === 'folder') {
        // Function to get all descendant file IDs
        const getAllDescendantIds = (parentId: string): string[] => {
          const directChildren = files.filter(file => file.parentId === parentId);
          let allDescendants: string[] = directChildren.map(child => child.id);
          
          // For each child that's a folder, get its descendants
          directChildren.forEach(child => {
            if (child.type === 'folder') {
              allDescendants = [...allDescendants, ...getAllDescendantIds(child.id)];
            }
          });
          
          return allDescendants;
        };
        
        const descendantIds = getAllDescendantIds(id);
        
        // Delete all descendants
        for (const descendantId of descendantIds) {
          await deleteDoc(doc(db, "project_files", descendantId));
        }
      }
      
      // Delete the file/folder itself
      await deleteDoc(doc(db, "project_files", id));
      
      hideContextMenu();
    } catch (error) {
      console.error("Error deleting file:", error);
    }
  };

  // Create a new file or folder
  const createNewItem = (type: 'file' | 'folder', parentId: string | null = null) => {
    setIsAddingFile(type === 'file');
    setIsAddingFolder(type === 'folder');
    setNewItemName("");
    setCurrentParentId(parentId);
  };

  // Handle new item creation
  const handleCreateNewItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemName.trim() || (!isAddingFile && !isAddingFolder)) return;
    
    try {
      const itemType = isAddingFile ? 'file' : 'folder';
      const defaultContent = isAddingFile 
        ? `% ${newItemName.trim()}\n\n% Start your content here`
        : '';
      
      // Create document data object without undefined values
      const docData: Record<string, any> = {
        name: newItemName.trim(),
        type: itemType,
        projectId,
        parentId: currentParentId,
        ownerId: userId,
        createdAt: serverTimestamp(),
        lastModified: serverTimestamp(),
      };
      
      // Only add content and fileType for files, not folders
      if (isAddingFile) {
        docData.content = defaultContent;
        docData.fileType = getFileTypeFromName(newItemName.trim());
      }
      
      await addDoc(collection(db, "project_files"), docData);
      
      setNewItemName("");
      setIsAddingFile(false);
      setIsAddingFolder(false);
    } catch (error) {
      console.error(`Error creating ${isAddingFile ? 'file' : 'folder'}:`, error);
    }
  };

  // Cancel creating new item
  const cancelNewItem = () => {
    setIsAddingFile(false);
    setIsAddingFolder(false);
    setNewItemName("");
  };

  // Handle file selection
  const handleFileSelect = async (fileId: string) => {
    try {
      // Try both collections for consistency
      let fileData = null;
      let foundDoc = false;
      
      // Try project_files (snake_case)
      try {
        const fileRef = doc(db, "project_files", fileId);
        const fileDoc = await getDoc(fileRef);
        if (fileDoc.exists()) {
          fileData = fileDoc.data();
          foundDoc = true;
        }
      } catch (err) {
        console.log("Document not found in project_files");
      }
      
      // If not found, try projectFiles (camelCase)
      if (!foundDoc) {
        try {
          const fileRef = doc(db, "projectFiles", fileId);
          const fileDoc = await getDoc(fileRef);
          if (fileDoc.exists()) {
            fileData = fileDoc.data();
            foundDoc = true;
          }
        } catch (err) {
          console.log("Document not found in projectFiles");
        }
      }

      if (fileData && foundDoc && fileData.type === 'file') {
        onFileSelect(fileId, fileData.content || '');
      }
    } catch (error) {
      console.error("Error selecting file:", error);
    }
  };

  // Handle file upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    setIsUploading(true);
    
    const uploadPromises = Array.from(files).map(file => {
      return new Promise<void>((resolve, reject) => {
        const reader = new FileReader();
        
        reader.onload = async (event) => {
          try {
            // Update progress
            setUploadProgress(prev => ({ ...prev, [file.name]: 25 }));
            
            // Get file content
            const content = event.target?.result as string;
            
            // Create new file in Firestore
            await addDoc(collection(db, "project_files"), {
              name: file.name,
              type: 'file',
              fileType: getFileTypeFromName(file.name),
              projectId,
              parentId: currentParentId,
              ownerId: userId,
              content,
              createdAt: serverTimestamp(),
              lastModified: serverTimestamp()
            });
            
            // Update progress to complete
            setUploadProgress(prev => ({ ...prev, [file.name]: 100 }));
            
            resolve();
          } catch (error) {
            console.error("Error uploading file:", error);
            setUploadProgress(prev => ({ ...prev, [file.name]: -1 })); // -1 indicates error
            reject(error);
          }
        };
        
        reader.onerror = (error) => {
          setUploadProgress(prev => ({ ...prev, [file.name]: -1 }));
          reject(error);
        };
        
        // Start reading the file
        setUploadProgress(prev => ({ ...prev, [file.name]: 0 }));
        
        if (file.type.startsWith('image/') || 
            file.type.startsWith('video/') || 
            file.type.startsWith('audio/')) {
          reader.readAsDataURL(file); // Read binary files as data URL
        } else {
          reader.readAsText(file); // Read text files as text
        }
      });
    });
    
    Promise.all(uploadPromises)
      .then(() => {
        setIsUploading(false);
        // Clear upload progress after a delay
        setTimeout(() => {
          setUploadProgress({});
        }, 3000);
      })
      .catch(error => {
        console.error("Error in file upload:", error);
        setIsUploading(false);
      });
      
    // Clear the input
    e.target.value = '';
  };

  // Handle URL import
  const openUrlModal = (type: "image" | "media" | "document") => {
    setIsUrlModalOpen(true);
    setUrlInput("");
    setUrlFileName("");
    setTimeout(() => {
      if (urlInputRef.current) {
        urlInputRef.current.focus();
      }
    }, 100);
  };

  const handleUrlImport = async () => {
    if (!urlInput.trim() || !urlFileName.trim()) return;
    
    try {
      setIsUploading(true);
      setUploadProgress(prev => ({ ...prev, [urlFileName]: 0 }));
      
      // For media URLs, store the URL directly
      await addDoc(collection(db, "project_files"), {
        name: urlFileName.trim(),
        type: 'file',
        fileType: getFileTypeFromName(urlFileName.trim()),
        projectId,
        parentId: currentParentId,
        ownerId: userId,
        content: urlInput.trim(),
        downloadURL: urlInput.trim(),
        isExternalUrl: true,
        createdAt: serverTimestamp(),
        lastModified: serverTimestamp()
      });
      
      setUploadProgress(prev => ({ ...prev, [urlFileName]: 100 }));
      
      // Hide modal and reset
      setIsUrlModalOpen(false);
      setUrlInput("");
      setUrlFileName("");
      
      // Clear progress indicator after delay
      setTimeout(() => {
        setUploadProgress({});
        setIsUploading(false);
      }, 2000);
      
    } catch (error) {
      console.error("Error importing URL:", error);
      setUploadProgress(prev => ({ ...prev, [urlFileName]: -1 }));
      setIsUploading(false);
    }
  };

  // Render file/folder item
  const renderItem = (item: FileItem, depth: number) => {
    const isActive = item.id === activeFileId;
    const isFolder = item.type === 'folder';
    const leftPadding = depth * 12;
    
    return (
      <div
        className={`flex items-center py-1 px-2 hover:bg-gray-700 rounded cursor-pointer ${
          isActive ? 'bg-gray-700' : ''
        }`}
        style={{ paddingLeft: `${leftPadding + 8}px` }}
        onClick={isFolder ? () => toggleFolder(item.id) : () => handleFileSelect(item.id)}
        onContextMenu={(e) => handleContextMenu(e, item.id)}
      >
        {isFolder ? (
          <>
            {item.isOpen ? (
              <ChevronDown className="h-4 w-4 text-gray-400 mr-1" />
            ) : (
              <ChevronRight className="h-4 w-4 text-gray-400 mr-1" />
            )}
            <Folder className="h-4 w-4 mr-2 text-blue-400" />
          </>
        ) : (
          <>
            <div className="w-4 mr-1" />
            {getFileIcon(item.name)}
            <span className="ml-1" />
          </>
        )}
        
        {renaming.id === item.id ? (
          <form 
            onSubmit={handleRenameSubmit}
            onClick={(e) => e.stopPropagation()}
            className="flex-1"
          >
            <input
              ref={renameInputRef}
              type="text"
              value={renaming.name}
              onChange={(e) => setRenaming({ ...renaming, name: e.target.value })}
              onBlur={handleRenameSubmit}
              className="bg-gray-600 text-white text-sm rounded px-2 py-0.5 w-full focus:outline-none focus:ring-1 focus:ring-blue-500"
              onKeyDown={(e) => {
                if (e.key === 'Escape') setRenaming({ id: null, name: "" });
              }}
            />
          </form>
        ) : (
          <span className={`text-sm truncate ${isActive ? 'text-white' : 'text-gray-200'}`}>
            {item.name}
          </span>
        )}
      </div>
    );
  };

  // Recursive function to render file tree
  const renderFileTree = (items: FileItem[], depth = 0) => {
    return items.map((item) => {
      const isFolder = item.type === 'folder';
      
      return (
        <div key={item.id}>
          {renderItem(item, depth)}
          
          {/* Render children if folder is open */}
          {isFolder && item.isOpen && (
            <div className="ml-2 border-l border-gray-700">
              {item.children && item.children.length > 0 ? (
                renderFileTree(item.children, depth + 1)
              ) : (
                <div className="ml-6 pl-2 py-2 text-xs text-gray-500 italic">
                  Empty folder
                </div>
              )}
            </div>
          )}
        </div>
      );
    });
  };

  // Render search results
  const renderSearchResults = () => {
    if (!searchText) return null;
    
    return filteredFiles.length > 0 ? (
      <div className="mt-2 border-t border-gray-700 pt-2">
        <div className="text-xs text-gray-400 mb-1 px-3">Search Results</div>
        {filteredFiles.map((file) => (
          <div
            key={file.id}
            className="flex items-center py-1 px-3 hover:bg-gray-700 rounded mx-1 cursor-pointer"
            onClick={() => {
              if (file.type === 'file') {
                handleFileSelect(file.id);
                clearSearch();
              }
            }}
          >
            {file.type === 'folder' ? (
              <Folder className="h-3 w-3 mr-2 text-blue-400" />
            ) : (
              getFileIcon(file.name)
            )}
            <span className="text-sm text-gray-200 truncate ml-2">{file.name}</span>
          </div>
        ))}
      </div>
    ) : (
      <div className="text-xs text-gray-400 px-3 mt-2 border-t border-gray-700 pt-2">
        No results found
      </div>
    );
  };

  // Collapsed sidebar view
  if (collapsed) {
    return (
      <div className="h-full bg-gray-800 w-12 border-r border-gray-700 flex flex-col items-center py-2 space-y-3">
        <button
          onClick={onSidebarToggle}
          className="p-2 hover:bg-gray-700 rounded-md text-gray-300 hover:text-white"
          title="Expand Sidebar"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
        <button
          className="p-2 hover:bg-gray-700 rounded-md text-gray-300 hover:text-white"
          title="Files"
          onClick={onSidebarToggle}
        >
          <FileIcon className="h-5 w-5" />
        </button>
        <button
          className="p-2 hover:bg-gray-700 rounded-md text-gray-300 hover:text-white"
          title="Add File"
          onClick={() => {
            onSidebarToggle?.();
            setTimeout(() => createNewItem('file'), 300);
          }}
        >
          <FilePlus className="h-5 w-5" />
        </button>
      </div>
    );
  }

  // Full sidebar view
  return (
    <div className="h-full bg-gray-800 border-r border-gray-700 overflow-hidden flex flex-col transition-all" 
        style={{ width: '280px' }}>
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-700">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-200 tracking-wider">
            PROJECT FILES
          </h2>
          <div className="flex space-x-1">
            <button
              onClick={() => openUrlModal('image')}
              className="p-1 hover:bg-gray-700 rounded text-gray-400 hover:text-white"
              title="Import URL (Image/Media)"
            >
              <Globe className="h-4 w-4" />
            </button>
            <label
              className="p-1 hover:bg-gray-700 rounded cursor-pointer text-gray-400 hover:text-white"
              title="Upload Files"
            >
              <Upload className="h-4 w-4" />
              <input
                type="file"
                className="hidden"
                ref={fileInputRef}
                onChange={handleFileUpload}
                multiple
              />
            </label>
            <button
              onClick={() => createNewItem('file')}
              className="p-1 hover:bg-gray-700 rounded text-gray-400 hover:text-white"
              title="New File"
            >
              <FilePlus className="h-4 w-4" />
            </button>
            <button
              onClick={() => createNewItem('folder')}
              className="p-1 hover:bg-gray-700 rounded text-gray-400 hover:text-white"
              title="New Folder"
            >
              <FolderPlus className="h-4 w-4" />
            </button>
            <button
              onClick={onSidebarToggle}
              className="p-1 hover:bg-gray-700 rounded md:hidden text-gray-400 hover:text-white"
              title="Collapse Sidebar"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
        
        {/* Search box */}
        <div className="relative">
          <Search className="absolute left-2 top-2 h-4 w-4 text-gray-500" />
          <input
            type="text"
            placeholder="Search files..."
            value={searchText}
            onChange={handleSearch}
            className="w-full bg-gray-700 text-sm rounded py-1 pl-8 pr-8 focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-200"
          />
          {searchText && (
            <button 
              onClick={clearSearch}
              className="absolute right-2 top-2"
            >
              <X className="h-4 w-4 text-gray-500 hover:text-gray-300" />
            </button>
          )}
        </div>
      </div>
      
      {/* Files tree view */}
      <div className="flex-1 overflow-y-auto pt-2 pb-4 px-2">
        {loading ? (
          <div className="flex justify-center py-4">
            <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-blue-500"></div>
          </div>
        ) : (
          <>
            {/* New file/folder creation form */}
            {(isAddingFile || isAddingFolder) && (
              <div className="mb-2 px-2 py-1 bg-gray-750 rounded-md">
                <form onSubmit={handleCreateNewItem} className="flex flex-col space-y-2">
                  <div className="flex items-center">
                    {isAddingFile ? (
                      <FileIcon className="h-4 w-4 mr-2 text-gray-400" />
                    ) : (
                      <Folder className="h-4 w-4 mr-2 text-blue-400" />
                    )}
                    <input
                      type="text"
                      value={newItemName}
                      onChange={(e) => setNewItemName(e.target.value)}
                      placeholder={`New ${isAddingFile ? 'file' : 'folder'} name`}
                      className="flex-1 bg-gray-700 text-white text-sm rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      autoFocus
                    />
                  </div>
                  <div className="flex justify-end space-x-2">
                    <button
                      type="button"
                      onClick={cancelNewItem}
                      className="text-xs text-gray-400 hover:text-gray-300 px-2 py-1"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={!newItemName.trim()}
                      className={`text-xs bg-blue-600 text-white px-2 py-1 rounded ${
                        !newItemName.trim() ? 'opacity-50 cursor-not-allowed' : 'hover:bg-blue-700'
                      }`}
                    >
                      Create
                    </button>
                  </div>
                </form>
              </div>
            )}
            
            {/* File upload indicator */}
            {isUploading && Object.keys(uploadProgress).length > 0 && (
              <div className="mb-3 px-2 py-2 bg-gray-750 rounded-md">
                <div className="flex justify-between text-xs text-gray-300 mb-1">
                  <span>Uploading files...</span>
                  <span>{Object.values(uploadProgress).filter(p => p === 100).length} / {Object.keys(uploadProgress).length}</span>
                </div>
                {Object.entries(uploadProgress).map(([filename, progress]) => (
                  <div key={filename} className="mb-1">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="truncate text-gray-400">{filename}</span>
                      <span className="text-gray-500">{progress < 0 ? 'Error' : `${progress}%`}</span>
                    </div>
                    <div className="w-full h-1.5 bg-gray-700 rounded-full">
                      <div
                        className={`h-full rounded-full ${
                          progress < 0 ? 'bg-red-500' : progress === 100 ? 'bg-green-500' : 'bg-blue-500'
                        }`}
                        style={{ width: `${progress < 0 ? 100 : progress}%` }}
                      ></div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            
            {/* File tree or search results */}
            {searchText ? (
              renderSearchResults()
            ) : fileStructure.length === 0 ? (
              <div className="text-center py-4 text-gray-400 text-sm">
                <div className="mb-2">No files yet</div>
                <button
                  onClick={() => createNewItem('file')}
                  className="px-3 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700"
                >
                  Create your first file
                </button>
              </div>
            ) : (
              <div className="space-y-1">
                {renderFileTree(fileStructure)}
              </div>
            )}
          </>
        )}
      </div>
      
      {/* Context menu */}
      {contextMenu.visible && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={hideContextMenu}
          />
          <div
            ref={contextMenuRef}
            className="fixed z-50 bg-gray-800 shadow-lg rounded border border-gray-700 py-1"
            style={{
              top: contextMenu.y,
              left: contextMenu.x,
              maxWidth: '200px',
              minWidth: '150px'
            }}
          >
            {/* Context menu options */}
            {contextMenu.fileId && (
              <>
                <button
                  onClick={() => {
                    const file = files.find(f => f.id === contextMenu.fileId);
                    if (file) {
                      startRenaming(file.id, file.name);
                    }
                  }}
                  className="w-full text-left px-3 py-1 hover:bg-gray-700 text-gray-200 text-sm flex items-center"
                >
                  <Edit2 className="h-3.5 w-3.5 mr-2" />
                  Rename
                </button>
                
                {/* Option to download file */}
                {files.find(f => f.id === contextMenu.fileId)?.type === 'file' && (
                  <button
                    onClick={async () => {
                      const file = files.find(f => f.id === contextMenu.fileId);
                      if (file) {
                        if (file.downloadURL) {
                          window.open(file.downloadURL, '_blank');
                        } else if (file.content) {
                          const blob = new Blob([file.content], { type: 'text/plain' });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = file.name;
                          a.click();
                          URL.revokeObjectURL(url);
                        }
                      }
                      hideContextMenu();
                    }}
                    className="w-full text-left px-3 py-1 hover:bg-gray-700 text-gray-200 text-sm flex items-center"
                  >
                    <Download className="h-3.5 w-3.5 mr-2" />
                    Download
                  </button>
                )}
                
                <div className="border-t border-gray-700 my-1"></div>
                
                <button
                  onClick={() => deleteFileOrFolder(contextMenu.fileId!)}
                  className="w-full text-left px-3 py-1 hover:bg-gray-700 text-red-400 text-sm flex items-center"
                >
                  <Trash2 className="h-3.5 w-3.5 mr-2" />
                  Delete
                </button>
              </>
            )}
          </div>
        </>
      )}
      
      {/* URL Import Modal */}
      {isUrlModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-gray-800 rounded-lg shadow-lg w-full max-w-md border border-gray-700">
            <div className="px-4 py-3 border-b border-gray-700 flex justify-between items-center">
              <h3 className="text-gray-200 font-medium">Import Media URL</h3>
              <button
                onClick={() => setIsUrlModalOpen(false)}
                className="text-gray-400 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-4">
              <div className="mb-4">
                <label className="block text-sm text-gray-400 mb-1">URL</label>
                <input
                  type="text"
                  ref={urlInputRef}
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  placeholder="https://"
                  className="w-full bg-gray-700 text-white rounded px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div className="mb-6">
                <label className="block text-sm text-gray-400 mb-1">File Name</label>
                <input
                  type="text"
                  value={urlFileName}
                  onChange={(e) => setUrlFileName(e.target.value)}
                  placeholder="image-name.jpg"
                  className="w-full bg-gray-700 text-white rounded px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div className="flex justify-end space-x-3">
                <button
                  onClick={() => setIsUrlModalOpen(false)}
                  className="px-4 py-2 text-gray-300 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  onClick={handleUrlImport}
                  disabled={!urlInput.trim() || !urlFileName.trim()}
                  className={`px-4 py-2 rounded ${
                    !urlInput.trim() || !urlFileName.trim() 
                      ? 'bg-gray-600 text-gray-400 cursor-not-allowed' 
                      : 'bg-blue-600 text-white hover:bg-blue-700'
                  }`}
                >
                  Import
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EnhancedSidebar;