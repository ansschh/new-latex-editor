// components/EnhancedSidebar.tsx
"use client";

import React, { useState, useEffect } from "react";
import {
  File,
  Folder,
  FolderPlus,
  FilePlus,
  Upload,
  ChevronDown,
  ChevronRight,
  MoreVertical,
  Edit2,
  Trash2,
  Download,
  Search,
  X,
  Menu
} from "lucide-react";
import { useRouter } from "next/navigation";
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  addDoc, 
  doc, 
  updateDoc, 
  deleteDoc,
  serverTimestamp,
  onSnapshot,
  orderBy,
  getDoc,
  setDoc 
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { authenticateWithFirebase } from "@/lib/firebase-auth";

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
}

interface SidebarProps {
  userId: string;
  projectId: string;
  activeFileId: string | null;
  onFileSelect: (fileId: string, content: string) => void;
  onSidebarToggle?: () => void;
  collapsed?: boolean;
}

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

  // Listen for changes in files collection for this project
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

  // Handle file search
  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchText(e.target.value);
  };

  // Clear search
  const clearSearch = () => {
    setSearchText("");
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
  const handleRenameSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!renaming.id || !renaming.name.trim()) return;
    
    try {
      const fileRef = doc(db, "project_files", renaming.id);
      await updateDoc(fileRef, {
        name: renaming.name.trim(),
        lastModified: serverTimestamp()
      });
      
      setRenaming({ id: null, name: "" });
    } catch (error) {
      console.error("Error renaming file:", error);
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
  const createNewItem = async (type: 'file' | 'folder') => {
    setIsAddingFile(type === 'file');
    setIsAddingFolder(type === 'folder');
    setNewItemName("");
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
      
      await addDoc(collection(db, "project_files"), {
        name: newItemName.trim(),
        type: itemType,
        projectId,
        parentId: currentParentId,
        ownerId: userId,
        content: defaultContent,
        createdAt: serverTimestamp(),
        lastModified: serverTimestamp()
      });
      
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
      const fileRef = doc(db, "project_files", fileId);
      const fileDoc = await getDoc(fileRef);
      
      if (fileDoc.exists() && fileDoc.data().type === 'file') {
        const fileData = fileDoc.data();
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
            // Get file content
            const content = event.target?.result as string;
            
            // Create new file in Firestore
            await addDoc(collection(db, "project_files"), {
              name: file.name,
              type: 'file',
              projectId,
              parentId: currentParentId,
              ownerId: userId,
              content,
              createdAt: serverTimestamp(),
              lastModified: serverTimestamp()
            });
            
            resolve();
          } catch (error) {
            console.error("Error uploading file:", error);
            reject(error);
          }
        };
        
        reader.onerror = (error) => {
          reject(error);
        };
        
        reader.readAsText(file);
      });
    });
    
    Promise.all(uploadPromises)
      .then(() => {
        setIsUploading(false);
      })
      .catch(error => {
        console.error("Error in file upload:", error);
        setIsUploading(false);
      });
      
    // Clear the input
    e.target.value = '';
  };

  // Recursive function to render file tree
  const renderFileTree = (items: FileItem[], depth = 0) => {
    return items.map((item) => {
      const isActive = item.id === activeFileId;
      const leftPadding = depth * 12;
      
      return (
        <div key={item.id}>
          {/* Rendering file/folder item */}
          <div
            className={`flex items-center py-1 px-2 hover:bg-gray-700 rounded ${
              isActive ? "bg-gray-700" : ""
            }`}
            style={{ paddingLeft: `${leftPadding + 8}px` }}
            onClick={item.type === 'file' 
              ? () => handleFileSelect(item.id) 
              : () => toggleFolder(item.id)
            }
            onContextMenu={(e) => handleContextMenu(e, item.id)}
          >
            {/* Folder toggle or file icon */}
            {item.type === 'folder' ? (
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
                <File className="h-4 w-4 mr-2 text-gray-400" />
              </>
            )}
            
            {/* File/folder name or rename input */}
            {renaming.id === item.id ? (
              <form onSubmit={handleRenameSubmit} 
                    onClick={(e) => e.stopPropagation()}
                    className="flex-1 flex">
                <input
                  type="text"
                  value={renaming.name}
                  onChange={(e) => setRenaming({ ...renaming, name: e.target.value })}
                  autoFocus
                  className="bg-gray-600 text-white text-sm rounded px-2 py-0.5 flex-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  onBlur={handleRenameSubmit}
                />
              </form>
            ) : (
              <span className={`text-sm truncate ${isActive ? "text-white" : "text-gray-200"}`}>
                {item.name}
              </span>
            )}
          </div>
          
          {/* Render children if folder is open */}
          {item.type === 'folder' && item.isOpen && item.children && item.children.length > 0 && (
            <div className="ml-2 border-l border-gray-700">
              {renderFileTree(item.children, depth + 1)}
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
              <File className="h-3 w-3 mr-2 text-gray-400" />
            )}
            <span className="text-sm text-gray-200 truncate">{file.name}</span>
          </div>
        ))}
      </div>
    ) : (
      <div className="text-xs text-gray-400 px-3 mt-2 border-t border-gray-700 pt-2">
        No results found
      </div>
    );
  };

  if (collapsed) {
    return (
      <div className="h-full bg-gray-800 w-10 border-r border-gray-700 flex flex-col items-center py-2 space-y-2">
        <button
          onClick={onSidebarToggle}
          className="p-2 hover:bg-gray-700 rounded-md"
          title="Expand Sidebar"
        >
          <Menu className="h-5 w-5 text-gray-300" />
        </button>
        <button
          className="p-2 hover:bg-gray-700 rounded-md"
          title="Files"
        >
          <File className="h-5 w-5 text-gray-300" />
        </button>
        <button
          className="p-2 hover:bg-gray-700 rounded-md"
          title="Add File"
        >
          <FilePlus className="h-5 w-5 text-gray-300" />
        </button>
        <button
          className="p-2 hover:bg-gray-700 rounded-md"
          title="Add Folder"
        >
          <FolderPlus className="h-5 w-5 text-gray-300" />
        </button>
        <label
          className="p-2 hover:bg-gray-700 rounded-md cursor-pointer"
          title="Upload File"
        >
          <Upload className="h-5 w-5 text-gray-300" />
          <input
            type="file"
            className="hidden"
            onChange={handleFileUpload}
            multiple
          />
        </label>
      </div>
    );
  }

  return (
    <div className="h-full bg-gray-800 border-r border-gray-700 overflow-hidden flex flex-col transition-all" 
         style={{ width: '280px' }}>
      {/* Sidebar header */}
      <div className="px-4 py-3 border-b border-gray-700">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-200 tracking-wider">
            PROJECT FILES
          </h2>
          <div className="flex space-x-1">
            <label
              className="p-1 hover:bg-gray-700 rounded cursor-pointer"
              title="Upload File"
            >
              <Upload className="h-4 w-4 text-gray-400" />
              <input
                type="file"
                className="hidden"
                onChange={handleFileUpload}
                multiple
              />
            </label>
            <button
              onClick={() => createNewItem('file')}
              className="p-1 hover:bg-gray-700 rounded"
              title="Add File"
            >
              <FilePlus className="h-4 w-4 text-gray-400" />
            </button>
            <button
              onClick={() => createNewItem('folder')}
              className="p-1 hover:bg-gray-700 rounded"
              title="Add Folder"
            >
              <FolderPlus className="h-4 w-4 text-gray-400" />
            </button>
            <button
              onClick={onSidebarToggle}
              className="p-1 hover:bg-gray-700 rounded md:hidden"
              title="Collapse Sidebar"
            >
              <Menu className="h-4 w-4 text-gray-400" />
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
              <div className="mb-2 px-2 py-1">
                <form onSubmit={handleCreateNewItem} className="flex flex-col space-y-2">
                  <div className="flex items-center">
                    {isAddingFile ? (
                      <File className="h-4 w-4 mr-2 text-gray-400" />
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
            {isUploading && (
              <div className="text-xs text-center py-2 text-blue-400 animate-pulse">
                Uploading files...
              </div>
            )}
            
            {/* File tree or search results */}
            {searchText ? (
              renderSearchResults()
            ) : (
              <div className="space-y-1">
                {fileStructure.length === 0 ? (
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
                  renderFileTree(fileStructure)
                )}
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
    </div>
  );
};

export default EnhancedSidebar;