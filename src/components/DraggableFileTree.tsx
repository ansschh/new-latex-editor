// DraggableFileTree.tsx with fixed folder drag and drop
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

// Define DnD item types - must be consistent!
const ItemTypes = {
  FILE: 'file',
  FOLDER: 'folder',
  NATIVE_FILE: 'FILE'
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
  onAfterMove?: (sourceId: string, targetId: string | null) => void; // New optional callback
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

// Helper to read file as data URL
const readFileAsDataURL = (file: File): Promise<string> => {
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
    reader.readAsDataURL(file);
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
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // Show a temporary status message
  const showStatusMessage = (message: string) => {
    setStatusMessage(message);
    setTimeout(() => setStatusMessage(null), 3000);
  };

  // Add CSS for visual feedback
  useEffect(() => {
    // Add the CSS styles for drag and drop indicators
    const styleElement = document.createElement('style');
    styleElement.textContent = `
      .drag-over {
        background-color: rgba(59, 130, 246, 0.2) !important;
        border: 1px dashed #60a5fa !important;
        box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.3) !important;
      }
      
      [data-item-type="folder"]:hover {
        background-color: rgba(55, 65, 81, 0.7);
      }
      
      .folder-hover {
        background-color: rgba(59, 130, 246, 0.1) !important;
        transition: all 0.2s ease;
      }
    `;
    document.head.appendChild(styleElement);

    return () => {
      document.head.removeChild(styleElement);
    };
  }, []);

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
  const handleToggleFolder = (folderId: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent event from bubbling up
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

  // Helper function to get all descendants of a folder
  const getDescendants = (folderId: string): string[] => {
    const result: string[] = [];

    // Recursive function to get all descendants
    const findDescendants = (parentId: string) => {
      const children = files.filter(item => item.parentId === parentId);

      children.forEach(child => {
        result.push(child.id);
        if (child.type === 'folder') {
          findDescendants(child.id);
        }
      });
    };

    findDescendants(folderId);
    return result;
  };

  // Enhanced move file or folder (change parent) with circular reference check
  const handleMoveItem = async (sourceId: string, targetId: string | null) => {
    try {
      console.log(`Moving item ${sourceId} to ${targetId || 'root'}`);

      // Get source item details
      const sourceItem = files.find(f => f.id === sourceId);
      if (!sourceItem) {
        console.error("Source item not found:", sourceId);
        showStatusMessage("Error: Source item not found");
        return false; // Return false to indicate failure
      }

      // Don't do anything if item already has this parent
      if (sourceItem.parentId === targetId) {
        console.log("Item already has this parent, no change needed");
        return true; // Return true but no action needed
      }

      // If moving a folder, verify we're not creating a circular reference
      if (sourceItem.type === 'folder' && targetId) {
        const descendants = getDescendants(sourceId);
        if (descendants.includes(targetId)) {
          console.error("Cannot move a folder into its own subfolder");
          showStatusMessage("Cannot move a folder into its own subfolder");
          return false;
        }
      }

      // Update the item's parentId
      const itemRef = doc(db, "projectFiles", sourceId);
      await updateDoc(itemRef, {
        parentId: targetId,
        lastModified: serverTimestamp()
      });

      // Refresh files list
      await onRefreshFiles();

      // Call the optional callback if provided
      if (onAfterMove) {
        onAfterMove(sourceId, targetId);
      }

      showStatusMessage(`${sourceItem.type === 'file' ? 'File' : 'Folder'} moved successfully`);
      return true; // Return true to indicate success
    } catch (error) {
      console.error("Error moving item:", error);
      showStatusMessage(`Error moving item: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return false; // Return false to indicate failure
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
      showStatusMessage(`Uploading ${files.length} file(s)...`);

      for (const file of files) {
        console.log(`Uploading file: ${file.name} to parent: ${parentId || 'root'}`);

        // For text files, read content and store directly
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
        // For images, store as data URLs 
        else if (file.type.startsWith('image/')) {
          const dataUrl = await readFileAsDataURL(file);

          // Store directly in Firestore
          await addDoc(collection(db, "projectFiles"), {
            _name_: file.name,
            type: 'file',
            fileType: 'image',
            projectId: projectId,
            parentId: parentId,
            ownerId: userId,
            content: dataUrl,
            createdAt: serverTimestamp(),
            lastModified: serverTimestamp()
          });
        }
        // For other files (if under 1MB)
        else if (file.size < 1000000) {
          const dataUrl = await readFileAsDataURL(file);

          await addDoc(collection(db, "projectFiles"), {
            _name_: file.name,
            type: 'file',
            fileType: 'binary',
            projectId: projectId,
            parentId: parentId,
            ownerId: userId,
            content: dataUrl,
            createdAt: serverTimestamp(),
            lastModified: serverTimestamp()
          });
        } else {
          console.error(`File too large to upload directly: ${file.name}`);
          showStatusMessage(`File ${file.name} is too large (max 1MB)`);
        }
      }

      // Refresh files list
      await onRefreshFiles();
      showStatusMessage(`Successfully uploaded ${files.length} file(s)`);
    } catch (error) {
      console.error("Error uploading files:", error);
      showStatusMessage(`Error uploading files: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  // Set up drop target for the root level (and when dropping on empty areas)
  const [{ isRootOver, canDropOnRoot }, rootDrop] = useDrop({
    accept: [ItemTypes.FILE, ItemTypes.FOLDER, NativeTypes.FILE],
    drop: (item: any, monitor) => {
      // Check if the drop was directly on the component and not a child component
      if (monitor.didDrop()) {
        console.log("Drop already handled by child component");
        return;
      }

      // Handle files from external source (user's computer)
      if (monitor.getItemType() === NativeTypes.FILE) {
        console.log("Native file drop detected on root");
        const fileList = monitor.getItem().files;
        if (fileList && fileList.length) {
          handleFileUpload(Array.from(fileList), null);
        }
        return;
      }

      // Handle internal file/folder movement to root
      if ('id' in item && item.id) {
        console.log(`Moving item ${item.id} to root`);
        handleMoveItem(item.id, null);
      }
    },
    collect: (monitor) => ({
      isRootOver: !!monitor.isOver({ shallow: true }),
      canDropOnRoot: !!monitor.canDrop()
    })
  });

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
      showStatusMessage("Item renamed successfully");
    } catch (error) {
      console.error("Error renaming item:", error);
      showStatusMessage(`Error renaming item: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
      showStatusMessage("Item deleted successfully");
    } catch (error) {
      console.error("Error deleting item:", error);
      showStatusMessage(`Error deleting item: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  // Enhanced Individual file/folder item component
  const DraggableItem: React.FC<{
    item: FileItem;
    depth: number;
    isActive: boolean;
  }> = ({ item, depth, isActive }) => {
    const isExpanded = !!expandedFolders[item.id];
    const [isDraggedOver, setIsDraggedOver] = useState(false);

    // Set up drag source for the item
    const [{ isDragging }, drag] = useDrag({
      type: item.type === 'folder' ? ItemTypes.FOLDER : ItemTypes.FILE,
      item: () => ({ id: item.id, type: item.type, name: item._name_ }),
      collect: (monitor) => ({
        isDragging: !!monitor.isDragging()
      }),
      end: (item, monitor) => {
        // Clean up any visual feedback when drag ends
        document.querySelectorAll('.drag-over').forEach(el => {
          el.classList.remove('drag-over');
        });
      }
    });

    // Enhanced drop target (only for folders) with improved hover detection
    const [{ isOver, canDrop }, drop] = useDrop({
      accept: [ItemTypes.FILE, ItemTypes.FOLDER, NativeTypes.FILE],
      hover: (draggedItem, monitor) => {
        // Add visual feedback during hover, but only if directly over this item
        if (item.type === 'folder' && monitor.isOver({ shallow: true })) {
          setIsDraggedOver(true);
        }
      },
      drop: (droppedItem: any, monitor) => {
        // Only process drop if this is the direct target (not if the drop event bubbled up)
        if (!monitor.isOver({ shallow: true })) {
          return;
        }

        console.log(`Drop on ${item.type} ${item._name_}`, droppedItem);

        // Only folders can accept drops
        if (item.type !== 'folder') {
          console.log("Cannot drop onto a file");
          return;
        }

        // Handle native file drops
        if (monitor.getItemType() === NativeTypes.FILE) {
          console.log("Native file drop on folder");
          const fileList = monitor.getItem().files;
          if (fileList && fileList.length) {
            handleFileUpload(Array.from(fileList), item.id);
          }
          return { handled: true };
        }

        // Cannot drop onto self
        if ('id' in droppedItem && droppedItem.id === item.id) {
          console.log("Cannot drop onto self");
          return { handled: false };
        }

        // Handle internal moves
        if ('id' in droppedItem) {
          console.log(`Moving ${droppedItem.id} to ${item.id}`);
          handleMoveItem(droppedItem.id, item.id);

          // Auto-expand the folder when an item is dropped into it
          if (!expandedFolders[item.id]) {
            setExpandedFolders(prev => ({
              ...prev,
              [item.id]: true
            }));
          }

          return { handled: true };
        }
      },
      canDrop: (droppedItem, monitor) => {
        // Only folders can accept drops
        if (item.type !== 'folder') return false;

        // For files from outside, always allow
        if (monitor.getItemType() === NativeTypes.FILE) return true;

        // Cannot drop onto self
        if ('id' in droppedItem && droppedItem.id === item.id) return false;

        // Cannot drop a folder into its own descendant (prevents circular references)
        if ('id' in droppedItem && droppedItem.type === 'folder') {
          const descendants = getDescendants(droppedItem.id);
          if (descendants.includes(item.id)) {
            return false;
          }
        }

        return true;
      },
      collect: (monitor) => ({
        isOver: !!monitor.isOver({ shallow: true }),
        canDrop: !!monitor.canDrop()
      })
    });

    // Clear drag over state when no longer hovering
    useEffect(() => {
      if (!isOver) {
        setIsDraggedOver(false);
      }
    }, [isOver]);

    // Set up drag and drop ref based on item type
    const dragDropRef = (node: HTMLDivElement | null) => {
      // For files, set only drag ref
      // For folders, set both drag and drop refs
      drag(node);
      if (item.type === 'folder') {
        drop(node);
      }
      return node;
    };

    // Determine file icon based on file type
    const getFileIcon = () => {
      if (item.type === 'folder') {
        return <Folder className={`h-4 w-4 text-blue-400 ${(isOver && canDrop) ? 'text-blue-500' : ''}`} />;
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

    // Calculate item style with enhanced visual feedback
    const getItemStyle = () => {
      let style: React.CSSProperties = {
        opacity: isDragging ? 0.5 : 1,
        paddingLeft: `${depth * 16 + 8}px`
      };

      return style;
    };

    const handleItemClick = (e: React.MouseEvent) => {
      e.stopPropagation();
      if (item.type === 'file') {
        onFileSelect(item.id);
      } else if (item.type === 'folder') {
        handleToggleFolder(item.id, e);
      }
    };

    // Dynamic class for drop target highlighting
    const dropTargetClass = (isOver && canDrop) || isDraggedOver
      ? 'bg-blue-500/20 border border-dashed border-blue-400'
      : isActive
        ? 'bg-blue-600/40'
        : '';

    return (
      <div
        ref={dragDropRef}
        className={`flex items-center py-1.5 px-2 my-0.5 rounded cursor-pointer hover:bg-gray-700 transition-colors duration-100 group
                    ${dropTargetClass}
                    ${isDragging ? 'opacity-50' : 'opacity-100'}`}
        style={getItemStyle()}
        onClick={handleItemClick}
        onContextMenu={(e) => handleContextMenu(e, item)}
        data-item-id={item.id}
        data-item-type={item.type}
        data-parent-id={item.parentId}
      >
        {/* Folder chevron or spacer */}
        {item.type === 'folder' ? (
          <span onClick={(e) => handleToggleFolder(item.id, e)}>
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
        {getFileIcon()}

        {/* Item name */}
        <span className={`ml-2 text-sm truncate ${isActive ? 'text-white font-medium' : 'text-gray-300'}`}>
          {item._name_}
        </span>

        {/* Context menu button */}
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

  // Enhanced renderFileTree function with proper structure for nested folders
  const renderFileTree = (items: FileItem[], depth: number = 0) => {
    return items.map(item => (
      <React.Fragment key={item.id}>
        <DraggableItem
          item={item}
          depth={depth}
          isActive={item.id === activeFileId}
        />

        {/* Render children if folder is expanded - now with a wrapper div */}
        {item.type === 'folder' &&
          expandedFolders[item.id] &&
          (item as any).children &&
          (item as any).children.length > 0 && (
            <div className="ml-2">
              {renderFileTree((item as any).children, depth + 1)}
            </div>
          )}

        {/* Show empty folder message if folder is expanded but has no children */}
        {item.type === 'folder' &&
          expandedFolders[item.id] &&
          (!((item as any).children) || (item as any).children.length === 0) && (
            <div
              className="pl-8 py-1 text-gray-500 text-xs italic ml-4"
              style={{ paddingLeft: `${(depth + 1) * 16 + 8}px` }}
            >
              Empty folder
            </div>
          )}
      </React.Fragment>
    ));
  };

  // Generate the tree structure
  const fileTree = buildFileTree();

  return (
    <div className="h-full flex flex-col">
      {/* Status message */}
      {statusMessage && (
        <div className="bg-blue-900/40 border-l-4 border-blue-500 p-2 text-sm text-blue-100 mb-2">
          {statusMessage}
        </div>
      )}

      <div
        ref={(el) => {
          rootRef.current = el;
          rootDrop(el);
        }}
        className={`flex-1 h-full overflow-auto px-2 py-2 ${isRootOver && canDropOnRoot ? 'bg-gray-800/60 border-2 border-dashed border-blue-500/50' : ''
          }`}
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
        {isRootOver && canDropOnRoot && (
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
    </div>
  );
};

// Export the wrapped component
export default FileTreeWithDnD;