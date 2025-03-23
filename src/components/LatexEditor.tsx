import React, { useState, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import { doc, getDoc, updateDoc, serverTimestamp, collection, addDoc, getDocs, query, where, orderBy, deleteDoc } from "firebase/firestore";
import { db, storage } from "@/lib/firebase";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { authenticateWithFirebase } from "@/lib/firebase-auth";
import {
  Loader, Save, Download, Play, Edit, Eye, Layout, Menu,
  FileText, Folder, RefreshCw, ChevronLeft, MoreVertical, FilePlus, FolderPlus, File,
  X, Upload, FileUp, Trash
} from "lucide-react";
import { useRouter } from "next/navigation";
import CodeMirror from '@uiw/react-codemirror';
import { StreamLanguage } from '@codemirror/language';
import { stex } from '@codemirror/legacy-modes/mode/stex';
import { EditorView } from '@codemirror/view';
import DraggableFileTree from '@/components/DraggableFileTree';
import { compileLatex } from "@/services/latexService";

// Import components
import EnhancedSidebar from '../components/EnhancedSidebar';
import PdfViewer from "../components/PdfViewer";

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

// Dynamically import Image Preview
const ImagePreview = dynamic(() => import('./ImagePreview'), {
  ssr: false,
  loading: () => (
    <div className="h-full flex items-center justify-center bg-gray-900">
      <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
    </div>
  ),
});

// Interface for the EnhancedLatexEditor component
interface EnhancedLatexEditorProps {
  projectId: string;
  userId: string;
  debug?: boolean;
}

// Main editor component
const EnhancedLatexEditor: React.FC<EnhancedLatexEditorProps> = ({ projectId, userId, debug = false }) => {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [projectData, setProjectData] = useState<any>(null);
  const [files, setFiles] = useState<any[]>([]);
  const [code, setCode] = useState("");
  const [isSaved, setIsSaved] = useState(true);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [viewMode, setViewMode] = useState<"code" | "split" | "pdf">("split");
  const [isCompiling, setIsCompiling] = useState(false);
  const [compilationError, setCompilationError] = useState<string | null>(null);
  const [pdfData, setPdfData] = useState<string | ArrayBuffer | null>(null);
  const [htmlPreview, setHtmlPreview] = useState<string | null>(null);
  const [autoCompile, setAutoCompile] = useState(false);
  const [compileTimeout, setCompileTimeout] = useState<NodeJS.Timeout | null>(null);
  const [currentFileId, setCurrentFileId] = useState<string | null>(null);
  const [currentFileName, setCurrentFileName] = useState<string>("");
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; itemId: string } | null>(null);

  // Determine if the current file is an image
  const isImageView = currentFileName && isImageFile(currentFileName);

  // State and refs for resizing
  const [sidebarWidth, setSidebarWidth] = useState(250);
  const [editorRatio, setEditorRatio] = useState(0.5); // Editor takes 50% of available space in split mode
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const isResizingSidebar = useRef(false);
  const isResizingEditor = useRef(false);
  const resizeStartX = useRef(0);
  const initialSidebarWidth = useRef(0);

  const editorRef = useRef<any>(null);
  const saveButtonRef = useRef<HTMLButtonElement>(null);
  const compileButtonRef = useRef<HTMLButtonElement>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Set up keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
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
    const handleMouseMove = (e: MouseEvent) => {
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
  const startSidebarResize = (e: React.MouseEvent) => {
    e.preventDefault();
    isResizingSidebar.current = true;
    resizeStartX.current = e.clientX;
    initialSidebarWidth.current = sidebarWidth;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  // Handle editor-preview split resize start
  const startEditorResize = (e: React.MouseEvent) => {
    e.preventDefault();
    isResizingEditor.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  // Refresh files list
  const refreshFiles = async () => {
    try {
      const filesQuery = query(
        collection(db, "projectFiles"),
        where("projectId", "==", projectId),
        orderBy("_name_", "asc")
      );

      const filesSnapshot = await getDocs(filesQuery);
      const filesList: any[] = [];

      filesSnapshot.forEach((doc) => {
        filesList.push({
          id: doc.id,
          ...doc.data()
        });
      });

      setFiles(filesList);

      // If no file is currently selected, try to load the appropriate file
      if (!currentFileId) {
        // Get project details to check for last compiled file
        const projectRef = doc(db, "projects", projectId);
        const projectDoc = await getDoc(projectRef);
        const projectData = projectDoc.data();

        // First priority: Check if there's a last compiled file
        if (projectData?.lastCompiledFileId) {
          const lastCompiledFile = filesList.find(f => f.id === projectData.lastCompiledFileId);
          if (lastCompiledFile) {
            setCurrentFileId(lastCompiledFile.id);
            setCurrentFileName(lastCompiledFile._name_ || '');
            setCode(lastCompiledFile.content || '');
            return filesList;
          }
        }

        // Second priority: Find main.tex
        const mainFile = filesList.find(f => f._name_ === 'main.tex' && f.type === 'file');
        if (mainFile) {
          setCurrentFileId(mainFile.id);
          setCurrentFileName(mainFile._name_);
          setCode(mainFile.content || '');
          return filesList;
        }

        // Third priority: Find any .tex file
        const anyTexFile = filesList.find(f => f._name_.toLowerCase().endsWith('.tex') && f.type === 'file');
        if (anyTexFile) {
          setCurrentFileId(anyTexFile.id);
          setCurrentFileName(anyTexFile._name_);
          setCode(anyTexFile.content || '');
        }
      }

      return filesList;
    } catch (error) {
      console.error("Error refreshing files:", error);
      showNotification("Failed to load project files", "error");
      return [];
    }
  };

  // Handle code changes
  const handleCodeChange = (value: string) => {
    setCode(value);
    setIsSaved(false);
  };

  // Handle file selection
  const handleFileSelect = async (fileId: string) => {
    if (fileId === currentFileId) return;

    // If there are unsaved changes in the current file, prompt the user
    if (!isSaved && currentFileId) {
      if (window.confirm("You have unsaved changes. Do you want to save them before switching files?")) {
        await handleSave();
      }
    }

    try {
      // Try both collection names for consistency
      let fileData = null;
      let foundDoc = false;

      // Try projectFiles first (camelCase)
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

      // If not found, try project_files (snake_case)
      if (!foundDoc) {
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
        showNotification("File not found", "error");
      }
    } catch (error) {
      console.error("Error loading file:", error);
      showNotification("Failed to load file", "error");
    }
  };

  // Create a new file
  const handleCreateFile = async (parentId: string | null = null) => {
    const fileName = prompt("Enter file name:");
    if (!fileName) return;

    try {
      const fileData = {
        _name_: fileName,
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
  const handleCreateFolder = async (parentId: string | null = null) => {
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

      await refreshFiles();
      showNotification(`Folder "${folderName}" created`);
    } catch (error) {
      console.error("Error creating folder:", error);
      showNotification("Failed to create folder", "error");
    }
  };

  // Delete file or folder
  const handleDeleteItem = async (itemId: string) => {
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

      // Delete the document
      await deleteDoc(doc(db, "projectFiles", itemId));

      await refreshFiles();
      showNotification(`Item deleted`);
    } catch (error) {
      console.error(`Error deleting item:`, error);
      showNotification(`Failed to delete item`, "error");
    }
  };

  // Context menu handlers
  const handleContextMenu = (event: React.MouseEvent, itemId: string) => {
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

  // Handle file upload
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
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
            type: 'file',
            projectId: projectId,
            parentId: null,
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
            parentId: null,
            ownerId: userId,
            downloadURL: downloadURL,
            createdAt: serverTimestamp(),
            lastModified: serverTimestamp()
          });
        }
      }

      showNotification(`${files.length} files uploaded successfully`);
      await refreshFiles();
    } catch (error) {
      console.error("Error uploading files:", error);
      showNotification("Failed to upload files", "error");
    }
  };

  // Helper function to read file as text
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

  // Save current file
  // Updated handleSave function with better error handling and document verification
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
      showNotification(`Failed to save document: ${error.message}`, "error");
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

  // Toggle sidebar visibility
  const toggleSidebar = () => {
    setIsSidebarCollapsed(!isSidebarCollapsed);
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
    // Full-height container with no overflow
    <div className="h-screen flex flex-col overflow-hidden bg-gray-900 text-gray-100" ref={containerRef}>
      {/* Header - fixed height */}
      <header className="px-4 py-2 bg-gray-800 border-b border-gray-700 flex items-center z-10">
        {/* Left section */}
        <div className="flex items-center">
          <button
            className="p-1.5 rounded-md hover:bg-gray-700 mr-2 text-gray-300 focus:outline-none"
            onClick={toggleSidebar}
            title="Toggle Sidebar"
          >
            <Menu className="h-5 w-5" />
          </button>

          <div className="mr-4 flex items-center">
            <button
              onClick={() => router.push("/dashboard")}
              className="text-gray-300 hover:text-white mr-2 flex items-center">
              <ChevronLeft className="h-4 w-4 mr-1" />
              Dashboard
            </button>
            <h1 className="font-medium text-gray-200 truncate max-w-xs">
              {projectData?.title || "Loading..."}
              {!isSaved && <span className="ml-2 text-yellow-500 text-lg">•</span>}
            </h1>
          </div>
        </div>

        {/* Middle section (spacer) */}
        <div className="flex-1"></div>

        {/* Right section */}
        <div className="flex items-center space-x-2">
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

            <div className="hidden sm:flex items-center space-x-2 ml-2">
              <input
                type="checkbox"
                id="autoCompile"
                checked={autoCompile}
                onChange={(e) => setAutoCompile(e.target.checked)}
                className="rounded text-blue-500 focus:ring-blue-500 h-3.5 w-3.5 cursor-pointer"
              />
              <label
                htmlFor="autoCompile"
                className="text-gray-300 text-xs cursor-pointer select-none"
              >
                Auto-compile
              </label>
            </div>
          </div>
        </div>
      </header>

      {/* Main content area - flexible height with NO GAPS */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar - with NO right margin/padding */}
        {!isSidebarCollapsed && (
          <div
            className="h-full flex-shrink-0 bg-gray-800 relative flex flex-col"
            style={{ width: `${sidebarWidth}px` }}
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

            {/* Draggable file tree */}
            <div className="flex-1 overflow-hidden">
              <DraggableFileTree
                files={files}
                activeFileId={currentFileId}
                projectId={projectId}
                userId={userId}
                onFileSelect={handleFileSelect}
                onRefreshFiles={refreshFiles}
              />
            </div>

            {/* Resize handle */}
            <div
              className="absolute right-0 top-0 w-2 h-full cursor-col-resize z-20 bg-transparent"
              onMouseDown={startSidebarResize}
            >
              <div className="absolute right-0 top-0 w-1 h-full bg-gray-700 hover:bg-blue-500 active:bg-blue-600"></div>
            </div>
          </div>
        )}


        {/* Main editor area - Ensure left border is 0 width */}
        <div className="flex-1 overflow-hidden h-full" ref={contentRef}>
          {/* Code-only view - Apply specific styling for CodeMirror to fill vertical space */}
          {viewMode === "code" && !isImageView && (
            <div className="w-full h-full bg-gray-900 overflow-hidden">
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
          )}

          {/* Split view (code + preview) */}
          {viewMode === "split" && !isImageView && (
            <div className="flex w-full h-full">
              {/* Editor */}
              <div
                className="h-full relative"
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
                className="w-2 h-full cursor-col-resize flex items-center justify-center z-10 bg-gray-700"
                onMouseDown={startEditorResize}
              >
                <div className="w-1 h-full bg-gray-700 hover:bg-blue-500 active:bg-blue-600"></div>
              </div>

              {/* Preview - NO left gap */}
              <div
                className="h-full overflow-hidden"
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
            <File className="h-4 w-4 mr-3 text-gray-500" />
            Open
          </button>

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

export default EnhancedLatexEditor;