import React, { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@clerk/nextjs';
import dynamic from 'next/dynamic';
import { authenticateWithFirebase } from '@/lib/firebase-auth';
import { doc, getDoc, updateDoc, serverTimestamp, collection, getDocs, query, where, orderBy, addDoc, deleteDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import CodeMirror from '@uiw/react-codemirror';
import { StreamLanguage } from '@codemirror/language';
import { stex } from '@codemirror/legacy-modes/mode/stex';
import { compileLatex } from '@/services/latexService';
import {
    Home, Menu, Save, Play, Download, Upload,
    Plus, File, Folder, ChevronRight,
    ChevronDown, Edit, Eye, MoreVertical,
    Trash, Copy, X, Search, Layout
} from 'lucide-react';
import Head from 'next/head';

// Import for resizable panels
import { Resizable } from 're-resizable';

// Dynamically import PDF viewer
const LaTeXPdfViewer = dynamic(() => import('@/components/PdfViewer'), {
    ssr: false,
    loading: () => (
        <div className="h-full w-full flex items-center justify-center bg-white">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
        </div>
    ),
});

const ModernLatexEditor = () => {
    const { id } = useParams();
    const router = useRouter();
    const { userId, isLoaded, isSignedIn } = useAuth();

    // State management
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [projectData, setProjectData] = useState(null);
    const [code, setCode] = useState('');
    const [files, setFiles] = useState([]);
    const [isSaved, setIsSaved] = useState(true);
    const [leftPanelWidth, setLeftPanelWidth] = useState(250);
    const [isLeftPanelVisible, setIsLeftPanelVisible] = useState(true);
    const [viewMode, setViewMode] = useState('split');
    const [isCompiling, setIsCompiling] = useState(false);
    const [compilationError, setCompilationError] = useState(null);
    const [pdfData, setPdfData] = useState(null);
    const [currentFileId, setCurrentFileId] = useState(null);
    const [currentFileName, setCurrentFileName] = useState('');
    const [expandedFolders, setExpandedFolders] = useState({});
    const [autoCompile, setAutoCompile] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [filteredFiles, setFilteredFiles] = useState([]);
    const [activeTab, setActiveTab] = useState('files');
    const [outline, setOutline] = useState([]);

    // Refs
    const editorRef = useRef(null);
    const compileTimeoutRef = useRef(null);

    // Initialize and load project data
    useEffect(() => {
        const fetchProjectData = async () => {
            if (!id || !userId) {
                setError("Missing project ID or user ID");
                setLoading(false);
                return;
            }

            try {
                setLoading(true);

                // Authenticate with Firebase
                await authenticateWithFirebase(userId);

                // Get project details
                const projectRef = doc(db, "projects", id);
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
                const filesQuery = query(
                    collection(db, "projectFiles"),
                    where("projectId", "==", id),
                    orderBy("_name_", "asc")
                );

                const filesSnapshot = await getDocs(filesQuery);
                const fetchedFiles = [];
                filesSnapshot.forEach((doc) => {
                    fetchedFiles.push({
                        id: doc.id,
                        ...doc.data()
                    });
                });

                setFiles(fetchedFiles);

                // Find main.tex file to load initially
                const mainFile = fetchedFiles.find(f => f._name_ === 'main.tex' && f.type === 'file');
                if (mainFile) {
                    setCurrentFileId(mainFile.id);
                    setCurrentFileName(mainFile._name_);
                    setCode(mainFile.content || '');
                }

                setLoading(false);
            } catch (error) {
                console.error("Error fetching project data:", error);
                setError(error.message || "An error occurred");
                setLoading(false);
            }
        };

        fetchProjectData();
    }, [id, userId]);

    // Handle auto-compilation with debounce
    useEffect(() => {
        if (autoCompile && !isSaved && currentFileId) {
            if (compileTimeoutRef.current) {
                clearTimeout(compileTimeoutRef.current);
            }

            compileTimeoutRef.current = setTimeout(() => {
                handleCompile();
            }, 2000); // 2 second delay
        }

        return () => {
            if (compileTimeoutRef.current) {
                clearTimeout(compileTimeoutRef.current);
            }
        };
    }, [code, autoCompile, isSaved]);

    // Generate document outline
    useEffect(() => {
        if (!code) return;

        const extractOutline = () => {
            const lines = code.split('\n');
            const outlineItems = [];

            // Regular expressions for different sectional commands
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

            return outlineItems;
        };

        setOutline(extractOutline());
    }, [code]);

    // Filter files based on search query
    useEffect(() => {
        if (!searchQuery.trim()) {
            setFilteredFiles([]);
            return;
        }

        const query = searchQuery.toLowerCase();
        const matches = files.filter(file =>
            file._name_.toLowerCase().includes(query)
        );

        setFilteredFiles(matches);
    }, [searchQuery, files]);

    // Handle editor code changes
    const handleCodeChange = (value) => {
        setCode(value);
        setIsSaved(false);
    };

    // Save current file
    const handleSave = async () => {
        if (!currentFileId) {
            showNotification("No file selected to save", "error");
            return;
        }

        try {
            const fileRef = doc(db, "projectFiles", currentFileId);
            await updateDoc(fileRef, {
                content: code,
                lastModified: serverTimestamp()
            });

            // Update project last modified timestamp
            const projectRef = doc(db, "projects", id);
            await updateDoc(projectRef, {
                lastModified: serverTimestamp()
            });

            setIsSaved(true);
            showNotification("File saved successfully");

            return true;
        } catch (error) {
            console.error("Error saving file:", error);
            showNotification("Failed to save file", "error");
            return false;
        }
    };

    // Compile LaTeX document
    const handleCompile = async () => {
        if (isCompiling) return;

        if (!currentFileId) {
            showNotification("Please select a file to compile", "error");
            return;
        }

        if (!currentFileName.toLowerCase().endsWith('.tex')) {
            showNotification("Only .tex files can be compiled", "error");
            return;
        }

        setIsCompiling(true);
        setCompilationError(null);

        try {
            // Save current changes first
            if (!isSaved) {
                const saveSuccess = await handleSave();
                if (!saveSuccess) {
                    throw new Error("Failed to save before compiling");
                }
            }

            // Compile document using the service
            const result = await compileLatex(code, id);

            if (result.success) {
                setPdfData(result.pdfData);
                setCompilationError(null);
                showNotification("Compilation successful");
            } else {
                setCompilationError(result.error || "Unknown compilation error");
                showNotification("Compilation failed", "error");
            }
        } catch (error) {
            console.error("Error during compilation:", error);
            setCompilationError(error.message || "Unknown error during compilation");
            showNotification(`Compilation failed: ${error.message}`, "error");
        } finally {
            setIsCompiling(false);
        }
    };

    // Handle file selection
    const handleFileSelect = async (fileId) => {
        if (fileId === currentFileId) return;

        // Check for unsaved changes
        if (!isSaved && currentFileId) {
            if (window.confirm("You have unsaved changes. Save before switching files?")) {
                await handleSave();
            }
        }

        try {
            const fileRef = doc(db, "projectFiles", fileId);
            const fileDoc = await getDoc(fileRef);

            if (fileDoc.exists()) {
                const fileData = fileDoc.data();
                setCurrentFileId(fileId);
                setCurrentFileName(fileData._name_ || "Untitled");
                setCode(fileData.content || "");
                setIsSaved(true);
            }
        } catch (error) {
            console.error("Error loading file:", error);
            showNotification("Failed to load file", "error");
        }
    };

    // Toggle folder expansion
    const toggleFolder = (folderId) => {
        setExpandedFolders(prev => ({
            ...prev,
            [folderId]: !prev[folderId]
        }));
    };

    // Create a new file
    const handleCreateFile = async (parentId = null) => {
        const fileName = prompt("Enter file name:");
        if (!fileName) return;

        try {
            const fileData = {
                _name_: fileName,
                type: 'file',
                projectId: id,
                parentId,
                ownerId: userId,
                content: '',
                createdAt: serverTimestamp(),
                lastModified: serverTimestamp(),
                order: 0
            };

            const docRef = await addDoc(collection(db, "projectFiles"), fileData);

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
                type: 'folder',
                projectId: id,
                parentId,
                ownerId: userId,
                createdAt: serverTimestamp(),
                lastModified: serverTimestamp(),
                order: 0
            };

            await addDoc(collection(db, "projectFiles"), folderData);

            showNotification(`Folder "${folderName}" created`);
        } catch (error) {
            console.error("Error creating folder:", error);
            showNotification("Failed to create folder", "error");
        }
    };

    // Delete file or folder
    const handleDeleteItem = async (itemId, itemType) => {
        if (!window.confirm(`Are you sure you want to delete this ${itemType}?`)) {
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

            showNotification(`${itemType} deleted`);
        } catch (error) {
            console.error(`Error deleting ${itemType}:`, error);
            showNotification(`Failed to delete ${itemType}`, "error");
        }
    };

    // Jump to a section in the editor
    const jumpToSection = (lineNumber) => {
        if (editorRef.current) {
            // This is simplified - would need CodeMirror instance API in a real implementation
            console.log(`Jump to line ${lineNumber}`);
        }
    };

    // Helper to show notifications
    const showNotification = (message, type = "success") => {
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

    // Render file tree recursively
    const renderFileTree = (parentId = null, depth = 0) => {
        const childItems = files.filter(file => file.parentId === parentId);

        // Sort: folders first, then files alphabetically
        const sortedItems = [...childItems].sort((a, b) => {
            if (a.type !== b.type) {
                return a.type === 'folder' ? -1 : 1;
            }
            // First sort by order if available
            if (a.order !== b.order) {
                return (a.order || 0) - (b.order || 0);
            }
            // Then sort by name
            return a._name_.localeCompare(b._name_);
        });

        return sortedItems.map(item => {
            const isFolder = item.type === 'folder';
            const isExpanded = expandedFolders[item.id] || false;
            const isActive = currentFileId === item.id;
            const hasChildren = files.some(f => f.parentId === item.id);
            const paddingLeft = depth * 12 + 8;

            return (
                <div key={item.id}>
                    <div
                        className={`flex items-center py-1 pr-2 cursor-pointer hover:bg-gray-200 rounded ${
                            isActive ? 'bg-blue-100 text-blue-700 font-medium' : ''
                        }`}
                        style={{ paddingLeft: `${paddingLeft}px` }}
                        onClick={() => isFolder ? toggleFolder(item.id) : handleFileSelect(item.id)}
                    >
                        {isFolder ? (
                            <>
                                {hasChildren ? (
                                    isExpanded ? (
                                        <ChevronDown className="h-3.5 w-3.5 text-gray-600 mr-1" />
                                    ) : (
                                        <ChevronRight className="h-3.5 w-3.5 text-gray-600 mr-1" />
                                    )
                                ) : (
                                    <span className="w-3.5 mr-1" />
                                )}
                                <Folder className="h-4 w-4 text-yellow-600 mr-1.5" />
                            </>
                        ) : (
                            <>
                                <span className="w-3.5 mr-1" />
                                <File className="h-4 w-4 text-blue-600 mr-1.5" />
                            </>
                        )}
                        <span className="text-sm truncate">{item._name_}</span>
                    </div>

                    {isFolder && isExpanded && renderFileTree(item.id, depth + 1)}
                </div>
            );
        });
    };

    // Render search results
    const renderSearchResults = () => {
        if (!searchQuery || filteredFiles.length === 0) {
            return (
                <div className="p-3 text-sm text-gray-500 text-center">
                    {searchQuery ? "No matches found" : "Type to search files"}
                </div>
            );
        }

        return filteredFiles.map(file => (
            <div
                key={file.id}
                className="flex items-center py-1 px-3 hover:bg-gray-200 cursor-pointer rounded"
                onClick={() => handleFileSelect(file.id)}
            >
                {file.type === 'folder' ? (
                    <Folder className="h-3.5 w-3.5 text-yellow-600 mr-2" />
                ) : (
                    <File className="h-3.5 w-3.5 text-blue-600 mr-2" />
                )}
                <span className="text-sm truncate">{file._name_}</span>
            </div>
        ));
    };

    // Render outline items
    const renderOutline = () => {
        if (outline.length === 0) {
            return (
                <div className="p-3 text-sm text-gray-500 text-center">
                    No document structure found
                </div>
            );
        }

        return outline.map(item => (
            <div
                key={item.id}
                className="flex items-center py-1 cursor-pointer hover:bg-gray-200 rounded"
                style={{ paddingLeft: `${item.level * 12 + 12}px` }}
                onClick={() => jumpToSection(item.lineNumber)}
            >
                <span className="text-sm truncate">{item.title}</span>
            </div>
        ));
    };

    // Loading state
    if (loading) {
        return (
            <div className="h-screen w-full flex items-center justify-center bg-white">
                <div className="flex flex-col items-center">
                    <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-blue-500"></div>
                    <p className="mt-4 text-gray-600">Loading editor...</p>
                </div>
            </div>
        );
    }

    // Error state
    if (error) {
        return (
            <div className="h-screen w-full flex items-center justify-center bg-white p-4">
                <div className="max-w-md p-6 bg-white rounded-lg shadow-lg border border-gray-200 text-center">
                    <div className="text-red-500 text-5xl mb-4">⚠️</div>
                    <h2 className="text-xl font-semibold text-gray-800 mb-2">Error Loading Project</h2>
                    <p className="text-gray-600 mb-4">{error}</p>
                    <button
                        onClick={() => router.push("/dashboard")}
                        className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                    >
                        Return to Dashboard
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="h-screen flex flex-col bg-white">
            <Head>
                <style dangerouslySetInnerHTML={{ __html: `
  /* Custom theme for CodeMirror with maximum visibility */
  .cm-editor-custom-theme {
    background-color: #ffffff !important;
  }
  
  /* Make ALL text dark by default */
  .cm-editor-custom-theme .cm-content,
  .cm-editor-custom-theme .cm-line,
  .cm-editor-custom-theme * {
    color: #000000 !important;
    font-size: 14px;
    font-weight: normal;
  }
  
  /* Basic editor styling */
  .cm-editor-custom-theme .cm-gutters {
    background-color: #f0f0f0 !important;
    color: #555 !important;
  }
  .cm-editor-custom-theme .cm-activeLineGutter {
    background-color: #e0e0e0 !important;
    color: #333 !important;
  }
  
  /* LaTeX commands styling - BOLD and VERY DARK */
  .cm-editor-custom-theme .cm-keyword,
  .cm-editor-custom-theme [class*="cm-keyword"],
  .cm-editor-custom-theme .cm-tag,
  .cm-editor-custom-theme [class*="cm-tag"],
  .cm-editor-custom-theme .cm-builtin,
  .cm-editor-custom-theme [class*="cm-builtin"] {
    color: #0000CC !important; /* Very dark blue */
    font-weight: 700 !important; /* Bold */
  }
  
  /* Override any other styles that might be making text light */
  .CodeMirror-line * {
    color: #000000 !important;
  }
  
  /* Specific LaTeX elements - give them distinctive colors */
  .cm-editor-custom-theme .cm-comment,
  .cm-editor-custom-theme [class*="cm-comment"] {
    color: #008800 !important; /* Dark green */
    font-style: italic;
  }
  
  .cm-editor-custom-theme .cm-string,
  .cm-editor-custom-theme [class*="cm-string"] {
    color: #880000 !important; /* Dark red */
  }
  
  .cm-editor-custom-theme .cm-number,
  .cm-editor-custom-theme [class*="cm-number"] {
    color: #885500 !important; /* Dark orange */
  }
  
  /* Selection styling */
  .cm-editor-custom-theme .cm-selectionBackground {
    background-color: rgba(0, 0, 255, 0.3) !important;
  }
  
  /* Ensure braces and operators are visible */
  .cm-editor-custom-theme .cm-bracket,
  .cm-editor-custom-theme [class*="cm-bracket"],
  .cm-editor-custom-theme .cm-operator,
  .cm-editor-custom-theme [class*="cm-operator"] {
    color: #000000 !important;
    font-weight: bold !important;
  }
  
  /* Line highlight */
  .cm-editor-custom-theme .cm-activeLine {
    background-color: #f0f0ff !important;
  }
  
  /* Force all text in the editor to be visible */
  .CodeMirror * {
    color: #000000 !important;
  }
  
  /* LaTeX specific tokens - MAXIMUM visibility */
  span[class*="cm-tag"],
  span[class*="cm-keyword"],
  span[class*="cm-m-stex"] {
    color: #0000CC !important;
    font-weight: 700 !important;
  }
` }} />
            </Head>
            {/* Top navbar */}
            <div className="border-b bg-gray-100 flex items-center justify-between px-3 py-2 text-sm">
                <div className="flex items-center space-x-2">
                    <button
                        onClick={() => setIsLeftPanelVisible(!isLeftPanelVisible)}
                        className="p-1.5 text-gray-700 hover:bg-gray-200 rounded"
                        title="Toggle sidebar"
                    >
                        <Menu className="h-4 w-4" />
                    </button>

                    <button
                        onClick={() => router.push("/dashboard")}
                        className="p-1.5 text-gray-700 hover:bg-gray-200 rounded"
                        title="Dashboard"
                    >
                        <Home className="h-4 w-4" />
                    </button>

                    <div className="h-4 border-r border-gray-300 mx-1"></div>

                    <div className="font-medium text-gray-800">{projectData?.title || "Untitled Project"}</div>

                    {currentFileName && (
                        <>
                            <span className="text-gray-500">/</span>
                            <span className="text-gray-700">{currentFileName}</span>
                            {!isSaved && <span className="text-red-500 text-sm ml-1 font-bold">*</span>}
                        </>
                    )}
                </div>

                <div className="flex items-center space-x-2">
                    <button
                        onClick={handleSave}
                        disabled={isSaved || !currentFileId}
                        className={`px-2 py-1.5 rounded text-xs flex items-center font-medium ${
                            isSaved || !currentFileId
                                ? 'text-gray-400 bg-gray-200 cursor-not-allowed'
                                : 'bg-blue-600 text-white hover:bg-blue-700'
                        }`}
                        title="Save (Ctrl+S)"
                    >
                        <Save className="h-3.5 w-3.5 mr-1" />
                        <span>Save</span>
                    </button>

                    <button
                        onClick={handleCompile}
                        disabled={isCompiling || !currentFileId}
                        className={`px-2 py-1.5 rounded text-xs flex items-center font-medium ${
                            isCompiling
                                ? 'text-gray-400 bg-gray-200 cursor-wait'
                                : !currentFileId
                                    ? 'text-gray-400 bg-gray-200 cursor-not-allowed'
                                    : 'bg-green-600 text-white hover:bg-green-700'
                        }`}
                        title="Compile"
                    >
                        {isCompiling ? (
                            <>
                                <div className="animate-spin h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full mr-1"></div>
                                <span>Compiling...</span>
                            </>
                        ) : (
                            <>
                                <Play className="h-3.5 w-3.5 mr-1" />
                                <span>Compile</span>
                            </>
                        )}
                    </button>

                    <button
                        onClick={() => {
                            if (pdfData) {
                                const link = document.createElement('a');
                                link.href = pdfData;
                                link.download = `${currentFileName?.replace('.tex', '') || 'document'}.pdf`;
                                document.body.appendChild(link);
                                link.click();
                                document.body.removeChild(link);
                            } else {
                                showNotification("No PDF available. Compile the document first.", "error");
                            }
                        }}
                        disabled={!pdfData}
                        className={`px-2 py-1.5 rounded text-xs flex items-center font-medium ${
                            !pdfData
                                ? 'text-gray-400 bg-gray-200 cursor-not-allowed'
                                : 'bg-gray-700 text-white hover:bg-gray-800'
                        }`}
                        title="Download PDF"
                    >
                        <Download className="h-3.5 w-3.5 mr-1" />
                        <span>Download</span>
                    </button>

                    <div className="h-4 border-r border-gray-300 mx-2"></div>

                    <div className="border border-gray-300 rounded-md overflow-hidden flex">
                        <button
                            onClick={() => setViewMode('code')}
                            className={`p-1.5 flex items-center ${
                                viewMode === 'code' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                            }`}
                            title="Editor only"
                        >
                            <Edit className="h-3.5 w-3.5" />
                        </button>
                        <button
                            onClick={() => setViewMode('split')}
                            className={`p-1.5 flex items-center ${
                                viewMode === 'split' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                            }`}
                            title="Split view"
                        >
                            <Layout className="h-3.5 w-3.5" />
                        </button>
                        <button
                            onClick={() => setViewMode('pdf')}
                            className={`p-1.5 flex items-center ${
                                viewMode === 'pdf' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                            }`}
                            title="PDF only"
                        >
                            <Eye className="h-3.5 w-3.5" />
                        </button>
                    </div>

                    <div className="flex items-center ml-2">
                        <input
                            type="checkbox"
                            id="autoCompile"
                            checked={autoCompile}
                            onChange={(e) => setAutoCompile(e.target.checked)}
                            className="h-3 w-3 mr-1.5"
                        />
                        <label htmlFor="autoCompile" className="text-xs text-gray-700 font-medium">Auto-compile</label>
                    </div>
                </div>
            </div>

            {/* Main editor area with flexible layout */}
            <div className="flex-1 flex overflow-hidden">
                {/* Left sidebar with resizable panel */}
                {isLeftPanelVisible && (
                    <Resizable
                        size={{ width: leftPanelWidth, height: '100%' }}
                        enable={{ right: true }}
                        minWidth={180}
                        maxWidth={500}
                        onResizeStop={(e, direction, ref, d) => {
                            setLeftPanelWidth(leftPanelWidth + d.width);
                        }}
                        className="border-r bg-white shadow-md"
                    >
                        <div className="h-full flex flex-col bg-white">
                            {/* Sidebar tabs */}
                            <div className="flex border-b bg-gray-100">
                            <button
                                    onClick={() => setActiveTab('files')}
                                    className={`flex-1 py-2 text-xs font-medium ${activeTab === 'files'
                                        ? 'text-blue-700 border-b-2 border-blue-600 bg-white'
                                        : 'text-gray-600 hover:text-gray-800'
                                        }`}
                                >
                                    Files
                                </button>
                                <button
                                    onClick={() => setActiveTab('outline')}
                                    className={`flex-1 py-2 text-xs font-medium ${activeTab === 'outline'
                                        ? 'text-blue-700 border-b-2 border-blue-600 bg-white'
                                        : 'text-gray-600 hover:text-gray-800'
                                        }`}
                                >
                                    Outline
                                </button>
                            </div>

                            {/* Search box */}
                            <div className="p-2">
                                <div className="relative">
                                    <input
                                        type="text"
                                        placeholder="Search files..."
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        className="w-full pl-7 pr-7 py-1 text-xs border rounded bg-gray-50 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                    />
                                    <Search className="absolute left-2 top-1.5 h-3.5 w-3.5 text-gray-400" />
                                    {searchQuery && (
                                        <button
                                            onClick={() => setSearchQuery('')}
                                            className="absolute right-2 top-1.5"
                                        >
                                            <X className="h-3.5 w-3.5 text-gray-400 hover:text-gray-600" />
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* Tab content area */}
                            <div className="flex-1 overflow-auto bg-gray-50">
                                <div className="p-1">
                                    {activeTab === 'files' ? (
                                        <div className="p-1">
                                            {searchQuery ? (
                                                renderSearchResults()
                                            ) : (
                                                files.length === 0 ? (
                                                    <div className="p-4 text-center">
                                                        <p className="text-sm text-gray-500 mb-2">No files yet</p>
                                                        <button
                                                            onClick={() => handleCreateFile()}
                                                            className="px-3 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700"
                                                        >
                                                            Create first file
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <div className="file-tree-container text-gray-700">
                                                        {renderFileTree()}
                                                    </div>
                                                )
                                            )}
                                        </div>
                                    ) : (
                                        <div className="p-1 text-gray-700">
                                            {renderOutline()}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Bottom actions bar */}
                            <div className="p-2 border-t bg-gray-100 flex justify-between">
                                <button
                                    onClick={() => handleCreateFile()}
                                    className="text-xs text-gray-700 hover:text-blue-700 font-medium flex items-center"
                                >
                                    <Plus className="h-3.5 w-3.5 mr-1" />
                                    <span>New File</span>
                                </button>

                                <button
                                    onClick={() => handleCreateFolder()}
                                    className="text-xs text-gray-700 hover:text-blue-700 font-medium flex items-center"
                                >
                                    <Folder className="h-3.5 w-3.5 mr-1" />
                                    <span>New Folder</span>
                                </button>
                            </div>
                        </div>
                    </Resizable>
                )}

                {/* Main editor and preview area */}
                <div className="flex-1 flex overflow-hidden">
                    {/* Code editor */}
                    {(viewMode === 'code' || viewMode === 'split') && (
                        <div className={`${viewMode === 'code' ? 'w-full' : 'w-1/2'} flex flex-col overflow-hidden relative border-r`}>
                            <div className="flex-1 overflow-hidden bg-white" ref={editorRef}>
                                <CodeMirror
                                    value={code}
                                    height="100%"
                                    theme="light"
                                    extensions={[StreamLanguage.define(stex)]}
                                    onChange={handleCodeChange}
                                    className="cm-editor-custom-theme" // Add custom class for styling
                                    basicSetup={{
                                        lineNumbers: true,
                                        highlightActiveLineGutter: true,
                                        foldGutter: true,
                                        dropCursor: true,
                                        allowMultipleSelections: true,
                                        indentOnInput: true,
                                        syntaxHighlighting: true,
                                        bracketMatching: true,
                                        closeBrackets: true,
                                        autocompletion: true,
                                        rectangularSelection: true,
                                        highlightActiveLine: true,
                                        highlightSelectionMatches: true,
                                        closeBracketsKeymap: true,
                                        searchKeymap: true,
                                        foldKeymap: true,
                                        completionKeymap: true,
                                        lintKeymap: true,
                                    }}
                                    style={{
                                        fontSize: '14px',
                                        fontFamily: 'monospace'
                                    }}
                                />
                            </div>
                            <div className="border-t py-1 px-3 bg-gray-100 text-xs text-gray-600 font-medium flex items-center justify-between">
                                <div>
                                    {currentFileName} • {code.split('\n').length} lines
                                </div>
                                <div>
                                    {!isSaved && <span className="text-red-500 font-medium">Unsaved changes</span>}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* PDF Preview */}
                    {(viewMode === 'pdf' || viewMode === 'split') && (
                        <div className={`${viewMode === 'pdf' ? 'w-full' : 'w-1/2'} flex flex-col overflow-hidden`}>
                            <div className="flex-1 overflow-auto">
                                {isCompiling ? (
                                    <div className="h-full flex items-center justify-center">
                                        <div className="flex flex-col items-center">
                                            <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-blue-500"></div>
                                            <p className="mt-4 text-gray-600">Compiling LaTeX...</p>
                                        </div>
                                    </div>
                                ) : compilationError ? (
                                    <div className="h-full flex items-center justify-center p-4">
                                        <div className="max-w-lg p-6 bg-red-50 border border-red-200 rounded-lg">
                                            <h3 className="text-lg font-medium text-red-700 mb-2">Compilation Error</h3>
                                            <pre className="text-sm text-red-600 whitespace-pre-wrap font-mono bg-red-50 p-4 rounded border border-red-100 max-h-80 overflow-auto">
                                                {compilationError}
                                            </pre>
                                        </div>
                                    </div>
                                ) : !pdfData ? (
                                    <div className="h-full flex items-center justify-center bg-gray-50">
                                        <div className="text-center max-w-md p-6">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 text-gray-300 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                            </svg>
                                            <p className="text-gray-500 text-lg font-medium mb-2">No PDF Preview</p>
                                            <p className="text-gray-400 mb-4">Click "Compile" to generate a PDF preview of your LaTeX document.</p>
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
                                        <LaTeXPdfViewer
                                            pdfData={pdfData}
                                            isLoading={isCompiling}
                                            error={compilationError}
                                            documentTitle={currentFileName || projectData?.title || "document"}
                                        />
                                    </div>
                                )}
                            </div>

                            {pdfData && (
                                <div className="border-t py-1 px-3 bg-gray-100 text-xs text-gray-600 font-medium flex items-center justify-between">
                                    <div>
                                        PDF Preview
                                    </div>
                                    <button
                                        onClick={() => {
                                            if (pdfData) {
                                                const link = document.createElement('a');
                                                link.href = pdfData;
                                                link.download = `${currentFileName?.replace('.tex', '') || 'document'}.pdf`;
                                                document.body.appendChild(link);
                                                link.click();
                                                document.body.removeChild(link);
                                            }
                                        }}
                                        className="text-blue-600 hover:text-blue-800 flex items-center"
                                    >
                                        <Download className="h-3.5 w-3.5 mr-1" />
                                        <span>Download PDF</span>
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Status bar */}
            <div className="border-t bg-gray-100 py-1 px-3 text-xs text-gray-600 font-medium flex items-center justify-between">
                <div className="flex items-center space-x-4">
                    <span>LaTeX Editor</span>
                    {currentFileId && <span>{isSaved ? 'Saved' : <span className="text-red-500">Unsaved</span>}</span>}
                </div>
                <div className="flex items-center space-x-4">
                    <span>{projectData?.lastModified ? `Last modified: ${new Date(projectData.lastModified.seconds * 1000).toLocaleString()}` : ''}</span>
                </div>
            </div>
        </div>
    );
};

export default ModernLatexEditor;