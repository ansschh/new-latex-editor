import React, { useState, useEffect } from "react";
import { Loader, FileText, Folder, FolderOpen, Plus, MoreVertical, File, Download, Trash2, Edit2 } from "lucide-react";
import { collection, query, where, getDocs, doc, getDoc, setDoc, updateDoc, deleteDoc, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";

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
}

interface ProjectFileTreeProps {
  projectId: string;
  userId: string;
  onFileSelect: (fileId: string, fileName: string, content: string) => void;
  currentFileId: string | null;
}

const ProjectFileTree: React.FC<ProjectFileTreeProps> = ({ 
  projectId, 
  userId, 
  onFileSelect,
  currentFileId 
}) => {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [folders, setFolders] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [newItemName, setNewItemName] = useState('');
  const [newItemType, setNewItemType] = useState<'file' | 'folder'>('file');
  const [showContextMenu, setShowContextMenu] = useState<{id: string, x: number, y: number} | null>(null);
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [isRenaming, setIsRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  // Fetch project files and folders
  useEffect(() => {
    fetchProjectFiles();
  }, [projectId]);

  const fetchProjectFiles = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch files
      const filesQuery = query(
        collection(db, "projectFiles"),
        where("projectId", "==", projectId)
      );
      
      const querySnapshot = await getDocs(filesQuery);
      const fetchedFiles: FileItem[] = [];
      const fetchedFolders: FileItem[] = [];
      
      querySnapshot.forEach((doc) => {
        const data = doc.data() as Omit<FileItem, 'id'>;
        const item = {
          id: doc.id,
          ...data,
          type: data.type || 'file',
          name: data.name || 'Untitled',
          parentId: data.parentId || null,
        } as FileItem;
        
        if (item.type === 'folder') {
          fetchedFolders.push(item);
        } else {
          fetchedFiles.push(item);
        }
      });
      
      setFiles(fetchedFiles);
      setFolders(fetchedFolders);
      
      // If there are no files yet, create a default main.tex file
      if (fetchedFiles.length === 0 && fetchedFolders.length === 0) {
        const defaultContent = `\\documentclass{article}
\\usepackage[utf8]{inputenc}
\\usepackage{amsmath}
\\usepackage{graphicx}

\\title{My LaTeX Document}
\\author{User}
\\date{\\today}

\\begin{document}

\\maketitle

\\section{Introduction}
This is the introduction to my document.

\\section{Content}
This is the main content of my document.

\\end{document}`;
        
        await createNewFile('main.tex', defaultContent, null);
        // Refresh the file list
        fetchProjectFiles();
      }
      
      setLoading(false);
    } catch (error) {
      console.error("Error fetching project files:", error);
      setError("Failed to load project files");
      setLoading(false);
    }
  };

  const createNewFile = async (name: string, content: string = "", parentId: string | null = null) => {
    try {
      const fileExtension = name.includes('.') ? name.split('.').pop() : 'tex';
      
      const newFile = {
        name,
        type: 'file',
        content: content,
        projectId,
        userId,
        parentId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        extension: fileExtension,
      };
      
      const docRef = await addDoc(collection(db, "projectFiles"), newFile);
      
      setFiles(prev => [...prev, { id: docRef.id, ...newFile, createdAt: new Date(), updatedAt: new Date() } as FileItem]);
      
      // Auto-select the newly created file
      onFileSelect(docRef.id, name, content);
      
      return docRef.id;
    } catch (error) {
      console.error("Error creating file:", error);
      setError("Failed to create file");
      return null;
    }
  };

  const createNewFolder = async (name: string, parentId: string | null = null) => {
    try {
      const newFolder = {
        name,
        type: 'folder',
        projectId,
        userId,
        parentId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      
      const docRef = await addDoc(collection(db, "projectFiles"), newFolder);
      
      setFolders(prev => [...prev, { id: docRef.id, ...newFolder, createdAt: new Date(), updatedAt: new Date() } as FileItem]);
      
      // Auto-expand the newly created folder
      setExpandedFolders(prev => ({ ...prev, [docRef.id]: true }));
      
      return docRef.id;
    } catch (error) {
      console.error("Error creating folder:", error);
      setError("Failed to create folder");
      return null;
    }
  };

  const handleFileSelect = async (fileId: string, fileName: string) => {
    try {
      const fileDoc = await getDoc(doc(db, "projectFiles", fileId));
      
      if (fileDoc.exists()) {
        const fileData = fileDoc.data();
        onFileSelect(fileId, fileName, fileData.content || "");
      } else {
        setError("File not found");
      }
    } catch (error) {
      console.error("Error loading file:", error);
      setError("Failed to load file");
    }
  };

  const handleAddItem = async () => {
    if (!newItemName.trim()) {
      setError("Name cannot be empty");
      return;
    }
    
    if (newItemType === 'file') {
      await createNewFile(newItemName, "", selectedFolder);
    } else {
      await createNewFolder(newItemName, selectedFolder);
    }
    
    // Reset state
    setNewItemName('');
    setShowAddMenu(false);
    setSelectedFolder(null);
  };

  const handleDeleteItem = async (id: string, type: 'file' | 'folder') => {
    try {
      // Check if it's a folder with content
      if (type === 'folder') {
        const hasChildren = files.some(file => file.parentId === id) || 
                          folders.some(folder => folder.parentId === id);
        
        if (hasChildren) {
          if (!window.confirm("This folder contains files. Are you sure you want to delete it and all its contents?")) {
            return;
          }
          
          // Delete all children recursively (simplified version)
          const childFiles = files.filter(file => file.parentId === id);
          const childFolders = folders.filter(folder => folder.parentId === id);
          
          for (const file of childFiles) {
            await deleteDoc(doc(db, "projectFiles", file.id));
          }
          
          for (const folder of childFolders) {
            await handleDeleteItem(folder.id, 'folder');
          }
        }
      }
      
      // Delete the item
      await deleteDoc(doc(db, "projectFiles", id));
      
      if (type === 'file') {
        setFiles(prev => prev.filter(file => file.id !== id));
      } else {
        setFolders(prev => prev.filter(folder => folder.id !== id));
      }
      
      // If the current file was deleted, clear it
      if (currentFileId === id) {
        onFileSelect('', '', '');
      }
      
      showNotification(`${type === 'file' ? 'File' : 'Folder'} deleted successfully`);
    } catch (error) {
      console.error("Error deleting item:", error);
      setError(`Failed to delete ${type}`);
    }
  };

  const handleRename = async (id: string, type: 'file' | 'folder') => {
    if (!renameValue.trim()) {
      setError("Name cannot be empty");
      return;
    }
    
    try {
      await updateDoc(doc(db, "projectFiles", id), {
        name: renameValue,
        updatedAt: serverTimestamp()
      });
      
      if (type === 'file') {
        setFiles(prev => 
          prev.map(file => 
            file.id === id ? { ...file, name: renameValue } : file
          )
        );
      } else {
        setFolders(prev => 
          prev.map(folder => 
            folder.id === id ? { ...folder, name: renameValue } : folder
          )
        );
      }
      
      setIsRenaming(null);
      showNotification(`${type === 'file' ? 'File' : 'Folder'} renamed successfully`);
    } catch (error) {
      console.error("Error renaming item:", error);
      setError(`Failed to rename ${type}`);
    }
  };

  const toggleFolder = (folderId: string) => {
    setExpandedFolders(prev => ({
      ...prev,
      [folderId]: !prev[folderId]
    }));
  };

  const getFileIconByExtension = (filename: string) => {
    const extension = filename.split('.').pop()?.toLowerCase() || '';
    
    switch (extension) {
      case 'tex':
        return <FileText className="h-4 w-4 mr-2 text-blue-400" />;
      case 'bib':
        return <FileText className="h-4 w-4 mr-2 text-green-400" />;
      case 'png':
      case 'jpg':
      case 'jpeg':
      case 'svg':
        return <FileText className="h-4 w-4 mr-2 text-purple-400" />;
      default:
        return <FileText className="h-4 w-4 mr-2 text-gray-400" />;
    }
  };

  const showNotification = (message: string, type = "success") => {
    const notification = document.createElement('div');
    notification.className = `fixed bottom-4 right-4 px-4 py-2 rounded-md shadow-lg z-50 ${
      type === "success" ? "bg-green-600 text-white" :
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

  // Render a file item
  const renderFile = (file: FileItem, depth = 0) => {
    const isActive = currentFileId === file.id;
    
    return (
      <div 
        key={file.id}
        className={`flex items-center relative pl-${(depth * 2) + 2} py-1 pr-2 group ${
          isActive ? 'bg-gray-700 text-white' : 'hover:bg-gray-700 text-gray-300'
        }`}
      >
        {isRenaming === file.id ? (
          <div className="flex-1 flex items-center">
            {getFileIconByExtension(renameValue || file.name)}
            <input
              type="text"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleRename(file.id, 'file');
                } else if (e.key === 'Escape') {
                  setIsRenaming(null);
                }
              }}
              onBlur={() => handleRename(file.id, 'file')}
              autoFocus
              className="bg-gray-800 text-white border-none focus:ring-2 focus:ring-blue-500 flex-1 py-0.5 px-1 text-sm"
            />
          </div>
        ) : (
          <>
            <div 
              className="flex-1 flex items-center cursor-pointer"
              onClick={() => handleFileSelect(file.id, file.name)}
            >
              {getFileIconByExtension(file.name)}
              <span>{file.name}</span>
            </div>
            
            <div className="hidden group-hover:flex items-center">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setIsRenaming(file.id);
                  setRenameValue(file.name);
                }}
                className="p-1 hover:bg-gray-600 rounded"
                title="Rename"
              >
                <Edit2 className="h-3.5 w-3.5 text-gray-400" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeleteItem(file.id, 'file');
                }}
                className="p-1 hover:bg-gray-600 rounded"
                title="Delete"
              >
                <Trash2 className="h-3.5 w-3.5 text-gray-400" />
              </button>
            </div>
          </>
        )}
      </div>
    );
  };

  // Render a folder item with its children
  const renderFolder = (folder: FileItem, depth = 0) => {
    const isExpanded = expandedFolders[folder.id] || false;
    const folderFiles = files.filter(file => file.parentId === folder.id);
    const subFolders = folders.filter(f => f.parentId === folder.id);
    
    return (
      <div key={folder.id}>
        <div 
          className={`flex items-center relative pl-${(depth * 2) + 2} py-1 pr-2 group hover:bg-gray-700 text-gray-300`}
        >
          {isRenaming === folder.id ? (
            <div className="flex-1 flex items-center">
              {isExpanded ? 
                <FolderOpen className="h-4 w-4 mr-2 text-blue-400" /> : 
                <Folder className="h-4 w-4 mr-2 text-blue-400" />
              }
              <input
                type="text"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleRename(folder.id, 'folder');
                  } else if (e.key === 'Escape') {
                    setIsRenaming(null);
                  }
                }}
                onBlur={() => handleRename(folder.id, 'folder')}
                autoFocus
                className="bg-gray-800 text-white border-none focus:ring-2 focus:ring-blue-500 flex-1 py-0.5 px-1 text-sm"
              />
            </div>
          ) : (
            <>
              <div 
                className="flex-1 flex items-center cursor-pointer"
                onClick={() => toggleFolder(folder.id)}
              >
                {isExpanded ? 
                  <FolderOpen className="h-4 w-4 mr-2 text-blue-400" /> : 
                  <Folder className="h-4 w-4 mr-2 text-blue-400" />
                }
                <span>{folder.name}</span>
              </div>
              
              <div className="hidden group-hover:flex items-center">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedFolder(folder.id);
                    setShowAddMenu(true);
                  }}
                  className="p-1 hover:bg-gray-600 rounded"
                  title="Add item"
                >
                  <Plus className="h-3.5 w-3.5 text-gray-400" />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsRenaming(folder.id);
                    setRenameValue(folder.name);
                  }}
                  className="p-1 hover:bg-gray-600 rounded"
                  title="Rename"
                >
                  <Edit2 className="h-3.5 w-3.5 text-gray-400" />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteItem(folder.id, 'folder');
                  }}
                  className="p-1 hover:bg-gray-600 rounded"
                  title="Delete"
                >
                  <Trash2 className="h-3.5 w-3.5 text-gray-400" />
                </button>
              </div>
            </>
          )}
        </div>
        
        {isExpanded && (
          <div>
            {subFolders.map(subFolder => renderFolder(subFolder, depth + 1))}
            {folderFiles.map(file => renderFile(file, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-20">
        <Loader className="h-5 w-5 text-blue-500 animate-spin mr-2" />
        <span className="text-gray-400">Loading files...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-red-500 p-4">
        Error: {error}
        <button 
          onClick={fetchProjectFiles}
          className="ml-2 text-blue-500 underline"
        >
          Retry
        </button>
      </div>
    );
  }

  // Root level items
  const rootFiles = files.filter(file => file.parentId === null);
  const rootFolders = folders.filter(folder => folder.parentId === null);

  return (
    <div className="text-gray-300">
      {/* Header with Add Button */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-gray-300 font-medium">Project Files</h2>
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
      
      {/* Add File/Folder Menu */}
      {showAddMenu && (
        <div className="mb-4 p-3 bg-gray-700 rounded-md">
          <div className="mb-2">
            <label className="block text-sm text-gray-400 mb-1">Name:</label>
            <input
              type="text"
              value={newItemName}
              onChange={(e) => setNewItemName(e.target.value)}
              placeholder={newItemType === 'file' ? "file.tex" : "folder name"}
              className="w-full px-2 py-1 bg-gray-800 text-white border border-gray-600 rounded-md text-sm"
            />
          </div>
          
          <div className="mb-3">
            <label className="block text-sm text-gray-400 mb-1">Type:</label>
            <div className="flex">
              <button
                onClick={() => setNewItemType('file')}
                className={`px-3 py-1 text-sm rounded-l ${
                  newItemType === 'file' 
                    ? 'bg-blue-600 text-white' 
                    : 'bg-gray-800 text-gray-300 hover:bg-gray-600'
                }`}
              >
                File
              </button>
              <button
                onClick={() => setNewItemType('folder')}
                className={`px-3 py-1 text-sm rounded-r ${
                  newItemType === 'folder' 
                    ? 'bg-blue-600 text-white' 
                    : 'bg-gray-800 text-gray-300 hover:bg-gray-600'
                }`}
              >
                Folder
              </button>
            </div>
          </div>
          
          <div className="flex justify-end space-x-2">
            <button
              onClick={() => setShowAddMenu(false)}
              className="px-3 py-1 rounded text-sm bg-gray-600 hover:bg-gray-500"
            >
              Cancel
            </button>
            <button
              onClick={handleAddItem}
              className="px-3 py-1 rounded text-sm bg-blue-600 hover:bg-blue-700 text-white"
            >
              Create
            </button>
          </div>
        </div>
      )}

      {/* File Tree */}
      <div className="overflow-auto">
        {rootFolders.length === 0 && rootFiles.length === 0 ? (
          <p className="text-gray-400 text-sm">No files yet. Add your first file to get started.</p>
        ) : (
          <div className="space-y-0.5">
            {rootFolders.map(folder => renderFolder(folder))}
            {rootFiles.map(file => renderFile(file))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ProjectFileTree;