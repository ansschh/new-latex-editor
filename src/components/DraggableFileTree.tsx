// components/DraggableFileTree.tsx
import React, { useState, useRef, useEffect } from 'react';
import { useDrag, useDrop, DndProvider } from 'react-dnd';
import { HTML5Backend, NativeTypes } from 'react-dnd-html5-backend';
import { 
  File, Folder, ChevronRight, ChevronDown, 
  MoreVertical, Edit, Trash, Upload
} from 'lucide-react';
import { doc, updateDoc, serverTimestamp, addDoc, collection, getDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '@/lib/firebase';

// Define DnD item types
const ItemTypes = {
  FILE: 'file',
  FOLDER: 'folder',
  FILE_INPUT: 'FILE'
};

interface FileItem {
  id: string;
  _name_: string;
  type: 'file' | 'folder';
  projectId: string;
  parentId: string | null;
  content?: string;
  createdAt: any;
  lastModified: any;
  ownerId: string;
}

interface DraggableFileTreeProps {
  files: FileItem[];
  activeFileId: string | null;
  projectId: string;
  userId: string;
  onFileSelect: (fileId: string) => void;
  onRefreshFiles: () => Promise<any>;
}

// Utility to determine if a file is an image
const isImageFile = (filename: string): boolean => {
  if (!filename) return false;
  const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.svg', '.bmp', '.webp'];
  const lowerFilename = filename.toLowerCase();
  return imageExtensions.some(ext => lowerFilename.endsWith(ext));
};

// Helper to read file as text
const readFileAsText = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (reader.result) {
        resolve(reader.result as string);
      } else {
        reject(new Error("Failed to read file"));
      }
    };
    reader.onerror = (error) => reject(error);
    reader.readAsText(file);
  });
};

// DndProvider Wrapper Component - This ensures the DndProvider context is available
const FileTreeWithDnD: React.FC<DraggableFileTreeProps> = (props) => {
  return (
    <DndProvider backend={HTML5Backend}>
      <DraggableFileTreeContent {...props} />
    </DndProvider>
  );
};

// The main component content - separated to ensure DndProvider is above all useDrag/useDrop hooks
const DraggableFileTreeContent: React.FC<DraggableFileTreeProps> = ({
  files,
  activeFileId,
  projectId,
  userId,
  onFileSelect,
  onRefreshFiles
}) => {
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    item: FileItem | null;
  } | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

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

  // Toggle folder expanded state
  const handleToggleFolder = (folderId: string) => {
    setExpandedFolders(prev => ({
      ...prev,
      [folderId]: !prev[folderId]
    }));
  };

  // Show context menu
  const handleContextMenu = (e: React.MouseEvent, item: FileItem) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      item
    });
  };

  // Move file or folder (change parent)
  const handleMoveItem = async (sourceId: string, targetId: string | null) => {
    try {
      // Update the item's parentId
      const itemRef = doc(db, "projectFiles", sourceId);
      await updateDoc(itemRef, {
        parentId: targetId,
        lastModified: serverTimestamp()
      });
      
      // Refresh files list
      await onRefreshFiles();
    } catch (error) {
      console.error("Error moving item:", error);
      // Show error notification
    }
  };

  // Generate hierarchical file structure
  const buildFileTree = () => {
    const tree: FileItem[] = [];
    const itemMap = new Map<string, FileItem & { children?: FileItem[] }>();
    
    // First, create a map of all items with empty children arrays for folders
    files.forEach(item => {
      const treeItem = { ...item, children: item.type === 'folder' ? [] : undefined };
      itemMap.set(item.id, treeItem);
    });
    
    // Then, build the tree by assigning children to their parents
    files.forEach(item => {
      if (item.parentId) {
        const parent = itemMap.get(item.parentId);
        if (parent && parent.children) {
          parent.children.push(itemMap.get(item.id) as FileItem);
        }
      } else {
        // Root level items
        const treeItem = itemMap.get(item.id);
        if (treeItem) {
          tree.push(treeItem);
        }
      }
    });
    
    // Sort items: folders first, then alphabetically by name
    const sortItems = (items: FileItem[]) => {
      return items.sort((a, b) => {
        if (a.type !== b.type) {
          return a.type === 'folder' ? -1 : 1;
        }
        return a._name_.localeCompare(b._name_);
      });
    };
    
    // Sort recursively
    const sortTree = (items: FileItem[]) => {
      sortItems(items);
      items.forEach(item => {
        if (item.type === 'folder' && (item as any).children) {
          sortTree((item as any).children);
        }
      });
    };
    
    sortTree(tree);
    return tree;
  };

  // Handle file upload from drag and drop
  const handleFileUpload = async (files: File[], parentId: string | null = null) => {
    if (!files.length) return;
    
    try {
      for (const file of files) {
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
            type: 'file',
            projectId: projectId,
            parentId: parentId,
            ownerId: userId,
            content: content,
            createdAt: serverTimestamp(),
            lastModified: serverTimestamp()
          });
        }
        // For binary files (images, etc.), upload to Storage
        else {
          // Create a reference to Storage
          const storageRef = ref(storage, `projects/${projectId}/files/${file.name}`);

          // Upload the file
          await uploadBytes(storageRef, file);

          // Get the download URL
          const downloadURL = await getDownloadURL(storageRef);

          // Add file metadata to Firestore
          await addDoc(collection(db, "projectFiles"), {
            _name_: file.name,
            type: 'file',
            fileType: 'binary',
            projectId: projectId,
            parentId: parentId,
            ownerId: userId,
            downloadURL: downloadURL,
            createdAt: serverTimestamp(),
            lastModified: serverTimestamp()
          });
        }
      }
      
      // Refresh files list
      await onRefreshFiles();
    } catch (error) {
      console.error("Error uploading files:", error);
      // Show error notification
    }
  };

  // Set up drop target for the root level (and when dropping on empty areas)
  const [{ isOver, canDrop }, drop] = useDrop(() => ({
    accept: [ItemTypes.FILE, ItemTypes.FOLDER, NativeTypes.FILE],
    drop: (item: any, monitor) => {
      // Check if the drop was directly on the component and not a child component
      if (monitor.didDrop()) {
        return;
      }
      
      // Handle files from external source (user's computer)
      if (item.files) {
        handleFileUpload(item.files, null);
        return;
      }
      
      // Handle internal file/folder movement to root
      if (item.id) {
        handleMoveItem(item.id, null);
      }
    },
    collect: (monitor) => ({
      isOver: !!monitor.isOver({ shallow: true }),
      canDrop: !!monitor.canDrop()
    })
  }), [files]);

  // Context menu items
  const handleRename = async () => {
    if (!contextMenu?.item) return;
    
    const newName = prompt("Enter new name:", contextMenu.item._name_);
    if (!newName || newName === contextMenu.item._name_) return;
    
    try {
      const itemRef = doc(db, "projectFiles", contextMenu.item.id);
      await updateDoc(itemRef, {
        _name_: newName,
        lastModified: serverTimestamp()
      });
      
      await onRefreshFiles();
      setContextMenu(null);
    } catch (error) {
      console.error("Error renaming item:", error);
      // Show error notification
    }
  };

  const handleDelete = async () => {
    if (!contextMenu?.item) return;
    
    if (!window.confirm(`Are you sure you want to delete "${contextMenu.item._name_}"?`)) {
      return;
    }
    
    try {
      const itemRef = doc(db, "projectFiles", contextMenu.item.id);
      await updateDoc(itemRef, {
        deleted: true,
        lastModified: serverTimestamp()
      });
      
      await onRefreshFiles();
      setContextMenu(null);
    } catch (error) {
      console.error("Error deleting item:", error);
      // Show error notification
    }
  };

  // Individual file/folder item component
  const DraggableItem = ({ 
    item, 
    depth, 
    isActive
  }: { 
    item: FileItem; 
    depth: number; 
    isActive: boolean;
  }) => {
    const isExpanded = !!expandedFolders[item.id];
    
    // Set up drag source
    const [{ isDragging }, drag] = useDrag(() => ({
      type: item.type === 'folder' ? ItemTypes.FOLDER : ItemTypes.FILE,
      item: { id: item.id, type: item.type },
      collect: (monitor) => ({
        isDragging: !!monitor.isDragging()
      })
    }), [item.id, item.type]);

    // Set up drop target for folders
    const [{ isOver, canDrop }, folderDrop] = useDrop(() => ({
      accept: [ItemTypes.FILE, ItemTypes.FOLDER],
      drop: (draggedItem: any) => {
        // Don't allow dropping on itself
        if (draggedItem.id === item.id) return;
        
        // Only folders can accept drops
        if (item.type === 'folder') {
          handleMoveItem(draggedItem.id, item.id);
        }
      },
      canDrop: (draggedItem) => {
        // Don't allow dropping on itself or non-folders
        return draggedItem.id !== item.id && item.type === 'folder';
      },
      collect: (monitor) => ({
        isOver: !!monitor.isOver(),
        canDrop: !!monitor.canDrop()
      })
    }), [item.id, item.type]);

    // Combine drag and drop refs for folders
    let itemRef;
    if (item.type === 'folder') {
      itemRef = (el: HTMLDivElement) => {
        drag(el);
        folderDrop(el);
      };
    } else {
      itemRef = drag;
    }

    // Determine file icon based on file type
    const getFileIcon = () => {
      if (item.type === 'folder') {
        return <Folder className="h-4 w-4 text-blue-400" />;
      }
      
      const fileName = item._name_;
      if (!fileName) return <File className="h-4 w-4 text-gray-400" />;
      
      const extension = fileName.split('.').pop()?.toLowerCase();
      
      if (extension === 'tex' || extension === 'latex') 
        return <File className="h-4 w-4 text-amber-400" />;
      if (isImageFile(fileName)) 
        return <File className="h-4 w-4 text-purple-400" />;
      if (extension === 'pdf') 
        return <File className="h-4 w-4 text-red-400" />;
      if (['bib', 'cls', 'sty'].includes(extension || '')) 
        return <File className="h-4 w-4 text-green-400" />;
      
      return <File className="h-4 w-4 text-gray-400" />;
    };

    // Style based on drag/drop state
    const style: React.CSSProperties = {
      opacity: isDragging ? 0.5 : 1,
      paddingLeft: `${depth * 16 + 8}px`,
      backgroundColor: isActive 
        ? 'rgba(59, 130, 246, 0.5)' 
        : isOver && canDrop 
          ? 'rgba(59, 130, 246, 0.2)' 
          : undefined,
      borderWidth: isOver && canDrop ? '1px' : '0px',
      borderStyle: isOver && canDrop ? 'dashed' : 'none',
      borderColor: isOver && canDrop ? '#60a5fa' : 'transparent'
    };

    return (
      <div
        ref={itemRef}
        className={`flex items-center py-1.5 px-2 my-0.5 rounded cursor-pointer hover:bg-gray-700 transition-colors duration-100 group`}
        style={style}
        onClick={item.type === 'folder' ? () => handleToggleFolder(item.id) : () => onFileSelect(item.id)}
        onContextMenu={(e) => handleContextMenu(e, item)}
      >
        {item.type === 'folder' ? (
          <>
            {isExpanded ? (
              <ChevronDown className="h-3.5 w-3.5 text-gray-400 mr-1.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 text-gray-400 mr-1.5" />
            )}
          </>
        ) : (
          <div className="w-3.5 mr-1.5"></div>
        )}
        
        {getFileIcon()}
        
        <span className={`ml-2 text-sm truncate ${isActive ? 'text-white font-medium' : 'text-gray-300'}`}>
          {item._name_}
        </span>
        
        <div className="ml-auto opacity-0 group-hover:opacity-100 flex items-center">
          <button
            className="p-0.5 text-gray-400 hover:text-white rounded-sm"
            onClick={(e) => {
              e.stopPropagation();
              handleContextMenu(e, item);
            }}
          >
            <MoreVertical className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    );
  };

  // Render the file tree recursively
  const renderFileTree = (items: FileItem[], depth: number = 0) => {
    return items.map(item => (
      <React.Fragment key={item.id}>
        <DraggableItem
          item={item}
          depth={depth}
          isActive={item.id === activeFileId}
        />
        
        {/* Render children if folder is expanded */}
        {item.type === 'folder' && 
         expandedFolders[item.id] && 
         (item as any).children && 
         (item as any).children.length > 0 && 
          renderFileTree((item as any).children, depth + 1)}
      </React.Fragment>
    ));
  };

  // Generate the tree structure
  const fileTree = buildFileTree();

  return (
    <div 
      ref={(el) => {
        rootRef.current = el;
        drop(el);
      }}
      className={`h-full overflow-auto px-2 py-2 ${isOver && canDrop ? 'bg-gray-800/60 border-2 border-dashed border-blue-500/50' : ''}`}
    >
      {/* Empty state message when no files */}
      {files.length === 0 && (
        <div className="text-center py-6">
          <p className="text-gray-400 mb-2">No files yet</p>
          <p className="text-gray-500 text-sm">
            Drag files here or create a new file
          </p>
        </div>
      )}
      
      {/* Project files tree */}
      {fileTree.length > 0 && renderFileTree(fileTree)}
      
      {/* Drop files here message when dragging over */}
      {isOver && canDrop && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="bg-gray-800 rounded-lg p-4 shadow-lg border border-blue-500">
            <Upload className="h-8 w-8 text-blue-400 mx-auto mb-2" />
            <p className="text-blue-300 text-center">Drop files here</p>
          </div>
        </div>
      )}
      
      {/* Context menu */}
      {contextMenu && contextMenu.item && (
        <div
          ref={contextMenuRef}
          className="fixed bg-gray-800 border border-gray-700 rounded shadow-lg py-1 z-50"
          style={{ 
            left: contextMenu.x, 
            top: contextMenu.y,
            minWidth: '160px' 
          }}
        >
          <button
            className="w-full text-left px-3 py-1.5 text-sm hover:bg-gray-700 flex items-center text-gray-200"
            onClick={handleRename}
          >
            <Edit className="h-3.5 w-3.5 mr-2 text-gray-400" />
            Rename
          </button>
          <button
            className="w-full text-left px-3 py-1.5 text-sm hover:bg-gray-700 flex items-center text-red-400"
            onClick={handleDelete}
          >
            <Trash className="h-3.5 w-3.5 mr-2 text-red-400" />
            Delete
          </button>
        </div>
      )}
    </div>
  );
};

// Export the wrapped component
export default FileTreeWithDnD;